#!/usr/bin/env bun
/**
 * iOS transcript paging probe: the app reads a transcript's older history as
 * the web does. On open it reads the newest page only; it reads one older
 * page (250 rows, `before` = cursor) each time the reader scrolls near the
 * first rows it holds, one read at a time, and the reader's place does not
 * move when the older rows are put above it.
 *
 *   bun scripts/probe-ios-paging.ts [--before <ref>] [--rows <n>] [--keep]
 *
 * Run from the repo root, either on the Mac itself or from a shell that
 * reaches the Mac as `ssh mac` (not a CawCo workspace). It:
 *
 *  1. compiles the app (build-both.sh ios --compile-only): this checkout,
 *     and with `--before <ref>` that commit too, from a worktree of its own
 *     under ~/.worktrees (removed at the end);
 *  2. stands up a scratch fleet (scratch-fleet.ts: a real hub, agent and
 *     sessiond, Claude Code on a mock model) and seeds one session with
 *     `--rows` rows (default 820): the mock answers its one turn with that
 *     many Bash calls, `echo row-0001` on, each a row of its own;
 *  3. puts a counting proxy between the app and the hub: it sees every read
 *     of that session's transcript (the newest page, or an older one by its
 *     `before`), how many are out at once, and the cursor each answers with,
 *     and from step (c) on it holds each older page's answer until the probe
 *     has measured the screen, so the place is read before and after the
 *     rows join;
 *  4. on a simulator of its own, launches the app with `-paywall-env sandbox`
 *     opened on that session and drags one finger (axe `drag`, never `swipe`)
 *     down the transcript to scroll it toward its start:
 *     (a) the session holds at least 800 rows;
 *     (b) opening it reads one page, the newest;
 *     (c) the first drag that brings the reader near the first rows held
 *         reads exactly one more page, and the first row in view keeps its
 *         id and its y (within 1pt, axe describe-ui, retried) as it lands:
 *         the row first in view while the page was held is measured again
 *         after, and stays first unless the loading strip stood above it
 *         (the rows that join take the strip's room);
 *     (d) dragging on reads a page at a time until the cursor is nil: the
 *         reads are the hub's own page count, never two out at once, and
 *         every page that joined kept the place.
 *     The app's own log (`page adopted for …`, `older page read for …`) is
 *     read beside the wire and has to agree with it.
 *
 * With `--before <ref>` the same steps run first against that commit's app
 * and print as `before`: they show what it did (main drained every page on
 * open). Only this checkout's run decides the exit code.
 *
 * Prints `PASS <step>` / `FAIL <step>` per check, exits 0 only if every check
 * of this checkout's run passed. It stops only what it started: the fleet's
 * processes, the proxy, the tunnel, the log stream, and the simulator it
 * created (deleted at the end). `--keep` keeps the fleet's sandbox.
 */
import { mkdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const keep = args.includes("--keep");
const beforeRef = option("--before");
const ROWS = Number(option("--rows") ?? 820);
const root = resolve(import.meta.dir, "..");
const home = process.env.HOME ?? "";
/** On the Mac itself: the simulator is here, and no tunnel is needed. */
const local = process.platform === "darwin";
const SSH = ["ssh", "-F", join(home, ".ssh", "config"), "-o", "BatchMode=yes"];
const AXE = "/opt/homebrew/bin/axe";
/** TRANSCRIPT_OLDER_PAGE (apps/dashboard/src/lib/config.ts). */
const OLDER_PAGE = 250;
/** TRANSCRIPT_PAGE (packages/core/src/transcript.ts): the newest page's blocks. */
const NEWEST_PAGE = 60;
const out = join(root, ".probe", `ios-paging-${Date.now()}`);
await mkdir(out, { recursive: true });
console.log(
  `  at ${(await Bun.$`git -C ${root} log -1 --format=%h\ %s`.text()).trim()}`
);

/** Whose checks count toward the exit code: this checkout's, not the before's. */
let counting = true;
let failures = 0;
const check = (step: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${step}: ${detail}`);
  if (!ok && counting) {
    failures += 1;
  }
};
const pause = (ms: number) => Bun.sleep(ms);

/** Runs `script` in bash on the Mac (here, on the Mac itself); its stdout, or throws with its stderr. */
async function mac(script: string): Promise<string> {
  const child = Bun.spawn(
    local ? ["bash", "-s"] : [...SSH, "mac", "bash", "-s"],
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

// ── 1. Compile ───────────────────────────────────────────────────────────
/** The Mac-side folder build-both.sh builds `dir` in (its BUILD naming). */
const buildOf = async (dir: string) => {
  const top = (
    await Bun.$`git -C ${dir} rev-parse --show-toplevel`.text()
  ).trim();
  return top === join(home, "cockpit") ? "main" : basename(top);
};
/** build-both.sh's APPLE_ROOT: on the Mac itself its cache (this environment's, as the script reads it), over SSH the Mac's ~/build. */
const APPLE_ROOT = local
  ? join(
      process.env.XDG_CACHE_HOME ?? join(home, "Library", "Caches"),
      "cawco-apple"
    )
  : "$HOME/build/cawco-apple";
/** Where build-both.sh leaves the simulator app. */
const appOf = (build: string) =>
  `${APPLE_ROOT}/${build}/DerivedData/Build/Products/Debug-iphonesimulator/CawCo.app`;
const BUILT_IOS = /^BUILT iOS$/m;
const BUILT_IOS_18 = /^BUILT iOS 18\.5$/m;
const compile = async (dir: string, label: string): Promise<boolean> => {
  const build = Bun.spawn(
    ["bash", "apps/apple/scripts/build-both.sh", "ios", "--compile-only"],
    { cwd: dir, stdout: "pipe", stderr: "inherit" }
  );
  const text = await new Response(build.stdout).text();
  process.stdout.write(text);
  const code = await build.exited;
  const ok = code === 0 && BUILT_IOS.test(text) && BUILT_IOS_18.test(text);
  check(
    `${label}compile`,
    ok,
    code === 0 ? "BUILT iOS and BUILT iOS 18.5" : `build-both.sh exited ${code}`
  );
  return ok;
};

let beforeDir: string | undefined;
let beforeSha = "";
if (beforeRef) {
  beforeSha = (
    await Bun.$`git -C ${root} rev-parse ${`${beforeRef}^{commit}`}`.text()
  ).trim();
  // Under ~/.worktrees: build-both.sh keeps the builds of the workspaces it finds there.
  beforeDir = join(
    home,
    ".worktrees",
    `paging-before-${beforeSha.slice(0, 8)}`
  );
  await Bun.$`git -C ${root} worktree add --detach ${beforeDir} ${beforeSha}`.quiet();
  counting = false;
  const built = await compile(beforeDir, `before ${beforeSha.slice(0, 8)}: `);
  counting = true;
  if (!built) {
    await Bun.$`git -C ${root} worktree remove --force ${beforeDir}`.nothrow();
    process.exit(1);
  }
}
if (!(await compile(root, ""))) {
  process.exit(1);
}
const afterApp = appOf(await buildOf(root));
const beforeApp = beforeDir ? appOf(await buildOf(beforeDir)) : undefined;

// ── 2. The scratch fleet, its session seeded ─────────────────────────────
const MARK = `paging probe ${crypto.randomUUID().slice(0, 6)}`;
/** The seed's Bash calls so far: one row each (its result folds into it). */
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
const fleet = await scratchFleet({ name: "probe-ios-paging", respond });

interface Page {
  blocks: { id: string }[];
  cursor: string | null;
  tail?: { busy?: boolean };
}
/** The session's whole transcript as the hub pages it: its rows, and how many pages it takes. */
const walk = async (id: string) => {
  const newest = await fleet.api<Page>(`/api/instances/${id}/transcript`);
  let rows = newest.blocks.length;
  let pages = 1;
  let { cursor } = newest;
  while (cursor) {
    // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
    const page = await fleet.api<Page>(
      `/api/instances/${id}/transcript?limit=${OLDER_PAGE}&before=${encodeURIComponent(cursor)}`
    );
    rows += page.blocks.length;
    pages += 1;
    ({ cursor } = page);
  }
  return {
    rows,
    pages,
    newest: newest.blocks.length,
    busy: newest.tail?.busy === true,
  };
};

// ── 3. The counting proxy ────────────────────────────────────────────────
/** One read of the session's transcript through the proxy. */
interface Read {
  before: string | null;
  /** The cursor it answered with; undefined while it is out. */
  cursor?: string | null;
  done: boolean;
  /** A page older than the newest, by its `before`. */
  older: boolean;
}
const wire = {
  reads: [] as Read[],
  out: 0,
  mostOut: 0,
  /** Older pages' answers are held until `release` (from step (c) on). */
  holding: false,
  waiting: [] as (() => void)[],
};
const release = () => {
  for (const go of wire.waiting.splice(0)) {
    go();
  }
};
const olderReads = () => wire.reads.filter((read) => read.older);
const newestReads = () => wire.reads.filter((read) => !read.older);

let sessionId = "";
interface Link {
  path: string;
  queue: (string | Uint8Array<ArrayBuffer>)[];
  upstream?: WebSocket;
}
const relay = (answer: Response, body: ArrayBuffer) => {
  const headers = new Headers(answer.headers);
  for (const name of [
    "content-encoding",
    "content-length",
    "transfer-encoding",
  ]) {
    headers.delete(name);
  }
  return new Response(body, { status: answer.status, headers });
};
const proxy = Bun.serve<Link>({
  hostname: "127.0.0.1",
  port: 0,
  idleTimeout: 0,
  async fetch(request, server) {
    const url = new URL(request.url);
    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const data: Link = { path: `${url.pathname}${url.search}`, queue: [] };
      return server.upgrade(request, { data })
        ? undefined
        : new Response("upgrade failed", { status: 400 });
    }
    const headers = new Headers(request.headers);
    headers.delete("host");
    const body =
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer();
    const forward = () =>
      fetch(`${fleet.base}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
      });
    if (
      !(
        request.method === "GET" &&
        url.pathname === `/api/instances/${sessionId}/transcript`
      )
    ) {
      const answer = await forward();
      return relay(answer, await answer.arrayBuffer());
    }
    const before = url.searchParams.get("before");
    const read: Read = { older: before !== null, before, done: false };
    wire.reads.push(read);
    wire.out += 1;
    wire.mostOut = Math.max(wire.mostOut, wire.out);
    try {
      const answer = await forward();
      const page = await answer.arrayBuffer();
      try {
        read.cursor =
          (
            JSON.parse(new TextDecoder().decode(page)) as {
              cursor?: string | null;
            }
          ).cursor ?? null;
      } catch {
        read.cursor = null;
      }
      if (read.older && wire.holding) {
        await new Promise<void>((go) => wire.waiting.push(go));
      }
      return relay(answer, page);
    } finally {
      wire.out -= 1;
      read.done = true;
    }
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
      upstream.onmessage = (event) => {
        ws.send(event.data as string | ArrayBuffer);
      };
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

