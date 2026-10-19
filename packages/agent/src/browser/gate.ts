/**
 * The DevTools gate (Projects spec §5.11, "The gate"): the one door every
 * agent connection to a project's browser goes through. Chromium's own
 * DevTools port answers anyone who reaches it, and a browser is shared by
 * every session of its project, so no session is given that port. Each
 * session's browser tool connects here instead, to the machine's one gate
 * port, `ws://127.0.0.1:<browserGatePort()>/<gate id>` with its gate id's
 * token as a bearer: the id names the browser (its project's, else the
 * machine's), and that browser's gate speaks to Chromium for it on a
 * connection of its own. A gate id is a workspace's, or a session's own
 * outside any workspace (door.ts).
 *
 * What a connection sees and drives is its workspace's pages alone: the
 * pages it opened (`Target.createTarget`, always as a window of its own),
 * the pages those pages opened, and the browser contexts it made. Chromium
 * 156 links a page to its tab only through the tab's own auto-attach (a
 * page's `TargetInfo` names no parent), so the gate keeps one watching
 * connection while anyone is connected, attached to every tab, to learn
 * which page each tab holds. A session's browser tool asks Chromium to
 * attach it to every new tab (`Target.setAutoAttach` at the browser's
 * level); the gate answers that itself and attaches the connection to its
 * own tabs as each becomes known, so no other session's page ever reaches
 * it. Who owns which page is kept in the browser's dir (`gate.json`), so an
 * agent restart keeps each session's pages its own.
 *
 * Refused always, each with its sentence: ending the browser, reading or
 * clearing its cookies, opening its own pages (`chrome://`,
 * `chrome-untrusted://`, `devtools://`, `file://`), another session's pages,
 * and the methods that speak for every page at once (a browser-level
 * session, tracing or interception at the browser's level). Chromium's
 * tracing records the whole browser whichever page asks, so a page's trace
 * starts only while no other workspace has a connection or a page here, and
 * one running is cut, its data dropped, as another arrives. The shield cuts
 * every connection with {@link SHIELD_CLOSE} and refuses new ones with its
 * sentence until it opens again; a workspace whose boundary ends for good
 * has its connections cut and its pages closed. A connection holds its
 * browser awake, and one to a browser that sleeps wakes it.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { type BrowserKey, browserGatePort } from "@cawco/core/browser";
import { machineId } from "@cawco/core/machine-id";
import { workspaceProjectFile, workspaceStateDir } from "@cawco/core/paths";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import type { Server, ServerWebSocket } from "bun";
import { browserDir } from "./state";

/** What a refusal says, one sentence each. */
export const GATE_WORDS = {
  others: "This page belongs to another session of the project.",
  ownPages: "This browser's own pages are not for agents.",
  signIns:
    "The browser's sign-ins are the project's: use them, never read or clear them. A signed-out test is a new browser context.",
  browser:
    "The project's browser is shared by its sessions: close your own pages, never the browser.",
  wide: "That reaches every page of the project's browser: send it to one of your own pages.",
  flat: "This browser attaches agents in flat sessions only: pass flatten: true.",
  token: "This browser opens to a workspace's own token.",
  none: "No browser is kept for this workspace's project on this machine.",
  ended: "This workspace's boundary ended, and its pages with it.",
  stopped: "The browser stopped.",
  traceShared:
    "Tracing did not start: a trace records every page of the browser, and another session of the project has pages or a connection in it. Trace on a new page once the project's other sessions have closed theirs.",
  traceCut:
    "The trace was stopped and its data dropped: another session of the project came to the browser while it ran, and a trace records every page. Trace on a new page once the project's other sessions have closed theirs.",
} as const;

/** The close code of a connection the shield cuts. */
export const SHIELD_CLOSE = 4423;
/** The close code of a connection whose workspace's boundary ended. */
const ENDED_CLOSE = 4410;

/** A CDP error's code for a refusal, as Chromium answers its own. */
const REFUSED = -32_000;

/** Chromium methods no agent calls: the browser's end, and its sign-ins read or cleared. */
const SIGN_IN_METHODS = new Set([
  "Network.getCookies",
  "Network.getAllCookies",
  "Storage.getCookies",
  "Network.clearBrowserCookies",
  "Network.deleteCookies",
  "Storage.clearDataForOrigin",
  "Storage.clearCookies",
]);
const BROWSER_ENDS = new Set([
  "Browser.close",
  "Browser.crash",
  "Browser.crashGpuProcess",
]);
/** Methods that hand a connection the whole browser, whatever it names. */
const WIDE_METHODS = new Set([
  "Target.attachToBrowserTarget",
  "Target.exposeDevToolsProtocol",
  "Target.sendMessageToTarget",
]);
/** The domains a connection speaks at the browser's level: the rest speak for every page there. */
const BROWSER_DOMAINS = new Set(["Target", "Browser", "SystemInfo", "Schema"]);
/** Methods whose `targetId` must be the connection's own page. */
const TARGET_METHODS = new Set([
  "Target.attachToTarget",
  "Target.activateTarget",
  "Target.closeTarget",
  "Target.getTargetInfo",
  "Target.detachFromTarget",
  "Target.autoAttachRelated",
  "Target.getDevToolsTarget",
  "Browser.getWindowForTarget",
]);
/** URL schemes of the browser's own pages and the machine's files. */
const OWN_PAGE =
  /^\s*(?:view-source:)?(?:chrome|chrome-untrusted|devtools|file):/i;

/** The ids the gate gives its own calls on a connection: far above any agent's. */
const GATE_IDS = 2_000_000_000;

