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
 * `chrome-untrusted://`, `devtools://`, `file://`), a loopback address
 * other than the hub's own dashboard (dashboard-door.ts) and a hub's
 * preview the agent entered by its `artifact_browse` address, another
 * session's pages,
 * and the methods that speak for every page at once (a browser-level
 * session, tracing or interception at the browser's level). Chromium's
 * tracing records the whole browser whichever page asks, so a page's trace
 * runs in place only while no other workspace has a connection or a page
 * here. Otherwise, and as soon as another workspace arrives while one runs
 * in place, the page is traced in a browser of its own, one per trace
 * (browsers.ts `traceBrowserOf`): a second Chromium its host launches as it
 * launches this one, holding a copy of this one's sign-ins, removed with
 * the copy as the trace ends or its connection does. The agent's calls on
 * the page reach its twin there unchanged ({@link Link}), and the page goes
 * on here where the twin left off. Every page a
 * session owns carries its owner in every document it loads (core
 * `GATED_PAGE_MARK`, defined on the page by the gate's watch as the page
 * becomes the session's, before it first loads anything), and the
 * dashboard names it on its socket: the hub files a session such a page
 * starts from the dashboard as that session's check, nested under it. The
 * mark adds nothing to the page's requests, so a cross-origin fetch it makes
 * is the one it asked for. The shield cuts
 * every connection with {@link SHIELD_CLOSE} and refuses new ones with its
 * sentence until it opens again. A door's pages close as it ends (a
 * workspace's boundary, a session's process), each one's address kept, and
 * open again on those addresses as the door comes back (its browser tool
 * connects again, or its session asks the person about a page): a delegate
 * whose item is reopened in a clone cut again finds the pages it had. A
 * session forgotten for good has its pages closed and nothing kept. A
 * connection holds its browser awake, and one to a browser that sleeps
 * wakes it. A session's
 * connection, while no other session holds one, has a container made again
 * whose preview-name rules the hub's names no longer want (browsers.ts
 * `RulesAt`); while another does, that waits for the last release.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import type { BrowserKey } from "@cawco/core/browser";
import { gatedPageScript } from "@cawco/core/browser-gate";
import { boundedRead } from "@cawco/core/effect/bounded";
import { makeJoin } from "@cawco/core/effect/join";
import { browserGatePort } from "@cawco/core/env-ports";
import { makeFolder } from "@cawco/core/folders";
import { makeKeyedLock, makeLock } from "@cawco/core/keyed-lock";
import { recordLimitReading } from "@cawco/core/limit-readings";
import { machineId } from "@cawco/core/machine-id";
import {
  workspaceProjectFile,
  workspaceStateDir,
} from "@cawco/core/paths/workspace";
import { PREVIEW_ENTER_PATH } from "@cawco/core/preview/routes";
import { readRecord, writeStateFile } from "@cawco/core/state-file";
import {
  MARK_WAIT_WORDS,
  SHIELD_CLOSE_WORDS,
  SHIELD_WORDS,
} from "@cawco/core/words/browser";
import type { Server, ServerWebSocket } from "bun";
import { Deferred, Effect } from "effect";
import { z } from "zod";
import { runFork, runPromise } from "../daemon-runtime";
import { withFeedbackLine } from "../feedback-line";
import { CdpCalls, DevtoolsVersion } from "./cdp-calls";
import { isDashboardOrigin } from "./dashboard-door";
import { browserDir, type TraceBrowser } from "./state";

/** What a refusal says, one sentence each. */
const GATE_WORDS = {
  others: "This page belongs to another session of the project.",
  ownPages: "This browser's own pages are not for agents.",
  loopback:
    'Loopback addresses are closed to agents: open a local server as a preview with artifact_create { kind: "preview", port } (with serve: { command } in a workspace), then load the url artifact_browse { id } answers.',
  signIns:
    "The browser's sign-ins are the project's: use them, never read or clear them. A signed-out test is a new browser context.",
  browser:
    "The project's browser is shared by its sessions: close your own pages, never the browser.",
  wide: "That reaches every page of the project's browser: send it to one of your own pages.",
  flat: "This browser attaches agents in flat sessions only: pass flatten: true.",
  proxy:
    "A proxy is not for agents to set: this browser's network is the project's, so open the page with no proxy of your own.",
  token: "This browser opens to a workspace's own token.",
  none: "No browser is kept for this workspace's project on this machine.",
  ended: "This workspace's boundary ended, and its pages with it.",
  stopped: "The browser stopped.",
} as const;

/** What a trace's refusal says, with why its own browser failed it. */
const TRACE_WORDS = {
  notStarted: (why: string) =>
    `Tracing did not start: another session of the project is in its browser, so the trace needs a browser of its own, and that browser did not start: ${why}`,
  lost: (why: string) =>
    `The trace stopped: another session of the project came to its browser, so the trace moved to a browser of its own, and that browser did not start: ${why}`,
  stopped: "The trace's own browser stopped.",
  noPage: "the page the trace was asked on is not known",
} as const;

/** The close code of a connection the shield cuts. */
const SHIELD_CLOSE = 4423;
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
// No `Emulation.*` call is refused: Playwright sends them as it sets up
// every page, and an agent's override never meets the person's layout, as
// a take-over closes every agent connection first and Chromium drops an
// override with the connection that set it (cdp-takeover.ts).
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
/**
 * The calls that drive a page, as an agent works on the one in front of it:
 * a load, a key or a pointer, a picture or a read of it, bringing it
 * forward. The calls a CDP client makes of every page it attaches to (its
 * domains enabled, its scripts added) are not among them, so a tab that
 * opens and is attached moves nothing. The page a session drove last is
 * the one its browser ask is pinned to ({@link Gate.drivenBy}, shield.ts
 * `askedPage`).
 */
const DRIVES =
  /^(?:Page\.(?:navigate|navigateToHistoryEntry|reload|bringToFront|captureScreenshot)|Input\.\w+|Accessibility\.getFullAXTree|DOM\.setFileInputFiles)$/u;

/** URL schemes of the browser's own pages and the machine's files. */
const OWN_PAGE =
  /^\s*(?:view-source:)?(?:chrome|chrome-untrusted|devtools|file):/iu;

/** The ids the gate gives its own calls on a connection: far above any agent's. */
const GATE_IDS = 2_000_000_000;

/**
 * How long a page's first load, or an agent's navigation of it, waits for
 * the page to carry its owner's mark ({@link Gate.marked}): the watch
 * attaches to a new tab's page within milliseconds.
 */
const MARK_WAIT_MS = 3000;

/** The page a new target opens on, before the gate takes it to the one asked for. */
const BLANK = "about:blank";

/** The addresses a closed page opens again on: a site's, never the browser's own or a blank one. */
const REOPENS = /^https?:\/\//iu;

/** How many doors' closed pages are kept to open again ({@link Gate.restore}): the newest. */
// @limit recording: agent.browser-closed-doors until 2026-12-03
const CLOSED_KEPT = 64;

/** The largest message either side sends: a full-page screenshot runs to megabytes. */
// @limit recording: agent.browser-gate-message-bytes until 2026-12-10
const MAX_MESSAGE = 512 * 1024 * 1024;

type Json = Record<string, unknown>;

const CdpSchema = z.object({
  error: z.object({ code: z.number(), message: z.string() }).optional(),
  id: z.number().optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().optional(),
});
type Cdp = z.infer<typeof CdpSchema>;

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
  typeof value === "object" &&
  value !== null &&
  "targetId" in value &&
  typeof value.targetId === "string" &&
  "type" in value &&
  typeof value.type === "string";

/** A page's navigation history entries, as far as the gate reads them. */
const HistoryEntries = z.array(
  z.object({ id: z.number().optional(), url: z.string().optional() })
);

const text = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Whether `url` opens one of the browser's own pages or a file of the machine. */
const ownPage = (url: unknown): boolean =>
  typeof url === "string" && OWN_PAGE.test(url);

/** IPv4 loopback (127.0.0.0/8) as the URL parser writes it, and its IPv6-mapped form (`::ffff:7f00:0/104`). */
const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u;
const LOOPBACK_MAPPED = /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/u;
/** A fully qualified name's root dot (`localhost.`). */
const TRAILING_DOT = /\.$/u;

/**
 * The origin of `url` when its host is the machine's own loopback
 * (`localhost` and the names under it, 127.0.0.0/8, `::1`, `0.0.0.0`), as
 * the URL parser writes it, so `127.1` and `[0:0::1]` are read as such;
 * undefined for any other address.
 */
