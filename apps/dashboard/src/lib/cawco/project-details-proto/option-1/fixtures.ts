/**
 * Option 1's records, shaped as the hub answers them: one code project,
 * hyucksfield, on three of the fleet's machines, tied to GitHub Issues, with
 * its board's tasks. Each situation the anchors meet (a folder gone, an
 * account signed out, a sync refused, the rule file unreadable, a project
 * with no code) is this record with one fact changed.
 */

import type { Stage, TaskSummary } from "@cawco/core/task-views";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";
import type { ProjectPlace, ProjectRow } from "#lib/cawco/projects.js";
import type { GovernedRecord } from "./records";

/** The frames' clock: every age in the records is read against it. */
export const NOW = Date.parse("2026-11-20T15:40:00Z");

const PROJECT_ID = "prj_hyucksfield";

const place = (
  id: string,
  machineId: string,
  path: string,
  facts: Partial<ProjectPlace> = {}
): ProjectPlace => ({
  createdAt: new Date(NOW - 40 * DAY_MS).toISOString(),
  found: true,
  id,
  isPrimary: false,
  kind: "checkout",
  machineId,
  made: false,
  missing: false,
  path,
  projectId: PROJECT_ID,
  within: [],
  ...facts,
});

const PLACES: ProjectPlace[] = [
  place("pl_studio", "m_studio", "/Users/sam/code/hyucksfield", {
    isPrimary: true,
  }),
  place(
    "pl_obelisk",
    "m_obelisk",
    "/srv/work/clients/northwind-traders/2026/hyucksfield-landing-site",
    { made: true }
  ),
  place("pl_nixbox", "m_nixbox", "/home/sam/src/hyucksfield"),
  place("pl_hub", "hub", `projects/${PROJECT_ID}`, { kind: "hub" }),
];

const PROJECT: ProjectRow = {
  account: "acc_studio",
  accountAtLimit: "wait",
  areaId: null,
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: "inst_caw_hyucksfield",
  createdAt: new Date(NOW - 40 * DAY_MS).toISOString(),
  eventsOn: true,
  id: PROJECT_ID,
  lands: "pr",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/samleelabs/hyucksfield"],
  name: "hyucksfield",
  places: PLACES,
  primaryPlaceId: "pl_studio",
  review: true,
};

