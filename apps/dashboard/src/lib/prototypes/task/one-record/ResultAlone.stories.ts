/**
 * The result on its own, on a phone (Component Story Format 3, live
 * components): opened from a hand-in, its own scroller, the head carrying
 * Send back and Pass on at its two ends so the moves stay in reach while
 * it is read, the checks strip at its foot. The records are the hub's
 * (fixtures.ts): tsk-142's second hand-in and tsk-218's.
 */
import { READ_AT, t142Review, t218Passed, t218Review } from "./fixtures";
import { answered, type Play, press, screenArgs } from "./plays";
import TaskRecord from "./TaskRecord.svelte";

const phone = { viewport: 390 };

export default {
  title: "Task/One record/Result on its own",
  component: TaskRecord,
  args: {
    ...screenArgs,
    view: t142Review,
    now: READ_AT,
    opened: { what: "result", entry: "r-fd8fbee7" },
  },
  parameters: phone,
};

/** The result whole, its report and its thirteen checks, the two moves in the head. */
export const ResultAlone = { parameters: phone };

/** One attempt's result, two of its five checks shown met. */
export const ResultAloneShort = {
  args: {
    view: t218Review,
    opened: { what: "result", entry: "r-67533cef" },
  },
  parameters: phone,
};

/** Pass on pressed from the head: the record comes back with the move as its newest entry. */
export const PassedFromResult = {
  args: { view: t218Passed, opened: null },
  parameters: phone,
  from: "ResultAloneShort",
  play: async (context: Play) => {
    await press(context, '[data-slot="record-head"]', "Pass on to done");
    await answered(context, "passOn", { view: t218Passed, opened: null });
  },
};

/** The result read on its way: a skeleton at the result's size. */
export const ResultReading = {
  args: { besideState: "loading" },
  parameters: phone,
};

/** The hub does not hold what was presented yet: its name, and Read again. */
export const ResultNotHeld = {
  args: { besideState: "missing" },
  parameters: phone,
  tags: ["failure"],
};
