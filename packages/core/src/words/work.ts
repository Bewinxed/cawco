/**
 * A work item's words: what the hub's report and Find say of how it ended.
 * The probe kit finds them by these same words (scripts/probe-words-check.ts
 * refuses a copy).
 */
export const workWords = {
  /** A work item whose commits the hub pushed to `base`. */
  landedOn: (base: string) => `Landed on ${base}`,
};
