/**
 * The Claude Code adapter.
 *
 * The original harness — everything cawco did before harnesses existed ran on
 * it, so this file is the quarry the other adapters are measured against. It
 * spawns `@anthropic-ai/claude-agent-sdk`'s `query()`, feeds it an
 * `AsyncIterable` prompt, parks `canUseTool` under the SDK's `requestId`, and
 * translates SDK messages into the neutral spine. The translation is a re-tag:
 * the neutral types mirror the SDK's field names, so a message crosses the wire
 * with its `raw` self attached and nothing lost.
 */

import { type Dirent, type FSWatcher, watch } from "node:fs";
import {
  access,
  appendFile,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  deleteSession,
  getSessionInfo,
  listSessions,
  type McpServerConfig,
  type McpServerStatus,
  type PermissionResult,
  type Query,
  query,
  renameSession,
  type SDKMessage,
  type SDKSessionInfo,
  type SDKUserMessage,
  type SessionStore,
  type SessionStoreEntry,
  tagSession,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AccountIdentity,
  AccountKind,
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
} from "@cawco/core";
import {
  ACCOUNT_READ,
  ASK_USER_QUESTION,
  BOUNDARY_RELAUNCH,
  CAWCO_ENV,
  CLAUDE_CONVERSATION_GONE,
  CONTROL_BEGIN_ACCOUNT_LOGIN,
  CONTROL_COMPLETE_ACCOUNT_LOGIN,
  CONTROL_FORGET_ACCOUNT,
  CONTROL_GET_TODOS,
  CONTROL_JOIN_ACCOUNT_LOGIN,
  CONTROL_MOVE_HOME_LOGIN,
  CONTROL_PROBE_ACCOUNT,
  CONTROL_READ_HOME_LOGIN,
  CONTROL_READ_SESSION_CONTEXT,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_WITHDRAW_SEND,
  EFFORT_READ,
  INSPECT_CONFIG,
  INSTALL_SESSION_CREDENTIAL,
  identityOf,
  MARKETPLACE_CATALOG,
  MESSAGES_HELD,
  MESSAGES_READ,
  RATE_LIMIT_READ,
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  resumeCursor,
  settledQuestionResult,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import { LineSplitter } from "@cawco/core/lines";
import {
  accountConfigDir,
  accountIds,
  claudeConfigDirs,
  claudeHome,
  projectSlug,
  sessionConfigDir,
} from "@cawco/core/paths";
import { sessiondEndpoint } from "@cawco/core/sessiond";
import {
  accountEnv,
  accountReports,
  changingSignins,
  claudeAuth,
  linkProjectMemory,
  probeAccount,
  projectMemoryRoot,
} from "../accounts";
import {
  claudeExecutableOptions,
  resolveClaudeExecutable,
  unlockKeychain,
} from "../auth";
import {
  claudeBoundaryOptions,
  hookMissing,
  type LaunchedHook,
  launchedHook,
  workspaceHook,
} from "../boundary";
import { carrySessions, readTaskList, transcriptIn } from "../claude-sessions";
import {
  callDelegationTool,
  delegationMcp,
  MCP_SERVER_NAME,
} from "../delegation";
import { sessionFleetDenials } from "../denied-tools";
import {
  fleetHoldings,
  fleetStatus,
  inspectConfig,
  marketplaceCatalog,
  readHookScript,
  readMemoryFile,
  readSkillFiles,
  syncFleetConfig,
} from "../fleet";
import {
  type Harness,
  type HarnessContext,
  type HarnessSession,
  HeldProcessRefused,
  type TurnExtras,
} from "../harness";
import {
  beginAccountLogin,
  completeAccountLogin,
  forgetAccount,
} from "../login";
import {
  homeLoginMovedInto,
  joinAccountLogin,
  moveHomeLogin,
  readHomeLogin,
} from "../move-login";
import { parseProcId, procIdFor } from "../proc-id";
// Type-only, and deliberately so: `session.ts` imports the harness registry
// this file is part of, so a value import here would close a module cycle.
import type { SessiondAwareContext } from "../session";
import { acknowledgeSessionCredential } from "../session-identity";
import {
  type BridgeRing,
  endProc,
  ensureSessiond,
  procEpoch,
  SessiondClient,
  type SessiondWelcomeInfo,
  sessiondBridge,
} from "../sessiond-client";
import { ChildActivity, type RingLine, readRing } from "../sessiond-custody";
import {
  hookFailureId,
  readSessionContext,
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

/** A hook failure as the CLI stores it in a transcript, read by shape. */
interface StoredHookFailure {
  command?: string;
  hookEvent?: string;
  stderr?: string;
  type?: string;
}

/** A hook's frame (`hook_started`, `hook_response`, sdk.d.ts), read by shape. */
interface HookFrame {
  exit_code?: number;
  hook_event?: string;
  hook_name?: string;
  outcome?: string;
  output?: string;
  session_id?: string;
  stderr?: string;
  stdout?: string;
  subtype?: string;
  type: string;
}

/**
 * The neutral frame is the SDK frame re-tagged: same fields, plus the
 * original. A command's lifecycle is the one exception: `queued` becomes the
 * {@link MESSAGES_HELD} frame (the CLI has the send, in a queue no transcript
 * shows yet), `started` the {@link MESSAGES_READ} frame, and its other states
 * say nothing the hub needs, so they are `null` — no frame at all. Measured
 * on CLI 2.1.280: an interrupt cancels only the command it is running; the
 * commands still queued behind it are then `started` together as the next
 * turn, stored as one record under the last one's uuid, and one folded in
 * before the interrupt was `started` (read) already, so its later
 * `cancelled` changes nothing.
 */
export const toNeutral = (
  sdk: SDKMessage,
  recovered = false
): NeutralMessage | null => {
  if ((sdk as { type: string }).type === "command_lifecycle") {
    const command = sdk as unknown as CommandLifecycle;
    const session = command.session_id
      ? { session_id: command.session_id }
      : {};
    switch (command.state) {
      case "queued":
        return {
          type: "system",
          subtype: MESSAGES_HELD,
          held: [command.command_uuid],
          ...session,
        };
      case "started":
        return {
          type: "system",
          subtype: MESSAGES_READ,
          read: [command.command_uuid],
          ...session,
        };
      default:
        return null;
    }
  }
  if (sdk.type === "result") {
    // The SDK's own usage carries cache_creation/cache_read counts; re-tag them
    // under the harness-neutral `cache` shape the opencode adapter's result
    // frame also populates.
    const { usage } = sdk as {
      usage?: {
        cache_creation_input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation?: {
          ephemeral_5m_input_tokens?: number;
          ephemeral_1h_input_tokens?: number;
        };
      };
    };
    return {
      ...sdk,
      raw: sdk,
      ...(recovered
        ? { recovered: true }
        : {
            timestamp:
              (sdk as { timestamp?: string }).timestamp ??
              new Date().toISOString(),
          }),
      ...(usage
        ? {
            cache: {
              read: usage.cache_read_input_tokens ?? 0,
              write: usage.cache_creation_input_tokens ?? 0,
              write5m: usage.cache_creation?.ephemeral_5m_input_tokens ?? 0,
              write1h: usage.cache_creation?.ephemeral_1h_input_tokens ?? 0,
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

/**
 * The session file the CLI stores a session under, by its id alone, or null
 * when it is not found: the lookup for a caller with no row to name its dir,
 * so every config dir on the machine is searched.
 */
async function claudeSessionFile(
  sessionId: string,
  dir?: string
): Promise<string | null> {
  const projects = claudeConfigDirs().map((config) => join(config, "projects"));
  const fileName = `${sessionId}.jsonl`;
  // The CLI names the project dir from the session's cwd: realpath, then
  // `projectSlug`. Try that first — it is the exact file `getSessionMessages`
  // reads — and only scan when the cwd is gone or the slug no longer resolves
  // (a cwd that has since moved).
  let slug: string | null = null;
  if (dir) {
    try {
      slug = projectSlug(await realpath(dir));
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

/**
 * The account whose dir a Claude launch runs in, or undefined for the
 * machine's own login: the session's account ({@link SpawnPayload.accountDir}),
 * always, and never `~/.claude`, except while the hub says the machine's own
 * login is moving into an account and has not yet ({@link
 * SpawnPayload.homeLoginMove}). Then it runs where that credential is once any
 * move running now is over: the account's dir when this agent moved it
 * there, else `~/.claude`.
 */
async function launchAccountOf(
  spec: SpawnPayload
): Promise<string | undefined> {
  if (spec.accountDir) {
    return spec.accountDir.accountId;
  }
  const move = spec.homeLoginMove;
  if (!move) {
    throw new Error(
      "This Claude session has no account to run on. Add one in Configure → Accounts and sign it in on this machine."
    );
  }
  return (await homeLoginMovedInto(move.accountId))
    ? move.accountId
    : undefined;
}

/** The entries in `text` that are whole lines: a live session may be mid-write. */
const wholeLines = (text: string): SessionStoreEntry[] =>
  text
    .slice(0, text.lastIndexOf("\n") + 1)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SessionStoreEntry);

const wholeTranscript = async (file: string): Promise<SessionStoreEntry[]> =>
  wholeLines(await readFile(file, "utf8"));

/** How much of each end of a transcript a listing reads, as the SDK's own listing does. */
const LISTING_END_BYTES = 65_536;

/**
 * A transcript's first and last 64 KiB, for a listing: the SDK lists its own
 * config dir from the same two ends (the first prompt, cwd and start time at
 * the head; the title, tag and summary at the tail) and never reads the
 * middle, so an account's sessions cost the same to list as the rest.
 */
const transcriptEnds = async (file: string): Promise<SessionStoreEntry[]> => {
  const handle = await open(file, "r");
  try {
    const { size } = await handle.stat();
    if (size <= LISTING_END_BYTES * 2) {
      return wholeLines(await handle.readFile("utf8"));
    }
    const head = Buffer.alloc(LISTING_END_BYTES);
    const tail = Buffer.alloc(LISTING_END_BYTES);
    await handle.read(head, 0, LISTING_END_BYTES, 0);
    await handle.read(tail, 0, LISTING_END_BYTES, size - LISTING_END_BYTES);
    const tailText = tail.toString("utf8");
    // The tail starts mid-line: its first whole line follows the first break.
    return [
      ...wholeLines(head.toString("utf8")),
      ...wholeLines(tailText.slice(tailText.indexOf("\n") + 1)),
    ];
  } finally {
    await handle.close();
  }
};

/**
 * The SDK's own session readers and writers (getSessionInfo, listSessions,
 * tagSession, renameSession, deleteSession) look only in the config dir the
 * agent started with: it reads CLAUDE_CONFIG_DIR once and keeps it. A session
 * that runs on an account keeps its transcript under that account's dir, so
 * each of those calls is handed this store over the one file the session has,
 * wherever {@link claudeSessionFile} found it. `read` gives the entries the
 * SDK folds: the whole transcript, or for a listing only its two ends.
 */
const transcriptStore = (
  file: string,
  read: (file: string) => Promise<SessionStoreEntry[]> = wholeTranscript
): SessionStore => ({
  load: (key) => (key.subpath ? Promise.resolve(null) : read(file)),
  async append(key, entries) {
    if (key.subpath) {
      throw new Error(`cawco writes no subagent transcript (${key.subpath})`);
    }
    await appendFile(
      file,
      entries.map((entry) => `${JSON.stringify(entry)}\n`).join("")
    );
  },
  async delete(key) {
    if (key.subpath) {
      return;
    }
    await rm(join(dirname(file), key.sessionId), {
      recursive: true,
      force: true,
    });
    await rm(file);
  },
});

/** The folders directly inside `dir`; none when it does not exist. */
const subdirectories = async (dir: string): Promise<string[]> => {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch (error) {
    if (missing(error)) {
      return [];
    }
    throw error;
  }
};

/** The transcripts directly inside a project folder; none when it does not exist. */
const jsonlNames = async (dir: string): Promise<string[]> => {
  try {
    return (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .map((entry) => entry.name);
  } catch (error) {
    if (missing(error)) {
      return [];
    }
    throw error;
  }
};

/** A session's info, read from its transcript wherever it is stored. */
const sessionInfoAt = (
  file: string,
  sessionId: string
): Promise<SDKSessionInfo | undefined> =>
  getSessionInfo(sessionId, { sessionStore: transcriptStore(file) });

/** The session's transcript file, or an error naming the session when none exists. */
const requireSessionFile = async (
  sessionId: string,
  dir?: string
): Promise<string> => {
  const file = await claudeSessionFile(sessionId, dir);
  if (!file) {
    throw new Error(`Session ${sessionId} has no transcript on this machine`);
  }
  return file;
};

/** Whether `error` is the file system saying there is nothing at the path. */
const missing = (error: unknown): boolean =>
  (error as { code?: string } | null)?.code === "ENOENT";

export const CLAUDE_CAPABILITIES: HarnessCapabilities = {
  interrupt: true,
  permissionModes: [
    "default",
    "acceptEdits",
    "plan",
    "bypassPermissions",
    "fullSend",
  ],
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
  attachments: TurnExtras["attachments"],
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

  withdraw(uuid: string): boolean {
    const at = this.#queue.findIndex((message) => message.uuid === uuid);
    if (at < 0) {
      return false;
    }
    this.#queue.splice(at, 1);
    return true;
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
  running = false;
  #ended = Promise.withResolvers<void>();

  start(): void {
    this.busy = true;
  }

  end(): void {
    this.busy = false;
    this.running = false;
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

/** How long the CLI waits on the `Stop` hook this adapter registers, in seconds. */
const STOP_HOOK_TIMEOUT_S = 5;

/**
 * How many wake-ups a `Stop` hook's input says the session has scheduled
 * (`session_crons`: "Session-scoped cron tasks (CronCreate, ScheduleWakeup,
 * /loop) that will wake this session later. Empty array when none are
 * scheduled", sdk.d.ts). `undefined` when the input is not a `Stop` hook's or
 * carries no list.
 */
const scheduledWakeups = (input: unknown): number | undefined => {
  const { hook_event_name, session_crons } = (input ?? {}) as {
    hook_event_name?: unknown;
    session_crons?: unknown;
  };
  return hook_event_name === "Stop" && Array.isArray(session_crons)
    ? session_crons.length
    : undefined;
};

/**
 * The CLI child's environment: the agent's own, the spec's over it, and the
 * session's model as `CAWCO_MODEL`.
 *
 * Claude in Chrome follows the session's mode, like every other tool. The
 * CLI's server-side gate `tengu_cowork_chrome_automode_default` (the
 * "classifier floor") otherwise holds the claude-in-chrome server at
 * `default` even under bypassPermissions — effectiveModeForTool reads
 * `if(i&&(…||$c(e?.mcpInfo)&&n.chromeClassifierFloorEnabled===!0))return
 * n.canAutoClassifierRun===!0?"auto":"default"` — so every call parks in
 * `canUseTool` and asks the owner. The floor also makes allow rules for these
 * tools inert, so `allowedTools` cannot answer it. `CLAUDE_CHROME_CLASSIFIER_FLOOR`
 * is the CLI's own override of that gate (`a.CLAUDE_CHROME_CLASSIFIER_FLOOR??
 * x("tengu_cowork_chrome_automode_default",!1)`). In the non-bypass modes cawco
 * offers, the tool itself still asks for each call. A spec's own env still wins.
 */
const sessionEnv = (
  specEnv: Record<string, string | undefined> | undefined,
  model: string | undefined,
  ctx: HarnessContext
): Record<string, string | undefined> => ({
  ...process.env,
  CLAUDE_CHROME_CLASSIFIER_FLOOR: "0",
  ...specEnv,
  ...(model && { CAWCO_MODEL: model }),
  // The session's shell acts as this session and no other: `cawco tool`
  // there sends the credential its CawCo MCP sends.
  [CAWCO_ENV.instanceId]: ctx.instanceId,
  ...(ctx.sessionCredential
    ? { [CAWCO_ENV.sessionCredential]: ctx.sessionCredential }
    : {}),
});

/** Tools that put a question to the person: never answered for them, in any mode. */
const INTERACTIVE_TOOLS: ReadonlySet<string> = new Set([
  ASK_USER_QUESTION,
  "ExitPlanMode",
]);

/** The `canUseTool` callback, parked until `resolvePermission` answers it. */
type PermissionResolver = (result: PermissionResult) => void;

/** CawCo's `fullSend` is the CLI's `bypassPermissions`: the SDK never sees CawCo's own mode. */
const sdkMode = (
  mode: import("@cawco/core").PermissionMode
): import("@anthropic-ai/claude-agent-sdk").PermissionMode =>
  mode === "fullSend" ? "bypassPermissions" : mode;

/** A permission answer in the SDK's words: any `setMode` it carries names the CLI's mode. */
const sdkPermissionResult = (
  result: import("@cawco/core").PermissionResult
): PermissionResult =>
  (result.behavior === "allow" && result.updatedPermissions
    ? {
        ...result,
        updatedPermissions: result.updatedPermissions.map((update) =>
          update.type === "setMode"
            ? { ...update, mode: sdkMode(update.mode) }
            : update
        ),
      }
    : result) as PermissionResult;

/**
 * A session's permission mode, in CawCo's words and the CLI's. Bypass is the
 * CLI's own: the safety checks it still raises there (a shell -c script it
 * cannot parse, a cd with git, protected paths) go to the owner like any ask.
 * Full Send is CawCo's: the CLI in bypass, and this host answering those asks
 * too, as the SDK documents a host may. It holds only while the CLI says it is
 * in bypass: the CLI reporting any other mode (plan mode entered or left, a
 * `setMode` an "Always allow" carried) ends it, and only the owner choosing it
 * again brings it back.
 */
class SessionMode {
  /** The CLI's mode: what CawCo last set, then what the CLI last said. */
  #cli: import("@anthropic-ai/claude-agent-sdk").PermissionMode | undefined;
  #fullSend: boolean;

  constructor(mode: import("@cawco/core").PermissionMode | undefined) {
    this.#fullSend = mode === "fullSend";
    this.#cli = mode && sdkMode(mode);
  }

  /** The mode the CLI is in, as far as this session knows: what a spawn launches it in. */
  get cli():
    | import("@anthropic-ai/claude-agent-sdk").PermissionMode
    | undefined {
    return this.#cli;
  }

  /** CawCo sets the mode: a mode control's, or an answer's `setMode`. */
  choose(mode: import("@cawco/core").PermissionMode): void {
    this.#fullSend = mode === "fullSend";
    this.#cli = sdkMode(mode);
  }

  /** The CLI says its mode (`init`, `status`). */
  observe(mode: import("@anthropic-ai/claude-agent-sdk").PermissionMode): void {
    this.#cli = mode;
    if (mode !== "bypassPermissions") {
      this.#fullSend = false;
    }
  }

  /** The mode said outward: Full Send while it holds, else the CLI's own. */
  get reported(): import("@cawco/core").PermissionMode | undefined {
    return this.#fullSend ? "fullSend" : this.#cli;
  }

  /**
   * Whether an ask is answered here rather than put to the owner: Full Send,
   * with the CLI in bypass, and never a question to him, a plan approval, or
   * an ask his own `permissions.ask` rule forced.
   */
  answersHostSide(toolName: string, matchedAskRule: unknown): boolean {
    return (
      this.#fullSend &&
      this.#cli === "bypassPermissions" &&
      !(matchedAskRule || INTERACTIVE_TOOLS.has(toolName))
    );
  }
}

/**
 * Why the CLI asked, as the log says it: a session in bypass is never meant
 * to be asked, so the reason is the evidence. One Full Send answered says so.
 */
const askLine = (
  toolName: string,
  {
    decisionReason,
    blockedPath,
    matchedAskRule,
  }: {
    decisionReason?: string;
    blockedPath?: string;
    matchedAskRule?: unknown;
  },
  answered: boolean
): string =>
  `[claude] permission asked: ${toolName}${decisionReason ? ` — ${decisionReason}` : ""}${blockedPath ? ` (path ${blockedPath})` : ""}${matchedAskRule ? " [ask rule]" : ""}${answered ? " [full send: answered]" : ""}`;

/** Whether an SDK frame is the main loop's word on its mode: an `init`, or a `status` that names one. */
const modeFrame = (
  message: SDKMessage
): message is Extract<SDKMessage, { subtype: "init" | "status" }> =>
  message.type === "system" &&
  (message.subtype === "init" || message.subtype === "status") &&
  !(message as { parent_tool_use_id?: string | null }).parent_tool_use_id;

class ClaudeSession implements HarnessSession {
  readonly harness = "claude" as const;
  sessionId: string | null = null;
  readonly #handle: Query;
  /** The supplied header is ACKable only when this handle launched the child. */
  readonly #launchCredential: string | undefined;
  readonly #input: InputStream;
  readonly #delivery = new Map<
    string,
    ReturnType<typeof Promise.withResolvers<void>>
  >();
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
   * Session-start hooks that failed, held until the first prompt of this run
   * is taken up ({@link #hookFailure}).
   */
  readonly #hookFailures: NeutralMessage[] = [];
  /** The workspace boundary hook the CLI runs before each shell tool call; none for an unbounded session. */
  #boundaryHook: LaunchedHook | undefined;
  /** Why the running turn was stopped: its boundary hook failed ({@link #watchBoundary}). */
  #boundaryFailure: string | undefined;
  /** Set once the session was stopped because its boundary hook can no longer run ({@link #hookGone}). */
  #hookRefusal: HeldProcessRefused | undefined;
  /** The transcript tail of a CLI that does not report its hooks in its stream ({@link #watchTranscript}). */
  #transcriptWatch: FSWatcher | undefined;
  /** The child's sessiond. */
  readonly #sessiond:
    | { client: SessiondClient; procId: string; attach?: BridgeRing["attach"] }
    | undefined;
  /** The ring seq of each line the SDK was handed that carries a uuid. */
  readonly #seqs = new Map<string, number>();
  /**
   * The background work the CLI is running in this process, by task id:
   * shells, subagents, monitors, workflows. The CLI says the whole set each
   * time it changes (`background_tasks_changed`) and to a host that attaches
   * to it, and nothing at start, when there is none.
   */
  #background = new Set<string>();
  /**
   * How many wake-ups the session has scheduled for itself (a cron, a loop's
   * next tick), as the CLI listed them when its last turn ended: its `Stop`
   * hook carries them (`session_crons`). Their timers live in the CLI
   * process. None for a child this host started; `undefined` for one it
   * attached to whose ring no longer holds a turn's end
   * ({@link adoptWakeups}): not known until its next turn ends.
   */
  #crons: number | undefined = 0;
  /** Whether the CLI writes this conversation down (`persistSession`). */
  readonly #stored: boolean;
  readonly instanceId: string;
  #lastRequestAt: number | undefined;
  /** The permission mode: the one it started (or was adopted) with, each `setPermissionMode`, and the CLI's own word. */
  readonly #mode: SessionMode;

  constructor(
    instanceId: string,
    ctx: HarnessContext,
    workdir: string,
    options: unknown,
    permissionMode: import("@cawco/core").PermissionMode | undefined,
    model: string | undefined,
    effort: EffortLevel | undefined,
    resume: SpawnPayload["resume"],
    persistSession: boolean | undefined,
    skills?: string[],
    denyTools?: string[],
    /** What the fleet denies this session, resolved once by `spawn()` via {@link sessionFleetDenials}. */
    fleetDenyList: readonly string[] = [],
    /**
     * The sessiond connection this session's CLI child lives under. Not
     * optional in practice — `spawn()` always supplies it, and there is no
     * in-process fallback (PLAN.md C7: full cutover, rollback is a revert).
     *
     * `attach` names a child that already exists — one that outlived the
     * agent which started it — and the `Query` attaches to that process
     * instead of spawning one (see {@link sessiondBridge}).
     */
    sessiond?: {
      client: SessiondClient;
      procId: string;
      attach?: BridgeRing["attach"];
    }
  ) {
    this.instanceId = instanceId;
    this.#ctx = ctx;
    // Before the `Query` below exists: an attach replays the asks the previous
    // host left open as soon as it does, and they are decided in this mode.
    this.#mode = new SessionMode(permissionMode);
    const cliMode = this.#mode.cli;
    this.#launchCredential = ctx.sessionCredential;
    this.#boundaryHook = workspaceHook(ctx.boundary);
    const mcpServers: Record<string, McpServerConfig> = {
      ...((
        options as { mcpServers?: Record<string, McpServerConfig> } | undefined
      )?.mcpServers ?? {}),
      [MCP_SERVER_NAME]: delegationMcp(instanceId, ctx.sessionCredential),
    };
    this.#sessiond = sessiond;
    this.#stored = persistSession !== false;
    const seqs = this.#seqs;
    const input = new InputStream();
    this.#input = input;
    const turn = new Turn();
    this.#turn = turn;

    // Claude in Chrome is on by default for every cawco session.
    //
    // The CLI resolves it in `shouldEnableClaudeInChrome`, in this order:
    // OAuth scope -> `--chrome`/`--no-chrome` -> `CLAUDE_CODE_ENABLE_CFC` ->
    // `if (!isInteractive()) return false` -> `~/.claude.json`'s
    // `claudeInChromeDefaultEnabled`. Every cawco session is non-interactive
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
        ...claudeExecutableOptions(),
        extraArgs,
        mcpServers,
        // What the CLI holds for later, said at each turn's end: the SDK's
        // `Stop` hook input lists the wake-ups the session has scheduled
        // ("Lets hooks distinguish 'session is done' from 'session is paused
        // waiting for background work to wake it'", sdk.d.ts). The CLI waits
        // for the answer before it ends the turn, so the wait is bounded: a
        // turn that ends while no agent is attached ends five seconds late,
        // and the agent that attaches reads the list off the ring.
        hooks: {
          Stop: [
            {
              timeout: STOP_HOOK_TIMEOUT_S,
              hooks: [
                // biome-ignore lint/suspicious/useAwait: the SDK's HookCallback returns a promise
                async (stopping: unknown) => {
                  this.#crons = scheduledWakeups(stopping) ?? this.#crons;
                  return {};
                },
              ],
            },
          ],
        },
        // Fleet baseline (from supervisor_config.denied_tools, cached in the
        // sidecar) + delegate-type denials + any the caller itself carried.
        // All three layers union: every layer can only add, never remove
        // another layer's entries. Resolved once through `sessionFleetDenials()`
        // so this path and `convergeDeniedTools` read the same value; it adds
        // the to-do and plan-mode set when "CawCo's to-dos" is on for it.
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
        ...(cliMode ? { permissionMode: cliMode } : {}),
        ...(model && { model }),
        env: sessionEnv(
          (options as { env?: Record<string, string | undefined> } | undefined)
            ?.env,
          model,
          ctx
        ),
        // Left out entirely when nobody chose: the SDK's own default is the
        // model's, and writing a level here would put cawco's guess in its
        // place on every model whose scale we cannot see.
        ...(effort && { effort }),
        // Enables switching into bypass through the mode picker; does not select it.
        allowDangerouslySkipPermissions: true,
        ...(cliMode === "bypassPermissions" && {
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
        // A work item's session runs every shell command inside its
        // workspace's boundary: a hook the CLI itself runs rewrites each one.
        ...claudeBoundaryOptions(ctx.boundary),
        // THE SEAM (design §4.1). The SDK builds the CLI's command line and
        // hands it here instead of spawning it; we forward it to sessiond and
        // hand back a `SpawnedProcess` over the socket. Nothing downstream —
        // `canUseTool` parking, `InputStream`, the queue frames, the cawco
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
                  { seqs, attach: sessiond.attach },
                  (refusal) => ctx.keeperRefused(refusal)
                ),
            }
          : {}),
        canUseTool: (
          toolName,
          toolInput,
          {
            requestId,
            suggestions,
            toolUseID,
            signal,
            decisionReason,
            blockedPath,
            matchedAskRule,
          }
        ) =>
          new Promise<PermissionResult>((resolve) => {
            // Full Send answers here what the CLI still asks in bypass ({@link SessionMode}); plain bypass does not.
            const answered = this.#mode.answersHostSide(
              toolName,
              matchedAskRule
            );
            console.log(
              askLine(
                toolName,
                { decisionReason, blockedPath, matchedAskRule },
                answered
              )
            );
            if (answered) {
              resolve({
                behavior: "allow",
                updatedInput: toolInput,
              });
              return;
            }
            this.#permissions.set(requestId, resolve);
            // The CLI withdrew the ask (an interrupt mid-ask): nobody can
            // answer it any more, and the hub hears it was withdrawn.
            signal.addEventListener(
              "abort",
              () => {
                if (this.#permissions.delete(requestId)) {
                  this.#openQuestions.delete(requestId);
                  ctx.permissionResolved?.(requestId, "cancelled");
                }
              },
              { once: true }
            );
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
              toolUseId: toolUseID,
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
    // biome-ignore lint/complexity/noVoid: the reading is said as a frame when it lands; nothing waits for it
    void this.#readEffort();
    // biome-ignore lint/complexity/noVoid: the reading is said as a frame when it lands; nothing waits for it
    void this.#readAccount();
  }

  /**
   * Says what the session's Claude Code answered at initialize
   * ({@link ACCOUNT_READ}): who its account is, its plan, and the models it
   * offers. The hub keeps it as the account's catalog, so a picker has it
   * with nothing running.
   */
  async #readAccount(): Promise<void> {
    try {
      const init = await this.#handle.initializationResult();
      const identity = identityOf(init.account);
      this.#ctx.frame({
        type: "system",
        subtype: ACCOUNT_READ,
        account: {
          models: init.models as ModelInfo[],
          ...(identity ? { identity } : {}),
          ...(init.account.subscriptionType
            ? { subscriptionType: init.account.subscriptionType }
            : {}),
        },
      });
    } catch (error) {
      console.warn(
        `[claude] ${this.instanceId}: initialize read failed: ${String(error)}`
      );
    }
  }

  /**
   * Says the effort the session will send on its next request
   * ({@link EFFORT_READ}), read back from the CLI rather than remembered from
   * a spawn: `get_settings` reports it as `applied.effort`, after env
   * overrides, session state, org caps and model-support downgrades, and null
   * when no effort parameter is sent (measured, SDK 0.3.284: a default Opus
   * 5.5 reads `medium`, Haiku 4.5 `null`; answered before the first turn).
   * `getSettings` is on the `Query` at runtime but missing from its type.
   * A CLI that does not report the field says nothing, so the session reads
   * as not yet known rather than as sending none.
   */
  async #readEffort(): Promise<void> {
    try {
      const settings = await (
        this.#handle as unknown as {
          getSettings: () => Promise<{
            applied?: { effort?: EffortLevel | null };
          }>;
        }
      ).getSettings();
      const effort = settings.applied?.effort;
      if (effort === undefined) {
        console.warn(
          `[claude] ${this.instanceId}: get_settings reported no applied.effort`
        );
        return;
      }
      this.#ctx.frame({ type: "system", subtype: EFFORT_READ, effort });
    } catch (error) {
      console.warn(
        `[claude] ${this.instanceId}: effort read failed: ${String(error)}`
      );
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the session's whole live-frame pipeline — question dismissal, structured-result folding, busy/failed reporting — one pass per SDK message
  async #pumpMessages(
    ctx: HarnessContext,
    handle: Query,
    turn: Turn
  ): Promise<void> {
    try {
      for await (const message of handle) {
        if (
          message.type === "system" &&
          message.subtype === "status" &&
          message.status === "requesting" &&
          !(message as { parent_tool_use_id?: string | null })
            .parent_tool_use_id
        ) {
          this.#lastRequestAt = Date.now();
        }
        if ((message as { type: string }).type === "command_lifecycle") {
          const lifecycle = message as unknown as CommandLifecycle;
          const uuid = lifecycle.command_uuid;
          if (lifecycle.state === "started") {
            turn.running = true;
          }
          this.#delivery.get(uuid)?.resolve();
          this.#delivery.delete(uuid);
        }
        // A turn the CLI starts on its own — a background task's notification,
        // a message it held from the last turn — is a turn all the same: the
        // frames are the evidence, and a send into it waits like any other.
        if (runsTurn(message)) {
          turn.running = true;
          // biome-ignore lint/suspicious/noUnnecessaryConditions: Turn.busy is mutated by Turn.start()/.end() elsewhere; the checker doesn't see that cross-class mutation
          if (!turn.busy) {
            // One the CLI opened itself (a wake-up, a background task's
            // notice) is checked as it starts; a send was checked before it
            // went ({@link send}).
            this.#hookGone();
            turn.start();
            ctx.busy(true);
          }
        }
        // The account's limits as Claude Code read them off its own response
        // headers, the only source CawCo has: passed to the hub as the
        // session's account's reading, and never a transcript frame.
        if (message.type === "rate_limit_event") {
          ctx.frame({
            type: "system",
            subtype: RATE_LIMIT_READ,
            rate_limit_info: message.rate_limit_info,
          });
          continue;
        }
        if (this.#hookFailure(message)) {
          continue;
        }
        // The CLI's whole list each time, so it replaces what was held.
        // Ambient entries are its own watchers, which run for as long as the
        // process does ("hosts should exclude them from activity
        // indicators", sdk.d.ts).
        if (
          message.type === "system" &&
          message.subtype === "background_tasks_changed"
        ) {
          this.#background = new Set(
            message.tasks
              .filter((task) => !task.ambient)
              .map((task) => task.task_id)
          );
        }
        const seq =
          message.type === "result" && message.uuid
            ? this.#seqs.get(message.uuid)
            : undefined;
        const recovered =
          seq !== undefined &&
          !!this.#sessiond?.attach &&
          seq <= this.#sessiond.attach.head;
        const neutral = toNeutral(message, recovered);
        if (!neutral) {
          continue;
        }
        // The session-start hooks that failed go out as this run's first
        // prompt is taken up: where the CLI stores them, ahead of that
        // prompt's record, and keyed by it as a history read keys them.
        if (
          neutral.type === "system" &&
          neutral.subtype === MESSAGES_READ &&
          this.#hookFailures.length > 0
        ) {
          const [prompt] = neutral.read ?? [];
          for (const [index, failure] of this.#hookFailures
            .splice(0)
            .entries()) {
            ctx.frame({ ...failure, uuid: hookFailureId(prompt, index) });
          }
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
        // The CLI's own word on its mode, which it changes itself too (plan
        // mode, an "Always allow" that carried a `setMode`). What goes out is
        // CawCo's: `fullSend` while Full Send holds, which is what the hub
        // records and the next spawn or adoption of this session restores.
        if (modeFrame(message) && message.permissionMode !== undefined) {
          this.#mode.observe(message.permissionMode);
          (neutral as { permissionMode?: string }).permissionMode =
            this.#mode.reported;
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
          if (neutral.type === "result" && this.#lastRequestAt !== undefined) {
            neutral.lastRequestAt = this.#lastRequestAt;
          }
          // The turn its boundary hook failed in ends failed, in the hook's
          // words: the hub fails the work item on it and tells the parent.
          if (
            neutral.type === "result" &&
            this.#boundaryFailure !== undefined
          ) {
            neutral.is_error = true;
            neutral.errors = [this.#boundaryFailure];
            this.#boundaryFailure = undefined;
          }
          this.#lastRequestAt = undefined;
          turn.end();
          ctx.busy(false);
          // Cheap, and what catches a `/effort` or `/model` run in the turn.
          // biome-ignore lint/complexity/noVoid: the reading is said as a frame when it lands
          void this.#readEffort();
        }
        this.#stamp(message);
        ctx.frame(neutral);
        // A turn of a CLI whose boundary hook fails open has ended: its
        // boundary is where the hub relaunches it onto the hook that refuses.
        if (message.type === "result") {
          this.askRelaunch();
        }
      }
    } catch (error) {
      ctx.busy(false);
      ctx.failed(
        String(error).includes("No conversation found with session ID:")
          ? new Error(CLAUDE_CONVERSATION_GONE)
          : error
      );
    } finally {
      this.#transcriptWatch?.close();
      for (const delivery of this.#delivery.values()) {
        delivery.resolve();
      }
      this.#delivery.clear();
      ctx.closed?.();
    }
  }

  /**
   * Whether `message` is a hook's frame, which a transcript does not draw: a
   * hook's output is startup noise the CLI never stores. A hook that failed as
   * a session started fresh is the exception — the CLI stores it
   * (`hook_non_blocking_error` ahead of the first prompt, measured 2.1.280;
   * the same hook failing as a session resumes is stored nowhere) — so its
   * failure is held, in the shape a history read gives it
   * (claude-transcript.ts), for the run's first prompt.
   */
  #hookFailure(message: SDKMessage): boolean {
    const hook = message as unknown as HookFrame;
    if (
      hook.type !== "system" ||
      !(hook.subtype === "hook_started" || hook.subtype === "hook_response")
    ) {
      return false;
    }
    this.#watchBoundary(hook);
    if (hook.outcome === "error" && hook.hook_name === "SessionStart:startup") {
      this.#hookFailures.push({
        type: "system",
        subtype: "hook_response",
        hook_name: hook.hook_name,
        exit_code: hook.exit_code,
        stdout: hook.stdout,
        stderr: hook.stderr,
        ...(hook.session_id ? { session_id: hook.session_id } : {}),
      });
    }
    return true;
  }

  /**
   * The workspace's boundary hook erroring, as the CLI reports it with the
   * hook events {@link claudeBoundaryOptions} turns on, split by exit status.
   * Exit 2 is a refusal: the command did not run, the model is told why, and
   * the turn goes on — a slow hook on a loaded machine, or a live CLI whose
   * hook names a verb the swap to the hook script removed, refuses that call
   * and nothing else. Any other error let the command run outside the
   * boundary (the CLI reports it as non-blocking), and a hook that fails
   * open once does so for every call after it, so the turn is stopped at once
   * and ends failed with the hook's own words ({@link #pumpMessages}). A
   * transcript's `hook_non_blocking_error` ({@link #transcriptHookFailure})
   * is always the second kind. The hook is known by what names it in what
   * was written: the script's first line names it; the shell names what it
   * ran when that is gone.
   */
  #watchBoundary(hook: HookFrame): void {
    const own = this.#boundaryHook;
    if (
      !own ||
      this.#boundaryFailure !== undefined ||
      hook.subtype !== "hook_response" ||
      hook.hook_event !== "PreToolUse" ||
      hook.outcome !== "error" ||
      ![hook.stderr, hook.output].some((said) =>
        own.names.some((name) => said?.includes(name))
      )
    ) {
      return;
    }
    if (hook.exit_code === 2) {
      // The hook's first line names it; the lines after it say why.
      const said = (hook.stderr || hook.output || "")
        .trim()
        .replaceAll("\n", " | ");
      console.info(
        `[claude] ${this.instanceId}: boundary hook refused a call: ${said}`
      );
      return;
    }
    const failure = `boundary hook failed: ${(hook.stderr || hook.output || "").trim()}`;
    // A transcript can say so after its turn has ended: the session then
    // takes no further turn.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Turn.busy is mutated by Turn.start()/.end() elsewhere; the checker doesn't see that cross-class mutation
    if (!this.#turn.busy) {
      this.#refuse(
        new HeldProcessRefused(
          `${failure}. The session was stopped; resuming it starts it again with a hook that refuses instead.`
        )
      );
      return;
    }
    this.#boundaryFailure = failure;
    console.warn(`[claude] ${this.instanceId}: ${failure}`);
    // biome-ignore lint/complexity/noVoid: the turn's result frame carries the outcome
    void this.interrupt();
  }

  /**
   * Whether the session's boundary hook can no longer run, checked as each
   * turn starts. Only a hook in the form before the workspace's script needs
   * anything (it fails open without it): an adopted CLI launched with one
   * whose cawco binary has gone since is stopped before the turn runs a
   * command, and its work item fails with the reason.
   */
  #hookGone(): HeldProcessRefused | undefined {
    if (this.#hookRefusal) {
      return this.#hookRefusal;
    }
    const gone = this.#boundaryHook && hookMissing(this.#boundaryHook);
    if (!gone) {
      return;
    }
    return this.#refuse(
      new HeldProcessRefused(
        `boundary hook failed: ${gone} is gone, and this session's boundary hook runs it, so its commands would run outside the workspace boundary. The session was stopped before its turn; resuming it starts it again with a hook that refuses instead.`
      )
    );
  }

  /**
   * Stops the session for good because its boundary hook cannot hold, and
   * says why: its row and work item fail with `refusal`, and every send after
   * it is refused ({@link #hookGone}).
   */
  #refuse(refusal: HeldProcessRefused): HeldProcessRefused {
    if (this.#hookRefusal) {
      return this.#hookRefusal;
    }
    this.#hookRefusal = refusal;
    console.warn(`[claude] ${this.instanceId}: ${refusal.message}`);
    this.#ctx.refused?.(refusal);
    const held = this.#sessiond;
    // biome-ignore lint/complexity/noVoid: the refusal is said; stopping finishes on its own
    void this.stop()
      .then(() => (held ? endProc(held.client, held.procId) : undefined))
      .catch((error: unknown) =>
        console.warn(
          `[claude] ${this.instanceId}: stopping after its boundary hook went: ${String(error)}`
        )
      );
    return refusal;
  }

  /**
   * Asks the hub to relaunch the session onto the workspace's hook script
   * ({@link BOUNDARY_RELAUNCH}) when its CLI runs a hook that fails open:
   * called at the attach when no turn is running, and as each turn ends. The
   * hub does so only while the session is idle; until then the turn-start
   * check and the transcript watch stand in.
   */
  askRelaunch(): void {
    if (this.#boundaryHook?.needs.length && !this.#hookRefusal) {
      this.#ctx.frame({ type: "system", subtype: BOUNDARY_RELAUNCH });
    }
  }

  /** Installed by the supervisor: an attach that met no running turn asks for its relaunch now ({@link askRelaunch}). */
  attached(): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: Turn.busy is mutated by Turn.start()/.end() elsewhere; the checker doesn't see that cross-class mutation
    if (!this.#turn.busy) {
      this.askRelaunch();
    }
  }

  /** An adopted CLI's boundary hook, read off its command line ({@link launchedHook}). */
  boundedBy(hook: LaunchedHook): void {
    this.#boundaryHook = hook;
    if (!hook.events) {
      // biome-ignore lint/complexity/noVoid: the watch reports through #watchBoundary
      void this.#watchTranscript().catch((error: unknown) =>
        console.warn(
          `[claude] ${this.instanceId}: watching its transcript for boundary hook failures failed: ${String(error)}`
        )
      );
    }
  }

  /**
   * For a CLI that does not report its hooks in its stream (launched before
   * cawco asked it to), the boundary hook's failures as its transcript
   * records them: each `hook_non_blocking_error` it appends from here on,
   * which names the hook's command, goes to {@link #watchBoundary}.
   */
  async #watchTranscript(): Promise<void> {
    const file = this.sessionId
      ? await claudeSessionFile(this.sessionId, this.#ctx.cwd)
      : null;
    if (!file) {
      console.warn(
        `[claude] ${this.instanceId}: no transcript found to watch for its boundary hook's failures`
      );
      return;
    }
    let offset = (await stat(file)).size;
    // A transcript line can be megabytes (an image in a tool result), and a
    // read can end mid-line and mid-character: both are carried to the next.
    const lines = new LineSplitter();
    const decoder = new TextDecoder();
    let reading = Promise.resolve();
    const read = async (): Promise<void> => {
      const handle = await open(file, "r");
      try {
        const { size } = await handle.stat();
        if (size <= offset) {
          return;
        }
        const added = Buffer.alloc(size - offset);
        await handle.read(added, 0, added.length, offset);
        offset = size;
        for (const line of lines.push(
          decoder.decode(added, { stream: true })
        )) {
          if (line.includes("hook_non_blocking_error")) {
            this.#transcriptHookFailure(line);
          }
        }
      } finally {
        await handle.close();
      }
    };
    this.#transcriptWatch?.close();
    this.#transcriptWatch = watch(file, () => {
      reading = reading
        .then(read)
        .catch((error: unknown) =>
          console.warn(
            `[claude] ${this.instanceId}: reading its transcript failed: ${String(error)}`
          )
        );
    });
  }

  /** One transcript line that may be a hook's non-blocking failure. */
  #transcriptHookFailure(line: string): void {
    let record: { attachment?: StoredHookFailure };
    try {
      record = JSON.parse(line) as { attachment?: StoredHookFailure };
    } catch {
      return;
    }
    const { attachment } = record;
    if (attachment?.type === "hook_non_blocking_error") {
      this.#watchBoundary({
        type: "system",
        subtype: "hook_response",
        hook_event: attachment.hookEvent,
        outcome: "error",
        stderr: attachment.stderr,
        output: attachment.command,
      });
    }
  }

  /**
   * PROVENANCE (design §7): the ring line the frame about to go out came from,
   * which is what the hub's ingest ledger keeps its mark by — and what lets
   * the attach after an agent restart replay exactly the lines the hub never
   * framed. A message is matched to its line by `uuid`; entries up to it are
   * dropped, since the SDK hands messages over in ring order and the ones it
   * swallowed (rate-limit readings) will never be asked for. A frame whose
   * line is unknown — no uuid, or its child's pid not yet listed — goes out
   * unstamped, which the ledger reads as "no mark".
   */
  #stamp(message: SDKMessage): void {
    const { uuid } = message as { uuid?: unknown };
    const ring = this.#sessiond;
    const seqs = this.#seqs;
    if (!ring || typeof uuid !== "string") {
      return;
    }
    const seq = seqs.get(uuid);
    if (seq === undefined) {
      return;
    }
    for (const key of seqs.keys()) {
      seqs.delete(key);
      if (key === uuid) {
        break;
      }
    }
    const { epoch } = ring.client;
    const pid = ring.client.procs.find(
      (proc) => proc.procId === ring.procId && proc.alive
    )?.pid;
    if (epoch !== undefined && pid !== undefined) {
      (this.#ctx as Partial<SessiondAwareContext>).line?.(
        procEpoch(epoch, pid),
        seq
      );
    }
  }

  /**
   * An attach that met a turn already running: the turn is this session's
   * from here, and busy as it was before the agent went away.
   */
  adoptTurn(): void {
    this.#turn.running = true;
    this.#turn.start();
    this.#ctx.busy(true);
  }

  /**
   * What an attach read off the child's ring: how many wake-ups the session
   * had scheduled as its last turn there ended, or `undefined` when the ring
   * holds no turn's end.
   */
  adoptWakeups(count: number | undefined): void {
    this.#crons = count;
  }

  holding(): string | undefined {
    if (!this.#stored) {
      return "its conversation is not stored, so nothing could wake it";
    }
    if (this.#background.size > 0) {
      return `${this.#background.size} background task(s) it started are still running`;
    }
    if (this.#crons === undefined) {
      return "its scheduled wake-ups are not known until its next turn ends";
    }
    return this.#crons > 0
      ? `it has scheduled itself ${this.#crons} wake-up(s)`
      : undefined;
  }

  send(message: SentMessage, extras: TurnExtras): void {
    // A session whose boundary hook can no longer run takes no turn.
    const refused = this.#hookGone();
    if (refused) {
      this.#ctx.rejected(message.uuid, refused);
      return;
    }
    // The uuid rides on the message: the CLI keeps it as the command's own id
    // and names it in the `command_lifecycle` that says it was consumed.
    // Every send goes to the CLI as a query, whatever its `shouldQuery`. Into a
    // running turn, the CLI folds it in at the next tool boundary without
    // cutting the tool short; after the model's last word, it opens a turn of
    // its own. A `shouldQuery: false` append does neither once the model has
    // finished: the CLI stores it unread and answers with an empty result
    // (measured, agent SDK 0.3.284: `num_turns 0`, `duration_api_ms 0`), so a
    // hand-off, report or rule reply landing then was never read.
    const outgoing = withExtras(
      { ...(message as unknown as SDKUserMessage), shouldQuery: undefined },
      extras.attachments,
      extras.images
    );
    this.#delivery.set(message.uuid, Promise.withResolvers<void>());

    // A mid-turn injection: the model reads it at the next tool boundary without
    // losing work. The CLI queues it and says `started` when it is read, as it
    // does for any send (measured 2.1.280). A stream that refuses it is that
    // send's failure.
    if (extras.urgent && this.#turn.busy) {
      // biome-ignore lint/suspicious/useAwait: must stay an async generator — streamInput's signature requires AsyncGenerator<SDKUserMessage>, not the plain Generator a non-async function* would produce
      const stream = (async function* (): AsyncGenerator<SDKUserMessage> {
        yield outgoing;
      })();
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent; the rejection is handled by the .catch() right here
      void this.#handle.streamInput(stream).catch((error: unknown) => {
        this.#delivery.get(message.uuid)?.resolve();
        this.#delivery.delete(message.uuid);
        this.#ctx.rejected(message.uuid, error);
      });
      return;
    }

    this.#ctx.busy(true);
    this.#turn.start();
    this.#input.push(outgoing);
  }

  async control(method: string, args: unknown[]): Promise<unknown> {
    if (method === CONTROL_WITHDRAW_SEND) {
      if (typeof args[0] !== "string" || !args[0]) {
        throw new Error("A withdrawal names no send.");
      }
      return await this.#withdraw(args[0]);
    }
    if (method === INSTALL_SESSION_CREDENTIAL) {
      const [credential, mode] = args;
      if (typeof credential !== "string" || !credential) {
        throw new Error("Session credential is missing.");
      }
      return await this.#installSessionCredential(
        credential,
        mode === "initial"
      );
    }
    if (method === VERIFY_SESSION_CREDENTIAL) {
      return await this.#verifyHeldCredential();
    }
    // Effort is the one neutral verb with no `Query` method behind it: it is a
    // flag setting, applied over user/project/local settings and never written
    // to any of them, which is exactly a session-scoped switch. `max` is only
    // reachable this way — the persisted setting excludes it.
    if (method === CONTROL_SET_EFFORT) {
      await this.#handle.applyFlagSettings({
        effortLevel: args[0] as EffortLevel,
      });
      // What the session now sends, which a model's own ceiling can make
      // lower than what was asked.
      await this.#readEffort();
      return undefined;
    }
    // The CLI is told its own mode (`fullSend` is its bypass); the session
    // takes the mode CawCo was asked for once the CLI is in it.
    if (method === CONTROL_SET_PERMISSION_MODE) {
      const mode = args[0] as import("@cawco/core").PermissionMode;
      await this.#handle.setPermissionMode(sdkMode(mode));
      this.#mode.choose(mode);
      return undefined;
    }
    const handle = this.#handle as unknown as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    if (typeof handle[method] !== "function") {
      throw new Error(`unknown control method: ${method}`);
    }
    const answer = await handle[method](...args);
    // A model switch moves the effort with it: onto a model without effort,
    // or down to the new model's ceiling.
    if (method === CONTROL_SET_MODEL) {
      await this.#readEffort();
    }
    return answer;
  }

  async #withdraw(uuid: string): Promise<"withdrawn" | "started"> {
    if (this.#input.withdraw(uuid)) {
      this.#delivery.get(uuid)?.resolve();
      this.#delivery.delete(uuid);
      // biome-ignore lint/suspicious/noUnnecessaryConditions: the pump and adoption set running for a turn in flight; the checker only sees its initial value here
      if (!this.#turn.running && this.#delivery.size === 0) {
        this.#turn.end();
        this.#ctx.busy(false);
      }
      return "withdrawn";
    }
    // A control write can overtake the SDK's async input iterator. Wait for
    // the CLI's receipt of this send before asking it to cancel; no send is
    // delayed or held here. The CLI's cancellation still decides the race.
    await this.#delivery.get(uuid)?.promise;
    // https://raw.githubusercontent.com/anthropics/claude-agent-sdk-typescript/main/CHANGELOG.md
    // 0.2.76: cancel_async_message drops a queued user message by UUID.
    // Query has no public typed method (0.3.289); use its own correlated
    // control request path. The CLI removes atomically with its dequeue.
    const reply = await (
      this.#handle as unknown as {
        request: (request: {
          subtype: "cancel_async_message";
          message_uuid: string;
        }) => Promise<
          { response?: { cancelled?: boolean } } | null | undefined
        >;
      }
    ).request({ subtype: "cancel_async_message", message_uuid: uuid });
    return reply?.response?.cancelled === true ? "withdrawn" : "started";
  }

  /**
   * THE CAWCO SLOT, DIALLED AGAIN WHEN THE CLI HAS GIVEN IT UP. The child
   * reaches CawCo through this machine's agent (its MCP gateway, or the hub
   * itself when that is local), and an update restarts both. Claude Code
   * retries a dropped HTTP server five times, 1 s to 8 s apart, with a 30 s
   * connect timeout each, then marks it `failed` for good and never dials it
   * again (2.1.289, the slot's own `mcp-logs-cawco`: "Reconnect gave up after
   * 5 attempts: failed", 2026-10-08 10:30:46, two seconds before the rollback
   * brought a hub that answered back). A `failed` slot is dialled once more
   * with the header it was launched with, so no credential changes: one the
   * hub no longer knows is refused by that dial, or reads `needs-auth`,
   * which is not redialled. A slot still connecting is left to finish.
   */
  async #reconnectCawco(): Promise<McpServerStatus[]> {
    const servers = await this.#handle.mcpServerStatus();
    if (
      servers.find((server) => server.name === MCP_SERVER_NAME)?.status ===
      "failed"
    ) {
      await this.#handle.reconnectMcpServer(MCP_SERVER_NAME);
    }
    return await this.#connectedCawcoSnapshot();
  }

  async #connectedCawcoSnapshot(): Promise<McpServerStatus[]> {
    const deadline = Date.now() + 30_000;
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: only the cawco slot gates its credential ACK.
      const servers = await this.#handle.mcpServerStatus();
      const cawco = servers.find((server) => server.name === MCP_SERVER_NAME);
      if (cawco?.status === "connected") {
        return servers;
      }
      if (cawco && cawco.status !== "pending") {
        throw new Error(`CawCo MCP is not connected (${cawco.status}).`);
      }
      if (Date.now() >= deadline) {
        throw new Error("CawCo MCP did not connect within 30 seconds.");
      }
      await Bun.sleep(250);
    }
  }

  async #installSessionCredential(credential: string, initial: boolean) {
    // A connected slot and a host-side HTTP probe do not prove that the
    // child's static header changed. Never ACK a replacement for that child:
    // the hub must keep accepting its launch credential for its lifetime.
    if (
      !initial ||
      this.#sessiond?.attach ||
      credential !== this.#launchCredential
    ) {
      throw new Error(
        "Live Claude credential installation refused: it enrolls on its next fresh start."
      );
    }
    const servers = await this.#connectedCawcoSnapshot();
    const cawco = servers.find((server) => server.name === MCP_SERVER_NAME);
    if (
      cawco?.config?.type !== "http" ||
      cawco.config.headers?.Authorization !== `Bearer ${credential}`
    ) {
      throw new Error("CawCo MCP launch credential could not be verified.");
    }
    await callDelegationTool(this.instanceId, "list_sessions", {}, credential);
    await acknowledgeSessionCredential(credential);
    console.info(`[claude] launch credential installed ${this.instanceId}`);
    return {
      installed: true,
      harness: "claude",
      instanceId: this.instanceId,
      changedServers: [],
    };
  }

  /**
   * A child this host attached to proves what its cawco slot sends: the slot
   * is connected, and the header it was launched with is one the hub
   * acknowledges (the ACK is authenticated by that header, so a credential
   * the hub no longer knows is refused). A child launched with no credential
   * has no way to call CawCo tools: the hub takes no call without one.
   *
   * The slot is read through {@link #reconnectCawco}: a child that outlived
   * the agent has often had its slot given up while the agent and the hub
   * were restarting, and a gave-up slot is not a credential the hub refused.
   */
  async #verifyHeldCredential() {
    const servers = await this.#reconnectCawco();
    const cawco = servers.find((server) => server.name === MCP_SERVER_NAME);
    const header =
      cawco?.config?.type === "http"
        ? cawco.config.headers?.Authorization
        : undefined;
    if (!header?.startsWith("Bearer ")) {
      throw new Error(
        "This Claude process was launched without a CawCo session credential."
      );
    }
    const credential = header.slice("Bearer ".length);
    await acknowledgeSessionCredential(credential);
    console.info(`[claude] held credential verified ${this.instanceId}`);
    return { credential };
  }

  resolvePermission(
    requestId: string,
    result: import("@cawco/core").PermissionResult
  ): void {
    const resolve = this.#permissions.get(requestId);
    if (!resolve) {
      throw new Error(`no permission request ${requestId}`);
    }
    this.#permissions.delete(requestId);
    // An answer that moves the session into Full Send (an approved plan, say)
    // puts the CLI in bypass; the session is Full Send from here.
    if (
      result.behavior === "allow" &&
      result.updatedPermissions?.some(
        (update) => update.type === "setMode" && update.mode === "fullSend"
      )
    ) {
      this.#mode.choose("fullSend");
    }
    const question = this.#openQuestions.get(requestId);
    if (!question) {
      resolve(sdkPermissionResult(result));
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
    resolve(sdkPermissionResult(settledQuestionResult(question, result)));
  }

  /**
   * An ask the hub could not show anyone: the CLI is told no, in `message`'s
   * words, and its turn goes on. It is withdrawn as an interrupt withdraws
   * one, so no dismissal is recorded for its `tool_result`.
   */
  withdrawPermission(requestId: string, message: string): void {
    const resolve = this.#permissions.get(requestId);
    if (!resolve) {
      throw new Error(`no permission request ${requestId}`);
    }
    this.#permissions.delete(requestId);
    this.#openQuestions.delete(requestId);
    console.log(`[claude] permission withdrawn: ${requestId} — ${message}`);
    resolve({ behavior: "deny", message });
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
    ...((entry as SDKSessionMessage).error
      ? { error: (entry as SDKSessionMessage).error }
      : {}),
    ...((entry as SDKSessionMessage).joined
      ? { joined: (entry as SDKSessionMessage).joined }
      : {}),
    ...(entry.type === "assistant" && endsTurn(entry.message)
      ? { turnEnd: true as const }
      : {}),
  };
};

