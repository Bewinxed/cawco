/**
 * Option 3, the design with my choices (Component Story Format 3, live
 * components): one live stage of the decisions list with every pick
 * applied, the questions as controls beside it, on the request "How
 * decisions reach you". Every story is operable: pick and watch the stage
 * follow, Compare, All sizes, note, Send, and the agent's next round
 * arrives after a Send.
 */
import { PICKED, ROUND, SENT } from "../shared/seeds";
import DesignProto from "./DesignProto.svelte";

export default {
  title: "Decision page/The design with my choices",
  component: DesignProto,
  args: { height: 900 },
};

/** On a 2529 window: the desk stage stands whole beside the controls. */
export const Wide = { args: { height: 1100 }, parameters: { viewport: 2529 } };

/** At the desk: the stage at desk size, the controls beside it. */
export const Desk = { parameters: { viewport: 1440 } };

/** Every size at once: the stage at phone, tablet, desk and wider, one under another. */
export const AllSizes = {
  args: { size: "all" },
  parameters: { viewport: 1440 },
};

/** On a phone: the stage on top at phone size, the controls under it. */
export const Phone = {
  args: { height: 844, size: "phone" },
  parameters: { viewport: 390 },
};

/** Deck's entry picked: the control it unlocks unfolds under it, and the stage opens on one decision. */
export const Unlocked = {
  args: { seed: PICKED, size: "phone" },
  parameters: { viewport: 1440 },
};

/** The agent's next round: one reworded, one new, his note answered. */
export const NewRound = {
  args: { seed: ROUND },
  parameters: { viewport: 1440 },
};

/** Sent: the bar says when and to whom. */
export const Sent = { args: { seed: SENT }, parameters: { viewport: 1440 } };
