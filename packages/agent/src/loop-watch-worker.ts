/**
 * The agent's loop, watched from a thread of its own (loop-watch.ts
 * `startWatchdog`): what the loop's own watch cannot say, because it
 * runs on the loop it watches.
 *
 * The loop's own tick says a stall once it has ended. Two never end and so
 * were never said: on 2026-10-25 obelisk's agent stopped at 12:35 and at
 * 13:48, its last line an ordinary one, nothing more until it was killed 45
 * and 67 minutes later, its thread on the CPU throughout, SIGTERM unheard.
 * The host forbids ptrace (kernel.yama.ptrace_scope 1), so no stack of it
 * could be taken from outside.
 *
 * From here, each second, two things are read: the loop's beat, the time
 * its last tick wrote into memory both threads share, and its answer to a
 * byte this thread sends it over a loopback socket every
 * {@link ECHO_EVERY_MS}. A beat {@link SAY_MS} old is a loop held; a beat
 * that keeps time with no echo for as long is a loop that runs its timers
 * but takes in nothing (no socket, no file, no signal). Either is said at
 * {@link SAY_AT_S} and each minute after, while it lasts, with what the
 * process says of its main thread (Linux `/proc`: on the CPU, and how much
 * of it, or asleep in the kernel and where), the agent's phase, the work in
 * flight and the marked section entered last, as the loop last posted them,
 * and the process's memory. Its end is said once.
 *
 * Where the main thread sleeps names a kernel function, not what the agent
 * asked of it: obelisk's holds of 2026-10-25 slept in `os_acquire_mutex`,
 * which is the NVIDIA driver's (`/proc/kallsyms`: `os_acquire_mutex
 * [nvidia]`), its system-memory pool's shrinker taken by a task in direct
 * reclaim, and "most of the stall is in no marked section". So each look
 * also reads the thread's system call (`/proc/<pid>/task/<tid>/syscall`,
 * which a process may read of itself: proc(5), "the number of the system
 * call being executed, followed by the values of the argument registers
 * … If the thread is blocked, but not in a system call, then the file
 * contains -1"), the file its first argument names when that is a
 * descriptor, and so "outside any system call" for a page fault. A hold
 * shorter than {@link SAY_MS} is said once it ends with what the looks
 * during it read.
 */

import { readFile, readlink } from "node:fs/promises";
import { loopWords } from "@cawco/core/words/loop";
import { BEAT, LEFT, SECTION, type WatchdogMessage } from "./loop-watch-shared";

declare const self: Worker;

/** How often the loop is looked at from here. */
const LOOK_MS = 1000;
/** How often a byte goes to the loop's echo. */
const ECHO_EVERY_MS = 5000;
/** A beat or an echo this late is a stall worth saying. Ours: ten of the loop's own late ticks. */
const SAY_MS = 10_000;
/** When, in seconds of a stall, it is said; then every minute. */
const SAY_AT_S = [10, 30, 60];
/** Linux's clock ticks per second, in which `/proc` counts CPU time (`getconf CLK_TCK`). */
const CLOCK_TICKS = 100;
/** A beat this old at a look is a hold this thread reads the main thread through; one that ends before {@link SAY_MS} is said with what it read. The loop's own watch's `LATE_MS`. */
const NOTE_MS = 1000;

/**
 * The system calls a held main thread is found in, by number, as
 * `/proc/<pid>/task/<tid>/syscall` gives it: x86-64's
 * (arch/x86/entry/syscalls/syscall_64.tbl) and arm64's
 * (include/uapi/asm-generic/unistd.h). Any other is said by its number.
 */
const SYSCALLS: Partial<Record<string, Record<number, string>>> = {
  x64: {
    0: "read",
    1: "write",
    3: "close",
    4: "stat",
    5: "fstat",
    6: "lstat",
    7: "poll",
    9: "mmap",
    10: "mprotect",
    11: "munmap",
    12: "brk",
    16: "ioctl",
    17: "pread64",
    18: "pwrite64",
    19: "readv",
    20: "writev",
    23: "select",
    28: "madvise",
    56: "clone",
    59: "execve",
    61: "wait4",
    62: "kill",
    72: "fcntl",
    73: "flock",
    74: "fsync",
    75: "fdatasync",
    76: "truncate",
    77: "ftruncate",
    82: "rename",
    87: "unlink",
    89: "readlink",
    202: "futex",
    217: "getdents64",
    230: "clock_nanosleep",
    232: "epoll_wait",
    257: "openat",
    262: "newfstatat",
    270: "pselect6",
    271: "ppoll",
    281: "epoll_pwait",
    285: "fallocate",
    332: "statx",
    435: "clone3",
    441: "epoll_pwait2",
  },
  arm64: {
    17: "getcwd",
    22: "epoll_pwait",
    25: "fcntl",
    29: "ioctl",
    32: "flock",
    35: "unlinkat",
    38: "renameat",
    45: "truncate",
    46: "ftruncate",
    47: "fallocate",
    56: "openat",
    57: "close",
    61: "getdents64",
    63: "read",
    64: "write",
    65: "readv",
    66: "writev",
    67: "pread64",
    68: "pwrite64",
    72: "pselect6",
    73: "ppoll",
    78: "readlinkat",
    79: "newfstatat",
    80: "fstat",
    82: "fsync",
    83: "fdatasync",
    98: "futex",
    115: "clock_nanosleep",
    129: "kill",
    214: "brk",
    215: "munmap",
    220: "clone",
    221: "execve",
    222: "mmap",
    226: "mprotect",
    233: "madvise",
    260: "wait4",
    291: "statx",
    435: "clone3",
    441: "epoll_pwait2",
  },
};

