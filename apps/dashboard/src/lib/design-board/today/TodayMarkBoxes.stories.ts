/**
 * COMPARISON ONLY, deleted once the owner picks (2026-11-25): the kit's
 * boxes that lead with a glyph as they stood before the even-room rule
 * (TodayMarkBoxes), the same four stories as MarkBoxes.stories.ts, so one
 * design graph switches between today and the rule.
 */
import TodayMarkBoxes from "./TodayMarkBoxes.svelte";

export default {
  title: "Design system/Mark boxes today",
  component: TodayMarkBoxes,
  args: { lines: "one", size: "small" },
};

/** Each box's words on one line, in its smaller size, as today. */
export const OneLine = {};

/** Each box's words wrapped to two lines where the box wraps, as today. */
export const TwoLines = { args: { lines: "two" } };

/** One line, each box in its larger size, as today. */
export const OneLineLarge = { args: { size: "large" } };

/** Two lines, each box in its larger size, as today. */
export const TwoLinesLarge = { args: { lines: "two", size: "large" } };
