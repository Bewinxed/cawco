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
 * machine's host key ({@link hostKey}), written into the fleet's set (a
 * session's gate adds it as it relays the call) and OpenCode's config, and
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
 * Every session reaches every other fleet server through its gate
 * (mcp-gate.ts, `/mcp/gate/<gate id>/<name>`: its workspace's, else its
 * own), with its own token ({@link memberToken}), never the host key; a
 * remote one, a shared one and CawCo's own are relayed by the gateway with
 * their headers ({@link McpHost.gateTarget}). One with a command is
 * answered here the same way as a shared one: one process per gate and server,
 * started at its first call in the gate's folder, chrome-devtools through
 * the gate id's browser door with the folder (and a workspace's scratch) as
 * its roots ({@link gateLaunch}). So the process is the gate's alone, as
 * chrome-devtools needs, and runs outside any boundary its sessions' own
 * processes run in. It ends with the gate's last session
 * ({@link McpHost.leaveGate}).
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readWithin } from "@cawco/core/bounded";
import { canonicalJson } from "@cawco/core/canonical-json";
import type { FleetMcpConfig } from "@cawco/core/fleet";
import { makeFolderSync } from "@cawco/core/folders";
import { HOSTED_PREFIX } from "@cawco/core/gateway-paths";
import {
  type JsonRpcMessage,
  JsonRpcMessageSchema,
} from "@cawco/core/json-rpc";
import { OUTPUT_TAIL_KEPT } from "@cawco/core/output-tail";
import { sessionIdentityDir } from "@cawco/core/paths/cawco";
import { cawcoDataDir } from "@cawco/core/paths/roots";
import { workspaceScratchDir } from "@cawco/core/paths/workspace";
import { processStart } from "@cawco/core/process-identity";
import { identifiedPid, signal as sendSignal } from "@cawco/core/signal";
import { parseRecord, writeStateFileSync } from "@cawco/core/state-file";
import { FleetMcpConfigSchema } from "@cawco/core/stored-shapes";
import { secondsOf } from "@cawco/core/time";
import { unhandled } from "@cawco/core/unhandled";
import {
  cutShortTail,
  newTail,
  saidTail,
  writeTail,
} from "@cawco/core/words/helpers";
import { mcpGateWords } from "@cawco/core/words/mcp-gate";
import { Deferred, Effect, Exit } from "effect";
import { z } from "zod";
import type { BrowserPorts } from "./browser/browsers";
import { runPromise } from "./daemon-runtime";
import { delegationMcp, harnessMcpUrl, MCP_SERVER_NAME } from "./delegation";
import { fleetMcpAt } from "./fleet-mcp-set";
import { GATE_TOKEN_HEADER, gatePath, type McpGate } from "./mcp-gate";
import { MCP_CONNECT_MS } from "./mcp-status";
import { sessionCredentialOf } from "./redaction";
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
export const HOSTED_PATH = new RegExp(
  `^${RegExp.escape(HOSTED_PREFIX)}([^/]+)$`,
  "u"
);

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
// @limit measured: a page count; a walk that reaches it says so, with the method and the page it stopped at (the warning in #pages), and only a cursor that never ends gets there
const MOST_PAGES = 100;
/** The MCP revision the host asks a server for, as the agent's other MCP client does (fleet-mcp-listing.ts). */
const PROTOCOL_VERSION = "2025-06-18";

/** JSON-RPC's own error codes (https://www.jsonrpc.org/specification#error_object). */
const PARSE_ERROR = -32_700;
const INVALID_REQUEST = -32_600;
const METHOD_NOT_FOUND = -32_601;
/** An implementation error of the host's own: the server could not answer. */
const SERVER_ERROR = -32_000;

/** What a server said the last time it ran, kept for its config. */
const KeptSchema = z.object({
  /** Its `initialize` result. */
  initialize: z.record(z.string(), z.unknown()),
  /** The config it ran on, hashed: another config keeps nothing of this. */
  key: z.string(),
  /** Each list method its capabilities name, with every item of every page. */
  lists: z.record(z.string(), z.array(z.unknown())),
});
type Kept = z.infer<typeof KeptSchema>;

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

