/**
 * When a routine runs: its cron parsed in its zone ({@link cronOf}), its
 * runs ahead as the scheduler will start them ({@link nextRunsOf}), and the
 * slot a run took, as a label ({@link slotLabel}). routines.ts schedules by
 * these; the views and the words that show a routine read them too.
 */

import { DAY_MS } from "@cawco/core/time";
import { Cron, DateTime, Option, Result } from "effect";
import { ElysiaStatus, problem } from "elysia";

/**
 * A run an inbound event started (ingress.ts): its slot is `event:<event
 * id>`, so an event runs a routine once, and its retry reads the same event.
 */
export const EVENT_SLOT = "event:";

/** A run the inbox's mark started (memory.ts): slot `inbox:<time>`. */
export const INBOX_SLOT = "inbox:";

/** A schedule, parsed; refused with Effect's own words when it does not parse. */
const parsedCache = new Map<string, Cron.Cron>();
export const cronOf = (expression: string, timeZone: string) => {
  const key = `${expression}\0${timeZone}`;
  const cached = parsedCache.get(key);
  if (cached) {
    return cached;
  }
  if (Option.isNone(DateTime.zoneMakeNamed(timeZone))) {
    return problem(400, {
      code: "routine-time-zone-unknown",
      detail: `“${timeZone}” is not an IANA time zone; name one like Europe/London or America/New_York.`,
    });
  }
  const parsed = Cron.parse(expression, timeZone);
  if (Result.isFailure(parsed)) {
    return problem(400, {
      code: "routine-cron-unparsed",
      detail: `“${expression}” is not a cron schedule: ${parsed.failure.message}. Give five fields (minute hour day month weekday), or six with seconds first.`,
    });
  }
  parsedCache.set(key, parsed.success);
  return parsed.success;
};

/** How far ahead a routine's runs are told: a week, the dashboard's strip. */
const NEXT_RUNS_SPAN_MS = 7 * DAY_MS;
/**
 * At most this many: one day of a routine that runs every five minutes
 * (12 an hour × 24), so the strip draws a whole day of any schedule as
 * fine as that; a finer one (every minute) is told its next 288, the strip
 * spanning to the last of them. An hourly routine's week (168) is whole.
 */
const NEXT_RUNS_MAX = 288;

/**
 * A routine's runs ahead of `now`, as the scheduler will start them: Effect's
 * `Cron.sequence` on the same parsed cron and zone the hub runs it by
 * (`cronOf`), over the next week and at most `NEXT_RUNS_MAX`, epoch ms.
 */
export const nextRunsOf = (cron: string, timeZone: string, now: number) => {
  const parsed = cronOf(cron, timeZone);
  if (parsed instanceof ElysiaStatus) {
    return parsed;
  }
  const runs: number[] = [];
  for (const at of Cron.sequence(parsed, new Date(now))) {
    const time = at.getTime();
    if (time >= now + NEXT_RUNS_SPAN_MS || runs.length >= NEXT_RUNS_MAX) {
      break;
    }
    runs.push(time);
  }
  return runs;
};

/** `09:00`, a slot's time in the routine's zone; `test`, `by hand` for the others. */
export const slotLabel = (slot: string, timeZone: string): string => {
  if (slot.startsWith("test:")) {
    return "test";
  }
  if (slot.startsWith("now:")) {
    return "by-hand";
  }
  if (slot.startsWith(EVENT_SLOT)) {
    return "event";
  }
  if (slot.startsWith(INBOX_SLOT)) {
    return "inbox";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(slot));
};
