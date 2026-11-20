/**
 * Every user-facing string for Option 2 ("How it runs"): calm ledger voice,
 * canonical terms (project, place, task, stage, connection, account), and
 * concise implications under ten words each.
 */

import type { StageState } from "./changes";
import type { ChoiceKind, Decider, Landing, TaskHome } from "./records";

export const howItRunsWords = {
  viewLabel: "How this project runs",
  cancel: "Cancel",
  save: "Save",
  saving: "Saving…",
  tryAgain: "Try again",

  /** Hub out-of-reach banner shown once at the top of the view. */
  hubOutOfReach: (age: string) =>
    `As of ${age} — hub out of reach. Changes cannot be sent until it returns.`,

  stages: {
    tasks: "Tasks enter",
    sessions: "Sessions start",
    waits: "What waits for you",
    lands: "Work lands",
  },

  stageState: {
    settled: "",
    busy: "In progress",
    away: "Needs attention",
    fault: "Blocked",
  } satisfies Record<StageState, string>,

  readFailedTitle: (stageTitle: string) => `Could not read ${stageTitle}`,
  stageLoading: (stageTitle: string) => `Loading ${stageTitle}`,

  tasks: {
    groupLabel: "Where tasks are kept",
    homes: {
      files: {
        name: "CawCo's files",
        note: "Project files; returning keeps issue links.",
      },
      github: {
        name: "GitHub Issues",
        note: "One-way repo mirror; GitHub wins; un-vouched wait.",
      },
      linear: {
        name: "Linear",
        note: "One-way team mirror; Linear wins; un-vouched wait.",
      },
    } satisfies Record<TaskHome, { name: string; note: string }>,
    syncNow: "Sync now",
    syncing: "Syncing…",
    firstSync: "First sync running",
    inStep: (age: string) => `In step · ${age}`,
    syncRefused: (age: string) => `Sync refused · ${age}`,
    linkedCount: (count: number) => `${count.toLocaleString()} linked`,
    stagesVia: "Stages via",
    stagesNone: "Stages:",
    changeTie: "Change tie",
    setupTitle: (home: "github" | "linear") =>
      home === "github" ? "Tie to GitHub Issues" : "Tie to Linear",
    setupFieldsNote:
      "Title, body, labels, stage and comments sync; order, links, attempts and checks stay in CawCo.",
    connectionLabel: "Connection",
    noConnection: (home: "github" | "linear") =>
      home === "github"
        ? "Add a GitHub App or token connection to mirror issues."
        : "Add a Linear app or API key connection to mirror issues.",
    openConnections: "Configure → Connections",
    repoLabel: "Repository",
    teamLabel: "Team",
    projectRepoTag: "Project repo",
    filterRepos: "Filter repositories…",
    filterTeams: "Filter teams…",
    noMatches: "No matching target.",
    githubProjectLabel: "GitHub Project for stages (optional)",
    githubProjectNone: "None — open and closed only",
    stageMapLabel: "Map stages to Status",
    leaveAlone: "Leave alone",
    stageStatusLabel: (stage: string) => `${stage} status`,
    saveTie: "Save tie",
    savingTie: "Saving tie…",
  },

  places: {
    heading: "Places",
    addPlace: "Add place",
    addHeading: "Add a place",
    machineLabel: "Machine",
    folderPath: "Folder path",
    add: "Add",
    adding: "Adding…",
    offlineNote:
      "Machine is away — accepted now, repository read once it returns.",
    scratchRefused:
      "A folder in a machine's scratch area is removed when its session ends. Nothing was added; choose another path.",
    startsHere: "Starts here",
    hub: "Hub",
    hubStore: "Hub store",
    missing: "Missing",
    missingTip: "Folder not found at this path; nothing can start here.",
    away: "Away",
    awayTip: "Machine is offline; starts wait until it returns.",
    moving: "Moving",
    movingTip: "Move in progress for this place.",
    move: "Move",
    findFolder: "Find folder",
    copyToMachine: "Copy to machine",
    drop: "Drop",
    repositories: "Repositories",
    largeFilesHeading: "Large files",
    largeFilesGroupLabel: "Large-file storage",
    largeFilesOwn: "Each repository's own",
    largeFilesDeclared: "Declared address",
    largeFilesAddress: "Storage address",
    largeFilesAddressPlaceholder: "https://lfs.example.com/project",
    largeFilesKey: "Key connection",
    largeFilesNoKey: "Add a connection holding a key to sign in there.",
    largeFilesOverrideNote:
      "Overrides each repository's own large-file configuration.",
  },

  account: {
    heading: "Account",
    groupLabel: "Project account",
    fleetRouting: "Fleet routing",
    signedOut: "Signed out",
    scopeNamed: "Sessions start here with connectors; Caw's chat moves.",
    scopeFleet: "Fleet routing picks an account for each session.",
    signedOutAlert: (name: string) =>
      `Nothing in this project can start until ${name} signs in.`,
    openAccounts: "Configure → Accounts",
    atLimitHeading: "At its limit",
    atLimitGroupLabel: "At account limit",
    atLimitWait: {
      name: "Wait for reset",
      note: "Keeps this account's connectors.",
    },
    atLimitMove: {
      name: "Move to an account with room",
      note: "Loses this account's connectors.",
    },
  },

  waits: {
    heading: "Who decides",
    followingFleet: "Following fleet",
    projectRules: (count: number) =>
      count === 1 ? "1 project rule" : `${count} project rules`,
    fleetDefaults: "Fleet defaults",
    unreadTitle: "Every choice comes to you until this reads",
    fleetMark: "Fleet",
    reset: "Reset",
    resetKind: (kind: string) => `Reset ${kind} to fleet default`,
    kindGroupLabel: (kind: string) => `Who decides ${kind}`,
    kinds: {
      look: "Look",
      behaviour: "Behaviour",
      scope: "Scope",
      approach: "Approach",
      rules: "Rules",
      tools: "Tools",
    } satisfies Record<ChoiceKind, string>,
    deciders: {
      you: "You",
      caw: "Caw",
      advisor: "Advisor",
      practice: "Common practice",
    } satisfies Record<Decider, string>,
    reviewHeading: "Review before done",
    reviewGroupLabel: "Review before done",
    reviewOn: "Only you move to done",
    reviewOff: "Agents mark done",
    reviewNote: "Switching updates the stages tasks move through.",
  },

  lands: {
    groupLabel: "Where finished work lands",
    options: {
      default: {
        name: "Default branch",
        note: "Commits land on default branch.",
      },
      branch: {
        name: "Own branch",
        note: "Pushes a task branch to remote.",
      },
      pr: {
        name: "Branch + pull request",
        note: "Opens a pull request per task.",
      },
      nowhere: {
        name: "Nowhere",
        note: "No push; outputs are the work.",
      },
    } satisfies Record<Landing, { name: string; note: string }>,
    footer: "Tasks can override. Verified by the project's CI/CD.",
  },
};
