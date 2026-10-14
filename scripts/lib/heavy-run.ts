/**
 * At most N heavy runs on a machine at once, whoever starts them: a probe
 * kit fleet spec with its dashboard build, a scratch fleet, the stage-2
 * release proof and its builds, an Apple build on its own host. obelisk
 * hung on 2026-10-14 with several leaves' scratch fleets and the stage-2
 * proof running together.
 *
 * N is `CAWCO_HEAVY_RUNS`, else what this machine's cores and memory carry
 * ({@link machineRuns}). Each
 * slot is a file in `heavy-runs/` under the workspaces' shared cache
 * (paths.ts `workspaceCacheDir`), the one tree every workspace's boundary
 * and the host's own shells all read and write; a boundary hides the
 * runtime dir. A run holds a slot by `flock(2)` on its file (flock.ts), from
 * a descriptor opened close-on-exec, so no child keeps it: the kernel frees
 * it when the run's process ends, a SIGKILL included, and a slot left by a
 * dead process is never stale. The holder writes who it is into the file
 * (pid, where, since, command) for a waiting run to name.
 *
 * N can differ between runs (an env set or not, another machine sharing
 * nothing but its own cache), so a run chooses its slot under the `gate`
 * file's lock: it counts every held `slot-<i>` file there, those at i ≥ N
 * from a larger N included, and takes a free slot below N only while fewer
 * than N are held. A smaller N therefore waits out the extra holders; a
 * larger one simply opens more files.
 *
 * A run with no free slot prints one `CAWCO-QUEUE wait heavy: …` line
 * naming every holder (a work item's check stands its clock while it
 * waits, core harness.ts `QUEUE_MARKER`), polls until a slot frees, then
 * prints `CAWCO-QUEUE held heavy`. It waits as long as that takes.
 *
 * One process holds one slot however many of its parts ask (the kit's spec
 * and the scratch fleet under it), and a run's descendants hold none of
 * their own: the holder exports `CAWCO_HEAVY_RUN_HELD`.
 *
 *   const slot = await heavySlot();   … slot.release();
 *
 * A bash script holds one for its own life through heavy-run.sh, which runs
 * this file as `hold <pid> <command…>`: it takes a slot for the shell `pid`
 * (its parent), prints `held` on stdout, and lets the slot go within
 * {@link POLL_MS} once that shell is gone.
 */
import {
  closeSync,
  ftruncateSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeSync,
} from "node:fs";
import { availableParallelism, hostname, totalmem } from "node:os";
import { join } from "node:path";
import { QUEUE_MARKER } from "../../packages/core/src/harness";
import { workspaceCacheDir } from "../../packages/core/src/paths";
import { openLockFile, parentPid, tryLock, unlock } from "./flock";

const RUNS_ENV = "CAWCO_HEAVY_RUNS";
const HELD_ENV = "CAWCO_HEAVY_RUN_HELD";
/**
 * What one heavy run costs, from `bun scripts/probe-kit/run.ts
 * composer-canvas` (a scratch fleet, the dashboard build, Chromium) on
 * obelisk, 2026-10-14, its whole process tree sampled every 0.5 s: peak RSS
 * 4.2 GiB (p50 2.6, p90 2.9), peak 6.8 cores over 0.5 s, 0.77 cores over
 * its 105 s. A slot is 8 GiB, twice the peak RSS (memory is what hangs a
 * host), and 6 cores, the build's peak, about 8x the run's average.
 * obelisk (48 cores, 188 GiB) runs 8; a 10-core 32 GB Mac runs 1.
 */
const SLOT_CORES = 6;
const SLOT_MEMORY = 8 * 1024 ** 3;
/** How often a waiting run tries the slots, and a `hold` looks for its shell. */
const POLL_MS = 200;
const SLOT_FILE = /^slot-(\d+)$/;

/** The heavy runs this machine's cores and memory carry at once, at least 1. */
export const machineRuns = (): number =>
  Math.max(
    1,
    Math.min(
      Math.floor(availableParallelism() / SLOT_CORES),
      Math.floor(totalmem() / SLOT_MEMORY)
    )
  );

/** N: `CAWCO_HEAVY_RUNS` when set, else {@link machineRuns}. */
export const slotCount = (): number => {
  const raw = process.env[RUNS_ENV];
  if (raw === undefined || raw === "") {
    return machineRuns();
  }
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(
      `${RUNS_ENV} is the most heavy runs this machine runs at once, a whole number from 1; it is "${raw}"`
    );
  }
  return count;
};

const slotsDir = (): string => join(workspaceCacheDir(), "heavy-runs");

/** Who holds a slot, as its file says. */
interface Holder {
  command: string;
  pid: number;
  since: number;
  where: string;
}

const describe = (path: string): string => {
  let holder: Holder;
  try {
    holder = JSON.parse(readFileSync(path, "utf8")) as Holder;
  } catch {
    return "a run that has not written its name yet";
  }
  const minutes = Math.round((Date.now() - holder.since) / 60_000);
  return `pid ${holder.pid} in ${holder.where}, ${minutes} min: ${holder.command}`;
};

/** This process's place: a workspace's pids are its boundary's own. */
const where = (): string => {
  const workspace = process.env.CAWCO_WORKSPACE;
  return workspace ? `workspace ${workspace.slice(0, 8)}` : hostname();
};

