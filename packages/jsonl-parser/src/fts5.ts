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
import { renameSync, rmSync } from "node:fs";
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
 * Nothing is indexed by the session: search filters on it after the FTS
 * match, never through an index, and `docs_session` cost each live session a
 * page split every other sync.
 *
 * The harness, session, role, cwd and model are the same few strings on row
 * after row, so a row holds each as the id of its one copy in `strings`. As
 * text they were ~100 of a row's ~320 bytes, and half the rows (a tool call's
 * record, found by its tool's name) carry no text at all: written in full,
 * they made the bulk of what a sync adds to the file.
 */
const DOCS_TABLE = `
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  harness INTEGER NOT NULL,
  doc_id TEXT NOT NULL,
  session INTEGER NOT NULL,
  role INTEGER NOT NULL,
  ts TEXT,
  cwd INTEGER,
  model INTEGER,
  sidechain INTEGER NOT NULL DEFAULT 0,
  tools TEXT,
  text TEXT NOT NULL
);`;

const STRINGS_TABLE = `
CREATE TABLE IF NOT EXISTS strings (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE);`;

const SCHEMA = `
${STRINGS_TABLE}
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
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * How many of FTS5's segments on one level wait to be merged: its most, where
 * the default is 4 ("FTS5 begins to merge b-trees together once there exist M
 * or more b-trees with the same level, where M is the value of the
 * 'automerge' parameter. The maximum allowed value ... is 16",
 * https://www.sqlite.org/fts5.html#the_automerge_configuration_option).
 * Each sync's commit is a segment, and a merge writes its segments' postings
 * again and frees the old pages, which the next inserts reuse, and a rollback
 * journal copies out every reused page first. Measured on the disk probe's
 * corpus, six ten-minute syncs: 16.4 MB written at 4, 14.9 MB at 16; the
 * first sync after a catch-up (which merges the catch-up's segments) 4.8 MB
 * at 4, 3.3 MB at 16. A search reads every segment: 27 ms a query at 4, 29
 * at 16.
 */
const FTS_AUTOMERGE = 16;

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
  db: Database;
  /** `strings`, held whole: each value's id. */
  readonly #strings = new Map<string, number>();

  constructor(path: string) {
    this.db = this.#open(path);
    if (this.#rowsHoldStrings()) {
      this.#internStrings(path);
    }
    this.db.exec(SCHEMA);
    const automerge = this.db
      .query("SELECT v FROM docs_fts_config WHERE k = 'automerge'")
      .get() as { v: number } | null;
    if (automerge?.v !== FTS_AUTOMERGE) {
      this.db
        .query("INSERT INTO docs_fts(docs_fts, rank) VALUES ('automerge', ?)")
        .run(FTS_AUTOMERGE);
    }
    this.#reloadStrings();
  }

  #open(path: string): Database {
    const db = new Database(path, { create: true });
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
    db.exec(
      "PRAGMA journal_mode = TRUNCATE; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000; PRAGMA temp_store = MEMORY;",
    );
    return db;
  }

  /** Whether `docs` is an older index's, holding its strings in every row. */
  #rowsHoldStrings(): boolean {
    return (
      this.db.query("SELECT 1 FROM pragma_table_info('docs') WHERE name = 'session_id'").get() !==
      null
    );
  }

  /**
   * An older index's rows, each string replaced by its id in `strings`, in
   * one transaction: copied across with their ids and text, so the FTS index
   * over them stays as it is. Dropping the old table leaves its pages free,
   * and a rollback journal copies out every free page a later insert reuses,
   * so the file is then rewritten compact (`VACUUM INTO`) and put in place by
   * a rename: a crash before it leaves the converted index, only not compact.
   * Once per index.
   */
  #internStrings(path: string): void {
    const id = (column: string) => `(SELECT id FROM strings WHERE value = d.${column})`;
    this.db.transaction(() => {
      this.db.exec(`
        ${STRINGS_TABLE}
        INSERT OR IGNORE INTO strings (value)
          SELECT harness FROM docs UNION SELECT session_id FROM docs UNION SELECT role FROM docs
          UNION SELECT cwd FROM docs WHERE cwd IS NOT NULL UNION SELECT model FROM docs WHERE model IS NOT NULL;
        ${DOCS_TABLE.replace("docs (", "docs_next (")}
        INSERT INTO docs_next
          SELECT d.id, ${id("harness")}, d.doc_id, ${id("session_id")}, ${id("role")}, d.ts,
            ${id("cwd")}, ${id("model")}, d.sidechain, d.tools, d.text
          FROM docs d;
        DROP TRIGGER IF EXISTS docs_ai;
        DROP TRIGGER IF EXISTS docs_ad;
        DROP TABLE docs;
        ALTER TABLE docs_next RENAME TO docs;
      `);
    })();
    const compact = `${path}.compact`;
    rmSync(compact, { force: true });
    this.db.query("VACUUM INTO ?").run(compact);
    this.db.close();
    renameSync(compact, path);
    this.db = this.#open(path);
  }

  /** `value`'s id in `strings`, added in the caller's transaction when new. */
  #stringId(value: string): number {
    let id = this.#strings.get(value);
    if (id === undefined) {
      id = (
        this.db.query("INSERT INTO strings (value) VALUES (?) RETURNING id").get(value) as {
          id: number;
        }
      ).id;
      this.#strings.set(value, id);
    }
    return id;
  }

  /** `strings` read afresh: a transaction rolled back takes the ids it added with it. */
  #reloadStrings(): void {
    this.#strings.clear();
    for (const row of this.db.query("SELECT id, value FROM strings").all() as {
      id: number;
      value: string;
    }[]) {
      this.#strings.set(row.value, row.id);
    }
  }

  close(): void {
    this.db.close();
  }

  /**
   * Insert documents (deduplicated on `docs_key`) in one transaction,
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
    try {
      return this.db.transaction(() => this.#insertDocs(docs))();
    } catch (error) {
      this.#reloadStrings();
      throw error;
    }
  }

  /** Inserts `docs` in the caller's transaction; answers how many were new. */
  #insertDocs(docs: TranscriptDoc[]): number {
    const insert = this.db.query(
      `INSERT OR IGNORE INTO docs (harness, doc_id, session, role, ts, cwd, model, sidechain, tools, text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    let added = 0;
    for (const doc of docs) {
      const row = insert.get(
        this.#stringId(doc.harness),
        doc.id,
        this.#stringId(doc.sessionId),
        this.#stringId(doc.role),
        doc.timestamp ?? null,
        typeof doc.cwd === "string" ? this.#stringId(doc.cwd) : null,
        typeof doc.model === "string" ? this.#stringId(doc.model) : null,
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
      this.#reloadStrings();
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
    // A session or role no row names has no id, and no hits.
    for (const [column, value] of [
      ["session", options.sessionId],
      ["role", options.role],
    ] as const) {
      if (value === undefined) {
        continue;
      }
      const id = this.#strings.get(value);
      if (id === undefined) {
        return [];
      }
      filters.push(`AND d.${column} = ?`);
      params.push(id);
    }
    if (options.sidechains === false) {
      filters.push("AND d.sidechain = 0");
    }
    params.push(options.limit ?? 20);
    const rows = this.db
      .prepare(
        `SELECT h.value AS harness, d.doc_id, s.value AS session_id, r.value AS role, d.ts,
                c.value AS cwd, m.value AS model, d.sidechain,
                bm25(docs_fts, 1.0, 3.0) AS score,
                snippet(docs_fts, 0, '「', '」', '…', 16) AS snip
         FROM docs_fts
         JOIN docs d ON d.id = docs_fts.rowid
         JOIN strings h ON h.id = d.harness
         JOIN strings s ON s.id = d.session
         JOIN strings r ON r.id = d.role
         LEFT JOIN strings c ON c.id = d.cwd
         LEFT JOIN strings m ON m.id = d.model
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
