/**
 * Locate folder (hub project-locate.ts): what CawCo can tell of the folder
 * the person named, what pointing the project's folder there will do, what
 * stands in the way, and the hub's refusals, in the project details card's
 * words (computer, codebase, agents).
 */

const agents = (n: number): string => (n === 1 ? "1 agent" : `${n} agents`);

/** What CawCo can tell of the folder named, as one line each. */
export const locateTells = {
  sameCodebase: "The same codebase: its first saved change matches.",
  otherCodebase: (named: string | null, was: string | null): string =>
    `A different codebase${named ? `, ${named}` : ""}${was ? `, where this folder held ${was}` : ""}.`,
  sameFolder: (was: string): string =>
    `The same folder that was at ${was}, moved or renamed.`,
  placed:
    "It holds the skills and rules CawCo placed for this project, so CawCo has worked here for it.",
  cannotTell:
    "CawCo can't tell whether this is the same project's folder. It points there anyway.",
  away: (machine: string): string =>
    `CawCo can't tell anything of the folder until ${machine} is back.`,
} as const;

/** Each line of What will happen, in order. */
export const locateLines = {
  pointed: (path: string, machine: string): string =>
    `This project's folder on ${machine} becomes ${path}. No file moves.`,
  oldStays: (was: string): string =>
    `${was} stops being one of this project's folders and stays on disk, untouched.`,
  conversations: (n: number): string =>
    n === 1
      ? "1 agent that worked in the old folder goes on in this one, in the same conversation."
      : `${n} agents that worked in the old folder go on in this one, each in the same conversation.`,
  stopNow: (n: number): string =>
    `${agents(n)} still working in the missing folder stop now.`,
  placed:
    "This project's skills, servers, rules and hooks are placed in this folder.",
  held: (machine: string): string =>
    `${machine} is away. The folder changes once ${machine} can read it.`,
  /** The ask before two projects become one: both named, and which remains. */
  fold: (other: string, kept: string, joins: string): string =>
    `${other} already has this codebase. Locate folder makes the two one project: ${kept} stays, and ${joins}'s tasks, agents and folders join it.`,
} as const;

/** What stands in the way, and what to do. */
export const locateBlocks = {
  nothing: (path: string, machine: string) => ({
    why: `There is no folder at ${path} on ${machine}.`,
    todo: "Check the folder's name, or put the folder there first.",
  }),
  same: {
    why: "This project's folder is already there.",
    todo: "Name the folder where it is now.",
  },
  another: (path: string) => ({
    why: `${path} is already another of this project's folders.`,
    todo: "Disconnect that one first, or name another folder.",
  }),
  working: (n: number, was: string) => ({
    why: `${agents(n)} ${n === 1 ? "is" : "are"} working in ${was}.`,
    todo: "Let them finish or stop them, then locate the folder.",
  }),
} as const;

/** The hub's refusals of Locate folder, in its words. */
export const locateRefusals = {
  noProject: "There is no such project on this hub.",
  noPlace: "This project has no such folder any more. Refresh, then try again.",
  hubFolder:
    "This is the project's folder on the hub. The hub keeps it where it is.",
  foldUnasked: (other: string, kept: string) =>
    `${other} already has this folder's codebase, so locating it here makes the two projects one, with ${kept} staying. Check what will happen again, then locate the folder.`,
} as const;
