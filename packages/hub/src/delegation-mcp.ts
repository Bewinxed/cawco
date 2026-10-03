import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  unwatchFile,
  watchFile,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import type { Envelope, InstanceRow } from "@cawco/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  LATEST_PROTOCOL_VERSION,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { adminTools } from "./admin-tools";
import { handoffInstructions, handoffTools } from "./delegation-tools";
import { mcpSigningKeyPath } from "./session-identity";

type ToolFactory = typeof handoffTools;

/** Tools that run for minutes, and what their progress heartbeat says meanwhile. */
const LONG_CALLS: Record<string, string> = {
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
  finish_item: "Running the work item's acceptance checks",
  start_session: "Waiting for the machine to start the session",
};

/**
 * Defined only in the published package's bundle (scripts/build-release.mjs),
 * where the tool modules are folded into `cli.js` and there is no source file
 * to reload.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

/**
 * The key MCP session ids are signed with, beside the hub's database so a
 * restart keeps it: made once, readable by the hub's user alone.
 */
function sessionKey(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, randomBytes(32), { mode: 0o600, flag: "wx" });
  return readFileSync(path);
}

export function createDelegationMcp(options: {
  instances: () => InstanceRow[];
  instanceById: (id: string) => InstanceRow | undefined;
  /** Whether the session runs a work item with acceptance checks: it gets finish_item. */
  checked: (row: InstanceRow) => boolean;
  forward: (envelope: Envelope, actor: InstanceRow) => Promise<void>;
  credentialActor: (authorization: string | null) => InstanceRow | undefined;
  tools?: ToolFactory;
}) {
  let tools = options.tools ?? handoffTools;
  const secret = sessionKey(mcpSigningKeyPath());
  const sessions = new Map<
    string,
    {
      transport: WebStandardStreamableHTTPServerTransport;
      server: Server;
      binding: string | null;
    }
  >();
  let admin = adminTools();
  let adminNames = new Set(admin.map((t) => t.name));

  const describe = (
    canDelegate?: boolean,
    workflowStepId?: string,
    workItem?: boolean
  ) => [
    ...tools({
      instanceId: "",
      instanceById: options.instanceById,
      cwd: "",
      canDelegate,
      workItem,
      workflowStepId,
      workflowRunId: workflowStepId ? "" : undefined,
      emit: () => {
        throw new Error("Discovery cannot execute tools");
      },
    }),
    ...admin,
  ];

  const replaceTools = async (next: ToolFactory) => {
    const definitions = next({
      instanceId: "",
      instanceById: options.instanceById,
      cwd: "",
      emit: () => {
        throw new Error("Discovery cannot execute tools");
      },
    });
    const all = [...definitions, ...admin];
    if (new Set(all.map((tool) => tool.name)).size !== all.length) {
      throw new Error("Duplicate delegation tool names");
    }
    tools = next;
    await Promise.all(
      [...sessions.values()].map(({ server }) =>
        server
          .notification({ method: "notifications/tools/list_changed" })
          .catch((error) =>
            console.warn("[delegation-mcp] notification failed", error)
          )
      )
    );
  };

  const moduleUrl = new URL("./delegation-tools.ts", import.meta.url);
  const adminModuleUrl = new URL("./admin-tools.ts", import.meta.url);
  if (typeof __CAWCO_RELEASE__ !== "boolean") {
    // Our choice: one-second polling keeps deployment updates responsive without a watcher per session.
    watchFile(moduleUrl, { interval: 1000, persistent: false }, () => {
      // biome-ignore lint/complexity/noVoid: file watcher callback cannot await; errors preserve the previous registry below
      void import(`${moduleUrl.href}?revision=${Date.now()}`)
        .then((module) => replaceTools(module.handoffTools))
        .catch((error) =>
          console.error(
            "[delegation-mcp] keeping previous tool registry after reload failure",
            error
          )
        );
    });
    watchFile(adminModuleUrl, { interval: 1000, persistent: false }, () => {
      // biome-ignore lint/complexity/noVoid: file watcher callback cannot await; errors preserve the previous admin registry
      void import(`${adminModuleUrl.href}?revision=${Date.now()}`)
        .then((module) => {
          admin = module.adminTools();
          adminNames = new Set(admin.map((t: { name: string }) => t.name));
        })
        .then(() =>
          Promise.all(
            [...sessions.values()].map(({ server }) =>
              server
                .notification({ method: "notifications/tools/list_changed" })
                // biome-ignore lint/suspicious/noNestedPromises: per-session notification errors are swallowed individually inside the map; the same pattern the handoff watcher uses above.
                .catch((error) =>
                  console.warn("[delegation-mcp] notification failed", error)
                )
            )
          )
        )
        .catch((error) =>
          console.error(
            "[delegation-mcp] keeping previous admin tool registry after reload failure",
            error
          )
        );
    });
  }

  // Temporary until Phase 2's per-session credentials replace this resolver.
  // PRODUCT.md trusts the network perimeter; here malformed/unknown identities
  // are refused, but deliberate same-UID impersonation is not yet prevented.
  const actorOf = (
    binding: string | null,
    args: Record<string, unknown>,
    authorization?: string
  ) => {
    if (authorization !== undefined) {
      const actor = options.credentialActor(authorization);
      if (!actor) {
        throw new Error("Invalid session credential");
      }
      if (binding !== null && actor.id !== binding) {
        throw new Error(
          "Session credential does not belong to the named instanceId"
        );
      }
      return actor;
    }
    return legacyActorOf(binding, args);
  };

  const legacyActorOf = (
    binding: string | null,
    args: Record<string, unknown>
  ) => {
    const rows = options.instances();
    if (binding !== null) {
      if (typeof binding !== "string" || !binding.trim()) {
        throw new Error("CawCo instanceId must be a non-empty string");
      }
      const actor = rows.find((row) => row.id === binding);
      if (!actor) {
        throw new Error(
          "This MCP connection's session is no longer registered"
        );
      }
      return actor;
    }
    const context = args.__cawco;
    if (
      typeof context !== "object" ||
      context === null ||
      Array.isArray(context) ||
      !("sessionId" in context && "directory" in context) ||
      typeof context.sessionId !== "string" ||
      !context.sessionId.trim() ||
      typeof context.directory !== "string" ||
      !context.directory.trim()
    ) {
      throw new Error(
        "CawCo requires __cawco with non-empty sessionId and directory strings"
      );
    }
    const candidates = rows.filter(
      (row) =>
        row.harness === "opencode" &&
        row.sessionId === context.sessionId &&
        row.cwd === context.directory &&
        ["running", "starting"].includes(row.status)
    );
    if (candidates.length !== 1) {
      throw new Error(
        "CawCo requires one registered session matching the harness-injected context"
      );
    }
    return candidates[0];
  };

  const call = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult> => {
    try {
      // Fleet-wide tools: no actor needed — they call the hub API directly.
      if (name === "list_delegate_types" || adminNames.has(name)) {
        const entry = describe().find((tool) => tool.name === name);
        if (!entry) {
          throw new Error(`Unknown tool ${name}`);
        }
        return (await entry.handler(args)) as CallToolResult;
      }
      const actor = actorOf(binding, args, authorization);
      const emitted: Envelope[] = [];
      const entry = tools({
        instanceId: actor.id,
        instanceById: options.instanceById,
        authorization,
        cwd: actor.cwd,
        harness: actor.harness as "claude" | "opencode" | "pi",
        canDelegate: actor.canDelegate ?? undefined,
        workItem: options.checked(actor),
        workflowStepId: actor.workflowStepId ?? undefined,
        workflowRunId: actor.workflowRunId ?? undefined,
        emit: (envelope) => emitted.push(envelope),
      }).find((tool) => tool.name === name);
      if (!entry) {
        throw new Error(`Tool ${name} is unavailable to this session`);
      }
      const result = (await entry.handler(args)) as CallToolResult;
      for (const envelope of emitted) {
        // biome-ignore lint/performance/noAwaitInLoops: spawn must finish before its first send is relayed
        await options.forward(envelope, actor);
      }
      // Keep routing metadata recoverable in stored transcripts even when a harness drops structuredContent.
      if (result.structuredContent) {
        result.content = [
          {
            type: "text",
            text: JSON.stringify({
              ...result.structuredContent,
              text: result.content,
            }),
          },
        ];
      }
      return result;
    } catch (error) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  };

  /**
   * A session id names the instance its connection is bound to: a nonce and
   * an HMAC of nonce and binding under the hub's key, which outlives the
   * process. A restart forgets every connection, and the id a client still
   * sends is enough to put its connection back — for the binding it was
   * minted for and no other.
   */
  const signed = (nonce: string, binding: string | null) =>
    createHmac("sha256", secret)
      .update(`${nonce}:${binding ?? ""}`)
      .digest("base64url");
  const mint = (binding: string | null) => {
    const nonce = randomUUID();
    return `${nonce}.${signed(nonce, binding)}`;
  };
  const mintedFor = (id: string, binding: string | null): boolean => {
    const [nonce, signature, extra] = id.split(".");
    if (!(nonce && signature) || extra !== undefined) {
      return false;
    }
    const expected = Buffer.from(signed(nonce, binding));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  };

  /** One connection — its server and transport — bound to `binding`, under `id`. */
  const open = async (binding: string | null, id: string) => {
    const bound = binding
      ? options.instances().find((row) => row.id === binding)
      : undefined;
    const canDelegate = bound?.canDelegate ?? undefined;
    const server = new Server(
      { name: "cawco", version: "1.0.0" },
      {
        capabilities: { tools: { listChanged: true } },
        instructions: handoffInstructions({
          instanceId: binding ?? "",
          instanceById: options.instanceById,
          cwd: bound?.cwd ?? "",
          harness: bound?.harness as "claude" | "opencode" | "pi" | undefined,
          canDelegate,
          emit: () => undefined,
        }),
      }
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => id,
      // Send headers immediately; image generation must not sit behind HTTP first-byte deadlines.
      enableJsonResponse: false,
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, server, binding });
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    // Read when the tools are listed, not when the connection opened: a
    // session given a work item later lists finish_item once told to
    // ({@link toolsChanged}). A connection bound to no session (OpenCode's,
    // resolved per call) always offers it, and a call refuses it there for a
    // session with no work item.
    const workItem = (): boolean => {
      if (!binding) {
        return true;
      }
      const row = options.instances().find((r) => r.id === binding);
      return row ? options.checked(row) : false;
    };
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: describe(
        canDelegate,
        bound?.workflowStepId ?? undefined,
        workItem()
      ).map(({ name, description, inputSchema, ...entry }) => ({
        name,
        description,
        inputSchema: inputSchema as { type: "object" },
        ...("annotations" in entry ? { annotations: entry.annotations } : {}),
      })),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (message, extra) => {
      const token = message.params._meta?.progressToken;
      let elapsed = 0;
      const doing = LONG_CALLS[message.params.name];
      const heartbeat =
        doing && token !== undefined
          ? setInterval(() => {
              elapsed += 15;
              // biome-ignore lint/complexity/noVoid: progress is fire-and-forget; a disconnected client cannot receive it.
              void extra
                .sendNotification({
                  method: "notifications/progress",
                  params: {
                    progressToken: token,
                    progress: elapsed,
                    message: `${doing} (${elapsed}s elapsed).`,
                  },
                })
                .catch(() => undefined);
            }, 15_000)
          : undefined;
      try {
        return await call(
          binding,
          message.params.name,
          message.params.arguments ?? {},
          typeof extra.requestInfo?.headers.authorization === "string"
            ? extra.requestInfo.headers.authorization
            : undefined
        );
      } finally {
        clearInterval(heartbeat);
      }
    });
    await server.connect(transport);
    return transport;
  };

  /**
   * Puts back a connection this process never opened: the client holds an id
   * a previous hub minted, and a restart is not its business. Only for the
   * binding the id was signed for; the transport is brought to where the
   * client believes it is through its own handshake, with the protocol
   * version the client is speaking, before its request is served.
   */
  const restoring = new Map<
    string,
    Promise<WebStandardStreamableHTTPServerTransport>
  >();
  const restore = (
    request: Request,
    binding: string | null,
    id: string
  ): Promise<WebStandardStreamableHTTPServerTransport> => {
    const pending = restoring.get(id);
    if (pending) {
      return pending;
    }
    const restored = (async () => {
      const transport = await open(binding, id);
      const version =
        request.headers.get("mcp-protocol-version") ?? LATEST_PROTOCOL_VERSION;
      const handshake = (message: object, session?: string) =>
        transport
          .handleRequest(
            new Request(request.url, {
              method: "POST",
              headers: {
                accept: "application/json, text/event-stream",
                "content-type": "application/json",
                "mcp-protocol-version": version,
                ...(session ? { "mcp-session-id": session } : {}),
              },
              body: JSON.stringify({ jsonrpc: "2.0", ...message }),
            })
          )
          .then((response) => response.text());
      await handshake({
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: version,
          capabilities: {},
          clientInfo: { name: "cawco-restored-session", version: "1" },
        },
      });
      await handshake({ method: "notifications/initialized" }, id);
      return transport;
    })().finally(() => restoring.delete(id));
    restoring.set(id, restored);
    return restored;
  };

  /** The spec's answer to an id it does not know: the client starts a new session. */
  const sessionNotFound = () =>
    Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32_001, message: "Session not found" },
        id: null,
      },
      { status: 404 }
    );

  const bindingProblem = (bindings: string[]): Response | undefined => {
    const [binding] = bindings;
    if (bindings.length > 1 || (binding !== undefined && !binding.trim())) {
      return new Response("CawCo instanceId must be one non-empty string", {
        status: 400,
      });
    }
    if (
      binding !== undefined &&
      !options.instances().some((row) => row.id === binding)
    ) {
      return new Response("Unknown CawCo instanceId", { status: 400 });
    }
    return undefined;
  };

  const requestBinding = (request: Request): string | null | Response => {
    const authorization = request.headers.get("authorization");
    const actor = options.credentialActor(authorization);
    if (authorization !== null && !actor) {
      return new Response("Invalid session credential", { status: 401 });
    }
    const bindings = new URL(request.url).searchParams.getAll("instanceId");
    const invalid = bindingProblem(bindings);
    if (invalid) {
      return invalid;
    }
    if (actor && bindings[0] !== undefined && bindings[0] !== actor.id) {
      return new Response(
        "Session credential does not belong to the named instanceId",
        { status: 403 }
      );
    }
    return actor?.id ?? bindings[0] ?? null;
  };

  const handle = async (
    request: Request,
    parsedBody?: unknown
  ): Promise<Response> => {
    const id = request.headers.get("mcp-session-id");
    const binding = requestBinding(request);
    if (binding instanceof Response) {
      return binding;
    }
    const live = id ? sessions.get(id) : undefined;
    if (live) {
      // A connection answers only on the URL it was opened on: its id names
      // one instance, and another instance's URL does not borrow it.
      return live.binding === binding
        ? live.transport.handleRequest(request, { parsedBody })
        : sessionNotFound();
    }
    // Opening a connection, or putting one back, binds it to the instance its
    // URL names: one the hub has a row for.
    if (id) {
      if (!mintedFor(id, binding)) {
        return sessionNotFound();
      }
      const transport = await restore(request, binding, id);
      return transport.handleRequest(request, { parsedBody });
    }
    if (request.method !== "POST") {
      return new Response("Initialize MCP first", { status: 400 });
    }
    const body = parsedBody ?? (await request.json());
    if ((body as { method?: string } | null)?.method !== "initialize") {
      return new Response("Initialize MCP first", { status: 400 });
    }
    const transport = await open(binding, mint(binding));
    return transport.handleRequest(request, { parsedBody: body });
  };
  const close = async () => {
    unwatchFile(moduleUrl);
    unwatchFile(adminModuleUrl);
    await Promise.all(
      [...sessions.values()].map(({ server }) => server.close())
    );
    sessions.clear();
  };
  const list = (instanceId?: string) => {
    const actor = instanceId
      ? options.instances().find((row) => row.id === instanceId)
      : undefined;
    return {
      tools: describe(
        actor?.canDelegate ?? undefined,
        actor?.workflowStepId ?? undefined,
        actor ? options.checked(actor) : false
      ).map(({ name, description, inputSchema, ...entry }) => ({
        name,
        description,
        inputSchema,
        ...("annotations" in entry ? { annotations: entry.annotations } : {}),
      })),
    };
  };
  /** Tells the connections bound to one session that its tool list moved. */
  const toolsChanged = (instanceId: string): void => {
    for (const { server, binding } of sessions.values()) {
      if (binding === instanceId) {
        server
          .notification({ method: "notifications/tools/list_changed" })
          .catch((error) =>
            console.warn("[delegation-mcp] notification failed", error)
          );
      }
    }
  };
  return { handle, call, replaceTools, close, list, toolsChanged };
}
