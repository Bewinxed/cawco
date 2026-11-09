/**
 * A preview held while its conversation's tab is off screen (the pane's
 * `cawco:hold`, PreviewPane.svelte): the document's animation frames,
 * timers and idle callbacks wait, and its running animations pause, until
 * `cawco:release`. A preview runs on the dashboard's own thread wherever the
 * browser keeps a frame of the same site in its process (every WebKit, and
 * Chromium over plain http), so a page left running in a tab off screen
 * costs the tab in front; held, it keeps its document and costs nothing, and
 * the tab's return shows it as it was, with no reload.
 *
 * Installed by the entry (overlay.ts) as the overlay script runs, before
 * every script of the page's (core `injectOverlay`, head or no head), so
 * every callback the page asks for is one of these. Held, nothing is armed with
 * the browser: a timer due meanwhile runs on release, an interval starts
 * again, a frame's callback runs in the first frame after it. Cooperative:
 * a Worker, a socket's messages and a MessageChannel go on.
 */

/** One callback the document asked for: armed with the browser while not held. */
interface Waiting {
  arm: () => number;
  /** The browser's id while armed; null while held. */
  armed: number | null;
  disarm: (id: number) => void;
}

/**
 * The ids handed out, apart from the browser's own (which count up from 1):
 * an id this never gave, a clear passes to the browser.
 */
let nextId = 1_000_000_000;
let held = false;
const frames = new Map<number, Waiting>();
/** Timeouts and intervals: one id space, as the browser's clears share theirs. */
const timers = new Map<number, Waiting>();
const idles = new Map<number, Waiting>();
/** The animations the hold paused, played again on release. */
const paused = new Set<Animation>();

/** Whether this document is held now. */
export const isHeld = (): boolean => held;

function wait(map: Map<number, Waiting>, waiting: Waiting): number {
  nextId += 1;
  const id = nextId;
  map.set(id, waiting);
  if (!held) {
    waiting.armed = waiting.arm();
  }
  return id;
}

function drop(
  map: Map<number, Waiting>,
  id: number | undefined,
  browsers: (id: number) => void
): void {
  if (id === undefined) {
    return;
  }
  const waiting = map.get(id);
  if (!waiting) {
    browsers(id);
    return;
  }
  map.delete(id);
  if (waiting.armed !== null) {
    waiting.disarm(waiting.armed);
  }
}

/** Puts this window's frame, timer and idle callbacks through the hold. Once, before the page's own scripts. */
export function installHold(): void {
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  const later = window.setTimeout.bind(window);
  const clearLater = window.clearTimeout.bind(window);
  const every = window.setInterval.bind(window);
  const clearEvery = window.clearInterval.bind(window);

  window.requestAnimationFrame = (callback) => {
    const id = wait(frames, {
      armed: null,
      arm: () =>
        raf((time) => {
          frames.delete(id);
          callback(time);
        }),
      disarm: caf,
    });
    return id;
  };
  window.cancelAnimationFrame = (id) => drop(frames, id, caf);

  const timer =
    (repeat: boolean) =>
    (handler: TimerHandler, delay = 0, ...args: unknown[]): number => {
      if (typeof handler !== "function") {
        // A string of code: run by the browser as it was given.
        return repeat
          ? every(handler, delay, ...args)
          : later(handler, delay, ...args);
      }
      const ms = Math.max(0, Number(delay) || 0);
      const due = performance.now() + ms;
      const id = wait(timers, {
        armed: null,
        arm: repeat
          ? () => every(() => handler.apply(window, args), ms)
          : () =>
              later(
                () => {
                  timers.delete(id);
                  handler.apply(window, args);
                },
                Math.max(0, due - performance.now())
              ),
        disarm: repeat ? clearEvery : clearLater,
      });
      return id;
    };
  window.setTimeout = timer(false) as typeof window.setTimeout;
  window.setInterval = timer(true) as typeof window.setInterval;
  window.clearTimeout = (id) =>
    drop(timers, id as number | undefined, clearLater);
  window.clearInterval = (id) =>
    drop(timers, id as number | undefined, clearEvery);

  // WebKit ships no idle callbacks: nothing to hold there.
  if (typeof window.requestIdleCallback === "function") {
    const idle = window.requestIdleCallback.bind(window);
    const cancelIdle = window.cancelIdleCallback.bind(window);
    window.requestIdleCallback = (callback, options) => {
      const id = wait(idles, {
        armed: null,
        arm: () =>
          idle((deadline) => {
            idles.delete(id);
            callback(deadline);
          }, options),
        disarm: cancelIdle,
      });
      return id;
    };
    window.cancelIdleCallback = (id) => drop(idles, id, cancelIdle);
  }
}

/**
 * Holds this document (`on`) or lets it go: every armed callback disarmed
 * and every running animation paused, or each armed again and played.
 */
export function hold(on: boolean): void {
  if (on === held) {
    return;
  }
  held = on;
  const all = [frames, timers, idles].flatMap((map) => [...map.values()]);
  if (on) {
    for (const waiting of all) {
      if (waiting.armed !== null) {
        waiting.disarm(waiting.armed);
        waiting.armed = null;
      }
    }
    pauseAnimations();
    return;
  }
  for (const waiting of all) {
    waiting.armed ??= waiting.arm();
  }
  playAnimations();
}

function pauseAnimations(): void {
  for (const run of document.getAnimations()) {
    if (run.playState === "running") {
      run.pause();
      paused.add(run);
    }
  }
}

function playAnimations(): void {
  for (const run of paused) {
    // One the page cancelled or finished meanwhile is its own.
    if (run.playState === "paused") {
      run.play();
    }
  }
  paused.clear();
}
