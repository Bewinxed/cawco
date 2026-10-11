#!/usr/bin/env bun
/**
 * iOS Caw panel probe: tapping Caw opens a non-modal panel under him that
 * holds every notification, Needs you first, then Notices. Nothing covers
 * the rest of the screen: a tap on a transcript row while the panel is open
 * reaches the row and closes the panel.
 *
 *   bun scripts/probe-ios-caw-panel.ts [--keep]
 *
 * Run from the repo root in a shell that reaches the Mac as `ssh mac` (not
 * a CawCo workspace). It:
 *
 *  1. compiles the app on the Mac (build-both.sh ios --compile-only);
 *  2. stands up a scratch fleet here (scratch-fleet.ts: a real hub, agent
 *     and sessiond, Claude Code on a mock model) with two sessions: "Panel
 *     probe", which ran one Bash call (a transcript row to tap), and "Needs
 *     probe", started in the `default` permission mode, whose Bash call the
 *     hub parks as a permission ask; then files the probe account's sign-in
 *     as a login moved in from the machine's own Claude Code store, and a
 *     second account ("Design") moved in from OpenCode's and not signed in
 *     there, which the hub serves as one moved-logins group (the probe's
 *     entry folded as signed in everywhere, Design's open);
 *  3. forwards the scratch hub to the Mac's loopback (`ssh -R`);
 *  4. on an iPhone and then an iPad simulator, launches the app with
 *     `-paywall-env sandbox` on "Panel probe" and drives it with Maestro (its
 *     XCTest runner in the simulator reads the screen and taps): taps
 *     Caw, reads the panel and how it hangs from his glass (0pt at the join,
 *     the trailing flank straight down, the leading foot's flare in the
 *     panel's surface), captures it light and dark (and on the phone records
 *     it closing and opening), taps the transcript
 *     row at a point outside it (a second Bash call stands the newest row
 *     below the panel's foot on the phone, which the panel spans; on the
 *     iPad a row runs out beside it); on the phone it then presses the ask's
 *     row itself, which opens its session; on the iPad it dismisses Design
 *     by its entry's ✕, then the rest by the group's ✕, and approves
 *     the ask from the panel;
 *  5. prints `PASS <step>` / `FAIL <step>` per check, saves the captures to a
 *     folder it names, and exits 0 only if every check passed. A read that
 *     timed out on an app that never went idle prints the app's own log of
 *     what was looping (`idleEvidence`).
 *
 * It stops only what it started: the fleet's processes by PID, the tunnel,
 * the Maestro runner of each simulator it created, and those simulators
 * (deleted at the end). `--keep` keeps the fleet's sandbox for reading. The
 * Mac's Maestro (/opt/homebrew/bin/maestro) and Homebrew's openjdk do the
 * driving; what the Maestro calls took is printed before the verdict.
 */
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import {
  ACCOUNT,
  MACHINE,
  type Seen,
  scratchFleet,
  until,
  untilGone,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
/** ssh's exit status when it could not reach or keep the Mac. */
const SSH_FAILED = 255;
const out = join(root, ".probe", `ios-caw-panel-${Date.now()}`);
await mkdir(out, { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok) {
    failures += 1;
  }
};

/** Runs `script` in bash on the Mac; its stdout, or throws with its stderr. */
async function mac(script: string, retried = false): Promise<string> {
  const child = Bun.spawn([...SSH, "mac", "bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  // 255 is ssh's own failure (the Mac did not answer), not the script's: once more, after a breath.
  if (code === SSH_FAILED && !retried) {
    console.log(`  ssh failed (${err.trim()}); trying once more`);
    await Bun.sleep(5000);
    return mac(script, true);
  }
  if (code !== 0) {
    throw new Error(`mac exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}

// ── 1. Compile ───────────────────────────────────────────────────────────
{
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: root, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(build.stdout).text();
  process.stdout.write(text);
  const code = await build.exited;
  check(
    "compile",
    code === 0 && /^BUILT iOS$/m.test(text) && /^BUILT iOS 18\.5$/m.test(text),
    code === 0 ? "BUILT iOS and BUILT iOS 18.5" : `build-both.sh exited ${code}`
  );
  if (code !== 0) {
    process.exit(1);
  }
}
const top = (
  await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
).trim();
const build = top === join(home, "cockpit") ? "main" : basename(top);
const app = `$HOME/build/cawco-apple/${build}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;

// ── 2. The scratch fleet ─────────────────────────────────────────────────
const tag = crypto.randomUUID().slice(0, 6);
const ROW = `panel-row-${tag}`;
/**
 * A second Bash call after the first: the newest tool row, at the
 * transcript's foot, stands wholly below the open panel's foot on a phone
 * (the panel spans its width, so a row beside it is no row outside it).
 */
const ROW_BELOW = `panel-below-${tag}`;
const ASK = `panel-ask-${tag}`;
const INTRO = `panel-intro-${tag}`;
/** The row session's one delegate: its chip opens a panel over the tray (`trayThrough`). */
const TRAY_TITLE = "Tray probe";
/**
 * The intro turn's reply: long enough that the Bash row after it stands
 * below where Caw's panel hangs (about 350pt down), so a tap on the row
 * lands outside the panel without the panel moving.
 */
const INTRO_REPLY = [
  ...Array.from(
    { length: 14 },
    (_, n) =>
      `Line ${n + 1} of the intro: a sentence long enough to fill the width of a phone's transcript. `
  ),
  "Intro done.",
];
const respond = (request: Seen) => {
  if (request.tools && request.last.includes(INTRO)) {
    return { everyMs: 5, words: INTRO_REPLY };
  }
  // A session's turn (tools offered), started by one of the probe's messages.
  if (request.tools && request.last.includes(ROW)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: "echo row-output", description: "Print a line" },
      },
    };
  }
  if (request.tools && request.last.includes(ROW_BELOW)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: "echo row-below", description: "Print another line" },
      },
    };
  }
  if (request.tools && request.last.includes(ASK)) {
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "Bash",
        input: { command: `touch ${ASK}.txt`, description: "Make a file" },
      },
    };
  }
  return { everyMs: 10, words: ["Row", " done."] };
};
const fleet = await scratchFleet({ name: "probe-ios-caw-panel", respond });

let tunnel: ReturnType<typeof Bun.spawn> | undefined;
const sims: string[] = [];

interface Frame {
  height: number;
  width: number;
  x: number;
  y: number;
}
/** The app's name, as Maestro's read of it gives it (project.yml CFBundleDisplayName). */
const APP = "CawCo";
/** Every element on the app's screen, flattened. */
const tree = async (udid: string) => (await read(udid)).nodes;
/** A read still out after this long is waiting on the app: its main thread is sampled while it hangs. */
const SAMPLE_AFTER_MS = 45_000;
/** The app's screen, read; a read that hangs past `SAMPLE_AFTER_MS` has the app sampled meanwhile (`sampleApp`). */
async function read(udid: string): Promise<ScreenRead> {
  let sampled: Promise<void> | undefined;
  const timer = setTimeout(() => {
    sampled = sampleApp(udid);
  }, SAMPLE_AFTER_MS);
  try {
    return await screenRead(udid, APP);
  } finally {
    clearTimeout(timer);
    await sampled;
  }
}
const said = (nodes: Node[]) =>
  nodes
    .filter((n) => n.id || n.label)
    .map((n) => n.label ?? n.id)
    .slice(0, 3)
    .join(" < ") || "nothing labelled";
