/**
 * The Sans + Mono pairs the board can be set in, for the owner to judge them
 * across the whole system (2026-11-24): today's, and the same-family pairs
 * shortlisted by their vertical metrics (even room above the capitals and
 * below the baseline, one cap height for sans and mono). The board names
 * its pair by `data-pair` and each hold button by `data-pair-hold`;
 * type-pairs.css sets `--font-sans` and `--font-mono` from them, so every
 * type role and component reads the pair as the product would.
 */
export const PAIRS = [
  {
    name: "Figtree + JetBrains Mono (today)",
    slug: "today",
    short: "Figtree (today)",
  },
  {
    name: "Atkinson Hyperlegible Next + Mono",
    slug: "atkinson",
    short: "Atkinson Hyperlegible",
  },
  { name: "Geist + Geist Mono", slug: "geist", short: "Geist" },
  { name: "Spline Sans + Mono", slug: "spline", short: "Spline Sans" },
  { name: "Chivo + Chivo Mono", slug: "chivo", short: "Chivo" },
  { name: "Reddit Sans + Mono", slug: "reddit", short: "Reddit Sans" },
] as const;

export type Pair = (typeof PAIRS)[number]["name"];

/** Today's pair: the board as the product draws it. */
export const TODAY: Pair = "Figtree + JetBrains Mono (today)";

/** The pair's name in CSS (`data-pair`, `data-pair-hold`). */
export const slugOf = (pair: Pair): string =>
  PAIRS.find((one) => one.name === pair)?.slug ?? "today";
