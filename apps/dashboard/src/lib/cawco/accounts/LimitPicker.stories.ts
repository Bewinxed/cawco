/**
 * A session card's account and model pickers, to use (Component Story
 * Format 3, live components): pick an account or a model at its limit,
 * watch it checked, move anyway. The dials set what a click can't reach:
 * how old the readings are, what the provider answers, and a move already
 * waiting. My own checks of each state are LimitPickerChecks.stories.ts.
 */
import LimitPickerLive from "./limit-picker-live.svelte";

export default {
  title: "Accounts/Limit picker",
  component: LimitPickerLive,
  args: { reading: "fresh", check: "still", pending: false, again: 0 },
};

/** The session card, its account and model pickers ready to use. */
export const Live = {};
