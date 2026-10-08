/**
 * The keeper's task budget, on Linux. The keeper is a Bun process, and a Bun
 * process that cannot create a thread aborts (`WTF::Thread::create` asserts on
 * a refused `pthread_create`, oven-sh/WebKit#311 closed unmerged; stage 2's
 * joiner keeper died that way with all its children, in
 * `JITWorklist::enqueue` and `FastMallocAlignedMemoryAllocator::tryTake`).
 * Its runtime starts helper threads whenever it likes, so it needs room for
 * them at every moment: the keeper never starts a child that would leave it
 * fewer than {@link TASK_RESERVE} tasks, and each child it starts gets a
 * process limit that much below the keeper's own.
 *
 * Two limits count a task: the user's process limit (`RLIMIT_NPROC`, every
 * thread of every process of the user, checked against the limit of the
 * process that creates the task) and the cgroup's (`pids.max` at the
 * keeper's cgroup and every ancestor). macOS limits threads per process, so
 * children there cannot use up the keeper's; a fork it refuses is refused
 * when the child is spawned.
 */
import { dlopen, FFIType, ptr } from "bun:ffi";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Tasks kept free for the keeper itself. Ours: the keeper runs about 20
 * threads, the runtime starts more on demand (three JIT worklists, two DFG
 * and seven FTL compilers, a GC marker per core, the aligned-memory and
 * scavenger threads), and reading a child's tree spawns `ps`. Sixty-four
 * covers all of them on a machine of 32 cores.
 */
export const TASK_RESERVE = 64;

/**
 * Tasks a new child needs free to start, on top of the keeper's reserve: a
 * child is started only when it can come up whole, not to abort at its own
 * limit a moment later. Ours: a Claude Code CLI reached 17 threads starting
 * (measured, 0.3.289's native binary), and a session starts its MCP servers
 * with it; sixty-four is the CLI and several of those.
 */
export const START_ROOM = 64;

/** How many more tasks fit under the tightest limit, and which limit that is, in words. */
export interface Headroom {
  free: number;
  what: string;
}

const NPROC_LINE = /^Max processes\s+(\S+)\s+(\S+)/m;
const NUMERIC = /^\d+$/;
const REAL_UID = /^Uid:\s+(\d+)/m;
const THREADS = /^Threads:\s+(\d+)/m;
const CGROUP_ROOT = "/sys/fs/cgroup";
/** `RLIMIT_NPROC` in Linux's numbering, on x86-64 and aarch64 alike. */
const RLIMIT_NPROC = 6;
/** `RLIM_INFINITY`: an unlimited `rlim_t`. */
const RLIM_INFINITY = 0xff_ff_ff_ff_ff_ff_ff_ffn;
/** How many `/proc/<pid>/status` files are open at once while counting. */
const READ_BATCH = 64;

/** This process's user process limit, or undefined when it has none (or is root, which it does not bind). */
async function nprocLimit(): Promise<
  { hard: bigint; soft: number } | undefined
> {
  if (process.getuid?.() === 0) {
    return undefined;
  }
  const line = NPROC_LINE.exec(await readFile("/proc/self/limits", "utf8"));
  if (!line || line[1] === "unlimited") {
    return undefined;
  }
  return {
    soft: Number(line[1]),
    hard: line[2] === "unlimited" ? RLIM_INFINITY : BigInt(line[2] ?? 0),
  };
}

/** The tasks of this user that the user's process limit counts, as far as this process can see them. */
async function userTasks(uid: number): Promise<number> {
  const pids = (await readdir("/proc")).filter((name) => NUMERIC.test(name));
  let total = 0;
  for (let at = 0; at < pids.length; at += READ_BATCH) {
    // biome-ignore lint/performance/noAwaitInLoops: batches of reads, so a busy machine does not open a file per process at once
    const statuses = await Promise.all(
      pids
        .slice(at, at + READ_BATCH)
        .map((pid) => readFile(`/proc/${pid}/status`, "utf8").catch(() => ""))
    );
    for (const status of statuses) {
      if (Number(REAL_UID.exec(status)?.[1] ?? -1) === uid) {
        total += Number(THREADS.exec(status)?.[1] ?? 0);
      }
    }
  }
  return total;
}

/** The tightest `pids.max` on the keeper's cgroup and its ancestors (cgroup v2). */
async function cgroupRoom(): Promise<Headroom | undefined> {
  const own = (await readFile("/proc/self/cgroup", "utf8").catch(() => ""))
    .split("\n")
    .find((line) => line.startsWith("0::"));
  if (!own) {
    return undefined;
  }
  let tightest: Headroom | undefined;
  let dir = join(CGROUP_ROOT, own.slice(3));
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: one level of the hierarchy at a time, up to the root
    const [max, current] = await Promise.all([
      readFile(join(dir, "pids.max"), "utf8").catch(() => ""),
      readFile(join(dir, "pids.current"), "utf8").catch(() => ""),
    ]);
    const limit = Number(max.trim());
    if (Number.isFinite(limit) && max.trim() !== "" && current.trim() !== "") {
      const free = limit - Number(current.trim());
      if (!tightest || free < tightest.free) {
        tightest = {
          free,
          what: `its cgroup's task limit (${current.trim()} of ${limit} at ${dir.slice(CGROUP_ROOT.length) || "/"})`,
        };
      }
    }
    if (dir === CGROUP_ROOT || !dir.startsWith(CGROUP_ROOT)) {
      return tightest;
    }
    dir = dirname(dir);
  }
}

/** How many more tasks the keeper and its children can start, under the tightest limit; undefined when nothing limits them. */
export async function taskHeadroom(): Promise<Headroom | undefined> {
  if (process.platform !== "linux") {
    return undefined;
  }
  const rooms: Headroom[] = [];
  const nproc = await nprocLimit();
  if (nproc) {
    const used = await userTasks(process.getuid?.() ?? -1);
    rooms.push({
      free: nproc.soft - used,
      what: `the user's process limit (${used} of ${nproc.soft})`,
    });
  }
  const cgroup = await cgroupRoom();
  if (cgroup) {
    rooms.push(cgroup);
  }
  return rooms.sort((a, b) => a.free - b.free)[0];
}

let libc:
  | ReturnType<
      typeof dlopen<{
        prlimit: {
          args: [FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.ptr];
          returns: FFIType.i32;
        };
      }>
    >
  | undefined;

/**
 * Gives a child it has just started a user process limit {@link TASK_RESERVE}
 * below the keeper's own, so the child and all it starts can never take the
 * room the keeper keeps for its own threads: the kernel checks a new task
 * against the limit of the process creating it. Nothing to do where the
 * keeper has no such limit.
 */
export async function capChildTasks(pid: number): Promise<void> {
  if (process.platform !== "linux") {
    return;
  }
  const nproc = await nprocLimit();
  if (!nproc || nproc.soft <= TASK_RESERVE) {
    return;
  }
  libc ??= dlopen("libc.so.6", {
    prlimit: {
      args: [FFIType.i32, FFIType.i32, FFIType.ptr, FFIType.ptr],
      returns: FFIType.i32,
    },
  });
  const limit = new BigUint64Array([
    BigInt(nproc.soft - TASK_RESERVE),
    nproc.hard,
  ]);
  if (libc.symbols.prlimit(pid, RLIMIT_NPROC, ptr(limit), null) !== 0) {
    console.error(
      `[sessiond] child ${pid}: its process limit could not be lowered; it may use the keeper's reserve`
    );
  }
}
