/**
 * What a project page says of its own views (routes/project/[id], the
 * strip and the head's ⋯): asking Caw for one, a draft's bar, a view that
 * didn't open. For the dashboard and the native app alike.
 *
 * `bun run words` writes these into the app as `Words.Views`
 * (CawCoCore/Words.generated.swift), and `words:check` fails the typecheck
 * chain when that file is stale. So a word is changed here or nowhere.
 */
export const viewsWords = {
  /** The strip's ghost action, and the head's ⋯ on a phone, while Caw can start. */
  ask: "Ask Caw for a view",
  /** The ask's composer, a view in a sentence. */
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
