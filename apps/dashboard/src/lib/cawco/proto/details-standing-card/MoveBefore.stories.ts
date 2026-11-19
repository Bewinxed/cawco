/**
 * Move, before it starts (Component Story Format 3, live components): the
 * Standing card's face for moving a place's folder, over the project's page.
 * Name where it goes, read what that reaches and what is running there,
 * then Move.
 */
import {
  MOVE_AWAY,
  MOVE_PLAN,
  MOVE_READING,
  MOVE_REFUSED,
  MOVE_RENAME,
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
  title: "Project details/Move: before",
  component: StandingCardInShell,
  args: { ...AT_REST, face: "move-before" },
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Moving obelisk's folder to nixbox: a copy of 48,210 files, three conversations running there. */
export const WhereTo = {
  from: "HowItRuns",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "move-before", plan: MOVE_PLAN });
  },
};

/** On a smaller desk the move's face fills the card. */
export const WhereToSmallerDesk = { ...SMALLER_DESK };

/** On a phone the move's face fills the sheet, Move pinned to its foot. */
export const WhereToOnPhone = { ...PHONE };

/** The hub is still reading the folder, so no count shows yet. */
export const ReadingFolder = { args: { plan: MOVE_READING } };

/** A new folder on the same disk with nothing running: one rename, done at once. */
export const SameDisk = {
  args: {
    plan: MOVE_RENAME,
    to: {
      machineId: "m-obelisk",
      folder: "/home/sam/clients/northwind-studio/atlas-site",
    },
  },
};

/** nixbox is away, so what the copy reaches can't be checked yet. */
export const DestinationAway = { args: { plan: MOVE_AWAY } };

/** The folder named already holds files: Move can't merge, and says what to do. */
export const CantMove = { args: { plan: MOVE_REFUSED } };
