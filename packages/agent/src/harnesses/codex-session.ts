/**
 * A Codex session: one `codex app-server` of its own (JSON-RPC over its
 * stdio), held by the session keeper, so it and its turn outlive an agent
 * restart (Codex audit 2026-11-17, Architecture). Its thread's items become
 * CawCo's neutral frames, Codex's asks become CawCo's, and the agent that
 * takes it back over reads the keeper's ring from the hub's mark and asks
 * `thread/resume`, which hands an ask left open over again (checked
 * 2026-11-17 on Codex 0.169.0 against a scripted model: on the same
 * connection, `thread/resume` re-sent the open `requestApproval` under its
 * id).
 *
 * The keeper holds its stdio rather than Codex's own unix-socket listener:
 * the keeper's ring already carries a session's output across an agent
 * restart in order (as it does Claude Code's and pi's), and Codex's listener
 * links its socket under a fixed `/tmp/codex-daemon-<uid>/` outside CawCo's
 * dirs.
 */
import type { RestartHold } from "@cawco/core/binary-updates";
import { deniedToolsOn } from "@cawco/core/delegate-types";
import type { SessionCredentialInstall } from "@cawco/core/harness";
import { CODEX } from "@cawco/core/harness/codex";
import { type SharedMode, sharedModeNamed } from "@cawco/core/harness/modes";
import { makeLock } from "@cawco/core/keyed-lock";
import type { SpawnPayload } from "@cawco/core/protocol";
import {
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_MCP_STATUS,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  type MoveEnded,
} from "@cawco/core/session/controls";
import {
  MESSAGES_READ,
  type ModelTurnUsage,
  type NeutralAssistantBlock,
  type NeutralMessage,
  type PermissionResult,
  PROVIDER_RETRY,
  type SentMessage,
  type SlashCommand,
} from "@cawco/core/session-messages";
import { withSkillMarkers } from "@cawco/core/skill-words";
import { withPastedText } from "@cawco/core/transcript-rules";
import { pricedRequest } from "@cawco/core/usage/pricing";
import { Deferred, Effect, Exit } from "effect";
import { delegationMcp, MCP_SERVER_NAME } from "../delegation";
import type {
  HarnessContext,
  HarnessSession,
  SessionControls,
  TurnExtras,
} from "../harness";
import { unreadSendsHeld } from "../harness";
import { KeeperPool } from "../keepers";
import { procIdFor } from "../proc-id";
import { acknowledgeSessionCredential } from "../session-identity";
import {
  KeeperRefused,
  procEpoch,
  refusalReason,
  type SessiondClient,
} from "../sessiond-client";
import {
  CODEX_NEEDS_ACCOUNT,
  codexEnv,
  codexToStart,
  environmentId,
  prepareHome,
  workspaceEnvironment,
} from "./codex-home";
import { toolResultOf, toolUseOf } from "./codex-items";
import type { JsonValue } from "./codex-protocol/json.gen";
import type { ReasoningEffort } from "./codex-protocol/root.gen";
import type * as V2 from "./codex-protocol/v2.gen";
import {
  type CodexNotification,
  CodexPeer,
  type CodexServerRequest,
} from "./codex-rpc";
import { commandEnv } from "./command-env";
import { credentialControls } from "./credential-controls";
import { sessionMemory } from "./session-memory";
import { listedSkillFiles } from "./skill-files";

/** The machine's keepers as Codex's app-servers reach them. */
export const codexKeepers = new KeeperPool();

/** A model's id as CawCo names it, `<provider>/<id>`, split; a bare id is Codex's own. */
const codexModelOf = (
  model: string | undefined
): { id: string; provider?: string } | undefined => {
  if (!model || model === "default") {
    return;
  }
  const slash = model.indexOf("/");
  return slash > 0
    ? { provider: model.slice(0, slash), id: model.slice(slash + 1) }
    : { id: model };
};

/**
 * What each permission mode asks of Codex: its approval policy, and what the
 * adapter answers on its own. Codex's own sandbox stays off: in a
 * workspace the boundary holds every command, and it cannot run nested in
 * one (C-a1). `untrusted` asks before every command and edit (C-b);
 * `acceptEdits` answers its edits' asks itself; `plan` refuses every edit
 * and asks each command; `bypassPermissions` and `fullSend` ask nothing
 * (`never`).
 */
const CODEX_MODES: Readonly<
  Record<
    SharedMode,
    { approval: V2.AskForApproval; edits: "ask" | "accept" | "refuse" }
  >
> = {
  default: { approval: "untrusted", edits: "ask" },
  acceptEdits: { approval: "untrusted", edits: "accept" },
  plan: { approval: "untrusted", edits: "refuse" },
  bypassPermissions: { approval: "never", edits: "accept" },
  fullSend: { approval: "never", edits: "accept" },
};

/** The words a question tool's call is refused with: CawCo's `ask` is the one route. */
const ASK_INSTEAD =
  "Ask the person through CawCo's `ask` tool instead: this tool is off in CawCo.";

/** What Codex is answered for an ask of `kind` the person settled with `result`. */
const answerOf = (kind: ParkedAsk["kind"], result: PermissionResult) => {
  const allow = result.behavior === "allow";
  if (kind === "mcp") {
    return { action: allow ? "accept" : "decline", content: null, _meta: null };
  }
  if (!allow) {
    return { decision: "decline" };
  }
  return {
    decision:
      kind === "command" && result.remember ? "acceptForSession" : "accept",
  };
};

/** One of Codex's asks, parked with the hub. */
interface ParkedAsk {
  readonly kind: "command" | "file" | "mcp";
  readonly rpcId: number | string;
}

const textOf = (content: SentMessage["message"]["content"]): string =>
  typeof content === "string"
    ? content
    : content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");

const COMPACT_COMMAND = /^\/compact\s*$/u;

