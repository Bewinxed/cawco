/**
 * Before migration 0408's SQL runs, the hub's log names every ask whose
 * stored record (`asks.record`, the whole ask as JSON) 0408 keeps as
 * `record_unread`: a record that is there and does not read whole as the
 * hub read it (core asks.ts `ASK_RECORD`, the shape the column held), with
 * why and what of it 0408 places. The journal of the day it runs records
 * each ask the hub will not read as an ask from then on.
 *
 * The predicates below are 0408's own: its SQL was written from them, over
 * the JSON column as it stands before it (its first step keeps
 * `record_unread` by {@link RECORD_READS}, its second places each column by
 * {@link placed} with `record_unread IS NULL` for whether it reads).
 * {@link asksKept} reads every ask with them, for the count taken on a copy
 * before 0408 runs (scripts/asks-passes.ts).
 *
 * Every JSON function sits inside a CASE that has proved `record` JSON and
 * an object: SQLite may run the right side of an AND first, so an AND would
 * not keep one off a value that is not JSON. Inside that CASE every path is
 * read off the proved document, so a key that is missing or of another kind
 * reads as null, never as an error; the entries of a list are read by their
 * own paths (`fullkey`), and an answer's entries by their own JSON once
 * proved a list.
 */
import type { Database } from "bun:sqlite";

/** `record` is a JSON object. */
const OBJECT =
  "CASE WHEN json_valid(record) THEN json_type(record) = 'object' ELSE 0 END";

/** `expression` over `record`, only once it is a JSON object; null otherwise. */
const inObject = (expression: string): string =>
  `CASE WHEN ${OBJECT} THEN ${expression} END`;

/** The JSON type of `path` in the proved record: null when it is missing. */
const typeAt = (path: string): string => `json_type(record, '${path}')`;

/** The value at `path` in the proved record. */
const valueAt = (path: string): string => `json_extract(record, '${path}')`;

/** Each test below holds of the proved record. */
const isText = (path: string): string => `${typeAt(path)} = 'text'`;
const isNumber = (path: string): string =>
  `${typeAt(path)} IN ('integer', 'real')`;
const isObject = (path: string): string => `${typeAt(path)} = 'object'`;
const isFlag = (path: string): string => `${typeAt(path)} IN ('true', 'false')`;
const isOneOf = (path: string, values: readonly string[]): string =>
  `(${isText(path)} AND ${valueAt(path)} IN (${values.map((one) => `'${one}'`).join(", ")}))`;
/** Missing, or what `test` says: an optional field. */
const optional = (path: string, test: string): string =>
  `(${typeAt(path)} IS NULL OR ${test})`;
/** Every entry of the list at `path` holds `entry`, read off the entry's own path `<alias>.fullkey`. */
const everyEntry = (path: string, alias: string, entry: string): string =>
  `(${typeAt(path)} = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(record, '${path}') ${alias} WHERE NOT coalesce(${entry}, 0)))`;
/** A test of the entry `alias` of a list, by a path under it. */
const entryType = (alias: string, key = ""): string =>
  `json_type(record, ${alias}.fullkey${key ? ` || '.${key}'` : ""})`;

/** The facts an install's or a link's source carries (core `SOURCE_FACTS`). */
const SOURCE = "$.asked.source";
const SOURCE_READS = `(${isObject(SOURCE)} AND ${isText(`${SOURCE}.at`)} AND ${optional(`${SOURCE}.since`, isText(`${SOURCE}.since`))} AND ${optional(`${SOURCE}.stars`, isNumber(`${SOURCE}.stars`))} AND ${optional(`${SOURCE}.unknown`, isText(`${SOURCE}.unknown`))} AND ${optional(`${SOURCE}.weeklyDownloads`, isNumber(`${SOURCE}.weeklyDownloads`))} AND ${optional(`${SOURCE}.skill`, `(${isObject(`${SOURCE}.skill`)} AND ${isText(`${SOURCE}.skill.description`)} AND ${isText(`${SOURCE}.skill.hash`)} AND ${isText(`${SOURCE}.skill.name`)} AND ${everyEntry(`${SOURCE}.skill.files`, "f", `${entryType("f")} = 'object' AND ${entryType("f", "hash")} = 'text' AND ${entryType("f", "path")} = 'text'`)})`)})`;

/** What an approve ask asks: its tool, its input, who carries it, its source's facts. */
const APPROVE_READS = `${isText("$.asked.tool")} AND ${isObject("$.asked.input")} AND ${isObject("$.asked.carry")} AND ${isOneOf("$.asked.carry.by", ["hub"])} AND ${isText("$.asked.carry.tool")} AND ${optional(SOURCE, SOURCE_READS)}`;

/** A question's options, each a label and a description. */
const OPTIONS_READ = `${entryType("q", "options")} = 'array' AND NOT EXISTS (SELECT 1 FROM json_each(record, q.fullkey || '.options') o WHERE NOT coalesce(${entryType("o")} = 'object' AND ${entryType("o", "label")} = 'text' AND ${entryType("o", "description")} = 'text', 0))`;

