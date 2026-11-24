/**
 * The stage's own work inside a traced play, marked for the performance
 * read to leave out (core `MEASURE_MARKS.harness`, agent stage-measure.ts).
 *
 * A play's `canvas` query, the box a real press is aimed by and the call
 * that sends it run on the page's main thread between the trace's marks,
 * in the play's own tasks: a query walks every element of the drawing and
 * its layers and reads each match's words, 1.2–1.6 ms at four times slower
 * on LimitPickerChecks AccountsOpen. Resolving the queries before the
 * window opens is not exact: a play asks for what its own presses brought,
 * an option after the press that opened its list. So each stretch is
 * measured where it runs, and the read takes it out of the frames it
 * falls in.
 *
 * Measures are made only while a traced play runs, and let go after it:
 * a repeat that kept its entries would grow the page's memory the read
 * counts.
 */
import { MEASURE_MARKS } from "@cawco/core/stage-measure";

/** A traced play runs now: the stage's own work in it is marked. */
let marking = false;

/**
 * `work` run, and measured as the stage's own while a traced play runs.
 * The measure spans the wall time `work` takes on the main thread, so it
 * holds synchronous work alone: one that returns a promise is measured to
 * its return.
 */
export function harnessWork<T>(work: () => T): T {
  if (!marking) {
    return work();
  }
  const start = performance.now();
  try {
    return work();
  } finally {
    performance.measure(MEASURE_MARKS.harness, {
      start,
      end: performance.now(),
    });
  }
}

/** `run`, a traced play, with the stage's own work in it marked; its measures let go once it ends. */
export async function harnessMarked<T>(run: () => Promise<T>): Promise<T> {
  marking = true;
  try {
    return await run();
  } finally {
    marking = false;
    performance.clearMeasures(MEASURE_MARKS.harness);
  }
}