// ── 4. The simulator, and what it shows ──────────────────────────────────
let tunnel: Subprocess | undefined;
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
/** Every element of the app's accessibility tree, flattened. */
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
  walkTree(JSON.parse(await mac(`${AXE} describe-ui --udid ${udid}`)));
  return nodes;
}
const ROW = /row-(\d{4})/;
interface Place {
  /** The transcript's box on screen. */
  area: { bottom: number; top: number };
  /** The first row wholly in view: its seed number and its top. */
  first?: { row: string; y: number };
  /** The rows in view, top to bottom. */
  rows: string[];
  /** The strip before the first row says it is loading. */
  strip: boolean;
  /** Every row on screen, in view or not: its top. */
  tops: Map<string, number>;
}
/** Where the transcript stands: its rows in view, read off describe-ui. */
async function place(): Promise<Place> {
  const nodes = await tree();
  const list = nodes.find((n) => n.label === "Session transcript")?.frame;
  const composer = nodes.find((n) => n.id === "steer-message")?.frame;
  const screen = nodes[0]?.frame ?? { x: 0, y: 0, width: 402, height: 874 };
  const area = list
    ? { top: list.y, bottom: list.y + list.height }
    : { top: 110, bottom: composer?.y ?? screen.height - 160 };
  const inView = nodes.filter(
    (n) =>
      n.frame !== undefined &&
      n.frame.y >= area.top - 0.5 &&
      n.frame.y + n.frame.height <= area.bottom + 0.5
  );
  /** Each row's top, from the first of its nodes in `among`. */
  const topsOf = (among: Node[]) => {
    const tops = new Map<string, number>();
    for (const node of among) {
      const row = node.label?.match(ROW)?.[1];
      const y = node.frame?.y;
      if (row && y !== undefined && !tops.has(row)) {
        tops.set(row, y);
      }
    }
    return tops;
  };
  const rows = [...topsOf(inView).entries()].sort((a, b) => a[1] - b[1]);
  return {
    area,
    first: rows[0] ? { row: rows[0][0], y: rows[0][1] } : undefined,
    rows: rows.map(([row]) => row),
    strip: inView.some(
      (n) => n.label?.startsWith("Loading transcript") === true
    ),
    tops: topsOf(nodes),
  };
}
/** `place`, asked again until it finds rows in view (describe-ui can answer mid-layout). */
const placed = () =>
  until(
    "rows in view (describe-ui)",
    place,
    (at) => at.first !== undefined,
    15_000
  );
