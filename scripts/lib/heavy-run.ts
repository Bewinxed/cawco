/**
 * At most N heavy runs on a machine at once, whoever starts them: a probe
 * kit fleet spec with its dashboard build, a scratch fleet, the stage-2
 * release proof and its builds, an Apple build on its own host. obelisk
 * hung on 2026-10-14 with several leaves' scratch fleets and the stage-2
 * proof running together.
 *
 * N is `CAWCO_HEAVY_RUNS` (default 2: one fleet beside one build). Each
 * slot is a file in `heavy-runs/` under the workspaces' shared cache
 * (paths.ts `workspaceCacheDir`), the one tree every workspace's boundary
 * and the host's own shells all read and write; a boundary hides the
 * runtime dir. A run holds a slot by `flock(2)` on its file (flock.ts), from
 * a descriptor opened close-on-exec, so no child keeps it: the kernel frees
 * it when the run's process ends, a SIGKILL included, and a slot left by a
 * dead process is never stale. The holder writes who it is into the file
 * (pid, where, since, command) for a waiting run to name.
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
  readFileSync,
  writeSync,
} from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";
import { QUEUE_MARKER } from "../../packages/core/src/harness";
import { workspaceCacheDir } from "../../packages/core/src/paths";
import { openLockFile, parentPid, tryLock, unlock } from "./flock";

const RUNS_ENV = "CAWCO_HEAVY_RUNS";
const HELD_ENV = "CAWCO_HEAVY_RUN_HELD";
const DEFAULT_RUNS = 2;
/** How often a waiting run tries the slots, and a `hold` looks for its shell. */
const POLL_MS = 200;

const slotCount = (): number => {
  const raw = process.env[RUNS_ENV];
  if (raw === undefined || raw === "") {
    return DEFAULT_RUNS;
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

/** Tries every slot once; the held one's descriptor, or none. */
const tryTake = (paths: string[], holder: Holder): number | undefined => {
  for (const path of paths) {
    const fd = openLockFile(path, true);
    if (tryLock(fd)) {
      ftruncateSync(fd, 0);
      writeSync(fd, JSON.stringify(holder), 0);
      return fd;
    }
    closeSync(fd);
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
  const paths = Array.from({ length: count }, (_, i) => join(dir, `slot-${i}`));
  let waited = false;
  for (;;) {
    const fd = tryTake(paths, holder);
    if (fd !== undefined) {
      if (waited) {
        process.stderr.write(`${QUEUE_MARKER} held heavy\n`);
      }
      return fd;
    }
    if (!waited) {
      waited = true;
      process.stderr.write(
        `${QUEUE_MARKER} wait heavy: all ${count} heavy-run slots (${RUNS_ENV}) are held, by ${paths.map(describe).join("; ")}\n`
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
  if (verb !== "hold" || !pid || command.length === 0) {
    process.stderr.write(
      "usage: bun scripts/lib/heavy-run.ts hold <shell pid> <command…>  (heavy-run.sh runs it)\n"
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
