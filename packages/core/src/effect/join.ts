import { Cache, type Context, Effect, Equal, Hash, type Option } from "effect";

/**
 * Callers that share one run in flight, by key: the first caller starts it,
 * every caller while it runs gets the same outcome, and the key is free
 * again the moment it ends. A failed run is not kept: the next caller starts
 * again. It replaces a map of promises that shares one in flight
 * (`m.get(k) ?? start()`, the promise set, deleted in `finally`): the
 * ratchet's `promise-map`.
 *
 * Built on Effect's {@link Cache} with a time to live of zero for every
 * exit. `Cache.get` already shares concurrent lookups of one key ("Sharing
 * concurrent lookups" in `Cache.ts`), starts the lookup at once on the
 * caller's own turn (so the run begins before `run` returns, as a promise
 * started in place does), drops the entry when the run ends with a zero
 * time to live, and never keeps a run that was interrupted. A map of
 * `Deferred`s would write all of that again. A Cache's lookup is one
 * function given when it is made, and a join's start is each call's own: the
 * key the Cache holds is a {@link Joined}, the key with the start of the
 * call that missed, equal and hashed by the key alone, and the lookup runs
 * that start.
 *
 * A run lasts while anyone waits on it: when every caller waiting is
 * interrupted, the run is interrupted too (Cache's own rule), and the next
 * caller starts again. A caller at the promise edge is never interrupted,
 * so a run started there goes to its end as the promise it replaces did.
 *
 * Keys compare by Effect's `Equal`: strings and numbers as a `Map`'s do.
 * A value kept after the run ends is a {@link Cache} with a time to live,
 * not a join; one at a time per key is `@cawco/core/keyed-lock`.
 * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export interface Join<K, A, E = never> {
  /**
   * Whether a run is in flight on `key` now: true from the moment a
   * {@link Join.run} starts it, before that call returns, until it ends.
   * For a row that says it is being worked on while its run lasts.
   */
  readonly isRunning: (key: K) => boolean;
  /**
   * The run in flight on `key`, waited for without starting one: its value,
   * or none at once when no run is in flight. It fails as that run fails.
   * The wait counts as one of the run's callers: the run is interrupted only
   * when every caller waiting on it, this one included, is.
   */
  readonly peek: (key: K) => Effect.Effect<Option.Option<A>, E>;
  /** `start` as `key`'s run, or the run already in flight on `key`. */
  readonly run: <R>(
    key: K,
    start: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
  /**
   * The promise edge of {@link Join.run}: `start()` as `key`'s run, or the
   * run in flight, with `Effect.runPromise`. It settles with the very value
   * or error the run gave.
   */
  readonly runPromise: (key: K, start: () => Promise<A>) => Promise<A>;
}

/** A key with the start of the call that looked it up: equal, and hashed, by the key alone. */
class Joined<K, A, E> implements Equal.Equal {
  readonly key: K;
  readonly start: Effect.Effect<A, E>;

  constructor(key: K, start: Effect.Effect<A, E>) {
    this.key = key;
    this.start = start;
  }

  [Equal.symbol](that: Equal.Equal): boolean {
    return that instanceof Joined && Equal.equals(this.key, that.key);
  }

  [Hash.symbol](): number {
    return Hash.hash(this.key);
  }
}

/** A {@link Join}; it lives as long as whatever holds it. * @public The house Effect kit, ahead of its users: the wave-2 slices of the
 * backend's move to Effect import it.
 */
export const makeJoin = <K, A, E = never>(): Join<K, A, E> => {
  const runs = Effect.runSync(
    Cache.makeWith((joined: Joined<K, A, E>) => joined.start, {
      capacity: Number.POSITIVE_INFINITY,
      timeToLive: () => 0,
    })
  );
  const run = <R>(
    key: K,
    start: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    Effect.context<R>().pipe(
      Effect.flatMap((context: Context.Context<R>) =>
        Cache.get(runs, new Joined(key, Effect.provide(start, context)))
      )
    );
  /** `key` as the Cache holds it, to look up and never to start: its start is never run. */
  const lookOnly = (key: K): Joined<K, A, E> =>
    new Joined(key, Effect.die("a join's look started a run"));
  return {
    run,
    runPromise: (key, start) =>
      Effect.runPromise(run(key, Effect.promise(start))),
    isRunning: (key) => Effect.runSync(Cache.has(runs, lookOnly(key))),
    peek: (key) => Cache.getOption(runs, lookOnly(key)),
  };
};
