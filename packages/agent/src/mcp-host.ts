/**
 * The fleet's shared MCP servers, hosted on each machine by its agent: one
 * process for every session there, started at its first call.
 *
 * A stdio server a harness starts is one process per Claude Code session and
 * one per OpenCode location, started with the session whether or not it is
 * ever called. On 2026-10-19 the owner's Mac (32 GB) had 14 each of `peekaboo
 * mcp`, `npm exec rive-mcp-server`, `mcpbridge` and `java`, and 28
 * chrome-devtools-mcp processes, for 7 Claude Code and 10 OpenCode sessions,
 * with 29.6 GiB swapped out and a load of 800. Neither harness starts a stdio
 * server late: Claude Code defers only a remote server it holds a cached tool
 * list for ("connects on its first tool call",
 * https://code.claude.com/docs/en/agent-sdk/mcp, "Connection timing"), and
 * OpenCode's "Servers connect automatically"
 * (https://opencode.ai/v2/docs/mcp-servers). So a server the fleet marks
 * `shared` (core `FleetMcpServer.shared`) reaches every harness as a remote
 * one, this agent's gateway at `/mcp/local/<name>` (mcp-oauth.ts), and the
 * gateway answers its handshake and its lists itself:
 *
 * - `initialize` and `ping` are answered here; `initialize` with what the
 *   server answered the last time it ran ({@link Kept}), kept on disk under
 *   its config's hash, so a session's start starts nothing;
 * - the list methods are answered from the server's last listing, all its
 *   pages, kept the same way, and listed again whenever its process starts;
 * - a request that needs the server ({@link FORWARDED}: `tools/call`,
 *   `resources/read`, `prompts/get`, `completion/complete`) starts the one
 *   process when none runs, and goes to it under an id of the host's own,
 *   its answer back to the session that asked under the session's id;
 * - any other method is refused, and starts nothing.
 *
 * Only a config with no listing kept yet starts the process for a handshake:
 * its first session's, once. The process then runs for the machine until
 * the agent ends, its config changes or it is no longer shared.
 *
 * The process runs outside every workspace boundary, as a harness's own
 * stdio server does, so only a harness may call it: each request carries this
 * machine's host key ({@link hostKey}), written into the harness configs and
 * kept beside the sessions' credentials, which every boundary hides. A
 * session's shell, which carries its own CawCo credential, has no host key.
 *
 * A process this host started is ended with the agent. One left by an agent
 * that died without ending it is ended when the next one starts
 * ({@link McpHost.sweep}): leaked `peekaboo mcp` servers once drove the Mac's
 * load to 328.
 *
 * What a shared process cannot tell apart is its callers: every session's
 * call arrives as the host's, from the agent's home, offering no roots. So a
 * server is shared only when its tools keep nothing per caller and resolve
 * no path against their working directory. Of the fleet's, as of 2026-10-19:
 *
 * - `chrome-devtools` never (the hub refuses it). Each session's process is
 *   launched through its own browser door (browser/door.ts `throughGate`): a
 *   `wsEndpoint` and token for its gate id, so its pages land on its
 *   project's browser and close when it ends. And chrome-devtools-mcp holds
 *   one browser connection and one selected page for its whole process:
 *   "Currently, one MCP server instance maps to one Chrome instance"
 *   (https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/3070), and
 *   its page tools resolve "via the global `getSelectedPage()`", so two
 *   callers' `select_page` and `take_screenshot` interleave onto each
 *   other's page (issue 1019). The browser is shared already; the process
 *   is what holds the session.
 * - Maestro's `maestro mcp` (a `java` process) is not: `run`'s `files` and
 *   `dir` are each `WorkingDirectory.resolve`d (maestro-cli mcp/tools/
 *   RunTool.kt), against the process's own directory, the agent's home here,
 *   not the session's checkout.
 * - Xcode's `mcpbridge` can be: Xcode keeps the state, each tool names its
 *   window by `tabIdentifier`, and "Permission dialog appears per-process"
 *   (https://github.com/ndrblinov/xcode-mcp-manager), so one process asks once.
 *
 * A workspace's sessions reach every other fleet server with a command
 * through its gate (mcp-gate.ts, `/mcp/gate/<gate id>/<name>`), answered
 * here the same way: one process per gate and server, started at its first
 * call in the workspace's own folder, chrome-devtools through the
 * workspace's browser door with its scratch and folder as its roots
 * ({@link gateLaunch}). So the process is the gate's alone, as chrome-devtools
 * needs, and runs outside the boundary its sessions' own processes run in.
 * It ends with the gate's last session ({@link McpHost.leaveGate}).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FleetMcpConfig } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import {
  cawcoDataDir,
  sessionIdentityDir,
  workspaceScratchDir,
} from "@cawco/core/paths";
import { processStart } from "@cawco/core/process-identity";
import { identifiedPid, signal as sendSignal } from "@cawco/core/signal";
import { writeStateFileSync } from "@cawco/core/state-file";
import { harnessMcpUrl } from "./delegation";
import { fleetMcpAt, readFleetMcpSet } from "./fleet-mcp-set";
import { gatePath, type McpGate } from "./mcp-gate";
import { MCP_CONNECT_MS } from "./mcp-status";
import { toolEnv } from "./tools";
import { workspacePath } from "./workspace-records";

/** A hosted server's config: a command this agent starts. */
export type HostedConfig = Extract<FleetMcpConfig, { command: string }>;

