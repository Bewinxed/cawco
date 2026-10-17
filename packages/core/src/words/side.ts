/**
 * What stands beside a conversation (Projects spec §5.2): the switch
 * between its surfaces while more than one is open, for the dashboard and
 * the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Side`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const sideWords = {
  /** The switch, for a screen reader. */
  label: "Beside the conversation",
  plan: "Plan",
  preview: "Preview",
  task: "Task",
  file: "File",
};
