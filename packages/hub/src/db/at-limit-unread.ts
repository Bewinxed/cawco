/**
 * Before migration 0399's SQL runs, the hub's log names every provider whose
 * saved at-limit policy 0399 keeps as `at_limit_unread` (a policy that does
 * not read whole), with why, so the journal of the day it runs records each
 * provider the hub then acts on restrictively for (core
 * `RESTRICTIVE_AT_LIMIT`). Read with 0399's own predicates, over the JSON
 * `at_limit` column as it stands before it.
 */
import type { Database } from "bun:sqlite";
import { COMPACT_METHODS } from "@cawco/core/accounts/kinds";
import { HARNESSES } from "@cawco/core/harness/kinds";

/** One policy field as 0399 reads it: its JSON path, whether it reads there, and what it must be. */
interface Field {
  path: string;
  reads: string;
  wants: string;
}

const listed = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(", ");

/** A whole number from `min` at `path`, as the one writer let it be saved. */
const whole = (path: string, min: number): string =>
  `json_type(at_limit, '${path}') IN ('integer', 'real') AND json_extract(at_limit, '${path}') >= ${min} AND json_extract(at_limit, '${path}') = CAST(json_extract(at_limit, '${path}') AS INTEGER)`;

/** A string of `values` at `path`. */
const oneOf = (path: string, values: readonly string[]): string =>
  `json_type(at_limit, '${path}') = 'text' AND json_extract(at_limit, '${path}') IN (${listed(values)})`;

/** The nine fields of core `AtLimit`, in 0399's order. */
const FIELDS: readonly Field[] = [
  {
    path: "$.move",
    reads: "json_type(at_limit, '$.move') IN ('true', 'false')",
    wants: "true or false",
  },
  {
    path: "$.waitMinutes",
    reads: whole("$.waitMinutes", 0),
    wants: "a whole number from 0",
  },
  {
    path: "$.moveWholeUnderK",
    reads: whole("$.moveWholeUnderK", 0),
    wants: "a whole number from 0",
  },
  {
    path: "$.staleAfterHours",
    reads: whole("$.staleAfterHours", 1),
    wants: "a whole number from 1",
  },
  {
    path: "$.compaction.atLimit",
    reads: oneOf("$.compaction.atLimit", COMPACT_METHODS),
    wants: COMPACT_METHODS.join(", "),
  },
  {
    path: "$.compaction.beforeMove",
    reads: oneOf("$.compaction.beforeMove", COMPACT_METHODS),
    wants: COMPACT_METHODS.join(", "),
  },
  {
    path: "$.compaction.fileRoom",
    // 0361 placed a `fileAtPct` of 0 as a room of 0: filing off.
    reads: `(${whole("$.compaction.fileRoom", 0)}) OR (json_type(at_limit, '$.compaction.fileRoom') IS NULL AND json_type(at_limit, '$.compaction.fileAtPct') IN ('integer', 'real') AND json_extract(at_limit, '$.compaction.fileAtPct') = 0)`,
    wants: "a whole number from 0",
  },
  {
    path: "$.compaction.summarizer.harness",
    reads: oneOf("$.compaction.summarizer.harness", HARNESSES),
    wants: HARNESSES.join(", "),
  },
  {
    path: "$.compaction.summarizer.model",
    reads:
      "json_type(at_limit, '$.compaction.summarizer.model') = 'text' AND length(json_extract(at_limit, '$.compaction.summarizer.model')) > 0",
    wants: "a model's name",
  },
];

/** A stored policy that is a JSON object; the fields' predicates run only inside it. */
const OBJECT =
  "CASE WHEN json_valid(at_limit) THEN json_type(at_limit) = 'object' ELSE 0 END";

/** A policy 0399 reads whole: an object whose nine fields each read. */
const POLICY_READS = `CASE WHEN ${OBJECT} THEN ${FIELDS.map((field) => `coalesce((${field.reads}), 0)`).join(" AND ")} ELSE 0 END`;

/** Each field that is not read: its JSON as stored (null when missing), as columns `f0`… */
const BAD_FIELDS = FIELDS.map(
  (field, n) =>
    `CASE WHEN ${OBJECT} AND NOT coalesce((${field.reads}), 0) THEN CASE WHEN json_type(at_limit, '${field.path}') IS NULL THEN 'missing' ELSE json_quote(json_extract(at_limit, '${field.path}')) END END AS f${n}`
).join(", ");

interface Unread {
  json: number;
  object: number;
  provider: string;
  raw: string;
  [field: `f${number}`]: string | null;
}

/** Why a policy does not read, in a clause: what is wrong with it. */
const why = (row: Unread): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  if (row.object === 0) {
    return "it is not an object of the policy's fields";
  }
  return FIELDS.flatMap((field, n) => {
    const bad = row[`f${n}`];
    const name = field.path.slice(2);
    if (!bad) {
      return [];
    }
    return bad === "missing"
      ? [`${name} is missing`]
      : [`${name} is ${bad}, not ${field.wants}`];
  }).join("; ");
};

/** A value as the log shows it: cut short, on one line. */
const shown = (raw: string): string => JSON.stringify(raw.slice(0, 160));

/** Every provider whose saved policy does not read, by provider. */
const unreadPolicies = (
  client: Database
): { provider: string; raw: string; why: string }[] =>
  client
    .query<Unread, []>(
      `SELECT provider, CAST(at_limit AS TEXT) AS raw, CASE WHEN json_valid(at_limit) THEN 1 ELSE 0 END AS json, ${OBJECT} AS object, ${BAD_FIELDS} FROM account_routing WHERE NOT (${POLICY_READS}) ORDER BY provider`
    )
    .all()
    .map((row) => ({ provider: row.provider, raw: row.raw, why: why(row) }));

/** Logs every at-limit policy 0399 keeps as not read, one line each. Run only in a start that applies 0399 (db/migrate.ts). */
export const logAtLimitUnread = (client: Database): void => {
  for (const row of unreadPolicies(client)) {
    console.info(
      `[migrations] 0399: ${row.provider}'s saved at-limit policy ${shown(row.raw)} does not read: ${row.why}; the hub moves, compacts and files nothing by itself for it until it is saved again`
    );
  }
};
