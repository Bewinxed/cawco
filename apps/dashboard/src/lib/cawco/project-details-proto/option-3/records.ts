/**
 * Domain records, fault counting, sync helper and design-graph fixtures for
 * Option 3 ("Read-First Project Passport"). Built directly on CawCo's core and
 * dashboard types with no parallel copies.
 */
import type { Account, ProjectAtLimit } from "@cawco/core/accounts";
import { ACCOUNT_HUES, type AccountHue } from "@cawco/core/accounts/kinds";
import {
  BUILT_IN,
  type BuiltInKind,
  DEFAULT_ROUTES,
  type DecidesTable,
  KIND_SEED,
  readDecides,
} from "@cawco/core/decides";
import type { LandsMode } from "@cawco/core/injected";
import { DAY_MS, MINUTE_MS } from "@cawco/core/time";
import type { TrackerSyncState, TrackerView } from "@cawco/core/trackers";
import type { ProjectPlace, ProjectRow } from "#lib/cawco/projects.js";

/** One hub read in the Passport: loading, failed with words, or settled. */
export type Read<T> =
  | { state: "reading" }
  | { state: "failed"; words: string }
  | { state: "read"; value: T };

/** Operating system families a fleet machine can report. */
export type PassportOs = "linux" | "mac" | "windows";

/** A machine in the fleet as a place row names and marks it. */
export interface PassportMachine {
  id: string;
  name: string;
  online: boolean;
  os: PassportOs;
}

/** The named account a project's sessions start on; null means fleet routing. */
export interface PassportAccount {
  hue: Account["hue"];
  name: string;
  signedIn: boolean;
}

/** Everything the Project Passport reads for one project. */
export interface PassportReading {
  account: Read<PassportAccount | null>;
  decides: Read<DecidesTable>;
  holdsCode: boolean;
  hubAwaySince: string | null;
  machines: PassportMachine[];
  project: ProjectRow;
  tracker: Read<TrackerView>;
}

/** Section anchors the separate rules sheet can open onto. */
export type RulesSection =
  "decides" | "landing" | "account" | "taskHome" | "lfs";

/** Which independent hub read a retry button refreshes. */
export type PassportReadKey = "decides" | "account" | "tracker";

/** Which Configure destination an inline recovery link opens. */
export type ConfigureTarget = "accounts" | "connections";

/** Every action the Passport and its bar emit. */
export interface PassportActs {
  addPlace: () => void;
  configure: (where: ConfigureTarget) => void;
  copy: (placeId: string) => void;
  drop: (placeId: string) => void;
  editRules: (section?: RulesSection) => void;
  findFolder: (placeId: string) => void;
  move: (placeId: string) => void;
  retry: (read: PassportReadKey) => void;
  sync: () => void;
}

/** Maps a machine OS family to the fingerprint prefix OsMark reads. */
export function osMarkOf(os: PassportOs): string {
  switch (os) {
    case "mac":
      return "darwin";
    case "linux":
      return "linux";
    case "windows":
      return "windows";
  }
}

const KNOWN_HUES: ReadonlySet<string> = new Set(ACCOUNT_HUES);

/** CSS token for an account's identity hue, falling back to blue if unknown. */
export function accountHueVar(hue: AccountHue): string {
  const safe: AccountHue = KNOWN_HUES.has(hue) ? hue : "blue";
  return `var(--color-account-${safe})`;
}

/** Host portion of a declared LFS URL, or the raw address when unparseable. */
export function lfsHostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const MEMBER_ORDER = ["you", "caw", "advisor", "practice", "asker"] as const;

/** Built-in kind ids in canonical display order. */
const BUILT_IN_KIND_IDS: readonly BuiltInKind[] = KIND_SEED.map(
  (kind) => kind.id as BuiltInKind
);

/** One line of the compact Who decides breakdown: who settles which kinds. */
export interface DecidesGroup {
  kindIds: string[];
  memberId: string;
  memberName: string;
}

const BUILT_IN_BY_ID: Readonly<Record<string, { name: string }>> = BUILT_IN;

/**
 * Groups the project's Who decides routes by the member who settles each kind,
 * in a stable reading order (You first, then Caw, Advisor, Common practice,
 * The agent, then any added members).
 */
