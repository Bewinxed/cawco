/**
 * Worker-pool fan-out over transcript files.
 *
 * Files are sharded by size (greedy balance) so one 90 MB transcript does
 * not serialize behind five hundred small ones. On a 48-core machine this
 * parses a 1 GB corpus in ~200 ms vs ~1.9 s single-threaded.
 *
 * Falls back to in-process parsing when Worker is unavailable.
 */

import { stat } from "node:fs/promises";
import type { TranscriptDoc } from "./text.ts";
import type { LocatedRecord } from "./types.ts";
import {
  runTask,
  type WorkerFileResult,
  type WorkerMessage,
  type WorkerTask,
} from "./worker.ts";
const STANDALONE = typeof Bun !== "undefined" && Bun.isStandaloneExecutable;

export interface ParseManyOptions extends Omit<WorkerTask, "files"> {
  /** Worker count (default: min(16, files, availableParallelism)). */
  workers?: number;
}

async function shardBySize(files: string[], shardCount: number): Promise<string[][]> {
  const sized = await Promise.all(
    files.map(async (f) => ({ f, size: (await stat(f).catch(() => ({ size: 0 }))).size })),
  );
  sized.sort((a, b) => b.size - a.size);
  const shards = Array.from({ length: shardCount }, () => ({ files: [] as string[], total: 0 }));
  for (const { f, size } of sized) {
    let min = shards[0] as (typeof shards)[0];
    for (const s of shards) {
      if (s.total < min.total) {
        min = s;
      }
    }
    min.files.push(f);
    min.total += size;
  }
  return shards.filter((s) => s.files.length > 0).map((s) => s.files);
}

/**
 * Where the parse worker is. Compiled, it is the binary's entry
 * `scripts/binary/transcript-worker.js`, found from the binary's root: this
 * code runs both in the binary's own entry, at the root, and in the agent's
 * stores thread (agent stores/worker.ts), whose entry is itself under
 * `scripts/binary/`, so a path from `import.meta.url` alone names
 * `scripts/binary/scripts/binary/…` there, which is no entry. From source
 * (Bun, .ts) or from dist (built .js), it is beside this file.
 */
function workerUrl(): URL {
  const here = import.meta.url;
  if (STANDALONE) {
    const root = "/root/";
    return new URL(
      "scripts/binary/transcript-worker.js",
      here.slice(0, here.lastIndexOf(root) + root.length),
    );
  }
  return new URL(here.endsWith(".ts") ? "./worker.ts" : "./worker.js", here);
}

function defaultWorkerCount(fileCount: number): number {
  const cores =
    typeof navigator !== "undefined" && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : 4;
  return Math.max(1, Math.min(16, fileCount, cores - 2));
}

/**
 * Parse many transcript files in parallel. Per-file failures are reported in
 * the result's `error` field, never thrown.
 */
export async function parseMany(
  files: string[],
  options: ParseManyOptions,
): Promise<WorkerFileResult[]> {
  if (files.length === 0) {
    return [];
  }
  const workerCount = options.workers ?? defaultWorkerCount(files.length);
  const task = { mode: options.mode, types: options.types, extract: options.extract };

  if (workerCount <= 1 || typeof Worker === "undefined") {
    return runTask({ ...task, files });
  }

  const shards = await shardBySize(files, workerCount);
  const settled = await Promise.all(
    shards.map(
      (shard) =>
        new Promise<WorkerFileResult[]>((resolve, reject) => {
          const worker = new Worker(workerUrl());
          // The shard's files, gathered from the worker's parts, each part
          // taken in on a turn of its own (worker.ts `PART_ITEMS`).
          const results: WorkerFileResult[] = [];
          let docs: TranscriptDoc[] = [];
          let records: LocatedRecord[] = [];
          worker.onmessage = (event: MessageEvent) => {
            const message = event.data as WorkerMessage;
            switch (message.kind) {
              case "part":
                docs = message.docs ? docs.concat(message.docs) : docs;
                records = message.records ? records.concat(message.records) : records;
                break;
              case "file":
                results.push({
                  path: message.path,
                  stats: message.stats,
                  ...(message.error === undefined ? {} : { error: message.error }),
                  ...(options.mode === "docs" ? { docs } : { records }),
                });
                docs = [];
                records = [];
                break;
              case "done":
                worker.terminate();
                resolve(results);
                return;
              default: {
                const unhandled: never = message;
                throw new Error(`unhandled worker message: ${JSON.stringify(unhandled)}`);
              }
            }
            setImmediate(() => worker.postMessage("more"));
          };
          worker.onerror = (event) => {
            worker.terminate();
            if (STANDALONE) { reject(new Error(`Transcript worker unavailable: ${event.message}`)); return; }
            // Worker crashed: fall back to in-process for this shard.
            resolve(runTask({ ...task, files: shard }));
          };
          worker.postMessage({ ...task, files: shard });
        }),
    ),
  );
  return settled.flat();
}
