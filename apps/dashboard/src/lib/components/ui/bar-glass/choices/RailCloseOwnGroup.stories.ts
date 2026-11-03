/**
 * The Comments rail's Close in a glass group of its own, as HIG Toolbars groups Close.
 * The title-bars decision page shows it at a phone's and a desk's width.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/RailCloseOwnGroup",
  component: BarChoiceFrame,
  args: { of: "rail", group: "own", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };

/** At a desk's width. */
export const Desk = { args: { width: 1440 }, parameters: { viewport: 1440 } };
