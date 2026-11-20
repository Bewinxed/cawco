/**
 * Every user-facing string rendered by Option 3's ProjectBar and
 * ProjectPassport, held in one exported object. Calm, short, factual.
 */
import type { ProjectAtLimit } from "@cawco/core/accounts";
import type { BuiltInKind } from "@cawco/core/decides";
import type { LandsMode } from "@cawco/core/injected";
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";

/** Formats how long ago `polledAt` answered ("just now", "4 min ago", "2 hr ago", "3 days ago"). */
function polledAgo(polledAt: number | null): string {
  if (polledAt === null) {
    return "waiting for first sync";
  }
  const elapsed = Math.max(0, Date.now() - polledAt);
  if (elapsed < MINUTE_MS) {
    return "just now";
  }
  if (elapsed < HOUR_MS) {
    const minutes = Math.floor(elapsed / MINUTE_MS);
    return `${minutes} min ago`;
  }
  if (elapsed < DAY_MS) {
    const hours = Math.floor(elapsed / HOUR_MS);
    return `${hours} hr ago`;
  }
  const days = Math.floor(elapsed / DAY_MS);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export const passportWords = {
  bar: {
    details: "Details",
    detailsWithFaults: (count: number) =>
      `Details, ${count} ${count === 1 ? "fault" : "faults"}`,
    spinOff: "Spin off",
    moreFor: (name: string) => `More for ${name}`,
    spend: "Spend",
    askCaw: "Ask Caw",
  },

  passport: {
    label: "Project details",
    hubAway: (since: string) => `As of ${since}, hub out of reach`,
    hubAwayDisabled: "Changes disabled",
  },

  common: {
    tryAgain: "Try again",
    configure: "Configure",
  },

  policy: {
    heading: "Standing policy",
    editRules: "Edit rules",
    whoDecides: "Who decides",
    followsFleetAll: (total: number) => `Follows the fleet on all ${total}`,
    ownAll: (total: number) => `Own rule on all ${total}`,
    ownOverFleet: (own: number, total: number) =>
      `Own rule on ${own} of ${total}, rest follow the fleet`,
    ruleFileUnreadable: "Rule file unreadable: every choice comes to you",
    decidesReadFailed: "Couldn't read Who decides",
    reviewBeforeDone: "Review before done",
    on: "On",
    off: "Off",
    finishedWork: "Finished work",
    account: "Account",
    accountReadFailed: "Couldn't read account",
    fleetRouting: "Fleet routing",
    signedOut: "Signed out everywhere: nothing can start",
    switchAccount: "Switch account",
    largeFiles: "Large-file storage",
  },

  kinds: {
    look: "Look",
    behaviour: "Behaviour",
    scope: "Scope",
    approach: "Approach",
    rules: "Rules",
    tools: "Tools",
  } satisfies Record<BuiltInKind, string>,

  landing: {
    main: "Default branch",
    branch: "Branch of its own",
    pr: "Branch + pull request",
    none: "Nowhere (outputs are the work)",
  } satisfies Record<LandsMode, string>,

  atLimit: {
    wait: "waits at limit",
    move: "moves at limit",
  } satisfies Record<ProjectAtLimit, string>,

  places: {
    heading: "Places",
    addPlace: "Add place",
    startsHere: "Starts here",
    hub: "Hub",
    offline: "Offline",
    missing: "Missing",
    move: "Move",
    findFolder: "Find folder",
    copyToMachine: "Copy to machine",
    drop: "Drop",
    actionFor: (action: string, target: string) => `${action} (${target})`,
    repositories: "Repositories",
  },

  tracker: {
    readFailed: "Couldn't read task mirror",
    staysInFiles: "Tasks stay in CawCo's files",
    connectTracker: "Connect tracker",
    linked: (count: number) => `${count} linked`,
    syncNow: "Sync now",
    syncing: "Syncing…",
    refused: "Refused",
    inStep: (polledAt: number | null) =>
      polledAt === null
        ? "In step, waiting for first sync"
        : `In step, ${polledAgo(polledAt)}`,
  },
} as const;
