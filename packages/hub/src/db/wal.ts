/**
 * The hub's database runs in SQLite's write-ahead log: "WAL provides more
 * concurrency as readers do not block writers and a writer does not block
 * readers" (sqlite.org/wal.html). In the rollback-journal mode before it,
 * every commit of the hub's took the whole file's EXCLUSIVE lock, so a read
 * from any other connection (the update helper's copy, a proof's check, a
 * probe's rows) was refused SQLITE_BUSY while it lasted.
 *
 * The mode is the file's own: "Unlike the other journaling modes, PRAGMA
 * journal_mode=WAL is persistent" (wal.html 3.3), so a database a build
 * before this one kept converts on its first open here and stays converted.
 * Its committed writes live in `<db>-wal` until a checkpoint moves them into
 * the file: "If a database file is separated from its WAL file, then
 * transactions that were previously committed to the database might be
 * lost" (wal.html 4). So nothing copies the file by itself; a copy is SQLite's
 * own (`VACUUM INTO`, or the backup API), which reads the WAL with it.
 *
 * `synchronous = NORMAL`: in WAL mode a commit then skips its fsync, and only
 * a checkpoint syncs ("Writers sync the WAL on every transaction commit if
 * PRAGMA synchronous is set to FULL but omit this sync if PRAGMA synchronous
 * is set to NORMAL", wal.html 2.3). A hub killed at any point (its unit's
 * SIGTERM is the kernel's, lifetime.ts) loses nothing: its commits are in the
 * WAL, in the kernel's page cache, and the next open replays them. Only a
 * power loss or a crash of the machine itself can take back the last commits
 * since a checkpoint, never leave the file corrupt. `synchronous` is the
 * connection's own and set each open.
 */
import type { Database } from "bun:sqlite";

/**
 * Puts the hub's connection to `path` in WAL mode, `synchronous = NORMAL`.
 * A file SQLite cannot keep in WAL (its VFS has no shared memory: "If the
 * conversion to WAL could not be completed ... the journaling mode will be
 * unchanged and the string returned from the primitive will be the prior
 * journaling mode", wal.html 3) is refused: the hub does not start on it.
 */
export const useWal = (sqlite: Database, path: string): void => {
  const mode = sqlite
    .query<{ journal_mode: string }, []>("PRAGMA journal_mode = WAL")
    .get()?.journal_mode;
  if (mode !== "wal") {
    throw new Error(
      `SQLite kept ${path} in ${mode ?? "an unknown"} journal mode when the hub asked for WAL: the hub keeps its database in WAL only, which needs the file on a local disk with shared memory beside it (sqlite.org/wal.html)`
    );
  }
  sqlite.run("PRAGMA synchronous = NORMAL");
};

/**
 * The hub's connection closed with its WAL emptied into the file
 * (`wal_checkpoint(TRUNCATE)`), so what a closed hub leaves is the file whole.
 * SQLite checkpoints on the last connection's close by itself, but Bun
 * "releases the underlying connection (and the database file handle) once
 * the last outstanding `.prepare()` statement is finalized"
 * (bun.com/docs/runtime/sqlite), and the hub holds prepared statements
 * (`takeChanges`, drizzle's), so that close can come late or never before
 * the process ends; this checkpoints while the hub still closes. On macOS,
 * Bun's SQLite is Apple's, "built with persistent WAL enabled": the `-wal`
 * and `-shm` stay, the WAL emptied. A reader still open (a probe, the
 * sqlite3 shell) can keep the checkpoint short of the end: the WAL then
 * stays beside the file, as a killed hub's does, and the next open reads it.
 */
export const closeWal = (sqlite: Database): void => {
  sqlite.run("PRAGMA wal_checkpoint(TRUNCATE)");
  sqlite.close();
};
