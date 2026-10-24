/**
 * Transcript search service. Owns a `TranscriptIndex` at a stable
 * agent-local path and keeps it in sync with Claude Code transcripts
 * and OpenCode sessions: in the background, and before a search.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  TranscriptAnswer,
  TranscriptQuery,
  TranscriptTurns,
  TranscriptTurnsQuery,
} from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import {
  listClaudeFiles,
  opencodeDatabases,
  transcriptIndexPath,
} from "@cawco/core/paths";
import type { TranscriptDoc } from "@cawco/jsonl-parser";
import { TranscriptIndex } from "@cawco/jsonl-parser/fts5";
import { readOpenCodeDocs } from "@cawco/jsonl-parser/opencode";
import { inFlight } from "../loop-watch";

/** The `meta` key prefix of each OpenCode database's watermark, followed by its path. */
const WATERMARK = "opencode_watermark:";
/**
 * The `meta` key of when the index's last finished sync began, ms epoch:
 * written with that sync's commit, so a restart knows the index is whole up
 * to then, not catching up. A sync that wrote nothing writes none (fts5.ts
 * `SyncOptions.ended`), so it may name an older sync than the last.
 */
const INDEXED_THROUGH = "indexed_through";

/**
 * How often the index takes in what the transcripts gained when nobody is
 * searching: one transaction each time. Each commit rewrites the pages at the
 * tails of the index's tables and B-trees and starts a new FTS5 segment,
 * whatever it adds, so the interval sets that share of the agent's disk
 * writes: measured over four simulated hours of ten sessions writing, a sync
 * every minute wrote 13.0 KB/s and every ten minutes 9.5 KB/s (in WAL; see
 * the journal mode in fts5.ts). Freshness is not this interval's job: a
 * search brings the index up to date first ({@link SEARCH_FRESH_MS}). It
 * bounds what that sync has to take in: ten minutes of ten busy sessions
 * took 150 ms, inside the hub's 1.5 s answer window.
 */
const SYNC_INTERVAL_MS = 10 * 60_000;
/**
 * How far behind the transcripts a search may answer. Search is the
 * dashboard's jump palette, for finding a session by what was said in it,
 * one query per keystroke (150 ms debounce): the first keystroke syncs, the
 * rest of a burst answer from that sync. A sync that finds nothing new
 * writes nothing.
 */
const SEARCH_FRESH_MS = 10_000;
/**
 * How long a search waits for the sync it starts, ms: inside the hub's 1.5 s
 * window for each machine. A sync still running past it answers from what
 * the index holds so far, saying how far that is ({@link
 * TranscriptAnswer.indexedThrough}), rather than every search timing out at
 * the hub; a search that finds a sync already running waits for none. A
 * sync that fails within it refuses the search with its reason.
 */
const SYNC_WAIT_MS = 1000;
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;
/** How many documents a listing (an author's words, no query) answers with at most. */
const MAX_LISTED_DOCS = 200;
/** The most turns either side of a centre `turns` answers with: `find`'s detailed `around` asks five. */
const MAX_TURNS_SIDE = 10;

/** A failed sync in a few words: SQLite's own message, with its code when it has one. */
function syncFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const { code } = error as Error & { code?: unknown };
  return typeof code === "string" && !error.message.includes(code)
    ? `${error.message}, ${code}`
    : error.message;
}

export class TranscriptSearchService {
  readonly #index: TranscriptIndex;
  #timer: ReturnType<typeof setInterval> | null = null;
  /** The sync in flight: one at a time, which the timer and searches share. */
  #syncing: Promise<void> | null = null;
  /** When the last sync that ended without error began; 0 before one has. */
  #syncedAt = 0;
  /**
   * Every transcript as it stood then is in the index, ms epoch: the start
   * of its last finished sync, kept across restarts ({@link INDEXED_THROUGH}),
   * or how far a catch-up has come (fts5.ts `SyncOptions.progress`); 0 when
   * it can say no time.
   */
  #indexedThrough = 0;
  /** A sync of this index has ever finished: else one running is a catch-up. */
  #whole = false;
  /** Each OpenCode database's watermark, under its `meta` key ({@link WATERMARK} and its path). */
  readonly #openCodeWatermarks = new Map<string, number>();
  /** The last failed sync's reason, logged once; null once a sync succeeds. */
  #failing: string | null = null;
  readonly #firstSync = Promise.withResolvers<void>();
  /** Settles once the first sync has ended, however it ended. */
  readonly synced = this.#firstSync.promise;

