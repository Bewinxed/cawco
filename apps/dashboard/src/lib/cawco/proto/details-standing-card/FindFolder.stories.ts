/**
 * Find folder (Component Story Format 3, live components): the Standing
 * card's face for pointing a place at the folder the project is in now.
 * Type the folder, read what CawCo can tell of it and what follows, then
 * Point here.
 */
import {
  FIND_AWAY,
  FIND_CANT_TELL,
  FIND_EMPTY,
  FIND_MERGE,
  FIND_READING,
  FIND_REFUSED,
  FIND_SAME,
  OBELISK_MISSING,
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
  title: "Project details/Find folder",
  component: StandingCardInShell,
  args: {
    ...AT_REST,
    face: "find",
    folders: OBELISK_MISSING,
    cantStart: { cause: "folder", placeId: "place-obelisk" },
  },
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** obelisk's missing folder found at its new path: the same repository. */
export const PointAtFolder = {
  from: "FolderMissing",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "find", find: FIND_SAME });
  },
};

/** On a smaller desk the folder and what follows stand side by side. */
export const PointAtFolderSmallerDesk = { ...SMALLER_DESK };

/** On a phone, one column, Point here pinned to the sheet's foot. */
export const PointAtFolderOnPhone = { ...PHONE };

/** Nothing typed yet, so Point here waits. */
export const NothingTyped = { args: { typed: "", find: FIND_EMPTY } };

/** Reading the folder typed. */
export const ReadingTyped = { args: { find: FIND_READING } };

/** CawCo can't tell whether it's this project, so the pick is yours; the old folder stays on disk. */
export const CantTell = { args: { find: FIND_CANT_TELL } };

/** obelisk is away: the change waits until it can read the folder. */
export const MachineAway = { args: { find: FIND_AWAY } };

/** The folder is another project's repository: the two become one, and you pick which remains. */
export const TwoProjects = { args: { find: FIND_MERGE } };

/** obelisk can't read the folder: what was typed stays, with the next step. */
export const FindRefused = { args: { find: FIND_REFUSED } };
