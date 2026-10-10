#!/usr/bin/env bun
/**
 * iOS question-card probe: a parked AskUserQuestion with a long question and
 * many options never draws its parts over each other or outside its own
 * border, with the software keyboard down or up (the owner: "When kb is open
 * and ask question tool is open this is how it looks there's some mess").
 *
 *   bun scripts/probe-ios-question-keyboard.ts [--before <sha>] [--keep]
 *
 * Run from the repo root, on the Mac or in a shell that reaches it as
 * `ssh mac` (not a CawCo workspace). It:
 *
 *  1. stands up a scratch fleet here (scratch-fleet.ts: a real hub, agent and
 *     sessiond, Claude Code on a mock model). The mock answers the probe's
 *     message with one AskUserQuestion call: a nine-line question with four
 *     options, then a multi-select question with four more. The hub parks it;
 *  2. forwards the scratch hub to the Mac's loopback (`ssh -R`), where a
 *     simulator of its own reaches it at 127.0.0.1;
 *  3. with `--before <sha>`, first for that commit (built from a detached
 *     worktree under .probe/), then for this checkout: compiles the app
 *     (build-both.sh ios --compile-only), makes an iPhone simulator with its
 *     hardware keyboard disconnected, launches the app with
 *     `-paywall-env sandbox` opened on the session, and with axe:
 *       - keyboard down: checks the card's layout, captures light and dark;
 *       - taps the composer so the software keyboard comes up, checks the
 *         layout again, captures dark and light;
 *       - scrolls the card's body with one finger (`axe drag`) to the first
 *         question's first option and taps it, then to the second's last
 *         and taps it: the card logs each pick, and Answer turns live.
 *         The long lede scrolls with the options and is not clamped, as on
 *         the web (Prompt.svelte `.body`), so with the keyboard up the
 *         first option starts under the window's foot.
 *
 * The layout checks read the accessibility frames of every option, Answer
 * and Dismiss, and the card's own DEBUG log (`PromptCard`) for its size and
 * where its body clips: the tree lists a chip scrolled out of the body at
 * its unclipped frame, so a frame alone cannot tell scrolled from spilled.
 * A build without that log (one from before it) is read as drawing every
 * frame as it stands, which is what it did.
 *
 * It stops only what it started: the fleet's processes by PID, the tunnel,
 * the simulators it created (deleted at the end, with the keyboard setting
 * it gave each) and the `--before` worktree. `--keep` keeps the fleet's
 * sandbox for reading.
 *
 * Prints `PASS <step>` / `FAIL <step>` per check. The `--before` build's
 * checks print under `before <sha>:` and do not count: they show the state
 * the fix starts from. Exits 0 only if every check of this checkout passed.
 */
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { scratchFleet, until } from "./scratch-fleet";

