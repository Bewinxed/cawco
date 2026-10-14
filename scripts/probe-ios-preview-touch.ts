#!/usr/bin/env bun
/**
 * iOS preview touch probe: in the app's preview drawer a tap reaches the
 * page unless the person turned Comment on; while commenting a tap writes
 * a numbered pin on the page instead, and that shows (Done, the line on the
 * well's top edge); the pin's card and the Pins sheet carry it, a reply and
 * Resolve go to the page's overlay, which writes the doc and answers, Send 1
 * sends its section with its picture, the pin then wears the live dot while
 * the session works (`-preview-working` holds it working) until it is
 * resolved, and the app tells the hub it has the page on screen (`shown`);
 * Done, Reload and a drag of the grabber leave the page taking taps.
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
 *     …iOS-18-5, the app's floor, as probe-ios-recall.ts and build-both.sh's
 *     floor launch) launches the app on that session with `-preview-probe`, which logs the preview's
 *     mode, documents, pins, card, list, sends and the page's posts
 *     (PreviewController.swift, Pins.swift) in the Probe category, each
 *     control and rect as its centre in window points, and the web view's
 *     frame in the window;
 *  4. reads what stands in front with Maestro's runner (CawCo, or the run
 *     stops with a screenshot of what does), then taps, types and drags
 *     with that runner's touches at the places the app logs, each page
 *     point inside the web view's frame, and reads the page's answers from
 *     that log and the hub's from its own routes (the pins through
 *     `comment_read`'s, the send through the session's transcript, the
 *     `shown` word through `artifact_show`'s `opened`).
 *
 * Not axe: every axe tap, touch and drag first reads the frontmost app
 * through the host's accessibility translator (OrientationAwareCoordinates
 * fetches the app's frame), which reaches only the app's own process. With
 * the preview's page drawn by WebKit's web content process it returns
 * nothing, and axe refuses the tap whatever the point: "No translation
 * object returned for simulator", as the Caw and Safari probes met it
 * (532f5489). Maestro's runner reads and touches from inside the simulator.
 *
 * The runner is an XCTest bundle kept up by `xcodebuild test-without-building`,
 * which needs testmanagerd, which a CawCo workspace's boundary refuses
 * ("Operation not permitted"): run it from the owner's shell on the Mac.
 *
 * It stops only what it started: the fleet's processes by PID, the runner,
 * and the simulator it took (deleted at the end). `--keep` keeps the fleet's sandbox.
 * Prints `PASS <step>` / `FAIL <step>` per check, then `TAP_REACHED_PAGE`
 * only if every check passed (exit 0), else the first failing check.
 */
import { basename, join, resolve } from "node:path";
import { type MacSim, macSim } from "./lib/mac-sim";
import { scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const build = !process.argv.includes("--no-build");
const root = resolve(import.meta.dir, "..");
/**
 * Maestro on the Mac, as probe-ios-caw-panel.ts runs it: on the JDK Homebrew
 * keeps for it, its analytics, update check and analysis notice off, and
 * JDK 26's final-field warning answered (MAESTRO_OPTS reaches its `java` line).
 */
const MAESTRO =
  'JAVA_HOME="$(/opt/homebrew/bin/brew --prefix openjdk)" MAESTRO_OPTS=--enable-final-field-mutation=ALL-UNNAMED MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_DISABLE_UPDATE_CHECK=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true /opt/homebrew/bin/maestro';
/** Maestro's runner app in the simulator. */
const RUNNER = "dev.mobile.maestro-driver-iosUITests.xctrunner";
/** What Maestro's CLI prints after its error, before the stack. */
const MAESTRO_STACK = "The stack trace was:";
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

const failed: string[] = [];
/** How far into the app's Probe lines the last check stood: a failure prints what the app said since. */
let checkedAt = 0;
/** The most of the app's lines a failure prints, and of each line's characters. */
const FAIL_LINES = 40;
const FAIL_LINE_CHARS = 200;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failed.push(`${step}: ${detail}`);
    // The outside run is the only one that taps: its log carries the evidence.
    const said = seen.slice(checkedAt).slice(-FAIL_LINES);
    console.log(
      `  the app's Probe lines since the last check (${said.length}):`
    );
    for (const line of said) {
      console.log(`    | ${line.slice(0, FAIL_LINE_CHARS)}`);
    }
  }
  checkedAt = seen.length;
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
  const whole = rect(button);
  // Its trailing end, clear of the pin a comment leaves at its centre (the disc takes presses).
  const rects = { button: whole, "button-end": { x: whole.x + whole.width - 14, y: whole.y + 4, width: 8, height: whole.height - 8 } };
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
  /^preview head comment=(.+)@(-?\d+),(-?\d+) pins=(\d+)@(none|-?\d+,-?\d+) send=(.+)@(none|-?\d+,-?\d+) reload=(-?\d+),(-?\d+) grabber=(?:none|(-?\d+),(-?\d+)) note=(\d+) web=(-?\d+),(-?\d+),(\d+),(\d+)$/;