/** How a hosted server's process starts: its command line, environment and working directory. */
interface Launch {
  readonly args: readonly string[];
  readonly command: string;
  readonly cwd: string;
  readonly env: Record<string, string | undefined>;
}

/** The path a harness dials a shared server on, under the gateway. */
export const HOSTED_PATH = /^\/mcp\/local\/([^/]+)$/u;

/** Each list method, and the key its result carries the items under. */
const LIST_METHODS: Record<string, { items: string; capability: string }> = {
  "tools/list": { items: "tools", capability: "tools" },
  "prompts/list": { items: "prompts", capability: "prompts" },
  "resources/list": { items: "resources", capability: "resources" },
  "resources/templates/list": {
    items: "resourceTemplates",
    capability: "resources",
  },
};
/** Each list-changed notification, and the lists it makes stale. */
const CHANGED: Record<string, string[]> = {
  "notifications/tools/list_changed": ["tools/list"],
  "notifications/prompts/list_changed": ["prompts/list"],
  "notifications/resources/list_changed": [
    "resources/list",
    "resources/templates/list",
  ],
};
/**
 * The requests that need the server itself, at the revision the host speaks
 * ({@link PROTOCOL_VERSION}): each goes to its process, started for it. Any
 * other method is refused as a server of that revision refuses one it does
 * not know (`-32601`), and starts nothing. Claude Code 2.1.302 opens each
 * connection with `server/discover`, a later revision's, and goes on to
 * `initialize` when it is refused; carried to the process, it started one
 * for every session (probe-kit spec `mcp-shared`). The rest of 2025-06-18's
 * requests need a stream the host does not hold (`resources/subscribe`,
 * `logging/setLevel`), and {@link quiet} offers neither.
 */
const FORWARDED = new Set([
  "tools/call",
  "resources/read",
  "prompts/get",
  "completion/complete",
]);
/** The most pages one listing reads: a cursor that never ends is the server's fault, not a reason to spin. */
const MOST_PAGES = 100;
/** The MCP revision the host asks a server for, as the agent's other MCP client does (fleet-mcp-listing.ts). */
const PROTOCOL_VERSION = "2025-06-18";
/** How many of a process's last stderr lines its failure quotes. */
const STDERR_KEPT = 20;

/** JSON-RPC's own error codes (https://www.jsonrpc.org/specification#error_object). */
const PARSE_ERROR = -32_700;
const INVALID_REQUEST = -32_600;
const METHOD_NOT_FOUND = -32_601;
/** An implementation error of the host's own: the server could not answer. */
const SERVER_ERROR = -32_000;

interface Message {
  error?: unknown;
  id?: number | string | null;
  jsonrpc?: string;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
}

