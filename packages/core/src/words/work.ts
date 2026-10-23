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
  /** The title of your notice of an item held because its session slept past its limit (hub work-items.ts `blockAsleep`). */
  heldAsleepTitle: (title: string) => `${title} is blocked`,
  /** How long a session with no minutes budget may sleep and be woken. */
  aDay: "a day",
  /** The limit of an item with a minutes budget. */
  budgetMinutes: (minutes: number) => `its budget's ${minutes} minutes`,
  /** Why it is held: since when it sleeps (`since`, "2026-09-15 10:00 UTC") and the limit it slept past. */
  heldAsleep: (since: string, limit: string) =>
    `Its session has been asleep since ${since}, longer than ${limit}, so the hub no longer wakes it by itself. Write to it to carry the work on, or stop it.`,
};
