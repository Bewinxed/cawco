#!/usr/bin/env bun
/**
 * iOS Caw pull probe: Caw's panel is pulled down out of his glass by a
 * finger, 1:1, the way a tab's options are pulled off their tab (DESIGN.md,
 * "A card that hangs from its anchor"), and a notice is swiped off the panel
 * sideways (owner: "the typical slide left right to dismiss, the x is too
 * small to click").
 *
 *   bun scripts/probe-ios-caw-pull.ts [--keep]
 *
 * Run on the Mac itself, from the repo root, after
 * `bash apps/apple/scripts/build-both.sh ios --compile-only` (its simulator
 * build is what it installs). It:
 *
 *  1. stands up a scratch fleet's hub alone (scratch-fleet.ts; no agent or
 *     sessiond: no session is needed) and files a dozen logins moved into
 *     CawCo from another machine's store, so Caw's panel
 *     holds one group of moved logins, more entries than it shows at once;
 *  2. on an iPhone and then an iPad simulator of iOS 18.5, launches the app
 *     on that hub and drives it with AXe (HID touches at points: taps and
 *     swipes of a set length and duration), reading the app's own log
 *     (CawPanel's DEBUG lines: each pan event's finger travel against the
 *     card's drawn foot or the row's drawn offset, each release's travel and
 *     speed, the panel opening and closing, its rows) and AXe's read of the
 *     screen;
 *  3. checks: a tap on Caw toggles the panel; a slow pull past half opens
 *     it, the card's foot on the finger 1:1 at three points along the pull,
 *     and a capture mid-pull shows the foot where the finger is; a pull under
 *     half goes back; a fast short flick opens; a pull up from Caw closes;
 *     a vertical drag on the list scrolls it and moves no row; a row swiped
 *     a quarter of its width follows the finger 1:1 and springs back; one
 *     swiped past 40% leaves and the entries drop by one; a tap 10pt past
 *     the ✕'s glyph, either side, dismisses its entry; a push up on the
 *     body, once the list shows its end, closes the panel; the group's head
 *     swiped off takes the whole group;
 *  4. saves captures (mid-pull light and dark, mid-swipe) to
 *     $TMPDIR/ios-caw-pull/, prints `PASS <step>` / `FAIL <step>` per check
 *     and exits 0 only if every check passed.
 *
 * It stops only what it started: the fleet's processes by PID and the
 * simulators it created (deleted at the end).
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ACCOUNT, MACHINE, scratchFleet, until } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const out = join(process.env.TMPDIR ?? "/tmp", "ios-caw-pull");
await mkdir(out, { recursive: true });
const app = join(
  process.env.XDG_CACHE_HOME ??
    join(process.env.HOME ?? "", "Library", "Caches"),
  "cawco-apple",
  (await Bun.$`git -C ${root} rev-parse --show-toplevel`.text())
    .trim()
    .split("/")
    .at(-1) ?? "",
  "DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app"
);

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};
const pause = (ms: number) => Bun.sleep(ms);

/** A compact log line's time. */
const LOG_TIME = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d+)/;
/** CawPanel's DEBUG lines (`panel rows`, `panel hangs`, `panel pull`, `notice swipe`). */
const ENTRIES = /(\d+) entries/;
const HANGS = /panel (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)/;
const PULL = /finger (-?[\d.]+) foot (-?[\d.]+) from (-?[\d.]+)/;
const SWIPE_LINE = /finger (-?[\d.]+) row (-?[\d.]+)/;
/** The moved logins' fold, shut; and the group's head. */
const FOLD_SHUT = /^Show \d+ signed in everywhere$/;
const GROUP_HEAD = /^\d+ logins? moved into CawCo$/;

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

interface Point {
  x: number;
  y: number;
}
interface Frame extends Point {
  height: number;
  width: number;
}
interface Node {
  frame?: Frame;
  id?: string;
  label?: string;
  value?: string;
}
const centre = (f: Frame): Point => ({
  x: f.x + f.width / 2,
  y: f.y + f.height / 2,
});

