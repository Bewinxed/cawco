/**
 * Clock time on the record: every entry at its clock time in the reader's
 * zone, and a day head where the day changes, read against the moment the
 * task was read (`now`), never the page's own clock.
 */
import { DAY_MS, MINUTE_MS } from "@cawco/core/time";
import { taskOneRecordWords as words } from "@cawco/core/words/task-one-record";
import type { Entry } from "./model";

const CLOCK = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const DAY = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});

/** `10:41`. */
export const clock = (at: number): string => CLOCK.format(at);

const startOfDay = (at: number): number => {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** The day head an entry stands under: Today, Yesterday, or `Tue 27 Oct`. */
const dayOf = (at: number, now: number): string => {
  const days = Math.round((startOfDay(now) - startOfDay(at)) / DAY_MS);
  if (days === 0) {
    return words.today;
  }
  if (days === 1) {
    return words.yesterday;
  }
  return DAY.format(at);
};

/** Minutes since `at`, as an ask says how long it has waited. */
export const minutesAgo = (at: number, now: number): number =>
  Math.max(0, Math.floor((now - at) / MINUTE_MS));

/** One run of the record under its day head. */
export interface Day {
  day: string;
  entries: Entry[];
}

/** The record's entries in order, run together by day. */
export const byDay = (entries: Entry[], now: number): Day[] => {
  const days: Day[] = [];
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    const day = dayOf(entry.at, now);
    const last = days.at(-1);
    if (last?.day === day) {
      last.entries.push(entry);
    } else {
      days.push({ day, entries: [entry] });
    }
  }
  return days;
};
