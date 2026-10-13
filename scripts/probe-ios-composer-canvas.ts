#!/usr/bin/env bun
/**
 * iOS composer canvas probe (DESIGN.md Composer, The pen's swipe; Artifact
 * panel, canvas and ink): a pencil's swipe up on the composer's pill grows
 * it into the canvas over the field, a finger's swipe stays the recall
 * wheel's, and the canvas resizes, folds to its chip and goes out with a
 * send as its file, outline and picture.
 *
 *   bun scripts/probe-ios-composer-canvas.ts [--keep] [--no-build] [--draw]
 *
 * `--draw` runs what needs no simulator input (inside a workspace boundary,
 * which refuses it): Attach → Draw opens the canvas and every check after
 * the opening runs, then Reduce Motion; it prints CANVAS_PROBE_DRAW_OK,
 * never CANVAS_PROBE_OK, since neither swipe ran.
 *
 * Run from the repo root on the Mac, outside a workspace boundary (simctl's
 * input and the simulator's log need the host). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only) unless --no-build;
 *  2. stands up a scratch fleet (scratch-fleet.ts: a real hub with its
 *     preview listener, agent and sessiond, Claude Code on a mock model)
 *     and spawns one session;
 *  3. on an iPad Pro 11-inch (M4), iOS 18.5, launches the app on that
 *     session three times (ComposerCanvasProbe.swift reads the canvas off
 *     the app and logs `canvas PASS|FAIL …` in the Probe category):
 *     - `-canvas-probe -cawcoProbePencil`: the simulator has no pencil, so
 *       for this run the canvas's recognizer takes a finger as one; on the
 *       app's `canvas swipe at X,Y` line a finger drags up from there (axe);
 *     - `-canvas-probe-wheel`: the same drag, no stand-in, brings the wheel;
 *     - `-canvas-probe-still` with Reduce Motion on: Draw and Done fade only;
 *  4. reads the hub's transcript of the session: the message the pencil pass
 *     sent carries `canvas.excalidraw` and `canvas.md` and one image.
 *
 * It stops only what it started: the fleet's processes by PID and the
 * simulator it created. `--keep` keeps the fleet's sandbox. Prints every
 * check and `CANVAS_PROBE_OK` when all held; exits 0 only then.
 */
import { basename, join, resolve } from "node:path";
import { type MacSim, macSim } from "./lib/mac-sim";
import { scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const build = !process.argv.includes("--no-build");
const drawOnly = process.argv.includes("--draw");
const root = resolve(import.meta.dir, "..");
const AXE = "/opt/homebrew/bin/axe";
const DEVICE = "iPad Pro 11-inch (M4)";
const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
/** What `log stream --style compact` puts before a Probe line's own words. */
const PROBE_PREFIX = /^.*\[dev\.cawco\.app:Probe\]\s*/;
/** The app asking for the finger's drag: where it goes down, in points. */
const SWIPE_AT = /canvas swipe at (\d+),(\d+)/;
/** An element's label in axe's `describe-ui`. */
const LABELLED = /"AXLabel" : "([^"]+)"/g;
/** One of the app's checks. */
const CHECK_LINE = /^canvas (PASS|FAIL) /;
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
const fleet = await scratchFleet({
  name: "probe-ios-composer-canvas",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});
let sim: MacSim | undefined;

/**
 * One finger moving up from (x, y), in points (axe `drag`: down, moves, up),
 * as probe-ios-composer.ts drags. A refused drag fails the pass at once,
 * rather than leaving the app waiting for it; answers whether it went.
 */
async function dragUp(
  udid: string,
  label: string,
  x: number,
  y: number
): Promise<boolean> {
  const refusal = await sh(
    `${AXE} drag --start-x ${x} --start-y ${y} --end-x ${x} --end-y ${y - 160} --duration 0.4 --steps 30 --udid ${udid}`
  ).then(
    () => null,
    (error: Error) => error.message
  );
  if (refusal !== null) {
    fail(`${label}: the drag up from ${x},${y} was refused: ${refusal}`);
    // What axe reads on the screen then: whatever stands over the point.
    const screen = await sh(`${AXE} describe-ui --udid ${udid}`).catch(
      (error: Error) => error.message
    );
    const labels = [...screen.matchAll(LABELLED)].map((match) => match[1]);
    console.log(
      `  ${label}: on screen then: ${labels.slice(0, 30).join(" | ") || screen.slice(0, 400)}`
    );
    return false;
  }
  console.log(`  ${label}: dragged up from ${x},${y}`);
  return true;
}

