/**
 * Once a session's turn has ended, the composer shows Send within one hub
 * event, whichever order the hub's `tail` events and the daemon's pulses
 * reach the page (owner: the Stop button stayed up after a turn had ended,
 * the send glyph never came back; safari-blurs saw it as `stop true, send
 * again false`). Whether a turn is under way is the daemon's now-state, its
 * pulse, once one has come (client.svelte.ts `applyTail`, `applyPulse`).
 *
 * On a scratch fleet, Chromium at the desk and WebKit on a phone
 * (Playwright's WebKit build, not the owner's iPhone Safari), each with the
 * page's hub socket passed through the probe:
 *
 * a. A turn starts and ends as the hub sends it: Stop comes up, the hub's
 *    row says the turn ended, Send is back within 10 s. What reached the
 *    page about `busy` is printed, tails and pulses in the order they came.
 * b. The turn's end pulse reached the page, Send is back and the daemon has
 *    pulsed nothing for its throttle window; then the session's stream
 *    carries one more `tail` event saying `busy: true`, sequenced after the
 *    hub's last as the hub numbers them (every later event and the page's
 *    resume shifted by it). Stop never comes back, and Send stands.
 *
 * Then the hub's own tail, against its pulse, at each way a turn can end
 * without the page's help, Chromium at the desk where a page is read:
 *
 * c. The session's process is killed mid-turn: the hub's tail says not busy
 *    before the turn the hub starts again (server.ts `forgetPending`,
 *    transcripts.ts `processGone`).
 * d. The machine's agent is away as the turn ends: Claude Code, OpenCode
 *    and pi.
 * e. A person stops the turn.
 * f. A subagent's frames arrive after the turn ended (fed in through a
 *    relay on the agent's socket): the tail stays not busy.
 * g. OpenCode's `/mcp`, whose end sends no `result`: at rest the tail stays
 *    not busy; into a running turn, what tail and pulse say is a note.
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, one engine, one step at a time
import type { Page } from "playwright-core";
import type { Harness, Reply, Seen } from "../../../scratch-fleet";
import { MACHINE, until } from "../../../scratch-fleet";
import {
  COMPOSER,
  type Engine,
  type Kit,
  type KitFleet,
  open,
  type Spec,
  type View,
} from "../../kit";

const SLOW = "PROBE-SLOW";
const STOP =
  "form[data-slot='cin'] button[data-slot='stop'][aria-label='Stop the agent']";
const SEND =
  "form[data-slot='cin'] button[data-slot='stop'][aria-label='Send message']";
/** agent session.ts `PULSE_THROTTLE_MS`, and a margin: a trailing pulse has gone out by then. */
const PULSES_QUIET_MS = 2500;
/** How long Send must stand after the late tail. */
const HOLDS_MS = 3000;

const LONG = "PROBE-LONG";
/** How long the killed leg waits for the turn the hub starts again to end. */
const KILLED_WATCH_MS = 45_000;

const AWAY = "PROBE-AWAY";
/** The turn the agent is away for: its words, and how far apart. */
const AWAY_WORDS = 40;
const AWAY_EVERY_MS = 250;
/** When the model's last word of each harness's away turn goes out, ms epoch, by harness. */
const awayEnds = new Map<string, number>();
const AWAY_OF = /PROBE-AWAY-(\w+)/;

const words = (count: number, word: string) =>
  Array.from({ length: count }, () => word);

/** A turn that runs for a few seconds; a long one to stop or kill; one the agent is away for; every other one, a word. */
const respond = (request: Seen): Reply => {
  if (request.afterTool) {
    return { everyMs: 5, words: ["ok"] };
  }
  const away = AWAY_OF.exec(request.last)?.[1];
  if (away) {
    if (!awayEnds.has(away)) {
      awayEnds.set(away, Date.now() + AWAY_WORDS * AWAY_EVERY_MS);
    }
    return { everyMs: AWAY_EVERY_MS, words: words(AWAY_WORDS, "step") };
  }
  if (request.last.includes(LONG)) {
    return { everyMs: 300, words: words(200, "step") };
  }
  if (request.last.includes(SLOW)) {
    return { everyMs: 150, words: words(20, "step") };
  }
  return { everyMs: 5, words: ["ok"] };
};

