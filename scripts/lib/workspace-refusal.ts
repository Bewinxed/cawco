/**
 * What a CawCo workspace's boundary denies that a probe may need, and the
 * one refusal a probe makes for it before it starts anything: a probe run
 * in a workspace otherwise waits out a slot and a build, then fails on a
 * reason its output hides ("the question card on screen: not within 120s").
 *
 *   refuseInWorkspace("probe-sealed-secrets.ts", ["pty"]);
 *
 * Each need is named with the error that shows the boundary denying it,
 * each measured from a workspace on the Mac (2026-10-15).
 */

/** What the boundary denies, in the words the refusal prints. */
const DENIED = {
  /** Python's pty.fork, as a probe types at a CLI's hidden prompt. */
  pty: 'a pseudo-terminal (Python\'s pty.fork: "OSError: out of pty devices")',
  /** A scratch fleet's delegate: the agent links its TMPDIR under /private/tmp/cawco-<uid>. */
  delegate:
    'a scratch fleet\'s delegate (its TMPDIR link under /private/tmp/cawco-<uid>: "EPERM: operation not permitted, symlink …")',
} as const;

export type Denied = keyof typeof DENIED;

/** Why `probe` cannot run in this process's CawCo workspace, or nothing outside one or when it needs nothing denied. */
export const workspaceRefusal = (
  probe: string,
  needs: Denied[]
): string | undefined => {
  if (!process.env.CAWCO_WORKSPACE || needs.length === 0) {
    return;
  }
  return `${probe} needs ${needs.map((need) => DENIED[need]).join(", and ")}, which a CawCo workspace's boundary denies. Run it from the orchestrator's shell on the Mac, or a person's.`;
};

/** A standalone probe's refusal: exits 2 with workspaceRefusal's sentence in a workspace. */
export const refuseInWorkspace = (probe: string, needs: Denied[]): void => {
  const why = workspaceRefusal(probe, needs);
  if (why) {
    console.error(why);
    process.exit(2);
  }
};
