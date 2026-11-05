/**
 * The session beside the task (Component Story Format 3, live
 * components): from 900 up it stands third, the stage narrowed and the
 * strip kept; under 900 it opens in the task's place with Back. It never
 * stands over the task.
 */
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import { type Play, press } from "./play";
import { judgeTask, NOW } from "./records";
import TaskScreen from "./TaskScreen.svelte";

export default {
  title: "Task/Session beside",
  component: TaskScreen,
  args: { task: judgeTask, now: NOW.judge, session: "live" },
};

/** tsk-142's last session beside its result: the transcript third, the strip kept. */
export const SessionOpen = { parameters: { viewport: 1440 } };

/** The task before Open session: stage and strip alone. */
export const SessionClosed = {
  args: { session: "closed" },
  parameters: { viewport: 1440 },
};

/** Open session pressed: the transcript comes in beside, the stage narrows. */
export const SessionOpened = {
  args: { session: "live" },
  parameters: { viewport: 1440 },
  from: "SessionClosed",
  play: async (context: Play) => {
    await press(context, words.openSession);
  },
};

/** The transcript being read: its skeleton at its size. */
export const SessionReading = {
  args: { session: "loading" },
  parameters: { viewport: 1440 },
};

/** The session stopped answering: said in the panel, Retry, its place kept. */
export const SessionStoppedAnswering = {
  args: { session: "stopped" },
  parameters: { viewport: 1440 },
  tags: ["failure"],
};

/** On a phone: the session opens in the task's place, Back returning to it. */
export const SessionInPlacePhone = {
  parameters: { viewport: 390 },
};
