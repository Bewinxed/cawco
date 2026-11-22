/**
 * How a task repeats, as its fields set it (RepeatFields): never, on a
 * schedule (a choice of the routine form's, when.ts) or when something
 * happens; and, for one that repeats, what it states once it is true.
 */
import { DAY_MS, HOUR_MS } from "@cawco/core/time";
import { routinesWords } from "@cawco/core/words/routines";
import { whenOf } from "#lib/cawco/routines/schedule.js";
import type { When } from "#lib/cawco/routines/when.js";

export type RepeatKind = "never" | "schedule" | "event";

/** How a task repeats, as the form sends it. */
export interface RepeatDraft {
  /** What it states once it is true; empty: it keeps running. */
  doneWhen: string;
  /** The event that starts each run, on `event`. */
  event: string;
  kind: RepeatKind;
  /** The schedule read back in words, on `schedule`. */
  words: string;
}

/** Repeat's choices, in the order they are offered. */
export const REPEAT_KINDS: RepeatKind[] = ["never", "schedule", "event"];

export const REPEAT_WORDS: Record<RepeatKind, string> = {
  never: "Never",
  schedule: "On a schedule",
  event: "When something happens",
};

/** What starts a run, as the hub's event sources name them for a code project. */
export const EVENTS = [
  "When a pull request merges to main",
  "When a pull request is opened",
  "When an issue is opened",
  "When a CI run fails on main",
  "When a release is published",
] as const;

const PLURAL = /s$/u;
const CLOCK = /(\d{2}:\d{2})/u;
const HOURLY = /hour/iu;
const WEEKDAYS = /weekday/iu;
const DAILY = /every day/iu;

/** One day's name, for a weekly schedule: "Monday". */
export const dayName = (day: number) =>
  (routinesWords.dayNames[day] ?? "").replace(PLURAL, "");

/** A schedule in words, as it stands on the task. */
export function scheduleWords(when: When): string {
  switch (when.repeat) {
    case "hour":
      return "Every hour, on the hour";
    case "day":
      return `Every day at ${when.time}`;
    case "weekdays":
      return `Every weekday at ${when.time}`;
    case "week":
      return `Every ${dayName(when.day)} at ${when.time}`;
    case "custom":
      return when.custom;
  }
}

/** Its next run on the reader's clock, worked from the choice; null when none comes in a week. */
function nextRunOf(when: When, now: number = Date.now()): number | null {
  if (when.repeat === "hour") {
    return Math.ceil(now / HOUR_MS) * HOUR_MS;
  }
  const [hour = 0, minute = 0] = when.time.split(":").map(Number);
  for (let day = 0; day <= 7; day += 1) {
    const at = new Date(now + day * DAY_MS);
    at.setHours(hour, minute, 0, 0);
    const weekday = at.getDay();
    const runs =
      when.repeat === "day" ||
      (when.repeat === "weekdays" && weekday >= 1 && weekday <= 5) ||
      (when.repeat === "week" && weekday === when.day);
    if (runs && at.getTime() > now) {
      return at.getTime();
    }
  }
  return null;
}

/** The schedule read back: its words, and its next run. */
export function readBackOf(when: When): string {
  const next = nextRunOf(when);
  const words = scheduleWords(when);
  return next === null ? `${words}.` : `${words}. Next run: ${whenOf(next)}.`;
}

/** A schedule's words read back into the choice that writes them, for Edit; every weekday at 09:00 when they say none. */
export function whenOfWords(words: string): When {
  const time = CLOCK.exec(words)?.[1] ?? "09:00";
  const base: When = { custom: "", day: 1, repeat: "weekdays", time };
  if (HOURLY.test(words)) {
    return { ...base, repeat: "hour" };
  }
  if (WEEKDAYS.test(words)) {
    return base;
  }
  if (DAILY.test(words)) {
    return { ...base, repeat: "day" };
  }
  const day = routinesWords.dayNames.findIndex((name) =>
    words.includes(name.replace(PLURAL, ""))
  );
  return day >= 0 ? { ...base, repeat: "week", day } : base;
}
