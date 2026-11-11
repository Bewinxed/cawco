/**
 * Changes to a starting set as their approvals draw them, product-shaped
 * records for the states files (SetChangeTable.stories.ts,
 * Prompt.stories.ts), read through the product's own reading (core
 * `setTablesOf`, `presentPermission`), so a frame draws what the hub would
 * send:
 * - a trim, as Cawco-Dev's Monday run puts it (hub unused-trim.ts): its
 *   set as it stands, what its sessions called of it, and the set without
 *   the 43 items none of them called in 30 days;
 * - a new set, as Caw proposes it while he sets Harbourline Bakery up
 *   (the project-setup skill): 25 skills and servers, each with the
 *   fleet's calls of it;
 * - a type's set that gains two items and loses one.
 */

import type { StartingSet } from "@cawco/core/delegate-types";
import {
  PROJECT_SETTINGS_TOOL,
  type PresentationContext,
  presentPermission,
  type SetChangeTable,
  type SetStanding,
  setTablesOf,
} from "@cawco/core/permission-presentation";
import { DAY_MS, HOUR_MS } from "@cawco/core/time";

/** How long ago a call was, in days; null: none in the window the hub keeps. */
type Ago = number | null;

/** What leaves: each skill or server, its last call and how many sessions called it. */
const LEAVING: [
  kind: "skill" | "server",
  name: string,
  ago: Ago,
  sessions: number,
][] = [
  ["server", "ElevenLabs", null, 0],
  ["server", "Google Slides", 71, 1],
  ["skill", "remotion-best-practices", null, 0],
  ["skill", "remotion-render", null, 0],
  ["skill", "remotion-docs", null, 0],
  ["skill", "remotion-to-hyperframes", null, 0],
  ["skill", "hyperframes-audio", 64, 2],
  ["skill", "hyperframes-keyframes", 64, 2],
  ["skill", "hyperframes-registry", null, 0],
  ["skill", "talking-head-recut", null, 0],
  ["skill", "music-to-video", null, 0],
  ["skill", "faceless-explainer", null, 0],
  ["skill", "product-launch-video", 41, 1],
  ["skill", "pr-to-video", 38, 3],
  ["skill", "embedded-captions", null, 0],
  ["skill", "general-video", null, 0],
  ["skill", "slideshow", null, 0],
  ["skill", "x-twitter-growth-system", null, 0],
  ["skill", "x-account-warmup", null, 0],
  ["skill", "ios-monetization-expert", null, 0],
  ["skill", "apple-app-intents", 52, 1],
  ["skill", "animate-expo", null, 0],
  ["skill", "rive-skills", 47, 4],
  ["skill", "rossark-motion-skill", null, 0],
  ["skill", "pixel2motion", null, 0],
  ["skill", "motion-graphics", 33, 6],
  ["skill", "kika-design-system", null, 0],
  ["skill", "daisyui", null, 0],
  ["skill", "figma", 58, 2],
  ["skill", "anatomy", null, 0],
  ["skill", "backlot", null, 0],
  ["skill", "zele", 44, 1],
  ["skill", "ponytail", null, 0],
  ["skill", "makefaster", 36, 2],
  ["skill", "drift", null, 0],
  ["skill", "restyle", 61, 1],
  ["skill", "elysiajs", null, 0],
  ["skill", "effect-ts", 49, 3],
  ["skill", "dataviz", null, 0],
  ["skill", "deep-research", null, 0],
  ["skill", "prepkit-product:product-metrics-analysis", null, 0],
  ["skill", "prepkit-product:product-user-interview-design", null, 0],
  ["skill", "hairline-create", null, 0],
];

/** What stays: called in the last 30 days. */
const STAYING: [
  kind: "skill" | "server",
  name: string,
  ago: number,
  sessions: number,
][] = [
  ["server", "chrome-devtools", 0, 212],
  ["server", "Exa_ai", 1, 96],
  ["server", "crw", 2, 41],
  ["skill", "writing-for-agents", 0, 318],
  ["skill", "mattpocock-skills:writing-for-agents", 3, 22],
  ["skill", "frontend-design", 1, 87],
  ["skill", "impeccable:impeccable", 4, 12],
  ["skill", "svelte-foundations:coding", 0, 143],
  ["skill", "code-foundations:debug", 6, 9],
  ["skill", "humanizer", 12, 3],
];

const now = Date.now();
const at = (ago: number) => now - ago * DAY_MS - 3 * HOUR_MS;

