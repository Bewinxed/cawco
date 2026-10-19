/**
 * The task pane as it ships, in its six states, on a desk (the side card
 * beside the board) and on a phone (its own page). The tidewater fixtures
 * are a sailing school's booking site; PaneRoom gives the pane the room
 * the page gives it and answers its own two reads.
 */
import { movesFrom } from "../project-tasks";
import PaneRoom from "./preview/PaneRoom.svelte";
import { PROJECT, STAGES, TASKS, viewOf } from "./preview/tidewater";
import TaskPane from "./TaskPane.svelte";

const desk = () => ({ Component: PaneRoom, props: { height: 820 } });
const phone = () => ({ Component: PaneRoom, props: { height: 844 } });
const pane = (taskId: string, onPhone = false) => ({
  args: { taskId, page: onPhone },
  decorators: [onPhone ? phone : desk],
  parameters: { viewport: onPhone ? "phone" : 440 },
});

export default {
  title: "Task pane/Today",
  component: TaskPane,
  args: {
    projectId: PROJECT,
    stages: STAGES,
    tasks: TASKS,
    allowedFrom: (stage: string) => movesFrom(STAGES, stage),
    onmove: (id: string) => Promise.resolve(viewOf(id)),
    onchanged: () => undefined,
    onclose: () => undefined,
    onopen: () => undefined,
    backLabel: "Board",
  },
};

/** Desk · In Review: its review between two lines, Approve with a typed arrow. */
export const Today = pane("tsk-16");
/** Desk · Working: "Working" on the stage and again on a badge. */
export const Working = pane("tsk-14");
/** Desk · To do: the stage, dates and labels on one line, then Details. */
export const ToDo = pane("tsk-19");
/** Desk · Done. */
export const Done = pane("tsk-12");
/** Desk · Failed: Try again under the review. */
export const Failed = pane("tsk-21");
/** Desk · The hub couldn't start it: the reason down in Details. */
export const CantStart = pane("tsk-20");
/** Phone · In Review. */
export const PhoneReview = pane("tsk-16", true);
/** Phone · Working. */
export const PhoneWorking = pane("tsk-14", true);
/** Phone · To do. */
export const PhoneToDo = pane("tsk-19", true);
/** Phone · Done. */
export const PhoneDone = pane("tsk-12", true);
/** Phone · Failed. */
export const PhoneFailed = pane("tsk-21", true);
/** Phone · The hub couldn't start it. */
export const PhoneCantStart = pane("tsk-20", true);
