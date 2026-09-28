/**
 * File-level reading: full parses, filtered parses, and incremental tails.
 *
 * Transcripts are append-only, so a `(size, offset)` checkpoint per file
 * means a re-index only ever parses bytes written since the last pass.
 * A shrunken file (rotation, truncation) invalidates the checkpoint and
 * triggers a full re-read.
 */

import { stat } from "node:fs/promises";
import { newStats, parseRecords, type ScanOptions } from "./scan.ts";
import type { LocatedRecord, ParseStats } from "./types.ts";

declare const Bun:
  | {
      file(path: string): {
        arrayBuffer(): Promise<ArrayBuffer>;
        slice(start: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
      };
    }
  | undefined;

async function readBytes(path: string, offset = 0): Promise<Uint8Array> {
  if (typeof Bun !== "undefined") {
    // Only the bytes past `offset` leave the disk: a tail of a 50 MB
    // transcript is the few kilobytes appended since the checkpoint.
    return new Uint8Array(await Bun.file(path).slice(offset).arrayBuffer());
  }
  const { readFile } = await import("node:fs/promises");
  const buf = await readFile(path);
  return offset > 0 ? buf.subarray(offset) : buf;
}

async function readRange(path: string, start: number, end: number): Promise<Uint8Array> {
  if (typeof Bun !== "undefined") {
    return new Uint8Array(await Bun.file(path).slice(start, end).arrayBuffer());
  }
  const { open } = await import("node:fs/promises");
  const handle = await open(path, "r");
  try {
    const buf = new Uint8Array(end - start);
    const { bytesRead } = await handle.read(buf, 0, buf.length, start);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Watermark for incremental reads of an append-only file. */
export interface Checkpoint {
  /** File size at last read. */
  size: number;
  /** Byte offset up to which records were consumed. */
  offset: number;
  /** Line count consumed up to `offset`. */
  lines: number;
}

export interface ReadResult {
  records: LocatedRecord[];
  stats: ParseStats;
  checkpoint: Checkpoint;
  /** True when the checkpoint was unusable and the file was re-read from 0. */
  reset: boolean;
}

/** Parse an entire transcript file. */
export async function readTranscript(
  path: string,
  options: Omit<ScanOptions, "baseOffset" | "baseLine" | "stats"> = {},
): Promise<ReadResult> {
  const stats = newStats();
  const buf = await readBytes(path);
  const records = [...parseRecords(buf, { ...options, stats })];
  return {
    records,
    stats,
    checkpoint: { size: buf.length, offset: buf.length, lines: stats.lines },
    reset: false,
  };
}

/**
 * Parse only bytes appended since `checkpoint`. Pass the returned checkpoint
 * back on the next call. With no checkpoint (or an invalidated one) this is
 * a full read.
 */
export async function readTranscriptTail(
  path: string,
  checkpoint: Checkpoint | undefined,
  options: Omit<ScanOptions, "baseOffset" | "baseLine" | "stats"> = {},
): Promise<ReadResult> {
  const info = await stat(path);
  const valid =
    checkpoint !== undefined && checkpoint.offset <= info.size && checkpoint.size <= info.size;
  const from = valid ? checkpoint.offset : 0;
  const lineBase = valid ? checkpoint.lines : 0;
  if (valid && from === info.size) {
    return {
      records: [],
      stats: newStats(),
      checkpoint,
      reset: false,
    };
  }
  const stats = newStats();
  const buf = await readBytes(path, from);
  const records = [
    ...parseRecords(buf, { ...options, stats, baseOffset: from, baseLine: lineBase }),
  ];
  return {
    records,
    stats,
    checkpoint: { size: info.size, offset: from + buf.length, lines: lineBase + stats.lines },
    reset: !valid && checkpoint !== undefined,
  };
}

export interface ReadEndOptions extends Omit<ScanOptions, "baseOffset" | "baseLine" | "stats"> {
  /** Stop growing the window once at least this many records parsed (default 200). */
  records?: number;
  /** Hard cap on bytes read from the end (default 16 MiB). */
  maxBytes?: number;
  /** Initial window size in bytes, doubled until satisfied (default 512 KiB). */
  chunkBytes?: number;
}

export interface ReadEndResult {
  /** Records in file order (oldest of the window first). */
  records: LocatedRecord[];
  stats: ParseStats;
  /** Byte offset the window started at (0 = whole file was read). */
  startOffset: number;
  /** True when the window covers the whole file. */
  complete: boolean;
}

/**
 * Read the newest records of a transcript by scanning backward from the end
 * of the file — opening a 90 MB session costs one bounded read, not a full
 * parse. The window doubles from `chunkBytes` until it contains at least
 * `records` parsed records (or hits `maxBytes` / the file start). The window
 * is aligned to the first newline inside it, so a partially-covered record
 * at the front is never mis-parsed. Records with single lines larger than
 * `maxBytes` are the only thing that can be skipped.
 */
export async function readTranscriptEnd(
  path: string,
  options: ReadEndOptions = {},
): Promise<ReadEndResult> {
  const want = options.records ?? 200;
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  const { size } = await stat(path);
  let window = Math.min(options.chunkBytes ?? 512 * 1024, size, maxBytes);

  for (;;) {
    const from = size - window;
    const raw = await readRange(path, from, size);
    // Align to a record boundary: skip up to and including the first
    // newline, unless the window covers the whole file.
    let buf = raw;
    let startOffset = from;
    if (from > 0) {
      const firstNewline = raw.indexOf(10);
      if (firstNewline === -1) {
        // No complete record in the window; widen.
        if (window >= size || window >= maxBytes) {
          return { records: [], stats: newStats(), startOffset: size, complete: from === 0 };
        }
        window = Math.min(window * 2, size, maxBytes);
        continue;
      }
      buf = raw.subarray(firstNewline + 1);
      startOffset = from + firstNewline + 1;
    }
    const stats = newStats();
    const records = [
      ...parseRecords(buf, { prefilter: options.prefilter, stats, baseOffset: startOffset }),
    ];
    const complete = from === 0;
    if (records.length >= want || complete || window >= maxBytes) {
      return { records, stats, startOffset, complete };
    }
    window = Math.min(window * 2, size, maxBytes);
  }
}
