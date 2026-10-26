/**
 * A line index per transcript file: one small node per line, never the
 * records themselves.
 *
 * Built once by a forward scan that gives the loop a turn between chunks
 * (`scanFile`), cached on the file's size and change time, and extended
 * from the end of its last whole line as the file grows: an append-only
 * transcript is scanned once, its growth after that a few kilobytes at a
 * time. A read walks the nodes and reads back by byte range only the
 * records it returns (`readSpans`). OpenClaw keeps the same index for the
 * same reason (`src/gateway/session-transcript-index.fs.ts`: each line's
 * `offset` and `byteLength`, cached on `mtimeMs` and `size`, yielding between
 * chunks "so a large transcript scan does not monopolize the gateway event
 * loop").
 *
 * It replaces a cache of every parsed record, which held about twice each
 * transcript's size on the heap: 800 MB for one 406 MB session.
 *
 * Total heap is bounded by a budget (default 256 MB, `transcriptCacheMb` in
 * cawco's machine config), estimated at {@link NODE_BYTES} a line. An index
 * nobody has read for {@link IDLE_MS} is dropped.
 */

import type { WindowAsk } from "@cawco/core";
import {
  type BytePrefilter,
  type Checkpoint,
  fileStamp,
  type LocatedRecord,
  scanFile,
} from "@cawco/jsonl-parser";
import { inFlight } from "../loop-watch.ts";
import { gauge } from "../memory.ts";

/** One file's index. */
export interface LineIndex<N> {
  /** Estimated heap: {@link NODE_BYTES} a node. */
  bytes: number;
  checkpoint: Checkpoint;
  /** What readers derived from the nodes (a walk, a plan), dropped when they change. */
  memo: Map<string, unknown>;
  mtimeMs: number;
  nodes: N[];
  /** When a reader last asked for it (ms epoch): what {@link IDLE_MS} counts from. */
  readAt: number;
}

const DEFAULT_BUDGET_BYTES = 256 * 1024 * 1024;

/** A node's heap, estimated: a few short strings and their object. Ours, measured on a 406 MB transcript's 0.36 KB a line. */
const NODE_BYTES = 512;

/**
 * Whole-file scans at once. Each is a full read of its file, a chunk at a
 * time; two keep a reader's older pages quick without a machine's worth of
 * reads at once.
 */
const SCANS_AT_ONCE = 2;

/** How long an index stays once nobody reads it: long enough to page back through a session. */
const IDLE_MS = 10 * 60 * 1000;
/** How often idle indexes are looked for. */
const SWEEP_MS = 60 * 1000;

/** Whether `error` says the file is no longer there: a session deleted, or a retired workspace's transcripts with it. */
const isGone = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === "ENOENT";

/**
 * What `read` answers, or `gone` when the file it reads is no longer there,
 * however far the read had got: a transcript deleted while it is read reads
 * as one never found.
 */
export async function unlessGone<T>(
  read: () => Promise<T>,
  gone: T
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (isGone(error)) {
      return gone;
    }
    throw error;
  }
}

/**
 * The change time an index read up to `checkpoint` is kept under: the file's
 * own when it is still the size the scan saw. A file that grew meanwhile is
 * kept under none, and read on from the checkpoint next time.
 */
const stampOf = async (
  path: string,
  checkpoint: Checkpoint
): Promise<number> => {
  const now = await fileStamp(path);
  return now.size === checkpoint.size ? now.mtimeMs : -1;
};

export class LineIndexes<N> {
  /** LRU map — iteration order = insertion/touch order. */
  private readonly entries = new Map<string, LineIndex<N>>();
  /** Single-flight: a read joins the scan of its file already running. */
  private readonly inflight = new Map<string, Promise<LineIndex<N>>>();
  private totalBytes = 0;
  private budgetBytes = DEFAULT_BUDGET_BYTES;
  private scanning = 0;
  private readonly scanTurns: (() => void)[] = [];
  private readonly prefilter: BytePrefilter;
  private readonly pick: (located: LocatedRecord) => N;

  constructor(prefilter: BytePrefilter, pick: (located: LocatedRecord) => N) {
    this.prefilter = prefilter;
    this.pick = pick;
    setInterval(() => this.evictIdle(Date.now() - IDLE_MS), SWEEP_MS).unref();
    gauge("transcriptIndex.entries", () => this.entries.size);
    gauge("transcriptIndex.budgetedMB", () =>
      Math.round(this.totalBytes / 1024 / 1024)
    );
  }

  /** The file's index, brought up to date with it; a file no longer there drops its index. */
  get(path: string): Promise<LineIndex<N>> {
    const pending = this.inflight.get(path);
    if (pending) {
      return pending;
    }
    const read = this.refresh(path)
      .catch((error: unknown) => {
        if (isGone(error)) {
          this.evict(path);
        }
        throw error;
      })
      .finally(() => this.inflight.delete(path));
    this.inflight.set(path, read);
    return read;
  }

  /** Re-size the budget and evict down to it: the daemon's `transcriptCacheMb`. */
  configureBudget(bytes: number): void {
    this.budgetBytes = bytes;
    this.enforceBudget(undefined);
  }

