import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { UsageBucket, UsageTokens } from "@cawco/core";
import {
  BUCKET_MS,
  bucketStart,
  refreshPricing,
  totalTokens,
} from "@cawco/core";
import { cawcoDataDir, listClaudeFiles } from "@cawco/core/paths";
import { gauge } from "../memory";
import { parseClaudeLine } from "./scan-claude";
import { openDbPath, scanOpencode } from "./scan-opencode";
import type { ScannedRecord } from "./types";

/**
 * The per-machine usage scanner (USAGE-SPEC.md §5). Folds every transcript's
 * usage into absolute bucket totals the hub upserts by bucket id. Incremental
 * scans compare `(mtimeMs, size)` per Claude transcript and a `time_created`
 * watermark for opencode; a full rebuild re-heals and re-costs every 30 min.
 *
 * Its state lives on disk, in `usage.db` under the agent's data dir: the dedup
 * set holds one row per assistant message the machine ever wrote, so it grows
 * with history, and kept in memory it was most of the agent's heap (261k keys,
 * ~140 MB, measured on a 1,500-transcript rig). SQLite's page cache is the
 * only part held in memory, capped at {@link PAGE_CACHE_KIB}. The store also
 * outlives a restart, so a start scans incrementally and the full rebuild
 * waits for its own schedule.
 */

