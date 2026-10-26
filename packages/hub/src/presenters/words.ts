/**
 * The words every presenter speaks in (mcp-tool.ts): a thing by its name or
 * the short handle a later call takes back, a time as how long ago, a count
 * with its noun. An absence is said, never left as a gap.
 */

import { DAY_MS, HOUR_MS, MINUTE_MS } from "@cawco/core/time";

/** An id's short handle: its first eight characters, what every tool taking that id takes back (handles.ts). */
export const handle = (id: string): string => id.slice(0, 8);

const dateOf = (at: Date | string | number): number =>
  at instanceof Date ? at.getTime() : new Date(at).getTime();

/** A day as the calendar names it: 2026-10-02. */
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** How long ago `at` was: "just now", "12 min ago", "3 h ago", "yesterday", "5 days ago", "on 2026-09-01". */
export const ago = (at: Date | string | number, now = Date.now()): string => {
  const ms = dateOf(at);
  if (!Number.isFinite(ms)) {
    return "at a time the hub did not keep";
  }
  const past = now - ms;
  if (past < 0) {
    return ahead(ms, now);
  }
  if (past < MINUTE_MS) {
    return "just now";
  }
  if (past < HOUR_MS) {
    return `${Math.round(past / MINUTE_MS)} min ago`;
  }
  if (past < DAY_MS) {
    return `${Math.round(past / HOUR_MS)} h ago`;
  }
  if (past < 2 * DAY_MS) {
    return "yesterday";
  }
  return past < 30 * DAY_MS
    ? `${Math.round(past / DAY_MS)} days ago`
    : `on ${dayOf(ms)}`;
};

/** How far ahead `at` is: "in 4 min", "in 3 h", "tomorrow", "on 2026-11-02". */
export const ahead = (at: Date | string | number, now = Date.now()): string => {
  const ms = dateOf(at);
  if (!Number.isFinite(ms)) {
    return "at a time the hub did not keep";
  }
  const left = ms - now;
  if (left <= 0) {
    return ago(ms, now);
  }
  if (left < MINUTE_MS) {
    return "in under a minute";
  }
  if (left < HOUR_MS) {
    return `in ${Math.round(left / MINUTE_MS)} min`;
  }
  if (left < DAY_MS) {
    return `in ${Math.round(left / HOUR_MS)} h`;
  }
  if (left < 2 * DAY_MS) {
    return "tomorrow";
  }
  return `on ${dayOf(ms)}`;
};

/** A span as long as it lasted: "25 min", "3 h", "2 days". */
export const lasted = (ms: number): string => {
  if (ms < HOUR_MS) {
    return `${Math.max(1, Math.round(ms / MINUTE_MS))} min`;
  }
  return ms < DAY_MS
    ? `${Math.round(ms / HOUR_MS)} h`
    : `${Math.round(ms / DAY_MS)} days`;
};

/** A count with its noun: "1 pin", "3 pins". */
export const count = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** Words as said, cut at `max` characters, in quotes. */
export const quote = (text: string, max = 200): string => {
  const flat = text.replace(/\s+/gu, " ").trim();
  return `“${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}”`;
};

/** The person's own words, whole and exactly as typed (line breaks kept), in JSON's quotes as a delivery says them. */
export const verbatim = (text: string): string => JSON.stringify(text);

/** A list in words: "a", "a and b", "a, b and c". */
export const listed = (items: readonly string[]): string => {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
};

/** Lines, the ones a condition left out dropped. */
export const lines = (
  ...parts: (string | false | null | undefined | readonly string[])[]
): string =>
  parts
    .flatMap((part) => (typeof part === "string" ? [part] : part || []))
    .filter((part) => part !== "")
    .join("\n");

/** A value a page or the person set, as the agent reads it: JSON, cut. */
export const valueWords = (value: unknown, max = 200): string => {
  const text = JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
