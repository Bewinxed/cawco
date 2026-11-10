/**
 * The dashboard's one socket to the hub: connecting and reconnecting with
 * backoff, the heartbeat that drops a dead one, the frame-paced take loop,
 * the control calls awaiting answers on it, and what a module reload hands
 * on. The stores are wired to it ({@link wireHub}): what each does as the
 * hub is reached, as the socket closes or is torn down, and what takes the
 * messages it reads.
 */

import { type Bounded, readWithin } from "@cawco/core/bounded";
import { GATED_PAGE_MARK, GATED_PAGE_PARAM } from "@cawco/core/browser-gate";
import { detach } from "@cawco/core/detach";
import type {
  FramePayload,
  HarnessFailed,
  HarnessUnanswered,
} from "@cawco/core/frames";
import type { Envelope } from "@cawco/core/protocol";
import type { ModeAsk } from "@cawco/core/session-messages";
import {
  type CommandKind,
  HEARTBEAT_DEADLINE_MS,
  HEARTBEAT_INTERVAL_MS,
  HUB_TAKE_MEASURE,
  type StreamHeartbeat,
  WIRE_PROTOCOL,
} from "@cawco/core/stream";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import { announcingParts, clientLine } from "@cawco/core/wire";
import { flushSync } from "svelte";
import {
  WS_RECONNECT_BASE_DELAY,
  WS_RECONNECT_MAX_ATTEMPTS,
  WS_RECONNECT_MAX_DELAY,
} from "#lib/config.js";
import { browser } from "$app/env";
import { mustPair, readAuth } from "../hub-auth.svelte";
import { checkServedBuild, newerBuild } from "../served-build.svelte";
import { ahead } from "../stores/clock.svelte";
import type { FrameOf } from "./frames";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * What to *tell a reader* about the hub, which is coarser than the socket's own
 * state on purpose. `connecting` is the transient every cold load passes
 * through, and a dropped socket's first seconds of retrying, and is never a
 * fault; `unreachable` is one — the hub is a process on somebody's machine,
 * and it being off is the ordinary case, not the exotic one. It holds from
 * {@link OUTAGE_GRACE} after the socket went until the hub is back, through
 * every retry in between: the deadline the first close sets
 * (`connectionState.outageAt`), read against the clock ({@link ahead}).
 */
export type HubState = "connected" | "connecting" | "unreachable";

/**
 * How long the hub is gone before the dashboard calls it unreachable. A drop
 * is most often a restart or a blip that the first retries answer within a
 * second or two, and surfaces that speak of an unreachable hub (the board's
 * empty state, a section's note) took a row each and gave it back, moving the
 * page twice for a hub that was never really away. The reconnect banner says
 * the socket is down from the first moment, over the page.
 */
const OUTAGE_GRACE = 4000;

export const connectionState = $state({
  status: "disconnected" as ConnectionStatus,
  /**
   * Whether an attempt has actually FAILED — the socket errored, or closed
   * without ever opening. A dashboard that has not tried yet reads
   * `disconnected` off the socket exactly like one whose attempt failed; this
   * says one came back empty-handed. Cleared on every open, so a healthy load
   * never carries a fault forward.
   */
  failed: false,
  /**
   * When the hub is said unreachable (epoch ms): {@link OUTAGE_GRACE} after
   * the first close, null again once it answers. Retries in between leave
   * it. A deadline, not a flag: `connectionStore.hub` reads it against the clock.
   */
  outageAt: null as number | null,
  /**
   * The hub said it restarts for an update (`hub.restart`), and by when it
   * answers again (epoch ms, on this clock). A close before then is the
   * update: the outage is said from the deadline, not from the close.
   * Null once the hub answers again, or takes it back.
   */
  restart: null as { until: number; version: string | null } | null,
  /**
   * This page was built for an older wire than the hub's, so it reads nothing
   * more off the socket ({@link olderThanHub}) until the update toast's
   * reload takes it to the hub's build.
   */
  older: false,
  /** When the next reconnect attempt fires, so the banner can count it down. */
  retryAt: null as number | null,
});

