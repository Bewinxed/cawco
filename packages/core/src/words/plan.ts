/**
 * A session's plan, beside its conversation (Projects spec §5.2, "Every
 * session's plan, in a panel"): its ring on the composer and its panel, for
 * the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Plan`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const planWords = {
  /** The ring's word, and the panel's title over steps or a spec. */
  plan: "Plan",
  /** The ring, for a screen reader: how far the plan has got. */
  ringLabel: (done: number, total: number) =>
    total > 0 ? `Plan, ${done} of ${total} done` : "Plan",
  /** The ring's figure. */
  figure: (done: number, total: number) => `${done}/${total}`,
  /** The panel's title when it holds a task's to-dos alone, and their part's heading. */
  todos: "To-dos",
  steps: "Steps",
  spec: "Spec",
  openInCanvas: "Open in canvas",
};
