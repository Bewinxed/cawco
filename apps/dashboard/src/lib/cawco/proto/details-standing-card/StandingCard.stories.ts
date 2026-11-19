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
  KEPT_HERE,
  NOTES_ONLY,
  OBELISK_MISSING,
  READ_AT,
} from "./fixtures/records";
import { AT_REST, seedStores } from "./fixtures/stories";
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

/** On a shorter screen the card still stands whole, with no scroll. */
export const ShortScreen = { args: { frame: "short" } };

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
