/**
 * The ask block for a run's question (Component Story Format 3, live
 * components): Nightly staging check asks whether to restart staging, and
 * the answer's way to the hub.
 */
import AskBlock from "./AskBlock.svelte";
import { STAGING } from "./outcomes.fixture";

export default {
  title: "Outcomes/Ask block",
  component: AskBlock,
  args: {
    ask: STAGING.lines[0]?.ask,
    about: "Staging is healthy",
    answer: { kind: "open" },
    offline: null,
    evidence: true,
    onsend: () => undefined,
    onreadrun: () => undefined,
  },
  parameters: { viewport: 480 },
};

/** The question, its evidence and the two answers, nothing picked yet. */
export const Asking = {};

/** His answer is on its way to the hub. */
export const Sending = {
  args: { answer: { kind: "sending", choice: "Restart it" } },
};

/** The hub refused his answer, and says why. */
export const Refused = {
  args: {
    answer: {
      kind: "refused",
      choice: "Restart it",
      why: "The hub refused the answer: Nightly staging check changed while you read it. Your pick is kept; send it again. (409)",
    },
  },
};

/** The hub took it: one line says what happened. */
export const Answered = {
  args: { answer: { kind: "answered", choice: "Restart it" } },
};

/** The hub is not answering, so nothing can be sent. */
export const HubAway = {
  args: { offline: "The hub is not answering." },
};
