/**
 * A stage's column on the task board (Component Story Format 3, live
 * components), on the project's own tasks: `tasks.fixtures.ts` holds 60 of
 * them as records_fixture wrote them, newest first, trimmed and redacted.
 * The flow is the column filling and its cards being worked: empty, the
 * first task arriving, a few, picked for a move, moving, and the hub
 * refusing one; each step plays the move into it from the one before. The
 * drop target's states stand in a machine of their own, and the whole
 * stage's list is one story, its count and order the dials'.
 */

import type { StageKind } from "@cawco/core/views";
import type { TaskSummary } from "../project-tasks";
import TaskColumn from "./TaskColumn.svelte";
import { TASKS } from "./tasks.fixtures";

/** A stage's kind as its name says it, for the cards' glyph. */
const KIND_OF: Record<string, StageKind> = {
  ready: "todo",
  working: "active",
  review: "you",
  done: "done",
  dropped: "dropped",
};

/** A fixture's record as the board lists it: the card reads its title, stage, labels and to-dos; nothing has run. */
const summaryOf = (record: (typeof TASKS)[number]): TaskSummary => ({
  id: record.id,
  number: Number(record.id.replace(/\D/gu, "").slice(0, 4)) || 0,
  path: `tasks/${record.id}.md`,
  title: record.title,
  stage: record.stage ?? "ready",
  kind: KIND_OF[record.stage ?? ""] ?? "todo",
  labels: [...record.labels],
  type: record.priority,
  todos: { ...record.todos },
  createdAt: record.createdAt ?? 0,
  updatedAt: record.updatedAt ?? 0,
  createdBy: null,
  updatedBy: null,
  archivedAt: null,
  startedAt: null,
  completedAt: null,
  droppedAt: null,
  closeReason: null,
  needsYou: false,
  attempts: [],
  liveAttempt: false,
  waits: [],
  heldBy: null,
  ready: true,
  parts: [],
  unblocks: [],
  builtOn: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  queuedStart: false,
  startProblem: null,
  waitsOn: [],
  partOf: null,
  foundIn: null,
  duplicateOf: null,
  rank: null,
  links: [],
  outputs: [],
  fields: {},
  problem: null,
});

/** The project's tasks, every one the fixture holds. */
const ALL = TASKS.map(summaryOf);
const ready = ALL.filter((task) => task.stage === "ready");
const FIRST = ready.slice(0, 1);
const FEW = ready.slice(0, 5);
const PICKED = new Set(FEW.slice(1, 3).map((task) => task.id));
const MOVING = FEW[1]?.id ?? "";
const REFUSED = FEW[2]?.id ?? "";

/** The hub's refusal of a move, in its own words (tasks.ts `moveTask`). */
const refusal = {
  reason: "Ready → Working needs an attempt: start one from the task.",
  again: () => undefined,
};

export default {
  title: "Tasks/Task column",
  component: TaskColumn,
  args: {
    label: "Ready",
    kind: "todo",
    cards: [],
    hrefOf: (id: string) => `#${id}`,
    dateOf: () => null,
    onopen: () => undefined,
  },
  parameters: { viewport: 320 },
};

/** Ready holds no task: its name and kind, no count. */
export const Empty = {};

/** The first task arrives: its card lands, the count comes in. */
export const Arrived = {
  args: { cards: FIRST },
  from: "Empty",
  play: async ({ update }: { update: (next: object) => Promise<void> }) =>
    await update({ cards: FIRST }),
};

/** Four more come in under it: the column grows and the count rolls on. */
export const Several = {
  args: { cards: FEW },
  from: "Arrived",
  play: async ({ update }: { update: (next: object) => Promise<void> }) =>
    await update({ cards: FEW }),
};

/** Two are picked for a move: each card on the selection wash, its tick beside it. */
export const Picked = {
  args: {
    cards: FEW,
    picking: true,
    picked: (id: string) => PICKED.has(id),
    onpick: () => undefined,
  },
  from: "Several",
  play: async ({ update }: { update: (next: object) => Promise<void> }) =>
    await update({
      picking: true,
      picked: (id: string) => PICKED.has(id),
      onpick: () => undefined,
    }),
};

/** The first picked one moves: dimmed, "Moving…" under it while the hub writes its file. */
export const Moving = {
  args: {
    cards: FEW,
    picking: true,
    picked: (id: string) => PICKED.has(id),
    onpick: () => undefined,
    moving: (id: string) => id === MOVING,
  },
  from: "Picked",
  play: async ({ update }: { update: (next: object) => Promise<void> }) =>
    await update({ moving: (id: string) => id === MOVING }),
};

/** The hub refuses the other: its reason under the card, with Try again. */
export const Refused = {
  args: {
    cards: FEW,
    refused: (id: string) => (id === REFUSED ? refusal : null),
  },
  from: "Moving",
  play: async ({ update }: { update: (next: object) => Promise<void> }) =>
    await update({
      picking: false,
      moving: () => false,
      refused: (id: string) => (id === REFUSED ? refusal : null),
    }),
};

/** A card dragged over it: the column takes the hover's fill, ready for the drop. */
export const Over = { args: { cards: FEW, over: true } };

/** A stage closed to drops (its kind takes none): the column dims. */
export const Closed = { args: { cards: FEW, closed: true } };

/** Every task the fixture holds, the long titles among them: the column scrolls its own under the edge fade. */
export const Many = { args: { cards: ALL } };

/** Its cards couldn't be read: the column has no list to draw, and says so where it stands. */
export const CardsUnread = { args: { cards: null } };
