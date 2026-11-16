/**
 * The session card's account and model pickers, to use (Component Story
 * Format 3, live components): the real SessionDetails on a bench's hub
 * (limit-picker-bench). Pick an account or a model at its limit, watch it
 * checked, move anyway. The dials set what a click can't reach: how old the
 * readings are, what the provider answers, and a move already waiting.
 */
import LimitPickerBench from "./limit-picker-bench.svelte";

export default {
  title: "Accounts/Limit picker",
  component: LimitPickerBench,
  args: { reading: "fresh", check: "still", pending: false, again: 0 },
  parameters: { viewport: 1440 },
};

/** The session card, its account and model pickers ready to use. */
export const Live = {};
