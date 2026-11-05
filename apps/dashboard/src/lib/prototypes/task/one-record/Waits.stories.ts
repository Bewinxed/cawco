/**
 * The waits, opened from the state line's door (Component Story Format 3,
 * live components): each wait once, its kind, name, state word, settled or
 * not, own or inherited; beside the record from 900px, in its place on a
 * phone. Open it on a task wait swaps that task in. The records are the
 * hub's (fixtures.ts): tsk-226 waits on two decisions and a task; tsk-112
 * inherits its wait from tsk-27.
 */
import { READ_AT, t18, t18Missing, t112Dropped, t226Blocked } from "./fixtures";
import { type Play, press, screenArgs } from "./plays";
import TaskRecord from "./TaskRecord.svelte";

const waits = { what: "waits" } as const;
const otherTask = (task: typeof t18 | null) =>
  ({ what: "task", id: "tsk-18", task }) as const;

export default {
  title: "Task/One record/Waits",
  component: TaskRecord,
  args: {
    ...screenArgs,
    view: t226Blocked,
    now: READ_AT,
    opened: waits,
  },
};

/** Blocked on three waits, none settled: two decisions and a task, beside the record. */
export const WaitsBeside = { parameters: { viewport: 1440 } };

/** The same at 900, the waits sharing the width with the record. */
export const WaitsBesideAt900 = { parameters: { viewport: 900 } };

/** On a phone the waits stand in the record's place; Back returns to the task. */
export const WaitsInPlace = { parameters: { viewport: 390 } };

/** Open it on the task wait: the other task is read in the waits' place. */
export const TaskOpening = {
  args: { opened: otherTask(null) },
  parameters: { viewport: 1440 },
  from: "WaitsBeside",
  play: async (context: Play) => {
    await press(context, '[data-col="beside"]', "Open it");
    await context.update({ opened: otherTask(null) });
  },
};

/** The other task, as the hub read it, in the waits' place. */
export const TaskOpened = {
  args: { opened: otherTask(t18) },
  parameters: { viewport: 1440 },
  from: "TaskOpening",
  play: async ({ update, userEvent }: Play) => {
    await userEvent.wait(500);
    await update({ opened: otherTask(t18) });
  },
};

export const TaskOpenedPhone = {
  args: { opened: otherTask(t18) },
  parameters: { viewport: 390 },
  from: "WaitsInPlace",
  play: async (context: Play) => {
    await press(context, '[data-col="beside"]', "Open it");
    await context.update({ opened: otherTask(t18) });
  },
};

/** The wait's task is not in the project any more: only re-pointing or removing the wait helps. */
export const TaskNotInProject = {
  args: { opened: otherTask(t18Missing) },
  parameters: { viewport: 1440 },
  tags: ["failure"],
};

/** A wait inherited from the whole it is part of: it names where it came from and offers nothing to change. */
export const InheritedWait = {
  args: { view: t112Dropped },
  parameters: { viewport: 1440 },
};

export const InheritedWaitPhone = {
  args: { view: t112Dropped },
  parameters: { viewport: 390 },
};
