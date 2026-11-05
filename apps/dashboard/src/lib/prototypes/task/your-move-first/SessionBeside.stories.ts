/**
 * A session opened from the task (Component Story Format 3, live): from
 * 900 up it stands beside the task, the task narrowing to one column with
 * Your move still on top; below 900 it opens in the task's place with
 * Back. tsk-218's session, which handed in its result, and tsk-142's,
 * working. The meta's args are every story's.
 */
import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
import { reviewLook, workingLook } from "./fixtures/moments";
import type { Play } from "./fixtures/moves";
import { review, working } from "./fixtures/tasks";
import TaskPage from "./TaskPage.svelte";

const DESK = { viewport: 1440 };
const PHONE = { viewport: 390 };

export default {
  title: "Task/Your move first · session beside",
  component: TaskPage,
  args: { task: review, looking: reviewLook, layer: "session" },
};

/** tsk-218's session beside its task: its last turn, the report it handed in. */
export const SessionBeside = { parameters: DESK };

/** The task before its session is opened. */
export const TaskAlone = { args: { layer: "none" }, parameters: DESK };

/** Open session pressed in the head: the session takes the right, the task one column. */
export const SessionOpens = {
  parameters: DESK,
  from: "TaskAlone",
  play: async ({ canvas, userEvent }: Play) => {
    await userEvent.click(
      canvas.getByRole("button", { name: words.head.openSession })
    );
  },
};

/** The transcript is being read: its skeleton stands where the turn will. */
export const SessionLoading = {
  args: { sessionLoad: "loading" },
  parameters: DESK,
};

/** The session stopped answering: said in its pane with Try again; the task stays as it was. */
export const SessionStoppedAnswering = {
  name: "Session stopped answering",
  tags: ["failure"],
  args: { sessionLoad: "error" },
  parameters: DESK,
};

/** tsk-142's working session beside its task, its last turn the first attempt's headline. */
export const WorkingSessionBeside = {
  args: { task: working, looking: workingLook },
  parameters: DESK,
};

/** On a phone the session opens in the task's place, Back returning to it. */
export const SessionInPlace = { parameters: PHONE };

export const SessionInPlaceLoading = {
  args: { sessionLoad: "loading" },
  parameters: PHONE,
};

export const SessionInPlaceStoppedAnswering = {
  args: { sessionLoad: "error" },
  parameters: PHONE,
};
