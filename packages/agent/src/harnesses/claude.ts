/**
 * The Claude Code adapter.
 *
 * The original harness — everything whiffle did before harnesses existed ran on
 * it, so this file is the quarry the other adapters are measured against. It
 * spawns `@anthropic-ai/claude-agent-sdk`'s `query()`, feeds it an
 * `AsyncIterable` prompt, parks `canUseTool` under the SDK's `requestId`, and
 * translates SDK messages into the neutral spine. The translation is a re-tag:
 * the neutral types mirror the SDK's field names, so a message crosses the wire
 * with its `raw` self attached and nothing lost.
 */

import type { Dirent } from "node:fs";
import { access, readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  deleteSession,
  getSessionInfo,
  listSessions,
  type PermissionResult,
  type Query,
  query,
  renameSession,
  type SDKMessage,
  type SDKUserMessage,
  tagSession,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AuthState,
  EffortLevel,
  HarnessCapabilities,
  HarnessReport,
  ModelInfo,
  NeutralMessage,
  NeutralSessionInfo,
  SendPayload,
  SentMessage,
  SessionMessage,
  SpawnPayload,
  UserAnswers,
  UserQuestion,
  UserQuestionAnswered,
  UserQuestionResult,
} from "@whiffle/core";
import {
  ASK_USER_QUESTION,
  CONTROL_CONTEXT_USAGE,
  CONTROL_INTERRUPT,
  CONTROL_MCP_STATUS,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SET_EFFORT,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_SUPPORTED_MODELS,
  INSPECT_CONFIG,
  MARKETPLACE_CATALOG,
  MESSAGES_READ,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  settledQuestionResult,
} from "@whiffle/core";
import { sessiondEndpoint } from "@whiffle/core/sessiond";
import { observeRateLimit } from "@whiffle/core/usage/observed";
import { probeAuth, unlockKeychain } from "../auth";
import { delegationMcp, MCP_SERVER_NAME } from "../delegation";
import { resolvedDenyList } from "../denied-tools";
import {
  fleetStatus,
  inspectConfig,
  marketplaceCatalog,
  readMemoryFile,
  readSkillFiles,
  syncFleetConfig,
} from "../fleet";
import type { Harness, HarnessContext, HarnessSession } from "../harness";
import {
  beginLogin,
  clearCredentials,
  completeLogin,
  exportCredentials,
  importCredentials,
} from "../login";
// Type-only, and deliberately so: `session.ts` imports the harness registry
// this file is part of, so a value import here would close a module cycle.
import type { SessiondAwareContext } from "../session";
import {
  ensureSessiond,
  SessiondClient,
  type SessiondWelcomeInfo,
  sessiondBridge,
} from "../sessiond-client";
import { resolveBin } from "../tools";
import { claudeConfigDirs } from "../usage/scan-claude";
import {
  readSessionEnd,
  readSessionFull,
  readSessionWhole,
  type SDKSessionMessage,
} from "./claude-transcript";

/**
 * The CLI's word on one command it was sent: `command_uuid` is the uuid the
 * send carried, and `started` is the moment its prompt was consumed — the
 * turn it opens, or the tool boundary it is folded in at. It is written just
 * before what the model says about it. The SDK passes the line through without
 * typing it (0.3.280), so it is read by shape.
 */
interface CommandLifecycle {
  command_uuid: string;
  session_id?: string;
  state: "queued" | "started" | "completed" | "cancelled";
  type: "command_lifecycle";
}

/**
 * The neutral frame is the SDK frame re-tagged: same fields, plus the
 * original. A command's lifecycle is the one exception: `started` becomes the
 * {@link MESSAGES_READ} frame, and its other states say nothing a reader
 * needs, so they are `null` — no frame at all.
 */
export const toNeutral = (sdk: SDKMessage): NeutralMessage | null => {
  if ((sdk as { type: string }).type === "command_lifecycle") {
    const command = sdk as unknown as CommandLifecycle;
    return command.state === "started"
      ? {
          type: "system",
          subtype: MESSAGES_READ,
          read: [command.command_uuid],
          ...(command.session_id ? { session_id: command.session_id } : {}),
        }
      : null;
  }
  if (sdk.type === "result") {
    // The SDK's own usage carries cache_creation/cache_read counts; re-tag them
    // under the harness-neutral `cache` shape the opencode adapter's result
    // frame also populates.
    const { usage } = sdk as {
      usage?: {
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
      };
    };
    return {
      ...sdk,
      raw: sdk,
      ...(usage
        ? {
            cache: {
              read: usage.cache_read_input_tokens ?? 0,
              write: usage.cache_creation_input_tokens ?? 0,
            },
          }
        : {}),
    } as unknown as NeutralMessage;
  }
  if (
    sdk.type === "assistant" ||
    sdk.type === "user" ||
    sdk.type === "stream_event" ||
    sdk.type === "system"
  ) {
    return { ...sdk, raw: sdk } as unknown as NeutralMessage;
  }
  // `auth_status` is MCP server auth plumbing — surface it as a quiet system
  // message so the QUIET set silences it instead of the dashboard showing a
  // bare "⚙ raw" banner. The MCP status panel already shows auth failures.
  if (sdk.type === "auth_status") {
    return {
      type: "system",
      subtype: "auth_status",
      uuid: sdk.uuid,
      session_id: sdk.session_id,
      raw: sdk,
    } as unknown as NeutralMessage;
  }
  return { type: "raw", harness: "claude", uuid: sdk.uuid, message: sdk };
};

/**
 * The Claude SDK's `AskUserQuestionOutput` (`tool_use_result` on a user
 * message), normalised into the neutral {@link UserQuestionResult}. The SDK
 * types `answers` values as `string` ("multi-select answers are
 * comma-separated"), but a real transcript carries `string[]` for a multi-select
 * answer, and freeform "Other" text also lands inside `answers` — so the values
 * are passed through as `string | string[]` rather than coerced. `null` when the
 * payload is not a question result, which the caller treats as absent, never as
 * an empty answer.
 */
function normalizeQuestionResult(raw: unknown): UserQuestionResult | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { questions, answers, response, annotations } = raw as {
    questions?: unknown;
    answers?: unknown;
    response?: unknown;
    annotations?: unknown;
  };
  if (
    typeof answers !== "object" ||
    answers === null ||
    Array.isArray(answers)
  ) {
    return null;
  }
  const normalized = normalizeQuestions(questions);
  if (!normalized) {
    return null;
  }
  return {
    outcome: "answered",
    questions: normalized,
    answers: answers as UserAnswers,
    ...(typeof response === "string" ? { response } : {}),
    ...(annotations &&
    typeof annotations === "object" &&
    !Array.isArray(annotations)
      ? { annotations: annotations as UserQuestionAnswered["annotations"] }
      : {}),
  };
}

/**
 * The `questions` array of an `AskUserQuestion`, normalised. Shared by the
 * answered payload and by the tool's own input, which is all a dismissal has
 * left to say what was asked. `null` when the array is not questions at all.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates every field of a raw AskUserQuestion array shape before trusting any of it
function normalizeQuestions(raw: unknown): UserQuestion[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const normalized: UserQuestion[] = [];
  for (const question of raw) {
    if (typeof question !== "object" || question === null) {
      return null;
    }
    const q = question as {
      question?: unknown;
      header?: unknown;
      options?: unknown;
      multiSelect?: unknown;
    };
    if (typeof q.question !== "string" || !Array.isArray(q.options)) {
      return null;
    }
    const options: UserQuestion["options"] = [];
    for (const option of q.options) {
      if (typeof option !== "object" || option === null) {
        continue;
      }
      const o = option as { label?: unknown; description?: unknown };
      if (typeof o.label !== "string") {
        continue;
      }
      options.push({
        label: o.label,
        description: typeof o.description === "string" ? o.description : "",
      });
    }
    normalized.push({
      question: q.question,
      header: typeof q.header === "string" ? q.header : "Question",
      options,
      multiSelect: q.multiSelect === true,
    });
  }
  return normalized;
}

/**
 * Folds a question result onto the `tool_result` block of a stored entry's
 * inner message. `getSessionMessages` returns `message` as the raw MessageParam,
 * so this is where the dashboard's folding layer finds `questionResult` — the
 * same place the live path writes it.
 */
function attachQuestionResult(
  message: unknown,
  result: UserQuestionResult
): unknown {
  if (typeof message !== "object" || message === null) {
    return message;
  }
  const { content } = message as { content?: unknown };
  if (!Array.isArray(content)) {
    return message;
  }
  return {
    ...(message as object),
    content: content.map((block) =>
      block &&
      typeof block === "object" &&
      (block as { type?: string }).type === "tool_result"
        ? { ...(block as object), questionResult: result }
        : block
    ),
  };
}

/** The session file the CLI stores a session under, or null when it is not found. */
async function claudeSessionFile(
  sessionId: string,
  dir?: string
): Promise<string | null> {
  const projects = claudeConfigDirs().map((config) => join(config, "projects"));
  const fileName = `${sessionId}.jsonl`;
  // The CLI names the project dir from the session's cwd: realpath, then every
  // non-alphanumeric byte becomes '-'. Try that first — it is the exact file
  // `getSessionMessages` reads — and only scan when the cwd is gone or the slug
  // no longer resolves (a cwd that has since moved).
  let slug: string | null = null;
  if (dir) {
    try {
      slug = (await realpath(dir)).replace(/[^a-zA-Z0-9]/g, "-");
    } catch {
      slug = null;
    }
  }
  if (slug) {
    for (const projectsDir of projects) {
      const candidate = join(projectsDir, slug, fileName);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: the first config dir that has the file wins; a match short-circuits the search
        await access(candidate);
        return candidate;
      } catch {
        // not under this config dir
      }
    }
  }
  for (const projectsDir of projects) {
    let entries: Dirent[];
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the first config dir that has the file wins; a match short-circuits the search
      entries = await readdir(projectsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const candidate = join(projectsDir, entry.name, fileName);
      try {
        // biome-ignore lint/performance/noAwaitInLoops: the first project dir that has the file wins; a match short-circuits the search
        await access(candidate);
        return candidate;
      } catch {
        // not in this project
      }
    }
  }
  return null;
}

