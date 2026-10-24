/**
 * The reference chips' kinds and their states, as the chip-options canvases
 * draw them: a scratch folder for the owner's pick between Option A (a glyph
 * and a dot) and Option B (the kind as a word). Nothing in the app reads it;
 * the pick lands in reference-looks.ts.
 *
 * The kinds are core's `REFERENCE_KINDS` today (session, pin, decision,
 * artifact, task, todo, plan, step, routine, project, machine), an artifact
 * drawn per artifact kind (page, canvas, preview, component sheet, browser).
 * The states are the ones today's chips reach: a session's run, a pin's
 * pill, a card picked or not, a task's stage kind (project-tasks.ts), a
 * to-do and a step as reference-things.svelte.ts says them, a plan's k of
 * n, a routine on, paused, expiring, running or with its last run failed,
 * and a machine online or offline. One chip is fixture props, so every
 * state can be forced from a story.
 */
import type { MarkHue } from "../mark";

export type ChipKind =
  | "session"
  | "pin"
  | "decision"
  | "page"
  | "canvas"
  | "preview"
  | "sheet"
  | "browser"
  | "task"
  | "todo"
  | "plan"
  | "step"
  | "routine"
  | "project"
  | "machine";

/** The colour a state wears (the spec's state colour roles); null is none. */
export type StateRole = "live" | "attn" | "done" | "fail" | null;

export interface ChipSpec {
  hue?: MarkHue;
  kind: ChipKind;
  label: string;
  /** A pin's number, a plan's ticked steps. */
  number?: number;
  /** A machine's `platform-arch`, as the daemon reports it. */
  os?: string;
  /** A session's id, for its sprite. */
  seed?: string;
  /** The kind's state, one of `STATES[kind]`; the first is its rest. */
  state?: string;
  /** A plan's steps. */
  total?: number;
}

/** Each kind's word: the peek's head and the accessible name. */
export const KIND_WORD: Record<ChipKind, string> = {
  session: "Session",
  pin: "Pin",
  decision: "Decision card",
  page: "Page",
  canvas: "Canvas",
  preview: "Preview",
  sheet: "Component sheet",
  browser: "Browser",
  task: "Task",
  todo: "To-do",
  plan: "Plan",
  step: "Step",
  routine: "Routine",
  project: "Project",
  machine: "Machine",
};

/** Each kind's states, rest first, with the words its chip's name says. */
export const STATES: Record<ChipKind, Record<string, string>> = {
  session: {
    idle: "idle",
    working: "working",
    "needs-you": "needs you",
    failed: "failed",
    done: "done",
  },
  pin: {
    sent: "sent",
    unread: "answer unread",
    resolved: "resolved",
    gone: "its element is gone",
  },
  decision: { "not-picked": "not picked", picked: "picked" },
  page: { rest: "" },
  canvas: { rest: "" },
  preview: { rest: "" },
  sheet: { rest: "" },
  browser: { rest: "" },
  // A task's stage, by its kind (project-tasks.ts KIND_LABEL); the chip says the stage's own name.
  task: {
    todo: "to do",
    active: "active",
    waiting: "waiting",
    you: "needs you",
    done: "done",
    dropped: "dropped",
  },
  todo: { open: "to do", ticked: "done" },
  plan: { working: "under way", done: "done" },
  step: { pending: "to do", "in-progress": "under way", done: "done" },
  routine: {
    on: "on",
    paused: "paused",
    expiring: "expiring",
    running: "running",
    failed: "last run failed",
  },
  project: { rest: "" },
  machine: { online: "online", off: "offline" },
};

/** The state's colour role (the spec's table). */
export function roleOf(kind: ChipKind, state: string): StateRole {
  if (kind === "machine") {
    // Presence is its own dot in both options, not a status role.
    return null;
  }
  switch (state) {
    case "working":
    case "running":
    case "in-progress":
    case "active":
      return "live";
    case "needs-you":
    case "unread":
    case "you":
    case "expiring":
      return "attn";
    case "done":
    case "ticked":
    case "picked":
      return "done";
    case "failed":
      return "fail";
    default:
      return null;
  }
}

export function restOf(kind: ChipKind): string {
  return Object.keys(STATES[kind])[0] ?? "rest";
}

/** The chip's state, or its kind's rest. */
export function stateOf(chip: ChipSpec): string {
  return chip.state ?? restOf(chip.kind);
}

/** "Task · active", the peek's head; the kind alone where it has no state. */
export function headOf(chip: ChipSpec): string {
  const word = STATES[chip.kind][stateOf(chip)];
  return word ? `${KIND_WORD[chip.kind]} · ${word}` : KIND_WORD[chip.kind];
}

/** The chip's accessible name: its kind, its state and its label. */
export function nameOf(chip: ChipSpec): string {
  return `${headOf(chip)}: ${chip.label}`;
}

/** Every state of one kind, as chips. */
export function everyState(chip: ChipSpec): ChipSpec[] {
  return Object.keys(STATES[chip.kind]).map((state) => ({ ...chip, state }));
}

/** One chip of each kind at rest, product-shaped. */
export const KINDS: ChipSpec[] = [
  {
    kind: "session",
    label: "Fix tray chip overflow",
    seed: "c3f1-session-tray",
    hue: 3,
  },
  { kind: "pin", label: "Pricing table", number: 12 },
  { kind: "decision", label: "Which head for the phone page" },
  { kind: "page", label: "Projects PRD, round 3" },
  { kind: "canvas", label: "Pairing flow sketch" },
  { kind: "preview", label: "Settings on the phone" },
  { kind: "sheet", label: "Session row states" },
  { kind: "browser", label: "cawco.dev pricing" },
  { kind: "task", label: "Fix tray chip overflow" },
  { kind: "todo", label: "Pin the hairline" },
  { kind: "plan", label: "Fix tray chip overflow", number: 3, total: 7 },
  { kind: "step", label: "Measure the chip at 390" },
  { kind: "routine", label: "Lint sweep" },
  { kind: "project", label: "cockpit", hue: 6 },
  { kind: "machine", label: "studio-mac", os: "darwin-arm64", hue: 5 },
];

export function sample(name: ChipKind): ChipSpec {
  return KINDS.find((one) => one.kind === name) ?? KINDS[0];
}

/** The artifact kinds, one chip each. */
export const ARTIFACTS: ChipSpec[] = KINDS.filter((one) =>
  ["page", "canvas", "preview", "sheet", "browser"].includes(one.kind)
);

/** A peek's facts, as reference-things.svelte.ts reads them for a task. */
export const PEEK_FACTS: Partial<Record<ChipKind, string[]>> = {
  task: ["tsk-12 · cockpit", "Acceptance: no sideways overflow at 390."],
};

/** A name forty words long, for the maximum-width frame. */
export const LONG_NAME =
  "Measure every inline chip in the transcript at the phone width and at the desk width, then clip the label at its maximum width, keep the mark and the keycap whole, and check that nothing scrolls sideways in either theme";
