import type { Stats } from "node:fs";
import { stat } from "node:fs/promises";
import type { UsageBucket } from "@cawco/core";
import { floorToHour, refreshPricing, totalTokens } from "@cawco/core";
import {
  emptyIndex,
  loadIndex,
  saveIndex,
  type UsageIndex,
} from "./index-store";
import { listClaudeFiles, parseClaudeRecords } from "./scan-claude";
import { openDbPath, scanOpencode } from "./scan-opencode";
import type { ScannedRecord } from "./types";

/**
 * The per-machine usage scanner (USAGE-SPEC.md §5). Owns the in-memory dedup
 * set and the absolute bucket totals for the process lifetime; re-sends are
 * idempotent because the hub upserts by bucket id. Incremental scans compare
 * `(mtimeMs, size)` per Claude transcript and a `time_created` watermark for
 * opencode; a full rebuild re-heals every 30 minutes.
 */

const HOUR_MS = 60 * 60 * 1000;

interface DedupEntry {
  bucketKey: string;
  record: ScannedRecord;
  totalTokens: number;
}

export interface ScanStats {
  buckets: number;
  claudeFiles: number;
  claudeKept: number;
  claudeParsed: number;
  claudeSkipped: number;
  durationMs: number;
  opencodeKept: number;
  opencodeParsed: number;
}

/** `rec` beats `existing`: non-sidechain wins; then the larger total tokens. */
const prefers = (rec: ScannedRecord, existing: DedupEntry): boolean => {
  if (rec.isSidechain !== existing.record.isSidechain) {
    return !rec.isSidechain;
  }
  return totalTokens(rec.tokens) > existing.totalTokens;
};

/** Reads only the bytes appended after `offset`; a partial trailing line is deferred. */
const readTail = async (
  path: string,
  offset: number
): Promise<{ text: string; nextOffset: number }> => {
  const file = Bun.file(path);
  const { size } = file;
  if (size <= offset) {
    return { text: "", nextOffset: offset };
  }
  const text = await file.slice(offset, size).text();
  if (text.endsWith("\n")) {
    return { text, nextOffset: size };
  }
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline === -1) {
    return { text: "", nextOffset: offset };
  }
  return {
    text: text.slice(0, lastNewline + 1),
    nextOffset: offset + lastNewline + 1,
  };
};

const readWhole = async (
  path: string
): Promise<{ text: string; nextOffset: number }> => {
  const file = Bun.file(path);
  const { size } = file;
  const text = await file.text();
  if (text.endsWith("\n")) {
    return { text, nextOffset: size };
  }
  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline === -1) {
    return { text, nextOffset: 0 };
  }
  return { text: text.slice(0, lastNewline + 1), nextOffset: lastNewline + 1 };
};

export class UsageScanner {
  private readonly buckets = new Map<string, UsageBucket>();
  private readonly claudeMain = new Map<string, DedupEntry>();
  private readonly claudeSide = new Map<string, DedupEntry>();
  private readonly opencodeSeen = new Set<string>();
  private readonly touchedKeys = new Set<string>();
  private index: UsageIndex;
  private lastFullRebuild = 0;

  constructor(index: UsageIndex | null = null) {
    this.index = index ?? emptyIndex();
  }

  static async load(): Promise<UsageScanner> {
    return new UsageScanner(await loadIndex());
  }

  private fold(rec: ScannedRecord): string {
    const hourStart = floorToHour(rec.ts);
    const key = `${rec.harness}:${rec.sessionId}:${rec.model}:${hourStart}`;
    const b = this.buckets.get(key);
    if (b) {
      b.tokens.input += rec.tokens.input;
      b.tokens.output += rec.tokens.output;
      b.tokens.cacheCreation += rec.tokens.cacheCreation;
      b.tokens.cacheRead += rec.tokens.cacheRead;
      b.tokens.reasoning += rec.tokens.reasoning;
      b.costUsd += rec.costUsd;
      b.messages += 1;
      if (rec.ts < b.firstTs) {
        b.firstTs = rec.ts;
      }
      if (rec.ts > b.lastTs) {
        b.lastTs = rec.ts;
      }
    } else {
      this.buckets.set(key, {
        harness: rec.harness,
        hourStart,
        firstTs: rec.ts,
        lastTs: rec.ts,
        sessionId: rec.sessionId,
        project: rec.project,
        projectPath: rec.projectPath,
        model: rec.model,
        provider: rec.provider,
        tokens: {
          input: rec.tokens.input,
          output: rec.tokens.output,
          cacheCreation: rec.tokens.cacheCreation,
          cacheRead: rec.tokens.cacheRead,
          reasoning: rec.tokens.reasoning,
        },
        costUsd: rec.costUsd,
        messages: 1,
      });
    }
    this.touchedKeys.add(key);
    return key;
  }

