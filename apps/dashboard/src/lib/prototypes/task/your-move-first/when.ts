/**
 * Times as the page says them, on the reader's clock: a clock time for
 * today, the day and the clock time before that, and an age for an ask
 * ("2 min ago"). `now` comes with the read, so a story draws the moment it
 * stands in.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";

const SECONDS_PER_MINUTE = 60;

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});

const sameDay = (a: number, b: number): boolean =>
  new Date(a).toDateString() === new Date(b).toDateString();

/** "08:46" today; "3 Nov 05:00" on another day. */
export function when(at: number, now: number): string {
  const clock = CLOCK.format(at);
  return sameDay(at, now) ? clock : `${DAY.format(at)} ${clock}`;
}

/** "40 s ago", "2 min ago", "3 h ago", "2 d ago". */
export function ago(at: number, now: number): string {
  const gap = Math.max(0, now - at);
  if (gap < MINUTE_MS) {
    return `${Math.round((gap / MINUTE_MS) * SECONDS_PER_MINUTE)} s ago`;
  }
  if (gap < HOUR_MS) {
    return `${Math.round(gap / MINUTE_MS)} min ago`;
  }
  if (gap < DAY_MS) {
    return `${Math.round(gap / HOUR_MS)} h ago`;
  }
  return `${Math.round(gap / DAY_MS)} d ago`;
}
