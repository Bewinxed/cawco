/**
 * Every user-facing string in Option 1 (Governed canvas), in the product's
 * calm voice. Who decides member and kind names come straight from core
 * `decidesWords`.
 */
import type { BuiltInKind } from "@cawco/core/decides";
import type { LandsMode } from "@cawco/core/injected";
import type { Tracker } from "@cawco/core/trackers";
import { decidesWords } from "@cawco/core/words/decides";
import type { Member } from "./records";

export const words = {
  hub: {
    asOf: (time: string) => `As of ${time}`,
    outOfReachTip: (time: string) =>
      `As of ${time} — hub out of reach. Changes cannot be sent until it reconnects.`,
    outOfReachNotice: (time: string) =>
      `As of ${time} — hub out of reach. Showing last read values; changes cannot be sent until it reconnects.`,
    tryAgain: "Try again",
    cancel: "Cancel",
    apply: "Apply",
    saving: "Saving…",
    reading: "Reading…",
  },

  bar: {
    renameLabel: "Project name",
    renameHint: (name: string) => `Rename ${name}`,
    cawSwitchLabel: (project: string) => `Caw's attention to ${project}`,
    cawSwitchTipOn:
      "Caw is on — receives project events, routines and reports.",
    cawSwitchTipOff:
      "Caw is off — events paused; only your messages reach Caw.",
    cawOffLine: "Events paused — only your messages reach Caw",
    spinOff: "Spin off",
    more: "More project actions",
    moreItems: {
      spend: "Spend",
      forget: "Forget",
      delete: "Delete",
    },
    askCaw: "Ask Caw",
  },

  places: {
    triggerCount: (count: number) =>
      count === 1 ? "1 place" : `${count} places`,
    triggerMissing: "Folder missing",
    triggerAria: (project: string, summary: string, stale?: string) =>
      stale
        ? `${project} places: ${summary} (${stale})`
        : `${project} places: ${summary}`,
    sectionPlaces: "Places",
    addPlace: "Add place",
    add: "Add",
    adding: "Adding…",
    machineLabel: "Machine",
    folderPathLabel: "Folder path",
    folderPathPlaceholder: "~/code/project or /srv/work/project",
    offlineAddNote:
      "Machine is offline — repository discovery waits until it reconnects.",
    startsHere: "Starts here",
    hubStore: "Hub store",
    hubName: "Hub",
    leavesWithProject: "Leaves with project",
    missingBadge: "Missing",
    missingNote:
      "Folder not at this path — nothing can start here until found.",
    statusOnline: "Online",
    statusOffline: "Offline",
    statusLeft: "Left fleet",
    acts: {
      move: "Move",
      find: "Find folder",
      copy: "Copy to machine",
      drop: "Drop",
    },
    dropHint: "Stops counting this place; leaves the folder on disk.",
    sectionRepos: "Repositories",
    repoSourceRemote: "remote",
    sectionLargeFiles: "Large-file storage",
    largeFilesModes: {
      own: {
        name: "Each repo's own",
        note: "Uses each repository's own remote",
      },
      declared: {
        name: "Declared address",
        note: "Overrides every repository's own config",
      },
    },
    lfsUrlLabel: "Large-file address",
    lfsUrlPlaceholder: "https://lfs.example.com/objects",
    lfsConnectionLabel: "Connection with key",
    lfsNoKeyConnections:
      "No connection holds a key for large-file storage. Add a key-holding connection in Configure → Connections.",
    lfsOverrideNote: "Overrides every repository's own config.",
    configureConnections: "Configure → Connections",
    connectionsUnread: (reason: string) =>
      `Connections could not be read: ${reason}`,
  },

  account: {
    fleetRouting: "Fleet routing",
    signedOut: "Signed out",
    triggerAria: (label: string, stale?: string) =>
      stale ? `Account: ${label} (${stale})` : `Account: ${label}`,
    groupLabel: "Account",
    scopeLine:
      "Starts project sessions with this account's connectors; sessions naming their own keep theirs; moves Caw's conversation.",
    signedOutAlert:
      "Nothing in this project can start until this account is signed in on a machine.",
    configureAccounts: "Configure → Accounts",
    atLimitHeading: "At account limit",
    atLimitOptions: {
      wait: {
        name: "Wait for reset",
        note: "Keep connectors",
      },
      move: {
        name: "Move to account with room",
        note: "Lose connectors",
      },
    },
  },

  waiting: {
    fleetRules: "Fleet rules",
    projectRules: (count: number) =>
      count === 1 ? "1 project rule" : `${count} project rules`,
    reviewOn: "Review on",
    rulesUnreadable: "Rules unreadable",
    whoDecidesTip: "Who decides and Review before done — open Decisions rules",
    whoDecidesAria: (standing: string, stale?: string) =>
      stale
        ? `Who decides: ${standing} (${stale}). Open Decisions.`
        : `Who decides: ${standing}. Open Decisions.`,
    readingAria: "Reading Who decides",
  },

  views: {
    tablistLabel: "Project views",
    tabs: {
      board: "Board",
      table: "Table",
      routines: "Routines",
      decisions: "Decisions",
    },
    filter: "Filter",
    newTask: "New task",
  },

  taskHome: {
    cawcoFiles: "CawCo files",
    syncing: "Syncing…",
    firstSyncRunning: "First sync running",
    syncRefused: "Sync refused",
    trackerUnreadTrigger: "Tracker unread",
    syncNow: "Sync now",
    inStep: (age: string) =>
      age === "just now" ? "In step · just now" : `In step · ${age}`,
    linkedCount: (count: number) => `${count} linked`,
    triggerAria: (summary: string, stale?: string) =>
      stale ? `Task home: ${summary} (${stale})` : `Task home: ${summary}`,
    readingAria: "Reading task home",
    unread: (reason: string) => `Task home could not be read: ${reason}`,
    groupLabel: "Task home",
    homes: {
      cawco: {
        name: "CawCo's files",
        note: "Tasks stay as markdown files. Returning drops sync and keeps issue IDs.",
      },
      github: {
        name: "GitHub Issues",
        note: "Forward-only mirror from now on; GitHub wins ties. Tasks stay as files too.",
      },
      linear: {
        name: "Linear",
        note: "Forward-only mirror from now on; Linear wins ties. Tasks stay as files too.",
      },
    } satisfies Record<Tracker, { name: string; note: string }>,
    unvouchedNote:
      "Issues opened by un-vouched authors wait in a “you” stage and do not start agents.",
    noYouStageAlert:
      "Add a “you” stage before tying to a tracker — un-vouched issues wait there so agents do not start them.",
    connectionLabel: "Connection",
    noGithubConnections:
      "No GitHub connection available. Add a GitHub App or token in Configure → Connections.",
    noLinearConnections:
      "No Linear connection available. Add a Linear app or API key in Configure → Connections.",
    repoLabel: "Repository",
    teamLabel: "Team",
    filterRepoPlaceholder: "Filter or enter owner/repo…",
    filterTeamPlaceholder: "Filter or enter team…",
    projectRepoTag: "Project repo",
    useTypedTarget: (target: string) => `Use ${target}`,
    saveTie: "Save tie",
    changeTie: "Change tie",
    githubProjectLabel: "GitHub Project",
  },

  finishedWork: {
    triggerAria: (label: string, stale?: string) =>
      stale ? `Finished work: ${label} (${stale})` : `Finished work: ${label}`,
    groupLabel: "Where finished work lands",
    modes: {
      main: {
        name: "Default branch",
        note: "Commits rebase and land straight on the default branch.",
      },
      branch: {
        name: "Branch on remote",
        note: "Pushes a branch of its own; default branch stays untouched.",
      },
      pr: {
        name: "Branch + pull request",
        note: "Pushes a branch and opens a pull request against default.",
      },
      none: {
        name: "Nowhere — outputs are work",
        note: "Nothing is pushed; files and reports are the deliverable.",
      },
    } satisfies Record<LandsMode, { name: string; note: string }>,
    footer:
      "Tasks can name their own landing. Verified by the project's CI/CD.",
  },

  decisions: {
    heading: decidesWords.detailsLabel,
    followingFleet: "Following fleet",
    projectRules: (count: number) =>
      count === 1 ? "1 project rule" : `${count} project rules`,
    fleetDefaultsLink: "Configure → Who decides",
    unreadableTitle:
      "Rule file unreadable — every choice comes to you until fixed.",
    fleetTag: "Fleet",
    reset: "Reset",
    resetKindAria: (kindName: string) => `Reset ${kindName} to fleet default`,
    members: {
      you: decidesWords.you.name,
      caw: decidesWords.caw.name,
      advisor: decidesWords.advisor.name,
      practice: decidesWords.practice.name,
    } satisfies Record<Member, string>,
    kinds: {
      look: decidesWords.kinds.look,
      behaviour: decidesWords.kinds.behaviour,
      scope: decidesWords.kinds.scope,
      approach: decidesWords.kinds.approach,
      rules: decidesWords.kinds.rules,
      tools: decidesWords.kinds.tools,
    } satisfies Record<BuiltInKind, { name: string; example: string }>,
    reviewHeading: decidesWords.review.label,
    reviewOptions: {
      on: "Only you move to done",
      off: "Agents mark done",
    },
    reviewNote: "Changing this updates task stages.",
  },
} as const;
