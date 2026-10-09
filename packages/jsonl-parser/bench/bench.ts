/**
 * Benchmark over a real ~/.claude/projects corpus.
 * Usage: bun bench/bench.ts [projectsDir] [indexPath]
 */

import { readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMany, readTranscript } from "../src/index.ts";
import { TranscriptIndex } from "../src/fts5.ts";

const root = process.argv[2] ?? `${process.env.HOME}/.claude/projects`;
const indexPath = process.argv[3] ?? join(tmpdir(), "jsonl-parser-bench.db");

const files = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".jsonl"))
  .map((f) => `${root}/${f}`);

function mb(n: number): string {
  return `${(n / 1e6).toFixed(1)}MB`;
}

// 1. Single-threaded full parse
{
  const t0 = performance.now();
  let bytes = 0;
  let parsed = 0;
  let invalid = 0;
  for (const f of files) {
    const { stats } = await readTranscript(f);
    bytes += stats.bytes;
    parsed += stats.parsed;
    invalid += stats.invalid;
  }
  const ms = performance.now() - t0;
  console.log(
    `single-thread : ${files.length} files ${mb(bytes)} ${parsed} records (${invalid} invalid) in ${ms.toFixed(0)}ms — ${mb(bytes / (ms / 1000))}/s`,
  );
}

// 2. Parallel full parse (records mode)
{
  const t0 = performance.now();
  const results = await parseMany(files, { mode: "records" });
  const ms = performance.now() - t0;
  const bytes = results.reduce((a, r) => a + r.stats.bytes, 0);
  const parsed = results.reduce((a, r) => a + r.stats.parsed, 0);
  console.log(
    `parallel      : ${files.length} files ${mb(bytes)} ${parsed} records in ${ms.toFixed(0)}ms — ${mb(bytes / (ms / 1000))}/s`,
  );
}

// 3. Cold index build (parallel parse + extract + FTS5 insert)
rmSync(indexPath, { force: true });
rmSync(`${indexPath}-wal`, { force: true });
rmSync(`${indexPath}-shm`, { force: true });
{
  const index = new TranscriptIndex(indexPath);
  const t0 = performance.now();
  const result = await index.sync(files);
  const ms = performance.now() - t0;
  console.log(
    `index build   : ${result.docsAdded} docs from ${result.filesFull} files in ${ms.toFixed(0)}ms (${result.errors.length} errors)`,
  );

  // 4. Warm re-sync (everything checkpointed, nothing to parse)
  const t1 = performance.now();
  const resync = await index.sync(files);
  const ms1 = performance.now() - t1;
  console.log(
    `warm re-sync  : ${resync.filesUnchanged} unchanged, ${resync.docsAdded} new docs in ${ms1.toFixed(0)}ms`,
  );

  // 5. Queries
  const queries = [
    "jsonl parser bm25",
    "websocket reconnect",
    "permission prompt",
    "svelte rune",
    "telegram bridge",
  ];
  for (const q of queries) {
    const t2 = performance.now();
    const hits = index.search(q, { limit: 5 });
    const ms2 = performance.now() - t2;
    const top = hits[0];
    console.log(
      `query ${ms2.toFixed(1).padStart(5)}ms  "${q}" → ${hits.length} hits${top ? ` | top: [${top.role}] ${top.snippet.slice(0, 70).replaceAll("\n", " ")}` : ""}`,
    );
  }
  console.log(`index         : ${index.count()} docs total`);
  index.close();
}
