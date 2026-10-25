/**
 * The machine's probe slots: a heavy probe run (a dashboard build, a dev or
 * preview server, a browser, a scratch fleet) takes one before it starts any
 * of them, and holds it until its process ends. Runs past the machine's
 * slots wait in line, in the order they came.
 *
 * WHY. On 2026-10-25 obelisk (48 cores, 188 GB) ran at load 150–190 for
 * hours, memory PSI "full avg300" near 75%, with about 25 delegates each
 * running probe specs at once: the owner's live agent froze for up to 106 s
 * and the hub saw the machine away. quiet.ts only makes a timing leg wait
 * and measure again; it never kept a run from starting.
 *
 * HOW. Each slot is a file `slot-<i>` in {@link PROBE_SLOTS_DIR}, under the
 * workspaces' shared cache (core paths.ts `workspaceCacheDir`), the one tree
 * every workspace's boundary and the host's shells all write (the boundary's
 * caches are writable, core workspace-policy.ts `workspaceCaches`; the
 * scratch fleets' port leases live beside it). A run holds a slot by
 * `flock(2)` on its file from a close-on-exec descriptor (core flock.ts):
 * the kernel frees it when the run ends, a crash or a SIGKILL included, so
 * a dead holder's slot is free at once. A pid would not do: each workspace
 * has a pid namespace of its own, and a pid written by one names nobody, or
 * someone else, in another. The holder writes who it is (`<what>@<where>`,
 * pid, since) into the file for the line a waiting run prints.
 *
 * A waiting run holds a ticket, `queue/ticket-<arrival ms>-<nonce>`, locked
 * the same way; a slot goes to it only while fewer runs ahead of it in line
 * wait than slots stand free. A ticket whose holder died is unlocked, and
 * the next look deletes it.
 *
 * One lease covers a run's whole process tree: a process whose ancestor
 * holds a slot (its environment's {@link SLOT_HELD_ENV}, or an ancestor's
 * pid in a slot file, `heldAbove`) takes none of its own, so an `ownHome`
 * spec's own process, a probe script a spec starts, and their scratch
 * fleets count once (two levels each waiting on a slot the other holds
 * would never end).
 *
 * The holder and every process it starts afterwards run at nice
 * {@link SLOT_NICE}. Sessions and their commands share sessiond's
 * `children` cgroup, which has no cpu controller of its own (its
 * subtree_control reads "pids"), so inside it the scheduler weighs tasks by
 * nice alone: a nice-10 task weighs 110 against a nice-0 task's 1024
 * (kernel/sched/core.c `sched_prio_to_weight`; "nice levels were changed to
 * be multiplicative", https://docs.kernel.org/scheduler/sched-nice-design.html),
 * so the person's own sessions win the CPU from the probes.
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
import { basename, join } from "node:path";
import { openLockFile, tryLock, unlock } from "../../packages/core/src/flock";
import { workspaceCacheDir } from "../../packages/core/src/paths";

/** Where the machine's probe slots and their queue are kept. */
export const PROBE_SLOTS_DIR = join(workspaceCacheDir(), "probe-slots");

/** Set once a run holds a slot: every process it starts runs under that lease. */
export const SLOT_HELD_ENV = "PROBE_SLOT_HELD";

/**
 * Cores a slot stands for. Measured on obelisk 2026-10-25, each run's whole
 * process tree sampled every 0.5 s, pinned to 8 cores at nice 19:
 * composer-canvas (a scratch fleet, the dashboard build, Chromium) 84 CPU-s
 * over 51 s, 1.6 cores on average, 4.6 at its peak; the old gate's reading of
 * the same spec (2026-10-14) peaked at 6.8. Six cores a slot is 8 slots on
 * obelisk: all eight at their peak reach the machine's 48, on average they
 * hold about 13 and leave the rest to CawCo and the person.
 */
const CORES_PER_SLOT = 6;
/**
 * GiB of memory a slot stands for: a run's tree peaked at 2.5 GiB
 * (composer-canvas, above; 4.2 in 2026-10-14's reading), and a browser may
 * reach kit.ts `BROWSER_MEMORY_CAP` before it is ended, so 16 leaves a run
 * room for both. On obelisk memory allows 11, so its cores decide.
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

/** The nice a lease's holder and its children run at. */
export const SLOT_NICE = 10;
/** The longest a run waits for a slot before it fails, saying who held them. */
const WAIT_MS = 60 * 60_000;
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
  dir: PROBE_SLOTS_DIR,
  count: machineSlots(),
});

/** A held slot: its index, and its release (the process's end releases it too). */
export interface SlotLease {
  index: number;
  release: () => void;
}

export interface SlotOptions {
  /** How often to look again while waiting. */
  pollMs?: number;
  /** Where each line goes. */
  say?: (line: string) => void;
  /** The longest wait. */
  waitMs?: number;
}