/** SQLite's page cache for the store, in KiB: all of it the agent holds in memory. */
const PAGE_CACHE_KIB = 8192;

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
  key TEXT PRIMARY KEY, bucket TEXT NOT NULL, side INTEGER NOT NULL,
  total INTEGER NOT NULL, counted INTEGER NOT NULL,
  input INTEGER NOT NULL, output INTEGER NOT NULL, cache_creation INTEGER NOT NULL,
  cache_read INTEGER NOT NULL, reasoning INTEGER NOT NULL, cost REAL NOT NULL
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS claude_side (key TEXT PRIMARY KEY, main TEXT NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS opencode_seen (id TEXT PRIMARY KEY) WITHOUT ROWID;
`;

/** A kept Claude message: which bucket it went into and what it added there. */
interface ClaudeRow {
  bucket: string;
  cache_creation: number;
  cache_read: number;
  cost: number;
  /** 0 once its share was taken back out of its bucket. */
  counted: number;
  input: number;
  key: string;
  output: number;
  reasoning: number;
  side: number;
  total: number;
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

  readonly #getMeta;
  readonly #setMeta;
  readonly #getFile;
  readonly #putFile;
  readonly #getClaude;
  readonly #getSide;
  readonly #putClaude;
  readonly #putSide;
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
    this.#getClaude = db.query<ClaudeRow, [string]>(
      "SELECT * FROM claude WHERE key = ?"
    );
    this.#getSide = db.query<ClaudeRow, [string]>(
      "SELECT c.* FROM claude_side s JOIN claude c ON c.key = s.main WHERE s.key = ?"
    );
    this.#putClaude = db.query<
      unknown,
      [
        string,
        string,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ]
    >(
      `INSERT INTO claude (key, bucket, side, total, counted, input, output, cache_creation, cache_read, reasoning, cost)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (key) DO UPDATE SET bucket = excluded.bucket, side = excluded.side, total = excluded.total,
         counted = 1, input = excluded.input, output = excluded.output, cache_creation = excluded.cache_creation,
         cache_read = excluded.cache_read, reasoning = excluded.reasoning, cost = excluded.cost`
    );
    this.#putSide = db.query<unknown, [string, string]>(
      "INSERT INTO claude_side (key, main) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET main = excluded.main"
    );
    this.#uncount = db.query<unknown, [string]>(
      "UPDATE claude SET counted = 0 WHERE key = ?"
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
  }

  get #lastFullRebuild(): number {
    return this.#getMeta.get("last_full_rebuild")?.value ?? 0;
  }

  /** Folds `rec` into its bucket; answers the bucket's key. */
  #foldIn(rec: ScannedRecord): string {
    const start = bucketStart(rec.ts);
    const key = `${rec.harness}:${rec.sessionId}:${rec.model}:${start}`;
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
   * most a stale window edge, which the 30-minute full rebuild heals
   * (USAGE-SPEC.md §5.1).
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
    this.#uncount.run(row.key);
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
    const main = this.#getClaude.get(mainKey);
    if (main && !prefers(rec, main)) {
      return;
    }
    const sideKey = `${rec.messageId}\u0000`;
    const side = rec.isSidechain ? this.#getSide.get(sideKey) : null;
    if (side && !prefers(rec, side)) {
      return;
    }

    if (main) {
      this.#takeBack(main);
    }
    const bucket = this.#foldIn(rec);
    this.#putClaude.run(
      mainKey,
      bucket,
      rec.isSidechain ? 1 : 0,
      totalTokens(rec.tokens),
      ...tokenValues(rec.tokens),
      rec.costUsd
    );
    if (rec.isSidechain) {
      if (side && side.key !== mainKey) {
        this.#takeBack(side);
      }
      this.#putSide.run(sideKey, mainKey);
    }
  }

  /** Runs `work` as one transaction: all of it lands, or none. */
  async #inTransaction(work: () => void | Promise<void>): Promise<void> {
    this.#db.exec("BEGIN");
    try {
      await work();
      this.#db.exec("COMMIT");
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Reads `path` from `offset`, folding each usage line in; records the new watermark. */
  async #scanFile(
    path: string,
    project: string,
    offset: number,
    info: { mtimeMs: number; size: number }
  ): Promise<void> {
    await this.#inTransaction(async () => {
      const next = await eachLine(path, offset, (line) => {
        const rec = parseClaudeLine(line, project);
        if (rec) {
          this.#ingest(rec);
        }
      });
      this.#putFile.run(path, info.mtimeMs, info.size, next);
    });
  }

  async #scanOpencode(since: number): Promise<void> {
    const dbPath = await openDbPath();
    if (!dbPath) {
      return;
    }
    await this.#inTransaction(() => {
      const latest = scanOpencode(dbPath, since, (rec) => this.#ingest(rec));
      this.#setMeta.run("opencode_max_time_created", latest);
    });
  }

  /** Reads every transcript and the opencode DB from scratch; clears prior state. */
  async fullRebuild(): Promise<void> {
    try {
      // Re-cost against the live catalog before re-costing the corpus. The
      // bundled snapshot goes stale the moment a new model ships — and a model
      // it does not know prices at 0, silently, forever, because incremental
      // scans never revisit a bucket they already wrote. The rebuild is the one
      // place that re-costs everything, so it is the one place the rates must be
      // fresh. `refreshPricing` throttles itself to 24h and swallows its own
      // failures; offline keeps the snapshot and the rebuild proceeds.
      await refreshPricing();
      this.#db.exec(
        "DELETE FROM buckets; DELETE FROM claude; DELETE FROM claude_side; DELETE FROM opencode_seen; DELETE FROM files; DELETE FROM meta;"
      );
      for (const file of await listClaudeFiles()) {
        let info: { mtimeMs: number; size: number };
        try {
          // biome-ignore lint/performance/noAwaitInLoops: each file folds into the shared dedup set and buckets in sequence
          info = await stat(file.path);
        } catch {
          continue;
        }
        await this.#scanFile(file.path, file.project, 0, info);
      }
      await this.#scanOpencode(0);
      this.#setMeta.run("last_full_rebuild", Date.now());
    } finally {
      this.#firstScan.resolve();
    }
  }

  /** Compares watermarks and reads only what changed since the last scan. */
  async incremental(): Promise<void> {
    try {
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
        await this.#scanFile(file.path, file.project, from, info);
      }
      await this.#scanOpencode(
        this.#getMeta.get("opencode_max_time_created")?.value ?? 0
      );
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
  reportBuckets(now: number): UsageBucket[] {
    const current = bucketStart(now);
    const buckets = this.#report.all(current, current - BUCKET_MS).map(
      (row): UsageBucket => ({
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
      })
    );
    this.#untouch.run();
    return buckets;
  }

  /** True when the last full rebuild, on this machine's store, is older than `intervalMs`. */
  dueForFullRebuild(intervalMs: number): boolean {
    return Date.now() - this.#lastFullRebuild >= intervalMs;
  }
}