const argv = process.argv.slice(2);
const keep = argv.includes("--keep");
const beforeFlag = argv.indexOf("--before");
const beforeRef = beforeFlag >= 0 ? argv[beforeFlag + 1] : undefined;
if (beforeFlag >= 0 && !beforeRef) {
  console.error(
    "usage: bun scripts/probe-ios-question-keyboard.ts [--before <sha>] [--keep]"
  );
  process.exit(2);
}
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const onMac = process.platform === "darwin";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const AXE = "/opt/homebrew/bin/axe";
// Inside the checkout it runs from (git-ignored), so whoever reads the run
// reads the captures beside it.
const out = join(root, ".probe", `ios-question-keyboard-${Date.now()}`);
await mkdir(out, { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

/** One build's checks: `counts` is false for the `--before` build's. */
interface Run {
  check: (step: string, ok: boolean, detail: string) => void;
  counts: boolean;
  failed: number;
  label: string;
  total: number;
}
const makeRun = (label: string, counts: boolean): Run => {
  const run: Run = {
    label,
    counts,
    failed: 0,
    total: 0,
    check: (step, ok, detail) => {
      run.total += 1;
      if (!ok) {
        run.failed += 1;
      }
      console.log(
        `${ok ? "PASS" : "FAIL"} ${label ? `${label}: ` : ""}${step}: ${detail}`
      );
    },
  };
  return run;
};
const setup = makeRun("", true);

/** Runs `script` in bash on the Mac; its stdout, or throws with its stderr. */
async function mac(script: string): Promise<string> {
  const child = Bun.spawn(
    onMac ? ["bash", "-s"] : [...SSH, "mac", "bash", "-s"],
    {
      stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const [text, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`mac exited ${code}: ${err.trim() || text.trim()}`);
  }
  return text;
}
const pause = (ms: number) => Bun.sleep(ms);

// ── The question ─────────────────────────────────────────────────────────
const LEDE = [
  "The read-in step opens every transcript this session kept since Monday.",
  "Each one is read whole, then summarised into the session's notes.",
  "Two of them carry the owner's tokens in tool output, already redacted.",
  "One is a delegate's, which the parent never asked to be read in.",
  "The notes are shown on the board and sent to the phone as they land.",
  "A deny on every read stops the step before it opens a single file.",
  "Answering inline keeps the step and asks about each transcript in turn.",
  "Either way the session's own transcript stays as it is on disk,",
  "and the read-in can be asked for again from the session's menu later.",
].join("\n");
const QUESTIONS = [
  {
    question: LEDE,
    header: "Read-in",
    multiSelect: false,
    options: [
      {
        label: "Deny on every read (Recommended)",
        description: "Stop the read-in before it opens anything.",
      },
      {
        label: "Answer questions inline (Recommended)",
        description: "Ask about each transcript as it comes.",
      },
      {
        label: "Read them all as planned",
        description: "Go ahead with every transcript.",
      },
      {
        label: "Only the parent's own transcripts",
        description: "Skip the delegate's.",
      },
    ],
  },
  {
    question: "Where should the notes show once they are written?",
    header: "Surfaces",
    multiSelect: true,
    options: [
      { label: "The board", description: "On the session's card." },
      { label: "The transcript", description: "As a note in the session." },
      { label: "Telegram", description: "As a message to the owner." },
      { label: "The iPhone app", description: "In the session's view." },
    ],
  },
];
const OPTIONS = QUESTIONS.flatMap((q) => q.options.map((o) => o.label));
const FIRST = OPTIONS[0] ?? "";
const LAST = OPTIONS.at(-1) ?? "";
/** The delegate seeded so the tray row stands between the card and the
 * pill, as in the owner's screenshot; its chip reads "<title>, <state>". */
const TRAY_TITLE = "Read the old transcripts";
/** The card's head row as VoiceOver reads it (PromptCardView `head`). */
const HEAD = "Needs you. Question from the agent";
/** The pill's top over the field's (ComposerView: the field is `inset - 1` in). */
const PILL_INSET = 6;
const BUILT_IOS = /^BUILT iOS$/m;
const BUILT_IOS_18 = /^BUILT iOS 18\.5$/m;
const WHITESPACE = /\s/g;
/** A compact log line's stamp and process, before the card's own words. */
const PICK_PREFIX = /^.*?(?=pick q=)/;

// ── Frames ───────────────────────────────────────────────────────────────
interface Rect {
  height: number;
  width: number;
  x: number;
  y: number;
}
interface Node {
  enabled?: boolean;
  frame?: Rect;
  id?: string;
  label?: string;
  type?: string;
  value?: string;
}
const bottomOf = (r: Rect) => r.y + r.height;
const rightOf = (r: Rect) => r.x + r.width;
const centre = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** Where two rects cover each other by more than a hair, if they do. */
const overlap = (a: Rect, b: Rect): Rect | undefined => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(rightOf(a), rightOf(b)) - x;
  const height = Math.min(bottomOf(a), bottomOf(b)) - y;
  return width > 0.5 && height > 0.5 ? { x, y, width, height } : undefined;
};
const within = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x - 0.5 &&
  inner.y >= outer.y - 0.5 &&
  rightOf(inner) <= rightOf(outer) + 0.5 &&
  bottomOf(inner) <= bottomOf(outer) + 0.5;
const show = (r: Rect) =>
  `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;

/** Every element of the app's accessibility tree, flattened; or with
 * `point`, the element under that point and what holds it. describe-ui
 * fails now and then on a busy simulator, so it is asked up to three times. */
async function tree(
  udid: string,
  point?: { x: number; y: number }
): Promise<Node[]> {
  const where = point
    ? ` --point ${Math.round(point.x)},${Math.round(point.y)}`
    : "";
  let raw = "";
  for (let attempt = 1; ; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a retry waits on the try before it
      raw = await mac(`${AXE} describe-ui${where} --udid ${udid}`);
      break;
    } catch (error) {
      if (attempt === 3) {
        throw error;
      }
      await pause(1000);
    }
  }
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
      id: (o.AXUniqueId ?? o.identifier) as string | undefined,
      label: (o.AXLabel ?? o.label) as string | undefined,
      value: (o.AXValue ?? o.value) as string | undefined,
      type: (o.type ?? o.role) as string | undefined,
      enabled: typeof o.enabled === "boolean" ? o.enabled : undefined,
      frame: o.frame as Rect | undefined,
    });
    walk(o.children);
  };
  walk(JSON.parse(raw));
  return nodes;
}
/** What a point query found, for the report. */
const said = (nodes: Node[]) =>
  nodes
    .filter((n) => n.id || n.label)
    .map((n) => n.label ?? n.id)
    .slice(0, 3)
    .join(" < ") || "nothing labelled";

/** The card's own account of its last layout (PromptCardView `logLayout`). */
interface CardLog {
  anchor: { x: number; y: number };
  body: { bottom: number; top: number };
  card: { height: number; width: number };
  content: number;
}
const LOG_LINE =
  /card=([\d.]+),([\d.]+) anchor=(-?[\d.]+),(-?[\d.]+) body=(-?[\d.]+),(-?[\d.]+) content=([\d.]+)/;
async function cardLog(udid: string): Promise<CardLog | undefined> {
  const text = await mac(
    `xcrun simctl spawn ${udid} log show --last 5m --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "PromptCard"' | tail -40`
  ).catch(() => "");
  const line = text
    .split("\n")
    .filter((l) => LOG_LINE.test(l))
    .at(-1);
  const m = line?.match(LOG_LINE);
  if (!m) {
    return;
  }
  const n = m.slice(1).map(Number);
  return {
    card: { width: n[0] ?? 0, height: n[1] ?? 0 },
    anchor: { x: n[2] ?? 0, y: n[3] ?? 0 },
    body: { top: n[4] ?? 0, bottom: n[5] ?? 0 },
    content: n[6] ?? 0,
  };
}

