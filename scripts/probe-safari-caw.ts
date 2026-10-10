#!/usr/bin/env bun
/**
 * Safari Caw probe: how smoothly Caw's panel opens in the iOS Simulator's
 * Safari, the owner's own engine (owner: "the pressing on caw is very laggy
 * when it opens and not smooth").
 *
 *   bun scripts/probe-safari-caw.ts <dashboard-url> [--udid <udid>] [--runs 10]
 *
 * Run on the Mac, from the repo root. It:
 *
 *  1. takes the booted iPhone simulator (or `--udid`), and opens the
 *     dashboard URL in its Safari (`xcrun simctl openurl`);
 *  2. finds Caw in the accessibility tree by his label (axe describe-ui:
 *     "Needs you, N", "All caught up", … and " · N notices");
 *  3. for each run: records the screen (`xcrun simctl io recordVideo`), taps
 *     Caw (axe tap), lets the panel open, stops the recording, and taps him
 *     again to close it;
 *  4. reads each recording's video track itself: the media timescale from
 *     its `mdhd` and every frame's duration from its `stts` (a QuickTime
 *     movie is the same box tree as an MP4), so no ffprobe is needed;
 *  5. finds the open in each recording, the burst of frames the screen drew
 *     after the tap, and prints its cadence: frames, how long it ran, the
 *     longest interval, how many intervals were longer than a 60 Hz frame and
 *     a half (25 ms, a dropped frame), and the intervals themselves.
 *
 * The recorder writes a frame only when the screen changed, so a still
 * screen shows as one long interval; the open is the run of short ones after
 * the tap. Safari must already be past its first-launch screens on the
 * simulator. Recordings are kept in the folder it names.
 */
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const HTTP_URL = /^https?:\/\//;
/** An `hdlr` box's handler type for a video track: "vide". */
const VIDE = 0x76_69_64_65;
const args = process.argv.slice(2);
const url = args.find((arg) => HTTP_URL.test(arg));
const option = (flag: string): string | undefined => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
if (!url) {
  console.error(
    "usage: bun scripts/probe-safari-caw.ts <dashboard-url> [--udid <udid>] [--runs 10]"
  );
  process.exit(2);
}
const RUNS = Number(option("--runs") ?? 10);
/** A 60 Hz frame and a half: an interval past this lost a frame. */
const DROPPED_MS = 25;
/** Intervals longer than this end the open's burst: the screen stood still. */
const STILL_MS = 120;
/** How long the panel is given to open, and the recorder to settle, ms. */
const OPEN_MS = 1500;
const LEAD_MS = 1200;

const root = resolve(import.meta.dir, "..");
const out = join(root, ".probe", `safari-caw-${Date.now()}`);
await mkdir(out, { recursive: true });

/** Runs a command; its stdout, or throws with its stderr. */
async function run(cmd: string[]): Promise<string> {
  const child = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`${cmd.join(" ")} exited ${code}: ${err.trim()}`);
  }
  return text;
}

const AXE = (await Bun.file("/opt/homebrew/bin/axe").exists())
  ? "/opt/homebrew/bin/axe"
  : "axe";

/** The simulator: `--udid`, or the booted iPhone. */
async function device(): Promise<string> {
  const given = option("--udid");
  if (given) {
    return given;
  }
  const list = JSON.parse(
    await run(["xcrun", "simctl", "list", "devices", "booted", "-j"])
  ) as { devices: Record<string, { name: string; udid: string }[]> };
  const phone = Object.values(list.devices)
    .flat()
    .find((one) => one.name.includes("iPhone"));
  if (!phone) {
    throw new Error(
      "no booted iPhone simulator: boot one, or pass --udid <udid>"
    );
  }
  console.log(`  simulator: ${phone.name} (${phone.udid})`);
  return phone.udid;
}

interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface Node {
  frame?: Frame;
  label?: string;
}

