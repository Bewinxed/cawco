/**
 * One project as the hub would serve it, for the band's states files: on
 * two machines with long folder paths and its folder on the hub, tied to
 * GitHub Issues with 38 tasks linked, a fleet of three accounts, and the
 * folder on nixbox mid-copy to a faster disk.
 */
import type { Account, AccountSignin } from "@cawco/core/accounts";
import type { DecidesTable } from "@cawco/core/decides";
import type { AgentRow } from "@cawco/core/protocol";
import type { Stage, TaskSummary } from "@cawco/core/task-views";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { TrackerView } from "@cawco/core/trackers";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { AccountsView } from "#lib/cawco/stores/accounts.svelte.js";
import type { MoveUnderWay, PlaceStanding } from "./band-model";

/** The moment every reading is taken against, so frames draw alike each time. */
const NOW = Date.parse("2026-11-18T14:06:00.000Z");

const PROJECT_ID = "6c1f0a3e-8d24-4b7a-9e15-2f3b7c9d1a40";

const machine = (
  machineId: string,
  hostname: string,
  os: string,
  status = "online"
): AgentRow => ({
  auth: "authenticated",
  fleetSync: { state: "acked", generation: 41, sentAt: NOW, at: NOW },
  home: os === "darwin" ? "/Users/sam" : "/home/sam",
  hostname,
  lastSeenAt: new Date(NOW - MINUTE_MS).toISOString(),
  machineId,
  os,
  pausedUntil: null,
  pauseStopped: null,
  status,
});

/** The fleet: the two machines the project lives on, and a laptop it does not. */
export const MACHINES: AgentRow[] = [
  machine("m-obelisk", "obelisk", "linux"),
  machine("m-nixbox", "nixbox", "linux"),
  machine("m-pebble", "pebble", "darwin"),
];