const centre = (f: Frame) => ({ x: f.x + f.width / 2, y: f.y + f.height / 2 });
const inside = (f: Frame, p: { x: number; y: number }) =>
  p.x >= f.x && p.x <= f.x + f.width && p.y >= f.y && p.y <= f.y + f.height;
/** Whether `outer` takes in all of `inner`. */
const encloses = (outer: Frame, inner: Frame) =>
  inside(outer, inner) &&
  inside(outer, { x: inner.x + inner.width, y: inner.y + inner.height });
const pause = (ms: number) => Bun.sleep(ms);
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

/**
 * The moved logins' group (MovedLogins.svelte): its head's ✕ "Dismiss all 2
 * moved logins" acknowledges both; each login is an entry with its own ✕
 * ("Dismiss <name>"). The probe's own account is signed in on the scratch
 * machine, so its entry folds behind "Show 1 signed in everywhere"; the
 * second login ("Design") is still to sign in there and stands open.
 */
const NOTICE = "Probe";
const NOTICE_OPEN = "Design";
const GROUP_DISMISS = /^Dismiss all \d+ moved logins?$/;
const FOLD = /^(Show|Hide) \d+ signed in everywhere$/;
/**
 * Caw's own label: "Needs you, N" (or what he says with nothing waiting),
 * then " · N notices" while any stands. The panel's head reads "Needs you" alone.
 */
const CAW_LABEL =
  /^(Needs you, \d+|All caught up|Reading the fleet|Connecting…|Hub unreachable)( · \d+ notices?)?$/;
/** With the seeded ask and moved login: his rim counts the ask, his label adds the notice. */
const CAW_SEEDED = "Needs you, 1 · 1 notice";
const caw = (nodes: Node[]) =>
  nodes.find((n) => CAW_LABEL.test(n.label ?? "") && n.frame);
const approve = (nodes: Node[]) =>
  nodes.find((n) => n.label?.startsWith("Approve ") === true);
/** The group's ✕, which acknowledges every moved login. */
const dismiss = (nodes: Node[]) =>
  nodes.find((n) => GROUP_DISMISS.test(n.label ?? ""));
/** One entry's ✕, which acknowledges that login alone. */
const dismissEntry = (nodes: Node[], name: string) =>
  nodes.find((n) => n.label === `Dismiss ${name}`);
/** The panel's own labels, from its group on: what a failed read of it reports. */
const panelLabels = (nodes: Node[]) => {
  const at = nodes.findIndex((n) => n.label === "Notifications");
  return nodes
    .slice(Math.max(0, at))
    .map((n) => n.label)
    .filter(Boolean)
    .slice(0, 40)
    .join(" | ");
};
/** The panel's box: its group, or else what it holds. */
const panelBox = (nodes: Node[]): Frame | undefined => {
  const group = nodes.find((n) => n.label === "Notifications" && n.frame);
  if (group?.frame) {
    return group.frame;
  }
  const parts = nodes.filter(
    (n) =>
      n.frame &&
      (n.label === "Needs you" ||
        n.label === "Notices" ||
        n.label === NOTICE ||
        n.label?.startsWith("Approve ") === true ||
        n.label?.startsWith("Deny ") === true ||
        n.label?.startsWith("Dismiss ") === true)
  );
  if (parts.length === 0) {
    return;
  }
  const x0 = Math.min(...parts.map((n) => n.frame?.x ?? 0));
  const y0 = Math.min(...parts.map((n) => n.frame?.y ?? 0));
  const x1 = Math.max(
    ...parts.map((n) => (n.frame?.x ?? 0) + (n.frame?.width ?? 0))
  );
  const y1 = Math.max(
    ...parts.map((n) => (n.frame?.y ?? 0) + (n.frame?.height ?? 0))
  );
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};
/** The probe's own Bash rows' labels ("Print a line echo row-output", "… row-below"). */
const OUR_ROWS = /row-(output|below)/;
/** The transcript's disclosure rows (tool calls), each Collapsed or Expanded. */
const disclosureRows = (nodes: Node[]) =>
  nodes.filter(
    (n) => n.frame && (n.value === "Collapsed" || n.value === "Expanded")
  );
/**
 * A transcript row outside the open panel and the point to tap it at:
 * one wholly below the panel's foot (a phone's panel spans its width), the
 * second Bash call's first; else, on a wide screen, one whose middle line
 * runs out beside the panel, at a point there. None when every row is under it.
 */
function rowOutside(
  nodes: Node[],
  box: Frame
): { target: Node; at: { x: number; y: number } } | undefined {
  // The probe's own Bash rows, not a delegate's chip (which also expands).
  const all = disclosureRows(nodes);
  const ours = all.filter((n) => OUR_ROWS.test(n.label ?? ""));
  const rows = ours.length > 0 ? ours : all;
  const foot = box.y + box.height;
  const [below] = rows
    .filter((n) => (n.frame?.y ?? 0) >= foot + 1)
    .sort(
      (a, b) =>
        Number((b.label ?? "").includes("row-below")) -
        Number((a.label ?? "").includes("row-below"))
    );
  if (below?.frame) {
    return { target: below, at: centre(below.frame) };
  }
  for (const n of rows) {
    const row = n.frame as Frame;
    const at = [0.5, 0.25, 0.1, 0.75, 0.9]
      .map((share) => ({
        x: row.x + row.width * share,
        y: row.y + row.height / 2,
      }))
      .find((point) => !inside(box, point));
    if (at) {
      return { target: n, at };
    }
  }
}
/** The Bash call's transcript row: a disclosure line that names its command. */
const toolRow = (nodes: Node[]) =>
  nodes.find(
    (n) =>
      n.frame &&
      (n.value === "Collapsed" || n.value === "Expanded") &&
      (n.label ?? "").includes("row-output")
  ) ??
  nodes.find(
    (n) => n.frame && (n.value === "Collapsed" || n.value === "Expanded")
  );

