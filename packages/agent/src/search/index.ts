/**
 * Transcript search service. Owns a `TranscriptIndex` at a stable
 * agent-local path and keeps it in sync with Claude Code transcripts
 * and OpenCode sessions: in the background, and before a search.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { listClaudeFiles, transcriptIndexPath } from "@cawco/core/paths";
import { type SearchHit, TranscriptIndex } from "@cawco/jsonl-parser/fts5";
import {
  defaultOpenCodePath,
  readOpenCodeDocs,
} from "@cawco/jsonl-parser/opencode";

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
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;

export class TranscriptSearchService {
  readonly #index: TranscriptIndex;
  #timer: ReturnType<typeof setInterval> | null = null;
  /** The sync in flight: one at a time, which the timer and searches share. */
  #syncing: Promise<void> | null = null;
  /** When the last sync that ended without error began. */
  #syncedAt = 0;
  #openCodeWatermark = 0;
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
    svc.#openCodeWatermark = svc.#loadWatermark();
    return svc;
  }

  #loadWatermark(): number {
    const row = this.#index.db
      .query("SELECT value FROM meta WHERE key = 'opencode_watermark'")
      .get() as { value: string } | null;
    return row ? Number(row.value) : 0;
  }

  /**
   * Run one sync cycle, or join the one in flight: claude transcripts +
   * opencode, committed as one transaction, the opencode watermark written
   * only when it moved.
   */
  sync(): Promise<void> {
    if (!this.#syncing) {
      this.#syncing = this.#syncOnce().finally(() => {
        this.#syncing = null;
      });
    }
    return this.#syncing;
  }

  async #syncOnce(): Promise<void> {
    const startedAt = Date.now();
    // OpenCode — skip silently when the db does not exist.
    const ocPath = defaultOpenCodePath();
    const openCode = existsSync(ocPath)
      ? readOpenCodeDocs(ocPath, { since: this.#openCodeWatermark })
      : undefined;
    const claudeFiles = await listClaudeFiles();
    await this.#index.sync(
      claudeFiles.map((f) => f.path),
      openCode
        ? {
            docs: openCode.docs,
            meta: { opencode_watermark: String(openCode.watermark) },
          }
        : {}
    );
    if (openCode) {
      this.#openCodeWatermark = openCode.watermark;
    }
    this.#syncedAt = startedAt;
  }

  /** Start the background sync loop. First sync is kicked off immediately. */
  start(): void {
    // Fire-and-forget initial sync — must not block startup.
    this.sync()
      .catch(() => {
        // Swallowed: a failed initial sync is not fatal.
      })
      .finally(() => this.#firstSync.resolve());
    this.#timer = setInterval(() => {
      this.sync().catch(() => {
        // Swallowed: a periodic sync failure must not kill the daemon.
      });
    }, SYNC_INTERVAL_MS);
  }

  /**
   * Search the index, brought up to date first when its last sync began
   * more than {@link SEARCH_FRESH_MS} ago.
   */
  async search(
    query: string,
    options?: {
      limit?: number;
      sessionId?: string;
      role?: "user" | "assistant";
    }
  ): Promise<SearchHit[]> {
    if (Date.now() - this.#syncedAt > SEARCH_FRESH_MS) {
      await this.sync();
    }
    const limit = Math.min(
      options?.limit ?? DEFAULT_SEARCH_LIMIT,
      MAX_SEARCH_LIMIT
    );
    return this.#index.search(query, {
      limit,
      sessionId: options?.sessionId,
      role: options?.role,
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
