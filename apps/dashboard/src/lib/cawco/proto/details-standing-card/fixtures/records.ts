/**
 * The Standing card's records, shaped as the hub answers them: a client's
 * site on two machines with long folders and its folder on the hub, tied to
 * GitHub Issues with 38 tasks linked, three accounts, and the board it
 * stands over. Times are set from one reading, so every frame says the same.
 */

import type { StagesView, TaskSummary } from "@cawco/core/task-views";
import { DAY_MS as DAY, HOUR_MS } from "@cawco/core/time";
import type { TrackerView } from "@cawco/core/trackers";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { Machine } from "#lib/cawco/stores/board.svelte.js";
import type {
  AccountChoice,
  ConnectionChoice,
  FindPlan,
  MovePlan,
  MoveResult,
  MoveRun,
  PlaceFolder,
  TiePlan,
} from "../details";

/** The reading every time is set from: 14:02 on 18 November 2026. */
export const READ_AT = Date.parse("2026-11-18T14:02:00.000Z");

const PROJECT_ID = "6f1d2c0a-8b3e-4a57-9e21-c4d7a8b05f13";

const machine = (
  machineId: string,
  hostname: string,
  os: string,
  status = "online"
): Machine => ({
  auth: "authenticated",
  hostname,
  lastSeenAt: new Date(READ_AT).toISOString(),
  machineId,
  os,
  pausedUntil: null,
  pauseStopped: null,
  status,
});

export const MACHINES: Machine[] = [
  machine("m-obelisk", "obelisk", "linux"),
  machine("m-mbp", "sams-macbook-pro.local", "darwin"),
  machine("m-nixbox", "nixbox", "linux"),
];

export const ATLAS: ProjectRow = {
  account: "acc-northwind",
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: new Date(READ_AT - 41 * DAY).toISOString(),
  eventsOn: true,
  id: PROJECT_ID,
  lands: "pr",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/northwind-studio/atlas-site"],
  name: "Atlas site",
  places: [
    {
      createdAt: new Date(READ_AT - 41 * DAY).toISOString(),
      id: "place-obelisk",
      isPrimary: true,
      kind: "checkout",
      machineId: "m-obelisk",
      path: "/home/sam/code/clients/northwind-studio/atlas-site",
      projectId: PROJECT_ID,
      within: [],
    },
    {
      createdAt: new Date(READ_AT - 9 * DAY).toISOString(),
      id: "place-mbp",
      isPrimary: false,
      kind: "checkout",
      machineId: "m-mbp",
      path: "/Users/sam/Developer/clients/northwind-studio/atlas-site-checkout-redesign",
      projectId: PROJECT_ID,
      within: [],
    },
    {
      createdAt: new Date(READ_AT - 41 * DAY).toISOString(),
      id: "place-hub",
      isPrimary: false,
      kind: "hub",
      machineId: "hub",
      path: `projects/${PROJECT_ID}`,
      projectId: PROJECT_ID,
      within: [],
    },
  ],
  primaryPlaceId: "place-obelisk",
  review: true,
};

/** Every folder where it is, the person's own. */
export const FOLDERS_IN_PLACE: Record<string, PlaceFolder> = {
  "place-obelisk": { missing: false, made: false },
  "place-mbp": { missing: false, made: false },
  "place-hub": { missing: false, made: true },
};

/** GitHub Issues, in step at 14:02, 38 tasks linked, its stages on a Project. */
export const TIED_GITHUB: TrackerView = {
  tracker: "github",
  binding: {
    boundAt: READ_AT - 30 * DAY,
    connection: "github-northwind",
    githubProject: {
      fieldId: "PVTSSF_lADOBq7x",
      id: "PVT_kwDOBq7xzM4A",
      map: {},
      number: 4,
      options: [],
      title: "Atlas site roadmap",
      url: "https://github.com/orgs/northwind-studio/projects/4",
    },
    githubProjectReason: null,
    linked: 38,
    polledAt: READ_AT,
    provider: "github",
    reason: null,
    state: "synced",
    target: "northwind-studio/atlas-site",
    targetName: "northwind-studio/atlas-site",
    targetUrl: "https://github.com/northwind-studio/atlas-site",
  },
};

export const ACCOUNTS: AccountChoice[] = [
  {
    id: "acc-personal",
    name: "Personal Max",
    provider: "anthropic",
    signedIn: true,
  },
  {
    id: "acc-northwind",
    name: "Northwind team",
    provider: "anthropic",
    signedIn: true,
  },
  { id: "acc-codex", name: "sam@hey.com", provider: "openai", signedIn: true },
];