/** The card as the screen has it now. */
interface Layout {
  answer?: Node;
  /** From the card's log, placed by Dismiss's frame; none on a build without the log. */
  card?: Rect;
  /** The card as the accessibility tree has it, when the build exposes it. */
  cardNode?: Rect;
  /** The tray row's or, without one, the composer pill's top. */
  composerTop?: number;
  dismiss?: Node;
  field?: Rect;
  geometry?: CardLog;
  nodes: Node[];
  options: { frame?: Rect; label: string }[];
  /** The tray row's chip (or the row), when the tree has it. */
  tray?: Rect;
  /** Where the body clips, on screen; none on a build that does not clip. */
  window?: Rect;
}
async function readLayout(udid: string): Promise<Layout> {
  // The log lands a moment after the layout it tells.
  await pause(1200);
  const nodes = await tree(udid);
  const geometry = await cardLog(udid);
  const answer = nodes.find((n) => n.label === "Answer" && n.frame);
  const dismiss = nodes.find((n) => n.label === "Dismiss" && n.frame);
  let card: Rect | undefined;
  let window: Rect | undefined;
  if (geometry && dismiss?.frame) {
    const x = dismiss.frame.x - geometry.anchor.x;
    const y = dismiss.frame.y - geometry.anchor.y;
    card = { x, y, width: geometry.card.width, height: geometry.card.height };
    window = {
      x,
      y: y + geometry.body.top,
      width: geometry.card.width,
      height: geometry.body.bottom - geometry.body.top,
    };
  }
  const field = nodes.find((n) => n.id === "steer-message")?.frame;
  const tray = nodes.find(
    (n) =>
      (n.label === "Delegates" || n.label?.startsWith(`${TRAY_TITLE},`)) &&
      (n.frame?.height ?? 0) > 0
  )?.frame;
  const tops = [
    ...(field ? [field.y - PILL_INSET] : []),
    ...(tray ? [tray.y] : []),
  ];
  return {
    nodes,
    tray,
    geometry,
    answer,
    dismiss,
    card,
    cardNode: nodes.find((n) => n.id === "prompt-card")?.frame,
    window,
    field,
    composerTop: tops.length > 0 ? Math.min(...tops) : undefined,
    options: OPTIONS.map((label) => ({
      label,
      frame: nodes.find((n) => n.label === label)?.frame,
    })),
  };
}
/** What of `frame` the screen shows: all of it, or the part inside the body's window. */
const drawn = (layout: Layout, frame: Rect) =>
  layout.window ? overlap(frame, layout.window) : frame;

