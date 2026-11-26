/**
 * Before migration 0400's SQL runs, the hub's log names every work item
 * whose stored landing 0400 keeps as `landed_unread` (a landing that is
 * there and does not read whole), with why, so the journal of the day it
 * runs records each item whose work is held landed on a record the hub
 * cannot read: never landed again, its gate vouching for no tree. Read with
 * 0400's own predicates, over the JSON `landed` column as it stands before
 * it.
 */
import type { Database } from "bun:sqlite";
import { quote } from "@cawco/providers/quote";
import { shown } from "./json-reads";

const type = (path: string): string => `json_type(landed, '${path}')`;
const value = (path: string): string => `json_extract(landed, '${path}')`;

/** A commit's or a tree's name at `path`: text, not empty. */
const named = (path: string): string =>
  `${type(path)} = 'text' AND length(${value(path)}) > 0`;

/** A gate 0400 places: a tree and a list of commands. */
const GATE_WHOLE = `${type("$.gate")} = 'object' AND ${named("$.gate.tree")} AND ${type("$.gate.passed")} = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(landed, '$.gate.passed') WHERE type <> 'text')`;

/** One field of a landing as 0400 reads it: its key, whether it reads, and what it must be. */
interface Field {
  key: string;
  reads: string;
  wants: string;
}

/** The four fields of `WorkLanding`, in 0400's order. */
const FIELDS: readonly Field[] = [
  { key: "sha", reads: named("$.sha"), wants: "a commit's name" },
  {
    key: "onto",
    reads: `${type("$.onto")} = 'null' OR (${named("$.onto")})`,
    wants: "a commit's name, or null",
  },
  {
    key: "at",
    reads: `${type("$.at")} IS NULL OR (${type("$.at")} = 'integer' AND ${value("$.at")} >= 0)`,
    wants: "a whole number of ms",
  },
  {
    key: "gate",
    reads: `${type("$.gate")} IS NULL OR (${GATE_WHOLE})`,
    wants: "a tree and a list of commands",
  },
];

/** A stored landing that is a JSON object; the fields' predicates run only inside it. */
const OBJECT =
  "CASE WHEN json_valid(landed) THEN json_type(landed) = 'object' ELSE 0 END";

/** A landing 0400 reads whole: an object whose four fields each read. */
const READS = `CASE WHEN ${OBJECT} THEN coalesce(${FIELDS.map((field) => `(${field.reads})`).join(" AND ")}, 0) ELSE 0 END`;

/**
 * Each field that does not read: its JSON as stored, `missing` when it is
 * not there, as columns `f0`… Each test is a CASE inside the object's: SQLite
 * may run the right side of an AND first, so an AND would not keep the
 * JSON functions off a value that is not JSON.
 */
const BAD_FIELDS = FIELDS.map(
  (field, n) =>
    `CASE WHEN NOT (${OBJECT}) THEN NULL WHEN coalesce((${field.reads}), 0) THEN NULL WHEN ${type(`$.${field.key}`)} IS NULL THEN 'missing' ELSE json_quote(${value(`$.${field.key}`)}) END AS f${n}`
).join(", ");

interface Row {
  id: string;
  json: number;
  object: number;
  raw: string;
  /** The commit 0400 places from it, when its `sha` reads. */
  sha: string | null;
  state: string;
  [field: `f${number}`]: string | null;
}

/** Why a landing does not read, in a clause: what is wrong with it. */
const why = (row: Row): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object === 0) {
    return "it is not an object of sha, onto, at and gate";
  }
  return FIELDS.flatMap((field, n) => {
    const bad = row[`f${n}`];
    if (!bad) {
      return [];
    }
    return bad === "missing"
      ? [`${field.key} is missing`]
      : [`${field.key} is ${quote(bad)}, not ${field.wants}`];
  }).join("; ");
};

/** Every work item whose stored landing does not read, oldest first. */
const unreadLandings = (client: Database): Row[] =>
  client
    .query<Row, []>(
      `SELECT id, state, CAST(landed AS TEXT) AS raw, CASE WHEN json_valid(landed) THEN 1 ELSE 0 END AS json, ${OBJECT} AS object, CASE WHEN NOT (${OBJECT}) THEN NULL WHEN coalesce((${named("$.sha")}), 0) THEN ${value("$.sha")} END AS sha, ${BAD_FIELDS} FROM work_items WHERE landed IS NOT NULL AND NOT (${READS}) ORDER BY created_at, id`
    )
    .all();

/** Logs every landing 0400 keeps as not read, one line each. Run only in a start that applies 0400 (db/migrate.ts). */
export const logLandedUnread = (client: Database): void => {
  for (const row of unreadLandings(client)) {
    const commit = row.sha ? `its commit ${row.sha} placed` : "no commit read";
    console.info(
      `[migrations] 0400: work item ${row.id} (${row.state}) is held landed, never landed again, its gate vouching for no tree: its landing ${shown(row.raw)} does not read: ${why(row)}; ${commit}`
    );
  }
};
