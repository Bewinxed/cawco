/**
 * A find's pages, as both sides of the views thread say them: the engine
 * that pages a find (find-engine.ts) and the hub's thread that asks for one
 * (find.ts, find-tool.ts, delegation-actions.ts). Imports nothing, so the
 * hub's thread loads none of the engine for them.
 */

/** How many results a page of a find holds by default, and at most. */
// @limit measured: a page; the next page's cursor rides the answer. The finder's rows are --spacing-c-row-h (44 px) each, so 20 are 880 px of list
export const DEFAULT_LIMIT = 20;

/** The cursor that starts a page of a find at `offset`. */
export const cursorAt = (offset: number): string =>
  Buffer.from(String(offset), "utf8").toString("base64url");