export const CLAUDE_CAPABILITIES: HarnessCapabilities = {
  interrupt: true,
  permissionModes: ["default", "acceptEdits", "plan", "bypassPermissions"],
  setModel: true,
  effort: true,
  contextUsage: true,
  supportedModels: true,
  supportedCommands: true,
  reloadSkills: true,
  mcpStatus: true,
  mcpControl: true,
  listSessions: true,
  getSessionMessages: true,
  renameSession: true,
  deleteSession: true,
  fork: true,
  rewind: true,
  tagSession: true,
  skills: true,
  subagents: true,
  tasks: true,
  compaction: true,
  costUsd: true,
  thinking: true,
  images: true,
  handoff: true,
  hooks: true,
  plugins: true,
  fleet: true,
};

/** The blocks a user turn is made of, taken from the SDK rather than re-modelled. */
type ContentBlock = Extract<
  SDKUserMessage["message"]["content"],
  unknown[]
>[number];
type Base64Source = Extract<
  Extract<ContentBlock, { type: "image" }>["source"],
  { type: "base64" }
>;

/**
 * A turn's images and pasted text folded into the message the SDK iterates.
 * Images lead, so the model has seen them by the time it reads what was said
 * about them, and each paste is tagged.
 */
function withExtras(
  message: SDKUserMessage,
  attachments: SendPayload["attachments"],
  images: SendPayload["images"]
): SDKUserMessage {
  if (!(attachments?.length || images?.length)) {
    return message;
  }

  const typed =
    typeof message.message.content === "string" ? message.message.content : "";
  const pasted = (attachments ?? [])
    .map(
      ({ name, content: body }) =>
        `\n\n<pasted-text name="${name}">\n${body}\n</pasted-text>`
    )
    .join("");

  const content: ContentBlock[] = [
    ...(images ?? []).map(({ mediaType, data }) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: mediaType as Base64Source["media_type"],
        data,
      },
    })),
    { type: "text" as const, text: typed + pasted },
  ];

  return { ...message, message: { ...message.message, content } };
}

/**
 * The prompt `query()` iterates, kept unresolved between turns.
 *
 * The SDK pulls from it as fast as it can write to the CLI, turn or no turn,
 * so a message waits here only for the instant between two pulls. Nothing
 * about a busy session is decided here: the CLI holds what arrives mid-turn in
 * a queue of its own, and says when it consumed each one ({@link toNeutral}).
 */
export class InputStream implements AsyncIterable<SDKUserMessage> {
  readonly #queue: SDKUserMessage[] = [];
  #waiting: ((result: IteratorResult<SDKUserMessage>) => void) | null = null;
  #ended = false;

  /** Hands one turn to the SDK, or keeps it for the SDK's next pull. */
  push(message: SDKUserMessage): void {
    const waiting = this.#waiting;
    if (waiting) {
      this.#waiting = null;
      waiting({ done: false, value: message });
      return;
    }
    this.#queue.push(message);
  }

  end(): void {
    this.#ended = true;
    this.#waiting?.({ done: true, value: undefined });
    this.#waiting = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const queued = this.#queue.shift();
        if (queued) {
          return Promise.resolve({ done: false, value: queued });
        }
        // biome-ignore lint/suspicious/noUnnecessaryConditions: #ended is set true by end() elsewhere in this class; the checker doesn't see that cross-method mutation
        if (this.#ended) {
          return Promise.resolve({ done: true, value: undefined });
        }
        return new Promise((resolve) => {
          this.#waiting = resolve;
        });
      },
    };
  }
}

/** A main-loop frame only a running turn sends: the model answering. */
const runsTurn = (message: SDKMessage): boolean =>
  (message.type === "stream_event" || message.type === "assistant") &&
  message.parent_tool_use_id === null;

/** Whether a turn is in flight, and a way to wait for the one that is. */
class Turn {
  busy = false;
  #ended = Promise.withResolvers<void>();

  start(): void {
    this.busy = true;
  }

  end(): void {
    this.busy = false;
    this.#ended.resolve();
    this.#ended = Promise.withResolvers<void>();
  }

  async settle(ms: number): Promise<void> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: busy is set true by start() elsewhere in this class; the checker doesn't see that cross-method mutation
    if (!this.busy) {
      return;
    }
    await Promise.race([this.#ended.promise, Bun.sleep(ms)]);
  }
}

const SETTLE_TIMEOUT_MS = 5000;

/**
 * How long a custody `stop` waits for the child to die after its stdin is
 * ended, before and again after a SIGKILL. Our choice: an idle claude exits on
 * stdin EOF within tens of milliseconds; a couple of seconds separates slow
 * from stuck, and stuck gets SIGKILL.
 */
const CUSTODY_EXIT_MS = 2000;

/** Whether `promise` settled within `ms`. The timer is cleared either way. */
const within = async (
  promise: Promise<unknown>,
  ms: number
): Promise<boolean> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    return await Promise.race([promise.then(() => true), expiry]);
  } finally {
    clearTimeout(timer);
  }
};

/** The `canUseTool` callback, parked until `resolvePermission` answers it. */
type PermissionResolver = (result: PermissionResult) => void;

class ClaudeSession implements HarnessSession {
  readonly harness = "claude" as const;
  sessionId: string | null = null;
  readonly #handle: Query;
  readonly #input: InputStream;
  readonly #turn: Turn;
  readonly #pump: Promise<void>;
  readonly #ctx: HarnessContext;
  readonly #permissions = new Map<string, PermissionResolver>();
  /**
   * The open `AskUserQuestion` permissions, keyed by request id, holding the
   * tool call they park and the questions they ask. A dismissal is a denial,
   * and the CLI answers a denied tool call with prose and no `toolUseResult`
   * sidecar — indistinguishable, from the block alone, from an answer that went
   * missing. Remembering the ask is what lets {@link #pumpMessages} say which
   * of the two it is.
   *
   * The tool call's own `input` is kept beside them for the opposite case: an
   * answer that arrives from off this machine carries the reader's choices and
   * nothing else, and the SDK validates the whole `AskUserQuestion` schema on
   * the way back in. This is the only copy of the input there is to answer with.
   */
  readonly #openQuestions = new Map<
    string,
    {
      toolUseID: string;
      questions: UserQuestion[];
      input: Record<string, unknown>;
    }
  >();
  /** Denied questions, keyed by tool call, until their `tool_result` goes past. */
  readonly #dismissedQuestions = new Map<string, UserQuestionResult>();
  readonly instanceId: string;