/** The hub's newest page of a session's transcript, as far as these legs read it. */
interface HubPage {
  blocks?: { type: string; content?: unknown }[];
  branches?: { toolUseId: string; blocks: unknown[] }[];
  tail?: { busy: boolean; streams?: Record<string, string> };
}

const hubPage = (fleet: KitFleet, session: string) =>
  fleet.api<HubPage>(`/api/instances/${session}/transcript`);

/** The hub's pulse for a session, as `/api/pulses` serves it; none once its process is gone. */
const hubPulse = async (fleet: KitFleet, session: string) =>
  (await fleet.api<Record<string, { busy: boolean }>>("/api/pulses"))[session];

/** What the probe's socket saw of one session, and the late tail it can add. */
interface Wire {
  /** When the last pulse for the session reached the page, ms epoch. */
  lastPulseAt: number;
  /** The last pulse's busy, as it reached the page. */
  lastPulseBusy: boolean | null;
  /** Sends a `tail` event saying busy into the session's stream; false when no stream event has gone yet. */
  lateTail: () => boolean;
  /** The `busy` each tail event and pulse carried, in the order they reached the page. */
  said: string[];
}

interface Delta {
  afterSeq?: number;
  event?: StreamEvent;
  events?: StreamEvent[];
  payload?: {
    kind?: string;
    instanceId?: string;
    pulse?: { busy?: boolean };
  };
  sessionId?: string;
  type?: string;
  verb?: string;
}

interface StreamEvent {
  frame?: {
    kind?: string;
    events?: { type: string; tail?: { busy?: boolean } }[];
  };
  seq: number;
  sessionId: string;
}

/** The page's hub socket through the probe, for `session`. */
async function wireIn(page: Page, session: string): Promise<Wire> {
  let shift = 0;
  let lastSeq: number | null = null;
  let toPage: ((text: string) => void) | null = null;
  const wire: Wire = {
    said: [],
    lastPulseAt: 0,
    lastPulseBusy: null,
    lateTail: () => {
      if (lastSeq === null || !toPage) {
        return false;
      }
      shift += 1;
      lastSeq += 1;
      wire.said.push("late tail true");
      toPage(
        JSON.stringify({
          type: "stream.event",
          event: {
            seq: lastSeq,
            sessionId: session,
            frame: {
              kind: "transcript",
              events: [{ type: "tail", tail: { busy: true } }],
            },
          },
        })
      );
      return true;
    },
  };
  const ours = (event: StreamEvent) => {
    if (event.sessionId !== session) {
      return;
    }
    event.seq += shift;
    lastSeq = event.seq;
    for (const one of event.frame?.events ?? []) {
      if (one.type === "tail" && one.tail?.busy !== undefined) {
        wire.said.push(`tail ${one.tail.busy}`);
      }
    }
  };
  /** A hub message on its way to the page: the session's events renumbered, its pulses noted. */
  const fromHub = (text: string): string => {
    const parsed = JSON.parse(text) as Delta;
    if (parsed.type === "stream.event" && parsed.event) {
      ours(parsed.event);
      return JSON.stringify(parsed);
    }
    if (parsed.type === "stream.backlog" && parsed.sessionId === session) {
      for (const event of parsed.events ?? []) {
        ours(event);
      }
      return JSON.stringify(parsed);
    }
    if (
      parsed.verb === "frames" &&
      parsed.payload?.kind === "pulse" &&
      parsed.payload.instanceId === session
    ) {
      const busy = parsed.payload.pulse?.busy ?? null;
      wire.said.push(`pulse ${busy}`);
      wire.lastPulseAt = Date.now();
      wire.lastPulseBusy = busy;
    }
    return text;
  };
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      toPage = (text) => ws.send(text);
      ws.onMessage((message) => {
        if (typeof message !== "string" || shift === 0) {
          server.send(message);
          return;
        }
        const parsed = JSON.parse(message) as Delta;
        if (
          parsed.type === "stream.subscribe" &&
          parsed.sessionId === session &&
          typeof parsed.afterSeq === "number"
        ) {
          parsed.afterSeq -= shift;
          server.send(JSON.stringify(parsed));
          return;
        }
        server.send(message);
      });
      server.onMessage((message) => {
        ws.send(typeof message === "string" ? fromHub(message) : message);
      });
    }
  );
  return wire;
}

