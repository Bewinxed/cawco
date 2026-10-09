/**
 * Corpus-wide proof of the tail-read guarantee: for every main-session
 * transcript on this machine, `readSessionEnd(path, N).messages` must be an
 * exact (type|uuid) suffix of `readSessionFull(path)` and at least
 * `min(N, full.length)` long unless the byte cap stopped the window from
 * growing. Also exercises the one historically-divergent file at adversarial
 * counts and reports tail-vs-full timing.
 *
 * Bench script, not a test file. Usage: bun bench/transcript-tail-parity.ts
 */

import { readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { userLayerPath } from "@cawco/core/paths";
import {
  readSessionEnd,
  readSessionFull,
} from "../src/harnesses/claude-transcript";

const N = 160;
const root = userLayerPath("projects");
const files = readdirSync(root, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith(".jsonl") && !dirname(f).endsWith("subagents"))
  .map((f) => join(root, f));

const key = (m: { type: string; uuid: string }): string =>
  `${m.type}|${m.uuid}`;

let ok = 0;
let empty = 0;
let badSuffix = 0;
let stillShort = 0;
let capped = 0;
let fullMsTotal = 0;
let tailMsTotal = 0;
const failures: string[] = [];

for (const f of files) {
  let t0 = performance.now();
  // biome-ignore lint/performance/noAwaitInLoops: sequential on purpose — per-file timing would be meaningless with concurrent reads
  const full = await readSessionFull(f);
  fullMsTotal += performance.now() - t0;
  if (full.length === 0) {
    empty += 1;
    continue;
  }
  t0 = performance.now();
  const end = await readSessionEnd(f, N);
  tailMsTotal += performance.now() - t0;
  const tail = end.messages;
  const suffix = full.slice(-tail.length);
  if (suffix.map(key).join() !== tail.map(key).join()) {
    badSuffix += 1;
    failures.push(`BAD SUFFIX ${f}`);
    continue;
  }
  if (tail.length < Math.min(N, full.length)) {
    if (end.complete) {
      stillShort += 1;
      failures.push(`SHORT ${f} tail=${tail.length} full=${full.length}`);
    } else {
      // The 16 MiB window cap: shorter but still exact, and honest about it.
      capped += 1;
    }
    continue;
  }
  ok += 1;
}

console.log(
  JSON.stringify({
    files: files.length,
    ok,
    empty,
    badSuffix,
    stillShort,
    cappedByWindow: capped,
    fullMsTotal: Math.round(fullMsTotal),
    tailMsTotal: Math.round(tailMsTotal),
  })
);
for (const line of failures) {
  console.log(" ", line);
}

// The one file that ever diverged in the wild (compact-boundary relink whose
// preserved records sat before the window) — adversarial counts around its
// old failure point.
const divergent = join(
  root,
  "-home-bewinxed",
  "e9cbe581-c24b-4b4d-aad7-47d5010666a6.jsonl"
);
try {
  statSync(divergent);
  const full = await readSessionFull(divergent);
  for (const count of [100, 160, 229, 230, 250, 400]) {
    // biome-ignore lint/performance/noAwaitInLoops: adversarial counts probed one at a time, in order
    const tail = (await readSessionEnd(divergent, count)).messages;
    const exact =
      full.slice(-tail.length).map(key).join() === tail.map(key).join();
    console.log(
      `${basename(divergent)} N=${count}: tail=${tail.length} exact-suffix=${exact}`
    );
  }
} catch {
  console.log("(divergent case-study file not present on this machine)");
}
