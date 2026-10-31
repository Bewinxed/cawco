/**
 * Option 2, the brief (Component Story Format 3, live components): the
 * decision page as one document read top to bottom, on the request "How
 * decisions reach you". Every story is operable: pick, clear, note, jump
 * from the margin, Send, and the agent's next round arrives after a Send.
 */
import { PICKED, ROUND, SENT } from "../shared/seeds";
import BriefProto from "./BriefProto.svelte";

export default {
  title: "Decision page/The brief",
  component: BriefProto,
  args: { height: 900 },
};

/** On a phone: the answers stack at their real width, the margin is a strip across the top. */
export const Phone = { args: { height: 844 }, parameters: { viewport: 390 } };

/** At the desk: the situation, then each question as a passage with its answers in a row. */
export const Desk = { parameters: { viewport: 1440 } };

/** Deck's entry picked: the question it unlocks unfolds inside its passage, indented. */
export const Unlocked = {
  args: { seed: PICKED },
  parameters: { viewport: 1440 },
};

/** On a 2529 window: the margin carries each question's words. */
export const Wide = { args: { height: 1100 }, parameters: { viewport: 2529 } };

/** The agent's next round: change bars in the margin, a new passage, his note answered. */
export const NewRound = {
  args: { seed: ROUND },
  parameters: { viewport: 1440 },
};

/** Sent: the bar says when and to whom; the page reads as the record. */
export const Sent = { args: { seed: SENT }, parameters: { viewport: 1440 } };
