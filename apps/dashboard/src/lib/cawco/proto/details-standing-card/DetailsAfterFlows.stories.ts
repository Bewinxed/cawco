/**
 * The Standing card's details as a flow hands back to them (Component Story
 * Format 3, live components): tied to a tracker, a folder found, a folder
 * moved. Each place or line shows its new standing.
 */
import { FIND_TYPED, FIRST_SYNC } from "./fixtures/records";
import { AT_REST, type StoryPlay, seedStores } from "./fixtures/stories";
import StandingCardInShell from "./standing-card-in-shell.svelte";

export default {
  title: "Project details/Details: after a flow",
  component: StandingCardInShell,
  args: AT_REST,
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Just tied to GitHub Issues: the first sync is under way. */
export const FirstSync = {
  args: { tracker: FIRST_SYNC },
  from: "TieGithub",
  play: async ({ update }: StoryPlay) => {
    await update({ face: "details", tracker: FIRST_SYNC });
  },
};

/** Found: obelisk's place points at the folder it was moved to. */
export const FolderFound = {
  args: {
    project: {
      ...AT_REST.project,
      places: AT_REST.project.places.map((one) =>
        one.id === "place-obelisk" ? { ...one, path: FIND_TYPED } : one
      ),
    },
  },
  from: "PointAtFolder",
  play: async ({ update }: StoryPlay) => {
    await update({
      face: "details",
      folders: AT_REST.folders,
      cantStart: null,
      project: {
        ...AT_REST.project,
        places: AT_REST.project.places.map((one) =>
          one.id === "place-obelisk" ? { ...one, path: FIND_TYPED } : one
        ),
      },
    });
  },
};

/** Moved: obelisk's place is now on nixbox, in its new folder. */
export const MovedToNixbox = {
  args: {
    project: {
      ...AT_REST.project,
      places: AT_REST.project.places.map((one) =>
        one.id === "place-obelisk"
          ? { ...one, machineId: AT_REST.to.machineId, path: AT_REST.to.folder }
          : one
      ),
    },
  },
  from: "MoveProven",
  play: async ({ update }: StoryPlay) => {
    await update({
      face: "details",
      project: {
        ...AT_REST.project,
        places: AT_REST.project.places.map((one) =>
          one.id === "place-obelisk"
            ? {
                ...one,
                machineId: AT_REST.to.machineId,
                path: AT_REST.to.folder,
              }
            : one
        ),
      },
    });
  },
};