  private constructor(index: TranscriptIndex) {
    this.#index = index;
  }

  static async create(): Promise<TranscriptSearchService> {
    const dbPath = transcriptIndexPath();
    await mkdir(dirname(dbPath), { recursive: true });
    const index = new TranscriptIndex(dbPath);
    const svc = new TranscriptSearchService(index);
    const through = Number(index.meta(INDEXED_THROUGH) ?? 0);
    svc.#indexedThrough = through;
    svc.#whole = through > 0;
    const rows = index.db
      .query("SELECT key, value FROM meta WHERE key LIKE ?")
      .all(`${WATERMARK}%`) as { key: string; value: string }[];
    for (const row of rows) {
      svc.#openCodeWatermarks.set(row.key, Number(row.value));
    }
    return svc;
  }

  /**
   * Run one sync cycle, or join the one in flight: claude transcripts +
   * opencode, committed as one transaction, the opencode watermark written
   * only when it moved.
   */
  sync(): Promise<void> {
    if (!this.#syncing) {
      this.#syncing = inFlight("search index syncs", this.#syncOnce())
        .then(
          () => {
            if (this.#failing !== null) {
              console.info("[search] transcript index syncs again");
              this.#failing = null;
            }
          },
          (error: unknown) => {
            // Logged here, once per failure that differs from the last: the
            // timer and every search share this sync, and a broken disk would
            // otherwise say the same thing on every keystroke.
            const reason = syncFailure(error);
            if (reason !== this.#failing) {
              console.warn(
                `[search] transcript index sync failed: ${reason}. Searches on this machine are refused until a sync succeeds.`
              );
              this.#failing = reason;
            }
            throw error;
          }
        )
        .finally(() => {
          this.#syncing = null;
        });
    }
    return this.#syncing;
  }