/** Every labelled element of the screen's accessibility tree, flattened. */
async function tree(udid: string): Promise<Node[]> {
  const nodes: Node[] = [];
  const walk = (at: unknown) => {
    if (Array.isArray(at)) {
      for (const child of at) {
        walk(child);
      }
      return;
    }
    if (!at || typeof at !== "object") {
      return;
    }
    const o = at as Record<string, unknown>;
    nodes.push({
      label: (o.AXLabel ?? o.label) as string | undefined,
      frame: o.frame as Frame | undefined,
    });
    walk(o.children);
  };
  walk(JSON.parse(await run([AXE, "describe-ui", "--udid", udid])));
  return nodes;
}

/** Caw's own label (NeedsCaw `label`). */
const CAW_LABEL =
  /^(Needs you, \d+|All caught up|Reading the fleet|Connecting…|Hub unreachable)( · \d+ notices?)?$/;

const tap = (udid: string, frame: Frame) =>
  run([
    AXE,
    "tap",
    "-x",
    String(Math.round(frame.x + frame.width / 2)),
    "-y",
    String(Math.round(frame.y + frame.height / 2)),
    "--udid",
    udid,
  ]);

/* ── The recording's frame times ─────────────────────────────────────── */

interface Box {
  end: number;
  start: number;
  type: string;
}

/** The boxes laid end to end in `[from, to)` of the file. */
function boxes(view: DataView, from: number, to: number): Box[] {
  const found: Box[] = [];
  let at = from;
  while (at + 8 <= to) {
    let size = view.getUint32(at);
    const type = String.fromCharCode(
      view.getUint8(at + 4),
      view.getUint8(at + 5),
      view.getUint8(at + 6),
      view.getUint8(at + 7)
    );
    let header = 8;
    if (size === 1) {
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header) {
      break;
    }
    found.push({ type, start: at + header, end: at + size });
    at += size;
  }
  return found;
}

const child = (view: DataView, box: Box, type: string) =>
  boxes(view, box.start, box.end).find((one) => one.type === type);

/**
 * The video track's frame durations, ms: the timescale from its `mdhd`, each
 * frame's delta from its `stts`.
 */
function frameDurations(file: ArrayBuffer): number[] {
  const view = new DataView(file);
  const moov = boxes(view, 0, view.byteLength).find(
    (one) => one.type === "moov"
  );
  if (!moov) {
    throw new Error("no moov box: the recording did not finish");
  }
  for (const trak of boxes(view, moov.start, moov.end)) {
    const tables = trak.type === "trak" ? videoTables(view, trak) : null;
    if (tables) {
      return sttsDurations(view, tables.mdhd, tables.stts);
    }
  }
  throw new Error("no video track with an stts box");
}

/** A track's `mdhd` and `stts`, if it is the video track. */
function videoTables(
  view: DataView,
  trak: Box
): { mdhd: Box; stts: Box } | null {
  const mdia = child(view, trak, "mdia");
  const hdlr = mdia && child(view, mdia, "hdlr");
  // hdlr: version and flags, pre_defined, then the handler type, "vide".
  if (!(mdia && hdlr) || view.getUint32(hdlr.start + 8) !== VIDE) {
    return null;
  }
  const mdhd = child(view, mdia, "mdhd");
  const minf = child(view, mdia, "minf");
  const stbl = minf && child(view, minf, "stbl");
  const stts = stbl && child(view, stbl, "stts");
  return mdhd && stts ? { mdhd, stts } : null;
}

/** Each sample's duration in ms, from the media timescale and the time-to-sample table. */
function sttsDurations(view: DataView, mdhd: Box, stts: Box): number[] {
  // mdhd: version 1 has 64-bit creation and modification times before it.
  const version = view.getUint8(mdhd.start);
  const timescale = view.getUint32(mdhd.start + (version === 1 ? 20 : 12));
  const count = view.getUint32(stts.start + 4);
  const durations: number[] = [];
  for (let entry = 0; entry < count; entry += 1) {
    const samples = view.getUint32(stts.start + 8 + entry * 8);
    const delta = view.getUint32(stts.start + 12 + entry * 8);
    for (let sample = 0; sample < samples; sample += 1) {
      durations.push((delta / timescale) * 1000);
    }
  }
  return durations;
}

