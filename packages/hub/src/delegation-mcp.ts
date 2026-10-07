import { unwatchFile, watchFile } from "node:fs";
import type { Envelope, InstanceRow, LandsMode } from "@cawco/core";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  type CallToolResult,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { adminTools, isAdminWrite } from "./admin-tools";
import type { Caw } from "./caw";
import { handoffInstructions, handoffTools } from "./delegation-tools";
import type { AttemptStart } from "./dispatch";
import {
  type AcceptResult,
  mayMakeProject,
  PROJECT_FROM_SESSION,
  projectFromSessionTool,
} from "./project-offers";
import { admitToolCall } from "./restart-holds";
import { allows, refusal, roleOf, THREAD_TOOLS } from "./roles";
import { TASK_TOOLS, taskTools } from "./task-tools";
import type { Tasks } from "./tasks";

type ToolFactory = typeof handoffTools;
type ThreadTool = ReturnType<Caw["tools"]>[number];

/** Tools that run for minutes, and what their progress heartbeat says meanwhile. */
const LONG_CALLS: Record<string, string> = {
  delegate: "Creating the delegate's workspace",
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
  finish_item: "Running the work item's acceptance checks",
  task_start: "Creating the attempt's workspace",
  start_session: "Waiting for the machine to start the session",
};

/** What an admin write's progress heartbeat says while the person decides. */
const ASKING = "Waiting for the person to approve this fleet-settings change";

declare const __CAWCO_RELEASE__: boolean | undefined;

/** A tool as `tools/list` answers it. */
const listed = ({
  name,
  description,
  inputSchema,
  ...entry
}: {
  description: string;
  inputSchema: unknown;
  name: string;
}) => ({
  name,
  description,
  inputSchema: inputSchema as { type: "object" },
  ...("annotations" in entry ? { annotations: entry.annotations } : {}),
});

