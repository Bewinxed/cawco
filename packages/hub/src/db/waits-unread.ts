/**
 * Before migration 0427's SQL runs, the hub's log names every work item
 * whose stored witnesses (`work_items.waited_on`, JSON: each card or pin its
 * task waited on as it was dispatched, with the value it settled with) 0427
 * keeps as not read: a value that is there and does not read whole as the
 * hub read it, with why and how many of its entries are placed.
 *
 * The predicates below are 0427's own: its SQL was written from them, over
 * the JSON column as it stands before it. {@link WITNESSES} is the column's
 * shape as the hub read it then, frozen here; {@link ENTRY_PLACED} is the
 * test each entry is placed by. {@link waitsKept} reads every row with them,
 * for the count taken on a copy before 0427 runs
 * (scripts/cold-waits-heads.ts).
 *
 * Every JSON function sits inside a CASE that has proved its argument JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first. An
 * entry's own JSON is `e.value` when `e.type` is 'object'; any other entry
 * is read no further.
 */
import type { Database } from "bun:sqlite";
import { listOf, object, readsWhole, TEXT } from "./json-reads";
import { shown } from "./lifted-reading";

/** An attempt's witnesses, as `work_items.waited_on` held them (core `WaitWitness`). */
const WITNESSES = listOf(object({ target: TEXT, value: TEXT }));

/** The witnesses read whole as their shape. */
const SHAPE_READ = readsWhole("waited_on", WITNESSES);

/** The list 0427 walks: `waited_on` when it is a JSON list, else an empty one. */
const WITNESS_LIST =
  "CASE WHEN json_valid(waited_on) THEN CASE WHEN json_type(waited_on) = 'array' THEN waited_on ELSE '[]' END ELSE '[]' END";

/** Entry `e` of {@link WITNESS_LIST} is a witness: an object whose target and value are text. */
const witness = (e: string): string =>
  `CASE WHEN ${e}.type = 'object' THEN coalesce(json_type(${e}.value, '$.target') = 'text' AND json_type(${e}.value, '$.value') = 'text', 0) ELSE 0 END`;

/**
 * Entry `d` names entry `e`'s target and does not settle it with the same
 * value: a value that differs, or none that reads. Read only where `e` is a
 * witness.
 */
const contradicts = (d: string, e: string): string =>
  `CASE WHEN ${d}.type = 'object' THEN coalesce(json_type(${d}.value, '$.target') = 'text' AND json_extract(${d}.value, '$.target') = json_extract(${e}.value, '$.target') AND NOT coalesce(json_type(${d}.value, '$.value') = 'text' AND json_extract(${d}.value, '$.value') = json_extract(${e}.value, '$.value'), 0), 0) ELSE 0 END`;

/**
 * Entry `e` is placed: a witness no other entry contradicts. A target kept
 * twice with one value is placed once; one kept with two values, or beside
 * an entry that does not read, is placed not at all: which value the
 * attempt was dispatched on is not known.
 */
const ENTRY_PLACED = `CASE WHEN ${witness("e")} THEN NOT EXISTS (SELECT 1 FROM json_each(${WITNESS_LIST}) d WHERE d.id <> e.id AND ${contradicts("d", "e")}) ELSE 0 END`;

/** The witnesses read whole: their shape holds, and no entry is left unplaced. */
const WAITS_READ = `CASE WHEN ${SHAPE_READ} THEN NOT EXISTS (SELECT 1 FROM json_each(${WITNESS_LIST}) e WHERE NOT (${ENTRY_PLACED})) ELSE 0 END`;

/** What a stored list of witnesses is to 0427. */
export type WaitsReading =
  /** Never set, or empty: the attempt waited on no card or pin. */
  | { kind: "never" }
  /** It reads whole: each witness placed. */
  | { kind: "placed"; placed: number }
  /** It does not read whole: kept as stored, `placed` of its entries placed. */
  | { kind: "unread"; placed: number; why: string };

/** One work item as 0427 reads it: its id and state, its witnesses as stored, and what 0427 makes of them. */
export interface KeptWaits {
  id: string;
  raw: string | null;
  reading: WaitsReading;
  state: string;
}

interface Row {
  id: string;
  json: number | null;
  list: number | null;
  placed: number;
  raw: string | null;
  reads: number;
  shape: number;
  size: number;
  state: string;
}

const whyOf = (row: Row): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (!row.list) {
    return "it is not a list";
  }
  return row.shape
    ? "a card or pin is kept with two values"
    : "an entry is not a card or pin (text) with the value it settled with (text)";
};

const readingOf = (row: Row): WaitsReading => {
  if (row.raw === null || (row.reads && row.size === 0)) {
    return { kind: "never" };
  }
  if (row.reads) {
    return { kind: "placed", placed: row.placed };
  }
  return { kind: "unread", placed: row.placed, why: whyOf(row) };
};

/** Every work item's witnesses as 0427 reads them. Run on a database 0427 has not run on. */
export const waitsKept = (client: Database): KeptWaits[] =>
  client
    .query<Row, []>(
      `SELECT id, state, CAST(waited_on AS TEXT) AS raw, CASE WHEN waited_on IS NULL THEN NULL WHEN json_valid(waited_on) THEN 1 ELSE 0 END AS json, CASE WHEN json_valid(waited_on) THEN json_type(waited_on) = 'array' END AS list, ${SHAPE_READ} AS shape, CASE WHEN waited_on IS NULL THEN 1 ELSE ${WAITS_READ} END AS reads, (SELECT count(DISTINCT CASE WHEN ${ENTRY_PLACED} THEN json_extract(e.value, '$.target') END) FROM json_each(${WITNESS_LIST}) e) AS placed, (SELECT count(*) FROM json_each(${WITNESS_LIST})) AS size FROM work_items ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      state: row.state,
      raw: row.raw,
      reading: readingOf(row),
    }));

/** Logs every list of witnesses 0427 keeps as not read, one line each. Run only in a start that applies 0427 (db/migrate.ts). */
export const logWaitsUnread = (client: Database): void => {
  for (const item of waitsKept(client)) {
    if (item.reading.kind !== "unread" || item.raw === null) {
      continue;
    }
    console.info(
      `[migrations] 0427: work item ${item.id} (${item.state}): what it was dispatched on ${shown(item.raw)} does not read: ${item.reading.why}; kept as not read, ${item.reading.placed} of its cards and pins placed, and each other one its task waits on counts as possibly decided differently since`
    );
  }
};
