/**
 * Move files' words (core folder-move.ts): what the project details card
 * says before a move runs, while it runs and after, and what a machine says
 * when a step of it fails. In the card's register (words/project-details.ts):
 * agents, computers, folders and files; no word of the product's own model.
 */

import { namedAndMore } from "@cawco/providers/names";
import type { FolderMoveBlock, FolderMoveLeft } from "../folder-move";
import { moveSize } from "../move";
import { shortSha } from "../short-id";

const count = (n: number, one: string, many: string): string =>
  `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** A list of paths as a line names them: the first few, and how many more. */
const named = (paths: readonly string[]): string => namedAndMore(paths);

/** What stands in a move's way, and what to do about it. */
export const blockWords = (
  block: FolderMoveBlock,
  at: { folder: string; destination: string; machine: string }
): { todo: string; why: string } => {
  switch (block.kind) {
    case "source-gone":
      return {
        why: `${at.folder} isn't on ${at.machine}.`,
        todo: "Use Locate folder to point this project at where it is now.",
      };
    case "source-not-folder":
      return {
        why: `${at.folder} on ${at.machine} is a file, not a folder.`,
        todo: "Use Locate folder to point this project at its folder.",
      };
    case "machine-home":
      return {
        why: `${at.folder} is ${at.machine}'s home folder or holds it, and CawCo runs from inside it.`,
        todo: "Move a folder inside it instead.",
      };
    case "machine-cawco":
      return {
        why: `${at.folder} holds CawCo's own files (${block.dir}), which can't move while CawCo runs from them.`,
        todo: "Move a folder inside it instead.",
      };
    case "into-itself":
      return {
        why: `${at.destination} is inside the folder being moved.`,
        todo: "Name a folder outside it.",
      };
    case "destination-holds":
      return {
        why: `${at.destination} on ${at.machine} already holds files. Move doesn't merge two folders.`,
        todo: "Name a new or empty folder.",
      };
    case "destination-not-folder":
      return {
        why: `${at.destination} on ${at.machine} is a file.`,
        todo: "Name a new or empty folder.",
      };
    case "destination-cawco":
      return {
        why: `${at.destination} is inside CawCo's own files on ${at.machine} (${block.dir}).`,
        todo: "Name a folder of your own.",
      };
    case "mounts":
      return {
        why: `${at.folder} holds another disk at ${named(block.paths)}. Copying would copy that disk, and removing the old folder would empty it.`,
        todo: "Unmount it, then try again.",
      };
    case "unreadable":
      return {
        why: `${count(block.paths.length, "file", "files")} in ${at.folder} can't be read: ${named(block.paths)}. A folder that can't be read whole can't be removed after the copy.`,
        todo: "Give your user read access to them, then try again.",
      };
    case "devices":
      return {
        why: `${at.folder} holds device files, which hold no bytes to copy: ${named(block.paths)}.`,
        todo: "Remove them, then try again.",
      };
    case "case-clash":
      return {
        why: `The disk on ${at.machine} takes names that differ only by case as one: ${named(block.paths)}.`,
        todo: "Rename one of each pair, then try again.",
      };
    case "no-room":
      return {
        why: `${at.machine} has ${moveSize(block.free)} free where ${at.destination} goes, and the folder holds ${moveSize(block.need)}.`,
        todo: "Free up space there, or name a folder on another disk.",
      };
  }
};

