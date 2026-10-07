/** Host-only pi turns. This module is absent from the agent process graph. */
import type {
  PermissionResult,
  SendPayload,
  SentMessage,
  SpawnPayload,
  SupportedCommands,
} from "@cawco/core";
import {
  CAWCO_ENV,
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_SET_MODEL,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  INSTALL_SESSION_CREDENTIAL,
  MESSAGES_READ,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  createBashToolDefinition,
  createLocalBashOperations,
  defineTool,
  SessionManager,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { type Boundary, boundaryCommand } from "../boundary";
import { callDelegationTool, delegationTools } from "../delegation";
import type { HarnessContext, HarnessSession } from "../harness";
import { acknowledgeSessionCredential } from "../session-identity";
import {
  compactBoundaryId,
  contentOf,
  modelCatalog,
  modelIdOf,
  PiProfile,
  piSessionPath,
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

const piHandoffTools = async (
  instanceId: string,
  credential: { value?: string }
): Promise<ToolDefinition[]> =>
  (await delegationTools(instanceId)).map((tool) =>
    defineTool({
      name: tool.name,
      label: tool.name,
      description: tool.description,
      parameters: tool.inputSchema as never,
      execute: async (_id, params) =>
        callDelegationTool(instanceId, tool.name, params, credential.value),
    })
  );

class PiSession implements HarnessSession {
  readonly harness = "pi" as const;
  sessionId: string | null = null;
  readonly #ctx: HarnessContext;
  readonly #session: AgentSession;
  readonly #credential: { value?: string };
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
    credential: { value?: string }
  ) {
    this.#ctx = ctx;
    this.#session = session;
    this.#credential = credential;
    this.sessionId = session.sessionId;
    session.subscribe((event) => this.#handle(event));
    ctx.session(session.sessionId);
    ctx.frame({
      type: "system",
      subtype: "init",
      session_id: session.sessionId,
      cwd: ctx.cwd,
      ...(session.model ? { model: modelIdOf(session.model) } : {}),
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
        this.#ctx.frame({
          type: "result",
          uuid: leaf.uuid,
          timestamp: leaf.timestamp,
          subtype: failed ? "error_during_execution" : "success",
          is_error: failed,
          ...(failed ? { errors } : {}),
        });
        break;
      }
      default:
        break;
    }
  }

  send(
    message: SentMessage,
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">
  ): void {
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
      await callDelegationTool(
        this.#ctx.instanceId,
        "list_sessions",
        {},
        credential
      );
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
      case CONTROL_INTERRUPT:
        await this.#session.abort();
        return undefined;
      case CONTROL_SET_MODEL: {
        const model = (await (await PiProfile.runtime()).getAvailable()).find(
          (one) => modelIdOf(one) === args[0]
        );
        if (!model) {
          throw new Error(`pi does not know model ${args[0]}`);
        }
        await this.#session.setModel(model);
        return undefined;
      }
      case CONTROL_SUPPORTED_MODELS:
        return await modelCatalog();
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

export async function startPiHost(
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<HarnessSession> {
  const runtime = await PiProfile.runtime();
  const model = spec.model
    ? (await runtime.getAvailable()).find(
        (one) => modelIdOf(one) === spec.model
      )
    : undefined;
  if (spec.model && !model) {
    throw new Error(
      `pi cannot use model ${spec.model}: it is not available with the configured provider credentials.`
    );
  }
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
  const credential = { value: ctx.sessionCredential };
  process.env[CAWCO_ENV.instanceId] = ctx.instanceId;
  const { session } = await createAgentSession({
    cwd: ctx.cwd,
    modelRuntime: runtime,
    ...(model ? { model } : {}),
    sessionManager: manager,
    customTools: [
      ...(await piHandoffTools(ctx.instanceId, credential)),
      ...(ctx.boundary ? [boundedBash(ctx.cwd, ctx.boundary)] : []),
    ],
  });
  return new PiSession(ctx, session, credential);
}
