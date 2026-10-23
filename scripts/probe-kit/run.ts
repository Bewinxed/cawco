#!/usr/bin/env bun
/**
 * The probe kit: every web UI proof, read from the engine, not the picture.
 *
 *   bun scripts/probe-kit/run.ts web [spec…] [--approve <spec>[:<entry>,…]] [--review] [--<option> <value>…]
 *   bun scripts/probe-kit/run.ts <spec>… [--approve <spec>[:<entry>,…]] [--review] [--<option> <value>…]
 *   bun scripts/probe-kit/run.ts journeys [name…] [--engine chromium|webkit|firefox] [--size phone|tablet|desk]
 *
 * `PROBE_ENGINE=webkit` (or `firefox`) before either of the first two opens
 * every page a spec does not pin to an engine on that engine (kit.ts
 * `RUN_ENGINE`): a spec written on Chromium, run whole on another.
 *
 * Every other `--<option> <value>` is the specs' own, never a spec name: it
 * stays in `process.argv` for a spec to read (browser-relay's `--machine`
 * and `--address`, browser-stream's `--address`), and a spec run in a
 * process of its own is handed it too.
 *
 * The third form runs the user journeys (journeys/suite.ts): each a flow
 * the person does, on every engine and size, with normal and stretched
 * data, one line per leg.
 *
 * The second form runs every spec named, in order, each a spec of its own in
 * `specs/<spec>.ts`, beside the web specs: a feature's probe (`artifacts`),
 * on the same kit. A name found only in `specs/web/` runs as that web spec.
 * One that stands up its own git
 * and HOME (`ownHome`) runs in a process of its own, a scratch HOME set as
 * it starts and no enclosing workspace's git settings, so it runs alike in
 * a workspace and on the host.
 *
 * Serves the dashboard as each spec needs it, once per run: the dev server
 * for the `/motion/` benches, the built dashboard (`vite preview`, built
 * once) for what a spec times, against no hub or a scratch fleet's hub.
 * Runs each spec in `specs/web/` (or those named) and prints
 * `PASS <spec>: <assertion>` / `FAIL <spec>: …` per assertion, then one
 * line for the whole run: `ALL PASS (N specs, …)` or `N FAILED: <spec>, …`,
 * naming each spec that failed. Exits 0 only when every assertion passed.
 *
 * `--approve <spec>` writes every baseline that spec keeps from this run
 * (diff.ts's captures, a spec's own file of legs);
 * `--approve <spec>:<entry>,…` writes only the entries named (a capture's
 * name, or a leg's as a slug: `<spec>:phone-390`), every other entry
 * left as it is to the byte. Only after the owner has approved what they
 * show. `PROBE_BASELINES=<dir>` reads and writes the baselines under `<dir>`
 * instead: a scratch copy, to prove an approve on.
 *
 * `--review` writes the owner's review page (review.ts,
 * `scripts/probe-review/`) when a capture differs from its baseline: the new
 * captures as candidate baselines, apart from the approved set, one Approve
 * or Reject per surface, and approve-review.ts to move the approved ones.
 * The folder is build output, never in the repository:
 * `$XDG_CACHE_HOME/cawco/probe-review/<specs>-<head>` (`~/.cache` when
 * unset), or the folder `PROBE_REVIEW_DIR=<dir>` names.
 *
 * What each level proves is the fleet's rule 7: state and geometry first
 * (geom.ts), motion by seeking the clock (anim.ts), regressions by pixel
 * diff against an approved baseline (diff.ts), and ink (ink.ts) only for
 * what drawing alone decides. Runtime cadence (long tasks, painted frames)
 * is frames.ts.
 */
import "../../packages/core/src/no-huge-pages";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDeps } from "../lib/deps";
import type { Approval, Spec } from "./kit";

// The dependencies first (lib/deps.ts): the kit and the fleet load after them.
await ensureDeps();
const { sweepDeadFleets } = await import("../scratch-fleet");
const { ENCLOSING_GIT_ENV, OWN_HOME_ENV, Run } = await import("./kit");

const args = process.argv.slice(2);
// The user journeys (journeys/suite.ts): every engine, every size, both data sets.
if (args[0] === "journeys") {
  const { runJourneys } = await import("./journeys/run");
  process.exit(await runJourneys(args.slice(1)));
}
const web = args[0] === "web";
const rest = web ? args.slice(1) : args;
if (!(web || rest[0]) || rest[0]?.startsWith("--")) {
  console.error(
    "usage: bun scripts/probe-kit/run.ts web [spec…] [--approve <spec>[:<entry>,…]] [--review] [--<option> <value>…]\n       bun scripts/probe-kit/run.ts <spec>… [--<option> <value>…]  (specs in specs/, or in specs/web/; every other --<option> <value> is the specs' own)"
  );
  process.exit(2);
}
const approveAt = rest.indexOf("--approve");
const approveArg = approveAt === -1 ? null : (rest[approveAt + 1] ?? null);
// `<spec>` approves every baseline it writes; `<spec>:<entry>,…` those named.
const colon = approveArg?.indexOf(":") ?? -1;
const approve =
  approveArg === null || colon === -1 ? approveArg : approveArg.slice(0, colon);
const entries =
  approveArg === null || colon === -1
    ? null
    : approveArg
        .slice(colon + 1)
        .split(",")
        .filter((entry) => entry.length > 0);
if (entries?.length === 0) {
  console.error(
    `--approve ${approveArg}: name an entry after the colon, or none and no colon for all`
  );
  process.exit(2);
}
const approval: Approval | null = approve === null ? null : (entries ?? "all");
/** `--review`, a flag with no value: the review folder is review.ts `reviewDir`'s. */
const reviewing = rest.includes("--review");
/**
 * The specs' own options: every `--<option>` but `--approve` and `--review`,
 * each with the value after it (none when the next is an option too or
 * there is no next), left in `process.argv` for the specs to read.
 */
