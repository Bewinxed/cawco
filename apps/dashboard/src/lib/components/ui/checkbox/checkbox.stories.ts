/**
 * The kit's Checkbox (Component Story Format 3, live components), mounted
 * as itself: unticked, ticked, part-ticked for a column of rows, and
 * disabled. The meta's args are every story's; a story's own args are what
 * it changes.
 */
import Checkbox from "./checkbox.svelte";

export default {
  title: "Kit/Checkbox",
  component: Checkbox,
  args: { "aria-label": "Include this session in the report" },
};

/** Not picked yet. */
export const Unticked = {};

/** Picked. */
export const Ticked = { args: { checked: true } };

/** Some of the rows under it are picked. */
export const PartTicked = { args: { indeterminate: true } };

/** Can't be changed here. */
export const Disabled = { args: { checked: true, disabled: true } };