export const PROJECT: ProjectRow = {
  account: "acct-northwind",
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: "caw-atlas-site",
  createdAt: new Date(NOW - 41 * DAY_MS).toISOString(),
  eventsOn: true,
  id: PROJECT_ID,
  lands: "pr",
  lfsConnection: null,
  lfsUrl: null,
  links: [
    "github.com/northwind-studio/atlas-site",
    "github.com/northwind-studio/atlas-design-tokens",
  ],
  name: "Atlas site",
  places: [
    {
      createdAt: new Date(NOW - 41 * DAY_MS).toISOString(),
      id: "place-obelisk",
      isPrimary: true,
      kind: "checkout",
      machineId: "m-obelisk",
      path: "/home/sam/code/clients/northwind-studio/atlas-site",
      projectId: PROJECT_ID,
      within: [],
    },
    {
      createdAt: new Date(NOW - 12 * DAY_MS).toISOString(),
      id: "place-nixbox",
      isPrimary: false,
      kind: "checkout",
      machineId: "m-nixbox",
      path: "/srv/build/northwind-studio/atlas-site-render-farm-mirror",
      projectId: PROJECT_ID,
      within: [],
    },
    {
      createdAt: new Date(NOW - 41 * DAY_MS).toISOString(),
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

/** What the hub knows of each place beyond its record: both folders are where it expects them. */
export const STANDINGS: Record<string, PlaceStanding> = {
  "place-obelisk": { folder: "there", madeByCawco: false },
  "place-nixbox": { folder: "there", madeByCawco: true },
};

/** nixbox's folder, mid-copy to the faster disk. */
export const MOVE: MoveUnderWay = {
  placeId: "place-nixbox",
  step: "copy",
  share: 0.64,
  to: { machineId: "m-nixbox", path: "/mnt/fast-ssd/projects/atlas-site" },
};

const account = (
  id: string,
  label: string,
  email: string,
  hue: Account["hue"],
  order: number
): Account => ({
  atPlanLimit: "move",
  createdAt: NOW - 90 * DAY_MS,
  email,
  hue,
  id,
  identity: { email, organization: label, orgId: `org-${id}` },
  kind: "subscription",
  label,
  neverBackup: false,
  order,
  provider: "anthropic",
  reservePct: null,
});

const signin = (accountId: string, machineId: string): AccountSignin => ({
  accountId,
  checkedAt: NOW - 3 * MINUTE_MS,
  machineId,
  movedAt: null,
  movedFrom: null,
  reason: null,
  refusalReach: null,
  state: "signed-in",
});

/** The fleet's three accounts, each signed in on at least one machine. */
export const ACCOUNTS: AccountsView = {
  access: [],
  accounts: [
    account("acct-personal", "Personal", "sam@hey.com", "amber", 0),
    account("acct-northwind", "Northwind", "sam@northwind.studio", "blue", 1),
    account("acct-studio", "Studio Max", "ops@samwell.studio", "cyan", 2),
  ],
  bench: [],
  catalogFaults: [],
  catalogs: [],
  codexLeaving: [],
  codexSignins: [],
  credit: [],
  pending: [],
  readings: [],
  rebalances: [],
  routing: [],
  signins: [
    signin("acct-personal", "m-pebble"),
    signin("acct-northwind", "m-obelisk"),
    signin("acct-northwind", "m-nixbox"),
    signin("acct-studio", "m-obelisk"),
  ],
};

/** Tied to the project's own repository, in step four minutes ago, its stages on a GitHub Project. */
export const TRACKER: TrackerView = {
  tracker: "github",
  binding: {
    boundAt: NOW - 30 * DAY_MS,
    connection: "github-northwind",
    githubProject: {
      fieldId: "PVTSSF_atlas_status",
      id: "PVT_atlas",
      map: {},
      number: 7,
      options: [],
      title: "Atlas launch board",
      url: "https://github.com/orgs/northwind-studio/projects/7",
    },
    githubProjectReason: null,
    linked: 38,
    polledAt: NOW - 4 * MINUTE_MS,
    provider: "github",
    reason: null,
    state: "synced",
    target: "northwind-studio/atlas-site",
    targetName: "northwind-studio/atlas-site",
    targetUrl: "https://github.com/northwind-studio/atlas-site",
  },
};

/** Its own rule on two kinds: Look and words stays with the person, Approach goes to the advisor. */
export const DECIDES: DecidesTable = {
  from: {
    look: "project",
    behaviour: "fleet",
    scope: "fleet",
    approach: "project",
    rules: "fleet",
    tools: "fleet",
  },
  problems: [],
  routes: {
    look: "you",
    behaviour: "you",
    scope: "caw",
    approach: "advisor",
    rules: "you",
    tools: "practice",
  },
  yours: [],
};

/** The board's stages, as the project's stages.md sets them. */
export const STAGES: Stage[] = (
  [
    ["Backlog", "todo"],
    ["In progress", "active"],
    ["Review", "you"],
    ["Done", "done"],
  ] as const
).map(([name, kind]) => ({ hooks: {}, kind, name }));

const task = (
  number: number,
  stage: string,
  kind: TaskSummary["kind"],
  title: string,
  labels: string[],
  updated: number
): TaskSummary => ({
  archivedAt: null,
  attempts: [],
  builtOn: [],
  closeReason: null,
  completedAt: kind === "done" ? NOW - updated : null,
  createdAt: NOW - 9 * DAY_MS,
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
      ref: `#${number + 180}`,
      source: "github",
      state: kind === "done" ? "closed" : "open",
      url: `https://github.com/northwind-studio/atlas-site/issues/${number + 180}`,
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
  startedAt: kind === "active" ? NOW - updated : null,
  startProblem: null,
  title,
  todos: { done: 0, total: 0 },
  type: null,
  unblocks: [],
  updatedAt: NOW - updated,
  updatedBy: null,
  waits: [],
  waitsOn: [],
});

/** The board under the band: a few tasks in each stage, as the project runs today. */
export const TASKS: TaskSummary[] = [
  task(
    52,
    "Backlog",
    "todo",
    "Swap the hero video for a still on slow connections",
    ["perf"],
    2 * DAY_MS
  ),
  task(
    53,
    "Backlog",
    "todo",
    "Case studies page: three client stories with pull quotes",
    ["content"],
    DAY_MS
  ),
  task(
    49,
    "In progress",
    "active",
    "Move the pricing table onto the design tokens' spacing scale",
    ["design-system"],
    20 * MINUTE_MS
  ),
  task(
    47,
    "Review",
    "you",
    "Contact form: send to the studio's inbox and say so on the page",
    ["forms"],
    3 * HOUR_MS
  ),
  task(
    44,
    "Done",
    "done",
    "Footer links read from one list in the CMS",
    [],
    DAY_MS
  ),
];

/** The fleet's other projects, as the rail lists them beside this one. */
export const OTHER_PROJECTS: ProjectRow[] = [
  [
    "0d3b7e21-5c4a-4f19-8a62-7b9e1c3d5f80",
    "Pantry rewrite",
    "m-obelisk",
    "/home/sam/code/pantry",
  ],
  [
    "9a4e6c10-2b7d-4e3f-a1c5-8d0f2b6e4a91",
    "Northwind launch posts",
    "hub",
    "projects/9a4e6c10",
  ],
  [
    "4f8c2d6a-9e1b-4a7c-b3d5-0e6f8a2c4b17",
    "Visa renewal 2027",
    "hub",
    "projects/4f8c2d6a",
  ],
].map(([id, name, machineId, path]) => ({
  ...PROJECT,
  id,
  name,
  links: [],
  places: [
    {
      createdAt: new Date(NOW - 20 * DAY_MS).toISOString(),
      id: `place-${id}`,
      isPrimary: machineId !== "hub",
      kind: machineId === "hub" ? "hub" : "checkout",
      machineId,
      path,
      projectId: id,
      within: [],
    },
  ],
  primaryPlaceId: machineId === "hub" ? null : `place-${id}`,
}));
