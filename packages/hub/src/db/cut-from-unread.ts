/**
 * Before migration 0411's SQL runs, the hub's log names every workspace
 * whose stored source (`workspaces.cut_from`: the workspace a `delegate`
 * call's `from` cut it from, the commit its clone took, and whether its
 * landing landed that commit's work) 0411 keeps as `cut_from_unread`: a
 * value that is there and does not read whole. Nothing of it is placed, so
 * its source no longer finds it among its takers, never counts its commit
 * as landed by it, and stays held with that work as its own. Read with
 * 0411's own predicate ({@link CUT_FROM_READS}, which 0411's SQL was
 * written from), over the JSON column as it stands before it.
 * {@link cutFromKept} reads every workspace, for the count taken on a copy
 * before 0411 runs.
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
} from "./lifted-reading";

/** `cut_from` reads whole: an object with `workspace` and `commit` text and `landed` true or false. */
const CUT_FROM_READS =
  "CASE WHEN json_valid(cut_from) THEN CASE WHEN json_type(cut_from) = 'object' THEN coalesce(json_type(cut_from, '$.workspace') = 'text' AND json_type(cut_from, '$.commit') = 'text' AND json_type(cut_from, '$.landed') IN ('true', 'false'), 0) ELSE 0 END ELSE 0 END";

/** A workspace as 0411 reads it, each field by its JSON type. */
interface Row extends LiftedRow {
  commit: string | null;
  landed: string | null;
  workspace: string | null;
}

/** Every field of a source that does not read, and what it must be. */
const sourceOff = (row: Row): string[] => [
  ...fieldOff("workspace", row.workspace, ["text"], "text"),
  ...fieldOff("commit", row.commit, ["text"], "text"),
  ...fieldOff("landed", row.landed, ["true", "false"], "true or false"),
];

/** Every workspace's source as 0411 reads it, by workspace id. Run on a database 0411 has not run on. */
export const cutFromKept = (client: Database): Lifted[] =>
  liftedRows<Row>(
    client,
    `SELECT id AS key, ${liftedColumns("cut_from", CUT_FROM_READS)}, ${typeIn("cut_from", "workspace")} AS workspace, ${typeIn("cut_from", "commit")} AS "commit", ${typeIn("cut_from", "landed")} AS landed FROM workspaces ORDER BY id`,
    sourceOff
  );

/** Logs every source 0411 keeps as not read, one line each. Run only in a start that applies 0411 (db/migrate.ts). */
export const logCutFromUnread = (client: Database): void => {
  logRestrictive(
    cutFromKept(client),
    (row, why) =>
      `[migrations] 0411: workspace ${row.key}: where it was cut from, ${shown(row.raw ?? "")}, does not read: ${why}; kept as stored, nothing placed: its source does not count its work as landed by it and stays held`
  );
};
