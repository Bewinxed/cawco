#!/usr/bin/env bun
/**
 * The probe kit: every web UI proof, read from the engine, not the picture.
 *
 *   bun scripts/probe-kit/run.ts web [spec…] [--<option> <value>…]
 *   bun scripts/probe-kit/run.ts <spec>… [--<option> <value>…]
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
 * One that sets what a module reads
 * once as it loads (`ownProcess`) runs in a process of its own, started
 * fresh. One that stands up its own git and HOME (`ownHome`) does too, a
 * scratch HOME set as it starts and no enclosing workspace's git settings,
 * so it runs alike in a workspace and on the host.
 *
 * Started from a session's shell, the run runs again in a process without
 * that session's variables (caller-env.ts), so every spec reads what it would
 * on the host; a spec that runs inside a workspace (`workspace`) runs in a
 * process of its own that keeps them.
 *
 * Serves the dashboard as each spec needs it, once per run: the dev server
 * for the `/motion/` benches, the built dashboard (`vite preview`, built
 * once) for what a spec times, against no hub or a scratch fleet's hub.
 * Runs each spec in `specs/web/` (or those named) and prints
 * `PASS <spec>: <assertion>` / `FAIL <spec>: …` per assertion, then one
 * line for the whole run: `ALL PASS (N specs, …)` or `N FAILED: <spec>, …`,
 * naming each spec that failed. Exits 0 only when every assertion passed.
 *
 * What each level proves: state and geometry first (geom.ts), motion by
 * seeking the clock (anim.ts), and ink (ink.ts) only for what drawing alone
 * decides. Nothing is held to a stored picture or style dump. Runtime cadence (long tasks, painted frames)
 * is frames.ts.
 */
import "../../packages/core/src/no-huge-pages";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureDeps } from "../lib/deps";
import { holdAwake } from "../lib/hold-awake";
import { runTied } from "../lib/tied-child";
import { callerNames, withoutCaller } from "./caller-env";
import {
  ENCLOSING_GIT_ENV,
  OWN_HOME_ENV,
  OWN_PROCESS_ENV,
  type Spec,
} from "./spec";

// The dependencies first (lib/deps.ts): the kit and the fleet load after them.
// The machine stays awake for the whole run (lib/hold-awake.ts).
holdAwake(`bun scripts/probe-kit/run.ts ${process.argv.slice(2).join(" ")}`);
await ensureDeps();
const { sweepDeadFleets } = await import("../scratch-fleet");
const { Run } = await import("./kit");
const { nameProbeRun, probeSlot } = await import("./slot");

const args = process.argv.slice(2);
/**
 * The variables of the session this run was started from (caller-env.ts);
 * none in a spec's own process, which this run started with the ones it is
 * to have.
 */
const caller = process.env[OWN_PROCESS_ENV] ? [] : callerNames(process.env);
/**
 * Where this run, when it runs some of a run's specs, writes what became of
 * them ({@link Tally}) for the run that started it ({@link runWithoutCaller}).
 * Out of `process.env` once read; every run.ts this one starts is given its
 * `env`.
 */