/** hyucksfield as it stands on an ordinary Thursday: nothing in trouble. */
export const HYUCKSFIELD: GovernedRecord = {
  accounts: [
    {
      id: "acc_studio",
      name: "Studio Max",
      hue: "var(--color-account-blue)",
      signedIn: true,
    },
    {
      id: "acc_personal",
      name: "Personal Pro",
      hue: "var(--color-account-green)",
      signedIn: true,
    },
    {
      id: "acc_northwind",
      name: "Northwind Traders (client)",
      hue: "var(--color-account-amber)",
      signedIn: true,
    },
    {
      id: "acc_openai",
      name: "ChatGPT Plus",
      hue: "var(--color-account-cyan)",
      signedIn: false,
    },
  ],
  caw: { on: true, line: "Reading the checkout tests for tsk-58" },
  connections: {
    state: "read",
    value: [
      {
        name: "GitHub App · samleelabs",
        service: "github",
        account: "samleelabs",
        holdsKey: true,
      },
      {
        name: "Personal token",
        service: "github",
        account: "sam-lee",
        holdsKey: false,
      },
      {
        name: "Linear · Northwind",
        service: "linear",
        account: "Sam Lee",
        holdsKey: false,
      },
    ],
  },
  decides: {
    state: "read",
    value: {
      look: { member: "you", fleet: "you", own: false },
      behaviour: { member: "you", fleet: "you", own: false },
      scope: { member: "caw", fleet: "you", own: true },
      approach: { member: "advisor", fleet: "advisor", own: false },
      rules: { member: "advisor", fleet: "advisor", own: false },
      tools: { member: "practice", fleet: "practice", own: false },
    },
  },
  holdsCode: true,
  hub: { reachable: true },
  largeFiles: { kind: "own" },
  machines: [
    {
      id: "m_studio",
      name: "studio-mac",
      os: "darwin",
      online: true,
      left: false,
      home: "/Users/sam",
    },
    {
      id: "m_obelisk",
      name: "obelisk",
      os: "linux",
      online: true,
      left: false,
      home: "/home/sam",
    },
    {
      id: "m_nixbox",
      name: "nixbox",
      os: "linux",
      online: false,
      left: false,
      home: "/home/sam",
    },
  ],
  project: PROJECT,
  tracker: {
    state: "read",
    value: {
      tracker: "github",
      binding: {
        boundAt: NOW - 21 * DAY_MS,
        connection: "GitHub App · samleelabs",
        githubProject: {
          fieldId: "PVTSSF_status",
          id: "PVT_roadmap",
          map: {},
          number: 4,
          options: [
            { id: "o_todo", name: "Todo" },
            { id: "o_doing", name: "In progress" },
            { id: "o_review", name: "In review" },
            { id: "o_done", name: "Done" },
          ],
          title: "Hyucksfield roadmap",
          url: "https://github.com/users/samleelabs/projects/4",
        },
        githubProjectReason: null,
        linked: 12,
        polledAt: NOW - 4 * MINUTE_MS,
        provider: "github",
        reason: null,
        state: "synced",
        target: "samleelabs/hyucksfield",
        targetName: "samleelabs/hyucksfield",
        targetUrl: "https://github.com/samleelabs/hyucksfield",
      },
    },
  },
  waiting: 3,
  youStages: ["Review"],
};

/** The board's stages, as hyucksfield's stages.md names them. */
export const STAGES: Stage[] = [
  { name: "Backlog", kind: "todo", hooks: {} },
  { name: "Doing", kind: "active", hooks: {} },
  { name: "Review", kind: "you", hooks: {} },
  { name: "Done", kind: "done", hooks: {} },
];

const task = (
  number: number,
  stage: string,
  title: string,
  facts: Partial<TaskSummary> = {}
): TaskSummary => {
  const kind = STAGES.find((s) => s.name === stage)?.kind ?? null;
  return {
    archivedAt: null,
    attempts: [],
    builtOn: [],
    closeReason: null,
    completedAt: kind === "done" ? NOW - 2 * DAY_MS : null,
    createdAt: NOW - (number % 9) * DAY_MS - 3 * HOUR_MS,
    createdBy: null,
    droppedAt: null,
    duplicateOf: null,
    fields: {},
    foundIn: null,
    heldBy: null,
    id: `tsk-${number}`,
    kind,
    labels: [],
    lastAttemptFailed: false,
    lastAttemptStopped: false,
    links: [],
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
    startedAt: kind === "todo" ? null : NOW - DAY_MS,
    startProblem: null,
    title,
    todos: { done: 0, total: 0 },
    type: null,
    unblocks: [],
    updatedAt: NOW - (number % 5) * HOUR_MS,
    updatedBy: null,
    waits: [],
    waitsOn: [],
    ...facts,
  };
};

/** hyucksfield's open tasks: few enough that the board fits one screen. */
export const TASKS: TaskSummary[] = [
  task(61, "Backlog", "Swap the hero video for a still on slow connections", {
    labels: ["landing"],
  }),
  task(
    62,
    "Backlog",
    "Give the pricing table a yearly toggle that keeps the plan picked"
  ),
  task(64, "Backlog", "Move the newsletter form under the case studies"),
  task(58, "Doing", "Make checkout keep the basket when the card is declined", {
    labels: ["checkout"],
    todos: { done: 2, total: 5 },
  }),
  task(59, "Doing", "Cut the font files to the two weights the site uses", {
    todos: { done: 1, total: 3 },
  }),
  task(55, "Review", "Northwind's logo wall: replace the three blurry logos"),
  task(
    56,
    "Review",
    "Rewrite the FAQ's shipping answers for the new courier, including the islands surcharge"
  ),
  task(57, "Review", "Add the cookie banner's reject button at equal weight"),
  task(51, "Done", "Fix the footer links that 404 since the blog moved"),
];