/** Whether the composer's Stop came up at any moment from now, read by the page itself. */
const watchStop = (page: Page) =>
  page.evaluate((stop) => {
    const seen = window as unknown as { __stopSeen: boolean };
    seen.__stopSeen = !!document.querySelector(stop);
    new MutationObserver(() => {
      if (document.querySelector(stop)) {
        seen.__stopSeen = true;
      }
    }).observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  }, STOP);

const stopSeen = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __stopSeen: boolean }).__stopSeen
  );

const shows = (page: Page, selector: string, timeout: number) =>
  page
    .waitForSelector(selector, { timeout })
    .then(() => true)
    .catch(() => false);

async function leg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  engine: Engine,
  view: View
): Promise<void> {
  const name = `${engine} ${view}`;
  const session = await fleet.spawn(
    "claude",
    `Turn end ${engine}`,
    fleet.workdir
  );
  const page = await kit.page(view, { engine });
  page.setDefaultTimeout(30_000);
  const wire = await wireIn(page, session);
  await open(page, `${base}/session/${session}`, COMPOSER, 90_000);

  // a. A turn, as the hub sends it.
  await fleet.send(session, `${SLOW} a short while`);
  const stop = await shows(page, STOP, 30_000);
  await until(
    "the turn ended",
    () => fleet.instance(session),
    (row) => row?.turn_open_at === null,
    120_000
  );
  const back = await shows(page, SEND, 10_000);
  kit.check(
    `${name}: Stop comes up as the turn starts, and Send is back once it ends`,
    stop && back,
    `stop ${stop}, send again ${back}; reached the page: ${wire.said.join(", ")}`
  );

  // b. The end pulse is in and the daemon is quiet; then a late tail says busy.
  await until(
    "the daemon quiet after its idle pulse",
    () => wire,
    (now) =>
      now.lastPulseBusy === false &&
      Date.now() - now.lastPulseAt > PULSES_QUIET_MS,
    30_000
  );
  const sendBefore = await shows(page, SEND, 1000);
  await watchStop(page);
  const sent = wire.lateTail();
  await page.waitForTimeout(HOLDS_MS);
  const raised = await stopSeen(page);
  const sendAfter = await shows(page, SEND, 100);
  kit.check(
    `${name}: a tail saying busy after the turn's end pulse leaves Send standing`,
    sent && sendBefore && !raised && sendAfter,
    `late tail sent ${sent}; send before ${sendBefore}, stop came back ${raised}, send after ${HOLDS_MS}ms ${sendAfter}; reached the page: ${wire.said.join(", ")}`
  );
  await page.close();
}

/**
 * c. A long turn's Claude Code process is killed from outside CawCo
 *    mid-turn (SIGKILL): it ends with no `result` frame, its daemon says the
 *    turn is over (claude.ts's catch, `ctx.busy(false)`) and the hub forgets
 *    its pulse (server.ts `forgetPending`), then starts it again with a word
 *    on what happened, a turn of its own. Read off the page's socket, in the
 *    order the hub sent them: the session's stream says its tail is not busy
 *    before any pulse says the next turn is, and the composer ends on Send.
 */
