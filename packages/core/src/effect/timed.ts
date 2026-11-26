import { Effect } from "effect";

/**
 * `work`'s outcome, with the ms from its start to its settling, however it
 * settles, handed to `took`: the duration a timeout bounds, for a recording
 * of its metric (`timedEffect(call(…), (ms) => recordLimitReading("<metric>", ms))`).
 * The Effect of `timed` (core limit-readings.ts).
 */
export const timedEffect = <A, E, R>(
  work: Effect.Effect<A, E, R>,
  took: (ms: number) => void
): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    const started = Date.now();
    return Effect.ensuring(
      work,
      Effect.sync(() => {
        took(Date.now() - started);
      })
    );
  });
