/** Host-only pi turns. This module is absent from the agent process graph. */
import type {
  PermissionResult,
  SentMessage,
  SpawnPayload,
  SupportedCommands,
} from "@cawco/core";
import {
  CAWCO_ENV,
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_REFRESH_CAWCO_TOOLS,
  CONTROL_SET_MODEL,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  INSTALL_SESSION_CREDENTIAL,
  MESSAGES_READ,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import {
  judgeCall,
  readPolicy,
  type Verdict,
} from "@cawco/core/workspace-judge";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  createBashToolDefinition,
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLocalBashOperations,
  createLsToolDefinition,
  createReadToolDefinition,
  createWriteToolDefinition,
  DefaultResourceLoader,
  defineTool,
  type ExtensionAPI,
  type ExtensionFactory,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Boundary, boundaryCommand } from "../boundary";
import { callDelegationTool, delegationTools } from "../delegation";
import type { HarnessContext, HarnessSession, TurnExtras } from "../harness";
import { acknowledgeSessionCredential } from "../session-identity";
import { accountRuntime } from "./pi-accounts";
import {
  compactBoundaryId,
  contentOf,
  modelCatalog,
  piModelValue,
  piSessionPath,
  resolvePiModel,
  textOf,
  toBlocks,
} from "./pi-services";
import { piOpenTurns } from "./pi-sessiond";

const boundedBash = (cwd: string, boundary: Boundary): ToolDefinition => {
  const local = createLocalBashOperations();
  return createBashToolDefinition(cwd, {
    operations: {
      exec: (command, dir, options) =>
        local.exec(boundaryCommand(boundary, command), dir, options),
    },
  }) as unknown as ToolDefinition;
};

/**
 * pi's file tools, each judged by the workspace's policy before it runs: pi
 * runs them in this process, on the host, outside the boundary. A call the
 * policy refuses throws its reason, which pi hands the model as the tool's
 * error; a policy that cannot be read refuses it too. Each replaces the
 * built-in of its name (a custom tool takes a built-in's place in pi's
 * registry, agent-session.js `_refreshToolRegistry`) and leaves which tools
 * are active as it was. The judge runs on the call's own arguments, before
 * pi resolves anything: `find` runs `fd` on the host without its
 * operations, so arguments are the one place all six can be judged.
 */
const boundedFileTools = (cwd: string, boundary: Boundary): ToolDefinition[] =>
  [
    createReadToolDefinition(cwd),
    createWriteToolDefinition(cwd),
    createEditToolDefinition(cwd),
    createLsToolDefinition(cwd),
    createFindToolDefinition(cwd),
    createGrepToolDefinition(cwd),
  ].map((tool) => {
    const definition = tool as unknown as ToolDefinition;
    return {
      ...definition,
      execute: (id, params, signal, onUpdate, ctx) => {
        let verdict: Verdict;
        try {
          verdict = judgeCall(readPolicy(boundary.policy), {
            harness: "pi",
            tool: definition.name,
            input: params,
            cwd: ctx?.cwd || cwd,
          });
        } catch (error) {
          verdict = {
            ok: false,
            reason: `cawco: ${definition.name} was refused: the workspace's file policy could not be read (${error instanceof Error ? error.message : String(error)}).`,
          };
        }
        if (!verdict.ok) {
          throw new Error(verdict.reason);
        }
        return definition.execute(id, params, signal, onUpdate, ctx);
      },
    } as ToolDefinition;
  });

const piHandoffTools = async (
  instanceId: string,
  credential: { value?: string }
): Promise<ToolDefinition[]> =>
  (await delegationTools(instanceId, "pi")).map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as never,
      execute: async (_id, params) =>
        callDelegationTool(instanceId, tool.name, params, credential.value),
    })
  );

/**
 * The session's CawCo tools, registered through pi's own extension API so
 * they can be replaced on the live session: `pi.registerTool` stores a tool
 * by name and refreshes the session's registry (`runtime.refreshTools()`,
 * extensions/loader.js), and pi "appends tool and prompt changes before the
 * next model request" (docs/extensions.md). A tool the hub no longer lists is
 * re-registered hidden, pi's way to withdraw one: "tools cannot be
 * unregistered".
 */
