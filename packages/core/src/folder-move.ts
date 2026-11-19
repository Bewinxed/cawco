/**
 * Move files: a project's folder, every file in it, cut and pasted to
 * another folder on the same computer or on another one (TOM T2, the owner's
 * "move means MOVE as in cut->move", 2026-11-18), as one job the hub owns
 * and records (hub folder-moves.ts) and the machines run (agent
 * folder-move.ts). Nothing of the old folder is removed before its copy has
 * been read back and matched.
 *
 * Its steps, in order, each only when it applies:
 * `quiet` (the agents working in the folder pause between turns) →
 * `rename` (one disk: the folder renamed in one step) or `copy` (another
 * disk or computer: every entry listed, copied beside the destination under
 * the job's own name, each file's contents hashed as read and read back)
 * → `place` (the copy renamed to the destination, whole or not at all) →
 * `record` (the place's folder, and the sessions', say the new one) →
 * `carry` (each conversation filed for its new folder, or sent to the other
 * machine) and `remove` (the old folder, entry by entry by the copy's list,
 * never as a whole), in the order the way needs → `resume` (each paused
 * agent started again there, or its conversation continued from a summary)
 * → then `done`, `failed` or `calledOff`.
 */

import type { HarnessKind } from "./harness/kinds";
import type { MoveEnded } from "./session/controls";

/** Every {@link FolderMoveStep}, in the order a job does them. */
export const FOLDER_MOVE_STEPS = [
  "quiet",
  "rename",
  "copy",
  "place",
  "record",
  "carry",
  "summarise",
  "remove",
  "resume",
] as const;
/** A step a folder move does work in. */
export type FolderMoveStep = (typeof FOLDER_MOVE_STEPS)[number];
/** Where a folder move stands: at one of its steps, or settled. */
export type FolderMoveStage = FolderMoveStep | "done" | "failed" | "calledOff";

/** The name of a move's copy beside its destination, until it is put in place: never the destination's own. */
export const folderMoveStaging = (jobId: string): string =>
  `.cawco-move-${jobId}`;

// ── What a machine says of the two folders ─────────────────────────────────

/**
 * What stands in a move's way on one machine, by kind: the hub words it
 * (core words/folder-move.ts `blockWords`).
 */
export type FolderMoveBlock =
  /** Nothing stands at the folder's path. */
  | { kind: "source-gone" }
  /** What stands at the folder's path is no folder. */
  | { kind: "source-not-folder" }
  /** The folder is the machine's root, its home, or holds the home: the mover would move itself. */
  | { kind: "machine-home" }
  /** The folder holds, or sits in, CawCo's own files (`dir`). */
  | { dir: string; kind: "machine-cawco" }
  /** The destination is the folder itself, or inside it. */
  | { kind: "into-itself" }
  /** The destination holds files: Move does not merge two folders. */
  | { kind: "destination-holds" }
  /** What stands at the destination is no folder. */
  | { kind: "destination-not-folder" }
  /** The destination is inside CawCo's own files (`dir`). */
  | { dir: string; kind: "destination-cawco" }
  /** For a copy: the folder holds another disk mounted at `paths`. */
  | { kind: "mounts"; paths: string[] }
  /** For a copy: entries that cannot be read, by path. */
  | { kind: "unreadable"; paths: string[] }
  /** For a copy: device files, which hold no bytes to copy. */
  | { kind: "devices"; paths: string[] }
  /** For a copy: names the destination's disk takes as one, differing only by case. */
  | { kind: "case-clash"; paths: string[] }
  /** For a copy: the destination's disk has `free` bytes, and the folder holds `need`. */
  | { free: number; kind: "no-room"; need: number };

/** What a walk of the folder found, as far as it went in its time. */
export interface FolderWalk {
  bytes: number;
  dirs: number;
  files: number;
  links: number;
  /** The walk reached every entry; false: it stopped at its time, and the counts are a floor. */
  whole: boolean;
}

/**
 * {@link CONTROL_FOLDER_MOVE_READ}'s ask: the folder moved, the destination,
 * or both when they are on one machine. `walk`: count what the folder holds
 * and look for what a copy cannot carry (a copy is likely: another disk, or
 * another computer).
 */