/**
 * Whether a stored assistant message is the one its model ended the turn
 * with: Claude writes each of its lines with the message's final
 * `stop_reason`, `null` while it is still being written.
 */
const endsTurn = (message: unknown): boolean => {
  const reason = (message as { stop_reason?: unknown } | null)?.stop_reason;
  return reason === "end_turn" || reason === "stop_sequence";
};

const parseLine = (data: string): RingLine | undefined => {
  try {
    return JSON.parse(data) as RingLine;
  } catch {
    return undefined;
  }
};

/**
 * How many lines back from `head` the first look at a ring's end reads. A turn
 * that is running wrote the last of them, and an idle child's notices after
 * its `result` are a handful; each look that finds nothing about a turn reads
 * four times further back, to the ring's start.
 */
const TURN_LOOK_LINES = 256;

/**
 * The permission asks still open, by request id, as a ring is read in order.
 * The CLI writes each as a `can_use_tool` control_request and the answer goes
 * to its stdin, which the ring never sees — so an ask counts as open until
 * the turn moves past it (the next assistant, user or result line: the tool
 * ran or was refused) or the CLI cancels it.
 */
const readAsk = (
  asks: Map<string, string>,
  line: RingLine | undefined,
  data: string
): void => {
  if (
    line?.type === "control_request" &&
    line.request?.subtype === "can_use_tool"
  ) {
    asks.set(String(line.request_id), data);
  } else if (line?.type === "control_cancel_request") {
    asks.delete(String(line.request_id));
  } else if (
    line?.type === "assistant" ||
    line?.type === "user" ||
    line?.type === "result"
  ) {
    asks.clear();
  }
};