/** The largest message either side sends: a full-page screenshot runs to megabytes. */
const MAX_MESSAGE = 512 * 1024 * 1024;

type Json = Record<string, unknown>;

interface Cdp {
  error?: { code: number; message: string };
  id?: number;
  method?: string;
  params?: Json;
  result?: Json;
  sessionId?: string;
}

interface TargetInfo {
  browserContextId?: string;
  openerId?: string;
  targetId: string;
  type: string;
  url?: string;
}

/** One entry of a CDP `TargetFilter`: the first that matches a target decides. */
interface Filter {
  exclude?: boolean;
  type?: string;
}

/** Chromium's filter when a call gives none. */
const DEFAULT_FILTER: Filter[] = [
  { type: "browser", exclude: true },
  { type: "tab", exclude: true },
  {},
];

/** Whether `filter` lets a target of `type` through. */
const passes = (filter: readonly Filter[], type: string): boolean => {
  const match = filter.find((entry) => !entry.type || entry.type === type);
  return !!match && !match.exclude;
};

const isFilter = (value: unknown): value is Filter[] =>
  Array.isArray(value) &&
  value.every((entry) => !!entry && typeof entry === "object");

const isInfo = (value: unknown): value is TargetInfo =>
  !!value &&
  typeof value === "object" &&
  typeof (value as TargetInfo).targetId === "string" &&
  typeof (value as TargetInfo).type === "string";

const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Whether `url` opens one of the browser's own pages or a file of the machine. */
const ownPage = (url: unknown): boolean =>
  typeof url === "string" && OWN_PAGE.test(url);

const said = (data: string | Buffer): string =>
  typeof data === "string" ? data : data.toString("utf8");

const parse = (data: string): Cdp | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    value = undefined;
  }
  return value && typeof value === "object" ? (value as Cdp) : undefined;
};

/** A filter as given, or Chromium's own when none was. */
const filterOf = (given: unknown): Filter[] =>
  isFilter(given) ? given : DEFAULT_FILTER;

const CUT_CHARACTER = /�+$/;
const BEARER = /^Bearer (\S+)$/;

/** A close reason as a WebSocket carries it: 123 bytes at most. */
const reason = (why: string): string => {
  const bytes = Buffer.from(why);
  return bytes.length <= 123
    ? why
    : `${bytes.subarray(0, 120).toString("utf8").replace(CUT_CHARACTER, "")}…`;
};

// ---------------------------------------------------------------------------
// The workspace's token

/** Where workspace `id`'s gate token is: its state dir, which no command of the workspace reads. */
export const gateTokenFile = (id: string): string =>
  join(workspaceStateDir(id), "browser-token");

/**
 * Workspace `id`'s gate token, minted as its boundary first starts and kept
 * for the workspace's life: its state dir goes with it. A boundary handed
 * over keeps it, so a session's browser tool keeps its door.
 */
export const ensureGateToken = async (id: string): Promise<string> => {
  const file = gateTokenFile(id);
  const kept = (await readFile(file, "utf8").catch(() => "")).trim();
  if (kept) {
    return kept;
  }
  const token = randomBytes(32).toString("base64url");
  await mkdir(workspaceStateDir(id), { recursive: true });
  await writeStateFile(file, `${token}\n`, { mode: 0o600 });
  return token;
};

/** Whether `given` is workspace `id`'s token. */
const tokenOf = async (id: string, given: string): Promise<boolean> => {
  const kept = Buffer.from(
    (await readFile(gateTokenFile(id), "utf8").catch(() => "")).trim()
  );
  const offered = Buffer.from(given);
  return (
    kept.length > 0 &&
    kept.length === offered.length &&
    timingSafeEqual(kept, offered)
  );
};

/** The browser gate id `id`'s sessions use: its project's, else its machine's. */
export const keyOfWorkspace = async (
  id: string,
  machine: string
): Promise<BrowserKey> => {
  const project = await readRecord<unknown>(workspaceProjectFile(id)).catch(
    () => undefined
  );
  return typeof project === "string" && project
    ? `project:${project}`
    : `machine:${machine}`;
};

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

// ---------------------------------------------------------------------------
// One CDP connection to Chromium

/** The gate's own calls on a connection to Chromium, beside the agent's. */
class Wire {
  readonly #socket: WebSocket;
  #next = GATE_IDS;
  readonly #waiting = new Map<
    number,
    { resolve: (result: Json) => void; reject: (error: Error) => void }
  >();

  constructor(socket: WebSocket) {
    this.#socket = socket;
  }

  call(method: string, params: Json = {}, sessionId?: string): Promise<Json> {
    const id = this.#next;
    this.#next += 1;
    return new Promise<Json>((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      this.#socket.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        })
      );
    });
  }

  /** Answers one of the gate's own calls; false for anything else. */
  answered(message: Cdp): boolean {
    if (typeof message.id !== "number" || message.id < GATE_IDS) {
      return false;
    }
    const waiting = this.#waiting.get(message.id);
    this.#waiting.delete(message.id);
    if (message.error) {
      waiting?.reject(new Error(message.error.message));
    } else {
      waiting?.resolve(message.result ?? {});
    }
    return true;
  }

  /** Fails every call still waiting: the connection is gone. */
  ended(): void {
    for (const waiting of this.#waiting.values()) {
      waiting.reject(new Error(GATE_WORDS.stopped));
    }
    this.#waiting.clear();
  }
}

/** A connection to Chromium at `url`, once it is open. */
const dial = (url: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => resolve(socket);
    socket.onerror = () => reject(new Error(`${url} did not open.`));
    socket.onclose = () => reject(new Error(`${url} closed as it opened.`));
  });

