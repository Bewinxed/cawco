/** A piece of a line a search reads: `hit` where it matches the query. */
export interface MarkedPiece {
  hit: boolean;
  part: string;
}

/**
 * `text` cut where it matches `query`, every match its own piece, the rest
 * as written; one piece, no hit, when the query is empty. `query` is
 * matched as it is given: a caller lowercases it, as the text is here.
 */
export function marked(text: string, query: string): MarkedPiece[] {
  if (!query) {
    return [{ part: text, hit: false }];
  }
  const parts: MarkedPiece[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  for (
    let at = lower.indexOf(query);
    at !== -1;
    at = lower.indexOf(query, at + query.length)
  ) {
    if (at > from) {
      parts.push({ part: text.slice(from, at), hit: false });
    }
    parts.push({ part: text.slice(at, at + query.length), hit: true });
    from = at + query.length;
  }
  if (from < text.length) {
    parts.push({ part: text.slice(from), hit: false });
  }
  return parts;
}