async function killedLeg(
  kit: Kit,
  fleet: KitFleet,
  base: string
): Promise<void> {
  const session = await fleet.spawn("claude", "Turn end kill", fleet.workdir);
  const page = await kit.page("desk", { engine: "chromium" });
  page.setDefaultTimeout(30_000);
  const wire = await wireIn(page, session);
  await open(page, `${base}/session/${session}`, COMPOSER, 90_000);
  await fleet.send(session, `${LONG} a long while`);
  await until(
    "the turn under way, on the hub's tail and pulse",
    async () => ({
      read: await hubPage(fleet, session),
      pulse: await hubPulse(fleet, session),
    }),
    (now) => now.read.tail?.busy === true && now.pulse?.busy === true,
    60_000
  );
  const pid = await fleet.sessionPid(session);
  if (pid === undefined) {
    throw new Error("the session's process: none held by sessiond");
  }
  const mark = wire.said.length;
  await fleet.killTree(pid, "SIGKILL");
  // The turn the hub starts again ends: a pulse says busy, then one says not.
  const since = () => wire.said.slice(mark);
  const started = (heard: string[]) => heard.indexOf("pulse true");
  await until(
    "the turn the hub started again ended",
    () => since(),
    (heard) =>
      started(heard) >= 0 &&
      heard.slice(started(heard)).includes("pulse false"),
    KILLED_WATCH_MS
  ).catch(() => undefined);
  await page.waitForTimeout(1000);
  const said = since();
  const before = started(said) < 0 ? said : said.slice(0, started(said));
  const read = await hubPage(fleet, session);
  const send = await shows(page, SEND, 5000);
  kit.check(
    "a process killed mid-turn: the hub's tail says not busy before the next turn's pulse, and the composer ends on Send",
    before.includes("tail false") && read.tail?.busy === false && send,
    `after the kill the page heard: ${said.join(", ")}; the hub's tail now busy ${read.tail?.busy}; send ${send}`
  );
  await page.close();
}

/**
 * e. A long turn is stopped mid-way (the stop interrupts it first, and its
 *    process ends). The hub's tail says not busy once the session is
 *    stopped, and a page opened on it then shows Send.
 */
async function stoppedLeg(
  kit: Kit,
  fleet: KitFleet,
  base: string
): Promise<void> {
  const session = await fleet.spawn("claude", "Turn end stop", fleet.workdir);
  await fleet.send(session, `${LONG} a long while`);
  await until(
    "the turn under way, on the hub's tail",
    () => hubPage(fleet, session),
    (read) => read.tail?.busy === true,
    60_000
  );
  await fleet.stopSession(session);
  await until(
    "the session stopped",
    () => fleet.instance(session),
    (held) => held?.status !== "running",
    60_000
  );
  // What the hub's end of the process said has gone out by now.
  await Bun.sleep(2000);
  const [after, pulse, row] = await Promise.all([
    hubPage(fleet, session),
    hubPulse(fleet, session),
    fleet.instance(session),
  ]);
  const page = await kit.page("desk", { engine: "chromium" });
  await open(page, `${base}/session/${session}`, COMPOSER, 90_000);
  await page.waitForTimeout(2000);
  const send = await shows(page, SEND, 100);
  const stop = await shows(page, STOP, 100);
  kit.check(
    "a turn stopped mid-way leaves the hub's tail not busy, and a page opened on it shows Send",
    after.tail?.busy === false && send && !stop,
    `row ${row?.status}; tail busy ${after.tail?.busy}, pulse ${pulse ? `busy ${pulse.busy}` : "none"}; the page shows send ${send}, stop ${stop}`
  );
  await page.close();
}

/**
 * d. The machine's agent goes away mid-turn (killed; sessiond keeps the
 *    harness's process running) and the turn ends while it is away; the
 *    agent comes back and takes the process up again (OpenCode: its
 *    `watchResumedTurn`). The hub's tail then says not busy, as its pulse
 *    does, and a page opened on the session shows Send.
 */
async function awayLeg(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  harness: Harness
): Promise<void> {
  const session = await fleet.spawn(
    harness,
    `Turn end away ${harness}`,
    fleet.workdir
  );
  await fleet.send(session, `${AWAY}-${harness} a while`);
  await until(
    "the turn under way, on the hub's tail and pulse",
    async () => ({
      page: await hubPage(fleet, session),
      pulse: await hubPulse(fleet, session),
    }),
    (now) => now.page.tail?.busy === true && now.pulse?.busy === true,
    60_000
  );
  await fleet.stop("agent", "SIGKILL");
  const ends = await until(
    "the turn's words",
    () => awayEnds.get(harness),
    Boolean
  );
  // The harness writes the turn's end a moment after the model's last word.
  await Bun.sleep(Math.max(0, (ends ?? 0) - Date.now()) + 3000);
  fleet.launch("agent");
  await fleet.agentUp();
  const back = await until(
    "the session taken up again",
    () => fleet.instance(session),
    (row) => row?.status === "running" || row?.status === "sleeping",
    90_000
  );
  // What the agent says of the session as it takes it up has gone out.
  await Bun.sleep(5000);
  const [read, pulse] = [
    await hubPage(fleet, session),
    await hubPulse(fleet, session),
  ];
  const page = await kit.page("desk", { engine: "chromium" });
  await open(page, `${base}/session/${session}`, COMPOSER, 90_000);
  await page.waitForTimeout(2000);
  const send = await shows(page, SEND, 100);
  const stop = await shows(page, STOP, 100);
  kit.check(
    `${harness}: a turn that ended while the agent was away: the hub's tail says not busy, and a page opened on it shows Send`,
    read.tail?.busy === false && pulse?.busy !== true && send && !stop,
    `row ${back?.status}; tail busy ${read.tail?.busy}, pulse ${pulse ? `busy ${pulse.busy}` : "none"}; the page shows send ${send}, stop ${stop}; the transcript ends ${(
      read.blocks ?? []
    )
      .slice(-3)
      .map((block) => `${block.type} "${String(block.content).slice(0, 40)}"`)
      .join(", ")}`
  );
  await page.close();
}

