import { clockSleepingOn } from "@cawco/core/effect/clock";
import { doing } from "@cawco/core/loop-watch";
import {
  Cause,
  Clock,
  Context,
  Effect,
  Exit,
  type Fiber,
  Layer,
  Scope,
} from "effect";
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
 * what follows; then interrupts every fiber the lifetime runs; then runs
 * the releases newest first, so the database, registered as it opens
 * before anything else, closes last; then says `[hub] closed`. Nothing the
 * hub scheduled runs after it.
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
 * Effect runs on the lifetime through {@link HubLifetimeShape.run} (an
 * effect a caller awaits) and {@link HubLifetimeShape.fork} (named work let
 * go): its fibers sleep on the lifetime's clock, whose every wait is one of
 * these timers, so `Effect.sleep`, `Effect.delay`, `Effect.timeout` and
 * every `Schedule` delay of `Effect.repeat` and `Effect.retry` (each reaches
 * `Clock.sleep`) is unref'd, named and stopped at close like the rest. A
 * fork names itself as the loop's work (`fiber: <name>`) as it starts and
 * as it wakes from each such wait.
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
  /**
   * `layer`'s services, made at once from `given` with the lifetime's clock:
   * how the hub builds the services that are layers (hub-layer.ts), once.
   * The build is synchronous, so a layer whose making waits fails it. What
   * the layer acquired is released at {@link close}, with the other
   * releases, in the order they were given.
   */
  readonly build: <ROut, RIn>(
    layer: Layer.Layer<ROut, never, RIn>,
    given: Context.Context<RIn>
  ) => Context.Context<ROut>;
  /** Stops one of this lifetime's timers; none, or one that already ran, is nothing. */
  readonly cancel: (timer: HubTimer | undefined) => void;
  /** Stops every timer, interrupts every fiber, runs every release, and says so; once. */
  readonly close: () => void;
  /** Whether {@link close} has run. */
  readonly closed: () => boolean;
  /**
   * Runs `run` every `ms` until it is cancelled or the lifetime closes;
   * `name` is what each run is known by when it holds the loop.
   */
  readonly every: (name: string, ms: number, run: () => void) => HubTimer;
  /**
   * Named work let go: `effect` run on the lifetime's clock, at once, up to
   * its first wait, before `fork` returns. Its fiber is interrupted at
   * {@link close}; one forked after close runs nothing. A failure is said in
   * one line with `name` and the cause, and fails that fiber alone; an
   * interruption is no failure and says nothing. `name` is what its runs are
   * known by when they hold the loop (`fiber: <name>`), and what it forks
   * inherits it.
   */
  readonly fork: <A, E>(
    name: string,
    effect: Effect.Effect<A, E>
  ) => Fiber.Fiber<A, E>;
  /** The hub's admission (scheduler.ts): recompute work, merged by key and run by priority. */
  readonly jobs: SchedulerShape;
  /** A release for {@link close}: run after every timer and fiber has stopped, newest first. */
  readonly onClose: (release: () => void) => void;
  /**
   * The promise edge of an effect: `effect` run on the lifetime's clock, at
   * once, up to its first wait, before `run` returns. The promise settles
   * as the effect does, with the very value, or rejected with the very
   * error it failed with (`Cause.squash`). Once {@link close} has run, the
   * promise never settles, as {@link sleep}'s never resolves: close
   * interrupts the effect, and whatever awaits it goes no further (a
   * rejection would surface in a route or a timer as an error that today
   * sees nothing). A failure other than that interruption, met while close
   * unwinds it, is said as a fork's is.
   */
  readonly run: <A, E>(effect: Effect.Effect<A, E>) => Promise<A>;
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

/**
 * A fiber's failure, `who` naming it: said in one line with its cause, the
 * hub's own words before it, as {@link timerFailed} says a timer's.
 */
const fiberFailed = (who: string, cause: Cause.Cause<unknown>): void => {
  console.error(`[hub] ${who} failed, and only it: ${Cause.pretty(cause)}`);
};

/**
 * The name of the {@link HubLifetimeShape.fork} a fiber runs for, which the
 * lifetime's clock names the loop's work by as the fiber wakes; a fiber
 * inherits it from the one that forked it. A {@link HubLifetimeShape.run}'s
 * fiber has none: what awaits it names its own work.
 */
