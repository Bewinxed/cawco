/**
 * The kit's Progress (Component Story Format 3, live components), mounted as
 * itself from just started to nearly done. The meta's args are every
 * story's; a story's own args are what it changes.
 */
import Progress from "./progress.svelte";

export default {
  title: "Kit/Progress",
  component: Progress,
  args: { "aria-label": "Copying the workspace", max: 100 },
};

/** The copy has just started. */
export const Started = { args: { value: 8 } };

/** Halfway through. */
export const Halfway = { args: { value: 52 } };

/** Nearly done. */
export const NearlyDone = { args: { value: 94 } };
