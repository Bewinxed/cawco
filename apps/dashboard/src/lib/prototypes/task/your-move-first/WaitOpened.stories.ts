/**
 * What a task waits on, opened (Component Story Format 3, live): from
 * tsk-226's wait row, the task it waits on (tsk-18) swaps into its place,
 * Back returning to the wait row; while it reads, its skeleton stands in
 * place; a wait whose task the hub can't find says so on its row, with
 * Re-point and Remove. The meta's args are every story's.
 */
import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
import { waitingLook } from "./fixtures/moments";
import type { Play } from "./fixtures/moves";
import { waitedOn, waiting } from "./fixtures/tasks";
import TaskPage from "./TaskPage.svelte";

const DESK = { viewport: 1440 };
const PHONE = { viewport: 390 };
const TASK_WAIT = waiting.waits.find((wait) => wait.kind === "task")?.href;

export default {
  title: "Task/Your move first · what it waits on",
  component: TaskPage,
  args: {
    task: waiting,
    looking: waitingLook,
    layer: "wait",
    waitTask: waitedOn,
  },
};

/** tsk-18 opened in tsk-226's place: 28 tasks wait on it; Back returns to the wait. */
export const WaitOpened = { parameters: PHONE };

/** tsk-226 before its wait is opened. */
export const WaitRow = { args: { layer: "none" }, parameters: PHONE };

/** Open it pressed on the task wait: tsk-18 swaps in. */
export const WaitOpens = {
  parameters: PHONE,
  from: "WaitRow",
  play: async (context: Play) => {
    const row = context.canvas.querySelector('[data-wait="task"]');
    const open = row?.querySelector("button");
    if (open) {
      await context.userEvent.click(open);
    }
  },
};

/** The same, on a desk: tsk-18 in two columns, its Unblocks list folded after five. */
export const WaitOpenedDesk = { parameters: DESK };

/** tsk-18 is being read: its skeleton stands in tsk-226's place. */
export const WaitLoading = { args: { waitLoad: "loading" }, parameters: PHONE };

/** Back pressed: tsk-226 again, at its waits. */
export const BackToWait = {
  args: { layer: "none" },
  parameters: PHONE,
  from: "WaitOpened",
  play: async ({ canvas, userEvent }: Play) => {
    await userEvent.click(
      canvas.getByRole("button", { name: words.waits.backTo(waiting.title) })
    );
  },
};

/** The hub can't find the task a wait points at: the row says so, with Re-point and Remove. */
export const WaitMissing = {
  name: "Wait's task not in the project",
  tags: ["failure"],
  args: { layer: "none", missingWait: TASK_WAIT },
  parameters: PHONE,
};

/** The wait's task not found, on a desk: the row says so, with Re-point and Remove. */
export const WaitMissingDesk = {
  args: { layer: "none", missingWait: TASK_WAIT },
  parameters: DESK,
};

/** tsk-18 being read in tsk-226's place, on a desk. */
export const WaitLoadingDesk = {
  args: { waitLoad: "loading" },
  parameters: DESK,
};
