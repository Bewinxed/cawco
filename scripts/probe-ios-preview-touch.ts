#!/usr/bin/env bun
/**
 * iOS preview touch probe: in the app's preview drawer a tap reaches the
 * page unless the person turned Select on; while Select is on the page
 * takes no tap but picks, and that shows (Done, the line on the well's top
 * edge); Done, Reload and a drag of the grabber leave the page taking taps.
 *
 *   bun scripts/probe-ios-preview-touch.ts [--keep] [--no-build]
 *
 * Run from the repo root on the Mac (a CawCo workspace on it, or the owner's
 * shell there). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only) unless --no-build;
 *  2. stands up a scratch fleet (scratch-fleet.ts: a real hub, agent and
 *     sessiond, Claude Code on a mock model), spawns one session and gives it
 *     a page artifact (the artifact routes, as `artifact_create` does) with
 *     three tabs (`<a role="tab" href="?view=…">`, `aria-selected` from the
 *     query) and a button counting its own clicks; the page posts
 *     `cawco:probe` with its state and the rects of what is tapped;
 *  3. on an iPhone 16 Pro simulator on iOS 18.5 (mac-slot.sh sim --runtime
 *     …iOS-18-5, as probe-ios-recall.ts and build-both.sh's floor launch;
 *     axe's touches time out on the 27.2 runtime) launches the
 *     app on that session with `-preview-probe`, which logs the preview's
 *     mode, documents, picks and the page's posts (PreviewController.swift)
 *     in the Probe category, each rect as its centre in window points;
 *  4. taps and drags by simulator touch (axe, as the composer probe does) at
 *     the places the app logs, and reads the page's answers from that log.
 *
 * axe's touches need testmanagerd's socket, which a CawCo workspace's
 * boundary refuses ("Operation not permitted"; so does idb_companion, which
 * cannot write the simulator's data folder there): run it from the owner's
 * shell on the Mac.
 *
 * It stops only what it started: the fleet's processes by PID and the
 * simulator it took (deleted at the end). `--keep` keeps the fleet's sandbox.
 * Prints `PASS <step>` / `FAIL <step>` per check, then `TAP_REACHED_PAGE`
 * only if every check passed (exit 0), else the first failing check.
 */
import { basename, join, resolve } from "node:path";
import { type MacSim, macSim } from "./lib/mac-sim";
import { scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const build = !process.argv.includes("--no-build");
const root = resolve(import.meta.dir, "..");
const AXE = "/opt/homebrew/bin/axe";
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

const failed: string[] = [];
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failed.push(`${step}: ${detail}`);
  }
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
    console.log("FAIL compile: build-both.sh did not print BUILT iOS");
    process.exit(1);
  }
}
// build-both.sh's build folder on this Mac: the cache root, by workspace.
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
const folder =
  top === join(process.env.HOME ?? "", "cockpit") ? "main" : basename(top);
const app = join(
  process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "", "Library/Caches"),
  "cawco-apple",
  folder,
  "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
);

