/**
 * How a Linux workspace sandbox ends, for certain: its init first, the pid
 * namespace's process 1, then its outer bwrap. Both the srt host
 * (boundary-host.ts: a guard's restart, its own close) and the agent
 * (boundary.ts `stopBoundary`) end one this way, so this file imports
 * nothing of cawco but the signal wall's sending half
 * (`@cawco/core/signal-wall`, which imports nothing): the host loads none of
 * core's index.
 *
 * The init's death is the namespace's: "If the "init" process of a PID
 * namespace terminates, the kernel terminates all of the processes in the
 * namespace via a SIGKILL signal", and SIGKILL "is forcibly delivered when
 * sent from an ancestor PID namespace" (pid_namespaces(7)). The outer bwrap
 * alone ended the namespace only through `--die-with-parent`, a
 * PR_SET_PDEATHSIG the init sets on itself, which bwrap's maintainers call
 * "a convenience to get helper processes cleaned up automatically, rather
 * than a security mechanism, so it's considered to be OK if there are ways
 * it might not work" (github.com/containers/bubblewrap issue 700).
 */
import { readFileSync } from "node:fs";
import { listedPid, signal } from "@cawco/core/signal-wall";

/** A process's parent, from `/proc/<pid>/stat` (after its name, which may hold `)`); undefined once it is gone. */
export const parentOf = (pid: number): number | undefined => {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
    return Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
  } catch {
    // Gone.
    return undefined;
  }
};

/**
 * The sandbox's init while it is still the one its outer bwrap started:
 * `inner` on record, whose parent is `outer`. Undefined once it is gone, or
 * once the pid names another process, which is never signalled.
 */
export const sandboxInit = (
  sandbox: { readonly inner: number; readonly outer: number },
  parent: (pid: number) => number | undefined = parentOf
): number | undefined =>
  parent(sandbox.inner) === sandbox.outer ? sandbox.inner : undefined;

/**
 * Ends a sandbox with everything in it: SIGKILL to its init
 * ({@link sandboxInit}), then `killOuter`, the outer bwrap's own kill (its
 * handle's, for the host that spawned it; a listed pid's, for the agent).
 * Answers whether the init was there to kill.
 */
export const endSandbox = (
  sandbox: { readonly inner: number; readonly outer: number },
  killOuter: () => void,
  parent: (pid: number) => number | undefined = parentOf
): boolean => {
  const init = sandboxInit(sandbox, parent);
  if (init !== undefined) {
    signal(listedPid(init), "SIGKILL");
  }
  killOuter();
  return init !== undefined;
};
