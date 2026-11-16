/**
 * Where the session card puts its two unrelated figures (Component Story
 * Format 3, live components), each in the real card (limit-picker-bench):
 * the conversation's context, and the account's limit. For the decision
 * page's options; the owner's card to use is LimitPicker.stories.ts `Live`.
 */
import LimitPickerBench from "./limit-picker-bench.svelte";

export default {
  title: "Accounts/Session stats",
  component: LimitPickerBench,
  args: {
    reading: "fresh",
    check: "still",
    pending: false,
    room: "card",
    again: 0,
  },
};

/** Context in the head with what the conversation is; the limit on the account chip. */
export const WithTheirOwners = { args: { place: "owners" } };

/** Context on the model chip; the limit on the account chip. */
export const OnTheirChips = { args: { place: "chips" } };

/** Context alone in the stats strip; the limit only in the account list. */
export const ContextInTheStrip = { args: { place: "strip" } };
