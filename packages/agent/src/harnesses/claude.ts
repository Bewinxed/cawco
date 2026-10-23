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

import type { Dirent } from "node:fs";
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
import { constants as osConstants } from "node:os";
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
  type Options as SdkOptions,
  type SessionStore,
  type SessionStoreEntry,
  type Settings,
  tagSession,
} from "@anthropic-ai/claude-agent-sdk";
import type {
  AccountIdentity,
  AccountKind,
  AuthState,
  EffortLevel,
  EndedTask,
  FleetMcpChange,
  HarnessCapabilities,
  MachineHarnessReport,
  ModelInfo,
  MoveEnded,
  NeutralMessage,
  NeutralSessionInfo,
  SendPayload,
  SentMessage,
  SessionInstruction,
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
  CLAUDE_SETTINGS_REFUSED,
  CONTROL_BEGIN_ACCOUNT_LOGIN,
  CONTROL_COMPLETE_ACCOUNT_LOGIN,
  CONTROL_CONTEXT_USAGE,
  CONTROL_FLEET_SETTINGS,
  CONTROL_FORGET_ACCOUNT,
  CONTROL_INTERRUPT,
  CONTROL_JOIN_ACCOUNT_LOGIN,
  CONTROL_MCP_FLEET_CHANGED,
  CONTROL_MCP_FLEET_HEAL,
  CONTROL_MOVE_HOME_LOGIN,
  CONTROL_PROBE_ACCOUNT,
  CONTROL_READ_HOME_LOGIN,
  CONTROL_READ_SESSION_CONTEXT,
  CONTROL_SET_EFFORT,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_WITHDRAW_SEND,
  configurePage,
  conversationGone,
  EFFORT_READ,
  HOOK_INPUT_EVENTS,
  harnessWords,
  INSPECT_CONFIG,
  INSTALL_SESSION_CREDENTIAL,
  identityOf,
  LEAD_GATED_TOOLS,
  MESSAGES_HELD,
  MESSAGES_READ,
  type OfferedMode,
  offeredMode,
  PERMISSION_MODES,
  type PermissionMode,
  RATE_LIMIT_READ,
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  resumeCursor,
  SESSION_DIR_READ,
  SESSION_STOPPED,
  settledQuestionResult,
  VERIFY_SESSION_CREDENTIAL,
} from "@cawco/core";
import type { RestartHold } from "@cawco/core/binary-updates";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import {
  accountConfigDir,
  accountIds,
  claudeConfigDirs,
  claudeHome,
  projectSlug,
  sessionConfigDir,
} from "@cawco/core/paths";
import { sessionEnvironment } from "@cawco/core/session-env";
import { isDamagedRecord } from "@cawco/core/state-file";
import {
  completeLines,
  lineRecords,
  newStats,
  parseRecords,
} from "@cawco/jsonl-parser";
import {
  accountEnv,
  accountReports,
  changingSignins,
  claudeSignins,
  dirIdentity,
  linkProjectMemory,
  probeAccount,
  projectMemoryRoot,
} from "../accounts";
import { CLAUDE_NOT_INSTALLED, resolveClaudeExecutable } from "../auth";
import {
  claudeBoundaryOptions,
  hookFailsOpen,
  hookMissing,
  type LaunchedHook,
  launchedHook,
  workspaceHook,
} from "../boundary";
import { CHROME_DEVTOOLS, throughGate } from "../browser/door";
import { CLAUDE_QUIET_ENV } from "../claude-env";
import {
  mcpConfigOffArgv,
  removeMcpConfig,
  removeMcpConfigsOf,
  sweepMcpConfigs,
} from "../claude-mcp-config";
import { carrySessions, transcriptIn } from "../claude-sessions";
import {
  claudeHostVersion,
  claudeToStart,
  INITIALIZE_SAYS_VERSION_FROM,
  versionRefusal,
} from "../claude-version";
import { reportDamaged } from "../damaged-records";
import { delegationMcp, MCP_SERVER_NAME } from "../delegation";
import { sessionFleetDenials } from "../denied-tools";
import {
  fleetHoldings,
  fleetStatus,
  inspectConfig,
  readHookScript,
  readMemoryFile,
  readSkillFiles,
  syncFleetConfig,
} from "../fleet";
import {
  configAt,
  type FleetHarnessSet,
  placedAt,
  readFleetHarnessSet,
  type SetHook,
} from "../fleet-harness-set";
import { guardedHandler } from "../fleet-hook-guard";
import { proxiedFleetMcpUrl, proxiedToolCount } from "../fleet-mcp-listing";
import { fleetMcpAt, readFleetMcpSet } from "../fleet-mcp-set";
import { sessionGitEnv } from "../git-credential";
import {
  type Harness,
  type HarnessContext,
  type HarnessSession,
  HeldProcessRefused,
  type TurnExtras,
} from "../harness";
import { HUB_AWAY_BOUND_MS } from "../hub-away";
import { type HeldProc, KeeperPool, type KeeperReading } from "../keepers";
import {
  beginAccountLogin,
  completeAccountLogin,
  forgetAccount,
} from "../login";
import { throughMcpGate } from "../mcp-gate";
import { CLAUDE_MCP_ENV } from "../mcp-status";
import {
  homeLoginMovedInto,
  joinAccountLogin,
  moveHomeLogin,
  readHomeLogin,
} from "../move-login";
import { probeStarted } from "../probe-count";
import { parseProcId, procIdFor } from "../proc-id";
import { redactText } from "../redaction";
// Type-only, and deliberately so: `session.ts` imports the harness registry
// this file is part of, so a value import here would close a module cycle.
import type { SessiondAwareContext } from "../session";
import {
  acknowledgeSessionCredential,
  CredentialUnknown,
} from "../session-identity";
import {
  type BridgeRing,
  endProc,
  type ProcessExit,
  procEpoch,
  type SessiondClient,
  sessiondBridge,
} from "../sessiond-client";
import { ChildActivity, type RingLine, readRing } from "../sessiond-custody";
import { sawTool } from "../tools";
import {
  forgetWakeups,
  keepWakeups,
  keptWakeups,
  type Wakeups,
  writtenAt,
} from "../wakeups";
import {
  hookFailureId,
  readSessionContext,
  readSessionEnd,
  readSessionFull,
  readSessionWhole,
  type SDKSessionMessage,
  withHarnessNote,
} from "./claude-transcript";
import { tailLines } from "./transcript-tail";

/**
 * The signal a CLI's end names or encodes, as sessiond reaped it: the signal
 * that ended it, or an exit over 128, a signal the CLI caught and exited on
 * (128 + its number: SIGTERM is 143). Undefined for an exit of its own.
 */
export const signalOfExit = ({
  code,
  signal,
}: ProcessExit): string | undefined => {
  if (signal) {
    return signal;
  }
  if (!(code !== null && code > 128)) {
    return;
  }
  return Object.entries(osConstants.signals).find(
    ([, number]) => number === code - 128
  )?.[0];
};

/** How much of what a CLI said on stderr its row quotes: its last lines, up to this many characters. Ours: a sentence or three. */
const STDERR_QUOTED_CHARS = 600;

/**
 * What a CLI that ended said last on stderr, as its row quotes it: the tail
 * its keeper kept (sessiond server.ts `STDERR_TAIL_BYTES`), its last lines
 * up to {@link STDERR_QUOTED_CHARS}, on one line, and redacted as everything
 * the agent says is (redaction.ts `redactText`). Undefined when it said
 * nothing there.
 */
export const stderrSaid = (stderr: string | undefined): string | undefined => {
  const lines = (stderr ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const kept: string[] = [];
  let length = 0;
  for (const line of lines.reverse()) {
    if (kept.length > 0 && length + line.length > STDERR_QUOTED_CHARS) {
      break;
    }
    kept.unshift(line);
    length += line.length + 1;
  }
  const said = kept.join(" ").slice(-STDERR_QUOTED_CHARS);
  return said ? redactText(said) : undefined;
};

/**
 * A Claude Code process's end told to its session, read off how sessiond
 * reaped it (`exit`, the bridge's {@link ProcessExit}), never off the SDK's
 * words: a signal (named, or an exit over 128) is a death the supervisor
 * attributes, to its own stop or to something outside CawCo; any other exit
 * of a resumed conversation whose transcript is no longer there
 * (`conversationKept`) is that conversation gone; any other is the CLI ending
 * on its own, in the last of what it said on stderr (`exit.stderr`, which
 * its keeper kept), or as one that said nothing. Never a bare exit code. An
 * error with no exit behind it (a keeper's refusal, a lost ring, a spawn
 * that never ran) is not a process end, and is said as it is.
 */
export const processEnded = async (
  ctx: Pick<HarnessContext, "died" | "failed">,
  error: unknown,
  exit: ProcessExit | undefined,
  conversationKept: (() => Promise<boolean>) | undefined
): Promise<void> => {
  if (!exit || exit.code === 0) {
    ctx.failed(error);
    return;
  }
  const signal = signalOfExit(exit);
  if (signal) {
    if (ctx.died) {
      ctx.died(signal, error);
    } else {
      ctx.failed(new Error(`Claude Code's process was ended by ${signal}.`));
    }
    return;
  }
  if (conversationKept && !(await conversationKept())) {
    ctx.failed(conversationGone());
    return;
  }
  const said = stderrSaid(exit.stderr);
  ctx.failed(
    new Error(
      said && exit.code !== null
        ? harnessWords.claudeExited(exit.code, said)
        : harnessWords.claudeCrashed
    )
  );
};

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
      case "cancelled":
      case "completed":
        break;
    }
    return null;
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
  // A notice of the CLI's in the user's role is typed here, where its markup
  // is read once (claude-transcript.ts `harnessNoteOf`), as a stored read
  // types it.
  if (sdk.type === "user") {
    return {
      ...sdk,
      message: withHarnessNote(sdk.message),
      raw: sdk,
    } as unknown as NeutralMessage;
  }
  if (
    sdk.type === "assistant" ||
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
      `This Claude session has no account to run on. Add one in ${configurePage("accounts")} and sign it in on this machine.`
    );
  }
  return (await homeLoginMovedInto(move.accountId))
    ? move.accountId
    : undefined;
}

const NEWLINE = 10;

/**
 * The records in the whole lines of `bytes`, read from `file`, by the one
 * rule every transcript read here follows ({@link parseRecords}): a live
 * session may be mid-write, so a last line without its newline is not read
 * yet, and what an unclean stop left of a record (a range of NUL bytes, a
 * record's broken end) is counted and skipped, never thrown. Thrown, one
 * such line in a 45 MB transcript made every read of its session fail with
 * `JSON Parse error: Unrecognized token`, continue_session included.
 */
const wholeLines = (bytes: Uint8Array, file: string): SessionStoreEntry[] => {
  const stats = newStats();
  const entries = Array.from(
    parseRecords(completeLines(bytes), { stats }),
    ({ record }) => record as unknown as SessionStoreEntry
  );
  if (stats.invalid > 0) {
    console.warn(
      `[claude] ${file}: skipped ${stats.invalid} damaged record${stats.invalid === 1 ? "" : "s"} in ${stats.lines} lines`
    );
  }
  return entries;
};

const wholeTranscript = async (file: string): Promise<SessionStoreEntry[]> =>
  wholeLines(await readFile(file), file);

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
      return wholeLines(await handle.readFile(), file);
    }
    const head = Buffer.alloc(LISTING_END_BYTES);
    const tail = Buffer.alloc(LISTING_END_BYTES);
    await handle.read(head, 0, LISTING_END_BYTES, 0);
    await handle.read(tail, 0, LISTING_END_BYTES, size - LISTING_END_BYTES);
    // The tail starts mid-line: its first whole line follows the first break.
    return [
      ...wholeLines(head, file),
      ...wholeLines(tail.subarray(tail.indexOf(NEWLINE) + 1), file),
    ];
  } finally {
    await handle.close();
  }
};

/**
 * How many transcripts a listing reads at once. Each read holds a
 * transcript's two 64 KiB ends as bytes, as text and as parsed lines; read
 * all at once, one listing of 1,500 transcripts took the agent to 977 MB RSS,
 * and it kept 932 MB after (measured on a rig at obelisk's scale).
 */
const LISTING_READS = 8;

/** `read` over every item, at most {@link LISTING_READS} at a time; results in order. */
const listingRead = async <T, R>(
  items: readonly T[],
  read: (item: T) => Promise<R>
): Promise<R[]> => {
  const results = new Array<R>(items.length);
  let next = 0;
  const reader = async (): Promise<void> => {
    while (next < items.length) {
      const index = next;
      next += 1;
      // biome-ignore lint/performance/noAwaitInLoops: the reader takes the next transcript only once this one is read; that is the bound
      results[index] = await read(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LISTING_READS, items.length) }, reader)
  );
  return results;
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
const sessionInfoAt = async (
  file: string,
  sessionId: string,
  read: (file: string) => Promise<SessionStoreEntry[]> = wholeTranscript
): Promise<SDKSessionInfo | undefined> => {
  let modified: number;
  try {
    modified = (await stat(file)).mtimeMs;
  } catch (error) {
    if (missing(error)) {
      return;
    }
    throw error;
  }
  const info = await getSessionInfo(sessionId, {
    sessionStore: transcriptStore(file, read),
  });
  // A store has no modification time to give, so the SDK's answer says when
  // it was read: the transcript's own is what the SDK's listing reports.
  // And a copy in strings of its own: each field the SDK read off the
  // transcript shares the decoded text it was parsed from, so keeping a field
  // kept that text (130 MB across 1,500 listed sessions, measured).
  return (
    info && { ...structuredClone(info), lastModified: Math.floor(modified) }
  );
};

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
  permissionModes: [...PERMISSION_MODES],
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
  #closed = false;

  /** Hands one turn to the SDK, or keeps it for the SDK's next pull; none once {@link close}d. */
  push(message: SDKUserMessage): void {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: #closed is set true by close() elsewhere in this class; the checker doesn't see that cross-method mutation
    if (this.#closed) {
      return;
    }
    const waiting = this.#waiting;
    if (waiting) {
      this.#waiting = null;
      waiting({ done: false, value: message });
      return;
    }
    this.#queue.push(message);
  }

  /**
   * Takes no more turns, and keeps the CLI's stdin open: the SDK closes it
   * once the stream {@link end}s and the run has ended ("Calling
   * transport.endInput() to close stdin to CLI process", sdk.mjs 0.3.302),
   * and a control request still unanswered then is never answered.
   */
  close(): void {
    this.#closed = true;
  }

  end(): void {
    this.#closed = true;
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

/**
 * The tools whose running call the CLI can move to the background: its shell
 * commands and its subagents ("Background in-flight foreground tasks (Bash
 * commands and subagents)", `Query.backgroundTasks`, sdk.d.ts 0.3.296).
 * `Task` is the subagent tool's former name.
 */
const BACKGROUNDABLE_TOOLS = new Set(["Bash", "PowerShell", "Agent", "Task"]);

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

  /** The end of the turn in flight, given `ms`: `unanswered` while it still runs after them. */
  settle(ms: number): Promise<Bounded<void>> {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: busy is set true by start() elsewhere in this class; the checker doesn't see that cross-method mutation
    if (!this.busy) {
      return Promise.resolve({ kind: "answered", value: undefined });
    }
    const ended = this.#ended.promise;
    return readWithin(ms, () => ended);
  }
}