/** What a server said the last time it ran, kept for its config. */
interface Kept {
  /** Its `initialize` result. */
  initialize: Record<string, unknown>;
  /** The config it ran on, hashed: another config keeps nothing of this. */
  key: string;
  /** Each list method its capabilities name, with every item of every page. */
  lists: Record<string, unknown[]>;
}

/** Where the host keeps its state: listings, and the processes it started. */
const hostDir = (): string => join(cawcoDataDir(), "mcp-host");
const keptFile = (name: string): string =>
  join(hostDir(), `${encodeURIComponent(name)}.json`);
/** A gate id as a workspace's is written: a word of its state dir's name, never a path. */
const GATE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
/** A gate's server's listing, by its config's key: every gate on that config lists the same. */
const gateKeptFile = (configKey: string): string =>
  join(hostDir(), `gate-${configKey}.json`);
const startedFile = (): string => join(hostDir(), "started.json");
/** The shared servers the last fleet sync named, each with its command ({@link McpHost.restore}). */
const sharedFile = (): string => join(hostDir(), "shared.json");

/** A config's key: its command, arguments and environment as written. */
const keyOf = (config: HostedConfig): string =>
  createHash("sha256").update(JSON.stringify(config)).digest("hex");

let key: string | undefined;

/** Where {@link hostKey} is kept: OpenCode's plugin reads it there for its workspace locations' gates. */
export const hostKeyFile = (): string =>
  join(sessionIdentityDir(), "mcp-host.key");

/**
 * This machine's host key: what a harness's config carries to call a shared
 * server or a gate's, kept owner-only beside the sessions' credentials (core
 * paths.ts `sessionIdentityDir`), hidden from every workspace boundary. Made
 * once per boot of that directory; the next fleet sync writes it into every
 * config.
 */
export const hostKey = (): string => {
  if (key) {
    return key;
  }
  const file = hostKeyFile();
  try {
    key = readFileSync(file, "utf8").trim() || undefined;
  } catch {
    // None yet: made below.
  }
  if (!key) {
    key = randomBytes(32).toString("base64url");
    mkdirSync(sessionIdentityDir(), { recursive: true, mode: 0o700 });
    writeStateFileSync(file, key, { mode: 0o600 });
  }
  return key;
};

