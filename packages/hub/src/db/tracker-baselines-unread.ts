/**
 * Before migration 0407's SQL runs, the hub's log names every task whose
 * stored tracker baseline (`tracker_links.synced`, what the task and its
 * issue last agreed on) 0407 keeps as `synced_unread`: a baseline that is
 * there and does not read whole, with why and what of it is placed. The
 * journal of the day it runs records each link whose merge is then held.
 * Read with 0407's own predicates (the builders below, which 0407's SQL was
 * written from: it places each field whose type here is text, or a list for
 * labels, and each label that is text), over the JSON column as it stands
 * before it.
 * {@link trackerBaselinesKept} reads every link, and {@link baselinesUnset}
 * every task with no baseline yet, for the count taken on a copy before
 * 0407 runs.
 *
 * Each JSON function sits inside a CASE that has proved `synced` JSON and an
 * object: SQLite may run the right side of an AND first, so an AND would not
 * keep them off a value that is not JSON.
 */
import type { Database } from "bun:sqlite";
import { shown } from "./json-reads";

/** `synced` is a JSON object. */
const OBJECT =
  "CASE WHEN json_valid(synced) THEN json_type(synced) = 'object' ELSE 0 END";

/** `expression` over `synced`, only once it is a JSON object; null otherwise. */
const inObject = (expression: string): string =>
  `CASE WHEN ${OBJECT} THEN ${expression} END`;

/** The JSON type of a key of the baseline; null when it is missing or the baseline is no object. */
const typeOf = (key: string): string =>
  inObject(`json_type(synced, '$.${key}')`);

/** The text fields every baseline holds, in their columns' order. */
const TEXT_FIELDS = ["title", "description", "stage", "state"] as const;

/** A list of labels each of which is text, as the labels' type and the count of entries that are not. */
const LABELS_OFF = inObject(
  "CASE WHEN json_type(synced, '$.labels') = 'array' THEN (SELECT count(*) FROM json_each(synced, '$.labels') e WHERE e.type <> 'text') END"
);

/**
 * The baseline reads whole, as the hub's reader read it (`TrackerSynced`):
 * an object with title, description, stage and state text, labels a list of
 * text, and status text, null or missing. A key nothing reads is ignored.
 */
const BASELINE_READS = `CASE WHEN json_valid(synced) THEN CASE WHEN json_type(synced) = 'object' THEN coalesce(${TEXT_FIELDS.map((key) => `json_type(synced, '$.${key}') = 'text'`).join(" AND ")} AND CASE WHEN json_type(synced, '$.labels') = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(synced, '$.labels') e WHERE e.type <> 'text') ELSE 0 END AND (json_type(synced, '$.status') IS NULL OR json_type(synced, '$.status') IN ('null', 'text')), 0) ELSE 0 END ELSE 0 END`;

/** What a stored baseline is to 0407. */
type Reading =
  /** It reads whole and is placed as it is. */
  | { kind: "placed" }
  /** It does not read whole: kept as stored, what reads placed beside it, the link's merge held. */
  | { kind: "held"; placed: string[]; why: string };

/** One link 0407 reads: `project/task`, its baseline as stored, and what 0407 makes of it. */
export interface Kept {
  key: string;
  raw: string;
  reading: Reading;
}

/** A link as 0407 reads it: each field by its JSON type (null when missing), the labels' entries that are not text. */
interface Row {
  description: string | null;
  json: number;
  key: string;
  labels: string | null;
  labelsOff: number | null;
  object: number;
  raw: string;
  reads: number;
  stage: string | null;
  state: string | null;
  status: string | null;
  title: string | null;
}

/** The fields of a baseline 0407 places, in its columns' order. */
const placedOf = (row: Row): string[] => [
  ...TEXT_FIELDS.filter((key) => row[key] === "text"),
  ...(row.labels === "array" ? ["labels"] : []),
  ...(row.status === "text" ? ["status"] : []),
];

/** Why a baseline's labels do not read, when they do not. */
const labelsWhy = (row: Row): string[] => {
  if (row.labels !== "array") {
    return [`labels is ${row.labels === null ? "missing" : "not a list"}`];
  }
  const off = row.labelsOff ?? 0;
  return off > 0
    ? [`${off} of its labels ${off === 1 ? "is" : "are"} not text`]
    : [];
};

/** Why a baseline does not read, in a clause: every field that does not, and what it must be. */
const whyOf = (row: Row): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object === 0) {
    return "it is not an object";
  }
  const off = [
    ...TEXT_FIELDS.filter((key) => row[key] !== "text").map(
      (key) => `${key} is ${row[key] === null ? "missing" : "not text"}`
    ),
    ...labelsWhy(row),
    ...(row.status === null || row.status === "null" || row.status === "text"
      ? []
      : ["status is not text or null"]),
  ];
  return off.join(", ");
};

/** Every link's baseline as 0407 reads it, by `project/task`. Run on a database 0407 has not run on. */
export const trackerBaselinesKept = (client: Database): Kept[] =>
  client
    .query<Row, []>(
      `SELECT project_id || '/' || task_id AS key, CAST(synced AS TEXT) AS raw, CASE WHEN json_valid(synced) THEN 1 ELSE 0 END AS json, ${OBJECT} AS object, ${BASELINE_READS} AS reads, ${TEXT_FIELDS.map((key) => `${typeOf(key)} AS ${key}`).join(", ")}, ${typeOf("labels")} AS labels, ${LABELS_OFF} AS labelsOff, ${typeOf("status")} AS status FROM tracker_links ORDER BY project_id, task_id`
    )
    .all()
    .map((row) => ({
      key: row.key,
      raw: row.raw,
      reading: row.reads
        ? { kind: "placed" }
        : { kind: "held", placed: placedOf(row), why: whyOf(row) },
    }));

/**
 * Every task with no baseline yet, by `project/task`: a record link
 * (`issue:`) in a project bound to a tracker with no `tracker_links` row.
 * 0407 changes nothing of them; the next sync links each again from the
 * task as it stands, as before (sync.ts `relink`).
 */
export const baselinesUnset = (client: Database): string[] =>
  client
    .query<{ key: string }, []>(
      "SELECT l.project_id || '/' || l.task_id AS key FROM task_links l JOIN tracker_bindings b ON b.project_id = l.project_id WHERE l.mode = 'record' AND NOT EXISTS (SELECT 1 FROM tracker_links t WHERE t.project_id = l.project_id AND t.task_id = l.task_id) ORDER BY l.project_id, l.task_id"
    )
    .all()
    .map((row) => row.key);

/** Logs every baseline 0407 keeps as not read, one line each. Run only in a start that applies 0407 (db/migrate.ts). */
export const logTrackerBaselinesUnread = (client: Database): void => {
  for (const kept of trackerBaselinesKept(client)) {
    const { reading } = kept;
    if (reading.kind !== "held") {
      continue;
    }
    const placed =
      reading.placed.length > 0
        ? `${reading.placed.join(", ")} placed`
        : "none of it placed";
    console.info(
      `[migrations] 0407: task ${kept.key}: its tracker baseline ${shown(kept.raw)} does not read: ${reading.why}; ${placed}; its sync with its issue is held until a sync finds the two agreeing`
    );
  }
};
