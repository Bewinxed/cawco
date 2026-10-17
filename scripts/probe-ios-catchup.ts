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
 *     drags up until three older pages have been read; restarts the hub
 *     twice with the reader there and no restored place (the second time
 *     with the agent away, so the read finds the machine offline): the rows
 *     stay, the place holds, no older page is read again; sends the app home
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
 * page once and each older page once. With the hub failing the read (the
 * proxy answers 500 with a long stack), the dock says "Not caught up" beside
 * Try again, which reads again, exactly one toast says why in the stack's
 * first line (the app's `toast:` log), the reads again keep to the backoff,
 * and the line goes once one lands. With the agent away, the dock says "Not caught up: <machine> is
 * offline. The rest comes in once it's back." in at most two lines over the
 * rows held, and the line goes once the agent is back and the read lands. The head's ink is measured by
 * scripts/probe-ios-headfade.ts from the captures this writes.
 *
 * Captures go to $TMPDIR/ios-transcript/<label>/ (or .probe/ outside a
 * workspace). It stops only what it started: the fleet's processes, the
 * proxy, the log stream, and the simulator it created (deleted at the end).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Subprocess } from "bun";
import { simulatorApp } from "./lib/apple-app";
import { ensureDeps } from "./lib/deps";
import { type MacSim, macSim } from "./lib/mac-sim";
import type { Reply, Seen } from "./scratch-fleet";

// The dependencies first (lib/deps.ts): the fleet loads after them.
await ensureDeps();
const { scratchFleet, until } = await import("./scratch-fleet");

/** The simulator both passes run on: an iPhone 16 Pro on iOS 18.5. */
const SIM = {
  runtime: "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
  device: "iPhone 16 Pro",
};

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const keep = args.includes("--keep");
const ROWS = Number(option("--rows") ?? 820);
const LABEL = option("--label") ?? "run";
const root = resolve(import.meta.dir, "..");
const AXE = "/opt/homebrew/bin/axe";
const PILL = "Catching up…";
/** The dock's line while a read again could not catch the rows up (DockNote): all of it when the read failed. */
const BEHIND = "Not caught up";
const OFFLINE_NEXT = "is offline. The rest comes in once it's back.";
/** A failed history read whose body is a long stack, as a machine's error can be: the reader is told its first line. */
const FAILED = `Error: the transcript could not be read\n${"    at readHistory (/opt/cawco/agent.js:1:1)\n".repeat(400)}`;
const FAILED_REASON = "Error: the transcript could not be read";
/** The note's line height: --text-meta (12pt) at its leading (1.35). */
const META_LINE = 12 * 1.35;
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
  // Just built: the app build-both.sh made from this tree (lib/apple-app.ts).
  app = simulatorApp(top);
}

// ── Live: one session on a running hub, its pill counted ─────────────────
//
//   bun scripts/probe-ios-catchup.ts --live <sessionId> [--hub <url>] [--seconds 120] [--fail]
//
// Opens the session on the hub through a logging proxy, sends the app home
// and relaunches it (its scene restores the place), then watches for
// `--seconds`: every catch-up the pill begins is listed with the reads and
// stream frames around it, and every transcript read with its status and
// body size. Passes with no catch-up but those a hub reset or resync
// started. `--fail`: then a `stream.reset` is put on the socket while the
// hub's read answers 500 with a long body for the next 40s: the dock says
// "Not caught up" beside Try again, exactly one toast says why, and the
// reads that follow keep to the backoff. `--local-network` instead: the app
// launches with Local Network privacy refusing the hub, stays on the board
// with its status line alone saying so beside Open Settings, toasts nothing,
// and reconnects at once when activated with access allowed.
const LIVE = option("--live");
const BACK_LINES = /app active|status line|shell shows|hub socket open/;
const TRAILING_SLASH = /\/$/;
/** A log line up to what it says: its stamp, process and category. */
const LIVE_LOG_HEAD = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
const SHOWN =
  / because |catch-up |stream: (reset|resync|backlog)|transcript read for|page adopted|toast/;
