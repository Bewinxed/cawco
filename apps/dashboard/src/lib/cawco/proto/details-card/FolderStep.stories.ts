/**
 * The folder step, the card's body become Move files, Locate folder,
 * Connect existing folder or Copy to computer (my reading): before it runs,
 * while it runs, and after.
 */
import DetailsCardLive from "./details-card-live.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/Folder step",
  component: DetailsCardLive,
  args: {
    situation: "all-well",
    view: "move-ready",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const STUDIO = /studio-mac/u;
const FOLDER = /Folder/u;
const MOVE = /^Move files$/u;

/** Moving my main folder to studio-mac: what will happen and who is working there. */
export const MoveReady = {};

/** Nothing picked yet: the step waits for a computer and a folder. */
export const MoveEmpty = { args: { view: "move-empty" } };

/** studio-mac is being checked before anything is said. */
export const MoveChecking = { args: { view: "move-checking" } };

/** That folder is a scratch folder, so the move can't run, and it says what to do. */
export const MoveBlocked = { args: { view: "move-blocked" } };

/** The move is copying files, and I can still call it off. */
export const MoveRunning = { args: { view: "move-running" } };

/** studio-mac went away mid-move; the move holds and nothing is removed. */
export const MoveWaiting = { args: { view: "move-waiting" } };

/** The check failed for want of room, in rsync's own words, and I can try that stage again. */
export const MoveFailed = { args: { view: "move-failed" } };

/** The move is done: what was checked, each agent running again, and what stayed behind. */
export const MoveAfter = { args: { view: "move-after" } };

/** Pointing the project at where my main folder is now. */
export const LocateReady = {
  args: { view: "locate-ready", situation: "main-missing" },
};

/** Linking a folder on render-box that already has these files. */
export const ConnectReady = { args: { view: "connect-ready" } };

/** Copying the saved code to studio-mac, the original untouched. */
export const CopyReady = { args: { view: "copy-ready" } };

/** I picked studio-mac and typed the folder: it checks, then says what will happen. */
export const DestinationPicked = {
  from: "MoveEmpty",
  play: presses(
    { role: "radio", name: STUDIO, after: 200 },
    {
      role: "textbox",
      name: FOLDER,
      text: "~/code/clients/hyucksfield",
      after: 2200,
    }
  ),
};

/** I pressed Move files: the stages take the place of the groups. */
export const MoveStarted = {
  args: { view: "move-running" },
  from: "MoveReady",
  play: presses({ role: "button", name: MOVE, after: 1500 }),
};
