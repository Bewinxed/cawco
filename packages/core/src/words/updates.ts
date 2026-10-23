/**
 * What Configure › Updates, a machine's row and the update notice in Caw's
 * panel say: a build that is ready, an install refused, a check for new
 * builds refused, and a machine's update waiting on its hub, which is no
 * failure. The dashboard renders them from here, the agent answers an
 * Install now with them, and the probe kit finds them by these same words
 * (scripts/probe-words-check.ts refuses a copy).
 *
 * `bun run words` writes these into the app as `Words.Updates`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const updatesWords = {
  /** The notice's title while a build waits. */
  ready: (version: string) => `CawCo ${version} is ready`,
  /** An Install now the hub refused: the notice's title, and why under a machine's row. */
  notInstalled: (version: string, machine: string) =>
    `CawCo ${version} was not installed on ${machine}`,
  notConnected: (machine: string) =>
    `${machine} is not connected, so nothing was installed. Retry once it is back.`,
  /** A Check for updates refused, under it. */
  noNewBuilds: (why: string) =>
    `No new builds could be looked for: ${why}. Machines keep the build they run; Try again to check.`,
  /**
   * A machine other than the hub's own is to install `version`
   * (`waiting-for-hub`): the hub does not speak its wire protocol yet
   * (`answered`, the state's `hubWait` "behind"), or did not say which it
   * speaks (a hub mid-restart). It installs by itself once the hub runs a
   * build that does.
   */
  waitsForHub: (version: string, answered: boolean) =>
    answered
      ? `Waits for its hub to take ${version} first`
      : `Waits for its hub to answer before installing ${version}`,
  /** The machine's line in the notice of an install under way, while it waits for its hub. */
  installLineWaitsForHub: (name: string) => `· ${name} · waiting for its hub`,
};