/** One part of the card as the screen draws it: an option's showing part, or a button. */
interface Part {
  label: string;
  rect: Rect;
}
/** The options showing, then Answer and Dismiss. */
const partsOf = (layout: Layout) => {
  const options: Part[] = [];
  for (const o of layout.options) {
    const rect = o.frame && drawn(layout, o.frame);
    if (rect) {
      options.push({ label: o.label, rect });
    }
  }
  const buttons: Part[] = [];
  for (const button of [layout.answer, layout.dismiss]) {
    if (button?.frame) {
      buttons.push({ label: button.label ?? "", rect: button.frame });
    }
  }
  return { options, buttons, all: [...options, ...buttons] };
};

/** Every layout check, for the keyboard down or up. */
async function layoutChecks(
  run: Run,
  udid: string,
  stage: string,
  layout: Layout
) {
  const parts = partsOf(layout);
  checkPresent(run, stage, layout);
  checkApart(run, stage, layout, parts);
  checkInside(run, stage, layout, parts.all);
  checkFoot(run, stage, parts);
  checkClear(run, stage, layout, parts.all);
  await checkFingers(run, udid, stage, parts.all);
}

function checkPresent(run: Run, stage: string, layout: Layout) {
  const missing = [
    ...layout.options.filter((o) => !o.frame).map((o) => `"${o.label}"`),
    ...(layout.answer ? [] : ["Answer"]),
    ...(layout.dismiss ? [] : ["Dismiss"]),
  ];
  run.check(
    `${stage}: every option, Answer and Dismiss is in the tree`,
    missing.length === 0,
    missing.length === 0
      ? `${OPTIONS.length} options, Answer, Dismiss`
      : `missing ${missing.join(", ")}`
  );
}

function checkApart(
  run: Run,
  stage: string,
  layout: Layout,
  parts: ReturnType<typeof partsOf>
) {
  const covered: string[] = [];
  for (const [i, a] of parts.all.entries()) {
    for (const b of parts.all.slice(i + 1)) {
      const both = overlap(a.rect, b.rect);
      if (both) {
        covered.push(`"${a.label}" × "${b.label}" at ${show(both)}`);
      }
    }
  }
  const where = layout.window
    ? ` in the body's window ${show(layout.window)}`
    : " (no body window logged: every frame as it stands)";
  run.check(
    `${stage}: no option, Answer or Dismiss is drawn over another`,
    covered.length === 0,
    covered.length > 0
      ? covered.join("; ")
      : `${parts.all.length} parts apart; ${parts.options.length} of ${OPTIONS.length} options showing${where}`
  );
}

function checkInside(run: Run, stage: string, layout: Layout, parts: Part[]) {
  const step = `${stage}: every option showing, Answer and Dismiss is inside the card`;
  const { card, window } = layout;
  const asTree = layout.cardNode ? ` (tree: ${show(layout.cardNode)})` : "";
  if (!card) {
    run.check(
      step,
      false,
      `no card geometry: the build logs no PromptCard layout${asTree}`
    );
    return;
  }
  const outside = parts.filter((p) => !within(p.rect, card));
  run.check(
    step,
    outside.length === 0 && (!window || within(window, card)),
    outside.length > 0
      ? `card ${show(card)}; outside it: ${outside.map((p) => `"${p.label}" ${show(p.rect)}`).join("; ")}`
      : `card ${show(card)}${asTree}`
  );
}

function checkFoot(run: Run, stage: string, parts: ReturnType<typeof partsOf>) {
  const footTop = Math.min(...parts.buttons.map((p) => p.rect.y));
  const lowest = Math.max(...parts.options.map((p) => bottomOf(p.rect)));
  run.check(
    `${stage}: Answer and Dismiss stand under every option showing`,
    parts.buttons.length === 2 && lowest <= footTop + 0.5,
    `lowest option drawn to y ${Math.round(lowest)}, the buttons' top at y ${Math.round(footTop)}`
  );
}

function checkClear(run: Run, stage: string, layout: Layout, parts: Part[]) {
  const { card, composerTop } = layout;
  const lowest = card
    ? bottomOf(card)
    : Math.max(...parts.map((p) => bottomOf(p.rect)));
  run.check(
    `${stage}: the card stands clear of the tray and the composer`,
    composerTop !== undefined && lowest <= composerTop + 0.5,
    `${card ? "card's foot" : "lowest drawn part"} at y ${Math.round(lowest)}, ${layout.tray ? "the tray chip's" : "the pill's"} top at y ${composerTop === undefined ? "?" : Math.round(composerTop)}`
  );
}

