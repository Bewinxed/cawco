import { Clock, Duration, Effect, Schedule } from "effect";

/**
 * A poll in one shape: look, and look again every so long, until the look
 * answers something other than "not yet" or a deadline passes, and say
 * which. It replaces a loop that looks and sleeps (`while (…) { if (await
 * look()) …; await Bun.sleep(ms) }`, a timer that calls its own function
 * again): the ratchet's `timed-loop` counts those.
 *
 * It is `Effect.repeat` on `Schedule.spaced(every)`: the first look runs at
 * once, and each wait starts when the look before it ended. The deadline is
 * plain elapsed time on Effect's `Clock`, counted from the first look's
 * start: a look is not a read of another process, so it takes no catch-up
 * for a held process (a read with a deadline is `@cawco/core/effect/bounded`).
 * The last wait is cut short to end at the deadline, and one last look runs
 * there. A look's failure ends the poll with it.
 */

/**
 * The one cadence anything is looked at, or said for someone who looks:
 * a poll that names no `every` looks this often.
 */
// @limit external: "0.1 second is about the limit for having the user feel that the system is reacting instantaneously" (Nielsen, https://www.nngroup.com/articles/response-times-3-important-limits/)
export const LOOK_MS = 100;

/** What a poll found: the answer, or that the deadline passed first. * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export type Looked<A, Last = A> =
  | {
      readonly kind: "found";
      /** The answer that was not "not yet". */
      readonly value: A;
    }
  | {
      readonly kind: "deadline";
      /** How long it looked, in milliseconds. */
      readonly after: number;
      /** What the last look answered. */
      readonly last: Last;
    };

interface Every {
  /** The deadline, in milliseconds from the first look; none looks until found. */
  readonly deadlineMs?: number;
  /** The wait between one look's end and the next look; {@link LOOK_MS} when left out. */
  readonly every?: Duration.Input;
}

interface LookUntil {
  /** Until `look` answers something other than `undefined`, its "not yet". */
  <A, E, R>(
    options: Every,
    look: Effect.Effect<A | undefined, E, R>
  ): Effect.Effect<Looked<A, undefined>, E, R>;
  /** Until `until` holds of what `look` answered. */
  <A, E, R>(
    options: Every & { readonly until: (answer: A) => boolean },
    look: Effect.Effect<A, E, R>
  ): Effect.Effect<Looked<A>, E, R>;
}

/** Runs `look` now and again every `every`, until it answers or `deadlineMs` passes ({@link Looked}). * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export const lookUntil: LookUntil = <A, E, R>(
  options: Every & { readonly until?: (answer: A) => boolean },
  look: Effect.Effect<A, E, R>
): Effect.Effect<Looked<A>, E, R> => {
  const found = options.until ?? ((answer: A) => answer !== undefined);
  const { deadlineMs } = options;
  return Effect.gen(function* () {
    const started = yield* Clock.currentTimeMillis;
    const left = (at: number) =>
      deadlineMs === undefined
        ? Number.POSITIVE_INFINITY
        : deadlineMs - (at - started);
    const spacing: Schedule.Schedule<number, A> = Schedule.spaced(
      options.every ?? LOOK_MS
    );
    const last = yield* look.pipe(
      Effect.repeat(
        spacing.pipe(
          Schedule.passthrough,
          Schedule.while(({ input, now }) => !found(input) && left(now) > 0),
          Schedule.modifyDelay(({ duration, now }) =>
            Effect.succeed(
              Duration.millis(Math.min(Duration.toMillis(duration), left(now)))
            )
          )
        )
      )
    );
    if (found(last)) {
      return { kind: "found", value: last } satisfies Looked<A>;
    }
    const ended = yield* Clock.currentTimeMillis;
    return {
      kind: "deadline",
      after: ended - started,
      last,
    } satisfies Looked<A>;
  });
};