const BECAUSE = / because /;
const HUB_ASKED = /because (streamReset|transcriptReset|backlogBroken)/;
const APPLIED = / applied/;
const SHOWN_FAILING = / because |toast:|transcript read for|catch-up /;
const TOAST_HEAD = /^.*toast: /;
/** The local-network pass is through: the rest of the live pass is not run. */
const LOCAL_DONE = "local network pass done";
if (LIVE) {
  const hub = (option("--hub") ?? "http://100.125.210.78:3456").replace(
    TRAILING_SLASH,
    ""
  );
  const seconds = Number(option("--seconds") ?? 120);
  const short = LIVE.slice(0, 8);
  const full = (
    (await (await fetch(`${hub}/api/instances`)).json()) as { id: string }[]
  ).find((row) => row.id.startsWith(LIVE))?.id;
  if (!full) {
    console.log(`FAIL live: no session ${LIVE} on ${hub}`);
    process.exit(1);
  }
  const started = Date.now();
  const stamp = () => `+${((Date.now() - started) / 1000).toFixed(1)}s`;
  const notes: string[] = [];
  let failUntil = 0;
  const sockets = new Set<
    import("bun").ServerWebSocket<{
      path: string;
      upstream?: WebSocket;
      queue: (string | Buffer<ArrayBuffer>)[];
    }>
  >();
  const live = Bun.serve<{
    path: string;
    upstream?: WebSocket;
    queue: (string | Buffer<ArrayBuffer>)[];
  }>({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    async fetch(request, server) {
      const url = new URL(request.url);
      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return server.upgrade(request, {
          data: { path: `${url.pathname}${url.search}`, queue: [] },
        })
          ? undefined
          : new Response("upgrade failed", { status: 400 });
      }
      const read =
        request.method === "GET" && url.pathname.endsWith("/transcript");
      if (read && !url.searchParams.has("before") && Date.now() < failUntil) {
        // A failed read whose body is a long stack, as a machine's error can
        // be, taking as long as a read over the tailnet does: an answer in a
        // millisecond lands before the pane draws a frame of its read.
        await pause(400);
        const body = `Error: readHistory failed\n${"    at readHistory (/opt/cawco/agent.js:1:1)\n".repeat(400)}`;
        notes.push(
          `${stamp()} read ${url.pathname.split("/")[3]?.slice(0, 8)} newest -> 500, ${body.length} bytes (forced)`
        );
        return new Response(body, {
          status: 500,
          headers: { "content-type": "text/plain" },
        });
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      const answer = await fetch(`${hub}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : await request.arrayBuffer(),
        redirect: "manual",
      });
      const bytes = await answer.arrayBuffer();
      if (read) {
        notes.push(
          `${stamp()} read ${url.pathname.split("/")[3]?.slice(0, 8)} ${url.searchParams.has("before") ? "older" : "newest"} -> ${answer.status}, ${bytes.byteLength} bytes`
        );
      }
      const reply = new Headers(answer.headers);
      for (const name of [
        "content-encoding",
        "content-length",
        "transfer-encoding",
      ]) {
        reply.delete(name);
      }
      return new Response(bytes, { status: answer.status, headers: reply });
    },
    websocket: {
      open(ws) {
        sockets.add(ws);
        notes.push(`${stamp()} socket open`);
        const upstream = new WebSocket(
          `${hub.replace("http", "ws")}${ws.data.path}`
        );
        upstream.binaryType = "arraybuffer";
        ws.data.upstream = upstream;
        upstream.onopen = () => {
          for (const message of ws.data.queue.splice(0)) {
            upstream.send(message);
          }
        };
        upstream.onmessage = (event) => {
          const text =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          // The hub's own word that the history must be read again: a stream reset, or a transcript reset event.
          if (
            text.includes(full) &&
            (text.includes('"stream.reset"') || text.includes('"type":"reset"'))
          ) {
            notes.push(
              `${stamp()} hub frame: ${text.includes('"stream.reset"') ? "stream.reset" : "transcript reset"} for ${short}`
            );
          }
          ws.send(event.data as string | ArrayBuffer);
        };
        upstream.onclose = () => ws.close();
        upstream.onerror = () => ws.close();
      },
      message(ws, message) {
        const { upstream } = ws.data;
        if (upstream?.readyState === WebSocket.OPEN) {
          upstream.send(message);
        } else {
          ws.data.queue.push(message);
        }
      },
      close(ws) {
        sockets.delete(ws);
        notes.push(`${stamp()} socket closed`);
        ws.data.upstream?.close();
      },
    },
  });
  let sim: MacSim | undefined;
  let stream: Subprocess | undefined;
  const lines: string[] = [];
  try {
    sim = await macSim(SIM);
    const device = sim.udid;
    await sh(`xcrun simctl install ${device} "${app}"`);
    const child = Bun.spawn(
      [
        "bash",
        "-c",
        `exec xcrun simctl spawn ${device} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Restore" OR category == "Ledger" OR category == "Hub")'`,
      ],
      { stdout: "pipe", stderr: "ignore" }
    );
    stream = child;
    (async () => {
      const decoder = new TextDecoder();
      let rest = "";
      for await (const chunk of child.stdout) {
        rest += decoder.decode(chunk, { stream: true });
        const split = rest.split("\n");
        rest = split.pop() ?? "";
        lines.push(
          ...split.map(
            (line) => `${stamp()} ${line.replace(LIVE_LOG_HEAD, "")}`
          )
        );
      }
    })().catch(() => undefined);
    // `--local-network`: the app launches with Local Network privacy refusing
    // the hub, as the owner's Mac had it. The simulator does not enforce it:
    // launched with `--hub-local-network-denied` (`LocalNetwork.debugDenied`),
    // the socket and every read fail with -1009 and the path says refused.
    // The shell stays on the board, its status line alone says it with Open
    // Settings, and nothing toasts. `dev.cawco.debug.local-network-allowed`
    // (access allowed) is posted and the app activated as a Mac window back
    // from System Settings is
    // (`dev.cawco.debug.became-active`): it reconnects at once.
    if (args.includes("--local-network")) {
      const refusedFrom = lines.length;
      await sh(
        `xcrun simctl launch --terminate-running-process ${device} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${live.port} --hub-local-network-denied >/dev/null`
      );
      await pause(20_000);
      const refused = [...new Set(lines.slice(refusedFrom))];
      const shell = refused.filter((l) => l.includes("shell shows"));
      const status = refused.filter((l) => l.includes("status line:"));
      const toasts = refused.filter((l) => l.includes("toast shown:"));
      for (const line of [...shell, ...status, ...toasts]) {
        console.log(`  ${line.slice(0, 200)}`);
      }
      check(
        "local network: the shell stays on the board, never the setup screen",
        shell.length > 0 && shell.every((l) => l.includes("shell shows board")),
        shell.map((l) => l.replace(LIVE_LOG_HEAD, "")).join(" | ") ||
          "no shell line"
      );
      check(
        "local network: the status line alone says it, with Open Settings",
        status
          .at(-1)
          ?.endsWith(
            "status line: CawCo isn't allowed on the local network|Open Settings"
          ) === true,
        status.at(-1) ?? "no status line"
      );
      check(
        "local network: nothing toasts",
        toasts.length === 0,
        `${toasts.length} toast(s)`
      );
      // Allowed in Settings, then back: the window is active again.
      await sh(
        `xcrun simctl spawn ${device} notifyutil -p dev.cawco.debug.local-network-allowed`
      );
      await pause(500);
      const backFrom = lines.length;
      const backAt = (Date.now() - started) / 1000;
      await sh(
        `xcrun simctl spawn ${device} notifyutil -p dev.cawco.debug.became-active`
      );
      const reconnected = await until(
        "the hub socket opens",
        () =>
          Promise.resolve(
            lines.slice(backFrom).find((l) => l.includes("hub socket open"))
          ),
        Boolean,
        20_000
      ).catch(() => undefined);
      const back = [...new Set(lines.slice(backFrom))];
      for (const line of back.filter((l) => BACK_LINES.test(l))) {
        console.log(`  ${line.slice(0, 200)}`);
      }
      check(
        "local network: back from Settings, it reconnects at once",
        back.some((l) => l.includes("app active: reconnecting now")) &&
          reconnected !== undefined,
        reconnected
          ? `socket open ${(Number(reconnected.slice(1, reconnected.indexOf("s "))) - backAt).toFixed(1)}s after the activation`
          : "the socket never opened"
      );
      throw new Error(LOCAL_DONE);
    }
    const open = () =>
      sh(
        `xcrun simctl launch --terminate-running-process ${device} dev.cawco.app -paywall-env sandbox -cawco-hub-url http://127.0.0.1:${live.port} -open-session ${full} >/dev/null`
      );
    await open();
    await pause(30_000);
    // Home, then back: the scene saves the place and the relaunch restores it.
    await sh(`${AXE} button home --udid ${device}`);
    await pause(3000);
    await sh(`xcrun simctl terminate ${device} dev.cawco.app`);
    await pause(1500);
    const from = lines.length;
    const notesFrom = notes.length;
    await open();
    await pause(seconds * 1000);
    const window = [...new Set(lines.slice(from))];
    const begins = window.filter((line) =>
      line.includes(`catch-up begins for ${short}`)
    );
    const asked = notes
      .slice(notesFrom)
      .filter((note) => note.includes("hub frame:"));
    for (const line of window.filter((l) => SHOWN.test(l))) {
      console.log(`  ${line.slice(0, 260)}`);
    }
    for (const note of notes.slice(notesFrom)) {
      console.log(`  proxy ${note}`);
    }
    const reads = window.filter(
      (line) => BECAUSE.test(line) && line.includes(`read ${short}`)
    );
    const hubAsked = reads.filter((line) => HUB_ASKED.test(line)).length;
    check(
      `live ${short}: ${seconds}s on a streaming session, after a restore`,
      begins.length <= hubAsked,
      `${begins.length} catch-up(s) began; ${hubAsked} read(s) the hub asked for (${asked.length} reset frame(s) seen), ${reads.length} read(s) in all`
    );
    if (args.includes("--fail")) {
      const failFrom = lines.length;
      const notesAt = notes.length;
      failUntil = Date.now() + 40_000;
      // The hub's word that its ring cannot replay: the app reads the history again.
      for (const ws of sockets) {
        ws.send(
          JSON.stringify({ type: "stream.reset", sessionId: full, nextSeq: 1 })
        );
      }
      const note = await until(
        "the not-caught-up line",
        async () => {
          const nodes = JSON.parse(
            await sh(`${AXE} describe-ui --udid ${device}`)
          );
          const labels: string[] = [];
          const walk = (at: unknown) => {
            if (Array.isArray(at)) {
              at.forEach(walk);
            } else if (at && typeof at === "object") {
              const o = at as Record<string, unknown>;
              if (typeof o.AXLabel === "string") {
                labels.push(o.AXLabel);
              }
              walk(o.children);
            }
          };
          walk(nodes);
          return labels;
        },
        (labels) => labels.some((label) => label.startsWith(BEHIND)),
        20_000
      ).catch(() => [] as string[]);
      // Until the read lands: the backoff's next read once the hub answers, at most its last wait past the failing.
      await until(
        "a read lands once the hub answers",
        () =>
          Promise.resolve(
            lines
              .slice(failFrom)
              .some((l) => l.includes(`page adopted for ${full}`))
          ),
        Boolean,
        110_000
      ).catch(() => false);
      const after = [...new Set(lines.slice(failFrom))];
      const toasts = after.filter((line) => line.includes("toast:"));
      const failBegins = after.filter((l) =>
        l.includes(`catch-up begins for ${short}`)
      ).length;
      check(
        "live failing read: one catch-up, the one the reset started",
        failBegins <= 1,
        `${failBegins} catch-up(s) began, ${after.filter((l) => BECAUSE.test(l) && l.includes(`read ${short}`)).length} read(s), ${after.filter((l) => APPLIED.test(l)).length} event(s) applied`
      );
      const failedReads = notes
        .slice(notesAt)
        .filter((n) => n.includes("(forced)"));
      for (const shown of after.filter((l) => SHOWN_FAILING.test(l))) {
        console.log(`  ${shown.slice(0, 260)}`);
      }
      for (const n of notes.slice(notesAt)) {
        console.log(`  proxy ${n}`);
      }
      const said = note.find((label) => label.startsWith(BEHIND));
      check(
        "live failing read: the dock says it is not caught up, with Try again",
        said === BEHIND && note.includes("Try again"),
        said
          ? `"${said}"${note.includes("Try again") ? " [Try again]" : ""}`
          : "no line in the pane"
      );
      check(
        "live failing read: exactly one toast says why, in one sentence pair, nothing raw",
        toasts.length === 1 &&
          !toasts[0].includes("    at ") &&
          toasts[0].length < 400,
        toasts.map((t) => t.replace(TOAST_HEAD, "")).join(" | ") || "no toast"
      );
      check(
        "live failing read: the reads that failed kept to the backoff (2s, 4s, 8s, 16s, …)",
        failedReads.length >= 2 && failedReads.length <= 6,
        `${failedReads.length} failed read(s) in 40s`
      );
      const gone = after.some((l) => l.includes(`page adopted for ${full}`));
      check(
        "live failing read: once the hub answers, the read lands",
        gone,
        gone ? "page adopted" : "no page adopted"
      );
    }
  } catch (error) {
    // The local-network pass ends here when it is through.
    if (!(error instanceof Error && error.message === LOCAL_DONE)) {
      check(
        "live",
        false,
        error instanceof Error ? error.message : String(error)
      );
    }
  } finally {
    stream?.kill();
    await writeFile(
      join(out, "live-log.txt"),
      [...lines, ...notes.map((n) => `proxy ${n}`)].join("\n")
    );
    await sim?.release();
    live.stop(true);
  }
  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
  process.exit(failures === 0 ? 0 : 1);
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
/** `holding`: the app's socket is refused, so it reconnects only once let through; until `failUntil` (ms epoch), newest reads answer 500. */
const wire: { failUntil: number; holding: boolean; reads: Read[] } = {
  reads: [],
  holding: false,
  failUntil: 0,
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
      // The hub's read failing, as its route answers a failed history read.
      if (before === null && Date.now() < wire.failUntil) {
        return new Response(FAILED, {
          status: 500,
          headers: { "content-type": "text/plain" },
        });
      }
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
let sim: MacSim | undefined;
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
/** A log line's stamp, process and category, up to what it says. */
const LOG_PREFIX = /^.*?\[dev\.cawco\.app:[^\]]*\] /;
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
/** Checks one load's transitions: at most `reads` shows and hides (one per read), never more than two in a second. */
const counted = (
  label: string,
  moves: ReturnType<typeof transitions>,
  reads = 1
) => {
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
    `${label}: the pill shows and hides at most once per read (${reads})`,
    shown <= reads && hidden <= reads,
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

  sim = await macSim(SIM);
  ({ udid } = sim);
  console.log(`  simulator ${udid} (iOS 18.5)`);
  await sh(`xcrun simctl status_bar ${udid} override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
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

  // A reset over the rows the reader scrolled up to, with no restored place:
  // the hub restarts with the app's socket held off, and the app's resume
  // meets a stream that starts again empty (`stream.reset`). The newest page
  // read again is joined to the rows held: they stay, the place does not
  // move, and no older page is read again. With the agent away, the read
  // finds the machine offline: the rows still stay, and the read is made
  // again once the hub says the machine is online. With the hub failing the
  // read, the line says why beside Try again, which reads again, and the
  // session's next frame reads it again too.
  /** Whether the app's log has said `text` since line `since`. */
  const logged = (since: number, text: string) =>
    logLines.slice(since).some((line) => line.includes(text));
  const waitLogged = (label: string, since: number, text: string, ms: number) =>
    until(label, () => Promise.resolve(logged(since, text)), Boolean, ms).catch(
      () => false
    );
  const stays = (label: string, before: Place, now: Place) =>
    check(
      label,
      now.first?.row === before.first?.row &&
        Math.abs((now.first?.y ?? 0) - (before.first?.y ?? 0)) < 2,
      `row-${before.first?.row} at y ${before.first?.y}, then row-${now.first?.row} at y ${now.first?.y}`
    );
  const lineGoes = async (label: string) => {
    const gone = await until(
      `${label}: the not-caught-up line goes`,
      tree,
      (nodes) => !nodes.some((n) => n.label?.startsWith(BEHIND)),
      30_000
    ).catch(() => undefined);
    check(
      `${label}: the line goes once the read lands`,
      gone !== undefined,
      gone ? "no longer in the pane" : "still in the pane after 30s"
    );
  };
  /** The agent away: the rows stay, the line says so, and the read is made again once it is back. The reads it took. */
  const awayCase = async (label: string, since: number, before: Place) => {
    await waitLogged(
      `${label}: the read found the machine offline`,
      since,
      "rows kept",
      30_000
    );
    await pause(3000);
    stays(
      `${label}: the rows stay while the machine is offline`,
      before,
      await placed()
    );
    const strip = (await tree()).find((n) => n.label?.startsWith(BEHIND));
    const lines = Math.round((strip?.frame?.height ?? 0) / META_LINE);
    await shot("away-note");
    check(
      `${label}: the pane says it is not caught up, and what comes next, in at most two lines`,
      strip?.label?.endsWith(OFFLINE_NEXT) === true && lines <= 2,
      strip
        ? `"${strip.label}", ${lines} line(s) (${strip.frame?.height}pt)`
        : "no line in the pane"
    );
    fleet.launch("agent");
    await fleet.agentUp();
    const again = await waitLogged(
      `${label}: read again once the machine is online`,
      since,
      "because machineOnline",
      60_000
    );
    check(
      `${label}: read again once the hub says the machine is online`,
      again,
      again ? "read because machineOnline" : "no read followed the machine"
    );
    await lineGoes(label);
    return 2;
  };
  /** The hub failing the read: the line says why beside Try again, which reads again; the next frame reads it too. The reads it took. */
  const failingCase = async (label: string, since: number, before: Place) => {
    await waitLogged(
      `${label}: the read failed over the rows`,
      since,
      "rows kept",
      30_000
    );
    await pause(3000);
    stays(
      `${label}: the rows stay while the read has failed`,
      before,
      await placed()
    );
    const nodes = await tree();
    const strip = nodes.find((n) => n.label?.startsWith(BEHIND))?.label;
    const retry = nodes.find((n) => n.label === "Try again")?.frame;
    check(
      `${label}: the pane says it is not caught up, with Try again`,
      strip === BEHIND && retry !== undefined,
      strip
        ? `"${strip}"${retry ? " [Try again]" : " (no Try again)"}`
        : "no line in the pane"
    );
    // Try again reads again: the hub fails it once more, and the line stays.
    const pressed = wire.reads.length;
    if (retry) {
      await sh(
        `${AXE} tap -x ${Math.round(retry.x + retry.width / 2)} -y ${Math.round(retry.y + retry.height / 2)} --udid ${udid}`
      );
    }
    const retried = await waitLogged(
      `${label}: Try again read again`,
      since,
      "because retry",
      15_000
    );
    await pause(2000);
    const still = (await tree()).some((n) => n.label?.startsWith(BEHIND));
    check(
      `${label}: Try again reads again`,
      retried && wire.reads.length > pressed && still,
      `${retried ? "read because retry" : "no retry read"}, ${wire.reads.length - pressed} read(s) after the tap, line ${still ? "still there" : "gone"}`
    );
    // The backoff reads it again by itself, and this time the hub answers.
    wire.failUntil = 0;
    await fleet.send(sessionId, "One more line.");
    const backoff = await waitLogged(
      `${label}: read again on the backoff`,
      since,
      "because backoff",
      70_000
    );
    await lineGoes(label);
    const window = [...new Set(logLines.slice(since))];
    const failed = window.filter(
      (line) =>
        line.includes("transcript read for") && line.includes("rows kept")
    ).length;
    check(
      `${label}: read again on the backoff, not on every frame`,
      backoff && failed <= 6,
      `${backoff ? "read because backoff" : "no backoff read"}, ${failed} failed read(s)`
    );
    const toasts = window.filter((line) => line.includes("toast: "));
    check(
      `${label}: exactly one toast says why, in one sentence, nothing raw`,
      toasts.length === 1 &&
        toasts[0].includes(`${FAILED_REASON}. Try again reads it now`) &&
        !toasts[0].includes("    at "),
      toasts.map((line) => line.replace(LOG_PREFIX, "")).join(" | ") ||
        "no toast"
    );
    // One catch-up: the reset's. Try again and the backoff catch up quietly.
    return 1;
  };
  const resetOver = async (
    label: string,
    mode: "agent" | "failing" | "away"
  ) => {
    const agentAway = mode === "away";
    // The session speaks first, so the app's place in its stream is past
    // what a restarted hub's empty ring starts at: its resume is then a
    // reset, not an empty backlog.
    const spoken = (await walk(sessionId)).rows;
    await fleet.send(sessionId, "One more line.");
    await until(
      `${label}: the session spoke`,
      () => walk(sessionId),
      (held) => held.rows > spoken && !held.busy,
      120_000
    );
    await pause(3000);
    const before = await placed();
    const from = logLines.length;
    const readsBefore = wire.reads.length;
    wire.holding = true;
    // Failing from the reset's read on, until the failing case lets the backoff land.
    wire.failUntil = mode === "failing" ? Date.now() + 600_000 : 0;
    if (agentAway) {
      await fleet.stop("agent");
    }
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    if (!agentAway) {
      await fleet.agentUp();
    }
    wire.holding = false;
    const newest = () =>
      wire.reads.slice(readsBefore).filter((read) => !read.older).length;
    await until(
      `${label}: the newest page read again`,
      () => Promise.resolve(newest()),
      (count) => count >= 1,
      60_000
    ).catch(() => 0);
    let reads = 1;
    if (mode === "away") {
      reads = await awayCase(label, from, before);
    } else if (mode === "failing") {
      reads = await failingCase(label, from, before);
    }
    await pause(6000);
    const after = await placed();
    const older = wire.reads.slice(readsBefore).filter((read) => read.older);
    console.log(
      `  ${label}: ${newest()} newest and ${older.length} older read(s); ${logLines
        .slice(from)
        .filter(
          (line) => line.includes("page adopted") || line.includes(" because ")
        )
        .map((line) => line.replace(LOG_PREFIX, ""))
        .join(" | ")}`
    );
    check(
      `${label}: the rows stay and the place holds`,
      after.first?.row === before.first?.row &&
        Math.abs((after.first?.y ?? 0) - (before.first?.y ?? 0)) < 2 &&
        after.rows.join() === before.rows.join(),
      `before row-${before.first?.row} at y ${before.first?.y} (${before.rows.length} rows), after row-${after.first?.row} at y ${after.first?.y} (${after.rows.length} rows)`
    );
    check(
      `${label}: no older page is read again`,
      older.length === 0,
      `${older.length} older page read(s)`
    );
    counted(label, transitions(PILL, from), reads);
    at = after;
  };
  await resetOver("a reset over rows scrolled up to", "agent");
  await resetOver("a reset over rows, the hub failing the read", "failing");
  await resetOver("a reset over rows, the machine offline", "away");
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
  await sim?.release();
  proxy.stop(true);
  await fleet.close();
  await fleet.clean(keep || failures > 0);
}

console.log(`Captures: ${out} (${shots})`);
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