/** The screen's own answer at each button's middle and each option's
 * showing middle: what a finger there lands on. */
async function checkFingers(
  run: Run,
  udid: string,
  stage: string,
  parts: Part[]
) {
  const wrong: string[] = [];
  for (const p of parts) {
    // biome-ignore lint/performance/noAwaitInLoops: one point query at a time
    const hit = await tree(udid, centre(p.rect));
    const others = parts.filter((q) => q !== p).map((q) => q.label);
    if (
      !hit.some((n) => n.label === p.label) ||
      hit.some((n) => others.includes(n.label ?? ""))
    ) {
      wrong.push(`"${p.label}" → ${said(hit)}`);
    }
  }
  run.check(
    `${stage}: a finger on each part's middle lands on that part`,
    wrong.length === 0,
    wrong.length > 0 ? wrong.join("; ") : `${parts.length} parts`
  );
}

// ── One build, on a simulator of its own ─────────────────────────────────
/** Compiles `dir` on the Mac; the app's path there, or none when it failed. */
async function compile(run: Run, dir: string): Promise<string | undefined> {
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: dir, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(build.stdout).text();
  process.stdout.write(text);
  const code = await build.exited;
  const built = code === 0 && BUILT_IOS.test(text) && BUILT_IOS_18.test(text);
  run.check(
    "compile",
    built,
    code === 0 ? "BUILT iOS and BUILT iOS 18.5" : `build-both.sh exited ${code}`
  );
  if (!built) {
    return;
  }
  // The Mac-side build folder build-both.sh used (its BUILD naming).
  const top = (
    await Bun.$`git -C ${dir} rev-parse --show-toplevel`.text()
  ).trim();
  const name = top === join(home, "cockpit") ? "main" : basename(top);
  const base = onMac
    ? join(
        process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"),
        "cawco-apple"
      )
    : "$HOME/build/cawco-apple";
  return `${base}/${name}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;
}

/** Gives the simulator `udid` its own Simulator setting, the hardware
 * keyboard disconnected, so a focused field brings up the software
 * keyboard; or takes that setting away again. */
const hardwareKeyboardOff = (udid: string, on: boolean) =>
  mac(`python3 - ${udid} ${on ? "set" : "clear"} <<'PY'
import plistlib, subprocess, sys
udid, mode = sys.argv[1], sys.argv[2]
read = subprocess.run(["defaults", "export", "com.apple.iphonesimulator", "-"], capture_output=True)
prefs = plistlib.loads(read.stdout) if read.returncode == 0 and read.stdout else {}
devices = prefs.setdefault("DevicePreferences", {})
if mode == "set":
    devices.setdefault(udid, {})["ConnectHardwareKeyboard"] = False
else:
    devices.pop(udid, None)
subprocess.run(["defaults", "import", "com.apple.iphonesimulator", "-"], input=plistlib.dumps(prefs), check=True)
PY`);

/** A simulator of the probe's own, and what drives it. */
interface Sim {
  appearance: (mode: "light" | "dark") => Promise<string>;
  shot: (what: string) => Promise<void>;
  tap: (p: { x: number; y: number }) => Promise<string>;
  udid: string;
}
const simOf = (udid: string, name: string): Sim => ({
  udid,
  appearance: (mode) => mac(`xcrun simctl ui ${udid} appearance ${mode}`),
  tap: (p) =>
    mac(
      `${AXE} tap -x ${Math.round(p.x)} -y ${Math.round(p.y)} --udid ${udid}`
    ),
  shot: async (what) => {
    const png = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/s.png" >/dev/null 2>&1
base64 < "$F/s.png"
rm -rf "$F"`);
    const file = join(out, `${name}${what}.png`);
    await Bun.write(file, Buffer.from(png.replace(WHITESPACE, ""), "base64"));
    console.log(`  capture: ${file}`);
  },
});

/** Makes an iPhone Pro simulator on the newest iOS runtime; its UDID. */
const createSim = async () =>
  (
    await mac(`read -r RUNTIME TYPE < <(xcrun simctl list devices available -j | python3 -c '
import json, re, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    m = re.search(r"\\.iOS-(\\d+)-(\\d+)$", runtime)
    if not m:
        continue
    for d in devices:
        pro = re.fullmatch(r"iPhone (\\d+) Pro", d["name"])
        if pro:
            key = (int(m[1]), int(m[2]), int(pro[1]))
            if best is None or key > best[0]:
                best = (key, runtime, d["deviceTypeIdentifier"])
if best is None:
    sys.exit("no iPhone Pro simulator")
print(best[1], best[2])
')
xcrun simctl create "CawCo probe question" "$TYPE" "$RUNTIME"`)
  ).trim();

