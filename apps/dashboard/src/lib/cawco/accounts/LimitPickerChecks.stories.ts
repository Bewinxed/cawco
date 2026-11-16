/**
 * The limit picker's states, each forced, for checking the drawing
 * (artifact_read), not for the person: what they open is
 * LimitPicker.stories.ts `Live`. The meta's args are every story's; a
 * story's own args are what it changes.
 */
import LimitPickerLive from "./limit-picker-live.svelte";

export default {
  title: "Accounts/Limit picker checks",
  component: LimitPickerLive,
  args: { reading: "fresh", check: "still", pending: false, open: "account" },
};

/** The account list: bewinxed at its limit, read a few minutes ago. */
export const Accounts = {};

/** The same list, its readings three hours old. */
export const Stale = { args: { reading: "stale" } };

/** bewinxed picked and being checked again. */
export const Checking = { args: { checking: "bewinxed" } };

/** Still at its limit: Move anyway on its row. */
export const StillAtLimit = {
  args: { held: { id: "bewinxed", why: "still" } },
};

/** Its machine offline: the old reading, and Move anyway at once. */
export const Offline = {
  args: { held: { id: "bewinxed", why: "offline" } },
};

/** The model list on jude: Fable at its limit. */
export const Models = { args: { open: "model" } };

/** Fable still at its limit: Pick anyway on its row. */
export const ModelStill = {
  args: { open: "model", held: { id: "claude-fable-5-2", why: "still" } },
};

/** A move to Research ops waiting for the turn to end, the list closed. */
export const MovePending = { args: { open: null, pending: true } };
