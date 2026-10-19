/**
 * iOS Safari: the dashboard's session page and `/` load cold in light and
 * dark, and Safari's web process stays healthy for the next page. On a
 * scratch fleet's built dashboard, in the iOS Simulator's own Safari
 * (`com.apple.mobilesafari`), each page in a fresh Safari (`simctl
 * terminate`), opened with `simctl openurl`:
 *
 *  - no web process ends under it: Safari's log has no
 *    `WebProcessProxy::didClose` while it is watched (at least
 *    {@link HOLD_MS}), a crash a second or two after the load painted
 *    included;
 *  - the screen, read once a second (`simctl io screenshot`), paints past the
 *    body's recess within {@link PAINTS_MS} of the load's commit
 *    (`didCommitLoadForFrame` in Safari's log): the shell's ink down the web
 *    view's band beside the recess (its colour read from Chromium on the same
 *    page and scheme). A page that never paints shows the recess alone;
 *  - a small static page opened next in the same Safari paints (its colour
 *    fills the band), which a Safari left broken never lets it.
 *
 * First, the static page alone in a fresh Safari paints: the control.
 *
 * The runtimes: the newest iOS installed, and iOS 26.0 when it is (the iOS 26
 * family the owner's iPhone Safari belongs to). Not iOS 26.3: on a macOS 27
 * host its JavaScriptCore crashes (SIGBUS, KERN_PROTECTION_FAILURE) on
 * JS-heavy pages, the dashboard and public sites (react.dev, figma.com) alike,
 * while 26.0, 18.5 and 27.2 run them clean (README "A spec that delegates
 * runs on the host").
 *
 * The spec takes a Mac slot (lib/mac-sim.ts) per runtime, one at a time.
 * `PROBE_SIM_UDID` (comma separated) names simulators already booted to run
 * on instead.
 *
 *   bun scripts/probe-kit/run.ts ios-safari-load
 *   PROBE_SIM_UDID=<udid>,<udid> bun scripts/probe-kit/run.ts ios-safari-load
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one Safari, one page at a time
import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { PNG } from "pngjs";
import { macSim, type SimChoice } from "../../lib/mac-sim";
import { colours, type Rgb } from "../ink";
import { type Kit, type KitFleet, open, type Spec, THEMES } from "../kit";

const SAFARI = "com.apple.mobilesafari";
const IOS_26_0 = "com.apple.CoreSimulator.SimRuntime.iOS-26-0";
const IPHONE = "com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro";
/** What a runtime identifier carries before its name (`iOS-27-2`). */
const RUNTIME_PREFIX = /^.*SimRuntime\./;
/**
 * How long a page has to paint past the recess once its load committed: a
 * normal cold load. From the commit, so the scratch fleet's own serving on a
 * loaded Mac (a commit 12.7s in) is not counted against the page.
 */
