/**
 * The Comments rail's Sort, Comment on the whole page and Close in one glass group, as DESIGN.md:998 says: today.
 * The title-bars decision page shows it at a phone's and a desk's width.
 */
import BarChoiceFrame from "./bar-choice-frame.svelte";

export default {
  title: "Choices/RailOneGroup",
  component: BarChoiceFrame,
  args: { of: "rail", group: "one", width: 390 },
};

/** At a phone's width. */
export const Phone = { args: {}, parameters: { viewport: 390 } };

/** At a desk's width. */
export const Desk = { args: { width: 1440 }, parameters: { viewport: 1440 } };
