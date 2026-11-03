/**
 * New project (Component Story Format 3, live components), with the
 * person's own first words: the personal PR team that fits no template. The
 * meta's args are every story's; a story's own args are what it changes.
 * The `Hint*` and `Hues*` stories are the options of the decision page
 * `onboarding-design` (cards `describe-hint` and `card-hues`); the rest are
 * the states every option keeps.
 */
import { PROMPT_UNREACHED } from "#lib/cawco/hub-read.js";
import NewProject from "./NewProject.svelte";
import { PR_WORDS as PR_TEAM } from "./pr-team.fixtures";

/** A send that waits: the story never leaves the page. */
const waits = () => new Promise<never>(() => undefined);

export default {
  title: "Onboarding/New project",
  component: NewProject,
  args: {
    fleet: "online",
    create: waits,
    onmade: () => undefined,
    onmachines: () => undefined,
    hues: "section",
  },
  parameters: { viewport: 1440 },
};

/** A line under the question says the work can just be described. */
export const HintTitle = { args: { hint: "title" } };

/** A head over the cards names them as the other way, and what happens without one. */
export const HintHead = { args: { hint: "head" } };

/** A caption under the cards, in addendum 4's words. */
export const HintCaption = { args: { hint: "caption" } };

/** On a phone: the line under the question. */
export const HintTitlePhone = {
  args: { hint: "title" },
  parameters: { viewport: 390 },
};

/** On a phone: the head over the cards. */
export const HintHeadPhone = {
  args: { hint: "head" },
  parameters: { viewport: 390 },
};

/** On a phone: the caption under the cards, below the first screen. */
export const HintCaptionPhone = {
  args: { hint: "caption" },
  parameters: { viewport: 390 },
};

/** Their words typed: Caw peeks over Social, the cards in today's section hues. */
export const HuesSection = {
  args: { hint: "title", words: PR_TEAM, hues: "section" },
};

/** Their words typed: every glyph in the muted ink. */
export const HuesInk = {
  args: { hint: "title", words: PR_TEAM, hues: "ink" },
};

/** Their words typed and Social tapped: only the tapped card's glyph in coral. */
export const HuesPicked = {
  args: { hint: "title", words: PR_TEAM, hues: "picked", tapped: "social" },
};

/** The hub has not listed the machines yet: nothing is claimed about them. */
export const Reading = { args: { hint: "title", fleet: "reading" } };

/** No machine has joined: the words stay, Send waits, Add machine is the way on. */
export const NoMachine = {
  args: { hint: "title", fleet: "none", words: PR_TEAM, hues: "ink" },
};

/** Machines joined, none online: Check machines. */
export const NoneOnline = {
  args: { hint: "title", fleet: "offline", words: PR_TEAM, hues: "ink" },
};

/** The send never reached the hub: the words are back, with Send again. */
export const Unreached = {
  args: {
    hint: "title",
    words: PR_TEAM,
    hues: "ink",
    refusal: {
      reason: PROMPT_UNREACHED,
      again: true,
    },
  },
};

/** No machine, on a phone. */
export const NoMachinePhone = {
  args: { hint: "title", fleet: "none", words: PR_TEAM, hues: "ink" },
  parameters: { viewport: 390 },
};