const shot = async (udid: string, name: string) => {
  const png = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/s.png" >/dev/null 2>&1
base64 < "$F/s.png"
rm -rf "$F"`);
  const file = join(out, `${name}.png`);
  await Bun.write(file, Buffer.from(png.replace(/\s/g, ""), "base64"));
  console.log(`  capture: ${file}`);
};

/** A new simulator of the newest runtime's `pattern` device (an iPhone Pro, an iPad Pro). */
async function simulator(pattern: string, name: string): Promise<string> {
  const udid = (
    await mac(`read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\\.iOS-(\\d+)-(\\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        if re.fullmatch(r"${pattern}", d["name"]):
            key = (int(m[1]), int(m[2]), d["name"])
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no simulator matching ${pattern}")
print(best[1], best[2])
')
xcrun simctl create "${name}" "$TYPE" "$RUNTIME"`)
  ).trim();
  sims.push(udid);
  return udid;
}

type Kind = "phone" | "pad";

/**
 * Launches the app on `udid`, taps Caw and reads the panel; captures it light
 * and dark. Its box, or nothing when the panel never opened.
 */
async function openPanel(
  kind: Kind,
  udid: string,
  port: number,
  rowSession: string
): Promise<Frame | undefined> {
  await mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --wifiBars 3
xcrun simctl install ${udid} "${app}"
xcrun simctl ui ${udid} appearance light
xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${rowSession} -shell-probe >/dev/null`);
  const head = await until(
    `${kind}: Caw counting the ask`,
    async () => caw(await tree(udid)),
    (node) => node?.label === CAW_SEEDED,
    180_000
  ).catch(() => undefined);
  const rest = await read(udid);
  let { nodes } = rest;
  check(
    `${kind}: Caw's rim counts needs-you only`,
    head?.label === CAW_SEEDED,
    `Caw reads "${caw(nodes)?.label ?? "not found"}" with one ask and one notice waiting`
  );
  if (!head?.frame) {
    return;
  }
  check(
    `${kind}: the panel starts closed`,
    !(approve(nodes) || dismiss(nodes)),
    approve(nodes)
      ? "an Approve button is on screen before Caw was tapped"
      : "no Approve or Dismiss on screen"
  );
  const row = toolRow(nodes);
  console.log(
    `  ${kind}: transcript row ${row ? `"${row.label}" ${row.value} at ${JSON.stringify(row.frame)}` : "not found"}`
  );

  // At rest on a phone: his glass against the tabs and the floor.
  if (kind === "phone") {
    await restChecks(udid);
  }
  // The screen before the panel opens: what stands where the glass will flare.
  const closed = await pixels(udid, rest.screen.width);
  await censusNow(kind, udid);
  await tap(udid, centre(head.frame));
  await pause(1200);
  nodes = await tree(udid);
  const box = panelBox(nodes);
  await hangChecks(kind, udid, closed);
  check(
    `${kind}: tapping Caw opens the panel`,
    caw(nodes)?.value === "Open" && box !== undefined,
    `Caw's value "${caw(nodes)?.value ?? ""}", panel ${box ? JSON.stringify(box) : "not found"}`
  );
  const ask = approve(nodes);
  check(
    `${kind}: the panel lists the needs-you ask`,
    ask !== undefined &&
      nodes.some((n) => n.label?.startsWith("Deny ") === true),
    ask ? `"${ask.label}" and its Deny` : "no Approve button"
  );
  // On the iPad the group is read here, its fold opened. On the phone its
  // panel spans the screen's width and the open fold stands it over every
  // transcript row, so the phone reads it after the tap through (`pass`).
  if (kind === "pad") {
    await movedLoginsListed(kind, udid, nodes, ask);
  }
  await shot(udid, `${kind}-panel-light`);
  await mac(`xcrun simctl ui ${udid} appearance dark`);
  await pause(1500);
  await shot(udid, `${kind}-panel-dark`);
  await mac(`xcrun simctl ui ${udid} appearance light`);
  await pause(1500);
  if (kind === "phone") {
    await recordOpenClose(udid, head.frame);
  }
  return box;
}

/** Where the panel hangs, as the app logged it (CawPanel `place`), in the window's points. */
interface Hanging {
  flare: number;
  glass: Frame;
  panel: Frame;
}
const HANGS =
  /panel hangs: glass (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) panel (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) flare (-?[\d.]+)/;
async function hanging(udid: string): Promise<Hanging | undefined> {
  const text = await mac(
    `xcrun simctl spawn ${udid} log show --last 2m --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "CawPanel"' | grep 'panel hangs' | tail -1`
  ).catch(() => "");
  const m = HANGS.exec(text);
  if (!m) {
    return;
  }
  const n = m.slice(1).map(Number);
  return {
    glass: { x: n[0], y: n[1], width: n[2], height: n[3] },
    panel: { x: n[4], y: n[5], width: n[6], height: n[7] },
    flare: n[8],
  };
}

/** A screenshot's pixels (a BMP, read without a decoder), and the screen's width in points. */
interface Pixels {
  bmp: Buffer;
  points: number;
}
async function pixels(udid: string, points: number): Promise<Pixels> {
  const text = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/s.png" >/dev/null 2>&1
sips -s format bmp "$F/s.png" --out "$F/s.bmp" >/dev/null 2>&1
base64 < "$F/s.bmp"
rm -rf "$F"`);
  return { bmp: Buffer.from(text.replace(/\s/g, ""), "base64"), points };
}
/** The mean colour, [r, g, b] 0–255, of the 2pt square centred on a point. */
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
    let py = Math.round((y - 1) * scale);
    py < Math.round((y + 1) * scale);
    py += 1
  ) {
    const row = signed > 0 ? height - 1 - py : py;
    for (
      let px = Math.round((x - 1) * scale);
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

/** The phone's row as the shell drew it (`-shell-probe`'s line): Caw's glass, the first tab, the transcript's top. */
const SHELL_LINE =
  /caw=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)x(-?[\d.]+) .*firstTab=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)x(-?[\d.]+) transcriptTop=(-?[\d.]+)/;

/** The phone's row in the window's points: Caw's glass, the first tab, and the row's floor. */
interface Row {
  floor: number;
  glassBottom: number;
  glassTop: number;
  tabBottom: number;
  tabTop: number;
}
async function phoneRow(udid: string): Promise<Row | undefined> {
  const text = await mac(
    `xcrun simctl spawn ${udid} log show --last 30s --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe"' | grep 'firstTab=' | tail -1`
  ).catch(() => "");
  const m = SHELL_LINE.exec(text);
  if (!m) {
    return;
  }
  const [, glassTop, , glassHeight, , tabTop, , tabHeight, floor] = m
    .slice(1)
    .map(Number);
  const row = {
    glassTop,
    glassBottom: glassTop + glassHeight,
    tabTop,
    tabBottom: tabTop + tabHeight,
    floor,
  };
  console.log(
    `  phone row (pt): glass top ${row.glassTop} bottom ${row.glassBottom}; tab top ${row.tabTop} bottom ${row.tabBottom}; tab row's floor (transcript top) ${row.floor}`
  );
  return row;
}

/**
 * At rest, Caw's glass top stands where the tabs' tops do (owner: "the
 * spacing above the tabs isn't equal to the spacing from caw to the top")
 * and its foot stays clear of the row's floor, the transcript's top (owner:
 * "caw is still touching the transcript").
 */
async function restChecks(udid: string) {
  const row = await phoneRow(udid);
  check(
    "phone: at rest Caw's glass top is the tabs' top and his foot clears the floor",
    row !== undefined &&
      Math.abs(row.glassTop - row.tabTop) <= 0.5 &&
      row.glassBottom < row.floor - 0.5,
    row
      ? `glass top ${row.glassTop} vs tab top ${row.tabTop}; ${(row.floor - row.glassBottom).toFixed(2)}pt between his foot and the floor`
      : "no '-shell-probe' line with Caw's glass and a tab"
  );
}

/**
 * The panel hangs from the glass as one shape (DESIGN.md, "Caw's panel"):
 * on a phone from the tab row's floor, through the glass's neck, covering
 * no tab; on a wide screen from the glass's foot with no gap. Its trailing
 * side runs straight down from the glass's trailing flank, and the glass's
 * leading foot flares out into the panel's top edge in the panel's surface.
 */
