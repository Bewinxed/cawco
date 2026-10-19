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
 * - any other request (`tools/call`, `resources/read`, `prompts/get`, …)
 *   starts the one process when none runs, and goes to it under an id of the
 *   host's own, its answer back to the session that asked under the
 *   session's id.
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
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FleetMcpConfig } from "@cawco/core";
import { readWithin } from "@cawco/core/bounded";
import { cawcoDataDir, sessionIdentityDir } from "@cawco/core/paths";
import { processStart } from "@cawco/core/process-identity";
import { identifiedPid, signal as sendSignal } from "@cawco/core/signal";
import { writeStateFileSync } from "@cawco/core/state-file";
import { MCP_CONNECT_MS } from "./mcp-status";
import { toolEnv } from "./tools";

/** A shared server's config: a command this agent starts. */
export type HostedConfig = Extract<FleetMcpConfig, { command: string }>;

/** The path a harness dials a shared server on, under the gateway. */
export const HOSTED_PATH = /^\/mcp\/local\/([^/]+)$/;

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
const startedFile = (): string => join(hostDir(), "started.json");

/** A config's key: its command, arguments and environment as written. */
const keyOf = (config: HostedConfig): string =>
  createHash("sha256").update(JSON.stringify(config)).digest("hex");

let key: string | undefined;

/**
 * This machine's host key: what a harness's config carries to call a shared
 * server, kept owner-only beside the sessions' credentials (core paths.ts
 * `sessionIdentityDir`), hidden from every workspace boundary. Made once per
 * boot of that directory; the next fleet sync writes it into every config.
 */
export const hostKey = (): string => {
  if (key) {
    return key;
  }
  const file = join(sessionIdentityDir(), "mcp-host.key");
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
    config: HostedConfig,
    changed: (method: string) => void
  ) {
    this.#changed = changed;
    this.#proc = Bun.spawn([config.command, ...(config.args ?? [])], {
      cwd: homedir(),
      env: { ...toolEnv(), ...config.env },
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
    this.#read(this.#proc.stdout, (line) => this.#take(line));
    this.#read(this.#proc.stderr, (line) => {
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
      `[mcp-host] ${name}: started pid ${pid}: ${config.command} ${(config.args ?? []).join(" ")}`
    );
  }

  async #read(
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
            `${message.method} is not offered: this server is shared by every session on the machine, and the host that runs it names no client capability.`
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

/** One shared server: its config, what it said last, and its process once a call needs it. */
class Hosted {
  readonly name: string;
  readonly config: HostedConfig;
  readonly key: string;
  #kept: Kept | undefined;
  #child: Promise<Child> | undefined;
  #running: Child | undefined;

  constructor(name: string, config: HostedConfig) {
    this.name = name;
    this.config = config;
    this.key = keyOf(config);
    try {
      const kept = JSON.parse(readFileSync(keptFile(name), "utf8")) as Kept;
      this.#kept = kept.key === this.key ? kept : undefined;
    } catch {
      // Nothing kept: its first handshake starts it.
    }
  }

  /** Whether its process runs now. */
  get running(): boolean {
    return this.#running !== undefined;
  }

  /** What it said last; when nothing is kept for this config, its process starts to say it. */
  async kept(): Promise<Kept> {
    if (this.#kept) {
      return this.#kept;
    }
    await this.child();
    if (!this.#kept) {
      throw new Error(`The ${this.name} MCP server listed nothing.`);
    }
    return this.#kept;
  }

  /** Its process, started, handshaken and listed when none runs. */
  child(): Promise<Child> {
    this.#child ??= this.#start().catch((error: unknown) => {
      this.#child = undefined;
      throw error;
    });
    return this.#child;
  }

  async #start(): Promise<Child> {
    const child = new Child(this.name, this.config, (method) => {
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
        // biome-ignore lint/performance/noAwaitInLoops: one list at a time, on the one process
        kept.lists[method] = await this.#pages(child, method, items);
      }
    }
    mkdirSync(hostDir(), { recursive: true });
    writeStateFileSync(keptFile(this.name), JSON.stringify(kept));
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
      // biome-ignore lint/performance/noAwaitInLoops: a cursor names the next page only once this one is read
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

  /** Its process ended: a config changed, it is no longer shared, or the agent ends. */
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
    const child = await this.child();
    const answered = await child.request(method, message.params, signal);
    return { ...answered, id };
  }
}

/**
 * Capabilities as a session reads them: no list-changed, since a session
 * holds no stream the host could tell it on (`GET` answers 405), and lists
 * are read again whenever a session asks.
 */
const quiet = (capabilities: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(
    (capabilities ?? {}) as Record<string, unknown>
  )) {
    out[name] =
      value && typeof value === "object" && "listChanged" in value
        ? { ...(value as Record<string, unknown>), listChanged: false }
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
   * no longer shared, is ended; its next call starts the new one.
   */
  configure(servers: { name: string; config: HostedConfig }[]): void {
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
        this.#servers.set(name, new Hosted(name, config));
      }
    }
  }

  /** The names of the shared servers whose process runs now. */
  running(): string[] {
    return [...this.#servers.values()]
      .filter((hosted) => hosted.running)
      .map((hosted) => hosted.name);
  }

  /** Every process this host started, ended: the agent is ending. */
  stopAll(): void {
    for (const hosted of this.#servers.values()) {
      hosted.stop();
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
      // biome-ignore lint/performance/noAwaitInLoops: a few pids, each read once
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
  }
}

/** This agent's one host, served by its gateway. */
export const mcpHost = new McpHost();

process.once("exit", () => mcpHost.stopAll());
