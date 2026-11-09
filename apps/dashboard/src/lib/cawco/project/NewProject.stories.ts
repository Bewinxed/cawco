/**
 * New project (Component Story Format 3, live components), with the
 * person's own first words: the personal PR team that fits no template,
 * typed on the live fleet (2026-11-02). The meta's args are every story's;
 * a story's own args are what it changes.
 */
import { PROMPT_UNREACHED } from "#lib/platform/hub-read.js";
import NewProject from "./NewProject.svelte";

const PR_TEAM =
  "set up a new project to be my personal PR team, you will handle my personal tasks, job hunts, social media and others, visa applications and travel. the aim is to propel me into wealth";

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
  },
  parameters: { viewport: 1440 },
};

/** Arriving: the placeholder types each example once, then rests on "A repo, a launch, a job hunt…". */
export const Arriving = {};

/** On a phone, arriving. */
export const ArrivingPhone = { parameters: { viewport: 390 } };

/** Their words in the field: nothing types, the field is theirs; Caw peeks over Social as a hint. */
export const WithWords = { args: { words: PR_TEAM } };

/** Their words, and Social tapped: the frame on it, the only pick. */
export const Tapped = { args: { words: PR_TEAM, tapped: "social" } };

/** Reduced motion, or a hidden tab: the resting words, still. */
export const Still = { args: { still: true } };

/** The hub has not listed the machines yet: nothing is claimed about them. */
export const Reading = { args: { fleet: "reading" } };

/** No machine has joined: the words stay, Send waits, Add machine is the way on. */
export const NoMachine = { args: { fleet: "none", words: PR_TEAM } };

/** Machines joined, none online: Check machines. */
export const NoneOnline = { args: { fleet: "offline", words: PR_TEAM } };

/** The send never reached the hub: the words are back, with Send again. */
export const Unreached = {
  args: {
    words: PR_TEAM,
    refusal: { reason: PROMPT_UNREACHED, again: true },
  },
};

/** No machine, on a phone. */
export const NoMachinePhone = {
  args: { fleet: "none", words: PR_TEAM },
  parameters: { viewport: 390 },
};