async function hangChecks(kind: Kind, udid: string, closed: Pixels) {
  const row = kind === "phone" ? await phoneRow(udid) : undefined;
  const hung = await hanging(udid);
  if (!hung) {
    check(
      `${kind}: the panel hangs from the glass's foot`,
      false,
      "no 'panel hangs' line in the app's log"
    );
    return;
  }
  const { glass, panel, flare } = hung;
  const foot = glass.y + glass.height;
  if (kind === "phone") {
    check(
      "phone: the panel hangs from the tab row's floor",
      row !== undefined && Math.abs(panel.y - row.floor) <= 0.5,
      row
        ? `floor y ${row.floor}, panel top y ${panel.y.toFixed(2)}, glass foot y ${foot.toFixed(2)} (the neck ${(panel.y - foot).toFixed(2)}pt)`
        : "no '-shell-probe' line with the row's floor"
    );
    check(
      "phone: no tab reaches into the open panel",
      row !== undefined && row.tabBottom <= panel.y + 0.5,
      row
        ? `the tabs' foot y ${row.tabBottom}, panel top y ${panel.y.toFixed(2)}`
        : "no '-shell-probe' line with a tab"
    );
  } else {
    check(
      `${kind}: the panel hangs from the glass's foot, 0pt between`,
      Math.abs(panel.y - foot) <= 0.5,
      `glass foot y ${foot.toFixed(2)}, panel top y ${panel.y.toFixed(2)}`
    );
  }
  check(
    `${kind}: its trailing side runs straight down from the glass's`,
    Math.abs(panel.x + panel.width - (glass.x + glass.width)) <= 0.5,
    `glass trailing x ${(glass.x + glass.width).toFixed(2)}, panel trailing x ${(panel.x + panel.width).toFixed(2)}`
  );
  // Inside the flare: just left of the glass's leading flank, just above
  // where it meets the panel's top edge (past the neck on a phone).
  const open = await pixels(udid, closed.points);
  const inFlare = { x: glass.x - 3, y: panel.y - 2 };
  const flareOpen = colourAt(open, inFlare.x, inFlare.y);
  const flareShut = colourAt(closed, inFlare.x, inFlare.y);
  // The panel's own surface: the middle of its top padding, clear of its
  // rounded corners (a corner sample read the corner's cut) and its text.
  const surface = colourAt(open, panel.x + panel.width / 2, panel.y + 4);
  check(
    `${kind}: the glass's foot flares out into the panel (flare ${flare}pt)`,
    apart(flareOpen, surface) <= 10,
    `at (${inFlare.x.toFixed(1)}, ${inFlare.y.toFixed(1)}): rgb(${flareOpen}) open, rgb(${flareShut}) shut; the panel's surface rgb(${surface})`
  );
}

/**
 * A recording of the panel closing and opening twice on the phone
 * (simctl's recordVideo, at the display's rate), saved beside the captures,
 * with ffprobe's word on its frames where the Mac has ffprobe.
 */
async function recordOpenClose(udid: string, cawFrame: Frame) {
  const file = `/tmp/caw-panel-${udid}.mov`;
  const pid = (
    await mac(
      `rm -f ${file}; nohup xcrun simctl io ${udid} recordVideo --codec=h264 --force ${file} >/dev/null 2>&1 </dev/null & echo $!`
    )
  ).trim();
  await pause(1500);
  // Close, open, close, open: it ends open, as the pass that follows needs.
  for (const step of ["close", "open", "close", "open"]) {
    // biome-ignore lint/performance/noAwaitInLoops: each tap waits for the one before it to play out
    await tap(udid, centre(cawFrame));
    await pause(1200);
    console.log(`  phone: recorded ${step}`);
  }
  await mac(`kill -INT ${pid}
for i in $(seq 1 30); do kill -0 ${pid} 2>/dev/null || break; sleep 0.5; done`).catch(
    () => ""
  );
  const movie = await mac(`base64 < ${file}; rm -f ${file}`).catch(() => "");
  const saved = join(out, "phone-open-close.mov");
  const bytes = Buffer.from(movie.replace(/\s/g, ""), "base64");
  if (bytes.length > 0) {
    await Bun.write(saved, bytes);
  }
  // simctl writes a frame only when the screen changes: while the panel
  // moves, one per refresh. The rate is read off the frames inside motion
  // (gaps of 100ms or less), from the movie's own frame table.
  const timing = bytes.length > 0 ? frameTiming(bytes) : undefined;
  const moving = (timing?.gaps ?? [])
    .filter((gap) => gap <= 0.1)
    .sort((a, b) => a - b);
  const median = moving[Math.floor(moving.length / 2)];
  const fps = median ? 1 / median : 0;
  check(
    "phone: the open and close recording runs at 60fps",
    fps >= 55,
    timing
      ? `${saved}: ${timing.gaps.length + 1} frames over ${timing.seconds.toFixed(1)}s; ${moving.length} frames in motion at ${fps.toFixed(1)}fps (median gap ${((median ?? 0) * 1000).toFixed(1)}ms)`
      : `no readable recording (${bytes.length} bytes)`
  );
}

/** One box of an MP4 / QuickTime file: its type and its payload's bounds. */
interface Mp4Box {
  end: number;
  start: number;
  type: string;
}
function* mp4Boxes(buf: Buffer, from: number, to: number): Generator<Mp4Box> {
  let at = from;
  while (at + 8 <= to) {
    let size = buf.readUInt32BE(at);
    let header = 8;
    if (size === 1) {
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = to - at;
    }
    if (size < header) {
      return;
    }
    yield {
      type: buf.toString("latin1", at + 4, at + 8),
      start: at + header,
      end: at + size,
    };
    at += size;
  }
}
const childBox = (buf: Buffer, parent: Mp4Box, type: string) => {
  for (const box of mp4Boxes(buf, parent.start, parent.end)) {
    if (box.type === type) {
      return box;
    }
  }
};

/**
 * The video track's frame timing (moov › trak › mdia: `hdlr` "vide",
 * `mdhd`'s timescale, `minf › stbl › stts`'s frame durations): each gap
 * between frames in seconds, and the length of the whole.
 */
function frameTiming(
  buf: Buffer
): { gaps: number[]; seconds: number } | undefined {
  const moov = [...mp4Boxes(buf, 0, buf.length)].find(
    (box) => box.type === "moov"
  );
  if (!moov) {
    return;
  }
  for (const trak of mp4Boxes(buf, moov.start, moov.end)) {
    const mdia = trak.type === "trak" ? childBox(buf, trak, "mdia") : undefined;
    const hdlr = mdia && childBox(buf, mdia, "hdlr");
    if (
      !(mdia && hdlr) ||
      buf.toString("latin1", hdlr.start + 8, hdlr.start + 12) !== "vide"
    ) {
      continue;
    }
    const mdhd = childBox(buf, mdia, "mdhd");
    const minf = childBox(buf, mdia, "minf");
    const stbl = minf && childBox(buf, minf, "stbl");
    const stts = stbl && childBox(buf, stbl, "stts");
    if (!(mdhd && stts)) {
      return;
    }
    const gaps = frameGaps(buf, mdhd, stts);
    return { gaps, seconds: gaps.reduce((sum, gap) => sum + gap, 0) };
  }
}

