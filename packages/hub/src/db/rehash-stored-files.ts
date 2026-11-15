import type { SkillFile } from "@cawco/core/fleet";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  pluginFilesOf,
  skillFilesOf,
  storedHash,
  versionFilesOf,
} from "./fleet-catalog";
import { dataMigrations, fleetSkillHistory, plugins, skills } from "./schema";

/**
 * Each of `rows` whose stored hash is not its files' own (`files` reads
 * them; a row that holds none is left), written its own through `write`.
 */
const rehashRows = <Row extends { hash: string | null; held: boolean }>(
  rows: Row[],
  files: (row: Row) => SkillFile[],
  write: (row: Row, hash: string | null) => void
): void => {
  for (const row of rows) {
    if (!row.held) {
      continue;
    }
    const hash = storedHash(files(row), row.hash);
    if (hash !== row.hash) {
      write(row, hash);
    }
  }
};

// A stored skill's or plugin's hash is what its files hash to with the
// hashFiles this hub runs, because that is the hash every machine takes of
// its disk. a1c94e85 put each file's execute bit into it, and the rows
// resolved before that kept the old hash: no machine's untouched copy ever
// matched it, so each one read as edited and a vendored plugin as missing
// its bytes. Every row whose hash and files disagree is rehashed, with no
// history row, since its bytes did not move: once for each hashFiles
// scheme (`FILE_HASH_SCHEME`), recorded in `data_migrations`. Run at every
// open, it read and hashed every file the fleet holds and ever held, about
// 78 MB and 300 ms of each start on the live hub (2026-10-23). A row
// written since cannot disagree: every write of files takes its hash from
// them here ({@link storedHash}), so a skill's or plugin's hash changes
// exactly when its files do, which is also what fleetConfig's files kept
// by hash rest on (`keptFiles`).
/** The repair above, once per hashFiles scheme, under the step's name. */
export const rehashStoredFilesOnce = (
  db: BunSQLiteDatabase,
  name: string
): void => {
  db.transaction((tx) => {
    if (
      tx
        .select()
        .from(dataMigrations)
        .where(eq(dataMigrations.name, name))
        .get()
    ) {
      return;
    }
    rehashRows(
      tx
        .select({
          name: skills.name,
          hash: skills.hash,
          held: skills.filesHeld,
        })
        .from(skills)
        .all(),
      (row) => skillFilesOf(tx, row.name),
      (row, hash) =>
        tx.update(skills).set({ hash }).where(eq(skills.name, row.name)).run()
    );
    rehashRows(
      tx
        .select({ id: plugins.id, hash: plugins.hash, held: plugins.filesHeld })
        .from(plugins)
        .all(),
      (row) => pluginFilesOf(tx, row.id),
      (row, hash) =>
        tx.update(plugins).set({ hash }).where(eq(plugins.id, row.id)).run()
    );
    rehashRows(
      tx
        .select({
          id: fleetSkillHistory.id,
          hash: fleetSkillHistory.hash,
          unread: fleetSkillHistory.filesUnread,
        })
        .from(fleetSkillHistory)
        .all()
        .map((row) => ({ ...row, held: row.unread === null })),
      (row) => versionFilesOf(tx, row.id),
      (row, hash) =>
        tx
          .update(fleetSkillHistory)
          .set({ hash: hash ?? row.hash })
          .where(eq(fleetSkillHistory.id, row.id))
          .run()
    );
    tx.insert(dataMigrations).values({ name, at: new Date() }).run();
  });
};