/** Whether `header` is `Bearer <this machine's host key>`. */
const carriesKey = (header: string | null): boolean => {
  const given = Buffer.from(header ?? "");
  const wanted = Buffer.from(`Bearer ${hostKey()}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
};

/** A shared server's entry in a harness config: this gateway's path, with the host key. */
export const hostedEntry = (
  url: string
): Extract<FleetMcpConfig, { url: string }> => ({
  type: "http",
  url,
  headers: { Authorization: `Bearer ${hostKey()}` },
});

/** Gate `gateId` (a workspace's id), as its sessions' harnesses dial it ({@link McpHost.fetchGate}). */
export const mcpGateOf = (gateId: string): McpGate => ({
  base: harnessMcpUrl(gatePath(gateId)),
  headers: { Authorization: `Bearer ${hostKey()}` },
});

const rpcError = (
  id: Message["id"],
  code: number,
  message: string
): Message => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** The pids and starts of the processes this host started, for the next agent to end any left. */
const started = new Map<number, string>();

const recordStarted = (): void => {
  mkdirSync(hostDir(), { recursive: true });
  writeStateFileSync(
    startedFile(),
    JSON.stringify([...started].map(([pid, start]) => ({ pid, start })))
  );
};

/** One running server process, spoken to over its stdio, one JSON-RPC message per line. */
class Child {
  readonly #proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  readonly #pending = new Map<
    number,
    { resolve: (message: Message) => void; reject: (error: Error) => void }
  >();
  readonly #stderr: string[] = [];
  readonly #changed: (method: string) => void;
  #next = 1;
  #ended: string | undefined;
  readonly exited: Promise<void>;

  constructor(
    name: string,
    launch: Launch,
    cause: string,
    changed: (method: string) => void
  ) {
    this.#changed = changed;
    this.#proc = Bun.spawn([launch.command, ...launch.args], {
      cwd: launch.cwd,
      env: launch.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const { pid } = this.#proc;
    processStart(pid).then(
      (start) => {
        if (start && this.#ended === undefined) {
          started.set(pid, start);
          recordStarted();
        }
      },
      () => undefined
    );
    readLines(this.#proc.stdout, (line) => this.#take(line));
    readLines(this.#proc.stderr, (line) => {
      this.#stderr.push(line);
      if (this.#stderr.length > STDERR_KEPT) {
        this.#stderr.shift();
      }
    });
    this.exited = this.#proc.exited.then((code) => {
      started.delete(pid);
      recordStarted();
      const said = this.#stderr.join("\n").trim();
      this.#ended = `The ${name} MCP server exited (code ${code})${said ? `: ${said.slice(-400)}` : ""}. Its next call starts it again.`;
      console.warn(`[mcp-host] ${this.#ended}`);
      for (const { reject } of this.#pending.values()) {
        reject(new Error(this.#ended));
      }
      this.#pending.clear();
    });
    console.info(
      `[mcp-host] ${name}: started pid ${pid} for ${cause}: ${launch.command} ${launch.args.join(" ")}`
    );
  }

  /** One message from the server: an answer to the host, a notification, or a request of its own. */
  #take(text: string): void {
    let message: Message;
    try {
      message = JSON.parse(text) as Message;
    } catch {
      // Not JSON-RPC: a server's stray stdout line is no message.
      return;
    }
    if (message.method === undefined) {
      const pending =
        typeof message.id === "number"
          ? this.#pending.get(message.id)
          : undefined;
      if (pending && typeof message.id === "number") {
        this.#pending.delete(message.id);
        pending.resolve(message);
      }
      return;
    }
    if (message.id === undefined || message.id === null) {
      if (CHANGED[message.method]) {
        this.#changed(message.method);
      }
      return;
    }
    // A request of the server's: the host offered no client capability
    // (roots, sampling, elicitation), so only ping is answered.
    this.#send(
      message.method === "ping"
        ? { jsonrpc: "2.0", id: message.id, result: {} }
        : rpcError(
            message.id,
            METHOD_NOT_FOUND,
            `${message.method} is not offered: the host that runs this server for CawCo's sessions names no client capability.`
          )
    );
  }

  #send(message: Message): void {
    this.#proc.stdin.write(`${JSON.stringify(message)}\n`);
    this.#proc.stdin.flush();
  }

  notify(method: string, params?: Record<string, unknown>): void {
    if (this.#ended === undefined) {
      this.#send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) });
    }
  }

  /** One request, answered with the server's whole message (a result or an error); `signal` cancels it. */
  request(
    method: string,
    params: Record<string, unknown> | undefined,
    signal?: AbortSignal
  ): Promise<Message> {
    if (this.#ended !== undefined) {
      return Promise.reject(new Error(this.#ended));
    }
    const id = this.#next;
    this.#next += 1;
    return new Promise<Message>((resolve, reject) => {
      const cancel = () => {
        if (this.#pending.delete(id)) {
          this.notify("notifications/cancelled", {
            requestId: id,
            reason: "The session that asked went away.",
          });
          reject(new Error("Cancelled."));
        }
      };
      signal?.addEventListener("abort", cancel, { once: true });
      this.#pending.set(id, {
        resolve: (message) => {
          signal?.removeEventListener("abort", cancel);
          resolve(message);
        },
        reject: (error) => {
          signal?.removeEventListener("abort", cancel);
          reject(error);
        },
      });
      this.#send({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
      });
    });
  }

  /** Ends the process; `exited` follows. */
  stop(): void {
    this.#proc.kill("SIGTERM");
  }
}

async function readLines(
  stream: ReadableStream<Uint8Array>,
  line: (text: string) => void
): Promise<void> {
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for await (const chunk of stream) {
      buffered += decoder.decode(chunk, { stream: true });
      let end = buffered.indexOf("\n");
      while (end >= 0) {
        const text = buffered.slice(0, end).trim();
        buffered = buffered.slice(end + 1);
        if (text) {
          line(text);
        }
        end = buffered.indexOf("\n");
      }
    }
  } catch {
    // The process ended: `exited` says so.
  }
}

