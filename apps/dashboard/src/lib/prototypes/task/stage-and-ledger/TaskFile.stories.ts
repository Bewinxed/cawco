/**
 * File in the strip (Component Story Format 3, live components): the
 * strip's second page, the stage staying beside it so the brief is read
 * against the result, the attempt or the wait map. Every edit is a commit
 * the hub makes: a field shows the hub's version once it answers, and a
 * refusal stays beside it. On a phone File is the drawer's second page.
 */
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import { type Play, press } from "./play";
import { droppedTask, NOW, shapeTask, waitingTask } from "./records";
import TaskScreen from "./TaskScreen.svelte";

/** What the person writes for tsk-205's acceptance criteria. */
const CRITERIA =
  "A pin anchored on words that change with the view's width (a zoom percent, a clock) stays on its element at 390, 680 and 1440";

const SAVED = { ...shapeTask, acceptance: [CRITERIA] };

const REFUSED =
  "tsk-205's file changed since it was read (Continue CawCo open tasks, 11:58). Read it again, then save.";

export default {
  title: "Task/File in the strip",
  component: TaskScreen,
  args: { task: waitingTask, now: NOW.judge, pane: "file" },
};

/** File open for tsk-226: its brief beside the wait map, ready requires every wait settled. */
export const FileBesideWaits = { parameters: { viewport: 1440 } };

/** File for tsk-205, filed by hand with no acceptance criteria, ready and not started. */
export const Shaping = {
  args: { task: shapeTask },
  parameters: { viewport: 1440 },
};

/** Writing its acceptance criteria. */
export const Writing = {
  args: { task: shapeTask, writing: true, draft: CRITERIA },
  parameters: { viewport: 1440 },
  from: "Shaping",
  play: async (context: Play) => {
    await press(context, words.addAcceptance);
    await context.update({ writing: true, draft: CRITERIA });
  },
};

/** Save pressed: the hub makes the commit, the field held until it answers. */
export const Saving = {
  args: { task: shapeTask, writing: true, draft: CRITERIA, save: "saving" },
  parameters: { viewport: 1440 },
  from: "Writing",
  play: async (context: Play) => {
    await press(context, words.saveAcceptance);
    await context.update({ save: "saving" });
  },
};

/** The hub's version of the criteria, and the commit it made. */
export const Saved = {
  args: { task: SAVED, writing: false, save: "saved", savedAs: "e83b1f07a" },
  parameters: { viewport: 1440 },
  from: "Saving",
  play: async ({ update }: Play) => {
    await update({
      task: SAVED,
      writing: false,
      save: "saved",
      savedAs: "e83b1f07a",
    });
  },
};

/** The hub refused the save: its words beside the field, what was written kept. */
export const SaveRefused = {
  args: {
    task: shapeTask,
    writing: true,
    draft: CRITERIA,
    save: "refused",
    fileRefusal: REFUSED,
  },
  parameters: { viewport: 1440 },
  tags: ["failure"],
};

/** A dropped task's file: read only, Reopen to change what an attempt reads. */
export const ClosedFile = {
  args: { task: droppedTask },
  parameters: { viewport: 1440 },
};

/** The file not read yet: its skeleton in the strip. */
export const FileLoading = {
  args: { fileLoading: true },
  parameters: { viewport: 1440 },
};

/** On a phone: File as the drawer's second page, full height. */
export const FilePhone = {
  args: { task: shapeTask, stop: "full" },
  parameters: { viewport: 390 },
};
