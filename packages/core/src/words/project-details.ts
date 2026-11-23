/**
 * The words a project's folder steps say in the Settings view (dashboard
 * project/settings/ PlaceStep and PlacesList): Move, Change path and Copy
 * elsewhere, what will happen before each runs, its stages as it runs, and
 * what it did.
 */
import type { FolderRole } from "../project-folders";

export const folderWords = {
  role: {
    main: "Main folder",
    extra: "Extra folder",
    builtin: "Built-in folder",
  } satisfies Record<FolderRole, string>,
  builtinNote: "Holds tasks and the files agents save.",
  online: "online",
  offline: "offline",
  /** A computer as last read, while what is shown was read earlier. */
  asOf: (online: boolean, at: string) =>
    `${online ? "online" : "offline"} · as of ${at}`,
  missing: "This folder is missing, so agents can't start in it.",
  /** Locate folder named a folder while its computer was offline. */
  locateWaits: (path: string, machine: string) =>
    `Becomes ${path} once ${machine} is back.`,
  callOff: "Call off",
  actionsFor: (role: string, machine: string) =>
    `${role} on ${machine}: what you can do`,
  disconnect: "Disconnect folder",
  disconnectLine:
    "This project stops counting it. The folder stays on the computer, untouched.",
  disconnectAsk: (machine: string) =>
    `Disconnect this folder on ${machine}? Its files stay where they are.`,
  cancel: "Cancel",
  /** A machine the fleet no longer lists. */
  unknownComputer: "A computer that left",
} as const;

export const stepWords = {
  whatMoves: "What moves",
  thisFolder: "This folder",
  whereTo: "Where to",
  /** Copy to computer: a computer with one of the project's folders, which can't be picked. */
  hasCode: "has this code",
  folderPlaceholder: "A full path, or one under that computer's home",
  folderLabel: "Folder",
  whatHappens: "What will happen",
  whatTell: "What CawCo can tell",
  pickFirst:
    "Pick a computer and a folder, and this says what will happen before anything runs.",
  checking: (machine: string) => `Checking ${machine}`,
  agentsHere: (n: number) => `Agents working here now (${n})`,
  agentsLine: "Each pauses, follows the files and resumes.",
  replying: "In the middle of a reply: waits for it to end",
  interrupt: "Interrupt now",
  same: "Same conversation",
  summary: "Continue from a summary",
  followsHow: (agent: string) => `${agent}: how it follows`,
  on: (tool: string) => `on ${tool}`,
  cancel: "Cancel",
  whileRuns: "While it runs",
  callOff: "Call off",
  leaveRunning: "Closing the card leaves it running.",
  waiting: (machine: string) =>
    `Waiting for ${machine}. Nothing is removed while it is away.`,
  stageFailed: (stage: string) => `${stage} stopped`,
  tryStage: "Try this stage again",
  after: "After",
  resumed: "running again",
  leftBehind: "Left behind in the old folder",
  ended: "Ended with the move",
  done: "Done",
  /** Connect existing folder, before it runs. */
  connectLines: (path: string, machine: string) => [
    `${path} on ${machine} becomes one of this project's folders.`,
    "Your folder is never removed by this project.",
  ],
  /** Copy to computer: the computer already holds the code. */
  copyThere: (machine: string, path: string) =>
    `${machine} already has this code at ${path}.`,
  copyThereTodo: "Pick another computer.",
  copyFetch: (size: string) => `${size} of saved code to copy.`,
  copyUnsaved: (n: number) =>
    `${n.toLocaleString("en")} ${n === 1 ? "file" : "files"} not yet saved to the code's history are saved first, so they come too.`,
  copyStays:
    "Password files and anything left out of the code's history stay behind. The original is untouched.",
  /** Copy to computer's stages, by the hub's step. */
  copyStages: {
    approval: "Getting the code ready",
    snapshot: "Saving your unsaved work",
    clone: "Copying the saved code",
    lfs: "Copying big files",
    start: (machine: string) => `Finishing on ${machine}`,
  },
  copyProgress: (done: string, total: string) => `${done} of ${total}`,
  copyDone: (machine: string) => `Copied to ${machine}.`,
  copyingTo: (machine: string) => `Copying to ${machine}`,
  copyCalledOff: "Called off. The original is untouched.",
} as const;
