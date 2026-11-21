/**
 * What the "How it runs" view reads of one project, shaped as the hub
 * answers it: the project's places on the fleet's machines, its links, where
 * its tasks are kept, the account its sessions start on, its Who decides and
 * where finished work lands. A prototype's record (Option 2, the work path):
 * the view takes it whole as a prop and sends each change as an event.
 */

import type { AccountHue } from "@cawco/core/accounts/kinds";
import type { BuiltInMember } from "@cawco/core/decides";

type MachineOs = "linux" | "darwin" | "windows";

interface FleetMachine {
  /** Where its home folder is, for a path written under `~`. */
  home: string;
  id: string;
  name: string;
  online: boolean;
  os: MachineOs;
}

/** Where the project's files are: a folder on a machine, or its own folder on the hub. */
export interface ProjectPlace {
  id: string;
  /** Where the project's work starts (one place); the hub's folder never. */
  kind: "start" | "other" | "hub";
  /** The machine it sits on; null for the hub's folder. */
  machineId: string | null;
  /** CawCo made the folder (a copy it placed); otherwise the person named it. */
  madeByCawco: boolean;
  /** The folder is no longer where the project expects it. */
  missing: boolean;
  path: string;
}

/** A repository the project is linked to, `host/owner/name`. */
interface ProjectRepo {
  host: string;
  name: string;
  owner: string;
  url: string;
}

export type TaskHome = "files" | "github" | "linear";

type SyncStanding =
  | { kind: "first" }
  | { kind: "inStep"; at: string }
  | { kind: "syncing" }
  | { kind: "refused"; at: string; words: string };

/** The tie to an outside tracker, while tasks are kept there too. */
interface TrackerTie {
  connection: { account: string; name: string };
  /** With GitHub: the Project that carries stages, or GitHub's reason there is none. */
  githubProject: { name: string; url: string } | { none: string } | null;
  home: "github" | "linear";
  linked: number;
  sync: SyncStanding;
  /** The repository (GitHub) or team (Linear). */
  target: { label: string; url: string };
}

export interface FleetAccount {
  hue: AccountHue;
  id: string;
  /** The name it carries everywhere. */
  name: string;
  /** Signed in on at least one machine. */
  signedIn: boolean;
}

/** Who settles a kind of choice here: the built-in members the person picks among, the asker aside. */
export type Decider = Exclude<BuiltInMember, "asker">;

export const CHOICE_KINDS = [
  "look",
  "behaviour",
  "scope",
  "approach",
  "rules",
  "tools",
] as const;
export type ChoiceKind = (typeof CHOICE_KINDS)[number];

interface KindRule {
  by: Decider;
  /** The fleet's default for this kind, which the project follows unless it says otherwise. */
  fleet: Decider;
  /** The project settles this kind its own way. */
  own: boolean;
}

type WhoDecidesRead =
  | { ok: true; rules: Record<ChoiceKind, KindRule> }
  | { error: string; ok: false };

export type Landing = "default" | "branch" | "pr" | "nowhere";

export type LargeFiles =
  { kind: "own" } | { address: string; connection: string; kind: "declared" };

export interface HowItRunsRecord {
  account: {
    /** What its sessions do at the named account's limit. */
    atLimit: "wait" | "move";
    /** The account named for the project; null: the fleet's routing. */
    chosen: string | null;
  };
  accounts: FleetAccount[];
  /** When the hub last said this, for a page read while it was out of reach. */
  asOf: string;
  /** The project holds code: repositories, large files and landing apply. */
  holdsCode: boolean;
  hubReachable: boolean;
  landing: Landing;
  largeFiles: LargeFiles;
  machines: FleetMachine[];
  places: ProjectPlace[];
  project: { id: string; name: string };
  repos: ProjectRepo[];
  reviewBeforeDone: boolean;
  taskHome: TaskHome;
  tie: TrackerTie | null;
  whoDecides: WhoDecidesRead;
}

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
  { id: "acc-studio", name: "Studio Max", hue: "violet", signedIn: true },
  {
    id: "acc-northwind",
    name: "Northwind client",
    hue: "cyan",
    signedIn: true,
  },
  { id: "acc-personal", name: "Personal Pro", hue: "amber", signedIn: false },
  { id: "acc-codex", name: "Codex team", hue: "green", signedIn: true },
];

