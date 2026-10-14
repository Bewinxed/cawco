#!/usr/bin/env bun
/**
 * iOS busy-send probe: on a session kept busy, Send and Return queue the
 * message at once, with and without a canvas, and the action box's glyph
 * draws on every frame (the owner: "when session is busy I click send or
 * enter and the icon disappears and it doesn't queue").
 *
 *   bun scripts/probe-ios-busy-send.ts [--keep] [--no-build]
 *
 * Run from the repo root on the Mac (a CawCo workspace on the Mac runs it
 * too: the scratch fleet is loopback, the simulator is local). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only) unless --no-build;
 *  2. stands up a scratch fleet (scratch-fleet.ts) with one Claude session
 *     whose mock model streams a long reply to every turn of a conversation
 *     that holds `HOLD`, and sends `HOLD`: the session stays busy;
 *  3. on an iPhone 16 Pro, iOS 18.5, launches the app on that session with
 *     `-send-probe-busy` (ComposerSendProbe.swift checks it from inside
 *     the app and logs `send PASS|FAIL …` in the Probe category, and each
 *     change of the action box's glyph as `send glyph <face> drawn|BLANK`):
 *     (a) Send and (b) Return each queue within 1 s with the field cleared;
 *     (c) the same with a drawn canvas folded to its chip, the message
 *     carrying its file, outline and picture; (d) a canvas whose sync
 *     socket never answers refuses in place with its sentence, the words
 *     and the canvas kept; and no frame of the glyph is blank;
 *  4. reads the hub's own record: the session holds three sends from the
 *     app still pending, (d)'s words among none.
 *
 * It stops only what it started: the fleet's processes by PID and the
 * simulator it took. `--keep` keeps the fleet's sandbox. Prints every check
 * and `BUSY_SEND_PROBE_OK` when all held; exits 0 only then.
 */
import { basename, join, resolve } from "node:path";
import { type MacSim, macSim } from "./lib/mac-sim";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const build = !process.argv.includes("--no-build");
const root = resolve(import.meta.dir, "..");
const DEVICE = "iPhone 16 Pro";
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
/** What `log stream --style compact` puts before a Probe line's own words. */
const PROBE_PREFIX = /^.*\[dev\.cawco\.app:Probe\]\s*/;
/** One of the app's checks. */
const CHECK_LINE = /^send (PASS|FAIL) /;
const HOLD = "HOLD";
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

let failures = 0;
let passes = 0;
const fail = (what: string) => {
  console.log(`FAIL ${what}`);
  failures += 1;
};
const pass = (what: string) => {
  console.log(`PASS ${what}`);
  passes += 1;
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
  if ((await child.exited) !== 0 || !/^BUILT iOS$/m.test(text)) {
    fail("compile: build-both.sh did not print BUILT iOS");
    process.exit(1);
  }
}
// build-both.sh's build folder on this Mac: the cache root, by workspace.
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
const folder =
  top === join(process.env.HOME ?? "", "cockpit") ? "main" : basename(top);
const appleRoot = join(
  process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "", "Library/Caches"),
  "cawco-apple"
);
const app = join(
  appleRoot,
  folder,
  "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
);

// ── 2. The scratch fleet ─────────────────────────────────────────────────
/** Every turn of a conversation holding `HOLD` streams for about two minutes: the session stays busy. */
const respond = (seen: Seen): Reply =>
  seen.all.includes(HOLD)
    ? {
        everyMs: 250,
        words: Array.from({ length: 480 }, (_, i) => `step ${i + 1}. `),
      }
    : { everyMs: 20, words: ["ok"] };
const fleet = await scratchFleet({ name: "probe-ios-busy-send", respond });
let sim: MacSim | undefined;

/** One launch of the app on `id`: its `send …` Probe lines as they come. */
async function launchPass(
  udid: string,
  id: string,
  port: number
): Promise<string[]> {
  const stream = Bun.spawn(
    [
      "xcrun",
      "simctl",
      "spawn",
      udid,
      "log",
      "stream",
      "--style",
      "compact",
      "--predicate",
      'subsystem == "dev.cawco.app" AND category == "Probe"',
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  const lines: string[] = [];
  const reader = stream.stdout.getReader();
  const heard = (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read a chunk at a time
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      rest += decoder.decode(value, { stream: true });
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.replace(PROBE_PREFIX, "");
        if (line.startsWith("send ")) {
          lines.push(line);
          console.log(`  app: ${line}`);
        } else if (line.startsWith("canvas ")) {
          // The canvas probe's helpers say why the hub refused a drawing.
          console.log(`  app: ${line}`);
        }
      }
    }
  })();
  await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} -send-probe-busy >/dev/null`
  );
  await until(
    "the busy-send probe done",
    async () => lines,
    (got) =>
      got.some((l) => l === "send done") ||
      got.some((l) => l.startsWith("send FAIL probe")),
    240_000
  ).catch((error) => fail(String(error)));
  await reader.cancel();
  await heard;
  stream.kill();
  for (const line of lines) {
    const check = line.match(CHECK_LINE);
    if (check?.[1] === "PASS") {
      passes += 1;
    } else if (check?.[1] === "FAIL") {
      failures += 1;
    }
  }
  if (!lines.some((l) => l.startsWith("send PASS"))) {
    fail("no checks ran in the app");
  }
  return lines;
}

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Busy send probe");
  await fleet.send(id, `${HOLD}: work through the steps.`);
  await until(
    "the HOLD turn running",
    () => fleet.instance(id),
    (row) => row !== undefined && row.turn_open_at !== null,
    60_000
  );
  const port = Number(new URL(fleet.base).port);

  // ── 3. The pass ────────────────────────────────────────────────────────
  sim = await macSim({ runtime: RUNTIME, device: DEVICE });
  const { udid } = sim;
  console.log(`  ${DEVICE}: simulator ${udid}`);
  await sh(`xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100
xcrun simctl ui ${udid} appearance light
xcrun simctl spawn ${udid} defaults write com.apple.Accessibility ReduceMotionEnabled -bool false
xcrun simctl install ${udid} "${app}"`);
  await launchPass(udid, id, port);

  // ── 4. The hub's record ────────────────────────────────────────────────
  const session = fleet.instance(id);
  const states = fleet.query<{ state: string; n: number }>(
    "SELECT state, COUNT(*) AS n FROM sent_messages WHERE instance_id = ? GROUP BY state",
    id
  );
  const said = states.map((s) => `${s.state} ${s.n}`).join(", ") || "none";
  const pending = states.find((s) => s.state === "pending")?.n ?? 0;
  if (session?.turn_open_at !== null && pending >= 3) {
    pass(
      `the hub holds the app's three sends pending while the turn runs: ${said}`
    );
  } else {
    fail(
      `the hub holds the app's three sends pending while the turn runs: ${said}, turn open ${session?.turn_open_at !== null}`
    );
  }
} catch (error) {
  fail(`probe: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await sim?.release();
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(`${passes} passed, ${failures} failed`);
if (failures === 0 && passes > 0) {
  console.log("BUSY_SEND_PROBE_OK");
}
process.exit(failures === 0 && passes > 0 ? 0 : 1);