const loopbackOrigin = (url: unknown): string | undefined => {
  if (typeof url !== "string" || !URL.canParse(url)) {
    return;
  }
  const parsed = new URL(url);
  const host = parsed.hostname.toLowerCase().replace(TRAILING_DOT, "");
  const loopback =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    LOOPBACK_V4.test(host) ||
    LOOPBACK_MAPPED.test(host);
  return loopback ? parsed.origin : undefined;
};

const said = (data: string | Buffer): string => {
  recordLimitReading("agent.browser-gate-message-bytes", data.length);
  return typeof data === "string" ? data : data.toString("utf8");
};

const parse = (data: string): Cdp | undefined => {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    value = undefined;
  }
  const message = CdpSchema.safeParse(value);
  return message.success ? message.data : undefined;
};

/** A filter as given, or Chromium's own when none was. */
const filterOf = (given: unknown): Filter[] =>
  isFilter(given) ? given : DEFAULT_FILTER;

const CUT_CHARACTER = /�+$/u;
const BEARER = /^Bearer (\S+)$/u;

/** A close reason as a WebSocket carries it: 123 bytes at most. */
const reason = (why: string): string => {
  const bytes = Buffer.from(why);
  // @limit external: WebSocket close reason: 123 bytes, a control frame's 125-byte payload less the 2-byte code (RFC 6455 section 5.5.1)
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
  await makeFolder(workspaceStateDir(id));
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
  const project = await readRecord(workspaceProjectFile(id), z.string()).catch(
    () => undefined
  );
  return project ? `project:${project}` : `machine:${machine}`;
};

const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

// ---------------------------------------------------------------------------
// One CDP connection to Chromium

/** The gate's own calls on a connection to Chromium, beside the agent's: numbered from {@link GATE_IDS}. */
const gateCalls = (socket: WebSocket): CdpCalls =>
  new CdpCalls((line) => socket.send(line), GATE_IDS);

/** Settles one of the gate's own calls with `message`; false for anything else. */
const answered = (calls: CdpCalls, message: Cdp): boolean => {
  if (typeof message.id !== "number" || message.id < GATE_IDS) {
    return false;
  }
  calls.settle(message.id, message);
  return true;
};

/** The browser-wide socket the Chromium whose DevTools answer at `base` (`http://127.0.0.1:<port>`) names. */
const socketOf = async (base: string, what: string): Promise<string> => {
  const read = await readWithin(10_000, (signal) =>
    fetch(`${base}/json/version`, { signal }).then(async (response) =>
      DevtoolsVersion.parse(await response.json())
    )
  );
  const url =
    read.kind === "answered" ? read.value.webSocketDebuggerUrl : undefined;
  if (!url) {
    throw new Error(`${what}'s DevTools did not answer at ${base}.`);
  }
  return url;
};

/** A connection to Chromium at `url`, once it is open. */
const dial = (url: string): Promise<WebSocket> =>
  runPromise(
    Effect.callback<WebSocket, Error>((resume) => {
      const socket = new WebSocket(url);
      socket.onopen = () => resume(Effect.succeed(socket));
      socket.onerror = () =>
        resume(Effect.fail(new Error(`${url} did not open.`)));
      socket.onclose = () =>
        resume(Effect.fail(new Error(`${url} closed as it opened.`)));
    })
  );

/** A connection to Chromium at `url` that carries the gate's own calls alone, for a few calls and closed after. */
const dialCalls = async (
  url: string
): Promise<{ calls: CdpCalls; socket: WebSocket }> => {
  const socket = await dial(url);
  const calls = gateCalls(socket);
  socket.onmessage = (event) => {
    const message = parse(said(event.data));
    if (message) {
      answered(calls, message);
    }
  };
  socket.onclose = () => calls.fail(GATE_WORDS.stopped);
  return { calls, socket };
};

// ---------------------------------------------------------------------------
// The gate

/** What the registry gives a browser's gate. */
export interface GateDeps {
  /**
   * Chromium's DevTools address: with `wake`, the browser started or woken
   * first, `alone` when no other session holds a connection to it (a
   * session's acquisition may then make it again, browsers.ts `RulesAt`);
   * without, undefined while it does not run.
   */
  devtools: (wake: boolean, alone: boolean) => Promise<string | undefined>;
  key: BrowserKey;
  /**
   * A browser of its own for one trace (browsers.ts `traceBrowserOf`),
   * launched as this one is and holding a copy of its sign-ins: a trace
   * records every page of the browser it runs in.
   */
  traceBrowser: () => Promise<TraceBrowser>;
  /** Called as the first connection opens (`true`) and the last closes (`false`). */
  used: (held: boolean) => void;
}

/** Who owns what, as kept in the browser's dir. */
const OwnersSchema = z.object({
  /**
   * The pages each door had open as it ended, by its id ({@link Gate.forget}):
   * their addresses in the order it opened them, the one it drove last
   * last, and when, kept until it comes back ({@link Gate.restore}).
   */
  closed: z
    .record(
      z.string(),
      z.object({ at: z.number(), pages: z.array(z.string()) })
    )
    .default({}),
  /**
   * The address each owned page was last seen on, by its target id: what it
   * opens again on once it is gone with its door's end or with its
   * browser's run (a sleep, a container made again, a crash).
   */
  addresses: z.record(z.string(), z.string()).default({}),
  contexts: z.record(z.string(), z.string()),
  targets: z.record(z.string(), z.string()),
});
type Owners = z.infer<typeof OwnersSchema>;

interface LinkData {
  link: Link;
}

/** The gate's watching connection: every tab attached, to learn the page each holds. */
interface Watch {
  /** Set as the gate lets it go, perhaps before it has opened. */
  done: boolean;
  ready: Promise<void>;
  socket?: WebSocket;
  /** The gate's calls on it, once it is open: a page's mark goes on its session here. */
  wire?: CdpCalls;
}

export class Gate {
  readonly #deps: GateDeps;
  readonly #links = new Set<Link>();
  #closedWhy: string | undefined;
  #owners: Owners = { addresses: {}, closed: {}, contexts: {}, targets: {} };
  #loaded: Promise<void> | undefined;
  readonly #saving = makeLock();
  readonly #infos = new Map<string, TargetInfo>();
  readonly #tabPage = new Map<string, string>();
  readonly #tabSessions = new Map<string, string>();
  readonly #windows = new Map<number, string>();
  /** Each page's session on the watch, by the page's target id. */
  readonly #pageSessions = new Map<string, string>();
  /**
   * Each page marked with its owner (or being), done as the call that
   * marks it landed or failed, and the script that marks its documents
   * once that call has landed.
   */
  readonly #marks = new Map<
    string,
    { landed: Deferred.Deferred<void>; owner: string; script?: string }
  >();
  /** Each page's marks one at a time, in the order asked: a mark's script goes once the one before it landed. */
  readonly #markTurns = makeKeyedLock<string>();
  /** The next mark of a page none is under way for, done as it lands, fails, or the page goes: what waits for it. */
  readonly #markWaits = new Map<string, Deferred.Deferred<void>>();
  /** The page each workspace drove last ({@link DRIVES}), by its id: the one a browser ask is pinned to. */
  readonly #driven = new Map<string, string>();
  /** Each door's closed pages opening again ({@link restore}), by its id: one at a time. */
  readonly #restoring = makeJoin<string, void>();
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

