/**
 * Option 1, the stage (Component Story Format 3, live components): the
 * decision page as a deck, one question at a time, on the request "How
 * decisions reach you". Every story is operable: pick, clear, note, move
 * through the deck, Send, and the agent's next round arrives after a Send.
 */
import { PICKED, ROUND, SENT } from "../shared/seeds";
import StageProto from "./StageProto.svelte";

export default {
  title: "Decision page/The stage",
  component: StageProto,
  args: { height: 900, start: 1 },
};

/** At the desk, on the first question: its two answers side by side at phone size. */
export const Desk = { parameters: { viewport: 1440 } };

/** On a phone: one answer in view, the row under the question switches which. */
export const Phone = { args: { height: 844 }, parameters: { viewport: 390 } };

/** On a 2529 window: the same question with room to spare. */
export const Wide = { args: { height: 1100 }, parameters: { viewport: 2529 } };

/** The brief, the deck's first card: what is asked, who asked, what waits. */
export const Brief = { args: { start: 0 }, parameters: { viewport: 1440 } };

/** Deck's entry picked: the question it unlocks has slid into the strip after it. */
export const Unlocked = {
  args: { seed: PICKED, start: 2 },
  parameters: { viewport: 1440 },
};

/** The settled question: common practice's answer drawn chosen; his press overrules it. */
export const Settled = {
  args: { seed: PICKED, start: 6 },
  parameters: { viewport: 1440 },
};

/** Sent: the bar says when and to whom, the record ends the strip. */
export const Sent = {
  args: { seed: SENT, start: 7 },
  parameters: { viewport: 1440 },
};

/** The agent's next round: one reworded, one new, Deck built and taken off, his note answered. */
export const NewRound = {
  args: { seed: ROUND, start: 3 },
  parameters: { viewport: 1440 },
};
