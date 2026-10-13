/**
 * BM25 search over transcript documents, backed by SQLite FTS5 (bun:sqlite).
 *
 * Subpath export: `@cawco/jsonl-parser/fts5`. Bun-only; the core parser
 * stays runtime-neutral.
 *
 * Layout: a `docs` content table plus an external-content FTS5 table
 * (`tokenize='porter unicode61'`) kept in sync by triggers, so text is
 * stored once and BM25/snippets come for free. A `files` table holds
 * per-file `(size, offset, lines)` checkpoints: transcripts are
 * append-only, so `sync()` re-parses only appended bytes.
 */

import { Database } from "bun:sqlite";
import { readTranscriptTail, type Checkpoint } from "./file.ts";
import { parseMany } from "./pool.ts";
import { typeFilter } from "./scan.ts";
import { extractDoc, type ExtractOptions, type TranscriptDoc } from "./text.ts";

/**
 * A document is one record, deduplicated on its time, `doc_id` and harness
 * (`docs_key`): the same record, read again or copied into a resumed or
 * forked session, carries the same uuid and the same timestamp (Claude Code
 * 2.x rewrites only `sessionId` in a fork's copy). Leading with the time is
 * what keeps the index cheap to write: live records are the newest, so each
 * sync's entries land together at its right edge. Keyed on the random
 * `doc_id` alone, each new document dirtied a page of its own, and that page
 * was most of what a sync wrote. A record with no time is deduplicated on its
 * `doc_id`.
 *
 * Nothing is indexed by `session_id`: search filters on it after the FTS
 * match, never through an index, and `docs_session` cost each live session a
 * page split every other sync.
 */
const DOCS_TABLE = `
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  harness TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  ts TEXT,
  cwd TEXT,
  model TEXT,
  sidechain INTEGER NOT NULL DEFAULT 0,
  tools TEXT,
  text TEXT NOT NULL
);`;

