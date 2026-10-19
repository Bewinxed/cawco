/**
 * A project's browser in the artifact panel (Projects spec §5.11, item 6;
 * DESIGN.md "Browser view"), on the built dashboard. A scratch fleet gives
 * the page a real session, board and machine; the browser itself is the
 * spec's own:
 *
 * - the panel's frame: a `browser` artifact (source `{ page: <key> }`)
 *   sent on the dashboard's socket as the hub sends a panel's;
 * - the browser's row: the spec's, its live facts included (`why`,
 *   `progress`, `origin`, hub browsers.ts), sent as the hub sends it, a
 *   `browser_list` frame on the dashboard's socket as it opens and on every
 *   change (the scratch hub's own list dropped), and the `browser` of an
 *   artifact tab's frame; the person's routes (`/takeover`, `/handback`,
 *   `/start`, `/stop`) change it as the hub would;
 * - neko's signaling socket (`/ws/browser/…/api/ws`): `system/init` with
 *   a viewer session; then, by the leg, an offer in `signal/provide` with
 *   the ICE servers the hub writes (the stream relay's or the fleet's
 *   STUN), no offer at all (the client's own timeout, never live), a
 *   `system/disconnect`, or a socket closed after the stream stood;
 * - the platform's peer, stood in for on the page ({@link standInPeers}):
 *   a workspace's network namespace gathers no ICE candidate, loopback
 *   included, so the peer neko's transport makes delivers a canvas's frames
 *   and ends connected, connected through a relay (its `getStats()`), or
 *   failed (`iceconnectionstatechange`), by the leg. The real peer against
 *   a real neko is browser-view-live's, on the host;
 * - the local host's socket (`/ws/browser/…/cdp`): frames of
 *   `fixtures/browser-frame.jpg` behind the 4-byte header, whether or not
 *   anyone holds the browser (the page in front, agent cdp-watch.ts), or
 *   4404 while it shows no page; what the view sends on it is kept.
 *
 * At 390, 680 and 1440 it reads from the engine: the band 32px tall in
 * every state; each state's words; Take over and Hand back reaching 44px
 * under a coarse pointer; the well's `outline-color` equal to `brand-solid`
 * while the person holds the browser; the take-over posting this view's
 * neko session; an overflow and overlap sweep of the panel in every state,
 * whose total must be zero; and, on the browser's own route (the app's web
 * view), what the page posts the app's `cawcoBrowser` handler as the stream
 * goes from not connected to live, and Sound taken from the app's message. Captures go to `.probe/browser-view/`,
 * light and dark per width.
 *
 *   bun scripts/probe-kit/run.ts web browser-view
 */
// biome-ignore-all lint/performance/noAwaitInLoops: one width, one state at a time, each on its own page
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page, WebSocketRoute } from "playwright-core";
import { MACHINE, type Reply } from "../../../scratch-fleet";
import { capture as captureInk, at as inkAt } from "../../ink";
import {
  COMPOSER,
  type Kit,
  open,
  ROOT,
  type Spec,
  settle,
  type Theme,
  type View,
} from "../../kit";

const LEGS: { name: string; view: View }[] = [
  { name: "390", view: "phone" },
  { name: "680", view: "narrowDesk" },
  { name: "1440", view: "desk" },
];

const KEY = `machine:${MACHINE}`;
const ARTIFACT = "probe-browser-artifact";
const VIEWER = "probe-viewer-session";
const RELAY = "203.0.113.7";
const CAPTURES = join(ROOT, ".probe", "browser-view");
const FRAME = join(
  ROOT,
  "scripts",
  "probe-kit",
  "fixtures",
  "browser-frame.jpg"
);
const VIEW = '[data-slot="browser-view"]';
const PANEL = '[data-slot="side-card"]';

/** A short origin and a long one (the band cuts it from its start). */
const ORIGINS = {
  short: "https://github.com",
  long: "https://accounts.sign-in-for-a-very-long-company-name.identity-provider.example.com",
} as const;
const WHY =
  "The browser's container runtime isn't answering on this machine; the browser keeps its sign-ins and comes back by itself once it does.";
const REASON =
  "Sign in to GitHub so I can read the private repository's release page.";

/** The browser's row as the hub lists it (core `ListedBrowser`). */
interface Row {
  host: "container" | "local";
  key: string;
  lastUsedAt: number;
  machineId: string;
  machineName: string;
  name: string;
  origin?: string;
  progress?: { done: number; total: number; what: "image" };
  projectId: null;
  state: string;
  takeover: { by: string; requestId: string | null; since: number } | null;
  why?: string;
}

const rowOf = (part: Partial<Row>): Row => ({
  host: "container",
  key: KEY,
  lastUsedAt: Date.now(),
  machineId: MACHINE,
  machineName: MACHINE,
  name: "probe-project",
  projectId: null,
  state: "live",
  takeover: null,
  ...part,
});

/** What neko's socket does once its client asks for a peer; `silent` opens to nothing (after a drop). */
type Neko =
  | "live"
  | "relayed"
  | "unreached"
  | "unreached-relay"
  /** Its end of the peer failed first: `signal/close` while the viewer's ICE still checks. */
  | "closed"
  | "unoffered"
  | "lost"
  | "drop"
  | "silent";

/** What the spec controls on one page. */
interface Stage {
  /** An open browser ask for the session in `/api/pending`. */
  ask: boolean;
  /** Held routes: a take-over or hand-back answered when let go. */
  hold: { handback: boolean };
  /** What the view sent on the local host's socket. */
  input: string[];
  /** How neko's socket answers. */
  neko: Neko;
  /** The local browser shows no page: its socket closes 4404. */
  noPage: boolean;
  /** The session's panel shows the browser (the hub's panel frame); false for its card alone. */
  panel: boolean;
  posted: { url: string; body: unknown }[];
  release: () => void;
  /** The browser's row; setting it tells every screen open on it, as the hub's frames do. */
  row: Row | null;
  /** Each open screen's way of being told the row: a dashboard socket's or an artifact tab's. */
  screens: Set<(row: Row | null) => void>;
}

/** The hub's `browser_list` frame (core `BrowserListFrame`) listing `row` alone. */
const listFrame = (row: Row | null) =>
  JSON.stringify({
    verb: "frames",
    machineId: "hub",
    payload: { kind: "browser_list", browsers: row ? [row] : [] },
  });

/** An artifact tab's frame for session `id` (core `ArtifactSessionFrame`): the browser artifact open, its row, and its open ask when `asked`. */
const tabFrame = (id: string, row: Row | null, asked: boolean) =>
  JSON.stringify({
    type: "artifact.session",
    ask: asked
      ? {
          requestId: askFor(id).requestId,
          browserAsk: askFor(id).payload.browserAsk,
        }
      : null,
    machines: [
      { hostname: MACHINE, machineId: MACHINE, online: true, os: "linux" },
    ],
    preview: {
      kind: "preview",
      instanceId: id,
      state: "open",
      revision: "probe-browser-revision",
      artifact: { id: ARTIFACT, kind: "browser", name: "browser", ask: "" },
      artifacts: [ARTIFACT],
      source: { page: KEY },
    },
    session: {
      id,
      cwd: "/",
      machineId: MACHINE,
      projectId: null,
      title: "Probe browser view",
    },
    working: false,
    browser: row,
  });

/** The panel's frame for session `id`, as the hub sends one. */
const panelFrame = (id: string) =>
  JSON.stringify({
    verb: "frames",
    machineId: "hub",
    instanceId: id,
    payload: {
      kind: "preview",
      instanceId: id,
      state: "open",
      revision: "probe-browser-revision",
      artifact: { id: ARTIFACT, kind: "browser", name: "browser", ask: "" },
      artifacts: [ARTIFACT],
      source: { page: KEY },
    },
  });

/** The browser ask parked for session `id` (core `BrowserAskFrame`). */
const askFor = (id: string) => ({
  verb: "frames",
  machineId: MACHINE,
  instanceId: id,
  requestId: "probe-browser-view-ask",
  payload: {
    kind: "permission_request",
    instanceId: id,
    requestId: "probe-browser-view-ask",
    harness: "claude",
    requestKind: "tool",
    toolName: "mcp__cawco__browser_ask",
    input: { reason: REASON, origin: ORIGINS.short },
    browserAsk: {
      artifactId: ARTIFACT,
      key: KEY,
      machineId: MACHINE,
      origin: ORIGINS.short,
      reason: REASON,
    },
    presentation: {
      asker: "Probe browser view",
      summary: REASON,
      changes: [],
      fields: [{ key: "origin", value: ORIGINS.short }],
    },
    raisedAt: Date.now(),
  },
});

