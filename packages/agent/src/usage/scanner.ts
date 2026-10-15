import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { UsageBucket, UsageTokens } from "@cawco/core";
import {
  BUCKET_MS,
  bucketStart,
  ratesFingerprint,
  refreshPricing,
  totalTokens,
} from "@cawco/core";
import {
  cawcoDataDir,
  listClaudeFiles,
  opencodeDatabases,
} from "@cawco/core/paths";
import { gauge } from "../memory";
import { parseClaudeLine } from "./scan-claude";
import { scanOpencode } from "./scan-opencode";
import type { ScannedRecord } from "./types";

/**
 * The per-machine usage scanner (USAGE-SPEC.md §5). Folds every transcript's
 * usage into absolute bucket totals the hub upserts by bucket id. Incremental
 * scans compare `(mtimeMs, size)` per Claude transcript and a `time_updated`
 * watermark per OpenCode database; a full rebuild re-heals and re-costs the store when
 * its result could differ ({@link UsageScanner.scan}).
 *
 * Its state lives on disk, in `usage.db` under the agent's data dir: the dedup
 * set holds one row per assistant message the machine ever wrote, so it grows
 * with history, and kept in memory it was most of the agent's heap (261k keys,
 * ~140 MB, measured on a 1,500-transcript rig). SQLite's page cache is the
 * only part held in memory, capped at {@link PAGE_CACHE_KIB}. The store also
 * outlives a restart, so a start scans incrementally.
 *
 * Every page it writes is a page the OS counts against the agent's disk
 * budget (macOS: 24.86 KB/s averaged over a day), so the store is laid out
 * for writes that land together:
 * - A kept message's row is appended (`claude` and `claude_side` are rowid
 *   tables) and found by {@link RowIndex}, in memory. Keyed on the random
 *   message id, each new message dirtied a B-tree page of its own, and that
 *   was most of what a scan wrote.
 * - A bucket's key leads with its quarter hour, so the buckets a scan folds
 *   into sit together.
 * - A scan is one transaction and skips writes that change nothing.
 * - A full rebuild deletes and rewrites the whole store, so it runs only when
 *   that can change a number: it ran every 30 minutes when this state was in
 *   memory, where it cost no disk, and here that alone dirtied the store's
 *   size twice over each time.
 */

/** SQLite's page cache for the store, in KiB: all of it the agent holds in memory. */
const PAGE_CACHE_KIB = 8192;

/**
 * What the store's tables and rows mean, as this code lays them out, parses,
 * dedups and costs them. Bump it with any change to those: a store made by
 * other code is dropped on open and the next scan rebuilds it.
 */
const SCANNER_VERSION = 2;

/**
 * The longest a store goes between full rebuilds. A rebuild heals what
 * incremental scans leave: a replaced message's stale window edge
 * (`#takeBack`) and a transcript that was deleted.
 */
const HEAL_MS = 24 * 60 * 60 * 1000;