/** `stts`'s frame durations in seconds on `mdhd`'s timescale, the last frame's dropped. */
function frameGaps(buf: Buffer, mdhd: Mp4Box, stts: Mp4Box): number[] {
  const timescale =
    buf[mdhd.start] === 1
      ? buf.readUInt32BE(mdhd.start + 20)
      : buf.readUInt32BE(mdhd.start + 12);
  const entries = buf.readUInt32BE(stts.start + 4);
  const gaps: number[] = [];
  for (let k = 0; k < entries; k += 1) {
    const count = buf.readUInt32BE(stts.start + 8 + k * 8);
    const delta = buf.readUInt32BE(stts.start + 12 + k * 8) / timescale;
    for (let n = 0; n < count; n += 1) {
      gaps.push(delta);
    }
  }
  // The last frame's duration is how long it stays up, not a gap to a next one.
  gaps.pop();
  return gaps;
}

/**
 * Nothing covers the screen: the transcript row outside the open panel is
 * what a finger lands on there, and a tap on it both reaches it and closes
 * the panel.
 */
async function tapThrough(name: string, udid: string, given: Frame) {
  let nodes = await tree(udid);
  // The panel as it stands now: opening its fold made it taller than the
  // box read when it opened.
  const box = panelBox(nodes) ?? given;
  const found = rowOutside(nodes, box);
  if (!found) {
    const rows = disclosureRows(nodes);
    check(
      `${name}: nothing covers the transcript row outside the panel`,
      false,
      rows.length === 0
        ? "no transcript row to tap"
        : `no transcript row stands outside the panel ${JSON.stringify(box)}: ${rows.map((n) => `"${n.label ?? ""}" ${JSON.stringify(n.frame)}`).join(", ")}; nothing was tapped`
    );
    return;
  }
  const { target, at } = found;
  const row = target.frame as Frame;
  const covered = inside(box, at);
  // What else stands at that point: every element there but the row, what
  // holds it (its frame takes in the row's) and what it holds.
  const over = nodes.filter(
    (n) =>
      n.frame &&
      inside(n.frame, at) &&
      !encloses(n.frame, row) &&
      !encloses(row, n.frame)
  );
  check(
    `${name}: nothing covers the transcript row outside the panel`,
    !covered && over.length === 0,
    covered
      ? `no point of the row ${JSON.stringify(row)} is outside the panel ${JSON.stringify(box)}`
      : `at ${JSON.stringify(at)} on the row "${target.label ?? ""}" ${JSON.stringify(row)}: ${over.length === 0 ? "the row alone" : `also ${said(over)}; their frames ${over.map((n) => JSON.stringify(n.frame)).join(", ")}`}`
  );
  const before = target.value;
  await tap(udid, at);
  await pause(1500);
  nodes = await tree(udid);
  const after = disclosureRows(nodes).find(
    (n) => n.label === target.label
  )?.value;
  check(
    `${name}: a tap on the row reaches the row`,
    after !== undefined && after !== before,
    `the row went ${before} → ${after ?? "gone"}`
  );
  check(
    `${name}: the same tap closes the panel`,
    !(approve(nodes) || dismiss(nodes)) && caw(nodes)?.value !== "Open",
    approve(nodes)
      ? "the panel's Approve is still on screen"
      : `closed; Caw's value "${caw(nodes)?.value ?? ""}"`
  );
  await shot(udid, `${name}-after-tap-light`);
}

/**
 * A press on the ask's row itself, off its buttons, opens what it waits in:
 * the panel closes and "Needs probe" comes to the front, its pending
 * "Make a file" call in its transcript.
 */
async function chooseRow(kind: Kind, udid: string) {
  let nodes = await tree(udid);
  const head = caw(nodes);
  if (head?.value !== "Open" && head?.frame) {
    await tap(udid, centre(head.frame));
    await pause(1200);
    nodes = await tree(udid);
  }
  const box = panelBox(nodes);
  const title = nodes.find(
    (n) =>
      n.label === "Needs probe" &&
      n.frame &&
      box &&
      inside(box, centre(n.frame))
  );
  if (!title?.frame) {
    check(
      `${kind}: a press on the ask's row opens its session`,
      false,
      'no "Needs probe" title in the open panel'
    );
    return;
  }
  await tap(udid, centre(title.frame));
  await pause(2500);
  nodes = await tree(udid);
  const closed =
    !(approve(nodes) || dismiss(nodes)) && caw(nodes)?.value !== "Open";
  const call = nodes.find((n) => (n.label ?? "").includes(ASK));
  check(
    `${kind}: a press on the ask's row opens its session`,
    closed && call !== undefined,
    `${closed ? "the panel closed" : "the panel is still open"}; ${call ? `"${call.label}" on screen` : "no pending call of Needs probe on screen"}; pressed at ${JSON.stringify(centre(title.frame))} on "${title.label}" ${JSON.stringify(title.frame)}`
  );
  if (!(closed && call !== undefined)) {
    await pressEvidence(kind, udid);
  }
  await shot(udid, `${kind}-chosen-light`);
}

/**
 * The moved logins' group under the ask, once the fold holding the login
 * signed in everywhere is open: its head and ✕, Design's entry and ✕, and
 * the probe's entry with its ✕ and where it came from.
 */
async function movedLoginsListed(
  kind: Kind,
  udid: string,
  before: Node[],
  ask: Node | undefined
) {
  let nodes = before;
  const fold = nodes.find((n) => FOLD.test(n.label ?? "") && n.frame);
  if (fold?.frame && fold.label?.startsWith("Show ")) {
    await tap(udid, centre(fold.frame));
    await pause(1200);
    nodes = await tree(udid);
  }
  const group = dismiss(nodes);
  const from = nodes.find(
    (n) => n.label?.startsWith("from Claude Code on ") === true
  );
  const listed =
    nodes.some((n) => n.label === "2 logins moved into CawCo") &&
    dismissEntry(nodes, NOTICE_OPEN) !== undefined &&
    dismissEntry(nodes, NOTICE) !== undefined &&
    nodes.some((n) => n.label === NOTICE) &&
    from !== undefined;
  const under =
    (group?.frame?.y ?? 0) > (ask?.frame?.y ?? Number.POSITIVE_INFINITY) - 1;
  check(
    `${kind}: the panel lists the moved logins' group, under Needs you`,
    group !== undefined && listed && under,
    group
      ? `"${group.label}", "${NOTICE_OPEN}" ${dismissEntry(nodes, NOTICE_OPEN) ? "with" : "without"} its ✕, the fold ${fold ? `"${fold.label}" opened` : "not found"}, "${NOTICE}" ${dismissEntry(nodes, NOTICE) ? "with" : "without"} its ✕, "${from?.label ?? "no from-line"}"; the group's ✕ at y ${Math.round(group.frame?.y ?? 0)}, the ask's Approve at y ${Math.round(ask?.frame?.y ?? 0)}`
      : `no group ✕ ("Dismiss all N moved logins"); the panel's labels: ${panelLabels(nodes)}`
  );
}

/**
 * The phone's read of the moved logins' group, after the tap through: the
 * panel (closed by that tap) opened again, its fold opened for the group's
 * checks, and left open for the press on the ask's row (`chooseRow`).
 */
async function movedLoginsAfterTap(kind: Kind, udid: string) {
  let nodes = await tree(udid);
  const head = caw(nodes);
  if (head?.value !== "Open" && head?.frame) {
    await tap(udid, centre(head.frame));
    await pause(1200);
    nodes = await tree(udid);
  }
  await movedLoginsListed(kind, udid, nodes, approve(nodes));
}

