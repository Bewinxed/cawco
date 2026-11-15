/**
 * Before migration 0415's SQL runs, the hub's log names every project move
 * whose stored state (`moves.state`, everything the job has learned and
 * decided, as JSON) 0415 keeps as `state_unread`: a state that is there and
 * does not read whole as the hub read it, with why and which of the values
 * 0415 lifts out of it (its session's id, its parked ask) it places.
 *
 * The predicates below are 0415's own: its SQL was written from them, over
 * the JSON column as it stands before it. {@link STATE} is the column's
 * shape as the hub read it then (stored/columns.json at 0415: `MoveState`
 * less the machines its columns hold), frozen here, so a later change to
 * `MoveState` changes nothing 0415 does. {@link movesKept} reads every move
 * with them, for the count taken on a copy before 0415 runs
 * (scripts/continuations-moves-relay.ts).
 *
 * Every JSON function sits inside a CASE that has proved `state` JSON and,
 * where it reads a key, an object (db/json-reads.ts): SQLite may run the
 * right side of an AND first.
 */
import type { Database } from "bun:sqlite";
import {
  anyOf,
  FLAG,
  inJson,
  kinded,
  listOf,
  NUMBER,
  object,
  oneOf,
  readsWhole,
  TEXT,
  TEXT_OR_NULL,
  TRUE,
} from "./json-reads";
import { shown } from "./lifted-reading";

/** A move's step (core `MoveStep`). */
const STEP = oneOf("approval", "snapshot", "clone", "lfs", "start");

/** The large files a move names, each by its path and size. */
const LARGE_FILES = listOf(object({ bytes: NUMBER, path: TEXT }));

/** A move's state, as `moves.state` held it (hub `MoveState` at 0415, its machines aside). */
const STATE = object(
  {
    bigFiles: LARGE_FILES,
    bytes: NUMBER,
    from: anyOf(kinded("hub"), kinded("outside", { host: TEXT })),
    ignoredSecrets: listOf(TEXT),
    ignores: FLAG,
    promptUuid: TEXT,
    snapshotBranch: TEXT,
    sourceHome: TEXT,
    sourcePath: TEXT,
    steps: listOf(STEP),
    targetHome: TEXT,
    targetInstanceId: TEXT,
    targetPath: { mirror: "machine-path" },
  },
  {
    approved: FLAG,
    ask: object(
      {
        bigFiles: LARGE_FILES,
        details: listOf(TEXT),
        gitInit: FLAG,
        lines: listOf(TEXT),
        title: TEXT,
      },
      { key: TEXT }
    ),
    askId: TEXT,
    cloneCredential: TRUE,
    cloneUrl: TEXT,
    error: object({ message: TEXT, stage: STEP }, { detail: TEXT }),
    kept: TEXT,
    lfs: object({ bytes: NUMBER, files: NUMBER }),
    lfsFile: object({ bytes: NUMBER, file: TEXT, total: NUMBER }),
    moved: TEXT,
    progress: object({ bytes: NUMBER, total: NUMBER }),
    root: TEXT,
    snapshot: object(
      {
        base: TEXT_OR_NULL,
        branch: TEXT,
        commit: TEXT,
        files: NUMBER,
        sourceBranch: TEXT_OR_NULL,
      },
      {
        hub: object({ projectId: TEXT }, { root: TEXT }),
        hubLfs: listOf(object({ oid: TEXT, path: TEXT, size: NUMBER })),
      }
    ),
    stayed: TEXT,
    stoppedAt: STEP,
  }
);

/** The state reads whole, every part of it of its shape. */
const STATE_READS = readsWhole("state", STATE);

/** `expression` over `state`, once it is JSON and an object; null otherwise. */
const inObject = (expression: string): string =>
  inJson(
    "state",
    `CASE WHEN json_type(state) = 'object' THEN ${expression} END`
  );

/** The text at `path` in the proved state, placed when it is text. */
const textAt = (path: string): string =>
  inObject(
    `CASE WHEN json_type(state, '${path}') = 'text' THEN json_extract(state, '${path}') END`
  );

/** What a stored state is to 0415. */
export type StateReading =
  /** It reads whole and is placed as it is: whether it parked an ask, and whether the person said "Move it". */
  | { kind: "placed"; approved: boolean; asked: boolean }
  /** It does not read whole: kept as stored, its session's id and ask placed where they are text. */
  | { kind: "unread"; placed: string[]; why: string };

/** One move 0415 reads: its id, project and stage, its state as stored, and what 0415 makes of it. */
export interface KeptMove {
  id: string;
  projectId: string;
  raw: string;
  reading: StateReading;
  stage: string;
}

interface Row {
  approved: number;
  askId: string | null;
  id: string;
  json: number;
  object: number | null;
  projectId: string;
  raw: string;
  reads: number;
  stage: string;
  targetInstanceId: string | null;
}

/** Why a state does not read, in a clause. */
const whyOf = (row: Row): string => {
  if (row.json === 0) {
    return "it is not JSON";
  }
  return row.object === 0
    ? "it is not an object"
    : "a part of it is missing or of another kind";
};

const readingOf = (row: Row): StateReading => {
  if (row.reads) {
    return {
      kind: "placed",
      approved: row.approved === 1,
      asked: row.askId !== null,
    };
  }
  return {
    kind: "unread",
    placed: [
      ...(row.targetInstanceId === null ? [] : ["target_instance_id"]),
      ...(row.askId === null ? [] : ["ask_id"]),
    ],
    why: whyOf(row),
  };
};

/** Every move's state as 0415 reads it, oldest first. Run on a database 0415 has not run on. */
export const movesKept = (client: Database): KeptMove[] =>
  client
    .query<Row, []>(
      `SELECT id, project_id AS projectId, stage, CAST(state AS TEXT) AS raw, CASE WHEN json_valid(state) THEN 1 ELSE 0 END AS json, ${inJson("state", "json_type(state) = 'object'")} AS object, ${STATE_READS} AS reads, ${textAt("$.targetInstanceId")} AS targetInstanceId, ${textAt("$.askId")} AS askId, ${inObject("json_type(state, '$.approved') = 'true'")} AS approved FROM moves ORDER BY created_at, id`
    )
    .all()
    .map((row) => ({
      id: row.id,
      projectId: row.projectId,
      stage: row.stage,
      raw: row.raw,
      reading: readingOf(row),
    }));

/** Logs every state 0415 keeps as not read, one line each. Run only in a start that applies 0415 (db/migrate.ts). */
export const logMovesUnread = (client: Database): void => {
  for (const move of movesKept(client)) {
    const { reading } = move;
    if (reading.kind !== "unread") {
      continue;
    }
    const placedWords =
      reading.placed.length > 0
        ? `${reading.placed.join(", ")} placed`
        : "none of it placed";
    const held =
      reading.placed.includes("target_instance_id") &&
      !["started", "cancelled"].includes(move.stage)
        ? "; the session row it names stays held, never woken, and is marked failed as the hub starts"
        : "";
    console.info(
      `[migrations] 0415: project move ${move.id} of project ${move.projectId} (${move.stage}): its state ${shown(move.raw)} does not read: ${reading.why}; ${placedWords}; it is no move the hub runs, shows, answers or cancels${held}`
    );
  }
};