/** The project's stages, as its board draws them. */
export const STAGES: StagesView = {
  decisionStarters: [],
  moves: [{ from: "*", to: "*", who: ["you"] }],
  problems: [],
  routineStarters: [],
  source: "file",
  stages: (
    [
      ["Backlog", "todo"],
      ["In progress", "active"],
      ["Review", "you"],
      ["Done", "done"],
    ] as const
  ).map(([name, kind]) => ({ hooks: {}, kind, name })),
  starters: [],
  template: null,
  views: [],
};

const task = (
  number: number,
  stage: string,
  kind: TaskSummary["kind"],
  title: string,
  labels: string[],
  issue: number,
  hoursAgo: number
): TaskSummary => ({
  archivedAt: null,
  attempts: [],
  builtOn: [],
  closeReason: null,
  completedAt: null,
  createdAt: READ_AT - 12 * DAY,
  createdBy: null,
  droppedAt: null,
  duplicateOf: null,
  fields: {},
  foundIn: null,
  heldBy: null,
  id: `tsk-${number}`,
  kind,
  labels,
  lastAttemptFailed: false,
  lastAttemptStopped: false,
  links: [
    {
      kind: "issue",
      mode: "record",
      ref: `#${issue}`,
      source: "github",
      state: kind === "done" ? "closed" : "open",
      url: `https://github.com/northwind-studio/atlas-site/issues/${issue}`,
    },
  ],
  liveAttempt: kind === "active",
  needsYou: kind === "you",
  number,
  outputs: [],
  partOf: null,
  parts: [],
  path: `tasks/tsk-${number}.md`,
  problem: null,
  queuedStart: false,
  rank: null,
  ready: kind === "todo",
  stage,
  startedAt: kind === "todo" ? null : READ_AT - hoursAgo * HOUR_MS,
  startProblem: null,
  title,
  todos: { done: 0, total: 0 },
  type: null,
  unblocks: [],
  updatedAt: READ_AT - hoursAgo * HOUR_MS,
  updatedBy: null,
  waits: [],
  waitsOn: [],
});

/** The board under the card: a week of a client site's work. */
export const TASKS: TaskSummary[] = [
  task(
    51,
    "Backlog",
    "todo",
    "Lazy-load the case study videos below the fold",
    ["perf"],
    212,
    30
  ),
  task(
    52,
    "Backlog",
    "todo",
    "Add the Danish locale to the footer and the cookie banner",
    ["i18n"],
    214,
    28
  ),
  task(
    49,
    "Backlog",
    "todo",
    "Swap the hero's stock photo for the studio's own shoot",
    ["content"],
    207,
    50
  ),
  task(
    47,
    "In progress",
    "active",
    "Move the checkout's address step onto one screen, the postcode lookup first",
    ["checkout", "mobile"],
    203,
    2
  ),
  task(
    48,
    "In progress",
    "active",
    "Fix the newsletter form posting twice on a slow connection",
    ["bug"],
    205,
    1
  ),
  task(
    45,
    "Review",
    "you",
    "Rewrite the pricing page's FAQ in the client's voice",
    ["content"],
    198,
    5
  ),
  task(
    44,
    "Done",
    "done",
    "Cut the home page's first paint under one second on 4G",
    ["perf"],
    196,
    26
  ),
  task(
    43,
    "Done",
    "done",
    "Redirect the old /work/* links to the new case studies",
    ["seo"],
    194,
    40
  ),
];

/** Tasks kept in CawCo alone: no tracker tied. */
export const KEPT_HERE: TrackerView = { tracker: "cawco", binding: null };

/** Just tied: the first sync is under way. */
export const FIRST_SYNC: TrackerView = {
  tracker: "github",
  binding: TIED_GITHUB.binding && {
    ...TIED_GITHUB.binding,
    state: "syncing",
    polledAt: null,
    linked: 0,
  },
};

/** The fleet's connections: two can sign in to GitHub, one holds a storage key. */
export const CONNECTIONS: ConnectionChoice[] = [
  {
    name: "github-northwind",
    account: "northwind-studio",
    serves: true,
    service: "github",
  },
  { name: "github-sam", account: "sam", serves: true, service: "github" },
  { name: "r2-assets", account: "Northwind R2", serves: true, service: "s3" },
];

/** A project with no code and no machine: its folder on the hub alone. */
export const NOTES_ONLY: ProjectRow = {
  ...ATLAS,
  account: null,
  id: "b2c41d7e-0f9a-4e63-8a15-d3c6e9f20b48",
  lands: "none",
  links: [],
  name: "Launch notes",
  places: [
    {
      createdAt: new Date(READ_AT - 2 * DAY).toISOString(),
      id: "place-notes-hub",
      isPrimary: false,
      kind: "hub",
      machineId: "hub",
      path: "projects/b2c41d7e-0f9a-4e63-8a15-d3c6e9f20b48",
      projectId: "b2c41d7e-0f9a-4e63-8a15-d3c6e9f20b48",
      within: [],
    },
  ],
  primaryPlaceId: null,
};

