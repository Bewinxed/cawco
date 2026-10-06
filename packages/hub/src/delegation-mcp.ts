import { unwatchFile, watchFile } from "node:fs";
import type { Envelope, InstanceRow } from "@cawco/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { adminTools } from "./admin-tools";
import { handoffInstructions, handoffTools } from "./delegation-tools";

type ToolFactory = typeof handoffTools;

/** Tools that run for minutes, and what their progress heartbeat says meanwhile. */
const LONG_CALLS: Record<string, string> = {
  delegate: "Creating the delegate's workspace",
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
  finish_item: "Running the work item's acceptance checks",
  start_session: "Waiting for the machine to start the session",
};

declare const __CAWCO_RELEASE__: boolean | undefined;

/**
 * Fleet administration (the `manage_*` tools) belongs to the sessions the
 * operator started. A delegate, a work item, a workflow step or a leaf session
 * never sees those tools listed and is refused if it names one: a session that
 * read a poisoned page must not be one call away from a hook on every machine.
 * The hub's REST API stays reachable on the network (PRODUCT.md's perimeter);
 * this removes the path an agent is handed, not the wall.
 */
const administers = (actor: InstanceRow | undefined): boolean =>
  !!actor &&
  !actor.parentInstanceId &&
  !actor.workItemId &&
  !actor.workflowStepId &&
  actor.canDelegate !== false;

export function createDelegationMcp(options: {
  instances: () => InstanceRow[];
  instanceById: (id: string) => InstanceRow | undefined;
  forward: (envelope: Envelope, actor: InstanceRow) => Promise<void>;
  credentialActor: (authorization: string | null) => InstanceRow | undefined;
  tools?: ToolFactory;
}) {
  let tools = options.tools ?? handoffTools;
  let admin = adminTools();
  let adminNames = new Set(admin.map((t) => t.name));
  const moduleUrl = new URL("./delegation-tools.ts", import.meta.url);
  const adminModuleUrl = new URL("./admin-tools.ts", import.meta.url);
  if (typeof __CAWCO_RELEASE__ !== "boolean") {
    // Reload source definitions for the next request, without client notifications.
    watchFile(moduleUrl, { interval: 1000, persistent: false }, () => {
      // biome-ignore lint/complexity/noVoid: the watcher reports a reload failure and preserves the registry.
      void import(`${moduleUrl.href}?revision=${Date.now()}`)
        .then((module) => {
          const definitions = module.handoffTools({
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
          tools = module.handoffTools;
        })
        .catch((error) =>
          console.error("[delegation-mcp] tool reload failed", error)
        );
    });
    watchFile(adminModuleUrl, { interval: 1000, persistent: false }, () => {
      // biome-ignore lint/complexity/noVoid: the watcher reports a reload failure and preserves the registry.
      void import(`${adminModuleUrl.href}?revision=${Date.now()}`)
        .then((module) => {
          admin = module.adminTools();
          adminNames = new Set(admin.map((tool) => tool.name));
        })
        .catch((error) =>
          console.error("[delegation-mcp] admin reload failed", error)
        );
    });
  }

  const describe = (
    canDelegate?: boolean,
    workflowStepId?: string,
    workItem?: boolean,
    withAdmin = true
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
    ...(withAdmin ? admin : []),
  ];

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

  /** A `manage_*` call, run only for a session that {@link administers}. */
  const administer = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult> => {
    if (!administers(actor)) {
      throw new Error(
        `${name} isn't available here: only sessions you started can change fleet settings, and this one is a delegate, work item or workflow step. Hand the change to the session that started it.`
      );
    }
    const entry = admin.find((tool) => tool.name === name);
    if (!entry) {
      throw new Error(`Unknown tool ${name}`);
    }
    return (await entry.handler(input)) as CallToolResult;
  };

  /**
   * The tools that act on the fleet rather than on a session: the delegate-type
   * catalog, which anyone may read without an actor, and the `manage_*` tools,
   * which resolve their caller first. Undefined for every other tool.
   */
  const fleetCall = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    input: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult | undefined> => {
    if (name === "list_delegate_types") {
      const entry = describe().find((tool) => tool.name === name);
      if (!entry) {
        throw new Error(`Unknown tool ${name}`);
      }
      return (await entry.handler(input)) as CallToolResult;
    }
    if (!adminNames.has(name)) {
      return undefined;
    }
    return await administer(actorOf(binding, args, authorization), name, input);
  };

  const call = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult> => {
    try {
      // Routing context belongs to the bridge, not to a tool's input schema.
      const { __cawco: _context, ...input } = args;
      const fleet = await fleetCall(binding, name, args, input, authorization);
      if (fleet) {
        return fleet;
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
        workItem: !!actor.parentInstanceId,
        workflowStepId: actor.workflowStepId ?? undefined,
        workflowRunId: actor.workflowRunId ?? undefined,
        emit: (envelope) => emitted.push(envelope),
      }).find((tool) => tool.name === name);
      if (!entry) {
        throw new Error(`Tool ${name} is unavailable to this session`);
      }
      const result = (await entry.handler(input)) as CallToolResult;
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

  /** Every request carries its own actor; no connection state outlives it. */
  const open = async (binding: string | null) => {
    const bound = binding
      ? options.instances().find((row) => row.id === binding)
      : undefined;
    const canDelegate = bound?.canDelegate ?? undefined;
    const server = new Server(
      { name: "cawco", version: "1.0.0" },
      {
        capabilities: { tools: {} },
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
      sessionIdGenerator: undefined,
      // Send headers immediately; image generation must not sit behind HTTP first-byte deadlines.
      enableJsonResponse: false,
    });
    // Delegate role is fixed across items/checks. Shared OpenCode discovery
    // lists the superset; each invocation resolves its actor and enforces role.
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: describe(
        canDelegate,
        bound?.workflowStepId ?? undefined,
        binding === null || !!bound?.parentInstanceId,
        binding === null || administers(bound)
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
    return { transport, server };
  };

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
    const binding = requestBinding(request);
    if (binding instanceof Response) {
      return binding;
    }
    if (request.method !== "POST") {
      return new Response("CawCo MCP accepts POST requests only", {
        status: 405,
        headers: { Allow: "POST" },
      });
    }
    const { transport, server } = await open(binding);
    // Stateless SDK validation ignores old Mcp-Session-Id headers. Keep the
    // server alive until the POST SSE body completes, including long tools.
    const response = await transport.handleRequest(request, { parsedBody });
    if (!response.body) {
      await server.close();
      return response;
    }
    const reader = response.body.getReader();
    return new Response(
      new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              await server.close();
            } else {
              controller.enqueue(value);
            }
          } catch (error) {
            controller.error(error);
            await server.close();
          }
        },
        async cancel(reason) {
          await reader.cancel(reason);
          await server.close();
        },
      }),
      { status: response.status, headers: response.headers }
    );
  };
  const list = (instanceId?: string) => {
    const actor = instanceId
      ? options.instances().find((row) => row.id === instanceId)
      : undefined;
    return {
      tools: describe(
        actor?.canDelegate ?? undefined,
        actor?.workflowStepId ?? undefined,
        instanceId === undefined || !!actor?.parentInstanceId,
        instanceId === undefined || administers(actor)
      ).map(({ name, description, inputSchema, ...entry }) => ({
        name,
        description,
        inputSchema,
        ...("annotations" in entry ? { annotations: entry.annotations } : {}),
      })),
    };
  };
  const close = () => {
    unwatchFile(moduleUrl);
    unwatchFile(adminModuleUrl);
  };
  return { handle, call, list, close };
}