  /**
   * The shield: every connection cut with {@link SHIELD_CLOSE} and the
   * close's short sentence (core `SHIELD_CLOSE_WORDS`, whole in a close's
   * 123 bytes), and every new one refused with the owner's words whole
   * (core `SHIELD_WORDS`, the 423's body), which a tool reads as it
   * connects again.
   */
  closeAll(): void {
    this.#closedWhy = SHIELD_WORDS;
    for (const link of this.#links) {
      link.close(SHIELD_CLOSE, SHIELD_CLOSE_WORDS);
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

  /** Workspace `id` drove page `targetId`: told by its connection ({@link DRIVES}). */
  drove(id: string, targetId: string): void {
    this.#driven.set(id, targetId);
  }

  /** The page workspace `id` drove last, while this daemon has heard it drive one. */
  drivenBy(id: string): string | undefined {
    return this.#driven.get(id);
  }

  /**
   * Door `id` ended (a workspace's boundary, a session's process): its
   * connections are cut, its pages closed and its contexts disposed where
   * the browser runs, and it owns nothing here any more. With `keep`, the
   * address of each page it had is kept, so its pages open again as it
   * comes back ({@link restore}); without, they are gone for good. A
   * browser that does not run now closes nothing, and the addresses its
   * pages were last seen on are kept.
   */
  async forget(id: string, keep: boolean): Promise<void> {
    await this.#load();
    const driven = this.#driven.get(id);
    this.#driven.delete(id);
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
    if (!keep) {
      delete this.#owners.closed[id];
    }
    if (targets.length === 0 && contexts.length === 0) {
      this.#save();
      return;
    }
    const url = await this.#browserUrl(false).catch(() => undefined);
    const wired = url ? await dialCalls(url) : undefined;
    try {
      const at = wired ? await this.#listed(wired.calls) : new Map();
      if (keep) {
        this.#keepClosed(id, this.#pagesOf(targets, driven, at));
      }
      for (const target of targets) {
        delete this.#owners.targets[target];
        delete this.#owners.addresses[target];
      }
      for (const context of contexts) {
        delete this.#owners.contexts[context];
      }
      this.#save();
      // A tab's page closes with it: the pages alone are named.
      await Promise.allSettled([
        ...targets.map((targetId) =>
          wired?.calls.call("Target.closeTarget", { targetId })
        ),
        ...contexts.map((browserContextId) =>
          wired?.calls.call("Target.disposeBrowserContext", {
            browserContextId,
          })
        ),
      ]);
    } finally {
      wired?.socket.close();
    }
    console.info(
      `[browser] ${this.key}: ${id} ended: ${targets.length} page(s) and ${contexts.length} context(s) of its closed${keep ? `, ${this.#owners.closed[id]?.pages.length ?? 0} kept to open again` : ""}`
    );
  }

  /** Every target the browser has now, by its id, with the address it is on. */
  async #listed(wire: CdpCalls): Promise<Map<string, string>> {
    const listed = await wire
      .call("Target.getTargets", {})
      .catch((): Json => ({}));
    return new Map(
      (Array.isArray(listed.targetInfos) ? listed.targetInfos : [])
        .filter(isInfo)
        .map((info) => [info.targetId, info.url ?? ""])
    );
  }

  /**
   * The addresses `targets` open again on: each as the browser has it now
   * (`at`), else as it was last seen; a site's alone, in the order they
   * were opened and the one driven last last, the one a browser ask of
   * their door's is pinned to as they open again.
   */
  #pagesOf(
    targets: readonly string[],
    driven: string | undefined,
    at: ReadonlyMap<string, string>
  ): string[] {
    return [
      ...targets.filter((target) => target !== driven),
      ...targets.filter((target) => target === driven),
    ]
      .map((target) => at.get(target) || this.#owners.addresses[target] || "")
      .filter((page) => REOPENS.test(page));
  }

  /** Door `id`'s closed pages kept after any it still had kept, the newest {@link CLOSED_KEPT} doors' alone. */
  #keepClosed(id: string, pages: string[]): void {
    const before = this.#owners.closed[id]?.pages ?? [];
    delete this.#owners.closed[id];
    if (before.length + pages.length === 0) {
      return;
    }
    this.#owners.closed[id] = { at: Date.now(), pages: [...before, ...pages] };
    const kept = Object.entries(this.#owners.closed).sort(
      ([, a], [, b]) => b.at - a.at
    );
    recordLimitReading("agent.browser-closed-doors", kept.length);
    for (const [old] of kept.slice(CLOSED_KEPT)) {
      delete this.#owners.closed[old];
    }
  }

  /**
   * Owned pages the browser no longer has (`present` is what it has now)
   * are gone with an earlier run of it (a sleep, a container made again, a
   * crash): each door's are kept to open again as its own closed pages
   * are ({@link restore}), and it owns them no longer.
   */
  #goneWithRun(present: ReadonlySet<string>): void {
    const gone = new Map<string, string[]>();
    for (const [target, owner] of Object.entries(this.#owners.targets)) {
      if (!present.has(target)) {
        gone.set(owner, [...(gone.get(owner) ?? []), target]);
      }
    }
    if (gone.size === 0) {
      return;
    }
    for (const [owner, targets] of gone) {
      this.#keepClosed(
        owner,
        this.#pagesOf(targets, this.#driven.get(owner), new Map())
      );
      this.#driven.delete(owner);
      for (const target of targets) {
        delete this.#owners.targets[target];
        delete this.#owners.addresses[target];
      }
    }
    this.#save();
  }