export function createDelegationMcp(options: {
  instances: () => InstanceRow[];
  instanceById: (id: string) => InstanceRow | undefined;
  /** Whether `leadId` leads the project of the work item `instanceId` runs (work-items.ts `ledBy`). */
  ledBy?: (instanceId: string, leadId: string) => boolean;
  forward: (envelope: Envelope, actor: InstanceRow) => Promise<void>;
  credentialActor: (authorization: string | null) => InstanceRow | undefined;
  tools?: ToolFactory;
  /** Project tasks, for the `task_*` and `todo_write` tools; without it they are not offered. */
  tasks?: Tasks;
  /** The task a work item is an attempt at, if any. */
  workItemTask?: (workItemId: string) => string | null | undefined;
  /** Where a work item lands: what its session's finish_item says happens. */
  workItemLands?: (workItemId: string) => LandsMode | undefined;
  /** Starts an attempt at a task for `task_start` (dispatch.ts). */
  startAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => Promise<AttemptStart>;
  /** Retries a task whose last attempt failed, for `task_retry` (dispatch.ts). */
  retryAttempt?: (
    projectId: string,
    ref: string,
    parent: InstanceRow
  ) => Promise<AttemptStart>;
  /** Makes the calling session a project, for `project_from_session` (project-offers.ts). */
  projectFromSession?: (actor: InstanceRow) => Promise<AcceptResult>;
  /** Caw's thread tools, for a project's lead (caw.ts). */
  threadTools?: (actor: InstanceRow | undefined) => ThreadTool[];
  /**
   * Parks an admin write as the person's ask and waits: resolves when they
   * approve it, rejects with the refusal when they deny it (admin-asks.ts).
   */
  askPerson: (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ) => Promise<void>;
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

  /** How the work item a session runs lands, when it runs one. */
  const landsOf = (actor: InstanceRow | undefined): LandsMode | undefined =>
    actor?.workItemId ? options.workItemLands?.(actor.workItemId) : undefined;

  /**
   * The tools a session is listed: its role's (roles.ts), narrowed by its own
   * context (a leaf gets no spawning tools, only a work item `finish_item`,
   * only a workflow step its step tools). Without a session — OpenCode's
   * shared discovery — every role's, the superset; the call enforces.
   */
  const toolsFor = (actor: InstanceRow | undefined) => {
    const workflowStepId = actor?.workflowStepId ?? undefined;
    const all = [
      ...tools({
        instanceId: "",
        instanceById: options.instanceById,
        cwd: "",
        canDelegate: actor?.canDelegate ?? undefined,
        lands: landsOf(actor),
        workItem: !actor || !!actor.parentInstanceId,
        workflowStepId,
        workflowRunId: workflowStepId ? "" : undefined,
        emit: () => {
          throw new Error("Discovery cannot execute tools");
        },
      }),
      ...admin,
      ...(options.tasks ? taskTools(undefined) : []),
      ...(options.projectFromSession ? [projectFromSessionTool()] : []),
      ...(options.threadTools ? options.threadTools(undefined) : []),
    ];
    if (!actor) {
      return all;
    }
    const role = roleOf(actor);
    return all.filter((tool) => allows(role, tool.name));
  };

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

  /**
   * An `admin_*` call, its role already checked. A write, from any door,
   * waits for the person to approve it (admin-asks.ts) and then runs once,
   * with the arguments they were shown; a refusal is the caller's error.
   */
  const administer = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const entry = admin.find((tool) => tool.name === name);
    if (!entry) {
      throw new Error(`Unknown tool ${name}`);
    }
    if (isAdminWrite(name)) {
      await options.askPerson(actor, name, input);
    }
    return (await entry.handler(input)) as CallToolResult;
  };

  /** A task tool, for its caller's project, its role already checked. */
  const taskCall = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult> => {
    // A session whose role files tasks names any task's to-dos; one that
    // does not writes only its own work item's.
    const mainline = allows(roleOf(actor), "task_create");
    const entry =
      options.tasks &&
      taskTools({
        actor,
        mainline,
        startAttempt: options.startAttempt,
        retryAttempt: options.retryAttempt,
        tasks: options.tasks,
        workItemTask: actor.workItemId
          ? (options.workItemTask?.(actor.workItemId) ?? null)
          : null,
      }).find((tool) => tool.name === name);
    if (!entry) {
      throw new Error(`Unknown tool ${name}`);
    }
    return (await entry.handler(input)) as CallToolResult;
  };

  /**
   * The delegate-type catalog, which anyone may read without an actor;
   * undefined for every other tool.
   */
  const catalogCall = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    input: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult | undefined> => {
    if (name === "list_delegate_types") {
      // Anyone may read it; a caller the bridge can name reads its project's
      // catalog, where the project's own types shadow the fleet's.
      let projectId: string | undefined;
      try {
        projectId =
          actorOf(binding, args, authorization).projectId ?? undefined;
      } catch {
        projectId = undefined;
      }
      const entry = tools({
        instanceId: "",
        instanceById: options.instanceById,
        cwd: "",
        projectId,
        emit: () => {
          throw new Error("Reading the catalog emits nothing");
        },
      }).find((tool) => tool.name === name);
      if (!entry) {
        throw new Error(`Unknown tool ${name}`);
      }
      return (await entry.handler(input)) as CallToolResult;
    }
    return undefined;
  };

  /** `project_from_session`, for a session in no project yet, its role already checked. */
  const projectCall = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const make = options.projectFromSession;
    if (!(make && mayMakeProject(actor))) {
      throw new Error(
        `${name} isn't available here: only a session you started, in no project yet, can be made a project.`
      );
    }
    return (await projectFromSessionTool(() => make(actor)).handler(
      input
    )) as CallToolResult;
  };

  /** One of Caw's thread tools, its role already checked. */
  const threadCall = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const entry = options
      .threadTools?.(actor)
      .find((tool) => tool.name === name);
    if (!entry) {
      throw new Error(`Unknown tool ${name}`);
    }
    return (await entry.handler(input)) as CallToolResult;
  };

  const THREADS: ReadonlySet<string> = new Set(THREAD_TOOLS);

  /** Every call, MCP or REST, from any machine: held for a hub restart while it runs, refused behind its fence. */
  const call = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult> => {
    const admitted = admitToolCall(name, binding ?? "unbound");
    if ("refused" in admitted) {
      return {
        isError: true,
        content: [{ type: "text", text: admitted.refused }],
      };
    }
    try {
      return await answer(binding, name, args, authorization);
    } finally {
      admitted.release();
    }
  };

  /** A call by a resolved session whose role has the tool: to the group the tool is in. */
  const route = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult | undefined> => {
    if (adminNames.has(name)) {
      return await administer(actor, name, input);
    }
    if (name === PROJECT_FROM_SESSION && options.projectFromSession) {
      return await projectCall(actor, name, input);
    }
    if (options.tasks && TASK_TOOLS.has(name)) {
      return await taskCall(actor, name, input);
    }
    if (THREADS.has(name) && options.threadTools) {
      return await threadCall(actor, name, input);
    }
    return undefined;
  };

  const answer = async (
    binding: string | null,
    name: string,
    args: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult> => {
    try {
      // Routing context belongs to the bridge, not to a tool's input schema.
      const { __cawco: _context, ...input } = args;
      const catalog = await catalogCall(
        binding,
        name,
        args,
        input,
        authorization
      );
      if (catalog) {
        return catalog;
      }
      const actor = actorOf(binding, args, authorization);
      // The one place a role holds: what it does not list, it cannot call.
      const role = roleOf(actor);
      if (!allows(role, name)) {
        throw new Error(refusal(role, name));
      }
      return (
        (await route(actor, name, input)) ??
        (await sessionCall(actor, name, input, authorization))
      );
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

  /** A session tool (delegation-tools.ts), for a resolved session whose role has it. */
  const sessionCall = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>,
    authorization?: string
  ): Promise<CallToolResult> => {
    const emitted: Envelope[] = [];
    const entry = tools({
      instanceId: actor.id,
      instanceById: options.instanceById,
      authorization,
      cwd: actor.cwd,
      harness: actor.harness as "claude" | "opencode" | "pi",
      canDelegate: actor.canDelegate ?? undefined,
      lands: landsOf(actor),
      ledBy: (id) => options.ledBy?.(id, actor.id) ?? false,
      workItem: !!actor.parentInstanceId,
      workflowStepId: actor.workflowStepId ?? undefined,
      workflowRunId: actor.workflowRunId ?? undefined,
      projectId: actor.projectId ?? undefined,
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
    // A session's role is fixed across items/checks. Shared OpenCode discovery
    // lists the superset; each invocation resolves its actor and enforces role.
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: toolsFor(bound).map(listed),
    }));
    server.setRequestHandler(CallToolRequestSchema, async (message, extra) => {
      const token = message.params._meta?.progressToken;
      let elapsed = 0;
      // An admin write waits on the person as long as they take.
      const doing =
        LONG_CALLS[message.params.name] ??
        (isAdminWrite(message.params.name) ? ASKING : undefined);
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
  /** What a session is listed, for the REST door (`cawco tools`); without one, the superset. */
  const list = (instanceId?: string) => {
    const actor = instanceId
      ? options.instances().find((row) => row.id === instanceId)
      : undefined;
    if (instanceId !== undefined && !actor) {
      throw new Error(`No session ${instanceId} on this hub.`);
    }
    return { tools: toolsFor(actor).map(listed) };
  };
  const close = () => {
    unwatchFile(moduleUrl);
    unwatchFile(adminModuleUrl);
  };
  return { handle, call, list, close };
}