const send = (ws: WebSocketRoute, event: string, payload: unknown): void =>
  ws.send(JSON.stringify({ event, payload }));

/** neko's `system/init` for the viewer (neko 3.2.0 `message.SystemInit`). */
const init = (ws: WebSocketRoute): void =>
  send(ws, "system/init", {
    session_id: VIEWER,
    control_host: { has_host: false },
    screen_size: { width: 1280, height: 800, rate: 30 },
    sessions: {},
    settings: {
      private_mode: false,
      locked_logins: false,
      locked_controls: true,
      control_protection: false,
      implicit_hosting: false,
      inactive_cursors: false,
      merciful_reconnect: true,
    },
    touch_events: false,
  });

/** The relay's ICE servers, as the hub writes them for a viewer when the fleet has one. */
const RELAY_SERVERS = [
  {
    urls: [
      `turn:${RELAY}:443?transport=udp`,
      `turn:${RELAY}:443?transport=tcp`,
    ],
    username: "1792500000:viewer:probe",
    credential: "probe",
  },
  { urls: ["stun:stun.cloudflare.com:3478"] },
];

/** How the stand-in peer ends up (the view's page reads it as a peer is made); `stalled` checks for ever. */
type Ice = "connected" | "relayed" | "failed" | "stalled";

/**
 * The platform's peer, stood in for on the view's page (an init script): a
 * workspace's network namespace gathers no ICE candidate at all, loopback
 * included, so no real peer connects inside one. It is the surface neko's
 * `WebRTCTransport` uses: the remote description sets off its track (a
 * canvas's frames), the local one its ICE outcome by the page's
 * `__probeIce` (connected, connected through a relay as `getStats()`
 * reports one, or failed), and `getConfiguration()` the ICE servers the
 * offer named. Everything above it (neko's client and transport,
 * NekoSource, the view) runs as it does. The real peer is
 * browser-view-live's, against a real neko.
 */
