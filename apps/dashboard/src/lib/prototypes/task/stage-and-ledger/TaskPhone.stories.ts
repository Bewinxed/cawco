/**
 * A task opened from the board on a phone (Component Story Format 3, live
 * components): the stage full-bleed as the task's own scroller, the ledger
 * a drawer peeking from the foot. Its handle carries Send back and Pass on
 * at its two ends, or Deny and Approve while the session asks, so a thumb
 * judges without opening it. The same Cawco-Dev tasks as on a desk.
 */
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import { approve, type Play, press, pressLast } from "./play";
import {
  answeredAsk,
  droppedTask,
  gitAsk,
  judgeTask,
  landedTask,
  NOW,
  READ_AT,
  stoppedTask,
  waitingTask,
  workingTask,
} from "./records";
import TaskScreen from "./TaskScreen.svelte";

const REFUSED =
  "tsk-142 couldn't be moved: another change to its file landed first (Continue CawCo open tasks, 12:00). Read the task again, then pass it on.";

export default {
  title: "Task/On a phone",
  component: TaskScreen,
  args: { task: judgeTask, now: NOW.judge },
};

/** Waiting on you: the handed-in page full-bleed, the drawer's handle holding Send back and Pass on. */
export const JudgePhone = { parameters: { viewport: 390 } };

/** The drawer dragged up: the note, who takes it up, Now, who did it, attempts, history and File. */
export const LedgerOpen = {
  args: { stop: "full" },
  parameters: { viewport: 390 },
  from: "JudgePhone",
  play: async (context: Play) => {
    await press(context, words.drawerNext);
  },
};

/** Pass on pressed on the handle: pending until the hub answers. */
export const PassingOnPhone = {
  args: { move: "passing" },
  parameters: { viewport: 390 },
  from: "JudgePhone",
  play: async (context: Play) => {
    await pressLast(context, words.passOn);
    await context.update({ move: "passing" });
  },
};

/** Landed: the handle's word says done, the stage shows what landed. */
export const LandedPhone = {
  args: { task: landedTask, move: "landed", now: READ_AT + 60_000 },
  parameters: { viewport: 390 },
  from: "PassingOnPhone",
  play: async ({ update }: Play) => {
    await update({ move: "landing" });
    await update({ task: landedTask, move: "landed", now: READ_AT + 60_000 });
  },
};

/** Send back on the handle: the drawer rises with the question under the note. */
export const SendBackAsksPhone = {
  args: { asking: true, stop: "full" },
  parameters: { viewport: 390 },
  from: "JudgePhone",
  play: async (context: Play) => {
    await pressLast(context, words.sendBack);
  },
};

/** The hub refused Pass on: its words under the handle, the moves still open. */
export const RefusedPhone = {
  args: { move: "refused", refusal: REFUSED, stop: "full" },
  parameters: { viewport: 390 },
  tags: ["failure"],
};

/** The session asks: the handle carries Deny and Approve instead of the moves. */
export const SessionAsksPhone = {
  args: { task: workingTask, now: NOW.working, ask: gitAsk },
  parameters: { viewport: 390 },
};

/** Approve pressed on the handle: the drawer's word goes back to Working. */
export const AskAnsweredPhone = {
  args: { task: workingTask, now: NOW.working, ask: answeredAsk },
  parameters: { viewport: 390 },
  from: "SessionAsksPhone",
  play: (context: Play) => approve(context, words.approve, answeredAsk),
};

/** Working: the live attempt full-bleed, its plan ticking. */
export const WorkingPhone = {
  args: { task: workingTask, now: NOW.working },
  parameters: { viewport: 390 },
};

/** Waiting: the wait map stacked, what it waits on above this task. */
export const WaitsPhone = {
  args: { task: waitingTask },
  parameters: { viewport: 390 },
};

/** Its last attempt stopped: Retry on the stage. */
export const StoppedPhone = {
  args: { task: stoppedTask, now: NOW.stopped },
  parameters: { viewport: 390 },
};

/** Dropped: the reason, and Reopen in ready. */
export const DroppedPhone = {
  args: { task: droppedTask },
  parameters: { viewport: 390 },
};

/** The hub isn't answering: the last read, marked stale; the moves wait. */
export const HubNotLivePhone = {
  args: { stale: READ_AT - 7 * 60_000, stop: "full" },
  parameters: { viewport: 390 },
  tags: ["failure"],
};

/** Before the first read: the skeleton stage, the handle saying only that it reads. */
export const LoadingPhone = {
  args: { task: null },
  parameters: { viewport: 390 },
};
