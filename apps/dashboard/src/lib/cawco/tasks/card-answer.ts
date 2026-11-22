/**
 * What a task that repeats says on its card where a one-off task says what
 * its attempt does: its answer now as a word (Yes, Not yet, Not known;
 * Done), whether that needs the person, and whether a run goes now. Its
 * reader is the caller's (TaskBoard `answerOf`); a card given none is a
 * one-off task's.
 */
export interface CardAnswer {
  /** A run goes now: the live dot, and these words after the answer ("checking now"). */
  live: string | null;
  needsYou: boolean;
  /** One sentence of what its newest run found: the answer's tooltip. */
  sentence: string;
  word: string;
}
