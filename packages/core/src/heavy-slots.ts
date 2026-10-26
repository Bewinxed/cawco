/**
 * The machine's heavy-work slots: a heavy run takes one before it starts,
 * and holds it until it ends. Runs past the machine's slots wait in line, in
 * the order they came, saying who holds every slot. Heavy runs: a work
 * item's merge checks (the hub's gate steps, agent hub-command.ts), a stage
 * clone's install (agent stage-clone.ts), `bun run check` wherever it runs
 * (scripts/check.ts: `golar tsc -b`, Biome, Golar's lint and the house
 * checks), and a probe run (scripts/probe-kit/slot.ts: a dashboard build, a
 * dev or preview server, a browser, a scratch fleet). One pool for all of
 * them: what the machine has room for is one number, whoever asks.
 *
 * WHY. On 2026-10-25 obelisk (48 cores, 188 GB) ran at load 150–190 for
 * hours, memory PSI "full avg300" near 75%, with about 25 delegates each
 * running probe specs at once: the owner's live agent froze for up to 106 s
 * and the hub saw the machine away. Later that day, with probe runs held to
 * their slots, the 15-minute load still reached 154 and the owner's Brave
 * aborted (SIGABRT, 19:16:27): merge checks and delegates' own `bun run
 * check` (`golar tsc --builders 8`, Biome, each check's runner starting up
 * to half the machine's cores of checks at once) all started together.
 *
 * HOW. Each slot is a file `slot-<i>` in {@link HEAVY_SLOTS_DIR}, under the
 * workspaces' shared cache (paths.ts `workspaceCacheDir`), the one tree
 * every workspace's boundary and the host's shells all write (the boundary's
 * caches are writable, workspace-policy.ts `workspaceCaches`). A run holds a
 * slot by `flock(2)` on its file from a close-on-exec descriptor (flock.ts):
 * "the lock is released either by an explicit LOCK_UN operation … or when
 * all such file descriptors have been closed"
 * (https://man7.org/linux/man-pages/man2/flock.2.html), so a run that dies,
 * a SIGKILL included, frees its slot at once. A pid would not do: each
 * workspace has a pid namespace of its own, and a pid written by one names
 * nobody, or someone else, in another. A systemd slice would not either: its
 * `CPUQuota=` caps "how much CPU time the unit shall get at maximum"
 * (https://freedesktop.org/software/systemd/man/latest/systemd.resource-control.html),
 * not how many runs start, a workspace reaches no service manager, and a
 * Mac has none. The holder writes who it is (`who`, pid, since) into the
 * file for the line a waiting run prints.
 *
 * A waiting run holds a ticket, `queue/ticket-<arrival ms>-<nonce>`, locked
 * the same way; a slot goes to it only while fewer runs ahead of it in line
 * wait than slots stand free. A ticket whose holder died is unlocked, and
 * the next look deletes it.
 *
 * One lease covers a run's whole process tree: a process whose ancestor
 * holds a slot ({@link heldAbove}: its environment's {@link HEAVY_SLOT_ENV},
 * or an ancestor's pid in a slot file) takes none of its own, so a merge
 * check's `bun run check --all`, a probe script a spec starts and their
 * scratch fleets count once (two levels each waiting on a slot the other
 * holds would never end).
 */
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { cpus, getPriority, setPriority, totalmem } from "node:os";
import { join } from "node:path";
import { openLockFile, tryLock, unlock } from "./flock";
import { workspaceCacheDir } from "./paths";
import { HOUR_MS } from "./time";
import { z } from "zod";
import { parseRecord } from "./state-file";

/** Where the machine's heavy-work slots and their queue are kept. */
const HEAVY_SLOTS_DIR = join(workspaceCacheDir(), "heavy-slots");

/**
 * Set for every process a lease's holder starts: they run under that lease
 * ("slot 3 of 8, <who>"). The agent sets it in a merge check's environment,
 * which a workspace's executor carries into its boundary (boundary.ts: "The
 * caller's environment").
 */
export const HEAVY_SLOT_ENV = "CAWCO_HEAVY_SLOT";