/** Pins.swift's `preview card …` line: the open pin's number, where its controls stand, whether it wears the live dot. */
const CARD_LINE =
  /^preview card pin=(\d+) field=(none|-?\d+,-?\d+) reply=(none|-?\d+,-?\d+) resolve=(\S+)@(none|-?\d+,-?\d+) close=(none|-?\d+,-?\d+) live=(yes|no) thread=(\d+) delete=(?:none|-?\d+,-?\d+) writing=(?:true|false) asking=(?:true|false) problem=(.*)$/;
/** Pins.swift's `preview list …` line, logged once the sheet is in its window: the counts, the filter, each row's number and centre, the live rows. */
const LIST_LINE =
  /^preview list open=(\d+) resolved=(\d+) moved=(\d+) filter=(\S+)@(none|-?\d+,-?\d+) rows=(\S*) live=(\S*) scrim=(none|-?\d+,-?\d+)$/;
/** The overlay's answer to the app's reply or resolve, as the app logs it. */
const RESULT_LINE =
  /^preview (reply|resolve)-result (?:pin=(\d+) (ok|refused: .*)|none)$/;
const POINT = /^(-?\d+),(-?\d+)$/;
/** "x,y" as a point; "none" (hidden, or not in a window) as none. */
const pointOf = (text: string | undefined): Point | undefined => {
  const m = text?.match(POINT);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : undefined;
};
const seen: string[] = [];

interface Page {
  /** Each named point the page logged; a name it did not log has none. */
  at: Record<string, { x: number; y: number } | undefined>;
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
/**
 * Waits for the page to post after `from`, so its rects are where they are
 * drawn now: the app has it report every 0.7 s on the app's own clock (and
 * the page's timer does too, while WebKit runs it).
 */
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
interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}
/**
 * The header as the app logs it before each page post: Comment's words
 * ("Comment" or "Done") and centre, the open pins' count and Pins' centre
 * (none until there is a pin), Send's words and centre, Reload's, the
 * grabber's, the commenting line's height, the web view's frame.
 */