/** The app's screen as AXe reads it, flattened. */
async function tree(udid: string): Promise<Node[]> {
  const text = await sh(`axe describe-ui --udid ${udid}`);
  const nodes: Node[] = [];
  const walk = (raw: Record<string, unknown>) => {
    const f = raw.frame as Frame | undefined;
    nodes.push({
      label: (raw.AXLabel as string) || undefined,
      value: (raw.AXValue as string) || undefined,
      id: (raw.AXUniqueId as string) || undefined,
      frame: f
        ? { x: f.x, y: f.y, width: f.width, height: f.height }
        : undefined,
    });
    for (const child of (raw.children as
      | Record<string, unknown>[]
      | undefined) ?? []) {
      walk(child);
    }
  };
  for (const top of JSON.parse(text.slice(text.indexOf("["))) as Record<
    string,
    unknown
  >[]) {
    walk(top);
  }
  return nodes;
}
const tap = (udid: string, p: Point) =>
  sh(`axe tap -x ${Math.round(p.x)} -y ${Math.round(p.y)} --udid ${udid}`);
/**
 * One finger from `from` to `to` over `seconds`, lifted at the end, moving
 * 4px a step: AXe's default steps are so long that a short drag reaches the
 * app as a couple of jumps.
 */
const swipe = (udid: string, from: Point, to: Point, seconds: number) =>
  sh(
    `axe swipe --start-x ${Math.round(from.x)} --start-y ${Math.round(from.y)} --end-x ${Math.round(to.x)} --end-y ${Math.round(to.y)} --duration ${seconds} --delta 4 --udid ${udid}`
  );

/** The app's CawPanel log lines since `since` (ms, this machine's clock), each with its time. */
async function panelLog(
  udid: string,
  since: number
): Promise<{ at: number; text: string }[]> {
  const seconds = Math.ceil((Date.now() - since) / 1000) + 2;
  const text = await sh(
    `xcrun simctl spawn ${udid} log show --last ${seconds}s --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "CawPanel"' || true`
  );
  const lines: { at: number; text: string }[] = [];
  for (const line of text.split("\n")) {
    const m = LOG_TIME.exec(line);
    const at = m ? new Date(`${m[1]}T${m[2]}`).getTime() : Number.NaN;
    const [, words] = line.split("[dev.cawco.app:CawPanel] ");
    if (words && at >= since - 50) {
      lines.push({ at, text: words });
    }
  }
  return lines;
}
const numbers = (line: string, pattern: RegExp) =>
  (pattern.exec(line)?.slice(1) ?? []).map(Number);
/** Whether the panel stands open now: the app's last word on it since `since`. */
async function openNow(
  udid: string,
  since: number
): Promise<boolean | undefined> {
  // The log reaches `log show` a moment after the app writes it.
  for (let k = 0; k < 6; k += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each read waits for the log to catch up
    const said = (await panelLog(udid, since)).filter((l) =>
      l.text.startsWith("panel open: ")
    );
    if (said.length > 0) {
      return said.at(-1)?.text === "panel open: true";
    }
    await pause(500);
  }
}
/** How many moved-login entries the panel's rows held when last made. */
async function entriesNow(
  udid: string,
  since: number
): Promise<number | undefined> {
  const rows = (await panelLog(udid, since)).filter((l) =>
    l.text.startsWith("panel rows: ")
  );
  const n = numbers(rows.at(-1)?.text ?? "", ENTRIES);
  return n[0];
}

