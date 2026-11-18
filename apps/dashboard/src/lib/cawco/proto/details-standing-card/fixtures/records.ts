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
import type { AccountChoice, DecidesStanding, PlaceFolder } from "../details";

/** The reading every time is set from: 14:02 on 18 November 2026. */
const READ_AT = Date.parse("2026-11-18T14:02:00.000Z");

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

/** Its own rule on two kinds: look and words, and scope, come to the person. */
export const DECIDES_OWN: DecidesStanding = {
  state: "own",
  kinds: [
    { kind: "look", by: "you", own: true },
    { kind: "behaviour", by: "caw", own: false },
    { kind: "scope", by: "you", own: true },
    { kind: "approach", by: "advisor", own: false },
    { kind: "rules", by: "you", own: false },
    { kind: "tools", by: "practice", own: false },
  ],
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