// ---------------------------------------------------------------------------
// The gate

/** What the registry gives a browser's gate. */
export interface GateDeps {
  /**
   * Chromium's DevTools address: with `wake`, the browser started or woken
   * first; without, undefined while it does not run.
   */
  devtools: (wake: boolean) => Promise<string | undefined>;
  key: BrowserKey;
  /** Called as the first connection opens (`true`) and the last closes (`false`). */
  used: (held: boolean) => void;
}

/** Who owns what, as kept in the browser's dir. */
interface Owners {
  contexts: Record<string, string>;
  targets: Record<string, string>;
}

interface LinkData {
  link: Link;
}

/** The gate's watching connection: every tab attached, to learn the page each holds. */
interface Watch {
  /** Set as the gate lets it go, perhaps before it has opened. */
  done: boolean;
  ready: Promise<void>;
  socket?: WebSocket;
}

export class Gate {
  readonly #deps: GateDeps;
  readonly #links = new Set<Link>();
  #closedWhy: string | undefined;
  #owners: Owners = { contexts: {}, targets: {} };
  #loaded: Promise<void> | undefined;
  #saving: Promise<void> = Promise.resolve();
  readonly #infos = new Map<string, TargetInfo>();
  readonly #tabPage = new Map<string, string>();
  readonly #tabSessions = new Map<string, string>();
  readonly #windows = new Map<number, string>();
  #watch: Watch | undefined;

  constructor(deps: GateDeps) {
    this.#deps = deps;
  }

  get key(): BrowserKey {
    return this.#deps.key;
  }

  /** Whether any agent is connected now. */
  get held(): boolean {
    return this.#links.size > 0;
  }

  /** Cuts every connection: its browser is gone. */
  stop(): void {
    for (const link of this.#links) {
      link.close(1001, GATE_WORDS.stopped);
    }
    this.#unwatch();
  }

  /** The shield: every connection cut with {@link SHIELD_CLOSE} and `why`, and new ones refused with it. */
  closeAll(why: string): void {
    this.#closedWhy = why;
    for (const link of this.#links) {
      link.close(SHIELD_CLOSE, why);
    }
  }

  /** The shield lifted: connections are taken again. */
  open(): void {
    this.#closedWhy = undefined;
  }

  /** Whether the shield holds the gate closed now, and why. */
  get closedWhy(): string | undefined {
    return this.#closedWhy;
  }

  /**
   * Workspace `id`'s boundary ended for good: its connections are cut, its
   * pages closed and its contexts disposed where the browser runs, and it
   * owns nothing here any more.
   */
  async forget(id: string): Promise<void> {
    await this.#load();
    for (const link of this.#links) {
      if (link.workspace === id) {
        link.close(ENDED_CLOSE, GATE_WORDS.ended);
      }
    }
    const targets = Object.keys(this.#owners.targets).filter(
      (target) => this.#owners.targets[target] === id
    );
    const contexts = Object.keys(this.#owners.contexts).filter(
      (context) => this.#owners.contexts[context] === id
    );
    if (targets.length === 0 && contexts.length === 0) {
      return;
    }
    for (const target of targets) {
      delete this.#owners.targets[target];
    }
    for (const context of contexts) {
      delete this.#owners.contexts[context];
    }
    this.#save();
    const url = await this.#browserUrl(false).catch(() => undefined);
    if (!url) {
      return;
    }
    const socket = await dial(url);
    const wire = new Wire(socket);
    socket.onmessage = (event) => {
      const message = parse(said(event.data as string));
      if (message) {
        wire.answered(message);
      }
    };
    socket.onclose = () => wire.ended();
    // A tab's page closes with it: the pages alone are named.
    await Promise.allSettled([
      ...targets.map((targetId) =>
        wire.call("Target.closeTarget", { targetId })
      ),
      ...contexts.map((browserContextId) =>
        wire.call("Target.disposeBrowserContext", { browserContextId })
      ),
    ]);
    socket.close();
    console.info(
      `[browser] ${this.key}: workspace ${id}'s boundary ended: ${targets.length} page(s) and ${contexts.length} context(s) of its closed`
    );
  }

  /** A connection of gate id `id`, or why the shield refuses it now. */
  admit(id: string): Link | string {
    return this.#closedWhy ?? new Link(this, id);
  }

