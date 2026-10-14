/**
 * The leash every process a scratch fleet starts runs under (scratch-fleet.ts
 * preloads it: `bun --preload <this> <entry>`): when the process that
 * started it is gone, however it went (exit, crash, SIGKILL, its workspace
 * torn down around it), the service ends everything under it and then
 * itself.
 *
 * WHY EACH CHILD WATCHES ITS STARTER. On 2026-10-14 a scratch fleet started
 * in a workspace whose items had failed ran on for 12 hours re-parented to
 * launchd, its sessiond starting an `opencode` about once a minute (417 of
 * them), until the Mac's load average was ~700 and its real agent fell off
 * the hub. Nothing else was going to end them: a failed or cancelled item
 * ends its session but leaves its workspace's boundary, and every process in
 * it, running (an archive is what closes it), and on macOS an archive finds
 * a workspace's processes by the `CAWCO_WORKSPACE` in their environment,
 * which the fleet's services are not started with.
 *
 * HOW IT KNOWS. The starter's pid comes in `CAWCO_FLEET_STARTER`; the service
 * was started by it, so its parent is the starter for as long as the starter
 * lives, and becomes another (init, launchd, a pid namespace's init or a
 * subreaper) the moment it dies. `process.ppid` is read live on both systems
 * (measured on Bun 1.4.2: 186, then 1 within 300 ms of a SIGKILL), so a
 * changed parent is the one sign, read every {@link EVERY_MS}, with no pid
 * that could be given to another process meanwhile. One rule for Linux and
 * macOS: Linux's `PR_SET_PDEATHSIG` fires when the parent *thread* that
 * started the child exits, not the process, and delivers a signal to the
 * service alone, whose own handlers (sessiond's drain) leave its children
 * running; the tree still has to be found and ended by something, which is
 * this.
 *
 * WHAT IT ENDS. Every descendant by parentage, and every member of a process
 * group one of them (or the service) leads: sessiond starts each harness
 * detached, leading its own group, so what a harness started stays findable
 * by its group once the harness's own parent is gone. Each is frozen
 * (SIGSTOP) as it is found, so nothing forks past the reading, read again
 * until a reading finds nothing new, then all killed (SIGKILL), the service
 * last.
 */
import { processLineage } from "../packages/core/src/process-identity";

export const STARTER_ENV = "CAWCO_FLEET_STARTER";
const EVERY_MS = 500;
/** Readings after the first, at most, before the kill: each catches what forked before its freeze. */
const MAX_READINGS = 8;

const signal = (pid: number, name: NodeJS.Signals): void => {
  try {
    process.kill(pid, name);
  } catch {
    // gone already
  }
};

/** Everything under `root` now: its descendants and the members of every group it or one of them leads. */
export const treeOf = async (root: number): Promise<Set<number>> => {
  const rows = await processLineage();
  const tree = new Set<number>([root]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const row of rows) {
      if (
        !tree.has(row.pid) &&
        (tree.has(row.ppid) || tree.has(row.pgid)) &&
        row.pid !== 1
      ) {
        tree.add(row.pid);
        grew = true;
      }
    }
  }
  tree.delete(root);
  return tree;
};

let ending = false;
const endAll = async (): Promise<void> => {
  if (ending) {
    return;
  }
  ending = true;
  const frozen = new Set<number>();
  for (let reading = 0; reading <= MAX_READINGS; reading += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each reading follows the last freeze
    const found = [...(await treeOf(process.pid))].filter(
      (pid) => !frozen.has(pid)
    );
    if (found.length === 0) {
      break;
    }
    for (const pid of found) {
      signal(pid, "SIGSTOP");
      frozen.add(pid);
    }
  }
  for (const pid of frozen) {
    signal(pid, "SIGKILL");
  }
  console.error(
    `[scratch-fleet] pid ${process.pid}: its starter is gone (parent now ${process.ppid}), so it ended the ${frozen.size} process(es) under it and itself`
  );
  process.kill(process.pid, "SIGKILL");
};

const starter = Number(process.env[STARTER_ENV]);
if (Number.isInteger(starter) && starter > 0) {
  const watch = () => {
    if (process.ppid !== starter) {
      endAll().catch((error: unknown) => {
        console.error(
          `[scratch-fleet] pid ${process.pid}: its starter is gone, and the processes under it could not be read: ${error instanceof Error ? error.message : String(error)}; it ends itself`
        );
        process.kill(process.pid, "SIGKILL");
      });
    }
  };
  // A starter gone before this ran is seen at once.
  watch();
  setInterval(watch, EVERY_MS).unref();
}
