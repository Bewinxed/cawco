/**
 * Each press on the live project details card, answered by the stand-in
 * hub as the product's calls are answered (my reading): the card mounted
 * as the live story mounts it (project-details-live.svelte), each story's
 * `play` making the press and its frame showing the answer.
 */
import { afterReads, type Press, presses, refused, settles } from "./plays";
import ProjectDetailsLive from "./project-details-live.svelte";

/** The stores the card reads, taken so each frame's stand-in writes its own. */
async function ownStores(): Promise<void> {
  await Promise.all([
    import("../../stores/board.svelte"),
    import("../../stores/accounts.svelte"),
    import("../../stores/projects.svelte"),
    import("../../stores/moves.svelte"),
  ]);
}

export default {
  title: "Project details/Presses on the live card",
  component: ProjectDetailsLive,
  args: {
    situation: "all-well",
    answer: "yes",
    open: true,
    again: 0,
  },
  parameters: { viewport: 1024 },
};

const REVIEW = /Ask for review/u;
const SEPARATE = /Keep separate/u;
const COPY = /^Copy to computer$/u;
const LAB = /lab-nuc/u;
const FOLDER = /Folder/u;
const LINEAR = /Connect Linear/u;
const MORE = /More code details/u;
const MAIN_ROW = /^obelisk/u;
const WORK = /^One account$/u;

/** The card as it opens, the task list still being read. */
export const Opening = { beforeEach: ownStores };

/** The card has read the task list: GitHub Issues, up to date. */
export const Read = {
  beforeEach: ownStores,
  from: "Opening",
  play: settles(2000),
};

/** I picked Ask for review, and CawCo took it. */
export const ReviewPicked = {
  beforeEach: ownStores,
  from: "Opening",
  play: presses({ role: "radio", name: REVIEW, after: 2000 }),
};

/** I picked Keep separate, and CawCo refused it in its own words. */
export const SeparateRefused = {
  args: { answer: "refuse" },
  beforeEach: ownStores,
  from: "Opening",
  play: refused({ role: "radio", name: SEPARATE, after: 2000 }),
};

/** I opened the account picker: every account, signed in or not. */
export const AccountsListed = {
  beforeEach: ownStores,
  from: "Opening",
  play: presses({ role: "combobox", name: WORK, after: 800 }),
};

/** I pressed my main folder, and its acts opened under it. */
export const FolderActs = {
  beforeEach: ownStores,
  from: "Opening",
  play: presses({ role: "button", name: MAIN_ROW, after: 800 }),
};

/** Copy to computer's step opened, lab-nuc (no copy of the code yet) picked and a folder typed. */
const COPY_ASKED: Press[] = [
  { role: "button", name: COPY, after: 400 },
  { role: "radio", name: LAB, after: 100 },
  { role: "textbox", name: FOLDER, text: "~/code/hy", after: 1700 },
];

/** Copy to computer: lab-nuc and a folder named, and what will happen. */
export const CopyAsked = {
  beforeEach: ownStores,
  from: "Opening",
  play: presses(...COPY_ASKED),
};

/** I pressed Copy to computer in the step, and it runs. */
export const Copying = {
  beforeEach: ownStores,
  from: "Opening",
  play: presses(...COPY_ASKED, { role: "button", name: COPY, after: 1500 }),
};

/** I pressed Connect Linear: its step, with its sign-in and teams read. */
export const LinearStep = {
  beforeEach: ownStores,
  from: "Opening",
  play: afterReads({ role: "radio", name: LINEAR, after: 3000 }),
};

/** I opened More code details at the card's foot. */
export const MoreOpened = {
  beforeEach: ownStores,
  from: "Opening",
  play: presses({ role: "button", name: MORE, after: 1500 }),
};
