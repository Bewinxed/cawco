/**
 * What a session start says: the New session form (its title and Start, the
 * permission modes' names and the mode chip, the Full Send confirmation, a
 * move's Start), which the dashboard renders from here, and what the hub
 * logs of a start it refused (hub server.ts). The probe kit finds them by
 * these same words (scripts/probe-words-check.ts refuses a copy). The app
 * draws none of it, so it is not written into it (scripts/words-swift.ts).
 */

import type { OfferedMode } from "../harness";

/** The mode chip's name, before the mode it names. */
const PERMISSION_MODE = "Permission mode:";

export const spawnWords = {
  /** Opens every line the hub logs of a start it refused. */
  refused: "[hub] refused spawn",
  /** One refused start, in the refusal's own words. */
  refusedLine: (refusal: string) => `${spawnWords.refused}: ${refusal}`,
  /** Between a session and the account its launch places it on, in the line the hub logs of it. */
  launchesOn: "launches on",
  /** The hub's line as a launch places a Claude session that ran on no account (server.ts `placeForLaunch`). */
  launchesOnLine: (instanceId: string, accountId: string, why: string) =>
    `[hub] ${instanceId} ${spawnWords.launchesOn} ${accountId} (${why}); its row says so once its conversation is there`,
  /** Each permission mode's name (the dashboard's permission-modes.ts says what each does). */
  modes: {
    default: "Ask first",
    plan: "Plan first",
    acceptEdits: "Accept edits",
    bypassPermissions: "Bypass",
    fullSend: "Full Send",
  } satisfies Record<OfferedMode, string>,
  /** The model picker's search field, by its accessible name. */
  searchModels: "Search models",
  /** The mode chip while no mode is picked: Start waits on one. */
  unchosenMode: "Choose a mode",
  /**
   * Why Start is held, beside it (PRODUCT.md: a control that can't act is
   * disabled with the reason stated), for what nothing else on the form says.
   */
  held: {
    machine: "Choose a machine to run this session on.",
    mode: "Choose a permission mode to start.",
    repo: "Enter the repository's git URL.",
    uploading: "Wait for your file to finish uploading.",
  },
  /** The mode chip's accessible name: "Permission mode: Ask first". */
  permissionModeHead: PERMISSION_MODE,
  permissionMode: (mode: string) => `${PERMISSION_MODE} ${mode}`,
  /** The form's title. */
  forkSession: "Fork session",
  continueSession: "Continue session",
  /** Its Start, and a Start that moves the project to the machine first. */
  startSession: "Start session",
  moveAndStart: "Move & start",
  moveIt: "Move it",
  /** The prompt's label, and a continuation's. */
  firstPrompt: "First prompt",
  nextStep: "Next step (optional)",
  /** A continuation's size: what the session holds now, before what it carries. */
  currentContext: "Current context",
  /** The warning while Full Send is the mode picked. */
  fullSendOn: "Full Send is on",
  fullSendCarried: "Full Send is on, from your last start",
  /** The confirmation a switch to Full Send asks first. */
  switchToFullSendTitle: "Switch to Full Send?",
  switchToFullSend: "Switch to Full Send",
  /** The Full Send switch's button while it applies. */
  switching: "Switching…",
  /** The permission picker's accessible name. */
  permissionModes: "Permission mode",

  /** The form's own controls: its head, its footer, its steps. */
  form: {
    back: "Back",
    close: "Close",
    cancel: "Cancel",
    /** Start while its work runs. */
    starting: "Starting…",
    /** Start on a continuation and on a fork. */
    continue: "Continue",
    fork: "Fork",
    startMany: (count: number) => `Start ${count} sessions`,
    /** The reading line while a machine is read, and Start while the folder is. */
    reading: "Reading…",
    checkingFolder: "Checking the folder…",
    notUploaded: "A file couldn't upload. Tap it to try again, or remove it.",
    hubUnreachable:
      "No spawn while the hub is unreachable. Reconnect to continue.",
    machineOffline: (machine: string) =>
      `${machine} is offline. Pick another machine, or start when it returns.`,
    dirUnreadable: (machine: string) =>
      `That directory can't be read on ${machine}. Check the path and try again.`,
    folderMissing: (machines: string) =>
      `Folder missing. Start creates it on ${machines}.`,
    enterDirectory: "Enter the directory this session should work in.",
    /** What a machine that didn't answer leaves unknown (`didntAnswer`). */
    folderUnknown: "whether the folder is there is not known",
    startUnknown: "whether the session started is not known",
    forkUnknown: "whether the fork started is not known",
    forkWhere: (harness: string, machine: string, folder: string) =>
      `A fork runs where its session ran: ${harness} on ${machine}, in ${folder}.`,
    forkNeedsMode: "Choose a permission mode for the fork.",
    moveChanged:
      "The move changed before it started. Open it and start it again.",
    /** A move's reading: what Move & start does first. */
    moveReading: (
      project: string,
      machine: string,
      work: string,
      size: string
    ) =>
      `${project} isn't on ${machine} yet. ${spawnWords.moveAndStart} clones it there first${work}${size}.`,
    moveWork: (machine: string) => `, with your uncommitted work on ${machine}`,
    /** A continuation's project, named rather than picked. */
    startsIn: (project: string) => `Starts in ${project}`,
    startsInWhy: (project: string) =>
      `The new session starts in ${project}, the project of the session it continues`,
    /** What a continuation opens on, and its sizing while it is read. */
    opensOn: "What the new session opens on",
    fromSummary: "From a summary",
    fromAsks: "From my asks",
    readingContext: "Reading the session's context…",
    yourMessages: (count: number) =>
      `your ${count} message${count === 1 ? "" : "s"}`,
    toSummarise: "to summarise",
    summariseWith: "Summarise with",
    continueOn: "Continue on",
    model: "Model",
    /** The @ and / menu's kinds. */
    kinds: {
      machine: "Machine",
      project: "Project",
      skill: "Skill",
      plugin: "Plugin",
    },
    insert: "Insert",
    noMatches: "No matches",
    /** The prompt's placeholder, and its keys beside it. */
    promptPlaceholder: "What should the agent do first?",
    promptKeys: "@ machine or project · / skills and plugins",
  },

  /** The account chip. */
  account: {
    name: "Account",
    chip: (account: string) => `Account: ${account}`,
    auto: "Auto",
    noReading: "no reading yet",
    atLimit: "at its limit, back in ",
    neverBackup: "never a backup, only when picked",
    left: (percent: number) => `${percent}% left`,
    ofFiveHours: " of 5 hours",
    ofFiveHoursResets: (when: string) => ` of 5 hours, resets in ${when}`,
  },

  /** The effort chip and its scale. */
  effort: {
    name: "Effort",
    chip: (level: string) => `Effort: ${level}`,
    default: "Default",
    none: "No effort",
    noneWhy: "This model has no effort setting",
    notExposed: "Effort n/a",
    notExposedWhy: (harness: string) => `${harness} doesn't expose effort`,
  },

  /** The lifetime chip. */
  lifetime: {
    chip: (name: string) => `Session lifetime: ${name}`,
    persistent: "Persistent",
    persistentDesc: "Stays on the board after its task, to pick up again.",
    ephemeral: "Ephemeral",
    ephemeralDesc: "A spin-off: ends and clears itself when the task is done.",
  },

  /** The machines chip and its rows. */
  machines: {
    chip: (machines: string) => `Machines: ${machines}`,
    select: "Select machine",
    count: (count: number) => `${count} machines`,
    offline: "Offline",
    idle: "Idle",
    running: (count: number) => `${count} session${count === 1 ? "" : "s"}`,
    willClone: "will clone",
    willCloneSized: (size: string) => `will clone · ${size}`,
    noneCheckedIn: "No machines have checked in.",
    connect: "Connect a machine…",
  },

  /** The project chip and its new-project fields. */
  project: {
    chip: (project: string) => `Project: ${project}`,
    none: "No project",
    clear: "Clear project",
    name: "Project name",
    path: "Project path",
    pathPlaceholder: "/path/to/project",
    create: "Create",
    creating: "Creating…",
    new: "New project…",
  },

  /** The location chip, and its folder browser and clone field. */
  location: {
    name: "Location",
    chip: (location: string) => `Location: ${location}`,
    chooseFolder: "Choose folder",
    source: "Location source",
    existingFiles: "Existing files",
    cloneRepo: "Clone a repository",
    directory: "Directory",
    directoryPlaceholder: "~/code/project",
    fromProject: "From project",
    override: "Override",
    browse: "Browse",
    close: "Close",
    parentFolder: "Parent folder",
    loadingFolders: "Loading folders…",
    noSubfolders: "No subfolders",
    useFolder: "Use this folder",
    listingMissed: "the folder's listing didn't come back",
    repository: "Repository",
    repoPlaceholder: "https://host/owner/repository.git",
    clonedInto: "Cloned into",
    clonedWhere: " on each machine, pulled fresh before the agent starts.",
  },

  /** The model picker. */
  model: {
    harness: "Harness",
    comingSoon: "Coming soon",
    soon: "soon",
    notInstalledOn: (machine: string) => `Not installed on ${machine}`,
    notInstalled: "not installed",
    search: "Search or paste a model id…",
    clear: "Clear",
    list: (harness: string) => `${harness} models`,
    custom: "Use custom model id",
    enter: "↵ Enter",
    noMatch: (harness: string, query: string) =>
      `No ${harness} models match "${query}"`,
    noneReported: (harness: string) => `No ${harness} models reported yet`,
  },

  /** The rows of starts the form left running (spawn/parked). */
  starting: {
    name: "Starting",
    startedOn: (machine: string) => `Started on ${machine}`,
    couldntStart: "Couldn't start",
    couldntContinue: "Couldn't continue",
    couldntContinueWhy: (error: string) => `Couldn't continue: ${error}`,
    couldntContinueAgain: "Couldn't continue. Open it to start it again.",
    continueTitle: (title: string) => `Continue ${title}`,
    dismiss: "Dismiss",
    dismissNamed: (title: string) => `Dismiss ${title}`,
    reopen: "Reopen",
    continuationGone:
      "The continuation isn't on the hub any more, so how it ended isn't known. Check the session it continued, then continue it again if no new session started.",
    reloadedBeforeAsk:
      "Nothing started: the page reloaded before the session was asked for. Open it and start it again; your prompt and picks are kept.",
    reloadedUnknown:
      "Whether it started isn't known: the page reloaded before the hub answered. Check your sessions, then open it and start it again if it isn't there.",
    reloadedNotListed:
      "The session didn't start: the page reloaded before the hub answered, and the board never listed it. Open it and start it again; your prompt and picks are kept.",
    reloadedPartly: (started: number, asked: number) =>
      `${started} of ${asked} sessions started: the page reloaded before the rest were asked for. Open it and start the rest again.`,
  },
};