/** Who holds a slot, as its holder wrote it. */
interface Holder {
  /** The pid namespace its pid is in (Linux), so a pid is only matched in its own. */
  ns?: string;
  pid: number;
  since: number;
  who: string;
}

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
 * The holder of `place`'s slot this process runs under, when one of its
 * ancestors holds one and its environment does not say so
 * ({@link SLOT_HELD_ENV}): the slot files read for an ancestor's pid in
 * this pid namespace. Bun.spawn without an `env` hands a child the
 * environment its parent started with, not one it set since
 * (https://github.com/oven-sh/bun/issues/40846, open on Bun 1.4.4: "`Bun.spawn`
 * resolve[s] PATH from the startup environ snapshot"), so a child a holder
 * starts that way carries no {@link SLOT_HELD_ENV}.
 */
function heldAbove(place: SlotPlace): string | null {
  const above = new Set(ancestors());
  const ns = pidNamespace();
  const { held } = lookAtSlots(place);
  for (const { index, holder } of held) {
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
    return JSON.parse(readFileSync(path, "utf8")) as Holder;
  } catch {
    return null;
  }
};

const slotIndex = (name: string): number =>
  name.startsWith("slot-") ? Number(name.slice(5)) : Number.NaN;

/**
 * Every `slot-<i>` file, with each one held by another run: a slot file
 * this process can lock is free (the lock is let go at once), one it cannot
 * is held. Files past `count` are counted too: a run that reads the machine
 * as having more slots must not push the held past this run's count.
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
 * This process and every thread it has at {@link SLOT_NICE} at least
 * (never raised back: a run started at a lower priority keeps it): Linux
 * keeps a nice per thread, and a child takes the nice of the thread that
 * starts it.
 */
function lowerPriority(): void {
  const tids =
    process.platform === "linux"
      ? readdirSync("/proc/self/task").map(Number)
      : [0];
  for (const tid of tids) {
    try {
      if (getPriority(tid) < SLOT_NICE) {
        setPriority(tid, SLOT_NICE);
      }
    } catch {
      // A thread that ended between the listing and the call.
    }
  }
}

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
    return { index, release };
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

/**
 * What holding `lease` changes for this process: every process it starts
 * runs under it, and at {@link SLOT_NICE}. Says so, with how long it waited.
 */
function holdUnder(
  lease: SlotLease,
  place: SlotPlace,
  who: string,
  waited: number,
  say: (line: string) => void
): void {
  process.env[SLOT_HELD_ENV] =
    `slot ${lease.index + 1} of ${place.count}, ${who}`;
  lowerPriority();
  say(
    `… probe slot ${lease.index + 1} of ${place.count} taken by ${who}${waited > 0 ? ` after waiting ${minutes(waited)}` : ""}; it and what it starts run at nice ${SLOT_NICE} or more`
  );
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

/** Says a waiting line when what it waits on changed, or {@link SAY_AGAIN_MS} after it last said one. */
function teller(
  say: (line: string) => void
): (key: string, line: string) => void {
  let saidKey = "";
  let saidAt = 0;
  return (key, line) => {
    if (key !== saidKey || Date.now() - saidAt >= SAY_AGAIN_MS) {
      say(line);
      saidKey = key;
      saidAt = Date.now();
    }
  };
}

/**
 * Takes a slot of `place` for `what`, waiting in line for one at most
 * `waitMs`; answers null when this process already runs under an
 * ancestor's lease (`heldAbove`). Throws when the wait runs out, naming who held
 * every slot.
 */
export async function takeSlot(
  place: SlotPlace,
  what: string,
  options: SlotOptions = {}
): Promise<SlotLease | null> {
  if (process.env[SLOT_HELD_ENV]) {
    return null;
  }
  mkdirSync(place.dir, { recursive: true });
  const above = heldAbove(place);
  if (above) {
    process.env[SLOT_HELD_ENV] = above;
    return null;
  }
  const say = options.say ?? ((line: string) => console.log(line));
  const waitMs = options.waitMs ?? WAIT_MS;
  const pollMs = options.pollMs ?? POLL_MS;
  const who = `${what}@${where()}`;
  const queue = join(place.dir, "queue");
  const ticket = joinLine(queue, who);
  const began = Date.now();
  const tell = teller(say);
  try {
    for (;;) {
      const ahead = liveAhead(queue, ticket.name);
      const { free, held } = lookAtSlots(place);
      const lease =
        ahead.length < place.count - held.length
          ? takeFree(place, free, who)
          : null;
      if (lease) {
        const waited = Date.now() - began;
        holdUnder(lease, place, who, waited > pollMs ? waited : 0, say);
        return lease;
      }
      const holders = holdersWords(held);
      if (Date.now() - began >= waitMs) {
        throw new Error(
          `no probe slot came free in ${minutes(waitMs)} for ${who}: ${held.length} of ${place.count} held by ${holders}`
        );
      }
      const key = `${held.map(({ holder }) => holder?.who).join(",")}|${ahead.length}`;
      const inLine =
        ahead.length > 0 ? `; ${ahead.length} run(s) ahead in line` : "";
      tell(
        key,
        `… waiting for a probe slot: ${held.length} of ${place.count} held by ${holders}${inLine} (${minutes(Date.now() - began)} so far)`
      );
      // biome-ignore lint/performance/noAwaitInLoops: a waiting run looks again once a poll
      await Bun.sleep(pollMs);
    }
  } finally {
    leaveLine(queue, ticket);
  }
}

/** What this process's run is, in a holder's line: its specs once run.ts names them, else its script. */
let runName = basename(process.argv[1] ?? "probe", ".ts");

/** Names this process's run in its lease's line (run.ts: the specs it runs). */
export const nameProbeRun = (name: string): void => {
  runName = name;
};

let machineLease: Promise<SlotLease | null> | null = null;

/**
 * This process's slot on the machine, taken the first time anything heavy
 * starts and held until it ends. Every later call answers the same lease,
 * and a run whose wait ran out fails each heavy start after it at once.
 */
export const probeSlot = (): Promise<SlotLease | null> => {
  machineLease ??= takeSlot(machinePlace(), runName);
  return machineLease;
};
