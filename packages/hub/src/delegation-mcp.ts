import { unwatchFile, watchFile } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Envelope, InstanceRow } from "@whiffle/core";
import { adminTools } from "./admin-tools";
import { HUB_PORT } from "./config";
import { handoffInstructions, handoffTools } from "./delegation-tools";

type ToolFactory = typeof handoffTools;

/** Tools that run for minutes, and what their progress heartbeat says meanwhile. */
const LONG_CALLS: Record<string, string> = {
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
};

/**
 * Defined only in the published package's bundle (scripts/build-release.mjs),
 * where the tool modules are folded into `cli.js` and there is no source file
 * to reload.
 */
declare const __WHIFFLE_RELEASE__: boolean | undefined;

export function createDelegationMcp(options: {
  instances: () => InstanceRow[];
  baseUrl?: string;
  tools?: ToolFactory;
}) {
  let tools = options.tools ?? handoffTools;
  const baseUrl = options.baseUrl ?? `http://127.0.0.1:${HUB_PORT}`;
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

  const describe = (canDelegate?: boolean, workflowStepId?: string) => [
    ...tools({
      instanceId: "",
      cwd: "",
      canDelegate,
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
  if (typeof __WHIFFLE_RELEASE__ !== "boolean") {
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

  const actorOf = (binding: string | null, args: Record<string, unknown>) => {
    const rows = options.instances();
    if (binding) {
      const actor = rows.find((row) => row.id === binding);
      if (!actor) {
        throw new Error(
          "This MCP connection's session is no longer registered"
        );
      }
      return actor;
    }
    const context = args.__whiffle as
      | { sessionId?: string; directory?: string }
      | undefined;
    const candidates = rows.filter(
      (row) =>
        row.harness === "opencode" &&
        row.sessionId === context?.sessionId &&
        row.cwd === context?.directory &&
        ["running", "starting"].includes(row.status)
    );
    if (candidates.length !== 1) {
      throw new Error(
        "Whiffle requires one registered session matching the harness-injected context"
      );
    }
    return candidates[0];
  };

  const forward = async (envelope: Envelope, actor: InstanceRow) => {
    let operation = envelope.verb as string;
    let body = envelope.payload as Record<string, unknown>;
    if (envelope.verb === "frames") {
      operation = "message";
      body = { ...body, machineId: actor.machineId };
    } else if (envelope.verb === "spawn" || envelope.verb === "send") {
      // A send names its target's machine; a session it starts runs on the
      // caller's.
      body = { ...body, machineId: envelope.machineId || actor.machineId };
    } else if (envelope.verb === "control") {
      if (body.method === "interrupt") {
        operation = "interrupt";
      } else if (body.method === "resolvePermission") {
        operation = "answer";
        body = { ...body, result: (body.args as unknown[])[1] };
      } else {
        throw new Error(
          `Unsupported delegation control ${String(body.method)}`
        );
      }
    }
    const response = await fetch(`${baseUrl}/api/relay/${operation}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const text = await response.text();
      // A 4xx is the hub refusing, in words written for the calling model.
      throw new Error(
        response.status < 500
          ? text
          : `Whiffle ${operation}: HTTP ${response.status}: ${text}`
      );
    }
  };

  const call = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>
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
      const actor = actorOf(binding, args);
      const emitted: Envelope[] = [];
      const entry = tools({
        instanceId: actor.id,
        cwd: actor.cwd,
        harness: actor.harness as "claude" | "opencode" | "pi",
        canDelegate: actor.canDelegate ?? undefined,
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
        await forward(envelope, actor);
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

  const handle = async (
    request: Request,
    parsedBody?: unknown
  ): Promise<Response> => {
    const id = request.headers.get("mcp-session-id");
    if (id) {
      const connection = sessions.get(id);
      if (!connection) {
        return Response.json(
          { error: "Unknown MCP session; reconnect" },
          { status: 404 }
        );
      }
      return connection.transport.handleRequest(request, { parsedBody });
    }
    if (request.method !== "POST") {
      return new Response("Initialize MCP first", { status: 400 });
    }
    const body = parsedBody ?? (await request.json());
    if ((body as { method?: string } | null)?.method !== "initialize") {
      return new Response("Initialize MCP first", { status: 400 });
    }
    const binding = new URL(request.url).searchParams.get("instanceId");
    if (binding && !options.instances().some((row) => row.id === binding)) {
      return new Response("Unknown Whiffle instance", { status: 404 });
    }
    const bound = binding
      ? options.instances().find((row) => row.id === binding)
      : undefined;
    const canDelegate = bound?.canDelegate ?? undefined;
    const server = new Server(
      { name: "whiffle", version: "1.0.0" },
      {
        capabilities: { tools: { listChanged: true } },
        instructions: handoffInstructions({
          instanceId: binding ?? "",
          cwd: bound?.cwd ?? "",
          harness: bound?.harness as "claude" | "opencode" | "pi" | undefined,
          canDelegate,
          emit: () => undefined,
        }),
      }
    );
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      // Send headers immediately; image generation must not sit behind HTTP first-byte deadlines.
      enableJsonResponse: false,
      onsessioninitialized: (sessionId) => {
        sessions.set(sessionId, { transport, server, binding });
      },
      onsessionclosed: (sessionId) => {
        sessions.delete(sessionId);
      },
    });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: describe(canDelegate, bound?.workflowStepId ?? undefined).map(
        ({ name, description, inputSchema, ...entry }) => ({
          name,
          description,
          inputSchema: inputSchema as { type: "object" },
          ...("annotations" in entry ? { annotations: entry.annotations } : {}),
        })
      ),
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
          message.params.arguments ?? {}
        );
      } finally {
        clearInterval(heartbeat);
      }
    });
    await server.connect(transport);
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
        actor?.workflowStepId ?? undefined
      ).map(({ name, description, inputSchema, ...entry }) => ({
        name,
        description,
        inputSchema,
        ...("annotations" in entry ? { annotations: entry.annotations } : {}),
      })),
    };
  };
  return { handle, call, replaceTools, close, list };
}
