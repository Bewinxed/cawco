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
 *   bun scripts/probe-ios-queued.ts --app <CawCo.app> [--harness claude|opencode] [--join direct] [--keep]
 *
 * Run from the repo root on the Mac (a CawCo workspace on the Mac runs it
 * too: the scratch fleet is loopback, the simulator is local). It:
 *
 *  1. stands up a scratch fleet (scratch-fleet.ts) with one Claude session
 *     (or OpenCode, `--harness opencode`),
 *     whose mock model streams a long reply to a `HOLD` message (`step 1.
 *     step 2. …`), so a turn stays open for about two minutes;
 *  2. opens the session in the app on an iOS 18.5 simulator (a mac-slot.sh
 *     simulator slot, below), and
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
 *     that socket opened), never from the cursor the hub before left. While
 *     the turn is still running, each client's reply reads `step 1. step 2.
 *     …` whole, none repeated or skipped (the web's drawn text; the app's
 *     DEBUG `probe reply` line), though the new hub process heard only what
 *     streamed after it started (the agent says the reply so far again,
 *     STREAM_SO_FAR). Until the web has read the transcript again, nothing it
 *     says over the rows or in a toast calls it not caught up: its machine is
 *     reconnecting;
 *  6. (b) freezes the hub (SIGSTOP), its sockets left open. Each client says
 *     within 30 s that it heard nothing after a heartbeat, shows its
 *     reconnecting state (iOS: "Reconnecting to the hub…" or "Hub
 *     unreachable"; the web: "Hub connection lost"), and once the hub runs
 *     again (SIGCONT) reconnects and reads again, subscribing as in (a);
 *  7. (c) black-holes the agent's link to the hub alone (a proxy between the
 *     two, its sockets left open), the hub, the web page and the app staying
 *     connected, while a turn runs a tool and ends on a message. The agent
 *     drops its silent link by its heartbeat's deadline, and once the link
 *     is back sends again what the hub did not take (outbox.ts, "same hub").
 *     The web page and the app draw the tool and the message with no reload,
 *     and exactly as a fresh read draws them (the page reloaded, the app
 *     relaunched cold): neither missing, neither twice;
 *  8. waits for the turn's end and Claude Code's read, then relaunches the
 *     app cold as the control, and counts the rows that carry the
 *     message's words in its accessibility tree.
 *
 * Checks: at every read the message is drawn, in exactly one row, `local`
 * or `queue` until the turn ends and `blocks:read` after; across every line
 * the app logged from the send on, it is never absent and never in two rows;
 * and the checks of (a) and (b) on both clients.
 * It stops only what it started: the fleet's processes, the dev server, the
 * browser and the log stream. Its simulator is a mac-slot.sh simulator slot,
 * created for it and deleted as it ends, however it ends.
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
const harness = option("--harness") ?? "claude";
if (!app || (harness !== "claude" && harness !== "opencode")) {
  console.log(
    "usage: bun scripts/probe-ios-queued.ts --app <CawCo.app> [--harness claude|opencode] [--join direct] [--keep]"
  );
  process.exit(2);
}
const keep = args.includes("--keep");

/**
 * The simulator runs in one of the Mac's two simulator slots
 * (apps/apple/scripts/mac-slot.sh, README "The Mac's slots"): run without
 * one, the probe runs itself again inside `mac-slot.sh sim`, which creates
 * and boots an iPhone 16 Pro on iOS 18.5 for it ($CAWCO_SIM_UDID), and shuts
 * it down and deletes it when the probe ends, however it ends.
 */
if (!process.env.CAWCO_SIM_UDID) {
  const slotted = Bun.spawn(
    [
      "bash",
      join(import.meta.dir, "../apps/apple/scripts/mac-slot.sh"),
      "sim",
      "--runtime",
      "com.apple.CoreSimulator.SimRuntime.iOS-18-5",
      "--device",
      "com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro",
      "--",
      process.execPath,
      import.meta.path,
      ...args,
    ],
    { stdin: "inherit", stdout: "inherit", stderr: "inherit" }
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => slotted.kill(signal));
  }
  process.exit(await slotted.exited);
}
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

/** The turn case (c) runs while the agent's link is down: a tool call, then a message. */
const LINK = "LINKDROP";
/** What the tool prints: its row carries it. */
const LINK_MARK = "linkmark-tool-ran";
/** The message the turn ends on. */
const LINK_WORDS = "Relinked: this was written while the link was down.";

/**
 * A turn held open by a long reply to `HOLD`; the `LINKDROP` turn's tool
 * call, slow, then its message once the tool's result is read; anything else
 * answered at once.
 */
const respond = (seen: Seen): Reply => {
  if (seen.last.includes(HOLD)) {
    return {
      everyMs: 250,
      words: Array.from({ length: STEPS }, (_, i) => `step ${i + 1}. `),
    };
  }
  if (seen.last.includes(LINK) && !seen.afterTool) {
    return {
      everyMs: 1500,
      words: [],
      tool: {
        // Each harness's own name for its shell tool.
        name: seen.toolNames.includes("bash") ? "bash" : "Bash",
        input: { command: `echo ${LINK_MARK}`, description: "Print the mark" },
      },
    };
  }
  if (seen.afterTool && seen.all.includes(LINK)) {
    return {
      everyMs: 600,
      words: LINK_WORDS.split(" ").map((word) => `${word} `),
    };
  }
  return { everyMs: 20, words: ["Done."] };
};
const fleet = await scratchFleet({ name: "probe-ios-queued", respond });

/**
 * The agent's link to the hub, through a proxy the probe holds: `freeze`
 * black-holes every byte both ways on every connection, the sockets left
 * open (a network that went away: no FIN, no reset), new connections too;
 * `thaw` ends the black-holed ones and lets new ones through. The hub, the
 * web page and the app stay connected to each other throughout.
 */
const linkProxy = (hubPort: number) => {
  /** Bytes owed one way: a socket's `write` takes what fits, `drain` says when more does. */
  interface Way {
    queue: Uint8Array[];
    to?: import("bun").Socket<Pair>;
  }
  interface Pair {
    client: import("bun").Socket<Pair>;
    dead: boolean;
    down: Way;
    up: Way;
  }
  /** Every byte, in order: what a write did not take waits for the socket's drain. */
  const flush = (way: Way): void => {
    while (way.to && way.queue.length > 0) {
      const [chunk] = way.queue;
      const wrote = way.to.write(chunk);
      if (wrote < chunk.length) {
        way.queue[0] = chunk.subarray(Math.max(0, wrote));
        return;
      }
      way.queue.shift();
    }
  };
  const pass = (way: Way, chunk: Uint8Array): void => {
    // Copied: the socket reuses the buffer it hands `data`.
    way.queue.push(new Uint8Array(chunk));
    flush(way);
  };
  let frozen = false;
  const pairs = new Set<Pair>();
  const server = Bun.listen<Pair>({
    hostname: "127.0.0.1",
    port: 0,
    socket: {
      open(client) {
        const pair: Pair = {
          client,
          dead: frozen,
          down: { queue: [], to: client },
          up: { queue: [] },
        };
        client.data = pair;
        pairs.add(pair);
        Bun.connect<Pair>({
          hostname: "127.0.0.1",
          port: hubPort,
          socket: {
            open(upstream) {
              upstream.data = pair;
              pair.up.to = upstream;
              flush(pair.up);
            },
            data(_upstream, chunk) {
              if (!pair.dead) {
                pass(pair.down, chunk);
              }
            },
            drain() {
              flush(pair.up);
            },
            close() {
              if (!pair.dead) {
                pair.client.end();
              }
            },
            error() {
              pair.client.end();
            },
          },
        }).catch(() => client.end());
      },
      data(client, chunk) {
        if (!client.data.dead) {
          pass(client.data.up, chunk);
        }
      },
      drain(client) {
        flush(client.data.down);
      },
      close(client) {
        pairs.delete(client.data);
        client.data.up.to?.end();
      },
    },
  });
  return {
    port: server.port,
    freeze() {
      frozen = true;
      for (const pair of pairs) {
        pair.dead = true;
      }
    },
    thaw() {
      frozen = false;
      for (const pair of pairs) {
        if (pair.dead) {
          pair.client.end();
          pair.up.to?.end();
        }
      }
    },
    stop() {
      server.stop(true);
    },
  };
};
const proxy = linkProxy(Number(new URL(fleet.base).port));
// The agent reaches the hub through it; everything else, directly.
fleet.env.CAWCO_HUB_URL = `ws://127.0.0.1:${proxy.port}/ws`;
/**
 * The address the scratch machine joined (`config.json`'s `hubUrl`): the
 * proxied one its agent uses, as on a real machine; or, `--join direct`, the
 * hub's own, so the machine joined by one address and its agent reaches the
 * same hub by another, and is the machine's agent by the hub's id
 * (agent machine-agent.ts).
 */
