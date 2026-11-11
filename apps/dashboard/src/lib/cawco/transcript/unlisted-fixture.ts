/**
 * A trim's approval as Cawco-Dev's Monday run puts it (hub unused-trim.ts):
 * its starting set as it stands, what its sessions called of it, and the
 * set without the 43 items none of them called in 30 days. Product-shaped
 * records for the states files (UnlistedTable.stories.ts, Prompt.stories.ts),
 * read through the product's own reading (core `unlistedOf`,
 * `presentPermission`), so a frame draws what the hub would send.
 */

import type { StartingSet } from "@cawco/core/delegate-types";
import {
  PROJECT_SETTINGS_TOOL,
  type PresentationContext,
  presentPermission,
  type SetStanding,
  type UnlistedTable,
  unlistedOf,
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

const of = (rows: typeof LEAVING | typeof STAYING, kind: "skill" | "server") =>
  rows.filter((row) => row[0] === kind).map((row) => row[1]);

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

/** The set and its sessions' calls over the days the hub keeps, as the hub reads them. */
const STANDING: SetStanding = {
  set: before,
  label: "Cawco-Dev's starting set",
  days: 120,
  calls: [...LEAVING, ...STAYING].flatMap(([kind, name, ago, sessions]) =>
    ago === null ? [] : [{ kind, name, lastAt: at(ago), sessions }]
  ),
};

/** What leaves, as the approval draws it. */
export const UNLISTED: UnlistedTable = unlistedOf(
  STANDING,
  TRIMMED
) as UnlistedTable;

/** A short one: the build type's set, three servers and skills. */
export const UNLISTED_SHORT: UnlistedTable = unlistedOf(
  {
    set: { skills: ["elysiajs", "effect-ts", "tdd"], servers: ["context7"] },
    label: "the build type's starting set",
    days: 120,
    calls: [
      { kind: "skill", name: "effect-ts", lastAt: at(49), sessions: 3 },
      { kind: "skill", name: "tdd", lastAt: at(2), sessions: 30 },
    ],
  },
  { skills: ["tdd"], servers: [] }
) as UnlistedTable;

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