/**
 * One look at the slots under the gate: the taken slot's descriptor, or the
 * paths of the held ones (none when another run holds the gate this tick).
 */
const tryTake = (
  dir: string,
  count: number,
  holder: Holder
): { fd: number } | { held: string[] } => {
  const gate = openLockFile(join(dir, "gate"), true);
  if (!tryLock(gate)) {
    closeSync(gate);
    return { held: [] };
  }
  try {
    const indices = new Set(Array.from({ length: count }, (_, i) => i));
    for (const name of readdirSync(dir)) {
      const index = SLOT_FILE.exec(name)?.[1];
      if (index !== undefined) {
        indices.add(Number(index));
      }
    }
    const held: string[] = [];
    let free: number | undefined;
    for (const index of [...indices].sort((a, b) => a - b)) {
      const path = join(dir, `slot-${index}`);
      const fd = openLockFile(path, true);
      if (!tryLock(fd)) {
        held.push(path);
        closeSync(fd);
      } else if (free === undefined && index < count) {
        free = fd;
      } else {
        unlock(fd);
      }
    }
    if (free === undefined) {
      return { held };
    }
    if (held.length >= count) {
      unlock(free);
      return { held };
    }
    ftruncateSync(free, 0);
    writeSync(free, JSON.stringify(holder), 0);
    return { fd: free };
  } finally {
    unlock(gate);
  }
};

/**
 * Takes a slot for `holder`, waiting as long as it takes; `gone` ends the
 * wait early (a `hold` whose shell left): no slot then.
 */
const take = async (
  holder: Holder,
  gone: () => boolean = () => false
): Promise<number | undefined> => {
  const count = slotCount();
  const dir = slotsDir();
  mkdirSync(dir, { recursive: true });
  let waited = false;
  for (;;) {
    const look = tryTake(dir, count, holder);
    if ("fd" in look) {
      if (waited) {
        process.stderr.write(`${QUEUE_MARKER} held heavy\n`);
      }
      return look.fd;
    }
    if (!waited && look.held.length > 0) {
      waited = true;
      process.stderr.write(
        `${QUEUE_MARKER} wait heavy: all ${count} heavy-run slots (${RUNS_ENV}, else this machine's cores and memory) are held, by ${look.held.map(describe).join("; ")}\n`
      );
    }
    // biome-ignore lint/performance/noAwaitInLoops: one look at the slots per tick, until one frees
    await Bun.sleep(POLL_MS);
    if (gone()) {
      return;
    }
  }
};

export interface HeavySlot {
  /** Lets this hold go; the slot frees once every hold of the process has. */
  release: () => void;
}

let held: { fd: number | undefined; holds: number } | undefined;
let taking: Promise<number | undefined> | undefined;

/**
 * One of the machine's heavy-run slots for this process, waiting for one
 * when all are held. A process whose ancestor holds one ({@link HELD_ENV})
 * takes none.
 */
export async function heavySlot(): Promise<HeavySlot> {
  if (!held) {
    if (process.env[HELD_ENV] && !taking) {
      held = { fd: undefined, holds: 0 };
    } else {
      taking ??= take({
        pid: process.pid,
        where: where(),
        since: Date.now(),
        command: process.argv.slice(1).join(" "),
      });
      const fd = await taking;
      taking = undefined;
      held ??= { fd, holds: 0 };
      process.env[HELD_ENV] = "1";
    }
  }
  held.holds += 1;
  let released = false;
  return {
    release: () => {
      if (released || !held) {
        return;
      }
      released = true;
      held.holds -= 1;
      if (held.holds > 0) {
        return;
      }
      if (held.fd !== undefined) {
        unlock(held.fd);
        delete process.env[HELD_ENV];
      }
      held = undefined;
    },
  };
}

if (import.meta.main) {
  const [verb, pid, ...command] = process.argv.slice(2);
  if (verb === "count") {
    process.stdout.write(
      `${slotCount()} heavy runs at once (${RUNS_ENV}=${process.env[RUNS_ENV] || "unset"}; this machine: ${availableParallelism()} cores / ${SLOT_CORES}, ${Math.floor(totalmem() / 1024 ** 3)} GiB / ${SLOT_MEMORY / 1024 ** 3} → ${machineRuns()})\n`
    );
    process.exit(0);
  }
  if (verb !== "hold" || !pid || command.length === 0) {
    process.stderr.write(
      "usage: bun scripts/lib/heavy-run.ts count | hold <shell pid> <command…>  (heavy-run.sh runs hold)\n"
    );
    process.exit(2);
  }
  const shell = Number(pid);
  if (parentPid() !== shell) {
    process.stderr.write(
      `heavy-run.ts hold holds a slot for its parent shell, and its parent is pid ${parentPid()}, not ${pid}: run it as heavy-run.sh's heavy_run does\n`
    );
    process.exit(2);
  }
  const gone = () => parentPid() !== shell;
  const fd = await take(
    {
      pid: shell,
      where: where(),
      since: Date.now(),
      command: command.join(" "),
    },
    gone
  );
  if (fd === undefined) {
    process.exit(0);
  }
  process.stdout.write("held\n");
  while (!gone()) {
    // biome-ignore lint/performance/noAwaitInLoops: one look at the shell per tick, for its whole life
    await Bun.sleep(POLL_MS);
  }
  unlock(fd);
  process.exit(0);
}
