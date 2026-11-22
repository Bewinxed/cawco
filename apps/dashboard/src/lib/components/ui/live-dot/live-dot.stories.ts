/**
 * The kit's LiveDot (Component Story Format 3, live components), mounted as
 * itself in each ink it breathes in. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import LiveDot from "./live-dot.svelte";

export default {
  title: "Kit/Live dot",
  component: LiveDot,
  args: {},
};

/** A session at work. */
export const Working = {};

/** At work, on a raised tag. */
export const OnATag = { args: { tone: "live-ink" } };

/** A connection still being finished. */
export const Connecting = { args: { tone: "muted" } };

/** A row's dot beside its words. */
export const InARow = { args: { size: "row" } };
