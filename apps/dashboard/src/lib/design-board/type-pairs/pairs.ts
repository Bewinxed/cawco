/**
 * The Sans + Mono pairs the board can be set in, for the owner to judge them
 * across the whole system (2026-11-24): today's, and the same-family pairs
 * shortlisted by their vertical metrics (even room above the capitals and
 * below the baseline, one cap height for sans and mono). The board names
 * its pair by `data-pair`; type-pairs.css sets `--font-sans` and `--font-mono` from them, so every
 * type role and component reads the pair as the product would.
 */
const PAIRS = [
  {
    name: "Figtree + JetBrains Mono (today)",
    slug: "today",
  },
  {
    name: "Atkinson Hyperlegible Next + Mono",
    slug: "atkinson",
  },
  { name: "Geist + Geist Mono", slug: "geist" },
  { name: "Spline Sans + Mono", slug: "spline" },
  { name: "Chivo + Chivo Mono", slug: "chivo" },
  { name: "Reddit Sans + Mono", slug: "reddit" },
] as const;

export type Pair = (typeof PAIRS)[number]["name"];

/** Today's pair: the board as the product draws it. */
export const TODAY: Pair = "Figtree + JetBrains Mono (today)";

/** The pair's name in CSS (`data-pair`). */
export const slugOf = (pair: Pair): string =>
  PAIRS.find((one) => one.name === pair)?.slug ?? "today";