/** What a question asks: one or more questions in the house shape, whether work waits, and what waits or goes ahead. */
const QUESTION_READS = `json_array_length(record, '$.asked.questions') >= 1 AND ${everyEntry("$.asked.questions", "q", `${entryType("q")} = 'object' AND ${entryType("q", "header")} = 'text' AND ${entryType("q", "multiSelect")} IN ('true', 'false') AND ${entryType("q", "question")} = 'text' AND ${OPTIONS_READ}`)} AND ${isFlag("$.asked.blocks")} AND ${optional("$.asked.waiting", isText("$.asked.waiting"))} AND ${optional("$.asked.meanwhile", isText("$.asked.meanwhile"))}`;

/** What a permit asks: the harness's tool and its input. */
const PERMIT_READS = `${isText("$.asked.tool")} AND ${isObject("$.asked.input")}`;

/** What was asked, by its kind. */
const ASKED_READS = `${isObject("$.asked")} AND CASE WHEN ${isText("$.asked.kind")} THEN CASE ${valueAt("$.asked.kind")} WHEN 'approve' THEN ${APPROVE_READS} WHEN 'question' THEN ${QUESTION_READS} WHEN 'permit' THEN ${PERMIT_READS} ELSE 0 END ELSE 0 END`;

/** A question's answers: each, by question, a text or a list of texts. */
const ANSWERS_READ = `(${isObject("$.answer.result.answers")} AND NOT EXISTS (SELECT 1 FROM json_each(record, '$.answer.result.answers') a WHERE NOT CASE a.type WHEN 'text' THEN 1 WHEN 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(a.value) x WHERE x.type <> 'text') ELSE 0 END))`;

/** The answer: when, who, and what it came to (an allow with a question's answers, or a deny with its message). */
const ANSWER_READS = `(${isObject("$.answer")} AND ${isNumber("$.answer.at")} AND ${isObject("$.answer.by")} AND ${optional("$.answer.by.behavior", isOneOf("$.answer.by.behavior", ["allow", "deny"]))} AND ${optional("$.answer.by.name", isText("$.answer.by.name"))} AND ${isOneOf("$.answer.by.via", ["page", "app", "session", "harness", "fullSend"])} AND ${isObject("$.answer.result")} AND CASE WHEN ${isText("$.answer.result.behavior")} THEN CASE ${valueAt("$.answer.result.behavior")} WHEN 'allow' THEN ${optional("$.answer.result.answers", ANSWERS_READ)} WHEN 'deny' THEN ${isText("$.answer.result.message")} ELSE 0 END ELSE 0 END)`;

/** The approved call as the hub ran it. */
const CARRIED_READS = `(${isObject("$.carried")} AND ${isNumber("$.carried.startedAt")} AND ${optional("$.carried.endedAt", isNumber("$.carried.endedAt"))} AND ${optional("$.carried.said", isText("$.carried.said"))} AND ${optional("$.carried.failed", isText("$.carried.failed"))})`;

const WITHDRAWN_READS = `(${isObject("$.withdrawn")} AND ${isNumber("$.withdrawn.at")} AND ${isOneOf("$.withdrawn.by", ["hub"])} AND ${isText("$.withdrawn.why")})`;

/** A grant's end, spent or lapsed: when. */
const STAMP_READS = (path: string): string =>
  `(${isObject(path)} AND ${isNumber(`${path}.at`)})`;

/** Each part of a record, by its key, and whether it reads; an optional part may be missing. */
const PARTS: readonly { key: string; reads: string }[] = [
  {
    key: "toolUseId",
    reads: optional("$.toolUseId", isText("$.toolUseId")),
  },
  { key: "asked", reads: `(${ASKED_READS})` },
  {
    key: "routedTo",
    reads: optional("$.routedTo", isOneOf("$.routedTo", ["parent"])),
  },
  { key: "answer", reads: optional("$.answer", ANSWER_READS) },
  { key: "carried", reads: optional("$.carried", CARRIED_READS) },
  { key: "withdrawn", reads: optional("$.withdrawn", WITHDRAWN_READS) },
  { key: "used", reads: optional("$.used", STAMP_READS("$.used")) },
  { key: "lapsed", reads: optional("$.lapsed", STAMP_READS("$.lapsed")) },
];

/**
 * The record reads whole, as the hub read it (core `ASK_RECORD`): an
 * object whose every part reads; a key nothing reads is ignored.
 */
const RECORD_READS = `CASE WHEN json_valid(record) THEN CASE WHEN json_type(record) = 'object' THEN coalesce(${PARTS.map((part) => part.reads).join(" AND ")}, 0) ELSE 0 END ELSE 0 END`;

/** A number at `path`, placed when it is one. */
const numberAt = (path: string): string =>
  inObject(`CASE WHEN ${isNumber(path)} THEN ${valueAt(path)} END`);