  /** Chromium's browser connection URL, the browser woken first when `wake`. */
  async #browserUrl(wake: boolean): Promise<string> {
    const base = await this.#deps.devtools(wake);
    if (!base) {
      throw new Error(`${this.key} does not run.`);
    }
    const read = await readWithin(10_000, (signal) =>
      fetch(`${base}/json/version`, { signal }).then(
        (response) =>
          response.json() as Promise<{ webSocketDebuggerUrl?: string }>
      )
    );
    const url =
      read.kind === "answered" ? read.value.webSocketDebuggerUrl : undefined;
    if (!url) {
      throw new Error(`${this.key}'s DevTools did not answer at ${base}.`);
    }
    return url;
  }

  /** A connection opened: the browser woken, the watch up, and Chromium's connection for it. */
  async attachLink(link: Link): Promise<WebSocket> {
    if (this.#closedWhy) {
      throw new Error(this.#closedWhy);
    }
    this.#links.add(link);
    if (this.#links.size === 1) {
      this.#deps.used(true);
    }
    this.#arrived(link.workspace);
    const url = await this.#browserUrl(true);
    await this.#watching(url);
    return dial(url);
  }

  /** A connection closed: the watch ends with the last. */
  detachLink(link: Link): void {
    if (!this.#links.delete(link)) {
      return;
    }
    if (this.#links.size === 0) {
      this.#unwatch();
      this.#deps.used(false);
    }
  }

  // -- who owns what -------------------------------------------------------

  #ownersFile(): string {
    return join(browserDir(this.key), "gate.json");
  }

  #load(): Promise<void> {
    this.#loaded ??= readRecord<Owners>(this.#ownersFile())
      .then((kept) => {
        if (kept?.targets && kept.contexts) {
          this.#owners = kept;
        }
      })
      .catch((error: unknown) =>
        console.warn(
          `[browser] ${this.key}: who owns its pages was not read (${String(error)}); each session starts with none`
        )
      );
    return this.#loaded;
  }

  #save(): void {
    const body = `${JSON.stringify(this.#owners, null, 2)}\n`;
    this.#saving = this.#saving
      .then(() => writeStateFile(this.#ownersFile(), body, { mode: 0o600 }))
      .catch((error: unknown) =>
        console.warn(
          `[browser] ${this.key}: who owns its pages was not kept: ${String(error)}`
        )
      );
  }

  /** The workspace that owns `targetId`: a tab is its page's. */
  ownerOf(targetId: string): string | undefined {
    const own = this.#owners.targets[targetId];
    if (own) {
      return own;
    }
    const page = this.#tabPage.get(targetId);
    return page ? this.#owners.targets[page] : undefined;
  }

  contextOwner(id: string): string | undefined {
    return this.#owners.contexts[id];
  }

  windowOwner(id: number): string | undefined {
    return this.#windows.get(id);
  }

  info(targetId: string): TargetInfo | undefined {
    return this.#infos.get(targetId);
  }

  /** Every target the gate knows of now. */
  targets(): TargetInfo[] {
    return [...this.#infos.values()];
  }

  /** Whether workspace `id` sees `targetId`: its own pages and tabs, what they opened, and the browser itself. */
  visible(id: string, targetId: string): boolean {
    const info = this.#infos.get(targetId);
    if (info?.type === "browser") {
      return true;
    }
    if (this.ownerOf(targetId) === id) {
      return true;
    }
    return !!info?.openerId && this.ownerOf(info.openerId) === id;
  }

  /** Whether `targetId` is the browser itself. */
  isBrowser(targetId: string): boolean {
    return this.#infos.get(targetId)?.type === "browser";
  }

  own(targetId: string, id: string): void {
    this.#owners.targets[targetId] = id;
    this.#save();
    this.#arrived(id);
    this.#changed(targetId);
  }

  /**
   * Whether a workspace other than `id` holds a connection or a live page
   * here. Chromium's tracing is the whole browser's, whichever page asks:
   * a trace then would record that workspace's pages.
   */
  shared(id: string): boolean {
    for (const link of this.#links) {
      if (link.workspace !== id) {
        return true;
      }
    }
    return Object.entries(this.#owners.targets).some(
      ([target, owner]) => owner !== id && this.#infos.has(target)
    );
  }

  /** Workspace `id` came to the browser (a connection, a page): every other workspace's trace running is cut. */
  #arrived(id: string): void {
    for (const link of this.#links) {
      if (link.workspace !== id) {
        link.cutTraces();
      }
    }
  }

  ownContext(contextId: string, id: string): void {
    this.#owners.contexts[contextId] = id;
    this.#save();
  }

  ownWindow(windowId: number, id: string): void {
    this.#windows.set(windowId, id);
  }

  /** What a connection or the watch read of a target: a page opened by an owned page is its opener's owner's. */
  learn(info: TargetInfo): void {
    this.#infos.set(info.targetId, info);
    if (
      info.type === "page" &&
      info.openerId &&
      !this.#owners.targets[info.targetId]
    ) {
      const owner = this.ownerOf(info.openerId);
      if (owner) {
        this.own(info.targetId, owner);
      }
    }
  }

  #gone(targetId: string): void {
    this.#infos.delete(targetId);
    this.#tabPage.delete(targetId);
    if (this.#owners.targets[targetId]) {
      delete this.#owners.targets[targetId];
      this.#save();
    }
  }

  /** Tab `tab` holds page `page` now: a page that takes an owned tab's place (a prerender's) is its owner's. */
  #holds(tab: string, page: string): void {
    const before = this.#tabPage.get(tab);
    this.#tabPage.set(tab, page);
    const owner = before ? this.#owners.targets[before] : undefined;
    if (owner && !this.#owners.targets[page]) {
      this.own(page, owner);
    }
    this.#changed(tab);
  }

  /** Ownership of `targetId` (and the tab holding it) changed: each connection shows what it may now see. */
  #changed(targetId: string): void {
    const ids = [targetId];
    for (const [tab, page] of this.#tabPage) {
      if (page === targetId) {
        ids.push(tab);
      }
    }
    for (const link of this.#links) {
      for (const id of ids) {
        const info = this.#infos.get(id);
        if (info) {
          link.reveal(info);
        }
      }
    }
  }

  // -- the watch -------------------------------------------------------------

  #watching(url: string): Promise<void> {
    this.#watch ??= this.#startWatch(url);
    return this.#watch.ready;
  }

  #startWatch(url: string): Watch {
    const watch: Watch = { done: false, ready: Promise.resolve() };
    const tabsAttached: Promise<unknown>[] = [];
    watch.ready = (async () => {
      await this.#load();
      // What an earlier watch knew may have ended unseen: discovery says it
      // all again.
      this.#infos.clear();
      const socket = await dial(url);
      watch.socket = socket;
      if (watch.done) {
        socket.close();
        return;
      }
      const wire = new Wire(socket);
      socket.onmessage = (event) => {
        const message = parse(said(event.data as string));
        if (message && !wire.answered(message)) {
          this.#watched(message, wire, tabsAttached);
        }
      };
      socket.onclose = () => {
        wire.ended();
        if (this.#watch === watch) {
          this.#watch = undefined;
          this.#tabSessions.clear();
          // Its connections still open: watched again, so each new tab is
          // still known (a browser that stopped refuses it, and theirs end).
          if (this.#links.size > 0) {
            this.#watching(url).catch(() => undefined);
          }
        }
      };
      await wire.call("Target.setDiscoverTargets", { discover: true });
      await wire.call("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: false,
        flatten: true,
        filter: [{ type: "tab" }],
      });
      await Promise.allSettled(tabsAttached);
      // Pages of an earlier run of the browser are gone with it.
      const stale = Object.keys(this.#owners.targets).filter(
        (target) => !this.#infos.has(target)
      );
      for (const target of stale) {
        delete this.#owners.targets[target];
      }
      if (stale.length > 0) {
        this.#save();
      }
    })();
    watch.ready.catch(() => {
      if (this.#watch === watch) {
        this.#watch = undefined;
      }
    });
    return watch;
  }

  #watched(message: Cdp, wire: Wire, tabsAttached: Promise<unknown>[]): void {
    const params = message.params ?? {};
    switch (message.method) {
      case "Target.targetCreated":
      case "Target.targetInfoChanged":
        if (isInfo(params.targetInfo)) {
          this.learn(params.targetInfo);
        }
        return;
      case "Target.targetDestroyed": {
        const id = text(params.targetId);
        if (id) {
          this.#gone(id);
        }
        return;
      }
      case "Target.attachedToTarget":
        this.#watchedAttach(message, wire, tabsAttached);
        return;
      case "Target.detachedFromTarget": {
        const session = text(params.sessionId);
        if (session) {
          this.#tabSessions.delete(session);
        }
        return;
      }
      // A method off the wire is any string, or none: one this does not
      // name passes as it came.
      case undefined:
        break;
    }
  }

  /** The watch attached to a tab (and asks for its page), or to a tab's page (which it then knows the tab holds). */
  #watchedAttach(
    message: Cdp,
    wire: Wire,
    tabsAttached: Promise<unknown>[]
  ): void {
    const params = message.params ?? {};
    const session = text(params.sessionId);
    const info = isInfo(params.targetInfo) ? params.targetInfo : undefined;
    if (!(session && info)) {
      return;
    }
    if (!message.sessionId && info.type === "tab") {
      this.#tabSessions.set(session, info.targetId);
      tabsAttached.push(
        wire
          .call(
            "Target.setAutoAttach",
            {
              autoAttach: true,
              waitForDebuggerOnStart: false,
              flatten: true,
              filter: [{ type: "page" }],
            },
            session
          )
          .catch(() => undefined)
      );
      return;
    }
    const tab = message.sessionId
      ? this.#tabSessions.get(message.sessionId)
      : undefined;
    if (tab && info.type === "page") {
      this.learn(info);
      this.#holds(tab, info.targetId);
    }
  }

  #unwatch(): void {
    const watch = this.#watch;
    this.#watch = undefined;
    this.#tabSessions.clear();
    if (watch) {
      // One still opening closes as it opens.
      watch.done = true;
      watch.socket?.close();
    }
  }
}