interface Waiter {
  reject: (error: Error) => void;
  /** The answer's `result`, and the harnesses a `listSessions` answer left out ({@link LeftOut}). */
  resolve: (result: unknown, leftOut?: LeftOut) => void;
}

/** Control calls awaiting their `control_result`, keyed by the SDK `requestId`. */
export const inflight = new Map<string, Waiter>();

/**
 * A bench's own hub (dev only): what a command from the page does there,
 * while a bench stands the page on it. No socket runs meanwhile, so no
 * band says the hub is out of reach and no command goes to the wire: each
 * goes to the bench, which answers it as the hub would.
 */
export type BenchHub = (
  instanceId: string,
  kind: CommandKind,
  intent: unknown
) => void;

let benchHub: BenchHub | null = null;

/** The bench's hub the page stands on (dev only); null on the real one. */
export function standingBench(): BenchHub | null {
  return benchHub;
}

/** The socket closed while a bench stands in, and the hub said reached (dev only). */
export function standSocket(answer: BenchHub): void {
  benchHub = answer;
  hubHeld.disposing = true;
  teardown();
  connectionState.status = "connected";
  connectionState.failed = false;
  connectionState.outageAt = null;
}

/** The bench is gone: the page reaches for the real hub again (dev only). */
export function leaveHub(): void {
  benchHub = null;
  connect();
}

/** What a module reload hands its next instance: the socket and its schedule, so a reload never leaves an orphan. */
interface HubHeld {
  /** This document asked for the hub (`openHub`): only then does a wake reconnect. */
  asked: boolean;
  disposing: boolean;
  reconnectAttempts: number;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  socket: WebSocket | null;
  /** The wake listeners are document-wide; bound once across reloads. */
  wakeBound: boolean;
}

declare global {
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoHub: HubHeld | undefined;
}

globalThis.__cawcoHub ??= {
  socket: null,
  reconnectTimeout: null,
  reconnectAttempts: 0,
  disposing: false,
  wakeBound: false,
  asked: false,
};

const hubHeld: HubHeld = globalThis.__cawcoHub;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    hubHeld.disposing = true;
    teardown();
  });
}

function abandonInflight(reason: string): void {
  for (const waiter of inflight.values()) {
    waiter.reject(new Error(reason));
  }
  inflight.clear();
}

/**
 * What the stores do as the connection moves, and what takes the messages it
 * reads: the client wires it once every store has loaded ({@link wireHub}).
 */
interface HubWiring {
  /** The socket closed, by either side or dropped as dead. */
  onClose: readonly (() => void)[];
  /** Each time the hub is reached on a new socket, in order. */
  onConnect: readonly (() => void)[];
  /** The socket is torn down: a new one replaces it, a bench stands in, the module reloads. */
  onTeardown: readonly (() => void)[];
  /** Every store's read of the hub again; true once the board's own reads landed. */
  reread: () => Promise<boolean>;
  /** A message off the socket, past what the connection reads of it itself. */
  take: (message: unknown) => void;
}

/** A wiring port nothing has filled ({@link wireHub}) fails by name when it is called. */
const unwired = (port: string) => () => {
  throw new Error(
    `socket: the ${port} port was called before the client wired the hub (wireHub)`
  );
};

let wiring: HubWiring = {
  take: unwired("take"),
  onConnect: [],
  onClose: [],
  onTeardown: [],
  reread: unwired("reread"),
};

/**
 * The stores, wired to the connection. A module reload wires them again,
 * and the socket the module before opened is then replaced on the next
 * {@link openHub}: its board went to the stores before.
 */
export function wireHub(next: HubWiring): void {
  wiring = next;
  claimed = false;
}