/**
 * f. A subagent's frames after its session's turn has ended. Claude Code
 *    sends none on this fleet (a background `Agent`'s frames never reach the
 *    hub, measured), so they are fed in: the machine's agent reaches the hub
 *    through the probe's own relay on its socket (`CAWCO_HUB_URL`), and once
 *    a turn has ended the relay says, as the agent would, a subagent's
 *    streamed words and its written message (`parent_tool_use_id` set). The
 *    hub folds them into the subagent's branch, and its tail stays not busy,
 *    as the daemon's pulse does (core transcript.ts `applyFrame`, the
 *    daemon's `runsTurn`: only the main loop's frames are a turn).
 */
async function subagentLeg(kit: Kit, fleet: KitFleet): Promise<void> {
  const hub = `ws${fleet.base.slice("http".length)}`;
  const agents = new Set<WebSocket>();
  const relay = Bun.serve<{
    path: string;
    up?: WebSocket;
    held: (string | Uint8Array<ArrayBuffer>)[];
  }>({
    port: 0,
    hostname: "127.0.0.1",
    // The agent's socket is relayed; everything else it and its sessions ask
    // of the hub (their CawCo MCP tools) goes through as it is.
    fetch: (request, server) => {
      const url = new URL(request.url);
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return fetch(
          new Request(`${fleet.base}${url.pathname}${url.search}`, request)
        );
      }
      return server.upgrade(request, {
        data: { path: `${url.pathname}${url.search}`, held: [] },
      })
        ? undefined
        : new Response("relay", { status: 400 });
    },
    websocket: {
      open: (ws) => {
        const up = new WebSocket(`${hub}${ws.data.path}`);
        up.binaryType = "arraybuffer";
        ws.data.up = up;
        // The agent's own socket; its sessions' others are relayed only.
        if (new URL(ws.data.path, hub).pathname === "/ws") {
          agents.add(up);
        }
        up.onopen = () => {
          for (const line of ws.data.held.splice(0)) {
            up.send(line);
          }
        };
        up.onmessage = (event) => ws.send(event.data as string | ArrayBuffer);
        up.onclose = () => ws.close();
      },
      message: (ws, said) => {
        const { up } = ws.data;
        const line = typeof said === "string" ? said : Uint8Array.from(said);
        if (up?.readyState === WebSocket.OPEN) {
          up.send(line);
        } else {
          ws.data.held.push(line);
        }
      },
      close: (ws) => {
        if (ws.data.up) {
          agents.delete(ws.data.up);
        }
        ws.data.up?.close();
      },
    },
  });
  try {
    await fleet.stop("agent");
    fleet.launch("agent", [], {
      CAWCO_HUB_URL: `ws://127.0.0.1:${relay.port}/ws`,
    });
    await fleet.agentUp();
    const session = await fleet.spawn(
      "claude",
      "Turn end subagent",
      fleet.workdir
    );
    await fleet.send(session, `${SLOW} a short while`);
    await until(
      "the turn ended, on the hub's tail and pulse",
      async () => ({
        read: await hubPage(fleet, session),
        pulse: await hubPulse(fleet, session),
        row: await fleet.instance(session),
      }),
      (now) =>
        now.row?.turn_open_at === null &&
        now.pulse?.busy === false &&
        now.read.tail?.busy === false,
      120_000
    );
    const branch = `toolu_probe_${crypto.randomUUID().slice(0, 8)}`;
    const say = (message: object) => {
      for (const up of agents) {
        up.send(
          JSON.stringify({
            verb: "frames",
            machineId: MACHINE,
            instanceId: session,
            payload: {
              kind: "frame",
              instanceId: session,
              harness: "claude",
              message,
            },
          })
        );
      }
    };
    say({
      type: "stream_event",
      parent_tool_use_id: branch,
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "a subagent's words" },
      },
    });
    say({
      type: "assistant",
      uuid: crypto.randomUUID(),
      parent_tool_use_id: branch,
      message: {
        content: [{ type: "text", text: "A subagent's written message." }],
      },
    });
    const folded = await until(
      "the subagent's message on its branch",
      () => hubPage(fleet, session),
      (page) =>
        (page.branches ?? []).some(
          (one) => one.toolUseId === branch && one.blocks.length > 0
        ),
      15_000
    ).catch(() => undefined);
    await Bun.sleep(1000);
    const [read, pulse] = [
      await hubPage(fleet, session),
      await hubPulse(fleet, session),
    ];
    kit.check(
      "a subagent's frames after its turn ended: the hub folds them into its branch, and its tail stays not busy, as its pulse",
      folded !== undefined && read.tail?.busy === false && pulse?.busy !== true,
      `relayed to ${agents.size} agent socket(s); branch folded ${folded !== undefined}; tail busy ${read.tail?.busy}, pulse ${pulse ? `busy ${pulse.busy}` : "none"}`
    );
  } finally {
    await fleet.stop("agent");
    relay.stop(true);
    fleet.launch("agent");
    await fleet.agentUp();
  }
}

