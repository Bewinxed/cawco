import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { generateCodeChallenge, generateCodeVerifier } from "@cawco/auth";
import type {
  AgentBusyReport,
  AgentRow,
  ArchiveView,
  BuildInfo,
  CarrySessionOutcome,
  CarrySessionRequest,
  CommandResult,
  ContinuationJob,
  ContinueStep,
  ControlPayload,
  DelegateEvent,
  Envelope,
  ErrorFrame,
  FleetConfig,
  FleetHoldings,
  FleetHook,
  FleetMcpConfig,
  FleetSkillMeta,
  FleetSyncReport,
  FramePayload,
  FsMedia,
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
  LaunchAsk,
  LaunchGrant,
  MachineHookScript,
  MachineMemorySet,
  ModelInfo,
  MoveProgressFrame,
  MoveRequest,
  NeutralAssistantMessage,
  NeutralOrigin,
  NeutralResultMessage,
  NeutralSessionInfo,
  NeutralUserMessage,
  OpenCodeGoLimits,
  PermissionMode,
  PermissionRequestFrame,
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
  ThreadSummary,
  ToolState,
  ToolStatus,
  TranscriptWhere,
  UpdateReport,
  UsageBucket,
  UsageLimitsResponse,
  UsageSpend,
  WorkspaceRef,
} from "@cawco/core";
import {
  ACCOUNT_HUES,
  ACCOUNT_KINDS,
  ACCOUNT_MOVE,
  ACCOUNT_READ,
  type Account,
  type AccountBorrowFrame,
  type AccountIdentity,
  type AccountJoined,
  type AccountJoinedOn,
  type AccountKind,
  type AccountMove,
  type AccountProbe,
  type AccountProvider,
  type AccountReport,
  type AccountSigninResult,
  AGENT_BUSY,
  ASK_USER_QUESTION,
  ATTACHMENTS_HOME,
  accountMoveWords,
  accountName,
  accountProvidersOf,
  agentProblem,
  archiveRefusal,
  attachedFileLine,
  attachedFileName,
  BOUNDARY_RELAUNCH,
  BUCKET_MS,
  CANCEL_BINARY_UPDATE,
  CLAUDE_CONVERSATION_GONE,
  CLAUDE_PROVIDER,
  CONFIGURE_BINARY_UPDATES,
  CONTINUATION_ORIGIN,
  CONTROL_ACCOUNT_LENT,
  CONTROL_BEGIN_ACCOUNT_LOGIN,
  CONTROL_BEGIN_PROVIDER_LOGIN,
  CONTROL_BORROW_ACCOUNT,
  CONTROL_CARRY_SESSIONS,
  CONTROL_COMPLETE_ACCOUNT_LOGIN,
  CONTROL_COMPLETE_PROVIDER_LOGIN,
  CONTROL_CONTEXT_USAGE,
  CONTROL_FORGET_ACCOUNT,
  CONTROL_FORGET_PROVIDER_ACCOUNT,
  CONTROL_GET_SESSION_INFO,
  CONTROL_GET_SESSION_MESSAGES,
  CONTROL_GIT_CHANGES,
  CONTROL_INTERRUPT,
  CONTROL_JOIN_ACCOUNT_LOGIN,
  CONTROL_JOIN_PROVIDER_ACCOUNT,
  CONTROL_LEND_ACCOUNT,
  CONTROL_LIST_SESSIONS,
  CONTROL_MODEL_CATALOG,
  CONTROL_MOVE_HOME_CREDENTIAL,
  CONTROL_MOVE_HOME_LOGIN,
  CONTROL_PI_DEFAULT_MODEL,
  CONTROL_PROBE_ACCOUNT,
  CONTROL_READ_HOME_CREDENTIALS,
  CONTROL_READ_HOME_LOGIN,
  CONTROL_READ_SESSION_CONTEXT,
  CONTROL_REFRESH_CAWCO_TOOLS,
  CONTROL_RELOAD_SKILLS,
  CONTROL_RESTLESS,
  CONTROL_RUN_COMMAND,
  CONTROL_SEARCH_TRANSCRIPTS,
  CONTROL_SET_MODEL,
  CONTROL_SET_PERMISSION_MODE,
  CONTROL_SET_PROVIDER_KEY,
  CONTROL_SLEEP,
  CONTROL_WORKSPACE_ARCHIVE,
  CONTROL_WORKSPACE_AT,
  CONTROL_WORKSPACE_BOUNDARY,
  CONTROL_WORKSPACE_BUNDLE,
  CONTROL_WORKSPACE_CREATE,
  CUSTODY_HELD,
  contextFitRefusal,
  delegateAskText,
  deriveTitleFromFirstMessage,
  EFFORT_NONE,
  EFFORT_READ,
  estimateTokens,
  FLEET_STATUS,
  FLEET_SYNC,
  FRESH_START,
  GENERATE_IMAGE,
  HARNESSES,
  HOOK_TEMPLATES,
  type HomeCredential,
  type HomeLogin,
  type HomeLoginMoved,
  type HomeStore,
  hookProblem,
  IMAGE_GENERATION_TIMEOUT_MS,
  INSPECT_CONFIG,
  INSTALL_SESSION_CREDENTIAL,
  interruptLine,
  isEffortLevel,
  LIMITED_PROVIDERS,
  LIVE_CREDENTIAL_ENROLLMENT_REFUSAL,
  MCP_OAUTH_RETURN_PATH,
  MESSAGES_HELD,
  MESSAGES_READ,
  MESSAGES_STORED,
  MOVED_HERE,
  machineLabel,
  memoryDocProblem,
  type NeutralSystemMessage,
  namedAccount,
  PLACEMENT_STRATEGIES,
  type PlacementPreview,
  type PlacementStrategy,
  PREVIEW_START,
  PREVIEW_START_PATH,
  PREVIEW_STOP,
  PROVIDER_ACCOUNT_KINDS,
  PROVIDER_RETRY,
  type ProviderAccountReading,
  type ProviderChoice,
  type ProviderForecast,
  type ProviderInfo,
  type ProviderSigninChallenge,
  type ProviderSigninResult,
  parseAgentFrontMatter,
  providerChoices,
  providerLimitRefused,
  QUESTION_DISMISSED,
  questionsOf,
  RATE_LIMIT_READ,
  READ_FLEET_HOLDINGS,
  READ_HOOK_SCRIPT,
  READ_MEMORY_FILE,
  READ_SKILL_FILES,
  RESOLVE_PERMISSION,
  RESTART_RESUMABLE,
  type RebalanceNotice,
  type Relaunch,
  RULE_TEMPLATES,
  readProvenance,
  rebalanceWords,
  relaunchOf,
  reportMarker,
  ruleProblem,
  runDoing,
  SERVER_STOPPED_MID_TURN,
  SESSION_DIR_READ,
  SUMMARISER_OUTPUT_RESERVE_TOKENS,
  SUMMARY_CAP_TOKENS,
  sameIdentity,
  strategiesFor,
  TARGET_HEADROOM_TOKENS,
  TOOL_CATALOG,
  toolSpec,
  transcriptUserText,
  UPDATE_CAWCO,
  undeliveredNotice,
  unshownAskMessage,
  validateWorkflow,
  WIRE_PROTOCOL,
  WITHDRAW_PERMISSION,
  WORKSPACE_CREATE_TIMEOUT_MS,
} from "@cawco/core";
import {
  AGENT_RESTARTING,
  BINARY_UPDATE_PHASES,
  type BinaryUpdatePhase,
  type BinaryUpdatePolicy,
  type BinaryUpdateState,
} from "@cawco/core/binary-updates";
import { detach } from "@cawco/core/detach";
import { hashFiles } from "@cawco/core/file-hash";
import { machineId as hostMachineId } from "@cawco/core/machine-id";
import { WIRE_MESSAGE_LIMIT_BYTES } from "@cawco/core/wire";
import { Elysia, t, ValidationError } from "elysia";
import { websocket } from "elysia/websocket";
import {
  type AccountProber,
  accountOfIdentity,
  keepProbe,
  machineAccount,
  machineReadings,
  noteProviderReading,
  noteRateLimit,
  reconcileAccounts,
  sessionLimitsReader,
} from "./accounts";
import { createAdminAsks } from "./admin-asks";
import { adminTools, isAdminWrite } from "./admin-tools";
import { appleDiagnosticsRoutes } from "./apple-diagnostics";
import {
  answeredWithOriginal,
  clientCopy,
  createAskPresenter,
} from "./ask-presentation";
import {
  cacheCarries,
  createAtLimit,
  type KeptSummary,
  type Summarised,
} from "./at-limit";
import { createBinaryUpdates } from "./binary-updates";
import { bodyLimitRefusal } from "./body-limits";
import { type Caw, cawRoutes, createCaw, withCawDenials } from "./caw";
import {
  DB_PATH,
  GIT_ROOT,
  HUB_VERSION,
  LFS_ROOT,
  SPAWN_START_TIMEOUT_MS,
} from "./config";
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
  BoardInstanceRow,
  ContinuationRow,
  DbShape,
  InstanceKind,
  PlaceRow,
  ProjectRow,
  PublicInstanceRow,
  SentMessageRow,
  WorkItemRow,
} from "./db";
import { checkoutOf, hashHookMaterial, listedAt, TURN_UNRECORDED } from "./db";
import type { LoginMove } from "./db/accounts";
import type { PriorConversation } from "./db/schema";
import { buildDecisionPage, type PageSources } from "./decision-page";
import { delegateTypesRoutes, makeDelegateTypes } from "./delegate-types";
import {
  hubHttpUrl,
  type SendDelivery,
  type SendHold,
} from "./delegation-actions";
import { createDelegationMcp } from "./delegation-mcp";
import { createDelegationTree } from "./delegation-tree";
import { createDispatcher, dispatchRoutes } from "./dispatch";
import { faviconRoutes } from "./favicon";
import { fleetChoicesRoutes } from "./fleet-choices";
import { FleetMcp } from "./fleet-mcp";
import { accountForecasts, carrySequence } from "./forecast";
import { gitRemoteRoutes } from "./git-remote";
import type { HarnessPlanDeps } from "./harness-plans";
import { hidden } from "./hidden";
import { joinRoutes } from "./join";
import { streamLargeJson } from "./json-response";
import {
  createKeepAliveScheduler,
  isKeepAlive,
  type KeepAliveRow,
  keepAliveResult,
  keepAliveState,
  keepAliveUsage,
  promptCacheExpiresAt,
} from "./keep-alive";
import { type LabelledRow, leafOf, sessionLabel } from "./labels";
import type { HubLifetimeShape, HubTimer } from "./lifetime";
import { probe } from "./llm";
import { basicCaller, createMachineCredentials } from "./machine-credentials";
import { MeaningJudge } from "./meaning";
import {
  externalizeImages,
  mediaBase64,
  mediaContentType,
  mediaFilePath,
  storedFilePath,
  storeFile,
} from "./media";
import { createMoves, MoveAway, MoveRefused } from "./moves";
import { createNoticesSeen } from "./notices";
import type { PendingShape } from "./pending";
import {
  answerPermission,
  answerWorkflow,
  onPermissionAnswer,
  onWorkflowAnswer,
  workflowRunOf,
} from "./pending";
import {
  noAccountRefusal,
  type PlacementInput,
  place as placeAccount,
} from "./placement";
import { createPlans, planRoutes } from "./plans";
import {
  isHubDirectory,
  pluginMarketplace,
  resolveMarketplacePlugins,
} from "./plugins";
import { previewFrame, previewTargets } from "./preview";
import {
  canvasChoices,
  canvasId,
  DECISION_PAGE,
  previewChoicesRoutes,
} from "./preview-choices";
import { createCaps } from "./project-caps";
import {
  makeProjectDelegateTypes,
  projectDelegateTypesRoutes,
} from "./project-delegate-types";
import {
  FolderRefusal,
  listFolder,
  projectFolderRoutes,
  projectRoot,
  readFolderFile,
  trashProjectFolder,
  writeFolderFile,
} from "./project-folder";
import { type MergeDeps, mergeSameRemote } from "./project-merge";
import { createProjectOffers, projectOfferRoutes } from "./project-offers";
import {
  foldPlacedStates,
  hasProjectRows,
  onPlacesChanged,
  placedCopies,
  placedHooks,
  placesChanged,
  unbound,
} from "./project-placements";
import { createProjectStops } from "./project-stops";
import { placePath, readRemote } from "./projects";
import { createPush, pushRoutes } from "./push";
import {
  type ForecastRead,
  kindBurn,
  readForecast,
  sessionBurn,
} from "./rebalance";
import { envelopeFault, type RegistryShape, refusalFrame } from "./registry";
import { RuleEngine } from "./rules";
import { createSessionIdentities } from "./session-identity";
import { createSessionLifecycle } from "./session-lifecycle";
import { resolveSkill } from "./skills";
import { type StagesTemplate, TEMPLATES, templateText } from "./stages";
import { createStreamHub } from "./stream";
import { suggest } from "./suggest";
import { SupervisorEngine } from "./supervisor";
import { TaskDoc } from "./task-file";
import {
  BUDGET,
  createTasks,
  hubActor,
  LANDS,
  sessionActor,
  taskRoutes,
  YOU_ACTOR,
} from "./tasks";
import {
  dashboardUrl,
  type MediaReader,
  type TelegramBridge,
} from "./telegram";
import {
  createTranscripts,
  type HistoryFault,
  type HistoryRead,
  type TranscriptPayload,
} from "./transcripts";
import { turnUsageOf } from "./turn-usage";
import { unwatchedMode } from "./unwatched-mode";
import { UsageCounter } from "./usage-count";
import { createViews, viewRoutes } from "./views";
import {
  closeLine,
  drainLine,
  type HubSocket,
  openLine,
  receiveFrame,
  sendFrame,
} from "./wire-socket";
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

/** What a `show_preview` ask may name, as the preview route reads it. */
interface PreviewAsk {
  dir?: string;
  page?: string;
  path?: string;
  port?: number;
}

/** Why a preview ask names no one thing to show, or undefined when it does. */
const previewAskRefusal = (ask: PreviewAsk): string | undefined => {
  if (ask.page === undefined) {
    return (ask.port === undefined) === (ask.dir === undefined)
      ? "Pass exactly one of port or dir, or a page."
      : undefined;
  }
  if (ask.port !== undefined) {
    return "A page is shown from a folder, not a port.";
  }
  return ask.path === undefined
    ? undefined
    : "A decision page opens at its own root; path is for port or dir.";
};

/** A dev server or folder on the session's machine, opened at the page the ask names. */
const machinePreviewSource = (ask: PreviewAsk): PreviewSource => {
  const at = ask.path === undefined ? {} : { path: ask.path };
  return ask.port === undefined
    ? { dir: ask.dir as string, ...at }
    : { port: ask.port, ...at };
};

/** A `Range: bytes=a-b` header (one range, either end open). */
const BYTE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * A file's bytes as an answer to a request that may ask for a range of them:
 * a video element asks for ranges, and Safari plays nothing from a server
 * that answers a range with the whole file.
 */
const rangedResponse = (
  bytes: Uint8Array<ArrayBuffer>,
  mediaType: string,
  rangeHeader: string | null
): Response => {
  const total = bytes.byteLength;
  const headers = {
    "Content-Type": mediaType,
    "Cache-Control": "no-store",
    "Accept-Ranges": "bytes",
  };
  const range = BYTE_RANGE.exec(rangeHeader ?? "");
  if (!(range && (range[1] || range[2]))) {
    return new Response(bytes, {
      headers: { ...headers, "Content-Length": String(total) },
    });
  }
  const [, from, to] = range;
  const start = from ? Number(from) : Math.max(0, total - Number(to));
  const end = from && to ? Math.min(Number(to), total - 1) : total - 1;
  if (start > end || start >= total) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${total}` },
    });
  }
  return new Response(bytes.slice(start, end + 1), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": String(end - start + 1),
    },
  });
};

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
 * At a hub start, the sends a machine was handed before the hub kept each
 * whole: kept now from their records ({@link envelopeOf}), so a process that
 * goes before reading one leaves its next one something to read.
 * Idempotent: once each has its own, none is left to keep.
 */
/**
 * Why a send failed when it failed only because a process went away, as the
 * hub said it before a send was the hub's to keep (UNREAD), or because the
 * account's limit refused the turn that read it: in both the session still
 * ought to read it.
 */
const LIMIT_REFUSED_WORDS = /usage limit|hit your limit|rate[ _-]?limit/i;
const failedOnlyForAProcess = (reason: string): boolean =>
  (Object.values(UNREAD) as string[]).includes(reason) ||
  LIMIT_REFUSED_WORDS.test(reason);

/**
 * At start, before any machine is heard: each chain of sessions a hub before
 * this one made of one at its account's limit is folded into the session at
 * its end, the one that runs (db `foldFormerSessions`, once per former row).
 * Answers the sends that failed only because a process went away, pending
 * again for that session: kept whole and owed by the caller.
 */
const foldFormerSessions = (db: DbShape): string[] => {
  const folded = db.foldFormerSessions(failedOnlyForAProcess);
  for (const one of folded) {
    console.log(
      `[hub] folded ${one.formers.join(", ")} into ${one.instanceId}: one session from here${one.ending.length > 0 ? `; ${one.ending.join(", ")} ended at its machine's next register` : ""}${one.owedAgain.length > 0 ? `; ${one.owedAgain.length} send(s) a process lost owed to it again` : ""}`
    );
  }
  return folded.flatMap((one) => one.owedAgain);
};

/**
 * What a hub that starts holds of the sends before it: the chains of
 * sessions a hub before this one split at an account's limit folded first
 * (migration 0128), each one session from here; every pending send kept
 * whole; and what the fold found a process lost owed again — or, with an
 * image no longer stored, failed as it can no longer be sent.
 */
const keepSendsAtStart = (db: DbShape): void => {
  const owedAgain = foldFormerSessions(db);
  keepPendingWhole(db);
  for (const uuid of owedAgain) {
    if (!db.oweAgain(uuid) && db.sendRecord(uuid)?.state === "pending") {
      db.updateSend(uuid, {
        state: "failed",
        reason:
          "An image it carried is no longer stored, so it could not be sent again.",
      });
    }
  }
};

const keepPendingWhole = (db: DbShape): void => {
  let keptWhole = 0;
  for (const send of db.unkeptSends()) {
    const [row] = db.getInstancesByIds([send.instanceId]);
    const envelope = row && envelopeOf(send, row.machineId);
    if (envelope) {
      db.keepEnvelope(send.uuid, JSON.stringify(envelope));
      keptWhole += 1;
    } else {
      console.warn(
        `[hub] send ${send.uuid} to ${send.instanceId} could not be kept whole: ${row ? "an image it carried is no longer in the media store" : "its session is gone"}`
      );
    }
  }
  if (keptWhole > 0) {
    console.log(`[hub] boot: kept ${keptWhole} pending send(s) whole`);
  }
};

/**
 * A pending send whole again from its record, as its machine was handed it
 * (`sentFrame`, read backwards): the images it led with, out of the media
 * store, and the rest its message — one text block back to the words it
 * was, the files and pasted text folded in as they went. Undefined when an
 * image it carried is no longer stored.
 */
const envelopeOf = (
  send: SentMessageRow,
  machineId: string
): Envelope<SendPayload> | undefined => {
  const body = send.body as unknown as SentMessage;
  const said = body.message.content;
  const blocks = typeof said === "string" ? [] : said;
  const images: { mediaType: string; data: string }[] = [];
  let at = 0;
  for (; at < blocks.length; at += 1) {
    const block = blocks[at] as {
      type: string;
      source?: { type?: string; url?: string; media_type?: string };
    };
    if (block.type !== "image") {
      break;
    }
    const data =
      block.source?.type === "url" && block.source.url
        ? mediaBase64(block.source.url)
        : undefined;
    if (!(data && block.source?.media_type)) {
      return;
    }
    images.push({ mediaType: block.source.media_type, data });
  }
  const rest = blocks.slice(at);
  const only = rest.length === 1 ? (rest[0] as { text?: unknown }) : undefined;
  let content: SentMessage["message"]["content"] = rest;
  if (typeof said === "string") {
    content = said;
  } else if (typeof only?.text === "string") {
    content = only.text;
  }
  return {
    verb: "send",
    machineId,
    instanceId: send.instanceId,
    payload: {
      instanceId: send.instanceId,
      message: {
        ...body,
        message: { ...body.message, content } as SentMessage["message"],
      },
      ...(images.length > 0 ? { images } : {}),
    },
  };
};

/** A clock time as a hand-back says it: `12:09 UTC`. */
const utcClock = (at: Date): string => `${at.toISOString().slice(11, 16)} UTC`;

/** What a hand-back asks of the session it goes to. */
const CARRY_ON_CUT = "Carry on from where it stopped.";

/** The system origin name of the hub's word that a session at its account's limit may go on (at-limit.ts `CARRY_ON_ORIGIN`). */
const LIMIT_ORIGIN = "limit";

/** What a session restored after a restart is told of the turn that restart cut. */
const restartedWords = (restartedAt: Date): string =>
  `CawCo restarted this session's process at ${utcClock(restartedAt)} while your turn was running. ${CARRY_ON_CUT}`;

/** What a session whose process a signal killed is told of the turn that kill cut. */
const killedWords = (signal: string, killedAt: Date): string =>
  `Your process was killed (${signal}) at ${utcClock(killedAt)} while your turn was running, and CawCo started it again. ${CARRY_ON_CUT}`;

/** What a delegate's session asleep on a cut turn is told when the hub wakes it to carry on. */
const unresumedWords = (lastHeard: Date): string =>
  `A restart cut your turn after ${utcClock(lastHeard)}, and nothing resumed it. ${CARRY_ON_CUT}`;

/**
 * Where a session's last turn stopped when it never finished, by its
 * harness's own transcript: the session's last user or assistant entry is
 * not the assistant entry its model ended a turn with (`turnEnd`: Claude's
 * `end_turn`, opencode's finished `stop`, pi's `stop`) or a failure written
 * in the model's place, nor Claude's own line for a turn its reader stopped,
 * and no failed or stopped turn's result follows it (pi and opencode store
 * those as one). A prompt or a tool result nothing answered, or an answer cut
 * mid-way. Nothing for a transcript whose last turn ended, or holds none.
 *
 * Read for a session from before the hub kept the turn it had open
 * ({@link TURN_UNRECORDED}).
 */
const cutEntry = (
  entries: readonly SessionMessage[]
): { key: string; at: Date } | undefined => {
  for (let at = entries.length - 1; at >= 0; at -= 1) {
    const entry = entries[at];
    if (entry.type === "system") {
      if ((entry.message as { type?: string } | null)?.type === "result") {
        return undefined;
      }
      continue;
    }
    if (entry.type === "assistant" && (entry.turnEnd || entry.error)) {
      return undefined;
    }
    if (
      entry.type === "user" &&
      interruptLine(transcriptUserText(entry.message))
    ) {
      return undefined;
    }
    const written = entry.timestamp ? new Date(entry.timestamp) : undefined;
    return written && !Number.isNaN(written.getTime())
      ? { key: `entry:${entry.uuid}`, at: written }
      : undefined;
  }
  return undefined;
};

/**
 * A uuid `name` alone decides (the version-5 layout, over SHA-256): a send
 * made again under it is the same send, which the hub hands over once.
 */
const uuidOf = (name: string): string => {
  const hex = createHash("sha256").update(name).digest("hex");
  // The RFC 4122 variant: the nibble's top two bits are `10`.
  const variant = "89ab".charAt(Number.parseInt(hex.charAt(16), 16) % 4);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

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

/**
 * Statuses a session's row holds once its process has ended, or once its end
 * is decided: whether a process still runs is its machine's custody to say.
 */
const NO_PROCESS_STATUSES: ReadonlySet<string> = new Set([
  "stopped",
  "discarded",
  "error",
]);

/** Why a carry left a session's data where it was: its process runs there. */
const PROCESS_RUNS = "its process runs";
/**
 * An account sign-in step on a machine: Claude Code printing its link (the
 * agent waits up to 30 s), or exchanging the code (up to 60 s) and reading
 * its status back.
 */
const SIGNIN_TIMEOUT_MS = 90_000;
const accountHue = t.Union(ACCOUNT_HUES.map((hue) => t.Literal(hue)));
/** An account provider's id: Claude's `anthropic`, or a provider pi or OpenCode speaks. */
const accountProvider = t.String({
  minLength: 1,
  pattern: "^[a-z0-9][a-z0-9._-]*$",
});
/** One of a machine's own stores a credential is moved out of. */
const homeStore = t.Union([
  t.Literal("claude"),
  t.Literal("pi"),
  t.Literal("opencode"),
]);
const strategyChoice = t.Object({
  strategy: t.Union(PLACEMENT_STRATEGIES.map((one) => t.Literal(one))),
  pinnedAccountId: t.Optional(t.String()),
});
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
/** The origin of the hub's word to a sender that its message did not arrive. */
const UNDELIVERED_ORIGIN = "undelivered";
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
    machine: t.Optional(t.String()),
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
  t.Literal("fullSend"),
]);

const continueBody = t.Object({
  summarizer: t.Object({
    harness: harnessSchema,
    model: t.Optional(t.String({ minLength: 1 })),
  }),
  target: t.Object({
    harness: harnessSchema,
    model: t.Optional(t.String({ minLength: 1 })),
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
  // The session goes on itself, in a fresh conversation, rather than in a
  // new session: what `continue_session` asks when it names no session.
  inPlace: t.Optional(t.Boolean()),
  // What rides the new session's opening message beside its words, as a
  // send carries it. The summariser is never handed them.
  images: t.Optional(
    t.Array(t.Object({ mediaType: t.String(), data: t.String() }))
  ),
  attachments: t.Optional(
    t.Array(
      t.Union([
        t.Object({
          kind: t.Literal("text"),
          name: t.String(),
          content: t.String(),
        }),
        t.Object({
          kind: t.Literal("file"),
          name: t.String(),
          mediaType: t.String(),
          size: t.Integer({ minimum: 0 }),
          ref: t.String({ pattern: "^/api/files/" }),
        }),
      ])
    )
  ),
});

/** `POST /api/projects/:id/moves`: core `MoveRequest`. */
const moveBody = t.Object({
  approved: t.Optional(t.String({ minLength: 1 })),
  machineId: t.String({ minLength: 1 }),
  path: t.Optional(t.String({ pattern: "^(/|~/)" })),
  spawn: t.Object({
    harness: t.Optional(harnessSchema),
    model: t.Optional(t.String({ minLength: 1 })),
    effort: t.Optional(
      t.Union([
        t.Literal("low"),
        t.Literal("medium"),
        t.Literal("high"),
        t.Literal("xhigh"),
        t.Literal("max"),
      ])
    ),
    permissionMode: t.Optional(permissionModeSchema),
    account: t.Optional(t.String({ minLength: 1 })),
    title: t.Optional(t.String()),
  }),
  prompt: t.Optional(t.String()),
  images: continueBody.properties.images,
  attachments: continueBody.properties.attachments,
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
  /** Every timer the hub starts, and the one path that stops them all (lifetime.ts). */
  readonly lifetime: HubLifetimeShape;
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
/** This hub process, random at its start (RegisterAckPayload.hubEpoch). */
const HUB_EPOCH = crypto.randomUUID();

const registerAck = (
  envelope: Envelope,
  ingested: Record<string, IngestMark>,
  unknownAccounts: string[] | undefined,
  sessions: CarrySessionRequest[],
  machineCredential: string
): Envelope<RegisterAckPayload> => ({
  verb: envelope.verb,
  machineId: envelope.machineId,
  payload: {
    ok: true,
    ingested,
    addressContract: true,
    hubEpoch: HUB_EPOCH,
    machineCredential,
    ...(unknownAccounts ? { unknownAccounts } : {}),
    sessions,
  },
});

/** Sent back as a frame, the only verb a dashboard renders. */
const failure = (envelope: Envelope, message: string): Envelope<ErrorFrame> =>
  refusalFrame(envelope, message, envelope.verb);

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
  // A mode the session moved to mid-turn (plan mode, Full Send ended), filed
  // now rather than at the next turn's `init`, so a restart restores it.
  if (
    frame.subtype === "status" &&
    typeof frame.permissionMode === "string" &&
    !frame.parent_tool_use_id
  ) {
    return { permissionMode: frame.permissionMode };
  }
  if (frame.subtype === "model_fallback") {
    return { model: frame.fallback_model };
  }
  return undefined;
};

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
 * it. `rowOf` reads one listed row by its key; `parentInstanceId` is the
 * spawn's immediate parent.
 */
export const resolveDelegatePermissionMode = (
  rowOf: (id: string) => InstanceRow | undefined,
  parentInstanceId: string
): string | undefined => {
  const seen = new Set<string>();
  let current: string | undefined = parentInstanceId;
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = rowOf(current);
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
 */
export const resolveCanDelegate = (parent: InstanceRow | undefined): boolean =>
  !!parent && parent.canDelegate !== false;

/**
 * Urgency is only honoured toward the caller's own delegate; anything else
 * downgrades to a normal queued send. Mutates the relay body in place.
 */
const downgradeNonDelegateUrgent = (
  row: InstanceRow | undefined,
  body: unknown,
  instanceId: string
): void => {
  if ((body as { urgent?: unknown }).urgent !== true) {
    return;
  }
  const from = peek(body, "from");
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

/**
 * The sessions whose process sessiond holds alive on a machine, attached to
 * its daemon or not; none when its custody could not be read.
 */
const heldProcesses = (custody: SessionCustody | undefined): string[] =>
  custody?.state === "available" ? custody.instances : [];

/**
 * One line the hub writes into a session's transcript at its account's limit
 * (core `ACCOUNT_MOVE`), as its live stream and a later read both carry it.
 */
const limitLine = (
  row: { sessionId: string | null },
  event: { id: string; at: number; move: AccountMove }
): NeutralSystemMessage => ({
  type: "system",
  subtype: ACCOUNT_MOVE,
  move: event.move,
  uuid: `limit-${event.id}`,
  session_id: row.sessionId ?? "",
  timestamp: new Date(event.at).toISOString(),
});

/**
 * The hub's line where a session started again fresh (core `FRESH_START`,
 * `relaunchOf`), as its live stream and a later read both carry it. One per
 * session: a start refused again and started once more says it once, where
 * it last happened (the row keeps that moment).
 */
const freshStartLine = (
  row: { id: string; sessionId: string | null },
  at: number
): NeutralSystemMessage => ({
  type: "system",
  subtype: FRESH_START,
  uuid: `fresh-start-${row.id}`,
  session_id: row.sessionId ?? "",
  timestamp: new Date(at).toISOString(),
});

/**
 * The hub's line that opens a session started where its project was moved
 * to for it (core `MOVED_HERE`): what moved, then what stayed as a sentence.
 */
const movedHereLine = (
  row: { id: string; sessionId: string | null },
  line: { at: number; moved: string; stayed?: string }
): NeutralSystemMessage => ({
  type: "system",
  subtype: MOVED_HERE,
  uuid: `moved-here-${row.id}`,
  session_id: row.sessionId ?? "",
  content: line.stayed
    ? `${line.moved}\n${line.stayed.charAt(0).toUpperCase()}${line.stayed.slice(1)}.`
    : line.moved,
  timestamp: new Date(line.at).toISOString(),
});

/**
 * The hub's line where a session's process is still held by its harness's
 * server and CawCo did not take it back (core `CUSTODY_HELD`): the same on
 * the live stream and a later transcript read, titled by the reason's first
 * sentence.
 */
const custodyLine = (
  row: { id: string; sessionId: string | null },
  reason: string
): NeutralSystemMessage => ({
  type: "system",
  subtype: CUSTODY_HELD,
  uuid: `custody-held-${row.id}`,
  session_id: row.sessionId ?? "",
  content: reason,
});

/** Why a held session was not taken back, said on its row and in its transcript. */
const custodyReason = (hours: string): string =>
  `OpenCode's server still holds this session, idle ${hours} h, and CawCo didn't take it back after its restart. Review its pending work before you wake it.`;

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

/** Whether a machine's last report says it still has anything of the fleet's on it. */
const holdsFleet = (report: FleetSyncReport | undefined): boolean =>
  report !== undefined &&
  ([
    report.mcp,
    report.marketplaces,
    report.plugins,
    report.skills,
    report.memoryDocs,
    report.hooks,
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

/** `stop { discard: true }`: the spin-off is being thrown away, not paused. */
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
  { build: hubBuild, registry, db, pending, telegram, lifetime }: HubServices,
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
  // Pushes to the iOS app when something newly needs you (push.ts).
  const push = createPush({
    db,
    task: (projectId, id) => tasks.get(projectId, id),
  });
  /**
   * An ask the hub itself raises for the person — a workflow's question, an
   * admin write — parked like a session's own: on the pending ledger, to every
   * dashboard, and to Telegram and push the first time.
   */
  const parkForPerson = (envelope: Envelope, outlivesHub = false): void => {
    if (!envelope.requestId) {
      throw new Error("An ask for the person has no request id.");
    }
    const existed = pending.get(envelope.requestId);
    if (!pending.remember(envelope.requestId, envelope, outlivesHub)) {
      return;
    }
    registry.broadcast(clientCopy(envelope));
    if (
      !existed &&
      (envelope.payload as { routedTo?: string }).routedTo !== "parent"
    ) {
      telegram?.onAsk(envelope);
      push.onAsk(envelope);
    }
  };
  // Admin writes from any door wait on the person (admin-asks.ts). Made before
  // the settlement listener below: the boot sweep settles the asks of
  // sessions that did not survive the restart, and that listener withdraws
  // their admin writes, so it must find this already made.
  const adminAsks = createAdminAsks({
    // Kept across a restart, as a session's own asks are.
    park: (envelope) => parkForPerson(envelope, true),
    parked: (requestId) => pending.get(requestId),
    settle: (requestId) => {
      pending.resolve(requestId);
    },
    // An ask approved after a restart: the hub runs the write itself.
    run: async (name, input) => {
      const entry = adminTools().find((tool) => tool.name === name);
      if (!entry) {
        throw new Error(`No admin tool ${name} in this build.`);
      }
      const result = (await entry.handler(input)) as {
        content?: { text?: string; type?: string }[];
      };
      return (result.content ?? [])
        .map((part) => (part.type === "text" ? (part.text ?? "") : ""))
        .join("\n")
        .trim();
    },
    tell: (instanceId, text) => {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        return;
      }
      deliverSend({
        verb: "send",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          instanceId: row.id,
          message: {
            type: "user",
            uuid: crypto.randomUUID(),
            message: { role: "user", content: text },
            parent_tool_use_id: null,
            origin: { kind: "system", name: "admin" },
          },
        },
      });
    },
  });
  // Each project's Caw (caw.ts), made further down once its services are; the
  // settlement, answer and process-end paths above it reach it through this.
  let lead: Caw | undefined;
  pending.onSettled((parked, outcome, why) => {
    if (!(parked.requestId && parked.instanceId)) {
      return;
    }
    const { threadId } = parked.payload as { threadId?: string };
    if (threadId) {
      lead?.asksChanged(threadId);
    }
    const answering = answeringPermissions.get(parked.requestId);
    if (answering) {
      answering.outcome = outcome;
    }
    telegram?.onSettled(parked.requestId);
    push.onSettled(parked.requestId);
    // An admin write whose ask left unanswered (its session ended) is refused.
    if (outcome === "cancelled") {
      adminAsks.withdrawn(parked.requestId);
    }
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
        // An ask no screen was shown: the transcript's only word of it.
        ...(why
          ? { reason: why, toolName: peek(parked.payload, "toolName") }
          : {}),
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
  /** Asks this start drops with the process that parked them: asked again when each session next runs ({@link noteWithdrawn}). */
  const droppedAtStart: Envelope[] = [];
  for (const parked of pending.list()) {
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    // A move's approval is kept on its `moving` row, which no process holds;
    // the move settles one no job waits on (moves.ts `resume`).
    if (
      !(
        row && ["running", "starting", "unknown", "moving"].includes(row.status)
      )
    ) {
      droppedAtStart.push(parked);
      pending.forget(parked.instanceId ?? "");
    }
  }
  if (swept.toUnknown || swept.toSleeping) {
    console.log(
      `[hub] boot sweep: ${swept.toUnknown} session(s) → unknown, ${swept.toSleeping} legacy restart error(s) → sleeping`
    );
  }
  keepSendsAtStart(db);

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
    sendFrame(agent, {
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

  /**
   * Sends a start as it was asked (`envelope`), bound now ({@link bounded}:
   * its workspace, its generation, in flight from here); or, while its
   * machine is installing an update, keeps it on its row as asked, and binds
   * it when it goes ({@link flushOwedStarts}). Either way its credential and
   * account are the hub's as of its start ({@link grantLaunch}).
   */
  const sendSpawn = (
    agent: NonNullable<ReturnType<typeof registry.agent>>,
    machineId: string,
    envelope: Envelope<SpawnPayload>
  ): void => {
    if (holdingStarts(machineId) && envelope.instanceId) {
      db.oweSpawn(envelope.instanceId, JSON.stringify(envelope), Date.now());
      return;
    }
    sendFrame(agent, { ...envelope, payload: bounded(envelope.payload) });
    // What waited for this start goes right behind it, in the order taken.
    if (envelope.instanceId) {
      releaseOwed({ instanceId: envelope.instanceId });
    }
  };

  /**
   * Sends every start a machine is owed, in the order they were asked for,
   * each exactly once: the row's claim is taken before the send. Runs when the
   * machine registers and when its update state changes, and does nothing while
   * it is still installing. A start the person has since stopped is dropped.
   *
   * Each is bound as it goes ({@link bounded}), on the account its row runs
   * on now, and its machine asks for its credential as it starts it
   * ({@link grantLaunch}). One that may not go (its account was signed out
   * there while the machine updated, or its launch is refused) fails once
   * with the reason: the row and its work item say so, and what it was sent
   * stays owed.
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
      // Taken off its row: it is in flight below only if it goes.
      launches.delete(owed.id);
      const row = db.ownedInstance(owed.id, machineId);
      if (
        !row ||
        row.endIntent ||
        ["stopped", "discarded"].includes(row.status)
      ) {
        continue;
      }
      const asked = JSON.parse(owed.envelope) as Envelope<SpawnPayload>;
      const launch = boundOwed(machineId, owed.id, asked.payload);
      if (!launch) {
        continue;
      }
      sendFrame(agent, { ...asked, payload: launch });
      // What it was sent while its start was held goes right behind it.
      releaseOwed({ instanceId: owed.id });
    }
  };

  /**
   * A kept start bound as it goes ({@link flushOwedStarts}), or, when it may
   * not go, failed once with the reason ({@link processFailed}).
   */
  const boundOwed = (
    machineId: string,
    instanceId: string,
    asked: SpawnPayload
  ): SpawnPayload | undefined => {
    try {
      // Its account may have been signed out there while the machine updated.
      const [stored] = db.getInstancesByIds([instanceId]);
      const refused =
        stored && accountStartRefusal(machineId, stored, sessionName(stored));
      if (refused) {
        throw new Error(refused);
      }
      // In flight from here ({@link launchGoes}).
      return bounded(asked);
    } catch (problem) {
      const reason =
        problem instanceof Error ? problem.message : String(problem);
      console.warn(`[hub] not starting ${instanceId}: ${reason}`);
      processFailed(machineId, instanceId, reason);
      return undefined;
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
  /** A machine as a sentence names it. */
  const machineName = (machineId: string): string =>
    machineLabel(
      db.listAgents().find((agent) => agent.machineId === machineId)
        ?.hostname ?? machineId
    );
  /** A session as a sentence names it. */
  const sessionName = (row: {
    derivedTitle?: string | null;
    id: string;
    title?: string | null;
  }): string => row.title || row.derivedTitle || row.id.slice(0, 8);
  /**
   * A session a send wakes: its process is gone, its conversation on record.
   * Never one a move holds: the move's start is its first launch. Never one
   * whose launch is on its way ({@link launches}): the send goes behind it.
   */
  const wakesForSend = (row: {
    id: string;
    lastError: string | null;
    sessionId: string | null;
    status: string;
  }): boolean =>
    relaunchOf(row).kind !== "refused" &&
    !moves.holds(row.id) &&
    !launchInFlight(row.id) &&
    (row.status === "sleeping" ||
      row.status === "error" ||
      row.status === "stopped");
  /**
   * Whether a send from `origin` may start a turn in `row` when its process
   * is gone ({@link wakesForSend}). A stopped session, ended by its person,
   * its parent or the hub, is woken only by a person or by its own parent:
   * a delegate's report, another session's hand-off and every hub notice
   * wait for one of them. A sleeping or failed one is woken by anything but
   * the hub's word that a message did not arrive, which asks nothing of it.
   * A send that may not wake its session is kept at the hub, owed, and goes
   * to it in order when a send that may wake it arrives
   * ({@link deliverSend}, {@link releaseOwed}).
   */
  const startsTurnIn = (
    row: { status: string; parentInstanceId?: string | null },
    origin: NeutralOrigin
  ): boolean => {
    if (
      origin.kind === "human" ||
      (origin.kind === "peer" &&
        !!row.parentInstanceId &&
        origin.fromSession === row.parentInstanceId)
    ) {
      return true;
    }
    if (row.status === "stopped") {
      return false;
    }
    return !(origin.kind === "system" && origin.name === UNDELIVERED_ORIGIN);
  };
  /** Whether the sends owed to `instanceId` include one that may wake it ({@link startsTurnIn}). */
  const owedWakes = (row: {
    id: string;
    status: string;
    parentInstanceId?: string | null;
  }): boolean =>
    db
      .owedSends({ instanceId: row.id })
      .some((send) =>
        startsTurnIn(
          row,
          (JSON.parse(send.owed ?? "{}") as Envelope<SendPayload>).payload
            .message.origin
        )
      );
  /**
   * Whether `row` has no process and what is owed to it is only what may not
   * wake it: those sends stay kept until something that may wake it writes.
   */
  const keptAsleep = (
    row: Parameters<typeof wakesForSend>[0] & {
      id: string;
      parentInstanceId?: string | null;
    }
  ): boolean => wakesForSend(row) && !owedWakes(row);
  /**
   * The provider whose account a session on `machineId` runs on, if any:
   * Claude Code's always Claude's; a pi or OpenCode model's provider
   * ({@link accountProvidersOf}: OpenCode's `openai` is ChatGPT's, else an
   * OpenAI key's), the first of them with an account signed in on that
   * machine. A model of no such provider runs from the machine's own stores,
   * as it always has.
   */
  /** What a machine last reported of each harness, kept until its next report. */
  const capabilityReports = new Map<string, HarnessReport[]>();
  const harnessReportOf = (
    machineId: string,
    harness: string
  ): HarnessReport | undefined => {
    let reports = capabilityReports.get(machineId);
    if (!reports) {
      reports = db.agentHarnesses(machineId);
      if (reports) {
        capabilityReports.set(machineId, reports);
      }
    }
    return reports?.find((report) => report.harness === harness);
  };
  /**
   * A pi session's model as pi itself resolves it on `machineId`: a bare id
   * becomes `provider/id` by the machine's report of pi's own resolution
   * ({@link HarnessReport.modelNames}). `default` depends on the session's
   * directory and is named before placement ({@link piDefaultFor}). Any other
   * harness's, and a name pi does not resolve, as it is.
   */
  const resolvedModel = (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ): string | null | undefined => {
    if (harness !== "pi" || !model || model.includes("/")) {
      return model;
    }
    return harnessReportOf(machineId, "pi")?.modelNames?.[model] ?? model;
  };
  /**
   * A new pi session that names no model (or `default`) starts on the model
   * pi picks in its directory, asked of its machine, which merges pi's global
   * settings with `<cwd>/.pi/settings.json` as pi does: the payload names
   * that model from here, so placement and the session agree on it. When pi
   * would pick among the machine's own providers, or the session is resumed,
   * or is not pi's, the payload is as it was. A machine that cannot say
   * refuses the start.
   */
  const piDefaultFor = async (
    machineId: string,
    payload: SpawnPayload
  ): Promise<SpawnPayload | { refusal: string }> => {
    if (!asksPiDefault(payload)) {
      return payload;
    }
    const answer = await callAgent(
      machineId,
      CONTROL_PI_DEFAULT_MODEL,
      [payload.cwd],
      READ_TIMEOUT_MS,
      "pi"
    );
    if (answer === "offline") {
      return payload;
    }
    if (answer === "timeout" || !answer.ok) {
      return {
        refusal: `${machineName(machineId)} could not say which model pi starts on in ${payload.cwd}: ${answer === "timeout" ? "it did not answer" : (answer.error ?? "it gave no reason")}. Nothing was started.`,
      };
    }
    const model = answer.result as string | null;
    return model ? { ...payload, model } : payload;
  };
  /** A new pi session that names no model, so pi's pick in its directory is asked first. */
  const asksPiDefault = (payload: SpawnPayload): boolean =>
    payload.harness === "pi" &&
    (!payload.model || payload.model === "default") &&
    !payload.resume &&
    Boolean(payload.cwd);
  const accountProviderFor = (
    machineId: string,
    harness: string,
    model: string | null | undefined
  ): AccountProvider | undefined => {
    const candidates = accountProvidersOf(
      harness,
      resolvedModel(machineId, harness, model)
    );
    if (harness === "claude") {
      return candidates[0];
    }
    const signedIn = new Set(
      db.accounts
        .signins()
        .filter(
          (one) => one.machineId === machineId && one.state === "signed-in"
        )
        .map((one) => one.accountId)
    );
    return candidates.find((provider) =>
      db.accounts
        .list()
        .some(
          (account) => account.provider === provider && signedIn.has(account.id)
        )
    );
  };
  /**
   * The account a session launches on, on `machineId`, or why it can't
   * launch there. A Claude session always runs in its account's own dir and
   * never in the machine's `~/.claude`, but for one that runs on the
   * machine's own login while that moves into CawCo ({@link homeLoginMoveOf}),
   * which launches on it there until it lands: one whose account has no signed-in
   * sign-in there is refused (nothing moves it to another account on its
   * own), and so is one with no account at all once placement finds none. A
   * Claude row with no account (it ran in `~/.claude` before accounts) is
   * placed now, like a new session, and its row names that account from here
   * on; the machine carries its conversation into the account's dir. A pi or
   * OpenCode session on a ChatGPT model runs on a ChatGPT account where its
   * machine has one signed in for its harness, and is placed the same way;
   * any other runs on no account. Every launch asks this before its row
   * opens, and {@link bounded} refuses any that did not.
   */
  /**
   * The account a launch placed a Claude row with a conversation on, by row:
   * its data is carried there by that launch, and its row names the account
   * only once the launch's agent says the data is there
   * ({@link SESSION_DIR_READ}). Held meanwhile so every look at that launch
   * (its refusal check, its mode, its payload) agrees, for as long as a
   * launch takes to say; a launch that never does leaves the row as it was.
   */
  const launchClaims = new Map<string, { accountId: string; at: number }>();
  /** How long a launch's placement is held for its agent's word. */
  const CLAIM_HOLD_MS = 120_000;

  /** The placement a launch of `rowId` holds, while it holds one. */
  const heldClaim = (rowId: string): string | undefined => {
    const held = launchClaims.get(rowId);
    if (held && Date.now() - held.at > CLAIM_HOLD_MS) {
      launchClaims.delete(rowId);
      return;
    }
    return held?.accountId;
  };

  /**
   * Places a row on `accountId` for its launch. A Claude row with a
   * conversation has data to carry, so its row waits for the launch's word
   * ({@link launchClaims}); any other has none, and its row names the account
   * now.
   */
  const placeForLaunch = (
    rowId: string,
    accountId: string,
    why: string
  ): void => {
    const [row] = db.getInstancesByIds([rowId]);
    if (row && (row.harness ?? "claude") === "claude" && row.sessionId) {
      launchClaims.set(rowId, { accountId, at: Date.now() });
      console.log(
        `[hub] ${rowId} launches on ${accountId} (${why}); its row says so once its conversation is there`
      );
      return;
    }
    db.patchInstance(rowId, { accountId });
    console.log(`[hub] ${rowId} runs on ${accountId} from now on (${why})`);
  };

  /**
   * A row with no account, placed now like a new session: its row names the
   * account from its launch on ({@link placeForLaunch}). Nothing when
   * placement finds none.
   */
  const claimAccount = (
    machineId: string,
    row: {
      harness?: string | null;
      id: string;
      model?: string | null;
      projectId?: string | null;
    }
  ): { accountId?: string } | { refusal: string } => {
    const held = heldClaim(row.id);
    if (held) {
      return { accountId: held };
    }
    // One that ran from the machine's own login, which has moved into an
    // account since, runs on that account ({@link repinMovedFrom}); the
    // launch carries its data there.
    const moved =
      (row.harness ?? "claude") === "claude" && movedFrom().has(row.id)
        ? homeMovedAccountOn(machineId)
        : undefined;
    if (moved) {
      db.accounts.removeMovedFrom(row.id);
      placeForLaunch(
        row.id,
        moved,
        `it ran on ${machineName(machineId)}'s own login, which moved there`
      );
      return { accountId: moved };
    }
    const input = placementInput(
      machineId,
      {
        instanceId: row.id,
        cwd: "",
        harness: (row.harness ?? "claude") as HarnessKind,
        ...(row.model ? { model: row.model } : {}),
      },
      { projectId: row.projectId },
      undefined
    );
    const placed = input ? placeAccount(input) : undefined;
    if (!placed?.ok) {
      return placed ? { refusal: placed.refusal } : {};
    }
    const { accountId } = placed;
    if (!accountId) {
      return {};
    }
    placeForLaunch(row.id, accountId, `it ran on no account; ${placed.why}`);
    return { accountId };
  };
  const launchAccount = (
    machineId: string,
    row: Parameters<typeof accountLaunch>[1],
    session: string
  ):
    | { accountId?: string; homeLoginMove?: { accountId: string } }
    | { refusal: string } => {
    // The machine's own Claude login is moving into an account and has not
    // yet: a session that runs on it runs on it until it lands.
    const move = homeLoginMoveOf(machineId, row);
    return move
      ? { homeLoginMove: { accountId: move.accountId } }
      : accountLaunch(machineId, row, session);
  };
  /** {@link launchAccount} for a session on a CawCo account, or to be placed on one. */
  const accountLaunch = (
    machineId: string,
    row: {
      accountId?: string | null;
      harness?: string | null;
      id?: string;
      model?: string | null;
      projectId?: string | null;
    },
    session: string
  ): { accountId?: string } | { refusal: string } => {
    const harness = row.harness ?? "claude";
    // A row on an account stays on it (nothing moves it on its own); one
    // with none is placed when its model is an account provider's here.
    const provider = row.accountId
      ? db.accounts.get(row.accountId)?.provider
      : accountProviderFor(machineId, harness, row.model);
    if (!provider) {
      return {};
    }
    const machine = machineName(machineId);
    const claimed =
      row.accountId || !row.id
        ? { accountId: row.accountId ?? undefined }
        : claimAccount(machineId, { ...row, id: row.id });
    if ("refusal" in claimed) {
      return claimed;
    }
    const { accountId } = claimed;
    if (!accountId) {
      return harness === "claude" ? { refusal: noAccountRefusal(machine) } : {};
    }
    if (
      db.accounts
        .signins()
        .some(
          (one) =>
            one.accountId === accountId &&
            one.machineId === machineId &&
            one.state === "signed-in"
        )
    ) {
      return { accountId };
    }
    const account = db.accounts.get(accountId);
    const named = account ? accountName(account) : accountId;
    return {
      refusal: `${named} isn't signed in on ${machine}, so ${session} can't run there. Sign ${named} in on ${machine} in Configure → Accounts, or continue the session on another account.`,
    };
  };
  /**
   * The credentials moving out of a machine's own stores into CawCo now
   * (pi's and OpenCode's each when its machine connects,
   * {@link adoptHomeCredentials}; any by `POST /api/accounts/move-login`),
   * with the account each moves into,
   * kept in the database (`login_moves`) so a hub restart carries each on.
   * While one is, the sessions that run from it ({@link movingFor}) go on
   * running from it, woken and started as ever, and the move itself runs at
   * the first moment every one of them is at rest ({@link advanceMove}).
   */
  const movingLogins = (): LoginMove[] => db.accounts.moves();
  const moveKey = ({
    machineId,
    store,
    storeProvider,
  }: Pick<LoginMove, "machineId" | "store" | "storeProvider">): string =>
    `${machineId}\u0000${store}\u0000${storeProvider}`;
  /** The moves with a step under way in this hub: their sessions asked whether they are at rest, or the machine moving it. */
  const stepping = new Set<string>();
  /**
   * The sessions whose process still runs from a credential that has moved
   * out of its machine's store, by instance id → machine id, kept in the
   * database (`moved_from_sessions`). Each was at rest when it moved; each is
   * put to sleep at rest, so its next wake launches it where the credential
   * is now. Claude Code keeps the access token it read until that expires,
   * and never refreshes it once its store no longer holds it: 2.1.289 clears
   * its cache before every refresh (`ZT()` → `DI()`, `cache={data:null}`) and
   * reads the store again. pi and OpenCode read their `auth.json` again
   * before a refresh too (pi-ai's `credentials.modify`, OpenCode's
   * `Auth.get` on every request).
   */
  const movedFrom = (): Map<string, string> => db.accounts.movedFrom();
  /**
   * Whether `accountId` has a sign-in row on `machineId`, in any state: an
   * account CawCo placed there. A Claude session on one with none ran on the
   * machine's own login.
   */
  const placedOn = (machineId: string, accountId: string): boolean =>
    db.accounts
      .signins()
      .some(
        (one) => one.accountId === accountId && one.machineId === machineId
      );
  /** Whether any Claude account is signed in on `machineId`. */
  const claudeSignedInOn = (machineId: string): boolean =>
    db.accounts
      .signins()
      .some(
        (one) =>
          one.machineId === machineId &&
          one.state === "signed-in" &&
          db.accounts.get(one.accountId)?.provider === CLAUDE_PROVIDER
      );
  /**
   * The Claude move pending on `machineId` whose login a session there runs
   * on until it lands ({@link SpawnPayload.homeLoginMove}): one on the
   * account it moves into, on no account, or on an account CawCo never
   * placed there ({@link placedOn}).
   */
  const homeLoginMoveOf = (
    machineId: string,
    row: { accountId?: string | null; harness?: string | null }
  ) =>
    (row.harness ?? "claude") === "claude"
      ? movingLogins().find(
          (move) =>
            move.store === "claude" &&
            move.machineId === machineId &&
            (!row.accountId ||
              row.accountId === move.accountId ||
              !placedOn(machineId, row.accountId))
        )
      : undefined;
  /**
   * Whether a start nobody put on an account runs on the machine's own
   * Claude login: it is moving into CawCo, and no Claude account is signed
   * in there yet. A fork runs where its origin ran.
   */
  const startsOnHomeLogin = (
    machineId: string,
    payload: SpawnPayload
  ): boolean =>
    !(payload.account || payload.resume?.fork) &&
    homeLoginMoveOf(machineId, payload) !== undefined &&
    !claudeSignedInOn(machineId);
  /**
   * The move under way of the credential `row` runs from: a Claude session
   * on the machine's own login ({@link homeLoginMoveOf}); a pi or OpenCode
   * session on no account whose model is the moving provider's, which runs
   * from the machine's own store.
   */
  const movingFor = (row: {
    accountId?: string | null;
    harness?: string | null;
    machineId: string;
    model?: string | null;
  }) => {
    const harness = row.harness ?? "claude";
    if (harness === "claude") {
      return homeLoginMoveOf(row.machineId, row);
    }
    return movingLogins().find(
      (move) =>
        move.machineId === row.machineId &&
        move.store === harness &&
        !row.accountId &&
        accountProvidersOf(harness, row.model).includes(move.provider)
    );
  };
  /** {@link launchAccount}'s refusal, or undefined when the session can launch. */
  const accountStartRefusal = (
    machineId: string,
    row: Parameters<typeof launchAccount>[1],
    session: string
  ): string | undefined => {
    const launch = launchAccount(machineId, row, session);
    return "refusal" in launch ? launch.refusal : undefined;
  };
  /**
   * One account dir's initialize response, read on its machine by a session
   * that never takes a turn. Undefined, and said in the log, when it could
   * not be read.
   */
  const probeAccount: AccountProber = async (machineId, account) => {
    const answer = await callAgent(
      machineId,
      CONTROL_PROBE_ACCOUNT,
      [account],
      SIGNIN_TIMEOUT_MS,
      "claude"
    );
    if (answer === "offline" || answer === "timeout" || !answer.ok) {
      console.warn(
        `[hub] account probe on ${machineName(machineId)} (${account}) failed: ${typeof answer === "string" ? answer : answer.error}`
      );
      return;
    }
    return answer.result as AccountProbe;
  };

  /**
   * Each machine's last account report of each kind (its Claude dirs, its
   * provider stores), squared with the hub's accounts one at a time. A
   * probe that failed is tried again, 30 s then doubling to 30 minutes,
   * while the machine is connected; a new report starts over.
   *
   * A report the same as the last one taken on this connection says
   * nothing new and is not taken: a machine says its stores again with
   * every heartbeat that carries its harnesses (pi's settings changed, say),
   * read when they last changed, and sign-ins the hub settled since then
   * would read as gone from it. The first on each connection is always
   * taken ({@link freshAccountReports}).
   */
  const accountSyncs = new Map<
    string,
    {
      attempt: number;
      /** Undefined until the machine's connection has named its stores. */
      reports: AccountReport[] | undefined;
      /** When `reports` came in: a sign-in settled since is not theirs to undo. */
      receivedAt: number;
      running: Promise<void>;
      timer?: HubTimer;
    }
  >();
  /** A machine's new connection: its first report of each kind is taken. */
  const freshAccountReports = (machineId: string): void => {
    for (const harness of ["claude", "providers"] as const) {
      const sync = accountSyncs.get(`${machineId}\u0000${harness}`);
      if (sync) {
        sync.reports = undefined;
      }
    }
  };
  const syncAccounts = (
    machineId: string,
    harness: "claude" | "providers",
    reports?: AccountReport[]
  ): void => {
    const key = `${machineId}\u0000${harness}`;
    const sync = accountSyncs.get(key) ?? {
      attempt: 0,
      reports: undefined,
      receivedAt: 0,
      running: Promise.resolve(),
    };
    if (reports && sync.reports && Bun.deepEquals(reports, sync.reports)) {
      return;
    }
    if (reports) {
      sync.reports = reports;
      sync.receivedAt = Date.now();
      sync.attempt = 0;
      lifetime.cancel(sync.timer);
    }
    accountSyncs.set(key, sync);
    sync.running = sync.running
      .then(async () => {
        // A retry after a new connection began waits for that connection's
        // own report.
        if (!sync.reports) {
          return;
        }
        const { changed, failed } = await reconcileAccounts(
          db,
          machineId,
          harness,
          sync.reports,
          sync.receivedAt,
          probeAccount
        );
        if (changed) {
          publishUsage(machineId);
          // A machine's sign-ins land after its register, behind probes: a
          // project whose start the register's look refused for want of a
          // signed-in account gets its look again now, not at the safety net.
          dispatcher.machineOnline(machineId);
        }
        if (failed && registry.agent(machineId)) {
          const delay = Math.min(30 * 60_000, 30_000 * 2 ** sync.attempt);
          sync.attempt += 1;
          sync.timer = lifetime.after(delay, () =>
            syncAccounts(machineId, harness)
          );
        }
      })
      .catch(console.error);
  };
  /** Every screen's limits and spend, said again after a reading or a sign-in moved. */
  /**
   * What rebalancing makes of the accounts as they stand now (at-limit's
   * `accountsChanged`): an account newly signed in, or back from its bench,
   * puts its provider's sessions on the move. Set once the controller exists.
   */
  let accountsMoved = (): void => undefined;
  /** What adding an account set moving, newest first, for the Accounts page (core `RebalanceNotice`). */
  const rebalanceNotices: RebalanceNotice[] = [];
  const REBALANCE_NOTICES_KEPT = 20;
  const publishUsage = (machineId = ""): void => {
    accountsMoved();
    registry.broadcast({
      verb: "frames",
      machineId,
      payload: {
        kind: "usage",
        limits: machineReadings(db),
        spend: spendNow(),
      },
    });
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
    // A send to a session whose process is gone wakes it ({@link wakeForSend}),
    // fresh when its harness never began a conversation (core `relaunchOf`);
    // one whose account can't run on its machine is not woken, and says why.
    if (row && wakesForSend(row)) {
      const refused = accountStartRefusal(row.machineId, row, sessionName(row));
      if (refused) {
        return refused;
      }
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
    const [row] = db.listedInstancesByIds([instanceId]);
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
    const [row] = db.listedInstancesByIds([instanceId]);
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
    outlived = false,
    /**
     * `all`: the session runs again, so nothing it was sent fails here — what
     * its process never read is owed to the next one, as its machine hands it
     * back ({@link takeBack}) or {@link losePending} decides. `none`: it never
     * runs again (stopped, deleted, archived, nothing to resume), and what it
     * never read fails for `why`.
     */
    keep: "none" | "all" = "none"
  ): void => {
    if (!outlived) {
      // What it had asked the person is asked again if it runs again.
      if (keep === "all") {
        noteWithdrawn(
          pending.list().filter((ask) => ask.instanceId === instanceId)
        );
      }
      pending.forget(instanceId);
    }
    // Nor is it doing anything any more: a pulse outliving its process is the
    // same stale-liveness lie in memory instead of in a column.
    pulses.delete(instanceId);
    // A lead's turn ends with its process: its thread is no longer working.
    lead?.sessionEnded(instanceId);
    touched.delete(instanceId);
    // A session that died before it ever said anything is never going to name
    // itself; nothing should still be waiting to hear its first words.
    awaitingFirstTurn.delete(instanceId);
    // Nor is anything it was sent and never read going to run — unless its
    // harness wrote it down as it went. A process that outlived its agent
    // may hold it still: custody decides that ({@link decideCustody}).
    if (!outlived) {
      inCustody.delete(instanceId);
      // What is kept for the session at rest ({@link startsTurnIn}) never
      // reached a process: no process's end fails it. It waits for a person
      // or its parent.
      const [row] = db.getInstancesByIds([instanceId]);
      const keptAtRest = (send: SentMessageRow): boolean =>
        !!(send.owed && row) &&
        !startsTurnIn(
          { ...row, status: "stopped" },
          (send.body as SentMessage).origin
        );
      if (keep === "none") {
        settlePending(instanceId, why, "fail", (send) => !keptAtRest(send));
      }
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
  /** Why an ask arriving from a machine is not this row's live process's; none when it is. */
  const askRefusal = (
    owner: ReturnType<DbShape["getInstancesByIds"]>[number] | undefined,
    ask: Envelope
  ): string | undefined => {
    if (!owner) {
      return "no such session";
    }
    if (owner.machineId !== ask.machineId) {
      return `it belongs to ${owner.machineId}`;
    }
    if (!["running", "starting", "unknown"].includes(owner.status)) {
      return `the session is ${owner.status}`;
    }
    if (peek(ask.payload, "processGeneration") !== processGeneration(owner)) {
      return "an earlier launch asked it";
    }
    return undefined;
  };
  const ownsPermission = (parked: Envelope): boolean => {
    const [row] = db.getInstancesByIds([parked.instanceId ?? ""]);
    return askRefusal(row, parked) === undefined;
  };

  /**
   * The session a parked ask was routed to: its parent, or its project's
   * lead (work-items.ts `reportees`), as the ask's record names it
   * ({@link deliverDelegateAsk}). Undefined for an ask not routed.
   */
  const routedRecipient = (parked: Envelope): string | undefined => {
    const payload = parked.payload as { kind?: unknown; routedTo?: unknown };
    return payload.kind === "permission_request" &&
      payload.routedTo === "parent" &&
      parked.requestId
      ? db.delegateAsk(parked.requestId)?.parentInstanceId
      : undefined;
  };

  /**
   * A session just died — a parent, or a project's lead — while an ask routed
   * to it was still parked. The user is the fallback: re-broadcast the ask
   * untagged so it returns to the attention queue, and let Telegram and push
   * hear it like any other. A routed ask must never sit unanswerable and
   * invisible.
   */
  const escalateRoutedAsks = (recipientId: string): void => {
    for (const parked of pending.list()) {
      if (routedRecipient(parked) !== recipientId) {
        continue;
      }
      const payload = parked.payload as { routedTo?: unknown };
      // biome-ignore lint/performance/noDelete: an undefined assignment would leave the key present on `payload`, which is broadcast verbatim — the field must be genuinely absent, not present-but-undefined.
      delete payload.routedTo;
      console.log(
        `[hub] ask ${parked.requestId} of ${parked.instanceId} was routed to ${recipientId}, which ended: it is the person's now`
      );
      registry.broadcast(clientCopy(parked));
      telegram?.onAsk(parked);
      push.onAsk(parked);
    }
  };

  /**
   * Delivers a delegate's ask to its parent as a queued peer message, in the
   * same shape the auto-report block uses: the parent reads it when its current
   * turn ends and answers with the `answer_delegate` tool. The final line is
   * machine-readable so the parent's model can copy the ids verbatim.
   */
  const deliverDelegateAsk = (
    delegate: InstanceRow,
    parent: { id: string; machineId: string },
    ask: { requestId?: string; payload: unknown }
  ): void => {
    const { name, tag: label } = sessionLabel(delegate);
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
            name,
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
   * transcript renders as a report. A work item of a project with a lead
   * reports to the lead too, and to the lead alone once its parent has ended
   * (work-items.ts `reportees`).
   */
  const reportToParent = (
    delegate: InstanceRow,
    body: string,
    failed: boolean,
    completion?: { resultId: string; completedAt?: string },
    notice = false
  ): void => {
    for (const parent of workItems.reportees(delegate)) {
      reportTo(parent, delegate, body, failed, completion, notice);
    }
  };

  /** One report, to one of the sessions that hears a delegate's reports. */
  const reportTo = (
    parent: InstanceRow,
    delegate: InstanceRow,
    body: string,
    failed: boolean,
    completion?: { resultId: string; completedAt?: string },
    notice = false
  ): void => {
    const { name, tag: label } = sessionLabel(delegate);
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
            name,
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
    // A live process took it up: finished work it was sent to runs again.
    workItems.reopen(row.instanceId, row.acceptedAt);
    if (answering) {
      const waiting = unanswered.get(row.instanceId) ?? new Map();
      waiting.set(row.uuid, anchors.get(row.instanceId));
      unanswered.set(row.instanceId, waiting);
    }
    anchors.set(row.instanceId, row.uuid);
    const read = changeSend(row, { state: "read" });
    // A fresh conversation's opening read: what was kept for the session
    // while it went on goes now, behind it.
    const origin = (row.body as SentMessage | null)?.origin;
    if (origin?.kind === "system" && origin.name === CONTINUATION_ORIGIN) {
      releaseOwed({ instanceId: row.instanceId });
    }
    return read;
  };

  /** A send that will never be read, and why. Final. */
  const failSend = (row: SentMessageRow, reason: string): void => {
    const anchor = anchorFor(row.instanceId, row.uuid);
    unanswered.get(row.instanceId)?.delete(row.uuid);
    changeSend(row, { state: "failed", reason, anchor: anchor ?? null });
    if (row.state === "pending") {
      tellSender(row, reason);
    }
  };

  /**
   * Another session's message that no process ever took up (a revive that
   * failed, a send the machine refused): that session hears why, the way it
   * hears a report. A screen reads the record itself; CawCo's own notices
   * tell nobody.
   */
  const tellSender = (row: SentMessageRow, reason: string): void => {
    const { origin } = row.body as SentMessage;
    const sender = origin.kind === "peer" ? origin.fromSession : undefined;
    if (!sender || sender === row.instanceId) {
      return;
    }
    const [from, to] = [
      db.getInstancesByIds([sender])[0],
      db.getInstancesByIds([row.instanceId])[0],
    ];
    if (!(from && to)) {
      return;
    }
    deliverSend({
      verb: "send",
      machineId: from.machineId,
      instanceId: from.id,
      payload: {
        instanceId: from.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: {
            role: "user",
            content: undeliveredNotice(sessionLabel(to).tag, reason),
          },
          parent_tool_use_id: null,
          origin: { kind: "system", name: UNDELIVERED_ORIGIN },
          shouldQuery: false,
        },
      },
    });
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
   * Sessions whose open turn this launch is already written down for
   * ({@link DbShape.openTurn}): one write a turn, not one a frame. A launch's
   * `init` and a turn's `result` forget it.
   */
  const turnsWritten = new Set<string>();

  /** A turn of the session is under way: its frames, or its harness reading a send. */
  const turnUnderWay = (instanceId: string): void => {
    if (turnsWritten.has(instanceId)) {
      return;
    }
    turnsWritten.add(instanceId);
    db.openTurn(instanceId, Date.now());
  };

  /** The session's turn ended with its result: nothing of it is left to hand back. */
  const turnOver = (instanceId: string): void => {
    turnsWritten.delete(instanceId);
    db.closeTurn(instanceId);
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
   * transcript read has looked: `fail` — it did not go, for the reason given:
   * the session will never run again; `owe` — the process it was handed to
   * is gone and the session runs again, so it is owed to the next process
   * ({@link oweUnread}), a machine that cannot be asked counting as having
   * taken none; `wait` — a live process may still hand it over and say so;
   * `unheld` — what the process holds is known, so a send it neither stored
   * nor said it held ({@link SentMessageRow.held}), or one a later send
   * overtook, never reached it, and is owed to it again. That is decided only
   * on a read the machine answered.
   */
  type Unstored = "fail" | "owe" | "wait" | "unheld";

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
    // A send still owed never reached a machine, so no machine lost it; only
    // an end ("fail") ends it, and nothing owes it twice.
    const all = db
      .sendsIn(instanceId, ["pending"])
      .filter((send) => unstored === "fail" || !send.owed)
      .filter(only);
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
    // The callers are frame handlers that do not wait on a machine round trip.
    detach(
      storedIn(instanceId)
        .then((answer) => {
          if (!answer) {
            console.warn(
              `[hub] ${instanceId}: its transcript could not be read to settle ${sends.length} send(s) it never said it read`
            );
          }
          if (!answer && unstored === "unheld") {
            return;
          }
          let owed = false;
          for (const send of sends) {
            owed = settleSend(send, answer ?? new Map(), unstored, why) || owed;
          }
          if (whole) {
            decided();
          }
          // What is owed goes now to a process up or starting, or wakes an
          // asleep session for it.
          if (owed) {
            releaseOwed({ instanceId });
          }
        })
        .finally(() => {
          for (const send of sends) {
            deciding.delete(send.uuid);
          }
        }),
      "pending sends"
    );
  };

  /**
   * One send {@link settlePending} decides, against what `stored` says was
   * taken up. True when it is owed again.
   */
  const settleSend = (
    send: SentMessageRow,
    stored: Map<string, boolean>,
    unstored: Unstored,
    why: string
  ): boolean => {
    // Read meanwhile, or thrown away with its session: that stands.
    const now = db.sendRecord(send.uuid);
    if (now?.state !== "pending") {
      return false;
    }
    const taken = stored.get(now.uuid);
    if (taken) {
      readSend(now, false);
      return false;
    }
    if (unstored === "fail") {
      failSend(now, why);
      return false;
    }
    const lost =
      unstored === "owe" ||
      (unstored === "unheld" &&
        taken === undefined &&
        !(now.held && !overtaken(now)));
    if (!lost) {
      return false;
    }
    // A keep-alive ping is kept for no process but the one it was for, and
    // nothing starts a session to warm its cache: it did not go.
    if (!db.oweAgain(now.uuid)) {
      failSend(now, why);
      return false;
    }
    console.log(
      `[hub] send ${now.uuid} to ${now.instanceId} owed again: ${why}`
    );
    publishSend(db.sendRecord(now.uuid) ?? now);
    return true;
  };

  /**
   * What a session was handed and never read, owed to its next process: its
   * process went away and the session runs again — filed asleep, restored,
   * or failed and waiting for its next start. Taken up first is read.
   */
  const oweUnread = (instanceId: string, why: string): void =>
    settlePending(instanceId, why, "owe");

  /**
   * A session's process went away and nobody ended the session ({@link
   * forgetPending} for the rest). When the session runs again
   * (`runsAgain`: it has a conversation to come back on, or is failed and
   * waits for its next start), what it was sent and never read is owed to
   * its next process; otherwise nothing can read it, and it fails for `why`.
   */
  const losePending = (
    instanceId: string,
    runsAgain: boolean,
    why: string = UNREAD.ended
  ): void => {
    forgetPending(instanceId, why, false, runsAgain ? "all" : "none");
    if (runsAgain) {
      oweUnread(instanceId, why);
    }
  };

  /** Sends handed back by their machine, decided together per session ({@link takeBack}). */
  const handedBack = new Map<string, Envelope<SendPayload>[]>();

  /** Whether a pending send's current hand-off is the one `send` was given. */
  const currentHandOff = (instanceId: string, send: SendPayload): boolean => {
    const record = db.sendRecord(send.message.uuid);
    return (
      record?.instanceId === instanceId &&
      record.state === "pending" &&
      !record.owed &&
      (record.delivery ?? undefined) === send.delivery
    );
  };

  /**
   * A send its machine hands back whole ({@link HeldSendFrame}): no process
   * took it — it found none, or the one it was handed to went away. The
   * hand-off it names must be its current one: a later hand-off overtook any
   * other, and owing that again would hand it twice. Once per session, what
   * its transcript shows taken up is read, and the rest is owed to the
   * session's next process ({@link releaseOwed}), as it was handed.
   */
  const takeBack = (
    machineId: string,
    instanceId: string,
    send: SendPayload
  ): void => {
    if (!currentHandOff(instanceId, send)) {
      console.log(
        `[hub] send ${send.message.uuid} to ${instanceId} came back from ${machineId} after it was settled or handed on again: left as it is`
      );
      return;
    }
    const envelope: Envelope<SendPayload> = {
      verb: "send",
      machineId,
      instanceId,
      payload: send,
    };
    const batch = handedBack.get(instanceId);
    if (batch) {
      batch.push(envelope);
      return;
    }
    handedBack.set(instanceId, [envelope]);
    lifetime.after(0, () => {
      const back = handedBack.get(instanceId) ?? [];
      handedBack.delete(instanceId);
      detach(
        storedIn(instanceId).then((stored) => {
          for (const one of back) {
            const { uuid } = one.payload.message;
            if (!currentHandOff(instanceId, one.payload)) {
              continue;
            }
            const now = db.sendRecord(uuid);
            if (now && stored?.get(uuid)) {
              readSend(now, false);
              continue;
            }
            db.holdSend(uuid, JSON.stringify(one));
            console.log(
              `[hub] send ${uuid} to ${instanceId} came back: no process took it; owed to the session's next process`
            );
            const owed = db.sendRecord(uuid);
            if (owed) {
              publishSend(owed);
            }
          }
          releaseOwed({ instanceId });
        }),
        "sends handed back"
      );
    });
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
    detach(
      storedIn(row.instanceId).then(() => {
        const now = db.sendRecord(row.uuid);
        if (now?.state === "pending" || now?.state === "read") {
          failSend(now, reason);
        }
      }),
      "failed send"
    );
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
    // A turn its account's limit refused fails nothing it read: the session
    // reads it when it goes on — carried on at the reset or on another
    // account, or from a summary that carries its last turns verbatim.
    if (limitRefusesTurn(instanceId, neutral)) {
      unanswered.delete(instanceId);
      return;
    }
    if (neutral.type === "assistant" && !neutral.parent_tool_use_id) {
      observeAnswer(instanceId, neutral);
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

  /**
   * The model's own message, answering what its turn read. An error the
   * harness wrote in the model's place answers nothing: what it had just
   * read failed, in its words, which its rows carry.
   */
  const observeAnswer = (
    instanceId: string,
    neutral: Extract<
      (FramePayload & { kind: "frame" })["message"],
      { type: "assistant" }
    >
  ): void => {
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
  };

  /**
   * Whether `neutral` is a session's account's limit refusing its turn, for a
   * session the at-limit controller carries on: Claude Code's `rate_limit`
   * answer, the result of a turn already marked refused, or a pi or OpenCode
   * turn's error naming a ChatGPT limit CawCo reads.
   */
  const limitRefusesTurn = (
    instanceId: string,
    neutral: (FramePayload & { kind: "frame" })["message"]
  ): boolean => {
    let refused = false;
    if (neutral.type === "assistant" && !neutral.parent_tool_use_id) {
      refused = (neutral as { error?: string }).error === "rate_limit";
    } else if (neutral.type === "result") {
      const [row] = db.getInstancesByIds([instanceId]);
      const provider = row?.accountId
        ? db.accounts.get(row.accountId)?.provider
        : undefined;
      refused =
        limitRefused.has(instanceId) ||
        (neutral.is_error &&
          !!provider &&
          provider !== CLAUDE_PROVIDER &&
          LIMITED_PROVIDERS.includes(provider) &&
          providerLimitRefused(neutral.errors ?? []));
    }
    return refused && atLimit.manages(instanceId);
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
   * uuid, with what rode with it put back in — images first, then the typed
   * words, the files' lines and the pastes, the order the agent and every
   * adapter hand them to the harness in. A file's line names it by its whole
   * hash, which is what lets its row open it; the machine's own copy of the
   * line names its path there.
   */
  const sentFrame = ({
    instanceId,
    message,
    images = [],
    attachments = [],
  }: SendPayload): SentMessage => {
    if (!(images.length || attachments.length)) {
      return message;
    }
    const files = attachments
      .flatMap((attachment) =>
        attachment.kind === "file"
          ? [
              attachedFileLine(
                `${ATTACHMENTS_HOME}/${attachedFileName(instanceId, attachment, true)}`,
                attachment
              ),
            ]
          : []
      )
      .join("\n");
    const pasted = attachments
      .map((attachment) =>
        attachment.kind === "text"
          ? `\n\n<pasted-text name="${attachment.name}">\n${attachment.content}\n</pasted-text>`
          : ""
      )
      .join("");
    const lines = `${files ? `\n\n${files}` : ""}${pasted}`;
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
            ? [{ type: "text" as const, text: said + lines }]
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
  /**
   * ONE LAUNCH IN FLIGHT PER SESSION. A launch carries the credential minted
   * for it ({@link bounded}), and minting replaces the one hash the hub
   * accepts for the session, so a second launch while one is still on its
   * way leaves the first holding a dead credential: on obelisk (2026-10-10) a
   * session sleeping behind a held custody was woken again by every minute's
   * owed sweep, and when custody let go its machine ran 76 launches oldest
   * first, each refused 401 ("Invalid session credential"). So from its mint
   * until it settles a launch is the session's only one: no wake, relaunch,
   * restart, start or credential install sends another, and what is sent to
   * the session meanwhile goes to its machine behind the launch, which runs
   * one session's envelopes in order. It settles when its process installs
   * its credential ({@link launchSettled} from the ack), when the machine
   * says the session is up for a launch that replaces nothing, when it fails,
   * sleeps or stops, when its machine's socket closes, and when its machine
   * names it nowhere any more ({@link settleLaunchesOn}). A start kept while
   * its machine installs an update is in flight from when it is kept
   * (`db.owesSpawn`), and minted when it goes ({@link flushOwedStarts}).
   */
  const launches = new Map<
    string,
    {
      readonly machineId: string;
      readonly generation: string;
      readonly at: number;
      /** It replaces a process the machine may still be running: only its own ack says it is up. */
      readonly replaces: boolean;
    }
  >();
  const launchInFlight = (instanceId: string): boolean =>
    launches.has(instanceId) || db.owesSpawn(instanceId);
  /** Why another launch of `instanceId` does not go now; none when it may. */
  const inFlightRefusal = (instanceId: string): string | undefined =>
    launchInFlight(instanceId)
      ? `${instanceId} is already starting: its launch is still on its way to its machine, and only one goes at a time.`
      : undefined;
  /**
   * The launch of `instanceId` is over, for `why`; only the one of
   * `generation` when one is named. Settled before whatever its end does
   * next (a sleep that wakes for what it is owed, a death started again),
   * so the next launch may go; what it is owed follows that path.
   */
  const launchSettled = (
    instanceId: string,
    why: string,
    generation?: string
  ): boolean => {
    const launch = launches.get(instanceId);
    if (
      !launch ||
      (generation !== undefined && generation !== launch.generation)
    ) {
      return false;
    }
    launches.delete(instanceId);
    console.info(`[hub] launch of ${instanceId} settled: ${why}`);
    return true;
  };
  /** The launch of `instanceId` is up: what was kept for it meanwhile goes to it now. */
  const launchStarted = (instanceId: string, why: string): void => {
    if (launchSettled(instanceId, why)) {
      releaseOwed({ instanceId });
    }
  };
  /**
   * A machine's own word on what it carries, at each register and each
   * heartbeat with a custody reading: a launch to it that it now names
   * nowhere (not running, not held, not on its way) is gone, dropped there
   * or with an agent that restarted, once `graceMs` has passed since it was
   * sent (a beat may have been read before the launch arrived; a register
   * is read after every launch to its last connection); one it lists
   * running that replaces nothing is up. Its socket closing alone settles
   * nothing: an agent that only reconnected still has its launches.
   */
  const settleLaunchesOn = (
    machineId: string,
    live: readonly string[],
    custody: SessionCustody,
    graceMs: number
  ): void => {
    if (custody.state !== "available") {
      return;
    }
    const running = new Set(live);
    const named = new Set([
      ...live,
      ...custody.instances,
      ...(custody.pending ?? []),
    ]);
    for (const [instanceId, launch] of [...launches]) {
      if (launch.machineId !== machineId) {
        continue;
      }
      if (running.has(instanceId) && !launch.replaces) {
        launchStarted(instanceId, "its machine runs it");
      } else if (!named.has(instanceId) && Date.now() - launch.at >= graceMs) {
        launchSettled(instanceId, "its machine no longer has it");
      }
    }
  };
  /**
   * A launch of `stored` on its way, in flight from here ({@link launches}):
   * each path that builds a launch has asked {@link inFlightRefusal} first.
   * It carries no credential: its machine asks for one as it starts it
   * ({@link grantLaunch}).
   */
  const launchGoes = (
    payload: SpawnPayload,
    stored: ReturnType<typeof db.getInstancesByIds>[number]
  ): void => {
    launches.set(payload.instanceId, {
      machineId: stored.machineId,
      generation: processGeneration(stored),
      at: Date.now(),
      replaces: payload.relaunch === true,
    });
  };
  /**
   * MINTED AT DISPATCH. A machine starting a launch asks for what it runs
   * on: the session's credential, minted now, and its account as its row
   * says now. However long the launch was held on its way (custody on the
   * machine, an update, its queue), nothing it runs on is older than this.
   * A credential minted when the launch was sent was replaced by every
   * launch minted after it, and a wake held 2.7 hours ran on one the hub no
   * longer took (2026-10-10).
   *
   * Only the launch the row is on now may ask, from the machine it runs on;
   * a stopped, discarded or replaced one is refused in a sentence its start
   * fails with. A hub that restarted while the launch was on its way has it
   * on record (the row's generation) and takes it as in flight again.
   */
  const grantLaunch = (
    machineId: string,
    instanceId: string | undefined,
    asked: LaunchAsk | undefined
  ): LaunchGrant => {
    const read = askingLaunch(machineId, instanceId, asked);
    if ("refusal" in read) {
      return read;
    }
    const stored = takeOwedMove(read);
    const where = launchAccount(machineId, stored, sessionName(stored));
    if ("refusal" in where) {
      return { refusal: where.refusal };
    }
    let account: Pick<SpawnPayload, "accountDir" | "homeLoginMove"> = {};
    if (where.homeLoginMove) {
      account = { homeLoginMove: where.homeLoginMove };
    } else if (where.accountId) {
      account = { accountDir: { accountId: where.accountId } };
    }
    return { sessionCredential: identities.mint(read.id), ...account };
  };
  /**
   * The row of the launch asking ({@link grantLaunch}), when it is the one
   * the row is on now, from the machine it runs on; why it may not ask,
   * otherwise. One the hub has no record of in flight (it restarted since the
   * launch went) is in flight again from here.
   */
  const askingLaunch = (
    machineId: string,
    instanceId: string | undefined,
    asked: LaunchAsk | undefined
  ): ReturnType<typeof db.getInstancesByIds>[number] | { refusal: string } => {
    const [read] = instanceId ? db.getInstancesByIds([instanceId]) : [];
    const owned = instanceId
      ? db.ownedInstance(instanceId, machineId)
      : undefined;
    if (!(read && owned) || owned.endIntent) {
      return {
        refusal:
          "This session is no longer this machine's to start: it was stopped, discarded or moved.",
      };
    }
    const launch = launches.get(read.id);
    const current =
      asked?.processGeneration === processGeneration(read) &&
      (!launch ||
        (launch.machineId === machineId &&
          launch.generation === asked.processGeneration));
    if (!current) {
      return {
        refusal:
          "This start of the session is no longer the one the hub has on its way: it was settled or started again since.",
      };
    }
    if (!launch) {
      launchGoes({ instanceId: read.id, cwd: read.cwd }, read);
    }
    return read;
  };
  /** The sessions whose launch to `machineId` is on its way: a process the machine is about to have. */
  const launchingOn = (machineId: string): string[] =>
    [...launches]
      .filter(([, launch]) => launch.machineId === machineId)
      .map(([instanceId]) => instanceId);
  /**
   * Sessions launched with no effort of their own: the first effort each
   * reads back is its model's default on its account (`putDefaultEffort`),
   * which a picker shows before anyone chooses.
   */
  const effortUnasked = new Set<string>();
  /** Notes whether a launch going out asked for an effort of its own. */
  const noteEffortAsked = (payload: SpawnPayload): void => {
    if (payload.reattachOnly) {
      return;
    }
    if (payload.effort) {
      effortUnasked.delete(payload.instanceId);
    } else {
      effortUnasked.add(payload.instanceId);
    }
  };
  /**
   * The session's account, every time it is launched: its Claude Code runs
   * in that account's config dir on the machine, where its transcript and
   * its credential are. Every launch asked {@link launchAccount} before its
   * row opened; one that did not is refused here rather than run anywhere
   * else. A reattach launches nothing: its process already runs where it
   * runs. A Claude session on the machine's own login while that moves into
   * CawCo gets no account dir but the move it waits on (`homeLoginMove`),
   * which only this sets.
   */
  const accountDirOf = (
    row: ReturnType<typeof db.getInstancesByIds>[number],
    reattachOnly: SpawnPayload["reattachOnly"]
  ): Pick<SpawnPayload, "accountDir" | "homeLoginMove"> => {
    if (reattachOnly) {
      return row.accountId ? { accountDir: { accountId: row.accountId } } : {};
    }
    const launch = launchAccount(row.machineId, row, sessionName(row));
    if ("refusal" in launch) {
      throw new WorkItemRefusal(409, launch.refusal);
    }
    if (launch.homeLoginMove) {
      return { homeLoginMove: launch.homeLoginMove };
    }
    return launch.accountId
      ? { accountDir: { accountId: launch.accountId } }
      : {};
  };
  /**
   * A fork reads its origin's cache: it never moves to another account on
   * its own, so its row says it is one, from its first spawn.
   */
  const noteFork = (
    payload: SpawnPayload,
    stored: { id: string; forkedFrom: string | null }
  ): void => {
    if (payload.resume?.fork && !stored.forkedFrom) {
      db.patchInstance(stored.id, {
        forkedFrom:
          db.instanceBySessionId(payload.resume.sessionKey)?.id ??
          payload.resume.sessionKey,
      });
    }
  };
  const bounded = (
    payload: SpawnPayload,
    knownRow?: InstanceRow
  ): SpawnPayload => {
    const {
      scratchWorktree: _callerWorktree,
      account: _pick,
      accountDir: _callerDir,
      homeLoginMove: _callerMove,
      ...asked
    } = payload;
    const owned = db.ownedInstance(payload.instanceId);
    const [read] = db.getInstancesByIds([payload.instanceId]);
    if (!read) {
      throw new Error("A spawn has no recorded process generation.");
    }
    // A process launched now runs on the account a person moved its session
    // to mid-turn; a reattach takes the process as it runs.
    const stored = payload.reattachOnly ? read : takeOwedMove(read);
    const row = knownRow ?? stored;
    const workspace = row ? workItems.workspaceOf(row) : undefined;
    const harness = payload.harness ?? row?.harness ?? "claude";
    // A launch carries no credential and no account: its machine asks for
    // both as it starts it ({@link grantLaunch}). It is refused here when it
    // may run nowhere, before it goes. A reattach launches nothing: it is
    // sent the account its process runs on, and that process proves its own
    // credential.
    const where = accountDirOf(stored, payload.reattachOnly);
    if (!payload.reattachOnly) {
      launchGoes(payload, stored);
    }
    noteEffortAsked(payload);
    noteFork(payload, stored);
    // A process launched now runs where this launch says, whatever the one
    // before it ran from.
    if (!payload.reattachOnly) {
      db.accounts.removeMovedFrom(payload.instanceId);
    }
    return {
      // A project's Caw never has edit or shell tools: every spawn of its
      // row — the first, and each revive, restore and relaunch — denies them.
      ...withCawDenials(asked, row, harness),
      ...(owned?.scratchWorktree
        ? { scratchWorktree: owned.scratchWorktree }
        : {}),
      processGeneration: processGeneration(stored),
      ...(stored.keepAliveTurn ? { keepAliveTurn: stored.keepAliveTurn } : {}),
      ...(workspace ? { workspace } : {}),
      ...(payload.reattachOnly ? where : {}),
    };
  };

  /** The permission modes a machine's harness reported, or undefined when it has not reported that harness. */
  const harnessModes = (
    machineId: string,
    harness: string
  ): readonly string[] | undefined =>
    harnessReportOf(machineId, harness)?.capabilities.permissionModes;

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
   * names its model and permission mode, a main-loop `status` that names a
   * mode that mode, a `model_fallback` the model
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
   */
  const wakeForSend = (
    agent: NonNullable<ReturnType<typeof registry.agent>>,
    machineId: string,
    instanceId: string
  ): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!(row && wakesForSend(row))) {
      return;
    }
    // Moving a session whose cache is cold is free: it is re-placed first.
    replaceAtWake(row);
    resumeSpawn(agent, machineId, row);
  };

  /**
   * Launches a session's process again on its own conversation, on the
   * settings it last ran with and the account its row names: a wake for a
   * send, or a move to another account at its limit. A spawn for a session
   * still running replaces its process, as the machine settles the old one
   * first.
   */
  /** Why a session cannot be woken now; none when it can. */
  const wakeRefusal = (
    machineId: string,
    row: ReturnType<typeof db.getInstancesByIds>[number],
    plan: Relaunch
  ): string | undefined =>
    (plan.kind === "refused" ? plan.reason : undefined) ??
    launchRefusal(row.id) ??
    accountStartRefusal(machineId, row, sessionName(row));

  /**
   * A revive's start: on the settings the session last ran with, on its
   * conversation when it has one (`plan`). A row whose launch directory is
   * known holds it in `cwd` (`atLaunchDir`).
   */
  const revivePayloadOf = (
    row: ReturnType<typeof db.getInstancesByIds>[number],
    plan: Relaunch,
    relaunch: boolean
  ): SpawnPayload => ({
    instanceId: row.id,
    cwd: row.cwd,
    ...(row.harness ? { harness: row.harness as HarnessKind } : {}),
    ...(plan.kind === "resume"
      ? { resume: { sessionKey: plan.sessionKey } }
      : {}),
    ...(relaunch ? { relaunch: true as const } : {}),
    ...(row.kind === "scratch" ? { scratch: {} } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(isEffortLevel(row.effort) ? { effort: row.effort } : {}),
    ...(row.projectId ? { projectId: row.projectId } : {}),
    // A leaf stays a leaf whatever brings it back (as `restore` says).
    ...(row.canDelegate === false ? { canDelegate: false } : {}),
    ...typeSettingsOf(row),
  });

  const resumeSpawn = (
    agent: NonNullable<ReturnType<typeof registry.agent>>,
    machineId: string,
    row: ReturnType<typeof db.getInstancesByIds>[number],
    /** The process is replaced even if the machine still runs one: a move to another account. */
    relaunch = false
  ): void => {
    const instanceId = row.id;
    // Its launch on the way is the one: what it is sent goes behind that.
    const inFlight = inFlightRefusal(instanceId);
    if (inFlight) {
      console.info(`[hub] not launching ${instanceId} again: ${inFlight}`);
      return;
    }
    // On its conversation, or fresh when its harness never began one.
    const plan = relaunchOf(row);
    const refused = wakeRefusal(machineId, row, plan);
    if (refused) {
      // Nothing it was sent will be read by a process that does not start.
      console.warn(`[hub] not waking ${instanceId}: ${refused}`);
      forgetPending(instanceId, refused);
      return;
    }
    const settled = settleMode(
      machineId,
      revivePayloadOf(row, plan, relaunch),
      row.permissionMode
    );
    if ("refusal" in settled) {
      console.warn(`[hub] not waking ${instanceId}: ${settled.refusal}`);
      return;
    }
    const revive = settled.payload;
    // A relaunch replaces the process; what the old one had parked is over.
    // What it was handed and never read its machine hands back once it has
    // stopped it, for this one ({@link takeBack}).
    forgetPending(instanceId, UNREAD.restarted, false, "all");
    if (plan.kind === "fresh") {
      noteFreshStart(row);
    }
    db.openInstance({
      id: instanceId,
      addressProtocol: addressProtocolMachines.has(machineId),
      machineId,
      cwd: revive.cwd,
      sessionId: row.sessionId ?? undefined,
      harness: row.harness ?? undefined,
      kind: row.kind ?? undefined,
      permissionMode: settled.permissionMode,
      model: row.model ?? undefined,
    });
    sendSpawn(agent, machineId, {
      verb: "spawn",
      machineId,
      instanceId,
      payload: revive,
    });
    publishInstances(machineId);
  };

  /**
   * A session's process went away with nothing failed: its machine put it to
   * sleep at rest, or the process ended on its own (`asleep`, see
   * `SessionSupervisor.sleep` and its `closed` in the agent). The row is filed
   * `sleeping`, which every screen already draws, and the next send wakes it
   * through {@link wakeForSend} like any sleeping session.
   *
   * Nothing it was sent is failed. A send still pending here is one its
   * process never read, or one that crossed the sleep on its way: its machine
   * hands each back ({@link takeBack}), and the process the wake starts reads
   * it. What was already owed wakes it now.
   */
  const sessionAsleep = (machineId: string, instanceId: string): void => {
    db.accounts.removeMovedFrom(instanceId);
    if (!db.sleepInstance(instanceId)) {
      return;
    }
    console.log(
      `[hub] ${instanceId} is asleep: its machine stopped it at rest`
    );
    losePending(instanceId, true);
    // Asks its delegates had routed to it and it never answered are the
    // reader's from here, as when any parent's process goes.
    escalateRoutedAsks(instanceId);
    releaseOwed({ instanceId });
    publishInstances(machineId);
  };

  /**
   * The sessions among `ids` whose prompt cache this hub is keeping warm
   * ({@link tickKeepAlive}): keep-alive is on and has a cache to ping for, or
   * is waiting out a usage limit to. A ping needs the session's process and is
   * never sent to a sleeping one, so its machine keeps these awake
   * (`HeartbeatAckPayload.keepAwake`). One whose cache has gone cold, or whose
   * keep-alive reached its cap, sleeps like any other, and so does one whose
   * process runs from a credential that has since moved ({@link movedFrom}).
   */
  const keptWarm = (machineId: string, ids: string[]): string[] => {
    if (ids.length === 0) {
      return [];
    }
    const now = Date.now();
    const limits = sessionLimitsReader(db, now);
    const moved = movedFrom();
    return db
      .getInstancesByIds(ids)
      .filter((row) => {
        if (moved.has(row.id)) {
          return false;
        }
        const { state } = keepAliveState(row, limits(row), now);
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
    // The machine's `asleep` frame carries the outcome; a refusal means the
    // session is not at rest.
    detach(
      callAgent(
        row.machineId,
        CONTROL_SLEEP,
        [],
        SLEEP_TIMEOUT_MS,
        undefined,
        row.id
      ),
      "sleep request"
    );
  };

  /** How long a machine gets to move its login: two `claude auth status` runs and the store's own tool, or a usage read. */
  const MOVE_TIMEOUT_MS = 120_000;
  /** How long a machine gets to say which of its sessions are at rest. */
  const RESTLESS_TIMEOUT_MS = 20_000;
  /** How often a pending move is tried, and what ran from a moved credential is asked to sleep. */
  const MOVE_TICK_MS = 5000;
  /** What the last move of each credential came to, for `GET /api/accounts/move-login`, by {@link moveKey}. */
  const moveResults = new Map<
    string,
    {
      accountId: string;
      at: number;
      error?: string;
      machineId: string;
      provider: AccountProvider;
      /** Where the moved credential is kept now, as its owner names it. */
      kept?: string;
      store: HomeStore;
      storeProvider: string;
    }
  >();
  let moveTicker: HubTimer | undefined;

  /**
   * Whether a session in `status` may have a process: running, starting, or
   * `unknown`, which a starting hub files every one that was running as until
   * its machine says (`sweepBootStatuses`). A move counts those too, so it
   * never runs in the window after a hub restart before the machine reports.
   */
  const mayRun = (status: string): boolean =>
    status === "running" || status === "starting" || status === "unknown";
  /**
   * The sessions that run from a moving credential whose process still runs:
   * the ones a move waits on to be at rest, as account dirs never share the
   * credential (core paths.ts: per account, "never linked or carried").
   */
  const liveFrom = (move: LoginMove): string[] =>
    db
      .listInstances()
      .filter((row) => {
        const from = movingFor(row);
        return (
          row.machineId === move.machineId &&
          from !== undefined &&
          moveKey(from) === moveKey(move) &&
          mayRun(row.status)
        );
      })
      .map((row) => row.id);

  /**
   * What one move came to: the sign-in recorded as moved and the sessions
   * that ran from it noted ({@link movedFrom}), or why not; the move is gone
   * from the pending ones only after that, so a hub that stops in between
   * asks the machine again, and the machine answers a move it already made.
   */
  const settleMove = async (
    move: LoginMove,
    answer: Awaited<ReturnType<typeof callAgent>>,
    ranFrom: string[],
    lentBy?: string
  ): Promise<void> => {
    const at = Date.now();
    const { machineId, store } = move;
    const machine = machineName(machineId);
    const key = moveKey(move);
    const done = {
      accountId: move.accountId,
      at,
      machineId,
      provider: move.provider,
      store,
      storeProvider: move.storeProvider,
    };
    const what = `${machine}'s own ${store} ${store === "claude" ? "login" : move.storeProvider}`;
    if (answer === "offline" || answer === "timeout" || !answer.ok) {
      const error =
        typeof answer === "string"
          ? `${machine} is ${answer === "offline" ? "not connected" : "not answering"}; nothing was moved there.`
          : (answer.error ?? "The move did not finish.");
      moveResults.set(key, { ...done, error });
      db.accounts.removeMove(move);
      console.warn(`[hub] moving ${what} failed: ${error}`);
      return;
    }
    const kept = (answer.result as HomeLoginMoved).store;
    const repinned = store === "claude" ? ranOnHomeLogin(move) : [];
    db.accounts.putSignin({
      accountId: move.accountId,
      machineId,
      state: "signed-in",
      moved: { at, from: store },
    });
    // Each one to re-pin is kept with the ones that ran from the login until
    // it is: a hub that stops in between re-pins it at its next tick.
    db.accounts.putMovedFrom(
      [...new Set([...ranFrom, ...repinned.map((row) => row.id)])],
      machineId
    );
    db.accounts.removeMove(move);
    moveResults.set(key, { ...done, kept });
    const { moved, running } = await repinOnto(move, repinned, ranFrom);
    const borrowed = lentBy
      ? ` (its own login had expired; the account's is used, from ${machineName(lentBy)})`
      : "";
    console.log(
      `[hub] moved ${what} (${move.identity.email}) into account ${move.accountId}${borrowed}, kept in ${kept}; ${moved} session(s) that ran on it re-pinned to it, ${running} when their process ends`
    );
    publishUsage(machineId);
  };

  /** How long a lender gets to refresh and lend an account's sign-in. */
  const LEND_TIMEOUT_MS = 60_000;

  /** The machines `accountId` is signed in on in CawCo, other than `machineId`: who could lend it there. */
  const lendersOf = (accountId: string, machineId: string): string[] =>
    db.accounts
      .signins()
      .filter(
        (one) =>
          one.accountId === accountId &&
          one.machineId !== machineId &&
          one.state === "signed-in"
      )
      .map((one) => one.machineId);

  /** Why an account's lender cannot lend it now, in a sentence. */
  const lenderAway = (accountId: string, lender: string): string => {
    const account = db.accounts.get(accountId);
    return `${account ? accountName(account) : `Account ${accountId}`} is refreshed by ${machineName(lender)}, which is offline.`;
  };

  /**
   * A machine's own credential of a moving identity did not answer
   * ({@link HomeLoginMoved.expired}): the account's working sign-in, held by
   * another machine, is lent to it ({@link CONTROL_LEND_ACCOUNT}, then
   * {@link CONTROL_BORROW_ACCOUNT}), so its harness runs on the account with
   * nobody signing in again there. With no machine signed in to the account
   * the move fails as it always did.
   */
  const borrowInto = async (
    move: LoginMove,
    expired: string
  ): Promise<{
    answer: Awaited<ReturnType<typeof callAgent>>;
    lender?: string;
  }> => {
    const lenders = lendersOf(move.accountId, move.machineId);
    const failures: string[] = [];
    for (const lender of lenders) {
      if (!registry.agent(lender)) {
        failures.push(lenderAway(move.accountId, lender));
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one lender at a time; the first that lends is the one used
      const lent = await callAgent(
        lender,
        CONTROL_LEND_ACCOUNT,
        [move.accountId],
        LEND_TIMEOUT_MS
      );
      if (typeof lent === "string" || !lent.ok) {
        failures.push(
          `${machineName(lender)} did not lend it: ${typeof lent === "string" ? lent : (lent.error ?? "no answer")}`
        );
        continue;
      }
      const answer = await callAgent(
        move.machineId,
        CONTROL_BORROW_ACCOUNT,
        [
          move.accountId,
          lender,
          lent.result,
          move.store,
          move.storeProvider,
          move.identity,
        ],
        MOVE_TIMEOUT_MS
      );
      return { answer, lender };
    }
    const error = [`The account did not answer: ${expired}.`, ...failures].join(
      " "
    );
    return {
      answer: {
        kind: "control_result",
        ok: false,
        requestId: "",
        error,
      },
    };
  };

  /**
   * Borrowers whose ask found their lender away, by lender: brought a fresh
   * sign-in once it connects again ({@link lendToWaiting}), so nothing asks
   * again on a timer meanwhile.
   */
  const awaitingLender = new Map<
    string,
    Map<string, { accountId: string; borrower: string }>
  >();

  /** Answers a borrower ({@link CONTROL_ACCOUNT_LENT}) with a lender's fresh sign-in or why there is none. */
  const answerBorrower = (
    borrower: string,
    requestId: string | null,
    accountId: string,
    answer: unknown
  ): void => {
    detach(
      callAgent(
        borrower,
        CONTROL_ACCOUNT_LENT,
        [requestId, answer, accountId],
        SIGNIN_TIMEOUT_MS
      ),
      "lent sign-in"
    );
  };

  /** One lend of `accountId` by `lender`: its fresh sign-in, or why not, in a sentence. */
  const lendOnce = async (
    accountId: string,
    lender: string
  ): Promise<unknown> => {
    if (!registry.agent(lender)) {
      return { error: lenderAway(accountId, lender) };
    }
    const lent = await callAgent(
      lender,
      CONTROL_LEND_ACCOUNT,
      [accountId],
      LEND_TIMEOUT_MS
    );
    if (lent === "offline") {
      return { error: lenderAway(accountId, lender) };
    }
    if (typeof lent === "string" || !lent.ok) {
      const account = db.accounts.get(accountId);
      return {
        error: `${account ? accountName(account) : `Account ${accountId}`} is refreshed by ${machineName(lender)}, which did not lend it: ${typeof lent === "string" ? "it did not answer" : (lent.error ?? "no answer")}.`,
      };
    }
    return lent.result;
  };

  /**
   * A borrower near its borrowed sign-in's expiry ({@link AccountBorrowFrame}):
   * its lender asked for a fresh one, which goes back to the borrower. A
   * lender that is away is said to the borrower once, and the borrower is
   * brought a fresh sign-in when the lender connects again.
   */
  const answerBorrow = async (
    borrower: string,
    frame: AccountBorrowFrame
  ): Promise<void> => {
    const { accountId, lender, requestId } = frame;
    const signed = lendersOf(accountId, borrower).includes(lender);
    const answer = signed
      ? await lendOnce(accountId, lender)
      : {
          error: `Account ${accountId} is not signed in on ${machineName(lender)} in CawCo any more, so nothing lends it to ${machineName(borrower)}.`,
        };
    if (signed && !registry.agent(lender)) {
      const waiting = awaitingLender.get(lender) ?? new Map();
      waiting.set(`${borrower}\u0000${accountId}`, { accountId, borrower });
      awaitingLender.set(lender, waiting);
    }
    if (answer && typeof answer === "object" && "error" in answer) {
      console.warn(
        `[hub] ${machineName(borrower)}'s borrowed sign-in of account ${accountId} was not refreshed: ${String(answer.error)}`
      );
    } else {
      console.log(
        `[hub] ${machineName(borrower)}'s borrowed sign-in of account ${accountId} refreshed from ${machineName(lender)}`
      );
    }
    answerBorrower(borrower, requestId, accountId, answer);
  };

  /** A lender connected again: each borrower that found it away is brought a fresh sign-in, once. */
  const lendToWaiting = (lender: string): void => {
    const waiting = awaitingLender.get(lender);
    if (!waiting) {
      return;
    }
    awaitingLender.delete(lender);
    for (const { accountId, borrower } of waiting.values()) {
      lendOnce(accountId, lender)
        .then((answer) => {
          if (answer && typeof answer === "object" && !("error" in answer)) {
            console.log(
              `[hub] ${machineName(lender)} is back: ${machineName(borrower)}'s borrowed sign-in of account ${accountId} refreshed`
            );
            answerBorrower(borrower, null, accountId, answer);
          }
        })
        .catch(console.error);
    }
  };

  /**
   * Every Claude session on a machine whose own login moved, on an account
   * CawCo never placed there: it ran on that login, so it is the moved
   * account's from now on.
   */
  const ranOnHomeLogin = (move: LoginMove) =>
    db
      .listInstances()
      .filter(
        (row) =>
          row.machineId === move.machineId &&
          (row.harness ?? "claude") === "claude" &&
          row.accountId !== move.accountId &&
          !(row.accountId && placedOn(move.machineId, row.accountId))
      );

  /**
   * Re-pins what ran on a moved login to the account it moved into: each
   * one's data carried into that account's dir, then its row. One whose
   * process still runs from the machine's own dir stays in
   * {@link movedFrom}, carried when that process is gone
   * ({@link sleepMovedFrom}); the rest leave it.
   */
  const repinOnto = async (
    move: LoginMove,
    rows: ReturnType<typeof ranOnHomeLogin>,
    ranFrom: string[]
  ): Promise<{ moved: number; running: number }> => {
    const { moved, kept } = await moveRowsToAccount(
      move.machineId,
      rows,
      move.accountId
    );
    const running = [...kept]
      .filter(([, why]) => why === PROCESS_RUNS)
      .map(([id]) => id);
    for (const row of rows) {
      if (!(running.includes(row.id) || ranFrom.includes(row.id))) {
        db.accounts.removeMovedFrom(row.id);
      }
    }
    return { moved: moved.length, running: running.length };
  };

  /**
   * The account a machine's own Claude Code login moved into, if it has:
   * the one its sessions from before the move are re-pinned to.
   */
  const homeMovedAccountOn = (machineId: string): string | undefined =>
    db.accounts
      .signins()
      .filter(
        (one) =>
          one.machineId === machineId &&
          one.movedFrom === "claude" &&
          db.accounts.get(one.accountId)?.provider === CLAUDE_PROVIDER
      )
      .sort((a, b) => (b.movedAt ?? 0) - (a.movedAt ?? 0))[0]?.accountId;

  /** The sessions {@link sleepMovedFrom} is carrying now, so no tick starts a second carry of one. */
  const repinning = new Set<string>();

  /**
   * A Claude session that ran from a machine's own login, whose process is
   * gone: re-pinned now to the account the login moved into, its data
   * carried first. Done with once moved, or once it cannot be.
   */
  const repinMovedFrom = async (
    instanceId: string,
    machineId: string
  ): Promise<void> => {
    const [row] = db.getInstancesByIds([instanceId]);
    const into = homeMovedAccountOn(machineId);
    if (
      !(row && into) ||
      (row.harness ?? "claude") !== "claude" ||
      row.accountId === into
    ) {
      db.accounts.removeMovedFrom(instanceId);
      return;
    }
    if (repinning.has(instanceId) || !registry.agent(machineId)) {
      return;
    }
    repinning.add(instanceId);
    try {
      const { kept } = await moveRowsToAccount(machineId, [row], into);
      // A process that came back is carried when it is gone again.
      if (kept.get(instanceId) !== PROCESS_RUNS) {
        db.accounts.removeMovedFrom(instanceId);
      }
      publishInstances(machineId);
    } finally {
      repinning.delete(instanceId);
    }
  };

  /**
   * Each session in {@link movedFrom} is asked to sleep, which its machine
   * does only at rest; one whose process is gone is done with, a Claude one
   * once it is re-pinned ({@link repinMovedFrom}).
   */
  const sleepMovedFrom = (): void => {
    const moved = movedFrom();
    const status = new Map(
      db.getInstancesByIds([...moved.keys()]).map((row) => [row.id, row.status])
    );
    for (const [instanceId, machineId] of moved) {
      const now = status.get(instanceId);
      if (!(now && mayRun(now))) {
        // Each re-pin runs on its own; one not done is tried at the next tick.
        detach(repinMovedFrom(instanceId, machineId), "login move re-pin");
        continue;
      }
      // Not known yet (a hub just started): asked once its machine says.
      if (now === "unknown") {
        continue;
      }
      // The machine's `asleep` frame files the row; a refusal is a session not
      // at rest yet, asked again next tick.
      detach(
        callAgent(
          machineId,
          CONTROL_SLEEP,
          [],
          SLEEP_TIMEOUT_MS,
          undefined,
          instanceId
        ),
        "sleep request"
      );
    }
  };

  /**
   * One step of a credential's move out of a machine's own store
   * ({@link movingLogins}). Nothing is held and nothing is asked to sleep:
   * the sessions that run from it ({@link movingFor}) go on running from it,
   * and the step asks the machine whether every one with a process
   * ({@link liveFrom}) is at rest ({@link CONTROL_RESTLESS}: no turn, no ask,
   * no subagent, nothing on its way to it). At the first step that finds
   * them all at rest the machine moves it, so the move never lands under a
   * turn. The account's sign-in there is then recorded as moved from that
   * store, and each session whose process ran from it goes into
   * {@link movedFrom}, to be put to sleep at rest so that its next wake runs
   * where the credential is now. A move that fails is said in the log and in
   * its result, and the original is as it was.
   */
  const advanceMove = async (move: LoginMove): Promise<void> => {
    const key = moveKey(move);
    if (stepping.has(key)) {
      return;
    }
    stepping.add(key);
    try {
      await stepMove(move);
    } finally {
      stepping.delete(key);
    }
  };
  const stepMove = async (move: LoginMove): Promise<void> => {
    const { machineId } = move;
    // A machine not connected (a hub just started, a machine away) is asked
    // once it is.
    if (!registry.agent(machineId)) {
      return;
    }
    const ranFrom = liveFrom(move);
    if (ranFrom.length > 0) {
      const restless = await callAgent(
        machineId,
        CONTROL_RESTLESS,
        [ranFrom],
        RESTLESS_TIMEOUT_MS
      );
      if (
        typeof restless === "string" ||
        !restless.ok ||
        Object.keys(restless.result as Record<string, string>).length > 0 ||
        liveFrom(move).some((id) => !ranFrom.includes(id))
      ) {
        // Asked again at the next tick.
        return;
      }
    }
    const answer =
      move.store === "claude"
        ? await callAgent(
            machineId,
            CONTROL_MOVE_HOME_LOGIN,
            [move.accountId, move.identity],
            MOVE_TIMEOUT_MS,
            "claude"
          )
        : await callAgent(
            machineId,
            CONTROL_MOVE_HOME_CREDENTIAL,
            [move.accountId, move.store, move.storeProvider, move.identity],
            MOVE_TIMEOUT_MS
          );
    const expired =
      typeof answer === "object" && answer.ok
        ? (answer.result as HomeLoginMoved).expired
        : undefined;
    if (expired === undefined) {
      await settleMove(move, answer, ranFrom);
    } else {
      const borrowed = await borrowInto(move, expired);
      await settleMove(move, borrowed.answer, ranFrom, borrowed.lender);
    }
    sleepMovedFrom();
    publishInstances(machineId);
  };

  /**
   * Starts the ticks that carry every pending move along and put what ran
   * from a moved credential to sleep; they stop when neither is left. A hub
   * that starts with either in its database starts them at once.
   */
  const tickMoves = (): void => {
    moveTicker ??= lifetime.every(MOVE_TICK_MS, () => {
      const moves = movingLogins();
      if (moves.length === 0 && movedFrom().size === 0) {
        lifetime.cancel(moveTicker);
        moveTicker = undefined;
        return;
      }
      for (const move of moves) {
        advanceMove(move).catch(console.error);
      }
      sleepMovedFrom();
    });
  };
  /** What a hub that just started finds in its database it carries on with. */
  const carryOnMoves = (): void => {
    const moves = movingLogins().length;
    const moved = movedFrom().size;
    if (moves === 0 && moved === 0) {
      return;
    }
    console.log(
      `[hub] carrying on ${moves} login move(s) and ${moved} session(s) still running from a moved login`
    );
    tickMoves();
  };
  carryOnMoves();

  /**
   * An envelope that names a session by one of its former ids (db
   * `instanceIdOf`: a session whose continuations the hub folded into one),
   * addressed to the session by its id now: its machine, and its id on the
   * envelope and in the payload. Unchanged for any other id. Every send,
   * control and stop that names a session by id passes here.
   */
  const byIdNow = <P extends { instanceId?: string }>(
    envelope: Envelope<P>
  ): Envelope<P> => {
    const named = envelope.payload.instanceId ?? envelope.instanceId;
    const now = named ? db.instanceIdOf(named) : undefined;
    if (!(named && now) || now === named) {
      return envelope;
    }
    const [row] = db.getInstancesByIds([now]);
    return {
      ...envelope,
      instanceId: now,
      machineId: row?.machineId ?? envelope.machineId,
      payload: { ...envelope.payload, instanceId: now },
    };
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
   * wakes the same session, and the item reopens when that process reads it
   * ({@link readSend}); anyone else's fails with the item's state
   * ({@link inputRefusal}), and nothing wakes. A send nothing takes up fails
   * with why, and its sender hears it ({@link failSend}).
   *
   * A uuid the hub already has a record for is the same send again (a tab
   * trying once more after its socket dropped): the machine is not handed it
   * twice, and the record it has is said again for whoever asked.
   *
   * ONE RULE FOR EVERY HOLD: a send its session cannot take yet is never
   * handed to the machine, where a session with no process refuses it, and
   * never refused for the hold. It is accepted as owed (`sent_messages.owed`),
   * drawn queued like any pending send, and goes once the hold ends
   * ({@link releaseOwed}), in the order accepted. The holds: the session's
   * start held while its machine installs an update ({@link holdingStarts}),
   * its machine's agent away within its reconnect grace
   * ({@link awaitingMachine}), its account at its limit or its continuation
   * from a summary under way ({@link heldAtLimit}), and a send owed before it
   * to the same session, which it never overtakes — but the opening of a
   * continuation in place (`ahead`), which its fresh conversation opens on.
   */
  const deliverSend = (
    asked: Envelope<SendPayload>,
    ahead = false
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the single send transaction orders refusal, recovery, delivery and persistence.
  ): SentMessageRow => {
    const envelope = byIdNow(asked);
    const { instanceId, message } = envelope.payload;
    const { machineId } = envelope;
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
    const [target] = db.getInstancesByIds([instanceId]);
    // Kept, not woken: the session has no process and this sender may not
    // start a turn in it ({@link startsTurnIn}).
    const kept =
      !(refused || keepAlive) &&
      !!target &&
      wakesForSend(target) &&
      !startsTurnIn(target, message.origin);
    // Kept, not handed: a turn at its account's limit would only be refused.
    const limited =
      !(refused || keepAlive || ahead) &&
      heldAtLimit(instanceId, message.origin);
    const agent = refused ? undefined : registry.agent(machineId);
    const away =
      !(refused || agent || keepAlive) && awaitingMachine.has(machineId);
    const accepted = Boolean(agent) || away || kept;
    const from =
      message.origin.kind === "peer" ? message.origin.fromSession : undefined;
    const waitSummary =
      accepted && from ? workItems.waitSummary(from, instanceId) : "";
    if (waitSummary) {
      const { content } = message.message;
      message.message.content =
        typeof content === "string"
          ? `${content}${waitSummary}`
          : [...content, { type: "text", text: waitSummary }];
    }
    if (agent && !(kept || limited)) {
      if (keepAlive) {
        db.updateKeepAlive(instanceId, { keepAliveTurn: message.uuid });
      } else {
        wakeForSend(agent, machineId, instanceId);
      }
    }
    const owed =
      away ||
      kept ||
      (agent !== undefined &&
        !keepAlive &&
        (limited || (!ahead && sendWaits(instanceId))));
    // Every hand-off is named, so the machine handing one back names which
    // ({@link takeBack}); a keep-alive ping is never handed back.
    const delivery = keepAlive ? undefined : crypto.randomUUID();
    if (delivery) {
      envelope.payload.delivery = delivery;
    }
    if (agent && !owed) {
      sendFrame(agent, envelope);
    }
    // Built after the send has gone: the machine is handed the image bytes,
    // the record a reference to them.
    const mode = sendMode(envelope.payload);
    const whole = JSON.stringify(envelope);
    const record = db.recordSend({
      uuid: message.uuid,
      instanceId,
      acceptedAt: new Date(),
      body: externalizeImages(sentFrame(envelope.payload)),
      mode,
      ...(message.replaces ? { replaces: message.replaces } : {}),
      ...(accepted
        ? {
            state: "pending" as const,
            ...(owed ? { owed: whole } : {}),
            ...(delivery ? { envelope: whole, delivery } : {}),
          }
        : {
            state: "failed" as const,
            reason: refused ?? `machine ${machineId} is not connected`,
            anchor: anchors.get(instanceId) ?? null,
          }),
    });
    if (owed) {
      console.log(
        `[hub] send ${message.uuid} to ${instanceId} queued: ${holdOf(record)}`
      );
    }
    // The send it retries goes first, so a screen folds that row away as
    // this one arrives.
    if (message.replaces) {
      replaceSend(message.replaces, record.uuid);
    }
    publishSend(record);
    // A send that woke its session goes out behind what was kept for it.
    if (agent && owed && !(kept || away || limited)) {
      releaseOwed({ instanceId });
    }
    if (accepted) {
      if (from) {
        workItems.delivered(from, instanceId);
      }
      afterSend(envelope, mode);
    }
    return record;
  };

  /**
   * Whether a session cannot take a send now though its machine is
   * connected: its start is held while the machine installs an update
   * ({@link sendSpawn}), or a send owed before this one has not gone yet.
   */
  const sendWaits = (instanceId: string): boolean =>
    db.owesSpawn(instanceId) || db.owedSends({ instanceId }).length > 0;

  /**
   * Whether a send to `instanceId` waits at the hub because the session's
   * account is at its limit, where a turn would only be refused: held there
   * until its reset (the at-limit controller's hold), or going on from a
   * summary in place and its fresh conversation not yet read its opening
   * ({@link openingUnread}). What carries it on — the
   * controller's own word at the reset, and the opening — is not held.
   */
  const heldAtLimit = (instanceId: string, origin: NeutralOrigin): boolean => {
    if (
      origin.kind === "system" &&
      (origin.name === LIMIT_ORIGIN || origin.name === CONTINUATION_ORIGIN)
    ) {
      return false;
    }
    return (
      db.atLimit.hold(instanceId) !== undefined ||
      db
        .continuationRows()
        .some(
          (job) =>
            job.sourceInstanceId === instanceId &&
            job.request.target.inPlace !== undefined &&
            job.stage !== "failed" &&
            job.stage !== "cancelled" &&
            openingUnread(job)
        )
    );
  };

  /**
   * Whether a continuation in place's fresh conversation has yet to read its
   * opening: not sent, or sent and pending. Until it has, nothing else
   * reaches it, so the opening is the first thing it reads ({@link readSend}
   * lets the rest go then).
   */
  const openingUnread = (job: ContinuationRow): boolean => {
    const opening = db.sendRecord(job.openingUuid);
    return !opening || opening.state === "pending";
  };

  /** What a session held at its account's limit was kept goes, in order, once nothing holds it ({@link heldAtLimit}). */
  const releaseLimitHeld = (): void => {
    const owed = new Set(
      db
        .listAgents()
        .flatMap((machine) =>
          db
            .owedSends({ machineId: machine.machineId })
            .map((send) => send.instanceId)
        )
    );
    for (const instanceId of owed) {
      releaseOwed({ instanceId });
    }
  };

  /**
   * Machines whose agent is away within its reconnect grace, and why: its
   * socket closed (`agent`, restarting) or this hub has just started and not
   * heard it yet (`hub`); from then until it registers or
   * {@link RECONNECT_GRACE_MS} runs out. A send to one of their sessions is
   * owed ({@link deliverSend}). Each grace is its own: the timer of one that
   * ended (the machine came back and went again) leaves a newer one alone.
   */
  const awaitingMachine = new Map<
    string,
    { why: "agent" | "hub"; grace: symbol }
  >();
  const awaitGrace = (machineId: string, why: "agent" | "hub"): void => {
    const grace = Symbol(machineId);
    awaitingMachine.set(machineId, { why, grace });
    lifetime.after(RECONNECT_GRACE_MS, () => {
      if (awaitingMachine.get(machineId)?.grace !== grace) {
        return;
      }
      awaitingMachine.delete(machineId);
      if (!registry.agent(machineId)) {
        failOwedAway(machineId);
      }
    });
  };

  /**
   * Why an owed send waits, in {@link SendHold}'s terms: its machine away
   * within its grace, else its session's start held by an update, else sends
   * owed before it. Undefined for a send its machine has.
   */
  const holdOf = (record: SentMessageRow): SendHold | undefined => {
    if (!record.owed) {
      return;
    }
    const [row] = db.getInstancesByIds([record.instanceId]);
    if (row && keptAsleep(row)) {
      return "resting";
    }
    const origin = (record.body as SentMessage | null)?.origin;
    if (origin && heldAtLimit(record.instanceId, origin)) {
      return "limit";
    }
    const away = row ? awaitingMachine.get(row.machineId) : undefined;
    if (row && away && !registry.agent(row.machineId)) {
      return away.why;
    }
    return db.owesSpawn(record.instanceId) ? "update" : "behind";
  };

  /**
   * A session's send, from its CawCo tools (`handoff`, `start_session`'s
   * opening, a report): checked as a session's send must be, then the one
   * send path ({@link deliverSend}), and what became of it. A send that
   * failed is refused with why.
   */
  const sessionSend = (
    asked: Envelope<SendPayload>,
    requester: InstanceRow
  ): SendDelivery => {
    const envelope = byIdNow(asked);
    const { payload } = envelope;
    const malformed = normalizeRelayMessage(payload);
    if (malformed) {
      throw new WorkItemRefusal(400, malformed);
    }
    downgradeNonDelegateUrgent(
      db.listedInstancesByIds([envelope.instanceId ?? ""])[0],
      payload,
      envelope.instanceId ?? ""
    );
    const { instanceId } = payload;
    const [before] = db.getInstancesByIds([instanceId]);
    const record = deliverSend({
      ...envelope,
      machineId: envelope.machineId || requester.machineId,
    });
    if (record.state === "failed") {
      throw new WorkItemRefusal(404, record.reason ?? "the send failed");
    }
    const hold = holdOf(record);
    const plan =
      !hold && before && wakesForSend(before) ? relaunchOf(before) : undefined;
    return {
      ...(hold ? { hold } : {}),
      ...(plan && plan.kind !== "refused" ? { woke: plan.kind } : {}),
      busy: pulses.get(instanceId)?.busy === true,
    };
  };

  /**
   * What a machine is owed, handed over once the hold it waited on is over,
   * in the order accepted and each once. A session asleep is woken first; a
   * failed or stopped one is not, its sends waiting for whatever starts it
   * next (a person's message, a restart), so a process that keeps dying is
   * never started again by its own sends. A send goes only to a process that
   * is up or starting, and one whose start is still held keeps its sends
   * owed until that start goes ({@link flushOwedStarts}). Each goes out as
   * accepted now, under a hand-off of its own ({@link takeBack}): what its
   * machine settles at its register never counts it among the sends a
   * restart lost, as it never reached the machine before.
   */
  const releaseOwed = (
    of: { instanceId: string } | { machineId: string }
  ): void => {
    for (const send of db.owedSends(of)) {
      releaseOne(send);
    }
  };

  /** One owed send, as {@link releaseOwed} hands it over. */
  const releaseOne = (send: SentMessageRow): void => {
    const [row] = db.getInstancesByIds([send.instanceId]);
    const agent = row ? registry.agent(row.machineId) : undefined;
    // Kept for a session nothing owed may wake: it waits for a send that may.
    if (!(row && agent) || keptAsleep(row)) {
      return;
    }
    const envelope = JSON.parse(send.owed ?? "{}") as Envelope<SendPayload>;
    // Kept while its account is at its limit: it goes once that is over.
    if (heldAtLimit(send.instanceId, envelope.payload.message.origin)) {
      return;
    }
    const refused = inputRefusal(
      send.instanceId,
      envelope.payload.message.origin
    );
    if (refused) {
      db.takeOwedSend(send.uuid);
      failSend(send, refused);
      return;
    }
    if (row.status === "sleeping") {
      wakeForSend(agent, row.machineId, send.instanceId);
    }
    const [now] = db.getInstancesByIds([send.instanceId]);
    if (
      db.owesSpawn(send.instanceId) ||
      !(now && (now.status === "running" || now.status === "starting")) ||
      db.takeOwedSend(send.uuid) === undefined
    ) {
      return;
    }
    const delivery = crypto.randomUUID();
    envelope.payload.delivery = delivery;
    changeSend(send, { acceptedAt: new Date(), delivery });
    sendFrame(agent, envelope);
  };

  /** A machine past its grace: what it was owed fails as any send to an absent machine does, but for a start an update still holds. */
  const failOwedAway = (machineId: string): void => {
    for (const send of db.owedSends({ machineId })) {
      const [row] = db.getInstancesByIds([send.instanceId]);
      // A send kept for a session at rest never waited on its machine.
      if (db.owesSpawn(send.instanceId) || (row && keptAsleep(row))) {
        continue;
      }
      if (db.takeOwedSend(send.uuid) !== undefined) {
        failSend(send, `machine ${machineId} is not connected`);
      }
    }
  };
  // A hub that just started has heard no machine yet: each gets the grace a
  // restarting agent gets, so a send to it waits for its register.
  db.listAgents().map((machine) => awaitGrace(machine.machineId, "hub"));
  /**
   * Each session's final message of the turn in flight: the text frames that
   * followed its last tool call. A tool call empties it, so what came before
   * (narration of work still under way) never reaches the parent. It is a
   * list because Claude emits one frame per content block, so one final
   * message can arrive as several text frames.
   */
  const finalMessage = new Map<string, string[]>();
  /**
   * Sessions whose turn in flight their account's limit refused: Claude Code
   * said `rejected` with no extra usage to fall back on, or ended the turn on
   * its `rate_limit` error. Its end is the at-limit controller's to answer,
   * not a failed turn to hand back.
   */
  const limitRefused = new Set<string>();
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
      const timer = lifetime.after(timeoutMs, () => {
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve("timeout");
      });
      waitingMachines.set(requestId, machineId);
      waiting.set(requestId, (frame) => {
        lifetime.cancel(timer);
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve(frame);
      });
      sendFrame(agent, {
        verb: "control",
        machineId,
        ...(instanceId && { instanceId }),
        payload,
      } satisfies Envelope<ControlPayload>);
    });
  };

  /** How long a machine gets to carry sessions' data: a few folders moved within one disk. */
  const CARRY_TIMEOUT_MS = 120_000;

  /**
   * Puts `rows`, all on `machineId`, on `accountId` (null: on none). A Claude
   * session's own data lives in its account's dir (core paths.ts
   * `sessionConfigDir`), so each one's machine carries it there first
   * ({@link CONTROL_CARRY_SESSIONS}) and its row says the new account only
   * once the machine answers that it all is: a reader with the row reads
   * that one dir. `stop` ends a session's process first when it is at rest,
   * for a move that relaunches it; without it a session whose process runs
   * stays where it is. A row with no conversation yet, or of another
   * harness, has nothing of Claude's to carry. Answers the rows that moved,
   * and why each other did not.
   */
  const moveRowsToAccount = async (
    machineId: string,
    rows: readonly {
      harness?: string | null;
      id: string;
      sessionId?: string | null;
    }[],
    accountId: string | null,
    stop = false
  ): Promise<{ kept: Map<string, string>; moved: string[] }> => {
    const requests: CarrySessionRequest[] = rows.flatMap((row) =>
      (row.harness ?? "claude") === "claude" && row.sessionId
        ? [
            {
              instanceId: row.id,
              sessionId: row.sessionId,
              accountId,
              ...(stop ? { stop: true } : {}),
            },
          ]
        : []
    );
    const outcomes = await askCarry(machineId, requests);
    const kept = new Map<string, string>();
    const moved: string[] = [];
    for (const row of rows) {
      const why = requests.some((one) => one.instanceId === row.id)
        ? keptBecause(machineId, outcomes.get(row.id))
        : undefined;
      if (why) {
        kept.set(row.id, why);
        console.warn(
          `[accounts] ${row.id} stays on its account; its data could not be carried to ${accountId ?? "no account"}: ${why}`
        );
        continue;
      }
      db.patchInstance(row.id, { accountId });
      moved.push(row.id);
    }
    return { moved, kept };
  };

  /** Why a carry left a row's data where it was ({@link moveRowsToAccount}); undefined when it is all in the new dir. */
  const keptBecause = (
    machineId: string,
    outcome: CarrySessionOutcome | undefined
  ): string | undefined => {
    if (!outcome) {
      return `${machineName(machineId)} said nothing of it`;
    }
    if (outcome.state === "carried") {
      return;
    }
    return outcome.state === "live" ? PROCESS_RUNS : outcome.error;
  };

  /** The machine's word on each carry asked of it; one it never gave is a failure with its reason. */
  const askCarry = async (
    machineId: string,
    requests: CarrySessionRequest[]
  ): Promise<Map<string, CarrySessionOutcome>> => {
    if (requests.length === 0) {
      return new Map();
    }
    const answer = await callAgent(
      machineId,
      CONTROL_CARRY_SESSIONS,
      [requests],
      CARRY_TIMEOUT_MS
    );
    if (answer === "offline" || answer === "timeout" || !answer.ok) {
      const error =
        typeof answer === "string"
          ? awayWords(machineId, answer)
          : (answer.error ?? `${machineName(machineId)} gave no reason`);
      return new Map(
        requests.map((one) => [
          one.instanceId,
          { state: "failed", error } as const,
        ])
      );
    }
    return new Map(
      Object.entries(answer.result as Record<string, CarrySessionOutcome>)
    );
  };

  /**
   * Every Claude session with a conversation on `machineId`, with the
   * account its row runs on, for the machine to carry into that account's
   * dir as its agent starts ({@link RegisterAckPayload.sessions}). Rows that
   * share one conversation and disagree on its account are left out: their
   * data cannot be in both dirs.
   */
  const claudeSessionsOn = (machineId: string): CarrySessionRequest[] => {
    const bySession = new Map<string, CarrySessionRequest | null>();
    for (const row of db.claudeConversationsOn(machineId)) {
      const accountId = row.accountId ?? null;
      const seen = bySession.get(row.sessionId);
      if (seen === undefined) {
        bySession.set(row.sessionId, {
          instanceId: row.id,
          sessionId: row.sessionId,
          accountId,
        });
      } else if (seen && seen.accountId !== accountId) {
        console.warn(
          `[accounts] conversation ${row.sessionId} has rows on ${seen.accountId ?? "no account"} and ${accountId ?? "no account"}; its data is left where it is`
        );
        bySession.set(row.sessionId, null);
      }
    }
    return [...bySession.values()].filter(
      (one): one is CarrySessionRequest => one !== null
    );
  };

  /** A session's list as its harness keeps it, asked of its machine (harness-plans.ts). */
  const planControl: HarnessPlanDeps["control"] = async (
    machineId,
    method,
    args,
    harness
  ) => {
    const response = await callAgent(
      machineId,
      method,
      args,
      READ_TIMEOUT_MS,
      harness
    );
    if (typeof response === "string") {
      throw new Error(`The plan could not be read: machine ${response}.`);
    }
    if (response.error) {
      throw new Error(String(response.error));
    }
    return response.result;
  };

  /**
   * A row from before `cwd` was pinned to the launch directory may hold a
   * folder its CLI wandered into. Its conversation names where it started —
   * Claude keeps the first cwd it saw, OpenCode and pi the session's own
   * directory — so its machine is asked once, at register, before anything of
   * it is restored. A machine that cannot answer is asked again at its next.
   */
  const readLaunchDirs = async (machineId: string): Promise<void> => {
    const rows = db.unreadLaunchDirs(machineId);
    for (let at = 0; at < rows.length; at += 8) {
      // biome-ignore lint/performance/noAwaitInLoops: bounded batches keep the machine's other control requests serviceable.
      await Promise.all(
        rows.slice(at, at + 8).map(async (row) => {
          const answer = await callAgent(
            machineId,
            CONTROL_GET_SESSION_INFO,
            [row.sessionId],
            READ_TIMEOUT_MS,
            (row.harness as HarnessKind | null) ?? "claude"
          );
          if (answer === "offline" || answer === "timeout" || !answer.ok) {
            return;
          }
          const info = answer.result as { cwd?: string } | null | undefined;
          db.settleLaunchDir(row.id, info?.cwd || undefined);
        })
      );
    }
  };

  /**
   * An account removed while a machine was signing it in: that machine
   * forgets the dir (and login) it just made for it, as removing the account
   * would have, and the caller is told why in a sentence.
   */
  /** Has `machineId` forget an account's store: a Claude dir through Claude Code, any other through the agent. */
  /**
   * Signs `account` out of a machine and drops its store there. A Claude
   * account's dir carries each session that ran there out first: into
   * `into`'s dir when it is joined into that account, else into the dir of a
   * session on no account, which is what those rows then say
   * ({@link rowsLeave}).
   */
  const forgetOn = (
    account: Account,
    machineId: string,
    into: string | null = null
  ) =>
    account.provider === CLAUDE_PROVIDER
      ? callAgent(
          machineId,
          CONTROL_FORGET_ACCOUNT,
          [account.id, into],
          SIGNIN_TIMEOUT_MS,
          "claude"
        )
      : callAgent(
          machineId,
          CONTROL_FORGET_PROVIDER_ACCOUNT,
          [account.id],
          SIGNIN_TIMEOUT_MS
        );

  /**
   * The rows on an account that is gone (from every machine, or from
   * `machineId` alone) say where their sessions' data went with its dir
   * ({@link forgetOn}): the account it joined, else none. A machine that was
   * away carries the data out when it next connects (its account sweep, then
   * the carry of every session into its row's dir).
   */
  const rowsLeave = (
    accountId: string,
    into: string | null,
    machineId?: string
  ): void => {
    const rows = db
      .listInstances()
      .filter(
        (row) =>
          row.accountId === accountId &&
          (machineId === undefined || row.machineId === machineId)
      );
    for (const row of rows) {
      db.patchInstance(row.id, { accountId: into });
    }
    if (rows.length > 0) {
      console.log(
        `[accounts] ${rows.length} session(s) on ${accountId} are on ${into ?? "no account"} now`
      );
      publishInstances("");
    }
  };

  const undoRemovedSignin = async (
    account: Account,
    machineId: string
  ): Promise<string> => {
    await forgetOn(account, machineId);
    const named = account.label ?? account.email;
    return `${named ? `The account "${named}"` : "The account you were adding"} was removed while ${machineName(machineId)} was signing it in, so that sign-in was undone. Add the account again to sign it in.`;
  };

  /** Each machine's word on the providers an account can be for, from its last beat. */
  const machineProviders = new Map<string, ProviderInfo[]>();

  /** Every provider any machine knows, one entry each, the first machine's word on it. */
  const knownProviders = (): ProviderInfo[] => {
    const byId = new Map<string, ProviderInfo>();
    for (const providers of machineProviders.values()) {
      for (const provider of providers) {
        if (!byId.has(provider.id)) {
          byId.set(provider.id, provider);
        }
      }
    }
    return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  };

  /** Why an account of `provider` cannot be of `kind`; undefined when it can. */
  const accountKindRefusal = (
    provider: string,
    kind: AccountKind
  ): string | undefined => {
    if (provider === CLAUDE_PROVIDER) {
      return ACCOUNT_KINDS.includes(kind)
        ? undefined
        : "A Claude account is a subscription or a Console organization.";
    }
    if (!PROVIDER_ACCOUNT_KINDS.includes(kind)) {
      return `A ${provider} account signs in with OAuth or a key, not as a ${kind}.`;
    }
    const known = knownProviders().find((one) => one.id === provider);
    if (!known) {
      return `No machine knows a provider ${provider}; it is neither pi-ai's nor OpenCode's on any connected machine.`;
    }
    if (kind === "oauth" && !known.oauth) {
      return `${known.name} has no OAuth sign-in CawCo can run; add it with a key.`;
    }
    return undefined;
  };

  /**
   * The credential a move takes out of a machine's own store, read on the
   * machine now: `~/.claude`'s login for `claude`; else the entry `provider`
   * names in pi's or OpenCode's own `auth.json`.
   */
  const homeCredentialOf = async (
    machineId: string,
    store: HomeStore,
    storeProvider: string | undefined
  ): Promise<
    | {
        identity: AccountIdentity;
        kind: AccountKind;
        provider: AccountProvider;
        storeProvider: string;
      }
    | { error: string; status: 409 | 422 | 503 }
  > => {
    const machine = machineName(machineId);
    const read =
      store === "claude"
        ? await callAgent(
            machineId,
            CONTROL_READ_HOME_LOGIN,
            [],
            SIGNIN_TIMEOUT_MS,
            "claude"
          )
        : await callAgent(
            machineId,
            CONTROL_READ_HOME_CREDENTIALS,
            [],
            SIGNIN_TIMEOUT_MS
          );
    if (read === "offline" || read === "timeout") {
      return { status: 503, error: awayWords(machineId, read) };
    }
    if (!read.ok) {
      return {
        status: 422,
        error: read.error ?? `${machine} could not say what its stores hold.`,
      };
    }
    if (store === "claude") {
      const home = read.result as HomeLogin;
      return home.loggedIn && home.identity
        ? {
            identity: home.identity,
            kind: home.kind ?? "subscription",
            provider: CLAUDE_PROVIDER,
            storeProvider: CLAUDE_PROVIDER,
          }
        : {
            status: 409,
            error: `Claude Code on ${machine} isn't signed in, so there is no login to move.`,
          };
    }
    const found = (read.result as HomeCredential[]).find(
      (one) => one.store === store && one.storeProvider === storeProvider
    );
    return found
      ? {
          identity: found.identity,
          kind: found.kind,
          provider: found.provider,
          storeProvider: found.storeProvider,
        }
      : {
          status: 409,
          error: `${store}'s own store on ${machine} holds no ${storeProvider ?? "(name a provider)"} credential CawCo can move.`,
        };
  };

  /** A machine that did not answer a sign-in step, in a sentence. */
  const awayWords = (machineId: string, answer: "offline" | "timeout") =>
    `${machineName(machineId)} is ${answer === "offline" ? "not connected" : "not answering"}.`;

  /**
   * Starts moving one credential out of a machine's own store into the
   * account of the identity it is (made now when there is none): the move is
   * kept until the machine has made it, and tried at once. Refused when it is
   * already moving, or the account already has a sign-in there or one moving
   * there.
   */
  const startMove = async (
    machineId: string,
    store: HomeStore,
    found: {
      identity: AccountIdentity;
      kind: AccountKind;
      provider: AccountProvider;
      storeProvider: string;
    }
  ): Promise<
    | { error: string; status: 409 }
    | {
        accountId: string;
        email: string;
        provider: AccountProvider;
        store: HomeStore;
        waitingFor: number;
      }
  > => {
    const machine = machineName(machineId);
    const { identity, kind, provider, storeProvider } = found;
    const key = moveKey({ machineId, store, storeProvider });
    if (movingLogins().some((one) => moveKey(one) === key)) {
      return {
        status: 409,
        error: `${machine}'s own ${store} ${storeProvider} is already moving into CawCo.`,
      };
    }
    const account = accountOfIdentity(db, identity, kind, provider);
    if (
      db.accounts
        .signins()
        .some(
          (one) =>
            one.accountId === account.id &&
            one.machineId === machineId &&
            one.state === "signed-in"
        )
    ) {
      return {
        status: 409,
        error: `${accountName(account)} is already signed in on ${machine} in CawCo; nothing was moved.`,
      };
    }
    if (
      movingLogins().some(
        (one) => one.accountId === account.id && one.machineId === machineId
      )
    ) {
      return {
        status: 409,
        error: `Another of ${machine}'s own stores is already moving ${accountName(account)} into CawCo.`,
      };
    }
    const move: LoginMove = {
      accountId: account.id,
      identity,
      machineId,
      provider,
      since: Date.now(),
      store,
      storeProvider,
    };
    db.accounts.putMove(move);
    moveResults.delete(key);
    tickMoves();
    const waitingFor = liveFrom(move).length;
    console.log(
      `[hub] moving ${machine}'s own ${store} ${storeProvider} (${identity.email}) into account ${account.id}; it moves at the first moment its ${waitingFor} live session(s) are at rest`
    );
    await advanceMove(move);
    return {
      accountId: account.id,
      email: identity.email,
      store,
      provider,
      waitingFor,
    };
  };

  /** The fingerprint of each connected machine's own stores this hub last moved from, by machine; cleared at its register. */
  const homeStamps = new Map<string, string>();
  /**
   * Every credential in a machine's own pi and OpenCode stores moved into
   * CawCo, so every provider login its harnesses use is an account the hub
   * places sessions on and reads limits for (OpenCode Go's windows,
   * ChatGPT's) and generate_image signs in with. Asked once per connection,
   * when its first report says how those stores stand, and again each time
   * they change under it ({@link HeartbeatPayload.homeStores}): a login made
   * there later moves within the agent's next check. A credential already
   * moved is gone from its store, and one whose account is already signed in
   * there stays where it is. A move that fails leaves the original as it was
   * and is asked again when the stores next change or the machine reconnects.
   */
  const adoptHomeCredentials = async (machineId: string): Promise<void> => {
    const read = await callAgent(
      machineId,
      CONTROL_READ_HOME_CREDENTIALS,
      [],
      SIGNIN_TIMEOUT_MS
    );
    if (typeof read === "string" || !read.ok) {
      console.warn(
        `[hub] ${machineName(machineId)} did not say what its own pi and OpenCode stores hold: ${typeof read === "string" ? read : (read.error ?? "no answer")}`
      );
      return;
    }
    for (const found of read.result as HomeCredential[]) {
      // biome-ignore lint/performance/noAwaitInLoops: one move at a time per machine, as each may wait on its sessions
      const started = await startMove(machineId, found.store, found);
      if ("error" in started) {
        console.log(`[hub] ${started.error}`);
      }
    }
  };

  /**
   * Accounts removed because a sign-in to them came out as an account that
   * already was ({@link joinExisting}), and the account each is now: a
   * sign-in still waiting on another machine for the removed one finishes
   * into that account.
   */
  const joinedInto = new Map<string, string>();

  /**
   * Of the account stores a connecting machine named (`accountStores` on its
   * register), the ones this hub deliberately removed (or joined away): the
   * machine forgets each ({@link RegisterAckPayload.unknownAccounts}). A
   * store this hub has no account for and no record of removing is left
   * alone: a hub whose database was wiped, or restored from an older copy,
   * has never heard of accounts that are real, and their logins may exist
   * nowhere else. Undefined when the machine named none, as an agent that is
   * not the machine's does.
   */
  const unknownAccountsOf = (
    machineId: string,
    payload: unknown
  ): string[] | undefined => {
    const stores = (payload as { accountStores?: unknown }).accountStores;
    if (!Array.isArray(stores)) {
      return undefined;
    }
    const unheld = stores.filter(
      (id): id is string => typeof id === "string" && !db.accounts.get(id)
    );
    const removed = db.accounts.removedOf(unheld);
    const strangers = unheld.filter((id) => !removed.includes(id));
    if (removed.length > 0) {
      console.log(
        `[accounts] ${machineName(machineId)} holds stores of ${removed.length} account${removed.length === 1 ? "" : "s"} this hub removed (${removed.join(", ")}); it forgets them`
      );
    }
    if (strangers.length > 0) {
      console.warn(
        `[accounts] ${machineName(machineId)} holds stores of ${strangers.length} account${strangers.length === 1 ? "" : "s"} this hub has never heard of (${strangers.join(", ")}); left alone`
      );
    }
    return removed;
  };

  /** The other account of `account`'s provider that already is `identity`. */
  const existingAs = (
    account: Account,
    identity: AccountIdentity
  ): Account | undefined =>
    db.accounts
      .list()
      .find(
        (one) =>
          one.id !== account.id &&
          one.provider === account.provider &&
          one.identity !== null &&
          sameIdentity(one.identity, identity)
      );

  /**
   * One identity is one account. A sign-in on `machineId` into `account`,
   * made for it and never signed in as anyone yet, came out as `existing`'s
   * identity: the machine joins it into `existing` there (its login moved
   * into `existing`'s store, or signed out and dropped when `existing`
   * already holds one), the sign-in is recorded on `existing`, and `account`
   * is removed with the empty stores its sign-ins left on other machines.
   */
  /**
   * The machine's half of a join: the login it signed in under `fromId`
   * becomes `existing`'s there, and the sign-in is recorded on `existing`.
   */
  const joinOn = async (
    fromId: string,
    existing: Account,
    machineId: string,
    identity: AccountIdentity
  ): Promise<AccountJoined | { error: string }> => {
    const answer =
      existing.provider === CLAUDE_PROVIDER
        ? await callAgent(
            machineId,
            CONTROL_JOIN_ACCOUNT_LOGIN,
            [fromId, existing.id, identity],
            SIGNIN_TIMEOUT_MS,
            "claude"
          )
        : await callAgent(
            machineId,
            CONTROL_JOIN_PROVIDER_ACCOUNT,
            [fromId, existing.id, identity],
            SIGNIN_TIMEOUT_MS
          );
    if (answer === "offline" || answer === "timeout") {
      return { error: awayWords(machineId, answer) };
    }
    if (!answer.ok) {
      return {
        error: `${machineName(machineId)} signed in as ${identity.email}, already ${accountName(existing)}, but could not make it that account's: ${answer.error ?? "it gave no reason"}`,
      };
    }
    const joined = answer.result as AccountJoinedOn;
    console.log(
      `[accounts] ${fromId} signed in on ${machineName(machineId)} as ${identity.email}, already ${existing.id}: ${joined.outcome === "kept" ? "its login there kept, the new one dropped" : "the new login is its own there now"}`
    );
    db.accounts.putSignin({
      accountId: existing.id,
      machineId,
      state: "signed-in",
      moved: null,
    });
    publishUsage(machineId);
    return {
      accountId: existing.id,
      note: `Signed in as ${identity.email}, which is already an account here; it's that account now.`,
    };
  };

  const joinExisting = async (
    account: Account,
    existing: Account,
    machineId: string,
    identity: AccountIdentity
  ): Promise<AccountJoined | { error: string }> => {
    const joined = await joinOn(account.id, existing, machineId, identity);
    if ("error" in joined) {
      return joined;
    }
    for (const signin of db.accounts
      .signins()
      .filter(
        (one) => one.accountId === account.id && one.machineId !== machineId
      )) {
      // biome-ignore lint/performance/noAwaitInLoops: one machine at a time; an offline one forgets its empty store when it next connects (`unknownAccountsOf`)
      await forgetOn(account, signin.machineId, existing.id);
    }
    db.accounts.remove(account.id, "joined");
    rowsLeave(account.id, existing.id);
    joinedInto.set(account.id, existing.id);
    publishUsage();
    return joined;
  };

  /**
   * A sign-in into `account`, never anyone yet, that came out as an identity
   * another account of its provider already is: joined into that account
   * ({@link joinExisting}). Undefined when it is nobody else's.
   */
  const joinIfTaken = async (
    account: Account,
    machineId: string,
    identity: AccountIdentity | null | undefined
  ): Promise<AccountJoined | { error: string } | undefined> => {
    const existing =
      identity && !account.identity ? existingAs(account, identity) : undefined;
    return existing && identity
      ? await joinExisting(account, existing, machineId, identity)
      : undefined;
  };

  /** What a Claude sign-in came to, kept, with the models its probe read. */
  const settleClaudeSignin = async (
    account: Account,
    machineId: string,
    result: AccountSigninResult
  ): Promise<AccountSigninResult | { error: string }> => {
    const joined =
      result.state === "signed-in"
        ? await joinIfTaken(account, machineId, result.probe?.identity)
        : undefined;
    if (joined) {
      return "error" in joined ? joined : { ...result, joined };
    }
    if (result.state === "signed-in" && result.probe) {
      if (result.probe.identity && !account.identity) {
        db.accounts.setIdentity(account.id, result.probe.identity);
      }
      keepProbe(db, account.id, result.probe);
    }
    // Signed in here through CawCo: no longer the login that was moved.
    db.accounts.putSignin({
      accountId: account.id,
      machineId,
      state: result.state,
      moved: null,
    });
    publishUsage(machineId);
    return result;
  };

  /**
   * What a provider sign-in or key came to, kept: signed in (the account
   * named by its identity the first time, its plan kept with its reading),
   * or signed out again as someone else's. Still waiting or expired changes
   * nothing.
   */
  const settleProviderSignin = async (
    account: Account,
    machineId: string,
    result: ProviderSigninResult
  ): Promise<ProviderSigninResult | { error: string }> => {
    const joined =
      result.state === "signed-in"
        ? await joinIfTaken(account, machineId, result.identity)
        : undefined;
    if (joined && result.state === "signed-in") {
      return "error" in joined ? joined : { ...result, joined };
    }
    if (result.state === "signed-in") {
      if (result.identity && !account.identity) {
        db.accounts.setIdentity(account.id, result.identity);
      }
      if (result.plan) {
        db.accounts.putReading(account.id, { subscription: result.plan });
      }
    }
    if (result.state === "signed-in" || result.state === "mismatch") {
      // Signed in here through CawCo: no longer the credential that was moved.
      db.accounts.putSignin({
        accountId: account.id,
        machineId,
        state: result.state,
        moved: null,
      });
      publishUsage(machineId);
    }
    return result;
  };

  /**
   * Finishes a machine's sign-in, which runs under the id it was begun with
   * (`signinId`), as the account it now finishes into: it must come out as
   * that account's identity.
   */
  const completeOn = (
    account: Account,
    signinId: string,
    machineId: string,
    code: string | undefined
  ) =>
    account.provider === CLAUDE_PROVIDER
      ? callAgent(
          machineId,
          CONTROL_COMPLETE_ACCOUNT_LOGIN,
          [code, signinId, account.identity],
          SIGNIN_TIMEOUT_MS,
          "claude"
        )
      : callAgent(
          machineId,
          CONTROL_COMPLETE_PROVIDER_LOGIN,
          [code ?? null, signinId, account.identity],
          SIGNIN_TIMEOUT_MS
        );

  /** Who a finished sign-in, of either kind, came out as. */
  const signedInAs = (
    account: Account,
    result: AccountSigninResult | ProviderSigninResult
  ): AccountIdentity | null | undefined => {
    if (account.provider === CLAUDE_PROVIDER) {
      return (result as AccountSigninResult).probe?.identity;
    }
    const provider = result as ProviderSigninResult;
    return provider.state === "signed-in" ? provider.identity : undefined;
  };

  /** A finished sign-in, kept on its account ({@link settleClaudeSignin}, {@link settleProviderSignin}). */
  const settleSignin = (
    account: Account,
    machineId: string,
    result: AccountSigninResult | ProviderSigninResult
  ) =>
    account.provider === CLAUDE_PROVIDER
      ? settleClaudeSignin(account, machineId, result as AccountSigninResult)
      : settleProviderSignin(
          account,
          machineId,
          result as ProviderSigninResult
        );

  /**
   * A sign-in begun for `signinId`, an account a sign-in on another machine
   * has since joined into `into`: it finishes into `into` there too.
   */
  const finishJoined = async (
    signinId: string,
    into: Account,
    machineId: string,
    result: AccountSigninResult | ProviderSigninResult
  ) => {
    const identity = signedInAs(into, result);
    if (result.state !== "signed-in" || !identity) {
      return result;
    }
    const joined = await joinOn(signinId, into, machineId, identity);
    return "error" in joined ? joined : { ...result, joined };
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
    // A project's decision page is read in that project's threads, which
    // follow no session's stream (its Caw's setup page): the board carries
    // every open preview, so every dashboard hears it there too.
    if ("project" in source) {
      publishInstances("");
    }
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
    if ("project" in target.source) {
      return closed;
    }
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
    // The preview's canvas moves to the session now showing it.
    db.touchCanvas({ id: canvasId(machineId, source), instanceId });
    if ("project" in source) {
      // A decision page is served from the hub's own folder (preview.ts).
      const revision = crypto.randomUUID();
      previewTargets.set(instanceId, { machineId, source, revision });
      return {
        ok: true,
        frame: publishPreview(instanceId, "open", source, revision),
      };
    }
    const stopLate = () =>
      detach(
        callAgent(machineId, PREVIEW_STOP, [{ instanceId }], BUSY_TIMEOUT_MS),
        "late preview stop"
      );
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
   * A decision page to show (Projects spec §5.8): `decisions/<page>/` in the
   * session's project folder. The hub builds it (decision-page.ts) from a
   * `page.html`: with `dir`, the one in the session's work folder on its
   * machine; else the one in `decisions/<page>/` (Caw's, who has no shell),
   * else the page already published there is shown as it is. The built
   * `index.html` is committed by the session; a revision is another commit at
   * the same place, so the canvas and its picks stay.
   */
  interface PageRefusal {
    code: 400 | 404 | 409 | 413 | 422 | 503 | 504;
    refused: string;
  }

  /** A file of the project folder's, or undefined when it is not there. */
  const folderText = async (
    projectId: string,
    path: string
  ): Promise<string | undefined> => {
    try {
      return (await readFolderFile(projectId, path)).content;
    } catch (error) {
      if (error instanceof FolderRefusal && error.status === 404) {
        return undefined;
      }
      throw error;
    }
  };

  /** Where page.html and what it names are read: the session's machine, or the project folder. */
  type PageOrigin =
    | { dir: string; machineId: string }
    | { projectId: string; folder: string };

  /** page.html in the project folder's `decisions/<page>/`, and what it names there; undefined when it has none. */
  const folderPageSources = async (origin: {
    projectId: string;
    folder: string;
  }): Promise<{ source: string; sources: PageSources } | undefined> => {
    const source = await folderText(
      origin.projectId,
      `${origin.folder}/page.html`
    );
    return source === undefined
      ? undefined
      : {
          source,
          sources: {
            mockup: (id) =>
              folderText(
                origin.projectId,
                `${origin.folder}/mockups/${id}.html`
              ),
            // The folder takes text only: its pages show the kit's stills.
            image: () => Promise.resolve(undefined),
          },
        };
  };

  /** Reads page.html and what it names from `origin`; a refusal when page.html is not there. */
  const pageSources = async (
    origin: PageOrigin
  ): Promise<
    { source: string; sources: PageSources } | PageRefusal | undefined
  > => {
    if ("projectId" in origin) {
      return await folderPageSources(origin);
    }
    const agent = registry.agent(origin.machineId);
    if (!agent) {
      return { code: 503, refused: "Machine is not connected" };
    }
    const readText = async (path: string) => {
      const read = await callFs(origin.machineId, agent, { op: "read", path });
      if (read === "timeout") {
        throw new Error("Machine did not answer");
      }
      return read.ok ? (read.result as string) : undefined;
    };
    const file = posix.join(origin.dir, "page.html");
    const source = await readText(file).catch(() => null);
    if (source === null) {
      return { code: 504, refused: "Machine did not answer" };
    }
    if (source === undefined) {
      return {
        code: 404,
        refused: `${file} is not there; write the page as page.html in that folder, from the skill's kit/page.html.`,
      };
    }
    return {
      source,
      sources: {
        mockup: (id) =>
          readText(posix.join(origin.dir, "mockups", `${id}.html`)),
        image: async (path) => {
          const read = await readMachineMedia(
            origin.machineId,
            posix.join(origin.dir, path)
          );
          return typeof read === "string" || "refused" in read
            ? undefined
            : read;
        },
      },
    };
  };

  const publishDecisionPage = async (
    row: InstanceRow,
    page: string,
    dir?: string
  ): Promise<{ project: string; page: string } | PageRefusal> => {
    if (!row.projectId) {
      return {
        code: 409,
        refused:
          "This session belongs to no project, so it has no folder for decision pages.",
      };
    }
    const folder = `decisions/${page}`;
    const path = `${folder}/index.html`;
    const read = await pageSources(
      dir === undefined
        ? { projectId: row.projectId, folder }
        : { dir, machineId: row.machineId }
    );
    if (read === undefined) {
      return (await folderText(row.projectId, path)) === undefined
        ? {
            code: 404,
            refused: `${folder}/ has no page.html or published page yet; pass dir with your work folder, or write ${folder}/page.html into the project's folder.`,
          }
        : { project: row.projectId, page };
    }
    if ("refused" in read) {
      return read;
    }
    const refusal = await commitPage(row, row.projectId, path, read);
    return refusal ?? { project: row.projectId, page };
  };

  /** Builds page.html and commits it at `path`, by the session; the refusal when it cannot be. */
  const commitPage = async (
    row: InstanceRow,
    projectId: string,
    path: string,
    read: { source: string; sources: PageSources }
  ): Promise<PageRefusal | undefined> => {
    const built = await buildDecisionPage(read.source, read.sources);
    if ("problem" in built) {
      return { code: 422, refused: built.problem };
    }
    try {
      await writeFolderFile(projectId, path, built.html, {
        author: { name: sessionLabel(row).name },
        message: `decisions: ${path.split("/")[1]}`,
      });
      return undefined;
    } catch (error) {
      if (!(error instanceof FolderRefusal)) {
        throw error;
      }
      return { code: error.status === 413 ? 413 : 400, refused: error.message };
    }
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
      if (target.machineId !== machineId || "project" in target.source) {
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
      const timer = lifetime.after(timeoutMs, () => {
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve("timeout");
      });
      waitingMachines.set(requestId, machineId);
      waiting.set(requestId, (frame) => {
        lifetime.cancel(timer);
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        resolve(frame);
      });
      try {
        send();
      } catch (error) {
        // Refused before it went: nothing will answer, so nothing waits.
        lifetime.cancel(timer);
        waiting.delete(requestId);
        waitingMachines.delete(requestId);
        reject(error);
      }
    });

  /** Who hears that a session started a delegate (project-offers.ts). */
  const delegateSpawned = new Set<(parentInstanceId: string) => void>();

  /**
   * A spawn sent on a session's behalf — a relayed one, or a work item's —
   * recorded as every spawn is: the row is what puts it in the rail. A
   * conversation that starts here is named by its first turn.
   */
  /** The thread a session Caw's work starts belongs to, if it is one (caw.ts `spawnThread`). */
  const threadOfSpawn = (
    parentInstanceId: string | undefined,
    workItemId: string | undefined
  ): { threadId?: string } => {
    const threadId = parentInstanceId
      ? caw.spawnThread(parentInstanceId, workItemId)
      : undefined;
    return threadId ? { threadId } : {};
  };

  /** The accounts a project task allows its attempts (`accounts:`), read from its file; null: every account. */
  const taskAccounts = (
    projectId: string | null | undefined,
    taskId: string | null | undefined
  ): string[] | null => {
    if (!(projectId && taskId)) {
      return null;
    }
    const indexed = db.taskIndex(projectId).find((row) => row.id === taskId);
    if (!indexed) {
      return null;
    }
    try {
      const { accounts } = new TaskDoc(
        indexed.path,
        readFileSync(join(projectRoot(projectId), indexed.path), "utf8")
      ).read().fields;
      return accounts.length > 0 ? accounts : null;
    } catch {
      return null;
    }
  };

  /**
   * Everything placement reads for a session about to start on `machineId`
   * (placement.ts): its provider's accounts, where they are signed in, their
   * readings and bench, the project's and task's lists, the delegate type's
   * preference, and who started it.
   */
  /**
   * What a spawn itself asks of placement: who started it, the account it
   * picked, its delegate type's preference, and its project's and task's
   * allow-lists.
   */
  const spawnAsks = (
    payload: SpawnPayload,
    task: { projectId?: string | null; taskId?: string | null }
  ): Pick<
    PlacementInput,
    "explicit" | "kind" | "projectAccounts" | "taskAccounts" | "typeAccount"
  > => {
    const projectId = payload.projectId ?? task.projectId ?? undefined;
    const type = payload.delegateType;
    const typeAccount = type
      ? projectTypes.resolveTypeFor(type.projectId ?? projectId, type.name)
          ?.account
      : undefined;
    const { parentInstanceId } = peekParent(payload);
    return {
      kind: parentInstanceId || payload.spawnedBy ? "delegates" : "yours",
      projectAccounts: projectId
        ? (db.project(projectId)?.accounts ?? null)
        : null,
      taskAccounts: taskAccounts(projectId, task.taskId),
      ...(payload.account ? { explicit: payload.account } : {}),
      ...(typeAccount ? { typeAccount } : {}),
    };
  };

  const placementInput = (
    machineId: string,
    payload: SpawnPayload,
    task: { projectId?: string | null; taskId?: string | null },
    fork: { accountId: string | null } | undefined
  ): PlacementInput | undefined => {
    const provider = accountProviderFor(
      machineId,
      payload.harness ?? "claude",
      payload.model
    );
    if (!provider) {
      return undefined;
    }
    const asks = spawnAsks(payload, task);
    const routing = db.accounts.routing(provider);
    const now = Date.now();
    return {
      accounts: db.accounts
        .list()
        .filter((account) => account.provider === provider),
      signins: db.accounts.signins(),
      readings: db.accounts.readings(),
      bench: db.accounts.bench(),
      routing,
      machineId,
      machineName: db
        .listAgents()
        .find((agent) => agent.machineId === machineId)?.hostname,
      model: payload.model,
      ...asks,
      ...(fork ? { fork } : {}),
      ...carryTestFor(provider, routing[asks.kind].strategy, (forecast) =>
        kindBurn(forecast, isOfKind(forecast, asks.kind), now)
      ),
      now,
    };
  };

  /**
   * What soonest-reset's carry test reads (placement `paces` and `burn`):
   * each of `provider`'s accounts' paces, and the burn the session brings.
   * Read only for soonest-reset, which alone asks.
   */
  const carryTestFor = (
    provider: AccountProvider,
    strategy: PlacementStrategy,
    burnOf: (forecast: ForecastRead) => number | null
  ): Pick<PlacementInput, "burn" | "paces"> => {
    if (strategy !== "soonest-reset") {
      return {};
    }
    const forecast = readForecast(db, provider, Date.now());
    return { paces: forecast.paces, burn: burnOf(forecast) };
  };

  /** Whether a session with turns in `forecast` is of `kind`: a person's, or a session's delegate. */
  const isOfKind = (
    forecast: ForecastRead,
    kind: "yours" | "delegates"
  ): ((instanceId: string) => boolean) => {
    const ids = [
      ...new Set(
        [...forecast.turns.values()].flatMap((turns) =>
          turns.map((turn) => turn.instanceId)
        )
      ),
    ];
    const delegates = new Set(
      db
        .getInstancesByIds(ids)
        .filter((row) => row.parentInstanceId)
        .map((row) => row.id)
    );
    return (instanceId) => delegates.has(instanceId) === (kind === "delegates");
  };

  /**
   * The account a spawn already has, so nothing is placed: its row's (an
   * account is for the session's whole life), or, for a resumed conversation,
   * the account of the row it was stored under (its transcript is there).
   * Undefined for a session to place: a new one, a fork, or a conversation
   * that ran on no account (the machine carries it into the placed one's dir).
   */
  const accountHeld = (
    payload: SpawnPayload
  ): { accountId?: string } | undefined => {
    const [row] = db.getInstancesByIds([payload.instanceId]);
    if (row?.accountId) {
      return { accountId: row.accountId };
    }
    const { resume } = payload;
    if (!resume || resume.fork) {
      return undefined;
    }
    const origin = db.instanceBySessionId(resume.sessionKey);
    return origin?.accountId ? { accountId: origin.accountId } : undefined;
  };

  /**
   * The account a row opened for a launch names now. A Claude conversation
   * resumed onto an account it is not on yet (one placed now, its origin on
   * none) has its data carried there by that launch, so the row names the
   * account only once the launch says so ({@link launchClaims}); meanwhile
   * it names the account the conversation is on.
   */
  const openedAccount = (
    payload: SpawnPayload,
    placed: { accountId?: string }
  ): { accountId?: string } => {
    if (
      (payload.harness ?? "claude") !== "claude" ||
      !payload.resume ||
      payload.resume.fork ||
      !placed.accountId
    ) {
      return placed;
    }
    const held = accountHeld(payload);
    if (held?.accountId === placed.accountId) {
      return placed;
    }
    launchClaims.set(payload.instanceId, {
      accountId: placed.accountId,
      at: Date.now(),
    });
    return held ?? {};
  };

  /**
   * The account a session about to open runs on: its row's, when it has one
   * (an account is for the session's whole life); a resumed conversation's
   * stays where its transcript is; a fork takes its origin's; anything else
   * is placed. A refusal is a sentence for whoever asked.
   */
  const placeSpawn = (
    machineId: string,
    payload: SpawnPayload,
    workItemId?: string
  ): { accountId?: string } | { refusal: string; status?: 404 } => {
    // Checked here, in the same synchronous step as the row's write that
    // follows: a project deleted after it was picked refuses the start.
    if (payload.projectId && !db.project(payload.projectId)) {
      return {
        status: 404,
        refusal: `The project "${payload.projectId}" was deleted, so the session can't start in it. Pick another.`,
      };
    }
    // Held, resumed, forked or placed: an account with no sign-in on the
    // machine has no dir there to run in, so the start is refused.
    const runsOn = (chosen: {
      accountId?: string;
    }): { accountId?: string } | { refusal: string } => {
      const [row] = db.getInstancesByIds([payload.instanceId]);
      const refusal = accountStartRefusal(
        machineId,
        { accountId: chosen.accountId, harness: payload.harness },
        row ? sessionName(row) : payload.title || "this session"
      );
      return refusal ? { refusal } : chosen;
    };
    const held = accountHeld(payload);
    if (held) {
      return runsOn(held);
    }
    const { resume } = payload;
    const item = workItemId ? db.workItem(workItemId) : undefined;
    const input = placementInput(
      machineId,
      payload,
      { projectId: item?.projectId, taskId: item?.taskId },
      resume?.fork
        ? {
            accountId:
              db.instanceBySessionId(resume.sessionKey)?.accountId ?? null,
          }
        : undefined
    );
    if (!input) {
      return payload.account
        ? {
            refusal: `${payload.model ?? "This model"} is no account's model on ${machineName(machineId)}; start it without an account. Nothing was started.`,
          }
        : {};
    }
    const placed = placedStart(machineId, payload, input);
    return "refusal" in placed ? placed : runsOn(placed);
  };

  /**
   * The account a start goes on, by placement, or none: on the machine's own
   * Claude login while it moves into CawCo ({@link startsOnHomeLogin}), or
   * on no account where its model is none's.
   */
  const placedStart = (
    machineId: string,
    payload: SpawnPayload,
    input: Parameters<typeof placeAccount>[0]
  ): { accountId?: string } | { refusal: string } => {
    if (startsOnHomeLogin(machineId, payload)) {
      return {};
    }
    const placed = placeAccount(input);
    if (!placed.ok) {
      return { refusal: `${placed.refusal} Nothing was started.` };
    }
    return placed.accountId ? { accountId: placed.accountId } : {};
  };

  /** A start as the placement explain query describes it, for placement to read. */
  const askedStart = (query: {
    account?: string;
    harness: string;
    kind?: "yours" | "delegates";
    model?: string;
    projectId?: string;
    type?: string;
  }): SpawnPayload => {
    const { projectId } = query;
    return {
      instanceId: "",
      cwd: "",
      harness: query.harness as HarnessKind,
      model: query.model,
      projectId,
      account: query.account,
      ...(query.type ? { delegateType: { name: query.type, projectId } } : {}),
      ...(query.kind === "delegates" ? { spawnedBy: { instanceId: "" } } : {}),
    };
  };

  /** {@link placeSpawn} for a path that refuses by throwing: its refusal is a 400, a deleted project's a 404. */
  const placedOrRefused = (
    machineId: string,
    payload: SpawnPayload,
    workItemId?: string
  ): { accountId?: string } => {
    const placed = placeSpawn(machineId, payload, workItemId);
    if ("refusal" in placed) {
      throw new WorkItemRefusal(placed.status ?? 400, placed.refusal);
    }
    return placed;
  };

  /**
   * A spawn of a row that exists goes to the directory the row was launched
   * in, whatever directory the caller sent: the harness keeps the conversation
   * under that directory, and a folder the CLI later wandered into may be gone.
   * A row whose launch directory is unknown (its machine had no record of its
   * conversation) is refused: there is nothing there to resume. Every
   * start, wake, resume and restore of an existing row is decided here.
   */
  const atLaunchDir = <P extends { cwd: string }>(
    instanceId: string | undefined,
    payload: P
  ): { payload: P } | { refusal: string } => {
    const launched = instanceId ? db.launchDirOf(instanceId) : undefined;
    if (!launched) {
      return { payload };
    }
    if ("unknown" in launched) {
      const row = instanceId
        ? db.getInstancesByIds([instanceId])[0]
        : undefined;
      const name = row ? sessionName(row) : String(instanceId).slice(0, 8);
      const machine = row ? machineName(row.machineId) : "its machine";
      return {
        refusal: `${name}'s conversation is no longer on ${machine}, so it can't be resumed.`,
      };
    }
    return { payload: { ...payload, cwd: launched.cwd } };
  };
  /** {@link atLaunchDir}'s refusal for a row, if it would refuse one. */
  const launchRefusal = (instanceId: string): string | undefined => {
    const launched = atLaunchDir(instanceId, { cwd: "" });
    return "refusal" in launched ? launched.refusal : undefined;
  };

  /** A hub-issued spawn's mode (`settleMode`) and directory (`atLaunchDir`), or the first refusal. */
  const settleSpawn = (
    machineId: string,
    asked: SpawnPayload,
    fallbackMode?: string | null
  ):
    | { payload: SpawnPayload; permissionMode: string | null }
    | { refusal: string } => {
    const inFlight = inFlightRefusal(asked.instanceId);
    if (inFlight) {
      return { refusal: inFlight };
    }
    const settled = settleMode(machineId, asked, fallbackMode);
    if ("refusal" in settled) {
      return settled;
    }
    const launched = atLaunchDir(settled.payload.instanceId, settled.payload);
    return "refusal" in launched
      ? launched
      : { payload: launched.payload, permissionMode: settled.permissionMode };
  };

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
    const settled = settleSpawn(machineId, asked, fallbackMode);
    if ("refusal" in settled) {
      throw new WorkItemRefusal(400, settled.refusal);
    }
    const { payload } = settled;
    const placed = placedOrRefused(machineId, payload, workItemId);
    // A start under an id that ran before: what it was handed and never read
    // its machine hands back as it replaces the process ({@link takeBack}).
    forgetPending(payload.instanceId, UNREAD.restarted, false, "all");
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
      ...(payload.role ? { role: payload.role } : {}),
      ...(payload.delegateType ? { delegateType: payload.delegateType } : {}),
      ...threadOfSpawn(peekParent(payload).parentInstanceId, workItemId),
      ...openedAccount(payload, placed),
    });
    sendSpawn(agent, machineId, {
      verb: "spawn",
      machineId,
      instanceId: payload.instanceId,
      payload,
    } satisfies Envelope<SpawnPayload>);
    if (!peekResume(payload)) {
      awaitingFirstTurn.add(payload.instanceId);
    }
    publishInstances(machineId);
    const { parentInstanceId: spawnedBy } = peekParent(payload);
    if (spawnedBy) {
      for (const heard of delegateSpawned) {
        heard(spawnedBy);
      }
    }
  };

  /**
   * An in-process spawn, issued. One that carries a `requestId` (start_session's)
   * is held until its machine says the session is in place, and answers with
   * the machine's own words when it is not; one without is fire-and-forget,
   * its failure reaching the row and its parent later.
   */
  const relaySpawn = async (
    machineId: string,
    asked: SpawnPayload,
    fallbackMode?: string
  ): Promise<{ code: number; message: string } | undefined> => {
    const payload = await piDefaultFor(machineId, asked);
    if ("refusal" in payload) {
      return { code: 503, message: payload.refusal };
    }
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
    const listed = (id: string) => db.listedInstancesByIds([id])[0];
    const refusal = enforceRowSessionKey(listed(payload.instanceId), payload);
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
          ? resolveDelegatePermissionMode(listed, parentInstanceId)
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
    const named = await piDefaultFor(machineId, asked);
    if ("refusal" in named) {
      throw new Error(named.refusal);
    }
    const settled = settleSpawn(machineId, named, fallbackMode);
    if ("refusal" in settled) {
      throw new Error(settled.refusal);
    }
    const { payload } = settled;
    const placed = placedOrRefused(machineId, payload);
    const requestId = crypto.randomUUID();
    // A start under an id that ran before: what it was handed and never read
    // its machine hands back as it replaces the process ({@link takeBack}).
    forgetPending(payload.instanceId, UNREAD.restarted, false, "all");
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
      ...openedAccount(payload, placed),
    });
    publishInstances(machineId);
    const reply = await awaitReply(
      machineId,
      requestId,
      SPAWN_START_TIMEOUT_MS,
      () =>
        sendFrame(agent, {
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
    from: LabelledRow,
    uuid: string,
    /** What rides it beside its words, as a dashboard's send carries it. */
    extras: Pick<SendPayload, "images" | "attachments"> = {}
  ): void => {
    deliverSend({
      verb: "send",
      machineId,
      instanceId,
      payload: {
        ...(extras.images?.length ? { images: extras.images } : {}),
        ...(extras.attachments?.length
          ? { attachments: extras.attachments }
          : {}),
        instanceId,
        message: {
          type: "user",
          uuid,
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: {
            kind: "peer",
            from: from.id,
            name: sessionLabel(from).name,
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
    (ws: S, incoming: unknown): void =>
      // A message too long for one frame arrives as parts, read in order
      // through the socket's inbox (`wire-socket.ts`).
      receiveFrame(ws, incoming, (message) => {
        try {
          handle(ws, message);
        } catch (error) {
          if (isEnvelope(message)) {
            sendFrame(
              ws,
              failure(
                message,
                error instanceof Error ? error.message : String(error)
              )
            );
          }
        }
      });
  const guardedAgentMessage =
    <
      S extends HubSocket & {
        remoteAddress: string;
        close: (code?: number, reason?: string) => unknown;
      },
    >(
      handle: (ws: S, message: unknown) => Promise<void>
    ) =>
    (ws: S, incoming: unknown): void =>
      // A transcript read, tens of MB, arrives as parts, read in order
      // through the socket's inbox (`wire-socket.ts`).
      receiveFrame(ws, incoming, (message) => {
        // A failure is answered by the catch below; nothing awaits a frame.
        detach(
          handle(ws, message).catch(
            // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: acknowledgement failures and correlated request failures share one socket error policy with explicit traces
            (error: unknown) => {
              const reason =
                error instanceof Error ? error.message : String(error);
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
                  sendFrame(requester, {
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
          ),
          "agent frame"
        );
      });
  const recoveringRemoved = new Set<string>();
  const stopDispatches = new Map<
    string,
    {
      instanceId: string;
      machineId: string;
      requestId: string | undefined;
      at: number;
      timer: HubTimer;
    }
  >();
  const finishStopDispatch = (key: string, outcome: string): void => {
    const sent = stopDispatches.get(key);
    if (!sent) {
      return;
    }
    lifetime.cancel(sent.timer);
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
      // A forget waiting on this session's end hears it now, not at the ask.
      projectStops.confirmed(row.id);
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
      sendFrame(agent, {
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
        timer: lifetime.after(payload.discard ? 30_000 : READ_TIMEOUT_MS, () =>
          finishStopDispatch(key, "timed-out")
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
      detach(
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
          .finally(() => refreshingCustody.delete(machineId)),
        "custody refresh"
      );
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
      sessionEnding(row);
    }
  };
  /**
   * What a session's work leaves behind as its end is decided. What it was
   * sent and has not read is settled when its machine says it `stopped`, not
   * now: its process runs until then, and may take its queue up as the stop
   * cuts its turn (Claude Code does), which its transcript then holds.
   */
  const sessionEnding = (
    row: { id: string } & Parameters<typeof workItems.cancelled>[0]
  ) => {
    workItems.cancelled(row);
    forgetPending(row.id, UNREAD.stopped, false, "all");
    closePreview(row.id).catch(console.error);
  };
  /**
   * A stop stored without asking the machine first: its reconcile sends it
   * whenever the machine is there to take it. For a machine that is away,
   * and for a session with no process to wait on.
   */
  const oweStop = (instanceId: string): void => {
    const row = db.ownedInstance(instanceId);
    lifecycle.oweEndSession(instanceId, "stop");
    if (row) {
      sessionEnding(row);
    }
  };
  // A project's running sessions, stopped before it is forgotten, each
  // reported to the dashboard as its machine confirms the end (project-stops.ts).
  const projectStops = createProjectStops({
    db,
    lifetime,
    pulse: (id) => pulses.get(id),
    stop: (id) => endSession(id, "stop"),
    // A machine that is away: the stop is stored, and its next register's
    // reconcile sends it (session-lifecycle `reconcile`).
    owe: (id) => oweStop(id),
    online: (machineId) => !!registry.agent(machineId),
    publish: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
    timeoutMs: READ_TIMEOUT_MS,
  });
  const waitForEnd = (
    instanceId: string,
    waitMs = SPAWN_START_TIMEOUT_MS
  ): Promise<void> =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + waitMs;
      const observe = () => {
        const row = db.ownedInstance(instanceId);
        if (!row || row.endConfirmedAt) {
          resolve();
        } else if (Date.now() >= deadline) {
          reject(
            new Error(
              `Session ${instanceId} was told to stop and its machine has not confirmed it within ${Math.round(waitMs / 1000)}s; the stop stays stored.`
            )
          );
        } else {
          lifetime.after(100, observe);
        }
      };
      observe();
    });

  /** A stored Stop survives reconnects; its caller still gets a bounded receipt. */
  const stopFromDashboard = (dashboard: HubSocket, message: Envelope): void => {
    const { instanceId } = message;
    if (!instanceId) {
      sendFrame(
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
      lifetime.cancel(timer);
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
      sendFrame(dashboard, {
        ...message,
        verb: "frames",
        requestId,
        payload: frame,
      });
    };
    const timer = lifetime.after(discard ? 30_000 : READ_TIMEOUT_MS, () =>
      reply(
        {
          kind: "control_result",
          requestId,
          ok: false,
          error:
            "Stop got no answer in time. The machine may be offline. Check the machine, then retry.",
        },
        "timed-out"
      )
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
   * still in flight from being asked anything. `mode` is the one it runs in
   * ({@link continuationSummary} picks it).
   */
  const summariserRun = async (
    source: ContinuationSource & { machineId: string },
    summarizer: { harness: HarnessKind; model?: string; account?: string },
    prompt: string,
    id: string,
    cancelled: () => boolean,
    mode: PermissionMode
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
          ...(summarizer.model ? { model: summarizer.model } : {}),
          ...(summarizer.account ? { account: summarizer.account } : {}),
          title: `Summary of ${source.title}`,
          scratch: {},
          spawnedBy: { instanceId: source.instanceId },
        },
        "summariser",
        // The hub's own worker, which nobody watches: it never parks on a
        // permission prompt, as workflow steps and supervisors never do.
        mode
      );
      if (cancelled()) {
        throw new Error(CONTINUATION_CANCELLED);
      }
      sendFromHub(
        source.machineId,
        id,
        prompt,
        // Its transcript was just read on its machine, in this directory.
        { id: source.instanceId, cwd: source.cwd, launchDir: "known" },
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
    model: string | undefined
  ): Promise<number | undefined> => {
    if (harness === "claude") {
      // No model named: Claude Code's own default, which the machine's
      // account's catalog resolves to a model id.
      const accountId = machineAccount(db, machineId);
      const id =
        model ??
        db.accounts
          .catalogs()
          .find((one) => one.accountId === accountId)
          ?.models.find((row) => row.value === "default")?.resolvedModel;
      return id ? db.claudeContextWindows()[id] : undefined;
    }
    if (!model) {
      return undefined;
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

  /**
   * The context a session's last real request sent, as it last reported it:
   * the row's `context_tokens` (every result writes it), else for a Claude
   * session its stored transcript's last request, read on its machine and
   * kept on the row. A reason when it never reported one.
   */
  const reportedContextOf = async (
    row: KeepAliveRow
  ): Promise<{ tokens: number; readAt: number } | { reason: string }> => {
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
    if (!("tokens" in reading)) {
      return reading;
    }
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
      tokens: measured.contextTokens as number,
      readAt: (measured.contextReadAt as Date).getTime(),
    };
  };

  /**
   * How many tokens a continuation's source holds: a running session's, as
   * its harness reads it now; one at rest, the context its last real request
   * sent ({@link reportedContextOf}), which holds what its transcript cannot
   * show (the system prompt, attachments, a model's encrypted thinking: 508k
   * for a session whose text estimates at 199k). The transcript's estimate
   * only for one that never reported.
   */
  const contextTokensOf = async (
    row: KeepAliveRow | undefined,
    scope: Parameters<typeof scopeChars>[0]
  ): Promise<number> => {
    if (!row) {
      return estimateTokens(scopeChars(scope));
    }
    if (row.status === "running" && registry.agent(row.machineId)) {
      return await liveContextTokensOf(row);
    }
    const reported = await reportedContextOf(row);
    return "tokens" in reported
      ? reported.tokens
      : estimateTokens(scopeChars(scope));
  };

  /** How many tokens a running session holds right now, as its harness reads it. */
  const liveContextTokensOf = async (row: InstanceRow): Promise<number> => {
    const requestId = crypto.randomUUID();
    const answer = await awaitReply(
      row.machineId,
      requestId,
      READ_TIMEOUT_MS,
      () => {
        const agent = registry.agent(row.machineId);
        if (agent) {
          sendFrame(agent, {
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
          } satisfies Envelope<ControlPayload>);
        }
      }
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
        (row ? sessionLabel(row).name : leafOf(where.cwd)),
    };
    const extracted = extractTranscript(scope, whole);
    extracted.artifacts = `${extracted.artifacts}\n\n${gitSection(git, since)}`;
    const prompt = extracted.middle.length
      ? summariserPrompt(extracted.middle, note)
      : undefined;
    return {
      source,
      extracted,
      prompt,
      liveContextTokens: await contextTokensOf(row, scope),
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
        return `Summarise with ${model ?? "the default model"}: ${refusal}`;
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
    return refusal
      ? `Continue on ${model ?? "the default model"}: ${refusal}`
      : undefined;
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
    ...(row.request.target.inPlace ? { inPlace: true as const } : {}),
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
    lifetime.after(
      Math.max(0, row.updatedAt.getTime() + CONTINUATION_KEPT_MS - Date.now()),
      () => {
        db.deleteContinuation(row.id);
        publishInstances(row.prepared.source.machineId);
      }
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
   * A continuation from a summary, as a job the hub owns and records:
   * summarise the source's live context once with the summariser the caller
   * chose (skipped when there is nothing before the tail), then start a
   * conversation seeded with the summary, the artifact index and the tail.
   * Returns at once; the job is carried to its end whatever happens to whoever
   * asked or to this hub, and only its Cancel — while it is still summarising
   * — stops it. "Continue in new session" starts a new session and only reads
   * the source; one in place (`target.inPlace`) has the source itself go on in
   * a fresh conversation, the same session throughout, or it fails and the
   * source goes on in the conversation it has ({@link continuationSteps}).
   */
  const startContinuation = (
    prepared: PreparedContinuation,
    request: ContinueRequest,
    /** A summary already written (ahead of an account's limit): nothing is summarised. */
    written?: string
  ): ContinuationRow => {
    const { inPlace } = request.target;
    // One the session asked for reads its conversation once the turn that
    // asked has ended, and summarises it then.
    const asked = !!inPlace && !inPlace.atLimit;
    const summarise = asked || (!!prepared.prompt && written === undefined);
    const row = db.insertContinuation({
      id: crypto.randomUUID(),
      sourceInstanceId: prepared.source.instanceId,
      request,
      prepared,
      summariserInstanceId: summarise ? crypto.randomUUID() : null,
      targetInstanceId: inPlace
        ? prepared.source.instanceId
        : crypto.randomUUID(),
      openingUuid: crypto.randomUUID(),
      summary: prepared.prompt ? (written ?? null) : null,
      stage: summarise ? "summarising" : "starting",
      error: null,
    });
    publishInstances(prepared.source.machineId);
    // The job runs on its own; its record is what anyone follows.
    detach(advanceContinuation(row.id), "continuation");
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
        detach(advanceContinuation(id), "continuation");
      }
    }
  };

  /**
   * A job's steps from where its record stands, each only while its machine
   * is here. One in place first has its session between turns and its
   * transcript saying the summary is being written ({@link readyInPlace});
   * then the summary; then the new conversation, or the new session, started
   * and handed the opening ({@link switchConversation}, {@link startTarget}).
   * Until that last step the session goes on in the conversation it has.
   */
  const continuationSteps = async (id: string): Promise<void> => {
    let row = db.continuationRow(id);
    if (row?.request.target.inPlace && !SETTLED.has(row.stage)) {
      if (!registry.agent(row.prepared.source.machineId)) {
        return;
      }
      row = await readyInPlace(row);
    }
    if (row?.stage === "summarising") {
      row = await summaryStep(row);
    }
    if (row?.stage === "starting" && registry.agent(machineFor(row))) {
      await (row.request.target.inPlace
        ? switchConversation(row)
        : startTarget(row));
      moveContinuation(row.id, { stage: "started" });
    }
  };

  /**
   * The `summarising` step, while its machine is here: the summary, when
   * there is anything before the tail to summarise, kept on the record. The
   * job as it then stands; nothing when its machine is away, or a Cancel
   * landed while the summariser answered.
   */
  const summaryStep = async (
    row: ContinuationRow
  ): Promise<ContinuationRow | undefined> => {
    if (!registry.agent(machineFor(row))) {
      return undefined;
    }
    const summary = row.prepared.prompt ? await continuationSummary(row) : null;
    if (summary !== null) {
      keepAtMove(row, summary);
    }
    return cancelledContinuation(row.id)
      ? undefined
      : moveContinuation(row.id, { stage: "starting", summary });
  };

  /** How often a continuation in place looks again whether its session is between turns: one busy read of its machine each time. */
  const IN_PLACE_IDLE_LOOK_MS = 2000;

  /**
   * Waits until `instanceId` is between turns (`sessionIdle`): nothing
   * running and nothing waiting on it. Throws {@link MachineAway} when its
   * machine goes meanwhile, and a Cancel's words when the job was cancelled.
   */
  const untilIdle = async (
    job: ContinuationRow,
    instanceId: string
  ): Promise<ReturnType<typeof db.getInstancesByIds>[number]> => {
    for (;;) {
      const [row] = db.getInstancesByIds([instanceId]);
      if (!row) {
        throw new Error(`${job.prepared.source.title} is no longer recorded`);
      }
      if (!registry.agent(row.machineId)) {
        throw new MachineAway(row.machineId);
      }
      if (cancelledContinuation(job.id)) {
        throw new Error(CONTINUATION_CANCELLED);
      }
      // biome-ignore lint/performance/noAwaitInLoops: one idle receipt a beat until the session is between turns
      if (await sessionIdle(row)) {
        return row;
      }
      await lifetime.sleep(IN_PLACE_IDLE_LOOK_MS);
    }
  };

  /**
   * A continuation in place, made ready to go on: its session between
   * turns; one the session asked for reads its conversation again, as it
   * stands now that the turn that asked has ended (what the call read was
   * mid-turn); and its transcript says the summary is being written, under
   * the job's id, the line the new conversation's "Continued on" takes the
   * place of. The job as it then stands.
   */
  const readyInPlace = async (
    job: ContinuationRow
  ): Promise<ContinuationRow | undefined> => {
    const { inPlace } = job.request.target;
    if (!inPlace || db.sendRecord(job.openingUuid)) {
      return job;
    }
    const row = await untilIdle(job, job.sourceInstanceId);
    let ready: ContinuationRow | undefined = job;
    if (!inPlace.atLimit && job.stage === "summarising" && !job.summary) {
      ready = moveContinuation(job.id, {
        prepared: await prepareContinuation(row.id, job.request.note),
      });
    }
    if (!db.atLimit.events([row.id]).some((event) => event.id === job.id)) {
      const to = job.request.target.account
        ? db.accounts.get(job.request.target.account)
        : undefined;
      noteAtLimit(
        row,
        {
          kind: "continuing",
          to: to ? namedAccount(to) : null,
          ...(inPlace.atLimit ? {} : { asked: true as const }),
          tokens: inPlace.contextTokens,
        },
        job.id
      );
    }
    return ready;
  };

  /**
   * The step that makes a continuation in place final, the session between
   * turns: its process is ended at rest, its conversation kept on its row
   * with the "Continued on" line after it (db `continueInPlace`), and it
   * starts again under its own id, on its new account and harness, in a
   * fresh conversation handed the opening first. Everything else it is owed
   * goes after that, in order. Once: a step that ran before (a restart in
   * between) goes on from where the row stands.
   */
  const switchConversation = async (job: ContinuationRow): Promise<void> => {
    if (db.sendRecord(job.openingUuid)) {
      return;
    }
    const id = job.sourceInstanceId;
    await leaveConversation(job);
    const [row] = db.getInstancesByIds([id]);
    const left = db
      .ownedInstance(id)
      ?.conversations.find((conversation) => conversation.next === job.id);
    if (!(row && left)) {
      throw new Error(`${job.prepared.source.title} is no longer recorded`);
    }
    const move = continuedMove(job.request);
    noteAtLimit(row, move, job.id);
    // Started once since it left its conversation: that process is the new one.
    if (!(row.spawnedAt && row.spawnedAt.getTime() >= left.endedAt)) {
      startFresh(row);
    }
    sendOpening(job, true);
    db.atLimit.dropHold(id);
    db.atLimit.dropSummary(id);
    console.info(
      `[continuation] ${id} goes on in a fresh conversation${move.to ? ` on ${move.to.name}` : ""}; its last one is kept on its row`
    );
    // What was kept for it while it went on goes once the opening is read
    // ({@link readSend}); one a restart found read already goes now.
    releaseOwed({ instanceId: id });
    publishInstances(row.machineId);
  };

  /**
   * A continuation in place's session leaves the conversation it runs, once
   * it is between turns: refused before anything changes when its start on
   * the new account would be, its process ended at rest where it runs (its
   * data staying in its own account's dir; one that took a turn meanwhile is
   * waited for again), and its conversation kept on its row (db
   * `continueInPlace`). Done already: nothing.
   */
  const leaveConversation = async (job: ContinuationRow): Promise<void> => {
    const id = job.sourceInstanceId;
    const { target } = job.request;
    if (
      db
        .ownedInstance(id)
        ?.conversations.some((conversation) => conversation.next === job.id)
    ) {
      return;
    }
    const row = await untilIdle(job, id);
    const accountId = target.account ?? row.accountId;
    const refused = accountStartRefusal(
      row.machineId,
      { ...row, accountId, harness: target.harness },
      sessionName(row)
    );
    if (refused) {
      throw new Error(refused);
    }
    const { kept } = await moveRowsToAccount(
      row.machineId,
      [row],
      row.accountId,
      true
    );
    const why = kept.get(id);
    if (why === PROCESS_RUNS) {
      return leaveConversation(job);
    }
    if (why) {
      throw new Error(why);
    }
    const left = db.continueInPlace(id, {
      accountId,
      harness: target.harness,
      model: target.model ?? null,
      ...(target.effort ? { effort: target.effort } : {}),
      next: job.id,
    });
    if (!left) {
      throw new Error(
        `${job.prepared.source.title} has no conversation to go on from`
      );
    }
  };

  /**
   * Starts a session's process again under its id in a fresh conversation,
   * on the settings, account, role, delegate type and workspace its row
   * names (`bounded`), the process it had replaced: the step a continuation
   * in place goes on with.
   */
  const startFresh = (
    row: ReturnType<typeof db.getInstancesByIds>[number]
  ): void => {
    const agent = registry.agent(row.machineId);
    if (!agent) {
      throw new MachineAway(row.machineId);
    }
    const refused =
      inFlightRefusal(row.id) ??
      launchRefusal(row.id) ??
      accountStartRefusal(row.machineId, row, sessionName(row));
    if (refused) {
      throw new Error(refused);
    }
    const settled = settleMode(
      row.machineId,
      revivePayloadOf(row, { kind: "fresh" }, true),
      row.permissionMode
    );
    if ("refusal" in settled) {
      throw new Error(settled.refusal);
    }
    // What its last process was handed and never read its machine hands back
    // for the new one ({@link takeBack}).
    forgetPending(row.id, UNREAD.restarted, false, "all");
    transcripts.noteRelaunch(row.id);
    db.openInstance({
      id: row.id,
      addressProtocol: addressProtocolMachines.has(row.machineId),
      machineId: row.machineId,
      cwd: settled.payload.cwd,
      harness: row.harness ?? undefined,
      kind: row.kind ?? undefined,
      permissionMode: settled.permissionMode,
      model: row.model ?? undefined,
    });
    sendSpawn(agent, row.machineId, {
      verb: "spawn",
      machineId: row.machineId,
      instanceId: row.id,
      payload: settled.payload,
    });
  };

  /**
   * The summary a continuation at an account's limit just wrote, kept for
   * its source until its reset with the last transcript entry it covers: a
   * retry after this job fails starts from it while the conversation has
   * not moved, rather than writing another.
   */
  const keepAtMove = (row: ContinuationRow, summary: string): void => {
    const { inPlace } = row.request.target;
    const { covers } = row.prepared.extracted;
    const writtenOn = row.request.summarizer.account;
    if (!(inPlace?.atLimit && inPlace.fromAccountId && covers && writtenOn)) {
      return;
    }
    db.atLimit.keepSummary({
      instanceId: row.sourceInstanceId,
      accountId: inPlace.fromAccountId,
      writtenOn,
      resetsAt: new Date(inPlace.atLimit.keepUntil).toISOString(),
      percent: null,
      covers,
      summary,
    });
  };

  /**
   * What a continuation in place did, as its transcript says between its two
   * conversations: on what account it went on (none on a harness without
   * accounts), what it left behind, and where its summary came from.
   */
  const continuedMove = (
    request: ContinueRequest
  ): Extract<AccountMove, { kind: "continued" }> => {
    const { inPlace, account } = request.target;
    const named = (id: string | null | undefined) => {
      const known = id ? db.accounts.get(id) : undefined;
      return known ? namedAccount(known) : null;
    };
    const to = named(account);
    const written = inPlace?.atLimit?.written;
    return {
      kind: "continued",
      from: named(inPlace?.fromAccountId),
      to,
      writtenOn:
        named(written?.onAccountId ?? request.summarizer.account) ?? to,
      ...(inPlace?.atLimit ? {} : { asked: true as const }),
      tokens: inPlace?.contextTokens ?? null,
      preparedAtPct: written?.atPct ?? null,
    };
  };

  /** The step of a job that a failure in its stage is. */
  const STEP_OF: Partial<Record<ContinuationJob["stage"], ContinueStep>> = {
    summarising: "summary",
    starting: "start",
  };

  /**
   * A job fails at `step` in the words the hub got. One in place leaves the
   * session in the conversation it has: a switch half made (its conversation
   * kept, the new one not handed its opening) is taken back, so it resumes
   * the one it had, and its "Summarising…" line says what failed — at its
   * account's limit through the at-limit controller, which holds it and
   * decides again.
   */
  const failContinuation = (
    row: ContinuationRow,
    step: ContinueStep,
    reason: string
  ): void => {
    moveContinuation(row.id, { stage: "failed", error: reason });
    const { inPlace, account } = row.request.target;
    if (!inPlace) {
      return;
    }
    const id = row.sourceInstanceId;
    if (!db.sendRecord(row.openingUuid) && db.undoContinueInPlace(id, row.id)) {
      console.warn(
        `[continuation] ${id} goes on in the conversation it had: ${reason}`
      );
      publishInstances(row.prepared.source.machineId);
    }
    if (inPlace.atLimit && inPlace.fromAccountId && account) {
      atLimit.continuationFailed(id, {
        fromAccountId: inPlace.fromAccountId,
        toAccountId: account,
        step,
        reason,
        line: row.id,
      });
      return;
    }
    const [source] = db.getInstancesByIds([id]);
    const move = continuedMove(row.request);
    if (source) {
      noteAtLimit(
        source,
        {
          kind: "unmoved",
          from: move.from,
          to: move.to,
          ...(inPlace.atLimit ? {} : { asked: true as const }),
          step,
          reason,
        },
        row.id
      );
    }
    // What was kept for it while it was to go on goes to it now.
    releaseOwed({ instanceId: id });
  };

  /**
   * A step that threw: nothing, when the job has settled meanwhile (a
   * Cancel); a wait, when its machine went away before the job changed
   * anything that cannot wait; otherwise the job fails at its step, in the
   * error's own words. True when it waits for its machine.
   */
  const continuationStepFailed = (id: string, error: unknown): boolean => {
    const row = db.continuationRow(id);
    if (!row || SETTLED.has(row.stage)) {
      return false;
    }
    if (error instanceof MachineAway || !registry.agent(machineFor(row))) {
      return true;
    }
    failContinuation(
      row,
      STEP_OF[row.stage] ?? "start",
      error instanceof Error ? error.message : String(error)
    );
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
    // Caused by the session that called continue_session, whose mode the
    // tool files on the request as the target's fallback. The dashboard
    // sends none: the owner's continuation is caused by no session.
    const mode = unwatchedMode(row.request.target.fallbackPermissionMode);
    const current = row.summariserInstanceId;
    if (db.getInstancesByIds([current]).length === 0) {
      return summariserRun(
        source,
        row.request.summarizer,
        prompt,
        current,
        cancelled,
        mode
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
      cancelled,
      mode
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
    const { request, prepared } = row;
    const [target] = db.getInstancesByIds([row.targetInstanceId]);
    if (target?.status !== "running") {
      await spawnFromHub(
        targetMachineOf(row),
        targetSpawn(request, prepared.source, row.targetInstanceId),
        request.target.scratch ? "scratch" : "mainline",
        request.target.fallbackPermissionMode
      );
    }
    sendOpening(row);
  };

  /**
   * Hands a job's opening under the job's send uuid, once: to its new
   * session, from the session it continues; or, in place, to the session
   * itself as the hub's word ({@link CONTINUATION_ORIGIN}), ahead of
   * whatever is kept for it, so its fresh conversation opens on it.
   */
  const sendOpening = (row: ContinuationRow, ahead = false): void => {
    if (db.sendRecord(row.openingUuid)) {
      return;
    }
    if (row.request.target.inPlace) {
      deliverSend(
        {
          verb: "send",
          machineId: targetMachineOf(row),
          instanceId: row.sourceInstanceId,
          payload: {
            ...(row.request.images?.length
              ? { images: row.request.images }
              : {}),
            ...(row.request.attachments?.length
              ? { attachments: row.request.attachments }
              : {}),
            instanceId: row.sourceInstanceId,
            message: {
              type: "user",
              uuid: row.openingUuid,
              message: { role: "user", content: openingOf(row) },
              parent_tool_use_id: null,
              origin: { kind: "system", name: CONTINUATION_ORIGIN },
            },
          },
        },
        ahead
      );
      return;
    }
    sendFromHub(
      targetMachineOf(row),
      row.targetInstanceId,
      openingOf(row),
      // Its transcript was read on its machine, in this directory.
      {
        id: row.prepared.source.instanceId,
        cwd: row.prepared.source.cwd,
        launchDir: "known",
      },
      row.openingUuid,
      // Kept on the job's record until now, so a restart in between keeps them.
      { images: row.request.images, attachments: row.request.attachments }
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
      let why = `That continuation already ended (${row.stage}).`;
      if (row.stage === "starting") {
        why = row.request.target.inPlace
          ? "Its fresh conversation is already starting."
          : "The new session is already starting.";
      }
      return { refused: 409, why };
    }
    const cancelled = moveContinuation(id, { stage: "cancelled" }) ?? row;
    if (row.summariserInstanceId) {
      turnWaiters
        .get(row.summariserInstanceId)
        ?.reject(new Error(CONTINUATION_CANCELLED));
      retireSummariser(row.prepared.source.machineId, row.summariserInstanceId);
    }
    // In place, the session goes on as it was: its "Summarising…" line
    // goes, and what was kept for it meanwhile goes to it.
    if (row.request.target.inPlace) {
      unnoteAtLimit({ id: row.sourceInstanceId }, row.id);
      releaseOwed({ instanceId: row.sourceInstanceId });
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
    ...(target.model ? { model: target.model } : {}),
    ...(target.effort ? { effort: target.effort } : {}),
    ...(target.permissionMode ? { permissionMode: target.permissionMode } : {}),
    ...(target.scratch ? { scratch: target.scratch } : {}),
    ...(target.bootstrap ? { bootstrap: target.bootstrap } : {}),
    ...(target.projectId ? { projectId: target.projectId } : {}),
    ...(target.account ? { account: target.account } : {}),
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
      sendFrame(
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
    sendFrame(agent, outgoing);
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
    // `row` is the register's snapshot, read before its machine was asked for
    // the launch directories of rows from before they were pinned. A row whose
    // conversation its machine has no record of is not restored.
    const launched = atLaunchDir(row.id, {
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
      ...typeSettingsOf(row),
    } satisfies SpawnPayload);
    if ("refusal" in launched) {
      console.warn(`[hub] not restored: ${launched.refusal}`);
      return;
    }
    const asked: SpawnPayload = launched.payload;
    // Adopt the stored mode without revalidating a new launch; custody must not be skipped.
    if (reattachOnly) {
      lifecycle.restoring(row.id);
      // A process sessiond holds is alive while its attach is on the way:
      // filed asleep or failed, the asks its attach replays were refused at
      // admission, and its CLI waited on a question nobody was shown.
      if (
        reattachOnly === true &&
        heldProcesses(machineCustody.get(row.machineId)).includes(row.id) &&
        db.markInstanceAttaching(row.id)
      ) {
        publishInstances(row.machineId);
      }
      sendFrame(agent, {
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
    // A launch already on its way is this restore: nothing goes beside it.
    const inFlight = inFlightRefusal(row.id);
    if (inFlight) {
      console.info(`[hub] not restoring ${row.id}: ${inFlight}`);
      return;
    }
    const refuse = (refusal: string): void => {
      // Custody also inspects failed OpenCode handles. A recorded refusal
      // stays failed until its settings change, rather than failing each boot.
      if (row.status === "error" && row.lastError === refusal) {
        return;
      }
      db.failInstance(row.id, refusal);
      forgetPending(row.id, refusal);
      console.warn(`[hub] not restoring ${row.id}: ${refusal}`);
    };
    const unsigned = accountStartRefusal(row.machineId, row, sessionName(row));
    if (unsigned) {
      refuse(unsigned);
      return;
    }
    const settled = settleMode(row.machineId, asked, row.permissionMode);
    if ("refusal" in settled) {
      refuse(settled.refusal);
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
      // The turn its last launch had open is handed back once this one is up.
      keepTurn: true,
    });
    sendFrame(agent, {
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
    const now = Date.now();
    const limits = sessionLimitsReader(db, now);
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
        keepAlive: keepAliveState(row as KeepAliveRow, limits(row), now),
      };
    });
  };
  /**
   * THE BOARD, KEPT: every listed row as the database holds it, by id. Read
   * whole once, as the hub starts; from then on only the rows the database's
   * change log names (db `takeChangedInstances`) are read again, by key. The
   * board was read whole on every publish, and on every board, list_sessions
   * and dashboard read besides: 2,600 rows, their JSON columns parsed, while
   * twenty sessions moved at once, held the hub's thread for seconds
   * (2026-10-09). A row that ages out of the listing leaves by the listing's
   * own rule ({@link listedAt}); what the database does not hold (presence,
   * running delegates, keep-alive) is laid over it on each read, as before.
   */
  db.takeChangedInstances();
  const boardBase = new Map(
    db.listBoardInstances().map((row) => [row.id, row] as const)
  );
  /** The rows the database changed since the last publish took them. */
  let boardMoved = new Set<string>();
  const refreshBoard = (): void => {
    const changed = db.takeChangedInstances();
    if (changed.length === 0) {
      return;
    }
    const fresh = new Map(
      db.listedBoardInstancesByIds(changed).map((row) => [row.id, row] as const)
    );
    for (const id of changed) {
      const row = fresh.get(id);
      if (row) {
        boardBase.set(id, row);
      } else {
        boardBase.delete(id);
      }
      boardMoved.add(id);
    }
  };
  const boardRows = () => {
    refreshBoard();
    const now = Date.now();
    const listed: BoardInstanceRow[] = [];
    for (const row of boardBase.values()) {
      if (row.kind !== "summariser" && listedAt(row, now)) {
        listed.push(row);
      }
    }
    return withKeepAlive(withDelegates(withSessionPresence(listed)));
  };

  /**
   * The whole board as one message: every row, every machine, and what each
   * session is holding. Built in one place so the snapshot a dashboard is
   * handed on connect and the snapshot it is pushed on every move are the same
   * object by construction.
   */
  /** The notices a person acknowledged; every change goes out on the next board publish. */
  const noticesSeen = createNoticesSeen({
    dbPath: DB_PATH,
    changed: () => publishInstances(""),
  });

  /** What each fleet machine proves itself with to the git remote (machine-credentials.ts). */
  const machineCredentials = createMachineCredentials();

  /**
   * Project moves (moves.ts): a machine's control throws {@link MoveAway}
   * when the machine is not here or went while it answered, so the job
   * waits for its register; anything else is the machine's own words.
   */
  const moves = createMoves({
    db,
    lifetime,
    gitRoot: GIT_ROOT,
    call: async (machineId, method, args, timeoutMs) => {
      const answer = await callAgent(machineId, method, args, timeoutMs);
      if (answer === "offline") {
        throw new MoveAway(machineId);
      }
      if (answer === "timeout") {
        throw new Error(`${machineName(machineId)} did not answer in time.`);
      }
      if (!answer.ok) {
        throw answer.error === MACHINE_DISCONNECTED ||
          answer.error === AGENT_RESTARTING
          ? new MoveAway(machineId)
          : new Error(
              answer.error ?? `${machineName(machineId)} gave no answer.`
            );
      }
      return answer.result;
    },
    online: (machineId) => registry.agent(machineId) !== undefined,
    machineName,
    movedHere: (instanceId, line) => noteMovedHere(instanceId, line),
    asks: () => pending.list(),
    park: (envelope) => parkForPerson(envelope, true),
    parked: (requestId) => pending.get(requestId) !== undefined,
    settle: (requestId, outcome) => {
      pending.resolve(requestId, outcome);
    },
    publish: (frame) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload: frame }),
    rowsChanged: (machineId) => publishInstances(machineId),
    placesChanged,
    spawn: (machineId, payload) => spawnSession(machineId, payload),
    send: (envelope) => {
      deliverSend(envelope);
    },
  });

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
    // A screen that connects is handed every move; each change after
    // arrives on the `moves` frame.
    moves: moves.table(),
    // Carried on every publish too: a notice acknowledged on one device
    // leaves every other one live, and is never shown after a reload.
    noticesSeen: noticesSeen.ids(),
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
      // Fixed once the hub has folded what an older one split: once per connection.
      formerIds: db.formerIds(),
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
  const publishedRows = new Map<string, string>();
  /**
   * Each row's overlay (what the database does not hold: presence, running
   * delegates, keep-alive) as last published. A row neither the database
   * moved nor whose overlay changed is the row published last time, and is
   * not serialised again.
   */
  const publishedOverlays = new Map<string, string>();
  const overlayOf = (row: ReturnType<typeof boardRows>[number]): string =>
    JSON.stringify([
      row.status,
      "held" in row ? row.held : null,
      row.runningDelegates,
      row.keepAlive,
    ]);
  // Seeded from the board as the hub boots: every dashboard connects after
  // this and is handed a snapshot at least this fresh, so the first publish
  // sends what moved rather than all of it.
  for (const row of boardRows()) {
    publishedRows.set(row.id, JSON.stringify(row));
    publishedOverlays.set(row.id, overlayOf(row));
  }
  boardMoved = new Set();
  const publishedExtras = boardExtras();
  const publishedAgents = new Map(
    publishedExtras.agents.map((row) => [row.machineId, JSON.stringify(row)])
  );
  const publishedMetadata = new Map(
    (["previews", "handoffs", "continuations", "noticesSeen"] as const).map(
      (key) => [key, JSON.stringify(publishedExtras[key])]
    )
  );

  const pendingInstancePublishes = new Set<string>();
  let instancePublishScheduled = false;
  /**
   * A session's role, or a delegate type or toolset, may have moved what a
   * live cawco connection lists: bound once the MCP server exists below.
   */
  let toolsMayHaveChanged = (): void => undefined;
  const publishInstances = (machineId: string): void => {
    // A session's model, project or harness can move under a live rule; every
    // move republishes, so this is the one place that has to drop the cache.
    ruleEngine.forgetFacts();
    toolsMayHaveChanged();
    pendingInstancePublishes.add(machineId);
    if (instancePublishScheduled) {
      return;
    }
    instancePublishScheduled = true;
    // On the hub's lifetime, as all its own schedule is: a hub closed first
    // (scripts/openapi.ts closes its scratch hub) publishes nothing after.
    lifetime.after(0, () => {
      instancePublishScheduled = false;
      const machines = [...pendingInstancePublishes];
      pendingInstancePublishes.clear();
      publishInstanceDelta(machines.length === 1 ? machines[0] : "");
    });
  };

  const publishInstanceDelta = (machineId: string): void => {
    const rows = boardRows();
    const moved = boardMoved;
    boardMoved = new Set();
    const upserts: typeof rows = [];
    const present = new Set<string>();
    for (const row of rows) {
      present.add(row.id);
      const overlay = overlayOf(row);
      if (
        !moved.has(row.id) &&
        publishedOverlays.get(row.id) === overlay &&
        publishedRows.has(row.id)
      ) {
        continue;
      }
      publishedOverlays.set(row.id, overlay);
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
        publishedOverlays.delete(id);
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
    for (const key of [
      "previews",
      "handoffs",
      "continuations",
      "noticesSeen",
    ] as const) {
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
      db.listedInstancesByIds([instanceId])[0]?.parentInstanceId;
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
      sendFrame(agent, {
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
   * The machine this hub runs on, by the id every agent registers under. The
   * id is a function of the host alone (core/machine-id.ts), and the hub and
   * its agent run as the same user's services there (cli/service.ts), so an
   * agent registered under it shares the hub's disk: a path on the hub, the
   * projects' folders and a hub-directory marketplace, is a path on that
   * machine. Every install type registers it, and no question is asked, so
   * there is no answer to wait for and none to time out into a wrong one.
   */
  const ownMachineId = hostMachineId();
  const isHubMachine = async (id: string): Promise<boolean> =>
    id === (await ownMachineId);

  /** The fleet content a machine holds on its disk now; nothing when it cannot say. */
  const readHoldings = async (machineId: string): Promise<FleetHoldings> => {
    const answer = await callAgent(
      machineId,
      READ_FLEET_HOLDINGS,
      [],
      READ_TIMEOUT_MS
    );
    if (
      typeof answer === "object" &&
      answer.ok &&
      typeof answer.result === "object" &&
      answer.result !== null
    ) {
      return answer.result as FleetHoldings;
    }
    return {};
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
    // The control result arrives through pendingFleet.
    detach(
      mcpReady.then(async () => {
        await fleetMcp.ready();
        const current = new Map(
          db.fleetConfig().mcp.map((row) => [row.name, row])
        );
        // A directory on the hub's disk names nothing on any other machine, so
        // only the hub's own machine links it; every other one is told which
        // marketplaces those are and installs their plugins from the bytes.
        const hubOnly = (await isHubMachine(machineId))
          ? new Set<string>()
          : new Set(
              config.marketplaces
                .filter(({ source }) => isHubDirectory(source))
                .map(({ name }) => name)
            );
        const hubErrors = new Map(
          hubOnly.size
            ? db
                .listPlugins()
                .flatMap(({ id, error }) =>
                  error ? [[id, error] as const] : []
                )
            : []
        );
        // What the machine holds is read off its disk now, and only those bytes
        // are left out: a copy that was wiped or edited since its last report is
        // carried in this same sync. A read that fails or does not answer holds
        // nothing, so every byte goes — heavier, never wrong.
        const held = await readHoldings(machineId);
        const places = db.listProjects().flatMap((project) => project.places);
        const mcpRows = config.mcp.flatMap((row) =>
          current.has(row.name) ? [current.get(row.name) as typeof row] : []
        );
        const outbound = fleetMcp.syncConfig(
          {
            ...config,
            // The fleet's own, for every folder; a project's are placed below.
            skills: unbound(config.skills).map((skill) =>
              held.skills?.[skill.name] === skill.hash
                ? { ...skill, files: undefined }
                : skill
            ),
            // A project-bound skill and MCP server once per place of its
            // project on this machine (project-placements.ts); a placed skill
            // always carries its files, as each place is its own copy.
            placedSkills: placedCopies(config.skills, places, machineId),
            placedMcp: placedCopies(mcpRows, places, machineId),
            pluginPayloads: config.pluginPayloads?.map((plugin) =>
              held.plugins?.[plugin.name] === plugin.hash
                ? { ...plugin, files: undefined }
                : plugin
            ),
            hubOnlyMarketplaces: [...hubOnly],
            // What the hub could not carry of a hub-only marketplace reaches that
            // machine no other way, so the hub's reason goes with the row.
            plugins: config.plugins.map((plugin) => {
              const error = hubErrors.get(plugin.id);
              return error && hubOnly.has(pluginMarketplace(plugin.id))
                ? { ...plugin, error }
                : plugin;
            }),
            mcp: unbound(mcpRows),
            // A project-bound hook once per place of its project on this
            // machine, with that place as its cwd (project-placements.ts).
            hooks: placedHooks(config.hooks, places, machineId),
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
        sendFrame(agent, {
          verb: "control",
          machineId,
          payload,
        } satisfies Envelope<ControlPayload>);
      }),
      "fleet sync"
    );
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
    for (const row of db.liveInstancesOn(machineId)) {
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
        sendFrame(agent, {
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

    const config = db.fleetConfig();
    const empty = !(
      config.mcp.length ||
      config.marketplaces.length ||
      config.plugins.length ||
      config.skills?.length ||
      config.hooks?.length ||
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
      sendFrame(agent, {
        verb: "fs",
        machineId,
        requestId,
        payload,
      } satisfies Envelope<FsPayload>)
    );
  };

  /**
   * One picture or video off a machine's disk, read the moment someone looks
   * at it: the transcript card and the Telegram bridge both point at the path
   * an agent named, and nothing is copied anywhere in between. A file the
   * machine will not hand over (moved, not a picture or video, over the size
   * limit) answers with the machine's own reason.
   */
  const readMachineMedia: MediaReader = async (machineId, path) => {
    const agent = registry.agent(machineId);
    if (!agent) {
      return "offline";
    }
    const answer = await callFs(machineId, agent, { op: "media", path });
    if (answer === "timeout") {
      return "timeout";
    }
    if (!answer.ok) {
      return { refused: answer.error ?? `${path} could not be read` };
    }
    const { base64, mediaType } = answer.result as FsMedia;
    // Copied into a fresh ArrayBuffer-backed view: a Buffer's `ArrayBufferLike`
    // backing is not what `Response` and `Blob` accept as a body.
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
    return { bytes, mediaType };
  };

  // Registered here, after the reader exists — same shape as the answer recorder.
  telegram?.setMediaReader(readMachineMedia);

  /**
   * Writes every fleet subagent into the user layer's `agents/` on one machine
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

    for (const file of files) {
      // biome-ignore lint/performance/noAwaitInLoops: each write is a control round-trip to the same machine over one socket; concurrent writes would race the daemon's own file handling.
      const answer = await callFs(machineId, agent, {
        op: "write",
        root: "claude-home",
        path: `agents/${file.name}.md`,
        content: file.content,
      });
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
      detach(pushAgents(machineId), "agent push");
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
   * Answers whether any row came to files, which is news for the machines.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: groups ids by marketplace, resolves each group, and stores every outcome (resolved or errored) in one place; splitting it would scatter the per-marketplace fallback this depends on.
  const resolvePlugins = async (ids: readonly string[]): Promise<boolean> => {
    let carried = false;
    if (ids.length === 0) {
      return carried;
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
          carried = true;
        }
      }
    }
    return carried;
  };

  const fanOutFleet = (): void => {
    toolsMayHaveChanged();
    for (const machineId of registry.machineIds()) {
      const agent = registry.agent(machineId);
      if (!agent) {
        continue;
      }
      sendFleetSync(machineId, agent);
      publishInstances(machineId);
    }
  };

  /** A stored skill fetched again from the source it names; the row as it now is. */
  const reresolveSkill = async (
    stored: FleetSkillMeta
  ): Promise<FleetSkillMeta> => {
    const resolved = await resolveSkill(stored.source);
    return db.putSkill({
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
  };

  // Every row the hub holds no bytes for, plugin or skill: never fetched, or
  // fetched and failed. Done once at boot rather than on every sync: a resolved
  // row is bytes the fleet already agrees on, and re-fetching it would be a
  // download per restart for a file nobody asked to change. A failed one is
  // tried again so the sentence on it is this hub's, in this hub's words, and a
  // source that came back heals with nobody pressing refresh. An adopted
  // skill's source is a machine, which is not fetched from here.
  // Boot does not stall on network fetches for rows that were already unresolved.
  const reresolveFailed = async (): Promise<void> => {
    let moved = await resolvePlugins(db.unresolvedPlugins());
    const failedSkills = db
      .listSkills()
      .filter((skill) => skill.error && !skill.source.startsWith("machine:"));
    for (const stored of failedSkills) {
      // biome-ignore lint/performance/noAwaitInLoops: one source fetched at a time, as a refresh does it
      const skill = await reresolveSkill(stored);
      moved ||= skill.hash !== stored.hash;
    }
    if (moved) {
      fanOutFleet();
    }
  };
  detach(reresolveFailed(), "fleet source re-resolve");

  /** Each place's path by its id, for a folded hook report to say which place a copy failed in. */
  const placePathById = (): ((placeId: string) => string | undefined) => {
    const paths = new Map(
      db
        .listProjects()
        .flatMap((project) =>
          project.places.map((place) => [place.id, place.path] as const)
        )
    );
    return (placeId) => paths.get(placeId);
  };

  /** Why a fleet row cannot be bound to `projectId`, or nothing when it can (null and left out always can). */
  const boundProblem = (
    projectId: string | null | undefined
  ): string | undefined =>
    projectId && !db.project(projectId)
      ? `There is no project ${projectId} on this hub.`
      : undefined;

  /** Tells every dashboard the projects changed: each reads them again. */
  const projectsChanged = (): void =>
    registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "projects.changed" },
    });

  // A place added or removed: every dashboard reads the projects again, and
  // its machine is sent its fleet config again, so the project's hooks, MCP
  // servers and skills reach the new place or leave the old one. Only when
  // the project has any; a place of a project without them changes nothing
  // on its machine.
  onPlacesChanged((machineId, projectId) => {
    projectsChanged();
    const agent = registry.agent(machineId);
    const fleet = db.fleetConfig();
    if (
      !agent ||
      (projectId &&
        !hasProjectRows(
          [...(fleet.hooks ?? []), ...fleet.mcp, ...(fleet.skills ?? [])],
          projectId
        ))
    ) {
      return;
    }
    sendFleetSync(machineId, agent);
    publishInstances(machineId);
  });

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
    answer: PermissionResult
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction validates ownership, workflow answers, delivery receipts and concurrent process death before reporting success.
  ): Promise<void> => {
    const parked = pending.get(requestId);
    if (!parked || parked.instanceId !== instanceId) {
      throw new Error("That request is no longer pending.");
    }
    // Clients held the ask with its secrets hidden; the call runs as asked.
    const result = answeredWithOriginal(parked, answer);
    if (answeringPermissions.has(requestId)) {
      throw new Error("That request is already being answered.");
    }
    const receipt: { outcome?: "answered" | "cancelled" } = {};
    answeringPermissions.set(requestId, receipt);
    try {
      // A hub-raised ask is settled here, never delivered to a machine: a
      // workflow's question, or an admin write waiting on the person.
      if (
        answerWorkflow(pending, requestId, result) ||
        adminAsks.answer(requestId, result) ||
        moves.answer(requestId, result)
      ) {
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
      if (delivered === "offline") {
        throw new Error(`machine ${parked.machineId} is not connected`);
      }
      if (delivered === "timeout") {
        throw new Error("Permission answer timeout.");
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
      // A project lead's question: your answer lands in its thread.
      lead?.answered(parked, result);
    } finally {
      answeringPermissions.delete(requestId);
    }
  };
  onPermissionAnswer(pending, answerPendingPermission);

  /**
   * An ask admission refused (`askRefusal`) is taken back from the process
   * that asked it: denied in words saying it could not be shown and why, so
   * its turn goes on instead of waiting on a question nobody was shown.
   */
  const withdrawUnshown = async (ask: Envelope, why: string): Promise<void> => {
    const requestId = ask.requestId ?? "";
    const { toolName, input } = ask.payload as Partial<PermissionRequestFrame>;
    const question = questionsOf(toolName ?? "", input ?? {}) !== null;
    const withdrawn = await callAgent(
      ask.machineId,
      WITHDRAW_PERMISSION,
      [requestId, unshownAskMessage(question, why)],
      READ_TIMEOUT_MS,
      undefined,
      ask.instanceId
    );
    let said: string;
    if (typeof withdrawn === "string") {
      said = withdrawn;
    } else if (withdrawn.ok) {
      said = "the session was told and goes on";
    } else {
      said = withdrawn.error ?? "the machine refused it";
    }
    console.log(
      `[hub] ask withdrawn session=${ask.instanceId ?? "none"} request=${requestId}: ${said}`
    );
  };

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
        sendFrame(dashboard, { ...message, verb: "frames", payload: frame });
      } else {
        streams.settleCommand(correlationId, frame);
      }
    };
    return true;
  };

  /**
   * Sessions whose account changes mid-turn: each relaunches when its turn
   * ends. A model that crossed an account provider has already put its
   * account on the row (`to` absent). A person's move has not: a row names
   * the account its running process reads, so its account's readings and
   * sign-in stay that process's until it is replaced; the next launch of the
   * row takes `to` and writes `move` ({@link takeOwedMove}).
   */
  const relaunchAtTurnEnd = new Map<
    string,
    { to?: string; move: AccountMove | null }
  >();

  /**
   * The row a launch of `row` runs as: on the account a person moved it to
   * (mid-turn, or while its machine was away), now that its process is being
   * replaced. Every launch takes it (`bounded`), so one that comes before the
   * turn's end (a restart, a wake after a crash, its machine's return) runs
   * on it too. The row itself names the account, and the move is over with
   * its line written, only once that launch's agent says the session's data
   * is in the account's dir ({@link landSessionDir}).
   */
  const takeOwedMove = (row: StoredRow): StoredRow => {
    const owed = relaunchAtTurnEnd.get(row.id);
    if (!owed) {
      return row;
    }
    if (owed.to === undefined) {
      relaunchAtTurnEnd.delete(row.id);
      return row;
    }
    return { ...row, accountId: owed.to };
  };

  /**
   * A Claude launch's word that its session's data is in `accountId`'s dir
   * (null: the machine's own), said once the launch carried it there and
   * before its CLI starts ({@link SESSION_DIR_READ}). The row names that
   * account from now on; a placement held for it ({@link launchClaims}) and
   * a move owed to it ({@link relaunchAtTurnEnd}) are over, the move's line
   * written and any hold at its old account's limit ended.
   */
  const landSessionDir = (row: StoredRow, accountId: string | null): void => {
    launchClaims.delete(row.id);
    const owed = relaunchAtTurnEnd.get(row.id);
    if (owed?.to !== undefined && owed.to === accountId) {
      relaunchAtTurnEnd.delete(row.id);
      db.atLimit.dropHold(row.id);
      if (owed.move) {
        noteAtLimit(row, owed.move);
      }
      // What was kept for it at its old account's limit goes to this launch.
      releaseOwed({ instanceId: row.id });
    }
    if ((row.accountId ?? null) === accountId) {
      return;
    }
    db.patchInstance(row.id, { accountId });
    console.log(
      `[hub] ${row.id}'s conversation is in ${accountId ?? "the machine's own"} dir now; its row says so`
    );
    publishInstances(row.machineId);
  };

  /** A session's row as the hub stores it. */
  type StoredRow = ReturnType<typeof db.getInstancesByIds>[number];

  /**
   * Why `row` cannot move to `account` by hand: the account is another
   * provider's than the session's, or is not signed in on its machine.
   */
  const handMoveRefusal = (
    row: StoredRow,
    account: Account
  ): string | undefined => {
    const harness = row.harness ?? "claude";
    const provider = row.accountId
      ? db.accounts.get(row.accountId)?.provider
      : accountProvidersOf(
          harness,
          resolvedModel(row.machineId, harness, row.model)
        )[0];
    const named = (id: string) =>
      id === CLAUDE_PROVIDER
        ? "Claude"
        : (knownProviders().find((one) => one.id === id)?.name ?? id);
    if (provider !== account.provider) {
      return provider
        ? `${sessionName(row)} runs on a ${named(provider)} account; ${accountName(account)} is a ${named(account.provider)} account.`
        : `${sessionName(row)}'s model is no account's, so it can't run on ${accountName(account)}.`;
    }
    const signedIn = db.accounts
      .signins()
      .some(
        (one) =>
          one.accountId === account.id &&
          one.machineId === row.machineId &&
          one.state === "signed-in"
      );
    if (signedIn) {
      return undefined;
    }
    // An account never signed in has no name of its own yet.
    return account.label || account.email
      ? `${accountName(account)} isn't signed in on ${machineName(row.machineId)}; sign it in there first.`
      : `That ${named(account.provider)} account has never been signed in; sign it in on ${machineName(row.machineId)} first.`;
  };

  /**
   * Moves `row` to `account` because a person asked, the line "Moved to …"
   * written as it moves. Its data is carried into the account's dir first
   * ({@link moveRowsToAccount}) and only then does its row name the account:
   * one at rest has its process ended for that and relaunches on it now; one
   * not running resumes on it when it next starts. One mid-turn goes on
   * reading its old account until the turn ends, so its row names that one
   * until then ({@link relaunchAtTurnEnd}); so does one whose machine is
   * away, whose next launch carries it. A hold at its old account's limit
   * ends: the person chose. A carry that cannot happen is refused, the row
   * left as it was.
   */
  const moveByHand = async (
    row: StoredRow,
    account: Account
  ): Promise<
    | {
        accountId: string;
        state: "moved" | "pending";
        why: string;
      }
    | { refusal: string }
  > => {
    const from = row.accountId ? db.accounts.get(row.accountId) : undefined;
    const move: AccountMove | null = from
      ? {
          kind: "moved",
          asked: true,
          from: namedAccount(from),
          to: namedAccount(account),
          sameOrganization: cacheCarries(from, account),
          tokens: row.contextTokens,
          window: null,
          resetsAt: null,
        }
      : null;
    const running = !["sleeping", "stopped", "error"].includes(row.status);
    const owe = () => {
      relaunchAtTurnEnd.set(row.id, { to: account.id, move });
      return {
        state: "pending" as const,
        accountId: account.id,
        why: running
          ? `${sessionName(row)} moves to ${accountName(account)} when its turn ends.`
          : `${sessionName(row)} moves to ${accountName(account)} when it next starts.`,
      };
    };
    if (
      (running && !(await sessionIdle(row))) ||
      !registry.agent(row.machineId)
    ) {
      return owe();
    }
    // A move it still owed (asked mid-turn, to another account) is over.
    relaunchAtTurnEnd.delete(row.id);
    if (running) {
      transcripts.noteRelaunch(row.id);
    }
    const { kept } = await moveRowsToAccount(
      row.machineId,
      [row],
      account.id,
      running
    );
    const why = kept.get(row.id);
    if (why === PROCESS_RUNS) {
      return owe();
    }
    if (why) {
      return {
        refusal: `${sessionName(row)} stays on its account: its conversation could not be carried to ${accountName(account)} (${why}).`,
      };
    }
    db.atLimit.dropHold(row.id);
    publishInstances(row.machineId);
    if (running) {
      relaunchOnAccount(row.id);
    }
    if (move) {
      noteAtLimit(row, move);
    }
    // What was kept for it at its old account's limit goes to it there.
    releaseOwed({ instanceId: row.id });
    return {
      state: "moved",
      accountId: account.id,
      why: running
        ? `${sessionName(row)} runs on ${accountName(account)} now.`
        : `${sessionName(row)} runs on ${accountName(account)} when it next starts.`,
    };
  };

  /**
   * Relaunches a session on the account its row now names (or on none), its
   * conversation whole: Claude Code's is carried into that account's dir; pi
   * reopens its session file on that account's runtime; OpenCode carries it
   * into that account's server. A person's move it owes ({@link
   * relaunchAtTurnEnd}) is carried first, its process ended at rest for it,
   * and its row names the account only once its data is there; one whose
   * carry cannot happen stays on its account and in place.
   */
  const relaunchOnAccount = (instanceId: string): void => {
    const [stored] = db.getInstancesByIds([instanceId]);
    const owed = stored ? relaunchAtTurnEnd.get(stored.id) : undefined;
    if (stored && owed?.to !== undefined && registry.agent(stored.machineId)) {
      const { to } = owed;
      relaunchAtTurnEnd.delete(stored.id);
      transcripts.noteRelaunch(stored.id);
      // The carry runs on its own; the relaunch follows it.
      detach(
        moveRowsToAccount(stored.machineId, [stored], to, true).then(
          ({ kept }) => {
            const why = kept.get(stored.id);
            if (why) {
              if (why === PROCESS_RUNS) {
                relaunchAtTurnEnd.set(stored.id, owed);
              }
              return;
            }
            db.atLimit.dropHold(stored.id);
            publishInstances(stored.machineId);
            if (owed.move) {
              noteAtLimit(stored, owed.move);
            }
            relaunchOnAccount(stored.id);
            releaseOwed({ instanceId: stored.id });
          }
        ),
        "account move"
      );
      return;
    }
    const row = stored && takeOwedMove(stored);
    const agent = row ? registry.agent(row.machineId) : undefined;
    if (!(row?.sessionId && agent)) {
      return;
    }
    console.log(
      `[hub] ${row.id} relaunches on ${row.accountId ? `account ${row.accountId}` : "no account"}`
    );
    transcripts.noteRelaunch(row.id);
    resumeSpawn(
      agent,
      row.machineId,
      { ...row, sessionId: row.sessionId },
      true
    );
  };

  /**
   * A model change on a pi or OpenCode session that crosses into or out of
   * an account provider: not relayed to the running process, which would go
   * on reading the store it started on. The row takes the new model and the
   * account placement gives it (none for a model outside accounts), and the
   * session moves at the turn boundary: now when it is at rest, else when its
   * turn ends. Undefined when the change crosses nothing; a refusal when no
   * account can take the new model.
   */
  /** Whether moving a pi or OpenCode row to `model` changes the provider of the account it runs on (or none). */
  const crossesProvider = (
    row: InstanceRow | undefined,
    model: string
  ): row is InstanceRow & { harness: string } => {
    if (!row?.harness || row.harness === "claude") {
      return false;
    }
    const current = row.accountId
      ? db.accounts.get(row.accountId)?.provider
      : undefined;
    return accountProviderFor(row.machineId, row.harness, model) !== current;
  };

  const crossModel = async (
    instanceId: string,
    model: string
  ): Promise<"crossed" | { refusal: string } | undefined> => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!crossesProvider(row, model)) {
      return undefined;
    }
    const next = accountProviderFor(row.machineId, row.harness, model);
    const placed = next
      ? claimAccount(row.machineId, { ...row, model })
      : { accountId: undefined };
    if ("refusal" in placed) {
      return placed;
    }
    db.patchInstance(row.id, { model, accountId: placed.accountId ?? null });
    if (await sessionIdle(row)) {
      relaunchOnAccount(row.id);
    } else {
      relaunchAtTurnEnd.set(row.id, { move: null });
    }
    return "crossed";
  };

  /**
   * A dashboard's model change that crosses an account provider
   * ({@link crossModel}): answered here, never relayed. False for every
   * other control, which goes on to the machine.
   */
  const relayModelCrossing = (
    message: Envelope<ControlPayload>,
    dashboard: HubSocket,
    remember: boolean
  ): boolean => {
    const { instanceId, payload } = message;
    const asked = payload.args?.[0];
    if (
      payload.method !== CONTROL_SET_MODEL ||
      !instanceId ||
      typeof asked !== "string"
    ) {
      return false;
    }
    const [row] = db.getInstancesByIds([instanceId]);
    if (!crossesProvider(row, asked)) {
      return false;
    }
    const requestId = message.requestId ?? payload.requestId;
    // The receipt is sent when the move is decided.
    detach(
      crossModel(instanceId, asked).then((crossed) => {
        const frame: ControlResult =
          crossed && crossed !== "crossed"
            ? {
                kind: "control_result",
                requestId,
                ok: false,
                error: crossed.refusal,
              }
            : { kind: "control_result", requestId, ok: true };
        if (remember) {
          sendFrame(dashboard, { ...message, verb: "frames", payload: frame });
        } else {
          streams.settleCommand(requestId, frame);
        }
        publishInstances(row.machineId);
      }),
      "model move"
    );
    return true;
  };

  const relayControl = (
    asked: Envelope<ControlPayload>,
    dashboard: HubSocket,
    remember = true
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: transcript deletion shares the control receipt path but records intent before machine delivery
  ): boolean => {
    const message = byIdNow(asked);
    if (relayModelCrossing(message, dashboard, remember)) {
      return true;
    }
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
        sendFrame(dashboard, { ...message, verb: "frames", payload: frame });
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
          sendFrame(dashboard, {
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
    lifetime,
    // A follower's plan whole (plans.ts), built below with the tasks it reads.
    planSnapshot: (instanceId, send) => plans.snapshotTo(instanceId, send),
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
    if ("fault" in found) {
      return found;
    }
    const [held] = db.getInstancesByIds([instanceId]);
    const prior = held ? (db.ownedInstance(held.id)?.conversations ?? []) : [];
    if ("entries" in found && prior.length === 0) {
      return found;
    }
    const { where } = found;
    const row = "row" in found ? found.row : held;
    // The conversations it went on from, oldest first, each followed by the
    // line between it and the next: the transcript reads as one.
    const earlier = row ? await priorEntries(row, where, prior) : [];
    if ("fault" in earlier) {
      return earlier;
    }
    const current = await currentEntries(
      where,
      at,
      "cut" in found ? found.cut : undefined
    );
    if ("fault" in current) {
      return current;
    }
    const stored = [...earlier, ...current];
    // Pictures as references to the media store, before a send's record is
    // filled from one of these entries.
    externalizeImages(stored);
    const records = recordMap(sendLines(row?.id, stored, true, true));
    const transcript = withoutPings(stored, records);
    if (row) {
      readRowHistory(row, transcript);
    }
    return { entries: transcript, records, where };
  };

  /**
   * A stored transcript without its keep-alive pings: a ping and its answer
   * are hidden together, also after a hub restart (a new main-loop user
   * prompt closes that range; tool results do not), and their records go.
   */
  const withoutPings = (
    entries: SessionMessage[],
    records: Record<string, SendRecord>
  ): SessionMessage[] => {
    let quiet = false;
    const kept = entries.filter((entry) => {
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
    return kept;
  };

  /**
   * The conversation a session runs now, as its machine stores it (none yet:
   * nothing), cut after the entry `at` a rewind names, else after a fork's
   * own `cut`.
   */
  const currentEntries = async (
    where: TranscriptWhere,
    at: string | undefined,
    forked: string | undefined
  ): Promise<SessionMessage[] | HistoryFault> => {
    if (!where.sessionKey) {
      return [];
    }
    const answer = await storedEntries(where);
    if ("fault" in answer) {
      return answer;
    }
    const cut = at ?? forked;
    const end = cut
      ? answer.entries.findIndex((entry) => entry.uuid === cut)
      : -1;
    return end >= 0
      ? answer.entries.slice(
          0,
          end + Number(includesRewindAnchor(where, answer.entries[end], at))
        )
      : answer.entries;
  };

  /** One of the hub's lines at an account's limit, as a stored transcript entry holds it. */
  const limitEntry = (
    row: { sessionId: string | null },
    event: { id: string; at: number; move: AccountMove }
  ): SessionMessage => ({
    type: "system",
    uuid: `limit-${event.id}`,
    session_id: row.sessionId ?? "",
    parent_tool_use_id: null,
    parent_agent_id: null,
    message: limitLine(row, event),
    timestamp: new Date(event.at).toISOString(),
  });

  /**
   * The conversations a session went on from, oldest first, as their machine
   * stores them — each where it ran there, in whichever account's dir, found
   * by its key — each followed by the line that stands between it and the
   * next ("Continued on …"). Or why one could not be read.
   */
  const priorEntries = async (
    row: InstanceRow,
    where: TranscriptWhere,
    prior: readonly PriorConversation[]
  ): Promise<SessionMessage[] | HistoryFault> => {
    const events = new Map(
      db.atLimit.events([row.id]).map((event) => [event.id, event])
    );
    const entries: SessionMessage[] = [];
    for (const conversation of prior) {
      // biome-ignore lint/performance/noAwaitInLoops: one conversation after another, in the order they are read
      const answer = await storedEntries({
        ...where,
        sessionKey: conversation.sessionId,
        harness: conversation.harness,
      });
      if ("fault" in answer) {
        return answer;
      }
      entries.push(...answer.entries);
      const line = conversation.next
        ? events.get(conversation.next)
        : undefined;
      if (line) {
        entries.push(limitEntry(row, line));
      }
    }
    return entries;
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
    // The hub's own lines at the account's limit, each where it happened;
    // the one between two of its conversations stands between them already
    // ({@link priorEntries}).
    const between = new Set(
      (db.ownedInstance(row.id)?.conversations ?? []).map(
        (conversation) => conversation.next
      )
    );
    for (const event of db.atLimit.events([row.id])) {
      if (between.has(event.id)) {
        continue;
      }
      const at = transcript.findIndex(
        (entry) =>
          entry.timestamp !== undefined &&
          Date.parse(entry.timestamp) > event.at
      );
      transcript.splice(
        at < 0 ? transcript.length : at,
        0,
        limitEntry(row, event)
      );
    }
    const held = heldSessions.get(row.id);
    if (
      held &&
      registry.agent(row.machineId) &&
      (row.status === "sleeping" || row.status === "error")
    ) {
      transcript.push({
        type: "system",
        uuid: `custody-held-${row.id}`,
        session_id: row.sessionId ?? "",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: custodyLine(row, held.reason),
      });
    }
    placeFreshStart(row, transcript);
    placeMovedHere(row, transcript);
  };

  /** Where the session's project was moved to its machine for it: the transcript's first row. */
  const placeMovedHere = (
    row: InstanceRow,
    transcript: SessionMessage[]
  ): void => {
    const line = db.movedHereOf(row.id);
    if (!line) {
      return;
    }
    transcript.unshift({
      type: "system",
      uuid: `moved-here-${row.id}`,
      session_id: row.sessionId ?? "",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: movedHereLine(row, line),
      timestamp: new Date(line.at).toISOString(),
    });
  };

  /** Where a session started again fresh ({@link noteFreshStart}), at that moment. */
  const placeFreshStart = (
    row: InstanceRow,
    transcript: SessionMessage[]
  ): void => {
    const fresh = db.freshStartOf(row.id);
    if (fresh === null) {
      return;
    }
    const at = transcript.findIndex(
      (entry) =>
        entry.timestamp !== undefined && Date.parse(entry.timestamp) > fresh
    );
    transcript.splice(at < 0 ? transcript.length : at, 0, {
      type: "system",
      uuid: `fresh-start-${row.id}`,
      session_id: row.sessionId ?? "",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: freshStartLine(row, fresh),
      timestamp: new Date(fresh).toISOString(),
    });
  };

  /** Every session's blocks, built here once, whether or not anyone watches. */
  const transcripts = createTranscripts({
    lifetime,
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
  // What each ask says on every surface, read as it parks (ask-presentation.ts).
  pending.presentWith(createAskPresenter(db, delegateTypes));
  // A project's own types (`delegates/*.md` in its folder) shadow the fleet's.
  const projectTypes = makeProjectDelegateTypes(delegateTypes);
  /**
   * What the delegate type on a row adds to a session brought back (a wake,
   * a restore): the same denials and "CawCo's to-dos" its first spawn had,
   * read from the type as it stands now.
   */
  function typeSettingsOf(
    row: Pick<InstanceRow, "delegateType" | "delegateTypeProject">
  ): Pick<SpawnPayload, "cawcoTodos" | "delegateType" | "denyTools"> {
    if (!row.delegateType) {
      return {};
    }
    const type = projectTypes.resolveTypeFor(
      row.delegateTypeProject,
      row.delegateType
    );
    return {
      delegateType: {
        name: row.delegateType,
        ...(row.delegateTypeProject
          ? { projectId: row.delegateTypeProject }
          : {}),
      },
      ...(type?.denyTools?.length ? { denyTools: type.denyTools } : {}),
      ...(type?.cawcoTodos ? { cawcoTodos: true } : {}),
    };
  }
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

  /**
   * A project's remote, read from one of its checkouts. Nothing read (the
   * machine away, no `origin`) leaves it unknown for the next chance. A
   * remote another project already has makes the two one project
   * (project-merge.ts).
   */
  const learnRemote = async (
    projectId: string,
    machineId: string,
    path: string
  ): Promise<void> => {
    const remote = await readRemote(runOnMachine, machineId, path);
    if (remote) {
      db.setProjectRemote(projectId, remote);
      await mergeSameRemote(merging, remote);
    }
  };

  /** The machines connected now, in the order the hub keeps them. */
  const onlineMachines = (): string[] =>
    db
      .listAgents()
      .map((agent) => agent.machineId)
      .filter((machineId) => registry.agent(machineId));

  /**
   * Where a project's Caw starts before any checkout of it is online (D2):
   * its folder on the hub, on the hub's machine, when that machine runs an
   * agent; else `~/.cawco/caw/<projectId>`, made on the first machine that is
   * online. Undefined while no machine is.
   */
  const leadHome = async (
    projectId: string
  ): Promise<{ machineId: string; cwd: string } | undefined> => {
    const machines = onlineMachines();
    const own = await ownMachineId;
    const hubMachine = machines.find((id) => id === own);
    if (hubMachine) {
      // Made and committed on first use, as every read of it does.
      await listFolder(projectId);
      return { machineId: hubMachine, cwd: projectRoot(projectId) };
    }
    const [machineId] = machines;
    if (!machineId) {
      return undefined;
    }
    // The machine's home, so the session's row names a real path; the spawn
    // makes the folder (the agent's `#workdir`).
    const home = await runOnMachine(
      machineId,
      "/",
      'printf %s "$HOME"',
      15_000
    );
    const path = home.stdout.trim();
    if (home.exitCode !== 0 || !path.startsWith("/")) {
      throw new Error(
        `${machineId} did not say where its home folder is, so Caw has no folder there: ${home.stderr.trim() || `exit ${home.exitCode}`}`
      );
    }
    return { machineId, cwd: posix.join(path, ".cawco", "caw", projectId) };
  };

  /**
   * One repository is one project: a folder whose remote a project already
   * has joins it as a checkout place (`placeAdded`), and the answer is that
   * project, not a second one. Else a new project, its places its folder on
   * the hub and the checkout it was made from, its primary. With no checkout
   * (New project: its place is picked once it is set up) its one place is
   * its folder on the hub. A new project's `template` is written as its
   * stages.md; made with Caw and given `setup`, it opens its Setup thread and
   * Caw is woken to set it up (caw.ts `setup`). The dashboard's "New
   * project" and "Create project" and an accepted project offer all come here.
   */
  const createOrJoinProject = async (asked: {
    name: string;
    checkout?: { machineId: string; cwd: string };
    /** Made with Caw: a new project's Caw starts on. */
    caw?: boolean;
    template?: StagesTemplate;
    /** What the Setup thread opens with: your prompt, or a note of where the project came from. */
    setup?: {
      note?: { body?: string; title: string };
      prompt?: string;
      promptId?: string;
    };
  }): Promise<{
    project: ProjectRow;
    place: PlaceRow;
    placeAdded: boolean;
    joined: boolean;
    setupThread?: ThreadSummary;
  }> => {
    const checkout = asked.checkout && {
      machineId: asked.checkout.machineId,
      path: placePath(asked.checkout.cwd),
    };
    const remote = checkout
      ? await readRemote(runOnMachine, checkout.machineId, checkout.path)
      : null;
    const known = remote ? db.projectByRemote(remote) : undefined;
    if (known && checkout) {
      const { place, added } = db.addPlace({
        projectId: known.id,
        ...checkout,
        kind: "checkout",
      });
      if (added) {
        placesChanged(checkout.machineId, known.id);
      }
      return {
        project: db.project(known.id) ?? known,
        place,
        placeAdded: added,
        joined: true,
      };
    }
    const created = db.createProject({
      id: crypto.randomUUID(),
      name: asked.name,
      ...(checkout ? { checkout } : {}),
      remote,
      caw: asked.caw ?? false,
    });
    projectsChanged();
    // The place it was made from: its checkout, else its folder on the hub.
    const place =
      checkoutOf(created) ??
      created.places.find((each) => each.kind === "hub") ??
      created.places[0];
    const setupThread = await startProject(created, asked);
    return {
      project: created,
      place,
      placeAdded: false,
      joined: false,
      ...(setupThread ? { setupThread } : {}),
    };
  };

  /** A new project's template as its stages.md, and its Setup thread when it is made with Caw. */
  const startProject = async (
    created: ProjectRow,
    asked: Parameters<typeof createOrJoinProject>[0]
  ): Promise<ThreadSummary | undefined> => {
    if (asked.template) {
      await writeFolderFile(
        created.id,
        "stages.md",
        templateText(asked.template),
        { message: `stages: the ${asked.template} template` }
      );
      tasks.touched(created.id);
    }
    return created.caw && asked.setup
      ? caw.setup(created.id, {
          ...asked.setup,
          template: asked.template ?? null,
        })
      : undefined;
  };

  /**
   * A project as the API answers it: its places, and its primary checkout's
   * id (`primaryPlaceId`, null while it has none).
   */
  const projectOut = (project: ProjectRow) => ({
    ...project,
    primaryPlaceId: checkoutOf(project)?.id ?? null,
  });

  // Each project's spend cap: what holds its attempts and its Caw back (project-caps.ts).
  const caps = createCaps({
    db,
    publish: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
  });
  const workItems = createWorkItems({
    db,
    lifetime,
    // Read through the plan panel's own read, so the link sees the list the
    // session keeps on any harness. Called only once the hub is up, after
    // `plans` below is made.
    planSteps: async (instanceId) => (await plans.read(instanceId)).steps,
    pauses: (projectId) => caps.pauses(projectId),
    // A session already ended, or stopped with no process on its machine's
    // last custody reading, has nothing to confirm its stop: its stop is
    // stored and the end returns at once. A session with a process is
    // stopped and waited on, for `waitMs` at most.
    end: async (instanceId, waitMs) => {
      const row = db.ownedInstance(instanceId);
      if (!row || (row.endIntent && row.endConfirmedAt)) {
        return;
      }
      if (
        NO_PROCESS_STATUSES.has(row.status) &&
        !lifecycle.holds(row.machineId, instanceId)
      ) {
        oweStop(instanceId);
        return;
      }
      endSession(instanceId, "stop");
      await waitForEnd(instanceId, waitMs);
    },
    // An attempt at a task ended: the dispatcher moves the task. Deferred: the
    // boot sweep below ends items before the dispatcher exists.
    itemEnded: (item) =>
      queueMicrotask(() => {
        dispatcher.itemEnded(item);
        push.itemEnded(item);
        caw.itemEnded(item);
      }),
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
    // A session's project's catalog: its own types shadow the fleet's.
    types: (projectId?: string | null) => projectTypes.typesFor(projectId),
    spawn: issueSpawn,
    send: deliverSend,
    // What a pull request an attempt opens links back to and is titled by.
    sessionUrl: (instanceId) =>
      `${dashboardUrl(registry)}/session/${instanceId}`,
    taskTitle: (projectId, taskId) =>
      db.taskIndex(projectId).find((row) => row.id === taskId)?.title,
    // The plan ↔ to-do link: the task's to-dos, ticked and proposed as the hub.
    todos: {
      read: async (projectId, taskId) =>
        (await tasks.get(projectId, taskId)).todos,
      write: (projectId, taskId, changes, reason) =>
        tasks.todos(projectId, taskId, changes, hubActor(reason)),
    },
    call: async (machineId, method, args) => {
      const timeout =
        method === CONTROL_WORKSPACE_CREATE ||
        method === CONTROL_WORKSPACE_ARCHIVE ||
        method === CONTROL_WORKSPACE_BUNDLE ||
        method === CONTROL_WORKSPACE_AT
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
    lifetime,
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
      // A send waits wherever its session cannot take it yet ({@link deliverSend}).
      if (envelope.verb === "send") {
        deliverSend(envelope as Envelope<SendPayload>);
        return;
      }
      const agent = registry.agent(envelope.machineId);
      if (!agent) {
        throw new Error(`Machine ${envelope.machineId} is not connected.`);
      }
      sendFrame(agent, envelope);
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
            lifetime.after(100, observe);
          }
        };
        observe();
      }),
    command: runOnMachine,
    park: parkForPerson,
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
        // Spawned only for a run the owner launched or re-ran from the
        // dashboard (a session's launch supervises it itself; a child run
        // has its parent's supervisor or none): caused by no session.
        unwatchedMode(undefined)
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
    detach(workflowRuntime.resume(), "workflow resume");
    // Moves go on from their records: an approval is asked again, every
    // other step waits for its machine's register.
    moves.resume();
  }
  // A project's tasks: files in its hub folder, indexed here (tasks.ts).
  // One repository is one project: duplicates fold into the oldest
  // (project-merge.ts), at start and when a project learns its remote.
  const merging: MergeDeps = {
    db,
    tasks: {
      adopt: (...args) => tasks.adopt(...args),
      stages: (projectId) => tasks.stages(projectId),
    },
    placesChanged,
    projectsChanged,
  };
  const tasks = createTasks({
    project: (id) => db.project(id),
    projectIds: () => db.listProjects().map((project) => project.id),
    index: db.taskIndex,
    put: db.putTaskIndex,
    drop: db.dropTaskIndex,
    setTracker: db.setProjectTracker,
    attempts: db.projectAttempts,
    startProblem: (projectId, task) => dispatcher.problemOf(projectId, task),
    queuedStarts: (projectId) =>
      db.queuedTaskStarts(projectId).map((row) => row.taskId),
  });
  // Attempts at tasks: started by a session, a stage's `runs:` hook, or the
  // dispatcher itself for a project that dispatches (dispatch.ts).
  // A project's views: drafts Caw writes, kept when you approve (views.ts).
  const views = createViews({
    projectName: (id) => db.project(id)?.name,
    tasks,
  });
  // Each project's Caw: its lead session, woken by events only (caw.ts).
  const caw = createCaw({
    asks: () => pending.list(),
    caps,
    db,
    online: (machineId) =>
      machineId === undefined
        ? onlineMachines().length > 0
        : Boolean(registry.agent(machineId)),
    leadHome,
    pages: {
      show: async (session, page) => {
        const published = await publishDecisionPage(session, page);
        if ("refused" in published) {
          throw new Error(published.refused);
        }
        const started = await openPreview(
          session.id,
          session.machineId,
          published
        );
        if (!started.ok) {
          throw new Error(started.error);
        }
      },
      choices: (session, page) => {
        const canvas = session.projectId
          ? db.canvas(canvasId("", { project: session.projectId, page }))
          : undefined;
        if (!canvas) {
          throw new Error(
            `Nobody has picked anything on decisions/${page} yet.`
          );
        }
        // As read_choices answers a session: each entry with its id, and
        // whether it was picked on an earlier revision of the page.
        const state = canvasChoices(db, canvas);
        return {
          ...state,
          choices: Object.entries(state.choices).map(([id, entry]) => ({
            id,
            ...entry,
            ...(state.pageHash && entry.pageHash !== state.pageHash
              ? { earlierRevision: true }
              : {}),
          })),
        };
      },
    },
    folderChanged: (projectId) => tasks.touched(projectId),
    fleetChoicesSet: () => Boolean(db.getSupervisorConfig()?.choicesSetAt),
    // Thread rows and messages reach every dashboard on the ledger, as sessions do.
    publish: (payload) =>
      registry.broadcast({ verb: "frames", machineId: "hub", payload }),
    spawn: (machineId, payload) => spawnSession(machineId, payload),
    send: (envelope) => {
      deliverSend(envelope);
    },
    end: (instanceId) => endSession(instanceId, "stop"),
    task: (projectId, id) => tasks.get(projectId, id),
    views,
  });
  lead = caw;
  const dispatcher = createDispatcher({
    db,
    lifetime,
    tasks,
    lead: (projectId) => caw.lead(projectId),
    online: (machineId) => Boolean(registry.agent(machineId)),
    pauses: (projectId) => caps.pauses(projectId),
    start: (request) => workItems.start(request),
  });
  tasks.listen(dispatcher.taskChanged);
  tasks.listen(push.taskChanged);
  tasks.listen(caw.taskChanged);
  // Every dashboard showing the project reads its tasks again, whoever moved them.
  tasks.listen((event) =>
    registry.broadcast({
      verb: "frames",
      machineId: "hub",
      payload: { kind: "tasks.changed", projectId: event.projectId },
    })
  );
  // "Make this a project": offered once to a plain session that outgrew
  // itself, at a turn's end or a delegate's spawn (project-offers.ts).
  const projectOffers = createProjectOffers({
    db,
    tasks,
    // The plan as its panel reads it, on any harness. Called only once the
    // hub is up, after `plans` below is made.
    planSteps: async (instanceId) => (await plans.read(instanceId)).steps,
    run: runOnMachine,
    online: (machineId) => Boolean(registry.agent(machineId)),
    createProject: createOrJoinProject,
    setup: (projectId, note) => caw.setup(projectId, { note, template: null }),
    moved: (machineIds) => {
      for (const machineId of machineIds) {
        publishInstances(machineId);
      }
    },
    publish: (row, offer) =>
      registry.broadcast({
        verb: "frames",
        machineId: row.machineId,
        instanceId: row.id,
        payload: {
          kind: "project_offer",
          instanceId: row.id,
          offer,
        } satisfies FramePayload,
      }),
  });
  delegateSpawned.add(projectOffers.delegateSpawned);
  // Every session's plan (§5.2): its steps, its spec, an attempt's to-dos,
  // live to the session's followers (plans.ts).
  const plans = createPlans({
    db,
    lifetime,
    tasks,
    online: (machineId) => Boolean(registry.agent(machineId)),
    control: planControl,
    typeTodos: (projectId, type) =>
      projectTypes.resolveTypeFor(projectId, type)?.cawcoTodos === true,
    publish: (instanceId, message) =>
      streams.planToFollowers(instanceId, message),
  });
  tasks.listen(plans.taskChanged);
  /**
   * What `handoff`'s cold check reads of a session (`/api/followup-state`):
   * its recorded turns, whether one is under way, and when the last ended.
   */
  const followupState = (row: KeepAliveRow) => {
    const turns = db.recordedTurns(row.id);
    const activityBound =
      turns.unbounded ||
      (row.harness === "claude" && !!row.sessionId && !turns.hasTurns);
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
      midTurn: !!pulses.get(row.id)?.busy,
      hasTurns: turns.hasTurns,
      recordedTurnAt: turns.lastTurnAt,
      lastTurnAt,
      activityBound,
    };
  };
  // `delegate_list`: a session's own delegation tree (§5.2).
  const delegationTree = createDelegationTree({
    db,
    machineName: (machineId) =>
      machineLabel(
        db.listAgents().find((agent) => agent.machineId === machineId)
          ?.hostname ?? machineId
      ),
    activity: (row) => {
      const state = followupState(row);
      // The same test the cold check makes: warm mid-turn, unmeasured, or unexpired.
      const expires = promptCacheExpiresAt(row, state.lastTurnAt);
      return {
        cacheWarm: state.midTurn || expires === null || expires > Date.now(),
        lastActivityAt: new Date(
          Math.max(
            row.updatedAt.getTime(),
            row.lastRequestAt?.getTime() ?? 0,
            Date.parse(state.recordedTurnAt ?? "") || 0
          )
        ),
      };
    },
    plan: async (instanceId) => {
      const { steps } = await plans.read(instanceId);
      return {
        done: steps.filter((step) => step.status === "completed").length,
        total: steps.length,
      };
    },
  });
  if (resumeWorkflows) {
    // The dispatcher's safety net: a slow look at every dispatching project.
    dispatcher.watch();
    // Off the boot path: projects that share a repository are folded into
    // its oldest (project-merge.ts), then a folder edited while the hub was
    // down is re-read once.
    detach(
      mergeSameRemote(merging).then(() => tasks.syncAll()),
      "project merge and task catch-up"
    );
  }
  const delegationMcp = createDelegationMcp({
    lifetime,
    tasks,
    workItemTask: (id) => db.workItem(id)?.taskId,
    workItemLands: (id) => db.workItem(id)?.lands,
    startAttempt: (projectId, ref, parent) =>
      dispatcher.startAttempt(projectId, ref, parent),
    retryAttempt: (projectId, ref, parent) =>
      dispatcher.retryAttempt(projectId, ref, parent),
    projectFromSession: (actor) =>
      projectOffers.accept(actor.id, sessionActor(actor)),
    writePlan: (actor, written) => plans.write(actor, written),
    delegationTree: (actor, include) => delegationTree.read(actor, include),
    cawTools: (actor) => caw.tools(actor),
    askPerson: (actor, name, input) => adminAsks.ask(actor, name, input),
    sendToUser: telegram
      ? (actor, message, attachments) =>
          telegram.deliver(actor.machineId, actor.id, message, attachments)
      : undefined,
    instancesByIds: (ids) => db.listedInstancesByIds(ids),
    runningOf: (harness) => db.runningInstancesOf(harness),
    instanceById: (id) => db.getInstancesByIds([id])[0],
    // What `GET /api/instances` and `GET /api/agents` answer, without the
    // hub calling itself over HTTP for them.
    fleet: {
      instances: () => boardRows(),
      machines: () => withPresence(db.listAgents()),
    },
    formerIds: db.formerIds,
    ledBy: (id, leadId) => workItems.ledBy(id, leadId),
    credentialActor: (authorization) => {
      const identity = identities.resolve(authorization);
      return identity
        ? db.getInstancesByIds([identity.instanceId])[0]
        : undefined;
    },
    knownCredential: (token) =>
      identities.resolve(`Bearer ${token}`) !== undefined,
    toolListing: db.toolListing,
    putToolListing: db.putToolListing,
    refreshTools: (row) => {
      const agent = registry.agent(row.machineId);
      if (!agent) {
        return;
      }
      const requestId = crypto.randomUUID();
      // The host's refresh is the session's; the hub only logs how it went.
      detach(
        awaitReply(row.machineId, requestId, 60_000, () =>
          sendFrame(agent, {
            verb: "control",
            machineId: row.machineId,
            instanceId: row.id,
            requestId,
            payload: {
              instanceId: row.id,
              requestId,
              method: CONTROL_REFRESH_CAWCO_TOOLS,
              args: [],
            },
          } satisfies Envelope<ControlPayload>)
        ).then((reply) => {
          if (reply === "timeout" || !reply.ok) {
            console.warn(
              `[delegation-mcp] ${row.id} (pi) did not refresh its tools: ${reply === "timeout" ? "no answer" : (reply.error ?? "refused")}`
            );
          }
        }),
        "pi tool refresh"
      );
    },
    deliver: (envelope, actor) => {
      const [requester] = db.getInstancesByIds([actor.id]);
      if (!requester) {
        throw new WorkItemRefusal(400, "Unknown calling CawCo instanceId");
      }
      return Promise.resolve(sessionSend(envelope, requester));
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
        if (!resolveCanDelegate(requester)) {
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
        sessionSend(envelope as Envelope<SendPayload>, requester);
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
      // A delegate named by a former id is acted on by its id now.
      const row = instanceId
        ? db.getInstancesByIds([db.instanceIdOf(instanceId)])[0]
        : undefined;
      // Its parent, or its project's lead: a co-parent of every work item of
      // the project, which may answer, steer and stop it.
      if (
        !(
          row &&
          (row.parentInstanceId === requester.id ||
            workItems.ledBy(row.id, requester.id))
        )
      ) {
        throw new WorkItemRefusal(
          403,
          "you can only control your own delegates, or the work items of a project you lead"
        );
      }
      if (envelope.verb === "stop") {
        endSession(row.id, "stop");
        closePreview(row.id).catch(console.error);
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
        if (adminAsks.has(answer.requestId)) {
          throw new WorkItemRefusal(
            403,
            "That ask is a fleet-settings change waiting on the person; only they answer it."
          );
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
      sendFrame(agent, {
        ...envelope,
        instanceId: row.id,
        machineId: row.machineId,
        payload: { ...control, instanceId: row.id, from: requester.id },
      });
      if (control.method === CONTROL_INTERRUPT) {
        noteInterrupt(row.id);
      }
    },
  });
  ({ toolsMayHaveChanged } = delegationMcp);

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
      if (!row) {
        throw new Error("No such session");
      }
      if (healthySessionIdentity(instanceId)) {
        return { instanceId, installed: true, changedServers: [] };
      }
      const agent = registry.agent(row.machineId);
      if (!agent) {
        throw new Error("Machine is not connected");
      }
      // A mint now would cut off the credential its launch carries.
      const inFlight = inFlightRefusal(instanceId);
      if (inFlight) {
        throw new Error(inFlight);
      }
      await ensureIdentityWorkspace(row);
      const credential = identities.mint(instanceId);
      const requestId = crypto.randomUUID();
      const reply = await awaitReply(row.machineId, requestId, 120_000, () =>
        sendFrame(agent, {
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

  /**
   * Whether a session is between turns, on its machine's own word: no turn
   * running, nothing sent to it still pending, no ask of its parked. The one
   * moment the hub puts anything into a session unasked: a keep-alive ping, or
   * a move to another account at its limit.
   */
  const sessionIdle = async (row: {
    id: string;
    machineId: string;
  }): Promise<boolean> => {
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
      // What is owed at the hub never reached the process.
      db.sendsIn(row.id, ["pending"]).every((send) => send.owed) &&
      !pending.list().some((ask) => ask.instanceId === row.id)
    );
  };

  /** Sessions a boundary relaunch was sent for, so a second word on it before the spawn lands sends no second one. */
  const relaunching = new Set<string>();
  const RELAUNCH_SETTLE_MS = 60_000;

  /**
   * A session whose CLI runs a boundary hook that fails open, as its machine
   * says at the attach and at each of its turns' ends ({@link BOUNDARY_RELAUNCH}):
   * relaunched on its conversation, account and config dir — the at-limit
   * move's path — so it comes back with the workspace's hook that refuses
   * instead. Only between turns: one mid-turn, or with a send or an ask
   * outstanding, is left to its next turn's end, which says so again. A send
   * that follows the spawn waits behind it on the machine and reaches the new
   * process.
   */
  const relaunchOntoHook = async (
    machineId: string,
    instanceId: string
  ): Promise<void> => {
    if (relaunching.has(instanceId)) {
      return;
    }
    const [row] = db.getInstancesByIds([instanceId]);
    const agent = registry.agent(machineId);
    // One put to sleep at that boundary has no process left to replace: its
    // next wake launches it onto the hook that refuses.
    if (
      !(row?.sessionId && agent && row.machineId === machineId) ||
      row.status === "sleeping"
    ) {
      return;
    }
    if (!(await sessionIdle(row))) {
      console.info(
        `[hub] boundary: ${instanceId} is mid-turn; it is relaunched onto the fail-closed hook at its next turn's end`
      );
      return;
    }
    const { sessionId } = row;
    relaunching.add(instanceId);
    lifetime.after(RELAUNCH_SETTLE_MS, () => relaunching.delete(instanceId));
    transcripts.noteRelaunch(instanceId);
    resumeSpawn(agent, machineId, { ...row, sessionId }, true);
    console.info(
      `[hub] boundary: relaunching ${instanceId} onto the fail-closed hook`
    );
  };

  /** A claimed turn's tokens, on the account the session runs on. */
  const recordTurnUsage = (
    session: Parameters<typeof turnUsageOf>[0],
    result: NeutralResultMessage,
    keepAlive: boolean
  ) => {
    if (!result.uuid) {
      return;
    }
    const turn = turnUsageOf(
      session,
      { ...result, uuid: result.uuid },
      keepAlive,
      result.timestamp ? Date.parse(result.timestamp) : Date.now()
    );
    db.turnUsage.put(session.id, turn.rows, turn.seen);
  };
  const pruneTurnUsage = () => {
    const gone = db.turnUsage.prune();
    if (gone > 0) {
      console.info(`[usage] pruned ${gone} turns past retention`);
    }
  };
  pruneTurnUsage();
  lifetime.every(86_400_000, pruneTurnUsage);

  const keepAliveScheduler = createKeepAliveScheduler({
    lifetime,
    rows: db.keepAliveInstances,
    row: (id) => db.listedInstancesByIds([id])[0],
    limits: () => sessionLimitsReader(db),
    idle: sessionIdle,
    send: deliverSend,
    changed: () => publishInstances(""),
  });

  /** What a session at its account's limit is told when it may go on, in its own process. */
  const CARRY_ON =
    "The usage limit that stopped your last turn no longer applies. Carry on from where you stopped.";

  /** Has a session carry on where its account's limit stopped it. */
  const carryOn = (row: { id: string; machineId: string }): void => {
    deliverSend({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: crypto.randomUUID(),
          message: { role: "user", content: CARRY_ON },
          parent_tool_use_id: null,
          origin: { kind: "system", name: LIMIT_ORIGIN },
        },
      },
    } satisfies Envelope<SendPayload>);
  };

  /**
   * The send that hands a cut turn back, by a uuid its turn decides: one
   * made again for the same turn (a second register, a hub that died after
   * making it) is the same send, which {@link deliverSend} hands over once.
   */
  const handTurnBack = (
    row: { id: string; machineId: string },
    turn: string,
    content: string
  ): SentMessageRow =>
    deliverSend({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: uuidOf(`${row.id}\u0000${turn}`),
          message: { role: "user", content },
          parent_tool_use_id: null,
          origin: { kind: "system", name: "restore" },
        },
      },
    } satisfies Envelope<SendPayload>);

  /**
   * The turn of `row` a restart or a kill cut and nothing has taken up
   * since, by when it was first heard ({@link instances.turnOpenAt});
   * nothing when there is none, or when something else answers for the
   * session's next turn. How it was cut (`how`):
   * - `restored`: its process was restored after a restart. The turn ran in
   *   the launch before (older than `spawnedAt`), and the hub recorded it
   *   ({@link TURN_UNRECORDED}: a restore of a session from before it did
   *   hands nothing back). The process is up (`running` or `starting`), and
   *   a send still pending, owed or handed is its turn instead (a keep-alive
   *   ping is no turn of its own).
   * - `serverStopped`: its harness said the server its turn ran in stopped
   *   before finishing it ({@link SERVER_STOPPED_MID_TURN}), on a session it
   *   reattached to the server running now; cut whenever it was heard, the
   *   process up, a pending send its turn instead.
   * - `killed`: a signal killed its process just now ({@link diedOnSignal}),
   *   which filed it asleep: the turn it had open, recorded, goes first,
   *   ahead of what the dead process never read.
   * And whichever way, what rules it out:
   * - the session is being ended, or is a summariser or a workflow step
   *   (a continuation and the workflow runtime run those);
   * - the at-limit controller has it, or a continuation of it is under way,
   *   or it moves account at its turn's end: those send their own word;
   * - an ask of it is parked: its process is waiting on that ask.
   */
  const cutTurnOf = (
    row: PublicInstanceRow,
    how: "restored" | "serverStopped" | "killed"
  ): number | undefined => {
    const owned = db.ownedInstance(row.id, row.machineId);
    const open = owned?.turnOpenAt ?? null;
    const launched = row.spawnedAt?.getTime();
    const cut =
      how === "serverStopped" ||
      (open !== TURN_UNRECORDED &&
        (how === "killed" ||
          (launched !== undefined && (open ?? 0) < launched)));
    const processUp = row.status === "running" || row.status === "starting";
    // A question its process took with it is asked again whatever else waits.
    if (
      open === null ||
      !cut ||
      (how === "killed" ? row.status !== "sleeping" : !processUp) ||
      (how !== "killed" &&
        awaitsSend(row.id) &&
        !withdrawnQuestions.has(row.id))
    ) {
      return undefined;
    }
    const ruledOut =
      !!owned?.endIntent ||
      row.kind === "summariser" ||
      row.workflowStepId !== null ||
      atLimit.handling(row.id) ||
      relaunchAtTurnEnd.has(row.id) ||
      db
        .continuationRows()
        .some(
          (job) => job.sourceInstanceId === row.id && !SETTLED.has(job.stage)
        ) ||
      pending.list().some((ask) => ask.instanceId === row.id);
    return ruledOut ? undefined : open;
  };

  /**
   * Questions a session had put to the person when its process went, by
   * session: the asks went with the process ("Question withdrawn"), nobody
   * answered them, and the turn handed back asks them again
   * ({@link askAgain}).
   */
  const withdrawnQuestions = new Map<string, string[]>();

  /** Keeps the questions `asks` put to the person, which go with their process unanswered. */
  const noteWithdrawn = (asks: readonly Envelope[]): void => {
    for (const ask of asks) {
      if (
        !ask.instanceId ||
        peek(ask.payload, "toolName") !== ASK_USER_QUESTION
      ) {
        continue;
      }
      const { input } = ask.payload as { input?: { questions?: unknown } };
      const asked: { question?: unknown }[] = Array.isArray(input?.questions)
        ? input.questions
        : [];
      const questions = asked.flatMap((one) =>
        typeof one.question === "string" ? [one.question] : []
      );
      if (questions.length > 0) {
        withdrawnQuestions.set(ask.instanceId, [
          ...(withdrawnQuestions.get(ask.instanceId) ?? []),
          ...questions,
        ]);
      }
    }
  };

  noteWithdrawn(droppedAtStart);

  /** A cut turn's hand-back, with the questions its process took with it to be asked again. */
  const askAgain = (instanceId: string, words: string): string => {
    const questions = withdrawnQuestions.get(instanceId);
    withdrawnQuestions.delete(instanceId);
    return questions?.length
      ? `${words} The question${questions.length === 1 ? "" : "s"} you had asked the person (${questions.map((one) => `"${one}"`).join(", ")}) went with that process and ${questions.length === 1 ? "was" : "were"} never answered: ask again.`
      : words;
  };

  /**
   * A session up again whose question went with its last process, with no
   * cut turn handed back to say so (what it was sent took that turn's
   * place): told now, behind what it was owed, to ask it again. Once per
   * process: the same start says it once however often it is looked at.
   */
  const askWithdrawnAgain = (
    row: PublicInstanceRow | undefined,
    restartedAt: Date | null | undefined
  ): void => {
    if (
      !(row && restartedAt && withdrawnQuestions.has(row.id)) ||
      db.ownedInstance(row.id, row.machineId)?.endIntent ||
      !(row.status === "running" || row.status === "starting")
    ) {
      return;
    }
    deliverSend({
      verb: "send",
      machineId: row.machineId,
      instanceId: row.id,
      payload: {
        instanceId: row.id,
        message: {
          type: "user",
          uuid: uuidOf(`${row.id}\u0000asked\u0000${restartedAt.getTime()}`),
          message: {
            role: "user",
            content: askAgain(
              row.id,
              `CawCo restarted this session's process at ${utcClock(restartedAt)}.`
            ),
          },
          parent_tool_use_id: null,
          origin: { kind: "system", name: "restore" },
        },
      },
    } satisfies Envelope<SendPayload>);
  };

  /** Whether a send to the session is still pending, owed or handed, other than a keep-alive ping: that send is its next turn. */
  const awaitsSend = (instanceId: string): boolean =>
    db.sendsIn(instanceId, ["pending"]).some((send) => !isKeepAlive(send.body));

  /**
   * Hands a session restored after a restart the turn that restart cut, once
   * its process is up: one message, through the send path every message
   * takes, so it waits at the hub when the session cannot take it yet. The
   * hand-back is the session's open turn from then on: a restart before it is
   * read cuts it in its turn, and a register or a hub that sees the same cut
   * turn again sends nothing ({@link handTurnBack}).
   *
   * `serverStopped`: when its harness said the server its turn ran in had
   * stopped ({@link cutTurnOf}). A turn so cut that is not handed back ends
   * there, as the turn that result closes.
   */
  const resumeCutTurn = (instanceId: string, serverStopped?: Date): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    const cut = row
      ? cutTurnOf(row, serverStopped ? "serverStopped" : "restored")
      : undefined;
    const restartedAt = serverStopped ?? row?.spawnedAt;
    if (!(row && cut !== undefined && restartedAt)) {
      if (serverStopped) {
        turnOver(instanceId);
      }
      askWithdrawnAgain(row, restartedAt);
      return;
    }
    const sent = handTurnBack(
      row,
      String(cut),
      askAgain(row.id, restartedWords(restartedAt))
    );
    if (sent.state === "failed") {
      turnOver(row.id);
      console.warn(
        `[hub] ${row.id}: the turn a restart cut was not handed back: ${sent.reason ?? "the send failed"}`
      );
      return;
    }
    if (db.handBackTurn(row.id, cut, Date.now())) {
      console.log(
        `[hub] ${row.id}: handed back the turn a restart cut (heard ${new Date(cut).toISOString()})`
      );
    }
  };

  /**
   * A session failed to start, or its process died of something the reader
   * should see: the row records it, a live work item fails and its parent
   * hears why, and what it was sent and never read waits, owed, for the
   * session's next start — or fails with it, when its conversation is gone.
   */
  const processFailed = (
    machineId: string,
    instanceId: string,
    reason: string
  ): void => {
    turnWaiters.get(instanceId)?.reject(new Error(reason));
    db.failInstance(instanceId, reason);
    // A live work item whose session never started failed, and its
    // parent hears why rather than waiting on a report forever.
    const [unstarted] = db.getInstancesByIds([instanceId]);
    const line = unstarted?.workItemId
      ? workItems.spawnFailed(unstarted, reason)
      : undefined;
    if (unstarted && line !== undefined) {
      reportToParent(unstarted, `${reason}${line}`, true);
    }
    workflowRuntime.observe(instanceId, reason);
    losePending(instanceId, reason !== CLAUDE_CONVERSATION_GONE, reason);
    escalateRoutedAsks(instanceId);
    if (!summarisers.has(instanceId)) {
      telegram?.onError(instanceId, reason);
    }
    publishInstances(machineId);
  };

  /**
   * How close a second signal death may follow a session's last one and
   * still be started again (our call): a process killed again within two
   * minutes of the last kill is dying on its own, and starting it again
   * would only spin.
   */
  const SIGNAL_REPEAT_MS = 2 * 60_000;

  /** When each session's process was last killed by a signal and started again ({@link diedOnSignal}). */
  const signalDeaths = new Map<string, number>();

  /**
   * A session's process was killed by a signal while its machine ran it,
   * nothing of the machine's own stopping it (an OOM kill, a sessiond
   * restart, a stray `kill`). That is the process dying, not the session's
   * work: the row is filed asleep and its work item keeps running; what it
   * was sent and never read is owed to its next process; and the turn the
   * kill cut is handed back once ({@link resumeCutTurn}'s path), which
   * starts that process. A session killed again within
   * {@link SIGNAL_REPEAT_MS} of its last kill fails as any dead process
   * does, and so does a summariser or a workflow step, which the
   * continuation and the workflow runtime run.
   */
  const diedOnSignal = (
    machineId: string,
    instanceId: string,
    died: { signal: string; error: string }
  ): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    const last = signalDeaths.get(instanceId);
    const now = Date.now();
    if (
      !row ||
      row.kind === "summariser" ||
      row.workflowStepId !== null ||
      (last !== undefined && now - last < SIGNAL_REPEAT_MS)
    ) {
      signalDeaths.delete(instanceId);
      if (last !== undefined) {
        console.warn(
          `[hub] ${instanceId}: killed by ${died.signal} again ${Math.round((now - last) / 1000)}s after the last kill; it fails rather than spin`
        );
      }
      processFailed(machineId, instanceId, died.error);
      return;
    }
    signalDeaths.set(instanceId, now);
    console.log(
      `[hub] ${instanceId}: its process was killed by ${died.signal}; it carries on`
    );
    sessionAsleep(machineId, instanceId);
    resumeKilledTurn(instanceId, died.signal, new Date(now));
  };

  /**
   * Hands a session whose process a signal killed the turn that kill cut,
   * once: through the send path, which starts its process, ahead of what the
   * dead one never read. Nothing when no turn was open, or something else
   * answers for its next turn ({@link cutTurnOf}).
   */
  const resumeKilledTurn = (
    instanceId: string,
    signal: string,
    killedAt: Date
  ): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    const cut = row ? cutTurnOf(row, "killed") : undefined;
    if (!(row && cut !== undefined)) {
      return;
    }
    const sent = handTurnBack(
      row,
      String(cut),
      askAgain(row.id, killedWords(signal, killedAt))
    );
    if (sent.state === "failed") {
      turnOver(row.id);
      console.warn(
        `[hub] ${row.id}: the turn a kill cut was not handed back: ${sent.reason ?? "the send failed"}`
      );
      return;
    }
    console.log(
      `[hub] ${row.id}: handed back the turn a kill cut (heard ${new Date(cut).toISOString()})`
    );
  };

  /** Machines whose work items asleep on a cut turn this hub has settled since it started. */
  const itemsSettledOn = new Set<string>();

  /**
   * Once a hub start, at each machine's first register: every running work
   * item whose session on it has no process, was not restored just now, and
   * whose last turn never ended — work a restart cut that no restore reached
   * (older than the restore's horizon, past its cap, or from before the hub
   * kept the turn it cut). Its session is woken to carry on, once, when its
   * workspace is still there and someone still hears its reports; otherwise
   * the item fails, and they hear why ({@link settleCutItem}).
   */
  const settleCutItems = async (
    machineId: string,
    restored: ReadonlySet<string>
  ): Promise<void> => {
    if (itemsSettledOn.has(machineId)) {
      return;
    }
    itemsSettledOn.add(machineId);
    for (const item of db.liveWorkItems()) {
      const [row] = db.getInstancesByIds([item.instanceId]);
      if (
        !row?.sessionId ||
        row.machineId !== machineId ||
        restored.has(row.id) ||
        row.status === "running" ||
        row.status === "starting" ||
        db.ownedInstance(row.id, row.machineId)?.endIntent ||
        item.state !== "running" ||
        item.checkingSince !== null ||
        awaitsSend(row.id)
      ) {
        continue;
      }
      // biome-ignore lint/performance/noAwaitInLoops: one transcript read off the machine at a time, and only for a session from before the hub kept its turn
      const cut = await stoppedTurnOf(row);
      if (cut) {
        settleCutItem(item, row, cut);
      }
    }
  };

  /**
   * Where a session with no process left its last turn when nothing ended
   * it: the turn the hub heard open and never heard end
   * ({@link instances.turnOpenAt}), or, for a session from before the hub
   * kept that ({@link TURN_UNRECORDED}), its harness's transcript's word
   * ({@link cutEntry}). Nothing when its turn ended, or when the transcript
   * could not be read, which is said.
   */
  const stoppedTurnOf = async (
    row: PublicInstanceRow
  ): Promise<{ key: string; at: Date } | undefined> => {
    const open = db.ownedInstance(row.id, row.machineId)?.turnOpenAt ?? null;
    if (open === null) {
      return undefined;
    }
    if (open !== TURN_UNRECORDED) {
      return { key: `open:${open}`, at: new Date(open) };
    }
    const read = await readHistory(row.id).catch(
      (error: unknown): HistoryFault => ({
        fault: "failed",
        message: error instanceof Error ? error.message : String(error),
      })
    );
    if ("fault" in read) {
      console.warn(
        `[hub] ${row.id}: whether its last turn ended could not be read: ${read.message}`
      );
      return undefined;
    }
    const cut = cutEntry(read.entries);
    // Its transcript says the turn ended: the row says so from now on, and
    // no later start reads it again.
    if (!cut) {
      db.closeTurn(row.id);
    }
    return cut;
  };

  /** One work item asleep on a cut turn: carried on when it can be, else failed ({@link settleCutItems}). */
  const settleCutItem = (
    item: WorkItemRow,
    row: PublicInstanceRow,
    cut: { key: string; at: Date }
  ): void => {
    const [workspace] = db.workspacesNamed(item.workspaceId);
    const reportees = workItems.reportees(row);
    const heard = reportees.some(
      (reportee) =>
        reportee.status === "running" ||
        reportee.status === "starting" ||
        (reportee.status === "sleeping" && reportee.sessionId !== null)
    );
    if (workspace?.state === "active" && heard) {
      const sent = handTurnBack(
        row,
        `asleep:${cut.key}`,
        unresumedWords(cut.at)
      );
      console.log(
        `[hub] ${row.id}: woke its item ${item.id} on the turn a restart cut after ${cut.at.toISOString()}: ${sent.state}${sent.reason ? ` (${sent.reason})` : ""}`
      );
      return;
    }
    const why =
      workspace?.state === "active"
        ? "nobody is left to hear its reports"
        : `its workspace ${item.workspaceId} is gone`;
    workItems.unresumed(
      row,
      `Its session's turn was cut by a restart after ${utcClock(cut.at)} and was not resumed: ${why}.`
    );
    console.log(
      `[hub] ${row.id}: failed its item ${item.id}, cut by a restart: ${why} (reportees: ${reportees.map((one) => `${one.id} ${one.status}`).join(", ") || "none"})`
    );
  };

  /**
   * A session starting again fresh under its id: its first start never
   * began, so there was no conversation to resume. Kept on its row, said in
   * its transcript now and at every later read ({@link readRowHistory}).
   */
  const noteFreshStart = (row: InstanceRow): void => {
    // One that went on from a summary starts its fresh conversation under
    // the "Continued" line already: that is no first start that never began.
    if ((db.ownedInstance(row.id)?.conversations.length ?? 0) > 0) {
      return;
    }
    const at = Date.now();
    db.noteFreshStart(row.id, at);
    console.log(
      `[hub] ${row.id} starts again fresh: its first start never began`
    );
    transcripts.ingest(row.id, {
      kind: "frame",
      instanceId: row.id,
      harness: (row.harness ?? "claude") as HarnessKind,
      message: freshStartLine(row, at),
    });
  };

  /**
   * A session started where its project was moved to for it (moves.ts): its
   * transcript opens on the move's ready line, kept on its row and said now.
   * Once: a Start retried after the line was written says nothing new.
   */
  const noteMovedHere = (
    instanceId: string,
    line: { at: number; moved: string; stayed?: string }
  ): void => {
    const [row] = db.getInstancesByIds([instanceId]);
    if (!row || db.movedHereOf(instanceId) !== null) {
      return;
    }
    db.noteMovedHere(instanceId, line);
    transcripts.ingest(instanceId, {
      kind: "frame",
      instanceId,
      harness: (row.harness ?? "claude") as HarnessKind,
      message: movedHereLine(row, line),
    });
  };

  /** Writes a line into a session's transcript: kept, and folded into what its screens show now. */
  const noteAtLimit = (
    row: { id: string; sessionId: string | null; harness: string | null },
    move: AccountMove,
    /** A line already written under this id is what it says now: a continuation's "Summarising…" turned into what came of it. */
    id: string = crypto.randomUUID()
  ): void => {
    const event = { id, at: Date.now(), move };
    db.atLimit.putEvent({ ...event, instanceId: row.id });
    transcripts.ingest(row.id, {
      kind: "frame",
      instanceId: row.id,
      harness: (row.harness ?? "claude") as HarnessKind,
      message: limitLine(row, event),
    });
    console.info(
      `[at-limit] ${row.id}: ${accountMoveWords(move, event.at).line}`
    );
  };

  /** Takes one of the hub's lines back out of a session's transcript: kept, and drawn. */
  const unnoteAtLimit = (row: { id: string }, id: string): void => {
    db.atLimit.dropEvent(id);
    transcripts.removeLine(row.id, `limit-${id}`);
  };

  /**
   * Who would carry a running session off `accountId`: placement for the
   * kind of session it is, on its machine, within its project's and task's
   * lists and its type's preference, never `accountId`, and only an account
   * with room.
   */
  const limitTarget = (
    row: ReturnType<typeof db.getInstancesByIds>[number],
    accountId: string
  ): string | null => replaceRow(row, accountId, accountId);

  /**
   * Where placement puts a session that runs on `accountId` now, for the
   * kind of session it is, on its machine, within its project's and task's
   * lists and its type's preference, its own burn in the carry test:
   * never `exclude` when one is named (then only an account with room).
   */
  const replaceRow = (
    row: ReturnType<typeof db.getInstancesByIds>[number],
    accountId: string,
    exclude?: string
  ): string | null => {
    // The provider of the account it is on: it moves only among that
    // provider's accounts signed in for its harness on its machine.
    const provider = db.accounts.get(accountId)?.provider;
    if (!provider) {
      return null;
    }
    const routing = db.accounts.routing(provider);
    const asks = rowAsks(row);
    const now = Date.now();
    const placed = placeAccount({
      accounts: db.accounts
        .list()
        .filter((account) => account.provider === provider),
      signins: db.accounts.signins(),
      readings: db.accounts.readings(),
      bench: db.accounts.bench(),
      routing,
      machineId: row.machineId,
      machineName: machineName(row.machineId),
      ...(row.model ? { model: row.model } : {}),
      ...asks,
      ...carryTestFor(provider, routing[asks.kind].strategy, (forecast) =>
        sessionBurn(forecast.turns.get(accountId) ?? [], row.id, now)
      ),
      ...(exclude ? { exclude } : {}),
      now,
    });
    return placed.ok ? placed.accountId : null;
  };

  /** What a running session asks of placement: its kind, its project's and task's lists, its type's account. */
  const rowAsks = (
    row: ReturnType<typeof db.getInstancesByIds>[number]
  ): Pick<
    PlacementInput,
    "kind" | "projectAccounts" | "taskAccounts" | "typeAccount"
  > => {
    const item = row.workItemId ? db.workItem(row.workItemId) : undefined;
    const projectId = row.projectId ?? item?.projectId ?? null;
    const typeAccount = row.delegateType
      ? projectTypes.resolveTypeFor(
          row.delegateTypeProject ?? projectId ?? undefined,
          row.delegateType
        )?.account
      : undefined;
    return {
      kind: row.parentInstanceId ? "delegates" : "yours",
      projectAccounts: projectId
        ? (db.project(projectId)?.accounts ?? null)
        : null,
      taskAccounts: taskAccounts(projectId, item?.taskId),
      ...(typeAccount ? { typeAccount } : {}),
    };
  };

  /**
   * Whether a session's prompt cache is still warm, as the cold check reads
   * it: mid-turn, never measured, or not yet expired. One the hub found
   * cold (a keep-alive that missed) is cold.
   */
  const cacheWarm = (
    row: ReturnType<typeof db.getInstancesByIds>[number]
  ): boolean => {
    if (row.cacheCold) {
      return false;
    }
    const state = followupState(row);
    const expires = promptCacheExpiresAt(row, state.lastTurnAt);
    return state.midTurn || expires === null || expires > Date.now();
  };

  /**
   * A Claude session woken for a send with its cache cold is re-placed
   * first, by its kind's strategy: its first request re-reads its whole
   * context wherever it runs, so moving it costs nothing extra (fleet
   * history, at-limit check 3: own-account cold re-writes median 1.0 of the
   * prompt, cross-organization 0.94). The move is owed to its launch
   * ({@link relaunchAtTurnEnd}), which carries its conversation into the
   * new account's dir; its line is written once that has. A fork stays with
   * its origin, a session a person moved stays where they put it, and only
   * Claude's conversations are carried this way.
   */
  const replaceAtWake = (
    row: ReturnType<typeof db.getInstancesByIds>[number]
  ): void => {
    const from = row.accountId ? db.accounts.get(row.accountId) : undefined;
    if (
      !from ||
      (row.harness ?? "claude") !== "claude" ||
      !LIMITED_PROVIDERS.includes(from.provider) ||
      row.forkedFrom !== null ||
      relaunchAtTurnEnd.has(row.id) ||
      db.atLimit.hold(row.id) ||
      cacheWarm(row) ||
      !db.accounts.routing(from.provider).atLimit.move
    ) {
      return;
    }
    const last = db.atLimit
      .events([row.id])
      .findLast((one) => one.move.kind === "moved")?.move;
    if (last?.kind === "moved" && last.asked) {
      return;
    }
    const toId = replaceRow(row, from.id);
    const to = toId ? db.accounts.get(toId) : undefined;
    if (!to || to.id === from.id) {
      return;
    }
    console.info(
      `[rebalance] ${row.id}: woken with its cache cold; re-placed from ${accountName(from)} to ${accountName(to)}`
    );
    relaunchAtTurnEnd.set(row.id, {
      to: to.id,
      move: {
        kind: "moved",
        from: namedAccount(from),
        to: namedAccount(to),
        sameOrganization: cacheCarries(from, to),
        tokens: row.contextTokens,
        window: null,
        resetsAt: null,
        because: { kind: "cold", wake: true },
      },
    });
  };

  /**
   * The summary kept for a session, when it covers its conversation as it
   * stands: the part a continuation summarises still ends at the entry the
   * summary was written up to. A session that took a turn since has moved
   * that end, and its summary is stale.
   */
  const stillCovers = (
    instanceId: string,
    kept: KeptSummary | undefined,
    prepared: PreparedContinuation
  ): KeptSummary | undefined => {
    if (!kept) {
      return undefined;
    }
    const { covers } = prepared.extracted;
    const holds = !!prepared.prompt && kept.covers === covers;
    console.info(
      `[at-limit] ${instanceId}: ${holds ? "reusing the summary kept" : "the summary kept is stale"} (it covers to ${kept.covers}; the conversation's summarised part ends at ${covers ?? "nothing"})`
    );
    return holds ? kept : undefined;
  };

  /**
   * Continues a session on `accountId` from a summary, in place: the same
   * session goes on there in a fresh conversation, its id, parent, work and
   * tab its own throughout. The summary kept for it (ahead of the limit, or
   * at a move that failed) when it covers the conversation as it stands
   * now, so an unchanged conversation is never summarised twice; else one
   * the job writes on `accountId` and keeps until `keepUntil`.
   */
  const continueOnAccount = async (
    row: ReturnType<typeof db.getInstancesByIds>[number],
    accountId: string,
    kept: KeptSummary | undefined,
    keepUntil: number
  ): Promise<void> => {
    const fromAccountId = row.accountId;
    if (!fromAccountId) {
      return;
    }
    const prepared = await prepareContinuation(row.id);
    const harness = (row.harness ?? "claude") as HarnessKind;
    const reused = stillCovers(row.id, kept, prepared);
    startContinuation(
      prepared,
      {
        summarizer: {
          harness,
          ...(row.model ? { model: row.model } : {}),
          account: accountId,
        },
        target: {
          harness,
          machineId: row.machineId,
          cwd: row.cwd,
          ...(row.model ? { model: row.model } : {}),
          ...(isEffortLevel(row.effort) ? { effort: row.effort } : {}),
          ...(row.permissionMode
            ? { permissionMode: row.permissionMode as PermissionMode }
            : {}),
          ...(row.projectId ? { projectId: row.projectId } : {}),
          account: accountId,
          inPlace: {
            fromAccountId,
            contextTokens: row.contextTokens,
            atLimit: {
              written: reused
                ? { onAccountId: reused.writtenOn, atPct: reused.percent }
                : null,
              keepUntil,
            },
          },
        },
      },
      reused?.text
    );
  };

  /**
   * A session's continuation of itself (`continue_session` naming no
   * session), in place: on its machine, in its directory, on the account it
   * runs on, where its summary is written too, in the mode it runs in unless
   * another is asked.
   */
  const inPlaceRequest = (
    id: string,
    asked: ContinueRequest
  ): ContinueRequest => {
    const [row] = db.getInstancesByIds([id]);
    const account = row?.accountId ?? undefined;
    return {
      ...asked,
      summarizer: { ...asked.summarizer, ...(account ? { account } : {}) },
      target: {
        ...asked.target,
        ...(row ? { machineId: row.machineId, cwd: row.cwd } : {}),
        ...(account ? { account } : {}),
        ...(row?.permissionMode && !asked.target.permissionMode
          ? { permissionMode: row.permissionMode as PermissionMode }
          : {}),
        inPlace: {
          fromAccountId: row?.accountId ?? null,
          contextTokens: row?.contextTokens ?? null,
        },
      },
    };
  };

  /** Why a session cannot go on itself in place as asked; nothing when it can. */
  const inPlaceRefusal = (
    id: string,
    asked: ContinueRequest
  ): string | undefined => {
    const [row] = db.getInstancesByIds([id]);
    if (!row) {
      return `no session ${id}`;
    }
    const harness = row.harness ?? "claude";
    if (harness !== asked.target.harness) {
      return `${sessionName(row)} runs on ${harness}, and goes on in place on ${harness}: ask target_harness "${harness}", or name the session to continue it in a new ${asked.target.harness} session.`;
    }
    return db
      .continuationRows()
      .some((job) => job.sourceInstanceId === id && !SETTLED.has(job.stage))
      ? `${sessionName(row)} is already going on from a summary.`
      : undefined;
  };

  /**
   * A summary of a session written on `accountId`, with the last transcript
   * entry it covers; undefined when nothing comes before its last turns.
   */
  const summariseOn = async (
    row: ReturnType<typeof db.getInstancesByIds>[number],
    accountId: string
  ): Promise<Summarised | undefined> => {
    const prepared = await prepareContinuation(row.id);
    const { covers } = prepared.extracted;
    if (!(prepared.prompt && covers)) {
      return undefined;
    }
    const text = await summariserRun(
      prepared.source,
      {
        harness: (row.harness ?? "claude") as HarnessKind,
        ...(row.model ? { model: row.model } : {}),
        account: accountId,
      },
      prepared.prompt,
      crypto.randomUUID(),
      () => false,
      unwatchedMode(row.permissionMode)
    );
    return { text, covers };
  };

  const atLimit = createAtLimit({
    db,
    lifetime,
    accountOf: (row) => row.accountId ?? undefined,
    continuing: (row) =>
      db
        .continuationRows()
        .some(
          (job) => job.sourceInstanceId === row.id && !SETTLED.has(job.stage)
        ),
    target: limitTarget,
    idle: sessionIdle,
    warm: cacheWarm,
    machineName,
    noticed: (notice) => {
      rebalanceNotices.unshift(notice);
      rebalanceNotices.splice(REBALANCE_NOTICES_KEPT);
      console.info(
        `[rebalance] ${rebalanceWords(notice).title}: ${rebalanceWords(notice).lines.join(" · ")}`
      );
      publishUsage();
    },
    move: async (row, accountId, resume) => {
      if (!(registry.agent(row.machineId) && row.sessionId)) {
        return row.sessionId
          ? awayWords(row.machineId, "offline")
          : "it has no conversation";
      }
      // Its process ends at rest and its data goes into the account's dir,
      // and only then does its row say the account; it starts again there.
      // One that did not move stays on its account, held until its reset;
      // a process the carry ended there is asleep, woken at that reset.
      transcripts.noteRelaunch(row.id);
      const { kept } = await moveRowsToAccount(
        row.machineId,
        [row],
        accountId,
        true
      );
      const why = kept.get(row.id);
      if (why) {
        return why;
      }
      const agent = registry.agent(row.machineId);
      const [now] = db.getInstancesByIds([row.id]);
      if (!(agent && now?.sessionId)) {
        return awayWords(row.machineId, "offline");
      }
      resumeSpawn(
        agent,
        row.machineId,
        { ...now, sessionId: now.sessionId },
        true
      );
      if (resume) {
        carryOn(now);
      }
    },
    resume: carryOn,
    // What its process was last handed: what it kept for later never reached
    // it. A turn the limit refused leaves the send that started it read.
    startedBy: (row) =>
      db
        .sendsIn(row.id, ["read", "pending", "failed"])
        .filter((send) => !(send.owed || isKeepAlive(send.body)))
        .at(-1)?.body?.origin,
    continueOn: continueOnAccount,
    summarise: summariseOn,
    note: noteAtLimit,
    unnote: unnoteAtLimit,
    // Whatever it decided, what a session it no longer holds was kept goes.
    changed: () => {
      publishInstances("");
      releaseLimitHeld();
    },
  });
  accountsMoved = atLimit.accountsChanged;

  workItems.resumeWaits();

  /**
   * A dashboard's start of a session by a former id (a tab or link from
   * before the hub folded its continuations into it): the session is woken
   * on its own conversation and settings when its process is gone, and the
   * dashboard told it is up under its id now. True when the start named a
   * former id.
   */
  const resumeFormer = (ws: HubSocket, message: Envelope): boolean => {
    const named = message.instanceId;
    const now = named ? db.instanceIdOf(named) : undefined;
    if (!(named && now) || now === named) {
      return false;
    }
    const [row] = db.getInstancesByIds([now]);
    const agent = row ? registry.agent(row.machineId) : undefined;
    if (!(row && agent)) {
      sendFrame(
        ws,
        failure(
          message,
          `${named} is ${now} now, whose machine is not connected.`
        )
      );
      return true;
    }
    if (wakesForSend(row)) {
      resumeSpawn(agent, row.machineId, row);
      // A person brought it back: what was kept for it goes behind the start.
      releaseOwed({ instanceId: now });
    }
    const requestId =
      message.requestId ??
      peek(message.payload, "requestId") ??
      crypto.randomUUID();
    sendFrame(ws, {
      ...message,
      instanceId: now,
      machineId: row.machineId,
      verb: "frames",
      requestId,
      payload: { kind: "control_result", requestId, ok: true },
    } satisfies Envelope<ControlResult>);
    return true;
  };

  /**
   * A dashboard's start, from its permission mode on: launch directory,
   * account, the row, and the start itself (held while its machine installs
   * an update).
   */
  const startFromDashboard = (
    ws: HubSocket,
    message: Envelope,
    asked: SpawnPayload | { refusal: string }
  ): void => {
    if ("refusal" in asked) {
      console.warn(`[hub] refused spawn: ${asked.refusal}`);
      sendFrame(ws, failure(message, asked.refusal));
      return;
    }
    const settled = settleMode(message.machineId, asked);
    if ("refusal" in settled) {
      console.warn(`[hub] refused spawn: ${settled.refusal}`);
      sendFrame(ws, failure(message, settled.refusal));
      return;
    }
    const launched = atLaunchDir(message.instanceId, settled.payload);
    if ("refusal" in launched) {
      console.warn(`[hub] refused spawn: ${launched.refusal}`);
      sendFrame(ws, failure(message, launched.refusal));
      return;
    }
    const { payload } = launched;
    const placed = message.instanceId
      ? placeSpawn(message.machineId, {
          ...payload,
          instanceId: message.instanceId,
        })
      : {};
    if ("refusal" in placed) {
      console.warn(`[hub] refused spawn: ${placed.refusal}`);
      sendFrame(ws, failure(message, placed.refusal));
      return;
    }
    if (!(registry.agent(message.machineId) && message.instanceId)) {
      sendFrame(
        ws,
        failure(message, `machine ${message.machineId} is not connected`)
      );
      return;
    }
    // A relaunch replaces the process — questions the old one had
    // open are settled by its teardown and must not replay. What no process
    // was ever handed (owed) goes to the new one, and what the old one was
    // handed and never read its machine hands back for it ({@link takeBack}).
    const [before] = db.getInstancesByIds([message.instanceId]);
    forgetPending(message.instanceId, UNREAD.restarted, false, "all");
    // A session whose harness never began a conversation comes back fresh
    // under its id (core `relaunchOf`), and its transcript says so.
    if (
      before &&
      !peekResume(message.payload) &&
      relaunchOf(before).kind === "fresh"
    ) {
      noteFreshStart(before);
    }
    noteRespawn(message.instanceId, message.requestId, message.payload);
    // Brought back by the operator: nothing of the stop is left to carry.
    db.openInstance({
      id: message.instanceId,
      addressProtocol: addressProtocolMachines.has(message.machineId),
      machineId: message.machineId,
      cwd: payload.cwd,
      sessionId: peekResume(message.payload),
      harness: peekHarness(message.payload),
      projectId: peek(message.payload, "projectId"),
      title: peek(message.payload, "title"),
      kind: peekKind(message.payload),
      permissionMode: settled.permissionMode,
      model: payload.model,
      ...peekParent(message.payload),
      ...openedAccount(payload, placed),
    });
    if (holdingStarts(message.machineId)) {
      // The row says starting; the start goes out, minted then, when the
      // machine can take it ({@link flushOwedStarts}).
      db.oweSpawn(
        message.instanceId,
        JSON.stringify({ ...message, payload }),
        Date.now()
      );
    } else {
      forward({ ...message, payload: bounded(payload) }, ws);
      // What waited for this start goes right behind it ({@link sendSpawn}).
      releaseOwed({ instanceId: message.instanceId });
    }
    // A conversation that starts here: its first turn is its name.
    if (!peekResume(message.payload)) {
      awaitingFirstTurn.add(message.instanceId);
    }
    publishInstances(message.machineId);
  };

  return (
    new Elysia()
      // Each route's body cap, met before a request is routed or its body
      // read (body-limits.ts).
      .request(async ({ request }) => await bodyLimitRefusal(request))
      // Every route's large JSON answer is written as it is sent.
      .mapResponse("global", streamLargeJson)
      .use(websocket())
      .use(dashboardErrorsRoutes())
      .use(delegateTypesRoutes(delegateTypes))
      .use(
        projectDelegateTypesRoutes(projectTypes, (id) =>
          db.listProjects().some((project) => project.id === id)
        )
      )
      .use(
        fleetChoicesRoutes({
          read: () => {
            const config = db.getSupervisorConfig();
            return {
              deniedTools: config?.deniedTools ?? null,
              cawcoTodos: config?.cawcoTodos ?? false,
              choicesSetAt: config?.choicesSetAt ?? null,
            };
          },
          write: (choices) => db.putSupervisorConfig(choices),
          synced: () => fanOutFleet(),
        })
      )
      .use(
        projectFolderRoutes(
          (id) => db.listProjects().some((project) => project.id === id),
          (id) => tasks.touched(id)
        )
      )
      .use(taskRoutes(tasks))
      .use(
        previewChoicesRoutes({
          db,
          instance: (id) => db.getInstancesByIds([id])[0],
          deliver: (instance, content) => {
            deliverSend({
              verb: "send",
              machineId: instance.machineId,
              instanceId: instance.id,
              payload: {
                instanceId: instance.id,
                message: {
                  type: "user",
                  uuid: crypto.randomUUID(),
                  message: { role: "user", content },
                  parent_tool_use_id: null,
                  origin: { kind: "human" },
                },
              },
            });
          },
        })
      )
      .use(pushRoutes(db, push))
      // The hub as a git remote and LFS server, for fleet machines and
      // sessions only (git-remote.ts).
      .use(
        gitRemoteRoutes({
          root: GIT_ROOT,
          lfsRoot: LFS_ROOT,
          projectExists: (projectId) => db.project(projectId) !== undefined,
          authenticate: (authorization) =>
            basicCaller(
              authorization,
              machineCredentials,
              (credential) =>
                identities.resolve(`Bearer ${credential}`)?.instanceId
            ),
        })
      )
      .use(faviconRoutes())
      .use(appleDiagnosticsRoutes())
      .use(projectOfferRoutes(projectOffers, YOU_ACTOR))
      .use(planRoutes(plans))
      .use(dispatchRoutes(dispatcher))
      .use(cawRoutes(caw))
      .use(caps.routes())
      .use(viewRoutes(views))
      .use(noticesSeen.routes)
      .use(
        joinRoutes({
          lifetime,
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
          query: t.Object({
            instanceId: t.Optional(t.String()),
            // pi's host listing its own session's tools: remembered, so the
            // session hears when its list changes.
            lister: t.Optional(t.Literal("pi")),
          }),
        },
        ({ query }) =>
          delegationMcp.list(query.instanceId, query.lister === "pi")
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
      // An installation's failure never comes here: it would be authenticated
      // by the credential that failed. It is the spawn's failure, on the
      // machine's socket.
      .post(
        "/api/session-identities/ack",
        { ...hidden, body: t.Object({}) },
        ({ request, status }) => {
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (!identity) {
            return status(
              401,
              "A valid delivered session credential is required for installation ACK"
            );
          }
          const acknowledged = identities.acknowledge(authorization);
          if (!acknowledged) {
            return status(
              409,
              "This credential installation is no longer pending"
            );
          }
          // The credential its launch carried is installed: that launch is up.
          if (acknowledged === "pending") {
            launchStarted(
              identity.instanceId,
              "its process installed its credential"
            );
          }
          return { ok: true };
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
          // The caller is its credential's session; the path only says which
          // one it claims to be, and must agree.
          const authorization = request.headers.get("authorization");
          const identity = identities.resolve(authorization);
          if (!identity) {
            return status(
              401,
              authorization === null
                ? "A CawCo tool call needs its session credential"
                : "Invalid session credential"
            );
          }
          if (identity.instanceId !== params.instanceId) {
            return status(
              403,
              "Session credential does not belong to the named instanceId"
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
            input.name === "finish_item" ||
            // An admin write waits on the person as long as they take.
            isAdminWrite(input.name)
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
          const [row] = db.listedInstancesByIds([params.id]);
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
          const { inPlace: itself, ...asked } = body;
          let prepared: PreparedContinuation;
          let refusal: string | undefined;
          const request: ContinueRequest = itself
            ? inPlaceRequest(params.id, asked)
            : asked;
          try {
            prepared = await prepareContinuation(params.id, body.note);
            refusal =
              (itself ? inPlaceRefusal(params.id, asked) : undefined) ??
              (await continuationRefusal(prepared, request));
          } catch (error) {
            return status(
              422,
              error instanceof Error ? error.message : String(error)
            );
          }
          if (refusal) {
            return status(409, refusal);
          }
          const row = startContinuation(prepared, request);
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
      // Moving a project to a machine without a checkout of it (moves.ts).
      // What the New session modal reads when such a machine is picked.
      .get(
        "/api/projects/:id/move-estimate",
        {
          query: t.Object({
            machine: t.String({ minLength: 1 }),
            path: t.Optional(t.String({ pattern: "^(/|~/)" })),
          }),
        },
        async ({ params, query, status }) => {
          try {
            return await moves.estimate(params.id, query.machine, query.path);
          } catch (error) {
            return error instanceof MoveRefused
              ? status(error.status, error.message)
              : status(
                  422,
                  error instanceof Error ? error.message : String(error)
                );
          }
        }
      )
      // Move & start: the hub owns the job from here; its stages reach every
      // screen on the `moves` frame. The no-move case is the ordinary spawn.
      .post(
        "/api/projects/:id/moves",
        { body: moveBody },
        async ({ params, body, status }) => {
          try {
            return await moves.start(params.id, body as MoveRequest);
          } catch (error) {
            return error instanceof MoveRefused
              ? status(error.status, error.message)
              : status(
                  422,
                  error instanceof Error ? error.message : String(error)
                );
          }
        }
      )
      // The moves the hub is carrying, for a screen that connects late.
      .get("/api/moves", () => moves.table())
      // Cancel: the step in flight stops; what is done stays, in `kept`.
      .delete("/api/moves/:id", ({ params, status }) => {
        try {
          return moves.cancel(params.id);
        } catch (error) {
          return error instanceof MoveRefused
            ? status(error.status, error.message)
            : status(
                422,
                error instanceof Error ? error.message : String(error)
              );
        }
      })
      // Retry: a failed move runs its failed step again.
      .post("/api/moves/:id/retry", ({ params, status }) => {
        try {
          return moves.retry(params.id);
        } catch (error) {
          return error instanceof MoveRefused
            ? status(error.status, error.message)
            : status(
                422,
                error instanceof Error ? error.message : String(error)
              );
        }
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
            /** A decision page in the session's project folder, `decisions/<page>/`; with `dir`, that folder's index.html is published there first. */
            page: t.Optional(t.String({ pattern: DECISION_PAGE.source })),
            /** With `port` or `dir`: the page inside it the preview opens at, e.g. `/motion/mac-readiness`. */
            path: t.Optional(t.String({ pattern: PREVIEW_START_PATH.source })),
          }),
        },
        async ({ params, body, status }) => {
          const refused = previewAskRefusal(body);
          if (refused) {
            return status(400, refused);
          }
          const [row] = db.getInstancesByIds([params.id]);
          if (!row) {
            return status(404, "Session not found.");
          }
          let source: PreviewSource;
          if (body.page === undefined) {
            source = machinePreviewSource(body);
          } else {
            const published = await publishDecisionPage(
              row,
              body.page,
              body.dir
            );
            if ("refused" in published) {
              return status(published.code, published.refused);
            }
            source = published;
          }
          const started = await openPreview(row.id, row.machineId, source);
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
      // A picture or video on a machine's disk, for the transcript's cards. No
      // caching: the file is the agent's working state and may be rewritten or
      // removed between two looks.
      .get(
        "/api/agents/:machineId/media",
        { query: t.Object({ path: t.String() }) },
        async ({ params, query, request, status }) => {
          const answer = await readMachineMedia(params.machineId, query.path);
          if (answer === "offline") {
            return status(503, `machine ${params.machineId} is not connected`);
          }
          if (answer === "timeout") {
            return status(504, `machine ${params.machineId} did not answer`);
          }
          if ("refused" in answer) {
            return status(404, answer.refused);
          }
          return rangedResponse(
            answer.bytes,
            answer.mediaType,
            request.headers.get("range")
          );
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
        // A removed machine proves nothing to the git remote any more.
        machineCredentials.forget(params.machineId);
        // The frame that carries the machine list: every dashboard drops the
        // machine and its sessions without a reload.
        publishInstances(params.machineId);
        return { sessions: gone.instanceIds.length };
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
        if (moves.holds(row.id)) {
          return status(
            409,
            "This session's project is still moving. Cancel the move in its pane instead."
          );
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
            // One per press of Install now: the machine acts on a command once.
            commandId: t.Optional(t.String()),
            // The build the person was shown; the machine applies that one only.
            version: t.Optional(t.String()),
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
          if (!row) {
            return {
              row: null,
              midTurn: false,
              hasTurns: false,
              lastTurnAt: null,
              activityBound: false,
            };
          }
          const { midTurn, hasTurns, lastTurnAt, activityBound } =
            followupState(row);
          return { row, midTurn, hasTurns, lastTurnAt, activityBound };
        }
      )
      // Moves a session to another account of its provider, whole: its
      // conversation is carried into the account's store and resumed there,
      // with no summary. Now when it is at rest, else at its turn's end
      // (`pending` until then). A fork may be moved too: it is the person's
      // choice.
      .post(
        "/api/instances/:id/account",
        { body: t.Object({ accountId: t.String() }) },
        async ({ params, body, status }) => {
          const [row] = db.getInstancesByIds([params.id]);
          if (!row) {
            return status(404, "Session not found");
          }
          const account = db.accounts.get(body.accountId);
          if (!account) {
            return status(404, `There is no account ${body.accountId}.`);
          }
          const refusal = handMoveRefusal(row, account);
          if (refusal) {
            return status(409, refusal);
          }
          if (row.accountId === account.id) {
            // Back to the account it runs on: a move asked mid-turn is off.
            if (relaunchAtTurnEnd.get(row.id)?.to !== undefined) {
              relaunchAtTurnEnd.delete(row.id);
            }
            return {
              state: "moved" as const,
              accountId: account.id,
              why: `${sessionName(row)} already runs on ${accountName(account)}.`,
            };
          }
          const moved = await moveByHand(row, account);
          return "refusal" in moved ? status(409, moved.refusal) : moved;
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
          return await reportedContextOf(row);
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
      // A file the reader attached, raw: its bytes are the body, its type the
      // Content-Type, its name `X-File-Name` (URI-encoded). Kept by the hash
      // of its bytes; a send carries the reference, and the session's machine
      // fetches it from here.
      .post(
        "/api/files",
        {
          parse: "none",
          headers: t.Object({ "x-file-name": t.String({ minLength: 1 }) }),
          detail: {
            requestBody: {
              required: true,
              content: {
                "application/octet-stream": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
        async ({ request, headers }) => {
          // Held to FILE_LIMIT_BYTES before this reads it (body-limits.ts).
          const bytes = new Uint8Array(await request.arrayBuffer());
          const hash = await storeFile(bytes);
          return {
            ref: `/api/files/${hash}`,
            size: bytes.byteLength,
            mediaType:
              request.headers.get("content-type") || "application/octet-stream",
            name: decodeURIComponent(headers["x-file-name"]),
          };
        }
      )
      // An attached file's bytes, by the hash a send's reference names.
      .get("/api/files/:hash", async ({ params, status }) => {
        const path = storedFilePath(params.hash);
        const file = path ? Bun.file(path) : undefined;
        if (!(file && (await file.exists()))) {
          return status(404, "no such file");
        }
        return new Response(file, {
          headers: {
            "Content-Type": "application/octet-stream",
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
        const tooling = db.instanceTooling(params.id);
        if (tooling === undefined) {
          return status(404, `no session ${params.id}`);
        }
        return tooling ?? { servers: [], tools: [] };
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
          // A former id is its session's (the hub's fold of older continuations).
          const page = await transcripts.page(
            db.instanceIdOf(params.id),
            limit,
            query.before
          );
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
          // The stored toggle re-arms through the scheduler's one path.
          detach(keepAliveScheduler.wake(), "keepalive wake");
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
      .get("/api/pending", () => pending.list().map(clientCopy))
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
            /**
             * One project's only: placed at each of its checkouts and
             * delegate workspaces. Null: every machine. Left out: as it was.
             */
            projectId: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
        async ({ params, body, status }) => {
          const problem =
            mcpProblem(params.name, body.config) ??
            boundProblem(body.projectId);
          if (problem) {
            return status(400, problem);
          }

          db.putMcpServer({
            name: params.name,
            config: body.config as unknown as FleetMcpConfig,
            enabled: body.enabled,
            projectId: body.projectId,
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
        const states = db.ruleStatesFor(params.id);
        const named = new Map(
          db
            .listedInstancesByIds(states.map((state) => state.instanceId))
            .map((row) => [row.id, row])
        );
        return {
          activity: states.map((state) => {
            const row = named.get(state.instanceId);
            return {
              ...state,
              where: row ? sessionLabel(row).name : "a session that is gone",
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
          const [row] = db.listedInstancesByIds([params.instanceId]);
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
          // The route answers now; the resolve and fan-out finish after it.
          detach(
            resolvePlugins([params.id]).finally(() => fanOutFleet()),
            "plugin resolve"
          );
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
            /**
             * One project's only: placed at each of its checkouts and
             * delegate workspaces. Null: every machine. Left out: as it was.
             */
            projectId: t.Optional(t.Union([t.String(), t.Null()])),
          }),
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: resolves a skill from any of its source shapes (url/npm/repo/fromMachine) in one place; splitting it would scatter the validation order this route depends on.
        async ({ params, body, status }) => {
          if (!SKILL_NAME.test(params.name)) {
            return status(400, `${params.name} is not a usable skill name`);
          }
          const unbindable = boundProblem(body.projectId);
          if (unbindable) {
            return status(400, unbindable);
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
              projectId: body.projectId,
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
            projectId: body.projectId,
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

        const skill = await reresolveSkill(stored);
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
      // What one skill used to be, newest first, without its files.
      .get(
        "/api/fleet/skills/history",
        { query: t.Object({ name: t.String() }) },
        ({ query }) => db.listFleetSkillHistory(query.name)
      )
      // Undo, through the same door as any change to the fleet's copy: what
      // restoring replaces is itself kept first (`putSkill`), so a restore of
      // the wrong version is undone the same way. The version's source comes
      // back with it — a copy taken off a machine is that machine's again.
      .post(
        "/api/fleet/skills/restore",
        { body: t.Object({ id: t.Number() }) },
        ({ body, status }) => {
          const version = db.fleetSkillVersion(body.id);
          if (!version) {
            return status(404, `no skill version ${body.id}`);
          }
          const current = db
            .listSkills()
            .find((skill) => skill.name === version.name);
          try {
            const skill = db.putSkill({
              name: version.name,
              source: version.skillSource,
              enabled: current?.enabled ?? true,
              hash: version.hash,
              bytes: version.bytes,
              files: version.files,
            });
            fanOutFleet();
            return skill;
          } catch (error) {
            return status(
              400,
              error instanceof Error ? error.message : String(error)
            );
          }
        }
      )
      // The click that settles a skill edited on one machine the fleet's way:
      // `force: true` on that one skill, for that one machine. The machine is
      // read first, as a hook push reads it: the edited copy an overwrite
      // destroys exists nowhere else, so it goes into the skill's history
      // before it goes, and a machine that will not answer stops the push.
      // The other way to settle it is to adopt that copy (`PUT …/skills/:name`
      // with `fromMachine`).
      .post(
        "/api/fleet/skills/:name/push",
        { body: t.Object({ machineId: t.String() }) },
        async ({ params, body, status }) => {
          const agent = registry.agent(body.machineId);
          if (!agent) {
            return status(404, `machine ${body.machineId} is not connected`);
          }
          const config = db.fleetConfig();
          const fleetCopy = config.skills?.find(
            (skill) => skill.name === params.name
          );
          if (!(config.skills && fleetCopy)) {
            return status(404, `the fleet carries no skill ${params.name}`);
          }

          const answer = await callAgent(
            body.machineId,
            READ_SKILL_FILES,
            [params.name],
            READ_TIMEOUT_MS
          );
          if (answer === "offline") {
            return status(404, `machine ${body.machineId} is not connected`);
          }
          if (answer === "timeout") {
            return status(504, `machine ${body.machineId} did not answer`);
          }
          // No copy on the machine is nothing to keep; any other refusal
          // stops the push, because the copy it would destroy was not read.
          if (!(answer.ok || answer.error?.startsWith("no skill "))) {
            return status(
              500,
              answer.error ?? "the machine could not read the skill"
            );
          }
          if (answer.ok) {
            const theirs = answer.result as SkillFile[];
            const hash = hashFiles(theirs);
            if (hash !== fleetCopy.hash) {
              db.recordFleetSkill({
                name: params.name,
                skillSource: `machine:${body.machineId}`,
                hash,
                files: theirs,
                source: `machine:${body.machineId}`,
              });
            }
          }

          pushFleetConfig(body.machineId, agent, {
            ...config,
            skills: config.skills.map((skill) =>
              skill.name === params.name ? { ...skill, force: true } : skill
            ),
          });
          publishInstances(body.machineId);
          return { ok: true };
        }
      )
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
      // Each row spread into a fresh object, not the named `ProjectRow`: the
      // native app's client types a project by this route's own schema
      // (`GetApiProjects200Payload`), which a named row would rename.
      .get("/api/projects", () =>
        db.listProjects().map((project) => ({
          ...projectOut(project),
          cap: caps.capOf(project),
        }))
      )
      // One repository is one project: a folder whose remote a project
      // already has joins it as a checkout place (`placeAdded`), and the
      // answer is that project, not a second one. `place` is the folder asked
      // about. With no folder (New project: its checkout is picked once it is
      // set up) its one place is its folder on the hub. `template` writes its
      // stages.md; made with Caw, it opens its Setup thread with `prompt` as
      // its first message (`promptId`, the dashboard's id for it) and wakes
      // Caw to set it up.
      .post(
        "/api/projects",
        {
          body: t.Object({
            name: t.String({ minLength: 1, maxLength: 200 }),
            machineId: t.Optional(t.String({ minLength: 1 })),
            cwd: t.Optional(t.String({ minLength: 1 })),
            // Made with Caw: its Caw starts on. A folder that joins a project
            // leaves that project's setting as it is.
            caw: t.Optional(t.Boolean()),
            template: t.Optional(
              t.Union(TEMPLATES.map((name) => t.Literal(name)))
            ),
            prompt: t.Optional(t.String({ maxLength: 20_000 })),
            promptId: t.Optional(t.String({ minLength: 1, maxLength: 200 })),
          }),
        },
        async ({ body, status }) => {
          if ((body.machineId === undefined) !== (body.cwd === undefined)) {
            return status(
              400,
              "A checkout is a machine and a folder: send both machineId and cwd, or neither."
            );
          }
          const made = await createOrJoinProject({
            name: body.name,
            ...(body.machineId && body.cwd
              ? { checkout: { machineId: body.machineId, cwd: body.cwd } }
              : {}),
            ...(body.caw === undefined ? {} : { caw: body.caw }),
            ...(body.template ? { template: body.template } : {}),
            ...(body.prompt?.trim()
              ? {
                  setup: {
                    prompt: body.prompt,
                    ...(body.promptId ? { promptId: body.promptId } : {}),
                  },
                }
              : {}),
          });
          return {
            ...projectOut(made.project),
            place: made.place,
            placeAdded: made.placeAdded,
            ...(made.setupThread ? { setupThread: made.setupThread } : {}),
          };
        }
      )
      // The project's running sessions, each lead followed by its delegates:
      // what a forget stops first (project-stops.ts).
      .get("/api/projects/:id/running", ({ params, status }) => {
        if (!db.project(params.id)) {
          return status(404, "This project is no longer recorded. Refresh.");
        }
        return { sessions: projectStops.running(params.id) };
      })
      // Stops the named sessions of the project in one request. Each one's
      // end is reported by a `project.stop` frame as its machine confirms it,
      // or as it fails, never at the ask.
      .post(
        "/api/projects/:id/stop",
        {
          body: t.Object({
            instanceIds: t.Array(t.String({ minLength: 1 }), { minItems: 1 }),
          }),
        },
        ({ params, body, status }) => {
          if (!db.project(params.id)) {
            return status(404, "This project is no longer recorded. Refresh.");
          }
          try {
            projectStops.stop(params.id, body.instanceIds);
          } catch (error) {
            return status(
              400,
              error instanceof Error ? error.message : String(error)
            );
          }
          return { ok: true };
        }
      )
      .delete("/api/projects/:id", async ({ params, status }) => {
        // Never orphaned: a project is forgotten only once nothing of it runs.
        const project = db.project(params.id);
        const still = project ? projectStops.stillRunning(params.id) : 0;
        if (project && still > 0) {
          return status(
            409,
            still === 1
              ? `1 session still runs in ${project.name}; stop it first.`
              : `${still} sessions still run in ${project.name}; stop them first.`
          );
        }
        const machines = new Set(
          db.project(params.id)?.places.map((place) => place.machineId)
        );
        db.deleteProject(params.id);
        projectsChanged();
        // Its hooks leave every place it had.
        for (const machineId of machines) {
          placesChanged(machineId, params.id);
        }
        // The project is gone either way; a folder that could not be moved
        // stays where it was, and the hub says so in its log.
        await trashProjectFolder(params.id).catch((error: unknown) =>
          console.warn(
            `[hub] project ${params.id}'s folder was not moved to the trash: ${error instanceof Error ? error.message : String(error)}`
          )
        );
        return { ok: true };
      })
      // Another checkout of the project's repository, named by hand.
      .post(
        "/api/projects/:id/places",
        { body: t.Object({ machineId: t.String(), path: t.String() }) },
        async ({ params, body, status }) => {
          const project = db.project(params.id);
          if (!project) {
            return status(404, "No project with that id on this hub.");
          }
          if (
            !db.listAgents().some((row) => row.machineId === body.machineId)
          ) {
            return status(404, "No machine with that id on this hub.");
          }
          const path = placePath(body.path);
          if (!path.startsWith("/")) {
            return status(
              400,
              "A place is a folder's absolute path on its machine. Pass a path that starts with /."
            );
          }
          const { place, added } = db.addPlace({
            projectId: project.id,
            machineId: body.machineId,
            path,
            kind: "checkout",
          });
          if (added) {
            placesChanged(body.machineId, project.id);
          }
          if (!project.remote) {
            await learnRemote(project.id, body.machineId, path);
          }
          return {
            ...projectOut(db.project(project.id) ?? project),
            place,
            placeAdded: added,
          };
        }
      )
      // The accounts the project's sessions may run on; null: every account.
      .put(
        "/api/projects/:id/accounts",
        {
          body: t.Object({
            accounts: t.Union([t.Array(t.String()), t.Null()]),
          }),
        },
        ({ params, body, status }) => {
          const project = db.project(params.id);
          if (!project) {
            return status(404, `There is no project ${params.id}.`);
          }
          const unknown = (body.accounts ?? []).filter(
            (id) => !db.accounts.get(id)
          );
          if (unknown.length > 0) {
            return status(400, `There is no account ${unknown.join(", ")}.`);
          }
          db.setProjectAccounts(project.id, body.accounts);
          return projectOut(db.project(project.id) ?? project);
        }
      )
      .delete("/api/projects/:id/places/:placeId", ({ params, status }) => {
        const leaving = db
          .project(params.id)
          ?.places.find((place) => place.id === params.placeId);
        const removed = db.removePlace(params.id, params.placeId);
        if (removed === "removed" && leaving) {
          placesChanged(leaving.machineId, params.id);
        }
        if (removed === "missing") {
          return status(404, "No place with that id in this project.");
        }
        if (removed === "primary") {
          return status(
            409,
            leaving?.kind === "hub"
              ? "This is the project's folder on the hub; it goes when the project does. Forget the project to remove it."
              : "This is the project's primary checkout. Forget the project to remove it."
          );
        }
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
            account: t.Optional(t.String()),
            skills: t.Optional(t.Array(t.String())),
            canDelegate: t.Optional(t.Boolean()),
            cwd: t.Optional(t.String()),
            machineId: t.Optional(t.String()),
            workspace: t.Optional(t.String()),
            fork: t.Optional(t.Boolean()),
            checks: checksSchema,
            lands: t.Optional(LANDS),
            outputs: t.Optional(t.Array(t.String())),
            group: t.Optional(t.String()),
            owns: t.Optional(t.Array(t.String())),
            budget: t.Optional(BUDGET),
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
            const started = await workItems.delegate(body);
            // Waiting for files a live item owns: no item yet.
            if ("queued" in started) {
              return {
                queued: started.queued,
                workItemId: null,
                workspaceId: null,
                instanceId: null,
                title: body.title.trim(),
                text: started.text,
              };
            }
            return {
              queued: null,
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
      // ── Accounts ─────────────────────────────────────────────────────────────
      // Several sign-ins per provider, where each is signed in for which
      // harness, how new sessions choose among them, and what they read of
      // their limits. `provider` narrows it to one provider's accounts.
      .get(
        "/api/accounts",
        { query: t.Object({ provider: t.Optional(accountProvider) }) },
        ({ query }) => {
          const accounts = db.accounts
            .list()
            .filter(
              (account) =>
                !query.provider || account.provider === query.provider
            );
          const ids = new Set(accounts.map((account) => account.id));
          const mine = <T extends { accountId: string }>(rows: T[]): T[] =>
            rows.filter((row) => ids.has(row.accountId));
          return {
            accounts,
            signins: mine(db.accounts.signins()),
            routing: (query.provider
              ? [query.provider]
              : [
                  ...new Set([
                    CLAUDE_PROVIDER,
                    ...accounts.map((account) => account.provider),
                  ]),
                ]
            ).map((provider) => db.accounts.routing(provider)),
            readings: mine(db.accounts.readings()),
            bench: mine(db.accounts.bench()),
            catalogs: mine(db.accounts.catalogs()),
            rebalances: rebalanceNotices.filter((notice) =>
              notice.came.some((one) => ids.has(one.account.id))
            ),
          };
        }
      )
      // The account picker's rows: Claude's subscription and Console, then
      // every provider the fleet's machines know (pi-ai's joined with
      // OpenCode's), each with how it signs in, the harnesses that use it,
      // and whether CawCo reads its limits.
      .get("/api/accounts/providers", (): ProviderChoice[] =>
        providerChoices(knownProviders())
      )
      .post(
        "/api/accounts",
        {
          body: t.Object({
            provider: accountProvider,
            // Claude: `subscription` or `console`. Any other provider: `oauth`
            // (its own sign-in through pi-ai) or `api_key`.
            kind: t.Union([
              t.Literal("subscription"),
              t.Literal("console"),
              t.Literal("oauth"),
              t.Literal("api_key"),
            ]),
            // A nickname; without one the account goes by its email once signed in.
            label: t.Optional(t.String({ minLength: 1 })),
            hue: t.Optional(accountHue),
          }),
        },
        ({ body, status }) => {
          const refusal = accountKindRefusal(body.provider, body.kind);
          return refusal ? status(400, refusal) : db.accounts.create(body);
        }
      )
      .patch(
        "/api/accounts/:id",
        {
          body: t.Object({
            // Null clears the nickname: the account goes by its email.
            label: t.Optional(t.Union([t.String({ minLength: 1 }), t.Null()])),
            hue: t.Optional(accountHue),
            order: t.Optional(t.Integer()),
            neverBackup: t.Optional(t.Boolean()),
            reservePct: t.Optional(
              t.Union([t.Integer({ minimum: 0, maximum: 100 }), t.Null()])
            ),
          }),
        },
        ({ params, body, status }) =>
          db.accounts.patch(params.id, body) ??
          status(404, `There is no account ${params.id}.`)
      )
      .delete("/api/accounts/:id", async ({ params, status }) => {
        const account = db.accounts.get(params.id);
        if (!account) {
          return status(404, `There is no account ${params.id}.`);
        }
        const signins = db.accounts
          .signins()
          .filter((one) => one.accountId === account.id);
        const live = db
          .listInstances()
          .filter(
            (row) =>
              row.accountId === account.id &&
              ["starting", "running", "sleeping"].includes(row.status)
          );
        if (live.length > 0) {
          return status(
            409,
            `${live.length} session${live.length === 1 ? "" : "s"} still run on ${accountName(account)}; stop them first.`
          );
        }
        // Each machine signed in to it signs it out (Claude Code itself for a
        // Claude dir, the agent for any other) and drops the account's store
        // there. One that is offline does so when it next connects: it names
        // its stores, and this hub answers the ones it removed, by the record
        // `remove` keeps (`unknownAccountsOf`). One that is online and fails
        // says why.
        const failed: string[] = [];
        const later: string[] = [];
        for (const signin of signins) {
          // biome-ignore lint/performance/noAwaitInLoops: one machine at a time, each told and answered before the next
          const answer = await forgetOn(account, signin.machineId);
          if (answer === "offline") {
            later.push(machineName(signin.machineId));
          } else if (answer === "timeout" || !answer.ok) {
            failed.push(machineName(signin.machineId));
          }
        }
        if (failed.length > 0) {
          return status(
            409,
            `${failed.join(", ")} did not sign ${accountName(account)} out; try again.`
          );
        }
        db.accounts.remove(account.id, "removed");
        rowsLeave(account.id, null);
        publishUsage();
        // Machines offline now, which sign it out when they next connect.
        return { ok: true, later };
      })
      // Signs an account out on one machine and drops that sign-in: the same
      // sign-out the account's removal runs on each of its machines, here on
      // one, the account and its other machines left as they are.
      .delete(
        "/api/accounts/:id/machines/:machineId",
        { params: t.Object({ id: t.String(), machineId: t.String() }) },
        async ({ params, status }) => {
          const account = db.accounts.get(params.id);
          if (!account) {
            return status(404, `There is no account ${params.id}.`);
          }
          const machine = machineName(params.machineId);
          const signin = db.accounts
            .signins()
            .find(
              (one) =>
                one.accountId === account.id &&
                one.machineId === params.machineId
            );
          if (!signin) {
            return status(
              404,
              `${accountName(account)} is not signed in on ${machine}.`
            );
          }
          const live = db
            .listInstances()
            .filter(
              (row) =>
                row.accountId === account.id &&
                row.machineId === params.machineId &&
                ["starting", "running", "sleeping"].includes(row.status)
            );
          if (live.length > 0) {
            return status(
              409,
              `${live.length} session${live.length === 1 ? "" : "s"} still run on ${accountName(account)} on ${machine}; stop them first.`
            );
          }
          const answer = await forgetOn(account, params.machineId);
          if (answer === "offline") {
            return status(
              409,
              `${machine} is offline, so ${accountName(account)} was not signed out there; try again when it is online.`
            );
          }
          if (answer === "timeout" || !answer.ok) {
            return status(
              409,
              `${machine} did not sign ${accountName(account)} out${answer === "timeout" ? "; it did not answer in time" : `: ${answer.error ?? "it gave no reason"}`}. Try again.`
            );
          }
          db.accounts.removeSignin(account.id, params.machineId);
          rowsLeave(account.id, null, params.machineId);
          publishUsage();
          return { ok: true };
        }
      )
      .put(
        "/api/accounts/routing/:provider",
        {
          params: t.Object({ provider: accountProvider }),
          body: t.Object({
            yours: strategyChoice,
            delegates: strategyChoice,
            atLimit: t.Object({
              move: t.Boolean(),
              waitMinutes: t.Integer({ minimum: 0 }),
              moveWholeUnderK: t.Integer({ minimum: 0 }),
              prepareAtPct: t.Integer({ minimum: 0, maximum: 100 }),
            }),
          }),
        },
        ({ params, body, status }) => {
          // Spread and Soonest reset weigh the limits CawCo reads; a provider
          // it reads none for can only be routed Pinned or Fill first.
          const offered = strategiesFor(params.provider);
          for (const choice of [body.yours, body.delegates]) {
            if (!offered.includes(choice.strategy)) {
              const name =
                params.provider === CLAUDE_PROVIDER
                  ? "Claude"
                  : (knownProviders().find((one) => one.id === params.provider)
                      ?.name ?? params.provider);
              const asked =
                choice.strategy === "spread" ? "Spread" : "Soonest reset";
              return status(
                400,
                `${asked} can't route ${name}: CawCo reads no limits for ${name}'s accounts, so there is no use or reset to weigh. Choose Pinned or Fill first.`
              );
            }
            if (
              choice.strategy === "pinned" &&
              choice.pinnedAccountId &&
              !db.accounts.get(choice.pinnedAccountId)
            ) {
              return status(
                400,
                `There is no account ${choice.pinnedAccountId} to pin.`
              );
            }
          }
          const routing = { provider: params.provider, ...body };
          db.accounts.setRouting(routing);
          return routing;
        }
      )
      // Each account's windows with their pace and run-out, and which account
      // carries a person's and a session's new sessions to the 5-hour horizon.
      .get(
        "/api/accounts/forecast",
        { query: t.Object({ provider: accountProvider }) },
        ({ query }): ProviderForecast => {
          const now = Date.now();
          const accounts = db.accounts
            .list()
            .filter((account) => account.provider === query.provider);
          const readings = db.accounts.readings();
          const history = accounts.flatMap((account) =>
            db.accounts
              .history({ accountId: account.id, since: now - 7 * 86_400_000 })
              .map((row) => ({
                accountId: row.accountId,
                kind: row.kind,
                scopeLabel: row.scopeLabel,
                percent: row.percent,
                resetsAt: row.resetsAt,
                fetchedAt: row.fetchedAt.getTime(),
              }))
          );
          const running = new Set(
            db
              .listInstances()
              .filter((row) => row.status === "running" && row.accountId)
              .map((row) => row.accountId as string)
          );
          const forecasts = accountForecasts(
            accounts,
            readings,
            history,
            running,
            now
          );
          const signedIn = new Set(
            db.accounts
              .signins()
              .filter((one) => one.state === "signed-in")
              .map((one) => one.accountId)
          );
          const carry = (kind: "yours" | "delegates") =>
            carrySequence({
              accounts,
              bench: db.accounts.bench(now),
              forecasts,
              kind,
              now,
              readings,
              routing: db.accounts.routing(query.provider),
              signedIn,
            });
          return {
            provider: query.provider,
            accounts: forecasts,
            yours: carry("yours"),
            delegates: carry("delegates"),
          };
        }
      )
      // Which account a session would start on, and why: what the New
      // session modal says beside "Auto".
      .get(
        "/api/accounts/placement",
        {
          query: t.Object({
            harness: t.String(),
            machineId: t.String(),
            model: t.Optional(t.String()),
            projectId: t.Optional(t.String()),
            taskId: t.Optional(t.String()),
            type: t.Optional(t.String()),
            kind: t.Optional(
              t.Union([t.Literal("yours"), t.Literal("delegates")])
            ),
            account: t.Optional(t.String()),
            forkOf: t.Optional(t.String()),
            // The session's directory: what pi's `default` is there.
            cwd: t.Optional(t.String()),
          }),
        },
        async ({ query, status }) => {
          const asked = await piDefaultFor(query.machineId, {
            ...askedStart(query),
            ...(query.cwd ? { cwd: query.cwd } : {}),
          });
          if ("refusal" in asked) {
            return status(503, asked.refusal);
          }
          const input = placementInput(
            query.machineId,
            asked,
            { projectId: query.projectId, taskId: query.taskId },
            query.forkOf
              ? {
                  accountId:
                    db.getInstancesByIds([query.forkOf])[0]?.accountId ?? null,
                }
              : undefined
          );
          // pi's `default` (asked in the directory above) or a bare id, as
          // the session would start on it: the screen names the session's
          // provider by it.
          const resolved =
            resolvedModel(query.machineId, query.harness, asked.model) ?? null;
          if (!input) {
            const named =
              resolved && resolved !== query.model
                ? `${query.model ?? "default"} (${resolved})`
                : query.model;
            return {
              accountId: null,
              strategy: "none",
              why: named
                ? `${named} is no account's model on ${machineName(query.machineId)}: it runs from the machine's own ${query.harness} store.`
                : `A ${query.harness} session with no model named runs from the machine's own ${query.harness} store.`,
              model: resolved,
            } satisfies PlacementPreview;
          }
          const placed = placeAccount(input);
          if (!placed.ok) {
            return status(400, placed.refusal);
          }
          const { ok: _ok, ...explain } = placed;
          return { ...explain, model: resolved } satisfies PlacementPreview;
        }
      )
      // Signs an account in on a machine, into the account's own store there.
      // Claude: `claude auth login` in the account's config dir, answering
      // the link to authorise in the reader's browser. Any other provider:
      // pi-ai's own OAuth sign-in, run by the agent, answering a device code
      // to enter on any device (or a link, for a provider without one). Only
      // ever started by this call.
      .post(
        "/api/accounts/:id/machines/:machineId/signin",
        async ({ params, status }) => {
          const account = db.accounts.get(params.id);
          if (!account) {
            return status(404, `There is no account ${params.id}.`);
          }
          const claude = account.provider === CLAUDE_PROVIDER;
          if (!claude && account.kind !== "oauth") {
            return status(
              400,
              `${accountName(account)} is a key account: send its key to the machines that use it.`
            );
          }
          const answer = claude
            ? await callAgent(
                params.machineId,
                CONTROL_BEGIN_ACCOUNT_LOGIN,
                [account.id, account.kind],
                SIGNIN_TIMEOUT_MS,
                "claude"
              )
            : await callAgent(
                params.machineId,
                CONTROL_BEGIN_PROVIDER_LOGIN,
                [account.id, account.provider],
                SIGNIN_TIMEOUT_MS
              );
          if (answer !== "offline" && !db.accounts.get(account.id)) {
            return status(
              404,
              await undoRemovedSignin(account, params.machineId)
            );
          }
          // A machine that was asked makes the account's store (and may be
          // waiting on its sign-in) whether or not a code came back; it holds
          // that store signed out, as its next register would report, so
          // removing the account forgets it there.
          if (
            answer !== "offline" &&
            !db.accounts
              .signins()
              .some(
                (one) =>
                  one.accountId === account.id &&
                  one.machineId === params.machineId
              )
          ) {
            db.accounts.putSignin({
              accountId: account.id,
              machineId: params.machineId,
              state: "signed-out",
            });
            publishUsage(params.machineId);
          }
          if (answer === "offline" || answer === "timeout") {
            return status(503, awayWords(params.machineId, answer));
          }
          if (!answer.ok) {
            return status(422, answer.error ?? "The sign-in did not start.");
          }
          return answer.result as { url: string } | ProviderSigninChallenge;
        }
      )
      // Claude: types the pasted code into the waiting `claude auth login`.
      // Any other provider: a pasted code for a sign-in that asked for one;
      // else it waits up to a minute for the person to enter the device code,
      // and says `pending` when they have not yet, `expired` once it lapsed.
      .post(
        "/api/accounts/:id/machines/:machineId/signin/complete",
        { body: t.Object({ code: t.Optional(t.String()) }) },
        async ({ params, body, status }) => {
          // The account the sign-in finishes into: its own, or the one a
          // sign-in on another machine has since joined it into.
          const into = () =>
            db.accounts.get(params.id) ??
            db.accounts.get(joinedInto.get(params.id) ?? "");
          const account = into();
          if (!account) {
            return status(404, `There is no account ${params.id}.`);
          }
          const claude = account.provider === CLAUDE_PROVIDER;
          if (claude && !body.code) {
            return status(400, "Paste the code from the authorisation page.");
          }
          const answer = await completeOn(
            account,
            params.id,
            params.machineId,
            body.code
          );
          if (answer === "offline" || answer === "timeout") {
            return status(503, awayWords(params.machineId, answer));
          }
          const now = into();
          if (!now) {
            return status(
              404,
              await undoRemovedSignin(account, params.machineId)
            );
          }
          if (!answer.ok) {
            return status(422, answer.error ?? "The sign-in did not finish.");
          }
          const result = answer.result as
            | AccountSigninResult
            | ProviderSigninResult;
          const settled =
            now.id === params.id
              ? await settleSignin(now, params.machineId, result)
              : await finishJoined(params.id, now, params.machineId, result);
          return "error" in settled ? status(409, settled.error) : settled;
        }
      )
      // A key account's key, typed once in the dashboard: relayed to each
      // machine named, which writes it into the account's store there. The
      // hub never stores it, never logs it and answers nothing of it.
      .post(
        "/api/accounts/:id/key",
        {
          body: t.Object({
            key: t.String({ minLength: 1 }),
            machineIds: t.Array(t.String(), { minItems: 1 }),
          }),
        },
        async ({ params, body, status }) => {
          const account = db.accounts.get(params.id);
          if (!account) {
            return status(404, `There is no account ${params.id}.`);
          }
          if (account.kind !== "api_key") {
            return status(
              400,
              `${accountName(account)} signs in with ${account.provider === CLAUDE_PROVIDER ? "Claude Code" : "OAuth"}, not a key.`
            );
          }
          const machines = await Promise.all(
            body.machineIds.map(async (machineId) => {
              const answer = await callAgent(
                machineId,
                CONTROL_SET_PROVIDER_KEY,
                [account.id, account.provider, body.key, account.identity],
                SIGNIN_TIMEOUT_MS
              );
              if (answer === "offline" || answer === "timeout") {
                return { machineId, error: awayWords(machineId, answer) };
              }
              if (!answer.ok) {
                return {
                  machineId,
                  error: answer.error ?? "The key was not written.",
                };
              }
              const result = answer.result as ProviderSigninResult;
              // Another machine's write already joined the key into the
              // account it already was: this one joins it there too.
              const joinedTo = db.accounts.get(account.id)
                ? undefined
                : db.accounts.get(joinedInto.get(account.id) ?? "");
              const settled =
                joinedTo && result.state === "signed-in" && result.identity
                  ? await joinOn(
                      account.id,
                      joinedTo,
                      machineId,
                      result.identity
                    ).then((joined) =>
                      "error" in joined ? joined : { ...result, joined }
                    )
                  : await settleProviderSignin(
                      db.accounts.get(account.id) ?? account,
                      machineId,
                      result
                    );
              return "error" in settled
                ? { machineId, error: settled.error }
                : { machineId, result: settled };
            })
          );
          return { machines };
        }
      )
      // What a machine's own stores hold that CawCo can move into accounts:
      // `~/.claude`'s login, and each credential in pi's and OpenCode's own
      // `auth.json` (a Claude subscription's OAuth there is never listed).
      .get(
        "/api/accounts/home-credentials",
        { query: t.Object({ machineId: t.String() }) },
        async ({ query, status }) => {
          const [claude, others] = await Promise.all([
            callAgent(
              query.machineId,
              CONTROL_READ_HOME_LOGIN,
              [],
              SIGNIN_TIMEOUT_MS,
              "claude"
            ),
            callAgent(
              query.machineId,
              CONTROL_READ_HOME_CREDENTIALS,
              [],
              SIGNIN_TIMEOUT_MS
            ),
          ]);
          if (others === "offline" || others === "timeout") {
            return status(503, awayWords(query.machineId, others));
          }
          if (!others.ok) {
            return status(422, others.error ?? "The machine did not answer.");
          }
          return {
            claude:
              typeof claude !== "string" && claude.ok
                ? (claude.result as HomeLogin)
                : null,
            credentials: others.result as HomeCredential[],
          };
        }
      )
      // Moves one credential out of a machine's own store into CawCo, once:
      // into the account of the identity it is (made now when there is none),
      // in that account's store on the machine, so it works in CawCo without
      // a second sign-in. `store` `claude` is `~/.claude`'s login; `pi` and
      // `opencode` name their own `auth.json`, and `provider` the entry there.
      // The sessions that run from it go on running from it, and the machine
      // moves it at the first moment all of them are at rest; the answer says
      // how many run from it now, and GET says how it came out.
      .post(
        "/api/accounts/move-login",
        {
          body: t.Object({
            machineId: t.String(),
            store: homeStore,
            provider: t.Optional(t.String()),
          }),
        },
        async ({ body, status }) => {
          const { machineId, store } = body;
          const found = await homeCredentialOf(machineId, store, body.provider);
          if ("error" in found) {
            return status(found.status, found.error);
          }
          const started = await startMove(machineId, store, found);
          return "error" in started
            ? status(started.status, started.error)
            : status(202, started);
        }
      )
      .get("/api/accounts/move-login", () => ({
        moving: movingLogins().map((move) => ({
          machineId: move.machineId,
          store: move.store,
          storeProvider: move.storeProvider,
          provider: move.provider,
          accountId: move.accountId,
          since: move.since,
        })),
        done: [...moveResults.values()],
      }))
      // ── Usage (USAGE-SPEC.md §6) ─────────────────────────────────────────────
      // The heavy data lives behind these reads; the socket only carries the small
      // limits frame, so the dashboard pulls aggregates when it needs them.
      .get(
        "/api/usage/limits",
        (): UsageLimitsResponse => ({
          machines: machineReadings(db).map((row) => ({
            machineId: row.machineId,
            hostname: row.hostname,
            limits: row.payload,
            openCodeGo: row.openCodeGo,
          })),
        })
      )
      .get("/api/usage/spend", (): UsageSpend => spendNow())
      .get(
        "/api/usage/limits/history",
        {
          query: t.Object({
            accountId: t.String(),
            kind: t.Optional(t.String()),
            since: t.Optional(t.Numeric()),
            until: t.Optional(t.Numeric()),
          }),
        },
        ({ query }) =>
          db.accounts.history({
            accountId: query.accountId,
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
        // An agent on this build sends parts of at most WIRE_FRAME_LIMIT_BYTES
        // (`@cawco/core/wire`), joined in `guardedAgentMessage`; one on the
        // build before sends each message whole, a transcript read tens of
        // MB, until it updates through this very socket. So a frame is taken
        // up to the largest message the wire carries. Bun has one WebSocket
        // config per server, so both routes name the same limit.
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        open(ws) {
          openLine(ws, false);
        },
        drain(ws) {
          drainLine(ws);
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every agent socket verb (register, frames, pulse, control_result, etc.) through one handler; splitting it would scatter the ordering guarantees across several functions.
        message: guardedAgentMessage(async (ws, message) => {
          if (!isEnvelope(message)) {
            const fault = envelopeFault(message);
            console.warn(`[hub] agent ${fault}`, message);
            sendFrame(ws, refusalFrame(message, fault));
            return;
          }
          // Only the machine's registered connection speaks for it: a
          // superseded or unregistered one is not acted on, and is told so.
          if (
            message.verb !== "register" &&
            registry.agent(message.machineId)?.id !== ws.id
          ) {
            const fault = `${message.verb} refused: this connection is not machine ${message.machineId}'s registered one; register first`;
            console.warn(`[hub] ${fault}`);
            sendFrame(ws, refusalFrame(message, fault));
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
              for (const [id, held] of heldSessions) {
                if (held.machineId === message.machineId) {
                  heldSessions.delete(id);
                }
              }
              registry.registerAgent(message.machineId, ws, ws.remoteAddress);
              // A project Caw could not set up while no machine was online is set up now.
              queueMicrotask(() => caw.machineOnline());
              workItems.discardUnfiled(message.machineId);
              // Checks a stopped hub left running on this machine run again
              // the moment it can run commands — waiting on nothing else the
              // register asks of the agent.
              workItems.resumeChecks(message.machineId);
              // A checkout coming online can be where a ready task's
              // workspace is cut.
              dispatcher.machineOnline(message.machineId);
              // A delegate that waited for owned files may start on it now.
              workItems.resumeQueued();
              // Projects that do not know their repository yet read it from
              // their checkouts here, now that the machine can run git.
              Promise.all(
                db
                  .projectsWithoutRemote(message.machineId)
                  .map(({ projectId, path }) =>
                    learnRemote(projectId, message.machineId, path)
                  )
              ).catch((error: unknown) =>
                console.warn(
                  `[hub] reading ${message.machineId}'s project remotes failed: ${error instanceof Error ? error.message : String(error)}`
                )
              );
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
              // Each connection moves what the machine's own stores hold
              // once its first report says how they stand.
              homeStamps.delete(message.machineId);
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
              // A launch its agent still has stays the session's one; one it
              // does not have is over, and the restore below starts it anew.
              settleLaunchesOn(
                message.machineId,
                peekInstances(message.payload),
                registrationCustody,
                0
              );
              const settled = db.settleInstances(
                message.machineId,
                peekInstances(message.payload),
                [
                  ...heldProcesses(registrationCustody),
                  ...launchingOn(message.machineId),
                ],
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
                // went away had not handed it yet went with that agent, and is
                // owed to it again. What it holds is decided once its harness
                // has said (`decideCustody`). A send its harness has taken up
                // is read either way — a read that happened while no agent was
                // reading is not framed again. One whose process is gone runs
                // again on its conversation, restored now or woken later, and
                // is owed what its process never read.
                const kept =
                  custody.state === "unavailable" || outlived(orphan);
                if (kept) {
                  forgetPending(orphan.row.id, UNREAD.ended, true);
                } else {
                  losePending(orphan.row.id, orphan.resumes);
                }
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
              // A workflow's question names its run's machine but no session
              // (its instance id is its step's): it is the run's, answered or
              // ended with the run, and a daemon coming back has no say in it.
              for (const parked of pending.list()) {
                const [owner] = db.getInstancesByIds([parked.instanceId ?? ""]);
                if (
                  !workflowRunOf(parked) &&
                  parked.machineId === message.machineId &&
                  custody.state === "available" &&
                  !(
                    owner &&
                    ["running", "starting", "unknown"].includes(owner.status)
                  ) &&
                  !heldIds.has(parked.instanceId ?? "") &&
                  !(heldOpencode && owner?.harness === "opencode")
                ) {
                  // Asked again by its session when it next runs.
                  noteWithdrawn([parked]);
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
              await readLaunchDirs(message.machineId);
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
              // Every session this register put back to a process, or handed
              // to the OpenCode server that outlived the agent: none is left
              // for the settle of work asleep on a cut turn (settleCutItems).
              const reached = new Set(restoredIds);
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
                    reached.add(row.id);
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
              detach(pushAgents(message.machineId), "agent push");
              // And what its stored conversations are called, for the ones nobody
              // has ever named — off the catalog the daemon just read anyway.
              detach(
                nameStoredSessions(message.machineId),
                "stored session names"
              );
              // The ledger the returning agent reattaches against: what this hub
              // has already ingested of each session the daemon is about to hold.
              // Computed AFTER `settleInstances` and after the restores above, so
              // it names exactly the sessions a reattach can act on — see
              // {@link reattachable} for why the restores have to be in it.
              const reattaching = reattachable(
                peekInstances(message.payload),
                revivable.map((orphan) => orphan.row.id)
              );
              freshAccountReports(message.machineId);
              sendFrame(
                ws,
                registerAck(
                  message,
                  streams.ingestedFor(reattaching),
                  unknownAccountsOf(message.machineId, message.payload),
                  claudeSessionsOn(message.machineId),
                  // This connection's credential for the hub's git remote;
                  // the one its last connection held stops working.
                  machineCredentials.mint(message.machineId)
                )
              );
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
              awaitingMachine.delete(message.machineId);
              releaseOwed({ machineId: message.machineId });
              // Behind what it was owed, which is its next turn when it has
              // any: a process a hub restored and then died before it handed
              // the cut turn back is up now, and hears of it here.
              for (const id of peekInstances(message.payload)) {
                resumeCutTurn(id);
              }
              // The settle reads transcripts off the machine; register must
              // not stall on it.
              detach(settleCutItems(message.machineId, reached), "cut items");
              // Reconnect retries overdue stored schedules right after the register ACK.
              detach(keepAliveScheduler.wake(), "keepalive wake");
              workflowRuntime.recover(message.machineId);
              // Continuations waiting on this machine — for their summary, or
              // for their new session — go on from where their record says.
              for (const job of db.continuationRows()) {
                if (
                  !SETTLED.has(job.stage) &&
                  machineFor(job) === message.machineId
                ) {
                  detach(advanceContinuation(job.id), "continuation");
                }
              }
              // And project moves waiting on it, likewise (moves.ts).
              moves.machineBack(message.machineId);
              break;
            }
            case "heartbeat": {
              for (const claim of addressClaims(message.payload) ?? []) {
                recordSessionAddress(ws, message.machineId, claim);
              }
              db.touchAgent(message.machineId);
              // A recovered machine can now answer an idle receipt for an overdue schedule.
              detach(keepAliveScheduler.wake(), "keepalive wake");
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
              // machine neither lists nor holds in custody (the newest custody
              // it reported) settle — `sleeping` when there is a conversation
              // to resume, `error` when there is not.
              //
              // Deliberately no respawn from this path. A heartbeat is a report,
              // and answering a report by starting processes turns the fleet's
              // slowest-moving surface into its most destructive one: the daemon
              // would be told to relaunch a session every 15 seconds for as long
              // as it disagreed with the hub. Recovery is register's job, where
              // it happens once, bounded, on an event that means "the machine
              // just came back".
              //
              // A row whose launch is on its way is the machine's to settle:
              // it is starting, whatever the beat lists, until that launch
              // settles ({@link launches}). Filed asleep instead, it was owed
              // its sends again and woken by each one, every launch minting
              // over the last (2026-10-10).
              if ((message.payload as HeartbeatPayload).custody !== undefined) {
                settleLaunchesOn(
                  message.machineId,
                  peekInstances(message.payload),
                  peekCustody(message.payload),
                  HEARTBEAT_SETTLE_GRACE_MS
                );
              }
              const beat = db.reconcileHeartbeat(
                message.machineId,
                peekInstances(message.payload),
                [
                  ...heldProcesses(machineCustody.get(message.machineId)),
                  ...launchingOn(message.machineId),
                ],
                HEARTBEAT_SETTLE_GRACE_MS
              );
              for (const row of beat.settled) {
                // Its parked questions cannot be answered by a process that is
                // gone. What it was sent and never read goes to its next
                // process: on its conversation, or fresh when it never began
                // one (core `relaunchOf`).
                losePending(row.id, relaunchOf(row).kind !== "refused");
                escalateRoutedAsks(row.id);
              }
              // A restored process up before it said a word (Claude's CLI
              // speaks its `init` only once it has input) is handed back the
              // turn a restart cut on the beat that lists it.
              for (const id of beat.promoted) {
                resumeCutTurn(id);
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
                db.mergeAgentHarnesses(message.machineId, reported);
                capabilityReports.delete(message.machineId);
                // Where each Claude account is signed in on this machine, as
                // its Claude Code config dirs say.
                const claudeAccounts = reported.find(
                  (report) => report.harness === "claude"
                )?.accounts;
                if (claudeAccounts) {
                  syncAccounts(message.machineId, "claude", claudeAccounts);
                }
                db.mergeAgentTools(
                  message.machineId,
                  peekTools(message.payload)
                );
                autoInstall(message.machineId, ws);
                sendFleetSync(message.machineId, ws);
              }
              // What the machine's own pi and OpenCode stores hold, moved into
              // accounts on each connection and whenever they change under it
              // (a login made there with `opencode auth login`).
              const { homeStores } = message.payload as HeartbeatPayload;
              if (
                homeStores !== undefined &&
                homeStamps.get(message.machineId) !== homeStores
              ) {
                homeStamps.set(message.machineId, homeStores);
                adoptHomeCredentials(message.machineId).catch(console.error);
              }
              // A lender back: what its borrowers could not get while it was away.
              lendToWaiting(message.machineId);
              // Every other provider's accounts on this machine, as their
              // stores there say, and the providers it knows.
              const { providerAccounts, providers } =
                message.payload as HeartbeatPayload;
              if (providerAccounts) {
                syncAccounts(message.machineId, "providers", providerAccounts);
              }
              if (providers) {
                machineProviders.set(message.machineId, providers);
              }
              // When the conversations a harness's server lists last moved,
              // read after the register so the register never waits on that
              // server's start.
              const dated = db.dateStoredSessions(
                message.machineId,
                beatIds,
                peekResumableAt(message.payload)
              );
              if (
                dated > 0 ||
                reported ||
                moved ||
                beat.promoted.length > 0 ||
                beat.settled.length > 0
              ) {
                publishInstances(message.machineId);
              }
              sendFrame(ws, {
                ...ack(message),
                payload: {
                  ok: true,
                  keepAwake: keptWarm(message.machineId, beatIds),
                } satisfies HeartbeatAckPayload,
              });
              break;
            }
            // The per-machine scanner's usage report (USAGE-SPEC.md §6.4): store
            // the buckets and the OpenCode Go reading, then push the small
            // frame of limits and the fleet's spend, which moves exactly here
            // — the dashboard pulls the heavy aggregates over REST. Claude's
            // limits are its accounts', which its sessions report.
            case "usage": {
              const { buckets, openCodeGo, accounts } = message.payload as {
                accounts?: ProviderAccountReading[];
                buckets?: UsageBucket[];
                openCodeGo?: OpenCodeGoLimits | null;
              };
              // Each metered account's windows as the machine just read them.
              for (const reading of accounts ?? []) {
                noteProviderReading(db, message.machineId, reading);
              }
              if (buckets && buckets.length > 0) {
                // Quarter-hour buckets only: a daemon that still reports hour
                // buckets predates them, and its spend is not stored until it
                // is restarted on this build. Its limits still are.
                if (buckets.every((bucket) => bucket.spanMs === BUCKET_MS)) {
                  db.putUsageBuckets(message.machineId, buckets);
                  // Spend moved: every capped project's state with it.
                  caps.recheck();
                } else {
                  console.warn(
                    `[hub] usage buckets from ${message.machineId} refused: its daemon reports hour buckets; restart it on this build`
                  );
                }
              }
              if (openCodeGo !== undefined) {
                db.putOpenCodeGoLimits(message.machineId, openCodeGo);
              }
              publishUsage(message.machineId);
              break;
            }
            // A launch starting on its machine: what it runs on, minted now.
            case "launch": {
              const grant = grantLaunch(
                message.machineId,
                message.instanceId,
                message.payload as LaunchAsk | undefined
              );
              if ("refusal" in grant) {
                console.warn(
                  `[hub] launch of ${message.instanceId} refused at its start: ${grant.refusal}`
                );
              }
              sendFrame(ws, {
                verb: "launch",
                machineId: message.machineId,
                instanceId: message.instanceId,
                requestId: message.requestId,
                payload: grant,
              } satisfies Envelope<LaunchGrant>);
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
              if (kind === "move_progress") {
                moves.progress(
                  message.machineId,
                  message.payload as MoveProgressFrame
                );
                break;
              }
              if (kind === "account_borrow") {
                answerBorrow(
                  message.machineId,
                  message.payload as AccountBorrowFrame
                ).catch(console.error);
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
                // A forget waiting on it says why; the stop stays owed, and a
                // later confirmation still reports it stopped.
                projectStops.failed(
                  ownedSession.id,
                  (message.payload as ErrorFrame).message
                );
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
              // A send no process took, handed back whole by its machine: owed
              // again for the session's next process ({@link takeBack}).
              if (kind === "held_send" && message.instanceId) {
                const { send } = message.payload as FramePayload & {
                  kind: "held_send";
                };
                takeBack(message.machineId, message.instanceId, send);
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
                launchSettled(message.instanceId, "it was stopped");
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
                  const { died } = message.payload as FramePayload & {
                    kind: "asleep";
                  };
                  launchSettled(
                    message.instanceId,
                    died ? "its process died" : "it went to sleep",
                    processGeneration(process)
                  );
                  if (died) {
                    diedOnSignal(message.machineId, message.instanceId, died);
                  } else {
                    sessionAsleep(message.machineId, message.instanceId);
                  }
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
                // A stored conversation stays resumable: what it was sent and
                // never read goes to the process that next runs it.
                losePending(
                  message.instanceId,
                  relaunchOf(process).kind !== "refused"
                );
                publishInstances(message.machineId);
                break;
              }
              if (kind === "frame" && message.instanceId) {
                const frame = message.payload as FramePayload & {
                  kind: "frame";
                };
                if (
                  frame.message.type === "system" &&
                  frame.message.subtype === CUSTODY_HELD
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
                  const note = custodyReason(hours);
                  heldSessions.set(row.id, {
                    machineId: row.machineId,
                    since: row.updatedAt.getTime(),
                    reason: note,
                  });
                  publishInstances(message.machineId);
                  message.payload = {
                    ...frame,
                    message: custodyLine(row, note),
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
                      recordTurnUsage(row, neutral, true);
                      db.updateKeepAlive(
                        row.id,
                        keepAliveResult(row, neutral, true)
                      );
                      // A keep-alive's cost is the session's, not a thread's.
                      if (typeof neutral.total_cost_usd === "number") {
                        caw.turnCost(row.id, neutral.total_cost_usd, false);
                      }
                      const usage = keepAliveUsage(neutral);
                      console.info(
                        `[keepalive] ${row.id}: result ${neutral.uuid} input=${usage.input} read=${usage.read} write=${usage.write} at ${new Date().toISOString()}`
                      );
                      // A refreshed request establishes the next original deadline.
                      detach(keepAliveScheduler.wake(), "keepalive wake");
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
                  const [claimed] = db.getInstancesByIds([message.instanceId]);
                  if (claimed) {
                    recordTurnUsage(claimed, neutral, false);
                  }
                  if (neutral.errors?.includes(SERVER_STOPPED_MID_TURN)) {
                    // Cut, not ended: the server it ran in stopped. Handed
                    // back once this result is taken in like any other.
                    const cutId = message.instanceId;
                    const stoppedAt = new Date();
                    lifetime.after(0, () => resumeCutTurn(cutId, stoppedAt));
                  } else {
                    turnOver(message.instanceId);
                  }
                  // Claimed once: a lead's turn books its cost to its thread.
                  if (typeof neutral.total_cost_usd === "number") {
                    caw.turnCost(message.instanceId, neutral.total_cost_usd);
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
                    // A launch's own word: what it has open is written anew,
                    // and a turn a restart cut goes back to it now it is up.
                    turnsWritten.delete(message.instanceId);
                    resumeCutTurn(message.instanceId);
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
                  // Its harness taking up a send is its turn starting.
                  if (signal.kind === "read") {
                    turnUnderWay(message.instanceId);
                  }
                  takeSendSignal(message.instanceId, signal);
                  break;
                }
                // A launch's word that its session's data is in place: the
                // row names that dir's account from now on. Only the row's
                // own launch says it; a process since replaced does not.
                if (
                  frame.message.type === "system" &&
                  frame.message.subtype === SESSION_DIR_READ
                ) {
                  const [row] = db.getInstancesByIds([message.instanceId]);
                  if (
                    row &&
                    peek(message.payload, "processGeneration") ===
                      processGeneration(row)
                  ) {
                    landSessionDir(row, frame.message.account_id ?? null);
                  }
                  break;
                }
                // A session whose boundary hook fails open, at a turn
                // boundary: relaunched onto the one that refuses when idle.
                if (
                  frame.message.type === "system" &&
                  frame.message.subtype === BOUNDARY_RELAUNCH
                ) {
                  const { machineId, instanceId } = message;
                  relaunchOntoHook(machineId, instanceId).catch(
                    (error: unknown) =>
                      console.error(
                        `[hub] boundary: relaunching ${instanceId} failed: ${String(error)}`
                      )
                  );
                  break;
                }
                // The session's effort as its agent read it back: the row's
                // word on it, and no screen's line.
                if (
                  frame.message.type === "system" &&
                  frame.message.subtype === EFFORT_READ
                ) {
                  const { effort } = frame.message;
                  const level = isEffortLevel(effort) ? effort : EFFORT_NONE;
                  if (db.noteInstanceEffort(message.instanceId, level)) {
                    publishInstances(message.machineId);
                  }
                  // Launched with no effort of its own: this is what its
                  // model runs at by default on its account.
                  if (effortUnasked.delete(message.instanceId)) {
                    const [row] = db.getInstancesByIds([message.instanceId]);
                    const accountId = row?.accountId;
                    if (accountId && row?.model) {
                      db.accounts.putDefaultEffort(accountId, row.model, level);
                    }
                  }
                  break;
                }
                // What the session's Claude Code reported about its account:
                // its limits, from each `rate_limit_event`, and its plan, once
                // per start. The account's reading, and no screen's line. A
                // session's readings are its row's account's while that
                // account is signed in on the machine, where the session runs
                // in its dir. One that is not (a process launched in the
                // machine's own `~/.claude` before accounts were CawCo's
                // alone) reads nobody CawCo knows, and is kept by nobody.
                if (
                  frame.message.type === "system" &&
                  (frame.message.subtype === RATE_LIMIT_READ ||
                    frame.message.subtype === ACCOUNT_READ)
                ) {
                  const [row] = db.getInstancesByIds([message.instanceId]);
                  // A reading from a process its row has since replaced
                  // (a move relaunched it on another account) is of no
                  // account the row names: dropped, never let it say who is
                  // signed in. The row names the account of the launch it
                  // has now, as a move waits for it ({@link relaunchAtTurnEnd}).
                  if (
                    !row ||
                    peek(message.payload, "processGeneration") !==
                      processGeneration(row)
                  ) {
                    break;
                  }
                  const accountId =
                    row.accountId &&
                    db.accounts
                      .signins()
                      .some(
                        (one) =>
                          one.accountId === row.accountId &&
                          one.machineId === message.machineId &&
                          one.state === "signed-in"
                      )
                      ? row.accountId
                      : undefined;
                  if (!accountId) {
                    break;
                  }
                  const read = frame.message.account;
                  const account = db.accounts.get(accountId);
                  if (
                    read?.identity &&
                    account?.identity &&
                    !sameIdentity(account.identity, read.identity)
                  ) {
                    // The account's own dir answers as someone else: not
                    // this account's reading or catalog, and not this
                    // account signed in there.
                    console.warn(
                      `[hub] ${message.instanceId} runs on ${accountName(account)} but its Claude Code is signed in as someone else on ${machineName(message.machineId)}`
                    );
                    db.accounts.putSignin({
                      accountId,
                      machineId: message.machineId,
                      state: "mismatch",
                    });
                    publishUsage(message.machineId);
                    break;
                  }
                  const info = frame.message.rate_limit_info;
                  if (info) {
                    noteRateLimit(db, accountId, info);
                    if (info.status === "rejected" && !info.isUsingOverage) {
                      limitRefused.add(message.instanceId);
                    }
                  }
                  if (read) {
                    keepProbe(db, accountId, read);
                  }
                  publishUsage(message.machineId);
                  break;
                }
                if (
                  frame.message.type === "assistant" ||
                  frame.message.type === "user" ||
                  frame.message.type === "stream_event"
                ) {
                  turnUnderWay(message.instanceId);
                }
                observeTurn(message.instanceId, frame);
              }
              if (message.requestId && kind === "permission_request") {
                const [owner] = db.getInstancesByIds([
                  message.instanceId ?? "",
                ]);
                // An ask from a process this hub holds no live row for, or from
                // an earlier launch of the row, is cancelled at admission
                // through the same settlement path. A process sessiond kept
                // alive across an agent restart is `starting` until its attach
                // lands (`settleInstances`, `restore`), so its replayed asks
                // are admitted. A refusal is said, and the asking process is
                // told at once: nothing may wait on an ask nobody can see.
                const refusal = askRefusal(owner, message);
                if (refusal) {
                  console.warn(
                    `[hub] ask refused session=${message.instanceId ?? "none"} request=${message.requestId} tool=${peek(message.payload, "toolName") ?? "unknown"}: ${refusal}`
                  );
                  pending.remember(message.requestId, message);
                  pending.resolve(message.requestId, "cancelled", refusal);
                  // Admission does not wait on the machine.
                  detach(withdrawUnshown(message, refusal), "ask withdrawal");
                  break;
                }
                // A replayed ask (the daemon re-announces unresolved asks after
                // every register) refreshes the parked copy without a second
                // Telegram message or a second routing decision.
                const parkedBefore = pending.get(message.requestId);
                const alreadyParked = parkedBefore !== undefined;
                // A project lead's question goes to a thread: the one whose
                // message woke this turn, else the project's newest. A replay
                // keeps the thread it was first given.
                const askPayload = message.payload as PermissionRequestFrame;
                const asking =
                  questionsOf(askPayload.toolName, askPayload.input) !== null;
                let threadId = (
                  parkedBefore?.payload as PermissionRequestFrame | undefined
                )?.threadId;
                if (!alreadyParked && asking) {
                  threadId = caw.askThread(owner);
                }
                if (threadId) {
                  askPayload.threadId = threadId;
                }
                if (!pending.remember(message.requestId, message, true)) {
                  break;
                }
                if (alreadyParked) {
                  break;
                }
                if (threadId) {
                  caw.asksChanged(threadId);
                }
                // A delegate's ask routes to its parent; the user is only the
                // fallback. The parent must be live, or asleep with a
                // conversation to wake from: a parent waiting on its
                // delegates is put to sleep after half an hour at rest, and
                // the ask wakes it as its delegate's report does
                // (`deliverSend`). Otherwise the ask is the user's exactly as
                // it was before this feature.
                const sender = message.instanceId
                  ? db.listedInstancesByIds([message.instanceId])[0]
                  : undefined;
                const parentId = sender?.parentInstanceId;
                if (
                  sender?.workflowStepId &&
                  !parentId &&
                  (message.payload as { requestKind?: string }).requestKind ===
                    "question"
                ) {
                  const askerAgent = registry.agent(message.machineId);
                  if (askerAgent) {
                    sendFrame(askerAgent, {
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
                  }
                  pending.resolve(message.requestId);
                  break;
                }
                // A parent whose own work is finished cannot take the ask.
                const takes = (row: InstanceRow): boolean =>
                  sender !== undefined &&
                  (row.status === "running" ||
                    row.status === "starting" ||
                    (row.status === "sleeping" && row.sessionId !== null)) &&
                  !workItems.refusal(row, {
                    kind: "peer",
                    fromSession: sender.id,
                  });
                // Its parent, else its project's lead, which adopts a work
                // item whose parent has ended (work-items.ts `reportees`).
                const parent =
                  sender && parentId && parentId !== message.instanceId
                    ? workItems.reportees(sender).find(takes)
                    : undefined;
                const routed = sender !== undefined && parent !== undefined;
                if (routed) {
                  (message.payload as Record<string, unknown>).routedTo =
                    "parent";
                  deliverDelegateAsk(sender, parent, clientCopy(message));
                } else if (!internal) {
                  telegram?.onAsk(message);
                  push.onAsk(message);
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
                  caw.pulse(message.instanceId, pulse.busy);
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
                  // A summariser whose provider refuses it at its usage
                  // limit is refused: its harness would retry until the
                  // limit resets (OpenCode answers Go's monthly limit with a
                  // `retry` status, never an error). Its wait ends on the
                  // provider's words and the run stops its scratch session,
                  // so the continuation's caller decides what is next.
                  if (providerLimitRefused([neutral.retry.message])) {
                    turnWaiters
                      .get(message.instanceId)
                      ?.reject(new Error(neutral.retry.message));
                  }
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
                // A pi or OpenCode turn its ChatGPT account's usage limit
                // refused, by the error it ended on.
                if (
                  neutral.type === "result" &&
                  neutral.is_error &&
                  providerLimitRefused(neutral.errors ?? [])
                ) {
                  const [limited] = db.getInstancesByIds([message.instanceId]);
                  const provider = limited?.accountId
                    ? db.accounts.get(limited.accountId)?.provider
                    : undefined;
                  // Only a provider whose limits CawCo reads: its reset is
                  // known, so the session waits for it or moves.
                  if (
                    provider &&
                    provider !== CLAUDE_PROVIDER &&
                    LIMITED_PROVIDERS.includes(provider)
                  ) {
                    limitRefused.add(message.instanceId);
                  }
                }
                if (
                  neutral.type === "assistant" &&
                  !neutral.parent_tool_use_id
                ) {
                  // Claude Code ending the turn on its account's limit.
                  if ((neutral as { error?: string }).error === "rate_limit") {
                    limitRefused.add(message.instanceId);
                  }
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
                } else if (
                  neutral.type === "result" &&
                  limitRefused.delete(message.instanceId) &&
                  atLimit.manages(message.instanceId)
                ) {
                  // A turn its account's limit refused: nothing ended. The
                  // session is held, moved or continued; no report goes up,
                  // no rule answers it, and what a refused request says of
                  // the context is not the session's context.
                  finalMessage.delete(message.instanceId);
                  const refused = message.instanceId;
                  atLimit.turnRefused(refused).catch((error: unknown) => {
                    console.error(
                      `[at-limit] ${refused}: ${error instanceof Error ? error.message : String(error)}`
                    );
                  });
                } else if (neutral.type === "result") {
                  const [cacheRow] = db.getInstancesByIds([message.instanceId]);
                  if (cacheRow?.harness === "claude") {
                    db.updateKeepAlive(
                      cacheRow.id,
                      keepAliveResult(cacheRow, neutral, false)
                    );
                    // Real turns re-arm from their own request clock.
                    detach(keepAliveScheduler.wake(), "keepalive wake");
                    if (cacheRow.keepAliveEnabled) {
                      publishInstances(cacheRow.machineId);
                    }
                    // Near the limit, a summary is written ahead of it.
                    atLimit.turnEnded(cacheRow.id).catch((error: unknown) => {
                      console.error(
                        `[at-limit] ${cacheRow.id}: ${error instanceof Error ? error.message : String(error)}`
                      );
                    });
                  } else if (cacheRow) {
                    // A pi or OpenCode session's context, as its harness
                    // reported its last request.
                    if (neutral.contextTokens !== undefined) {
                      db.updateKeepAlive(cacheRow.id, {
                        contextTokens: neutral.contextTokens,
                        contextReadAt: new Date(),
                      });
                    }
                    // On an account: the same summary ahead of its limit.
                    if (cacheRow.accountId) {
                      atLimit.turnEnded(cacheRow.id).catch((error: unknown) => {
                        console.error(
                          `[at-limit] ${cacheRow.id}: ${error instanceof Error ? error.message : String(error)}`
                        );
                      });
                    }
                  }
                  // Its account changed during the turn (its model crossed a
                  // provider, or a person moved it): it moves now, at the
                  // turn's end.
                  // Its launch takes the move ({@link takeOwedMove}).
                  if (cacheRow && relaunchAtTurnEnd.has(cacheRow.id)) {
                    relaunchOnAccount(cacheRow.id);
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
                  // Every turn's end: its own row, by its key.
                  const [row] = db.listedInstancesByIds([message.instanceId]);
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
                  // Every turn of a work item's session counts against its
                  // budget, whatever answers it; one at the limit stops it.
                  if (row?.workItemId) {
                    workItems.countTurn(row);
                  }
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
                    // Nothing waits on whether a rule answered a turn that is not held.
                    detach(answered(), "rule answer");
                  }
                  // A plain session past one conversation is offered a project, once.
                  if (row && !failed) {
                    projectOffers.turnEnded(row.id);
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
                plans.observe(
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
                launchSettled(
                  message.instanceId,
                  "it failed",
                  processGeneration(process)
                );
                processFailed(
                  message.machineId,
                  message.instanceId,
                  peek(message.payload, "message") ?? "the session failed"
                );
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
                const peeked = peekFleetReport(message.payload);
                // A project-bound hook, MCP server or skill went out once per
                // place; the hub keeps one state per row, the worst of its places.
                const pathOf = placePathById();
                const report = peeked
                  ? {
                      ...peeked,
                      mcp: foldPlacedStates(peeked.mcp, pathOf) ?? peeked.mcp,
                      ...(peeked.skills
                        ? { skills: foldPlacedStates(peeked.skills, pathOf) }
                        : {}),
                      ...(peeked.hooks
                        ? { hooks: foldPlacedStates(peeked.hooks, pathOf) }
                        : {}),
                    }
                  : peeked;
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
                sendFrame(requester, message);
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
                // A parked ask goes out with its secrets hidden; the ledger
                // keeps the call as it was asked.
                registry.broadcast(clientCopy(message));
              }
              break;
            }
            default: {
              const fault = `unknown verb "${message.verb}": a machine sends register, heartbeat, frames or usage`;
              console.warn(`[hub] ${fault}, from ${message.machineId}`);
              sendFrame(ws, refusalFrame(message, fault));
            }
          }
        }),
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: releases each kind of machine-owned state when its socket goes away.
        close(ws) {
          closeLine(ws);
          const machineId = registry.dropAgent(ws.id);
          if (!machineId) {
            return;
          }
          // Sends to it wait for its next register, within the grace.
          awaitGrace(machineId, "agent");
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
            // A decision page is the hub's own; no machine serves it.
            if (
              target.machineId === machineId &&
              !("project" in target.source)
            ) {
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
          // A forget waiting on its stops: they are owed to its next register.
          projectStops.machineGone(machineId);
          // Its leads' turns are over: their threads stop reading `working`.
          caw.machineGone(machineId);
          db.reconcileInstances(machineId, []);
          publishInstances(machineId);
        },
      })
      .ws("/ws/dashboard", {
        // Offered to the browser; every frame to a dashboard then goes out
        // with the flag Bun compresses on (`openLine(ws, true)`).
        perMessageDeflate: true,
        // The same limit as the agent route: Bun's config is server-wide.
        maxPayloadLength: WIRE_MESSAGE_LIMIT_BYTES,
        drain(ws) {
          drainLine(ws);
        },
        open(ws) {
          // Before anything is sent to it: every frame goes through its line.
          openLine(ws, true);
          // A page names the wire it was built for (WIRE_PROTOCOL, 6). One
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
          sendFrame(ws, instancesFrame(""));
          // A reconnected dashboard earns the current sign-in state again.
          // The snapshot follows startup discovery on this socket.
          detach(
            mcpReady.then(async () => {
              await fleetMcp.ready();
              if (ws.readyState !== 1) {
                return;
              }
              sendFrame(ws, {
                verb: "frames",
                machineId: "",
                payload: { kind: "fleet_mcp", servers: db.fleetConfig().mcp },
              } satisfies Envelope<FramePayload>);
            }),
            "fleet snapshot"
          );
        },
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every dashboard socket message shape (stream protocol, control, send, ack) through one handler; splitting it would scatter the ordering guarantees across several functions.
        message: guardedDashboardMessage((ws, message) => {
          // The Ledger Protocol's own shapes are not envelopes and must be read
          // before the envelope check, which would otherwise log them as junk.
          if (streams.handleClientMessage(ws, message)) {
            return;
          }
          if (!isEnvelope(message)) {
            const fault = envelopeFault(message);
            console.warn(`[hub] dashboard ${fault}`, message);
            sendFrame(ws, refusalFrame(message, fault));
            return;
          }

          switch (message.verb) {
            case "spawn": {
              // A resume by a former id resumes its session by its id now.
              if (resumeFormer(ws, message)) {
                break;
              }
              // One launch at a time ({@link launches}); then the row's key,
              // not the client's — see `enforceRowSessionKey`.
              const refusal =
                (message.instanceId
                  ? inFlightRefusal(message.instanceId)
                  : undefined) ??
                enforceRowSessionKey(
                  message.instanceId
                    ? db.getInstancesByIds([message.instanceId])[0]
                    : undefined,
                  message.payload
                );
              if (refusal) {
                console.warn(`[hub] refused spawn: ${refusal}`);
                sendFrame(ws, failure(message, refusal));
                break;
              }
              // A spawn that names no model runs on its harness's own default
              // (Claude Code's, for its account): "no model picked" is the
              // field's absence, never an empty string. Its permission mode is
              // the one rule's (`settleMode`): explicit bypass when omitted for
              // a harness with modes, and none for one that has none.
              const { model: named, ...rest } = message.payload as SpawnPayload;
              const spawning: SpawnPayload = {
                ...rest,
                ...(named ? { model: named } : {}),
              };
              // pi's `default` is first named by what pi picks in the
              // session's directory, which its machine answers; every other
              // start goes on in this same step.
              if (asksPiDefault(spawning)) {
                piDefaultFor(message.machineId, spawning)
                  .then((asked) => startFromDashboard(ws, message, asked))
                  .catch((error: unknown) =>
                    sendFrame(
                      ws,
                      failure(
                        message,
                        error instanceof Error ? error.message : String(error)
                      )
                    )
                  );
              } else {
                startFromDashboard(ws, message, spawning);
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
            default: {
              // The client is named: a verb no build sends any more comes
              // from a page or app still running an older one.
              const fault = `unknown verb "${message.verb}": a dashboard sends spawn, stop, control or fs`;
              console.warn(
                `[hub] ${fault}, from ${ws.headers["user-agent"] ?? "a client with no user agent"} at ${ws.headers.origin ?? ws.remoteAddress}`
              );
              sendFrame(ws, refusalFrame(message, fault));
            }
          }
        }),
        close(ws) {
          closeLine(ws);
          registry.dropDashboard(ws);
          // Follows nothing, awaits nothing: a stream subscription and a command
          // ack both die with the socket that asked for them.
          streams.dropSocket(ws.id);
        },
      })
  );
};
