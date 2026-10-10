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
 *     as a login moved in from the machine's own Claude Code store, which
 *     the hub serves as a moved-login notice;
 *  3. forwards the scratch hub to the Mac's loopback (`ssh -R`);
 *  4. on an iPhone and then an iPad simulator, launches the app with
 *     `-paywall-env sandbox` on "Panel probe" and drives it with axe: taps
 *     Caw, reads the panel and how it hangs from his glass (0pt at the join,
 *     the trailing flank straight down, the leading foot's flare in the
 *     panel's surface), captures it light and dark (and on the phone records
 *     it closing and opening), taps the transcript
 *     row at a point outside it (a long intro turn first stands the row
 *     below where the panel hangs); on the phone it then presses the ask's
 *     row itself, which opens its session; on the iPad it dismisses the
 *     notice and approves
 *     the ask from the panel;
 *  5. prints `PASS <step>` / `FAIL <step>` per check, saves the captures to a
 *     folder it names, and exits 0 only if every check passed.
 *
 * It stops only what it started: the fleet's processes by PID, the tunnel,
 * and the simulators it created (deleted at the end). `--keep` keeps the
 * fleet's sandbox for reading.
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
const AXE = "/opt/homebrew/bin/axe";
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
const ASK = `panel-ask-${tag}`;
const INTRO = `panel-intro-${tag}`;
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
interface Node {
  frame?: Frame;
  id?: string;
  label?: string;
  value?: string;
}

/** Every element of the app's accessibility tree, flattened; or with `point`, what is under that point. */
async function tree(
  udid: string,
  point?: { x: number; y: number }
): Promise<Node[]> {
  const where = point
    ? ` --point ${Math.round(point.x)},${Math.round(point.y)}`
    : "";
  const raw = await axe(`describe-ui${where} --udid ${udid}`);
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
      frame: o.frame as Frame | undefined,
    });
    walk(o.children);
  };
  walk(JSON.parse(raw));
  return nodes;
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
const pause = (ms: number) => Bun.sleep(ms);
/** One finger's tap at a point, in points. */
/**
 * One finger's tap at a point, in points. A tap axe still cannot place
 * after its tries ("invisible due to a fullscreen dialog") leaves what was
 * over the app: a screenshot beside the captures and the tree's labels.
 */
async function tap(udid: string, p: { x: number; y: number }) {
  try {
    await axe(`tap -x ${Math.round(p.x)} -y ${Math.round(p.y)} --udid ${udid}`);
  } catch (error) {
    blocked += 1;
    console.log(
      `  tap at (${Math.round(p.x)}, ${Math.round(p.y)}) blocked: what was on screen follows`
    );
    await shot(udid, `tap-blocked-${blocked}`).catch(() => undefined);
    const labels = await mac(`${AXE} describe-ui --udid ${udid}`)
      .then(
        (raw) =>
          JSON.stringify(JSON.parse(raw))
            .match(/"AXLabel":"[^"]*"/g)
            ?.slice(0, 30)
            .join(" ") ?? "no labels"
      )
      .catch(
        (reason) => `describe-ui failed too: ${String(reason).slice(0, 160)}`
      );
    console.log(`  the tree's first labels: ${labels}`);
    throw error;
  }
}
let blocked = 0;

/**
 * axe's own failures to reach a simulator's automation session, which a
 * just-booted or busy simulator gives for a while ("No translation object
 * returned for simulator… invisible due to a fullscreen dialog", a timed-out
 * session); nothing was read or touched, so the call is made again.
 */
const AXE_SESSION =
  /No translation object|remote automation session|Timed out creating/;
/** One axe command on the Mac, tried up to 4 times 2s apart while axe cannot reach the simulator. */
async function axe(args: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: each try follows the last one's failure
      return await mac(`${AXE} ${args}`);
    } catch (error) {
      if (attempt >= 4 || !AXE_SESSION.test(String(error))) {
        throw error;
      }
      console.log(
        `  axe could not reach the simulator (try ${attempt}): ${String(error).slice(0, 160)}`
      );
      await Bun.sleep(2000);
    }
  }
}

