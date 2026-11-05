/**
 * Send back and Drop, asked in the page (Component Story Format 3, live):
 * the question unfolds under the control that asked it (Send back under
 * the pair at the result's foot; Drop, from More, under the head), the
 * verb pending until the hub answers, a refusal kept in the tile, and the
 * tile closing only on a move that went. tsk-218 is sent back; tsk-168 is
 * dropped with the reason it really was. The meta's args are every story's.
 */
import { yourMoveFirstWords as words } from "@cawco/core/words/proto-your-move-first";
import { reviewLook } from "./fixtures/moments";
import { movedByYou, type Play, press, unanswered } from "./fixtures/moves";
import { dropped, review } from "./fixtures/tasks";
import type { TaskRead } from "./fixtures/types";
import TaskPage from "./TaskPage.svelte";

const DESK = { viewport: 1440 };
const PHONE = { viewport: 390 };
const NOTE =
  "tsk-207's pi check isn't shown run. Start it with start_session and paste its output.";

/** tsk-218 sent back to ready by you, your note its reason. */
const sentBack = movedByYou(review, "ready", "todo", reviewLook.now, NOTE);
/** tsk-168 on 31 Oct before it was dropped: in ready, its card still open. */
const beforeDrop: TaskRead = {
  ...dropped,
  stage: "ready",
  kind: "todo",
  closeReason: null,
  closedAt: null,
  closedBy: null,
  waits: dropped.waits.map((wait) => ({ ...wait, state: "open", flag: null })),
  history: dropped.history.filter((row) => row.stage?.to !== "dropped"),
};
/** The reason it was really dropped with (its history, 31 Oct 05:47). */
const DROP_WHY = dropped.closeReason ?? "";
const dropLook = {
  now: dropped.closedAt ?? dropped.createdAt,
  lastLooked: dropped.createdAt - 1,
};
/** tsk-168 dropped by you, with that reason. */
const droppedNow = movedByYou(
  beforeDrop,
  "dropped",
  "dropped",
  dropLook.now,
  DROP_WHY
);

export default {
  title: "Task/Your move first · asked in the page",
  component: TaskPage,
  args: { task: review, looking: reviewLook },
};

/** Send back asked under the pair: where it goes and who takes it up there, your note with it. */
export const SendBackAsked = {
  args: { layer: "sendBack", note: NOTE },
  parameters: PHONE,
};

/** The review before Send back is pressed. */
export const BeforeSendBack = { args: { note: NOTE }, parameters: PHONE };

/** Send back pressed under the result: the question unfolds in the page. */
export const SendBackOpens = {
  args: { layer: "sendBack", note: NOTE },
  parameters: PHONE,
  from: "BeforeSendBack",
  play: async (context: Play) => {
    await press(context, '[data-slot="peers"]', "Send back");
  },
};

/** The same question on a desk, under the pair in the left column. */
export const SendBackAskedDesk = {
  args: { layer: "sendBack", note: NOTE },
  parameters: DESK,
};

/** Send back pressed in the tile; the hub has not answered yet. */
export const SendingBack = {
  args: { layer: "sendBack", note: NOTE, pending: "sendBack" },
  parameters: PHONE,
  from: "SendBackAsked",
  play: async (context: Play) => {
    await press(context, '[data-slot="ask-here"]', "Send back");
    await context.update({ pending: "sendBack" });
  },
};

/** The hub didn't answer (502): the question stays open with the reason inside it. */
export const SendBackUnanswered = {
  name: "Hub didn't answer",
  tags: ["failure"],
  args: { layer: "sendBack", note: NOTE, refusal: unanswered("review") },
  parameters: PHONE,
  from: "SendingBack",
  play: async ({ update }: Play) => {
    await update({ pending: null, refusal: unanswered("review") });
  },
};

/** The hub moved it to ready: the tile closes, the move is the newest change since you looked. */
export const SentBack = {
  args: { task: sentBack, layer: "none" },
  parameters: PHONE,
  from: "SendingBack",
  play: async ({ update }: Play) => {
    await update({ pending: null, layer: "none", note: "", task: sentBack });
  },
};

/** Sent back, on a desk: tsk-218 in ready, the move the newest change. */
export const SentBackDesk = {
  args: { task: sentBack },
  parameters: DESK,
};

/** Drop… chosen in More on tsk-168: the question unfolds under the head, a reason asked. */
export const DropAsked = {
  args: {
    task: beforeDrop,
    looking: dropLook,
    layer: "drop",
    dropReason: DROP_WHY,
  },
  parameters: PHONE,
};

/** Drop asked on a desk, under the head across the page. */
export const DropAskedDesk = {
  args: {
    task: beforeDrop,
    looking: dropLook,
    layer: "drop",
    dropReason: DROP_WHY,
  },
  parameters: DESK,
};

/** Drop task pressed; the hub has not answered yet. */
export const Dropping = {
  args: {
    task: beforeDrop,
    looking: dropLook,
    layer: "drop",
    dropReason: DROP_WHY,
    pending: "drop",
  },
  parameters: PHONE,
  from: "DropAsked",
  play: async (context: Play) => {
    await press(context, '[data-slot="ask-here"]', words.drop.confirm);
    await context.update({ pending: "drop" });
  },
};

/** The hub dropped it: the tile closes and Your move says why, by whom, and Reopen. */
export const DroppedNow = {
  args: { task: droppedNow, looking: dropLook },
  parameters: PHONE,
  from: "Dropping",
  play: async ({ update }: Play) => {
    await update({ pending: null, layer: "none", task: droppedNow });
  },
};
