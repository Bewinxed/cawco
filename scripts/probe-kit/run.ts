#!/usr/bin/env bun
/**
 * The probe kit: every web UI proof, read from the engine, not the picture.
 *
 *   bun scripts/probe-kit/run.ts web [spec…] [--approve <spec>]
 *   bun scripts/probe-kit/run.ts <spec>
 *
 * The second form runs one spec of its own in `specs/<spec>.ts`, beside the
 * web specs: a feature's probe (`artifacts`), on the same kit.
 *
 * Serves the dashboard as each spec needs it, once per run: the dev server
 * for the `/motion/` benches, the built dashboard (`vite preview`, built
 * once) for what a spec times, against no hub or a scratch fleet's hub.
 * Runs each spec in `specs/web/` (or those named) and prints
 * `PASS <spec>: <assertion>` / `FAIL <spec>: …` per assertion, then
 * `ALL PASS` or `N FAILED`. Exits 0 only when every assertion passed.
 *
 * `--approve <spec>` writes that spec's pixel baselines from this run
 * (diff.ts): only after the owner has approved what they show.
 *
 * What each level proves is the fleet's rule 7: state and geometry first
 * (geom.ts), motion by seeking the clock (anim.ts), regressions by pixel
 * diff against an approved baseline (diff.ts), and ink (ink.ts) only for
 * what drawing alone decides. Runtime cadence (long tasks, painted frames)
 * is frames.ts.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ensureDeps } from "../lib/deps";
import type { Spec } from "./kit";

// The dependencies first (lib/deps.ts): the kit and the fleet load after them.
await ensureDeps();
const { sweepDeadFleets } = await import("../scratch-fleet");
const { Run } = await import("./kit");

const args = process.argv.slice(2);
const [kind, ...rest] = args;
const own = kind ? join(import.meta.dir, "specs", `${kind}.ts`) : undefined;
if (kind !== "web" && !(own && existsSync(own))) {
  console.error(
    "usage: bun scripts/probe-kit/run.ts web [spec…] [--approve <spec>]\n       bun scripts/probe-kit/run.ts <spec>  (a spec in specs/)"
  );
  process.exit(2);
}
const approveAt = rest.indexOf("--approve");
const approve = approveAt === -1 ? null : (rest[approveAt + 1] ?? null);
const named =
  kind === "web"
    ? rest.filter(
        (one, i) =>
          one !== "--approve" && (approveAt === -1 || i !== approveAt + 1)
      )
    : [kind];
const dir =
  kind === "web"
    ? join(import.meta.dir, "specs", "web")
    : join(import.meta.dir, "specs");
const all = readdirSync(dir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.slice(0, -3))
  .sort();
const unknown = [...named, ...(approve ? [approve] : [])].filter(
  (one) => !all.includes(one)
);
if (unknown.length > 0) {
  console.error(`no such spec: ${unknown.join(", ")} (have ${all.join(", ")})`);
  process.exit(2);
}
const chosen = named.length > 0 ? named : all;

const started = performance.now();
// Folders of scratch fleets that died before they cleaned up (a SIGKILL), out
// of the 256 names a fleet's HOME and runtime dir are drawn from.
const swept = await sweepDeadFleets();
if (swept.length > 0) {
  console.log(
    `… removed ${swept.length} folder(s) of scratch fleets that died: ${swept.join(", ")}`
  );
}
const run = new Run();
try {
  for (const name of chosen) {
    // biome-ignore lint/performance/noAwaitInLoops: one spec at a time, each with the machine to itself
    const spec = (await import(join(dir, `${name}.ts`))).default as Spec;
    await run.spec(spec, approve === name);
  }
} finally {
  await run.close();
}
const seconds = ((performance.now() - started) / 1000).toFixed(0);
const notes = run.notes > 0 ? `, ${run.notes} note(s)` : "";
console.log(
  run.failures === 0
    ? `ALL PASS (${chosen.length} specs, ${seconds}s${notes})`
    : `${run.failures} FAILED (${chosen.length} specs, ${seconds}s${notes})`
);
process.exit(run.failures === 0 ? 0 : 1);