const SCHEMA = `
${DOCS_TABLE}
CREATE UNIQUE INDEX IF NOT EXISTS docs_key ON docs(coalesce(ts, ''), doc_id, harness);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  text, tools,
  content='docs', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, text, tools) VALUES (new.id, new.text, new.tools);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, text, tools) VALUES ('delete', old.id, old.text, old.tools);
END;
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  offset INTEGER NOT NULL,
  lines INTEGER NOT NULL
);
DROP INDEX IF EXISTS docs_session;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export interface SearchOptions {
  limit?: number;
  sessionId?: string;
  role?: "user" | "assistant";
  /** Include sidechain/subagent records (default true). */
  sidechains?: boolean;
  /**
   * Treat `query` as raw FTS5 MATCH syntax (phrases, NEAR, AND/OR).
   * Default false: the query is sanitized into quoted prefix terms.
   */
  raw?: boolean;
}

export interface SearchHit {
  harness: string;
  docId: string;
  sessionId: string;
  role: string;
  timestamp: string | null;
  cwd: string | null;
  model: string | null;
  sidechain: boolean;
  /** BM25 rank; more negative = better match. */
  score: number;
  snippet: string;
}

export interface SyncOptions {
  workers?: number;
  extract?: ExtractOptions;
  /** Documents from another source (opencode), indexed in the sync's last transaction. */
  docs?: TranscriptDoc[];
  /** `meta` values to keep, written in the same transaction, each only when it changed. */
  meta?: Record<string, string>;
}

export interface SyncResult {
  filesScanned: number;
  filesFull: number;
  filesTailed: number;
  filesUnchanged: number;
  docsAdded: number;
  errors: { path: string; error: string }[];
}

/** Turn free text into a safe FTS5 MATCH expression: quoted prefix terms. */
export function toMatchQuery(text: string): string {
  const terms = text
    .split(/\s+/)
    .map((t) => t.replaceAll('"', ""))
    .filter((t) => t.length > 0);
  return terms.map((t) => `"${t}"*`).join(" ");
}

/**
 * How many transcript bytes a full parse takes on at once. A parse returns
 * every doc of every file it was given, and those are held until indexed: a
 * first sync handed the whole corpus to one parse took an agent to 4.8 GB RSS
 * on a 7 GB corpus. Batches of this size are parsed and indexed in turn.
 */
const FULL_PARSE_BATCH_BYTES = 128 * 1024 * 1024;

/**
 * How many transcript bytes one write transaction takes on, at most. A sync
 * gathers every file's new documents and checkpoint and commits them
 * together: each commit writes the pages it touched (FTS5 writes a new
 * segment, its structure record and the B-tree pages above them), so one
 * commit per file per sync cost ten times what one per sync does with ten
 * live sessions. Only a catch-up reaches this bound; it keeps the journal,
 * and the documents held for it, to one bounded slice at a time.
 */
const WRITE_BATCH_BYTES = 32 * 1024 * 1024;

/** One transcript's new documents and where it was read up to. */
interface FileWrite {
  path: string;
  docs: TranscriptDoc[];
  checkpoint: Checkpoint;
  /** Transcript bytes consumed: what {@link WRITE_BATCH_BYTES} bounds. */
  bytes: number;
}

/**
 * `files` in order, as consecutive batches of at most `limit` bytes each; a
 * file larger than `limit` is a batch of its own.
 */
function byteBatches(files: { path: string; size: number }[], limit: number): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let bytes = 0;
  for (const { path, size } of files) {
    if (batch.length > 0 && bytes + size > limit) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(path);
    bytes += size;
  }
  if (batch.length > 0) {
    batches.push(batch);
  }
  return batches;
}

export class TranscriptIndex {
  readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    // journal_mode: the index only grows, and a rollback journal writes a
    // page added past the end of the file once, where WAL writes every page
    // twice (to the log, then back at checkpoint). Only the few existing pages
    // a sync changes are journaled. Measured over four simulated hours of ten
    // sessions writing, synced every ten minutes: 9.5 KB/s in WAL, 6.1 KB/s
    // with this. The agent is the index's one connection, so WAL's readers
    // beside a writer bought nothing.
    // synchronous: FULL is the rollback journal's default and what keeps it
    // from corrupting on power loss; NORMAL there is "Maybe not consistent"
    // (https://www.sqlite.org/pragma.html#pragma_synchronous). Its extra syncs
    // write no extra pages.
    // busy_timeout: a reader from outside (the sqlite3 shell, a probe) holds
    // its lock for a query's length; a commit waits that out, not fails.
    // temp_store: FTS5 flushes its pending terms (and merges segments) in the
    // middle of an insert once they pass 1 MB, and SQLite journals every page
    // that statement touches, spilling past 64 KB to a temp file: measured, a
    // tenth of a sync's writes went to `etilqs_*` files. In memory, they cost
    // a few MB of RAM for the moment of the flush.
    this.db.exec(
      "PRAGMA journal_mode = TRUNCATE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
    );
    this.#dropDocIdKey();
    this.db.exec(SCHEMA);
  }

  /**
   * An index made before `docs_key` holds `docs` with `UNIQUE(harness,
   * doc_id)`, which only a new table drops: its rows are copied across with
   * their ids, so the FTS index over them stays as it is. Once, in one
   * transaction.
   */
  #dropDocIdKey(): void {
    const old = this.db
      .query("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_autoindex_docs_1'")
      .get();
    if (!old) {
      return;
    }
    this.db.transaction(() => {
      this.db.exec(`
        ${DOCS_TABLE.replace("docs (", "docs_next (")}
        INSERT INTO docs_next SELECT id, harness, doc_id, session_id, role, ts, cwd, model, sidechain, tools, text FROM docs;
        DROP TRIGGER IF EXISTS docs_ai;
        DROP TRIGGER IF EXISTS docs_ad;
        DROP TABLE docs;
        ALTER TABLE docs_next RENAME TO docs;
      `);
    })();
  }

  close(): void {
    this.db.close();
  }

  /**
   * Insert documents (deduplicated on (harness, doc_id)) in one transaction,
   * returning how many were new.
   *
   * Counted off `RETURNING`, which yields a row only for an insert the
   * `OR IGNORE` let through, and never for the FTS trigger's writes. It used
   * to be the `count(*)` of `docs` before and after, and `count(*)` scans the
   * whole table: two scans per transcript on every sync, all on the daemon's
   * one thread. Measured on a 170 MB index: 11.6s of a 12.8s event-loop stall
   * were those scans, and a daemon that frozen hears its hub socket close only
   * when it thaws.
   */
  indexDocs(docs: TranscriptDoc[]): number {
    if (docs.length === 0) {
      return 0;
    }
    return this.db.transaction(() => this.#insertDocs(docs))();
  }

  /** Inserts `docs` in the caller's transaction; answers how many were new. */
  #insertDocs(docs: TranscriptDoc[]): number {
    const insert = this.db.query(
      `INSERT OR IGNORE INTO docs (harness, doc_id, session_id, role, ts, cwd, model, sidechain, tools, text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    let added = 0;
    for (const doc of docs) {
      const row = insert.get(
        doc.harness,
        doc.id,
        doc.sessionId,
        doc.role,
        doc.timestamp ?? null,
        doc.cwd ?? null,
        doc.model ?? null,
        doc.sidechain ? 1 : 0,
        doc.tools ?? null,
        doc.text,
      );
      if (row) {
        added += 1;
      }
    }
    return added;
  }

  /**
   * Commits `writes`, then `docs` and the `meta` values that changed, as one
   * transaction, answering how many documents were new. Each file's inserts
   * get a turn of the event loop of their own: a catch-up of many files is
   * otherwise one unbroken block on the daemon's only thread. A transaction
   * that would write nothing is not begun.
   */
  async #commit(
    writes: FileWrite[],
    docs: TranscriptDoc[] = [],
    meta: Record<string, string> = {},
  ): Promise<number> {
    const getMeta = this.db.query("SELECT value FROM meta WHERE key = ?");
    const changed = Object.entries(meta).filter(
      ([key, value]) => (getMeta.get(key) as { value: string } | null)?.value !== value,
    );
    if (writes.length === 0 && docs.length === 0 && changed.length === 0) {
      return 0;
    }
    const putCheckpoint = this.db.query(
      `INSERT INTO files (path, size, offset, lines) VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET size = excluded.size, offset = excluded.offset, lines = excluded.lines`,
    );
    const putMeta = this.db.query(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    let added = 0;
    this.db.exec("BEGIN");
    try {
      for (const write of writes) {
        // biome-ignore lint/performance/noAwaitInLoops: the await is the yield; the files are written one at a time on purpose.
        await new Promise((resolve) => setImmediate(resolve));
        added += this.#insertDocs(write.docs);
        putCheckpoint.run(
          write.path,
          write.checkpoint.size,
          write.checkpoint.offset,
          write.checkpoint.lines,
        );
      }
      added += this.#insertDocs(docs);
      for (const [key, value] of changed) {
        putMeta.run(key, value);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return added;
  }

  /**
   * Index a set of transcript files incrementally. New files get a parallel
   * full parse; files with a valid checkpoint get an in-process tail read of
   * appended bytes only; unchanged files are skipped entirely. Everything a
   * sync found, `options.docs` and `options.meta` included, is committed
   * together ({@link WRITE_BATCH_BYTES}).
   */
  async sync(files: string[], options: SyncOptions = {}): Promise<SyncResult> {
    const getCheckpoint = this.db.query("SELECT size, offset, lines FROM files WHERE path = ?");
    const result: SyncResult = {
      filesScanned: files.length,
      filesFull: 0,
      filesTailed: 0,
      filesUnchanged: 0,
      docsAdded: 0,
      errors: [],
    };

    const fullFiles: { path: string; size: number }[] = [];
    const tailFiles: { path: string; checkpoint: Checkpoint }[] = [];
    const { stat } = await import("node:fs/promises");
    await Promise.all(
      files.map(async (path) => {
        const checkpoint = getCheckpoint.get(path) as Checkpoint | null;
        let size: number;
        try {
          size = (await stat(path)).size;
        } catch (error) {
          result.errors.push({
            path,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        if (!checkpoint || checkpoint.offset > size) {
          fullFiles.push({ path, size });
        } else if (checkpoint.offset < size) {
          tailFiles.push({ path, checkpoint });
        } else {
          result.filesUnchanged++;
        }
      }),
    );

    // What this sync will commit, flushed early only when a catch-up makes it
    // large (WRITE_BATCH_BYTES).
    let pending: FileWrite[] = [];
    let pendingBytes = 0;
    const gather = async (write: FileWrite) => {
      pending.push(write);
      pendingBytes += write.bytes;
      if (pendingBytes >= WRITE_BATCH_BYTES) {
        result.docsAdded += await this.#commit(pending);
        pending = [];
        pendingBytes = 0;
      }
    };

    // New (or reset) files: parallel full parse in workers, a batch at a time,
    // each batch gathered before the next is parsed (FULL_PARSE_BATCH_BYTES).
    for (const batch of byteBatches(fullFiles, FULL_PARSE_BATCH_BYTES)) {
      // biome-ignore lint/performance/noAwaitInLoops: one batch's docs in memory at a time is the point
      const parsed = await parseMany(batch, {
        mode: "docs",
        types: ["user", "assistant"],
        extract: options.extract,
        workers: options.workers,
      });
      for (const file of parsed) {
        if (file.error !== undefined) {
          result.errors.push({ path: file.path, error: file.error });
          continue;
        }
        result.filesFull++;
        await gather({
          path: file.path,
          docs: file.docs ?? [],
          checkpoint: { size: file.stats.bytes, offset: file.stats.bytes, lines: file.stats.lines },
          bytes: file.stats.bytes,
        });
      }
    }

    // Grown files: tail reads are small, run in-process.
    const prefilter = typeFilter("user", "assistant");
    for (const { path, checkpoint } of tailFiles) {
      let write: FileWrite;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one tail read at a time; they are small
        const tail = await readTranscriptTail(path, checkpoint, { prefilter });
        const docs: TranscriptDoc[] = [];
        for (const located of tail.records) {
          const doc = extractDoc(located.record, options.extract);
          if (doc) {
            docs.push(doc);
          }
        }
        result.filesTailed++;
        write = {
          path,
          docs,
          checkpoint: tail.checkpoint,
          bytes: tail.checkpoint.offset - checkpoint.offset,
        };
      } catch (error) {
        result.errors.push({ path, error: error instanceof Error ? error.message : String(error) });
        continue;
      }
      await gather(write);
    }

    result.docsAdded += await this.#commit(pending, options.docs, options.meta);
    return result;
  }

  /** BM25 search. Tool-name hits are weighted 3x over body text. */
  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const match = options.raw ? query : toMatchQuery(query);
    if (match.length === 0) {
      return [];
    }
    const filters: string[] = [];
    const params: (string | number)[] = [match];
    if (options.sessionId !== undefined) {
      filters.push("AND d.session_id = ?");
      params.push(options.sessionId);
    }
    if (options.role !== undefined) {
      filters.push("AND d.role = ?");
      params.push(options.role);
    }
    if (options.sidechains === false) {
      filters.push("AND d.sidechain = 0");
    }
    params.push(options.limit ?? 20);
    const rows = this.db
      .prepare(
        `SELECT d.harness, d.doc_id, d.session_id, d.role, d.ts, d.cwd, d.model, d.sidechain,
                bm25(docs_fts, 1.0, 3.0) AS score,
                snippet(docs_fts, 0, '「', '」', '…', 16) AS snip
         FROM docs_fts
         JOIN docs d ON d.id = docs_fts.rowid
         WHERE docs_fts MATCH ? ${filters.join(" ")}
         ORDER BY rank
         LIMIT ?`,
      )
      .all(...params) as {
      harness: string;
      doc_id: string;
      session_id: string;
      role: string;
      ts: string | null;
      cwd: string | null;
      model: string | null;
      sidechain: number;
      score: number;
      snip: string;
    }[];
    return rows.map((row) => ({
      harness: row.harness,
      docId: row.doc_id,
      sessionId: row.session_id,
      role: row.role,
      timestamp: row.ts,
      cwd: row.cwd,
      model: row.model,
      sidechain: row.sidechain === 1,
      score: row.score,
      snippet: row.snip,
    }));
  }

  /** Document count in the index. */
  count(): number {
    return (this.db.prepare("SELECT count(*) AS c FROM docs").get() as { c: number }).c;
  }
}
