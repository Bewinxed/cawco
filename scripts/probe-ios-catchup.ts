#!/usr/bin/env bun
/**
 * iOS transcript catch-up and head probe: the "Catching up…" pill shows once
 * while a restored place is read back to and hides once when it is in hand,
 * and the transcript's head fades its rows out toward the tab strip, never
 * brighter than they stand below it.
 *
 *   bun scripts/probe-ios-catchup.ts [--rows <n>] [--app <CawCo.app>] [--keep]
 *
 * Run from the repo root on the Mac itself (a CawCo workspace on the Mac
 * runs it too: the scratch fleet is loopback, the simulator is local). It:
 *
 *  1. compiles this checkout (build-both.sh ios --compile-only), unless
 *     `--app` names a built app to run instead;
 *  2. stands up a scratch fleet (scratch-fleet.ts) and seeds one session
 *     with `--rows` rows (default 820: the newest page and four older ones),
 *     each a Bash call, and a short one of two turns that fits one screen;
 *  3. puts a counting proxy between the app and the hub: every read of the
 *     long session's transcript, newest or older, with when it was asked;
 *  4. on an iOS 18.5 iPhone simulator of its own, opens the long session,
 *     drags up until three older pages have been read, sends the app home
 *     (its scene saves the place) and relaunches it: the restored place is
 *     in a page the new read does not hold, so the pages before it are read
 *     back to it while the pill says "Catching up…";
 *  5. reads the app's own log of the pill (`dock Catching up… shown|hidden`)
 *     and counts its transitions, overall and per second, while captures of
 *     the load go to the capture folder;
 *  6. once the place is in hand, captures the head with rows under it in
 *     light and dark, and the short session at its very top in both.
 *
 * Checks: the pill shows at most once and hides at most once for the load,
 * and never changes more than twice in any second; the reads are the newest
 * page once and each older page once. The head's ink is measured by
 * scripts/probe-ios-headfade.ts from the captures this writes.
 *
 * Captures go to $TMPDIR/ios-transcript/<label>/ (or .probe/ outside a
 * workspace). It stops only what it started: the fleet's processes, the
 * proxy, the log stream, and the simulator it created (deleted at the end).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const keep = args.includes("--keep");
const ROWS = Number(option("--rows") ?? 820);
const LABEL = option("--label") ?? "run";
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
const AXE = "/opt/homebrew/bin/axe";
const PILL = "Catching up…";
const out = join(
  process.env.CAWCO_WORKSPACE && process.env.TMPDIR
    ? join(process.env.TMPDIR, "ios-transcript")
    : join(root, ".probe", "ios-transcript"),
  LABEL
);
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
    { cwd: root, stdout: "pipe", stderr: "inherit" }
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

// ── 2. The scratch fleet, its sessions seeded ────────────────────────────
const MARK = `catchup probe ${crypto.randomUUID().slice(0, 6)}`;
const SHORT = `short probe ${crypto.randomUUID().slice(0, 6)}`;
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
  if (request.all.includes(SHORT)) {
    return {
      everyMs: 2,
      words:
        "The head of this transcript stands at the very top of the list, so nothing is under the edge and nothing fades. A second line of words follows the first one here."
          .split(" ")
          .map((word) => `${word} `),
    };
  }
  return { everyMs: 5, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-ios-catchup", respond });

interface Page {
  blocks: { id: string }[];
  cursor: string | null;
  tail?: { busy?: boolean };
}
const walk = async (id: string) => {
  const newest = await fleet.api<Page>(`/api/instances/${id}/transcript`);
  let rows = newest.blocks.length;
  let pages = 1;
  let { cursor } = newest;
  while (cursor) {
    // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
    const page = await fleet.api<Page>(
      `/api/instances/${id}/transcript?limit=250&before=${encodeURIComponent(cursor)}`
    );
    rows += page.blocks.length;
    pages += 1;
    ({ cursor } = page);
  }
  return { rows, pages, busy: newest.tail?.busy === true };
};

// ── 3. The counting proxy ────────────────────────────────────────────────
interface Read {
  at: number;
  before: string | null;
  older: boolean;
}
/** `holding`: the app's socket is refused, so it reconnects only once let through. */
const wire: { holding: boolean; reads: Read[] } = {
  reads: [],
  holding: false,
};
let sessionId = "";
interface Link {
  path: string;
  queue: (string | Uint8Array<ArrayBuffer>)[];
  upstream?: WebSocket;
}
const proxy = Bun.serve<Link>({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      if (wire.holding) {
        return new Response("held", { status: 503 });
      }
      const data: Link = { path: `${url.pathname}${url.search}`, queue: [] };
      return server.upgrade(request, { data })
        ? undefined
        : new Response("upgrade failed", { status: 400 });
    }
    const headers = new Headers(request.headers);
    headers.delete("host");
    if (
      request.method === "GET" &&
      url.pathname === `/api/instances/${sessionId}/transcript`
    ) {
      const before = url.searchParams.get("before");
      wire.reads.push({ at: Date.now(), before, older: before !== null });
    }
    const answer = await fetch(`${fleet.base}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body:
        request.method === "GET" || request.method === "HEAD"
          ? undefined
          : await request.arrayBuffer(),
      redirect: "manual",
    });
    const reply = new Headers(answer.headers);
    for (const name of [
      "content-encoding",
      "content-length",
      "transfer-encoding",
    ]) {
      reply.delete(name);
    }
    return new Response(await answer.arrayBuffer(), {
      status: answer.status,
      headers: reply,
    });
  },
  websocket: {
    open(ws) {
      const upstream = new WebSocket(
        `${fleet.base.replace("http", "ws")}${ws.data.path}`
      );
      upstream.binaryType = "arraybuffer";
      ws.data.upstream = upstream;
      upstream.onopen = () => {
        for (const message of ws.data.queue.splice(0)) {
          upstream.send(message);
        }
      };
      upstream.onmessage = (event) =>
        ws.send(event.data as string | ArrayBuffer);
      upstream.onclose = () => ws.close();
      upstream.onerror = () => ws.close();
    },
    message(ws, message) {
      const frame =
        typeof message === "string" ? message : new Uint8Array(message);
      const { upstream } = ws.data;
      if (upstream?.readyState === WebSocket.OPEN) {
        upstream.send(frame);
      } else {
        ws.data.queue.push(frame);
      }
    },
    close(ws) {
      ws.data.upstream?.close();
    },
  },
});
const port = proxy.port as number;

// ── 4. The simulator ─────────────────────────────────────────────────────
let udid = "";
let logger: Subprocess | undefined;
const logLines: string[] = [];
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
  lastTree = JSON.parse(await sh(`${AXE} describe-ui --udid ${udid}`));
  walkTree(lastTree);
  return nodes;
}
const ROW = /row-(\d{4})/;
interface Place {
  area: { bottom: number; top: number };
  first?: { row: string; y: number };
  rows: string[];
}
async function place(): Promise<Place> {
  const nodes = await tree();
  const list = nodes.find((n) => n.label === "Session transcript")?.frame;
  const area = list
    ? { top: list.y, bottom: list.y + list.height }
    : { top: 110, bottom: 700 };
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
  const rows = [...tops.entries()].sort((a, b) => a[1] - b[1]);
  return {
    area,
    first: rows[0] ? { row: rows[0][0], y: rows[0][1] } : undefined,
    rows: rows.map(([row]) => row),
  };
}
const placed = () =>
  until(
    "rows in view (describe-ui)",
    place,
    (at) => at.first !== undefined,
    20_000
  );
const flick = async (at: Place) => {
  const height = at.area.bottom - at.area.top;
  await sh(
    `${AXE} drag --start-x 200 --start-y ${Math.round(at.area.top + 0.12 * height)} --end-x 200 --end-y ${Math.round(at.area.top + 0.92 * height)} --duration 0.3 --steps 12 --udid ${udid}`
  );
  await pause(1600);
};
let shots = 0;
const shot = async (name: string) => {
  shots += 1;
  const file = join(out, `${name}.png`);
  await sh(`xcrun simctl io ${udid} screenshot "${file}" >/dev/null 2>&1`);
  return file;
};
const listen = () => {
  logLines.length = 0;
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Restore")'`,
    ],
    { stdout: "pipe", stderr: "ignore" }
  );
  (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of child.stdout) {
      rest += decoder.decode(chunk, { stream: true });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      logLines.push(...lines);
    }
  })().catch(() => undefined);
  return child;
};
/** Launches the app on the hub; on `id`, or (none) wherever its scene's saved state stands. */
const launch = (id?: string) =>
  sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port}${id ? ` -open-session ${id}` : ""} >/dev/null`
  );
/** The pill's transitions in the app's log from line `from` on: when (ms of the log's clock) and which way. */
const DOCK = /^(\S+ \S+).*dock (.+) (shown|hidden) (\S+)/;
/** Panes side by side each float their own pill: only the long session's (its id's first 8) counts. */
const transitions = (title: string, from = 0) =>
  // The log stream can hand a line over twice: each line once.
  [...new Set(logLines.slice(from))].flatMap((line) => {
    const m = line.match(DOCK);
    if (!m || m[2] !== title || m[4] !== sessionId.slice(0, 8)) {
      return [];
    }
    return [
      { at: Date.parse(m[1].replace(" ", "T")), shown: m[3] === "shown", line },
    ];
  });
/** Checks one load's transitions: at most one show and one hide, never more than two in a second. */
const counted = (label: string, moves: ReturnType<typeof transitions>) => {
  for (const move of moves) {
    console.log(`  ${move.line.trim()}`);
  }
  const shown = moves.filter((move) => move.shown).length;
  const hidden = moves.length - shown;
  let most = 0;
  for (const move of moves) {
    most = Math.max(
      most,
      moves.filter((other) => other.at >= move.at && other.at < move.at + 1000)
        .length
    );
  }
  check(
    `${label}: the pill shows at most once and hides at most once`,
    shown <= 1 && hidden <= 1,
    `${shown} show(s), ${hidden} hide(s) of "${PILL}"`
  );
  check(
    `${label}: the pill never changes more than twice in a second`,
    most <= 2,
    `at most ${most} transition(s) in any one second`
  );
};

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const shortId = await fleet.spawn("claude", "Short probe");
  await fleet.send(shortId, `${SHORT}: say two lines.`);
  sessionId = await fleet.spawn("claude", "Catch-up probe");
  await fleet.send(sessionId, `${MARK}: print the rows.`);
  const seeded = await until(
    `${ROWS} rows in the session`,
    () => walk(sessionId),
    (held) => held.rows >= ROWS && !held.busy,
    40 * 60_000
  );
  console.log(`  seeded: ${seeded.rows} rows in ${seeded.pages} hub pages`);

  udid = (
    await sh(`TYPE=$(xcrun simctl list devicetypes -j | python3 -c '
import json, sys
names = {d["name"]: d["identifier"] for d in json.load(sys.stdin)["devicetypes"]}
print(names["iPhone 16 Pro"])
')
xcrun simctl create "CawCo probe catchup" "$TYPE" com.apple.CoreSimulator.SimRuntime.iOS-18-5`)
  ).trim();
  console.log(`  simulator ${udid} (iOS 18.5)`);
  await sh(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl ui ${udid} appearance light
xcrun simctl install ${udid} "${app}"`);

  // The short session first: its very top, light and dark (the head absent).
  logger = listen();
  await launch(shortId);
  await until(
    "the short session's words on screen",
    tree,
    (nodes) => nodes.some((n) => n.label?.includes("nothing fades") === true),
    120_000
  );
  await pause(2500);
  await shot("top-light");
  await tree();
  await writeFile(join(out, "top-light.json"), JSON.stringify(lastTree));
  await sh(`xcrun simctl ui ${udid} appearance dark`);
  await pause(1500);
  await shot("top-dark");
  await tree();
  await writeFile(join(out, "top-dark.json"), JSON.stringify(lastTree));
  await sh(`xcrun simctl ui ${udid} appearance light`);

  // The long session: up three older pages, then home, then back.
  await launch(sessionId);
  await until(
    "the long session's rows on screen",
    place,
    (shown) => shown.first !== undefined,
    120_000
  );
  await pause(3000);
  let at = await placed();
  for (let drag = 0; drag < 80; drag += 1) {
    if (wire.reads.filter((read) => read.older).length >= 3) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: each drag starts where the last one left the list
    await flick(at);
    at = await placed();
  }
  await flick(at);
  await pause(2500);
  at = await placed();
  const olderBefore = wire.reads.filter((read) => read.older).length;
  console.log(
    `  scrolled up: ${olderBefore} older page(s) read; first row in view row-${at.first?.row}`
  );
  await sh(`${AXE} button home --udid ${udid}`);
  await pause(3000);
  const saved = logLines.filter((line) => line.includes("place saved for"));
  console.log(`  saved: ${saved.at(-1) ?? "nothing logged"}`);
  await sh(`xcrun simctl terminate ${udid} dev.cawco.app`);
  logger.kill();
  await pause(1000);

  // The relaunch: the place is restored into an unread page.
  wire.reads = [];
  logger = listen();
  await pause(1500);
  const relaunched = Date.now();
  // The scene's saved state brings the session back at its place; `-open-session`
  // names the same session and lands through the same route (ShellController `land`).
  await launch(sessionId);
  const loadShots: string[] = [];
  while (Date.now() - relaunched < 9000) {
    const name = `load-${String(loadShots.length).padStart(2, "0")}`;
    // biome-ignore lint/performance/noAwaitInLoops: one capture after the other
    loadShots.push(await shot(name));
    await pause(250);
  }
  /** What the screen says: its labelled elements, top to bottom (for the log). */
  const screen = async () =>
    (await tree())
      .filter((n) => n.label && n.frame)
      .slice(0, 14)
      .map(
        (n) => `${Math.round(n.frame?.y ?? 0)}:${(n.label ?? "").slice(0, 32)}`
      )
      .join(" | ");
  console.log(`  screen after the relaunch: ${await screen()}`);
  const want = at.first?.row;
  const back = await until(
    `row-${want} in view again`,
    place,
    (now) => want !== undefined && now.rows.includes(want),
    90_000
  ).catch(() => undefined);
  await pause(3000);
  console.log(`  screen once the place was waited for: ${await screen()}`);
  const restored = logLines.filter(
    (line) =>
      line.includes("place to restore") || line.includes("place restored")
  );
  console.log(`  restore log: ${restored.join(" | ") || "nothing"}`);
  const older = wire.reads.filter((read) => read.older);
  const newest = wire.reads.length - older.length;
  const distinct = new Set(older.map((read) => read.before)).size;
  check(
    "the restored place is in hand",
    back !== undefined,
    back
      ? `row-${want} in view: ${back.rows[0]}…${back.rows.at(-1)}`
      : `row-${want} never came back into view in 90s`
  );
  counted("the restore", transitions(PILL));
  check(
    "the reads are the newest page once and each older page once",
    newest === 1 && distinct === older.length,
    `${newest} newest read(s), ${older.length} older read(s) (${distinct} distinct cursors)`
  );
  console.log(`  load captures: ${loadShots.length} (${loadShots[0]} …)`);

  // The head with rows under it, light and dark, at the restored place.
  await shot("head-light");
  await tree();
  await writeFile(join(out, "head-light.json"), JSON.stringify(lastTree));
  await sh(`xcrun simctl ui ${udid} appearance dark`);
  await pause(1500);
  await shot("head-dark");
  await tree();
  await writeFile(join(out, "head-dark.json"), JSON.stringify(lastTree));
  await sh(`xcrun simctl ui ${udid} appearance light`);
  await pause(1500);

  // The hub restarts with the app's socket held off until the agent is back:
  // the app's resume then meets a stream that starts again empty, is
  // answered with a reset, and reads the newest page again over the rows
  // drawn, the place still the restored one (Ledger `rereadHistory`), with
  // the machine there to serve it.
  const from = logLines.length;
  const readsBefore = wire.reads.length;
  wire.holding = true;
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await pause(5000);
  wire.holding = false;
  await until(
    "the newest page read again",
    () =>
      Promise.resolve(
        wire.reads.slice(readsBefore).filter((read) => !read.older).length
      ),
    (count) => count >= 1,
    60_000
  ).catch(() => 0);
  await pause(8000);
  console.log(
    `  hub restarted, socket held until the agent was back: ${wire.reads.slice(readsBefore).filter((read) => !read.older).length} newest and ${wire.reads.slice(readsBefore).filter((read) => read.older).length} older read(s) after`
  );
  counted("the read again over drawn rows", transitions(PILL, from));
  const after = await place().catch(() => undefined);
  console.log(
    `  after the read again: ${after?.first ? `rows ${after.rows[0]}…${after.rows.at(-1)}` : `no row in view: ${await screen()}`}`
  );
  await writeFile(join(out, "log.txt"), logLines.join("\n"));
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  logger?.kill();
  if (udid) {
    await sh(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
      console.log(`  simulator cleanup: ${error}`)
    );
  }
  proxy.stop(true);
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(`Captures: ${out} (${shots})`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