function standInPeers(): void {
  const page = window as unknown as {
    __probeFrame?: string;
    __probeIce?: Ice;
  };
  const answer = [
    "v=0",
    "o=- 1 2 IN IP4 127.0.0.1",
    "s=-",
    "t=0 0",
    "m=video 9 UDP/TLS/RTP/SAVPF 96",
    "",
  ].join("\r\n");
  class Peer extends EventTarget {
    connectionState: RTCPeerConnectionState = "new";
    iceConnectionState: RTCIceConnectionState = "new";
    signalingState: RTCSignalingState = "stable";
    localDescription: RTCSessionDescriptionInit | null = null;
    remoteDescription: RTCSessionDescriptionInit | null = null;
    onicecandidate: ((event: unknown) => void) | null = null;
    ontrack: ((event: unknown) => void) | null = null;
    ondatachannel: ((event: unknown) => void) | null = null;
    onconnectionstatechange: (() => void) | null = null;
    onnegotiationneeded: (() => void) | null = null;
    readonly #config: RTCConfiguration;
    readonly #ice: Ice;
    constructor(config?: RTCConfiguration) {
      super();
      this.#config = config ?? {};
      this.#ice = page.__probeIce ?? "connected";
    }
    getConfiguration(): RTCConfiguration {
      return this.#config;
    }
    setRemoteDescription(
      description: RTCSessionDescriptionInit
    ): Promise<void> {
      this.remoteDescription = description;
      this.signalingState = "have-remote-offer";
      if (this.#ice === "failed" || this.#ice === "stalled") {
        return Promise.resolve();
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 800;
      const ink = canvas.getContext("2d");
      // The fixture's page (fixtures/browser-page.html as browser-frame.jpg),
      // drawn again each frame so the stream keeps sending.
      const shot = new Image();
      shot.src = page.__probeFrame ?? "";
      setInterval(() => {
        if (ink && shot.complete && shot.naturalWidth > 0) {
          ink.drawImage(shot, 0, 0, 1280, 800);
        }
      }, 100);
      const stream = canvas.captureStream(10);
      const [track] = stream.getVideoTracks();
      setTimeout(() => {
        this.ontrack?.({ track, streams: [stream], receiver: {} });
      }, 0);
      return Promise.resolve();
    }
    createAnswer(): Promise<RTCSessionDescriptionInit> {
      return Promise.resolve({ type: "answer", sdp: answer });
    }
    setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
      this.localDescription = description;
      this.signalingState = "stable";
      const [ice, connection] = (
        {
          connected: ["connected", "connected"],
          relayed: ["connected", "connected"],
          failed: ["failed", "failed"],
          stalled: ["checking", "connecting"],
        } as const
      )[this.#ice];
      setTimeout(() => {
        this.iceConnectionState = ice;
        this.dispatchEvent(new Event("iceconnectionstatechange"));
        this.connectionState = connection;
        this.onconnectionstatechange?.();
      }, 300);
      return Promise.resolve();
    }
    addIceCandidate(): Promise<void> {
      return Promise.resolve();
    }
    getStats(): Promise<Map<string, Record<string, unknown>>> {
      const relayed = this.#ice === "relayed";
      return Promise.resolve(
        new Map<string, Record<string, unknown>>([
          ["T", { type: "transport", id: "T", selectedCandidatePairId: "P" }],
          [
            "P",
            {
              type: "candidate-pair",
              id: "P",
              localCandidateId: "L",
              remoteCandidateId: "R",
              state: "succeeded",
              nominated: true,
            },
          ],
          [
            "L",
            {
              type: "local-candidate",
              id: "L",
              candidateType: relayed ? "relay" : "host",
              ...(relayed ? { relayProtocol: "udp" } : {}),
            },
          ],
          ["R", { type: "remote-candidate", id: "R", candidateType: "host" }],
        ])
      );
    }
    getSenders(): unknown[] {
      return [];
    }
    getReceivers(): unknown[] {
      return [];
    }
    addTrack(): unknown {
      return {};
    }
    removeTrack(): void {
      // Nothing is sent from the view.
    }
    createDataChannel(): unknown {
      return {};
    }
    close(): void {
      this.connectionState = "closed";
    }
  }
  window.RTCPeerConnection = Peer as unknown as typeof RTCPeerConnection;
}

/** What the stand-in peer of every peer made from here on ends up as. */
const iceFrom = (page: Page, ice: Ice): Promise<void> =>
  page.evaluate((now) => {
    (window as unknown as { __probeIce?: Ice }).__probeIce = now;
  }, ice);

/** One view's page on the session, with every browser route the spec's own. */
const browserPage = async (
  kit: Kit,
  view: View,
  id: string,
  theme: Theme,
  stage: Stage,
  jpeg: Buffer,
  /** The page to open, when not the session's; with `first` run before its own scripts. */
  { at, first = [] }: { at?: string; first?: (() => void)[] } = {}
): Promise<Page> => {
  const page = await kit.page(view, {
    theme,
    init: [standInPeers, ...first],
  });
  // The stand-in's picture: the same page the local host's frames carry.
  await page.addInitScript(
    (url) => {
      (window as unknown as { __probeFrame?: string }).__probeFrame = url;
    },
    `data:image/jpeg;base64,${jpeg.toString("base64")}`
  );
  page.setDefaultTimeout(60_000);
  const said: string[] = [];
  consoles.set(page, said);
  page.on("console", (message) => {
    if (!message.text().includes("content-visibility")) {
      said.push(`${message.type()}: ${message.text().slice(0, 300)}`);
    }
  });
  // A coarse pointer on the touch legs (DESIGN.md The 44 Touch Rule).
  if (VIEWS_TOUCH.has(view)) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 5,
    });
  }
  await page.route("**/api/pending", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stage.ask ? [askFor(id)] : []),
    })
  );
  await page.route(
    (url) => url.pathname.startsWith("/api/browsers/"),
    async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      stage.posted.push({ url: path, body: request.postDataJSON() });
      const act = path.split("/").at(-1);
      if (act === "takeover" && stage.row) {
        // Sent again for a browser already held (the view's neko session
        // now known), the machine keeps the take-over as it is, its asker
        // with it (agent shield.ts `shieldBrowser`).
        stage.row = {
          ...stage.row,
          takeover: stage.row.takeover ?? {
            by: id,
            requestId: null,
            since: Date.now(),
          },
        };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ artifactId: ARTIFACT, row: stage.row }),
        });
      }
      if (act === "handback" && stage.row) {
        if (stage.hold.handback) {
          await new Promise<void>((resolve) => {
            stage.release = resolve;
          });
        }
        stage.row = { ...stage.row, takeover: null };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ key: KEY, origin: stage.row.origin ?? null }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(stage.row),
      });
    }
  );
  // neko's REST under the view's base: whoami answers the viewer's session.
  await page.route(
    (url) =>
      url.pathname.startsWith("/ws/browser/") && url.pathname.includes("/api/"),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: VIEWER, profile: { name: "viewer" } }),
      })
  );
  await page.routeWebSocket(
    (url) => url.pathname === "/ws/dashboard",
    (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((message) => server.send(message));
      let shown = false;
      const tell = (row: Row | null) => ws.send(listFrame(row));
      stage.screens.add(tell);
      ws.onClose(() => stage.screens.delete(tell));
      server.onMessage((message) => {
        const text = String(message);
        // The scratch hub's own browsers are not the spec's.
        if (text.includes('"kind":"browser_list"')) {
          return;
        }
        ws.send(text);
        // The panel's frame and the spec's browsers after the board, the
        // panel's again after any frame that lists the panels (it closes
        // one it doesn't name).
        if (!shown || text.includes('"previews"')) {
          if (!shown) {
            tell(stage.row);
          }
          shown = true;
          if (stage.panel) {
            ws.send(panelFrame(id));
          }
        }
      });
    }
  );
  // The browser's own route (the app's web view): its artifact found, shown,
  // and followed on the tab's socket, as the hub answers them.
  await page.route(`**/api/artifacts/${ARTIFACT}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: ARTIFACT,
        kind: "browser",
        name: "browser",
        instanceId: id,
        shown: true,
      }),
    })
  );
  await page.routeWebSocket(
    (url) => url.pathname.startsWith("/ws/artifact-session/"),
    (ws) => {
      const tell = (row: Row | null) => ws.send(tabFrame(id, row, stage.ask));
      stage.screens.add(tell);
      ws.onClose(() => stage.screens.delete(tell));
      tell(stage.row);
    }
  );
  await page.routeWebSocket(
    (url) =>
      url.pathname.startsWith("/ws/browser/") &&
      url.pathname.endsWith("/api/ws"),
    (ws) => {
      const mode = stage.neko;
      if (mode === "silent") {
        return;
      }
      init(ws);
      ws.onMessage((message) => {
        const { event } = JSON.parse(String(message)) as { event?: string };
        said.push(`neko heard ${event}`);
        if (event !== "signal/request") {
          return;
        }
        if (mode === "lost") {
          send(ws, "system/disconnect", {
            message: "The session was replaced.",
          });
          return;
        }
        if (mode === "unoffered") {
          return;
        }
        // neko's offer, with the ICE servers the hub writes for a viewer.
        send(ws, "signal/provide", {
          sdp: "v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
          iceservers:
            mode === "unreached-relay" || mode === "relayed"
              ? RELAY_SERVERS
              : [{ urls: ["stun:stun.cloudflare.com:3478"] }],
        });
        if (mode === "closed") {
          setTimeout(() => send(ws, "signal/close", null), 1500);
        }
      });
      if (mode === "drop") {
        // The stream stands, then its socket goes and every socket after
        // it opens to silence.
        stage.neko = "silent";
        setTimeout(() => ws.close({ code: 4000, reason: "probe drop" }), 8000);
      }
    }
  );
  await page.routeWebSocket(
    (url) =>
      url.pathname.startsWith("/ws/browser/") && url.pathname.endsWith("/cdp"),
    (ws) => {
      if (stage.noPage) {
        ws.close({ code: 4404, reason: "This browser shows no page." });
        return;
      }
      ws.onMessage((message) => {
        stage.input.push(String(message));
      });
      const frame = Buffer.alloc(4 + jpeg.length);
      frame.writeUInt16BE(1280, 0);
      frame.writeUInt16BE(800, 2);
      jpeg.copy(frame, 4);
      const timer = setInterval(() => ws.send(frame), 250);
      ws.onClose(() => clearInterval(timer));
    }
  );
  await open(
    page,
    `${base}${at ?? `/session/${id}`}`,
    at ? VIEW : COMPOSER,
    90_000
  );
  return page;
};

const VIEWS_TOUCH = new Set<View>(["phone"]);

/** A press the view sends onto the page (agent cdp-takeover.ts `CdpInput`). */
const PRESSED = /"t":"(down|tap)"/;

/** How long the peer's failure may take to reach the view. */
const ICE_FAILS_MS = 30_000;

/** Waits until `ready()` holds, read every 100 ms, at most `ms`. */
const until_ = async (ready: () => boolean, ms: number): Promise<void> => {
  const end = Date.now() + ms;
  while (!ready() && Date.now() < end) {
    await new Promise((done) => setTimeout(done, 100));
  }
};
let base = "";

/** What the engine says of the view now. */
const read = () => {
  const view = document.querySelector<HTMLElement>(
    '[data-slot="browser-view"]'
  );
  const band = view?.querySelector<HTMLElement>('[data-slot="browser-band"]');
  const well = view?.querySelector<HTMLElement>('[data-slot="browser-well"]');
  const chip = view?.querySelector<HTMLElement>('[data-slot="browser-chip"]');
  const origin = view?.querySelector<HTMLElement>(
    '[data-slot="browser-origin"]'
  );
  const take = document.querySelector<HTMLElement>('[data-slot="take-over"]');
  const back = document.querySelector<HTMLElement>('[data-slot="hand-back"]');
  const keyboard = view?.querySelector<HTMLElement>(
    '[data-slot="browser-keyboard"]'
  );
  const frame = view?.querySelector<HTMLImageElement>(
    '[data-slot="browser-frame"]'
  );
  /** The control's tappable area: its box grown by its `.touch-hit` `::after`. */
  const hit = (el: HTMLElement | null | undefined) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    const after = getComputedStyle(el, "::after");
    if (after.content === "none" || after.position !== "absolute") {
      return { w: r.width, h: r.height };
    }
    return {
      w:
        r.width -
        Number.parseFloat(after.left) -
        Number.parseFloat(after.right),
      h:
        r.height -
        Number.parseFloat(after.top) -
        Number.parseFloat(after.bottom),
    };
  };
  /** A token's colour as the engine computes it. */
  const colourOf = (token: string): string => {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  };
  const brand = colourOf("--brand-solid");
  const edge = view?.querySelector<HTMLElement>('[data-slot="browser-edge"]');
  const edgeBox = edge?.getBoundingClientRect();
  const wellBox = well?.getBoundingClientRect();
  /** What draws at the band's centre: the band's own, or what covers it. */
  const bandHit = (() => {
    const box = band?.getBoundingClientRect();
    if (!box) {
      return "no band";
    }
    const drawn = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    );
    if (drawn && band?.contains(drawn)) {
      return "band";
    }
    const chain: string[] = [];
    for (let at = drawn; at && chain.length < 5; at = at.parentElement) {
      chain.push(
        `${at.tagName.toLowerCase()}${at.getAttribute("data-slot") ? `[${at.getAttribute("data-slot")}]` : ""}.${String(at.className).split(" ").slice(0, 2).join(".")}`
      );
    }
    return chain.join(" < ");
  })();
  const look = (el: HTMLElement | null | undefined) => {
    if (!el) {
      return null;
    }
    const style = getComputedStyle(el);
    return [
      style.backgroundColor,
      style.backgroundImage,
      style.color,
      style.borderTopColor,
      style.opacity,
    ].join(" | ");
  };
  const name = document.querySelector<HTMLElement>("[data-artifact-trigger]");
  const visibleText = (root: Element | null | undefined) =>
    root ? (root as HTMLElement).innerText.replace(/\s+/g, " ").trim() : "";
  return {
    phase: view?.dataset.browserPhase ?? null,
    width: view?.getBoundingClientRect().width ?? 0,
    stream: view?.dataset.browserStream ?? null,
    held: view?.dataset.held === "true",
    band: band?.getBoundingClientRect().height ?? -1,
    text: visibleText(view),
    head: visibleText(document.querySelector('[data-slot="side-head"]')),
    chip: visibleText(chip),
    origin: visibleText(origin),
    brand,
    actionSolid: colourOf("--action-solid"),
    edge: edge
      ? {
          shadow: getComputedStyle(edge).boxShadow,
          z: getComputedStyle(edge).zIndex,
          last: edge.parentElement?.lastElementChild === edge,
          fits:
            !!(edgeBox && wellBox) &&
            Math.abs(edgeBox.left - wellBox.left) < 0.5 &&
            Math.abs(edgeBox.right - wellBox.right) < 0.5 &&
            Math.abs(edgeBox.top - wellBox.top) < 0.5 &&
            Math.abs(edgeBox.bottom - wellBox.bottom) < 0.5,
          box: wellBox
            ? {
                left: wellBox.left,
                right: wellBox.right,
                top: wellBox.top,
                bottom: wellBox.bottom,
              }
            : null,
        }
      : null,
    bandHit,
    nameWidth: name?.getBoundingClientRect().width ?? -1,
    take: take
      ? {
          hit: hit(take),
          disabled: take.hasAttribute("disabled"),
          opacity: getComputedStyle(take).opacity,
          title: take.title,
          look: look(take),
        }
      : null,
    back: back
      ? {
          hit: hit(back),
          opacity: getComputedStyle(back).opacity,
          fill: getComputedStyle(back).backgroundColor,
          image: getComputedStyle(back).backgroundImage,
          ink: getComputedStyle(back).color,
        }
      : null,
    keyboard: !!keyboard,
    frame: frame ? { w: frame.naturalWidth, h: frame.naturalHeight } : null,
    coarse: matchMedia("(pointer: coarse)").matches,
  };
};

/**
 * Overflow and overlap in `selector`'s box: each element that draws text,
 * outside its container's inline edges or the viewport; and each pair of
 * text-drawing elements (neither holding the other) whose boxes overlap.
 */
const sweep = (selector: string) => {
  const root = document.querySelector<HTMLElement>(selector);
  if (!root) {
    return { total: -1, found: [`no ${selector}`] };
  }
  const box = root.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const unseen = (node: HTMLElement): boolean => {
    for (
      let at: HTMLElement | null = node;
      at && at !== root.parentElement;
      at = at.parentElement
    ) {
      const style = getComputedStyle(at);
      if (
        style.opacity === "0" ||
        style.visibility === "hidden" ||
        style.display === "none" ||
        at.getAttribute("aria-hidden") === "true"
      ) {
        return true;
      }
    }
    return false;
  };
  const drawn = [...root.querySelectorAll<HTMLElement>("*")].filter((node) => {
    if (unseen(node)) {
      return false;
    }
    const own = [...node.childNodes].some(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim()
    );
    const rect = node.getBoundingClientRect();
    return own && rect.width > 1 && rect.height > 1;
  });
  const name = (node: Element) =>
    node.getAttribute("data-slot") ??
    node.className.toString().split(" ")[0] ??
    node.tagName.toLowerCase();
  const found: string[] = [];
  const slack = 0.5;
  /**
   * What of `node` is drawn: its box cut by every ancestor inside the root
   * that clips (the band's origin, cut with an ellipsis, is drawn inside
   * its box, however long its words run).
   */
  const visible = (node: HTMLElement): DOMRect => {
    let r = node.getBoundingClientRect();
    for (
      let at = node.parentElement;
      at && at !== root.parentElement;
      at = at.parentElement
    ) {
      if (getComputedStyle(at).overflowX !== "visible") {
        const c = at.getBoundingClientRect();
        const left = Math.max(r.left, c.left);
        const right = Math.min(r.right, c.right);
        r = new DOMRect(left, r.top, Math.max(0, right - left), r.height);
      }
    }
    return r;
  };
  for (const node of drawn) {
    const r = visible(node);
    if (r.left < box.left - slack || r.right > box.right + slack) {
      found.push(`${name(node)} past its container`);
    }
    if (r.left < -slack || r.right > width + slack) {
      found.push(`${name(node)} past the viewport`);
    }
  }
  for (let i = 0; i < drawn.length; i += 1) {
    for (let j = i + 1; j < drawn.length; j += 1) {
      const a = drawn[i] as HTMLElement;
      const b = drawn[j] as HTMLElement;
      if (a.contains(b) || b.contains(a)) {
        continue;
      }
      const p = visible(a);
      const q = visible(b);
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
      const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (w > 1 && h > 1) {
        found.push(`${name(a)} over ${name(b)}`);
      }
    }
  }
  return { total: found.length, found: found.slice(0, 6) };
};

/** The sweep's total over every state: zero is the pass. */
let swept = 0;
/** Take over's computed look in every state it can be pressed, by width. */
const looks = new Map<string, string[]>();
/** The head's name's width in every state, by width. */
const names = new Map<string, number[]>();

/**
 * While the person holds the browser: Hand back filled with the primary
 * coral, and the 2px brand-solid edge drawn over whatever the well shows,
 * on all four sides: its layer's shadow, box and paint order from the
 * engine, then the pixels 1px inside each side as drawn (what drawing alone
 * decides: a stroke over the picture), against a brand-solid swatch.
 */
const heldChecks = async (
  kit: Kit,
  page: Page,
  label: string,
  now: ReturnType<typeof read>
): Promise<void> => {
  if (now.back) {
    kit.check(
      `${label}: Hand back is filled with the primary coral (${now.back.fill} = ${now.actionSolid}, ${now.back.image.slice(0, 15)}…, ink ${now.back.ink})`,
      now.back.fill === now.actionSolid &&
        now.back.image.startsWith("linear-gradient"),
      JSON.stringify(now.back)
    );
  }
  const { edge } = now;
  kit.check(
    `${label}: the edge layer covers the well (${edge?.fits}), above it (z ${edge?.z}, last ${edge?.last}), its shadow ${edge?.shadow}`,
    !!edge &&
      edge.fits &&
      edge.z === "10" &&
      edge.last &&
      edge.shadow.includes(now.brand) &&
      edge.shadow.includes("inset") &&
      edge.shadow.includes("2px"),
    JSON.stringify(edge)
  );
  const box = edge?.box;
  if (!box) {
    return;
  }
  await page.evaluate(() => {
    const swatch = document.createElement("div");
    swatch.id = "probe-brand-swatch";
    swatch.style.cssText =
      "position:fixed;inset-block-end:0;inset-inline-start:0;inline-size:8px;block-size:8px;z-index:2147483647;background:var(--brand-solid)";
    document.body.append(swatch);
  });
  const raster = await captureInk(page);
  await page.evaluate(() =>
    document.getElementById("probe-brand-swatch")?.remove()
  );
  const height = page.viewportSize()?.height ?? 0;
  const swatch = inkAt(raster, 4, height - 4);
  const midX = (box.left + box.right) / 2;
  const midY = (box.top + box.bottom) / 2;
  const sides = {
    left: inkAt(raster, box.left + 1, midY),
    right: inkAt(raster, box.right - 1, midY),
    top: inkAt(raster, midX, box.top + 1),
    bottom: inkAt(raster, midX, box.bottom - 1),
  };
  const close = (a: number[], b: number[]) =>
    a.every((value, i) => Math.abs(value - (b[i] ?? 0)) <= 12);
  kit.check(
    `${label}: the edge draws brand-solid over the picture on all four sides (swatch ${swatch.join(",")}; ${Object.entries(
      sides
    )
      .map(([side, rgb]) => `${side} ${rgb.join(",")}`)
      .join("; ")})`,
    Object.values(sides).every((rgb) => close(rgb, swatch)),
    JSON.stringify({ swatch, sides })
  );
};

/** Take over in a state it can't be pressed in: disabled at half ink, why in its title (DESIGN.md "Browser view"). */
const waiting = (
  kit: Kit,
  label: string,
  now: Awaited<ReturnType<typeof state>>,
  why: string
): void => {
  kit.check(
    `${label}: Take over waits, disabled at half ink (${now.take?.opacity}), its title "${now.take?.title}"`,
    !!now.take?.disabled &&
      now.take.opacity === "0.5" &&
      now.take.title === why,
    JSON.stringify(now.take)
  );
};

/** At the end of a width: Take over looks one way wherever it can be pressed, and the name never moved. */
const steadyChecks = (kit: Kit, at: string): void => {
  const seen = looks.get(at) ?? [];
  const distinct = new Set(
    seen.map((one) => one.split(": ").slice(1).join(": "))
  );
  kit.check(
    `${at}: Take over has one look in all ${seen.length} states it can be pressed in (${[...distinct][0]})`,
    distinct.size === 1,
    JSON.stringify(seen)
  );
  const widths = names.get(at) ?? [];
  const spread = Math.max(...widths) - Math.min(...widths);
  kit.check(
    `${at}: the head's name keeps its width in every state (${Math.min(...widths).toFixed(1)}–${Math.max(...widths).toFixed(1)}px)`,
    widths.length > 0 && spread < 0.5,
    JSON.stringify(widths)
  );
};

