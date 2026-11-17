/**
 * OpenCode's own databases, read on the stores' thread (stores/worker.ts),
 * never on the agent's loop: one kept read-only connection per file.
 *
 * Each database is another process's live store: OpenCode's server writes
 * it the whole time, and on obelisk it is multi-gigabyte under hundreds of
 * sessions' writes. Read on the loop, every open, prepare, page read and
 * wait of it was the loop's: the sign-ins read every config tick and the
 * session listing at each reattach were the last marked sections entered in
 * the agent's holds of 2026-10-25 (17:39–18:28, 42 of them, up to 33 s).
 * Here a slow read holds this thread alone, and the loop asks with a
 * deadline (stores/client.ts).
 *
 * Each connection is read-only (`SQLITE_OPEN_READONLY`): it takes no write
 * lock, and never checkpoints the other process's WAL ("An application can
 * initiate a checkpoint using any writable database connection",
 * https://www.sqlite.org/wal.html#application_initiated_checkpoints).
 * `busy_timeout` is {@link BUSY_MS}, waited out on this thread: a WAL read
 * is refused while "the last connection … is closing" or a crashed one's
 * "recovery" holds its exclusive lock (wal.html, "Sometimes Queries Return
 * SQLITE_BUSY In WAL Mode"); past it the read answers absent.
 *
 * A connection opens once and prepares each statement once (bun:sqlite
 * caches `query`): through a scratch fleet's 110 s, opening the machine's
 * database each read took 11 s and the prepares 30 s (Bun's CPU profile,
 * 2026-10-24). A file replaced under its path (a new database, a
 * conversion) is opened again: its device and inode are looked at on each
 * read. A file gone lets its connection go.
 */
import { Database } from "bun:sqlite";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  type JsonValue,
  type OpencodeV1SessionRow,
  opencodeJson,
  opencodeV1MessageRows,
  opencodeV1PartRows,
  opencodeV1SessionRow,
} from "@cawco/core/harness/opencode-wire";
import {
  opencodeDatabases,
  opencodeDataDir,
} from "@cawco/core/paths/harnesses";
import type { ExperimentalSessionImportInput } from "@opencode/client";
import { ID as AgentID } from "@opencode/core/agent";
import {
  type TransformInput,
  transformSession,
} from "@opencode/core/database/v1-migration.bun";
import { ID as ProjectID } from "@opencode/core/project/schema";
import { ID as SessionID } from "@opencode/core/session/schema";
import { ID as WorkspaceID } from "@opencode/core/workspace";
import { z } from "zod";

/** How long a read waits out another process's lock on this thread before it answers absent. Our call: a commit's moment, well inside the loop's deadline for the read. */
const BUSY_MS = 1000;

interface Held {
  db: Database;
  dev: number;
  ino: number;
}

const held = new Map<string, Held>();

const forget = (path: string): void => {
  held.get(path)?.db.close();
  held.delete(path);
};

/** The kept read-only connection to the database at `path`; undefined when there is no file there. */
const connection = async (path: string): Promise<Database | undefined> => {
  let info: { dev: number; ino: number };
  try {
    info = await stat(path);
  } catch {
    forget(path);
    return;
  }
  const kept = held.get(path);
  if (kept && kept.dev === info.dev && kept.ino === info.ino) {
    return kept.db;
  }
  forget(path);
  const db = new Database(path, { readonly: true });
  db.exec(`PRAGMA busy_timeout = ${BUSY_MS}`);
  held.set(path, { db, dev: info.dev, ino: info.ino });
  return db;
};

/** A database that is there and could not be read, and why ({@link readDbOrFail}). */
class DbUnread extends Error {}

/**
 * `read` against `path`'s kept connection, or `absent` when there is no
 * database there: a database that is there and could not be read (a lock
 * held past {@link BUSY_MS}, a file that is no database) fails with why
 * ({@link DbUnread}), and lets the connection go, so the next read opens
 * afresh. For a read of the person's conversations, where "none" is an
 * answer the hub acts on (a catalog that proves a session gone, a
 * transcript shown empty), so a database that did not answer is never read
 * as one that holds none.
 */