const TALLY_ENV = "CAWCO_PROBE_TALLY";
const tallyTo = process.env[TALLY_ENV];
delete process.env[TALLY_ENV];
/** What a run of some of the specs says became of them: those that failed, and those not run here. */
interface Tally {
  failed: string[];
  notHere: string[];
}
/** This run's `argv` again, tied to it, in a process without {@link caller} and with `extra`: its exit. */
const againWithoutCaller = (
  argv: string[],
  extra: Record<string, string> = {}
): Promise<number> => {
  console.log(
    `… running again without the variables of the session it was started from (${caller.join(", ")})`
  );
  return runTied([process.execPath, import.meta.path, ...argv], {
    ...withoutCaller(process.env),
    ...extra,
  });
};
// The user journeys (journeys/suite.ts): every engine, every size, both data sets.
if (args[0] === "journeys") {
  if (caller.length > 0) {
    process.exit(await againWithoutCaller(args));
  }
  nameProbeRun(args.join(" "));
  const { runJourneys } = await import("./journeys/run");
  process.exit(await runJourneys(args.slice(1)));
}
const web = args[0] === "web";
const rest = web ? args.slice(1) : args;
if (!(web || rest[0]) || rest[0]?.startsWith("--")) {
  console.error(
    "usage: bun scripts/probe-kit/run.ts web [spec…] [--<option> <value>…]\n       bun scripts/probe-kit/run.ts <spec>… [--<option> <value>…]  (specs in specs/, or in specs/web/; every other --<option> <value> is the specs' own)"
  );
  process.exit(2);
}
/**
 * The specs' own options: every `--<option>`, each with the value after it (none when the next is an option too or
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
  const value = rest[i + 1];
  const hasValue = value !== undefined && !value.startsWith("--");
  if (hasValue) {
    taken.add(i + 1);
  }
  options.push(one, ...(hasValue ? [value] : []));
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
// web spec: `run.ts room-held machine-pause` runs both, in that order.
const chosen = web && named.length === 0 ? listed(webDir) : named;
// Its probe slot's holder line names the specs it runs (slot.ts).
nameProbeRun(web && named.length === 0 ? "web (every spec)" : chosen.join(" "));
const pathOf = (name: string): string | null => {
  const own = join(specsDir, `${name}.ts`);
  if (!web && existsSync(own)) {
    return own;
  }
  const inWeb = join(webDir, `${name}.ts`);
  return existsSync(inWeb) ? inWeb : null;
};
const unknown = chosen.filter((one) => pathOf(one) === null);
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
 * A spec that runs in a process of its own (spec.ts `Spec.ownProcess`, or
 * `Spec.ownHome`): started fresh, so nothing an earlier spec loaded is
 * loaded there. One that stands up its own git and HOME (`ownHome`) gets a
 * scratch HOME set as it starts, and none of an enclosing workspace's git or
 * gh settings. Its output is this run's; its exit says how it went (0
 * passed, 3 runs on the host, anything else failed).
 */
const runOwnProcess = async (spec: Spec): Promise<number> => {
  // Its probe slot is this run's, taken here: its own process runs under
  // this run's lease (slot.ts `holdSlot`), never taking one of its own, and
  // an `ownHome` one could not see the machine's slots under its scratch
  // HOME. That process starts at this run's priority and lowers itself as
  // its first heavy work takes the slot it inherits, so a spec that reads
  // what lowers a command's priority starts from the machine's.
  await probeSlot(false);
  const own: Record<string, string> = { [OWN_PROCESS_ENV]: "1" };
  let removeHome: () => void = () => undefined;
  let env = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
  if (spec.ownHome) {
    const home = mkdtempSync(join(tmpdir(), `probe-${spec.name}-`));
    env = Object.fromEntries(
      Object.entries(env).filter(([name]) => !ENCLOSING_GIT_ENV.test(name))
    );
    Object.assign(own, { HOME: home, [OWN_HOME_ENV]: home });
    // A stop signal reaching this run while the spec runs ends it here, once
    // the spec's own run has torn down (lib/tied-child.ts): its HOME goes then.
    removeHome = () => rmSync(home, { recursive: true, force: true });
    process.once("exit", removeHome);
  }
  const code = await runTied(
    [process.execPath, import.meta.path, spec.name, ...options],
    { ...env, ...own }
  );
  process.off("exit", removeHome);
  removeHome();
  return code;
};

/**
 * The chosen specs in order, in the parts a run without {@link caller} runs
 * them in: each `workspace` spec alone, and each run of other specs between
 * them as one part.
 */
const partsOf = (): (Spec | string[])[] => {
  const parts: (Spec | string[])[] = [];
  for (const name of chosen) {
    const spec = specs.get(name) as Spec;
    const last = parts.at(-1);
    if (spec.workspace) {
      parts.push(spec);
    } else if (Array.isArray(last)) {
      last.push(name);
    } else {
      parts.push([name]);
    }
  }
  return parts;
};

/**
 * What became of one part: a `workspace` spec in a process of its own that
 * keeps {@link caller}, by its exit; other specs in one run without them, by
 * the {@link Tally} it writes to `file`, or every one of them failed when it
 * ended before writing one.
 */
