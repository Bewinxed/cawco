/**
 * Locate folder (hub project-locate.ts): what CawCo can tell of the folder
 * the person named, what pointing the project's folder there will do, what
 * stands in the way, and the refusals; and the ask before two projects
 * become one, which Connect existing folder (hub project-connect.ts) makes
 * too. In the project details card's words (computer, codebase, agents).
 */

const agents = (n: number): string => (n === 1 ? "1 agent" : `${n} agents`);

/** What CawCo can tell of the folder named, as one line each. */
export const locateTells = {
  sameCodebase: "The same codebase.",
  otherCodebase: (named: string | null, was: string | null): string =>
    `A different codebase${named ? `: ${named}` : ""}.${was ? ` This project's is ${was}.` : ""}`,
  sameFolder: (was: string): string =>
    `The same folder that was at ${was}, moved or renamed.`,
  placed: "It holds this project's skills and rules, so CawCo has worked here.",
  cannotTell: "CawCo can't tell whether this is this project's folder.",
  away: (machine: string): string =>
    `${machine} is offline, so CawCo can't read this folder yet.`,
} as const;

/** Each line of What will happen, in order. */
export const locateLines = {
  pointed: (path: string, machine: string): string =>
    `This project's folder on ${machine} becomes ${path}. No file moves.`,
  oldStays: (was: string): string =>
    `${was} stays on disk, untouched, and is no longer this project's.`,
  conversations: (n: number): string =>
    n === 1
      ? "1 agent that worked in the old folder goes on here, in the same conversation."
      : `${n} agents that worked in the old folder go on here, each in the same conversation.`,
  stopNow: (n: number): string =>
    `${agents(n)} still working in the missing folder stop now.`,
  placed: "CawCo adds this project's skills and rules to this folder.",
  held: (machine: string): string =>
    `${machine} is offline, so this waits until it's back.`,
} as const;

/** Two projects becoming one: What will happen's line, and the refusal when it went unasked. */
export const foldWords = {
  /** Both named, and which one stays. */
  line: (other: string, kept: string, goes: string): string =>
    `${other} already has this codebase, so the two become one project: ${kept} stays, and ${goes}'s tasks, agents and folders join it.`,
  unasked: (other: string, kept: string, act: "locate" | "connect") =>
    `${other} already has this codebase, so ${act === "locate" ? "locating" : "connecting"} this folder makes the two one project, with ${kept} staying. Check what will happen, then try again.`,
} as const;

/** What stands in the way, and what to do. */
export const locateBlocks = {
  nothing: (path: string, machine: string) => ({
    why: `There is no folder at ${path} on ${machine}.`,
    todo: "Check the path, or move the folder there first.",
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
    todo: "Let them finish or stop them, then try again.",
  }),
} as const;

/** Locate folder's refusals. */
export const locateRefusals = {
  noProject: "This project is gone.",
  noPlace: "That folder is no longer one of this project's.",
  hubFolder: "The built-in folder stays where it is.",
  /** Call off: nothing is waiting for that folder's computer. */
  notHeld: "Nothing is waiting to change for that folder.",
} as const;
