/**
 * The session card's stats strip in three looks (Component Story Format 3,
 * live components), each in the real card (limit-picker-bench): the
 * context meter and the 5-hour limit on one grid. For the decision page's
 * options; the owner's card to use is LimitPicker.stories.ts `Live`.
 */
import LimitPickerBench from "./limit-picker-bench.svelte";

export default {
  title: "Accounts/Session meters",
  component: LimitPickerBench,
  args: {
    reading: "fresh",
    check: "still",
    pending: false,
    room: "card",
    again: 0,
  },
};

/** A rounded track and its fill, the pace as a notch, the figure in its column. */
export const Track = { args: { meter: "track" } };

/** Ten cells that fill, the figure in its column. */
export const Cells = { args: { meter: "cells" } };

/** The name and figure on one line over a full-width hairline. */
export const Stack = { args: { meter: "stack" } };