/** Boots `udid` with its status bar held still (as captures are), installs
 * `app` and opens it on `session`. */
const launch = (udid: string, app: string, session: string, hub: string) =>
  mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl install ${udid} "${app}"
xcrun simctl ui ${udid} appearance light
xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${hub} -open-session ${session} >/dev/null`);

/** With the keyboard down: the card's layout, light and dark. */
async function keyboardDown(run: Run, sim: Sim): Promise<Layout> {
  const head = await until(
    "the question card on screen",
    async () => (await tree(sim.udid)).find((n) => n.label === HEAD),
    (node) => node?.frame !== undefined,
    120_000
  );
  run.check(
    "the question card is on screen",
    head?.frame !== undefined,
    `head row at ${head?.frame ? show(head.frame) : "?"}`
  );
  // The card's settle in, two durControl.
  await pause(1500);
  const down = await readLayout(sim.udid);
  run.check(
    "the delegate's chip stands in the tray row, between the card and the pill",
    down.tray !== undefined,
    down.tray
      ? `at ${show(down.tray)}`
      : `no "${TRAY_TITLE}, …" chip in the tree`
  );
  await layoutChecks(run, sim.udid, "keyboard down", down);
  await sim.shot("keyboard-down-light");
  await sim.appearance("dark");
  await pause(1000);
  await sim.shot("keyboard-down-dark");
  return down;
}

/** The composer tapped and the software keyboard up: the card's layout
 * again, dark and light. None when there is no field to tap. */
async function keyboardUp(
  run: Run,
  sim: Sim,
  down: Layout
): Promise<Layout | undefined> {
  const { field } = down;
  if (!field) {
    run.check("the composer's field", false, "no steer-message in the tree");
    return;
  }
  await sim.tap(centre(field));
  await pause(2000);
  const up = await readLayout(sim.udid);
  const rose = up.field ? field.y - up.field.y : 0;
  const keys = up.nodes.filter(
    (n) =>
      ["space", "return", "Return", "shift"].includes(n.label ?? "") ||
      (n.type ?? "").includes("Keyboard")
  );
  run.check(
    "the software keyboard is up",
    rose >= 150,
    `the field rose ${Math.round(rose)}pt; keyboard elements in the tree: ${keys.length}${rose >= 150 ? "" : " (a hardware keyboard Simulator.app connected keeps it down: I/O › Keyboard)"}`
  );
  const { geometry } = up;
  const body = geometry ? geometry.body.bottom - geometry.body.top : 0;
  run.check(
    "keyboard up: the card is shorter than its content, so its body scrolls",
    geometry !== undefined && geometry.content > body + 0.5,
    geometry
      ? `body window ${Math.round(body)}pt over ${Math.round(geometry.content)}pt of content`
      : "no PromptCard layout logged"
  );
  await layoutChecks(run, sim.udid, "keyboard up", up);
  await sim.shot("keyboard-up-dark");
  await sim.appearance("light");
  await pause(1500);
  await sim.shot("keyboard-up-light");
  return up;
}

/** One-finger drags on the body until the option `label` stands whole in
 * its window, at most eight, each as far as the option still has to go
 * (the window's height at most); the layout then, and how many it took. */
async function dragTo(sim: Sim, from: Layout, label: string) {
  let now = from;
  let drags = 0;
  for (; drags < 8; drags += 1) {
    const option = now.options.find((o) => o.label === label)?.frame;
    const w = now.window;
    if (!(option && w) || within(option, w)) {
      break;
    }
    // Up when the option is under the window's foot, down when it is over
    // its top; never from the body's top downward, which the card takes
    // as a swipe to minimize (the option is over the top only once the
    // body has scrolled).
    const below = bottomOf(option) > bottomOf(w);
    const still = below
      ? bottomOf(option) - bottomOf(w) + 12
      : w.y - option.y + 12;
    const reach = Math.min(still, w.height - 20);
    // On the body's right side, clear of the chips' words (the window is
    // the card's width; the body stands 12pt in from it).
    const x = Math.round(rightOf(w) - 24);
    const start = Math.round(below ? bottomOf(w) - 10 : w.y + 10);
    const end = Math.round(below ? start - reach : start + reach);
    // biome-ignore lint/performance/noAwaitInLoops: each drag waits for the scroll before it
    await mac(
      `${AXE} drag --start-x ${x} --start-y ${start} --end-x ${x} --end-y ${end} --duration 0.5 --steps 30 --udid ${sim.udid}`
    );
    now = await readLayout(sim.udid);
  }
  return { now, drags };
}

/** The card's own word on the last pick of `label` (PromptCardView
 * `toggle`, DEBUG): `pick q=<n> "<label>" answered=<bool>`. */
async function pickLog(udid: string, label: string) {
  const text = await mac(
    `xcrun simctl spawn ${udid} log show --last 2m --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "PromptCard"' | grep ' pick q=' | tail -20 || true`
  ).catch(() => "");
  return text
    .split("\n")
    .filter((line) => line.includes(`"${label}"`))
    .at(-1)
    ?.replace(PICK_PREFIX, "");
}