class CawcoTools {
  #api: ExtensionAPI | undefined;
  readonly #registered = new Map<string, ToolDefinition>();
  readonly #instanceId: string;
  readonly #credential: { value?: string };

  constructor(instanceId: string, credential: { value?: string }) {
    this.#instanceId = instanceId;
    this.#credential = credential;
  }

  /** The inline extension: holds pi's API and registers the first list. */
  extension(first: ToolDefinition[]): ExtensionFactory {
    return (pi) => {
      this.#api = pi;
      this.#register(first);
    };
  }

  #register(tools: ToolDefinition[]): void {
    const api = this.#api;
    if (!api) {
      throw new Error("pi has not loaded the CawCo tools extension.");
    }
    const listed = new Set(tools.map((tool) => tool.name));
    for (const tool of tools) {
      api.registerTool(tool);
      this.#registered.set(tool.name, tool);
    }
    for (const [name, tool] of this.#registered) {
      if (!listed.has(name)) {
        api.registerTool({ ...tool, exposure: "hidden" });
        this.#registered.delete(name);
      }
    }
  }

  /** Lists the session's CawCo tools again and replaces them for its next turn. */
  async refresh(): Promise<number> {
    const tools = await piHandoffTools(this.#instanceId, this.#credential);
    this.#register(tools);
    return tools.length;
  }
}

class PiSession implements HarnessSession {
  readonly harness = "pi" as const;
  sessionId: string | null = null;
  readonly #ctx: HarnessContext;
  readonly #session: AgentSession;
  readonly #credential: { value?: string };
  readonly #tools: CawcoTools;
  /** The runtime the session runs on: its account's, or the machine's own. */
  readonly #runtime: ModelRuntime;
  #busy = false;
  readonly #unread: string[] = [];
  #reading: string | undefined;

