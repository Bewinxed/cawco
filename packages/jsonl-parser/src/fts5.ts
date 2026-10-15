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
import { rmSync } from "node:fs";
import { readTranscriptTail, type Checkpoint } from "./file.ts";
import { parseMany } from "./pool.ts";
import { typeFilter } from "./scan.ts";
import { type DocAuthor, extractDoc, type ExtractOptions, type TranscriptDoc } from "./text.ts";

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
 * The harness, session, role, author, cwd and model are the same few strings
 * on row after row, so a row holds each as the id of its one copy in
 * `strings`. As text they were ~100 of a row's ~320 bytes, and half the rows
 * (a tool call's record, found by its tool's name) carry no text at all:
 * written in full, they made the bulk of what a sync adds to the file.
 *
 * `author` is who the words are ({@link DocAuthor}): the person's own turns
 * are told apart from what a harness or CawCo put under the user's role, so
 * "said by me" is only the person, and a search weighs the person's words and
 * a delegate's report over the rest. `thinking` is apart from `text`, so a
 * match in what a model thought weighs less than one in what it said.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS strings (id INTEGER PRIMARY KEY, value TEXT NOT NULL UNIQUE);
CREATE TABLE IF NOT EXISTS docs (
  id INTEGER PRIMARY KEY,
  harness INTEGER NOT NULL,
  doc_id TEXT NOT NULL,
  session INTEGER NOT NULL,
  role INTEGER NOT NULL,
  author INTEGER NOT NULL,
  ts TEXT,
  cwd INTEGER,
  model INTEGER,
  sidechain INTEGER NOT NULL DEFAULT 0,
  tools TEXT,
  thinking TEXT,
  text TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS docs_key ON docs(coalesce(ts, ''), doc_id, harness);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  text, thinking, tools,
  content='docs', content_rowid='id',
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts(rowid, text, thinking, tools) VALUES (new.id, new.text, new.thinking, new.tools);
END;
CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, text, thinking, tools) VALUES ('delete', old.id, old.text, old.thinking, old.tools);
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

/**
 * How much a match weighs by whose words it is in: the person's own words
 * and a delegate's report are what a search is usually after (a request, a
 * decision, a conclusion), a model's prose next, and what a harness or CawCo
 * put under the user's role (notices, command echoes) least. Our own call,
 * from the task model's T3 and T6 (docs/tom/find-and-mention.md).
 */
const AUTHOR_WEIGHT: Record<DocAuthor, number> = {
  owner: 2,
  report: 1.6,
  agent: 1,
  injected: 0.3,
};

/**
 * BM25's weight of each FTS column, in the table's order (text, thinking,
 * tools): what a model thought counts for less than what was said, and a tool's
 * name for less still. Our own call.
 */
const COLUMN_WEIGHTS = "1.0, 0.35, 0.25";

/**
 * The tiers a search ranks in, newest first: the newest 2,000 documents,
 * then the newest 20,000, then the rest, each only while the tiers before it
 * leave the answer short. BM25 is computed for every document a query
 * matches and FTS5 has no early stop: a common word (in 87% of documents)
 * scored 350,000 matches in a 400,000-document index, 440 ms at p95, and
 * still 100 ms scored across a 20,000-document tier. A common word fills the
 * answer in the first tier for a few ms; a rare word walks on to the whole
 * history, paying only for its own few matches. Rowids grow with when a
 * document was written ({@link TranscriptIndex.sync} inserts a catch-up
 * oldest first), so a tier is the rowids above `max(id)` less its size, read
 * in constant time, and FTS5 seeks to it in each doclist. Recent first is
 * what a search is after (docs/tom/find-and-mention.md, T1 and T3).
 */
const RECENT_TIERS = [2000, 20_000];

/**
 * How long the word being typed must be to match as the start of longer
 * ones: two letters expand to thousands of terms while discriminating nothing.
 */
const PREFIX_MIN = 3;

/** How many moments of one conversation a search answers with. */
const MOMENTS_PER_CONVERSATION = 3;

