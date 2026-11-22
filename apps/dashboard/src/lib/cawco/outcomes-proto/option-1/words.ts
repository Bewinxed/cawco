/**
 * Outcomes' words for this prototype (option 1). The answer words are
 * Fable's (2026-11-22); the rest are placeholders that show what their
 * place says. The product's copy lands in `packages/core/src/words/**`
 * once a direction is picked.
 */
import type { Answer } from "./outcomes";

/** A sentence's closing full stop, dropped where it runs on after a colon. */
const STOP = /\.$/u;

/** A line's answer in words: the word a glance reads (S1). */
const answerWord = (answer: Answer): string => {
  switch (answer.kind) {
    case "holds":
      return "True";
    case "fails":
      return "False";
    case "unknown":
      return "Not known";
    case "held":
      return `Was true ${answer.on}`;
    case "failed":
      return `Was false ${answer.on}`;
    default:
      return answer satisfies never;
  }
};

export const outcomesWords = {
  view: "Outcomes",
  say: "Say an outcome",
  doneWhen: "Done when:",
  /** A met outcome's words, on its folded line at the foot: said once, its count of lines in it. */
  met: (count: number) => `All ${count} true now, still being checked`,
  /** The press on a met outcome's words, or a folded count: its lines, spelled out in place. */
  showLines: (sentence: string) =>
    `${sentence.replace(STOP, "")}: show every line`,
  /** The true lines the Room rule folds under an outcome's unsettled ones. */
  andTrue: (count: number) =>
    count === 1 ? "1 other is true" : `${count} others are true`,
  andMore: (count: number) => `and ${count} more`,
  asks: (from: string) => `${from} asks:`,
  open: (what: string) => `Open ${what}`,
  close: "Close",
  answer: answerWord,
  /** The answer word's name as the button that opens its line's explanation. */
  why: (sentence: string, answer: Answer) =>
    `${sentence.replace(STOP, "")}: ${answerWord(answer).toLowerCase()}. Show why`,
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
