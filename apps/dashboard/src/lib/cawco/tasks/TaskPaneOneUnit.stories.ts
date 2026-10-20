/**
 * PROPOSED: the task pane as one unit (taskpane advisor §1): the title,
 * one group of chips, one session row, the tabs Review · Session · Details
 * · Activity, the decision right under what it decides on, with More. Its six states and
 * its Session tab, on a desk (the side card beside the board) and on a
 * phone (its own page).
 */
import PaneRoom from "./preview/PaneRoom.svelte";
import {
  ASKED,
  historyOf,
  STAGES,
  sessionNameOf,
  sessionPlaceOf,
  TAILS,
  TOOLS,
  viewOf,
} from "./preview/tidewater";
import TaskPaneOneUnit from "./TaskPaneOneUnit.svelte";

type Tab = "review" | "session" | "details" | "activity" | null;
const desk = () => ({ Component: PaneRoom, props: { height: 820 } });
const phone = () => ({ Component: PaneRoom, props: { height: 844 } });
/** `asks`: its agent's decision at the foot, with the review. */
const argsOf = (taskId: string, page: boolean, tab: Tab, asks: boolean) => ({
  task: viewOf(taskId),
  history: historyOf(taskId).events,
  tail: TAILS[taskId] ?? [],
  tool: TOOLS[taskId] ?? null,
  page,
  tab,
  asked: asks ? (ASKED[taskId] ?? null) : null,
});
const pane = (taskId: string, tab: Tab = null, asks = false) => ({
  args: argsOf(taskId, false, tab, asks),
  decorators: [desk],
});
const phonePane = (taskId: string, asks = false) => ({
  args: argsOf(taskId, true, null, asks),
  decorators: [phone],
});

export default {
  title: "Task pane/One unit",
  component: TaskPaneOneUnit,
  args: { stages: STAGES, nameOf: sessionNameOf, placeOf: sessionPlaceOf },
};

// Each viewport is a literal on the export itself: the canvas reads it from the source.

/** Desk · In Review: the result on the card, no lines around it; Approve, Send back and More right under it. */
export const Review = { ...pane("tsk-16"), parameters: { viewport: 440 } };
/** Desk · In Review, its agent asking a decision: its own three options over Approve, Send back and More. */
export const ReviewAsks = {
  ...pane("tsk-16", null, true),
  parameters: { viewport: 440 },
};
/** Desk · In Review, its Session tab: the session that handed it in, with Open. */
export const ReviewSession = {
  ...pane("tsk-16", "session"),
  parameters: { viewport: 440 },
};
/** Desk · Working: "Working" said once, on the stage; the Session tab with its plan, last words and composer. */
export const Working = { ...pane("tsk-14"), parameters: { viewport: 440 } };
/** Desk · To do: no session row; Details with a glyph by each heading. */
export const ToDo = { ...pane("tsk-19"), parameters: { viewport: 440 } };
/** Desk · Done: what it handed in; no foot. */
export const Done = { ...pane("tsk-12"), parameters: { viewport: 440 } };
/** Desk · Failed: how it ended under the session; Try again and More under it. */
export const Failed = { ...pane("tsk-21"), parameters: { viewport: 440 } };
/** Desk · The hub couldn't start it: its words whole under its stage; Try again and More under it. */
export const CantStart = { ...pane("tsk-20"), parameters: { viewport: 440 } };
/** Phone · In Review: the decision right under the review, clear of the safe area. */
export const PhoneReview = {
  ...phonePane("tsk-16"),
  parameters: { viewport: "phone" },
};
/** Phone · In Review, its agent asking a decision over Approve and Send back. */
export const PhoneReviewAsks = {
  ...phonePane("tsk-16", true),
  parameters: { viewport: "phone" },
};
/** Phone · Working: the Session tab reads the session in place: its plan, last turns and composer. */
export const PhoneWorking = {
  ...phonePane("tsk-14"),
  parameters: { viewport: "phone" },
};
/** Phone · To do. */
export const PhoneToDo = {
  ...phonePane("tsk-19"),
  parameters: { viewport: "phone" },
};
/** Phone · Done. */
export const PhoneDone = {
  ...phonePane("tsk-12"),
  parameters: { viewport: "phone" },
};
/** Phone · Failed. */
export const PhoneFailed = {
  ...phonePane("tsk-21"),
  parameters: { viewport: "phone" },
};
/** Phone · The hub couldn't start it. */
export const PhoneCantStart = {
  ...phonePane("tsk-20"),
  parameters: { viewport: "phone" },
};
