/**
 * No credential CawCo holds stays in an Antigravity account's store. agy
 * writes every MCP server's request headers into its conversation database
 * in plain text (tables `gen_metadata` and `executor_metadata`) and keeps
 * them, and a command's output that printed a credential into its
 * transcript. A session hands agy only its gate's token now (agy-sessiond.ts
 * `mcpServersOf`), but a host started before then, and every conversation
 * it wrote, held the fleet servers' keys, the agent's host key and the
 * session's credential.
 *
 * So each account's store is read for every value CawCo holds
 * ({@link heldSecrets}) and every `Bearer` credential CawCo mints (43
 * base64url characters), as each launch on the account readies its home and
 * as each session's host ends, and each one found is overwritten with `x`
 * of the same length: in a database by SQL, under SQLite's own lock, then
 * checkpointed and vacuumed so no freed page keeps it; in any other file at
 * its own offsets, so a write agy makes meanwhile is kept. The same length
 * keeps every protobuf length prefix and every JSON string around it as it
 * was. agy's sign-in file is never written. A file read clean is noted with
 * its size and time ({@link SCRUBBED}) and not read again until it changes;
 * a database a running agy holds locked is left for the next pass.
 */
import { Database } from "bun:sqlite";
import type { Dirent } from "node:fs";
import { open, readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { unlessGone } from "@cawco/core/absent";
import { AGY_SIGN_IN_FILE } from "@cawco/core/paths/harnesses";
import { writeStateFile } from "@cawco/core/state-file";
import { Effect, Option, Schema, Semaphore } from "effect";
import { runFork } from "../daemon-runtime";
import { readFleetMcpSet } from "../fleet-mcp-set";
import { placeSets } from "../fleet-place-set";
import { hostKey } from "../mcp-host";
import { heldCredentials } from "../redaction";
import { fromPromise } from "../rejected";
import type { AgyStore } from "./agy-store-files";

/** The record of the files read clean, in the account's home beside its deleted list: agy reads nothing of it. */
const SCRUBBED = "cawco-scrubbed.json";

const ScrubbedSchema = Schema.Record(Schema.String, Schema.String);
const decodeScrubbed = Schema.decodeUnknownOption(
  Schema.fromJsonString(ScrubbedSchema)
);

/** A value shorter than this is no credential, and would match by chance. */
// @limit measured: the shortest credential CawCo hands a harness is 32 characters (backlot's CF-Access client id); 12 leaves room and matches no word
const SHORTEST = 12;

/**
 * A credential CawCo mints, as a header carries it: 32 random bytes in
 * base64url (hub session-identity.ts `mint`, mcp-host.ts `hostKey`). Not
 * the scrub's own `x`s, which a pass would otherwise write again each time.
 */
const BEARER =
  /Bearer (?!x{43}(?![A-Za-z0-9_-]))([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/gu;
/** SQLite's words for a lock another connection holds. */
const LOCKED = /locked|busy/iu;
/** A virtual table's statement when it is a full-text index. */
const FULL_TEXT = /\busing\s+fts[345]\b/iu;
/** A database's companions, scrubbed through it. */
const COMPANION = /\.db-(wal|shm)$/u;
const BEARER_PREFIX = "Bearer ".length;

/**
 * Every value CawCo holds that agy must not keep: each header value of every
 * remote fleet server (the fleet's own and every place's), less its
 * `Bearer ` prefix; the agent's host key; every session credential the
 * agent installed or verified that may still grant (redaction.ts).
 */
const heldSecrets = async (): Promise<string[]> => {
  const servers = [
    ...Object.values((await readFleetMcpSet()).servers),
    ...(await placeSets()).flatMap((set) => Object.values(set.mcp)),
  ];
  const headers = servers.flatMap((config) =>
    "headers" in config && config.headers ? Object.values(config.headers) : []
  );
  return [
    ...new Set(
      [
        ...headers.map((value) =>
          value.startsWith("Bearer ") ? value.slice(BEARER_PREFIX) : value
        ),
        hostKey(),
        ...heldCredentials(),
      ].filter((value) => value.length >= SHORTEST)
    ),
  ];
};

/** Where each held value, and each minted bearer credential, sits in `bytes`. */
const hitsIn = (
  bytes: Buffer,
  secrets: readonly Buffer[]
): { start: number; end: number }[] => {
  const hits: { start: number; end: number }[] = [];
  for (const secret of secrets) {
    for (
      let at = bytes.indexOf(secret);
      at !== -1;
      at = bytes.indexOf(secret, at + 1)
    ) {
      hits.push({ start: at, end: at + secret.length });
    }
  }
  for (const match of bytes.toString("latin1").matchAll(BEARER)) {
    const start = match.index + BEARER_PREFIX;
    hits.push({ start, end: start + 43 });
  }
  return hits;
};

/** `bytes` with every hit overwritten by `x`, in place; how many there were. */
const overwritten = (bytes: Buffer, secrets: readonly Buffer[]): number => {
  const hits = hitsIn(bytes, secrets);
  for (const { start, end } of hits) {
    bytes.fill(0x78, start, end);
  }
  return hits.length;
};

/** A name as SQL quotes it. */
const quoted = (name: string): string => `"${name.replaceAll('"', '""')}"`;

/**
 * Table `table`'s every cell scrubbed: each row named by its rowid, or in a
 * table without one by its primary key. How many cells changed.
 */
const scrubTable = (
  db: Database,
  table: { name: string; withoutRowid: boolean },
  secrets: readonly Buffer[]
): number => {
  const columns = db
    .query<{ name: string; pk: number }, []>(
      `PRAGMA table_info(${quoted(table.name)})`
    )
    .all();
  const keys = table.withoutRowid
    ? columns
        .filter((column) => column.pk > 0)
        .toSorted((a, b) => a.pk - b.pk)
        .map((column) => column.name)
    : ["rowid"];
  const where = keys.map((key) => `${quoted(key)} = ?`).join(" AND ");
  const rows = db
    .query<unknown[], []>(
      `SELECT ${[...keys, ...columns.map((column) => column.name)].map(quoted).join(", ")} FROM ${quoted(table.name)}`
    )
    .values();
  let changed = 0;
  for (const row of rows) {
    const key = row.slice(0, keys.length);
    row.slice(keys.length).forEach((cell, at) => {
      const column = columns[at];
      if (
        !column ||
        keys.includes(column.name) ||
        !(cell instanceof Uint8Array || typeof cell === "string")
      ) {
        return;
      }
      const bytes = Buffer.from(cell);
      if (overwritten(bytes, secrets) === 0) {
        return;
      }
      db.query(
        `UPDATE ${quoted(table.name)} SET ${quoted(column.name)} = ? WHERE ${where}`
      ).run(
        cell instanceof Uint8Array ? bytes : bytes.toString("utf8"),
        ...key.map((part) =>
          part instanceof Uint8Array || typeof part === "string"
            ? part
            : Number(part)
        )
      );
      changed += 1;
    });
  }
  return changed;
};

/** Whether virtual table `name` is a full-text index (FTS3, 4 or 5). */
const isFullText = (db: Database, name: string): boolean =>
  FULL_TEXT.test(
    db
      .query<{ sql: string | null }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
      )
      .get(name)?.sql ?? ""
  );

/**
 * One table of `file`'s scrubbed ({@link scrubTable}), a full-text index
 * then optimized: an update leaves the old terms in the index's segments,
 * with a delete marker holding them again, and VACUUM merges no segment;
 * merged into one, the index keeps the live terms alone. A virtual table
 * that takes no update (a contentless index) is left as it is; a failure
 * of anything else is the scrub's. How many cells changed.
 */
const scrubListed = (
  db: Database,
  file: string,
  { name, type, wr }: { name: string; type: string; wr: number },
  secrets: readonly Buffer[]
): number => {
  try {
    const changed = scrubTable(
      db,
      { name, withoutRowid: type === "table" && wr === 1 },
      secrets
    );
    if (changed > 0 && type === "virtual" && isFullText(db, name)) {
      db.run(`INSERT INTO ${quoted(name)}(${quoted(name)}) VALUES('optimize')`);
    }
    return changed;
  } catch (error) {
    if (type !== "virtual" || LOCKED.test(String(error))) {
      throw error;
    }
    console.warn(
      `[agy] ${file}: its virtual table ${name} was not scrubbed: ${error instanceof Error ? error.message : String(error)}`
    );
    return 0;
  }
};

/**
 * A database's every cell scrubbed under one write lock, then its freed
 * pages dropped; false when a running agy holds it. A full-text index's
 * own tables are written through its virtual table, which keeps the index
 * true, never as tables of their own (`PRAGMA table_list` type `shadow`),
 * and the index is then optimized, which drops the old terms it held.
 */
const scrubDatabase = (file: string, secrets: readonly Buffer[]): boolean => {
  const db = new Database(file);
  try {
    db.run("PRAGMA busy_timeout = 2000");
    db.run("BEGIN IMMEDIATE");
    let changed = 0;
    const tables = db
      .query<{ name: string; type: string; wr: number }, []>(
        "SELECT name, type, wr FROM pragma_table_list WHERE schema = 'main' AND type IN ('table', 'virtual') AND name NOT LIKE 'sqlite_%'"
      )
      .all();
    for (const table of tables) {
      changed += scrubListed(db, file, table, secrets);
    }
    db.run("COMMIT");
    if (changed > 0) {
      db.run("PRAGMA wal_checkpoint(TRUNCATE)");
      db.run("VACUUM");
    }
    return true;
  } catch (error) {
    if (db.inTransaction) {
      db.run("ROLLBACK");
    }
    if (error instanceof Error && LOCKED.test(error.message)) {
      return false;
    }
    throw error;
  } finally {
    db.close();
  }
};

/** A file's held values overwritten at their own offsets, so what agy appends meanwhile stays. */
const scrubFile = async (
  file: string,
  secrets: readonly Buffer[]
): Promise<void> => {
  const hits = hitsIn(await readFile(file), secrets);
  if (hits.length === 0) {
    return;
  }
  const handle = await open(file, "r+");
  try {
    for (const { start, end } of hits) {
      await handle.write(
        Buffer.alloc(end - start, 0x78),
        0,
        end - start,
        start
      );
    }
  } finally {
    await handle.close();
  }
};

/** Every file under `dir`. */
const filesUnder = async (dir: string): Promise<string[]> => {
  const entries: Dirent[] = await readdir(dir, {
    recursive: true,
    withFileTypes: true,
  }).catch(unlessGone<Dirent[]>([]));
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
};

/** A file's mark in the record: its size and time, so a change reads it again. */
const markOf = async (file: string): Promise<string | undefined> => {
  const stats = await stat(file).catch(unlessGone(undefined));
  return stats ? `${stats.size}:${stats.mtimeMs}` : undefined;
};

/** The mark of a database: its own with its write-ahead log's, which holds its latest pages. */
const databaseMark = async (file: string): Promise<string | undefined> => {
  const own = await markOf(file);
  return own && `${own}/${(await markOf(`${file}-wal`)) ?? "-"}`;
};

const scrubStore = async (store: AgyStore): Promise<void> => {
  const recordFile = join(store.home, SCRUBBED);
  const record = Option.getOrElse(
    decodeScrubbed(await readFile(recordFile, "utf8").catch(unlessGone(""))),
    (): Record<string, string> => ({})
  );
  const secrets = (await heldSecrets()).map((value) => Buffer.from(value));
  const kept: Record<string, string> = {};
  let held = 0;
  for (const file of await filesUnder(store.dir)) {
    const name = relative(store.dir, file);
    if (file.endsWith(AGY_SIGN_IN_FILE) || COMPANION.test(file)) {
      continue;
    }
    const database = file.endsWith(".db");
    const before = await (database ? databaseMark(file) : markOf(file));
    if (before !== undefined && record[name] === before) {
      kept[name] = before;
      continue;
    }
    if (database) {
      const bytes = Buffer.concat([
        await readFile(file),
        await readFile(`${file}-wal`).catch(unlessGone(Buffer.alloc(0))),
      ]);
      if (hitsIn(bytes, secrets).length > 0 && !scrubDatabase(file, secrets)) {
        held += 1;
        continue;
      }
    } else {
      await scrubFile(file, secrets);
    }
    const after = await (database ? databaseMark(file) : markOf(file));
    if (after) {
      kept[name] = after;
    }
  }
  await writeStateFile(recordFile, `${JSON.stringify(kept)}\n`);
  if (held > 0) {
    console.info(
      `[agy] ${store.accountId ?? "agy's own home"}: ${held} conversation database(s) a running agy holds keep a credential until the next pass`
    );
  }
};

/** One store's scrub at a time in this agent: each reads its record afresh and writes it whole. */
const scrubbing = Semaphore.makeUnsafe(1);

/** Account store `store` scrubbed of every credential CawCo holds. */
const scrubAgyStore = (store: AgyStore) =>
  scrubbing.withPermit(fromPromise(() => scrubStore(store)));

/** {@link scrubAgyStore} on its own fiber, its failure said: a launch or a host's end goes on without waiting for it. */
export const scrubAgyStoreSoon = (store: AgyStore): void => {
  runFork(
    scrubAgyStore(store).pipe(
      Effect.catch((error) =>
        Effect.sync(() =>
          console.warn(
            `[agy] ${store.accountId ?? "agy's own home"}: its store's scrub of CawCo's credentials failed: ${error.message}`
          )
        )
      )
    )
  );
};
