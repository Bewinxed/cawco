/**
 * The Settings view's states files' records (the stories' mock data, never
 * the product's): Lantern web, a code project, in each situation the person
 * meets, and Field notes, a writing project. Shaped as the hub answers
 * (records.ts), fed whole to the view as its prop.
 */

import { CLAUDE_PROVIDER } from "@cawco/core/accounts";
import {
  BUILT_IN,
  type BuiltInKind,
  DEFAULT_ROUTES,
  KIND_SEED,
} from "@cawco/core/decides";
import type {
  FleetAccount,
  FleetMachine,
  KindRule,
  SettingsRecord,
  TrackerTie,
  WhoDecidesRead,
} from "./records";

const minutesAgo = (minutes: number): string =>
  new Date(Date.now() - minutes * 60_000).toISOString();

const MACHINES: FleetMachine[] = [
  {
    id: "m-atlas",
    name: "atlas",
    os: "linux",
    online: true,
    home: "/home/mara",
  },
  {
    id: "m-kestrel",
    name: "kestrel",
    os: "darwin",
    online: true,
    home: "/Users/mara",
  },
  {
    id: "m-quarry",
    name: "quarry",
    os: "linux",
    online: true,
    home: "/home/mara",
  },
];

const ACCOUNTS: FleetAccount[] = [
  {
    id: "acc-studio",
    name: "Studio Max",
    hue: "violet",
    provider: CLAUDE_PROVIDER,
    signedIn: true,
  },
  {
    id: "acc-northwind",
    name: "Northwind client",
    hue: "cyan",
    provider: CLAUDE_PROVIDER,
    signedIn: true,
  },
  {
    id: "acc-personal",
    name: "Personal Pro",
    hue: "amber",
    provider: CLAUDE_PROVIDER,
    signedIn: false,
  },
  {
    id: "acc-codex",
    name: "Codex team",
    hue: "green",
    provider: "openai",
    signedIn: true,
  },
];

/** The fleet's defaults these stories stand on: core's seed. */
const FLEET_RULE: Partial<Record<string, string>> = DEFAULT_ROUTES;

const MEMBERS = [
  BUILT_IN.you,
  BUILT_IN.caw,
  BUILT_IN.advisor,
  BUILT_IN.practice,
];

/** The project's Who decides: the fleet's defaults, with the kinds it settles its own way. */
const rules = (
  own: Partial<Record<BuiltInKind, string>>,
  unread: string | null = null
): WhoDecidesRead => {
  const mine = (kind: string): string | undefined =>
    Object.entries(own).find(([id]) => id === kind)?.[1];
  const rule = (kind: string): KindRule => {
    const fleet = FLEET_RULE[kind] ?? BUILT_IN.you.id;
    const set = mine(kind);
    return { fleet, by: set ?? fleet, own: set !== undefined };
  };
  return {
    kinds: KIND_SEED,
    members: MEMBERS,
    rules: Object.fromEntries(
      KIND_SEED.map((kind) => [kind.id, rule(kind.id)])
    ),
    unread,
  };
};

/**
 * A code project at rest, the weekly check: two places on the fleet's
 * machines and its folder on the hub, one repository, tasks in CawCo's own
 * files, a named account, two kinds settled its own way, you marking tasks
 * done, work landing on a branch with a pull request.
 */
const LANTERN: SettingsRecord = {
  project: { id: "lantern-web", name: "Lantern web" },
  holdsCode: true,
  hubReachable: true,
  asOf: minutesAgo(0),
  machines: MACHINES,
  places: [
    {
      id: "p-atlas",
      kind: "start",
      machineId: "m-atlas",
      path: "/home/mara/code/lantern-web",
      missing: false,
      locateTo: null,
      madeByCawco: false,
    },
    {
      id: "p-kestrel",
      kind: "other",
      machineId: "m-kestrel",
      path: "/Users/mara/Projects/clients/lantern/lantern-web",
      missing: false,
      locateTo: null,
      madeByCawco: true,
    },
    {
      id: "p-hub",
      kind: "hub",
      machineId: null,
      path: "/var/lib/cawco/projects/lantern-web",
      missing: false,
      locateTo: null,
      madeByCawco: true,
    },
  ],
  repos: [
    {
      host: "github.com",
      owner: "lantern-studio",
      name: "lantern-web",
      url: "https://github.com/lantern-studio/lantern-web",
    },
  ],
  taskHome: "files",
  tie: null,
  account: { chosen: "acc-studio", atLimit: "wait" },
  accounts: ACCOUNTS,
  whoDecides: rules({ scope: "caw", tools: "caw" }),
  landing: "pr",
  largeFiles: { kind: "own" },
};