/**
 * g. OpenCode's `/mcp` (opencode-session.ts `#mcpCommand`): the agent says
 *    the session busy as the send goes in and not busy in its `finally`,
 *    with no `result` frame. At rest, the hub's tail never says busy over
 *    it. Into a running turn, what the tail and the pulse say then is
 *    printed as a note.
 */
async function mcpLeg(kit: Kit, fleet: KitFleet): Promise<void> {
  const session = await fleet.spawn("opencode", "Turn end mcp", fleet.workdir);
  await fleet.send(session, "/mcp connect probe-none");
  await Bun.sleep(4000);
  const [rest, restPulse] = [
    await hubPage(fleet, session),
    await hubPulse(fleet, session),
  ];
  kit.check(
    "opencode: /mcp at rest: the hub's tail says not busy after it, as its pulse",
    rest.tail?.busy === false && restPulse?.busy !== true,
    `tail busy ${rest.tail?.busy}, pulse ${restPulse ? `busy ${restPulse.busy}` : "none"}`
  );
  await fleet.send(session, `${LONG} a long while`);
  await until(
    "the turn under way, on the hub's tail and pulse",
    async () => ({
      read: await hubPage(fleet, session),
      pulse: await hubPulse(fleet, session),
    }),
    (now) => now.read.tail?.busy === true && now.pulse?.busy === true,
    60_000
  );
  await fleet.send(session, "/mcp connect probe-none");
  await Bun.sleep(4000);
  const [mid, midPulse] = [
    await hubPage(fleet, session),
    await hubPulse(fleet, session),
  ];
  kit.note(
    `opencode: /mcp into a running turn: the hub's tail busy ${mid.tail?.busy}, its pulse ${midPulse ? `busy ${midPulse.busy}` : "none"}`
  );
  await fleet.stopSession(session);
}

const spec: Spec = {
  name: "turn-end-send",
  run: async (kit) => {
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const base = await fleet.dashboard();
    await leg(kit, fleet, base, "chromium", "desk");
    await leg(kit, fleet, base, "webkit", "iphone15Pro");
    await killedLeg(kit, fleet, base);
    for (const harness of ["claude", "opencode", "pi"] as const) {
      await awayLeg(kit, fleet, base, harness);
    }
    await stoppedLeg(kit, fleet, base);
    await mcpLeg(kit, fleet);
    await subagentLeg(kit, fleet);
  },
};
export default spec;
