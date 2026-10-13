#!/usr/bin/env bun
/**
 * iOS queued-message probe: a message the reader sends to a session busy
 * mid-turn stays in the transcript from the moment it leaves the composer,
 * queued until Claude Code takes it, then delivered, and never vanishes,
 * whatever arrives meanwhile, a hub restart and a frozen hub included. And
 * the invariant under it, on iOS and on the web dashboard alike: a
 * transcript never applies events from a different hub process as if they
 * continued its own, and a socket that is dead while it reads open is
 * noticed within ~30 s, after which the client reconnects and reads again.
 *
 *   bun scripts/probe-ios-queued.ts --app <CawCo.app> [--keep]
 *
 * Run from the repo root on the Mac (a CawCo workspace on the Mac runs it
 * too: the scratch fleet is loopback, the simulator is local). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) with one Claude session,
 *     whose mock model streams a long reply to a `HOLD` message (`step 1.
 *     step 2. …`), so a turn stays open for about two minutes;
 *  2. opens the session in the app on an iOS 18.5 simulator of its own, and
 *     in the web dashboard (a `vite dev` server pointed at the scratch hub,
 *     `CAWCO_DEV_HUB_URL`) in Playwright's Chromium, and sends `HOLD` from
 *     the hub's side: the session is busy;
 *  3. types a message into the app's composer and sends it;
 *  4. reads where the app's transcript holds that message from the app's
 *     own DEBUG log (TranscriptView `probe sends`: this device's row, the
 *     hub's queue, among the blocks, or absent; its state; how many rows
 *     hold its id) at the send, +0.5 s, +2 s and +5 s;
 *  5. (a) restarts the hub mid-turn, the message still queued. On each
 *     client the new connection subscribes the session only from the `seq`
 *     of a transcript page read on that connection (iOS: its `page adopted`
 *     and `stream: subscribe` lines; the web: the `stream.subscribe` frames
 *     each socket sent, against the transcript pages the page read after
 *     that socket opened), never from the cursor the hub before left; and
 *     the web's reply reads `step 1. step 2. …` with no step repeated or
 *     skipped;
 *  6. (b) freezes the hub (SIGSTOP), its sockets left open. Each client says
 *     within 30 s that it heard nothing after a heartbeat, shows its
 *     reconnecting state (iOS: "Reconnecting to the hub…" or "Hub
 *     unreachable"; the web: "Hub connection lost"), and once the hub runs
 *     again (SIGCONT) reconnects and reads again, subscribing as in (a);
 *  7. waits for the turn's end and Claude Code's read, then relaunches the
 *     app cold as the control, and counts the rows that carry the
 *     message's words in its accessibility tree.
 *
 * Checks: at every read the message is drawn, in exactly one row, `local`
 * or `queue` until the turn ends and `blocks:read` after; across every line
 * the app logged from the send on, it is never absent and never in two rows;
 * and the checks of (a) and (b) on both clients.
 * It stops only what it started: the fleet's processes, the dev server, the
 * browser, the log stream and the simulator it created (deleted at the end).
 */
import { join } from "node:path";
import type { Subprocess } from "bun";
import { type Browser, chromium, type Page } from "playwright-core";
import { type Reply, type Seen, scratchFleet, until } from "./scratch-fleet";

const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const app = option("--app");
if (!app) {
  console.log(
    "usage: bun scripts/probe-ios-queued.ts --app <CawCo.app> [--keep]"
  );
  process.exit(2);
}
const keep = args.includes("--keep");
const AXE = "/opt/homebrew/bin/axe";
const HOLD = "HOLD";
const WORDS = "queued probe message";
/** How many steps the held reply streams, one every 250 ms. */
const STEPS = 480;
/** A dead socket is noticed by then: a heartbeat every 20 s, answered within 10 s. */
const NOTICED_MS = 30_000;

/** When the probe began: what the failure dumps' times count from. */
const began = Date.now();
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

/** A turn held open by a long reply to `HOLD`; anything else answered at once. */
const respond = (seen: Seen): Reply =>
  seen.last.includes(HOLD)
    ? {
        everyMs: 250,
        words: Array.from({ length: STEPS }, (_, i) => `step ${i + 1}. `),
      }
    : { everyMs: 20, words: ["Done."] };
