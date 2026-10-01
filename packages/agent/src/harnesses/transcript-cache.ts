/**
 * Bounded in-memory cache for Claude Code session transcripts.
 *
 * Eliminates redundant parsing of append-only JSONL transcripts by caching
 * parsed records keyed by file path with LRU eviction. The cache uses
 * `@cawco/jsonl-parser`'s checkpoint machinery for incremental tail reads:
 * on a hit where the file grew, only the appended bytes are parsed.
 *
 * Total heap is bounded by a budget (default 256 MB, configurable via
 * `transcriptCacheMb` in cawco's machine config), estimated as source-file
 * bytes x HEAP_FACTOR. A single session larger than the whole budget is
 * cached alone; everything else is evicted.
 */

import { stat } from "node:fs/promises";
import type { Checkpoint, LocatedRecord } from "@cawco/jsonl-parser";
import { readTranscript, readTranscriptTail } from "@cawco/jsonl-parser";
import { CHAIN_TYPES } from "./claude-transcript.ts";

export interface CachedSession {
  /** Estimated heap cost: source bytes x HEAP_FACTOR. */
  bytes: number;
  checkpoint: Checkpoint;
  records: LocatedRecord[];
  /**
   * Lazily-cached chain-walked messages. Invalidated (set to undefined) when
   * records change (append/full-read). Avoids re-walking on every hot read.
   */
  walkedMessages?: unknown[];
}

const DEFAULT_BUDGET_BYTES = 256 * 1024 * 1024;

/**
 * Parsed-record object graphs measure ~2x their source bytes on the heap
 * (97 MB transcript -> ~196 MB heap), so entries are budgeted at twice their
 * file size: `transcriptCacheMb` approximates actual memory, not disk.
 */
const HEAP_FACTOR = 2;

export class TranscriptCache {
  /** LRU map — iteration order = insertion/touch order. */
  private readonly entries = new Map<string, CachedSession>();
  /** Single-flight dedup — prevents concurrent populates from double-parsing. */
  private readonly inflight = new Map<string, Promise<CachedSession>>();
  /** Sum of `bytes` across all entries. */
  private totalBytes = 0;
  private budgetBytes: number;

  constructor(budgetBytes = DEFAULT_BUDGET_BYTES) {
    this.budgetBytes = budgetBytes;
  }

  /** Public read — the only entry point for callers. */
  async get(path: string): Promise<CachedSession> {
    // Single-flight: join an existing populate/refresh.
    const pending = this.inflight.get(path);
    if (pending) {
      return pending;
    }

    const p = this.populate(path);
    this.inflight.set(path, p);
    try {
      return await p;
    } finally {
      this.inflight.delete(path);
    }
  }

  /**
   * Peek at a cached entry without triggering I/O. Returns undefined on miss
   * or if the entry might be stale (file shrank). Used by readSessionEnd to
   * decide between the cache path and the windowed path.
   */
  peek(path: string): CachedSession | undefined {
    return this.entries.get(path);
  }

  /** Cache stats — entries count and total bytes tracked. */
  stats(): { entries: number; bytes: number } {
    return { entries: this.entries.size, bytes: this.totalBytes };
  }

  /**
   * Re-size the budget and run an immediate eviction pass. Called by the
   * daemon after reading `transcriptCacheMb` from machine config.
   */
  configureBudget(bytes: number): void {
    this.budgetBytes = bytes;
    // Evict with no protected key — all entries are fair game.
    while (this.totalBytes > this.budgetBytes) {
      const first = this.entries.keys().next();
      if (first.done) {
        break;
      }
      this.evict(first.value);
    }
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async populate(path: string): Promise<CachedSession> {
    const existing = this.entries.get(path);
    if (existing) {
      // Stat to check freshness.
      const info = await stat(path);
      if (info.size === existing.checkpoint.size) {
        // Touch LRU.
        this.entries.delete(path);
        this.entries.set(path, existing);
        return existing;
      }
      if (info.size < existing.checkpoint.size) {
        // File shrank — rotation/rewrite. Drop and re-read.
        this.evict(path);
        return this.fullRead(path);
      }
      // File grew — incremental tail read.
      const tail = await readTranscriptTail(path, existing.checkpoint, {
        prefilter: CHAIN_TYPES,
      });
      existing.records.push(...tail.records);
      existing.checkpoint = tail.checkpoint;
      existing.walkedMessages = undefined; // invalidate cached walk
      this.totalBytes -= existing.bytes;
      existing.bytes = existing.checkpoint.size * HEAP_FACTOR;
      this.totalBytes += existing.bytes;
      // Touch LRU.
      this.entries.delete(path);
      this.entries.set(path, existing);
      this.enforceBudget(path);
      return existing;
    }
    return this.fullRead(path);
  }

  private async fullRead(path: string): Promise<CachedSession> {
    const result = await readTranscript(path, { prefilter: CHAIN_TYPES });
    const entry: CachedSession = {
      records: result.records,
      checkpoint: result.checkpoint,
      bytes: result.checkpoint.size * HEAP_FACTOR,
    };
    this.entries.set(path, entry);
    this.totalBytes += entry.bytes;
    this.enforceBudget(path);
    return entry;
  }

  private evict(path: string): void {
    const entry = this.entries.get(path);
    if (entry) {
      this.totalBytes -= entry.bytes;
      this.entries.delete(path);
    }
  }

  /**
   * Evict LRU entries until totalBytes ≤ budget, never evicting `keep`.
   * A single session larger than the whole budget is kept alone.
   */
  private enforceBudget(keep: string): void {
    if (this.totalBytes <= this.budgetBytes) {
      return;
    }
    for (const [p] of this.entries) {
      if (this.totalBytes <= this.budgetBytes) {
        break;
      }
      if (p === keep) {
        continue;
      }
      this.evict(p);
    }
  }
}

/** Module-level singleton. */
export const cache = new TranscriptCache();
