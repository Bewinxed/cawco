/**
 * New project (Component Story Format 3, live components), with the
 * person's own first words: the personal PR team that fits no template. The
 * meta's args are every story's; a story's own args are what it changes.
 * The `Examples*` and `Hues*` stories are the options of the decision page
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

/** Today: a still placeholder, "A repo, a launch, a job hunt…". */
export const ExamplesNone = {};

/** The placeholder types one example after another, round and round, while the field is empty. */
export const ExamplesLoop = { args: { examples: "loop" } };

/** The placeholder types each example once, then lands on its resting words. */
export const ExamplesOnce = { args: { examples: "once" } };

/** Their words in the field: nothing types, the field is theirs. */
export const ExamplesWithWords = { args: { examples: "loop", words: PR_TEAM } };

/** Reduced motion, or a hidden tab: the resting words, still. */
export const ExamplesStill = { args: { examples: "loop", still: true } };

/** On a phone: the examples typing. */
export const ExamplesLoopPhone = {
  args: { examples: "loop" },
  parameters: { viewport: 390 },
};

/** Their words typed: Caw peeks over Social, the cards in today's section hues. */
export const HuesSection = {
  args: { words: PR_TEAM, hues: "section" },
};

/** Their words typed: every glyph in the muted ink. */
export const HuesInk = {
  args: { words: PR_TEAM, hues: "ink" },
};

/** Their words typed and Social tapped: only the tapped card's glyph in coral. */
export const HuesPicked = {
  args: { words: PR_TEAM, hues: "picked", tapped: "social" },
};

/** The hub has not listed the machines yet: nothing is claimed about them. */
export const Reading = { args: { fleet: "reading" } };

/** No machine has joined: the words stay, Send waits, Add machine is the way on. */
export const NoMachine = {
  args: { fleet: "none", words: PR_TEAM, hues: "ink" },
};

/** Machines joined, none online: Check machines. */
export const NoneOnline = {
  args: { fleet: "offline", words: PR_TEAM, hues: "ink" },
};

/** The send never reached the hub: the words are back, with Send again. */
export const Unreached = {
  args: {
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
  args: { fleet: "none", words: PR_TEAM, hues: "ink" },
  parameters: { viewport: 390 },
};
