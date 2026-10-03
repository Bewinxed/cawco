/**
 * Which token groups the product carries. The one token source also holds
 * the marketing site's own tokens (`marketing`), which site/scripts/build.mjs
 * reads from the JSON itself; the dashboard and the Apple apps draw none of
 * them, so neither platform of `bun run tokens` emits them. Any other group
 * is the product's, and a group the Apple platform has no namespace for still
 * fails that build.
 */
import type { TransformedToken } from "style-dictionary/types";

const SITE_GROUPS = new Set(["marketing"]);

export function isProductToken(token: TransformedToken): boolean {
  return !SITE_GROUPS.has(token.path[0]);
}