/**
 * Where an adoption's read starts: the oldest line sessiond still holds. Every
 * send the CLI was handed is somewhere in it, so the read is the whole ring:
 * one pass over at most a few thousand retained lines, once per adopted
 * session, and nothing read here is emitted. Sessiond refusing this cursor is
 * the answer to "how far back do you go" ({@link readRing}).
 */
const RING_START = 0;

export class ClaudeHarness implements Harness {
  readonly kind = "claude" as const;
  readonly capabilities = CLAUDE_CAPABILITIES;
  auth: AuthState = "authenticated";

  /**
   * The machine's Claude Code: installed or not, and every account dir's
   * sign-in, which is also the machine's word on Claude (signed in when any
   * account is). No model catalog: that is each account's, which its
   * sessions' initialize responses report and the hub keeps.
   */
  async detect(): Promise<HarnessReport> {
    const accounts = await accountReports();
    const auth = await claudeAuth(accounts);
    this.auth = auth;
    return {
      harness: "claude",
      installed: resolveClaudeExecutable() !== undefined,
      version: undefined,
      auth,
      capabilities: CLAUDE_CAPABILITIES,
      accounts,
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
    // `CAWCO_SESSIOND_ENDPOINT` is sessiond's own override
    // (`sessiond/src/main.ts`), honoured on this side too so a dev run — or a
    // test — can point both halves at a scratch socket instead of the real one.
    endpoint: string = process.env.CAWCO_SESSIOND_ENDPOINT ?? sessiondEndpoint()
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
    const account = await launchAccountOf(spec);
    // No account: the machine's own login, moving into one now.
    const place = { accountId: account ?? null };
    const configDir = sessionConfigDir(place);
    if (!account) {
      console.info(
        `[claude] ${ctx.instanceId} runs on this machine's own login, which is moving into account ${spec.homeLoginMove?.accountId}`
      );
    }
    const cwd = await realpath(ctx.cwd).catch(() => ctx.cwd);
    // The project's auto memory is the user's, whichever account runs it.
    await linkProjectMemory(
      configDir,
      projectSlug(await projectMemoryRoot(cwd))
    );
    if (spec.resume) {
      // A conversation goes on in the dir it runs in now, carried whole
      // into it first, for the launch that places a row on its account
      // carries it here. A fork reads its origin's where it is: it runs on
      // its origin's account, and its origin may be running.
      if (spec.resume.fork) {
        if (!(await claudeSessionFile(spec.resume.sessionKey, ctx.cwd))) {
          throw new Error(CLAUDE_CONVERSATION_GONE);
        }
      } else {
        const carried = (
          await carrySessions([{ sessionId: spec.resume.sessionKey, ...place }])
        ).get(spec.resume.sessionKey);
        if (carried && "error" in carried) {
          throw new Error(
            `Claude Code's conversation could not be brought into ${configDir}: ${carried.error}`
          );
        }
        if (!(await transcriptIn(configDir, spec.resume.sessionKey, cwd))) {
          throw new Error(CLAUDE_CONVERSATION_GONE);
        }
      }
    }
    const fleetDenyList = await sessionFleetDenials(spec.cawcoTodos);
    const options = spec.options as
      | { env?: Record<string, string | undefined> }
      | undefined;
    return new ClaudeSession(
      ctx.instanceId,
      ctx,
      ctx.cwd,
      {
        ...options,
        env: {
          ...options?.env,
          ...(account
            ? accountEnv(account)
            : {
                CLAUDE_CONFIG_DIR: undefined,
                CLAUDE_SECURESTORAGE_CONFIG_DIR: undefined,
              }),
        },
      },
      spec.permissionMode,
      spec.model,
      spec.effort,
      spec.resume,
      spec.persistSession,
      spec.skills,
      spec.denyTools,
      fleetDenyList,
      { client, procId: procIdFor("claude", ctx.instanceId) }
    );
  }

  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    const welcome = await this.custodyCandidates();
    const proc = welcome.procs.find(
      (child) => child.procId === ctx.instanceId && child.alive
    );
    if (!proc) {
      return undefined;
    }
    return this.adopt(ctx.instanceId, ctx, {
      afterSeq: resumeCursor(procEpoch(welcome.epoch, proc.pid), ctx.ingested),
      head: proc.head,
      sessionId: spec.resume?.sessionKey ?? null,
      turnRunning: await this.turnRunning(ctx.instanceId, proc.head),
      permissionMode: spec.permissionMode,
    });
  }