/** The tokens of `now` less those of `before`, as one request's usage. */
const spentBetween = (
  now: V2.TokenUsageBreakdown,
  before: V2.TokenUsageBreakdown | undefined
) => {
  const cached = now.cachedInputTokens - (before?.cachedInputTokens ?? 0);
  return {
    input: now.inputTokens - (before?.inputTokens ?? 0) - cached,
    output: now.outputTokens - (before?.outputTokens ?? 0),
    cacheRead: cached,
    cacheWrite:
      now.cacheWriteInputTokens - (before?.cacheWriteInputTokens ?? 0),
  };
};

/** Codex's model windows as its turns reported them, by model id: the machine's catalog carries them (descriptor `contextWindow: "catalog"`). */
export const codexWindows = new Map<string, number>();

/** What a session starts with that is CawCo's, not Codex's. */
interface CodexLaunch {
  readonly accountId: string;
  readonly bin: string;
  /**
   * Its developer instructions: the fleet's memory, its folder's placed
   * memory and the hub's documents for it, each under its path; none for
   * a clean session.
   */
  readonly instructions?: string;
  readonly mode: SharedMode;
  /** `<provider>/<id>`, or none for Codex's own default. */
  readonly model: string | undefined;
}

class CodexSession implements HarnessSession {
  readonly harness = "codex" as const;
  sessionId: string | null = null;
  readonly #ctx: HarnessContext;
  readonly #client: SessiondClient;
  readonly #pid: number;
  readonly #epoch: string;
  readonly #procId: string;
  readonly #peer: CodexPeer;
  readonly #recoveryHead: number;
  #seq: number;
  /** Where the session stands: installed by the supervisor yet, its app-server ended or stopped. */
  readonly #state: { exited: boolean; ready: boolean } = {
    exited: false,
    ready: false,
  };
  /** Frames said before the supervisor installed this session, in order. */
  readonly #early: { seq: number; message: NeutralMessage }[] = [];
  #mode: SharedMode;
  #model: string | undefined;
  #effort: ReasoningEffort | undefined;
  /** The turn running, by Codex's id. */
  #turn: string | undefined;
  /** Settled when the running turn ends, for a send that waits for it ({@link #hand}). */
  #ended: Deferred.Deferred<void> | undefined;
  #turnStartTokens: V2.TokenUsageBreakdown | undefined;
  #tokens: V2.ThreadTokenUsage | undefined;
  #turnError: V2.TurnError | undefined;
  #lastText = "";
  /** Codex's asks parked with the hub, by CawCo's request id. */
  readonly #asks = new Map<string, ParkedAsk>();
  /** Each fileChange item's changes, by item id: what its ask shows. */
  readonly #changes = new Map<string, V2.FileUpdateChange[]>();
  /** Sends handed to Codex it has not taken up yet, by uuid. */
  readonly #unread = new Set<string>();
  /** The last send handed to Codex, its skills read first: the next send waits for it ({@link send}). */
  readonly #handed = makeLock();
  /** The skills Codex lists for the session's folder, by name, with their files: read once, again after a reload. */
  #skills: Promise<Map<string, string>> | undefined;
  /** The skills it was launched with, until its first send takes them into the turn it starts ({@link #hand}). */
  #launchSkills: readonly string[] = [];
  /** A subagent's thread, by its id: the call that started it. */
  readonly #children = new Map<string, string>();
  readonly #launchCredential: string | undefined;
  /** The line Codex's ask came in on, for the seq its frame is said under. */
  #lineSeq = 0;

  constructor(
    client: SessiondClient,
    ctx: HarnessContext,
    proc: { epoch: string; pid: number },
    launch: Pick<CodexLaunch, "mode" | "model">,
    afterSeq: number,
    recoveryHead = 0
  ) {
    this.#client = client;
    this.#ctx = ctx;
    this.#pid = proc.pid;
    this.#epoch = procEpoch(proc.epoch, proc.pid);
    this.#procId = procIdFor("codex", ctx.instanceId);
    this.#mode = launch.mode;
    this.#model = launch.model;
    this.#seq = afterSeq;
    this.#recoveryHead = recoveryHead;
    this.#launchCredential = ctx.sessionCredential;
    this.#peer = new CodexPeer((line) => this.#write(line), {
      notification: (message) => this.#notified(message),
      request: (message) => this.#asked(message),
    });
    client.subscribe(
      this.#procId,
      {
        line: (line) => {
          if (line.seq <= this.#seq) {
            return;
          }
          this.#seq = line.seq;
          this.#lineSeq = line.seq;
          this.#peer.receive(line.data);
        },
        reset: (nextSeq) =>
          ctx.failed(new Error(`Codex's output was lost past line ${nextSeq}`)),
        exit: (code, signal, _pid, stderr) => {
          if (!this.#state.exited) {
            const why = new Error(
              `Codex's app-server ended (${code ?? signal})${stderr ? `: ${stderr.trim()}` : ""}`
            );
            if (signal) {
              ctx.died?.(signal, why);
            } else {
              ctx.failed(why);
            }
          }
          this.#state.exited = true;
          this.#peer.close(new Error("Codex's app-server ended"));
          this.#unread.clear();
          this.#setBusy(false);
          ctx.closed?.();
          client.release(this.#procId, proc.pid);
        },
      },
      afterSeq
    );
  }

  /** The thread's id, once started or resumed. */
  get thread(): string | undefined {
    return this.sessionId ?? undefined;
  }

  async #write(line: string): Promise<void> {
    try {
      await this.#client.write(this.#procId, line);
    } catch (error) {
      const refusal = new KeeperRefused(
        this.#procId,
        refusalReason(error),
        this.#pid
      );
      console.warn(
        `[sessiond] ${this.#procId}: write refused: ${refusal.reason}`
      );
      this.#ctx.keeperRefused(refusal);
      throw refusal;
    }
  }

  #emit(message: NeutralMessage): void {
    if (!this.#state.ready) {
      this.#early.push({ seq: this.#lineSeq, message });
      return;
    }
    this.#say(this.#lineSeq, message);
  }

  #say(seq: number, message: NeutralMessage): void {
    if (message.type === "result" && seq <= this.#recoveryHead) {
      message.recovered = true;
    }
    this.#ctx.line?.(this.#epoch, seq);
    this.#ctx.frame(message);
  }

  #setBusy(active: boolean): void {
    this.#ctx.busy(active);
  }

  attached(): void {
    this.#state.ready = true;
    for (const { seq, message } of this.#early.splice(0)) {
      this.#say(seq, message);
    }
  }

  /**
   * The execution environment a workspace session's every turn names: its
   * boundary's (C-a3). Named on each turn as well as at the start, so a
   * thread resumed or forked, which takes no environment as it opens, runs
   * its first turn in it too. None for a session with no boundary.
   */
  #environments(): V2.TurnEnvironmentParams[] | undefined {
    const ctx = this.#ctx;
    return ctx.boundary && ctx.workspace
      ? [{ environmentId: environmentId(ctx.workspace), cwd: ctx.cwd }]
      : undefined;
  }

  /** The handshake, then the thread: started, resumed, or forked off a stored one. */
  async open(spec: SpawnPayload, launch: CodexLaunch): Promise<void> {
    await this.#peer.handshake();
    const model = codexModelOf(launch.model);
    const ctx = this.#ctx;
    const environments = this.#environments();
    const settings = {
      cwd: ctx.cwd,
      approvalPolicy: CODEX_MODES[this.#mode].approval,
      sandbox: "danger-full-access" as const,
      config: this.#threadConfig(spec),
      ...(model ? { model: model.id } : {}),
      ...(launch.instructions
        ? { developerInstructions: launch.instructions }
        : {}),
    };
    let thread: V2.Thread;
    const { resume } = spec;
    if (resume?.fork) {
      ({ thread } = await this.#peer.request("thread/fork", {
        threadId: resume.sessionKey,
        ...settings,
      }));
    } else if (resume) {
      ({ thread } = await this.#peer.request("thread/resume", {
        threadId: resume.sessionKey,
        excludeTurns: true,
        ...settings,
      }));
    } else {
      ({ thread } = await this.#peer.request("thread/start", {
        ...settings,
        ...(environments ? { environments } : {}),
      }));
    }
    this.#adopted(thread);
    if (spec.effort) {
      this.#effort = spec.effort;
    }
    // A launch's alone: a session taken back (`reopen`) loaded them when it started.
    this.#launchSkills = spec.skills ?? [];
  }

  /** A thread this connection now follows. */
  #adopted(thread: V2.Thread): void {
    this.sessionId = thread.id;
    this.#ctx.session(thread.id);
  }

  /**
   * Its config for the thread: CawCo's MCP server with this session's
   * credential, over the connection and never argv (C-d), its tools
   * answered without Codex's own ask (the hub gates them); a clean session's
   * reads of project instructions and skills off (C-o); Codex's subagents
   * and its goals off where the session's denials name them.
   */
  #threadConfig(spec: SpawnPayload): Record<string, JsonValue> {
    const cawco = delegationMcp(
      this.#ctx.instanceId,
      this.#ctx.sessionCredential
    );
    const denied = codexDenials(spec);
    return {
      mcp_servers: {
        [MCP_SERVER_NAME]: {
          url: cawco.url,
          ...(cawco.headers ? { http_headers: cawco.headers } : {}),
          default_tools_approval_mode: "approve",
          tool_timeout_sec: Math.ceil(cawco.timeout / 1000),
          ...(denied.cawcoTools.length > 0
            ? { disabled_tools: denied.cawcoTools }
            : {}),
        },
      },
      ...(spec.clean
        ? {
            project_doc_max_bytes: 0,
            skills: {
              include_instructions: false,
              bundled: { enabled: false },
            },
          }
        : {}),
      ...(denied.subagents ? { agents: { enabled: false } } : {}),
      ...(denied.goals ? { features: { goals: false } } : {}),
      ...(denied.webSearch ? { web_search: "disabled" } : {}),
    };
  }

  /**
   * Taken back after an agent restart, on the connection the agent before
   * it initialized: the session's thread found among those its app-server
   * holds (the one no other spawned), followed again, and its open asks
   * handed over again by `thread/resume`.
   */
  async reopen(): Promise<void> {
    const loaded = await this.#peer.request("thread/loaded/list", {});
    let root: V2.Thread | undefined;
    for (const id of loaded.data) {
      const read = await this.#peer.request("thread/read", { threadId: id });
      if (!read.thread.parentThreadId) {
        root = read.thread;
        break;
      }
    }
    if (!root) {
      throw new Error("Codex's app-server holds no thread of this session");
    }
    const resumed = await this.#peer.request("thread/resume", {
      threadId: root.id,
      excludeTurns: true,
    });
    this.#adopted(resumed.thread);
    if (resumed.thread.status.type === "active") {
      this.#setBusy(true);
    }
  }

  /**
   * One of Codex's notifications: its turns, items, streamed text and
   * thinking, token counts, errors and the asks it took back. Every other
   * one (its own UI's, its realtime voice, its projects) is no session's.
   */
  #notified(message: CodexNotification): void {
    if (message.method === "turn/started") {
      this.#turnStarted(message.params.threadId, message.params.turn.id);
    } else if (message.method === "turn/completed") {
      if (message.params.threadId === this.sessionId) {
        this.#turnEnded(message.params.turn);
      }
    } else if (message.method === "item/started") {
      this.#itemStarted(message.params.item, message.params.threadId);
    } else if (message.method === "item/completed") {
      this.#itemCompleted(message.params.item, message.params.threadId);
    } else if (message.method === "item/agentMessage/delta") {
      this.#streamed(message.params.threadId, {
        type: "text_delta",
        text: message.params.delta,
      });
    } else if (message.method === "item/reasoning/summaryTextDelta") {
      this.#streamed(message.params.threadId, {
        type: "thinking_delta",
        thinking: message.params.delta,
      });
    } else if (message.method === "thread/tokenUsage/updated") {
      this.#counted(message.params.threadId, message.params.tokenUsage);
    } else if (message.method === "error") {
      this.#erred(message.params);
    } else if (message.method === "serverRequest/resolved") {
      this.#resolvedElsewhere(message.params.requestId);
    }
  }

  #turnStarted(threadId: string, turn: string): void {
    if (threadId !== this.sessionId) {
      return;
    }
    this.#turn = turn;
    this.#turnStartTokens = this.#tokens?.total;
    this.#turnError = undefined;
    this.#lastText = "";
    this.#setBusy(true);
  }

  /** A part of the session's own reply or thinking, as it streams. */
  #streamed(
    threadId: string,
    delta:
      | { type: "text_delta"; text: string }
      | { type: "thinking_delta"; thinking: string }
  ): void {
    if (threadId === this.sessionId) {
      this.#emit({
        type: "stream_event",
        event: { type: "content_block_delta", delta },
      });
    }
  }

  /** The thread's tokens, and its model's window, as its last request left them. */
  #counted(threadId: string, usage: V2.ThreadTokenUsage): void {
    if (threadId !== this.sessionId) {
      return;
    }
    this.#tokens = usage;
    const model = codexModelOf(this.#model)?.id;
    if (usage.modelContextWindow && model) {
      codexWindows.set(model, usage.modelContextWindow);
    }
  }

  /** A provider's error: one Codex tries again is said as it waits; the last ends the turn with it. */
  #erred(params: V2.ErrorNotification): void {
    if (params.threadId !== this.sessionId) {
      return;
    }
    if (params.willRetry) {
      this.#emit({
        type: "system",
        subtype: PROVIDER_RETRY,
        content: params.error.message,
        retry: { message: params.error.message },
      });
    } else {
      this.#turnError = params.error;
    }
  }

  #parent(threadId: string): string | null | undefined {
    if (threadId === this.sessionId) {
      return null;
    }
    return this.#children.get(threadId);
  }

  #itemStarted(item: V2.ThreadItem, threadId: string): void {
    const parent = this.#parent(threadId);
    if (parent === undefined) {
      return;
    }
    if (item.type === "userMessage") {
      // A send's item names it by the uuid it was sent under
      // (`clientUserMessageId`); one this agent never handed it (an agent
      // before a restart did) is said read all the same.
      const uuid = item.clientId;
      if (uuid && parent === null) {
        this.#unread.delete(uuid);
        this.#emit({
          type: "system",
          subtype: MESSAGES_READ,
          read: [uuid],
          storedAs: { [uuid]: item.id },
          ...(this.sessionId ? { session_id: this.sessionId } : {}),
        });
      }
      return;
    }
    if (item.type === "fileChange") {
      this.#changes.set(item.id, item.changes);
    }
    if (item.type === "contextCompaction") {
      this.#emit({ type: "system", subtype: "status", status: "compacting" });
      return;
    }
    const use = toolUseOf(item);
    if (use) {
      this.#emit({
        type: "assistant",
        uuid: `${item.id}:call`,
        parent_tool_use_id: parent,
        message: {
          content: [
            { type: "tool_use", id: item.id, name: use.name, input: use.input },
          ],
        },
      });
    }
  }

  #itemCompleted(item: V2.ThreadItem, threadId: string): void {
    const parent = this.#parent(threadId);
    if (parent === undefined) {
      return;
    }
    const timestamp =
      typeof item.completedAtMs === "number"
        ? new Date(item.completedAtMs).toISOString()
        : undefined;
    if (item.type === "agentMessage" || item.type === "reasoning") {
      this.#said(item, parent, timestamp);
      return;
    }
    if (item.type === "contextCompaction") {
      this.#emit({
        type: "system",
        subtype: "compact_boundary",
        uuid: item.id,
        ...(timestamp ? { timestamp } : {}),
        ...(this.sessionId ? { session_id: this.sessionId } : {}),
        compact_metadata: { trigger: "manual" },
      });
      this.#emit({ type: "system", subtype: "status", status: null });
      return;
    }
    if (item.type === "collabAgentToolCall") {
      for (const child of item.receiverThreadIds) {
        this.#children.set(child, item.id);
      }
    }
    this.#changes.delete(item.id);
    const result = toolResultOf(item);
    if (result) {
      this.#emit({
        type: "user",
        parent_tool_use_id: parent,
        ...(timestamp ? { timestamp } : {}),
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: item.id,
              content: result.content,
              is_error: result.isError,
            },
          ],
        },
      });
    }
  }

  /** An answer, or its thinking, written whole. */
  #said(
    item: Extract<V2.ThreadItem, { type: "agentMessage" | "reasoning" }>,
    parent: string | null,
    timestamp: string | undefined
  ): void {
    let block: NeutralAssistantBlock;
    if (item.type === "agentMessage") {
      if (parent === null) {
        this.#lastText = item.text;
      }
      block = { type: "text", text: item.text };
    } else {
      const thinking = [...item.summary, ...item.content].join("\n\n");
      if (!thinking) {
        return;
      }
      block = { type: "thinking", thinking };
    }
    this.#emit({
      type: "assistant",
      uuid: item.id,
      parent_tool_use_id: parent,
      ...(timestamp ? { timestamp } : {}),
      message: {
        ...(this.#model && block.type === "text" ? { model: this.#model } : {}),
        content: [block],
      },
    });
  }

  /** What the turn spent, priced where the provider lists a price (an OpenAI key's models; a ChatGPT plan's are its plan's). */
  #turnUsage(): ModelTurnUsage[] {
    const total = this.#tokens?.total;
    if (!(total && this.#model)) {
      return [];
    }
    const spent = spentBetween(total, this.#turnStartTokens);
    if (spent.input + spent.output + spent.cacheRead + spent.cacheWrite <= 0) {
      return [];
    }
    return [pricedRequest(this.#model, spent, Date.now())];
  }

  #turnEnded(turn: V2.Turn): void {
    this.#turn = undefined;
    if (this.#ended) {
      Deferred.doneUnsafe(this.#ended, Exit.void);
    }
    this.#ended = undefined;
    const error = turn.error ?? this.#turnError;
    const failed = turn.status === "failed";
    const turnUsage = this.#turnUsage();
    const last = this.#tokens?.last;
    const info = error?.codexErrorInfo;
    this.#emit({
      type: "result",
      uuid: `${turn.id}:result`,
      subtype: failed ? "error_during_execution" : "success",
      is_error: failed,
      result: this.#lastText,
      turnUsage,
      total_cost_usd: turnUsage.reduce(
        (sum, one) => sum + (one.costUsd ?? 0),
        0
      ),
      ...(failed && error ? { errors: [error.message] } : {}),
      ...(failed && info === "usageLimitExceeded" ? { atLimit: true } : {}),
      ...(failed && info === "modelNotFound" ? { modelRefused: true } : {}),
      ...(last ? { contextTokens: last.inputTokens } : {}),
      ...(turn.status === "interrupted" ? { stop_reason: "interrupted" } : {}),
      wakes: { background: 0, scheduled: 0 },
      ...(this.sessionId ? { session_id: this.sessionId } : {}),
    });
    this.#turnError = undefined;
    this.#setBusy(false);
  }

  /**
   * One of Codex's asks: a command's, an edit's or an MCP tool's approval,
   * parked with the hub or answered as the mode says. Its question tool,
   * and anything else it asks, is refused: CawCo's `ask` is the one route.
   */
  #asked(message: CodexServerRequest): void {
    const requestId = `codex-${message.id}`;
    if (this.#asks.has(requestId)) {
      // Asked again by `thread/resume` while it is parked: the one parked stands.
      return;
    }
    if (message.method === "item/commandExecution/requestApproval") {
      this.#askCommand(requestId, message.id, message.params);
    } else if (message.method === "item/fileChange/requestApproval") {
      this.#askEdit(requestId, message.id, message.params);
    } else if (message.method === "mcpServer/elicitation/request") {
      this.#askMcp(requestId, message.id, message.params);
    } else {
      const why =
        message.method === "item/tool/requestUserInput"
          ? ASK_INSTEAD
          : `CawCo does not answer ${message.method}.`;
      this.#peer.refuse(message.id, why).catch(() => undefined);
    }
  }

  #askCommand(
    requestId: string,
    rpcId: number | string,
    params: V2.CommandExecutionRequestApprovalParams
  ): void {
    if (CODEX_MODES[this.#mode].approval === "never") {
      this.#peer.answer(rpcId, { decision: "accept" }).catch(() => undefined);
      return;
    }
    this.#asks.set(requestId, { kind: "command", rpcId });
    this.#ctx.permission({
      requestId,
      toolName: "Bash",
      input: {
        command: params.command ?? "",
        ...(params.cwd ? { cwd: params.cwd } : {}),
        ...(params.reason ? { description: params.reason } : {}),
      },
      toolUseId: params.itemId,
    });
  }

  #askEdit(
    requestId: string,
    rpcId: number | string,
    params: V2.FileChangeRequestApprovalParams
  ): void {
    const { edits } = CODEX_MODES[this.#mode];
    if (edits !== "ask") {
      this.#peer
        .answer(rpcId, { decision: edits === "accept" ? "accept" : "decline" })
        .catch(() => undefined);
      return;
    }
    this.#asks.set(requestId, { kind: "file", rpcId });
    this.#ctx.permission({
      requestId,
      toolName: "apply_patch",
      input: {
        changes: this.#changes.get(params.itemId) ?? [],
        ...(params.reason ? { description: params.reason } : {}),
      },
      toolUseId: params.itemId,
    });
  }

  #askMcp(
    requestId: string,
    rpcId: number | string,
    params: V2.McpServerElicitationRequestParams
  ): void {
    if (CODEX_MODES[this.#mode].approval === "never") {
      this.#peer
        .answer(rpcId, { action: "accept", content: null, _meta: null })
        .catch(() => undefined);
      return;
    }
    this.#asks.set(requestId, { kind: "mcp", rpcId });
    this.#ctx.permission({
      requestId,
      toolName: `mcp__${params.serverName}`,
      input: { message: "message" in params ? params.message : params.title },
    });
  }

  /** Codex took its ask `rpcId` back, or it was answered: one still parked is said cancelled. */
  #resolvedElsewhere(rpcId: number | string): void {
    const requestId = `codex-${rpcId}`;
    if (this.#asks.delete(requestId)) {
      this.#ctx.permissionResolved?.(requestId, "cancelled");
    }
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    const ask = this.#asks.get(requestId);
    if (!ask) {
      return;
    }
    this.#asks.delete(requestId);
    const answer = answerOf(ask.kind, result);
    this.#peer
      .answer(ask.rpcId, answer)
      .catch((error: unknown) =>
        console.warn(
          `[codex] ${this.#ctx.instanceId}: answering ask ${requestId} failed: ${error instanceof Error ? error.message : String(error)}`
        )
      );
  }

  withdrawPermission(requestId: string, _message: string): void {
    const ask = this.#asks.get(requestId);
    if (!ask) {
      return;
    }
    this.#asks.delete(requestId);
    const answer =
      ask.kind === "mcp"
        ? { action: "cancel", content: null, _meta: null }
        : { decision: "cancel" };
    this.#peer.answer(ask.rpcId, answer).catch(() => undefined);
  }

  send(message: SentMessage, extras: TurnExtras): void {
    const thread = this.sessionId;
    const text = textOf(message.message.content);
    if (!thread) {
      this.#ctx.rejected(message.uuid, new Error("Codex has no thread yet."));
      return;
    }
    if (COMPACT_COMMAND.test(text.trim())) {
      this.#peer
        .request("thread/compact/start", { threadId: thread })
        .then(() =>
          this.#emit({
            type: "system",
            subtype: MESSAGES_READ,
            read: [message.uuid],
            session_id: thread,
          })
        )
        .catch((error: unknown) => this.#ctx.rejected(message.uuid, error));
      return;
    }
    this.#unread.add(message.uuid);
    this.#setBusy(true);
    // Every send waits for the one before it to be handed to Codex: one
    // whose skills are still being read is never overtaken by a later one.
    const handed = this.#handed.run(() =>
      this.#hand(thread, message.uuid, text, extras)
    );

    handed.catch((error: unknown) => this.#refusedSend(message.uuid, error));
  }

  /**
   * Send `uuid`'s words to Codex, each skill they name marked for the agent
   * to load ({@link withSkillMarkers}): a turn of its own, or steered into
   * the one running. The first send carries the skills the session was
   * launched with ahead of its words.
   */
  async #hand(
    thread: string,
    uuid: string,
    text: string,
    extras: TurnExtras
  ): Promise<void> {
    const launched = this.#launchSkills;
    this.#launchSkills = [];
    const skills =
      launched.length > 0 || text.includes("/")
        ? await this.#skillFiles()
        : new Map<string, string>();
    const preloads = launchInputs(launched, skills, this.#ctx.cwd);
    // Codex reads a skill input only from the input that starts a turn:
    // steered into a running one it is dropped (measured, Codex 0.169.0
    // against a mock API): a launch's wait for the running turn's end.
    if (preloads.length > 0 && this.#turn) {
      this.#ended ??= Deferred.makeUnsafe<void>();
      // The promise edge of the wait for the running turn's end.
      await Effect.runPromise(Deferred.await(this.#ended));
    }
    const input: V2.UserInput[] = [
      ...(extras.images ?? []).map((image): V2.UserInput => ({
        type: "image",
        url: `data:${image.mediaType};base64,${image.data}`,
      })),
      {
        type: "text",
        text: withPastedText(
          withSkillMarkers(text, listedSkillFiles(skills), false),
          extras.attachments ?? []
        ),
        text_elements: [],
      },
      ...preloads,
    ];
    const turn = this.#turn;
    const sent = turn
      ? this.#peer.request("turn/steer", {
          threadId: thread,
          expectedTurnId: turn,
          input,
          clientUserMessageId: uuid,
        })
      : this.#peer.request("turn/start", {
          threadId: thread,
          input,
          clientUserMessageId: uuid,
          approvalPolicy: CODEX_MODES[this.#mode].approval,
          ...(codexModelOf(this.#model)
            ? { model: codexModelOf(this.#model)?.id }
            : {}),
          ...(this.#effort ? { effort: this.#effort } : {}),
          ...(this.#environments()
            ? { environments: this.#environments() }
            : {}),
        });
    sent.catch((error: unknown) => this.#refusedSend(uuid, error));
  }

  /** The skills Codex lists for the session's folder, by name, each with its file: the first of a name, of those switched on. */
  async #listSkills(): Promise<Map<string, string>> {
    const listed = await this.#peer.request("skills/list", {
      cwds: [this.#ctx.cwd],
    });
    const byName = new Map<string, string>();
    for (const skill of listed.data.flatMap((entry) => entry.skills)) {
      if (skill.enabled && !byName.has(skill.name)) {
        byName.set(skill.name, skill.path);
      }
    }
    return byName;
  }

  #refusedSend(uuid: string, error: unknown): void {
    this.#unread.delete(uuid);
    if (!(error instanceof KeeperRefused)) {
      this.#ctx.rejected(uuid, error);
    }
  }

  /** The skills Codex lists for the session's folder, by name, with their files: read once, again after a reload. */
  async #skillFiles(): Promise<Map<string, string>> {
    const listing = this.#skills ?? this.#listSkills();
    this.#skills = listing;
    try {
      return await listing;
    } catch (error) {
      // Read again by the next send that needs it.
      this.#skills = undefined;
      throw error;
    }
  }

  async interrupt(): Promise<void> {
    const thread = this.sessionId;
    const turn = this.#turn;
    if (thread && turn) {
      await this.#peer.request("turn/interrupt", {
        threadId: thread,
        turnId: turn,
      });
    }
  }

  async stop(): Promise<void> {
    await this.interrupt().catch(() => undefined);
    this.#state.exited = true;
    this.#peer.close(new Error("the session was stopped"));
    await this.#client.stdinEnd(this.#procId);
  }

  async dispose(): Promise<void> {
    await this.stop();
  }

  processId(): Promise<number | undefined> {
    return Promise.resolve(this.#pid);
  }

  holding(): string | undefined {
    return unreadSendsHeld(this.#unread);
  }

  /** Codex keeps a command running after its turn only as a background terminal, which the turn's end does not wait on. */
  heldForLater(): RestartHold[] {
    return [];
  }

  heldSince(): number | undefined {
    return undefined;
  }

  /**
   * Codex's commands left running after a turn end with its app-server: a
   * move ends them with the process. Said as none: the stop that moves the
   * session reads them as it ends (`thread/backgroundTerminals/list`, C-bg)
   * only once a move of a Codex session exists.
   */
  endedForMove(): Promise<MoveEnded> {
    return Promise.resolve({ tasks: [], wakeups: 0 });
  }

  /** The note goes into the model's history; Codex keeps no read-back of it (C-c). */
  async noteStopped(words: string): Promise<void> {
    const thread = this.sessionId;
    if (!thread) {
      return;
    }
    await this.#peer.request("thread/inject_items", {
      threadId: thread,
      items: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: words }],
        },
      ],
    });
  }

  /** Its app-server is the machine's `codex`, gated to the one release CawCo runs as it starts. */
  outdated(): Promise<undefined> {
    return Promise.resolve(undefined);
  }

  tables(): Record<string, number> {
    return {
      asks: this.#asks.size,
      changes: this.#changes.size,
      children: this.#children.size,
      requests: this.#peer.waiting,
    };
  }

  /** Codex takes a model and an effort with the next turn (turn/start `model`, `effort`, C-z). */
  #takeModel(model: string): Promise<void> {
    this.#model = model;
    return Promise.resolve();
  }

  #takeEffort(effort: ReasoningEffort): Promise<void> {
    this.#effort = effort;
    return Promise.resolve();
  }

  #setMode(mode: SharedMode): { permissionMode: string } {
    this.#mode = mode;
    // Codex takes the policy with the next turn (turn/start
    // `approvalPolicy`); what the adapter answers itself follows now.
    return { permissionMode: mode };
  }

  #contextUsage() {
    const usage = this.#tokens;
    const total = usage?.last.inputTokens ?? 0;
    const max = usage?.modelContextWindow ?? 0;
    return Promise.resolve({
      categories: [{ name: "Conversation", tokens: total, color: "blue" }],
      maxTokens: max,
      percentage: max > 0 ? Math.round((total / max) * 100) : 0,
      totalTokens: total,
    });
  }

  async #mcpStatus() {
    const listed = await this.#peer.request("mcpServerStatus/list", {});
    return listed.data.map((server) => ({
      name: server.name,
      status: server.runtimeStatus ?? "pending",
      tools: Object.keys(server.tools ?? {}).map((name) => ({ name })),
    }));
  }

  async #commands(): Promise<SlashCommand[]> {
    const skills = await this.#peer
      .request("skills/list", { cwds: [this.#ctx.cwd] })
      .catch(() => undefined);
    return [
      {
        name: "compact",
        description: "Compact the conversation",
        argumentHint: "",
        kind: "builtin",
      },
      ...(skills?.data ?? []).flatMap((entry) =>
        entry.skills.map((skill): SlashCommand => ({
          name: skill.name,
          description: skill.description,
          argumentHint: "",
          kind: "skill",
        }))
      ),
    ];
  }

  readonly controls: SessionControls<"codex"> = {
    ...credentialControls(
      (credential, initial) => this.#installCredential(credential, initial),
      () => this.#verifyCredential()
    ),
    [CONTROL_INTERRUPT]: () => this.interrupt(),
    [CONTROL_SET_MODEL]: (model) => this.#takeModel(model),
    [CONTROL_SET_EFFORT]: (effort) => this.#takeEffort(effort),
    [CONTROL_SET_PERMISSION_MODE]: (mode) => {
      const offered = sharedModeNamed(mode);
      if (!offered) {
        return Promise.reject(new Error(`Codex takes no ${mode} mode.`));
      }
      return Promise.resolve(this.#setMode(offered));
    },
    // @limit external: Codex app-server's page size for model/list (codex-protocol/v2.gen.ts ModelListParams.limit)
    [CONTROL_SUPPORTED_MODELS]: async () =>
      (await this.#peer.request("model/list", { limit: 100 })).data,
    [CONTROL_SUPPORTED_COMMANDS]: () => this.#commands(),
    [CONTROL_RELOAD_SKILLS]: async () => {
      this.#skills = undefined;
      await this.#peer.request("skills/list", {
        cwds: [this.#ctx.cwd],
        forceReload: true,
      });
    },
    [CONTROL_MCP_STATUS]: () => this.#mcpStatus(),
    [CONTROL_CONTEXT_USAGE]: () => this.#contextUsage(),
  };

  /**
   * The credential the session was launched with, its header already in
   * its thread's config: acknowledged to the hub. Codex fixes a thread's
   * MCP headers as it starts, so a replacement waits for its next start, as
   * Claude Code's does.
   */
  async #installCredential(
    credential: string,
    initial: boolean
  ): Promise<SessionCredentialInstall> {
    if (!initial || credential !== this.#launchCredential) {
      throw new Error(
        "Live Codex credential installation refused: it takes one on its next start."
      );
    }
    await acknowledgeSessionCredential(credential);
    return {
      installed: true,
      harness: "codex",
      instanceId: this.#ctx.instanceId,
    };
  }

  /** A session taken back keeps the credential its thread started with, which this agent was handed again in the spawn. */
  async #verifyCredential(): Promise<{ credential?: string }> {
    const credential = this.#ctx.sessionCredential;
    if (!credential) {
      throw new Error("This Codex session holds no CawCo session credential.");
    }
    await acknowledgeSessionCredential(credential);
    return { credential };
  }
}

