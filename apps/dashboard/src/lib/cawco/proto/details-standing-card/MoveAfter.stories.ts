/**
 * Move, after (Component Story Format 3, live components): the Standing
 * card's face once a move has ended: what was proven, where each
 * conversation stands, and anything left behind.
 */
import {
  RESULT_CALLED_OFF,
  RESULT_LEFT,
  RESULT_PROVEN,
} from "./fixtures/records";
import {
  AT_REST,
  PHONE,
  SMALLER_DESK,
  type StoryPlay,
  seedStores,
} from "./fixtures/stories";
import StandingCardInShell from "./standing-card-in-shell.svelte";

export default {
  title: "Project details/Move: after",
  component: StandingCardInShell,
  args: { ...AT_REST, face: "move-after" },
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Moved and proven: every file and the commit, every conversation running in the new folder. */
export const MoveProven = {
  from: "Copying",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "move-after", result: RESULT_PROVEN });
  },
};

/** On a smaller desk the proof reads first, the sessions under it. */
export const MoveProvenSmallerDesk = { ...SMALLER_DESK };

/** On a phone the proof fills the sheet, Done at its foot. */
export const MoveProvenOnPhone = { ...PHONE };

/** Moved, with .env.local left behind and one conversation that didn't resume. */
export const LeftBehind = { args: { result: RESULT_LEFT } };

/** Called off: the partial copy removed, sessions back in the old folder. */
export const CalledOff = {
  args: { result: RESULT_CALLED_OFF },
  from: "Copying",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "move-after", result: RESULT_CALLED_OFF });
  },
};