/** How much each of a conversation's moments counts in its score, best first. */
const MOMENT_COUNTS = [1, 0.3, 0.15];

/**
 * How many matching documents a search ranks before it groups them by
 * conversation: enough that a conversation with many matching lines does not
 * crowd every other out of a short answer.
 */
const SCAN_PER_CONVERSATION = 12;

export interface SearchOptions {
  /** How many conversations to answer with (default 20). */
  limit?: number;
  /** Only documents by this author: `owner` is "said by me". */
  author?: DocAuthor;
}

/** One place in a conversation that matched: where to open it, and why it matched. */
export interface Moment {
  docId: string;
  role: string;
  author: DocAuthor;
  timestamp: string | null;
  /** BM25 weighed by author; higher is better. */
  score: number;
  /** The matching words, terms between 「 and 」. */
  snippet: string;
}

/** A conversation that matched, with its best few moments, best first. */
export interface ConversationHit {
  harness: string;
  sessionId: string;
  cwd: string | null;
  model: string | null;
  sidechain: boolean;
  /** Its best moment's score, with its next two counting a little; higher is better. */
  score: number;
  moments: Moment[];
}

/** One pass of a search: what it matches, in which rowids, and how its excerpts are read. */
interface Pass {
  match: string;
  /** Excerpts seek each id (a pass of whole words); else they read the pass's matches once. */
  seek: boolean;
  /** The rowids it ranks in, as SQL on `docs_fts.rowid`. */
  within: string;
}

/** A document a pass ranked: its id, its conversation by string ids, its score. */
interface Ranked {
  harness: number;
  id: number;
  pass: Pass;
  score: number;
  session: number;
}

/** A ranked document as an answer names it, with the start of its words. */
interface Described {
  author: DocAuthor;
  cwd: string | null;
  doc_id: string;
  gist: string;
  harness: string;
  id: number;
  model: string | null;
  role: string;
  session_id: string;
  sidechain: number;
  ts: string | null;
}

/** How much of a document's words tell two moments of a conversation apart. */
const GIST_CHARS = 160;
const SPACES = /\s+/g;

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

/**
 * Free text as safe FTS5 MATCH expressions, every word quoted and required:
 * `whole`, each word as itself (porter stemming matches its other forms);
 * `typing`, the last word as the start of longer ones too, the word a
 * person is still typing, once it has {@link PREFIX_MIN} letters. A shorter
 * last word after others is left out until it has them: half a word that
 * short says nothing yet, and required whole it would empty the answer
 * between keystrokes. Alone, a short word is searched as itself.
 *
 * Only the last word is a prefix: FTS5 reads every term a prefix expands to
 * whole before a rowid range or another word narrows it, so a prefix costs
 * what all its expansions' documents cost (a common word's, 51 ms on 400,000
 * documents, where the same word whole in the newest tier cost 0.4 ms).
 */