const SETTLE_TIMEOUT_MS = 5000;

/**
 * Why a held child the hub no longer knows was stopped, in the error formula
 * (WORDS.md): what happened, why, what is safe, what starts it again. A
 * person's message starts a failed session afresh, on a credential the hub
 * grants as it starts.
 */
const CREDENTIAL_REFUSED_WORDS =
  "CawCo stopped this session: the hub no longer knows the credential its Claude Code was started with, so its CawCo tools (reports, handoffs, finishing its work) could not reach the hub. Its conversation is kept. Send it a message to start it again on a fresh credential.";

/** How long the CLI waits on the `Stop` hook this adapter registers, in seconds. */
const STOP_HOOK_TIMEOUT_S = 5;

/**
 * How long an attached session whose scheduled wake-ups are not known must
 * have been at rest before it counts as having none: a day and an hour. A
 * self-paced wake-up fires within an hour (`ScheduleWakeup` clamps its delay
 * to 3600s), and a recurring task at an interval of a day or less fires
 * within the day; one scheduled further out is kept by the conversation
 * ("Resuming with `--resume` or `--continue` brings back any task that
 * hasn't expired", code.claude.com/docs/en/scheduled-tasks), so a session
 * put to sleep runs it once it is woken.
 */
const WAKEUPS_DECIDED_MS = 25 * 3_600_000;

/** How long a move's stop waits for the CLI to read one background task's output before it ends the process ({@link ClaudeSession.endedForMove}). */
const TASK_OUTPUT_READ_MS = 3000;

/**
 * When an attached session whose wake-ups neither the ring nor the record
 * kept says last wrote its conversation: since then no turn of it has ended
 * to say them. Undefined when its conversation is not found.
 */
const restingSince = async (
  sessionId: string | null,
  cwd: string
): Promise<number | undefined> => {
  const transcript = sessionId ? await claudeSessionFile(sessionId, cwd) : null;
  return transcript ? await writtenAt(transcript) : undefined;
};

/**
 * An attached session's wake-ups: the ring's, else its kept record's, else
 * none known since its conversation last moved ({@link restingSince}). A
 * damaged record is not none: it is reported, and its wake-ups are not
 * known until its next turn ends (which writes the record whole again);
 * nothing reads them from elsewhere meanwhile.
 */
const adoptKeptWakeups = async (
  session: ClaudeSession,
  ring: Wakeups | undefined,
  sessionId: string | null,
  cwd: string
): Promise<void> => {
  if (ring) {
    session.adoptWakeups(ring);
    return;
  }
  let kept: Wakeups | undefined;
  try {
    kept = await keptWakeups(session.instanceId);
  } catch (error) {
    if (!isDamagedRecord(error)) {
      throw error;
    }
    await reportDamaged(error);
    session.adoptWakeups(undefined);
    return;
  }
  session.adoptWakeups(
    kept,
    kept === undefined ? await restingSince(sessionId, cwd) : undefined
  );
};

/**
 * The wake-ups a `Stop` hook's input says the session has scheduled
 * (`session_crons`: "Session-scoped cron tasks (CronCreate, ScheduleWakeup,
 * /loop) that will wake this session later. Empty array when none are
 * scheduled", sdk.d.ts), and how many of them fire once (`recurring`: "False
 * for one-shot wakeups"); an entry that does not say counts as one-shot.
 * `undefined` when the input is not a `Stop` hook's or carries no list.
 */
const scheduledWakeups = (input: unknown): Wakeups | undefined => {
  const { hook_event_name, session_crons } = (input ?? {}) as {
    hook_event_name?: unknown;
    session_crons?: unknown;
  };
  if (!(hook_event_name === "Stop" && Array.isArray(session_crons))) {
    return undefined;
  }
  return {
    all: session_crons.length,
    once: session_crons.filter(
      (cron: unknown) =>
        (cron as { recurring?: unknown } | null)?.recurring !== true
    ).length,
  };
};

/**
 * The CLI child's environment: the agent's own as a session gets it (core
 * `sessionEnvironment`), the spec's over it, a workspace session's temp root
 * and shell prefix, and the session's own identity.
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
export const sessionEnv = (
  specEnv: Record<string, string | undefined> | undefined,
  ctx: Pick<
    HarnessContext,
    "boundary" | "containerEnv" | "instanceId" | "sessionCredential"
  >,
  root: boolean = runsAsRoot()
): Record<string, string | undefined> => ({
  // The fleet's MCP connect window (mcp-status.ts), under the agent's own env.
  ...CLAUDE_MCP_ENV,
  ...sessionEnvironment(process.env),
  CLAUDE_CHROME_CLASSIFIER_FLOOR: "0",
  ...specEnv,
  // A workspace session's temp root, which its shell reads inside the
  // boundary (boundary.ts `Boundary.claudeTmp`). The CLI's root is
  // `CLAUDE_CODE_TMPDIR`, else `os.tmpdir()` ("function um(){…let
  // e=a.CLAUDE_CODE_TMPDIR;if(e)return e;return C()}", Claude Code 2.1.302),
  // and a background task's output is `<root>/claude-<uid>/…/tasks/<id>.output`:
  // under the host's /tmp, which the boundary hides, the shell found "No such
  // file or directory" for every one (leaf 74ec1894, 2026-10-19).
  // And its shell prefix (boundary.ts `claudePrefixScript`): every shell
  // command, shell-form hook and stdio MCP start of the CLI runs inside the
  // boundary, after the CLI's permission rules have judged the command as
  // the model wrote it.
  ...(ctx.boundary
    ? {
        CLAUDE_CODE_TMPDIR: ctx.boundary.claudeTmp,
        CLAUDE_CODE_SHELL_PREFIX: ctx.boundary.prefix,
      }
    : {}),
  // The session's git reaches the hub's remote as this session (git-credential.ts).
  ...sessionGitEnv({ ...process.env, ...specEnv }),
  // Its container runtimes through its own doors (session-containers.ts):
  // what its work starts there stops as it ends.
  ...ctx.containerEnv,
  // The session's shell acts as this session and no other: `cawco tool`
  // there sends the credential its CawCo MCP sends.
  [CAWCO_ENV.instanceId]: ctx.instanceId,
  ...(ctx.sessionCredential
    ? { [CAWCO_ENV.sessionCredential]: ctx.sessionCredential }
    : {}),
  // Said as root alone, whatever the agent's own env says ({@link
  // CLAUDE_ROOT_SANDBOX}).
  [CLAUDE_ROOT_SANDBOX]: root ? "1" : undefined,
  // Last: the silent-turn reminder stays off whatever the spec or the
  // person's env says.
  ...CLAUDE_QUIET_ENV,
});

/** Whether this agent, and so every CLI it starts, runs as root ({@link CLAUDE_ROOT_SANDBOX}). */
const runsAsRoot = (): boolean =>
  process.platform !== "win32" && process.getuid?.() === 0;

/**
 * CLAUDE CODE'S ROOT RULE, and how CawCo meets it. The CLI exits at once as
 * root when it is launched in bypass or with bypass allowed, unless
 * `IS_SANDBOX` is "1" or it runs in bubblewrap: "if(s==="bypassPermissions"
 * ||r){if(typeof process.getuid==="function"&&process.getuid()===0&&
 * process.env.IS_SANDBOX!=="1"&&!a.CLAUDE_CODE_BUBBLEWRAP)console.error(
 * "--dangerously-skip-permissions cannot be used with root/sudo privileges
 * for security reasons")…process.exit(1)}", and its own check
 * "isRootOutsideDeliberateSandbox(){return this.sources.platform!=="win32"
 * &&this.sources.getuid()===0&&!this.sources.isSandboxEnvSet()&&
 * !this.sources.isBubblewrapEnvSet()}" with "isSandboxEnvSet:()=>
 * process.env.IS_SANDBOX==="1"" (Claude Code 2.1.302's bundle; `r` is the
 * launch's `allowDangerouslySkipPermissions`). A machine whose agent runs as
 * root is one the owner chose to give his sessions root on, and its
 * sessions have the access a session he starts there has (the owner,
 * 2026-10-23: "IS_SANDBOX for Claude", full root access for the session).
 * So as root every Claude session gets `IS_SANDBOX=1` ({@link sessionEnv}),
 * in a workspace's boundary and on the host alike, and starts in every mode
 * with bypass allowed. Not as root the variable is left unset, whatever the
 * agent's own environment says.
 */
const CLAUDE_ROOT_SANDBOX = "IS_SANDBOX";

/** The `canUseTool` callback, parked until `resolvePermission` answers it. */
type PermissionResolver = (result: PermissionResult) => void;