  constructor(
    instanceId: string,
    ctx: HarnessContext,
    workdir: string,
    options: unknown,
    permissionMode: string | undefined,
    model: string | undefined,
    effort: EffortLevel | undefined,
    resume: SpawnPayload["resume"],
    persistSession: boolean | undefined,
    skills?: string[],
    denyTools?: string[],
    /** Fleet-wide denied tools, resolved once by `spawn()` via {@link resolvedDenyList}. */
    fleetDenyList: readonly string[] = [],
    /**
     * The sessiond connection this session's CLI child lives under. Not
     * optional in practice — `spawn()` always supplies it, and there is no
     * in-process fallback (PLAN.md C7: full cutover, rollback is a revert).
     *
     * `attachAfter` names a child that already exists — a custody handing its
     * process back after an agent restart — and the ring line custody stopped
     * at. The `Query` then attaches to that process instead of spawning one
     * (see {@link sessiondBridge}).
     */
    sessiond?: { client: SessiondClient; procId: string; attachAfter?: number }
  ) {
    this.instanceId = instanceId;
    this.#ctx = ctx;
    const input = new InputStream();
    this.#input = input;
    const turn = new Turn();
    this.#turn = turn;

    // Claude in Chrome is on by default for every whiffle session.
    //
    // The CLI resolves it in `shouldEnableClaudeInChrome`, in this order:
    // OAuth scope -> `--chrome`/`--no-chrome` -> `CLAUDE_CODE_ENABLE_CFC` ->
    // `if (!isInteractive()) return false` -> `~/.claude.json`'s
    // `claudeInChromeDefaultEnabled`. Every whiffle session is non-interactive
    // stream-json, so it always trips the interactive gate and never reads the
    // config key — setting `claudeInChromeDefaultEnabled: true` cannot work
    // here at any value. `--chrome` short-circuits above that gate.
    //
    // A spec that names `chrome` or `no-chrome` itself still wins.
    const callerArgs =
      (options as { extraArgs?: Record<string, string | null> } | undefined)
        ?.extraArgs ?? {};
    const extraArgs: Record<string, string | null> = {
      ...("no-chrome" in callerArgs ? {} : { chrome: null }),
      ...callerArgs,
    };

    const handle = query({
      prompt: input,
      options: {
        forwardSubagentText: true,
        agentProgressSummaries: true,
        ...(options as Record<string, unknown> | undefined),
        extraArgs,
        mcpServers: {
          ...((options as { mcpServers?: Record<string, unknown> } | undefined)
            ?.mcpServers ?? {}),
          [MCP_SERVER_NAME]: delegationMcp(instanceId),
        },
        // Fleet baseline (from supervisor_config.denied_tools, cached in the
        // sidecar) + delegate-type denials + any the caller itself carried.
        // All three layers union: every layer can only add, never remove
        // another layer's entries. Resolved once through `resolvedDenyList()`
        // so this path and `convergeDeniedTools` read the same value.
        disallowedTools: [
          ...new Set([
            ...((options as { disallowedTools?: string[] } | undefined)
              ?.disallowedTools ?? []),
            ...fleetDenyList,
            ...(denyTools ?? []),
          ]),
        ],
        ...(resume
          ? {
              resume: resume.sessionKey,
              ...(resume.fork ? { forkSession: true } : {}),
              ...(resume.atMessage
                ? { resumeSessionAt: resume.atMessage }
                : {}),
            }
          : {}),
        ...(persistSession === false ? { persistSession: false } : {}),
        ...(permissionMode
          ? {
              permissionMode:
                permissionMode as import("@anthropic-ai/claude-agent-sdk").PermissionMode,
            }
          : {}),
        ...(model && { model }),
        // Left out entirely when nobody chose: the SDK's own default is the
        // model's, and writing a level here would put whiffle's guess in its
        // place on every model whose scale we cannot see.
        ...(effort && { effort }),
        ...(permissionMode === "bypassPermissions" && {
          allowDangerouslySkipPermissions: true,
          // Bypass mode must also let the model run commands outside the sandbox
          // via `dangerouslyDisableSandbox` — otherwise the SDK auto-denies such
          // Bash calls (`sandboxOverride`) without ever reaching `canUseTool`.
          sandbox: {
            ...((options as { sandbox?: Record<string, unknown> } | undefined)
              ?.sandbox ?? {}),
            allowUnsandboxedCommands: true,
          },
        }),
        cwd: workdir,
        includePartialMessages: true,
        // THE SEAM (design §4.1). The SDK builds the CLI's command line and
        // hands it here instead of spawning it; we forward it to sessiond and
        // hand back a `SpawnedProcess` over the socket. Nothing downstream —
        // `canUseTool` parking, `InputStream`, the queue frames, the whiffle
        // MCP server on the control channel — can tell the difference, which
        // is exactly the contract this option exists to provide. What changes
        // is custody: the child is sessiond's, and it outlives this agent.
        //
        // Placed AFTER the caller's `options` spread on purpose: a spawn
        // payload may not opt out of it. There is no flag and no in-process
        // fallback (PLAN.md C7).
        ...(sessiond
          ? {
              spawnClaudeCodeProcess: (
                spawnOptions: import("@anthropic-ai/claude-agent-sdk").SpawnOptions
              ) =>
                sessiondBridge(
                  sessiond.client,
                  sessiond.procId,
                  spawnOptions,
                  sessiond.attachAfter
                ),
            }
          : {}),
        canUseTool: (
          toolName,
          toolInput,
          { requestId, suggestions, toolUseID }
        ) =>
          new Promise<PermissionResult>((resolve) => {
            this.#permissions.set(requestId, resolve);
            if (toolName === ASK_USER_QUESTION) {
              const questions = normalizeQuestions(
                (toolInput as { questions?: unknown }).questions
              );
              if (questions) {
                this.#openQuestions.set(requestId, {
                  toolUseID,
                  questions,
                  input: toolInput as Record<string, unknown>,
                });
              }
            }
            ctx.permission({
              requestId,
              toolName,
              input: toolInput,
              suggestions,
            });
          }),
      },
    });

    this.#handle = handle;

    // Load skills natively: push /skill messages into the input stream before
    // any user prompt. The SDK handles them as slash commands — same as the
    // user typing /skill-name in the session.
    if (skills?.length) {
      for (const skill of skills) {
        input.push({
          type: "user",
          message: { role: "user", content: `/${skill}` },
          parent_tool_use_id: null,
        } as SDKUserMessage);
      }
    }

    this.#pump = this.#pumpMessages(ctx, handle, turn);
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the session's whole live-frame pipeline — question dismissal, structured-result folding, busy/failed reporting — one pass per SDK message
  async #pumpMessages(
    ctx: HarnessContext,
    handle: Query,
    turn: Turn
  ): Promise<void> {
    try {
      for await (const message of handle) {
        // A turn the CLI starts on its own — a background task's notification,
        // a message it held from the last turn — is a turn all the same: the
        // frames are the evidence, and a send into it waits like any other.
        // biome-ignore lint/suspicious/noUnnecessaryConditions: Turn.busy is mutated by Turn.start()/.end() elsewhere; the checker doesn't see that cross-class mutation
        if (!turn.busy && runsTurn(message)) {
          turn.start();
          ctx.busy(true);
        }
        // Free account-wide limit data: Claude Code read these off its own
        // response headers, so they are fresher than anything the polled
        // `/api/oauth/usage` can return — and cost no request of our own. Only
        // the reading is kept; the event is not a transcript frame.
        if (message.type === "rate_limit_event") {
          observeRateLimit(message.rate_limit_info);
          continue;
        }
        const neutral = toNeutral(message);
        if (!neutral) {
          continue;
        }
        // The Claude SDK emits `AskUserQuestion`'s structured output as a
        // top-level `tool_use_result` on the user message (the prose alone is
        // what lands in the `tool_result` block's `content`). Normalise it onto
        // the block so the dashboard reads one neutral shape and never parses
        // prose.
        if (neutral.type === "user") {
          const result = normalizeQuestionResult(
            (message as SDKUserMessage).tool_use_result
          );
          if (result && Array.isArray(neutral.message.content)) {
            for (const block of neutral.message.content) {
              if (block.type === "tool_result") {
                block.questionResult = result;
              }
            }
          }
        }
        // A dismissed question has no sidecar to normalise — the denial was
        // recorded when it was made, and this is the block it belongs to.
        if (neutral.type === "user" && this.#dismissedQuestions.size > 0) {
          const { content } = neutral.message;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type !== "tool_result") {
                continue;
              }
              const dismissed = this.#dismissedQuestions.get(block.tool_use_id);
              if (!dismissed) {
                continue;
              }
              this.#dismissedQuestions.delete(block.tool_use_id);
              block.questionResult = dismissed;
            }
          }
        }
        if (message.type === "system" && message.subtype === "init") {
          this.sessionId = message.session_id;
          ctx.session(message.session_id);
        }
        // TODO(servedModel wiring): a spawn's own `model` can be an alias
        // ('sonnet') the SDK resolves to a dated id; `neutral.message.model`
        // on this first assistant frame is what really served the turn, and
        // the hub — which already reads the first user message here for
        // `deriveTitleFromFirstMessage` — should read this the same way into
        // an `instances.served_model` column. Left undone: `db/schema.ts`,
        // `db/index.ts` and `server.ts` are mid-edit in another session's
        // working tree and a migration on top of that is unsafe right now.
        if (message.type === "result") {
          turn.end();
          ctx.busy(false);
        }
        ctx.frame(neutral);
      }
    } catch (error) {
      ctx.busy(false);
      ctx.failed(error);
    } finally {
      ctx.closed?.();
    }
  }

  send(
    message: SentMessage,
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">
  ): void {
    // The uuid rides on the message: the CLI keeps it as the command's own id
    // and names it in the `command_lifecycle` that says it was consumed.
    const sdk = message as unknown as SDKUserMessage;
    const queued = (message as { shouldQuery?: boolean }).shouldQuery === false;

    // A mid-turn injection: the model reads it at the next tool boundary without
    // losing work. If the stream is gone, fall back to queueing it.
    if (extras.urgent && this.#turn.busy) {
      const outgoing = withExtras(sdk, extras.attachments, extras.images);
      // biome-ignore lint/suspicious/useAwait: must stay an async generator — streamInput's signature requires AsyncGenerator<SDKUserMessage>, not the plain Generator a non-async function* would produce
      const stream = (async function* (): AsyncGenerator<SDKUserMessage> {
        yield outgoing;
      })();
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; the rejection is already handled by the .catch() right here, which falls back to the normal queue
      void this.#handle.streamInput(stream).catch(() => {
        this.#input.push(outgoing);
      });
      return;
    }

    // A queued hand-off picked up while the session is idle is the turn that
    // wakes it; otherwise it stays out of the way of the turn in flight.
    const wake = queued && !this.#turn.busy;
    if (!queued || wake) {
      this.#ctx.busy(true);
    }
    const outgoing = wake
      ? ({ ...sdk, shouldQuery: undefined } as typeof sdk)
      : sdk;

    this.#turn.start();
    this.#input.push(withExtras(outgoing, extras.attachments, extras.images));
  }

  async control(method: string, args: unknown[]): Promise<unknown> {
    // Effort is the one neutral verb with no `Query` method behind it: it is a
    // flag setting, applied over user/project/local settings and never written
    // to any of them, which is exactly a session-scoped switch. `max` is only
    // reachable this way — the persisted setting excludes it.
    if (method === CONTROL_SET_EFFORT) {
      return await this.#handle.applyFlagSettings({
        effortLevel: args[0] as EffortLevel,
      });
    }
    const handle = this.#handle as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    if (typeof handle[method] !== "function") {
      throw new Error(`unknown control method: ${method}`);
    }
    return await handle[method](...args);
  }

  resolvePermission(requestId: string, result: PermissionResult): void {
    const resolve = this.#permissions.get(requestId);
    if (!resolve) {
      throw new Error(`no permission request ${requestId}`);
    }
    this.#permissions.delete(requestId);
    const question = this.#openQuestions.get(requestId);
    if (!question) {
      resolve(result);
      return;
    }

    this.#openQuestions.delete(requestId);
    // Answering runs the tool, and the CLI writes the answers itself; walking
    // away leaves nothing behind, so the dismissal is recorded here for the
    // `tool_result` that is about to carry the CLI's denial prose.
    if (result.behavior === "deny") {
      this.#dismissedQuestions.set(question.toolUseID, {
        outcome: "dismissed",
        questions: question.questions,
      });
    }
    // A question can be answered by someone who never held the tool call: a
    // parent session's `answer_delegate` sends the chosen labels alone, and the
    // SDK rejects that input for the `questions` it no longer has. The parked
    // call is put back underneath, which is what the dashboard sends when it
    // answers one of these itself.
    resolve(settledQuestionResult(question, result));
  }

  async interrupt(): Promise<void> {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — a stream that already ended has nothing left to interrupt
    await this.#handle.interrupt().catch(() => {});
  }

  async stop(): Promise<void> {
    this.#input.end();
    for (const resolve of this.#permissions.values()) {
      resolve({ behavior: "deny", message: "session stopped" });
    }
    this.#permissions.clear();
    // Not dismissals: the session is going away, and no `tool_result` will
    // arrive for these to be folded onto.
    this.#openQuestions.clear();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the child may already be gone
    await this.#handle.interrupt().catch(() => {});
    await this.#turn.settle(SETTLE_TIMEOUT_MS);
    this.#handle.close();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — stop() already tore everything down; only a pump that was still mid-await needs waiting for
    await this.#pump.catch(() => {});
  }

  // biome-ignore lint/suspicious/useAwait: HarnessSession.dispose returns Promise<void>; dropping async would need an explicit Promise.resolve() wrapper instead
  async dispose(): Promise<void> {
    this.#input.end();
    this.#handle.close();
  }
}

