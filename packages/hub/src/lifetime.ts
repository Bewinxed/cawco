import { doing } from "@cawco/core/loop-watch";
import { Context, Effect, Layer } from "effect";
import { makeScheduler, type SchedulerShape } from "./scheduler";

/** A timer a hub's lifetime holds; stop it with {@link HubLifetimeShape.cancel}. */
export type HubTimer = ReturnType<typeof setTimeout>;

/**
 * THE ONE SHUTDOWN PATH. Everything a hub schedules for itself runs on its
 * lifetime: every `setTimeout` and `setInterval` in packages/hub/src is one of
 * {@link HubLifetimeShape.after}, {@link HubLifetimeShape.every} and
 * {@link HubLifetimeShape.sleep}, and every `queueMicrotask` is {@link soon}.
 * A step that gives the loop back between its pieces awaits {@link nextTurn}.
 * A bare timer anywhere else in the hub's control loop is a lint error
 * (scripts/lint/hub-timers-named.grit).
 * A read with a deadline waits on `readWithin` (@cawco/core/bounded) instead,
 * handed {@link HubLifetimeShape.signal} when the hub holds the wait.
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
 *
 * Every timer is named where it is made, and each run names itself as the
 * loop's work (core loop-watch.ts `doing`, as `timer: <name>`), so a hold
 * inside a timer's run names that timer, never the request that came
 * before it, and the hub's minute line counts its time under that name.
 *
 * Work the hub works out again after something moved is wanted through
 * {@link HubLifetimeShape.jobs} (scheduler.ts): merged by its key, run by
 * priority on turns with a budget, background paused while the loop is
 * late.
 *
 * A run that throws fails that run alone: its error goes to the log with its
 * stack ({@link timerFailed}), and the hub, and every other timer, go on (an
 * `every` keeps its schedule). A timer has no caller to hand the error to,
 * and the runtime ends the process on a throw no one catches: one publish
 * that met a bad row took the whole fleet's hub down that way.
 */
export interface HubLifetimeShape {
  /**
   * Runs `run` once after `ms`, unless it is cancelled or the lifetime
   * closes first; `name` is what its run is known by when it holds the loop.
   */
  readonly after: (name: string, ms: number, run: () => void) => HubTimer;
  /** Stops one of this lifetime's timers; none, or one that already ran, is nothing. */
  readonly cancel: (timer: HubTimer | undefined) => void;
  /** Stops every timer, runs every release, and says so; once. */
  readonly close: () => void;
  /** Whether {@link close} has run. */
  readonly closed: () => boolean;
  /**
   * Runs `run` every `ms` until it is cancelled or the lifetime closes;
   * `name` is what each run is known by when it holds the loop.
   */
  readonly every: (name: string, ms: number, run: () => void) => HubTimer;
  /** The hub's admission (scheduler.ts): recompute work, merged by key and run by priority. */
  readonly jobs: SchedulerShape;
  /** A release for {@link close}: run after every timer has stopped, newest first. */
  readonly onClose: (release: () => void) => void;
  /**
   * Aborts when {@link close} runs, with the timers. A wait the hub holds on
   * `readWithin` (@cawco/core/bounded) passes it as its `signal`, so a read
   * still unanswered at close is let go and nothing it would decide runs.
   */
  readonly signal: AbortSignal;
  /**
   * Resolves after `ms`; never when the lifetime closes first, so whatever
   * awaits it goes no further.
   */
  readonly sleep: (ms: number) => Promise<void>;
}

/** A timer's run threw: said in one line with its stack, the hub's own words before it. */
const timerFailed = (error: unknown): void => {
  console.error(
    `[hub] a scheduled run failed, and only that run: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`
  );
};

/** `run`, its throw said rather than left to end the process. */
const guarded = (run: () => void) => (): void => {
  try {
    run();
  } catch (error) {
    timerFailed(error);
  }
};

/** `run`, named as the loop's work as it starts (core loop-watch.ts `doing`). */
const named = (name: string, run: () => void) => {
  const work = `timer: ${name}`;
  return (): void => {
    doing(work);
    run();
  };
};

/**
 * Resolves on the loop's next turn, after the sockets and timers waiting
 * have run: the hub's one way for a long step to give the loop back
 * between its pieces (a register's restore batches, a chunk of rows).
 */
export const nextTurn = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

/**
 * Runs `run` once the current step ends (a microtask), its throw said as a
 * timer's is: the hub's one way to defer work to the end of a step.
 */
export const soon = (run: () => void): void => {
  queueMicrotask(guarded(run));
};

const makeLifetime = (): HubLifetimeShape => {
  const timers = new Set<HubTimer>();
  const releases: (() => void)[] = [];
  const closing = new AbortController();
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
  const once = (ms: number, run: () => void): HubTimer => {
    const guardedRun = guarded(run);
    const timer = setTimeout(() => {
      timers.delete(timer);
      guardedRun();
    }, ms);
    return hold(timer);
  };
  const after = (name: string, ms: number, run: () => void): HubTimer =>
    once(ms, named(name, run));
  const every = (name: string, ms: number, run: () => void): HubTimer =>
    hold(setInterval(guarded(named(name, run)), ms));
  return {
    after,
    every,
    jobs: makeScheduler({ after, every }),
    cancel: (timer) => {
      if (timer) {
        clearTimeout(timer);
        timers.delete(timer);
      }
    },
    // Unnamed: its run only resolves, and what awaits it runs after.
    sleep: (ms) =>
      new Promise((resolve) => {
        once(ms, resolve);
      }),
    onClose: (release) => {
      releases.push(release);
    },
    closed: () => closed,
    signal: closing.signal,
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      for (const timer of timers) {
        clearTimeout(timer);
      }
      timers.clear();
      closing.abort(new DOMException("the hub closed", "AbortError"));
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