/** One state, read: the band's height, its words, the sweep, a capture. */
const state = async (
  kit: Kit,
  page: Page,
  label: string,
  words: string[],
  capture?: string,
  /** The surface the sweep reads: the panel's card, or the head-less tab. */
  root = PANEL
): Promise<ReturnType<typeof read>> => {
  // The pointer off every control: no hover stands in a reading or a capture.
  await page.mouse.move(0, 0);
  await settle(page);
  const now = await page.evaluate(read);
  /** The width and scheme the state stands at: one look is asked within each. */
  const at = `${label.split(" ")[0] ?? label}${label.includes(" dark ") ? " dark" : ""}`;
  kit.check(
    `${label}: nothing covers the band (its centre draws ${now.bandHit})`,
    now.bandHit === "band",
    now.bandHit
  );
  if (now.take && !now.take.disabled && now.take.look) {
    looks.set(at, [...(looks.get(at) ?? []), `${label}: ${now.take.look}`]);
  }
  if (now.nameWidth > 0) {
    names.set(at, [...(names.get(at) ?? []), now.nameWidth]);
  }
  if (now.held) {
    await heldChecks(kit, page, label, now);
  }
  kit.check(
    `${label}: the band is ${now.band}px tall`,
    Math.abs(now.band - 32) < 0.5,
    JSON.stringify({ band: now.band })
  );
  const all = `${now.head} ${now.text}`;
  const missing = words.filter((one) => !all.includes(one));
  kit.check(
    `${label}: says ${words.map((one) => `"${one}"`).join(", ")}`,
    missing.length === 0,
    JSON.stringify({ missing, text: all.slice(0, 600) })
  );
  const read2 = await page.evaluate(sweep, root);
  swept += Math.max(read2.total, 0);
  kit.check(
    `${label}: the overflow and overlap sweep finds ${read2.total}`,
    read2.total === 0,
    JSON.stringify(read2.found)
  );
  if (capture) {
    await mkdir(CAPTURES, { recursive: true });
    await page.screenshot({ path: join(CAPTURES, capture) });
  }
  return now;
};

