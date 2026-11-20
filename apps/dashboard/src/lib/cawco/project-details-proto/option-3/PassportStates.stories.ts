/**
 * Option 3's Passport in each situation the hub can put it in, for my own
 * reading: the live page (passport-live.svelte) with each stop of its
 * situation dial, the Passport open, and the bar with it put away.
 */
import { seedShell } from "./board-fixture-seed";
import PassportLive from "./passport-live.svelte";

export default {
  title: "Option 3/Passport, each situation",
  component: PassportLive,
  args: { situation: "All in order", opened: true },
  parameters: { viewport: 1440 },
  beforeEach: seedShell,
};

/** The board as I left it, the Passport put away and Details in the bar. */
export const PassportAway = { args: { opened: false } };

/** Something is in trouble, so Details carries a count before I open it. */
export const TroubleCounted = {
  args: { opened: false, situation: "A folder is missing" },
};

/** nixbox's folder is gone, and Find folder stands first on its row. */
export const FolderMissing = { args: { situation: "A folder is missing" } };

/** The account is signed out everywhere, so nothing in the project can start. */
export const SignedOut = { args: { situation: "Signed out everywhere" } };

/** The project's rule file didn't read, so every choice comes to me. */
export const RuleFileUnreadable = {
  args: { situation: "Rule file unreadable" },
};

/** GitHub refused the sync, in its own words. */
export const TrackerRefused = { args: { situation: "The tracker refused" } };

/** The hub is still reading who decides, the account and the tracker. */
export const StillReading = { args: { situation: "Still reading" } };

/** The hub is out of reach, so what shows was read earlier. */
export const HubAway = { args: { situation: "Hub out of reach" } };

/** The laptop that holds a third place is away. */
export const MachineAway = { args: { situation: "A machine is away" } };

/** Six places, some with long paths. */
export const SixPlaces = { args: { situation: "Six places" } };

/** A project with no code: no repository, landing or large files to read. */
export const NotCode = { args: { situation: "Not a code project" } };