/**
 * A session's developer instructions (thread/start `developerInstructions`,
 * C-g): the fleet's memory, the memory placed at its folder, and the hub's
 * documents for it, each headed by its path, as pi's loader takes them
 * (pi-runtime.ts `loaderSources`). A clean session takes none: with no
 * project AGENTS.md and no skills in its prompt either, Codex starts it
 * clean (C-o).
 */
const instructionsOf = async (
  spec: SpawnPayload,
  cwd: string
): Promise<string | undefined> => {
  if (spec.clean === true) {
    return;
  }
  const parts = await sessionMemory(spec, cwd);
  return parts.length > 0
    ? parts.map(({ path, content }) => `# ${path}\n\n${content}`).join("\n\n")
    : undefined;
};

/** CawCo's own server's tools as Codex names them (C-d). */
const CAWCO_TOOL = new RegExp(`^mcp__${MCP_SERVER_NAME}__(.+)$`, "u");

/**
 * A spawn's denied tools as Codex is held to them, by its descriptor's names
 * (core delegate-types.ts `deniedToolsOn`): its subagents off (`agents.enabled
 * = false`, C-z), its goals off (`features.goals = false`, C-tools), its
 * hosted web search off (`web_search = "disabled"`),
 * CawCo's tools named one by one off on CawCo's server (`disabled_tools`).
 * Its question tool answers nothing outside its plan collaboration mode,
 * which CawCo never starts (C-h). What none of these holds back (its shell,
 * its edits) is `unheld`: a spawn that names one is refused, never started
 * with a denial nothing keeps.
 */
