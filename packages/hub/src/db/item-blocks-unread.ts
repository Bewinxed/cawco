/**
 * Before migration 0412's SQL runs, the hub's log names every work item
 * whose stored block (`work_items.blocked`: what its session cannot be
 * started again without, by kind and name, and since when) 0412 keeps as
 * `blocked_unread`: a value that is there and does not read whole. Nothing
 * of it is placed, and the item stays blocked: what it is sent waits at the
 * hub, and its session is not started, until the sweep finds nothing it
 * needs missing. Read with 0412's own predicate ({@link BLOCK_READS}, which
 * 0412's SQL was written from), over the JSON column as it stands before
 * it. {@link itemBlocksKept} reads every item, for the count taken on a
 * copy before 0412 runs.
 */
import type { Database } from "bun:sqlite";
import {
  fieldOff,
  type Lifted,
  type LiftedRow,
  liftedColumns,
  liftedRows,
  logRestrictive,
  shown,
  typeIn,
} from "./json-reads";

/**
 * `blocked` reads whole: an object with `kind` one of what an item is
 * blocked on, `name` text, and `since` a number (epoch ms).
 */
const BLOCK_READS =
  "CASE WHEN json_valid(blocked) THEN CASE WHEN json_type(blocked) = 'object' THEN coalesce(json_type(blocked, '$.kind') = 'text' AND json_extract(blocked, '$.kind') IN ('type', 'machine', 'account') AND json_type(blocked, '$.name') = 'text' AND json_type(blocked, '$.since') IN ('integer', 'real'), 0) ELSE 0 END ELSE 0 END";

/** A block's kind as 0412 reads it: `known` when it is one an item is blocked on, else its JSON type; null when missing or no JSON object. */
const KIND =
  "CASE WHEN json_valid(blocked) THEN CASE WHEN json_type(blocked) = 'object' THEN CASE WHEN json_type(blocked, '$.kind') = 'text' THEN CASE WHEN json_extract(blocked, '$.kind') IN ('type', 'machine', 'account') THEN 'known' ELSE 'text' END ELSE json_type(blocked, '$.kind') END END END";

/** An item as 0412 reads it, each field by its JSON type. */
interface Row extends LiftedRow {
  kind: string | null;
  name: string | null;
  since: string | null;
}

/** Every field of a block that does not read, and what it must be. */
const blockOff = (row: Row): string[] => [
  ...fieldOff("kind", row.kind, ["known"], "a type, a machine or an account"),
  ...fieldOff("name", row.name, ["text"], "text"),
  ...fieldOff("since", row.since, ["integer", "real"], "a number"),
];

/** Every work item's block as 0412 reads it, by item id. Run on a database 0412 has not run on. */
export const itemBlocksKept = (client: Database): Lifted[] =>
  liftedRows<Row>(
    client,
    `SELECT id AS key, ${liftedColumns("blocked", BLOCK_READS)}, ${KIND} AS kind, ${typeIn("blocked", "name")} AS name, ${typeIn("blocked", "since")} AS since FROM work_items ORDER BY id`,
    blockOff
  );

/** Logs every block 0412 keeps as not read, one line each. Run only in a start that applies 0412 (db/migrate.ts). */
export const logItemBlocksUnread = (client: Database): void => {
  logRestrictive(
    itemBlocksKept(client),
    (row, why) =>
      `[migrations] 0412: work item ${row.key}: its block ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, nothing placed: it stays blocked until the sweep finds nothing its session needs missing`
  );
};