const of = (
  rows: [kind: "skill" | "server", name: string, ...rest: unknown[]][],
  kind: "skill" | "server"
) => rows.filter((row) => row[0] === kind).map((row) => row[1]);

/** Cawco-Dev's starting set as it stands. */
const before: StartingSet = {
  skills: [...of(STAYING, "skill"), ...of(LEAVING, "skill")],
  servers: [...of(STAYING, "server"), ...of(LEAVING, "server")],
};

/** The set the run proposes: what its sessions called. */
const TRIMMED: StartingSet = {
  skills: of(STAYING, "skill"),
  servers: of(STAYING, "server"),
};

/** Rows of calls as the count gives them, those with none left out. */
const called = (
  rows: [kind: "skill" | "server", name: string, ago: Ago, sessions: number][]
) =>
  rows.flatMap(([kind, name, ago, sessions]) =>
    ago === null ? [] : [{ kind, name, lastAt: at(ago), sessions }]
  );

/** The set and its sessions' calls over the days the hub keeps, as the hub reads them. */
const STANDING: SetStanding = {
  set: before,
  label: "Cawco-Dev's starting set",
  days: 120,
  calls: called([...LEAVING, ...STAYING]),
  fleetCalls: () => [],
};

/** The one table a change draws that moves items one way. */
const oneTable = (standing: SetStanding, after: StartingSet): SetChangeTable =>
  setTablesOf(standing, after)[0] as SetChangeTable;

/** What leaves, as the approval draws it. */
export const UNLISTED: SetChangeTable = oneTable(STANDING, TRIMMED);

/** A short one: the build type's set, three servers and skills. */
export const UNLISTED_SHORT: SetChangeTable = oneTable(
  {
    set: { skills: ["elysiajs", "effect-ts", "tdd"], servers: ["context7"] },
    label: "the build type's starting set",
    days: 120,
    calls: [
      { kind: "skill", name: "effect-ts", lastAt: at(49), sessions: 3 },
      { kind: "skill", name: "tdd", lastAt: at(2), sessions: 30 },
    ],
    fleetCalls: () => [],
  },
  { skills: ["tdd"], servers: [] }
);

/**
 * What Caw proposes Harbourline Bakery's sessions start with, a web app
 * for the bakery's wholesale orders: what sessions doing this kind of work
 * called across the fleet, each with every session's calls of it over the
 * days the hub keeps. Two it judged the work needs that no session called.
 */
const PROPOSED: [
  kind: "skill" | "server",
  name: string,
  ago: Ago,
  sessions: number,
][] = [
  ["skill", "svelte-foundations:coding", 0, 412],
  ["skill", "frontend-design", 0, 287],
  ["skill", "writing-for-agents", 0, 318],
  ["skill", "impeccable:impeccable", 1, 164],
  ["skill", "code-foundations:debug", 0, 201],
  ["skill", "mattpocock-skills:tdd", 2, 58],
  ["skill", "tailwind-best-practices", 1, 133],
  ["skill", "defensive-css", 3, 71],
  ["skill", "moderncss", 4, 46],
  ["skill", "mobile-native", 6, 39],
  ["skill", "interfaces:better-accessibility", 9, 27],
  ["skill", "interfaces:better-writing", 12, 18],
  ["skill", "clean-copy", 5, 52],
  ["skill", "make-interfaces-feel-better", 8, 24],
  ["skill", "svelte-foundations:sveltekit-docs", 2, 96],
  ["skill", "code-foundations:aposd-designing-deep-modules", 27, 7],
  ["skill", "dataviz", 44, 3],
  ["skill", "elysiajs", 19, 11],
  ["skill", "zele", null, 0],
  ["skill", "prepkit-product:product-prd-authoring", null, 0],
  ["server", "chrome-devtools", 0, 523],
  ["server", "context7", 0, 241],
  ["server", "Exa_ai", 1, 178],
  ["server", "crw", 2, 88],
  ["server", "deepwiki", 15, 14],
];

/** Harbourline Bakery has no set yet: its sessions start with everything. */
const SETUP_STANDING: SetStanding = {
  set: null,
  label: "Harbourline Bakery's starting set",
  days: 120,
  calls: [],
  fleetCalls: () => called(PROPOSED),
};

/** The set Caw proposes. */
const NEW_SET: StartingSet = {
  skills: of(PROPOSED, "skill"),
  servers: of(PROPOSED, "server"),
};

