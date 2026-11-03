/**
 * The Comments rail on a phone, its foot sheet's Close in a glass group of its own, as HIG Toolbars groups Close.
 * The title-bars decision page shows it at a phone's width; on a desk the rail has no Close.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/RailCloseOwnGroup",
  component: BarChoiceFrame,
  args: { of: "rail", group: "own", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };
