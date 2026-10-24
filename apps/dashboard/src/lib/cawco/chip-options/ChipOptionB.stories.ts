/**
 * Chip Option B, the kind as a word (Component Story Format 3, live
 * components): today's inline chip led by a caps keycap naming its kind
 * (PIN 12, CARD, TASK, PLAN 3/7), its state the keycap's tint (the status
 * pair's fill and ink for live, needs you and failed), outline (a task not
 * started), tick (done) or presence dot (a machine); a session keeps its
 * tile and dot.
 * The meta's args are every story's; a story's own args are what it
 * changes. A scratch canvas for the owner's pick; nothing in the app mounts
 * it.
 */
import ChipBoard from "./ChipBoard.svelte";
import { scenes, states } from "./stories";

export default {
  title: "Chip options/Option B: the kind as a word",
  component: ChipBoard,
  args: { option: "B", scene: "list", scheme: "light" },
};

/** Every kind at rest, one chip of each, at the desk. */
export const EveryKind = { ...states.every, parameters: { viewport: 1440 } };

/** Every kind at rest, one chip of each, on a phone. */
export const EveryKindPhone = {
  ...states.every,
  parameters: { viewport: 390 },
};

/** Every kind at rest on a phone, in the dark. */
export const EveryKindPhoneDark = {
  args: { ...states.every.args, scheme: "dark" },
  parameters: { viewport: 390 },
};

/** A turn naming every kind, at the desk. */
export const MessageDesk = {
  args: { scene: "message" },
  parameters: { viewport: 1440 },
};

/** A turn naming every kind, at the desk, in the dark. */
export const MessageDeskDark = {
  args: { scene: "message", scheme: "dark" },
  parameters: { viewport: 1440 },
};

/** A turn naming every kind, at a narrow desk pane. */
export const MessagePane = {
  args: { scene: "message" },
  parameters: { viewport: 680 },
};

/** A turn naming every kind, on a phone. */
export const MessagePhone = {
  args: { scene: "message" },
  parameters: { viewport: 390 },
};

/** A turn naming every kind, on a phone, in the dark. */
export const MessagePhoneDark = {
  args: { scene: "message", scheme: "dark" },
  parameters: { viewport: 390 },
};

/** A session idle, working, needing you, failed and done. */
export const Session = states.session;

/** A pin sent, with an unread answer, resolved, and with its element gone. */
export const Pin = states.pin;

/** A decision card not picked and picked. */
export const DecisionCard = states.decision;

/** The five artifact kinds: page, canvas, preview, component sheet and browser. */
export const Artifacts = states.artifact;

/** A task in each kind of stage: to do, active, waiting, needs you, done and dropped. */
export const Task = states.task;

/** A to-do open and ticked. */
export const Todo = states.todo;

/** A plan at 3 of 7 while its session works, and finished. */
export const Plan = states.plan;

/** A plan step to do, under way and done. */
export const PlanStep = states.step;

/** A routine on, paused, expiring, running, and with its last run failed. */
export const Routine = states.routine;

/** A project. */
export const Project = states.project;

/** A machine online and offline. */
export const Machine = states.machine;

/** A 40-word name clipping at the chip's maximum width, on a phone. */
export const LongName = {
  args: { scene: "long" },
  parameters: { viewport: 390 },
};

/** One active task's chip in a line: hover it, focus it, press it. */
export const OneChip = scenes.single;

/** A task's peek while it needs you, open under its chip. */
export const PeekTask = { ...scenes.peekTask, parameters: { viewport: 390 } };