/** What the hub says of the project as the frame opens: each a situation the anchors meet. */
export const SITUATIONS = [
  "As it stands",
  "A folder is missing",
  "Its account is signed out",
  "GitHub refused the sync",
  "Its rule file does not read",
  "Still reading",
  "Hub out of reach",
  "A project with no code",
] as const;
export type Situation = (typeof SITUATIONS)[number];

/** hyucksfield in one situation: the record with that one fact changed. */
export function situated(
  record: GovernedRecord,
  situation: Situation
): GovernedRecord {
  switch (situation) {
    case "As it stands":
      return record;
    case "A folder is missing":
      return {
        ...record,
        project: {
          ...record.project,
          places: record.project.places.map((p) =>
            p.isPrimary ? { ...p, missing: true } : p
          ),
        },
      };
    case "Its account is signed out":
      return {
        ...record,
        accounts: record.accounts.map((a) =>
          a.id === record.project.account ? { ...a, signedIn: false } : a
        ),
      };
    case "GitHub refused the sync": {
      if (record.tracker.state !== "read" || !record.tracker.value.binding) {
        return record;
      }
      const { binding } = record.tracker.value;
      return {
        ...record,
        tracker: {
          state: "read",
          value: {
            ...record.tracker.value,
            binding: {
              ...binding,
              state: "refused",
              polledAt: NOW - 3 * HOUR_MS,
              reason:
                "Resource not accessible by integration: the GitHub App samleelabs is no longer installed on samleelabs/hyucksfield (403).",
            },
          },
        },
      };
    }
    case "Its rule file does not read":
      return {
        ...record,
        decides: {
          state: "failed",
          reason:
            "decides.md line 4: `scope: carw` names no member (unknown member).",
        },
      };
    case "Still reading":
      return {
        ...record,
        decides: { state: "reading" },
        tracker: { state: "reading" },
        connections: { state: "reading" },
      };
    case "Hub out of reach":
      return {
        ...record,
        hub: { reachable: false, asOf: NOW - 6 * MINUTE_MS },
      };
    case "A project with no code":
      return {
        ...record,
        holdsCode: false,
        caw: { on: true, line: "Drafting Friday's launch thread" },
        project: {
          ...record.project,
          name: "Northwind launch posts",
          links: [],
          lands: "none",
          places: record.project.places.filter((p) => p.kind === "hub"),
          primaryPlaceId: null,
        },
        tracker: { state: "read", value: { tracker: "cawco", binding: null } },
      };
    default:
      return record;
  }
}

/** The fleet's other projects, as the sidebar lists them beside hyucksfield. */
export const OTHER_PROJECTS: ProjectRow[] = [
  ["prj_pantry", "pantry-rewrite", "m_obelisk", "/home/sam/code/pantry"],
  ["prj_northwind", "Northwind launch posts", "hub", "projects/prj_northwind"],
  ["prj_cawco", "cockpit", "m_obelisk", "/home/sam/cockpit"],
  ["prj_kit", "Brand kit 2027", "m_studio", "/Users/sam/Design/brand-kit-2027"],
  ["prj_notes", "Research: courier APIs", "hub", "projects/prj_notes"],
].map(([id, name, machineId, path]) => ({
  ...PROJECT,
  id,
  name,
  links: [],
  account: null,
  lands: "branch",
  conversationInstanceId: null,
  places: [
    place(`pl_${id}`, machineId, path, {
      projectId: id,
      isPrimary: true,
      kind: machineId === "hub" ? "hub" : "checkout",
    }),
  ],
  primaryPlaceId: `pl_${id}`,
}));
