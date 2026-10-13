#!/usr/bin/env bun
/**
 * iOS scene restoration probe: a relaunch with a saved scene comes back to
 * the screen the person left, on iPhone and iPad alike, with no DEBUG hook.
 *
 *   bun scripts/probe-ios-restore.ts [--app <CawCo.app>] [--device phone|pad|both]
 *                                    [--runs <n>] [--rows <n>] [--hold] [--keep]
 *
 * Run from the repo root on the Mac (a CawCo workspace on the Mac runs it
 * too: the scratch fleet is loopback, the simulators are local). It:
 *
 *  1. compiles this checkout (build-both.sh ios --compile-only), unless
 *     `--app` names a built app;
 *  2. stands up a scratch fleet and seeds one session with `--rows` rows
 *     (default 160), each a Bash call;
 *  3. on an iOS 18.5 simulator of its own per device, reaches each screen
 *     through the app's own UI (a Home row, the transcript dragged up, the
 *     sidebar's Usage), then `--runs` times (default 3): the Home button (the
 *     scene saves its state), `simctl terminate`, a plain relaunch;
 *  4. checks each relaunch: into the session left scrolled up, the session
 *     is on screen with the row that led the view in view again; from Home,
 *     Home; from the Usage page, the Usage page.
 *
 * Launches carry only the hub's address (`-cawco-hub-url`, a defaults key)
 * and the paywall's sandbox: never `-open-session`.
 * `--hold` stands everything up, prints the simulators, and waits for
 * `<captures>/stop` before cleaning up, for driving the app by hand.
 * Captures go to $TMPDIR/ios-restore/ (or .probe/ outside a workspace).
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { type MacSim, macSim } from "./lib/mac-sim";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const keep = args.includes("--keep");
const hold = args.includes("--hold");
const ROWS = Number(option("--rows") ?? 160);
const RUNS = Number(option("--runs") ?? 3);
const DEVICES =
  (option("--device") ?? "both") === "both"
    ? ["phone", "pad"]
    : [option("--device") as string];
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const AXE = "/opt/homebrew/bin/axe";
const out =
  process.env.CAWCO_WORKSPACE && process.env.TMPDIR
    ? join(process.env.TMPDIR, "ios-restore")
    : join(root, ".probe", "ios-restore");
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
const pause = (ms: number) => Bun.sleep(ms);
const sh = async (script: string): Promise<string> => {
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
};

// ── 1. Compile ───────────────────────────────────────────────────────────
let app = option("--app");
if (!app) {
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "inherit",
    }
  );
  const text = await new Response(build.stdout).text();
  process.stdout.write(text);
  if ((await build.exited) !== 0 || !/^BUILT iOS 18\.5$/m.test(text)) {
    console.log("FAIL compile");
    process.exit(1);
  }
  const top = (
    await Bun.$`git -C ${root} rev-parse --show-toplevel`.text()
  ).trim();
  const name = top === join(home, "cockpit") ? "main" : top.split("/").at(-1);
  app = `${join(process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"), "cawco-apple")}/${name}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;
}

// ── 2. The scratch fleet, its session seeded ─────────────────────────────
const MARK = `restore probe ${crypto.randomUUID().slice(0, 6)}`;
const TITLE = "Restore probe";
let calls = 0;
const respond = (request: Seen): Reply => {
  if (request.tools && request.all.includes(MARK) && calls < ROWS) {
    calls += 1;
    const n = String(calls).padStart(4, "0");
    return {
      everyMs: 1,
      words: [],
      tool: {
        name: "Bash",
        input: { command: `echo row-${n}`, description: `Print row-${n}` },
      },
    };
  }
  return { everyMs: 5, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-ios-restore", respond });

interface Page {
  blocks: { id: string }[];
  cursor: string | null;
  tail?: { busy?: boolean };
}
const walk = async (id: string) => {
  const newest = await fleet.api<Page>(`/api/instances/${id}/transcript`);
  let rows = newest.blocks.length;
  let { cursor } = newest;
  while (cursor) {
    // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
    const page = await fleet.api<Page>(
      `/api/instances/${id}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
    );
    rows += page.blocks.length;
    ({ cursor } = page);
  }
  return { rows, busy: newest.tail?.busy === true };
};

// ── 3. The simulator's screen ────────────────────────────────────────────
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
}
let sim: MacSim | undefined;
let udid = "";
let device = "";
let lastTree: unknown;
async function tree(): Promise<Node[]> {
  const nodes: Node[] = [];
  const walkTree = (at: unknown) => {
    if (Array.isArray(at)) {
      for (const child of at) {
        walkTree(child);
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
      frame: o.frame as Frame | undefined,
    });
    walkTree(o.children);
  };
  // Right after a launch the app has no accessibility tree to give yet
  // ("No translation object returned"), and axe now and then crashes
  // reading one: the read is tried again before it counts as failed.
  for (let attempt = 1; ; attempt += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one read after the other
      lastTree = JSON.parse(await sh(`${AXE} describe-ui --udid ${udid}`));
      break;
    } catch (error) {
      if (attempt >= 8) {
        throw error;
      }
      await pause(1000);
    }
  }
  walkTree(lastTree);
  return nodes;
}
const ROW = /row-(\d{4})/;
interface Place {
  area: { bottom: number; mid: number; top: number };
  first?: string;
  rows: string[];
  transcript: boolean;
}
/** The transcript's rows wholly in view, top to bottom. */
async function place(): Promise<Place> {
  const nodes = await tree();
  const list = nodes.find((n) => n.label === "Session transcript")?.frame;
  // `mid`: the transcript's own centre line (a wide screen's rail stands left of it).
  const area = list
    ? {
        top: list.y,
        bottom: list.y + list.height,
        mid: Math.round(list.x + list.width / 2),
      }
    : { top: 110, bottom: 700, mid: 200 };
  const tops = new Map<string, number>();
  for (const node of nodes) {
    const row = node.label?.match(ROW)?.[1];
    const y = node.frame?.y;
    if (
      row &&
      y !== undefined &&
      y >= area.top &&
      y + (node.frame?.height ?? 0) <= area.bottom &&
      !tops.has(row)
    ) {
      tops.set(row, y);
    }
  }
  const rows = [...tops.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([row]) => row);
  return { area, first: rows[0], rows, transcript: list !== undefined };
}
/** What the screen says: its labelled elements, top to bottom. */
const screen = async () =>
  (await tree())
    .filter((n) => n.label && n.frame)
    .slice(0, 16)
    .map(
      (n) => `${Math.round(n.frame?.y ?? 0)}:${(n.label ?? "").slice(0, 28)}`
    )
    .join(" | ");