const runPart = async (part: Spec | string[], file: string): Promise<Tally> => {
  if (!Array.isArray(part)) {
    const code = await runOwnProcess(part);
    return {
      failed: code === 0 || code === 3 ? [] : [part.name],
      notHere: code === 3 ? [part.name] : [],
    };
  }
  const code = await againWithoutCaller(
    [...(web ? ["web"] : []), ...part, ...options],
    { [TALLY_ENV]: file }
  );
  if (existsSync(file)) {
    return JSON.parse(readFileSync(file, "utf8")) as Tally;
  }
  console.log(
    `… ${part.join(", ")}: their run ended (exit ${code}) before it said how each went`
  );
  return { failed: part, notHere: [] };
};

/**
 * The specs in order without {@link caller}, in parts ({@link partsOf}), as
 * the run was asked for when no `workspace` spec is among them. Run in
 * parts, it ends on one line for the whole run, after each part's own: its
 * specs, how many passed, failed and were not run here, and its time, which
 * the exit says too. Answers 1 when any failed, else 3 when one was not run
 * here, else 0.
 */
const runWithoutCaller = async (): Promise<number> => {
  const parts = partsOf();
  const [only] = parts;
  if (parts.length === 1 && Array.isArray(only)) {
    return await againWithoutCaller(args);
  }
  const failed: string[] = [];
  const notHere: string[] = [];
  const tallies = mkdtempSync(join(tmpdir(), "probe-tally-"));
  try {
    for (const [index, part] of parts.entries()) {
      const tally = await runPart(part, join(tallies, `${index}.json`));
      failed.push(...tally.failed);
      notHere.push(...tally.notHere);
    }
  } finally {
    rmSync(tallies, { recursive: true, force: true });
  }
  const failedCount = failed.filter((name) => chosen.includes(name)).length;
  const counts = [
    `${chosen.length - failedCount - notHere.length} passed`,
    ...(failedCount > 0 ? [`${failedCount} failed`] : []),
    ...(notHere.length > 0 ? [`${notHere.length} not run here`] : []),
  ].join(", ");
  const whole = `${chosen.length} specs: ${counts}; ${(performance.now() / 1000).toFixed(0)}s, in ${parts.length} parts`;
  if (notHere.length > 0) {
    console.log(`NOT RUN HERE: ${notHere.join(", ")}`);
  }
  console.log(
    failed.length === 0
      ? `ALL PASS (${whole})`
      : `${failed.length} FAILED: ${failed.join(", ")} (${whole})`
  );
  if (failed.length > 0) {
    return 1;
  }
  return notHere.length > 0 ? 3 : 0;
};
if (caller.length > 0) {
  process.exit(await runWithoutCaller());
}

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
    if ((spec.ownHome || spec.ownProcess) && !process.env[OWN_PROCESS_ENV]) {
      const code = await runOwnProcess(spec);
      if (code === 3) {
        // Its own run said where it runs.
        run.notHere.push(spec.name);
      } else if (code !== 0) {
        failedSpecs.push(spec.name);
      }
      continue;
    }
    const failuresBefore = run.failures;
    await run.spec(spec);
    if (run.failures > failuresBefore) {
      failedSpecs.push(spec.name);
    }
  }
} finally {
  const failuresBefore = run.failures;
  await run.close();
  // Closing the run's shared browsers is checked too: one left a process behind.
  if (run.failures > failuresBefore) {
    failedSpecs.push("the run's browsers");
  }
}
const seconds = ((performance.now() - started) / 1000).toFixed(0);
const notes = run.notes > 0 ? `, ${run.notes} note(s)` : "";
const ran = chosen.length - run.notHere.length;
if (run.failed.length > 0) {
  console.log(`FAILED ASSERTIONS:\n${run.failed.join("\n")}`);
}
if (run.notHere.length > 0) {
  console.log(`NOT RUN HERE: ${run.notHere.join(", ")}`);
}
console.log(
  failedSpecs.length === 0
    ? `ALL PASS (${ran} specs, ${seconds}s${notes})`
    : `${failedSpecs.length} FAILED: ${failedSpecs.join(", ")} (${ran} specs, ${seconds}s${notes})`
);
if (tallyTo) {
  writeFileSync(
    tallyTo,
    JSON.stringify({
      failed: failedSpecs,
      notHere: run.notHere,
    } satisfies Tally)
  );
}
if (failedSpecs.length > 0) {
  process.exit(1);
}
// 3: nothing failed, but a spec asked for was not run here.
process.exit(run.notHere.length > 0 ? 3 : 0);
