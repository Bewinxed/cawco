/**
 * Before migration 0404's SQL runs, the hub's log names every work item
 * whose stored outputs 0404 keeps as `outputs_unread` (a list that is there
 * and does not read whole), and every task index row 0404 has read again
 * from its file (its outputs, or a list line that governs its attempts, do
 * not read), with why: the journal of the day it runs records each item
 * whose landing pushes nothing because the hub cannot read which of its
 * files were declared outputs, and each task the next listing reads again. Selected with 0404's own predicates, over the JSON
 * `outputs` columns as they stand before it.
 */
import type { Database } from "bun:sqlite";
import type { TaskField } from "../task-file";
import { shown } from "./json-reads";

/**
 * A list 0404 reads whole: a JSON list whose every entry is text. Each JSON
 * function sits inside a CASE that has proved its argument JSON of the
 * right type: SQLite may run the right side of an AND first, so an AND
 * would not keep them off a value that is not JSON.
 */
const READS =
  "CASE WHEN CASE WHEN json_valid(outputs) THEN json_type(outputs) = 'array' ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(outputs) e WHERE e.type <> 'text') ELSE 0 END";

/**
 * The list fields whose line, left open, holds every attempt from 0404 on
 * (task-file.ts `GOVERNING_LISTS`): a row whose problem names one in the
 * reader's words before 0404 (`<field>: is not a list`) is read again.
 */
const GOVERNING = [
  "outputs",
  "owns",
  "checks",
  "accounts",
  "waits_on",
] satisfies readonly TaskField[];
const LINE_UNREAD = [
  ...GOVERNING.map((field) => `problem LIKE '%${field}: is not a list%'`),
  // A wait that names no target, in the reader's words: it holds every attempt too.
  "problem LIKE '%waits_on: “%” is not a task, card, pin%'",
].join(" OR ");

/** Why a list does not read, in a clause: what is wrong with it. */
const why = (raw: string): string => {
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return "it is not JSON";
  }
  if (!Array.isArray(list)) {
    return "it is not a list of paths";
  }
  return (
    list
      .flatMap((entry, n) =>
        typeof entry === "string"
          ? []
          : [`entry ${n + 1} is ${shown(JSON.stringify(entry))}, not a path`]
      )
      .join("; ") || "it does not read as paths"
  );
};

/** What of a list 0404 places beside it: its entries that are text. */
const placed = (raw: string): string => {
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return "none of it is placed";
  }
  const paths = Array.isArray(list)
    ? list.filter((entry) => typeof entry === "string")
    : [];
  return paths.length > 0
    ? `${paths.map((path) => shown(path)).join(", ")} placed`
    : "none of it is placed";
};

interface ItemRow {
  id: string;
  raw: string;
  state: string;
}

interface TaskRow {
  path: string;
  problem: string | null;
  project: string;
  raw: string | null;
  reads: number;
}

/** Every work item whose stored outputs do not read, oldest first. */
const unreadItems = (client: Database): ItemRow[] =>
  client
    .query<ItemRow, []>(
      `SELECT id, state, CAST(outputs AS TEXT) AS raw FROM work_items WHERE outputs IS NOT NULL AND NOT (${READS}) ORDER BY created_at, id`
    )
    .all();

/** Every task index row 0404 clears the hash of, by project and file. */
const rereadTasks = (client: Database): TaskRow[] =>
  client
    .query<TaskRow, []>(
      `SELECT project_id AS project, path, problem, CAST(outputs AS TEXT) AS raw, ${READS} AS reads FROM project_tasks WHERE NOT (${READS}) OR ${LINE_UNREAD} ORDER BY project_id, number, path`
    )
    .all();

/** Logs every list of outputs 0404 keeps as not read, or reads again, one line each. Run only in a start that applies 0404 (db/migrate.ts). */
export const logOutputsUnread = (client: Database): void => {
  for (const row of unreadItems(client)) {
    console.info(
      `[migrations] 0404: work item ${row.id} (${row.state}) lands nothing: its outputs ${shown(row.raw)} do not read (${why(row.raw)}), kept as stored, ${placed(row.raw)}`
    );
  }
  for (const row of rereadTasks(client)) {
    const said =
      row.reads === 1
        ? `a list line of its file that governs its attempts does not read, and no attempt at it starts until it does (${row.problem ?? "no problem kept"})`
        : `its indexed outputs ${shown(row.raw ?? "")} do not read (${why(row.raw ?? "")}), ${placed(row.raw ?? "")}`;
    console.info(
      `[migrations] 0404: task ${row.path} in project ${row.project} is read again from its file at the next listing: ${said}`
    );
  }
};
