/**
 * File-level reading: a forward scan from a committed offset, a reverse
 * scan from the end, and reads of chosen records by their byte ranges.
 *
 * No reader here holds a whole transcript. Readers used to load the whole
 * file and split it ("Callers historically read the entire transcript with
 * `fs.readFile` before splitting on newlines… produced real memory pressure
 * on long-running ones where transcripts grow to tens or hundreds of MB",
 * openclaw `src/config/sessions/transcript-stream.ts`); a 406 MB one took
 * an agent 7–23 s to open. Each reader here takes a chunk at a time, splits
 * on newline bytes before any UTF-8 decoding (so a character cut by a
 * chunk's edge is never decoded in halves), and lets the loop take a turn
 * between chunks.
 *
 * Transcripts are append-only, so a `(size, offset)` checkpoint per file
 * means a later scan only reads bytes written since the last one. A shrunken
 * file (rotation, truncation) invalidates the checkpoint and the scan starts
 * again from 0. Every read takes whole lines only: a record its writer is
 * still appending is left past the checkpoint's offset and read whole by the
 * next scan.
 */

import { open, stat } from "node:fs/promises";
import { newStats, parseObject, parseRecords, type ScanOptions } from "./scan.ts";
import type { LocatedRecord, ParseStats, TranscriptRecord } from "./types.ts";

const NEWLINE = 10;
const decoder = new TextDecoder();

/** Watermark for incremental reads of an append-only file. */
export interface Checkpoint {
  /** File size at last read. */
  size: number;
  /** Byte offset up to which records were consumed: the end of the last whole line. */
  offset: number;
  /** Line count consumed up to `offset`. */
  lines: number;
}

/**
 * The longest a parse holds its thread before it lets the loop take a turn.
 * A transcript is parsed on the reader's own thread (an agent's, a hub's),
 * and a 90 MB one is over a second of unbroken work: an agent asked for 128
 * tails at once, each starting a whole parse into its cache, held its loop
 * 3.8 s (agent-loop probe, 2026-10-24). Ours: 8 ms, half a frame.
 */
const PARSE_SLICE_MS = 8;

/**
 * How much of a file one step of a scan reads. Ours: 4 MiB, a few
 * milliseconds of parse between turns of the loop, and a scan's own memory
 * one chunk plus the one line cut by its edge.
 */
const CHUNK_BYTES = 4 * 1024 * 1024;

/** A turn of the loop. */
const turn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** A clock that says when a slice of parsing is over, and gives the loop its turn then. */
const slicer = () => {
  let slice = performance.now();
  return async (): Promise<void> => {
    if (performance.now() - slice >= PARSE_SLICE_MS) {
      await turn();
      slice = performance.now();
    }
  };
};

export interface ScanResult<T> {
  /** What `pick` kept, in file order. */
  items: T[];
  stats: ParseStats;
  /** Where the next scan of this file starts. */
  checkpoint: Checkpoint;
  /** True when `from` was unusable and the file was scanned from 0. */
  reset: boolean;
}

export interface ScanFileOptions<T> extends Omit<ScanOptions, "baseOffset" | "baseLine" | "stats"> {
  /** Where an earlier scan stopped; absent (or no longer valid): from the start. */
  from?: Checkpoint;
  /** What of each record is kept; undefined keeps nothing of it. */
  pick: (located: LocatedRecord) => T | undefined;
}

/**
 * Every whole record of `path` from `from` on, in file order, each handed to
 * `pick`: read {@link CHUNK_BYTES} at a time, the loop given a turn between
 * chunks and after each {@link PARSE_SLICE_MS} of parsing. A last line with
 * no newline yet is left for the next scan.
 */
