/**
 * Before migration 0428's SQL runs, the hub's log names every workspace
 * whose stored head (`workspaces.head`, JSON: the commit its clone's HEAD was
 * on as it retired, the branch that held it, and the carry its commits went
 * to) 0428 keeps as not read: a value that is there and does not read whole
 * as the hub read it, with why.
 *
 * The predicate below is 0428's own: its SQL was written from it, over the
 * JSON column as it stands before it. {@link HEAD} is the column's shape as
 * the hub read it then (core `WorkspaceCut`), frozen here.
 * {@link workspaceHeadsKept} reads every row with it, for the count taken on
 * a copy before 0428 runs (scripts/cold-waits-heads.ts).
 *
 * Every JSON function sits inside a CASE that has proved its column JSON
 * (db/json-reads.ts): SQLite may run the right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import { object, readsWhole, shown, TEXT } from "./json-reads";

/** A retired workspace's head, as `workspaces.head` held it (core `WorkspaceCut`). */
const HEAD = object({ branch: TEXT, commit: TEXT }, { carry: TEXT });

/** A head read whole. */
const HEAD_READ = readsWhole("head", HEAD);

/** What a stored head is to 0428. */
export type HeadReading =
  /** Never set: the workspace has not retired, or its machine said no head. */
  | { kind: "never" }
  /** It reads whole and is placed as it is. */
  | { kind: "placed"; carry: boolean }
  /** It does not read whole: kept as stored, none of it placed: no known head. */
  | { kind: "unread"; why: string };

/** One workspace as 0428 reads it: its id and state, its head as stored, and what 0428 makes of it. */
export interface KeptHead {
  id: string;
  raw: string | null;
  reading: HeadReading;
  state: string;
}

interface Row {
  carry: number | null;
  id: string;
  json: number | null;
  raw: string | null;
  reads: number;
  state: string;
}

const readingOf = (row: Row): HeadReading => {
  if (row.raw === null) {
    return { kind: "never" };
  }
  if (row.reads) {
    return { kind: "placed", carry: row.carry === 1 };
  }
  return {
    kind: "unread",
    why:
      row.json === 0
        ? "it is not JSON"
        : "it is not a branch and a commit (text), with a carry (text) or none",
  };
};

/** Every workspace's head as 0428 reads it. Run on a database 0428 has not run on. */
export const workspaceHeadsKept = (client: Database): KeptHead[] =>
  client
    .query<Row, []>(
      `SELECT id, state, CAST(head AS TEXT) AS raw, CASE WHEN head IS NULL THEN NULL WHEN json_valid(head) THEN 1 ELSE 0 END AS json, ${HEAD_READ} AS reads, CASE WHEN ${HEAD_READ} THEN CASE WHEN json_valid(head) THEN json_type(head, '$.carry') = 'text' END END AS carry FROM workspaces ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      state: row.state,
      raw: row.raw,
      reading: readingOf(row),
    }));

/** Logs every head 0428 keeps as not read, one line each. Run only in a start that applies 0428 (db/migrate.ts). */
export const logWorkspaceHeadsUnread = (client: Database): void => {
  for (const workspace of workspaceHeadsKept(client)) {
    if (workspace.reading.kind !== "unread" || workspace.raw === null) {
      continue;
    }
    console.info(
      `[migrations] 0428: workspace ${workspace.id} (${workspace.state}): its head ${shown(workspace.raw)} does not read: ${workspace.reading.why}; kept as not read, it is no known head, and the workspace is not cut again`
    );
  }
};