const PAINTS_MS = 10_000;
/** How long a page that has not painted is watched before it is called a hang. */
const WATCH_MS = 120_000;
/** How long a page is watched at the least, painted or not, for its web process to end. */
const HOLD_MS = 10_000;
/** How long the static page has to paint. */
const STATIC_MS = 20_000;
/** The static page's fill: nothing on the dashboard is this colour. */
const STATIC_FILL: Rgb = [204, 0, 51];
const STATIC_PAGE = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>static</title></head><body style="background:rgb(${STATIC_FILL.join(",")});margin:0"><h1 style="color:#fff;font:48px system-ui;padding:40px">static page</h1></body></html>`;
/** How near a pixel is to count as the colour it is read against: the capture is colour-managed. */
const NEAR = 12;
/**
 * Share of the band's rows the shell inks once it stands. Measured: `/` on a
 * phone with one session stands at 0.084, the session page at 0.145; a page
 * that never painted, and Safari's blank before a load, at 0.000.
 */
const INKED = 0.05;

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
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

/** The web view's band of a capture: below the status bar, above Safari's bar. */
interface Band {
  /** Share of sampled pixels within {@link NEAR} of the colour read against. */
  at: number;
  /** Share of the band's sampled rows with any pixel more than 24 from it. */
  inked: number;
  /** The commonest colour a quarter, half and three quarters down the screen. */
  rows: string;
}

function band(file: string, near: Rgb): Band {
  const png = PNG.sync.read(readFileSync(file));
  const pixel = (x: number, y: number): Rgb => {
    const i = (y * png.width + x) * 4;
    return [png.data[i] ?? 0, png.data[i + 1] ?? 0, png.data[i + 2] ?? 0];
  };
  let n = 0;
  let at = 0;
  let rows = 0;
  let inkedRows = 0;
  for (
    let y = Math.round(png.height * 0.08);
    y < Math.round(png.height * 0.84);
    y += 6
  ) {
    let inked = false;
    for (let x = 0; x < png.width; x += 6) {
      const [r, g, b] = pixel(x, y);
      const d = Math.max(
        Math.abs(r - near[0]),
        Math.abs(g - near[1]),
        Math.abs(b - near[2])
      );
      n += 1;
      at += d <= NEAR ? 1 : 0;
      inked ||= d > 24;
    }
    rows += 1;
    inkedRows += inked ? 1 : 0;
  }
  const commonest = (y: number) => {
    const seen = new Map<string, number>();
    for (let x = 0; x < png.width; x += 3) {
      const key = pixel(x, y).join(",");
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return [...seen].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";
  };
  return {
    at: at / n,
    inked: inkedRows / rows,
    rows: [0.25, 0.5, 0.75]
      .map((share) => commonest(Math.round(png.height * share)))
      .join(" / "),
  };
}

/** Safari's page and process lines, heard as they come, each with when. */
interface Heard {
  lines: { line: string; t: number }[];
  stream: Subprocess;
}

function hear(udid: string): Heard {
  const lines: { line: string; t: number }[] = [];
  const stream = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --style compact --predicate 'process == "MobileSafari"'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    const reader = stream.stdout.getReader();
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      rest += decoder.decode(value, { stream: true });
      const split = rest.split("\n");
      rest = split.pop() ?? "";
      const t = performance.now();
      for (const line of split) {
        if (
          line.includes("WebPageProxy::did") ||
          line.includes("WebProcessProxy::didFinishLaunching") ||
          line.includes("WebProcessProxy::didClose")
        ) {
          lines.push({ line, t });
        }
      }
    }
  })().catch(() => undefined);
  return { lines, stream };
}

/** One page's watch, each time from the `openurl`. */
interface Watch {
  commit: number | null;
  /** Web processes that ended under the page (`WebProcessProxy::didClose`). */
  crashes: number;
  painted: number | null;
  reads: string[];
}

const s = (ms: number | null) =>
  ms === null ? "never" : `${(ms / 1000).toFixed(1)}s`;

/**
 * Opens `url` in the simulator's Safari and reads the screen once a second
 * until `painted` holds and {@link HOLD_MS} has passed, or `ms` passes.
 */
async function watch(
  on: { heard: Heard; shots: string; udid: string },
  url: string,
  name: string,
  painted: (read: Band) => boolean,
  near: Rgb,
  ms: number
): Promise<Watch> {
  const mark = on.heard.lines.length;
  const start = performance.now();
  await sh(`xcrun simctl openurl ${on.udid} '${url}'`);
  const reads: string[] = [];
  let at: number | null = null;
  for (let i = 0; performance.now() - start < ms; i += 1) {
    const file = join(on.shots, `${name}-${String(i).padStart(3, "0")}.png`);
    await sh(`xcrun simctl io ${on.udid} screenshot '${file}' >/dev/null 2>&1`);
    const t = performance.now() - start;
    const read = band(file, near);
    reads.push(
      `${(t / 1000).toFixed(1)}s at ${read.at.toFixed(3)} inked ${read.inked.toFixed(3)} rows ${read.rows}`
    );
    at ??= painted(read) ? t : null;
    if (at !== null && t >= HOLD_MS) {
      break;
    }
    await Bun.sleep(1000 - ((performance.now() - start) % 1000));
  }
  const after = on.heard.lines.slice(mark);
  const commit = after.find(({ line }) =>
    line.includes("didCommitLoadForFrame: frameID")
  );
  return {
    painted: at,
    reads,
    commit: commit ? commit.t - start : null,
    crashes: after.filter(({ line }) =>
      line.includes("WebProcessProxy::didClose")
    ).length,
  };
}

/** Where the simulators come from: those already booted and named, or a Mac slot per runtime. */
type Target =
  { kind: "booted"; udid: string } | { choice: SimChoice; kind: "slot" };

async function targets(): Promise<Target[]> {
  const named = process.env.PROBE_SIM_UDID;
  if (named) {
    return named
      .split(",")
      .map((udid) => udid.trim())
      .filter(Boolean)
      .map((udid) => ({ kind: "booted", udid }));
  }
  const runtimes = JSON.parse(await sh("xcrun simctl list runtimes -j")) as {
    runtimes: { identifier: string; isAvailable: boolean }[];
  };
  const has26 = runtimes.runtimes.some(
    (r) => r.identifier === IOS_26_0 && r.isAvailable
  );
  return [
    { kind: "slot", choice: { newest: "iPhone \\d+ Pro" } },
    ...(has26
      ? [
          {
            kind: "slot",
            choice: { runtime: IOS_26_0, device: IPHONE },
          } as const,
        ]
      : []),
  ];
}

/** The runtime a booted simulator runs, as `iOS-27-2`. */
async function runtimeOf(udid: string): Promise<string> {
  const listed = JSON.parse(await sh("xcrun simctl list devices -j")) as {
    devices: Record<string, { udid: string }[]>;
  };
  const runtime = Object.entries(listed.devices).find(([, devices]) =>
    devices.some((device) => device.udid === udid)
  )?.[0];
  return runtime?.replace(RUNTIME_PREFIX, "") ?? "unknown";
}

/** Every leg on one simulator: the control, then each page in each scheme. */
async function onSimulator(
  kit: Kit,
  udid: string,
  pages: (readonly [string, string])[],
  built: string,
  fixed: string
): Promise<void> {
  const tag = await runtimeOf(udid);
  console.log(`  simulator ${udid} on ${tag}`);
  const heard = hear(udid);
  const shots = join(kit.out, tag, "shots");
  await mkdir(shots, { recursive: true });
  const on = { heard, shots, udid };
  const staticPainted = (read: Band) => read.at > 0.5;
  try {
    await sh(`xcrun simctl terminate ${udid} ${SAFARI} || true`);
    const control = await watch(
      on,
      `${fixed}/?control`,
      "control",
      staticPainted,
      STATIC_FILL,
      STATIC_MS
    );
    kit.check(
      `${tag}: the static page alone paints in a fresh Safari`,
      control.painted !== null && control.crashes === 0,
      `painted ${s(control.painted)}, web process crashes ${control.crashes}; last read ${control.reads.at(-1)}`
    );
    for (const theme of THEMES) {
      await sh(`xcrun simctl ui ${udid} appearance ${theme}`);
      // The recess as the engine says it, on the same build in the same scheme.
      const chromium = await kit.page("iphone15Pro", { theme });
      await open(chromium, `${built}/`, "body");
      const [recess = [0, 0, 0] as Rgb] = await colours(chromium, [
        await chromium.evaluate(
          () => getComputedStyle(document.body).backgroundColor
        ),
      ]);
      await chromium.close();
      for (const [where, path] of pages) {
        const name = `${theme}-${where === "/" ? "home" : where}`;
        await sh(`xcrun simctl terminate ${udid} ${SAFARI} || true`);
        const page = await watch(
          on,
          `${built}${path}`,
          name,
          // The shell's ink down the band beside the recess: neither the
          // recess alone with a tinted top (a page that never painted) nor a
          // screen with no recess on it (Safari's own).
          (read) => read.at > 0.02 && read.inked > INKED,
          recess,
          WATCH_MS
        );
        const after = await watch(
          on,
          `${fixed}/?after=${name}`,
          `${name}-static`,
          staticPainted,
          STATIC_FILL,
          STATIC_MS
        );
        await Bun.write(
          join(kit.out, tag, `${name}.reads.txt`),
          [...page.reads, "-- static --", ...after.reads].join("\n")
        );
        kit.check(
          `${tag} ${where} ${theme}: no web process crashes, it paints past the recess within ${PAINTS_MS / 1000}s of its commit, and a static page after it paints in the same Safari`,
          page.crashes === 0 &&
            page.commit !== null &&
            page.painted !== null &&
            page.painted - page.commit < PAINTS_MS &&
            after.painted !== null,
          `web process crashes ${page.crashes}; painted ${s(page.painted)} (watched up to ${WATCH_MS / 1000}s), commit ${s(page.commit)}; static after painted ${s(after.painted)}; recess rgb(${recess.join(",")}); last read ${page.reads.at(-1)}`
        );
      }
    }
  } finally {
    await sh(
      `xcrun simctl terminate ${udid} ${SAFARI} || true; xcrun simctl ui ${udid} appearance light`
    ).catch(() => "");
    await Bun.write(
      join(kit.out, tag, "safari.log"),
      heard.lines.map(({ line }) => line).join("\n")
    );
    heard.stream.kill();
  }
}

async function standUp(kit: Kit): Promise<KitFleet> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  return fleet;
}

const run = async (kit: Kit) => {
  const sims = await targets();
  const fixed = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(STATIC_PAGE, {
        headers: { "content-type": "text/html", "cache-control": "no-store" },
      }),
  });
  try {
    const fleet = await standUp(kit);
    const built = await fleet.dashboard();
    const session = await fleet.spawn("claude", "Probe load", fleet.workdir);
    const pages = [
      ["/", "/"],
      ["session", `/session/${session}`],
    ] as const;
    for (const target of sims) {
      if (target.kind === "booted") {
        await onSimulator(
          kit,
          target.udid,
          [...pages],
          built,
          `http://127.0.0.1:${fixed.port}`
        );
        continue;
      }
      // One slot at a time: the Mac holds two simulators machine-wide.
      const sim = await macSim(target.choice);
      try {
        await sh(`xcrun simctl bootstatus ${sim.udid} -b >/dev/null`);
        await onSimulator(
          kit,
          sim.udid,
          [...pages],
          built,
          `http://127.0.0.1:${fixed.port}`
        );
      } finally {
        await sim.release();
      }
    }
  } finally {
    fixed.stop(true);
  }
};

const spec: Spec = { name: "ios-safari-load", run };
export default spec;
