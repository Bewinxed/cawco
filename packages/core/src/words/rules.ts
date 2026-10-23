/**
 * What Configure › Rules says: its empty states, its starters, a rule's
 * menu and editor. The dashboard renders them from here, and the probe kit
 * finds them by these same words (scripts/probe-words-check.ts refuses a
 * copy).
 */
export const rulesWords = {
  /** No rule yet. */
  nothingWatching: "Nothing is watching yet",
  /** The starters listed under the empty state. */
  starterRules: "Starter rules",
  /** The filter Waiting on an answer, with none waiting. */
  noneWaiting: "No rule is waiting on an answer",
  /** A rule's ⋯. */
  deleteRule: "Delete rule",
  /** The editor's name field. */
  ruleName: "Rule name",
};
