/**
 * The project details card in each situation the person opens it in (my
 * reading): the top line and the four sections as the hub's answers leave
 * them. Each frame is the live card, hung from the head's place mark.
 */

import DetailsCardLive from "./details-card-live.svelte";
import { presses } from "./plays";

export default {
  title: "Project details/The card",
  component: DetailsCardLive,
  args: {
    situation: "all-well",
    view: "card",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const DONE = /^Done$/u;
const FILES = /Files and locations/u;
const REVIEW = /Ask for review/u;
const REFRESH = /Refresh now/u;
const MAIN_ROW = /obelisk/u;

/** Everything is fine: agents can start, my four picks in full ink. */
export const AllWell = {};

/** The card opens at once with every section's name while the details are still read. */
export const Reading = { args: { situation: "reading" } };

/** My main folder is gone, so no agent can start, and the top line says where. */
export const MainMissing = { args: { situation: "main-missing" } };

/** The folder on studio-mac is missing; agents still start in the main one. */
export const ExtraMissing = { args: { situation: "extra-missing" } };

/** studio-mac is off, so its folder shows what was read at 14:02. */
export const ComputerAway = { args: { situation: "computer-away" } };

/** The Work account is signed out, so nothing can start until I sign in. */
export const SignedOut = { args: { situation: "signed-out" } };

/** GitHub stopped taking updates, and the task list says why in GitHub's words. */
export const TasksRefused = { args: { situation: "tasks-refused" } };

/** The task list's standing couldn't be read this time. */
export const ReadFailed = { args: { situation: "read-failed" } };

/** Files are moving to studio-mac, and the card says so on top and on the folder. */
export const Moving = { args: { situation: "moving" } };

/** obelisk stopped answering: what shows is from 14:02 and nothing can be changed. */
export const Unreachable = { args: { situation: "unreachable" } };

/** A writing project with no code and no AI account signed in yet. */
export const NoCode = { args: { situation: "no-code" } };

/** I asked for review on finished code and the hub hasn't taken it yet. */
export const ReviewWaiting = { args: { view: "handoff-waiting" } };

/** The hub said no to keeping code separate, and says why under it. */
export const ReviewRefused = { args: { view: "handoff-refused" } };

/** Done pressed: the card folds back into the place mark. */
export const Closed = {
  args: { open: false },
  from: "AllWell",
  play: presses({ role: "button", name: DONE, after: 600 }),
};

/** I pressed the section the top line names, and I'm taken to the missing folder's fix. */
export const JumpedToMissing = {
  from: "MainMissing",
  play: presses({ role: "button", name: FILES, after: 900 }),
};

/** I picked Ask for review: the row waits, then becomes the chosen one. */
export const ReviewTaken = {
  from: "AllWell",
  play: presses({ role: "radio", name: REVIEW, after: 1500 }),
};

/** I pressed Refresh now: the task list updates and is up to date again. */
export const Refreshed = {
  from: "TasksRefused",
  play: presses({ role: "button", name: REFRESH, after: 1800 }),
};

/** I pressed my main folder and its acts open under it. */
export const FolderOpened = {
  args: { view: "folder-open" },
  from: "AllWell",
  play: presses({ role: "button", name: MAIN_ROW, after: 600 }),
};