/** A screenshot's pixels (a BMP read without a decoder). */
interface Pixels {
  bmp: Buffer;
  points: number;
}
async function pixels(
  udid: string,
  points: number,
  save?: string
): Promise<Pixels> {
  const file = join(out, `${save ?? "scratch"}.png`);
  await sh(`xcrun simctl io ${udid} screenshot "${file}" >/dev/null 2>&1
sips -s format bmp "${file}" --out "${file}.bmp" >/dev/null 2>&1`);
  const bmp = Buffer.from(await Bun.file(`${file}.bmp`).arrayBuffer());
  await sh(`rm -f "${file}.bmp"${save ? "" : ` "${file}"`}`);
  if (save) {
    console.log(`  capture: ${file}`);
  }
  return { bmp, points };
}
/** The mean colour, [r, g, b], of the 1pt square at a point. */
function colourAt({ bmp, points }: Pixels, x: number, y: number): number[] {
  const offset = bmp.readUInt32LE(10);
  const width = bmp.readInt32LE(18);
  const signed = bmp.readInt32LE(22);
  const height = Math.abs(signed);
  const bytes = bmp.readUInt16LE(28) / 8;
  const stride = Math.ceil((width * bytes) / 4) * 4;
  const scale = width / points;
  const sum = [0, 0, 0];
  let count = 0;
  for (
    let py = Math.round(y * scale);
    py < Math.round((y + 1) * scale);
    py += 1
  ) {
    const row = signed > 0 ? height - 1 - py : py;
    for (
      let px = Math.round(x * scale);
      px < Math.round((x + 1) * scale);
      px += 1
    ) {
      const at = offset + row * stride + px * bytes;
      sum[0] += bmp[at + 2];
      sum[1] += bmp[at + 1];
      sum[2] += bmp[at];
      count += 1;
    }
  }
  return sum.map((v) => Math.round(v / Math.max(1, count)));
}
const apart = (a: number[], b: number[]) =>
  Math.max(...a.map((v, i) => Math.abs(v - b[i])));

/** Where the panel hangs, as the app logged it (CawPanel `place`). */
async function hangingBox(
  udid: string,
  since: number
): Promise<Frame | undefined> {
  const line = (await panelLog(udid, since))
    .filter((l) => l.text.startsWith("panel hangs"))
    .at(-1);
  const n = numbers(line?.text ?? "", HANGS);
  return n.length === 4
    ? { x: n[0], y: n[1], width: n[2], height: n[3] }
    : undefined;
}

/**
 * The panel's drawn foot in a capture: down a column inside its leading
 * margin (no row draws there), the first point that is no longer its surface.
 */
function footIn(shot: Pixels, panel: Frame): number | undefined {
  const x = panel.x + 3;
  // The card's surface, read in the same capture just under the cut.
  const surface = colourAt(shot, x, panel.y + 3);
  for (let y = panel.y + 3; y < panel.y + panel.height + 4; y += 1) {
    if (apart(colourAt(shot, x, y), surface) > 12) {
      return y - panel.y;
    }
  }
}

/** The pull log lines in a window: [time, finger, foot, from]. */
async function pulls(udid: string, since: number) {
  return (await panelLog(udid, since))
    .filter((l) => l.text.startsWith("panel pull: "))
    .map((l) => {
      const [finger, foot, from] = numbers(l.text, PULL);
      return { at: l.at, finger, foot, from };
    });
}
async function releases(udid: string, since: number) {
  return (await panelLog(udid, since))
    .filter((l) => l.text.startsWith("panel release: "))
    .map((l) => l.text.replace("panel release: ", ""));
}
/** Three of `samples`, a quarter, half and three quarters of the way through. */
const three = <T>(samples: T[]) =>
  [0.25, 0.5, 0.75]
    .map(
      (share) =>
        samples[
          Math.min(samples.length - 1, Math.floor(samples.length * share))
        ]
    )
    .filter(Boolean);

const LOGINS = [
  "Design",
  "Ops",
  "Docs",
  "Infra",
  "Mobile",
  "Data",
  "Growth",
  "Billing",
  "Support",
  "Search",
  "Media",
  "Audit",
];
const CAW =
  /^(Needs you, \d+|All caught up|Reading the fleet|Connecting…|Hub unreachable)( · \d+ notices?)?$/;
const caw = (nodes: Node[]) =>
  nodes.find((n) => CAW.test(n.label ?? "") && n.frame);
/** An entry's ✕ ("Dismiss <name>"), not the group's. */
const entryCross = (nodes: Node[], name: string) =>
  nodes.find((n) => n.label === `Dismiss ${name}` && n.frame);
const entryName = (nodes: Node[], name: string) =>
  nodes.find((n) => n.label === name && n.frame);

const fleet = await scratchFleet({
  name: "probe-ios-caw-pull",
  respond: () => ({ everyMs: 10, words: ["ok"] }),
});
const sims: string[] = [];