/**
 * Design's entry ✕ acknowledges that login alone (the group stays with the
 * other); then the group's ✕ acknowledges the rest. The screen as it stands after.
 */
async function dismissMovedLogins(kind: Kind, udid: string): Promise<Node[]> {
  let nodes = await tree(udid);
  const entry = dismissEntry(nodes, NOTICE_OPEN);
  if (entry?.frame) {
    await tap(udid, centre(entry.frame));
    await pause(1500);
  }
  nodes = await tree(udid);
  const entryStays = dismissEntry(nodes, NOTICE_OPEN) !== undefined;
  const groupLeft = dismiss(nodes);
  check(
    `${kind}: an entry's ✕ dismisses that login alone`,
    entry !== undefined && !entryStays && groupLeft !== undefined,
    entry === undefined
      ? `no "Dismiss ${NOTICE_OPEN}" to tap; the panel's labels: ${panelLabels(nodes)}`
      : `"${NOTICE_OPEN}" ${entryStays ? "still listed" : "gone"}; the group ${groupLeft ? `stays ("${groupLeft.label}")` : "is gone too"}`
  );
  const cross = dismiss(nodes);
  if (cross?.frame) {
    await tap(udid, centre(cross.frame));
    await pause(1500);
  }
  nodes = await tree(udid);
  const stays =
    dismiss(nodes) !== undefined || nodes.some((n) => n.label === NOTICE);
  check(
    `${kind}: the group's ✕ dismisses every moved login`,
    cross !== undefined && !stays && approve(nodes) !== undefined,
    cross === undefined
      ? `no group ✕ to tap; the panel's labels: ${panelLabels(nodes)}`
      : `${stays ? "still listed" : "gone"}; the ask ${approve(nodes) ? "is" : "is not"} still listed`
  );
  return nodes;
}

/**
 * Opens the panel if it is closed (a tap on Caw toggles it, so an open
 * panel is left as it is), dismisses the moved logins by their ✕s and
 * approves the ask.
 */
async function answerFromPanel(kind: Kind, udid: string) {
  let nodes = await tree(udid);
  const head = caw(nodes);
  if (caw(nodes)?.value !== "Open") {
    if (!head?.frame) {
      check(
        `${kind}: the moved logins' ✕s dismiss them`,
        false,
        "Caw not found to open the panel"
      );
      return;
    }
    await tap(udid, centre(head.frame));
    await pause(1200);
  }
  nodes = await dismissMovedLogins(kind, udid);
  const yes = approve(nodes);
  const tapped = Date.now();
  if (yes?.frame) {
    await tap(udid, centre(yes.frame));
  }
  // The hub's word first, then the panel's, each timed from the tap.
  const hubAt = await until(
    `${kind}: the hub settling the ask`,
    async () => JSON.stringify(await fleet.api<unknown>("/api/pending")),
    (text) => !text.includes(ASK),
    60_000
  )
    .then(() => Date.now() - tapped)
    .catch(() => undefined);
  const panelAt = await untilGone(
    `${kind}: the ask leaving the panel`,
    async () => approve(await tree(udid)),
    60_000
  )
    .then(() => Date.now() - tapped)
    .catch(() => undefined);
  const secs = (ms: number | undefined) =>
    ms === undefined
      ? "not within 60s"
      : `${(ms / 1000).toFixed(1)}s after the tap`;
  check(
    `${kind}: Approve answers the ask from the panel`,
    yes !== undefined && hubAt !== undefined && panelAt !== undefined,
    `${yes ? "Approve tapped" : "no Approve to tap"}; the hub settled it ${secs(hubAt)}; it left the panel ${secs(panelAt)}`
  );
  if (panelAt === undefined) {
    await answerEvidence(udid);
  }
  await shot(udid, `${kind}-answered-light`);
}

