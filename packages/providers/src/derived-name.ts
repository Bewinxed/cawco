/**
 * A name the hub derives from longer text (a session's first message, an
 * element's words, a changed element's label): one line, cut at a word, with
 * an ellipsis. Nobody typed it, so nothing is refused, and the source text
 * keeps the rest.
 */

/** The most characters a derived name holds. */
// @limit external: a derived name is one line, at most 80 characters, cut at a word (WCAG 2.2 SC 1.4.8, https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html)
export const DERIVED_NAME_CHARS = 80;

/** `text` on one line, cut at the last word that fits {@link DERIVED_NAME_CHARS} and ending in "…" where it was cut. */
export const derivedName = (text: string): string => {
  const flat = text.replace(/\s+/gu, " ").trim();
  if (flat.length <= DERIVED_NAME_CHARS) {
    return flat;
  }
  const cut = flat.slice(0, DERIVED_NAME_CHARS);
  const at =
    flat[DERIVED_NAME_CHARS] === " " ? cut.length : cut.lastIndexOf(" ");
  // A word longer than half the line is cut where it stands, not dropped.
  return `${(at > DERIVED_NAME_CHARS / 2 ? cut.slice(0, at) : cut).trimEnd()}…`;
};