/**
 * What 0408 places in each column, from the record as it stands, given
 * `reads`, whether it reads whole: each value that reads, whether or not
 * the whole does; `answer_behavior` is `allow` only on a record that reads
 * whole, never on one kept unread, and `kept`, what stays JSON, only on one
 * that reads whole.
 */
const placed = (reads: string) =>
  ({
    kind: inObject(
      `CASE WHEN ${isOneOf("$.asked.kind", ["approve", "question", "permit"])} THEN ${valueAt("$.asked.kind")} END`
    ),
    routed_to_parent: `coalesce(${inObject(isOneOf("$.routedTo", ["parent"]))}, 0)`,
    answered_at: numberAt("$.answer.at"),
    answer_behavior: inObject(
      `CASE WHEN ${reads} THEN ${valueAt("$.answer.result.behavior")} WHEN ${isOneOf("$.answer.result.behavior", ["deny"])} THEN 'deny' END`
    ),
    carried_started_at: numberAt("$.carried.startedAt"),
    carried_ended_at: numberAt("$.carried.endedAt"),
    withdrawn_at: numberAt("$.withdrawn.at"),
    used_at: numberAt("$.used.at"),
    lapsed_at: numberAt("$.lapsed.at"),
    kept: inObject(
      `CASE WHEN ${reads} THEN json_remove(record, '$.asked.kind', '$.routedTo', '$.answer.at', '$.answer.result.behavior', '$.carried.startedAt', '$.carried.endedAt', '$.withdrawn.at', '$.withdrawn.by', '$.used', '$.lapsed') END`
    ),
  }) as const;

/** What a stored record is to 0408. */
type Reading =
  /** It reads whole and is placed as it is. */
  | { kind: "placed" }
  /** It does not read whole: kept as stored, what reads placed, never read as an ask. */
  | { kind: "unread"; placed: string[]; why: string };

/** One ask 0408 reads: its id, session and state, its record as stored, and what 0408 makes of it. */
export interface KeptAsk {
  id: string;
  instanceId: string;
  raw: string;
  reading: Reading;
  state: string;
}

/** The columns 0408 places beside a record kept unread, as the log names them. */
const PLACEABLE = [
  "kind",
  "routed_to_parent",
  "answered_at",
  "answer_behavior",
  "carried_started_at",
  "carried_ended_at",
  "withdrawn_at",
  "used_at",
  "lapsed_at",
] as const;

/** An ask as 0408 reads it: whether it is JSON and an object, whether each part reads, and what each column gets. */
type Row = {
  id: string;
  instanceId: string;
  json: number;
  object: number;
  raw: string;
  reads: number;
  state: string;
} & Record<`part_${string}`, number | null> &
  Record<(typeof PLACEABLE)[number], unknown>;

/** A value as the log shows it: cut short, on one line. */
const shown = (raw: string): string => JSON.stringify(raw.slice(0, 160));

/** Why a record does not read, in a clause: each part that does not. */
const whyOf = (row: Row): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object === 0) {
    return "it is not an object";
  }
  const off = PARTS.filter((part) => !row[`part_${part.key}`]).map(
    (part) => part.key
  );
  return `${off.join(", ")} ${off.length === 1 ? "does" : "do"} not read`;
};

/** Every ask's record as 0408 reads it, oldest first. Run on a database 0408 has not run on. */
export const asksKept = (client: Database): KeptAsk[] =>
  client
    .query<Row, []>(
      `SELECT id, instance_id AS instanceId, state, CAST(record AS TEXT) AS raw, CASE WHEN json_valid(record) THEN 1 ELSE 0 END AS json, ${OBJECT} AS object, ${RECORD_READS} AS reads, ${PARTS.map((part) => `${inObject(`coalesce(${part.reads}, 0)`)} AS part_${part.key}`).join(", ")}, ${PLACEABLE.map((column) => `${placed(RECORD_READS)[column]} AS ${column}`).join(", ")} FROM asks ORDER BY raised_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      state: row.state,
      raw: row.raw,
      reading: row.reads
        ? { kind: "placed" }
        : {
            kind: "unread",
            placed: PLACEABLE.filter(
              (column) =>
                row[column] !== null &&
                !(column === "routed_to_parent" && row[column] === 0)
            ),
            why: whyOf(row),
          },
    }));

/** Logs every record 0408 keeps as not read, one line each. Run only in a start that applies 0408 (db/migrate.ts). */
export const logAsksUnread = (client: Database): void => {
  for (const ask of asksKept(client)) {
    const { reading } = ask;
    if (reading.kind !== "unread") {
      continue;
    }
    const placedWords =
      reading.placed.length > 0
        ? `${reading.placed.join(", ")} placed`
        : "none of it placed";
    const open =
      ask.state === "open"
        ? "; open, it is withdrawn as the hub starts and its session told"
        : "";
    console.info(
      `[migrations] 0408: ask ${ask.id} of session ${ask.instanceId} (${ask.state}): its record ${shown(ask.raw)} does not read: ${reading.why}; ${placedWords}; never granted, answered or carried${open}`
    );
  }
};