  /**
   * WHETHER A CHILD THAT OUTLIVED THE AGENT IS MID-TURN, as its own ring says
   * up to `head` ({@link ChildActivity}). Asked of every surviving child at
   * once, before any of them is attached, so a restarted agent never answers
   * a busy question as if the turns it has not attached yet had ended.
   *
   * The answer is the last line that says anything about a turn, so the read
   * starts near the end: {@link TURN_LOOK_LINES} back from `head`, and four
   * times further each time a look finds nothing about a turn, until it has
   * read back to the oldest line sessiond holds. A full read of every ring is
   * what an adoption does ({@link adopt}), and doing that here for 138 rings
   * at once is the very wait this answer must not sit behind.
   */
  async turnRunning(instanceId: string, head: number): Promise<boolean> {
    const client = await this.sessiond();
    for (let span = TURN_LOOK_LINES; ; span *= 4) {
      const from = Math.max(head - span, 0);
      const activity = new ChildActivity("claude");
      // biome-ignore lint/performance/noAwaitInLoops: each look reaches further back only when the one before it found nothing about a turn
      const oldest = await readRing(
        client,
        procIdFor("claude", instanceId),
        from,
        head,
        (event) => activity.read(parseLine(event.data))
      );
      if (activity.decided || from === 0 || oldest > from + 1) {
        return activity.turnRunning;
      }
    }
  }

