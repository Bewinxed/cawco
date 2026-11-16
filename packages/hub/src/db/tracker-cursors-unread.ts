/**
 * Before migration 0431's SQL runs, the hub's log names every tracker
 * binding whose stored cursor (`tracker_bindings.cursor`, where its poll of
 * the tracker stands) 0431 keeps as not read: a cursor that does not read
 * whole, with why. A list (issues, or their comments) whose `since` and
 * ETag read is placed; one that does not starts again from when the
 * project was bound, with no ETag, so its next poll reads again what it may
 * already have read and skips nothing.
 *
 * The predicates below are 0431's own: its SQL was written from them, over
 * the JSON column as it stands before it. {@link CURSOR} is the column's
 * shape as the hub read it then (stored/columns.json,
 * `tracker_bindings.cursor`), frozen here. {@link trackerCursorsKept}
 * reads every binding with it, for the count taken on a copy before 0431
 * runs (scripts/compaction-decides-tracker-readings.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
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
  TEXT_OR_NULL,
} from "./json-reads";

/** The issues' list: the newest change taken in, ms, and its ETag. */
const ISSUES = object({ since: NUMBER, etag: TEXT_OR_NULL });

/** The comments' list: the newest comment taken in, ms, and its ETag. */
const COMMENTS = object({ commentsSince: NUMBER, commentsEtag: TEXT_OR_NULL });

/** `tracker_bindings.cursor` as the hub read it (hub `TrackerCursor`). */
const CURSOR = object({
  since: NUMBER,
  etag: TEXT_OR_NULL,
  commentsSince: NUMBER,
  commentsEtag: TEXT_OR_NULL,
});

/** The cursor reads whole. */
const CURSOR_READS = readsWhole("cursor", CURSOR);

/** The issues' list reads: its `since` and ETag, placed together. */
const ISSUES_READ = readsWhole("cursor", ISSUES);

/** The comments' list reads: its `since` and ETag, placed together. */
const COMMENTS_READ = readsWhole("cursor", COMMENTS);

/** A binding as 0431 reads its cursor, with which list reads. */
interface Row extends LiftedRow {
  comments: number;
  issues: number;
}

/** Why a cursor that is an object does not read: the list or lists that do not. */
const listsOff = (row: Row): string[] => [
  ...(row.issues
    ? []
    : [
        "its issues' since or ETag does not read, so issues are read again from when it was bound",
      ]),
  ...(row.comments
    ? []
    : [
        "its comments' since or ETag does not read, so comments are read again from when it was bound",
      ]),
];

/** Every binding's cursor as 0431 reads it, by project. Run on a database 0431 has not run on. */
export const trackerCursorsKept = (client: Database): Lifted[] =>
  liftedRows<Row>(
    client,
    `SELECT project_id AS key, ${liftedColumns("cursor", CURSOR_READS)}, ${ISSUES_READ} AS issues, ${COMMENTS_READ} AS comments FROM tracker_bindings ORDER BY project_id`,
    listsOff
  );

/** Logs every cursor 0431 keeps as not read, one line each. Run only in a start that applies 0431 (db/migrate.ts). */
export const logTrackerCursorsUnread = (client: Database): void => {
  logRestrictive(
    trackerCursorsKept(client),
    (row, why) =>
      `[migrations] 0431: project ${row.key}: its tracker's cursor ${shown(row.raw ?? "")} does not read: ${why}; kept as stored, its next poll reads again and skips nothing`
  );
};
