/**
 * A work item's words: what the hub's report and Find say of how it ended.
 * The probe kit finds them by these same words (scripts/probe-words-check.ts
 * refuses a copy).
 */
export const workWords = {
  /** A work item whose commits the hub pushed to `base`. */
  landedOn: (base: string) => `Landed on ${base}`,
  /**
   * A host-scope delegation refused (hub work-items.ts `hostProblem`,
   * `hostFolderProblem`): each `line` names a field and why it cannot go.
   */
  hostRefused: (lines: readonly string[]) =>
    `Host scope refuses ${lines.length === 1 ? "this" : "these"}:\n${lines.map((line) => `- ${line}`).join("\n")}`,
  /** The heading of a report's landing gate section, over its steps' lines. */
  gateHeading: "Landing gate, run by the hub:",
  /**
   * The title of your notice of a blocked item: held because its session
   * slept past its limit (hub work-items.ts `blockAsleep`), or because what
   * its session starts with is missing (`blockIfMissing`).
   */
  blockedTitle: (title: string) => `${title} is blocked`,
  /**
   * What a session is told of each background task a move, a restart or a
   * kill ended with its process (hub server.ts `endedByMoveWords`,
   * `cutTasksWords`).
   */
  interrupted:
    "Each was interrupted, its outcome unknown: it may or may not have finished what it started.",
  /** Why an item is blocked: its delegate type was deleted (hub work-items.ts `blockIfMissing`). */
  missingType: (name: string) =>
    `Its delegate type “${name}” was deleted, so its session isn't started again without it. Put the type back, or stop the item.`,
  /** Why an item is blocked: its machine left the fleet. */
  missingMachine: (name: string) =>
    `Its machine ${name} is no longer in the fleet, so its session can't start again. Add the machine back, or stop the item.`,
  /** Why an item is blocked: the account its session runs on is gone. */
  missingAccount: (name: string) =>
    `The account it runs on (${name}) is gone, so its session isn't started again on another one. Add the account back, or stop the item.`,
  /** How long a session with no minutes budget may sleep and be woken. */
  aDay: "a day",
  /** The limit of an item with a minutes budget. */
  budgetMinutes: (minutes: number) => `its budget's ${minutes} minutes`,
  /** Why it is held: since when it sleeps (`since`, "2026-09-15 10:00 UTC") and the limit it slept past. */
  heldAsleep: (since: string, limit: string) =>
    `Its session has been asleep since ${since}, longer than ${limit}, so the hub no longer wakes it by itself. Write to it to carry the work on, or stop it.`,
  /** Where a retired workspace's commits went (hub work-items.ts `carryNotice`): its carry's folder on its machine. */
  carriedTo: (carry: string) =>
    `the commits it held on no remote were saved to the carry ${carry}`,
  /**
   * The notice to the session that started a workspace's work, as it
   * retires with its commits in a carry (hub work-items.ts `carryNotice`):
   * `ws` its handle, `title` its latest item's.
   */
  carriedNotice: (
    ws: string,
    title: string,
    carry: string,
    machine: string,
    path: string
  ) =>
    `Workspace ${ws} of “${title}” retired: its work lands none, so ${workWords.carriedTo(carry)} on ${machine} (its README says how to take each part back), and its clone ${path} is gone. A handoff or a follow-up to it cuts it again with those commits.`,
  /** That notice's headline. */
  carriedHeadline: (ws: string, carry: string, machine: string) =>
    `Workspace ${ws} retired; its commits are in the carry ${carry} on ${machine}.`,
  /** `stop_delegate`'s word on a stopped item's workspace that holds work (`held`, in words): held, its stopper's to decide. */
  stopHolds: (ws: string, held: string) =>
    `Its workspace ${ws} holds ${held}, so it is held, not retired, once its session ends.`,
  /** The two ways out of a held workspace, as `stop_delegate` names them. */
  holdWays: (ws: string) =>
    `It is yours to decide: continue it (handoff to it, or delegate(..., workspace: "${ws}"): either continues its own session), or discard it (discard_workspace with workspace: "${ws}"), which saves that work to a carry in ~/.cawco/carries on its machine and removes the clone.`,
  /** `stop_delegate`'s word on a stopped item's workspace that holds nothing that is nowhere else. */
  stopRetires: (ws: string) =>
    `Its workspace ${ws} holds nothing that is nowhere else, so it retires once its session ends; a handoff to it cuts it again where it was.`,
  /** `stop_delegate`'s word when what the workspace holds could not be read as it stopped. */
  stopUnread: (ws: string, error: string) =>
    `What its workspace ${ws} holds could not be read now (${error}): if it holds work that is nowhere else it is held as its session ends, and you are told then.`,
  /** The hub's log line for a settle whose close failed (hub work-items.ts `settle`): `reason` its machine's words. */
  notRetired: (reason: string) => `not retired: ${reason}`,
  /** `stop_delegate`'s word on a stopped item whose workspace is gone. */
  stopGone: (ws: string) =>
    `Its workspace ${ws} is gone or archived: nothing is held.`,
  /** What a session a stop is walking hears when it calls finish_item or starts more work (hub tree-stops.ts). */
  stoppingRefused:
    "This session is being stopped: every delegate under it ends first, then it does. Nothing new starts and nothing is finished or landed meanwhile. End your turn.",
  /** `stop_delegate`'s answer: the stop walks `label`'s tree, `under` sessions below it (hub tree-stops.ts). */
  stopAsked: (label: string, under: number) =>
    under === 0
      ? `Stopping your delegate ${label}. Its report comes once its machine confirms its session ended.`
      : `Stopping your delegate ${label} and the ${under === 1 ? "delegate" : `${under} delegates`} under it: each ends before the session that started it, ${label} last. Its report, with how each one ended, comes once its machine confirms every end.`,
  /** The headline of a stopped item's report (hub tree-stops.ts). */
  stoppedHeadline: (title: string, under: number) =>
    under === 0
      ? `${title} was stopped; its session ended.`
      : `${title} was stopped after the ${under === 1 ? "delegate" : `${under} delegates`} under it ended.`,
  /** Who asked a stop, as a stopped item's report says it. */
  stoppedBy: (who: string) => `Stopped by ${who}.`,
  /** The heading over a stopped item's delegates and how each ended. */
  stoppedDelegates: "How each delegate under it ended:",
  /**
   * A work item whose session sat in its provider's retry until its
   * deadline for that (hub provider-retries.ts): the provider's words, the
   * deadline, and when the provider said it would try again, if it said.
   */
  providerRetryEnded: (message: string, deadline: string, next?: string) =>
    `Its provider refused the turn and kept retrying ("${message}"), so the item ended at its deadline for a provider's retry, ${deadline}${next ? `: the provider's next attempt was at ${next}, past it` : ""}. Delegate the work again once the provider answers.`,
  /**
   * A command a crash cut (hub server.ts, agent `cutCommands`): the
   * command, as it was asked, and what it had printed by then.
   */
  commandInterrupted: (command: string, output: string) =>
    `The command \`${command}\` was interrupted when its process went; it had printed ${output.trim() ? `this before it was cut:\n\`\`\`\n${output.trimEnd()}\n\`\`\`` : "nothing yet."}`,
};
