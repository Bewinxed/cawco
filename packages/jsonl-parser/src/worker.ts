/**
 * Worker entry for parallel transcript parsing. Spawned by pool.ts —
 * not part of the public API surface, but shipped as a build entry so
 * `new Worker(new URL("./worker.js", import.meta.url))` resolves from dist.
 */

import { scanFile } from "./file.ts";
import { typeFilter } from "./scan.ts";
import { extractDoc, type ExtractOptions, type TranscriptDoc } from "./text.ts";
import type { LocatedRecord, ParseStats } from "./types.ts";

export interface WorkerTask {
  files: string[];
  /** "docs" returns extracted TranscriptDocs; "records" returns parsed records. */
  mode: "docs" | "records";
  /** Restrict to these record types via byte prefilter (e.g. ["user","assistant"]). */
  types?: string[];
  extract?: ExtractOptions;
}

export interface WorkerFileResult {
  path: string;
  docs?: TranscriptDoc[];
  records?: LocatedRecord[];
  stats: ParseStats;
  error?: string;
}

export async function runTask(task: WorkerTask): Promise<WorkerFileResult[]> {
  const prefilter = task.types ? typeFilter(...task.types) : undefined;
  const results: WorkerFileResult[] = [];
  for (const path of task.files) {
    try {
      // Documents are taken out of each record as the scan reads it, so a
      // file's records are never all held at once.
      if (task.mode === "docs") {
        const { items: docs, stats } = await scanFile(path, {
          prefilter,
          pick: (located) => extractDoc(located.record, task.extract) ?? undefined,
        });
        results.push({ path, docs, stats });
      } else {
        const { items: records, stats } = await scanFile(path, {
          prefilter,
          pick: (located) => located,
        });
        results.push({ path, records, stats });
      }
    } catch (error) {
      results.push({
        path,
        stats: { lines: 0, parsed: 0, invalid: 0, bytes: 0 },
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return results;
}

declare const self: { onmessage: ((event: MessageEvent) => void) | null } | undefined;
declare function postMessage(message: unknown): void;

/**
 * Documents or records one message carries, at most. The reader takes a
 * worker's message in on its own thread, every value in it at once: one
 * message of a 90 MB transcript's documents held an agent's loop over a
 * second (agent-loop probe, 2026-10-24). Our own call: a few milliseconds
 * of taking in each.
 */
export const PART_ITEMS = 1000;

/** What a worker sends: a part of a file's documents or records, a file's end, or the task's. */
export type WorkerMessage =
  | { kind: "part"; path: string; docs?: TranscriptDoc[]; records?: LocatedRecord[] }
  | { kind: "file"; path: string; stats: ParseStats; error?: string }
  | { kind: "done" };

// This module is also imported on the main thread (pool.ts uses runTask as
// the no-worker fallback), where registering a global onmessage handler
// would pin the event loop open. Only self-register inside a real worker.
import { isMainThread } from "node:worker_threads";

if (!isMainThread && typeof self !== "undefined" && self !== null) {
  /** The reader's word that it took the last message in: the next goes. */
  let more: (() => void) | undefined;
  const send = async (message: WorkerMessage): Promise<void> => {
    const taken = new Promise<void>((resolve) => {
      more = resolve;
    });
    postMessage(message);
    await taken;
  };
  self.onmessage = async (event: MessageEvent) => {
    if (event.data === "more") {
      more?.();
      return;
    }
    // One file at a time, each sent in parts, each part once the reader took the last in.
    for (const result of await runTask(event.data as WorkerTask)) {
      const items = result.docs ?? result.records ?? [];
      for (let at = 0; at < items.length; at += PART_ITEMS) {
        const part = items.slice(at, at + PART_ITEMS);
        await send(
          result.docs
            ? { kind: "part", path: result.path, docs: part as TranscriptDoc[] }
            : { kind: "part", path: result.path, records: part as LocatedRecord[] },
        );
      }
      await send({
        kind: "file",
        path: result.path,
        stats: result.stats,
        ...(result.error === undefined ? {} : { error: result.error }),
      });
    }
    postMessage({ kind: "done" } satisfies WorkerMessage);
  };
}