const toInfo = (
  info: import("@anthropic-ai/claude-agent-sdk").SDKSessionInfo
): NeutralSessionInfo => ({
  sessionId: info.sessionId,
  harness: "claude",
  ...(info.summary === undefined ? {} : { summary: info.summary }),
  lastModified: info.lastModified,
  ...(info.fileSize === undefined ? {} : { fileSize: info.fileSize }),
  ...(info.customTitle === undefined ? {} : { customTitle: info.customTitle }),
  ...(info.firstPrompt === undefined ? {} : { firstPrompt: info.firstPrompt }),
  ...(info.gitBranch === undefined ? {} : { gitBranch: info.gitBranch }),
  ...(info.cwd === undefined ? {} : { cwd: info.cwd }),
  ...(info.tag === undefined ? {} : { tag: info.tag }),
  ...(info.createdAt === undefined ? {} : { createdAt: info.createdAt }),
});

const toEntry = (
  entry:
    | import("@anthropic-ai/claude-agent-sdk").SessionMessage
    | SDKSessionMessage
): SessionMessage => {
  // Every stored line carries the ISO time the turn was written, and the SDK
  // passes it through — but its `SessionMessage` type does not declare it, so
  // reading it needs the widening. Our own `SDKSessionMessage` declares it
  // directly — but read defensively either way.
  const written = (entry as { timestamp?: unknown }).timestamp;
  return {
    type: entry.type,
    uuid: entry.uuid,
    session_id: entry.session_id,
    // The SDK stores the *inner* message (its content blocks / text), which is
    // exactly what the dashboard's folding layer reads off `message.content`.
    message: entry.message,
    parent_tool_use_id: entry.parent_tool_use_id,
    parent_agent_id: entry.parent_agent_id,
    // A fold's line has an id of its own; the send it carries is keyed by this.
    ...((entry as SDKSessionMessage).sourceUuid
      ? { sourceUuid: (entry as SDKSessionMessage).sourceUuid }
      : {}),
    ...(typeof written === "string" ? { timestamp: written } : {}),
    ...((entry as { compactSummary?: true }).compactSummary
      ? { compactSummary: true as const }
      : {}),
  };
};

/**
 * A line off a child's stdout, as the CLI writes it. Only two shapes matter
 * during custody — an SDK message (which becomes a neutral frame) and a
 * `control_request` (which is either a permission to re-park or a control the
 * absent agent cannot serve). Everything else passes as `raw`.
 */
type CustodyLine =
  | (SDKMessage & { type: string })
  | {
      type: "control_request";
      request_id: string;
      request: { subtype: string } & Record<string, unknown>;
    }
  | { type: string; [key: string]: unknown };

/** The raw `control_response` the CLI reads off its stdin, both polarities. */
export const controlSuccess = (requestId: string, response: unknown): string =>
  `${JSON.stringify({
    type: "control_response",
    response: { subtype: "success", request_id: requestId, response },
  })}\n`;

export const controlError = (requestId: string, error: string): string =>
  `${JSON.stringify({
    type: "control_response",
    response: { subtype: "error", request_id: requestId, error },
  })}\n`;

/** The in-band notice a custody refusal writes into the transcript. */
export const CUSTODY_DEGRADED = "custody_degraded";

/** The fields of a ring line that custody reads; `undefined` when it is not JSON. */
interface RingLine {
  session_id?: unknown;
  skip_transcript?: unknown;
  subtype?: unknown;
  type?: unknown;
}

const parseLine = (data: string): RingLine | undefined => {
  try {
    return JSON.parse(data) as RingLine;
  } catch {
    return undefined;
  }
};

/** Lines only a running turn writes. `system` lines are read by subtype instead. */
const TURN_LINES: ReadonlySet<unknown> = new Set([
  "assistant",
  "user",
  "stream_event",
  "tool_progress",
  "control_request",
  "control_cancel_request",
]);

/**
 * WHETHER THE CHILD IS MID-TURN, read off its ring one line at a time — the
 * one thing that keeps a custody from handing the child to a fresh `Query`,
 * because a `Query` attached mid-stream would meet a turn it did not open and
 * permission asks it never parked.
 *
 * `result` ends a turn. `init` opens one: the CLI writes it when it takes up a
 * message, not when it starts (on the isolated stack a fresh child wrote its
 * hooks and the `initialize` control_response, and its `init` came with the
 * first send). A `task_notification` is a turn about to open: the CLI hands
 * it to the model as the next turn (measured: notification, `init`, the turn,
 * `result`). The lines in {@link TURN_LINES} are the turn itself. Everything
 * else carries the previous answer, because an idle child keeps writing hook,
 * status, `commands_changed`, `rate_limit_event`, `background_tasks_changed`
 * and `control_response` lines after its `result`, so the LAST line almost
 * never says anything about the turn.
 */
class ChildActivity {
  /** `undefined` until a line has said anything about a turn. */
  #waiting: boolean | undefined;

  read(line: RingLine | undefined): void {
    if (line === undefined) {
      return;
    }
    if (line.type === "result") {
      this.#waiting = true;
      return;
    }
    if (TURN_LINES.has(line.type)) {
      this.#waiting = false;
      return;
    }
    if (line.type !== "system") {
      return;
    }
    if (
      line.subtype === "init" ||
      (line.subtype === "task_notification" && line.skip_transcript !== true)
    ) {
      this.#waiting = false;
    }
  }

  /**
   * A child that has said nothing about a turn is not running one: it has
   * taken no turn in anything sessiond still remembers (see the head decision
   * in {@link ClaudeHarness.adopt}).
   */
  get turnRunning(): boolean {
    return this.#waiting === false;
  }
}

/**
 * Where an adoption's peek starts: the oldest line sessiond still holds.
 *
 * It used to be a fixed 64 lines back from the caller's cursor, and that is
 * the whole of the bug this constant replaces. An idle child does not fall
 * silent after its `result` — it keeps writing `control_response`,
 * `rate_limit_event` and `system` notices, and {@link ChildActivity} carries
 * the previous answer across those rather than replacing it. Once more than the
 * window's worth had piled up, the window held no turn-bearing line at all,
 * the verdict was still `undefined` at `head`, and the hand-off never fired:
 * the session sat in custody for good, holding every message sent to it.
 *
 * Reading from the ring's start cannot run out of window that way. It is one
 * pass over at most a few thousand retained lines, once per adopted session,
 * and only the peeked prefix is parsed — nothing below the caller's cursor is
 * re-emitted. Sessiond refusing this cursor is not a failure but the answer to
 * "how far back do you go": {@link SessiondClient.subscribe}'s `reset` names
 * the oldest seq it will serve, and the peek reopens there.
 */
const RING_START = 0;

/**
 * Controls that only READ the session. A dashboard asks these on every open
 * (and a looping one asked them thousands of times in seconds), and nothing
 * in the session changes when they are refused — so the refusal goes back to
 * the caller as the rejection alone. Writing it into the transcript as well
 * told the operator nothing and buried the turn under notices. Everything
 * that would have CHANGED the session keeps its in-band notice: those are the
 * refusals the operator has to see. `accountInfo` has no core constant; it is
 * the SDK's own method name, asked by the dashboard verbatim.
 */
const READ_ONLY_CONTROLS: ReadonlySet<string> = new Set([
  CONTROL_RELOAD_SKILLS,
  CONTROL_SUPPORTED_MODELS,
  CONTROL_SUPPORTED_COMMANDS,
  CONTROL_MCP_STATUS,
  CONTROL_CONTEXT_USAGE,
  "accountInfo",
]);

