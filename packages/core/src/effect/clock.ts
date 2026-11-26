import { Clock, Duration, type Effect } from "effect";

/**
 * Effect's clock with its waits on `sleep`: the system's time as Effect's
 * own clock reads it, and every `Clock.sleep` (so `Effect.sleep`,
 * `Effect.delay`, `Effect.timeout` and each `Schedule` delay) one wait of
 * `sleep`, in milliseconds. The hub's lifetime (packages/hub/src/lifetime.ts)
 * and the agent's runtime (packages/agent/src/daemon-runtime.ts) each give
 * their fibers one, whose waits are timers they hold, unref and clear.
 */
export const clockSleepingOn = (
  sleep: (ms: number) => Effect.Effect<void>
): Clock.Clock => {
  const system = Clock.Clock.defaultValue();
  return {
    currentTimeMillisUnsafe: () => system.currentTimeMillisUnsafe(),
    currentTimeMillis: system.currentTimeMillis,
    currentTimeNanosUnsafe: () => system.currentTimeNanosUnsafe(),
    currentTimeNanos: system.currentTimeNanos,
    monotonicTimeNanosUnsafe: () => system.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: system.monotonicTimeNanos,
    sleep: (duration) => sleep(Duration.toMillis(duration)),
  };
};
