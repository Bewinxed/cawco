/**
 * The live board the Passport hangs over, as the project's own records
 * shape it: Hyucksfield's stages and the tasks on them, the rail's
 * projects, and the fleet's machines. Fixtures for the shell frame
 * (passport-live.svelte); nothing here is the Passport's.
 */
import type { Stage, TaskSummary } from "@cawco/core/task-views";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";

const now = Date.now();

/** Hyucksfield's stages, as its stages.md names them. */
export const STAGES: Stage[] = [
  { name: "Backlog", kind: "todo", hooks: {} },
  { name: "In progress", kind: "active", hooks: {} },
  { name: "Review", kind: "you", hooks: {} },
  { name: "Done", kind: "done", hooks: {} },
];

/** A card at rest: no attempt waiting, held or refused, nothing it waits on. */
const quiet = {
  heldBy: null,
  startProblem: null,
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  queuedStart: false,
  ready: false,
  attempts: [],
  builtOn: [],
  parts: [],
  unblocks: [],
  waits: [],
};

interface Card {
  ago: number;
  labels?: string[];
  live?: boolean;
  stage: string;
  title: string;
  todos?: [number, number];
}

const CARDS: Card[] = [
  {
    title: "Let a climber book a slot for two without making a second account",
    stage: "Backlog",
    labels: ["booking"],
    ago: 3 * DAY_MS,
  },
  {
    title: "Show the wall's route setters on each route card",
    stage: "Backlog",
    ago: 2 * DAY_MS,
  },
  {
    title: "Send the waiver reminder the evening before a first visit",
    stage: "Backlog",
    labels: ["email"],
    ago: 26 * HOUR_MS,
  },
  {
    title: "Move the waiver form onto one screen, the signature last",
    stage: "In progress",
    labels: ["waiver", "mobile"],
    todos: [2, 5],
    live: true,
    ago: 40 * MINUTE_MS,
  },
  {
    title: "Answer a full session with the next three free slots",
    stage: "In progress",
    labels: ["booking"],
    todos: [1, 3],
    live: true,
    ago: 12 * MINUTE_MS,
  },
  {
    title: "Price the ten-visit pass from the members' table",
    stage: "Review",
    labels: ["pricing"],
    todos: [4, 4],
    ago: 3 * HOUR_MS,
  },
  {
    title:
      "Keep the gym's opening hours in one file the site and the emails read",
    stage: "Review",
    todos: [3, 3],
    ago: 5 * HOUR_MS,
  },
  {
    title: "Fix the calendar skipping Sundays in March",
    stage: "Done",
    labels: ["booking"],
    ago: DAY_MS,
  },
  {
    title: "Add the youth session to the timetable",
    stage: "Done",
    ago: 2 * DAY_MS,
  },
];

const kindOf = (stage: string) =>
  STAGES.find((one) => one.name === stage)?.kind ?? null;

/** The board's tasks, newest change first within each stage. */
export const TASKS: TaskSummary[] = CARDS.map((card, at) => {
  const number = 120 - at * 3;
  const [done, total] = card.todos ?? [0, 0];
  return {
    ...quiet,
    archivedAt: null,
    closeReason: null,
    completedAt: card.stage === "Done" ? now - card.ago : null,
    droppedAt: null,
    startedAt: card.stage === "Backlog" ? null : now - card.ago - HOUR_MS,
    liveAttempt: card.live === true,
    createdAt: now - card.ago - 2 * DAY_MS,
    createdBy: null,
    duplicateOf: null,
    fields: {},
    foundIn: null,
    id: `tsk-${number}`,
    kind: kindOf(card.stage),
    labels: card.labels ?? [],
    links: [],
    needsYou: kindOf(card.stage) === "you",
    number,
    outputs: [],
    partOf: null,
    path: `tasks/tsk-${number}.md`,
    problem: null,
    rank: null,
    stage: card.stage,
    title: card.title,
    todos: { done, total },
    type: null,
    updatedAt: now - card.ago,
    updatedBy: null,
    waitsOn: [],
  };
});

const machine = (
  machineId: string,
  hostname: string,
  os: string,
  online: boolean
): Machine => ({
  machineId,
  hostname,
  os,
  auth: "authenticated",
  joinedAt: 0,
  pausedUntil: null,
  pauseStopped: null,
  status: online ? "online" : "offline",
});

/** The fleet: the desk, the server, and the laptop that is away. */
export const MACHINES: Machine[] = [
  machine("m-atlas", "atlas", "linux-x64", true),
  machine("m-nixbox", "nixbox", "linux-x64", true),
  machine("m-studio", "studio-mbp", "darwin-arm64", false),
];

const project = (
  id: string,
  name: string,
  days: number,
  places: { machineId: string; path: string }[]
): ProjectRow => ({
  account: null,
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: new Date(now - days * DAY_MS).toISOString(),
  eventsOn: true,
  id,
  lands: "pr",
  lfsConnection: null,
  lfsUrl: null,
  links: [],
  name,
  places: places.map((place, at) => ({
    createdAt: new Date(now - days * DAY_MS).toISOString(),
    found: true,
    id: `${id}-place-${at}`,
    isPrimary: at === 0,
    kind: "checkout" as const,
    machineId: place.machineId,
    made: false,
    missing: false,
    path: place.path,
    projectId: id,
    within: [],
  })),
  primaryPlaceId: `${id}-place-0`,
  review: true,
});

/** The rail's projects: the one on screen among the fleet's others. */
export const PROJECTS: ProjectRow[] = [
  project("hyucksfield", "Hyucksfield", 41, [
    { machineId: "m-atlas", path: "/home/sam/code/hyucksfield" },
  ]),
  project("launch-posts", "Launch posts", 12, []),
  project("route-setter", "Route setter app", 88, [
    { machineId: "m-atlas", path: "/home/sam/code/route-setter" },
  ]),
  project("gym-ops", "Gym ops", 160, [
    { machineId: "m-nixbox", path: "/srv/work/gym-ops" },
  ]),
];

/** The project the page is on. */
export const PROJECT_ID = "hyucksfield";