const STAGE_WORDS =
  /^(Sending…|The hub has it|The session has it|Couldn't send)/;

/**
 * Why an answered ask stayed in the panel: the row's own stage words, and the
 * app's log of the answer, its command's stages and the hub's settle frame.
 */
async function answerEvidence(udid: string) {
  const nodes = await tree(udid);
  const stage = nodes.find((n) => STAGE_WORDS.test(n.label ?? ""));
  console.log(`  the ask's row says: ${stage?.label ?? "no stage words"}`);
  // Every "Approve …" the tree holds, and where: the panel's, or another surface's.
  for (const node of nodes.filter(
    (n) => n.label?.startsWith("Approve") === true
  )) {
    console.log(
      `  "${node.label}" (${node.id ?? "no id"}) at ${JSON.stringify(node.frame)}`
    );
  }
  console.log(
    `  Caw reads "${caw(nodes)?.label ?? "not found"}" (${caw(nodes)?.value ?? "no value"})`
  );
  const lines = await mac(
    `xcrun simctl spawn ${udid} log show --last 3m --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Permission" OR category == "Ledger" OR category == "Hub" OR category == "CawPanel")' | tail -60`
  ).catch((error) => String(error));
  console.log("  app log (Permission, Ledger, Hub, CawPanel), last 3 minutes:");
  for (const line of lines
    .split("\n")
    .filter((one) => one.includes("dev.cawco.app"))) {
    console.log(`    ${line.replace(LOG_PREFIX, "")}`);
  }
}
const LOG_PREFIX = /^.*\[dev\.cawco\.app:/;

/**
 * The same with a delegate chip's panel open over the tray (iPad, where the
 * composer stands 720pt wide and its row stands well under the panel): the
 * panel's ground is no box of its own over the transcript, so only the panel
 * stands there, and a tap on the row reaches it and closes the panel.
 */
async function trayThrough(udid: string) {
  const chip = (await tree(udid)).find((n) =>
    (n.label ?? "").startsWith(`${TRAY_TITLE},`)
  );
  check(
    "pad: the delegate's chip stands in the tray",
    Boolean(chip?.frame),
    chip ? `"${chip.label}" at ${JSON.stringify(chip.frame)}` : "no chip"
  );
  if (!chip?.frame) {
    return;
  }
  await tap(udid, centre(chip.frame));
  await pause(1500);
  const opened = (await tree(udid)).find((n) => n.label === chip.label);
  check(
    "pad: a press on the chip opens its panel",
    opened?.value === "Expanded",
    `the chip reads ${opened?.value ?? "gone"}`
  );
  await tapThrough("pad-tray", udid, { x: 0, y: 0, width: 0, height: 0 });
  const after = (await tree(udid)).find((n) => n.label === chip.label);
  check(
    "pad-tray: the same tap closes the chip's panel",
    after?.value === "Collapsed",
    `the chip reads ${after?.value ?? "gone"}`
  );
}

/**
 * One device's pass. `last`: the pass that also dismisses the notice and
 * approves the ask, which take them away for every device after it. A read
 * that timed out waiting for the app to go idle has the app's word on why
 * printed under it (`idleEvidence`).
 */
async function pass(
  kind: Kind,
  udid: string,
  port: number,
  rowSession: string,
  last: boolean
) {
  try {
    const box = await openPanel(kind, udid, port, rowSession);
    if (!box) {
      return;
    }
    await tapThrough(kind, udid, box);
    if (kind === "pad") {
      await trayThrough(udid);
    } else {
      await movedLoginsAfterTap(kind, udid);
    }
    if (last) {
      await answerFromPanel(kind, udid);
    } else {
      // Answering takes the ask away, so its row is chosen on the pass that does not answer it.
      await chooseRow(kind, udid);
    }
  } catch (error) {
    if (hung(String(error))) {
      await idleEvidence(kind, udid);
    }
    throw error;
  }
}

/**
 * Maestro's words for a read that waited on the app: XCTest's two timeouts
 * (Maestro's AppError: a UI query's XCTFuture 1000, the main run loop busy),
 * the CLI's DriverTimeout, and its insight for a read that runs long.
 */
const HUNG_WORDS =
  /Timed out while evaluating UI query|main thread busy|Maestro driver timed out|taking longer than usual/;
/** A read that failed after this long waited on the app, whatever it said. */
const HUNG_MS = 60_000;
/** The shared wrapper's word on how long a failed read ran (`screenRead`). */
const FAILED_AFTER = /failed after (\d+) ms/;
const hung = (message: string) =>
  HUNG_WORDS.test(message) ||
  Number(FAILED_AFTER.exec(message)?.[1] ?? 0) > HUNG_MS;
/** `sample`'s seconds on the app's process. */
const SAMPLE_SECONDS = 3;
/** A call graph line's sample count, after its tree marks. */
const GRAPH_COUNT = /^[\s+!:|]*(\d+) /;
/**
 * The share of the main thread's samples a frame needs to be printed: a
 * fifth, so the graph shows past where a loop's stack splits (at a half, run
 * 13's stopped at `UIScrollView layoutSubviews`, 935 of 1796).
 */
const HOT_SHARE = 0.2;
/**
 * What the app's main thread is doing while a read waits on it: macOS
 * `sample` on the simulator app's process (a process of the Mac's own), the
 * main thread's call graph cut to its hot path (the frames in at least
 * `HOT_SHARE` of its samples), then the heaviest tops of stack over the
 * whole process.
 */
async function sampleApp(udid: string) {
  const text =
    await mac(`PID=$(xcrun simctl spawn ${udid} launchctl list | awk '/UIKitApplication:dev\\.cawco\\.app/ { print $1; exit }')
if [ -z "$PID" ] || [ "$PID" = "-" ]; then echo "NO PID"; exit 0; fi
F=$(mktemp)
sample "$PID" ${SAMPLE_SECONDS} -mayDie -file "$F" >/dev/null 2>&1 || true
echo "PID $PID"
awk '/com\\.apple\\.main-thread/ { on = 1; print; next } on && /^ {4}[0-9]+ Thread_/ { on = 0 } on { print }' "$F"
echo "TOPS"
awk '/^Sort by top of stack/ { on = 1; next } on && NF == 0 { exit } on { print }' "$F" | head -15
rm -f "$F"`).catch((error) => String(error));
  const lines = text.split("\n");
  const tops = lines.indexOf("TOPS");
  const graph = lines.slice(
    lines.findIndex((one) => one.includes("com.apple.main-thread")),
    tops < 0 ? undefined : tops
  );
  const total = Number(GRAPH_COUNT.exec(graph[0] ?? "")?.[1] ?? 0);
  const clean = (line: string) =>
    line.replace(/\s+\[0x[0-9a-f,]+\]/g, "").slice(0, 240);
  console.log(
    `  ${udid}: a read out for ${SAMPLE_AFTER_MS / 1000}s; ${lines[0]?.startsWith("PID") ? `the app (${lines[0]}) sampled for ${SAMPLE_SECONDS}s, its main thread's hot path (frames in at least ${HOT_SHARE * 100}% of its ${total} samples):` : `not sampled: ${text.trim().slice(0, 300)}`}`
  );
  for (const line of graph.filter(
    (one) => Number(GRAPH_COUNT.exec(one)?.[1] ?? 0) >= total * HOT_SHARE
  )) {
    console.log(`    ${clean(line)}`);
  }
  if (tops >= 0) {
    console.log("    the process's heaviest tops of stack:");
    for (const line of lines.slice(tops + 1).filter(Boolean)) {
      console.log(`      ${clean(line.trim())}`);
    }
  }
}

/** The app's latest census line before Caw is tapped: what was looping, and how often the shell laid out, while the screen was at rest. */
async function censusNow(kind: Kind, udid: string) {
  const line = await mac(
    `xcrun simctl spawn ${udid} log show --last 15s --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Probe" AND eventMessage BEGINSWITH "probe loops"' | tail -1`
  ).catch((error) => String(error));
  console.log(
    `  ${kind}: before Caw is tapped, ${LOOPS_LINE.exec(line)?.[0] ?? `no 'probe loops' line (${line.trim().slice(0, 200)})`}`
  );
}

/**
 * A press on the ask's row that did not open it: the panel's own log of the
 * press over the last 30s (CawPanel NeedRow, DEBUG): where it came down,
 * whether it lifted inside or was cancelled, whether the row was chosen,
 * and whether the rows were made again under it.
 */
async function pressEvidence(kind: Kind, udid: string) {
  const text = await mac(
    `xcrun simctl spawn ${udid} log show --last 30s --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "CawPanel" AND (eventMessage BEGINSWITH "panel row" OR eventMessage BEGINSWITH "panel rows")' | tail -20`
  ).catch((error) => String(error));
  const lines = text.split("\n").filter((one) => one.includes("dev.cawco.app"));
  console.log(
    `  ${kind}: the panel's log of the press, last 30s (${lines.length} lines):`
  );
  for (const line of lines) {
    console.log(
      `    ${line.split(" ")[1] ?? ""} ${line.replace(LOG_PREFIX, "")}`
    );
  }
}

/** How far back the app's log is read after a hung read: past the 187s one read has waited. */
const EVIDENCE_WINDOW = "6m";
/** The app's once-a-second census under `-shell-probe` (ShellController `probeShell`, `LoopCensus`). */
const LOOPS_LINE = /probe loops n=\d+.*/;

/**
 * Why the app never went idle, from its own log over `EVIDENCE_WINDOW`.
 * XCTest takes an app with an animation running as never idle
 * (rdar://25562105), and gives up on one whose main thread stays busy. The
 * last `probe loops` lines, with their times: each counts the shell's
 * layout passes, the panel's placings and its rows remade since the line
 * before, and lines that stop mean the main thread stopped turning. Then
 * every `Loops` on and off (`LoopLog`), and how many times the panel was
 * placed (`panel hangs`), which runs into thousands when a layout pass
 * keeps setting off another.
 */
async function idleEvidence(kind: Kind, udid: string) {
  // Counted on the Mac: a layout loop can log the panel's place thousands of times.
  const text = await mac(`F=$(mktemp)
xcrun simctl spawn ${udid} log show --last ${EVIDENCE_WINDOW} --style compact --predicate 'subsystem == "dev.cawco.app" AND ((category == "Probe" AND eventMessage BEGINSWITH "probe loops") OR category == "Loops" OR (category == "CawPanel" AND eventMessage BEGINSWITH "panel hangs"))' > "$F" || true
echo "PLACED $(grep -c 'panel hangs' "$F" || true) $(grep 'panel hangs' "$F" | head -1 | cut -d' ' -f2) $(grep 'panel hangs' "$F" | tail -1 | cut -d' ' -f2)"
grep 'probe loops' "$F" | tail -10 || true
echo "LOOPS $(grep -c ':Loops]' "$F" || true)"
grep ':Loops]' "$F" | tail -20 || true
rm -f "$F"`).catch((error) => String(error));
  const lines = text.split("\n");
  const placed = (lines.find((one) => one.startsWith("PLACED ")) ?? "PLACED ?")
    .split(" ")
    .slice(1);
  const census = lines.filter((one) => LOOPS_LINE.test(one));
  const loops = lines.filter((one) => one.includes(":Loops]"));
  const at = (line: string) => line.split(" ")[1] ?? "";
  console.log(
    `  ${kind}: why the app never went idle, from its log over the last ${EVIDENCE_WINDOW}:`
  );
  console.log(`    the last ${census.length} 'probe loops' lines:`);
  for (const line of census) {
    console.log(`      ${at(line)} ${LOOPS_LINE.exec(line)?.[0] ?? ""}`);
  }
  console.log(
    `    ${(lines.find((one) => one.startsWith("LOOPS ")) ?? "LOOPS ?").slice(6)} loop on/off lines, the last ${loops.length}:`
  );
  for (const line of loops) {
    console.log(`      ${at(line)} ${line.replace(LOG_PREFIX, "")}`);
  }
  console.log(
    `    the panel placed ${placed[0] ?? "?"} times${placed[1] ? `, ${placed[1]} to ${placed[2]}` : ""}`
  );
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

  const rowSession = await fleet.spawn("claude", "Panel probe");
  // A long turn first, so the Bash row stands below the open panel.
  await fleet.send(rowSession, `${INTRO}: say a lot.`);
  await until(
    "the row session's intro turn answered",
    async () =>
      JSON.stringify(
        await fleet.api<unknown>(`/api/instances/${rowSession}/transcript`)
      ),
    (text) => text.includes("Intro done."),
    180_000
  );
  await fleet.send(rowSession, `${ROW}: print a line.`);
  await until(
    "the row session's Bash call answered",
    async () =>
      JSON.stringify(
        await fleet.api<unknown>(`/api/instances/${rowSession}/transcript`)
      ),
    (text) => text.includes("Row done."),
    180_000
  );
  await fleet.send(rowSession, `${ROW_BELOW}: print another line.`);
  await until(
    "the row session's second Bash call answered",
    async () =>
      JSON.stringify(
        await fleet.api<unknown>(`/api/instances/${rowSession}/transcript`)
      ),
    (text) =>
      text.includes("echo row-below") && text.split("Row done.").length > 2,
    180_000
  );
  const askSession = await fleet.spawn("claude", "Needs probe", fleet.workdir, {
    permissionMode: "default",
  });
  await fleet.send(askSession, `${ASK}: make a file.`);
  const pending = await until(
    "the hub parking the Bash permission ask",
    async () => JSON.stringify(await fleet.api<unknown>("/api/pending")),
    (text) => text.includes(askSession) && text.includes(ASK),
    180_000
  );
  check(
    "hub parks the ask",
    pending.includes(askSession),
    `pending holds ${askSession}`
  );
  // One delegate of the row session, for a chip in its tray. Its workspace is
  // cut from the project's origin: the workdir gets a commit and a bare origin.
  const origin = join(fleet.workdir, "..", "origin.git");
  await Bun.$`git -C ${fleet.workdir} init -q -b main && git -C ${fleet.workdir} -c user.name=probe -c user.email=probe@localhost commit -q --allow-empty -m seed && git init -q --bare -b main ${origin} && git -C ${fleet.workdir} remote add origin ${origin} && git -C ${fleet.workdir} push -q origin HEAD:main`.quiet();
  const delegated = await fetch(`${fleet.base}/api/work-items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentInstanceId: rowSession,
      title: TRAY_TITLE,
      prompt: "Say ok.",
      checks: [{ name: "Nothing to check here", command: "true" }],
    }),
  });
  check(
    "a delegate of the row session, for the tray",
    delegated.ok,
    `POST /api/work-items: ${delegated.status} ${(await delegated.text()).slice(0, 300)}`
  );

  // The notice: the probe account's sign-in, as one moved in from the machine's own Claude Code store.
  fleet.write(
    "UPDATE account_signins SET moved_at = ?, moved_from = 'claude' WHERE account_id = ? AND machine_id = ?",
    Date.now(),
    ACCOUNT,
    MACHINE
  );
  // A second login moved in, from OpenCode's store, and not signed in on the
  // scratch machine: its entry stands open with its to-do, while the probe's
  // own (signed in there) folds as signed in everywhere.
  fleet.write(
    "INSERT OR IGNORE INTO accounts (id, provider, kind, label, hue, \"order\", never_backup, created_at) VALUES (?, 'anthropic', 'console', ?, 'green', 1, 0, ?)",
    `${ACCOUNT}-design`,
    NOTICE_OPEN,
    Date.now()
  );
  fleet.write(
    "INSERT OR REPLACE INTO account_signins (account_id, machine_id, state, moved_at, moved_from, checked_at) VALUES (?, ?, 'signed-out', ?, 'opencode', ?)",
    `${ACCOUNT}-design`,
    MACHINE,
    Date.now(),
    Date.now()
  );
  const accounts = await fleet.api<{
    signins: { accountId: string; movedAt: number | null }[];
  }>("/api/accounts");
  const movedIn = accounts.signins.filter((one) => one.movedAt !== null);
  check(
    "hub serves both moved logins",
    movedIn.some((one) => one.accountId === ACCOUNT) &&
      movedIn.some((one) => one.accountId === `${ACCOUNT}-design`),
    `moved in: ${movedIn.map((one) => one.accountId).join(", ") || "none"}`
  );

  // ── 3. The tunnel ──────────────────────────────────────────────────────
  const port = Number(new URL(fleet.base).port);
  tunnel = Bun.spawn(
    [
      ...SSH,
      "-N",
      "-o",
      "ExitOnForwardFailure=yes",
      "-R",
      `127.0.0.1:${port}:127.0.0.1:${port}`,
      "mac",
    ],
    { stdout: "ignore", stderr: "inherit" }
  );
  await until(
    "the scratch hub answering on the Mac",
    () => mac(`curl -sf http://127.0.0.1:${port}/health >/dev/null && echo up`),
    (text) => text.trim() === "up",
    30_000
  );

  // ── 4. Phone, then iPad ────────────────────────────────────────────────
  const phone = await simulator("iPhone \\d+ Pro", "CawCo probe panel phone");
  console.log(`  phone simulator ${phone}`);
  await pass("phone", phone, port, rowSession, false);
  await mac(`xcrun simctl shutdown ${phone} >/dev/null 2>&1 || true`);
  const pad = await simulator("iPad Pro.*", "CawCo probe panel iPad");
  console.log(`  iPad simulator ${pad}`);
  await pass("pad", pad, port, rowSession, true);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  for (const udid of sims) {
    // biome-ignore lint/performance/noAwaitInLoops: one ssh session at a time, each simulator torn down in turn
    await stopRunner(udid).catch((error) =>
      console.log(`  Maestro runner cleanup: ${error}`)
    );
    await mac(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
      console.log(`  simulator cleanup: ${error}`)
    );
  }
  tunnel?.kill();
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(maestroTimes());
console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
