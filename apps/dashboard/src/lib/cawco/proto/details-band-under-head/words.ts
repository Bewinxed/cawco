/**
 * The words the band of a project's details shows (Option 2, "Band under
 * the head"). A prototype's: they move to `packages/core/src/words/` with
 * the build of whichever option is picked.
 */
import type { LandsMode } from "@cawco/core/injected";
import type { Tracker } from "@cawco/core/trackers";
import type { MoveStep } from "./band-model";

export const bandWords = {
  /** The band's own close, beside the place mark that opened it. */
  close: "Close project details",
  /** The band, as a screen reader names its region. */
  region: "Project details",

  places: {
    title: "Places",
    workStarts: "Work starts here",
    missing: "Missing",
    away: "Away",
    left: "Left the fleet",
    madeByCawco: "Made by CawCo",
    hub: "Hub",
    hubFolder: "Its folder on the hub",
    move: "Move",
    findFolder: "Find folder",
    drop: "Drop",
    add: "Add place",
    /** Each step of a Move, as a place's row says it while the Move runs. */
    steps: {
      stop: "Stopping sessions",
      copy: "Copying",
      check: "Checking",
      place: "Putting in place",
      remove: "Removing old folder",
      resume: "Resuming sessions",
    } satisfies Record<MoveStep, string>,
    /** A place being moved, in place of its acts: the step, then how far. */
    moving: (step: string, share: number) =>
      `${step} · ${Math.round(share * 100)}%`,
    /** A place being moved, as a screen reader hears its row's act. */
    reopenMove: (machine: string) => `Open the move of ${machine}'s folder`,
    /** Each repository chip, as a screen reader hears it. */
    openRepository: (name: string) => `Open ${name}`,
    /** A row's acts, as a screen reader hears them: which place. */
    actOn: (act: string, machine: string) => `${act}: ${machine}`,
  },

  decides: {
    title: "Who decides",
    /** The standing, at a value's weight. */
    follows: "Follows the fleet",
    own: (count: number, of: number) => `Its own on ${count} of ${of} kinds`,
    unread: "Every choice comes to you",
    /** A kind the project settles its own way, after who settles it. */
    ownKind: "own",
    /** Each kind's short name, as the band lists them. */
    kinds: new Map([
      ["look", "Look"],
      ["behaviour", "Behaviour"],
      ["scope", "Scope"],
      ["approach", "Approach"],
      ["rules", "Rules"],
      ["tools", "Tools"],
    ]),
    review: "Review before done",
    reviewNote: "Only you move a task to done.",
    open: "Open Who decides",
  },

  account: {
    title: "Account",
    fleet: "Fleet routes",
    signedOut: "Signed in nowhere",
    atLimit: "At its limit",
    wait: "Wait for it",
    waitNote: "Keeps its connectors",
    move: "Move on",
    moveNote: "Loses its connectors",
  },

  tasks: {
    title: "Tasks kept",
    names: {
      cawco: "CawCo",
      github: "GitHub Issues",
      linear: "Linear",
    } satisfies Record<Tracker, string>,
    notes: {
      cawco: "As files in the project",
      github: "Two-way with one repository",
      linear: "Two-way with one team",
    } satisfies Record<Tracker, string>,
    linked: (count: number) =>
      `${count.toLocaleString("en")} ${count === 1 ? "task" : "tasks"} linked`,
    syncing: "First sync under way",
    synced: (at: string) => `In step as of ${at}`,
    refused: "Refused",
    syncNow: "Sync now",
    syncingNow: "Syncing…",
    stagesOn: "Stages on",
    change: "Change",
    noStages: "No stages on a GitHub Project",
  },

  landing: {
    title: "Finished work goes",
    when: "when a task doesn't say",
    names: {
      main: "Main",
      branch: "Branch",
      pr: "PR",
      none: "None",
    } satisfies Record<LandsMode, string>,
    notes: {
      main: "Straight onto main",
      branch: "A branch of its own",
      pr: "A branch and a pull request",
      none: "Outputs only, no commit",
    } satisfies Record<LandsMode, string>,
  },

  lfs: {
    title: "Large files",
    own: "Each repository's own",
    address: "One address",
  },
} as const;
