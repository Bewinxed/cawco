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
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one leg, one engine, one step at a time
import type { Page } from "playwright-core";
import type { Reply, Seen } from "../../../scratch-fleet";
import { until } from "../../../scratch-fleet";
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

/** A turn that runs for a few seconds; every other one, a word. */
const respond = (request: Seen): Reply =>
  request.last.includes(SLOW) && !request.afterTool
    ? { everyMs: 150, words: Array.from({ length: 20 }, () => "step") }
    : { everyMs: 5, words: ["ok"] };

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
  },
};
export default spec;
