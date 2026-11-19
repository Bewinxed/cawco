/**
 * The project details card's words (dashboard project/details/): Gemini's,
 * with the replacements the structure's "Words that would mislead" makes,
 * and the structure's own words in Gemini's register where its answer had
 * none. No word of the product's own model (place, landing, tracker,
 * connection, hub) stands on screen. The app draws none of the details, so
 * these are not written into it.
 */
import type { LandsMode } from "../injected";
import type { FolderAct, FolderRole } from "../project-folders";

export const cardWords = {
  title: "Project details",
  done: "Done",
  back: "Project details",
  canStart: "Agents can start",
  cantStart: "Agents can't start",
  needsLook: (section: string) => `${section} needs a look`,
  stopped: (host: string, at: string) =>
    `${host} stopped answering. Details from ${at}.`,
  tryAgain: "Try again",
  couldntRead: "Couldn't read this:",
  reading: "Reading the project's details",
  sent: "Waiting for the change to take",
} as const;

export const sectionWords = {
  files: {
    name: "Files and locations",
    line: "Which computers hold this project and where agents begin work.",
  },
  ai: {
    name: "AI account",
    line: "Which AI account and apps agents use, and whether work pauses if it runs out.",
  },
  finished: {
    name: "Finished code",
    line: "What happens to finished code, unless a task says otherwise.",
  },
  tasks: {
    name: "Task list",
    line: "Keeps tasks only here, or also updates both ways with GitHub or Linear.",
  },
  more: { name: "More code details" },
  code: {
    name: "Connected code",
    line: "The online codebases agents work on. Nothing here can be changed.",
  },
  bigFiles: {
    name: "Big file storage",
    line: "Where videos, designs and datasets are kept.",
  },
} as const;

export const folderWords = {
  role: {
    main: "Main folder",
    extra: "Extra folder",
    builtin: "Built-in folder",
  } satisfies Record<FolderRole, string>,
  builtinNote: (host: string) =>
    `Kept on ${host}. Holds tasks and the files agents save.`,
  online: "online",
  offline: "offline",
  /** A computer as last read, while what is shown was read earlier. */
  asOf: (online: boolean, at: string) =>
    `${online ? "online" : "offline"} · as of ${at}`,
  missing: "This folder is missing, so agents can't start in it.",
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

/** Each folder act: its name and the one line saying what it does. */
export const actWords = {
  move: {
    name: "Move files",
    line: "Moves every file to another folder or computer, then removes the old folder once every file is checked.",
  },
  locate: {
    name: "Locate folder",
    line: "Points this project at where the folder is now. None of your files move.",
  },
  connect: {
    name: "Connect existing folder",
    line: "Links a folder that already has these files. Nothing is copied.",
  },
  copy: {
    name: "Copy to computer",
    line: "Copies the saved code to another computer. Password files and anything left out of the code's history stay behind. The original is untouched.",
  },
} as const satisfies Record<FolderAct, { name: string; line: string }>;

export const aiWords = {
  automatic: {
    name: "Automatic",
    line: "Uses any account with room; apps vary.",
  },
  account: {
    name: "One account",
    line: "Agents start on the account you pick, with its apps.",
  },
  pick: "Pick an account",
  find: "Find an account",
  noMatch: "No account goes by that.",
  signedIn: "signed in",
  signedOut: "Signed out",
  signIn: "Sign in",
  chosenSignedOut: (name: string) =>
    `Agents can't start: ${name} is signed out.`,
  noAccounts: "No AI account is signed in. Agents can't start.",
  atLimit: "At account limit",
  wait: {
    name: "Pause and wait",
    note: "Pauses work; keeps your connected apps.",
  },
  move: {
    name: "Use another",
    note: "Keeps going, without those connected apps.",
  },
} as const;

/** Each way finished code goes: its name and its line. */
export const finishedWords = {
  main: { name: "Apply directly", line: "Updates your main code right away." },
  branch: {
    name: "Keep separate",
    line: "Sent to GitHub beside your main code, to combine later.",
  },
  pr: {
    name: "Ask for review",
    line: "Sent to GitHub beside your main code, with a review opened for you.",
  },
  none: {
    name: "No code steps",
    line: "For writing, research, and plain files.",
  },
} as const satisfies Record<LandsMode, { name: string; line: string }>;

export const taskWords = {
  here: {
    name: "Only here",
    line: "Tasks are kept in this project and nowhere else.",
  },
  github: {
    name: "GitHub Issues",
    connect: "Connect GitHub Issues",
    line: "Updates both ways with GitHub.",
  },
  linear: {
    name: "Linear",
    connect: "Connect Linear",
    line: "Updates both ways with Linear.",
  },
  connected: "Connected",
  linked: (n: number) =>
    `${n.toLocaleString("en")} ${n === 1 ? "task" : "tasks"} linked`,
  first: "First update running",
  updating: "Updating",
  upToDate: (at: string) => `Up to date as of ${at}`,
  refused: (service: string) => `${service} refused:`,
  refresh: "Refresh now",
  board: "Status board",
  noBoard: "No status board",
  change: "Change…",
  stopAsk: (service: string, n: number) =>
    `Stop updating with ${service}? ${n.toLocaleString("en")} tasks keep a link to their issue.`,
  stop: "Stop updating",
  cancel: "Cancel",
} as const;

export const moreWords = {
  bigDefaults: "big files: defaults",
  bigCustom: "big files: custom location",
  defaults: {
    name: "Use defaults",
    line: "Each codebase keeps its own storage.",
  },
  custom: {
    name: "Custom location",
    line: "Replaces all defaults with one address.",
  },
  address: "Address",
  signInFor: "Sign-in for it",
  save: "Save",
  noSignIn: "No sign-in holds a key for big files yet.",
  openOn: (name: string, host: string) => `Open ${name} on ${host}`,
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
    start: (machine: string) => `Starting on ${machine}`,
  },
  copyProgress: (done: string, total: string) => `${done} of ${total}`,
  copyDone: (machine: string) => `Copied to ${machine}.`,
  copyingTo: (machine: string) => `Copying to ${machine}`,
  copyCalledOff: "Called off. The original is untouched.",
} as const;

export const connectWords = {
  title: (service: string) => `Task list: ${service}`,
  what: "What this does",
  lines: (service: string) => [
    "Every task stays here too.",
    "From now on new tasks and new issues update both ways. Older ones are not copied.",
    `If both sides change the same thing, ${service}'s version stays.`,
    `Issues from people ${service} doesn't know wait for you.`,
  ],
  signIn: "Sign-in",
  noSignIn: (service: string) =>
    service === "GitHub"
      ? "No GitHub sign-in can serve. Add a GitHub app or token where your sign-ins are kept."
      : "No Linear sign-in can serve. Add a Linear app or API key where your sign-ins are kept.",
  addSignIn: "Add a sign-in",
  codebase: "GitHub codebase",
  team: "Linear team",
  find: "Type to find another",
  noMatch: "Nothing goes by that.",
  board: "Status board",
  boardLine:
    "Optional. Issues only say open or closed; a board's columns show each task step.",
  noColumns: (board: string) =>
    `${board} has no Status column, so each task shows as open or closed.`,
  columnOf: (stage: string) => `${stage}: its column`,
  leave: "Leave alone",
  none: "None",
  start: "Start updating",
  save: "Save",
  cancel: "Cancel",
} as const;
