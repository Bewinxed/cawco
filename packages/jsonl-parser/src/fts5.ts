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

const SCHEMA = `
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
  text TEXT NOT NULL,
  UNIQUE(harness, doc_id)
);
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
CREATE INDEX IF NOT EXISTS docs_session ON docs(session_id);
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

export class TranscriptIndex {
  readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;");
    this.db.exec(SCHEMA);
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
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO docs (harness, doc_id, session_id, role, ts, cwd, model, sidechain, tools, text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    let added = 0;
    const run = this.db.transaction((batch: TranscriptDoc[]) => {
      for (const doc of batch) {
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
    });
    run(docs);
    return added;
  }

  /**
   * Index a set of transcript files incrementally. New files get a parallel
   * full parse; files with a valid checkpoint get an in-process tail read of
   * appended bytes only; unchanged files are skipped entirely.
   */
  async sync(files: string[], options: SyncOptions = {}): Promise<SyncResult> {
    const getCheckpoint = this.db.prepare("SELECT size, offset, lines FROM files WHERE path = ?");
    const putCheckpoint = this.db.prepare(
      `INSERT INTO files (path, size, offset, lines) VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET size = excluded.size, offset = excluded.offset, lines = excluded.lines`,
    );
    const result: SyncResult = {
      filesScanned: files.length,
      filesFull: 0,
      filesTailed: 0,
      filesUnchanged: 0,
      docsAdded: 0,
      errors: [],
    };

    const fullFiles: string[] = [];
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
          fullFiles.push(path);
        } else if (checkpoint.offset < size) {
          tailFiles.push({ path, checkpoint });
        } else {
          result.filesUnchanged++;
        }
      }),
    );

    // New (or reset) files: parallel full parse in workers.
    if (fullFiles.length > 0) {
      const parsed = await parseMany(fullFiles, {
        mode: "docs",
        types: ["user", "assistant"],
        extract: options.extract,
        workers: options.workers,
      });
      for (const file of parsed) {
        // One file's inserts per turn of the event loop, as the tail loop
        // below already gets from its reads: a catch-up of many new files is
        // otherwise one unbroken block on the daemon's only thread.
        // biome-ignore lint/performance/noAwaitInLoops: the await is the yield; the files are indexed one at a time on purpose.
        await new Promise((resolve) => setImmediate(resolve));
        if (file.error !== undefined) {
          result.errors.push({ path: file.path, error: file.error });
          continue;
        }
        result.filesFull++;
        result.docsAdded += this.indexDocs(file.docs ?? []);
        putCheckpoint.run(file.path, file.stats.bytes, file.stats.bytes, file.stats.lines);
      }
    }

    // Grown files: tail reads are small, run in-process.
    const prefilter = typeFilter("user", "assistant");
    for (const { path, checkpoint } of tailFiles) {
      try {
        const tail = await readTranscriptTail(path, checkpoint, { prefilter });
        const docs: TranscriptDoc[] = [];
        for (const located of tail.records) {
          const doc = extractDoc(located.record, options.extract);
          if (doc) {
            docs.push(doc);
          }
        }
        result.filesTailed++;
        result.docsAdded += this.indexDocs(docs);
        putCheckpoint.run(
          path,
          tail.checkpoint.size,
          tail.checkpoint.offset,
          tail.checkpoint.lines,
        );
      } catch (error) {
        result.errors.push({ path, error: error instanceof Error ? error.message : String(error) });
      }
    }

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
