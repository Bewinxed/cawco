/**
 * When a routine runs, as the routine form asks it: a common schedule
 * (every hour; every day, every weekday or every week on a day, at a time)
 * or a custom one, each written as the five-value expression
 * `POST /api/routines` takes (`cron`). A schedule the form opens with is
 * read back into its choice, or stands as custom.
 */

export type Repeat = "hour" | "day" | "weekdays" | "week" | "custom";

export interface When {
  /** The custom schedule as typed: five values. */
  custom: string;
  /** The day of the week a weekly one runs: 0 Sunday … 6 Saturday. */
  day: number;
  repeat: Repeat;
  /** The time of day, `HH:MM`, for a daily, weekday or weekly one. */
  time: string;
}

/** The choices, in the order the form offers them. */
export const REPEATS: readonly Repeat[] = [
  "hour",
  "day",
  "weekdays",
  "week",
  "custom",
];

/** The days of the week, Monday first, as a schedule counts them. */
export const WEEK_DAYS: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** What the form opens with: every day at 09:00. */
export const FIRST_WHEN: When = {
  repeat: "day",
  time: "09:00",
  day: 1,
  custom: "",
};

const TIME = /^(\d{1,2}):(\d{2})$/;
const SPACES = /\s+/;
const NUMBER = /^\d+$/;

/** A time of day's hour and minute, or null while it isn't one. */
function hourMinute(time: string): [number, number] | null {
  const match = TIME.exec(time.trim());
  if (!match) {
    return null;
  }
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour < 24 && minute < 60 ? [hour, minute] : null;
}

/** Its five values; "" while a time it needs is unset. */
export function expressionOf(when: When): string {
  if (when.repeat === "custom") {
    return when.custom.trim().split(SPACES).join(" ");
  }
  if (when.repeat === "hour") {
    return "0 * * * *";
  }
  const at = hourMinute(when.time);
  if (!at) {
    return "";
  }
  const [hour, minute] = at;
  const days = { day: "*", weekdays: "1-5", week: String(when.day) }[
    when.repeat
  ];
  return `${minute} ${hour} * * ${days}`;
}

const two = (n: number) => String(n).padStart(2, "0");

/** A schedule read back into the choice that writes it; custom when none does. */
export function choiceOf(expression: string): When {
  const values = expression.trim().split(SPACES);
  const [minute = "", hour = "", dom, month, dow = ""] = values;
  const custom = {
    ...FIRST_WHEN,
    repeat: "custom" as const,
    custom: expression,
  };
  if (values.length !== 5 || dom !== "*" || month !== "*") {
    return custom;
  }
  if (minute === "0" && hour === "*" && dow === "*") {
    return { ...FIRST_WHEN, repeat: "hour" };
  }
  if (!(NUMBER.test(minute) && NUMBER.test(hour))) {
    return custom;
  }
  const time = `${two(Number(hour))}:${two(Number(minute))}`;
  if (!hourMinute(time)) {
    return custom;
  }
  if (dow === "*") {
    return { ...FIRST_WHEN, repeat: "day", time };
  }
  if (dow === "1-5") {
    return { ...FIRST_WHEN, repeat: "weekdays", time };
  }
  if (NUMBER.test(dow) && Number(dow) <= 7) {
    return { ...FIRST_WHEN, repeat: "week", time, day: Number(dow) % 7 };
  }
  return custom;
}