const readDbOrFail = async <T>(
  path: string,
  absent: T,
  read: (db: Database) => T
): Promise<T> => {
  const db = await connection(path);
  if (!db) {
    return absent;
  }
  try {
    return read(db);
  } catch (error) {
    forget(path);
    throw new DbUnread(
      `OpenCode's database ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
};

/**
 * {@link readDbOrFail}, with a database that could not be read answered as
 * `absent` too (one 2.0 has not finished making, a lock held past
 * {@link BUSY_MS}): for OpenCode's own sign-ins, which the next tick reads
 * again.
 */
const readDb = <T>(
  path: string,
  absent: T,
  read: (db: Database) => T
): Promise<T> =>
  readDbOrFail(path, absent, read).catch((error: unknown) => {
    if (error instanceof DbUnread) {
      return absent;
    }
    throw error;
  });

/** The database of the machine's OpenCode server, where OpenCode's own sign-ins are. */
const machineDb = (): string => join(opencodeDataDir(), "opencode.db");

/** A root session as its server's database keeps it (2.0's `session_v2` row). */
export interface StoredSession {
  directory: string;
  id: string;
  time_created: number;
  time_updated: number;
  title: string | null;
  /** When the person last sent a message in it (its last `user` message's `time_created`); null when none. */
  wrote_at: number | null;
}

/** What the session listing narrows to: one directory's root sessions, or one session by id, root or not. */
export interface SessionQuery {
  directory?: string;
  id?: string;
}

/**
 * The root sessions in the database at `path`, `query` narrowing them, each
 * with its last `user` message's time, in the one query. A database 2.0 is
 * still making (an account server's first start) has no sessions table yet,
 * and so no session; one that is there and could not be read fails
 * ({@link readDbOrFail}).
 *
 * The last user message is read through 2.0's index on `session_message`
 * (`session_id`, `time_created`, `id`: OpenCode's
 * `session_message_session_time_created_id_idx`), newest first, to the first
 * `user` row: a session's own rows, never the table. A user row in 2.0 is
 * the person's prompt; a tool's answer is in the assistant message's
 * content, not a row of its own.
 */
const sessionsIn = (
  path: string,
  query: SessionQuery
): Promise<StoredSession[]> =>
  readDbOrFail<StoredSession[]>(path, [], (db) => {
    if (
      !db
        .query(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_v2'"
        )
        .get()
    ) {
      return [];
    }
    return db
      .query<StoredSession, [string | null, string | null]>(
        `SELECT id, title, directory, time_created, time_updated,
             (SELECT m.time_created FROM session_message m
                WHERE m.session_id = session_v2.id AND m.type = 'user'
                ORDER BY m.time_created DESC LIMIT 1) AS wrote_at
           FROM session_v2
           WHERE (CASE WHEN ?2 IS NULL THEN parent_id IS NULL ELSE id = ?2 END)
             AND (?1 IS NULL OR directory = ?1)`
      )
      .all(query.directory ?? null, query.id ?? null);
  });

/** Whether the database `db` has the table `name`. */
const hasTable = (db: Database, name: string): boolean =>
  db
    .query<unknown, [string]>(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    )
    .get(name) !== null;

/**
 * A session OpenCode 2.0 can take back through its own import
 * (`POST /api/experimental/session/import`, `@opencode/client`
 * `session.import`): its `info` and its messages in 2.0's shape.
 */
export interface V1Session {
  info: ExperimentalSessionImportInput["info"];
  messages: JsonValue[];
  /** The 1.x rows OpenCode's own conversion left out (its `warnings`: a message or part it could not decode, a part with no message). */
  skipped: number;
}

/**
 * The 1.x tables' session family around `id` in `db`, when its `session`
 * table holds `id`: its ancestors from the root down, `id`, then its
 * descendants, each after its parent (OpenCode's import refuses a child
 * whose parent it does not hold yet). Undefined when `db` holds no 1.x row
 * of `id`.
 */
const v1FamilyIn = (db: Database, id: string): string[] | undefined => {
  if (!(hasTable(db, "session") && hasTable(db, "message"))) {
    return;
  }
  const parentOf = db.query<{ parent_id: string | null }, [string]>(
    "SELECT parent_id FROM session WHERE id = ?"
  );
  const self = parentOf.get(id);
  if (!self) {
    return;
  }
  const ancestors: string[] = [];
  let parent = self.parent_id;
  while (parent !== null && parent !== id && !ancestors.includes(parent)) {
    const row = parentOf.get(parent);
    if (!row) {
      break;
    }
    ancestors.unshift(parent);
    parent = row.parent_id;
  }
  const childrenOf = db.query<{ id: string }, [string]>(
    "SELECT id FROM session WHERE parent_id = ? ORDER BY time_created, id"
  );
  const family = [...ancestors, id];
  for (let index = ancestors.length; index < family.length; index += 1) {
    for (const child of childrenOf.all(family[index])) {
      if (!family.includes(child.id)) {
        family.push(child.id);
      }
    }
  }
  return family;
};

/** Which of `ids` any OpenCode database on the machine holds in 2.0's `session_v2`. */
const heldInV2 = async (ids: string[]): Promise<Set<string>> => {
  const inV2 = new Set<string>();
  const marks = ids.map(() => "?").join(", ");
  for (const path of opencodeDatabases()) {
    const found = await readDbOrFail<string[]>(path, [], (db) =>
      hasTable(db, "session_v2")
        ? db
            .query<{ id: string }, string[]>(
              `SELECT id FROM session_v2 WHERE id IN (${marks})`
            )
            .all(...ids)
            .map((row) => row.id)
        : []
    );
    for (const id of found) {
      inV2.add(id);
    }
  }
  return inV2;
};

/**
 * The 1.x row as the `session_v2` row OpenCode's own conversion hands
 * `transformSession` (`v1-migration.bun.ts` `run`: the row it copied into
 * `session_v2` from `session`, with no `permission`). `transformSession`
 * reads its `id`, `agent` and `model`; the columns 1.x has no value for are
 * 2.0's empty ones.
 */
const asV2Row = (row: OpencodeV1SessionRow): TransformInput["session"] => ({
  id: SessionID.make(row.id),
  project_id: ProjectID.make(row.project_id),
  workspace_id:
    row.workspace_id === null ? null : WorkspaceID.make(row.workspace_id),
  parent_id: row.parent_id === null ? null : SessionID.make(row.parent_id),
  fork_session_id: null,
  fork_boundary: null,
  slug: row.slug,
  directory: row.directory,
  path: row.path,
  title: row.title,
  version: row.version,
  share_url: row.share_url,
  summary_additions: row.summary_additions,
  summary_deletions: row.summary_deletions,
  summary_files: row.summary_files,
  summary_diffs: null,
  metadata: null,
  cost: row.cost,
  tokens_input: row.tokens_input,
  tokens_output: row.tokens_output,
  tokens_reasoning: row.tokens_reasoning,
  tokens_cache_read: row.tokens_cache_read,
  tokens_cache_write: row.tokens_cache_write,
  revert: null,
  permission: null,
  agent: row.agent === null ? null : AgentID.make(row.agent),
  model: row.model,
  time_busy: null,
  time_idle: null,
  time_viewed: null,
  idle_outcome: null,
  time_compacting: row.time_compacting,
  time_archived: row.time_archived,
  time_suspended: null,
  resume_attempts: 0,
  time_created: row.time_created,
  time_updated: row.time_updated,
});

/**
 * Session `id` from its 1.x rows in `db`, converted by OpenCode's own
 * conversion (`@opencode/core` `transformSession`, what 2.0's one-time
 * migration runs on each 1.x session) into what 2.0's import takes. Each
 * message goes as its id, its type and its data, the one object 2.0's
 * `session_message` row splits into columns; the session's totals are the
 * conversion's. A tool call the conversion writes carries no `executed`,
 * which 2.0's model request reads as run here (`executed !== true`), the
 * same as the `executed: false` 2.0 writes for one (anomalyco/opencode#59517).
 */
const v1SessionIn = (db: Database, id: string): V1Session => {
  const row = opencodeV1SessionRow(
    db
      .query<unknown, [string]>(
        `SELECT id, project_id, workspace_id, parent_id, slug, directory, path,
             title, version, share_url, summary_additions, summary_deletions,
             summary_files, cost, tokens_input, tokens_output, tokens_reasoning,
             tokens_cache_read, tokens_cache_write, agent, model, time_created,
             time_updated, time_compacting, time_archived
           FROM session WHERE id = ?`
      )
      .get(id)
  );
  const converted = transformSession({
    session: asV2Row(row),
    messages: opencodeV1MessageRows(
      db
        .query<unknown, [string]>(
          "SELECT id, session_id, time_created, time_updated, data FROM message WHERE session_id = ?"
        )
        .all(id)
    ),
    parts: opencodeV1PartRows(
      db
        .query<unknown, [string]>(
          "SELECT id, message_id, session_id, time_created, time_updated, data FROM part WHERE session_id = ?"
        )
        .all(id)
    ),
  });
  const { session } = converted;
  return {
    info: {
      id: row.id,
      ...(row.parent_id === null ? {} : { parentID: row.parent_id }),
      projectID: row.project_id,
      ...(session.agent ? { agent: session.agent } : {}),
      ...(session.model ? { model: session.model } : {}),
      // Each total unset is `session_v2`'s own column default, 0.
      cost: session.cost ?? 0,
      tokens: {
        input: session.tokens_input ?? 0,
        output: session.tokens_output ?? 0,
        reasoning: session.tokens_reasoning ?? 0,
        cache: {
          read: session.tokens_cache_read ?? 0,
          write: session.tokens_cache_write ?? 0,
        },
      },
      time: {
        created: row.time_created,
        updated: row.time_updated,
        ...(row.time_archived === null ? {} : { archived: row.time_archived }),
      },
      title: row.title,
      location: { directory: row.directory },
    },
    // As JSON: a key the conversion left undefined is no key on the wire.
    messages: converted.messages.map((message) =>
      opencodeJson(
        JSON.parse(
          JSON.stringify({
            id: message.id,
            type: message.type,
            ...message.data,
          })
        )
      )
    ),
    skipped: converted.warnings.length,
  };
};

/** Every read the loop may ask of OpenCode's databases, by name. */
export const opencodeReads = {
  /**
   * OpenCode's own sign-ins as their rows stand: each one's id and when it
   * last changed (a sign-in, a refresh, a switch, a removal all move it),
   * never their values; "absent" for a database 2.0 has not made yet.
   */
  ownRows: (): Promise<string> =>
    readDb(machineDb(), "absent", (db) =>
      JSON.stringify(
        db.query("SELECT id, time_updated FROM credential ORDER BY id").all()
      )
    ),

  /** When each of OpenCode's own sign-ins last changed, by credential id, never their values. */
  ownChanges: (): Promise<Record<string, number>> =>
    readDb(machineDb(), {}, (db) =>
      Object.fromEntries(
        db
          .query<{ id: string; time_updated: number }, []>(
            "SELECT id, time_updated FROM credential"
          )
          .all()
          .map((row) => [row.id, row.time_updated])
      )
    ),

  /** What kind each active sign-in is (`oauth`, `key`, …), by its integration: the type alone, never its value. */
  ownSignInTypes: (): Promise<Record<string, string>> =>
    readDb(machineDb(), {}, (db) =>
      Object.fromEntries(
        db
          .query<{ integration_id: string | null; type: string | null }, []>(
            "SELECT integration_id, json_extract(value, '$.type') AS type FROM credential WHERE active = 1"
          )
          .all()
          .flatMap((row) =>
            row.integration_id && row.type
              ? [[row.integration_id, row.type]]
              : []
          )
      )
    ),

  /**
   * The active sign-ins whole: each one's id, its integration and its value,
   * as the server's own `GET /api/credential` gives them from this table.
   * Read for the move of a login into a CawCo account, which takes the
   * value; none for a database 2.0 has not made yet.
   */
  ownCredentials: (): Promise<
    { id: string; integrationID: string; value: Record<string, unknown> }[]
  > =>
    readDb<
      { id: string; integrationID: string; value: Record<string, unknown> }[]
    >(machineDb(), [], (db) =>
      db
        .query<{ id: string; integration_id: string; value: string }, []>(
          "SELECT id, integration_id, value FROM credential WHERE active = 1 AND integration_id IS NOT NULL ORDER BY id"
        )
        .all()
        .map((row) => ({
          id: row.id,
          integrationID: row.integration_id,
          value: z.record(z.string(), z.unknown()).parse(JSON.parse(row.value)),
        }))
    ),

  /** The providers the active sign-ins are for (each one's integration), never their values. */
  ownIntegrations: (): Promise<string[]> =>
    readDb<string[]>(machineDb(), [], (db) =>
      db
        .query<{ integration_id: string | null }, []>(
          "SELECT DISTINCT integration_id FROM credential WHERE active = 1"
        )
        .all()
        .flatMap((row) => (row.integration_id ? [row.integration_id] : []))
    ),

  /**
   * The root sessions in every OpenCode database on the machine, the
   * machine's server's and each account's (core paths `opencodeDatabases`,
   * found here too), as the session list reads them, `query` narrowing them
   * to one directory or naming one session; each once (a session a move
   * left half-way is in two).
   */
  sessions: async (query: SessionQuery): Promise<StoredSession[]> => {
    const seen = new Map<string, StoredSession>();
    for (const path of opencodeDatabases()) {
      for (const session of await sessionsIn(path, query)) {
        if (!seen.has(session.id)) {
          seen.set(session.id, session);
        }
      }
    }
    return [...seen.values()];
  },

  /**
   * Session `id` as OpenCode 2.0 can import it, when OpenCode keeps it only
   * in a database's 1.x tables (`session`, `message`, `part`), with its
   * family kept only there too: its ancestors first, each parent before its
   * children, then its subagent sessions ({@link v1FamilyIn}). None when no
   * database holds a 1.x row of it, or one holds it in 2.0's `session_v2`:
   * then it is no session only 1.x keeps. A session 2.0 removed keeps its
   * 1.x rows (OpenCode's remove deletes its 2.0 rows alone,
   * anomalyco/opencode#50260), and 2.0's one-time migration copies none
   * twice (`kv['migration.v1-v2']`), so these rows are where it still is.
   * Read only: the session goes back through the server's own import.
   */
  v1Sessions: async (id: string): Promise<V1Session[]> => {
    for (const path of opencodeDatabases()) {
      const family = await readDbOrFail<string[] | undefined>(
        path,
        undefined,
        (db) => v1FamilyIn(db, id)
      );
      if (!family) {
        continue;
      }
      const inV2 = await heldInV2(family);
      if (inV2.has(id)) {
        return [];
      }
      return await readDbOrFail<V1Session[]>(path, [], (db) =>
        family
          .filter((one) => !inV2.has(one))
          .map((one) => v1SessionIn(db, one))
      );
    }
    return [];
  },

  /**
   * The OpenCode 1.x database in `dataHome` (`<dataHome>/opencode/opencode.db`,
   * the same file 2.0 opens), copied whole beside itself before a 2.0 server
   * first starts on it, and the copy's path; undefined when there is nothing
   * of 1.x's to keep. 2.0 converts a 1.x database in place on its first
   * start, once and one way, adding its own tables beside 1.x's (settled
   * #10). Its sessions table, `session_v2`, is the one a 1.x database lacks:
   * 1.18.34's own schema already has `session_message`, `credential` and
   * `event` (observed on a database 1.18.34 made fresh), so a file with
   * `session_v2` is converted already, and a file 1.x never wrote (no
   * `message` table) holds no 1.x history. The copy is SQLite's own `VACUUM
   * INTO` on a read-only connection: "VACUUM (but not VACUUM INTO) is a
   * write operation", and "the generated output database is a consistent
   * snapshot of the original database" (https://www.sqlite.org/lang_vacuum.html).
   */
  backupV1: async (dataHome: string): Promise<string | undefined> => {
    const path = join(dataHome, "opencode", "opencode.db");
    if (!(await stat(path).catch(() => undefined))) {
      return;
    }
    const db = new Database(path, { readonly: true });
    try {
      db.exec(`PRAGMA busy_timeout = ${BUSY_MS}`);
      const tables = new Set(
        db
          .query<{ name: string }, []>(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
          )
          .all()
          .map((row) => row.name)
      );
      if (tables.has("session_v2") || !tables.has("message")) {
        return;
      }
      const backup = `${path}.v1-backup-${new Date().toISOString().replaceAll(":", "-")}`;
      db.run("VACUUM INTO ?", [backup]);
      return backup;
    } finally {
      db.close();
    }
  },
};