/** Waits until the view reads `phase` (and `stream`, when named). */
/** Each page's console, for a wait that times out to say what the page said. */
const consoles = new WeakMap<Page, string[]>();

const until = async (
  page: Page,
  phase: string,
  stream?: string,
  ms = 30_000
): Promise<void> => {
  try {
    await page.waitForFunction(
      ([p, s]) => {
        const view = document.querySelector<HTMLElement>(
          '[data-slot="browser-view"]'
        );
        return (
          view?.dataset.browserPhase === p &&
          (s === undefined || view.dataset.browserStream === s)
        );
      },
      [phase, stream] as const,
      { timeout: ms }
    );
  } catch (error) {
    const now = await page
      .evaluate(() => {
        const view = document.querySelector<HTMLElement>(
          '[data-slot="browser-view"]'
        );
        return `${view?.dataset.browserPhase}/${view?.dataset.browserStream}`;
      })
      .catch(() => "unread");
    throw new Error(
      `the view stood at ${now}, not ${phase}/${stream ?? "any"} within ${ms} ms; its console: ${(consoles.get(page) ?? []).slice(-12).join(" | ")}`,
      { cause: error }
    );
  }
};

/** Waits until the view's text holds `words`. */
const saying = (page: Page, words: string, ms = 30_000) =>
  page.waitForFunction(
    (w) =>
      (
        document.querySelector<HTMLElement>('[data-slot="browser-view"]')
          ?.innerText ?? ""
      )
        .replace(/\s+/g, " ")
        .includes(w),
    words,
    { timeout: ms }
  );

const freshStage = (first: Row | null, neko: Neko = "live"): Stage => {
  let row = first;
  const stage: Stage = {
    input: [],
    neko,
    noPage: false,
    hold: { handback: false },
    ask: false,
    panel: true,
    posted: [],
    release: () => undefined,
    screens: new Set(),
    get row() {
      return row;
    },
    set row(next) {
      row = next;
      for (const tell of stage.screens) {
        tell(next);
      }
    },
  };
  return stage;
};

/** A state's label in its scheme: the dark one's names it, so each scheme asks for its one look. */
const labelled = (name: string, theme: Theme, what: string): string =>
  theme === "dark" ? `${name} dark ${what}` : `${name} ${what}`;

/**
 * What the person meets of a browser ask across its card and the view,
 * counted where they read it: the document's own text, the visible
 * controls, and each surface's parts.
 */
const surfaces = ([reason, origin]: [string, string]) => {
  const card = document.querySelector<HTMLElement>('[data-slot="hitl"]');
  const shown = (one: HTMLElement) =>
    one.checkVisibility({ visibilityProperty: true }) &&
    !one.closest('[aria-hidden="true"], [inert]');
  /** On screen and painted: inside the viewport, drawn, live. */
  const seenOnScreen = (one: HTMLElement) => {
    const box = one.getBoundingClientRect();
    return (
      shown(one) &&
      one.checkVisibility({ opacityProperty: true }) &&
      box.width > 0 &&
      box.height > 0 &&
      box.bottom > 0 &&
      box.right > 0 &&
      box.top < innerHeight &&
      box.left < innerWidth
    );
  };
  /** The nearest slots over `one`, to say where a copy stands. */
  const slotsOf = (one: HTMLElement) => {
    const slots: string[] = [];
    for (
      let at: HTMLElement | null = one;
      at && slots.length < 4;
      at = at.parentElement
    ) {
      const { slot } = at.dataset;
      if (slot) {
        slots.push(slot);
      }
    }
    return slots.join(" < ");
  };
  /**
   * Every copy of `needle`: the innermost elements whose text holds it
   * whole (an origin is set in several nodes), each with where it stands
   * and whether the person sees it.
   */
  const copies = (needle: string) =>
    [...document.querySelectorAll<HTMLElement>("body *")]
      .filter(
        (one) =>
          one.innerText?.includes(needle) &&
          ![...one.children].some((child) =>
            (child as HTMLElement).innerText?.includes(needle)
          )
      )
      .map((one) => ({ at: slotsOf(one), seen: seenOnScreen(one) }));
  const reasonCopies = copies(reason);
  const originCopies = copies(origin);
  return {
    where: { reason: reasonCopies, origin: originCopies },
    reasons: reasonCopies.filter((one) => one.seen).length,
    origins: originCopies.filter((one) => one.seen).length,
    takeOvers: [...document.querySelectorAll<HTMLElement>("button")].filter(
      (one) => shown(one) && one.innerText.trim().startsWith("Take over")
    ).length,
    deny: !!card?.querySelector("[data-browser-deny]"),
    cardTake: !!card?.querySelector("[data-browser-take]"),
    other:
      (card?.innerText ?? "").includes("Other") ||
      !!document.querySelector('[data-slot="browser-other"], [data-other]'),
    lines: !!document.querySelector('[data-slot="browser-lines"]'),
    reasonLine:
      document
        .querySelector<HTMLElement>('[data-slot="browser-reason"]')
        ?.innerText.trim() ?? null,
    pointer:
      card
        ?.querySelector<HTMLElement>('[data-slot="browser-pointer"]')
        ?.innerText.trim() ?? null,
  };
};

/** The chip's fill against the needs-you pair's, read off a swatch of it. */
const chipFill = () => {
  const chip = document.querySelector<HTMLElement>(
    '[data-slot="browser-view"] [data-slot="browser-chip"]'
  );
  const swatch = document.createElement("span");
  swatch.style.background = "var(--status-attn-bg)";
  swatch.style.color = "var(--status-attn-ink)";
  document.body.append(swatch);
  const want = getComputedStyle(swatch);
  const pair = { fill: want.backgroundColor, ink: want.color };
  swatch.remove();
  const style = chip ? getComputedStyle(chip) : null;
  return {
    fill: style?.backgroundColor ?? null,
    ink: style?.color ?? null,
    pair,
  };
};

/**
 * A browser ask open in this session, its card and the view both on
 * screen: each sheds what the other owns, so the person meets Take over,
 * the reason and the origin once each; then the ask is taken off and the
 * page read again with none.
 */
