/**
 * The Exchange's words, written to DESIGN.md's Voice: labels from the TOM's
 * objects, actions by what they do, one verb through a flow (pick, send).
 * They live beside the prototype; the built surface moves them to
 * packages/core/src/words.
 */
import type { Kind, Route, Standing } from "./model.js";

export const KIND: Record<Kind, string> = {
  look: "Look",
  behaviour: "Behaviour",
  scope: "Scope",
  approach: "Approach",
  rules: "Rules",
  tools: "Tools",
};

/** The kinds in Who decides' order, read off the product's own list. */
export const KINDS = Object.keys(KIND) as Kind[];

export const ROUTE: Record<Route, string> = {
  you: "You",
  advisor: "An advisor",
  practice: "Common practice",
};

/** Where each kind goes by the fleet's default. */
export const FLEET_ROUTES: Record<Kind, Route> = {
  look: "you",
  behaviour: "you",
  scope: "you",
  approach: "advisor",
  rules: "advisor",
  tools: "practice",
};

/** Cawco-Dev's own rows over the fleet's: tool calls come to him. */
export const PROJECT_ROUTES: Partial<Record<Kind, Route>> = { tools: "you" };

/** The section a standing heads in the list. */
export const SECTION: Record<Standing, string> = {
  stopped: "Stops work",
  ahead: "Went ahead",
  quiet: "Quiet",
  ended: "Ended",
  aside: "Set aside · still stopped",
};

export const WORDS = {
  filterOpen: "Open",
  filterAll: "All",
  filterDecided: "Decided",
  searchPlaceholder: "Search what was asked, chosen and why",
  searchLabel: "Search decisions",
  stopsWork: "Stops work",
  wentAhead: "Went ahead",
  settledForYou: "Settled for you",
  recommended: "Recommended",
  notNow: "Not now",
  openSession: "Open the session",
  backToThreads: "Back to who is asking",
  composerPlaceholder: "Say what you think…",
  composerLabel: "Your words to the agent",
  whatWaits: "What waits on this",
  readWhy: "Read why",
  showLess: "Show less",
  pickAgain: "Pick again",
  letStand: "Let stand",
  correctIt: "Correct it",
  changeIt: "Change it",
  keepIt: "Keep it",
  tryAgain: "Try again",
  reload: "Reload",
  openPreview: "Open the live preview",
  closePreview: "Close the preview",
  whoDecides: "Who decides",
  closeWhoDecides: "Close Who decides",
  fleetDefault: "Fleet default",
  appliesNew:
    "A change applies to new decisions. Settled ones stay as they are.",
  emptyTitle: "No one is asking you anything",
  emptySearch: "Search the records",
  nothingDecided: "Nothing decided yet",
  nothingDecidedBody:
    "Each decision you or an advisor settle lands here, with its reason and the session that asked.",
  searchFailed: "Couldn't search the records",
  permissionNote: "in their sessions",
} as const;

/** "Send 2 picks", "Send your words", or plain "Send" with nothing to send. */
export function sendLabel(picks: number, words: boolean): string {
  if (picks > 0) {
    return `Send ${picks} ${picks === 1 ? "pick" : "picks"}`;
  }
  return words ? "Send your words" : "Send";
}

/** "1 of 4 picked". */
export function pickedOf(picked: number, total: number): string {
  return `${picked} of ${total} picked`;
}
