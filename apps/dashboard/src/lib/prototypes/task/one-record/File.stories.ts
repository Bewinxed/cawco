/**
 * The task's file, opened from the state line's door (Component Story
 * Format 3, live components): the brief as the next attempt reads it, how
 * it runs, what ready requires, Start attempt; Edit brief and Save brief,
 * each save a commit that comes back as a "Brief changed" entry. The
 * records are the hub's (fixtures.ts): tsk-218 as it was filed, tsk-233
 * done and read-only.
 */
import {
  READ_AT,
  T218_FILED_AT,
  t218BriefChanged,
  t218BriefRefused,
  t218Filed,
  t233Landed,
} from "./fixtures";
import { answered, type Play, press, screenArgs } from "./plays";
import TaskRecordSheet from "./TaskRecordSheet.svelte";

const file = { what: "file" } as const;
const editing = { what: "file", editing: true } as const;

export default {
  title: "Task/One record/File",
  component: TaskRecordSheet,
  args: {
    ...screenArgs,
    view: t218Filed,
    now: T218_FILED_AT,
    opened: file,
  },
};

/** The file beside the record: ready, every requirement met, Start attempt in reach. */
export const FileBeside = { parameters: { viewport: 1440 } };

/** On a phone the file stands in the record's place. */
export const FileInPlace = { parameters: { viewport: 390 } };

/** Edit brief pressed: the brief and its criteria in one field. */
export const EditingBrief = {
  args: { opened: editing },
  parameters: { viewport: 1440 },
  from: "FileBeside",
  play: async (context: Play) => {
    await press(context, '[data-col="beside"]', "Edit brief");
    await context.update({ opened: editing });
  },
};

export const EditingBriefPhone = {
  args: { opened: editing },
  parameters: { viewport: 390 },
};

/** Saved: the hub's commit is a new entry by you, and the file shows what it wrote. */
export const BriefChanged = {
  args: { view: t218BriefChanged },
  parameters: { viewport: 1440 },
  from: "EditingBrief",
  play: async (context: Play) => {
    await press(context, '[data-col="beside"]', "Save brief");
    await answered(context, "saveBrief", {
      view: t218BriefChanged,
      opened: file,
    });
  },
};

/** The save refused (502): the refusal beside the field, the words still in it. */
export const BriefRefused = {
  args: { view: t218BriefRefused, opened: editing },
  parameters: { viewport: 1440 },
  tags: ["failure"],
};

/** Start attempt pressed: pending until the hub answers. */
export const StartingAttempt = {
  args: { pending: "start" },
  parameters: { viewport: 1440 },
};

/** The file read on its way: its skeleton at the file's size. */
export const FileReading = {
  args: { besideState: "loading" },
  parameters: { viewport: 1440 },
};

/** A done task's file: read-only, since no session reads it again. */
export const FileReadOnly = {
  args: { view: t233Landed, now: READ_AT },
  parameters: { viewport: 1440 },
};