const tapOn = (frame: Frame) =>
  sh(
    `${AXE} tap -x ${Math.round(frame.x + frame.width / 2)} -y ${Math.round(frame.y + frame.height / 2)} --udid ${udid}`
  );
/** The first element `accept` takes whose centre is on the screen (a paged list keeps its other pages' elements off it). */
const find = async (
  accept: (node: Node) => boolean,
  what: string,
  ms = 20_000
) =>
  (await until(
    what,
    async () => {
      const nodes = await tree();
      const window = nodes.find((n) => n.frame && n.frame.width > 0)?.frame;
      const onScreen = (f: Frame) =>
        !window ||
        (f.x + f.width / 2 > window.x &&
          f.x + f.width / 2 < window.x + window.width &&
          f.y + f.height / 2 > window.y &&
          f.y + f.height / 2 < window.y + window.height);
      return nodes.find((n) => n.frame && onScreen(n.frame) && accept(n));
    },
    (n) => n !== undefined,
    ms
  )) as Node & { frame: Frame };
let shots = 0;
const shot = async (name: string) => {
  shots += 1;
  const file = join(out, `${device}-${name}.png`);
  await sh(`xcrun simctl io ${udid} screenshot "${file}" >/dev/null 2>&1`);
  await writeFile(
    join(out, `${device}-${name}.json`),
    JSON.stringify(lastTree)
  );
  return file;
};
let logger: Subprocess | undefined;
const logLines: string[] = [];
const listen = () => {
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Restore"'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of child.stdout as unknown as AsyncIterable<Uint8Array>) {
      rest += decoder.decode(chunk, { stream: true });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      logLines.push(...lines);
    }
  })().catch(() => undefined);
  return child;
};
const launch = () =>
  sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} >/dev/null`
  );
/** Home button (the scene saves its state on the way out), then the system ends the app. */
const leave = async () => {
  await sh(`${AXE} button home --udid ${udid}`);
  await pause(2500);
  await sh(`xcrun simctl terminate ${udid} dev.cawco.app`);
  await pause(1000);
};
/** Lets the relaunch settle: the fleet read, the restore applied, any push or pop played out. */
const settle = () => pause(9000);

const isHome = (nodes: Node[]) =>
  !nodes.some((n) => n.label === "Session transcript") &&
  nodes.some((n) => n.id === "CawCoScreens.HomeView");
/** The Usage page: the bar's crumb names it, with no limits sheet up. */
const isUsage = (nodes: Node[]) =>
  nodes.some((n) => n.label === "Usage") &&
  !nodes.some((n) => n.id === "usage-sheet");
const named = (n: Node) =>
  n.label?.includes(TITLE) === true && !n.label.startsWith("Close");

/**
 * The session's Home row (on a wide screen, the rail's Home): it has
 * finished, so the Finished tab holds it. Never its tab in a group's strip:
 * a tab tapped on a wide screen opens its details card, and the next drag
 * only puts the card away.
 */
const openFromHome = async () => {
  // A wide screen lands on the conversation itself when nothing is open (ShellController `landIfEmpty`).
  if ((await place()).transcript) {
    return;
  }
  const row = (n: Node) => n.label === `Finished: ${TITLE}`;
  if (!(await tree()).some((n) => n.frame && row(n))) {
    await tapOn(
      (await find((n) => n.label === "Finished", "Home's Finished tab", 60_000))
        .frame
    );
    await pause(1500);
  }
  await tapOn((await find(row, "the session's Home row", 30_000)).frame);
};

async function runDevice(kind: string, sessionId: string) {
  device = kind;
  const type = kind === "phone" ? "iPhone 16 Pro" : "iPad Pro 11-inch (M4)";
  sim = await macSim({
    runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
    device: type,
  });
  ({ udid } = sim);
  console.log(`  ${kind}: ${type} ${udid} (iOS 18.5)`);
  await sh(`xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl ui ${udid} appearance light
