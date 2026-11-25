/**
 * What a pick parked in a session's composer says (core parked.ts): a pick
 * between a design's directions, a decision card, and their record in the
 * transcript once answered or dismissed.
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
  /** A several-pick card's answer, once its options are picked. */
  answer: "Answer",
  /** Puts the pick down without a pick or a word. */
  dismiss: "Dismiss",
  /** The chip that opens the line for an answer of his own words, as a question's does. */
  other: "Other",
  /** A write the artifact's doc did not keep, in the error formula. */
  notKept: (why: string) => `Your pick wasn't kept: ${why} Pick again.`,
  /** An answer in his own words its doc did not keep, in the same formula. */
  wordsNotKept: (why: string) => `Your answer wasn't kept: ${why} Try again.`,
  /** A dismissal its doc did not keep, in the same formula. */
  dismissNotKept: (why: string) => `It wasn't dismissed: ${why} Try again.`,
  /** The doc on its way: nothing can be kept yet. */
  joining: "Reaching the pick's page…",
  /** Picked where it lives while it stood here. */
  pickedThere: (where: "graph" | "page", what: string) =>
    `Picked on the ${where}: ${what}`,
  /** Answered in his own words from another screen while it stood here. */
  answeredThere: "Answered on another screen",
  /** Dismissed from another screen while it stood here. */
  dismissedThere: "Dismissed on another screen",
  /** The minimized bar's words: what it asks. */
  minimizedLabel: (who: string, what: string) =>
    `Show the pick from ${who}: ${what}`,
  /** The settled record's state, as its pill says it. */
  picked: "picked",
  answered: "answered",
  withdrawn: "withdrawn",
  dismissed: "dismissed",
  /** Its note, under what was picked. */
  yourNote: "Your note",
  /** His answer in his own words, under its question, as a question's answer in his words is labelled; also what an earlier dismissal kept. */
  yourWords: "In your own words",
};