const codexDenials = (spec: Pick<SpawnPayload, "denyTools">) => {
  const { tools } = deniedToolsOn("codex", spec.denyTools ?? []);
  const subagents: readonly string[] = CODEX.nativeTools.subagents;
  const goals: readonly string[] = CODEX.nativeTools.todos;
  const questions: readonly string[] = CODEX.nativeTools.questions;
  const search: readonly string[] = CODEX.tools.search;
  const cawcoTools = tools.flatMap((tool) => {
    const named = CAWCO_TOOL.exec(tool)?.[1];
    return named && named !== "*" ? [named] : [];
  });
  return {
    subagents: tools.some((tool) => subagents.includes(tool)),
    goals: tools.some((tool) => goals.includes(tool)),
    webSearch: tools.some((tool) => search.includes(tool)),
    cawcoTools,
    unheld: tools.filter(
      (tool) =>
        !(
          subagents.includes(tool) ||
          goals.includes(tool) ||
          questions.includes(tool) ||
          search.includes(tool) ||
          tool.startsWith("mcp__")
        )
    ),
  };
};

/** The permission mode a spawn starts in, refused when it names one Codex does not have. */
const codexModeOf = (spec: SpawnPayload): SharedMode => {
  const mode = sharedModeNamed(spec.permissionMode ?? "default");
  if (!mode) {
    throw new Error(`Codex takes no ${spec.permissionMode} mode.`);
  }
  return mode;
};