const said = (at: Place) =>
  at.first
    ? `first row in view row-${at.first.row} at y ${at.first.y.toFixed(2)}; rows ${at.rows[0]}…${at.rows.at(-1)}${at.strip ? "; the loading strip is in view" : ""}`
    : "no row in view";

/** One finger down the transcript: the list scrolls toward its start. */
const flick = async (at: Place) => {
  const x = 200;
  const height = at.area.bottom - at.area.top;
  await mac(
    `${AXE} drag --start-x ${x} --start-y ${Math.round(at.area.top + 0.12 * height)} --end-x ${x} --end-y ${Math.round(at.area.top + 0.92 * height)} --duration 0.3 --steps 12 --udid ${udid}`
  );
  // The list coasts to rest before it is read.
  await pause(1600);
};

const shot = async (name: string) => {
  const png = await mac(`F=$(mktemp -d)
xcrun simctl io ${udid} screenshot "$F/s.png" >/dev/null 2>&1
base64 < "$F/s.png"
rm -rf "$F"`);
  const file = join(out, `${name}.png`);
  await Bun.write(file, Buffer.from(png.replace(/\s/g, ""), "base64"));
  console.log(`  capture: ${file}`);
};

/** The app's Transcript log, streamed while it runs. */
const listen = () => {
  logLines.length = 0;
  const script = `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND category == "Transcript"'`;
  const child = Bun.spawn(
    local ? ["bash", "-c", script] : [...SSH, "mac", script],
    {
      stdout: "pipe",
      stderr: "ignore",
    }
  );
  const reading = (async () => {
    const decoder = new TextDecoder();
    let rest = "";
    for await (const chunk of child.stdout) {
      rest += decoder.decode(chunk, { stream: true });
      const lines = rest.split("\n");
      rest = lines.pop() ?? "";
      logLines.push(...lines);
    }
  })();
  reading.catch(() => undefined);
  return child;
};
const logged = () => ({
  newest: logLines.filter((line) =>
    line.includes(`page adopted for ${sessionId}`)
  ).length,
  asked: logLines.filter((line) =>
    line.includes(`older page asked for ${sessionId}`)
  ).length,
  older: logLines.filter((line) =>
    line.includes(`older page read for ${sessionId}`)
  ).length,
});

/** One page that joined: how far it moved the first row in view, and whether that row stayed first. */
interface Move {
  /** The held first row's top before the page joined and after; undefined once it is off screen. */
  after?: number;
  before?: number;
  /** It is still the first row in view, or the loading strip stood above it (the joined rows take the strip's room). */
  first: boolean;
  /** |after - before|, Infinity when the row is not on screen to measure. */
  moved: number;
  row?: string;
}
/** Every page that joined this run. */
const moves: Move[] = [];
const kept = (move: Move) => move.moved <= 1 && move.first;
const told = (move: Move) =>
  move.row
    ? `row-${move.row} at y ${move.before?.toFixed(2) ?? "?"} before, ${move.after === undefined ? "off screen" : `y ${move.after.toFixed(2)}`} after: moved ${move.moved.toFixed(2)}pt${move.first ? "" : ", no longer the first row in view"}`
    : "no row in view before it joined";
