/**
 * iOS parity with the web for where asks appear and how sessions and
 * machines are acted on (owner: "ios should have 1:1 parity with the web
 * app"): the web's 685a5ea2 (an ask is answered where it was made) and
 * 464cb194 (a machine's questions on its row), and the rail's session menu.
 *
 * A scratch fleet on the Mac (real hub, agent and sessiond, Claude Code
 * against the mock model, a stand-in Cawrier): a project; per device a
 * worker session that notes a fact, then the project's memory curator run,
 * whose turn proposes a knowledge file citing it; a second machine, gone
 * offline. The built app on an iPhone 16 Pro, an iPad Pro 13-inch (M4) and
 * an iPad Pro 11-inch (M4), iOS 18.5, each in a mac-slot.sh slot of its own, with `-parity-probe`
 * (ParityProbe.swift), whose log lines are read here:
 *
 * (p) the hub's push for the curator's proposal carries the curator run's
 *     session as `originInstanceId`;
 * (a) routed as a tap on that push routes it, the app opens the session
 *     that made the proposal, its card in that session's composer, nothing
 *     presented over the page;
 * (b) a pane opened on the proposal's own id moves to that session;
 * (c) Approve in that composer answers it: it leaves the hub's pending
 *     asks, the composer and Caw's panel;
 * (r) iPad: the rail that stands, its column beside the page on the 13-inch
 *     (over the rail's 900pt breakpoint), the sheet the bar's toggle brings
 *     over the page on the 11-inch (under it): its session row carries the
 *     session's menu, and Delete transcript asks under that rail row,
 *     nothing presented over the rail, pends, and deletes the session;
 * (m) the gone machine's keychain unlock opens under its row, the hub's
 *     refusal of the password said in it; the hub's refusal of an install
 *     stands under the same row with Try again; nothing presented;
 *
 * and, from the app alone before it waits on the fleet:
 *
 * (h) the artifact panel's head for a component canvas whose page holds
 *     picks, at 330, 390, 523 and 720pt head widths (PreviewController
 *     `placeHeadItems`, the web's side/head.ts `standing()`): every control
 *     the panel wants stands or is in More, once; each slot 44×44 at least,
 *     inside the head, in head order, the canvas view between Open in new
 *     tab and Inspect; a wider head holds every control a narrower one does;
 *     the mode is its pick only where its segments have no room left; More
 *     holds the canvas view as its "Canvas view" submenu. Every 1pt from 300
 *     to 800, at 0 open pins and at 2: each width lays out the same frame
 *     after frame; at 0 More keeps its plain width; with pins open, a fit
 *     that leaves Comments in More is fitted again with More's count, and a
 *     width where that changes what stands is read;
 * (v) that canvas's view (CanvasView.svelte): its button, its menu's
 *     entries, and for each entry pressed, and on the page's ready, the
 *     `cawco:canvas-view` message the app hands the page, as the web posts
 *     it; the choice kept for the session;
 * (w) eb42f1374: the round Caw button's rim on its 36pt glass, radius 15pt,
 *     its stroke's outer edge one hairline inside the glass's own; Caw's
 *     panel's section rule brand-solid, alpha 1, in light and dark; the
 *     web's 111bec1fb: the phone's 32pt standing glass's outline the same
 *     hairline in, half height 13pt on its path.
 *
 *   bash apps/apple/scripts/build-both.sh ios --compile-only
 *   bun scripts/probe-kit/run.ts ios-parity
 *
 * `PROBE_DEVICE=iPhone` (or `iPad`, `iPad-11`) runs one device. The app is this
 * checkout's simulator build (`PROBE_IOS_APP` names another).
 */
// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: each device's steps are read in order.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Subprocess } from "bun";
import { previewWords } from "../../../packages/core/src/words/preview";
import { freshApp } from "../../lib/apple-app";
import { type MacSim, macSim } from "../../lib/mac-sim";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { type Kit, ROOT, type Spec } from "../kit";