// ── 2. The page ──────────────────────────────────────────────────────────
// Tabs as the owner's page has them: links to `?view=…`, a new document
// each, `aria-selected` from the query. The button counts its own clicks.
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Touch probe</title>
<style>
body { font: 16px system-ui; margin: 0; padding: 16px; }
[role=tablist] { display: flex; gap: 8px; }
a[role=tab] { padding: 12px 16px; border: 1px solid #888; border-radius: 8px; color: #000; text-decoration: none; }
a[aria-selected=true] { background: #ddd; }
#count { margin-top: 32px; padding: 16px 28px; font-size: 18px; }
</style></head>
<body>
<div role="tablist">
<a role="tab" id="tab-table" href="?view=table">Table</a>
<a role="tab" id="tab-board" href="?view=board">Board</a>
<a role="tab" id="tab-routines" href="?view=routines">Routines</a>
</div>
<button id="count" type="button">Count 0</button>
<script>
const view = new URLSearchParams(location.search).get("view") || "table";
for (const tab of document.querySelectorAll("[role=tab]")) {
  tab.setAttribute("aria-selected", String(tab.id === "tab-" + view));
}
let count = 0;
const button = document.getElementById("count");
const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
function report() {
  const selected = document.querySelector("[role=tab][aria-selected=true]")?.id.slice(4) ?? "none";
  const rects = { button: rect(button) };
  for (const tab of document.querySelectorAll("[role=tab]")) rects[tab.id] = rect(tab);
  window.parent.postMessage({ type: "cawco:probe", state: "view=" + view + " selected=" + selected + " count=" + count, rects }, "*");
}
button.addEventListener("click", () => { count += 1; button.textContent = "Count " + count; report(); });
report();
setInterval(report, 700);
</script>
</body></html>`;

// ── 3. The app's Probe log ───────────────────────────────────────────────
/** What `log stream --style compact` puts before a Probe line's own words. */
const PROBE_PREFIX = /^.*\[dev\.cawco\.app:Probe\]\s*/;
/** PreviewController's `preview page …` and `preview head …` lines. */
const PAGE_LINE = /^preview page view=(\S+) selected=(\S+) count=(\d+)(.*)$/;
const HEAD_LINE =
  /^preview head select=(.+)@(-?\d+),(-?\d+) reload=(-?\d+),(-?\d+) grabber=(?:none|(-?\d+),(-?\d+)) note=(\d+)$/;
const seen: string[] = [];

interface Page {
  at: Record<string, { x: number; y: number }>;
  count: number;
  selected: string;
  view: string;
}
/** A `preview page …` line, read. */
const pageOf = (line: string): Page | undefined => {
  const words = line.match(PAGE_LINE);
  if (!words) {
    return;
  }
  const at: Page["at"] = {};
  for (const [, name, x, y] of words[4].matchAll(/(\S+)=(-?\d+),(-?\d+)/g)) {
    at[name] = { x: Number(x), y: Number(y) };
  }
  return { view: words[1], selected: words[2], count: Number(words[3]), at };
};
/** The newest page line after `from`. */
const pageAfter = (from: number) =>
  seen.slice(from).map(pageOf).filter(Boolean).at(-1) as Page | undefined;
/** Waits for a log line after `from` that `match` takes. */
const lineAfter = (
  what: string,
  from: number,
  match: (line: string) => boolean,
  ms = 15_000
) =>
  until(what, () => seen.slice(from).find(match), Boolean, ms).catch(
    () => undefined
  );
/** Waits for the page to post after `from` (it posts every 700ms), so its rects are where they are drawn now. */
const freshPage = async (what: string, from: number, ms = 15_000) => {
  await lineAfter(what, from, (line) => pageOf(line) !== undefined, ms);
  return pageAfter(from);
};
/** The page as it posts now, or the probe stops: nothing more can be tapped. */
const pageNow = async (what: string): Promise<Page> => {
  const now = await freshPage(what, seen.length);
  if (!now) {
    throw new Error(`the page went quiet: ${what}`);
  }
  return now;
};
const pause = (ms: number) => Bun.sleep(ms);

interface Point {
  x: number;
  y: number;
}
/** The header as the app logs it before each page post: Select's words and centre, Reload's, the grabber's, the selecting line's height. */
interface Head {
  grabber?: Point;
  note: number;
  reload: Point;
  select: Point;
  words: string;
}
const headOf = (line: string): Head | undefined => {
  const m = line.match(HEAD_LINE);
  if (!m) {
    return;
  }
  return {
    words: m[1],
    select: { x: Number(m[2]), y: Number(m[3]) },
    reload: { x: Number(m[4]), y: Number(m[5]) },
    grabber:
      m[6] === undefined ? undefined : { x: Number(m[6]), y: Number(m[7]) },
    note: Number(m[8]),
  };
};
/** The header as the app logs it now (with the page's next post), or the probe stops. */
const headNow = async (what: string): Promise<Head> => {
  const from = seen.length;
  await lineAfter(what, from, (line) => headOf(line) !== undefined);
  const head = seen.slice(from).map(headOf).filter(Boolean).at(-1) as
    | Head
    | undefined;
  if (!head) {
    throw new Error(`no header line: ${what}`);
  }
  return head;
};
const NOTE_HEIGHT = 28;

const fleet = await scratchFleet({
  name: "probe-ios-preview-touch",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});
let sim: MacSim | undefined;
let stream: ReturnType<typeof Bun.spawn> | undefined;

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Preview touch probe");
  const made = await fleet.api<{ id: string; opened?: unknown }>(
    `/api/instances/${id}/artifacts`,
    { kind: "page", name: "touch-probe", html: PAGE }
  );
  console.log(`  page artifact ${made.id} for session ${id}`);
  const port = Number(new URL(fleet.base).port);

  // ── 4. The simulator ───────────────────────────────────────────────────
  // iOS 18.5, as probe-ios-recall.ts and build-both.sh's floor launch take:
  // axe on the 27.2 runtime timed out "creating the simulator remote
  // automation session" at its first touch, twice.
  sim = await macSim({
    runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
    device: "iPhone 16 Pro",
  });
  const { udid } = sim;
  console.log(`  simulator ${udid}`);
  await sh(`xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl ui ${udid} appearance light
xcrun simctl install ${udid} "${app}"`);
  stream = Bun.spawn(
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
  // Read until the pass is done: the simulator's own `log` keeps the pipe
  // open after `simctl spawn` is stopped, so the read is cancelled.
  const reader = (stream.stdout as ReadableStream<Uint8Array>).getReader();
  (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: a stream is read a chunk at a time
      const { value, done } = await reader
        .read()
        .catch(() => ({ value: undefined, done: true }));
      if (done) {
        break;
      }
      rest += decoder.decode(value, { stream: true });
      const parts = rest.split("\n");
      rest = parts.pop() ?? "";
      for (const part of parts) {
        if (PROBE_PREFIX.test(part)) {
          seen.push(part.replace(PROBE_PREFIX, "").trim());
        }
      }
    }
  })();
  await pause(1500);

  // Where things are comes from the app's own log (its views' frames and the
  // page's rects), not the accessibility tree. axe's touches (and its
  // describe-ui) go through testmanagerd's socket, which a CawCo workspace's
  // boundary refuses ("Operation not permitted"): run this from the owner's
  // shell on the Mac.
  const tap = (point: Point) =>
    sh(`${AXE} tap -x ${point.x} -y ${point.y} --udid ${udid}`);
  /** One finger from `from` to `to` over half a second (axe `drag`: down, moves, up). */
  const drag = (from: Point, to: Point) =>
    sh(
      `${AXE} drag --start-x ${from.x} --start-y ${from.y} --end-x ${to.x} --end-y ${to.y} --duration 0.5 --steps 30 --udid ${udid}`
    );
  const grabber = async () => (await headNow("the grabber")).grabber;

  await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} -preview-probe >/dev/null`
  );
  let page = await freshPage("the page loaded in the preview", 0, 120_000);
  check(
    "page loads in the drawer",
    page?.view === "table" && "tab-board" in page.at,
    page
      ? `view=${page.view} selected=${page.selected} count=${page.count}`
      : `no page line; log: ${seen.slice(-5).join(" | ") || "nothing"}`
  );
  if (!page) {
    throw new Error("the page never posted");
  }
  // The overlay's ready, the app's buttons enabled.
  await pause(1500);
  const grabAt = await grabber();

  // ── 5. Select off: a tab and the button reach the page ────────────────
  let mark = seen.length;
  await tap(page.at["tab-board"]);
  const doc = await lineAfter(
    "a new document after the tab",
    mark,
    (l) => l === "preview document"
  );
  page = await until(
    "the page on view=board",
    () => pageAfter(mark),
    (p) => p?.view === "board",
    15_000
  ).catch(() => pageAfter(mark));
  check(
    "a tap on a tab switches the view",
    doc !== undefined && page?.view === "board" && page.selected === "board",
    `document ${doc ? "loaded" : "not loaded"}; ${page ? `view=${page.view} aria-selected=${page.selected}` : "no page line"}`
  );
  if (!page) {
    throw new Error("the page went quiet after the tab");
  }
  await pause(800);
  let before = (pageAfter(mark) ?? page).count;
  mark = seen.length;
  await tap(page.at.button);
  page = await until(
    "the counter up",
    () => pageAfter(mark),
    (p) => (p?.count ?? 0) > before,
    8000
  ).catch(() => pageAfter(mark));
  check(
    "a tap on the button reaches the page",
    (page?.count ?? 0) === before + 1,
    `count ${before} → ${page?.count ?? "?"}`
  );
  const grabNow = await grabber();
  check(
    "taps in the page leave the drawer where it was",
    grabAt !== undefined && grabNow !== undefined && grabAt.y === grabNow.y,
    `grabber at y ${grabAt?.y ?? "?"} then ${grabNow?.y ?? "?"}`
  );

  // ── 6. Select on: the page takes no tap, one pick, and it shows ───────
  let head = await headNow("the header with Select off");
  check(
    "Select rests off",
    head.words === "Select" && head.note === 0,
    `button "${head.words}", selecting line ${head.note}pt`
  );
  mark = seen.length;
  await tap(head.select);
  const on = await lineAfter(
    "Select on",
    mark,
    (l) => l === "preview select on"
  );
  head = await headNow("the header with Select on");
  check(
    "Select turns on and shows",
    on !== undefined && head.words === "Done" && head.note === NOTE_HEIGHT,
    `select ${on ? "on" : "not on"}; button "${head.words}"; selecting line ${head.note}pt`
  );
  page = await pageNow("the page after the note");
  before = page.count;
  mark = seen.length;
  await tap(page.at.button);
  await lineAfter(
    "the pick",
    mark,
    (l) => l.startsWith("preview selected"),
    8000
  );
  await pause(1500);
  const picks = seen
    .slice(mark)
    .filter((l) => l.startsWith("preview selected"));
  const during = pageAfter(mark);
  check(
    "while selecting a tap picks and does not reach the page",
    picks.length === 1 && (during?.count ?? before) === before,
    `${picks.length} pick(s) ${picks.join(" | ")}; count ${before} → ${during?.count ?? "no post"}`
  );

  // ── 7. Done: the page takes taps again ────────────────────────────────
  mark = seen.length;
  await tap(head.select);
  const off = await lineAfter(
    "Select off",
    mark,
    (l) => l === "preview select off"
  );
  head = await headNow("the header after Done");
  page = await pageNow("the page after Done");
  before = page.count;
  mark = seen.length;
  await tap(page.at.button);
  page = await until(
    "the counter up",
    () => pageAfter(mark),
    (p) => (p?.count ?? 0) > before,
    8000
  ).catch(() => pageAfter(mark));
  check(
    "Done turns Select off and a tap reaches the page",
    off !== undefined &&
      (page?.count ?? 0) === before + 1 &&
      head.words === "Select" &&
      head.note === 0,
    `select ${off ? "off" : "still on"}; count ${before} → ${page?.count ?? "?"}; button "${head.words}"; selecting line ${head.note}pt`
  );

  // ── 8. Reload with Select on: it comes back off ───────────────────────
  mark = seen.length;
  await tap(head.select);
  await lineAfter("Select on again", mark, (l) => l === "preview select on");
  head = await headNow("the header before Reload");
  mark = seen.length;
  await tap(head.reload);
  const reloaded = await lineAfter(
    "the reload's document",
    mark,
    (l) => l === "preview document"
  );
  await pause(1500);
  const modeAfter = seen
    .slice(mark)
    .filter((l) => l.startsWith("preview select "))
    .at(-1);
  head = await headNow("the header after Reload");
  page = await pageNow("the page after Reload");
  before = page.count;
  const reloadMark = seen.length;
  await tap(page.at.button);
  page = await until(
    "the counter up",
    () => pageAfter(reloadMark),
    (p) => (p?.count ?? 0) > before,
    8000
  ).catch(() => pageAfter(reloadMark));
  check(
    "Reload turns Select off and a tap reaches the page",
    reloaded !== undefined &&
      modeAfter === "preview select off" &&
      head.words === "Select" &&
      head.note === 0 &&
      !seen.slice(mark).includes("preview select on") &&
      (page?.count ?? 0) === before + 1,
    `document ${reloaded ? "reloaded" : "not reloaded"}; last mode "${modeAfter ?? "none"}"; button "${head.words}"; count ${before} → ${page?.count ?? "?"}`
  );

  // ── 9. The grabber moves the drawer; the page still takes taps ────────
  for (const [height, by] of [
    ["full", -260],
    ["middle", 260],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one drag, then its tap, in order
    const from = await grabber();
    if (!from) {
      throw new Error("no grabber on the drawer");
    }
    await drag(from, { x: from.x, y: from.y + by });
    await pause(1500);
    const to = await grabber();
    page = await pageNow(`the page at ${height} height`);
    before = page.count;
    mark = seen.length;
    await tap(page.at.button);
    page = await until(
      "the counter up",
      () => pageAfter(mark),
      (p) => (p?.count ?? 0) > before,
      8000
    ).catch(() => pageAfter(mark));
    check(
      `a drag of the grabber to the ${height} height, then a tap reaches the page`,
      to !== undefined &&
        Math.abs(to.y - from.y) > 40 &&
        (page?.count ?? 0) === before + 1,
      `grabber y ${from.y} → ${to?.y ?? "?"}; count ${before} → ${page?.count ?? "?"}`
    );
  }
  await reader.cancel().catch(() => undefined);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  stream?.kill();
  await sim?.release();
  await fleet.close();
  await fleet.clean(keep || failed.length > 0);
}

console.log(failed.length === 0 ? "TAP_REACHED_PAGE" : `FAILED ${failed[0]}`);
process.exit(failed.length === 0 ? 0 : 1);
