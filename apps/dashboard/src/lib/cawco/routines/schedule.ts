/**
 * A routine's schedule and its runs' times, in words.
 *
 * - `scheduleOf`: its cron as a person says it ("Daily at 13:30", "Weekdays
 *   at 09:00", "Mondays at 10:00") on the reader's clock, one clock with the
 *   Next run; its own zone's words ("Daily at 06:30 New York time") when
 *   that zone is not the reader's, for a hover.
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

/** The days a cron's day-of-week field names (0 Sunday … 6 Saturday); null when it names a form we don't read. */
function dayNumbersOf(field: string): Set<number> | null {
  if (field === "*") {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
  const days = new Set<number>();
  for (const part of field.split(",")) {
    const [from, to = from] = part.split("-");
    if (!(from && NUMBER.test(from) && NUMBER.test(to))) {
      return null;
    }
    for (let day = Number(from); day <= Number(to); day += 1) {
      if (day > 7) {
        return null;
      }
      days.add(day % 7);
    }
  }
  return days;
}

/** A set of days as words: "Daily", "Weekdays", "Weekends", "Mondays", "Mondays and Thursdays". */
function daysWords(days: Set<number>): string {
  const sorted = [...days].sort((a, b) => a - b);
  const key = sorted.join(",");
  if (sorted.length === 7) {
    return "Daily";
  }
  if (key === "1,2,3,4,5") {
    return "Weekdays";
  }
  if (key === "0,6") {
    return "Weekends";
  }
  const names = sorted.map((day) => DAY_NAMES[day] ?? "");
  return names.length === 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export interface ScheduleWords {
  /**
   * The schedule in the routine's own zone ("Daily at 06:30 New York time"),
   * for a hover; null when its zone is the reader's.
   */
  local: string | null;
  /** The words are the cron itself: set it as code. */
  raw: boolean;
  /**
   * The schedule on the reader's clock ("Daily at 13:30"), the clock the
   * Next run is read on; the cron itself when it says something we don't.
   */
  words: string;
}

/** The calendar day of `at` in `zone`, as a day count, to compare two zones' days. */
function dayIn(zone: string | undefined, at: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(at);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / 86_400_000;
}

/**
 * A cron in its zone, as words on the reader's clock. Five fields: a minute
 * and an hour on some days of the week, or a minute every hour. `next` is
 * its next run: the reader's time of day is read off it, and the days move
 * with it when the two zones' dates differ then (Weekdays 22:00 in New York
 * is Tuesdays to Saturdays 05:00 in Doha).
 */
export function scheduleOf(
  cron: string,
  zone: string,
  next: number
): ScheduleWords {
  const away = zone !== readerZone();
  const [minute, hour, dom, month, dow, extra] = cron.trim().split(SPACES);
  const fixed = (field: string | undefined) =>
    field !== undefined && NUMBER.test(field);
  const plain = extra === undefined && dom === "*" && month === "*";
  if (plain && fixed(minute) && fixed(hour) && dow !== undefined) {
    const days = dayNumbersOf(dow);
    if (days) {
      const shift = dayIn(undefined, next) - dayIn(zone, next);
      const readerDays = new Set([...days].map((day) => (day + shift + 7) % 7));
      return {
        words: `${daysWords(readerDays)} at ${TIME.format(next)}`,
        raw: false,
        local: away
          ? `${daysWords(days)} at ${two(Number(hour))}:${two(Number(minute))} ${placeOf(zone)} time`
          : null,
      };
    }
  }
  if (plain && fixed(minute) && hour === "*" && dow === "*") {
    // Every hour: the same minute on every clock but a half-hour zone's.
    const at = `:${two(new Date(next).getMinutes())}`;
    return {
      words: `Hourly at ${at}`,
      raw: false,
      local: away
        ? `Hourly at :${two(Number(minute))} ${placeOf(zone)} time`
        : null,
    };
  }
  return {
    words: cron,
    raw: true,
    local: away ? `${placeOf(zone)} time` : null,
  };
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
