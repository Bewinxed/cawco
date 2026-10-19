/**
 * A project's browser (Projects spec D30, §5.11): one Chrome per project per
 * machine, run by the machine's agent, where the project's agents browse and
 * its sign-ins last. A session outside any project uses its machine's. It
 * runs in a container (neko's Chromium, our image on top) wherever the
 * machine has a container runtime, and as a local Chromium where it has none
 * (agent `browser/`). These are the shapes every hop speaks: the key, the
 * agent's ports, the daemon's {@link BrowserFrame} and the hub's commands.
 */

/** Which browser: a project's, or the machine's for sessions outside any project. */
export type BrowserKey = `project:${string}` | `machine:${string}`;

/** Which host runs a browser on its machine: a container where a runtime answers, a local Chromium where none does. */
export type BrowserHostKind = "container" | "local";

/**
 * The agent's ports for browsers, four per browser in this order: neko's
 * HTTP, Chromium's DevTools, the gate, and the media port (UDP and TCP, the
 * same number). HTTP, DevTools and the gate listen on 127.0.0.1 alone; media
 * on every address. The local host uses DevTools and the gate only.
 */
export const BROWSER_PORTS = { first: 43_000, last: 43_079 } as const;

/** How many ports one browser takes from {@link BROWSER_PORTS}. */
export const BROWSER_PORTS_EACH = 4;

/** One browser's ports; `http` and `media` are the container host's alone. */
export interface BrowserPorts {
  devtools: number;
  gate: number;
  http?: number;
  media?: number;
}

/** The ports of the `slot`th browser of {@link BROWSER_PORTS}, from 0. */
export const browserPorts = (slot: number): Required<BrowserPorts> => {
  const first = BROWSER_PORTS.first + slot * BROWSER_PORTS_EACH;
  return {
    http: first,
    devtools: first + 1,
    gate: first + 2,
    media: first + 3,
  };
};

/** How many browsers {@link BROWSER_PORTS} holds on one machine. */
export const BROWSER_SLOTS =
  (BROWSER_PORTS.last - BROWSER_PORTS.first + 1) / BROWSER_PORTS_EACH;

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
  urls: string[];
  username: string;
}

/** Hub → daemon: start the browser of `key` (or wake it), with the stream relay when the fleet has one. Answers the {@link BrowserRow}. */
export const BROWSER_START = "browser.start";
export interface BrowserStartArgs {
  key: BrowserKey;
  relay?: BrowserRelay;
}

/** Hub → daemon: stop the browser of `key`, keeping its profile. */
export const BROWSER_STOP = "browser.stop";

/** Hub → daemon: stop the browser of `key` and delete its profile (a forgotten project). */
export const BROWSER_REMOVE = "browser.remove";

/** Whether `value` is a {@link BrowserKey}. */
export const isBrowserKey = (value: unknown): value is BrowserKey =>
  typeof value === "string" && BROWSER_KEY.test(value);

const BROWSER_KEY = /^(?:project|machine):[A-Za-z0-9][A-Za-z0-9_.-]*$/;

/** A key as a name the runtime and the filesystem take: `project:abc` → `project-abc`. */
export const browserSlug = (key: BrowserKey): string => key.replace(":", "-");