/**
 * The nice a heavy run and everything it starts run at. Sessions and their
 * commands share sessiond's `children` cgroup, which has no cpu controller
 * of its own (its subtree_control reads "pids"), so inside it the scheduler
 * weighs tasks by nice alone: a nice-10 task weighs 110 against a nice-0
 * task's 1024 (kernel/sched/core.c `sched_prio_to_weight`; "nice levels were
 * changed to be multiplicative",
 * https://docs.kernel.org/scheduler/sched-nice-design.html), so the person's
 * own sessions and apps win the CPU from builds. Its disk reads and writes
 * go in the idle class where the OS has one: Linux's `ionice -c3` ("A
 * program running with idle I/O priority will only get disk time when no
 * other program has asked for disk I/O", ionice(1)), macOS's `taskpolicy -b`
 * (darwin background: throttled CPU and I/O).
 */
export const HEAVY_NICE = 10;

/**
 * Shell lines that put the shell running them, and everything it starts
 * after, at {@link HEAVY_NICE} and the idle I/O class (Linux `ionice`, macOS
 * `taskpolicy`): the agent puts them before a heavy command it runs
 * (hub-command.ts), so they run where the command does, inside a
 * workspace's boundary in the runner's own shell, not in the executor
 * outside it. `$$` is that shell, in its own pid namespace.
 */
export const BACKGROUND_SHELL = `renice -n ${HEAVY_NICE} -p $$ >/dev/null
if command -v ionice >/dev/null 2>&1; then ionice -c3 -p $$; elif command -v taskpolicy >/dev/null 2>&1; then taskpolicy -b -p $$; fi
`;

/**
 * This process and every thread it has at {@link HEAVY_NICE} at least
 * (never raised back: a run started at a lower priority keeps it), and in
 * the idle I/O class where the OS has one: what a holder that takes its own
 * slot does (scripts/check.ts, the probe kit's slot.ts), so what it starts
 * afterwards runs so too. Linux keeps a nice and an I/O priority per thread,
 * and a child takes the forking thread's.
 */
export function runInBackground(): void {
  const tids =
    process.platform === "linux"
      ? readdirSync("/proc/self/task").map(Number)
      : [0];
  for (const tid of tids) {
    try {
      if (getPriority(tid) < HEAVY_NICE) {
        setPriority(tid, HEAVY_NICE);
      }
    } catch {
      // A thread that ended between the listing and the call.
    }
  }
  const io =
    process.platform === "linux"
      ? ["ionice", "-c3", "-p", ...tids.map(String)]
      : ["taskpolicy", "-b", "-p", String(process.pid)];
  if (Bun.which(io[0] as string)) {
    Bun.spawnSync(io, { stdout: "ignore", stderr: "inherit" });
  }
}

/**
 * Cores a slot stands for. Measured on obelisk 2026-10-25, each run's whole
 * process tree sampled every 0.5 s, pinned to 8 cores at nice 19:
 * composer-canvas (a scratch fleet, the dashboard build, Chromium) 84 CPU-s
 * over 51 s, 1.6 cores on average, 4.6 at its peak; `bun run check` cold
 * 301 CPU-s, warm 9. Six cores a slot is 8 slots on obelisk, and a holder's
 * own parallelism is sized to its share ({@link coresPerRun}), so all eight
 * together reach the machine's 48 and no more.
 */
const CORES_PER_SLOT = 6;
/**
 * GiB of memory a slot stands for: a probe run's tree peaked at 2.5 GiB
 * (4.2 in 2026-10-14's reading), a browser may reach the probe kit's
 * `BROWSER_MEMORY_CAP` (6 GiB) before it is ended, and a cold `bun run
 * check` peaked at 9.5 GiB, so 16 leaves a run room for either. On obelisk
 * memory allows 11, so its cores decide.
 */
const GIB_PER_SLOT = 16;
const GIB = 1024 ** 3;

/** The machine's slots: one per {@link CORES_PER_SLOT} cores and per {@link GIB_PER_SLOT} GiB, whichever is fewer, at least one. */
export const machineSlots = (): number =>
  Math.max(
    1,
    Math.min(
      // The machine's cores, never the ones this process may run on
      // (`availableParallelism` reads its affinity: 8 under `taskset -c 0-7`).
      Math.floor(cpus().length / CORES_PER_SLOT),
      Math.floor(totalmem() / GIB / GIB_PER_SLOT)
    )
  );

