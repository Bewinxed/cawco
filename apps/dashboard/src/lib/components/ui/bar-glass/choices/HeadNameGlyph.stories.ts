/**
 * The artifact panel's head naming the shown artifact by its kind's glyph alone, each menu row saying the artifact's ask.
 * The title-bars decision page shows it at a phone's and a desk's width.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/HeadNameGlyph",
  component: BarChoiceFrame,
  args: { of: "head", title: "glyph", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };

/** At a desk's width. */
export const Desk = { args: { width: 1440 }, parameters: { viewport: 1440 } };