/** Scrolls the option `label` whole into the body and taps it; the layout
 * after, and the card's word on the pick. */
async function scrollAndPick(run: Run, sim: Sim, label: string) {
  const { now, drags } = await dragTo(sim, await readLayout(sim.udid), label);
  const option = now.options.find((o) => o.label === label)?.frame;
  const shown = option && drawn(now, option);
  const whole =
    option !== undefined && (!now.window || within(option, now.window));
  run.check(
    `keyboard up: one-finger drags bring "${label}" whole into the body`,
    whole && shown !== undefined,
    `${drags} drag(s); at ${option ? show(option) : "?"}${now.window ? `, body window ${show(now.window)}` : ""}`
  );
  if (!shown) {
    return;
  }
  const target = centre(shown);
  const under = await tree(sim.udid, target);
  await sim.tap(target);
  await pause(1500);
  const picked = await pickLog(sim.udid, label);
  run.check(
    `keyboard up: a tap on "${label}" picks it`,
    under.some((n) => n.label === label) && picked !== undefined,
    `under the finger: ${said(under)}; the card logged: ${picked ?? "no pick"}`
  );
  return picked;
}

/** Picks the first question's first option and the second's last, each
 * scrolled to: both questions answered, Answer turns live. */
async function pickFirstAndLast(run: Run, sim: Sim) {
  await scrollAndPick(run, sim, FIRST);
  const last = await scrollAndPick(run, sim, LAST);
  const answer = (await tree(sim.udid)).find((n) => n.label === "Answer");
  run.check(
    "keyboard up: with both questions answered, Answer turns live",
    answer?.enabled === true && last?.includes("answered=true") === true,
    `Answer enabled: ${answer?.enabled ?? "not reported"}; the card's last pick: ${last ?? "none"}`
  );
  await sim.shot("keyboard-up-both-picked-light");
  await layoutChecks(
    run,
    sim.udid,
    "keyboard up, scrolled to the end",
    await readLayout(sim.udid)
  );
}

async function scenario(
  run: Run,
  app: string,
  session: string,
  hub: string,
  name: string
) {
  let udid = "";
  try {
    udid = await createSim();
    console.log(`  simulator ${udid}`);
    const sim = simOf(udid, name);
    await hardwareKeyboardOff(udid, true);
    await launch(udid, app, session, hub);
    const down = await keyboardDown(run, sim);
    const up = await keyboardUp(run, sim, down);
    if (up) {
      await pickFirstAndLast(run, sim);
    }
  } catch (error) {
    run.check(
      "probe",
      false,
      error instanceof Error ? error.message : String(error)
    );
  } finally {
    if (udid) {
      await mac(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
        console.log(`  simulator cleanup: ${error}`)
      );
      await hardwareKeyboardOff(udid, false).catch((error) =>
        console.log(`  keyboard setting cleanup: ${error}`)
      );
    }
  }
}

// ── The fleet and the parked question ────────────────────────────────────
const marker = `probe question ${crypto.randomUUID().slice(0, 6)}`;
let asked = false;
let offered: string[] = [];
const fleet = await scratchFleet({
  name: "probe-ios-question",
  respond: (seen) => {
    if (seen.tools && seen.last.includes(marker)) {
      offered = seen.toolNames;
      if (!asked && seen.toolNames.includes("AskUserQuestion")) {
        asked = true;
        return {
          everyMs: 5,
          words: [],
          tool: { name: "AskUserQuestion", input: { questions: QUESTIONS } },
        };
      }
    }
    return { everyMs: 20, words: ["ok"] };
  },
});