async function simulator(pattern: string, name: string): Promise<string> {
  const udid = (
    await sh(`read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
for runtime, devices in json.load(sys.stdin)["devices"].items():
    if not runtime.endswith(".iOS-18-5"):
        continue
    for d in devices:
        if re.fullmatch(r"${pattern}", d["name"]):
            print(runtime, d["deviceTypeIdentifier"]); sys.exit(0)
sys.exit("no iOS 18.5 simulator matching ${pattern}")
')
xcrun simctl create "${name}" "$TYPE" "$RUNTIME"`)
  ).trim();
  sims.push(udid);
  return udid;
}

type Kind = "phone" | "pad";

async function pass(kind: Kind, udid: string, port: number) {
  const passStart = Date.now();
  await sh(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3
xcrun simctl install ${udid} "${app}"
xcrun simctl ui ${udid} appearance light
xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} >/dev/null`);
  let head: Node;
  try {
    head = (await until(
      `${kind}: Caw saying the notice`,
      async () => caw(await tree(udid)),
      (node) => node?.label?.endsWith("1 notice") === true,
      180_000
    )) as Node;
  } catch (error) {
    // What the screen said instead.
    const seen: Node[] = await tree(udid).catch((e) => [
      { label: `no read: ${e}` },
    ]);
    console.log(
      `  ${kind}: the screen's labels: ${seen
        .map((n) => n.label)
        .filter(Boolean)
        .slice(0, 40)
        .join(" | ")}`
    );
    throw error;
  }
  const screen = (await tree(udid))[0]?.frame;
  const width = screen?.width ?? 402;
  const at = centre(head.frame as Frame);
  console.log(
    `  ${kind}: Caw "${head.label}" at ${JSON.stringify(head.frame)}, screen ${width}pt wide`
  );

  // ── A tap toggles ──
  let since = Date.now();
  await tap(udid, at);
  await pause(900);
  const tappedOpen = await openNow(udid, since);
  // With no machine online every login is signed in everywhere it could be,
  // and folds: the fold is opened, and stays open on every later open.
  const fold = (await tree(udid)).find(
    (n) => FOLD_SHUT.test(n.label ?? "") && n.frame
  );
  if (fold?.frame) {
    await tap(udid, centre(fold.frame));
    await pause(1200);
  }
  const panel = await hangingBox(udid, since);
  since = Date.now();
  await tap(udid, at);
  await pause(900);
  const tappedShut = await openNow(udid, since);
  check(
    `${kind}: a tap on Caw opens and a second closes`,
    tappedOpen === true && tappedShut === false,
    `open ${tappedOpen}, then ${tappedShut}; the panel ${JSON.stringify(panel)}`
  );
  if (!panel) {
    return;
  }
  await pullChecks(kind, udid, at, width, panel);
  await rowChecks(kind, udid, at, width, panel, passStart);
}

/** The pulls on Caw: down slow past half and under it, a flick down, a flick up. */
async function pullChecks(
  kind: Kind,
  udid: string,
  at: Point,
  width: number,
  panel: Frame
) {
  const h = panel.height;
  // ── A slow pull past half opens, 1:1, captured mid-pull ──
  let since = Date.now();
  const travel = Math.round(h * 0.75);
  const going = swipe(udid, at, { x: at.x, y: at.y + travel }, 3);
  await pause(1700);
  const shotAt = Date.now();
  const mid = await pixels(udid, width, `${kind}-pull-mid-light`);
  const shotEnd = Date.now();
  await going;
  await pause(900);
  const slow = await pulls(udid, since);
  const samples = three(slow);
  // The finger's travel while the capture was being taken: the drawn foot must lie in it.
  const during = slow
    .filter((p) => p.at >= shotAt - 150 && p.at <= shotEnd)
    .map((p) => p.finger);
  const low = Math.min(...during);
  const high = Math.max(...during);
  const drawnFoot = footIn(mid, panel);
  check(
    `${kind}: the card's foot follows the finger 1:1 (3 points)`,
    samples.length === 3 &&
      samples.every((p) => Math.abs(p.foot - (p.from + p.finger)) <= 0.5),
    samples.map((p) => `finger ${p.finger}pt → foot ${p.foot}pt`).join("; ") +
      ` (${slow.length} pan events)`
  );
  check(
    `${kind}: mid-pull the capture shows the foot where the finger is`,
    during.length > 0 &&
      drawnFoot !== undefined &&
      drawnFoot >= low - 3 &&
      drawnFoot <= high + 3,
    `the finger travelled ${low}–${high}pt while the capture was taken; the foot in the capture ${drawnFoot?.toFixed(1)}pt under the panel's top`
  );
  check(
    `${kind}: a slow pull past half opens`,
    (await openNow(udid, since)) === true,
    `pulled ${travel}pt of ${h}pt over 3s; released: ${(await releases(udid, since)).join(" | ")}`
  );

  // ── A pull up from Caw closes: he stands at the screen's top, so it is a flick ──
  since = Date.now();
  await swipe(
    udid,
    { x: at.x, y: at.y + 6 },
    { x: at.x, y: Math.max(4, at.y - 40) },
    0.06
  );
  await pause(1000);
  check(
    `${kind}: a pull up from Caw closes`,
    (await openNow(udid, since)) === false,
    `released: ${(await releases(udid, since)).join(" | ") || "no release"}`
  );

  // ── Dark: a pull under half goes back, captured mid-pull ──
  await sh(`xcrun simctl ui ${udid} appearance dark`);
  await pause(1500);
  since = Date.now();
  const short = Math.round(h * 0.3);
  const goingDark = swipe(udid, at, { x: at.x, y: at.y + short }, 2);
  await pause(1300);
  await pixels(udid, width, `${kind}-pull-mid-dark`);
  await goingDark;
  await pause(1000);
  const under = await releases(udid, since);
  check(
    `${kind}: a slow pull under half goes back into the glass`,
    (await openNow(udid, since)) === false,
    `pulled ${short}pt of ${h}pt over 2s; released: ${under.join(" | ")}`
  );
  await sh(`xcrun simctl ui ${udid} appearance light`);
  await pause(1500);

  // ── A fast short flick opens ──
  since = Date.now();
  await swipe(udid, at, { x: at.x, y: at.y + 50 }, 0.03);
  await pause(1000);
  check(
    `${kind}: a fast short flick opens`,
    (await openNow(udid, since)) === true,
    `50pt in 0.03s; released: ${(await releases(udid, since)).join(" | ")}`
  );
}