// ---------------------------------------------------------------------------
// One agent's connection

/**
 * One agent's connection through the gate, and Chromium's connection for
 * it. Every message the agent sends is judged in order; every one Chromium
 * sends is shown only as far as the agent's workspace may see.
 */
class Link {
  readonly #gate: Gate;
  readonly workspace: string;
  #socket: ServerWebSocket<LinkData> | undefined;
  #up: WebSocket | undefined;
  #wire: Wire | undefined;
  #queue: string[] = [];
  #chain: Promise<void> = Promise.resolve();
  /** The agent asked for targets' news, and through which filter. */
  #discover: Filter[] | undefined;
  /** The agent asked to be attached to new targets, and through which filter. */
  #autoAttach: Filter[] | undefined;
  /** Targets the agent was told of. */
  readonly #shown = new Set<string>();
  /** Targets the agent is attached to at the browser's level. */
  readonly #attached = new Set<string>();
  /** Sessions on Chromium's connection that are the agent's. */
  readonly #sessions = new Set<string>();
  /** The agent's calls whose answers the gate reads or narrows. */
  readonly #asked = new Map<number, Cdp>();
  /** Sessions the agent traces on now. */
  readonly #tracing = new Set<string>();
  /** Sessions whose trace the gate cut: their trace's events are dropped, their `Tracing.end` refused. */
  readonly #traceCut = new Set<string>();

  constructor(gate: Gate, workspace: string) {
    this.#gate = gate;
    this.workspace = workspace;
  }

  opened(socket: ServerWebSocket<LinkData>): void {
    this.#socket = socket;
    this.#gate
      .attachLink(this)
      .then((up) => {
        // The agent left while Chromium's connection opened.
        if (!this.#socket) {
          up.close();
          return;
        }
        this.#up = up;
        this.#wire = new Wire(up);
        up.onmessage = (event) => this.#fromBrowser(said(event.data as string));
        up.onclose = () => {
          this.#wire?.ended();
          this.close(1001, GATE_WORDS.stopped);
        };
        for (const queued of this.#queue) {
          this.#take(queued);
        }
        this.#queue = [];
      })
      .catch((error: unknown) => {
        this.close(
          1011,
          error instanceof Error ? error.message : String(error)
        );
      });
  }