export async function scanFile<T>(
  path: string,
  options: ScanFileOptions<T>,
): Promise<ScanResult<T>> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    const { from } = options;
    const valid = from !== undefined && from.offset <= size && from.size <= size;
    let offset = valid ? from.offset : 0;
    let lines = valid ? from.lines : 0;
    const stats = newStats();
    const items: T[] = [];
    const breathe = slicer();
    /** Bytes read past the last whole line: the start of a line the next chunk ends. */
    let carry = new Uint8Array(0);
    let readTo = offset;
    while (readTo < size) {
      const want = Math.min(CHUNK_BYTES, size - readTo);
      const buf = new Uint8Array(carry.length + want);
      buf.set(carry, 0);
      const { bytesRead } = await handle.read(buf, carry.length, want, readTo);
      if (bytesRead === 0) {
        break;
      }
      readTo += bytesRead;
      const filled = buf.subarray(0, carry.length + bytesRead);
      const last = filled.lastIndexOf(NEWLINE);
      if (last < 0) {
        // One line longer than a chunk: the next read goes on with it.
        carry = filled;
        continue;
      }
      const whole = filled.subarray(0, last + 1);
      carry = filled.slice(last + 1);
      const chunkStats = newStats();
      for (const located of parseRecords(whole, {
        prefilter: options.prefilter,
        stats: chunkStats,
        baseOffset: offset,
        baseLine: lines,
      })) {
        const kept = options.pick(located);
        if (kept !== undefined) {
          items.push(kept);
        }
        await breathe();
      }
      offset += whole.length;
      lines += chunkStats.lines;
      stats.lines += chunkStats.lines;
      stats.parsed += chunkStats.parsed;
      stats.invalid += chunkStats.invalid;
      stats.bytes += chunkStats.bytes;
      await turn();
    }
    return {
      items,
      stats,
      checkpoint: { size, offset, lines },
      reset: !valid && from !== undefined,
    };
  } finally {
    await handle.close();
  }
}

/** A record's place in its file: what {@link readSpans} reads back. */
export interface Span {
  offset: number;
  byteLength: number;
}

/** Spans this close are read in one read. Ours: a gap of 64 KiB costs less than another read. */
const SPAN_GAP_BYTES = 64 * 1024;

/**
 * The records at `spans` of `path`, in the order asked (undefined for a span
 * that no longer holds a record): nearby spans read together, at most
 * {@link CHUNK_BYTES} a read unless one record is longer, the loop given a
 * turn between reads and after each {@link PARSE_SLICE_MS} of parsing.
 */
export async function readSpans(
  path: string,
  spans: readonly Span[],
): Promise<(TranscriptRecord | undefined)[]> {
  const out = Array.from(spans, (): TranscriptRecord | undefined => undefined);
  if (spans.length === 0) {
    return out;
  }
  // Nearby spans grouped into one read each, in file order.
  const reads: { start: number; end: number; members: { span: Span; at: number }[] }[] = [];
  const order = spans
    .map((span, at) => ({ span, at }))
    .sort((a, b) => a.span.offset - b.span.offset);
  for (const member of order) {
    const { offset, byteLength } = member.span;
    const last = reads.at(-1);
    if (
      last &&
      offset - last.end <= SPAN_GAP_BYTES &&
      offset + byteLength - last.start <= CHUNK_BYTES
    ) {
      last.members.push(member);
      last.end = Math.max(last.end, offset + byteLength);
    } else {
      reads.push({ start: offset, end: offset + byteLength, members: [member] });
    }
  }
  const handle = await open(path, "r");
  try {
    const breathe = slicer();
    for (const { start, end, members } of reads) {
      const buf = new Uint8Array(end - start);
      const { bytesRead } = await handle.read(buf, 0, buf.length, start);
      for (const { span, at } of members) {
        const local = span.offset - start;
        if (local + span.byteLength <= bytesRead) {
          out[at] = parseObject(decoder.decode(buf.subarray(local, local + span.byteLength)));
        }
        await breathe();
      }
      await turn();
    }
    return out;
  } finally {
    await handle.close();
  }
}

export interface ReverseOptions extends Omit<ScanOptions, "baseOffset" | "baseLine" | "stats"> {
  /** Hard cap on bytes read back from the end (default 32 MiB). */
  maxBytes?: number;
}