const FLEET_RULE: Record<ChoiceKind, Decider> = {
  look: "you",
  behaviour: "you",
  scope: "caw",
  approach: "caw",
  rules: "you",
  tools: "practice",
};

const rules = (
  own: Partial<Record<ChoiceKind, Decider>>
): Record<ChoiceKind, KindRule> => {
  const rule = (kind: ChoiceKind): KindRule => {
    const fleet = FLEET_RULE[kind];
    const mine = own[kind];
    return { fleet, by: mine ?? fleet, own: mine !== undefined };
  };
  return {
    look: rule("look"),
    behaviour: rule("behaviour"),
    scope: rule("scope"),
    approach: rule("approach"),
    rules: rule("rules"),
    tools: rule("tools"),
  };
};

/**
 * A code project at rest, the weekly check: two places on the fleet's
 * machines and its folder on the hub, one repository, tasks in CawCo's own
 * files, a named account, two kinds settled its own way, review on, work
 * landing on a branch with a pull request.
 */
const LANTERN: HowItRunsRecord = {
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
      madeByCawco: false,
    },
    {
      id: "p-kestrel",
      kind: "other",
      machineId: "m-kestrel",
      path: "/Users/mara/Projects/clients/lantern/lantern-web",
      missing: false,
      madeByCawco: true,
    },
    {
      id: "p-hub",
      kind: "hub",
      machineId: null,
      path: "/var/lib/cawco/projects/lantern-web",
      missing: false,
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
  whoDecides: { ok: true, rules: rules({ scope: "you", tools: "caw" }) },
  reviewBeforeDone: true,
  landing: "pr",
  largeFiles: { kind: "own" },
};

/** Lantern web's tie to GitHub Issues through its GitHub App, in step four minutes ago. */
const LANTERN_TIE: TrackerTie = {
  home: "github",
  target: {
    label: "lantern-studio/lantern-web",
    url: "https://github.com/lantern-studio/lantern-web/issues",
  },
  connection: { name: "Lantern GitHub App", account: "lantern-studio" },
  linked: 148,
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
const LANTERN_IN_TROUBLE: HowItRunsRecord = {
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
const FIELD_NOTES: HowItRunsRecord = {
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
      madeByCawco: false,
    },
    {
      id: "fn-hub",
      kind: "hub",
      machineId: null,
      path: "/var/lib/cawco/projects/field-notes",
      missing: false,
      madeByCawco: true,
    },
  ],
  repos: [],
  taskHome: "files",
  tie: null,
  account: { chosen: null, atLimit: "wait" },
  accounts: ACCOUNTS,
  whoDecides: { ok: true, rules: rules({}) },
  reviewBeforeDone: false,
  landing: "nowhere",
  largeFiles: { kind: "own" },
};

/** Lantern web tied to GitHub Issues and in step, its Project carrying the stages. */
const LANTERN_TIED: HowItRunsRecord = {
  ...LANTERN,
  taskHome: "github",
  tie: LANTERN_TIE,
};

/** Lantern web named to an account that is signed in on no machine: nothing starts. */
const LANTERN_SIGNED_OUT: HowItRunsRecord = {
  ...LANTERN,
  account: { chosen: "acc-personal", atLimit: "move" },
};

/** Lantern web whose own rule file failed to read: every choice comes to the person. */
const LANTERN_RULES_UNREADABLE: HowItRunsRecord = {
  ...LANTERN,
  whoDecides: {
    ok: false,
    error:
      "decides.md line 14: “Scope: Caw, then you” names two deciders for one kind (decides_parse).",
  },
};

/** Lantern web as read 26 minutes ago, while the hub is out of reach. */
const LANTERN_HUB_AWAY: HowItRunsRecord = {
  ...LANTERN,
  hubReachable: false,
  asOf: minutesAgo(26),
};

/** Each situation the person can put the project in, by the words its dial shows. */
export const SITUATIONS = {
  "At rest": LANTERN,
  "Two stages in trouble": LANTERN_IN_TROUBLE,
  "Tied to GitHub, in step": LANTERN_TIED,
  "Named account signed out": LANTERN_SIGNED_OUT,
  "Who decides unreadable": LANTERN_RULES_UNREADABLE,
  "Hub out of reach": LANTERN_HUB_AWAY,
  "A project with no code": FIELD_NOTES,
} satisfies Record<string, HowItRunsRecord>;

export type Situation = keyof typeof SITUATIONS;
