/**
 * Outcomes' words for this prototype (option 1). A line's finding and the
 * words that sum an outcome up are Fable's (2026-11-22); the rest are
 * placeholders that show what their place says. A line carries no answer
 * word: its glyph says done, not done or unknown, and its finding says what
 * the newest check found. The product's copy lands in `packages/core/src/words/**`
 * once a direction is picked.
 */
/** A sentence's closing full stop, dropped where it runs on after a colon. */
const STOP = /\.$/u;

export const outcomesWords = {
  view: "Outcomes",
  say: "Say an outcome",
  /** Read out over an outcome's lines, never drawn: the nesting shows it. */
  doneWhen: "Done when",
  /** A met outcome's words, on its folded line at the foot: said once, its count of lines in it. */
  met: (count: number) => `All ${count} true now, still being checked`,
  /** The same, short, where the Room rule's last step needs the line. */
  metShort: (count: number) => `All ${count} are true`,
  /** The press on a met outcome's words, or a folded count: its lines, spelled out in place. */
  showLines: (sentence: string, words: string) =>
    `${sentence.replace(STOP, "")}: ${words.toLowerCase()}. Show every line`,
  /** The true lines the Room rule folds under an outcome's unsettled ones. */
  andTrue: (count: number) =>
    count === 1 ? "1 other is true" : `${count} others are true`,
  andMore: (count: number) => `and ${count} more`,
  asks: (from: string) => `${from} asks:`,
  open: (what: string) => `Open ${what}`,
  close: "Close",
  /** The finding's name as the button that opens its line's explanation: it holds the finding's own words. */
  why: (sentence: string, found: string) =>
    `${sentence.replace(STOP, "")}: ${found}. Show why`,
  whyHead: "Why",
  saidBy: (by: string) => `${by}'s run said:`,
  readRun: "Read the whole run",
  checks: "What checks it",
  startRun: "Start a run now",
  openRoutine: (name: string) => `Open ${name}`,
  nothingChecks: "Nothing checks this.",
  cawSuggests: "Caw suggests",
  turnOn: "Turn it on",
  dontSuggest: "Don't suggest this",
  work: "Work on this",
  allPlanned: "All the agents planned",
  sendAnswer: "Send answer",
  sending: "Sending…",
  answered: (choice: string, from: string) =>
    `You answered: ${choice}. ${from} starts again.`,
  refused: (sentence: string) => `${sentence} Your answer is kept.`,
  notLive: (at: string) => `Last read at ${at}. The hub is not answering.`,
  notLiveReason: "The hub is not answering",
  suggestion: {
    take: "Take it",
    change: "Change the words first",
    next: (count: number) => `Next suggestion (${count} more)`,
  },
  unplaced: "Not under an outcome",
};