/**
 * A transcript read backward from its end, a chunk at a time, for the
 * newest records without the rest: opening a 400 MB session costs the
 * chunks its newest page lies in. Each step reads the {@link CHUNK_BYTES}
 * before what is parsed, splits on newline bytes before decoding, and
 * parses only the lines it made whole, so nothing is parsed twice; the cut
 * line at the chunk's front is read again with the step before it. A last
 * line with no newline yet is not read.
 */
export class ReverseReader {
  /** The records read so far, in file order. */
  records: LocatedRecord[] = [];
  stats: ParseStats = newStats();
  readonly #path: string;
  readonly #options: ReverseOptions;
  /** Where the records read begin: a line's first byte, or 0. */
  #from = -1;
  /** Where the file's whole lines end. */
  #end = 0;
  #read = 0;

  constructor(path: string, options: ReverseOptions = {}) {
    this.#path = path;
    this.#options = options;
  }

  /** Where the records read begin, in the file. */
  get startOffset(): number {
    return Math.max(0, this.#from);
  }

  /** Where the whole lines read end: the file's size when it ends on a newline. */
  get endOffset(): number {
    return this.#end;
  }

  /** The whole file is read. */
  get complete(): boolean {
    return this.#from === 0;
  }

  /** No more may be read: the whole file is, or {@link ReverseOptions.maxBytes} is spent. */
  get spent(): boolean {
    return this.complete || this.#read >= (this.#options.maxBytes ?? 32 * 1024 * 1024);
  }

  /**
   * Reads back until `records` more records are held, the file's start, or
   * the byte cap. Answers how many it added.
   */
  async more(records: number): Promise<number> {
    const handle = await open(this.#path, "r");
    try {
      if (this.#from < 0) {
        const { size } = await handle.stat();
        this.#end = await this.#lastLineEnd(handle, size);
        this.#from = this.#end;
      }
      let added = 0;
      while (added < records && !this.spent) {
        added += await this.#step(handle);
        await turn();
      }
      return added;
    } finally {
      await handle.close();
    }
  }

  /** Where the file's whole lines end: just past its last newline, found reading back. */
  async #lastLineEnd(handle: Awaited<ReturnType<typeof open>>, size: number): Promise<number> {
    let hi = size;
    while (hi > 0) {
      const lo = Math.max(0, hi - CHUNK_BYTES);
      const buf = new Uint8Array(hi - lo);
      await handle.read(buf, 0, buf.length, lo);
      this.#read += buf.length;
      const last = buf.lastIndexOf(NEWLINE);
      if (last >= 0) {
        return lo + last + 1;
      }
      hi = lo;
    }
    return 0;
  }

  /** One chunk back: the whole lines before what is read, parsed. */
  async #step(handle: Awaited<ReturnType<typeof open>>): Promise<number> {
    let span = CHUNK_BYTES;
    for (;;) {
      const lo = Math.max(0, this.#from - span);
      const buf = new Uint8Array(this.#from - lo);
      await handle.read(buf, 0, buf.length, lo);
      this.#read += buf.length;
      // The chunk's front is the end of a line begun before it, unless it is
      // the file's start. A chunk whose only newline is its last byte holds
      // nothing but that line's end: the step widens.
      const first = lo === 0 ? -1 : buf.indexOf(NEWLINE);
      if (lo > 0 && (first < 0 || first === buf.length - 1)) {
        span *= 2;
        continue;
      }
      const whole = buf.subarray(first + 1);
      const start = lo + first + 1;
      const stats = newStats();
      const breathe = slicer();
      const found: LocatedRecord[] = [];
      for (const located of parseRecords(whole, {
        prefilter: this.#options.prefilter,
        stats,
        baseOffset: start,
      })) {
        found.push(located);
        await breathe();
      }
      this.records = found.concat(this.records);
      this.stats.lines += stats.lines;
      this.stats.parsed += stats.parsed;
      this.stats.invalid += stats.invalid;
      this.stats.bytes += stats.bytes;
      this.#from = start;
      return found.length;
    }
  }
}

/** A file's size and change time: what a cached read of it is keyed by. */
export const fileStamp = async (path: string): Promise<{ size: number; mtimeMs: number }> => {
  const info = await stat(path);
  return { size: info.size, mtimeMs: info.mtimeMs };
};
