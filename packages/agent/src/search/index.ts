/**
 * Transcript search service. Owns a `TranscriptIndex` at a stable
 * agent-local path and keeps it in sync with Claude Code transcripts
 * and OpenCode sessions: in the background, and before a search.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  listClaudeFiles,
  opencodeDatabases,
  transcriptIndexPath,
} from "@cawco/core/paths";
import type { TranscriptDoc } from "@cawco/jsonl-parser";
import { type SearchHit, TranscriptIndex } from "@cawco/jsonl-parser/fts5";
import { readOpenCodeDocs } from "@cawco/jsonl-parser/opencode";

/** The `meta` key prefix of each OpenCode database's watermark, followed by its path. */
const WATERMARK = "opencode_watermark:";

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
  /** When the last sync that ended without error began. */
  #syncedAt = 0;
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
      this.#syncing = this.#syncOnce()
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
      const read = readOpenCodeDocs(dbPath, {
        since: this.#openCodeWatermarks.get(key) ?? 0,
      });
      docs.push(...read.docs);
      meta[key] = String(read.watermark);
      watermarks.set(key, read.watermark);
    }
    const claudeFiles = await listClaudeFiles();
    await this.#index.sync(
      claudeFiles.map((f) => f.path),
      { docs, meta }
    );
    for (const [key, watermark] of watermarks) {
      this.#openCodeWatermarks.set(key, watermark);
    }
    this.#syncedAt = startedAt;
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
    // Never answered from a stale index: a sync that fails refuses the
    // search, with the reason the hub names this machine by.
    if (Date.now() - this.#syncedAt > SEARCH_FRESH_MS) {
      try {
        await this.sync();
      } catch (error) {
        throw new Error(`its index couldn't update (${syncFailure(error)})`, {
          cause: error,
        });
      }
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
