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
 * condition names counts, the edges included. A view that draws the page
 * otherwise writes nothing for the mark: it lists the mark as one made in
 * another view ({@link Unplaced}), and a view that draws the page as made
 * writes for it once the hub names it to place the marks.
 */
import { type PageAnchor, STORY_SCHEMES } from "./anchor";

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

/**
 * A mark a view doesn't draw on its element, and why, as that view alone
 * reads it, asked in this order:
 * - this view can't judge it: on a sheet it shows another story than the
 *   mark's (`story`, with the mark's story by its states file and export,
 *   and the state's name as the graph shows it: the export in plain words
 *   until the host, which holds the sheet's stories, names it as its
 *   States menu does), or it draws the page otherwise
 *   than the mark was made in (`elsewhere`, with that view), whether or not
 *   it finds the element;
 * - in a view that draws the page as made: its element found but drawn in
 *   no box, under a `display: none`, a `content-visibility: hidden` or a
 *   closed `<details>` (`hidden`), or gone from the page (`gone`).
 * Read off the page each draw and said to its host (overlay pins.ts,
 * `cawco:pins-unplaced`), which lists it with the moved marks; nothing of
 * it is written to the doc.
 */
export type Unplaced =
  | { why: "gone" }
  | { why: "hidden" }
  | { made: MadeView; why: "elsewhere" }
  | { file: string; state: string; story: string; why: "story" };

/** Why a view can't judge a mark ({@link Unplaced}): it shows another story, or draws the page otherwise than made. */
export type MadeAway = Extract<Unplaced, { why: "elsewhere" | "story" }>;

/** One {@link Unplaced} as a message carried it, or null when it reads as none. */
const unplacedOne = (value: unknown): Unplaced | null => {
  if (typeof value !== "object" || value === null || !("why" in value)) {
    return null;
  }
  if (value.why === "gone" || value.why === "hidden") {
    return { why: value.why };
  }
  if (value.why === "story") {
    return "story" in value &&
      typeof value.story === "string" &&
      "file" in value &&
      typeof value.file === "string" &&
      "state" in value &&
      typeof value.state === "string"
      ? {
          why: "story",
          file: value.file,
          state: value.state,
          story: value.story,
        }
      : null;
  }
  const made = "made" in value ? value.made : null;
  if (
    value.why !== "elsewhere" ||
    typeof made !== "object" ||
    made === null ||
    !("scheme" in made && "width" in made) ||
    !(made.width === null || typeof made.width === "number")
  ) {
    return null;
  }
  const scheme = STORY_SCHEMES.find((one) => one === made.scheme);
  return scheme
    ? { why: "elsewhere", made: { scheme, width: made.width } }
    : null;
};

/** The marks a page said it doesn't draw (`cawco:pins-unplaced`), by id; each that reads as none left out. */
export const unplacedOf = (value: unknown): Record<string, Unplaced> => {
  const read: Record<string, Unplaced> = {};
  if (typeof value !== "object" || value === null) {
    return read;
  }
  for (const [id, one] of Object.entries(value)) {
    const unplaced = unplacedOne(one);
    if (unplaced) {
      read[id] = unplaced;
    }
  }
  return read;
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