export function decidesGroups(table: DecidesTable): DecidesGroup[] {
  const byMember = new Map<string, string[]>();
  const orderedKinds = [
    ...BUILT_IN_KIND_IDS,
    ...Object.keys(table.routes).filter(
      (id) => !BUILT_IN_KIND_IDS.includes(id as BuiltInKind)
    ),
  ];
  for (const kindId of orderedKinds) {
    const memberId = table.routes[kindId];
    if (!memberId) {
      continue;
    }
    const list = byMember.get(memberId) ?? [];
    list.push(kindId);
    byMember.set(memberId, list);
  }
  const rank = (id: string): number => {
    const at = MEMBER_ORDER.indexOf(id as (typeof MEMBER_ORDER)[number]);
    return at >= 0 ? at : MEMBER_ORDER.length;
  };
  return [...byMember.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([memberId, kindIds]) => ({
      memberId,
      memberName: BUILT_IN_BY_ID[memberId]?.name ?? memberId,
      kindIds,
    }));
}

/** How many kinds this project sets itself (as opposed to following the fleet). */
export function decidesOwnCount(table: DecidesTable): number {
  return Object.values(table.from).filter((source) => source === "project")
    .length;
}

/** Total number of kinds in the project's Who decides table. */
export function decidesTotalCount(table: DecidesTable): number {
  const count = Object.keys(table.routes).length;
  return count > 0 ? count : KIND_SEED.length;
}

/**
 * Total count of standing faults across the Passport: missing places,
 * signed-out account, unreadable rule file, refused sync, and each failed read.
 */
export function faultsOf(reading: PassportReading): number {
  let count = 0;
  for (const place of reading.project.places) {
    if (place.missing) {
      count += 1;
    }
  }
  if (reading.decides.state === "failed") {
    count += 1;
  } else if (
    reading.decides.state === "read" &&
    reading.decides.value.problems.length > 0
  ) {
    count += 1;
  }
  if (reading.account.state === "failed") {
    count += 1;
  } else if (
    reading.account.state === "read" &&
    reading.account.value !== null &&
    !reading.account.value.signedIn
  ) {
    count += 1;
  }
  if (reading.tracker.state === "failed") {
    count += 1;
  } else if (
    reading.tracker.state === "read" &&
    reading.tracker.value.binding?.state === "refused"
  ) {
    count += 1;
  }
  return count;
}

/**
 * Returns a copy of `reading` with its bound tracker placed in `state`:
 * `syncing` clears any refusal, `synced` stamps `polledAt` to now, and
 * `refused` records `reason`.
 */