const joinedBy =
  option("--join") === "direct" ? fleet.base : `http://127.0.0.1:${proxy.port}`;
await Bun.write(
  join(fleet.home, ".config", "cawco", "config.json"),
  JSON.stringify({ hubUrl: joinedBy })
);

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
      `exec xcrun simctl spawn ${udid} log stream --level debug --style compact --predicate 'subsystem == "dev.cawco.app" AND (category == "Transcript" OR category == "Ledger" OR category == "Hub" OR category == "Restore")'`,
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
          line.includes("probe reply") ||
          line.includes("page adopted") ||
          line.includes("hub socket") ||
          line.includes("status line: ") ||
          line.includes("place ") ||
          line.includes("catch-up ") ||
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
      text.includes("[cawco] toast:") ||
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

const STEP = /step (\d+)\./g;
const LAST_STEP = /step (\d+)\.\s*$/;

/**
 * Whether the web reply, as drawn, reads step 1 onward, one at a time, none
 * repeated or skipped: the whole reply so far, also mid-turn after a hub
 * restart (what only the old process had heard comes again whole,
 * STREAM_SO_FAR), and no stream from another process applied as a
 * continuation (which would repeat or skip steps).
 */
const webStepsInOrder = async (label: string) => {
  const steps = [...(await listingText()).matchAll(STEP)].map((m) =>
    Number(m[1])
  );
  const broken = steps.findIndex((n, i) => n !== i + 1);
  check(
    `${label}: web: the reply reads step 1 onward, none repeated or skipped`,
    steps.length > 0 && broken < 0,
    broken < 0
      ? `step 1 to ${steps.at(-1)}`
      : `at ${broken}: …${steps.slice(Math.max(0, broken - 3), broken + 3).join(", ")}…`
  );
};

