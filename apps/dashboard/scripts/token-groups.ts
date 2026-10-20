/**
 * Which tokens each platform of `bun run tokens` carries. The one token
 * source also holds the marketing site's own tokens (`marketing`), which
 * site/scripts/build.mjs reads from the JSON itself; the dashboard and the
 * Apple apps draw none of them, so neither platform emits them. Any other
 * group is the product's, and a group the Apple platform has no namespace for
 * still fails that build.
 *
 * A product token drawn on one platform alone says so in its
 * `$extensions["dev.cawco"].platforms`, the platforms it is drawn on
 * (`["web"]`): the stops of a web-only gradient that a web control animates
 * (`action-top`) have no Apple colour set or Swift accessor. A token that
 * names none is drawn on every platform.
 */
import type { TransformedToken } from "style-dictionary/types";
import { TOKENS_EXTENSION } from "../../../packages/hub/src/dtcg-values";

const SITE_GROUPS = new Set(["marketing"]);

/** The platforms a token is drawn on. */
export type Platform = "web" | "apple";
const PLATFORMS = new Set<string>(["web", "apple"]);

function isProductToken(token: TransformedToken): boolean {
  return !SITE_GROUPS.has(token.path[0]);
}

/** The platforms a token names in its extension, or undefined when it names none. */
function platformsOf(token: TransformedToken): Platform[] | undefined {
  const extensions = (token.original.$extensions ?? {}) as Record<
    string,
    { platforms?: unknown } | undefined
  >;
  const named = extensions[TOKENS_EXTENSION]?.platforms;
  if (named === undefined) {
    return;
  }
  if (!(
    Array.isArray(named) &&
    named.length > 0 &&
    named.every((one) => typeof one === "string" && PLATFORMS.has(one))
  )) {
    throw new Error(
      `${token.path.join(".")}: $extensions["${TOKENS_EXTENSION}"].platforms must list ${[...PLATFORMS].join(" or ")} (got ${JSON.stringify(named)})`
    );
  }
  return named as Platform[];
}

/** Whether the Apple platform carries a token: a product token not marked for other platforms alone. */
export function isAppleToken(token: TransformedToken): boolean {
  return (
    isProductToken(token) && (platformsOf(token)?.includes("apple") ?? true)
  );
}

/** Whether the web platform (tokens.css, the Tailwind theme) carries a token: a product token not marked for other platforms alone. */
export function isWebToken(token: TransformedToken): boolean {
  return isProductToken(token) && (platformsOf(token)?.includes("web") ?? true);
}
