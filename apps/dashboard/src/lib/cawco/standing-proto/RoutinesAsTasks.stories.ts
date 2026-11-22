/**
 * Routines as tasks that repeat (Component Story Format 3, live
 * components): CawCo Cloud's project page, where a routine is a task with a
 * trigger and an end rule. The Routines tab lists those tasks as outcomes,
 * the board holds them among the one-off tasks, one opens as the task page
 * with its runs, and New task asks how it repeats. Each story opens the same
 * live page in a different place; its strip's tabs, open buttons and New
 * task move between them.
 */
import { hubAs } from "../hub-stand-in";
import RoutinesAsTasks from "./routines-as-tasks-live.svelte";

export default {
  title: "Project/Routines as repeating tasks",
  component: RoutinesAsTasks,
  args: { view: "routines", open: null, adding: false, repeat: "never" },
  decorators: [hubAs("connected")],
  parameters: { viewport: 1440 },
};

/** What's true in the project now: two answers aren't known and need me, the rest are quiet. */
export const Routines = {};

/** The board, where the repeating tasks stand among the one-off work, each with its answer. */
export const Board = { args: { view: "board" } };

/** The docs check opened as a task: last night's sweep failed, and its earlier runs are folded. */
export const RepeatingTaskOpened = { args: { open: "tsk-176" } };

/** Starting a task that repeats every weekday, read back in words before I add it. */
export const NewRepeatingTask = {
  args: { view: "board", adding: true, repeat: "schedule" },
};
