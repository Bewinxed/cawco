import { Effect, RcMap, Scope, Semaphore } from "effect";

/**
 * Work one at a time per key: each key holds a one-permit
 * {@link Semaphore}, made on the key's first use and let go once nothing
 * holds or waits for it ({@link RcMap}, its idle time zero). Work on a key
 * runs after every work asked for on it before, and before any asked for
 * after; work on other keys runs beside it. A key nothing holds is taken at
 * once, so work asked for on it begins before the ask returns.
 */
export interface KeyedLock<K> {
  /** Whether work holds `key`'s turn or waits for it. */
  readonly isBusy: (key: K) => boolean;
  /**
   * The promise edge of {@link KeyedLock.withLock}: `work` in `key`'s turn,
   * run with `Effect.runPromise`. It settles as `work` settles, with the
   * very value or error `work` gave.
   */
  readonly run: <A>(key: K, work: () => Promise<A>) => Promise<A>;
  /** `work` in `key`'s turn. */
  readonly withLock: <A, E, R>(
    key: K,
    work: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
}

/** A {@link KeyedLock}; it lives as long as whatever holds it. */
export const makeKeyedLock = <K = string>(): KeyedLock<K> => {
  const permits = Effect.runSync(
    RcMap.make({ lookup: (_key: K) => Semaphore.make(1) }).pipe(
      Scope.provide(Scope.makeUnsafe())
    )
  );
  const withLock = <A, E, R>(
    key: K,
    work: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    RcMap.get(permits, key).pipe(
      Effect.flatMap((permit) => permit.withPermit(work)),
      Effect.scoped
    );
  return {
    withLock,
    run: (key, work) =>
      Effect.runPromise(
        withLock(
          key,
          Effect.tryPromise({ try: () => work(), catch: (error) => error })
        )
      ),
    isBusy: (key) => Effect.runSync(RcMap.has(permits, key)),
  };
};
