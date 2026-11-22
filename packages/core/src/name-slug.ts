/**
 * A name as a slug: lowercase letters and digits, each run of anything else
 * one dash, none at either end, at most 63 characters (an artifact's name,
 * a design direction's folder); "" when nothing is left, for the caller's
 * own fallback.
 */

const NOT_SLUG = /[^a-z0-9]+/gu;
const SLUG_ENDS = /^-+|-+$/gu;

/** The longest slug: an artifact name's limit. */
const SLUG_MOST = 63;

/** `name` as a slug, or "" when it has no letter or digit. */
export const nameSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(NOT_SLUG, "-")
    .replace(SLUG_ENDS, "")
    .slice(0, SLUG_MOST);
