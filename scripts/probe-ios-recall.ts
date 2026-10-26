#!/usr/bin/env bun
/**
 * iOS recall wheel probe: the composer's recall wheel stands half the window
 * tall on an iPhone and 40% on an iPad, its depth spread over every row it
 * shows, with no history button, VoiceOver's "Show what you sent" bringing
 * it up, and a 2s glide over 200 entries holding its frames.
 *
 *   bun scripts/probe-ios-recall.ts [--keep] [--no-build]
 *
 * Run from the repo root on the Mac (a CawCo workspace on it, or the owner's
 * shell there). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only) unless --no-build;
 *  2. stands up a scratch fleet (scratch-fleet.ts: a real hub, agent and
 *     sessiond, Claude Code on a mock model) and sends one session 200
 *     messages, a turn apart, each starting with a word of its own;
 *  3. on an iPhone 16 Pro and an iPad Pro 11-inch (M4), iOS 18.5, each a
 *     simulator of its own, launches the app on that session with
 *     `-recall-probe` (ComposerRecallProbe.swift), which reads the wheel's
 *     state light and dark and logs it in the Probe category;
 *  4. prints those lines.
 *
 * It stops only what it started: the fleet's processes by PID and the
 * simulators it created (deleted at the end). `--keep` keeps the fleet's
 * sandbox. Prints the app's `PASS …` / `FAIL …` lines and exits 0 only if
 * every check passed on both devices.
 */
import { resolve } from "node:path";
import { simulatorApp, staleApp } from "./lib/apple-app";
import { ensureDeps } from "./lib/deps";
import { type MacSim, macSim } from "./lib/mac-sim";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { scratchFleet, until } = await import("./scratch-fleet");

const keep = process.argv.includes("--keep");
const build = !process.argv.includes("--no-build");
const root = resolve(import.meta.dir, "..");
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

let failures = 0;
const fail = (what: string) => {
  console.log(`FAIL ${what}`);
  failures += 1;
};

/** Runs `script` in bash here; its stdout, or throws with its stderr. */
async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-c", `set -euo pipefail\n${script}`], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

// ── 1. Compile ───────────────────────────────────────────────────────────
if (build) {
  const child = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: root, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(child.stdout).text();
  process.stdout.write(text);
  if ((await child.exited) !== 0 || !/^BUILT iOS$/mu.test(text)) {
    fail("compile: build-both.sh did not print BUILT iOS");
    process.exit(1);
  }
}
// build-both.sh's build folder on this Mac: the cache root, by workspace.
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
// The app build-both.sh built from this tree, or why there is none to run (lib/apple-app.ts).
const app = simulatorApp(top);
{
  const stale = staleApp(top, app);
  if (stale) {
    console.log(`FAIL app: ${stale}`);
    process.exit(1);
  }
}

// ── 2. The scratch fleet ─────────────────────────────────────────────────
const fleet = await scratchFleet({
  name: "probe-ios-recall",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});
const WORDS = [
  "alpha",
  "bravo",
  "charlie",
  "delta",
  "echo",
  "foxtrot",
  "golf",
  "hotel",
  "india",
  "juliet",
  "kilo",
  "lima",
  "mike",
  "november",
  "oscar",
  "papa",
  "quebec",
  "romeo",
  "sierra",
  "tango",
  "uniform",
  "victor",
  "whiskey",
  "xray",
  "yankee",
  "zulu",
];
// The measures want 40 at least; the glide wants 200.
const SENDS = 200;
const sims: MacSim[] = [];
const DEVICES = ["iPhone 16 Pro", "iPad Pro 11-inch (M4)"];
/** What `log show --style compact` puts before a Probe line's own words. */
const PROBE_PREFIX = /^.*\[dev\.cawco\.app:Probe\]\s*/u;

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Recall wheel probe");
  for (let n = 1; n <= SENDS; n += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each send waits for the turn before it to end
    await fleet.send(
      id,
      `${WORDS[(n - 1) % WORDS.length]} message ${n} of the recall probe: say ok.`
    );
    await Bun.sleep(400);
    await until(
      `turn ${n} ending`,
      () => fleet.instance(id),
      (row) => row !== undefined && row.turn_open_at === null,
      60_000
    );
  }
  console.log(`  sent ${SENDS} messages to ${id}`);
  const port = Number(new URL(fleet.base).port);

  // ── 3. Each device ─────────────────────────────────────────────────────
  for (const name of DEVICES) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time, each with the machine to itself
    const sim = await macSim({
      runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
      device: name,
    });
    sims.push(sim);
    const { udid } = sim;
    console.log(`  ${name}: simulator ${udid}`);
    await sh(`xcrun simctl ui ${udid} appearance light
xcrun simctl install ${udid} "${app}"`);
    await sh(
      `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} -recall-probe >/dev/null`
    );
    const started = Date.now();
    const read = async () =>
      (
        await sh(
          `xcrun simctl spawn ${udid} log show --start "$(date -r ${Math.floor(started / 1000)} '+%Y-%m-%d %H:%M:%S')" --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"'`
        ).catch(() => "")
      )
        .split("\n")
        .map((line) => line.replace(PROBE_PREFIX, ""))
        .filter((line) => line.startsWith("recall "));
    const lines = await until(
      `${name}: the recall probe done`,
      read,
      (got) =>
        got.some((l) => l.startsWith("recall done")) ||
        got.some((l) => l.startsWith("recall FAIL probe")),
      420_000
    ).catch((error) => {
      fail(String(error));
      return read();
    });
    for (const line of lines) {
      console.log(`  ${name}: ${line}`);
      if (line.startsWith("recall FAIL")) {
        failures += 1;
      }
    }
    if (!lines.some((l) => l.startsWith("recall PASS"))) {
      fail(`${name}: no checks ran`);
    }
    await sim.release();
  }
} catch (error) {
  fail(`probe: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  for (const sim of sims) {
    // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time
    await sim.release();
  }
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