interface Head {
  comment: Point;
  grabber?: Point;
  note: number;
  open: number;
  pins?: Point;
  reload: Point;
  send?: Point;
  sendWords: string;
  web: Frame;
  words: string;
}
const headOf = (line: string): Head | undefined => {
  const m = line.match(HEAD_LINE);
  if (!m) {
    return;
  }
  return {
    words: m[1],
    comment: { x: Number(m[2]), y: Number(m[3]) },
    open: Number(m[4]),
    pins: pointOf(m[5]),
    sendWords: m[6],
    send: pointOf(m[7]),
    reload: { x: Number(m[8]), y: Number(m[9]) },
    grabber:
      m[10] === undefined ? undefined : { x: Number(m[10]), y: Number(m[11]) },
    note: Number(m[12]),
    web: {
      x: Number(m[13]),
      y: Number(m[14]),
      width: Number(m[15]),
      height: Number(m[16]),
    },
  };
};
/** The open pin's card as the app logs it with each page post and each change. */
interface Card {
  close?: Point;
  field?: Point;
  live: boolean;
  number: number;
  problem: string;
  reply?: Point;
  resolve?: Point;
  resolveWords: string;
  thread: number;
}
const cardOf = (line: string): Card | undefined => {
  const m = line.match(CARD_LINE);
  if (!m) {
    return;
  }
  return {
    number: Number(m[1]),
    field: pointOf(m[2]),
    reply: pointOf(m[3]),
    resolveWords: m[4],
    resolve: pointOf(m[5]),
    close: pointOf(m[6]),
    live: m[7] === "yes",
    thread: Number(m[8]),
    problem: m[9],
  };
};
/** The newest card line after `from` that `match` takes, waited for. */
/** The newest card line so far, where nothing moved the card. */
const cardLast = () => seen.map(cardOf).findLast((card) => card !== undefined);
const cardAfter = async (
  what: string,
  from: number,
  match: (card: Card) => boolean = () => true,
  ms = 15_000
) => {
  await lineAfter(
    what,
    from,
    (line) => {
      const card = cardOf(line);
      return card !== undefined && match(card);
    },
    ms
  );
  return seen
    .slice(from)
    .map(cardOf)
    .filter((card): card is Card => card !== undefined && match(card))
    .at(-1);
};
/** The Pins sheet's rows as the app logs them when it draws the list. */
interface List {
  filter?: Point;
  /** The numbers of the rows that wear the live dot. */
  live: string[];
  moved: number;
  open: number;
  resolved: number;
  rows: Record<string, Point | undefined>;
  /** A point on the scrim above the sheet: a tap there puts the sheet away. */
  scrim?: Point;
}
const listOf = (line: string): List | undefined => {
  const m = line.match(LIST_LINE);
  if (!m) {
    return;
  }
  const rows: List["rows"] = {};
  for (const [, n, at] of m[6].matchAll(/(\d+)@(none|-?\d+,-?\d+)/g)) {
    rows[n] = pointOf(at);
  }
  return {
    open: Number(m[1]),
    resolved: Number(m[2]),
    moved: Number(m[3]),
    filter: pointOf(m[5]),
    rows,
    live: m[7].split(";").filter(Boolean),
    scrim: pointOf(m[8]),
  };
};
/** The newest list line after `from`, waited for: the sheet logs it once it stands in its window. */
const listAfter = async (what: string, from: number, ms = 15_000) => {
  const line = await lineAfter(what, from, (l) => listOf(l) !== undefined, ms);
  return line ? listOf(line) : undefined;
};
/** The overlay's answer to a reply or resolve after `from`, waited for (the app gives up after 10 s). */
const resultAfter = async (what: "reply" | "resolve", from: number) => {
  const line = await lineAfter(
    `the ${what}'s result`,
    from,
    (l) => RESULT_LINE.exec(l)?.[1] === what,
    15_000
  );
  return line;
};
/** The newest header line so far. */
const headLast = () =>
  seen.map(headOf).filter(Boolean).at(-1) as Head | undefined;
