/**
 * A bottom sheet with Close at its trailing edge, as DESIGN.md:720 and :912 say: today.
 * The title-bars decision page shows it at a phone's and a desk's width.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/SheetCloseTrailing",
  component: BarChoiceFrame,
  args: { of: "sheet", close: "trailing", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };

/** At a desk's width. */
export const Desk = { args: { width: 1440 }, parameters: { viewport: 1440 } };
