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
 *  2. finds Caw in the page by his label ("Needs you, N", "All caught up", …
 *     and " · N notices"), read by Maestro (`maestro hierarchy`), whose
 *     XCTest runner reads from inside the simulator and so reaches the page
 *     Safari's web content process draws;
 *  3. for each run: records the screen (`xcrun simctl io recordVideo`), taps
 *     Caw (the Maestro runner's own touch), lets the panel open, stops the
 *     recording, and taps him again to close it;
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
 * simulator. The Mac's Maestro (/opt/homebrew/bin/maestro) and Homebrew's
 * openjdk do the reading; the runner the first read starts on the simulator
 * (it replaces any Maestro runner already there) is stopped at the end, and
 * what the Maestro calls took is printed after the summary. Recordings are
 * kept in the folder it names.
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

/**
 * A shell command on the Mac. This probe runs on the Mac itself, so it runs
 * here; the name and the shape are the remote probes' (probe-ios-caw-panel),
 * so the Maestro calls below are their copy word for word.
 */
const mac = (script: string) => run(["bash", "-c", script]);

/**
 * Maestro on the Mac (/opt/homebrew/bin/maestro), on the JDK Homebrew keeps
 * for it, its analytics, update check and analysis notice off. Its iOS
 * driver is an XCTest runner app inside the simulator that serves HTTP on the
 * Mac's loopback. It reads the screen from the guest, XCTest's snapshot of
 * the foreground app, which takes in subtrees other processes draw (Safari's
 * page), and not through the host's accessibility translator, which on the
 * iPad fails once Caw's panel opens ("No translation object").
 *
 * `MAESTRO_OPTS` carries JVM options into Maestro's launcher, Gradle's start
 * script, which adds them to the `java` line and prints nothing of its own
 * (JDK_JAVA_OPTIONS and JAVA_TOOL_OPTIONS each make the JVM print a "Picked
 * up" line on stderr). `--enable-final-field-mutation=ALL-UNNAMED` is what
 * JDK 26's warning asks for (JEP 500) when Maestro's classes, all on the class
 * path, mutate final fields: without it every call's stderr opens with
 * "WARNING: Final field … has been mutated reflectively", above Maestro's
 * own error.
 */
const MAESTRO =
  'JAVA_HOME="$(/opt/homebrew/bin/brew --prefix openjdk)" MAESTRO_OPTS=--enable-final-field-mutation=ALL-UNNAMED MAESTRO_CLI_NO_ANALYTICS=1 MAESTRO_DISABLE_UPDATE_CHECK=true MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true /opt/homebrew/bin/maestro';
/** Maestro's runner app: one per simulator, kept up by an `xcodebuild test-without-building` on the Mac. */
const RUNNER = "dev.mobile.maestro-driver-iosUITests.xctrunner";
/**
 * Each simulator's runner port, a free one on the Mac picked before its first
 * read. Maestro's default, 22087, is every simulator's, and the CLI takes
 * whatever answers `GET /status` there for its runner without asking which
 * simulator that runner drives.
 */
const runnerPorts = new Map<string, number>();
async function runnerPort(udid: string): Promise<number> {
  const known = runnerPorts.get(udid);
  if (known !== undefined) {
    return known;
  }
  const port = Number(
    (
      await mac(
        `python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'`
      )
    ).trim()
  );
  runnerPorts.set(udid, port);
  return port;
}
/**
 * One simulator's Maestro calls, for the summary: each call's wall time on
 * the Mac, ms (its first read, which starts the runner; the reads after it;
 * the taps), and at each read that came back the foreground app's tree: how
 * deep it runs, counted as the runner counts it (a leaf is 1; from 60 deep
 * the runner snapshots the app again child by child), and how many elements
 * it holds.
 */
interface MaestroLog {
  depths: number[];
  first?: number;
  reads: number[];
  sizes: number[];
  taps: number[];
}
const maestroLogs = new Map<string, MaestroLog>();
function maestroLog(udid: string): MaestroLog {
  const known = maestroLogs.get(udid);
  if (known) {
    return known;
  }
  const log: MaestroLog = { depths: [], reads: [], sizes: [], taps: [] };
  maestroLogs.set(udid, log);
  return log;
}
/** How deep a tree runs, a leaf being 1: the runner's `AXElement.depth()`. */
const depthOf = (node: MaestroNode): number =>
  1 + Math.max(0, ...(node.children ?? []).map(depthOf));
/** How many elements a tree holds, its top one among them. */
const sizeOf = (node: MaestroNode): number =>
  (node.children ?? []).reduce((sum, under) => sum + sizeOf(under), 1);
/** What Maestro's CLI prints after its error, before the stack (its App.kt). */
const MAESTRO_STACK = "The stack trace was:";

/** An element of the screen: its label, id and value, and its frame in points. */
interface Node {
  frame?: Frame;
  id?: string;
  label?: string;
  value?: string;
}
/** One read: the foreground app's name, its elements flattened, and the screen it fills, in points. */
interface ScreenRead {
  app: string;
  nodes: Node[];
  screen: { height: number; width: number };
}
/** A node of `maestro hierarchy`'s tree: its attributes as strings, and its children. */
interface MaestroNode {
  attributes?: Record<string, string>;
  children?: MaestroNode[];
}
/** Maestro's `bounds`: "[left,top][right,bottom]", in points. */
const BOUNDS = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;
const frameOf = (bounds: string | undefined): Frame | undefined => {
  const m = BOUNDS.exec(bounds ?? "");
  if (!m) {
    return;
  }
  const [x0, y0, x1, y1] = m.slice(1).map(Number);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
/**
 * The screen as Maestro's runner reads it (`maestro hierarchy`): the
 * foreground app's tree, then the status bar's. `named` is the foreground
 * app's name, as its tree's top element gives it ("CawCo", "Safari"). A read
 * of any other app is refused: when no app reports itself in the foreground,
 * the runner hands back SpringBoard's tree in its place. `--no-reinstall-driver`
 * keeps the runner up between calls; the default uninstalls it at each exit.
 */
async function screenRead(udid: string, named: string): Promise<ScreenRead> {
  const first = !runnerPorts.has(udid);
  const port = await runnerPort(udid);
  const log = maestroLog(udid);
  const started = Date.now();
  // A failed read says Maestro's own error, its stack cut, then the tree of
  // the simulator's last read that came back.
  const text = await mac(
    `${MAESTRO} --device ${udid} --driver-host-port ${port} hierarchy --no-reinstall-driver`
  ).catch((error: unknown) => {
    const words = (error instanceof Error ? error.message : String(error))
      .split(MAESTRO_STACK)[0]
      .trim();
    const before =
      log.depths.length === 0
        ? "no read of it had come back"
        : `its last read that came back held ${log.sizes.at(-1)} elements, ${log.depths.at(-1)} deep`;
    throw new Error(
      `Maestro's read of ${udid} failed after ${Date.now() - started} ms (${before}): ${words}`
    );
  });
  const ms = Date.now() - started;
  if (first) {
    log.first = ms;
  } else {
    log.reads.push(ms);
  }
  const whole = JSON.parse(
    text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)
  ) as MaestroNode;
  const front = whole.children?.[0];
  if (front) {
    log.depths.push(depthOf(front));
    log.sizes.push(sizeOf(front));
  }
  const foreground = front?.attributes;
  const screen = frameOf(foreground?.bounds);
  if (foreground?.accessibilityText !== named || !screen) {
    throw new Error(
      `Maestro's read has "${foreground?.accessibilityText || "nothing named"}" in the foreground, not ${named}${screen ? "" : ", and no frame"}: with no app in the foreground its runner reads SpringBoard`
    );
  }
  const nodes: Node[] = [];
  const walk = (node: MaestroNode) => {
    const a = node.attributes ?? {};
    nodes.push({
      label: a.accessibilityText || undefined,
      id: a["resource-id"] || undefined,
      value: a.value || undefined,
      frame: frameOf(a.bounds),
    });
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(whole);
  return {
    app: named,
    nodes,
    screen: { width: screen.width, height: screen.height },
  };
}
/**
 * One finger's tap at a point, in points: the runner's own touch, `POST
 * /touch`, the call every `tapOn` of Maestro's ends in, sent to it straight.
 * A tap through `maestro test` first starts a JVM, lists the devices and reads
 * the whole tree, seconds in all, so nothing could say when the finger came
 * down; this one lands as it is sent. The runner is the one the simulator's
 * first read started.
 */
async function tap(udid: string, p: { x: number; y: number }) {
  const port = runnerPorts.get(udid);
  if (port === undefined) {
    throw new Error(`no Maestro runner for ${udid}: read its screen first`);
  }
  const started = Date.now();
  await mac(
    `curl -sS --fail-with-body --max-time 30 -H 'Content-Type: application/json' -d '{"x":${Math.round(p.x)},"y":${Math.round(p.y)}}' http://127.0.0.1:${port}/touch`
  );
  maestroLog(udid).taps.push(Date.now() - started);
}
/**
 * The simulator's runner, stopped: its app, and the `xcodebuild` keeping it
 * up, as `pkill -f` matches it (the bracket keeps the pattern off the shell
 * running the match, whose own command line holds it).
 */
const stopRunner = (udid: string) =>
  mac(`xcrun simctl terminate ${udid} ${RUNNER} >/dev/null 2>&1 || true
pkill -f "[x]codebuild test-without-building .*-destination id=${udid} " || true`);
/** What each simulator's Maestro calls took, and how big its app's tree read, for the summary: a line per simulator. */
function maestroTimes(): string {
  const spread = (values: number[], unit: string) => {
    const sorted = [...values].sort((a, b) => a - b);
    return values.length === 0
      ? "none"
      : `median ${sorted[Math.floor(sorted.length / 2)]}${unit}, least ${sorted[0]}${unit}, most ${sorted.at(-1)}${unit}`;
  };
  return [...maestroLogs]
    .map(
      ([udid, log]) =>
        `maestro ${udid}: first read, which starts the runner, ${log.first ?? "none"} ms; ${log.reads.length} reads after (${spread(log.reads, " ms")}); ${log.taps.length} taps (${spread(log.taps, " ms")}); the app's tree at ${log.depths.length} reads: depth ${spread(log.depths, "")} (the runner's limit 60), elements ${spread(log.sizes, "")}`
    )
    .join("\n");
}

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

/** Every element on the screen, the page's with Safari's, flattened. */
const tree = async (udid: string) => (await screenRead(udid, "Safari")).nodes;

/** Caw's own label (NeedsCaw `label`). */
const CAW_LABEL =
  /^(Needs you, \d+|All caught up|Reading the fleet|Connecting…|Hub unreachable)( · \d+ notices?)?$/;

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
/** Maestro keeps one runner per simulator, so the one this probe started is the simulator's: stopped at the end. */
const cleanUp = async () => {
  await stopRunner(phone).catch((error) =>
    console.log(`  Maestro runner cleanup: ${error}`)
  );
};

await run(["xcrun", "simctl", "openurl", phone, url]);
console.log(`  opened ${url} in Safari; waiting for Caw`);
let caw: Node | undefined;
let seen: Node[] = [];
try {
  for (let attempt = 0; attempt < 30 && !caw?.frame; attempt += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: polling the screen until the page has loaded
    await Bun.sleep(1000);
    seen = await tree(phone);
    caw = seen.find((node) => CAW_LABEL.test(node.label ?? "") && node.frame);
  }
} catch (error) {
  console.error(`FAIL the screen could not be read: ${error}`);
  await cleanUp();
  process.exit(1);
}
if (!caw?.frame) {
  const capture = join(out, "no-caw.png");
  await run(["xcrun", "simctl", "io", phone, "screenshot", capture]).catch(
    () => undefined
  );
  const labels = seen
    .map((node) => node.label)
    .filter(Boolean)
    .slice(0, 40)
    .join(" | ");
  console.error(
    `FAIL Caw was not found on the screen: is the dashboard loaded and narrow (a phone)?\n  on screen: ${labels || "no labels"}\n  capture: ${capture}`
  );
  await cleanUp();
  process.exit(1);
}
console.log(`  Caw: "${caw.label}" at ${JSON.stringify(caw.frame)}`);
const cawAt = {
  x: caw.frame.x + caw.frame.width / 2,
  y: caw.frame.y + caw.frame.height / 2,
};

const summaries: { dropped: number; frames: number; max: number }[] = [];
try {
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
    await tap(phone, cawAt);
    await Bun.sleep(OPEN_MS);
    recorder.kill("SIGINT");
    await recorder.exited;
    // Close the panel: his press toggles it.
    await tap(phone, cawAt);
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
} finally {
  await cleanUp();
}

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
const median = (values: number[]) =>
  sorted(values)[Math.floor(values.length / 2)] ?? 0;
console.log(
  `SUMMARY ${RUNS} opens: median ${median(summaries.map((s) => s.frames))} frames, median longest ${median(summaries.map((s) => s.max)).toFixed(1)} ms, ${summaries.reduce((sum, s) => sum + s.dropped, 0)} intervals over ${DROPPED_MS} ms in all; first open: longest ${summaries[0]?.max.toFixed(1)} ms, ${summaries[0]?.dropped} over ${DROPPED_MS} ms`
);
console.log(maestroTimes());
console.log(`  recordings: ${out}`);