/** The app's `probe reply` line: its newest assistant row and its live tail, each as length, head and end. */
const REPLY =
  /probe reply \w+: row (\d+) "(.*?)…(.*?)" stream (\d+) "(.*?)…(.*?)"$/;

/** How long `step 1. step 2. … step N. ` is: "step " and ". " around each number. */
const stepsLength = (last: number): number => {
  let length = 0;
  for (let step = 1; step <= last; step += 1) {
    length += 7 + String(step).length;
  }
  return length;
};

/**
 * The same of the app, read off its DEBUG `probe reply` line (TranscriptView
 * `sayReply`): the reply it holds (the live tail while one is written, the
 * newest assistant row once it is) begins `step 1.`, ends on step N, and is
 * exactly as long as `step 1. … step N. `, so no step is missing or doubled.
 */
const iosStepsInOrder = (label: string) => {
  // The newest line that holds the stepped reply: once the turn has ended,
  // the queued message is answered too, and its "Done." becomes the newest
  // assistant row after the reply's own.
  const said = heard
    .filter((h) => h.line.includes("probe reply") && h.line.includes('"step '))
    .at(-1);
  const m = said ? REPLY.exec(said.line) : null;
  // The live tail while it holds anything, else the newest assistant row.
  const at = m && Number(m[4]) > 0 ? 4 : 1;
  const [length, head, end] = m
    ? [Number(m[at]), m[at + 1], m[at + 2]]
    : [0, "", ""];
  const last = Number(LAST_STEP.exec(end)?.[1] ?? 0);
  const want = stepsLength(last);
  check(
    `${label}: iOS: the reply reads step 1 onward, none repeated or skipped`,
    head.startsWith("step 1. ") &&
      last > 0 &&
      (length === want || length === want - 1),
    said
      ? `step 1 to ${last}? "${head}…${end}", ${length} characters, ${want} for steps 1 to ${last}`
      : "no probe reply line"
  );
};

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
 * stream, the browser, the dev server and the fleet. An interrupt (SIGINT,
 * SIGTERM) runs it too. The simulator is the slot's: mac-slot.sh shuts it
 * down and deletes it as the probe ends.
 */