/**
 * A config's key: its command, arguments and environment, whatever order
 * their keys come in. The kept set ({@link McpHost.restore}) is read through
 * its schema, which orders keys its own way, and the fleet's sync hands the
 * same config in the hub's order: both are one key.
 */
const keyOf = (config: HostedConfig): string =>
  createHash("sha256").update(canonicalJson(config)).digest("hex");

let key: string | undefined;

/** Where {@link hostKey} is kept: OpenCode's plugin reads it there for its workspace locations' gates. */
export const hostKeyFile = (): string =>
  join(sessionIdentityDir(), "mcp-host.key");

/**
 * This machine's host key: what a shared server's entry carries (which a
 * session's gate relays) and OpenCode's plugin calls a gate's servers with a
 * command by, kept owner-only beside the sessions' credentials (core
 * paths/cawco.ts `sessionIdentityDir`), hidden from every workspace boundary. Made
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
    makeFolderSync(sessionIdentityDir(), { mode: 0o700 });
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

/**
 * Where a gate that is no workspace's runs its servers (a session outside
 * every workspace, or an OpenCode location outside one): the folder, and
 * the project its own browser door is kept beside. Named as its first
 * session joins ({@link McpHost.joinGate}); a workspace's gate reads its
 * folder from the workspace's record.
 */
export interface GateHome {
  readonly path: string;
  readonly projectId?: string;
}

/** A session's process holding a gate: its instance, and its key (instance and generation). */
export interface GateMember {
  readonly instanceId: string;
  readonly key: string;
}

/**
 * Member `member`'s token for gate `gateId`: an HMAC of the two under the
 * host key, so the agent that takes the session back after a restart
 * derives the one its harness still holds, and no token names another
 * member or gate. It is good only while the member holds the gate
 * ({@link McpHost.joinGate} to {@link McpHost.leaveGate}): its process's
 * end refuses it, and a later launch of the session is another member, so
 * one a harness stored (Antigravity's conversation database keeps every
 * MCP header) opens nothing again.
 */
const memberToken = (gateId: string, member: GateMember): string =>
  createHmac("sha256", hostKey())
    .update(`cawco gate member\0${gateId}\0${member.key}`)
    .digest("base64url");

/** A token's name in the member table: its hash, so a lookup's timing says nothing of a token. */
const tokenName = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

/** Gate `gateId` (a workspace's id, a session's own, or a folder's: core `folderGateId`), as member `member`'s harness dials it ({@link McpHost.gateTarget}). */
export const mcpGateOf = (gateId: string, member: GateMember): McpGate => ({
  base: harnessMcpUrl(gatePath(gateId)),
  headers: { [GATE_TOKEN_HEADER]: memberToken(gateId, member) },
});

/**
 * What a gate's request reaches: a server with a command, run here; a remote
 * one (CawCo's own among them), relayed with its own headers, which only
 * the gate holds; or a refusal.
 */
export type GateTarget =
  | { readonly hosted: Hosted }
  | {
      readonly remote: {
        readonly headers: Readonly<Record<string, string>>;
        /** An SSE server's: its stream's `endpoint` events are rewritten onto the gate, and a post goes to the endpoint it names. */
        readonly sse?: true;
        readonly url: string;
      };
    }
  | { readonly refused: Response };

const refusal = (status: number, words: string): GateTarget => ({
  refused: new Response(words, { status }),
});

const rpcError = (
  id: JsonRpcMessage["id"],
  code: number,
  message: string
): JsonRpcMessage => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** The pids and starts of the processes this host started, for the next agent to end any left. */
const started = new Map<number, string>();

const recordStarted = (): void => {
  makeFolderSync(hostDir());
  writeStateFileSync(
    startedFile(),
    JSON.stringify([...started].map(([pid, start]) => ({ pid, start })))
  );
};

