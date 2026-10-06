import { generateCodeChallenge, generateCodeVerifier } from "@cawco/auth";
import type {
  AgentBusyReport,
  AgentRow,
  ArchiveView,
  BuildInfo,
  ClaudeLimits,
  CommandResult,
  ContinuationJob,
  ControlPayload,
  DelegateEvent,
  Envelope,
  FleetConfig,
  FleetHook,
  FleetMcpConfig,
  FleetSyncReport,
  FramePayload,
  FsImage,
  FsPayload,
  GeneratedImage,
  GitChanges,
  HarnessKind,
  HarnessReport,
  HeartbeatAckPayload,
  HeartbeatPayload,
  HookDraft,
  IngestMark,
  InstanceRow,
  MachineHookScript,
  MachineMemorySet,
  ModelInfo,
  NeutralAssistantMessage,
  NeutralOrigin,
  NeutralResultMessage,
  NeutralSessionInfo,
  NeutralUserMessage,
  OpenCodeGoLimits,
  PermissionMode,
  PermissionResult,
  PreviewSource,
  RegisterAckPayload,
  Rule,
  RuleDraft,
  SendMode,
  SendPayload,
  SendRecord,
  SentMessage,
  SessionAddress,
  SessionCredentialInstall,
  SessionCustody,
  SessionEndIntent,
  SessionMessage,
  SessionPulse,
  SessionTooling,
  SkillFile,
  SpawnPayload,
  SupervisorEvent,
  SupervisorStatusSignal,
  ToolState,
  ToolStatus,
  TranscriptWhere,
  UpdateReport,
  UsageBucket,
  UsageLimitsResponse,
  UsageSpend,
  Verb,
  WorkspaceRef,
} from "@cawco/core";
import {
  ACKNOWLEDGE_BINARY_UPDATE,
  AGENT_BUSY,
  ASK_USER_QUESTION,
  agentProblem,
  archiveRefusal,
  BUCKET_MS,
  CANCEL_BINARY_UPDATE,
  CLAUDE_CONVERSATION_GONE,
  CONFIGURE_BINARY_UPDATES,
  CONTROL_CONTEXT_USAGE,
  CONTROL_GET_SESSION_INFO,
  CONTROL_GET_SESSION_MESSAGES,
  CONTROL_GIT_CHANGES,
  CONTROL_INTERRUPT,
  CONTROL_LIST_SESSIONS,
  CONTROL_MODEL_CATALOG,
  CONTROL_READ_SESSION_CONTEXT,
  CONTROL_RELOAD_SKILLS,
  CONTROL_RUN_COMMAND,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SLEEP,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_CREATE,
  contextFitRefusal,
  delegateAskText,
  deriveTitleFromFirstMessage,
  EFFORT_NONE,
  EFFORT_READ,
  estimateTokens,
  FLEET_STATUS,
  FLEET_SYNC,
  GENERATE_IMAGE,
  HARNESSES,
  HOOK_TEMPLATES,
  hookProblem,
  IMAGE_GENERATION_TIMEOUT_MS,
  INSPECT_CONFIG,
  INSTALL_SESSION_CREDENTIAL,
  isEffortLevel,
  LIVE_CREDENTIAL_ENROLLMENT_REFUSAL,
  MCP_OAUTH_RETURN_PATH,
  MESSAGES_HELD,
  MESSAGES_READ,
  MESSAGES_STORED,
  memoryDocProblem,
  PREVIEW_START,
  PREVIEW_STOP,
  PROVIDER_RETRY,
  parseAgentFrontMatter,
  QUESTION_DISMISSED,
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  REMOVED_MACHINE,
  RESOLVE_PERMISSION,
  RESTART_RESUMABLE,
  RULE_TEMPLATES,
  readProvenance,
  reportMarker,
  ruleProblem,
  runDoing,
  SUMMARISER_OUTPUT_RESERVE_TOKENS,
  SUMMARY_CAP_TOKENS,
  TARGET_HEADROOM_TOKENS,
  TOOL_CATALOG,
  toolSpec,
  UPDATE_CAWCO,
  validateWorkflow,
  WIRE_PROTOCOL,
  WORKSPACE_CREATE_TIMEOUT_MS,
} from "@cawco/core";
import {
  BINARY_UPDATE_PHASES,
  type BinaryUpdatePhase,
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { Elysia, t, ValidationError } from "elysia";
import { websocket } from "elysia/websocket";
import { createBinaryUpdates } from "./binary-updates";
import { DB_PATH, HUB_VERSION, SPAWN_START_TIMEOUT_MS } from "./config";
import {
  type ContinuationSource,
  type ContinueRequest,
  extractTranscript,
  finishedAnswer,
  gitSection,
  liveScope,
  openingMessage,
  type PreparedContinuation,
  scopeChars,
  summariserPrompt,
  transcriptModel,
} from "./continuation";
import { dashboardErrorsRoutes } from "./dashboard-errors";
import type {
  AgentAuth,
  ContinuationRow,
  DbShape,
  InstanceKind,
  SentMessageRow,
} from "./db";
import { hashHookMaterial } from "./db";
import { delegateTypesRoutes, makeDelegateTypes } from "./delegate-types";
import { hubHttpUrl } from "./delegation-actions";
import { createDelegationMcp } from "./delegation-mcp";
import { FleetMcp } from "./fleet-mcp";
import { hidden } from "./hidden";
import { joinRoutes } from "./join";
import {
  createKeepAliveScheduler,
  isKeepAlive,
  type KeepAliveRow,
  keepAliveResult,
  keepAliveState,
  keepAliveUsage,
} from "./keep-alive";
import { probe } from "./llm";
import { MeaningJudge } from "./meaning";
import { externalizeImages, mediaContentType, mediaFilePath } from "./media";
import type { PendingShape } from "./pending";
import {
  answerPermission,
  answerWorkflow,
  onPermissionAnswer,
  onWorkflowAnswer,
} from "./pending";
import { resolveMarketplacePlugins } from "./plugins";
import { previewFrame, previewTargets } from "./preview";
import { type HubSocket, type RegistryShape, toDashboard } from "./registry";
import { RuleEngine } from "./rules";
import { createSessionIdentities } from "./session-identity";
import { createSessionLifecycle } from "./session-lifecycle";
import { hashFiles, resolveSkill } from "./skills";
import { createStreamHub } from "./stream";
import { suggest } from "./suggest";
import { SupervisorEngine } from "./supervisor";
import type { TelegramBridge } from "./telegram";
import {
  createTranscripts,
  type HistoryRead,
  type TranscriptPayload,
} from "./transcripts";
import { UsageCounter } from "./usage-count";
import {
  createWorkItems,
  LEAF_DELEGATE_REFUSAL,
  SESSION_TITLE_DESCRIPTION,
  titleProblem,
  WAIT_ITEM_LIMIT,
  WorkItemRefusal,
} from "./work-items";
import { workflowRoutes } from "./workflows/routes";
import { createWorkflowRuntime } from "./workflows/runtime";

/** The frame a forwarded `control` comes back as, whoever asked for it. */
type ControlResult = Extract<FramePayload, { kind: "control_result" }>;

/** A search hit as returned by the agent's TranscriptIndex. */
interface SearchHitWire {
  cwd: string | null;
  docId: string;
  harness: string;
  model: string | null;
  role: string;
  score: number;
  sessionId: string;
  sidechain: boolean;
  snippet: string;
  timestamp: string | null;
}

/** A busy probe is polled in a loop before a restart, so it answers fast or not at all. */
const BUSY_TIMEOUT_MS = 5000;

/**
 * How far back a register will reach to restart a session it finds orphaned.
 *
 * Ours, because nothing in the protocol declares a session worth reviving. A
 * daemon restart — a crash, an update, a `systemctl restart` — puts the machine
 * back inside seconds to a couple of minutes, and the sessions that were alive
 * across that gap are the ones the operator was in the middle of. Half an hour
 * covers that with room to spare while excluding the case that produced the
 * defect this bound exists for: a machine that had been down for a day and a
 * half came back and the hub cheerfully re-spawned every session it had ever
 * held, because an orphan from 36 hours ago and an orphan from 30 seconds ago
 * were treated identically. Older rows are not lost — they settle as `sleeping`
 * and the operator wakes the ones they want.
 */
const RESTORE_HORIZON_MS = 30 * 60_000;

/**
 * How long a send to a machine whose socket just closed waits for it to
 * register again. An agent restart (every deploy) is a socket closed and a
 * register about two seconds later; a send in that gap used to fail "not
 * connected" though its session survived the restart. A machine not back
 * within this is away, and what waited for it fails as it always did.
 */
const RECONNECT_GRACE_MS = 60_000;

/**
 * At most one activity write per session per minute. The daemon pulses up to
 * once a second while a session is working, and `updatedAt` is read in minutes
 * by everything that reads it at all — the rail's age column, the restore
 * horizon — so anything finer is a write nobody can observe.
 */
const ACTIVITY_TOUCH_MS = 60_000;

/**
 * And how many, newest first.
 *
 * Ours, because a register is one message and the respawns it triggers all land
 * on one machine at once. Twenty simultaneous harness launches is already a
 * heavy but survivable burst; the 178 rows that motivated this work would have
 * been a fork bomb wearing a recovery hat. Everything past the cap settles as
 * `sleeping`, which is a wake button away.
 */
const RESTORE_MAX = 20;

/**
 * How long a `starting` row is given before a heartbeat that does not list it
 * counts as evidence that the spawn never landed.
 *
 * Ours: three beats at the daemon's 15s `HEARTBEAT_INTERVAL` (`packages/agent/
 * src/daemon.ts`). The race it covers is real and one-sided — the hub writes
 * `starting` the instant it forwards a spawn, and the beat already in flight
 * from that machine cannot possibly know about it — so the grace only has to
 * outlast the round trip plus a harness launch. It applies to `starting` alone:
 * a row that was confirmed `running` and then went unlisted is not racing
 * anything.
 */
const HEARTBEAT_SETTLE_GRACE_MS = 45_000;

/** An update is a pull, an install and a dashboard build — minutes, not seconds. */
const UPDATE_TIMEOUT_MS = 10 * 60_000;

/** Reading one file off a machine: it answers about as fast as a disk does. */
const READ_TIMEOUT_MS = 10_000;
/** Deduplicate recently orphaned replies without retaining every request forever. */
const UNROUTED_REPLY_LIMIT = 4096;
/**
 * Workspace controls other than create/archive: enough for their boundary work.
 * Create and its discard share the longer git-plus-boundary budget; archive
 * may be queued behind the create it must remove.
 */
const WORKSPACE_TIMEOUT_MS = 60_000;
/**
 * How long a settled continuation stays in the table dashboards follow. Ours:
 * five minutes lets a dashboard that was reconnecting when it settled still
 * hear how it ended, and keeps the table to the few jobs of the moment.
 */
const CONTINUATION_KEPT_MS = 5 * 60_000;
/** The words a continuation stopped by its Cancel ends with. */
const CONTINUATION_CANCELLED = "the continuation was cancelled";
/** What a request a machine was answering gets when its socket closes. */
const MACHINE_DISCONNECTED =
  "The machine disconnected during this request. Completion is unknown; check the output before retrying. No automatic retry was submitted.";

/**
 * A step that could not finish because its machine went away. Not a failure:
 * the continuation waits, and the machine's next register carries it on.
 */
class MachineAway extends Error {
  constructor(machineId: string) {
    super(`machine ${machineId} is not connected`);
    this.name = "MachineAway";
  }
}
/** The largest frame a machine may send the hub (see the agent socket). */
const AGENT_FRAME_LIMIT_BYTES = 512 * 1024 * 1024;

interface ContinueOutcome {
  /** Whether the source had been compacted: its live context starts at a summary. */
  compacted: boolean;
  /** Messages read: the live chain, the whole transcript, and the live scope. */
  entries: { live: number; whole: number; scope: number };
  liveContextTokens: number;
  /** The new session's first message, as sent. */
  opening: string;
  openingTokens: number;
  sizes: { artifacts: number; middle: number; tail: number };
  summariseInputTokens: number;
  /** Null when there was nothing before the tail, so no summariser ran. */
  summariserInstanceId: string | null;
  summary: string | null;
  targetInstanceId: string;
}

/**
 * Where a conversation lives, resolved from its id alone. `sessionId` is the
 * key the machine stores the transcript under — the SDK's, which for a session
 * the hub spawned is not the instance id the reader addressed it by.
 */
interface SessionLocation {
  cwd: string;
  harness: HarnessKind;
  id: string;
  machineId: string;
  sessionId: string;
}

/**
 * How many conversations one naming request may ask about. A reader's open tabs
 * are a couple of dozen at the outside; the cap is what keeps a hand-written
 * body from turning a single request into a fleet-wide transcript sweep.
 */
const TITLE_ASK_LIMIT = 64;

/**
 * A rule draft as the wire carries it — shared by create (POST, the hub mints
 * the id) and edit (PUT to an id that already exists). Validated loosely here
 * and strictly by `ruleProblem`, so the form and the hub refuse in the same
 * sentences.
 */
const harnessSchema = t.Union([
  t.Literal("claude"),
  t.Literal("opencode"),
  t.Literal("pi"),
]);
/** A work item's acceptance checks: `delegate`'s and `set_item_checks`'s. */
const checksSchema = t.Array(
  t.Object({
    name: t.String(),
    command: t.String(),
    expect: t.Optional(t.String()),
    timeoutSec: t.Optional(t.Number()),
  }),
  { minItems: 1 }
);
/** Continue in new session: every field of the summariser and target is the caller's to name. */
const permissionModeSchema = t.Union([
  t.Literal("default"),
  t.Literal("acceptEdits"),
  t.Literal("bypassPermissions"),
  t.Literal("plan"),
  t.Literal("dontAsk"),
  t.Literal("auto"),
]);

const continueBody = t.Object({
  summarizer: t.Object({
    harness: harnessSchema,
    model: t.String({ minLength: 1 }),
  }),
  target: t.Object({
    harness: harnessSchema,
    model: t.String({ minLength: 1 }),
    machineId: t.Optional(t.String({ minLength: 1 })),
    cwd: t.Optional(t.String({ minLength: 1 })),
    effort: t.Optional(
      t.Union([
        t.Literal("low"),
        t.Literal("medium"),
        t.Literal("high"),
        t.Literal("xhigh"),
        t.Literal("max"),
      ])
    ),
    // The mode the new session is asked to run in, and the one it takes when
    // none is asked (the caller's own, else bypassPermissions). A harness with
    // modes gets an explicit mode; one with none (pi) records none and
    // refuses one asked of it. The hub's `settleMode` decides.
    permissionMode: t.Optional(permissionModeSchema),
    fallbackPermissionMode: t.Optional(permissionModeSchema),
    scratch: t.Optional(
      t.Object({
        worktree: t.Optional(t.Boolean()),
        baseCwd: t.Optional(t.String()),
      })
    ),
    bootstrap: t.Optional(t.Object({ repo: t.String(), baseDir: t.String() })),
    projectId: t.Optional(t.String()),
  }),
  note: t.Optional(t.String()),
});

const ruleBody = t.Object({
  name: t.String(),
  enabled: t.Boolean(),
  pattern: t.String(),
  matchKind: t.Union([
    t.Literal("phrase"),
    t.Literal("regex"),
    t.Literal("meaning"),
  ]),
  caseSensitive: t.Boolean(),
  wholeWord: t.Boolean(),
  watch: t.Union([t.Literal("text"), t.Literal("thinking"), t.Literal("both")]),
  reply: t.String(),
  timing: t.Union([
    t.Literal("turn"),
    t.Literal("message"),
    t.Literal("immediate"),
  ]),
  interrupt: t.Boolean(),
  repeat: t.Boolean(),
  scope: t.Object({
    machineId: t.Optional(t.String()),
    projectId: t.Optional(t.String()),
    harness: t.Optional(t.String()),
    model: t.Optional(t.String()),
  }),
  trigger: t.Optional(
    t.Union([t.Literal("pattern"), t.Literal("every-turn")], {
      default: "pattern",
    })
  ),
  action: t.Optional(
    t.Union([t.Literal("reply"), t.Literal("llm")], { default: "reply" })
  ),
  prompt: t.Optional(t.Union([t.String(), t.Null()], { default: null })),
});

export interface HubServices {
  /**
   * What this hub was built from, read before it serves: the first frame every
   * dashboard receives carries it, so no socket ever meets a hub that has not
   * yet said which commit it runs.
   */
  readonly build: BuildInfo;
  readonly db: DbShape;
  readonly pending: PendingShape;
  readonly registry: RegistryShape;
  /** Absent unless the hub was given a bot token; every call site guards for it. */
  readonly telegram?: TelegramBridge;
}

const isEnvelope = (value: unknown): value is Envelope =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as Envelope).verb === "string" &&
  typeof (value as Envelope).machineId === "string";

const ack = (envelope: Envelope): Envelope<{ ok: true }> => ({
  verb: envelope.verb,
  machineId: envelope.machineId,
  payload: { ok: true },
});

/**
 * `register`'s ack, carrying the ingest ledger for the instances the daemon
 * says it is holding (sessiond design §7, step 3): where each attached `Query`
 * starts reading, so what a child wrote while no agent was reading reaches
 * this hub exactly once.
 */
const registerAck = (
  envelope: Envelope,
  ingested: Record<string, IngestMark>
): Envelope<RegisterAckPayload> => ({
  verb: envelope.verb,
  machineId: envelope.machineId,
  payload: { ok: true, ingested, addressContract: true },
});

/** Sent back as a frame, the only verb a dashboard renders. */
const failure = (
  envelope: Envelope,
  message: string
): Envelope<{ kind: "error"; verb: Verb; message: string }> => ({
  verb: "frames",
  machineId: envelope.machineId,
  instanceId: envelope.instanceId,
  requestId: envelope.requestId,
  payload: { kind: "error", verb: envelope.verb, message },
});

/**
 * The hub routes on envelope fields and is otherwise payload-opaque (NEW.md
 * §6); `hostname`/`os`/`tools` on register, `cwd`/`options.resume`/`scratch`/
 * `projectId`/`title`/`permissionMode`/`model` on spawn, `discard` on stop,
 * `kind` on a frame, `method`/`args` on a control and a `control_result`'s
 * `result` are the sanctioned peeks.
 */
const peek = (payload: unknown, key: string): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
};

/** Settings reported by the harness, including a live mode change's receipt. */
const peekSessionSettings = (
  payload: unknown
): { model?: unknown; permissionMode?: unknown } | undefined => {
  const body = payload as {
    kind?: string;
    ok?: boolean;
    result?: { permissionMode?: unknown };
    message?: Record<string, unknown>;
  };
  if (body.kind === "control_result") {
    const mode = body.ok ? body.result?.permissionMode : undefined;
    return typeof mode === "string" ? { permissionMode: mode } : undefined;
  }
  const frame = body.message;
  if (frame?.type !== "system") {
    return undefined;
  }
  if (frame.subtype === "init") {
    return { model: frame.model, permissionMode: frame.permissionMode };
  }
  if (frame.subtype === "model_fallback") {
    return { model: frame.fallback_model };
  }
  return undefined;
};

/** The last path segment — how the rail names a session. */
const leaf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

/**
 * Renders a parked ask readably for the parent session that has to answer it:
 * a question's text and option labels verbatim, or a tool's name and its input
 * summary. The parent reads this off a peer message and answers with the
 * `answer_delegate` tool, so the phrasing has to carry every choice it needs.
 */
const renderDelegateAsk = (payload: unknown): string => {
  const toolName = peek(payload, "toolName");
  const input = (payload as { input?: unknown } | null)?.input;
  const questions = (input as { questions?: unknown } | null)?.questions;
  if (
    (peek(payload, "requestKind") === "question" ||
      toolName === ASK_USER_QUESTION) &&
    Array.isArray(questions) &&
    questions.length > 0
  ) {
    return questions
      .map((question, index) => {
        const q = question as { question?: unknown; options?: unknown };
        const options = Array.isArray(q.options)
          ? q.options
              .map((option) => (option as { label?: unknown }).label)
              .filter((label): label is string => typeof label === "string")
              .map((label) => `- ${label}`)
              .join("\n")
          : "";
        const text = typeof q.question === "string" ? q.question : "";
        return `Q${index + 1}: ${text}${options ? `\n${options}` : ""}`;
      })
      .join("\n");
  }
  const summary =
    input === undefined || input === null
      ? ""
      : // biome-ignore lint/style/noNestedTernary: input is either a string or an arbitrary value to stringify — two mutually exclusive shapes, not a simplifiable condition.
        typeof input === "string"
        ? input
        : JSON.stringify(input);
  return `${toolName ?? "a tool"}${summary ? ` — ${summary}` : ""}`;
};

/**
 * The session a `spawn` resumes, so the instance row records what it re-opened.
 * A fork is the exception: it *reads* the origin conversation but creates a new
 * one, so claiming the origin's id here would trip openInstance's
 * one-conversation-one-row guard. Left blank, the fork's own init frame stamps
 * the real id via noteInstanceSession.
 */
const peekResume = (payload: unknown): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { resume } = payload as { resume?: unknown };
  if (typeof resume !== "object" || resume === null) {
    return undefined;
  }
  if ((resume as { fork?: unknown }).fork) {
    return undefined;
  }
  const key = (resume as { sessionKey?: unknown }).sessionKey;
  return typeof key === "string" ? key : undefined;
};

/**
 * The hub row is the single authority for an instance's session key. A spawn
 * addressed to an existing row resumes under the row's key, whatever the
 * client sent: the dashboard once resumed two opencode sessions under their
 * cawco instance ids, the harness rejected both, and the rows went `error`.
 * A row that never reported a key has nothing to resume, and a key the
 * client made up for it is refused rather than tried. Mutates `payload` in
 * place; returns the reason the spawn must be refused, or `undefined` when
 * it may go out.
 */
const enforceRowSessionKey = (
  row: InstanceRow | undefined,
  payload: unknown
): string | undefined => {
  if (!row) {
    return undefined;
  }
  const asked = peekResume(payload);
  if (asked === undefined) {
    return undefined;
  }
  if (!row.sessionId) {
    return `instance ${row.id} has no session key on record; refusing to resume it under "${asked}"`;
  }
  if (asked !== row.sessionId) {
    console.warn(
      `[hub] spawn ${row.id} asked to resume "${asked}"; using the row's session key "${row.sessionId}"`
    );
    (payload as { resume: { sessionKey: string } }).resume.sessionKey =
      row.sessionId;
  }
  return undefined;
};

/** A spawn asking for scratch isolation, or for a session that is never stored. */
const peekKind = (payload: unknown): InstanceKind => {
  if (typeof payload !== "object" || payload === null) {
    return "mainline";
  }
  const { scratch, persistSession } = payload as {
    scratch?: unknown;
    persistSession?: unknown;
  };
  return scratch || persistSession === false ? "scratch" : "mainline";
};

/** Which harness a spawn names; absent reads as claude. */
const peekHarness = (payload: unknown): string | undefined =>
  peek(payload, "harness");

/** The session a spawn is a delegate of, so its row nests under the parent. */
const peekParent = (
  payload: unknown
): { parentInstanceId?: string; parentToolUseId?: string } => {
  if (typeof payload !== "object" || payload === null) {
    return {};
  }
  const { parent } = payload as { parent?: unknown };
  if (typeof parent !== "object" || parent === null) {
    return {};
  }
  const { instanceId, toolUseId } = parent as {
    instanceId?: unknown;
    toolUseId?: unknown;
  };
  return {
    ...(typeof instanceId === "string" ? { parentInstanceId: instanceId } : {}),
    ...(typeof toolUseId === "string" ? { parentToolUseId: toolUseId } : {}),
  };
};

/**
 * A delegate's effective permission mode, resolved to the ROOT of its delegate
 * tree. A delegate spawned by another delegate carries no `permissionMode` of
 * its own (the opencode plugin's `delegate` tool omits it), so the daemon's
 * `autoAllows` would park its tool asks even though the tree's root session
 * runs under `bypassPermissions`. Walk `parentInstanceId` up to the root and
 * inherit its mode, so the child spawns with it explicitly and the row records
 * it. `rows` is the hub's instance table; `parentInstanceId` the spawn's
 * immediate parent. Pure, so it is exercised directly.
 */
export const resolveDelegatePermissionMode = (
  rows: InstanceRow[],
  parentInstanceId: string
): string | undefined => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const seen = new Set<string>();
  let current: string | undefined = parentInstanceId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = byId.get(current);
    if (!row) {
      break;
    }
    const parent = row.parentInstanceId;
    if (parent && parent !== current) {
      current = parent;
      continue;
    }
    return row.permissionMode ?? undefined;
  }
  return undefined;
};

/**
 * Whether a session spawned under `parentInstanceId` may be a delegate at all.
 * A leaf delegate — a row whose `canDelegate` is `false` — may not spawn
 * delegates or start sessions, so its spawns are refused. No walk up the tree:
 * the flag is per-row, granted (or withheld) by the immediate parent when it
 * delegated. An unknown parent is refused; null or true allows.
 * `rows` is the hub's instance table. Pure, so it is exercised directly.
 */
export const resolveCanDelegate = (
  rows: InstanceRow[],
  parentInstanceId: string
): boolean => {
  const parent = rows.find((row) => row.id === parentInstanceId);
  return !!parent && parent.canDelegate !== false;
};

/**
 * Urgency is only honoured toward the caller's own delegate; anything else
 * downgrades to a normal queued send. Mutates the relay body in place.
 */
const downgradeNonDelegateUrgent = (
  rows: InstanceRow[],
  body: unknown,
  instanceId: string
): void => {
  if ((body as { urgent?: unknown }).urgent !== true) {
    return;
  }
  const from = peek(body, "from");
  const row = rows.find((r) => r.id === instanceId);
  if (!(from && row) || row.parentInstanceId !== from) {
    console.warn(
      `[hub] downgraded urgent send to ${instanceId}: not its delegate`
    );
    // biome-ignore lint/performance/noDelete: an undefined assignment would leave the key present, and the check above reads `.urgent === true` — a present-but-undefined value must still read as not urgent, but the field must not ride along into what gets relayed.
    delete (body as Record<string, unknown>).urgent;
  }
};

/** The report beat's word on what each harness adapter on the machine can do. */
const peekHarnesses = (payload: unknown): HarnessReport[] | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as { harnesses?: unknown }).harnesses;
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter(
    (report): report is HarnessReport =>
      typeof report === "object" &&
      report !== null &&
      typeof (report as HarnessReport).harness === "string"
  );
};

/** The states a daemon is allowed to claim; anything else is a daemon we do not know. */
const AUTH_STATES: readonly AgentAuth[] = [
  "authenticated",
  "unauthenticated",
  "unreadable-credentials",
];

/** `register`'s word on whether the machine can reach Claude Code's credentials. */
const peekAuth = (payload: unknown): AgentAuth => {
  const claimed = peek(payload, "auth") as AgentAuth | undefined;
  return claimed && AUTH_STATES.includes(claimed) ? claimed : "unknown";
};

/** `register`'s list of the sessions the daemon still has running. */
const peekInstances = (payload: unknown): string[] => {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const value = (payload as { instances?: unknown }).instances;
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
};

interface ServingPreview {
  instanceId: string;
  port: number;
  source: PreviewSource;
}

/** The preview listeners a registering daemon is still serving. */
const peekPreviews = (payload: unknown): ServingPreview[] => {
  const value = (payload as { previews?: unknown } | null)?.previews;
  return Array.isArray(value)
    ? value.filter(
        (item): item is ServingPreview =>
          typeof (item as Partial<ServingPreview>).instanceId === "string" &&
          typeof (item as Partial<ServingPreview>).port === "number"
      )
    : [];
};

/** First-hand process custody, separate from the daemon's attached live list. */
const peekCustody = (payload: unknown): SessionCustody => {
  const value = (payload as { custody?: unknown } | null)?.custody;
  if ((value as { state?: unknown } | null)?.state !== "available") {
    return {
      state: "unavailable",
      error: peek(value, "error") ?? "No sessiond custody read was supplied.",
    };
  }
  return {
    state: "available",
    instances: peekInstances(value),
    opencode: (value as { opencode?: unknown } | null)?.opencode === true,
    ...(Number.isSafeInteger((value as { stopSequence?: unknown }).stopSequence)
      ? { stopSequence: (value as { stopSequence: number }).stopSequence }
      : {}),
    pending: Array.isArray((value as { pending?: unknown }).pending)
      ? (value as { pending: unknown[] }).pending.filter(
          (id): id is string => typeof id === "string"
        )
      : [],
    ...(typeof (value as { readStartedAt?: unknown }).readStartedAt === "number"
      ? { readStartedAt: (value as { readStartedAt: number }).readStartedAt }
      : {}),
  };
};

/** The same operator notice on the live stream and a later transcript read. */
const custodyNotice = (
  row: Pick<InstanceRow, "id" | "sessionId">,
  reason: string
) => ({
  type: "user" as const,
  uuid: `custody-held-${row.id}`,
  session_id: row.sessionId ?? "",
  parent_agent_id: null,
  parent_tool_use_id: null,
  message: {
    role: "user" as const,
    content: `[SYSTEM NOTIFICATION]\n${reason}`,
  },
});

/**
 * THE SESSIONS A REGISTER ACK'S LEDGER MUST COVER (sessiond design §7, step 3).
 *
 * The ledger used to be computed off `instances` alone — the daemon's own live
 * list — which is EMPTY exactly when replay matters: a daemon that just
 * restarted holds nothing, so the ack carried `{}`, every reattach followed
 * from head, and the lines sessiond buffered during the absence were dropped
 * instead of recovered. The at-most-once half of §7 fired; the replay half
 * never did.
 *
 * It cannot be fixed from the daemon's side, because naming those ids in
 * `instances` is what makes `settleInstances` call them live — and then the hub
 * stops sending the `restore` spawns that are the daemon's ONLY source of a
 * surviving child's `cwd`. So the hub answers it instead, from the one place
 * that already knows both halves: the sessions it just told this daemon to
 * restore are precisely the rows the daemon will hand to `reattachFrom`, and a
 * mark for anything else is a mark it could never act on.
 *
 * Union, de-duplicated, order preserved: `reported` covers the sessions the
 * daemon named live, `restored` covers the ones this hub just told it to restore.
 */
export const reattachable = (
  reported: readonly string[],
  restored: readonly string[]
): string[] => [...new Set([...reported, ...restored])];

/**
 * And of the SDK sessions it could resume. Absent from a daemon that could not
 * read its catalog, which is not the same as a machine with nothing to resume.
 */
const peekResumable = (payload: unknown): string[] | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as { resumable?: unknown }).resumable;
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((id): id is string => typeof id === "string");
};

/**
 * `register`'s word on when each stored conversation last changed, session id
 * to ms epoch. A daemon older than the field sends nothing, and the rows keep
 * whatever the hub last wrote about them.
 */
const peekResumableAt = (
  payload: unknown
): Record<string, number> | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const value = (payload as { resumableAt?: unknown }).resumableAt;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const at: Record<string, number> = {};
  for (const [id, when] of Object.entries(value)) {
    if (typeof when === "number" && Number.isFinite(when) && when > 0) {
      at[id] = when;
    }
  }
  return at;
};

/**
 * `register`'s word on the cawco the daemon is running (NEW.md §12). Absent
 * from a daemon that predates it and from the re-announce, and the row keeps
 * what it had either way.
 */
const peekBuild = (payload: unknown): BuildInfo | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { build } = payload as { build?: unknown };
  if (typeof build !== "object" || build === null) {
    return undefined;
  }
  return typeof (build as BuildInfo).version === "string"
    ? (build as BuildInfo)
    : undefined;
};

const peekMachineCapabilities = (
  payload: unknown
): import("@cawco/core/capabilities").MachineCapabilities | undefined => {
  const value = (
    payload as {
      machineCapabilities?: import("@cawco/core/capabilities").MachineCapabilities;
    } | null
  )?.machineCapabilities;
  if (
    !value ||
    typeof value.platform !== "string" ||
    !Number.isFinite(value.at) ||
    !Array.isArray(value.items)
  ) {
    return undefined;
  }
  return value.items.every(
    (item) =>
      item &&
      typeof item.id === "string" &&
      typeof item.available === "boolean" &&
      typeof item.installCommand === "string"
  )
    ? value
    : undefined;
};

/**
 * A machine's word on its binary update, off a `register` or any heartbeat.
 * Absent from a daemon that is not a binary install; a phase this hub does not
 * know is dropped rather than passed through to a board that cannot render it.
 */
const peekBinaryUpdate = (payload: unknown): BinaryUpdateState | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { binaryUpdate } = payload as { binaryUpdate?: unknown };
  if (typeof binaryUpdate !== "object" || binaryUpdate === null) {
    return undefined;
  }
  const state = binaryUpdate as Partial<BinaryUpdateState>;
  return BINARY_UPDATE_PHASES.includes(state.phase as BinaryUpdatePhase) &&
    typeof state.installedVersion === "string"
    ? ({ ...state, hostsHub: state.hostsHub === true } as BinaryUpdateState)
    : undefined;
};

/** Whether two update states say the same thing; `updatedAt` alone is not news. */
const sameBinaryUpdate = (
  a: BinaryUpdateState | undefined,
  b: BinaryUpdateState | undefined
): boolean =>
  JSON.stringify({ ...a, updatedAt: 0 }) ===
  JSON.stringify({ ...b, updatedAt: 0 });

/** The states a daemon may claim for a tool; anything else is not a status. */
const TOOL_STATES: readonly ToolState[] = [
  "installed",
  "missing",
  "installing",
  "failed",
  "unsupported",
];

const isToolStatus = (value: unknown): value is ToolStatus =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as ToolStatus).id === "string" &&
  TOOL_STATES.includes((value as ToolStatus).state);

/**
 * The report beat's word on what the machine has of the tool catalog (NEW.md §10).
 * Empty from a daemon that predates the feature, which is not the same as a
 * machine with none of them — the difference is what stops the hub installing
 * the whole catalog onto a daemon that has never been asked.
 */
const peekTools = (payload: unknown): ToolStatus[] => {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const value = (payload as { tools?: unknown }).tools;
  return Array.isArray(value) ? value.filter(isToolStatus) : [];
};

/** A `control` asking a machine to install a tool, and the tool it names. */
const peekInstall = (payload: unknown): string | undefined => {
  if (peek(payload, "method") !== "installTool") {
    return undefined;
  }
  const { args } = payload as { args?: unknown };
  const id = Array.isArray(args) ? args[0] : undefined;
  return typeof id === "string" ? id : undefined;
};

/** A `control` asking a machine to delete a transcript, and the session it names. */
const peekTranscriptDelete = (payload: unknown): string | undefined => {
  if (peek(payload, "method") !== "deleteSession") {
    return undefined;
  }
  const { args } = payload as { args?: unknown };
  const id = Array.isArray(args) ? args[0] : undefined;
  return typeof id === "string" ? id : undefined;
};

/** A `control` answering a permission, and the ask it answers with what it says. */
const peekAnswer = (
  payload: unknown
): { requestId: string; result: unknown } | undefined => {
  if (peek(payload, "method") !== RESOLVE_PERMISSION) {
    return undefined;
  }
  const { args } = payload as { args?: unknown };
  if (!Array.isArray(args) || typeof args[0] !== "string") {
    return undefined;
  }
  return { requestId: args[0], result: args[1] };
};

/** The chosen option labels an answer to a question carries, when it is one. */
const peekAnswers = (result: unknown): Record<string, unknown> | undefined => {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }
  const { updatedInput } = result as { updatedInput?: unknown };
  if (typeof updatedInput !== "object" || updatedInput === null) {
    return undefined;
  }
  const { answers } = updatedInput as { answers?: unknown };
  return typeof answers === "object" && answers !== null
    ? (answers as Record<string, unknown>)
    : undefined;
};

/** And what the machine answered it with. */
const peekToolStatus = (payload: unknown): ToolStatus | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { result } = payload as { result?: unknown };
  return isToolStatus(result) ? result : undefined;
};

const isRecord = (value: unknown): boolean =>
  typeof value === "object" && value !== null;

/** A sync's three tables of states, which is what tells a report from any other answer. */
const isFleetReport = (value: unknown): value is FleetSyncReport =>
  isRecord(value) &&
  isRecord((value as FleetSyncReport).mcp) &&
  isRecord((value as FleetSyncReport).marketplaces) &&
  isRecord((value as FleetSyncReport).plugins);

/** What a machine answered a `syncFleetConfig` with (NEW.md §11). */
const peekFleetReport = (payload: unknown): FleetSyncReport | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { result } = payload as { result?: unknown };
  return isFleetReport(result) ? result : undefined;
};

/** What the CLI will take as an MCP server name — it keys `~/.claude.json` by it. */
const MCP_NAME = /^[A-Za-z0-9_-]+$/;

/** And the names Claude Code keeps for its own servers, which are not the user's to take. */
const RESERVED_MCP_NAMES = [
  "workspace",
  "claude-in-chrome",
  "computer-use",
  "Claude Preview",
  "Claude Browser",
];

/**
 * Why the hub will not store this server, or nothing. The config itself is
 * stored verbatim — what a server means is the CLI's affair — but an entry
 * missing the one field that makes it startable is a row no machine can apply.
 */
const mcpProblem = (
  name: string,
  config: Record<string, unknown>
): string | undefined => {
  if (!MCP_NAME.test(name)) {
    return `${name} is not a usable MCP server name`;
  }
  if (RESERVED_MCP_NAMES.includes(name)) {
    return `${name} is Claude Code's own`;
  }
  if ("url" in config || config.type === "http" || config.type === "sse") {
    return typeof config.type === "string" && typeof config.url === "string"
      ? undefined
      : "a remote MCP server needs both a type and a url";
  }
  return typeof config.command === "string"
    ? undefined
    : "a stdio MCP server needs a command";
};

/** What a skill may be called: it names a directory under `~/.claude/skills`. */
const SKILL_NAME = /^[A-Za-z0-9._-]+$/;

/** `/home/<user>` or `/Users/<user>` — the prefix every path on a machine shares. */
const HOME_PREFIX = /^(\/(?:home|Users)\/[^/]+)/;

/** Whether a machine's last report says it still has anything of the fleet's on it. */
const holdsFleet = (report: FleetSyncReport | undefined): boolean =>
  report !== undefined &&
  ([
    report.mcp,
    report.marketplaces,
    report.plugins,
    report.skills,
    report.memoryDocs,
  ].some((states) =>
    Object.values(states ?? {}).some((item) => item.state !== "removed")
  ) ||
    (report.memory !== undefined && report.memory.state !== "removed"));

/** What a machine answered `readMemoryFile` with: its own memory set, or nothing. */
type MachineMemory = MachineMemorySet | null;

/**
 * The answer, read defensively — a daemon that predates the set answers with
 * the main file alone, and `docs` absent there is a machine that links none
 * rather than a machine that could not be read.
 */
const peekMemoryFile = (result: unknown): MachineMemory => {
  if (typeof result !== "object" || result === null) {
    return null;
  }
  const { content, hash, docs } = result as {
    content?: unknown;
    hash?: unknown;
    docs?: unknown;
  };
  if (typeof content !== "string" || typeof hash !== "string") {
    return null;
  }

  const read = Array.isArray(docs)
    ? docs.flatMap((doc: unknown) => {
        if (typeof doc !== "object" || doc === null) {
          return [];
        }
        const {
          path,
          content: text,
          hash: of,
        } = doc as Record<string, unknown>;
        return typeof path === "string" &&
          typeof text === "string" &&
          typeof of === "string"
          ? [{ path, content: text, hash: of }]
          : [];
      })
    : undefined;
  return { content, hash, ...(read ? { docs: read } : {}) };
};

/** A read of a machine's memory, or the status the route should answer with. */
type MemoryRead =
  | { ok: true; copy: MachineMemory }
  | { ok: false; code: 404 | 500 | 504; said: string };

/**
 * What an `init` frame announces: the SDK session, which is what lets a
 * dashboard that joins a live session late read its transcript back, and the
 * directory the agent really opened it in — the spawn's `cwd` after the agent
 * expanded it.
 */
/**
 * What a harness said about the sends it was handed: which it holds (and,
 * `whole`, that it holds nothing else), which it stores under which id and
 * which it has read (system frames), and which one it refused (a `rejected`
 * payload). These are the hub's to turn into records; no screen draws them.
 */
type SendSignal =
  | { kind: "stored"; storedAs: Record<string, string> }
  | { kind: "held"; held: string[]; whole: boolean }
  | { kind: "read"; read: string[]; storedAs: Record<string, string> }
  | { kind: "rejected"; uuid: string; error: string };

const peekSendSignal = (
  frame: FramePayload & { kind: "frame" }
): SendSignal | undefined => {
  const { message } = frame;
  if (message.type !== "system") {
    return undefined;
  }
  switch (message.subtype) {
    case MESSAGES_STORED:
      return { kind: "stored", storedAs: message.storedAs ?? {} };
    case MESSAGES_HELD:
      return {
        kind: "held",
        held: message.held ?? [],
        whole: message.whole === true,
      };
    case MESSAGES_READ:
      return {
        kind: "read",
        read: message.read ?? [],
        storedAs: message.storedAs ?? {},
      };
    default:
      return undefined;
  }
};

/**
 * How a send asks to be read. The hub has already downgraded an urgent send
 * it does not honour by the time this is asked.
 */
const sendMode = ({ urgent, message }: SendPayload): SendMode => {
  if (urgent) {
    return "urgent";
  }
  return message.shouldQuery === false ? "note" : "turn";
};

/** A record as it goes out: on the stream, and with a history read. */
const toSendRecord = (row: SentMessageRow): SendRecord => ({
  ...(isKeepAlive(row.body) ? { keepAlive: true } : {}),
  uuid: row.uuid,
  instanceId: row.instanceId,
  acceptedAt: row.acceptedAt.toISOString(),
  // Written at accept for every record since bodies were kept; a record from
  // before goes out only through the history route, which fills it first.
  body: row.body as NeutralUserMessage,
  mode: row.mode,
  state: row.state,
  ...(row.reason ? { reason: row.reason } : {}),
  ...(row.anchor ? { anchor: row.anchor } : {}),
  ...(row.harnessId ? { harnessId: row.harnessId } : {}),
  ...(row.replaces ? { replaces: row.replaces } : {}),
  ...(row.replacedBy ? { replacedBy: row.replacedBy } : {}),
});

/**
 * Why a send did not go, when the session never read it and no harness error
 * says more — what its row says beside "not sent".
 */
const UNREAD = {
  stopped: "The session was stopped before it read this.",
  ended: "The session ended before it read this.",
  restarted: "The session restarted before it read this.",
  lost: "This never reached the session.",
} as const;

/**
 * The newest entries of a transcript read for the sends a session stored as
 * it stopped, restarted or came back: the notes it held sit at its very end.
 */
const STORED_TAIL = 50;

/**
 * The conversation a frame says its session is writing, when it says so. Two
 * frames do: every `init` — a new process, a fork, a `/clear` that starts a
 * new conversation in the same process, and each later turn — and the
 * `held` an agent opens with when it takes over a claude child that outlived
 * the agent before it, which carries the key off the child's own output
 * because the child writes no `init` until its next turn. Each one is the
 * harness's current word, so the row follows it whether or not it changed.
 */
const peekSessionKey = (
  payload: unknown
):
  | {
      sessionId: string;
      cwd?: string;
      tooling?: SessionTooling;
      /** An `init`: a process answering right now. */
      init: boolean;
    }
  | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { message } = payload as { message?: unknown };
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const sdk = message as Record<string, unknown>;
  if (
    sdk.type !== "system" ||
    !(sdk.subtype === "init" || sdk.subtype === MESSAGES_HELD) ||
    typeof sdk.session_id !== "string"
  ) {
    return undefined;
  }
  if (sdk.subtype === MESSAGES_HELD) {
    return { sessionId: sdk.session_id, init: false };
  }
  return {
    sessionId: sdk.session_id,
    cwd: typeof sdk.cwd === "string" ? sdk.cwd : undefined,
    tooling: initTooling(sdk),
    init: true,
  };
};

/**
 * The MCP servers (name and status) and tool names an `init` announced. Claude
 * sends both on every `init`; OpenCode and pi send neither, and their rows keep
 * no tooling.
 */
const initTooling = (
  sdk: Record<string, unknown>
): SessionTooling | undefined => {
  if (!Array.isArray(sdk.tools)) {
    return undefined;
  }
  const servers = Array.isArray(sdk.mcp_servers)
    ? (sdk.mcp_servers as { name: string; status: string }[])
    : [];
  return {
    servers: servers.map(({ name, status }) => ({ name, status })),
    tools: sdk.tools as string[],
  };
};

/**
 * What a user turn actually says, as a title could use it: the text the reader
 * typed. A user-shaped message is not always a reader — a tool result comes
 * back on the same channel — so a turn carrying no text of its own reads as
 * nothing here rather than as an empty name.
 */
const userTurnText = (message: unknown): string | undefined => {
  if (typeof message !== "object" || message === null) {
    return undefined;
  }
  const outer = message as {
    type?: unknown;
    message?: { role?: unknown; content?: unknown };
  };
  if (outer.type !== "user") {
    return undefined;
  }
  const content = outer.message?.content;
  const text =
    typeof content === "string"
      ? content
      : // biome-ignore lint/style/noNestedTernary: content is either a block array or absent — two mutually exclusive shapes on the wire, not a simplifiable condition.
        Array.isArray(content)
        ? content
            .filter((block): block is { type: "text"; text: string } => {
              const b = block as { type?: unknown; text?: unknown };
              return b.type === "text" && typeof b.text === "string";
            })
            .map((block) => block.text)
            .join("\n")
        : "";
  return text.trim() ? text : undefined;
};

/**
 * A `send` whose turn carries pasted material. The agent folds attachments into
 * the message it hands the harness, so what the transcript stores is not what
 * the hub saw — and a title derived from the hub's copy would then disagree
 * with the one a loaded transcript derives, which is the disagreement this
 * whole path exists to remove. Such a send names nothing; the transcript will.
 */
const hasAttachments = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  Array.isArray((payload as { attachments?: unknown }).attachments) &&
  (payload as { attachments: unknown[] }).attachments.length > 0;

/** `stop { discard: true }`: the side quest is being thrown away, not paused. */
const peekDiscard = (payload: unknown): boolean =>
  typeof payload === "object" &&
  payload !== null &&
  (payload as { discard?: unknown }).discard === true;

/**
 * A `send` that is one session addressing another, rather than a reader typing.
 * The hub stays payload-opaque otherwise; this is a sanctioned peek, and it is
 * the only way the fleet can be told a session is carrying handed work.
 */
const peekPeer = (payload: unknown): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const { message } = payload as {
    message?: { origin?: { kind?: string; name?: string } };
  };
  if (message?.origin?.kind !== "peer") {
    return undefined;
  }
  return message.origin.name ?? "another session";
};

/**
 * A `send` that starts a turn. A queued hand-off (`shouldQuery: false`) is read
 * when the *next querying message* folds it into a turn — so that send, not any
 * turn ending, is the moment it stops being outstanding. Clearing on turn end
 * was wrong twice over: a turn already in flight when the hand-off landed
 * cleared it unread, and the SDK acknowledges even a queued append with result
 * frames, which cleared it within seconds of arriving.
 */
const isQuerySend = (payload: unknown): boolean => {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const { message } = payload as { message?: { shouldQuery?: unknown } };
  return message?.shouldQuery !== false;
};

/**
 * Put a relay send's `message` into the one shape every adapter reads
 * ({@link NeutralUserMessage}), or say why it cannot be — IN PLACE, because
 * the body is forwarded to the agent verbatim.
 *
 * This exists because the failure it replaces was silent and total. `message`
 * travels from here to the agent's `#send`, into the claude adapter's input
 * stream, and out to the CLI as one stream-json line. A bare string survives
 * every one of those hops — it is valid JSON — and dies at the far end, where
 * the CLI reads a JSON *string* where a message envelope belongs and drops it
 * without a word. Nothing upstream can tell: the POST answers 200, the agent
 * pushes what it was given, and the session sits at `running` forever with no
 * transcript, no frames and no error on any machine. It costs hours to find,
 * and the caller's intent was never in doubt.
 *
 * So: text is wrapped (the caller plainly meant to say it), an envelope that
 * only forgot its `type` is completed, and anything else is refused loudly
 * rather than forwarded to hang. The one outcome no longer possible is the
 * one that was happening.
 */
export const normalizeRelayMessage = (body: unknown): string | undefined => {
  const needsEnvelope =
    "relay send needs a message: either plain text, or a {type:'user',message:{role:'user',content:…}} envelope";
  if (typeof body !== "object" || body === null) {
    return needsEnvelope;
  }
  const holder = body as { message?: unknown };
  const { message } = holder;
  if (typeof message === "string") {
    holder.message = {
      type: "user",
      message: { role: "user", content: message },
      uuid: crypto.randomUUID(),
      origin: { kind: "human" },
    } satisfies SentMessage;
    return;
  }
  if (typeof message !== "object" || message === null) {
    return needsEnvelope;
  }
  const envelope = message as { type?: unknown; message?: unknown };
  const inner = envelope.message as {
    role?: unknown;
    content?: unknown;
  } | null;
  if (typeof inner !== "object" || inner === null) {
    return needsEnvelope;
  }
  if (inner.role !== "user") {
    return "relay send message.message.role must be 'user'";
  }
  if (typeof inner.content !== "string" && !Array.isArray(inner.content)) {
    return "relay send message.message.content must be text or a block array";
  }
  // The only field a well-formed caller tends to omit, and the one every
  // reader downstream keys off (`userTurnText`, `isQuerySend`).
  if (envelope.type === undefined) {
    envelope.type = "user";
  }
  if (envelope.type !== "user") {
    return "relay send message.type must be 'user'";
  }
  // Every sent message has an identity and a speaker (`SentMessage`). The hub
  // completes the message here, so a caller that named neither gets its uuid
  // minted here, and speaks as a dashboard send does — as the operator.
  const sent = envelope as { uuid?: unknown; origin?: unknown };
  sent.uuid ??= crypto.randomUUID();
  sent.origin ??= { kind: "human" };
};

export const createServer = (
  { build: hubBuild, registry, db, pending, telegram }: HubServices,
  { resumeWorkflows = true }: { resumeWorkflows?: boolean } = {}
) => {
  // Honest ground, before anything is served. A fresh process holds no agent
  // sockets, so every row still claiming `online` is a leftover from a hub that
  // was killed before its close handlers could run. The read-time overlay
  // (`withPresence`, below) already makes the API tell the truth regardless —
  // this is for every *other* reader of the stored rows: a migration, a script,
  // a `sqlite3` session at 3am. A column nobody has to remember to distrust is
  // worth one write at startup.
  db.markAllAgentsOffline();

  // An ask that leaves the hub's pending list is over on every screen: one
  // frame, whichever path settled it (an answer from any device, Telegram, a
  // parent session or a workflow; a harness settling it itself; a timeout; its
  // process ending). Without it every other client kept a card nobody could
  // answer until it reconnected.
  const answeringPermissions = new Map<
    string,
    { outcome?: "answered" | "cancelled" }
  >();
  pending.onSettled((parked, outcome) => {
    if (!(parked.requestId && parked.instanceId)) {
      return;
    }
    const answering = answeringPermissions.get(parked.requestId);
    if (answering) {
      answering.outcome = outcome;
    }
    telegram?.onSettled(parked.requestId);
    registry.broadcast({
      verb: "frames",
      machineId: parked.machineId,
      instanceId: parked.instanceId,
      requestId: parked.requestId,
      payload: {
        kind: "permission_settled",
        instanceId: parked.instanceId,
        requestId: parked.requestId,
        outcome,
      },
    });
  });

  // And the same honesty for the sessions those machines were carrying. A hub
  // that just started holds no daemon sockets, so it has no basis for any row
  // claiming `running` or `starting`; and rows the previous taxonomy had to file
  // under `error` for the crime of having been restarted are re-read as what
  // they always were — `sleeping`. Idempotent, so this is a boot step and not a
  // migration script somebody has to remember to run.
  const swept = db.sweepBootStatuses(RESTART_RESUMABLE);
  for (const parked of pending.list()) {
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    if (!(row && ["running", "starting", "unknown"].includes(row.status))) {
      pending.forget(parked.instanceId ?? "");
    }
  }
  if (swept.toUnknown || swept.toSleeping) {
    console.log(
      `[hub] boot sweep: ${swept.toUnknown} session(s) → unknown, ${swept.toSleeping} legacy restart error(s) → sleeping`
    );
  }

  /**
   * What each session is doing right now, as its own daemon last said: memory
   * only, and never a column.
   *
   * A pulse is the daemon's first-hand reading of a live process — working,
   * blocked, idle — and it is worth exactly as long as the process it describes.
   * Persisting it would recreate the defect this whole build exists to close in
   * a second column, so it lives here, keyed by instance, and is dropped the
   * moment the row it belongs to settles or is discarded. A dashboard opening
   * cold gets the map in its first `instances` frame, which is the difference
   * between a rail that knows what is working on connect and one that has to
   * wait for the next pulse to arrive.
   */
  const pulses = new Map<string, SessionPulse>();
  /**
   * What the hub knows for `archiveRefusal` (core archive.ts): a session's
   * live pulse (a turn, or an ask on the owner), a run's status, and what
   * hangs under each the way every list nests it — a session's delegates
   * and the runs it supervises, a run's step sessions and child runs.
   */
  const archiveView = (): ArchiveView => {
    const rows = db.listInstances();
    const delegates = db.runningDelegateCounts();
    const runs = db.listWorkflowRuns();
    const children = new Map<string, string[]>();
    const under = (parent: string | null, child: string) => {
      if (parent) {
        children.set(parent, [...(children.get(parent) ?? []), child]);
      }
    };
    for (const row of rows) {
      under(
        row.workflowRunId ? `run:${row.workflowRunId}` : row.parentInstanceId,
        row.id
      );
    }
    for (const run of runs) {
      under(
        run.parentRunId ? `run:${run.parentRunId}` : run.supervisorInstanceId,
        `run:${run.id}`
      );
    }
    const runById = new Map(runs.map((run) => [run.id, run]));
    const starting = new Set(
      rows.filter((row) => row.status === "starting").map((row) => row.id)
    );
    return {
      childrenOf: (id) => children.get(id) ?? [],
      doing: (id) => {
        if (id.startsWith("run:")) {
          const run = runById.get(id.slice("run:".length));
          return run ? runDoing(run.status) : "idle";
        }
        return starting.has(id) || (delegates.get(id) ?? 0) > 0
          ? "working"
          : (pulses.get(id)?.activity ?? "idle");
      },
    };
  };
  const heldSessions = new Map<
    string,
    { machineId: string; since: number; reason: string }
  >();
  const machineCustody = new Map<string, SessionCustody>();
  const addressProtocolMachines = new Set<string>();
  const addressClaims = (payload: unknown): SessionAddress[] | undefined => {
    const value = (payload as { sessionAddresses?: unknown } | null)
      ?.sessionAddresses;
    return Array.isArray(value)
      ? value.filter(
          (claim): claim is SessionAddress =>
            !!claim &&
            typeof claim.instanceId === "string" &&
            typeof claim.sessionId === "string"
        )
      : undefined;
  };
  const recordSessionAddress = (
    agent: HubSocket,
    machineId: string,
    claim: SessionAddress
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: persist, verify, acknowledge or refuse, then re-address an end as one generation-fenced transaction
  ): void => {
    const row = db.ownedInstance(claim.instanceId, machineId);
    const acknowledged =
      row &&
      (!claim.processGeneration ||
        claim.processGeneration === processGeneration(row)) &&
      row.harness === "opencode" &&
      !row.endConfirmedAt &&
      !(row.endIntent && row.addressRequired && !row.sessionId);
    if (acknowledged) {
      db.noteInstanceSession(row.id, claim.sessionId, undefined, "opencode");
      if (db.ownedInstance(row.id, machineId)?.sessionId !== claim.sessionId) {
        return;
      }
      if (!row.endIntent) {
        db.acknowledgeAddress(row.id);
      } else if (row.sessionId !== claim.sessionId) {
        // A legacy carried address changes the coordinates of an already queued end.
        lifecycle.deliveryFailed(row.id);
      }
    }
    agent.send({
      verb: "control",
      machineId,
      instanceId: claim.instanceId,
      payload: {
        instanceId: claim.instanceId,
        requestId: crypto.randomUUID(),
        method: "acknowledgeSessionAddress",
        args: [
          claim.sessionId,
          claim.processGeneration ?? (row ? processGeneration(row) : ""),
          !!acknowledged && !row?.endIntent,
        ],
      },
    });
    if (acknowledged && row.endIntent && row.sessionId !== claim.sessionId) {
      lifecycle.reconcile(machineId);
    }
  };

  /**
   * When each session's activity was last written down, so the column that says
   * it is not rewritten on every pulse. The pulse itself is throttled to one a
   * second per session on the daemon side; a row does not need a write that
   * often, and a rail cannot see the difference.
   */
  const touched = new Map<string, number>();

  /**
   * The session said something. `updatedAt` is the only per-session timestamp
   * anywhere in the fleet, and until this existed nothing wrote it for the one
   * reason a reader cares about: every value in it was a status change, so a
   * rail asking "which of these did I touch last" got the moment the hub
   * settled or promoted the row — the same moment for all of them.
   */
  const noteActivity = (instanceId: string): void => {
    const last = touched.get(instanceId) ?? 0;
    const now = Date.now();
    if (now - last < ACTIVITY_TOUCH_MS) {
      return;
    }
    touched.set(instanceId, now);
    db.touchInstanceActivity(instanceId);
  };

  /** Each connected machine's binary update state, as its daemon last said. */
  const binaryUpdateStates = new Map<string, BinaryUpdateState>();

  /**
   * A machine that is installing an update takes no new session start: its agent
   * is about to restart, and a start held there would go with it. The hub keeps
   * the start instead, on the instance row already written for it.
   */
  const holdingStarts = (machineId: string): boolean =>
    binaryUpdateStates.get(machineId)?.phase === "installing";

  /** Sends a start, or, while its machine is installing an update, keeps it on its row. */
  const sendSpawn = (
    agent: NonNullable<ReturnType<typeof registry.agent>>,
    machineId: string,
    envelope: Envelope<SpawnPayload>
  ): void => {
    if (holdingStarts(machineId) && envelope.instanceId) {
      db.oweSpawn(envelope.instanceId, JSON.stringify(envelope), Date.now());
      return;
    }
    agent.send(envelope);
  };

  /**
   * Sends every start a machine is owed, in the order they were asked for,
   * each exactly once: the row's claim is taken before the send. Runs when the
   * machine registers and when its update state changes, and does nothing while
   * it is still installing. A start the person has since stopped is dropped.
   */
  const flushOwedStarts = (machineId: string): void => {
    const agent = registry.agent(machineId);
    if (!agent || holdingStarts(machineId)) {
      return;
    }
    for (const owed of db.owedSpawns(machineId)) {
      if (!db.takeOwedSpawn(owed.id)) {
        continue;
      }
      const row = db.ownedInstance(owed.id, machineId);
      if (
        !row ||
        row.endIntent ||
        ["stopped", "discarded"].includes(row.status)
      ) {
        continue;
      }
      agent.send(JSON.parse(owed.envelope) as Envelope<SpawnPayload>);
    }
  };

  /**
   * Standing instructions, enforced on the frame stream this server already
   * carries. Constructed here so it shares the request's `db` and reaches
   * machines through the same registry every other injection uses.
   */
  /** Meaning rules' one Jev call per turn, shared by both engines below. */
  const meaningJudge = new MeaningJudge(db);
  /** Counts skill, tool and MCP server uses for suggestion ranking. */
  const usageCounter = new UsageCounter(db);
  /**
   * The fleet's real spend ({@link UsageSpend}): opencode's recorded cost
   * since local midnight, since this Monday and in all, its days reckoned in
   * the hub's own zone, the calendar the hub's usage counts already keep
   * (usage-count `dayOf`). Every "today" CawCo shows is this.
   */
  const spendNow = (): UsageSpend => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const week = new Date(today);
    week.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const todayStart = today.getTime();
    const weekStart = week.getTime();
    return {
      ...db.usageSpend({ harness: "opencode", todayStart, weekStart }),
      todayStart,
      weekStart,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  };
  /**
   * The PKCE verifier of the OpenRouter connect in progress. One at a time: a
   * new connect replaces it, and a finished exchange spends it.
   */
  let openrouterVerifier: string | undefined;
  /**
   * Why a session takes no input from `origin` now, or nothing when it does
   * ({@link WorkItems.refusal}). Every sender asks this, by way of
   * {@link deliverSend} or {@link sendRoute}.
   */
  const inputRefusal = (
    instanceId: string,
    origin: NeutralOrigin
  ): string | undefined => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (row?.lastError === CLAUDE_CONVERSATION_GONE) {
      return CLAUDE_CONVERSATION_GONE;
    }
    return row ? workItems.refusal(row, origin) : "This session is gone.";
  };
  /**
   * A session's standing instructions reach it through the one send path,
   * while its machine is connected and the session takes cawco's own word:
   * never finished work. A rule or supervisor verdict with no route is not
   * sent and not counted.
   */
  const sendRoute = (machineId: string, instanceId: string) =>
    registry.agent(machineId) && !inputRefusal(instanceId, { kind: "system" })
      ? { send: deliverSend }
      : undefined;
  const ruleEngine = new RuleEngine({
    db,
    meaning: meaningJudge,
    agent: sendRoute,
  });

  /**
   * The supervisor's intervention log, to every dashboard, the moment it is
   * written — same envelope shape as {@link publishDelegateEvent}.
   */
  const publishSupervisorEvent = (
    instanceId: string,
    event: SupervisorEvent
  ): void => {
    const row = db.listInstances().find((r) => r.id === instanceId);
    if (!row) {
      return;
    }
    registry.broadcast({
      verb: "frames",
      machineId: row.machineId,
      instanceId,
      payload: {
        kind: "supervisor_event",
        instanceId,
        event,
      } satisfies FramePayload,
    });
  };

  /** Transient twin of {@link publishSupervisorEvent}: never persisted. */
  const publishSupervisorStatus = (
    instanceId: string,
    status: SupervisorStatusSignal
  ): void => {
    const row = db.listInstances().find((r) => r.id === instanceId);
    if (!row) {
      return;
    }
    registry.broadcast({
      verb: "frames",
      machineId: row.machineId,
      instanceId,
      payload: {
        kind: "supervisor_status",
        instanceId,
        status,
      } satisfies FramePayload,
    });
  };

  /**
   * LLM supervisor — watches the same frames the rule engine does and, when
   * configured, evaluates turns against autopilot or LLM rules off the frame
   * path. Constructed symmetrically to {@link ruleEngine}.
   */
  const supervisor = new SupervisorEngine({
    db,
    meaning: meaningJudge,
    agent: sendRoute,
    telegram,
    publish: publishSupervisorEvent,
    status: publishSupervisorStatus,
  });

  /**
   * Drops a dead process's parked questions, telling whoever carried them
   * elsewhere that they are over — a Telegram message whose buttons still work
   * after the session behind them is gone is a message that lies.
   */
  const forgetPending = (
    instanceId: string,
    why: string,
    outlived = false
  ): void => {
    if (!outlived) {
      pending.forget(instanceId);
    }
    // Nor is it doing anything any more: a pulse outliving its process is the
    // same stale-liveness lie in memory instead of in a column.
    pulses.delete(instanceId);
    touched.delete(instanceId);
    // A session that died before it ever said anything is never going to name
    // itself; nothing should still be waiting to hear its first words.
    awaitingFirstTurn.delete(instanceId);
    // Nor is anything it was sent and never read going to run — unless its
    // harness wrote it down as it went. A process that outlived its agent
    // may hold it still: custody decides that ({@link decideCustody}).
    if (!outlived) {
      inCustody.delete(instanceId);
      settlePending(instanceId, why, "fail");
    }
    // The supervisor's turn buffers for a dead session are waste.
    supervisor.forget(instanceId);
    usageCounter.forget(instanceId);
  };

  // The hub's persisted spawn identity changes on every relaunch, but not on
  // a socket reconnect or a turn's init. A request belongs to that launch.
  const processGeneration = (
    row: ReturnType<DbShape["getInstancesByIds"]>[number]
  ): string => JSON.stringify([row.id, row.spawnedAt]);
  const ownsPermission = (parked: Envelope): boolean => {
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    return !!(
      row &&
      row.machineId === parked.machineId &&
      ["running", "starting", "unknown"].includes(row.status) &&
      peek(parked.payload, "processGeneration") === processGeneration(row)
    );
  };

  /**
   * A parent session just died while a routed ask was still parked for one of
   * its delegates. The user is the fallback: re-broadcast the ask untagged so
   * it returns to the attention queue, and let Telegram hear it like any other.
   * A routed ask must never sit unanswerable and invisible.
   */
  const escalateRoutedAsks = (parentInstanceId: string): void => {
    for (const parked of pending.list()) {
      const payload = parked.payload as { kind?: unknown; routedTo?: unknown };
      if (
        payload.kind !== "permission_request" ||
        payload.routedTo !== "parent"
      ) {
        continue;
      }
      const delegate = parked.instanceId
        ? db.listInstances().find((r) => r.id === parked.instanceId)
        : undefined;
      if (delegate?.parentInstanceId !== parentInstanceId) {
        continue;
      }
      // biome-ignore lint/performance/noDelete: an undefined assignment would leave the key present on `payload`, which is broadcast verbatim — the field must be genuinely absent, not present-but-undefined.
      delete payload.routedTo;
      registry.broadcast(parked);
      telegram?.onAsk(parked);
    }
  };

  /**
   * Delivers a delegate's ask to its parent as a queued peer message, in the
   * same shape the auto-report block uses: the parent reads it when its current
   * turn ends and answers with the `answer_delegate` tool. The final line is
   * machine-readable so the parent's model can copy the ids verbatim.
   */
  const deliverDelegateAsk = (
    delegate: { id: string; machineId: string; cwd: string },
    parent: { id: string; machineId: string },
    ask: { requestId?: string; payload: unknown }
  ): void => {
    const label = `${leaf(delegate.cwd)}#${delegate.id.slice(0, 8)}`;
    const body = renderDelegateAsk(ask.payload);
    const instruction =
      "Answer it with the answer_delegate tool: answer_delegate(target, requestId, answers) — " +
      "answers are keyed by the exact question text and the value is the chosen option label " +
      "(pass deny=true to refuse it).";
    deliverSend({
      verb: "send",
      machineId: parent.machineId,
      instanceId: parent.id,
      payload: {
        instanceId: parent.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: delegateAskText({
              label,
              body,
              instance: delegate.id,
              request: String(ask.requestId),
              instruction,
            }),
          },
          parent_tool_use_id: null,
          origin: {
            kind: "peer",
            from: delegate.id,
            name: leaf(delegate.cwd),
            fromSession: delegate.id,
          },
          shouldQuery: false,
        },
      },
    });

    const toolName = peek(ask.payload, "toolName");
    publishDelegateEvent(
      delegate.machineId,
      db.recordDelegateEvent({
        instanceId: delegate.id,
        parentInstanceId: parent.id,
        kind: "ask",
        requestId: ask.requestId,
        toolName,
        requestKind:
          peek(ask.payload, "requestKind") === "question" ||
          toolName === ASK_USER_QUESTION
            ? "question"
            : "tool",
        payload: {
          input: (
            ask.payload as Extract<
              FramePayload,
              { kind: "permission_request" }
            > | null
          )?.input,
        },
        status: "pending",
      })
    );
  };

  /**
   * A delegate's report to its parent, as a queued peer message: what its
   * turn said (or why it never started), under the marker the parent's
   * transcript renders as a report.
   */
  const reportToParent = (
    delegate: InstanceRow,
    body: string,
    failed: boolean,
    completion?: { resultId: string; completedAt?: string },
    notice = false
  ): void => {
    const parent = delegate.parentInstanceId
      ? db.getInstancesByIds([delegate.parentInstanceId])[0]
      : undefined;
    if (!parent) {
      return;
    }
    const label = `${leaf(delegate.cwd)}#${delegate.id.slice(0, 8)}`;
    deliverSend({
      verb: "send",
      machineId: parent.machineId,
      instanceId: parent.id,
      payload: {
        instanceId: parent.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: `${reportMarker(label, failed, notice)}${body}`,
          },
          parent_tool_use_id: null,
          origin: {
            kind: "peer",
            from: delegate.id,
            name: leaf(delegate.cwd),
            fromSession: delegate.id,
          },
          shouldQuery: false,
        },
      },
    });
    publishDelegateEvent(
      delegate.machineId,
      db.recordDelegateEvent({
        instanceId: delegate.id,
        parentInstanceId: parent.id,
        kind: "report",
        payload: {
          body,
          failed,
          ...(notice ? { notice: true } : {}),
          ...completion,
        },
      })
    );
  };

  /**
   * Sessions that have been handed work and have not answered it yet, kept here
   * rather than in a browser: a hand-off learnt by whichever tab happened to be
   * watching is invisible on every other device, and gone after a reload.
   */
  const handoffs = new Map<string, { from: string; at: number }>();

  /* ---- send records: the hub's one account of every send (SendRecord) ---- */

  /**
   * The last thing each session said that a screen draws a row for: its
   * newest main-loop assistant frame, or the newest send it read. A send that
   * fails without being stored is placed right after it. Seeded from the
   * stored transcript by a history read when the hub has heard nothing since
   * it started.
   */
  const anchors = new Map<string, string>();
  /**
   * Sends each session has read and not yet said anything about, each with
   * the anchor it had before it was read. An error that closes the turn before
   * the model says a word is that send's failure (rule b); anything the model
   * says, a clean close, or an interrupt clears them.
   */
  const unanswered = new Map<string, Map<string, string | undefined>>();
  /** Pending sends a transcript read is deciding, so none is decided twice. */
  const deciding = new Set<string>();

  /** A record's latest state onto its session's stream: where every screen hears it. */
  const publishSend = (row: SentMessageRow): void => {
    if (isKeepAlive(row.body)) {
      streams.sequence(row.instanceId, {
        kind: "send",
        instanceId: row.instanceId,
        keepAlive: true,
        record: toSendRecord(row),
      });
      return;
    }
    transcripts.ingest(row.instanceId, {
      kind: "send",
      instanceId: row.instanceId,
      record: toSendRecord(row),
    });
  };

  /** One change to a record: stored, then said. The only way a record moves. */
  const changeSend = (
    row: SentMessageRow,
    change: Parameters<DbShape["updateSend"]>[1]
  ): SentMessageRow => {
    const moved = db.updateSend(row.uuid, change) ?? row;
    publishSend(moved);
    return moved;
  };

  /**
   * Where a failed send goes: after the last thing the session said — or,
   * when that is this send itself (it read it, then failed on it), after
   * what came before it.
   */
  const anchorFor = (instanceId: string, uuid: string): string | undefined => {
    const last = anchors.get(instanceId);
    return last === uuid ? unanswered.get(instanceId)?.get(uuid) : last;
  };

  /**
   * A pending send read. `answering` is the harness's own read, which the
   * model's turn follows; a read found in a stored transcript follows no turn.
   */
  const readSend = (
    row: SentMessageRow,
    answering: boolean
  ): SentMessageRow => {
    if (isKeepAlive(row.body)) {
      return changeSend(row, { state: "read" });
    }
    if (answering) {
      const waiting = unanswered.get(row.instanceId) ?? new Map();
      waiting.set(row.uuid, anchors.get(row.instanceId));
      unanswered.set(row.instanceId, waiting);
    }
    anchors.set(row.instanceId, row.uuid);
    return changeSend(row, { state: "read" });
  };

  /** A send that will never be read, and why. Final. */
  const failSend = (row: SentMessageRow, reason: string): void => {
    const anchor = anchorFor(row.instanceId, row.uuid);
    unanswered.get(row.instanceId)?.delete(row.uuid);
    changeSend(row, { state: "failed", reason, anchor: anchor ?? null });
  };

  /**
   * The session's turn was cut into — an interrupt, or an urgent send that
   * aborts it — so the error that closes it is the cut, not a failure of
   * what it had read.
   */
  const noteInterrupt = (instanceId: string): void => {
    unanswered.delete(instanceId);
    workItems.interrupted(instanceId);
  };

  /**
   * Which sends a session's stored transcript holds, and whether its harness
   * has taken each up: by send uuid, true for read, false for written down
   * and still waiting ({@link SessionMessage.queued}). Linked the way a history
   * read links them ({@link linkEntries}). `undefined` when the machine could
   * not be asked: it has said nothing either way.
   */
  const storedIn = async (
    instanceId: string
  ): Promise<Map<string, boolean> | undefined> => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row?.sessionId) {
      return new Map();
    }
    const answer = await callAgent(
      row.machineId,
      CONTROL_GET_SESSION_MESSAGES,
      [row.sessionId, { dir: row.cwd || undefined, tail: STORED_TAIL }],
      READ_TIMEOUT_MS,
      (row.harness || undefined) as HarnessKind | undefined
    );
    if (typeof answer === "string" || !answer.ok) {
      return undefined;
    }
    // Read as the newest history page is: linked, a send it took up read,
    // and the session's anchor seeded when the hub has heard nothing of it
    // since it started — so a send this fails goes after what the session
    // last said, not at the conversation's start.
    const entries = answer.result as SessionMessage[];
    const { last } = linkEntries(instanceId, entries);
    if (last && !anchors.has(instanceId)) {
      anchors.set(instanceId, last);
    }
    const stored = new Map<string, boolean>();
    for (const entry of entries) {
      for (const uuid of entry.sends ?? []) {
        stored.set(uuid, !entry.queued);
      }
    }
    return stored;
  };

  /**
   * What becomes of a pending send its harness has not taken up, once a
   * transcript read has looked: `fail` — it did not go, for the reason given
   * (the process is gone; a machine that cannot be asked cannot say it stored
   * one); `wait` — a live process may still hand it over and say so;
   * `unheld` — what the process holds is known, so a send it neither stored
   * nor said it held ({@link SentMessageRow.held}), or one a later send
   * overtook, never reached it. That is decided only on a read the machine
   * answered.
   */
  type Unstored = "fail" | "wait" | "unheld";

  /**
   * Whether a later send of the session has been taken up ahead of `send`.
   * Every harness takes up what it is sent in the order it was sent — an
   * urgent send, which cuts ahead, excepted — so a send overtaken like this
   * was never handed to it.
   */
  const overtaken = (send: SentMessageRow): boolean =>
    db
      .sendsIn(send.instanceId, ["read"])
      .some(
        (later) =>
          later.mode !== "urgent" &&
          later.acceptedAt.getTime() > send.acceptedAt.getTime()
      );

  /**
   * What a session was sent and has not read, decided against its stored
   * transcript (rule c): whatever its harness has taken up is read — a
   * process can take up the notes it was holding as it stops, and say
   * nothing — and the rest as `unstored` says, failing for `why`. `only`
   * narrows the sends decided. One another read is already deciding is left
   * to it. `decided` hears that this read decided every one.
   */
  const settlePending = (
    instanceId: string,
    why: string,
    unstored: Unstored,
    only: (send: SentMessageRow) => boolean = () => true,
    decided: () => void = () => undefined
  ): void => {
    // A turn that is over answers nothing it read; one a live process is
    // still running may yet.
    if (unstored === "fail") {
      unanswered.delete(instanceId);
    }
    const all = db.sendsIn(instanceId, ["pending"]).filter(only);
    const sends = all.filter((send) => !deciding.has(send.uuid));
    const whole = sends.length === all.length;
    if (sends.length === 0) {
      if (whole) {
        decided();
      }
      return;
    }
    for (const send of sends) {
      deciding.add(send.uuid);
    }
    // biome-ignore lint/complexity/noVoid: the callers are frame handlers that must not wait on a machine round trip
    void storedIn(instanceId)
      .then((answer) => {
        if (!answer && unstored === "unheld") {
          return;
        }
        for (const send of sends) {
          settleSend(send, answer ?? new Map(), unstored, why);
        }
        if (whole) {
          decided();
        }
      })
      .finally(() => {
        for (const send of sends) {
          deciding.delete(send.uuid);
        }
      });
  };

  /** One send {@link settlePending} decides, against what `stored` says was taken up. */
  const settleSend = (
    send: SentMessageRow,
    stored: Map<string, boolean>,
    unstored: Unstored,
    why: string
  ): void => {
    // Read meanwhile, or thrown away with its session: that stands.
    const now = db.sendRecord(send.uuid);
    if (now?.state !== "pending") {
      return;
    }
    const taken = stored.get(now.uuid);
    if (taken) {
      readSend(now, false);
      return;
    }
    const lost =
      unstored === "fail" ||
      (unstored === "unheld" &&
        taken === undefined &&
        !(now.held && !overtaken(now)));
    if (lost) {
      failSend(now, why);
    }
  };

  /**
   * Sessions whose process outlived an agent restart, from the replacement's
   * register until what they were sent before it is decided: which machine
   * holds them, when it registered, and whether their harness has said what
   * it holds. Opencode's transcript is all it holds — it stores every send
   * the moment it is handed one — so it has said so at once; Claude's CLI
   * holds sends in a queue of its own, which it names when the agent takes
   * it over ({@link MESSAGES_HELD} with `whole`).
   */
  const inCustody = new Map<
    string,
    { machineId: string; since: number; told: boolean }
  >();

  /**
   * An outlived session's sends from before its agent restarted, decided
   * once its harness has said what it holds (rule: a send is read or failed,
   * never pending for good): read if taken up, waiting if held, and
   * otherwise it never reached the session. A machine that could not be
   * asked is asked again at its next heartbeat.
   */
  const decideCustody = (instanceId: string): void => {
    const held = inCustody.get(instanceId);
    if (!held?.told) {
      return;
    }
    settlePending(
      instanceId,
      UNREAD.lost,
      "unheld",
      (send) => send.acceptedAt.getTime() < held.since,
      () => {
        if (inCustody.get(instanceId) === held) {
          inCustody.delete(instanceId);
        }
      }
    );
  };

  /** A retry or queued edit has superseded a send the harness no longer holds. */
  const replaceSend = (replaced: string, by: string): void => {
    const row = db.sendRecord(replaced);
    if (row?.state === "failed" || row?.state === "cancelled") {
      changeSend(row, { state: "replaced", replacedBy: by });
    }
  };

  /**
   * A harness's word about its sends (`SendSignal`): held, stored under an
   * id, read, or refused. Read ones are read in the order named; one named by
   * an id this hub has no record under was never a send — typed in the
   * harness, or its own. A send read overtakes every pending send accepted
   * before it ({@link overtaken}): those are decided against the transcript
   * at once, and any it does not hold never reached the session.
   */
  const takeSendSignal = (instanceId: string, signal: SendSignal): void => {
    if (signal.kind === "rejected") {
      const row = db.sendRecord(signal.uuid);
      if (row?.state === "pending" || row?.state === "read") {
        if (isKeepAlive(row.body)) {
          db.updateKeepAlive(instanceId, { keepAliveTurn: null });
        }
        rejectSend(row, signal.error);
      }
      return;
    }
    if (signal.kind === "held") {
      takeHeld(instanceId, signal);
      return;
    }
    for (const [uuid, harnessId] of Object.entries(signal.storedAs)) {
      db.linkSend(uuid, harnessId);
    }
    if (signal.kind === "read") {
      takeRead(instanceId, signal.read);
    }
  };

  /**
   * A send its harness refused, failed after what the session last said —
   * which, when the hub has heard nothing of the session since it started,
   * a transcript read tells first ({@link storedIn}).
   */
  const rejectSend = (row: SentMessageRow, reason: string): void => {
    if (anchors.has(row.instanceId)) {
      failSend(row, reason);
      return;
    }
    // biome-ignore lint/complexity/noVoid: a frame handler must not wait on a machine round trip
    void storedIn(row.instanceId).then(() => {
      const now = db.sendRecord(row.uuid);
      if (now?.state === "pending" || now?.state === "read") {
        failSend(now, reason);
      }
    });
  };

  /**
   * Sends the harness says it holds: they wait for their read through an
   * agent restart. Said `whole`, by an agent taking the process over, it
   * decides the session's custody ({@link decideCustody}).
   */
  const takeHeld = (
    instanceId: string,
    { held, whole }: { held: string[]; whole: boolean }
  ): void => {
    for (const row of db.sendsFor(held)) {
      if (row.instanceId === instanceId && row.state === "pending") {
        db.updateSend(row.uuid, { held: true });
      }
    }
    const taken = inCustody.get(instanceId);
    if (whole && taken) {
      taken.told = true;
      decideCustody(instanceId);
    }
  };

  /**
   * Sends the harness has read, read in the order named; then every pending
   * send accepted before the latest of them that is not urgent is overtaken
   * ({@link overtaken}), and decided against the transcript at once.
   */
  const takeRead = (instanceId: string, ids: string[]): void => {
    const order = (row: SentMessageRow): number => {
      const at = ids.indexOf(row.uuid);
      return at >= 0 ? at : ids.indexOf(row.harnessId ?? "");
    };
    const read = db
      .sendsFor(ids)
      .filter((row) => row.instanceId === instanceId && row.state === "pending")
      .sort((a, b) => order(a) - order(b));
    for (const row of read) {
      if (!isKeepAlive(row.body)) {
        db.updateKeepAlive(instanceId, { keepAliveTurn: null });
      }
      readSend(row, true);
    }
    const latest = Math.max(
      ...read
        .filter((row) => row.mode !== "urgent")
        .map((row) => row.acceptedAt.getTime())
    );
    if (Number.isFinite(latest)) {
      settlePending(
        instanceId,
        UNREAD.lost,
        "unheld",
        (send) => send.acceptedAt.getTime() < latest
      );
    }
  };

  /**
   * What the session's own turn says about the sends it read. The model's
   * first words answer them, and are where the next failure goes; an error
   * that closes the turn before any is theirs (rule b): they fail with it,
   * and the result frame says which, so it draws no line of its own.
   */
  const observeTurn = (
    instanceId: string,
    frame: FramePayload & { kind: "frame" }
  ): void => {
    const neutral = frame.message;
    if (neutral.type === "assistant" && !neutral.parent_tool_use_id) {
      // An error the harness wrote in the model's place answers nothing:
      // what it had just read failed, in its words, which its rows carry.
      const waiting = unanswered.get(instanceId);
      if (neutral.error && waiting?.size) {
        const words = neutral.message.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("\n");
        neutral.failedSends = failWaiting(
          instanceId,
          waiting,
          words || neutral.error
        );
        return;
      }
      unanswered.delete(instanceId);
      if (neutral.uuid) {
        anchors.set(instanceId, neutral.uuid);
      }
      return;
    }
    if (neutral.type !== "result") {
      return;
    }
    const waiting = unanswered.get(instanceId);
    if (!(neutral.is_error && waiting?.size)) {
      unanswered.delete(instanceId);
      return;
    }
    neutral.failedSends = failWaiting(
      instanceId,
      waiting,
      neutral.errors?.length
        ? neutral.errors.join("\n")
        : neutral.result || `Harness error (${neutral.subtype}).`
    );
  };

  /** The sends a session read and nothing answered, failed for `reason`: their uuids. */
  const failWaiting = (
    instanceId: string,
    read: Map<string, string | undefined>,
    reason: string
  ): string[] => {
    const failed = db
      .sendsFor([...read.keys()])
      .filter((row) => row.state === "read");
    for (const row of failed) {
      failSend(row, reason);
    }
    unanswered.delete(instanceId);
    return failed.map((row) => row.uuid);
  };

  /**
   * A history page's sends, and the record lines it carries.
   *
   * Each stored entry that is sends is linked to their records
   * (`SessionMessage.sends`, {@link sendFinder}). A record from before the hub
   * kept bodies takes the stored copy as its body. A pending send in an entry
   * its harness has taken up has been read: this is the read a restart kept
   * from being framed.
   *
   * The page carries every record it links, every failed record whose anchor
   * is on it — and, on the page that reaches the conversation's start, every
   * one that has none — and on the newest page every send still pending. The
   * newest page also seeds the session's anchor when the hub has heard nothing
   * of it since it started.
   */
  const sendLines = (
    instanceId: string | undefined,
    entries: SessionMessage[],
    newest: boolean,
    start: boolean
  ): { record: SendRecord }[] => {
    const { lines, last } = linkEntries(instanceId, entries);
    if (instanceId) {
      if (newest && last && !anchors.has(instanceId)) {
        anchors.set(instanceId, last);
      }
      const onPage = new Set([
        ...entries.map((entry) => entry.uuid),
        ...lines.keys(),
      ]);
      for (const send of unlinkedOnPage(instanceId, onPage, newest, start)) {
        if (!lines.has(send.uuid)) {
          lines.set(send.uuid, send);
        }
      }
    }
    return [...lines.values()].map((send) => ({ record: toSendRecord(send) }));
  };

  /**
   * The sends a page draws that none of its entries is: every one still
   * pending, on the newest page; every failed one whose anchor is on it; and,
   * on the page that reaches the conversation's start, every failed one with
   * no anchor at all.
   */
  const unlinkedOnPage = (
    instanceId: string,
    onPage: Set<string>,
    newest: boolean,
    start: boolean
  ): SentMessageRow[] =>
    db
      .sendsIn(instanceId, newest ? ["pending", "failed"] : ["failed"])
      .filter(
        (send) =>
          send.state === "pending" ||
          (send.anchor ? onPage.has(send.anchor) : start)
      );

  /**
   * The sends a page's entries are, linked, by uuid — and the last thing on
   * the page a failed send could be anchored to. A stored error that closes
   * a turn on failed sends, with nothing said in between, is theirs (rule b,
   * read back) and draws no line of its own, as the live result frame did —
   * a send failed that way and since tried again (`replaced`) included.
   */
  const linkEntries = (
    instanceId: string | undefined,
    entries: SessionMessage[]
  ): { lines: Map<string, SentMessageRow>; last: string | undefined } => {
    const sendsOf = sendFinder(instanceId, entries);
    const lines = new Map<string, SentMessageRow>();
    let last: string | undefined;
    let failures: string[] = [];
    for (const entry of entries) {
      if (theirError(entry, failures)) {
        failures = [];
      } else if (entry.type === "assistant" && !entry.parent_tool_use_id) {
        last = entry.uuid;
        failures = [];
      }
      for (const send of linkEntry(entry, sendsOf(entry))) {
        last = send.uuid;
        if (send.state === "failed" || send.state === "replaced") {
          failures.push(send.uuid);
        }
        lines.set(send.uuid, send);
      }
    }
    return { lines, last };
  };

  /**
   * Whether a stored entry is the error that failed the sends before it —
   * an error result, or an error the harness wrote in the model's place —
   * and if so, mark it as theirs, as its live frame was: it draws no line of
   * its own, and is nobody's anchor.
   */
  const theirError = (entry: SessionMessage, failures: string[]): boolean => {
    if (failures.length === 0) {
      return false;
    }
    if (entry.type === "assistant" && entry.error) {
      (entry as unknown as NeutralAssistantMessage).failedSends = failures;
      return true;
    }
    const stored = entry.message as NeutralResultMessage | undefined;
    if (entry.type === "system" && stored?.is_error) {
      stored.failedSends = failures;
      return true;
    }
    return false;
  };

  /**
   * Which sends a stored entry is, in the order its harness took them up:
   * the one under the send's uuid (Claude stores it, or names it as a fold's
   * source), and those stored under the entry's id — opencode's message, pi's
   * entry, and the sends Claude joined into this record.
   *
   * A record that joins several ({@link SessionMessage.joined}) is stored
   * under the last one's uuid; the others are found by their words
   * ({@link joinedWith}), once, and kept under the record's uuid from then on
   * (`harnessId`), so every later read finds them the same way.
   */
  const sendFinder = (
    instanceId: string | undefined,
    entries: SessionMessage[]
  ): ((entry: SessionMessage) => SentMessageRow[]) => {
    const found = db.sendsFor(
      entries
        .filter((entry) => entry.type === "user" || entry.sourceUuid)
        .flatMap((entry) =>
          entry.sourceUuid ? [entry.sourceUuid, entry.uuid] : [entry.uuid]
        )
    );
    const byUuid = new Map(found.map((send) => [send.uuid, send]));
    const byHarnessId = Map.groupBy(
      found.filter((send) => send.harnessId !== null),
      (send) => send.harnessId as string
    );
    return (entry) => {
      const own = byUuid.get(entry.sourceUuid ?? entry.uuid);
      const held = (byHarnessId.get(entry.uuid) ?? []).filter(
        (send) => send.uuid !== own?.uuid
      );
      const sends = [...held, ...(own ? [own] : [])];
      if (own && instanceId && entry.joined && held.length === 0) {
        sends.push(...joinedWith(instanceId, entry, own));
      }
      return sends.sort(
        (a, b) => a.acceptedAt.getTime() - b.acceptedAt.getTime()
      );
    };
  };

  /** A send's words as the harness was handed them, when they are words alone. */
  const sentWords = (send: SentMessageRow): string | null => {
    const content = (send.body as NeutralUserMessage | null)?.message.content;
    return typeof content === "string" ? content : null;
  };

  /**
   * The sends Claude joined into `entry`, the stored record of `last`, ahead
   * of it: the record's words are theirs and then `last`'s, each on its own
   * line, in the order they were sent ({@link SessionMessage.joined}). Each
   * is found by its words among this session's sends before `last`, latest
   * first — the ones queued with it are the latest — and kept under the
   * record's uuid from here on. Words that do not come apart into this many
   * sends of this session join none.
   */
  const joinedWith = (
    instanceId: string,
    entry: SessionMessage,
    last: SentMessageRow
  ): SentMessageRow[] => {
    const stored = (entry.message as { content?: unknown }).content;
    const own = sentWords(last);
    if (!(typeof stored === "string" && own && stored.endsWith(`\n${own}`))) {
      return [];
    }
    // What is left to account for, ending in the newline before the next part.
    let rest = stored.slice(0, stored.length - own.length);
    const partners: SentMessageRow[] = [];
    const earlier = db
      .sendsIn(instanceId, ["pending", "read", "failed", "replaced"])
      .filter(
        (send) =>
          send.harnessId === null &&
          send.acceptedAt.getTime() < last.acceptedAt.getTime()
      )
      .reverse();
    for (const send of earlier) {
      const words = sentWords(send);
      if (
        words !== null &&
        (rest === `${words}\n` || rest.endsWith(`\n${words}\n`))
      ) {
        partners.unshift(send);
        rest = rest.slice(0, rest.length - words.length - 1);
        if (partners.length === (entry.joined ?? 0) - 1) {
          break;
        }
      }
    }
    if (rest !== "") {
      return [];
    }
    for (const send of partners) {
      db.linkSend(send.uuid, last.uuid);
    }
    return partners;
  };

  /**
   * One stored entry, linked to the sends it is. A record from before the hub
   * kept bodies takes the stored copy as its body — only an entry that is one
   * send holds that send's words alone. A pending send in an entry its
   * harness has taken up (not {@link SessionMessage.queued}) has been read:
   * this is a read that a restart kept from being framed.
   */
  const linkEntry = (
    entry: SessionMessage,
    found: SentMessageRow[]
  ): SentMessageRow[] => {
    if (found.length === 0) {
      return found;
    }
    entry.sends = found.map((send) => send.uuid);
    return found.map((each) => {
      let send = each;
      // Historical sends may predate stored bodies.
      if (!send.body && found.length === 1) {
        send =
          db.updateSend(send.uuid, {
            body: {
              type: "user",
              message: entry.message as NeutralUserMessage["message"],
            },
          }) ?? send;
      }
      return send.state === "pending" && !entry.queued
        ? readSend(send, false)
        : send;
    });
  };

  /**
   * A send as its record keeps it (`SendRecord.body`): the message under its
   * uuid, with what rode with it put back in — images first and pastes after
   * the typed words, the order every adapter hands them to its harness in.
   */
  const sentFrame = ({
    message,
    images = [],
    attachments = [],
  }: SendPayload): SentMessage => {
    if (!(images.length || attachments.length)) {
      return message;
    }
    const pasted = attachments
      .map(
        ({ name, content }) =>
          `\n\n<pasted-text name="${name}">\n${content}\n</pasted-text>`
      )
      .join("");
    const said = message.message.content;
    return {
      ...message,
      message: {
        role: "user",
        content: [
          ...images.map(({ mediaType, data }) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: mediaType, data },
          })),
          ...(typeof said === "string"
            ? [{ type: "text" as const, text: said + pasted }]
            : said),
        ],
      },
    };
  };

  /**
   * A spawn for a session that runs a work item, bounded to its workspace:
   * every spawn that reaches a machine for such a session — its restore after
   * an agent restart, a revive for a send, a relaunch from a dashboard or a
   * relay — carries the workspace, so the machine runs its shell commands
   * inside the boundary or refuses to start it. Any other spawn passes as is.
   */
  const identities = createSessionIdentities(db);
  const bounded = (
    payload: SpawnPayload,
    knownRow?: InstanceRow
  ): SpawnPayload => {
    const {
      sessionCredential: _callerCredential,
      scratchWorktree: _callerWorktree,
      ...asked
    } = payload;
    const owned = db.ownedInstance(payload.instanceId);
    const [stored] = db.getInstancesByIds([payload.instanceId]);
    if (!stored) {
      throw new Error("A spawn has no recorded process generation.");
    }
    const row = knownRow ?? stored;
    const workspace = row ? workItems.workspaceOf(row) : undefined;
    const harness = payload.harness ?? row?.harness ?? "claude";
    // Custody restores retain the process's live token; the hub deliberately
    // keeps only its hash. Fresh/revive/relaunch processes still need delivery.
    const acknowledgedRestore =
      payload.reattachOnly &&
      db.sessionIdentity(payload.instanceId)?.credentialHash;
    const sessionCredential =
      !acknowledgedRestore && (harness === "claude" || harness === "pi")
        ? identities.mint(payload.instanceId)
        : undefined;
    return {
      ...asked,
      ...(owned?.scratchWorktree
        ? { scratchWorktree: owned.scratchWorktree }
        : {}),
      processGeneration: processGeneration(stored),
      ...(stored.keepAliveTurn ? { keepAliveTurn: stored.keepAliveTurn } : {}),
      ...(workspace ? { workspace } : {}),
      ...(sessionCredential ? { sessionCredential } : {}),
    };
  };

  /** The permission modes a machine's harness reported, or undefined when it has not reported that harness. */
  const capabilityReports = new Map<string, HarnessReport[]>();
  const harnessModes = (
    machineId: string,
    harness: string
  ): readonly string[] | undefined => {
    let reports = capabilityReports.get(machineId);
    if (!reports) {
      reports = db.agentHarnesses(machineId);
      if (reports) {
        capabilityReports.set(machineId, reports);
      }
    }
    return reports?.find((report) => report.harness === harness)?.capabilities
      .permissionModes;
  };

  /**
   * The one rule for the permission mode a spawn runs in and records, applied
   * where every spawn leaves the hub (dashboard, delegate, start_session,
   * workflow, continuation, revive, restore). A harness that reports modes
   * runs in one it offers: the one asked for, else `fallback` — what the hub
   * picks when nobody asked (a work item's bypass, the caller's or the tree's
   * own mode, the row's last) — else explicit `bypassPermissions`, never the
   * machine's default. A harness that reports none (pi) records
   * none: a fallback is dropped, and a mode asked of it is refused. A machine
   * that has not reported the harness is taken at its word.
   */
  const settleMode = (
    machineId: string,
    payload: SpawnPayload,
    fallback?: string | null
  ):
    | { payload: SpawnPayload; permissionMode: string | null }
    | { refusal: string } => {
    const harness = payload.harness ?? "claude";
    const { permissionMode: asked, ...rest } = payload;
    if (harnessModes(machineId, harness)?.length === 0) {
      return asked
        ? {
            refusal: `${modeRefusal(machineId, harness, asked)} Start it without one. Nothing was started.`,
          }
        : { payload: rest, permissionMode: null };
    }
    const mode = asked ?? fallback ?? "bypassPermissions";
    const unfit = modeRefusal(machineId, harness, mode);
    return unfit
      ? { refusal: `${unfit} Nothing was started.` }
      : {
          payload: { ...rest, permissionMode: mode as PermissionMode },
          permissionMode: mode,
        };
  };

  /** Why `harness` on `machineId` cannot run in `mode`, or nothing when it can (or has not said). */
  const modeRefusal = (
    machineId: string,
    harness: string,
    mode: string
  ): string | undefined => {
    const modes = harnessModes(machineId, harness);
    if (!modes || modes.includes(mode)) {
      return undefined;
    }
    return modes.length === 0
      ? `${harness} has no permission modes, so a ${harness} session cannot run in "${mode}".`
      : `${harness} on this machine has no "${mode}" permission mode; it offers ${modes.join(", ")}.`;
  };

  /** {@link modeRefusal} for a session the hub already has. */
  const sessionModeRefusal = (
    instanceId: string,
    mode: string
  ): string | undefined => {
    const [row] = db.getInstancesByIds([instanceId]);
    return row
      ? modeRefusal(row.machineId, row.harness ?? "claude", mode)
      : undefined;
  };

  /**
   * The session's own word on its settings, written on its row: every `init`
   * names its model and permission mode, a `model_fallback` the model
   * that answers instead of the one asked for, and a successful mode control
   * the mode the harness just applied. True when the row moved. A
   * mode the session's harness does not have is not recorded (`settleMode`'s
   * rule).
   */
  const noteSessionSettings = (
    instanceId: string,
    payload: unknown
  ): boolean => {
    const settings = peekSessionSettings(payload);
    if (!settings) {
      return false;
    }
    const { model, permissionMode: mode } = settings;
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      return false;
    }
    const patch: { model?: string; permissionMode?: string } = {};
    if (typeof model === "string" && model && model !== row.model) {
      patch.model = model;
    }
    if (
      typeof mode === "string" &&
      mode &&
      mode !== row.permissionMode &&
      !sessionModeRefusal(instanceId, mode)
    ) {
      patch.permissionMode = mode;
    }
    if (Object.keys(patch).length === 0) {
      return false;
    }
    db.patchInstance(instanceId, patch);
    return true;
  };

  /**
   * Wakes the session a message is for when its process is gone: sleeping,
   * failed, or stopped with a conversation on record. The resume spawn goes
   * out first, and the machine runs one instance's envelopes in order, so the
   * message that follows lands in the process this starts. It comes back on
   * the settings it last ran with, as a revive always has.
   *
   * `crossed` is the wake for sends that were already on their way when the
   * machine put the session to sleep ({@link sessionAsleep}): those are held
   * by the machine for this very process, so they stay pending.
   */
  const wakeForSend = (
    agent: NonNullable<ReturnType<typeof registry.agent>>,
    machineId: string,
    instanceId: string,
    crossed = false
  ): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (
      !(
        row?.sessionId &&
        (row.status === "sleeping" ||
          row.status === "error" ||
          row.status === "stopped")
      )
    ) {
      return;
    }
    const settled = settleMode(
      machineId,
      {
        instanceId,
        cwd: row.cwd,
        ...(row.harness ? { harness: row.harness as HarnessKind } : {}),
        resume: { sessionKey: row.sessionId },
        ...(row.kind === "scratch" ? { scratch: {} } : {}),
        ...(row.model ? { model: row.model } : {}),
        ...(isEffortLevel(row.effort) ? { effort: row.effort } : {}),
      },
      row.permissionMode
    );
    if ("refusal" in settled) {
      console.warn(`[hub] not waking ${instanceId}: ${settled.refusal}`);
      return;
    }
    const revive = settled.payload;
    // A relaunch replaces the process; what the old one had parked is over.
    if (!crossed) {
      forgetPending(instanceId, UNREAD.restarted);
    }
    db.openInstance({
      id: instanceId,
      addressProtocol: addressProtocolMachines.has(machineId),
      machineId,
      cwd: row.cwd,
      sessionId: row.sessionId,
      harness: row.harness ?? undefined,
      kind: row.kind ?? undefined,
      permissionMode: settled.permissionMode,
      model: row.model ?? undefined,
    });
    sendSpawn(agent, machineId, {
      verb: "spawn",
      machineId,
      instanceId,
      payload: bounded(revive),
    });
    publishInstances(machineId);
  };

  /**
   * A machine put a session to sleep: it was at rest, and its machine stopped
   * everything it ran (`asleep`, see `SessionSupervisor.sleep` in the agent).
   * The row is filed `sleeping`, which every screen already draws, and the
   * next send wakes it through {@link wakeForSend} like any sleeping session.
   *
   * Nothing it was sent is failed, as a process that died would have it: the
   * machine put it to sleep only with every earlier send read, so a send
   * still pending here is one that crossed the stop on its way. The machine
   * holds those, and the process this wakes for them reads them.
   */
  const sessionAsleep = (machineId: string, instanceId: string): void => {
    if (!db.sleepInstance(instanceId)) {
      return;
    }
    console.log(
      `[hub] ${instanceId} is asleep: its machine stopped it at rest`
    );
    pending.forget(instanceId);
    forgetPending(instanceId, UNREAD.ended, true);
    // Asks its delegates had routed to it and it never answered are the
    // reader's from here, as when any parent's process goes.
    escalateRoutedAsks(instanceId);
    // Nothing wakes a session for a keep-alive ping: its machine refuses one
    // that crossed, and the record fails as any refused ping's does.
    const agent = registry.agent(machineId);
    if (
      agent &&
      db
        .sendsIn(instanceId, ["pending"])
        .some((send) => !isKeepAlive(send.body))
    ) {
      wakeForSend(agent, machineId, instanceId, true);
    }
    publishInstances(machineId);
  };

  /**
   * The sessions among `ids` whose prompt cache this hub is keeping warm
   * ({@link tickKeepAlive}): keep-alive is on and has a cache to ping for, or
   * is waiting out a usage limit to. A ping needs the session's process and is
   * never sent to a sleeping one, so its machine keeps these awake
   * (`HeartbeatAckPayload.keepAwake`). One whose cache has gone cold, or whose
   * keep-alive reached its cap, sleeps like any other.
   */
  const keptWarm = (machineId: string, ids: string[]): string[] => {
    if (ids.length === 0) {
      return [];
    }
    const usage = db
      .listUsageLimits()
      .find((reading) => reading.machineId === machineId)?.payload;
    const now = Date.now();
    return db
      .getInstancesByIds(ids)
      .filter((row) => {
        const { state } = keepAliveState(row, usage, now);
        return (
          row.machineId === machineId &&
          (state === "waiting" || state === "paused-usage")
        );
      })
      .map((row) => row.id);
  };

  /**
   * How long a machine gets to put a session to sleep: the harness's own stop
   * (an interrupt, a settle, the process's exit) takes seconds.
   */
  const SLEEP_TIMEOUT_MS = 60_000;

  /**
   * A delegate whose work item is over (done, failed or cancelled) and
   * reported has nothing left to run for: its machine is asked to put it to
   * sleep now, rather than at the end of an idle half hour. Asked when the
   * item ends and again as each later turn of its session ends, because a
   * machine does it only for a session at rest ({@link CONTROL_SLEEP}), and
   * the turn that called `finish_item` is still running when the item ends.
   * The machine's `asleep` frame is what files the row.
   */
  const sleepFinished = (instanceId: string): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (
      !(row && workItems.over(row)) ||
      (row.status !== "running" && row.status !== "starting") ||
      keptWarm(row.machineId, [row.id]).length > 0
    ) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: the machine's `asleep` frame carries the outcome; a refusal means the session is not at rest
    void callAgent(
      row.machineId,
      CONTROL_SLEEP,
      [],
      SLEEP_TIMEOUT_MS,
      undefined,
      row.id
    );
  };

  /**
   * What taking a send means beyond the send itself, whoever sent it — the
   * one place it is done. The reader's hand clears a supervisor's mute; a
   * session's first words name it; a queued hand-off is work the target now
   * carries, and a send that starts a turn reads it; an urgent send cuts into
   * the turn it lands in; the parent's or the reader's word to a delegate
   * starts its item's count of quiet turns over.
   */
  const afterSend = (
    { machineId, payload }: Envelope<SendPayload>,
    mode: SendMode
  ): void => {
    const { instanceId, message } = payload;
    if (isKeepAlive(message)) {
      return;
    }
    if (mode === "urgent") {
      noteInterrupt(instanceId);
    }
    if (message.origin.kind === "human") {
      supervisor.noteHumanSend(instanceId);
    }
    workItems.heard(instanceId, message.origin);
    if (!hasAttachments(payload)) {
      nameFromLiveTurn(machineId, instanceId, message);
    }
    const from = peekPeer(payload);
    if (from && !isQuerySend(payload)) {
      handoffs.set(instanceId, { from, at: Date.now() });
      publishInstances(machineId);
    } else if (isQuerySend(payload) && handoffs.delete(instanceId)) {
      publishInstances(machineId);
    }
  };

  /**
   * THE ONE PATH A MESSAGE TAKES INTO A SESSION, whoever sent it — a reader, a
   * rule, the supervisor, a delegate's report, another session's hand-off.
   * A session whose process is gone is woken first ({@link wakeForSend}), so
   * every sender reaches a sleeping session the same way. The machine gets
   * it, and the hub writes its record — pending, or failed when the machine
   * is not there to take it — and says so on the session's stream, so every
   * tab, device and late joiner draws the same row under the same id.
   *
   * Finished work is reached by the reader or its parent only: their send
   * reopens the item and wakes the same session; anyone else's fails with
   * the item's state ({@link inputRefusal}), and nothing wakes.
   *
   * A uuid the hub already has a record for is the same send again (a tab
   * trying once more after its socket dropped): the machine is not handed it
   * twice, and the record it has is said again for whoever asked.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the single send transaction orders refusal, recovery, delivery and persistence.
  const deliverSend = (envelope: Envelope<SendPayload>): SentMessageRow => {
    const { instanceId, message } = envelope.payload;
    const keepAlive = isKeepAlive(message);
    const known = db.sendRecord(message.uuid);
    if (known) {
      publishSend(known);
      return known;
    }
    const refused = keepAlive
      ? undefined
      : inputRefusal(instanceId, message.origin);
    if (refused === CLAUDE_CONVERSATION_GONE) {
      throw new WorkItemRefusal(409, refused);
    }
    // A machine that closed its socket moments ago is restarting its agent:
    // the send waits for its register and goes then, through this same path
    // ({@link releaseAwaiting}). It is written down when it goes, not now: the
    // register settles what its sessions held, and a record already pending
    // would be settled as a send the restart lost.
    const reconnecting = awaitingMachine.get(envelope.machineId);
    if (
      !(keepAlive || refused) &&
      reconnecting &&
      !registry.agent(envelope.machineId)
    ) {
      reconnecting.push(envelope);
      return {
        uuid: message.uuid,
        instanceId,
        acceptedAt: new Date(),
        harnessId: null,
        body: sentFrame(envelope.payload),
        mode: sendMode(envelope.payload),
        state: "pending",
        reason: null,
        anchor: null,
        replaces: message.replaces ?? null,
        replacedBy: null,
        held: false,
      };
    }
    const agent = refused ? undefined : registry.agent(envelope.machineId);
    const from =
      message.origin.kind === "peer" ? message.origin.fromSession : undefined;
    const waitSummary =
      agent && from ? workItems.waitSummary(from, instanceId) : "";
    if (waitSummary) {
      const { content } = message.message;
      message.message.content =
        typeof content === "string"
          ? `${content}${waitSummary}`
          : [...content, { type: "text", text: waitSummary }];
    }
    if (agent) {
      if (keepAlive) {
        db.updateKeepAlive(instanceId, { keepAliveTurn: message.uuid });
      } else {
        workItems.reopen(instanceId);
        wakeForSend(agent, envelope.machineId, instanceId);
      }
      agent.send(envelope);
    }
    // Built after the send has gone: the machine is handed the image bytes,
    // the record a reference to them.
    const mode = sendMode(envelope.payload);
    const record = db.recordSend({
      uuid: message.uuid,
      instanceId,
      acceptedAt: new Date(),
      body: externalizeImages(sentFrame(envelope.payload)),
      mode,
      ...(message.replaces ? { replaces: message.replaces } : {}),
      ...(agent
        ? { state: "pending" as const }
        : {
            state: "failed" as const,
            reason: refused ?? `machine ${envelope.machineId} is not connected`,
            anchor: anchors.get(instanceId) ?? null,
          }),
    });
    // The send it retries goes first, so a screen folds that row away as
    // this one arrives.
    if (message.replaces) {
      replaceSend(message.replaces, record.uuid);
    }
    publishSend(record);
    if (agent) {
      if (from) {
        workItems.delivered(from, instanceId);
      }
      afterSend(envelope, mode);
    }
    return record;
  };

  /**
   * Sends waiting on a machine whose agent is restarting, by machine: there
   * from the moment its socket closes until it registers again or
   * {@link RECONNECT_GRACE_MS} runs out, whichever is first.
   */
  const awaitingMachine = new Map<string, Envelope<SendPayload>[]>();

  /**
   * What waited on a machine, sent now through {@link deliverSend}: after its
   * register, where it reaches the agent behind the restores (the agent holds
   * a send for a session it is still taking custody of); or, when the grace
   * ran out, failed "not connected" as any send to an absent machine is.
   */
  const releaseAwaiting = (machineId: string): void => {
    const waited = awaitingMachine.get(machineId);
    awaitingMachine.delete(machineId);
    for (const envelope of waited ?? []) {
      deliverSend(envelope);
    }
  };
  /**
   * Each session's final message of the turn in flight: the text frames that
   * followed its last tool call. A tool call empties it, so what came before
   * (narration of work still under way) never reaches the parent. It is a
   * list because Claude emits one frame per content block, so one final
   * message can arrive as several text frames.
   */
  const finalMessage = new Map<string, string[]>();
  /**
   * Installs somebody is waiting on, by `requestId`: what keeps a machine from
   * being sent the same install twice while the first is still running, and
   * what tells a `control_result` that it is carrying a tool's status.
   */
  const pendingInstalls = new Map<
    string,
    { machineId: string; toolId: string }
  >();
  /**
   * Transcript deletes somebody is waiting on, by `requestId`: when the
   * machine says the transcript is gone, the rows that named it go too —
   * otherwise a sleeping row points at a conversation that no longer exists.
   */
  /**
   * Fleet syncs somebody is waiting on, by `requestId` → the machine running
   * one: what tells a `control_result` that it is carrying a machine's own
   * account of the fleet config rather than an answer for whoever asked.
   */
  const pendingFleet = new Map<string, string>();
  /**
   * Controls a REST call is waiting on, by `requestId`. A dashboard's control is
   * answered over the socket it asked on; a route has nothing to hold the reply
   * against but this.
   */
  const waiting = new Map<string, (frame: ControlResult) => void>();
  const waitingMachines = new Map<string, string>();
  const unroutedReplies = new Set<string>();
  const logUnroutedReply = (message: Envelope): void => {
    const requestId = message.requestId ?? peek(message.payload, "requestId");
    const instanceId =
      message.instanceId ?? peek(message.payload, "instanceId");
    const kind = peek(message.payload, "kind") ?? "unknown";
    const key = `${message.machineId}:${instanceId}:${requestId}:${kind}`;
    if (unroutedReplies.has(key)) {
      return;
    }
    unroutedReplies.add(key);
    if (unroutedReplies.size > UNROUTED_REPLY_LIMIT) {
      const oldest = unroutedReplies.values().next().value;
      if (oldest !== undefined) {
        unroutedReplies.delete(oldest);
      }
    }
    console.warn(
      `[hub] unrouted reply session=${instanceId ?? "none"} request=${requestId ?? "none"} kind=${kind} machine=${message.machineId}`
    );
  };

  /**
   * Where each conversation lives, once somebody has had to find out.
   *
   * `null` is a remembered "nobody holds this", which matters as much as a
   * hit: without it a mistyped or deleted id would sweep every connected
   * machine on every render that mentioned it. Cleared whenever a machine
   * joins, because a machine arriving is precisely the event that can turn a
   * `null` into an answer.
   */
  const locations = new Map<string, SessionLocation | null>();

  /**
   * Asks a machine something and waits for the frame that answers it. A machine
   * that is not connected and one that will not answer are told apart on
   * purpose: the first is the fleet's own state, the second is a machine that
   * has something wrong with it.
   */
  const callAgent = (
    machineId: string,
    method: string,
    args: unknown[],
    timeoutMs: number,
    harness?: HarnessKind,
    instanceId?: string
  ): Promise<ControlResult | "offline" | "timeout"> => {
    const agent = registry.agent(machineId);
    if (!agent) {
      return Promise.resolve("offline");
    }

    const requestId = crypto.randomUUID();
    const payload: ControlPayload = {
      requestId,
      method,
      args,
      ...(harness && { harness }),
      ...(instanceId && { instanceId }),
    };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve("timeout");
      }, timeoutMs);
      waitingMachines.set(requestId, machineId);
      waiting.set(requestId, (frame) => {
        clearTimeout(timer);
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve(frame);
      });
      agent.send({
        verb: "control",
        machineId,
        ...(instanceId && { instanceId }),
        payload,
      } satisfies Envelope<ControlPayload>);
    });
  };

  /** A PATCH changes the live harness first; its receipt files the stored mode. */
  const applyPermissionMode = async (
    row: InstanceRow,
    mode: string
  ): Promise<{ code: 400 | 500 | 503 | 504; error: string } | undefined> => {
    const unfit = sessionModeRefusal(row.id, mode);
    if (unfit) {
      return { code: 400, error: unfit };
    }
    const answer = await callAgent(
      row.machineId,
      CONTROL_SET_PERMISSION_MODE,
      [mode],
      BUSY_TIMEOUT_MS,
      undefined,
      row.id
    );
    if (answer === "offline") {
      return { code: 503, error: "Machine is not connected" };
    }
    if (answer === "timeout") {
      return { code: 504, error: "Machine did not apply the permission mode" };
    }
    if (!answer.ok) {
      return {
        code: 500,
        error: answer.error ?? "Permission mode was refused",
      };
    }
    if (peek(answer.result, "permissionMode") !== mode) {
      return {
        code: 500,
        error: "Harness did not acknowledge the permission mode",
      };
    }
    return undefined;
  };

  /**
   * One counter per instance, moved by every preview start and close. A start
   * awaits the daemon; if the instance was stopped, closed or lost meanwhile,
   * the counter has moved on and the late answer must not become a target —
   * the listener it names gets stopped instead.
   */
  const previewGeneration = new Map<string, number>();
  const nextPreviewGeneration = (instanceId: string): number => {
    const generation = (previewGeneration.get(instanceId) ?? 0) + 1;
    previewGeneration.set(instanceId, generation);
    return generation;
  };

  const publishPreview = (
    instanceId: string,
    state: "open" | "closed",
    source: PreviewSource,
    revision: string
  ) => {
    const frame = previewFrame(instanceId, state, source, revision);
    streams.sequence(instanceId, frame);
    return frame;
  };

  const closePreview = async (
    instanceId: string
  ): Promise<
    | { ok: true; closed: { instanceId: string; state: "closed" } }
    | { ok: false; code: 500 | 503 | 504; error: string }
  > => {
    const closed = {
      ok: true,
      closed: { instanceId, state: "closed" },
    } as const;
    nextPreviewGeneration(instanceId);
    const target = previewTargets.get(instanceId);
    if (!target) {
      return closed;
    }
    previewTargets.delete(instanceId);
    publishPreview(instanceId, "closed", target.source, target.revision);
    const answer = await callAgent(
      target.machineId,
      PREVIEW_STOP,
      [{ instanceId }],
      BUSY_TIMEOUT_MS
    );
    if (answer === "offline") {
      return { ok: false, code: 503, error: "Machine is not connected" };
    }
    if (answer === "timeout") {
      return { ok: false, code: 504, error: "Machine did not answer" };
    }
    if (!answer.ok) {
      return { ok: false, code: 500, error: answer.error ?? "" };
    }
    return closed;
  };

  /**
   * Starts the daemon's listener for an instance's preview and makes it the
   * target. The operator's open and a returning machine's restart both come
   * through here.
   */
  const openPreview = async (
    instanceId: string,
    machineId: string,
    source: PreviewSource
  ): Promise<
    | { ok: true; frame: ReturnType<typeof previewFrame> }
    | { ok: false; code: 409 | 500 | 503 | 504; error: string }
  > => {
    const generation = nextPreviewGeneration(instanceId);
    const stopLate = () =>
      callAgent(
        machineId,
        PREVIEW_STOP,
        [{ instanceId }],
        BUSY_TIMEOUT_MS
      ).catch(console.error);
    const answer = await callAgent(
      machineId,
      PREVIEW_START,
      [{ instanceId, ...source }],
      BUSY_TIMEOUT_MS
    );
    if (answer === "offline") {
      return { ok: false, code: 503, error: "Machine is not connected" };
    }
    if (answer === "timeout") {
      // The daemon may still finish the start after this gave up; the
      // listener it would open has no target here, so it is told to go.
      stopLate();
      return { ok: false, code: 504, error: "Machine did not answer" };
    }
    if (!answer.ok) {
      return {
        ok: false,
        code: 500,
        error: answer.error ?? "Preview failed",
      };
    }
    if (previewGeneration.get(instanceId) !== generation) {
      stopLate();
      return {
        ok: false,
        code: 409,
        error: "Preview was closed while starting.",
      };
    }
    const address = registry.address(machineId);
    if (!address) {
      return { ok: false, code: 503, error: "Machine is not connected" };
    }
    const revision = crypto.randomUUID();
    previewTargets.set(instanceId, {
      machineId,
      source,
      revision,
      upstream: { address, port: (answer.result as { port: number }).port },
    });
    return {
      ok: true,
      frame: publishPreview(instanceId, "open", source, revision),
    };
  };

  /**
   * Machines whose previews this hub process has an account of. The first
   * register from one after the hub starts is the only time a listener it
   * reports without a target is the hub's own lost memory; after that, such a
   * listener is one the operator closed while the machine was away.
   */
  const previewMachines = new Set<string>();

  /**
   * A register squares the machine's preview listeners with this hub's
   * targets. A target whose listener the daemon still serves is pointed at it
   * again. One it does not serve — the daemon restarted — is started again on
   * the same source, and the "open" that follows reloads every dashboard's
   * pane onto the new listener; if that start fails the preview is closed. A
   * listener with no target is kept after a hub restart and stopped otherwise.
   */
  const reconcilePreviews = (
    machineId: string,
    address: string,
    serving: ServingPreview[]
  ): void => {
    const known = previewMachines.has(machineId);
    previewMachines.add(machineId);
    const listeners = new Map(
      serving.map((listener) => [listener.instanceId, listener])
    );
    for (const [instanceId, target] of previewTargets) {
      if (target.machineId !== machineId) {
        continue;
      }
      const listener = listeners.get(instanceId);
      if (listener) {
        previewTargets.set(instanceId, {
          ...target,
          upstream: { address, port: listener.port },
        });
        continue;
      }
      openPreview(instanceId, machineId, target.source)
        .then((started) => {
          // Not connected: the next register tries again. Superseded: a close
          // or a newer start already decided.
          if (
            started.ok ||
            started.code === 409 ||
            !registry.agent(machineId)
          ) {
            return;
          }
          console.warn(
            `[hub] preview for ${instanceId} did not restart: ${started.error}`
          );
          previewTargets.delete(instanceId);
          publishPreview(instanceId, "closed", target.source, target.revision);
        })
        .catch(console.error);
    }
    for (const listener of serving) {
      if (previewTargets.has(listener.instanceId)) {
        continue;
      }
      if (known) {
        callAgent(
          machineId,
          PREVIEW_STOP,
          [{ instanceId: listener.instanceId }],
          BUSY_TIMEOUT_MS
        ).catch(console.error);
        continue;
      }
      const revision = crypto.randomUUID();
      previewTargets.set(listener.instanceId, {
        machineId,
        source: listener.source,
        revision,
        upstream: { address, port: listener.port },
      });
      publishPreview(listener.instanceId, "open", listener.source, revision);
    }
  };

  /**
   * WHERE a conversation lives: which machine, which folder, which harness.
   *
   * A session id is a uuid and does not collide, so it identifies a
   * conversation completely — but it does not LOCATE one, and the two got
   * conflated. Every link carried the machine and folder around as query
   * parameters, and every client kept its own copy in a capped
   * most-recently-used record. Both were caches of a fact the fleet already
   * knew, and when a cache was lost or evicted the conversation became
   * unreachable: not missing, just unaddressed.
   *
   * So the fleet answers instead. The hub's own row first, which covers
   * everything it ever spawned or adopted. Failing that, ask the connected
   * machines whether they hold a transcript under that id — the harnesses
   * already answer exactly this question, and asking one id is a lookup
   * rather than the fleet-wide directory sweep a catalogue read would be
   * (898 files and 1.1GB on one machine here, which is why the catalogue is
   * capped and why a capped catalogue was never the thing to resolve
   * against). Each harness the machine reports is asked, because the control
   * goes to ONE adapter and only the one that wrote the transcript can find
   * it; a daemon that predates harness reporting is asked about every kind.
   *
   * The answer is kept, so a conversation is located once per hub lifetime
   * and every reader after the first is a map lookup. Deliberately in
   * memory: this is a cache of something the machines can always be asked
   * again, and a stale row on disk claiming a transcript lives somewhere it
   * no longer does would be worse than the question being asked twice.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves a session's location from the cache, the stored row, or a live ask across every machine and harness in one place; splitting it would scatter the fallback order this depends on.
  const locateSession = async (id: string): Promise<SessionLocation | null> => {
    if (db.hiddenSession(id)) {
      return null;
    }
    const known = locations.get(id);
    if (known !== undefined) {
      return known;
    }

    const [row] = db.getInstancesByIds([id]);
    if (row) {
      // The row is the single authority for its session: a row that never
      // reported a key holds nothing locatable, and no machine is asked under
      // a guessed one. Not cached, so the key it reports later is found.
      // Rows are written before their harness address is known.
      if (!row.sessionId) {
        return null;
      }
      const found: SessionLocation = {
        id,
        machineId: row.machineId,
        sessionId: row.sessionId,
        cwd: row.cwd ?? "",
        harness: (row.harness as HarnessKind | undefined) ?? "claude",
      };
      locations.set(id, found);
      return found;
    }

    // Nobody spawned it here, so it is a transcript somebody left on a disk.
    // Ask the machines that are actually reachable, newest contact first.
    for (const agent of db.listAgents()) {
      if (!registry.agent(agent.machineId)) {
        continue;
      }
      const kinds =
        agent.harnesses && agent.harnesses.length > 0
          ? agent.harnesses.map((report) => report.harness)
          : HARNESSES;
      // One machine, every adapter at once: the asks are independent reads and
      // the machine answers them concurrently, so the wait is the slowest one
      // rather than their sum.
      // biome-ignore lint/performance/noAwaitInLoops: machines are asked one at a time and the loop returns on the first hit — a session found on the second machine must not race an ask still in flight to the first.
      const answers = await Promise.all(
        kinds.map(async (harness) => {
          const answer = await callAgent(
            agent.machineId,
            CONTROL_GET_SESSION_INFO,
            [id],
            READ_TIMEOUT_MS,
            harness
          );
          if (answer === "offline" || answer === "timeout" || !answer.ok) {
            return null;
          }
          const info = answer.result as
            | { sessionId?: string; cwd?: string; harness?: string }
            | undefined
            | null;
          return info?.sessionId
            ? { harness, sessionId: info.sessionId, info }
            : null;
        })
      );
      const hit = answers.find((answer) => answer !== null);
      if (!hit) {
        continue;
      }
      const found: SessionLocation = {
        id,
        machineId: agent.machineId,
        sessionId: hit.sessionId,
        cwd: hit.info.cwd ?? "",
        harness: (hit.info.harness as HarnessKind | undefined) ?? hit.harness,
      };
      locations.set(id, found);
      return found;
    }

    // Remembered as unknown too, so a bad id cannot make every render sweep
    // the fleet. A machine coming online clears this (see `locations`).
    locations.set(id, null);
    return null;
  };

  /**
   * Summariser turns a continuation is waiting on, by instance id. Settled by
   * frames the hub already reads: the turn's `result`, an `error` frame, or
   * the session stopping before it answered — or its machine going away. What
   * it answered is then read from its transcript.
   */
  const turnWaiters = new Map<
    string,
    {
      machineId: string;
      resolve: () => void;
      reject: (error: Error) => void;
    }
  >();

  /**
   * Every summariser session this hub has started, its rows' kind: internal
   * workers no rule, supervisor, usage count, hand-back or Telegram hears, and
   * no board lists. Seeded from the rows, so a hub restart still knows them.
   */
  const summarisers = new Set(
    db
      .listInstances()
      .filter((row) => row.kind === "summariser")
      .map((row) => row.id)
  );

  /** Sends something a machine answers under `requestId`, and waits for that answer. */
  const awaitReply = (
    machineId: string,
    requestId: string,
    timeoutMs: number,
    send: () => void
  ): Promise<ControlResult | "timeout"> =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve("timeout");
      }, timeoutMs);
      waitingMachines.set(requestId, machineId);
      waiting.set(requestId, (frame) => {
        clearTimeout(timer);
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve(frame);
      });
      try {
        send();
      } catch (error) {
        // Refused before it went: nothing will answer, so nothing waits.
        clearTimeout(timer);
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        reject(error);
      }
    });

  /**
   * A spawn sent on a session's behalf — a relayed one, or a work item's —
   * recorded as every spawn is: the row is what puts it in the rail. A
   * conversation that starts here is named by its first turn.
   */
  const issueSpawn = (
    machineId: string,
    asked: SpawnPayload,
    workItemId?: string,
    fallbackMode?: string | null
  ): void => {
    const agent = registry.agent(machineId);
    if (!agent) {
      throw new Error(`machine ${machineId} is not connected`);
    }
    if (asked.requestId && holdingStarts(machineId)) {
      // The caller is waiting for this start; it is told now rather than left to time out.
      throw new Error(
        `machine ${machineId} is installing an update; start the session again when it finishes`
      );
    }
    const settled = settleMode(machineId, asked, fallbackMode);
    if ("refusal" in settled) {
      throw new WorkItemRefusal(400, settled.refusal);
    }
    const { payload } = settled;
    forgetPending(payload.instanceId, UNREAD.restarted);
    db.openInstance({
      id: payload.instanceId,
      addressProtocol: addressProtocolMachines.has(machineId),
      machineId,
      cwd: payload.cwd,
      sessionId: peekResume(payload),
      harness: payload.harness,
      projectId: payload.projectId,
      title: payload.title,
      kind: peekKind(payload),
      permissionMode: settled.permissionMode,
      model: payload.model,
      canDelegate: payload.canDelegate,
      workflowRunId: payload.workflowRunId,
      workflowStepId: payload.workflowStepId,
      ...peekParent(payload),
      ...(workItemId ? { workItemId } : {}),
    });
    sendSpawn(agent, machineId, {
      verb: "spawn",
      machineId,
      instanceId: payload.instanceId,
      payload: bounded(payload),
    } satisfies Envelope<SpawnPayload>);
    if (!peekResume(payload)) {
      awaitingFirstTurn.add(payload.instanceId);
    }
    publishInstances(machineId);
  };

  /**
   * An in-process spawn, issued. One that carries a `requestId` (start_session's)
   * is held until its machine says the session is in place, and answers with
   * the machine's own words when it is not; one without is fire-and-forget,
   * its failure reaching the row and its parent later.
   */
  const relaySpawn = async (
    machineId: string,
    payload: SpawnPayload,
    fallbackMode?: string
  ): Promise<{ code: number; message: string } | undefined> => {
    const { requestId } = payload;
    if (!requestId) {
      issueSpawn(machineId, payload, undefined, fallbackMode);
      return;
    }
    const reply = await awaitReply(
      machineId,
      requestId,
      SPAWN_START_TIMEOUT_MS,
      () => issueSpawn(machineId, payload, undefined, fallbackMode)
    );
    if (reply === "timeout") {
      return {
        code: 504,
        message: `the session on ${machineId} did not start within ${SPAWN_START_TIMEOUT_MS / 1000}s`,
      };
    }
    if (!reply.ok) {
      return {
        code: 422,
        message: reply.error ?? "the session failed to start",
      };
    }
  };

  /** Shared by session tools and trusted workflow callbacks; never an HTTP door. */
  const spawnSession = async (
    machineId: string,
    payload: SpawnPayload,
    fallbackMode?: string
  ): Promise<void> => {
    const rows = db.listInstances();
    const refusal = enforceRowSessionKey(
      rows.find((row) => row.id === payload.instanceId),
      payload
    );
    if (refusal) {
      throw new WorkItemRefusal(409, refusal);
    }
    if (!registry.agent(machineId)) {
      throw new WorkItemRefusal(404, `machine ${machineId} is not connected`);
    }
    const { parentInstanceId } = peekParent(payload);
    const refused = await relaySpawn(
      machineId,
      payload,
      fallbackMode ??
        (parentInstanceId
          ? resolveDelegatePermissionMode(rows, parentInstanceId)
          : undefined)
    );
    if (refused) {
      throw new Error(refused.message);
    }
  };

  /**
   * Spawns a session from the hub itself — a continuation's summarisers and
   * its target — recorded exactly like a dashboard's spawn, and resolved once
   * the machine says the session is in place. A refusal is the machine's own
   * words.
   */
  const spawnFromHub = async (
    machineId: string,
    asked: SpawnPayload,
    kind: InstanceKind,
    fallbackMode?: string
  ): Promise<void> => {
    const agent = registry.agent(machineId);
    if (!agent) {
      throw new MachineAway(machineId);
    }
    if (holdingStarts(machineId)) {
      throw new MachineAway(machineId);
    }
    const settled = settleMode(machineId, asked, fallbackMode);
    if ("refusal" in settled) {
      throw new Error(settled.refusal);
    }
    const { payload } = settled;
    const requestId = crypto.randomUUID();
    forgetPending(payload.instanceId, UNREAD.restarted);
    db.openInstance({
      id: payload.instanceId,
      addressProtocol: addressProtocolMachines.has(machineId),
      machineId,
      cwd: payload.cwd,
      harness: payload.harness,
      projectId: payload.projectId,
      title: payload.title,
      kind,
      permissionMode: settled.permissionMode,
      model: payload.model,
    });
    publishInstances(machineId);
    const reply = await awaitReply(
      machineId,
      requestId,
      SPAWN_START_TIMEOUT_MS,
      () =>
        agent.send({
          verb: "spawn",
          machineId,
          instanceId: payload.instanceId,
          payload: { ...bounded(payload), requestId },
        } satisfies Envelope<SpawnPayload>)
    );
    if (reply === "timeout") {
      throw new Error(
        `the ${payload.harness} session on ${machineId} did not start within ${SPAWN_START_TIMEOUT_MS / 1000}s`
      );
    }
    if (!reply.ok) {
      throw reply.error === MACHINE_DISCONNECTED
        ? new MachineAway(machineId)
        : new Error(reply.error ?? "the session failed to start");
    }
  };

  /**
   * Puts one user message into a session, from the session it continues,
   * under `uuid`: its send record is what says it went.
   */
  const sendFromHub = (
    machineId: string,
    instanceId: string,
    content: string,
    from: { id: string; cwd: string },
    uuid: string
  ): void => {
    deliverSend({
      verb: "send",
      machineId,
      instanceId,
      payload: {
        instanceId,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: {
            kind: "peer",
            from: from.id,
            name: leaf(from.cwd),
            fromSession: from.id,
          },
        },
      },
    } satisfies Envelope<SendPayload>);
  };

  const refreshingCustody = new Set<string>();
  const guardedDashboardMessage =
    <
      S extends HubSocket & {
        headers: Record<string, string | undefined>;
        remoteAddress: string;
      },
    >(
      handle: (ws: S, message: unknown) => void
    ) =>
    (ws: S, message: unknown): void => {
      try {
        handle(ws, message);
      } catch (error) {
        if (isEnvelope(message)) {
          toDashboard(
            ws,
            failure(
              message,
              error instanceof Error ? error.message : String(error)
            )
          );
        }
      }
    };
  const guardedAgentMessage =
    <
      S extends HubSocket & {
        remoteAddress: string;
        close: (code?: number, reason?: string) => unknown;
      },
    >(
      handle: (ws: S, message: unknown) => Promise<void>
    ) =>
    (ws: S, message: unknown): Promise<void> =>
      handle(ws, message).catch(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: acknowledgement failures and correlated request failures share one socket error policy with explicit traces
        (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          if (!isEnvelope(message)) {
            console.error(`[hub] malformed agent frame failed: ${reason}`);
            return;
          }
          console.error(
            `[hub] ${message.verb} for ${message.instanceId ?? "the machine"} failed: ${reason}`
          );
          const awaitsAddress =
            message.verb === "frames" &&
            peek(message.payload, "kind") === "session_address";
          const replaysAddresses =
            message.verb === "heartbeat" &&
            !!addressClaims(message.payload)?.length;
          if (
            message.verb === "register" ||
            awaitsAddress ||
            replaysAddresses
          ) {
            ws.close(
              1011,
              "Session acknowledgement failed. Reconnect to retry custody."
            );
            return;
          }
          const requestId =
            message.requestId ?? peek(message.payload, "requestId");
          if (requestId) {
            const frame: ControlResult = {
              kind: "control_result",
              requestId,
              ok: false,
              error: reason,
            };
            const waitingReply = waiting.get(requestId);
            if (waitingReply) {
              waitingReply(frame);
            }
            const commandAnswered = streams.settleCommand(requestId, frame);
            const requester = registry.takeRequester(requestId);
            if (requester) {
              toDashboard(requester, {
                ...message,
                verb: "frames",
                requestId,
                payload: frame,
              });
            } else if (!(waitingReply || commandAnswered)) {
              logUnroutedReply({ ...message, payload: frame });
            }
          }
        }
      );
  const recoveringRemoved = new Set<string>();
  const stopDispatches = new Map<
    string,
    {
      instanceId: string;
      machineId: string;
      requestId: string | undefined;
      at: number;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const finishStopDispatch = (key: string, outcome: string): void => {
    const sent = stopDispatches.get(key);
    if (!sent) {
      return;
    }
    clearTimeout(sent.timer);
    stopDispatches.delete(key);
    console.info(
      `[hub] stop session=${sent.instanceId} request=${sent.requestId ?? "none"} machine=${sent.machineId} outcome=${outcome} elapsedMs=${Date.now() - sent.at}`
    );
  };
  const lifecycle = createSessionLifecycle({
    db,
    machineName: (machineId) => {
      const machine = db
        .listAgents()
        .find((agent) => agent.machineId === machineId);
      if (!machine) {
        throw new Error(
          "This machine is no longer registered. Register its agent, then retry."
        );
      }
      return machine.hostname;
    },
    confirmed: (row) => {
      if (row.workflowStepId && row.workflowRunId) {
        workflowRuntime.endConfirmed(row.workflowRunId);
      }
    },
    ready: (machineId) =>
      registry.agent(machineId)
        ? addressProtocolMachines.has(machineId)
        : db.agentAddressContract(machineId),
    recoverRemoved: (machineId) => {
      if (recoveringRemoved.has(machineId) || !registry.agent(machineId)) {
        return;
      }
      const connection = registry.agent(machineId);
      const rows = db
        .sessionOwnership(machineId)
        .filter((row) => row.machineRemoved && row.harness === "opencode");
      if (rows.length === 0) {
        return;
      }
      recoveringRemoved.add(machineId);
      const claimed = db
        .sessionOwnership(machineId)
        .flatMap((row) => (row.sessionId ? [row.sessionId] : []));
      callAgent(
        machineId,
        "removedSessionCustody",
        [
          rows.map((row) => ({
            id: row.id,
            sessionId: row.sessionId,
            cwd: row.cwd,
          })),
          claimed,
        ],
        READ_TIMEOUT_MS
      )
        .then(
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each complete removed-row result must be checked against the same connection before drop or restore
          (answer) => {
            if (registry.agent(machineId) !== connection) {
              return;
            }
            if (typeof answer === "string" || !answer.ok) {
              return;
            }
            for (const result of answer.result as {
              id: string;
              present: boolean | null;
            }[]) {
              if (
                result.present !== null &&
                db.ownedInstance(result.id, machineId)?.machineRemoved
              ) {
                db.settleRemovedSession(result.id, result.present);
                if (result.present) {
                  lifecycle.preserveUnattached(result.id);
                }
                if (!result.present) {
                  forgetInstances([result.id]);
                }
              }
            }
            publishInstances(machineId);
          }
        )
        .catch((error: unknown) =>
          console.warn(
            `[hub] removed-machine custody remains unknown: ${String(error)}`
          )
        )
        .finally(() => recoveringRemoved.delete(machineId));
    },
    send: (machineId, payload) => {
      const agent = registry.agent(machineId);
      if (!(agent && addressProtocolMachines.has(machineId))) {
        return false;
      }
      agent.send({
        verb: "stop",
        machineId,
        instanceId: payload.instanceId,
        ...(payload.requestId ? { requestId: payload.requestId } : {}),
        payload,
      });
      const key =
        payload.requestId ?? `${payload.instanceId}:${payload.stopSequence}`;
      finishStopDispatch(key, "redelivered");
      const at = Date.now();
      console.info(
        `[hub] stop session=${payload.instanceId} request=${payload.requestId ?? "none"} machine=${machineId} outcome=dispatched elapsedMs=0`
      );
      stopDispatches.set(key, {
        instanceId: payload.instanceId,
        machineId,
        requestId: payload.requestId,
        at,
        timer: setTimeout(
          () => finishStopDispatch(key, "timed-out"),
          payload.discard ? 30_000 : READ_TIMEOUT_MS
        ),
      });
      return true;
    },
    restore: (row) => {
      const agent = registry.agent(row.machineId);
      if (agent) {
        restore(agent, row, true);
      }
    },
    changed: (machineId, removed) => {
      if (removed) {
        forgetInstances([removed]);
      }
      publishInstances(machineId);
    },
    deleteTranscript: async (row) => {
      if (!row.sessionId) {
        return true;
      }
      const info = await callAgent(
        row.machineId,
        CONTROL_GET_SESSION_INFO,
        [row.sessionId, row.cwd],
        READ_TIMEOUT_MS,
        row.harness as HarnessKind | undefined
      );
      if (typeof info === "string" || !info.ok) {
        throw new Error(
          typeof info === "string"
            ? info
            : (info.error ?? "Transcript lookup failed.")
        );
      }
      if (!info.result) {
        return true;
      }
      const result = await callAgent(
        row.machineId,
        "deleteSession",
        [row.sessionId, row.cwd],
        READ_TIMEOUT_MS,
        row.harness as HarnessKind | undefined
      );
      if (typeof result !== "string" && result.ok) {
        return true;
      }
      const after = await callAgent(
        row.machineId,
        CONTROL_GET_SESSION_INFO,
        [row.sessionId, row.cwd],
        READ_TIMEOUT_MS,
        row.harness as HarnessKind | undefined
      );
      if (typeof after !== "string" && after.ok && !after.result) {
        return true;
      }
      throw new Error(
        typeof result === "string"
          ? result
          : (result.error ?? "Transcript deletion failed.")
      );
    },
    refresh: (machineId) => {
      if (
        refreshingCustody.has(machineId) ||
        !registry.agent(machineId) ||
        !addressProtocolMachines.has(machineId)
      ) {
        return;
      }
      refreshingCustody.add(machineId);
      callAgent(machineId, "sessionCustody", [], READ_TIMEOUT_MS)
        .then((answer) => {
          if (typeof answer !== "string" && answer.ok && answer.result) {
            const snapshot = answer.result as {
              custody: SessionCustody;
              attached: string[];
            };
            lifecycle.reconcile(machineId, snapshot);
          }
        })
        .finally(() => refreshingCustody.delete(machineId));
    },
  });
  const endSession = (
    instanceId: string,
    intent: SessionEndIntent,
    requestId?: string
  ): void => {
    const row = db.ownedInstance(instanceId);
    lifecycle.endSession(instanceId, intent, requestId);
    if (row) {
      workItems.cancelled(row);
      forgetPending(instanceId, UNREAD.stopped);
      closePreview(instanceId).catch(console.error);
    }
  };
  const waitForEnd = (instanceId: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + SPAWN_START_TIMEOUT_MS;
      const observe = () => {
        const row = db.ownedInstance(instanceId);
        if (!row || row.endConfirmedAt) {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(
            new Error(
              "The end decision is stored and still awaiting its machine."
            )
          );
        } else {
          setTimeout(observe, 100).unref();
        }
      };
      observe();
    });

  /** A stored Stop survives reconnects; its caller still gets a bounded receipt. */
  const stopFromDashboard = (dashboard: HubSocket, message: Envelope): void => {
    const { instanceId } = message;
    if (!instanceId) {
      toDashboard(
        dashboard,
        failure(message, "No session was named. Refresh, then retry.")
      );
      return;
    }
    const requestId =
      message.requestId ??
      peek(message.payload, "requestId") ??
      crypto.randomUUID();
    const discard = peekDiscard(message.payload);
    const at = Date.now();
    const reply = (frame: ControlResult, outcome = "failed"): void => {
      clearTimeout(timer);
      waiting.delete(requestId);
      lifecycle.answered(requestId, frame.ok);
      if (!frame.ok) {
        if (stopDispatches.has(requestId)) {
          finishStopDispatch(requestId, outcome);
        } else {
          console.info(
            `[hub] stop session=${instanceId} request=${requestId} machine=${message.machineId} outcome=${outcome} elapsedMs=${Date.now() - at}`
          );
        }
      }
      toDashboard(dashboard, {
        ...message,
        verb: "frames",
        requestId,
        payload: frame,
      });
    };
    const timer = setTimeout(
      () =>
        reply(
          {
            kind: "control_result",
            requestId,
            ok: false,
            error:
              "Stop got no answer in time. The machine may be offline. Check the machine, then retry.",
          },
          "timed-out"
        ),
      discard ? 30_000 : READ_TIMEOUT_MS
    );
    waiting.set(requestId, reply);
    try {
      endSession(instanceId, discard ? "discard" : "stop", requestId);
      if (db.ownedInstance(instanceId)?.endConfirmedAt) {
        reply({ kind: "control_result", requestId, ok: true });
      } else if (!registry.agent(message.machineId)) {
        reply(
          {
            kind: "control_result",
            requestId,
            ok: false,
            error:
              "Stop is recorded, but the machine is offline. Check the machine, then retry.",
          },
          "offline"
        );
      }
    } catch (error) {
      reply(
        {
          kind: "control_result",
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        "refused"
      );
    }
  };

  /**
   * A summariser the continuation is done with: stopped on its machine, and
   * recorded stopped here whether or not the machine still held it — one a
   * restarted agent had already lost would otherwise sit `sleeping` forever.
   */
  const retireSummariser = (machineId: string, instanceId: string): void => {
    lifecycle.oweEndSession(instanceId, "stop");
    forgetPending(instanceId, UNREAD.stopped);
    publishInstances(machineId);
  };

  /**
   * The summariser, start to stop: a fresh internal session `id` on the
   * chosen harness and model in the source's directory, asked `prompt`,
   * answered with what its transcript stores for that turn, then stopped
   * whatever happened. Its transcript is tagged as scratch, so the stored
   * catalogs leave it out too. A cancel rejects the wait and stops it from
   * outside ({@link cancelContinuation}); `cancelled` keeps a spawn that was
   * still in flight from being asked anything.
   */
  const summariserRun = async (
    source: ContinuationSource & { machineId: string },
    summarizer: { harness: HarnessKind; model: string },
    prompt: string,
    id: string,
    cancelled: () => boolean
  ): Promise<string> => {
    const answered = new Promise<void>((resolve, reject) => {
      turnWaiters.set(id, { machineId: source.machineId, resolve, reject });
    });
    // Never unhandled: a spawn that fails first leaves this to be abandoned.
    answered.catch(() => undefined);
    summarisers.add(id);
    try {
      await spawnFromHub(
        source.machineId,
        {
          instanceId: id,
          cwd: source.cwd,
          harness: summarizer.harness,
          model: summarizer.model,
          title: `Summary of ${source.title}`,
          scratch: {},
          spawnedBy: { instanceId: source.instanceId },
        },
        "summariser",
        // The hub's own worker, which nobody watches: it never parks on a
        // permission prompt, as workflow steps and supervisors never do.
        "bypassPermissions"
      );
      if (cancelled()) {
        throw new Error(CONTINUATION_CANCELLED);
      }
      sendFromHub(
        source.machineId,
        id,
        prompt,
        { id: source.instanceId, cwd: source.cwd },
        crypto.randomUUID()
      );
      await answered;
      const text = await storedAnswer(id, true);
      if (!text) {
        throw new Error(
          "the summariser's turn ended without a finished answer in its transcript"
        );
      }
      return text;
    } finally {
      turnWaiters.delete(id);
      retireSummariser(source.machineId, id);
    }
  };

  /**
   * The answer a summariser's stored transcript holds for its turn, once
   * that turn has ended ({@link finishedAnswer}; `ended` when its `result`
   * frame was seen); undefined before then, or when it never got as far as a
   * transcript.
   */
  const storedAnswer = async (
    id: string,
    ended: boolean
  ): Promise<string | undefined> => {
    const where = await locateSession(id);
    return where
      ? finishedAnswer(await readMessages(where, false), ended)
      : undefined;
  };

  /**
   * A model's context window as the fleet knows it: claude's from the turns
   * the hub has seen (its catalog has none), every other harness's from the
   * machine's own model catalog. Undefined is unknown — never a guess.
   */
  const contextWindowOf = async (
    machineId: string,
    harness: HarnessKind,
    model: string
  ): Promise<number | undefined> => {
    if (harness === "claude") {
      return db.claudeContextWindows()[model];
    }
    const answer = await callAgent(
      machineId,
      CONTROL_MODEL_CATALOG,
      [],
      READ_TIMEOUT_MS,
      harness
    );
    if (answer === "offline") {
      throw new Error(`machine ${machineId} is not connected`);
    }
    if (answer === "timeout") {
      throw new Error(
        `machine ${machineId} did not list its ${harness} models in time`
      );
    }
    if (!answer.ok) {
      throw new Error(answer.error ?? `${harness} could not list its models`);
    }
    return (answer.result as ModelInfo[]).find((row) => row.value === model)
      ?.contextWindow;
  };

  /** How many tokens a running session holds right now, as its harness reads it. */
  const liveContextTokensOf = async (row: InstanceRow): Promise<number> => {
    const requestId = crypto.randomUUID();
    const answer = await awaitReply(
      row.machineId,
      requestId,
      READ_TIMEOUT_MS,
      () =>
        registry.agent(row.machineId)?.send({
          verb: "control",
          machineId: row.machineId,
          instanceId: row.id,
          requestId,
          payload: {
            instanceId: row.id,
            requestId,
            method: CONTROL_CONTEXT_USAGE,
            args: [],
          },
        } satisfies Envelope<ControlPayload>)
    );
    if (answer === "timeout") {
      throw new Error(`session ${row.id} did not report its context in time`);
    }
    if (!answer.ok) {
      throw new Error(answer.error ?? "the session could not read its context");
    }
    return (answer.result as { totalTokens: number }).totalTokens;
  };

  /** When the session started, as its own harness records it. */
  const sessionStartOf = async (where: SessionLocation): Promise<string> => {
    const answer = await callAgent(
      where.machineId,
      CONTROL_GET_SESSION_INFO,
      [where.sessionId, where.cwd || undefined],
      READ_TIMEOUT_MS,
      where.harness
    );
    if (answer === "offline" || answer === "timeout" || !answer.ok) {
      throw new Error(
        `machine ${where.machineId} could not say when session ${where.sessionId} started: ${
          answer === "offline" || answer === "timeout"
            ? answer
            : (answer.error ?? "no answer")
        }`
      );
    }
    const created = (answer.result as NeutralSessionInfo | null)?.createdAt;
    if (!created) {
      throw new Error(
        `${where.harness} does not report when session ${where.sessionId} started`
      );
    }
    return new Date(created).toISOString();
  };

  /** What git says changed in the session's directory since it started. */
  const gitChangesOf = async (
    where: SessionLocation,
    since: string
  ): Promise<GitChanges> => {
    const answer = await callAgent(
      where.machineId,
      CONTROL_GIT_CHANGES,
      [where.cwd, since],
      READ_TIMEOUT_MS
    );
    if (answer === "offline" || answer === "timeout" || !answer.ok) {
      throw new Error(
        `machine ${where.machineId} could not read git in ${where.cwd}: ${
          answer === "offline" || answer === "timeout"
            ? answer
            : (answer.error ?? "no answer")
        }`
      );
    }
    return answer.result as GitChanges;
  };

  /** One read of a session's stored messages through its own machine. */
  const readMessages = async (
    where: SessionLocation,
    whole: boolean
  ): Promise<SessionMessage[]> => {
    const answer = await callAgent(
      where.machineId,
      CONTROL_GET_SESSION_MESSAGES,
      [
        where.sessionId,
        { dir: where.cwd || undefined, ...(whole ? { whole } : {}) },
      ],
      READ_TIMEOUT_MS,
      where.harness
    );
    if (answer === "offline") {
      throw new MachineAway(where.machineId);
    }
    if (answer === "timeout") {
      throw new Error(`machine ${where.machineId} did not answer in time`);
    }
    if (!answer.ok) {
      throw answer.error === MACHINE_DISCONNECTED
        ? new MachineAway(where.machineId)
        : new Error(answer.error ?? "the transcript could not be read");
    }
    return (
      Array.isArray(answer.result) ? answer.result : []
    ) as SessionMessage[];
  };

  /**
   * A continuation's inputs, read and sized: the source's live context (last
   * compaction summary on), the artifact index over its whole transcript, and
   * the token counts the pickers and the run are both held to. The source is
   * only read.
   */
  const prepareContinuation = async (
    sourceId: string,
    note?: string
  ): Promise<PreparedContinuation> => {
    const [row] = db.getInstancesByIds([sourceId]);
    const where = await locateSession(sourceId);
    if (!where) {
      throw new Error(
        row
          ? `session ${sourceId} has no transcript yet`
          : `no session ${sourceId}`
      );
    }
    const since = await sessionStartOf(where);
    const [live, whole, git] = await Promise.all([
      readMessages(where, false),
      readMessages(where, true),
      gitChangesOf(where, since),
    ]);
    const scope = liveScope(live);
    // Named by what it was first asked in words — the whole transcript's first
    // prompt, not the compaction summary its live context starts with, nor a
    // bare slash command (`/clear`) that names nothing.
    const first = whole
      .map(userTurnText)
      .find(
        (text) => text && !deriveTitleFromFirstMessage(text).startsWith("/")
      );
    const source: ContinuationSource & { machineId: string } = {
      instanceId: sourceId,
      machineId: where.machineId,
      cwd: where.cwd,
      harness: where.harness,
      model: row?.model ?? transcriptModel(live) ?? "model not recorded",
      title:
        row?.title ||
        row?.derivedTitle ||
        (first ? deriveTitleFromFirstMessage(first) : "") ||
        leaf(where.cwd),
    };
    const extracted = extractTranscript(scope, whole);
    extracted.artifacts = `${extracted.artifacts}\n\n${gitSection(git, since)}`;
    const prompt = extracted.middle.length
      ? summariserPrompt(extracted.middle, note)
      : undefined;
    const running =
      row?.status === "running" && registry.agent(row.machineId) !== undefined;
    return {
      source,
      extracted,
      prompt,
      liveContextTokens:
        row && running
          ? await liveContextTokensOf(row)
          : estimateTokens(scopeChars(scope)),
      summariseInputTokens: prompt ? estimateTokens(prompt.length) : 0,
      openingTokens:
        estimateTokens(openingMessage(source, "", extracted, note).length) +
        SUMMARY_CAP_TOKENS,
      compacted: scope[0]?.compactSummary === true,
      entries: { live: live.length, whole: whole.length, scope: scope.length },
    };
  };

  /**
   * Whether the chosen models fit, by the same rule the dashboard's pickers
   * show: a refusal naming the model and why, or nothing.
   */
  const continuationRefusal = async (
    prepared: PreparedContinuation,
    request: ContinueRequest
  ): Promise<string | undefined> => {
    if (prepared.prompt) {
      const { harness, model } = request.summarizer;
      const refusal = contextFitRefusal(
        await contextWindowOf(prepared.source.machineId, harness, model),
        prepared.summariseInputTokens + SUMMARISER_OUTPUT_RESERVE_TOKENS
      );
      if (refusal) {
        return `Summarise with ${model}: ${refusal}`;
      }
    }
    const { harness, model, machineId } = request.target;
    const refusal = contextFitRefusal(
      await contextWindowOf(
        machineId ?? prepared.source.machineId,
        harness,
        model
      ),
      prepared.openingTokens + TARGET_HEADROOM_TOKENS
    );
    return refusal ? `Continue on ${model}: ${refusal}` : undefined;
  };

  /** The stages nothing more happens after. */
  const SETTLED = new Set<ContinuationJob["stage"]>([
    "started",
    "failed",
    "cancelled",
  ]);

  /** A job as every dashboard follows it. */
  const continuationJob = (row: ContinuationRow): ContinuationJob => ({
    id: row.id,
    sourceInstanceId: row.sourceInstanceId,
    targetInstanceId: row.targetInstanceId,
    ...(row.summariserInstanceId
      ? { summariserInstanceId: row.summariserInstanceId }
      : {}),
    stage: row.stage,
    ...(row.error ? { error: row.error } : {}),
  });

  /** The job table, from its one record: what dashboards are handed. */
  const continuationTable = (): ContinuationJob[] =>
    db.continuationRows().map(continuationJob);

  /** Where a job's new session starts: the machine the caller named, or the source's. */
  const targetMachineOf = (row: ContinuationRow): string =>
    row.request.target.machineId ?? row.prepared.source.machineId;

  /** The machine a job needs for its next step. */
  const machineFor = (row: ContinuationRow): string =>
    row.stage === "summarising"
      ? row.prepared.source.machineId
      : targetMachineOf(row);

  /** Who waits on a job's end — the `continue_session` tool — by job id. */
  const continuationWaiters = new Map<string, Set<() => void>>();

  /** Deletes a settled job once it has been kept {@link CONTINUATION_KEPT_MS}. */
  const forgetContinuationLater = (row: ContinuationRow): void => {
    setTimeout(
      () => {
        db.deleteContinuation(row.id);
        publishInstances(row.prepared.source.machineId);
      },
      Math.max(0, row.updatedAt.getTime() + CONTINUATION_KEPT_MS - Date.now())
    );
  };

  /**
   * Moves a job in its one record and tells every dashboard. A job that
   * settles wakes whoever waits on it, and is deleted a while later.
   */
  const moveContinuation = (
    id: string,
    patch: Parameters<typeof db.updateContinuation>[1]
  ): ContinuationRow | undefined => {
    const row = db.updateContinuation(id, patch);
    if (!row) {
      return undefined;
    }
    publishInstances(row.prepared.source.machineId);
    if (SETTLED.has(row.stage)) {
      for (const wake of continuationWaiters.get(id) ?? []) {
        wake();
      }
      continuationWaiters.delete(id);
      forgetContinuationLater(row);
    }
    return row;
  };

  /** Whether a Cancel has ended the job while a step of it was in flight. */
  const cancelledContinuation = (id: string): boolean =>
    db.continuationRow(id)?.stage === "cancelled";

  /** The opening a job's new session is handed: the same words however often it resumes. */
  const openingOf = (row: ContinuationRow): string =>
    openingMessage(
      row.prepared.source,
      row.summary ?? undefined,
      row.prepared.extracted,
      row.request.note
    );

  /**
   * Continue in new session, as a job the hub owns and records: summarise the
   * source's live context once with the summariser the caller chose (skipped
   * when there is nothing before the tail), then start the target session
   * seeded with the summary, the artifact index and the tail. Returns at once;
   * the job is carried to a started target whatever happens to whoever asked
   * or to this hub, and only its Cancel — while it is still summarising —
   * stops it. The source is only read.
   */
  const startContinuation = (
    prepared: PreparedContinuation,
    request: ContinueRequest
  ): ContinuationRow => {
    const row = db.insertContinuation({
      id: crypto.randomUUID(),
      sourceInstanceId: prepared.source.instanceId,
      request,
      prepared,
      summariserInstanceId: prepared.prompt ? crypto.randomUUID() : null,
      targetInstanceId: crypto.randomUUID(),
      openingUuid: crypto.randomUUID(),
      summary: null,
      stage: prepared.prompt ? "summarising" : "starting",
      error: null,
    });
    publishInstances(prepared.source.machineId);
    // biome-ignore lint/complexity/noVoid: the job runs on its own; its record is what anyone follows
    void advanceContinuation(row.id);
    return row;
  };

  /** The jobs this process is moving right now: each advances once at a time. */
  const advancing = new Set<string>();

  /**
   * Moves a job as far as it can go — the one path every job takes, whether
   * it was just asked for or the hub restarted under it. Where it stands is
   * read from its record and from the machines, never from memory:
   * summarising takes the summary (see {@link continuationSummary}) and
   * keeps it on the record; starting starts the target and hands it the
   * opening, once. A job whose machine is away waits where it is, and the
   * machine's next register moves it on; anything else that goes wrong fails
   * it, in the failure's own words.
   */
  const advanceContinuation = async (id: string): Promise<void> => {
    if (advancing.has(id)) {
      return;
    }
    advancing.add(id);
    let away = false;
    try {
      await continuationSteps(id);
    } catch (error) {
      away = continuationStepFailed(id, error);
    } finally {
      advancing.delete(id);
      // A machine that went away and is back already registered while this
      // was unwinding; its register found the job busy, so it goes on here.
      const row = away ? db.continuationRow(id) : undefined;
      if (row && registry.agent(machineFor(row))) {
        // biome-ignore lint/complexity/noVoid: see advanceContinuation
        void advanceContinuation(id);
      }
    }
  };

  /** A job's steps from where its record stands, each only while its machine is here. */
  const continuationSteps = async (id: string): Promise<void> => {
    let row = db.continuationRow(id);
    if (row?.stage === "summarising") {
      if (!registry.agent(machineFor(row))) {
        return;
      }
      const summary = await continuationSummary(row);
      // A Cancel that landed while the summariser answered stands.
      row = cancelledContinuation(id)
        ? undefined
        : moveContinuation(id, { stage: "starting", summary });
    }
    if (row?.stage === "starting") {
      if (!registry.agent(machineFor(row))) {
        return;
      }
      await startTarget(row);
      moveContinuation(id, { stage: "started" });
    }
  };

  /**
   * A step that threw: nothing, when the job has settled meanwhile (a
   * Cancel); a wait, when its machine went away; otherwise the job fails in
   * the error's own words. True when it waits for its machine.
   */
  const continuationStepFailed = (id: string, error: unknown): boolean => {
    const row = db.continuationRow(id);
    if (!row || SETTLED.has(row.stage)) {
      return false;
    }
    if (error instanceof MachineAway || !registry.agent(machineFor(row))) {
      return true;
    }
    moveContinuation(id, {
      stage: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  };

  /**
   * A summarising job's summary. A summariser this job already started —
   * before a restart, or before its machine went away — is read first: an
   * answer its transcript holds for a turn that ended is taken as it is.
   * Otherwise that one is stopped and a fresh one, recorded on the job, is
   * asked the same prompt.
   */
  const continuationSummary = async (row: ContinuationRow): Promise<string> => {
    const { source, prompt } = row.prepared;
    if (!(prompt && row.summariserInstanceId)) {
      throw new Error("a summarising continuation has no summariser prompt");
    }
    const cancelled = () => cancelledContinuation(row.id);
    const current = row.summariserInstanceId;
    if (db.getInstancesByIds([current]).length === 0) {
      return summariserRun(
        source,
        row.request.summarizer,
        prompt,
        current,
        cancelled
      );
    }
    const answered = await storedAnswer(current, false);
    retireSummariser(source.machineId, current);
    if (answered) {
      return answered;
    }
    if (cancelled()) {
      throw new Error(CONTINUATION_CANCELLED);
    }
    const replacement = crypto.randomUUID();
    moveContinuation(row.id, { summariserInstanceId: replacement });
    return summariserRun(
      source,
      row.request.summarizer,
      prompt,
      replacement,
      cancelled
    );
  };

  /**
   * Starts a job's new session under its minted id and hands it the opening
   * under the job's send uuid — once: a send record under that uuid is the
   * opening having gone, whatever restarted since. A target already running
   * (started before a restart, not yet handed anything) is not started again.
   */
  const startTarget = async (row: ContinuationRow): Promise<void> => {
    const sent = db.sendRecord(row.openingUuid);
    if (sent) {
      if (sent.state === "failed") {
        throw new Error(
          sent.reason ?? "the opening could not be sent to the new session"
        );
      }
      return;
    }
    const machine = targetMachineOf(row);
    const { request, prepared } = row;
    const [target] = db.getInstancesByIds([row.targetInstanceId]);
    if (target?.status !== "running") {
      await spawnFromHub(
        machine,
        targetSpawn(request, prepared.source, row.targetInstanceId),
        request.target.scratch ? "scratch" : "mainline",
        request.target.fallbackPermissionMode
      );
    }
    sendFromHub(
      machine,
      row.targetInstanceId,
      openingOf(row),
      { id: prepared.source.instanceId, cwd: prepared.source.cwd },
      row.openingUuid
    );
  };

  /**
   * Cancel: only while summarising. The job ends `cancelled` on its record
   * first, so the step in flight sees it; then the summariser's wait ends and
   * it is stopped. Nothing starts after that.
   */
  const cancelContinuation = (
    id: string
  ): { row: ContinuationRow } | { refused: 404 | 409; why: string } => {
    const row = db.continuationRow(id);
    if (!row) {
      return { refused: 404, why: "That continuation is not running." };
    }
    if (row.stage !== "summarising") {
      return {
        refused: 409,
        why:
          row.stage === "starting"
            ? "The new session is already starting."
            : `That continuation already ended (${row.stage}).`,
      };
    }
    const cancelled = moveContinuation(id, { stage: "cancelled" }) ?? row;
    if (row.summariserInstanceId) {
      turnWaiters
        .get(row.summariserInstanceId)
        ?.reject(new Error(CONTINUATION_CANCELLED));
      retireSummariser(row.prepared.source.machineId, row.summariserInstanceId);
    }
    return { row: cancelled };
  };

  /** A job once it has settled; undefined once it is gone. */
  const settledContinuation = async (
    id: string
  ): Promise<ContinuationRow | undefined> => {
    let row = db.continuationRow(id);
    while (row && !SETTLED.has(row.stage)) {
      // biome-ignore lint/performance/noAwaitInLoops: waits for this job's next settle, then reads its record again
      await new Promise<void>((wake) => {
        const waiters = continuationWaiters.get(id) ?? new Set();
        waiters.add(wake);
        continuationWaiters.set(id, waiters);
      });
      row = db.continuationRow(id);
    }
    return row;
  };

  // Jobs that settled before this hub started are kept out their time, then go.
  for (const row of db.continuationRows()) {
    if (SETTLED.has(row.stage)) {
      forgetContinuationLater(row);
    }
  }

  /** The continuation's new session, with the options the caller's form chose. */
  const targetSpawn = (
    { target }: ContinueRequest,
    source: ContinuationSource,
    instanceId: string
  ): SpawnPayload => ({
    instanceId,
    cwd: target.cwd ?? source.cwd,
    harness: target.harness,
    model: target.model,
    ...(target.effort ? { effort: target.effort } : {}),
    ...(target.permissionMode ? { permissionMode: target.permissionMode } : {}),
    ...(target.scratch ? { scratch: target.scratch } : {}),
    ...(target.bootstrap ? { bootstrap: target.bootstrap } : {}),
    ...(target.projectId ? { projectId: target.projectId } : {}),
    title: `${source.title} (continued)`,
    spawnedBy: { instanceId: source.instanceId },
  });

  /** What a started continuation reports: its sessions, and what it carried. */
  const outcomeOf = (row: ContinuationRow): ContinueOutcome => {
    const { prepared } = row;
    const { extracted } = prepared;
    return {
      summariserInstanceId: row.summariserInstanceId,
      targetInstanceId: row.targetInstanceId,
      summary: row.summary,
      opening: openingOf(row),
      liveContextTokens: prepared.liveContextTokens,
      summariseInputTokens: prepared.summariseInputTokens,
      openingTokens: prepared.openingTokens,
      compacted: prepared.compacted,
      entries: prepared.entries,
      sizes: {
        artifacts: extracted.artifacts.length,
        middle: extracted.middle.join("\n\n").length,
        tail: extracted.tail.length,
      },
    };
  };

  /** Registers a socket's correlation before dispatch; Ledger commands own their ack route. */
  const forward = (
    envelope: Envelope,
    dashboard: HubSocket,
    remember = true
  ): boolean => {
    let outgoing = envelope;
    const agent = registry.agent(envelope.machineId);
    if (!agent) {
      toDashboard(
        dashboard,
        failure(envelope, `machine ${envelope.machineId} is not connected`)
      );
      return false;
    }
    if (envelope.verb === "stop" && envelope.instanceId) {
      const [row] = db.getInstancesByIds([envelope.instanceId]);
      if (row) {
        outgoing = {
          ...envelope,
          payload: {
            ...(envelope.payload as object),
            processGeneration: processGeneration(row),
          },
        };
      }
    }
    const requestId = envelope.requestId ?? peek(outgoing.payload, "requestId");
    if (requestId) {
      outgoing = { ...outgoing, requestId };
      if (remember) {
        registry.rememberRequester(requestId, dashboard);
      }
    }
    agent.send(outgoing);
    return true;
  };

  /**
   * Every row, to every dashboard, after any one of them moves — a session
   * opening, failing, settling or being discarded is fleet news, and a rail
   * that only learns it by re-fetching is a rail that lies until you reload.
   * The whole table because it is small and a snapshot cannot drift.
   */
  /**
   * Starts a settled session again on the daemon that just registered.
   *
   * Deliberately not a revive-on-demand: a session the user left running was
   * left running on purpose, and a restart they did not ask for should not be
   * something they have to repair one row at a time. Bounded at the call site
   * (see {@link RESTORE_HORIZON_MS} / {@link RESTORE_MAX}) — this function does
   * one session and asks no questions about how many came before it.
   *
   * The row it writes is `starting`, never `running`: this sends a spawn and
   * returns, and a spawn in flight is not a process. The daemon's next word —
   * the session's `init` frame, or the heartbeat listing the id — is what
   * promotes it. That single distinction is most of the difference between a
   * board that reports 178 live sessions and one that reports 42.
   */
  const restore = (
    agent: HubSocket,
    row: InstanceRow,
    reattachOnly: SpawnPayload["reattachOnly"] = false
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: builds the restore payload from the stored row in one place
  ): void => {
    if (
      !addressProtocolMachines.has(row.machineId) ||
      db.ownedInstance(row.id, row.machineId)?.machineRemoved ||
      db.ownedInstance(row.id, row.machineId)?.endIntent ||
      (!reattachOnly && row.lastError === CLAUDE_CONVERSATION_GONE)
    ) {
      return;
    }
    const asked: SpawnPayload = {
      instanceId: row.id,
      cwd: row.cwd,
      ...(row.workflowStepId
        ? {
            workflowRunId: row.workflowRunId ?? undefined,
            workflowStepId: row.workflowStepId,
            ...workflowRuntime.specFor(row.workflowStepId),
          }
        : {}),
      ...(reattachOnly ? { reattachOnly } : {}),
      ...(row.sessionId ? { resume: { sessionKey: row.sessionId } } : {}),
      ...(row.harness
        ? { harness: row.harness as SpawnPayload["harness"] }
        : {}),
      ...(row.model ? { model: row.model } : {}),
      ...(row.permissionMode
        ? {
            permissionMode:
              row.permissionMode as SpawnPayload["permissionMode"],
          }
        : {}),
      ...(isEffortLevel(row.effort) ? { effort: row.effort } : {}),
      ...(row.projectId ? { projectId: row.projectId } : {}),
      // A leaf stays a leaf across a restart: the daemon builds the toolset
      // from the payload, and a restore that dropped this would hand a leaf
      // delegate the `delegate` tool back.
      ...(row.canDelegate === false ? { canDelegate: false } : {}),
    };
    // Adopt the stored mode without revalidating a new launch; custody must not be skipped.
    if (reattachOnly) {
      lifecycle.restoring(row.id);
      agent.send({
        verb: "spawn",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          ...bounded(asked, row),
          ingested: streams.ingestedFor([row.id])[row.id],
        },
      });
      return;
    }
    const settled = settleMode(row.machineId, asked, row.permissionMode);
    if ("refusal" in settled) {
      // Custody also inspects failed OpenCode handles. A recorded refusal
      // stays failed until its settings change, rather than failing each boot.
      if (row.status === "error" && row.lastError === settled.refusal) {
        return;
      }
      db.failInstance(row.id, settled.refusal);
      forgetPending(row.id, settled.refusal);
      console.warn(`[hub] not restoring ${row.id}: ${settled.refusal}`);
      return;
    }
    const { payload } = settled;
    db.openInstance({
      id: row.id,
      addressProtocol: addressProtocolMachines.has(row.machineId),
      machineId: row.machineId,
      cwd: row.cwd,
      sessionId: row.sessionId ?? undefined,
      harness: row.harness ?? undefined,
      projectId: row.projectId ?? undefined,
      kind: row.kind === "scratch" ? "scratch" : "mainline",
      permissionMode: settled.permissionMode,
      model: row.model ?? undefined,
      canDelegate: row.canDelegate ?? undefined,
    });
    agent.send({
      verb: "spawn",
      machineId: row.machineId,
      instanceId: row.id,
      payload: bounded(payload, row),
    });
  };

  /**
   * Presence is the registry's; history is the database's.
   *
   * The `agents.status` column is a *log* of presence transitions, not a
   * statement of the present: it is written `'online'` at register and
   * `'offline'` only from the socket close handler. Nothing writes it when this
   * process was not the one holding the socket — a hub restart, a crash, a
   * daemon killed while the hub was down — so a row can sit at `'online'` for
   * days while no socket for that machine exists anywhere. That is precisely
   * the window in which the board showed three green machines and every send
   * came back `machine <id> is not connected`, because routing has always asked
   * the registry (`registry.agent(machineId)`) and only the *display* asked the
   * column. Two sources of truth for one fact, and the operator was shown the
   * wrong one.
   *
   * So the read is derived, not stored: `status` is answered from the live
   * socket registry at the moment of the read, and everything else on the row —
   * `lastSeenAt`, `build`, `harnesses`, `fleet`, `auth` — is passed through from
   * the database untouched. After this, "online" means exactly one thing, and it
   * is the same thing routing means: *the hub is holding a socket for it right
   * now*. A machine that is merely recently-seen reads `offline` and says so, and
   * a script polling `/api/agents` can discover an unreachable machine instead of
   * being told a comfortable lie.
   *
   * Applied at the only two places a machine's status is emitted to a reader:
   * the `/api/agents` route and {@link instancesFrame}. The other
   * `db.listAgents()` callers are fleet/config lookups that never read `status`,
   * and are deliberately left alone.
   */
  const withPresence = (rows: AgentRow[]): AgentRow[] =>
    rows.map((row) => {
      const custody = machineCustody.get(row.machineId);
      const visibleCustody =
        custody?.state === "available"
          ? {
              ...custody,
              instances: db
                .getInstancesByIds(custody.instances)
                .map((owner) => owner.id),
            }
          : custody;
      return {
        ...row,
        custody: visibleCustody,
        status: registry.agent(row.machineId) ? "online" : "offline",
        // Additive and live, like `status` above: present only for a machine that
        // has actually reported one on this connection.
        ...(binaryUpdateStates.get(row.machineId)
          ? { binaryUpdate: binaryUpdateStates.get(row.machineId) }
          : {}),
      };
    });

  /**
   * The same law, applied to sessions — the instance of it the codebase was
   * violating.
   *
   * `instances.status` is written on lifecycle events and read back by every
   * rail as if it were a statement about now. It is not: the hub cannot see a
   * process, only the daemon can, and when the hub is not holding that daemon's
   * socket there is no one to ask. Measured in exactly that state:
   * `/api/instances` reported 178 sessions `running` on a machine carrying 42
   * `claude` processes, all of them idling at ≤1.5% CPU and 36–44 hours old,
   * with two rows touched in the last hour and a half. Every one of those
   * `running` values was true when written and had been true of nothing since.
   *
   * So a row whose machine is absent from the socket registry is served
   * `unknown`, which is precisely what the hub knows about it: not that it
   * failed, not that it is fine — that there is currently no way to find out.
   * The stored column is left alone; it is history, and history is allowed to
   * say what last happened.
   *
   * The overlay covers the values that *claim* something about a live process —
   * `running`, `starting`, `sleeping` (which claims a session is there to be
   * woken, and waking it needs the machine). `stopped`, `error` and `discarded`
   * pass through untouched: they are records of something that already
   * finished, and an unreachable machine does not make a session that was
   * deliberately stopped any less stopped. Serving `unknown` for those would
   * trade a fact for a shrug.
   *
   * Applied at the two places a session's status reaches a reader: the
   * `/api/instances` route and {@link instancesFrame}.
   */
  const withSessionPresence = <
    Row extends { id: string; machineId: string; status: string },
  >(
    rows: Row[]
  ): Row[] =>
    rows.map((row) => {
      const held = heldSessions.get(row.id);
      if (
        held &&
        registry.agent(row.machineId) &&
        (row.status === "sleeping" || row.status === "error")
      ) {
        return {
          ...row,
          status: "sleeping",
          held: { since: held.since, reason: held.reason },
        };
      }
      return registry.agent(row.machineId) ||
        (row.status !== "running" &&
          row.status !== "starting" &&
          row.status !== "sleeping")
        ? row
        : { ...row, status: "unknown" };
    });

  /**
   * The rows every reader of the board is handed: the presence overlay, and
   * no `tooling`. A session's MCP servers and tools were 62% of the first
   * dashboard frame (1.29 MB of 2.1 MB over 1,095 rows) and only the `/`
   * palette of an open session reads them, so they travel per session
   * instead: `GET /api/instances/:id/tooling` when a view opens, and the live
   * `init` frame after that.
   */
  const withDelegates = <Row extends { id: string }>(rows: Row[]) => {
    const counts = db.runningDelegateCounts();
    return rows.map((row) => ({
      ...row,
      runningDelegates: counts.get(row.id) ?? 0,
    }));
  };
  const withKeepAlive = <
    Row extends
      | KeepAliveRow
      | ReturnType<DbShape["listBoardInstances"]>[number],
  >(
    rows: Row[]
  ) => {
    const readings = new Map(
      db
        .listUsageLimits()
        .map((reading) => [reading.machineId, reading.payload])
    );
    const now = Date.now();
    return rows.map((row) => {
      const {
        keepAliveEnabled: _enabled,
        keepAliveSent: _sent,
        keepAliveStopped: _stopped,
        cacheCold: _cold,
        lastPingUsage: _usage,
        keepAliveTurn: _turn,
        cacheTtl: _ttl,
        contextTokens: _contextTokens,
        contextReadAt: _contextReadAt,
        ...visible
      } = row;
      return {
        ...visible,
        keepAlive: keepAliveState(
          row as KeepAliveRow,
          readings.get(row.machineId),
          now
        ),
      };
    });
  };
  const boardRows = () =>
    withKeepAlive(
      withDelegates(
        withSessionPresence(
          db.listBoardInstances().filter((row) => row.kind !== "summariser")
        )
      )
    );

  /**
   * The whole board as one message: every row, every machine, and what each
   * session is holding. Built in one place so the snapshot a dashboard is
   * handed on connect and the snapshot it is pushed on every move are the same
   * object by construction.
   */
  /** Everything an `instances` frame carries besides the rows themselves. */
  const boardExtras = () => ({
    agents: withPresence(db.listAgents()),
    previews: [...previewTargets].map(([id, target]) =>
      previewFrame(id, "open", target.source, target.revision)
    ),
    handoffs: Object.fromEntries(handoffs),
    // Carried on every publish, so a dashboard follows a continuation it
    // started over the socket rather than over the request that started it.
    continuations: continuationTable(),
    // `hubBuild` lets a client tell a hub that is
    // behind from a machine that is. `protocol` is the wire this hub speaks:
    // a page built for an older one reloads itself on its first frame.
    hubBuild,
    protocol: WIRE_PROTOCOL,
  });

  const instancesFrame = (machineId: string): Envelope => ({
    verb: "frames",
    machineId,
    payload: {
      kind: "instances",
      instances: boardRows(),
      ...boardExtras(),
      // Seed now-state once per connection; updates have per-session frames.
      pulses: Object.fromEntries(pulses),
    },
  });

  /**
   * Each row as it was last published, serialised, by id. A publish sends
   * only the rows whose serialisation differs and the ids that are gone: the
   * board is ~900 rows and ~650KB, and every dashboard used to parse and
   * re-render all of it on each move of any one of them. A dashboard that
   * connects after a publish gets the whole board from {@link instancesFrame},
   * so the only rows this can leave stale are ones that changed without a
   * publish — which the full frame never caught either.
   */
  const publishedRows = new Map<string, string>(
    // Seeded from the board as the hub boots: every dashboard connects after
    // this and is handed a snapshot at least this fresh, so the first publish
    // sends what moved rather than all of it.
    boardRows().map((row) => [row.id, JSON.stringify(row)])
  );
  const publishedExtras = boardExtras();
  const publishedAgents = new Map(
    publishedExtras.agents.map((row) => [row.machineId, JSON.stringify(row)])
  );
  const publishedMetadata = new Map(
    (["previews", "handoffs", "continuations"] as const).map((key) => [
      key,
      JSON.stringify(publishedExtras[key]),
    ])
  );

  const pendingInstancePublishes = new Set<string>();
  let instancePublishScheduled = false;
  const publishInstances = (machineId: string): void => {
    // A session's model, project or harness can move under a live rule; every
    // move republishes, so this is the one place that has to drop the cache.
    ruleEngine.forgetFacts();
    pendingInstancePublishes.add(machineId);
    if (instancePublishScheduled) {
      return;
    }
    instancePublishScheduled = true;
    setImmediate(() => {
      instancePublishScheduled = false;
      const machines = [...pendingInstancePublishes];
      pendingInstancePublishes.clear();
      publishInstanceDelta(machines.length === 1 ? machines[0] : "");
    });
  };

  const publishInstanceDelta = (machineId: string): void => {
    const rows = boardRows();
    const upserts: typeof rows = [];
    const present = new Set<string>();
    for (const row of rows) {
      present.add(row.id);
      const serialised = JSON.stringify(row);
      if (publishedRows.get(row.id) !== serialised) {
        publishedRows.set(row.id, serialised);
        upserts.push(row);
      }
    }
    const removed: string[] = [];
    for (const id of publishedRows.keys()) {
      if (!present.has(id)) {
        publishedRows.delete(id);
        removed.push(id);
      }
    }
    const delta: Extract<FramePayload, { kind: "instances_delta" }> = {
      kind: "instances_delta",
      upserts,
      removed,
      ...boardMetadataDelta(),
    };
    if (
      upserts.length === 0 &&
      removed.length === 0 &&
      Object.keys(delta).length === 3
    ) {
      return;
    }
    registry.broadcastBoard({ verb: "frames", machineId, payload: delta }, () =>
      instancesFrame(machineId)
    );
  };

  /** No pulse snapshots on publishes: each session already has its own stream. */
  const boardMetadataDelta = (): Partial<
    Extract<FramePayload, { kind: "instances_delta" }>
  > => {
    const extras = boardExtras();
    const delta: ReturnType<typeof boardMetadataDelta> = {};
    const agents = extras.agents.filter((row) => {
      const serialised = JSON.stringify(row);
      if (publishedAgents.get(row.machineId) === serialised) {
        return false;
      }
      publishedAgents.set(row.machineId, serialised);
      return true;
    });
    const machineIds = new Set(extras.agents.map((row) => row.machineId));
    const removedAgents = [...publishedAgents.keys()].filter(
      (id) => !machineIds.has(id)
    );
    for (const id of removedAgents) {
      publishedAgents.delete(id);
    }
    if (agents.length > 0) {
      delta.agents = agents;
    }
    if (removedAgents.length > 0) {
      delta.removedAgents = removedAgents;
    }
    for (const key of ["previews", "handoffs", "continuations"] as const) {
      const serialised = JSON.stringify(extras[key]);
      if (publishedMetadata.get(key) !== serialised) {
        publishedMetadata.set(key, serialised);
        Object.assign(delta, { [key]: extras[key] });
      }
    }
    return delta;
  };

  /**
   * Sessions this hub started fresh and has not yet heard a word from. A title
   * derived from a live turn is only the session's *first* message while this
   * holds the id — a resumed session's next turn is somewhere in the middle of
   * a conversation, and naming the row after it would be a wrong name that then
   * outranks the transcript's own. Those get named from the transcript instead,
   * where the first message is unambiguous.
   */
  const awaitingFirstTurn = new Set<string>();

  /**
   * Names an unnamed row after what its session was first asked to do, using
   * core's cleaning so the string is identical to the one the dashboard derives
   * from the transcript. Write-once and never over a given title, so this can
   * be called from every path that might see the first message first.
   */
  const nameFromFirstTurn = (
    machineId: string,
    instanceId: string,
    raw: string
  ): string => {
    const derived = deriveTitleFromFirstMessage(raw);
    if (derived && db.noteDerivedTitle(instanceId, derived)) {
      publishInstances(machineId);
    }
    return derived;
  };

  /**
   * A live turn for a session the hub started: if it is the first thing said,
   * it is the session's name. Consumed either way — the second turn is not a
   * first message, and a turn with no text of its own never was.
   */
  /**
   * The words a stored transcript opens with: its oldest user turn that says
   * anything. A transcript starts with the reader's own ask, so this is what
   * the conversation is called — and it is the same entry the dashboard's
   * folding layer picks when it names a session client-side.
   */
  const firstTurnOf = (transcript: unknown[]): string | undefined => {
    for (const entry of transcript) {
      const text = userTurnText(entry);
      if (text) {
        return text;
      }
    }
    return undefined;
  };

  /**
   * Names the machine's stored conversations that nothing has ever named, off
   * the catalog the machine keeps anyway — a catalog entry carries the session's
   * first prompt, so this costs one control call and no transcript reads.
   *
   * Offered when a daemon registers, and free in the steady state: the query for
   * unnamed rows comes back empty and the machine is never asked. Only the same
   * `firstPrompt` the dashboard would name a stored session by is used — a
   * harness summary is a different string, and a row named with one would
   * disagree with the strip it is meant to agree with.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: matches the daemon's session list against unnamed rows and picks the naming source per harness in one place; splitting it would scatter the fallback order this depends on.
  const nameStoredSessions = async (machineId: string): Promise<void> => {
    const unnamed = db.unnamedSessions(machineId);
    if (unnamed.length === 0) {
      return;
    }

    const answer = await callAgent(
      machineId,
      CONTROL_LIST_SESSIONS,
      [{}],
      READ_TIMEOUT_MS
    );
    if (answer === "offline" || answer === "timeout" || !answer.ok) {
      return;
    }
    if (!Array.isArray(answer.result)) {
      return;
    }

    // Name from whatever the catalog carries, in the SAME precedence the
    // dashboard resolves a stored session by (`sessionTitle`): a given title
    // (customTitle / summary) first, then the first prompt. claude reports
    // `firstPrompt`; opencode and pi report a real `customTitle` and NO prompt,
    // so reading only `firstPrompt` left every opencode/pi row unnamed at rest.
    // The row's stored title wins in `resolveSessionTitle` either way, so naming
    // from the given title is not a mismatch with what the client would show.
    const names = new Map<string, string>();
    for (const info of answer.result as NeutralSessionInfo[]) {
      // biome-ignore lint/suspicious/noUnnecessaryConditions: `answer.result` is an untrusted control reply cast to this type, not a value TS actually proved shaped — a malformed entry can still be null at runtime.
      if (typeof info?.sessionId !== "string") {
        continue;
      }
      const source =
        (info.customTitle || info.summary)?.trim() || info.firstPrompt;
      const name =
        typeof source === "string" ? deriveTitleFromFirstMessage(source) : "";
      if (name) {
        names.set(info.sessionId, name);
      }
    }

    let named = false;
    for (const row of unnamed) {
      const name = row.sessionId && names.get(row.sessionId);
      if (!name) {
        continue;
      }
      if (db.noteDerivedTitle(row.id, name)) {
        named = true;
      }
    }
    if (named) {
      publishInstances(machineId);
    }
  };

  const nameFromLiveTurn = (
    machineId: string,
    instanceId: string,
    message: unknown
  ): void => {
    if (!awaitingFirstTurn.has(instanceId)) {
      return;
    }
    // Everything that is not a reader speaking — an init frame, a tool result
    // coming back on the same channel — leaves the session still unnamed and
    // still waiting: the first *words* are the name, whenever they arrive.
    const text = userTurnText(message);
    if (!text) {
      return;
    }
    awaitingFirstTurn.delete(instanceId);
    nameFromFirstTurn(machineId, instanceId, text);
  };

  /**
   * One line of the hub's record of a delegate's traffic, to every dashboard,
   * the moment it is written — the same reason the instance rows are pushed:
   * a reader watching either session should see the ask, the answer and the
   * report as they happen rather than on their next re-fetch.
   */
  const publishDelegateEvent = (
    machineId: string,
    event: DelegateEvent
  ): void => {
    registry.broadcast({
      verb: "frames",
      machineId,
      instanceId: event.instanceId,
      payload: {
        kind: "delegate_event",
        instanceId: event.instanceId,
        event,
      } satisfies FramePayload,
    });
  };

  /**
   * Files an answer to a delegate's ask, whichever way it arrived — the parent's
   * `answer_delegate`, the relay route, or a reader clicking it in the dashboard
   * once it escalated — and closes the ask it settles. An answer to anything
   * else is an ordinary session's own permission and nobody's record.
   */
  const recordDelegateAnswer = (
    machineId: string,
    instanceId: string,
    requestId: string,
    result: unknown
  ): void => {
    const asked = db.delegateAsk(requestId);
    const parentInstanceId =
      asked?.parentInstanceId ??
      db.listInstances().find((r) => r.id === instanceId)?.parentInstanceId;
    if (!parentInstanceId) {
      return;
    }

    const behavior = peek(result, "behavior") ?? "allow";
    const answers = peekAnswers(result);
    publishDelegateEvent(
      machineId,
      db.recordDelegateEvent({
        instanceId,
        parentInstanceId,
        kind: "answer",
        requestId,
        payload: { behavior, ...(answers ? { answers } : {}) },
      })
    );
    // An ask this hub never recorded — one parked before the table existed —
    // still gets its answer stored; there is simply nothing to close.
    db.settleDelegateAsk(
      requestId,
      behavior === "deny" ? "denied" : "answered"
    );
  };
  // Telegram's replies use the same recorded send path as every other device.
  telegram?.setSender((envelope) => deliverSend(envelope).state !== "failed");

  const awaitingInstall = (machineId: string, toolId: string): boolean => {
    for (const install of pendingInstalls.values()) {
      if (install.machineId === machineId && install.toolId === toolId) {
        return true;
      }
    }
    return false;
  };

  /**
   * Sends the machine an install for every tool the policy requires and its
   * last report says is missing (NEW.md §10). The one click: a machine that
   * joins the fleet, or a tool that becomes required, needs nobody to go
   * looking for what is out of date.
   *
   * A machine that has reported nothing is left alone — an empty map is a
   * daemon that predates the catalog, not a machine missing everything. So is
   * one whose cell says `failed` or `unsupported`: the daemon remembers its own
   * failures for the rest of its boot, so an install that will not work waits
   * for a click instead of going out on every reconnect.
   */
  const autoInstall = (machineId: string, agent: HubSocket): void => {
    const cells = db.agentTools(machineId);
    if (Object.keys(cells).length === 0) {
      return;
    }

    let sent = false;
    for (const policy of db.listToolPolicies()) {
      const cell = cells[policy.id];
      if (!policy.required || (cell && cell.state !== "missing")) {
        continue;
      }
      if (awaitingInstall(machineId, policy.id)) {
        continue;
      }

      const requestId = crypto.randomUUID();
      const payload: ControlPayload = {
        requestId,
        method: "installTool",
        args: [policy.id, policy.pinnedVersion ?? undefined],
      };
      pendingInstalls.set(requestId, { machineId, toolId: policy.id });
      agent.send({
        verb: "control",
        machineId,
        payload,
      } satisfies Envelope<ControlPayload>);
      db.setAgentToolCell(machineId, {
        id: policy.id,
        state: "installing",
        at: Date.now(),
      });
      sent = true;
    }
    if (sent) {
      publishInstances(machineId);
    }
  };

  /**
   * Sends the machine what the fleet's Claude Code is supposed to be able to
   * reach (NEW.md §11): every MCP server, marketplace and plugin, for the
   * machine to converge on and report back. Sent when a machine reports what
   * its harnesses can do (once per connection) and after any change, so a
   * machine that joins tomorrow needs nobody to remember it.
   *
   * A fleet nobody has configured is not sent at all — there is nothing to
   * converge on, and a sync that writes nothing is still a file read and a
   * report stored on every connection in the fleet. Unless the machine still has
   * something of ours: the last row being deleted is exactly when a machine most
   * needs telling, and its own last report is what says it has anything to lose.
   */
  const pushFleetConfig = (
    machineId: string,
    agent: HubSocket,
    config: FleetConfig
  ): void => {
    // Startup discovery finishes before any harness can see a remote fleet URL.
    // biome-ignore lint/complexity/noVoid: the control result arrives through pendingFleet
    void mcpReady.then(async () => {
      await fleetMcp.ready();
      const current = new Map(
        db.fleetConfig().mcp.map((row) => [row.name, row])
      );
      const outbound = fleetMcp.syncConfig(
        {
          ...config,
          mcp: config.mcp.flatMap((row) =>
            current.has(row.name) ? [current.get(row.name) as typeof row] : []
          ),
        },
        hubHttpUrl()
      );
      const requestId = crypto.randomUUID();
      const payload: ControlPayload = {
        requestId,
        method: FLEET_SYNC,
        args: [outbound],
      };
      pendingFleet.set(requestId, machineId);
      agent.send({
        verb: "control",
        machineId,
        payload,
      } satisfies Envelope<ControlPayload>);
    });
  };

  /**
   * A machine that just converged wrote new skill files and plugin installs
   * under sessions that are already running. The SDK picks both up without a
   * restart — `reloadSkills`/`reloadPlugins` on the session's Query — so every
   * live session on that machine is told when its reported content hashes move,
   * and a skill adopted from the rail is usable in the session that adopted
   * it seconds later (user, 2026-08-08). Fire-and-forget: a session racing
   * shutdown answers with an error nobody is waiting on.
   *
   * `reloadSkills`/`reloadPlugins` are Claude Code Query methods; a harness
   * with no such verb (opencode, pi) answers with an error that reads as a
   * session failure, so only a claude session — and a legacy row whose
   * `harness` predates the rework and is therefore claude — is told.
   *
   * A changed hook report adds `reinitialize` — the SDK `Query`
   * method that actually re-reads settings, hooks included, rather than only
   * the two narrower things the other verbs cover. It is heavier than a
   * reload, so it is sent only when this sync's report says the hook set on
   * this machine is not the report's own last one; every other sync leaves a
   * running session's hooks exactly as they were, which is correct, because
   * they have not changed.
   */
  const refreshSessions = (
    machineId: string,
    agent: HubSocket,
    methods: readonly string[]
  ): void => {
    if (methods.length === 0) {
      return;
    }
    for (const row of db.listInstances()) {
      if (row.machineId !== machineId) {
        continue;
      }
      if (row.status !== "running" && row.status !== "starting") {
        continue;
      }
      if (row.harness && row.harness !== "claude") {
        continue;
      }
      for (const method of methods) {
        const requestId = crypto.randomUUID();
        const payload: ControlPayload = {
          instanceId: row.id,
          requestId,
          method,
          args: [],
        };
        agent.send({
          verb: "control",
          machineId,
          instanceId: row.id,
          requestId,
          payload,
        } satisfies Envelope<ControlPayload>);
      }
    }
  };

  const sendFleetSync = (machineId: string, agent: HubSocket): void => {
    // Fleet sync converges each harness's own files. A daemon that predates
    // harness reporting is assumed to be claude (fleetable); only an explicit
    // report with no fleet-capable harness is a machine with nothing to converge.
    const reports = db
      .listAgents()
      .find((row) => row.machineId === machineId)?.harnesses;
    if (
      reports &&
      reports.length > 0 &&
      !reports.some((report) => report.capabilities.fleet)
    ) {
      return;
    }

    // Per machine: what this one already holds is sent as a hash and no bytes.
    const config = db.fleetConfig(machineId);
    const empty = !(
      config.mcp.length ||
      config.marketplaces.length ||
      config.plugins.length ||
      config.skills?.length ||
      config.memory
    );
    if (
      empty &&
      !holdsFleet(
        db.listAgents().find((row) => row.machineId === machineId)?.fleet
      )
    ) {
      return;
    }

    pushFleetConfig(machineId, agent, config);
  };

  /**
   * One machine's own user CLAUDE.md, whoever wrote it. A peek is this alone,
   * adopting is this and a store, and an overwrite is this so the copy it is
   * about to destroy is kept before it goes.
   */
  const readMachineMemory = async (machineId: string): Promise<MemoryRead> => {
    const answer = await callAgent(
      machineId,
      READ_MEMORY_FILE,
      [],
      READ_TIMEOUT_MS
    );
    if (answer === "offline") {
      return {
        ok: false,
        code: 404,
        said: `machine ${machineId} is not connected`,
      };
    }
    if (answer === "timeout") {
      return {
        ok: false,
        code: 504,
        said: `machine ${machineId} did not answer`,
      };
    }
    if (!answer.ok) {
      return {
        ok: false,
        code: 500,
        said: answer.error ?? "the machine could not read its memory",
      };
    }
    return { ok: true, copy: peekMemoryFile(answer.result) };
  };

  /**
   * One fleet hook's script as one machine has it on disk. A compare is this
   * alone; adopting is this and a store.
   */
  const readMachineHookScript = async (
    machineId: string,
    id: string
  ): Promise<
    | { ok: true; copy: MachineHookScript | null }
    | { ok: false; code: 404 | 500 | 504; said: string }
  > => {
    const answer = await callAgent(
      machineId,
      READ_HOOK_SCRIPT,
      [id],
      READ_TIMEOUT_MS
    );
    if (answer === "offline") {
      return {
        ok: false,
        code: 404,
        said: `machine ${machineId} is not connected`,
      };
    }
    if (answer === "timeout") {
      return {
        ok: false,
        code: 504,
        said: `machine ${machineId} did not answer`,
      };
    }
    if (!answer.ok) {
      return {
        ok: false,
        code: 500,
        said: answer.error ?? "the machine could not read the hook's script",
      };
    }
    return { ok: true, copy: answer.result as MachineHookScript | null };
  };

  /** The version about to be replaced, kept — a save is not a way to lose one. */
  const keepReplacedMemory = (content: string): void => {
    const current = db.getFleetMemory();
    if (current && current.content !== content) {
      db.recordFleetMemory({
        content: current.content,
        hash: current.hash,
        source: "fleet",
      });
    }
  };

  /** The same for one linked document, under its own path in the history. */
  const keepReplacedDoc = (path: string, content: string): void => {
    const current = db.getFleetMemoryDoc(path);
    if (current && current.content !== content) {
      db.recordFleetMemory({
        content: current.content,
        hash: current.hash,
        source: "fleet",
        path,
      });
    }
  };

  /** A document leaving the set, kept whole — nothing else has a copy of it. */
  const keepRemovedDoc = (doc: {
    path: string;
    content: string;
    hash: string;
  }): void => {
    db.recordFleetMemory({
      content: doc.content,
      hash: doc.hash,
      source: "fleet",
      path: doc.path,
    });
  };

  /**
   * The version of a hook that a save, an edit or a delete is about to
   * replace or destroy — kept before it goes, the same moment a memory
   * document's version is. `fleet` is the only source today: a hook is
   * never edited from a machine, only converged onto one.
   */
  const keepHookVersion = (hook: FleetHook): void => {
    db.recordFleetHook({
      hookId: hook.id,
      name: hook.name,
      enabled: hook.enabled,
      event: hook.event,
      matcher: hook.matcher,
      handler: hook.handler,
      script: hook.script,
      hash: hook.hash,
      scope: hook.scope,
      projectId: hook.projectId,
      source: "fleet",
    });
  };

  /**
   * Machines the subagents could not be written to, by machineId → why. Read
   * back in the fleet response, so a definition that is going nowhere says so
   * on the page rather than only in a log.
   */
  const unpushable = new Map<string, string>();

  /**
   * Where this machine's home directory is, taken off the directories its
   * sessions are open in — a session running in `/home/x/repo` has already said
   * what the home is.
   *
   * A heuristic, and knowingly so: until register carries `home` — see the
   * parked daemon batch — the instance rows are the only thing on the hub's
   * side that has ever named a real path on that machine.
   */
  const homeOf = (machineId: string): string | undefined => {
    for (const row of db.listInstances()) {
      if (row.machineId !== machineId) {
        continue;
      }
      const match = HOME_PREFIX.exec(row.cwd);
      if (match) {
        return match[1];
      }
    }
    return undefined;
  };

  /**
   * Writes one file on a machine over the `fs` verb. The daemon answers a write
   * with a `control_result` frame, exactly as it answers a control call, so the
   * same `waiting` map routes the reply and no dashboard is broadcast a write
   * it never asked for.
   */
  const callFs = (
    machineId: string,
    agent: HubSocket,
    op: Omit<FsPayload, "requestId">
  ): Promise<ControlResult | "timeout"> => {
    const requestId = crypto.randomUUID();
    const payload: FsPayload = { requestId, ...op };
    return awaitReply(machineId, requestId, READ_TIMEOUT_MS, () =>
      agent.send({
        verb: "fs",
        machineId,
        requestId,
        payload,
      } satisfies Envelope<FsPayload>)
    );
  };

  const writeMachineFile = (
    machineId: string,
    agent: HubSocket,
    path: string,
    content: string
  ): Promise<ControlResult | "timeout"> =>
    callFs(machineId, agent, { op: "write", path, content });

  /**
   * One image off a machine's disk, read the moment someone looks at it: the
   * transcript card and the Telegram bridge both point at the path an agent
   * named, and nothing is copied anywhere in between. A file that has since
   * moved answers `missing` — the picture is gone, which is all there is to say.
   */
  const readMachineImage = async (
    machineId: string,
    path: string
  ): Promise<
    | { bytes: Uint8Array<ArrayBuffer>; mediaType: string }
    | "offline"
    | "timeout"
    | "missing"
  > => {
    const agent = registry.agent(machineId);
    if (!agent) {
      return "offline";
    }
    const answer = await callFs(machineId, agent, { op: "image", path });
    if (answer === "timeout") {
      return "timeout";
    }
    if (!answer.ok) {
      return "missing";
    }
    const { base64, mediaType } = answer.result as FsImage;
    // Copied into a fresh ArrayBuffer-backed view: a Buffer's `ArrayBufferLike`
    // backing is not what `Response` and `Blob` accept as a body.
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    return { bytes, mediaType };
  };

  // Registered here, after the reader exists — same shape as the answer recorder.
  telegram?.setImageReader(readMachineImage);

  /**
   * Writes every fleet subagent into `<home>/.claude/agents/` on one machine
   * (NEW.md §11). Claude Code re-scans that directory within seconds, so a
   * definition saved here is delegatable out there without anything being
   * restarted.
   *
   * Every reconnect resends definitions without an extra read round-trip. The
   * daemon skips identical bytes locally before writing or invalidating cache.
   *
   * Phase B: `syncFleetConfig` gets the agents and the daemon owns convergence
   * — and with it removal, which a verb of list/read/write cannot do.
   */
  const pushAgents = async (machineId: string): Promise<void> => {
    const agent = registry.agent(machineId);
    const files = db.listFleetAgents();
    if (!agent || files.length === 0) {
      return;
    }

    const home = homeOf(machineId);
    if (!home) {
      unpushable.set(
        machineId,
        "no session on this machine has said where its home directory is"
      );
      return;
    }

    for (const file of files) {
      // biome-ignore lint/performance/noAwaitInLoops: each write is a control round-trip to the same machine over one socket; concurrent writes would race the daemon's own file handling.
      const answer = await writeMachineFile(
        machineId,
        agent,
        `${home}/.claude/agents/${file.name}.md`,
        file.content
      );
      if (answer === "timeout" || !answer.ok) {
        unpushable.set(
          machineId,
          answer === "timeout"
            ? "the machine did not answer the write"
            : (answer.error ?? "the machine refused the write")
        );
        return;
      }
    }
    unpushable.delete(machineId);
  };

  /** A definition changed: every machine that is online takes it now. */
  const fanOutAgents = (): void => {
    for (const machineId of registry.machineIds()) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — each machine's push runs independently and nothing here waits on any of them.
      void pushAgents(machineId);
    }
  };

  /** The fleet changed: every machine that is online converges now, not on its next reconnect. */
  /**
   * Fetches the plugins the fleet wants, once, here.
   *
   * A plugin used to be a name each machine resolved for itself by running
   * `claude plugin install`, which goes to the network — so an install depended
   * on that machine's credentials, on the upstream repository still being there
   * and still being public, and on the moment it happened to run. None of those
   * are properties of the fleet, and two machines could satisfy the same row
   * with different code and both report `applied`.
   *
   * So the bytes are resolved here and stored, and sync carries them. What
   * cannot be resolved keeps its sentence on the row and is left to the old
   * path, which is the only one that still needs a machine to reach github.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: groups ids by marketplace, resolves each group, and stores every outcome (resolved or errored) in one place; splitting it would scatter the per-marketplace fallback this depends on.
  const resolvePlugins = async (ids: readonly string[]): Promise<void> => {
    if (ids.length === 0) {
      return;
    }
    const sources = new Map(
      db.fleetConfig().marketplaces.map(({ name, source }) => [name, source])
    );

    const byMarketplace = new Map<string, string[]>();
    for (const id of ids) {
      const marketplace = id.split("@")[1] ?? "";
      byMarketplace.set(marketplace, [
        ...(byMarketplace.get(marketplace) ?? []),
        id,
      ]);
    }

    for (const [marketplace, wanted] of byMarketplace) {
      const source = sources.get(marketplace);
      if (!source) {
        for (const id of wanted) {
          db.putPluginPayload({
            id,
            error: `no marketplace called ${marketplace} in this fleet`,
          });
        }
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one marketplace's plugins are resolved at a time, keeping each marketplace's fetch and its writes to `db.putPluginPayload` grouped together.
      const resolved = await resolveMarketplacePlugins(
        marketplace,
        source,
        wanted.map((id) => id.split("@")[0] ?? id)
      );
      for (const plugin of resolved) {
        const id = `${plugin.name}@${marketplace}`;
        if ("error" in plugin) {
          db.putPluginPayload({ id, error: plugin.error });
        } else {
          db.putPluginPayload({
            id,
            hash: plugin.hash,
            bytes: plugin.bytes,
            files: plugin.files,
          });
        }
      }
    }
  };

  // Plugins added before this hub could fetch them, and any whose fetch has not
  // been attempted yet. Done once at boot rather than on every sync: a resolved
  // plugin is bytes the fleet already agrees on, and re-fetching it would be a
  // download per restart for a file nobody asked to change.
  // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — boot must not stall on network fetches for plugins that were already unresolved.
  void resolvePlugins(db.unresolvedPlugins());

  const fanOutFleet = (): void => {
    for (const machineId of registry.machineIds()) {
      const agent = registry.agent(machineId);
      if (!agent) {
        continue;
      }
      sendFleetSync(machineId, agent);
      publishInstances(machineId);
    }
  };

  const announceMcp = (): void => {
    registry.broadcast({
      verb: "frames",
      machineId: "",
      payload: { kind: "fleet_mcp", servers: db.fleetConfig().mcp },
    } satisfies Envelope<FramePayload>);
    fanOutFleet();
  };
  const fleetMcp = new FleetMcp(db, announceMcp);
  const mcpReady = Promise.all(
    db.fleetConfig().mcp.map((row) => fleetMcp.probe(row.name))
  );

  /**
   * A dashboard's `send` command, taken: the one send path, and a log line.
   * Its record — pending, or failed with why — is the answer every tab hears.
   */
  const relaySend = (message: Envelope<SendPayload>): void => {
    // Provenance (NEW.md, cross-session delivery incident): which tab it
    // believed it was sending from. It is the one thing that makes "a send
    // landed on the wrong session" provable after the fact instead of merely
    // suspected.
    const { provenance } = message.payload as {
      provenance?: { clientId?: string };
    };
    const record = deliverSend(message);
    console.log(
      `[hub] send -> ${record.instanceId} (${record.state})${
        provenance ? ` client ${provenance.clientId ?? "?"}` : ""
      }`
    );
  };

  /**
   * A dashboard's `control`, whole: relay it, route its reply back, settle
   * whatever the call answers (a parked permission, a delegate's ask, a tool
   * cell, a fleet sync). Extracted for the same reason as {@link relaySend}.
   *
   * `remember` is false for a command envelope: the reply to a command is that
   * command's `applied` ack, and routing it as a legacy `control_result` too
   * would report the same outcome twice in two dialects.
   */
  /**
   * One answer transaction for dashboards, Telegram and parent tools. The
   * machine's receipt and the ledger's settlement must both precede success.
   */
  const answerPendingPermission = async (
    instanceId: string,
    requestId: string,
    result: PermissionResult
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction validates ownership, workflow answers, delivery receipts and concurrent process death before reporting success.
  ): Promise<void> => {
    const parked = pending.get(requestId);
    if (!parked || parked.instanceId !== instanceId) {
      throw new Error("That request is no longer pending.");
    }
    if (answeringPermissions.has(requestId)) {
      throw new Error("That request is already being answered.");
    }
    const receipt: { outcome?: "answered" | "cancelled" } = {};
    answeringPermissions.set(requestId, receipt);
    try {
      if (answerWorkflow(pending, requestId, result)) {
        if (receipt.outcome !== "answered") {
          throw new Error("That request is no longer pending.");
        }
        return;
      }
      if (!ownsPermission(parked)) {
        pending.resolve(requestId, "cancelled");
        throw new Error("That request is no longer pending.");
      }
      const delivered = await callAgent(
        parked.machineId,
        RESOLVE_PERMISSION,
        [requestId, result],
        READ_TIMEOUT_MS,
        undefined,
        instanceId
      );
      if (delivered === "offline" || delivered === "timeout") {
        throw new Error(`Permission answer ${delivered}.`);
      }
      if (!delivered.ok) {
        throw new Error(delivered.error ?? "The session refused the answer.");
      }
      if (receipt.outcome === "cancelled" || !ownsPermission(parked)) {
        pending.resolve(requestId, "cancelled");
        throw new Error("That request is no longer pending.");
      }
      pending.resolve(requestId);
      if (receipt.outcome !== "answered") {
        throw new Error("That request is no longer pending.");
      }
      recordDelegateAnswer(parked.machineId, instanceId, requestId, result);
    } finally {
      answeringPermissions.delete(requestId);
    }
  };
  onPermissionAnswer(pending, answerPendingPermission);

  const relayPermissionAnswer = (
    message: Envelope<ControlPayload>,
    dashboard: HubSocket,
    legacy: boolean
  ): boolean => {
    const answer = peekAnswer(message.payload);
    if (message.payload.method !== RESOLVE_PERMISSION) {
      return false;
    }
    // The correlation id belongs to the control; args[0] belongs to the ask.
    // A receipt is sent only after delivery AND the pending ledger settlement.
    answerPermission(
      pending,
      message.instanceId ?? message.payload.instanceId ?? "",
      answer?.requestId ?? "",
      answer?.result as PermissionResult
    ).then(
      () =>
        reply({ kind: "control_result", requestId: correlationId, ok: true }),
      (error: unknown) =>
        reply({
          kind: "control_result",
          requestId: correlationId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
    );
    const correlationId = message.requestId ?? message.payload.requestId;
    const reply = (frame: ControlResult): void => {
      if (legacy) {
        toDashboard(dashboard, { ...message, verb: "frames", payload: frame });
      } else {
        streams.settleCommand(correlationId, frame);
      }
    };
    return true;
  };

  const relayControl = (
    message: Envelope<ControlPayload>,
    dashboard: HubSocket,
    remember = true
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transcript deletion shares the control receipt path but records intent before machine delivery
  ): boolean => {
    // The hub owns skill reloads: an unchanged catalog must retain the CLI's
    // sent-skills record, including when an older dashboard asks to reload it.
    if (message.payload.method === CONTROL_RELOAD_SKILLS) {
      const requestId = message.requestId ?? message.payload.requestId;
      const frame: ControlResult = {
        kind: "control_result",
        requestId,
        ok: false,
        error: "Skills reload when synced fleet content changes.",
      };
      if (remember) {
        toDashboard(dashboard, { ...message, verb: "frames", payload: frame });
      } else {
        streams.settleCommand(requestId, frame);
      }
      return true;
    }
    if (relayPermissionAnswer(message, dashboard, remember)) {
      return true;
    }
    const deleted = peekTranscriptDelete(message.payload);
    if (deleted && registry.agent(message.machineId)) {
      const rows = db
        .sessionOwnership(message.machineId)
        .filter((row) => row.sessionId === deleted);
      if (rows.length > 0) {
        for (const row of rows) {
          endSession(row.id, "delete-transcript");
        }
        const requestId = message.requestId ?? message.payload.requestId;
        const frame: ControlResult = {
          kind: "control_result",
          requestId,
          ok: true,
        };
        if (remember) {
          toDashboard(dashboard, {
            ...message,
            verb: "frames",
            payload: frame,
          });
        } else {
          streams.settleCommand(requestId, frame);
        }
        return true;
      }
    }
    const requestId = message.requestId ?? message.payload.requestId;
    const correlated = { ...message, requestId };
    if (!forward(correlated, dashboard, remember)) {
      return false;
    }
    // A per-cell install or retry, clicked rather than swept: the chip
    // turns on every dashboard, not only the one that clicked it.
    const toolId = peekInstall(message.payload);
    if (toolId && requestId) {
      pendingInstalls.set(requestId, {
        machineId: message.machineId,
        toolId,
      });
      db.setAgentToolCell(message.machineId, {
        id: toolId,
        state: "installing",
        at: Date.now(),
      });
      publishInstances(message.machineId);
    }
    // A sync or a status a dashboard asked for answers with the same
    // report a register's does, and the row is the hub's either way.
    const method = peek(message.payload, "method");
    if (requestId && (method === FLEET_SYNC || method === FLEET_STATUS)) {
      pendingFleet.set(requestId, message.machineId);
    }
    noteControl(message);
    return true;
  };

  /** A control that interrupts a session's turn cuts into it ({@link noteInterrupt}). */
  const noteControl = (message: Envelope<ControlPayload>): void => {
    if (message.payload.method === CONTROL_INTERRUPT && message.instanceId) {
      noteInterrupt(message.instanceId);
      // The error closing that turn is the stop's receipt, on every screen.
      transcripts.noteInterrupt(message.instanceId);
    }
  };

  /**
   * The Ledger Protocol's hub half: per-session sequence, replay ring, and
   * command acknowledgement. It borrows the relays above rather than reaching
   * past them.
   */
  const streams = createStreamHub({
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates ownership and settles the send once against the harness's atomic withdrawal receipt, including concurrent recalls
    withdrawSend: async (machineId, instanceId, sendId) => {
      const row = db.sendRecord(sendId);
      const [instance] = db.getInstancesByIds([instanceId]);
      if (
        !row ||
        row.instanceId !== instanceId ||
        instance?.machineId !== machineId
      ) {
        throw new Error("That send does not belong to this session.");
      }
      if (row.state === "cancelled") {
        return "withdrawn";
      }
      if (row.state !== "pending") {
        return "started";
      }
      const reply = await callAgent(
        machineId,
        "withdrawSend",
        [sendId],
        READ_TIMEOUT_MS,
        undefined,
        instanceId
      );
      if (typeof reply === "string") {
        throw new Error(`Withdrawal ${reply}.`);
      }
      if (!reply.ok) {
        throw new Error(reply.error ?? "Withdrawal failed.");
      }
      const now = db.sendRecord(sendId);
      if (now?.state === "cancelled") {
        return "withdrawn";
      }
      if (reply.result === "withdrawn") {
        if (now?.state === "pending") {
          changeSend(now, { state: "cancelled" });
        }
        return "withdrawn";
      }
      if (now?.state === "pending") {
        readSend(now, true);
      }
      return "started";
    },
    isMachineConnected: (machineId) => registry.agent(machineId) !== undefined,
    relaySend,
    relayControl: (envelope, dashboard) =>
      relayControl(envelope, dashboard, false),
  });

  /**
   * Forks the hub has started and not yet heard name their own conversation:
   * the conversation each reads its history from until then, and the turn it
   * branched at. A fork's row records no key until its `init` (`peekResume`).
   */
  const forkSeeds = new Map<string, { sessionKey: string; at?: string }>();

  /** A send record list as a map, by uuid. */
  const recordMap = (
    lines: { record: SendRecord }[]
  ): Record<string, SendRecord> =>
    Object.fromEntries(lines.map(({ record }) => [record.uuid, record]));

  /**
   * Where a session's transcript is stored, and where its history ends when
   * it is a fork not yet named. The hub's row is the single authority for a
   * session it holds; an id with no row is a stored key, located. A row that
   * never reported a key has nothing stored anywhere: what it was sent is the
   * hub's own to say, and that is its whole history.
   */
  const historyWhere = async (
    instanceId: string
  ): Promise<
    { where: TranscriptWhere; cut?: string; row?: InstanceRow } | HistoryRead
  > => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row) {
      const located = await locateSession(instanceId);
      if (!located) {
        return { fault: "missing", message: `no session ${instanceId}` };
      }
      return {
        where: {
          machineId: located.machineId,
          sessionKey: located.sessionId,
          cwd: located.cwd || "",
          harness: located.harness,
        },
      };
    }
    const fork = row.sessionId ? undefined : forkSeeds.get(row.id);
    const where = {
      machineId: row.machineId,
      sessionKey: row.sessionId ?? fork?.sessionKey ?? "",
      cwd: row.cwd || "",
      harness: row.harness || "claude",
    };
    if (!where.sessionKey) {
      return {
        entries: [],
        records: recordMap(sendLines(row.id, [], true, true)),
        where,
      };
    }
    return { where, cut: fork?.at, row };
  };

  /** The stored entries under `where`, as its machine answers, or why it could not. */
  const storedEntries = async (
    where: TranscriptWhere
  ): Promise<
    { entries: SessionMessage[] } | Extract<HistoryRead, { fault: string }>
  > => {
    const { machineId } = where;
    const answer = await callAgent(
      machineId,
      CONTROL_GET_SESSION_MESSAGES,
      [where.sessionKey, { dir: where.cwd || undefined }],
      READ_TIMEOUT_MS,
      where.harness as HarnessKind
    );
    if (answer === "offline") {
      return {
        fault: "offline",
        machineId,
        message: `machine ${machineId} is not connected`,
      };
    }
    if (answer === "timeout") {
      return {
        fault: "timeout",
        message: `machine ${machineId} did not answer in time`,
      };
    }
    if (!answer.ok) {
      return {
        fault: "failed",
        message: answer.error ?? "the transcript could not be read",
      };
    }
    // A session the machine has never stored answers with nothing: an empty
    // transcript, the same shape a brand new session has.
    return {
      entries: (Array.isArray(answer.result)
        ? answer.result
        : []) as SessionMessage[],
    };
  };

  const includesRewindAnchor = (
    where: TranscriptWhere,
    entry: SessionMessage,
    at: string | undefined
  ): boolean =>
    at === undefined || where.harness !== "opencode" || entry.type !== "user";

  /**
   * A session's whole stored transcript, from its machine, with the records of
   * the sends it holds — cut after the entry `at` when given (a rewind, a fork
   * from the middle).
   */
  const readHistory = async (
    instanceId: string,
    at?: string
  ): Promise<HistoryRead> => {
    const found = await historyWhere(instanceId);
    if ("entries" in found || "fault" in found) {
      return found;
    }
    const { where, row } = found;
    const cut = at ?? found.cut;
    const answer = await storedEntries(where);
    if ("fault" in answer) {
      return answer;
    }
    let transcript = answer.entries;
    if (cut) {
      const end = transcript.findIndex((entry) => entry.uuid === cut);
      if (end >= 0) {
        transcript = transcript.slice(
          0,
          end + Number(includesRewindAnchor(where, transcript[end], at))
        );
      }
    }
    // Pictures as references to the media store, before a send's record is
    // filled from one of these entries.
    externalizeImages(transcript);
    const records = recordMap(sendLines(row?.id, transcript, true, true));
    // A stored ping and its answer are hidden together, also after hub restart.
    // A new main-loop user prompt closes that range; tool results do not.
    let quiet = false;
    transcript = transcript.filter((entry) => {
      if (
        entry.type === "user" &&
        !entry.parent_tool_use_id &&
        userTurnText(entry)
      ) {
        quiet = (entry.sends ?? []).some(
          (id) => records[id]?.keepAlive === true
        );
      }
      return !quiet;
    });
    for (const [id, record] of Object.entries(records)) {
      if (record.keepAlive) {
        delete records[id];
      }
    }
    if (row) {
      readRowHistory(row, transcript);
    }
    return { entries: transcript, records, where };
  };

  /**
   * What a whole stored transcript says about the row it belongs to: its
   * oldest user turn is the unambiguous answer to what the session is called
   * (write-once), and a session the hub holds in custody ends on the notice
   * that says so.
   */
  const readRowHistory = (
    row: InstanceRow,
    transcript: SessionMessage[]
  ): void => {
    if (!(row.title || row.derivedTitle)) {
      const first = firstTurnOf(transcript);
      if (first) {
        nameFromFirstTurn(row.machineId, row.id, first);
      }
    }
    const held = heldSessions.get(row.id);
    if (
      held &&
      registry.agent(row.machineId) &&
      (row.status === "sleeping" || row.status === "error")
    ) {
      transcript.push(custodyNotice(row, held.reason));
    }
  };

  /** Every session's blocks, built here once, whether or not anyone watches. */
  const transcripts = createTranscripts({
    readHistory,
    build: (machineId) =>
      db.listAgents().find((agent) => agent.machineId === machineId)?.build
        ?.commit,
    sequence: (instanceId, frame) => {
      streams.sequence(instanceId, frame);
    },
    head: (instanceId) => streams.head(instanceId),
    followed: (instanceId) => streams.followerCount(instanceId) > 0,
    live: (instanceId) => {
      const [row] = db.getInstancesByIds([instanceId]);
      return row?.status === "running";
    },
  });

  /** A rewind's spawn, by its request: its transcript is read whole again if the spawn fails. */
  const rewinds = new Map<string, string>();

  /**
   * What a dashboard's spawn does to a transcript. A fork reads its history
   * from the conversation it branches, up to the turn it branched at. One
   * addressed to a session already running is a relaunch: the error closing
   * the old turn is the reader's own doing. A rewind (`atMessage`) also cuts
   * the transcript back to its turn, as the process it starts reads it — and
   * puts it back whole if the spawn fails.
   */
  const noteRespawn = (
    instanceId: string,
    requestId: string | undefined,
    payload: unknown
  ): void => {
    const resume = (payload as { resume?: unknown }).resume as
      | { sessionKey?: string; fork?: boolean; atMessage?: string }
      | undefined;
    if (resume?.fork && resume.sessionKey) {
      forkSeeds.set(instanceId, {
        sessionKey: resume.sessionKey,
        ...(resume.atMessage ? { at: resume.atMessage } : {}),
      });
      return;
    }
    transcripts.noteRelaunch(instanceId);
    if (resume?.atMessage) {
      transcripts.reread(instanceId, resume.atMessage);
      if (requestId) {
        rewinds.set(requestId, instanceId);
      }
    }
  };

  // Delegate types (fleet-wide `delegate` presets): a standalone table and
  // route group, mounted rather than folded into the routes below — see
  // delegate-types.ts for why it keeps its own connection.
  const delegateTypes = makeDelegateTypes();
  /**
   * THE way the hub runs a command on a machine: in `cwd`, killed after
   * `timeoutMs` (the machine's default when not given), answering its
   * complete stdout and stderr (past 8 MiB it fails). A workflow's `w.exec` and a work item's
   * acceptance checks both go through it; a check names its workspace, so it
   * runs inside that workspace's boundary, as its delegate's commands do.
   */
  const runOnMachine = async (
    machineId: string,
    cwd: string,
    cmd: string,
    timeoutMs?: number,
    workspace?: WorkspaceRef
  ): Promise<CommandResult> => {
    const response = await callAgent(
      machineId,
      CONTROL_RUN_COMMAND,
      [cwd, cmd, timeoutMs, workspace],
      (timeoutMs ?? 300_000) + 10_000
    );
    if (typeof response === "string") {
      throw new Error(`Command refused: machine ${response}.`);
    }
    if (response.error) {
      throw new Error(String(response.error));
    }
    return response.result as CommandResult;
  };

  const workItems = createWorkItems({
    db,
    end: async (instanceId) => {
      endSession(instanceId, "stop");
      await waitForEnd(instanceId);
    },
    command: runOnMachine,
    inTurn: (row) => row.status === "running" && !!pulses.get(row.id)?.busy,
    report: (row, body, failed, notice) => {
      reportToParent(row, body, failed, undefined, notice);
      // An item that ends while its session is at rest (checks a restarted
      // hub ran again) has no turn's end left to stop it at.
      sleepFinished(row.id);
    },
    // To every dashboard, as delegate events go: the parent's tray may be open
    // on any of them.
    publish: (item) => {
      const [parent] = db.getInstancesByIds([item.parentInstanceId]);
      publishInstances(parent?.machineId ?? "");
      registry.broadcast({
        verb: "frames",
        machineId: parent?.machineId ?? "",
        instanceId: item.parentInstanceId,
        payload: { kind: "work_item", instanceId: item.parentInstanceId, item },
      });
    },
    types: () => delegateTypes.list(),
    spawn: issueSpawn,
    send: deliverSend,
    call: async (machineId, method, args) => {
      const timeout =
        method === CONTROL_WORKSPACE_CREATE ||
        method === CONTROL_WORKSPACE_ARCHIVE
          ? WORKSPACE_CREATE_TIMEOUT_MS
          : WORKSPACE_TIMEOUT_MS;
      const answer = await callAgent(machineId, method, args, timeout);
      if (answer === "offline") {
        throw new Error(`machine ${machineId} is not connected`);
      }
      if (answer === "timeout") {
        throw new Error(
          `machine ${machineId} did not answer ${method} within ${timeout / 1000}s`
        );
      }
      if (!answer.ok) {
        throw new Error(answer.error ?? `${method} failed on ${machineId}`);
      }
      return answer.result;
    },
  });
  // A hub crash after intent persistence cannot leave its work item reading live.
  for (const row of db.sessionOwnership()) {
    if (row.endIntent && !row.endConfirmedAt) {
      workItems.cancelled(row);
    }
  }
  const workflowRuntime = createWorkflowRuntime({
    custodyPending: (machineId, instanceId) => {
      const custody = machineCustody.get(machineId);
      return (
        !registry.agent(machineId) ||
        custody?.state !== "available" ||
        custody.instances.includes(instanceId) ||
        custody.pending?.includes(instanceId) === true ||
        inCustody.has(instanceId) ||
        heldSessions.has(instanceId)
      );
    },
    db,
    dbPath: DB_PATH,
    cleanup: (_machineId, instanceId) =>
      lifecycle.oweEndSession(instanceId, "stop"),
    online: (machineId) => !!registry.agent(machineId),
    emit: (envelope) => {
      if (envelope.verb === "stop" && envelope.instanceId) {
        endSession(envelope.instanceId, "stop");
        return;
      }
      const agent = registry.agent(envelope.machineId);
      if (!agent) {
        throw new Error(`Machine ${envelope.machineId} is not connected.`);
      }
      if (envelope.verb === "send") {
        deliverSend(envelope as Envelope<SendPayload>);
      } else {
        agent.send(envelope);
      }
    },
    spawn: spawnSession,
    halt: (machineId, instanceId) =>
      new Promise<void>((resolve, reject) => {
        endSession(instanceId, "stop");
        const deadline = Date.now() + 30_000;
        const observe = () => {
          const row = db.ownedInstance(instanceId, machineId);
          if (!row || row.endConfirmedAt) {
            resolve();
          } else if (Date.now() >= deadline) {
            reject(
              new Error(
                "Workflow stop is recorded and still awaiting its machine."
              )
            );
          } else {
            setTimeout(observe, 100).unref();
          }
        };
        observe();
      }),
    command: runOnMachine,
    park: (envelope) => {
      if (!envelope.requestId) {
        throw new Error("Workflow question has no request id.");
      }
      const existed = pending.get(envelope.requestId);
      if (!pending.remember(envelope.requestId, envelope)) {
        return;
      }
      registry.broadcast(envelope);
      if (
        !existed &&
        (envelope.payload as { routedTo?: string }).routedTo !== "parent"
      ) {
        telegram?.onAsk(envelope);
      }
    },
    settle: (id) => {
      pending.resolve(id);
    },
    broadcast: (frame) =>
      registry.broadcast({
        verb: "frames",
        machineId: frame.run.machineId,
        payload: { kind: "workflow", ...frame },
      }),
    problems: (graph, workflowId) =>
      validateWorkflow(graph, {
        workflowId,
        resolveWorkflow: db.getWorkflow,
      }),
    notifyUser: (text) => {
      telegram?.onUserMessage({
        verb: "frames",
        machineId: "hub",
        instanceId: "workflow",
        payload: { kind: "user_message", instanceId: "workflow", text },
      });
    },
    supervisor: async (type, cwd, machineId, title, prompt) => {
      const preset = delegateTypes.list().find((entry) => entry.name === type);
      if (!preset) {
        throw new Error(`No delegate type ${type}.`);
      }
      const instanceId = crypto.randomUUID();
      await spawnSession(
        machineId,
        {
          ...preset,
          instanceId,
          cwd,
          title,
          canDelegate: true,
        },
        "bypassPermissions"
      );
      deliverSend({
        verb: "send",
        machineId,
        instanceId,
        payload: {
          instanceId,
          message: {
            type: "user",
            uuid: crypto.randomUUID(),
            message: { role: "user", content: prompt },
            parent_tool_use_id: null,
            origin: {
              kind: "peer",
              from: instanceId,
              name: "workflow",
              fromSession: instanceId,
            },
          },
        },
      });
      return instanceId;
    },
  });
  onWorkflowAnswer(pending, (id, result) =>
    workflowRuntime.settleQuestion(id, result)
  );
  // Schema generation needs the route types, not restored workflow attempts
  // and parked questions accessing its scratch database after it is removed.
  if (resumeWorkflows) {
    // biome-ignore lint/complexity/noVoid: startup resumes asynchronously and reports its own failure
    void workflowRuntime.resume().catch(console.error);
  }
  const delegationMcp = createDelegationMcp({
    instances: () => withKeepAlive(db.listInstances()),
    instanceById: (id) => db.getInstancesByIds([id])[0],
    credentialActor: (authorization) => {
      const identity = identities.resolve(authorization);
      return identity
        ? db.getInstancesByIds([identity.instanceId])[0]
        : undefined;
    },
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one in-process dispatcher replaces six relay routes, retaining their ordered ownership and settlement checks.
    forward: async (envelope, actor) => {
      // The MCP resolver supplies the caller separately, never from provenance
      // on an envelope. Recheck the row in case its permission changed mid-call.
      const [requester] = db.getInstancesByIds([actor.id]);
      if (!requester) {
        throw new WorkItemRefusal(400, "Unknown calling CawCo instanceId");
      }
      const { instanceId } = envelope;
      const machineId = envelope.machineId || requester.machineId;
      if (envelope.verb === "spawn") {
        if (!resolveCanDelegate([requester], requester.id)) {
          throw new WorkItemRefusal(403, LEAF_DELEGATE_REFUSAL);
        }
        const { fallbackPermissionMode, ...payload } =
          envelope.payload as SpawnPayload & {
            fallbackPermissionMode?: PermissionMode;
          };
        await spawnSession(machineId, payload, fallbackPermissionMode);
        return;
      }
      if (envelope.verb === "send") {
        const payload = envelope.payload as SendPayload;
        const malformed = normalizeRelayMessage(payload);
        if (malformed) {
          throw new WorkItemRefusal(400, malformed);
        }
        downgradeNonDelegateUrgent(
          db.listInstances(),
          payload,
          instanceId ?? ""
        );
        const record = deliverSend({
          ...envelope,
          machineId,
        } as Envelope<SendPayload>);
        if (record.state === "failed") {
          throw new WorkItemRefusal(404, record.reason ?? "the send failed");
        }
        return;
      }
      if (envelope.verb === "frames") {
        telegram?.onUserMessage({
          ...envelope,
          machineId: requester.machineId,
        });
        return;
      }
      const control = envelope.payload as ControlPayload;
      if (
        envelope.verb !== "stop" &&
        !(
          envelope.verb === "control" &&
          (control.method === CONTROL_INTERRUPT ||
            control.method === RESOLVE_PERMISSION)
        )
      ) {
        throw new Error(`Unsupported delegation operation ${envelope.verb}`);
      }
      const row = instanceId
        ? db.getInstancesByIds([instanceId])[0]
        : undefined;
      if (!row || row.parentInstanceId !== requester.id) {
        throw new WorkItemRefusal(
          403,
          "you can only control your own delegates"
        );
      }
      if (envelope.verb === "stop") {
        endSession(row.id, "stop");
        closePreview(row.id).catch(console.error);
        forgetPending(row.id, UNREAD.stopped);
        noteInterrupt(row.id);
        workItems.cancelled(row);
        return;
      }
      const retired = workItems.refusal(row, {
        kind: "peer",
        fromSession: requester.id,
      });
      if (retired) {
        throw new WorkItemRefusal(409, retired);
      }
      const result = control.args?.[1] as PermissionResult;
      if (control.method === RESOLVE_PERMISSION) {
        const answer = peekAnswer(control);
        if (!answer) {
          throw new Error("A permission answer names no request.");
        }
        await answerPermission(pending, row.id, answer.requestId, result);
        return;
      }
      const agent = registry.agent(row.machineId);
      if (!agent) {
        throw new WorkItemRefusal(
          404,
          `machine ${row.machineId} is not connected`
        );
      }
      agent.send({
        ...envelope,
        machineId: row.machineId,
        payload: { ...control, from: requester.id },
      });
      if (control.method === CONTROL_INTERRUPT) {
        noteInterrupt(row.id);
      }
    },
  });

  /**
   * What the hub holds in memory for sessions whose rows were just deleted —
   * the same forgetting a stopped session gets — so nothing points at a row
   * that is gone.
   */
  const forgetInstances = (ids: readonly string[]): void => {
    for (const id of ids) {
      forgetPending(id, UNREAD.ended);
      anchors.delete(id);
      unanswered.delete(id);
      pulses.delete(id);
      touched.delete(id);
      heldSessions.delete(id);
    }
  };

  const ensureIdentityWorkspace = async (row: InstanceRow): Promise<void> => {
    const workspace = workItems.workspaceOf(row);
    if (!workspace) {
      return;
    }
    const masked = await callAgent(
      row.machineId,
      CONTROL_WORKSPACE_BOUNDARY,
      [workspace],
      30_000
    );
    if (typeof masked === "string") {
      throw new Error(masked);
    }
    if (!masked.ok) {
      throw new Error(
        masked.error ?? "Workspace secret masking is still waiting"
      );
    }
  };

  const healthySessionIdentity = (instanceId: string): boolean => {
    const identity = db.sessionIdentity(instanceId);
    return !!(
      identity?.credentialHash &&
      identity.installedAt &&
      !identity.pendingHash &&
      identity.error === null
    );
  };

  const failedSessionIdentity = (instanceId: string, problem: unknown) => {
    const error = problem instanceof Error ? problem.message : String(problem);
    db.sessionIdentityError(
      instanceId,
      error,
      error === LIVE_CREDENTIAL_ENROLLMENT_REFUSAL
    );
    return { instanceId, installed: false, error };
  };

  /** Operator-selected delivery; the raw credential is never returned to the caller. */
  const installSessionIdentity = async (instanceId: string) => {
    try {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!(row && (row.harness === "claude" || row.harness === "pi"))) {
        throw new Error(
          "Phase 2(a) installs known Claude and pi sessions only"
        );
      }
      if (healthySessionIdentity(instanceId)) {
        return { instanceId, installed: true, changedServers: [] };
      }
      const agent = registry.agent(row.machineId);
      if (!agent) {
        throw new Error("Machine is not connected");
      }
      await ensureIdentityWorkspace(row);
      const credential = identities.mint(instanceId);
      const requestId = crypto.randomUUID();
      const reply = await awaitReply(row.machineId, requestId, 120_000, () =>
        agent.send({
          verb: "control",
          machineId: row.machineId,
          instanceId,
          requestId,
          payload: {
            instanceId,
            requestId,
            method: INSTALL_SESSION_CREDENTIAL,
            args: [credential],
          },
        } satisfies Envelope<ControlPayload>)
      );
      if (reply === "timeout") {
        throw new Error("Credential installation is still waiting");
      }
      if (!reply.ok) {
        throw new Error(reply.error ?? "Credential installation failed");
      }
      if (db.sessionIdentity(instanceId)?.pendingHash) {
        throw new Error("Harness returned without an installation ACK");
      }
      const installed = reply.result as SessionCredentialInstall | undefined;
      return {
        instanceId,
        installed: true,
        ...(installed?.changedServers
          ? { changedServers: installed.changedServers }
          : {}),
      };
    } catch (problem) {
      return failedSessionIdentity(instanceId, problem);
    }
  };

  const keepAliveScheduler = createKeepAliveScheduler({
    rows: db.listInstances,
    usage: db.listUsageLimits,
    idle: async (row) => {
      if (!registry.agent(row.machineId)) {
        return false;
      }
      const answer = await callAgent(
        row.machineId,
        AGENT_BUSY,
        [],
        BUSY_TIMEOUT_MS
      );
      if (typeof answer === "string" || !answer.ok) {
        return false;
      }
      const reading = answer.result as AgentBusyReport | undefined;
      return (
        reading?.ready === true &&
        Array.isArray(reading.instances) &&
        !reading.instances.includes(row.id) &&
        !!registry.agent(row.machineId) &&
        db.sendsIn(row.id, ["pending"]).length === 0 &&
        !pending.list().some((ask) => ask.instanceId === row.id) &&
        ![...awaitingMachine.values()].some((sends) =>
          sends.some((send) => send.instanceId === row.id)
        )
      );
    },
    send: deliverSend,
    changed: () => publishInstances(""),
  });

  workItems.resumeWaits();

  return (
    new Elysia()
      .use(websocket())
      .use(dashboardErrorsRoutes())
      .use(delegateTypesRoutes(delegateTypes))
      .use(
        joinRoutes({
          online: (machineId) => Boolean(registry.agent(machineId)),
        })
      )
      .use(
        createBinaryUpdates({
          dbPath: DB_PATH,
          states: () => binaryUpdateStates,
          online: () =>
            db
              .listAgents()
              .filter((row) => registry.agent(row.machineId))
              .map((row) => row.machineId),
          setState: (machineId, state) => {
            const known = peekBinaryUpdate({ binaryUpdate: state });
            if (known) {
              const moved = !sameBinaryUpdate(
                binaryUpdateStates.get(machineId),
                known
              );
              binaryUpdateStates.set(machineId, known);
              flushOwedStarts(machineId);
              if (moved) {
                publishInstances(machineId);
              }
            }
          },
          acknowledge: (machineId) =>
            callAgent(machineId, ACKNOWLEDGE_BINARY_UPDATE, [], 10_000),
          cancel: (machineId) =>
            callAgent(machineId, CANCEL_BINARY_UPDATE, [], 10_000),
          configure: (machineId, policy: BinaryUpdatePolicy) =>
            callAgent(machineId, CONFIGURE_BINARY_UPDATES, [policy], 10_000),
        }).routes
      )
      .use(
        workflowRoutes(
          db,
          workflowRuntime,
          (id) => withSessionPresence(db.getInstancesByIds([id]))[0]?.status,
          {
            changed: fanOutFleet,
            check: async (name, workflowId) => {
              await Promise.all(
                // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: verify discovery and the ownership marker before a workflow can claim a skill on each connected machine.
                [...registry.machineIds()].map(async (machineId) => {
                  const answer = await callAgent(
                    machineId,
                    INSPECT_CONFIG,
                    [],
                    READ_TIMEOUT_MS
                  );
                  if (answer === "offline" || answer === "timeout") {
                    throw new Error(
                      `Cannot check workflow skill ${name}: machine ${machineId} ${answer}.`
                    );
                  }
                  if (!answer.ok) {
                    throw new Error(
                      answer.error ?? `Cannot inspect skills on ${machineId}.`
                    );
                  }
                  const inspection =
                    answer.result as import("@cawco/core").ConfigInspection;
                  const matches = inspection.skills.filter(
                    (skill) => skill.name === name
                  );
                  if (!matches.length) {
                    return;
                  }
                  if (
                    !workflowId ||
                    matches.some(
                      (skill) => !skill.managed || skill.scope !== "user"
                    )
                  ) {
                    throw new Error(
                      `Workflow slug collides with operator-installed skill ${name} on ${machineId}.`
                    );
                  }
                  const files = await callAgent(
                    machineId,
                    READ_SKILL_FILES,
                    [name],
                    READ_TIMEOUT_MS
                  );
                  if (files === "offline" || files === "timeout" || !files.ok) {
                    throw new Error(
                      `Cannot verify workflow skill ${name} ownership on ${machineId}.`
                    );
                  }
                  const markdown = (files.result as SkillFile[]).find(
                    (file) => file.path === "SKILL.md"
                  );
                  if (
                    !(
                      markdown &&
                      Buffer.from(markdown.contentBase64, "base64")
                        .toString()
                        .includes(`<!-- cawco-workflow:${workflowId} -->`)
                    )
                  ) {
                    throw new Error(
                      `Workflow slug collides with operator-installed skill ${name} on ${machineId}.`
                    );
                  }
                })
              );
            },
          }
        )
      )
      .all("/mcp/cawco", hidden, ({ request, body, server }) => {
        // Tool deadlines govern long calls; the HTTP idle timer must not cut them short.
        server?.timeout(request, 0);
        return delegationMcp.handle(request, body);
      })
      .all(
        "/mcp/fleet/:name",
        { ...hidden, parse: "none" },
        ({ params, request, server }) => {
          server?.timeout(request, 0);
          return fleetMcp.forward(params.name, request);
        }
      )
      .get(
        "/api/delegation/tools",
        {
          ...hidden,
          query: t.Object({ instanceId: t.Optional(t.String()) }),
        },
        ({ query }) => delegationMcp.list(query.instanceId)
      )
      // Preparation only: enforcement is a separate cutover after every live row ACKs.
      .get(
        "/api/session-identities",
        {
          ...hidden,
          query: t.Object({ instanceId: t.Optional(t.String()) }),
        },
        ({ query }) => {
          const rows =
            query.instanceId === undefined
              ? db.listInstances()
              : db.getInstancesByIds([query.instanceId]);
          return rows.map((row) => {
            const identity = db.sessionIdentity(row.id);
            return {
              instanceId: row.id,
              harness: row.harness,
              status: row.status,
              installedAt: identity?.installedAt ?? null,
              pending: !!identity?.pendingHash,
              error: identity?.error ?? null,
            };
          });
        }
      )
      .post(
        "/api/session-identities/ack",
        { ...hidden, body: t.Object({ error: t.Optional(t.String()) }) },
        ({ request, body, status }) => {
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (!identity) {
            return status(
              401,
              "A valid delivered session credential is required for installation ACK"
            );
          }
          if (body.error !== undefined) {
            db.sessionIdentityError(
              identity.instanceId,
              body.error,
              body.error === LIVE_CREDENTIAL_ENROLLMENT_REFUSAL
            );
            return { ok: false };
          }
          return identities.acknowledge(authorization)
            ? { ok: true }
            : status(409, "This credential installation is no longer pending");
        }
      )
      .post(
        "/api/session-identities/install",
        {
          ...hidden,
          body: t.Object({
            instanceIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
          }),
        },
        async ({ body }) =>
          Promise.all(body.instanceIds.map(installSessionIdentity))
      )
      .post(
        "/api/delegation/call/:instanceId",
        { ...hidden, body: t.Any() },
        ({ params, body, request, server, status }) => {
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (authorization !== null && !identity) {
            return status(401, "Invalid session credential");
          }
          if (identity && identity.instanceId !== params.instanceId) {
            return status(
              403,
              "Session credential does not belong to the named instanceId"
            );
          }
          if (
            !(
              params.instanceId.trim() &&
              db.getInstancesByIds([params.instanceId])[0]
            )
          ) {
            return status(
              400,
              "delegation call needs a known non-empty instanceId"
            );
          }
          if (
            typeof body !== "object" ||
            body === null ||
            Array.isArray(body) ||
            typeof (body as { name?: unknown }).name !== "string" ||
            !(body as { name: string }).name.trim() ||
            ("arguments" in body &&
              (typeof body.arguments !== "object" ||
                body.arguments === null ||
                Array.isArray(body.arguments)))
          ) {
            return status(
              400,
              "delegation call needs a non-empty tool name and object arguments"
            );
          }
          const input = body as {
            name: string;
            arguments?: Record<string, unknown>;
          };
          if (
            input.name === "generate_image" ||
            input.name === "continue_session" ||
            input.name === "delegate" ||
            input.name === "finish_item"
          ) {
            server?.timeout(request, 0);
          }
          return delegationMcp.call(
            params.instanceId,
            input.name,
            input.arguments ?? {},
            authorization ?? undefined
          );
        }
      )
      // The hub's own build rides along (NEW.md §12), so a machine's can be read
      // against something rather than taken on faith.
      .get("/health", hidden, async () => ({
        ok: true,
        version: HUB_VERSION,
        build: hubBuild,
      }))
      .get("/api/agents", () => withPresence(db.listAgents()))
      .post(
        "/api/instances/:id/generate-image",
        {
          body: t.Object({
            prompt: t.String(),
            output_path: t.String(),
            reference_images: t.Optional(t.Array(t.String())),
            size: t.Optional(t.String()),
            quality: t.Optional(
              t.Union([
                t.Literal("auto"),
                t.Literal("low"),
                t.Literal("medium"),
                t.Literal("high"),
              ])
            ),
          }),
        },
        async ({ params, body, status, request, server }) => {
          const row = db
            .listInstances()
            .find((instance) => instance.id === params.id);
          if (!row) {
            return status(404, "Unknown calling session.");
          }
          server?.timeout(request, 0);
          const answer = await callAgent(
            row.machineId,
            GENERATE_IMAGE,
            [row.id, row.cwd, body],
            IMAGE_GENERATION_TIMEOUT_MS + 30_000
          );
          if (answer === "offline") {
            return status(
              503,
              "The session's machine is offline; image generation was not started."
            );
          }
          if (answer === "timeout") {
            return status(
              504,
              "Image generation did not finish in time. Check the output path before retrying; do not submit a duplicate automatically."
            );
          }
          if (!answer.ok) {
            return status(422, answer.error ?? "Image generation failed.");
          }
          return answer.result as GeneratedImage;
        }
      )
      // Claude models' context windows as their turns last reported them; the
      // dashboard's model list carries them for claude rows.
      .get("/api/model-windows", () => ({
        claude: db.claudeContextWindows(),
      }))
      // What a continuation of this session would carry, sized — for the
      // dialog's pickers, which enable only models that fit.
      .get(
        "/api/instances/:id/continue",
        {
          query: t.Object({ note: t.Optional(t.String()) }),
        },
        async ({ params, query, status }) => {
          try {
            const prepared = await prepareContinuation(params.id, query.note);
            return {
              liveContextTokens: prepared.liveContextTokens,
              summariseInputTokens: prepared.summariseInputTokens,
              openingTokens: prepared.openingTokens,
              compacted: prepared.compacted,
              entries: prepared.entries,
            };
          } catch (error) {
            return status(
              422,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      )
      // Continue in new session. The fit of both models is checked before
      // anything starts (a plain 409); then the hub starts the job and
      // answers with its ids at once. The job's stages reach every dashboard
      // on the `instances` frames (`continuations`); nothing about the
      // request that started it can stop it — only its Cancel.
      .post(
        "/api/instances/:id/continue",
        {
          body: continueBody,
          // A 400 that names the missing or malformed field, in words.
          error({ error, status }) {
            if (error instanceof ValidationError) {
              const [first] = error.all as {
                path: string;
                message: string;
                params?: { requiredProperties?: string[] };
              }[];
              // The issue's own path stops at the object missing the field;
              // the error's `property` names that object from the root.
              const { property } = error.payload as { property?: string };
              const parent = property?.startsWith("/")
                ? property.slice(1).replaceAll("/", ".")
                : "";
              const at = parent ? `${parent}.` : "";
              const missing = first.params?.requiredProperties?.join(", ");
              return status(
                400,
                missing
                  ? `${at}${missing} is required`
                  : `${first.path}: ${first.message}`
              );
            }
          },
        },
        async ({ params, body, status }) => {
          let prepared: PreparedContinuation;
          let refusal: string | undefined;
          try {
            prepared = await prepareContinuation(params.id, body.note);
            refusal = await continuationRefusal(prepared, body);
          } catch (error) {
            return status(
              422,
              error instanceof Error ? error.message : String(error)
            );
          }
          if (refusal) {
            return status(409, refusal);
          }
          const row = startContinuation(prepared, body);
          return {
            continuationId: row.id,
            targetInstanceId: row.targetInstanceId,
            summariserInstanceId: row.summariserInstanceId,
          };
        }
      )
      // The continuations the hub is carrying: what a dashboard that connects
      // late reads before the next publish reaches it.
      .get("/api/continuations", () => continuationTable())
      // Cancel: the summariser's wait ends, it is stopped, and nothing starts.
      // Only while summarising — a target already starting is past stopping.
      .delete("/api/continuations/:id", ({ params, status }) => {
        const cancelled = cancelContinuation(params.id);
        return "row" in cancelled
          ? continuationJob(cancelled.row)
          : status(cancelled.refused, cancelled.why);
      })
      // A started continuation's report, once it has one: what the
      // `continue_session` tool waits on. The job runs whether or not anyone
      // waits here.
      .get(
        "/api/continuations/:id/outcome",
        hidden,
        async ({ params, request, server, status }) => {
          // A summariser can take minutes; the wait must outlast Bun's idle cut.
          server?.timeout(request, 0);
          const row = await settledContinuation(params.id);
          if (!row) {
            return status(404, "That continuation is not running.");
          }
          if (row.stage === "started") {
            return outcomeOf(row);
          }
          return status(
            422,
            row.stage === "cancelled"
              ? CONTINUATION_CANCELLED
              : (row.error ?? "the continuation failed")
          );
        }
      )
      .post(
        "/api/instances/:id/preview",
        {
          body: t.Object({
            port: t.Optional(t.Integer({ minimum: 1, maximum: 65_535 })),
            dir: t.Optional(t.String({ minLength: 1, pattern: "^/" })),
          }),
        },
        async ({ params, body, status }) => {
          if ((body.port === undefined) === (body.dir === undefined)) {
            return status(400, "Pass exactly one of port or dir.");
          }
          const [row] = db.getInstancesByIds([params.id]);
          if (!row) {
            return status(404, "Session not found.");
          }
          const started = await openPreview(
            row.id,
            row.machineId,
            body.port === undefined
              ? { dir: body.dir as string }
              : { port: body.port }
          );
          return started.ok
            ? started.frame
            : status(started.code, started.error);
        }
      )
      .delete("/api/instances/:id/preview", async ({ params, status }) => {
        const stopped = await closePreview(params.id);
        return stopped.ok
          ? stopped.closed
          : status(stopped.code, stopped.error);
      })
      // What a restart polls to find a moment that cuts nothing in half.
      // A picture on a machine's disk, for the transcript's image cards. No
      // caching: the file is the agent's working state and may be rewritten or
      // removed between two looks.
      .get(
        "/api/agents/:machineId/image",
        { query: t.Object({ path: t.String() }) },
        async ({ params, query, status }) => {
          const answer = await readMachineImage(params.machineId, query.path);
          if (answer === "offline") {
            return status(503, `machine ${params.machineId} is not connected`);
          }
          if (answer === "timeout") {
            return status(504, `machine ${params.machineId} did not answer`);
          }
          if (answer === "missing") {
            return status(404, `${query.path} is not there any more`);
          }
          return new Response(answer.bytes, {
            headers: {
              "Content-Type": answer.mediaType,
              "Content-Length": String(answer.bytes.byteLength),
              "Cache-Control": "no-store",
            },
          });
        }
      )
      // Forgetting a machine the fleet no longer has. Only an offline one: a
      // connected daemon would register straight back, and its sessions are
      // live. Nothing on the machine is touched — if its agent ever starts
      // again it rejoins as new, and its stored transcripts come back with it.
      .delete("/api/agents/:machineId", ({ params, status }) => {
        const row = db
          .listAgents()
          .find((agent) => agent.machineId === params.machineId);
        if (!row) {
          return status(404, "No machine with that id on this hub.");
        }
        if (registry.agent(params.machineId)) {
          return status(
            409,
            `${row.hostname} is online. Stop its agent first, then remove it.`
          );
        }
        const gone = db.deleteMachine(params.machineId);
        forgetInstances(gone.instanceIds);
        // The frame that carries the machine list: every dashboard drops the
        // machine and its sessions without a reload.
        publishInstances(params.machineId);
        return { sessions: gone.instanceIds.length, projects: gone.projects };
      })
      // A session with no transcript — one that never started, or whose
      // transcript is gone from its machine — and no process has nothing a
      // transcript delete or a discard could act on, and every failed start
      // used to leave one on the board for good. This removes exactly those,
      // with the same delete Remove machine runs per session. Whether the
      // transcript is there is its machine's to say: the row's key only says
      // one was named once.
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one refusal-checked removal covers live custody, transcript presence, and the persisted end decision
      .delete("/api/instances/:id", async ({ params, status }) => {
        const [row] = db.getInstancesByIds([params.id]);
        if (!row) {
          return status(404, "No session with that id on this hub.");
        }
        if (
          ["running", "starting"].includes(row.status) ||
          (machineCustody.get(row.machineId)?.state === "available" &&
            (
              machineCustody.get(row.machineId) as Extract<
                SessionCustody,
                { state: "available" }
              >
            ).instances.includes(row.id)) ||
          heldSessions.has(row.id) ||
          inCustody.has(row.id)
        ) {
          return status(409, "This session is still running. Stop it first");
        }
        if (row.sessionId) {
          const stored = await callAgent(
            row.machineId,
            CONTROL_GET_SESSION_INFO,
            [row.sessionId, row.cwd || undefined],
            READ_TIMEOUT_MS,
            (row.harness || undefined) as HarnessKind | undefined
          );
          if (stored === "offline" || stored === "timeout") {
            return status(
              409,
              "This session's machine is not answering, so whether its transcript is still there can't be checked. Try again once it is back."
            );
          }
          if (!stored.ok) {
            return status(
              502,
              `The machine could not check this session's transcript: ${stored.error ?? "no reason given"}`
            );
          }
          if (stored.result) {
            return status(
              409,
              "This session has a transcript. Delete the transcript instead."
            );
          }
        }
        try {
          endSession(row.id, "delete");
        } catch (error) {
          return status(
            409,
            error instanceof Error ? error.message : String(error)
          );
        }
        forgetInstances([row.id]);
        publishInstances(row.machineId);
        return { ok: true };
      })
      .get("/api/agents/:machineId/busy", async ({ params, status }) => {
        const answer = await callAgent(
          params.machineId,
          AGENT_BUSY,
          [],
          BUSY_TIMEOUT_MS
        );
        if (answer === "offline") {
          return status(404, `machine ${params.machineId} is not connected`);
        }
        if (answer === "timeout") {
          return status(504, `machine ${params.machineId} did not answer`);
        }
        if (!answer.ok) {
          return status(500, answer.error ?? "the busy probe failed");
        }
        return answer.result as { busy: number; instances: string[] };
      })
      // And the update itself: the machine pulls, installs, rebuilds and restarts
      // what it serves, then says what it actually did.
      .post(
        "/api/agents/:machineId/update",
        {
          body: t.Object({
            restartAgent: t.Optional(t.Boolean()),
            force: t.Optional(t.Boolean()),
          }),
        },
        async ({ params, body, status }) => {
          const answer = await callAgent(
            params.machineId,
            UPDATE_CAWCO,
            [body],
            UPDATE_TIMEOUT_MS
          );
          if (answer === "offline") {
            return status(404, `machine ${params.machineId} is not connected`);
          }
          // A machine that restarts the hub as part of its update answers into a
          // socket that no longer exists, so this is not proof that nothing
          // happened — only that the hub stopped being able to hear about it.
          if (answer === "timeout") {
            return status(
              504,
              `machine ${params.machineId} did not finish the update in time`
            );
          }
          if (!answer.ok) {
            return status(500, answer.error ?? "the update failed");
          }
          return answer.result as UpdateReport;
        }
      )
      // What a machine really has, fleet or not (NEW.md §11) — and what a session
      // in `cwd` would see. Nothing is stored: this is the machine's own word at
      // the moment it was asked, and a stale copy of it would be worse than none.
      .post(
        "/api/agents/:machineId/inspect",
        { body: t.Object({ cwd: t.Optional(t.String()) }) },
        async ({ params, body, status }) => {
          const answer = await callAgent(
            params.machineId,
            INSPECT_CONFIG,
            [body.cwd],
            READ_TIMEOUT_MS
          );
          if (answer === "offline") {
            return status(404, `machine ${params.machineId} is not connected`);
          }
          if (answer === "timeout") {
            return status(504, `machine ${params.machineId} did not answer`);
          }
          if (!answer.ok) {
            return status(
              500,
              answer.error ?? "the machine could not read its config"
            );
          }
          return answer.result as import("@cawco/core").ConfigInspection;
        }
      )
      .get("/api/instances", () => boardRows())
      .post(
        "/api/followup-state",
        {
          ...hidden,
          body: t.Object({
            instanceId: t.Optional(t.String()),
            workspace: t.Optional(t.String()),
          }),
        },
        ({ body, status }) => {
          let { instanceId } = body;
          if (body.workspace) {
            const workspaces = db.workspacesNamed(body.workspace.trim());
            if (workspaces.length !== 1) {
              return status(404, `No unique workspace "${body.workspace}".`);
            }
            instanceId = db.workItemsIn(workspaces[0].id)[0]?.instanceId;
          }
          const [row] = instanceId ? db.getInstancesByIds([instanceId]) : [];
          const turns = row
            ? db.recordedTurns(row.id)
            : { hasTurns: false, lastTurnAt: null, unbounded: false };
          const activityBound =
            !!row &&
            (turns.unbounded ||
              (row.harness === "claude" && !!row.sessionId && !turns.hasTurns));
          // Activity writes are throttled; the closing pulse can land within that window.
          const lastTurnAt = activityBound
            ? new Date(
                Math.max(
                  row.updatedAt.getTime() + ACTIVITY_TOUCH_MS,
                  Date.parse(turns.lastTurnAt ?? "") || 0
                )
              ).toISOString()
            : turns.lastTurnAt;
          return {
            row: row ?? null,
            midTurn: !!(row && pulses.get(row.id)?.busy),
            hasTurns: turns.hasTurns,
            lastTurnAt,
            activityBound,
          };
        }
      )
      .post(
        "/api/instances/:id/context-size",
        hidden,
        async ({ params, status }) => {
          const [row] = db.getInstancesByIds([params.id]);
          if (!row) {
            return status(404, "Session not found");
          }
          if (row.contextTokens !== null) {
            return {
              tokens: row.contextTokens,
              readAt: (row.contextReadAt as Date).getTime(),
            };
          }
          if (row.harness !== "claude" || !row.sessionId) {
            return { reason: "no stored Claude conversation" };
          }
          const answer = await callAgent(
            row.machineId,
            CONTROL_READ_SESSION_CONTEXT,
            [row.sessionId, row.cwd],
            2000,
            "claude"
          );
          if (answer === "offline" || answer === "timeout") {
            return { reason: answer };
          }
          if (!answer.ok) {
            return { reason: answer.error ?? "transcript read failed" };
          }
          const reading = answer.result as
            | { tokens: number; readAt: number }
            | { reason: string }
            | undefined;
          if (!reading) {
            return { reason: "agent has no context reader" };
          }
          if ("tokens" in reading) {
            // A live result that arrived during this read is newer than the stored transcript.
            const [current] = db.getInstancesByIds([row.id]);
            if (current.contextTokens === null) {
              db.updateKeepAlive(row.id, {
                contextTokens: reading.tokens,
                contextReadAt: new Date(reading.readAt),
              });
            }
            const [measured] = db.getInstancesByIds([row.id]);
            return {
              tokens: measured.contextTokens,
              readAt: (measured.contextReadAt as Date).getTime(),
            };
          }
          return reading;
        }
      )
      // What these conversations are called — *whether or not the board still
      // lists them*.
      //
      // The listing is a working board: it drops a session that has not moved in
      // a day. A reader's open tabs are not a board, though — the strip carries
      // whatever they left open, and a tab the listing has aged out had no row to
      // read a name off, so the first server render called it by eight characters
      // of its id and only found the real name once the reader clicked it. The
      // name was never missing; it was filtered out. This answers by id straight
      // off the row, past the cut-off.
      //
      // Each ask is an id, or an id with a stored session's machine/cwd/harness.
      // Cheap first: a name
      // already written down costs one query for the whole batch. Only a row that
      // has never been named at all reaches for its machine, and then only if the
      // machine is connected — and what comes back is written down, so no session
      // is ever read twice for its name.
      .post(
        "/api/instances/titles",
        {
          body: t.Object({
            ids: t.Array(
              t.Union([
                t.String(),
                t.Object({
                  id: t.String(),
                  machine: t.Optional(t.Nullable(t.String())),
                  cwd: t.Optional(t.String()),
                  harness: t.Optional(t.String()),
                }),
              ])
            ),
          }),
        },
        async ({ body }) => {
          const asked = new Map<
            string,
            { id: string; machine?: string; cwd?: string; harness?: string }
          >();
          for (const ask of body.ids) {
            const one =
              typeof ask === "string"
                ? { id: ask }
                : { ...ask, machine: ask.machine ?? undefined };
            if (!one.id || asked.has(one.id)) {
              continue;
            }
            // Bounded by what a reader can plausibly have open, so a hand-written
            // body cannot turn one request into a fleet-wide transcript sweep.
            if (asked.size >= TITLE_ASK_LIMIT) {
              break;
            }
            asked.set(one.id, one);
          }
          if (asked.size === 0) {
            return [];
          }

          const rows = new Map(
            db
              .getInstancesByIds([...asked.keys()])
              .map((row) => [row.id, row] as const)
          );

          return await Promise.all(
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves every field of one supervisor answer (title, model, harness, whether it needs asking again) in one place; splitting it would scatter the fallback order this route depends on.
            [...asked.values()].map(async (ask) => {
              const row = rows.get(ask.id);
              const named = row?.title ?? row?.derivedTitle;
              if (named) {
                return { id: ask.id, title: named };
              }

              // Never named, so ask the machine that stores the conversation. A
              // machine that is not connected leaves the tab to its fallback:
              // nothing here can invent a name nobody has ever written down.
              //
              // Two mutually exclusive cases, never mixed: a hub row is the
              // single authority for its session's key, machine, folder and
              // harness (a row without a key has nothing stored to name); an
              // id without a row is a stored session key, and the ask says
              // where it lives.
              let machineId: string | undefined;
              let sessionKey: string;
              let cwd: string | undefined;
              let harness: HarnessKind | undefined;
              if (row) {
                if (!row.sessionId) {
                  return { id: ask.id, title: null };
                }
                ({ machineId } = row);
                sessionKey = row.sessionId;
                cwd = row.cwd || undefined;
                harness = (row.harness || undefined) as HarnessKind | undefined;
              } else {
                machineId = ask.machine;
                sessionKey = ask.id;
                cwd = ask.cwd || undefined;
                harness = (ask.harness || undefined) as HarnessKind | undefined;
              }
              if (!(machineId && registry.agent(machineId))) {
                return { id: ask.id, title: null };
              }

              const answer = await callAgent(
                machineId,
                CONTROL_GET_SESSION_MESSAGES,
                [sessionKey, { dir: cwd }],
                READ_TIMEOUT_MS,
                harness
              );
              if (answer === "offline" || answer === "timeout" || !answer.ok) {
                return { id: ask.id, title: null };
              }
              const first = firstTurnOf(
                Array.isArray(answer.result) ? answer.result : []
              );
              if (!first) {
                return { id: ask.id, title: null };
              }

              // Written down on the way past, so the next render of this tab is
              // the cheap path — and so is every other reader's.
              const derived = row
                ? nameFromFirstTurn(row.machineId, row.id, first)
                : deriveTitleFromFirstMessage(first);
              return { id: ask.id, title: derived || null };
            })
          );
        }
      )
      // An image a transcript referenced, by the hash of its bytes: the same
      // name can only ever mean the same picture, so the browser keeps it.
      .get("/api/media/:name", async ({ params, status }) => {
        const path = mediaFilePath(params.name);
        const file = path ? Bun.file(path) : undefined;
        if (!(file && (await file.exists()))) {
          return status(404, "no such media");
        }
        return new Response(file, {
          headers: {
            "Content-Type": mediaContentType(params.name),
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      })
      // A session's stored transcript over HTTP, which is the only way a page can
      // have one before its socket is up. The dashboard used to read history with
      // a `getSessionMessages` control over its own WebSocket, so a reload showed
      // an empty transcript until the socket reconnected and backfilled; this runs
      // the same control from here, against the machine's agent socket, and
      // streams the answer back newest-entry-first as NDJSON.
      //
      // Addressed by id alone. The hub's own row answers for a session it holds —
      // including the SDK session key, which is what the machine stores the
      // transcript under. An id with no row is a stored session key, located
      // by `locateSession`.
      //
      // The MCP servers and tools the session's newest `init` announced, as
      // stored on its row. Read when a view opens, beside its transcript: the
      // board's rows do not carry them (see boardRows). A session whose
      // harness announces neither answers empty lists.
      .get("/api/instances/:id/tooling", ({ params, status }) => {
        const [row] = db.getInstancesByIds([params.id]);
        if (!row) {
          return status(404, `no session ${params.id}`);
        }
        return row.tooling ?? { servers: [], tools: [] };
      })
      // A page of a session's transcript as blocks the hub built, newest
      // first: the newest page carries the sends waiting, the live tail, the
      // session's facts and the stream position it is consistent with, so a
      // reader subscribes with `afterSeq: seq` and applies what follows. An
      // older page is everything before `before`, a block id a newer page
      // named as its cursor. Addressed by id alone: the hub's row names a
      // session it holds, and any other id is a stored key, located.
      .get(
        "/api/instances/:id/transcript",
        {
          query: t.Object({
            limit: t.Optional(t.String()),
            before: t.Optional(t.String()),
          }),
        },
        async ({ params, query, status }) => {
          const limit =
            Number(query.limit) > 0
              ? Math.floor(Number(query.limit))
              : undefined;
          const page = await transcripts.page(params.id, limit, query.before);
          if ("gone" in page) {
            return status(
              409,
              `the transcript no longer holds block ${page.gone}`
            );
          }
          if (!("fault" in page)) {
            return page;
          }
          switch (page.fault) {
            // Named with the machine, so a reader can say which one is away
            // and hear it come back.
            case "offline":
              return new Response(page.message, {
                status: 503,
                headers: { "X-Cawco-Machine": page.machineId ?? "" },
              });
            case "missing":
              return status(404, page.message);
            case "timeout":
              return status(504, page.message);
            default:
              return status(500, page.message);
          }
        }
      )
      .patch(
        "/api/instances/:id",
        {
          body: t.Object({
            keepAlive: t.Optional(t.Boolean()),
            kind: t.Optional(
              t.Union([t.Literal("mainline"), t.Literal("scratch")])
            ),
            // Not narrowed to the modes the SDK names today: the hub stores what
            // the session reported it is answering with, whatever that grows into.
            permissionMode: t.Optional(t.String()),
            model: t.Optional(t.String()),
            /** The owner's name for it, which the session's `set_title` never replaces. */
            title: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates one multi-field patch, applies its live mode, and only then changes metadata
        async ({ params, body, status }) => {
          const { kind, permissionMode, model } = body;
          const title = body.title?.trim();
          if (body.title !== undefined && !title) {
            return status(400, "title is blank");
          }
          if (
            kind === undefined &&
            permissionMode === undefined &&
            model === undefined &&
            title === undefined &&
            body.keepAlive === undefined
          ) {
            return status(400, "name a field to change");
          }
          const [current] = db.getInstancesByIds([params.id]);
          if (!current) {
            return status(404, `no session ${params.id}`);
          }
          if (body.keepAlive !== undefined && current.harness !== "claude") {
            return status(409, "Keep-alive is for Claude sessions");
          }
          if (body.keepAlive !== undefined) {
            db.updateKeepAlive(params.id, {
              keepAliveEnabled: body.keepAlive,
              keepAliveStopped: null,
              ...(body.keepAlive ? { keepAliveSent: 0 } : {}),
            });
          }
          if (permissionMode !== undefined) {
            const refused = await applyPermissionMode(current, permissionMode);
            if (refused) {
              return status(refused.code, refused.error);
            }
          }
          const named = title
            ? db.nameInstance(params.id, title, "owner")?.row
            : undefined;
          if (title && !named) {
            return status(404, `no session ${params.id}`);
          }
          // A rename alone is not the session moving: its age stays.
          const row =
            kind === undefined && model === undefined
              ? (named ?? db.getInstancesByIds([params.id])[0])
              : db.patchInstance(params.id, { kind, model });
          if (!row) {
            return status(404, `no session ${params.id}`);
          }
          publishInstances(row.machineId);
          // biome-ignore lint/complexity/noVoid: the stored toggle re-arms through the scheduler's one path
          void keepAliveScheduler.wake();
          return withKeepAlive([row])[0];
        }
      )
      // The owner looked at these (a tab in front, after it ended) or
      // archived them off Finished. Sessions by id, workflow runs as
      // `run:<id>`, the dashboard's own address for a run. Every dashboard
      // hears it on the frames it already reads: the instance list, a run's
      // workflow frame.
      .post(
        "/api/seen",
        {
          body: t.Object({
            ids: t.Array(t.String(), { minItems: 1 }),
            /**
             * `archive`: taken off Finished without opening it, refused for
             * anything still doing something (`archiveRefusal`). `look`: the
             * owner had it in front after it ended, which is always so.
             * `unarchive`: clears the mark, so a session that ended is in
             * Finished again; keep-alive stays as it is.
             */
            kind: t.Union([
              t.Literal("archive"),
              t.Literal("look"),
              t.Literal("unarchive"),
            ]),
          }),
        },
        ({ body, status }) => {
          if (body.kind === "archive") {
            const view = archiveView();
            const refused = body.ids.flatMap((id) => {
              const why = archiveRefusal(id, view);
              return why ? [`${id}: ${why}`] : [];
            });
            if (refused.length > 0) {
              return status(
                409,
                `Not archived, still doing something. ${refused.join(" ")}`
              );
            }
          }
          const runIds = body.ids.flatMap((id) =>
            id.startsWith("run:") ? [id.slice(4)] : []
          );
          const instanceIds = body.ids.filter((id) => !id.startsWith("run:"));
          if (body.kind === "archive") {
            for (const id of instanceIds) {
              db.updateKeepAlive(id, {
                keepAliveEnabled: false,
                keepAliveStopped: null,
              });
            }
          }
          const at = body.kind === "unarchive" ? null : new Date();
          const seen = db.markSeen(instanceIds, runIds, at);
          for (const machineId of new Set(
            seen.instances.map((row) => row.machineId)
          )) {
            publishInstances(machineId);
          }
          for (const run of seen.runs) {
            workflowRuntime.announce(run);
          }
          return { at: at?.getTime() ?? null };
        }
      )
      // The session naming itself (`set_title`). Refused, with the owner's
      // name in the answer, once the owner has renamed it.
      .post(
        "/api/instances/:id/title",
        { ...hidden, body: t.Object({ title: t.String() }) },
        ({ params, body, status }) => {
          const title = body.title.trim();
          const problem = titleProblem(title);
          if (problem) {
            return status(400, problem);
          }
          const result = db.nameInstance(params.id, title, "agent");
          if (!result) {
            return status(404, `no session ${params.id}`);
          }
          if (!result.named) {
            return status(
              409,
              `The owner named this session "${result.row.title}", so set_title leaves it alone. Carry on with the task; do not call set_title again.`
            );
          }
          publishInstances(result.row.machineId);
          return `Named this session "${title}".`;
        }
      )
      // Broadcast on change *and* readable on connect: a dashboard that opens
      // after a hand-off went out would otherwise show nothing until the next
      // time anything else moved.
      .get("/api/handoffs", () => Object.fromEntries(handoffs))
      .get("/api/pending", () => pending.list())
      .get(
        "/api/search",
        {
          query: t.Object({
            q: t.String(),
            limit: t.Optional(t.String()),
            role: t.Optional(t.String()),
          }),
        },
        async ({ query, status }) => {
          const q = query.q.trim();
          if (!q) {
            return status(400, "missing query");
          }
          const limit = Math.min(Math.max(1, Number(query.limit) || 20), 50);
          // Who wrote the line. Anything else is no filter rather than an
          // error: a reader who mistypes it gets everything, not nothing.
          const role =
            query.role === "user" || query.role === "assistant"
              ? query.role
              : undefined;
          const machineIds = registry.machineIds();
          if (machineIds.length === 0) {
            return { hits: [], machines: 0 };
          }
          const results = await Promise.all(
            machineIds.map(async (mid) => {
              const answer = await callAgent(
                mid,
                CONTROL_SEARCH_TRANSCRIPTS,
                [q, { limit, ...(role ? { role } : {}) }],
                1500
              );
              if (answer === "offline" || answer === "timeout" || !answer.ok) {
                return [];
              }
              return (answer.result as SearchHitWire[]).map((hit) => ({
                ...hit,
                machineId: mid,
              }));
            })
          );
          const merged = results
            .flat()
            .sort((a, b) => a.score - b.score)
            .slice(0, limit);
          // Annotate with instance id where the hub knows the session.
          const sessionCache = new Map<string, string | null>();
          for (const hit of merged) {
            if (!sessionCache.has(hit.sessionId)) {
              const row = db.instanceBySessionId(hit.sessionId);
              sessionCache.set(hit.sessionId, row ? row.id : null);
            }
            const instanceId = sessionCache.get(hit.sessionId);
            if (instanceId) {
              (hit as SearchHitWire & { instanceId?: string }).instanceId =
                instanceId;
            }
          }
          return { hits: merged, machines: machineIds.length };
        }
      )
      // What a delegate and its parent said to each other, oldest first. Broadcast
      // as it happens *and* readable here, for the same reason the hand-offs are:
      // an exchange that finished before this tab opened is still the record.
      .get(
        "/api/delegate-events",
        {
          query: t.Object({
            parent: t.Optional(t.String()),
            instance: t.Optional(t.String()),
          }),
        },
        ({ query, status }) => {
          if (!(query.parent || query.instance)) {
            return status(400, "name a parent or an instance");
          }
          return db.listDelegateEvents(query);
        }
      )
      // A parent's delegate tray as it opens; `work_item` frames keep it live.
      .get(
        "/api/work-items",
        { query: t.Object({ parent: t.String() }) },
        ({ query }) => workItems.trayOf(query.parent)
      )
      // Dismissed from the tray: gone from it on every screen, and after reload.
      .post("/api/work-items/:id/dismiss", ({ params, status }) => {
        const item = workItems.dismiss(params.id);
        return item ?? status(404, `no work item ${params.id}`);
      })
      // The catalog is code, so it ships with the answer rather than being stored:
      // a dashboard reads what tools exist and what the fleet has decided about
      // them here, and each machine's own status off the `instances` frame.
      .get("/api/tools", () => ({
        catalog: TOOL_CATALOG,
        policies: db.listToolPolicies(),
      }))
      .put(
        "/api/tools/:id",
        {
          body: t.Object({
            required: t.Optional(t.Boolean()),
            pinnedVersion: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
        ({ params, body, status }) => {
          const spec = toolSpec(params.id);
          // A tool that only exists to satisfy a `requires` is not something the
          // fleet has an opinion about — it arrives with whatever needs it.
          if (!spec || spec.dependencyOnly) {
            return status(404, `no tool ${params.id}`);
          }

          const policy = db.putToolPolicy(params.id, body);
          // The click: every machine that is online and missing it starts now,
          // rather than whenever it next happens to reconnect.
          if (policy.required) {
            for (const machineId of registry.machineIds()) {
              const agent = registry.agent(machineId);
              if (agent) {
                autoInstall(machineId, agent);
              }
            }
          }
          return policy;
        }
      )
      // The fleet's desired state (NEW.md §11), every table at once: it is one
      // page in the dashboard and one `syncFleetConfig` on a machine.
      //
      // The skills come back as rows rather than as part of the config: what the
      // machines get carries every skill's files, and a page that only lists them
      // must not weigh what the fleet weighs. The subagents do carry their files —
      // a definition is a page of markdown, and an editor that has to fetch each
      // one again is a round trip for nothing.
      .get("/api/fleet", async () => {
        await mcpReady;
        await fleetMcp.ready();
        const { mcp, marketplaces } = db.fleetConfig();
        return {
          // The plugins come from `listPlugins`, not from `fleetConfig`: the
          // config is what a MACHINE is sent, and it carries neither the hash a
          // resolve produced nor the sentence a failed one left. The dashboard
          // needs both — a plugin the hub could not fetch and a plugin a machine
          // would not install are different faults with different fixes.
          config: { mcp, marketplaces, plugins: db.listPlugins() },
          skills: db.listSkills(),
          agents: db.listFleetAgents(),
          memory: db.getFleetMemory() ?? null,
          // The linked documents carry their files for the same reason the
          // subagents do: each one is a page of markdown, and the panel that
          // lists them is the panel that edits them.
          memoryDocs: db.listFleetMemoryDocs(),
          unpushable: Object.fromEntries(unpushable),
        };
      })
      .put(
        "/api/fleet/mcp/:name",
        {
          body: t.Object({
            // Stored and written verbatim, so the schema only asks that it be an
            // object; `mcpProblem` checks the one field that makes it startable.
            config: t.Record(t.String(), t.Unknown()),
            enabled: t.Optional(t.Boolean()),
          }),
        },
        async ({ params, body, status }) => {
          const problem = mcpProblem(params.name, body.config);
          if (problem) {
            return status(400, problem);
          }

          db.putMcpServer({
            name: params.name,
            config: body.config as unknown as FleetMcpConfig,
            enabled: body.enabled,
          });
          await fleetMcp.probe(params.name);
          announceMcp();
          const saved = db
            .fleetConfig()
            .mcp.find((row) => row.name === params.name);
          if (!saved) {
            return status(404, "MCP server was removed while probing.");
          }
          return saved;
        }
      )
      .delete("/api/fleet/mcp/:name", ({ params }) => {
        db.deleteMcpServer(params.name);
        announceMcp();
        return { ok: true };
      })
      .post(
        "/api/fleet/mcp/:name/sign-in",
        { body: t.Object({ origin: t.String({ minLength: 1 }) }) },
        async ({ params, body, status }) => {
          // The authorization server redirects the browser that signs in, so the
          // redirect is under the origin that browser reached the dashboard by:
          // a phone's tailnet address works where a loopback port never could.
          let origin: URL;
          try {
            origin = new URL(body.origin);
          } catch {
            return status(
              400,
              "The browser did not say where it reached CawCo."
            );
          }
          if (origin.protocol !== "http:" && origin.protocol !== "https:") {
            return status(
              400,
              "Sign-in needs an HTTP or HTTPS dashboard address."
            );
          }
          try {
            return await fleetMcp.start(
              params.name,
              `${origin.origin}${MCP_OAUTH_RETURN_PATH}`
            );
          } catch (error) {
            return status(
              400,
              error instanceof Error
                ? error.message
                : "Sign-in could not start. Save this server and retry sign-in."
            );
          }
        }
      )
      .post(
        "/api/fleet/mcp/oauth/complete",
        {
          body: t.Object({
            code: t.String({ minLength: 1 }),
            state: t.String({ minLength: 1 }),
            iss: t.Optional(t.String()),
          }),
        },
        async ({ body, status }) => {
          try {
            return await fleetMcp.complete(body.code, body.state, body.iss);
          } catch (error) {
            return status(
              400,
              error instanceof Error
                ? error.message
                : "Sign-in could not finish. Start sign-in again."
            );
          }
        }
      )
      /**
       * Rules: standing instructions the hub enforces on the frame stream. The
       * shape is validated loosely here and strictly by `ruleProblem`, which is
       * the same validator the editor refuses with — one set of sentences, so the
       * form and the hub never disagree about what is wrong.
       */
      .get("/api/rules", () => {
        const stats = new Map(db.ruleStats().map((row) => [row.ruleId, row]));
        return {
          rules: db.listRules().map((rule) => ({
            ...rule,
            stats: stats.get(rule.id) ?? {
              ruleId: rule.id,
              pending: 0,
              totalFires: 0,
              lastFiredAt: null,
            },
          })),
          templates: RULE_TEMPLATES,
        };
      })
      .post("/api/rules", { body: ruleBody }, ({ body, status }) => {
        const draft = body as unknown as RuleDraft;
        const wrong = ruleProblem(draft);
        const [first] = Object.values(wrong);
        if (first) {
          return status(400, first);
        }
        // The hub mints the id: the client never invents identity, it asks for it.
        const rule: Rule = {
          ...draft,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        db.putRule(rule);
        ruleEngine.reload();
        return rule;
      })
      .put("/api/rules/:id", { body: ruleBody }, ({ params, body, status }) => {
        const draft = body as unknown as RuleDraft;
        const wrong = ruleProblem(draft);
        const [first] = Object.values(wrong);
        if (first) {
          return status(400, first);
        }
        // Strictly an edit: an id this hub never minted is a caller's mistake,
        // not an invitation to upsert.
        const existing = db.getRule(params.id);
        if (!existing) {
          return status(404, `there is no rule ${params.id} to edit`);
        }
        const rule: Rule = {
          ...draft,
          id: params.id,
          createdAt: existing.createdAt,
        };
        db.putRule(rule);
        ruleEngine.reload();
        return rule;
      })
      .delete("/api/rules/:id", ({ params }) => {
        db.deleteRule(params.id);
        ruleEngine.reload();
        return { ok: true };
      })
      /**
       * What a rule has actually been doing, per session: fires, and whether
       * each session is still pending on it. A session never sees the rule's
       * fire count, so this listing is the only window onto it.
       */
      .get("/api/rules/:id/activity", ({ params, status }) => {
        const rule = db.getRule(params.id);
        if (!rule) {
          return status(404, "That rule no longer exists.");
        }
        const named = new Map(db.listInstances().map((row) => [row.id, row]));
        return {
          activity: db.ruleStatesFor(params.id).map((state) => {
            const row = named.get(state.instanceId);
            return {
              ...state,
              where: row ? leaf(row.cwd) : "a session that is gone",
              harness: row?.harness ?? null,
            };
          }),
        };
      })
      // ── OpenRouter (OAuth PKCE; the key never leaves the hub) ─────────────
      .get("/api/openrouter", () => {
        const connection = db.getOpenRouterConnection();
        return {
          connected: connection !== undefined,
          connectedAt: connection?.connectedAt.getTime() ?? null,
          suggestWhileTyping: connection?.suggestWhileTyping ?? false,
        };
      })
      .put(
        "/api/openrouter/suggest",
        { body: t.Object({ enabled: t.Boolean() }) },
        ({ body, status }) => {
          if (!db.getOpenRouterConnection()) {
            return status(
              409,
              "OpenRouter is not connected. Connect it in Settings first."
            );
          }
          db.setSuggestWhileTyping(body.enabled);
          return { ok: true };
        }
      )
      .post(
        "/api/suggest",
        {
          body: t.Object({
            text: t.String(),
            candidates: t.Array(
              t.Object({
                id: t.String(),
                kind: t.Union([
                  t.Literal("skill"),
                  t.Literal("tool"),
                  t.Literal("mcp"),
                ]),
                name: t.String(),
                description: t.String(),
              })
            ),
          }),
        },
        async ({ body, status }) => {
          const connection = db.getOpenRouterConnection();
          if (!connection) {
            return status(
              409,
              "OpenRouter is not connected. Connect it in Settings first."
            );
          }
          const result = await suggest(
            db,
            connection.apiKey,
            body.text,
            body.candidates
          );
          if ("error" in result) {
            return status(502, result.error);
          }
          return result;
        }
      )
      .post(
        "/api/openrouter/connect",
        { body: t.Object({ callbackUrl: t.String() }) },
        ({ body }) => {
          openrouterVerifier = generateCodeVerifier();
          const auth = new URL("https://openrouter.ai/auth");
          auth.searchParams.set("callback_url", body.callbackUrl);
          auth.searchParams.set(
            "code_challenge",
            generateCodeChallenge(openrouterVerifier)
          );
          auth.searchParams.set("code_challenge_method", "S256");
          return { authUrl: auth.toString() };
        }
      )
      .post(
        "/api/openrouter/exchange",
        { body: t.Object({ code: t.String() }) },
        async ({ body, status }) => {
          if (!openrouterVerifier) {
            return status(
              409,
              "No OpenRouter connect is in progress on this hub. Start again from Settings."
            );
          }
          const response = await fetch(
            "https://openrouter.ai/api/v1/auth/keys",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                code: body.code,
                code_verifier: openrouterVerifier,
                code_challenge_method: "S256",
              }),
            }
          );
          if (!response.ok) {
            return new Response(await response.text(), {
              status: response.status,
            });
          }
          const { key } = (await response.json()) as { key: string };
          db.setOpenRouterConnection(key);
          openrouterVerifier = undefined;
          return { ok: true };
        }
      )
      .delete("/api/openrouter", () => {
        db.clearOpenRouterConnection();
        return { ok: true };
      })
      // ── supervisor ────────────────────────────────────────────────────────
      .get("/api/supervisor", async () => {
        const dbConfig = db.getSupervisorConfig();
        const baseUrl = dbConfig?.baseUrl || null;
        const model = dbConfig?.model || null;
        const enabled = dbConfig?.enabled ?? false;

        const config = {
          enabled,
          baseUrl,
          model,
        };

        if (!(baseUrl && model)) {
          return { config, status: { configured: false } };
        }

        const probeResult = await probe(baseUrl, model);
        return {
          config,
          status: {
            configured: true,
            reachable: probeResult.reachable,
            ...(probeResult.resolvedModel
              ? { resolvedModel: probeResult.resolvedModel }
              : {}),
          },
        };
      })
      .put(
        "/api/supervisor/config",
        {
          body: t.Object({
            enabled: t.Boolean(),
            baseUrl: t.String(),
            model: t.String(),
            apiKey: t.Optional(t.String()),
          }),
        },
        ({ body }) => {
          db.putSupervisorConfig({
            enabled: body.enabled,
            baseUrl: body.baseUrl,
            model: body.model,
            ...(body.apiKey === undefined ? {} : { apiKey: body.apiKey }),
          });
          return { ok: true };
        }
      )
      .get(
        "/api/supervisor/events",
        {
          query: t.Object({
            instanceId: t.Optional(t.String()),
            limit: t.Optional(t.Integer({ minimum: 1, default: 100 })),
          }),
        },
        ({ query }) => db.listSupervisorEvents(query)
      )
      .put(
        "/api/autopilot/:instanceId",
        { body: t.Object({ enabled: t.Boolean(), prompt: t.String() }) },
        ({ params, body, status }) => {
          if (body.enabled && body.prompt.trim().length < 10) {
            return status(
              400,
              "A standing prompt of under ten characters is not one — say what the autopilot should watch for."
            );
          }
          const row = db
            .listInstances()
            .find((r) => r.id === params.instanceId);
          if (!row) {
            return status(404, "No such session.");
          }
          db.setInstanceAutopilot(params.instanceId, {
            enabled: body.enabled,
            prompt: body.prompt.trim(),
            updatedAt: Date.now(),
          });
          publishInstances(row.machineId);
          return { ok: true };
        }
      )
      .put(
        "/api/fleet/marketplaces/:name",
        { body: t.Object({ source: t.String() }) },
        ({ params, body }) => {
          const marketplace = db.putMarketplace({
            name: params.name,
            source: body.source,
          });
          fanOutFleet();
          return marketplace;
        }
      )
      .delete("/api/fleet/marketplaces/:name", ({ params }) => {
        db.deleteMarketplace(params.name);
        fanOutFleet();
        return { ok: true };
      })
      .put(
        "/api/fleet/plugins/:id",
        { body: t.Object({ enabled: t.Optional(t.Boolean()) }) },
        ({ params, body }) => {
          const plugin = db.putPlugin({ id: params.id, enabled: body.enabled });
          // Fetched before the machines are told about it, so the first sync that
          // reaches them already carries the files rather than a name to go and
          // resolve. A fetch that fails leaves its sentence on the row and the
          // fan-out still happens — the fleet is not held up by one plugin.
          // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the route returns immediately and the resolve/fan-out continues after the response is sent.
          void resolvePlugins([params.id]).finally(() => fanOutFleet());
          return plugin;
        }
      )
      // Re-fetch one plugin's bytes. The same verb a skill has, and the way a
      // fleet takes a new version of something upstream moved: nothing else
      // re-resolves on its own, because a plugin that resolved once is a plugin
      // every machine already agrees on.
      .post("/api/fleet/plugins/:id/refresh", async ({ params, status }) => {
        const known = db.listPlugins().some(({ id }) => id === params.id);
        if (!known) {
          return status(404, `no plugin ${params.id} in this fleet`);
        }
        await resolvePlugins([params.id]);
        fanOutFleet();
        // The row itself, not `{ ok: true }`: a retry whose answer does not say
        // whether it resolved is a retry the reader has to reload to read.
        const row = db.listPlugins().find(({ id }) => id === params.id);
        return row ?? status(404, `no plugin ${params.id} in this fleet`);
      })
      .delete("/api/fleet/plugins/:id", ({ params }) => {
        db.deletePlugin(params.id);
        fanOutFleet();
        return { ok: true };
      })
      // A plain skill is resolved here and now, once for the whole fleet: the hub
      // downloads it, and the machines are handed the files (NEW.md §11). A source
      // that would not resolve is still stored — the row is where the dashboard
      // reads why, and the ambiguous case answers with what it could have meant.
      //
      // `fromMachine` is the other way in: a skill somebody wrote on one machine,
      // read off it and stored like any fetched one, so it reaches the rest.
      .put(
        "/api/fleet/skills/:name",
        {
          body: t.Object({
            source: t.Optional(t.String()),
            enabled: t.Optional(t.Boolean()),
            fromMachine: t.Optional(t.String()),
            /** The checkout a project-scoped skill was discovered in. */
            cwd: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves a skill from any of its source shapes (url/npm/repo/fromMachine) in one place; splitting it would scatter the validation order this route depends on.
        async ({ params, body, status }) => {
          if (!SKILL_NAME.test(params.name)) {
            return status(400, `${params.name} is not a usable skill name`);
          }

          if (body.fromMachine) {
            const answer = await callAgent(
              body.fromMachine,
              READ_SKILL_FILES,
              [params.name, body.cwd],
              READ_TIMEOUT_MS
            );
            if (answer === "offline") {
              return status(
                404,
                `machine ${body.fromMachine} is not connected`
              );
            }
            if (answer === "timeout") {
              return status(504, `machine ${body.fromMachine} did not answer`);
            }
            if (!answer.ok) {
              return status(
                400,
                answer.error ?? "the machine could not read the skill"
              );
            }

            const files = answer.result as SkillFile[];
            const skill = db.putSkill({
              name: params.name,
              source: `machine:${body.fromMachine}`,
              enabled: body.enabled,
              hash: hashFiles(files),
              bytes: files.reduce(
                (total, file) =>
                  total + Buffer.byteLength(file.contentBase64, "base64"),
                0
              ),
              files,
            });
            fanOutFleet();
            return skill;
          }

          if (!body.source) {
            return status(
              400,
              "name a source, or the machine to adopt it from"
            );
          }

          const resolved = await resolveSkill(body.source);
          const skill = db.putSkill({
            name: params.name,
            source: body.source,
            enabled: body.enabled,
            ...("error" in resolved
              ? { error: resolved.error }
              : {
                  hash: resolved.hash,
                  bytes: resolved.bytes,
                  files: resolved.files,
                }),
          });
          // Nothing on any machine changed unless there are files to change it with.
          if (!("error" in resolved)) {
            fanOutFleet();
          }
          return "choices" in resolved && resolved.choices
            ? { ...skill, choices: resolved.choices }
            : skill;
        }
      )
      // The same source, fetched again — for a skill whose repo has moved on.
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves and re-diffs every field of a refreshed skill in one place; splitting it would scatter the validation order this route depends on.
      .post("/api/fleet/skills/:name/refresh", async ({ params, status }) => {
        const stored = db
          .listSkills()
          .find((entry) => entry.name === params.name);
        if (!stored) {
          return status(404, `no skill ${params.name}`);
        }

        // An adopted skill's source is the machine it came off, so that is where
        // "the same source, again" reads from.
        if (stored.source.startsWith("machine:")) {
          const machineId = stored.source.slice("machine:".length);
          const answer = await callAgent(
            machineId,
            READ_SKILL_FILES,
            [stored.name],
            READ_TIMEOUT_MS
          );
          if (answer === "offline") {
            return status(404, `machine ${machineId} is not connected`);
          }
          if (answer === "timeout") {
            return status(504, `machine ${machineId} did not answer`);
          }
          if (!answer.ok) {
            return status(
              400,
              answer.error ?? "the machine could not read the skill"
            );
          }

          const files = answer.result as SkillFile[];
          const skill = db.putSkill({
            name: stored.name,
            source: stored.source,
            enabled: stored.enabled,
            hash: hashFiles(files),
            bytes: files.reduce(
              (total, file) =>
                total + Buffer.byteLength(file.contentBase64, "base64"),
              0
            ),
            files,
          });
          if (skill.hash !== stored.hash) {
            fanOutFleet();
          }
          return skill;
        }

        const resolved = await resolveSkill(stored.source);
        const skill = db.putSkill({
          name: stored.name,
          source: stored.source,
          enabled: stored.enabled,
          ...("error" in resolved
            ? { error: resolved.error }
            : {
                hash: resolved.hash,
                bytes: resolved.bytes,
                files: resolved.files,
              }),
        });
        if (skill.hash !== stored.hash) {
          fanOutFleet();
        }
        return skill;
      })
      .delete("/api/fleet/skills/:name", ({ params }) => {
        db.deleteSkill(params.name);
        fanOutFleet();
        return { ok: true };
      })
      // A subagent is its markdown file (NEW.md §11): front matter over a body
      // that becomes the system prompt. The file is stored verbatim, and the only
      // thing parsed out of it is what a broken one has to be refused on — the
      // name a delegation asks for, and the description it decides to delegate on.
      .put(
        "/api/fleet/agents/:name",
        { body: t.Object({ content: t.String() }) },
        ({ params, body, status }) => {
          const problem = agentProblem(
            parseAgentFrontMatter(body.content),
            params.name
          );
          if (problem) {
            return status(400, problem);
          }

          const agent = db.putFleetAgent({
            name: params.name,
            content: body.content,
          });
          fanOutAgents();
          return agent;
        }
      )
      // Forgotten here, and left where it is out there: the `fs` verb has list,
      // read and write and no delete, so every machine keeps the file until Phase
      // B's daemon-side sync can take it away. Discovery then shows the leftover
      // as unmanaged, which is the truth rather than a comforting silence.
      .delete("/api/fleet/agents/:name", ({ params }) => {
        db.deleteFleetAgent(params.name);
        return { ok: true };
      })
      // The click for a machine that was asleep when a definition was written, and
      // for one whose home the hub could only work out later. Awaited, so the
      // answer carries what this attempt could not reach rather than the last one.
      .post("/api/fleet/agents/push", async () => {
        await Promise.all(
          registry.machineIds().map((machineId) => pushAgents(machineId))
        );
        return { ok: true, unpushable: Object.fromEntries(unpushable) };
      })
      // The fleet's user-scope memory (NEW.md §11): the main CLAUDE.md every
      // session loads flat, and the documents it links under
      // `~/.claude/memories/` — each hash-synced to every machine like a skill's
      // files are, and each drifting on its own.
      //
      // `expectedHash` is what the writer had in front of them. A save against a
      // row somebody else has moved answers with what is really there rather than
      // taking the last writer's word for it — two dashboards on one document is
      // the ordinary case here, not the exotic one.
      .put(
        "/api/fleet/memory",
        {
          body: t.Object({
            content: t.String(),
            expectedHash: t.Optional(t.String()),
          }),
        },
        ({ body, status }) => {
          const current = db.getFleetMemory();
          if (
            body.expectedHash !== undefined &&
            current &&
            current.hash !== body.expectedHash
          ) {
            return status(409, current);
          }
          keepReplacedMemory(body.content);
          const memory = db.setFleetMemory(body.content);
          fanOutFleet();
          return memory;
        }
      )
      // The machines take back only what their own sidecar says cawco wrote:
      // one edited by hand on a machine stays there, unmanaged. The set goes with
      // it — a linked document with no main file to link it is not a memory, and
      // the machines would keep converging on documents nothing points at.
      .delete("/api/fleet/memory", () => {
        for (const doc of db.listFleetMemoryDocs()) {
          keepRemovedDoc(doc);
          db.deleteFleetMemoryDoc(doc.path);
        }
        db.clearFleetMemory();
        fanOutFleet();
        return { ok: true };
      })
      // One linked document. Same save as the main file's, keyed by the path it
      // lands at — `models/claude-opus-5.md` is the same string on every machine,
      // which is what makes it the row's identity.
      .put(
        "/api/fleet/memory/docs",
        {
          body: t.Object({
            path: t.String(),
            content: t.String(),
            expectedHash: t.Optional(t.String()),
          }),
        },
        ({ body, status }) => {
          const problem = memoryDocProblem(body.path);
          if (problem) {
            return status(400, problem);
          }

          const current = db.getFleetMemoryDoc(body.path);
          if (
            body.expectedHash !== undefined &&
            current &&
            current.hash !== body.expectedHash
          ) {
            return status(409, current);
          }
          keepReplacedDoc(body.path, body.content);
          const doc = db.putFleetMemoryDoc({
            path: body.path,
            content: body.content,
          });
          fanOutFleet();
          return doc;
        }
      )
      // Kept before it goes, like every other version this hub replaces: the
      // machines give the file back, and the fleet's copy of it was the last one.
      .delete(
        "/api/fleet/memory/docs",
        { body: t.Object({ path: t.String() }) },
        ({ body, status }) => {
          const current = db.getFleetMemoryDoc(body.path);
          if (!current) {
            return status(404, `the fleet keeps no ${body.path}`);
          }

          keepRemovedDoc(current);
          db.deleteFleetMemoryDoc(body.path);
          fanOutFleet();
          return { ok: true };
        }
      )
      // What one machine really has, without touching anything: the read behind
      // "compare", so a reader chooses between two documents by looking at them.
      .post(
        "/api/fleet/memory/peek",
        { body: t.Object({ machineId: t.String() }) },
        async ({ body, status }) => {
          const read = await readMachineMemory(body.machineId);
          if (!read.ok) {
            return status(read.code, read.said);
          }
          // 204: the machine has no user CLAUDE.md.
          return read.copy ?? status(204);
        }
      )
      // The first document has to come from somewhere, and a machine that has been
      // collecting one for a year is where it is. Read off that machine and stored
      // as the fleet's, which every other machine then gets.
      //
      // Whole set by default: the main file and every document beside it, with
      // the fleet's own leftovers taken away — an adoption that left them behind
      // would push them straight back at the machine they were adopted from.
      // `path` narrows it to the one document, for the drifted row that is the
      // only thing being settled.
      .post(
        "/api/fleet/memory/adopt",
        {
          body: t.Object({
            machineId: t.String(),
            path: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates and merges every field of an adopted memory doc in one place; splitting it would scatter the validation order this route depends on.
        async ({ body, status }) => {
          const read = await readMachineMemory(body.machineId);
          if (!read.ok) {
            return status(read.code, read.said);
          }
          if (!read.copy) {
            return status(
              404,
              `machine ${body.machineId} has no user CLAUDE.md`
            );
          }

          if (body.path !== undefined) {
            const problem = memoryDocProblem(body.path);
            if (problem) {
              return status(400, problem);
            }

            const theirs = (read.copy.docs ?? []).find(
              (entry) => entry.path === body.path
            );
            if (!theirs) {
              return status(
                404,
                `machine ${body.machineId} has no ${body.path}`
              );
            }

            keepReplacedDoc(body.path, theirs.content);
            const doc = db.putFleetMemoryDoc({
              path: body.path,
              content: theirs.content,
            });
            fanOutFleet();
            return doc;
          }

          keepReplacedMemory(read.copy.content);
          // A daemon that predates the set answers without `docs`, and taking
          // that for "this machine links none" would quietly empty the fleet's.
          for (const doc of read.copy.docs ?? []) {
            if (memoryDocProblem(doc.path)) {
              continue;
            }
            keepReplacedDoc(doc.path, doc.content);
            db.putFleetMemoryDoc({ path: doc.path, content: doc.content });
          }
          if (read.copy.docs) {
            const theirs = new Set(read.copy.docs.map((doc) => doc.path));
            for (const doc of db.listFleetMemoryDocs()) {
              if (theirs.has(doc.path)) {
                continue;
              }
              keepRemovedDoc(doc);
              db.deleteFleetMemoryDoc(doc.path);
            }
          }

          const memory = db.setFleetMemory(read.copy.content);
          fanOutFleet();
          return memory;
        }
      )
      // And the other direction, for the machine whose copy was edited: a sync
      // that is allowed to overwrite it, sent at that machine alone.
      //
      // The machine is read first, and a machine that will not answer stops the
      // push: what an overwrite destroys exists nowhere else, so it is kept here
      // before it goes rather than mourned afterwards. `path` forces the one
      // document, so settling a drifted `models/…` does not also overwrite a main
      // file the reader never looked at.
      .post(
        "/api/fleet/memory/push",
        {
          body: t.Object({
            machineId: t.String(),
            path: t.Optional(t.String()),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates and pushes every field of a memory write in one place; splitting it would scatter the validation order this route depends on.
        async ({ body, status }) => {
          const agent = registry.agent(body.machineId);
          if (!agent) {
            return status(404, `machine ${body.machineId} is not connected`);
          }

          const config = db.fleetConfig();
          if (!config.memory) {
            return status(400, "the fleet keeps no memory to push");
          }

          const read = await readMachineMemory(body.machineId);
          if (!read.ok) {
            return status(read.code, read.said);
          }

          const kept = (
            path: string | undefined,
            hash: string,
            content: string
          ): void => {
            db.recordFleetMemory({
              content,
              hash,
              source: `machine:${body.machineId}`,
              ...(path ? { path } : {}),
            });
          };
          const forced = body.path;
          if (
            read.copy &&
            forced === undefined &&
            read.copy.hash !== config.memory.hash
          ) {
            kept(undefined, read.copy.hash, read.copy.content);
          }
          for (const theirs of read.copy?.docs ?? []) {
            if (forced !== undefined && theirs.path !== forced) {
              continue;
            }
            const ours = config.memory.docs?.find(
              (doc) => doc.path === theirs.path
            );
            if (ours && ours.hash !== theirs.hash) {
              kept(theirs.path, theirs.hash, theirs.content);
            }
          }

          pushFleetConfig(body.machineId, agent, {
            ...config,
            memory: {
              ...config.memory,
              ...(forced === undefined ? { force: true } : {}),
              ...(config.memory.docs
                ? {
                    docs: config.memory.docs.map((doc) =>
                      forced === undefined || doc.path === forced
                        ? { ...doc, force: true }
                        : doc
                    ),
                  }
                : {}),
            },
          });
          publishInstances(body.machineId);
          return { ok: true };
        }
      )
      // What the memory used to say, newest first. Without the content: the list
      // is read on every open of the panel, and a version is read on a click.
      //
      // One document at a time: `?path=` for a linked one, and the main file when
      // nothing is named — which is what every version written before the set is.
      .get(
        "/api/fleet/memory/history",
        { query: t.Object({ path: t.Optional(t.String()) }) },
        ({ query }) => db.listFleetMemoryHistory(query.path)
      )
      .get("/api/fleet/memory/history/:id", ({ params, status }) => {
        const version = db.fleetMemoryVersion(Number(params.id));
        return version ?? status(404, `no memory version ${params.id}`);
      })
      // Undo, through the same door as a save — so what restoring replaces is
      // itself kept, and a restore of the wrong version is undone the same way.
      // A version goes back where it came from: the document it was a version of,
      // or the main file, which is what a version with no path is.
      .post(
        "/api/fleet/memory/restore",
        { body: t.Object({ id: t.Number() }) },
        ({ body, status }) => {
          const version = db.fleetMemoryVersion(body.id);
          if (!version) {
            return status(404, `no memory version ${body.id}`);
          }

          if (version.path !== undefined) {
            keepReplacedDoc(version.path, version.content);
            const doc = db.putFleetMemoryDoc({
              path: version.path,
              content: version.content,
            });
            fanOutFleet();
            return doc;
          }

          keepReplacedMemory(version.content);
          const memory = db.setFleetMemory(version.content);
          fanOutFleet();
          return memory;
        }
      )
      /**
       * Hooks (NEW.md §11): the one fleet row that is executable, so the gate
       * here is `hookProblem` — the same validator the editor refuses a save
       * with — rather than the loose shape checks a config blob gets elsewhere.
       * A hook that passed the editor's own test box and still fails here would
       * be a hub disagreeing with itself about what is safe to run.
       */
      .get("/api/fleet/hooks", () => ({
        hooks: db.listFleetHooks(),
        templates: HOOK_TEMPLATES,
      }))
      .put(
        "/api/fleet/hooks/:id",
        {
          // A partial update: every field is optional, a given one replaces the
          // stored value, `null` clears an optional one, and an absent one
          // keeps what is stored. The merged hook is what gets validated.
          body: t.Object({
            name: t.Optional(t.String()),
            enabled: t.Optional(t.Boolean()),
            event: t.Optional(t.String()),
            matcher: t.Optional(t.Nullable(t.String())),
            // Stored and written verbatim, so the schema only asks that it be an
            // object; `hookProblem` checks the fields that make it runnable.
            handler: t.Optional(t.Record(t.String(), t.Unknown())),
            script: t.Optional(t.Nullable(t.String())),
            scope: t.Optional(t.Nullable(t.String())),
            projectId: t.Optional(t.Nullable(t.String())),
            expectedHash: t.Optional(t.String()),
          }),
        },
        ({ params, body, status }) => {
          const { expectedHash, ...patch } = body;
          const current = db.getFleetHook(params.id);
          // The same conflict a memory document's save answers with: what the
          // writer had in front of them is stale, so the row really there comes
          // back rather than one editor's version winning by being last.
          if (
            expectedHash !== undefined &&
            current &&
            current.hash !== expectedHash
          ) {
            return status(409, current);
          }

          const merged: Record<string, unknown> = {};
          if (current) {
            const { id: _id, hash: _hash, ...stored } = current;
            Object.assign(merged, stored);
          }
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) {
              delete merged[key];
            } else if (value !== undefined) {
              merged[key] = value;
            }
          }
          const draft = merged as unknown as HookDraft;
          if (typeof draft.enabled !== "boolean") {
            return status(400, "Say whether the hook is enabled.");
          }
          const [first] = Object.values(hookProblem(draft));
          if (first) {
            return status(400, first);
          }

          if (current) {
            keepHookVersion(current);
          }

          const hook = db.putFleetHook({ ...draft, id: params.id });
          fanOutFleet();
          return hook;
        }
      )
      .delete("/api/fleet/hooks/:id", ({ params, status }) => {
        const current = db.getFleetHook(params.id);
        if (!current) {
          return status(404, `the fleet keeps no hook ${params.id}`);
        }

        keepHookVersion(current);
        db.deleteFleetHook(params.id);
        fanOutFleet();
        return { ok: true };
      })
      // What one hook used to be, newest first, without the material. `?hookId=`
      // narrows to that hook's own history; nothing named lists every hook's,
      // for a fleet-wide undo panel.
      .get(
        "/api/fleet/hooks/history",
        { query: t.Object({ hookId: t.Optional(t.String()) }) },
        ({ query }) => db.listFleetHookHistory(query.hookId)
      )
      .get("/api/fleet/hooks/history/:id", hidden, ({ params, status }) => {
        const version = db.fleetHookVersion(Number(params.id));
        return version ?? status(404, `no hook version ${params.id}`);
      })
      // Undo, through the same door as a save: what restoring replaces is
      // itself kept first, so a restore of the wrong version is undone the
      // same way a bad edit is.
      .post(
        "/api/fleet/hooks/restore",
        { body: t.Object({ id: t.Number() }) },
        ({ body, status }) => {
          const version = db.fleetHookVersion(body.id);
          if (!version) {
            return status(404, `no hook version ${body.id}`);
          }

          const current = db.getFleetHook(version.hookId);
          if (current) {
            keepHookVersion(current);
          }

          const hook = db.putFleetHook({
            id: version.hookId,
            name: version.name,
            enabled: version.enabled,
            event: version.event,
            matcher: version.matcher,
            handler: version.handler,
            script: version.script,
            scope: version.scope,
            projectId: version.projectId,
          });
          fanOutFleet();
          return hook;
        }
      )
      // One machine's copy of a hook's script, for the compare beside a drift.
      .post(
        "/api/fleet/hooks/peek",
        { body: t.Object({ machineId: t.String(), id: t.String() }) },
        async ({ body, status }) => {
          if (!db.getFleetHook(body.id)) {
            return status(404, `the fleet keeps no hook ${body.id}`);
          }
          const read = await readMachineHookScript(body.machineId, body.id);
          if (!read.ok) {
            return status(read.code, read.said);
          }
          // 204: the machine has no copy of this hook's script.
          return read.copy ?? status(204);
        }
      )
      // The other way to settle a drifted hook: the machine's edited script
      // becomes the fleet's, kept through the same door a save goes through so
      // what it replaces is in the history. Every other machine then gets it,
      // and the machine it came from finds its file already says so.
      .post(
        "/api/fleet/hooks/adopt",
        { body: t.Object({ machineId: t.String(), id: t.String() }) },
        async ({ body, status }) => {
          const current = db.getFleetHook(body.id);
          if (!current) {
            return status(404, `the fleet keeps no hook ${body.id}`);
          }
          const read = await readMachineHookScript(body.machineId, body.id);
          if (!read.ok) {
            return status(read.code, read.said);
          }
          if (!read.copy) {
            return status(
              404,
              `machine ${body.machineId} has no script for ${current.name}`
            );
          }

          const draft: HookDraft = {
            name: current.name,
            enabled: current.enabled,
            event: current.event,
            matcher: current.matcher,
            handler: current.handler,
            script: read.copy.content,
            scope: current.scope,
            projectId: current.projectId,
          };
          const [first] = Object.values(hookProblem(draft));
          if (first) {
            return status(400, first);
          }

          keepHookVersion(current);
          const hook = db.putFleetHook({ ...draft, id: body.id });
          fanOutFleet();
          return hook;
        }
      )
      // The click for a hook that drifted on one machine, or that a reader
      // wants there right now rather than at the next reconnect: `force: true`
      // on the one row named, or on every enabled one when none is.
      //
      // The machine is read first, as a memory push reads it: an edited script
      // an overwrite destroys exists nowhere else, so it goes into the hook's
      // history before it goes, and a machine that will not answer stops the
      // push.
      .post(
        "/api/fleet/hooks/push",
        {
          body: t.Object({ machineId: t.String(), id: t.Optional(t.String()) }),
        },
        async ({ body, status }) => {
          const agent = registry.agent(body.machineId);
          if (!agent) {
            return status(404, `machine ${body.machineId} is not connected`);
          }

          const config = db.fleetConfig();
          if (!config.hooks || config.hooks.length === 0) {
            return status(400, "the fleet keeps no hooks to push");
          }
          if (
            body.id !== undefined &&
            !config.hooks.some((hook) => hook.id === body.id)
          ) {
            return status(404, `the fleet keeps no hook ${body.id}`);
          }

          const forced = db
            .listFleetHooks()
            .filter((hook) =>
              body.id === undefined ? hook.enabled : hook.id === body.id
            );
          for (const hook of forced) {
            if (hook.script === undefined) {
              continue;
            }
            // biome-ignore lint/performance/noAwaitInLoops: each hook's script is read and kept before the one push below; a push is one click on one machine, rarely more than a hook or two
            const read = await readMachineHookScript(body.machineId, hook.id);
            if (!read.ok) {
              return status(read.code, read.said);
            }
            if (read.copy && read.copy.content !== hook.script) {
              const theirs = { ...hook, script: read.copy.content };
              db.recordFleetHook({
                hookId: hook.id,
                name: hook.name,
                enabled: hook.enabled,
                event: hook.event,
                matcher: hook.matcher,
                handler: hook.handler,
                script: theirs.script,
                hash: hashHookMaterial(theirs),
                scope: hook.scope,
                projectId: hook.projectId,
                source: `machine:${body.machineId}`,
              });
            }
          }

          pushFleetConfig(body.machineId, agent, {
            ...config,
            hooks: config.hooks.map((hook) =>
              body.id === undefined || hook.id === body.id
                ? { ...hook, force: true }
                : hook
            ),
          });
          publishInstances(body.machineId);
          return { ok: true };
        }
      )
      // The click for a machine that drifted, or for the whole fleet: the same
      // sync a register sends, asked for on purpose.
      .post(
        "/api/fleet/sync",
        { body: t.Object({ machineId: t.Optional(t.String()) }) },
        ({ body, status }) => {
          if (!body.machineId) {
            fanOutFleet();
            return { ok: true };
          }
          const agent = registry.agent(body.machineId);
          if (!agent) {
            return status(404, `machine ${body.machineId} is not connected`);
          }
          sendFleetSync(body.machineId, agent);
          publishInstances(body.machineId);
          return { ok: true };
        }
      )
      .get("/api/projects", () => db.listProjects())
      .post(
        "/api/projects",
        {
          body: t.Object({
            name: t.String(),
            cwd: t.String(),
            machineId: t.String(),
          }),
        },
        ({ body }) => db.createProject({ id: crypto.randomUUID(), ...body })
      )
      .delete("/api/projects/:id", ({ params }) => {
        db.deleteProject(params.id);
        return { ok: true };
      })
      // Delegation: one work item, in a new workspace or as the follow-up in
      // an existing one. The hub validates, files and spawns it all here —
      // `delegate` is nothing but this request (see work-items.ts).
      .post(
        "/api/work-items",
        {
          ...hidden,
          body: t.Object({
            parentInstanceId: t.String({ minLength: 1 }),
            prompt: t.String(),
            title: t.String(),
            type: t.Optional(t.String()),
            harness: t.Optional(harnessSchema),
            model: t.Optional(t.String()),
            skills: t.Optional(t.Array(t.String())),
            canDelegate: t.Optional(t.Boolean()),
            cwd: t.Optional(t.String()),
            machineId: t.Optional(t.String()),
            workspace: t.Optional(t.String()),
            fork: t.Optional(t.Boolean()),
            checks: checksSchema,
          }),
          // A 400 that says which field is missing or malformed, in words:
          // a delegate without a title is refused, never named from its brief.
          error({ error, status }) {
            if (error instanceof ValidationError) {
              const [first] = error.all as {
                path: string;
                message: string;
                params?: { requiredProperties?: string[] };
              }[];
              // A missing field has no path of its own; its name is in params.
              const field =
                first?.params?.requiredProperties?.[0] ??
                first?.path.slice(1) ??
                "";
              return status(
                400,
                field === "title"
                  ? `title is required: ${SESSION_TITLE_DESCRIPTION}`
                  : `${field || "body"}: ${first?.message ?? error.message}`
              );
            }
          },
        },
        async ({ body, request, status, server }) => {
          server?.timeout(request, 0);
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (authorization !== null && !identity) {
            return status(401, "Invalid session credential");
          }
          if (identity && identity.instanceId !== body.parentInstanceId) {
            return status(
              403,
              "Session credential does not belong to the work item's parent"
            );
          }
          if (
            !(
              body.parentInstanceId.trim() &&
              db.getInstancesByIds([body.parentInstanceId])[0]
            )
          ) {
            return status(
              400,
              "work item needs a known non-empty parentInstanceId"
            );
          }
          try {
            const started = await workItems.start(body);
            return {
              workItemId: started.item.id,
              workspaceId: started.workspace.id,
              instanceId: started.item.instanceId,
              title: started.item.title,
              text: started.text,
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            // Anything that is not the hub's own refusal is the machine's:
            // offline, or git turning the checkout down.
            return status(
              error instanceof WorkItemRefusal ? error.status : 502,
              message
            );
          }
        }
      )
      .post(
        "/api/work-items/wait",
        {
          ...hidden,
          body: t.Object(
            {
              instanceId: t.String({ minLength: 1 }),
              minutes: t.Integer({ minimum: 1, maximum: 120 }),
              reason: t.String({ minLength: 1 }),
            },
            { additionalProperties: false }
          ),
          error({ error, status }) {
            if (error instanceof ValidationError) {
              return status(400, WAIT_ITEM_LIMIT);
            }
          },
        },
        ({ body, request, status }) => {
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (authorization !== null && !identity) {
            return status(401, "Invalid session credential");
          }
          if (identity && identity.instanceId !== body.instanceId) {
            return status(
              403,
              "Session credential does not belong to the waiting instanceId"
            );
          }
          try {
            return {
              text: workItems.waitItem(
                body.instanceId,
                body.minutes,
                body.reason
              ),
            };
          } catch (error) {
            return status(
              error instanceof WorkItemRefusal ? error.status : 502,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      )
      // `finish_item`: the hub runs the item's checks and answers what the
      // tool returns. The checks may run for an hour each, so the HTTP idle
      // timer does not apply.
      .post(
        "/api/work-items/finish",
        {
          ...hidden,
          body: t.Object({
            instanceId: t.String({ minLength: 1 }),
            summary: t.String(),
            findings: t.Optional(
              t.Array(t.Object({ title: t.String(), detail: t.String() }))
            ),
            blocked: t.Optional(
              t.Object({ command: t.String(), error: t.String() })
            ),
          }),
        },
        async ({ body, status, request, server }) => {
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (authorization !== null && !identity) {
            return status(401, "Invalid session credential");
          }
          if (identity && identity.instanceId !== body.instanceId) {
            return status(
              403,
              "Session credential does not belong to the finishing instanceId"
            );
          }
          server?.timeout(request, 0);
          const { instanceId, ...finished } = body;
          try {
            return { text: await workItems.finishItem(instanceId, finished) };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return status(
              error instanceof WorkItemRefusal ? error.status : 502,
              message
            );
          }
        }
      )
      // `set_item_checks`: the parent replaces a running item's checks.
      .post(
        "/api/work-items/checks",
        {
          ...hidden,
          body: t.Object({
            from: t.String({ minLength: 1 }),
            instanceId: t.String({ minLength: 1 }),
            checks: checksSchema,
          }),
        },
        ({ body, request, status }) => {
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (authorization !== null && !identity) {
            return status(401, "Invalid session credential");
          }
          if (identity && identity.instanceId !== body.from) {
            return status(
              403,
              "Session credential does not belong to the checks' requester"
            );
          }
          try {
            const text = workItems.setChecks(
              body.instanceId,
              body.from,
              body.checks
            );
            return { text };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            return status(
              error instanceof WorkItemRefusal ? error.status : 502,
              message
            );
          }
        }
      )
      .get("/api/work-items/:id", hidden, ({ params, status }) => {
        const item = workItems.item(params.id);
        return item ?? status(404, `no work item ${params.id}`);
      })
      // Archiving a workspace: its machine kills the boundary with every
      // process in it and deletes the clone. Refused while an item runs there.
      .post("/api/workspaces/:id/archive", async ({ params, status }) => {
        try {
          const workspace = await workItems.archive(params.id);
          for (const item of db.workItemsIn(workspace.id)) {
            forgetPending(item.instanceId, UNREAD.ended);
            escalateRoutedAsks(item.instanceId);
          }
          publishInstances(workspace.machineId);
          return workspace;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return status(
            error instanceof WorkItemRefusal ? error.status : 502,
            message
          );
        }
      })
      // ── Usage (USAGE-SPEC.md §6) ─────────────────────────────────────────────
      // The heavy data lives behind these reads; the socket only carries the small
      // limits frame, so the dashboard pulls aggregates when it needs them.
      .get("/api/usage/limits", (): UsageLimitsResponse => {
        const agents = db.listAgents();
        return {
          machines: db.listUsageLimits().map((row) => ({
            machineId: row.machineId,
            hostname:
              agents.find((agent) => agent.machineId === row.machineId)
                ?.hostname ?? REMOVED_MACHINE,
            limits: row.payload,
            openCodeGo: row.openCodeGo,
          })),
        };
      })
      .get("/api/usage/spend", (): UsageSpend => spendNow())
      .get(
        "/api/usage/limits/history",
        {
          query: t.Object({
            machineId: t.String(),
            kind: t.Optional(t.String()),
            since: t.Optional(t.Numeric()),
            until: t.Optional(t.Numeric()),
          }),
        },
        ({ query }) =>
          db.usageLimitHistory({
            machineId: query.machineId,
            kind: query.kind,
            since: query.since,
            until: query.until,
          })
      )
      .get(
        "/api/usage/summary",
        {
          query: t.Object({
            since: t.Optional(t.Numeric()),
            until: t.Optional(t.Numeric()),
            harness: t.Optional(t.String()),
            machineId: t.Optional(t.String()),
            groupBy: t.Union([
              t.Literal("machine"),
              t.Literal("model"),
              t.Literal("project"),
              t.Literal("session"),
              t.Literal("start"),
            ]),
          }),
        },
        ({ query }) =>
          db.usageSummary({
            since: query.since,
            until: query.until,
            harness: query.harness,
            machineId: query.machineId,
            groupBy: query.groupBy,
          })
      )
      .ws("/ws", {
        // A machine answers a full transcript read in one frame, and a long
        // session's is tens of MB (a 45MB claude transcript). Past Bun's 16MB
        // default the socket is closed under the reply and the machine drops.
        maxPayloadLength: AGENT_FRAME_LIMIT_BYTES,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every agent socket verb (register, frames, pulse, control_result, etc.) through one handler; splitting it would scatter the ordering guarantees across several functions.
        message: guardedAgentMessage(async (ws, message) => {
          if (!isEnvelope(message)) {
            console.warn("[hub] dropped malformed frame", message);
            return;
          }
          if (
            message.verb !== "register" &&
            registry.agent(message.machineId)?.id !== ws.id
          ) {
            return;
          }

          switch (message.verb) {
            case "register": {
              lifecycle.disconnect(message.machineId);
              const claims = addressClaims(message.payload);
              if (claims) {
                addressProtocolMachines.add(message.machineId);
                for (const claim of claims) {
                  recordSessionAddress(ws, message.machineId, claim);
                }
              } else {
                addressProtocolMachines.delete(message.machineId);
              }
              // A pending hash without its agent's ACK is not a backed live install.
              db.expirePendingSessionIdentities(message.machineId);
              for (const [id, held] of heldSessions) {
                if (held.machineId === message.machineId) {
                  heldSessions.delete(id);
                }
              }
              registry.registerAgent(message.machineId, ws, ws.remoteAddress);
              workItems.discardUnfiled(message.machineId);
              // Checks a stopped hub left running on this machine run again
              // the moment it can run commands — waiting on nothing else the
              // register asks of the agent.
              workItems.resumeChecks(message.machineId);
              // Workspaces from before clones become clones as their agent
              // starts; a spawn that gets there first converts its own.
              workItems
                .convertWorktrees(message.machineId)
                .catch((error: unknown) =>
                  console.warn(
                    `[hub] converting ${message.machineId}'s worktree workspaces failed: ${error instanceof Error ? error.message : String(error)}`
                  )
                );
              reconcilePreviews(
                message.machineId,
                ws.remoteAddress,
                peekPreviews(message.payload)
              );
              // A machine arriving can turn a remembered "nobody holds this"
              // into an answer, so the negatives go. The hits stay: a
              // conversation does not move between machines.
              for (const [id, where] of locations) {
                if (where === null) {
                  locations.delete(id);
                }
              }
              db.upsertAgent({
                machineId: message.machineId,
                hostname:
                  peek(message.payload, "hostname") ?? message.machineId,
                os: peek(message.payload, "os") ?? "unknown",
                auth: peekAuth(message.payload),
                build: peekBuild(message.payload),
                machineCapabilities: peekMachineCapabilities(message.payload),
              });
              db.noteAgentAddressContract(
                message.machineId,
                claims !== undefined
              );
              // A register from a daemon with nothing to say leaves standing what
              // the beats said — the same tolerance `build` gets on the row.
              const registered = peekBinaryUpdate(message.payload);
              if (registered) {
                binaryUpdateStates.set(message.machineId, registered);
              }
              flushOwedStarts(message.machineId);
              // A question parked by a process that is gone cannot be answered:
              // the reply would arrive at a daemon with no such session. Drop them
              // with the sessions they belonged to, or they replay to every
              // dashboard that connects and fail on click.
              const registrationCustody = peekCustody(message.payload);
              const returningRemoved = new Set(
                db
                  .sessionOwnership(message.machineId)
                  .filter((row) => row.machineRemoved)
                  .map((row) => row.id)
              );
              db.restoreRemovedSessions(
                message.machineId,
                [
                  ...peekInstances(message.payload),
                  ...(registrationCustody.state === "available"
                    ? registrationCustody.instances
                    : []),
                ],
                registrationCustody.state === "available"
              );
              for (const id of returningRemoved) {
                lifecycle.preserveUnattached(id);
              }
              const settled = db.settleInstances(
                message.machineId,
                peekInstances(message.payload),
                peekResumable(message.payload),
                peekResumableAt(message.payload)
              );
              // What this machine runs is built now, so opening any of it is
              // a page off what is built rather than a read of its machine;
              // what an agent on another commit read is read again.
              transcripts
                .machineRegistered(
                  message.machineId,
                  peekInstances(message.payload)
                )
                .catch((error: unknown) =>
                  console.warn(
                    `[hub] building ${message.machineId}'s transcripts failed: ${error instanceof Error ? error.message : String(error)}`
                  )
                );
              const custody = peekCustody(message.payload);
              machineCustody.set(message.machineId, custody);
              const heldIds = new Set(
                custody.state === "available" ? custody.instances : []
              );
              const heldOpencode =
                custody.state === "available" && custody.opencode;
              // Whose process outlived the agent: a child sessiond kept alive,
              // or the one opencode server, which keeps every session it holds.
              const outlived = ({ row }: (typeof settled)[number]): boolean =>
                heldIds.has(row.id) ||
                (heldOpencode &&
                  row.harness === "opencode" &&
                  row.sessionId !== null);
              const registeredAt = Date.now();
              for (const orphan of settled) {
                // A process that outlived the agent holds what reached it and
                // has not been read, and nothing else: whatever the agent that
                // went away had not handed it yet went with that agent. What
                // it holds is decided once its harness has said
                // (`decideCustody`). A send its harness has taken up is read
                // either way — a read that happened while no agent was
                // reading is not framed again.
                const kept =
                  custody.state === "unavailable" || outlived(orphan);
                forgetPending(orphan.row.id, UNREAD.ended, kept);
                if (kept) {
                  inCustody.set(orphan.row.id, {
                    machineId: message.machineId,
                    since: registeredAt,
                    told: orphan.row.harness === "opencode",
                  });
                  decideCustody(orphan.row.id);
                }
                escalateRoutedAsks(orphan.row.id);
              }
              // Catalog reconciliation can also retire an already failed row,
              // and stopped rows are deliberately outside the orphan list.
              for (const parked of pending.list()) {
                const [owner] = db.getInstancesByIds([parked.instanceId ?? ""]);
                if (
                  parked.machineId === message.machineId &&
                  custody.state === "available" &&
                  !(
                    owner &&
                    ["running", "starting", "unknown"].includes(owner.status)
                  ) &&
                  !heldIds.has(parked.instanceId ?? "") &&
                  !(heldOpencode && owner?.harness === "opencode")
                ) {
                  pending.resolve(parked.requestId ?? "", "cancelled");
                }
              }
              // Sessions that ran on while this hub was away: a read that
              // happened meanwhile was framed to nobody, and the transcript
              // says it happened. Their agent is the one that was handed the
              // rest, and it is still handing them over.
              for (const instanceId of peekInstances(message.payload)) {
                settlePending(instanceId, UNREAD.ended, "wait");
              }
              // The daemon went away and came back. A session whose conversation
              // the harness still has is not finished — it lost its process, which
              // is this hub's problem to fix rather than the user's to notice. Put
              // it back exactly as it was: same directory, same model, same
              // permission mode, resumed onto the same session.
              //
              // But *bounded*, which it was not. Every resumable orphan was
              // respawned unconditionally on every register, which is how a
              // machine that had been away for a day and a half came back and was
              // handed its entire history as a work queue: 178 rows, spawned
              // fire-and-forget and each one written `running` before a single
              // process was confirmed. So: newest first, nothing older than
              // {@link RESTORE_HORIZON_MS}, and never more than
              // {@link RESTORE_MAX}. `settleInstances` has already written every
              // one of these `sleeping`, so the ones this skips are not lost —
              // they are asleep, listed, and one wake away.
              const cutoff = Date.now() - RESTORE_HORIZON_MS;
              // A surviving child is not a fresh spawn. OpenCode's one held
              // server owns its sessions; the adapter verifies each key with
              // session.get before publishing an init frame and subscribing.
              //
              // A row filed asleep or failed whose process the machine still
              // holds is one too. A register this hub did not live to finish
              // settles its rows `sleeping` and dies before the restores go
              // out; its successor then found nothing to settle, named none
              // of them, and their processes ran on with nobody attached
              // (sixteen of them, 2026-10-04). Whatever sessiond holds that a
              // row here could run again is named in this register's
              // restores; whatever custody cannot attach is listed by the agent.
              const justSettled = new Set(settled.map(({ row }) => row.id));
              const listedLive = new Set(peekInstances(message.payload));
              const filedAway = db
                .sessionOwnership(message.machineId)
                .filter(
                  (row) =>
                    heldIds.has(row.id) &&
                    row.machineId === message.machineId &&
                    !row.endIntent &&
                    !justSettled.has(row.id) &&
                    !listedLive.has(row.id) &&
                    (row.status === "sleeping" || row.status === "error")
                )
                .map((row) => ({ row, resumes: true }));
              const held = [...settled.filter(outlived), ...filedAway];
              const heldRows = new Set(held.map(({ row }) => row.id));
              const fresh = settled
                .filter(() => custody.state === "available")
                .filter(({ row }) => !heldRows.has(row.id))
                .filter((orphan) => orphan.resumes && orphan.row.sessionId)
                // `row` is the pre-settle snapshot, so this reads when the session
                // last moved, not when the settle just now touched it.
                .sort(
                  (a, b) =>
                    b.row.updatedAt.getTime() - a.row.updatedAt.getTime()
                )
                .filter((orphan) => orphan.row.updatedAt.getTime() >= cutoff)
                .slice(0, RESTORE_MAX);
              // A summariser is never brought back: a continuation that still
              // needs one reads it or replaces it itself (advanceContinuation,
              // below). One still running that no unsettled continuation
              // names is nobody's, and is stopped.
              const revivable = [
                ...held,
                ...fresh.filter(({ row }) => !row.workflowStepId),
              ].filter(
                ({ row }) =>
                  !row.endIntent &&
                  row.kind !== "summariser" &&
                  !returningRemoved.has(row.id)
              );
              let restoreBatch = 0;
              for (const orphan of revivable) {
                restore(ws, orphan.row, heldRows.has(orphan.row.id));
                restoreBatch += 1;
                if (restoreBatch % 8 === 0) {
                  // biome-ignore lint/performance/noAwaitInLoops: bounded restore batches keep unrelated control requests serviceable.
                  await new Promise<void>((resolve) => setImmediate(resolve));
                }
              }
              const restoredIds = new Set(revivable.map(({ row }) => row.id));
              const named = new Set(
                db
                  .continuationRows()
                  .filter((job) => !SETTLED.has(job.stage))
                  .map((job) => job.summariserInstanceId)
              );
              const toEnd = db
                .sessionOwnership(message.machineId)
                .filter((row) =>
                  reattachable(
                    [...heldIds],
                    peekInstances(message.payload)
                  ).includes(row.id)
                )
                .filter(
                  (row) =>
                    row.machineId === message.machineId &&
                    row.kind === "summariser" &&
                    !named.has(row.id)
                );
              // Rows still live at disconnect (now settled above) retain custody.
              // A previously sleeping row only recovers within the fresh-spawn
              // horizon: an older held tool may apply a stale patch to a tree
              // since rewritten. Inspect those without attaching or replaying asks.
              // Discarded/stopped rows are never even sent to the server to probe.
              if (heldOpencode) {
                for (const row of db.listInstances()) {
                  if (
                    row.machineId === message.machineId &&
                    !restoredIds.has(row.id) &&
                    !returningRemoved.has(row.id) &&
                    !row.workflowStepId &&
                    row.kind !== "summariser" &&
                    row.harness === "opencode" &&
                    row.sessionId &&
                    (row.status === "sleeping" || row.status === "error")
                  ) {
                    restore(
                      ws,
                      row,
                      row.updatedAt.getTime() >= cutoff ? "busy" : "inspect"
                    );
                    restoreBatch += 1;
                    if (restoreBatch % 8 === 0) {
                      // biome-ignore lint/performance/noAwaitInLoops: history inspection must not monopolize the hub event loop.
                      await new Promise<void>((resolve) =>
                        setImmediate(resolve)
                      );
                    }
                  }
                }
              }
              if (settled.length > revivable.length) {
                console.log(
                  `[hub] ${message.machineId}: restoring ${revivable.length} of ${settled.length} orphaned session(s); the rest are sleeping`
                );
              }
              publishInstances(message.machineId);
              // After `settleInstances`, so the rows this reads the machine's home
              // out of are the ones the returning daemon just accounted for.
              // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — nothing here is waiting on it, and register must not stall on it.
              void pushAgents(message.machineId);
              // And what its stored conversations are called, for the ones nobody
              // has ever named — off the catalog the daemon just read anyway.
              // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — nothing here is waiting on it, and register must not stall on it.
              void nameStoredSessions(message.machineId);
              // The ledger the returning agent reattaches against: what this hub
              // has already ingested of each session the daemon is about to hold.
              // Computed AFTER `settleInstances` and after the restores above, so
              // it names exactly the sessions a reattach can act on — see
              // {@link reattachable} for why the restores have to be in it.
              const reattaching = reattachable(
                peekInstances(message.payload),
                revivable.map((orphan) => orphan.row.id)
              );
              ws.send(registerAck(message, streams.ingestedFor(reattaching)));
              for (const row of toEnd) {
                if (addressProtocolMachines.has(message.machineId)) {
                  endSession(row.id, "stop");
                }
              }
              lifecycle.reconcile(
                message.machineId,
                {
                  custody,
                  attached: peekInstances(message.payload),
                },
                false
              );
              // Behind the restores and the ack, so the agent reads each send
              // after the spawn it waits on.
              releaseAwaiting(message.machineId);
              // biome-ignore lint/complexity/noVoid: reconnect immediately retries overdue stored schedules after the register ACK
              void keepAliveScheduler.wake();
              workflowRuntime.recover(message.machineId);
              // Continuations waiting on this machine — for their summary, or
              // for their new session — go on from where their record says.
              for (const job of db.continuationRows()) {
                if (
                  !SETTLED.has(job.stage) &&
                  machineFor(job) === message.machineId
                ) {
                  // biome-ignore lint/complexity/noVoid: each job runs on its own; its record is what anyone follows
                  void advanceContinuation(job.id);
                }
              }
              break;
            }
            case "heartbeat": {
              for (const claim of addressClaims(message.payload) ?? []) {
                recordSessionAddress(ws, message.machineId, claim);
              }
              db.touchAgent(message.machineId);
              // biome-ignore lint/complexity/noVoid: a recovered machine can now answer an idle receipt for an overdue schedule
              void keepAliveScheduler.wake();
              if ((message.payload as HeartbeatPayload).custody !== undefined) {
                const custody = peekCustody(message.payload);
                machineCustody.set(message.machineId, custody);
                lifecycle.reconcile(message.machineId, {
                  custody,
                  attached: peekInstances(message.payload),
                });
              }
              // Payload fields outside the declared heartbeat (including old listing reports)
              // are ignored; fresh reads and stored row intent alone drive lifetime.
              lifecycle.reconcile(message.machineId);
              // The beat is the truth (contract C4). Every 15s the machine says
              // what it is carrying, and the hub's column is made to agree with
              // it: listed ids become `running`, and rows claiming a process the
              // machine does not list settle — `sleeping` when there is a
              // conversation to resume, `error` when there is not.
              //
              // Deliberately no respawn from this path. A heartbeat is a report,
              // and answering a report by starting processes turns the fleet's
              // slowest-moving surface into its most destructive one: the daemon
              // would be told to relaunch a session every 15 seconds for as long
              // as it disagreed with the hub. Recovery is register's job, where
              // it happens once, bounded, on an event that means "the machine
              // just came back".
              const beat = db.reconcileHeartbeat(
                message.machineId,
                peekInstances(message.payload),
                HEARTBEAT_SETTLE_GRACE_MS
              );
              for (const row of beat.settled) {
                // Its parked questions cannot be answered by a process that is
                // gone, and the same goes for anything it was holding.
                forgetPending(row.id, UNREAD.ended);
                escalateRoutedAsks(row.id);
              }
              if (
                (message.payload as HeartbeatPayload).custodyComplete ===
                  true &&
                machineCustody.get(message.machineId)?.state === "available"
              ) {
                workflowRuntime.recover(message.machineId);
              }
              // A process the operator stopped that the machine still carries:
              // one the stop never reached (the agent was restarting), taken
              // back into custody when its agent came up again. The row keeps
              // the decision; this ends the process behind it. Not a respawn,
              // and sent once per connection, so no beat repeats it.
              const beatIds = peekInstances(message.payload);
              // An outlived session whose sends could not be decided because
              // the machine did not answer the read is asked again.
              for (const [instanceId, held] of inCustody) {
                if (held.machineId === message.machineId) {
                  decideCustody(instanceId);
                }
              }
              // The update state rides the beat. A change in it is board news on
              // its own, so it joins the session reconciliation in deciding to
              // republish.
              const beaten = peekBinaryUpdate(message.payload);
              const moved =
                beaten !== undefined &&
                !sameBinaryUpdate(
                  binaryUpdateStates.get(message.machineId),
                  beaten
                );
              if (beaten) {
                binaryUpdateStates.set(message.machineId, beaten);
              }
              if (moved) {
                flushOwedStarts(message.machineId);
              }
              // What the machine can do: one beat per connection carries it,
              // sent the moment the daemon's probes finish. It used to ride the
              // register, which made the register wait on those probes, and
              // the register is what puts a machine back in the registry. So
              // everything that reads a machine's harnesses or tools runs here,
              // off the report it reads.
              const reported = peekHarnesses(message.payload);
              if (reported) {
                db.setAgentHarnesses(message.machineId, reported);
                capabilityReports.delete(message.machineId);
                db.mergeAgentTools(
                  message.machineId,
                  peekTools(message.payload)
                );
                autoInstall(message.machineId, ws);
                sendFleetSync(message.machineId, ws);
              }
              if (
                reported ||
                moved ||
                beat.promoted.length > 0 ||
                beat.settled.length > 0
              ) {
                publishInstances(message.machineId);
              }
              ws.send({
                ...ack(message),
                payload: {
                  ok: true,
                  keepAwake: keptWarm(message.machineId, beatIds),
                } satisfies HeartbeatAckPayload,
              });
              break;
            }
            // The per-machine scanner's usage report (USAGE-SPEC.md §6.4): store
            // the buckets and the limit reading, then push the small frame of
            // limits and the fleet's spend, which moves exactly here — the
            // dashboard pulls the heavy aggregates over REST.
            case "usage": {
              const { buckets, limits, openCodeGo } = message.payload as {
                buckets?: UsageBucket[];
                limits?: ClaudeLimits;
                openCodeGo?: OpenCodeGoLimits | null;
              };
              if (buckets && buckets.length > 0) {
                // Quarter-hour buckets only: a daemon that still reports hour
                // buckets predates them, and its spend is not stored until it
                // is restarted on this build. Its limits still are.
                if (buckets.every((bucket) => bucket.spanMs === BUCKET_MS)) {
                  db.putUsageBuckets(message.machineId, buckets);
                } else {
                  console.warn(
                    `[hub] usage buckets from ${message.machineId} refused: its daemon reports hour buckets; restart it on this build`
                  );
                }
              }
              if (limits) {
                db.putUsageLimits(
                  message.machineId,
                  limits,
                  openCodeGo ?? null
                );
              }
              registry.broadcast({
                verb: "frames",
                machineId: message.machineId,
                payload: {
                  kind: "usage",
                  limits: db.listUsageLimits(),
                  spend: spendNow(),
                },
              });
              break;
            }
            case "frames": {
              const kind = peek(message.payload, "kind");
              if (kind === "cache_invalidated") {
                const { reason, at } = message.payload as Extract<
                  FramePayload,
                  { kind: "cache_invalidated" }
                >;
                db.invalidateClaudeCaches(message.machineId, reason, at);
                publishInstances(message.machineId);
                // Cache bookkeeping is neither a turn nor fleet attention.
                break;
              }
              if (kind === "control_result" && !message.requestId) {
                message.requestId = peek(message.payload, "requestId");
              }
              const hubReply =
                kind === "control_result" &&
                message.requestId !== undefined &&
                (pendingInstalls.has(message.requestId) ||
                  pendingFleet.has(message.requestId));
              if (kind === "scratch_worktree" && message.instanceId) {
                const row = db.ownedInstance(
                  message.instanceId,
                  message.machineId
                );
                const frame = message.payload as Extract<
                  FramePayload,
                  { kind: "scratch_worktree" }
                >;
                if (row && frame.processGeneration === processGeneration(row)) {
                  db.recordScratchWorktree(row.id, frame.worktree);
                }
                break;
              }
              if (kind === "session_address" && message.instanceId) {
                recordSessionAddress(ws, message.machineId, {
                  instanceId: message.instanceId,
                  sessionId: peek(message.payload, "sessionId") ?? "",
                  processGeneration: peek(message.payload, "processGeneration"),
                });
                break;
              }
              const ownedSession = message.instanceId
                ? db.ownedInstance(message.instanceId, message.machineId)
                : undefined;
              if (
                message.instanceId &&
                !ownedSession &&
                kind !== "control_result"
              ) {
                break;
              }
              if (
                ownedSession?.endConfirmedAt &&
                (kind === "frame" ||
                  kind === "pulse" ||
                  kind === "permission_request" ||
                  kind === "rejected")
              ) {
                break;
              }
              // Reconciliation keeps failed end delivery pending; it is not a session failure.
              if (
                kind === "error" &&
                peek(message.payload, "verb") === "stop" &&
                message.instanceId
              ) {
                lifecycle.deliveryFailed(message.instanceId);
              }
              if (
                kind === "error" &&
                peek(message.payload, "verb") === "stop" &&
                ownedSession?.endIntent &&
                peek(message.payload, "processGeneration") ===
                  processGeneration(ownedSession)
              ) {
                const reason = peek(message.payload, "endReason");
                if (reason) {
                  db.noteEndReason(ownedSession.id, reason);
                }
              }
              if (
                kind === "error" &&
                peek(message.payload, "verb") === "stop" &&
                ownedSession?.endIntent
              ) {
                break;
              }
              // A continuation's summariser: an internal worker only its
              // continuation talks to (see `summarisers`).
              const internal =
                message.instanceId !== undefined &&
                summarisers.has(message.instanceId);
              // One send did not go: its record says so, and nothing else does.
              if (kind === "rejected" && message.instanceId) {
                const { uuid, error } = message.payload as FramePayload & {
                  kind: "rejected";
                };
                takeSendSignal(message.instanceId, {
                  kind: "rejected",
                  uuid,
                  error,
                });
                break;
              }
              if (kind === "stopped" && message.instanceId) {
                const ended = ownedSession;
                if (
                  !lifecycle.confirm(
                    message.machineId,
                    message.instanceId,
                    message.payload as Parameters<typeof lifecycle.confirm>[2]
                  )
                ) {
                  break;
                }
                for (const [key, sent] of stopDispatches) {
                  if (
                    sent.instanceId === message.instanceId &&
                    sent.machineId === message.machineId
                  ) {
                    finishStopDispatch(key, "runner-gone");
                  }
                }
                turnWaiters
                  .get(message.instanceId)
                  ?.reject(
                    new Error(
                      "the summariser session stopped before it answered"
                    )
                  );
                heldSessions.delete(message.instanceId);
                closePreview(message.instanceId).catch(console.error);
                // Stopped by anyone while its work was live: the work is over.
                // Read before the row is filed away, which a discard hides.
                if (ended) {
                  workItems.cancelled(ended);
                }
                // What it was sent and had not read did not go, unless it wrote
                // some of it down as it stopped.
                forgetPending(message.instanceId, UNREAD.stopped);
                escalateRoutedAsks(message.instanceId);
                publishInstances(message.machineId);
                break;
              }
              if (kind === "asleep" && message.instanceId) {
                const [process] = db.getInstancesByIds([message.instanceId]);
                if (
                  process &&
                  peek(message.payload, "processGeneration") ===
                    processGeneration(process)
                ) {
                  sessionAsleep(message.machineId, message.instanceId);
                }
                break;
              }
              if (kind === "recovery_unavailable" && message.instanceId) {
                const [process] = db.getInstancesByIds([message.instanceId]);
                if (
                  !process ||
                  peek(message.payload, "processGeneration") !==
                    processGeneration(process)
                ) {
                  break;
                }
                lifecycle.unavailable(message.instanceId);
                db.settleUnavailableRecovery(message.instanceId);
                forgetPending(message.instanceId, UNREAD.ended);
                publishInstances(message.machineId);
                break;
              }
              if (kind === "frame" && message.instanceId) {
                const frame = message.payload as FramePayload & {
                  kind: "frame";
                };
                if (
                  frame.message.type === "system" &&
                  frame.message.subtype === "custody_held"
                ) {
                  const [row] = db.getInstancesByIds([message.instanceId]);
                  if (
                    !row ||
                    row.machineId !== message.machineId ||
                    (row.status !== "sleeping" && row.status !== "error") ||
                    row.updatedAt.getTime() >= Date.now() - RESTORE_HORIZON_MS
                  ) {
                    break;
                  }
                  const hours = (
                    (Date.now() - row.updatedAt.getTime()) /
                    3_600_000
                  ).toFixed(1);
                  const note = `Held by opencode server, not re-adopted: idle for ${hours}h. Review its pending work before waking it.`;
                  heldSessions.set(row.id, {
                    machineId: row.machineId,
                    since: row.updatedAt.getTime(),
                    reason: note,
                  });
                  publishInstances(message.machineId);
                  message.payload = {
                    ...frame,
                    message: custodyNotice(row, note),
                  };
                  transcripts.ingest(
                    row.id,
                    message.payload as TranscriptPayload
                  );
                  break;
                }
              }
              // THE INGEST LEDGER (design §7): a line becomes a hub frame AT MOST
              // ONCE per (instanceId, epoch, srcSeq). A returning agent replays
              // the gap this hub named on its register ack, and an overshoot —
              // a cursor the hub had already passed, a re-sent line after a
              // socket drop — stops dead here rather than being sequenced twice.
              // Before every side effect below on purpose: a duplicate that got
              // this far would re-name the session, re-fire the rules and
              // re-deliver a delegate's report.
              if (
                kind === "frame" &&
                message.instanceId &&
                !streams.admitFrame(message.instanceId, readProvenance(message))
              ) {
                break;
              }
              // Pings share admission and send receipts, then leave before every
              // consumer that makes a turn into work, attention or activity.
              if (
                message.instanceId &&
                (kind === "frame" || kind === "pulse")
              ) {
                const [row] = db.getInstancesByIds([message.instanceId]);
                const frame =
                  kind === "frame"
                    ? (message.payload as FramePayload & { kind: "frame" })
                    : undefined;
                const signal = frame ? peekSendSignal(frame) : undefined;
                const quiet = !!row?.keepAliveTurn || frame?.keepAlive === true;
                if (quiet && row) {
                  if (signal) {
                    takeSendSignal(row.id, signal);
                    if (
                      signal.kind !== "read" ||
                      db.getInstancesByIds([row.id])[0]?.keepAliveTurn
                    ) {
                      break;
                    }
                  } else if (frame) {
                    frame.keepAlive = true;
                    frame.message.keepAlive = true;
                    const neutral = frame.message;
                    if (neutral.type === "result") {
                      if (
                        !(
                          neutral.uuid &&
                          db.claimCompletedTurn(
                            row.id,
                            neutral.uuid,
                            neutral.timestamp,
                            neutral.recovered === true
                          )
                        )
                      ) {
                        break;
                      }
                      db.updateKeepAlive(
                        row.id,
                        keepAliveResult(row, neutral, true)
                      );
                      const usage = keepAliveUsage(neutral);
                      console.info(
                        `[keepalive] ${row.id}: result ${neutral.uuid} input=${usage.input} read=${usage.read} write=${usage.write} at ${new Date().toISOString()}`
                      );
                      // biome-ignore lint/complexity/noVoid: a refreshed request establishes the next original deadline
                      void keepAliveScheduler.wake();
                      publishInstances(row.machineId);
                    }
                    streams.sequence(row.id, { ...frame, keepAlive: true });
                    break;
                  } else {
                    break;
                  }
                }
              }
              // The conversation the session is writing, whenever it names one —
              // read before anything below can consume the frame, since a
              // `held` naming it is also a send signal.
              if (kind === "frame" && message.instanceId) {
                const neutral = (
                  message.payload as FramePayload & { kind: "frame" }
                ).message;
                if (neutral.type === "result") {
                  if (!neutral.uuid) {
                    console.error(
                      `[hub] completion ${message.instanceId} has no harness result identity`
                    );
                    finalMessage.delete(message.instanceId);
                    break;
                  }
                  if (
                    !db.claimCompletedTurn(
                      message.instanceId,
                      neutral.uuid,
                      neutral.timestamp,
                      neutral.recovered === true
                    )
                  ) {
                    finalMessage.delete(message.instanceId);
                    break;
                  }
                }
                const named = peekSessionKey(message.payload);
                if (named) {
                  db.noteInstanceSession(
                    message.instanceId,
                    named.sessionId,
                    named.cwd,
                    peek(message.payload, "harness"),
                    named.tooling
                  );
                  if (named.init) {
                    // The session naming its own conversation is the daemon's word
                    // that a process exists — first-hand, and the earliest such word
                    // there is. Promoting on it means a fresh spawn reads `running`
                    // in a second rather than waiting up to a beat for the heartbeat
                    // to say the same thing. The row is left alone if it is already
                    // there; `markInstanceLive` only touches the states a live
                    // process can be wrongly filed under.
                    db.markInstanceLive(message.instanceId);
                    workflowRuntime.instanceLive(message.instanceId);
                    const [live] = db.getInstancesByIds([message.instanceId]);
                    if (live) {
                      workItems.started(live);
                    }
                    heldSessions.delete(message.instanceId);
                  }
                  publishInstances(message.machineId);
                }
              }
              // Applied settings are filed before a control reply is consumed
              // by REST or turned into a dashboard acknowledgement.
              if (
                (kind === "frame" || kind === "control_result") &&
                message.instanceId &&
                noteSessionSettings(message.instanceId, message.payload)
              ) {
                publishInstances(message.machineId);
              }
              // The harness's word on its sends becomes their records, and goes
              // no further: every screen hears it as the records' `send` frames.
              // Everything else the session says is read for what its turn
              // makes of the sends it read (rule b).
              if (kind === "frame" && message.instanceId) {
                const frame = message.payload as FramePayload & {
                  kind: "frame";
                };
                const signal = peekSendSignal(frame);
                if (signal) {
                  takeSendSignal(message.instanceId, signal);
                  break;
                }
                // The session's effort as its agent read it back: the row's
                // word on it, and no screen's line.
                if (
                  frame.message.type === "system" &&
                  frame.message.subtype === EFFORT_READ
                ) {
                  const { effort } = frame.message;
                  if (
                    db.noteInstanceEffort(
                      message.instanceId,
                      isEffortLevel(effort) ? effort : EFFORT_NONE
                    )
                  ) {
                    publishInstances(message.machineId);
                  }
                  break;
                }
                observeTurn(message.instanceId, frame);
              }
              if (message.requestId && kind === "permission_request") {
                const [owner] = db.getInstancesByIds([
                  message.instanceId ?? "",
                ]);
                if (
                  !owner ||
                  owner.machineId !== message.machineId ||
                  !["running", "starting", "unknown"].includes(owner.status)
                ) {
                  // Replayed old-process asks after boot reconciliation are
                  // cancelled at admission, through the same settlement path.
                  pending.remember(message.requestId, message);
                  pending.resolve(message.requestId, "cancelled");
                  break;
                }
                if (
                  peek(message.payload, "processGeneration") !==
                  processGeneration(owner)
                ) {
                  pending.remember(message.requestId, message);
                  pending.resolve(message.requestId, "cancelled");
                  break;
                }
                // A replayed ask (the daemon re-announces unresolved asks after
                // every register) refreshes the parked copy without a second
                // Telegram message or a second routing decision.
                const alreadyParked =
                  pending.get(message.requestId) !== undefined;
                if (!pending.remember(message.requestId, message)) {
                  break;
                }
                if (alreadyParked) {
                  break;
                }
                // A delegate's ask routes to its parent; the user is only the
                // fallback. The parent must be live, or asleep with a
                // conversation to wake from: a parent waiting on its
                // delegates is put to sleep after half an hour at rest, and
                // the ask wakes it as its delegate's report does
                // (`deliverSend`). Otherwise the ask is the user's exactly as
                // it was before this feature.
                const sender = message.instanceId
                  ? db.listInstances().find((r) => r.id === message.instanceId)
                  : undefined;
                const parentId = sender?.parentInstanceId;
                if (
                  sender?.workflowStepId &&
                  !parentId &&
                  (message.payload as { requestKind?: string }).requestKind ===
                    "question"
                ) {
                  registry.agent(message.machineId)?.send({
                    verb: "control",
                    machineId: message.machineId,
                    instanceId: sender.id,
                    requestId: message.requestId,
                    payload: {
                      instanceId: sender.id,
                      requestId: message.requestId,
                      method: RESOLVE_PERMISSION,
                      args: [
                        message.requestId,
                        { behavior: "deny", message: QUESTION_DISMISSED },
                      ],
                    },
                  });
                  pending.resolve(message.requestId);
                  break;
                }
                const parent =
                  parentId && parentId !== message.instanceId
                    ? db.listInstances().find((r) => r.id === parentId)
                    : undefined;
                // A parent whose own work is finished cannot take the ask.
                const routed =
                  sender !== undefined &&
                  parent !== undefined &&
                  (parent.status === "running" ||
                    parent.status === "starting" ||
                    (parent.status === "sleeping" &&
                      parent.sessionId !== null)) &&
                  !workItems.refusal(parent, {
                    kind: "peer",
                    fromSession: sender.id,
                  });
                if (routed) {
                  (message.payload as Record<string, unknown>).routedTo =
                    "parent";
                  deliverDelegateAsk(sender, parent, message);
                } else if (!internal) {
                  telegram?.onAsk(message);
                }
              }
              // The daemon's live reading of one session. Kept in memory only, so
              // a dashboard that connects mid-turn is handed the rail's now-state
              // in its first frame instead of a blank row. Relayed unchanged below
              // — this is a copy, not an interception.
              // The harness settled an ask itself (answered in its own UI, or
              // withdrawn by an interrupt). Settling it here is what tells every
              // screen, through `pending.onSettled`; the daemon's frame itself
              // goes no further.
              if (kind === "permission_settled") {
                // Most of these echo an answer the hub relayed and has already
                // settled; only one still parked is news to Telegram.
                const parked = message.requestId
                  ? pending.get(message.requestId)
                  : undefined;
                if (
                  message.requestId &&
                  parked?.instanceId === message.instanceId &&
                  parked?.machineId === message.machineId &&
                  peek(parked.payload, "processGeneration") ===
                    peek(message.payload, "processGeneration")
                ) {
                  pending.resolve(
                    message.requestId,
                    peek(message.payload, "outcome") === "cancelled"
                      ? "cancelled"
                      : "answered"
                  );
                }
                break;
              }
              if (kind === "pulse" && message.instanceId) {
                const { pulse } = message.payload as { pulse?: SessionPulse };
                if (pulse) {
                  pulses.set(message.instanceId, pulse);
                  workItems.turnState(message.instanceId, pulse.busy);
                  // A pulse is only ever emitted by a session doing something,
                  // so it is the fleet's cheapest honest signal for the column
                  // the rails age rows from.
                  noteActivity(message.instanceId);
                }
              }
              // A session named by what it was first asked, whether the ask came
              // through this hub or the harness echoed one it was spawned with.
              if (kind === "frame" && message.instanceId) {
                nameFromLiveTurn(
                  message.machineId,
                  message.instanceId,
                  (message.payload as FramePayload & { kind: "frame" }).message
                );
              }
              // A continuation's summariser: its turn's end settles the
              // continuation's wait, and what it answered is read from its
              // transcript. Nothing else answers or hears an internal session.
              if (kind === "frame" && message.instanceId && internal) {
                const neutral = (
                  message.payload as FramePayload & { kind: "frame" }
                ).message;
                const waiter = turnWaiters.get(message.instanceId);
                if (neutral.type === "result" && waiter) {
                  const { errors } = neutral as { errors?: string[] };
                  if (neutral.is_error) {
                    waiter.reject(
                      new Error(
                        errors?.length
                          ? errors.join("\n")
                          : (neutral.result ??
                              `Harness error (${neutral.subtype}).`)
                      )
                    );
                  } else {
                    waiter.resolve();
                  }
                }
              }
              // A provider refused a session's turn and waits to try again. For
              // a workflow step's session its attempt decides whether that wait
              // fits inside the attempt's deadline; any other session waits.
              if (kind === "frame" && message.instanceId) {
                const neutral = (
                  message.payload as FramePayload & { kind: "frame" }
                ).message;
                if (
                  neutral.type === "system" &&
                  neutral.subtype === PROVIDER_RETRY &&
                  neutral.retry
                ) {
                  workflowRuntime.providerRetry(
                    message.instanceId,
                    neutral.retry
                  );
                }
              }
              // A turn's end, in this order: the standing instructions answer
              // it first, then the delegate hand-back delivers the turn's final
              // message to the parent as a queued peer report — once, on the
              // turn that ends the work (aborted turns carry no answer and are
              // skipped).
              if (kind === "frame" && message.instanceId && !internal) {
                const neutral = (
                  message.payload as FramePayload & { kind: "frame" }
                ).message;
                if (
                  neutral.type === "assistant" &&
                  !neutral.parent_tool_use_id
                ) {
                  const text = neutral.message.content
                    .filter((block) => block.type === "text")
                    .map((block) => block.text)
                    .join("");
                  // A tool call means the turn goes on: everything said up
                  // to it, this frame's own text included, was narration.
                  if (
                    neutral.message.content.some(
                      (block) => block.type === "tool_use"
                    )
                  ) {
                    finalMessage.delete(message.instanceId);
                  } else if (text) {
                    const acc = finalMessage.get(message.instanceId);
                    if (acc) {
                      acc.push(text);
                    } else {
                      finalMessage.set(message.instanceId, [text]);
                    }
                  }
                } else if (neutral.type === "result") {
                  const [cacheRow] = db.getInstancesByIds([message.instanceId]);
                  if (cacheRow?.harness === "claude") {
                    db.updateKeepAlive(
                      cacheRow.id,
                      keepAliveResult(cacheRow, neutral, false)
                    );
                    // biome-ignore lint/complexity/noVoid: real turns re-arm from their own request clock
                    void keepAliveScheduler.wake();
                    if (cacheRow.keepAliveEnabled) {
                      publishInstances(cacheRow.machineId);
                    }
                  }
                  // Claude reports each model's window only here; kept so a
                  // picker can say whether a model fits (claude's catalog
                  // carries no window of its own).
                  if (peek(message.payload, "harness") === "claude") {
                    const { modelUsage } = neutral as {
                      modelUsage?: Record<string, { contextWindow?: number }>;
                    };
                    for (const [model, usage] of Object.entries(
                      modelUsage ?? {}
                    )) {
                      if (usage.contextWindow) {
                        db.noteClaudeContextWindow(model, usage.contextWindow);
                      }
                    }
                  }
                  const parts = finalMessage.get(message.instanceId);
                  finalMessage.delete(message.instanceId);
                  const text = parts?.length ? parts.join("\n\n") : undefined;
                  const row = db
                    .listInstances()
                    .find((r) => r.id === message.instanceId);
                  const parentId = row?.parentInstanceId;
                  if (row && neutral.subtype === "aborted") {
                    workItems.interrupted(row.id);
                  }
                  if (row?.workflowStepId) {
                    const workflowFailure = neutral.errors?.length
                      ? neutral.errors.join("\n")
                      : (neutral.result ??
                        `Harness error (${neutral.subtype}).`);
                    workflowRuntime.observe(
                      row.id,
                      neutral.is_error ? workflowFailure : undefined
                    );
                  }
                  const turnId = message.instanceId;
                  const endedAt = new Date();
                  /** Whether a rule or the supervisor answered the turn with a reply. */
                  const answered = (): Promise<boolean> =>
                    Promise.all([
                      ruleEngine.endTurn(turnId, neutral),
                      supervisor.endTurn(turnId, neutral),
                    ]).then(([rule, supervised]) => rule || supervised);
                  const delegate =
                    row &&
                    !row.workflowStepId &&
                    parentId &&
                    parentId !== turnId &&
                    neutral.subtype !== "aborted"
                      ? row
                      : undefined;
                  // A failed turn's report carries the harness's own error
                  // words — "(no text)" once stood in for a 403 that was
                  // sitting right in the result frame.
                  const { errors } = neutral as { errors?: string[] };
                  const harnessError = errors?.length
                    ? errors.join("\n")
                    : undefined;
                  const failed = !!neutral.is_error;
                  const turn = {
                    text:
                      text ||
                      harnessError ||
                      "(the delegate produced no text this turn)",
                    ...(failed
                      ? {
                          error:
                            harnessError ??
                            neutral.result ??
                            `Harness error (${neutral.subtype}).`,
                        }
                      : {}),
                  };
                  // What the parent hears of the turn, if anything: an item
                  // with checks reports only through finish_item, or when its
                  // turn failed (work-items.ts turnEnded).
                  const handBack = (from: InstanceRow): void => {
                    const handed = workItems.turnEnded(from, turn, endedAt);
                    if (handed) {
                      reportToParent(from, handed.body, handed.failed, {
                        resultId: neutral.uuid as string,
                        ...(neutral.timestamp
                          ? { completedAt: neutral.timestamp }
                          : {}),
                      });
                    }
                    // Its item is over and its parent has the report: the
                    // turn that just ended was its last word.
                    sleepFinished(from.id);
                  };
                  if (delegate?.workItemId && !failed) {
                    // A work item's turn is answered before it is handed
                    // back: a rule's or the supervisor's reply keeps the item
                    // running and wakes its session into the next turn, and
                    // the parent hears nothing of this one. Only a turn no
                    // standing instruction answers goes back, and may end
                    // the item. Meaning rules and the supervisor answer once
                    // their model does; the hand-back waits for them.
                    answered()
                      .then((replied) => {
                        if (!replied) {
                          handBack(delegate);
                        }
                      })
                      .catch((error) => {
                        console.error(
                          `[hand-back] ${turnId}: ${error instanceof Error ? error.message : error}`
                        );
                      });
                  } else {
                    // A failed turn goes back at once and ends its item, so
                    // nothing answers it; a session that is not delegated
                    // work has its turn answered as it always has.
                    if (delegate) {
                      handBack(delegate);
                    }
                    // biome-ignore lint/complexity/noVoid: nothing waits on whether a rule answered a turn that is not held
                    void answered();
                  }
                }
              }
              // Standing instructions read the frames inside a turn as the
              // dashboards do; a turn's end is answered above.
              if (kind === "frame" && message.instanceId && !internal) {
                ruleEngine.observe(
                  message.instanceId,
                  (message.payload as FramePayload & { kind: "frame" }).message
                );
                usageCounter.observe(
                  message.instanceId,
                  (message.payload as FramePayload & { kind: "frame" }).message
                );
                supervisor.observe(
                  message.instanceId,
                  (message.payload as FramePayload & { kind: "frame" }).message
                );
              }
              // An agent only frames an error about a session that failed to start
              // or died on its own, so the row records it for whoever looks later.
              if (
                kind === "error" &&
                message.instanceId &&
                peek(message.payload, "verb") === "spawn"
              ) {
                const [process] = db.getInstancesByIds([message.instanceId]);
                if (
                  !process ||
                  peek(message.payload, "processGeneration") !==
                    processGeneration(process)
                ) {
                  break;
                }
                const reason =
                  peek(message.payload, "message") ?? "the session failed";
                turnWaiters.get(message.instanceId)?.reject(new Error(reason));
                db.failInstance(message.instanceId, reason);
                // A live work item whose session never started failed, and its
                // parent hears why rather than waiting on a report forever.
                const [unstarted] = db.getInstancesByIds([message.instanceId]);
                const line = unstarted?.workItemId
                  ? workItems.spawnFailed(unstarted, reason)
                  : undefined;
                if (unstarted && line !== undefined) {
                  reportToParent(unstarted, `${reason}${line}`, true);
                }
                workflowRuntime.observe(message.instanceId, reason);
                forgetPending(message.instanceId, reason);
                escalateRoutedAsks(message.instanceId);
                if (!internal) {
                  telegram?.onError(message.instanceId, reason);
                }
                publishInstances(message.machineId);
              }
              // A session's message to the owner, pushed without an ask: straight
              // to the bridge, tracked so a reply reaches the session that wrote it.
              if (kind === "user_message" && !internal) {
                telegram?.onUserMessage(message);
              }
              // An install answering, whoever asked for it: the cell is the hub's
              // to keep, and the reply still goes wherever it was going.
              const install = message.requestId
                ? pendingInstalls.get(message.requestId)
                : undefined;
              if (install && kind === "control_result" && message.requestId) {
                pendingInstalls.delete(message.requestId);
                const status = peekToolStatus(message.payload);
                if (status) {
                  db.setAgentToolCell(message.machineId, status);
                  publishInstances(message.machineId);
                }
              }
              // A transcript delete answering: once the machine says it is gone,
              // every row that named it goes with it, through the one
              // per-session delete, and every dashboard sees it leave.
              // A sync answering, whoever asked for it: the machine's own account
              // of what it now has is the hub's to keep, and the reply still goes
              // wherever it was going.
              if (
                message.requestId &&
                kind === "control_result" &&
                pendingFleet.has(message.requestId)
              ) {
                pendingFleet.delete(message.requestId);
                const report = peekFleetReport(message.payload);
                if (report) {
                  // Compare the machine's persisted content before overwriting
                  // its report; timestamps and insertion order cannot cause a reload.
                  const previous = db
                    .listAgents()
                    .find((row) => row.machineId === message.machineId)?.fleet;
                  const sameHashes = (
                    before: Record<string, string> = {},
                    after: Record<string, string> = {}
                  ): boolean =>
                    Object.keys(before).length === Object.keys(after).length &&
                    Object.entries(before).every(
                      ([key, hash]) => after[key] === hash
                    );
                  const skillsChanged = !sameHashes(
                    previous?.have?.skills,
                    report.have?.skills
                  );
                  const pluginsChanged = !sameHashes(
                    previous?.have?.plugins,
                    report.have?.plugins
                  );
                  const hooksChanged =
                    JSON.stringify(previous?.hooks ?? {}) !==
                    JSON.stringify(report.hooks ?? {});
                  db.setAgentFleet(message.machineId, report);
                  publishInstances(message.machineId);
                  refreshSessions(message.machineId, ws, [
                    ...(pluginsChanged ? ["reloadPlugins"] : []),
                    ...(skillsChanged && !pluginsChanged
                      ? [CONTROL_RELOAD_SKILLS]
                      : []),
                    ...(hooksChanged ? ["reinitialize"] : []),
                  ]);
                }
              }
              // A control a route is waiting on: the reply is that request's
              // answer and nobody else's news.
              if (kind === "control_result" && message.requestId) {
                lifecycle.answered(
                  message.requestId,
                  (message.payload as ControlResult).ok
                );
                const answering = waiting.get(message.requestId);
                if (answering) {
                  waiting.delete(message.requestId);
                  answering(message.payload as ControlResult);
                  break;
                }
              }
              // From here on the message is bound for dashboards, which get
              // images as references to fetch when shown, not as bytes.
              externalizeImages(message.payload);
              // A control's reply that settles a Ledger command turns into that
              // command's `applied`/`failed` ack. Read BEFORE the routing below
              // but allowed to preempt nothing: if a dashboard is also waiting on
              // this request id the old way, it still gets its reply.
              const settled =
                kind === "control_result" &&
                message.requestId !== undefined &&
                streams.settleCommand(
                  message.requestId,
                  message.payload as ControlResult
                );
              // A rewind that never started: its transcript was never cut.
              const rewound =
                kind === "control_result" && message.requestId
                  ? rewinds.get(message.requestId)
                  : undefined;
              if (rewound && message.requestId) {
                rewinds.delete(message.requestId);
                if (!(message.payload as ControlResult).ok) {
                  transcripts.reread(rewound);
                }
              }
              // A control's reply belongs to the dashboard that asked; the rest is fan-out.
              const requester =
                message.requestId && kind === "control_result"
                  ? registry.takeRequester(message.requestId)
                  : undefined;
              if (requester) {
                toDashboard(requester, message);
              }
              // An acknowledged command's reply is that command's news and nobody
              // else's — the same rule as the line above, in the newer dialect.
              // Without it the reply would fall through to the fleet-wide
              // broadcast that an unrouted `control_result` gets today, and every
              // dashboard would draw an error for a command it never sent.
              else if (settled) {
                break;
              } else if (kind === "control_result") {
                // A reply without a live requester is not fleet news. This
                // includes late answers after a socket closed or a read timed out.
                if (!hubReply) {
                  logUnroutedReply(message);
                }
                break;
              } else if (kind === "frame" && message.instanceId) {
                // Folded into the session's transcript here, for every frame and
                // whether or not anyone follows it: what it changed is sequenced
                // onto the session's stream, so the ring can answer a resume from
                // a socket that connects a minute from now. Everything else —
                // permission_request, instances, delegate_event, usage, pulse,
                // error, and any kind a future build adds — broadcasts, so an
                // unknown kind is never silently dropped.
                transcripts.ingest(
                  message.instanceId,
                  message.payload as TranscriptPayload
                );
              } else {
                registry.broadcast(message);
              }
              break;
            }
            default:
              console.warn(
                `[hub] unhandled verb ${message.verb} from ${message.machineId}`
              );
          }
        }),
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: releases each kind of machine-owned state when its socket goes away.
        close(ws) {
          const machineId = registry.dropAgent(ws.id);
          if (!machineId) {
            return;
          }
          // Sends to it wait for its next register, within the grace.
          const awaiting: Envelope<SendPayload>[] = [];
          awaitingMachine.set(machineId, awaiting);
          setTimeout(() => {
            if (awaitingMachine.get(machineId) === awaiting) {
              releaseAwaiting(machineId);
            }
          }, RECONNECT_GRACE_MS);
          for (const [requestId, machine] of waitingMachines) {
            if (machine === machineId) {
              waiting.get(requestId)?.({
                kind: "control_result",
                requestId,
                ok: false,
                error: MACHINE_DISCONNECTED,
              });
            }
          }
          // A summariser's turn cannot end where nobody hears it: its
          // continuation waits for the machine's next register instead.
          for (const waiter of turnWaiters.values()) {
            if (waiter.machineId === machineId) {
              waiter.reject(new MachineAway(machineId));
            }
          }
          // A preview outlives its machine's socket: the intent stays, without
          // a listener, until the register that brings the machine back
          // starts one again (see `reconcilePreviews`). Nothing is published;
          // the panes keep the page they have until that "open" reloads them.
          for (const [instanceId, target] of previewTargets) {
            if (target.machineId === machineId) {
              nextPreviewGeneration(instanceId);
              previewTargets.set(instanceId, {
                machineId,
                source: target.source,
                revision: target.revision,
              });
            }
          }
          // The install may well still be running out there, but its reply can no
          // longer arrive on this socket — and the register that follows carries
          // the machine's own account of what landed.
          for (const [requestId, install] of pendingInstalls) {
            if (install.machineId === machineId) {
              pendingInstalls.delete(requestId);
            }
          }
          for (const [requestId, syncing] of pendingFleet) {
            if (syncing === machineId) {
              pendingFleet.delete(requestId);
            }
          }
          db.markAgentOffline(machineId);
          // Its update state was true of a connection that has just ended.
          binaryUpdateStates.delete(machineId);
          machineCustody.delete(machineId);
          addressProtocolMachines.delete(machineId);
          lifecycle.disconnect(machineId);
          db.reconcileInstances(machineId, []);
          publishInstances(machineId);
        },
      })
      .ws("/ws/dashboard", {
        // Offered to the browser; every frame then goes out with `toDashboard`,
        // which sets the flag Bun compresses on.
        perMessageDeflate: true,
        open(ws) {
          // A page names the wire it was built for (WIRE_PROTOCOL, 5). One
          // that names none was built before pages did: a browser sends
          // `Origin` on every socket it opens, and the clients that are not
          // pages (the Apple app, scripts) send none and read this wire.
          const named = Number(ws.query.protocol);
          const older = Number.isFinite(named)
            ? named < WIRE_PROTOCOL
            : Boolean(ws.headers.origin);
          if (older) {
            console.warn(
              `[hub] dashboard page at ${ws.headers.origin ?? ws.remoteAddress} is on wire ${Number.isFinite(named) ? named : "4 or older"}, this hub on ${WIRE_PROTOCOL}: it is sent the snapshot only, until it reloads`
            );
          }
          registry.addDashboard(ws, older);
          // The one moment the hub learns a URL that reaches its own dashboard:
          // this browser just used one. See `dashboardUrl` in telegram.ts.
          registry.noteDashboardOrigin(ws.headers.origin);
          // The board, before it is asked for: the FIRST message every
          // dashboard receives, unconditionally, so the rail fills before the
          // REST snapshot lands.
          toDashboard(ws, instancesFrame(""));
          // A reconnected dashboard earns the current sign-in state again.
          // biome-ignore lint/complexity/noVoid: snapshot follows startup discovery on this socket
          void mcpReady.then(async () => {
            await fleetMcp.ready();
            if (ws.readyState !== 1) {
              return;
            }
            toDashboard(ws, {
              verb: "frames",
              machineId: "",
              payload: { kind: "fleet_mcp", servers: db.fleetConfig().mcp },
            } satisfies Envelope<FramePayload>);
          });
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every dashboard socket message shape (stream protocol, control, send, ack) through one handler; splitting it would scatter the ordering guarantees across several functions.
        message: guardedDashboardMessage((ws, message) => {
          // The Ledger Protocol's own shapes are not envelopes and must be read
          // before the envelope check, which would otherwise log them as junk.
          if (streams.handleClientMessage(ws, message)) {
            return;
          }
          if (!isEnvelope(message)) {
            console.warn("[hub] dropped malformed dashboard frame", message);
            return;
          }

          switch (message.verb) {
            case "spawn": {
              // The row's key, not the client's — see `enforceRowSessionKey`.
              const refusal = enforceRowSessionKey(
                message.instanceId
                  ? db.getInstancesByIds([message.instanceId])[0]
                  : undefined,
                message.payload
              );
              if (refusal) {
                console.warn(`[hub] refused spawn: ${refusal}`);
                toDashboard(ws, failure(message, refusal));
                break;
              }
              // No session the fleet starts takes its model from a machine's
              // default: a dashboard spawn always names one, and one that does
              // not is a path that forgot to. Its permission mode is the one
              // rule's (`settleMode`): explicit bypass when omitted for a
              // harness with modes, and none for one that has none.
              const settled = peek(message.payload, "model")
                ? settleMode(message.machineId, message.payload as SpawnPayload)
                : {
                    refusal:
                      "A session the dashboard starts must name its model; this spawn named none, so it would have run on the machine's default. Nothing was started.",
                  };
              if ("refusal" in settled) {
                console.warn(`[hub] refused spawn: ${settled.refusal}`);
                toDashboard(ws, failure(message, settled.refusal));
                break;
              }
              if (registry.agent(message.machineId) && message.instanceId) {
                // A relaunch replaces the process — questions the old one had
                // open are settled by its teardown and must not replay.
                forgetPending(message.instanceId, UNREAD.restarted);
                noteRespawn(
                  message.instanceId,
                  message.requestId,
                  message.payload
                );
                // Brought back by the operator: nothing of the stop is left to carry.
                db.openInstance({
                  id: message.instanceId,
                  addressProtocol: addressProtocolMachines.has(
                    message.machineId
                  ),
                  machineId: message.machineId,
                  cwd: peek(message.payload, "cwd") ?? "",
                  sessionId: peekResume(message.payload),
                  harness: peekHarness(message.payload),
                  projectId: peek(message.payload, "projectId"),
                  title: peek(message.payload, "title"),
                  kind: peekKind(message.payload),
                  permissionMode: settled.permissionMode,
                  model: peek(message.payload, "model"),
                  ...peekParent(message.payload),
                });
                if (holdingStarts(message.machineId)) {
                  // The row says starting; the start goes out when the machine can take it.
                  db.oweSpawn(
                    message.instanceId,
                    JSON.stringify({
                      ...message,
                      payload: bounded(settled.payload),
                    }),
                    Date.now()
                  );
                } else {
                  forward(
                    { ...message, payload: bounded(settled.payload) },
                    ws
                  );
                }
                // A conversation that starts here: its first turn is its name.
                if (!peekResume(message.payload)) {
                  awaitingFirstTurn.add(message.instanceId);
                }
                publishInstances(message.machineId);
              } else {
                toDashboard(
                  ws,
                  failure(
                    message,
                    `machine ${message.machineId} is not connected`
                  )
                );
              }
              break;
            }
            case "stop":
              // A Stop is the operator's decision, and it is filed here the
              // moment it is made rather than when the machine confirms it.
              // Waiting for the machine lost it: a Stop sent while the agent
              // was restarting reached no agent (or one already detaching),
              // the process lived on under sessiond, and the register after
              // the restart restored it as a session the user had left
              // running. Filed `stopped`, the row is no orphan to restore,
              // no beat promotes it, and the first beat that still lists a
              // process for it ends that process (`endStopped`, in the
              // heartbeat case). Only a send brings it back (`ensureAlive`).
              // Both Stop and Discard wait for the machine's teardown receipt.
              // Persisting intent is not proof that the runner has ended.
              stopFromDashboard(ws, message);
              // A stop cuts the turn it lands in, as an interrupt does.
              if (message.instanceId) {
                noteInterrupt(message.instanceId);
              }
              break;
            case "control":
              relayControl(message as Envelope<ControlPayload>, ws);
              break;
            case "fs":
              // Answered on `control_result` too, so the same requester map routes it.
              forward(message, ws);
              break;
            default:
              // The client is named: a verb no build sends any more comes
              // from a page or app still running an older one.
              console.warn(
                `[hub] unhandled dashboard verb ${message.verb} from ${ws.headers["user-agent"] ?? "a client with no user agent"} at ${ws.headers.origin ?? ws.remoteAddress}`
              );
          }
        }),
        close(ws) {
          registry.dropDashboard(ws);
          // Follows nothing, awaits nothing: a stream subscription and a command
          // ack both die with the socket that asked for them.
          streams.dropSocket(ws.id);
        },
      })
  );
};
