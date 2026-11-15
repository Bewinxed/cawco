/**
 * Before migration 0426's SQL runs, the hub's log names every work item
 * whose stored waits since its last delivered message
 * (`work_items.wait_history`, JSON: how many, and the last one's end and
 * reason) 0426 keeps as not read: a value that is there and does not read
 * whole as the hub read it, with why.
 *
 * The predicate below is 0426's own: its SQL was written from it, over the
 * JSON column as it stands before it. {@link HISTORY} is the column's shape
 * as the hub read it then, frozen here. {@link waitHistoryKept} reads every
 * row with it, for the count taken on a copy before 0426 runs
 * (scripts/cold-waits-heads.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { inJson, NUMBER, object, readsWhole, TEXT } from "./json-reads";
import { shown } from "./lifted-reading";

/** An item's waits since its last delivered message, as `work_items.wait_history` held them. */
const HISTORY = object({ count: NUMBER, reason: TEXT, until: NUMBER });

/** The waits read whole. */
const HISTORY_READ = readsWhole("wait_history", HISTORY);

/**
 * The last wait's end and reason are the live wait's own: `wait_until` and
 * `wait_reason`, which 0426 does not copy. Read only on a history that
 * reads whole.
 */
const HISTORY_LIVE = inJson(
  "wait_history",
  "wait_until IS NOT NULL AND wait_until = json_extract(wait_history, '$.until') AND wait_reason IS NOT NULL AND wait_reason = json_extract(wait_history, '$.reason')"
);

/** What a stored history is to 0426. */
export type HistoryReading =
  /** Never set: no wait since the last delivered message. */
  | { kind: "never" }
  /** It reads whole: its count placed, and its last wait unless that is the live one. */
  | { kind: "placed"; live: boolean }
  /** It does not read whole: kept as stored, none of it placed. */
  | { kind: "unread"; why: string };

/** One work item as 0426 reads it: its id and state, its history as stored, and what 0426 makes of it. */
export interface KeptHistory {
  id: string;
  raw: string | null;
  reading: HistoryReading;
  state: string;
}

interface Row {
  id: string;
  json: number | null;
  live: number | null;
  raw: string | null;
  reads: number;
  state: string;
}

const readingOf = (row: Row): HistoryReading => {
  if (row.raw === null) {
    return { kind: "never" };
  }
  if (row.reads) {
    return { kind: "placed", live: row.live === 1 };
  }
  return {
    kind: "unread",
    why:
      row.json === 0
        ? "it is not JSON"
        : "it is not a count (a number) with the last wait's end (a number) and reason (text)",
  };
};

/** Every work item's waits as 0426 reads them. Run on a database 0426 has not run on. */
export const waitHistoryKept = (client: Database): KeptHistory[] =>
  client
    .query<Row, []>(
      `SELECT id, state, CAST(wait_history AS TEXT) AS raw, CASE WHEN wait_history IS NULL THEN NULL WHEN json_valid(wait_history) THEN 1 ELSE 0 END AS json, ${HISTORY_READ} AS reads, CASE WHEN ${HISTORY_READ} THEN ${HISTORY_LIVE} END AS live FROM work_items ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      state: row.state,
      raw: row.raw,
      reading: readingOf(row),
    }));

/** Logs every history 0426 keeps as not read, one line each. Run only in a start that applies 0426 (db/migrate.ts). */
export const logWaitHistoryUnread = (client: Database): void => {
  for (const item of waitHistoryKept(client)) {
    if (item.reading.kind !== "unread" || item.raw === null) {
      continue;
    }
    console.info(
      `[migrations] 0426: work item ${item.id} (${item.state}): its waits since its last delivered message ${shown(item.raw)} do not read: ${item.reading.why}; kept as not read, none counted, and its parent's next message says they do not read`
    );
  }
};
