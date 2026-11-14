/**
 * Before migration 0397's SQL runs, the hub's log names every session and
 * delegate type 0397 places at the narrow value (may start none, or starts
 * with CawCo's own alone), with why, so the journal of the day it runs
 * records each. Read with 0397's own predicates, over the columns as they
 * stand before it: the JSON lists, and `delegate_types` at its last
 * hand-made shape (delegate-types-hand-shape.ts runs first). Summarisers,
 * many and alike, are one line with their count.
 */
import type { Database } from "bun:sqlite";

/** A value 0397 reads as no value: SQL null, or JSON `null`. */
const unset = (x: string) =>
  `(${x} IS NULL OR CASE WHEN json_valid(${x}) THEN json_type(${x}) = 'null' ELSE 0 END)`;

/** A list of names, as 0397 reads one. */
const names = (x: string) =>
  `CASE WHEN json_valid(${x}) THEN json_type(${x}) = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(${x}) WHERE type <> 'text') ELSE 0 END`;

/** A starting set, `{skills, servers}`, as 0397 reads one. */
const set = (x: string) =>
  `CASE WHEN json_valid(${x}) THEN json_type(${x}) = 'object' AND json_type(${x}, '$.skills') = 'array' AND json_type(${x}, '$.servers') = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(${x}, '$.skills') WHERE type <> 'text') AND NOT EXISTS (SELECT 1 FROM json_each(${x}, '$.servers') WHERE type <> 'text') ELSE 0 END`;

/** A type whose five lists each read (0397's `reads`). */
const typeReads = (at: (column: string) => string) =>
  [
    ...["may_start", "skills", "deny_tools", "connections"].map(
      (column) => `(${unset(at(column))} OR (${names(at(column))}))`
    ),
    `(${unset(at("starting_set"))} OR (${set(at("starting_set"))}))`,
  ].join(" AND ");

/** A work item's session with no list: what 0397 places from its chain, else its work item. */
const LISTLESS = `${unset("i.may_start")} AND i.work_item_id IS NOT NULL AND i.kind <> 'summariser'`;

/** Each listless work item session whose chain and work item hold no readable list: 0397 gives it none. */
const NO_LIST = `WITH RECURSIVE back(session, at, depth) AS (
  SELECT i.id, i.id, 0 FROM instances i WHERE ${LISTLESS}
  UNION SELECT b.session, p.id, b.depth + 1 FROM back b JOIN instances p ON p.continued_into = b.at OR p.id IN (SELECT source_instance_id FROM continuations WHERE target_instance_id = b.at) WHERE b.depth < 100
)
SELECT i.id, i.work_item_id AS item FROM instances i
WHERE ${LISTLESS}
  AND i.id NOT IN (SELECT b.session FROM back b JOIN instances p ON p.id = b.at WHERE b.depth > 0 AND (${names("p.may_start")}))
  AND NOT EXISTS (SELECT 1 FROM instances p WHERE p.work_item_id = i.work_item_id AND p.id <> i.id AND (${names("p.may_start")}))
ORDER BY i.created_at`;

/** A trash entry 0397 reads as one old type row. */
const TRASHED_ROW = `CASE WHEN json_valid(t.rows) THEN json_type(t.rows) = 'array' AND json_array_length(t.rows) = 1 AND json_extract(t.rows, '$[0].table') = 'delegate_types' AND json_array_length(t.rows, '$[0].rows') = 1 AND json_type(t.rows, '$[0].rows[0].name') = 'text' AND json_type(t.rows, '$[0].rows[0].description') = 'text' AND json_type(t.rows, '$[0].rows[0].harness') = 'text' AND json_type(t.rows, '$[0].rows[0].model') = 'text' ELSE 0 END`;

/** A value as the log shows it: cut short, on one line. */
const shown = (raw: string | null): string =>
  JSON.stringify((raw ?? "").slice(0, 120));

/** The lines, each `[migrations] 0397: …`, for what 0397 places narrow. */
const narrowedLines = (client: Database): string[] => {
  const lines: string[] = [];
  for (const row of client
    .query<{ id: string; item: string }, []>(NO_LIST)
    .all()) {
    lines.push(
      `session ${row.id} may start none: no session of its work item ${row.item}, before it or beside it, held a list`
    );
  }
  const summarisers =
    client
      .query<{ n: number }, []>(
        `SELECT count(*) AS n FROM instances i WHERE ${unset("i.may_start")} AND i.kind = 'summariser'`
      )
      .get()?.n ?? 0;
  if (summarisers > 0) {
    lines.push(
      `${summarisers} continuation summariser${summarisers === 1 ? "" : "s"} may start none: none ever chose any`
    );
  }
  for (const row of client
    .query<{ id: string; raw: string | null }, []>(
      `SELECT i.id, i.may_start AS raw FROM instances i WHERE NOT ${unset("i.may_start")} AND NOT (${names("i.may_start")}) ORDER BY i.created_at`
    )
    .all()) {
    lines.push(
      `session ${row.id} may start none: what it may start did not read as a list of type names, ${shown(row.raw)}`
    );
  }
  for (const row of client
    .query<{ id: string; raw: string | null }, []>(
      `SELECT i.id, i.starting_set AS raw FROM instances i WHERE NOT ${unset("i.starting_set")} AND NOT (${set("i.starting_set")}) ORDER BY i.created_at`
    )
    .all()) {
    lines.push(
      `session ${row.id} starts with CawCo's own skills and server alone: its starting set did not read as skills and servers, ${shown(row.raw)}`
    );
  }
  const narrowedType =
    "may start none and starts with CawCo's own alone, with no skills, denied tools or connections: one of its lists did not read";
  for (const row of client
    .query<{ name: string }, []>(
      `SELECT name FROM delegate_types WHERE NOT (${typeReads((column) => column)}) ORDER BY name`
    )
    .all()) {
    lines.push(`delegate type ${row.name} ${narrowedType}`);
  }
  for (const row of client
    .query<{ id: number; name: string }, []>(
      `SELECT t.id, json_extract(t.rows, '$[0].rows[0].name') AS name FROM config_trash t WHERE t.kind = 'delegateType' AND (${TRASHED_ROW}) AND NOT (${typeReads((column) => `json_extract(t.rows, '$[0].rows[0].${column}')`)}) ORDER BY t.id`
    )
    .all()) {
    lines.push(
      `trashed delegate type ${row.name} (trash entry ${row.id}) ${narrowedType}`
    );
  }
  return lines;
};

/** Logs what 0397 places narrow, one line each. Run only in a start that applies 0397, after the hand-made tables' last shape (db/migrate.ts). */
export const logMayStartNarrowed = (client: Database): void => {
  for (const line of narrowedLines(client)) {
    console.info(`[migrations] 0397: ${line}`);
  }
};
