/**
 * A task opened from the board on a desk (Component Story Format 3, live
 * components): the stage beside the ledger strip, at 1440 and at 900 where
 * the strip stands at its narrowest. Every task is Cawco-Dev's own, read on
 * 5 Nov 2026 (records.ts); a story showing an earlier day sets `now` to it.
 * The flows move one live screen: Pass on to landed, Send back asking in
 * the page, a refusal, a wait opened in place, a session's ask answered.
 */
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import { approve, type Play, press, pressLast } from "./play";
import {
  answeredAsk,
  commentResultTask,
  designGraphTask,
  droppedTask,
  gitAsk,
  idleTask,
  judgeTask,
  landedTask,
  NOW,
  READ_AT,
  stoppedTask,
  waitingTask,
  workingTask,
} from "./records";
import TaskScreen from "./TaskScreen.svelte";

/** The hub's refusal of Pass on, in its words: another change to the file landed first. */
const REFUSED =
  "tsk-142 couldn't be moved: another change to its file landed first (Continue CawCo open tasks, 12:00). Read the task again, then pass it on.";

export default {
  title: "Task/On a desk",
  component: TaskScreen,
  args: { task: judgeTask, now: NOW.judge },
};

/** Waiting on you: the page tsk-142's session handed in, whole, what to check at its foot, the moves leading the strip. */
export const Judge = { parameters: { viewport: 1440 } };

/** Pass on pressed: the move waits on the hub, nothing posted ahead of it. */
export const PassingOn = {
  args: { move: "passing" },
  parameters: { viewport: 1440 },
  from: "Judge",
  play: async (context: Play) => {
    await pressLast(context, words.passOn);
    await context.update({ move: "passing" });
  },
};

/** The hub took the approval: Now reads landing until the hub says it landed. */
export const Landing = {
  args: { move: "landing" },
  parameters: { viewport: 1440 },
  from: "PassingOn",
  play: async ({ update }: Play) => {
    await update({ move: "landing" });
  },
};

/** Landed on main: the task in done, the stage showing what landed. */
export const Landed = {
  args: { task: landedTask, move: "landed", now: READ_AT + 60_000 },
  parameters: { viewport: 1440 },
  from: "Landing",
  play: async ({ update }: Play) => {
    await update({ task: landedTask, move: "landed", now: READ_AT + 60_000 });
  },
};

/** Send back pressed: its question unfolds under the moves, focus on Cancel. */
export const SendBackAsks = {
  args: {
    asking: true,
    note: "Show me the queued row live on the phone before I pass this on.",
  },
  parameters: { viewport: 1440 },
  from: "Judge",
  play: async (context: Play) => {
    await context.update({
      note: "Show me the queued row live on the phone before I pass this on.",
    });
    await pressLast(context, words.sendBack);
  },
};

/** The hub refused Pass on: its words stay under the moves, with the moves still open. */
export const PassOnRefused = {
  args: { move: "refused", refusal: REFUSED },
  parameters: { viewport: 1440 },
  tags: ["failure"],
  from: "PassingOn",
  play: async ({ update }: Play) => {
    await update({ move: "refused", refusal: REFUSED });
  },
};

/** The hub isn't answering: the last read stays, marked stale, and the moves wait. */
export const HubNotLive = {
  args: { stale: READ_AT - 7 * 60_000 },
  parameters: { viewport: 1440 },
  tags: ["failure"],
};

/** A result known only from a comment: tsk-6 in review with no attempt behind it, two commits named. */
export const ResultFromComment = {
  args: { task: commentResultTask, now: NOW.commentResult },
  parameters: { viewport: 1440 },
};

/** Waiting: tsk-226 on the wait map, two open decisions and a task on one side, nothing on the other. */
export const Waits = {
  args: { task: waitingTask },
  parameters: { viewport: 1440 },
};

/** A wait opened in place: tsk-18 swapped into the stage, Back returns to tsk-226, 28 tasks waiting on it. */
export const WaitOpened = {
  args: { task: designGraphTask, back: waitingTask.title },
  parameters: { viewport: 1440 },
  from: "Waits",
  play: async (context: Play) => {
    await press(context, words.openWait(designGraphTask.title));
    await context.update({ task: designGraphTask, back: waitingTask.title });
  },
};

/** Working: tsk-142's first attempt mid-run on 26 Oct, three of seven steps ticked, two only offered. */
export const Working = {
  args: { task: workingTask, now: NOW.working },
  parameters: { viewport: 1440 },
};

/** The session asks: a git line its gate held stands at the top of the strip, Deny and Approve as peers. */
export const SessionAsks = {
  args: { task: workingTask, now: NOW.working, ask: gitAsk },
  parameters: { viewport: 1440 },
};

/** Approve pressed: the ask reads answered, and the session goes on. */
export const AskAnswered = {
  args: { task: workingTask, now: NOW.working, ask: answeredAsk },
  parameters: { viewport: 1440 },
  from: "SessionAsks",
  play: (context: Play) => approve(context, words.approve, answeredAsk),
};

/** In an active stage with nobody on it: tsk-135 since you moved it back on 26 Oct. */
export const NobodyOnIt = {
  args: { task: idleTask },
  parameters: { viewport: 1440 },
};

/** Its last attempt stopped: tsk-7 on 14 Oct, back in ready, Retry beside how it ended. */
export const Stopped = {
  args: { task: stoppedTask, now: NOW.stopped },
  parameters: { viewport: 1440 },
};

/** Retry pressed: a fresh attempt is asked for, the button pending until the hub answers. */
export const Retrying = {
  args: { task: stoppedTask, now: NOW.stopped, pending: true },
  parameters: { viewport: 1440 },
  from: "Stopped",
  play: async (context: Play) => {
    await press(context, words.retry);
    await context.update({ pending: true });
  },
};

/** Dropped: tsk-170, why, by whom and when, and Reopen in ready. */
export const Dropped = {
  args: { task: droppedTask },
  parameters: { viewport: 1440 },
};

/** Its history open: every change once, with clock time, who and why. */
export const HistoryOpen = {
  args: { historyOpen: true },
  parameters: { viewport: 1440 },
};

/** Before the first read: the skeleton stands at the stage's and the strip's size. */
export const Loading = {
  args: { task: null },
  parameters: { viewport: 1440 },
};

/** The long title, at the 900 line: the strip at its narrowest beside the result. */
export const JudgeAt900 = {
  parameters: { viewport: 900 },
};

/** The wait map at the 900 line: its three columns still side by side. */
export const WaitsAt900 = {
  args: { task: waitingTask },
  parameters: { viewport: 900 },
};
