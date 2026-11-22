/**
 * The Outcomes view's records for option 3, "one sentence each": as the
 * hub would answer them for one project. Each outcome carries its sentence
 * in the owner's words, one sentence of where it stands, and its lines;
 * each line its short finding, the newest run's whole finding, what checks
 * it, the work on it, and a run's question to him when one waits.
 */

/** Where a line stands now. `was` is an answer nothing checks any more, read in the past with its date. */
export type LineState =
  | { kind: "done" }
  | { kind: "notYet" }
  | { kind: "unknown" }
  | { kind: "was"; on: string };

/** Where an outcome stands, from its lines: done when every line is; not yet when one is found untrue; else not known. */
export type OutcomeState = "done" | "notYet" | "unknown";

/** A run's question to the person, about one line. */
export interface RunQuestion {
  /** The run's two answers, as peers. */
  choices: [string, string];
  /** What the run gave as evidence, each a time and what it saw. */
  evidence: { at: string; saw: string }[];
  id: string;
  /** The ask, in the asker's own words. */
  quote: string;
  /** Since when it waits, on the owner's clock. */
  since: string;
  /** Who asks: the routine's name. */
  who: string;
}

/** What checks a line. */
export type LineChecker =
  | {
      kind: "routine";
      name: string;
      /** What each run does, in its instruction's plain words. */
      does: string;
      /** Its rhythm and next start, in words. */
      when: string;
      /** Why a run cannot start now; null when one can. */
      cannotStart: string | null;
    }
  | { kind: "ended"; why: string }
  | { kind: "suggested"; does: string }
  | { kind: "nothing" };

/** A task: one-off work the agents planned. */
export interface Work {
  live: boolean;
  /** Its number, as the board shows it. */
  ref: string;
  /** Where it stands, in words. */
  state: string;
  title: string;
}

export interface OutcomeLine {
  ask: RunQuestion | null;
  checker: LineChecker;
  /** What was found, in a few words that add to the line's own. */
  finding: string;
  /** The newest run's whole finding, with what gave it and when; null when nothing has answered. */
  found: { said: string; from: string } | null;
  id: string;
  sentence: string;
  state: LineState;
  work: Work[];
}

export interface Outcome {
  id: string;
  lines: OutcomeLine[];
  sentence: string;
  /** Where it stands, in one sentence that names its subject. */
  standing: string;
  /** Work under the outcome that serves no single line. */
  work: Work[];
}

/** Caw's suggested outcome: its sentence and lines, nothing answered yet. */
export interface SuggestedOutcome {
  id: string;
  lines: string[];
  sentence: string;
}

/** Where an answer to a run's question stands: on its way to the hub, taken, or refused in the hub's words. */
export type AnswerState =
  | { kind: "open" }
  | { kind: "sending"; choice: string }
  | { kind: "answered"; choice: string }
  | { kind: "refused"; choice: string; why: string };

/** The line whose question waits on him, if any. */
export const waitingLine = (outcome: Outcome): OutcomeLine | null =>
  outcome.lines.find((line) => line.ask !== null) ?? null;

export const stateOf = (outcome: Outcome): OutcomeState => {
  if (outcome.lines.every((line) => line.state.kind === "done")) {
    return "done";
  }
  return outcome.lines.some((line) => line.state.kind === "notYet")
    ? "notYet"
    : "unknown";
};

/** The line an opened outcome opens on: the one a question concerns, else the first not done, else none. */
export const firstOpen = (outcome: Outcome): string | null =>
  (
    outcome.lines.find((line) => line.ask !== null) ??
    outcome.lines.find((line) => line.state.kind !== "done")
  )?.id ?? null;