/**
 * The open: the first run of frames after the recording's lead-in whose
 * intervals are all shorter than STILL_MS, and the intervals between them.
 */
function openBurst(durations: number[], leadMs: number): number[] {
  let t = 0;
  const intervals: number[] = [];
  for (const duration of durations) {
    const past = t >= leadMs * 0.5;
    t += duration;
    if (!past) {
      continue;
    }
    if (duration < STILL_MS) {
      intervals.push(duration);
    } else if (intervals.length > 2) {
      break;
    } else {
      intervals.length = 0;
    }
  }
  return intervals;
}

/* ── The runs ────────────────────────────────────────────────────────── */

const phone = await device();
await run(["xcrun", "simctl", "openurl", phone, url]);
console.log(`  opened ${url} in Safari; waiting for Caw`);
let caw: Node | undefined;
for (let attempt = 0; attempt < 30 && !caw?.frame; attempt += 1) {
  // biome-ignore lint/performance/noAwaitInLoops: polling the screen until the page has loaded
  await Bun.sleep(1000);
  caw = (await tree(phone)).find(
    (node) => CAW_LABEL.test(node.label ?? "") && node.frame
  );
}
if (!caw?.frame) {
  console.error(
    "FAIL Caw was not found on the screen: is the dashboard loaded and narrow (a phone)?"
  );
  process.exit(1);
}
console.log(`  Caw: "${caw.label}" at ${JSON.stringify(caw.frame)}`);
const cawFrame = caw.frame;

const summaries: { dropped: number; frames: number; max: number }[] = [];
for (let n = 0; n < RUNS; n += 1) {
  const file = join(out, `open-${n}.mov`);
  const recorder = Bun.spawn(
    [
      "xcrun",
      "simctl",
      "io",
      phone,
      "recordVideo",
      "--codec=h264",
      "--force",
      file,
    ],
    { stdout: "ignore", stderr: "pipe" }
  );
  // biome-ignore lint/performance/noAwaitInLoops: one recording at a time
  await Bun.sleep(LEAD_MS);
  await tap(phone, cawFrame);
  await Bun.sleep(OPEN_MS);
  recorder.kill("SIGINT");
  await recorder.exited;
  // Close the panel: his press toggles it.
  await tap(phone, cawFrame);
  await Bun.sleep(800);

  const durations = frameDurations(await Bun.file(file).arrayBuffer());
  const burst = openBurst(durations, LEAD_MS);
  const total = burst.reduce((sum, ms) => sum + ms, 0);
  const max = burst.length > 0 ? Math.max(...burst) : 0;
  const dropped = burst.filter((ms) => ms > DROPPED_MS).length;
  summaries.push({ frames: burst.length + 1, max, dropped });
  console.log(
    `run ${n}: ${burst.length + 1} frames over ${total.toFixed(0)} ms, longest ${max.toFixed(1)} ms, ${dropped} over ${DROPPED_MS} ms; intervals ${burst.map((ms) => ms.toFixed(0)).join(" ")}`
  );
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const median = (values: number[]) =>
  sorted(values)[Math.floor(values.length / 2)] ?? 0;
console.log(
  `SUMMARY ${RUNS} opens: median ${median(summaries.map((s) => s.frames))} frames, median longest ${median(summaries.map((s) => s.max)).toFixed(1)} ms, ${summaries.reduce((sum, s) => sum + s.dropped, 0)} intervals over ${DROPPED_MS} ms in all; first open: longest ${summaries[0]?.max.toFixed(1)} ms, ${summaries[0]?.dropped} over ${DROPPED_MS} ms`
);
console.log(`  recordings: ${out}`);
