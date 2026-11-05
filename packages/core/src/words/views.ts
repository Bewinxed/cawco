/**
 * What a project page says of its own views (routes/project/[id], the
 * head's views menu and its ⋯): asking Caw for one, a draft's bar, a view that
 * didn't open. For the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Views`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const viewsWords = {
  /** The head's More, while Caw can start: his panel, asking for a view. */
  ask: "Ask Caw for a view",
  /** What Ask Caw for a view puts in his composer, the caret after it. */
  askWords: "Make a view of ",
  /** The head's views menu, named for the view on screen. */
  pick: (view: string) => `View: ${view}`,
  /** The native app's ask composer, a view in a sentence. */
  placeholder: "A view of what is scheduled this week…",
  /** A draft's bar, over the view, with its two answers. */
  drafted: (view: string) => `Caw drafted the ${view} view`,
  keep: "Keep",
  keeping: "Keeping…",
  discard: "Discard",
  discarding: "Discarding…",
  /** A view whose route didn't load, with why. */
  didntOpen: (reason: string) => `The view didn't open: ${reason}`,
  retry: "Retry",
};
