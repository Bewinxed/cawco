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
import { access, readdir, readFile, realpath, stat } from "node:fs/promises";
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
  NeutralUserMessage,
  QueuedMessage,
  SendPayload,
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
  isInjected,
  MARKETPLACE_CATALOG,
  MESSAGE_DEQUEUED,
  MESSAGE_QUEUED,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  settledQuestionResult,
} from "@whiffle/core";
import { sessiondEndpoint } from "@whiffle/core/sessiond";
import { observeRateLimit } from "@whiffle/core/usage/observed";
import {
  type Checkpoint,
  readTranscriptTail,
  typeFilter,
} from "@whiffle/jsonl-parser";
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
  absorbedMessage,
  type RawRecord,
  readSessionEnd,
  readSessionFull,
  readSessionWhole,
  type SDKSessionMessage,
} from "./claude-transcript";

/** The neutral frame is the SDK frame re-tagged: same fields, plus the original. */
export const toNeutral = (sdk: SDKMessage): NeutralMessage => {
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
 * Whether a push WAITS here is the whole of what "queued" means for this
 * harness: the iterator is parked on `next()` exactly when the model is ready
 * for its next turn, so a push that finds it parked flows straight through and
 * one that does not is a message the session is too busy to start. That is a
 * fact only this class knows, so it is the one that reports it — {@link push}
 * answers with it, and {@link onConsume} fires at the moment the wait ends.
 */
export class InputStream implements AsyncIterable<SDKUserMessage> {
  readonly #queue: { message: SDKUserMessage; queueId?: string }[] = [];
  #waiting: ((result: IteratorResult<SDKUserMessage>) => void) | null = null;
  #ended = false;
  /** Called with the id of a tagged message at the moment the model pulls it. */
  readonly #onConsume: (queueId: string) => void;

  constructor(
    onConsume: (queueId: string) => void = () => {
      // No listener by default: not every caller cares when a queued message lands.
    }
  ) {
    this.#onConsume = onConsume;
  }

  /**
   * Hands one turn to the model, or holds it until the running one is done.
   * Returns whether it had to wait — `false` means the model took it now.
   */
  push(message: SDKUserMessage, queueId?: string): boolean {
    const waiting = this.#waiting;
    if (waiting) {
      this.#waiting = null;
      waiting({ done: false, value: message });
      return false;
    }
    this.#queue.push({ message, ...(queueId ? { queueId } : {}) });
    return true;
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
          if (queued.queueId) {
            this.#onConsume(queued.queueId);
          }
          return Promise.resolve({ done: false, value: queued.message });
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

/**
 * What a turn was typed as, before the adapter folded pastes and images into
 * it. This is what a queued row renders, and it is deliberately the text the
 * dashboard's own local copy holds — matching them is how the queue's truth
 * replaces the client's guess without doubling the message on screen.
 */
export const queuedText = (message: NeutralUserMessage): string => {
  const { content } = message.message;
  if (typeof content === "string") {
    return content;
  }
  return content
    .filter(
      (block): block is { type: "text"; text: string } => block.type === "text"
    )
    .map((block) => block.text)
    .join("\n");
};

/** The `message_queued` announcement for one held turn. */
export const queuedFrame = (
  queued: QueuedMessage,
  sessionId: string | null
): NeutralMessage => ({
  type: "system",
  subtype: MESSAGE_QUEUED,
  ...(sessionId ? { session_id: sessionId } : {}),
  queueId: queued.queueId,
  text: queued.text,
  timestamp: queued.timestamp,
  ...(queued.images ? { images: queued.images } : {}),
});

/** And the one that retires it, at the moment the model pulled it. */
export const dequeuedFrame = (
  queueId: string,
  sessionId: string | null
): NeutralMessage => ({
  type: "system",
  subtype: MESSAGE_DEQUEUED,
  ...(sessionId ? { session_id: sessionId } : {}),
  queueId,
});

/**
 * The frame for a message the model folded into its running turn, read off the
 * transcript ({@link absorbedMessage}) because stdout never carries it. It
 * keeps the transcript line's uuid, so the stored copy a later read brings is
 * the same message, not a second one.
 */
const absorbedFrame = (absorbed: SDKSessionMessage): NeutralMessage =>
  ({
    type: "user",
    uuid: absorbed.uuid,
    session_id: absorbed.session_id,
    parent_tool_use_id: null,
    message: absorbed.message,
    timestamp: absorbed.timestamp,
    ...(absorbed.sourceUuid ? { sourceUuid: absorbed.sourceUuid } : {}),
  }) as NeutralMessage;

/** Only these transcript lines can carry an absorbed message. */
const ABSORBED_LINES = typeFilter("attachment");

/**
 * The frames after which an absorbed message is on disk: the main loop opening
 * its next model call (the fold is written before the request that carries
 * it), and the turn's `result`.
 */
const readsAbsorbed = (message: SDKMessage): boolean =>
  message.type === "result" ||
  (message.type === "stream_event" &&
    message.parent_tool_use_id === null &&
    message.event.type === "message_start");

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

/** How many consumed turns wait to be matched to their frame before the oldest is dropped. */
const AWAITING_ECHO_LIMIT = 32;

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
  /**
   * Messages waiting for a turn to end, oldest first — the queue as observable
   * state ({@link QueuedMessage}). This is the daemon's own copy of what
   * {@link InputStream} is holding, kept so the queue can be announced,
   * snapshotted and retired by id rather than inferred by a client.
   */
  readonly #queued: QueuedMessage[] = [];
  /**
   * Turns the model has pulled but whose own frame has not gone past yet,
   * oldest first. The SDK echoes a consumed turn back as an ordinary `user`
   * message with a uuid of its own making — there is no id on it that says
   * which send it was — so the text is what matches it to its queue entry, and
   * {@link #pumpMessages} tags the frame before it leaves the daemon.
   */
  readonly #awaitingEcho: { queueId: string; text: string }[] = [];
  /**
   * Where this session's transcript is being read for messages the model
   * absorbs mid-turn, from the byte it had reached when the reader first sent
   * during the running turn. Null while no such message can be waiting.
   *
   * The CLI takes a send off its stdin at once and holds it in its own queue;
   * at the next tool boundary it folds it into the turn and says so only in
   * the transcript. So the transcript is read — only the appended bytes — each
   * time the main loop opens a new model call, which is after the fold was
   * written, and the frame goes out ahead of what the model says next.
   */
  #absorbing: Promise<{ path: string; checkpoint: Checkpoint } | null> | null =
    null;
  readonly #workdir: string;
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
     */
    sessiond?: { client: SessiondClient; procId: string }
  ) {
    this.instanceId = instanceId;
    this.#ctx = ctx;
    this.#workdir = workdir;
    // The model just pulled a held turn: retire the queue entry, and remember
    // the text so the frame that echoes it can be tagged with the same id.
    const input = new InputStream((queueId) => this.#dequeue(queueId));
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
                sessiondBridge(sessiond.client, sessiond.procId, spawnOptions),
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

  /**
   * The model pulled a held turn. Announced immediately rather than waiting for
   * the turn's own frame: the two can be seconds apart, and a row that is no
   * longer waiting should stop saying it is.
   */
  #dequeue(queueId: string): void {
    const at = this.#queued.findIndex((entry) => entry.queueId === queueId);
    if (at === -1) {
      return;
    }
    const [dequeued] = this.#queued.splice(at, 1);
    this.#awaitingEcho.push({ queueId, text: dequeued.text });
    // A turn nothing ever echoed would otherwise sit here for the session's
    // life. The tag is a nicety — `message_dequeued` already retired the row —
    // so the oldest unmatched entries are simply dropped.
    if (this.#awaitingEcho.length > AWAITING_ECHO_LIMIT) {
      this.#awaitingEcho.splice(
        0,
        this.#awaitingEcho.length - AWAITING_ECHO_LIMIT
      );
    }
    this.#ctx.frame(dequeuedFrame(queueId, this.sessionId));
  }

  /**
   * Tags a consumed turn's own frame with the queue entry it came from, so a
   * client retires the queued row even if the `message_dequeued` frame raced it
   * or never arrived. Matched on text, oldest first — the queue is a queue —
   * and only for the main loop's own plain turns: a subagent's frames and the
   * tool_result traffic are nobody's send.
   */
  #tagEcho(neutral: NeutralMessage): void {
    if (neutral.type !== "user" || this.#awaitingEcho.length === 0) {
      return;
    }
    if (neutral.parent_tool_use_id) {
      return;
    }
    const text = queuedText(neutral);
    if (!text) {
      return;
    }
    // `startsWith`, not equality: a turn that carried pasted text has it folded
    // in after the sentence (`withExtras`). An entry with no text of its own —
    // an images-only send — is never matched by prefix, which every string
    // would satisfy; its `message_dequeued` is what retires it.
    const at = this.#awaitingEcho.findIndex(
      (entry) => entry.text !== "" && text.startsWith(entry.text)
    );
    if (at === -1) {
      return;
    }
    const [matched] = this.#awaitingEcho.splice(at, 1);
    neutral.queueId = matched.queueId;
  }

  /**
   * The reader sent while a turn is running: mark where the transcript ends
   * now, so the fold that absorbs the message is the next thing read from it.
   */
  #watchAbsorption(): void {
    const { sessionId } = this;
    if (this.#absorbing || !sessionId) {
      return;
    }
    this.#absorbing = claudeSessionFile(sessionId, this.#workdir).then(
      async (path) => {
        if (!path) {
          return null;
        }
        const { size } = await stat(path);
        return { path, checkpoint: { size, offset: size, lines: 0 } };
      }
    );
  }

  /**
   * Frames every message the model has absorbed since the last read. At the
   * turn's `result` nothing more can be absorbed into it — a send still held
   * becomes the next turn — so the watch ends there.
   */
  async #emitAbsorbed(ending: boolean): Promise<void> {
    const watch = await this.#absorbing;
    if (ending) {
      this.#absorbing = null;
    }
    if (!watch) {
      return;
    }
    const read = await readTranscriptTail(watch.path, watch.checkpoint, {
      prefilter: ABSORBED_LINES,
    });
    watch.checkpoint = read.checkpoint;
    for (const located of read.records) {
      const absorbed = absorbedMessage(located.record as unknown as RawRecord);
      if (absorbed) {
        this.#ctx.frame(absorbedFrame(absorbed));
      }
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the session's whole live-frame pipeline — echo tagging, question dismissal, structured-result folding, busy/failed reporting — one pass per SDK message
  async #pumpMessages(
    ctx: HarnessContext,
    handle: Query,
    turn: Turn
  ): Promise<void> {
    try {
      for await (const message of handle) {
        // A message the reader sent mid-turn is read where the model read it:
        // before the answer that follows it, and before the turn closes.
        if (this.#absorbing && readsAbsorbed(message)) {
          await this.#emitAbsorbed(message.type === "result");
        }
        const neutral = toNeutral(message);
        // The turn this frame is, when it is one the session had to hold.
        this.#tagEcho(neutral);
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
        // Free account-wide limit data: Claude Code read these off its own
        // response headers, so they are fresher than anything the polled
        // `/api/oauth/usage` can return — and cost no request of our own. The
        // frame itself stays quiet in the transcript; only the reading is kept.
        if (message.type === "rate_limit_event") {
          observeRateLimit(message.rate_limit_info);
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
    message: NeutralUserMessage,
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">
  ): void {
    const sdk = message as unknown as SDKUserMessage;
    const queued = (message as { shouldQuery?: boolean }).shouldQuery === false;

    // The reader's words, into a running turn: the CLI may fold them in at its
    // next tool boundary, and only the transcript will say so.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Turn.busy is mutated by Turn.start()/.end() elsewhere; the checker doesn't see that cross-class mutation
    if (this.#turn.busy && !isInjected(message.origin)) {
      this.#watchAbsorption();
    }

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
      if (isInjected(message.origin)) {
        this.#ctx.frame(toNeutral(message as unknown as SDKMessage));
      }
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

    // Announced only if it actually waits, and only for what the reader typed.
    //
    // Two conditions, because either alone lies. A turn already in flight is
    // what makes a send wait — but the input stream is the only thing that
    // knows whether the model was in fact ready for it, and between `query()`
    // being constructed and its first pull nothing is waiting on the stream
    // while the session is plainly idle. So: the turn says it is busy AND the
    // push had to hold it. Anything whiffle INJECTS (a hand-off brief, a rule's
    // message) is already echoed as a real user frame at the bottom of this
    // method — announcing it here would draw the same message twice, once
    // waiting and once said.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Turn.busy is mutated by Turn.start()/.end() elsewhere; the checker doesn't see that cross-class mutation
    const holding = this.#turn.busy && !isInjected(message.origin);
    this.#turn.start();
    // biome-ignore lint/suspicious/noUnnecessaryConditions: holding is a real boolean at runtime; the checker mis-narrows it from the condition above
    const queueId = holding ? crypto.randomUUID() : undefined;
    const waiting = this.#input.push(
      withExtras(outgoing, extras.attachments, extras.images),
      queueId
    );
    if (waiting && queueId) {
      const entry: QueuedMessage = {
        queueId,
        text: queuedText(message),
        timestamp: new Date().toISOString(),
        ...(extras.images?.length ? { images: extras.images.length } : {}),
      };
      this.#queued.push(entry);
      this.#ctx.frame(queuedFrame(entry, this.sessionId));
    }

    // A hand-off is queued rather than asked (`shouldQuery: false`), so the SDK
    // appends it and emits nothing until the session next takes a turn. Echoed
    // as the frame the SDK will not send, so it appears the moment it lands.
    // The same is true of anything else whiffle injects — a rule's message has
    // no local copy in any dashboard, so without this echo it stays invisible
    // until the transcript is read back from disk.
    if (isInjected(message.origin)) {
      this.#ctx.frame(toNeutral(message as unknown as SDKMessage));
    }
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
    // Nothing left to hold these for: the stream is closed, so no queue entry
    // here will ever be pulled, and the hub drops the session's queue with the
    // row. Retired quietly rather than announced — the reader is watching a
    // session end, not a message being read.
    this.#queued.length = 0;
    this.#awaitingEcho.length = 0;
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

/** The three fields of a ring line that adoption reads; `undefined` when it is not JSON. */
const parseLine = (
  data: string
): { type?: unknown; subtype?: unknown; session_id?: unknown } | undefined => {
  try {
    return JSON.parse(data) as {
      type?: unknown;
      subtype?: unknown;
      session_id?: unknown;
    };
  } catch {
    return undefined;
  }
};

/**
 * A child whose last written line is this one is waiting for input: the CLI
 * writes nothing after a `result` until the next user message, and a child
 * that has been asked nothing yet writes its `init` and stops there.
 */
const isWaiting = (line: { type?: unknown; subtype?: unknown }): boolean =>
  line.type === "result" || (line.type === "system" && line.subtype === "init");

/**
 * The running answer to "is this child waiting?", one ring line at a time. An
 * idle child does not stay silent: the CLI keeps writing `system` notices
 * (`commands_changed` whenever a skills directory moves), `rate_limit_event`
 * and `control_response` lines after its `result`, so the LAST line almost
 * never says anything about the turn. Those carry the previous verdict
 * forward; every other line — a `result` or `init` (waiting), an
 * assistant/user/stream/control_request line (a turn in flight) — replaces
 * it. Non-JSON says nothing either.
 */
const idleVerdict = (
  line: { type?: unknown; subtype?: unknown } | undefined,
  previous: boolean | undefined
): boolean | undefined => {
  if (line === undefined) {
    return previous;
  }
  if (line.type === "control_response" || line.type === "rate_limit_event") {
    return previous;
  }
  if (line.type === "system" && line.subtype !== "init") {
    return previous;
  }
  return isWaiting(line);
};

/**
 * Where an adoption's peek starts: the oldest line sessiond still holds.
 *
 * It used to be a fixed 64 lines back from the caller's cursor, and that is
 * the whole of the bug this constant replaces. An idle child does not fall
 * silent after its `result` — it keeps writing `control_response`,
 * `rate_limit_event` and `system` notices, and {@link idleVerdict} carries the
 * previous verdict across those rather than replacing it. Once more than the
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
 *  - at the turn's next `result` line the child's stdin is EOF'd and the
 *    hand-off fires: the owner respawns through the full SDK with
 *    `resume: sessionId`. The in-flight turn completed and was captured; the
 *    cost is one respawn at a turn boundary. A child that was already between
 *    turns when adopted has no next `result` coming, so {@link ClaudeHarness.adopt}
 *    fires the same hand-off from the ring's last line instead.
 *
 * Custody is a degraded mode measured in seconds, not a second implementation
 * of the SDK. Everything it refuses, it refuses out loud.
 */
export class ClaudeCustody implements HarnessSession {
  readonly harness = "claude" as const;
  sessionId: string | null = null;
  /** requestId → the parked ask, until an answer or the hand-off clears it. */
  readonly #parked = new Set<string>();
  /** Turns pushed during custody; delivered by the respawned session. */
  readonly #held: {
    message: NeutralUserMessage;
    extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
  }[] = [];
  /** Controls deferred during custody; replayed by the respawned session. */
  readonly #heldControls: { method: string; args: unknown[] }[] = [];
  #handedOff = false;
  /** Settled by {@link exited} when sessiond reports the child gone. */
  readonly #exit = Promise.withResolvers<void>();
  readonly instanceId: string;
  readonly #ctx: HarnessContext;
  readonly #write: (data: string) => void;
  /** Ends the child's stdin — the graceful half of the boundary hand-off. */
  readonly #stdinEnd: () => void;
  /** Fired at the turn boundary; the owner respawns with `resume: sessionId`. */
  readonly #onHandoff: (handoff: {
    instanceId: string;
    sessionId: string | null;
    held: {
      message: NeutralUserMessage;
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
        message: NeutralUserMessage;
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
   * place for a hole to open.
   */
  ingest(line: string): void {
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
    this.#ctx.frame(toNeutral(sdk));
    if (sdk.type === "result") {
      this.#ctx.busy(false);
      // THE BOUNDARY. The turn that was in flight when the agent died has now
      // completed and been captured; this is the one moment at which handing
      // the session back to a full `Query` costs nothing but a respawn.
      this.handOff();
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
    message: NeutralUserMessage,
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

  /** stdin EOF + the hand-off, once. */
  handOff(): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #handedOff is set true elsewhere in this class once a hand-off fires; the checker doesn't see that cross-method mutation
    if (this.#handedOff) {
      return;
    }
    this.#handedOff = true;
    this.#stdinEnd();
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
    // A stop during custody is the operator ending the session, not a
    // hand-off: nothing is parked afterwards and nothing is respawned.
    for (const requestId of this.#parked) {
      this.#write(controlError(requestId, "whiffle: session stopped"));
    }
    this.#parked.clear();
    this.#held.length = 0;
    this.#heldControls.length = 0;
    this.#handedOff = true;
    this.#stdinEnd();
    // Returned only once the child is actually dead. The supervisor's relaunch
    // awaits this before spawning under the same procId, and sessiond's spawn
    // SIGKILLs a still-alive predecessor and broadcasts its exit to whoever is
    // subscribed under that id by then — which would be the new session.
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
      (alias.resolvedModel ?? alias.value).replace(/\[1m\]$/, "")
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
    return new ClaudeSession(
      ctx.instanceId,
      ctx,
      ctx.cwd,
      spec.options,
      spec.permissionMode,
      spec.model,
      spec.effort,
      spec.resume,
      spec.persistSession,
      spec.skills,
      spec.denyTools,
      fleetDenyList,
      { client, procId: ctx.instanceId }
    );
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
   * is run through {@link idleVerdict}. There is exactly one decision, taken
   * once, at the one moment the whole backlog has gone past: unless the ring
   * says a turn is in flight, the hand-off fires. Reading from the start is
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
          message: NeutralUserMessage;
          extras: Pick<SendPayload, "attachments" | "images" | "urgent">;
        }[];
        heldControls: { method: string; args: unknown[] }[];
      }) => void;
    }
  ): Promise<ClaudeCustody> {
    const client = await this.sessiond();
    const custody = new ClaudeCustody(
      instanceId,
      ctx,
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; sessiond write failures are not this session's to surface, best effort only
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — nothing here can act on a write failure to a gone child
      (data) => void client.write(instanceId, data).catch(() => {}),
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; sessiond stdin-end failures are not this session's to surface, best effort only
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — nothing here can act on a stdin-end failure to a gone child
      () => void client.stdinEnd(instanceId).catch(() => {}),
      options.onHandoff,
      options.sessionId ?? null,
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; sessiond signal failures are not this session's to surface, best effort only
      // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — nothing here can act on a signal failure to a gone child
      (sig) => void client.signal(instanceId, sig).catch(() => {})
    );
    // Everything at or below `boundary` the hub has already seen; everything
    // above it is the replay the caller asked for. A cursor past `head` names
    // lines the ring never assigned — sessiond's refusal covers that, and a
    // peek would only muddle whose refusal it was.
    const head = options.head ?? 0;
    // Raised to `head` if the replay is refused: what survives is then read
    // for the verdict and emitted to nobody (see the `reset` handler).
    let boundary = options.afterSeq ?? head;
    let peekSeq = head >= 1 && boundary <= head ? RING_START : undefined;
    let verdict: boolean | undefined;
    let seen = false;
    let reopened = false;
    const outstanding = new Map<string, string>();
    const repark = (): void => {
      // The hub has these lines, but its pending asks did not survive restart.
      // Only unresolved can_use_tool requests may replay without emitting frames.
      for (const line of outstanding.values()) {
        custody.ingest(line);
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
    // is then the same one `head` would have given: the verdict as it stands,
    // and a hand-off only if nothing in what was read says mid-turn.
    //
    // The two refusals above it are the two above: a `verdict` of false is a
    // turn still running, which custody is right to keep and which the child's
    // own `result` line hands back; a null session key is nothing to resume,
    // and respawning on it would orphan the conversation.
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
        if (peekSeq === undefined || custody.handedOff) {
          return;
        }
        repark();
        if (custody.sessionId === null || !(verdict ?? true)) {
          // Held on purpose, and said so: a custody nobody can explain looks
          // exactly like the bug this guard removes.
          ctx.frame({
            type: "system",
            subtype: "sessiond_custody_held",
            text: `whiffle: adopted this session but sessiond's replay stopped short of line ${head}; holding it ${custody.sessionId === null ? "because there is no session id to resume" : "because its last turn reads as still running"}`,
          } as unknown as NeutralMessage);
          return;
        }
        custody.handOff();
      }, QUIET_HANDBACK_MS);
    };
    const listener: Parameters<SessiondClient["subscribe"]>[1] = {
      line: (event) => {
        seen = true;
        waitForQuiet();
        // Every line up to `head` feeds the verdict, peeked or really
        // replayed: a replayed `result` hands off inside `ingest` anyway, but
        // a replayed `init` would not, and a fresh child the hub saw nothing
        // of is exactly that case.
        const parsed =
          peekSeq !== undefined && event.seq <= head
            ? parseLine(event.data)
            : undefined;
        if (parsed !== undefined) {
          verdict = idleVerdict(parsed, verdict);
        }
        if (peekSeq !== undefined && event.seq <= boundary) {
          // Peek-only: recover the session id and unanswered asks, never frames.
          if (parsed?.type === "control_request") {
            const request = parsed as Extract<
              CustodyLine,
              { type: "control_request" }
            >;
            if (request.request.subtype === "can_use_tool") {
              outstanding.set(request.request_id, event.data);
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
        } else {
          repark();
          stamp(event.seq);
          custody.ingest(event.data);
        }
        if (event.seq === head) {
          repark();
        }
        // There is no backlog-complete event; the ring's last line is it, and
        // it is the one place an adoption decides.
        //
        // A SILENT RING IS AN IDLE CHILD. `undefined` here does not mean the
        // evidence scrolled away — reading from {@link RING_START} is what
        // removes that reading — it means nothing in everything sessiond still
        // holds says anything about a turn. A child mid-turn cannot look like
        // that: it writes assistant and stream lines continuously, and those
        // replace the verdict rather than carry it. What CAN look like that is
        // a child that has taken no turn since its ring began and has only
        // written hook and notice lines since, which is exactly the session
        // this rule exists to hand back. Measured on a wedged one: six lines,
        // all `hook_started`/`hook_response`/`control_response`, no `init` and
        // no `result` — a strict `=== true` left it mute indefinitely.
        //
        // NOTHING TO RESUME OUTRANKS ALL OF IT. The hand-off respawns the child
        // with `--resume`, so without a session key it would start an empty one
        // and orphan the conversation the custody was protecting. Staying mute
        // is recoverable; that is not.
        if (
          peekSeq !== undefined &&
          head >= 1 &&
          event.seq === head &&
          custody.sessionId !== null &&
          (verdict ?? true)
        ) {
          stopWaiting();
          custody.handOff();
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