/** obelisk's folder, where work starts, gone from where the place points. */
export const OBELISK_MISSING: Record<string, PlaceFolder> = {
  ...FOLDERS_IN_PLACE,
  "place-obelisk": { missing: true, made: false },
};

/** Moving obelisk's folder to nixbox: a copy, three conversations running there. */
export const MOVE_TO_NIXBOX = {
  machineId: "m-nixbox",
  folder: "/srv/work/northwind-studio/atlas-site",
};

export const MOVE_PLAN: MovePlan = {
  along: ["atlas-design-kit", "atlas-landing-pages"],
  brokenLinks: 12,
  noLongerHeldBy: "Northwind monorepo",
  reach: { state: "copy", files: 48_210, bytes: 3_100_000_000 },
  refusal: null,
  running: [
    {
      carry: "as-is",
      continuesOn: null,
      harnesses: ["claude", "opencode", "pi"],
      id: "s-chip",
      midTurn: false,
      pick: "as-is",
      title: "Fix the checkout's address step",
      why: null,
    },
    {
      carry: "as-is",
      continuesOn: null,
      harnesses: ["claude", "opencode", "pi"],
      id: "s-caw",
      midTurn: true,
      pick: "as-is",
      title: "Caw's conversation",
      why: null,
    },
    {
      carry: "summary",
      continuesOn: "claude",
      harnesses: ["claude", "opencode", "pi"],
      id: "s-probe",
      midTurn: false,
      pick: "summary",
      title: "Probe the newsletter form's double post",
      why: "nixbox doesn't run Codex, so it continues from a summary.",
    },
  ],
};

export const MOVE_READING: MovePlan = {
  ...MOVE_PLAN,
  along: [],
  brokenLinks: 0,
  noLongerHeldBy: null,
  reach: { state: "reading" },
};

/** Within one disk on obelisk, with nothing running there. */
export const MOVE_RENAME: MovePlan = {
  along: [],
  brokenLinks: 0,
  noLongerHeldBy: null,
  reach: { state: "rename" },
  refusal: null,
  running: [],
};

export const MOVE_AWAY: MovePlan = {
  ...MOVE_PLAN,
  reach: { state: "away", files: 48_210, bytes: 3_100_000_000 },
};

export const MOVE_REFUSED: MovePlan = {
  ...MOVE_PLAN,
  refusal: {
    stops: "/srv/work/northwind-studio/atlas-site already holds 214 files.",
    todo: "Move doesn't merge folders: name an empty or new folder.",
  },
};

const STEPS = [
  "Stop sessions",
  "Copy",
  "Check",
  "Put in place",
  "Remove old folder",
  "Resume sessions",
];

export const RUN_COPYING: MoveRun = {
  at: 1,
  bytes: { done: 2_000_000_000, total: 3_100_000_000 },
  failed: null,
  files: { done: 31_004, total: 48_210 },
  holding: null,
  steps: STEPS,
  waiting: [],
};

export const RUN_STOPPING: MoveRun = {
  at: 0,
  bytes: null,
  failed: null,
  files: null,
  holding: null,
  steps: STEPS,
  waiting: [{ id: "s-caw", title: "Caw's conversation" }],
};

export const RUN_HOLDING: MoveRun = { ...RUN_COPYING, holding: "nixbox" };

export const RUN_FAILED: MoveRun = {
  ...RUN_COPYING,
  at: 2,
  failed: {
    words:
      "public/media/hero-loop.mp4 changed during the copy (size 41.2 MB, was 38.9 MB).",
    oldFolder: "whole, still the project's place",
    newFolder: "partial copy, kept to resume from",
  },
};

export const RESULT_PROVEN: MoveResult = {
  calledOff: null,
  ended: [],
  leftBehind: [],
  proven: { files: 48_210, bytes: 3_100_000_000, commit: "a1b2c3d" },
  sessions: [
    {
      id: "s-chip",
      title: "Fix the checkout's address step",
      outcome: "running",
      detail: "Running in the new folder.",
    },
    {
      id: "s-caw",
      title: "Caw's conversation",
      outcome: "running",
      detail: "Running in the new folder.",
    },
    {
      id: "s-probe",
      title: "Probe the newsletter form's double post",
      outcome: "summary",
      detail: "Continued from a summary on Claude Code.",
    },
  ],
};

