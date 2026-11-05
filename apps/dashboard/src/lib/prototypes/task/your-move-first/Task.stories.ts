/**
 * The task page, "Your move first" (Component Story Format 3, live): one
 * page whose top block is chosen by the task's live state, drawn with
 * project Cawco-Dev's own tasks at moments they really stood in. Each state
 * at 1440 and 390; review, the state the page exists for, at 900 too. The
 * meta's args are every story's; a story's own args are what it changes.
 */
import { MINUTE_MS } from "@cawco/core/time";
import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
import {
  asking,
  doneLook,
  droppedLook,
  readyLook,
  reviewLook,
  stoppedLook,
  waitingLook,
  workingLook,
} from "./fixtures/moments";
import { movedByYou, type Play, press, unanswered } from "./fixtures/moves";
import {
  done,
  dropped,
  ready,
  review,
  stopped,
  waiting,
  working,
} from "./fixtures/tasks";
import TaskPage from "./TaskPage.svelte";

const DESK = { viewport: 1440 };
const PHONE = { viewport: 390 };

/** tsk-218 after Pass on: the hub moved it review → done at the story's clock. */
const passedOn = movedByYou(review, "done", "done", reviewLook.now);

export default {
  title: "Task/Your move first",
  component: TaskPage,
  args: { task: review, looking: reviewLook },
};

/** tsk-218 waits on you in review: its page drawn whole, what to check, the two moves at its foot. */
export const Review = { parameters: DESK };

/** The same review on a phone: one column, the result first under the head. */
export const ReviewPhone = { parameters: PHONE };

/** The same review at 900, beside the board: one column, Open session in the head's glass. */
export const ReviewAt900 = { parameters: { viewport: 900 } };

/** Pass on pressed; the hub has not answered yet. */
export const PassingOn = {
  args: { pending: "passOn" },
  parameters: DESK,
  from: "Review",
  play: async (context: Play) => {
    await press(context, '[data-slot="peers"]', "Pass on");
    await context.update({ pending: "passOn" });
  },
};

/** Pass on pending on a phone: the pair holds its place, the press spinning. */
export const PassingOnPhone = {
  args: { pending: "passOn" },
  parameters: PHONE,
};

/** The hub didn't answer the move (502): it stays in review, the reason under the pair. */
export const PassOnUnanswered = {
  name: "Hub didn't answer",
  tags: ["failure"],
  args: { refusal: unanswered("review") },
  parameters: DESK,
  from: "PassingOn",
  play: async ({ update }: Play) => {
    await update({ pending: null, refusal: unanswered("review") });
  },
};

/** The hub didn't answer, on a phone: the reason under the pair. */
export const PassOnUnansweredPhone = {
  args: { refusal: unanswered("review") },
  parameters: PHONE,
};

/** The hub moved it to done: Your move shows what landed, the move is the newest change. */
export const PassedOn = {
  args: { task: passedOn },
  parameters: DESK,
  from: "PassingOn",
  play: async ({ update }: Play) => {
    await update({ pending: null, task: passedOn });
  },
};

/** Passed on, on a phone: done on top, the move the newest change. */
export const PassedOnPhone = { args: { task: passedOn }, parameters: PHONE };

/** tsk-142's session asks a permission: its words, how long ago, Approve and Deny at the ends. */
export const Asking = {
  args: { task: asking, looking: workingLook },
  parameters: DESK,
};

/** The ask on a phone: Approve and Deny at the row's two ends, under the thumb. */
export const AskingPhone = {
  args: { task: asking, looking: workingLook },
  parameters: PHONE,
};

/** Approve pressed; the hub carries the answer to the session. */
export const Approving = {
  args: { task: asking, looking: workingLook, pending: "approve" },
  parameters: PHONE,
  from: "AskingPhone",
  play: async (context: Play) => {
    await press(context, '[data-slot="peers"]', words.move.approve);
    await context.update({ pending: "approve" });
  },
};

/** The answer reached the session: the block says when, and the session goes on. */
export const Answered = {
  args: {
    task: asking,
    looking: workingLook,
    answeredAt: workingLook.now,
  },
  parameters: PHONE,
  from: "Approving",
  play: async ({ update }: Play) => {
    await update({ pending: null, answeredAt: workingLook.now });
  },
};

