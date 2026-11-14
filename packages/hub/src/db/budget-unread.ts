/**
 * Before migration 0398's SQL runs, the hub's log names every project,
 * routine and work item whose stored budget 0398 keeps as `budget_unread`
 * (a budget that does not read whole), with why, so the journal of the day
 * it runs records each row whose work stops. Read with 0398's own
 * predicates, over the JSON `budget` columns as they stand before it.
 */
import type { Database } from "bun:sqlite";

/** The limits a budget names, as 0398 places them. */
const LIMITS = ["usd", "turns", "minutes"] as const;
type Limit = (typeof LIMITS)[number];

/** A limit that reads, as 0398 places one: dollars above 0, turns and minutes whole numbers from 1. */
const limitReads = (limit: Limit): string => {
  const value = `json_extract(budget, '$.${limit}')`;
  const type = `json_type(budget, '$.${limit}') IN ('integer', 'real')`;
  return limit === "usd"
    ? `${type} AND ${value} > 0`
    : `${type} AND ${value} >= 1 AND ${value} = CAST(${value} AS INTEGER)`;
};

/** A budget 0398 reads whole: unset (SQL or JSON null), or an object of limits that each read. */
const READS = `(budget IS NULL OR CASE WHEN json_valid(budget) THEN json_type(budget) = 'null' ELSE 0 END OR CASE WHEN json_valid(budget) THEN json_type(budget) = 'object' AND NOT EXISTS (SELECT 1 FROM json_each(budget) WHERE key NOT IN ('usd', 'turns', 'minutes')) AND ${LIMITS.map((limit) => `(json_type(budget, '$.${limit}') IS NULL OR (${limitReads(limit)}))`).join(" AND ")} ELSE 0 END)`;

/** A limit that is there and does not read: its JSON, else null. */
const badLimit = (limit: Limit): string =>
  `CASE WHEN CASE WHEN json_valid(budget) THEN json_type(budget) = 'object' AND json_type(budget, '$.${limit}') IS NOT NULL AND NOT (${limitReads(limit)}) ELSE 0 END THEN json_quote(json_extract(budget, '$.${limit}')) END AS ${limit}`;

/** What a row that does not read holds, for its reason. */
const UNREAD = `CASE WHEN json_valid(budget) THEN 1 ELSE 0 END AS json, CASE WHEN json_valid(budget) THEN json_type(budget) = 'object' ELSE 0 END AS object, CASE WHEN CASE WHEN json_valid(budget) THEN json_type(budget) = 'object' ELSE 0 END THEN (SELECT group_concat(key, ', ') FROM json_each(budget) WHERE key NOT IN ('usd', 'turns', 'minutes')) END AS keys, ${LIMITS.map(badLimit).join(", ")}`;

interface Unread {
  id: string;
  json: number;
  keys: string | null;
  /** Its name (a project's, a routine's), or a work item's state. */
  label: string;
  minutes: string | null;
  object: number;
  raw: string;
  turns: string | null;
  usd: string | null;
}

/** Why a budget does not read, in a clause: what is wrong with it. */
const why = (row: Unread): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object === 0) {
    return "it is not an object of usd, turns and minutes";
  }
  return [
    row.keys === null ? "" : `it names ${row.keys}, not usd, turns or minutes`,
    row.usd === null ? "" : `usd is ${row.usd}, not dollars above 0`,
    row.turns === null
      ? ""
      : `turns is ${row.turns}, not a whole number from 1`,
    row.minutes === null
      ? ""
      : `minutes is ${row.minutes}, not a whole number from 1`,
  ]
    .filter(Boolean)
    .join("; ");
};

/** A work item's live states (work-item-state.ts `LIVE`): the ones the hub stops. */
const LIVE = ["starting", "running"];

/** A value as the log shows it: cut short, on one line. */
const shown = (raw: string): string => JSON.stringify(raw.slice(0, 120));

/** The rows of `table` whose budget does not read, oldest first. */
const unread = (client: Database, table: string, label: string): Unread[] =>
  client
    .query<Unread, []>(
      `SELECT id, ${label} AS label, CAST(budget AS TEXT) AS raw, ${UNREAD} FROM ${table} WHERE NOT ${READS} ORDER BY created_at, id`
    )
    .all();

/** The lines, each `[migrations] 0398: …`, for every budget 0398 keeps as not read. */
const unreadLines = (client: Database): string[] => [
  ...unread(client, "projects", "name").map(
    (row) =>
      `project ${row.id} (${row.label}) starts no work item: its budget ${shown(row.raw)} does not read: ${why(row)}`
  ),
  ...unread(client, "routines", "name").map(
    (row) =>
      `routine ${row.id} (${row.label}) skips every run: its budget ${shown(row.raw)} does not read: ${why(row)}`
  ),
  ...unread(client, "work_items", "state").map(
    (row) =>
      `work item ${row.id} (${row.label}) ${LIVE.includes(row.label) ? "stops" : "stays ended"}: its budget ${shown(row.raw)} does not read: ${why(row)}`
  ),
];

/** Logs every budget 0398 keeps as not read, one line each. Run only in a start that applies 0398 (db/migrate.ts). */
export const logBudgetUnread = (client: Database): void => {
  for (const line of unreadLines(client)) {
    console.info(`[migrations] 0398: ${line}`);
  }
};
