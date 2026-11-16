/**
 * Before migration 0413's SQL runs, the hub's log names every send whose
 * origin (`sent_messages.body`'s `origin`: who sent it) is there and whose
 * `kind` does not read, which 0413's generated `origin_kind` reads as null:
 * a send from no one, never the person's, a peer's or a keep-alive. Read
 * with 0413's own predicate, over the body as it stands before it.
 * {@link sendOriginsKept} reads every send, for the count taken on a copy
 * before 0413 runs.
 *
 * Each JSON function sits inside a CASE that has proved the body JSON.
 */
import type { Database } from "bun:sqlite";
import { type Lifted, logRestrictive, shown } from "./json-reads";

/** A send as 0413 reads it: its origin as stored, and the JSON types of it and of its kind. */
interface Row {
  json: number;
  key: string;
  kind: string | null;
  origin: string | null;
  raw: string | null;
}

/** What 0413 makes of a send's origin: none (never set), a kind that is text (placed), else read as from no one. */
const readingOf = (row: Row): Lifted["reading"] => {
  if (row.json === 0) {
    return { kind: "restrictive", why: "its body is not JSON" };
  }
  if (row.origin === null) {
    return { kind: "unset" };
  }
  if (row.kind === "text") {
    return { kind: "placed" };
  }
  return {
    kind: "restrictive",
    why:
      row.kind === null
        ? "its origin has no kind"
        : "its origin's kind is not text",
  };
};

/** Every send's origin as 0413 reads it, by `session/uuid`. */
export const sendOriginsKept = (client: Database): Lifted[] =>
  client
    .query<Row, []>(
      "SELECT instance_id || '/' || uuid AS key, CASE WHEN json_valid(body) THEN json_extract(body, '$.origin') ELSE CAST(body AS TEXT) END AS raw, CASE WHEN json_valid(body) THEN 1 ELSE 0 END AS json, CASE WHEN json_valid(body) THEN json_type(body, '$.origin') END AS origin, CASE WHEN json_valid(body) THEN json_type(body, '$.origin.kind') END AS kind FROM sent_messages ORDER BY instance_id, accepted_at"
    )
    .all()
    .map((row) => ({ key: row.key, raw: row.raw, reading: readingOf(row) }));

/** Logs every send whose origin's kind 0413 reads as null, one line each. Run only in a start that applies 0413 (db/migrate.ts). */
export const logSendOriginsUnread = (client: Database): void => {
  logRestrictive(
    sendOriginsKept(client),
    (row, why) =>
      `[migrations] 0413: send ${row.key}: its origin ${shown(row.raw ?? "")} does not read: ${why}; it reads as from no one, never the person's, a peer's or a keep-alive`
  );
};