  private reverse(entry: DedupEntry): void {
    const b = this.buckets.get(entry.bucketKey);
    if (!b) {
      return;
    }
    b.tokens.input -= entry.record.tokens.input;
    b.tokens.output -= entry.record.tokens.output;
    b.tokens.cacheCreation -= entry.record.tokens.cacheCreation;
    b.tokens.cacheRead -= entry.record.tokens.cacheRead;
    b.tokens.reasoning -= entry.record.tokens.reasoning;
    b.costUsd -= entry.record.costUsd;
    b.messages -= 1;
    // firstTs/lastTs are deliberately not reversed: a rare mid-stream
    // replacement leaves at most a stale window edge, which the 30-minute full
    // rebuild heals (USAGE-SPEC.md §5.1).
  }

  /** Folds `rec` in if it survives dedup; returns true when it was kept. */
  private ingest(rec: ScannedRecord): boolean {
    if (rec.harness === "opencode") {
      if (this.opencodeSeen.has(rec.messageId)) {
        return false;
      }
      this.opencodeSeen.add(rec.messageId);
      this.fold(rec);
      return true;
    }

    const mainKey = `${rec.messageId}\u0000${rec.requestId}`;
    const mainExisting = this.claudeMain.get(mainKey);
    if (mainExisting && !prefers(rec, mainExisting)) {
      return false;
    }

    if (rec.isSidechain) {
      const sideExisting = this.claudeSide.get(`${rec.messageId}\u0000`);
      if (sideExisting && !prefers(rec, sideExisting)) {
        return false;
      }
    }

    if (mainExisting) {
      this.reverse(mainExisting);
    }
    const bucketKey = this.fold(rec);
    const entry: DedupEntry = {
      record: rec,
      totalTokens: totalTokens(rec.tokens),
      bucketKey,
    };
    this.claudeMain.set(mainKey, entry);
    if (rec.isSidechain) {
      const sideKey = `${rec.messageId}\u0000`;
      const sideExisting = this.claudeSide.get(sideKey);
      if (sideExisting && sideExisting !== mainExisting) {
        this.reverse(sideExisting);
      }
      this.claudeSide.set(sideKey, entry);
    }
    return true;
  }

  private ingestAll(records: ScannedRecord[]): number {
    let kept = 0;
    for (const rec of records) {
      if (this.ingest(rec)) {
        kept += 1;
      }
    }
    return kept;
  }

  /** Reads every transcript and the opencode DB from scratch; clears prior state. */
  async fullRebuild(): Promise<ScanStats> {
    const start = Date.now();
    // Re-cost against the live catalog before re-costing the corpus. The
    // bundled snapshot goes stale the moment a new model ships — and a model
    // it does not know prices at 0, silently, forever, because incremental
    // scans never revisit a bucket they already wrote. The rebuild is the one
    // place that re-costs everything, so it is the one place the rates must be
    // fresh. `refreshPricing` throttles itself to 24h and swallows its own
    // failures; offline keeps the snapshot and the rebuild proceeds.
    await refreshPricing();
    this.buckets.clear();
    this.claudeMain.clear();
    this.claudeSide.clear();
    this.opencodeSeen.clear();
    this.touchedKeys.clear();
    this.index = emptyIndex();

    let claudeFiles = 0;
    let claudeParsed = 0;
    for (const file of await listClaudeFiles()) {
      claudeFiles += 1;
      let info: Stats;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each file folds into the shared dedup maps and buckets in sequence
        info = await stat(file.path);
      } catch {
        continue;
      }
      const { text, nextOffset } = await readWhole(file.path);
      const records = parseClaudeRecords(text, file.project);
      claudeParsed += records.length;
      this.ingestAll(records);
      this.index.claude[file.path] = {
        mtimeMs: info.mtimeMs,
        size: info.size,
        offset: nextOffset,
      };
    }

