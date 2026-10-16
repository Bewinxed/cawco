/**
 * A script's hold on one of the machine's heavy-run slots, through the
 * machine's gate (core heavy-run.ts): a slot is taken only while one is free
 * and the machine has room for the run right now, measured on the machine,
 * and held for the run's whole heavy life. Heavy runs: a probe kit run from
 * its first build, server, browser or fleet until its teardown; a scratch
 * fleet from its setup until it closes; `bun run typecheck`; the stage-2
 * release proof and its builds; an Apple build on its own host. obelisk hung
 * on 2026-10-14 with several leaves' scratch fleets and the stage-2 proof
 * running together, and again on 2026-10-16 with ten probe kit runs whose
 * fleets and browsers held no slot.
 *
 * A run starts only with room on the disk for what it writes: below
 * disk-room.sh's threshold (10 GB free, `CAWCO_MIN_FREE_GB`) it is refused
 * with one sentence naming the free space and the biggest folders under
 * CawCo's workspace roots, before it waits for a slot and again once a wait
 * ends, and holds none.
 *
 * One process holds one slot however many of its parts ask (the kit's run
 * and the scratch fleet under it), and a run's descendants hold none of
 * their own: the holder exports `CAWCO_HEAVY_RUN_HELD`.
 *
 *   const slot = await heavySlot();   … slot.release();
 *
 * A bash script holds one for its own life through heavy-run.sh, which runs
 * this file as `hold <pid> <command…>`: it takes a slot for the shell `pid`
 * (its parent), prints `held` on stdout, and lets the slot go within
 * {@link POLL_MS} once that shell is gone. `count` prints the ceiling and the
 * machine's room now.
 */
import { join } from "node:path";
import { parentPid } from "../../packages/core/src/flock";
import {
  HEAVY_RUN_HELD_ENV,
  type HeavyHolder,
  type HeavyTaken,
  heavyRunsSaid,
  heavyWhere,
  POLL_MS,
  releaseHeavySlot,
  takeHeavySlot,
} from "../../packages/core/src/heavy-run";
import { workspaceCacheDir } from "../../packages/core/src/paths";

const DISK_ROOM = join(import.meta.dir, "disk-room.sh");

/**
 * Why `what` must not start for want of disk space on the filesystem the
 * workspaces' cache is on (disk-room.sh's sentence), or nothing. A run
 * starts only with room for what it writes: a precondition, checked as it
 * asks for a slot and again once a wait for one ends.
 */
const diskProblem = (what: string): string | undefined => {
  const checked = Bun.spawnSync(
    [
      "bash",
      "-c",
      'source "$1" && disk_room "$2" "$3"',
      "disk-room",
      DISK_ROOM,
      workspaceCacheDir(),
      what || `A heavy run (pid ${process.pid})`,
    ],
    { stdout: "ignore", stderr: "pipe" }
  );
  return checked.exitCode === 0
    ? undefined
    : checked.stderr.toString().trim() ||
        `disk-room.sh exited ${checked.exitCode} with nothing said`;
};

/** What {@link take} came to: a slot, a refusal for want of disk space, or nothing (its shell left). */
type Taken = { fd: number } | { refused: string } | undefined;

/**
 * Takes a slot for `holder` through the machine's gate, waiting as long as
 * it takes; `gone` ends the wait early (a `hold` whose shell left): no slot
 * then. Refused, with no slot, when the disk has no room for a run.
 */
const take = async (
  holder: HeavyHolder,
  gone?: () => boolean
): Promise<Taken> => {
  const before = diskProblem(holder.command);
  if (before) {
    return { refused: before };
  }
  const taken: HeavyTaken | undefined = await takeHeavySlot(holder, { gone });
  if (!taken) {
    return;
  }
  if (taken.waited) {
    const after = diskProblem(holder.command);
    if (after) {
      releaseHeavySlot(taken.fd);
      return { refused: after };
    }
  }
  return { fd: taken.fd };
};

export interface HeavySlot {
  /** Lets this hold go; the slot frees once every hold of the process has. */
  release: () => void;
}

let held: { fd: number | undefined; holds: number } | undefined;
let taking: Promise<Taken> | undefined;

/**
 * One of the machine's heavy-run slots for this process, waiting for one
 * while none is free or the machine has no room. A process whose ancestor
 * holds one ({@link HEAVY_RUN_HELD_ENV}) takes none. Throws disk-room.sh's
 * sentence when the disk has no room for a run.
 */
export async function heavySlot(): Promise<HeavySlot> {
  if (!held) {
    if (process.env[HEAVY_RUN_HELD_ENV] && !taking) {
      held = { fd: undefined, holds: 0 };
    } else {
      taking ??= take({
        pid: process.pid,
        where: heavyWhere(),
        command: process.argv.slice(1).join(" "),
      });
      const taken = await taking;
      taking = undefined;
      if (taken && "refused" in taken) {
        throw new Error(taken.refused);
      }
      held ??= { fd: taken?.fd, holds: 0 };
      process.env[HEAVY_RUN_HELD_ENV] = "1";
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
        releaseHeavySlot(held.fd);
        delete process.env[HEAVY_RUN_HELD_ENV];
      }
      held = undefined;
    },
  };
}

if (import.meta.main) {
  const [verb, pid, ...command] = process.argv.slice(2);
  if (verb === "count") {
    process.stdout.write(`${heavyRunsSaid()}\n`);
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
  const taken = await take(
    { pid: shell, where: heavyWhere(), command: command.join(" ") },
    gone
  );
  if (taken === undefined) {
    process.exit(0);
  }
  if ("refused" in taken) {
    process.stderr.write(`${taken.refused}\n`);
    process.stdout.write("refused\n");
    process.exit(3);
  }
  process.stdout.write("held\n");
  while (!gone()) {
    // biome-ignore lint/performance/noAwaitInLoops: one look at the shell per tick, for its whole life
    await Bun.sleep(POLL_MS);
  }
  releaseHeavySlot(taken.fd);
  process.exit(0);
}
