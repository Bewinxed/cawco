/**
 * What Configure › Rules says: its empty states, its starters, a rule's
 * menu and editor. The dashboard renders them from here.
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
  /** Said once in a session when a rule has fired its ceiling in a row and goes quiet. */
  wentQuiet: (name: string, ceiling: number) =>
    `The rule “${name}” has fired ${ceiling} times in a row in this session, so it stays quiet here until a turn ends without matching it.`,
  /** The editor's name field. */
  ruleName: "Rule name",
};