    let opencodeParsed = 0;
    let opencodeKept = 0;
    const dbPath = await openDbPath();
    if (dbPath) {
      const res = scanOpencode(dbPath, 0);
      opencodeParsed = res.parsed;
      opencodeKept += this.ingestAll(res.records);
      this.index.opencode = { maxTimeCreated: res.maxTimeCreated };
    }

    this.lastFullRebuild = Date.now();
    await saveIndex(this.index);

    // Surviving records = non-sidechain main winners + sidechain fallback
    // winners. The fold path counts every fold (including ones later reversed
    // by a larger-token replay), so it is not the surviving count.
    let nonSideKept = 0;
    for (const entry of this.claudeMain.values()) {
      if (!entry.record.isSidechain) {
        nonSideKept += 1;
      }
    }
    const claudeKept = nonSideKept + this.claudeSide.size;

    return {
      claudeFiles,
      claudeSkipped: 0,
      claudeParsed,
      claudeKept,
      opencodeParsed,
      opencodeKept,
      buckets: this.buckets.size,
      durationMs: Date.now() - start,
    };
  }

  /** Compares watermarks and reads only what changed since the last scan. */
  async incremental(): Promise<ScanStats> {
    const start = Date.now();
    let claudeFiles = 0;
    let claudeSkipped = 0;
    let claudeParsed = 0;
    let claudeKept = 0;
    for (const file of await listClaudeFiles()) {
      claudeFiles += 1;
      let info: Stats;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each file folds into the shared dedup maps and buckets in sequence
        info = await stat(file.path);
      } catch {
        continue;
      }
      const wm = this.index.claude[file.path];
      if (wm && info.mtimeMs === wm.mtimeMs && info.size === wm.size) {
        claudeSkipped += 1;
        continue;
      }
      if (wm && info.size > wm.size) {
        const { text, nextOffset } = await readTail(file.path, wm.offset);
        const records = parseClaudeRecords(text, file.project);
        claudeParsed += records.length;
        claudeKept += this.ingestAll(records);
        this.index.claude[file.path] = {
          mtimeMs: info.mtimeMs,
          size: info.size,
          offset: nextOffset,
        };
      } else {
        const { text, nextOffset } = await readWhole(file.path);
        const records = parseClaudeRecords(text, file.project);
        claudeParsed += records.length;
        claudeKept += this.ingestAll(records);
        this.index.claude[file.path] = {
          mtimeMs: info.mtimeMs,
          size: info.size,
          offset: nextOffset,
        };
      }
    }

    let opencodeParsed = 0;
    let opencodeKept = 0;
    const watermark = this.index.opencode?.maxTimeCreated ?? 0;
    const dbPath = await openDbPath();
    if (dbPath) {
      const res = scanOpencode(dbPath, watermark);
      opencodeParsed = res.parsed;
      opencodeKept += this.ingestAll(res.records);
      this.index.opencode = { maxTimeCreated: res.maxTimeCreated };
    }

    await saveIndex(this.index);
    return {
      claudeFiles,
      claudeSkipped,
      claudeParsed,
      claudeKept,
      opencodeParsed,
      opencodeKept,
      buckets: this.buckets.size,
      durationMs: Date.now() - start,
    };
  }

  /** Every absolute bucket total, keyed `${harness}:${sessionId}:${model}:${hourStart}`. */
  listBuckets(): UsageBucket[] {
    return [...this.buckets.values()];
  }

  /**
   * Absolute totals for the buckets the hub must (re-)learn: every bucket in
   * the current and previous hour (still moving) plus anything touched since
   * the last report. Re-sends are idempotent because the hub upserts by id.
   */
  reportBuckets(now: number): UsageBucket[] {
    const currentHour = floorToHour(now);
    const prevHour = currentHour - HOUR_MS;
    const out: UsageBucket[] = [];
    for (const [key, b] of this.buckets) {
      if (
        b.hourStart === currentHour ||
        b.hourStart === prevHour ||
        this.touchedKeys.has(key)
      ) {
        out.push(b);
      }
    }
    this.touchedKeys.clear();
    return out;
  }

  /** True when the last full rebuild is older than `intervalMs`. */
  dueForFullRebuild(intervalMs: number): boolean {
    return Date.now() - this.lastFullRebuild >= intervalMs;
  }
}
