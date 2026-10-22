/**
 * The inline chip's kinds and their states, as the chip-options canvas draws
 * them (a scratch folder for the owner's pick between the designer's Option
 * A and Option B; nothing in the app reads it). One chip is its kind, its
 * label, its state and, for a numbered kind, its number: fixture props, so
 * every state can be forced from a story.
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
  | "site"
  | "task"
  | "todo"
  | "plan"
  | "step"
  | "routine"
  | "workflow"
  | "run"
  | "project"
  | "machine";

/** The colour a state wears (the spec's state colour roles); null is none. */
export type StateRole = "live" | "attn" | "done" | "fail" | null;

export interface ChipSpec {
  /** The peek's body: the lines under its name. */
  body?: string[];
  hue?: MarkHue;
  kind: ChipKind;
  label: string;
  /** A pin's or a run's number, a step's position, a plan's ticked steps. */
  number?: number;
  /** A machine's `platform-arch`, as the daemon reports it. */
  os?: string;
  /** A session's id, for its sprite; a project's or machine's hue. */
  seed?: string;
  /** The kind's state, one of `STATES[kind]`; the first is its rest. */
  state?: string;
  /** A plan's steps. */
  total?: number;
  /** What starts a routine. */
  trigger?: "schedule" | "event";
}

/** Each kind's word: the peek's head and the accessible name. */
export const KIND_WORD: Record<ChipKind, string> = {
  session: "Session",
  pin: "Pin",
  decision: "Decision card",
  page: "Page",
  canvas: "Canvas",
  preview: "Preview",
  sheet: "Sheet",
  site: "Site",
  task: "Task",
  todo: "To-do",
  plan: "Plan",
  step: "Step",
  routine: "Routine",
  workflow: "Workflow",
  run: "Run",
  project: "Project",
  machine: "Machine",
};

/** Each kind's states, rest first, with the word the chip's name says. */
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
  decision: {
    "not-picked": "not picked",
    sent: "sent, not picked",
    picked: "picked",
  },
  page: { rest: "" },
  canvas: { rest: "" },
  preview: { rest: "" },
  sheet: { rest: "" },
  site: { rest: "" },
  task: {
    pending: "pending",
    running: "running",
    review: "in review",
    blocked: "blocked",
    failed: "failed",
    done: "done",
  },
  todo: { open: "open", ticked: "ticked" },
  plan: { idle: "idle", working: "working", done: "done" },
  step: { pending: "pending", "in-progress": "in progress", done: "done" },
  routine: {
    scheduled: "scheduled",
    event: "runs on an event",
    paused: "paused",
    expiring: "expiring",
    "never-run": "never run",
    ok: "last run ok",
    failed: "last run failed",
    running: "running",
  },
  workflow: {
    idle: "idle",
    running: "running",
    failed: "failed",
    done: "done",
  },
  run: { running: "running", failed: "failed", done: "done" },
  project: { idle: "idle", live: "sessions running" },
  machine: { online: "online", away: "away", off: "offline" },
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
    case "live":
      return "live";
    case "needs-you":
    case "unread":
    case "sent":
    case "review":
      // A pin that is merely sent has no state colour; a sent card waits on you.
      return kind === "pin" ? null : "attn";
    case "done":
    case "ticked":
    case "picked":
    case "ok":
      return "done";
    case "failed":
      return "fail";
    default:
      return null;
  }
}

export function restOf(kind: ChipKind): string {
  return Object.keys(STATES[kind])[0];
}

/** The chip's state, or its kind's rest. */
export function stateOf(chip: ChipSpec): string {
  return chip.state ?? restOf(chip.kind);
}

/** "Task · running", the peek's head; the kind alone where it has no state. */
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
  { kind: "site", label: "cawco.dev pricing" },
  { kind: "task", label: "Fix tray chip overflow" },
  { kind: "todo", label: "pin the hairline" },
  {
    kind: "plan",
    label: "Fix tray chip overflow",
    number: 3,
    total: 7,
  },
  { kind: "step", label: "Measure the chip at 390", number: 3 },
  { kind: "routine", label: "Lint sweep", trigger: "schedule" },
  { kind: "workflow", label: "Release train" },
  { kind: "run", label: "Release train", number: 12 },
  { kind: "project", label: "cockpit", hue: 6 },
  { kind: "machine", label: "studio-mac", os: "darwin-arm64", hue: 5 },
];

export function sample(name: ChipKind): ChipSpec {
  return KINDS.find((one) => one.kind === name) ?? KINDS[0];
}

/** Peek bodies for the three kinds the canvas opens. */
export const PEEK_BODY: Partial<Record<ChipKind, string[]>> = {
  session: [
    "obelisk · cockpit · 4m",
    "Measuring the chip at 390: the label clips at 32ch, the mark keeps 18px.",
  ],
  task: [
    "To-dos 3 of 7 · picked by Opus",
    "Acceptance: no sideways overflow at 390.",
  ],
  decision: [
    "3 options · sent 12m ago",
    "Recommended: the quiet head, a title and one line of meta.",
  ],
};

/** A name forty words long, for the max-width frame. */
export const LONG_NAME =
  "Measure every inline chip in the transcript at the phone width and at the desk width, then clip the label at its maximum width, keep the mark and the keycap whole, and check that nothing scrolls sideways in either theme";
