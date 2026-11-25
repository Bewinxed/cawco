/**
 * A pick parked in a session's composer (Component Story Format 3, live):
 * the agent put a design's directions or a decision card to the person,
 * and the composer grows into it as it does into a question, answered there
 * as where it lives or in his own words on its Other line, or dismissed
 * there as a question is. The composer, the card, the decision
 * host's card and options, the direction wells and the transcript's record
 * are the product's; the conversation round them is
 * parked-prompt-live.svelte, the picks shaped as the hub lists them
 * (parked-fixtures.ts). A pick answers the item: the composer folds back,
 * the next comes in, and its record joins the turns.
 */

import {
  CARD_IN_WORDS,
  DECISION_CARD,
  DIRECTIONS_IN_WORDS,
  DISMISSED_CARD,
  DISMISSED_PICK,
  NOTE_ONLY,
  PICKED,
  THREE_DIRECTIONS,
  TWO_DIRECTIONS,
} from "./parked-fixtures";
import ParkedPromptLive from "./parked-prompt-live.svelte";

export default {
  title: "Composer/Parked pick",
  component: ParkedPromptLive,
  args: { items: [TWO_DIRECTIONS, DECISION_CARD], height: 820 },
};

/** Which grey hovered rows and buttons take at night: two directions side by side, a card waiting behind. */
export const Live = {};

/** Three directions of the grey, the warm one beside the two. */
export const ThreeDirections = { args: { items: [THREE_DIRECTIONS] } };

/** A decision card from the agent's page, its recommended option and why. */
export const DecisionCard = { args: { items: [DECISION_CARD] } };

/** The agent's question about the nightly comes up first, as it holds its turn; the grey pick waits behind it. */
export const QuestionQueued = {
  args: { items: [TWO_DIRECTIONS], question: true },
};

/** The live drawings still on their way. */
export const StillDrawing = {
  args: { items: [TWO_DIRECTIONS], drawing: "loading" },
};

/** A direction's component threw as the stage drew it. */
export const DrawingFailed = {
  args: { items: [TWO_DIRECTIONS], drawing: "failed" },
};

/** Two steps up was picked on the graph while the pick stood here. */
export const PickedOnGraph = {
  args: { items: [TWO_DIRECTIONS, DECISION_CARD], picked: "Two steps up" },
};

/** The pick folded to its bar so the conversation can be read. */
export const Minimized = {
  args: { items: [TWO_DIRECTIONS, DECISION_CARD], minimized: true },
};

/** The grey picked, its record in the turns, and the card answered with a note alone. */
export const Answered = {
  args: { items: [], settled: [PICKED, NOTE_ONLY] },
};

/** The grey and the card each answered in his own words, with no pick. */
export const InOwnWords = {
  args: { items: [], settled: [DIRECTIONS_IN_WORDS, CARD_IN_WORDS] },
};

/** The grey and the card each dismissed without a word. */
export const Dismissed = {
  args: { items: [], settled: [DISMISSED_PICK, DISMISSED_CARD] },
};