/**
 * The rows, with the panel open: a vertical drag, a short swipe and a long
 * one, the ✕'s target either side of its glyph, a push up at the list's
 * end, and the group's head swiped off.
 */
async function rowChecks(
  kind: Kind,
  udid: string,
  at: Point,
  width: number,
  panel: Frame,
  passStart: number
) {
  const h = panel.height;
  let nodes = await tree(udid);
  /** The entries standing in the panel's visible box, top first, with their ✕s. */
  const shown = (from: Node[]) =>
    LOGINS.filter((name) => {
      const f = entryName(from, name)?.frame;
      return (
        f !== undefined &&
        entryCross(from, name) !== undefined &&
        f.y >= panel.y &&
        f.y + 40 <= panel.y + h
      );
    }).sort(
      (a, b) =>
        (entryName(from, a)?.frame?.y ?? 0) -
        (entryName(from, b)?.frame?.y ?? 0)
    );
  const names = shown(nodes);
  console.log(`  ${kind}: entries in the panel: ${names.join(", ")}`);
  const [first] = names;
  if (!first) {
    check(
      `${kind}: the moved logins listed`,
      false,
      "no entry with its ✕ in the panel"
    );
    return;
  }
  const rowWidth = panel.width - 14;

  // A vertical drag on the list scrolls it and moves no row.
  let since = Date.now();
  const before = entryName(nodes, first)?.frame as Frame;
  const body = { x: panel.x + panel.width / 2, y: panel.y + h * 0.7 };
  await swipe(udid, body, { x: body.x, y: body.y - 120 }, 0.6);
  await pause(1000);
  nodes = await tree(udid);
  const moved = entryName(nodes, first)?.frame;
  const swipes = (await panelLog(udid, since)).filter((l) =>
    l.text.startsWith("notice swipe")
  );
  check(
    `${kind}: a vertical drag scrolls the list and moves no row`,
    swipes.length === 0 &&
      moved !== undefined &&
      moved.y < before.y - 20 &&
      moved.x === before.x,
    `"${first}" from (${before.x}, ${before.y}) to ${moved ? `(${moved.x}, ${moved.y})` : "gone"}; ${swipes.length} row swipe events`
  );
  // Back to the top for the rest.
  await swipe(
    udid,
    { x: body.x, y: panel.y + h * 0.3 },
    { x: body.x, y: panel.y + h * 0.95 },
    0.4
  );
  await pause(1000);
  nodes = await tree(udid);

  // A quarter swipe follows the finger and springs back.
  const target = shown(nodes)[0] as string;
  const line = entryName(nodes, target)?.frame as Frame;
  since = Date.now();
  const startAt = { x: panel.x + 40, y: centre(line).y };
  const swiping = swipe(
    udid,
    startAt,
    { x: startAt.x + rowWidth * 0.25, y: startAt.y },
    1.6
  );
  await pause(1100);
  await pixels(udid, width, `${kind}-swipe-mid-light`);
  await swiping;
  await pause(900);
  const rowLog = await panelLog(udid, since);
  const rowSamples = three(
    rowLog
      .filter((l) => l.text.startsWith("notice swipe"))
      .map((l) => numbers(l.text, SWIPE_LINE))
  );
  nodes = await tree(udid);
  const back = entryName(nodes, target)?.frame;
  check(
    `${kind}: a swiped row follows the finger 1:1 (3 points)`,
    rowSamples.length === 3 &&
      rowSamples.every(([finger, x]) => Math.abs(finger - x) <= 0.5),
    rowSamples
      .map(([finger, x]) => `finger ${finger}pt → row ${x}pt`)
      .join("; ")
  );
  check(
    `${kind}: under 40% it springs back`,
    back !== undefined &&
      Math.abs(back.x - line.x) <= 0.5 &&
      entryCross(nodes, target) !== undefined,
    `${rowLog
      .filter((l) => l.text.startsWith("notice release"))
      .map((l) => l.text)
      .join(" | ")}; "${target}" back at x ${back?.x} (was ${line.x})`
  );

  // Past 40% it leaves, and the entries drop by one.
  const count = await entriesNow(udid, passStart);
  since = Date.now();
  await swipe(
    udid,
    { x: panel.x + panel.width - 40, y: centre(line).y },
    { x: panel.x + panel.width - 40 - rowWidth * 0.6, y: centre(line).y },
    0.4
  );
  await pause(1800);
  nodes = await tree(udid);
  const left = await entriesNow(udid, since);
  check(
    `${kind}: past 40% it slides off and is dismissed`,
    entryCross(nodes, target) === undefined &&
      count !== undefined &&
      left === count - 1,
    `${(await panelLog(udid, since))
      .filter((l) => l.text.startsWith("notice release"))
      .map((l) => l.text)
      .join(
        " | "
      )}; entries ${count} → ${left}; "${target}" ${entryCross(nodes, target) ? "still listed" : "gone"}`
  );

  // A tap 10pt past the ✕'s glyph, either side, dismisses its entry.
  for (const side of [1, -1]) {
    const name = shown(nodes)[0] as string;
    const cross = entryCross(nodes, name)?.frame as Frame;
    // The glyph is 12pt, centred in the ✕'s 24pt box: its edge 6pt out, 10pt past that.
    const point = { x: centre(cross).x + side * 16, y: centre(cross).y };
    // biome-ignore lint/performance/noAwaitInLoops: each tap reads the panel the one before left
    const was = await entriesNow(udid, passStart);
    since = Date.now();
    await tap(udid, point);
    await pause(1500);
    nodes = await tree(udid);
    const now = await entriesNow(udid, since);
    check(
      `${kind}: a tap 10pt ${side > 0 ? "past" : "before"} the ✕'s glyph dismisses "${name}"`,
      entryCross(nodes, name) === undefined && now === (was ?? 0) - 1,
      `✕ box ${JSON.stringify(cross)}, tapped at ${JSON.stringify(point)}; entries ${was} → ${now}`
    );
  }

  // A push up on the body, once its list shows its end, closes the panel.
  since = Date.now();
  let shut = false;
  for (let k = 0; k < 5 && !shut; k += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each push reads where the list stands after the last
    await swipe(
      udid,
      { x: body.x, y: panel.y + h * 0.85 },
      { x: body.x, y: panel.y + h * 0.2 },
      0.3
    );
    await pause(1000);
    shut = (await openNow(udid, since)) === false;
  }
  check(
    `${kind}: a push up on its body closes it once the list shows its end`,
    shut,
    `released: ${(await releases(udid, since)).join(" | ") || "no push released"}`
  );

  // The group's head swiped off takes the whole group.
  await tap(udid, at);
  await pause(1000);
  // The list keeps where it was scrolled: back to its top, where the head stands.
  await swipe(
    udid,
    { x: body.x, y: panel.y + h * 0.3 },
    { x: body.x, y: panel.y + h * 0.95 },
    0.4
  );
  await pause(1000);
  nodes = await tree(udid);
  const groupHead = nodes.find(
    (n) => GROUP_HEAD.test(n.label ?? "") && n.frame
  );
  since = Date.now();
  if (groupHead?.frame) {
    const { y } = centre(groupHead.frame);
    await swipe(
      udid,
      { x: panel.x + 40, y },
      { x: panel.x + 40 + rowWidth * 0.7, y },
      0.35
    );
    await pause(2000);
  }
  nodes = await tree(udid);
  check(
    `${kind}: the group's head swiped off dismisses the group`,
    groupHead !== undefined && caw(nodes)?.label?.includes("notice") === false,
    `head "${groupHead?.label ?? "not found"}"; Caw now "${caw(nodes)?.label}"`
  );
}