const RUNTIME = "com.apple.CoreSimulator.SimRuntime.iOS-18-5";
/** (r)'s rail on each iPad: its column beside the page, or the sheet the bar's toggle brings. */
type Rail = "column" | "sheet";
const DEVICES: { rail?: Rail; tag: string; type: string }[] = [
  {
    tag: "iPhone",
    type: "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
  },
  {
    tag: "iPad",
    // 1032pt wide in portrait, over the rail's 900pt breakpoint (DESIGN.md
    // "Breakpoints"): its rail's column stands beside the page.
    rail: "column",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB",
  },
  {
    tag: "iPad-11",
    // 834pt, under the breakpoint: the rail is the sheet the bar's toggle
    // brings over the page, as the web's burger brings it.
    rail: "sheet",
    type: "com.apple.CoreSimulator.SimDeviceType.iPad-Pro-11-inch-M4-8GB",
  },
];
const NOTE = "mcp__cawco__memory_note";
const PROPOSE = "mcp__cawco__memory_propose";
const WORKER = "PROBE-PARITY-WORKER";
const NOTE_ID = /n-\d{8}-\d{6}-[0-9a-f]{6}/;
const WORKER_TAG = /PROBE-PARITY-WORKER (\w+)/;
/** A proposal id's stamp (memory.ts `PROPOSAL_ID`): `YYYYMMDD-HHMMSS`. */
const STAMP_MARKS = /[-:T]/g;
const STAMP_DAY = /^(\d{8})/;
const UNLOCK_FORM = /under its row: unlock\(.*Unlock /;
const UNLOCK_REFUSED = /under its row: unlock\(.*Unlock .*\[Unlock off\]/;
const INSTALL_REFUSED = /fault\('.*nothing was installed.*' \+ Try again\)/;
const GHOST = "parity-ghost";
/** The compact log's head, up to the `[subsystem:category] ` tag: the probe's own lines carry `[id]` tags. */
const LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;

/** (h) The head widths ParityProbe lays the panel out at. */
const HEAD_WIDTHS = [330, 390, 523, 720];
/** The head's order after the name (PreviewController `HeadItem`), More and Close last. */
const HEAD_ORDER = [
  "send",
  "newCanvas",
  "undock",
  "openTab",
  "view",
  "inspect",
  "mode",
  "modePick",
  "comments",
  "reload",
  "expand",
  "more",
  "close",
];
/** What a component canvas's panel beside a transcript wants, its page holding picks. */
const WANTED = [
  "send",
  "newCanvas",
  "openTab",
  "view",
  "inspect",
  "mode",
  "comments",
  "reload",
  "expand",
];
const STANDING =
  /width=(\d+) name=(\d+) left=(-?\d+) segments=(\d+) open=(\d+) first=(\S+) shown=(.*) more=(\S+)$/;
/** (h) A sweep's line: the widths whose layout moved between frames, those More's count changed, and where a wider head lost a control. */
const SWEEP = /widths=300-800 unsettled=(\S+) recount=(\S+) drops=(\S+)$/;
/** (h) The first width at which More's count changed what stands. */
const RECOUNT_LINE = /head standing \[(\d+) open 2\] /;
const SLOT = /^(\w+):(\w+)@(-?\d+),(-?\d+),(\d+)x(\d+)$/;
/** (w) A `caw rule` line's fill and brand-solid, each as `#rrggbb a=N`. */
const RULE_FILL = /fill=(#[0-9a-f]{6} a=[\d.]+)/;
const RULE_BRAND = /brand-solid=(#[0-9a-f]{6} a=[\d.]+)/;

interface Slot {
  form: string;
  height: number;
  key: string;
  width: number;
  x: number;
}

/** A `head standing` line's parts. */
function standingOf(said: string) {
  const parts = STANDING.exec(said);
  if (!parts) {
    return;
  }
  const slots: Slot[] = (parts[7] ?? "")
    .split(" ")
    .map((one) => SLOT.exec(one))
    .filter((one): one is RegExpExecArray => one !== null)
    .map((one) => ({
      key: one[1] ?? "",
      form: one[2] ?? "",
      x: Number(one[3]),
      width: Number(one[5]),
      height: Number(one[6]),
    }));
  return {
    head: Number(parts[1]),
    left: Number(parts[3]),
    segments: Number(parts[4]),
    open: Number(parts[5]),
    first: parts[6] === "-" ? undefined : (parts[6] ?? "").split(","),
    slots,
    more: parts[8] === "-" ? [] : (parts[8] ?? "").split(","),
  };
}

/** (v) The canvas view's entries, in its menu's order, and what each does to the view. */
interface View {
  motion: "on" | "reduce";
  scheme: string;
  width: string;
}
const CHOICES: [string, (view: View) => View, ("fit" | 1)?][] = [
  ["As the page", (v) => ({ ...v, scheme: "page" })],
  ["Light", (v) => ({ ...v, scheme: "light" })],
  ["Dark", (v) => ({ ...v, scheme: "dark" })],
  ["Light and dark", (v) => ({ ...v, scheme: "both" })],
  ["Each story's own", (v) => ({ ...v, width: "own" })],
  ["Phone, 390", (v) => ({ ...v, width: "390" })],
  ["Tablet, 768", (v) => ({ ...v, width: "768" })],
  ["Desk, 1280", (v) => ({ ...v, width: "1280" })],
  ["Every width", (v) => ({ ...v, width: "all" })],
  [
    previewWords.reducedMotion,
    (v) => ({ ...v, motion: v.motion === "on" ? "reduce" : "on" }),
  ],
  ["Zoom to fit", (v) => v, "fit"],
  ["Zoom to 100%", (v) => v, 1],
  [
    previewWords.reducedMotion,
    (v) => ({ ...v, motion: v.motion === "on" ? "reduce" : "on" }),
  ],
];
const VIEW_MENU =
  "Scheme[As the page*, Light, Dark, Light and dark] | Width[Each story's own*, Phone, 390, Tablet, 768, Desk, 1280, Every width] | Reduced motion | Zoom to fit, Zoom to 100%";
const VIEW_MENU_CHOSEN =
  "Scheme[As the page, Light, Dark, Light and dark*] | Width[Each story's own, Phone, 390, Tablet, 768, Desk, 1280, Every width*] | Reduced motion | Zoom to fit, Zoom to 100%";

/** CanvasView.svelte's `send`: the message as the web posts it, its keys sorted as the app's log writes them. */
function posted(view: View, zoom?: "fit" | 1): string {
  return JSON.stringify({
    type: "cawco:canvas-view",
    view: {
      all: view.width === "all",
      motion: view.motion,
      scheme: view.scheme,
      widths:
        view.width === "own" || view.width === "all"
          ? null
          : [Number(view.width)],
      ...(zoom === undefined ? {} : { zoom }),
    },
  });
}

interface Pushed {
  payload: {
    cawco: {
      instanceId?: string;
      kind: string;
      originInstanceId?: string | null;
      requestId?: string;
      threadId?: string | null;
    };
  };
}

interface Ask {
  instanceId: string;
  machineId: string;
  payload: {
    input: { path?: string };
    originInstanceId?: string;
    toolName: string;
  };
  requestId: string;
}

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
/** A session that must call `name`: loads it with ToolSearch first when it is deferred. */
const call = (request: Seen, name: string, input: object): Reply => {
  if (request.toolNames.includes(name)) {
    return { everyMs: 5, words: [], tool: { name, input } };
  }
  return request.toolNames.includes("ToolSearch")
    ? {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${name}`, max_results: 1 },
        },
      }
    : text(`${name} is not offered`);
};

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const { all } = request;
  const worker = WORKER_TAG.exec(all);
  if (worker && !all.includes('"taint":')) {
    return call(request, NOTE, {
      text: `Parity fact for the ${worker[1]}: releases are cut on Thursdays.`,
    });
  }
  return text("ok");
};

/** (h), (v) and (w): the app's own lines, logged before it waits on the fleet. */
function appLegs(kit: Kit, tag: string, heard: string[]): void {
  const find = (start: string) =>
    heard.find((one) => one.includes(start)) ?? "";
  const after = (said: string, start: string) =>
    said.slice(said.indexOf(start) + start.length);

  // (h) The head at each width.
  let narrower: { set: Set<string>; width: number } | undefined;
  for (const width of HEAD_WIDTHS) {
    const said = find(`head standing [${width}] `);
    const stood = standingOf(said);
    if (!stood) {
      kit.check(`${tag}: h ${width}: the head's standing line`, false, said);
      continue;
    }
    const shown = stood.slots.map((slot) => slot.key);
    const controls = shown
      .filter((key) => key !== "more" && key !== "close")
      .map((key) => (key === "modePick" ? "mode" : key));
    const every = [...controls, ...stood.more].sort();
    const order = shown.map((key) => HEAD_ORDER.indexOf(key));
    const mode = stood.slots.find(
      (slot) => slot.key === "mode" || slot.key === "modePick"
    );
    const reach = Math.max(...stood.slots.map((slot) => slot.x + slot.width));
    kit.check(
      `${tag}: h ${width}: every control stands or is in More, once, each slot 44x44 or more inside the head, in head order, Close last, More standing only while it holds some`,
      stood.head === width &&
        JSON.stringify(every) === JSON.stringify([...WANTED].sort()) &&
        stood.slots.every((slot) => slot.width >= 44 && slot.height >= 44) &&
        reach <= width &&
        order.every(
          (at, index) =>
            at >= 0 && (index === 0 || at > (order[index - 1] ?? -1))
        ) &&
        shown.at(-1) === "close" &&
        shown.includes("more") === stood.more.length > 0,
      after(said, `head standing [${width}] `)
    );
    kit.check(
      `${tag}: h ${width}: the mode is its pick only where its segments have no room left`,
      mode !== undefined &&
        (mode.key === "modePick"
          ? stood.left < stood.segments
          : stood.left >= 0),
      `mode=${mode?.form ?? "none"} left=${stood.left} segments=${stood.segments}`
    );
    if (stood.more.includes("view")) {
      const menu = find(`head more menu [${width}] `);
      kit.check(
        `${tag}: h ${width}: More holds the canvas view as its submenu`,
        menu.includes(`Canvas view[${VIEW_MENU.replaceAll(" | ", ", ")}]`),
        after(menu, `head more menu [${width}] `)
      );
    }
    const set = new Set(controls);
    if (narrower) {
      const lost = [...narrower.set].filter((key) => !set.has(key));
      kit.check(
        `${tag}: h ${width}: it holds every control the ${narrower.width}pt head does`,
        lost.length === 0,
        lost.length ? `lost ${lost.join(",")}` : [...set].join(",")
      );
    }
    narrower = { set, width };
  }

  // (h) More's count: every 1pt from 300 to 800, at 0 open pins and at 2.
  for (const open of [0, 2]) {
    const said = find(`head sweep [open ${open}] `);
    const sweep = SWEEP.exec(said);
    kit.check(
      `${tag}: h sweep ${open} open: every width lays out the same frame after frame${open === 0 ? ", and More keeps its plain width (no second fit)" : ""}`,
      sweep?.[1] === "none" && (open > 0 || sweep?.[2] === "none"),
      after(said, `head sweep [open ${open}] `)
    );
  }
  const recount = heard.find((one) => RECOUNT_LINE.test(one)) ?? "";
  const counted = standingOf(recount);
  const stoodKeys = (counted?.slots ?? [])
    .map((slot) => (slot.key === "modePick" ? "mode" : slot.key))
    .filter((key) => key !== "more" && key !== "close");
  const firstKeys = (counted?.first ?? []).map((key) =>
    key === "modePick" ? "mode" : key
  );
  kit.check(
    `${tag}: h: with pins open, a width where More's count changes what stands: Comments in More, its count's room taken from a control the first fit stood`,
    counted !== undefined &&
      counted.open === 2 &&
      counted.more.includes("comments") &&
      firstKeys.some((key) => !stoodKeys.includes(key)),
    recount
      ? `${recount.slice(recount.indexOf("head standing"))}`
      : "no width found"
  );

  // (v) The canvas view.
  const button = find("canvas view button [head] ");
  kit.check(
    `${tag}: v: the canvas view is the head's ghost, Canvas view, layers, its menu its primary action`,
    button.includes("label=Canvas view glyph=layers-bold-duotone menu=primary"),
    after(button, "canvas view button [head] ")
  );
  const fresh = after(
    find("canvas view menu [fresh] "),
    "canvas view menu [fresh] "
  );
  kit.check(
    `${tag}: v: its entries, as the web's: Scheme, Width, Reduced motion, the zooms; the session's first view checked`,
    fresh === VIEW_MENU,
    fresh
  );
  let view: View = { scheme: "page", width: "own", motion: "on" };
  // Reduced motion is pressed twice: its first line, then its second.
  let motions = 0;
  for (const [words, next, zoom] of CHOICES) {
    view = next(view);
    const want = posted(view, zoom);
    const said = heard
      .filter((one) => one.includes(`canvas view chose [${words}] sent=`))
      .at(words === previewWords.reducedMotion ? motions : 0);
    if (words === previewWords.reducedMotion) {
      motions += 1;
    }
    const sent = said ? after(said, `canvas view chose [${words}] sent=`) : "";
    kit.check(
      `${tag}: v: ${words} hands the page the web's message`,
      sent === want,
      sent === want ? sent : `${sent || "nothing"}  (want ${want})`
    );
  }
  const chosen = after(
    find("canvas view menu [chosen] "),
    "canvas view menu [chosen] "
  );
  kit.check(
    `${tag}: v: the menu checks what was chosen`,
    chosen === VIEW_MENU_CHOSEN,
    chosen
  );
  const kept = after(
    find("canvas view kept [session] "),
    "canvas view kept [session] "
  );
  let keptView: Record<string, unknown> = {};
  try {
    keptView = JSON.parse(kept) as Record<string, unknown>;
  } catch {
    // Unreadable: the check below says so.
  }
  kit.check(
    `${tag}: v: the view is kept for the session under cawco-canvas-view:<session>, as the web stores it`,
    Object.keys(keptView).sort().join(",") === "motion,scheme,width" &&
      keptView.scheme === view.scheme &&
      keptView.width === view.width &&
      keptView.motion === view.motion,
    kept
  );
  const ready = after(
    find("canvas view ready [page] "),
    "canvas view ready [page] sent="
  );
  kit.check(
    `${tag}: v: the page's ready hands it the kept view once`,
    ready === posted(view),
    ready
  );

  // (w) eb42f1374.
  const rim = find("caw rim [round] ");
  kit.check(
    `${tag}: w: the round Caw rim on its 36pt glass, radius 15pt, its stroke one hairline inside the glass's own`,
    [
      "glass=36.0x36.0",
      "path=3.0,3.0,30.0x30.0",
      "radius=15.0",
      "inset=3.0",
      "strokeOuter=2.0",
      "glassEdge=1.0",
    ].every((part) => rim.includes(part)),
    after(rim, "caw rim [round] ")
  );
  // The web's 111bec1fb: the phone's 32pt glass's outline the same hairline
  // in, NeedsCaw.svelte `STAND = STAND_BOX / 2 - 2 * GLASS_EDGE - RIM_STROKE / 2`.
  const stand = find("caw rim [standing] ");
  kit.check(
    `${tag}: w: the phone's standing Caw outline on its 32pt glass, half height 13pt on its path (14pt at the stroke's outer edge), one hairline inside the glass's own`,
    [
      "glass=32.0x32.0",
      "half=13.0",
      "halfOuter=14.0",
      "inset=3.0",
      "strokeOuter=2.0",
      "glassEdge=1.0",
    ].every((part) => stand.includes(part)),
    after(stand, "caw rim [standing] ")
  );
  for (const scheme of ["light", "dark"]) {
    const rule = find(`caw rule [${scheme}] `);
    const fill = RULE_FILL.exec(rule)?.[1];
    const brand = RULE_BRAND.exec(rule)?.[1];
    kit.check(
      `${tag}: w: Caw's panel's section rule is brand-solid, alpha 1, ${scheme}`,
      fill !== undefined && fill === brand && fill.endsWith("a=1.00"),
      after(rule, `caw rule [${scheme}] `)
    );
  }
}

async function sh(script: string): Promise<string> {
  const child = Bun.spawn(["bash", "-s"], {
    stdin: new TextEncoder().encode(`set -euo pipefail\n${script}\n`),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [said, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    throw new Error(`exited ${code}: ${err.trim() || said.trim()}`);
  }
  return said;
}

/** The checkout's simulator app, only when it was built from this tree (scripts/lib/apple-app.ts). */
const appPath = () => freshApp(ROOT);

async function run(kit: Kit): Promise<void> {
  const { path: app, problem } = appPath();
  if (!kit.check("the app is built from this tree", !problem, problem ?? app)) {
    return;
  }
  const pushed: Pushed[] = [];
  const cawrier = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (new URL(request.url).pathname === "/v1/push") {
        pushed.push((await request.json()) as Pushed);
        return Response.json({ ok: true });
      }
      return new Response(null, { status: 204 });
    },
  });
  const fleet = await kit.fleet(respond);
  fleet.env.CAWCO_CAWRIER_ORIGIN = `http://127.0.0.1:${cawrier.port}`;
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  const bytes = (n: number) => crypto.getRandomValues(new Uint8Array(n));
  await fleet.api("/api/push/register", {
    pairingId: crypto.randomUUID(),
    secret: Buffer.from(bytes(32)).toString("base64url"),
    key: Buffer.from(bytes(32)).toString("base64"),
    name: "Probe iPhone",
    platform: "ios",
  });
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();

  // ── A project, and a second machine gone offline ───────────────────────
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await writeFile(
    join(fleet.home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  await Bun.$`git init -q -b main && echo probe > README.md && git add -A && git commit -qm 'First commit'`
    .cwd(src)
    .env({ ...process.env, HOME: fleet.home })
    .quiet();
  const made = await fleet.api<{ id?: string; project?: { id: string } }>(
    "/api/projects",
    { name: "Parity probe", machineId: MACHINE, cwd: src, caw: false }
  );
  const projectId = made.project?.id ?? made.id ?? "";
  const ghost = await fleet.launchMachine(GHOST);
  ghost.agent.kill("SIGTERM");
  await until(
    "the second machine offline",
    () => fleet.api<{ machineId: string; status: string }[]>("/api/agents"),
    (rows) =>
      rows.some((one) => one.machineId === GHOST && one.status !== "online"),
    60_000
  );

  const proposals = async (): Promise<Ask[]> =>
    (await fleet.api<Ask[]>("/api/pending")).filter(
      (ask) => ask.payload.toolName === PROPOSE
    );

  const http = async (method: string, path: string, body?: object) => {
    const response = await fetch(`${fleet.base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, text: await response.text() };
  };
  /** The notes a proposal already cites. */
  const used = new Set<string>();

  /** A worker notes a fact and stops, and the curator proposes from it: the proposal. */
  const curated = async (tag: string) => {
    const worker = await fleet.spawn("claude", `Worker ${tag}`, src, {
      projectId,
    });
    await fleet.send(worker, `${WORKER} ${tag}: note when releases are cut.`);
    await until(
      `${tag}: the worker's turn ended`,
      async () =>
        JSON.stringify(await fleet.api(`/api/instances/${worker}/transcript`)),
      (said) => said.includes('"taint":') || said.includes(NOTE),
      180_000
    );
    await Bun.sleep(2000);
    await fleet.stopSession(worker);
    await until(
      `${tag}: the worker at rest with its transcript`,
      () =>
        fleet.query<{ status: string; session_id: string | null }>(
          "SELECT status, session_id FROM instances WHERE id = ?",
          worker
        )[0],
      (row) =>
        Boolean(row?.session_id) &&
        !["running", "starting"].includes(row?.status ?? ""),
      60_000
    );
    // The worker's note, waiting in the inbox.
    const inbox = await until(
      `${tag}: the worker's note in the inbox`,
      () =>
        fleet.api<{ entries: { path: string }[] }>(
          `/api/projects/${projectId}/folder?path=memory/inbox`
        ),
      (listed) =>
        listed.entries.some((entry) => NOTE_ID.test(entry.path)) &&
        listed.entries.length > 0,
      60_000
    );
    const cited = inbox.entries
      .map((entry) => NOTE_ID.exec(entry.path)?.[0])
      .filter((one): one is string => one !== undefined)
      .find((one) => !used.has(one));
    if (!cited) {
      return { ask: undefined, worker };
    }
    used.add(cited);
    // The curator's proposal, filed as its run's memory_propose files it
    // (memory.ts `Proposal`): a curator run needs a workspace of its own,
    // which a workspace's boundary refuses to make on this Mac, so the
    // worker's session stands as the run's. The hub parks every open
    // proposal as it starts: restarted, it parks this one as a curator's,
    // made in that session (`originInstanceId`).
    const now = new Date();
    const stamp = now
      .toISOString()
      .replace(STAMP_MARKS, "")
      .slice(0, 14)
      .replace(STAMP_DAY, "$1-");
    const id = `p-${stamp}-${crypto.randomUUID().slice(0, 6)}`;
    const history = await fleet.api<{ commits: { sha: string }[] }>(
      `/api/projects/${projectId}/folder/history`
    );
    await http("PUT", `/api/projects/${projectId}/folder/file`, {
      path: `memory/proposals/${id}.json`,
      content: JSON.stringify({
        base: history.commits[0]?.sha ?? "",
        by: "Memory curator",
        files: [
          {
            path: `knowledge/${tag.toLowerCase()}.md`,
            before: "",
            content: `Parity: what this device keeps.\n\n- The parity note is kept. (since ${now.toISOString().slice(0, 10)}, from ${cited})\n`,
          },
        ],
        id,
        notes: [cited],
        projectId,
        session: worker,
        time: now.toISOString(),
        why: `Keep ${cited}`,
      }),
      message: `memory: propose knowledge/${tag.toLowerCase()}.md`,
    });
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    await fleet.agentUp();
    const asks = await until(
      `${tag}: the curator's proposal parked`,
      proposals,
      (found) => found.some((one) => one.requestId === id),
      60_000
    );
    const ask = asks.find((one) => one.requestId === id);
    return { ask, worker };
  };

  for (const device of DEVICES) {
    if (process.env.PROBE_DEVICE && process.env.PROBE_DEVICE !== device.tag) {
      continue;
    }
    const { tag } = device;
    // biome-ignore lint/performance/noAwaitInLoops: one device after the other, each with its own proposal
    const { ask, worker } = await curated(tag);
    if (!ask) {
      kit.check(`${tag}: a curator proposal`, false, "none parked");
      continue;
    }
    const origin = ask.payload.originInstanceId ?? "";
    kit.check(
      `${tag}: the curator's proposal is parked on machine hub under its own id, made in the curator run's session`,
      ask.machineId === "hub" &&
        ask.instanceId.startsWith("p-") &&
        origin !== "" &&
        fleet.instance(origin) !== undefined,
      `${ask.instanceId} on ${ask.machineId}, origin ${origin || "none"}`
    );
    // (p) the hub's push for it.
    const push = await until(
      `${tag}: p: its push`,
      () =>
        pushed.find(
          (one) =>
            one.payload.cawco.kind === "ask" &&
            one.payload.cawco.requestId === ask.requestId
        ),
      Boolean,
      30_000
    ).catch(() => undefined);
    kit.check(
      `${tag}: p: its push carries the session that made it`,
      push?.payload.cawco.originInstanceId === origin &&
        push.payload.cawco.instanceId === ask.instanceId,
      JSON.stringify(push?.payload.cawco ?? null)
    );

    let sim: MacSim | undefined;
    let stream: Subprocess | undefined;
    const heard: string[] = [];
    try {
      sim = await macSim({ runtime: RUNTIME, device: device.type });
      const { udid } = sim;
      console.log(`  ${tag} simulator ${udid}`);
      await sh(`xcrun simctl bootstatus ${udid} -b >/dev/null`);
      await sh(`xcrun simctl install ${udid} "${app}"`);
      const child = Bun.spawn(
        [
          "bash",
          "-c",
          `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "ParityProbe" OR category == "AskProbe" OR category == "Restore" OR category == "Push")'`,
        ],
        { stdout: "pipe", stderr: "ignore" }
      );
      stream = child;
      (async () => {
        const decoder = new TextDecoder();
        const reader = child.stdout.getReader();
        let rest = "";
        for (;;) {
          // biome-ignore lint/performance/noAwaitInLoops: the stream is read in order
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          rest += decoder.decode(value, { stream: true });
          const split = rest.split("\n");
          rest = split.pop() ?? "";
          for (const line of split) {
            if (line.includes("dev.cawco.app")) {
              heard.push(line.replace(LOG_HEAD, ""));
            }
          }
        }
      })().catch(() => undefined);
      await Bun.sleep(1500);
      const ids = [
        `proposal=${ask.instanceId}`,
        `origin=${origin}`,
        `ghost=${GHOST}`,
        ...(device.rail ? [`del=${worker}`] : []),
      ].join(",");
      await sh(
        `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -parity-probe -parity-probe-ids ${ids} >/dev/null`
      );
      // The app reads a confirm in flight with the hub held still (SIGSTOP):
      // "hold the hub" freezes it, "free the hub" lets it go.
      let held = 0;
      let freed = 0;
      const count = (said: string) =>
        heard.filter((one) => one.includes(said)).length;
      const holds = setInterval(() => {
        for (; held < count("parity-probe: hold the hub"); held += 1) {
          fleet.freeze("hub", true);
        }
        for (; freed < count("parity-probe: free the hub"); freed += 1) {
          fleet.freeze("hub", false);
        }
      }, 100);
      await until(
        `${tag}: the probe done`,
        () => heard.find((one) => one.includes("parity-probe: done")),
        Boolean,
        300_000
      ).catch(() => undefined);
      clearInterval(holds);
      if (freed < held) {
        fleet.freeze("hub", false);
      }
      await writeFile(join(kit.out, `${tag}.log`), heard.join("\n"));

      const line = (step: string, id: string) =>
        heard.find((one) => one.includes(`${step} [${id}]`)) ?? "";
      const expect = (
        name: string,
        step: string,
        id: string,
        ...parts: (string | RegExp)[]
      ) => {
        const said = line(step, id);
        const missing = parts.filter((part) =>
          typeof part === "string" ? !said.includes(part) : !part.test(said)
        );
        kit.check(
          `${tag}: ${name}`,
          said !== "" && missing.length === 0,
          said
            ? `${said.slice(said.indexOf(step))}${missing.length ? `  (missing: ${missing.join(", ")})` : ""}`
            : `no "${step}" line`
        );
      };
      const free = "over the page: none";
      const p = ask.instanceId;

      appLegs(kit, tag, heard);

      expect(
        "a: the push's fields route to the session that made the proposal",
        "push route",
        p,
        `session("${origin}")`
      );
      expect(
        "a: it lands on that session, the proposal's card in its composer, nothing presented",
        "push landed",
        p,
        `front: ${origin}`,
        `origin's cards: ${p}`,
        "parked: yes",
        "Caw's panel lists it: yes",
        free
      );
      kit.check(
        `${tag}: a: the card in the origin's composer is answerable, on machine hub`,
        heard.some(
          (one) =>
            one.includes(`probe card ${p} on hub:`) &&
            one.includes("approve on deny on")
        ),
        heard.findLast((one) => one.includes(`probe card ${p}`)) ??
          "no probe card line"
      );
      expect(
        "b: a pane opened on the proposal's own id moves to that session",
        "proposal's pane moved",
        p,
        `front: ${origin}`,
        `origin's cards: ${p}`
      );
      kit.check(
        `${tag}: b: the proposal's own pane said it moves, and never stood as the card alone`,
        heard.some((one) =>
          one.includes(`probe alone ${p}: moves to ${origin}`)
        ) &&
          !heard.some((one) => one.includes(`probe alone ${p}: asking true`)),
        heard.find((one) => one.includes(`probe alone ${p}`)) ??
          "no probe alone line"
      );
      const left = !(await proposals()).some(
        (one) => one.requestId === ask.requestId
      );
      expect(
        "c: Approve in the origin's composer answers it: gone from its composer and Caw's panel",
        "answered in its origin",
        p,
        "origin's cards:  |",
        "parked: no",
        "Caw's panel lists it: no"
      );
      kit.check(
        `${tag}: c: the hub holds it no longer`,
        left,
        left ? "gone from /api/pending" : "still pending"
      );

      const { rail } = device;
      if (rail === "column") {
        expect(
          "r: the rail's column stands beside the page, over the rail's breakpoint",
          "rail column",
          worker,
          "beside: yes",
          "display mode oneBesideSecondary",
          "rail in window: yes"
        );
      }
      if (rail === "sheet") {
        expect(
          "r: under the rail's breakpoint the column stands aside",
          "rail column",
          worker,
          "beside: no",
          "size class regular",
          "display mode secondaryOnly",
          "rail in window: no"
        );
        expect(
          "r: the bar's toggle brings the rail over the page as its sheet",
          "rail sheet",
          worker,
          "over the page: SidebarViewController"
        );
      }
      if (rail) {
        const inRail = `rail: ${rail}`;
        const overRail = "over the rail: none";
        expect(
          "r: the rail's session row carries the session's menu",
          "rail menu",
          worker,
          "attached: yes",
          "Delete transcript",
          "Rename…"
        );
        expect(
          "r: Delete transcript asks under the rail row, in the rail, nothing presented over it",
          "rail delete asked",
          worker,
          inRail,
          "'Delete this transcript?'",
          "under its rail row: yes",
          overRail
        );
        expect(
          "r: it pends in place",
          "rail delete in flight",
          worker,
          inRail,
          "Deleting…",
          "under its rail row: yes",
          overRail
        );
        expect(
          "r: confirmed, the session is deleted: its rail row and its question go",
          "rail delete answered",
          worker,
          inRail,
          "question: none on screen",
          "rail row: gone",
          "hub row: gone"
        );
      }

      expect(
        "m: the unlock opens under the machine's row, nothing presented",
        "unlock opened",
        GHOST,
        UNLOCK_FORM,
        "[Unlock off]",
        free
      );
      expect(
        "m: the hub's refusal of the password is said in the unlock, under the row",
        "unlock answered",
        GHOST,
        UNLOCK_REFUSED,
        free
      );
      expect(
        "m: the hub's refusal of an install stands under the same row, with Try again",
        "install refused",
        GHOST,
        INSTALL_REFUSED,
        free
      );
    } finally {
      stream?.kill();
      await sim?.release();
    }
  }
  await cawrier.stop(true);
}

export default { name: "ios-parity", run } satisfies Spec;
