/**
 * What the project's Settings view reads of one project, shaped as the hub
 * answers it (settings-hub.svelte.ts builds it from the stores and the
 * hub's reads): the project's places on the fleet's machines, its links,
 * where its tasks are kept, the account its sessions start on, its Who
 * decides and where finished work lands. The view takes it whole as a prop
 * and sends each change as an event.
 */

import type { AccountProvider } from "@cawco/core/accounts";
import type { AccountHue } from "@cawco/core/accounts/kinds";
import type { Kind, Member } from "@cawco/core/decides";
import type { LandsMode } from "@cawco/core/injected";

type MachineOs = string;

export interface FleetMachine {
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
  /** A folder Change path pointed it at with its machine away, held until that machine can read it; null: none. */
  locateTo: string | null;
  /** The machine it sits on; null for the hub's folder. */
  machineId: string | null;
  /** CawCo made the folder (a copy it placed); otherwise the person named it. */
  madeByCawco: boolean;
  /** The folder is no longer where the project expects it. */
  missing: boolean;
  /** As the row shows it: under `~` where it sits in its machine's home. */
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

export type SyncStanding =
  | { kind: "first" }
  | { kind: "inStep"; at: string }
  | { kind: "syncing" }
  | { kind: "refused"; at: string; words: string };

/** The tie to an outside tracker, while tasks are kept there too. */
export interface TrackerTie {
  connection: { account: string; name: string };
  /** With GitHub: the Project that carries stages, or GitHub's reason there is none. */
  githubProject: { name: string; url: string } | { none: string } | null;
  home: "github" | "linear";
  linked: number;
  sync: SyncStanding;
  /** The repository (GitHub) or team (Linear), by its id and as it reads. */
  target: { id: string; label: string; url: string };
}

export interface FleetAccount {
  hue: AccountHue;
  id: string;
  /** The name it carries everywhere. */
  name: string;
  /** Whose plan it is: Anthropic's accounts carry limits the picker reads. */
  provider: AccountProvider;
  /** Signed in on at least one machine. */
  signedIn: boolean;
}

/** Who settles one kind of choice here. */
export interface KindRule {
  /** The member settling it here. */
  by: string;
  /** The fleet's member for it, which the project follows unless it says otherwise. */
  fleet: string;
  /** The project settles this kind its own way. */
  own: boolean;
}

/**
 * The project's Who decides: the fleet's kinds and the members that can
 * settle them, and each kind's rule here. `unread` holds the hub's words
 * while the project's decides.md doesn't read: every kind is then the
 * person's until it does.
 */
export interface WhoDecidesRead {
  kinds: Kind[];
  members: Member[];
  rules: Record<string, KindRule>;
  unread: string | null;
}

export type LargeFiles =
  { kind: "own" } | { address: string; connection: string; kind: "declared" };

export interface SettingsRecord {
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
  landing: LandsMode;
  largeFiles: LargeFiles;
  machines: FleetMachine[];
  places: ProjectPlace[];
  project: { id: string; name: string };
  repos: ProjectRepo[];
  taskHome: TaskHome;
  tie: TrackerTie | null;
  whoDecides: WhoDecidesRead;
}
