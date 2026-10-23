/**
 * What the native-preview pictures show (the decision on how CawCo's panel
 * and canvas show a project that isn't a web app): the stand-in for the iOS
 * app's Project page, the node picked on it, its comment, and where the app
 * runs. Every picture draws from this one fixture, so the four options show
 * the same screen, the same node and the same pin.
 */
import type { TaskSummary } from "#lib/cawco/project-tasks.js";

/** One node of the app's view tree, as a stamped build reports it. */
export interface NativeNode {
  /** Where its view is made, when the build stamps it. */
  at: string | null;
  /** Its frame in points: x, y, width, height. */
  frame: [number, number, number, number];
  /** Its class, as the tree names it (`UILabel`). */
  kind: string;
  /** Its accessibility label. */
  label: string;
  /** Its type, ink, fill and radius, as the design system's token names. */
  tokens: { type: string; ink: string; fill: string; radius: string };
}

/** The node every picture picks: the Needs you filter on the Project page. */
export const PICKED: NativeNode = {
  kind: "UILabel",
  label: "Needs you, 3",
  at: "ProjectViewController.swift:1229",
  frame: [16, 112, 343, 44],
  tokens: {
    type: "body 17",
    ink: "ink-strong",
    fill: "surface-raised",
    radius: "radius 12",
  },
};

/** The comment pinned on the picked node. */
export const PIN = {
  number: 1,
  words: "heavier",
  who: "You",
  age: "2m",
} as const;

/** Where the app runs and how it reaches the panel. */
export const DEVICE = {
  model: "iPhone 16 Pro",
  os: "iOS 18.5",
  machine: "Omars-MacBook-Pro",
} as const;

/** A task card's row as the board lists it, with only what the card reads. */
const task = (
  id: string,
  title: string,
  live: boolean,
  todos: { done: number; total: number } = { done: 0, total: 0 }
): TaskSummary => ({
  after: [],
  attempts: [],
  blockedBy: [],
  createdAt: 0,
  duplicateOf: null,
  fields: {},
  foundIn: null,
  id,
  kind: live ? "active" : "todo",
  labels: [],
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  liveAttempt: live,
  needsYou: false,
  number: Number(id.split("-")[1]),
  outputs: [],
  parent: null,
  path: `tasks/${id}.md`,
  problem: null,
  queuedStart: false,
  rank: null,
  related: [],
  stage: "doing",
  startProblem: null,
  title,
  todos,
  type: null,
  updatedAt: 0,
});

/** The Working column the stand-in screen shows. */
export const WORKING: TaskSummary[] = [
  task("tsk-12", "Fix tray chip overflow", true, { done: 2, total: 5 }),
  task("tsk-14", "Pair the phone by QR", true),
  task("tsk-9", "Answer pushes from the lock screen", false, {
    done: 1,
    total: 3,
  }),
];