/**
 * Controls custody HOLDS rather than refuses. A fleet sync fires these at every
 * live session the moment the agent reconnects — which is exactly when every
 * session is in custody — so refusing them both spams the transcript and drops
 * the refresh on the floor. They are idempotent, and `refreshSessions` never
 * reads their result, so deferring them to the hand-off costs nothing and makes
 * the reload actually land. Every other control still fails at once: its caller
 * is waiting on a `control_result` that a hold would never deliver.
 */
const DEFERRED_CONTROLS: ReadonlySet<string> = new Set([
  "reloadSkills",
  "reloadPlugins",
  "reinitialize",
]);

/**
 * CUSTODY (design §4.1) — the session while the agent that owned it is gone.
 *
 * A restarted agent cannot reconstruct a live `Query` around a mid-stream
 * child: the SDK offers spawn substitution, not adoption of a half-initialized
 * protocol state (§4.1, and the spike recorded in this leaf's report did not
 * overturn it). So the returning agent takes CUSTODY instead — cursor
 * arithmetic and raw control answers, nothing more:
 *
 *  - ring lines are re-derived into neutral frames through {@link toNeutral},
 *    which is already a pure function over parsed JSON and needs no `Query`;
 *  - an unanswered `control_request`/`can_use_tool` is re-parked under the
 *    SDK's own `requestId`, so the hub's parked ask stays answerable — and the
 *    answer goes back as a raw `control_response` line, because that is what
 *    the `Query` would have written anyway;
 *  - any OTHER control the CLI asks of the absent agent (an `mcp_message` for
 *    the whiffle server, a hook callback) is answered with an explicit in-band
 *    error, so the tool call FAILS VISIBLY instead of hanging forever on a
 *    handler that no longer exists;
 *  - at the turn's next live `result` the hand-off fires: the owner builds a
 *    full SDK `Query` on the SAME process ({@link ClaudeHarness.spawn}'s
 *    attach), which re-sends `initialize` and reads the ring from the line
 *    custody stopped at. Nothing is relaunched, so nothing the child runs —
 *    a `run_in_background` command, a Monitor, a subagent — is cut off. A
 *    child that was already between turns when adopted has no next `result`
 *    coming, so {@link ClaudeHarness.adopt} hands off from the ring's last
 *    line instead.
 *
 * The attach waits for a turn boundary because a `Query` attached mid-stream
 * would meet a turn it did not open and permission asks it never parked.
 * Custody is a degraded mode measured in one turn, not a second
 * implementation of the SDK. Everything it refuses, it refuses out loud.
 */
export class ClaudeCustody implements HarnessSession {
  readonly harness = "claude" as const;
  sessionId: string | null = null;
  /** requestId → the parked ask, until an answer or the hand-off clears it. */
  readonly #parked = new Set<string>();
  /** Turns pushed during custody; delivered by the attached session. */
  readonly #held: {
    message: SentMessage;
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
  }[] = [];
  /** Controls deferred during custody; replayed by the attached session. */
  readonly #heldControls: { method: string; args: unknown[] }[] = [];
  #handedOff = false;
  /** Whether the child is mid-turn; fed every ring line, peeked or ingested. */
  readonly activity = new ChildActivity();
  /** Settled by {@link exited} when sessiond reports the child gone. */
  readonly #exit = Promise.withResolvers<void>();
  readonly instanceId: string;
  readonly #ctx: HarnessContext;
  readonly #write: (data: string) => void;
  /** Ends the child's stdin — how an operator's `stop` during custody ends it. */
  readonly #stdinEnd: () => void;
  /** Fired at the turn boundary; the owner attaches a `Query` to the same child. */
  readonly #onHandoff: (handoff: {
    instanceId: string;
    sessionId: string | null;
    held: {
      message: SentMessage;
      extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
    }[];
    heldControls: { method: string; args: unknown[] }[];
  }) => void;
  /** Signals the child; what a `stop` falls back to when EOF alone does not end it. */
  readonly #kill: (sig: NodeJS.Signals) => void;

  constructor(
    instanceId: string,
    ctx: HarnessContext,
    write: (data: string) => void,
    stdinEnd: () => void,
    onHandoff: (handoff: {
      instanceId: string;
      sessionId: string | null;
      held: {
        message: SentMessage;
        extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
      }[];
      heldControls: { method: string; args: unknown[] }[];
    }) => void,
    sessionId: string | null = null,
    kill: (sig: NodeJS.Signals) => void = () => {
      // Not supplied in every test rig: a `stop` that falls back to this is a no-op there.
    }
  ) {
    this.instanceId = instanceId;
    this.#ctx = ctx;
    this.#write = write;
    this.#stdinEnd = stdinEnd;
    this.#onHandoff = onHandoff;
    this.sessionId = sessionId;
    this.#kill = kill;
  }

  /** The child is gone — from the ring subscription's `exit`, whatever caused it. */
  exited(): void {
    this.#exit.resolve();
  }

  /** The asks still waiting for an answer — what a reattach re-announces. */
  get parked(): string[] {
    return [...this.#parked];
  }

  get handedOff(): boolean {
    return this.#handedOff;
  }

  /**
   * One raw stdout line, from the ring's backlog or live. Replay and live use
   * the same path on purpose: the daemon's single-threaded delivery is what
   * makes backlog-then-live gapless, and a second code path would be a second
   * place for a hole to open. `live` says the line was written after adoption
   * (above the ring's `head` then), not replayed from the backlog. Only a
   * live `result` is a boundary: a replayed one ended a turn that may well
   * have been followed by another still running further down the ring.
   */
  ingest(line: string, live: boolean): void {
    let parsed: CustodyLine;
    try {
      parsed = JSON.parse(line) as CustodyLine;
    } catch {
      // A line the CLI wrote that is not JSON is not a frame; sessiond never
      // promised us one, and inventing a frame from it would be a lie.
      return;
    }

    if (parsed.type === "control_request") {
      this.#onControlRequest(
        parsed as Extract<CustodyLine, { type: "control_request" }>
      );
      return;
    }
    // Usage data, not a transcript frame. Only a live line is read:
    // `observeRateLimit` stamps what it reads as current, so a replayed
    // reading would outrank a fresher poll.
    if (parsed.type === "rate_limit_event") {
      if (live) {
        observeRateLimit(
          (parsed as Extract<SDKMessage, { type: "rate_limit_event" }>)
            .rate_limit_info
        );
      }
      return;
    }
    // A control_response is the CLI answering something the dead agent asked;
    // nobody is waiting for it any more.
    if (
      parsed.type === "control_response" ||
      parsed.type === "control_cancel_request"
    ) {
      return;
    }

    const sdk = parsed as SDKMessage;
    if (
      sdk.type === "system" &&
      (sdk as { subtype?: string }).subtype === "init"
    ) {
      this.sessionId = sdk.session_id;
      this.#ctx.session(sdk.session_id);
    }
    const neutral = toNeutral(sdk);
    if (neutral) {
      this.#ctx.frame(neutral);
    }
    if (sdk.type === "result") {
      this.#ctx.busy(false);
      // THE BOUNDARY. The turn that was in flight when the agent died has now
      // completed and been captured; this is the moment a `Query` can attach
      // to the child without meeting a turn it did not open.
      if (live) {
        this.handOff();
      }
    }
  }

  #onControlRequest(
    request: Extract<CustodyLine, { type: "control_request" }>
  ): void {
    const requestId = request.request_id;
    if (request.request?.subtype === "can_use_tool") {
      // Re-parked under the SDK's own requestId — the same id the hub's parked
      // ask has carried end-to-end since this adapter first wrote it.
      this.#parked.add(requestId);
      const inner = request.request as {
        tool_name?: string;
        input?: Record<string, unknown>;
        permission_suggestions?: unknown;
      };
      this.#ctx.permission({
        requestId,
        toolName: inner.tool_name ?? "unknown",
        input: inner.input ?? {},
        ...(Array.isArray(inner.permission_suggestions)
          ? {
              suggestions:
                inner.permission_suggestions as import("@whiffle/core").PermissionUpdate[],
            }
          : {}),
        ...(inner.tool_name === ASK_USER_QUESTION
          ? { requestKind: "question" as const }
          : {}),
      });
      return;
    }
    // Everything else: the handler it is addressed to died with the agent.
    // Refused in-band and said out loud, so the tool call fails where the
    // reader can see it rather than hanging on a promise nobody holds.
    const subtype = request.request?.subtype ?? "unknown";
    const reason = `whiffle: agent restarted; \`${subtype}\` cannot be served during custody`;
    this.#write(controlError(requestId, reason));
    this.#ctx.frame({
      type: "system",
      subtype: CUSTODY_DEGRADED,
      ...(this.sessionId ? { session_id: this.sessionId } : {}),
      control: subtype,
      requestId,
      text: reason,
    } as unknown as NeutralMessage);
  }

  /**
   * Answer a parked permission. The `control_response` is written raw: there is
   * no `Query` to route it through, and the CLI reads exactly this shape off
   * its stdin either way (verified against the SDK's own writer, `sdk.mjs`
   * `handleControlRequest`).
   */
  resolvePermission(requestId: string, result: PermissionResult): void {
    if (!this.#parked.delete(requestId)) {
      throw new Error(`no permission request ${requestId}`);
    }
    this.#write(controlSuccess(requestId, result));
  }

  /**
   * A turn sent during custody. Held rather than written: a raw user message on
   * the child's stdin would bypass the queue machinery, the echo tagging and
   * the busy accounting that the `Query` owns, and there is no way to know from
   * here whether the model is ready for it. The hand-off is seconds away and
   * delivers it through the real path.
   */
  send(
    message: SentMessage,
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">
  ): void {
    this.#held.push({ message, extras });
  }

  /**
   * Fleet-sync controls are held for hand-off (see {@link DEFERRED_CONTROLS}).
   * Other controls except interrupt fail; only the ones that would have changed
   * the session fail in the transcript too (see {@link READ_ONLY_CONTROLS}).
   */
  control(method: string, args: unknown[] = []): Promise<unknown> {
    // The one control custody can serve itself: an interrupt is a raw
    // control_request on the child's stdin, not something the dead `Query` had
    // to route. Stopping a runaway turn is exactly what an operator needs
    // during custody, so it is dispatched here rather than refused.
    if (method === CONTROL_INTERRUPT) {
      return this.interrupt();
    }
    if (DEFERRED_CONTROLS.has(method)) {
      this.#heldControls.push({ method, args });
      return Promise.resolve(undefined);
    }
    const reason = `whiffle: agent restarted; control \`${method}\` is unavailable until this session hands back (custody)`;
    if (!READ_ONLY_CONTROLS.has(method)) {
      this.#ctx.frame({
        type: "system",
        subtype: CUSTODY_DEGRADED,
        ...(this.sessionId ? { session_id: this.sessionId } : {}),
        control: method,
        text: reason,
      } as unknown as NeutralMessage);
    }
    return Promise.reject(new Error(reason));
  }

  /**
   * An interrupt cannot wait for a turn boundary — that is the whole point of
   * one — so it is written as the raw control_request the `Query` would have
   * sent, and the hand-off follows on the `result` the interrupt produces.
   */
  // biome-ignore lint/suspicious/useAwait: HarnessSession.interrupt returns Promise<void>; dropping async would need an explicit Promise.resolve() wrapper instead
  async interrupt(): Promise<void> {
    const requestId = crypto.randomUUID();
    this.#write(
      `${JSON.stringify({ type: "control_request", request_id: requestId, request: { subtype: "interrupt" } })}\n`
    );
  }

  /**
   * The hand-off, once. The child is left exactly as it is — stdin open, every
   * background task running — for the `Query` the owner attaches to it.
   */
  handOff(): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #handedOff is set true elsewhere in this class once a hand-off fires; the checker doesn't see that cross-method mutation
    if (this.#handedOff) {
      return;
    }
    this.#handedOff = true;
    this.#onHandoff({
      instanceId: this.instanceId,
      sessionId: this.sessionId,
      held: [...this.#held],
      heldControls: [...this.#heldControls],
    });
    this.#held.length = 0;
    this.#heldControls.length = 0;
  }

  async stop(): Promise<void> {
    // After the hand-off the child belongs to the `Query` attaching to it: the
    // supervisor retires this custody on its way to that attach, and ending
    // the child here would be the very relaunch the attach exists to avoid.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #handedOff is set true by handOff() once a hand-off fires; the checker doesn't see that cross-method mutation
    if (this.#handedOff) {
      return;
    }
    // A stop during custody is the operator ending the session, not a
    // hand-off: nothing is parked afterwards and nothing is attached.
    for (const requestId of this.#parked) {
      this.#write(controlError(requestId, "whiffle: session stopped"));
    }
    this.#parked.clear();
    this.#held.length = 0;
    this.#heldControls.length = 0;
    this.#handedOff = true;
    this.#stdinEnd();
    // Returned only once the child is actually dead: the operator's stop is
    // done when the process is, and a spawn that follows under the same procId
    // must not meet a still-alive predecessor (sessiond SIGKILLs it and
    // broadcasts its exit to whoever is subscribed under that id by then).
    if (await within(this.#exit.promise, CUSTODY_EXIT_MS)) {
      return;
    }
    this.#kill("SIGKILL");
    await within(this.#exit.promise, CUSTODY_EXIT_MS);
  }

  // biome-ignore lint/suspicious/useAwait: HarnessSession.dispose returns Promise<void>; dropping async would need an explicit Promise.resolve() wrapper instead
  async dispose(): Promise<void> {
    this.#parked.clear();
    this.#held.length = 0;
    this.#heldControls.length = 0;
  }
}

async function listAccountModels(): Promise<
  { id: string; display_name: string; created_at: string }[] | undefined
> {
  try {
    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
    };
    if (process.env.ANTHROPIC_API_KEY) {
      headers["x-api-key"] = process.env.ANTHROPIC_API_KEY;
    } else {
      const credentials = JSON.parse(
        await readFile(
          join(
            process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
            ".credentials.json"
          ),
          "utf8"
        )
      );
      const token = credentials.claudeAiOauth?.accessToken;
      if (!token) {
        return undefined;
      }
      headers.Authorization = `Bearer ${token}`;
      headers["anthropic-beta"] = "oauth-2025-04-20";
    }
    const models: { id: string; display_name: string; created_at: string }[] =
      [];
    const url = new URL("https://api.anthropic.com/v1/models?limit=100");
    let hasMore: boolean;
    do {
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous page's cursor
      const response = await fetch(url, { headers });
      if (!response.ok) {
        return undefined;
      }
      const page = (await response.json()) as {
        data: typeof models;
        has_more: boolean;
        last_id: string;
      };
      models.push(...page.data);
      hasMore = page.has_more;
      url.searchParams.set("after_id", page.last_id);
    } while (hasMore);
    return models;
  } catch {
    return undefined;
  }
}