  #leaf(): { uuid: string; timestamp: string } {
    const entry = this.#session.sessionManager.getLeafEntry() as {
      id: string;
      timestamp: string;
    };
    return { uuid: entry.id, timestamp: entry.timestamp };
  }

  /**
   * The tokens the session's last answered request sent: its last assistant
   * message's usage, whose `input` pi-ai reports without the cached tokens
   * (api/openai-completions.js 1175), so they are added back. A request that
   * failed reports none and is passed over.
   */
  #contextTokens(): number | undefined {
    for (const message of [...this.#session.messages].reverse()) {
      const { role, usage } = message as {
        role?: string;
        usage?: { cacheRead: number; cacheWrite: number; input: number };
      };
      const sent = usage ? usage.input + usage.cacheRead + usage.cacheWrite : 0;
      if (role === "assistant" && sent > 0) {
        return sent;
      }
    }
    return undefined;
  }

  #setBusy(active: boolean): void {
    this.#busy = active;
    this.#ctx.busy(active);
    if (active) {
      piOpenTurns.add(this.#session.sessionId);
    } else {
      piOpenTurns.delete(this.#session.sessionId);
    }
  }

  constructor(
    ctx: HarnessContext,
    session: AgentSession,
    credential: { value?: string },
    tools: CawcoTools,
    runtime: ModelRuntime
  ) {
    this.#ctx = ctx;
    this.#session = session;
    this.#credential = credential;
    this.#tools = tools;
    this.#runtime = runtime;
    this.sessionId = session.sessionId;
    session.subscribe((event) => this.#handle(event));
    ctx.session(session.sessionId);
    ctx.frame({
      type: "system",
      subtype: "init",
      session_id: session.sessionId,
      cwd: ctx.cwd,
      ...(session.model ? { model: piModelValue(session.model) } : {}),
    });
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: translates each pi event shape once into the neutral stream
  #handle(event: AgentSessionEvent): void {
    switch (event.type) {
      case "message_start": {
        const read =
          (event.message as { role?: string }).role === "user"
            ? this.#unread.shift()
            : undefined;
        if (read) {
          this.#reading = read;
        }
        break;
      }
      case "message_end": {
        const { role, content } = event.message as {
          role?: string;
          content?: unknown;
        };
        const sent = this.#reading;
        if (sent && role === "user") {
          this.#reading = undefined;
          // pi appends after notifying listeners, in the same synchronous run.
          queueMicrotask(() =>
            this.#ctx.frame({
              type: "system",
              subtype: MESSAGES_READ,
              read: [sent],
              storedAs: {
                [sent]: this.#session.sessionManager.getLeafId() as string,
              },
              session_id: this.sessionId ?? undefined,
            })
          );
        }
        if (role === "assistant") {
          queueMicrotask(() => {
            const blocks = toBlocks(content);
            if (blocks.length) {
              this.#ctx.frame({
                type: "assistant",
                ...this.#leaf(),
                message: { content: blocks },
              });
            }
          });
        }
        break;
      }
      case "message_update": {
        const ae = (
          event as { assistantMessageEvent?: { type?: string; delta?: string } }
        ).assistantMessageEvent;
        if (ae?.type === "text_delta") {
          this.#ctx.frame({
            type: "stream_event",
            event: {
              type: "content_block_delta",
              delta: { type: "text_delta", text: ae.delta ?? "" },
            },
          });
          this.#setBusy(true);
        }
        break;
      }
      // A compaction that stored a summary: its boundary, with what triggered
      // it and how full the context was, then the summary itself — under the
      // ids a stored read gives them (pi-services). pi appends the compaction
      // entry before it notifies, so the leaf is that entry. One that was
      // aborted or failed carries no result and stored nothing.
      case "compaction_end": {
        if (!event.result) {
          break;
        }
        const leaf = this.#leaf();
        this.#ctx.frame({
          type: "system",
          subtype: "compact_boundary",
          uuid: compactBoundaryId(leaf.uuid),
          timestamp: leaf.timestamp,
          session_id: this.sessionId ?? undefined,
          compact_metadata: {
            trigger: event.reason === "manual" ? "manual" : "auto",
            pre_tokens: event.result.tokensBefore,
          },
        });
        this.#ctx.frame({
          type: "user",
          ...leaf,
          compactSummary: true,
          message: { role: "user", content: event.result.summary },
        });
        break;
      }
      case "tool_execution_end": {
        const { toolCallId, result, isError } = event as unknown as {
          toolCallId: string;
          result: {
            content?: unknown;
            details?: Record<string, unknown>;
          } | null;
          isError: boolean;
        };
        const content = Array.isArray(result) ? "" : contentOf(result?.content);
        const details = result?.details;
        const structuredContent =
          details && Object.keys(details).length > 0 ? details : undefined;
        this.#ctx.frame({
          type: "user",
          message: {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolCallId,
                content,
                is_error: isError,
                ...(structuredContent ? { structuredContent } : {}),
              },
            ],
          },
        });
        break;
      }
      case "agent_end": {
        if ((event as { willRetry?: boolean }).willRetry === true) {
          break;
        }
        this.#setBusy(false);
        const errors =
          (
            event as { messages?: { errorMessage?: string }[] }
          ).messages?.flatMap((message) =>
            message.errorMessage ? [message.errorMessage] : []
          ) ?? [];
        const failed = errors.length > 0;
        const leaf = this.#leaf();
        const context = this.#contextTokens();
        this.#ctx.frame({
          type: "result",
          uuid: leaf.uuid,
          timestamp: leaf.timestamp,
          subtype: failed ? "error_during_execution" : "success",
          is_error: failed,
          ...(failed ? { errors } : {}),
          ...(context === undefined ? {} : { contextTokens: context }),
        });
        break;
      }
      default:
        break;
    }
  }

  send(message: SentMessage, extras: TurnExtras): void {
    const text = textOf(message.message.content);
    const images = (extras.images ?? []).map((image) => ({
      type: "image" as const,
      data: image.data,
      mimeType: image.mediaType,
    }));
    const attachments = (extras.attachments ?? [])
      .map(
        (a) =>
          `\n\n<pasted-text name="${a.name}">\n${a.content}\n</pasted-text>`
      )
      .join("");
    this.#unread.push(message.uuid);
    if (extras.urgent && this.#busy) {
      const prompt = `[Urgent — your previous turn was interrupted to deliver this]\n\n${text}${attachments}`;
      this.#session
        .abort()
        .catch(() => {
          /* an urgent abort may race the turn's own close */
        })
        .then(() => {
          this.#setBusy(true);
          return this.#session.prompt(prompt, { images: images as never });
        })
        .catch((error: unknown) => this.#refused(message.uuid, error));
      return;
    }
    this.#setBusy(true);
    this.#session
      .prompt(text + attachments, {
        images: images as never,
        ...(this.#session.isStreaming
          ? { streamingBehavior: "steer" as const }
          : {}),
      })
      .catch((error: unknown) => this.#refused(message.uuid, error));
  }

  #refused(uuid: string, error: unknown): void {
    const at = this.#unread.indexOf(uuid);
    if (at >= 0) {
      this.#unread.splice(at, 1);
    }
    if (!this.#session.isStreaming) {
      this.#setBusy(false);
    }
    this.#ctx.rejected(uuid, error);
  }

  async control(method: string, args: unknown[]): Promise<unknown> {
    if (method === INSTALL_SESSION_CREDENTIAL) {
      const [credential] = args;
      if (typeof credential !== "string" || !credential) {
        throw new Error("Session credential is missing.");
      }
      await this.#session.waitForIdle();
      this.#credential.value = credential;
      // This host runs one session: its shells act as that session.
      process.env[CAWCO_ENV.sessionCredential] = credential;
      // The ACK is authenticated by the credential itself (the hub refuses
      // one it does not know), and the hub minted it in this session's own
      // spawn: the proof its tools will be taken as this session. No
      // `list_sessions` first: it read the whole fleet twice inside the hub
      // under 5 s timeouts, and a machine restoring twenty sessions at once
      // timed its own gates out (2026-10-09).
      await acknowledgeSessionCredential(credential);
      return {
        installed: true,
        harness: "pi",
        instanceId: this.#ctx.instanceId,
      };
    }
    // The host outlived the agent that started it and still holds the
    // credential its tools send. The ACK is authenticated by it, so one the
    // hub no longer knows is refused, as is a host that holds none.
    if (method === VERIFY_SESSION_CREDENTIAL) {
      if (!this.#credential.value) {
        throw new Error("This pi host holds no CawCo session credential.");
      }
      await acknowledgeSessionCredential(this.#credential.value);
      return undefined;
    }
    switch (method) {
      case CONTROL_REFRESH_CAWCO_TOOLS: {
        const count = await this.#tools.refresh();
        console.error(`[pi] cawco tools refreshed: ${count} listed`);
        return { listed: count };
      }
      case CONTROL_INTERRUPT:
        await this.#session.abort();
        return undefined;
      case CONTROL_SET_MODEL: {
        await this.#session.setModel(
          await resolvePiModel(this.#runtime, String(args[0]))
        );
        return undefined;
      }
      case CONTROL_SUPPORTED_MODELS:
        return await modelCatalog(this.#runtime);
      case CONTROL_SUPPORTED_COMMANDS:
        return [] satisfies SupportedCommands;
      case CONTROL_CONTEXT_USAGE: {
        const last = [...this.#session.messages]
          .reverse()
          .find((m) => (m as { usage?: unknown }).usage);
        const usage = (last as { usage?: { totalTokens?: number } } | undefined)
          ?.usage;
        const total = usage?.totalTokens ?? 0;
        return {
          totalTokens: total,
          maxTokens: 200_000,
          percentage: Math.min(100, Math.round((total / 200_000) * 100)),
          categories: [],
        };
      }
      default:
        console.warn(`[pi] no control verb ${method} — ignored`);
        return undefined;
    }
  }
  resolvePermission(_requestId: string, _result: PermissionResult): void {
    /* pi has no permissions */
  }
  withdrawPermission(_requestId: string, _message: string): void {
    /* pi has no permissions */
  }
  async interrupt(): Promise<void> {
    await this.#session.abort();
  }
  async stop(): Promise<void> {
    await this.#session.abort().catch(() => {
      /* teardown continues */
    });
    await this.#session.waitForIdle().catch(() => {
      /* teardown continues */
    });
    piOpenTurns.delete(this.#session.sessionId);
  }
  dispose(): Promise<void> {
    piOpenTurns.delete(this.#session.sessionId);
    this.#session.dispose();
    return Promise.resolve();
  }
}

/**
 * The providers the session's extensions register, put on its runtime before
 * its model is chosen, as pi's own services do
 * (core/agent-session-services.js 69-97): a session's own runner registers
 * them only once the session exists, after pi has picked its model.
 */
const registerExtensionProviders = (
  runtime: ModelRuntime,
  loader: DefaultResourceLoader
): void => {
  const { runtime: extensions } = loader.getExtensions();
  for (const {
    name,
    config,
    extensionPath,
  } of extensions.pendingProviderRegistrations) {
    try {
      runtime.registerProvider(name, config);
    } catch (error) {
      console.error(
        `[pi] extension ${extensionPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  extensions.pendingProviderRegistrations = [];
  for (const {
    provider,
    extensionPath,
  } of extensions.pendingNativeProviderRegistrations) {
    try {
      runtime.registerNativeProvider(provider);
    } catch (error) {
      console.error(
        `[pi] extension ${extensionPath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  extensions.pendingNativeProviderRegistrations = [];
};

export async function startPiHost(
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<HarnessSession> {
  // A session on an account runs on the account's runtime: its provider's
  // sign-in from the account's own store, every other provider from the
  // machine's. One without runs on the machine's own, as pi always has.
  const runtime = spec.accountDir
    ? await accountRuntime(spec.accountDir.accountId)
    : await ModelRuntime.create({ refreshOnCreate: false });
  const credential = { value: ctx.sessionCredential };
  process.env[CAWCO_ENV.instanceId] = ctx.instanceId;
  // The SDK's own default loader (sdk.js: `new DefaultResourceLoader({ cwd,
  // agentDir, settingsManager })`), plus the CawCo tools as an inline
  // extension, so the hub can have them replaced on the live session.
  const tools = new CawcoTools(ctx.instanceId, credential);
  const agentDir = getAgentDir();
  const settingsManager = SettingsManager.create(ctx.cwd, agentDir);
  const resourceLoader = new DefaultResourceLoader({
    cwd: ctx.cwd,
    agentDir,
    settingsManager,
    extensionFactories: [
      tools.extension(await piHandoffTools(ctx.instanceId, credential)),
    ],
  });
  await resourceLoader.reload();
  registerExtensionProviders(runtime, resourceLoader);
  // pi picks a session's model by which providers have auth configured
  // (`hasConfiguredAuth`, read off the runtime's availability snapshot), so
  // the snapshot is taken before the session is made.
  await runtime.getAvailable();
  const model =
    spec.model && spec.model !== "default"
      ? await resolvePiModel(runtime, spec.model)
      : undefined;
  let manager: SessionManager;
  if (spec.resume) {
    const source = await piSessionPath(spec.resume.sessionKey, ctx.cwd);
    if (!source) {
      throw new Error(
        `pi cannot ${spec.resume.fork ? "fork" : "resume"} missing session ${spec.resume.sessionKey}.`
      );
    }
    manager = spec.resume.fork
      ? SessionManager.forkFrom(source, ctx.cwd)
      : SessionManager.open(source, undefined, ctx.cwd);
  } else {
    manager = SessionManager.create(ctx.cwd);
  }
  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    agentDir,
    modelRuntime: runtime,
    ...(model ? { model } : {}),
    sessionManager: manager,
    settingsManager,
    resourceLoader,
    customTools: ctx.boundary
      ? [
          boundedBash(ctx.cwd, ctx.boundary),
          ...boundedFileTools(ctx.cwd, ctx.boundary),
        ]
      : [],
  });
  return new PiSession(ctx, session, credential, tools, runtime);
}