let tornDown: Promise<void> | undefined;
const teardown = () => {
  tornDown ??= (async () => {
    stream?.kill();
    await browser?.close().catch(() => undefined);
    if (dashboard) {
      await fleet.killTree(dashboard.pid, "SIGTERM").catch(() => undefined);
    }
    await fleet.close();
    proxy.stop();
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

/** The last lines the scratch agent, hub and OpenCode server wrote, said on a failure. */
const sayScratchLogs = async (): Promise<void> => {
  const tail = (text: string, lines: number) =>
    text
      .split("\n")
      .filter(Boolean)
      .slice(-lines)
      .map((line) => `    ${line.slice(0, 400)}`)
      .join("\n");
  const [agentSaid, hubSaid] = await Promise.all(
    (["agent", "hub"] as const).map((role) => fleet.logs(role).catch(() => ""))
  );
  console.log(`  the scratch agent's last lines:\n${tail(agentSaid, 40)}`);
  console.log(`  the scratch hub's last lines:\n${tail(hubSaid, 40)}`);
  const opencodeLogs = join(fleet.home, ".local/share/opencode/log");
  const files = (
    await Array.fromAsync(
      new Bun.Glob("*.log").scan({ cwd: opencodeLogs })
    ).catch(() => [] as string[])
  )
    .sort()
    .slice(-2);
  const texts = await Promise.all(
    files.map((file) =>
      Bun.file(join(opencodeLogs, file))
        .text()
        .catch(() => "")
    )
  );
  for (const [index, file] of files.entries()) {
    console.log(`  OpenCode's ${file}, last lines:\n${tail(texts[index], 25)}`);
  }
};

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
  // The agent's own word on whether it is the machine's: joined by the
  // address it uses, nothing to say; joined by another, the machine's agent
  // by the hub's id once it registers. Never "not this machine's agent"
  // after it has registered, which stops OpenCode from starting.
  const machineSaid = await until(
    "the agent's word on being the machine's",
    async () => {
      const lines = (await fleet.logs("agent")).split("\n");
      const registered = lines.findIndex((line) =>
        line.includes("registered with")
      );
      const after = lines.slice(registered + 1);
      return registered < 0
        ? undefined
        : {
            refused: after.filter((line) =>
              line.includes("not this machine's agent")
            ),
            by: after.find((line) => line.includes("this machine's agent:")),
          };
    },
    (said) =>
      said !== undefined &&
      (option("--join") !== "direct" || said.by !== undefined),
    60_000
  ).catch(() => undefined);
  check(
    "the agent is the machine's own, joined by the address it uses or another",
    machineSaid !== undefined && machineSaid.refused.length === 0,
    `joined by ${joinedBy}, the agent at ${fleet.env.CAWCO_HUB_URL}: ${machineSaid?.by ?? (machineSaid ? "the same address" : "nothing said")}${machineSaid?.refused.length ? `; refused: ${machineSaid.refused.join(" / ")}` : ""}`
  );
  sessionId = await fleet.spawn(harness, "Queued probe");
  console.log(`  ${harness} session ${sessionId}`);
  await fleet.send(sessionId, "Say hello.");
  await until("the first turn over", busy, (b) => !b, 120_000);

  // The slot's simulator, booted by mac-slot.sh, which also deletes it.
  udid = process.env.CAWCO_SIM_UDID ?? "";
  console.log(`  simulator ${udid} (iOS 18.5, a mac-slot.sh simulator slot)`);
  await sh(`xcrun simctl install ${udid} "${app}"`);
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
  iosStepsInOrder("before the restart");

  // ── (a) A hub restart with the message queued: the owner's case ────────
  const beforeRestart = heard.length;
  const restartAt = Date.now();
  // What the web page says over the rows, and in toasts, until it has read
  // the transcript again: the gap before the machine is back on the new hub.
  const gapSaid = new Set<string>();
  const sampler = setInterval(async () => {
    const said =
      (await page
        ?.evaluate(() =>
          [...document.querySelectorAll(".behind, [data-sonner-toast]")].map(
            (node) => node.textContent?.trim().replace(/\s+/g, " ") ?? ""
          )
        )
        .catch(() => [])) ?? [];
    for (const text of said) {
      if (text) {
        gapSaid.add(text);
      }
    }
  }, 250);
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
  clearInterval(sampler);
  const toasts = consoleLines.filter(
    (c) => c.at >= restartAt && c.text.includes("[cawco] toast:")
  );
  const caughtUp = [...gapSaid].filter((text) => text.includes("caught up"));
  check(
    "(a) web: the gap before the machine is back never says it isn't caught up",
    toasts.length === 0 && caughtUp.length === 0,
    `said over the rows or in a toast: ${[...gapSaid].join(" / ") || "nothing"}${toasts.length ? `; toasts: ${toasts.map((c) => c.text).join(" / ")}` : ""}`
  );
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
  iosStepsInOrder("(a) after the restart");

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
  iosStepsInOrder("(b) after the freeze");

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
  iosStepsInOrder("after the turn");
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

  // ── (c) The agent's link drops, the hub stays up ───────────────────────
  // A turn that runs a tool and ends on a message, all while the agent's
  // link to the hub is black-holed: the agent notices by its heartbeat's
  // deadline, reconnects once the link is back, and sends again what the hub
  // did not take (outbox.ts). The web page and the app, connected to the
  // hub throughout, draw both, once each, with no reload.
  await until("the session idle", busy, (b) => !b, 120_000);
  const linkLogs = async () => await fleet.logs("agent");
  const silentBefore = (await linkLogs()).split("hub link silent").length;
  const resentBefore = (await linkLogs()).split("frame(s) again").length;
  await fleet.send(sessionId, `${LINK}: run the mark command, then say so.`);
  await until(
    "the mock asked for the tool call",
    () => fleet.seen.some((seen) => seen.last.includes(LINK)),
    Boolean,
    60_000
  );
  proxy.freeze();
  const linkDownAt = Date.now();
  console.log("  … the agent's link to the hub black-holed");
  await until(
    "the mock asked for the message after the tool's result",
    () => fleet.seen.some((seen) => seen.afterTool && seen.all.includes(LINK)),
    Boolean,
    90_000
  );
  // The message streams for a few seconds more, the link still down.
  await pause(LINK_WORDS.split(" ").length * 600 + 3000);
  const noticed = await until(
    "the agent dropping its silent link",
    async () =>
      (await linkLogs()).split("hub link silent").length > silentBefore,
    Boolean,
    60_000
  ).catch(() => false);
  check(
    "(c) agent: its silent link is dropped as dead",
    noticed === true,
    `within ${Date.now() - linkDownAt} ms of the link going`
  );
  proxy.thaw();
  const thawedLinkAt = Date.now();
  console.log("  … the agent's link let through again");
  const resent = await until(
    "the agent sending again what the hub did not take",
    async () =>
      (await linkLogs())
        .split("\n")
        .filter((line) => line.includes("frame(s) again"))
        .slice(resentBefore - 1)
        .find((line) => line.includes(sessionId.slice(0, 8))),
    Boolean,
    120_000
  ).catch(() => undefined);
  check(
    "(c) agent: what the hub did not take is sent again, to the same hub",
    resent?.includes("same hub") === true,
    resent ?? "no outbox line"
  );
  const count = (text: string, part: string) => text.split(part).length - 1;
  const webDrawn = await until(
    "the web drawing the tool and the message",
    async () => {
      const text = await listingText();
      return { mark: count(text, LINK_MARK), words: count(text, LINK_WORDS) };
    },
    (drawn) => drawn.mark > 0 && drawn.words > 0,
    60_000
  ).catch(() => ({ mark: 0, words: 0 }));
  const iosDrawn = await until(
    "the app drawing the tool and the message",
    async () => {
      const labels = (await tree()).map((n) => n.label ?? "");
      return {
        mark: labels.filter((label) => label.includes(LINK_MARK)).length,
        words: labels.filter((label) => label.includes("Relinked")).length,
      };
    },
    (drawn) => drawn.mark > 0 && drawn.words > 0,
    60_000
  ).catch(() => ({ mark: 0, words: 0 }));
  console.log(
    `  drawn ${Date.now() - thawedLinkAt} ms after the link was back: web ${JSON.stringify(webDrawn)}, app ${JSON.stringify(iosDrawn)}`
  );
  // Read whole again, the web page reloaded: what it drew live must be what
  // a fresh read draws, so neither is missing nor twice.
  await page?.reload({ waitUntil: "domcontentloaded" });
  const webRead = await until(
    "the reloaded web page drawing the turn",
    async () => {
      const text = await listingText();
      return { mark: count(text, LINK_MARK), words: count(text, LINK_WORDS) };
    },
    (drawn) => drawn.words > 0,
    60_000
  ).catch(() => ({ mark: 0, words: 0 }));
  check(
    "(c) web: the tool and the message are drawn without a reload, once each",
    webDrawn.mark > 0 &&
      webDrawn.words === 1 &&
      webDrawn.mark === webRead.mark &&
      webDrawn.words === webRead.words,
    `live ${JSON.stringify(webDrawn)}, read whole after a reload ${JSON.stringify(webRead)}`
  );

  // ── The control: a cold launch reads it whole ──────────────────────────
  await sh(`xcrun simctl terminate ${udid} dev.cawco.app`);
  const coldAt = Date.now();
  await launch();
  const iosRead = await until(
    "the link-drop turn on screen after a cold launch",
    async () => {
      const labels = (await tree()).map((n) => n.label ?? "");
      return {
        mark: labels.filter((label) => label.includes(LINK_MARK)).length,
        words: labels.filter((label) => label.includes("Relinked")).length,
      };
    },
    (drawn) => drawn.words > 0,
    120_000
  ).catch(() => ({ mark: 0, words: 0 }));
  check(
    "(c) iOS: the tool and the message were drawn without a reload, once each",
    iosDrawn.mark > 0 &&
      iosDrawn.words > 0 &&
      iosDrawn.mark === iosRead.mark &&
      iosDrawn.words === iosRead.words,
    `live ${JSON.stringify(iosDrawn)}, read whole after a cold launch ${JSON.stringify(iosRead)}`
  );
  // The field capitalises a message's first word as it is typed.
  const carrying = async () =>
    (await tree()).filter(
      (n) => n.label?.toLowerCase().includes(WORDS) === true
    );
  const shown = await until(
    "the message's words on screen after a cold launch",
    carrying,
    (nodes) => nodes.length > 0,
    60_000
  ).catch(() => []);
  // Where the view put the reader: a place restored above the latest rows
  // leaves the message drawn but off screen, which the accessibility tree
  // does not list. Then the dock's Jump to latest is tapped, and looked again.
  const restored = heard
    .filter((h) => h.at >= coldAt && h.line.includes("place "))
    .map((h) => h.line);
  let afterJump: Node[] = [];
  if (shown.length === 0) {
    const jump = (await tree()).find((n) => n.label === "Jump to latest");
    if (jump) {
      await tapNode(jump);
      afterJump = await until(
        "the message's words on screen after Jump to latest",
        carrying,
        (nodes) => nodes.length > 0,
        30_000
      ).catch(() => []);
    }
  }
  check(
    "cold launch: the message's words are drawn where the reader lands",
    shown.length >= 1,
    shown.length >= 1
      ? `${shown.length} element(s) carry them`
      : `none on screen; after Jump to latest ${afterJump.length}; the place restored: ${restored.join(" / ") || "nothing said"}; the latest labels: ${(
          await tree().catch(() => [])
        )
          .map((n) => n.label ?? "")
          .filter(Boolean)
          .slice(-12)
          .map((label) => label.slice(0, 60))
          .join(" | ")}`
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
  // Any failure: the scratch services' own last words, read before the
  // sandbox they are in is deleted.
  if (failures > 0) {
    await sayScratchLogs();
  }
  await teardown();
}
console.log(failures === 0 ? "ALL PASS" : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