async function askBoth(
  kit: Kit,
  page: Page,
  stage: Stage,
  name: string,
  theme: Theme
): Promise<void> {
  const label = labelled(name, theme, "browser ask");
  stage.ask = true;
  stage.row = rowOf({ origin: ORIGINS.short });
  await page.reload();
  await page.locator(VIEW).waitFor();
  await until(page, "live", "live");
  await saying(page, "Needs you");
  await page.locator('[data-slot="hitl"] [data-browser-deny]').waitFor();
  await page
    .waitForFunction(
      () => !document.querySelector('[data-slot="browser-lines"]'),
      undefined,
      { timeout: 10_000 }
    )
    .catch(() => undefined);
  await state(
    kit,
    page,
    label,
    ["Needs you", ORIGINS.short],
    `${name}-ask-${theme}.png`
  );
  const seen = await page.evaluate(surfaces, [REASON, ORIGINS.short] as [
    string,
    string,
  ]);
  kit.check(
    `${label}, card and view both on screen: ${seen.takeOvers} Take over, the reason ${seen.reasons}×, the origin ${seen.origins}×, Deny on the card, the card saying "${seen.pointer}", no "Other", no line under the band`,
    seen.takeOvers === 1 &&
      seen.reasons === 1 &&
      seen.origins === 1 &&
      seen.deny &&
      !seen.cardTake &&
      !seen.other &&
      !seen.lines &&
      seen.pointer === "Take over is in the browser panel.",
    JSON.stringify(seen)
  );
  const fill = await page.evaluate(chipFill);
  kit.check(
    `${label}: the Needs you chip wears the needs-you pair (${fill.fill} on ${fill.pair.fill}, ink ${fill.ink})`,
    fill.fill === fill.pair.fill && fill.ink === fill.pair.ink,
    JSON.stringify(fill)
  );
  // The hub takes an ask off every screen as it is taken; here the page is
  // read again with none.
  stage.ask = false;
  await page.reload();
  await page.locator(VIEW).waitFor();
  await until(page, "live", "live");
}

/** The browser failed: its cover says so, the chip "Not answering". */
async function failedState(
  kit: Kit,
  page: Page,
  stage: Stage,
  name: string,
  theme: Theme
): Promise<void> {
  const label = labelled(name, theme, "not answering");
  stage.row = rowOf({ state: "failed", why: WHY });
  await saying(page, "The browser isn't answering");
  const now = await state(
    kit,
    page,
    label,
    ["The browser isn't answering", WHY, "Try again"],
    `${name}-failed-${theme}.png`
  );
  kit.check(
    `${label}: the chip says "${now.chip}"`,
    now.chip === "Not answering",
    String(now.chip)
  );
}

/** The stream the client gave up on: Reconnect, and Take over waits for it. */
async function lostState(
  kit: Kit,
  page: Page,
  stage: Stage,
  name: string,
  theme: Theme
): Promise<void> {
  const label = labelled(name, theme, "lost");
  stage.row = rowOf({ state: "asleep" });
  await until(page, "asleep");
  stage.neko = "lost";
  stage.row = rowOf({ origin: ORIGINS.short });
  await until(page, "live", "lost");
  const lost = await state(
    kit,
    page,
    label,
    [
      "Not connected",
      "The stream didn't come back",
      `The way to ${MACHINE}'s browser closed. Reconnect to try again.`,
      "Reconnect",
    ],
    `${name}-lost-${theme}.png`
  );
  waiting(
    kit,
    label,
    lost,
    "Take over waits for the stream to come back: Reconnect asks for it again."
  );
}

/** The stream dropped after it stood: the last frame dimmed, and Take over waits for it. */
async function reconnectingState(
  kit: Kit,
  page: Page,
  stage: Stage,
  name: string,
  theme: Theme
): Promise<void> {
  const label = labelled(name, theme, "reconnecting");
  stage.row = rowOf({ state: "asleep" });
  await until(page, "asleep");
  stage.neko = "drop";
  stage.row = rowOf({ origin: ORIGINS.short });
  await until(page, "live", "reconnecting", 45_000);
  const reconnecting = await state(
    kit,
    page,
    label,
    ["Reconnecting…", "The stream dropped. Reconnecting…"],
    `${name}-reconnecting-${theme}.png`
  );
  waiting(
    kit,
    label,
    reconnecting,
    "Take over waits for the stream to come back."
  );
}

/**
 * The card alone: the session's transcript with its panel closed. It says
 * everything: the reason, the origin, the privacy line, Take over and Deny
 * apart, and no "Other".
 */
async function cardAloneLeg(
  kit: Kit,
  id: string,
  { name, view }: (typeof LEGS)[number],
  theme: Theme,
  jpeg: Buffer
): Promise<void> {
  const label = labelled(name, theme, "card alone");
  const stage = freshStage(rowOf({ origin: ORIGINS.short }));
  stage.ask = true;
  stage.panel = false;
  const page = await browserPage(kit, view, id, theme, stage, jpeg);
  await page.locator('[data-slot="hitl"] [data-browser-take]').waitFor();
  await page.mouse.move(0, 0);
  await settle(page);
  const seen = await page.evaluate(surfaces, [REASON, ORIGINS.short] as [
    string,
    string,
  ]);
  const viewShown = await page.evaluate(
    () => !!document.querySelector('[data-slot="browser-view"]')
  );
  kit.check(
    `${label}: Take over and Deny on the card (${seen.takeOvers} Take over), the reason ${seen.reasons}×, the origin ${seen.origins}×, no "Other"`,
    !viewShown &&
      seen.takeOvers === 1 &&
      seen.cardTake &&
      seen.deny &&
      seen.reasons === 1 &&
      seen.origins === 1 &&
      !seen.other &&
      seen.pointer === null,
    JSON.stringify({ view: viewShown, ...seen })
  );
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({
    path: join(CAPTURES, `${name}-card-alone-${theme}.png`),
  });
  await page.close();
}

/**
 * The view alone: the head-less tab, no card of the ask on its screen. The
 * reason stands under the band at every width; the app's card beside it
 * (`cawco:browser-card`) takes the reason off, and its going brings it back.
 */
