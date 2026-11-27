/**
 * What a workspace's git and its boundary's start say when they were let go
 * for going quiet: no output and no CPU time for the fleet's quiet spell
 * (core bounded.ts `QUIET_MS`, run-captured.ts `runLive`). Read in a
 * workspace's or a place's failure.
 */
export const gitWaitWords = {
  /** A git run that wrote nothing and did no work for the quiet spell. */
  gitQuiet: (command: string, quietFor: number) =>
    `git ${command} went quiet for ${quietFor} s: it wrote nothing and did no work`,
  /** A boundary's or a judge's host that went quiet before it said it was ready; `said` is what it wrote first. */
  startQuiet: (what: string, quietFor: number, said: string) =>
    `${what} went quiet for ${quietFor} s before it started${said}`,
};
