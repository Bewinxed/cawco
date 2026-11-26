import { Cause, Duration, Effect, Schedule } from "effect";
import { type BackoffPolicy, backoffStep } from "../backoff";

/**
 * A retry's failures so far: how many in a row, and how long since the
 * first. Each step of a {@link backoffSchedule} outputs it, and so does its
 * end.
 * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export interface BackoffTries {
  /** How long it has been failing, since the first failure in a row. */
  readonly failingMs: number;
  /** Failures in a row, the last one counted. */
  readonly tries: number;
}

/**
 * The house backoff (`@cawco/core/backoff`) as a {@link Schedule}, for
 * `Effect.retry` and `Effect.repeat`. It replaces a loop that holds a
 * `new Backoff(policy)`, calls `failed()` and sleeps the step's `ms`: the
 * ratchet's `backoff-loop` counts those, and its `timed-loop` the sleeps.
 *
 * Its nth delay is {@link backoffStep}'s wait for the nth failure in a row,
 * which is `backoffWait(policy, n)`: capped exponential, drawn between half
 * the step and the whole of it. `Schedule.exponential` with
 * `Schedule.jittered` is not this: `jittered` scales a delay by 0.8 to 1.2.
 * It ends where {@link backoffStep} says `gave-up` (`afterTries`, `afterMs`,
 * or never), counting time from the first failure as `Backoff.failed` does,
 * on Effect's `Clock`.
 *
 * Its state lives as long as one `Effect.retry` call: a retry that
 * succeeded and fails again later starts over at the first wait, as
 * `Backoff.succeeded` does.
 *
 * When it gives up, the caller can tell (tsk-399: two loops retried for ever
 * and nothing said a retry had stopped helping):
 * - `Effect.retry(work, backoffSchedule(policy))` fails with the last error;
 * - `Effect.retryOrElse(work, backoffSchedule(policy), (error, tries) => …)`
 *   gets the last error and {@link BackoffTries} at the give-up, to say how
 *   many tries and how long.
 *
 * A retry whose count is kept in a database row outlives the process and
 * keeps `backoffWait` on that row; a schedule's state dies with it.
 * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export const backoffSchedule = (
  policy: BackoffPolicy
): Schedule.Schedule<BackoffTries> =>
  Schedule.fromStepWithMetadata(
    Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
      const step = backoffStep(policy, meta.attempt, meta.start, meta.now);
      const tries: BackoffTries = {
        tries: step.tries,
        failingMs: meta.elapsed,
      };
      return step.kind === "gave-up"
        ? Cause.done(tries)
        : Effect.succeed<[BackoffTries, Duration.Duration]>([
            tries,
            Duration.millis(step.ms),
          ]);
    })
  );
