/**
 * The Outcomes view's records, as the hub would answer them for one
 * project: its outcomes in the order they were said, each with its "Done
 * when:" lines and the answer each holds now, what answered it, what
 * checks it, what the agents do about it, and anything under it that waits
 * on the person. Option 2 of the Outcomes shaping (the bento has a lead
 * tile). Every string is a placeholder until the product's words are
 * written.
 */

/** A line's answer now. `held` and `failed` are answers nothing checks any more, read in the past with their date. */
export type LineAnswer =
  | { kind: "holds" }
  | { kind: "fails" }
  | { kind: "unknown" }
  | { kind: "held"; on: string }
  | { kind: "failed"; on: string };

/** A line counts as unsettled when it does not hold, is not known, or is no longer checked. */
export const unsettled = (answer: LineAnswer): boolean =>
  answer.kind !== "holds";

/** The sentence a line's newest answer came with, when, and what gave it. */
interface AnswerReason {
  from: string;
  said: string;
  when: string;
}

/** A run's question to the person: S3's ask block for the kind "a run's question". */
export interface RunQuestion {
  /** The run's choices, as option chips. */
  choices: string[];
  /** What the run gave as evidence, four lines at most. */
  evidence: string[];
  /** What happens once the person answers, said in the answered line. */
  goesOn: string;
  /** That the routine waits, in one sentence. */
  held: string;
  /** The ask, in the asker's own words. */
  quote: string;
  /** Since when it waits, on the owner's clock. */
  since: string;
  /** Who asks. */
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
      /** Its state when it is not simply on. */
      state: string | null;
      /** Why a run cannot start now; null when one can. */
      cannotStart: string | null;
    }
  | { kind: "ended"; name: string; why: string }
  | { kind: "suggested"; text: string }
  | { kind: "nothing" };

/** A routine's newest run. */
export interface NewestRun {
  ended: string;
  startedBy: string;
  took: string;
  when: string;
}

/** One-off work under the outcome that names this line. */
interface LineWork {
  live: boolean;
  /** Its number, as the board shows it. */
  ref: string;
  /** Where it stands, in words. */
  state: string;
  title: string;
}

/** One line under "Done when:". */
export interface OutcomeLine {
  answer: LineAnswer;
  /** Something about this line waits on the person. */
  ask: RunQuestion | null;
  checker: LineChecker;
  id: string;
  reason: AnswerReason | null;
  run: NewestRun | null;
  sentence: string;
  work: LineWork[];
}

/** A row of the agents' plan: a task or a routine. */
interface PlanRow {
  kind: "task" | "routine";
  live: boolean;
  name: string;
  /** A task's number; null for a routine. */
  ref: string | null;
  state: string;
}

/** The plan's rows under one line, or under the whole outcome (`line` null). */
interface PlanGroup {
  line: string | null;
  rows: PlanRow[];
}

export interface Outcome {
  id: string;
  lines: OutcomeLine[];
  plan: { groups: PlanGroup[]; done: number };
  sentence: string;
}

/** Caw's suggested outcome: its sentence and lines, with no answers yet. */
export interface SuggestedOutcome {
  id: string;
  lines: string[];
  /** How many more suggestions wait behind this one. */
  more: number;
  sentence: string;
}

/** Work that serves no outcome. */
export interface UnplacedRow {
  kind: "task" | "routine";
  name: string;
  ref: string | null;
  state: string;
}

/** An outcome waits on the person while any of its lines has an ask. */
export const waits = (outcome: Outcome): boolean =>
  outcome.lines.some((line) => line.ask !== null);

/** Met: every line holds. */
export const met = (outcome: Outcome): boolean =>
  outcome.lines.every((line) => line.answer.kind === "holds");

/** The line a lead opens on: the one the oldest ask concerns, else the first unsettled, else the first. */
export const firstLine = (outcome: Outcome): string =>
  (
    outcome.lines.find((line) => line.ask !== null) ??
    outcome.lines.find((line) => unsettled(line.answer)) ??
    outcome.lines[0]
  )?.id ?? "";
