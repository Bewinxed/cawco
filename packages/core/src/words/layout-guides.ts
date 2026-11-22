/**
 * A design graph frame's layout as `artifact_read` with `layout` says it to
 * an agent (hub presenters/artifacts.ts): what the redesign gate checks
 * first (groups with more than one text start, near-misses, spacing off
 * every token), each with the element and its source, then where the rest
 * is. The numbers in full are the read's `layout` (core layout-guides.ts).
 */
import type {
  LayoutPlace,
  LayoutRead,
  NearMiss,
  SpacingRead,
} from "../layout-guides";

/** An element as a line names it: its selector, and its source where known. */
const placed = (one: LayoutPlace): string =>
  one.source ? `${one.el} (${one.source})` : one.el;

const listed = (values: readonly number[]): string => values.join(", ");

/** The gaps between neighbouring values, as "19" or "19, 4". */
const gapsOf = (values: readonly number[]): string =>
  values
    .slice(1)
    .map((one, at) => Math.round((one - (values[at] ?? one)) * 100) / 100)
    .join(", ");

const missLine = (miss: NearMiss): string =>
  `- ${miss.kind}, ${miss.apart}px apart (${miss.within === "group" ? "in one group" : "across surfaces"}): ${miss.a.at} ${placed(miss.a)} | ${miss.b.at} ${placed(miss.b)}`;

const spacingLine = (one: SpacingRead): string =>
  `- ${one.kind === "gap" ? `gap ${one.side === "x" ? "across" : "down"}` : `padding-${one.side}`} ${one.px}px in ${placed(one)}${one.count > 1 ? `, ${one.count} times` : ""}`;

export const layoutWords = {
  /** The read's lines: its head, the gate's three findings, and where the rest is. */
  lines: (read: LayoutRead): string[] => {
    const split = read.groups.filter((group) => group.text.stacked.length > 1);
    const off = read.spacing.filter((one) => one.token === null);
    const tokens = Object.entries(read.tokens);
    return [
      `Layout, as the alignment guides read it (drawing ${read.width}×${read.height} px; ${read.groups.length} groups, one per surface):`,
      "Its picture's guides: text starts blue, ends magenta, centres violet, baselines teal and dashed, surface edges amber; near-misses red; a padding or gap washed green on a token, red off every one with its px.",
      tokens.length > 0
        ? `Spacing tokens matched: ${tokens.map(([name, px]) => `${name} ${px}`).join(", ")}.`
        : "The page declares no spacing tokens, so every padding and gap is off-token.",
      ...(split.length > 0
        ? [
            `Groups whose lines, one under another, start on more than one edge (${split.length}):`,
            ...split.map(
              (group) =>
                `- ${placed(group)} at ${group.box.x},${group.box.y}: starts ${listed(group.text.stacked)} (apart ${gapsOf(group.text.stacked)})`
            ),
          ]
        : ["In every group, lines one under another start on one edge."]),
      ...(read.nearMisses.length > 0
        ? [
            `Near-misses (${read.nearMisses.length}):`,
            ...read.nearMisses.map(missLine),
          ]
        : ["No near-misses."]),
      ...(off.length > 0
        ? [
            `Spacing off every token (${off.length} of ${read.spacing.length}):`,
            ...off.map(spacingLine),
          ]
        : [`All ${read.spacing.length} paddings and gaps sit on a token.`]),
      ...(read.leftOut
        ? [
            `Left out past the read's caps: ${Object.entries(read.leftOut)
              .map(([what, count]) => `${count} ${what}`)
              .join(", ")}.`,
          ]
        : []),
      "Every group's edges and baselines, and each spacing's box: response_format detailed.",
    ];
  },
};