/**
 * A request the host made itself, given {@link MCP_CONNECT_MS} to be
 * answered; one not answered by then is cancelled on the server.
 */
const within = async (
  name: string,
  what: string,
  ask: (signal: AbortSignal) => Promise<Message>
): Promise<Message> => {
  const read = await readWithin(MCP_CONNECT_MS, ask);
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `The ${name} MCP server did not answer ${what} within ${Math.round(read.after / 1000)} s.`
      );
    default: {
      const unhandled: never = read;
      throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
    }
  }
};

/** A server's error answer to a request the host made, as an Error. */
const failed = (name: string, what: string, message: Message): Error =>
  new Error(
    `The ${name} MCP server refused ${what}: ${JSON.stringify(message.error)}`
  );

/** A shared server's launch: its config's command, from the agent's home. */
const sharedLaunch = (config: HostedConfig): Launch => ({
  command: config.command,
  args: config.args ?? [],
  cwd: homedir(),
  env: { ...toolEnv(), ...config.env },
});

/**
 * A gate's server's launch: its config's command in the workspace's folder
 * `path`, and chrome-devtools through the workspace's browser door (made
 * here, starting no browser), with the workspace's scratch and folder as
 * the roots it saves a capture in, as OpenCode's plugin launched it.
 */
const gateLaunch = async (
  gateId: string,
  name: string,
  config: HostedConfig,
  path: string
): Promise<Launch> => {
  const door = await import("./browser/door");
  const args =
    name === door.CHROME_DEVTOOLS
      ? [
          ...door.throughGate(
            config.args ?? [],
            await door.browserDoor(gateId)
          ),
          `--filesystem-root=${workspaceScratchDir(gateId)}`,
          `--filesystem-root=${path}`,
        ]
      : (config.args ?? []);
  return {
    command: config.command,
    args,
    cwd: path,
    env: { ...toolEnv(), ...config.env },
  };
};

/** One hosted server: its config, what it said last, and its process once a call needs it. */
class Hosted {
  readonly name: string;
  readonly key: string;
  readonly #keptFile: string;
  readonly #launch: () => Launch | Promise<Launch>;
  #kept: Kept | undefined;
  #child: Promise<Child> | undefined;
  #running: Child | undefined;

  constructor(
    name: string,
    config: HostedConfig,
    kept: string,
    launch: () => Launch | Promise<Launch>
  ) {
    this.name = name;
    this.key = keyOf(config);
    this.#keptFile = kept;
    this.#launch = launch;
    try {
      const read = JSON.parse(readFileSync(kept, "utf8")) as Kept;
      this.#kept = read.key === this.key ? read : undefined;
    } catch {
      // Nothing kept: its first handshake starts it.
    }
  }

  /** What it said last; when nothing is kept for this config, its process starts to say it. */
  async kept(): Promise<Kept> {
    if (this.#kept) {
      return this.#kept;
    }
    await this.child("a handshake, with no listing kept for its config");
    if (!this.#kept) {
      throw new Error(`The ${this.name} MCP server listed nothing.`);
    }
    return this.#kept;
  }