/** Lets one held page in: the place before it joins, and after. */
const land = async () => {
  const held = await placed();
  const reads = olderReads().length;
  release();
  await until(
    "the held page delivered",
    () => olderReads().every((read) => read.done),
    Boolean,
    15_000
  );
  await pause(1500);
  const landed = await placed();
  // The row the reader's place is kept by: the first row in view while the page was held.
  const row = held.first?.row;
  const before = row === undefined ? undefined : held.tops.get(row);
  const after = row === undefined ? undefined : landed.tops.get(row);
  const move: Move = {
    row,
    before,
    after,
    moved:
      before !== undefined && after !== undefined
        ? Math.abs(after - before)
        : Number.POSITIVE_INFINITY,
    first: row !== undefined && (held.strip || landed.first?.row === row),
  };
  moves.push(move);
  return { held, landed, move, reads };
};

/** A fresh install of `app`, opened on the session: (b), and where it stands. */
async function opening(label: string, app: string): Promise<Place> {
  console.log(`\n── ${label || "this checkout"} ──`);
  wire.reads = [];
  wire.mostOut = 0;
  wire.holding = false;
  moves.length = 0;
  logger?.kill();
  // A fresh install: no place saved from an earlier run is restored.
  await mac(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl uninstall ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl install ${udid} "${app}"`);
  logger = listen();
  await pause(1500);
  await mac(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${port} -open-session ${sessionId} >/dev/null`
  );
  await until(
    "the transcript's rows on screen",
    place,
    (shown) => shown.first !== undefined,
    120_000
  );
  // Whatever the open reads, it reads in this time.
  await pause(5000);
  const opened = await placed();
  console.log(`  open: ${said(opened)}`);
  await shot(`${label ? "before-" : ""}open`);
  const log = logged();
  check(
    `${label}(b) opening reads the newest page only`,
    newestReads().length === 1 && olderReads().length === 0,
    `${newestReads().length} newest-page read(s), ${olderReads().length} older-page read(s) on the wire; the app logged ${log.newest} page adopted, ${log.older} older page read`
  );
  return opened;
}

/** (c) Near the first rows held: one page, and the place kept as it joins. */
async function nearTheTop(label: string, opened: Place): Promise<Place> {
  wire.holding = true;
  let at = opened;
  /** The older reads before the reader moved: none, unless the open read them. */
  const baseline = olderReads().length;
  let first: Awaited<ReturnType<typeof land>> | undefined;
  for (let drag = 0; drag < 40; drag += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each drag starts where the last one left the list
    await flick(at);
    if (olderReads().length > baseline) {
      first = await land();
      break;
    }
    at = await placed();
  }
  if (first) {
    await shot(`${label ? "before-" : ""}first-page-joined`);
    // Nothing more is read while the reader stands where the page left them.
    await pause(2500);
    check(
      `${label}(c) near the first rows held, exactly one more page is read`,
      first.reads - baseline === 1 &&
        olderReads().length - baseline === 1 &&
        wire.mostOut <= 1,
      `${first.reads - baseline} older read(s) while the page was held, ${olderReads().length - baseline} once it landed and the list stood 2.5s; first row in view before it joined ${first.held.first ? `row-${first.held.first.row}` : "none"}${first.held.strip ? " (loading strip in view)" : ""}`
    );
    check(
      `${label}(c) the first row in view keeps its id and its y`,
      kept(first.move),
      `${told(first.move)}; held: ${said(first.held)}; landed: ${said(first.landed)}`
    );
  } else {
    check(
      `${label}(c) near the first rows held, exactly one more page is read`,
      false,
      `40 drags toward the start read no older page (${baseline} older read(s) before the first drag)`
    );
  }
  return placed();
}

/**
 * (d) On to the start, a page at a time, until the cursor is nil and the
 * first row of the conversation is in view.
 */