/** The longest a run waits for a slot before it fails, saying who held them. */
const WAIT_MS = HOUR_MS;
/** How often a waiting run looks again. */
const POLL_MS = 1000;
/** How often a waiting run says again what it waits on, when nothing changed. */
const SAY_AGAIN_MS = 5 * 60_000;
/** A half-made ticket (made, not yet in line) older than this, and unlocked, is a crash's leftover. */
const STALE_NEW_MS = 60_000;

/** Where slots are kept and how many there are: the machine's ({@link machinePlace}), or a spec's own. */
export interface SlotPlace {
  count: number;
  dir: string;
}

export const machinePlace = (): SlotPlace => ({
  dir: HEAVY_SLOTS_DIR,
  count: machineSlots(),
});

/** A held slot: its index, its words for {@link HEAVY_SLOT_ENV}, and its release (the process's end releases it too). */
export interface SlotLease {
  index: number;
  release: () => void;
  /** "slot 3 of 8, bun run check@31ab1484". */
  words: string;
}

export interface SlotOptions {
  /** How often to look again while waiting. */
  pollMs?: number;
  /** Each line of the wait and the take, for a person to read. */
  say?: (line: string) => void;
  /** Ends the wait: {@link takeSlot} throws {@link SlotWaitStopped}. */
  signal?: AbortSignal;
  /**
   * Each change of what the wait waits on, and the same again every
   * {@link SAY_AGAIN_MS}: "8 of 8 held by …; 2 run(s) ahead in line".
   */
  waiting?: (holders: string) => void;
  /** The longest wait. */
  waitMs?: number;
  /** Who the holder is in every waiter's line; `<what>@<workspace or host>` when not given. */
  who?: string;
}

/** A wait its caller ended ({@link SlotOptions.signal}). */
export class SlotWaitStopped extends Error {}

/** Who holds a slot, as its holder wrote it. */
const HolderSchema = z.object({
  /** The pid namespace its pid is in (Linux), so a pid is only matched in its own. */
  ns: z.string().optional(),
  pid: z.number(),
  since: z.number(),
  who: z.string(),
});
type Holder = z.infer<typeof HolderSchema>;

/** This process's pid namespace on Linux (`pid:[4026531836]`); none elsewhere, where pids are the machine's. */
const pidNamespace = (): string | undefined => {
  if (process.platform !== "linux") {
    return;
  }
  try {
    return readlinkSync("/proc/self/ns/pid");
  } catch {
    // No namespace to read: pids are matched as they are.
  }
};

/** The pids above this process, its parent first, up to the namespace's first. */
function ancestors(): number[] {
  const out: number[] = [];
  let pid = process.ppid;
  while (pid > 1 && out.length < 64) {
    out.push(pid);
    let parent: number;
    if (process.platform === "linux") {
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      } catch {
        break;
      }
    } else {
      parent = Number(
        Bun.spawnSync(["ps", "-o", "ppid=", "-p", String(pid)])
          .stdout.toString()
          .trim()
      );
    }
    pid = parent;
  }
  return out;
}

/**
 * The lease this process runs under, in its words, when an ancestor holds
 * one; null when none does. Its environment's {@link HEAVY_SLOT_ENV} first,
 * then `place`'s slot files read for an ancestor's pid in this pid
 * namespace: Bun.spawn without an `env` hands a child the environment its
 * parent started with, not one it set since
 * (https://github.com/oven-sh/bun/issues/40846, open on Bun 1.4.4:
 * "`Bun.spawn` resolve[s] PATH from the startup environ snapshot"), so a
 * child a holder starts that way carries no {@link HEAVY_SLOT_ENV}.
 */
export function heldAbove(place: SlotPlace): string | null {
  const said = process.env[HEAVY_SLOT_ENV];
  if (said) {
    return said;
  }
  mkdirSync(place.dir, { recursive: true });
  const above = new Set(ancestors());
  const ns = pidNamespace();
  for (const { index, holder } of lookAtSlots(place).held) {
    if (holder && holder.ns === ns && above.has(holder.pid)) {
      return `slot ${index + 1} of ${place.count}, ${holder.who}`;
    }
  }
  return null;
}

const where = (): string =>
  process.env.CAWCO_WORKSPACE
    ? process.env.CAWCO_WORKSPACE.slice(0, 8)
    : "host";

const minutes = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
};

const readHolder = (path: string): Holder | null => {
  try {
    return parseRecord(path, readFileSync(path, "utf8"), HolderSchema);
  } catch {
    return null;
  }
};