export const folderMoveWords = {
  /** Before it runs: one line each, in order. */
  renames: (destination: string) =>
    `Renames the folder to ${destination}. Nothing is copied.`,
  copies: (
    walk: { files: number; bytes: number; whole: boolean },
    destination: string,
    machine: string | null
  ) =>
    `Copies ${walk.whole ? "" : "at least "}${count(walk.files, "file", "files")} (${moveSize(walk.bytes)}) to ${destination}${machine ? ` on ${machine}` : ""}, checks every one, then removes the old folder.`,
  everything:
    "Everything goes: password files, unsaved work, and files left out of the code's history.",
  inner: (name: string) =>
    `Also moves ${name}, a project whose folder is inside this one.`,
  outer: (name: string) =>
    `This folder is inside ${name}'s folder, so ${name} no longer holds these files.`,
  links: (n: number) =>
    `${count(n, "link", "links")} inside the folder ${n === 1 ? "points" : "point"} at its old path and will break.`,
  /** What keeps a move from being checked or started. */
  away: (machine: string) => ({
    why: `${machine} is offline, so the folder can't be checked.`,
    todo: "Try again once it's back.",
  }),
  noProject: "This project is gone.",
  unread: "The folders couldn't be read.",
  aDelegate: "A delegate",
  /** A move that is over: gone from the hub, called off, or past its call off. */
  over: "That move is over.",
  calledOffAlready: "That move was called off.",
  pastCallOff:
    "The project is already at the new folder, so this move can't be called off now.",
  notWaiting: "No move is waiting for that agent.",
  notStopped: "Only a stage that stopped can be tried again.",
  noFolder: {
    why: "That folder is no longer one of this project's.",
    todo: "Close this and pick the folder again.",
  },
  builtin: {
    why: "The built-in folder stays where it is.",
    todo: "Pick a folder on one of your computers.",
  },
  sameFolder: {
    why: "That is the folder the project is in now.",
    todo: "Name another folder.",
  },
  moving: {
    why: "This folder is already moving.",
    todo: "Wait for that move to finish, or call it off.",
  },
  cloned: (work: readonly string[]) => ({
    why: `Unfinished work in ${work.length === 1 ? "a copy" : "copies"} of this code on this computer: ${named(work)}.`,
    todo: "Let it finish and apply, or discard it, then try again.",
  }),
  layered: (agent: string) => ({
    why: `${agent} has changes to this folder that aren't applied yet.`,
    todo: "Apply or discard them first.",
  }),
  /** Why an agent continues from a summary on another computer. */
  noHarness: (machine: string, tool: string) =>
    `${machine} doesn't run ${tool}, so it continues from a summary`,
  noAccount: (machine: string) =>
    `its account isn't signed in on ${machine}, so it continues from a summary`,
  asked: "you asked for a summary",
  /** The stages a move shows, in its order. */
  stages: {
    quiet: "Pausing agents",
    rename: "Renaming the folder",
    copy: "Copying files",
    check: "Checking every file",
    resume: "Resuming agents",
    summarise: "Summarising conversations",
    remove: "Removing the old folder",
  },
  copyProgress: (
    files: number,
    filesTotal: number,
    bytes: number,
    bytesTotal: number
  ) =>
    `${files.toLocaleString("en")} of ${count(filesTotal, "file", "files")} · ${moveSize(bytes)} of ${moveSize(bytesTotal)}`,
  checkProgress: (files: number, filesTotal: number) =>
    `${files.toLocaleString("en")} of ${count(filesTotal, "file", "files")} checked`,
  removeProgress: (files: number, filesTotal: number) =>
    `${files.toLocaleString("en")} of ${count(filesTotal, "entry", "entries")} removed`,
  waitingFor: (agents: readonly string[]) =>
    `Waiting for ${named(agents)} to finish ${agents.length === 1 ? "its reply" : "their replies"}`,
  /** Where both folders stand after a stage failed. */
  foldersBefore: "Nothing has moved. The folder is where it was.",
  foldersCopy:
    "The old folder is untouched and still this project's. The partial copy is removed.",
  foldersPlaced: (destination: string) =>
    `Both folders are whole: the checked copy is at ${destination}, and the old folder is untouched.`,
  foldersMoved: (destination: string) =>
    `Every file is at ${destination}, checked. The old folder is not removed yet.`,
  foldersRenamed: (destination: string) =>
    `The folder is at ${destination}. Nothing was copied.`,
  /** After. */
  checked: (
    copied: { files: number; bytes: number; head: string | null },
    machine: string
  ) =>
    `${count(copied.files, "file", "files")}, ${moveSize(copied.bytes)}, checked on ${machine}.${copied.head ? ` The code stands at ${shortSha(copied.head)}.` : ""}`,
  renamed: (destination: string, machine: string, head: string | null) =>
    `Renamed to ${destination} on ${machine}.${head ? ` The code stands at ${shortSha(head)}.` : ""}`,
  calledOff: (folders: string) => `Called off. ${folders}`,
  calledOffUntouched: "The old folder is untouched and still this project's.",
  resumedSummary: (tool: string) => `continues from a summary on ${tool}`,
  asleep: "was paused before the move, and wakes in the new folder",
  notResumed: (why: string) => `didn't start again: ${why}`,
  summaryCalledOff: "its summary was called off",
  left: (left: FolderMoveLeft): string => {
    switch (left.why) {
      case "changed":
        return "Changed after it was copied, so it stayed. Its copy in the new folder is from before the change.";
      case "busy":
        return `Couldn't be removed${left.words ? ` (${left.words})` : ""}, so it stayed. Nothing is lost: it is a copy.`;
      case "uncopied":
        return "Not a file that can be copied (a socket or a pipe), so it stayed.";
    }
  },
  endedTask: (machine: string, description: string) =>
    `A background command on ${machine}: ${description}`,
  endedWakeups: (agent: string, n: number) =>
    `${count(n, "wake-up", "wake-ups")} set by ${agent}`,
  /** What the session reads first, in its new folder. */
  movedLine: (from: string, to: string) =>
    `This project's folder moved from ${from} to ${to}. Paths in this conversation that start with ${from} are now under ${to}.`,
} as const;

/** A machine's words when a step of a move fails, for the card's stage line. */
export const folderStepWords = {
  sourceChanged: (paths: readonly string[]) =>
    `Files in the folder changed while it was copied: ${named(paths)}. Nothing was removed; the copy was.`,
  copyDiffers: (paths: readonly string[]) =>
    `The copy didn't read back the same: ${named(paths)}. Nothing was removed; the copy was.`,
  extra: (paths: readonly string[]) =>
    `The copy holds what the folder doesn't: ${named(paths)}. Nothing was removed; the copy was.`,
  missing: (paths: readonly string[]) =>
    `The copy is missing ${named(paths)}. Nothing was removed; the copy was.`,
  programs: (names: readonly string[]) =>
    `Programs other than CawCo's agents are working in the folder: ${named(names)}. A copy can't be proven whole while something may still write.`,
  gitDiffers: (what: string) =>
    `The copied repository doesn't match the folder's (${what}). Nothing was removed; the copy was.`,
  destinationTaken: (path: string) =>
    `Something now stands at ${path}. Nothing was moved over it.`,
  stagingGone: (path: string) =>
    `The checked copy beside ${path} is gone, so it can't be put in place. Try the copy again.`,
  relayEnded: (why: string) => `The copy between computers stopped: ${why}`,
  noList:
    "The list of what was copied isn't on this computer, so nothing was removed.",
  noFrame: "The copy's stream ended part-way through.",
} as const;
