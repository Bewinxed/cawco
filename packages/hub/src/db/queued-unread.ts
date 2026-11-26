/**
 * Before migration 0405's SQL runs, the hub's log names every queued
 * delegate whose kept call 0405 holds as `queued_work_items.request_unread`,
 * and every queued attempt whose kept ask it holds as
 * `queued_task_starts.asked_unread`, with why, so the journal of the day it
 * runs records each queued start the hub will not make because it cannot
 * read what was asked. Read with 0405's own predicates ({@link READS}), over
 * the two JSON columns as they stand before it; the reasons are what the
 * columns' schemas say of each value.
 *
 * `scripts/queued-requests.ts` reads a database's queued rows with the same
 * predicates, read-only, before 0405 has run on it.
 */
import type { Database } from "bun:sqlite";
import { HARNESSES } from "@cawco/core/harness/kinds";
import { LANDS_MODES } from "@cawco/core/injected";
import type { z } from "zod";
import { undeclaredKeys } from "../stored-json";
import { shown } from "./json-reads";
import { AttemptAskSchema, QueuedRequestSchema } from "./stored-shapes";

/** How one field of a kept call reads, as stored-types.ts `DelegateCall` declares it. */
type Kind =
  "text" | "texts" | "flag" | "list" | "budget" | { oneOf: readonly string[] };

/** One field of a kept call: its key, how it reads, and whether it must be there. */
interface Field {
  key: string;
  kind: Kind;
  required?: true;
}

/** Every field of `DelegateCall`, as 0405 reads it. */
const CALL: readonly Field[] = [
  { key: "account", kind: "text" },
  { key: "budget", kind: "budget" },
  { key: "clean", kind: "flag" },
  { key: "cwd", kind: "text" },
  { key: "fork", kind: "flag" },
  { key: "from", kind: "text" },
  { key: "group", kind: "text" },
  { key: "harness", kind: { oneOf: HARNESSES } },
  { key: "host", kind: "flag" },
  { key: "inputs", kind: "list" },
  { key: "lands", kind: { oneOf: LANDS_MODES } },
  { key: "machineId", kind: "text" },
  { key: "mayStart", kind: "texts" },
  { key: "model", kind: "text" },
  { key: "outputs", kind: "texts" },
  { key: "owns", kind: "texts" },
  { key: "parentInstanceId", kind: "text", required: true },
  { key: "prompt", kind: "text", required: true },
  { key: "skills", kind: "texts" },
  { key: "title", kind: "text", required: true },
  { key: "type", kind: "text" },
  { key: "workspace", kind: "text" },
];

/** The fields named, from {@link CALL}. */
const fieldsOf = (keys: readonly string[]): Field[] =>
  CALL.filter((field) => keys.includes(field.key));

/** `QueuedRequest`: the call but its owned globs, which are rows. */
const QUEUED_REQUEST = CALL.filter((field) => field.key !== "owns");

/** `AttemptAsk`: what a call naming its task asks of the attempt. */
const ATTEMPT_ASK = fieldsOf([
  "account",
  "budget",
  "fork",
  "from",
  "group",
  "harness",
  "inputs",
  "lands",
  "mayStart",
  "model",
  "outputs",
  "owns",
  "prompt",
  "skills",
  "title",
  "type",
]);

const quoted = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(", ");

/**
 * Whether `field` of `column` reads. Each JSON function on a part of the
 * value runs inside a CASE that proved that part's type: SQLite may run the
 * right side of an AND first.
 */
const fieldReads = (column: string, { key, kind, required }: Field): string => {
  const type = `json_type(${column}, '$.${key}')`;
  const absent = required ? "0" : "1";
  if (kind === "text") {
    return `CASE WHEN ${type} IS NULL THEN ${absent} ELSE ${type} = 'text' END`;
  }
  if (kind === "flag") {
    return `CASE WHEN ${type} IS NULL THEN ${absent} ELSE ${type} IN ('true', 'false') END`;
  }
  if (kind === "list") {
    return `CASE WHEN ${type} IS NULL THEN ${absent} ELSE ${type} = 'array' END`;
  }
  if (kind === "texts") {
    return `CASE WHEN ${type} IS NULL THEN ${absent} WHEN ${type} = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(${column}, '$.${key}') e WHERE e.type <> 'text') ELSE 0 END`;
  }
  if (kind === "budget") {
    return `CASE WHEN ${type} IS NULL THEN ${absent} WHEN ${type} = 'object' THEN NOT EXISTS (SELECT 1 FROM json_each(${column}, '$.${key}') e WHERE e.key NOT IN ('usd', 'turns', 'minutes') OR e.type NOT IN ('integer', 'real')) ELSE 0 END`;
  }
  return `CASE WHEN ${type} IS NULL THEN ${absent} WHEN ${type} = 'text' THEN json_extract(${column}, '$.${key}') IN (${quoted(kind.oneOf)}) ELSE 0 END`;
};

