/**
 * The OpenCode harness's edges onto Effect: how its promise code calls an
 * Effect and an Effect calls its promise code, and the one join it keeps
 * that can say what is in flight.
 *
 * The harness's members stay promises while their callers are promise code
 * (the effect plan's rule 2); the waits, retries, joins and gates inside
 * them are Effect, run at that edge.
 */
import { makeJoin } from "@cawco/core/effect/join";
import { Cause, Effect, Exit } from "effect";

/**
 * A promise call as an Effect: it is handed the Effect's interruption as a
 * signal, and its rejection is the Effect's failure, the very error it gave.
 */
export const fromPromise = <A>(
  call: (signal: AbortSignal) => Promise<A>
): Effect.Effect<A, unknown> =>
  Effect.tryPromise({ try: call, catch: (error) => error });

/**
 * The promise edge of an Effect its caller can let go of with `signal`: it
 * settles as the Effect does, with its very value or error, and a `signal`
 * that aborts it rejects with the signal's reason, as the promise code it
 * replaced did when its read threw on the abort.
 */
export const runAbortable = async <A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal
): Promise<A> => {
  const exit = await Effect.runPromiseExit(
    effect,
    signal ? { signal } : undefined
  );
  if (Exit.isSuccess(exit)) {
    return exit.value;
  }
  if (signal?.aborted && Cause.hasInterruptsOnly(exit.cause)) {
    throw signal.reason;
  }
  throw Cause.squash(exit.cause);
};

/**
 * Callers sharing one run in flight, by key, as the kit's join
 * (`@cawco/core/effect/join`), and which keys have one: the harness says
 * what it is in the middle of (a restart's holds, the operations a release
 * waits on) by them. A key is held as a `Map` holds it, by identity: an
 * object key (a session) is its own, never one equal to it.
 */
export interface Flights<K, A> {
  /** Whether `key` has a run in flight. */
  readonly has: (key: K) => boolean;
  /** Every key with a run in flight, in the order they started. */
  readonly keys: () => K[];
  /** `start` as `key`'s run, or the run already in flight on `key`. */
  readonly run: (
    key: K,
    start: Effect.Effect<A, unknown>
  ) => Effect.Effect<A, unknown>;
  /**
   * The promise edge of {@link Flights.run}: `start()` as `key`'s run, or
   * the run in flight, with `Effect.runPromise`. The run starts before this
   * returns, and it settles with the very value or error the run gave.
   */
  readonly runPromise: (key: K, start: () => Promise<A>) => Promise<A>;
  /** How many keys have a run in flight. */
  readonly size: number;
}

/** A {@link Flights}; it lives as long as whatever holds it. */
export const makeFlights = <K, A>(): Flights<K, A> => {
  const join = makeJoin<number, A, unknown>();
  /** Each key in flight, by identity, with the number its run is joined on. */
  const flying = new Map<K, number>();
  let last = 0;
  const run = (
    key: K,
    start: Effect.Effect<A, unknown>
  ): Effect.Effect<A, unknown> =>
    Effect.suspend(() => {
      const held = flying.get(key);
      if (held !== undefined) {
        return join.run(held, start);
      }
      last += 1;
      const flight = last;
      flying.set(key, flight);
      return join.run(
        flight,
        start.pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (flying.get(key) === flight) {
                flying.delete(key);
              }
            })
          )
        )
      );
    });
  return {
    has: (key) => flying.has(key),
    keys: () => [...flying.keys()],
    get size() {
      return flying.size;
    },
    run,
    runPromise: (key, start) =>
      Effect.runPromise(
        run(
          key,
          fromPromise(() => start())
        )
      ),
  };
};
