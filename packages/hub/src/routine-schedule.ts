/**
 * When a routine runs: its cron parsed in its zone ({@link cronOf}), its
 * runs ahead as the scheduler will start them ({@link nextRunsOf}), and the
 * slot a run took, as a label ({@link slotLabel}). routines.ts schedules by
 * these; the views and the words that show a routine read them too.
 */

import { DAY_MS } from "@cawco/core/time";
import { Cron, DateTime, Option, Result } from "effect";
import { ElysiaStatus, problem } from "elysia";
import type { TriggerIndex } from "./db/task-index";
import type { ParsedTask } from "./task-file";

/**
 * A run an inbound event started (event-routes.ts): its slot is `event:<event
 * id>`, so an event runs a routine once, and its retry reads the same event.
 */
export const EVENT_SLOT = "event:";

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
// @limit measured: one day of a routine that runs every five minutes, 12 an hour × 24 hours; the answer says when the runs told stop before the week's end
const NEXT_RUNS_MAX = 288;

/**
 * A routine's runs ahead of `now`, as the scheduler will start them: Effect's
 * `Cron.sequence` on the same parsed cron and zone the hub runs it by
 * (`cronOf`), over the next week and at most `NEXT_RUNS_MAX`, epoch ms; and
 * whether they were cut, that is, stop before the week's end.
 */
export const nextRunsOf = (cron: string, timeZone: string, now: number) => {
  const parsed = cronOf(cron, timeZone);
  if (parsed instanceof ElysiaStatus) {
    return parsed;
  }
  const runs: number[] = [];
  let cut = false;
  for (const at of Cron.sequence(parsed, new Date(now))) {
    const time = at.getTime();
    if (time >= now + NEXT_RUNS_SPAN_MS) {
      break;
    }
    if (runs.length >= NEXT_RUNS_MAX) {
      cut = true;
      break;
    }
    runs.push(time);
  }
  return { cut, runs };
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
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(slot));
};

/**
 * A routine's lines as the task index copies them to its trigger (db
 * task-index.ts `TriggerIndex`): its schedule parsed in its zone (its next
 * slot from `now`), and every line that does not read, or that its target
 * cannot run with, said as its problem, which holds its trigger. A file with
 * `on:` and no `target:` starts a delegate.
 */
export const triggerIndexOf = (
  parsed: Pick<ParsedTask, "fields" | "triggerUnread">,
  now: number = Date.now()
): TriggerIndex => {
  const { on, stop, deadline, dailyCapUsd, mode, keep, check, checkOn } =
    parsed.fields;
  const target = parsed.fields.target ?? "delegate";
  const problems = parsed.triggerUnread ? [parsed.triggerUnread] : [];
  let nextSlot: Date | null = null;
  if (on) {
    const cron = cronOf(on.cron, on.zone);
    if (cron instanceof ElysiaStatus) {
      problems.push(`on: ${cron.response.detail}`);
    } else {
      nextSlot = Cron.next(cron, new Date(now));
    }
  }
  const checkProblem = checkLinesProblem(check, checkOn);
  if (checkProblem) {
    problems.push(checkProblem);
  }
  return {
    cron: on?.cron ?? null,
    timeZone: on?.zone ?? null,
    target,
    stop,
    deadline: deadline === null ? null : new Date(deadline),
    dailyCapUsd,
    mode,
    keep: keep ?? false,
    command: check,
    checkOn: check ? checkOn : null,
    problem: problems.join(" ") || null,
    nextSlot,
  };
};

/** Why a routine's `check:` and `check_on:` lines cannot stand together, or nothing: each needs the other. */
export const checkLinesProblem = (
  check: string | null,
  checkOn: readonly string[]
): string | undefined => {
  if (check && checkOn.length === 0) {
    return "check: runs on the machines check_on: lists, and no check_on: is given.";
  }
  if (!check && checkOn.length > 0) {
    return "check_on: lists the machines a check runs on, and no check: is given.";
  }
  return undefined;
};
