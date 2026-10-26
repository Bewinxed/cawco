/**
 * An entry run again as this process's child, tied to it both ways, so a
 * script run never outlives the process that started it: the probe kit's
 * fresh process after an install (deps.ts `ensureDeps`) and its spec run
 * with a HOME of its own (probe-kit/run.ts `runOwnHome`).
 *
 * WHY. A delegate's session restarted while its `bun scripts/probe-kit/run.ts`
 * waited on the run it had started again after an install: nothing passed a
 * stop signal on, and nothing told the child its parent had gone, so the
 * run (and the scratch fleet it stood up) went on burning CPU until its pids
 * were killed by hand.
 *
 * PARENT SIDE ({@link runTied}). SIGINT, SIGTERM and SIGHUP are passed on to
 * the child while it runs; once it has ended, a parent that was signalled
 * exits with the child's exit, and one that was not gets it back. The
 * parent keeps no handler of its own beyond that, and none after the child;
 * its handlers are marked as ending the process (stop-signals.ts), so a
 * scratch fleet's own stop handler in the parent leaves the exit to them.
 *
 * CHILD SIDE (this module's load). The parent's pid comes in
 * {@link PARENT_ENV}; while the parent lives it is `process.ppid`, and the
 * moment it dies (a SIGKILL included) the child is re-parented (init, a
 * subreaper), which `process.ppid`, read live, shows (scratch-fleet-leash.ts
 * measured it). Read about once a second on a timer that keeps nothing
 * alive; when it differs the child sends itself SIGTERM, once, so its own
 * teardown (scratch-fleet.ts's stop-signal handlers: its fleets' browsers
 * and folders, its services then ending under their leash) runs as for any
 * caught signal. The variable is taken out of this process's environment as
 * it is read, so nothing this child starts mistakes its grandparent for its
 * parent.
 *
 * This module imports only the signal wall and stop-signals.ts, which import
 * nothing, so it loads in a checkout with no dependencies installed
 * (deps.ts).
 */
import {
  ownPid,
  signal,
  spawnedPid,
} from "../../packages/core/src/signal-wall";
import { END_SIGNALS, type EndSignal, endsTheProcess } from "./stop-signals";

/** The pid of the process that started this one as its tied child. */
const PARENT_ENV = "CAWCO_TIED_PARENT";
const EVERY_MS = 1000;

const parent = Number(process.env[PARENT_ENV]);
delete process.env[PARENT_ENV];
if (Number.isInteger(parent) && parent > 0) {
  const watch = () => {
    if (process.ppid === parent) {
      return;
    }
    clearInterval(timer);
    console.error(
      `… pid ${process.pid}: the process that started it (${parent}) is gone, so it stops`
    );
    signal(ownPid(), "SIGTERM");
  };
  const timer = setInterval(watch, EVERY_MS);
  timer.unref();
  // A parent gone before this ran is seen at once.
  watch();
}

/**
 * Runs `cmd` as this process's child tied to it (stdio inherited, `env` or
 * this process's own), and resolves with its exit code; when a stop signal
 * reached this process meanwhile, exits with that code instead.
 */
export const runTied = async (
  cmd: string[],
  env: Record<string, string | undefined> = process.env
): Promise<number> => {
  const child = Bun.spawn(cmd, {
    env: { ...env, [PARENT_ENV]: String(process.pid) },
    stdio: ["inherit", "inherit", "inherit"],
  });
  const pid = spawnedPid(child);
  let signalled = false;
  const handlers = Object.keys(END_SIGNALS).map((name) => {
    const sig = name as EndSignal;
    // It ends this process once the child has (scratch-fleet.ts waits for it).
    const forward = endsTheProcess(() => {
      signalled = true;
      if (pid !== undefined) {
        signal(pid, sig);
      }
    });
    process.on(sig, forward);
    return [sig, forward] as const;
  });
  // A child ended by a signal exits 128 + its number, as a shell says it.
  const code = await child.exited;
  for (const [sig, forward] of handlers) {
    process.off(sig, forward);
  }
  if (signalled) {
    process.exit(code);
  }
  return code;
};