const fleet = await scratchFleet({ name: "probe-ios-queued", respond });

interface Node {
  frame?: { x: number; y: number; width: number; height: number };
  id?: string;
  label?: string;
}
let udid = "";
const tree = async (): Promise<Node[]> => {
  const out: Node[] = [];
  const walk = (node: Record<string, unknown>) => {
    out.push({
      id: node.AXUniqueId as string | undefined,
      label: (node.AXLabel ?? node.label) as string | undefined,
      frame: node.frame as Node["frame"],
    });
    for (const child of (node.children as
      | Record<string, unknown>[]
      | undefined) ?? []) {
      walk(child);
    }
  };
  const roots = JSON.parse(
    await sh(`${AXE} describe-ui --udid ${udid}`)
  ) as Record<string, unknown>[];
  for (const root of roots) {
    walk(root);
  }
  return out;
};
const tapNode = async (node: Node | undefined) => {
  const f = node?.frame;
  if (!f) {
    throw new Error("nothing to tap");
  }
  await sh(
    `${AXE} tap -x ${Math.round(f.x + f.width / 2)} -y ${Math.round(f.y + f.height / 2)} --udid ${udid}`
  );
};

/** A log line's stamp, process and category, up to what it says. */
const LOG_PREFIX = /^.*\] /;
/** Every line the app logged that this probe reads, with when it heard it. */
const heard: { at: number; line: string }[] = [];
let stream: Subprocess | undefined;
const listen = () => {
  const child = Bun.spawn(
    [
      "bash",
      "-c",
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Ledger" OR category == "Hub")'`,
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
      for (const line of lines) {
        if (
          line.includes("probe sends") ||
          line.includes("page adopted") ||
          line.includes("hub socket") ||
          line.includes("status line: ") ||
          (line.includes("stream: ") && !line.includes(" applied"))
        ) {
          heard.push({ at: Date.now(), line: line.replace(LOG_PREFIX, "") });
        }
      }
    }
  })().catch(() => undefined);
  return child;
};

/** The reader's message's place in a `probe sends` line, by the first 8 of its id. */
const SEND = /(\w{8})=(\w+)(?::(\S+?)x(\d+))?(?=\s|$)/g;
interface Place {
  place: string;
  rows: number;
  state: string;
}
const placeIn = (line: string, id: string): Place | undefined => {
  for (const m of line.matchAll(SEND)) {
    if (m[1] === id) {
      return { place: m[2], state: m[3] ?? "", rows: Number(m[4] ?? 0) };
    }
  }
};
/** The newest `probe sends` line heard by now. */
const latest = () => heard.filter((h) => h.line.includes("probe sends")).at(-1);
let mine = "";
const read = (
  label: string,
  expect: (place: string, state: string) => boolean,
  want: string
) => {
  const line = latest();
  const found = line && mine ? placeIn(line.line, mine) : undefined;
  check(
    `${label}: the message is drawn once, ${want}`,
    found !== undefined && found.rows === 1 && expect(found.place, found.state),
    line ? line.line : "no probe line yet"
  );
};

const launch = () =>
  sh(
    `xcrun simctl launch --terminate-running-process ${udid} dev.cawco.app -paywall-env sandbox -cawco-hub-url ${fleet.base} -open-session ${sessionId} >/dev/null`
  );
const busy = async () =>
  (
    await fleet.api<{ tail?: { busy?: boolean } }>(
      `/api/instances/${sessionId}/transcript`
    )
  ).tail?.busy === true;
let sessionId = "";

// ── The web dashboard's side ─────────────────────────────────────────────
let dashboard: Subprocess | undefined;
let browser: Browser | undefined;
let page: Page | undefined;
/** Each `/ws/dashboard` socket the page opened, in order, with when. */
const sockets: { at: number; closedAt?: number }[] = [];
/** Every `stream.subscribe` the page sent for the session, by socket. */
const subscribes: { afterSeq?: number; at: number; socket: number }[] = [];
/** The `seq` of every newest transcript page the page read for the session. */
const pages: { at: number; seq: number }[] = [];
/** The page's console lines the probe reads. */
const consoleLines: { at: number; text: string }[] = [];