/**
 * A kept value 0405 reads whole: JSON, an object, every key one its type
 * declares, every field of its kind and the required ones there. A key its
 * type does not declare is a part that does not read: the column's read
 * would drop it without a word (a budget's `dollars` read as no limit).
 */
const readsAs = (column: string, fields: readonly Field[]): string =>
  `CASE WHEN json_valid(${column}) THEN CASE WHEN json_type(${column}) = 'object' THEN coalesce(NOT EXISTS (SELECT 1 FROM json_each(${column}) e WHERE e.key NOT IN (${quoted(fields.map((field) => field.key))})) AND ${fields.map((field) => `(${fieldReads(column, field)})`).join(" AND ")}, 0) ELSE 0 END ELSE 0 END`;

/** 0405's predicates: a queued delegate's kept call reads, and a queued attempt's kept ask reads. */
const READS = {
  request: readsAs("`request`", QUEUED_REQUEST),
  asked: readsAs("`asked`", ATTEMPT_ASK),
} as const;

/** A queued row, by what names it, with its kept value as stored. */
export interface QueuedKept {
  id: string;
  raw: string;
  reads: boolean;
  /** `queued_work_items` by its id, or `queued_task_starts` by its project and task. */
  table: "queued_work_items" | "queued_task_starts";
}

/** Why `raw` does not read as `schema`'s type, in a clause: what its schema says of it. */
const whyUnread = (schema: z.ZodType, raw: string): string => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "it is not JSON";
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues
      .map(
        (issue) =>
          `${issue.path.map(String).join(".") || "the whole"}: ${issue.message.toLowerCase()}`
      )
      .join("; ");
  }
  const undeclared = undeclaredKeys(schema, value, parsed.data);
  return undeclared.length > 0
    ? `it holds ${undeclared.map((one) => one.key).join(", ")}, which its type does not declare`
    : "it does not read as its type";
};

/** Every queued row with a kept value, oldest first, each with whether 0405 reads it. */
export const queuedKept = (client: Database): QueuedKept[] => [
  ...client
    .query<{ id: string; raw: string; reads: number }, []>(
      `SELECT id, CAST(request AS TEXT) AS raw, ${READS.request} AS reads FROM queued_work_items ORDER BY queued_at, id`
    )
    .all()
    .map((row) => ({
      table: "queued_work_items" as const,
      id: row.id,
      raw: row.raw,
      reads: row.reads === 1,
    })),
  ...client
    .query<{ id: string; raw: string; reads: number }, []>(
      `SELECT project_id || '/' || task_id AS id, CAST(asked AS TEXT) AS raw, ${READS.asked} AS reads FROM queued_task_starts WHERE asked IS NOT NULL ORDER BY queued_at, project_id, task_id`
    )
    .all()
    .map((row) => ({
      table: "queued_task_starts" as const,
      id: row.id,
      raw: row.raw,
      reads: row.reads === 1,
    })),
];

/** What a kept value that does not read is held as, and why. */
export const heldWhy = (row: QueuedKept): string =>
  row.table === "queued_work_items"
    ? `queued delegate ${row.id} is held, never started: its kept call ${shown(row.raw)} does not read as a QueuedRequest: ${whyUnread(QueuedRequestSchema, row.raw)}`
    : `queued attempt at ${row.id} is held, never started: its kept ask ${shown(row.raw)} does not read as an AttemptAsk: ${whyUnread(AttemptAskSchema, row.raw)}`;

/** Logs every queued row 0405 holds, one line each. Run only in a start that applies 0405 (db/migrate.ts). */
export const logQueuedUnread = (client: Database): void => {
  for (const row of queuedKept(client)) {
    if (!row.reads) {
      console.info(`[migrations] 0405: ${heldWhy(row)}`);
    }
  }
};
