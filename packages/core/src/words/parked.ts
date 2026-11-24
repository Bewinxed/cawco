/**
 * What a pick parked in a session's composer says (core parked.ts): a pick
 * between a design's directions, a decision card, and their record in the
 * transcript once answered.
 */

export const parkedWords = {
  /** The card's title, by what it asks and who asks it. */
  pickFrom: (who: string) => `Design pick from ${who}`,
  decisionFrom: (who: string) => `Decision from ${who}`,
  /** The directions, as a screen reader names their group. */
  directionsOf: (ask: string) => `Directions: ${ask}`,
  /** Where the pick lives, opened in the panel. */
  openGraph: "Open graph",
  openPage: "Open page",
  /** A note with no pick, said to the agent as the card's answer. */
  sendNote: "Send note",
  sendingNote: "Sending note…",
  /** A several-pick card's answer, once its options are picked. */
  answer: "Answer",
  /** A write the artifact's doc did not keep, in the error formula. */
  notKept: (why: string) => `Your pick wasn't kept: ${why} Pick again.`,
  /** The doc on its way: nothing can be kept yet. */
  joining: "Reaching the pick's page…",
  /** Picked where it lives while it stood here. */
  pickedThere: (where: "graph" | "page", what: string) =>
    `Picked on the ${where}: ${what}`,
  /** The minimized bar's words: what it asks. */
  minimizedLabel: (who: string, what: string) =>
    `Show the pick from ${who}: ${what}`,
  /** The settled record's state, as its pill says it. */
  picked: "picked",
  answered: "answered",
  withdrawn: "withdrawn",
  /** Its note, under what was picked. */
  yourNote: "Your note",
};