let tunnel: ReturnType<typeof Bun.spawn> | undefined;
let worktree: string | undefined;
const runs: Run[] = [];
try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const id = await fleet.spawn("claude", "Question card probe");
  await fleet.send(id, `${marker}: ask me the read-in question.`);
  const parked = await until(
    "the question parked on the hub",
    () => fleet.api<unknown[]>("/api/pending"),
    (list) =>
      list.some((entry) => {
        const text = JSON.stringify(entry);
        return text.includes(id) && text.includes("AskUserQuestion");
      }),
    180_000
  ).catch(() => undefined);
  setup.check(
    "the hub parks the question",
    parked !== undefined,
    parked
      ? `AskUserQuestion parked for ${id}: ${QUESTIONS.length} questions, ${OPTIONS.length} options, the second multi-select`
      : `nothing parked; the mock was ${asked ? "asked and called AskUserQuestion" : `never offered AskUserQuestion (tools: ${offered.join(", ") || "none seen"})`}`
  );
  if (!parked) {
    throw new Error("no parked question to probe");
  }
  // One delegate of the asking session, so its chip fills the tray row. A
  // workspace is cut from the project's origin: the scratch workdir gets a
  // commit and a bare origin of its own beside it.
  const origin = join(fleet.workdir, "..", "origin.git");
  await Bun.$`git -C ${fleet.workdir} init -q && git -C ${fleet.workdir} -c user.name=probe -c user.email=probe@localhost commit -q --allow-empty -m seed && git init -q --bare ${origin} && git -C ${fleet.workdir} remote add origin ${origin} && git -C ${fleet.workdir} push -q origin HEAD:main`.quiet();
  const delegated = await fetch(`${fleet.base}/api/work-items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentInstanceId: id,
      title: TRAY_TITLE,
      prompt: "Say ok.",
      checks: [{ name: "Nothing to check here", command: "true" }],
    }),
  });
  setup.check(
    "a delegate of the asking session, for the tray row",
    delegated.ok,
    `POST /api/work-items: ${delegated.status} ${(await delegated.text()).slice(0, 300)}`
  );

  // ── The tunnel ─────────────────────────────────────────────────────────
  const port = Number(new URL(fleet.base).port);
  if (!onMac) {
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
  }
  await until(
    "the scratch hub answering on the Mac",
    () => mac(`curl -sf http://127.0.0.1:${port}/health >/dev/null && echo up`),
    (text) => text.trim() === "up",
    30_000
  );
  const hub = `http://127.0.0.1:${port}`;

  // ── The builds ─────────────────────────────────────────────────────────
  if (beforeRef) {
    const sha = (
      await Bun.$`git -C ${root} rev-parse --short ${beforeRef}`.text()
    ).trim();
    const run = makeRun(`before ${sha}`, false);
    runs.push(run);
    worktree = join(root, ".probe", `before-${sha}`);
    await Bun.$`git -C ${root} worktree add --detach ${worktree} ${sha}`.quiet();
    const app = await compile(run, worktree);
    if (app) {
      await scenario(run, app, id, hub, "before-");
    }
  }
  const head = makeRun("", true);
  runs.push(head);
  const app = await compile(head, root);
  if (app) {
    await scenario(head, app, id, hub, "");
  }
} catch (error) {
  setup.check(
    "probe",
    false,
    error instanceof Error ? error.message : String(error)
  );
} finally {
  if (worktree) {
    await Bun.$`git -C ${root} worktree remove --force ${worktree}`
      .quiet()
      .catch((error) => console.log(`  worktree cleanup: ${error}`));
  }
  tunnel?.kill();
  await fleet.close();
  await fleet.clean(
    keep || setup.failed > 0 || runs.some((run) => run.counts && run.failed > 0)
  );
}

console.log(`Captures: ${out}`);
for (const run of runs) {
  console.log(
    `${run.label || "this checkout"}: ${run.failed} of ${run.total} checks failed${run.counts ? "" : " (not counted)"}`
  );
}
const counted = runs.filter((run) => run.counts);
const failed = setup.failed + counted.reduce((sum, run) => sum + run.failed, 0);
const ran = counted.some((run) => run.total > 0);
console.log(failed === 0 && ran ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed === 0 && ran ? 0 : 1);
