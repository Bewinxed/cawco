/**
 * The words the Standing card prototype shows (Option 1 of the project
 * details' structure). A prototype's own: once an option is picked, the
 * build moves them into `packages/core/src/words/` (DESIGN.md, Words). The
 * kinds of choice and who settles them are Who decides' own words
 * (core words/decides.ts), and the trackers' names core trackers.ts's.
 */
import type { LandsMode } from "@cawco/core/injected";

export const standingWords = {
  card: "Project details",

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
    /** A repository chip's name for a screen reader: it opens on its host. */
    openRepo: (name: string) => `Open ${name}`,
  },

  decides: {
    title: "Who decides",
    fleet: "Follows the fleet",
    own: (count: number, of: number) => `Its own on ${count} of ${of} kinds`,
    unread: "Every choice comes to you",
    unreadWhy: "Its rule file didn't read.",
    readAgain: "Read again",
    ownMark: "Own",
    open: "Open Who decides",
    review: "Review before done",
    reviewNote: "Landed work waits for you.",
  },

  tasks: {
    title: "Tasks kept",
    notes: {
      cawco: "Files only.",
      github: "Two-way, one repo.",
      linear: "Two-way, one team.",
    },
    linked: (count: number) => `${count.toLocaleString("en")} linked`,
    syncing: "First sync under way",
    synced: (at: string) => `In step at ${at}`,
    refused: "Sync refused",
    syncNow: "Sync now",
    stagesOn: "Stages on",
    change: "Change",
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
  },
};
