/**
 * The Sans + Mono pairs the board can be set in, for the owner to judge them
 * across the whole system (2026-11-24): today's, and the same-family pairs
 * shortlisted by their vertical metrics (even room above the capitals and
 * below the baseline, one cap height for sans and mono). Their faces are
 * type-pairs.css's; the board swaps only `--font-sans` and `--font-mono`, so
 * every type role and component reads the pair as the product would.
 */
const PAIRS = {
  "Figtree + JetBrains Mono (today)": null,
  "Atkinson Hyperlegible Next + Mono": [
    "Pair Atkinson Hyperlegible Next",
    "Pair Atkinson Hyperlegible Mono",
  ],
  "Geist + Geist Mono": ["Pair Geist", "Pair Geist Mono"],
  "Spline Sans + Mono": ["Pair Spline Sans", "Pair Spline Sans Mono"],
  "Chivo + Chivo Mono": ["Pair Chivo", "Pair Chivo Mono"],
  "Reddit Sans + Mono": ["Pair Reddit Sans", "Pair Reddit Mono"],
} as const;

export type Pair = keyof typeof PAIRS;

/** Today's pair: the board as the product draws it. */
export const TODAY: Pair = "Figtree + JetBrains Mono (today)";

/** The pair's font stacks for `--font-sans` and `--font-mono`; none for today's. */
export function pairFaces(
  pair: Pair
): { sans: string; mono: string } | undefined {
  const faces = PAIRS[pair];
  return faces
    ? {
        sans: `"${faces[0]}", ui-sans-serif, sans-serif`,
        mono: `"${faces[1]}", ui-monospace, monospace`,
      }
    : undefined;
}
