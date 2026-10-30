/**
 * What Configure › Spend says (routes/config/spend): what reaching a
 * project's budget does where the project sets nothing of its own
 * (project-caps.ts in the hub). For the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Spend`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const spendWords = {
  note: "Each project sets what it may spend in a day or a month on its Usage page, and follows this unless it chooses otherwise.",
  /** The one field's label. */
  onCap: "When one is reached",
  /** The settings could not be read, with the hub's clause. */
  unread: (clause: string) => `Could not read the spend settings — ${clause}.`,
};

/** What reaching a budget can do, in the order the field lists them. */
export const SPEND_ON_CAP = [
  {
    value: "pause",
    label: "Pause dispatch",
    means:
      "No new attempt at the project's tasks starts. Caw still answers you.",
  },
  {
    value: "quiet",
    label: "Stop waking Caw",
    means:
      "Nothing reaches the project's conversation until the cap resets. Attempts still start.",
  },
  {
    value: "both",
    label: "Pause both",
    means: "No new attempt starts, and Caw is not woken.",
  },
] as const;
