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
  /** The update toast's title: the dashboard serves a newer build than the open page (dashboard update-toast.svelte.ts). */
  pageReady: "A new build of CawCo is ready",
  /** The update toast's line: when the page reloads by itself, the away clock in whole minutes. */
  pageUpdatesItself: (minutes: number) =>
    `This page updates by itself once it's in the background or you've been away for ${minutes} min.`,
  /** The update toast's buttons: reload at once, or leave it to the idle reload. */
  updateNow: "Update now",
  updateWhenIdle: "Update when idle",
  /** An Install now the hub refused: the notice's title, and why under a machine's row. */
  notInstalled: (version: string, machine: string) =>
    `CawCo ${version} was not installed on ${machine}`,
  notConnected: (machine: string) =>
    `${machine} is not connected, so nothing was installed. Retry once it is back.`,
  /** A Check for updates refused, under it. */
  noNewBuilds: (why: string) =>
    `No new builds could be looked for: ${why}. Machines keep the build they run; Try again to check.`,
  /*
   * A machine other than the hub's own is to install `version`
   * (`waiting-for-hub`), each by the state's `hubWait` (core binary-updates.ts
   * `hubWaitWords`); it installs by itself once the hub runs a build that
   * speaks it and has confirmed it.
   */
  /** `behind`: the hub does not speak the build's wire protocol yet. */
  waitsForHubToTake: (version: string) =>
    `Waits for its hub to take ${version} first`,
  /** `unanswered`: the hub did not say which protocol it speaks (a hub mid-restart). */
  waitsForHubToAnswer: (version: string) =>
    `Waits for its hub to answer before installing ${version}`,
  /** `trial`: the hub speaks it, and its own machine has not yet confirmed the build it runs. */
  waitsForHubTrial: (version: string) =>
    `Waits for its hub to finish installing ${version}`,
  /** The machine's line in the notice of an install under way, while it waits for its hub. */
  installLineWaitsForHub: (name: string) => `· ${name} · waiting for its hub`,
  /** The agent's log line when its hub refused or dropped the connection (`code`) before it answered `what`: no answer, never a failed attempt. */
  hubDropped: (hub: string, code: string, what: string) =>
    `the hub at ${hub} refused or dropped the connection (${code}) before it answered ${what}; nothing was done on it, and it is asked again on the next tick`,
};
