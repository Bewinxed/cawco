/**
 * Chip Option B, the kind as a word (Component Story Format 3, live
 * components): the inline chip led by a caps-role keycap naming its kind
 * (PIN 12, CARD, TASK, PLAN 3/7), its state the keycap's tint, the status
 * pair's fill and ink; a session keeps its tile and dot. The
 * meta's args are every story's; a story's own args are what it changes.
 * A scratch canvas for the owner's pick; nothing in the app mounts it.
 */
import ChipBoard from "./ChipBoard.svelte";
import { scenes, states } from "./stories";

export default {
  title: "Chip options/Option B: the kind as a word",
  component: ChipBoard,
  args: { option: "B", scene: "list", scheme: "light" },
};

/** Every kind at rest, one chip of each. */
export const EveryKind = { ...states.every, parameters: { viewport: 1440 } };

/** A session idle, working, needing you, failed and done. */
export const Session = states.session;

/** A pin sent, with an unread answer, resolved, and with its element gone. */
export const Pin = states.pin;

/** A decision card not picked, sent and waiting, and picked. */
export const DecisionCard = states.decision;

/** The five artifact kinds: page, canvas, preview, sheet and site. */
export const Artifacts = states.artifact;

/** A task pending, running, in review, blocked, failed and done. */
export const Task = states.task;

/** A to-do open and ticked. */
export const Todo = states.todo;

/** A plan at 3 of 7, while its session works, and finished. */
export const Plan = states.plan;

/** A plan step pending, in progress and done. */
export const PlanStep = states.step;

/** A routine on a schedule, on an event, paused, expiring, never run, ok, failed and running. */
export const Routine = states.routine;

/** A workflow and a run, idle, running, failed and done. */
export const WorkflowAndRun = states.workflow;

/** A project idle and with sessions running. */
export const Project = states.project;

/** A machine online, away and offline. */
export const Machine = states.machine;

/** The five-kind sentence in a transcript message, at the desk's width. */
export const SentenceDesk = {
  args: { scene: "sentence" },
  parameters: { viewport: 1440 },
};

/** The five-kind sentence at the desk's width, in the dark. */
export const SentenceDeskDark = {
  args: { scene: "sentence", scheme: "dark" },
  parameters: { viewport: 1440 },
};

/** The five-kind sentence on a phone. */
export const SentencePhone = {
  args: { scene: "sentence" },
  parameters: { viewport: 390 },
};

/** The five-kind sentence on a phone, in the dark. */
export const SentencePhoneDark = {
  args: { scene: "sentence", scheme: "dark" },
  parameters: { viewport: 390 },
};

/** A 40-word name clipping at the chip's maximum width, on a phone. */
export const LongName = {
  args: { scene: "sentence", long: true },
  parameters: { viewport: 390 },
};

/** One running task's chip in a line: hover it, focus it, press it. */
export const OneChip = scenes.single;

/** A working session's peek, open over its chip. */
export const PeekSession = scenes.peekSession;

/** A task's peek in review, open over its chip. */
export const PeekTask = scenes.peekTask;

/** A sent decision card's peek, open over its chip. */
export const PeekDecisionCard = scenes.peekDecision;
