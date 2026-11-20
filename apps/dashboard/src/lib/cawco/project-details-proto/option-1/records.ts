/**
 * What Option 1's anchors read and send (Governed canvas: each standing fact
 * of a project stands on the part of the project page it governs). The
 * records are the product's own where the product has one (ProjectRow,
 * TrackerView, LandsMode, ProjectAtLimit, the built-in Who decides kinds);
 * the rest is the shape the hub would answer, named here for the prototype.
 */
import type { ProjectAtLimit } from "@cawco/core/accounts";
import type { ShownBlockPage } from "@cawco/core/blocks";
import {
  BUILT_IN_MEMBERS,
  type BuiltInKind,
  type BuiltInMember,
} from "@cawco/core/decides";
import type { LandsMode } from "@cawco/core/injected";
import type { Tracker, TrackerView } from "@cawco/core/trackers";
import type { ProjectRow } from "#lib/cawco/projects.js";

/** A fact as the hub last said it: still being read, read, or refused with its words. */
type Reading<T> =
  | { state: "reading" }
  | { state: "read"; value: T }
  | { state: "failed"; reason: string };

/** One of the fleet's machines, as a place's row names it. */
export interface MachineFact {
  /** Its home folder, so a path under it reads as `~/…`. */
  home: string;
  id: string;
  /** It has left the fleet: its places stay listed, marked. */
  left: boolean;
  name: string;
  online: boolean;
  /** The OS its daemon reports (`darwin`, `linux`, `win32`): its tile's glyph. */
  os: string;
}

/** One of the fleet's accounts, by the name it carries everywhere. */
interface AccountFact {
  /** Its identity hue, a theme token (`var(--color-account-blue)`). */
  hue: string;
  id: string;
  name: string;
  /** Signed in on at least one machine. */
  signedIn: boolean;
}

/** Who settles a kind of choice. */
export type Member = Exclude<BuiltInMember, "asker">;
export const MEMBERS = BUILT_IN_MEMBERS.filter(
  (member): member is Member => member !== "asker"
);

/** One kind's route: who settles it, and whether that is the project's own or the fleet's. */
interface KindRoute {
  /** The fleet's default for this kind. */
  fleet: Member;
  /** Who settles it in this project. */
  member: Member;
  /** The project's rule file names this kind itself. */
  own: boolean;
}

/** Who decides, as the project's rule file and the fleet's default answer it. */
type DecidesFact = Record<BuiltInKind, KindRoute>;

/** A fleet connection a tracker or a large-file address can use. */
export interface ConnectionFact {
  /** The account behind it, as the service names it (`samleelabs`, `Sam Lee`). */
  account: string;
  /** It holds a key that signs in to a large-file server. */
  holdsKey: boolean;
  name: string;
  service: "github" | "linear";
}

/** Where the project's large files are kept: each repository's own, or one declared address. */
export type LargeFiles =
  { kind: "own" } | { kind: "declared"; url: string; connection: string };

/** Everything the project page's anchors read, for one project. */
export interface GovernedRecord {
  accounts: AccountFact[];
  /** Caw's attention: on or off, and the line he is on now. */
  caw: { on: boolean; line: string };
  connections: Reading<ConnectionFact[]>;
  decides: Reading<DecidesFact>;
  /** The project holds code: repositories, large files and landing apply. */
  holdsCode: boolean;
  /** The hub answers; or the time what shows was read, while it is out of reach. */
  hub: { reachable: true } | { reachable: false; asOf: number };
  largeFiles: LargeFiles;
  machines: MachineFact[];
  /** The product's row: name, places, links, account, at-limit, landing, review. */
  project: ProjectRow;
  tracker: Reading<TrackerView>;
  /** Tasks waiting on the person. */
  waiting: number;
  /** The project's stages that are of the `you` kind (a tie to a tracker needs one). */
  youStages: string[];
}

/** A change the person asks of one standing fact; each is its own, in force when the hub says so. */
export type Change =
  | { key: "name"; name: string }
  | { key: "account"; account: string | null }
  | { key: "atLimit"; atLimit: ProjectAtLimit }
  | { key: "caw"; on: boolean }
  | { key: "landing"; lands: LandsMode }
  | { key: "review"; review: boolean }
  | { key: "decides"; kind: BuiltInKind; member: Member | null }
  | { key: "taskHome"; tracker: Tracker; connection?: string; target?: string }
  | { key: "largeFiles"; largeFiles: LargeFiles }
  | { key: "addPlace"; machineId: string; path: string };

/** What a change is known by while it waits or after a refusal: its key, and its kind for Who decides. */
export type ChangeId = Change["key"] | `decides.${BuiltInKind}`;

/** The changes the hub has not answered yet, and those it refused with its words. */
export interface Changes {
  pending: ChangeId[];
  refused: Partial<Record<ChangeId, string>>;
}

/** An act on one place, each its own flow. */
export type PlaceAct = "move" | "find" | "copy" | "drop";

/** The project page's views, in the order the strip shows them. */
export type ProjectView = ShownBlockPage | "decisions";

/** What a part that opens one subject takes: the record, the changes in flight, and where it sends a change. */
export interface SubjectProps {
  changes: Changes;
  onchange: (change: Change) => void;
  record: GovernedRecord;
}

/** What the places take besides: where an act on a place goes, and a read asked again. */
export interface PlacesProps extends SubjectProps {
  onplace: (act: PlaceAct, placeId: string) => void;
  onreread: (what: "decides" | "tracker" | "connections") => void;
}