/** CawCo's `fullSend` is the CLI's `bypassPermissions`: the SDK never sees CawCo's own mode. */
const sdkMode = (
  mode: PermissionMode
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
    import("@anthropic-ai/claude-agent-sdk").PermissionMode | undefined {
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
  get reported(): PermissionMode | undefined {
    return this.#fullSend ? "fullSend" : this.#cli;
  }

  /**
   * Whether an ask is answered here rather than put to the owner: Full Send,
   * with the CLI in bypass, approves every one (the owner, 2026-10-22: "FULL
   * SEND LITERALLY MEANS FULL SEND"): the CLI's safety checks, a plan
   * approval, an ask his own `permissions.ask` rule forced. Never a question
   * to him, which needs his answer, and never a project's Caw's shell or
   * edit call (`lead`, {@link LEAD_SETTINGS}): the hub's gate decides those.
   * The CLI does not say which rule forced an ask (no `matchedAskRule` on a
   * rule's own ask, 2.1.302), so the lead's calls are known by the tool.
   */
  answersHostSide(toolName: string, lead: boolean): boolean {
    return (
      this.#fullSend &&
      this.#cli === "bypassPermissions" &&
      toolName !== ASK_USER_QUESTION &&
      !(lead && LEAD_GATED_ON_CLAUDE.has(toolName))
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
    matchedAskRule?: { source: string };
  },
  answered: boolean
): string =>
  `[claude] permission asked: ${toolName}${decisionReason ? ` — ${decisionReason}` : ""}${blockedPath ? ` (path ${blockedPath})` : ""}${matchedAskRule ? ` [ask rule: ${matchedAskRule.source}]` : ""}${answered ? " [full send: answered]" : ""}`;

/** Whether an SDK frame is the main loop's word on its mode: an `init`, or a `status` that names one. */
const modeFrame = (
  message: SDKMessage
): message is Extract<SDKMessage, { subtype: "init" | "status" }> =>
  message.type === "system" &&
  (message.subtype === "init" || message.subtype === "status") &&
  !(message as { parent_tool_use_id?: string | null }).parent_tool_use_id;

/**
 * A workspace session's scratch as one of its working directories, so an MCP
 * server that writes only inside its roots (chrome-devtools-mcp's captures)
 * writes there as well as in the clone: "Claude Code answers `roots/list`
 * with the session's launch directory plus every additional working
 * directory you've granted with `--add-dir`, `/add-dir`, or the
 * `additionalDirectories` setting" (code.claude.com/docs/en/mcp, v2.1.203
 * on).
 */
const scratchDirectory = (boundary: HarnessContext["boundary"]) =>
  boundary ? { additionalDirectories: [boundary.scratch] } : {};

/**
 * Flag settings every session launches with, merged with a workspace's
 * boundary hook into the one `--settings` the CLI is given.
 *
 * `totalTokensReminder: "off"`: Claude Code puts the request's last cache
 * breakpoint on the trailing `<total_tokens>` system message, and the entry
 * written there is never matched by the next request, so every tool-less turn
 * re-writes the whole conversation (anthropics/claude-code#96101, open on
 * 2.1.296: "`--settings '{"totalTokensReminder":"off"}'` … none [cache
 * misses] from turn 3 on"). Remove this once #96101 is fixed upstream.
 */
const SESSION_SETTINGS = { totalTokensReminder: "off" } as const;

/**
 * Flag settings a fenced session (a memory curator or fleet-watch triage
 * run, {@link SpawnPayload.fence}) launches with besides: no claude.ai
 * account connectors. `strictMcpConfig` keeps every other MCP source out
 * ("Only use MCP servers passed via the `mcpServers` option … ignoring all
 * other MCP configurations: project `.mcp.json`, user settings, plugins, and
 * on-disk agent frontmatter", sdk.d.ts 0.3.296), but the connectors are
 * fetched from the account, not read from a config: "When true in any
 * settings source, claude.ai MCP cloud connectors are not auto-fetched or
 * connected" (`disableClaudeAiConnectors`, sdk.d.ts 0.3.296). The CLI's fetch
 * returns none on it: `w=jue();if(S||w)return t(\`[claudeai-mcp] Disabled via
 * ${S?"env var":"disableClaudeAiConnectors setting"}\`)…{}` (2.1.296).
 */
const FENCE_SETTINGS = { disableClaudeAiConnectors: true } as const;

/**
 * Flag settings a project's Caw launches with besides
 * ({@link SpawnPayload.lead}): an `ask` rule on each of his shell and edit
 * tools, so every call of one is put to the hub (`canUseTool`, then the
 * hub's gate, lead-gate.ts) whatever his mode: "If an ask rule matches, the
 * call falls through to your `canUseTool` callback for confirmation, even in
 * `bypassPermissions` mode" (code.claude.com/docs/en/agent-sdk/permissions).
 * Full Send never answers one of his gated calls ({@link SessionMode}). Flag
 * settings outrank every settings file, so none in his place turns it off.
 */
const LEAD_SETTINGS: { permissions: { ask: string[] } } = {
  permissions: { ask: [...LEAD_GATED_TOOLS.claude] },
};

/** Caw's gated tools on Claude Code, by the CLI's names ({@link LEAD_SETTINGS}). */
const LEAD_GATED_ON_CLAUDE: ReadonlySet<string> = new Set(
  LEAD_GATED_TOOLS.claude
);

/** The `hooks` of flag settings, by event. */
type FlagHooks = NonNullable<Settings["hooks"]>;
/** One matcher's entry of a `hooks` event, as flag settings hold it. */
type FlagHookEntry = FlagHooks[string][number];

/**
 * A project's hooks as flag settings hold them, by event: each copy placed
 * at the session's folder (fleet-harness-set.ts `placedAt`), its own entry
 * under its matcher, in the order the set holds them.
 *
 * Written so no entry reads as the boundary's when an agent adopts the CLI
 * (boundary.ts `launchedHook`, which takes the first `"matcher":…,"hooks":
 * [{"type":"command","command":…` on the boundary's matchers for its hook,
 * and stops a CLI whose hook it cannot read): a matcher of every tool is
 * left out, as Claude Code reads an absent one ("If you omit the matcher or
 * use `"*"`, the group activates on every occurrence of the event",
 * code.claude.com/docs/en/hooks), and each handler's `type` comes after its
 * other fields.
 *
 * Each runs through CawCo's guard (fleet-hook-guard.ts), told in a
 * workspace session (`bounded`) to drop the hook's input rewrite: the
 * boundary judged the call as asked. An MCP tool hook, whose reply only
 * Claude Code reads, is not given to a workspace session on an event whose
 * reply can rewrite input (core `hookWorkspaceNote`).
 */
const placedHookEntries = (
  hooks: readonly SetHook[],
  bounded: boolean
): FlagHooks => {
  const byEvent: FlagHooks = {};
  for (const hook of hooks) {
    if (
      bounded &&
      hook.handler.type === "mcp_tool" &&
      HOOK_INPUT_EVENTS.includes(hook.event)
    ) {
      continue;
    }
    const { type, ...fields } = guardedHandler(hook.handler, bounded);
    const handler = { ...fields, type } as FlagHookEntry["hooks"][number];
    const matcher = hook.matcher?.trim();
    byEvent[hook.event] = [
      ...(byEvent[hook.event] ?? []),
      matcher && matcher !== "*"
        ? { matcher, hooks: [handler] }
        : { hooks: [handler] },
    ];
  }
  return byEvent;
};

/**
 * {@link claudeBoundaryOptions} with {@link SESSION_SETTINGS} in its
 * `settings` over the fleet's Claude Code settings (`fleetSettings`), the
 * project's hooks placed at the session's folder (`placed`,
 * fleet-harness-set.ts) joined to the boundary's, and a lead's
 * {@link LEAD_SETTINGS} or a fenced session's {@link FENCE_SETTINGS} over
 * them. The boundary's `PreToolUse` entry comes last of that event's. The
 * order decides no verdict: "When an event fires, Claude Code runs the
 * matching hooks in parallel", and "For `PreToolUse` permission decisions,
 * the most restrictive answer applies" (code.claude.com/docs/en/hooks-guide),
 * so the boundary's deny refuses the call whatever a placed hook answers.
 * Nor does it order rewrites: "When multiple `PreToolUse` hooks return
 * `updatedInput` …, the last one to finish takes effect" (same page), each
 * hook having been handed the call's original input (anthropics/claude-code#83353).
 */
const sessionSettingsOptions = (
  boundary: HarnessContext["boundary"],
  lead: boolean,
  fence: boolean,
  placed: readonly SetHook[],
  fleetSettings: Record<string, unknown>
) => {
  const bounded = claudeBoundaryOptions(boundary);
  // A boundary's settings carry its `hooks`; no boundary, none.
  const own =
    (bounded as { settings?: { hooks?: FlagHooks } }).settings?.hooks ?? {};
  const hooks: FlagHooks = placedHookEntries(placed, boundary !== undefined);
  for (const [event, entries] of Object.entries(own)) {
    hooks[event] = [...(hooks[event] ?? []), ...entries];
  }
  return {
    ...bounded,
    settings: {
      // The fleet's and the folder's project's settings, under every key
      // CawCo sets itself ({@link launchedSettings}).
      ...fleetSettings,
      ...SESSION_SETTINGS,
      ...("settings" in bounded ? bounded.settings : {}),
      ...(Object.keys(hooks).length > 0 ? { hooks } : {}),
      ...(lead ? LEAD_SETTINGS : {}),
      ...(fence ? FENCE_SETTINGS : {}),
    },
  };
};

/**
 * What a client dials for one MCP server config, as the CLI reports it in
 * `mcpServerStatus` and as `.claude.json` holds it: two that read the same
 * here make the same connection.
 */
const dialed = (config: unknown): string => {
  const c = (config ?? {}) as {
    type?: string;
    url?: string;
    headers?: Record<string, string>;
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  };
  return JSON.stringify(
    c.url === undefined
      ? { command: c.command, args: c.args ?? [], env: c.env ?? {} }
      : { type: c.type, url: c.url, headers: c.headers ?? {} }
  );
};

/** What one fleet MCP change came to in a session. */
interface FleetMcpOutcome {
  error?: string;
  kind: FleetMcpChange["kind"];
  name: string;
  /** The CLI's word for it afterwards, `gone`, or why it was kept as it was. */
  status: string;
  tools?: number;
}

const outcomeLine = ({ name, kind, status, tools, error }: FleetMcpOutcome) =>
  `${name} ${kind}: ${status}${tools === undefined ? "" : ` (${tools} tools)`}${error ? ` — ${error}` : ""}`;

/**
 * How a session takes fleet MCP changes (`ClaudeSession.#takeFleetMcp`).
 * `setMcpServers` governs only the servers it has been sent (CLI 2.1.302: a
 * server the launch or a config file gave stays whatever a call leaves out;
 * one a call named is replaced by the next call that names it, and dropped
 * by the next that leaves it out), so the plan tells the fleet servers this
 * session named in it (`owned`: every one since it started) from any it
 * holds otherwise, as a session started before the fleet's servers left the
 * config files does:
 * - `dynamic`, the whole set `setMcpServers` is to hold, each as the fleet
 *   has it: the owned servers the fleet still names, a server the session
 *   lacks, and one held otherwise whose dialled config changed;
 * - `leaving`, servers held otherwise the fleet no longer names, with the
 *   config the session holds: named once in `setMcpServers`, then left out;
 * - `redial`, servers kept on the config they have, dialled again;
 * - `kept`, servers left as they are, with why.
 */
const planFleetMcp = (
  changes: readonly FleetMcpChange[],
  configured: Record<string, McpServerConfig>,
  before: readonly McpServerStatus[],
  launch: ReadonlySet<string>,
  owned: ReadonlySet<string>
) => {
  const held = new Map(before.map((server) => [server.name, server]));
  const dynamic = new Map(
    before.flatMap((server) =>
      owned.has(server.name) && configured[server.name]
        ? [[server.name, configured[server.name]] as const]
        : []
    )
  ) as Map<string, McpServerConfig>;
  const leaving: Record<string, McpServerConfig> = {};
  const redial = new Set<string>();
  const kept = new Map<string, string>();
  for (const { name, kind } of changes) {
    const step: FleetMcpStep = launch.has(name)
      ? { do: "keep", why: "launched with this session" }
      : fleetMcpStep(kind, configured[name], held.get(name), owned.has(name));
    if (step.do === "keep") {
      kept.set(name, step.why);
    } else if (step.do === "leave") {
      leaving[name] = step.config;
    } else {
      if (step.do === "set") {
        dynamic.set(name, step.config);
      }
      if (step.redial) {
        redial.add(name);
      }
    }
  }
  return { dynamic, leaving, redial, kept };
};

type FleetMcpStep =
  | { do: "keep"; why: string }
  | { do: "leave"; config: McpServerConfig }
  | { do: "set"; config: McpServerConfig; redial: boolean }
  | { do: "hold"; redial: boolean };

/** What one change asks of one server a session holds (`has`) or lacks, the fleet wanting `wanted`; `owned`: named in `setMcpServers` before. */
const fleetMcpStep = (
  kind: FleetMcpChange["kind"],
  wanted: McpServerConfig | undefined,
  has: McpServerStatus | undefined,
  owned: boolean
): FleetMcpStep => {
  const again =
    kind === "signed-in" ||
    kind === "signed-out" ||
    (has !== undefined && has.status !== "connected");
  if (!wanted) {
    if (!has || owned) {
      // Not here, or `setMcpServers` holds it and drops it with the fleet.
      return { do: "hold", redial: false };
    }
    return has.config
      ? { do: "leave", config: has.config as McpServerConfig }
      : { do: "keep", why: "its CLI reports no config to replace it with" };
  }
  if (has?.status === "disabled") {
    return { do: "keep", why: "turned off in this session" };
  }
  if (!has || owned) {
    return { do: "set", config: wanted, redial: has !== undefined && again };
  }
  if (kind === "config" || dialed(has.config) !== dialed(wanted)) {
    return { do: "set", config: wanted, redial: false };
  }
  return { do: "hold", redial: again };
};

type SystemPrompt = NonNullable<SdkOptions["systemPrompt"]>;

/**
 * The fleet's role-scoped memory documents as one block of a system prompt,
 * each under the path it has in the fleet, as Claude Code itself heads a
 * CLAUDE.md it loads ("Contents of <path> (…)").
 */
const instructionsBlock = (
  instructions: readonly SessionInstruction[]
): string =>
  instructions
    .map(
      ({ path, content }) =>
        `Contents of the fleet's memory document ${path} (CawCo loads it for sessions like this one):\n\n${content.trim()}`
    )
    .join("\n\n");

/**
 * The session's system prompt with its scoped memory documents after
 * whatever the caller gave: Claude Code's own prompt with them appended
 * when the caller gave none, or after the caller's own append or prompt.
 */
const withInstructions = (
  given: SystemPrompt | undefined,
  instructions: readonly SessionInstruction[]
): SystemPrompt => {
  const block = instructionsBlock(instructions);
  if (given === undefined) {
    return { type: "preset", preset: "claude_code", append: block };
  }
  if (typeof given === "string") {
    return `${given}\n\n${block}`;
  }
  if (Array.isArray(given)) {
    return [...given, block];
  }
  if (given.type === "preset") {
    return {
      ...given,
      append: given.append ? `${given.append}\n\n${block}` : block,
    };
  }
  return {
    ...given,
    prompt: Array.isArray(given.prompt)
      ? [...given.prompt, block]
      : `${given.prompt}\n\n${block}`,
  };
};

/**
 * The fleet's MCP servers a session in `workdir` loads, from the set the
 * machine's fleet sync wrote (fleet-mcp-set.ts; in no file the person's own
 * `claude` reads): the fleet's own, a project's placed copies over them, and
 * the fleet's chrome-devtools through the session's browser gate
 * ({@link throughGate}), so no session's browser tool starts a Chromium of
 * its own. A session whose door could not be made loads no chrome-devtools,
 * and `denied` denies its tools: chrome-devtools-mcp reaches for a browser
 * only at a tool's call.
 *
 * A workspace session loads no server with a command: its CLI starts every
 * process through its shell prefix, inside the boundary, where no fleet
 * server reaches its install, its door or the owner's machines. Each comes
 * through its workspace's gate on the agent's gateway instead
 * (`ctx.mcpGate`, mcp-gate.ts), which runs it on the host and makes the
 * door itself. A project's own `.mcp.json` servers still start through the
 * prefix, inside.
 */
const fleetMcpFor = async (
  ctx: HarnessContext,
  workdir: string
): Promise<{ denied: string[]; servers: Record<string, McpServerConfig> }> => {
  const all = fleetMcpAt(await readFleetMcpSet(), workdir);
  if (ctx.mcpGate) {
    return { servers: throughMcpGate(all, ctx.mcpGate), denied: [] };
  }
  const { [CHROME_DEVTOOLS]: browser, ...servers } = all;
  if (!(browser && "command" in browser)) {
    return {
      servers: browser ? { ...servers, [CHROME_DEVTOOLS]: browser } : servers,
      denied: [],
    };
  }
  const door = await ctx.browserDoor?.().catch((error: unknown) => {
    console.warn(
      `[claude] ${ctx.instanceId}: its browser's door could not be made, so it loads no chrome-devtools: ${error instanceof Error ? error.message : String(error)}`
    );
  });
  return door
    ? {
        servers: {
          ...servers,
          [CHROME_DEVTOOLS]: {
            ...browser,
            args: throughGate(browser.args ?? [], door),
          },
        },
        denied: [],
      }
    : { servers, denied: [`mcp__${CHROME_DEVTOOLS}`] };
};

/** The caller's options a spawn carries, as a Claude session reads them. */
interface CallerOptions {
  disallowedTools?: string[];
  env?: Record<string, string | undefined>;
  mcpServers?: Record<string, McpServerConfig>;
  [option: string]: unknown;
}

/**
 * What a session runs under, read from the spawn the hub sent for it: the
 * caller's options with its account's config dir in their env, its mode,
 * model and effort, the conversation it goes on with, its skills and
 * denials, and how the hub marked it (a project's Caw, a fence) with its
 * scoped memory. One reading ({@link sessionSpecOf}) for a launch and for
 * an attach after an agent restart: the hub sends an attach the same spawn
 * it launches the session with (hub server.ts `restore`, its row's lead,
 * fence, mode and denials on it), so Caw's gate, a fence, Full Send and
 * every other rule of the session hold across a restart.
 */
interface SessionSpec {
  denyTools: string[] | undefined;
  effort: EffortLevel | undefined;
  /** CawCo's MCP server alone, from no source but the launch ({@link SpawnPayload.fence}). */
  fence: boolean;
  /** Its scoped memory documents ({@link SpawnPayload.instructions}). */
  instructions: readonly SessionInstruction[];
  /** A project's Caw: his shell and edit calls are the hub's gate's ({@link SpawnPayload.lead}). */
  lead: boolean;
  model: string | undefined;
  options: CallerOptions;
  permissionMode: OfferedMode | undefined;
  persistSession: boolean | undefined;
  resume: SpawnPayload["resume"];
  skills: string[] | undefined;
}

/** `spec` as the session it starts or takes back runs it, on `account`'s config dir (none: the machine's own). */
const sessionSpecOf = (
  spec: SpawnPayload,
  account: string | undefined
): SessionSpec => {
  const options = spec.options as CallerOptions | undefined;
  return {
    denyTools: spec.denyTools,
    effort: spec.effort,
    fence: spec.fence === true,
    instructions: spec.instructions ?? [],
    lead: spec.lead === true,
    model: spec.model,
    options: {
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
    permissionMode: offeredMode(spec.permissionMode),
    persistSession: spec.persistSession,
    resume: spec.resume,
    skills: spec.skills,
  };
};

/**
 * The fleet's MCP servers a session takes as it launches ({@link
 * fleetMcpFor}), apart from the caller's: `ClaudeSession` sets them through
 * `setMcpServers`. A caller's server keeps a name it shares with one of the
 * fleet's. `denied`: the tools of a chrome-devtools it cannot take. `hooks`:
 * the project's hooks placed at its folder (fleet-harness-set.ts), which its
 * flag settings carry ({@link sessionSettingsOptions}). A fenced session
 * takes no fleet server and no placed hook.
 */
const launchFleet = async (
  session: SessionSpec,
  ctx: HarnessContext
): Promise<{
  denied: string[];
  fleet: Record<string, McpServerConfig>;
  hooks: SetHook[];
  settings: Record<string, unknown>;
}> => {
  const fleet = session.fence
    ? { servers: {}, denied: [] }
    : await fleetMcpFor(ctx, ctx.cwd);
  const set = session.fence ? undefined : await readFleetHarnessSet();
  return {
    fleet: Object.fromEntries(
      Object.entries(fleet.servers).filter(
        ([name]) => !session.options.mcpServers?.[name]
      )
    ),
    denied: fleet.denied,
    hooks: set ? placedAt(set.placedHooks, ctx.cwd) : [],
    settings: set ? launchedSettings(set, ctx.cwd) : {},
  };
};

/**
 * The settings options a session's `query()` takes ({@link
 * sessionSettingsOptions}), from what only a launch has (its folder's placed
 * hooks and the fleet's settings), and the flag settings its CLI is handed:
 * none known at an attach, which starts nothing and keeps whatever its CLI
 * was handed.
 */
const launchSettings = (
  ctx: HarnessContext,
  lead: boolean,
  fence: boolean,
  launch: {
    fleetMcp?: Record<string, McpServerConfig>;
    fleetSettings?: Record<string, unknown>;
    placedHooks?: SetHook[];
  }
) => {
  const options = sessionSettingsOptions(
    ctx.boundary,
    lead,
    fence,
    launch.placedHooks ?? [],
    launch.fleetSettings ?? {}
  );
  return {
    options,
    handed: launch.fleetMcp
      ? (options.settings as Record<string, unknown>)
      : undefined,
  };
};

/**
 * The fleet's Claude Code settings rows and those of the project placed at
 * `cwd` (fleet-harness-set.ts `configAt`), merged key by key in that order,
 * so a project's key is over the fleet's: what a session's flag settings
 * carry under CawCo's own ({@link sessionSettingsOptions}). A key the hub
 * refuses a row (core `CLAUDE_SETTINGS_REFUSED`) is left out here too.
 */
const launchedSettings = (
  set: FleetHarnessSet,
  cwd: string
): Record<string, unknown> =>
  Object.fromEntries(
    configAt(set, "claudeSettings", cwd)
      .flatMap((row) => Object.entries(row.settings ?? {}))
      .filter(([key]) => !CLAUDE_SETTINGS_REFUSED.includes(key))
  );

/**
 * The MCP servers a session launches with: the caller's and CawCo's, or
 * CawCo's alone for a fenced session.
 */
const sessionMcpServers = (
  instanceId: string,
  ctx: HarnessContext,
  options: unknown,
  fence: boolean
): Record<string, McpServerConfig> => ({
  ...(fence
    ? {}
    : ((options as { mcpServers?: Record<string, McpServerConfig> } | undefined)
        ?.mcpServers ?? {})),
  [MCP_SERVER_NAME]: delegationMcp(instanceId, ctx.sessionCredential),
});

/**
 * The CLI flags a session launches with besides the SDK's own.
 *
 * Claude in Chrome is on by default for every cawco session. The CLI resolves
 * it in `shouldEnableClaudeInChrome`, in this order: OAuth scope ->
 * `--chrome`/`--no-chrome` -> `CLAUDE_CODE_ENABLE_CFC` -> `if
 * (!isInteractive()) return false` -> `~/.claude.json`'s
 * `claudeInChromeDefaultEnabled`. Every cawco session is non-interactive
 * stream-json, so it always trips the interactive gate and never reads the
 * config key — setting `claudeInChromeDefaultEnabled: true` cannot work here
 * at any value. `--chrome` short-circuits above that gate. A spec that names
 * `chrome` or `no-chrome` itself still wins.
 *
 * A fenced session launches with `--no-chrome` and no caller's flags: on
 * `--chrome` the browser's MCP server joins the launch's own
 * (`le={...le,...w}`, which `--strict-mcp-config` keeps: CLI 2.1.296), and a
 * caller's `mcp-config` would add servers of its own. A project's Caw
 * launches with `--no-chrome` too: every delegate type denies Claude in
 * Chrome, and he is of none.
 */
const sessionExtraArgs = (
  options: unknown,
  fence: boolean,
  lead: boolean
): Record<string, string | null> => {
  if (fence || lead) {
    return { "no-chrome": null };
  }
  const callerArgs =
    (options as { extraArgs?: Record<string, string | null> } | undefined)
      ?.extraArgs ?? {};
  return {
    ...("no-chrome" in callerArgs ? {} : { chrome: null }),
    ...callerArgs,
  };
};

/**
 * The SDK's command line, handed to sessiond with its MCP servers in a file
 * rather than inline ({@link mcpConfigOffArgv}): CawCo's carries the
 * session's bearer, and argv is every local user's to read. The file goes
 * when the child does. An attach launches nothing; the files its child was
 * launched with go when that child ends.
 */
const launchUnderSessiond = (
  instanceId: string,
  ctx: HarnessContext,
  sessiond: {
    client: SessiondClient;
    procId: string;
    attach?: BridgeRing["attach"];
  },
  seqs: Map<string, number>,
  spawnOptions: import("@anthropic-ai/claude-agent-sdk").SpawnOptions,
  /** How the child ended, as sessiond reaped it; told before the SDK says anything of it. */
  exited: (exit: ProcessExit | undefined) => void
): import("@anthropic-ai/claude-agent-sdk").SpawnedProcess => {
  const attachedAt = Date.now();
  const launch = sessiond.attach
    ? undefined
    : mcpConfigOffArgv(instanceId, spawnOptions.args, ctx.sessionCredential);
  const file = launch?.file;
  try {
    return sessiondBridge(
      sessiond.client,
      sessiond.procId,
      launch ? { ...spawnOptions, args: launch.args } : spawnOptions,
      { seqs, attach: sessiond.attach },
      (refusal) => ctx.keeperRefused(refusal),
      (exit) => {
        exited(exit);
        if (file) {
          removeMcpConfig(file);
        } else {
          removeMcpConfigsOf(instanceId, attachedAt);
        }
      }
    );
  } catch (error) {
    if (file) {
      removeMcpConfig(file);
    }
    throw error;
  }
};

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
  #transcriptWatch: (() => void) | undefined;
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
   * to it, and nothing at start, when there is none. Each with what a move
   * that ends it tells the session ({@link endedForMove}).
   */
  #background = new Map<string, { description: string; type: string }>();
  /** When this daemon first heard of each of {@link #background}'s tasks, by task id. */
  #backgroundSince = new Map<string, number>();
  /**
   * The main thread's tool calls that block its turn and can be moved to the
   * background (a shell command, a subagent), by `tool_use` id, from their
   * `tool_use` until their `tool_result`. While one runs, a send waits for
   * its end: the CLI reads what it was sent only between tool calls. A send
   * that meets one moves it to the background ({@link #moveToBackground}).
   */
  readonly #foreground = new Set<string>();
  /**
   * The sends the CLI has been handed and has not started, by uuid: from
   * {@link send} (or a `queued` lifecycle an attach replays) until its
   * `started`, `cancelled` or `completed` lifecycle, a withdrawal, or a
   * refused write. The CLI holds them in a queue of its own, which a turn's
   * `result` does not empty: a send handed in the last moments of a turn is
   * started as the next turn after that `result`. Stopping the process before
   * then loses it ({@link holding}).
   */
  readonly #unread = new Set<string>();
  /**
   * The wake-ups the session has scheduled for itself (a cron, a loop's next
   * tick), as the CLI listed them when its last turn ended: its `Stop` hook
   * carries them (`session_crons`). Their timers live in the CLI process.
   * None for a child this host started; `undefined` for one it attached to
   * whose ring no longer holds a turn's end ({@link adoptWakeups}): not known
   * until its next turn ends.
   */
  #crons: Wakeups | undefined = { all: 0, once: 0 };
  /**
   * When an attached session whose wake-ups are not known last wrote its
   * conversation: its turns' ends since then would have said them. Undefined
   * while they are known, or when the conversation was not found.
   */
  #restingSince: number | undefined;
  /** Whether the CLI writes this conversation down (`persistSession`). */
  readonly #stored: boolean;
  /** How its CLI ended, as sessiond reaped it ({@link launchUnderSessiond}); undefined while it runs, or when no end was reaped. */
  #exit: ProcessExit | undefined;
  /** For a resumed conversation: whether its transcript is still where the CLI reads it ({@link processEnded}). */
  readonly #conversationKept: (() => Promise<boolean>) | undefined;
  readonly instanceId: string;
  #lastRequestAt: number | undefined;
  /** The permission mode: the one it started (or was adopted) with, each `setPermissionMode`, and the CLI's own word. */
  readonly #mode: SessionMode;
  /** The MCP servers it was launched with that are not the fleet's (CawCo's, a caller's): the CLI's own to keep, never changed by a fleet change. */
  readonly #launchMcp: ReadonlySet<string>;
  /**
   * The fleet servers it has named in `setMcpServers`, which the next call
   * drops by leaving them out ({@link planFleetMcp}). None at a spawn: its
   * fleet servers came with the launch. Unknown at an attach, where the
   * agent before may have named any: then every server that is neither
   * CawCo's nor a caller's is taken for one.
   */
  #ownedMcp: Set<string> | undefined;
  /** Launched with CawCo's MCP server alone ({@link SpawnPayload.fence}): it takes no fleet server. */
  readonly #fence: boolean;
  /** A project's Caw ({@link SpawnPayload.lead}): its flag settings carry his gate's rules. */
  readonly #lead: boolean;
  /**
   * The flag settings its CLI holds as CawCo last set them: as launched, then
   * as each {@link #takeFleetSettings} applied them. Unknown at an attach,
   * where the agent before may have applied any.
   */
  #flagSettings: Record<string, unknown> | undefined;
  readonly #workdir: string;
  /** The config dir its CLI runs in (`CLAUDE_CONFIG_DIR`): its account's, or none for the machine's own. */
  readonly #configDir: string | undefined;
  /** One fleet MCP change taken at a time, in the order they came. */
  #fleetMcp: Promise<unknown> = Promise.resolve();

  constructor(
    instanceId: string,
    ctx: HarnessContext,
    workdir: string,
    /** What it runs under, from its spawn ({@link sessionSpecOf}): the same on a launch and an attach. */
    session: SessionSpec,
    /** What the fleet denies this session ({@link sessionFleetDenials}), resolved once by `spawn()` or `adopt()`. */
    fleetDenyList: readonly string[],
    /**
     * What only a launch has: `conversationKept` says, for a resumed
     * conversation, whether its transcript is still on disk; `fleetMcp` is
     * the fleet's servers it takes as it starts, `placedHooks` its folder's
     * project hooks, `fleetSettings` the fleet's and its project's Claude
     * Code settings ({@link launchFleet}). An attach starts nothing and
     * passes none of them: its CLI keeps the settings it was launched with.
     */
    launch: {
      conversationKept?: () => Promise<boolean>;
      fleetMcp?: Record<string, McpServerConfig>;
      placedHooks?: SetHook[];
      fleetSettings?: Record<string, unknown>;
    },
    /**
     * The sessiond connection this session's CLI child lives under: `spawn()`
     * and `adopt()` both supply it, and there is no in-process fallback
     * (PLAN.md C7: full cutover, rollback is a revert).
     *
     * `attach` names a child that already exists — one that outlived the
     * agent which started it — and the `Query` attaches to that process
     * instead of spawning one (see {@link sessiondBridge}).
     *
     * `executable` is the `claude` the SDK is handed: the version gate's
     * ({@link claudeToStart}) on a spawn; on an attach, which starts
     * nothing, the one on PATH.
     */
    sessiond: {
      client: SessiondClient;
      procId: string;
      executable: string;
      attach?: BridgeRing["attach"];
    }
  ) {
    this.instanceId = instanceId;
    this.#ctx = ctx;
    const { conversationKept, fleetMcp } = launch;
    const {
      options,
      permissionMode,
      model,
      effort,
      resume,
      persistSession,
      skills,
      denyTools,
      lead,
      fence,
      instructions,
    } = session;
    // Before the `Query` below exists: an attach replays the asks the previous
    // host left open as soon as it does, and they are decided in this mode.
    this.#mode = new SessionMode(permissionMode);
    const cliMode = this.#mode.cli;
    this.#launchCredential = ctx.sessionCredential;
    this.#boundaryHook = workspaceHook(ctx.boundary);
    const mcpServers = sessionMcpServers(instanceId, ctx, options, fence);
    this.#launchMcp = new Set(Object.keys(mcpServers));
    this.#ownedMcp = fleetMcp ? new Set(Object.keys(fleetMcp)) : undefined;
    this.#fence = fence;
    this.#lead = lead;
    this.#workdir = workdir;
    const env = sessionEnv(
      (options as { env?: Record<string, string | undefined> } | undefined)
        ?.env,
      ctx
    );
    this.#configDir = env.CLAUDE_CONFIG_DIR;
    this.#sessiond = sessiond;
    this.#stored = persistSession !== false;
    this.#conversationKept = conversationKept;
    const seqs = this.#seqs;
    const input = new InputStream();
    this.#input = input;
    const turn = new Turn();
    this.#turn = turn;
    const extraArgs = sessionExtraArgs(options, fence, lead);

    const { options: launchedOptions, handed } = launchSettings(
      ctx,
      lead,
      fence,
      launch
    );
    this.#flagSettings = handed;
    const handle = query({
      prompt: input,
      options: {
        forwardSubagentText: true,
        agentProgressSummaries: true,
        ...(options as Record<string, unknown> | undefined),
        pathToClaudeCodeExecutable: sessiond.executable,
        extraArgs,
        mcpServers,
        // A fenced session's servers are these and no others: the CLI's
        // `--strict-mcp-config`, set after the caller's options so none of
        // them turns it off. It keeps the servers of `agents` passed in
        // ("and servers declared by explicitly-passed agent definitions in
        // `agents`", sdk.d.ts 0.3.296), so it takes no caller's agents.
        ...(fence ? { strictMcpConfig: true, agents: undefined } : {}),
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
                  this.#wakeupsKnown(scheduledWakeups(stopping));
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
        // the harness's own list and plan mode, which every session is denied.
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
        // Its scoped memory documents (SpawnPayload.instructions), after
        // Claude Code's own prompt: "`{ type: 'preset', preset: 'claude_code',
        // append: '...' }` - Use default prompt with appended instructions"
        // (sdk.d.ts 0.3.296).
        ...(instructions.length > 0
          ? {
              systemPrompt: withInstructions(
                (options as { systemPrompt?: SystemPrompt } | undefined)
                  ?.systemPrompt,
                instructions
              ),
            }
          : {}),
        env,
        // Left out entirely when nobody chose: the SDK's own default is the
        // model's, and writing a level here would put cawco's guess in its
        // place on every model whose scale we cannot see.
        ...(effort && { effort }),
        // Enables switching into bypass through the mode picker; does not
        // select it. As root the CLI takes it under IS_SANDBOX ({@link
        // CLAUDE_ROOT_SANDBOX}).
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
        // workspace's boundary, through its shell prefix (`sessionEnv`); the
        // hook the CLI itself runs judges every other call's paths.
        ...launchedOptions,
        ...scratchDirectory(ctx.boundary),
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
        // fallback (PLAN.md C7). Its MCP servers go in a file, not on argv
        // ({@link launchUnderSessiond}).
        spawnClaudeCodeProcess: (
          spawnOptions: import("@anthropic-ai/claude-agent-sdk").SpawnOptions
        ) =>
          launchUnderSessiond(
            instanceId,
            ctx,
            sessiond,
            seqs,
            spawnOptions,
            (exit) => {
              this.#exit = exit;
            }
          ),
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
            const answered = this.#mode.answersHostSide(toolName, lead);
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
    this.#startFleetMcp(fleetMcp);

    // Load skills natively: push /skill messages into the input stream before
    // any user prompt. The SDK handles them as slash commands — same as the
    // user typing /skill-name in the session. A launch's alone: a child taken
    // back loaded them when it started.
    if (skills?.length && !sessiond.attach) {
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
   * The Claude Code version this session's process runs, as its own
   * initialize reply says it (`claude_code_version`, the same on a spawn and
   * an attach: the CLI answers a repeated initialize itself). `null`: the
   * reply carries no version, so the CLI predates the field
   * ({@link INITIALIZE_SAYS_VERSION_FROM}). Undefined until it has answered.
   */
  #runs: string | null | undefined;

  async outdated(): Promise<{ uuid: string; words: string } | undefined> {
    const runs = this.#runs;
    if (runs === undefined) {
      return;
    }
    const said = await claudeHostVersion();
    const host = said.kind === "answered" ? said.value : undefined;
    if (!host || versionRefusal(said) || runs === host) {
      return;
    }
    return {
      uuid: `cli-outdated-${this.instanceId}-${runs ?? "unreported"}-${host}`,
      words: `This session runs Claude Code ${runs ?? `older than ${INITIALIZE_SAYS_VERSION_FROM}`}, and this machine's is ${host} now. It goes to sleep as soon as nothing it runs would be cut off, and its next message wakes it on ${host}.`,
    };
  }

  /**
   * Says what the session's Claude Code answered at initialize
   * ({@link ACCOUNT_READ}): who its account is, its plan, and the models it
   * offers. The hub keeps it as the account's catalog, so a picker has it
   * with nothing running. Its version is kept ({@link #runs}).
   */
  async #readAccount(): Promise<void> {
    try {
      const init = await this.#handle.initializationResult();
      this.#runs = init.claude_code_version ?? null;
      // Its organization's id is its dir's login's, as `auth status` read it:
      // initialize names none (accounts.ts `dirIdentity`).
      const identity = dirIdentity(this.#configDir, identityOf(init.account));
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
   *
   * Each read is kept until it lands ({@link #effortReads}): a stop lets
   * them land before it closes the query, which otherwise refuses them
   * ("Query closed before response received"). The interrupted turn's end
   * sets one off in the middle of every stop.
   */
  #readEffort(): Promise<void> {
    const reading = this.#readEffortNow();
    this.#effortReads.add(reading);
    // biome-ignore lint/complexity/noVoid: the read says its own failure; this only lets go of it
    void reading.finally(() => this.#effortReads.delete(reading));
    return reading;
  }

  /** The effort reads not yet answered ({@link #readEffort}). Each settles: its failure is said, never thrown. */
  readonly #effortReads = new Set<Promise<void>>();

  async #readEffortNow(): Promise<void> {
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
        let started = false;
        if ((message as { type: string }).type === "command_lifecycle") {
          const lifecycle = message as unknown as CommandLifecycle;
          const uuid = lifecycle.command_uuid;
          if (lifecycle.state === "queued") {
            this.#unread.add(uuid);
            // Any send queued behind a running shell command or subagent — the
            // person's, a hand-off, a report, a rule's reply — would wait for
            // its end: it is moved to the background, and the send is read at
            // that boundary. Keyed on `queued`, not on the send: the call
            // returns at once, and the send is in the CLI's queue by then.
            if (this.#foreground.size > 0) {
              // biome-ignore lint/complexity/noVoid: the move reports itself; nothing waits for it
              void this.#moveToBackground([...this.#foreground]);
            }
          } else {
            this.#unread.delete(uuid);
          }
          if (lifecycle.state === "started") {
            turn.running = true;
            started = true;
          }
          this.#delivery.get(uuid)?.resolve();
          this.#delivery.delete(uuid);
        }
        // A turn the CLI starts on its own — a background task's notification,
        // a message it held from the last turn — is a turn all the same: the
        // frames are the evidence, and a send into it waits like any other.
        // A send it starts is one from the moment it is read, before the
        // model's first word: read, it is no longer anything to hand back,
        // and only the turn it opens keeps the process from being stopped.
        if (started || runsTurn(message)) {
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
          this.#background = new Map(
            message.tasks
              .filter((task) => !task.ambient)
              .map((task) => [
                task.task_id,
                { description: task.description, type: task.task_type },
              ])
          );
          const now = Date.now();
          this.#backgroundSince = new Map(
            [...this.#background.keys()].map((id) => [
              id,
              this.#backgroundSince.get(id) ?? now,
            ])
          );
        }
        this.#trackForeground(message);
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
          // What will wake it as the turn ends: the CLI's background tasks
          // (its `background_tasks_changed` list, ambient ones left out) and
          // the wake-ups its `Stop` hook listed just before this result.
          if (neutral.type === "result") {
            neutral.wakes = {
              background: this.#background.size,
              scheduled: this.#crons?.all ?? 0,
            };
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
      await processEnded(ctx, error, this.#exit, this.#conversationKept);
    } finally {
      this.#transcriptWatch?.();
      for (const delivery of this.#delivery.values()) {
        delivery.resolve();
      }
      this.#delivery.clear();
      // Gone with the process: the supervisor hands back what it never read.
      this.#unread.clear();
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
   * Keeps {@link #foreground} from the main thread's frames: a call of a tool
   * that blocks the turn and can be backgrounded, not started in the
   * background, joins at its `tool_use`; its `tool_result` (its own, or the
   * placeholder a backgrounded call returns) and the turn's end take it out.
   * A shell command becomes a task the CLI can move only once it has run two
   * seconds (Claude Code 2.1.296 registers it once `elapsed >= wOn/1000`,
   * `wOn=2000`); its `task_started` says so, and one that starts while a
   * send waits is moved then.
   */
  #trackForeground(message: SDKMessage): void {
    if (message.type === "result") {
      this.#foreground.clear();
      return;
    }
    if (
      message.type === "system" &&
      message.subtype === "task_started" &&
      message.is_backgrounded === false &&
      message.tool_use_id !== undefined &&
      this.#foreground.has(message.tool_use_id) &&
      this.#unread.size > 0
    ) {
      // biome-ignore lint/complexity/noVoid: the move reports itself; nothing waits for it
      void this.#moveToBackground([message.tool_use_id]);
      return;
    }
    if (
      (message.type !== "assistant" && message.type !== "user") ||
      message.parent_tool_use_id !== null
    ) {
      return;
    }
    const { content } = message.message;
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content) {
      if (
        block.type === "tool_use" &&
        BACKGROUNDABLE_TOOLS.has(block.name) &&
        (block.input as { run_in_background?: unknown } | undefined)
          ?.run_in_background !== true
      ) {
        this.#foreground.add(block.id);
      } else if (block.type === "tool_result") {
        this.#foreground.delete(block.tool_use_id);
      }
    }
  }

  /**
   * Moves the foreground calls `ids` to the background so a send waiting
   * behind them is read now (the SDK's `backgroundTasks`, what Ctrl+B does in
   * the terminal): each returns at once with a "running in the background"
   * result, keeps running, and its `task_notification` reaches the session
   * when it settles, as any background task's does. A call the CLI has not
   * yet made a task (a shell command younger than two seconds) is not moved
   * here; its `task_started` moves it ({@link #trackForeground}). A CLI with
   * background tasks disabled refuses: the send waits for the call's end, and
   * the refusal is logged.
   */
  async #moveToBackground(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one control request per call, in turn
        const moved = await this.#handle.backgroundTasks(id);
        console.info(
          `[claude] ${this.instanceId}: a send waits behind tool call ${id}: ${moved ? "moved it to the background" : "not yet a task; it is moved when it becomes one"}`
        );
      } catch (error) {
        console.warn(
          `[claude] ${this.instanceId}: a send waits behind tool call ${id}, and moving it to the background was refused: ${error instanceof Error ? error.message : String(error)}`
        );
        return;
      }
    }
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
   * A HELD CHILD THE HUB NO LONGER KNOWS IS STOPPED, AND SAYS SO. Its cawco
   * slot reads `needs-auth`, or the hub answers its credential's ACK 401:
   * the hub refused the credential it was launched with, so none of its
   * CawCo tools reach the hub, and a delegate could no
   * longer report or finish its item, silently. That was the attach's
   * refusal (HeldProcessRefused, the credential gate), and it is the same
   * now when the slot is refused after the attach: the session is stopped,
   * the words go in its transcript ({@link SESSION_STOPPED}) and the agent's
   * log, and its row and work item fail with them ({@link #refuse}).
   */
  #credentialRefused(): void {
    this.#ctx.frame({
      type: "system",
      subtype: SESSION_STOPPED,
      uuid: `session-stopped-${this.instanceId}-credential`,
      session_id: this.sessionId ?? "",
      content: CREDENTIAL_REFUSED_WORDS,
    } as unknown as NeutralMessage);
    this.#refuse(new HeldProcessRefused(CREDENTIAL_REFUSED_WORDS));
  }

  /**
   * Stops the session for good because its boundary hook cannot hold, or the
   * hub refused its credential ({@link #credentialRefused}), and says why:
   * its row and work item fail with `refusal`, and every send after it is
   * refused ({@link #hookGone}).
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
          `[claude] ${this.instanceId}: stopping after its refusal: ${String(error)}`
        )
      );
    return refusal;
  }

  /**
   * Asks the hub to relaunch the session onto the workspace's hook script
   * ({@link BOUNDARY_RELAUNCH}) when its CLI runs a hook that fails open
   * (`hookFailsOpen`): one that runs what can go missing, or one launched on
   * shell tools alone, which leaves file tools and MCP calls unjudged. Called
   * at the attach when no turn is running, and as each turn ends. The hub
   * does so only while the session is idle; until then the turn-start check
   * and the transcript watch stand in for a hook that can go missing.
   */
  askRelaunch(): void {
    if (
      this.#boundaryHook &&
      hookFailsOpen(this.#boundaryHook) &&
      !this.#hookRefusal
    ) {
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
    this.#transcriptWatch?.();
    this.#transcriptWatch = await tailLines(
      file,
      (line) => {
        if (line.includes("hook_non_blocking_error")) {
          this.#transcriptHookFailure(line);
        }
      },
      (error) =>
        console.warn(
          `[claude] ${this.instanceId}: reading its transcript failed: ${String(error)}`
        )
    );
  }

  /** One transcript line, whose records may be a hook's non-blocking failure. */
  #transcriptHookFailure(line: string): void {
    for (const record of lineRecords(line)) {
      const { attachment } = record as { attachment?: StoredHookFailure };
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
  adoptWakeups(wakeups: Wakeups | undefined, since?: number): void {
    this.#crons = wakeups;
    this.#restingSince = since;
    this.#wakeupsKnown(wakeups);
  }

  /** A turn's end said which wake-ups it scheduled: kept, so an agent that attaches later knows too. */
  #wakeupsKnown(wakeups: Wakeups | undefined): void {
    if (wakeups === undefined) {
      return;
    }
    this.#crons = wakeups;
    keepWakeups(this.instanceId, wakeups).catch((error: unknown) =>
      console.warn(
        `[claude] ${this.instanceId}: keeping its wake-ups failed: ${error instanceof Error ? error.message : String(error)}`
      )
    );
  }

  tables(): Record<string, number> {
    return {
      claudeSeqs: this.#seqs.size,
      claudeDelivery: this.#delivery.size,
      claudePermissions: this.#permissions.size,
      claudeQuestions: this.#openQuestions.size + this.#dismissedQuestions.size,
    };
  }

  holding(forMove = false): string | undefined {
    if (this.#unread.size > 0) {
      return `it holds ${this.#unread.size} send(s) it has not read yet`;
    }
    if (!this.#stored) {
      return "its conversation is not stored, so nothing could wake it";
    }
    // What a move would lose is held for later, and {@link heldForLater}'s
    // to say: the move waits for it within a bound, not for ever.
    if (forMove) {
      return undefined;
    }
    // A background task's completion is what wakes the session for it, and
    // a sleep would end it: a sleep waits for it, as for a running turn.
    if (this.#background.size > 0) {
      return `${this.#background.size} background task(s) it started are still running`;
    }
    const unknown = this.#wakeupsUnknown();
    if (unknown) {
      return unknown;
    }
    // A sleep fires none of its wake-ups until it is woken.
    return (this.#crons?.all ?? 0) > 0
      ? `it has scheduled itself ${this.#crons?.all} wake-up(s)`
      : undefined;
  }

  /**
   * Its wake-ups not known yet: none of its turns has ended since it
   * started, and it has not been at rest past {@link WAKEUPS_DECIDED_MS}
   * (past it, nothing it scheduled at an interval that short is pending, and
   * what it scheduled further out comes back when it is resumed).
   */
  #wakeupsUnknown(): string | undefined {
    if (this.#crons !== undefined) {
      return undefined;
    }
    return this.#restingSince !== undefined &&
      Date.now() - this.#restingSince >= WAKEUPS_DECIDED_MS
      ? undefined
      : "its scheduled wake-ups are not known until its next turn ends";
  }

  heldSince(): number | undefined {
    const starts = [...this.#backgroundSince.values()];
    return starts.length > 0 ? Math.min(...starts) : undefined;
  }

  heldForLater(): RestartHold[] {
    // A background task's completion is what wakes the session for it, and
    // no resume brings the task back ("Background Bash and monitor tasks are
    // never restored on resume", code.claude.com/docs/en/scheduled-tasks).
    // Its completion starts the turn whose end the move then takes.
    if (this.#background.size > 0) {
      return [{ reason: "command", ids: [...this.#background.keys()] }];
    }
    if (this.#wakeupsUnknown()) {
      return [
        { reason: "wake-ups-unknown", ids: [this.sessionId ?? "session"] },
      ];
    }
    // A move resumes the conversation at once on another account, which
    // brings back the recurring wake-ups and not every one-shot
    // ({@link Wakeups}).
    const once = this.#crons?.once ?? 0;
    return once > 0
      ? [
          {
            reason: "wake-up",
            ids: Array.from({ length: once }, (_, at) => `wake-up ${at + 1}`),
          },
        ]
      : [];
  }

  /**
   * Each background task as its process ends for a move, with the last of
   * its output read through the CLI's `get_task_output` (on the `Query` at
   * runtime, missing from its type); a task whose output it does not keep (a
   * subagent's) goes without. Each read is given {@link TASK_OUTPUT_READ_MS}:
   * the process ends next whatever they answer, and a task whose output was
   * not read in that time says so (`outputUnread`), apart from one that
   * printed nothing.
   */
  async endedForMove(): Promise<MoveEnded> {
    const handle = this.#handle as unknown as {
      getTaskOutput?: (taskId: string) => Promise<{ output: string }>;
    };
    const tasks = await Promise.all(
      [...this.#background].map(async ([taskId, task]): Promise<EndedTask> => {
        const { getTaskOutput } = handle;
        if (!getTaskOutput) {
          return { taskId, ...task };
        }
        let read: Bounded<{ output: string }>;
        try {
          read = await readWithin(TASK_OUTPUT_READ_MS, () =>
            getTaskOutput.call(handle, taskId)
          );
        } catch {
          // The CLI refused the read (it keeps no output for this task).
          return { taskId, ...task };
        }
        switch (read.kind) {
          case "answered":
            return {
              taskId,
              ...task,
              ...(read.value.output ? { output: read.value.output } : {}),
            };
          case "unanswered":
            return { taskId, ...task, outputUnread: { after: read.after } };
          default: {
            const unhandled: never = read;
            throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
          }
        }
      })
    );
    return { tasks, wakeups: this.#crons?.once ?? 0 };
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
    this.#unread.add(message.uuid);
    // Into a running turn the CLI queues it and says `started` when it is
    // read (measured 2.1.280); its `queued` moves the shell command or
    // subagent holding the turn to the background ({@link #moveToBackground}).
    this.#ctx.busy(true);
    this.#turn.start();
    this.#input.push(outgoing);
  }

  /** Moves the CLI into `asked`, one CawCo offers; the session takes it once the CLI is in it. */
  async #setMode(asked: PermissionMode | undefined): Promise<void> {
    const mode = offeredMode(asked);
    if (!mode) {
      throw new Error(
        `${CONTROL_SET_PERMISSION_MODE} names no permission mode`
      );
    }
    await this.#handle.setPermissionMode(sdkMode(mode));
    this.#mode.choose(mode);
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
    if (method === CONTROL_MCP_FLEET_CHANGED) {
      const changes = args[0] as FleetMcpChange[];
      const taking = this.#fleetMcp.then(() => this.#takeFleetMcp(changes));
      this.#fleetMcp = taking.catch(() => undefined);
      return await taking;
    }
    if (method === CONTROL_FLEET_SETTINGS) {
      return await this.#takeFleetSettings();
    }
    if (method === CONTROL_MCP_FLEET_HEAL) {
      const healing = this.#fleetMcp.then(() => this.#healFleetMcp());
      this.#fleetMcp = healing.catch(() => undefined);
      return await healing;
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
    // How full the window is, from the last answer's usage and the CLI's own
    // estimates: "'summary' answers from the last response's usage and local
    // estimates without per-category token-count API calls (default 'full')"
    // (agent SDK 0.3.257 CHANGELOG). The full count waited on Anthropic's
    // token-count API once per category, and on a busy machine (many
    // sessions reading after every turn) ran past every reader's deadline.
    if (method === CONTROL_CONTEXT_USAGE) {
      return await this.#handle.getContextUsage({ detail: "summary" });
    }
    // The CLI is told its own mode (`fullSend` is its bypass); the session
    // takes the mode CawCo was asked for once the CLI is in it.
    if (method === CONTROL_SET_PERMISSION_MODE) {
      await this.#setMode(args[0] as PermissionMode | undefined);
      return undefined;
    }
    // The session's own interrupt, never the `Query`'s alone: it stops the
    // CLI's background tasks too ({@link interrupt}). Passed through to
    // `Query.interrupt`, a background shell the agent then ended in its
    // workspace (session.ts `#endWork`) was one the CLI read as failed, and
    // its notice woke the interrupted session (delegate-kill i2, obelisk,
    // 2026-10-20).
    if (method === CONTROL_INTERRUPT) {
      await this.interrupt();
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

  /**
   * The fleet's MCP servers the session takes as it starts, through
   * `setMcpServers`, never the launch: a server the launch passed stays
   * running beside the one a later call names under its name, and keeps its
   * tool calls (CLI 2.1.302: `setMcpServers({a: <new>})` on a launched `a`
   * started a second process and left the first alive, while one a call named
   * is replaced and dropped). Each fleet change takes its turn after this.
   */
  #startFleetMcp(fleetMcp: Record<string, McpServerConfig> | undefined): void {
    if (!fleetMcp || Object.keys(fleetMcp).length === 0) {
      return;
    }
    this.#fleetMcp = this.#handle.setMcpServers(fleetMcp).then(
      ({ errors }) => {
        for (const [name, error] of Object.entries(errors)) {
          console.warn(
            `[claude] ${this.instanceId}: fleet MCP ${name} did not connect: ${error}`
          );
        }
      },
      (error: unknown) =>
        console.warn(
          `[claude] ${this.instanceId}: the fleet's MCP servers were not set: ${error instanceof Error ? error.message : String(error)}`
        )
    );
  }

  /** The fleet's MCP servers a session starting here now would load ({@link fleetMcpFor}). */
  async #configuredMcp(): Promise<Record<string, McpServerConfig>> {
    return (await fleetMcpFor(this.#ctx, this.#workdir)).servers;
  }

  /**
   * Fleet MCP servers changed at the hub, and this machine's fleet set says
   * so (fleet-mcp-set.ts): the session takes each change in place, with no
   * new session. Measured on CLI 2.1.296, and for `setMcpServers` again on
   * 2.1.302 against a scratch config dir:
   * - `reconnectMcpServer` dials a server the session already holds with the
   *   config it holds: a sign-in or sign-out at the hub is that.
   * - A server the session never held is "Server not found" to both
   *   `reconnectMcpServer` and `toggleMcpServer`; `setMcpServers` connects
   *   it.
   * - `setMcpServers` governs the servers it has been sent: a launch's server
   *   stays whatever a call leaves out (`setMcpServers({})` answered
   *   `removed: []`), until a call names it; from then on a call that leaves
   *   it out drops it. That is how a launch's fleet server leaves, and how
   *   one whose config changed is dialled again on its new config. A config
   *   sent again unchanged is no change at all (its process ran on), though
   *   the answer lists it as `added`.
   * - `toggleMcpServer(name, false)` writes the name into the folder's
   *   `disabledMcpServers` in `.claude.json`, turning the server off for
   *   every later session there, so it is never used.
   * A server the person turned off in this session stays off. Answers what
   * each named server reads afterwards, and says it on the machine's log.
   */
  async #takeFleetMcp(
    changes: FleetMcpChange[]
  ): Promise<{ servers: FleetMcpOutcome[] }> {
    if (this.#fence) {
      console.info(
        `[claude] ${this.instanceId}: fleet MCP ${changes.map(({ name, kind }) => `${name} ${kind}`).join(", ")}: not taken, as a fenced session runs CawCo's MCP server alone`
      );
      return {
        servers: changes.map(({ name, kind }) => ({
          name,
          kind,
          status: "fenced",
        })),
      };
    }
    const configured = await this.#configuredMcp();
    const before = await this.#handle.mcpServerStatus();
    // At an attach, the agent before may have named any server that is
    // neither CawCo's nor a caller's: each is taken for one it named.
    const owned =
      this.#ownedMcp ??
      new Set(
        before
          .filter((server) => !this.#launchMcp.has(server.name))
          .map((server) => server.name)
      );
    const plan = planFleetMcp(
      changes,
      configured,
      before,
      this.#launchMcp,
      owned
    );
    const errors: Record<string, string> = {};
    if (Object.keys(plan.leaving).length > 0) {
      await this.#handle.setMcpServers({
        ...Object.fromEntries(plan.dynamic),
        ...plan.leaving,
      });
    }
    const set = await this.#handle.setMcpServers(
      Object.fromEntries(plan.dynamic)
    );
    this.#ownedMcp = new Set(plan.dynamic.keys());
    Object.assign(errors, set.errors);
    // A server sent on a new config was dialled on it; one sent unchanged
    // was not, though `added` lists it too.
    const held = new Map(before.map((server) => [server.name, server]));
    for (const [name, config] of plan.dynamic) {
      if (dialed(held.get(name)?.config) !== dialed(config)) {
        plan.redial.delete(name);
      }
    }
    for (const name of plan.redial) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one server's dial at a time, as the CLI takes them
        await this.#handle.reconnectMcpServer(name);
      } catch (error) {
        errors[name] = error instanceof Error ? error.message : String(error);
      }
    }
    const after = new Map(
      (await this.#handle.mcpServerStatus()).map((server) => [
        server.name,
        server,
      ])
    );
    const servers = await Promise.all(
      changes.map(async ({ name, kind }): Promise<FleetMcpOutcome> => {
        const now = after.get(name);
        const why = plan.kept.get(name);
        // The CLI keeps a server whose `tools/list` failed after its
        // `initialize` as `connected` with no tools (CLI 2.1.296: its catch
        // sets `e.toolsListError=y` and answers `[]`). Against the proxy's own
        // list, that is not the server taken.
        const short =
          now?.status === "connected" &&
          !why &&
          now.tools?.length === 0 &&
          this.#proxied(configured, name)
            ? await proxiedToolCount(name)
            : undefined;
        const error =
          errors[name] ??
          now?.error ??
          (short
            ? `holds none of the ${short} tools the fleet proxy lists`
            : undefined);
        return {
          name,
          kind,
          status: why ? `kept: ${why}` : (now?.status ?? "gone"),
          ...(now?.tools ? { tools: now.tools.length } : {}),
          ...(error ? { error } : {}),
        };
      })
    );
    console.info(
      `[claude] ${this.instanceId}: fleet MCP ${servers.map(outcomeLine).join("; ")}`
    );
    return { servers };
  }

  /** Whether the files name `name` as a fleet server the hub proxies, dialled on this machine's path to it. */
  #proxied(configured: Record<string, McpServerConfig>, name: string): boolean {
    return (
      !this.#launchMcp.has(name) &&
      (configured[name] as { url?: string } | undefined)?.url ===
        proxiedFleetMcpUrl(name)
    );
  }

  /**
   * The fleet's hooks and Claude Code settings placed at its folder taken
   * again (fleet-harness-set.ts), asked by the machine at the session's
   * attach and after each fleet sync, as OpenCode and pi read the set at each
   * call: its flag settings made as a launch now would make them
   * ({@link sessionSettingsOptions}), and each top-level key that moved
   * applied to the running CLI through `applyFlagSettings`, a key no longer
   * there cleared ("Successive calls shallow-merge top-level keys … Pass
   * `null` for a key to clear it from the flag layer", sdk.d.ts 0.3.302).
   * `hooks` goes whole, the boundary's entry in it. A fenced session takes
   * none of the fleet's.
   */
  async #takeFleetSettings(): Promise<{ applied: string[] }> {
    if (this.#fence) {
      return { applied: [] };
    }
    const set = await readFleetHarnessSet();
    const next = sessionSettingsOptions(
      this.#ctx.boundary,
      this.#lead,
      false,
      placedAt(set.placedHooks, this.#workdir),
      launchedSettings(set, this.#workdir)
    ).settings as Record<string, unknown>;
    const before = this.#flagSettings;
    const patch: Record<string, unknown> = Object.fromEntries(
      Object.entries(next).filter(
        ([key, value]) =>
          !before || JSON.stringify(before[key]) !== JSON.stringify(value)
      )
    );
    for (const key of Object.keys(before ?? {})) {
      if (!(key in next)) {
        patch[key] = null;
      }
    }
    if (Object.keys(patch).length === 0) {
      return { applied: [] };
    }
    await this.#handle.applyFlagSettings(
      patch as Parameters<Query["applyFlagSettings"]>[0]
    );
    this.#flagSettings = next;
    return { applied: Object.keys(patch) };
  }

  /**
   * Every fleet server the hub proxies that this session holds failed (or
   * needing a sign-in, which the proxy never asks of it), connected with none
   * of the tools the proxy lists, or not at all, taken again as a sign-in
   * takes it ({@link #takeFleetMcp}). Asked by the machine at the session's
   * attach and after each fleet sync, so a session left without a server's
   * tools heals with no new sign-in. A server the person turned off here, or
   * one still connecting, is left as it is; so is one whose proxy list could
   * not be read, or lists nothing.
   */
  async #healFleetMcp(): Promise<{ healed: FleetMcpOutcome[] }> {
    if (this.#fence) {
      return { healed: [] };
    }
    const configured = await this.#configuredMcp();
    const proxied = Object.keys(configured).filter((name) =>
      this.#proxied(configured, name)
    );
    if (proxied.length === 0) {
      return { healed: [] };
    }
    const held = new Map(
      (await this.#handle.mcpServerStatus()).map((server) => [
        server.name,
        server,
      ])
    );
    const broken: { name: string; was: string }[] = [];
    for (const name of proxied) {
      const has = held.get(name);
      if (
        has?.status === "disabled" ||
        has?.status === "pending" ||
        (has?.status === "connected" && (has.tools?.length ?? 0) > 0)
      ) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one reading per server, shared by every session asking within seconds
      const listed = await proxiedToolCount(name);
      if (!listed) {
        continue;
      }
      broken.push({
        name,
        was: has
          ? `${has.status}${has.status === "connected" ? " (0 tools)" : ""}`
          : "not held",
      });
    }
    if (broken.length === 0) {
      return { healed: [] };
    }
    const { servers } = await this.#takeFleetMcp(
      broken.map(({ name }) => ({ name, kind: "signed-in" }))
    );
    console.info(
      `[claude] ${this.instanceId}: healed fleet MCP ${broken
        .map(({ name, was }) => {
          const now = servers.find((server) => server.name === name);
          return `${name} was ${was}, now ${now?.status ?? "unknown"}${now?.tools === undefined ? "" : ` (${now.tools} tools)`}${now?.error ? ` — ${now.error}` : ""}`;
        })
        .join("; ")}`
    );
    return { healed: servers };
  }

  async #withdraw(uuid: string): Promise<"withdrawn" | "started"> {
    if (this.#input.withdraw(uuid)) {
      this.#delivery.get(uuid)?.resolve();
      this.#delivery.delete(uuid);
      this.#unread.delete(uuid);
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
    // Query has no public typed method (0.3.296); use its own correlated
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
    if (reply?.response?.cancelled !== true) {
      return "started";
    }
    this.#unread.delete(uuid);
    return "withdrawn";
  }

  /**
   * THE CAWCO SLOT OF A CHILD ATTACHED WHILE IT IS STILL CONNECTING, DIALLED
   * UNTIL IT CONNECTS OR THE CHILD ENDS. The child reaches CawCo through this
   * machine's agent (its MCP gateway, or the hub itself when that is local),
   * and an update restarts both. Claude Code retries a dropped HTTP server
   * five times, 1 s to 8 s apart, with a 30 s connect timeout each, then
   * marks it `failed` (2.1.289, the slot's own `mcp-logs-cawco`: "Reconnect
   * gave up after 5 attempts: failed", 2026-10-08 10:30:46). 2.1.295 and on
   * keep dialling after those five: "Reconnect attempts spent; retrying in
   * the background, up to 8 more times" (2.1.296 on a scratch rig). A slot
   * still connecting is left to its own retries; a `failed` one is dialled
   * again with the header it was launched with, so no credential changes,
   * at a wait that doubles to 30 s. Once connected, the hub has taken that
   * header as this session, and the ACK, authenticated by it, says so. A
   * slot that reads `needs-auth` (the hub no longer knows the credential)
   * stops the session and says why ({@link #credentialRefused}); one that
   * reads anything else (`disabled`) is not dialled again.
   */
  async #dialCawco(credential: string): Promise<void> {
    let over = false;
    // Its end, however it ends: the pump reports its own failure.
    const ended = () => {
      over = true;
    };
    this.#pump.then(ended, ended);
    for (let wait = 1000; !over; wait = Math.min(wait * 2, 30_000)) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: one reading of the slot at a time, each after the wait before it
        if ((await this.#dialOnce(credential)) === "done") {
          return;
        }
      } catch (error) {
        if (over) {
          return;
        }
        console.warn(
          `[claude] ${this.instanceId}: its CawCo MCP is still connecting: ${error instanceof Error ? error.message : String(error)}`
        );
      }
      await Bun.sleep(wait);
    }
  }

  /** One reading of the cawco slot for {@link #dialCawco}: whether the dial is done. */
  async #dialOnce(credential: string): Promise<"done" | "again"> {
    const read = await this.#readCawcoSlot();
    if (read.slot === "connected") {
      if (await this.#acknowledged(credential)) {
        console.info(
          `[claude] held credential verified ${this.instanceId}: its CawCo MCP connected after it was attached`
        );
      }
      return "done";
    }
    if (read.slot === "refused") {
      this.#credentialRefused();
      return "done";
    }
    if (read.slot === "again") {
      return "again";
    }
    console.warn(
      `[claude] ${this.instanceId}: its CawCo MCP reads ${read.status}; it is not dialled again`
    );
    return "done";
  }

  /**
   * THE ONE READING OF THE CAWCO SLOT, for a launch's gate and a held
   * child's dial alike. `connected`: the hub took the slot's header as this
   * session. `refused`: `needs-auth`, the hub's 401 for a credential it does
   * not know. `again`: still connecting, or `failed` and dialled again now on
   * the header it was launched with, so no credential changes: the hub away
   * (a restart) or slow to answer the slot's `initialize` is no refusal, and
   * Claude Code does not dial a server again whose first connect failed.
   * `off`: a status nothing dials (`disabled`, or no slot at all).
   */
  async #readCawcoSlot(): Promise<
    | { slot: "connected"; servers: McpServerStatus[] }
    | { slot: "refused" }
    | { slot: "again"; why: string }
    | { slot: "off"; status: string }
  > {
    const servers = await this.#handle.mcpServerStatus();
    const cawco = servers.find((server) => server.name === MCP_SERVER_NAME);
    switch (cawco?.status) {
      case "connected":
        return { slot: "connected", servers };
      case "needs-auth":
        return { slot: "refused" };
      case "pending":
        return { slot: "again", why: "connecting" };
      case "failed": {
        const why = `failed${cawco.error ? `: ${cawco.error}` : ""}`;
        try {
          await this.#handle.reconnectMcpServer(MCP_SERVER_NAME);
        } catch (error) {
          return {
            slot: "again",
            why: `${why}; dialled again: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
        return { slot: "again", why };
      }
      case "disabled":
      case undefined:
        break;
    }
    return { slot: "off", status: cawco?.status ?? "missing" };
  }

  /**
   * The held credential ACKed: true once the hub has it. One the hub does
   * not know ({@link CredentialUnknown}) stops the session and says why
   * ({@link #credentialRefused}): false. Anything else is thrown as it was.
   */
  async #acknowledged(credential: string): Promise<boolean> {
    try {
      await acknowledgeSessionCredential(credential);
      return true;
    } catch (error) {
      if (!(error instanceof CredentialUnknown)) {
        throw error;
      }
      this.#credentialRefused();
      return false;
    }
  }

  /**
   * A fresh launch's cawco slot, connected: the ACK that settles the hub's
   * launch goes only once the slot carries the launch's header, so a launch
   * whose slot never connects fails once rather than staying in flight
   * (e75772bb). A slot that `failed` is dialled again on that same header
   * ({@link #readCawcoSlot}) until {@link HUB_AWAY_BOUND_MS}: it once failed
   * the launch at its first reading, and delegates were stopped before their
   * first turn with "CawCo MCP is not connected (failed)." (2026-10-08 07:43,
   * 2026-10-15 07:23) while the hub was up a moment later. Only the hub's
   * refusal of the credential (`needs-auth`) fails it at once.
   */
  async #connectedCawcoSnapshot(): Promise<McpServerStatus[]> {
    const deadline = Date.now() + HUB_AWAY_BOUND_MS;
    let said = "connecting";
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: only the cawco slot gates its credential ACK.
      const read = await this.#readCawcoSlot();
      if (read.slot === "connected") {
        if (said !== "connecting") {
          console.info(
            `[claude] ${this.instanceId}: its CawCo MCP connected on its launch credential after it was dialled again`
          );
        }
        return read.servers;
      }
      if (read.slot === "again" && read.why !== said) {
        said = read.why;
        console.info(
          `[claude] ${this.instanceId}: its CawCo MCP reads ${read.why} at launch; dialled again on its launch credential`
        );
      }
      if (read.slot === "refused") {
        throw new Error(
          "This session didn't start: the hub refused its sign-in to CawCo's tools (needs-auth). Start it again; a fresh start signs in afresh."
        );
      }
      if (read.slot === "off") {
        throw new Error(
          `This session didn't start: its connection to CawCo's tools is off (${read.status}). Start it again.`
        );
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `This session didn't start: its connection to CawCo's tools didn't come up within ${HUB_AWAY_BOUND_MS / 1000} seconds (${read.why}). Start it again.`
        );
      }
      await Bun.sleep(read.why === "connecting" ? 250 : 1000);
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
    // The slot carries this credential, and it is connected: the hub took
    // that header as this session on the connection's every request
    // (delegation-mcp.ts `requestBinding`: an unknown credential is a 401,
    // another session's a 403), so a `connected` slot has already proved
    // what a tool call would. The ACK, authenticated by the same header, is
    // the one call left. A `list_sessions` here read the whole fleet twice
    // over HTTP inside the hub, each read under a 5 s timeout; twenty
    // sessions restored at once sat behind each other's reads, and four
    // failed this gate with "The operation timed out." (2026-10-09).
    const servers = await this.#connectedCawcoSnapshot();
    const cawco = servers.find((server) => server.name === MCP_SERVER_NAME);
    if (
      cawco?.config?.type !== "http" ||
      cawco.config.headers?.Authorization !== `Bearer ${credential}`
    ) {
      throw new Error(
        "This session didn't start: its sign-in to CawCo's tools couldn't be checked. Start it again."
      );
    }
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
   * The credential a child this host attached to was launched with, read off
   * its cawco slot's header: one with none has no way to call CawCo tools
   * (the hub takes no call without one), and is refused. A connected slot is
   * ACKed now (authenticated by that header, so a credential the hub no
   * longer knows is refused). A slot still connecting, or given up, is no
   * refusal: a child that outlived the agent has often had its slot dropped
   * while the agent and the hub restarted, and on a loaded machine it can
   * take far longer than any deadline to come back. The child is attached as
   * it is, a live process this agent holds, and its slot is dialled until it
   * connects ({@link #dialCawco}). `needs-auth` is the hub's refusal of the
   * credential, which stops the session and says why
   * ({@link #credentialRefused}); any other status is refused as before.
   */
  async #verifyHeldCredential() {
    const cawco = (await this.#handle.mcpServerStatus()).find(
      (server) => server.name === MCP_SERVER_NAME
    );
    const header =
      cawco?.config?.type === "http"
        ? cawco.config.headers?.Authorization
        : undefined;
    if (!header?.startsWith("Bearer ")) {
      throw new Error(
        "CawCo couldn't take this session back after a restart: its Claude Code was started without a sign-in to CawCo's tools. Start it again."
      );
    }
    const credential = header.slice("Bearer ".length);
    if (cawco?.status === "connected") {
      // A slot can read connected for a while after the hub it reached went:
      // the ACK is the hub's own word on the credential.
      if (!(await this.#acknowledged(credential))) {
        return { credential, refused: true };
      }
      console.info(`[claude] held credential verified ${this.instanceId}`);
    } else if (cawco?.status === "pending" || cawco?.status === "failed") {
      console.info(
        `[claude] ${this.instanceId}: attached while its CawCo MCP is ${cawco.status === "pending" ? "connecting" : "reconnecting"}; it is dialled until it connects`
      );
      // biome-ignore lint/complexity/noVoid: the attach does not wait on the slot; the dial runs as long as the child does
      void this.#dialCawco(credential);
    } else if (cawco?.status === "needs-auth") {
      // The refusal stops it and says why; what asked hears it was refused.
      this.#credentialRefused();
      return { credential, refused: true };
    } else {
      throw new Error(
        `CawCo couldn't take this session back after a restart: its connection to CawCo's tools is off (${cawco?.status ?? "missing"}). Start it again.`
      );
    }
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

  /**
   * Cuts the turn, and stops every background task the CLI still runs
   * (shells, monitors, subagents, workflows) through its own `stop_task`, so
   * the CLI holds each one stopped by its host: an interrupted session stays
   * idle, and a task whose command the agent then ends in its workspace
   * (session.ts, boundary.ts `endSessionWork`) is not one whose end wakes
   * it. A task already gone is no refusal ("`stop_task` control requests
   * now return success when the target task is already gone", SDK 0.3.163).
   */
  async interrupt(): Promise<void> {
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — a stream that already ended has nothing left to interrupt
    await this.#handle.interrupt().catch(() => {});
    await Promise.all(
      [...this.#background.keys()].map((taskId) =>
        this.#handle.stopTask(taskId).catch((error: unknown) => {
          console.warn(
            `[claude] ${this.instanceId}: its background task ${taskId} could not be stopped: ${error instanceof Error ? error.message : String(error)}`
          );
        })
      )
    );
  }

  async stop(): Promise<void> {
    // No turn starts from here on; the stream ends, and the CLI's stdin with
    // it, only once the effort reads below have landed.
    this.#input.close();
    for (const resolve of this.#permissions.values()) {
      resolve({ behavior: "deny", message: "session stopped" });
    }
    this.#permissions.clear();
    // Not dismissals: the session is going away, and no `tool_result` will
    // arrive for these to be folded onto.
    this.#openQuestions.clear();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — the child may already be gone
    await this.#handle.interrupt().catch(() => {});
    const settled = await this.#turn.settle(SETTLE_TIMEOUT_MS);
    switch (settled.kind) {
      case "answered":
        break;
      case "unanswered":
        console.warn(
          `[claude] ${this.instanceId}: its turn still ran ${settled.after} ms after the interrupt; the stop closes it`
        );
        break;
      default: {
        const unhandled: never = settled;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    // The interrupted turn's end read the effort: it lands while the query
    // is open. A CLI that answers nothing within the turn's own wait gets
    // the close, and the read says it failed.
    const read = await readWithin(SETTLE_TIMEOUT_MS, () =>
      Promise.all(this.#effortReads)
    );
    switch (read.kind) {
      case "answered":
        break;
      case "unanswered":
        console.warn(
          `[claude] ${this.instanceId}: its effort read was still unanswered ${read.after} ms into the stop; the stop closes it`
        );
        break;
      default: {
        const unhandled: never = read;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
    this.#input.end();
    this.#handle.close();
    // biome-ignore lint/suspicious/noEmptyBlockStatements: best effort — stop() already tore everything down; only a pump that was still mid-await needs waiting for
    await this.#pump.catch(() => {});
    await forgetWakeups(this.instanceId);
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
    import("@anthropic-ai/claude-agent-sdk").SessionMessage | SDKSessionMessage
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
   * The machine's Claude Code: installed or not, the version it says it is
   * (its `--version`, read as the capabilities probe reads it: sessions run
   * this one, which updates itself), and every account dir's sign-in, which
   * is also the machine's word on Claude (signed in when any account is). No
   * model catalog: that is each account's, which its sessions' initialize
   * responses report and the hub keeps. A version below the floor is the
   * machine's sentence on why no session starts ({@link versionRefusal}).
   * Read on every report and each minute's re-read, which is where a
   * `claude update` is seen ({@link claudeHostVersion}). With no Claude Code
   * on PATH it is not installed and unauthenticated, as pi and OpenCode say
   * of theirs, and no dir is asked: there is no CLI to ask, so the report
   * carries no `accounts` and the hub leaves each dir's sign-in as it was.
   */
  async detect(): Promise<MachineHarnessReport> {
    probeStarted();
    if (resolveClaudeExecutable() === undefined) {
      sawTool("claude", "missing");
      this.auth = "unauthenticated";
      return {
        harness: "claude",
        installed: false,
        auth: "unauthenticated",
        authReason: CLAUDE_NOT_INSTALLED,
        refused: "not-installed",
        capabilities: CLAUDE_CAPABILITIES,
      };
    }
    // Side by side: each is bounded on its own (`auth status` 20 s, the wait for `--version` 5 s).
    const [read, said] = await Promise.all([
      accountReports(),
      claudeHostVersion(),
    ]);
    const signins = claudeSignins(read);
    // Dirs that gave no answer leave the machine's word as it was.
    this.auth = signins.auth ?? this.auth;
    const version = said.kind === "answered" ? said.value : undefined;
    const refused = versionRefusal(said);
    // A hand update (or one the catalog ran) moves the machine's tool row too.
    if (version) {
      sawTool("claude", version);
    }
    return {
      harness: "claude",
      installed: true,
      ...(version ? { version } : {}),
      ...signins,
      ...(refused ? { authReason: refused, refused: "version" as const } : {}),
      capabilities: CLAUDE_CAPABILITIES,
    };
  }

  /**
   * The machine's keepers as every claude session reaches them, one
   * connection each, dialled lazily: a machine with no sessions never needs
   * a keeper, and the install-time error lands on the spawn that needed it
   * (with an instance to report against) rather than at import time.
   */
  readonly #keepers = new KeeperPool();

  /**
   * The current keeper's connection, which every start goes to. A dead
   * connection is dialled again, and so is one to a keeper that is draining
   * or that the machine's endpoint no longer names; the CHILDREN are
   * unaffected, which is the whole property sessiond exists to provide.
   */
  async sessiond(): Promise<SessiondClient> {
    const client = await this.#keepers.current();
    this.#swept ??= this.#sweepMcpConfigs();
    await this.#swept;
    return client;
  }

  /** This agent's one removal of the MCP configs of children that are gone. */
  #swept: Promise<void> | undefined;

  /**
   * The MCP config files ({@link mcpConfigOffArgv}) of Claude children that
   * no longer exist on any keeper: an agent that stopped before its child did
   * never saw that child end. Done on the first connection, before this agent
   * writes a file of its own; a failure is said and left to the next agent's
   * start.
   */
  async #sweepMcpConfigs(): Promise<void> {
    try {
      const procs = await this.#keepers.held();
      sweepMcpConfigs(
        new Set(
          procs.flatMap((proc) => {
            const id = parseProcId(proc.procId);
            return proc.alive && id.kind === "claude" ? [id.instanceId] : [];
          })
        )
      );
    } catch (error) {
      console.warn(
        `[claude] removing the MCP configs of ended children failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Claude Code saves a tool result too large to hand the model under the
   * session's own folder in its config dir, and tells the model to read it
   * there: "Output has been saved to <config dir>/projects/<slug>/<session
   * id>/tool-results/mcp-crw-crw_scrape-….txt … Slice by character range via
   * Bash instead" (seen on 2026-10-17). So the session's id is known
   * before its boundary starts: a resume goes on under its own; a new
   * session or a fork takes one minted here, the SDK's `sessionId` ("Use a
   * specific session ID … when `forkSession` is also set", sdk.d.ts
   * 0.3.301). The config dir and slug are the ones {@link spawn} runs it in.
   */
  async spill(
    spec: SpawnPayload,
    cwd: string
  ): Promise<{ dir: string; spec: SpawnPayload }> {
    const goesOn = spec.resume && !spec.resume.fork ? spec.resume : undefined;
    const sessionId = goesOn ? goesOn.sessionKey : crypto.randomUUID();
    const account = await launchAccountOf(spec);
    const real = await realpath(cwd).catch(() => cwd);
    return {
      dir: join(
        sessionConfigDir({ accountId: account ?? null }),
        "projects",
        projectSlug(real),
        sessionId,
        "tool-results"
      ),
      spec: goesOn
        ? spec
        : { ...spec, options: { ...(spec.options ?? {}), sessionId } },
    };
  }

  async spawn(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession> {
    // THE VERSION FLOOR: no Claude Code below it starts a session here, on
    // a start, a wake or a relaunch alike (all of them come through here).
    const executable = await claudeToStart();
    // The child is spawned under sessiond, unconditionally — no flag, no
    // in-process fallback (PLAN.md C7). `procId` is the instance id: stable
    // across agent restarts, which is what lets the returning agent match a
    // surviving child to the row it belongs to. It goes to the current
    // keeper; a process a retiring keeper still holds under the id is the
    // one this replaces.
    const client = await this.sessiond();
    await this.#keepers.replaceElsewhere(
      procIdFor("claude", ctx.instanceId),
      client
    );
    // A fresh process schedules its own wake-ups: what an earlier one kept
    // (a crash ended it, so its stop never took the record away) goes now,
    // before this one can keep any, so no later attach reads its counts.
    // An attach to a process still running keeps the record (`adopt`).
    await forgetWakeups(ctx.instanceId);
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
    // Whether the conversation it resumes is where its CLI reads it: asked
    // before the launch, and again of a CLI that ends on its own, which is
    // then that conversation gone ({@link processEnded}).
    const resumed = spec.resume;
    const conversationKept = resumed
      ? async (): Promise<boolean> =>
          resumed.fork
            ? !!(await claudeSessionFile(resumed.sessionKey, ctx.cwd))
            : !!(await transcriptIn(configDir, resumed.sessionKey, cwd))
      : undefined;
    if (spec.resume) {
      // A conversation goes on in the dir it runs in now, carried whole
      // into it first, for the launch that places a row on its account
      // carries it here. A fork reads its origin's where it is: it runs on
      // its origin's account, and its origin may be running.
      if (spec.resume.fork) {
        if (!(await conversationKept?.())) {
          throw conversationGone();
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
        if (!(await conversationKept?.())) {
          throw conversationGone();
        }
      }
    }
    // The session's data is in this dir now: the hub's row says its account
    // from here on, never before the data is there.
    ctx.frame({
      type: "system",
      subtype: SESSION_DIR_READ,
      account_id: place.accountId,
    } as NeutralMessage);
    const fleetDenyList = await sessionFleetDenials();
    // What this process has scheduled is known from its start: nothing until
    // a turn of it ends and says otherwise. Kept, so an agent that attaches
    // to it later knows too, though no turn of it has ended since (one its
    // account's limit refused ends with no `Stop`, which alone says them),
    // and does not hold a move for a turn's end that a session held at its
    // limit never reaches.
    await keepWakeups(ctx.instanceId, { all: 0, once: 0 });
    const session = sessionSpecOf(spec, account);
    const launch = await launchFleet(session, ctx);
    return new ClaudeSession(
      ctx.instanceId,
      ctx,
      ctx.cwd,
      {
        ...session,
        options: {
          ...session.options,
          disallowedTools: [
            ...(session.options.disallowedTools ?? []),
            ...launch.denied,
          ],
        },
      },
      fleetDenyList,
      {
        ...(conversationKept ? { conversationKept } : {}),
        fleetMcp: launch.fleet,
        placedHooks: launch.hooks,
        fleetSettings: launch.settings,
      },
      { client, procId: procIdFor("claude", ctx.instanceId), executable }
    );
  }

  async reattach(
    spec: SpawnPayload,
    ctx: HarnessContext
  ): Promise<HarnessSession | undefined> {
    const { procs } = await this.custodyCandidates();
    const proc = procs.find(
      (child) => child.procId === ctx.instanceId && child.alive
    );
    if (!proc) {
      return undefined;
    }
    return this.adopt(spec, ctx, {
      afterSeq: resumeCursor(procEpoch(proc.epoch, proc.pid), ctx.ingested),
      head: proc.head,
      turnRunning: await this.turnRunning(ctx.instanceId, proc.head),
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
   * at once is the very wait this answer must not sit behind. Read from the
   * keeper that holds it; one no keeper holds any more runs no turn.
   */
  async turnRunning(instanceId: string, head: number): Promise<boolean> {
    const held = await this.#keepers.holding(procIdFor("claude", instanceId));
    if (!held) {
      return false;
    }
    const { client } = held;
    for (let span = TURN_LOOK_LINES; ; span *= 4) {
      const from = Math.max(head - span, 0);
      const activity = new ChildActivity("claude");
      // biome-ignore lint/performance/noAwaitInLoops: each look reaches further back only when the one before it found nothing about a turn
      const read = await readRing(
        client,
        procIdFor("claude", instanceId),
        from,
        head,
        (event) => activity.read(parseLine(event.data))
      );
      // Let go since it was listed: no keeper holds it, so it runs no turn.
      if (read.kind === "gone") {
        return false;
      }
      if (activity.decided || from === 0 || read.oldest > from + 1) {
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
    spec: SpawnPayload,
    ctx: HarnessContext,
    options: {
      afterSeq?: number;
      /** The ring's last seq as sessiond listed it. */
      head: number;
      /** {@link turnRunning}'s answer for this child. */
      turnRunning: boolean;
    }
  ): Promise<HarnessSession> {
    const { instanceId } = spec;
    const { head, turnRunning } = options;
    const procId = procIdFor("claude", instanceId);
    // The keeper that holds it, current or retiring: the session keeps that
    // connection for as long as its process runs there.
    const child = await this.#keepers.holding(procId);
    if (!child) {
      throw new Error(
        "This session's Claude Code process ended before CawCo could reconnect to it after a restart, so the session stopped. What you sent that it hadn't read is kept: start the session again and it goes to the new process."
      );
    }
    const { client } = child;
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
    let wakeups: Wakeups | undefined;
    let sessionId = spec.resume?.sessionKey ?? null;
    // `head` is the listing's, taken before every earlier row was adopted; a
    // ring that has since dropped past it ends the read rather than stalling
    // every later row behind this one ({@link readRing}).
    const read = await readRing(client, procId, RING_START, head, (event) => {
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
    // Ended and let go while it was read: no keeper holds it any more.
    if (read.kind === "gone") {
      throw new Error(`no keeper holds a live child ${procId}`);
    }
    const { oldest } = read;
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
    // It runs under what its spawn says, read as a launch reads it
    // ({@link sessionSpecOf}): its mode goes in at construction, ahead of
    // the prelude's asks, and Caw's gate, a fence and its caller's MCP
    // servers with it. Its account is the one its process runs on, which the
    // hub sends an attach. What only a launch uses (its flags, its fleet
    // servers, the fleet's denials it was started with) its CLI holds
    // already: nothing is spawned, so the SDK is handed the `claude` on
    // PATH, not the version gate's: a process that runs already is taken
    // back whatever its version, and retired at rest ({@link
    // ClaudeSession.outdated}).
    const executable = resolveClaudeExecutable();
    if (!executable) {
      throw new Error(CLAUDE_NOT_INSTALLED);
    }
    const session = new ClaudeSession(
      instanceId,
      ctx,
      ctx.cwd,
      sessionSpecOf(spec, spec.accountDir?.accountId),
      [],
      {},
      {
        client,
        procId,
        executable,
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
    await adoptKeptWakeups(session, wakeups, sessionId, ctx.cwd);
    return session;
  }

  /** The keepers there for custody to read, the current one first. */
  async custodyKeepers(): Promise<string[]> {
    await this.sessiond();
    return await this.#keepers.endpoints();
  }

  /** One keeper's word on Claude's children: its listing of them, its end, or why it could not be read. */
  async custodyReading(keeper: string): Promise<KeeperReading> {
    const reading = await this.#keepers.read(keeper);
    return reading.kind === "listed"
      ? {
          kind: "listed",
          procs: reading.procs.filter(
            (proc) => parseProcId(proc.procId).kind === "claude"
          ),
        }
      : reading;
  }

  /**
   * What every keeper is still holding for this machine, the current one's
   * first. Each child carries its keeper's epoch, the space its seqs count
   * in.
   */
  async custodyCandidates(): Promise<{ procs: HeldProc[] }> {
    await this.sessiond();
    return {
      procs: (await this.#keepers.held()).filter(
        (proc) => parseProcId(proc.procId).kind === "claude"
      ),
    };
  }

  /**
   * Every stored session, in the agent's own config dir and each account's:
   * the SDK never looks in an account's dir, so each is read here
   * ({@link listingRead}).
   */
  async listSessions(dir?: string): Promise<NeutralSessionInfo[]> {
    // The dir the agent itself was started with. Scoped to a project, the SDK
    // lists it, with the project's git worktrees; unscoped, it is read here
    // like every account's dir, a few transcripts at a time.
    const sdkDir = process.env.CLAUDE_CONFIG_DIR ?? claudeHome();
    const own = dir ? await listSessions({ dir }) : [];
    const slug = dir ? projectSlug(await realpath(dir)) : null;
    const configDirs = [
      ...(dir ? [] : [sdkDir]),
      ...accountIds()
        .map(accountConfigDir)
        .filter((configDir) => configDir !== sdkDir),
    ];
    const files: { file: string; sessionId: string }[] = [];
    for (const configDir of configDirs) {
      const projects = join(configDir, "projects");
      // biome-ignore lint/performance/noAwaitInLoops: a handful of config dirs, each listed into the shared `files`
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
    const read = await listingRead(files, ({ file, sessionId }) =>
      sessionInfoAt(file, sessionId, transcriptEnds)
    );
    return [
      ...own,
      ...read.filter((info): info is SDKSessionInfo => info !== undefined),
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
      default:
        return undefined;
    }
  }

  syncFleet(config: import("@cawco/core").MachineFleetConfig) {
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
