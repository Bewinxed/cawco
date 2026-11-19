/**
 * What the Standing card reads beside the project's own row (ProjectRow),
 * each shaped as the card draws it. None of it is a read the hub answers
 * today: each is a call the server lacks, mocked at the card's props.
 */
import type { HarnessKind } from "@cawco/core/harness/kinds";
import type { IssueTracker, Tracker } from "@cawco/core/trackers";

/** What a place's machine says of its folder. */
export interface PlaceFolder {
  /** CawCo made the folder; the person named every other one. */
  made: boolean;
  /** The folder is no longer where the place points. */
  missing: boolean;
}

/** An account as the card offers it: the name it carries everywhere, and whether any machine is signed in to it. */
export interface AccountChoice {
  id: string;
  name: string;
  provider: string;
  signedIn: boolean;
}

/** A setting the card changes in its row. */
export type Setting = "lands" | "account" | "atLimit" | "lfs";

/** A change asked of the hub: still on its way (`asked`), or refused in the hub's words. */
export type Change =
  | { setting: Setting; state: "asked"; value: string }
  | { setting: Setting; state: "refused"; value: string; reason: string };

/** Why nothing in the project can start, by the one thing that fixes it. */
export type CantStart =
  | { cause: "folder"; placeId: string }
  | { cause: "account"; accountId: string }
  | { cause: "hub"; readAt: number };

/** A place being added: the machine, the folder typed, and whether the project is copied there. */
export interface PlaceDraft {
  copy: boolean;
  folder: string;
  machineId: string | null;
}

/** A connection as a choice: its name, the account behind it, and whether it can serve what it is asked for. */
export interface ConnectionChoice {
  account: string;
  name: string;
  serves: boolean;
  service: "github" | "linear" | "s3";
}

/** What stands open inside the details, beside the fact it asks about. */
export type Opened =
  | { kind: "add-place"; draft: PlaceDraft }
  | { kind: "drop"; placeId: string }
  | { kind: "back-to-cawco" }
  | { kind: "lfs-address"; url: string; connection: string | null }
  | null;

/** What the hub learned of a place just added: its repository, or nothing while its machine is away. */
export interface PlaceLearned {
  placeId: string;
  repository: string | null;
}

/** A place whose folder is being moved, shown on its row in place of its acts. */
export interface PlaceMoving {
  placeId: string;
  /** Files and bytes so far, as said: "31,004 of 48,210 files". */
  progress: string;
  step: string;
}

/** A conversation running in a folder about to move. */
export interface RunningHere {
  /** Its harness carries the conversation as it is, or it continues from a summary. */
  carry: "as-is" | "summary";
  /** The harness a summary continues on. */
  continuesOn: HarnessKind | null;
  /** The harnesses a summary can continue on there. */
  harnesses: HarnessKind[];
  id: string;
  /** It is in the middle of a turn, and waits for it to end. */
  midTurn: boolean;
  /** The way CawCo picked, when it can carry. */
  pick: "as-is" | "summary";
  title: string;
  /** Why it continues from a summary; null when it carries. */
  why: string | null;
}

/** What the hub can say of a move before it starts. */
export interface MovePlan {
  /** The projects whose folders sit inside this one and move along. */
  along: string[];
  /** Links inside the folder that point at its old path. */
  brokenLinks: number;
  /** The project whose wider folder no longer holds these files. */
  noLongerHeldBy: string | null;
  /** How the files go: still being read, renamed on one disk, copied, or not known while the destination is away. */
  reach:
    | { state: "reading" }
    | { state: "rename" }
    | { state: "copy"; files: number; bytes: number }
    | { state: "away"; files: number; bytes: number };
  /** What stops the move and what to do; null when nothing does. */
  refusal: { stops: string; todo: string } | null;
  running: RunningHere[];
}

/** A move's step line and where it stands. */
export interface MoveRun {
  /** The step it is on, by its index in `steps`. */
  at: number;
  bytes: { done: number; total: number } | null;
  /** A step that failed: the tool's words and the state of both folders. */
  failed: { words: string; oldFolder: string; newFolder: string } | null;
  files: { done: number; total: number } | null;
  /** The machine it holds for, while one is away. */
  holding: string | null;
  steps: string[];
  /** Conversations it waits on to end their turn. */
  waiting: { id: string; title: string }[];
}

/** What a move proved and left. */
export interface MoveResult {
  /** Called off: what that left on disk; null when it ran to its end. */
  calledOff: string | null;
  /** What ended with the move. */
  ended: string[];
  /** What stayed in the old folder, and why. */
  leftBehind: { path: string; why: string }[];
  proven: { files: number; bytes: number; commit: string | null } | null;
  sessions: {
    id: string;
    title: string;
    outcome: "running" | "summary" | "stopped";
    detail: string;
  }[];
}

/** What CawCo can tell of a folder typed for Find folder. */
type FolderTell =
  | "reading"
  | "same-repository"
  | "other-repository"
  | "same-folder"
  | "placed-copies"
  | "cant-tell";

/** Find folder, as the hub answers what was typed. */
export interface FindPlan {
  /** Its machine is away: the change waits until it can read the folder. */
  away: boolean;
  /** Two projects become one: the other one, and which remains (null until picked). */
  merge: { other: string; keep: string | null } | null;
  /** The old folder is still on disk, and stays there. */
  oldStays: boolean;
  /** The hub's refusal, with the next step; null when none. */
  refusal: string | null;
  tell: FolderTell | null;
}

/** Tying tasks to a tracker, as far as the person has picked. */
export interface TiePlan {
  connection: string | null;
  /** The connections, or null while they are read. */
  connections: ConnectionChoice[] | null;
  /** GitHub: the Project picked for stages, "none", or null before a pick. */
  project: string | null;
  /** GitHub's reason the Project cannot carry stages; null when it can. */
  projectReason: string | null;
  /** GitHub: the owner's Projects, or null while they are read. */
  projects: { id: string; title: string }[] | null;
  provider: IssueTracker;
  /** The tracker's refusal, choices kept; null when none. */
  refusal: string | null;
  /** Each stage's Status option, or null for Leave alone. */
  stages: { stage: string; options: string[]; pick: string | null }[];
  target: string | null;
  /** The repositories or teams, the project's own first; null while they are read. */
  targets: { id: string; name: string; own: boolean }[] | null;
}

/** What the person does in the details, sent out as one event. */
export type DetailsAct =
  | {
      kind: "move" | "find" | "drop" | "dropped" | "reopen";
      placeId: string;
    }
  /** What stands open closes: Keep, Cancel, Stay tied. */
  | { kind: "close" }
  | { kind: "add-place" }
  | { kind: "draft"; draft: PlaceDraft }
  | { kind: "added" }
  | { kind: "tracker"; tracker: Tracker }
  | { kind: "back-to-cawco" }
  | { kind: "sync" }
  | { kind: "stages" }
  | { kind: "read-tracker" }
  | { kind: "set"; setting: Setting; value: string }
  | { kind: "retry" }
  | { kind: "lfs-draft"; url: string; connection: string | null }
  | { kind: "lfs-save" }
  | { kind: "sign-in" }
  | { kind: "add-account" }
  | { kind: "add-connection" };
