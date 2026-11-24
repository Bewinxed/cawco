/**
 * Whether a view of a page shows it as a mark was made: the one test that
 * lets a view write where a mark stands (overlay pins.ts and ink.ts
 * `judges`). Two views of one page draw it each at its own width and
 * scheme, and a page may draw an element at one width only (a desk's side
 * panel, a phone's menu): a view that draws the page otherwise than the
 * mark was made can't tell the page losing its element from its own layout
 * leaving it out, so it leaves the mark where it stands. A mark is moved
 * aside, or anchored again, only by a view that draws the page as it was
 * drawn then.
 *
 * Two widths draw the page alike when none of the page's own width
 * conditions (its `@media` and `@container` rules, and the queries its
 * script asks `matchMedia`) holds a threshold between them: a condition
 * between them may answer each otherwise, one with none answers both
 * alike. The thresholds are read, never answered, so any length a width
 * condition names counts, the edges included. A view that reads the page
 * otherwise only waits: a view that draws it as made writes for the mark
 * once the hub names it to place the marks.
 */
import type { PageAnchor } from "./anchor";

/** A view as a mark was made in it, or as a view draws the page now: its width (px; null when unknown) and its scheme. */
export interface MadeView {
  scheme: NonNullable<NonNullable<PageAnchor["sheet"]>["state"]>["scheme"];
  width: number | null;
}

/** The view a mark was made in: a sheet's frame state, else the page's view; undefined for a mark made before either was kept. */
export const madeViewOf = (anchor: PageAnchor): MadeView | undefined => {
  const state = anchor.sheet?.state;
  return state ? { scheme: state.scheme, width: state.width } : anchor.view;
};

/** A condition that asks a width: the viewport's (`width`, `min-width`, `max-width`, range syntax) or a container's (`inline-size` too); never `device-width`. */
const ASKS_WIDTH =
  /(?<![\w-])(?:(?:min-|max-)?(?:width|inline-size))(?![\w-])/iu;
/** A length in a condition: px, or em and rem (in a media query both are the initial font size, 16px: Media Queries 4, "Relative lengths"). */
const LENGTH = /(-?\d*\.?\d+)(px|r?em)\b/giu;
/** The px of one em in a width condition. */
const EM_PX = 16;

/** The width thresholds `conditions` name: every length in each that asks a width ({@link ASKS_WIDTH}), in px. */
export function widthThresholds(conditions: Iterable<string>): number[] {
  const found = new Set<number>();
  for (const condition of conditions) {
    if (!ASKS_WIDTH.test(condition)) {
      continue;
    }
    for (const [, number, unit] of condition.matchAll(LENGTH)) {
      const value = Number(number);
      found.add(unit.toLowerCase() === "px" ? value : value * EM_PX);
    }
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * Whether the view `now` draws the page as `made` was drawn: the same
 * scheme, and the same width or two widths no threshold lies between
 * (`thresholds`, px; {@link widthThresholds}; null where the page keeps
 * some of its style from being read, a sheet of another origin's: the same
 * width only). An unknown width matches only an unknown one. A mark made before its view was kept (`made`
 * undefined) is judged by every view, as it was before.
 */
export const showsAsMade = (
  made: MadeView | undefined,
  now: MadeView,
  thresholds: readonly number[] | null
): boolean => {
  if (made === undefined) {
    return true;
  }
  if (made.scheme !== now.scheme) {
    return false;
  }
  if (made.width === null || now.width === null) {
    return made.width === now.width;
  }
  const low = Math.min(made.width, now.width);
  const high = Math.max(made.width, now.width);
  return (
    low === high ||
    (thresholds !== null &&
      !thresholds.some((edge) => edge >= low && edge <= high))
  );
};