const frameText = (f: Frame) => `${f.x},${f.y} ${f.width}×${f.height}`;
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
/** Maestro's runner's port on the Mac, once picked. */
let runnerPort: number | undefined;

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
  // iOS 18.5, the app's floor, as probe-ios-recall.ts and build-both.sh's
  // floor launch take.
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
  // page's rects), not the accessibility tree. The touches are Maestro's
  // runner's, in points: its first read (`maestro hierarchy`) starts it on a
  // free port of its own (the default, 22087, is every simulator's).
  const free = Bun.listen({
    hostname: "127.0.0.1",
    port: 0,
    socket: { data: () => undefined },
  });
  runnerPort = free.port;
  free.stop(true);
  /** The foreground app's name as Maestro's runner reads it from inside the simulator. */
  const front = async () => {
    const text = await sh(
      `${MAESTRO} --device ${udid} --driver-host-port ${runnerPort} hierarchy --no-reinstall-driver`
    ).catch((error: unknown) => {
      const words = (error instanceof Error ? error.message : String(error))
        .split(MAESTRO_STACK)[0]
        .trim();
      throw new Error(`Maestro's read of the screen failed: ${words}`);
    });
    const whole = JSON.parse(
      text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
    ) as { children?: { attributes?: Record<string, string> }[] };
    return (
      whole.children?.[0]?.attributes?.accessibilityText || "nothing named"
    );
  };
  const runner = (route: string, body: Record<string, unknown>) =>
    sh(
      `curl -sS --fail-with-body --max-time 30 -H 'Content-Type: application/json' --data-binary @- http://127.0.0.1:${runnerPort}/${route} <<'BODY'\n${JSON.stringify(body)}\nBODY`
    );
  /** Types into what has the keyboard, the runner's `POST /inputText` (InputTextRequest: `text`, `appIds`). */
  const type = (text: string) =>
    runner("inputText", { text, appIds: ["dev.cawco.app"] });
  /** The artifact's pins as the hub has them (`comment_read`'s route). */
  const pinsOnHub = async () =>
    (
      await fleet.api<{
        artifacts: {
          id: string;
          pins: {
            id: string;
            number: number;
            resolvedAt?: string;
            sentAt?: string;
            thread: { by: string; text: string }[];
          }[];
        }[];
      }>(
        `/api/instances/${id}/artifacts/comments?artifact=${made.id}&filter=all`
      )
    ).artifacts.find((one) => one.id === made.id)?.pins ?? [];
  /**
   * One finger's tap, the runner's `POST /touch` (where every `tapOn` of
   * Maestro's ends), printed with what it is for and the read it came from.
   */
  const tap = (point: Point, what: string) => {
    console.log(
      `  tap ${what} at ${Math.round(point.x)},${Math.round(point.y)}`
    );
    return runner("touch", {
      x: Math.round(point.x),
      y: Math.round(point.y),
    });
  };
  /** One finger from `from` to `to` over `seconds`, the runner's `POST /swipeV2`. */
  const drag = (from: Point, to: Point, seconds: number) => {
    console.log(
      `  drag from ${from.x},${from.y} to ${to.x},${to.y} over ${seconds}s (the grabber, from the newest header)`
    );
    return runner("swipeV2", {
      startX: Math.round(from.x),
      startY: Math.round(from.y),
      endX: Math.round(to.x),
      endY: Math.round(to.y),
      duration: seconds,
    });
  };
  /** A tap on what the page named, at its centre, which must lie in the web view's frame of the same post. */
  const tapPage = async (name: string, now: Page) => {
    const at = now.at[name];
    const web = headLast()?.web;
    if (!(at && web)) {
      throw new Error(`no point for ${name}, or no web view frame, in the log`);
    }
    const inside =
      at.x >= web.x &&
      at.x <= web.x + web.width &&
      at.y >= web.y &&
      at.y <= web.y + web.height;
    if (!inside) {
      throw new Error(
        `${name} at ${at.x},${at.y} lies outside the web view at ${frameText(web)}`
      );
    }
    await tap(
      at,
      `the page's ${name} (${inside ? "inside" : "OUTSIDE"} the web view at ${frameText(web)}, from its newest post)`
    );
  };
  const grabber = async () => (await headNow("the grabber")).grabber;

  // `-preview-working`: the session counts as mid-turn for the live dot; the
  // probe's mock model ends every turn within milliseconds, so a real
  // turn would leave no window to read the dot in.
  await sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${id} -preview-probe -preview-working >/dev/null`
  );
  let page = await freshPage("the page loaded in the preview", 0, 120_000);
  check(
    "page loads in the drawer",
    page?.view === "table" && "tab-board" in page.at,
    page
      ? `view=${page.view} selected=${page.selected} count=${page.count}; points ${JSON.stringify(page.at)}, web view at ${(() => {
          const web = headLast()?.web;
          return web ? frameText(web) : "unlogged";
        })()}`
      : `no page line; log: ${seen.slice(-5).join(" | ") || "nothing"}`
  );
  if (!page) {
    throw new Error("the page never posted");
  }
  // The overlay's ready, the app's buttons enabled.
  await pause(1500);
  // The simulator is in light appearance (step 4): the hello says so.
  const hello = seen.find((l) => l.startsWith("preview hello "));
  check(
    "the hello carried theme",
    hello === "preview hello theme=light",
    hello ?? "no hello line"
  );
  // What stands in front before the first tap: the app, or a system alert,
  // the paywall or SpringBoard, saved as a screenshot in the sandbox.
  const inFront = await front();
  const shot = join(fleet.sandbox, "front.png");
  if (inFront !== "CawCo") {
    await sh(
      `xcrun simctl io ${udid} screenshot "${shot}" >/dev/null 2>&1`
    ).catch(() => undefined);
  }
  check(
    "the app stands in front before the first tap",
    inFront === "CawCo",
    `Maestro reads "${inFront}" in front${inFront === "CawCo" ? "" : `; the screen: ${shot}`}`
  );
  if (inFront !== "CawCo") {
    throw new Error(`"${inFront}" stands over the app`);
  }
  const grabAt = await grabber();

  // ── 5. Comment off: a tab and the button reach the page ───────────────
  let mark = seen.length;
  await tapPage("tab-board", page);
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
  await tapPage("button", page);
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

  // ── 6. Comment on: a tap writes pin 1 and does not reach the page ─────
  let head = await headNow("the header with Comment off");
  check(
    "Comment rests off",
    head.words === "Comment" && head.note === 0 && head.pins === undefined,
    `button "${head.words}", commenting line ${head.note}pt, Pins ${head.pins ? "shown" : "hidden"}`
  );
  mark = seen.length;
  await tap(head.comment, `Comment ("${head.words}", from the newest header)`);
  const on = await lineAfter(
    "Comment on",
    mark,
    (l) => l === "preview comment on"
  );
  head = await headNow("the header with Comment on");
  check(
    "Comment turns on and shows",
    on !== undefined && head.words === "Done" && head.note === NOTE_HEIGHT,
    `comment ${on ? "on" : "not on"}; button "${head.words}"; commenting line ${head.note}pt`
  );
  page = await pageNow("the page after the note");
  before = page.count;
  mark = seen.length;
  await tapPage("button", page);
  const pinned = await until(
    "pin 1 on the hub",
    pinsOnHub,
    (pins) => pins.length > 0,
    15_000
  ).catch(() => [] as Awaited<ReturnType<typeof pinsOnHub>>);
  await pause(1500);
  const during = pageAfter(mark);
  check(
    "while commenting a tap writes pin 1 and does not reach the page",
    pinned.length === 1 &&
      pinned[0].number === 1 &&
      (during?.count ?? before) === before,
    `${pinned.length} pin(s) on the hub${pinned[0] ? ` (number ${pinned[0].number})` : ""}; count ${before} → ${during?.count ?? "no post"}`
  );
  let card = await cardAfter("pin 1's card", mark, (c) => c.number === 1);
  check(
    "the new pin's card opens",
    card !== undefined && card.field !== undefined && card.thread === 0,
    card
      ? `card for pin ${card.number}, field at ${card.field?.x},${card.field?.y}, ${card.thread} entries`
      : "no card line"
  );

  // ── 7. The Pins sheet lists it; its row opens the card ────────────────
  // The card goes first, so the row is what opens it again.
  if (card?.close) {
    await tap(
      card.close,
      `pin ${card.number}'s card Close (from its newest line)`
    );
  }
  await pause(1200);
  /** The Pins sheet opened from the header, as it lists the pins once it stands. */
  const openSheet = async (what: string) => {
    const now = await until(
      "Pins in the header",
      () => headNow(`the header before ${what}`),
      (h) => h.pins !== undefined,
      15_000
    ).catch(() => headLast() as Head);
    const from = seen.length;
    if (now.pins) {
      await tap(now.pins, "Pins (from the newest header)");
    }
    return { list: await listAfter(what, from), pins: now.pins };
  };
  let sheet = await openSheet("the Pins sheet");
  check(
    "the Pins sheet lists pin 1 as open",
    sheet.list?.open === 1 &&
      sheet.list.resolved === 0 &&
      sheet.list.rows["1"] !== undefined,
    sheet.list
      ? `open ${sheet.list.open}, resolved ${sheet.list.resolved}, moved ${sheet.list.moved}, rows ${JSON.stringify(sheet.list.rows)}`
      : `no list line (Pins ${sheet.pins ? `at ${sheet.pins.x},${sheet.pins.y}` : "hidden"})`
  );
  await pause(800);
  mark = seen.length;
  const row = sheet.list?.rows["1"];
  if (row) {
    await tap(row, "pin 1's row in the sheet (from the sheet's list line)");
  }
  card = await cardAfter("the card from its row", mark, (c) => c.number === 1);
  check(
    "a row of the sheet opens its card",
    row !== undefined && card !== undefined,
    card
      ? `card for pin ${card.number} after a tap on its row at ${row?.x},${row?.y}`
      : "no card line after the row"
  );

  // ── 8. Reply, Send 1, the live dot, Resolve ───────────────────────────
  // The card's Reply and Resolve go to the page's overlay (`cawco:reply`,
  // `cawco:resolve`), which writes the doc and answers with its result.
  const REPLY = "Make the count bigger";
  if (card?.field) {
    await tap(
      card.field,
      `pin ${card.number}'s card field (from its newest line)`
    );
  }
  await pause(800);
  await type(REPLY);
  await pause(800);
  // Where Reply stands once the keyboard moved the card.
  card = await cardAfter("the card with words in it", seen.length);
  mark = seen.length;
  if (card?.reply) {
    await tap(
      card.reply,
      `pin ${card.number}'s card Reply (from its newest line)`
    );
  }
  const replied = await resultAfter("reply", mark);
  const thread = await until(
    "the reply on the hub",
    async () => (await pinsOnHub())[0]?.thread ?? [],
    (entries) =>
      entries.some((entry) => entry.by === "person" && entry.text === REPLY),
    10_000
  ).catch(async () => (await pinsOnHub())[0]?.thread ?? []);
  check(
    "Reply reaches the overlay, whose result the app hears, and the hub's read shows the entry",
    replied === "preview reply-result pin=1 ok" &&
      thread.some((entry) => entry.by === "person" && entry.text === REPLY),
    `${replied ?? "no reply-result line"}; the hub's thread: ${JSON.stringify(thread)}`
  );
  head = await until(
    "Send 1 in the header",
    () => headNow("the header with the reply unsent"),
    (h) => h.sendWords === "Send 1" && h.send !== undefined,
    15_000
  ).catch(() => headLast() as Head);
  mark = seen.length;
  if (head.sendWords === "Send 1" && head.send) {
    await tap(head.send, `${head.sendWords} (from the newest header)`);
  }
  const sent = await lineAfter(
    "the send",
    mark,
    (l) => l.startsWith("preview send "),
    30_000
  );
  const blocks = await until(
    "the send in the session's transcript",
    async () =>
      (
        await fleet.api<{
          blocks?: {
            content?: string;
            metadata?: { images?: unknown[] };
            type?: string;
          }[];
        }>(`/api/instances/${id}/transcript?limit=200`)
      ).blocks ?? [],
    (all) =>
      all.some(
        (block) =>
          block.type === "user" && block.content?.includes("## 1. comment on")
      ),
    20_000
  ).catch(() => []);
  const message = blocks.find(
    (block) =>
      block.type === "user" && block.content?.includes("## 1. comment on")
  );
  const [sentPin] = await pinsOnHub();
  check(
    '"Send 1" posts one message carrying the pin\'s section and a picture',
    head.sendWords === "Send 1" &&
      sent?.startsWith("preview send ok") === true &&
      message !== undefined &&
      (message.metadata?.images?.length ?? 0) >= 1 &&
      message.content?.includes(REPLY) === true &&
      !!sentPin?.sentAt,
    `header read "${head.sendWords}"; ${sent ?? "no send line"}; message ${message ? `with ${message.metadata?.images?.length ?? 0} picture(s): ${JSON.stringify(message.content?.slice(0, 160))}` : "not in the transcript"}; pin sentAt ${sentPin?.sentAt ?? "none"}`
  );
  // The send stamped the frame's sentAt on the pin; the session counts as
  // working (-preview-working): its card and its row wear the live dot.
  const liveCard = await cardAfter(
    "the card with the live dot",
    mark,
    (c) => c.number === 1 && c.live,
    15_000
  );
  // The sheet opens over the card, which stays up: its live row is read
  // from the sheet's list line, and the sheet goes again by its scrim.
  sheet = await openSheet("the Pins sheet after the send");
  check(
    "with the frame's sentAt set and the session working, the pin's row and card show the live dot",
    liveCard !== undefined && sheet.list?.live.includes("1") === true,
    `card ${liveCard ? "live" : "not live"}; the sheet's live rows ${JSON.stringify(sheet.list?.live ?? null)}`
  );
  await pause(800);
  mark = seen.length;
  if (sheet.list?.scrim) {
    await tap(
      sheet.list.scrim,
      "the scrim over the Pins sheet, which puts it away (from the sheet's list line)"
    );
  }
  await pause(1200);
  // The card as it stands once the sheet is gone: its line after the
  // dismissal (the app logs it when a layout moves it, and with each page
  // post), else the newest, when it never moved.
  card =
    (await cardAfter(
      "pin 1's card after the sheet",
      mark,
      (c) => c.number === 1,
      5000
    )) ?? cardLast();
  if (card?.number !== 1 || !card.resolve) {
    throw new Error(
      `no card for pin 1 up after the sheet went (newest card line: ${seen.findLast((l) => cardOf(l) !== undefined) ?? "none"})`
    );
  }
  mark = seen.length;
  await tap(
    card.resolve,
    `pin 1's card ${card.resolveWords} (from its newest line)`
  );
  const resolvedLine = await resultAfter("resolve", mark);
  const [resolvedOnHub] = await pinsOnHub();
  const resolvedPins = await lineAfter(
    "the app's pins with pin 1 resolved",
    mark,
    (l) => l.startsWith("preview pins ") && l.includes(" 1=resolved:")
  );
  card = await cardAfter(
    "the card reading Reopen",
    mark,
    (c) => c.resolveWords === "Reopen"
  );
  check(
    "Resolve reaches the overlay, moves it to Resolved, and the live dot goes",
    resolvedLine === "preview resolve-result pin=1 ok" &&
      !!resolvedOnHub?.resolvedAt &&
      resolvedPins !== undefined &&
      card !== undefined &&
      !card.live,
    `${resolvedLine ?? "no resolve-result line"}; hub resolvedAt ${resolvedOnHub?.resolvedAt ?? "none"}; ${resolvedPins ?? "no pins line"}; card reads ${card?.resolveWords ?? "?"}, ${card?.live ? "still live" : "not live"}`
  );
  card = await cardAfter("the card before it closes", seen.length);
  if (card?.close) {
    await tap(
      card.close,
      `pin ${card.number}'s card Close (from its newest line)`
    );
  }
  await pause(1200);

  // ── 9. Done: the page takes taps again ────────────────────────────────
  head = await headNow("the header before Done");
  mark = seen.length;
  await tap(head.comment, `Comment ("${head.words}", from the newest header)`);
  const off = await lineAfter(
    "Comment off",
    mark,
    (l) => l === "preview comment off"
  );
  head = await headNow("the header after Done");
  page = await pageNow("the page after Done");
  before = page.count;
  mark = seen.length;
  await tapPage("button-end", page);
  page = await until(
    "the counter up",
    () => pageAfter(mark),
    (p) => (p?.count ?? 0) > before,
    8000
  ).catch(() => pageAfter(mark));
  check(
    "Done turns Comment off and a tap reaches the page",
    off !== undefined &&
      (page?.count ?? 0) === before + 1 &&
      head.words === "Comment" &&
      head.note === 0,
    `comment ${off ? "off" : "still on"}; count ${before} → ${page?.count ?? "?"}; button "${head.words}"; commenting line ${head.note}pt`
  );

  // ── 10. Reload with Comment on: it comes back off ─────────────────────
  mark = seen.length;
  await tap(head.comment, `Comment ("${head.words}", from the newest header)`);
  await lineAfter("Comment on again", mark, (l) => l === "preview comment on");
  head = await headNow("the header before Reload");
  mark = seen.length;
  await tap(head.reload, "Reload (from the newest header)");
  const reloaded = await lineAfter(
    "the reload's document",
    mark,
    (l) => l === "preview document"
  );
  await pause(1500);
  const modeAfter = seen
    .slice(mark)
    .filter((l) => l.startsWith("preview comment "))
    .at(-1);
  head = await headNow("the header after Reload");
  page = await pageNow("the page after Reload");
  before = page.count;
  const reloadMark = seen.length;
  await tapPage("button-end", page);
  page = await until(
    "the counter up",
    () => pageAfter(reloadMark),
    (p) => (p?.count ?? 0) > before,
    8000
  ).catch(() => pageAfter(reloadMark));
  check(
    "Reload turns Comment off and a tap reaches the page",
    reloaded !== undefined &&
      modeAfter === "preview comment off" &&
      head.words === "Comment" &&
      head.note === 0 &&
      !seen.slice(mark).includes("preview comment on") &&
      (page?.count ?? 0) === before + 1,
    `document ${reloaded ? "reloaded" : "not reloaded"}; last mode "${modeAfter ?? "none"}"; button "${head.words}"; count ${before} → ${page?.count ?? "?"}`
  );

  // ── 11. The grabber moves the drawer; the page still takes taps ───────
  // The drawer projects a release on (UIScrollView's normal deceleration,
  // 0.499 s of the finger's speed) and closes the preview when that lands
  // under 70% of its middle height (SessionViewController `dragDrawer`): a
  // half-second 260 pt drag down from the full height reads as a swipe away.
  // So each drag takes DRAG_SECONDS, and the drag back down ends where the
  // grabber stood at the middle height, a settle and not a flick.
  const DRAG_SECONDS = 2;
  /** How far the drawer may rest from where the drag ended, pt. */
  const REST_SLACK = 40;
  const middleAt = headLast()?.grabber;
  for (const height of ["full", "middle"] as const) {
    // Where the grabber stands now: the newest header so far (the app logs
    // one whenever a layout moves it), since nothing new need be logged
    // between the last tap and this drag.
    const from = headLast()?.grabber;
    if (!(from && middleAt)) {
      throw new Error("no grabber on the drawer");
    }
    const end =
      height === "full"
        ? { x: from.x, y: from.y - 260 }
        : { x: from.x, y: middleAt.y };
    const dragMark = seen.length;
    // biome-ignore lint/performance/noAwaitInLoops: one drag, then its tap, in order
    await drag(from, end, DRAG_SECONDS);
    await pause(1500);
    const to = headLast()?.grabber;
    // The drawer is still up, resting near where the drag ended, before the page is tapped.
    const closed = seen.slice(dragMark).includes("preview close");
    const resting =
      !closed && to !== undefined && Math.abs(to.y - end.y) <= REST_SLACK;
    check(
      `after the drag to the ${height} height the drawer is still up, its grabber within ${REST_SLACK}pt of where the drag ended`,
      resting,
      closed
        ? `the drawer went away: the app logged "preview close" after the drag from ${from.x},${from.y} to ${end.x},${end.y} over ${DRAG_SECONDS}s`
        : `grabber y ${to?.y ?? "?"}, the drag ended at y ${end.y}`
    );
    if (!resting) {
      continue;
    }
    // The page's first post once the drawer rests: the app has it report on
    // its own clock (every 0.7 s), so its points are where it stands now.
    page = await pageNow(`the page at ${height} height`);
    before = page.count;
    mark = seen.length;
    await tapPage("button-end", page);
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

  // ── 12. Shown: the app says it has the page on screen ─────────────────
  // artifact_show's route publishes the page afresh and answers `opened`
  // from a view's `shown` word on that revision, within 10 s.
  mark = seen.length;
  const shown = await fleet.api<{ opened: boolean; why?: string }>(
    `/api/instances/${id}/artifacts/${made.id}/show`,
    {}
  );
  const said = await lineAfter("the app's shown word", mark, (l) =>
    l.startsWith("preview shown ")
  );
  check(
    "the shown route received ok: true for the frame's revision",
    shown.opened && said?.startsWith("preview shown ok revision=") === true,
    `artifact_show answered ${JSON.stringify(shown)}; the app logged ${said ?? "no shown line"}`
  );
  await reader.cancel().catch(() => undefined);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  stream?.kill();
  // The runner app and the `xcodebuild` keeping it up (the bracket keeps
  // the pattern off the shell running the match).
  if (sim && runnerPort !== undefined) {
    await sh(`xcrun simctl terminate ${sim.udid} ${RUNNER} >/dev/null 2>&1 || true
pkill -f "[x]codebuild test-without-building .*-destination id=${sim.udid} " || true`).catch(
      () => undefined
    );
  }
  await sim?.release();
  await fleet.close();
  await fleet.clean(keep || failed.length > 0);
}

console.log(failed.length === 0 ? "TAP_REACHED_PAGE" : `FAILED ${failed[0]}`);
process.exit(failed.length === 0 ? 0 : 1);
