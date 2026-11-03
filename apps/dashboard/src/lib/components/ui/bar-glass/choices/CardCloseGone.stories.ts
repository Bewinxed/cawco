/**
 * The plan card over the composer without a Close: a press outside or Esc puts it away, as HIG Popovers has it.
 * The title-bars decision page shows it at a phone's and a desk's width.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/CardCloseGone",
  component: BarChoiceFrame,
  args: { of: "card", card: "gone", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };

/** At a desk's width. */
export const Desk = { args: { width: 1440 }, parameters: { viewport: 1440 } };