/** tsk-142 working: one quiet line on top; the work shows the live attempt and ten offered to-dos. */
export const Working = {
  args: { task: working, looking: workingLook },
  parameters: DESK,
};

/** Working on a phone: the quiet line, then what changed since you looked. */
export const WorkingPhone = {
  args: { task: working, looking: workingLook },
  parameters: PHONE,
};

/** tsk-7's newest attempt stopped seconds in: how it ended, who heard, Retry. */
export const Stopped = {
  args: { task: stopped, looking: stoppedLook },
  parameters: DESK,
};

/** Stopped on a phone: how it ended and Retry, first under the head. */
export const StoppedPhone = {
  args: { task: stopped, looking: stoppedLook },
  parameters: PHONE,
};

/** Retry pressed: a fresh attempt is starting in the same workspace. */
export const Retrying = {
  args: { task: stopped, looking: stoppedLook, pending: "retry" },
  parameters: PHONE,
  from: "StoppedPhone",
  play: async (context: Play) => {
    await press(context, '[data-slot="stopped"]', words.move.retry);
    await context.update({ pending: "retry" });
  },
};

/** tsk-226 waits on two open decisions and a task: one quiet line, the waits each said once. */
export const Waiting = {
  args: { task: waiting, looking: waitingLook },
  parameters: DESK,
};

/** Waiting on a phone: the quiet line opens the waits below. */
export const WaitingPhone = {
  args: { task: waiting, looking: waitingLook },
  parameters: PHONE,
};

/** tsk-141 is ready and never attempted: nothing since you looked, no attempt yet. */
export const Ready = {
  args: { task: ready, looking: readyLook },
  parameters: DESK,
};

/** Ready on a phone, never attempted. */
export const ReadyPhone = {
  args: { task: ready, looking: readyLook },
  parameters: PHONE,
};

/** Brief & how it runs unfolded where it stands: the brief, ready requires, Start attempt. */
export const BriefOpen = {
  args: { task: ready, looking: readyLook, briefOpen: true },
  parameters: PHONE,
  from: "ReadyPhone",
  play: async (context: Play) => {
    await press(context, '[data-slot="group"]', words.brief.heading);
  },
};

/** Brief & how it runs unfolded on a desk, in the right column. */
export const BriefOpenDesk = {
  args: { task: ready, looking: readyLook, briefOpen: true },
  parameters: DESK,
};

/** tsk-239 done, its long title as filed: what landed, its page drawn whole. */
export const Done = {
  args: { task: done, looking: doneLook },
  parameters: DESK,
};

/** Done on a phone: the long title truncated in the head, whole in its tooltip and the brief. */
export const DonePhone = {
  args: { task: done, looking: doneLook },
  parameters: PHONE,
};

/** tsk-168 dropped: why, by whom, Reopen; its wait blocked for good since its page was deleted. */
export const Dropped = {
  args: { task: dropped, looking: droppedLook },
  parameters: DESK,
};

/** Dropped on a phone: why, by whom, Reopen. */
export const DroppedPhone = {
  args: { task: dropped, looking: droppedLook },
  parameters: PHONE,
};

/** Every change once, unfolded from Show all history. */
export const HistoryOpen = {
  args: { historyOpen: true },
  parameters: DESK,
  from: "Review",
  play: async (context: Play) => {
    await press(context, `[data-slot="group"]`, words.since.showAll);
  },
};

/** Before the first read: the skeleton at the page's real layout. */
export const Loading = { args: { task: null }, parameters: DESK };

/** Before the first read, on a phone. */
export const LoadingPhone = { args: { task: null }, parameters: PHONE };

/** The hub isn't answering: the last read stays, marked with when it was made. */
export const Stale = {
  name: "Hub not answering",
  args: { stale: reviewLook.now - 6 * MINUTE_MS },
  parameters: DESK,
};

/** The hub isn't answering, on a phone: the last read, marked. */
export const StalePhone = {
  args: { stale: reviewLook.now - 6 * MINUTE_MS },
  parameters: PHONE,
};