async function viewAloneLeg(
  kit: Kit,
  id: string,
  theme: Theme,
  jpeg: Buffer
): Promise<void> {
  const label = labelled("390", theme, "view alone");
  const stage = freshStage(rowOf({ origin: ORIGINS.short }));
  stage.ask = true;
  const page = await browserPage(kit, "phone", id, theme, stage, jpeg, {
    at: `/browser/${ARTIFACT}`,
  });
  await until(page, "live", "live");
  await saying(page, REASON);
  const alone = await state(
    kit,
    page,
    label,
    ["Needs you", ORIGINS.short, REASON],
    `390-view-alone-${theme}.png`,
    '[data-slot="browser-tab"]'
  );
  const seen = await page.evaluate(surfaces, [REASON, ORIGINS.short] as [
    string,
    string,
  ]);
  kit.check(
    `${label}: the reason under the band at 390 ("${seen.reasonLine}"), no card, Take over the app's head's (${seen.takeOvers} on the page)`,
    seen.reasonLine === REASON &&
      seen.takeOvers === 0 &&
      !seen.deny &&
      alone.width < 448,
    JSON.stringify({ width: alone.width, ...seen })
  );
  const reasonLine = () =>
    page.evaluate(
      () =>
        document
          .querySelector<HTMLElement>('[data-slot="browser-reason"]')
          ?.innerText.trim() ?? null
    );
  await page.evaluate(() =>
    window.postMessage(
      { type: "cawco:browser-card", shown: true },
      location.origin
    )
  );
  const shed = await page
    .waitForFunction(
      () => !document.querySelector('[data-slot="browser-lines"]'),
      undefined,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  const whileShown = await reasonLine();
  await page.evaluate(() =>
    window.postMessage(
      { type: "cawco:browser-card", shown: false },
      location.origin
    )
  );
  const back = await page
    .waitForFunction(
      (want) =>
        document
          .querySelector<HTMLElement>('[data-slot="browser-reason"]')
          ?.innerText.trim() === want,
      REASON,
      { timeout: 10_000 }
    )
    .then(() => true)
    .catch(() => false);
  kit.check(
    `${label}: the app's cawco:browser-card shown takes the reason off the band (${whileShown ?? "none"}), and shown false brings it back`,
    shed && whileShown === null && back,
    JSON.stringify({ shed, whileShown, back })
  );
  await page.close();
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one width's walk through every state, in the order a person meets them, a check at each
async function leg(
  kit: Kit,
  id: string,
  other: { id: string; title: string },
  { name, view }: (typeof LEGS)[number],
  jpeg: Buffer
): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    const stage = freshStage(rowOf({ origin: ORIGINS.long }));
    const page = await browserPage(kit, view, id, theme, stage, jpeg);
    await page.locator(VIEW).waitFor();
    // Live, the agent driving: the stream stands once neko's client is connected.
    await until(page, "live", "live");
    const live = await state(
      kit,
      page,
      `${name} ${theme} live`,
      ["Agent driving", ORIGINS.long, "Take over"],
      `${name}-live-${theme}.png`
    );
    // The band's long words stand past 448px of the view (its `@md` container query).
    const wide = live.width >= 448;
    kit.check(
      `${name} ${theme} live: the band names the long origin whole in its text, cut only on screen`,
      live.origin === ORIGINS.long,
      live.origin
    );
    if (theme === "dark") {
      // The states this round changed, dark, each on the light one's fixture.
      await askBoth(kit, page, stage, name, "dark");
      await failedState(kit, page, stage, name, "dark");
      await lostState(kit, page, stage, name, "dark");
      await reconnectingState(kit, page, stage, name, "dark");
      stage.row = rowOf({ state: "asleep" });
      await until(page, "asleep");
      stage.neko = "live";
      // The take-over, dark, on the light one's page: each pair compares one to one.
      stage.row = rowOf({ origin: ORIGINS.short });
      await until(page, "live", "live");
      await saying(page, ORIGINS.short);
      await page.locator('[data-slot="take-over"]').click();
      await saying(page, wide ? "You have control · private" : "Private");
      await state(
        kit,
        page,
        `${name} dark held`,
        [
          wide ? "You have control · private" : "Private",
          "Hand back",
          ORIGINS.short,
        ],
        `${name}-held-dark.png`
      );
      await page.close();
      continue;
    }
    if (VIEWS_TOUCH.has(view)) {
      kit.check(
        `${name} live: the page reads a coarse pointer, Take over's touch area ${live.take?.hit?.w.toFixed(0)}×${live.take?.hit?.h.toFixed(0)}px (≥ 44)`,
        live.coarse &&
          !!live.take?.hit &&
          live.take.hit.w >= 44 &&
          live.take.hit.h >= 44,
        JSON.stringify(live.take)
      );
    }
    // No page: a live browser with none in front.
    stage.row = rowOf({});
    await saying(page, "No page");
    await state(kit, page, `${name} live, no page`, [
      "No page",
      "Agent driving",
    ]);

    // A browser ask open in this session, its card and the view both on screen.
    await askBoth(kit, page, stage, name, "light");

    // Take over: control to this view's neko session; the edge, Hand back.
    await page.locator('[data-slot="take-over"]').click();
    await saying(page, wide ? "You have control · private" : "Private");
    const taken = stage.posted.find((one) => one.url.endsWith("/takeover"));
    const body = (taken?.body ?? {}) as {
      viewer?: string;
      instanceId?: string;
    };
    kit.check(
      `${name} take over: posted /takeover with this view's neko session (${body.viewer})`,
      body.viewer === VIEWER && body.instanceId === id,
      JSON.stringify(taken)
    );
    const held = await state(
      kit,
      page,
      `${name} held`,
      [
        wide ? "You have control · private" : "Private",
        "Hand back",
        ORIGINS.short,
      ],
      `${name}-held-light.png`
    );
    if (VIEWS_TOUCH.has(view)) {
      kit.check(
        `${name} held: Hand back's touch area ${held.back?.hit?.w.toFixed(0)}×${held.back?.hit?.h.toFixed(0)}px (≥ 44), the Keyboard in the band`,
        !!held.back?.hit &&
          held.back.hit.w >= 44 &&
          held.back.hit.h >= 44 &&
          held.keyboard,
        JSON.stringify(held.back)
      );
    }

    // Hand back while the hub answers: Handing back…, Hand back at half ink.
    stage.hold.handback = true;
    await page.locator('[data-slot="hand-back"]').click();
    await saying(page, "Handing back…");
    const handing = await state(kit, page, `${name} handing back`, [
      "Handing back…",
    ]);
    kit.check(
      `${name} handing back: Hand back at half ink (${handing.back?.opacity})`,
      handing.back?.opacity === "0.5",
      JSON.stringify(handing.back)
    );
    stage.hold.handback = false;
    stage.release();
    await saying(page, "Agent driving");

    // Another session's ask is what the person holds: "asked by" past the phone.
    stage.row = rowOf({
      origin: ORIGINS.short,
      takeover: { by: other.id, requestId: null, since: Date.now() },
    });
    await saying(page, wide ? `asked by ${other.title}` : "Private");
    await state(kit, page, `${name} held, asked by another session`, [
      wide ? `asked by ${other.title}` : "Private",
      "Hand back",
    ]);

    // The live row's own facts (hub browsers.ts, from the machine's frame).
    stage.row = rowOf({
      state: "pulling",
      progress: { done: 3, total: 9, what: "image" },
    });
    await saying(page, "Pulling the browser image · 3 of 9 layers");
    await state(
      kit,
      page,
      `${name} starting, pulling`,
      ["Starting…", "Pulling the browser image · 3 of 9 layers"],
      `${name}-starting-light.png`
    );
    stage.row = rowOf({
      state: "building",
      progress: { done: 2, total: 5, what: "image" },
    });
    await saying(page, "Building the browser image · step 2 of 5");
    await state(kit, page, `${name} starting, building`, [
      "Building the browser image · step 2 of 5",
    ]);
    stage.row = rowOf({ state: "starting" });
    await saying(page, "Starting the browser…");
    await state(kit, page, `${name} starting`, ["Starting the browser…"]);

    stage.row = rowOf({ state: "asleep" });
    await saying(page, "The browser is asleep");
    await state(
      kit,
      page,
      `${name} asleep`,
      [
        "Asleep",
        "The browser is asleep",
        "It wakes when an agent needs it. Its sign-ins are kept.",
        "Start browser",
      ],
      `${name}-asleep-light.png`
    );

    await failedState(kit, page, stage, name, "light");

    // The stream that didn't connect from here, with no relay: the peer's
    // ICE fails (iceconnectionstatechange "failed").
    await iceFrom(page, "failed");
    stage.neko = "unreached";
    stage.row = rowOf({ origin: ORIGINS.short });
    await until(page, "live", "unreached", ICE_FAILS_MS);
    await state(
      kit,
      page,
      `${name} not connected, no relay`,
      [
        "Not connected",
        "The stream couldn't connect from here",
        "This network doesn't reach",
        "Try again",
        "Set up the stream relay",
      ],
      `${name}-unreached-light.png`
    );
    const setUp = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(
        '[data-slot="browser-set-up-relay"]'
      );
      const style = button ? getComputedStyle(button) : null;
      return style
        ? {
            tag: button?.tagName ?? "",
            fill: style.backgroundColor,
            edge: style.borderTopColor,
            edgeWidth: style.borderTopWidth,
          }
        : null;
    });
    kit.check(
      `${name} not connected, no relay: "Set up the stream relay" is a button with its own fill and edge (${setUp?.fill}, ${setUp?.edgeWidth} ${setUp?.edge})`,
      setUp?.tag === "BUTTON" &&
        setUp.fill !== "rgba(0, 0, 0, 0)" &&
        setUp.edgeWidth !== "0px",
      JSON.stringify(setUp)
    );

    // neko's end of the peer failed first: its `signal/close` while this
    // screen's ICE still checks says the same, at once, not after the
    // client's ten retries.
    stage.row = rowOf({ state: "asleep" });
    await until(page, "asleep");
    await iceFrom(page, "stalled");
    stage.neko = "closed";
    stage.row = rowOf({ origin: ORIGINS.short });
    await until(page, "live", "unreached", 10_000);
    await state(kit, page, `${name} not connected, neko's end failed first`, [
      "Not connected",
      "The stream couldn't connect from here",
      "Try again",
    ]);
    await iceFrom(page, "failed");

    // …and through the relay the offer named.
    stage.row = rowOf({ state: "asleep" });
    await until(page, "asleep");
    stage.neko = "unreached-relay";
    stage.row = rowOf({ origin: ORIGINS.short });
    await until(page, "live", "unreached", ICE_FAILS_MS);
    await state(kit, page, `${name} not connected, relay set`, [
      `even through the stream relay at ${RELAY}`,
      "Check that UDP and TCP 443 reach it",
    ]);

    // Connected through the relay: getStats()'s selected pair is relayed.
    await iceFrom(page, "relayed");
    stage.row = rowOf({ state: "asleep" });
    await until(page, "asleep");
    stage.neko = "relayed";
    stage.row = rowOf({ origin: ORIGINS.short });
    await until(page, "live", "live");
    const relayed = await state(
      kit,
      page,
      `${name} via relay`,
      ["Agent driving", ...(wide ? ["via the stream relay"] : [])],
      `${name}-relayed-light.png`
    );
    kit.check(
      `${name} via relay: the stream stands (${relayed.stream}) and the band says "via the stream relay" past 448px (${wide ? "shown" : "the phone's band keeps its room"})`,
      relayed.stream === "live" &&
        relayed.text.includes("via the stream relay") === wide,
      JSON.stringify({ stream: relayed.stream, text: relayed.text })
    );
    await iceFrom(page, "connected");

    // The stream the client gave up on.
    await lostState(kit, page, stage, name, "light");

    // neko made no offer within the client's own timeout: no picture, never live.
    stage.row = rowOf({ state: "asleep" });
    await until(page, "asleep");
    stage.neko = "unoffered";
    stage.row = rowOf({ origin: ORIGINS.short });
    await until(page, "live", "unoffered");
    await state(
      kit,
      page,
      `${name} no picture`,
      [
        "Not connected",
        "The browser sent no picture",
        `${MACHINE}'s browser answered but sent no stream within 8 s, so there is nothing to show. Reconnect to ask again.`,
        "Reconnect",
      ],
      `${name}-unoffered-light.png`
    );

    // The stream dropped after it stood: the last frame dimmed.
    await reconnectingState(kit, page, stage, name, "light");

    // The local browser: its page in front while nobody holds it, a
    // picture alone; then the person's, their input onto it.
    stage.row = rowOf({ host: "local", origin: ORIGINS.short });
    await until(page, "live", "live");
    const watching = await state(
      kit,
      page,
      `${name} local, agent driving`,
      [
        "Agent driving",
        "This machine shows one page at a time until a container runtime is installed.",
      ],
      `${name}-local-light.png`
    );
    kit.check(
      `${name} local, agent driving: the install line holds no markdown, its command in code (${watching.text.includes("Install one:") ? "shown" : "none reported"})`,
      !watching.text.includes("`"),
      watching.text
    );
    stage.input.length = 0;
    await page.locator('[data-slot="browser-frame"]').click();
    await page.waitForTimeout(500);
    kit.check(
      `${name} local, agent driving: the page's frames draw (${watching.frame?.w}x${watching.frame?.h}) and a press on them sends nothing (${stage.input.length} sent)`,
      watching.frame?.w === 1280 &&
        watching.frame?.h === 800 &&
        stage.input.length === 0,
      JSON.stringify({ frame: watching.frame, input: stage.input })
    );
    await page.locator('[data-slot="take-over"]').click();
    await saying(page, wide ? "You have control · private" : "Private");
    await until(page, "live", "live");
    await state(
      kit,
      page,
      `${name} local, held`,
      [
        wide ? "You have control · private" : "Private",
        "This machine shows one page at a time",
      ],
      `${name}-local-held-light.png`
    );
    stage.input.length = 0;
    await page.locator('[data-slot="browser-frame"]').click();
    await until_(() => stage.input.length > 0, 5000);
    kit.check(
      `${name} local, held: a press on the frames goes to the page (${stage.input.map((one) => (JSON.parse(one) as { t: string }).t).join(", ")})`,
      stage.input.some((one) => PRESSED.test(one)),
      JSON.stringify(stage.input)
    );

    // A local browser showing no page.
    stage.row = rowOf({ state: "asleep" });
    await until(page, "asleep");
    stage.noPage = true;
    stage.row = rowOf({ host: "local" });
    await until(page, "live", "idle");
    await state(kit, page, `${name} local, no page`, [
      "No page",
      "The browser shows no page yet",
      "Its page shows here once an agent opens one, or once you take over.",
    ]);
    stage.noPage = false;
    await page.close();
  }
  steadyChecks(kit, name);
  steadyChecks(kit, `${name} dark`);
}

