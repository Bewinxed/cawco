/**
 * The task pane's sheet (project redesign): today's pane in its six states,
 * on a desk (the side card beside the board) and on a phone (its own page);
 * then the proposed pane (TaskPaneOneUnit: the title, one chip group, one
 * session row, the tabs Review · Session · Details · Activity, the decision
 * pinned at its foot with More) in the same states, its Session tab shown
 * for a task in Review too. The tidewater fixtures are a sailing school's
 * booking site; PaneRoom gives each the room the page gives it.
 */
import { movesFrom } from "../project-tasks";
import TaskPane from "./TaskPane.svelte";
import TaskPaneOneUnit from "./TaskPaneOneUnit.svelte";
import PaneRoom from "./preview/PaneRoom.svelte";
import {
  historyOf,
  PROJECT,
  sessionNameOf,
  STAGES,
  TAILS,
  TASKS,
  TOOLS,
  viewOf,
} from "./preview/tidewater";

const DESK = { viewport: 440 };
const PHONE = { viewport: "phone" };
const deskRoom = () => ({ Component: PaneRoom, props: { height: 820 } });
const phoneRoom = () => ({ Component: PaneRoom, props: { height: 844 } });

const today = (taskId: string, phone = false) => ({
  args: { taskId, page: phone },
  decorators: [phone ? phoneRoom : deskRoom],
  parameters: phone ? PHONE : DESK,
});
const proposed = (
  taskId: string,
  phone = false,
  tab: "review" | "session" | "details" | "activity" | null = null
) => ({
  component: TaskPaneOneUnit,
  args: {
    task: viewOf(taskId),
    stages: STAGES,
    history: historyOf(taskId).events,
    tail: TAILS[taskId] ?? [],
    tool: TOOLS[taskId] ?? null,
    nameOf: sessionNameOf,
    page: phone,
    tab,
  },
  decorators: [phone ? phoneRoom : deskRoom],
  parameters: phone ? PHONE : DESK,
});

export default {
  title: "Project redesign/Task pane",
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

/** Desk · Today, to do: Ready, the dates and labels on one line, then Details. */
export const Today = today("tsk-19");
/** Desk · Today, working: "Working" twice, on the stage and on a badge. */
export const TodayWorking = today("tsk-14");
/** Desk · Today, in Review: the review's bands between two hairlines, Approve → Done typed. */
export const TodayReview = today("tsk-16");
/** Desk · Today, done: its review, no decision. */
export const TodayDone = today("tsk-12");
/** Desk · Today, failed: Try again under the review. */
export const TodayFailed = today("tsk-21");
/** Desk · Today, the hub couldn't start it: the reason in Details' Sessions. */
export const TodayCantStart = today("tsk-20");
/** Phone · Today, to do. */
export const TodayPhone = today("tsk-19", true);
/** Phone · Today, working. */
export const TodayPhoneWorking = today("tsk-14", true);
/** Phone · Today, in Review. */
export const TodayPhoneReview = today("tsk-16", true);
/** Phone · Today, done. */
export const TodayPhoneDone = today("tsk-12", true);
/** Phone · Today, failed. */
export const TodayPhoneFailed = today("tsk-21", true);
/** Phone · Today, the hub couldn't start it. */
export const TodayPhoneCantStart = today("tsk-20", true);

/** Desk · Proposed, to do: the stage once on its chip, no session row, Details open with glyph heads. */
export const ToDo = proposed("tsk-19");
/** Desk · Proposed, working: one "Working", on the session row; the Session tab with its plan, tail and composer. */
export const Working = proposed("tsk-14");
/** Desk · Proposed, in Review: the result on the card under the edge fade, no hairlines; Approve, Send back, More pinned. */
export const Review = proposed("tsk-16");
/** Desk · Proposed, in Review with its Session tab shown: the session that handed it in, Open at its head. */
export const ReviewSession = proposed("tsk-16", false, "session");
/** Desk · Proposed, done: what it handed in, no foot. */
export const Done = proposed("tsk-12");
/** Desk · Proposed, failed: the row in the fail ink with how it ended under it; Try again and More pinned. */
export const Failed = proposed("tsk-21");
/** Desk · Proposed, couldn't start: the hub's words whole under the chips; Try again and More pinned. */
export const CantStart = proposed("tsk-20");
/** Phone · Proposed, to do. */
export const PhoneToDo = proposed("tsk-19", true);
/** Phone · Proposed, working: the Session tab lists its sessions with Open. */
export const PhoneWorking = proposed("tsk-14", true);
/** Phone · Proposed, in Review: the decision pinned over the safe area. */
export const PhoneReview = proposed("tsk-16", true);
/** Phone · Proposed, done. */
export const PhoneDone = proposed("tsk-12", true);
/** Phone · Proposed, failed. */
export const PhoneFailed = proposed("tsk-21", true);
/** Phone · Proposed, couldn't start. */
export const PhoneCantStart = proposed("tsk-20", true);
