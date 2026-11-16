/**
 * A session card's account and model pickers when a pick would meet a
 * limit CawCo knows of (Component Story Format 3, live components), in a
 * frame of their own (limit-picker-frame) with no store read. The session
 * runs on jude@petralab.ai, stopped at its limit; bewinxed@gmail.com is
 * the account it moves to. The meta's args are every story's; a story's
 * own args are what it changes.
 */
import LimitPickerFrame from "./limit-picker-frame.svelte";

export default {
  title: "Accounts/Limit picker",
  component: LimitPickerFrame,
  args: { scene: "fresh", height: 620 },
};

/** The account list open: bewinxed is at its limit, read a few minutes ago, and still a pick. */
export const FreshReading = {};

/** The same account, its limit read three hours ago. */
export const StaleReading = { args: { scene: "stale" } };

/** I picked bewinxed and CawCo is asking Anthropic whether it is still at its limit. */
export const Checking = { args: { scene: "checking" } };

/** Anthropic says it is still at its limit: Move anyway opens under the row. */
export const StillAtLimit = { args: { scene: "still" } };

/** The limit had gone, so the move went through as any other. */
export const CheckCleared = { args: { scene: "cleared" } };

/** Anthropic can't be asked because tower is offline: the old reading, and Move anyway at once. */
export const CantCheck = { args: { scene: "unasked" } };

/** The model list while the session waits to move: one model at its limit there, one not offered at all. */
export const ModelsOnTheMove = { args: { scene: "models" } };

/** I picked the model at its limit and CawCo is asking Anthropic. */
export const ModelChecking = { args: { scene: "modelChecking" } };

/** Still at its limit for that model: Pick anyway opens under it. */
export const ModelStillAtLimit = { args: { scene: "modelStill" } };

/** A model picked while the move waits rides it: the card says both. */
export const PickRidesMove = { args: { scene: "riding", height: 360 } };