export interface FolderMoveReadAsk {
  destination?: string;
  source?: string;
  walk: boolean;
}

/** What a machine says of the folder moved, on its machine. */
export interface FolderMoveSourceReading {
  /** Why the folder cannot move, by what stands in the way. */
  block?: FolderMoveBlock;
  /** For a copy, what stops the copy (a mount, an unreadable entry, a device). */
  copyBlock?: FolderMoveBlock;
  /** For a repository, the commit it stands at; null: no repository, or no commit. */
  head: string | null;
  /** Links inside the folder whose target is under its old path: they will break. */
  links: number;
  /** Names inside that differ only by case: a disk that ignores case takes them as one. */
  namesByCase: string[];
  /** The folder read, absolute. */
  path: string;
  walk?: FolderWalk;
}

/** What a machine says of a move's destination, on its machine. */
export interface FolderMoveDestinationReading {
  block?: FolderMoveBlock;
  /** The disk the destination is on takes two names that differ only by case as one. */
  caseBlind: boolean;
  /** The destination read, absolute. */
  path: string;
  /** Free bytes on the disk the destination goes on; null when it can't be read. */
  room: number | null;
}

/** {@link CONTROL_FOLDER_MOVE_READ}'s answer. */
export interface FolderMoveReading {
  destination?: FolderMoveDestinationReading;
  /** The machine's home folder. */
  home: string;
  /**
   * Both asked: whether the destination is on the folder's own mounted
   * disk, where a rename moves it in one step. A rename can still find it is
   * not (`EXDEV`), and then the move copies.
   */
  sameDisk?: boolean;
  source?: FolderMoveSourceReading;
}

// ── The steps on a machine ─────────────────────────────────────────────────

/** {@link CONTROL_FOLDER_MOVE_RENAME}'s ask. */
export interface FolderMoveRenameAsk {
  destination: string;
  jobId: string;
  /** CawCo made the folder: its record of the folder follows it. */
  made: boolean;
  source: string;
}

/** {@link CONTROL_FOLDER_MOVE_RENAME}'s answer: false when the destination is on another disk, and nothing moved. */
export interface FolderMoveRenamed {
  renamed: boolean;
}

/**
 * A copy's way across: both sides on one machine (no `relay`), or one side
 * of a stream the hub relays and stores nowhere: `send` on the folder's
 * machine, `take` on the destination's. `token` names the stream at the hub
 * (`/api/folder-moves/relay/<token>`), good for this one copy.
 */
interface FolderMoveRelay {
  side: "send" | "take";
  token: string;
}

/** {@link CONTROL_FOLDER_MOVE_COPY}'s ask. */
export interface FolderMoveCopyAsk {
  /** The destination, on a `take` side or one machine. */
  destination?: string;
  jobId: string;
  relay?: FolderMoveRelay;
  /** The folder, on a `send` side or one machine. */
  source?: string;
}

/** What a copy proved: every entry in the list is at the staging folder as it was, each file's bytes read back the same. */
export interface FolderMoveCopied {
  bytes: number;
  dirs: number;
  files: number;
  /** For a repository, the commit both stand at. */
  head: string | null;
  links: number;
}

/** {@link CONTROL_FOLDER_MOVE_PLACE}'s ask. */
export interface FolderMovePlaceAsk {
  destination: string;
  jobId: string;
  /** CawCo made the folder: the copy is recorded as made, in its place. */
  made: boolean;
}

/** {@link CONTROL_FOLDER_MOVE_REMOVE}'s ask: the folder removed by its copy's list, and the conversations carried away from it. */
export interface FolderMoveRemoveAsk {
  jobId: string;
  /** CawCo made the folder: its record of the folder goes with it. */
  made: boolean;
  /** Conversations carried to another machine: their copies here go. */
  sessions: FolderCarrySession[];
  source: string;
}

/** One entry left in the old folder, by path, and why. */
export interface FolderMoveLeft {
  path: string;
  why: "changed" | "busy" | "uncopied";
  /** The tool's words, when the removal was refused. */
  words?: string;
}

/** {@link CONTROL_FOLDER_MOVE_REMOVE}'s answer. */
export interface FolderMoveRemoved {
  left: FolderMoveLeft[];
  removed: number;
}