let shared: Float64Array | undefined;
const sections = new Map<number, string>();
let phase = "starting";
let flying = "nothing counted";
/** When the byte the loop owes an echo for went (ms epoch); none owed between. */
let owed: number | undefined;

/** The main thread's CPU time (ticks) and when it was read, for its share since. */
let lastCpu: { at: number; ticks: number } | undefined;

/** The system calls whose first argument is a descriptor (a file's, or a directory's for the `*at` ones), so its file is named. */
const FD_FIRST = new Set([
  "read",
  "write",
  "close",
  "fstat",
  "ioctl",
  "pread64",
  "pwrite64",
  "readv",
  "writev",
  "fcntl",
  "flock",
  "fsync",
  "fdatasync",
  "ftruncate",
  "getdents64",
  "fallocate",
  "epoll_wait",
  "epoll_pwait",
  "epoll_pwait2",
  "openat",
  "newfstatat",
  "statx",
  "unlinkat",
  "renameat",
  "readlinkat",
]);

/**
 * The system call the main thread is in, as `/proc` says it, with the file
 * its first argument names when that is one of this process's descriptors;
 * "outside any system call" when blocked in the kernel without one (a page
 * fault); empty while it runs, or when it cannot be read.
 */
const systemCall = async (task: string): Promise<string> => {
  const fields = (await readFile(`${task}/syscall`, "utf8").catch(() => ""))
    .trim()
    .split(" ");
  const [number] = fields;
  if (!number || number === "running") {
    return "";
  }
  if (number === "-1") {
    return loopWords.noSyscall();
  }
  const name = SYSCALLS[process.arch]?.[Number(number)] ?? `#${number}`;
  const first = Number(fields[1]);
  const fd =
    FD_FIRST.has(name) &&
    Number.isSafeInteger(first) &&
    first >= 0 &&
    first < 65_536
      ? await readlink(`/proc/self/fd/${first}`).catch(() => "")
      : "";
  return loopWords.inSyscall(name, fd ? `fd ${first}, ${fd}` : "");
};

/** The main thread as `/proc` says it: its state, its CPU share since the last read, where it sleeps and in which system call. Empty off Linux. */
const mainThread = async (): Promise<string> => {
  if (process.platform !== "linux") {
    return "";
  }
  const task = `/proc/self/task/${process.pid}`;
  try {
    const [stat, wchan, call] = await Promise.all([
      readFile(`${task}/stat`, "utf8"),
      readFile(`${task}/wchan`, "utf8").catch(() => ""),
      systemCall(task),
    ]);
    // After the command's closing paren: state, then 10 fields to utime and stime.
    const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
    const state = fields[0] ?? "?";
    const ticks = Number(fields[11]) + Number(fields[12]);
    const at = Date.now();
    const share =
      lastCpu && at > lastCpu.at
        ? Math.round(
            ((ticks - lastCpu.ticks) /
              CLOCK_TICKS /
              ((at - lastCpu.at) / 1000)) *
              100
          )
        : undefined;
    lastCpu = { at, ticks };
    const where = wchan.trim() && wchan.trim() !== "0" ? wchan.trim() : "";
    if (state === "R") {
      return loopWords.onCpu(share);
    }
    const asleep =
      state === "D"
        ? loopWords.uninterruptible(where)
        : loopWords.asleep(state, where, share);
    return call ? `${asleep}, ${call}` : asleep;
  } catch {
    return "";
  }
};

/** The process's resident memory and swap, as `/proc` says; empty off Linux. */
const memory = async (): Promise<string> => {
  if (process.platform !== "linux") {
    return "";
  }
  const status = await readFile("/proc/self/status", "utf8").catch(() => "");
  const kb = (key: string): number | undefined => {
    const found = new RegExp(`^${key}:\\s+(\\d+) kB`, "mu").exec(status)?.[1];
    return found === undefined ? undefined : Number(found);
  };
  const size = (value: number | undefined) => {
    if (value === undefined) {
      return "?";
    }
    return value >= 1024 * 1024
      ? `${(value / 1024 / 1024).toFixed(1)} GB`
      : `${Math.round(value / 1024)} MB`;
  };
  return `resident ${size(kb("VmRSS"))}, swapped ${size(kb("VmSwap"))}`;
};

