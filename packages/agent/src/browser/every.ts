/**
 * Periodic work of the browser hosting whose run is awaited work, as an
 * Effect fiber: `Effect.repeat` on `Schedule.spaced`, forked with
 * `Effect.runFork` (no scope owns these yet: the daemon holds each one's
 * stop), and interrupted where the timer was cleared.
 */
import { Effect, Fiber, Schedule } from "effect";

/**
 * `work` run every `ms`, the first run `ms` from now as a `setInterval`'s
 * is, each wait counted from the end of the run before: a run that takes
 * longer than `ms` delays the next instead of stacking one behind it. A
 * run's failure is said with `failed` in the log, and the next run comes as
 * ever. Answers its stop: the fiber interrupted, no run after it, a run
 * under way let go to its end.
 */
export const runEvery = (
  ms: number,
  work: () => Promise<unknown>,
  failed: (error: unknown) => string
): (() => void) => {
  const run = Effect.tryPromise({ try: work, catch: (error) => error }).pipe(
    Effect.catch((error) => Effect.logWarning(failed(error)))
  );
  const fiber = Effect.runFork(
    Effect.gen(function* () {
      yield* Effect.sleep(ms);
      yield* Effect.repeat(run, Schedule.spaced(ms));
    })
  );
  return () => {
    Effect.runFork(Fiber.interrupt(fiber));
  };
};
