/**
 * A run starts only with room on the disk for what it writes: below
 * disk-room.sh's threshold (10 GB free, `CAWCO_MIN_FREE_GB`) it is refused
 * with one sentence naming the free space and the biggest folders under
 * CawCo's workspace roots, and starts nothing. The runs that write a build
 * root, a scratch fleet or a release checkout check it as they start: a probe
 * kit run's fleet (scripts/scratch-fleet.ts), `bun run typecheck`, the
 * release and its stage-2 builds, a Mac simulator. Added on 2026-10-14
 * (d31b2f5ac): the Mac's Catalyst link died at 120 MB free (`ld: write()
 * failed, errno=28`) instead of refusing up front.
 *
 * Nothing here waits or counts runs: every run starts at once (agent
 * leak-watch.ts tells a session what its runs leak).
 */
import { join } from "node:path";
import { workspaceCacheDir } from "../../packages/core/src/paths";

const DISK_ROOM = join(import.meta.dir, "disk-room.sh");

/**
 * Why `what` must not start for want of disk space on the filesystem the
 * workspaces' cache is on (disk-room.sh's sentence), or nothing.
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
      what,
    ],
    { stdout: "ignore", stderr: "pipe" }
  );
  return checked.exitCode === 0
    ? undefined
    : checked.stderr.toString().trim() ||
        `disk-room.sh exited ${checked.exitCode} with nothing said`;
};

/**
 * Throws disk-room.sh's sentence when the disk has no room for the run
 * `what` names.
 */
export const requireDiskRoom = (what: string): void => {
  const problem = diskProblem(what);
  if (problem) {
    throw new Error(problem);
  }
};

/**
 * A script's first line: with no room on the disk for the run `what` names,
 * it says disk-room.sh's one sentence on stderr and exits 3, starting
 * nothing, as disk-room.sh's own callers do.
 */
export const diskRoomOrExit = (what: string): void => {
  const problem = diskProblem(what);
  if (problem) {
    process.stderr.write(`${problem}\n`);
    process.exit(3);
  }
};