  said(data: string): void {
    if (this.#up) {
      this.#take(data);
    } else {
      this.#queue.push(data);
    }
  }

  closed(): void {
    this.#socket = undefined;
    this.#up?.close();
    this.#gate.detachLink(this);
  }

  close(code: number, why: string): void {
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close(code, reason(why));
    this.#up?.close();
    this.#gate.detachLink(this);
  }

  #send(message: Cdp | string): void {
    this.#socket?.send(
      typeof message === "string" ? message : JSON.stringify(message)
    );
  }

  #refuse(message: Cdp, why: string): void {
    this.#send({
      id: message.id,
      error: { code: REFUSED, message: why },
      ...(message.sessionId ? { sessionId: message.sessionId } : {}),
    });
  }

  // -- agent → browser -------------------------------------------------------

  #take(data: string): void {
    this.#chain = this.#chain
      .then(() => this.#fromAgent(data))
      .catch((error: unknown) =>
        console.warn(
          `[browser] ${this.#gate.key}: a message of workspace ${this.workspace} was dropped: ${String(error)}`
        )
      );
  }

  async #fromAgent(data: string): Promise<void> {
    const message = parse(data);
    if (!(message && typeof message.id === "number" && message.method)) {
      return;
    }
    const why = (await this.#refusal(message)) ?? this.#traced(message);
    if (why) {
      this.#refuse(message, why);
      return;
    }
    if (!message.sessionId && (await this.#answeredHere(message))) {
      return;
    }
    this.#up?.send(JSON.stringify(message));
  }

  /**
   * Keeps which of the agent's sessions trace: a trace starts only while no
   * other workspace is in the browser ({@link Gate.shared}), and the end of
   * one the gate cut is refused, its data already dropped.
   */
  #traced(message: Cdp): string | undefined {
    const session = message.sessionId ?? "";
    if (message.method === "Tracing.start") {
      if (this.#gate.shared(this.workspace)) {
        return GATE_WORDS.traceShared;
      }
      this.#traceCut.delete(session);
      this.#tracing.add(session);
    } else if (message.method === "Tracing.end") {
      if (this.#traceCut.has(session)) {
        return GATE_WORDS.traceCut;
      }
      this.#tracing.delete(session);
    }
  }

  /** Another workspace came to the browser: every trace of this agent's is ended, and what it recorded never reaches it. */
  cutTraces(): void {
    for (const session of this.#tracing) {
      this.#traceCut.add(session);
      this.#wire?.call("Tracing.end", {}, session).catch(() => undefined);
    }
    if (this.#tracing.size > 0) {
      console.info(
        `[browser] ${this.#gate.key}: workspace ${this.workspace}'s trace was cut: another session of the project came to the browser`
      );
    }
    this.#tracing.clear();
  }

  /** Why the gate refuses `message`, or nothing when it goes on. */
  async #refusal(message: Cdp): Promise<string | undefined> {
    const method = message.method ?? "";
    const params = message.params ?? {};
    const { sessionId } = message;
    if (SIGN_IN_METHODS.has(method)) {
      return GATE_WORDS.signIns;
    }
    if (BROWSER_ENDS.has(method)) {
      return GATE_WORDS.browser;
    }
    if (WIDE_METHODS.has(method)) {
      return GATE_WORDS.wide;
    }
    if (method === "Target.openDevTools") {
      return GATE_WORDS.ownPages;
    }
    if (sessionId !== undefined && !this.#sessions.has(sessionId)) {
      return GATE_WORDS.others;
    }
    if (!(sessionId || BROWSER_DOMAINS.has(method.split(".")[0] ?? ""))) {
      return GATE_WORDS.wide;
    }
    if (
      (method === "Page.navigate" || method === "Target.createTarget") &&
      ownPage(params.url)
    ) {
      return GATE_WORDS.ownPages;
    }
    if (method === "Page.navigateToHistoryEntry" && this.#wire) {
      const history = await this.#wire
        .call("Page.getNavigationHistory", {}, sessionId)
        .catch((): Json => ({}));
      const entries = Array.isArray(history.entries)
        ? (history.entries as { id?: number; url?: string }[])
        : [];
      if (ownPage(entries.find((entry) => entry.id === params.entryId)?.url)) {
        return GATE_WORDS.ownPages;
      }
    }
    return this.#named(method, params);
  }

  /** Why the gate refuses a call naming a target, session, context or window not the agent's. */
  #named(method: string, params: Json): string | undefined {
    const target = text(params.targetId);
    if (TARGET_METHODS.has(method) && target) {
      if (this.#gate.isBrowser(target)) {
        return GATE_WORDS.wide;
      }
      if (!this.#gate.visible(this.workspace, target)) {
        return GATE_WORDS.others;
      }
    }
    if (method === "Browser.getWindowForTarget" && !target) {
      return GATE_WORDS.others;
    }
    const session = text(params.sessionId);
    if (
      method === "Target.detachFromTarget" &&
      session &&
      !this.#sessions.has(session)
    ) {
      return GATE_WORDS.others;
    }
    const context = text(params.browserContextId);
    const contextOwner = context ? this.#gate.contextOwner(context) : undefined;
    if (contextOwner && contextOwner !== this.workspace) {
      return GATE_WORDS.others;
    }
    const windowOwner =
      typeof params.windowId === "number"
        ? this.#gate.windowOwner(params.windowId)
        : undefined;
    if (windowOwner && windowOwner !== this.workspace) {
      return GATE_WORDS.others;
    }
  }

  /**
   * The browser-level calls the gate answers or reshapes: auto-attach is the
   * gate's own (to the agent's tabs alone), each new page is a window of its
   * own, and the answers that list targets, contexts or windows are read.
   */
  async #answeredHere(message: Cdp): Promise<boolean> {
    const params = message.params ?? {};
    switch (message.method) {
      case "Target.setAutoAttach": {
        if (params.flatten !== true) {
          this.#refuse(message, GATE_WORDS.flat);
          return true;
        }
        this.#autoAttach =
          params.autoAttach === true ? filterOf(params.filter) : undefined;
        await Promise.allSettled(
          this.#gate
            .targets()
            .filter((info) => this.#mayAttach(info))
            .map((info) => this.#attach(info.targetId))
        );
        this.#send({ id: message.id, result: {} });
        return true;
      }
      case "Target.setDiscoverTargets":
        this.#discover =
          params.discover === true ? filterOf(params.filter) : undefined;
        if (!this.#discover) {
          this.#shown.clear();
        }
        return false;
      case "Target.createTarget":
        message.params = { ...params, newWindow: true };
        this.#asked.set(message.id ?? 0, message);
        return false;
      case "Target.createBrowserContext":
      case "Target.getTargets":
      case "Target.getBrowserContexts":
      case "Browser.getWindowForTarget":
        this.#asked.set(message.id ?? 0, message);
        return false;
      case undefined:
        break;
    }
    // A method off the wire is any string, or none: one this does not name
    // passes as it came.
    return false;
  }

  #mayAttach(info: TargetInfo): boolean {
    return (
      !!this.#autoAttach &&
      (info.type === "tab" || info.type === "page") &&
      passes(this.#autoAttach, info.type) &&
      !this.#attached.has(info.targetId) &&
      this.#gate.visible(this.workspace, info.targetId)
    );
  }

  async #attach(targetId: string): Promise<void> {
    this.#attached.add(targetId);
    await this.#wire
      ?.call("Target.attachToTarget", { targetId, flatten: true })
      .catch(() => this.#attached.delete(targetId));
  }

  // -- browser → agent -------------------------------------------------------

  #fromBrowser(data: string): void {
    const message = parse(data);
    if (!message || this.#wire?.answered(message)) {
      return;
    }
    if (typeof message.id === "number") {
      const asked = this.#asked.get(message.id);
      this.#asked.delete(message.id);
      if (asked && message.result) {
        this.#read(asked, message.result);
        this.#send(message);
        return;
      }
      this.#send(data);
      return;
    }
    const params = message.params ?? {};
    if (message.sessionId !== undefined) {
      this.#sessionEvent(message, params, data);
      return;
    }
    this.#browserEvent(message, params, data);
  }

  /** An event of one of the agent's sessions: its children are the agent's too. */
  #sessionEvent(message: Cdp, params: Json, data: string): void {
    const session = message.sessionId ?? "";
    if (
      !this.#sessions.has(session) ||
      (this.#traceCut.has(session) && message.method?.startsWith("Tracing."))
    ) {
      return;
    }
    const child = text(params.sessionId);
    if (child && message.method === "Target.attachedToTarget") {
      this.#sessions.add(child);
    } else if (child && message.method === "Target.detachedFromTarget") {
      this.#sessions.delete(child);
    }
    this.#send(data);
  }

  /** An event at the browser's level: the Target domain's, as far as the agent may see; nothing else speaks for one page. */
  #browserEvent(message: Cdp, params: Json, data: string): void {
    const info = isInfo(params.targetInfo) ? params.targetInfo : undefined;
    const target = text(params.targetId) ?? info?.targetId;
    switch (message.method) {
      case "Target.targetCreated":
      case "Target.targetInfoChanged":
        if (info) {
          this.#gate.learn(info);
          if (this.#gate.visible(this.workspace, info.targetId)) {
            this.#see(info, message);
          }
        }
        return;
      case "Target.targetDestroyed":
      case "Target.targetCrashed":
        if (target && this.#shown.has(target)) {
          if (message.method === "Target.targetDestroyed") {
            this.#shown.delete(target);
          }
          this.#send(data);
        }
        return;
      case "Target.attachedToTarget":
        if (info) {
          this.#attachedTo(info, text(params.sessionId), data);
        }
        return;
      case "Target.detachedFromTarget":
        this.#detachedFrom(text(params.sessionId), target, data);
        return;
      // A method off the wire is any string, or none: one this does not
      // name passes as it came.
      case undefined:
        break;
    }
  }

  /** Chromium let a session of the agent's go: said when it was the agent's. */
  #detachedFrom(
    session: string | undefined,
    target: string | undefined,
    data: string
  ): void {
    if (!(session && this.#sessions.delete(session))) {
      return;
    }
    if (target) {
      this.#attached.delete(target);
    }
    this.#send(data);
  }

  /** Chromium attached the agent at the browser's level: kept when the target is its own, else let go unseen. */
  #attachedTo(info: TargetInfo, session: string | undefined, data: string) {
    if (!session) {
      return;
    }
    if (
      this.#gate.isBrowser(info.targetId) ||
      !this.#gate.visible(this.workspace, info.targetId)
    ) {
      this.#wire
        ?.call("Target.detachFromTarget", { sessionId: session })
        .catch(() => undefined);
      return;
    }
    this.#sessions.add(session);
    this.#attached.add(info.targetId);
    this.#send(data);
  }

  /** The agent told of a target it may see, and attached to it when it asked to be. */
  #see(info: TargetInfo, native?: Cdp): void {
    if (this.#discover && passes(this.#discover, info.type)) {
      if (!this.#shown.has(info.targetId)) {
        this.#shown.add(info.targetId);
        this.#send({
          method: "Target.targetCreated",
          params: { targetInfo: info },
        });
      } else if (native?.method === "Target.targetInfoChanged") {
        this.#send(native);
      }
    }
    if (this.#mayAttach(info)) {
      this.#attach(info.targetId).catch(() => undefined);
    }
  }

  /** A target the agent's workspace came to own (or see) as it stands now. */
  reveal(info: TargetInfo): void {
    if (
      this.#socket &&
      this.#up &&
      this.#gate.visible(this.workspace, info.targetId)
    ) {
      this.#see(info);
    }
  }

  /** Reads (and narrows) the answer to one of the agent's calls. */
  #read(asked: Cdp, result: Json): void {
    switch (asked.method) {
      case "Target.createTarget": {
        const id = text(result.targetId);
        if (id) {
          this.#gate.own(id, this.workspace);
        }
        return;
      }
      case "Target.createBrowserContext": {
        const id = text(result.browserContextId);
        if (id) {
          this.#gate.ownContext(id, this.workspace);
        }
        return;
      }
      case "Target.getTargets":
        if (Array.isArray(result.targetInfos)) {
          const infos = result.targetInfos.filter(isInfo);
          for (const info of infos) {
            this.#gate.learn(info);
          }
          result.targetInfos = infos.filter((info) =>
            this.#gate.visible(this.workspace, info.targetId)
          );
        }
        return;
      case "Target.getBrowserContexts":
        if (Array.isArray(result.browserContextIds)) {
          result.browserContextIds = result.browserContextIds.filter(
            (id) =>
              typeof id === "string" &&
              this.#gate.contextOwner(id) === this.workspace
          );
        }
        return;
      case "Browser.getWindowForTarget":
        if (typeof result.windowId === "number") {
          this.#gate.ownWindow(result.windowId, this.workspace);
        }
        return;
      // A method off the wire is any string, or none: one this does not
      // name passes as it came.
      case undefined:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// The machine's gates

const gates = new Map<BrowserKey, Gate>();

/** The gate of `key`, made the first time; it takes connections once {@link listenGates} listens. */
export const serveGate = (deps: GateDeps): Gate => {
  let gate = gates.get(deps.key);
  if (!gate) {
    gate = new Gate(deps);
    gates.set(deps.key, gate);
  }
  return gate;
};

/** The machine's gate port's upgrade: the path's gate id, its token, and the gate of its browser. */
const upgrade = async (
  request: Request,
  server: Server<LinkData>
): Promise<Response | undefined> => {
  const id = new URL(request.url).pathname.slice(1);
  if (
    !WORKSPACE_ID.test(id) ||
    request.headers.get("upgrade") !== "websocket"
  ) {
    return new Response("Not found.", { status: 404 });
  }
  const bearer = BEARER.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!(bearer && (await tokenOf(id, bearer)))) {
    return new Response(GATE_WORDS.token, { status: 401 });
  }
  // The machine's id as every door reads it (door.ts): one key for a gate id.
  const gate = gates.get(await keyOfWorkspace(id, await machineId()));
  if (!gate) {
    return new Response(GATE_WORDS.none, { status: 404 });
  }
  const admitted = gate.admit(id);
  if (typeof admitted === "string") {
    return new Response(admitted, { status: 423 });
  }
  return server.upgrade(request, { data: { link: admitted } })
    ? undefined
    : new Response("A WebSocket upgrade was expected.", { status: 400 });
};