xcrun simctl install ${udid} "${app}"`);
  logger = listen();
  await launch();
  if (hold) {
    console.log(
      `  holding ${kind} ${udid} on ${fleet.base}; session ${sessionId}: touch ${join(out, "stop")} to end`
    );
    await until(
      "the stop file",
      () =>
        access(join(out, "stop")).then(
          () => true,
          () => false
        ),
      (stop) => stop,
      6 * 60 * 60_000
    );
    return;
  }
  await sessionLeftScrolledUp(kind);
  await fromHome(kind);
  await fromUsage(kind);
}

const RESTORE_LINE = /restor|place/i;
const RESTORE_PREFIX = /^.*Restore\]\s*/;

/** The session, left scrolled up: each relaunch brings it back with the row that led the view in view. */
async function sessionLeftScrolledUp(kind: string) {
  await openFromHome();
  await until(
    "the transcript's rows",
    place,
    (shown) => shown.first !== undefined,
    60_000
  );
  await pause(2500);
  let at = await place();
  for (let drag = 0; drag < 4; drag += 1) {
    const height = at.area.bottom - at.area.top;
    // biome-ignore lint/performance/noAwaitInLoops: each drag starts where the last one left the list
    await sh(
      `${AXE} drag --start-x ${at.area.mid} --start-y ${Math.round(at.area.top + 0.15 * height)} --end-x ${at.area.mid} --end-y ${Math.round(at.area.top + 0.9 * height)} --duration 0.4 --steps 12 --udid ${udid}`
    );
    await pause(1500);
    at = await place();
  }
  const want = at.rows[Math.floor(at.rows.length / 2)];
  console.log(
    `  ${kind}: left scrolled up, rows ${at.rows[0]}…${at.rows.at(-1)} in view (marking row-${want})`
  );
  await shot("session-left");
  for (let run = 1; run <= RUNS; run += 1) {
    const from = logLines.length;
    // biome-ignore lint/performance/noAwaitInLoops: one relaunch after the other
    await leave();
    await launch();
    await settle();
    const now = await place();
    await shot(`session-relaunch-${run}`);
    check(
      `${kind} relaunch ${run} into the session left scrolled up`,
      now.transcript && want !== undefined && now.rows.includes(want),
      now.transcript
        ? `transcript on screen, rows ${now.rows[0]}…${now.rows.at(-1)} (row-${want} ${now.rows.includes(want ?? "") ? "in view" : "not in view"})`
        : `no transcript: ${await screen()}`
    );
    const restoreLines = [...new Set(logLines.slice(from))].filter((l) =>
      RESTORE_LINE.test(l)
    );
    console.log(
      `    log: ${restoreLines.map((l) => l.replace(RESTORE_PREFIX, "")).join(" | ") || "nothing"}`
    );
  }
}

/** Home: each relaunch lands on Home. */
async function fromHome(kind: string) {
  if (kind === "phone") {
    // The session page's sidebar toggle, then the sidebar's Fleet: Home.
    await tapOn(
      (
        await find(
          (n) => n.label === "Open navigation",
          "the session page's sidebar toggle"
        )
      ).frame
    );
    await pause(1500);
    await tapOn(
      (await find((n) => n.label === "Fleet", "the sidebar's Fleet")).frame
    );
  } else {
    // The wide screen's Home is the fleet's page: the rail's brand goes there.
    await tapOn(
      (await find((n) => n.label === "Caw&Co", "the rail's brand")).frame
    );
  }
  await pause(2500);
  if (kind === "phone") {
    await until("Home before leaving", tree, isHome, 20_000);
  }
  console.log(`  ${kind}: on Home: ${await screen()}`);
  await shot("home-left");
  for (let run = 1; run <= RUNS; run += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one relaunch after the other
    await leave();
    await launch();
    await settle();
    const nodes = await tree();
    await shot(`home-relaunch-${run}`);
    const homeShown =
      isHome(nodes) || (kind === "pad" && !isUsage(nodes) && nodes.some(named));
    check(
      `${kind} relaunch ${run} from Home`,
      homeShown,
      homeShown ? "lands on Home" : `elsewhere: ${await screen()}`
    );
  }
}

/**
 * The Usage page: each relaunch lands on it. The usage strip (Home's on a
 * phone, the rail's on a wide screen) opens the limits sheet, and its foot
 * opens the page.
 */
async function fromUsage(kind: string) {
  await tapOn(
    (await find((n) => n.id === "usage-strip", "the usage strip")).frame
  );
  await tapOn(
    (await find((n) => n.label === "Open usage", "the sheet's Open usage"))
      .frame
  );
  await until("the Usage page", tree, isUsage, 20_000);
  await pause(2000);
  await shot("usage-left");
  for (let run = 1; run <= RUNS; run += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: one relaunch after the other
    await leave();
    await launch();
    await settle();
    const nodes = await tree();
    await shot(`usage-relaunch-${run}`);
    check(
      `${kind} relaunch ${run} from the Usage page`,
      isUsage(nodes),
      isUsage(nodes)
        ? "lands on the Usage page"
        : `elsewhere: ${await screen()}`
    );
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
  const sessionId = await fleet.spawn("claude", TITLE);
  await fleet.send(sessionId, `${MARK}: print the rows.`);
  const seeded = await until(
    `${ROWS} rows in the session`,
    () => walk(sessionId),
    (held) => held.rows >= ROWS && !held.busy,
    20 * 60_000
  );
  console.log(`  seeded: ${seeded.rows} rows`);
  for (const kind of DEVICES) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: one simulator at a time
      await runDevice(kind, sessionId);
    } catch (error) {
      check(
        `${kind} probe`,
        false,
        error instanceof Error ? error.message : String(error)
      );
      await tree()
        .then(() => shot("error"))
        .catch(() => undefined);
    } finally {
      logger?.kill();
      await writeFile(join(out, `${kind}-log.txt`), logLines.join("\n"));
      logLines.length = 0;
      await sim?.release();
      sim = undefined;
    }
  }
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(`Captures: ${out} (${shots})`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
