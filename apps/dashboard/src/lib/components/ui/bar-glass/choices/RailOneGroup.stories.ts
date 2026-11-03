/**
 * The Comments rail on a phone, its foot sheet's Close in the one glass group with Search, Sort and Comment on the whole page, as DESIGN.md says: today.
 * The title-bars decision page shows it at a phone's width; on a desk the rail has no Close.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/RailOneGroup",
  component: BarChoiceFrame,
  args: { of: "rail", group: "one", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };
