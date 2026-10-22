#!/usr/bin/env bun
/**
 * The owner's picks on a review page (review.ts, `scripts/probe-review/`)
 * made baselines: every surface he approved has its candidates moved over the
 * approved set; a rejected or unpicked surface is left as it is, to the byte.
 *
 *   bun scripts/probe-kit/approve-review.ts <review dir> <picks.json>
 *
 * `<picks.json>` is the page's `artifact_read` answer saved as JSON: its
 * `state` holds one entry per surface, keyed by the surface's id
 * (`<spec>:<surface>`), whose `options` is `["approve"]` or `["reject"]`.
 * A pick on an id the manifest does not hold, or an option other than those
 * two, stops it before anything moves. `PROBE_BASELINES=<dir>` writes under
 * `<dir>` instead of `scripts/probe-kit/baselines` (a scratch copy, to prove
 * an approve on), as the kit reads it.
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import type { ReviewManifest } from "./review";

const BASELINES =
  process.env.PROBE_BASELINES ?? join(import.meta.dir, "baselines");

interface Picks {
  state?: unknown;
}

const [dirArg, picksArg] = process.argv.slice(2);
if (!(dirArg && picksArg)) {
  console.error(
    "usage: bun scripts/probe-kit/approve-review.ts <review dir> <picks.json>   (artifact_read's answer on the review page)"
  );
  process.exit(2);
}
const dir = resolve(dirArg);
const manifest = JSON.parse(
  await readFile(join(dir, "manifest.json"), "utf8")
) as ReviewManifest;
const read = JSON.parse(await readFile(resolve(picksArg), "utf8")) as Picks;
if (typeof read.state !== "object" || read.state === null) {
  console.error(
    `${picksArg}: no "state" object; save artifact_read's whole answer`
  );
  process.exit(2);
}
const state = read.state as Record<string, { options?: string[] } | undefined>;

const ids = new Set(manifest.surfaces.map((s) => s.id));
const problems: string[] = [];
for (const [id, entry] of Object.entries(state)) {
  if (!ids.has(id)) {
    problems.push(`${id}: not a surface on this review`);
    continue;
  }
  const options = entry?.options ?? [];
  if (options.length > 1 || !options.every((o) => o === "approve" || o === "reject")) {
    problems.push(`${id}: picked ${JSON.stringify(options)}, not one of approve, reject`);
  }
}
if (problems.length > 0) {
  console.error(`nothing moved:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const picked = (id: string): string =>
  state[id]?.options?.[0] ?? "no pick";
const approved = manifest.surfaces.filter((s) => picked(s.id) === "approve");
// Every candidate is there before any moves: a half-moved surface is none of the two.
const missing = approved.flatMap((s) =>
  s.entries
    .map((e) => e.candidate)
    .filter((candidate) => !existsSync(join(dir, candidate)))
);
if (missing.length > 0) {
  console.error(`nothing moved: candidates missing:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

let moved = 0;
for (const s of approved) {
  for (const e of s.entries) {
    // `candidates/<the baselines' own path>`: web/<spec>/<entry>.png.
    const to = join(BASELINES, relative("candidates", e.candidate));
    // biome-ignore lint/performance/noAwaitInLoops: one baseline at a time
    await mkdir(dirname(to), { recursive: true });
    await copyFile(join(dir, e.candidate), to);
    await rm(join(dir, e.candidate));
    moved += 1;
  }
  console.log(`APPROVED ${s.id}: ${s.entries.length} baseline(s) written`);
}
for (const s of manifest.surfaces) {
  if (picked(s.id) !== "approve") {
    console.log(`LEFT ${s.id} (${picked(s.id)}): its approved baselines stand`);
  }
}
console.log(
  `${moved} baseline(s) moved into ${relative(process.cwd(), BASELINES) || "."} from ${approved.length} of ${manifest.surfaces.length} surface(s)`
);