try {
  // The hub alone: moved logins are its own rows, and no session is needed.
  fleet.launch("hub");
  await fleet.hubUp();
  /**
   * A dozen logins moved in from OpenCode's store and not signed in here,
   * each an open entry of one group, filed under `pass`'s own account ids:
   * the hub keeps what an earlier pass acknowledged.
   */
  const seed = (round: string) => {
    fleet.write(
      "DELETE FROM account_signins WHERE account_id LIKE ?",
      `${ACCOUNT}-%`
    );
    fleet.write("DELETE FROM accounts WHERE id LIKE ?", `${ACCOUNT}-%`);
    LOGINS.forEach((name, k) => {
      fleet.write(
        "INSERT INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', ?, 'green', ?, 0, ?)",
        `${ACCOUNT}-${round}-${k}`,
        name,
        k + 1,
        Date.now()
      );
      fleet.write(
        "INSERT INTO account_signins (account_id, machine_id, state, moved_at, moved_from, checked_at) VALUES (?, ?, 'signed-out', ?, 'opencode', ?)",
        `${ACCOUNT}-${round}-${k}`,
        MACHINE,
        Date.now(),
        Date.now()
      );
    });
  };
  // The machine the logins moved in on: a notice names it, and the app drops a login from a machine it does not know.
  fleet.write(
    "INSERT OR IGNORE INTO agents (machine_id, hostname, os, status, created_at) VALUES (?, ?, 'darwin', 'offline', ?)",
    MACHINE,
    MACHINE,
    Date.now()
  );
  seed("phone");
  const accounts = await fleet.api<{
    signins: { accountId: string; movedAt: number | null }[];
  }>("/api/accounts");
  console.log(
    `  the hub serves ${accounts.signins.filter((one) => one.movedAt !== null).length} moved logins`
  );
  const port = Number(new URL(fleet.base).port);
  const phone = await simulator("iPhone 16 Pro", "CawCo probe pull phone");
  console.log(`  phone simulator ${phone} (iOS 18.5)`);
  await pass("phone", phone, port);
  await sh(`xcrun simctl shutdown ${phone} >/dev/null 2>&1 || true`);
  seed("pad");
  const pad = await simulator(
    "iPad Pro 13-inch \\(M4\\)",
    "CawCo probe pull iPad"
  );
  console.log(`  iPad simulator ${pad} (iOS 18.5)`);
  await pass("pad", pad, port);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const udid of sims) {
    // biome-ignore lint/performance/noAwaitInLoops: each simulator torn down in turn
    await sh(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
      console.log(`  simulator cleanup: ${error}`)
    );
  }
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}
console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