/** One running server process, spoken to over its stdio, one JSON-RPC message per line. */
class Child {
  readonly #proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  /** Each request still waiting, by id: the answer it waits on. */
  readonly #pending = new Map<
    number,
    Deferred.Deferred<JsonRpcMessage, unknown>
  >();
  /** The end of what the process wrote on stderr, which its failure quotes. */
  readonly #stderr = newTail();
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
      writeTail(this.#stderr, `${line}\n`, OUTPUT_TAIL_KEPT);
    });
    this.exited = this.#proc.exited.then((code) => {
      started.delete(pid);
      recordStarted();
      const said = saidTail(this.#stderr).trim();
      this.#ended = `The ${name} MCP server exited (code ${code})${said ? `: ${cutShortTail(said, 400)}` : ""}. Its next call starts it again.`;
      console.warn(`[mcp-host] ${this.#ended}`);
      for (const answer of this.#pending.values()) {
        Deferred.doneUnsafe(answer, Exit.fail(new Error(this.#ended)));
      }
      this.#pending.clear();
    });
    console.info(
      `[mcp-host] ${name}: started pid ${pid} for ${cause}: ${launch.command} ${launch.args.join(" ")}`
    );
  }

  /** One message from the server: an answer to the host, a notification, or a request of its own. */
  #take(text: string): void {
    let message: JsonRpcMessage;
    try {
      message = JsonRpcMessageSchema.parse(JSON.parse(text));
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
        Deferred.doneUnsafe(pending, Exit.succeed(message));
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

  #send(message: JsonRpcMessage): void {
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
  ): Promise<JsonRpcMessage> {
    if (this.#ended !== undefined) {
      return Promise.reject(new Error(this.#ended));
    }
    const id = this.#next;
    this.#next += 1;
    const answer = Deferred.makeUnsafe<JsonRpcMessage, unknown>();
    const cancel = () => {
      if (this.#pending.delete(id)) {
        this.notify("notifications/cancelled", {
          requestId: id,
          reason: "The session that asked went away.",
        });
        Deferred.doneUnsafe(answer, Exit.fail(new Error("Cancelled.")));
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    this.#pending.set(id, answer);
    try {
      this.#send({
        jsonrpc: "2.0",
        id,
        method,
        ...(params ? { params } : {}),
      });
    } catch (error) {
      this.#pending.delete(id);
      Deferred.doneUnsafe(answer, Exit.fail(error));
    }
    // The promise edge of the server's answer; `signal` is let go with it.
    return runPromise(
      Deferred.await(answer).pipe(
        Effect.ensuring(
          Effect.sync(() => signal?.removeEventListener("abort", cancel))
        )
      )
    );
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
  ask: (signal: AbortSignal) => Promise<JsonRpcMessage>
): Promise<JsonRpcMessage> => {
  const read = await readWithin(MCP_CONNECT_MS, ask);
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        `The ${name} MCP server did not answer ${what} within ${secondsOf(read.after)} s.`
      );
    default:
      unhandled("read", read);
  }
};

/** A server's error answer to a request the host made, as an Error. */
const failed = (name: string, what: string, message: JsonRpcMessage): Error =>
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
 * A gate's server's launch: its config's command in the gate's folder
 * `path`, and chrome-devtools through the gate id's browser door (made
 * here, starting no browser), with the folder as a root it saves a capture
 * in, and a workspace's scratch besides, as OpenCode's plugin launched it.
 * A gate with a `home` is a session's own: its door keeps its project.
 */
const gateLaunch = async (
  ports: BrowserPorts,
  gateId: string,
  name: string,
  config: HostedConfig,
  path: string,
  home: GateHome | undefined
): Promise<Launch> => {
  const door = await import("./browser/door");
  const args =
    name === door.CHROME_DEVTOOLS
      ? [
          ...door.throughGate(
            config.args ?? [],
            await door.browserDoor(ports, gateId, home?.projectId)
          ),
          ...(home ? [] : [`--filesystem-root=${workspaceScratchDir(gateId)}`]),
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
export class Hosted {
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
      const read = parseRecord(kept, readFileSync(kept, "utf8"), KeptSchema);
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
    const capabilities = asRecord(kept.initialize.capabilities) ?? {};
    for (const method of methods) {
      const { items, capability } = LIST_METHODS[method] ?? {};
      if (items && capability && capabilities[capability]) {
        kept.lists[method] = await this.#pages(child, method, items);
      }
    }
    makeFolderSync(hostDir());
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
        return all;
      }
    }
    console.warn(
      `[mcp-host] ${this.name}: ${method} stopped at ${MOST_PAGES} pages; the rest is not listed`
    );
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
    message: JsonRpcMessage,
    signal: AbortSignal
  ): Promise<JsonRpcMessage | undefined> {
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

const RECORD = z.record(z.string(), z.unknown());

const asRecord = (value: unknown): Record<string, unknown> | undefined => {
  const record = RECORD.safeParse(value);
  return record.success ? record.data : undefined;
};

/**
 * Capabilities as a session reads them: no list-changed, no resource
 * subscriptions and no logging, since a session holds no stream the host
 * could tell it on (`GET` answers 405); lists are read again whenever a
 * session asks.
 */
const quiet = (capabilities: unknown): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(asRecord(capabilities) ?? {})) {
    if (name === "logging") {
      continue;
    }
    out[name] =
      value && typeof value === "object"
        ? {
            ...asRecord(value),
            ...("listChanged" in value ? { listChanged: false } : {}),
            ...("subscribe" in value ? { subscribe: false } : {}),
          }
        : value;
  }
  return out;
};

