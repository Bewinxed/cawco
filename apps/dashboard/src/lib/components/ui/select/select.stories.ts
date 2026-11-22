/**
 * The kit's Select (Component Story Format 3, live components) in a frame of
 * its own (select-frame): shut with nothing picked, shut with a pick, open,
 * and disabled. The meta's args are every story's; a story's own args are
 * what it changes.
 */
import SelectFrame from "./select-frame.svelte";

export default {
  title: "Kit/Select",
  component: SelectFrame,
  args: {
    options: ["Backlog", "In progress", "In review", "Landed"],
    height: 48,
  },
};

/** Nothing picked yet. */
export const Unpicked = {};

/** A stage picked. */
export const Picked = { args: { value: "In review" } };

/** Its list open, the pick ticked. */
export const Open = { args: { value: "In progress", open: true, height: 250 } };

/** Can't be changed while the task runs. */
export const Disabled = { args: { value: "In progress", disabled: true } };
