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
  /**
   * A connected machine whose agent's contract range (core runtime.ts
   * `protocolRange`) does not hold its hub's: the hub sends it no work it
   * cannot carry (`cannot` says which) and offers it the hub's build, which
   * it installs by itself. Said where that work is held or refused: a held
   * start (hub start-holds.ts `startHold`), a delegate's or handoff's inputs
   * (hub work-items.ts `handInto`).
   */
  olderBuild: (machine: string, cannot: string) =>
    `${machine} runs a CawCo build older than its hub's, which cannot ${cannot} until it installs the hub's build`,
  /** {@link updatesWords.olderBuild}'s `cannot` for a session's start. */
  olderBuildStarts: "start sessions for this hub",
  /** {@link updatesWords.olderBuild}'s `cannot` for a delegate's or handoff's inputs. */
  olderBuildInputs: "send or take a session's inputs",
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
  /** `cawco status` on the hub's machine, when the hub does not answer and the last update failed: the update's own words. */
  lastFailed: (error: string) => `the last update failed: ${error}`,
  /** An install stopped before anything changed: the disk the hub's database is on has less free than its copy and a rollback's copy need (cli binary-apply.ts `requireRoom`). */
  noRoomForDatabaseCopy: (version: string, needed: string, free: string) =>
    `${version} was not installed: copying the hub's database needs ${needed} free on its disk, and ${free} is free. Nothing was changed. Free space there, then install again.`,
  /** A rollback put the hub's database back: said after the reason, naming the file that holds what the trial wrote. */
  databasePutBack: (file: string) =>
    `the hub's database is back as it was before the update; what it stored during the trial is in ${file}`,
  /**
   * A rollback whose copy could not be put back (no room for it beside the
   * database, the hub still holding it): said after the reason. The rollback
   * goes on, and the build rolled back to runs on the database the trial
   * left. `stopped`: that database holds migrations `previous` lacks, so its
   * hub does not start on it (core migration-state.ts).
   */
  databaseNotPutBack: (
    database: string,
    why: string,
    copy: string,
    previous: string,
    stopped: boolean
  ) =>
    `the hub's database was not put back (${why}), so ${database} still holds what the hub stored during the trial; the copy from before the update is ${copy}${stopped ? `. The trial migrated it, so ${previous}'s hub doesn't start on it: put that copy in its place to start the hub, which loses what it stored during the trial` : ""}`,
  /** The update helper's log line for an older copy or moved-aside database it removed, once a newer one was written whole and checked. */
  olderCopyRemoved: (file: string, size: string) =>
    `${file} (${size}) was removed: a newer copy replaces it`,
  /** A machine's row once such a trial ended (`unconfirmedVersion`), `version` the build that runs. */
  runningUnconfirmed: (version: string) =>
    `${version} is running, but its health was never confirmed. It is not rolled back, and not installed again by itself.`,
  hubDropped: (hub: string, code: string, what: string) =>
    `the hub at ${hub} refused or dropped the connection (${code}) before it answered ${what}; nothing was done on it, and it is asked again on the next tick`,
};