/** The moved login's row (MovedLogins.svelte): the account's name is its entry, its ✕ "Dismiss moved logins". */
const NOTICE = "Probe";
const NOTICE_DISMISS = "Dismiss moved logins";
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
const dismiss = (nodes: Node[]) =>
  nodes.find((n) => n.label === NOTICE_DISMISS);
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
  let nodes = await tree(udid);
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
  const closed = await pixels(udid);
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
  check(
    `${kind}: the panel lists the notice, under Needs you`,
    dismiss(nodes) !== undefined &&
      nodes.some((n) => n.label === NOTICE) &&
      nodes.some((n) => n.label?.startsWith("from Claude Code on ") === true) &&
      (dismiss(nodes)?.frame?.y ?? 0) >
        (ask?.frame?.y ?? Number.POSITIVE_INFINITY) - 1,
    dismiss(nodes)
      ? `"${NOTICE}", "${nodes.find((n) => n.label?.startsWith("from Claude Code on ") === true)?.label ?? "no from-line"}", its ✕ at y ${Math.round(dismiss(nodes)?.frame?.y ?? 0)}, the ask's Approve at y ${Math.round(ask?.frame?.y ?? 0)}`
      : `no "${NOTICE_DISMISS}"; labels: ${nodes
          .map((n) => n.label)
          .filter(Boolean)
          .slice(0, 40)
          .join(" | ")}`
  );
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
async function pixels(udid: string): Promise<Pixels> {
  const points = (await tree(udid))[0]?.frame?.width ?? 402;
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
  const open = await pixels(udid);
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
async function tapThrough(kind: Kind, udid: string, box: Frame) {
  let nodes = await tree(udid);
  const target = toolRow(nodes);
  if (!target?.frame) {
    check(
      `${kind}: a tap outside reaches the row`,
      false,
      "no transcript row to tap"
    );
    return;
  }
  // A point on the row's middle line outside the panel's frame, if any.
  const row = target.frame;
  const at =
    [0.5, 0.25, 0.1, 0.75, 0.9]
      .map((share) => ({
        x: row.x + row.width * share,
        y: row.y + row.height / 2,
      }))
      .find((point) => !inside(box, point)) ?? centre(row);
  const covered = inside(box, at);
  const under = await tree(udid, at);
  check(
    `${kind}: nothing covers the transcript row outside the panel`,
    !covered &&
      under.some((n) => n.value === "Collapsed" || n.value === "Expanded"),
    covered
      ? `no point of the row ${JSON.stringify(row)} is outside the panel ${JSON.stringify(box)}`
      : `at ${JSON.stringify(at)} on the row: ${said(under)}`
  );
  const before = target.value;
  await tap(udid, at);
  await pause(1500);
  nodes = await tree(udid);
  const after = toolRow(nodes)?.value;
  check(
    `${kind}: a tap on the row reaches the row`,
    after !== undefined && after !== before,
    `the row went ${before} → ${after ?? "gone"}`
  );
  check(
    `${kind}: the same tap closes the panel`,
    !(approve(nodes) || dismiss(nodes)) && caw(nodes)?.value !== "Open",
    approve(nodes)
      ? "the panel's Approve is still on screen"
      : `closed; Caw's value "${caw(nodes)?.value ?? ""}"`
  );
  await shot(udid, `${kind}-after-tap-light`);
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
    `${closed ? "the panel closed" : "the panel is still open"}; ${call ? `"${call.label}" on screen` : "no pending call of Needs probe on screen"}`
  );
  await shot(udid, `${kind}-chosen-light`);
}

/**
 * Opens the panel if it is closed (a tap on Caw toggles it, so an open
 * panel is left as it is), dismisses the notice by its ✕ and approves the ask.
 */
async function answerFromPanel(kind: Kind, udid: string) {
  let nodes = await tree(udid);
  const head = caw(nodes);
  if (caw(nodes)?.value !== "Open") {
    if (!head?.frame) {
      check(
        `${kind}: the notice's ✕ dismisses it`,
        false,
        "Caw not found to open the panel"
      );
      return;
    }
    await tap(udid, centre(head.frame));
    await pause(1200);
  }
  nodes = await tree(udid);
  const cross = dismiss(nodes);
  if (cross?.frame) {
    await tap(udid, centre(cross.frame));
    await pause(1500);
  }
  nodes = await tree(udid);
  const stays = dismiss(nodes) !== undefined;
  check(
    `${kind}: the notice's ✕ dismisses it`,
    cross !== undefined && !stays && approve(nodes) !== undefined,
    cross === undefined
      ? "no ✕ to tap"
      : `${stays ? "still listed" : "gone"}; the ask ${approve(nodes) ? "is" : "is not"} still listed`
  );
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
 * One device's pass. `last`: the pass that also dismisses the notice and
 * approves the ask, which take them away for every device after it.
 */
async function pass(
  kind: Kind,
  udid: string,
  port: number,
  rowSession: string,
  last: boolean
) {
  const box = await openPanel(kind, udid, port, rowSession);
  if (!box) {
    return;
  }
  await tapThrough(kind, udid, box);
  if (last) {
    await answerFromPanel(kind, udid);
  } else {
    // Answering takes the ask away, so its row is chosen on the pass that does not answer it.
    await chooseRow(kind, udid);
  }
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

  // The notice: the probe account's sign-in, as one moved in from the machine's own Claude Code store.
  fleet.write(
    "UPDATE account_signins SET moved_at = ?, moved_from = 'claude' WHERE account_id = ? AND machine_id = ?",
    Date.now(),
    ACCOUNT,
    MACHINE
  );
  const accounts = await fleet.api<{
    signins: { accountId: string; movedAt: number | null }[];
  }>("/api/accounts");
  const moved =
    accounts.signins.find((one) => one.accountId === ACCOUNT)?.movedAt ?? null;
  check("hub serves the moved login", moved !== null, `movedAt ${moved}`);

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

console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