/** What joins, as the approval draws it: the whole new set. */
export const NEW_SET_TABLE: SetChangeTable = oneTable(SETUP_STANDING, NEW_SET);

/** The routine's run asking, as the hub parks it: `project_settings` with `set_starting_set`. */
const input = {
  changes: [{ kind: "set_starting_set", startingSet: TRIMMED }],
  reason:
    "Its sessions called none of these in the last 30 days; each stays installed.",
  project: "Cawco-Dev",
};

const context: PresentationContext = {
  asker: "Unused skills and servers",
  project: "Cawco-Dev",
  current: () => undefined,
  memory: () => undefined,
  projectName: () => undefined,
  startingSet: () => STANDING,
};

/** The trim's ask as the client holds it parked (its PendingPermission). */
export const TRIM_REQUEST = {
  heard: 0,
  input,
  instanceId: "trim-run",
  presentation: presentPermission(PROJECT_SETTINGS_TOOL, input, context),
  requestId: "trim-request",
  toolName: PROJECT_SETTINGS_TOOL,
};

/** Caw's proposal at setup, as the hub parks it: `project_settings` with `set_starting_set` and `ask: true`. */
const setupInput = {
  changes: [{ kind: "set_starting_set", startingSet: NEW_SET }],
  reason:
    "Sessions building Svelte web apps on the fleet called these; the order tracker's work needs the same, and a session starts lighter without the rest.",
  ask: true,
  project: "Harbourline Bakery",
};

/** Caw's ask for the new set as the client holds it parked. */
export const NEW_SET_REQUEST = {
  heard: 0,
  input: setupInput,
  instanceId: "caw-harbourline",
  presentation: presentPermission(PROJECT_SETTINGS_TOOL, setupInput, {
    ...context,
    asker: "Caw",
    project: "Harbourline Bakery",
    startingSet: () => SETUP_STANDING,
  }),
  requestId: "setup-starting-set",
  toolName: PROJECT_SETTINGS_TOOL,
};

/** The build type's set as it stands, and the fleet's calls of what joins it. */
const BUILD_STANDING: SetStanding = {
  set: {
    skills: ["svelte-foundations:coding", "code-foundations:debug", "elysiajs"],
    servers: ["context7"],
  },
  label: "the build type's starting set",
  days: 120,
  calls: [
    {
      kind: "skill",
      name: "svelte-foundations:coding",
      lastAt: at(0),
      sessions: 212,
    },
    {
      kind: "skill",
      name: "code-foundations:debug",
      lastAt: at(1),
      sessions: 96,
    },
    { kind: "skill", name: "elysiajs", lastAt: at(83), sessions: 2 },
    { kind: "server", name: "context7", lastAt: at(0), sessions: 140 },
  ],
  fleetCalls: () => [
    {
      kind: "skill",
      name: "mattpocock-skills:tdd",
      lastAt: at(2),
      sessions: 58,
    },
    { kind: "server", name: "chrome-devtools", lastAt: at(0), sessions: 523 },
  ],
};

/** A session asks to change the build type: two items join its set and one leaves. */
const typeInput = {
  action: "put",
  name: "build",
  description:
    "Builds a slice end to end and proves it with the repo's checks.",
  harness: "claude",
  model: "claude-opus-5-5",
  effort: "high",
  startingSet: {
    skills: [
      "svelte-foundations:coding",
      "code-foundations:debug",
      "mattpocock-skills:tdd",
    ],
    servers: ["context7", "chrome-devtools"],
  },
  reason:
    "Build sessions test first and check the screen they change; none called elysiajs since August.",
};

/** The type change's ask as the client holds it parked. */
export const TYPE_SET_REQUEST = {
  heard: 0,
  input: typeInput,
  instanceId: "cockpit-orchestrator",
  presentation: presentPermission(
    "mcp__cawco__admin_delegate_types_write",
    typeInput,
    {
      ...context,
      asker: "Interview owner on Fable 5.2 preferences",
      current: (group) =>
        group === "delegate_types"
          ? {
              description: typeInput.description,
              harness: "claude",
              model: "claude-opus-5-5",
              effort: "high",
              startingSet: BUILD_STANDING.set,
            }
          : undefined,
      startingSet: () => BUILD_STANDING,
    }
  ),
  requestId: "type-starting-set",
  toolName: "mcp__cawco__admin_delegate_types_write",
};