/** Lantern web's tie to GitHub Issues through its GitHub App, in step four minutes ago. */
const LANTERN_TIE: TrackerTie = {
  home: "github",
  target: {
    id: "lantern-studio/lantern-web",
    label: "lantern-studio/lantern-web",
    url: "https://github.com/lantern-studio/lantern-web/issues",
  },
  connection: { name: "Lantern GitHub App", account: "lantern-studio" },
  linked: 148,
  statusesRefused: null,
  statusesAdded: null,
  sync: { kind: "inStep", at: minutesAgo(4) },
  githubProject: {
    name: "Lantern roadmap",
    url: "https://github.com/orgs/lantern-studio/projects/7",
  },
};

/**
 * The same project once its tasks are tied to GitHub Issues and the
 * tracker refused the last sync, and its folder on kestrel was renamed by
 * hand: two stages in trouble.
 */
const LANTERN_IN_TROUBLE: SettingsRecord = {
  ...LANTERN,
  places: LANTERN.places.map((place) =>
    place.id === "p-kestrel" ? { ...place, missing: true } : place
  ),
  taskHome: "github",
  tie: {
    ...LANTERN_TIE,
    sync: {
      kind: "refused",
      at: minutesAgo(42),
      words:
        "Resource not accessible by integration: the app's installation no longer includes lantern-web (403).",
    },
  },
};

/** A writing project: no repository, so its work ends at what waits for the person. */
const FIELD_NOTES: SettingsRecord = {
  project: { id: "field-notes", name: "Field notes" },
  holdsCode: false,
  hubReachable: true,
  asOf: minutesAgo(0),
  machines: MACHINES,
  places: [
    {
      id: "fn-kestrel",
      kind: "start",
      machineId: "m-kestrel",
      path: "/Users/mara/Documents/Writing/field-notes-2026",
      missing: false,
      locateTo: null,
      madeByCawco: false,
    },
    {
      id: "fn-hub",
      kind: "hub",
      machineId: null,
      path: "/var/lib/cawco/projects/field-notes",
      missing: false,
      locateTo: null,
      madeByCawco: true,
    },
  ],
  repos: [],
  taskHome: "files",
  tie: null,
  account: { chosen: null, atLimit: "wait" },
  accounts: ACCOUNTS,
  whoDecides: rules({ done: "caw" }),
  landing: "none",
  largeFiles: { kind: "own" },
};

/** Lantern web tied to GitHub Issues and in step, its Project carrying the stages. */
const LANTERN_TIED: SettingsRecord = {
  ...LANTERN,
  taskHome: "github",
  tie: LANTERN_TIE,
};

/** Lantern web tied to GitHub, its Project just given Status options for two board columns it lacked. */
const LANTERN_STATUSES_ADDED: SettingsRecord = {
  ...LANTERN_TIED,
  tie: {
    ...LANTERN_TIE,
    statusesAdded: { options: ["In review", "Waiting on design"] },
  },
};

/** Lantern web named to an account that is signed in on no machine: nothing starts. */
const LANTERN_SIGNED_OUT: SettingsRecord = {
  ...LANTERN,
  account: { chosen: "acc-personal", atLimit: "move" },
};

/** Lantern web whose own rule file failed to read: every choice comes to the person. */
const LANTERN_RULES_UNREADABLE: SettingsRecord = {
  ...LANTERN,
  whoDecides: rules(
    { scope: "caw", tools: "caw" },
    "decides.md line 14: “Scope: Caw, then you” names two deciders for one kind (decides_parse)."
  ),
};

/** Lantern web as read 26 minutes ago, while the hub is out of reach. */
const LANTERN_HUB_AWAY: SettingsRecord = {
  ...LANTERN,
  hubReachable: false,
  asOf: minutesAgo(26),
};

/** Each situation the person can put the project in, by the words its dial shows. */
export const SITUATIONS = {
  "At rest": LANTERN,
  "Two stages in trouble": LANTERN_IN_TROUBLE,
  "Tied to GitHub, in step": LANTERN_TIED,
  "GitHub Status options added": LANTERN_STATUSES_ADDED,
  "Named account signed out": LANTERN_SIGNED_OUT,
  "Who decides unreadable": LANTERN_RULES_UNREADABLE,
  "Hub out of reach": LANTERN_HUB_AWAY,
  "A project with no code": FIELD_NOTES,
} satisfies Record<string, SettingsRecord>;

export type Situation = keyof typeof SITUATIONS;
