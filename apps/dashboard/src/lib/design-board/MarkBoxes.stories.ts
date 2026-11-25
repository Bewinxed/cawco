/**
 * The kit's mark boxes (Component Story Format 3, live components) in a
 * frame of their own (MarkBoxes): every box that leads with a glyph beside
 * its words, on one line and wrapped to two, in its smaller and its larger
 * size. The meta's args are every story's; a story's own args are what
 * it changes.
 */
import MarkBoxes from "./MarkBoxes.svelte";

export default {
  title: "Design system/Mark boxes",
  component: MarkBoxes,
  args: { lines: "one", size: "small" },
};

/** Each box's words on one line, in its smaller size. */
export const OneLine = {};

/** Each box's words wrapped to two lines where the box wraps. */
export const TwoLines = { args: { lines: "two" } };

/** One line, each box in its larger size. */
export const OneLineLarge = { args: { size: "large" } };

/** Two lines, each box in its larger size. */
export const TwoLinesLarge = { args: { lines: "two", size: "large" } };
