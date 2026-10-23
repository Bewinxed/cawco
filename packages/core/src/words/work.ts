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
};