const slotIndex = (name: string): number =>
  name.startsWith("slot-") ? Number(name.slice(5)) : Number.NaN;

/**
 * Every `slot-<i>` file, with each one held: a slot file this descriptor
 * can lock is free (the lock is let go at once), one it cannot is held, this
 * process's own lease included (flock(2): descriptors from separate opens
 * "are treated independently"). Files past `count` are counted too: a run
 * that reads the machine as having more slots must not push the held past
 * this run's count.
 */
function lookAtSlots(place: SlotPlace): {
  free: number[];
  held: { index: number; holder: Holder | null }[];
} {
  const indexes = new Set<number>();
  for (let i = 0; i < place.count; i += 1) {
    indexes.add(i);
  }
  for (const name of readdirSync(place.dir)) {
    const i = slotIndex(name);
    if (Number.isInteger(i) && i >= 0) {
      indexes.add(i);
    }
  }
  const free: number[] = [];
  const held: { index: number; holder: Holder | null }[] = [];
  for (const index of [...indexes].sort((a, b) => a - b)) {
    const path = join(place.dir, `slot-${index}`);
    const fd = openLockFile(path, index < place.count);
    if (tryLock(fd)) {
      unlock(fd);
      if (index < place.count) {
        free.push(index);
      }
    } else {
      closeSync(fd);
      held.push({ index, holder: readHolder(path) });
    }
  }
  return { free, held };
}

/**
 * The cores each heavy run has now: the machine's cores over the runs that
 * hold a slot of `place` (at least one, the caller's own). What a holder
 * sizes its own parallelism by, so the runs together use the machine's
 * cores and no more (scripts/check.ts: `golar tsc --builders`, the checks
 * run at once).
 */
export function coresPerRun(place: SlotPlace): number {
  mkdirSync(place.dir, { recursive: true });
  const runs = Math.max(1, lookAtSlots(place).held.length);
  return Math.max(1, Math.floor(cpus().length / runs));
}

/** A half-made ticket a crash left (made, never put in line): deleted once it is old and unlocked. */
function sweepHalfMade(path: string): void {
  try {
    if (Date.now() - statSync(path).mtimeMs > STALE_NEW_MS) {
      const fd = openLockFile(path, false);
      if (tryLock(fd)) {
        unlinkSync(path);
      }
      unlock(fd);
    }
  } catch {
    // Gone already.
  }
}

/** Whether the ticket at `path` still has a waiting holder; one whose holder died is deleted. */
function ticketLives(path: string): boolean {
  let fd: number;
  try {
    fd = openLockFile(path, false);
  } catch {
    return false;
  }
  if (!tryLock(fd)) {
    closeSync(fd);
    return true;
  }
  try {
    unlinkSync(path);
  } catch {
    // Another waiter deleted it first.
  }
  unlock(fd);
  return false;
}

/**
 * The tickets in line ahead of `mine` whose holders still wait. A ticket
 * this process can lock belongs to a run that died: it is deleted.
 */
function liveAhead(queue: string, mine: string): string[] {
  const ahead: string[] = [];
  for (const name of readdirSync(queue).sort()) {
    const path = join(queue, name);
    if (name === mine) {
      continue;
    }
    if (!name.startsWith("ticket-")) {
      sweepHalfMade(path);
    } else if (ticketLives(path) && name < mine) {
      ahead.push(name);
    }
  }
  return ahead;
}

/** Writes `text` over `fd`'s file. */
const writeOver = (fd: number, text: string): void => {
  ftruncateSync(fd, 0);
  writeSync(fd, text, 0);
};

/**
 * Takes one of `free` for `who` now, its holder line written: the first
 * still free once tried, or null when every one was taken in between.
 */
function takeFree(
  place: SlotPlace,
  free: number[],
  who: string
): SlotLease | null {
  for (const index of free) {
    const fd = openLockFile(join(place.dir, `slot-${index}`), true);
    if (!tryLock(fd)) {
      closeSync(fd);
      continue;
    }
    writeOver(
      fd,
      JSON.stringify({
        who,
        pid: process.pid,
        ns: pidNamespace(),
        since: Date.now(),
      })
    );
    let holding = true;
    const release = () => {
      if (holding) {
        holding = false;
        process.off("exit", release);
        try {
          ftruncateSync(fd, 0);
        } catch {
          // Its file went with its folder.
        }
        unlock(fd);
      }
    };
    process.on("exit", release);
    return {
      index,
      release,
      words: `slot ${index + 1} of ${place.count}, ${who}`,
    };
  }
  return null;
}

