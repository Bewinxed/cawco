/**
 * Before migration 0410's SQL runs, the hub's log names every limit line
 * (`limit_events.move`, a line the hub wrote into a session's transcript at
 * its account's limit) and every compaction plan's move
 * (`limit_compactions.move`) whose kind does not read, which 0410 keeps as
 * `move_unread`: not JSON, not an object, or a `kind` that is not one of a
 * line's (core `ACCOUNT_MOVE_KINDS`). Such a line is in no transcript and
 * drives no move; such a plan reads as none. Read with 0410's own
 * predicate ({@link KIND_READS}, which 0410's SQL was written from), over
 * the JSON columns as they stand before it. {@link limitLinesKept} reads
 * every line and plan, for the count taken on a copy before 0410 runs.
 */
import type { Database } from "bun:sqlite";
import { ACCOUNT_MOVE_KINDS } from "@cawco/core/accounts";
import {
  type Lifted,
  type LiftedRow,
  liftedColumns,
  liftedRows,
  logRestrictive,
  shown,
} from "./lifted-reading";

/** A line's kinds, as an SQL list. */
const KINDS = ACCOUNT_MOVE_KINDS.map((kind) => `'${kind}'`).join(", ");

/** `move`'s kind reads: a JSON object whose `kind` is one of a line's. */
const KIND_READS = `CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CASE WHEN json_type(move, '$.kind') = 'text' THEN json_extract(move, '$.kind') IN (${KINDS}) ELSE 0 END ELSE 0 END ELSE 0 END`;

/** A line's kind as stored, as text; null when it has none, or is no JSON object. */
const KIND =
  "CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN CAST(json_extract(move, '$.kind') AS TEXT) END END";

/** A line or plan as 0410 reads it, with its kind as stored. */
interface Row extends LiftedRow {
  kind: string | null;
}

/** Why a line's kind does not read, once it is a JSON object. */
const kindOff = (row: Row): string[] => [
  row.kind === null
    ? "it has no kind"
    : `its kind ${row.kind} is not one of a line's`,
];

/** The two tables 0410 reads a line's kind in, and what is keyed by `session/line` in each. */
const TABLES = {
  limit_events: "id",
  limit_compactions: "line_id",
} as const;

/** One line or plan 0410 reads, by `session/line`, and the table it is in. */
type Kept = Lifted & { table: keyof typeof TABLES };

/** Every limit line and compaction plan as 0410 reads them. Run on a database 0410 has not run on. */
export const limitLinesKept = (client: Database): Kept[] =>
  (["limit_events", "limit_compactions"] as const).flatMap((table) =>
    liftedRows<Row>(
      client,
      `SELECT instance_id || '/' || ${TABLES[table]} AS key, ${liftedColumns("move", KIND_READS)}, ${KIND} AS kind FROM ${table} ORDER BY instance_id, ${TABLES[table]}`,
      kindOff
    ).map((row) => ({ ...row, table }))
  );

/** Logs every line and plan whose kind 0410 keeps as not read, one line each. Run only in a start that applies 0410 (db/migrate.ts). */
export const logLimitLinesUnread = (client: Database): void => {
  const kept = limitLinesKept(client);
  logRestrictive(
    kept.filter((row) => row.table === "limit_events"),
    (row, why) =>
      `[migrations] 0410: session/line ${row.key}: its limit line ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, it is in no transcript and drives no move`
  );
  logRestrictive(
    kept.filter((row) => row.table === "limit_compactions"),
    (row, why) =>
      `[migrations] 0410: session/line ${row.key}: its compaction plan's move ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, the plan reads as none and drives no move`
  );
};
