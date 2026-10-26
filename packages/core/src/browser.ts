/**
 * A project's browser (Projects spec D30, §5.11): one Chrome per project per
 * machine, run by the machine's agent, where the project's agents browse and
 * its sign-ins last. A session outside any project uses its machine's. It
 * runs in a container (neko's Chromium, our image on top) wherever the
 * machine has a container runtime, and as a local Chromium where it has none
 * (agent `browser/`). These are the shapes every hop speaks: the key, the
 * agent's ports, the daemon's {@link BrowserFrame} and the hub's commands.
 */

import { CAWCO_ENV, readEnv } from "./cawco-env";

/** Which browser: a project's, or the machine's for sessions outside any project. */
export type BrowserKey = `project:${string}` | `machine:${string}`;

/** Which host runs a browser on its machine: a container where a runtime answers, a local Chromium where none does. */
export type BrowserHostKind = "container" | "local";

/**
 * The agent's ports for browsers: the machine's one DevTools gate first
 * ({@link BROWSER_GATE_PORT}), then three per browser started, in this
 * order: neko's HTTP, Chromium's DevTools, and the media port (UDP and TCP,
 * the same number). The gate, HTTP and DevTools listen on 127.0.0.1 alone;
 * media on every address. The local host uses DevTools only. A browser
 * takes its three when it first starts, not before.
 *
 * Below Linux's ephemeral range, 32768–60999 ("The default values are 32768
 * and 60999 respectively", kernel Documentation/networking/ip-sysctl.rst,
 * `ip_local_port_range`), where any socket the kernel gives a port to could
 * hold one first (43000–43060 until 2026-10-26). IANA's registry assigns
 * none of 14060–14140, Wikipedia's list of TCP and UDP port numbers names no
 * use of one, and nmap-services finds each open on at most 0.033% of hosts
 * (all read 2026-10-26). scripts/fixed-ports-check.ts holds every port
 * constant out of that range.
 */
export const BROWSER_PORTS = { first: 14_070, last: 14_130 } as const;

/** The machine's DevTools gate: every session's browser tool, every browser, by the path's gate id. */
export const BROWSER_GATE_PORT = BROWSER_PORTS.first;

/**
 * The port this machine's agent serves its DevTools gate on:
 * `CAWCO_BROWSER_GATE_PORT`, else {@link BROWSER_GATE_PORT}. The agent's
 * listener and every door it writes read it here, so a second agent on one
 * host (a scratch fleet) runs its gate on a port of its own.
 */
export const browserGatePort = (): number => {
  const named = readEnv(CAWCO_ENV.browserGatePort);
  const port = named === undefined ? BROWSER_GATE_PORT : Number(named);
  if (!(Number.isInteger(port) && port > 0 && port < 65_536)) {
    throw new Error(
      `${CAWCO_ENV.browserGatePort} must be a port number, not "${named}"`
    );
  }
  return port;
};

/**
 * The screen of a project's browser on both hosts, and the size of the view
 * the person takes it over in: neko's desktop on the container host (its
 * Chromium maximized on it, the browser's own UI in view); on the local
 * host the headless virtual screen, the window, and the page the take-over
 * shows, laid out at it (local-host.ts, cdp-takeover.ts).
 */
export const BROWSER_SCREEN = { width: 1280, height: 800 } as const;

/** How many ports one browser takes from {@link BROWSER_PORTS}. */
export const BROWSER_PORTS_EACH = 3;

/** One browser's ports; `http` and `media` are the container host's alone. */
export interface BrowserPorts {
  devtools: number;
  http?: number;
  media?: number;
}

/** The ports of the `slot`th browser of {@link BROWSER_PORTS}, from 0: after the gate's. */
export const browserPorts = (slot: number): Required<BrowserPorts> => {
  const first = BROWSER_GATE_PORT + 1 + slot * BROWSER_PORTS_EACH;
  return {
    http: first,
    devtools: first + 1,
    media: first + 2,
  };
};

/** How many browsers {@link BROWSER_PORTS} holds on one machine. */
export const BROWSER_SLOTS =
  (BROWSER_PORTS.last - BROWSER_GATE_PORT) / BROWSER_PORTS_EACH;

export type BrowserState =
  | "pulling"
  | "building"
  | "starting"
  | "live"
  | "stopping"
  | "asleep"
  | "failed";

/** The machine's container runtime as the agent found it, or the sentence that names the install. */
export type BrowserRuntime =
  | { kind: "docker" | "podman"; endpoint: string; version: string }
  | { missing: string };