let listening: Server<LinkData> | undefined;

/**
 * Listens on 127.0.0.1 at `browserGatePort()`, the one door to every
 * browser of the machine; the daemon's alone. A port another process holds
 * is said in the log, and every session's browser tool answers that it
 * cannot connect until the agent starts again with it free.
 */
export const listenGates = (): void => {
  if (listening) {
    return;
  }
  const port = browserGatePort();
  try {
    listening = Bun.serve<LinkData>({
      hostname: "127.0.0.1",
      port,
      fetch: (request, server) => upgrade(request, server),
      websocket: {
        maxPayloadLength: MAX_MESSAGE,
        sendPings: true,
        open: (socket) => socket.data.link.opened(socket),
        message: (socket, data) => socket.data.link.said(said(data)),
        close: (socket) => socket.data.link.closed(),
      },
    });
  } catch (error) {
    console.warn(
      `[browser] the DevTools gate does not listen on 127.0.0.1:${port}: ${String(error)}`
    );
  }
};

/** The gate of `key`, when this process serves it. */
export const gateOf = (key: BrowserKey): Gate | undefined => gates.get(key);

/** Every browser this process serves a gate for. */
export const servedGates = (): BrowserKey[] => [...gates.keys()];

/** Stops the gate of `key` (its browser removed). */
export const stopGate = (key: BrowserKey): void => {
  gates.get(key)?.stop();
  gates.delete(key);
};

/**
 * Workspace `id`'s boundary ended for good: on every browser of this
 * machine, its connections are cut and its pages closed.
 */
export const closeWorkspaceBrowsers = async (id: string): Promise<void> => {
  await Promise.all(
    [...gates.values()].map((gate) =>
      gate
        .forget(id)
        .catch((error: unknown) =>
          console.warn(
            `[browser] ${gate.key}: workspace ${id}'s pages were not closed: ${String(error)}`
          )
        )
    )
  );
};
