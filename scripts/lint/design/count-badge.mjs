// house/count-in-badge: a count drawn as a badge is the kit's Badge
// (src/lib/components/ui/badge/badge.svelte): `size="corner"` for a count
// on a control's glyph (a bar item's, the head's Comments), `size="tally"`
// for one standing in its row. A hand-built one came back each time a
// surface needed a count: a 12px pill at the meta size, too small to read
// and one digit from overflowing, then a dark oval over the glyph it
// counted, each its own size and type. So a class list that draws a count
// badge (a corner, a fill, tabular figures, and a least width that is its
// height: a box square at one figure that grows with its digits) is written only inside ui/badge; a caller
// mounts Badge.
import { sitesOf } from "./classes.mjs";
import { splitVariants } from "./tailwind.mjs";

const ROUNDED = /^rounded(?:-(?!none\b)[\w-]+)?$/u;
const FILL =
  /^bg-(?!transparent\b|linear\b|radial\b|conic\b|clip\b|none\b|fixed\b|local\b|scroll\b|cover\b|contain\b|center\b|no-repeat\b|repeat\b)/u;
const FIGURES = /^(?:num|tabular-nums)$/u;
const LEAST_WIDTH = /^min-w-(.+)$/u;
const HEIGHT = /^(?:h|size)-(.+)$/u;
const BLANK = /^\s+$/u;

/**
 * A site's entries in runs as written: one string's words, a recipe's base
 * apart from each of its variants (a site joins them all, and a look split
 * across a recipe's variants is no one class list).
 */
const runsOf = (model, entries) => {
  const runs = [];
  for (const entry of [...entries].sort((a, b) => a.start - b.start)) {
    const run = runs.at(-1);
    const last = run?.at(-1);
    if (last && BLANK.test(model.text.slice(last.end, entry.start))) {
      run.push(entry);
    } else {
      runs.push([entry]);
    }
  }
  return runs;
};

export function countBadges(model) {
  const findings = [];
  for (const run of sitesOf(model, { follow: false }).flatMap((site) =>
    runsOf(model, site.entries)
  )) {
    const bases = run
      .map((entry) => ({ entry, ...splitVariants(entry.name) }))
      .filter((one) => one.variants.length === 0);
    const has = (pattern) => bases.some((one) => pattern.test(one.base));
    const tokens = (pattern) =>
      new Set(bases.map((one) => one.base.match(pattern)?.[1]).filter(Boolean));
    const heights = tokens(HEIGHT);
    // At least square at one figure: its least width is its height.
    const square = [...tokens(LEAST_WIDTH)].some((one) => heights.has(one));
    if (has(ROUNDED) && has(FILL) && has(FIGURES) && square) {
      const [first] = run;
      const last = run.at(-1) ?? first;
      findings.push({
        start: first.start,
        end: last.end,
        message:
          'A count drawn as a badge is the kit\'s Badge (ui/badge): `size="corner"` on a control\'s glyph, `size="tally"` in its row, with a variant for its fill. Mount Badge rather than drawing the pill here.',
      });
    }
  }
  return findings;
}
