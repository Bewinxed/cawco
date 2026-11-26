/**
 * THE AGENT'S ONE EDGE ONTO EFFECT. Every effect the agent's code runs from
 * outside an effect runs here: {@link runPromise}, {@link runPromiseExit},
 * {@link runFork}, {@link runSync} and {@link runSyncExit} are Effect's
 * own, run with the agent's context; promise code's work let go is
 * {@link letGo}, a run later {@link later}, and a periodic run
 * {@link every}. Effect code forks in a scope it holds
 * (`Effect.forkScoped`). A bare `Effect.run*` anywhere else in
 * packages/agent/src is held at zero by the effect ratchet
 * (scripts/effect-ratchet.ts, `bare-run`).
 *
 * The context gives every fiber two things:
 *
 * - **The clock.** Its every wait (`Effect.sleep`, `Effect.delay`,
 *   `Effect.timeout`, each `Schedule` delay of `Effect.repeat` and
 *   `Effect.retry`) is one timer held here. In the daemon (daemon.ts
 *   `startDaemon`, through {@link DaemonRuntimeLayer}) each is unref'd, as
 *   the hub lifetime's are (packages/hub/src/lifetime.ts): the daemon is
 *   kept alive by its sockets and its gateway's listener, never by a fiber
 *   that sleeps. Every other process that runs the agent's code (a CLI
 *   command, a stage's host, a boundary's host) keeps Effect's own rule, a
 *   timer that holds the process until it fires: a one-shot command waits
 *   for its own sleeps.
 * - **The logger.** `Effect.log*` writes the house line, the line
 *   `console.*` writes: its words as given, each naming its own area
 *   (`[browser] …`; one that names none is the agent's, `[agent] …`), on
 *   `console.info`, `console.warn` or `console.error` by its level, its
 *   cause after them. The console is redacted (redaction.ts
 *   `redactConsole`), so a logged line is too.
 *
 * When the daemon's scope closes, its releases run first; then the agent's
 * scope closes, interrupting every fiber {@link letGo}, {@link later} and
 * {@link every} let go; last, every timer still held is cleared, so no
 * sleep fires into what follows (the process exits next). A wait begun
 * after that never ends.
 */
import { failureOf } from "@cawco/core/detach";
import { clockSleepingOn } from "@cawco/core/effect/clock";
import {
  Cause,
  Clock,
  Context,
  Effect,
  Exit,
  type Fiber,
  Layer,
  Logger,
  Schedule,
  Scope,
} from "effect";
import { asThrown, type Rejected } from "./rejected";

/** The longest wait one timer holds (setTimeout's limit); a longer one is waited in parts. */
const LONGEST_TIMER_MS = 2 ** 31 - 1;

/** Every timer the clock holds now: one per fiber asleep. */
const timers = new Set<ReturnType<typeof setTimeout>>();
/** Whether the clock's timers hold the process (set by the daemon: they do not). */
let holdsProcess = true;
/** Whether the daemon's scope has closed: a wait begun after it never ends. */
let closed = false;

/**
 * A wait on one timer of the clock: unref'd in the daemon, cleared when the
 * fiber waiting is interrupted, and never ended once the daemon's scope has
 * closed.
 */
const sleepFor = (ms: number): Effect.Effect<void> => {
  if (ms <= 0) {
    return Effect.yieldNow;
  }
  if (!Number.isFinite(ms) || closed) {
    return Effect.never;
  }
  return Effect.callback<void>((resume) => {
    const timer = setTimeout(
      () => {
        timers.delete(timer);
        resume(
          ms > LONGEST_TIMER_MS ? sleepFor(ms - LONGEST_TIMER_MS) : Effect.void
        );
      },
      Math.min(ms, LONGEST_TIMER_MS)
    );
    if (!holdsProcess) {
      timer.unref();
    }
    timers.add(timer);
    return Effect.sync(() => {
      clearTimeout(timer);
      timers.delete(timer);
    });
  });
};

/** The agent's clock: the system's time, and its waits on {@link sleepFor}. */
const clock = clockSleepingOn(sleepFor);

/** The area a line that names none is said under: the agent's own. */
const UNNAMED = "[agent]";

/**
 * The house line: the words as given (a line whose words name no area,
 * `[area] …`, is said as the agent's, {@link UNNAMED}), on the console's method for the
 * level, the cause after them (its pretty form: each failure with its
 * stack). Trace and debug lines go to `console.debug`; the minimum level
 * (Info) leaves them out, as Effect's own logger does.
 */
const houseLogger = Logger.make<unknown, void>(
  ({ cause, logLevel, message }) => {
    const words: unknown[] = Array.isArray(message) ? [...message] : [message];
    const [first] = words;
    if (typeof first === "string" && !first.startsWith("[")) {
      words[0] = `${UNNAMED} ${first}`;
    }
    if (cause.reasons.length > 0) {
      words.push(Cause.pretty(cause));
    }
    switch (logLevel) {
      case "Fatal":
      case "Error":
        console.error(...words);
        return;
      case "Warn":
        console.warn(...words);
        return;
      case "Debug":
      case "Trace":
        console.debug(...words);
        return;
      case "Info":
      case "All":
      case "None":
        console.info(...words);
        return;
    }
  }
);

/** What every fiber the agent runs is given: its clock and its logger. */
const context = Context.make(Clock.Clock, clock).pipe(
  Context.add(Logger.CurrentLoggers, new Set([houseLogger]))
);