  async #syncOnce(): Promise<void> {
    const startedAt = Date.now();
    // Every OpenCode server's database: the machine's and each account's.
    const docs: TranscriptDoc[] = [];
    const meta: Record<string, string> = {};
    const watermarks = new Map<string, number>();
    for (const dbPath of opencodeDatabases()) {
      const key = `${WATERMARK}${dbPath}`;
      // biome-ignore lint/performance/noAwaitInLoops: one database at a time, each a rowid range at a time
      const read = await readOpenCodeDocs(dbPath, {
        since: this.#openCodeWatermarks.get(key) ?? 0,
      });
      for (const doc of read.docs) {
        docs.push(doc);
      }
      meta[key] = String(read.watermark);
      watermarks.set(key, read.watermark);
    }
    const claudeFiles = await listClaudeFiles();
    await this.#index.sync(
      claudeFiles.map((f) => f.path),
      {
        docs,
        meta,
        ended: { [INDEXED_THROUGH]: String(startedAt) },
        progress: (through) => {
          this.#indexedThrough = Math.max(this.#indexedThrough, through);
        },
      }
    );
    for (const [key, watermark] of watermarks) {
      this.#openCodeWatermarks.set(key, watermark);
    }
    this.#syncedAt = startedAt;
    this.#indexedThrough = startedAt;
    this.#whole = true;
  }

  /**
   * A transcript was deleted (a purge, from the dashboard or a spin-off
   * discarded): its words leave the index, once the sync in flight, if any,
   * has ended, so the dashboard's Find and every agent's stop finding them.
   */
  async forget(sessionId: string): Promise<void> {
    await this.#syncing?.catch(() => undefined);
    const gone = this.#index.forgetSession(sessionId);
    console.info(
      `[search] transcript ${sessionId} deleted: ${gone} indexed document${gone === 1 ? "" : "s"} forgotten`
    );
  }

  /** Start the background sync loop. First sync is kicked off immediately. */
  start(): void {
    // Fire-and-forget initial sync — must not block startup.
    this.sync()
      .catch(() => {
        // Logged in sync(); a failed initial sync is not fatal.
      })
      .finally(() => this.#firstSync.resolve());
    this.#timer = setInterval(() => {
      this.sync().catch(() => {
        // Logged in sync(); a periodic sync failure must not kill the daemon.
      });
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Search the index, brought up to date first when its last sync began
   * more than {@link SEARCH_FRESH_MS} ago: the conversations that match, each
   * with its best moments, how old the index it answered from is, and what
   * the sync and the query each took.
   */
  async search(
    query: string,
    options?: TranscriptQuery
  ): Promise<TranscriptAnswer> {
    const started = performance.now();
    await this.#fresh();
    const queried = performance.now();
    const limit = Math.min(
      options?.limit ?? DEFAULT_SEARCH_LIMIT,
      MAX_SEARCH_LIMIT
    );
    // No words and an author: that author's words, newest first, off the
    // index's author-and-time order (fts5.ts `listed`), never a scan.
    const conversations = this.#conversations(query, limit, options);
    return {
      conversations,
      // Only a sync of an index that was never whole is a catch-up: a slow
      // sync of a whole one answers from it, as far as `indexedThrough`.
      catchingUp: this.#syncing !== null && !this.#whole,
      indexedThrough: this.#indexedThrough,
      syncMs: Math.round(queried - started),
      queryMs: Math.round(performance.now() - queried),
    };
  }

  /**
   * The index brought up to date when its last sync began more than
   * {@link SEARCH_FRESH_MS} ago and none is running: waited for up to
   * {@link SYNC_WAIT_MS}, then answered from as far as it has come. A sync
   * already running is never waited for: in a catch-up, every search waited
   * its whole second for a sync that ran on for hours. A sync that fails
   * within the wait refuses, with the reason the hub names this machine by.
   */
  async #fresh(): Promise<void> {
    if (
      this.#syncing !== null ||
      Date.now() - this.#syncedAt <= SEARCH_FRESH_MS
    ) {
      return;
    }
    const outcome = await readWithin(SYNC_WAIT_MS, () =>
      this.sync().then(
        () => undefined,
        (error: unknown) => ({ error })
      )
    );
    switch (outcome.kind) {
      case "answered":
        if (outcome.value) {
          throw new Error(
            `its index couldn't update (${syncFailure(outcome.value.error)})`,
            { cause: outcome.value.error }
          );
        }
        return;
      case "unanswered":
        // Still syncing: answered from what is indexed so far.
        return;
      default: {
        const unhandled: never = outcome;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  }

  /**
   * A conversation's turns around one of its records, as the index holds
   * them (fts5.ts `turns`), brought up to date first as a search is: what an
   * agent's `find` reads a hit's turns from, whatever its stored transcript
   * keeps now.
   */
  async turns(query: TranscriptTurnsQuery): Promise<TranscriptTurns> {
    await this.#fresh();
    return this.#index.turns({
      sessions: query.sessions,
      side: Math.min(Math.max(0, query.side), MAX_TURNS_SIDE),
      ...(query.docId ? { docId: query.docId } : {}),
      ...(query.at === undefined ? {} : { at: query.at }),
    });
  }

  /**
   * What the index answers `query`: its matches, best first; with no words
   * and an author, that author's words newest first, off the index's author
   * and time order (fts5.ts `listed`), never a scan.
   */
  #conversations(query: string, limit: number, options?: TranscriptQuery) {
    const author = options?.author;
    const narrowed = {
      ...(options?.sessions ? { sessions: options.sessions } : {}),
      ...(options?.before ? { before: options.before } : {}),
    };
    if (query.trim() === "" && author !== undefined) {
      return this.#index.listed({
        author,
        limit: Math.min(options?.limit ?? MAX_LISTED_DOCS, MAX_LISTED_DOCS),
        ...narrowed,
        ...(options?.since ? { since: options.since } : {}),
        ...(options?.toolOutput ? { toolOutput: true } : {}),
        ...(options?.context ? { context: true } : {}),
      });
    }
    return this.#index.search(query, {
      limit,
      ...(author ? { author } : {}),
      ...narrowed,
      ...(options?.toolOutput ? { toolOutput: true } : {}),
      ...(options?.context ? { context: true } : {}),
    });
  }

  /** Document count in the index. */
  count(): number {
    return this.#index.count();
  }

  close(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#index.close();
  }
}