  /**
   * ATTACH (design §4.1): take over a child that outlived the agent, by
   * putting a full SDK `Query` on the same process — idle, mid-turn, or with
   * background work running. Nothing is relaunched, so nothing it runs is cut
   * off, and nothing waits: the `Query` takes sends and controls at once.
   *
   * `turnRunning` is {@link turnRunning}'s answer for this child, taken before
   * any child was attached: a running turn is this session's from the start,
   * busy as it was before the agent went away.
   *
   * The ring is read first, from {@link RING_START} through `head`, for the
   * three things only the whole backlog can say:
   *  - the permission asks the previous host left unanswered — the turn is
   *    blocked on them, and the attached `Query` must park and answer them
   *    under the CLI's own request ids (the bridge's `prelude`);
   *  - the conversation's session id, for an attached child writes no `init`
   *    until its next turn;
   *  - every send the CLI was handed, which is told to the hub
   *    ({@link MESSAGES_HELD}, `whole`): the rest of what the agent before
   *    this one was sent never reached the CLI.
   *
   * The `Query` then reads from `afterSeq` — the hub's own mark, so the lines
   * the CLI wrote while no agent was reading reach the hub now, exactly once
   * (the ledger refuses what it has) — or from `head` when the hub has none or
   * the ring no longer holds it, which is announced as a gap.
   */
  async adopt(
    instanceId: string,
    ctx: HarnessContext,
    options: {
      afterSeq?: number;
      /** The ring's last seq as sessiond listed it. */
      head: number;
      sessionId: string | null;
      /** {@link turnRunning}'s answer for this child. */
      turnRunning: boolean;
      /** The mode the hub stored for it: the asks replayed at attach are decided in it. */
      permissionMode?: import("@cawco/core").PermissionMode;
    }
  ): Promise<HarnessSession> {
    const client = await this.sessiond();
    const { head, turnRunning } = options;
    const procId = procIdFor("claude", instanceId);
    const child = (await client.list()).procs.find(
      (proc) => proc.procId === procId && proc.alive
    );
    if (!child) {
      throw new Error(`sessiond holds no live child ${procId}`);
    }
    // A CLI keeps the hook it was launched with for life. One whose boundary
    // hook is in the form before the workspace's script lets a command
    // through, outside the boundary, when the cawco binary it names is gone:
    // it is adopted only while that binary is there (prune keeps a version a
    // live process names), and checked again as each turn starts. A hook in
    // no form cawco wrote is never trusted.
    const launched = await launchedHook(child.pid);
    const gone =
      launched === "unknown"
        ? "its boundary hook is in no form cawco writes"
        : launched && hookMissing(launched);
    if (gone) {
      await endProc(client, procId);
      throw new HeldProcessRefused(
        `This session's Claude Code runs a workspace boundary hook that cannot hold (${launched === "unknown" ? gone : `${gone} is gone`}), and a failing hook lets its commands run outside the boundary. It was stopped; resuming it starts it again with a hook that refuses instead.`
      );
    }
    const asks = new Map<string, string>();
    // Every send the CLI has been handed: each command it names in a
    // lifecycle line, queued or begun.
    const handed = new Set<string>();
    // The wake-ups the session had scheduled as its last turn in the ring
    // ended: what its `Stop` hook was told ({@link scheduledWakeups}).
    let wakeups: number | undefined;
    let { sessionId } = options;
    // `head` is the listing's, taken before every earlier row was adopted; a
    // ring that has since dropped past it ends the read rather than stalling
    // every later row behind this one ({@link readRing}).
    const oldest = await readRing(client, procId, RING_START, head, (event) => {
      const parsed = parseLine(event.data);
      readAsk(asks, parsed, event.data);
      if (
        parsed?.type === "command_lifecycle" &&
        typeof parsed.command_uuid === "string"
      ) {
        handed.add(parsed.command_uuid);
      }
      if (
        parsed?.type === "control_request" &&
        parsed.request?.subtype === "hook_callback"
      ) {
        wakeups = scheduledWakeups(parsed.request.input) ?? wakeups;
      }
      if (typeof parsed?.session_id === "string") {
        sessionId = parsed.session_id;
      }
    });
    const replayable =
      options.afterSeq !== undefined && options.afterSeq + 1 >= oldest;
    // What the CLI was handed is all it holds: a send the agent before this
    // one had not written to it yet went with that agent. The list is whole
    // when this read saw every line the hub has not — the ring still holds
    // the line after the hub's mark, or its first line — or when no turn is
    // running, for an idle CLI takes up what it is handed at once and so
    // holds nothing unread. Said before the `Query` below replays a line, so
    // the hub decides those sends against it, and the reads replayed land on
    // what it keeps waiting.
    ctx.frame({
      type: "system",
      subtype: MESSAGES_HELD,
      held: [...handed],
      whole: replayable || oldest <= 1 || !turnRunning,
      ...(sessionId ? { session_id: sessionId } : {}),
    });
    // Where the `Query` reads from when it cannot replay the hub's mark: the
    // listing's `head`, unless the ring no longer holds the line after it — a
    // cursor sessiond cannot serve would end the `Query` on a reset.
    const start = Math.max(head, oldest - 1);
    if (!replayable && (options.afterSeq !== undefined || start > head)) {
      ctx.frame({
        type: "system",
        subtype: "sessiond_stream_gap",
        text: `cawco: sessiond's replay window overflowed; this transcript resumes at line ${start + 1}`,
      } as unknown as NeutralMessage);
    }
    // The stored mode goes in at construction, ahead of the prelude's asks.
    // The launch options it also sets are never used: nothing is spawned.
    const session = new ClaudeSession(
      instanceId,
      ctx,
      ctx.cwd,
      undefined,
      options.permissionMode,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      [],
      {
        client,
        procId,
        attach: {
          afterSeq: replayable ? (options.afterSeq ?? start) : start,
          head,
          prelude: [...asks.values()],
        },
      }
    );
    session.sessionId = sessionId;
    if (launched && launched !== "unknown") {
      session.boundedBy(launched);
    }
    if (turnRunning) {
      session.adoptTurn();
    }
    session.adoptWakeups(wakeups);
    return session;
  }

