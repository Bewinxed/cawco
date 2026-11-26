import { type Context, Effect, Result, Schema } from "effect";
import {
  type Bounded,
  Gone as GoneThrown,
  readWhileHeard,
  readWhileMoving,
  readWithin,
} from "../bounded";

/**
 * A read with a deadline as an Effect, over `@cawco/core/bounded`. It
 * replaces, in Effect code, a read raced against a timer, an
 * `AbortSignal.timeout`, or a `readWithin` whose caller switches on `kind`
 * (lint/no-raw-deadline.grit refuses the hand-written shapes).
 *
 * The deadline is `bounded.ts`'s, the one place a deadline meets a read: one
 * timer, on its `performance.now()` clock, with its extra second for a
 * process that was held (`HELD_LATE_MS`, `CATCH_UP_MS`). The read Effect
 * runs inside it with the deadline's signal (`Effect.runPromise(read,
 * { signal })`), so the deadline interrupts it; interrupting the caller
 * aborts the read too. `Effect.timeout` is not this: it has no catch-up for
 * a held process.
 *
 * Three outcomes, as {@link Bounded}: the read's value, the read's own
 * failure, or {@link Unanswered} in the error channel, so no caller reads
 * "no answer in time" as "no" without handling it.
 */

/** No answer in time: the clock ran out ("timeout"), or the side asked ended first ("dead": the read failed with {@link Gone}). * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export class Unanswered extends Schema.TaggedError<Unanswered>()("Unanswered", {
  /** The milliseconds the read was given before it was let go. */
  after: Schema.Number,
  reason: Schema.Literals(["timeout", "dead"]),
}) {}

/** The failure a read gives when the side it asks ended before it answered (its connection closed, its process exited): the bounded read fails with {@link Unanswered} "dead" in its place. * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export class Gone extends Schema.TaggedError<Gone>()("Gone", {
  /** What ended. */
  what: Schema.String,
}) {}

/** A read as `bounded.ts` takes one: handed the deadline's signal. */
type PromiseRead<A, E> = (signal: AbortSignal) => Promise<Result.Result<A, E>>;

/**
 * `read` as a {@link PromiseRead}, run with `context`: its own failures
 * come back as values; {@link Gone} is thrown as `bounded.ts`'s `Gone`,
 * which it answers "dead"; a defect or an interrupt rejects as itself.
 */
const promiseRead =
  <A, E, R>(
    read: Effect.Effect<A, E | Gone, R>,
    context: Context.Context<R>
  ): PromiseRead<A, E> =>
  (signal) =>
    Effect.runPromiseWith(context)(Effect.result(read), { signal }).then(
      (result) => {
        if (Result.isSuccess(result)) {
          return Result.succeed(result.success);
        }
        const { failure } = result;
        if (failure instanceof Gone) {
          throw new GoneThrown(failure.what);
        }
        return Result.fail(failure);
      }
    );

/** The Effect of a `bounded.ts` read: `answered` is the read's own outcome, `unanswered` fails with {@link Unanswered}. */
const settle = <A, E, R>(
  bound: (
    context: Context.Context<R>,
    signal: AbortSignal
  ) => Promise<Bounded<Result.Result<A, E>>>
): Effect.Effect<A, E | Unanswered, R> =>
  Effect.context<R>().pipe(
    Effect.flatMap((context) =>
      Effect.promise((signal) => bound(context, signal))
    ),
    Effect.flatMap((bounded): Effect.Effect<A, E | Unanswered> =>
      bounded.kind === "answered"
        ? Effect.fromResult(bounded.value)
        : Effect.fail(
            new Unanswered({ after: bounded.after, reason: bounded.reason })
          )
    )
  );

/** `read` with `ms` to answer (`readWithin`). * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export const boundedRead = <A, E, R>(
  ms: number,
  read: Effect.Effect<A, E | Gone, R>
): Effect.Effect<A, E | Unanswered, R> =>
  settle<A, E, R>((context, signal) =>
    readWithin(ms, promiseRead(read, context), { signal })
  );

/**
 * `read` for as long as the side it asks keeps moving: let go once
 * `quietMs` pass with no move, counted from the read's start or from
 * `movedAt()` (a `Date.now()` time), whichever is later (`readWhileMoving`).
 * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export const boundedWhileMoving = <A, E, R>(
  quietMs: number,
  movedAt: () => number,
  read: Effect.Effect<A, E | Gone, R>
): Effect.Effect<A, E | Unanswered, R> =>
  settle<A, E, R>((context, signal) =>
    readWhileMoving(quietMs, movedAt, promiseRead(read, context), { signal })
  );

/**
 * `read` for as long as it is heard from: let go once `quietMs` of this
 * machine's awake time pass with no `heard`, counted from the read's start
 * or its last `heard` (`readWhileHeard`). `read` is handed `heard`, to run
 * as each of its steps begins.
 * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export const boundedWhileHeard = <A, E, R>(
  quietMs: number,
  read: (heard: Effect.Effect<void>) => Effect.Effect<A, E | Gone, R>
): Effect.Effect<A, E | Unanswered, R> =>
  settle<A, E, R>((context, signal) =>
    readWhileHeard(
      quietMs,
      (inner, heard) => promiseRead(read(Effect.sync(heard)), context)(inner),
      { signal }
    )
  );
