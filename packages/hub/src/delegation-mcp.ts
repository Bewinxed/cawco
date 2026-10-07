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
import { allows, CAW_TOOLS, refusal, roleOf } from "./roles";
import { TASK_TOOLS, taskTools } from "./task-tools";
import type { Tasks } from "./tasks";

type ToolFactory = typeof handoffTools;
type CawTool = ReturnType<Caw["tools"]>[number];

/** Tools that run for minutes, and what their progress heartbeat says meanwhile. */
const LONG_CALLS: Record<string, string> = {
  delegate: "Creating the delegate's workspace",
  generate_image: "Generating image through ChatGPT",
  continue_session: "Summarising the session",
  finish_item: "Running the work item's acceptance checks",
  task_start: "Creating the attempt's workspace",
  start_session: "Waiting for the machine to start the session",
};

/** What a session credential a call names reads as once it is replaced. */
export const REDACTED_CREDENTIAL = "[cawco credential]";

/**
 * A token with a session credential's shape (32 random bytes, base64url:
 * session-identity.ts), standing on its own in the text around it.
 */
const CREDENTIAL_TOKEN =
  /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/g;

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
  /** Whether `token` is a session credential the hub holds (by its hash). */
  knownCredential: (token: string) => boolean;
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
  /** Caw's own tools (threads, views), for a project's lead (caw.ts). */
  cawTools?: (actor: InstanceRow | undefined) => CawTool[];
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
      ...(options.cawTools ? options.cawTools(undefined) : []),
    ];
    if (!actor) {
      return all;
    }
    const role = roleOf(actor);
    return all.filter((tool) => allows(role, tool.name));
  };

  /**
   * The credential OpenCode's plugin stamps into a call: OpenCode sends one
   * static MCP header for every session of a directory, so a session's own
   * credential rides in the call (`__cawco.credential`), written over
   * whatever the model put there (agent `buildHandoffPluginSource`).
   */
  const stampedCredential = (
    args: Record<string, unknown>
  ): string | undefined => {
    const context = args.__cawco;
    if (context === undefined) {
      return undefined;
    }
    const credential =
      typeof context === "object" && context !== null && !Array.isArray(context)
        ? (context as { credential?: unknown }).credential
        : undefined;
    if (typeof credential !== "string" || !credential) {
      throw new Error("__cawco carries no session credential");
    }
    return credential;
  };

  /**
   * `value` with every token shaped like a session credential that hashes to
   * one the hub holds replaced by {@link REDACTED_CREDENTIAL}, at any depth.
   */
  const scrubCredentials = <T>(value: T): { value: T; redacted: number } => {
    let redacted = 0;
    const scrub = (node: unknown): unknown => {
      if (typeof node === "string") {
        return node.replace(CREDENTIAL_TOKEN, (token) => {
          if (!options.knownCredential(token)) {
            return token;
          }
          redacted += 1;
          return REDACTED_CREDENTIAL;
        });
      }
      if (Array.isArray(node)) {
        return node.map(scrub);
      }
      if (node !== null && typeof node === "object") {
        return Object.fromEntries(
          Object.entries(node).map(([key, child]) => [key, scrub(child)])
        );
      }
      return node;
    };
    const scrubbed = scrub(value) as T;
    return { value: scrubbed, redacted };
  };

  /**
   * The calling session, from its own credential and nothing else: the
   * `Authorization` header (Claude, pi, the CLI) or OpenCode's stamped one.
   * One of them, never both. Its row decides its role, so naming another
   * session anywhere in a call changes nothing.
   */
  const actorOf = (
    binding: string | null,
    args: Record<string, unknown>,
    authorization?: string
  ) => {
    const stamped = stampedCredential(args);
    if (authorization !== undefined && stamped !== undefined) {
      throw new Error("A call carries one session credential, not two.");
    }
    const presented =
      authorization ??
      (stamped === undefined ? undefined : `Bearer ${stamped}`);
    if (presented === undefined) {
      throw new Error("This call carries no CawCo session credential.");
    }
    const actor = options.credentialActor(presented);
    if (!actor) {
      throw new Error("Invalid session credential");
    }
    if (binding !== null && actor.id !== binding) {
      throw new Error(
        "Session credential does not belong to the named instanceId"
      );
    }
    return actor;
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

  /** One of Caw's own tools (threads, views), its role already checked. */
  const cawCall = async (
    actor: InstanceRow,
    name: string,
    input: Record<string, unknown>
  ): Promise<CallToolResult> => {
    const entry = options.cawTools?.(actor).find((tool) => tool.name === name);
    if (!entry) {
      throw new Error(`Unknown tool ${name}`);
    }
    return (await entry.handler(input)) as CallToolResult;
  };

  const CAWS: ReadonlySet<string> = new Set(CAW_TOOLS);

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
    if (CAWS.has(name) && options.cawTools) {
      return await cawCall(actor, name, input);
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
      const { __cawco: _context, ...asked } = args;
      // No session credential a call names is stored or passed on: every
      // tool, by MCP or the REST door, runs on arguments with it replaced.
      const { value: input, redacted } = scrubCredentials(asked);
      const catalog = await catalogCall(
        binding,
        name,
        args,
        input,
        authorization
      );
      if (catalog) {
        if (redacted > 0) {
          console.warn(
            `[delegation] ${binding ?? "an unbound caller"} passed a session credential to ${name}; it was replaced before the call ran`
          );
        }
        return catalog;
      }
      const actor = actorOf(binding, args, authorization);
      if (redacted > 0) {
        console.warn(
          `[delegation] ${actor.id} passed a session credential to ${name}; it was replaced before the call ran`
        );
      }
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

  /**
   * Whose connection this is: the credential's session. A connection with no
   * credential names no session: it is OpenCode's shared discovery, which
   * lists the superset, and each of its calls carries its own credential.
   * An instanceId with no credential to back it is refused.
   */
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
    if (bindings[0] !== undefined && !actor) {
      return new Response(
        "A session's CawCo connection needs its session credential",
        { status: 401 }
      );
    }
    if (actor && bindings[0] !== undefined && bindings[0] !== actor.id) {
      return new Response(
        "Session credential does not belong to the named instanceId",
        { status: 403 }
      );
    }
    return actor?.id ?? null;
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