/** The `[1m]` context suffix an alias's model id may carry. */
const CONTEXT_SUFFIX = /\[1m\]$/;

/**
 * The model catalog this machine's Claude Code and account offer, probed
 * independently of any session.
 * The SDK supplies CLI aliases and effort capabilities, while the Anthropic
 * models endpoint supplies the full account catalog. Both are queried concurrently
 * and merged alias-first so concrete model IDs do not disappear behind aliases.
 *
 * `supportedModels()` is a `Query` method, which is why this used to be asked
 * of whatever session happened to be running — but a `Query` is not a session.
 * One can be spawned to be asked and thrown away: `maxTurns: 0` with an empty
 * prompt reaches no model and spends nothing, and `persistSession: false`
 * leaves no session behind. Roughly a second, once per agent.
 *
 * A probe that fails answers `undefined`, not `[]`: a machine that cannot say
 * what models it has is not a machine offering none, and the report keeps that
 * difference (see {@link HarnessReport.models}). It never throws — a catalog it
 * could not read is no reason for the machine to fail to report itself at all.
 */
async function probeModels(): Promise<ModelInfo[] | undefined> {
  const [aliases, accountModels] = await Promise.all([
    (async (): Promise<ModelInfo[] | undefined> => {
      try {
        const handle = query({
          prompt: "",
          options: { maxTurns: 0, persistSession: false },
        });
        try {
          return await handle.supportedModels();
        } finally {
          // Tearing the child down takes longer than the answer did, and nothing
          // waits on it — the catalog is already in hand.
          // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — disposal has no result anyone reads, and awaiting it would double how long `detect()` blocks
          void handle.return().catch(() => {
            // the child is going away regardless; a failure to close it politely is
            // not something the report should carry
          });
        }
      } catch {
        return undefined;
      }
    })(),
    listAccountModels(),
  ]);
  if (!(aliases || accountModels)) {
    return undefined;
  }
  const defaultModel = aliases?.find((model) => model.value === "default");
  const values = new Set(aliases?.map((model) => model.value));
  // An alias resolves to a concrete model (`sonnet` → `claude-sonnet-5`, with
  // or without a `[1m]` context suffix), so it carries that model's release.
  const releasedById = new Map(
    (accountModels ?? []).map((model) => [
      model.id,
      model.created_at.slice(0, 10),
    ])
  );
  const dated = (aliases ?? []).map((alias) => {
    const released = releasedById.get(
      (alias.resolvedModel ?? alias.value).replace(CONTEXT_SUFFIX, "")
    );
    return released ? { ...alias, released } : alias;
  });
  return [
    ...dated,
    ...(accountModels ?? [])
      .filter((model) => !values.has(model.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((model) => ({
        value: model.id,
        resolvedModel: model.id,
        displayName: model.display_name,
        released: model.created_at.slice(0, 10),
        description: `Released ${model.created_at.slice(0, 10)}`,
        ...(defaultModel
          ? {
              supportsEffort: defaultModel.supportsEffort,
              supportedEffortLevels: defaultModel.supportedEffortLevels,
              supportsAdaptiveThinking: defaultModel.supportsAdaptiveThinking,
            }
          : {}),
      })),
  ];
}

export class ClaudeHarness implements Harness {
  readonly kind = "claude" as const;
  readonly capabilities = CLAUDE_CAPABILITIES;
  auth: AuthState = "authenticated";

  /**
   * The catalog, probed at most once per agent. Held as the promise rather than
   * its result so that concurrent `detect()` calls — registration and a
   * reannounce racing — share one probe instead of spawning a CLI each.
   */
  #models: Promise<ModelInfo[] | undefined> | undefined;

  async detect(): Promise<HarnessReport> {
    const auth = await probeAuth();
    this.auth = auth;
    const installed =
      resolveBin("claude") !== undefined || auth === "authenticated";
    // Nothing to ask when there is no CLI to ask, and an unauthenticated one
    // answers about an account that is not there.
    if (installed && auth === "authenticated") {
      // A probe that failed is not an answer worth keeping: forget it so the
      // next report asks again, rather than making one bad moment at startup
      // the machine's catalog for as long as the agent lives.
      this.#models ??= probeModels().then((list) => {
        if (!list) {
          this.#models = undefined;
        }
        return list;
      });
    }
    const models = await this.#models;
    return {
      harness: "claude",
      installed,
      version: undefined,
      auth,
      capabilities: CLAUDE_CAPABILITIES,
      ...(models ? { models } : {}),
    };
  }

  /**
   * The machine's one sessiond connection, dialled lazily and shared by every
   * claude session. Lazy rather than eager so a machine with no sessions never
   * needs a daemon, and so the install-time error lands on the spawn that
   * needed it (with an instance to report against) rather than at import time.
   */
  #sessiond: Promise<SessiondClient> | undefined;

  async sessiond(
    // `WHIFFLE_SESSIOND_ENDPOINT` is sessiond's own override
    // (`sessiond/src/main.ts`), honoured on this side too so a dev run — or a
    // test — can point both halves at a scratch socket instead of the real one.
    endpoint: string = process.env.WHIFFLE_SESSIOND_ENDPOINT ??
      sessiondEndpoint()
  ): Promise<SessiondClient> {
    const existing = await this.#sessiond?.catch(() => undefined);
    if (existing && !existing.closed) {
      return existing;
    }
    // A dead connection is re-dialled; the CHILDREN are unaffected, which is
    // the whole property sessiond exists to provide.
    this.#sessiond = (async () => {
      await ensureSessiond(endpoint);
      return SessiondClient.connect(endpoint);
    })();
    return this.#sessiond;
  }

  /**
   * Custodies that have handed back, by instance: the ring line each stopped
   * at. The supervisor answers a hand-off with a `spawn` for the same
   * instance, and that spawn attaches here instead of starting a process.
   */
  readonly #attachAt = new Map<string, number>();

  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
    // The child is spawned under sessiond, unconditionally — no flag, no
    // in-process fallback (PLAN.md C7). `procId` is the instance id: stable
    // across agent restarts, which is what lets the returning agent match a
    // surviving child to the row it belongs to.
    const client = await this.sessiond();
    const fleetDenyList = await resolvedDenyList();
    const attachAfter = this.#attachAt.get(ctx.instanceId);
    this.#attachAt.delete(ctx.instanceId);
    const attaching = attachAfter !== undefined;
    const session = new ClaudeSession(
      ctx.instanceId,
      ctx,
      ctx.cwd,
      spec.options,
      spec.permissionMode,
      spec.model,
      spec.effort,
      spec.resume,
      spec.persistSession,
      // An attached child loaded its skills when it was spawned.
      attaching ? undefined : spec.skills,
      spec.denyTools,
      fleetDenyList,
      { client, procId: ctx.instanceId, ...(attaching ? { attachAfter } : {}) }
    );
    // An attached child writes no `init` until its next turn, and the
    // conversation it carries is the one the hand-off named.
    if (attaching && spec.resume) {
      session.sessionId = spec.resume.sessionKey;
    }
    return session;
  }

  /**
   * Take custody of a child that outlived the agent (design §4.1). The caller
   * supplies the cursor it wants resumed from — the hub's own ingest mark when
   * it has one, `undefined` to follow from now — and the hand-off it wants at
   * the turn boundary.
   *
   * THE IDLE CHILD (the boundary that never comes). Custody hands back at the
   * next `result`, and a child whose turn finished BEFORE the agent died never
   * writes another one: stream-json is silent after a `result` until the next
   * user message, and custody holds every message. Left to the rule above such
   * a session stays in custody for good — turns held, controls refused, and
   * the row still reading `running` because the process is plainly there.
   *
   * So the ring is read from {@link RING_START} through `head` and every line
   * is fed to the custody's {@link ChildActivity}. There is exactly one
   * decision, taken once, at the one moment the whole backlog has gone past:
   * unless the ring says a turn is in flight, the hand-off fires and the
   * next `spawn` for this instance attaches to the child. Reading from the start is
   * what makes that a decision rather than a guess — a fixed window can fill
   * with the notices an idle child keeps writing and answer "don't know",
   * which is the shape of the bug this replaces, whereas a full ring holding
   * no turn-bearing line means the child has not taken a turn in anything
   * sessiond still remembers.
   *
   * The peek is the same subscribe opened earlier, not a second read: what
   * comes back at or below the caller's own cursor is looked at and NOT
   * re-emitted — the hub already has it, and `ingest` would hand it a frame
   * it holds. A cursor sessiond refuses is not a transcript gap and not a
   * dead end: its `reset` names the oldest line it still holds, and the peek
   * reopens there.
   */
  async adopt(
    instanceId: string,
    ctx: HarnessContext,
    options: {
      afterSeq?: number;
      sessionId?: string | null;
      /** The ring's last seq as the welcome reported it; absent means no peek. */
      head?: number;
      onHandoff: (handoff: {
        instanceId: string;
        sessionId: string | null;
        held: {
          message: SentMessage;
          extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
        }[];
        heldControls: { method: string; args: unknown[] }[];
      }) => void;
    }
  ): Promise<ClaudeCustody> {
    const client = await this.sessiond();
    const head = options.head ?? 0;
    // The last ring line custody has read. The `Query` attached at the
    // hand-off reads from the line after it — and never from below `head`, so
    // a peek that stopped short does not feed history to it as live output.
    let lastSeq = 0;
    const custody = new ClaudeCustody(
      instanceId,
      ctx,
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; sessiond write failures are not this session's to surface, best effort only
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — nothing here can act on a write failure to a gone child
      (data) => void client.write(instanceId, data).catch(() => {}),
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; sessiond stdin-end failures are not this session's to surface, best effort only
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — nothing here can act on a stdin-end failure to a gone child
      () => void client.stdinEnd(instanceId).catch(() => {}),
      (handoff) => {
        this.#attachAt.set(instanceId, Math.max(lastSeq, head));
        options.onHandoff(handoff);
      },
      options.sessionId ?? null,
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; sessiond signal failures are not this session's to surface, best effort only
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — nothing here can act on a signal failure to a gone child
      (sig) => void client.signal(instanceId, sig).catch(() => {})
    );
    // Everything at or below `boundary` the hub has already seen; everything
    // above it is the replay the caller asked for. A cursor past `head` names
    // lines the ring never assigned — sessiond's refusal covers that, and a
    // peek would only muddle whose refusal it was.
    // Raised to `head` if the replay is refused: what survives is then read
    // for the verdict and emitted to nobody (see the `reset` handler).
    let boundary = options.afterSeq ?? head;
    let peekSeq = head >= 1 && boundary <= head ? RING_START : undefined;
    // Set once the line at `head` has been read and the adoption has decided.
    let decided = false;
    let seen = false;
    let reopened = false;
    const outstanding = new Map<string, string>();
    const repark = (): void => {
      // The hub has these lines, but its pending asks did not survive restart.
      // Only unresolved can_use_tool requests may replay without emitting frames.
      for (const line of outstanding.values()) {
        custody.ingest(line, false);
      }
      outstanding.clear();
    };
    // PROVENANCE (design §7). This frame came from exactly one sessiond line,
    // and this is the only place that knows which: the stamp goes one
    // statement before the ingest that emits it, because `ingest` emits
    // synchronously and so the stamp lands on that frame and no other.
    // Without it the hub has nothing to dedupe a replayed or re-sent line by.
    //
    // `client.epoch` is read here rather than asserted once at adopt time: it
    // is only defined after sessiond's welcome, and reading it per line keeps
    // the stamp truthful if a client ever re-welcomes under a new epoch.
    // Undefined means no stamp at all — an unstamped frame is the pre-ledger
    // behaviour the honest-loss rule already covers, which is strictly better
    // than a frame stamped with an epoch nobody minted.
    const stamp = (seq: number): void => {
      const srcEpoch = client.epoch;
      if (srcEpoch !== undefined) {
        (ctx as Partial<SessiondAwareContext>).line?.(srcEpoch, seq);
      }
    };
    // A PEEK THAT NEVER REACHES `head` MUST STILL HAND BACK.
    //
    // The hand-off below fires on the line at `head`, and there are survivors
    // no such line ever arrives for: a sessiond too old to name its retained
    // window (see `reset`) refuses the peek outright, and an idle child writes
    // nothing further to rescue it. The session is then held for the life of
    // this process — every message sent to it parked, the board showing it
    // running — which is the wedge custody exists to prevent, not to cause.
    //
    // SILENCE IS THE EVIDENCE, so it is read as such. Every line pushes the
    // deadline out, so a child that is genuinely mid-turn — which writes
    // assistant and stream lines continuously — never reaches it, and one
    // whose replay is merely slow keeps its full peek. What fires it is the
    // child having gone quiet with the peek still outstanding, and the answer
    // is then the same one `head` would have given: a hand-off unless what was
    // read says a turn is running, which is custody's to keep until the
    // child's own `result` line hands it back. Once `head` has decided there
    // is no peek left to wait for, and the silence of a long tool call says
    // nothing.
    const QUIET_HANDBACK_MS = 15_000;
    let quiet: ReturnType<typeof setTimeout> | undefined;
    const stopWaiting = (): void => {
      if (quiet !== undefined) {
        clearTimeout(quiet);
        quiet = undefined;
      }
    };
    const waitForQuiet = (): void => {
      stopWaiting();
      quiet = setTimeout(() => {
        quiet = undefined;
        if (peekSeq === undefined || decided || custody.handedOff) {
          return;
        }
        repark();
        if (custody.activity.turnRunning) {
          // Held on purpose, and said so: a custody nobody can explain looks
          // exactly like the bug this guard removes.
          ctx.frame({
            type: "system",
            subtype: "sessiond_custody_held",
            text: `whiffle: adopted this session but sessiond's replay stopped short of line ${head}; holding it because its last turn reads as still running`,
          } as unknown as NeutralMessage);
          return;
        }
        custody.handOff();
      }, QUIET_HANDBACK_MS);
    };
    // Peek-only: recover the session id and unanswered asks, never frames.
    const peek = (parsed: ReturnType<typeof parseLine>, data: string): void => {
      if (parsed?.type === "control_request") {
        const request = parsed as Extract<
          CustodyLine,
          { type: "control_request" }
        >;
        if (request.request.subtype === "can_use_tool") {
          outstanding.set(request.request_id, data);
        }
      } else if (parsed?.type === "control_cancel_request") {
        outstanding.delete((parsed as { request_id: string }).request_id);
      } else if (
        parsed?.type === "assistant" ||
        parsed?.type === "user" ||
        parsed?.type === "result"
      ) {
        outstanding.clear();
      }
      if (
        custody.sessionId === null &&
        typeof parsed?.session_id === "string"
      ) {
        custody.sessionId = parsed.session_id;
      }
    };
    const listener: Parameters<SessiondClient["subscribe"]>[1] = {
      line: (event) => {
        // Past the hand-off every line is the attached `Query`'s: it reads
        // from the line after the one custody stopped at.
        if (custody.handedOff) {
          return;
        }
        lastSeq = event.seq;
        seen = true;
        if (!decided) {
          waitForQuiet();
        }
        // Every line feeds whether a turn is running, peeked, replayed or
        // live: the decision at `head` reads the whole backlog.
        const parsed = parseLine(event.data);
        custody.activity.read(parsed);
        if (peekSeq !== undefined && event.seq <= boundary) {
          peek(parsed, event.data);
        } else {
          repark();
          stamp(event.seq);
          custody.ingest(event.data, event.seq > head);
        }
        if (event.seq === head) {
          repark();
        }
        // There is no backlog-complete event; the ring's last line is it, and
        // it is the one place an adoption decides.
        //
        // A SILENT RING IS AN IDLE CHILD. Nothing said about a turn does not
        // mean the evidence scrolled away — reading from {@link RING_START} is
        // what removes that reading — it means nothing in everything sessiond
        // still holds says anything about a turn. A child mid-turn cannot look
        // like that: it writes assistant and stream lines continuously, and
        // those replace the answer rather than carry it. What CAN look like that is
        // a child that has taken no turn since its ring began and has only
        // written hook and notice lines since, which is exactly the session
        // this rule exists to hand back. Measured on a wedged one: six lines,
        // all `hook_started`/`hook_response`/`control_response`, no `init` and
        // no `result` — a strict `=== true` left it mute indefinitely.
        //
        // A turn still running stays in custody until its own `result`, and
        // is busy from here, as it was before the agent went away.
        if (peekSeq !== undefined && head >= 1 && event.seq === head) {
          decided = true;
          stopWaiting();
          if (custody.activity.turnRunning) {
            ctx.busy(true);
          } else {
            custody.handOff();
          }
        }
      },
      // A child that dies during custody is the session ending on its own,
      // and the supervisor's `closed` hook retires the row. After the
      // hand-off (or a stop) its death is the EOF doing what it was sent to
      // do — expected, and not the session ending — so only `stop`'s wait
      // hears of it.
      exit: () => {
        stopWaiting();
        custody.exited();
        if (!custody.handedOff) {
          ctx.closed?.();
        }
      },
      // §6's honest refusal, surfaced rather than smoothed over — unless what
      // was refused is the peek window, which nobody asked to see. Asking from
      // the ring's start is asking for more than sessiond may still hold, so a
      // refusal here is not a failure but the answer to how far back it goes:
      // `oldest` is the earliest line it will serve, and the peek reopens on
      // the cursor just below it rather than switching itself off. The verdict
      // is then read over everything that survives, which is all there is to
      // read. Any reset after that, or with no peek outstanding, is a real seam.
      //
      // IT MUST BE `oldest`, NOT `nextSeq`. `nextSeq` is where the REFUSED
      // subscription resumes — `head + 1`, a line the child has not written —
      // and reopening there is how an idle survivor stayed wedged: the peek
      // read nothing, never reached `head`, never handed back, and held every
      // message sent to it for as long as the process lived. A sessiond too
      // old to send `oldest` has no window to name, so that case keeps the
      // previous behaviour rather than inventing a cursor.
      reset: (nextSeq, oldest) => {
        const reopenAt = oldest === undefined ? nextSeq : oldest - 1;
        if (peekSeq !== undefined && peekSeq < reopenAt && !seen && !reopened) {
          reopened = true;
          peekSeq = reopenAt;
          if (reopenAt > boundary) {
            // The caller's replay was refused, and reading the survivors does
            // not quietly grant a smaller one: §6 is never a PARTIAL replay,
            // so the seam is announced and the peek window is widened to the
            // whole of it. Everything sessiond still holds is then looked at
            // for the verdict and emitted to nobody; the transcript resumes
            // where the refusal said it would, at the next line the child
            // writes.
            boundary = head;
            ctx.frame({
              type: "system",
              subtype: "sessiond_stream_gap",
              text: `whiffle: sessiond's replay window overflowed; this transcript resumes at line ${nextSeq}`,
            } as unknown as NeutralMessage);
          }
          client.subscribe(instanceId, listener, reopenAt);
          waitForQuiet();
          return;
        }
        ctx.frame({
          type: "system",
          subtype: "sessiond_stream_gap",
          text: `whiffle: sessiond's replay window overflowed; this transcript resumes at line ${nextSeq}`,
        } as unknown as NeutralMessage);
      },
    };
    client.subscribe(instanceId, listener, peekSeq ?? options.afterSeq);
    if (peekSeq !== undefined) {
      // A peek that is refused outright, or answered with nothing, produces no
      // line to arm the wait from — so it is armed here, before the first one.
      waitForQuiet();
    }
    return custody;
  }

  /** What sessiond is still holding for this machine — the reattach's first read. */
  async custodyCandidates(): Promise<SessiondWelcomeInfo> {
    const client = await this.sessiond();
    return client.list();
  }

  listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    return listSessions({ ...(dir ? { dir } : {}) }).then((rows) =>
      rows.map(toInfo)
    );
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    const info = await getSessionInfo(sessionKey, { ...(dir ? { dir } : {}) });
    return info ? toInfo(info) : undefined;
  }

  async getSessionMessages(
    sessionKey: string,
    dir?: string,
    tailCount?: number,
    whole?: boolean
  ): Promise<SessionMessage[]> {
    const file = await claudeSessionFile(sessionKey, dir);
    if (!file) {
      return [];
    }
    if (whole) {
      return (await readSessionWhole(file)).map(toEntry);
    }
    // A tail read scans backward from EOF and parses only the newest window —
    // ~4ms on a 97MB transcript vs ~150ms for the full parse. Callers that
    // page deeper omit `tail` and get the whole conversation.
    const rows = tailCount
      ? (await readSessionEnd(file, tailCount)).messages
      : await readSessionFull(file);
    // `readSessionFull` preserves `toolUseResult` on each record, so
    // `AskUserQuestion` answers can be folded without re-reading the file.
    // Only entries whose assistant message contained an `AskUserQuestion`
    // tool_use need the sidecar attached — build a uuid→result map inline.
    const sidecars = new Map<string, UserQuestionResult>();
    for (const entry of rows) {
      if (entry.toolUseResult !== undefined) {
        const result = normalizeQuestionResult(entry.toolUseResult);
        if (result) {
          sidecars.set(entry.uuid, result);
        }
      }
    }
    if (sidecars.size === 0) {
      return rows.map(toEntry);
    }
    return rows.map((entry) => {
      const result = sidecars.get(entry.uuid);
      if (!result) {
        return toEntry(entry);
      }
      return {
        ...toEntry(entry),
        message: attachQuestionResult(entry.message, result),
      };
    });
  }

  renameSession(
    sessionKey: string,
    title: string,
    dir?: string
  ): Promise<void> {
    return renameSession(sessionKey, title, { ...(dir ? { dir } : {}) });
  }

  tagSession(
    sessionKey: string,
    tag: string | null,
    dir?: string
  ): Promise<void> {
    return tagSession(sessionKey, tag, { ...(dir ? { dir } : {}) });
  }

  deleteSession(sessionKey: string, dir?: string): Promise<void> {
    return deleteSession(sessionKey, { ...(dir ? { dir } : {}) });
  }

  // biome-ignore lint/suspicious/useAwait: Harness.machine returns Promise<unknown>; the `default` branch returns bare undefined, which needs async's implicit wrap
  async machine(method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case MARKETPLACE_CATALOG:
        return marketplaceCatalog(args[0] as string);
      case READ_MEMORY_FILE:
        return readMemoryFile();
      case READ_SKILL_FILES:
        return readSkillFiles(args[0] as string, args[1] as string | undefined);
      case INSPECT_CONFIG:
        return inspectConfig(args[0] as string | undefined);
      case "beginLogin":
        return beginLogin();
      case "completeLogin":
        return completeLogin(args[0] as string);
      case "clearCredentials":
        return clearCredentials();
      case "exportCredentials":
        return exportCredentials();
      case "importCredentials":
        return importCredentials(args[0] as Record<string, unknown>);
      case "unlockKeychain":
        return unlockKeychain(args[0] as string);
      case "probeAuth":
        return probeAuth();
      default:
        return undefined;
    }
  }

  syncFleet(config: import("@whiffle/core").FleetConfig) {
    return syncFleetConfig(config);
  }

  fleetStatus() {
    return fleetStatus();
  }
}

export const claudeHarness: Harness = new ClaudeHarness();
