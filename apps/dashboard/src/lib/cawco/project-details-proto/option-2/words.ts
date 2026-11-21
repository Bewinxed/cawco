/**
 * Every word the work path says, written from the person's side (Gemini
 * Neon's one run, 2026-11-21): one label and at most one short line each.
 * A line that told the person nothing they act on was cut, not reworded.
 */

import type { RosterWords } from "#lib/cawco/decides/roster-words.js";
import type { StageState } from "./changes";
import type { ChoiceKind, Decider, Landing, TaskHome } from "./records";

export const howItRunsWords = {
  /** The view's tab in the project's views strip. */
  tab: "Settings",
  viewLabel: "Project settings",
  cancel: "Cancel",
  save: "Save",
  tryAgain: "Retry",
  /** A refused change's way on, beside the hub's words: the control is back where it was. */
  retryChange: "Retry change",

  /** The hub out of reach: what shows was read `age` ago, and nothing can change. */
  hubOutOfReach: (age: string) =>
    `Server is offline, leaving settings from ${age} read-only.`,

  stages: {
    tasks: "Where tasks live",
    sessions: "Where agents run",
    waits: "What needs you",
    lands: "Where code goes",
  },

  stageState: {
    settled: "",
    busy: "Updating",
    away: "Offline",
    fault: "Needs fixing",
  } satisfies Record<StageState, string>,

  readFailedTitle: (stageTitle: string) => `Could not load ${stageTitle}`,
  stageLoading: (stageTitle: string) => `Loading ${stageTitle}`,

  tasks: {
    groupLabel: "Where tasks live",
    homes: {
      files: {
        name: "Local files",
        note: "Tasks stay local, keeping any past issue links.",
      },
      github: {
        name: "GitHub Issues",
        note: "Both sides sync, GitHub wins, and outside issues wait.",
      },
      linear: {
        name: "Linear",
        note: "Both sides sync, Linear wins, and outside issues wait.",
      },
    } satisfies Record<TaskHome, { name: string; note: string }>,
    syncNow: "Sync now",
    syncing: "Syncing…",
    firstSync: "Running first sync…",
    inStep: (age: string) => `Synced ${age}`,
    syncRefused: (age: string) => `Sync failed ${age}`,
    linkedCount: (count: number) => `${count.toLocaleString()} synced`,
    stagesVia: "Columns from",
    stagesNone: "Columns:",
    changeTie: "Change sync",
    setupTitle: (home: "github" | "linear") =>
      home === "github" ? "Sync with GitHub Issues" : "Sync with Linear",
    setupFieldsNote:
      "Only new items sync, sharing details, labels, and comments.",
    connectionLabel: "Sign-in",
    noConnection: (home: "github" | "linear") =>
      home === "github"
        ? "Add a GitHub App or token to sync."
        : "Add a Linear app or API key to sync.",
    openConnections: "Manage sign-ins",
    repoLabel: "Repository",
    teamLabel: "Team",
    projectRepoTag: "This project",
    filterRepos: "Search repositories",
    filterTeams: "Search teams",
    noMatches: "No matches",
    githubProjectLabel: "GitHub Project for columns",
    githubProjectNone: "Open and closed only",
    stageMapLabel: "Match columns to Status",
    leaveAlone: "Leave unchanged",
    stageStatusLabel: (stage: string) => `GitHub Status for ${stage}`,
    saveTie: "Start syncing",
  },

  places: {
    heading: "Folders",
    addPlace: "Add folder",
    machineLabel: "Machine",
    folderPath: "Path",
    add: "Add",
    adding: "Adding…",
    offlineNote: "Adds now while offline, then checks when back online.",
    scratchRefused:
      "Not added because temporary folders get deleted after runs.",
    startsHere: "Runs here",
    hub: "CawCo server",
    missing: "Not found",
    missingTip: "Folder not found here, so agents cannot start.",
    away: "Offline",
    awayTip: "Machine is offline, so agents wait until it reconnects.",
    moving: "Moving…",
    move: "Move",
    findFolder: "Change path",
    copyToMachine: "Copy elsewhere",
    drop: "Stop using",
    repositories: "Repositories",
    largeFilesHeading: "Git LFS",
    largeFilesGroupLabel: "Git LFS storage",
    largeFilesOwn: {
      name: "Repository default",
      note: "Uses each repo's Git host for large files.",
    },
    largeFilesDeclared: {
      name: "Custom server",
      note: "Overrides every repo to use one server you set.",
    },
    largeFilesAddress: "Server URL",
    largeFilesAddressPlaceholder: "https://lfs.example.com/project",
    largeFilesKey: "Sign-in key",
    largeFilesNoKey: "Add a saved key to sign in here.",
  },

  account: {
    heading: "Account",
    groupLabel: "Subscription account",
    fleetRouting: "Any available",
    signedOut: "Signed out",
    /** What naming an account does, under the chips; leaving it to any available says nothing more. */
    scopeNamed: "Caw moves here, and agents use its connected tools.",
    signedOutAlert: (name: string) =>
      `${name} is signed out, so nothing can start.`,
    openAccounts: "Manage accounts",
    atLimitHeading: "When usage runs out",
    atLimitGroupLabel: "When usage runs out",
    atLimitWait: {
      name: "Pause until reset",
      note: "Agents wait here and keep this account's tools.",
    },
    atLimitMove: {
      name: "Use another account",
      note: "Agents continue elsewhere without this account's tools.",
    },
  },

  waits: {
    heading: "Who makes the call",
    followingFleet: "Using defaults",
    projectRules: (count: number) => `${count} custom`,
    putAllBack: "Reset to defaults",
    legendFleet: "Default",
    legendOwn: "Custom here",
    fleetDefaults: "Manage defaults",
    unreadTitle: "Rules failed to load, so agents ask you everything.",
    members: {
      you: { name: "You", job: "Waits for your answer before moving on." },
      caw: { name: "Caw", job: "Answers as project lead in its thread." },
      advisor: {
        name: "Advisor",
        job: "Checks your code, docs, and brief, then answers.",
      },
      practice: {
        name: "Standard practice",
        job: "Follows industry norms and cites a source.",
      },
    } satisfies Record<Decider, { name: string; job: string }>,
    kinds: {
      look: {
        name: "Design and copy",
        example: "Covers layout, colors, motion, wording, and screen labels.",
      },
      behaviour: {
        name: "Behavior",
        example: "Covers user flows, notifications, and how agents act.",
      },
      scope: {
        name: "Scope changes",
        example: "Covers what to cut or save for later.",
      },
      approach: {
        name: "Implementation",
        example: "Covers picking how to build among valid options.",
      },
      rules: {
        name: "Rule exceptions",
        example: "Covers disabled lint, skipped checks, and spec deviations.",
      },
      tools: {
        name: "Libraries and style",
        example: "Covers packages, versions, config values, and code names.",
      },
    } satisfies Record<ChoiceKind, { name: string; example: string }>,
    /** The roster's own parts (its tiles, their hand-over, an empty card), in this view's words. */
    roster: {
      handOver: "Reassign",
      handOverKind: (kind: string) => `Reassign ${kind}`,
      handTo: (kind: string) => `Assign future ${kind.toLowerCase()} to`,
      fleetsChoice: "Default",
      followsFleetTip: (subject: string) =>
        `Uses your default, assigned to ${subject}.`,
      ownTip: (_project: string, subject: string) =>
        `Custom here, overriding your default of ${subject}.`,
      giveBack: "Reset to default",
      holdsNothing: (_project: string) => "Nothing assigned",
    } satisfies RosterWords,
    reviewLabel: "Require your review",
    reviewNote: "Only you mark tasks done, using a review column.",
  },

  lands: {
    groupLabel: "Where code goes",
    options: {
      default: {
        name: "Default branch",
        note: "Pushes commits straight to your default branch.",
      },
      branch: {
        name: "Separate branch",
        note: "Pushes a task branch, leaving your default untouched.",
      },
      pr: {
        name: "Pull request",
        note: "Pushes a task branch and opens a pull request.",
      },
      nowhere: {
        name: "Files only",
        note: "Saves output files without committing or pushing anything.",
      },
    } satisfies Record<Landing, { name: string; note: string }>,
  },
};