/** One browser as its machine reports it. */
export interface BrowserRow {
  host: BrowserHostKind;
  key: BrowserKey;
  /** ms epoch of the last agent connection or viewer. */
  lastUsedAt: number;
  name: string;
  /**
   * The origin of the page the person's view shows (neko's front window on
   * the container host, the screencast's page on the local host), as the
   * machine reads it through its own DevTools link; absent while that page
   * is none (`about:blank`, no page). For the person's band alone: the gate
   * never sends it to an agent.
   */
  origin?: string;
  ports?: BrowserPorts;
  /** How far an image build is, while `state` is `pulling` or `building`. */
  progress?: { done: number; total: number; what: "image" };
  state: BrowserState;
  /** Who holds the browser privately, since when, and the ask it answers; null while no one does. */
  takeover: { by: string | null; since: number; requestId?: string } | null;
  viewers: number;
  /** Why it is `failed`, one sentence. */
  why?: string;
}

/** Daemon-originated: the machine's runtime and every browser on it, whole, on each change. */
export interface BrowserFrame {
  browsers: BrowserRow[];
  kind: "browsers";
  machineId: string;
  runtime: BrowserRuntime;
}

/** The ICE relay a browser's media is given as it starts: the fleet's stream relay, with a credential minted for it. */
export interface BrowserRelay {
  credential: string;
  /**
   * The relay's machine and its own LAN and tailnet addresses (empty while
   * that machine has not said them yet): a browser composes its ICE URLs
   * from them (agent relay-urls.ts). Absent from a viewer's use.
   */
  reach?: BrowserRelayReach;
  /** The relay's public URLs, as every viewer is given them. */
  urls: string[];
  username: string;
}

/** Where the relay's machine is, as a browser of the fleet composes its ICE URLs from it. */
export interface BrowserRelayReach {
  lan: string[];
  machineId: string;
  tailnet: string[];
}

/** Hub → daemon: start the browser of `key` (or wake it), with the stream relay when the fleet has one. Answers the {@link BrowserRow}. */
export const BROWSER_START = "browser.start";
export interface BrowserStartArgs {
  key: BrowserKey;
  relay?: BrowserRelay;
}

/**
 * Where a machine reads the names the hub's previews stand on (a machine's
 * `GET`): what `artifact_browse` hands a session's browser. A browser
 * container's loopback is its own, so where those names resolve to the
 * machine's loopback the container maps them to the machine (agent
 * container-host.ts).
 */
export const PREVIEW_NAMES_PATH = "/api/preview-names";

/** The hub's answer at {@link PREVIEW_NAMES_PATH}. */
export interface PreviewNames {
  /**
   * The names as Chromium's `--host-resolver-rules` takes them (`*.example.com`,
   * `example.com`, a host), with one of them to resolve; null when the
   * previews' addresses name an IP alone.
   */
  names: { patterns: string[]; sample: string } | null;
}

/** Hub → daemon: stop the browser of `key`, keeping its profile. */
export const BROWSER_STOP = "browser.stop";

/** Hub → daemon: stop the browser of `key` and delete its profile (a forgotten project). */
export const BROWSER_REMOVE = "browser.remove";

/**
 * Hub → daemon: a work item ended, so on every browser of the machine the
 * door `id` names (its workspace's, else its session's own: agent door.ts)
 * has its connections cut and its pages closed. The browsers themselves,
 * shared by the project's sessions, run on. Answers `true`.
 */
export const BROWSER_CLOSE_PAGES = "browser.closePages";
export interface BrowserClosePagesArgs {
  id: string;
}

/**
 * Hub → daemon: the person takes over the browser of `key`, privately (the
 * shield, agent `browser/shield.ts`): every agent connection cut and new
 * ones refused, the asking workspace's page brought to the front, control
 * given to the person. `workspaceId` is the asking session's workspace and
 * `origin` the page it asked about, when a browser ask is taken; `viewer`
 * is the person's neko session on the container host, once their view has
 * one. Sent again (with the viewer, or after the daemon restarted) it keeps
 * the take-over it holds and gives control to that viewer. Answers the
 * {@link BrowserRow}.
 */
export const BROWSER_SHIELD = "browser.shield";
export interface BrowserShieldArgs {
  key: BrowserKey;
  origin?: string;
  requestId?: string;
  viewer?: string;
  workspaceId?: string;
}

/**
 * Hub → daemon: the person hands the browser of `key` back: control taken
 * from them, the front page loaded again by GET, the clipboard emptied,
 * the gate open. Answers {@link BrowserHandback}.
 */
export const BROWSER_HANDBACK = "browser.handback";

/**
 * Hub → daemon: the machine's browsers as its records hold them now, whole
 * (a {@link BrowserFrame}): what the hub reads as the machine registers, so
 * its rows, take-overs included, are the machine's own and never a copy the
 * hub kept while it was away.
 */
export const BROWSER_ROWS = "browser.rows";

/** Hub → daemon: how many views of the browser of `key` are open now; with none for two minutes a take-over is handed back. */
export const BROWSER_VIEWERS = "browser.viewers";
export interface BrowserViewersArgs {
  count: number;
  key: BrowserKey;
}

/**
 * Hub → daemon: a neko session of its own for one viewer of the browser of
 * `key` (container host), woken first when it sleeps. The hub swaps it in
 * for whatever credential the viewer's client sent, on every request and
 * socket of that viewer (hub browser-routes.ts). Answers
 * {@link BrowserViewerSession}; refused on the local host, which has no neko.
 */
