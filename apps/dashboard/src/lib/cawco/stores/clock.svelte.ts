/**
 * The clocks the stores read: the minute a cap or an age turns on, and the
 * second a deadline is read against while one is ahead.
 */
import { browser } from "$app/env";

/**
 * The minute, for what turns on a clock: a cap stops holding when its period
 * ends, with nothing said by the hub (project-caps.ts reads it the same way).
 */
export const minute = $state({ now: Date.now() });

/**
 * Turns {@link minute} every 30 s from now on. The app starts it once
 * (start.ts `startApp`); importing this module starts nothing, and until the
 * start, and on the server, the minute stays the module's load. Returns its
 * stop.
 */
export function startMinute(): () => void {
  minute.now = Date.now();
  const ticker = setInterval(() => {
    minute.now = Date.now();
  }, 30_000);
  return () => clearInterval(ticker);
}

/**
 * The second every deadline is read against ({@link ahead}). A status that
 * holds until a moment — a machine reconnecting until its hub stops reading
 * it so, the hub gone past its grace — is that moment and this clock, never
 * a flag a later event has to clear, so it ends on its own at the moment.
 * It ticks while a deadline asked about is still ahead, and stops on the
 * first tick past the last of them: every reader has its answer by then.
 */
const second = $state({ now: 0 });

let secondTicker: ReturnType<typeof setInterval> | undefined;

let lastDeadline = 0;

/** Whether `deadline` (epoch ms) is still ahead, read so its reader turns when it passes. */
export function ahead(deadline: number): boolean {
  // Read off the tick, so a reader is asked again on every one; the tick is
  // never later than the time itself.
  const now = Math.max(second.now, Date.now());
  if (!browser || deadline <= now) {
    return deadline > now;
  }
  lastDeadline = Math.max(lastDeadline, deadline);
  secondTicker ??= setInterval(() => {
    second.now = Date.now();
    if (second.now >= lastDeadline) {
      clearInterval(secondTicker);
      secondTicker = undefined;
    }
  }, 1000);
  return true;
}

/** The clock the stores read deadlines and caps against. */
export const clockStore = {
  /** The minute, for what reads a clock (ages, resets). */
  get now(): number {
    return minute.now;
  },
};