/** Whether the socket is open now. */
export function socketOpen(): boolean {
  return hubHeld.socket?.readyState === WebSocket.OPEN;
}

/** A message to the hub while the socket is open; false, and nothing sent, otherwise. */
export function sendIfOpen(
  message: Parameters<ReturnType<typeof clientLine>["send"]>[0]
): boolean {
  const { socket } = hubHeld;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  clientLine(socket).send(message);
  return true;
}

/** Every store reads the hub again: after an act that moved what they hold. */
export function rereadHub(): Promise<boolean> {
  return wiring.reread();
}

function teardown(): void {
  for (const step of wiring.onTeardown) {
    step();
  }
  stopHeartbeat();
  if (hubHeld.reconnectTimeout) {
    clearTimeout(hubHeld.reconnectTimeout);
    hubHeld.reconnectTimeout = null;
  }
  const { socket } = hubHeld;
  if (!socket) {
    return;
  }
  // Null the handlers first, or the close fires a reconnect we just cancelled.
  socket.onclose = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.close();
  hubHeld.socket = null;
  abandonInflight("The connection to the hub closed before that finished.");
}

/** Answers the promise a `requestId` belongs to; false when nobody is waiting. */
export function settle(
  requestId: string | undefined,
  answer: (waiter: Waiter) => void
): boolean {
  if (!requestId) {
    return false;
  }
  const waiter = inflight.get(requestId);
  if (!waiter) {
    return false;
  }
  inflight.delete(requestId);
  answer(waiter);
  return true;
}

export function takeHubRestart(frame: FrameOf<"hub.restart">): void {
  connectionState.restart = frame.restart
    ? {
        until: Date.now() + frame.restart.withinMs,
        version: frame.restart.version,
      }
    : null;
}

export function send(envelope: Envelope): void {
  const { socket } = hubHeld;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error(
      "Not connected to the hub. Check that it is running, then try again."
    );
  }
  clientLine(socket).send(envelope);
}

/**
 * Backs off, but never gives up. A dashboard is a window somebody leaves open:
 * the hub restarting, a laptop sleeping or a dev server reloading all end with
 * the hub coming back, and a client that has stopped trying by then shows stale
 * rows behind a status dot until the tab is reloaded by hand. The delay is
 * capped instead of the attempts, so a long outage costs one poll per
 * `WS_RECONNECT_MAX_DELAY` and no more.
 *
 * `WS_RECONNECT_MAX_ATTEMPTS` now only decides when to stop growing the delay.
 *
 * An update the hub announced (`connectionState.restart`) is a hub known to be on its
 * way back: until its deadline every try is `WS_RECONNECT_BASE_DELAY` apart,
 * so the page hears it back within a second, not up to a whole capped delay
 * after.
 */
function scheduleReconnect(): void {
  const attempt = hubHeld.reconnectAttempts;
  const updating =
    connectionState.restart !== null &&
    connectionState.restart.until > Date.now();
  const delay = updating
    ? WS_RECONNECT_BASE_DELAY
    : Math.min(
        WS_RECONNECT_BASE_DELAY *
          2 ** Math.min(attempt, WS_RECONNECT_MAX_ATTEMPTS),
        WS_RECONNECT_MAX_DELAY
      );
  connectionState.retryAt = Date.now() + delay;
  hubHeld.reconnectTimeout = setTimeout(() => {
    hubHeld.reconnectAttempts += 1;
    connect();
  }, delay);
}

/**
 * Reconnects now instead of waiting out the backoff. What the reconnect banner
 * calls, and what a tab that just came back to the foreground calls: the delay
 * was chosen while nobody was watching, and a user looking at the window is
 * evidence worth more than the schedule.
 */
export function reconnectNow(): void {
  const { socket } = hubHeld;
  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }
  if (hubHeld.reconnectTimeout) {
    clearTimeout(hubHeld.reconnectTimeout);
  }
  hubHeld.reconnectAttempts = 0;
  connectionState.retryAt = null;
  connect();
}

