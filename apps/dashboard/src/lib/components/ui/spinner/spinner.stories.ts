/**
 * The kit's Spinner (Component Story Format 3, live components), mounted as
 * itself at each size it stands at. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import Spinner from "./spinner.svelte";

export default {
  title: "Kit/Spinner",
  component: Spinner,
  args: {},
};

/** Waiting, in a control or a row. */
export const Regular = {};

/** Waiting, beside meta text, in the muted ink. */
export const Small = { args: { box: "small", tone: "muted" } };

/** A whole page waiting. */
export const Large = { args: { box: "large" } };
