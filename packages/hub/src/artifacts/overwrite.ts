/**
 * An agent's change never replaces an answer of the person's it has not
 * had. A page's `state` holds his picks, notes and values by choice id;
 * the agent writes the same entries (`artifact_update`'s JSON Patch), and a
 * held next version's doc merges into the artifact's when the parent opens
 * it. Either could put the agent's entry over his, and with the session's
 * read stamped after it, no one would hear he had answered.
 *
 * Optimistic concurrency, over what the hub already keeps: the doc's
 * change log by seq and author (db `changes`) against how far the writer
 * had the page (needs.ts `heardSeq`, `unheardKeys`). A replace of an
 * entry he changed after that is refused, unless the patch's own RFC 6902
 * `test` op on that entry passed against his answer as it stands, which
 * shows the agent had it.
 */
import type { ChoiceEntry } from "@cawco/core/choices";
import type { Operation } from "rfc6902";

/** The choice id a JSON Pointer (RFC 6901) names first; null for the whole state. */
const choiceOf = (path: string): string | null => {
  if (path === "") {
    return null;
  }
  const [first = ""] = path.slice(1).split("/");
  return first.replaceAll("~1", "/").replaceAll("~0", "~");
};

/** The choice ids a patch's `test` ops check (all of `before`'s for a test of the whole state); applied all or none, each passed when the patch applies. */
export const testedKeys = (
  patch: readonly Operation[],
  before: Readonly<Record<string, unknown>>
): Set<string> =>
  new Set(
    patch.flatMap((op) => {
      if (op.op !== "test") {
        return [];
      }
      const key = choiceOf(op.path);
      return key === null ? Object.keys(before) : [key];
    })
  );

const same = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * The person's answers a change by the agent from `before` to `after`
 * would replace or remove, though the agent has not had them: each a key
 * he changed after the agent last had the page (`unheard`), his entry
 * standing now (`standing`, the artifact's own state; for a held next
 * version, the opened one's). One the patch's own `test` checked
 * (`tested`) is had, when `before`, what the test ran on, holds his
 * answer as it stands.
 */
export const answersReplaced = (change: {
  after: Readonly<Record<string, unknown>>;
  before: Readonly<Record<string, unknown>>;
  standing: Readonly<Record<string, ChoiceEntry>>;
  tested: ReadonlySet<string>;
  unheard: ReadonlySet<string>;
}): string[] =>
  [...change.unheard].filter(
    (key) =>
      key in change.standing &&
      !same(change.after[key], change.before[key]) &&
      !(
        change.tested.has(key) && same(change.before[key], change.standing[key])
      )
  );

/**
 * What a held next version's merge into its artifact must leave as he
 * wrote it: each of his answers since the fork (`since`, keys he changed
 * after it) whose entry the merge changed (`before` his state, `merged`
 * the state after), by key, to write back.
 */
export const answersKept = (
  before: Readonly<Record<string, ChoiceEntry>>,
  merged: Readonly<Record<string, unknown>>,
  since: ReadonlySet<string>
): Record<string, ChoiceEntry> =>
  Object.fromEntries(
    [...since].flatMap((key) => {
      const his = before[key];
      return his && !same(merged[key], his) ? [[key, his]] : [];
    })
  );