  /** Owned page `targetId` is on `url` now: the address it opens again on. */
  #seenOn(targetId: string, url: string | undefined): void {
    if (
      url &&
      REOPENS.test(url) &&
      this.#owners.targets[targetId] &&
      this.#owners.addresses[targetId] !== url
    ) {
      this.#owners.addresses[targetId] = url;
      this.#save();
    }
  }

  /** Whether no door but `id` holds a connection: a wake for it may make its container again (browsers.ts `RulesAt`). */
  #alone(id: string): boolean {
    return ![...this.#links].some((link) => link.workspace !== id);
  }

  /**
   * The browser woken for door `id`, as its browser tool's connection
   * wakes it ({@link attachLink}): started, or woken from its sleep, and
   * answered once it runs. Throws why it does not.
   */
  async wake(id: string): Promise<void> {
    await this.#browserUrl(true, this.#alone(id));
  }

  /**
   * Door `id` came back (its browser tool connects, or its session asks the
   * person about a page, shield.ts `askedPage`): the pages it had as it
   * ended ({@link forget}), or as its browser's last run ended, open again
   * as its own, each a window of its own on the address it was on, and the
   * one it drove last is the one it drives. Kept while the browser does not
   * run, for its next coming back. Resolves once they are open and kept as
   * its.
   */
  restore(id: string): Promise<void> {
    return this.#restoring.runPromise(id, () => this.#reopen(id));
  }

  async #reopen(id: string): Promise<void> {
    await this.#load();
    const url = await this.#browserUrl(false).catch(() => undefined);
    if (!url) {
      return;
    }
    const opened: { page: string; targetId: string }[] = [];
    const { calls: wire, socket } = await dialCalls(url);
    let kept: { at: number; pages: string[] } | undefined;
    try {
      this.#goneWithRun(new Set((await this.#listed(wire)).keys()));
      kept = this.#owners.closed[id];
      if (!kept) {
        return;
      }
      delete this.#owners.closed[id];
      this.#save();
      for (const page of kept.pages) {
        const made = await wire
          .call("Target.createTarget", { url: BLANK, newWindow: true })
          .catch((): Json => ({}));
        const targetId = text(made.targetId);
        if (targetId) {
          this.own(targetId, id);
          opened.push({ page, targetId });
        }
      }
    } finally {
      socket.close();
    }
    // Opened blank and taken there once marked, as an agent's own new page.
    await Promise.allSettled(
      opened.map(({ page, targetId }) => this.load(targetId, page))
    );
    const last = opened.at(-1);
    if (last) {
      this.drove(id, last.targetId);
    }
    // Once the saves asked for so far have landed: a turn of its own, empty, behind them.
    await this.#saving.run(() => Promise.resolve());
    console.info(
      `[browser] ${this.key}: ${id} came back: ${opened.length} of its ${kept.pages.length} page(s) open again`
    );
  }

  /** A connection of gate id `id`, or why the shield refuses it now. */
  admit(id: string): Link | string {
    return this.#closedWhy ?? new Link(this, id);
  }

  /** Chromium's browser connection URL, the browser woken first when `wake` (`alone`: no other session holds it). */
  async #browserUrl(wake: boolean, alone = false): Promise<string> {
    const base = await this.#deps.devtools(wake, alone);
    if (!base) {
      throw new Error(`${this.key} does not run.`);
    }
    return socketOf(base, this.key);
  }

  /** A browser of its own for one trace of a page here ({@link GateDeps.traceBrowser}). */
  traceBrowser(): Promise<TraceBrowser> {
    return this.#deps.traceBrowser();
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
    const url = await this.#browserUrl(true, this.#alone(link.workspace));
    await this.#watching(url);
    // Its pages from before it last ended, open again before it lists any.
    await this.restore(link.workspace).catch((error: unknown) =>
      console.warn(
        `[browser] ${this.key}: ${link.workspace}'s pages did not open again: ${String(error)}`
      )
    );
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
    this.#loaded ??= readRecord(this.#ownersFile(), OwnersSchema)
      .then((kept) => {
        if (kept) {
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
    this.#saving
      .run(() => writeStateFile(this.#ownersFile(), body, { mode: 0o600 }))
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
    this.#mark(targetId);
  }

  /**
   * Marks every document page `page` loads from now on, the one it holds
   * included, as its owner's (core `gatedPageScript`), on the watch's
   * session of it, once the page is owned and the watch holds it: an earlier
   * owner's mark goes as this one lands. Whatever waits for the mark goes on
   * as it lands, or fails. Nothing is put on the page's requests.
   */
  #mark(page: string): void {
    const owner = this.ownerOf(page);
    const session = this.#pageSessions.get(page);
    const wire = this.#watch?.wire;
    const before = this.#marks.get(page);
    if (!(owner && session && wire) || before?.owner === owner) {
      return;
    }
    const mark: {
      landed: Deferred.Deferred<void>;
      owner: string;
      script?: string;
    } = { owner, landed: Deferred.makeUnsafe<void>() };
    this.#marks.set(page, mark);
    const marking = Effect.gen(function* () {
      // A page's documents are told of scripts only while its Page domain is on.
      yield* wire.request("Page.enable", {}, session);
      if (before?.script) {
        yield* wire.request(
          "Page.removeScriptToEvaluateOnNewDocument",
          { identifier: before.script },
          session
        );
      }
      const added = yield* wire.request(
        "Page.addScriptToEvaluateOnNewDocument",
        { source: gatedPageScript(owner), runImmediately: true },
        session
      );
      mark.script = text(added.identifier);
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning(
          `[browser] ${this.key}: page ${page} of ${owner} was not marked as its: ${error._tag === "Gone" ? error.what : error.message}`
        )
      ),
      Effect.ensuring(
        Effect.sync(() => {
          this.#markWaited(page);
          Deferred.doneUnsafe(mark.landed, Effect.void);
        })
      )
    );
    // Work let go: whatever waits for the mark waits on `landed`.
    runFork(this.#markTurns.withLock(page, marking));
  }

  /** What waited for page `page`'s next mark goes on. */
  #markWaited(page: string): void {
    const waiting = this.#markWaits.get(page);
    this.#markWaits.delete(page);
    if (waiting) {
      Deferred.doneUnsafe(waiting, Effect.void);
    }
  }

  /**
   * Whether page `page` carries its owner's mark ({@link #mark}) within `ms`:
   * a load waits for it, never past that, and does not go without it.
   */
  marked(page: string, ms = MARK_WAIT_MS): Promise<boolean> {
    // The promise edge of the wait for a page's mark.
    return runPromise(
      boundedRead(ms, this.#markOf(page)).pipe(
        Effect.as(true),
        Effect.catchTag("Unanswered", () => Effect.succeed(false))
      )
    );
  }

  /** Page `page`'s mark landing: the one under way, else the next one. */
  #markOf(page: string): Effect.Effect<void> {
    const held = this.#marks.get(page);
    if (held) {
      return Deferred.await(held.landed);
    }
    let next = this.#markWaits.get(page);
    if (!next) {
      next = Deferred.makeUnsafe<void>();
      this.#markWaits.set(page, next);
    }
    return Deferred.await(next);
  }

  /**
   * Takes a page an agent opened on {@link BLANK} to the address it asked
   * for, once the page carries its owner's mark: its first document is
   * marked, so the dashboard it may load names its owner on its socket.
   * Without the mark in time it throws and the page stays blank.
   */
  async load(page: string, url: string): Promise<void> {
    this.#seenOn(page, url);
    if (!(await this.marked(page))) {
      throw new Error(MARK_WAIT_WORDS);
    }
    const session = this.#pageSessions.get(page);
    const wire = this.#watch?.wire;
    if (session && wire) {
      await wire.call("Page.navigate", { url }, session);
      return;
    }
    const browser = await this.#browserUrl(false);
    const { calls: once, socket } = await dialCalls(browser);
    try {
      const attached = await once.call("Target.attachToTarget", {
        targetId: page,
        flatten: true,
      });
      const sessionId = text(attached.sessionId);
      if (sessionId) {
        await once.call("Page.navigate", { url }, sessionId);
      }
    } finally {
      socket.close();
    }
  }

  /**
   * Whether a workspace other than `id` holds a connection or a live page
   * here. Chromium's tracing is the whole browser's, whichever page asks:
   * a trace here would record that workspace's pages, so it runs in a
   * browser of its own.
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

  /** Workspace `id` came to the browser (a connection, a page): every other workspace's trace running here moves to a browser of its own. */
  #arrived(id: string): void {
    for (const link of this.#links) {
      if (link.workspace !== id) {
        link.moveTraces();
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
    this.#seenOn(info.targetId, info.url);
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
    this.#pageSessions.delete(targetId);
    this.#marks.delete(targetId);
    this.#markWaited(targetId);
    if (this.#owners.targets[targetId]) {
      delete this.#owners.targets[targetId];
      delete this.#owners.addresses[targetId];
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
    this.#mark(page);
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
      const wire = gateCalls(socket);
      watch.wire = wire;
      socket.onmessage = (event) => {
        const message = parse(said(event.data));
        if (message && !answered(wire, message)) {
          this.#watched(message, wire, tabsAttached);
        }
      };
      socket.onclose = () => {
        wire.fail(GATE_WORDS.stopped);
        if (this.#watch === watch) {
          this.#watch = undefined;
          this.#tabSessions.clear();
          // A mark lives on the watch's session of its page: gone with it,
          // and put on again as the next watch attaches.
          this.#pageSessions.clear();
          this.#marks.clear();
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
      // Pages of an earlier run of the browser are gone with it, kept to
      // open again as their doors come back.
      this.#goneWithRun(new Set(this.#infos.keys()));
    })();
    watch.ready.catch(() => {
      if (this.#watch === watch) {
        this.#watch = undefined;
      }
    });
    return watch;
  }

  #watched(
    message: Cdp,
    wire: CdpCalls,
    tabsAttached: Promise<unknown>[]
  ): void {
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
    wire: CdpCalls,
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
      this.#pageSessions.set(info.targetId, session);
      this.learn(info);
      this.#holds(tab, info.targetId);
    }
  }

  #unwatch(): void {
    const watch = this.#watch;
    this.#watch = undefined;
    this.#tabSessions.clear();
    this.#pageSessions.clear();
    this.#marks.clear();
    if (watch) {
      // One still opening closes as it opens.
      watch.done = true;
      watch.socket?.close();
    }
  }
}

// ---------------------------------------------------------------------------
// A page traced in a browser of its own

/**
 * A call that sets how a session behaves, kept so a twin's session is set
 * up alike ({@link Link}): a domain turned on or off, or a setting, a script,
 * a binding or a breakpoint made or taken away, in the domains that keep
 * them for the session rather than for one document.
 */
const STATE =
  /^(?:\w+\.(?:enable|disable)|(?:Page|Network|Fetch|Emulation|Runtime|Target|Security|Debugger|DOMDebugger|Log|Audits|Performance|Animation)\.(?:set|add|remove|emulate|clear|override)\w*)$/u;
/** Of those, the calls that change one document or script, gone with the page that held it. */
const NOT_STATE = new Set([
  "Page.setDocumentContent",
  "Debugger.setBreakpoint",
  "Debugger.setBreakpointOnFunctionCall",
  "Debugger.setReturnValue",
  "Debugger.setScriptSource",
  "Debugger.setVariableValue",
]);
/** A state call that adds one thing of many, kept by what it adds; any other keeps one setting, its last call. */
const ADDS = /\.(?:add\w*|set\w*Breakpoint\w*)$/u;
/** A state call that takes away what an add made, named by the handle the add was answered with. */
const REMOVES = /\.remove\w*$/u;

/** A domain's turning on or off, and a setting's verb (`setCacheDisabled`, `clearGeolocationOverride`): what a call's key leaves out. */
const TOGGLES = /^(?:enable|disable)$/u;
const SETTING_VERB = /^(?:set|clear|emulate|override)|Override$/gu;

/**
 * What a state call is kept under: a domain's on or off one key, a setting
 * one key whatever sets or clears it, an add or a remove one of its own.
 */
const stateKey = (method: string, params: Json): string => {
  const [domain = "", name = ""] = method.split(".");
  if (TOGGLES.test(name)) {
    return `${domain}.on`;
  }
  if (ADDS.test(method) || REMOVES.test(method)) {
    return `${method} ${JSON.stringify(params)}`;
  }
  return `${domain}.${name.replace(SETTING_VERB, "")}`;
};

/** One state call kept, and the handle its answer named when it adds. */
interface StateCall {
  handle?: string;
  method: string;
  params: Json;
}

/** The handle an add's answer names: a script's identifier, a breakpoint's id. */
const handleOf = (result: Json): string | undefined =>
  text(result.identifier) ?? text(result.breakpointId);

/** A remove's params with each handle it names as `handles` has it in the other browser. */
const handlesIn = (params: Json, handles: ReadonlyMap<string, string>): Json =>
  Object.fromEntries(
    Object.entries(params).map(([key, value]) => [
      key,
      typeof value === "string" ? (handles.get(value) ?? value) : value,
    ])
  );

/** `data` with each id of `pairs` written as its pair: Chromium's ids are 32 hex digits, each its own. */
const swapped = (data: string, pairs: Iterable<readonly [string, string]>) => {
  let out = data;
  for (const [from, to] of pairs) {
    out = out.replaceAll(from, to);
  }
  return out;
};

/**
 * One of the agent's pages traced in a browser of its own: its twin there,
 * a page of that browser opened on the address the page is on, and a
 * session there for each of the agent's sessions on the page, set up with
 * the state calls the agent made on it ({@link STATE}). While the twin
 * stands for the page, every call the agent makes on those sessions goes to
 * the twin, its target, session and frame ids written as the twin's, and
 * what the twin says comes back written as the page's; a state call goes to
 * the page here too, so the page is set as the agent set it when it goes
 * on. Its frames' and workers' sessions are the twin's own, passed as they
 * are.
 */
interface Twin {
  /** Each twin session's agent session. */
  readonly agents: Map<string, string>;
  browser?: TraceBrowser;
  /** Each session of the twin's own frames and workers, and the session it was attached under. */
  readonly children: Map<string, string>;
  /** The agent's IO.close of the trace's stream: once answered, the trace is done. */
  closing?: number;
  ended: boolean;
  /** Each handle the agent's adds were answered with here, as the trace's browser has it. */
  readonly handles: Map<string, string>;
  /** Whether the twin stands for the page: what this browser says of the page's sessions is dropped. */
  live: boolean;
  /** The agent's page, in this browser. */
  readonly page: string;
  /** The agent's calls sent to the twin and not answered yet, and the session each was on. */
  readonly pending: Map<number, string | undefined>;
  /** The agent's IO.read calls to the twin: their data passes as it came. */
  readonly reads: Set<number>;
  /** Done once the twin stands for the page, with why when it never will. */
  readonly ready: Deferred.Deferred<string | undefined>;
  /** Each of the agent's sessions of the page, and its twin's session. */
  readonly sessions: Map<string, string>;
  socket?: WebSocket;
  /** The agent's call that starts the trace in the twin: its refusal ends the twin. */
  start?: number;
  /** The trace's data stream, as `Tracing.tracingComplete` named it. */
  stream?: string;
  /** The page's twin, in the trace's browser. */
  twin?: string;
  wire?: CdpCalls;
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
  #wire: CdpCalls | undefined;
  #queue: string[] = [];
  readonly #chain = makeLock();
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
  /** The target each of the agent's sessions is attached to. */
  readonly #sessionTargets = new Map<string, string>();
  /**
   * The address each of the agent's `Target.createTarget` calls asked for,
   * by call: the page opens blank, and goes there once it is marked.
   */
  readonly #goes = new Map<number, string>();
  /** The agent's calls whose answers the gate reads or narrows. */
  readonly #asked = new Map<number, Cdp>();
  /** The session each of the agent's sessions was attached under: a page's under its tab, a frame's under its page. */
  readonly #parents = new Map<string, string>();
  /** Each of the agent's sessions' state calls ({@link STATE}), in the order last made: what a twin's session is set up with. */
  readonly #states = new Map<string, Map<string, StateCall>>();
  /** The agent's adds sent here, by call id: the handle each answer names is kept with it. */
  readonly #stateAsked = new Map<number, StateCall>();
  /** The sessions the agent traces on in place, and the params it started each with. */
  readonly #tracing = new Map<string, Json>();
  /** Sessions whose trace in place the gate ended as another workspace came: what this browser recorded is dropped unread. */
  readonly #dropTrace = new Set<string>();
  /** Sessions whose trace was moving to a browser of its own as that browser failed, and why: their `Tracing.end` is refused with it. */
  readonly #lost = new Map<string, string>();
  /** Each of the agent's pages traced in a browser of its own, by its target id. */
  readonly #twins = new Map<string, Twin>();
  /** The twin each of the agent's sessions goes through while its page is traced there. */
  readonly #routed = new Map<string, Twin>();
  /** Loopback origins the agent entered by an `artifact_browse` address: the hub's previews there, which it loads again by any path. */
  readonly #entered = new Set<string>();

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
        this.#wire = gateCalls(up);
        up.onmessage = (event) => this.#fromBrowser(said(event.data));
        up.onclose = () => {
          this.#wire?.fail(GATE_WORDS.stopped);
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
    this.#twinsDown();
  }

  close(code: number, why: string): void {
    const socket = this.#socket;
    this.#socket = undefined;
    socket?.close(code, reason(why));
    this.#up?.close();
    this.#gate.detachLink(this);
    this.#twinsDown();
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
    this.#chain
      .run(() => this.#fromAgent(data))
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
    const why = await this.#refusal(message);
    if (why) {
      // A refusal of what the agent asked, so it can say CawCo was wrong.
      this.#refuse(message, withFeedbackLine(why));
      return;
    }
    const kept = this.#record(message);
    const { sessionId } = message;
    let twin = sessionId ? this.#routed.get(sessionId) : undefined;
    if (twin) {
      // Behind the twin standing up: a twin that never stands leaves its
      // sessions here.
      await runPromise(Deferred.await(twin.ready));
      twin = sessionId ? this.#routed.get(sessionId) : undefined;
    }
    if (twin) {
      await this.#throughTwin(twin, message, kept);
      return;
    }
    if (sessionId && (await this.#traced(message))) {
      return;
    }
    if (!sessionId && (await this.#answeredHere(message))) {
      return;
    }
    // A load of one of its pages goes once the page carries its owner's
    // mark (Gate `marked`), so the page's first document is marked.
    const target =
      message.method === "Page.navigate" && message.sessionId
        ? this.#sessionTargets.get(message.sessionId)
        : undefined;
    if (target && !(await this.#gate.marked(target))) {
      this.#refuse(message, MARK_WAIT_WORDS);
      return;
    }
    this.#up?.send(JSON.stringify(message));
    const driven = this.#drives(message);
    if (driven) {
      this.#gate.drove(this.workspace, driven);
    }
  }

  /** The page `message` drives ({@link DRIVES}), when it drives one. */
  #drives(message: Cdp): string | undefined {
    const method = message.method ?? "";
    if (!message.sessionId) {
      return method === "Target.activateTarget"
        ? text(message.params?.targetId)
        : undefined;
    }
    return DRIVES.test(method)
      ? this.#sessionTargets.get(message.sessionId)
      : undefined;
  }

  /**
   * Keeps each of the agent's sessions' state calls ({@link STATE}): the last
   * of each setting and every add not taken away, each where its key was
   * first made, so a setting a domain needs stays after the domain's turning
   * on as the agent made them. Answers the call kept, whose answer's handle
   * is kept with it.
   */
  #record(message: Cdp): StateCall | undefined {
    const { method = "", params = {}, sessionId } = message;
    if (!(sessionId && STATE.test(method)) || NOT_STATE.has(method)) {
      return;
    }
    let calls = this.#states.get(sessionId);
    if (!calls) {
      calls = new Map();
      this.#states.set(sessionId, calls);
    }
    if (REMOVES.test(method)) {
      const named = new Set(Object.values(params));
      for (const [key, call] of calls) {
        if (call.handle && named.has(call.handle)) {
          calls.delete(key);
          return;
        }
      }
    }
    const call: StateCall = { method, params };
    calls.set(stateKey(method, params), call);
    if (ADDS.test(method)) {
      this.#stateAsked.set(message.id ?? 0, call);
    }
    return call;
  }

  /** The agent's page session `session` is, or is under. */
  #pageOf(session: string): string | undefined {
    let at: string | undefined = session;
    while (at) {
      const target = this.#sessionTargets.get(at);
      if (target && this.#gate.info(target)?.type === "page") {
        return target;
      }
      at = this.#parents.get(at);
    }
  }

  /** The twin standing for the page session `session` is of, or is under, when one does. */
  #twinAbove(session: string): Twin | undefined {
    let at: string | undefined = session;
    while (at) {
      const twin = this.#routed.get(at);
      if (twin) {
        return twin;
      }
      at = this.#parents.get(at);
    }
  }

  /**
   * A trace the agent starts or ends on one of its sessions: in place while
   * no other workspace is in the browser ({@link Gate.shared}), else in a
   * browser of its own ({@link #twinUp}); the end of one whose move failed
   * is refused with why. True when it was answered here.
   */
  async #traced(message: Cdp): Promise<boolean> {
    const session = message.sessionId ?? "";
    if (message.method === "Tracing.start") {
      this.#lost.delete(session);
      if (!this.#gate.shared(this.workspace)) {
        this.#tracing.set(session, message.params ?? {});
        return false;
      }
      const page = this.#pageOf(session);
      const why = page ? await this.#twinUp(page) : TRACE_WORDS.noPage;
      const twin = page ? this.#twins.get(page) : undefined;
      if (why || !twin) {
        this.#refuse(
          message,
          withFeedbackLine(TRACE_WORDS.notStarted(why ?? TRACE_WORDS.stopped))
        );
        return true;
      }
      await this.#throughTwin(twin, message, undefined);
      return true;
    }
    if (message.method === "Tracing.end") {
      const lost = this.#lost.get(session);
      if (lost) {
        this.#lost.delete(session);
        this.#refuse(message, withFeedbackLine(TRACE_WORDS.lost(lost)));
        return true;
      }
      this.#tracing.delete(session);
    }
    return false;
  }

  /**
   * Another workspace came to the browser: each trace of this agent's
   * running in place ends here, what it recorded dropped unread, and goes
   * on in a browser of its own, started again there with the params the
   * agent gave it once the page's twin has loaded the page.
   */
  moveTraces(): void {
    for (const [session, params] of this.#tracing) {
      this.#tracing.delete(session);
      this.#dropTrace.add(session);
      this.#wire?.post("Tracing.end", {}, session);
      const page = this.#pageOf(session);
      if (!page) {
        this.#lost.set(session, TRACE_WORDS.noPage);
        continue;
      }
      console.info(
        `[browser] ${this.#gate.key}: workspace ${this.workspace}'s trace moves to a browser of its own: another session of the project came to the browser`
      );
      // Work let go: the agent's calls on the page wait on the twin's `ready`.
      this.#twinUp(page, { params, session }).catch((error: unknown) =>
        console.warn(
          `[browser] ${this.#gate.key}: workspace ${this.workspace}'s trace did not move: ${String(error)}`
        )
      );
    }
  }

  /**
   * Page `page` traced in a browser of its own ({@link Twin}): every
   * session of the agent's on it goes through the twin from now, and its
   * calls wait until the twin stands. With `restart`, the trace that ran
   * here on that session starts again there with its params. Answers why
   * it did not stand, its sessions left here and the browser removed.
   */
  async #twinUp(
    page: string,
    restart?: { params: Json; session: string }
  ): Promise<string | undefined> {
    const twin: Twin = {
      agents: new Map(),
      children: new Map(),
      ended: false,
      handles: new Map(),
      live: false,
      page,
      pending: new Map(),
      reads: new Set(),
      ready: Deferred.makeUnsafe<string | undefined>(),
      sessions: new Map(),
    };
    this.#twins.set(page, twin);
    const sessions = [...this.#sessionTargets]
      .filter(([, target]) => target === page)
      .map(([session]) => session);
    for (const session of sessions) {
      this.#routed.set(session, twin);
    }
    try {
      await this.#twinStand(twin, sessions, restart);
      Deferred.doneUnsafe(twin.ready, Effect.succeed(undefined));
      console.info(
        `[browser] ${this.#gate.key}: workspace ${this.workspace}'s page ${page} is traced in a browser of its own, as ${twin.twin}`
      );
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      if (restart) {
        this.#lost.set(restart.session, why);
      }
      await this.#twinDown(twin);
      Deferred.doneUnsafe(twin.ready, Effect.succeed(why));
      console.warn(
        `[browser] ${this.#gate.key}: workspace ${this.workspace}'s page ${page} got no browser of its own to trace in: ${why}`
      );
      return why;
    }
  }

  /** The twin of `twin`'s page made and set up: the browser, its page on the page's address, and a session there for each of `sessions`. */
  async #twinStand(
    twin: Twin,
    sessions: readonly string[],
    restart: { params: Json; session: string } | undefined
  ): Promise<void> {
    const browser = await this.#gate.traceBrowser();
    twin.browser = browser;
    if (twin.ended) {
      await browser.close();
      throw new Error(GATE_WORDS.stopped);
    }
    const socket = await dial(
      await socketOf(browser.devtools, "The trace's browser")
    );
    twin.socket = socket;
    const wire = gateCalls(socket);
    twin.wire = wire;
    socket.onmessage = (event) => this.#fromTwin(twin, said(event.data));
    socket.onclose = () => {
      wire.fail(TRACE_WORDS.stopped);
      this.#letTwinGo(twin);
    };
    if (twin.ended) {
      socket.close();
      throw new Error(GATE_WORDS.stopped);
    }
    const made = await wire.call("Target.createTarget", { url: BLANK });
    twin.twin = text(made.targetId);
    const own = text(
      (
        await wire.call("Target.attachToTarget", {
          targetId: twin.twin,
          flatten: true,
        })
      ).sessionId
    );
    if (!(twin.twin && own)) {
      throw new Error("The trace's browser opened no page.");
    }
    // Marked as the agent's from its first document, as its pages here are
    // (Gate `#mark`): the dashboard it loads names its owner.
    await wire.call("Page.enable", {}, own);
    await wire.call(
      "Page.addScriptToEvaluateOnNewDocument",
      { source: gatedPageScript(this.workspace), runImmediately: true },
      own
    );
    for (const session of sessions) {
      await this.#twinSession(twin, session);
    }
    // The twin stands for the page from here: the agent is told the
    // page's contexts are gone, as a navigation tells it, and its sessions
    // are set up there as it set them up here.
    twin.live = true;
    for (const session of sessions) {
      this.#send({
        method: "Runtime.executionContextsCleared",
        params: {},
        sessionId: session,
      });
      await this.#replay(twin, session);
    }
    const url = this.#gate.info(twin.page)?.url;
    if (url && url !== BLANK) {
      await wire.call("Page.navigate", { url }, own);
    }
    const tracing = restart && twin.sessions.get(restart.session);
    if (restart && tracing) {
      await wire.call("Tracing.start", restart.params, tracing);
    }
  }

  /** A session of the twin's for the agent's session `session` of its page. */
  async #twinSession(twin: Twin, session: string): Promise<void> {
    const attached = await twin.wire?.call("Target.attachToTarget", {
      targetId: twin.twin,
      flatten: true,
    });
    const id = text(attached?.sessionId);
    if (!id) {
      throw new Error("The trace's browser gave its page no session.");
    }
    twin.sessions.set(session, id);
    twin.agents.set(id, session);
    this.#routed.set(session, twin);
  }

  /** The state calls the agent made on `session`, made again on its twin's session, each add's handle kept as the twin has it. */
  async #replay(twin: Twin, session: string): Promise<void> {
    const there = twin.sessions.get(session);
    for (const call of this.#states.get(session)?.values() ?? []) {
      const params = REMOVES.test(call.method)
        ? handlesIn(call.params, twin.handles)
        : call.params;
      const answer = await twin.wire
        ?.call(call.method, params, there)
        .catch((error: unknown) => {
          console.info(
            `[browser] ${this.#gate.key}: ${call.method} was not made again on a trace's page: ${String(error)}`
          );
        });
      const handle = answer ? handleOf(answer) : undefined;
      if (call.handle && handle) {
        twin.handles.set(call.handle, handle);
      }
    }
  }

  /**
   * One of the agent's calls on a session the twin stands for: to the twin,
   * written as its ids are, a state call to the page here too ({@link
   * #addBoth} for an add, whose handle the agent knows as this browser's).
   */
  async #throughTwin(
    twin: Twin,
    message: Cdp,
    kept: StateCall | undefined
  ): Promise<void> {
    const session = message.sessionId ?? "";
    const method = message.method ?? "";
    const id = message.id ?? 0;
    const own = twin.sessions.get(session);
    let params = message.params ?? {};
    if (own && STATE.test(method) && !NOT_STATE.has(method)) {
      if (ADDS.test(method)) {
        await this.#addBoth(twin, message, own, kept);
        return;
      }
      this.#wire?.post(method, params, session);
      if (REMOVES.test(method)) {
        params = handlesIn(params, twin.handles);
      }
    }
    if (method === "IO.read") {
      twin.reads.add(id);
    } else if (
      method === "IO.close" &&
      twin.stream &&
      text(params.handle) === twin.stream
    ) {
      twin.closing = id;
    } else if (method === "Tracing.start") {
      twin.start = id;
    }
    twin.pending.set(id, session);
    const out = { ...message, params, ...(own ? { sessionId: own } : {}) };
    twin.socket?.send(
      swapped(JSON.stringify(out), [[twin.page, twin.twin ?? twin.page]])
    );
    if (own && DRIVES.test(method)) {
      this.#gate.drove(this.workspace, twin.page);
    }
  }

  /** An add made on the page here and on its twin: answered as this browser answered it, the twin's handle kept beside it. */
  async #addBoth(
    twin: Twin,
    message: Cdp,
    own: string,
    kept: StateCall | undefined
  ): Promise<void> {
    const method = message.method ?? "";
    const params = message.params ?? {};
    this.#stateAsked.delete(message.id ?? 0);
    const [here, there] = await Promise.allSettled([
      this.#wire?.call(method, params, message.sessionId) ?? {},
      twin.wire?.call(method, params, own) ?? {},
    ]);
    if (here.status === "rejected" || there.status === "rejected") {
      const failed = here.status === "rejected" ? here : there;
      this.#refuse(
        message,
        failed.status === "rejected" && failed.reason instanceof Error
          ? failed.reason.message
          : String(failed)
      );
      return;
    }
    const handle = handleOf(here.value);
    const theirs = handleOf(there.value);
    if (kept) {
      kept.handle = handle;
    }
    if (handle && theirs) {
      twin.handles.set(handle, theirs);
    }
    this.#send({
      id: message.id,
      result: here.value,
      ...(message.sessionId ? { sessionId: message.sessionId } : {}),
    });
  }

  /**
   * What the twin's browser says: an answer to one of the agent's calls,
   * or an event of one of the twin's sessions, written as the page's ids;
   * a trace's data as it came. The twin goes once the trace it ran is
   * read, refused, or its page gone.
   */
  #fromTwin(twin: Twin, data: string): void {
    const message = parse(data);
    if (!message || (twin.wire && answered(twin.wire, message))) {
      return;
    }
    const back = new Map(twin.agents);
    if (twin.twin) {
      back.set(twin.twin, twin.page);
    }
    const agent = message.sessionId
      ? (twin.agents.get(message.sessionId) ??
        (twin.children.has(message.sessionId) ? message.sessionId : undefined))
      : undefined;
    if (typeof message.id === "number") {
      this.#twinAnswered(twin, message, agent, swapped(data, back));
      return;
    }
    if (!message.sessionId) {
      this.#twinBrowserEvent(twin, message);
      return;
    }
    if (!agent) {
      return;
    }
    this.#twinChildren(twin, message, agent);
    if (message.method?.startsWith("Tracing.")) {
      const stream = text(message.params?.stream);
      if (message.method === "Tracing.tracingComplete") {
        twin.stream = stream;
      }
      this.#send({ ...message, sessionId: agent });
      if (message.method === "Tracing.tracingComplete" && !stream) {
        this.#letTwinGo(twin);
      }
      return;
    }
    this.#send(swapped(data, back));
  }

  /** The twin's answer to one of the agent's calls: a read's data as it came; the twin goes once the trace's stream is closed or its start refused. */
  #twinAnswered(
    twin: Twin,
    message: Cdp,
    agent: string | undefined,
    written: string
  ): void {
    const id = message.id ?? 0;
    twin.pending.delete(id);
    if (twin.reads.delete(id)) {
      this.#send({ ...message, ...(agent ? { sessionId: agent } : {}) });
    } else {
      this.#send(written);
    }
    if (id === twin.closing || (id === twin.start && message.error)) {
      this.#letTwinGo(twin);
    }
  }

  /** An event at the twin's browser's level: the twin goes with its page. */
  #twinBrowserEvent(twin: Twin, message: Cdp): void {
    const params = message.params ?? {};
    const detached =
      message.method === "Target.detachedFromTarget" &&
      twin.agents.has(text(params.sessionId) ?? "");
    const crashed =
      message.method === "Target.targetCrashed" &&
      text(params.targetId) === twin.twin;
    if (detached || crashed) {
      this.#letTwinGo(twin);
    }
  }

  /** The twin's frames and workers, as its sessions are attached and let go: the agent's, under `agent`. */
  #twinChildren(twin: Twin, message: Cdp, agent: string): void {
    const params = message.params ?? {};
    const child = text(params.sessionId);
    if (!(child && message.sessionId)) {
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      twin.children.set(child, message.sessionId);
      this.#routed.set(child, twin);
      this.#sessions.add(child);
      this.#parents.set(child, agent);
      if (isInfo(params.targetInfo)) {
        this.#sessionTargets.set(child, params.targetInfo.targetId);
      }
    } else if (message.method === "Target.detachedFromTarget") {
      twin.children.delete(child);
      this.#forgetSession(child);
    }
  }

  /** {@link #twinDown}, let go: said in the log when it fails. */
  #letTwinGo(twin: Twin): void {
    this.#twinDown(twin).catch((error: unknown) =>
      console.warn(
        `[browser] ${this.#gate.key}: a trace's browser of workspace ${this.workspace} was not removed: ${String(error)}`
      )
    );
  }

  /**
   * The twin gone: its browser and its copy of the sign-ins removed, the
   * agent told its frames and workers there are gone and its calls there
   * unanswered failed, and the page's sessions here again, the page loaded
   * on the address the twin was on, so it goes on where the twin left off.
   */
  async #twinDown(twin: Twin): Promise<void> {
    if (twin.ended) {
      return;
    }
    twin.ended = true;
    if (this.#twins.get(twin.page) === twin) {
      this.#twins.delete(twin.page);
    }
    const info =
      twin.live && twin.twin
        ? await twin.wire
            ?.call("Target.getTargetInfo", { targetId: twin.twin })
            .catch((): Json => ({}))
        : undefined;
    const url = isInfo(info?.targetInfo) ? info.targetInfo.url : undefined;
    for (const [child, parent] of twin.children) {
      this.#send({
        method: "Target.detachedFromTarget",
        params: { sessionId: child },
        sessionId: twin.agents.get(parent) ?? parent,
      });
      this.#forgetSession(child);
    }
    for (const [id, session] of twin.pending) {
      this.#send({
        id,
        error: { code: REFUSED, message: TRACE_WORDS.stopped },
        ...(session ? { sessionId: session } : {}),
      });
    }
    for (const session of twin.sessions.keys()) {
      this.#routed.delete(session);
      if (twin.live) {
        this.#send({
          method: "Runtime.executionContextsCleared",
          params: {},
          sessionId: session,
        });
      }
    }
    for (const [session, routed] of this.#routed) {
      if (routed === twin) {
        this.#routed.delete(session);
      }
    }
    twin.socket?.close();
    await twin.browser?.close();
    const back = [...twin.sessions.keys()].find((session) =>
      this.#sessions.has(session)
    );
    if (twin.live && url && back && this.#socket) {
      await this.#wire
        ?.call("Page.navigate", { url }, back)
        .catch((error: unknown) =>
          console.info(
            `[browser] ${this.#gate.key}: a traced page of workspace ${this.workspace} did not open again on ${url}: ${String(error)}`
          )
        );
    }
    console.info(
      `[browser] ${this.#gate.key}: workspace ${this.workspace}'s trace of page ${twin.page} is done, its browser removed`
    );
  }

  /** Every twin of this connection gone: the connection is. */
  #twinsDown(): void {
    for (const twin of this.#twins.values()) {
      this.#letTwinGo(twin);
    }
  }

  /** Session `session` is gone: nothing of it is kept. */
  #forgetSession(session: string): void {
    this.#sessions.delete(session);
    this.#sessionTargets.delete(session);
    this.#parents.delete(session);
    this.#states.delete(session);
    this.#routed.delete(session);
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
    if (method === "Page.navigate" || method === "Target.createTarget") {
      return this.#closedAddress(params.url) ?? this.#named(method, params);
    }
    if (method === "Page.navigateToHistoryEntry" && this.#wire) {
      const history = await this.#wire
        .call("Page.getNavigationHistory", {}, sessionId)
        .catch((): Json => ({}));
      const entries = HistoryEntries.catch([]).parse(history.entries);
      const closed = this.#closedAddress(
        entries.find((entry) => entry.id === params.entryId)?.url
      );
      if (closed) {
        return closed;
      }
    }
    return this.#named(method, params);
  }

  /**
   * Why the agent may not load `url`: one of the browser's own pages, or a
   * loopback address ({@link loopbackOrigin}), whatever host the browser runs
   * on, so every machine keeps one rule. The hub's dashboard origins pass
   * (dashboard-door.ts `isDashboardOrigin`), and so do its previews on a
   * loopback name: each opens first by its `artifact_browse` address (core
   * `PREVIEW_ENTER_PATH`), and its origin then loads by any path.
   */
  #closedAddress(url: unknown): string | undefined {
    if (ownPage(url)) {
      return GATE_WORDS.ownPages;
    }
    const origin = loopbackOrigin(url);
    if (!(origin && typeof url === "string")) {
      return;
    }
    // The hub's own dashboard on this machine's loopback: its browser's
    // dashboard door signs it in as the agent (dashboard-door.ts), and no
    // other loopback address passes for it.
    if (isDashboardOrigin(this.#gate.key, origin)) {
      return;
    }
    const asked = new URL(url);
    if (
      asked.pathname === PREVIEW_ENTER_PATH &&
      asked.searchParams.has("ticket")
    ) {
      this.#entered.add(origin);
    }
    return this.#entered.has(origin) ? undefined : GATE_WORDS.loopback;
  }

  /** Why the gate refuses a call naming a target, session, context or window not the agent's. */
  #named(method: string, params: Json): string | undefined {
    if (
      method === "Target.createBrowserContext" &&
      (params.proxyServer !== undefined || params.proxyBypassList !== undefined)
    ) {
      return GATE_WORDS.proxy;
    }
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
          this.#refuse(message, withFeedbackLine(GATE_WORDS.flat));
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
      case "Target.createTarget": {
        // Opened blank, and taken where it was asked once marked (Gate
        // `load`): a page is the agent's from its first document.
        const url = text(params.url);
        if (url && url !== BLANK) {
          this.#goes.set(message.id ?? 0, url);
        }
        message.params = { ...params, url: BLANK, newWindow: true };
        this.#asked.set(message.id ?? 0, message);
        return false;
      }
      case "Target.attachToTarget":
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
    if (!message || (this.#wire && answered(this.#wire, message))) {
      return;
    }
    if (typeof message.id === "number") {
      const kept = this.#stateAsked.get(message.id);
      this.#stateAsked.delete(message.id);
      if (kept && message.result) {
        kept.handle = handleOf(message.result);
      }
      const asked = this.#asked.get(message.id);
      this.#asked.delete(message.id);
      if (asked && message.result) {
        this.#read(asked, message.result);
        if (this.#twinAttached(asked, message)) {
          return;
        }
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

  /**
   * An event of one of the agent's sessions: its children are the agent's
   * too. What a trace the gate ended here recorded is dropped, its stream
   * closed unread; what a page says while its twin stands for it is the
   * twin's to say.
   */
  #sessionEvent(message: Cdp, params: Json, data: string): void {
    const session = message.sessionId ?? "";
    if (!this.#sessions.has(session)) {
      return;
    }
    const child = text(params.sessionId);
    if (child && message.method === "Target.attachedToTarget") {
      this.#sessions.add(child);
      this.#parents.set(child, session);
      if (isInfo(params.targetInfo)) {
        this.#sessionTargets.set(child, params.targetInfo.targetId);
      }
    } else if (child && message.method === "Target.detachedFromTarget") {
      this.#gone(child);
    }
    if (
      this.#dropTrace.has(session) &&
      message.method?.startsWith("Tracing.")
    ) {
      const stream = text(params.stream);
      if (message.method === "Tracing.tracingComplete") {
        this.#dropTrace.delete(session);
        if (stream) {
          this.#wire?.post("IO.close", { handle: stream }, session);
        }
      }
      return;
    }
    if (this.#twinAbove(session)?.live) {
      return;
    }
    this.#send(data);
  }

  /**
   * Session `session` here is gone: forgotten, and the twin of its page
   * lets its session for it go, the twin itself once it stands for none.
   */
  #gone(session: string): void {
    const twin = this.#routed.get(session);
    this.#forgetSession(session);
    const there = twin?.sessions.get(session);
    if (!(twin && there)) {
      return;
    }
    twin.sessions.delete(session);
    twin.agents.delete(there);
    twin.wire?.post("Target.detachFromTarget", { sessionId: there });
    if (twin.sessions.size === 0) {
      this.#letTwinGo(twin);
    }
  }

  /**
   * The answer to the agent's attach to a page a twin stands for: held
   * until the twin has a session for the new one, then given. True when it
   * is held.
   */
  #twinAttached(asked: Cdp, answer: Cdp): boolean {
    const twin =
      asked.method === "Target.attachToTarget"
        ? this.#twins.get(text(asked.params?.targetId) ?? "")
        : undefined;
    const session = text(answer.result?.sessionId);
    if (!(twin?.live && session) || twin.ended) {
      return false;
    }
    this.#twinSession(twin, session)
      .catch((error: unknown) =>
        console.info(
          `[browser] ${this.#gate.key}: a session of workspace ${this.workspace} stays on its page here, not its twin: ${String(error)}`
        )
      )
      .finally(() => this.#send(answer));
    return true;
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
    if (!(session && this.#sessions.has(session))) {
      return;
    }
    this.#gone(session);
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
    this.#sessionTargets.set(session, info.targetId);
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
        const url = this.#goes.get(asked.id ?? 0);
        this.#goes.delete(asked.id ?? 0);
        if (id) {
          this.#gate.own(id, this.workspace);
          if (url) {
            this.#gate
              .load(id, url)
              .catch((error: unknown) =>
                console.warn(
                  `[browser] ${this.#gate.key}: a page of workspace ${this.workspace} did not open ${url}: ${String(error)}`
                )
              );
          }
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
    return new Response(withFeedbackLine(GATE_WORDS.token), { status: 401 });
  }
  // The machine's id as every door reads it (door.ts): one key for a gate id.
  const gate = gates.get(await keyOfWorkspace(id, await machineId()));
  if (!gate) {
    return new Response(withFeedbackLine(GATE_WORDS.none), { status: 404 });
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
 * browser of the machine; the daemon's alone. A port it cannot take throws,
 * naming it, and the agent ends on it (daemon.ts, its `watchBrowsers`) to
 * be started again: an agent left up without its gate served no session's
 * browser tool until it was restarted by hand.
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
    throw new Error(
      `the DevTools gate cannot listen on 127.0.0.1:${port}: ${String(error)}`,
      { cause: error }
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

/** Door `id`'s pages closed on every browser of this machine ({@link Gate.forget}), kept to open again when `keep`. */
const forgetOnEvery = async (id: string, keep: boolean): Promise<void> => {
  await Promise.all(
    [...gates.values()].map((gate) =>
      gate
        .forget(id, keep)
        .catch((error: unknown) =>
          console.warn(
            `[browser] ${gate.key}: ${id}'s pages were not closed: ${String(error)}`
          )
        )
    )
  );
};

/**
 * Door `id` ended (a workspace's boundary, a session's process): on every
 * browser of this machine, its connections are cut and its pages closed,
 * each one's address kept to open again as it comes back ({@link
 * Gate.restore}).
 */
export const closeWorkspaceBrowsers = (id: string): Promise<void> =>
  forgetOnEvery(id, true);

/** Door `id` gone for good (its session forgotten): its pages closed, and nothing kept of them. */
export const dropWorkspaceBrowsers = (id: string): Promise<void> =>
  forgetOnEvery(id, false);
