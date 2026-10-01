/**
 * Transcript cache benchmarks: cold vs hot, append-incrementality, and eviction.
 *
 * Usage: bun bench/transcript-cache.ts
 *
 * IMPORTANT: the eviction test sets its own cache budget via the constructor,
 * so it must run in its own process (not imported into another bench).
 */

import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readTranscript } from "@cawco/jsonl-parser";
import {
  CHAIN_TYPES,
  readSessionEnd,
  readSessionFull,
} from "../src/harnesses/claude-transcript";
import { TranscriptCache } from "../src/harnesses/transcript-cache";

const BIG_SESSION = join(
  homedir(),
  ".claude/projects/-home-bewinxed-cockpit/300c7b00-dd82-492d-9a69-b3bece69eb50.jsonl"
);

// ---------------------------------------------------------------------------
// 3a. Cold vs hot
// ---------------------------------------------------------------------------

console.log("=== 3a. Cold vs hot ===");

const memBefore = process.memoryUsage().heapUsed;

let t0 = performance.now();
const coldResult = await readSessionFull(BIG_SESSION);
const coldMs = performance.now() - t0;

const memAfter = process.memoryUsage().heapUsed;
const heapDeltaMb = ((memAfter - memBefore) / 1024 / 1024).toFixed(1);

t0 = performance.now();
const hotResult = await readSessionFull(BIG_SESSION);
const hotFullMs = performance.now() - t0;

t0 = performance.now();
const hotEnd = await readSessionEnd(BIG_SESSION, 160);
const hotEndMs = performance.now() - t0;

console.log(
  JSON.stringify({
    coldMs: Math.round(coldMs),
    hotFullMs: +hotFullMs.toFixed(2),
    hotEndMs: +hotEndMs.toFixed(2),
    coldMessages: coldResult.length,
    hotMessages: hotResult.length,
    hotEndMessages: hotEnd.messages.length,
    heapDeltaMb: +heapDeltaMb,
  })
);

if (hotFullMs > 5) {
  console.log("⚠ hot readSessionFull > 5ms");
}
if (hotEndMs > 5) {
  console.log("⚠ hot readSessionEnd > 5ms");
}

// ---------------------------------------------------------------------------
// 3b. Append-incrementality
// ---------------------------------------------------------------------------

console.log("\n=== 3b. Append-incrementality ===");

// Pick a mid-size transcript (~1-10MB)
const root = `${process.env.HOME}/.claude/projects`;
const { readdirSync, statSync } = await import("node:fs");
const { dirname } = await import("node:path");
const allFiles = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".jsonl") && !dirname(f).endsWith("subagents"))
  .map((f) => join(root, f));

const midFiles = allFiles
  .map((f) => ({ f, size: statSync(f).size }))
  .filter((x) => x.size > 1_000_000 && x.size < 10_000_000)
  .sort((a, b) => b.size - a.size);

const midFile = midFiles[0]?.f;
if (midFile) {
  const lines = readFileSync(midFile, "utf-8").split("\n");
  const split = Math.floor(lines.length * 0.8);
  const partial = lines.slice(0, split).join("\n");
  const full = lines.join("\n");

  const tmpPartial = "/tmp/cache-bench.jsonl";
  const tmpFull = "/tmp/cache-bench-full.jsonl";

  writeFileSync(tmpPartial, partial);

  // Use a fresh cache for this test.
  const testCache = new TranscriptCache();

  // Populate with partial file.
  const partialEntry = await testCache.get(tmpPartial);

  // Write the full file (append remaining lines).
  writeFileSync(tmpPartial, full);

  // Also write a copy for cache-bypass comparison.
  writeFileSync(tmpFull, full);

  // Incremental refresh.
  t0 = performance.now();
  const refreshedEntry = await testCache.get(tmpPartial);
  const refreshMs = performance.now() - t0;

  // Cache-bypass parse of the full file.
  const bypassResult = await readTranscript(tmpFull, {
    prefilter: CHAIN_TYPES,
  });

  // Compare (type|uuid) sequences.
  const keyOf = (r: { record: { type?: string; uuid?: string } }) =>
    `${(r.record as { type?: string }).type}|${(r.record as { uuid?: string }).uuid}`;
  const refreshedKeys = refreshedEntry.records.map(keyOf).join(",");
  const bypassKeys = bypassResult.records.map(keyOf).join(",");
  const sequenceMatch = refreshedKeys === bypassKeys;

  console.log(
    JSON.stringify({
      file: midFile.split("/").slice(-2).join("/"),
      fileSizeMb: +(statSync(midFile).size / 1024 / 1024).toFixed(1),
      partialRecords: partialEntry.records.length,
      fullRecords: refreshedEntry.records.length,
      bypassRecords: bypassResult.records.length,
      refreshMs: +refreshMs.toFixed(2),
      sequenceMatch,
    })
  );

  if (!sequenceMatch) {
    console.log("✗ SEQUENCE MISMATCH — incremental cache is not parity");
  }

  // Cleanup.
  unlinkSync(tmpPartial);
  unlinkSync(tmpFull);
} else {
  console.log("(no mid-size transcript found, skipping 3b)");
}

// ---------------------------------------------------------------------------
// 3c. Eviction
// ---------------------------------------------------------------------------

console.log("\n=== 3c. Eviction ===");

// Construct a tiny-budget cache (1 MB).
const tinyCache = new TranscriptCache(1 * 1024 * 1024);

// Pick two small transcripts (< 2 MB each, > 100 KB).
const smallFiles = allFiles
  .map((f) => ({ f, size: statSync(f).size }))
  .filter((x) => x.size > 100_000 && x.size < 2_000_000)
  .sort((a, b) => b.size - a.size);

if (smallFiles.length < 2) {
  console.log("(not enough small transcripts for eviction test)");
} else {
  const fileA = smallFiles[0].f;
  const fileB = smallFiles[1].f;

  await tinyCache.get(fileA);
  const afterA = tinyCache.stats();

  await tinyCache.get(fileB);
  const afterB = tinyCache.stats();

  // With a 1 MB budget, loading B should have evicted A (if both > 500 KB).
  const aEvicted = tinyCache.peek(fileA) === undefined;

  console.log(
    JSON.stringify({
      fileASizeKb: Math.round(smallFiles[0].size / 1024),
      fileBSizeKb: Math.round(smallFiles[1].size / 1024),
      afterA,
      afterB,
      aEvicted,
    })
  );

  if (!aEvicted) {
    console.log(
      "⚠ expected file A to be evicted under 1 MB budget (both files > 500 KB)"
    );
  }
}