async function toTheStart(
  label: string,
  from: Place,
  expected: number,
  own: boolean
) {
  let at = from;
  const ended = () =>
    olderReads().at(-1)?.cursor === null ||
    (olderReads().length === 0 && newestReads().at(-1)?.cursor === null);
  let idle = 0;
  for (
    let drag = 0;
    drag < 400 && idle < 30 && !(ended() && at.rows.includes("0001"));
    drag += 1
  ) {
    const reads = olderReads().length;
    // biome-ignore lint/performance/noAwaitInLoops: each drag starts where the last one left the list
    await flick(at);
    if (olderReads().length > reads) {
      idle = 0;
      const landed = await land();
      console.log(
        `  page ${olderReads().length + 1}: ${told(landed.move)}${landed.held.strip ? " (loading strip in view)" : ""}, ${landed.reads - reads} read(s) for one drag`
      );
    } else {
      idle += 1;
    }
    at = await placed();
  }
  release();
  wire.holding = false;
  const top = await placed();
  console.log(`  at the start: ${said(top)}`);
  await shot(`${label ? "before-" : ""}start`);
  const last = olderReads().at(-1);
  const total = wire.reads.length;
  check(
    `${label}(d) reads to the start are the hub's page count`,
    total === expected &&
      (last?.cursor ?? null) === null &&
      newestReads().length === 1,
    `${total} reads in all (${newestReads().length} newest, ${olderReads().length} older) for ${expected} pages; the last answered cursor ${last ? (last.cursor ?? "null") : "none"}`
  );
  check(
    `${label}(d) never two reads out at once`,
    wire.mostOut <= 1,
    `at most ${wire.mostOut} transcript read(s) out at once`
  );
  check(
    `${label}(d) every page that joined kept the place`,
    moves.length > 0 && moves.every(kept),
    moves.map(told).join("; ") || "no page joined"
  );
  check(
    `${label}(d) the start is drawn: no loading strip above the first row`,
    !top.strip && top.rows.includes("0001"),
    said(top)
  );
  if (own) {
    const end = logged();
    check(
      "the app's log agrees with the wire",
      end.newest === newestReads().length &&
        end.older === olderReads().length &&
        end.asked === olderReads().length,
      `log: ${end.newest} page adopted, ${end.asked} older page asked, ${end.older} older page read; wire: ${newestReads().length} newest, ${olderReads().length} older`
    );
  }
}

/** Steps (b) to (d) against one build of the app. */
async function run(label: string, app: string, expected: number, own: boolean) {
  const opened = await opening(label, app);
  const near = await nearTheTop(label, opened);
  await toTheStart(label, near, expected, own);
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
  sessionId = await fleet.spawn("claude", "Paging probe");
  await fleet.send(sessionId, `${MARK}: print the rows.`);
  const seeded = await until(
    `${ROWS} rows in the session`,
    () => walk(sessionId),
    (at) => at.rows >= ROWS && !at.busy,
    40 * 60_000
  );
  check(
    "(a) the session holds at least 800 rows",
    seeded.rows >= 800,
    `${seeded.rows} rows (${calls} Bash calls) in ${seeded.pages} hub pages: the newest ${seeded.newest} (TRANSCRIPT_PAGE ${NEWEST_PAGE}), then ${OLDER_PAGE} a page; ceil(rows/${OLDER_PAGE}) = ${Math.ceil(seeded.rows / OLDER_PAGE)}`
  );

  if (!local) {
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
    "the proxy answering on the Mac",
    () => mac(`curl -sf http://127.0.0.1:${port}/health >/dev/null && echo up`),
    (text) => text.trim() === "up",
    30_000
  );

  udid = (
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
xcrun simctl create "CawCo probe paging" "$TYPE" "$RUNTIME"`)
  ).trim();
  console.log(`  simulator ${udid}`);
  await mac(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl ui ${udid} appearance light`);

  if (beforeApp) {
    counting = false;
    await run(
      `before ${beforeSha.slice(0, 8)}: `,
      beforeApp,
      seeded.pages,
      false
    ).catch((error) =>
      check(
        "before: probe",
        false,
        error instanceof Error ? error.message : String(error)
      )
    );
    counting = true;
  }
  await run("", afterApp, seeded.pages, true);
} catch (error) {
  check("probe", false, error instanceof Error ? error.message : String(error));
} finally {
  release();
  logger?.kill();
  if (udid) {
    await mac(`xcrun simctl terminate ${udid} dev.cawco.app >/dev/null 2>&1 || true
xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error) =>
      console.log(`  simulator cleanup: ${error}`)
    );
  }
  tunnel?.kill();
  proxy.stop(true);
  await fleet.close();
  await fleet.clean(keep || failures > 0);
  if (beforeDir) {
    await Bun.$`git -C ${root} worktree remove --force ${beforeDir}`
      .nothrow()
      .quiet();
  }
}

console.log(`Captures: ${out}`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
