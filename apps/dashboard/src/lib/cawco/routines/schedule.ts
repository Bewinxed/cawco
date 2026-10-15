/**
 * A routine's schedule and its runs' times, in words.
 *
 * - `scheduleOf`: its cron as a person says it ("Daily at 13:30", "Weekdays
 *   at 09:00", "Mondays at 10:00"), in its own zone, and that zone as a place
 *   name when it is not the reader's.
 * - `whenOf`: a time in the reader's zone, near now said near ("Today 09:00",
 *   "Yesterday 23:30", "Mon 09:00"), further off with its date.
 * - `exactOf`: the same time whole, for a hover ("Thu 15 Oct 2026, 13:30").
 */

const DAY_NAMES = [
  "Sundays",
  "Mondays",
  "Tuesdays",
  "Wednesdays",
  "Thursdays",
  "Fridays",
  "Saturdays",
];

/** The reader's own zone. */
export const readerZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

/** An IANA zone's place, as a person names it: "America/New_York" → "New York". */
export const placeOf = (zone: string): string =>
  (zone.split("/").at(-1) ?? zone).replaceAll("_", " ");

const two = (n: number) => String(n).padStart(2, "0");
const SPACES = /\s+/;
const NUMBER = /^\d+$/;

/** The days a cron's day-of-week field names, as words; null when it names none we say. */
function daysOf(field: string): string | null {
  if (field === "*") {
    return "Daily";
  }
  if (field === "1-5") {
    return "Weekdays";
  }
  if (field === "0,6" || field === "6,0") {
    return "Weekends";
  }
  const days = field.split(",").map(Number);
  if (days.every((day) => Number.isInteger(day) && day >= 0 && day <= 7)) {
    const names = days.map((day) => DAY_NAMES[day % 7] ?? "");
    return names.length === 1
      ? (names[0] ?? null)
      : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  }
  return null;
}

export interface ScheduleWords {
  /** The words are the cron itself: set it as code. */
  raw: boolean;
  /** The schedule as said, or the cron itself when it says something we don't. */
  words: string;
  /** The zone's place when it is not the reader's own; null when it is. */
  zone: string | null;
}

/** A cron in its zone, as words. Five fields; a minute and an hour, any day of month and month. */
export function scheduleOf(cron: string, zone: string): ScheduleWords {
  const away = zone === readerZone() ? null : placeOf(zone);
  const [minute, hour, dom, month, dow, extra] = cron.trim().split(SPACES);
  const fixed = (field: string | undefined) =>
    field !== undefined && NUMBER.test(field);
  if (
    extra === undefined &&
    fixed(minute) &&
    fixed(hour) &&
    dom === "*" &&
    month === "*" &&
    dow !== undefined
  ) {
    const days = daysOf(dow);
    if (days) {
      return {
        words: `${days} at ${two(Number(hour))}:${two(Number(minute))}`,
        raw: false,
        zone: away,
      };
    }
  }
  if (
    extra === undefined &&
    fixed(minute) &&
    hour === "*" &&
    dom === "*" &&
    month === "*" &&
    dow === "*"
  ) {
    return {
      words: `Hourly at :${two(Number(minute))}`,
      raw: false,
      zone: away,
    };
  }
  return { words: cron, raw: true, zone: away };
}

/** The same time read on the reader's clock: "16:00 your time". */
export function readerTimeOf(at: number): string {
  return `${TIME.format(at)} your time`;
}

const TIME = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DATE = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
});
const EXACT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayOf = (at: number) => new Date(at).setHours(0, 0, 0, 0);

/** "Today 09:00", "Tomorrow 09:00", "Yesterday 23:30", "Mon 09:00", "3 Oct 09:00", in the reader's zone. */
export function whenOf(at: number): string {
  const days = Math.round((dayOf(at) - dayOf(Date.now())) / 86_400_000);
  const time = TIME.format(at);
  if (days === 0) {
    return `Today ${time}`;
  }
  if (days === 1) {
    return `Tomorrow ${time}`;
  }
  if (days === -1) {
    return `Yesterday ${time}`;
  }
  if (Math.abs(days) < 7) {
    return `${WEEKDAY.format(at)} ${time}`;
  }
  return `${DATE.format(at)} ${time}`;
}

/** A time whole, in the reader's zone, for a hover. */
export const exactOf = (at: number): string => EXACT.format(at);