export const RESULT_LEFT: MoveResult = {
  ...RESULT_PROVEN,
  ended: [
    "2 background commands",
    "1 monitor",
    "1 wake-up",
    "An MCP server set up by hand on obelisk",
  ],
  leftBehind: [
    {
      path: ".env.local",
      why: "Changed after the check, so it was left and the copy kept.",
    },
  ],
  sessions: [
    ...RESULT_PROVEN.sessions.slice(0, 2),
    {
      id: "s-probe",
      title: "Probe the newsletter form's double post",
      outcome: "stopped",
      detail:
        "Its summary didn't start on Claude Code: stopped, its transcript kept.",
    },
  ],
};

export const RESULT_CALLED_OFF: MoveResult = {
  calledOff: "The partial copy on nixbox was removed; the old folder is whole.",
  ended: [],
  leftBehind: [],
  proven: null,
  sessions: RESULT_PROVEN.sessions.map((one) => ({
    ...one,
    outcome: "running" as const,
    detail: "Running in the old folder.",
  })),
};

/** Find folder on obelisk: the same repository at a new folder. */
export const FIND_TYPED = "/home/sam/code/clients/northwind/atlas-site";

export const FIND_SAME: FindPlan = {
  away: false,
  merge: null,
  oldStays: false,
  refusal: null,
  tell: "same-repository",
};

export const FIND_EMPTY: FindPlan = {
  away: false,
  merge: null,
  oldStays: false,
  refusal: null,
  tell: null,
};

export const FIND_READING: FindPlan = { ...FIND_EMPTY, tell: "reading" };

export const FIND_CANT_TELL: FindPlan = {
  ...FIND_EMPTY,
  oldStays: true,
  tell: "cant-tell",
};

export const FIND_AWAY: FindPlan = { ...FIND_EMPTY, away: true, tell: null };

export const FIND_MERGE: FindPlan = {
  ...FIND_EMPTY,
  merge: { other: "Atlas site (old)", keep: null },
  tell: "other-repository",
};

export const FIND_REFUSED: FindPlan = {
  ...FIND_EMPTY,
  refusal:
    "obelisk can't read /home/sam/code/clients/northwind/atlas-site (permission denied). Nothing changed; give CawCo's agent read access and point again.",
  tell: null,
};

const ATLAS_STAGES = ["Backlog", "In progress", "Review", "Done"];
const STATUS = ["Todo", "In Progress", "In Review", "Done"];

/** Tying to GitHub Issues: the project's own repository and its Project picked. */
export const TIE_GITHUB: TiePlan = {
  connection: "github-northwind",
  connections: CONNECTIONS.filter((one) => one.service === "github"),
  project: "PVT_kwDOBq7xzM4A",
  projectReason: null,
  projects: [
    { id: "PVT_kwDOBq7xzM4A", title: "Atlas site roadmap" },
    { id: "PVT_kwDOBq7xzM4B", title: "Northwind client work" },
  ],
  provider: "github",
  refusal: null,
  stages: ATLAS_STAGES.map((stage, at) => ({
    stage,
    options: STATUS,
    pick: STATUS[at] ?? null,
  })),
  target: "northwind-studio/atlas-site",
  targets: [
    {
      id: "northwind-studio/atlas-site",
      name: "northwind-studio/atlas-site",
      own: true,
    },
    {
      id: "northwind-studio/atlas-cms",
      name: "northwind-studio/atlas-cms",
      own: false,
    },
  ],
};

export const TIE_READING: TiePlan = {
  ...TIE_GITHUB,
  connection: null,
  connections: null,
  project: null,
  projects: null,
  target: null,
  targets: null,
};

export const TIE_NO_CONNECTION: TiePlan = {
  ...TIE_GITHUB,
  connection: null,
  connections: [],
  project: null,
  target: null,
};

export const TIE_NO_STAGES: TiePlan = {
  ...TIE_GITHUB,
  project: "none",
  projectReason:
    "github-northwind may not read northwind-studio's Projects (it needs read:project). Issues still sync.",
  projects: [],
};

export const TIE_REFUSED: TiePlan = {
  ...TIE_GITHUB,
  refusal:
    "GitHub refused: github-northwind can't write issues in northwind-studio/atlas-site (Resource not accessible by integration). Your choices are kept.",
};

export const TIE_LINEAR: TiePlan = {
  connection: "linear-northwind",
  connections: [
    {
      name: "linear-northwind",
      account: "Northwind Studio",
      serves: true,
      service: "linear",
    },
  ],
  project: null,
  projectReason: null,
  projects: null,
  provider: "linear",
  refusal: null,
  stages: [],
  target: "team-web",
  targets: [
    { id: "team-web", name: "WEB · Web", own: true },
    { id: "team-brand", name: "BRD · Brand", own: false },
  ],
};