const MESSAGES = z.array(JsonRpcMessageSchema).min(1);

/** The JSON-RPC message or batch a POST carries, or why it carries none. */
const messagesOf = (
  body: string
):
  | { batch: boolean; messages: JsonRpcMessage[] }
  | { error: JsonRpcMessage } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { error: rpcError(null, PARSE_ERROR, "The body is not JSON.") };
  }
  const batch = Array.isArray(parsed);
  const messages = MESSAGES.safeParse(batch ? parsed : [parsed]);
  if (!messages.success) {
    return {
      error: rpcError(
        null,
        INVALID_REQUEST,
        "No JSON-RPC message in the body."
      ),
    };
  }
  return { batch, messages: messages.data };
};

/** The machine's shared servers, by name. */
class McpHost {
  readonly #servers = new Map<string, Hosted>();

  /**
   * The shared servers as the fleet's latest sync names them, each with its
   * resolved command (mcp-launcher.ts). One whose config changed, or that is
   * no longer shared, is ended; its next call starts the new one. The set is
   * kept on disk for the next agent ({@link restore}).
   */
  configure(servers: { name: string; config: HostedConfig }[]): void {
    this.#take(servers);
    makeFolderSync(hostDir());
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
      kept = parseRecord(
        sharedFile(),
        readFileSync(sharedFile(), "utf8"),
        z.array(z.object({ name: z.string(), config: FleetMcpConfigSchema }))
      ).flatMap(({ name, config }) =>
        "command" in config ? [{ name, config }] : []
      );
    } catch {
      return;
    }
    this.#take(kept);
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
    {
      home: GateHome | undefined;
      readonly members: Set<string>;
      readonly servers: Map<string, Hosted>;
    }
  >();