const openDashboard = async () => {
  const root = join(import.meta.dir, "..");
  const port = Number(new URL(fleet.base).port) + 7;
  const site = `http://127.0.0.1:${port}`;
  dashboard = Bun.spawn(
    [
      join(root, "apps/dashboard/node_modules/.bin/vite"),
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    {
      cwd: join(root, "apps/dashboard"),
      env: {
        ...process.env,
        CAWCO_DEV_HUB_URL: fleet.base,
        CAWCO_PREVIEW_PORT: fleet.env.CAWCO_PREVIEW_PORT,
      },
      stdout: Bun.file(join(fleet.sandbox, "dashboard.log")),
      stderr: Bun.file(join(fleet.sandbox, "dashboard.err")),
    }
  );
  await until(
    "the dev server answering",
    () =>
      fetch(site).then(
        (r) => r.ok,
        () => false
      ),
    Boolean,
    120_000
  );
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("console", (message) => {
    const text = message.text();
    if (
      text.includes("[cawco] read ") ||
      text.includes("hub socket") ||
      text.includes("stream:")
    ) {
      consoleLines.push({ at: Date.now(), text });
    }
  });
  page.on("websocket", (socket) => {
    if (!socket.url().includes("/ws/dashboard")) {
      return;
    }
    sockets.push({ at: Date.now() });
    const index = sockets.length - 1;
    socket.on("close", () => {
      sockets[index].closedAt = Date.now();
    });
    socket.on("framesent", ({ payload }) => {
      try {
        const message = JSON.parse(String(payload)) as {
          afterSeq?: number;
          sessionId?: string;
          type?: string;
        };
        if (
          message.type === "stream.subscribe" &&
          message.sessionId === sessionId
        ) {
          subscribes.push({
            afterSeq: message.afterSeq,
            at: Date.now(),
            socket: index,
          });
        }
      } catch {
        // A part of a longer message: never a subscribe.
      }
    });
  });
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (
      url.pathname !== `/api/instances/${sessionId}/transcript` ||
      url.searchParams.has("before")
    ) {
      return;
    }
    // When it came, before its body is read: the page subscribes as soon as
    // it has read the body itself.
    const at = Date.now();
    const body = (await response.json().catch(() => null)) as {
      seq?: number;
    } | null;
    if (typeof body?.seq === "number") {
      pages.push({ at, seq: body.seq });
    }
  });
  await page.goto(`${site}/session/${sessionId}`, {
    waitUntil: "domcontentloaded",
  });
  await until(
    "the web transcript drawn",
    () => listingText(),
    (text) => text.includes("Say hello") || text.includes("Done."),
    120_000
  );
};

/** The web transcript's text, as drawn. */
const listingText = async (): Promise<string> =>
  (await page
    ?.locator(".listing")
    .first()
    .textContent({ timeout: 2000 })
    .catch(() => "")) ?? "";

/** Whether the web reply's steps run 1, 2, 3… with none repeated or skipped. */
const STEP = /step (\d+)\./g;
const HAS_STEP = /step \d+\./;

/**
 * Whether a reply's steps, as drawn, run on one at a time, none repeated or
 * skipped: a stream from another hub process applied as a continuation would
 * repeat or skip them. Where it starts is reported, not checked: a reply
 * read mid-turn after a hub restart starts where the new process's stream
 * picked it up (the old process held its first steps in memory only), and
 * reads whole once the turn ends.
 */
const stepsInOrder = (label: string, who: string, text: string) => {
  const steps = [...text.matchAll(STEP)].map((m) => Number(m[1]));
  const broken = steps.findIndex((n, i) => i > 0 && n !== steps[i - 1] + 1);
  check(
    `${label}: ${who}: the reply's steps run on one at a time, none repeated or skipped`,
    steps.length > 0 && broken < 0,
    broken < 0
      ? `step ${steps[0]} to ${steps.at(-1)}`
      : `at ${broken}: …${steps.slice(Math.max(0, broken - 3), broken + 3).join(", ")}…`
  );
};
const webStepsInOrder = async (label: string) =>
  stepsInOrder(label, "web", await listingText());
