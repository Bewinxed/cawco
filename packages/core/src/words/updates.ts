/**
 * What Configure › Updates, a machine's row and the update notice in Caw's
 * panel say: a build that is ready, an install refused, a check for new
 * builds refused, and a machine's update waiting on its hub, which is no
 * failure. The dashboard renders them from here, the agent answers an
 * Install now with them.
 *
 * `bun run words` writes these into the app as `Words.Updates`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const updatesWords = {
  /** The agent's restart route asked for a fence longer than `minutes` (agent mcp-oauth.ts): refused, never shortened. */
  fenceTooLong: (minutes: number) =>
    `A restart fence stands at most ${minutes} minutes; ask for no more.`,
  /** The update policy reset, refused by the hub: what came of it (`hubRefusal`). */
  policyNotResetThen: "so the update policy was not reset. Try again.",
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
  /** A step of an install (a service manager call, a build's `binary-units`) given its bound, and stopped past it. */
  didNotEnd: (what: string, seconds: number) =>
    `${what} did not end within ${seconds} s, so it was stopped`,
  /** A rollback only the hub's silence decided (core binary-updates.ts `HUB_SILENT_TRIALS`): what comes of it, after the reason. */
  triedAgainOnceHubAnswers: (version: string) =>
    `the hub didn't answer, so ${version} is installed again once it does`,
  /** A rollback on the hub's silence after this machine slept through part of the trial (core binary-updates.ts `RollbackCause` `slept`): no try of the build, so none is counted. */
  sleptThroughTrial: (version: string, minutes: number) =>
    `this computer slept for ${minutes} min during the trial and the hub didn't answer after it woke, which doesn't count against ${version}; it's installed again once the hub answers`,
  /** What still runs from a build an attempt waits for (agent binary-update.ts `runsFrom`), in its log line. */
  runsFromAgent: "this agent, which runs it",
  runsFromCurrentKeeper: "its session keeper, the machine's current one",
  runsFromLinkedKeeper: "its session keeper, which the keeper link names",
  runsFromRetiringKeeper: "its retiring session keeper",
  /** The same, once `tries` trials in a row ended so: the build is failed for good. */
  hubSilentTooOften: (version: string, tries: number) =>
    `the hub didn't answer through ${tries} tries of ${version}, so it isn't installed again by itself`,
  /** An update's trial whose resumed deciders each failed: the trial is ended, the machine left on the build it runs. */
  trialUndecided: (version: string, tries: number, why: string) =>
    `${version}'s health could not be checked after ${tries} tries: ${why}.`,
  /** A machine's row once such a trial ended (`unconfirmedVersion`), `version` the build that runs. */
  runningUnconfirmed: (version: string) =>
    `${version} is running, but its health was never confirmed. It is not rolled back, and not installed again by itself.`,
  hubDropped: (hub: string, code: string, what: string) =>
    `the hub at ${hub} refused or dropped the connection (${code}) before it answered ${what}; nothing was done on it, and it is asked again on the next tick`,
};