  #gate(gateId: string) {
    let gate = this.#gates.get(gateId);
    if (!gate) {
      gate = { home: undefined, members: new Set(), servers: new Map() };
      this.#gates.set(gateId, gate);
    }
    return gate;
  }

  /** Each member holding a gate, by its token's name ({@link tokenName}). */
  readonly #tokens = new Map<string, GateMember & { gateId: string }>();

  /**
   * A session's process (`member`) holds gate `gateId` from now, and its
   * token opens the gate ({@link memberToken}); `home` names the folder of a
   * gate that is no workspace's ({@link GateHome}). A gate with no folder
   * (a fenced session's) relays CawCo's server alone.
   */
  joinGate(gateId: string, member: GateMember, home?: GateHome): void {
    const gate = this.#gate(gateId);
    gate.members.add(member.key);
    this.#tokens.set(tokenName(memberToken(gateId, member)), {
      ...member,
      gateId,
    });
    if (home) {
      gate.home = home;
    }
  }

  /**
   * A session's process no longer holds gate `gateId`: with the last one, the
   * gate's processes end. A later call starts them again.
   */
  leaveGate(gateId: string, member: GateMember): void {
    this.#tokens.delete(tokenName(memberToken(gateId, member)));
    const gate = this.#gates.get(gateId);
    if (!gate?.members.delete(member.key) || gate.members.size > 0) {
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
      left = parseRecord(
        startedFile(),
        readFileSync(startedFile(), "utf8"),
        z.array(z.object({ pid: z.number(), start: z.string() }))
      );
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
   * Who calls gate `gateId`: a member, by the token its harness carries
   * ({@link GATE_TOKEN_HEADER}) while it holds that gate; OpenCode's plugin,
   * by the host key, which it reads from its file and which reaches the
   * fleet's servers but not CawCo's (an OpenCode server holds many
   * sessions, so no one session's credential); else nobody.
   */
  #caller(
    gateId: string,
    request: Request
  ): GateMember | "host key" | undefined {
    const token = request.headers.get(GATE_TOKEN_HEADER);
    if (token !== null) {
      const member = this.#tokens.get(tokenName(token));
      return member?.gateId === gateId ? member : undefined;
    }
    return carriesKey(request.headers.get("Authorization"))
      ? "host key"
      : undefined;
  }

  /**
   * What one harness request on `/mcp/gate/<gate id>/<name>` (mcp-gate.ts)
   * reaches. CawCo's own server (`cawco`) is relayed for the member that
   * asks, with its session's credential. Any other `name` is the fleet's
   * server as the fleet's latest sync names it for the gate's folder
   * (placed copies too: its workspace's, or the home its sessions named as
   * they joined): one with a command served as a shared one is, by its own
   * process for this gate, a config that changed since its process started
   * ending it so the next call starts the new one; a remote one (streamable
   * HTTP or SSE) relayed with its own headers. A gate no session holds and no workspace
   * names has no folder, and reaches no fleet server.
   */
  async gateTarget(
    ports: BrowserPorts,
    gateId: string,
    name: string,
    request: Request
  ): Promise<GateTarget> {
    const id = decodeURIComponent(gateId);
    const server = decodeURIComponent(name);
    const caller = this.#caller(id, request);
    if (!caller) {
      return refusal(401, mcpGateWords.notOpened);
    }
    if (server === MCP_SERVER_NAME) {
      if (caller === "host key") {
        return refusal(403, mcpGateWords.needsSessionToken);
      }
      const credential = sessionCredentialOf(caller.instanceId);
      if (!credential) {
        return refusal(503, mcpGateWords.notProved(caller.instanceId));
      }
      const own = delegationMcp(caller.instanceId, credential);
      return { remote: { url: own.url, headers: own.headers ?? {} } };
    }
    const home = this.#gates.get(id)?.home;
    const path =
      home?.path ?? (GATE_ID.test(id) ? await workspacePath(id) : undefined);
    if (!path) {
      return refusal(
        404,
        `${id} is not a workspace on this machine, nor a session's gate that one holds.`
      );
    }
    const config = (await fleetMcpAt(path))[server];
    if (config && "command" in config) {
      const gate = this.#gate(id);
      let hosted = gate.servers.get(server);
      if (hosted?.key !== keyOf(config)) {
        hosted?.stop();
        hosted = new Hosted(server, config, gateKeptFile(keyOf(config)), () =>
          gateLaunch(ports, id, server, config, path, home)
        );
        gate.servers.set(server, hosted);
      }
      return { hosted };
    }
    if (config && "url" in config) {
      return {
        remote: {
          url: config.url,
          headers: config.headers ?? {},
          ...(config.type === "sse" ? { sse: true as const } : {}),
        },
      };
    }
    return refusal(
      404,
      `${server} is not a fleet MCP server this machine runs for ${id}.`
    );
  }
}

/** One harness request to `hosted` (Streamable HTTP, answered as JSON with no session). */
export const serve = async (
  hosted: Hosted,
  request: Request
): Promise<Response> => {
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
          .catch((error: unknown): JsonRpcMessage =>
            rpcError(
              message.id,
              SERVER_ERROR,
              error instanceof Error ? error.message : String(error)
            )
          )
      )
    )
  ).filter((answer): answer is JsonRpcMessage => answer !== undefined);
  if (answers.length === 0) {
    return new Response(null, { status: 202 });
  }
  return Response.json(read.batch ? answers : answers[0]);
};

/** This agent's one host, served by its gateway. */
export const mcpHost = new McpHost();

process.once("exit", () => mcpHost.stopAll());