/** One launch of the app on `id` with `args`, its Probe lines as they come, swipes answered. */
async function launchPass(
  udid: string,
  id: string,
  port: number,
  label: string,
  args: string[]
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
  /** The pass's drag was refused: it is over. */
  let refused = false;
  // Cancelled when the pass is done: the simulator's own `log` keeps the pipe open.
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
        if (!line.startsWith("canvas ")) {
          continue;
        }
        lines.push(line);
        console.log(`  ${label}: ${line}`);
        const at = line.match(SWIPE_AT);
        // biome-ignore lint/performance/noAwaitInLoops: one swipe at a time, as the app asks
        if (at && !(await dragUp(udid, label, Number(at[1]), Number(at[2])))) {
          refused = true;
        }
      }
    }
  })();
  await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} ${args.join(" ")} >/dev/null`
  );
  await until(
    `${label}: the canvas probe done`,
    async () => lines,
    (got) =>
      refused ||
      got.some((l) => l.startsWith("canvas done")) ||
      got.some((l) => l.startsWith("canvas FAIL probe")),
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
  if (!lines.some((l) => l.startsWith("canvas PASS"))) {
    fail(`${label}: no checks ran`);
  }
  return lines;
}

/** Every block in the hub's transcript of `id`, as JSON objects. */
const blocksOf = async (id: string): Promise<Record<string, unknown>[]> => {
  const page = await fleet.api<{ blocks?: Record<string, unknown>[] }>(
    `/api/instances/${id}/transcript?limit=200`
  );
  return page.blocks ?? [];
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Composer canvas probe");
  await fleet.send(id, "The canvas probe starts here: say ok.");
  await until(
    "the first turn ending",
    () => fleet.instance(id),
    (row) => row !== undefined && row.turn_open_at === null,
    60_000
  );
  const port = Number(new URL(fleet.base).port);

  // ── 3. The passes ──────────────────────────────────────────────────────
  sim = await macSim({ runtime: RUNTIME, device: DEVICE });
  const { udid } = sim;
  console.log(`  ${DEVICE}: simulator ${udid}`);
  await sh(`xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100
xcrun simctl ui ${udid} appearance light
xcrun simctl spawn ${udid} defaults write com.apple.Accessibility ReduceMotionEnabled -bool false
xcrun simctl install ${udid} "${app}"`);
  // `--draw`: the passes that need no input from outside the app (inside a
  // workspace boundary, which refuses the simulator's input): Attach → Draw
  // opens the canvas, and every check after the opening runs the same.
  const pen = drawOnly
    ? await launchPass(udid, id, port, "draw", ["-canvas-probe-draw"])
    : await launchPass(udid, id, port, "pencil", [
        "-canvas-probe",
        "-cawcoProbePencil",
      ]);
  if (!drawOnly) {
    await launchPass(udid, id, port, "finger", ["-canvas-probe-wheel"]);
  }
  // Reduce Motion: the app reads it at launch.
  await sh(
    `xcrun simctl spawn ${udid} defaults write com.apple.Accessibility ReduceMotionEnabled -bool true`
  );
  await launchPass(udid, id, port, "still", ["-canvas-probe-still"]);
  await sh(
    `xcrun simctl spawn ${udid} defaults write com.apple.Accessibility ReduceMotionEnabled -bool false`
  );

  // ── 4. What the hub holds ──────────────────────────────────────────────
  const sent = pen.some((l) => l.startsWith("canvas sent canvas"));
  const carried = sent
    ? await until(
        "the canvas's message in the hub's transcript",
        () => blocksOf(id),
        (blocks) =>
          blocks.some((block) =>
            JSON.stringify(block.attachments ?? []).includes(
              "canvas.excalidraw"
            )
          ),
        60_000
      ).catch(() => [] as Record<string, unknown>[])
    : [];
  const message = carried.find((block) =>
    JSON.stringify(block.attachments ?? []).includes("canvas.excalidraw")
  );
  const names = (
    (message?.attachments as { name?: string }[] | undefined) ?? []
  ).map((a) => a.name ?? "?");
  const images = (message?.images as unknown[] | undefined)?.length ?? 0;
  const detail = `attachments ${names.join(", ") || "none"}, images ${images}`;
  if (
    names.includes("canvas.excalidraw") &&
    names.includes("canvas.md") &&
    images === 1
  ) {
    pass(
      `the hub holds the message with the canvas's file, outline and picture: ${detail}`
    );
  } else {
    fail(
      `the hub holds the message with the canvas's file, outline and picture: ${detail}`
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
  // The swipes are only proven by the whole run: `--draw` says so.
  console.log(
    drawOnly ? "CANVAS_PROBE_DRAW_OK (the swipes not run)" : "CANVAS_PROBE_OK"
  );
}
process.exit(failures === 0 && passes > 0 ? 0 : 1);
