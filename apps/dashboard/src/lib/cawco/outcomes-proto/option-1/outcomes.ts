/**
 * The records Outcomes reads (option 1, "the bento holds still"), shaped as
 * the hub would hand them: a project's outcomes in the order they were said,
 * each with its "Done when:" lines, what waits on the person under it, Caw's
 * suggestion, and the work that serves no outcome. A line's answer is the
 * newest run's (or landed work's); nothing latches.
 */

/** A line's answer now. `held` and `failed` are answers nothing checks any more, with the day they were given. */
export type Answer =
  | { kind: "holds" }
  | { kind: "fails" }
  | { kind: "unknown" }
  | { kind: "held"; on: string }
  | { kind: "failed"; on: string };

/** Unsettled: does not hold, not known, or no longer checked. */
export const unsettled = (answer: Answer): boolean => answer.kind !== "holds";

/** The sentence the newest answer came with, attributed to what gave it; or why nothing answered lately. */
type Why =
  | {
      kind: "said";
      /** What gave it: a routine's run, or landed work. */
      by: string;
      said: string;
      /** When, on the owner's clock. */
      at: string;
    }
  | { kind: "quiet"; reason: string };

/** The routine that checks a line. */
interface Checker {
  /** Why "Start a run now" is not offered now; none while it is. */
  cannotStart?: string;
  /** What each run does, in its instruction's plain words. */
  does: string;
  name: string;
  /** A run is going now. */
  running?: boolean;
  /** Its state when it is not simply on ("Ended: its run stopped it"). */
  state?: string;
  /** Its rhythm and next start, as a sentence. */
  when: string;
}

/** Caw's suggested routine for a line nothing checks. */
interface SuggestedChecker {
  does: string;
  when: string;
}

/** A piece of work under the outcome that names this line and is running, waiting or failed. */
interface Work {
  live: boolean;
  name: string;
  /** The task's number and name. */
  ref: string;
  /** Its live state, in words. */
  state: string;
}

/** The ask that waits on the person: here, a run's question. */
export interface Ask {
  /** The Needs you line's control, named for the act and its object. */
  act: string;
  /** The ask, in the asker's own words. */
  ask: string;
  /** The run's choices. */
  choices: string[];
  /** What that run gave as evidence, four lines at most. */
  evidence: string[];
  /** Who asks. */
  from: string;
  /** "<Routine> will not start again until you answer." */
  holds: string;
  id: string;
  since: string;
}

export interface Line {
  answer: Answer;
  checker: Checker | null;
  /** What the newest check found, in a few words; for an answer nothing checks any more, what it last found with its date. The glyph carries the answer; these words carry the finding. */
  found: string;
  id: string;
  sentence: string;
  /** When nothing checks it: what Caw suggests. */
  suggested?: SuggestedChecker;
  why: Why;
  work: Work[];
}

export interface Outcome {
  /** What waits on the person under this outcome, oldest first, with the line it concerns. */
  asks: { ask: Ask; line: string | null }[];
  id: string;
  lines: Line[];
  sentence: string;
}

export interface Suggestion {
  lines: string[];
  /** Suggestions after this one. */
  more: number;
  sentence: string;
}

interface Unplaced {
  /** What serves no outcome, in words. */
  holds: string;
}

export interface OutcomesRecord {
  outcomes: Outcome[];
  project: string;
  suggestion: Suggestion | null;
  unplaced: Unplaced | null;
}

/** Every line holds. */
const met = (outcome: Outcome): boolean =>
  outcome.lines.every((line) => !unsettled(line.answer));

/**
 * Where an outcome stands on the first view, by what it needs: something
 * under it waits on him; a line is unsettled; or every line holds.
 */
export type Band = "waits" | "unsettled" | "met";

export const bandOf = (outcome: Outcome): Band => {
  if (outcome.asks.length > 0) {
    return "waits";
  }
  return met(outcome) ? "met" : "unsettled";
};
