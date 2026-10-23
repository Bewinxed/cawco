/**
 * What Configure › Updates and its notice in Caw's panel say: a build that
 * is ready, an install refused, a check for new builds refused. The
 * dashboard renders them from here, and the probe kit finds them by these
 * same words (scripts/probe-words-check.ts refuses a copy).
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
};