/** The app's reply as its accessibility tree reads it: the longest label carrying steps. */
const iosStepsInOrder = async (label: string) =>
  stepsInOrder(
    label,
    "iOS",
    (await tree())
      .map((n) => n.label ?? "")
      .filter((text) => HAS_STEP.test(text))
      .sort((a, b) => b.length - a.length)[0] ?? ""
  );

/**
 * The web page's every socket since `since` subscribed the session only from
 * the `seq` of a transcript page it read after that socket opened, and at
 * least one did.
 */
const webRejoined = (label: string, since: number) => {
  const fresh = sockets
    .map((s, index) => ({ ...s, index }))
    .filter((s) => s.at >= since);
  const theirs = subscribes.filter((s) =>
    fresh.some((f) => f.index === s.socket)
  );
  const wrong = theirs.filter((s) => {
    const opened = sockets[s.socket].at;
    return !pages.some(
      (p) => p.at >= opened && p.at <= s.at && p.seq === s.afterSeq
    );
  });
  check(
    `${label}: web: each new socket subscribes only from a page read on it`,
    fresh.length > 0 && theirs.length > 0 && wrong.length === 0,
    `${fresh.length} socket(s) (${fresh.map((s) => `#${s.index} opened +${s.at - since} ms${s.closedAt ? `, closed +${s.closedAt - since} ms` : ""}`).join("; ")}), subscribes ${theirs.map((s) => `#${s.socket} after ${s.afterSeq ?? "none"}`).join(", ") || "none"}; pages read ${pages
      .filter((p) => p.at >= since)
      .map((p) => p.seq)
      .join(", ")}`
  );
};

/** The `seq` a `page adopted` line read at, and the `afterSeq` of a `stream: subscribe` line. */
const PAGE_SEQ = /at seq (-?[\d.]+)/;
const SUBSCRIBE_AFTER = / after (-?[\d.]+)/;

/**
 * The app's new connection since `from` (an index into `heard`) subscribed
 * the session first from the `seq` of a page it read on that connection.
 * The adoption makes the subscribe and logs it (Ledger `adoptPage`) before
 * Sessions logs the page, so the connection's first subscribe must be
 * followed at once by a page adopted at its `seq`; a resume from the cursor
 * the connection before left would come with no page.
 */
const iosRejoined = (label: string, from: number) => {
  const lines = heard.slice(from).map((h) => h.line);
  const open = lines.findIndex((l) => l.includes("hub socket open"));
  const subscribe = `stream: subscribe ${sessionId.slice(0, 8)}`;
  const adopted = `page adopted for ${sessionId}`;
  const order = lines
    .slice(open + 1)
    .filter((l) => l.includes(subscribe) || l.includes(adopted));
  const first = order.findIndex((l) => l.includes(subscribe));
  const after = Number(SUBSCRIBE_AFTER.exec(order[first] ?? "")?.[1]);
  const adoption = order[first + 1];
  const seq = Number(PAGE_SEQ.exec(adoption ?? "")?.[1]);
  check(
    `${label}: iOS: the new connection subscribes only from the page it read`,
    open >= 0 &&
      first >= 0 &&
      adoption?.includes(adopted) === true &&
      Number.isFinite(after) &&
      after === seq,
    `"${order[first] ?? "no subscribe"}", then "${adoption ?? "no page"}"`
  );
};

/** Waits for a console line from the page heard after `since`. */
const webSaid = (what: string, needle: string, since: number, ms: number) =>
  until(
    what,
    () => consoleLines.find((c) => c.at >= since && c.text.includes(needle)),
    Boolean,
    ms
  );
/** Waits for a line from the app heard after `from`. */
const iosSaid = (what: string, needle: string, from: number, ms: number) =>
  until(
    what,
    () => heard.slice(from).find((h) => h.line.includes(needle)),
    Boolean,
    ms
  );
/**
 * Stops everything this probe started, once, whichever way it ends: the log
 * stream, the browser, the dev server, the simulator it created (shut down,
 * then deleted, so none is left booted for its daemons to crash on the Mac's
 * screen), and the fleet. An interrupt (SIGINT, SIGTERM) runs it too.
 */
let tornDown: Promise<void> | undefined;
const teardown = () => {
  tornDown ??= (async () => {
    stream?.kill();
    await browser?.close().catch(() => undefined);
    if (dashboard) {
      await fleet.killTree(dashboard.pid, "SIGTERM").catch(() => undefined);
    }
    if (udid) {
      await sh(`xcrun simctl shutdown ${udid} >/dev/null 2>&1 || true
xcrun simctl delete ${udid}`).catch((error: unknown) =>
        console.log(`  the simulator ${udid} was not deleted: ${error}`)
      );
    }
    await fleet.close();
    await fleet.clean(keep);
  })();
  return tornDown;
};
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`  ${signal}: stopping what this probe started`);
    teardown().finally(() => process.exit(130));
  });
}

const banner = async () =>
  (await page
    ?.locator(".banner")
    .first()
    .textContent({ timeout: 1000 })
    .catch(() => null)) ?? null;

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  sessionId = await fleet.spawn("claude", "Queued probe");
  await fleet.send(sessionId, "Say hello.");
  await until("the first turn over", busy, (b) => !b, 120_000);

  udid = (
    await sh(`TYPE=$(xcrun simctl list devicetypes -j | python3 -c '
import json, sys
names = {d["name"]: d["identifier"] for d in json.load(sys.stdin)["devicetypes"]}
print(names["iPhone 16 Pro"])
')
xcrun simctl create "CawCo probe queued" "$TYPE" com.apple.CoreSimulator.SimRuntime.iOS-18-5`)
  ).trim();
  console.log(`  simulator ${udid} (iOS 18.5)`);
  await sh(`xcrun simctl boot ${udid}
xcrun simctl bootstatus ${udid} -b >/dev/null
xcrun simctl install ${udid} "${app}"`);
  stream = listen();
  await launch();
  const field = await until(
    "the session's composer on screen",
    async () => (await tree()).find((n) => n.id === "steer-message"),
    (node) => node?.frame !== undefined,
    120_000
  );
  await openDashboard();

  // ── Busy mid-turn ──────────────────────────────────────────────────────
  await fleet.send(sessionId, `${HOLD}: work through the steps.`);
  await until("the session busy", busy, Boolean, 60_000);
  await pause(1500);
  check("the session is busy before the send", await busy(), "tail.busy true");

  // ── The send, from the app's composer ──────────────────────────────────
  await tapNode(field);
  await pause(800);
  await sh(`${AXE} type '${WORDS}' --udid ${udid}`);
  await pause(400);
  const sendButton = (await tree()).find((n) => n.id === "send-steer");
  const from = heard.length;
  await tapNode(sendButton);
  const t0 = Date.now();
  // Its id: the send this device drew (`local`), first heard after the tap.
  const first = await until(
    "the message drawn by this device",
    () =>
      heard
        .slice(from)
        .map((h) => [...h.line.matchAll(SEND)].find((m) => m[2] === "local"))
        .find(Boolean),
    Boolean,
    5000
  );
  mine = first?.[1] ?? "";
  const drawnAfter =
    (heard.slice(from).find((h) => h.line.includes(`${mine}=local`))?.at ??
      t0) - t0;
  console.log(`  message ${mine}, drawn ${drawnAfter} ms after the tap`);
  read("at the send", (p) => p === "local" || p === "queue", "local or queued");
  const waiting = (p: string, s: string) =>
    (p === "local" && s === "sending") || (p === "queue" && s === "pending");
  await pause(Math.max(0, t0 + 500 - Date.now()));
  read("+0.5 s", waiting, "sending here or pending on the hub");
  await pause(Math.max(0, t0 + 2000 - Date.now()));
  read("+2 s", waiting, "sending here or pending on the hub");
  await pause(Math.max(0, t0 + 5000 - Date.now()));
  read("+5 s", (p, s) => p === "queue" && s === "pending", "queued on the hub");
  check("+5 s: the session is still mid-turn", await busy(), "tail.busy true");
  await webStepsInOrder("before the restart");
  await iosStepsInOrder("before the restart");

  // ── (a) A hub restart with the message queued: the owner's case ────────
  const beforeRestart = heard.length;
  const restartAt = Date.now();
  await fleet.stop("hub");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  await iosSaid(
    "the app's read after the reconnect",
    `page adopted for ${sessionId}`,
    beforeRestart,
    60_000
  );
  await webSaid(
    "the web's read after the reconnect",
    // `reconnect`, or `machineOnline` when the reconnect's read found the
    // machine not yet back on the new hub: a failed read logs no line.
    `read ${sessionId.slice(0, 8)} because `,
    restartAt,
    // Its reconnect backs off while the hub is down: 1, 2, 4, 8, 16 s, then 30.
    120_000
  );
  // Long enough for the new process's events to stream on past the page.
  await pause(5000);
  const stillBusy = await busy();
  read(
    "(a) after the hub restart and the app's read",
    (p, s) =>
      stillBusy
        ? p === "queue" && s === "pending"
        : p === "queue" || p === "blocks",
    stillBusy ? "queued on the hub" : "queued or delivered"
  );
  check("(a) the session is still mid-turn", stillBusy, "tail.busy true");
  iosRejoined("(a)", beforeRestart);
  webRejoined("(a)", restartAt);
  await webStepsInOrder("(a) after the restart");
  await iosStepsInOrder("(a) after the restart");

  // ── (b) A frozen hub: the sockets stay open, nothing answers ───────────
  const beforeFreeze = heard.length;
  const frozenAt = Date.now();
  fleet.freeze("hub", true);
  try {
    // Each wait here only records: a check that fails still lets the others
    // run, and the hub is let go below whatever they find.
    const iosNoticed = await iosSaid(
      "the app noticing the dead socket",
      "hub socket: nothing heard",
      beforeFreeze,
      NOTICED_MS + 15_000
    ).catch(() => undefined);
    check(
      "(b) iOS: the dead socket is noticed within 30 s",
      (iosNoticed?.at ?? Number.POSITIVE_INFINITY) - frozenAt <= NOTICED_MS,
      iosNoticed
        ? `after ${iosNoticed.at - frozenAt} ms: ${iosNoticed.line}`
        : `not heard; its heartbeat lines: ${
            heard
              .slice(beforeFreeze - 12)
              .filter((h) => h.line.includes("hub socket"))
              .map((h) => `${h.at - frozenAt} ms ${h.line}`)
              .join(" / ") || "none"
          }`
    );
    const webNoticed = await webSaid(
      "the web noticing the dead socket",
      "hub socket: nothing heard",
      frozenAt,
      NOTICED_MS + 15_000
    ).catch(() => undefined);
    check(
      "(b) web: the dead socket is noticed within 30 s",
      (webNoticed?.at ?? Number.POSITIVE_INFINITY) - frozenAt <= NOTICED_MS,
      webNoticed
        ? `after ${webNoticed.at - frozenAt} ms: ${webNoticed.text}`
        : "not heard"
    );
    const reconnecting = await until(
      "the app's reconnecting state",
      async () =>
        (await tree())
          .map((n) => n.label ?? "")
          .find(
            (label) =>
              label.includes("Reconnecting to the hub") ||
              label.includes("Hub unreachable")
          ) ??
        heard
          .slice(beforeFreeze)
          .find((h) => h.line.includes("status line: Hub unreachable"))?.line,
      Boolean,
      20_000
    ).catch(() => undefined);
    check(
      "(b) iOS: the reconnecting state is shown",
      Boolean(reconnecting),
      String(reconnecting)
    );
    const lost = await until(
      "the web's reconnecting banner",
      banner,
      (text) => text?.includes("Hub connection lost") === true,
      20_000
    ).catch(() => null);
    check(
      "(b) web: the reconnecting state is shown",
      lost?.includes("Hub connection lost") === true,
      lost?.trim().replace(/\s+/g, " ") ?? "no banner"
    );
  } finally {
    fleet.freeze("hub", false);
  }
  const thawedAt = Date.now();
  const beforeThaw = heard.length;
  await iosSaid(
    "the app's read after the hub runs again",
    `page adopted for ${sessionId}`,
    beforeThaw,
    120_000
  );
  await webSaid(
    "the web's read after the hub runs again",
    `read ${sessionId.slice(0, 8)} because `,
    thawedAt,
    120_000
  );
  await until("the web's banner gone", banner, (text) => text === null, 30_000);
  await pause(3000);
  check(
    "(b) web: the reconnecting state is gone",
    (await banner()) === null,
    "no banner"
  );
  const busyAfterThaw = await busy();
  read(
    "(b) after the hub runs again and the app's read",
    (p, s) =>
      busyAfterThaw
        ? p === "queue" && s === "pending"
        : p === "queue" || p === "blocks",
    busyAfterThaw ? "queued on the hub" : "queued or delivered"
  );
  iosRejoined("(b)", beforeFreeze);
  webRejoined("(b)", frozenAt);
  await webStepsInOrder("(b) after the freeze");
  await iosStepsInOrder("(b) after the freeze");

  // ── The turn ends, Claude Code reads it ────────────────────────────────
  await until(
    "the message delivered",
    () => {
      const line = latest();
      return line ? placeIn(line.line, mine) : undefined;
    },
    (found) => found?.place === "blocks" && found.state === "read",
    300_000
  );
  read("after the turn", (p, s) => p === "blocks" && s === "read", "delivered");
  await webStepsInOrder("after the turn");
  await iosStepsInOrder("after the turn");
  const webText = (await listingText()).toLowerCase();
  const webCopies = webText.split(WORDS).length - 1;
  check(
    "after the turn: web: the message's words are drawn once",
    webCopies === 1,
    `${webCopies} cop${webCopies === 1 ? "y" : "ies"}`
  );

  // ── Every line from the send on ────────────────────────────────────────
  const lines = heard
    .slice(from)
    .filter(
      (h) => h.line.includes("probe sends") && h.line.includes(`${mine}=`)
    );
  const places = lines.map((h) => ({
    at: h.at,
    found: placeIn(h.line, mine) ?? { place: "absent", state: "", rows: 0 },
  }));
  const gone = places.filter((p) => p.found.place === "absent");
  const doubled = places.filter((p) => p.found.rows > 1);
  console.log("  every place the app drew it in, from the send on:");
  let last = "";
  for (const { at, found } of places) {
    const said = `${found.place}:${found.state} x${found.rows}`;
    if (said !== last) {
      console.log(`    +${at - t0} ms ${said}`);
      last = said;
    }
  }
  check(
    "never absent from the send on",
    gone.length === 0,
    `${lines.length} lines, ${gone.length} absent`
  );
  check(
    "never in two rows",
    doubled.length === 0,
    `${doubled.length} lines with more than one row`
  );
  for (const said of heard
    .slice(beforeRestart)
    .filter((h) => !h.line.includes("probe sends"))
    .slice(0, 40)) {
    console.log(`    app: +${said.at - t0} ms ${said.line}`);
  }
  for (const said of consoleLines.filter((c) => c.at >= restartAt)) {
    console.log(`    web: +${said.at - t0} ms ${said.text}`);
  }

  // ── The control: a cold launch reads it whole ──────────────────────────
  await sh(`xcrun simctl terminate ${udid} dev.cawco.app`);
  await launch();
  const shown = await until(
    "the message's words on screen after a cold launch",
    // The field capitalises a message's first word as it is typed.
    async () =>
      (await tree()).filter(
        (n) => n.label?.toLowerCase().includes(WORDS) === true
      ),
    (nodes) => nodes.length > 0,
    120_000
  );
  check(
    "cold launch: the message's words are drawn",
    shown.length >= 1,
    `${shown.length} element(s) carry them`
  );
} catch (error) {
  console.log(`FAIL ${error instanceof Error ? error.message : String(error)}`);
  failures += 1;
  console.log("  the app's last lines, ms since the probe began:");
  for (const h of heard.slice(-25)) {
    console.log(`    +${h.at - began} ${h.line}`);
  }
  console.log("  the web's last lines, and its sockets:");
  for (const c of consoleLines.slice(-15)) {
    console.log(`    +${c.at - began} ${c.text}`);
  }
  for (const [index, s] of sockets.entries()) {
    console.log(
      `    socket #${index} opened +${s.at - began}${s.closedAt ? `, closed +${s.closedAt - began}` : ""}`
    );
  }
  if (udid) {
    const nodes = await tree().catch(() => []);
    console.log(
      `  on screen: ${nodes
        .filter((n) => n.id || n.label)
        .map((n) => n.id ?? n.label)
        .slice(0, 40)
        .join(" | ")}`
    );
  }
} finally {
  await teardown();
}
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
