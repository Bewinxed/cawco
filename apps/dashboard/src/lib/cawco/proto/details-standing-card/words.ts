/**
 * The words the Standing card prototype shows (Option 1 of the project
 * details' structure). A prototype's own: once it is built, they move into
 * `packages/core/src/words/` (DESIGN.md, Words). The trackers' names are
 * core trackers.ts's.
 */
import type { LandsMode } from "@cawco/core/injected";

const count = (n: number): string => n.toLocaleString("en");
/** A size in bytes, as a person reads it: "3.1 GB". */
const sizeOf = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let at = 0;
  let size = bytes;
  while (size >= 1000 && at < units.length - 1) {
    size /= 1000;
    at += 1;
  }
  return `${size.toFixed(at === 0 ? 0 : 1)} ${units[at]}`;
};
const many = (n: number, one: string, more: string): string =>
  `${count(n)} ${n === 1 ? one : more}`;

export const standingWords = {
  card: "Project details",
  back: "Back to the details",
  readAgain: "Read again",
  tryAgain: "Try again",

  cant: {
    folder: (machine: string) =>
      `Nothing can start: the folder on ${machine} is missing.`,
    account: (account: string) =>
      `Nothing can start: ${account} is signed in on no machine.`,
    hub: (at: string) =>
      `The hub isn't answering. These were read at ${at}; nothing can change until it's back.`,
    signIn: "Sign in",
  },

  places: {
    title: "Places",
    startsHere: "Work starts here",
    missing: "Missing",
    away: "Away",
    left: "Left the fleet",
    made: "CawCo made it",
    hub: "On the hub",
    move: "Move",
    find: "Find folder",
    drop: "Drop",
    add: "Add place",
    openRepo: (name: string) => `Open ${name}`,
    learned: (repository: string) => `Linked to ${repository}.`,
    learnsLater: "Nothing read yet: its machine is away.",
    drops: "Drop this place? The folder stays on disk.",
    keep: "Keep",
  },

  adding: {
    machine: "Machine",
    folder: "Folder",
    folderHint: "/home/sam/code/atlas-site",
    already: "It's already there",
    alreadyNote: "Point at the folder as it is.",
    copy: "Copy it there",
    copyNote: "Through git: the original stays.",
    copyLeaves: "Secrets and ignored files stay behind.",
    add: "Add place",
    cancel: "Cancel",
  },

  tasks: {
    title: "Tasks kept",
    notes: {
      cawco: "Files only.",
      github: "Two-way, one repo.",
      linear: "Two-way, one team.",
    },
    linked: (n: number) => `${count(n)} linked`,
    syncing: "First sync under way",
    synced: (at: string) => `In step at ${at}`,
    refused: "Sync refused",
    syncNow: "Sync now",
    stagesOn: "Stages on",
    change: "Change",
    unread: "The tracker didn't read.",
    backAsk:
      "Keep tasks in CawCo only? The links let go; each task still names its issue.",
    backGo: "Keep in CawCo",
    backStay: "Stay tied",
  },

  lands: {
    title: "Finished work goes",
    when: "when a task doesn't say",
    names: {
      main: "Main",
      branch: "Branch",
      pr: "PR",
      none: "None",
    } satisfies Record<LandsMode, string>,
    notes: {
      main: "Onto main.",
      branch: "Own branch.",
      pr: "Pull request.",
      none: "No commits.",
    } satisfies Record<LandsMode, string>,
  },

  account: {
    title: "Account",
    fleet: "Fleet routes",
    signedOut: "Signed in nowhere",
    none: "No accounts yet.",
    addOne: "Add an account",
    atLimit: "At its limit",
    wait: "Wait",
    waitNote: "Keeps its connectors.",
    move: "Move on",
    moveNote: "Loses its connectors.",
  },

  lfs: {
    title: "Large files",
    each: "Each repository's own",
    one: "One address",
    oneNote: "Overrides theirs.",
    address: "Address",
    addressHint: "https://lfs.northwind.studio/atlas",
    connection: "Signs in with",
    noKey: "No connection holds a key.",
    addConnection: "Add a connection",
    save: "Save address",
  },

  move: {
    title: "Move",
    to: "Move to",
    folder: "Folder",
    reading: "Reading the folder…",
    rename: "One rename on the same disk: done at once.",
    copy: (files: number, bytes: number) =>
      `A copy: ${many(files, "file", "files")}, ${sizeOf(bytes)}.`,
    away: (machine: string) =>
      `${machine} is away, so the copy can't be checked yet.`,
    happens:
      "Everything goes, secrets and ignored files too. The project follows, and the old folder is removed once every file is proven there.",
    along: (names: string) => `Moves along: ${names}.`,
    unheld: (name: string) => `${name} no longer holds these files.`,
    links: (n: number) =>
      `${many(n, "link", "links")} inside point at the old path and will break.`,
    running: (n: number) => `Running here: ${count(n)}`,
    midTurn: "Mid-turn: waits for it to end.",
    asIs: "As it is",
    summary: "From a summary",
    continuesOn: "Continues on",
    dropsNote:
      "A summary leaves out tool calls and their output, reasoning, and going back.",
    stops: "Can't move",
    go: "Move",
    back: "Back",
  },

  running: {
    title: "Moving",
    files: (done: number, total: number) =>
      `${count(done)} of ${many(total, "file", "files")}`,
    bytes: (done: number, total: number) =>
      `${sizeOf(done)} of ${sizeOf(total)}`,
    waiting: "Waiting for a turn to end",
    interrupt: "Interrupt now",
    holding: (machine: string) =>
      `Holding: ${machine} is away. Nothing is removed while a machine is away.`,
    failed: (step: string) => `${step} failed`,
    oldFolder: "Old folder",
    newFolder: "New folder",
    again: "Try this step again",
    callOff: "Call it off",
    goesOn: "Closing this leaves the move running.",
  },

  after: {
    title: "Moved",
    calledOffTitle: "Called off",
    proven: (files: number, bytes: number) =>
      `Proven: ${many(files, "file", "files")}, ${sizeOf(bytes)}`,
    atCommit: (commit: string) => `at ${commit}`,
    sessions: "Sessions",
    running: "Running in the new folder",
    summary: "Continued from a summary",
    stopped: "Didn't resume",
    left: "Left in the old folder",
    duplicate: "What's left is a duplicate.",
    removeAgain: "Try removing again",
    ended: "Ended with the move",
    calledOff: "Sessions resumed in the old folder.",
    done: "Done",
  },

  find: {
    title: "Find folder",
    was: (path: string) => `Was ${path}`,
    folder: "Folder",
    reading: "Reading the folder…",
    tells: {
      reading: "Reading the folder…",
      "same-repository": "The same repository.",
      "other-repository": "A different repository.",
      "same-folder": "The same folder, moved or renamed.",
      "placed-copies": "CawCo's placed files are in it.",
      "cant-tell": "CawCo can't tell. Your pick stands.",
    },
    away: (machine: string) => `Waits until ${machine} can read the folder.`,
    follows: "What follows",
    noFileMoves: "No file moves.",
    carried: "Conversations are carried here.",
    goneStop: "Sessions whose folder is gone stop now.",
    placed: "Skills, servers, memory and hooks are placed here.",
    oldStays: (path: string) => `${path} stays on disk, no longer a place.`,
    merge: (other: string) =>
      `This folder is ${other}'s repository: the two projects become one. Which remains?`,
    point: "Point here",
    back: "Back",
  },

  tie: {
    title: (tracker: string) => `Tie tasks to ${tracker}`,
    connection: "Connection",
    noConnection: (kind: string) => `None can serve: ${kind} is needed.`,
    addConnection: "Add a connection",
    repository: "Repository",
    team: "Team",
    ownRepo: "This project's",
    find: "Type to find another",
    project: "GitHub Project for stages",
    noProject: "None",
    stages: "Each stage's Status",
    leave: "Leave alone",
    does: "What tying does",
    facts: [
      "Every task stays a file here.",
      "New issues become tasks; new tasks become issues.",
      "Nothing older is copied.",
      "The tracker's version wins when both change.",
    ],
    tie: "Tie",
    back: "Back out",
  },
};