/**
 * The agent's scope: what {@link letGo}, {@link later} and
 * {@link every} let go runs in it. Only the daemon's close closes it; in a
 * process that is no daemon, the process's exit ends what it holds.
 */
const agentScope = Scope.makeUnsafe();

/** Effect's `runPromiseExit`, with the agent's clock and logger. */
export const runPromiseExit: <A, E>(
  effect: Effect.Effect<A, E>,
  options?: Effect.RunOptions
) => Promise<Exit.Exit<A, E>> = Effect.runPromiseExitWith(context);

/**
 * What a failed run gives a promise caller: the cause squashed as Effect's
 * `runPromise` squashes it, and a promise's rejection that Effect code
 * carried as a {@link Rejected} given back as the very error it was
 * (rejected.ts).
 */
export const thrownOf = (cause: Cause.Cause<unknown>): unknown =>
  asThrown(Cause.squash(cause));

/**
 * Effect's `runPromise`, with the agent's clock and logger: it settles with
 * the very value, or rejects with {@link thrownOf} the failure.
 */
export const runPromise = <A, E>(
  effect: Effect.Effect<A, E>,
  options?: Effect.RunOptions
): Promise<A> =>
  runPromiseExit(effect, options).then((exit) => {
    if (Exit.isFailure(exit)) {
      throw thrownOf(exit.cause);
    }
    return exit.value;
  });

/**
 * Effect's `runFork`, with the agent's clock and logger: a fiber its caller
 * holds and ends. Work nobody holds is {@link letGo}.
 */
export const runFork: <A, E>(
  effect: Effect.Effect<A, E>,
  options?: Effect.RunOptions
) => Fiber.Fiber<A, E> = Effect.runForkWith(context);

/** Effect's `runSync`, with the agent's clock and logger. */
export const runSync: <A, E>(effect: Effect.Effect<A, E>) => A =
  Effect.runSyncWith(context);

/** Effect's `runSyncExit`, with the agent's clock and logger. */
export const runSyncExit: <A, E>(
  effect: Effect.Effect<A, E>
) => Exit.Exit<A, E> = Effect.runSyncExitWith(context);

/**
 * `effect`, its failure said in one line instead of failing: `failed`'s
 * words for what it failed with (a {@link Rejected}'s own error), else the
 * house line for work nobody awaits, `[name] failed: …` (core detach.ts).
 * An interruption is no failure and says nothing.
 */
const sayingFailure = <A, E, R>(
  name: string,
  effect: Effect.Effect<A, E, R>,
  failed?: (error: unknown) => string
): Effect.Effect<A | undefined, never, R> =>
  effect.pipe(
    Effect.catchCause((cause) => {
      if (Cause.hasInterruptsOnly(cause)) {
        return Effect.interrupt;
      }
      const error = thrownOf(cause);
      return Effect.logWarning(
        failed ? failed(error) : `[${name}] failed: ${failureOf(error)}`
      ).pipe(Effect.as(undefined));
    })
  );

/**
 * Promise code's work let go: `effect` started now on a fiber in the
 * agent's scope, awaited by no one, its failure said in one line with
 * `name`. The daemon's close interrupts it.
 */
export const letGo = <A, E>(
  name: string,
  effect: Effect.Effect<A, E>
): Fiber.Fiber<A | undefined> =>
  runSync(Effect.forkIn(sayingFailure(name, effect), agentScope));

/**
 * `work` run every `ms` until the answer is called: the first run `ms` from
 * now, as a `setInterval`'s is, each wait counted from the end of the run
 * before, so a run that takes longer than `ms` delays the next instead of
 * stacking one behind it. A run's failure is said in one line, in
 * `failed`'s words when given (see {@link sayingFailure}), and the next run
 * comes as ever. The answer interrupts the fiber: no run after it, and one
 * under way is interrupted where it waits. In the agent's scope, so the
 * daemon's close ends it too.
 */
export const every = (
  name: string,
  ms: number,
  work: Effect.Effect<unknown, unknown>,
  failed?: (error: unknown) => string
): (() => void) => {
  const fiber = letGo(
    name,
    Effect.repeat(sayingFailure(name, work, failed), Schedule.spaced(ms)).pipe(
      Effect.delay(ms)
    )
  );
  return () => {
    fiber.interruptUnsafe();
  };
};

/**
 * `work` run once, `ms` from now, unless the answer is called first: a
 * timer's run as a fiber on the agent's clock, in the agent's scope. Its
 * failure is said in one line with `name`. Called after the run began, the
 * answer interrupts it where it waits.
 */
export const later = (
  name: string,
  ms: number,
  work: Effect.Effect<unknown, unknown>
): (() => void) => {
  const fiber = letGo(name, Effect.delay(work, ms));
  return () => {
    fiber.interruptUnsafe();
  };
};

/**
 * The daemon's hold on the runtime, built first in its scope (daemon.ts
 * `startDaemon`) so that it is released last: from its build the clock's
 * timers no longer hold the process; at its release, after every other
 * release has run (their own waits included), the agent's scope closes and
 * every timer still held is cleared.
 */
export const DaemonRuntimeLayer = Layer.effectDiscard(
  Effect.acquireRelease(
    Effect.sync(() => {
      holdsProcess = false;
      for (const timer of timers) {
        timer.unref();
      }
    }),
    () =>
      Scope.close(agentScope, Exit.void).pipe(
        Effect.andThen(
          Effect.sync(() => {
            closed = true;
            for (const timer of timers) {
              clearTimeout(timer);
            }
            timers.clear();
          })
        )
      )
  )
);