export function withSync(
  reading: PassportReading,
  state: TrackerSyncState,
  reason: string | null = null
): PassportReading {
  if (reading.tracker.state !== "read" || !reading.tracker.value.binding) {
    return reading;
  }
  const { binding } = reading.tracker.value;
  return {
    ...reading,
    tracker: {
      state: "read",
      value: {
        ...reading.tracker.value,
        binding: {
          ...binding,
          state,
          polledAt: state === "synced" ? Date.now() : binding.polledAt,
          reason: state === "refused" ? (reason ?? binding.reason) : null,
        },
      },
    },
  };
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const NOW = Date.now();
const CREATED_AT = new Date(NOW - 41 * DAY_MS).toISOString();

const BASE_MACHINES: PassportMachine[] = [
  { id: "m-atlas", name: "atlas", os: "linux", online: true },
  { id: "m-nixbox", name: "nixbox", os: "linux", online: true },
  { id: "m-studio", name: "studio-mbp", os: "mac", online: false },
];

const MANY_MACHINES: PassportMachine[] = [
  ...BASE_MACHINES,
  { id: "m-work-mini", name: "work-mini", os: "mac", online: true },
  { id: "m-build-win", name: "build-win", os: "windows", online: true },
];

const makePlace = (
  overrides: Partial<ProjectPlace> &
    Pick<ProjectPlace, "id" | "machineId" | "path" | "kind" | "projectId">
): ProjectPlace => ({
  createdAt: CREATED_AT,
  found: true,
  isPrimary: false,
  made: false,
  missing: false,
  within: [],
  ...overrides,
});

const HYUCKSFIELD_PLACES: ProjectPlace[] = [
  makePlace({
    id: "hyucksfield-atlas",
    projectId: "hyucksfield",
    machineId: "m-atlas",
    kind: "checkout",
    isPrimary: true,
    path: "/home/sam/code/hyucksfield",
  }),
  makePlace({
    id: "hyucksfield-nixbox",
    projectId: "hyucksfield",
    machineId: "m-nixbox",
    kind: "checkout",
    made: true,
    path: "/srv/work/hyucksfield",
  }),
  makePlace({
    id: "hyucksfield-hub",
    projectId: "hyucksfield",
    machineId: "hub",
    kind: "hub",
    made: true,
    path: "projects/hyucksfield",
  }),
];

const makeProject = (
  overrides: Partial<ProjectRow> & {
    accountAtLimit?: ProjectAtLimit;
    lands?: LandsMode;
  } = {}
): ProjectRow => ({
  account: "acct-work-claude",
  accountAtLimit: "wait",
  cawHarness: "claude",
  cawModel: null,
  conversationInstanceId: null,
  createdAt: CREATED_AT,
  eventsOn: true,
  id: "hyucksfield",
  lands: "pr",
  lfsConnection: null,
  lfsUrl: null,
  links: ["github.com/hyucks/hyucksfield"],
  name: "Hyucksfield",
  places: HYUCKSFIELD_PLACES,
  primaryPlaceId: "hyucksfield-atlas",
  review: true,
  ...overrides,
});

const HYUCKSFIELD_DECIDES: DecidesTable = {
  routes: {
    look: "caw",
    behaviour: "caw",
    scope: "you",
    approach: "caw",
    rules: "you",
    tools: "caw",
  },
  from: {
    look: "fleet",
    behaviour: "fleet",
    scope: "project",
    approach: "fleet",
    rules: "project",
    tools: "fleet",
  },
  problems: [],
  yours: [],
};

const HYUCKSFIELD_ACCOUNT: PassportAccount = {
  name: "Work · Claude Max",
  hue: "blue",
  signedIn: true,
};

const HYUCKSFIELD_TRACKER: TrackerView = {
  tracker: "github",
  binding: {
    boundAt: NOW - 30 * DAY_MS,
    connection: "GitHub App · hyucks",
    githubProject: {
      fieldId: "PVTSSF_hyucks_status",
      id: "PVT_hyucks_4",
      map: {},
      number: 4,
      options: [
        { id: "opt-backlog", name: "Backlog" },
        { id: "opt-active", name: "In progress" },
        { id: "opt-review", name: "Review" },
        { id: "opt-done", name: "Done" },
      ],
      title: "Hyucksfield roadmap",
      url: "https://github.com/orgs/hyucks/projects/4",
    },
    githubProjectReason: null,
    linked: 42,
    polledAt: NOW - 4 * MINUTE_MS,
    provider: "github",
    reason: null,
    state: "synced",
    target: "hyucks/hyucksfield",
    targetName: "hyucks/hyucksfield",
    targetUrl: "https://github.com/hyucks/hyucksfield/issues",
  },
};

/** Everything healthy: code project Hyucksfield at rest. */
export const RESTING: PassportReading = {
  project: makeProject(),
  holdsCode: true,
  machines: BASE_MACHINES,
  decides: { state: "read", value: HYUCKSFIELD_DECIDES },
  account: { state: "read", value: HYUCKSFIELD_ACCOUNT },
  tracker: { state: "read", value: HYUCKSFIELD_TRACKER },
  hubAwaySince: null,
};

/** nixbox's checkout folder is missing on disk. */
export const MISSING_FOLDER: PassportReading = {
  ...RESTING,
  project: makeProject({
    places: HYUCKSFIELD_PLACES.map((place) =>
      place.id === "hyucksfield-nixbox" ? { ...place, missing: true } : place
    ),
  }),
};

/** The project's named account is signed out on every machine. */
export const SIGNED_OUT: PassportReading = {
  ...RESTING,
  account: {
    state: "read",
    value: { ...HYUCKSFIELD_ACCOUNT, signedIn: false },
  },
};

const UNREADABLE_PARSE = readDecides("---\nScope: manager\n---", {
  kinds: KIND_SEED,
  members: Object.values(BUILT_IN),
});

/** decides.md failed to parse, so every choice falls back to the person. */
export const RULE_FILE_UNREADABLE: PassportReading = {
  ...RESTING,
  decides: {
    state: "read",
    value: {
      routes: {
        look: "you",
        behaviour: "you",
        scope: "you",
        approach: "you",
        rules: "you",
        tools: "you",
      },
      from: {
        look: "fleet",
        behaviour: "fleet",
        scope: "fleet",
        approach: "fleet",
        rules: "fleet",
        tools: "fleet",
      },
      problems: UNREADABLE_PARSE.ok
        ? ["decides.md could not be read."]
        : UNREADABLE_PARSE.problems,
      yours: [],
    },
  },
};

/** GitHub refused the mirror connection. */
export const SYNC_REFUSED: PassportReading = withSync(
  RESTING,
  "refused",
  "Resource not accessible by integration (403): the GitHub App lost access to hyucks/hyucksfield"
);

/** Mirror is actively syncing right now. */
export const SYNCING: PassportReading = withSync(RESTING, "syncing");

/** Standing reads are still in flight from the hub. */
export const READING: PassportReading = {
  ...RESTING,
  decides: { state: "reading" },
  account: { state: "reading" },
  tracker: { state: "reading" },
};

/** Hub went out of reach at 14:02; cached facts show with sending controls off. */
export const HUB_AWAY: PassportReading = {
  ...RESTING,
  hubAwaySince: "14:02",
};

/** A third checkout sits on offline Mac studio-mbp with a long path. */
export const OFFLINE_MACHINE: PassportReading = {
  ...RESTING,
  project: makeProject({
    places: [
      HYUCKSFIELD_PLACES[0],
      HYUCKSFIELD_PLACES[1],
      makePlace({
        id: "hyucksfield-studio",
        projectId: "hyucksfield",
        machineId: "m-studio",
        kind: "checkout",
        path: "/Users/sam/Projects/hyucksfield-design-handoff-2026/branding-and-launch-assets",
      }),
      HYUCKSFIELD_PLACES[2],
    ],
  }),
};

/** Six places with long paths across five machines, plus LFS and two repositories. */
export const MANY_PLACES: PassportReading = {
  ...RESTING,
  machines: MANY_MACHINES,
  project: makeProject({
    accountAtLimit: "move",
    lfsUrl: "https://lfs.hyucks.org/hyucks/hyucksfield.git/info/lfs",
    lfsConnection: "LFS key · hyucks",
    links: [
      "github.com/hyucks/hyucksfield",
      "github.com/hyucks/hyucksfield-site",
    ],
    places: [
      makePlace({
        id: "hyucksfield-atlas",
        projectId: "hyucksfield",
        machineId: "m-atlas",
        kind: "checkout",
        isPrimary: true,
        path: "/home/sam/code/climbing-gyms/hyucksfield-platform/monorepo",
      }),
      makePlace({
        id: "hyucksfield-nixbox",
        projectId: "hyucksfield",
        machineId: "m-nixbox",
        kind: "checkout",
        made: true,
        path: "/srv/work/deployments/production-mirrors/hyucksfield-platform",
      }),
      makePlace({
        id: "hyucksfield-studio",
        projectId: "hyucksfield",
        machineId: "m-studio",
        kind: "checkout",
        path: "/Users/sam/Projects/hyucksfield-design-handoff-2026/branding-and-launch-assets",
      }),
      makePlace({
        id: "hyucksfield-mini",
        projectId: "hyucksfield",
        machineId: "m-work-mini",
        kind: "checkout",
        path: "/Users/sam/Workspace/clients/hyucksfield/ios-kiosk-companion",
      }),
      makePlace({
        id: "hyucksfield-win",
        projectId: "hyucksfield",
        machineId: "m-build-win",
        kind: "checkout",
        path: "C:/work/ci-runners/hyucksfield-platform/windows-packaging",
      }),
      makePlace({
        id: "hyucksfield-hub",
        projectId: "hyucksfield",
        machineId: "hub",
        kind: "hub",
        made: true,
        path: "projects/hyucksfield",
      }),
    ],
  }),
};

/** Non-code project: Launch posts, hub folder only, CawCo files, fleet routing. */
export const NOT_CODE: PassportReading = {
  project: makeProject({
    id: "launch-posts",
    name: "Launch posts",
    account: null,
    accountAtLimit: "wait",
    lands: "none",
    lfsUrl: null,
    lfsConnection: null,
    links: [],
    primaryPlaceId: null,
    review: false,
    places: [
      makePlace({
        id: "launch-posts-hub",
        projectId: "launch-posts",
        machineId: "hub",
        kind: "hub",
        made: true,
        path: "projects/launch-posts",
      }),
    ],
  }),
  holdsCode: false,
  machines: BASE_MACHINES,
  decides: {
    state: "read",
    value: {
      routes: { ...DEFAULT_ROUTES },
      from: {
        look: "fleet",
        behaviour: "fleet",
        scope: "fleet",
        approach: "fleet",
        rules: "fleet",
        tools: "fleet",
      },
      problems: [],
      yours: [],
    },
  },
  account: { state: "read", value: null },
  tracker: {
    state: "read",
    value: { tracker: "cawco", binding: null },
  },
  hubAwaySince: null,
};