/** Who holds the slots, in a waiting run's words. */
const holdersWords = (held: { holder: Holder | null }[]): string =>
  held
    .map(({ holder }) =>
      holder
        ? `${holder.who} (${minutes(Date.now() - holder.since)})`
        : "a run that has not said who it is"
    )
    .join(", ");

/** Puts a ticket for `who` in `queue`'s line: its name and its locked descriptor. */
function joinLine(queue: string, who: string): { fd: number; name: string } {
  mkdirSync(queue, { recursive: true });
  // Made and locked under a name no look counts, then renamed into line: no
  // other waiter ever sees it unlocked and deletes it.
  const nonce = `${process.pid}-${crypto.randomUUID().slice(0, 8)}`;
  const name = `ticket-${String(Date.now()).padStart(15, "0")}-${nonce}`;
  const making = join(queue, `new-${nonce}`);
  const fd = openLockFile(making, true);
  tryLock(fd);
  writeOver(fd, who);
  renameSync(making, join(queue, name));
  return { fd, name };
}

/** Takes `ticket` out of `queue`'s line. */
function leaveLine(queue: string, ticket: { fd: number; name: string }): void {
  try {
    unlinkSync(join(queue, ticket.name));
  } catch {
    // Already gone.
  }
  unlock(ticket.fd);
}

/** Tells a wait when what it waits on changed, or {@link SAY_AGAIN_MS} after it last told it. */
function teller(
  tell: (holders: string) => void
): (key: string, holders: string) => void {
  let saidKey = "";
  let saidAt = 0;
  return (key, holders) => {
    if (key !== saidKey || Date.now() - saidAt >= SAY_AGAIN_MS) {
      tell(holders);
      saidKey = key;
      saidAt = Date.now();
    }
  };
}

/** Settles after `ms`, or once `signal` is aborted. */
const pause = (ms: number, signal: AbortSignal | undefined): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

/**
 * Takes a slot of `place` for `what`, waiting in line for one at most
 * `waitMs`. Throws when the wait runs out, naming who held every slot, and
 * {@link SlotWaitStopped} once `signal` ends it. The caller asks
 * {@link heldAbove} first: this takes a slot whatever runs above it.
 */
export async function takeSlot(
  place: SlotPlace,
  what: string,
  options: SlotOptions = {}
): Promise<SlotLease> {
  mkdirSync(place.dir, { recursive: true });
  const say = options.say ?? ((line: string) => console.log(line));
  const waitMs = options.waitMs ?? WAIT_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  const { signal } = options;
  const who = options.who ?? `${what}@${where()}`;
  const queue = join(place.dir, "queue");
  const ticket = joinLine(queue, who);
  const began = Date.now();
  const tell = teller((holders) => {
    say(
      `… waiting for a heavy-work slot: ${holders} (${minutes(Date.now() - began)} so far)`
    );
    options.waiting?.(holders);
  });
  try {
    for (;;) {
      if (signal?.aborted) {
        throw new SlotWaitStopped(`${who} stopped waiting for a slot`);
      }
      const ahead = liveAhead(queue, ticket.name);
      const { free, held } = lookAtSlots(place);
      const lease =
        ahead.length < place.count - held.length
          ? takeFree(place, free, who)
          : null;
      if (lease) {
        const waited = Date.now() - began;
        say(
          `… heavy-work slot ${lease.index + 1} of ${place.count} taken by ${who}${waited > pollMs ? ` after waiting ${minutes(waited)}` : ""}`
        );
        return lease;
      }
      const holders = holdersWords(held);
      if (Date.now() - began >= waitMs) {
        throw new Error(
          `no heavy-work slot came free in ${minutes(waitMs)} for ${who}: ${held.length} of ${place.count} held by ${holders}`
        );
      }
      const key = `${held.map(({ holder }) => holder?.who).join(",")}|${ahead.length}`;
      const inLine =
        ahead.length > 0 ? `; ${ahead.length} run(s) ahead in line` : "";
      tell(key, `${held.length} of ${place.count} held by ${holders}${inLine}`);
      await pause(pollMs, signal);
    }
  } finally {
    leaveLine(queue, ticket);
  }
}
