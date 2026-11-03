/**
 * A project's board before it is set up (Component Story Format 3, live
 * components): the personal PR team in its first minutes, with Caw's real
 * questions as the hub parks them (setup.fixtures.ts). The meta's args are
 * every story's; a story's own args are what it changes. His seat is the
 * page's (CawSeat); here the scene stands with its folder glyph, as it does
 * while his panel holds him.
 */
import SetupScene from "./SetupScene.svelte";
import { PR_ASKS } from "./setup.fixtures";

const none = () => null;

export default {
  title: "Onboarding/Board before setup",
  component: SetupScene,
  args: {
    asks: [],
    onanswer: none,
    act: { kind: "drafting" },
  },
  parameters: { viewport: 1440 },
};

/** He drafts the setup: the claim, its action held with why. */
export const Drafting = {};

/** Three of his questions: one holds his work up, two let it go on. They are the middle; the claim is not under them. */
export const Questions = { args: { asks: PR_ASKS } };

/** One question left, the one that holds him. */
export const OneQuestion = { args: { asks: [PR_ASKS[0]] } };

/** The setup page is open: the action opens it. */
export const PageOpen = {
  args: { act: { kind: "page", open: () => undefined } },
};

/** No setup under way (left unsent, or Caw off): the action asks him for one. */
export const NothingUnderWay = {
  args: { act: { kind: "ask", ask: () => undefined } },
};

/** No machine online: no action the board can carry. */
export const NoMachine = { args: { act: { kind: "none" } } };

/** On a phone: the claim; his sheet carries his questions. */
export const Phone = { parameters: { viewport: 390 } };

/** At 680: the questions on a narrow board. */
export const QuestionsNarrow = {
  args: { asks: PR_ASKS },
  parameters: { viewport: 680 },
};

/** At 2529: the scene stays on its axis, the questions at their measure. */
export const QuestionsWide = {
  args: { asks: PR_ASKS },
  parameters: { viewport: 2529 },
};