const options: string[] = [];
/** Where each of this run's own flags and the specs' options and values stand in `rest`. */
const taken = new Set<number>();
for (const [i, one] of rest.entries()) {
  if (!one.startsWith("--") || taken.has(i)) {
    continue;
  }
  taken.add(i);
  if (one === "--review") {
    continue;
  }
  const value = rest[i + 1];
  const hasValue = value !== undefined && !value.startsWith("--");
  if (hasValue) {
    taken.add(i + 1);
  }
  if (one !== "--approve") {
    options.push(one, ...(hasValue ? [value] : []));
  }
}
const named = rest.filter((_, i) => !taken.has(i));
const specsDir = join(import.meta.dir, "specs");
const webDir = join(specsDir, "web");
const listed = (dir: string) =>
  readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => file.slice(0, -3))
    .sort();
// `web` runs the web specs named, or all of them. Otherwise every name is a
// spec of its own in specs/, or one found only in specs/web/, run as that
// web spec: `run.ts mcp-shared room-held` runs both, in that order.
const chosen = web && named.length === 0 ? listed(webDir) : named;
const pathOf = (name: string): string | null => {
  const own = join(specsDir, `${name}.ts`);
  if (!web && existsSync(own)) {
    return own;
  }
  const inWeb = join(webDir, `${name}.ts`);
  return existsSync(inWeb) ? inWeb : null;
};
const unknown = [...chosen, ...(approve ? [approve] : [])].filter(
  (one) => pathOf(one) === null || (approve === one && !chosen.includes(one))
);
if (unknown.length > 0) {
  console.error(
    `no such spec in this run: ${unknown.join(", ")} (have ${(web ? listed(webDir) : [...listed(specsDir), ...listed(webDir)]).join(", ")})`
  );
  process.exit(2);
}
// Every name is a spec before anything runs: a module with no default export
// is a helper, not one to run.
const specs = new Map<string, Spec>();
for (const name of chosen) {
  // biome-ignore lint/performance/noAwaitInLoops: each module read once, in the order named
  const spec = (await import(pathOf(name) as string)).default as
    Spec | undefined;
  if (spec === undefined) {
    console.error(
      `${name} is not a spec (no default export): pick a spec from scripts/probe-kit/specs`
    );
    process.exit(2);
  }
  specs.set(name, spec);
}
/**
 * The review's folder, outside the repository (review.ts `reviewDir`), named
 * once here so a spec run in a process of its own writes into the same one.
 */
const { REVIEW_DIR_ENV, reviewDir, writeReview } = await import("./review");
const review = reviewing ? reviewDir(named.length > 0 ? named : ["web"]) : null;

/**
 * A spec of its own that stands up its own git and HOME (kit.ts
 * `Spec.ownHome`) runs in a process of its own: a scratch HOME set as it
 * starts, and none of an enclosing workspace's git or gh settings. Its
 * output is this run's; its exit says how it went (0 passed, 3 runs on the
 * host, anything else failed).
 */
const runOwnHome = async (spec: Spec): Promise<number> => {
  const home = mkdtempSync(join(tmpdir(), `probe-${spec.name}-`));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !ENCLOSING_GIT_ENV.test(entry[0])
    )
  );
  const child = Bun.spawn(
    [
      process.execPath,
      import.meta.path,
      spec.name,
      ...(approve === spec.name && approveArg ? ["--approve", approveArg] : []),
      ...(review === null ? [] : ["--review"]),
      ...options,
    ],
    {
      env: {
        ...env,
        HOME: home,
        [OWN_HOME_ENV]: home,
        ...(review === null ? {} : { [REVIEW_DIR_ENV]: review }),
      },
      stdio: ["inherit", "inherit", "inherit"],
    }
  );
  const code = await child.exited;
  rmSync(home, { recursive: true, force: true });
  return code;
};

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
/** Every spec that failed, by name, in run order. */
const failedSpecs: string[] = [];
try {
  for (const name of chosen) {
    const spec = specs.get(name) as Spec;
    if (spec.ownHome && !process.env[OWN_HOME_ENV]) {
      // biome-ignore lint/performance/noAwaitInLoops: specs run one at a time, in the order named
      const code = await runOwnHome(spec);
      if (code === 3) {
        run.onHost.push(spec.name);
      } else if (code !== 0) {
        failedSpecs.push(spec.name);
      }
      continue;
    }
    const failuresBefore = run.failures;
    await run.spec(spec, approve === name ? approval : null);
    if (run.failures > failuresBefore) {
      failedSpecs.push(spec.name);
    }
  }
} finally {
  await run.close();
}
if (review !== null) {
  if (run.changed.length === 0) {
    console.log(`REVIEW: no baseline differs; nothing written to ${review}`);
  } else {
    await writeReview(review, run.changed);
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(0);
const notes = run.notes > 0 ? `, ${run.notes} note(s)` : "";
const ran = chosen.length - run.onHost.length;
if (run.failed.length > 0) {
  console.log(`FAILED ASSERTIONS:\n${run.failed.join("\n")}`);
}
if (run.onHost.length > 0) {
  console.log(`NOT RUN HERE, each runs on the host: ${run.onHost.join(", ")}`);
}
console.log(
  failedSpecs.length === 0
    ? `ALL PASS (${ran} specs, ${seconds}s${notes})`
    : `${failedSpecs.length} FAILED: ${failedSpecs.join(", ")} (${ran} specs, ${seconds}s${notes})`
);
if (failedSpecs.length > 0) {
  process.exit(1);
}
// 3: nothing failed, but a spec asked for was not run here.
process.exit(run.onHost.length > 0 ? 3 : 0);
