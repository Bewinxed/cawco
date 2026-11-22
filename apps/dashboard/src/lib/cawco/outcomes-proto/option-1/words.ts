/**
 * Outcomes' words for this prototype (option 1). Every one is a placeholder
 * that shows what its place says; the product's copy is Fable's, and lands
 * in `packages/core/src/words/**` once a direction is picked.
 */
import { answerWord } from "../answer-word";

export const outcomesWords = {
  view: "Outcomes",
  say: "Say an outcome",
  doneWhen: "Done when:",
  met: "Met, still watched",
  allHold: (count: number) => `All ${count} hold`,
  andHold: (count: number) =>
    `and ${count} that ${count === 1 ? "holds" : "hold"}`,
  andMore: (count: number) => `and ${count} more`,
  asks: (from: string) => `${from} asks:`,
  open: (what: string) => `Open ${what}`,
  close: "Close",
  answer: answerWord,
  why: "Why",
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
  metTile: "Met, still watched",
};
