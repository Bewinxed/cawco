/**
 * A mention as a message's words hold it, and the markdown's reading of
 * it: pure text work, with nothing of the finder's state, so whatever draws
 * words (the markdown, a canvas's card) reads them without the finder.
 */
import { sessionLink } from "@cawco/core/references";

/**
 * A chip in a message's text, in its serialised form (`@<label> <handle>`):
 * the label (a title, and what tells it apart after " · "), and the handle.
 * A draft put back (restored, recalled, lifted for an edit) is parsed by it
 * into its chips again.
 */
export const SERIALISED = /@([^\n<>@]+?) <([^\s<>]+)>/g;

/** A message's text with each chip as it reads, `@<label>`: what a copy of the words shows. */
export const readAs = (text: string): string =>
  text.replace(SERIALISED, (_, label: string) => `@${label}`);

/** A session's or a thread's handle: `<dir>#<id8>`, `thread#<id8>` (hub labels.ts). */
export const SESSION_HANDLE = /#[0-9a-f]{6,}$/i;

/**
 * Words of a message (outside code, outside-code.ts) with each mention in
 * them, `@<label> <handle>`, as the reference the markdown draws as the
 * session's chip, `[@<label>](cawco:session/<handle>)` (references.ts):
 * the hub's names say which session a handle is, wherever it lives, and
 * one that names none reads as `@<label>`, never as its handle. The
 * person's own (`said`) are every mention the composer wrote; in anyone
 * else's words only a session's handle is one, so `@param <T>` stays as
 * written. `between` runs over the words between them.
 */
export function markMentions(
  words: string,
  said: boolean,
  between: (words: string) => string = (w) => w
): string {
  let out = "";
  let from = 0;
  for (const match of words.matchAll(SERIALISED)) {
    const [whole, label, handle] = match as unknown as [string, string, string];
    if (!(said || SESSION_HANDLE.test(handle))) {
      continue;
    }
    const start = match.index ?? 0;
    out += between(words.slice(from, start));
    out += sessionLink(handle, `@${label}`);
    from = start + whole.length;
  }
  return out + between(words.slice(from));
}
