/**
 * The stop signals a script run ends on, and which of their listeners end
 * the process themselves.
 *
 * scratch-fleet.ts ends the process on a stop signal once its fleets'
 * browsers and folders are gone, unless a listener of the probe's own ends
 * it its own way after work of its own (browser-relay's containers, a tied
 * child's run: lib/tied-child.ts). Counting the signal's listeners could not
 * tell those apart from a library's: Playwright listens for SIGTERM and
 * SIGHUP while a browser it launched runs (`sigtermHandler() {
 * gracefullyCloseAll(); }`, playwright-core 1.64.1 processLauncher), only
 * closing its browsers, so a run signalled mid-spec went on with closed
 * browsers instead of ending. A listener that ends the process says so here.
 *
 * Imports nothing, so lib/deps.ts loads it in a checkout with no
 * dependencies.
 */

/** Each stop signal, by name, with its number for a shell-style exit (128 + it). */
export const END_SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;
export type EndSignal = keyof typeof END_SIGNALS;

const ENDERS = new WeakSet<object>();

/** Marks `listener` as one that ends the process itself once its own work is done; returns it. */
export const endsTheProcess = <T extends () => void>(listener: T): T => {
  ENDERS.add(listener);
  return listener;
};

/** Whether a listener for `signal` now ends the process itself ({@link endsTheProcess}). */
export const anotherEnds = (signal: EndSignal): boolean =>
  process.listeners(signal).some((listener) => ENDERS.has(listener));