/** The marked section entered last, and whether it was left. */
const lastSection = (): string => {
  if (!shared || shared[SECTION] === -1) {
    return "no marked section entered yet";
  }
  const name = sections.get(shared[SECTION] as number) ?? "an unnamed section";
  return loopWords.lastSection(name, shared[LEFT] === 1);
};

/** One stall, as it is said: which kind, since when, and how far its saying has got. */
let stall: { kind: "held" | "deaf"; since: number; said: number } | undefined;

const say = async (kind: "held" | "deaf", ms: number): Promise<void> => {
  const what =
    kind === "held"
      ? loopWords.heldNow(Math.round(ms / 1000))
      : loopWords.deafNow(Math.round(ms / 1000));
  const parts = [
    thread,
    `phase: ${phase}`,
    `in flight: ${flying}`,
    lastSection(),
    await memory(),
  ].filter(Boolean);
  console.warn(`[loop] ${what}; ${parts.join("; ")}`);
};

/** The main thread as the last look read it: read each look, so its CPU share spans one second. */
let thread = "";
/** A hold under way that has not been said: when it began, and what each look during it read of the main thread. */
let noted: { seen: Map<string, number>; since: number } | undefined;

/** A hold that ended before it was said, said once with what the looks during it read. */
const sayNoted = (now: number): void => {
  if (!noted) {
    return;
  }
  if (noted.seen.size === 0) {
    noted = undefined;
    return;
  }
  const looks = [...noted.seen.values()].reduce((sum, n) => sum + n, 0);
  const seen = [...noted.seen]
    .sort((a, b) => b[1] - a[1])
    .map(([what, n]) => `${what} (${n} of ${looks})`)
    .join("; ");
  console.warn(
    `${loopWords.heldSeen(Math.round((now - noted.since) / 1000))}: ${seen}`
  );
  noted = undefined;
};

const look = async (): Promise<void> => {
  if (!shared) {
    return;
  }
  thread = await mainThread();
  const now = Date.now();
  const held = now - (shared[BEAT] as number);
  const deaf = owed === undefined ? 0 : now - owed;
  let kind: "held" | "deaf" | undefined;
  if (held >= SAY_MS) {
    kind = "held";
  } else if (deaf >= SAY_MS) {
    kind = "deaf";
  }
  if (held >= NOTE_MS && !kind) {
    noted ??= { seen: new Map(), since: now - held };
    if (thread) {
      noted.seen.set(thread, (noted.seen.get(thread) ?? 0) + 1);
    }
  } else if (held < NOTE_MS) {
    sayNoted(now);
  }
  if (!kind) {
    if (stall && stall.said > 0) {
      console.warn(
        loopWords.answersAgain(Math.round((now - stall.since) / 1000))
      );
    }
    stall = undefined;
    return;
  }
  // Said while it lasts from here on: not again once it ends.
  noted = undefined;
  const ms = kind === "held" ? held : deaf;
  if (stall?.kind !== kind) {
    stall = { kind, since: now - ms, said: 0 };
  }
  const due =
    SAY_AT_S[stall.said] ??
    (SAY_AT_S.at(-1) as number) + 60 * (stall.said - SAY_AT_S.length + 1);
  if (ms >= due * 1000) {
    stall.said += 1;
    await say(kind, ms);
  }
};

/** Sends the loop's echo a byte every {@link ECHO_EVERY_MS}, one owed at a time. */
const echo = async (port: number): Promise<void> => {
  const socket = await Bun.connect({
    hostname: "127.0.0.1",
    port,
    socket: {
      data() {
        owed = undefined;
      },
      close() {
        owed = undefined;
      },
    },
  });
  setInterval(() => {
    if (owed === undefined) {
      owed = Date.now();
      socket.write("·");
    }
  }, ECHO_EVERY_MS);
};

self.onmessage = (event: MessageEvent<WatchdogMessage>) => {
  const message = event.data;
  switch (message.kind) {
    case "start":
      shared = new Float64Array(message.beat);
      echo(message.port).catch((error: unknown) =>
        console.warn(
          `[loop] the loop's watch from its own thread reads only the loop's beat: its echo did not connect (${error instanceof Error ? error.message : String(error)})`
        )
      );
      setInterval(() => {
        look().catch(() => undefined);
      }, LOOK_MS);
      return;
    case "section":
      sections.set(message.id, message.name);
      return;
    case "state":
      ({ phase, flying } = message);
      return;
    default: {
      const unhandled: never = message;
      throw new Error(`unhandled message: ${JSON.stringify(unhandled)}`);
    }
  }
};