  /** Its process, started, handshaken and listed when none runs; `cause` is what asked, for its start's log line. */
  child(cause: string): Promise<Child> {
    this.#child ??= this.#start(cause).catch((error: unknown) => {
      this.#child = undefined;
      throw error;
    });
    return this.#child;
  }

  async #start(cause: string): Promise<Child> {
    const launch = await this.#launch();
    const child = new Child(this.name, launch, cause, (method) => {
      this.#list(child, CHANGED[method] ?? []).catch((error: unknown) =>
        console.warn(`[mcp-host] ${this.name}: listing again failed: ${error}`)
      );
    });
    child.exited.then(() => {
      if (this.#running === child) {
        this.#running = undefined;
        this.#child = undefined;
      }
    });
    try {
      const opened = await within(this.name, "initialize", (abort) =>
        child.request(
          "initialize",
          {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: "CawCo MCP host", version: "1" },
          },
          abort
        )
      );
      if (!opened.result) {
        throw failed(this.name, "initialize", opened);
      }
      child.notify("notifications/initialized");
      this.#kept = {
        key: this.key,
        initialize: opened.result,
        lists: {},
      };
      await this.#list(child, Object.keys(LIST_METHODS));
      this.#running = child;
      return child;
    } catch (error) {
      child.stop();
      throw error;
    }
  }

  /** Lists `methods` its capabilities name again, every page, and keeps them. */
  async #list(child: Child, methods: string[]): Promise<void> {
    const kept = this.#kept;
    if (!kept) {
      return;
    }
    const capabilities = (kept.initialize.capabilities ?? {}) as Record<
      string,
      unknown
    >;
    for (const method of methods) {
      const { items, capability } = LIST_METHODS[method] ?? {};
      if (items && capability && capabilities[capability]) {
        kept.lists[method] = await this.#pages(child, method, items);
      }
    }
    mkdirSync(hostDir(), { recursive: true });
    writeStateFileSync(this.#keptFile, JSON.stringify(kept));
  }

  /** Every item of one list method, page after page as its cursor names them. */
  async #pages(
    child: Child,
    method: string,
    items: string
  ): Promise<unknown[]> {
    const all: unknown[] = [];
    let cursor: unknown;
    for (let page = 0; page < MOST_PAGES; page += 1) {
      const listed = await within(this.name, method, (abort) =>
        child.request(method, cursor ? { cursor } : {}, abort)
      );
      if (!listed.result) {
        throw failed(this.name, method, listed);
      }
      const found = listed.result[items];
      all.push(...(Array.isArray(found) ? found : []));
      cursor = listed.result.nextCursor;
      if (!cursor) {
        break;
      }
    }
    return all;
  }

  /** Its process ended: a config changed, it is no longer shared, its gate's last session ended, or the agent ends. */
  stop(): void {
    this.#running?.stop();
    this.#running = undefined;
    this.#child = undefined;
  }

  /**
   * One session's request, answered: the handshake and lists from what it
   * said last, anything else by its process, started for it when none runs.
   * A notification is answered with nothing.
   */
  async answer(
    message: Message,
    signal: AbortSignal
  ): Promise<Message | undefined> {
    const { id, method } = message;
    if (method === undefined) {
      // A session's answer to a request of the server's: the host makes none.
      return;
    }
    if (id === undefined || id === null) {
      // `notifications/initialized` is the host's own to send, once per
      // process; a session's cancel goes with its request's own abort.
      return;
    }
    if (method === "ping") {
      return { jsonrpc: "2.0", id, result: {} };
    }
    if (method === "initialize") {
      const { initialize } = await this.kept();
      return {
        jsonrpc: "2.0",
        id,
        result: { ...initialize, capabilities: quiet(initialize.capabilities) },
      };
    }
    const list = LIST_METHODS[method];
    if (list) {
      const { lists } = await this.kept();
      const items = lists[method];
      return items
        ? { jsonrpc: "2.0", id, result: { [list.items]: items } }
        : rpcError(
            id,
            METHOD_NOT_FOUND,
            `${this.name} lists no ${list.items}.`
          );
    }
    if (!FORWARDED.has(method)) {
      return rpcError(
        id,
        METHOD_NOT_FOUND,
        `${method} is not offered: ${this.name} reaches CawCo's sessions through a host that speaks MCP ${PROTOCOL_VERSION}.`
      );
    }
    const child = await this.child(`a session's ${method}`);
    const answered = await child.request(method, message.params, signal);
    return { ...answered, id };
  }
}

/**
 * Capabilities as a session reads them: no list-changed, no resource
 * subscriptions and no logging, since a session holds no stream the host
 * could tell it on (`GET` answers 405); lists are read again whenever a
 * session asks.
 */
const quiet = (capabilities: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(
    (capabilities ?? {}) as Record<string, unknown>
  )) {
    if (name === "logging") {
      continue;
    }
    out[name] =
      value && typeof value === "object"
        ? {
            ...(value as Record<string, unknown>),
            ...("listChanged" in value ? { listChanged: false } : {}),
            ...("subscribe" in value ? { subscribe: false } : {}),
          }
        : value;
  }
  return out;
};

