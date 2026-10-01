/**
 * Transcript search service. Owns a `TranscriptIndex` at a stable
 * agent-local path and keeps it in sync with Claude Code transcripts
 * and OpenCode sessions in the background.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { transcriptIndexPath } from "@cawco/core/paths";
import { type SearchHit, TranscriptIndex } from "@cawco/jsonl-parser/fts5";
import {
  defaultOpenCodePath,
  readOpenCodeDocs,
} from "@cawco/jsonl-parser/opencode";
import { listClaudeFiles } from "../usage/scan-claude";

const SYNC_INTERVAL_MS = 30_000;
const MAX_SEARCH_LIMIT = 50;
const DEFAULT_SEARCH_LIMIT = 20;

export class TranscriptSearchService {
  readonly #index: TranscriptIndex;
  #timer: ReturnType<typeof setInterval> | null = null;
  #syncing = false;
  #openCodeWatermark = 0;

  private constructor(index: TranscriptIndex) {
    this.#index = index;
  }

  static async create(): Promise<TranscriptSearchService> {
    const dbPath = transcriptIndexPath();
    await mkdir(dirname(dbPath), { recursive: true });
    const index = new TranscriptIndex(dbPath);
    const svc = new TranscriptSearchService(index);
    // Restore the opencode watermark from a meta table if one exists.
    svc.#ensureMetaTable();
    svc.#openCodeWatermark = svc.#loadWatermark();
    return svc;
  }

  #ensureMetaTable(): void {
    this.#index.db.exec(
      "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    );
  }

  #loadWatermark(): number {
    const row = this.#index.db
      .prepare("SELECT value FROM meta WHERE key = 'opencode_watermark'")
      .get() as { value: string } | null;
    return row ? Number(row.value) : 0;
  }

  #saveWatermark(watermark: number): void {
    this.#index.db
      .prepare(
        "INSERT INTO meta (key, value) VALUES ('opencode_watermark', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
      )
      .run(String(watermark));
  }

  /** Run one sync cycle: claude transcripts + opencode. */
  async sync(): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: reentrancy guard — `#syncing` is set true below and cleared in `finally`; biome's flow analysis does not track concurrent entry
    if (this.#syncing) {
      return;
    }
    this.#syncing = true;
    try {
      // Claude Code transcripts.
      const claudeFiles = await listClaudeFiles();
      await this.#index.sync(claudeFiles.map((f) => f.path));

      // OpenCode — skip silently when the db does not exist.
      const ocPath = defaultOpenCodePath();
      if (existsSync(ocPath)) {
        const { docs, watermark } = readOpenCodeDocs(ocPath, {
          since: this.#openCodeWatermark,
        });
        if (docs.length > 0) {
          this.#index.indexDocs(docs);
        }
        this.#openCodeWatermark = watermark;
        this.#saveWatermark(watermark);
      }
    } finally {
      this.#syncing = false;
    }
  }

  /** Start the background sync loop. First sync is kicked off immediately. */
  start(): void {
    // Fire-and-forget initial sync — must not block startup.
    this.sync().catch(() => {
      // Swallowed: a failed initial sync is not fatal.
    });
    this.#timer = setInterval(() => {
      this.sync().catch(() => {
        // Swallowed: a periodic sync failure must not kill the daemon.
      });
    }, SYNC_INTERVAL_MS);
  }

  /** Search the index. */
  search(
    query: string,
    options?: {
      limit?: number;
      sessionId?: string;
      role?: "user" | "assistant";
    }
  ): SearchHit[] {
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
