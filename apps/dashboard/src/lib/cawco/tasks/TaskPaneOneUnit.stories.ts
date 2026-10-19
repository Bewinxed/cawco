/**
 * PROPOSED: the task pane as one unit (taskpane advisor §1): the title,
 * one group of chips, one session row, the tabs Review · Session · Details
 * · Activity, the decision pinned at its foot with More. Its six states and
 * its Session tab, on a desk (the side card beside the board) and on a
 * phone (its own page).
 */
import PaneRoom from "./preview/PaneRoom.svelte";
import {
  historyOf,
  STAGES,
  sessionNameOf,
  TAILS,
  TOOLS,
  viewOf,
} from "./preview/tidewater";
import TaskPaneOneUnit from "./TaskPaneOneUnit.svelte";

const desk = () => ({ Component: PaneRoom, props: { height: 820 } });
const phone = () => ({ Component: PaneRoom, props: { height: 844 } });
const pane = (
  taskId: string,
  onPhone = false,
  tab: "review" | "session" | "details" | "activity" | null = null
) => ({
  args: {
    task: viewOf(taskId),
    history: historyOf(taskId).events,
    tail: TAILS[taskId] ?? [],
    tool: TOOLS[taskId] ?? null,
    page: onPhone,
    tab,
  },
  decorators: [onPhone ? phone : desk],
  parameters: { viewport: onPhone ? "phone" : 440 },
});

export default {
  title: "Task pane/One unit",
  component: TaskPaneOneUnit,
  args: { stages: STAGES, nameOf: sessionNameOf },
};

/** Desk · In Review: the result on the card, no lines around it; Approve, Send back and More pinned at the foot. */
export const Review = pane("tsk-16");
/** Desk · In Review, its Session tab: the session that handed it in, with Open. */
export const ReviewSession = pane("tsk-16", false, "session");
/** Desk · Working: "Working" said once, on the stage; the Session tab with its plan, last words and composer. */
export const Working = pane("tsk-14");
/** Desk · To do: no session row; Details with a glyph by each heading. */
export const ToDo = pane("tsk-19");
/** Desk · Done: what it handed in; no foot. */
export const Done = pane("tsk-12");
/** Desk · Failed: how it ended under the session; Try again and More pinned. */
export const Failed = pane("tsk-21");
/** Desk · The hub couldn't start it: its words whole under the chips; Try again and More pinned. */
export const CantStart = pane("tsk-20");
/** Phone · In Review: the decision pinned over the safe area. */
export const PhoneReview = pane("tsk-16", true);
/** Phone · Working: the Session tab lists its sessions, with Open. */
export const PhoneWorking = pane("tsk-14", true);
/** Phone · To do. */
export const PhoneToDo = pane("tsk-19", true);
/** Phone · Done. */
export const PhoneDone = pane("tsk-12", true);
/** Phone · Failed. */
export const PhoneFailed = pane("tsk-21", true);
/** Phone · The hub couldn't start it. */
export const PhoneCantStart = pane("tsk-20", true);