/** {@link CONTROL_FOLDER_MOVE_DROP}'s ask: the job's own partial copy, and its record on the machine. */
export interface FolderMoveDropAsk {
  /** Where the destination goes: its staging folder beside it is removed. */
  destination?: string;
  jobId: string;
}

// ── Conversations ──────────────────────────────────────────────────────────

/** One session whose conversation follows the folder. */
export interface FolderCarrySession {
  /** The account whose dir its Claude data lives in; null: the machine's own login. */
  accountId: string | null;
  /** The folder it ran in. */
  from: string;
  harness: HarnessKind;
  instanceId: string;
  /** Its harness's own id for the conversation. */
  sessionId: string;
  /** The folder it runs in from now. */
  to: string;
}

/**
 * {@link CONTROL_FOLDER_SESSIONS_CARRY}'s ask: on one machine, each
 * conversation filed again for its new folder; with `relay`, sent from the
 * folder's machine (`send`) and taken on the destination's (`take`).
 */
export interface FolderCarryAsk {
  jobId: string;
  relay?: FolderMoveRelay;
  sessions: FolderCarrySession[];
}

/** {@link CONTROL_FOLDER_SESSIONS_CARRY}'s answer: per session, carried, or why not. */
export type FolderCarried = Record<
  string,
  { carried: true } | { carried: false; why: string }
>;

/**
 * {@link CONTROL_PAUSE_FOR_MOVE}'s answer: the session's process ended
 * between turns (`paused`), with what it held for later ended too
 * (`ended`); or why it runs on, and whether that is a reply under way
 * (`replying`: a turn, an ask waiting, a subagent), which the move waits
 * for.
 */
export type PausedForMove =
  | { ended?: MoveEnded; paused: true }
  | { paused: false; replying: boolean; why: string };

// ── Hub ↔ machine ──────────────────────────────────────────────────────────

/** Reads the folder, the destination, or both: {@link FolderMoveReading}. Changes nothing. */
export const CONTROL_FOLDER_MOVE_READ = "folderMoveRead";
/**
 * One disk: the folder renamed to the destination in one step, never over
 * anything standing there. Answers `renamed: false` when the destination is
 * on another disk, and nothing moved.
 */
export const CONTROL_FOLDER_MOVE_RENAME = "folderMoveRename";
/**
 * The copy: every entry listed (kept on the folder's machine, the list the
 * removal goes by), copied into the staging folder beside the destination
 * ({@link folderMoveStaging}) with each file's SHA-256 taken as it is read,
 * then checked: every entry there as listed, each file read back to the
 * same hash, nothing extra, a repository at the same commit, and the folder
 * walked again to show nothing in it changed meanwhile.
 */
export const CONTROL_FOLDER_MOVE_COPY = "folderMoveCopy";
/** The checked copy renamed to the destination, whole or not at all. */
export const CONTROL_FOLDER_MOVE_PLACE = "folderMovePlace";
/**
 * The old folder removed by the copy's list: each entry only while it is as
 * listed, a folder only once emptied, never anything as a whole. What is
 * left is answered, by path.
 */
export const CONTROL_FOLDER_MOVE_REMOVE = "folderMoveRemove";
/** A move called off or failed: its partial copy removed, its record on the machine dropped. */
export const CONTROL_FOLDER_MOVE_DROP = "folderMoveDrop";
/** Each conversation filed again for its new folder, or sent and taken across machines. */
export const CONTROL_FOLDER_SESSIONS_CARRY = "folderSessionsCarry";
/**
 * Instance-scoped: the session's process ended between turns for a move of
 * its folder, ending what it holds for later with it; refused while a reply
 * is under way. Its row then reads asleep, and a start wakes it.
 */
export const CONTROL_PAUSE_FOR_MOVE = "pauseForMove";

/** Machine → hub: how far a folder move's step is on the machine. */
export interface FolderMoveProgressFrame {
  bytes: number;
  bytesTotal: number;
  files: number;
  filesTotal: number;
  jobId: string;
  kind: "folder_move_progress";
  /** `copy`: copying; `check`: reading the copy back; `remove`: removing the old folder. */
  phase: "copy" | "check" | "remove";
}