export const BROWSER_VIEWER_TOKEN = "browser.viewerToken";
export interface BrowserViewerSession {
  /** neko's id for the session: the one `browser.shield`'s `viewer` gives control to. */
  session: string;
  token: string;
}

/**
 * Hub → daemon: the machine's one browser listener, opened when it has none,
 * answering only `token` from then on (core `RELAY_HEADER`, as a preview
 * listener does). It serves {@link browserMount}`/api/*` (neko's REST and
 * `/api/ws`, container host) and `/cdp` (the take-over view, local host).
 * Answers `{ port }`.
 */
export const BROWSER_LISTEN = "browser.listen";
export interface BrowserListenArgs {
  token: string;
}

/** Where the machine's browser listener serves the browser of `key`. */
export const browserMount = (key: BrowserKey): string =>
  `/__cawco/browser/${encodeURIComponent(key)}`;

/**
 * What every agent's browser tool is told while the person holds the
 * browser privately (agent shield.ts): the gate's refusal of every
 * connection (423), and the line the project's other sessions are told (hub
 * browsers.ts). Whole, in the owner's words (ASD-STE100).
 */
export const SHIELD_WORDS =
  "The person took over this browser in CawCo. Do not use your browser tools. Your browser tools work again when the person presses Hand back.";

/**
 * The close reason of a connection the take-over cuts (agent gate.ts
 * `closeAll`): a WebSocket carries 123 bytes at most, which
 * {@link SHIELD_WORDS} is past, so the cut says this whole and the tool's
 * next connection is refused with SHIELD_WORDS.
 */
export const SHIELD_CLOSE_WORDS = "The person took over this browser.";

/**
 * The close a local browser's view opens again at once (agent cdp-watch.ts):
 * what it shows moved, to another page in front or to a take-over's own
 * screencast. Never a refusal: the hub's are 4000 plus an HTTP status.
 */
export const BROWSER_VIEW_MOVED = 4205;

/** How long a take-over stands with no view open before the daemon hands it back itself. */
export const TAKEOVER_UNWATCHED_MS = 2 * 60_000;

/** What a hand-back answers: the front page's origin, and nothing else of it. */
export interface BrowserHandback {
  key: BrowserKey;
  /** The front page's origin as it was handed back; null when no page was in front. */
  origin: string | null;
  /** The browser ask the take-over answered, when it answered one. */
  requestId?: string;
}

/**
 * One browser of the fleet as the hub lists it (`GET /api/browsers`, and
 * {@link BrowserListFrame}): the row its machine last reported, kept by the
 * hub, with the machine's name and what the machine says of it now (`why`,
 * `progress`, `origin`, from its latest frame).
 */
export interface ListedBrowser {
  host: BrowserHostKind;
  key: BrowserKey;
  /** ms epoch of the last agent connection or viewer. */
  lastUsedAt: number;
  machineId: string;
  machineName: string;
  name: string;
  /** The origin of the page the person's view shows; absent while it shows none. */
  origin?: string;
  /** How far an image build is, while `state` is `pulling` or `building`. */
  progress?: { done: number; total: number; what: "image" };
  /** The project of a `project:` key; null for a machine's own browser. */
  projectId: string | null;
  state: BrowserState;
  /** Who holds it privately: the asking workspace, `""` when nobody asked; null while nobody does. */
  takeover: { by: string; requestId: string | null; since: number } | null;
  /** Why it is `failed`, one sentence. */
  why?: string;
}

/**
 * Hub-originated, to every dashboard socket (the app's included): every
 * browser of the fleet, whole, as the socket opens and on each change of
 * any (a machine's frame, a start, stop, take-over, hand-back or removal).
 * A view paints from it and follows it, and never polls.
 */
export interface BrowserListFrame {
  browsers: ListedBrowser[];
  kind: "browser_list";
}

/**
 * Daemon-originated: a take-over ended on the machine, whichever way: the
 * person's Hand back, no view open for {@link TAKEOVER_UNWATCHED_MS}, or the
 * browser stopped. Sent before the record's own frame, so the hub learns
 * every end the same way and the ask's call answers with the page's origin.
 */
export interface BrowserHandedBackFrame extends BrowserHandback {
  kind: "browser_handback";
  machineId: string;
  why: "person" | "unwatched" | "stopped";
}

/** Whether `value` is a {@link BrowserKey}. */
export const isBrowserKey = (value: unknown): value is BrowserKey =>
  typeof value === "string" && BROWSER_KEY.test(value);

const BROWSER_KEY = /^(?:project|machine):[A-Za-z0-9][A-Za-z0-9_.-]*$/u;

/** A key as a name the runtime and the filesystem take: `project:abc` → `project-abc`. */
export const browserSlug = (key: BrowserKey): string => key.replace(":", "-");
