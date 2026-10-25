/**
 * Byte-level line scanning and lazy parsing.
 *
 * Design: newline scanning over raw bytes runs at ~3.5 GB/s single-threaded;
 * JSON.parse runs at ~0.5 GB/s. So the scanner yields cheap line spans and
 * lets callers decide — via a byte-level prefilter — which lines are worth
 * materializing. A 5 MB tool_result line that the caller filters out costs
 * one indexOf, not a parse.
 *
 * One rule for what a record is, for every reader of a transcript: the text
 * between two separators, where a separator is a newline or a NUL byte. A
 * file that was being appended to when its machine stopped uncleanly can
 * come back with a range of NUL bytes where the lost write was (obelisk's
 * 45 MB transcript of a long session held a line of 1,651 NULs and then the
 * last 861 bytes of a record). No JSON holds a raw NUL, so a NUL never
 * splits a good record, and a record written after the range, even with
 * its newline zeroed away, is read whole. What is left of a damaged record
 * fails to parse and is counted and skipped, never thrown.
 */

import type { LocatedRecord, ParseStats, TranscriptRecord } from "./types.ts";

const NEWLINE = 10;
const NUL = 0;
const decoder = new TextDecoder();

export interface LineSpan {
  /** 1-based line number. */
  line: number;
  /** Byte offset of the record's first byte. */
  offset: number;
  /** Byte length excluding its separator. */
  byteLength: number;
}

/**
 * Iterate the non-empty record spans in a buffer: text between newlines,
 * cut again at each NUL byte (a line can hold several spans, each with its
 * line's number). Zero allocation per span; the NUL search runs once over
 * the buffer, not once per line.
 */
export function* lineSpans(buf: Uint8Array, baseOffset = 0): Generator<LineSpan> {
  let start = 0;
  let line = 0;
  const len = buf.length;
  let nul = buf.indexOf(NUL);
  while (start < len) {
    let nl = buf.indexOf(NEWLINE, start);
    if (nl === -1) {
      nl = len;
    }
    line++;
    while (nul !== -1 && nul < nl) {
      if (nul > start) {
        yield { line, offset: baseOffset + start, byteLength: nul - start };
      }
      start = nul + 1;
      nul = buf.indexOf(NUL, start);
    }
    if (nl > start) {
      yield { line, offset: baseOffset + start, byteLength: nl - start };
    }
    start = nl + 1;
  }
}

/**
 * The part of `buf` that is whole lines: up to and including its last
 * newline. A transcript being written to can end mid-record; that tail is
 * read once its newline lands, never parsed as a broken record before.
 */
export function completeLines(buf: Uint8Array): Uint8Array {
  return buf.subarray(0, buf.lastIndexOf(NEWLINE) + 1);
}

/** `text` as a record: a JSON object, or undefined when it is not one. */
export function parseObject(text: string): TranscriptRecord | undefined {
  let record: unknown;
  try {
    record = JSON.parse(text);
  } catch {
    return;
  }
  return typeof record === "object" && record !== null && !Array.isArray(record)
    ? (record as TranscriptRecord)
    : undefined;
}

/**
 * The records one already-split line of text holds, by the same rule as
 * {@link parseRecords}: its NUL-separated parts that are JSON objects. For a
 * reader that frames lines itself (a live tail, a line-by-line scan).
 */
export function lineRecords(line: string): TranscriptRecord[] {
  const records: TranscriptRecord[] = [];
  for (const part of line.includes("\0") ? line.split("\0") : [line]) {
    const record = part ? parseObject(part) : undefined;
    if (record) {
      records.push(record);
    }
  }
  return records;
}

/**
 * A prefilter decides from raw bytes whether a line should be parsed.
 * Return false to skip without decoding or parsing.
 */
export type BytePrefilter = (buf: Uint8Array, span: LineSpan, base: number) => boolean;

/** A span's bytes as a Buffer over the same memory, for the runtime's substring search. */
const spanView = (buf: Uint8Array, span: LineSpan, base: number): Buffer =>
  Buffer.from(buf.buffer, buf.byteOffset + span.offset - base, span.byteLength);

/** Build a prefilter that requires at least one of the given substrings in the line. */
export function includesAny(...needles: string[]): BytePrefilter {
  const encoded = needles.map((n) => Buffer.from(n));
  return (buf, span, base) => {
    const view = spanView(buf, span, base);
    return encoded.some((needle) => view.includes(needle));
  };
}

const TYPE_KEY = Buffer.from('"type":"');

/**
 * Prefilter matching the record `type` discriminator, e.g.
 * typeFilter("user", "assistant"): a line holding `"type":"<one of them>`.
 * One pass over the line for the key every needle shares, each place it
 * stands compared with the types. A search per type, its first byte a quote
 * that stands every few bytes of JSON, was 630 ms of a 413 MB transcript's
 * scan.
 */
export function typeFilter(...types: string[]): BytePrefilter {
  const encoded = types.map((t) => Buffer.from(t));
  return (buf, span, base) => {
    const view = spanView(buf, span, base);
    for (
      let at = view.indexOf(TYPE_KEY);
      at !== -1;
      at = view.indexOf(TYPE_KEY, at + TYPE_KEY.length)
    ) {
      const value = at + TYPE_KEY.length;
      if (
        encoded.some(
          (type) =>
            value + type.length <= view.length &&
            view.compare(type, 0, type.length, value, value + type.length) === 0,
        )
      ) {
        return true;
      }
    }
    return false;
  };
}

export interface ScanOptions {
  /** Skip lines failing this byte-level test before any decode/parse. */
  prefilter?: BytePrefilter;
  /** Byte offset the buffer starts at within its file (for incremental tails). */
  baseOffset?: number;
  /** Line number the buffer starts at within its file. */
  baseLine?: number;
  /** Collect per-pass counters. */
  stats?: ParseStats;
}

/**
 * Parse records out of a JSONL buffer, by the module's rule: newline- and
 * NUL-separated, each part that is not a JSON object counted as invalid and
 * skipped, never thrown. Unknown record types pass through as OtherRecord.
 * A buffer that may end mid-record is cut with {@link completeLines} first.
 */
export function* parseRecords(
  buf: Uint8Array,
  options: ScanOptions = {},
): Generator<LocatedRecord> {
  const base = options.baseOffset ?? 0;
  const lineBase = options.baseLine ?? 0;
  const stats = options.stats;
  if (stats) {
    stats.bytes += buf.length;
  }
  let lastLine = 0;
  for (const span of lineSpans(buf, base)) {
    if (stats && span.line !== lastLine) {
      stats.lines++;
    }
    lastLine = span.line;
    if (options.prefilter && !options.prefilter(buf, span, base)) {
      continue;
    }
    const local = span.offset - base;
    const record = parseObject(decoder.decode(buf.subarray(local, local + span.byteLength)));
    if (!record) {
      if (stats) {
        stats.invalid++;
      }
      continue;
    }
    if (stats) {
      stats.parsed++;
    }
    yield {
      record,
      line: lineBase + span.line,
      offset: span.offset,
      byteLength: span.byteLength,
    };
  }
}

export function newStats(): ParseStats {
  return { lines: 0, parsed: 0, invalid: 0, bytes: 0 };
}