  /** What sessiond is still holding for this machine — the reattach's first read. */
  async custodyCandidates(): Promise<SessiondWelcomeInfo> {
    const client = await this.sessiond();
    const welcome = await client.list();
    return {
      ...welcome,
      procs: welcome.procs.filter(
        (proc) => parseProcId(proc.procId).kind === "claude"
      ),
    };
  }

  /**
   * Every stored session: the SDK lists the agent's own config dir, and each
   * account's dir is read here, since the SDK never looks there.
   */
  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    const own = await listSessions({ ...(dir ? { dir } : {}) });
    const slug = dir ? projectSlug(await realpath(dir)) : null;
    const files: { file: string; sessionId: string }[] = [];
    // The SDK lists the dir the agent itself was started with.
    const sdkDir = process.env.CLAUDE_CONFIG_DIR ?? claudeHome();
    for (const accountId of accountIds()) {
      if (accountConfigDir(accountId) === sdkDir) {
        continue;
      }
      const projects = join(accountConfigDir(accountId), "projects");
      // biome-ignore lint/performance/noAwaitInLoops: a handful of account dirs, each listed into the shared `files`
      const projectDirs = slug ? [slug] : await subdirectories(projects);
      for (const project of projectDirs) {
        for (const name of await jsonlNames(join(projects, project))) {
          files.push({
            file: join(projects, project, name),
            sessionId: name.slice(0, -".jsonl".length),
          });
        }
      }
    }
    const accounts = await Promise.all(
      files.map(({ file, sessionId }) =>
        getSessionInfo(sessionId, {
          sessionStore: transcriptStore(file, transcriptEnds),
        })
      )
    );
    return [
      ...own,
      ...accounts.filter((info): info is SDKSessionInfo => info !== undefined),
    ].map(toInfo);
  }

  async getSessionInfo(
    sessionKey: string,
    dir?: string
  ): Promise<NeutralSessionInfo | undefined> {
    const file = await claudeSessionFile(sessionKey, dir);
    if (!file) {
      return;
    }
    const info = await sessionInfoAt(file, sessionKey);
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

  async renameSession(
    sessionKey: string,
    title: string,
    dir?: string
  ): Promise<void> {
    const file = await requireSessionFile(sessionKey, dir);
    await renameSession(sessionKey, title, {
      sessionStore: transcriptStore(file),
    });
  }

  async tagSession(
    sessionKey: string,
    tag: string | null,
    dir?: string
  ): Promise<void> {
    const file = await requireSessionFile(sessionKey, dir);
    await tagSession(sessionKey, tag, { sessionStore: transcriptStore(file) });
  }

  async deleteSession(sessionKey: string, dir?: string): Promise<void> {
    const file = await requireSessionFile(sessionKey, dir);
    await deleteSession(sessionKey, { sessionStore: transcriptStore(file) });
  }

  async machine(method: string, args: unknown[]): Promise<unknown> {
    switch (method) {
      case CONTROL_READ_SESSION_CONTEXT: {
        const file = await claudeSessionFile(
          args[0] as string,
          args[1] as string | undefined
        );
        return file
          ? await readSessionContext(file)
          : { reason: "transcript missing" };
      }
      case MARKETPLACE_CATALOG:
        return marketplaceCatalog(args[0] as string);
      case READ_MEMORY_FILE:
        return readMemoryFile();
      case READ_HOOK_SCRIPT:
        return readHookScript(args[0] as string);
      case READ_SKILL_FILES:
        return readSkillFiles(args[0] as string, args[1] as string | undefined);
      case INSPECT_CONFIG:
        return inspectConfig(args[0] as string | undefined);
      // Each change to an account dir's sign-in is one a report waits out
      // (`changingSignins`), so none says what a dir was before it.
      case CONTROL_BEGIN_ACCOUNT_LOGIN:
        return changingSignins(
          beginAccountLogin(args[0] as string, args[1] as AccountKind)
        );
      case CONTROL_COMPLETE_ACCOUNT_LOGIN:
        return changingSignins(
          completeAccountLogin(
            args[0] as string,
            args[1] as string,
            (args[2] as AccountIdentity | null) ?? null
          )
        );
      case CONTROL_FORGET_ACCOUNT:
        // An answer, not undefined: undefined tells the daemon this harness
        // does not handle the control, and the hub reads that as a refusal.
        await changingSignins(
          forgetAccount(
            args[0] as string,
            (args[1] as string | null | undefined) ?? null
          )
        );
        return { forgotten: true };
      case CONTROL_GET_TODOS:
        return readTaskList(
          { accountId: (args[2] as string | null | undefined) ?? null },
          args[0] as string
        );
      case CONTROL_PROBE_ACCOUNT:
        return probeAccount(args[0] as string);
      case CONTROL_READ_HOME_LOGIN:
        return readHomeLogin();
      case CONTROL_MOVE_HOME_LOGIN:
        return changingSignins(
          moveHomeLogin(args[0] as string, args[1] as AccountIdentity)
        );
      case CONTROL_JOIN_ACCOUNT_LOGIN:
        return changingSignins(
          joinAccountLogin(
            args[0] as string,
            args[1] as string,
            args[2] as AccountIdentity
          )
        );
      case "unlockKeychain": {
        await unlockKeychain(args[0] as string);
        this.auth = await claudeAuth(await accountReports());
        return this.auth;
      }
      default:
        return undefined;
    }
  }

  syncFleet(config: import("@cawco/core").FleetConfig) {
    return syncFleetConfig(config);
  }

  fleetStatus() {
    return fleetStatus();
  }

  fleetHoldings() {
    return fleetHoldings();
  }
}

export const claudeHarness: Harness = new ClaudeHarness();
