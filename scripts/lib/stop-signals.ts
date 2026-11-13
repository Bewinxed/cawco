/**
 * The stop signals a script run ends on, and which of their listeners end
 * the process themselves.
 *
 * A tied child's run (lib/tied-child.ts) marks its stop listeners as ending
 * the process themselves, so a library's listener (Playwright's, say) is not
 * taken for one that does.
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