const TABLES = [
  "meta",
  "files",
  "buckets",
  "claude",
  "claude_side",
  "opencode_seen",
] as const;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value NUMERIC NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY, mtime_ms REAL NOT NULL, size INTEGER NOT NULL, offset INTEGER NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS buckets (
  key TEXT PRIMARY KEY, harness TEXT NOT NULL, start INTEGER NOT NULL,
  first_ts INTEGER NOT NULL, last_ts INTEGER NOT NULL, session_id TEXT NOT NULL,
  project TEXT NOT NULL, project_path TEXT, model TEXT NOT NULL, provider TEXT,
  input INTEGER NOT NULL, output INTEGER NOT NULL, cache_creation INTEGER NOT NULL,
  cache_read INTEGER NOT NULL, reasoning INTEGER NOT NULL, cost REAL NOT NULL,
  messages INTEGER NOT NULL, touched INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS claude (
  id INTEGER PRIMARY KEY, key TEXT NOT NULL, bucket TEXT NOT NULL, side INTEGER NOT NULL,
  total INTEGER NOT NULL, counted INTEGER NOT NULL,
  input INTEGER NOT NULL, output INTEGER NOT NULL, cache_creation INTEGER NOT NULL,
  cache_read INTEGER NOT NULL, reasoning INTEGER NOT NULL, cost REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS claude_side (id INTEGER PRIMARY KEY, key TEXT NOT NULL, main INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS opencode_seen (id TEXT PRIMARY KEY) WITHOUT ROWID;
`;

/** 2^31 − 1: a prime, so `hash * 131 + code` stays an exact double below 2^39. */
const HASH_MODULUS = 2_147_483_647;

/** A 31-bit hash of `key`. */
const hashKey = (key: string): number => {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 131 + key.charCodeAt(i)) % HASH_MODULUS;
  }
  return hash;
};

/**
 * Where each key's row is: an open-addressed table of (hash, row id) pairs,
 * 8 bytes a slot, kept at most half full (16 bytes a key; the 261k messages
 * of a 1,500-transcript rig take 4 MB). A hash names candidates only: the
 * caller reads each candidate's row and keeps the one whose key matches, so
 * a collision, or a row a rolled-back transaction left named here, costs a
 * read and nothing else.
 */
class RowIndex {
  #hashes = new Uint32Array(1024);
  /** 0 is an empty slot: SQLite's row ids start at 1. */
  #rows = new Uint32Array(1024);
  #count = 0;

  get size(): number {
    return this.#count;
  }

  /** The row ids that may hold `key`, in the order they were added. */
  *candidates(key: string): Generator<number> {
    const hash = hashKey(key);
    const capacity = this.#rows.length;
    for (let slot = hash % capacity; ; slot = (slot + 1) % capacity) {
      const row = this.#rows[slot] ?? 0;
      if (row === 0) {
        return;
      }
      if (this.#hashes[slot] === hash) {
        yield row;
      }
    }
  }

  add(key: string, row: number): void {
    if ((this.#count + 1) * 2 > this.#rows.length) {
      this.#grow();
    }
    this.#place(hashKey(key), row);
    this.#count += 1;
  }

  clear(): void {
    this.#hashes = new Uint32Array(1024);
    this.#rows = new Uint32Array(1024);
    this.#count = 0;
  }

  #place(hash: number, row: number): void {
    const capacity = this.#rows.length;
    let slot = hash % capacity;
    while ((this.#rows[slot] ?? 0) !== 0) {
      slot = (slot + 1) % capacity;
    }
    this.#hashes[slot] = hash;
    this.#rows[slot] = row;
  }

  #grow(): void {
    const hashes = this.#hashes;
    const rows = this.#rows;
    this.#hashes = new Uint32Array(rows.length * 2);
    this.#rows = new Uint32Array(rows.length * 2);
    for (let slot = 0; slot < rows.length; slot += 1) {
      const row = rows[slot] ?? 0;
      if (row !== 0) {
        this.#place(hashes[slot] ?? 0, row);
      }
    }
  }
}

/** A kept Claude message: which bucket it went into and what it added there. */
interface ClaudeRow {
  bucket: string;
  cache_creation: number;
  cache_read: number;
  cost: number;
  /** 0 once its share was taken back out of its bucket. */
  counted: number;
  id: number;
  input: number;
  key: string;
  output: number;
  reasoning: number;
  side: number;
  total: number;
}

/** A sidechain message id's kept message: `main` is its `claude` row id. */
interface SideRow {
  id: number;
  key: string;
  main: number;
}

interface BucketRow {
  cache_creation: number;
  cache_read: number;
  cost: number;
  first_ts: number;
  harness: UsageBucket["harness"];
  input: number;
  last_ts: number;
  messages: number;
  model: string;
  output: number;
  project: string;
  project_path: string | null;
  provider: string | null;
  reasoning: number;
  session_id: string;
  start: number;
}

interface FileRow {
  mtime_ms: number;
  offset: number;
  size: number;
}

/** `rec` beats `existing`: non-sidechain wins; then the larger total tokens. */
const prefers = (rec: ScannedRecord, existing: ClaudeRow): boolean => {
  if (rec.isSidechain !== (existing.side === 1)) {
    return !rec.isSidechain;
  }
  return totalTokens(rec.tokens) > existing.total;
};

const tokenValues = (t: UsageTokens) =>
  [t.input, t.output, t.cacheCreation, t.cacheRead, t.reasoning] as const;

const NEWLINE = 10;

/**
 * Hands `onLine` every whole line of `path` from byte `offset` on, as the
 * file streams in, and answers the offset after the last whole line: a
 * partial last line is a live session mid-write, left for the next read.
 * Only one line is ever held whole, never the file.
 */
const eachLine = async (
  path: string,
  offset: number,
  onLine: (line: string) => void
): Promise<number> => {
  const decoder = new TextDecoder();
  let consumed = offset;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  for await (const chunk of Bun.file(path).slice(offset).stream()) {
    let start = 0;
    for (
      let end = chunk.indexOf(NEWLINE);
      end !== -1;
      end = chunk.indexOf(NEWLINE, start)
    ) {
      const head = chunk.subarray(start, end);
      const line =
        pending.length === 0 ? head : Buffer.concat([...pending, head]);
      consumed += pendingBytes + head.length + 1;
      pending = [];
      pendingBytes = 0;
      onLine(decoder.decode(line));
      start = end + 1;
    }
    if (start < chunk.length) {
      // A copy: the stream may reuse the chunk's buffer for the next one.
      pending.push(chunk.slice(start));
      pendingBytes += chunk.length - start;
    }
  }
  return consumed;
};

export class UsageScanner {
  readonly #db: Database;
  readonly #path: string;
  readonly #firstScan = Promise.withResolvers<void>();
  /** Settles once the first scan, full or incremental, has ended. */
  readonly scanned = this.#firstScan.promise;

  /** Where each kept message's `claude` row is, by its key. */
  readonly #claudeRows = new RowIndex();
  /** Where each sidechain message id's `claude_side` row is, by its key. */
  readonly #sideRows = new RowIndex();

  readonly #getMeta;
  readonly #setMeta;
  readonly #getFile;
  readonly #putFile;
  readonly #getClaude;
  readonly #getSide;
  readonly #addClaude;
  readonly #setClaude;
  readonly #addSide;
  readonly #setSide;
  readonly #uncount;
  readonly #seeOpencode;
  readonly #fold;
  readonly #reverse;
  readonly #report;
  readonly #untouch;

  constructor(dir = cawcoDataDir()) {
    mkdirSync(dir, { recursive: true });
    // The JSON watermarks this store replaced (schema 1 of usage-index.json).
    rmSync(join(dir, "usage-index.json"), { force: true });
    this.#path = join(dir, "usage.db");
    this.#db = new Database(this.#path, { create: true });
    this.#db.exec(
      `PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -${PAGE_CACHE_KIB};`
    );
    this.#dropIfOther();
    this.#db.exec(SCHEMA);
    const db = this.#db;
    this.#getMeta = db.query<{ value: number }, [string]>(
      "SELECT value FROM meta WHERE key = ?"
    );
    this.#setMeta = db.query<unknown, [string, number]>(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value"
    );
    this.#getFile = db.query<FileRow, [string]>(
      "SELECT mtime_ms, size, offset FROM files WHERE path = ?"
    );
    this.#putFile = db.query<unknown, [string, number, number, number]>(
      `INSERT INTO files (path, mtime_ms, size, offset) VALUES (?, ?, ?, ?)
       ON CONFLICT (path) DO UPDATE SET mtime_ms = excluded.mtime_ms, size = excluded.size, offset = excluded.offset`
    );
    this.#getClaude = db.query<ClaudeRow, [number]>(
      "SELECT * FROM claude WHERE id = ?"
    );
    this.#getSide = db.query<SideRow, [number]>(
      "SELECT * FROM claude_side WHERE id = ?"
    );
    type ClaudeValues = [
      string,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    this.#addClaude = db.query<{ id: number }, [string, ...ClaudeValues]>(
      `INSERT INTO claude (key, bucket, side, total, counted, input, output, cache_creation, cache_read, reasoning, cost)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?) RETURNING id`
    );
    this.#setClaude = db.query<unknown, [...ClaudeValues, number]>(
      `UPDATE claude SET bucket = ?, side = ?, total = ?, counted = 1, input = ?, output = ?,
         cache_creation = ?, cache_read = ?, reasoning = ?, cost = ? WHERE id = ?`
    );
    this.#addSide = db.query<{ id: number }, [string, number]>(
      "INSERT INTO claude_side (key, main) VALUES (?, ?) RETURNING id"
    );
    this.#setSide = db.query<unknown, [number, number]>(
      "UPDATE claude_side SET main = ? WHERE id = ?"
    );
    this.#uncount = db.query<unknown, [number]>(
      "UPDATE claude SET counted = 0 WHERE id = ?"
    );
    this.#seeOpencode = db.query<{ id: string }, [string]>(
      "INSERT OR IGNORE INTO opencode_seen (id) VALUES (?) RETURNING id"
    );
    this.#fold = db.query<
      unknown,
      [
        string,
        string,
        number,
        number,
        number,
        string,
        string,
        string | null,
        string,
        string | null,
        number,
        number,
        number,
        number,
        number,
        number,
      ]
    >(
      `INSERT INTO buckets (key, harness, start, first_ts, last_ts, session_id, project, project_path, model, provider,
         input, output, cache_creation, cache_read, reasoning, cost, messages, touched)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
       ON CONFLICT (key) DO UPDATE SET
         input = input + excluded.input, output = output + excluded.output,
         cache_creation = cache_creation + excluded.cache_creation, cache_read = cache_read + excluded.cache_read,
         reasoning = reasoning + excluded.reasoning, cost = cost + excluded.cost, messages = messages + 1,
         first_ts = min(first_ts, excluded.first_ts), last_ts = max(last_ts, excluded.last_ts), touched = 1`
    );
    this.#reverse = db.query<
      unknown,
      [number, number, number, number, number, number, string]
    >(
      `UPDATE buckets SET input = input - ?, output = output - ?, cache_creation = cache_creation - ?,
         cache_read = cache_read - ?, reasoning = reasoning - ?, cost = cost - ?, messages = messages - 1, touched = 1
       WHERE key = ?`
    );
    this.#report = db.query<BucketRow, [number, number]>(
      "SELECT * FROM buckets WHERE start IN (?, ?) OR touched = 1"
    );
    this.#untouch = db.query<unknown, []>(
      "UPDATE buckets SET touched = 0 WHERE touched = 1"
    );
    gauge("usage.dbMB", () => Math.round(statSync(this.#path).size / 2 ** 20));
    gauge(
      "usage.rowIndexKeys",
      () => this.#claudeRows.size + this.#sideRows.size
    );
    this.#loadRows();
  }

  /**
   * Drops every table of a store this code did not lay out (its `version`
   * is another's, or it has none), so the first scan rebuilds it.
   */
  #dropIfOther(): void {
    const hasMeta = this.#db
      .query("SELECT 1 FROM sqlite_master WHERE name = 'meta'")
      .get();
    const version = hasMeta
      ? this.#db
          .query<{ value: number }, []>(
            "SELECT value FROM meta WHERE key = 'version'"
          )
          .get()
      : null;
    if (version?.value === SCANNER_VERSION) {
      return;
    }
    this.#db.transaction(() => {
      for (const table of TABLES) {
        this.#db.exec(`DROP TABLE IF EXISTS ${table}`);
      }
    })();
  }

  /** Fills the row indexes from the store: at open, and after a rolled-back transaction. */
  #loadRows(): void {
    this.#claudeRows.clear();
    this.#sideRows.clear();
    for (const row of this.#db
      .query<{ id: number; key: string }, []>("SELECT id, key FROM claude")
      .iterate()) {
      this.#claudeRows.add(row.key, row.id);
    }
    for (const row of this.#db
      .query<{ id: number; key: string }, []>("SELECT id, key FROM claude_side")
      .iterate()) {
      this.#sideRows.add(row.key, row.id);
    }
  }

  /** The kept message `key` names, if any. */
  #findClaude(key: string): ClaudeRow | null {
    for (const id of this.#claudeRows.candidates(key)) {
      const row = this.#getClaude.get(id);
      if (row?.key === key) {
        return row;
      }
    }
    return null;
  }

  /** The `claude_side` row of sidechain key `key`, if any. */
  #findSide(key: string): SideRow | null {
    for (const id of this.#sideRows.candidates(key)) {
      const row = this.#getSide.get(id);
      if (row?.key === key) {
        return row;
      }
    }
    return null;
  }

  #meta(key: string): number | undefined {
    return this.#getMeta.get(key)?.value;
  }

  /**
   * Whether a full rebuild could change what the store holds: it was costed
   * under other rates (a refresh brought a new model's price, or changed
   * one), built by other scanner code, or not healed for {@link HEAL_MS}.
   */
  #rebuildDue(): boolean {
    return (
      Date.now() - (this.#meta("last_full_rebuild") ?? 0) >= HEAL_MS ||
      this.#meta("rates") !== ratesFingerprint() ||
      this.#meta("version") !== SCANNER_VERSION
    );
  }

  /** Folds `rec` into its bucket; answers the bucket's key, its quarter hour first. */
  #foldIn(rec: ScannedRecord): string {
    const start = bucketStart(rec.ts);
    const key = `${start}:${rec.harness}:${rec.sessionId}:${rec.model}`;
    this.#fold.run(
      key,
      rec.harness,
      start,
      rec.ts,
      rec.ts,
      rec.sessionId,
      rec.project,
      rec.projectPath,
      rec.model,
      rec.provider,
      ...tokenValues(rec.tokens),
      rec.costUsd
    );
    return key;
  }

  /**
   * Takes a kept message's share back out of its bucket, once. firstTs/lastTs
   * are deliberately not reversed: a rare mid-stream replacement leaves at
   * most a stale window edge, which the next full rebuild heals (HEAL_MS,
   * USAGE-SPEC.md §5.1).
   */
  #takeBack(row: ClaudeRow): void {
    if (row.counted === 0) {
      return;
    }
    this.#reverse.run(
      row.input,
      row.output,
      row.cache_creation,
      row.cache_read,
      row.reasoning,
      row.cost,
      row.bucket
    );
    this.#uncount.run(row.id);
  }

  /** Folds `rec` in if it survives dedup (USAGE-SPEC.md §5.2). */
  #ingest(rec: ScannedRecord): void {
    if (rec.harness === "opencode") {
      if (this.#seeOpencode.get(rec.messageId)) {
        this.#foldIn(rec);
      }
      return;
    }

    const mainKey = `${rec.messageId}\u0000${rec.requestId}`;
    const main = this.#findClaude(mainKey);
    if (main && !prefers(rec, main)) {
      return;
    }
    const sideKey = `${rec.messageId}\u0000`;
    const sideRow = rec.isSidechain ? this.#findSide(sideKey) : null;
    const side = sideRow ? this.#getClaude.get(sideRow.main) : null;
    if (side && !prefers(rec, side)) {
      return;
    }

    if (main) {
      this.#takeBack(main);
    }
    const bucket = this.#foldIn(rec);
    const values = [
      bucket,
      rec.isSidechain ? 1 : 0,
      totalTokens(rec.tokens),
      ...tokenValues(rec.tokens),
      rec.costUsd,
    ] as const;
    let mainId: number;
    if (main) {
      this.#setClaude.run(...values, main.id);
      mainId = main.id;
    } else {
      mainId = (this.#addClaude.get(mainKey, ...values) as { id: number }).id;
      this.#claudeRows.add(mainKey, mainId);
    }
    if (rec.isSidechain) {
      this.#keepSide(sideKey, sideRow, side, mainId);
    }
  }

  /**
   * Points sidechain key `sideKey` at kept message `mainId`, taking the share
   * of the message it pointed at before (`side`) back out.
   */
  #keepSide(
    sideKey: string,
    sideRow: SideRow | null,
    side: ClaudeRow | null,
    mainId: number
  ): void {
    if (side && side.id !== mainId) {
      this.#takeBack(side);
    }
    if (!sideRow) {
      const sideId = (this.#addSide.get(sideKey, mainId) as { id: number }).id;
      this.#sideRows.add(sideKey, sideId);
    } else if (sideRow.main !== mainId) {
      this.#setSide.run(mainId, sideRow.id);
    }
  }

  /**
   * Runs `work` as one transaction: all of it lands, or none. A rollback
   * refills the row indexes, which named the rows it took back.
   */
  async #inTransaction(work: () => void | Promise<void>): Promise<void> {
    this.#db.exec("BEGIN");
    try {
      await work();
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      this.#loadRows();
      throw error;
    }
  }

  /**
   * Reads `path` from `offset` and folds each usage line in, then records the
   * new watermark, inside the caller's transaction. The lines are all read
   * before anything is written, so a file that fails to read throws having
   * written nothing; the records a read holds are a few hundred bytes for
   * each assistant message.
   */
  async #scanFile(
    path: string,
    project: string,
    offset: number,
    info: { mtimeMs: number; size: number }
  ): Promise<void> {
    const records: ScannedRecord[] = [];
    const next = await eachLine(path, offset, (line) => {
      const rec = parseClaudeLine(line, project);
      if (rec) {
        records.push(rec);
      }
    });
    for (const rec of records) {
      this.#ingest(rec);
    }
    this.#putFile.run(path, info.mtimeMs, info.size, next);
  }

  /**
   * Folds in the messages each OpenCode database on the machine settled since
   * its own watermark (all of them when `fresh`); a watermark is written only
   * when it moved. A session that moved between servers has the same message
   * ids in both, and the seen set counts each once.
   */
  #scanOpencode(fresh: boolean): void {
    for (const dbPath of opencodeDatabases()) {
      const key = `opencode_max_time_updated:${dbPath}`;
      const since = fresh ? 0 : (this.#meta(key) ?? 0);
      const latest = scanOpencode(dbPath, since, (rec) => this.#ingest(rec));
      if (latest !== since) {
        this.#setMeta.run(key, latest);
      }
    }
  }

  /**
   * Reads every transcript and the opencode DB from scratch, under the rates
   * just refreshed; clears prior state. Each transcript is its own
   * transaction, so the WAL holds one file's pages at a time, not the store's.
   */
  async #rebuild(): Promise<void> {
    this.#db.transaction(() => {
      for (const table of TABLES) {
        this.#db.exec(`DELETE FROM ${table}`);
      }
    })();
    this.#claudeRows.clear();
    this.#sideRows.clear();
    for (const file of await listClaudeFiles()) {
      let info: { mtimeMs: number; size: number };
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each file folds into the shared dedup set and buckets in sequence
        info = await stat(file.path);
      } catch {
        continue;
      }
      await this.#inTransaction(() =>
        this.#scanFile(file.path, file.project, 0, info)
      );
    }
    await this.#inTransaction(() => {
      this.#scanOpencode(true);
      this.#setMeta.run("last_full_rebuild", Date.now());
      this.#setMeta.run("rates", ratesFingerprint());
      this.#setMeta.run("version", SCANNER_VERSION);
    });
  }

  /**
   * Compares watermarks and reads only what changed since the last scan,
   * inside the caller's transaction. A transcript that fails to read is left
   * for the next scan; the others land, and the first failure is answered.
   */
  async #incremental(): Promise<unknown> {
    let failure: unknown;
    for (const file of await listClaudeFiles()) {
      let info: { mtimeMs: number; size: number };
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each file folds into the shared dedup set and buckets in sequence
        info = await stat(file.path);
      } catch {
        continue;
      }
      const wm = this.#getFile.get(file.path);
      if (wm && info.mtimeMs === wm.mtime_ms && info.size === wm.size) {
        continue;
      }
      // Grown: transcripts are append-only, so only the bytes after the
      // watermark are new. Shrunk or rotated: read it whole again.
      const from = wm && info.size > wm.size ? wm.offset : 0;
      try {
        await this.#scanFile(file.path, file.project, from, info);
      } catch (error) {
        failure ??= error;
      }
    }
    this.#scanOpencode(false);
    return failure;
  }

  /**
   * One tick: folds in what changed since the last (or rebuilds the store,
   * when {@link #rebuildDue}) and answers the buckets the hub must (re-)learn.
   * The scan, the report and the report's untouch are one transaction, so a
   * tick commits once however many transcripts moved; a tick where nothing
   * moved writes nothing.
   *
   * Rates are refreshed first (`refreshPricing` throttles itself to 24h and
   * swallows its own failures; offline keeps the snapshot): the bundled
   * snapshot goes stale the moment a new model ships, and a model it does not
   * know prices at 0, which incremental scans never revisit. Refreshed rates
   * that differ from the store's are what make a rebuild due.
   */
  async scan(now: number): Promise<UsageBucket[]> {
    try {
      await refreshPricing();
      if (this.#rebuildDue()) {
        await this.#rebuild();
      }
      let failure: unknown;
      let buckets: UsageBucket[] = [];
      await this.#inTransaction(async () => {
        failure = await this.#incremental();
        // A failed tick reports nothing, so it untouches nothing: what it
        // folded in is reported by the next one.
        if (failure === undefined) {
          buckets = this.#reportBuckets(now);
        }
      });
      if (failure !== undefined) {
        throw failure;
      }
      return buckets;
    } finally {
      this.#firstScan.resolve();
    }
  }

  /**
   * Absolute totals for the buckets the hub must (re-)learn: every bucket in
   * the current and previous quarter hour (still moving) plus anything
   * touched since the last report — after a full rebuild, every bucket. Re-sends
   * are idempotent because the hub upserts by id.
   */
  #reportBuckets(now: number): UsageBucket[] {
    const current = bucketStart(now);
    const buckets = this.#report
      .all(current, current - BUCKET_MS)
      .map((row): UsageBucket => ({
        harness: row.harness,
        start: row.start,
        spanMs: BUCKET_MS,
        firstTs: row.first_ts,
        lastTs: row.last_ts,
        sessionId: row.session_id,
        project: row.project,
        projectPath: row.project_path,
        model: row.model,
        provider: row.provider,
        tokens: {
          input: row.input,
          output: row.output,
          cacheCreation: row.cache_creation,
          cacheRead: row.cache_read,
          reasoning: row.reasoning,
        },
        costUsd: row.cost,
        messages: row.messages,
      }));
    this.#untouch.run();
    return buckets;
  }
}