/**
 * The skills a session was launched with, as Codex's input names a skill
 * the person picked (`UserInput` `skill`): Codex reads each file into the
 * turn the input starts, whether or not the model may load it itself
 * (codex-rs `collect_explicit_skill_mentions`). A skill Codex does not list
 * (`skills`, by name) refuses the send.
 */
const launchInputs = (
  launched: readonly string[],
  skills: ReadonlyMap<string, string>,
  cwd: string
): V2.UserInput[] => {
  const missing = launched.filter((name) => !skills.has(name));
  if (missing.length > 0) {
    throw new Error(
      `Codex has no skill ${missing.map((name) => `“${name}”`).join(", ")} at ${cwd}.`
    );
  }
  return launched.map((name): V2.UserInput => ({
    type: "skill",
    name,
    path: skills.get(name) ?? "",
  }));
};

/** A new Codex session: its home readied, its app-server started under the keeper, its thread opened. */
export const spawnCodex = async (
  spec: SpawnPayload,
  ctx: HarnessContext
): Promise<HarnessSession> => {
  const accountId = spec.accountDir?.accountId;
  if (!accountId) {
    throw new Error(CODEX_NEEDS_ACCOUNT);
  }
  const { unheld } = codexDenials(spec);
  if (unheld.length > 0) {
    throw new Error(
      `Codex can't deny ${unheld.map((tool) => `“${tool}”`).join(", ")} yet: CawCo holds back its subagents, its goals, its web search and CawCo's own tools alone. Start it on another harness, or without that denial. Nothing was started.`
    );
  }
  const codex = await codexToStart();
  const instructions = await instructionsOf(spec, ctx.cwd);
  const launch: CodexLaunch = {
    accountId,
    bin: codex.bin,
    mode: codexModeOf(spec),
    model: spec.model,
    ...(instructions ? { instructions } : {}),
  };
  // A workspace's clone is untrusted before its first thread, so Codex
  // never loads a `.codex/config.toml` written there (C-k3); its tools run
  // in its boundary's execution environment (C-a3).
  await prepareHome(accountId, {
    ...(ctx.boundary && ctx.workspace
      ? {
          untrust: [ctx.cwd],
          environments: [
            workspaceEnvironment(ctx.workspace, ctx.boundary.exec, codex.bin),
          ],
        }
      : {}),
  });
  const client = await codexKeepers.current();
  const procId = procIdFor("codex", ctx.instanceId);
  await codexKeepers.replaceElsewhere(procId, client);
  await client.spawnProc(
    procId,
    // On the host, where its account's sign-in is: a workspace's tools run
    // in the workspace's environment, inside its boundary (C-a2).
    {
      command: codex.bin,
      args: ["app-server"],
      cwd: ctx.cwd,
      env: codexEnv(codex, accountId, commandEnv(ctx)),
    }
  );
  const held = await codexKeepers.holding(procId);
  if (!held) {
    throw new Error("Codex's app-server did not start");
  }
  const session = new CodexSession(client, ctx, held, launch, 0);
  try {
    await session.open(spec, launch);
  } catch (error) {
    await session.stop().catch(() => undefined);
    throw error;
  }
  return session;
};

/** A Codex session's app-server, taken back after an agent restart. */
export const adoptCodex = async (
  spec: SpawnPayload,
  ctx: HarnessContext,
  options: { afterSeq?: number; head: number }
): Promise<HarnessSession> => {
  const procId = procIdFor("codex", spec.instanceId);
  const proc = await codexKeepers.holding(procId);
  if (!proc) {
    throw new Error(`Codex's app-server for ${spec.instanceId} is gone`);
  }
  const session = new CodexSession(
    proc.client,
    ctx,
    proc,
    { mode: codexModeOf(spec), model: spec.model },
    options.afterSeq ?? options.head,
    options.head
  );
  await session.reopen();
  return session;
};
