/**
 * Before migration 0409's SQL runs, the hub's log names every preview pass
 * whose stored scope (`preview_passes.scope`, the origins a session's pass
 * opens, as JSON) 0409 keeps as `scope_unread`: a scope that is there and
 * does not read whole as a list of origin keys, with why. Such a pass opens
 * no origin from then on, and its browser enters again with a fresh ticket.
 *
 * The predicate below is 0409's own: its SQL was written from it, over the
 * JSON column as it stands before it. {@link passScopesKept} reads every
 * pass with it, for the count taken on a copy before 0409 runs
 * (scripts/asks-passes.ts).
 *
 * Its JSON functions sit inside a CASE that has proved `scope` JSON and a
 * list: SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { shown } from "./json-reads";

/** The scope reads whole, as the hub read it (`z.array(z.string())`): a JSON list whose every entry is text. Null (never set) does not. */
const SCOPE_READS =
  "CASE WHEN json_valid(scope) THEN CASE WHEN json_type(scope) = 'array' THEN NOT EXISTS (SELECT 1 FROM json_each(scope) e WHERE e.type <> 'text') ELSE 0 END ELSE 0 END";

/**
 * What a pass's scope is to 0409, as today's reader (preview-access.ts
 * `opens`) read it: never set (null), it opens every origin, the person's
 * pass and, should one be stored so, a session's alike; a list it opens
 * those origins; one that does not read opens none.
 */
export type ScopeReading =
  | { kind: "every" }
  | { kind: "placed"; origins: number }
  | { kind: "unread"; why: string };

/** One pass 0409 reads: its id, whose it is, its scope as stored, and what 0409 makes of it. */
export interface KeptScope {
  id: string;
  /** The session it was given to; null for the person's. */
  instanceId: string | null;
  raw: string | null;
  reading: ScopeReading;
}

interface Row {
  array: number | null;
  id: string;
  instanceId: string | null;
  json: number | null;
  origins: number | null;
  raw: string | null;
  reads: number;
}

const readingOf = (row: Row): ScopeReading => {
  if (row.raw === null) {
    return { kind: "every" };
  }
  if (row.reads) {
    return { kind: "placed", origins: row.origins ?? 0 };
  }
  if (row.json === 0) {
    return { kind: "unread", why: "it is not JSON" };
  }
  return {
    kind: "unread",
    why:
      row.array === 0
        ? "it is not a list"
        : "an entry of it is not an origin's key",
  };
};

/** Every pass's scope as 0409 reads it. Run on a database 0409 has not run on. */
export const passScopesKept = (client: Database): KeptScope[] =>
  client
    .query<Row, []>(
      `SELECT id, instance_id AS instanceId, CAST(scope AS TEXT) AS raw, ${SCOPE_READS} AS reads, CASE WHEN scope IS NULL THEN NULL WHEN json_valid(scope) THEN 1 ELSE 0 END AS json, CASE WHEN json_valid(scope) THEN json_type(scope) = 'array' END AS array, CASE WHEN ${SCOPE_READS} THEN (SELECT count(DISTINCT e.value) FROM json_each(scope) e) END AS origins FROM preview_passes ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      instanceId: row.instanceId,
      raw: row.raw,
      reading: readingOf(row),
    }));

/** Logs every scope 0409 keeps as not read, one line each. Run only in a start that applies 0409 (db/migrate.ts). */
export const logPassScopesUnread = (client: Database): void => {
  for (const pass of passScopesKept(client)) {
    if (pass.reading.kind !== "unread" || pass.raw === null) {
      continue;
    }
    const whose = pass.instanceId
      ? `session ${pass.instanceId}'s`
      : "the person's";
    console.info(
      `[migrations] 0409: preview pass ${pass.id} (${whose}): its scope ${shown(pass.raw)} does not read: ${pass.reading.why}; it opens no origin, and its browser enters again with a fresh ticket`
    );
  }
};