/** The machine away (its agent stopped): the pane's own `down` words for a machine, where the stream would be. */
async function awayLeg(
  kit: Kit,
  id: string,
  { name, view }: (typeof LEGS)[number],
  theme: Theme,
  jpeg: Buffer
): Promise<void> {
  const label = labelled(name, theme, "machine away");
  const stage = freshStage(rowOf({ origin: ORIGINS.short }));
  const page = await browserPage(kit, view, id, theme, stage, jpeg);
  await page.locator(VIEW).waitFor();
  await until(page, "away", undefined, 90_000);
  const now = await state(
    kit,
    page,
    label,
    [
      `${MACHINE} isn't answering`,
      `The browser comes from ${MACHINE}, which isn't connected to the hub right now. This view picks up again on its own once it's back.`,
    ],
    `${name}-away-${theme}.png`
  );
  kit.check(
    `${label}: the chip says "${now.chip}"`,
    now.chip === "Not answering",
    String(now.chip)
  );
  await page.close();
}

/** What the app's web view hears from the page (the route's `cawcoBrowser` posts). */
interface Told {
  host: string | null;
  sound: boolean;
  stream: string;
  takeOverWaits: string | null;
  type: string;
}

/** The app's message handler, stood in for: every post kept, parsed, in `__told`. */
function appBridge(): void {
  const told: unknown[] = [];
  Object.assign(window, {
    __told: told,
    webkit: {
      messageHandlers: {
        cawcoBrowser: {
          postMessage: (message: string) => told.push(JSON.parse(message)),
        },
      },
    },
  });
}

/** The first peer the page makes fails its ICE: the route opens not connected. */
function iceFailsFirst(): void {
  Object.assign(window, { __probeIce: "failed" });
}

const toldOf = (page: Page): Promise<Told[]> =>
  page.evaluate(() => (window as unknown as { __told: Told[] }).__told);

/**
 * The browser's own route, as the app's web view opens it: the page posts
 * where the view stands to the app's handler once as it loads and on every
 * change, and takes Sound from the app's message.
 */
async function bridgeLeg(kit: Kit, id: string, jpeg: Buffer): Promise<void> {
  const stage = freshStage(rowOf({ origin: ORIGINS.short }), "unreached");
  const page = await browserPage(kit, "phone", id, "light", stage, jpeg, {
    at: `/browser/${ARTIFACT}`,
    first: [appBridge, iceFailsFirst],
  });
  await until(page, "live", "unreached", ICE_FAILS_MS);
  await iceFrom(page, "connected");
  stage.neko = "live";
  await page.getByRole("button", { name: "Try again" }).click();
  await until(page, "live", "live");
  const before = await toldOf(page);
  const unreached = before.find((one) => one.stream === "unreached");
  const unreachedAt = unreached ? before.indexOf(unreached) : -1;
  const live = before.find(
    (one, at) => at > unreachedAt && one.stream === "live"
  );
  kit.check(
    `bridge: the page tells the app as it loads (${before[0]?.stream}), then not connected (${unreached?.takeOverWaits}), then live (Take over waits ${live?.takeOverWaits ?? "for nothing"}), each a cawco:browser on the container host with the sound off`,
    before.length >= 3 &&
      before.every(
        (one) =>
          one.type === "cawco:browser" &&
          one.host === "container" &&
          one.sound === false
      ) &&
      unreached?.takeOverWaits ===
        "Take over waits for the stream to connect from here." &&
      live?.takeOverWaits === null,
    JSON.stringify(before)
  );
  await page.evaluate(() =>
    window.postMessage(
      { type: "cawco:browser-sound", on: true },
      location.origin
    )
  );
  await page.waitForFunction(
    () =>
      (window as unknown as { __told: Told[] }).__told.at(-1)?.sound === true,
    undefined,
    { timeout: 10_000 }
  );
  const after = await toldOf(page);
  kit.check(
    `bridge: the app's cawco:browser-sound turns the sound on, and the page tells it so (${JSON.stringify(after.at(-1))})`,
    after.at(-1)?.sound === true && after.at(-1)?.stream === "live",
    JSON.stringify(after.slice(before.length))
  );
  await page.close();
}

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

const spec: Spec = {
  name: "browser-view",
  run: async (kit) => {
    const jpeg = await readFile(FRAME);
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();
    base = await fleet.dashboard();
    const id = await fleet.spawn(
      "claude",
      "Probe browser view",
      fleet.workdir,
      {
        permissionMode: "default",
      }
    );
    const otherTitle = "Probe browser asker";
    const otherId = await fleet.spawn("claude", otherTitle, fleet.workdir, {
      permissionMode: "default",
    });
    for (const at of LEGS) {
      await leg(kit, id, { id: otherId, title: otherTitle }, at, jpeg);
    }
    await bridgeLeg(kit, id, jpeg);
    for (const theme of ["light", "dark"] as const) {
      for (const at of LEGS) {
        await cardAloneLeg(kit, id, at, theme, jpeg);
      }
      await viewAloneLeg(kit, id, theme, jpeg);
    }
    // The machine goes: its agent stopped, the hub reads it offline.
    await fleet.stop("agent");
    for (const theme of ["light", "dark"] as const) {
      for (const at of LEGS) {
        await awayLeg(kit, id, at, theme, jpeg);
      }
    }
    kit.check(
      `the overflow and overlap sweep totals ${swept} over every state at 390, 680 and 1440`,
      swept === 0,
      String(swept)
    );
  },
};

export default spec;
