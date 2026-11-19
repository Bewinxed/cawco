/**
 * A project's details as a card hung from the head's place mark (Option 1,
 * Standing card, of the details' structure; Component Story Format 3, live
 * components): over the project's page as the app draws it, the rail and
 * the board live around it; the bottom sheet on a phone. A press on the
 * place mark puts it away and brings it back; a pick in it is asked, then
 * in force once the stand-in hub answers; Move, Find folder and a tracker's
 * tile open their own face of the card.
 */
import {
  ACCOUNTS,
  CONNECTIONS,
  FIND_TYPED,
  FIRST_SYNC,
  KEPT_HERE,
  NOTES_ONLY,
  OBELISK_MISSING,
  READ_AT,
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
  title: "Project details/Details",
  component: StandingCardInShell,
  args: AT_REST,
  beforeEach: seedStores,
  parameters: { viewport: 1440 },
};

/** Checking how Atlas site is set to run: where it lives, where its tasks and finished work go, and the account it runs on. */
export const HowItRuns = {};

/** On a smaller desk the card covers most of the board, and still needs no scroll. */
export const HowItRunsSmallerDesk = { ...SMALLER_DESK };

/** On a phone the details rise as a sheet over the board. */
export const HowItRunsOnPhone = { ...PHONE };

/** The hub hasn't said yet: each fact waits in its own shape. */
export const Reading = { args: { reading: true } };

/** A project with no code and no machine, in a fleet with no accounts yet. */
export const NotesOnly = {
  args: {
    project: NOTES_ONLY,
    folders: {},
    tracker: KEPT_HERE,
    accounts: [],
  },
};

/** The tracker didn't read: Tasks kept says why and offers to read again. */
export const TrackerUnread = {
  args: {
    tracker: { unread: "GitHub answered 502 (bad gateway)." },
  },
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

/** The hub is out of reach: what shows was read at 14:02, and nothing can change. */
export const HubAway = {
  args: { cantStart: { cause: "hub", readAt: READ_AT } },
};

/** Nothing can start: obelisk's folder is missing, and Find folder fixes it. */
export const FolderMissing = {
  args: {
    folders: OBELISK_MISSING,
    cantStart: { cause: "folder", placeId: "place-obelisk" },
  },
};

/** Nothing can start: Northwind team is signed in on no machine. */
export const AccountSignedOut = {
  args: {
    accounts: ACCOUNTS.map((one) =>
      one.id === "acc-northwind" ? { ...one, signedIn: false } : one
    ),
    cantStart: { cause: "account", accountId: "acc-northwind" },
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

/** obelisk's folder is moving to nixbox: its row shows the step, and a press reopens it. */
export const MoveUnderWay = {
  args: {
    moving: {
      placeId: "place-obelisk",
      step: "Copy",
      progress: "31,004 of 48,210 files",
    },
  },
};

/** Tasks are kept in CawCo alone. */
export const KeptHere = { args: { tracker: KEPT_HERE } };

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
