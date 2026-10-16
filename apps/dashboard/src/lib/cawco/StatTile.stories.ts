/**
 * StatTile's sheet (Component Story Format 3, live components): one figure
 * on its card, as the Usage page and a drawn view's tiles show it, mounted
 * by CawCo's stage from this file and the real StatTile.svelte. The meta's
 * args are every story's; a story's own args are what it changes.
 */
import StatTile from "./StatTile.svelte";

export default {
  component: StatTile,
  args: { label: "Spend today", value: "4.20", unit: "USD" },
};

/** The budget's figure at rest: no status of its own. */
export const Spend = { args: {} };

/** A figure that is live: its value in the live status's ink. */
export const Live = {
  args: { label: "Running", value: 3, unit: "sessions", tone: "live" },
};
