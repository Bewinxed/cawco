/**
 * Before migration 0401's SQL runs, the hub's log names every work item
 * whose stored gate passes 0401 keeps as `gate_passes_unread` (a record
 * that is there and does not read whole), with why, so the journal of the
 * day it runs records each item whose landing gate runs every step again
 * because the hub cannot read what passed. Selected with 0401's own
 * predicate, over the JSON `gate_passes` column as it stands before it.
 */
import type { Database } from "bun:sqlite";
import { quote } from "@cawco/providers/quote";
import { shown } from "./json-reads";

/** One pass 0401 places: an object whose command and stage are text. */
const PASS_READS =
  "CASE WHEN p.type = 'object' THEN coalesce(json_type(p.value, '$.command') = 'text' AND json_type(p.value, '$.stage') = 'text', 0) ELSE 0 END";

/** One key's passes 0401 places: a list of passes that each read. */
const LIST_READS = `CASE WHEN k.type = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(k.value) p WHERE NOT (${PASS_READS})) ELSE 0 END`;

/**
 * A record 0401 reads whole: a JSON object whose every key holds a list of
 * passes that read. Each JSON function sits inside a CASE that has proved
 * its argument JSON of the right type: SQLite may run the right side of an
 * AND first, so an AND would not keep them off a value that is not JSON.
 */
const READS = `CASE WHEN CASE WHEN json_valid(gate_passes) THEN json_type(gate_passes) = 'object' ELSE 0 END THEN NOT EXISTS (SELECT 1 FROM json_each(gate_passes) k WHERE NOT (${LIST_READS})) ELSE 0 END`;

interface Row {
  id: string;
  raw: string;
  state: string;
}

/** A pass that reads, as 0401 reads it. */
const passReads = (pass: unknown): boolean =>
  typeof pass === "object" &&
  pass !== null &&
  !Array.isArray(pass) &&
  "command" in pass &&
  typeof pass.command === "string" &&
  "stage" in pass &&
  typeof pass.stage === "string";

/** Why a record does not read, in a clause: what is wrong with it. */
const why = (raw: string): string => {
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return "it is not JSON";
  }
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    return "it is not an object of passes by what they passed on";
  }
  return (
    Object.entries(record)
      .flatMap(([key, passes]) => {
        if (!Array.isArray(passes)) {
          return [
            `${quote(key)} holds ${shown(JSON.stringify(passes))}, not a list of passes`,
          ];
        }
        return passes.flatMap((pass, n) =>
          passReads(pass)
            ? []
            : [
                `${quote(key)}'s pass ${n + 1} is ${shown(JSON.stringify(pass))}, not a command and a stage`,
              ]
        );
      })
      .join("; ") || "it does not read as passes"
  );
};

/** Every work item whose stored gate passes do not read, oldest first. */
const unreadPasses = (client: Database): Row[] =>
  client
    .query<Row, []>(
      `SELECT id, state, CAST(gate_passes AS TEXT) AS raw FROM work_items WHERE gate_passes IS NOT NULL AND NOT (${READS}) ORDER BY created_at, id`
    )
    .all();

/** Logs every record of gate passes 0401 keeps as not read, one line each. Run only in a start that applies 0401 (db/migrate.ts). */
export const logGatePassesUnread = (client: Database): void => {
  for (const row of unreadPasses(client)) {
    console.info(
      `[migrations] 0401: work item ${row.id} (${row.state}) runs every step of its landing gate again, none of its passes kept: its gate passes ${shown(row.raw)} do not read: ${why(row.raw)}`
    );
  }
};
