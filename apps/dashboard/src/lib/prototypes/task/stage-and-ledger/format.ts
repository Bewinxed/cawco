/**
 * Times as the task says them: a clock time where several changes fall in
 * one hour, a day and a time further back, and an age for what is recent.
 * Each is read against the story's `now`, so a record shown as it stood on
 * an earlier day reads as it read then.
 */
import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";

const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});
const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/** `16:04`. */
export const clock = (at: number): string => CLOCK.format(at);

/** `26 Oct`. */
export const day = (at: number): string => DAY.format(at);

/** `today 16:04`, `yesterday 09:12`, or `26 Oct 16:04`. */
export function when(at: number, now: number): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  if (at >= start) {
    return `today ${clock(at)}`;
  }
  if (at >= start - DAY_MS) {
    return `yesterday ${clock(at)}`;
  }
  return `${day(at)} ${clock(at)}`;
}

/** `just now`, `12 min ago`, `3 h ago`, `9 days ago`. */
export function ago(at: number, now: number): string {
  const gone = Math.max(0, now - at);
  if (gone < MINUTE_MS) {
    return "just now";
  }
  if (gone < HOUR_MS) {
    return `${Math.floor(gone / MINUTE_MS)} min ago`;
  }
  if (gone < DAY_MS) {
    return `${Math.floor(gone / HOUR_MS)} h ago`;
  }
  const days = Math.floor(gone / DAY_MS);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** How long an attempt ran: `11 s`, `42 min`, `1 h 16 min`. */
export function took(from: number, to: number): string {
  const ran = Math.max(0, to - from);
  if (ran < MINUTE_MS) {
    return `${Math.round((ran * 60) / MINUTE_MS)} s`;
  }
  if (ran < HOUR_MS) {
    return `${Math.round(ran / MINUTE_MS)} min`;
  }
  const hours = Math.floor(ran / HOUR_MS);
  const minutes = Math.round((ran - hours * HOUR_MS) / MINUTE_MS);
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
