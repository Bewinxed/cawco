/**
 * Caw's suggestion in the states it meets (Component Story Format 3, live
 * components), through its seam (CawSuggestsFrame): the offer at rest,
 * the offer that cannot be waved away, and the longest it is written. The
 * canvas draws hover, focus and pressed columns of every story besides,
 * and every story at the widths it is asked for.
 */
import CawSuggestsFrame from "./CawSuggestsFrame.svelte";

export default {
  title: "Suggestions/Caw suggests",
  component: CawSuggestsFrame,
  args: { words: "routine", dismissable: true },
  // It is as wide as the page it stands on: a desk's by default, a phone's
  // when the canvas is asked for one.
  parameters: { viewport: "desk" },
};

/** Caw offers a routine I could turn on. */
export const Offered = {};

/** The same offer where it cannot be waved away: one act. */
export const OfferedOnly = { args: { dismissable: false } };

/** The longest offer he writes, its words wrapping beside him. */
export const OfferedLong = { args: { words: "long" } };
