/**
 * What the closed-text-column rule must refuse (a closed set held as a
 * `text(...).$type<T>()` label) and what it must let stand (an open string).
 * scripts/lint/golar-lint.ts holds its findings to expected.txt.
 */
const text = (name: string) => ({
  $type: <T>(): { held?: T; name: string } => ({ name }),
});

type Brand = string & { readonly brand: "id" };

export const columns = {
  state: text("state").$type<"open" | "closed">(),
  stopped: text("stopped").$type<"stopped-cap">(),
  id: text("id").$type<Brand>(),
  key: text("key").$type<`project:${string}`>(),
  word: text("word").$type<string>(),
};
