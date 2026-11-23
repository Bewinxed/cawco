/**
 * The kit's Row and RowList (Component Story Format 3): shared column tracks
 * owned by the list (`rows-grid`) and inherited by every row (`row-cells`).
 */
import RowFrame from "./row-frame.svelte";

export default {
  title: "Kit/Row",
  component: RowFrame,
  args: { withBelow: false },
};

/** Lead, body, and trailing rails shared across rows. */
export const Aligned = {};

/** A row with secondary text under its body, aligned by subgrid without inset calc(). */
export const WithBelow = { args: { withBelow: true } };