export function matchQueries(text: string): { typing: string | null; whole: string } {
  const typed = text
    .split(/\s+/)
    .map((t) => t.replaceAll('"', ""))
    .filter((t) => t.length > 0);
  const last = typed.at(-1) ?? "";
  const words = typed.length > 1 && last.length < PREFIX_MIN ? typed.slice(0, -1) : typed;
  const whole = words.map((t) => `"${t}"`).join(" ");
  return {
    whole,
    typing: words.length === typed.length && last.length >= PREFIX_MIN ? `${whole}*` : null,
  };
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
    if (this.#olderLayout()) {
      this.#rebuild(path);
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

  /**
   * Whether `docs` is an older index's: one without `author`, which cannot
   * tell the person's words from what was put under their role, nor a model's
   * thinking from what it said.
   */
  #olderLayout(): boolean {
    const docs = this.db.query("SELECT 1 FROM sqlite_master WHERE name = 'docs'").get();
    return (
      docs !== null &&
      this.db.query("SELECT 1 FROM pragma_table_info('docs') WHERE name = 'author'").get() === null
    );
  }

  /**
   * An older index, deleted and begun again empty: its rows hold neither who
   * said them nor thinking apart, which only the transcripts can tell, so
   * every transcript is read again by the next sync (a catch-up, which
   * {@link WRITE_BATCH_BYTES} and {@link FULL_PARSE_BATCH_BYTES} bound). The
   * index is a copy of the transcripts; nothing in it is lost. Once per index.
   */
  #rebuild(path: string): void {
    this.db.close();
    for (const file of [path, `${path}-journal`, `${path}-wal`, `${path}-shm`]) {
      rmSync(file, { force: true });
    }
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
      `INSERT OR IGNORE INTO docs (harness, doc_id, session, role, author, ts, cwd, model, sidechain, tools, thinking, text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    );
    let added = 0;
    for (const doc of docs) {
      const row = insert.get(
        this.#stringId(doc.harness),
        doc.id,
        this.#stringId(doc.sessionId),
        this.#stringId(doc.role),
        this.#stringId(doc.author),
        doc.timestamp ?? null,
        typeof doc.cwd === "string" ? this.#stringId(doc.cwd) : null,
        typeof doc.model === "string" ? this.#stringId(doc.model) : null,
        doc.sidechain ? 1 : 0,
        doc.tools ?? null,
        doc.thinking ?? null,
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

    const fullFiles: { mtime: number; path: string; size: number }[] = [];
    const tailFiles: { path: string; checkpoint: Checkpoint }[] = [];
    const { stat } = await import("node:fs/promises");
    await Promise.all(
      files.map(async (path) => {
        const checkpoint = getCheckpoint.get(path) as Checkpoint | null;
        let size: number;
        let mtime: number;
        try {
          ({ size, mtimeMs: mtime } = await stat(path));
        } catch (error) {
          result.errors.push({
            path,
            error: error instanceof Error ? error.message : String(error),
          });
          return;
        }
        if (!checkpoint || checkpoint.offset > size) {
          fullFiles.push({ mtime, path, size });
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
    // The one written to longest ago first, so rowids grow with when a
    // document was written, as a search's recent tier reads them
    // ({@link RECENT_TIERS}).
    fullFiles.sort((a, b) => a.mtime - b.mtime);
    for (const batch of byteBatches(fullFiles, FULL_PARSE_BATCH_BYTES)) {
      // biome-ignore lint/performance/noAwaitInLoops: one batch's docs in memory at a time is the point
      const parsed = await parseMany(batch, {
        mode: "docs",
        types: ["user", "assistant"],
        extract: options.extract,
        workers: options.workers,
      });
      // Back in the batch's order: the workers answer shard by shard.
      const order = new Map(batch.map((path, i) => [path, i]));
      const inOrder = parsed.toSorted(
        (a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0),
      );
      for (const file of inOrder) {
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

    // Another source's documents in the order they were written, as a
    // catch-up's files are.
    const docs = options.docs?.toSorted((a, b) =>
      (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
    );
    result.docsAdded += await this.#commit(pending, docs, options.meta);
    return result;
  }

  /**
   * The best `scan` documents `match` finds among the rowids `within` says
   * (by author when `byAuthor` says), as ids and scores only: BM25 weighed
   * by whose words they are, read off ids, never the strings table.
   */
  #ranked(pass: Pass, byAuthor: string, params: (string | number)[], scan: number): Ranked[] {
    const weight = Object.entries(AUTHOR_WEIGHT)
      .flatMap(([author, w]) => {
        const id = this.#strings.get(author);
        return id === undefined ? [] : [`WHEN ${id} THEN ${w}`];
      })
      .join(" ");
    const rows = this.db
      .prepare(
        `SELECT docs_fts.rowid AS id, d.harness AS harness, d.session AS session,
                -bm25(docs_fts, ${COLUMN_WEIGHTS}) * (CASE d.author ${weight} ELSE 1 END) AS score
         FROM docs_fts
         JOIN docs d ON d.id = docs_fts.rowid
         WHERE docs_fts MATCH ? ${byAuthor} AND ${pass.within}
         ORDER BY score DESC
         LIMIT ?`,
      )
      .all(pass.match, ...params, scan) as Omit<Ranked, "pass">[];
    return rows.map((row) => ({ ...row, pass }));
  }

  /** What a search answers of each of `ids`: its record, its names, the start of its words. */
  #described(ids: number[]): Map<number, Described> {
    const rows = this.db
      .prepare(
        `SELECT d.id, h.value AS harness, d.doc_id, s.value AS session_id, r.value AS role,
                a.value AS author, d.ts, c.value AS cwd, m.value AS model, d.sidechain,
                substr(d.text, 1, ${GIST_CHARS}) AS gist
         FROM json_each(?) AS k
         JOIN docs d ON d.id = k.value
         JOIN strings h ON h.id = d.harness
         JOIN strings s ON s.id = d.session
         JOIN strings r ON r.id = d.role
         JOIN strings a ON a.id = d.author
         LEFT JOIN strings c ON c.id = d.cwd
         LEFT JOIN strings m ON m.id = d.model`,
      )
      .all(JSON.stringify(ids)) as Described[];
    return new Map(rows.map((row) => [row.id, row]));
  }

  /**
   * The excerpt of each of `ids` that `pass` found, its terms between 「 and
   * 」. A pass of whole words seeks each id in the index; the last word's
   * prefix pass reads its matches once, since a prefix is merged whole on
   * every read (`matchQueries`).
   */
  #excerpts(pass: Pass, ids: number[]): Map<number, string> {
    const from = pass.seek
      ? "json_each(?) AS k CROSS JOIN docs_fts ON docs_fts.rowid = k.value"
      : "docs_fts JOIN json_each(?) AS k ON k.value = docs_fts.rowid";
    const rows = this.db
      .prepare(
        `SELECT docs_fts.rowid AS id, snippet(docs_fts, -1, '「', '」', '…', 16) AS snip
         FROM ${from}
         WHERE docs_fts MATCH ?`,
      )
      .all(JSON.stringify(ids), pass.match) as { id: number; snip: string }[];
    return new Map(rows.map((row) => [row.id, row.snip]));
  }

  /**
   * The conversations whose words match `query` (every word, in any order;
   * the last also as the start of longer ones), best first, each with its
   * best {@link MOMENTS_PER_CONVERSATION} moments: BM25 over what was said,
   * thought and called ({@link COLUMN_WEIGHTS}), weighed by whose words they
   * are ({@link AUTHOR_WEIGHT}), the newest documents ranked first
   * ({@link RECENT_TIERS}). Moments of a conversation that open with the same
   * words are one moment (a line said again and again). Ranked on ids and
   * scores, then named for those ranked, then excerpted for the moments kept:
   * an excerpt or a name read for every match would cost what the matches
   * cost, and the answer keeps a few.
   */
  search(query: string, options: SearchOptions = {}): ConversationHit[] {
    const { whole, typing } = matchQueries(query);
    if (whole.length === 0) {
      return [];
    }
    const limit = options.limit ?? 20;
    const params: (string | number)[] = [];
    let byAuthor = "";
    if (options.author !== undefined) {
      // An author no row names has no id, and no hits.
      const id = this.#strings.get(options.author);
      if (id === undefined) {
        return [];
      }
      byAuthor = "AND d.author = ?";
      params.push(id);
    }
    const ranked = this.#rankedPasses(whole, typing, byAuthor, params, limit);
    const described = this.#described(ranked.map((row) => row.id));
    const kept = this.#moments(ranked, described);
    const excerpts = new Map<number, string>();
    for (const pass of new Set(kept.flatMap((each) => each.moments.map((moment) => moment.pass)))) {
      const ids = kept.flatMap((each) =>
        each.moments.filter((moment) => moment.pass === pass).map((moment) => moment.id),
      );
      for (const [id, snip] of this.#excerpts(pass, ids)) {
        excerpts.set(id, snip);
      }
    }
    return kept
      .map((each) => ({
        ...each.hit,
        moments: each.moments.flatMap((moment): Moment[] => {
          const row = described.get(moment.id);
          return row
            ? [
                {
                  docId: row.doc_id,
                  role: row.role,
                  author: row.author,
                  timestamp: row.ts,
                  score: moment.score,
                  snippet: excerpts.get(moment.id) ?? row.gist,
                },
              ]
            : [];
        }),
      }))
      .slice(0, limit);
  }

  /**
   * Every word whole, tier by tier, newest first ({@link RECENT_TIERS}); then
   * the last word as the start of longer ones. Each pass only while the
   * passes before it leave fewer than `limit` conversations; each document
   * once, best score first.
   */
  #rankedPasses(
    whole: string,
    typing: string | null,
    byAuthor: string,
    params: (string | number)[],
    limit: number,
  ): Ranked[] {
    const newest =
      (this.db.query("SELECT max(id) AS id FROM docs").get() as { id: number | null }).id ?? 0;
    const floors = [...RECENT_TIERS.map((size) => Math.max(0, newest - size)), 0].filter(
      (floor, i, all) => i === 0 || floor < (all[i - 1] ?? 0),
    );
    const passes: Pass[] = [
      ...floors.map((floor, i) => ({
        match: whole,
        seek: true,
        within:
          i === 0
            ? `docs_fts.rowid > ${floor}`
            : `docs_fts.rowid > ${floor} AND docs_fts.rowid <= ${floors[i - 1]}`,
      })),
      ...(typing ? [{ match: typing, seek: false, within: "1" }] : []),
    ];
    const rows = new Map<number, Ranked>();
    const conversations = new Set<string>();
    for (const pass of passes) {
      if (conversations.size >= limit) {
        break;
      }
      for (const row of this.#ranked(pass, byAuthor, params, limit * SCAN_PER_CONVERSATION)) {
        if (!rows.has(row.id)) {
          rows.set(row.id, row);
          conversations.add(`${row.harness}:${row.session}`);
        }
      }
    }
    return [...rows.values()].toSorted((a, b) => b.score - a.score);
  }

  /**
   * The ranked documents gathered by conversation, best first: each
   * conversation's best {@link MOMENTS_PER_CONVERSATION} moments, near-same
   * ones folded, scored by its best moment with the next two counting a
   * little ({@link MOMENT_COUNTS}).
   */
  #moments(
    ranked: Ranked[],
    described: Map<number, Described>,
  ): { hit: Omit<ConversationHit, "moments">; moments: Ranked[] }[] {
    const conversations = new Map<
      string,
      { hit: Omit<ConversationHit, "moments">; moments: Ranked[]; said: Set<string> }
    >();
    for (const row of ranked) {
      const doc = described.get(row.id);
      if (!doc) {
        continue;
      }
      const key = `${doc.harness}\u0000${doc.session_id}`;
      const held = conversations.get(key) ?? {
        hit: {
          harness: doc.harness,
          sessionId: doc.session_id,
          cwd: doc.cwd,
          model: doc.model,
          sidechain: doc.sidechain === 1,
          score: 0,
        },
        moments: [],
        said: new Set<string>(),
      };
      conversations.set(key, held);
      const gist = doc.gist.replace(SPACES, " ").trim().toLowerCase();
      if (held.moments.length < MOMENTS_PER_CONVERSATION && !held.said.has(gist)) {
        held.said.add(gist);
        held.moments.push(row);
      }
    }
    return [...conversations.values()]
      .map(({ hit, moments }) => ({
        hit: {
          ...hit,
          score: moments.reduce(
            (sum, moment, i) => sum + moment.score * (MOMENT_COUNTS[i] ?? 0),
            0,
          ),
        },
        moments,
      }))
      .toSorted((a, b) => b.hit.score - a.hit.score);
  }

  /** Document count in the index. */
  count(): number {
    return (this.db.prepare("SELECT count(*) AS c FROM docs").get() as { c: number }).c;
  }
}
