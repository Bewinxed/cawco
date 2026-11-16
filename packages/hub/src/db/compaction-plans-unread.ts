/**
 * Before migration 0429's SQL runs, the hub's log names every compaction
 * plan (`limit_compactions`) whose move or reading 0429 keeps as not read:
 * a move that is there and is not a `moved` line reading whole (a plan's
 * move is always one: limit-decision.ts `compactedLine`), or a filing's
 * reading that is there and does not read whole as core `ContextFill`.
 * Such a plan reads as none, as one 0410 kept unread does: it drives no
 * move and holds nothing back.
 *
 * The predicates below are 0429's own: its SQL was written from them, over
 * the columns as 0410 left them (`move_kind`, `move` without its kind,
 * `move_unread`, `fill`). {@link MOVED} and {@link FILL} are the shapes
 * the hub read them by then (stored/columns.json, `limit_compactions.move`
 * and `.fill`), frozen here; a `moved` line's fields are those 0414 froze
 * (db/continuation-askers-unread.ts `MOVED_FIELDS`), the same core shape. {@link compactionPlansKept} reads every plan
 * with them, for the count taken on a copy before 0429 runs
 * (scripts/compaction-decides-tracker-readings.ts), on a database 0410 has
 * not run on too: there a plan's kind is still inside its move.
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { MOVED_FIELDS } from "./continuation-askers-unread";
import {
  type Lifted,
  type LiftedRow,
  liftedColumns,
  liftedRows,
  logRestrictive,
  NUMBER,
  object,
  readsWhole,
  shown,
} from "./json-reads";

/** A `moved` line without its kind, as `limit_compactions.move` held it after 0410 (core `AccountMove`). */
const MOVED = object(MOVED_FIELDS.required, MOVED_FIELDS.optional);

/** A filing's reading at the threshold (core `ContextFill`). */
const FILL = object({ compactsAt: NUMBER, tokens: NUMBER });

/** `fill` reads whole as a filing's reading. */
const FILL_READS = readsWhole("fill", FILL);

/**
 * A line's kind before 0410 lifted it: inside the move itself, read only
 * once the move is proved a JSON object.
 */
const KIND_INSIDE =
  "CASE WHEN json_valid(move) THEN CASE WHEN json_type(move) = 'object' THEN json_extract(move, '$.kind') END END";

/** A plan as 0429 reads its move or its reading. */
interface Row extends LiftedRow {
  kind: string | null;
}

/** Why a move that is there does not read, once it is a JSON object. */
const moveOff = (row: Row): string[] => [
  row.kind === "moved"
    ? "it does not read whole as a moved line"
    : `its kind ${row.kind ?? "(none)"} is not a moved line's`,
];

/** Why a filing's reading does not read, once it is a JSON object. */
const fillOff = (): string[] => [
  "it is not a filing's reading (compactsAt and tokens, numbers), or the plan is a move's",
];

/** One plan's move or reading as 0429 reads it, by `session/line`. */
export type KeptPlan = Lifted & { column: "fill" | "move" };

/**
 * Every plan's move and reading as 0429 reads them. Run on a database 0429
 * has not run on; 0410 may or may not have.
 */
export const compactionPlansKept = (client: Database): KeptPlan[] => {
  const lifted =
    client
      .query<{ n: number }, []>(
        "SELECT count(*) AS n FROM pragma_table_info('limit_compactions') WHERE name = 'move_kind'"
      )
      .get()?.n === 1;
  // Before 0410 a move's kind is inside it, and one 0410 would keep unread
  // has no `moved` kind there: the same reading.
  const kind = lifted ? "move_kind" : KIND_INSIDE;
  const moveReads = `CASE WHEN ${kind} = 'moved' THEN ${readsWhole("move", MOVED)} ELSE 0 END`;
  const unread = lifted ? "move_unread" : "NULL";
  const moves = liftedRows<Row>(
    client,
    `SELECT instance_id || '/' || line_id AS key, ${liftedColumns(`coalesce(${unread}, move)`, `CASE WHEN ${unread} IS NULL THEN ${moveReads} ELSE 0 END`)}, ${kind} AS kind FROM limit_compactions ORDER BY instance_id`,
    moveOff
  );
  const fills = liftedRows<Row>(
    client,
    `SELECT instance_id || '/' || line_id AS key, ${liftedColumns("fill", `CASE WHEN move IS NULL AND ${unread} IS NULL THEN ${FILL_READS} ELSE 0 END`)}, NULL AS kind FROM limit_compactions ORDER BY instance_id`,
    fillOff
  );
  return [
    ...moves.map((row) => ({ ...row, column: "move" as const })),
    ...fills.map((row) => ({ ...row, column: "fill" as const })),
  ];
};

/** Logs every plan's move and reading 0429 keeps as not read, one line each. Run only in a start that applies 0429 (db/migrate.ts). */
export const logCompactionPlansUnread = (client: Database): void => {
  const kept = compactionPlansKept(client);
  for (const [column, what] of [
    ["move", "move"],
    ["fill", "reading at the threshold"],
  ] as const) {
    logRestrictive(
      kept.filter((row) => row.column === column),
      (row, why) =>
        `[migrations] 0429: session/line ${row.key}: its compaction plan's ${what} ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, the plan reads as none: it drives no move and holds nothing back`
    );
  }
};