/** The JSON-RPC message or batch a POST carries, or why it carries none. */
const messagesOf = (
  body: string
): { batch: boolean; messages: Message[] } | { error: Message } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: rpcError(null, PARSE_ERROR, "The body is not JSON.") };
  }
  const batch = Array.isArray(parsed);
  const messages = (batch ? parsed : [parsed]) as unknown[];
  if (
    messages.length === 0 ||
    messages.some((one) => !one || typeof one !== "object")
  ) {
    return {
      error: rpcError(
        null,
        INVALID_REQUEST,
        "No JSON-RPC message in the body."
      ),
    };
  }
  return { batch, messages: messages as Message[] };
};

/** The machine's shared servers, by name. */
export class McpHost {
  readonly #servers = new Map<string, Hosted>();

  /**
   * The shared servers as the fleet's latest sync names them, each with its
   * resolved command (mcp-launcher.ts). One whose config changed, or that is
   * no longer shared, is ended; its next call starts the new one. The set is
   * kept on disk for the next agent ({@link restore}).
   */
  configure(servers: { name: string; config: HostedConfig }[]): void {
    this.#take(servers);
    mkdirSync(hostDir(), { recursive: true });
    // Owner-only: a server's environment may carry its keys.
    writeStateFileSync(sharedFile(), JSON.stringify(servers), { mode: 0o600 });
  }

  /**
   * The shared servers the last agent's last sync named, served from this
   * agent's start. Every harness was told their path then: OpenCode's
   * server, which its keeper keeps across an agent's restart, and every
   * session's config. Until this agent's first sync (which the hub holds
   * until the machine's harnesses report, hub server.ts `awaitHarnesses`), a
   * host holding none answered each of them 404, and a location booted then
   * held the server failed: "xcode is not a shared MCP server on this
   * machine" on the Mac (2026-10-22). Nothing starts here: a process starts
   * at its first call, as ever.
   */
  restore(): void {
    let kept: { name: string; config: HostedConfig }[];
    try {
      kept = JSON.parse(readFileSync(sharedFile(), "utf8")) as typeof kept;
    } catch {
      return;
    }
    if (Array.isArray(kept)) {
      this.#take(kept);
    }
  }

