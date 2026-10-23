/**
 * The agent's read-only view of each OpenCode database, one connection per
 * file, kept.
 *
 * Opening OpenCode's database and preparing a statement on it run on the
 * agent's one loop, and they are not cheap on a live database another
 * process writes: the agent opened the machine's every 2 s (its config tick's
 * sign-in check) and at every heartbeat, and through a scratch fleet's 110 s
 * the opens took 11 s and the prepares 30 s of the loop, half its time
 * (Bun's CPU profile, 2026-10-24); obelisk's, multi-gigabyte under 369
 * sessions' writes, held it for seconds a time. A kept connection opens once
 * and prepares each statement once (bun:sqlite caches `query`), so a read
 * is one step on what changed.
 *
 * A file replaced under its path (a new database, a conversion) is opened
 * again: its device and inode are looked at on each use, a stat. A file
 * gone lets its connection go.
 */
import { Database } from "bun:sqlite";
import { statSync } from "node:fs";

interface Held {
  db: Database;
  dev: number;
  ino: number;
}

const held = new Map<string, Held>();

/** Lets go of `path`'s connection, if one is kept. */
export const forgetOpencodeDb = (path: string): void => {
  held.get(path)?.db.close();
  held.delete(path);
};

/** The kept read-only connection to the OpenCode database at `path`; undefined when there is no file there. */
export const opencodeDb = (path: string): Database | undefined => {
  let info: { dev: number; ino: number };
  try {
    info = statSync(path);
  } catch {
    forgetOpencodeDb(path);
    return;
  }
  const kept = held.get(path);
  if (kept && kept.dev === info.dev && kept.ino === info.ino) {
    return kept.db;
  }
  forgetOpencodeDb(path);
  const db = new Database(path, { readonly: true });
  held.set(path, { db, dev: info.dev, ino: info.ino });
  return db;
};

/**
 * `read` against `path`'s kept connection, or `absent` when there is no
 * database there or it cannot be read (one 2.0 has not finished making): a
 * read that fails lets the connection go, so the next one opens afresh.
 */
export const readOpencodeDb = <T>(
  path: string,
  absent: T,
  read: (db: Database) => T
): T => {
  const db = opencodeDb(path);
  if (!db) {
    return absent;
  }
  try {
    return read(db);
  } catch {
    forgetOpencodeDb(path);
    return absent;
  }
};
