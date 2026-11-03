/**
 * A project's page in its first minutes (Component Story Format 3, live
 * components), with the personal PR team's records: the wait after Send
 * (Caw names it at about 8 s, writes first at about 13 s, opens the setup
 * page at about 121 s, as measured on the live fleet), the board before
 * the setup page is sent, and where a canvas of his opens. Each group is
 * one card of the decision page `onboarding-design`; a story's own args are
 * what it changes.
 */

import ProjectStart from "./ProjectStart.svelte";

export default {
  title: "Onboarding/Project start",
  component: ProjectStart,
  args: { beat: "drafting", wait: "steps", board: "empty" },
  parameters: { viewport: 1440 },
};

/** About 60 s in: Caw's steps tick in his panel, the board says it isn't set up yet. */
export const StepsDrafting = {};

/** The moment after Send: their words are the first message, the rail says New project while it is named. */
export const Sent = { args: { beat: "sent" } };

/** About 8 s: the name morphs into the rail and the head. */
export const Named = { args: { beat: "named" } };

/** About 13 s, steps: his first words, then the setup's steps. */
export const StepsSpoke = { args: { beat: "spoke" } };

/** About 13 s, today: his first words, then each call as the harness reports it. */
export const StreamSpoke = { args: { beat: "spoke", wait: "stream" } };

/** About 60 s, today: six calls, the last still running. */
export const StreamDrafting = { args: { wait: "stream" } };

/** About 13 s, one line: his first words, then one breathing line. */
export const LineSpoke = { args: { beat: "spoke", wait: "line" } };

/** About 60 s, one line: it says what he is on now. */
export const LineDrafting = { args: { wait: "line" } };

/** On a phone, about 60 s, steps: the panel is the sheet over the board. */
export const StepsDraftingPhone = {
  args: { phone: true },
  parameters: { viewport: 390 },
};

/** The setup page open, today: the code template's stages stand in on the board. */
export const BoardStandin = { args: { beat: "page", board: "standin" } };

/** The setup page open: the board says it isn't set up yet, with the way back to the page. */
export const BoardEmpty = { args: { beat: "page", board: "empty" } };

/** The setup page open: the board draws the page's draft stages, marked as a draft. */
export const BoardDraft = { args: { beat: "page", board: "draft" } };

/** A canvas of his opened: in his panel, widened over the board. */
export const ArtifactPanel = { args: { beat: "set", artifact: "panel" } };

/** A canvas of his opened: in the board's place, his panel beside it. */
export const ArtifactMain = { args: { beat: "set", artifact: "main" } };

/** A canvas of his opened: on his conversation's own page. */
export const ArtifactSession = { args: { beat: "set", artifact: "session" } };