  #take(servers: { name: string; config: HostedConfig }[]): void {
    const wanted = new Map(servers.map((one) => [one.name, one.config]));
    for (const [name, hosted] of this.#servers) {
      const config = wanted.get(name);
      if (!config || keyOf(config) !== hosted.key) {
        hosted.stop();
        this.#servers.delete(name);
        console.info(`[mcp-host] ${name}: no longer shared as it was; ended`);
      }
    }
    for (const [name, config] of wanted) {
      if (!this.#servers.has(name)) {
        this.#servers.set(
          name,
          new Hosted(name, config, keptFile(name), () => sharedLaunch(config))
        );
      }
    }
  }

  /** Each gate's servers, by gate id, with the sessions that hold it ({@link joinGate}). */
  readonly #gates = new Map<
    string,
    { readonly members: Set<string>; readonly servers: Map<string, Hosted> }
  >();

  #gate(gateId: string) {
    let gate = this.#gates.get(gateId);
    if (!gate) {
      gate = { members: new Set(), servers: new Map() };
      this.#gates.set(gateId, gate);
    }
    return gate;
  }

  /** A session's process (`member`, its instance and generation) holds gate `gateId` from now. */
  joinGate(gateId: string, member: string): void {
    this.#gate(gateId).members.add(member);
  }

  /**
   * A session's process no longer holds gate `gateId`: with the last one, the
   * gate's processes end. A later call starts them again.
   */
  leaveGate(gateId: string, member: string): void {
    const gate = this.#gates.get(gateId);
    if (!gate?.members.delete(member) || gate.members.size > 0) {
      return;
    }
    for (const hosted of gate.servers.values()) {
      hosted.stop();
    }
    this.#gates.delete(gateId);
    if (gate.servers.size > 0) {
      console.info(
        `[mcp-host] ${gateId}: its gate's last session ended, and its servers with it`
      );
    }
  }

  /** Every process this host started, ended: the agent is ending. */
  stopAll(): void {
    for (const hosted of this.#servers.values()) {
      hosted.stop();
    }
    for (const gate of this.#gates.values()) {
      for (const hosted of gate.servers.values()) {
        hosted.stop();
      }
    }
  }

  /**
   * The processes a host before this one started and left running (an agent
   * that died without ending them), ended: each recorded pid whose process
   * still has the start it was recorded with.
   */
  async sweep(): Promise<void> {
    let left: { pid: number; start: string }[];
    try {
      left = JSON.parse(readFileSync(startedFile(), "utf8")) as typeof left;
    } catch {
      return;
    }
    for (const { pid, start } of left) {
      const still = await identifiedPid({ pid, procStart: start }).catch(
        () => undefined
      );
      if (still && sendSignal(still, "SIGTERM") === "sent") {
        console.warn(
          `[mcp-host] ended pid ${pid}, a shared MCP server an earlier agent left running`
        );
      }
    }
    recordStarted();
  }

  /**
   * One harness request on `/mcp/local/<name>` (Streamable HTTP, answered as
   * JSON with no session: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports).
   */
  async fetch(name: string, request: Request): Promise<Response> {
    if (!carriesKey(request.headers.get("Authorization"))) {
      return new Response(
        "This shared MCP server answers only a harness this agent configured.",
        { status: 401 }
      );
    }
    const hosted = this.#servers.get(decodeURIComponent(name));
    if (!hosted) {
      return new Response(
        `${decodeURIComponent(name)} is not a shared MCP server on this machine.`,
        { status: 404 }
      );
    }
    return await serve(hosted, request);
  }

  /**
   * One harness request on `/mcp/gate/<gate id>/<name>` (mcp-gate.ts): the
   * fleet's server `name` with a command, as the fleet's latest sync names it
   * for the gate's workspace's folder (placed copies too), served as a shared
   * one is, by its own process for this gate. A config that changed since
   * its process started ends it; the next call starts the new one.
   */
  async fetchGate(
    gateId: string,
    name: string,
    request: Request
  ): Promise<Response> {
    if (!carriesKey(request.headers.get("Authorization"))) {
      return new Response(
        "This workspace's MCP gate answers only a harness this agent configured.",
        { status: 401 }
      );
    }
    const id = decodeURIComponent(gateId);
    const server = decodeURIComponent(name);
    const path = GATE_ID.test(id) ? await workspacePath(id) : undefined;
    if (!path) {
      return new Response(`${id} is not a workspace on this machine.`, {
        status: 404,
      });
    }
    const config = fleetMcpAt(await readFleetMcpSet(), path)[server];
    if (!(config && "command" in config)) {
      return new Response(
        `${server} is not a fleet MCP server this machine runs for ${id}.`,
        { status: 404 }
      );
    }
    const gate = this.#gate(id);
    let hosted = gate.servers.get(server);
    if (hosted?.key !== keyOf(config)) {
      hosted?.stop();
      hosted = new Hosted(server, config, gateKeptFile(keyOf(config)), () =>
        gateLaunch(id, server, config, path)
      );
      gate.servers.set(server, hosted);
    }
    return await serve(hosted, request);
  }
}

/** One harness request to `hosted` (Streamable HTTP, answered as JSON with no session). */
const serve = async (hosted: Hosted, request: Request): Promise<Response> => {
  if (request.method !== "POST") {
    // No stream to hold open, and no session to end.
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  const read = messagesOf(await request.text());
  if ("error" in read) {
    return Response.json(read.error, { status: 400 });
  }
  const answers = (
    await Promise.all(
      read.messages.map((message) =>
        hosted
          .answer(message, request.signal)
          .catch((error: unknown): Message =>
            rpcError(
              message.id,
              SERVER_ERROR,
              error instanceof Error ? error.message : String(error)
            )
          )
      )
    )
  ).filter((answer): answer is Message => answer !== undefined);
  if (answers.length === 0) {
    return new Response(null, { status: 202 });
  }
  return Response.json(read.batch ? answers : answers[0]);
};

/** This agent's one host, served by its gateway. */
export const mcpHost = new McpHost();

process.once("exit", () => mcpHost.stopAll());
