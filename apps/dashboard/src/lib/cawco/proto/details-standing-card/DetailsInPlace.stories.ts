/**
 * The Standing card's details as a change is made where it stands
 * (Component Story Format 3, live components): a pick asked of the hub and
 * its refusal, a place added or dropped, tasks taken back to CawCo, large
 * files given one address. Each opens from the details at rest.
 */
import { CONNECTIONS, READ_AT } from "./fixtures/records";
import { AT_REST, type StoryPlay, seedStores } from "./fixtures/stories";
import StandingCardInShell from "./standing-card-in-shell.svelte";

export default {
  title: "Project details/Details: changed in place",
  component: StandingCardInShell,
  args: AT_REST,
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Branch was picked: it waits for the hub while PR stays in force. */
export const BranchAsked = {
  args: { change: { setting: "lands", state: "asked", value: "branch" } },
  from: "HowItRuns",
  play: async ({ update }: StoryPlay) => {
    await update({
      change: { setting: "lands", state: "asked", value: "branch" },
    });
  },
};

/** The hub refused Branch: PR stays, the reason under it with Try again. */
export const BranchRefused = {
  args: {
    change: {
      setting: "lands",
      state: "refused",
      value: "branch",
      reason:
        "The hub couldn't save it: the projects table is locked by a migration (SQLITE_BUSY). PR is still in force.",
    },
  },
};

/** Adding nixbox as another place, its folder already there. */
export const AddingPlace = {
  args: {
    opened: {
      kind: "add-place",
      draft: {
        machineId: "m-nixbox",
        folder: "/srv/work/northwind-studio/atlas-site",
        copy: false,
      },
    },
  },
  from: "HowItRuns",
  play: async ({ update }: StoryPlay) => {
    await update({
      opened: {
        kind: "add-place",
        draft: {
          machineId: "m-nixbox",
          folder: "/srv/work/northwind-studio/atlas-site",
          copy: false,
        },
      },
    });
  },
};

/** Copying the project to nixbox instead: the original stays, secrets stay behind. */
export const CopyingThere = {
  args: {
    opened: {
      kind: "add-place",
      draft: {
        machineId: "m-nixbox",
        folder: "/srv/work/northwind-studio/atlas-site",
        copy: true,
      },
    },
  },
};

/** nixbox was added, and the hub read its repository. */
export const PlaceAdded = {
  args: {
    project: {
      ...AT_REST.project,
      places: [
        ...AT_REST.project.places,
        {
          createdAt: new Date(READ_AT).toISOString(),
          id: "place-nixbox",
          isPrimary: false,
          kind: "checkout",
          machineId: "m-nixbox",
          path: "/srv/work/northwind-studio/atlas-site",
          projectId: AT_REST.project.id,
          within: [],
        },
      ],
    },
    learned: {
      placeId: "place-nixbox",
      repository: "northwind-studio/atlas-site",
    },
  },
};

/** Dropping the MacBook's place: asked on its row, the folder stays on disk. */
export const DropAsked = {
  args: { opened: { kind: "drop", placeId: "place-mbp" } },
  from: "HowItRuns",
  play: async ({ update }: StoryPlay) => {
    await update({ opened: { kind: "drop", placeId: "place-mbp" } });
  },
};

/** CawCo was picked while tied: asked beside the tiles, the links let go. */
export const BackToCawco = {
  args: { opened: { kind: "back-to-cawco" } },
  from: "HowItRuns",
  play: async ({ update }: StoryPlay) => {
    await update({ opened: { kind: "back-to-cawco" } });
  },
};

/** Large files at one address: typed, and the storage connection that signs in. */
export const OneAddress = {
  args: {
    opened: {
      kind: "lfs-address",
      url: "https://lfs.northwind.studio/atlas",
      connection: "r2-assets",
    },
    connections: CONNECTIONS,
  },
  from: "HowItRuns",
  play: async ({ update }: StoryPlay) => {
    await update({
      opened: {
        kind: "lfs-address",
        url: "https://lfs.northwind.studio/atlas",
        connection: "r2-assets",
      },
    });
  },
};