/**
 * Whether the socket on `globalThis` is one this module instance opened
 * (`connect`); one another instance opened is replaced (`openHub`).
 */
let claimed = false;

/**
 * The address this dashboard's socket points at. Exported because a hub it
 * cannot reach is the one moment the address matters to a reader: it is what
 * separates "the hub is not running" from "this page is served from the wrong
 * host", and the two have different fixes.
 */
export function hubSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/dashboard`;
}

function connect(): void {
  // A bench stands the page on its own hub (dev only): no socket while it does.
  if (import.meta.env.DEV && benchHub) {
    return;
  }
  hubHeld.disposing = false;
  teardown();
  connectionState.status = "connecting";

  // The page names the wire it was built for, so the hub sends a page on an
  // older one the snapshot that reloads it and no delta it would misread.
  // …and that it reads parts (`WIRE_PARTS_PARAM`), so a large board can come
  // as parts; a tab from before parts says nothing and is sent it whole.
  // A page an agent opened in its project's browser names the gate that
  // owns it (core `GATED_PAGE_MARK`), so what it starts is that agent's check.
  const query = new URLSearchParams({ protocol: String(WIRE_PROTOCOL) });
  const gatedBy: unknown = Reflect.get(globalThis, GATED_PAGE_MARK);
  if (typeof gatedBy === "string" && gatedBy) {
    query.set(GATED_PAGE_PARAM, gatedBy);
  }
  const socket = new WebSocket(announcingParts(`${hubSocketUrl()}?${query}`));

  // The hub is reached once its board on this socket is read (`bind`).
  bind(socket);
  // This module made it, so `ensureConnected` keeps it, and `hubReached`
  // above is what refreshes.
  claimed = true;
  hubHeld.socket = socket;
}

/** How many times this page has reached the hub: past one, a connection is a reconnect. */
let connections = 0;

/**
 * The hub run the open socket's board named (`InstancesFrame.hubRun`): the
 * numbering its streams count in. A page's `seq` resumes a stream on it only
 * when the page names the same run. Null before the first board.
 */
let socketRun: string | null = null;

/** How many times this page has reached the hub: past one, a connection is a reconnect. */
export function connectionCount(): number {
  return connections;
}

/** The hub run the open socket's board named; null before the first board. */
export function hubRun(): string | null {
  return socketRun;
}

/** The hub answered on the socket `connect` opened: everything a connection is owed. */
function hubReached(): void {
  connectionState.status = "connected";
  connectionState.retryAt = null;
  connectionState.failed = false;
  connectionState.outageAt = null;
  connectionState.restart = null;
  hubHeld.reconnectAttempts = 0;
  connections += 1;
  for (const step of wiring.onConnect) {
    step();
  }
}

/**
 * Whether this page was built for an older wire than the hub's, settled on
 * the board snapshot before anything in it is applied. The snapshot is the
 * first message on every socket, reconnects included, and the hub sends it
 * again in place of each delta to a page it knows is older; `kind` and
 * `protocol` are the two fields of it no wire version moves (`WIRE_PROTOCOL`).
 *
 * An older page reads nothing more off the socket, the snapshot included,
 * and takes the new build as any page does: through the update toast
 * (updates/update-toast.svelte.ts), Update now or the idle reload once the
 * person has seen it, never under them. It asks again which build the
 * dashboard runs on each snapshot until it serves another, as the hub may
 * restart into the new wire before the dashboard serves its build. The check used to sit at the end of the board handler, after
 * the frame was applied: the first change-only delta left `boardState.machines`
 * undefined, and every later board frame threw on it before the check ran,
 * so those tabs never reloaded.
 */
function olderThanHub(message: unknown): boolean {
  const { payload } = message as { payload?: FramePayload };
  if (payload?.kind !== "instances") {
    return connectionState.older;
  }
  connectionState.older = payload.protocol > WIRE_PROTOCOL;
  if (connectionState.older && newerBuild() === null) {
    detach(checkServedBuild(), "checkServedBuild");
  }
  return connectionState.older;
}

/**
 * Points a socket's handlers at *this* module's state.
 *
 * The socket is stored on `globalThis` so a module reload never orphans it, but
 * `state` is per module instance. A reloaded module that inherits a live socket
 * therefore inherits handlers that still write to the state nobody is rendering
 * any more: frames keep arriving, the old instance keeps up, and the instance on
 * screen sits at its initial `disconnected` for good. Re-binding is what makes
 * the inherited socket belong to whoever is rendering.
 */
function bind(socket: WebSocket): void {
  // Every frame is read in order through the socket's line, a part's worth
  // per turn, so a large board (sent as parts) never holds the page; the
  // handler is this module's, replacing whatever an earlier module bound.
  const line = clientLine(socket);
  socket.onmessage = (event) => {
    lastHeard = Date.now();
    line.receive(String(event.data));
  };
  startHeartbeat(socket);
  line.listen(holdMessage);
  socket.onclose = socketClosed;

  socket.onerror = () => {
    // Always followed by `onclose`, which schedules the retry — this only
    // records that the last attempt failed, never that trying has stopped.
    connectionState.status = "error";
    connectionState.failed = true;
  };
}

/**
 * The hub's messages read off the socket and not yet taken, in order: all
 * of them are taken in one task, so a burst costs the store one update. A
 * message that lands while a press is being drawn (a tab switch), or within
 * a frame of the last take, is taken once the page has drawn its next
 * frame, and so waits for that frame instead of holding it (7433e2b3,
 * mechanisms 2 and 6). One that lands at rest is taken in a task of its
 * own at once: asked for from a frame, every message drew a frame of its
 * own whether it changed anything or not (the scale fleet at rest: 109 of
 * the page's 388 frames in 20s ran a callback and drew nothing).
 */
const heldMessages: unknown[] = [];

let takeAsked = false;

/** When the take waiting was asked for, and when its task was posted (the page's clock). */
const taking = { askedAt: 0, postedAt: 0 };

/** When the last take ran (the page's clock). */
let tookAt = Number.NEGATIVE_INFINITY;

/** A frame at 60Hz, ms: a take at rest comes no sooner than this after the last. */
const TAKE_SPACING_MS = 1000 / 60;

/** When the person last pressed or typed: a pointer down, a key. */
let pressedAt = Number.NEGATIVE_INFINITY;

/**
 * The longest a press holds a waiting take back past its ask, ms, and how
 * long after a press takes wait for a frame: the press's frame is drawn
 * first, and a person typing on never holds the hub's word back longer
 * than this. Our own call.
 */
const PRESS_HOLD_MS = 250;

/** Posts the take as a task of its own, behind the frame that asked for it. */
const takeChannel = browser ? new MessageChannel() : null;

/** The take, posted from the next frame: it runs once that frame is drawn. */
function takeAfterFrame(): void {
  requestAnimationFrame(() => {
    taking.postedAt = performance.now();
    takeChannel?.port2.postMessage(0);
  });
}

if (takeChannel) {
  takeChannel.port1.onmessage = () => {
    // A press that came in after the take was posted runs before it, and
    // its frame is drawn before the take: it waits for the next frame.
    if (
      pressedAt > taking.postedAt &&
      !document.hidden &&
      performance.now() - taking.askedAt < PRESS_HOLD_MS
    ) {
      takeAfterFrame();
      return;
    }
    takeHeld();
  };
  const pressed = () => {
    pressedAt = performance.now();
  };
  for (const type of ["pointerdown", "keydown"] as const) {
    addEventListener(type, pressed, { capture: true, passive: true });
  }
  // A page put away draws no frames: what waits is taken at once, and so is
  // everything after, until it is shown again.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      takeHeld();
    }
  });
}

function holdMessage(message: unknown): void {
  heldMessages.push(message);
  if (takeAsked) {
    return;
  }
  takeAsked = true;
  const now = performance.now();
  taking.askedAt = now;
  if (
    document.hidden ||
    (now - pressedAt >= PRESS_HOLD_MS && now - tookAt >= TAKE_SPACING_MS)
  ) {
    taking.postedAt = now;
    takeChannel?.port2.postMessage(0);
    return;
  }
  takeAfterFrame();
}

/**
 * Takes every message held, in the order the socket read them, and the
 * store's update with them, in this task. What it cost is marked
 * ({@link HUB_TAKE_MEASURE}, its detail the messages taken), which a probe
 * reads against the messages it saw arrive (live-perf).
 */
function takeHeld(): void {
  takeAsked = false;
  if (heldMessages.length === 0) {
    return;
  }
  const began = performance.now();
  tookAt = began;
  const batch = heldMessages.splice(0);
  for (const message of batch) {
    takeMessage(message);
  }
  flushSync();
  performance.measure(HUB_TAKE_MEASURE, {
    start: began,
    detail: batch.length,
  });
}

/** One message off the hub's socket: the connection's reading of it, then the stores'. */
function takeMessage(message: unknown): void {
  // The hub is reached once its board on this socket is read: the board is
  // the first frame the hub owes every socket (`olderThanHub`), and a proxy
  // in front of it (the dashboard's own server, a preview's relay) accepts
  // the upgrade before it knows whether the hub is there, so an open socket
  // proves nothing (counted on open, every such socket reset the backoff and
  // reread the fleet each second the hub was down). Not the socket's first
  // message either: until the board is applied the store holds the last
  // hub's machines and rows, and "connected" over them let a page asking
  // after a hub restart ask a machine that wasn't back yet. The board is
  // applied in this same turn, before anything reads the status. Its run is
  // the numbering this socket's streams count in, read before the
  // connection's follows are.
  const board = (message as { payload?: FramePayload }).payload;
  if (connectionState.status !== "connected" && board?.kind === "instances") {
    socketRun = board.hubRun;
    hubReached();
  }
  if (olderThanHub(message)) {
    return;
  }
  wiring.take(message);
}

/** The socket is gone, closed by either side or dropped as dead: everything that went with it. */
function socketClosed(): void {
  // What the socket said before it closed is taken before its close is.
  takeHeld();
  stopHeartbeat();
  connectionState.status = "disconnected";
  // A socket that closed is an attempt that is over, one way or the other.
  connectionState.failed = true;
  // An announced update is the hub on its way back until its deadline.
  connectionState.outageAt ??=
    connectionState.restart && connectionState.restart.until > Date.now()
      ? connectionState.restart.until
      : Date.now() + OUTAGE_GRACE;
  abandonInflight("The connection to the hub dropped before that finished.");
  for (const step of wiring.onClose) {
    step();
  }
  // A hub that now requires paired devices closes the socket of a browser it
  // does not know, and refuses its next: the app then shows the pairing
  // screen (hub-auth.svelte.ts).
  readAuth().then(() => {
    if (!(hubHeld.disposing || mustPair())) {
      scheduleReconnect();
    }
  });
}

/** When anything last arrived on the socket: the heartbeat's proof of life. */
let lastHeard = 0;

let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

let heartbeatDeadline: ReturnType<typeof setTimeout> | undefined;

function stopHeartbeat(): void {
  clearInterval(heartbeatTimer);
  clearTimeout(heartbeatDeadline);
  heartbeatTimer = undefined;
  heartbeatDeadline = undefined;
}

/**
 * A socket can be dead while it reads open: a frozen hub, a route that
 * dropped without a FIN. Nothing arrives, the status stays `connected`, and
 * the transcript on screen silently stops. So every
 * {@link HEARTBEAT_INTERVAL_MS} the dashboard asks the hub (`heartbeat`,
 * answered at once), and when nothing at all has arrived
 * {@link HEARTBEAT_DEADLINE_MS} after asking, the socket is dropped as dead:
 * the reconnect and its reads follow as for any close. Any message is proof
 * of life, so a large board still arriving in parts is never mistaken for
 * silence. Application messages, not WebSocket pings: no browser sends those
 * (`StreamHeartbeat`). Both the ask and the hub's answer leave in their
 * outbox's urgent lane (core wire.ts `laneOf`), so neither waits behind the
 * board, transcripts or deltas queued on this socket.
 */
function startHeartbeat(socket: WebSocket): void {
  stopHeartbeat();
  lastHeard = Date.now();
  heartbeatTimer = setInterval(() => {
    if (socket !== hubHeld.socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const asked = Date.now();
    clientLine(socket).send({ type: "heartbeat" } satisfies StreamHeartbeat);
    clearTimeout(heartbeatDeadline);
    heartbeatDeadline = setTimeout(() => {
      if (lastHeard >= asked || socket !== hubHeld.socket) {
        return;
      }
      console.warn(
        `[cawco] hub socket: nothing heard ${Date.now() - asked} ms after a heartbeat; reconnecting`
      );
      dropDeadSocket(socket);
    }, HEARTBEAT_DEADLINE_MS);
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Closes a socket the heartbeat found dead, and goes on at once as for any
 * close. Its own `close` event is not waited for: the closing handshake needs
 * an answer from the peer that went silent, and a browser waits for it far
 * longer than the reader should.
 */
function dropDeadSocket(socket: WebSocket): void {
  socket.onclose = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.close(4000, "heartbeat unanswered");
  socketClosed();
}

/**
 * What routes call on mount: the socket is app-scoped, not page-scoped.
 *
 * The dashboard served as a workspace's preview (or embedded from one) dials
 * it too, on its preview origin: the hub relays it to the machine's
 * listener, that to the workspace's dev server, and its `/ws` proxy to the
 * hub it names (vite.config.ts `CAWCO_DEV_HUB_URL`), so the page draws that
 * hub's records. Its handshake holds the browser's one-at-a-time lock per
 * address (RFC 6455 §4.1.2) for the hub's own answer alone, never the dev
 * server's: the preview proxy answers 101 before it dials onward (preview
 * proxy.ts `upgradePreview`, `previewWebSocket.open`), and 503 at
 * once while the preview isn't up (`notUpYet`). A dev server with no hub
 * closes it, and the retries back off as any refused socket's do.
 */
export function openHub(): void {
  hubHeld.asked = true;
  const { socket } = hubHeld;
  if (
    claimed &&
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  // A socket another instance of this module opened is replaced, not
  // adopted: its board snapshot went to that instance's state, and this one's
  // board comes only from a snapshot on a socket of its own (`refresh`).
  // A navigation is a fresh user intent — earlier exhausted retries don't apply.
  hubHeld.reconnectAttempts = 0;
  connect();
}

/**
 * The three moments worth more than the backoff schedule: the machine says its
 * network is back, the tab comes to the foreground after a sleep, and the
 * window regains focus. Each means the outage may be over right now, and the
 * timer was set when none of that was known. Registered once per document,
 * and only for a document that asked for the hub (`openHub`): one
 * that only imports this module (a component canvas on a stage, which talks
 * to no hub) never dials one when it takes the focus.
 */
if (typeof window !== "undefined" && !hubHeld.wakeBound) {
  hubHeld.wakeBound = true;
  const wake = () => {
    if (!hubHeld.asked || document.visibilityState === "hidden") {
      return;
    }
    reconnectNow();
  };
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
}

/**
 * Resolves once the hub is reached (its board on the socket read,
 * `hubReached`), connecting it if needed: what {@link machineConnected} reads
 * is this hub's word from then on. A hub not reached in time throws saying
 * so: the machine was never asked.
 */
export async function waitForHub(timeoutMs = 5000): Promise<void> {
  openHub();
  const reached = () => connectionState.status === "connected";
  if (reached()) {
    return;
  }
  const opened = await readWithin(
    timeoutMs,
    (signal) =>
      new Promise<void>((resolve) => {
        const poll = () => {
          if (reached()) {
            resolve();
          } else if (!signal.aborted) {
            setTimeout(poll, 100);
          }
        };
        poll();
      })
  );
  switch (opened.kind) {
    case "answered":
      return;
    case "unanswered":
      throw new Error(
        `Could not reach the hub within ${secondsOf(opened.after)} s. Check that it is running, then try again.`
      );
    default:
      unhandled("read", opened);
  }
}

/**
 * Sends something the agent answers by `requestId`, and waits `timeoutMs` for
 * that answer. A refusal rejects in the machine's words; no answer in time is
 * its own outcome, `unanswered`, which every caller says as such
 * ({@link didntAnswer}).
 */
export function ask<T>(
  requestId: string,
  timeoutMs: number,
  dispatch: () => void,
  readAnswer: (result: unknown, leftOut?: LeftOut) => T = (result) =>
    result as T
): Promise<Bounded<T>> {
  return readWithin(
    timeoutMs,
    (signal) =>
      new Promise<T>((resolve, reject) => {
        inflight.set(requestId, {
          resolve: (result, leftOut) => resolve(readAnswer(result, leftOut)),
          reject,
        });
        signal.addEventListener("abort", () => inflight.delete(requestId), {
          once: true,
        });
        try {
          dispatch();
        } catch (error) {
          inflight.delete(requestId);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })
  );
}

/**
 * A start the hub refused because no permission mode is named for it (a
 * revive or a rewind of a row with none, and none chosen for its harness on
 * its machine; core `ModeAsk`). Not words for the person: the page asks for
 * a mode where they acted (transcript/ModePick), starts the session again on
 * it ({@link relaunchSession}), and does what was asked.
 */
export class ModeUnchosen extends Error {
  readonly ask: ModeAsk;
  constructor(wanted: ModeAsk) {
    super("No permission mode is named for this session.");
    this.name = "ModeUnchosen";
    this.ask = wanted;
  }
}

/** A `listSessions` answer's harnesses it left out: not answered in time, or their listing threw. */
export interface LeftOut {
  failed: HarnessFailed[];
  unanswered: HarnessUnanswered[];
}

/** The connection as its readers see it: its state, what to say of the hub, and the retry. */
export const connectionStore = {
  get status() {
    return connectionState.status;
  },
  /** {@link HubState} — the socket's state as something worth saying out loud. */
  get hub(): HubState {
    if (connectionState.status === "connected") {
      return "connected";
    }
    return connectionState.outageAt !== null && !ahead(connectionState.outageAt)
      ? "unreachable"
      : "connecting";
  },
  /**
   * The update the hub said it restarts for, while its deadline is ahead:
   * the build it goes to (null when unnamed) and when it is back by. Null
   * otherwise: no update, the hub back, or the deadline passed (then the
   * hub is unreachable like any other).
   */
  get restart(): { until: number; version: string | null } | null {
    return connectionState.restart && ahead(connectionState.restart.until)
      ? connectionState.restart
      : null;
  },
  /**
   * Whether the last attempt to reach the hub came back empty-handed. What
   * separates "still connecting, on a cold load" from "cannot be reached" —
   * the banner is only ever true of the second.
   */
  get connectFailed() {
    return connectionState.failed;
  },
  get retryAt() {
    return connectionState.retryAt;
  },
  /** This page was built for an older wire than the hub's and has stopped reading it: the connection band says so, and the update toast takes it to the new build. */
  get olderWire(): boolean {
    return connectionState.older;
  },
};
