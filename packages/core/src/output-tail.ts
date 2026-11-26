/**
 * How much of a failing process's output a caller keeps: its end, where the
 * error is. One bound for every process CawCo runs, so a reader finds the
 * same last words wherever a command, a harness or a helper failed.
 */

// @limit measured: the final error block of 1,168 failing commands in the fleet's transcripts ran to 5,627 characters at p99 and 10,007 at the longest (2026-07-25 to 2026-11-26)
export const OUTPUT_TAIL_KEPT = 11_000;

/** The last {@link OUTPUT_TAIL_KEPT} characters of `text`, or all of it when it is shorter. */
export const lastOutput = (text: string): string =>
  text.slice(Math.max(0, text.length - OUTPUT_TAIL_KEPT));

/** {@link lastOutput} with `…` first when it cut. */
export const outputTail = (text: string): string =>
  text.length > OUTPUT_TAIL_KEPT ? `…${lastOutput(text)}` : text;
