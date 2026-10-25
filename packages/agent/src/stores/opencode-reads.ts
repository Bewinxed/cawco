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
import { opencodeDatabases, opencodeDataDir } from "@cawco/core/paths";

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

/**
 * `read` against `path`'s kept connection, or `absent` when there is no
 * database there or it cannot be read (one 2.0 has not finished making, a
 * lock held past {@link BUSY_MS}): a read that fails lets the connection
 * go, so the next one opens afresh.
 */
const readDb = async <T>(
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
  } catch {
    forget(path);
    return absent;
  }
};

/** The database of the machine's OpenCode server, where OpenCode's own sign-ins are. */
const machineDb = (): string => join(opencodeDataDir(), "opencode.db");

/** A root session as its server's database keeps it (2.0's `session_v2` row). */
export interface StoredSession {
  directory: string;
  id: string;
  time_created: number;
  time_updated: number;
  title: string | null;
}

/** What the session listing narrows to: one directory's root sessions, or one session by id, root or not. */
export interface SessionQuery {
  directory?: string;
  id?: string;
}

/**
 * The root sessions in the database at `path`, `query` narrowing them. A
 * database 2.0 is still making (an account server's first start) has no
 * sessions table yet, and so no session.
 */
const sessionsIn = (
  path: string,
  query: SessionQuery
): Promise<StoredSession[]> =>
  readDb(path, [] as StoredSession[], (db) => {
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
        `SELECT id, title, directory, time_created, time_updated FROM session_v2
           WHERE (CASE WHEN ?2 IS NULL THEN parent_id IS NULL ELSE id = ?2 END)
             AND (?1 IS NULL OR directory = ?1)`
      )
      .all(query.directory ?? null, query.id ?? null);
  });

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
        (
          db.query("SELECT id, time_updated FROM credential").all() as {
            id: string;
            time_updated: number;
          }[]
        ).map((row) => [row.id, row.time_updated])
      )
    ),

  /** What kind each active sign-in is (`oauth`, `key`, …), by its integration: the type alone, never its value. */
  ownSignInTypes: (): Promise<Record<string, string>> =>
    readDb(machineDb(), {}, (db) =>
      Object.fromEntries(
        (
          db
            .query(
              "SELECT integration_id, json_extract(value, '$.type') AS type FROM credential WHERE active = 1"
            )
            .all() as { integration_id: string | null; type: string | null }[]
        ).flatMap((row) =>
          row.integration_id && row.type ? [[row.integration_id, row.type]] : []
        )
      )
    ),

  /** The providers the active sign-ins are for (each one's integration), never their values. */
  ownIntegrations: (): Promise<string[]> =>
    readDb(machineDb(), [] as string[], (db) =>
      (
        db
          .query(
            "SELECT DISTINCT integration_id FROM credential WHERE active = 1"
          )
          .all() as { integration_id: string | null }[]
      ).flatMap((row) => (row.integration_id ? [row.integration_id] : []))
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