const FiberName = Context.Reference<string | undefined>(
  "@cawco/hub/lifetime/FiberName",
  { defaultValue: () => undefined }
);

/** The longest wait one timer holds (setTimeout's limit); a longer one is waited in parts. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

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

export const makeLifetime = (): HubLifetimeShape => {
  const timers = new Set<HubTimer>();
  /**
   * Every fiber run or forked on the lifetime and not yet ended. Held here,
   * not in a `Scope`: a scope closes its fibers one after another, each
   * awaited, and close is synchronous; here each is interrupted at once.
   */
  const fibers = new Set<Fiber.Fiber<unknown, unknown>>();
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
  const cancel = (timer: HubTimer | undefined): void => {
    if (timer) {
      clearTimeout(timer);
      timers.delete(timer);
    }
  };
  /**
   * A wait on one of the lifetime's timers: unref'd, stopped at close (and
   * then never resumed, as {@link HubLifetimeShape.sleep}), stopped when the
   * fiber waiting is interrupted. A forked fiber names itself as the loop's
   * work as it wakes.
   */
  const sleepFor = (ms: number): Effect.Effect<void> => {
    if (ms <= 0) {
      return Effect.yieldNow;
    }
    if (!Number.isFinite(ms)) {
      return Effect.never;
    }
    return Effect.withFiber((fiber) => {
      const name = fiber.getRef(FiberName);
      return Effect.callback<void>((resume) => {
        const timer = once(Math.min(ms, LONGEST_TIMER_MS), () => {
          if (name !== undefined) {
            doing(`fiber: ${name}`);
          }
          resume(
            ms > LONGEST_TIMER_MS
              ? sleepFor(ms - LONGEST_TIMER_MS)
              : Effect.void
          );
        });
        return Effect.sync(() => cancel(timer));
      });
    });
  };
  /** The lifetime's clock: the system's time, and its waits on {@link sleepFor}. */
  const clock = clockSleepingOn(sleepFor);
  /** What every fiber of the lifetime runs with: its clock. */
  const context = Context.make(Clock.Clock, clock);
  /**
   * `effect` on a fiber of the lifetime, run at once up to its first wait
   * (`Effect.runForkWith` evaluates synchronously) and held until it ends;
   * after close, a fiber that is interrupted before its first step.
   */
  const start = <A, E>(
    name: string | undefined,
    effect: Effect.Effect<A, E>
  ): Fiber.Fiber<A, E> => {
    if (closed) {
      return Effect.runForkWith(context)<A, E>(Effect.interrupt);
    }
    if (name !== undefined) {
      doing(`fiber: ${name}`);
    }
    const fiber = Effect.runForkWith(
      name === undefined ? context : Context.add(context, FiberName, name)
    )(effect);
    if (fiber.pollUnsafe() === undefined) {
      fibers.add(fiber);
      fiber.addObserver(() => {
        fibers.delete(fiber);
      });
    }
    return fiber;
  };
  return {
    after,
    build: (layer, given) => {
      const scope = Scope.makeUnsafe();
      releases.push(() => {
        const released = Scope.closeUnsafe(scope, Exit.void);
        if (released) {
          Effect.runForkWith(context)(released);
        }
      });
      return Effect.runSyncWith(Context.merge(given, context))(
        Layer.buildWithScope(layer, scope)
      );
    },
    every,
    jobs: makeScheduler({ after, every }),
    cancel,
    fork: (name, effect) => {
      const fiber = start(name, effect);
      fiber.addObserver((exit) => {
        if (exit._tag === "Failure" && !Cause.hasInterruptsOnly(exit.cause)) {
          fiberFailed(`the fiber ${name}`, exit.cause);
        }
      });
      return fiber;
    },
    run: (effect) =>
      new Promise((resolve, reject) => {
        start(undefined, effect).addObserver((exit) => {
          if (exit._tag === "Success") {
            if (!closed) {
              resolve(exit.value);
            }
          } else if (!closed) {
            reject(Cause.squash(exit.cause));
          } else if (!Cause.hasInterruptsOnly(exit.cause)) {
            fiberFailed("a run cut by close", exit.cause);
          }
        });
      }),
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
      // Each interruption unwinds its fiber's finalizers at once, up to the
      // first that waits, before any release below closes what they use.
      for (const fiber of [...fibers]) {
        fiber.interruptUnsafe();
      }
      fibers.clear();
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