  private async refresh(path: string): Promise<LineIndex<N>> {
    const held = this.entries.get(path);
    const stamp = await fileStamp(path);
    if (held) {
      const same =
        stamp.size === held.checkpoint.size && stamp.mtimeMs === held.mtimeMs;
      // Grown: read on from the end of its last whole line.
      const grown = stamp.size > held.checkpoint.size;
      if (same || grown) {
        if (grown) {
          const scan = await scanFile(path, {
            from: held.checkpoint,
            prefilter: this.prefilter,
            pick: this.pick,
          });
          if (!scan.reset) {
            for (const node of scan.items) {
              held.nodes.push(node);
            }
            held.checkpoint = scan.checkpoint;
            held.mtimeMs = await stampOf(path, scan.checkpoint);
            held.memo.clear();
            this.totalBytes -= held.bytes;
            held.bytes = held.nodes.length * NODE_BYTES;
            this.totalBytes += held.bytes;
          }
        }
        held.readAt = Date.now();
        this.entries.delete(path);
        this.entries.set(path, held);
        this.enforceBudget(path);
        return held;
      }
      // Shrunk, or rewritten in place: scanned again whole.
      this.evict(path);
    }
    return this.scanWhole(path);
  }

  /** A whole file scanned into a new index, {@link SCANS_AT_ONCE} at a time. */
  private async scanWhole(path: string): Promise<LineIndex<N>> {
    if (this.scanning >= SCANS_AT_ONCE) {
      await new Promise<void>((resolve) => this.scanTurns.push(resolve));
    } else {
      this.scanning += 1;
    }
    try {
      return await inFlight("transcript index scans", this.scan(path));
    } finally {
      const next = this.scanTurns.shift();
      if (next) {
        next();
      } else {
        this.scanning -= 1;
      }
    }
  }

  private async scan(path: string): Promise<LineIndex<N>> {
    const scan = await scanFile(path, {
      prefilter: this.prefilter,
      pick: this.pick,
    });
    const index: LineIndex<N> = {
      nodes: scan.items,
      checkpoint: scan.checkpoint,
      mtimeMs: await stampOf(path, scan.checkpoint),
      bytes: scan.items.length * NODE_BYTES,
      memo: new Map(),
      readAt: Date.now(),
    };
    this.entries.set(path, index);
    this.totalBytes += index.bytes;
    this.enforceBudget(path);
    return index;
  }

  /** Every index last read before `cutoff`: the oldest, at the front. */
  private evictIdle(cutoff: number): void {
    for (const [path, entry] of this.entries) {
      if (entry.readAt >= cutoff) {
        return;
      }
      this.evict(path);
    }
  }

  private evict(path: string): void {
    const entry = this.entries.get(path);
    if (entry) {
      this.totalBytes -= entry.bytes;
      this.entries.delete(path);
    }
  }

  /** Least recently read first, until within budget; never `keep`, which is kept alone if it must be. */
  private enforceBudget(keep: string | undefined): void {
    for (const [path] of this.entries) {
      if (this.totalBytes <= this.budgetBytes) {
        return;
      }
      if (path !== keep) {
        this.evict(path);
      }
    }
  }
}

/** A conversation's line, as cutting it into windows reads it. */
export interface CutNode {
  /** The ids its message names that another message may name too: a call and its answer, a task and its end. */
  ids?: readonly string[];
}

/** Each id the nodes name, by the first and last node that names it. */
export const idSpans = (
  nodes: readonly CutNode[]
): Map<string, { first: number; last: number }> => {
  const spans = new Map<string, { first: number; last: number }>();
  nodes.forEach((node, i) => {
    for (const id of node.ids ?? []) {
      const known = spans.get(id);
      if (known) {
        known.last = i;
      } else {
        spans.set(id, { first: i, last: i });
      }
    }
  });
  return spans;
};

/**
 * Where a window of `nodes` (a conversation as it was said, in order) may
 * start, rising, 0 always: a node `opens` allows (the start of a turn),
 * unless an id named before it is named again at or after it. So whatever
 * folds one message into another (a result into its call, a notification
 * into its subagent) folds within one window, and windows built one at a
 * time from the newest back give the rows a whole read gives, in its order.
 */
export function windowCuts(
  nodes: readonly CutNode[],
  opens: (at: number) => boolean
): number[] {
  const blocked = new Int32Array(nodes.length + 1);
  for (const { first, last } of idSpans(nodes).values()) {
    if (first < last) {
      blocked[first + 1] += 1;
      blocked[last + 1] -= 1;
    }
  }
  const cuts = [0];
  let open = 0;
  for (let i = 1; i < nodes.length; i += 1) {
    open += blocked[i] ?? 0;
    if (open === 0 && opens(i)) {
      cuts.push(i);
    }
  }
  return cuts;
}

/** The largest of `cuts` at or below `at` (0 when none is). */
const cutAtOrBefore = (cuts: readonly number[], at: number): number => {
  let lo = 0;
  let hi = cuts.length - 1;
  let found = 0;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const cut = cuts[mid] ?? 0;
    if (cut <= at) {
      found = cut;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
};

/**
 * The positions `[from, to)` of the window `ask` names, over a conversation
 * of `length` nodes cut at `cuts` ({@link windowCuts}), each named node's
 * position read by `place`. A `before` or `start` that names a node the
 * conversation no longer holds throws; a `through` that names none is the
 * newest window.
 */
export function windowRange(
  cuts: readonly number[],
  length: number,
  place: (id: string) => number | undefined,
  ask: WindowAsk
): { from: number; to: number } {
  if ("before" in ask) {
    const to = place(ask.before);
    if (to === undefined) {
      throw new Error(`the transcript no longer holds ${ask.before}`);
    }
    return { from: cutAtOrBefore(cuts, Math.max(0, to - ask.limit)), to };
  }
  if ("start" in ask) {
    const from = ask.start === null ? 0 : place(ask.start);
    if (from === undefined) {
      throw new Error(`the transcript no longer holds ${ask.start}`);
    }
    return {
      from,
      to: cuts.find((cut) => cut >= from + ask.limit) ?? length,
    };
  }
  const through = "through" in ask ? place(ask.through) : undefined;
  const to = through === undefined ? length : through + 1;
  return { from: cutAtOrBefore(cuts, Math.max(0, to - ask.limit)), to };
}
