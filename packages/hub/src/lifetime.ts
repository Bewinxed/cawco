import { Context, Effect, Layer } from "effect";

/** A timer a hub's lifetime holds; stop it with {@link HubLifetimeShape.cancel}. */
export type HubTimer = ReturnType<typeof setTimeout>;

/**
 * THE ONE SHUTDOWN PATH. Everything a hub schedules for itself runs on its
 * lifetime: every `setTimeout` and `setInterval` in packages/hub/src is one of
 * {@link HubLifetimeShape.after}, {@link HubLifetimeShape.every} and
 * {@link HubLifetimeShape.sleep}, but for two that are not the hub's own
 * schedule, each named where it stands (json-response's yield inside one
 * response body; jev's backoff inside one request, bounded by its deadline).
 * What holds a resource gives its release to {@link HubLifetimeShape.onClose}.
 *
 * {@link HubLifetimeShape.close} stops every timer, so none can fire into
 * what follows; then runs the releases newest first, so the database,
 * registered as it opens before anything else, closes last; then says
 * `[hub] closed`. Nothing the hub scheduled runs after it.
 *
 * Whoever builds a hub inside a process that goes on without it closes it
 * (scripts/openapi.ts, the role budgets). The service hub is never closed
 * from JavaScript: SIGTERM stays the kernel's (packages/cli/src/cli.ts), so
 * a hub whose event loop is busy still dies at once, and no JavaScript runs
 * after the signal.
 *
 * Every timer is unref'd: a hub is kept alive by its listening socket, never
 * by something it scheduled.
 */
export interface HubLifetimeShape {
  /** Runs `run` once after `ms`, unless it is cancelled or the lifetime closes first. */
  readonly after: (ms: number, run: () => void) => HubTimer;
  /** Stops one of this lifetime's timers; none, or one that already ran, is nothing. */
  readonly cancel: (timer: HubTimer | undefined) => void;
  /** Stops every timer, runs every release, and says so; once. */
  readonly close: () => void;
  /** Whether {@link close} has run. */
  readonly closed: () => boolean;
  /** Runs `run` every `ms` until it is cancelled or the lifetime closes. */
  readonly every: (ms: number, run: () => void) => HubTimer;
  /** A release for {@link close}: run after every timer has stopped, newest first. */
  readonly onClose: (release: () => void) => void;
  /**
   * Resolves after `ms`; never when the lifetime closes first, so whatever
   * awaits it goes no further.
   */
  readonly sleep: (ms: number) => Promise<void>;
}

export const makeLifetime = (): HubLifetimeShape => {
  const timers = new Set<HubTimer>();
  const releases: (() => void)[] = [];
  let closed = false;
  /** Holds a timer just made; one made after close is stopped at once. */
  const hold = (timer: HubTimer): HubTimer => {
    timer.unref?.();
    if (closed) {
      clearTimeout(timer);
    } else {
      timers.add(timer);
    }
    return timer;
  };
  const after = (ms: number, run: () => void): HubTimer => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      run();
    }, ms);
    return hold(timer);
  };
  return {
    after,
    every: (ms, run) => hold(setInterval(run, ms)),
    cancel: (timer) => {
      if (timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
    },
    sleep: (ms) =>
      new Promise((resolve) => {
        after(ms, resolve);
      }),
    onClose: (release) => {
      releases.push(release);
    },
    closed: () => closed,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      for (const release of releases.toReversed()) {
        try {
          release();
        } catch (error) {
          console.error("[hub] a release at close failed:", error);
        }
      }
      console.log("[hub] closed");
    },
  };
};

export class HubLifetime extends Context.Service<
  HubLifetime,
  HubLifetimeShape
>()("HubLifetime") {}

export const HubLifetimeLayer = Layer.effect(HubLifetime)(
  Effect.sync(makeLifetime)
);
