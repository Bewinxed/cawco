/**
 * The browser end of the Envelope spine: one WebSocket to the hub, and each
 * session's transcript as the hub built it — a page fetched once, then the
 * changes its stream carries (NEW.md §6).
 */
import type {
  Account,
  AccountBench,
  AccountCatalog,
  AccountHue,
  AccountKind,
  AccountProvider,
  AccountReading,
  AccountSignin,
  AccountSigninResult,
  AgentRow,
  AvailableCommand,
  BuildInfo,
  CanvasChoices,
  CawHarness,
  CawView,
  ChoiceChange,
  ClaudeLimits,
  CommandKind,
  ContinuationJob,
  ControlPayload,
  DelegateEvent,
  EffortLevel,
  Envelope,
  FramePayload,
  FsPayload,
  HarnessKind,
  InstanceRow,
  McpServerStatus,
  ModelInfo,
  MoveJob,
  NeutralSessionInfo,
  NeutralStatus,
  OnCap,
  OpenCodeGoLimits,
  PermissionMode,
  PermissionPresentation,
  PermissionResult,
  PermissionUpdate,
  PlacementPreview,
  ProjectCap,
  ProjectOfferSummary,
  ProjectSpend,
  ProjectStopFrame,
  ProjectView,
  ProviderChoice,
  ProviderRouting,
  ProviderSigninChallenge,
  ProviderSigninResult,
  RebalanceNotice,
  SendAttachment,
  SendPayload,
  SendRecord,
  SessionEffort,
  SessionPlan,
  SessionPulse,
  SessionStreamFrame,
  SessionTooling,
  SlashCommand,
  SpawnPayload,
  StopPayload,
  SupervisorEvent,
  SupportedCommands,
  ThreadMessage,
  ThreadRead,
  ThreadSaid,
  ThreadSummary,
  ToolGlance,
  TranscriptBlock,
  TranscriptBranch,
  TranscriptEvent,
  TranscriptFacts,
  TranscriptPage,
  TranscriptPageBranch,
  TranscriptTail,
  UsageLimitsReading,
  UsageLimitsResponse,
  UsageSpend,
  ViewData,
  WorkflowRun,
  WorkItemSummary,
} from "@cawco/core";
import {
  ASK_USER_QUESTION,
  CAWCO_SCRATCH_TAG,
  CONTROL_SUPPORTED_COMMANDS,
  capHolds,
  classifyCommand,
  isEffortLevel,
  questionsOf,
  RESOLVE_PERMISSION,
  relaunchOf,
  runDoing,
  WIRE_PROTOCOL,
} from "@cawco/core";
import { announcingParts, clientLine } from "@cawco/core/wire";
import {
  CONTROL_TIMEOUT_MS,
  DISCARD_TIMEOUT_MS,
  SESSION_CATALOG_LIMIT,
  TRANSCRIPT_OLDER_PAGE,
  WS_RECONNECT_BASE_DELAY,
  WS_RECONNECT_MAX_ATTEMPTS,
  WS_RECONNECT_MAX_DELAY,
} from "#lib/config.js";
import type { SubagentState } from "#lib/utils/flow-types.js";
import { browser } from "$app/env";
import { goto } from "$app/navigation";
import type { Activity } from "./activity";
import { activityOf, runningSubagents } from "./activity";
import { hubFailure } from "./hub-read";
import { newId } from "./id";
import {
  conversationHref,
  indexInstances,
  instanceForSession,
  transcriptUrl,
} from "./links";
import { notices } from "./notices.svelte";
import { unpickedMode } from "./permission-modes";
import { type HeldPlan, handlePlanMessage } from "./plan";
import { type PendingSelection, selectionExtras } from "./preview/selection";
import type { PreviewAsk } from "./preview/source";
import { send as askHub, json } from "./project-tasks";
import { placedOn } from "./projects";
import { type ReloadHold, reloadWhenIdle } from "./reload.svelte";
import { checkServedBuild } from "./served-build.svelte";
import { spawnDefaults } from "./spawnPrefs.svelte";
import type {
  CommandRecord,
  SettleStage,
  StreamEffects,
  StreamHost,
} from "./stream";
import {
  adoptPage,
  beginRead,
  createStreamState,
  disarmCommandSweep,
  failLocally,
  handleStreamMessage,
  latestCommand,
  noteDisconnect,
  resumePendingSends,
  SETTLED_COMMAND_LIMIT,
  SETTLED_COMMAND_TTL_MS,
  sessionCommands,
  submitCommand as submitTrackedCommand,
  subscribeSession,
  sweepCommands,
  syncStreamSubscriptions,
} from "./stream";
import {
  invalidateTasks,
  refreshTasks,
  TASK_LEDGER_TOOLS,
} from "./tasks.svelte";
import { inLists, isThreadTab, threadIdOf, threadRowOf } from "./thread-tabs";
import { toast } from "./toasts";
import { warmCompactionMark } from "./transcript/compaction-mark";
import {
  errorMessage,
  localUserMessage,
  withdrawnNote,
} from "./transcript/local";
import { routedToParent } from "./transcript/present";
import { holdsCompaction } from "./transcript/rows";
import type { DelegateAskEvent, Message } from "./types";
import { updates } from "./updates/updates.svelte";
import {
  onBoard,
  runIdOf,
  runMovedAt,
  runRowOf,
  runSince,
  stepTitle,
  stepUnderRun,
} from "./workflow-runs";
import {
  acceptWorkflowFrame,
  refreshWorkflows,
  workflowState,
} from "./workflow-state.svelte";
import { workspace } from "./workspace/workspace.svelte";

export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/**
 * What to *tell a reader* about the hub, which is coarser than the socket's own
 * state on purpose. `connecting` is the transient every cold load passes
 * through, and a dropped socket's first seconds of retrying, and is never a
 * fault; `unreachable` is one — the hub is a process on somebody's machine,
 * and it being off is the ordinary case, not the exotic one. It holds from
 * {@link OUTAGE_GRACE} after the socket went until the hub is back, through
 * every retry in between.
 */
export type HubState = "connected" | "connecting" | "unreachable";

/**
 * How long the hub is gone before the dashboard calls it unreachable. A drop
 * is most often a restart or a blip that the first retries answer within a
 * second or two, and surfaces that speak of an unreachable hub (the board's
 * empty state, a section's note) took a row each and gave it back, moving the
 * page twice for a hub that was never really away. The reconnect banner says
 * the socket is down from the first moment, over the page.
 */
const OUTAGE_GRACE = 4000;
let outageTimer: ReturnType<typeof setTimeout> | undefined;

/** A machine from the hub registry (`GET /api/agents`, and `instances` frames). */
export type Machine = AgentRow;

/** A session the hub knows about (`GET /api/instances`, and `instances` frames). */
export type { InstanceRow } from "@cawco/core";

/**
 * Where a project's files are (WORDS.md: place): a checkout on a machine, a
 * delegate's workspace while it lives, or the project's folder on the hub.
 */
export interface ProjectPlace {
  createdAt: string;
  id: string;
  /** The project's primary checkout: exactly one once it has any. */
  isPrimary: boolean;
  /** A `hub` place is the project's folder on the hub (machine `hub`, path `projects/<id>`). */
  kind: "checkout" | "workspace" | "hub";
  machineId: string;
  path: string;
  projectId: string;
}

/**
 * A project the hub knows about (`GET /api/projects`). `places` holds every
 * place, its primary checkout first, then its folder on the hub; read the
 * primary with `checkoutOf` (projects.ts).
 */
export interface ProjectRow {
  /** Its spend cap as it stands, kept by `project.cap` frames; null: none. */
  cap?: ProjectCap | null;
  /** Made with Caw: its Caw is on. */
  caw: boolean;
  createdAt: string;
  id: string;
  name: string;
  places: ProjectPlace[];
  /** Its primary checkout's id; null while it has none (a New project before its place is picked). */
  primaryPlaceId: string | null;
  /** The repository its checkouts are of, `host/owner/repo`; null when unknown. */
  remote: string | null;
}

/**
 * The minute, for what turns on a clock: a cap stops holding when its period
 * ends, with nothing said by the hub (project-caps.ts reads it the same way).
 */
const minute = $state({ now: Date.now() });
if (browser) {
  setInterval(() => {
    minute.now = Date.now();
  }, 30_000);
}

/** Only a session the hub can still reach is live; the rest is history. */
const isLive = (row: InstanceRow): boolean =>
  row.status === "running" || row.status === "starting";

/**
 * A session that stays on the board until the operator discards it: live work,
 * a real failure to look at, a nap to wake from, one the operator stopped, or
 * a row the hub simply cannot currently ask about — `unknown` is never dropped
 * just because its machine went quiet, the same way it is never rendered as
 * though nothing were wrong (see {@link isStale}). Only `discarded` is off
 * the board. `stopped` was left out here by omission, not by rule: a session
 * stopped from its row's menu then stood in no list at all, its menu and its
 * transcript out of reach. It has ended, so it is listed as ended sessions
 * are (Finished until seen, Recent, its project's tree).
 */
const isListed = (row: InstanceRow): boolean =>
  isLive(row) ||
  row.status === "error" ||
  row.status === "sleeping" ||
  row.status === "stopped" ||
  row.status === "unknown";

/**
 * A session whose owning machine the hub cannot currently reach — the
 * presence overlay's value (`withSessionPresence`, ARCHITECTURE.md), not a
 * guess of our own. It may still be running, sleeping, or gone on that
 * machine; the hub genuinely does not know, which is a different claim from
 * every other status and must never be flattened into "idle".
 */
export const isStale = (row: InstanceRow): boolean => row.status === "unknown";

/**
 * A session whose process is gone but whose conversation is not: sleeping, not
 * failed. Exactly the rows {@link ensureAlive} can bring back — dead, with an
 * SDK session to resume from. `sleeping` is the taxonomy's own word for this
 * now (ARCHITECTURE.md's status table) — the hub never reports it any other
 * way, so this reads the status directly rather than inferring it from
 * `lastError`. A `stopped` row with a session id is the other resumable case:
 * deliberately ended, but nothing stops it being picked back up.
 */
export const isResumable = (row: InstanceRow): boolean =>
  row.status === "sleeping" ||
  (row.status === "stopped" && Boolean(row.sessionId));

/**
 * A session that died of something, and is not coming back by being opened.
 * `error` now means exactly that — the taxonomy requires `lastError` to be set
 * whenever the hub asserts it — so there is no longer a resumable marker to
 * carve back out of it.
 */
export const isFailed = (row: InstanceRow): boolean => row.status === "error";

/**
 * A spin-off is history nobody asked for until they keep it, and the agent
 * tags its SDK session on the way out to say so. The tag is the whole test —
 * the directory a session ran in says nothing about whether it was a spin-off.
 */
const listedInHistory = (info: NeutralSessionInfo): boolean =>
  info.tag !== CAWCO_SCRATCH_TAG;

export interface PendingPermission {
  /**
   * When this device last heard the hub park it, in the order it hears
   * things ({@link askHeard}): a read of `/api/pending` asked for before
   * then cannot know of it, so it cannot unpark it.
   */
  heard: number;
  input: Record<string, unknown>;
  instanceId: string;
  /** What the ask says, as the hub read it parking it: the same words on every surface. */
  presentation: PermissionPresentation;
  /**
   * When the hub first parked the ask, ms epoch: one clock for every device,
   * so the wait each shows and the order it lists asks in agree.
   */
  raisedAt?: number;
  requestId: string;
  /** Set when the hub routed the ask to its parent rather than to the user. */
  routedTo?: "parent";
  suggestions?: PermissionUpdate[];
  /** A project lead's question: the thread it was asked in, where its answer lands. */
  threadId?: string;
  toolName: string;
  /**
   * The call the ask gates, as its message's `toolCallId`: while the ask is
   * parked on the composer, that call has no row in the transcript.
   */
  toolUseId?: string;
}

/** A permission parked anywhere in the fleet, with the context to act on it. */
export interface BlockedRequest {
  cwd: string;
  hostname: string;
  instanceId: string;
  machineId: string;
  request: PendingPermission;
  /**
   * The hub cannot reach the session's machine (its row reads `unknown`):
   * the ask still stands, but answering it waits for the machine.
   */
  stale: boolean;
}

/** Everything one session view needs — live or browsed from storage. */
/**
 * What the session's own context window looks like right now — the SDK's
 * `getContextUsage`, which is what Claude Code's `/context` reads. Categories
 * come through in the SDK's order and carry its colours; the dashboard shows
 * the numbers, not a second opinion about them.
 */
export interface ContextUsage {
  categories: { name: string; tokens: number; color: string }[];
  maxTokens: number;
  percentage: number;
  /** When this reading was taken, so a stale one can say so instead of lying. */
  readAt: number;
  totalTokens: number;
}

/**
 * What one session answers behind `/` (NEW.md §11), from its two sources: every
 * `system.init` lists the names and says which of them are skills, and
 * `supportedCommands` — asked once, when somebody first opens the menu — adds
 * the prose. Per instance, because two machines rarely have the same skills
 * installed and a session only ever offers its own.
 */
export interface CommandState {
  /** When the session last answered — the refresh throttle reads this. */
  at: number;
  /** Descriptions and argument hints, `null` until something has asked. */
  detailed: Map<string, SlashCommand> | null;
  /** Names as the session lists them, without the leading slash. */
  names: string[];
  /** The subset of `names` that are skills — {@link classifyCommand}'s evidence. */
  skills: string[];
}

/**
 * Why a transcript read ended with nothing to show. `offline` is the fleet's
 * own state — the machine the hub named is not connected — where `failed` is
 * a fault in the read; the pane says a different sentence for each, and reads
 * again when that machine is back.
 */
export type ReadFault =
  | { machineId: string; message: string; reason: "offline" }
  | { message: string; reason: "failed" };

export interface SessionState {
  /**
   * The main transcript as the hub built it, oldest first: every block it has
   * sent this view, sends drawn in their place. What is on screen,
   * {@link messages}, is these with this tab's own rows ({@link place}).
   */
  blocks: Message[];
  /** A turn is in flight (sent, no `result` yet). */
  busy: boolean;
  /** What this session offers behind `/` — see {@link commandsOf}. */
  commands: CommandState;
  /** A `supportedCommands` call is out; the names from `init` are the menu meanwhile. */
  commandsPending: boolean;
  /** The last context reading, `null` until one has been asked for. */
  context: ContextUsage | null;
  /** Why the last `getContextUsage` call was refused; null once one answers. */
  contextError: string | null;
  /** A `getContextUsage` call is out; the meter keeps its last number meanwhile. */
  contextPending: boolean;
  /** The main loop's tool in flight, cleared by its result or the turn's end. */
  currentTool: ToolGlance | null;
  /**
   * Where the page older than {@link blocks} begins: the `before` the hub
   * named, or null once the conversation's start is in hand.
   */
  cursor: string | null;
  cwd: string;
  /**
   * How hard that model thinks: what the session actually sends, as its agent
   * read it back and the hub wrote it on the row — a level, or `none` when it
   * sends no effort. `null` until the first reading lands.
   */
  effort: SessionEffort | null;
  /** Which harness owns {@link sessionId} — what a resume and a catalog read route on. */
  harness: HarnessKind;
  /** An older page of the transcript is being read: one at a time (see {@link readOlderPage}). */
  hydrating: boolean;
  /** The `system.init` banner is re-emitted every turn; render it once. */
  initialized: boolean;
  /** The id this view lives at: a spawned instance, or the SDK session browsed. */
  instanceId: string;
  lastActivityAt: Date | null;
  /**
   * What the last compaction did, from the `compact_boundary` the SDK emits when
   * one finishes. Kept on the session rather than only in the transcript so the
   * dock can say it happened without the reader scrolling to find the line.
   */
  lastCompaction: {
    at: number;
    preTokens: number;
    trigger: "manual" | "auto";
    result?: "success" | "failed";
    error?: string;
  } | null;
  /**
   * The last turn came back an error — the SDK's `is_error`, not a reading of
   * what it said. Paired with the machine's auth state, this is what tells a
   * "cannot answer" apart from an answer nobody liked.
   */
  lastTurnFailed: boolean;
  /** The newest page of the transcript is being fetched. */
  loading: boolean;
  /**
   * This tab's own sends the hub has not taken: on their way, or never
   * arrived. Each gives way to its block the moment the hub has it, as the
   * same row.
   */
  local: Message[];
  machineId: string;
  /** The session's MCP servers (`mcpServerStatus`), null until asked; [] when the ask failed or found none. */
  mcp: McpServerStatus[] | null;
  mcpPending: boolean;
  /**
   * What is on screen: {@link blocks} with this tab's failure lines among
   * them, then {@link queued}, then {@link local}. Only {@link place} writes it.
   */
  messages: Message[];
  /** Which model answers the next turn, learnt and corrected the same way. */
  model: string | null;
  /**
   * Failures this tab saw, each after the block that was last when it saw
   * it (null: before everything).
   */
  notes: { after: string | null; message: Message }[];
  /**
   * Why the last read of an older page failed, until it is asked for again.
   * Apart from {@link readFault}: the rows already read stay on screen, and
   * {@link cursor} stays where it was, so asking again asks for the same page.
   */
  olderFault: ReadFault | null;
  /**
   * Which content block the main loop has open right now, from the partials —
   * `null` between blocks and outside a turn. This is the only evidence of what
   * the session is doing while it does it, and the tail says nothing the
   * partials have not shown.
   */
  openBlock: "thinking" | "text" | "tool" | null;
  pending: PendingPermission[];
  /**
   * How the session answers tool permissions: named by every `system.init`,
   * moved optimistically by a switch and corrected by the init the next turn
   * opens with. `null` until something has said — see {@link adoptSettings}.
   */
  permissionMode: PermissionMode | null;
  /** The sends the session has not read yet, oldest first, as the hub placed them. */
  queued: Message[];
  /**
   * How the last transcript read ended, when it ended with nothing on screen.
   * Every read path sets this on a terminal failure and clears it when a read
   * starts, so a pane always has something to show for an empty transcript: a
   * hover-peek's backfill that timed out used to fail into `console.error`
   * and leave the pane on its loading state for the life of the tab.
   */
  readFault: ReadFault | null;
  /**
   * How many newest pages this view has taken. An older page is asked for
   * under one of them, and its answer is dropped when another has landed
   * since: it belongs to the transcript that read replaced.
   */
  reads: number;
  /** The hub's record of every send this view has heard of, by uuid. */
  records: Record<string, SendRecord>;
  /** Started again in place for a mode it could not switch into; ends at the next init. */
  relaunching: boolean;
  /** A spin-off (NEW.md §1) — kept visually apart until it is kept or discarded. */
  scratch: boolean;
  /**
   * The session's own word on what it is doing: `compacting` while it rewrites
   * its context — the only live signal, since the boundary frame lands after
   * the work — `requesting` while it waits on the model.
   */
  sdkStatus: NeutralStatus;
  /** The SDK session behind this view, once one is known. */
  sessionId: string | null;
  /** Partial assistant text, between `stream_event`s and the final message. */
  streaming: string;
  /** Subagent branches, keyed by the Task `tool_use_id` that spawned them. */
  subagents: Record<string, SubagentState>;
  /** The SDK signed the thinking block: it is wrapping up, not still going. */
  thinkingClosing: boolean;
  /**
   * When the open thinking block started, epoch ms. Measured at
   * `content_block_start`, consumed when the settled thinking message lands —
   * the one clock that survives "thinking then a tool call in one frame",
   * where both mapped messages share a timestamp and adjacency measures 0.
   */
  thinkingSince: number | null;
  /**
   * What the open thinking block has reasoned so far. Left standing when the
   * block closes — the trace stays readable until the transcript's own thinking
   * message supersedes it — and `''` for a redacted block, which streams
   * nothing and is still thinking.
   */
  thinkingStream: string;
  /**
   * The MCP servers and tools the session's newest `init` announced — the `/`
   * palette's servers and tools. Read from the hub's row when the view opens
   * (`GET /api/instances/:id/tooling`, beside the transcript read) and replaced
   * by every live `init` after that.
   */
  tooling: SessionTooling;
  /**
   * The cumulative cost the latest `result` frame reported, in dollars.
   * `undefined` until a turn has closed with one. Frames, not transcript
   * scraping: a successful turn's cost has no transcript line.
   */
  totalCost?: number;
  /**
   * When this stretch of work began, epoch ms, or `null` while the session is
   * idle. Stamped by the local send before a single frame has come back — the
   * wait for the first one is exactly the silence the transcript's presence line
   * exists to fill — and left alone for the rest of the turn, so a permission
   * answered halfway through does not restart the clock.
   */
  workingSince: number | null;
}

/**
 * Stored sessions per machine, newest first (`listSessions` through the
 * tunnel). Raw state: the catalogue is read whole and replaced whole, and a
 * deep proxy over its hundreds of rows was the 100ms+ flush every connect
 * paid for, with nothing ever mutating a row in place.
 */
let catalog = $state.raw<Record<string, NeutralSessionInfo[]>>({});
/** The machines whose stored sessions have been asked for and answered, or failed. */
const catalogsTried = $state<Record<string, true>>({});

/**
 * Every instance the hub knows, as immutable rows replaced whole — never
 * edited in place. Raw state: the fleet is ~a thousand rows, and a deep proxy
 * made every field read of every row a tracked signal, so a list render or a
 * lookup paid a proxy trap per row per field.
 */
let hubRows = $state.raw<InstanceRow[]>([]);
/** What a run is called: its workflow's name. */
const runName = (runId: string): string | undefined => {
  const run = workflowState.runs[runId];
  return run
    ? workflowState.workflows.find((each) => each.id === run.workflowId)?.name
    : undefined;
};
/**
 * The hub's rows with each workflow step hung under its run and called by
 * its step (workflow-runs.ts), so every reader of the rows nests and names
 * it the one way. A row that is not a step is the hub's own object.
 */
const instances = $derived(
  hubRows.map((row) =>
    stepUnderRun(
      row,
      row.workflowRunId ? runName(row.workflowRunId) : undefined
    )
  )
);
/**
 * Every workflow run as a session row (workflow-runs.ts): what the lists
 * nest, fold and archive it by, and what its tab is named and marked from.
 */
const runRows = $derived(
  Object.values(workflowState.runs).map((run) =>
    runRowOf(run, runName(run.id) ?? "Workflow")
  )
);
/** The runs the board lists, by the hub's window for sessions (`onBoard`). */
const boardRuns = $derived(runRows.filter((row) => onBoard(row, Date.now())));
/** What a thread's status says it is doing, in the fleet's words. */
const THREAD_DOING: Record<ThreadSummary["status"], Activity> = {
  working: "working",
  "needs-you": "blocked",
  ready: "idle",
};
/** The run a `run:` id names, when it is one this browser has. */
const runOf = (id: string): WorkflowRun | undefined => {
  const runId = runIdOf(id);
  return runId ? workflowState.runs[runId] : undefined;
};
/**
 * Every thread with a project's Caw as a session row (thread-tabs.ts): what
 * the rail lists, nests under and orders it by, and what its tab is named
 * from. Read with the fleet, kept by `thread.upsert` frames.
 */
const threadRows = $derived.by(() =>
  state.projects.flatMap((project) =>
    (state.threads[project.id] ?? []).map((thread) =>
      threadRowOf(thread, project)
    )
  )
);
/** Each thread by its id, for what a `thread:` tab or row asks of it. */
const threadsById = $derived.by(
  () =>
    new Map(
      Object.values(state.threads)
        .flat()
        .map((thread) => [thread.id, thread])
    )
);
/** The thread a `thread:` id names, when this browser has it. */
const threadOf = (id: string): ThreadSummary | undefined => {
  const threadId = threadIdOf(id);
  return threadId ? threadsById.get(threadId) : undefined;
};
/** The same rows looked up by id and by session, runs and threads among them, rebuilt once per change. */
const instanceIndex = $derived(
  indexInstances([...instances, ...runRows, ...threadRows])
);
const runningInstances = $derived(instances.filter(isLive));
/**
 * What a list shows running: sessions (a lead is its threads, thread-tabs.ts
 * `inLists`) and the threads Caw works on or waits on you in.
 */
const runningRows = $derived([
  ...inLists(runningInstances),
  ...threadRows.filter((row) => row.status === "running"),
]);
/** What a list shows of every listed session: as `runningRows`, with every thread. */
const listedRows = $derived([
  ...inLists(instances.filter(isListed)),
  ...threadRows,
]);
/** The sessions of every lead the hub knows: a list leaves their transcripts out too. */
const leadSessions = $derived<ReadonlySet<string>>(
  new Set(
    instances.flatMap((row) =>
      row.role === "lead" && row.sessionId ? [row.sessionId] : []
    )
  )
);
const staleInstances = $derived(instances.filter(isStale));
const listedInstances = $derived(instances.filter(isListed));

const state = $state({
  fleetMcp: null as import("@cawco/core").FleetMcpServer[] | null,
  previews: {} as Record<
    string,
    Extract<FramePayload, { kind: "preview" }> & {
      title?: string;
      path?: string;
      thumbnail?: string;
    }
  >,
  previewRequests: {} as Record<string, number>,
  status: "disconnected" as ConnectionStatus,
  /**
   * Whether an attempt has actually FAILED — the socket errored, or closed
   * without ever opening. A dashboard that has not tried yet reads
   * `disconnected` off the socket exactly like one whose attempt failed; this
   * says one came back empty-handed. Cleared on every open, so a healthy load
   * never carries a fault forward.
   */
  failed: false,
  /**
   * The hub has been gone for {@link OUTAGE_GRACE}: set by a timer the first
   * close starts, cleared on the next open. Retries in between leave it set.
   */
  outage: false,
  /**
   * This page was built for an older wire than the hub's, so it reads nothing
   * more off the socket ({@link olderThanHub}): `reloading` while its reload
   * is on the way, or what that reload is waiting on. Null on the hub's wire.
   */
  older: null as "reloading" | ReloadHold | null,
  /** When the next reconnect attempt fires, so the banner can count it down. */
  retryAt: null as number | null,
  /** The first REST read of the fleet (machines, sessions, projects) is in. */
  fleetRead: false,
  machines: [] as Machine[],
  /**
   * What the hub itself is running, carried on `instances` frames (C2 reads
   * it against every machine's own {@link Machine.build} — a hub older than
   * this field simply never sends it, and the comparison has nothing to say).
   */
  hubBuild: undefined as BuildInfo | undefined,
  /**
   * Sessions that have been handed work and have not yet taken a turn on it.
   * Keyed by the target: the question the rail answers is what *that* session
   * is carrying. A hand-off whose arrival is invisible is one you have to go
   * and check for, which is the thing it was supposed to replace.
   */
  handoffs: {} as Record<string, { from: string; at: number }>,
  /**
   * The continuations the hub is carrying, as it publishes them: what the
   * Continue dialog follows, and what opens the new session of one this tab
   * started after its dialog was dismissed.
   */
  continuations: [] as ContinuationJob[],
  /**
   * The project moves the hub is carrying (core move.ts), whole: handed on
   * connect in the `instances` frame, then replaced by each `moves` frame.
   */
  moves: [] as MoveJob[],
  projects: [] as ProjectRow[],
  /**
   * Each project's threads with its Caw, newest first, by project id: read
   * with the fleet, then kept by `thread.upsert` frames.
   */
  threads: {} as Record<string, ThreadSummary[]>,
  /**
   * The messages of each thread this tab has read, oldest first, by thread
   * id: kept by `thread.message` frames from the read on.
   */
  threadMessages: {} as Record<string, ThreadMessage[]>,
  /**
   * How many times each project's tasks have changed since this page
   * connected, by project id (`tasks.changed` frames): what shows its tasks
   * reads them again when it moves.
   */
  tasksChanged: {} as Record<string, number>,
  sessions: {} as Record<string, SessionState>,
  /**
   * Each instance's coarse now-state, pushed by the daemon ~1/sec (broadcast).
   * The rail reads this for sessions it has not subscribed to — the ones whose
   * frame-fed {@link SessionState} is either absent or frozen at the last frame
   * before the tab closed.
   */
  pulses: {} as Record<string, SessionPulse>,
  /**
   * When each session's current turn began, epoch ms, as its pulses tell it:
   * the `at` of the first pulse after an idle one that was not idle. Absent
   * while the session is idle. The fleet board orders a working session by
   * it, so a session keeps its place for as long as it works.
   */
  turnSince: {} as Record<string, number>,
  /**
   * When the hub parked each waiting workflow run's question, keyed by run
   * id: the `raisedAt` its ask carried. The run itself is the ask's only
   * representation, so the moment it was raised is kept beside it here.
   */
  runAskRaisedAt: {} as Record<string, number>,
  /**
   * The line that says an ask was withdrawn before it was answered (the
   * turn interrupted, the session gone), keyed by its request id. A
   * session's transcript draws it as a note; a thread, whose asks are its
   * lead's, reads it from here.
   */
  withdrawnAsks: {} as Record<string, Message>,
  /**
   * The socket's first full `instances` frame has landed: the hub's own
   * now-state (pulses) for every session is in, so "nothing is working" can
   * be believed. The REST read alone cannot say what is mid-turn.
   */
  liveRead: false,
  /**
   * The hub's record of every delegate's asks, answers and reports, keyed by
   * the delegate they are about and oldest first. Kept apart from the session
   * it belongs to because the reader of this traffic is the *parent* — a
   * delegate card renders its child's exchange, not its own.
   */
  delegateEvents: {} as Record<string, DelegateEvent[]>,
  /**
   * Every work item a parent's delegate tray has been told of, by item id:
   * read when the parent's view opens, then kept by `work_item` frames.
   */
  workItems: {} as Record<string, WorkItemSummary>,
  /**
   * "Make this a project" offers standing on plain sessions, by session id:
   * read on connect, then kept by `project_offer` frames.
   */
  projectOffers: {} as Record<string, ProjectOfferSummary>,
  /**
   * Each followed session's plan (plan.ts): its steps, its spec, an
   * attempt's to-dos, as the hub's `plan.snapshot` and `plan.delta` keep it.
   */
  plans: {} as Record<string, HeldPlan>,
  /**
   * The supervisor's intervention log, newest first, capped at 200 in memory
   * (PLAN §C9). Seeded from REST and kept live by `supervisor_event` frames.
   */
  supervisorEvents: [] as SupervisorEvent[],
  /**
   * The supervisor's live presence per session: `evaluating` from the hub's
   * transient status frame until the terminal event settles it; `settled`
   * carries the verdict briefly so the composer can pulse it. Never persisted,
   * never seeded from REST — this is strictly what is happening right now.
   */
  supervisorActivity: {} as Record<
    string,
    | { phase: "evaluating"; source: "rule" | "autopilot"; since: number }
    | { phase: "settled"; verdict: SupervisorEvent["verdict"]; at: number }
  >,
  /**
   * Each machine's latest Claude limit reading, by machineId — folded in from
   * the `kind: 'usage'` frame so the pill updates live rather than polling
   * (USAGE-SPEC.md §7.1). Empty until a machine has reported.
   */
  usageLimits: {} as Record<string, ClaudeLimits>,
  /** Each machine's OpenCode Go windows, from the same frame; absent on a machine with no Go key. */
  openCodeGoLimits: {} as Record<string, OpenCodeGoLimits>,
  /** The hub's limit readings have been read once, so an empty map means none, not not-yet. */
  usageLimitsRead: false,
  /**
   * The hub's accounts (`/api/accounts`): who they are, where each is signed
   * in, and each one's model catalog. Read on connect and after every
   * `kind: 'usage'` frame, which the hub sends when any of it moves.
   */
  accounts: null as AccountsView | null,
  /**
   * The account picker's rows (`/api/accounts/providers`): every provider
   * the fleet's machines know, each with how it signs in. Read with the
   * accounts; null until read.
   */
  accountProviders: null as ProviderChoice[] | null,
  /**
   * The fleet's spend as the hub reckons it (`/api/usage/spend`, then every
   * `kind: 'usage'` frame); null until it lands.
   */
  spend: null as UsageSpend | null,
  /** The last read of `/api/usage/spend` failed and no frame has answered since. */
  spendFailed: false,
});

interface Waiter {
  reject: (error: Error) => void;
  resolve: (result: unknown) => void;
}

/** Control calls awaiting their `control_result`, keyed by the SDK `requestId`. */
const inflight = new Map<string, Waiter>();

/**
 * Spawns the hub has not answered yet: the request each waits on, by the
 * instance it asked for. The hub refuses one with an error frame under that
 * request, and takes one by opening its row ({@link spawnSession}).
 */
const opening = new Map<string, string>();

/**
 * How long one transcript page request may go without an answer: the time to
 * its response, then again the time to read its body. Past it the request is
 * aborted and made once more ({@link readPage}); a phone on a flaky link
 * otherwise leaves a request hanging, and the pane waiting on it, forever.
 */
const TRANSCRIPT_READ_LIMIT_MS = 15_000;

/**
 * The newest-page read in flight per view: a second ask joins it. `cancel`
 * ends it without an answer — the view's own reader is asking for a fresh one.
 */
const pageReads = new Map<
  string,
  { read: Promise<TranscriptOutcome>; cancel: () => void }
>();

// Lets the store be asserted from the console while developing.
if (import.meta.env.DEV && typeof window !== "undefined") {
  Object.assign(globalThis, { __cawcoDebug: { state, inflight } });
}

// HMR-persistent socket references, so a module reload never leaves an orphan.
declare global {
  var __cawcoSocket: WebSocket | null;
  var __cawcoReconnectTimeout: ReturnType<typeof setTimeout> | null;
  var __cawcoReconnectAttempts: number;
  var __cawcoDisposing: boolean;
  /** The wake listeners are document-wide; bind them once across HMR reloads. */
  var __cawcoWakeBound: boolean;
}
globalThis.__cawcoSocket ??= null;
globalThis.__cawcoReconnectTimeout ??= null;
globalThis.__cawcoReconnectAttempts ??= 0;
globalThis.__cawcoDisposing ??= false;
globalThis.__cawcoWakeBound ??= false;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    globalThis.__cawcoDisposing = true;
    teardown();
  });
}

function abandonInflight(reason: string): void {
  for (const waiter of inflight.values()) {
    waiter.reject(new Error(reason));
  }
  inflight.clear();
}

function teardown(): void {
  // The ledger's ack timer is the one thing here that outlives the socket by
  // design, so it is the one thing a teardown has to cancel by hand — an HMR
  // reload that left it armed would fire a sweep into a module nobody renders.
  disarmCommandSweep(streamState, streamHost);
  cancelFleetRead();
  if (globalThis.__cawcoReconnectTimeout) {
    clearTimeout(globalThis.__cawcoReconnectTimeout);
    globalThis.__cawcoReconnectTimeout = null;
  }
  const socket = globalThis.__cawcoSocket;
  if (!socket) {
    return;
  }
  // Null the handlers first, or the close fires a reconnect we just cancelled.
  socket.onclose = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.close();
  globalThis.__cawcoSocket = null;
  abandonInflight("The connection to the hub closed before that finished.");
}

/** Mainline sessions the rail lists for one machine: live work and what stopped. */
const listedOn = (machineId: string): InstanceRow[] =>
  instances.filter(
    (row) =>
      row.machineId === machineId && isListed(row) && row.kind !== "scratch"
  );

/**
 * A session with nothing in it, and nothing registered anywhere.
 *
 * The store is a module singleton, so on the server it is shared by every
 * request — writing one reader's conversation into it would hand it to the
 * next. So the server never touches the store: `SessionPane` builds one of
 * these from its `load` data instead, renders the page out of it, and drops it
 * the moment the real store session has the conversation.
 */
export function blankSession(instanceId: string): SessionState {
  return {
    instanceId,
    machineId: "",
    cwd: "",
    sessionId: null,
    harness: "claude",
    blocks: [],
    queued: [],
    cursor: null,
    records: {},
    local: [],
    notes: [],
    messages: [],
    subagents: {},
    pending: [],
    streaming: "",
    openBlock: null,
    thinkingStream: "",
    thinkingClosing: false,
    thinkingSince: null,
    busy: false,
    workingSince: null,
    currentTool: null,
    lastActivityAt: null,
    loading: false,
    hydrating: false,
    readFault: null,
    olderFault: null,
    reads: 0,
    initialized: false,
    permissionMode: null,
    model: null,
    effort: null,
    relaunching: false,
    scratch: false,
    context: null,
    contextPending: false,
    contextError: null,
    commands: { names: [], skills: [], detailed: null, at: 0 },
    commandsPending: false,
    tooling: { servers: [], tools: [] },
    mcp: null,
    mcpPending: false,
    lastTurnFailed: false,
    sdkStatus: null,
    lastCompaction: null,
  };
}

function session(instanceId: string): SessionState {
  const existing = state.sessions[instanceId];
  if (existing) {
    return existing;
  }

  const created: SessionState = blankSession(instanceId);
  state.sessions[instanceId] = created;
  // Read it back: the literal above is the raw target, and `$state` writes land
  // on the proxy's signals, never on it. Handing out the raw object would give
  // callers a view the UI stops tracking the moment it first renders one.
  const target = state.sessions[instanceId];
  // A session this browser never opened — a permission replayed from `/api/pending`
  // is the usual way — still has to name its machine on the fleet view.
  hydrate(target);
  return target;
}

/**
 * THE ONE WRITER of what a session shows: the hub's blocks with this tab's
 * failure lines among them, then the sends waiting, then this tab's own sends
 * the hub has not taken.
 *
 * The list itself is kept wherever it changed only past its first row: the
 * transcript reads a kept list that changed as the conversation arriving, and
 * a new one as history.
 */
function place(target: SessionState): void {
  const current = target.messages;
  const next = [
    ...withNotes(target.blocks, target.notes),
    ...target.queued,
    ...target.local,
  ];
  let same = 0;
  while (
    same < current.length &&
    same < next.length &&
    current[same] === next[same]
  ) {
    same += 1;
  }
  if (same === current.length && same === next.length) {
    return;
  }
  // A change at the very first row is a different transcript — a read, a
  // page in front, a rewind to nothing — and takes a list of its own.
  if (same === 0 && current.length > 0) {
    target.messages = next;
    return;
  }
  current.splice(same, current.length - same, ...next.slice(same));
}

/** Whether two plain values say the same thing, field for field. */
function equal(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (!(a && b && typeof a === "object" && typeof b === "object")) {
    return false;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return (
    ak.length === bk.length &&
    ak.every((key) =>
      equal(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key]
      )
    )
  );
}

/**
 * A row on screen, moved to what the hub says it is now: the same object, so
 * the rows built on it stay put and only what changed is written — a tool
 * call taking its result, a send moving from waiting to read. A row this tab
 * drew from its own send keeps the pictures it sent: the hub names the same
 * ones by its media references, and trading one for the other would load
 * them all again.
 */
function adopt(held: Message, fresh: Message): void {
  if (held.type !== fresh.type) {
    held.type = fresh.type;
  }
  if (held.content !== fresh.content) {
    held.content = fresh.content;
  }
  if (held.state !== fresh.state) {
    held.state = fresh.state;
  }
  if (held.queued !== fresh.queued) {
    held.queued = fresh.queued;
  }
  if (held.sdkUuid !== fresh.sdkUuid) {
    held.sdkUuid = fresh.sdkUuid;
  }
  if (held.timestamp !== fresh.timestamp) {
    held.timestamp = fresh.timestamp;
  }
  if (held.toolCallId !== fresh.toolCallId) {
    held.toolCallId = fresh.toolCallId;
  }
  const drawn = held.metadata?.images;
  const pictures =
    drawn?.length === fresh.metadata?.images?.length &&
    drawn?.every((image) => image.src?.startsWith("data:"))
      ? { images: drawn }
      : {};
  const metadata = fresh.metadata && { ...fresh.metadata, ...pictures };
  if (!equal(held.metadata, metadata)) {
    held.metadata = metadata;
  }
}

/** The blocks with this tab's failure lines after the block each followed. */
function withNotes(blocks: Message[], notes: SessionState["notes"]): Message[] {
  if (notes.length === 0) {
    return blocks;
  }
  const after = new Map<string | null, Message[]>();
  for (const { after: anchor, message } of notes) {
    after.set(anchor, [...(after.get(anchor) ?? []), message]);
  }
  const placed = [...(after.get(null) ?? [])];
  for (const block of blocks) {
    placed.push(block, ...(after.get(block.id) ?? []));
  }
  return placed;
}

/** A failure this tab saw, said after whatever is last on screen now. */
function addNote(target: SessionState, message: Message): void {
  target.notes.push({ after: target.blocks.at(-1)?.id ?? null, message });
  place(target);
}

/** Takes the row `id` names out of `list`, and hands it over. */
function pull(list: Message[], id: string): Message | undefined {
  const at = list.findIndex((message) => message.id === id);
  return at < 0 ? undefined : list.splice(at, 1)[0];
}

/**
 * A block the hub sent, entering `into` as the object this view holds it
 * under. An id names one row, held by one list: a send goes from this tab's
 * own (`local`) to waiting (`queued`) to placed (`blocks`), and the list it
 * was in gives it up in the same step it enters the next. The object on
 * screen takes the hub's word in place, so the row stays where it is drawn.
 * This holds whatever the block is — the hub's row for the send, or the row
 * the harness stored under the send's own id.
 */
function take(
  target: SessionState,
  block: TranscriptBlock,
  into: "blocks" | "queued" | "removed"
): Message {
  const fresh = block as Message;
  const mine = pull(target.local, block.id);
  if (into === "removed") {
    return (
      pull(target.queued, block.id) ??
      pull(target.blocks, block.id) ??
      mine ??
      fresh
    );
  }
  const waiting =
    into === "blocks"
      ? pull(target.queued, block.id)
      : target.queued.find((message) => message.id === block.id);
  // A placed send the hub moves leaves `blocks` and comes back in one batch:
  // the row still on screen is the one it comes back as.
  const held =
    waiting ??
    mine ??
    (block.state
      ? target.messages.find(
          (message) => message.id === block.id && message.state
        )
      : undefined);
  if (!held) {
    return fresh;
  }
  adopt(held, fresh);
  return held;
}

/** A hub branch as this view holds it: its blocks, and the text it streams. */
function branchState(
  branch: TranscriptBranch,
  blocks: Message[],
  streaming: string
): SubagentState {
  return { ...branch, messages: blocks, streaming };
}

/** The branch a block names, created on first sight as the hub created it. */
function branchOf(target: SessionState, toolUseId: string): SubagentState {
  target.subagents[toolUseId] ??= branchState(
    {
      toolUseId,
      instanceId: target.instanceId,
      subagentType: "subagent",
      status: "starting",
      startedAt: new Date().toISOString(),
    },
    [],
    ""
  );
  return target.subagents[toolUseId];
}

/** The tail's fields the hub moved. */
function applyTail(target: SessionState, tail: Partial<TranscriptTail>): void {
  if (tail.busy !== undefined) {
    target.busy = tail.busy;
  }
  if (tail.currentTool !== undefined) {
    target.currentTool = tail.currentTool;
  }
  if (tail.openBlock !== undefined) {
    target.openBlock = tail.openBlock;
  }
  if (tail.streaming !== undefined) {
    target.streaming = tail.streaming;
  }
  if (tail.thinkingClosing !== undefined) {
    target.thinkingClosing = tail.thinkingClosing;
  }
  if (tail.thinkingSince !== undefined) {
    target.thinkingSince = tail.thinkingSince;
  }
  if (tail.thinkingStream !== undefined) {
    target.thinkingStream = tail.thinkingStream;
  }
  if (tail.streams) {
    for (const branch of Object.values(target.subagents)) {
      branch.streaming = tail.streams[branch.toolUseId] ?? "";
    }
  }
}

/**
 * What the session has said about itself. `live` is a change as it happened:
 * an `init` then also clears what belonged to the process before it, and a
 * turn ending or a compaction landing asks for a fresh context reading. A
 * page's facts state where things stand and set only what they name.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one assignment per fact the hub can move, each guarded by whether this change named it
function applyFacts(
  target: SessionState,
  facts: Partial<TranscriptFacts>,
  live: boolean
): void {
  if (facts.harness) {
    target.harness = facts.harness as HarnessKind;
  }
  if (facts.sessionId) {
    target.sessionId = facts.sessionId;
  }
  if (facts.model) {
    target.model = facts.model;
  }
  if (facts.permissionMode) {
    target.permissionMode = facts.permissionMode;
  }
  if (facts.commands) {
    const { names, skills, detailed } = facts.commands;
    target.commands = {
      ...target.commands,
      ...(names.length > 0 ? { names } : {}),
      ...(skills.length > 0 ? { skills } : {}),
      ...(detailed ? { detailed: detailsOf(detailed) } : {}),
    };
  }
  if (facts.tooling) {
    target.tooling = facts.tooling;
  }
  if (facts.initialized) {
    target.initialized = true;
  }
  if (facts.lastTurnFailed !== undefined) {
    target.lastTurnFailed = facts.lastTurnFailed;
  }
  if (facts.totalCost !== undefined && facts.totalCost !== null) {
    target.totalCost = facts.totalCost;
  }
  if (facts.sdkStatus !== undefined) {
    target.sdkStatus = facts.sdkStatus;
  }
  if (facts.lastCompaction !== undefined) {
    target.lastCompaction = facts.lastCompaction;
  }
  if (!live) {
    return;
  }
  if (facts.inits !== undefined) {
    // A relaunch can change the MCP set; null makes the header ask again.
    target.mcp = null;
    // The process behind a relaunch is up: this is the frame it opens with.
    target.relaunching = false;
    // Anything still parked belongs to a process that is gone: a permission
    // blocks the turn that asked it, so an `init` on top of pending questions
    // means the process holding their resolvers died.
    if (target.pending.length > 0) {
      target.pending = [];
    }
  }
  // The turn or the compaction just changed how full the window is; ask
  // rather than guess.
  if (
    (facts.turnsEnded !== undefined || facts.lastCompaction) &&
    target.machineId
  ) {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the change is already on screen, this refreshes the reading
    void refreshContext(target.instanceId, target.machineId);
  }
}

/**
 * The hub's record of one send, as it moved. Its row is the hub's to place;
 * this is what the tab's own bookkeeping reads: a send this tab made that
 * failed before the session read it is said where every failure of a send
 * this tab made is said, and the turn it took that send to start never
 * started.
 */
function noteRecord(target: SessionState, record: SendRecord): void {
  const held = target.records[record.uuid];
  target.records[record.uuid] = record;
  if (
    record.state === "failed" &&
    held?.state !== "read" &&
    commandRecord(record.uuid)
  ) {
    sendFailureNotices[target.instanceId] = record.reason
      ? `Message not sent: ${record.reason}`
      : "Message not sent.";
    target.busy = state.pulses[target.instanceId]?.busy ?? false;
  }
}

/** A block the hub moved, into the object this view holds it under. */
function updateBlock(target: SessionState, block: TranscriptBlock): void {
  const list = block.parentToolUseId
    ? target.subagents[block.parentToolUseId]?.messages
    : target.blocks;
  const held = list?.findLast((message) => message.id === block.id);
  if (!held) {
    return;
  }
  adopt(held, block as Message);
  // The ledger on disk just moved: what it now says is read back from the
  // files, never parsed out of here.
  if (TASK_LEDGER_TOOLS.has(block.metadata?.toolName ?? "")) {
    invalidateTasks(target.instanceId);
  }
}

/**
 * One batch of the hub's changes to a session's transcript, applied in the
 * order it made them. A `reset` ends the batch: the transcript was read again
 * from its machine, and the newest page carries everything after it.
 */
function applyTranscript(
  target: SessionState,
  events: TranscriptEvent[]
): void {
  for (const event of events) {
    switch (event.type) {
      case "reset":
        beginRead(streamState, target.instanceId);
        // biome-ignore lint/complexity/noVoid: fire-and-forget — the read adopts the page and resumes the stream when it lands
        void readTranscript(target.instanceId, true);
        place(target);
        return;
      case "block.append":
        if (event.block.parentToolUseId) {
          branchOf(target, event.block.parentToolUseId).messages.push(
            event.block as Message
          );
        } else {
          target.blocks.push(take(target, event.block, "blocks"));
        }
        break;
      case "block.insert": {
        const at =
          event.after === null
            ? 0
            : target.blocks.findLastIndex(
                (message) => message.id === event.after
              ) + 1;
        target.blocks.splice(at, 0, take(target, event.block, "blocks"));
        break;
      }
      case "block.update":
        updateBlock(target, event.block);
        break;
      case "block.remove": {
        const at = target.blocks.findLastIndex(
          (message) => message.id === event.id
        );
        if (at >= 0) {
          target.blocks.splice(at, 1);
        }
        break;
      }
      case "queue":
        target.queued = event.blocks.map((block) =>
          take(target, block, "queued")
        );
        break;
      case "branch": {
        const known = target.subagents[event.branch.toolUseId];
        target.subagents[event.branch.toolUseId] = branchState(
          event.branch,
          known?.messages ?? [],
          known?.streaming ?? ""
        );
        break;
      }
      case "tail":
        applyTail(target, event.tail);
        break;
      case "tail.append":
        if (event.streaming) {
          target.streaming += event.streaming;
        }
        if (event.thinking) {
          target.thinkingStream += event.thinking;
        }
        if (event.branch) {
          branchOf(target, event.branch.toolUseId).streaming +=
            event.branch.text;
        }
        break;
      case "facts":
        applyFacts(target, event.facts, true);
        break;
      case "send":
        noteRecord(target, event.record);
        break;
      default:
        break;
    }
  }
  place(target);
}

/**
 * A page of a transcript has been read, the first or an older one. One that
 * holds a compaction will draw Caw beside its divider, and his picture takes
 * longer to load than the rows take to be folded and revealed: it starts
 * here, with the data, so it is ready in the frame the list appears. A page
 * with none asks for nothing. The server builds sessions from pages too
 * (`seededSession`) and draws no pictures.
 */
function seesCompaction(page: TranscriptPage): void {
  if (browser && holdsCompaction(page.blocks)) {
    warmCompactionMark();
  }
}

/**
 * The newest page of a session's transcript, as what this view shows: the
 * hub's blocks, branches, waiting sends, live tail and facts replace what the
 * view held. What only this tab holds survives it: its own sends the hub has
 * not taken. The failure lines it saw belonged to the transcript it replaced.
 */
function adoptTranscriptPage(target: SessionState, page: TranscriptPage): void {
  const { where } = page;
  // The hub's word on machine and folder fills blanks only: a live row's own
  // values are already in place and are not walked back. The key is the one
  // thing a later resume is sent under, and the hub resolved it.
  target.machineId ||= where.machineId;
  target.cwd ||= where.cwd;
  target.harness = where.harness as HarnessKind;
  if (where.sessionKey) {
    target.sessionId = where.sessionKey;
  }
  seesCompaction(page);
  target.blocks = page.blocks.map((block) => take(target, block, "blocks"));
  target.queued = (page.queued ?? []).map((block) =>
    take(target, block, "queued")
  );
  target.notes = [];
  target.cursor = page.cursor;
  // A new newest page is a new read: an older page still on its way belongs
  // to the transcript this one replaced, and so does what was said of one.
  target.reads += 1;
  target.olderFault = null;
  const { tail } = page;
  target.subagents = Object.fromEntries(
    page.branches.map((branch) => [
      branch.toolUseId,
      pageBranch(branch, tail?.streams[branch.toolUseId] ?? ""),
    ])
  );
  if (tail) {
    applyTail(target, { ...tail, streams: undefined });
  }
  if (page.facts) {
    applyFacts(target, page.facts, false);
  }
  place(target);
}

/**
 * A session built from a transcript page alone, outside the store: what the
 * server renders for the pane its navigation loaded, and what that pane shows
 * until the store holds the conversation.
 */
export function seededSession(
  viewId: string,
  page: TranscriptPage
): SessionState {
  const seeded = blankSession(viewId);
  adoptTranscriptPage(seeded, page);
  return seeded;
}

/** A page's branch as this view holds it. */
function pageBranch(
  { blocks, ...branch }: TranscriptPageBranch,
  streaming: string
): SubagentState {
  return branchState(branch, blocks as Message[], streaming);
}

/** An older page, in front of what is on screen, with its branches. */
function prependTranscriptPage(
  target: SessionState,
  page: TranscriptPage
): void {
  seesCompaction(page);
  const known = new Set(target.blocks.map((block) => block.id));
  target.blocks = [
    ...page.blocks
      .filter((block) => !known.has(block.id))
      .map((block) => take(target, block, "blocks")),
    ...target.blocks,
  ];
  target.cursor = page.cursor;
  for (const branch of page.branches) {
    target.subagents[branch.toolUseId] ??= pageBranch(branch, "");
  }
  place(target);
}

/** Starts a session's turn clock at the first pulse that is not idle, and stops it at the idle one. */
function trackTurn(instanceId: string, pulse: SessionPulse): void {
  if (pulse.activity === "idle") {
    delete state.turnSince[instanceId];
  } else {
    state.turnSince[instanceId] ??= pulse.at;
  }
}

/** Fills in what the registry knows about a session this browser did not spawn. */
/**
 * The daemon's now-state, written onto the session it describes.
 *
 * `busy` and the running tool are otherwise learnt from the turn's own
 * frames — a delta, a tool starting, the turn ending — which is a complete
 * account only for a subscriber who was there for all of them. One that
 * joined while a tool was running has seen none, and would hold the session
 * as idle until the next delta. The pulse is built from the same state
 * machine, sent down the same ordered channel after the frames that changed
 * it, and broadcast to every tab, so it is never behind what this tab has
 * already applied: writing it is the same truth arriving by a second road.
 */
function applyPulse(target: SessionState, pulse: SessionPulse): void {
  target.busy = pulse.busy;
  if (!equal(target.currentTool, pulse.currentTool)) {
    target.currentTool = pulse.currentTool;
  }
}

function hydrate(target: SessionState): void {
  const pulse = state.pulses[target.instanceId];
  if (pulse) {
    applyPulse(target, pulse);
  }
  const known = instanceIndex.byId.get(target.instanceId);
  if (!known) {
    return;
  }
  adoptSettings(target, known);
  // The row is the authority on the key, whatever the view holds: a key that
  // arrives after the view opened — the usual case on a reload right after a
  // hub restart — has to reach the store, or the next resume goes out without.
  if (known.sessionId) {
    target.sessionId = known.sessionId;
  }
  if (target.machineId) {
    return;
  }
  target.machineId = known.machineId;
  target.cwd = known.cwd;
  // biome-ignore lint/suspicious/noUnnecessaryConditions: the cast doesn't make the field non-nullish at runtime — older rows really can lack a harness
  target.harness = (known.harness as HarnessKind) ?? "claude";
  target.scratch = known.kind === "scratch";
}

/**
 * Seeds the permission mode and model this view shows from what the hub stored.
 *
 * Precedence, highest first: the newest `system.init` — the session's own word,
 * re-emitted every turn, so it also corrects a setting changed by something that
 * is not this dashboard; then a switch this browser made and the daemon
 * confirmed, until that next init; then this row, which is all a view has before
 * the session's first turn; then the default the header falls back to. The row
 * therefore only ever fills a blank: it can be older than what the session has
 * since said, and a broadcast must not walk a live value back to it.
 */
function adoptSettings(target: SessionState, row: InstanceRow): void {
  // Only a spawn, a confirmed switch or an init ever wrote the column, so its
  // word on a mode is the SDK's — which is wider than the picker's four.
  if (target.permissionMode === null && row.permissionMode) {
    target.permissionMode = row.permissionMode as PermissionMode;
  }
  if (target.model === null && row.model) {
    target.model = row.model;
  }
  // Effort on the row is the agent's reading of what the session sends — its
  // own word, so it replaces what this view held rather than filling a blank.
  // Held back only while a switch made here is still on its way, whose
  // reading follows it.
  const switching = latestCommandFor(target.instanceId, "set-effort");
  if (
    row.effort &&
    switching?.stage !== "submitted" &&
    switching?.stage !== "accepted"
  ) {
    target.effort = row.effort;
  }
}

/**
 * Writes back a setting the session has confirmed, so the next cold load starts
 * from what it is running rather than from what this browser once asked for.
 * Only what the row does not already say — an init repeats itself every turn.
 */
async function persistSettings(
  instanceId: string,
  settings: {
    permissionMode?: PermissionMode;
    model?: string;
  }
): Promise<void> {
  const row = instanceIndex.byId.get(instanceId);
  if (!row) {
    return;
  }

  const patch: typeof settings = {};
  if (
    settings.permissionMode &&
    settings.permissionMode !== row.permissionMode
  ) {
    patch.permissionMode = settings.permissionMode;
  }
  if (settings.model && settings.model !== row.model) {
    patch.model = settings.model;
  }
  if (Object.keys(patch).length === 0) {
    return;
  }

  try {
    const response = await fetch(`/api/instances/${instanceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
  } catch (error) {
    // The session is already answering this way; only the row is behind, and
    // the next init will try again — nothing the reader needs to act on.
    console.error(`[cawco] persisting ${instanceId} settings failed:`, error);
  }
}

/** Opens a session's view state — the route's half of arriving at `/session/[id]`. */
export function openSession(instanceId: string): void {
  hydrate(session(instanceId));
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the view is already hydrated, delegate events fill in when they land
  void loadDelegateEvents(instanceId);
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the tray fills in when the read lands
  void loadWorkItems(instanceId);
  // Opening a view is the moment its frames become this browser's to render.
  // (The subscription effect in the route layout already names its tab; this makes
  // the direct route the only trigger the store needs to know about.)
  syncSubscriptions();
}

/** Views whose delegates' traffic has been read back — it is read once. */
const delegatesRead = new Set<string>();

/**
 * What this session's delegates asked it, and what it answered, before the tab
 * opened. Broadcast as it happens *and* readable here, for the same reason the
 * hand-offs are: an exchange that settled an hour ago is still the record, and
 * a settled ask is never pushed again. A read that fails leaves the delegate
 * cards on the transcript markers, and the next open tries again.
 */
async function loadDelegateEvents(instanceId: string): Promise<void> {
  if (delegatesRead.has(instanceId)) {
    return;
  }
  delegatesRead.add(instanceId);
  const events = await load<DelegateEvent[]>(
    `/api/delegate-events?parent=${instanceId}`
  );
  if (!events) {
    delegatesRead.delete(instanceId);
    return;
  }
  for (const event of events) {
    recordDelegateEvent(event);
  }
}

/** Views whose delegate tray has been read — frames keep it after that. */
const trayRead = new Set<string>();

/** The work items a view's delegate tray opens with (`GET /api/work-items`). */
async function loadWorkItems(instanceId: string): Promise<void> {
  if (trayRead.has(instanceId)) {
    return;
  }
  trayRead.add(instanceId);
  const items = await load<WorkItemSummary[]>(
    `/api/work-items?parent=${instanceId}`
  );
  if (!items) {
    trayRead.delete(instanceId);
    return;
  }
  for (const item of items) {
    state.workItems[item.id] = item;
  }
}

/** Takes a chip off its tray on every screen: the hub records the dismissal. */
export async function dismissWorkItem(id: string): Promise<void> {
  const response = await fetch(
    `/api/work-items/${encodeURIComponent(id)}/dismiss`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the delegate was not dismissed.`
    );
  }
  const item = (await response.json()) as WorkItemSummary;
  state.workItems[item.id] = item;
}

async function load<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error(`[cawco] ${path} failed:`, error);
    return null;
  }
}

/**
 * Takes the hub's word on what is running — whether it was asked for or pushed.
 * Views this browser opened for a session it did not spawn learn their machine
 * from it, so a snapshot is also how a bare `/session/[id]` fills itself in.
 */
function adoptInstances(rows: InstanceRow[]): void {
  const next = reconcileRows(hubRows, rows, (row) => row.id);
  if (next === hubRows) {
    return;
  }
  hubRows = next;
  for (const target of Object.values(state.sessions)) {
    hydrate(target);
  }
}

/** A snapshot keeps unchanged rows and, when nothing moved, the list itself. */
function reconcileRows<T>(
  current: T[],
  incoming: T[],
  key: (row: T) => string
): T[] {
  const known = new Map(current.map((row) => [key(row), row]));
  const next = incoming.map((row) => {
    const held = known.get(key(row));
    return held && equal(held, row) ? held : row;
  });
  return current.length === next.length &&
    current.every((row, i) => row === next[i])
    ? current
    : next;
}

/** A delta keeps all absent rows; an empty or identical patch is a no-op. */
function patchRows<T>(
  current: T[],
  upserts: T[],
  removed: string[],
  key: (row: T) => string
): T[] {
  if (upserts.length === 0 && removed.length === 0) {
    return current;
  }
  const gone = new Set(removed);
  const next = current.filter((row) => !gone.has(key(row)));
  const at = new Map(next.map((row, i) => [key(row), i]));
  for (const row of upserts) {
    const i = at.get(key(row));
    if (i === undefined) {
      at.set(key(row), next.length);
      next.push(row);
    } else if (!equal(next[i], row)) {
      next[i] = row;
    }
  }
  return current.length === next.length &&
    current.every((row, i) => row === next[i])
    ? current
    : next;
}

/**
 * Applies what moved since the hub's last publish: each changed row replaced
 * where it stands (or appended), each gone id dropped. Only the sessions whose
 * rows moved are re-hydrated, and the rows that did not move keep their
 * identity — so the rail, tabs and panes re-render the one row that changed
 * instead of all of them.
 */
function patchInstances(upserts: InstanceRow[], removed: string[]): void {
  const next = patchRows(hubRows, upserts, removed, (row) => row.id);
  if (next === hubRows) {
    return;
  }
  hubRows = next;
  for (const row of upserts) {
    const held = state.sessions[row.id];
    if (held) {
      hydrate(held);
    }
  }
}

/** Replaces both limits maps with the hub's word — a full snapshot, not a patch. */
function adoptUsageLimits(
  readings: {
    machineId: string;
    limits: ClaudeLimits;
    openCodeGo: OpenCodeGoLimits | null;
  }[]
): void {
  const claude: Record<string, ClaudeLimits> = {};
  const openCodeGo: Record<string, OpenCodeGoLimits> = {};
  for (const reading of readings) {
    claude[reading.machineId] = reading.limits;
    if (reading.openCodeGo) {
      openCodeGo[reading.machineId] = reading.openCodeGo;
    }
  }
  if (!equal(state.usageLimits, claude)) {
    state.usageLimits = claude;
  }
  if (!equal(state.openCodeGoLimits, openCodeGo)) {
    state.openCodeGoLimits = openCodeGo;
  }
  state.usageLimitsRead = true;
}

function adoptSpend(spend: UsageSpend): void {
  if (!equal(state.spend, spend)) {
    state.spend = spend;
  }
  state.spendFailed = false;
}

/**
 * Reads the fleet's spend from the hub: on connect, and again when a reader
 * asks after a failed read. A failed read drops the figure and says so
 * (`spendFailed`); nothing here estimates one.
 */
export async function readSpend(): Promise<void> {
  const spend = await load<UsageSpend>("/api/usage/spend");
  if (spend) {
    adoptSpend(spend);
  } else {
    state.spend = null;
    state.spendFailed = true;
  }
}

/** What `/api/accounts` answers. */
export interface AccountsView {
  accounts: Account[];
  /** Accounts out of placement until a window resets. */
  bench: AccountBench[];
  catalogs: AccountCatalog[];
  /** Each account's freshest reading: its windows, plan and extra usage. */
  readings: AccountReading[];
  /** What adding an account (or one back from its bench) set moving, newest first. */
  rebalances: RebalanceNotice[];
  /** How each provider's new sessions choose among its accounts. */
  routing: ProviderRouting[];
  signins: AccountSignin[];
}

/** Who hears the hub's accounts signal (see {@link followAccounts}). */
let accountsFollower: (() => void) | null = null;

/**
 * Calls `follower` each time the hub says an account moved (a reading, a
 * sign-in, a catalog), and on connect: the usage forecast's reader
 * (usage/forecast.svelte.ts) reads again then. One follower.
 */
export function followAccounts(follower: () => void): void {
  accountsFollower = follower;
}

/**
 * Reads the hub's accounts of every provider, their sign-ins and catalogs,
 * and the providers the fleet's machines know; a failed read keeps what was
 * there.
 */
export async function readAccounts(): Promise<void> {
  accountsFollower?.();
  const [view, providers] = await Promise.all([
    load<AccountsView>("/api/accounts"),
    load<ProviderChoice[]>("/api/accounts/providers"),
  ]);
  if (view && !equal(state.accounts, view)) {
    state.accounts = view;
  }
  if (providers && !equal(state.accountProviders, providers)) {
    state.accountProviders = providers;
  }
}

/**
 * One write to the accounts routes. A refusal is thrown in the hub's own
 * sentence, which is written for people; the accounts are read again after
 * every write that landed, since only a sign-in makes the hub say so.
 */
async function accountsWrite<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown
): Promise<T> {
  const response = await fetch(url, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) || `The hub answered ${response.status}.`
    );
  }
  const answer = (await response.json()) as T;
  await readAccounts();
  return answer;
}

/** Adds an account; it goes last in its provider's fill-first order. */
export const createAccount = (body: {
  kind: AccountKind;
  provider: AccountProvider;
  hue?: AccountHue;
  label?: string;
}): Promise<Account> => accountsWrite("/api/accounts", "POST", body);

/** Changes an account's nickname (null: its email), colour, order or limits. */
export const patchAccount = (
  id: string,
  patch: {
    hue?: AccountHue;
    label?: string | null;
    neverBackup?: boolean;
    order?: number;
    reservePct?: number | null;
  }
): Promise<Account> =>
  accountsWrite(`/api/accounts/${encodeURIComponent(id)}`, "PATCH", patch);

/** Removes an account, signing it out on every machine signed in to it. */
export const deleteAccount = (id: string): Promise<{ ok: true }> =>
  accountsWrite(`/api/accounts/${encodeURIComponent(id)}`, "DELETE");

/** Sets how a provider's new sessions choose among its accounts. */
export const putRouting = (
  provider: AccountProvider,
  routing: Omit<ProviderRouting, "provider">
): Promise<ProviderRouting> =>
  accountsWrite(
    `/api/accounts/routing/${encodeURIComponent(provider)}`,
    "PUT",
    routing
  );

const signinUrl = (id: string, machineId: string) =>
  `/api/accounts/${encodeURIComponent(id)}/machines/${encodeURIComponent(machineId)}/signin`;

/** Starts Claude Code's own login for the account on a machine: the link to open. */
export const beginSignin = (
  id: string,
  machineId: string
): Promise<{ url: string }> => accountsWrite(signinUrl(id, machineId), "POST");

/** Types the pasted code into that login: signed in, or someone else's account. */
export const completeSignin = (
  id: string,
  machineId: string,
  code: string
): Promise<AccountSigninResult> =>
  accountsWrite(`${signinUrl(id, machineId)}/complete`, "POST", { code });

/**
 * Starts a provider's own OAuth sign-in for the account on a machine: a
 * device code to enter on any device, where, and until when.
 */
export const beginDeviceSignin = (
  id: string,
  machineId: string
): Promise<ProviderSigninChallenge> =>
  accountsWrite(signinUrl(id, machineId), "POST");

/**
 * Waits up to a minute for the device code to be entered: signed in, as
 * someone else, expired, or still pending (ask again).
 */
export const awaitDeviceSignin = (
  id: string,
  machineId: string
): Promise<ProviderSigninResult> =>
  accountsWrite(`${signinUrl(id, machineId)}/complete`, "POST", {});

/**
 * Signs an account out on one machine and drops its store there; the hub
 * refuses a machine that is offline (409) or not signed in (404).
 */
export const signOutOn = (id: string, machineId: string): Promise<unknown> =>
  accountsWrite(
    `/api/accounts/${encodeURIComponent(id)}/machines/${encodeURIComponent(machineId)}`,
    "DELETE"
  );

/** What sending a key came to on one machine: its result, or why it didn't arrive. */
export type KeyDelivery =
  | { machineId: string; result: ProviderSigninResult }
  | { machineId: string; error: string };

/** Relays a key account's key to each machine named; the hub never keeps it. */
export const sendAccountKey = (
  id: string,
  key: string,
  machineIds: string[]
): Promise<{ machines: KeyDelivery[] }> =>
  accountsWrite(`/api/accounts/${encodeURIComponent(id)}/key`, "POST", {
    key,
    machineIds,
  });

/**
 * Which account a session would start on, why, and the model it was read for
 * as the session would start on it in `cwd` (`/api/accounts/placement`).
 * Undefined when it cannot be read; a refusal is thrown in the hub's words:
 * no account can take it (400), or the machine could not say which model pi
 * starts on in that folder (503), either of which refuses the start too.
 */
export async function placementFor(query: {
  cwd?: string;
  harness: string;
  machineId: string;
  model?: string;
  projectId?: string;
}): Promise<PlacementPreview | undefined> {
  const params = new URLSearchParams(
    Object.entries(query).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );
  const response = await fetch(`/api/accounts/placement?${params}`);
  if (response.status === 400 || response.status === 503) {
    throw new Error(await response.text());
  }
  return response.ok
    ? ((await response.json()) as PlacementPreview)
    : undefined;
}

/** The `kind: 'usage'` frame's readings, in the shape `/api/usage/limits` serves. */
const usageLimitReadings = (readings: UsageLimitsReading[]) =>
  readings.map((reading) => ({
    machineId: reading.machineId,
    limits: reading.payload,
    openCodeGo: reading.openCodeGo,
  }));

/** Who hears the continuation table each time it moves (see {@link followContinuations}). */
let continuationFollower: ((table: ContinuationJob[]) => void) | null = null;

/**
 * Hands `follower` the continuation table every time the hub's word on it
 * lands — a publish, or the read on connect. One follower: the Continue
 * flow's (continue.svelte.ts).
 */
export function followContinuations(
  follower: (table: ContinuationJob[]) => void
): void {
  continuationFollower = follower;
}

function adoptContinuations(table: ContinuationJob[]): void {
  if (equal(state.continuations, table)) {
    return;
  }
  state.continuations = table;
  continuationFollower?.(table);
}

/**
 * The order this device hears the hub's word on asks in: each ask parked and
 * each ask settled takes the next number. A read of `/api/pending` notes the
 * number it was asked for at, and what was heard after that is newer than it.
 */
let askHeard = 0;
const hearAsk = (): number => {
  askHeard += 1;
  return askHeard;
};
/** The asks heard settled, by request id, with when; the oldest go past a few hundred. */
const askSettledHeard = new Map<string, number>();
const SETTLED_HEARD_KEPT = 512;
const hearSettled = (requestId: string): void => {
  askSettledHeard.delete(requestId);
  askSettledHeard.set(requestId, hearAsk());
  if (askSettledHeard.size > SETTLED_HEARD_KEPT) {
    const [oldest] = askSettledHeard.keys();
    askSettledHeard.delete(oldest);
  }
};

/**
 * The hub's parked asks as `/api/pending` answered, read when `readFrom` was
 * heard. The read is the whole truth as of then: an ask settled while this
 * tab was away sent its `permission_settled` to nobody listening. What the
 * socket said since is newer than the read: an ask parked meanwhile (a
 * restarted hub hearing its agents replay theirs) stays, and one settled
 * meanwhile is not put back.
 */
function adoptPending(
  pending: Envelope<FramePayload>[],
  readFrom: number
): void {
  const parked = new Set(pending.map((envelope) => envelope.requestId));
  const stands = (p: PendingPermission): boolean =>
    parked.has(p.requestId) || p.heard > readFrom;
  for (const target of Object.values(state.sessions)) {
    if (!target.pending.every(stands)) {
      target.pending = target.pending.filter(stands);
      trackWorking(target);
    }
  }
  for (const envelope of pending) {
    if ((askSettledHeard.get(envelope.requestId ?? "") ?? 0) <= readFrom) {
      handleFrame(envelope.payload);
    }
  }
}

/**
 * Registry reads: on connect and again after every reconnect. True once the
 * three reads the board waits on (machines, sessions, projects) all landed.
 */
async function refresh(): Promise<boolean> {
  // Registry hydration also recovers workflow transitions missed while disconnected.
  refreshWorkflows();
  // Same reason as the limits below: the frames that carry spend come once a
  // minute per machine, and a dashboard opened between them has none yet.
  readSpend();
  readAccounts();
  // Off the board's wait: an offer is a quiet card, not part of the fleet.
  readProjectOffers();
  // Every project's threads, for the rail; frames keep them from here.
  readThreads();
  // What the socket says about asks from here on is newer than the read.
  const readFrom = askHeard;
  const [machines, rows, projects, pending, handoffs, usage, continuations] =
    await Promise.all([
      load<Machine[]>("/api/agents"),
      load<InstanceRow[]>("/api/instances"),
      load<ProjectRow[]>("/api/projects"),
      load<Envelope<FramePayload>[]>("/api/pending"),
      // Read on connect, not only broadcast on change: a dashboard opened after
      // a hand-off went out has missed every broadcast it will ever get.
      load<Record<string, { from: string; at: number }>>("/api/handoffs"),
      // Same reason: a dashboard opened between reports has missed the frames.
      load<UsageLimitsResponse>("/api/usage/limits"),
      // Same reason: a continuation that moved while this tab was away.
      load<ContinuationJob[]>("/api/continuations"),
    ]);

  if (handoffs && !equal(state.handoffs, handoffs)) {
    state.handoffs = handoffs;
  }
  if (continuations) {
    adoptContinuations(continuations);
  }
  if (machines) {
    adoptMachines(machines);
  }
  if (projects) {
    state.projects = reconcileRows(state.projects, projects, (row) => row.id);
  }
  if (rows) {
    adoptInstances(rows);
  }
  if (usage) {
    adoptUsageLimits(usage.machines);
  }
  if (pending) {
    adoptPending(pending, readFrom);
  }
  if (machines && rows && projects) {
    state.fleetRead = true;
    return true;
  }
  return false;
}

/** The pending re-read of `readFleet`; one chain per socket at most. */
let fleetRetry: ReturnType<typeof setTimeout> | undefined;
/** Bumped by every read and every cancel, so a read still in flight from an
 * older socket cannot schedule a second chain when it lands. */
let fleetChain = 0;

/** A socket that closed, or one about to be replaced, takes its re-read with it. */
function cancelFleetRead(): void {
  clearTimeout(fleetRetry);
  fleetRetry = undefined;
  fleetChain += 1;
}

/**
 * The connect-time read. A deploy restarts the hub and the dashboard together,
 * and the socket can reopen through the dashboard before the hub answers REST:
 * those reads fail, and nothing else would read again until the next reconnect.
 * So while the socket stays open it reads again — 1s, 2s, 4s, 8s, then every
 * 10s — until the board's reads land, and only then asks for the catalogs.
 */
function readFleet(delay = 1000): void {
  cancelFleetRead();
  const chain = fleetChain;
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the socket is already marked connected, the fleet state fills in when it lands
  void refresh().then((read) => {
    if (chain !== fleetChain) {
      return;
    }
    if (read) {
      refreshCatalogs();
      return;
    }
    if (globalThis.__cawcoSocket?.readyState !== WebSocket.OPEN) {
      return;
    }
    fleetRetry = setTimeout(
      () => readFleet(Math.min(delay * 2, 10_000)),
      delay
    );
  });
}

/** Every online machine's stored sessions — the sidebar's contents on arrival. */
function refreshCatalogs(): void {
  for (const machine of state.machines) {
    if (machine.status === "online") {
      // biome-ignore lint/complexity/noVoid: fire-and-forget — every machine's catalog loads independently, none block the others
      void loadCatalog(machine.machineId);
    }
  }
}

/**
 * The hub's word on the machines, pushed with every `instances` frame. A
 * machine that comes online after the connect-time read has its stored
 * sessions read now: `refreshCatalogs` only asks the machines that were online
 * when that read landed. A hub restart is the usual case — its daemons take a
 * few seconds to register again, so a dashboard that connects in that window
 * reads every machine offline, and the board's first-read gate
 * (`cawco.catalogsRead`) then waits on catalogs nobody ever asked for.
 */
function adoptMachines(incoming: Machine[]): void {
  const next = reconcileRows(state.machines, incoming, (row) => row.machineId);
  if (next === state.machines) {
    return;
  }
  const wasOnline = new Set(
    state.machines
      .filter((machine) => machine.status === "online")
      .map((machine) => machine.machineId)
  );
  state.machines = next;
  // Before the first read the connect-time `refreshCatalogs` asks them all.
  if (!state.fleetRead) {
    return;
  }
  for (const machine of next) {
    if (machine.status === "online" && !wasOnline.has(machine.machineId)) {
      // biome-ignore lint/complexity/noVoid: fire-and-forget — the catalog lands in the store the board reads
      void loadCatalog(machine.machineId);
    }
  }
}

/** Answers the promise a `requestId` belongs to; false when nobody is waiting. */
function settle(
  requestId: string | undefined,
  answer: (waiter: Waiter) => void
): boolean {
  if (!requestId) {
    return false;
  }
  const waiter = inflight.get(requestId);
  if (!waiter) {
    return false;
  }
  inflight.delete(requestId);
  answer(waiter);
  return true;
}

/** The hub's delegate-traffic push (`publishDelegateEvent`, packages/hub). */
function delegateEventOf(frame: FramePayload): DelegateEvent | null {
  return frame.kind === "delegate_event" ? frame.event : null;
}

/**
 * Files one of the hub's delegate events into a delegate's list, kept in row
 * order. An answer also settles the ask it belongs to: a settled ask is never
 * re-broadcast, so a reader watching the exchange live has only this to learn
 * the verdict from — the next fresh read carries it on the ask itself.
 */
function foldDelegateEvent(list: DelegateEvent[], event: DelegateEvent): void {
  // Both sources deliver the same rows — the read on arrival and the pushes
  // that follow it overlap by however long the read was out.
  if (list.some((row) => row.id === event.id)) {
    return;
  }
  const after = list.findIndex((row) => row.id > event.id);
  if (after === -1) {
    list.push(event);
  } else {
    list.splice(after, 0, event);
  }
  if (event.kind !== "answer" || !event.requestId) {
    return;
  }
  const asked = list.find(
    (row) => row.kind === "ask" && row.requestId === event.requestId
  );
  if (asked) {
    asked.status = event.payload.behavior === "deny" ? "denied" : "answered";
  }
}

/**
 * Folds the hub's pulse snapshot (`instancesFrame.pulses`) into the client's
 * own pulse map. A merge, not a replace: a per-instance `pulse` frame is not
 * ordered against a snapshot the hub took moments before the `instances`
 * frame carrying it left, so whichever pulse actually happened later, by its
 * own `at`, is the one kept.
 */
function mergePulses(
  current: Record<string, SessionPulse>,
  incoming: Record<string, SessionPulse> | undefined
): Record<string, SessionPulse> {
  if (!incoming) {
    return current;
  }
  let next = current;
  for (const [instanceId, pulse] of Object.entries(incoming)) {
    const existing = next[instanceId];
    if ((!existing || pulse.at >= existing.at) && !equal(existing, pulse)) {
      if (next === current) {
        next = { ...current };
      }
      next[instanceId] = pulse;
    }
  }
  return next;
}

/** Files one event under the delegate it is about, pushed or freshly read. */
function recordDelegateEvent(event: DelegateEvent): void {
  // Written, then read back: a `$state` write lands on the proxy and never on
  // the literal, so folding into the literal would file the row where the UI
  // cannot see it.
  state.delegateEvents[event.instanceId] ??= [];
  foldDelegateEvent(state.delegateEvents[event.instanceId], event);
}

/** The hub's supervisor-event push. */
function supervisorEventOf(frame: FramePayload): SupervisorEvent | null {
  return frame.kind === "supervisor_event" ? frame.event : null;
}

/** The transient "supervisor is thinking" push. */
function supervisorStatusOf(
  frame: FramePayload
): { instanceId: string; source: "rule" | "autopilot"; at: number } | null {
  return frame.kind === "supervisor_status"
    ? { instanceId: frame.instanceId, ...frame.status }
    : null;
}

/** Cap sourced from PLAN §C9: 200 in memory. */
const SUPERVISOR_EVENT_CAP = 200;

/** Files a supervisor event into the ring, newest first, capped. */
function recordSupervisorEvent(event: SupervisorEvent): boolean {
  const ring = state.supervisorEvents;
  // Deduplicate by id — the same row can arrive via REST seed and broadcast.
  if (ring.some((e) => e.id === event.id)) {
    return false;
  }
  // Insert newest-first: find the position to keep descending-id order.
  const idx = ring.findIndex((e) => e.id < event.id);
  if (idx === -1) {
    ring.push(event);
  } else {
    ring.splice(idx, 0, event);
  }
  // Cap.
  if (ring.length > SUPERVISOR_EVENT_CAP) {
    ring.length = SUPERVISOR_EVENT_CAP;
  }
  return true;
}

/**
 * The verdicts that must not die quietly in the panel's log. An `error` means
 * the supervisor's brain is broken — a misconfigured URL or a dead router
 * failing every turn invisibly is exactly how the first field bug survived
 * three evaluations unnoticed. An escalation is the supervisor handing the
 * session back to the operator; if the operator is looking at the dashboard,
 * the hand-off happens here, not just on the phone.
 */
function announceSupervisorEvent(event: SupervisorEvent): void {
  const row = instanceIndex.byId.get(event.instanceId);
  const where =
    row?.title ??
    (row?.cwd ? row.cwd.split("/").filter(Boolean).pop() : undefined) ??
    "a session";
  const open = {
    label: "Open",
    onClick: () => goto(conversationHref(event.instanceId, instanceIndex)),
  };
  if (event.verdict === "error") {
    // One toast per (session, cause) — sonner replaces by id, so a broken
    // brain failing every turn updates one toast instead of stacking forty.
    toast.error(`Supervisor error — ${event.note ?? "unknown"}`, {
      id: `sup-error-${event.instanceId}-${event.note ?? ""}`,
      description: where,
      action: open,
    });
  } else if (event.verdict === "escalate" || event.verdict === "ask") {
    toast.warning(event.message ?? "The supervisor needs you.", {
      id: `sup-esc-${event.id}`,
      description: `${event.source === "autopilot" ? "Autopilot" : "Supervisor"} — ${where}`,
      action: open,
    });
  }
}

/**
 * Keeps {@link SessionState.workingSince} in step with what the session is
 * doing. Anything that can change {@link activityOf} calls this: the clock
 * starts at the first sign of work and stops only where the session goes idle,
 * so a turn that is merely blocked or waiting on a tool keeps counting.
 */
function trackWorking(target: SessionState): void {
  if (activityOf(target) === "idle") {
    target.workingSince = null;
  } else {
    target.workingSince ??= Date.now();
  }
}

/**
 * Forgets the live turn phase. Called wherever the partials that painted it
 * stop being the truth: the turn ended, the process behind it was replaced, or
 * a stored transcript has taken the transcript's place.
 */
function clearTurnPhase(target: SessionState): void {
  target.openBlock = null;
  target.thinkingStream = "";
  target.thinkingClosing = false;
  target.thinkingSince = null;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every FramePayload kind the socket can deliver; splitting it would scatter one state machine across files
function handleFrame(frame: FramePayload): void {
  if (frame.kind === "fleet_mcp") {
    if (!equal(state.fleetMcp, frame.servers)) {
      state.fleetMcp = frame.servers;
    }
    return;
  }
  if (frame.kind === "permission_request" && "workflowRunId" in frame) {
    // A workflow question is represented once, by its waiting run, and is
    // answered through the run view — not as a session permission prompt.
    // Only the moment the hub parked it is kept, beside the run.
    const runId = (frame as { workflowRunId?: unknown }).workflowRunId;
    if (typeof runId === "string" && frame.raisedAt !== undefined) {
      state.runAskRaisedAt[runId] = frame.raisedAt;
    }
    return;
  }
  if (frame.kind === "permission_settled") {
    // The hub's word that the ask is over, whoever settled it: the card goes,
    // and a read already on its way cannot bring it back.
    hearSettled(frame.requestId);
    const target = state.sessions[frame.instanceId];
    const parked = target?.pending.find((p) => p.requestId === frame.requestId);
    if (target && parked) {
      target.pending = target.pending.filter(
        (p) => p.requestId !== frame.requestId
      );
      trackWorking(target);
    }
    // Withdrawn, not answered: the composer folds back, and the transcript
    // says why the ask is gone. One the hub could not show anyone was never
    // parked here, and its reason is the only word of it.
    if (target && frame.outcome === "cancelled" && (parked || frame.reason)) {
      const question = parked
        ? questionsOf(parked.toolName, parked.input) !== null
        : frame.toolName === ASK_USER_QUESTION;
      const note = withdrawnNote(frame.instanceId, question, frame.reason);
      state.withdrawnAsks[frame.requestId] = note;
      addNote(target, note);
    }
    return;
  }
  if (frame.kind === "workflow") {
    acceptWorkflowFrame(frame);
    return;
  }
  if (frame.kind === "preview") {
    const previous = state.previews[frame.instanceId];
    const sameRevision = previous?.revision === frame.revision;
    const next = {
      ...(sameRevision ? previous : {}),
      ...frame,
    };
    if (!equal(previous, next)) {
      state.previews[frame.instanceId] = next;
    }
    if (
      frame.state === "open" &&
      (previous?.state !== "open" || !sameRevision)
    ) {
      revealPreview(frame.instanceId);
    }
    return;
  }
  if (frame.kind === "instances" || frame.kind === "instances_delta") {
    if (frame.previews) {
      const current = new Set(
        frame.previews.map((preview) => preview.instanceId)
      );
      for (const [id, preview] of Object.entries(state.previews)) {
        if (!current.has(id) && preview.state !== "closed") {
          state.previews[id] = { ...preview, state: "closed" };
        }
      }
      for (const preview of frame.previews) {
        handleFrame(preview);
      }
    }
    // The machines ride along so a daemon registering — the moment its auth
    // state is decided — reaches the rail without a re-fetch.
    if (frame.kind === "instances") {
      adoptMachines(frame.agents);
    } else if (frame.agents || frame.removedAgents) {
      adoptMachines(
        patchRows(
          state.machines,
          frame.agents ?? [],
          frame.removedAgents ?? [],
          (row) => row.machineId
        )
      );
    }
    // The hub's own record of what each session is carrying. Kept there rather
    // than learnt by watching, so it is the same on every device and survives a
    // reload — a hand-off only this tab saw is one your phone never knows about.
    if (frame.handoffs && !equal(state.handoffs, frame.handoffs)) {
      state.handoffs = frame.handoffs;
    }
    if (frame.continuations) {
      adoptContinuations(frame.continuations);
    }
    if (frame.kind === "instances") {
      state.moves = frame.moves;
    }
    // The notices acknowledged on any tab or device: one dismissed elsewhere leaves this tab now.
    if (frame.noticesSeen) {
      notices.adopt(frame.noticesSeen);
    }
    if (frame.kind === "instances") {
      adoptInstances(frame.instances);
      state.liveRead = true;
    } else {
      patchInstances(frame.upserts, frame.removed);
    }
    // A spawn the hub took is answered by the row it opened.
    for (const [id, requestId] of opening) {
      if (instanceIndex.byId.has(id)) {
        opening.delete(id);
        settle(requestId, (waiter) => waiter.resolve(undefined));
      }
    }
    // Every connection seeds now-state; subsequent changes arrive as pulses.
    if (frame.kind === "instances") {
      state.pulses = mergePulses(state.pulses, frame.pulses);
      for (const [id, pulse] of Object.entries(state.pulses)) {
        trackTurn(id, pulse);
        const held = state.sessions[id];
        if (held) {
          applyPulse(held, pulse);
        }
      }
      if (!equal(state.hubBuild, frame.hubBuild)) {
        state.hubBuild = frame.hubBuild;
      }
    }
    return;
  }

  if (frame.kind === "cache_invalidated") {
    // Machine-to-hub bookkeeping is consumed there; it is never a UI event.
    return;
  }

  if (frame.kind === "usage") {
    // The small limits frame the hub pushes on each report (USAGE-SPEC.md §6.4).
    adoptUsageLimits(usageLimitReadings(frame.limits));
    adoptSpend(frame.spend);
    // The hub says this when an account's reading, sign-in or catalog moved.
    readAccounts();
    return;
  }

  if (frame.kind === "work_item") {
    if (!equal(state.workItems[frame.item.id], frame.item)) {
      state.workItems[frame.item.id] = frame.item;
    }
    return;
  }

  if (frame.kind === "thread.upsert") {
    adoptThread(frame.thread);
    return;
  }

  if (frame.kind === "thread.message") {
    adoptThreadMessage(frame.threadId, frame.message);
    return;
  }

  if (frame.kind === "project.cap") {
    const project = state.projects.find((row) => row.id === frame.projectId);
    if (project) {
      project.cap = frame.cap;
    }
    return;
  }

  if (frame.kind === "project.stop") {
    for (const listener of projectStopListeners) {
      listener(frame);
    }
    return;
  }

  if (frame.kind === "projects.changed") {
    rereadProjects();
    return;
  }

  if (frame.kind === "tasks.changed") {
    state.tasksChanged[frame.projectId] =
      (state.tasksChanged[frame.projectId] ?? 0) + 1;
    return;
  }

  if (frame.kind === "project_offer") {
    if (frame.offer) {
      state.projectOffers[frame.instanceId] = frame.offer;
    } else {
      delete state.projectOffers[frame.instanceId];
    }
    return;
  }

  if (frame.kind === "pulse") {
    const previous = state.pulses[frame.instanceId];
    if (
      equal(previous, frame.pulse) ||
      (previous && previous.at > frame.pulse.at)
    ) {
      return;
    }
    // The daemon's coarse now-state, broadcast — this is the whole of what the
    // rail knows about a session this browser has not subscribed to.
    state.pulses[frame.instanceId] = frame.pulse;
    trackTurn(frame.instanceId, frame.pulse);
    const held = state.sessions[frame.instanceId];
    if (held) {
      applyPulse(held, frame.pulse);
    }
    return;
  }

  if (frame.kind === "error") {
    const { instanceId, message } = frame;
    if (
      settle(frame.requestId, (waiter) => waiter.reject(new Error(message)))
    ) {
      return;
    }
    if (instanceId) {
      const target = session(instanceId);
      // A relaunch that never came up has no init frame to end its wait.
      target.relaunching = false;
      addNote(target, errorMessage(instanceId, message));
    } else {
      console.error("[cawco] hub error:", message);
    }
    return;
  }

  if (frame.kind === "control_result") {
    const answered = settle(frame.requestId, (waiter) =>
      frame.ok
        ? waiter.resolve(frame.result)
        : waiter.reject(
            new Error(
              frame.error ?? "The machine could not carry out that request."
            )
          )
    );
    if (answered) {
      return;
    }
    // Fire-and-forget controls (interrupt, permission replies) still report failure.
    if (!frame.ok && frame.instanceId) {
      addNote(
        session(frame.instanceId),
        errorMessage(
          frame.instanceId,
          frame.error ?? "The machine could not carry out that request."
        )
      );
    }
    return;
  }

  // The hub's own record of what a delegate asked and was answered: the reader
  // of this traffic is the parent's delegate card.
  const delegateEvent = delegateEventOf(frame);
  if (delegateEvent) {
    recordDelegateEvent(delegateEvent);
    return;
  }

  const supervisorEvent = supervisorEventOf(frame);
  if (supervisorEvent) {
    // Announce only what is genuinely new — the REST seed replays history
    // through the same recorder and must never replay its toasts.
    if (recordSupervisorEvent(supervisorEvent)) {
      announceSupervisorEvent(supervisorEvent);
      // Settle the composer's thinking halo into a verdict pulse — except for
      // the in-flight/queue skips, which describe a SECOND turn while the
      // first evaluation is still genuinely running.
      const stillRunning =
        supervisorEvent.verdict === "skipped" &&
        (supervisorEvent.note === "in-flight" ||
          supervisorEvent.note === "semaphore queue full");
      if (!stillRunning) {
        state.supervisorActivity[supervisorEvent.instanceId] = {
          phase: "settled",
          verdict: supervisorEvent.verdict,
          at: Date.now(),
        };
      }
    }
    return;
  }

  const supervisorStatus = supervisorStatusOf(frame);
  if (supervisorStatus) {
    state.supervisorActivity[supervisorStatus.instanceId] = {
      phase: "evaluating",
      source: supervisorStatus.source,
      since: supervisorStatus.at,
    };
    return;
  }

  // Every project move, whole, on each change. A move's progress travels
  // machine → hub only, and never reaches a screen as its own frame.
  if (frame.kind === "moves") {
    state.moves = frame.moves;
    return;
  }
  if (frame.kind === "move_progress") {
    return;
  }

  const target = session(frame.instanceId);

  switch (frame.kind) {
    case "permission_request": {
      const { routedTo } = frame as { routedTo?: "parent" };
      const existing = target.pending.find(
        (p) => p.requestId === frame.requestId
      );
      if (existing) {
        // A re-broadcast (the parent died) clears the tag, so the ask returns
        // to the user's queue; a fresh arrival keeps it out. Either way the
        // stored entry follows the latest word from the hub.
        existing.routedTo = routedTo;
        existing.raisedAt = frame.raisedAt;
        existing.presentation = frame.presentation;
        existing.heard = hearAsk();
        break;
      }
      target.pending.push({
        heard: hearAsk(),
        requestId: frame.requestId,
        instanceId: frame.instanceId,
        toolName: frame.toolName,
        input: frame.input,
        presentation: frame.presentation,
        suggestions: frame.suggestions,
        routedTo,
        toolUseId: frame.toolUseId,
        raisedAt: frame.raisedAt,
        threadId: frame.threadId,
      });
      break;
    }

    default:
      // Every other FramePayload kind (instances, usage, delegate/supervisor
      // events, …) is handled above, before this switch is reached.
      break;
  }

  trackWorking(target);
  target.lastActivityAt = new Date();
}

/* ------------------------------------------------------------------ *
 * The Ledger Protocol binding
 *
 * `stream.ts` holds the decisions — sequence tracking, gaps, backlog
 * validation, command stages — because a `.svelte.ts` module cannot be
 * imported by this repo's tests. What is left here is the thin binding: the
 * runes state it mutates, the socket it speaks through, and the two existing
 * paths it reaches back into (frame apply, history re-read).
 * ------------------------------------------------------------------ */

/**
 * The stream half of the store. A plain object under `$state`, so a cursor
 * moving or a command changing stage is something the UI can read reactively.
 */
const streamState = $state(createStreamState());

const streamHost: StreamHost = {
  // A session's own changes arrive only here, sequenced: what the hub's builder
  // made of each frame, and its preview's state. Everything broadcast (the
  // board, pulses, permissions, replies) comes as an envelope (`bind`).
  applyFrame: (sessionId, frame) => {
    const payload = frame as SessionStreamFrame;
    if (payload.kind !== "transcript") {
      handleFrame(payload);
      return;
    }
    const target = session(sessionId);
    applyTranscript(target, payload.events);
    trackWorking(target);
    target.lastActivityAt = new Date();
  },
  follows: (sessionId) => subscriptionIds().includes(sessionId),
  // The newest page again, which resumes the stream from the `seq` it carries.
  rereadHistory: (sessionId) => {
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the read adopts the page and resumes the stream when it lands
    void readTranscript(sessionId, true);
  },
  sendToHub: (message) => {
    const socket = globalThis.__cawcoSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    clientLine(socket).send(message);
    return true;
  },
  now: () => Date.now(),
  warn: (message, detail) => console.warn(`[cawco] ${message}`, detail),
  /**
   * The ledger's own clock. The ack timeout used to be enforced only by the
   * traffic sweep below, which meant a message whose frame was swallowed was
   * called off when some unrelated frame happened to arrive — and on a quiet
   * tab, or one whose socket had gone silent, never. That is the exact shape
   * of a permanent ghost: the operator's words on screen, at "sending…",
   * indefinitely. A real timer settles them whether or not anything arrives.
   */
  setTimer: (delayMs, run) => setTimeout(run, delayMs) as unknown as number,
  clearTimer: (handle) =>
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  /**
   * The client half of the ledger's failure port: every command that ever
   * reaches `failed`, on either dialect, is heard exactly once here.
   *
   * The rule is not "toast everything" — it is "nothing goes unsaid TWICE".
   * A kind whose own surface renders the failure inline claims it; everything
   * else, and every claim whose surface has since vanished, is spoken by a
   * toast. That way a command kind added next year is loud by default rather
   * than silent by default, which is the failure mode this whole port exists
   * to close.
   */
  noteFailure: (record) => {
    if (record.kind === "send") {
      // A send's failure is said over the composer it left (the session's
      // notice) and on its row — stamped rather than kept only on the command
      // record, which is swept after five minutes, where a message that never
      // sent must not fade back to looking sent. It is never a toast.
      announceSendFailure(record);
      markUnreached(record);
      return;
    }
    // A withdraw is a queued message's edit, and the composer it was edited
    // in says what became of it, over the field that holds the words again
    // (transcript/lift.svelte.ts).
    if (record.kind === "send.withdraw") {
      return;
    }
    // A parked permission card renders its own refusal (`Couldn't send that
    // answer.`) against the very command id it holds. It only does so while it
    // is still on screen: answering removes the request from `pending`, so an
    // answer that fails after the card has gone has no inline surface at all
    // and falls through to the toast.
    if (record.kind === "permission.answer" && answerCardStillParked(record)) {
      return;
    }
    toast.error(failureNotice(record));
  },
};

/** What to say about a failed command, in the operator's terms, never the wire's. */
const FAILURE_LEAD: Record<CommandKind, string> = {
  "send.withdraw": "Couldn't take back that message.",
  send: "Couldn't send that message.",
  "permission.answer": "Couldn't send that answer.",
  interrupt: "Couldn't stop the turn.",
  "set-model": "Couldn't change the model.",
  "set-permission-mode": "Couldn't change the permission mode.",
  "set-effort": "Couldn't change the effort.",
};

const failureNotice = (record: CommandRecord): string => {
  const lead = FAILURE_LEAD[record.kind] ?? "That didn't go through.";
  return record.reason ? `${lead} ${record.reason}` : lead;
};

/**
 * A send whose command the hub never took — the socket was down, went down,
 * or no answer came: this tab's row for it did not go, with why, and offers
 * Try again and Edit. A send the hub has a record of is not this tab's to
 * say anything about (its row is the record's), and neither is a retry of a
 * failed send, which draws no row of its own until the hub takes it.
 */
function markUnreached(record: CommandRecord): void {
  const row = state.sessions[record.sessionId]?.local.find(
    (message) => message.id === record.commandId
  );
  if (!row) {
    return;
  }
  row.state = "unreached";
  row.metadata = {
    ...row.metadata,
    sendFailed: record.reason ?? "The hub never took it.",
  };
}

/**
 * Whether the card that asked is still on screen to render its own refusal.
 * The link is kept here because the wire payload correlates on the PERMISSION's
 * request id while the ledger correlates on the COMMAND's — nothing else joins
 * the two.
 */
const answerSurfaces = new Map<
  string,
  { instanceId: string; requestId: string }
>();

/**
 * Kept only as long as the ledger keeps the record it belongs to: an answer
 * that succeeded is never asked about again, so its link would otherwise be a
 * slow leak on the busiest control path there is.
 */
function rememberAnswerSurface(
  commandId: string,
  instanceId: string,
  requestId: string
): void {
  for (const known of [...answerSurfaces.keys()]) {
    if (!streamState.commands[known]) {
      answerSurfaces.delete(known);
    }
  }
  answerSurfaces.set(commandId, { instanceId, requestId });
}

/**
 * Whether a card holding this command is STILL RENDERED, re-derived from the
 * same predicate the pane renders by rather than from anything this file
 * wishes were true — `session.pending`, minus the delegate asks a parent's
 * queue filters out (`parked` in SessionPane; `routedToParent` in
 * transcript/present.ts).
 *
 * Checked against both dialects, because they answer it differently and both
 * answers are right:
 *
 * - LEGACY. The control dialect puts the answer on the wire and clears
 *   `pending` only afterwards, so a socket that throws leaves the card exactly
 *   where it was. The card renders "Couldn't send that answer." off the very
 *   record that failed — so this returns true and the toast stands down. That
 *   is the double report this rule exists to prevent, and it only works
 *   because the surface is now registered BEFORE the submit that can fail
 *   inside it; registered afterwards there was nothing here to find.
 * - STREAM. The dispatch's own `submitted` effect clears `pending` first, so
 *   by the time anything can fail the card is already leaving. This returns
 *   false and the toast IS the report — correctly, since there is no longer a
 *   card to read it on.
 *
 * So the rule is not inert on either dialect; it says "no surface" on the
 * stream dialect because on the stream dialect there is no surface.
 */
function answerCardStillParked(record: CommandRecord): boolean {
  const surface = answerSurfaces.get(record.commandId);
  answerSurfaces.delete(record.commandId);
  if (!surface) {
    return false;
  }
  return (
    state.sessions[surface.instanceId]?.pending.some(
      (parked) =>
        parked.requestId === surface.requestId && !routedToParent(parked)
    ) ?? false
  );
}

/** The last command sweep, so a busy socket does not re-scan the tracker per frame. */
let lastSweep = 0;

/**
 * Ages the command tracker on inbound traffic rather than on a timer: a
 * connected dashboard receives a pulse about once a second, and a dashboard
 * receiving nothing at all is one whose disconnect has already called its
 * commands off.
 */
function sweepOnTraffic(): void {
  const now = Date.now();
  if (now - lastSweep < 1000) {
    return;
  }
  lastSweep = now;
  // With the host: a sweep without it fails records that
  // {@link StreamHost.noteFailure} never hears about — silence, by omission.
  sweepCommands(streamState, now, streamHost);
  // The outbox ages on the same beat as the ledger it shadows. Pruning only
  // when a NEW send arrives — which is what it did — meant a Try again could
  // outlive the payload behind it by however long the operator stayed quiet.
  pruneOutbox();
}

/** Re-exported so a component reads one import for a command and its stages. */
export type { CommandRecord, CommandStage } from "./stream";

/** One command's record, by the id {@link submitCommand} returned. */
export function commandRecord(commandId: string): CommandRecord | null {
  return streamState.commands[commandId] ?? null;
}

/** Every command this tab has submitted for a session, oldest first. */
export function commandsFor(instanceId: string): CommandRecord[] {
  return sessionCommands(streamState, instanceId);
}

/**
 * The newest command of one kind on one session — what a control reads to say
 * whether what was just asked for has been taken, applied, or refused.
 */
export function latestCommandFor(
  instanceId: string,
  kind: CommandKind
): CommandRecord | null {
  return latestCommand(streamState, instanceId, kind);
}

/** What each command kind carries, in the shape the caller already has to hand. */
export interface CommandIntents {
  interrupt: Record<string, never>;
  "permission.answer": { requestId: string; result: PermissionResult };
  /** `replaces`: the failed send this one retries, which the hub then retires. */
  send: { text: string; extras?: SendExtras; replaces?: string };
  /**
   * `replacementId`: the id the replacement goes out under once the queued
   * send is withdrawn, known before it goes, so the words can fly into its row.
   */
  "send.withdraw": {
    sendId: string;
    extras: SendExtras;
    replacement: string;
    replacementId: string;
  };
  "set-effort": { effort: EffortLevel };
  "set-model": { model: string };
  "set-permission-mode": { mode: PermissionMode };
}

/**
 * The wire payload for a kind: exactly what the hub's relay operation for it
 * takes. `requestId` is the command id — the correlation the control path
 * already has, reused rather than a second one invented alongside it.
 */
function wirePayload<K extends CommandKind>(
  kind: K,
  instanceId: string,
  commandId: string,
  intent: CommandIntents[K]
): SendPayload | ControlPayload | { sendId: string } {
  const controlPayload = (method: string, args: unknown[]): ControlPayload => ({
    instanceId,
    requestId: commandId,
    method,
    args,
  });
  switch (kind) {
    case "send.withdraw":
      return { sendId: (intent as CommandIntents["send.withdraw"]).sendId };
    case "send": {
      const { text, extras, replaces } = intent as CommandIntents["send"];
      // The command's id is the message's: one identity from the press on. A
      // retry names the failed send it stands in for.
      return {
        instanceId,
        message: {
          ...userMessage(text, commandId),
          ...(replaces ? { replaces } : {}),
        },
        ...selectionExtras(extras),
      };
    }
    case "permission.answer": {
      const { requestId, result } =
        intent as CommandIntents["permission.answer"];
      return {
        instanceId,
        requestId,
        method: RESOLVE_PERMISSION,
        args: [requestId, result],
      };
    }
    case "interrupt":
      return controlPayload("interrupt", []);
    case "set-model":
      return controlPayload("setModel", [
        (intent as CommandIntents["set-model"]).model,
      ]);
    case "set-permission-mode":
      return controlPayload("setPermissionMode", [
        (intent as CommandIntents["set-permission-mode"]).mode,
      ]);
    case "set-effort":
      return controlPayload("setEffort", [
        (intent as CommandIntents["set-effort"]).effort,
      ]);
    default:
      // A kind the contract grew and this map did not. Loud rather than
      // silently dispatched as whatever the last branch happened to be.
      throw new Error(`No wire payload for command kind ${String(kind)}.`);
  }
}

/**
 * One id per browser tab: minted once, kept only in memory (never in
 * `localStorage`, which a duplicated tab would inherit and so blur two
 * senders into one), and attached to every command as {@link submitCommand}'s
 * provenance. Without this an incident like "a send landed on the wrong
 * session" is unprovable — every socket writes with the same voice.
 */
let tabClientId: string | undefined;
function currentClientId(): string {
  tabClientId ??= newId();
  return tabClientId;
}

/**
 * Submits an operator action as an acknowledged transaction and returns the id
 * its stages are readable under ({@link commandRecord},
 * {@link latestCommandFor}). The envelope goes to the hub and the hub's acks
 * move the stages, so nothing local is fabricated on the way.
 */
export function submitCommand<K extends CommandKind>(
  instanceId: string,
  machineId: string,
  kind: K,
  intent: CommandIntents[K],
  /**
   * Minted by the caller when it has to know the id before the command goes
   * out — the composer, whose text flies into the row a send's id keys.
   * Otherwise minted here, FIRST, before anything that can throw, so there is
   * an id to fail under.
   */
  commandId = newId()
): string {
  // Everything below either reaches the ledger or becomes a record in it;
  // nothing reaches the caller as an exception.
  const settlesAt = SETTLES_AT[kind];

  // REGISTERED BEFORE ANYTHING THAT CAN FAIL, and that ordering is the whole
  // point of these two lines being here rather than after the submit.
  //
  // `noteFailure` fires SYNCHRONOUSLY from inside the ledger — a refused
  // dispatch, a payload that could not be built —
  // so anything the failure reporter needs in order to know who owns the
  // failure has to already exist when the submit is called. Registered
  // afterwards, as these were, the reporter saw an empty registry on every
  // synchronous failure and announced a toast for a failure a card was
  // already rendering: one failure, two reports. And the outbox, written
  // afterwards, held nothing at all when the throw happened before the wire —
  // the operator got a toast and their typed words were gone, which is the
  // original defect wearing a different hat.
  if (kind === "send") {
    const { text, extras } = intent as CommandIntents["send"];
    rememberSend(commandId, instanceId, machineId, text, extras ?? {});
  }
  if (kind === "permission.answer") {
    const { requestId } = intent as CommandIntents["permission.answer"];
    rememberAnswerSurface(commandId, instanceId, requestId);
  }

  let payload: object;
  let effects: StreamEffects | undefined;
  try {
    // `provenance` rides inside the payload rather than as a new envelope field —
    // CommandEnvelope.payload is already `unknown` on the wire, so this needs no
    // protocol change, and the hub's `command()` spreads it straight through to
    // `relaySend` untouched. No `viewId` here — it would just repeat the
    // envelope's own `instanceId`; `clientId` is the only fact provenance adds.
    const provenance = { clientId: currentClientId() };
    payload = {
      ...(wirePayload(kind, instanceId, commandId, intent) as object),
      provenance,
    };
    effects = streamEffectsFor(instanceId, kind, intent, commandId);
  } catch (error) {
    // THE CONTRACT THIS FUNCTION SHARES WITH THE LEDGER: it never throws.
    //
    // `submitCommand` in stream.ts documents "never throws: the stage IS the
    // report" — but the assembly above runs BEFORE that function is reached,
    // and a throw here escapes the ledger entirely. That is not hypothetical:
    // `currentClientId()` reached `crypto.randomUUID`, which does not exist on
    // a plain-http origin, so every operator action on a tailnet address threw
    // out of this line and vanished. Converting the throw into a failed record
    // makes the whole CLASS impossible — a bug in payload assembly is now a
    // failed command wearing its own exception, for all six kinds, instead of
    // a dead composer.
    //
    // The row goes in FIRST, and only here: on every other path the effects'
    // `submitted` draws it, and that did not run. Without it a
    // payload-assembly bug leaves the reason with no row to stamp, no Try
    // again, and no Edit — recoverable text
    // nobody can reach. It is wrapped because it is the one thing left that
    // could throw, and a throw from a catch block is the silence this whole
    // function exists to abolish.
    if (kind === "send") {
      const { text, extras, replaces } = intent as CommandIntents["send"];
      try {
        noteSendSubmitted(instanceId, text, extras ?? {}, commandId, replaces);
      } catch {
        // The composer's notice is then the whole report, which is a worse
        // outcome than a failed ghost but an infinitely better one than nothing.
      }
    }
    return failLocally(
      streamState,
      streamHost,
      { commandId, sessionId: instanceId, kind, settlesAt },
      messageOf(error)
    );
  }

  const id = submitTrackedCommand(streamState, streamHost, {
    commandId,
    // NOTE: carries instanceId, not a harness session id.
    sessionId: instanceId,
    machineId,
    kind,
    settlesAt,
    payload,
    streamEffects: effects,
  });
  return id;
}

/**
 * Where each kind's protocol stops talking. Declared once, here, because the
 * question "what is this kind's last word?" has exactly one right answer per
 * kind and re-deriving it at each call site is how a delivered message gets
 * retro-declared a failure. See {@link SettleStage}: the hub answers a `send`
 * with `accepted` and never with `applied`; the control kinds get a second
 * word when their `control_result` comes back.
 */
const SETTLES_AT: Record<CommandKind, SettleStage> = {
  "send.withdraw": "applied",
  send: "accepted",
  "permission.answer": "applied",
  interrupt: "applied",
  "set-model": "applied",
  "set-permission-mode": "applied",
  "set-effort": "applied",
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/* ---- the outbox: what makes a refused send recoverable ----------------- */

/** One unsent message, whole — the payload a retry needs and the echo cannot hold. */
interface OutboxEntry {
  at: number;
  extras: SendExtras;
  instanceId: string;
  machineId: string;
  text: string;
}

/**
 * Every send this tab has dispatched and not yet seen taken, with its FULL
 * payload.
 *
 * The transcript echo is not enough to resend from: `localUserMessage` keeps
 * attachments as name+length and images as display data URIs — a deliberate
 * thumbnail economy — so a retry built from the echo would quietly drop what
 * was attached. The bytes live here instead, and only here.
 *
 * Bounds are OUR CHOICE, deliberately aligned to the ledger's own
 * ({@link SETTLED_COMMAND_LIMIT} = 50, {@link SETTLED_COMMAND_TTL_MS} = 5min):
 * an entry whose record the sweep has already forgotten can no longer be
 * offered a Try again, so retaining it past that point is dead weight holding
 * base64 image data alive.
 */
const sendOutbox = new Map<string, OutboxEntry>();
const selectionSends = $state<
  Record<string, { instanceId: string; selectionIds: string[]; at: number }>
>({});

export function selectionCommands(instanceId: string) {
  return Object.entries(selectionSends)
    .filter(([, entry]) => entry.instanceId === instanceId)
    .map(([commandId, entry]) => ({
      commandId,
      selectionIds: entry.selectionIds,
      stage: commandRecord(commandId)?.stage,
    }));
}

/**
 * Bumped on every mutation of the Map above, and read by {@link canResend}.
 *
 * A plain Map is not reactive, and the affordance it backs has to DISAPPEAR
 * the moment the payload behind it is pruned. Rendered off the Map alone,
 * "Try again" and "Edit" were painted once — when the failure landed — and
 * then kept standing after the outbox had aged the payload out five minutes
 * later, so pressing either did nothing at all and said nothing about it.
 * A dead button is a silent failure with a cursor on it. This is the cheapest
 * honest fix: one number, rather than deep-proxying every base64 image in the
 * outbox through `$state` just to be told when a key was deleted.
 */
let outboxVersion = $state(0);

/**
 * Whether a failed send can still actually be re-sent or edited — i.e. whether
 * the full payload (attachments and image bytes included, which the transcript
 * echo does not keep) is still in hand. The row asks before offering the
 * affordance, so the answer is "no button" rather than "a button that lies".
 */
export function canResend(commandId: string): boolean {
  // Reading the version is what subscribes the caller's `$derived` to the Map.
  return outboxVersion >= 0 && sendOutbox.has(commandId);
}

function rememberSend(
  commandId: string,
  instanceId: string,
  machineId: string,
  text: string,
  extras: SendExtras
): void {
  sendOutbox.set(commandId, {
    instanceId,
    machineId,
    text,
    extras,
    at: Date.now(),
  });
  if (extras.selections?.length) {
    selectionSends[commandId] = {
      instanceId,
      selectionIds: extras.selections.map(({ id }) => id),
      at: Date.now(),
    };
  }
  outboxVersion += 1;
  pruneOutbox();
}

/**
 * Drops what can no longer be retried: anything the hub has taken custody of
 * (the daemon holds the real payload from `accepted` on), anything whose record
 * the ledger has already forgotten, and anything older or more numerous than
 * the ledger's own bounds. A `failed` entry is the one thing kept — that is the
 * entry Try again and Edit exist for.
 */
function pruneOutbox(): void {
  const before = sendOutbox.size;
  const now = Date.now();
  const selections = Object.entries(selectionSends).sort(
    (a, b) => b[1].at - a[1].at
  );
  for (const [index, [commandId, entry]] of selections.entries()) {
    if (
      index >= SETTLED_COMMAND_LIMIT ||
      now - entry.at >= SETTLED_COMMAND_TTL_MS
    ) {
      delete selectionSends[commandId];
    }
  }
  for (const [commandId, entry] of sendOutbox) {
    const record = streamState.commands[commandId];
    if (record?.stage === "submitted") {
      continue;
    }
    const stale = now - entry.at >= SETTLED_COMMAND_TTL_MS;
    // A MISSING record is not evidence of anything and must not be read as
    // custody. The entry is now written before the submit that creates the
    // record — it has to be, or a throw during payload assembly leaves nothing
    // to recover — so for one instant every fresh entry has no record, and
    // treating that as "the hub has it" deleted the payload the moment it was
    // stored. The absent-record case is covered by `stale` anyway: a record the
    // ledger has already forgotten is at least as old as the TTL below.
    const taken = record ? record.stage !== "failed" : false;
    if (stale || taken) {
      sendOutbox.delete(commandId);
    }
  }
  if (sendOutbox.size > SETTLED_COMMAND_LIMIT) {
    const oldest = [...sendOutbox.entries()]
      .filter(([id]) => streamState.commands[id]?.stage !== "submitted")
      .sort((a, b) => a[1].at - b[1].at);
    for (const [commandId] of oldest.slice(
      0,
      Math.max(0, oldest.length - SETTLED_COMMAND_LIMIT)
    )) {
      sendOutbox.delete(commandId);
    }
  }
  // Only when something actually went, so the common no-op sweep does not
  // invalidate every row's derivation once a second.
  if (sendOutbox.size !== before) {
    outboxVersion += 1;
  }
}

/** Removes the row a send that never reached the hub left behind. */
function dropSendEcho(instanceId: string, commandId: string): void {
  const target = state.sessions[instanceId];
  if (!target) {
    return;
  }
  target.local = target.local.filter((message) => message.id !== commandId);
  place(target);
}

/**
 * Sends again, from the outbox, a message that never reached the hub — under
 * its own uuid, on its own row, which goes back to sending where it stands.
 * The uuid is what makes it safe: a hub that did take the first one after
 * all has its record, answers with that, and hands the machine nothing twice.
 * No-op if the outbox entry has aged out. Never throws.
 */
export function retrySend(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (!entry) {
    return;
  }
  // Through `submitCommand`, not around it: a new command record under the
  // same id, whose stages the row reads.
  submitCommand(
    entry.instanceId,
    entry.machineId,
    "send",
    { text: entry.text, extras: entry.extras },
    commandId
  );
}

/**
 * The retry out for each failed send, by that send's uuid: the command its
 * row reads for whether the retry is still on its way, or did not go either.
 */
const retries = $state<Record<string, string>>({});

/** The command retrying the failed send `uuid`, while this tab knows of one. */
export function retryOf(uuid: string): CommandRecord | null {
  const commandId = retries[uuid];
  return commandId ? commandRecord(commandId) : null;
}

/**
 * What a sent row carried, as a send carries it again: its texts, and its
 * files by the hub's reference (a row drawn from the hub's record names
 * every file it carried by one).
 */
function resentAttachments(message: Message): SendPayload["attachments"] {
  return message.metadata?.attachments?.flatMap<SendAttachment>(
    (attachment) => {
      if (attachment.kind === "text") {
        return [attachment];
      }
      const { name, mediaType, size, ref } = attachment;
      return ref ? [{ kind: "file" as const, name, mediaType, size, ref }] : [];
    }
  );
}

/**
 * Sends again, as a new send that replaces it, a send the hub failed — from
 * any screen, after any reload: the words and pictures are the row's own,
 * from its record. The hub retires the failed one (`replaced`) as it takes
 * this one, and every screen folds the old row away as the new one arrives.
 */
export async function retryFailed(message: Message): Promise<void> {
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  retries[message.id as string] = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send",
    {
      text: message.content,
      extras: {
        attachments: resentAttachments(message),
        images,
      },
      replaces: message.id,
    }
  );
}

/** A picture's bytes as a send carries them: base64, with no `data:` prefix. */
async function imageBytes(
  src: string,
  mediaType: string
): Promise<{ mediaType: string; data: string }> {
  if (src.startsWith("data:")) {
    return { mediaType, data: src.slice(src.indexOf(",") + 1) };
  }
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return { mediaType, data: btoa(binary) };
}

/**
 * Hand a failed message's payload back to the composer for editing: drops the
 * failed echo, writes { text, extras } into the session's restore slot. The
 * pane consumes the slot in an $effect (binding `draft` and calling
 * Composer.restore(extras)) and clears it. No-op if the outbox entry is gone.
 * Never throws.
 */
export function restoreDraft(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (!entry) {
    return;
  }
  sendOutbox.delete(commandId);
  outboxVersion += 1;
  dropSendEcho(entry.instanceId, commandId);
  restoreComposer(entry.instanceId, entry.text, entry.extras);
}

function restoreComposer(
  instanceId: string,
  text: string,
  extras: SendExtras
): void {
  // Exactly one slot is ever waiting. A slot holds the whole payload — base64
  // image data included — and it is only ever emptied by the pane that mounts
  // to consume it, so an "Edit" pressed on a session the reader then closes
  // would otherwise pin those bytes for the life of the tab. Keeping only the
  // newest bounds it at one without needing anyone to come back and collect.
  for (const held of Object.keys(restoreSlots)) {
    if (held !== instanceId) {
      delete restoreSlots[held];
    }
  }
  restoreSlots[instanceId] = { text, extras };
}

/** Only Claude's CLI supports individually recalling a pending send. */
export function canWithdraw(message: Message): boolean {
  return (
    message.state === "pending" &&
    state.sessions[message.instanceId]?.harness === "claude"
  );
}

/**
 * Puts new words in place of a queued send: withdraws it, and once the hub
 * says it was withdrawn, sends the words with its pictures and files. Returns
 * the withdraw's command id, whose record says how it went (`applied` with
 * the outcome `withdrawn`, or the session read the send first), and the id
 * the replacement goes out under.
 */
export async function replaceQueued(
  message: Message,
  replacement: string
): Promise<{ withdraw: string; replacement: string }> {
  if (!canWithdraw(message)) {
    throw new Error("This message can no longer be edited in the queue.");
  }
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  const replacementId = newId();
  const withdraw = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send.withdraw",
    {
      sendId: message.id,
      extras: {
        attachments: resentAttachments(message),
        images,
      },
      replacement,
      replacementId,
    }
  );
  return { withdraw, replacement: replacementId };
}

/** One action table for every surface that draws the reader's own turns. */
export function userTurnActions(message: Message): {
  edit: "queued" | "resend" | "restore" | null;
  fork: boolean;
  retry: boolean;
} {
  const target = state.sessions[message.instanceId];
  if (!target || message.type !== "user") {
    return { edit: null, fork: false, retry: false };
  }
  const machine = cawco.machines.find(
    (entry) => entry.machineId === target.machineId
  );
  const capability = machine?.harnesses?.find(
    (entry) => entry.harness === target.harness
  )?.capabilities;
  const delivered =
    message.type === "user" &&
    cawco.status === "connected" &&
    machine?.status === "online" &&
    !!target.sessionId &&
    capability?.rewind === true &&
    rewindableTurns(target).has(message.id);
  const table = {
    pending: {
      edit: canWithdraw(message) ? ("queued" as const) : null,
      fork: false,
      retry: false,
    },
    sending: { edit: null, fork: false, retry: false },
    failed: { edit: null, fork: false, retry: true },
    unreached: {
      edit: canResend(message.id) ? ("restore" as const) : null,
      fork: false,
      retry: canResend(message.id),
    },
    cancelled: { edit: null, fork: false, retry: false },
    read: {
      edit:
        delivered && !target.busy && !target.relaunching
          ? ("resend" as const)
          : null,
      fork: delivered && capability?.fork === true,
      retry: false,
    },
  };
  return table[message.state ?? "read"];
}

/**
 * What a pane owes its composer, per session. A slot rather than a call
 * because the row that offers "Edit" is two components away from the state
 * that holds the draft — the store is the only channel they share, and
 * threading a prop through the transcript for this would make the transcript a
 * conduit for something it has no part in.
 */
const restoreSlots = $state<
  Record<string, { text: string; extras: SendExtras } | null>
>({});

/** The payload waiting to go back into this session's composer, if any. */
export function pendingRestore(
  instanceId: string
): { text: string; extras: SendExtras } | null {
  return restoreSlots[instanceId] ?? null;
}

/** Consumed exactly once by the pane that took it. */
export function clearRestore(instanceId: string): void {
  restoreSlots[instanceId] = null;
}

/* ---- the spoken half: what a screen reader is told -------------------- */

/**
 * The last send failure per session, as a sentence.
 *
 * The transcript is virtualized, so a state flip inside a row is not reliably
 * announced; the pane owns one live region instead and this is what it reads.
 * Only failures are announced — acceptance is the norm, and narrating the norm
 * is how a live region becomes noise nobody hears the exception through.
 */
const sendFailureNotices = $state<Record<string, string>>({});

export function sendFailureNotice(instanceId: string): string {
  return sendFailureNotices[instanceId] ?? "";
}

function announceSendFailure(record: CommandRecord): void {
  // A notice is a sentence about a session, so it dies with the session. These
  // are small, but "small and unbounded" is still unbounded on a board a
  // reader leaves open for a week.
  for (const held of Object.keys(sendFailureNotices)) {
    if (held !== record.sessionId && !state.sessions[held]) {
      delete sendFailureNotices[held];
    }
  }
  sendFailureNotices[record.sessionId] = record.reason
    ? `Message not sent: ${record.reason}`
    : "Message not sent.";
}

/**
 * The LOCAL half of each command kind — everything around the wire call. Only
 * the envelope goes out, and skipping the local half is how a sent message
 * ended up with no row until the hub answered, an answered permission stayed
 * on screen, and a stopped session kept reading "working". These closures are
 * that half, run by the tracker at the submit and settle transitions.
 *
 * Honest gap, carried to protocol v2: a command does not revive a dead
 * session — it fails with the hub's own reason instead. The revive belongs on
 * the hub side of the command, not in every client.
 */
function streamEffectsFor<K extends CommandKind>(
  instanceId: string,
  kind: K,
  intent: CommandIntents[K],
  commandId: string
): StreamEffects | undefined {
  const target = session(instanceId);
  switch (kind) {
    case "send.withdraw": {
      const { sendId, extras, replacement, replacementId } =
        intent as CommandIntents["send.withdraw"];
      return {
        settled: (stage) => {
          if (
            stage === "applied" &&
            commandRecord(commandId)?.outcome === "withdrawn"
          ) {
            const block = target.messages.find(
              (message) => message.id === sendId
            );
            if (block) {
              take(target, block as TranscriptBlock, "removed");
              place(target);
            }
            submitCommand(
              instanceId,
              target.machineId,
              "send",
              { text: replacement, extras, replaces: sendId },
              replacementId
            );
          }
        },
      };
    }
    case "send": {
      const { text, extras, replaces } = intent as CommandIntents["send"];
      // The row is keyed by the id of the command it IS, which is the whole
      // join between a rendered message and the ledger's word on it.
      return {
        submitted: () =>
          noteSendSubmitted(
            instanceId,
            text,
            extras ?? {},
            commandId,
            replaces
          ),
      };
    }
    case "interrupt":
      return {
        submitted: () => {
          target.busy = false;
          clearTurnPhase(target);
          trackWorking(target);
        },
      };
    case "permission.answer": {
      const { requestId } = intent as CommandIntents["permission.answer"];
      return {
        submitted: () => {
          target.pending = target.pending.filter(
            (p) => p.requestId !== requestId
          );
          trackWorking(target);
        },
      };
    }
    case "set-model": {
      const { model } = intent as CommandIntents["set-model"];
      const previous = target.model;
      return {
        submitted: () => {
          target.model = model;
        },
        settled: (stage) => {
          if (stage === "failed") {
            target.model = previous;
          } else {
            // biome-ignore lint/complexity/noVoid: fire-and-forget — the local state already switched, this just persists it
            void persistSettings(instanceId, { model });
          }
        },
      };
    }
    case "set-permission-mode": {
      const { mode } = intent as CommandIntents["set-permission-mode"];
      const previous = target.permissionMode;
      return {
        submitted: () => {
          target.permissionMode = mode;
        },
        settled: (stage) => {
          if (stage === "failed") {
            target.permissionMode = previous;
          } else {
            // biome-ignore lint/complexity/noVoid: fire-and-forget — the local state already switched, this just persists it
            void persistSettings(instanceId, { permissionMode: mode });
          }
        },
      };
    }
    case "set-effort": {
      const { effort } = intent as CommandIntents["set-effort"];
      const previous = target.effort;
      return {
        submitted: () => {
          target.effort = effort;
        },
        // A switch that lands is followed by the agent's reading of it, which
        // the hub writes on the row; only a refused one is undone here.
        settled: (stage) => {
          if (stage === "failed") {
            target.effort = previous;
          }
        },
      };
    }
    default:
      return undefined;
  }
}

/** The session the board is peeking — subscribed for frames, like an open tab. */
let peekedId = $state<string | null>(null);

/**
 * Delegates something on screen is reading live: an expanded card, the tray's
 * open panel. A delegate is a full instance, but its parent's transcript is
 * what the reader is in — so it is not an open tab, and without this it
 * receives no frames. Counted by watcher, so the tray's panel closing never
 * stops the frames an expanded card is still reading.
 */
const watchedDelegates = new Map<string, number>();

/**
 * A session is "open" when a tab the workspace holds or the peek pane is
 * watching it. The workspace's tabs, not the working set: the working set
 * keeps ten and lets the coldest go, while the tab it let go stays in its
 * strip — and a tab that is not subscribed never streams, however often it
 * is clicked (activating a tab does not visit it).
 */
function isSubscribed(instanceId: string): boolean {
  return workspace.openIds.includes(instanceId) || peekedId === instanceId;
}

/** The full set of instance ids this dashboard wants `frame` frames for. */
function subscriptionIds(): string[] {
  const ids = new Set(workspace.openIds);
  if (peekedId) {
    ids.add(peekedId);
  }
  for (const id of watchedDelegates.keys()) {
    ids.add(id);
  }
  // A run's tab streams no frames of its own: its run and steps come with
  // the workflow frames every dashboard already receives. A thread's comes
  // with the thread frames, which every dashboard receives too.
  return [...ids].filter((id) => !(runIdOf(id) || isThreadTab(id)));
}

/** The last subscription set sent, so an unchanged set of tabs stays quiet. */
let lastSubscriptionKey = "";

/**
 * Follows the streams of every session the dashboard watches, and only those.
 * A no-op when the set is unchanged since the last sync, and nothing at all
 * when the socket is not open — the reconnect path syncs again. The ids are
 * read before the socket is checked: the route layout's effect calls this, and
 * a first run that found the socket still connecting would otherwise track no
 * tabs at all, so closing one never shrank the set.
 */
export function syncSubscriptions(): void {
  const ids = subscriptionIds().sort();
  const socket = globalThis.__cawcoSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const key = ids.join("\u0000");
  if (key === lastSubscriptionKey) {
    return;
  }
  lastSubscriptionKey = key;
  syncStreamSubscriptions(streamState, streamHost, ids);
}

/** The board peeking a session subscribes it for frames; `null` closes the peek. */
export function setPeeked(id: string | null): void {
  if (peekedId === id) {
    return;
  }
  peekedId = id;
  syncSubscriptions();
}

/** One more reader of this delegate: its frames stream while any reader remains. */
export function watchDelegate(instanceId: string): void {
  // A workflow run or a thread streams no frames of its own (see `subscriptionIds`).
  if (runIdOf(instanceId) || isThreadTab(instanceId)) {
    return;
  }
  watchedDelegates.set(instanceId, (watchedDelegates.get(instanceId) ?? 0) + 1);
  syncSubscriptions();
}

/**
 * Sessions whose plan something on screen shows without streaming the
 * session: a thread's lead, whose plan is the thread's. Counted by reader.
 */
const watchedPlans = new Map<string, number>();
/** The plan-follow set last sent, so an unchanged set stays quiet. */
let lastPlanFollowKey = "";

/** Sends the hub the plans this dashboard follows beside its streams, when the set changed. */
function syncPlanFollows(): void {
  const ids = [...watchedPlans.keys()].sort();
  const socket = globalThis.__cawcoSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  const key = ids.join("\u0000");
  if (key === lastPlanFollowKey) {
    return;
  }
  lastPlanFollowKey = key;
  streamHost.sendToHub({ type: "plan.follow", instanceIds: ids });
}

/** One more reader of a session's plan alone: it stays live while any reader remains. */
export function watchPlan(instanceId: string): void {
  watchedPlans.set(instanceId, (watchedPlans.get(instanceId) ?? 0) + 1);
  syncPlanFollows();
}

/** A plan's reader let go; the last one stops following it. */
export function unwatchPlan(instanceId: string): void {
  const count = watchedPlans.get(instanceId);
  if (count === undefined) {
    return;
  }
  if (count > 1) {
    watchedPlans.set(instanceId, count - 1);
    return;
  }
  watchedPlans.delete(instanceId);
  syncPlanFollows();
}

/** A reader let go; the last one stops the instance's frames. */
export function unwatchDelegate(instanceId: string): void {
  const count = watchedDelegates.get(instanceId);
  if (count === undefined) {
    return;
  }
  if (count > 1) {
    watchedDelegates.set(instanceId, count - 1);
    return;
  }
  watchedDelegates.delete(instanceId);
  syncSubscriptions();
}

function send(envelope: Envelope): void {
  const socket = globalThis.__cawcoSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    throw new Error(
      "Not connected to the hub. Check that it is running, then try again."
    );
  }
  clientLine(socket).send(envelope);
}

/**
 * Backs off, but never gives up. A dashboard is a window somebody leaves open:
 * the hub restarting, a laptop sleeping or a dev server reloading all end with
 * the hub coming back, and a client that has stopped trying by then shows stale
 * rows behind a status dot until the tab is reloaded by hand. The delay is
 * capped instead of the attempts, so a long outage costs one poll per
 * `WS_RECONNECT_MAX_DELAY` and no more.
 *
 * `WS_RECONNECT_MAX_ATTEMPTS` now only decides when to stop growing the delay.
 */
function scheduleReconnect(): void {
  const attempt = globalThis.__cawcoReconnectAttempts;
  const delay = Math.min(
    WS_RECONNECT_BASE_DELAY * 2 ** Math.min(attempt, WS_RECONNECT_MAX_ATTEMPTS),
    WS_RECONNECT_MAX_DELAY
  );
  state.retryAt = Date.now() + delay;
  globalThis.__cawcoReconnectTimeout = setTimeout(() => {
    globalThis.__cawcoReconnectAttempts += 1;
    connect();
  }, delay);
}

/**
 * Reconnects now instead of waiting out the backoff. What the reconnect banner
 * calls, and what a tab that just came back to the foreground calls: the delay
 * was chosen while nobody was watching, and a user looking at the window is
 * evidence worth more than the schedule.
 */
export function reconnectNow(): void {
  const socket = globalThis.__cawcoSocket;
  if (
    socket?.readyState === WebSocket.OPEN ||
    socket?.readyState === WebSocket.CONNECTING
  ) {
    return;
  }
  if (globalThis.__cawcoReconnectTimeout) {
    clearTimeout(globalThis.__cawcoReconnectTimeout);
  }
  globalThis.__cawcoReconnectAttempts = 0;
  state.retryAt = null;
  connect();
}

/**
 * Whether this module instance has claimed the socket on `globalThis`. Claiming
 * happens once: the adoption below reads the registry, and reading the registry
 * goes through `waitForOpen`, which calls back in here. Without the latch that
 * is not a slow path, it is a loop that re-enters itself for every catalog it
 * loads and never returns.
 */
let claimed = false;

/**
 * The address this dashboard's socket points at. Exported because a hub it
 * cannot reach is the one moment the address matters to a reader: it is what
 * separates "the hub is not running" from "this page is served from the wrong
 * host", and the two have different fixes.
 */
export function hubSocketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/dashboard`;
}

function connect(): void {
  globalThis.__cawcoDisposing = false;
  teardown();
  state.status = "connecting";

  // The page names the wire it was built for, so the hub sends a page on an
  // older one the snapshot that reloads it and no delta it would misread.
  // …and that it reads parts (`WIRE_PARTS_PARAM`), so a large board can come
  // as parts; a tab from before parts says nothing and is sent it whole.
  const socket = new WebSocket(
    announcingParts(`${hubSocketUrl()}?protocol=${WIRE_PROTOCOL}`)
  );

  // The hub is reached when it speaks, not when the upgrade opens: a proxy in
  // front of it (the dashboard's own server, a preview's relay) accepts the
  // upgrade before it knows whether the hub is there. Counted on open, each
  // such socket reset the backoff to one second and reread the fleet, the
  // build and the policy, every second for as long as the hub was down. The
  // hub's board is the first message on every socket (`olderThanHub`), so the
  // first frame is the proof.
  socket.addEventListener("message", () => hubReached(), { once: true });

  bind(socket);
  // This module made it, so it already owns it: `ensureConnected` has nothing
  // left to adopt, and `hubReached` above is what refreshes.
  claimed = true;
  globalThis.__cawcoSocket = socket;
}

/** The hub answered on the socket `connect` opened: everything a connection is owed. */
function hubReached(): void {
  state.status = "connected";
  state.retryAt = null;
  state.failed = false;
  clearTimeout(outageTimer);
  outageTimer = undefined;
  state.outage = false;
  globalThis.__cawcoReconnectAttempts = 0;
  readFleet();
  // Re-state the subscription on every (re)connect — the hub's registry forgot
  // this dashboard the moment the socket dropped.
  lastSubscriptionKey = "";
  syncSubscriptions();
  lastPlanFollowKey = "";
  syncPlanFollows();
  resumePendingSends(streamState, streamHost);
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the update notice says it when the served build is newer
  void checkServedBuild();
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the settings page and the notice read the policy once it lands
  void updates.loadPolicy();
}

/**
 * Whether this page was built for an older wire than the hub's, settled on
 * the board snapshot before anything in it is applied. The snapshot is the
 * first message on every socket, reconnects included, and the hub sends it
 * again in place of each delta to a page it knows is older; `kind` and
 * `protocol` are the two fields of it no wire version moves (`WIRE_PROTOCOL`).
 *
 * An older page reads nothing more off the socket, the snapshot included,
 * and reloads. The check used to sit at the end of the board handler, after
 * the frame was applied: the first change-only delta left `state.machines`
 * undefined, and every later board frame threw on it before the check ran,
 * so those tabs never reloaded.
 */
function olderThanHub(message: unknown): boolean {
  const { payload } = message as { payload?: FramePayload };
  if (payload?.kind !== "instances") {
    return state.older !== null;
  }
  if (payload.protocol <= WIRE_PROTOCOL) {
    state.older = null;
    return false;
  }
  state.older ??= "reloading";
  // biome-ignore lint/complexity/noVoid: fire-and-forget — a reload ends this page, and one that is held says what holds it
  void reloadWhenIdle((hold) => {
    state.older = hold;
  });
  return true;
}

/**
 * Points a socket's handlers at *this* module's state.
 *
 * The socket is stored on `globalThis` so a module reload never orphans it, but
 * `state` is per module instance. A reloaded module that inherits a live socket
 * therefore inherits handlers that still write to the state nobody is rendering
 * any more: frames keep arriving, the old instance keeps up, and the instance on
 * screen sits at its initial `disconnected` for good. Re-binding is what makes
 * the inherited socket belong to whoever is rendering.
 */
function bind(socket: WebSocket): void {
  // Every frame is read in order through the socket's line, a part's worth
  // per turn, so a large board (sent as parts) never holds the page; the
  // handler is this module's, replacing whatever an earlier module bound.
  const line = clientLine(socket);
  socket.onmessage = (event) => line.receive(String(event.data));
  line.listen((message) => {
    if (olderThanHub(message)) {
      return;
    }
    // A session's own frames are sequenced; everything else — the board,
    // pulses, permissions, replies — is broadcast as an envelope.
    if (handleStreamMessage(streamState, streamHost, message)) {
      sweepOnTraffic();
      return;
    }
    if (
      handlePlanMessage(state.plans, message, (instanceId) =>
        streamHost.sendToHub({ type: "plan.resync", instanceId })
      )
    ) {
      return;
    }
    const envelope = message as Envelope<FramePayload>;
    if (envelope.verb !== "frames") {
      return;
    }
    const { payload } = envelope;
    // The hub's own refusal names the request it answers on the envelope
    // alone: read from the payload only, it settled nothing, and whoever
    // asked waited out the timeout while the reason went to the console.
    handleFrame(
      payload.kind === "error" && !payload.requestId
        ? { ...payload, requestId: envelope.requestId }
        : payload
    );
    sweepOnTraffic();
  });

  socket.onclose = () => {
    state.status = "disconnected";
    // A socket that closed is an attempt that is over, one way or the other.
    state.failed = true;
    cancelFleetRead();
    if (!(state.outage || outageTimer)) {
      outageTimer = setTimeout(() => {
        outageTimer = undefined;
        state.outage = true;
      }, OUTAGE_GRACE);
    }
    abandonInflight("The connection to the hub dropped before that finished.");
    // Subscriptions, resumes and unanswered commands all died with the socket;
    // the cursors do not — resuming from them is what the hub's ring is for.
    // With the host, for the same reason the traffic sweep passes it: a socket
    // that dies mid-command must SAY so, not merely record it.
    noteDisconnect(streamState, Date.now(), streamHost);
    if (!globalThis.__cawcoDisposing) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    // Always followed by `onclose`, which schedules the retry — this only
    // records that the last attempt failed, never that trying has stopped.
    state.status = "error";
    state.failed = true;
  };
}

/** What routes call on mount: the socket is app-scoped, not page-scoped. */
export function ensureConnected(): void {
  const socket = globalThis.__cawcoSocket;
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    if (claimed) {
      return;
    }
    // Adopt it rather than assume somebody else is still listening: the
    // `hubReached` it was made with belongs to the module that made it, so
    // the status has to be read off the socket instead of waited for.
    claimed = true;
    bind(socket);
    if (socket.readyState === WebSocket.OPEN) {
      state.status = "connected";
      state.retryAt = null;
      readFleet();
      lastSubscriptionKey = "";
      syncSubscriptions();
      lastPlanFollowKey = "";
      syncPlanFollows();
      resumePendingSends(streamState, streamHost);
    } else {
      state.status = "connecting";
    }
    return;
  }
  // A navigation is a fresh user intent — earlier exhausted retries don't apply.
  globalThis.__cawcoReconnectAttempts = 0;
  connect();
}

/**
 * The three moments worth more than the backoff schedule: the machine says its
 * network is back, the tab comes to the foreground after a sleep, and the
 * window regains focus. Each means the outage may be over right now, and the
 * timer was set when none of that was known. Registered once per document.
 */
if (typeof window !== "undefined" && !globalThis.__cawcoWakeBound) {
  globalThis.__cawcoWakeBound = true;
  const wake = () => {
    if (document.visibilityState === "hidden") {
      return;
    }
    reconnectNow();
  };
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
}

/** Resolves once the app socket is OPEN, connecting it if needed. */
function waitForOpen(timeoutMs = 5000): Promise<void> {
  ensureConnected();
  const socket = globalThis.__cawcoSocket;
  if (socket && socket.readyState === WebSocket.OPEN) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const current = globalThis.__cawcoSocket;
      if (current && current.readyState === WebSocket.OPEN) {
        return resolve();
      }
      if (Date.now() > deadline) {
        return reject(
          new Error(
            "Could not reach the hub. Check that it is running, then try again."
          )
        );
      }
      setTimeout(poll, 100);
    };
    poll();
  });
}

function userMessage(text: string, uuid: string): SendPayload["message"] {
  return {
    type: "user",
    uuid,
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    // Stamped, not implied. The SDK treats an unstamped message as
    // unattributed and fails it closed at the gates that ask whether a human
    // said this — so a typed sentence has to say that it was typed.
    origin: { kind: "human" },
  };
}

/**
 * A spawn as it leaves this dashboard: a model only when one was picked (none
 * runs on the harness's own default, never an empty string), and a permission
 * mode named exactly when its harness has modes. What the path says stands
 * (the form's choice, the session's own settings); a mode it leaves out is
 * the one the New Session form shows by default ({@link spawnDefaults}). The
 * hub settles the same rule (`settleMode`).
 */
function explicit(machineId: string, payload: SpawnPayload): SpawnPayload {
  const harness = payload.harness ?? "claude";
  const report = state.machines
    .find((machine) => machine.machineId === machineId)
    ?.harnesses?.find((entry) => entry.harness === harness);
  const defaults = spawnDefaults(harness, report);
  const { permissionMode, model, ...rest } = payload;
  // A harness with no permission modes (pi) is sent none, whatever the
  // path carried (a stored row's, a remembered preference).
  const mode =
    report?.capabilities.permissionModes.length === 0
      ? undefined
      : (permissionMode ?? defaults.permissionMode);
  return {
    ...rest,
    ...(model ? { model } : {}),
    ...(mode ? { permissionMode: mode } : {}),
  };
}

/**
 * Sends a spawn and returns the view it streams into once the hub has taken
 * it: its row is open. A spawn the hub refuses throws the hub's reason, and
 * nothing of it is kept here: no view, and no id for a caller to navigate to.
 * Every session this dashboard starts, resumes or forks goes through here.
 */
async function start({
  machineId,
  ...spawn
}: Omit<SpawnPayload, "instanceId"> & {
  machineId: string;
}): Promise<SessionState> {
  const instanceId = newId();
  const requestId = newId();
  const payload = explicit(machineId, { instanceId, ...spawn });
  try {
    await ask<void>(
      requestId,
      "Starting the session",
      CONTROL_TIMEOUT_MS,
      () => {
        opening.set(instanceId, requestId);
        send({ verb: "spawn", machineId, instanceId, requestId, payload });
      }
    );
  } finally {
    opening.delete(instanceId);
  }
  const created = session(instanceId);
  created.machineId = machineId;
  created.cwd = payload.cwd;
  created.harness = payload.harness ?? "claude";
  created.permissionMode = payload.permissionMode ?? null;
  // What was sent, so the header shows it during the wait for the first
  // init — which then corrects it to whatever the harness resolved it to.
  created.model = payload.model ?? null;
  created.scratch = Boolean(payload.scratch);
  return created;
}

/**
 * Starts a session on `machineId` and returns the id its route lives at, once
 * the hub has taken the spawn ({@link start}). A spawn the hub refuses throws
 * the hub's reason, and its first prompt is never sent.
 */
export async function spawnSession({
  machineId,
  cwd,
  prompt,
  harness,
  permissionMode,
  model,
  effort,
  scratch,
  bootstrap,
  projectId,
  account,
  extras = {},
}: {
  machineId: string;
  cwd: string;
  prompt?: string;
  /** What rides the first message besides its words: its attachments and images, as a send carries them. */
  extras?: SendExtras;
  harness?: HarnessKind;
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  scratch?: SpawnPayload["scratch"];
  bootstrap?: SpawnPayload["bootstrap"];
  projectId?: string;
  /** The account picked for this session; absent: the hub places it. */
  account?: string;
}): Promise<string> {
  const created = await start({
    machineId,
    cwd,
    harness,
    permissionMode,
    model,
    effort,
    scratch,
    bootstrap,
    projectId,
    ...(account ? { account } : {}),
  });
  const first = prompt?.trim() ?? "";
  if (first || extras.images?.length || extras.attachments?.length) {
    // Followed before its first message goes, on the socket that carries it:
    // that send's record is among the first frames the session's stream
    // carries, and a tab that joined after it would never hear it.
    subscribeSession(streamState, streamHost, created.instanceId);
    submitCommand(created.instanceId, machineId, "send", {
      text: first,
      extras,
    });
  }
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the session already started locally, this just resyncs the fleet list
  void refresh();
  return created.instanceId;
}

/**
 * Branches a spin-off off a session (NEW.md §1): the same context carried into
 * a new SDK session, kept apart from mainline work until it is kept or
 * discarded. The hub reads the conversation it branches into the new view's
 * transcript. A fork the hub refuses throws the hub's reason ({@link start}).
 */
export async function forkSession({
  machineId,
  cwd,
  sessionId,
  harness = "claude",
  at,
}: {
  machineId: string;
  cwd: string;
  sessionId: string;
  harness?: HarnessKind;
  at?: string;
}): Promise<string> {
  // The branch runs on what its source runs on, never on the machine's
  // defaults: the hub's row for the conversation says what that is.
  const source = instanceForSession(instanceIndex, sessionId, {
    machineId,
    cwd,
  });
  const created = await start({
    machineId,
    cwd,
    harness,
    resume: {
      sessionKey: sessionId,
      fork: true,
      ...(at ? { atMessage: at } : {}),
    },
    scratch: {},
    ...(source?.model ? { model: source.model } : {}),
    // A branch is a new session nobody picked a mode for, so a Full Send
    // source branches on Bypass (`unpickedMode`): Full Send is only ever a
    // confirmed choice.
    ...(source?.permissionMode
      ? {
          permissionMode: unpickedMode(source.permissionMode as PermissionMode),
        }
      : {}),
    ...(isEffortLevel(source?.effort) ? { effort: source.effort } : {}),
  });
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the session already started locally, this just resyncs the fleet list
  void refresh();
  return created.instanceId;
}

/** What a turn carries besides its typed text — pastes turned into chips, images. */
export type SendExtras = Pick<SendPayload, "attachments" | "images"> & {
  selections?: PendingSelection[];
};

/**
 * What a send does to the LOCAL store: the row it draws under the message's
 * own uuid (`sending`, at the end, until the hub's record for it lands on the
 * same row), the busy flip, the working clock.
 */
function noteSendSubmitted(
  instanceId: string,
  text: string,
  extras: SendExtras,
  commandId: string,
  /**
   * The failed send this one retries. It draws no row until the hub takes
   * it: then its record's row arrives as the failed one folds away.
   */
  replaces?: string
): void {
  const target = session(instanceId);
  const drawn = target.local.find((message) => message.id === commandId);
  if (drawn) {
    // Try again on a send that never reached the hub: the same row, on its
    // way again.
    const { sendFailed: _failed, ...kept } = drawn.metadata ?? {};
    drawn.state = "sending";
    drawn.metadata = kept;
  } else if (
    replaces === undefined &&
    // A send the hub already placed is drawn by the hub's row for it.
    !target.messages.some((message) => message.id === commandId)
  ) {
    target.local.push(
      localUserMessage(instanceId, commandId, text, selectionExtras(extras))
    );
    place(target);
  }
  // A new attempt replaces the last one's announcement rather than stacking on
  // it: the live region says what is true now, not what was true before.
  sendFailureNotices[instanceId] = "";
  target.busy = true;
  // Before any frame: the whole point of the clock is the wait for the first one.
  trackWorking(target);
}

/**
 * The other half of durability: a message to a dead session revives it first.
 * The daemon respawns the same instance with `resume`, then the text goes
 * through as usual — the reader never has to know the process died.
 */
/**
 * Brings a dead-but-resumable session back before anything is asked of it.
 * A process can die between one action and the next — a daemon restart, a
 * crash — and the reader should not have to know which of their actions
 * happens to revive it. Returns once the session can take work again.
 */
/**
 * The harness key a spawn resumes an instance under. The hub row is the one
 * authority: it holds what the daemon recorded when the session named itself,
 * and a view id — a CawCo instance id — is never a key, whatever shape it
 * has. A row without a key has nothing to resume by, and this says so rather
 * than guessing: two opencode sessions were lost to a resume that sent the
 * instance id in the key's place. Only an id the hub does not hold at all — a
 * stored transcript browsed under its own key — answers from the store, which
 * by then carries what the transcript read's header or the catalog entry named.
 */
function resumeKeyFor(instanceId: string): string | null {
  const row = instanceIndex.byId.get(instanceId);
  if (row) {
    return row.sessionId ?? null;
  }
  return state.sessions[instanceId]?.sessionId ?? null;
}

export async function ensureAlive(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  const row = instanceIndex.byId.get(instanceId);
  const dead =
    row &&
    (row.status === "error" ||
      row.status === "stopped" ||
      row.status === "sleeping");
  if (dead) {
    // The one decision every revive takes (core `relaunchOf`): on its
    // conversation by the key on record, never a guessed one; fresh when its
    // harness never began one; not at all when its conversation is gone.
    const plan = relaunchOf({
      sessionId: resumeKeyFor(instanceId),
      lastError: row.lastError,
    });
    if (plan.kind === "refused") {
      throw new Error(plan.reason);
    }
    const requestId = newId();
    const payload = explicit(machineId, {
      instanceId,
      cwd: target.cwd,
      harness: target.harness,
      ...(plan.kind === "resume"
        ? { resume: { sessionKey: plan.sessionKey } }
        : {}),
      scratch: target.scratch ? {} : undefined,
      // The new process answers the way the old one did: a revive nobody asked
      // for is not the moment to hand the session back on other settings.
      //
      // Falls back to the row, because the store learns these from a running
      // session and a dead one has told it nothing — a tab opened after the
      // process died holds `null` for both, and sending nothing is how a
      // session comes back asking permission for everything.
      permissionMode: (target.permissionMode ??
        row?.permissionMode ??
        undefined) as PermissionMode | undefined,
      model: target.model ?? row?.model ?? undefined,
      effort: effortToResend(target.effort ?? row?.effort),
      requestId,
    });
    target.relaunching = true;
    try {
      await ask<void>(requestId, "revive", CONTROL_TIMEOUT_MS, () =>
        send({ verb: "spawn", machineId, instanceId, requestId, payload })
      );
    } finally {
      target.relaunching = false;
    }
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the revive already landed, this just resyncs the fleet list
    void refresh();
  }
}

export function stopSession(instanceId: string, machineId: string): void {
  const target = session(instanceId);
  const before = {
    busy: target.busy,
    currentTool: target.currentTool,
    openBlock: target.openBlock,
    thinkingStream: target.thinkingStream,
    thinkingClosing: target.thinkingClosing,
    thinkingSince: target.thinkingSince,
    pending: target.pending,
    workingSince: target.workingSince,
  };
  const requestId = newId();
  const payload: StopPayload = { instanceId, requestId };
  settleStopped(instanceId);
  ask<void>(requestId, "stop", CONTROL_TIMEOUT_MS, () =>
    send({ verb: "stop", machineId, instanceId, requestId, payload })
  )
    .catch((error: unknown) => {
      Object.assign(target, before);
      toast.error(error instanceof Error ? error.message : String(error));
    })
    .finally(() => refresh());
}

/**
 * Throws a spin-off away: the session stops and the agent tears down whatever
 * the spawn created for it. Resolves once the agent confirms the teardown, so a
 * worktree that could not be removed is reported rather than silently left.
 */
export async function discardSession(
  instanceId: string,
  machineId: string
): Promise<void> {
  const requestId = newId();
  const payload: StopPayload = { instanceId, discard: true, requestId };
  settleStopped(instanceId);

  try {
    await ask<void>(requestId, "discard", DISCARD_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
  } finally {
    delete state.sessions[instanceId];
    await refresh();
  }
}

/**
 * Moves a session whole to another account of its provider
 * (`POST /api/instances/:id/account`): now when it is at rest, else at its
 * next turn boundary. A refusal is thrown in the hub's own sentence; an
 * answer that is not a sentence (a route's JSON) is named by its status.
 */
export async function moveInstanceAccount(
  instanceId: string,
  accountId: string
): Promise<void> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/account`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    }
  );
  if (!response.ok) {
    const said = response.headers.get("content-type")?.startsWith("text/")
      ? (await response.text()).trim()
      : "";
    throw new Error(
      said ||
        `The hub answered ${response.status}, so the session stayed on its account.`
    );
  }
}

/**
 * The owner's name for a session the hub keeps. It outranks the name the
 * session gives itself (`set_title`), which the hub refuses from then on;
 * the new name reaches every dashboard through the instance-update frame.
 */
export async function renameInstance(
  instanceId: string,
  title: string
): Promise<void> {
  const response = await fetch(`/api/instances/${instanceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not rename this session — the hub answered ${response.status}. Try again.`
    );
  }
}

/**
 * Promotes a spin-off to mainline work: the UI stops setting it apart, and
 * the tag that kept its transcript out of the machine's catalog comes off, so
 * the session joins the history it was being hidden from.
 */
export async function keepSession(instanceId: string): Promise<void> {
  const target = session(instanceId);
  const response = await fetch(`/api/instances/${instanceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "mainline" }),
  });
  if (!response.ok) {
    throw new Error(
      `Could not keep this session — the hub answered ${response.status}. Try again.`
    );
  }

  target.scratch = false;
  if (target.sessionId && target.machineId) {
    // `null` is how the harness clears a tag; the catalog is re-read for the
    // entry that has just stopped being hidden.
    await machineControl(
      target.machineId,
      "tagSession",
      [target.sessionId, null, { dir: target.cwd || undefined }],
      CONTROL_TIMEOUT_MS,
      target.harness
    );
    await loadCatalog(target.machineId);
  }
}

/** The view state a session leaves behind once it is no longer running. */
function settleStopped(instanceId: string): void {
  const target = session(instanceId);
  target.busy = false;
  target.currentTool = null;
  clearTurnPhase(target);
  // The agent denies whatever was parked as it tears the session down, so these
  // answer to nobody — leaving them would pin a dead session to the fleet rail.
  target.pending = [];
  trackWorking(target);
}

function control(
  instanceId: string,
  machineId: string,
  method: string,
  args: unknown[]
): void {
  const payload: ControlPayload = {
    instanceId,
    requestId: newId(),
    method,
    args,
  };
  send({
    verb: "control",
    machineId,
    instanceId,
    requestId: payload.requestId,
    payload,
  });
}

/**
 * Asks the session's preview to be brought into view: a phone's sheet comes
 * back to its middle snap from wherever the reader left it.
 */
export function revealPreview(instanceId: string): void {
  state.previewRequests[instanceId] =
    (state.previewRequests[instanceId] ?? 0) + 1;
}

export async function openPreview(
  instanceId: string,
  source: PreviewAsk
): Promise<void> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/preview`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(source),
    }
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  handleFrame(await response.json());
}

/** The choices a session's open preview keeps (Projects spec §5.7). */
export async function previewChoices(
  instanceId: string
): Promise<CanvasChoices> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/preview/choices`
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

/** Stores one change the page asked for; answers the canvas's choices as the hub now keeps them. */
export async function changePreviewChoice(
  instanceId: string,
  change: ChoiceChange
): Promise<CanvasChoices> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/preview/choices`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(change),
    }
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

/** Sends the person's picks to the session, as one message; a page's own words go below them. */
export async function sendPreviewChoices(
  instanceId: string,
  text?: string
): Promise<CanvasChoices> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/preview/choices/send`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(text ? { text } : {}),
    }
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function closePreview(instanceId: string): Promise<void> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/preview`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const previous = state.previews[instanceId];
  if (previous) {
    state.previews[instanceId] = { ...previous, state: "closed" };
  }
}

/**
 * A control call about the machine rather than a session — the SDK's module-level
 * session functions. The reply is correlated by `requestId`, which the hub routes
 * back to this socket alone.
 */
export async function machineControl<T>(
  machineId: string,
  method: string,
  args: unknown[] = [],
  replyTimeoutMs = CONTROL_TIMEOUT_MS,
  harness?: HarnessKind
): Promise<T> {
  await waitForOpen();
  const requestId = newId();
  const payload: ControlPayload = {
    requestId,
    method,
    args,
    ...(harness && { harness }),
  };
  return ask<T>(requestId, method, replyTimeoutMs, () =>
    send({ verb: "control", machineId, requestId, payload })
  );
}

/**
 * The `fs` verb (NEW.md §6): a machine's files, for the docs rail and the light
 * markdown editing on top of it. Answered by `requestId` like a control call.
 */
export async function machineFs<T>(
  machineId: string,
  op: FsPayload["op"],
  path: string,
  content?: string,
  /** `path` is relative to this root, as the machine places it (`FsPayload.root`). */
  root?: FsPayload["root"]
): Promise<T> {
  await waitForOpen();
  const requestId = newId();
  const payload: FsPayload = {
    requestId,
    op,
    path,
    content,
    ...(root ? { root } : {}),
  };
  return ask<T>(requestId, `fs ${op} ${path}`, CONTROL_TIMEOUT_MS, () =>
    send({ verb: "fs", machineId, requestId, payload })
  );
}

/**
 * New project (`POST /api/projects`), made with Caw: its one place is its
 * folder on the hub until setup picks its checkout. `template` is written as
 * its stages.md; `prompt` opens its Setup thread (as the message `promptId`)
 * and wakes Caw to set it up. The hub's refusal is its own words.
 */
export async function createProject(project: {
  name: string;
  template?: string;
  prompt: string;
  promptId: string;
}): Promise<ProjectRow & { place: ProjectPlace; setupThread?: ThreadSummary }> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...project, caw: true }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the project was not made. Try again.`
    );
  }
  const created = (await response.json()) as ProjectRow & {
    place: ProjectPlace;
    setupThread?: ThreadSummary;
  };
  if (created.setupThread) {
    adoptThread(created.setupThread);
  }
  await refresh();
  return created;
}

/**
 * A project from a folder on a machine (New Session's project chip): that
 * checkout its primary. A checkout of a repository a project already has
 * joins that project as a place instead; `place` is the folder asked about.
 */
export async function projectAtFolder(project: {
  name: string;
  cwd: string;
  machineId: string;
}): Promise<ProjectRow & { place: ProjectPlace; placeAdded: boolean }> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the project was not saved. Try again.`
    );
  }
  const created = (await response.json()) as ProjectRow & {
    place: ProjectPlace;
    placeAdded: boolean;
  };
  await refresh();
  return created;
}

/** A checkout of the project, by machine and folder (`POST /api/projects/:id/places`); the first is its primary. */
export async function addProjectPlace(
  projectId: string,
  checkout: { machineId: string; path: string }
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/places`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(checkout),
    }
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the place was not added.`
    );
  }
  await refresh();
}

/** Sets the fleet's two choices (`PUT /api/fleet/choices`): delegates instead of subagents, CawCo's to-dos. */
export async function setFleetChoices(choices: {
  delegates?: boolean;
  todos?: boolean;
}): Promise<void> {
  const response = await fetch("/api/fleet/choices", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(choices),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the fleet's choices were not set.`
    );
  }
}

/**
 * A session's plan, read now (`GET /api/instances/:id/plan`); its followers
 * hear the same plan live through {@link cawco.planOf}.
 */
export async function planOf(instanceId: string): Promise<SessionPlan> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}/plan`
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the plan is not known.`
    );
  }
  return (await response.json()) as SessionPlan;
}

/** The standing "make this a project" offers, as the hub holds them now. */
async function readProjectOffers(): Promise<void> {
  const offers = await load<ProjectOfferSummary[]>("/api/project-offers");
  if (offers) {
    state.projectOffers = Object.fromEntries(
      offers.map((offer) => [offer.instanceId, offer])
    );
  }
}

/** What "Create project" did: the project, and the plan items it filed as proposed tasks. */
export interface ProjectOfferAccepted {
  joined: boolean;
  project: { id: string; name: string };
  sessions: string[];
  /** A new project's Setup thread, where its Caw sets it up; none when the folder joined one. */
  setupThread?: ThreadSummary;
  tasks: { id: string; title: string }[];
  unfiled: { title: string; why: string }[];
}

/**
 * Answers a session's offer. "Create project" makes (or joins, by remote) the
 * project from the session's folder and moves the session and its delegates
 * into it; "Not now" is recorded, and the session is never offered again.
 */
export async function answerProjectOffer(
  instanceId: string,
  answer: "accept" | "dismiss"
): Promise<ProjectOfferAccepted | null> {
  const response = await fetch(
    `/api/project-offers/${encodeURIComponent(instanceId)}/${answer}`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so nothing changed. Try again.`
    );
  }
  delete state.projectOffers[instanceId];
  if (answer === "dismiss") {
    return null;
  }
  const accepted = (await response.json()) as ProjectOfferAccepted;
  if (accepted.setupThread) {
    adoptThread(accepted.setupThread);
  }
  await refresh();
  return accepted;
}

// --- a project's Caw, its threads and views ---------------------------------

const projectPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;

/** Newest message first: the order the hub lists threads in. */
const byLastAt = (a: ThreadSummary, b: ThreadSummary): number =>
  b.lastAt - a.lastAt || (a.id < b.id ? 1 : -1);

/** A thread's row as the hub has it now: placed in its project's list, newest first. */
function adoptThread(thread: ThreadSummary): void {
  const list = state.threads[thread.projectId] ?? [];
  const held = list.find((row) => row.id === thread.id);
  if (held && equal(held, thread)) {
    return;
  }
  state.threads[thread.projectId] = [
    thread,
    ...list.filter((row) => row.id !== thread.id),
  ].sort(byLastAt);
}

/** A message added to a thread this tab has read; a thread not read yet is read whole when it opens. */
function adoptThreadMessage(threadId: string, message: ThreadMessage): void {
  const messages = state.threadMessages[threadId];
  if (messages && !messages.some((held) => held.id === message.id)) {
    messages.push(message);
  }
}

/** Every project's threads (`GET /api/threads`): the whole truth on each connect. */
async function readThreads(): Promise<void> {
  const threads = await load<Record<string, ThreadSummary[]>>("/api/threads");
  if (threads) {
    state.threads = threads;
  }
}

/** A project's Caw: on or off, its harness, its session, why it cannot start, its spend. */
export const cawOf = (projectId: string): Promise<CawView> =>
  askHub(`${projectPath(projectId)}/caw`);

/** Turns a project's Caw on or off, or moves it to another harness or model (null: the harness's default). */
export const configureCaw = (
  projectId: string,
  change: { harness?: CawHarness; model?: string | null; on?: boolean }
): Promise<CawView> =>
  askHub(`${projectPath(projectId)}/caw`, json("PATCH", change));

/** A project's threads as the fleet read and the frames keep them, newest first. */
export const threadsOf = (projectId: string): ThreadSummary[] =>
  state.threads[projectId] ?? [];

/** Reads a thread whole; `thread.message` frames keep it from then on. */
export async function readThread(
  projectId: string,
  threadId: string
): Promise<ThreadRead> {
  const read = await askHub<ThreadRead>(
    `${projectPath(projectId)}/threads/${encodeURIComponent(threadId)}`
  );
  state.threadMessages[threadId] = read.messages;
  adoptThread(read.thread);
  return read;
}

/**
 * Starts a thread with your first message; Caw is woken with it. `id` is the
 * message's, chosen here as a session's composer chooses its own: the row it
 * becomes lands the words that flew under it, whenever the hub draws it.
 */
export async function startThread(
  projectId: string,
  body: string,
  id?: string
): Promise<ThreadSaid> {
  const said = await askHub<ThreadSaid>(
    `${projectPath(projectId)}/threads`,
    json("POST", { body, ...(id ? { id } : {}) })
  );
  state.threadMessages[said.thread.id] ??= [];
  adoptThreadMessage(said.thread.id, said.message);
  adoptThread(said.thread);
  return said;
}

/** Writes in a thread; Caw is woken with it. `id` as for {@link startThread}. */
export async function sayInThread(
  projectId: string,
  threadId: string,
  body: string,
  id?: string
): Promise<ThreadSaid> {
  const said = await askHub<ThreadSaid>(
    `${projectPath(projectId)}/threads/${encodeURIComponent(threadId)}/messages`,
    json("POST", { body, ...(id ? { id } : {}) })
  );
  adoptThreadMessage(threadId, said.message);
  adoptThread(said.thread);
  return said;
}

/** A project's views: kept ones, then Caw's drafts. */
export const viewsOf = (projectId: string): Promise<ProjectView[]> =>
  askHub(`${projectPath(projectId)}/views`);

/** Keeps a draft view: it becomes `views/<name>.json`, one commit. */
export const keepView = (
  projectId: string,
  name: string
): Promise<ProjectView> =>
  askHub(
    `${projectPath(projectId)}/views/${encodeURIComponent(name)}/keep`,
    json("POST", {})
  );

/** Discards a draft view. */
export const discardView = (
  projectId: string,
  name: string
): Promise<{ ok: true }> =>
  askHub(`${projectPath(projectId)}/views/drafts/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });

/** "Ask Caw for a view": a new thread with your words, Caw woken to draft it. */
export async function requestView(
  projectId: string,
  text: string
): Promise<ThreadSaid> {
  const said = await askHub<ThreadSaid>(
    `${projectPath(projectId)}/view-requests`,
    json("POST", { text })
  );
  state.threadMessages[said.thread.id] ??= [];
  adoptThreadMessage(said.thread.id, said.message);
  adoptThread(said.thread);
  return said;
}

/** What a project's views bind to, computed by the hub now. */
export const viewData = (projectId: string): Promise<ViewData> =>
  askHub(`${projectPath(projectId)}/view-data`);

/** What a project has spent: today, this month, its Caw's share, each attempt and thread. */
export const projectSpend = (projectId: string): Promise<ProjectSpend> =>
  askHub(`${projectPath(projectId)}/spend`);

/** Sets what an attempt at the project's tasks may spend; null clears it. */
/**
 * Sets the project's spend cap — dollars a day or a month, or none — and what
 * reaching it does, its own or (null) the fleet's.
 */
export const setProjectCap = (
  projectId: string,
  change: {
    onCap: OnCap | null;
    period: "day" | "month" | null;
    usd: number | null;
  }
): Promise<{ cap: ProjectCap | null }> =>
  askHub(`${projectPath(projectId)}/cap`, json("PUT", change));

/** What reaching a project's cap does where the project sets nothing. */
export const spendSettings = (): Promise<{ onCap: OnCap }> =>
  askHub("/api/spend-settings");

export const setSpendSettings = (onCap: OnCap): Promise<{ onCap: OnCap }> =>
  askHub("/api/spend-settings", json("PUT", { onCap }));

export const setProjectBudget = (
  projectId: string,
  budget: ProjectSpend["budget"]
): Promise<unknown> =>
  askHub(`${projectPath(projectId)}/dispatch`, json("PATCH", { budget }));

/** Forgets the project; the sessions started from it stay, just unattached. */
/**
 * Forgets a project. The hub refuses while any of its sessions still runs
 * (409, saying how many); that answer is thrown as it is. The board's list
 * keeps the project until `readProjects`: the forget dialog first takes the
 * reader off the project's page, so the page never stands on a project the
 * list no longer has.
 */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `Could not forget this project — the hub answered ${response.status}. Try again.`
    );
  }
}

/** Reads the projects again, as the hub has them now. */
export async function readProjects(): Promise<void> {
  const projects = await load<ProjectRow[]>("/api/projects");
  if (projects) {
    state.projects = reconcileRows(state.projects, projects, (row) => row.id);
  }
}

/**
 * The hub said the projects changed (`projects.changed`: a place came or
 * went): one read at a time, and one more after it for whatever a burst of
 * workspaces opening said meanwhile.
 */
let projectsReading: Promise<void> | null = null;
let projectsAgain = false;
function rereadProjects(): void {
  if (projectsReading) {
    projectsAgain = true;
    return;
  }
  projectsReading = readProjects()
    .catch(() => undefined)
    .finally(() => {
      projectsReading = null;
      if (projectsAgain) {
        projectsAgain = false;
        rereadProjects();
      }
    });
}

/** One running session of a project, in tree order (parents first). */
export interface RunningSession {
  cwd: string;
  id: string;
  machineId: string;
  /** Its machine is not connected: it stops when its machine is back. */
  offline: boolean;
  /** The nearest running session it is a delegate of; null for a lead. */
  parentId: string | null;
  title: string | null;
}

/** A project's running sessions as the hub lists them: what a forget stops first. */
export async function projectRunning(id: string): Promise<RunningSession[]> {
  const response = await fetch(`/api/projects/${id}/running`);
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `Could not list this project's sessions — the hub answered ${response.status}. Try again.`
    );
  }
  return ((await response.json()) as { sessions: RunningSession[] }).sessions;
}

const projectStopListeners = new Set<(frame: ProjectStopFrame) => void>();

/**
 * Hears each `project.stop` frame: a session a forget asked to stop has
 * stopped (its machine confirmed), or could not be. Returns the unsubscribe.
 */
export function onProjectStop(
  listener: (frame: ProjectStopFrame) => void
): () => void {
  projectStopListeners.add(listener);
  return () => projectStopListeners.delete(listener);
}

/**
 * Stops the named sessions of a project in one request. Each one's outcome
 * arrives later, by `onProjectStop`, as its machine confirms the end.
 */
export async function stopProjectSessions(
  id: string,
  instanceIds: string[]
): Promise<void> {
  const response = await fetch(`/api/projects/${id}/stop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instanceIds }),
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `Could not stop this project's sessions — the hub answered ${response.status}. Try again.`
    );
  }
}

/**
 * Forgets an offline machine: its row, its projects and its session rows. The
 * hub refuses a machine that is online, and says why; that answer is thrown
 * as it is, for the confirm dialog to show under its question.
 */
export async function removeMachine(machineId: string): Promise<void> {
  const response = await fetch(`/api/agents/${encodeURIComponent(machineId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the machine was not removed. Try again.`
    );
  }
  await refresh();
}

/**
 * Deletes a session's transcript on its machine — the one way a transcript is
 * deleted, from a stored row or a sleeping one. The hub sees the delete go
 * past and, once the machine confirms it, drops every row that named it; the
 * catalog is read again here so the stored list agrees.
 */
export async function deleteTranscript(
  machineId: string,
  sessionId: string,
  dir: string | undefined,
  harness: HarnessKind | undefined
): Promise<void> {
  await machineControl(
    machineId,
    "deleteSession",
    [sessionId, { dir }],
    undefined,
    harness
  );
  await loadCatalog(machineId);
}

/**
 * Removes a session that never started: no transcript, no process. The hub
 * refuses any other kind and says why; that answer is thrown as it is, for
 * the confirm dialog to show under its question.
 */
export async function removeSession(instanceId: string): Promise<void> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw new Error(
      (await response.text()) ||
        `The hub answered ${response.status}, so the session was not removed. Try again.`
    );
  }
  await refresh();
}

/** Sends something the agent answers by `requestId`, and waits for that answer. */
function ask<T>(
  requestId: string,
  label: string,
  timeoutMs: number,
  dispatch: () => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (inflight.delete(requestId)) {
        reject(
          new Error(
            `${label} got no answer in time. The machine may be offline.`
          )
        );
      }
    }, timeoutMs);
    inflight.set(requestId, {
      resolve: (result) => {
        clearTimeout(timer);
        resolve(result as T);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    try {
      dispatch();
    } catch (error) {
      clearTimeout(timer);
      inflight.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/** The machine's stored sessions, newest first. */
export async function loadCatalog(machineId: string): Promise<void> {
  try {
    const listed = await machineControl<NeutralSessionInfo[]>(
      machineId,
      "listSessions",
      [SESSION_CATALOG_LIMIT > 0 ? { limit: SESSION_CATALOG_LIMIT } : {}]
    );
    catalog = { ...catalog, [machineId]: listed };
  } catch (error) {
    console.error(`[cawco] listSessions on ${machineId} failed:`, error);
  } finally {
    catalogsTried[machineId] = true;
  }
}

/**
 * How a stored transcript read ended. A read that fails with nothing on screen
 * has to be *said* — a stored session whose machine is asleep otherwise sits on
 * an empty pane forever, which reads as a broken link rather than an
 * unreachable machine.
 */
export type TranscriptOutcome =
  /**
   * `skipped` marks an `ok` that read nothing because a read was already in
   * hand — in flight, or landed — so a caller looking at an empty view knows
   * the emptiness is not this read's answer.
   */
  | { ok: true; skipped?: boolean }
  /** `status` is the hub's HTTP answer where there was one: 404 is "no such session", not a fault. */
  | ({ ok: false; status?: number } & ReadFault);

/** Puts a session back to "nothing has been said about the read" — Try again's first move. */
export function clearReadFault(instanceId: string): void {
  const held = state.sessions[instanceId];
  if (held) {
    held.readFault = null;
  }
}

/**
 * The newest transcript page the server read for a view, or how the hub
 * refused it — what `/session/[id]`'s server load hands the pane it names.
 */
export type ServerTail =
  | { ok: true; page: TranscriptPage; viewId: string }
  | {
      detail: string;
      /** The machine a 503 named as not connected, else null. */
      machineId: string | null;
      ok: false;
      status: number;
      viewId: string;
    };

/**
 * Why a transcript read failed, said the way the pane says it. `away` is the
 * machine a 503 named: that is the hub saying the machine is not connected —
 * a state of the fleet, not a fault in the read, and a different sentence.
 */
export function readFaultOf(detail: string, away: string | null): ReadFault {
  if (away) {
    const machine = state.machines.find((row) => row.machineId === away);
    return {
      reason: "offline",
      machineId: away,
      message: `${machine?.hostname || away} is offline — its stored transcript can't be read right now.`,
    };
  }
  return { reason: "failed", message: detail };
}

/** Why a page read ended with nothing, said the way the pane says it. */
async function pageFault(response: Response): Promise<TranscriptOutcome> {
  const { detail } = await hubFailure(response);
  const away =
    response.status === 503 ? response.headers.get("x-cawco-machine") : null;
  return { ok: false, status: response.status, ...readFaultOf(detail, away) };
}

/**
 * A session's transcript, read once: the newest page the hub built, then its
 * stream from the `seq` that page was read at. `again` reads it whether or not
 * the view already holds one — the hub said the transcript changed under it,
 * or its stream could not replay a gap. A read already in flight answers for
 * any ask that lands meanwhile, unless `fresh`: its reader left the view and
 * came back, so that read is ended unanswered and a new one starts.
 */
export function readTranscript(
  viewId: string,
  again = false,
  fresh = false
): Promise<TranscriptOutcome> {
  // A workflow run's tab has no transcript of its own: its steps' do. A
  // thread's is its messages (`readThread`).
  if (runIdOf(viewId) || isThreadTab(viewId)) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  const inFlight = pageReads.get(viewId);
  if (inFlight && !fresh) {
    return inFlight.read;
  }
  inFlight?.cancel();
  // A stream this view already follows carries everything after the page it
  // was read at — or, for a session this tab just started, everything there
  // is.
  if (!again && streamState.cursors[viewId]?.subscribed) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  const controller = new AbortController();
  const read: Promise<TranscriptOutcome> = readNewestPage(
    session(viewId),
    controller.signal
  ).finally(() => {
    // Only this read's own entry: a fresh one may have taken the slot.
    if (pageReads.get(viewId)?.read === read) {
      pageReads.delete(viewId);
    }
  });
  pageReads.set(viewId, { read, cancel: () => controller.abort() });
  return read;
}

/**
 * One request for a transcript page, aborted when its response, or its body,
 * takes longer than {@link TRANSCRIPT_READ_LIMIT_MS}, or when `cancel` fires.
 * `parse` runs while the body can still be cut off.
 */
async function requestPage<T>(
  url: string,
  parse: (response: Response) => Promise<T>,
  cancel?: AbortSignal
): Promise<T> {
  const request = new AbortController();
  const stop = () => request.abort(cancel?.reason);
  cancel?.addEventListener("abort", stop, { once: true });
  // WebKit rejects an aborted fetch with its own "Fetch is aborted", whatever
  // reason the abort carried, so the limit's sentence is thrown from here.
  const late = new Error(
    `The hub did not answer within ${TRANSCRIPT_READ_LIMIT_MS / 1000} seconds`
  );
  let timedOut = false;
  const limit = () =>
    setTimeout(() => {
      timedOut = true;
      request.abort(late);
    }, TRANSCRIPT_READ_LIMIT_MS);
  let timer = limit();
  try {
    const response = await fetch(url, { signal: request.signal });
    // The response is in; the body gets a limit of its own, so a page that is
    // slow but moving is not mistaken for one that never came.
    clearTimeout(timer);
    timer = limit();
    return await parse(response);
  } catch (error) {
    throw timedOut ? late : error;
  } finally {
    clearTimeout(timer);
    cancel?.removeEventListener("abort", stop);
  }
}

/**
 * A transcript page, requested and — when that request fails or times out —
 * requested once more at once. A hub that answers, with a page or a refusal,
 * is an answer and is not asked twice. The second failure is thrown.
 */
async function readPage<T>(
  url: string,
  parse: (response: Response) => Promise<T>,
  cancel?: AbortSignal
): Promise<T> {
  try {
    return await requestPage(url, parse, cancel);
  } catch (error) {
    if (cancel?.aborted) {
      throw error;
    }
    return await requestPage(url, parse, cancel);
  }
}

/**
 * The newest page into the view, and its stream resumed from the page's
 * `seq`. Nothing older is read here: the view asks for it a page at a time,
 * as its reader nears the first rows it holds ({@link readOlderPage}).
 *
 * `cancel` fires when a fresh read took this one's place: whatever this one
 * would have said is dropped, and it answers `skipped`.
 */
async function readNewestPage(
  target: SessionState,
  cancel: AbortSignal
): Promise<TranscriptOutcome> {
  const viewId = target.instanceId;
  beginRead(streamState, viewId);
  // A stored session's plan is still on its machine, and no frame will ever
  // arrive to say so — opening it is the only moment there is to ask.
  refreshTasks(viewId);
  target.loading = true;
  // The `/` palette's servers and tools are read beside the transcript: the
  // board's rows do not carry them. A session with no hub row has none.
  // biome-ignore lint/complexity/noVoid: runs beside the transcript read; the palette reads it off the session when it lands
  void fetch(`/api/instances/${encodeURIComponent(viewId)}/tooling`)
    .then(async (answer) => {
      if (answer.ok) {
        target.tooling = (await answer.json()) as SessionTooling;
      }
    })
    .catch((error: unknown) => {
      console.warn(
        `[cawco] Could not read session tooling: ${messageOf(error)}`
      );
    });
  try {
    const answer = await readPage<
      | { page: TranscriptPage; fault?: undefined }
      | { fault: TranscriptOutcome; page?: undefined }
    >(
      transcriptUrl(viewId),
      async (response) =>
        response.ok
          ? { page: (await response.json()) as TranscriptPage }
          : { fault: await pageFault(response) },
      cancel
    );
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    if (answer.fault) {
      if (!answer.fault.ok) {
        target.readFault = answer.fault;
      }
      return answer.fault;
    }
    target.readFault = null;
    adoptTranscriptPage(target, answer.page);
    adoptPage(streamState, streamHost, viewId, answer.page.seq ?? 0);
    trackWorking(target);
  } catch (error) {
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    target.readFault = { reason: "failed", message };
    return { ok: false, reason: "failed", message };
  } finally {
    // A read that was replaced leaves `loading` to the one that replaced it.
    if (!cancel.aborted) {
      target.loading = false;
    }
  }
  return { ok: true };
}

/** The page that ends at `cursor`, or why it could not be read. */
async function olderPage(
  viewId: string,
  cursor: string
): Promise<TranscriptPage | ReadFault> {
  try {
    return await readPage(
      transcriptUrl(viewId, { cursor, limit: TRANSCRIPT_OLDER_PAGE }),
      async (response) => {
        if (response.ok) {
          return (await response.json()) as TranscriptPage;
        }
        const { detail } = await hubFailure(response);
        return readFaultOf(
          detail,
          response.status === 503
            ? response.headers.get("x-cawco-machine")
            : null
        );
      }
    );
  } catch (error) {
    return {
      reason: "failed",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * The one page older than what a view holds, put in front of it. Asked for by
 * whoever is reading near the first rows held — never ahead of a reader. One
 * page is out at a time, and nothing is asked once the conversation's start
 * is in hand or while the newest page is itself being read. An answer that
 * comes back to a transcript read again since, or to a cursor that has moved,
 * is dropped. A page that could not be read leaves the cursor where it was
 * and says why ({@link SessionState.olderFault}): asking again asks for the
 * same page.
 */
export function readOlderPage(viewId: string): Promise<void> {
  // The page already out answers for any ask that lands meanwhile.
  const inFlight = olderReads.get(viewId);
  if (inFlight) {
    return inFlight;
  }
  const target = state.sessions[viewId];
  const cursor = target?.cursor;
  if (!(target && cursor) || target.loading) {
    return Promise.resolve();
  }
  const read = readOlderInto(target, cursor);
  olderReads.set(viewId, read);
  return read;
}

/** The older-page reads in flight, by view: one page is out at a time. */
const olderReads = new Map<string, Promise<void>>();

async function readOlderInto(
  target: SessionState,
  cursor: string
): Promise<void> {
  const viewId = target.instanceId;
  const { reads } = target;
  target.hydrating = true;
  target.olderFault = null;
  const answer = await olderPage(viewId, cursor);
  // The read is over before anything it brought is written. Whoever its page
  // wakes asks for the next one in that same pass — a transcript reading back
  // to its reader's place, an open well reading to its start — and handed
  // this read again, they waited on a page already in: cleared behind the
  // writes, a reload far up a long transcript read one page and stopped,
  // with the tab blank behind its skeleton.
  olderReads.delete(viewId);
  target.hydrating = false;
  if (target.reads !== reads || target.cursor !== cursor) {
    return;
  }
  if ("blocks" in answer) {
    prependTranscriptPage(target, answer);
  } else {
    target.olderFault = answer;
  }
}

export function interrupt(instanceId: string, machineId: string): void {
  control(instanceId, machineId, "interrupt", []);
  const target = session(instanceId);
  target.busy = false;
  // The block the partials were painting is not being finished, and a session
  // with a subagent still out stays "working" — long enough for a trace nobody
  // is writing any more to read as one that is.
  clearTurnPhase(target);
  trackWorking(target);
}

/**
 * Changes how a live session answers permissions, from now on. Unlike the other
 * instance controls this one is awaited: the view already shows the mode that
 * was asked for, so a machine that refuses has to be able to put it back.
 */
export async function setPermissionMode(
  instanceId: string,
  machineId: string,
  mode: PermissionMode
): Promise<void> {
  // Switching a setting on a session whose process died must not fail:
  // revive it first, then apply.
  await ensureAlive(instanceId, machineId);
  const target = session(instanceId);
  const previous = target.permissionMode;
  target.permissionMode = mode;

  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "setPermissionMode",
    args: [mode],
  };
  try {
    await ask<void>(requestId, "setPermissionMode", CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
  } catch (error) {
    target.permissionMode = previous;
    throw error;
  }
  // Only once the daemon has taken it: a refused switch never reaches the row.
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the daemon already took it, this just persists it
  void persistSettings(instanceId, { permissionMode: mode });
}

/**
 * How full the session's context window is, straight from the SDK — the same
 * reading `/context` shows, so the dock never has to estimate it from token
 * counts it saw go past. A `Query` method, so only a live session can answer;
 * a dead one keeps its last number rather than dropping to zero, which would
 * read as "empty" when it means "nobody asked".
 */
export async function refreshContext(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (target.contextPending) {
    return;
  }
  target.contextPending = true;
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "getContextUsage",
    args: [],
  };
  try {
    const usage = await ask<{
      totalTokens: number;
      maxTokens: number;
      percentage: number;
      categories: { name: string; tokens: number; color: string }[];
    }>(requestId, "getContextUsage", CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
    target.context = {
      totalTokens: usage.totalTokens,
      maxTokens: usage.maxTokens,
      percentage: usage.percentage,
      // "Free space" is the remainder, not a consumer: showing it as a slice
      // would make every session look mostly full of nothing.
      categories: usage.categories.filter((row) => row.name !== "Free space"),
      readAt: Date.now(),
    };
    target.contextError = null;
  } catch (cause) {
    // A session that cannot answer keeps the last reading; the reason is kept
    // beside it so the details can say why rather than "not reported".
    target.contextError =
      cause instanceof Error ? cause.message : String(cause);
  } finally {
    target.contextPending = false;
  }
}

/**
 * The models this session offers. `supportedModels` is a `Query` method, so it
 * is only answerable while the session is up — the answer is the same account's
 * either way, so `models.svelte.ts` asks once through whoever is running and
 * keeps it for the whole app.
 */
// biome-ignore lint/suspicious/useAwait: async is kept intentionally so the returned promise settles on its own microtask, matching every other ask()-wrapping export here
export async function loadModels(
  instanceId: string,
  machineId: string
): Promise<ModelInfo[]> {
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "supportedModels",
    args: [],
  };
  return ask<ModelInfo[]>(
    requestId,
    "supportedModels",
    CONTROL_TIMEOUT_MS,
    () => send({ verb: "control", machineId, instanceId, requestId, payload })
  );
}

/**
 * A refusal because the session is in custody — being handed back after an
 * agent restart. Expected for a moment, and the next ask gets through, so it
 * is not an error to log or to show.
 */
export const isCustodyRefusal = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("(custody)");

/** A `SlashCommand[]` answer as the lookup the menu reads its prose from. */
const detailsOf = (commands: SlashCommand[]): Map<string, SlashCommand> =>
  new Map(commands.map((command) => [command.name, command]));

/**
 * The menu asks the session what it has every time the reader opens it,
 * throttled to once per three seconds. Init and `commands_changed` are the
 * free prefill.
 */
export async function refreshCommands(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (target.commandsPending || Date.now() - target.commands.at < 3000) {
    return;
  }
  target.commandsPending = true;

  const request = <T>(method: string): Promise<T> => {
    const requestId = newId();
    const payload: ControlPayload = {
      instanceId,
      requestId,
      method,
      args: [],
    };
    return ask<T>(requestId, method, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
  };
  try {
    const commands = await request<SupportedCommands>(
      CONTROL_SUPPORTED_COMMANDS
    );
    target.commands.names = commands.map((command) => command.name);
    target.commands.detailed = detailsOf(commands);
    if (commands.some((command) => command.kind)) {
      target.commands.skills = commands
        .filter((command) => command.kind === "skill")
        .map((command) => command.name);
    }
  } catch (error) {
    if (!isCustodyRefusal(error)) {
      console.error(
        `[cawco] supportedCommands on ${instanceId} failed:`,
        error
      );
    }
  } finally {
    target.commands.at = Date.now();
    target.commandsPending = false;
  }
}

/** The bare `mcpServerStatus` call; what the caller does with a refusal differs. */
function askMcp(
  instanceId: string,
  machineId: string
): Promise<McpServerStatus[]> {
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "mcpServerStatus",
    args: [],
  };
  return ask<McpServerStatus[]>(
    requestId,
    "mcpServerStatus",
    CONTROL_TIMEOUT_MS,
    () => send({ verb: "control", machineId, instanceId, requestId, payload })
  );
}

/**
 * Which MCP servers this session runs, so a tool card can name the server a
 * call went to (transcript/ToolGroup). `mcpServerStatus` is a Query method, so
 * only a live session answers. A failed ask stores `[]`
 * rather than staying null: null is what re-triggers the asking effect, and a
 * machine that cannot answer must not be asked in a loop.
 */
export async function loadMcpServers(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (target.mcp !== null || target.mcpPending) {
    return;
  }
  target.mcpPending = true;

  try {
    target.mcp = await askMcp(instanceId, machineId);
  } catch (error) {
    if (!isCustodyRefusal(error)) {
      console.error(`[cawco] mcpServerStatus on ${instanceId} failed:`, error);
    }
    target.mcp = [];
  } finally {
    target.mcpPending = false;
  }
}

/**
 * Points the session at another model from the next turn on. Awaited like the
 * permission mode and for the same reason: the header already shows the choice,
 * so a machine that refuses has to be able to put it back.
 */
export async function setModel(
  instanceId: string,
  machineId: string,
  model: string
): Promise<void> {
  // Switching a setting on a session whose process died must not fail:
  // revive it first, then apply.
  await ensureAlive(instanceId, machineId);
  const target = session(instanceId);
  const previous = target.model;
  target.model = model;

  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "setModel",
    args: [model],
  };
  try {
    await ask<void>(requestId, "setModel", CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
  } catch (error) {
    target.model = previous;
    throw error;
  }
  // Only once the daemon has taken it: a refused switch never reaches the row.
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the daemon already took it, this just persists it
  void persistSettings(instanceId, { model });
}

/**
 * The effort a new process for this session is started at: the level it was
 * sending, and nothing when it sent none or was never read — the harness then
 * starts it on the model's own default.
 */
function effortToResend(
  effort: SessionEffort | null | undefined
): EffortLevel | undefined {
  return isEffortLevel(effort) ? effort : undefined;
}

/**
 * `bypassPermissions` is a launch decision — the SDK refuses to switch a running
 * session into it — and so is `fullSend`, which runs the CLI in bypass. A
 * session that wants either from another mode is started again in place:
 * same instance id, same hub row, its own SDK session resumed, so the new
 * process reads the whole conversation back. A spin-off relaunches the same
 * way; the agent keeps it in the checkout it was already working in.
 */
export async function relaunchSession(
  instanceId: string,
  machineId: string,
  permissionMode: PermissionMode
): Promise<void> {
  const target = session(instanceId);
  const sessionKey = resumeKeyFor(instanceId);
  if (!sessionKey) {
    throw new Error(
      `no session key on record for ${instanceId}; cannot resume`
    );
  }

  const requestId = newId();
  const payload = explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: target.harness,
    resume: { sessionKey },
    // A relaunch is a spawn like any other, so it has to say what it is: a spin-off
    // that stayed silent about it would come back as mainline work, untagged.
    scratch: target.scratch ? {} : undefined,
    permissionMode,
    // Only the mode is being changed, so the model the session was answering on
    // and the level it was thinking at both carry over — the spawn is the row's
    // new word on all three.
    model: target.model ?? undefined,
    effort: effortToResend(target.effort),
    requestId,
  });

  const previous = target.permissionMode;
  // Work the relaunch interrupts must resume on its own: the reader unblocked
  // the session, they should not also have to nudge it.
  const hadWork = target.busy || target.pending.length > 0;
  target.permissionMode = permissionMode;
  target.relaunching = true;
  // Whatever was in flight belongs to the process being replaced.
  settleStopped(instanceId);
  try {
    await ask<void>(requestId, "relaunch", CONTROL_TIMEOUT_MS, () =>
      send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    if (hadWork) {
      submitCommand(instanceId, machineId, "send", {
        text: `The permission mode is now "${permissionMode}". Continue the interrupted work.`,
      });
    }
  } catch (error) {
    target.permissionMode = previous;
    throw error;
  } finally {
    target.relaunching = false;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the relaunch already landed, this just resyncs the fleet list
    void refresh();
  }
}

/**
 * Where a rewind lands: the assistant frame `resumeSessionAt` names.
 *
 * The SDK resumes "up to and including" an `SDKAssistantMessage.uuid`, so the
 * anchor has to be an assistant frame — and one that ended in words. A frame
 * whose blocks include a tool call would resume into a `tool_use` with no
 * result behind it, which the API refuses outright, so the search walks past
 * those to the last turn that closed.
 */
function rewindPoint(target: SessionState, id: string): string | null {
  const edited = target.messages.findIndex((message) => message.id === id);
  if (edited < 0) {
    return null;
  }
  const calls = toolFrames(target.messages);
  for (let index = edited - 1; index >= 0; index -= 1) {
    const { type, sdkUuid: uuid } = target.messages[index];
    if (type !== "assistant" || !uuid || calls.has(uuid)) {
      continue;
    }
    return uuid;
  }
  return null;
}

/**
 * Where a rewind lands, read back to when the rows held do not reach it. A
 * view holds the newest page and what its reader scrolled up to, so the
 * answered turn before one of its first messages can be on a page not read
 * yet: the pages before are read, one at a time, until one holds it. Null
 * only once the conversation's start is in hand, or a page could not be read.
 */
async function rewindPointBehind(
  target: SessionState,
  id: string
): Promise<string | null> {
  let point = rewindPoint(target, id);
  while (!point && target.cursor && !target.loading) {
    const { cursor } = target;
    // biome-ignore lint/performance/noAwaitInLoops: each page starts where the last one ended
    await readOlderPage(target.instanceId);
    point = rewindPoint(target, id);
    // The cursor did not move: the page failed, or its answer was dropped.
    if (target.cursor === cursor) {
      break;
    }
  }
  return point;
}

/** The uuids of assistant frames that asked for a tool — never a rewind anchor. */
function toolFrames(messages: Message[]): Set<string | undefined> {
  return new Set(
    messages
      .filter(
        (message) =>
          message.type === "tool.use" || message.type === "tool.handoff"
      )
      .map((message) => message.sdkUuid)
  );
}

export function rewindableTurns(target: SessionState): Set<string> {
  const turns = new Set<string>();
  const calls = toolFrames(target.messages);
  // An anchor on an older page is resolved by rewindPointBehind on demand.
  let anchored = target.cursor !== null;
  for (const message of target.messages) {
    if (
      message.type === "user" &&
      anchored &&
      message.state !== "sending" &&
      message.state !== "pending" &&
      message.state !== "failed" &&
      message.state !== "unreached"
    ) {
      turns.add(message.id);
    }
    if (
      message.type === "assistant" &&
      message.sdkUuid &&
      !calls.has(message.sdkUuid)
    ) {
      anchored = true;
    }
  }
  return turns;
}

export async function forkFrom(
  instanceId: string,
  id: string
): Promise<string> {
  const target = session(instanceId);
  const sessionKey = resumeKeyFor(instanceId);
  if (!(target.machineId && sessionKey)) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const point = await rewindPointBehind(target, id);
  if (!point) {
    throw new Error(
      "There is no answered turn behind this message to branch from."
    );
  }
  return forkSession({
    machineId: target.machineId,
    cwd: target.cwd,
    sessionId: sessionKey,
    harness: target.harness,
    at: point,
  });
}

/**
 * Says a turn again, differently. The session is started back up in place at
 * the answer before the edited message — same instance id, same SDK session,
 * `resumeSessionAt` cutting the conversation there — and the new wording goes
 * through as an ordinary turn, so everything the old one led to is gone from
 * both the screen and the session the next process reads back.
 */
export async function editAndResend(
  instanceId: string,
  id: string,
  content: string
): Promise<void> {
  const target = session(instanceId);
  const { machineId } = target;
  if (!machineId) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const sessionKey = resumeKeyFor(instanceId);
  if (!sessionKey) {
    throw new Error(
      `no session key on record for ${instanceId}; cannot resume`
    );
  }
  // OpenCode reverts the selected user turn; Claude resumes through the
  // preceding completed assistant frame.
  const point =
    target.harness === "opencode"
      ? target.messages.find((message) => message.id === id)?.sdkUuid
      : await rewindPointBehind(target, id);
  if (!point) {
    throw new Error("This message has no stored rewind point.");
  }

  const requestId = newId();
  const payload = explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: target.harness,
    resume: { sessionKey, atMessage: point },
    // The same four a relaunch carries: a rewind changes what the session has
    // said, not what it is.
    scratch: target.scratch ? {} : undefined,
    permissionMode: target.permissionMode ?? undefined,
    model: target.model ?? undefined,
    effort: effortToResend(target.effort),
    requestId,
  });

  // The hub cuts the transcript back to the answer the rewind lands on as it
  // starts the process, and puts it back whole if the spawn never lands; every
  // screen reads the cut from it.
  // Whatever was in flight belongs to the process being replaced.
  settleStopped(instanceId);
  target.relaunching = true;
  try {
    await ask<void>(requestId, "rewind", CONTROL_TIMEOUT_MS, () =>
      send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    submitCommand(instanceId, machineId, "send", { text: content });
  } finally {
    target.relaunching = false;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the relaunch already landed, this just resyncs the fleet list
    void refresh();
  }
}

/** The answers a permission card offers — the keyboard has one key for each. */
export type PermissionAnswer = "allow" | "deny" | "always";

/**
 * What an answer means on the wire. `always` hands the SDK's own suggestions
 * back as `updatedPermissions`: they are what stops the next identical call
 * from asking again, and the SDK is the only one that knows how to phrase them.
 */
export function permissionAnswer(
  request: PendingPermission,
  answer: PermissionAnswer
): PermissionResult {
  if (answer === "deny") {
    return { behavior: "deny", message: "User denied permission" };
  }
  return {
    behavior: "allow",
    updatedInput: request.input,
    ...(answer === "always" && { updatedPermissions: request.suggestions }),
  };
}

/**
 * Every permission waiting on the user, across every machine. This is the
 * question the fleet view exists to answer, so it is derived from the sessions
 * themselves rather than tracked separately.
 */
function blockedRequests(): BlockedRequest[] {
  // A session the hub says has ended (stopped, discarded, asleep, failed)
  // answers to nobody; its asks are not the operator's. One whose machine
  // the hub cannot reach (`unknown`) may still be running and waiting: its
  // asks stay, marked stale, so "needs you" is never a false negative
  // (PRODUCT.md) while a machine or the hub is away. Across a reconnect the
  // asks themselves hold as last read until the hub's snapshot replaces
  // them (`adoptPending`).
  const ended = new Set(
    instances
      .filter((row) => !(isLive(row) || isStale(row)))
      .map((row) => row.id)
  );
  const away = new Set(instances.filter(isStale).map((row) => row.id));

  const rows: BlockedRequest[] = [];
  for (const target of Object.values(state.sessions)) {
    if (target.pending.length === 0 || ended.has(target.instanceId)) {
      continue;
    }
    const machine = state.machines.find(
      (row) => row.machineId === target.machineId
    );
    for (const request of target.pending) {
      // A delegate's ask is the parent's to answer, not the user's: it stays on
      // the delegate's own transcript but never lands in this queue.
      if (routedToParent(request)) {
        continue;
      }
      rows.push({
        instanceId: target.instanceId,
        machineId: target.machineId,
        hostname: machine?.hostname ?? target.machineId,
        cwd: target.cwd,
        request,
        stale: away.has(target.instanceId),
      });
    }
  }
  return rows;
}

/** What the palette groups by: what this machine was given, then the harness's own. */
const COMMAND_ORDER: Record<AvailableCommand["type"], number> = {
  skill: 0,
  custom: 1,
  builtin: 2,
  mcp: 3,
};

/**
 * Where a command came from, when its own name says: a plugin component wears
 * its plugin (`plugin:command`), an MCP prompt its server (`mcp__server__prompt`).
 */
function sourceOf(name: string): string | undefined {
  if (name.startsWith("mcp__")) {
    return name.split("__")[1] || undefined;
  }
  const namespace = name.indexOf(":");
  return namespace > 0 ? name.slice(0, namespace) : undefined;
}

/**
 * One session's `/` menu: every name it listed, wearing whatever
 * `supportedCommands` has since said about it. The init frame leads because it
 * arrives on every turn and is free — the descriptions are one lazy call behind
 * it, and are all there is before the first init.
 */
function availableCommands({
  names,
  skills,
  detailed,
}: CommandState): AvailableCommand[] {
  const listed = names.length > 0 ? names : [...(detailed?.keys() ?? [])];
  return listed
    .map((name) => {
      const known = detailed?.get(name);
      return {
        name,
        // Both are required strings to the SDK, which sends '' for "none".
        description: known?.description || undefined,
        argumentHint: known?.argumentHint || undefined,
        type: classifyCommand(known ?? { name }, skills),
        source: sourceOf(name),
      };
    })
    .sort(
      (a, b) =>
        COMMAND_ORDER[a.type] - COMMAND_ORDER[b.type] ||
        a.name.localeCompare(b.name)
    );
}

/**
 * A branch is a real subagent iff it was spawned with a `subagent_type` that is
 * not the `branchFor` placeholder default. Background Bash tasks fire
 * `task_started` without a `subagent_type`, so they keep the default and are
 * filtered out of the rail's subagent list.
 */
const isRealSubagent = (branch: SubagentState): boolean =>
  branch.subagentType !== "subagent";

/** Running first, then starting, then error, then complete; within each, newest activity first. */
const STATUS_RANK: Record<string, number> = {
  running: 0,
  starting: 1,
  error: 2,
  complete: 3,
};
const branchOrder = (a: SubagentState, b: SubagentState): number => {
  const rankA = STATUS_RANK[a.status] ?? 3;
  const rankB = STATUS_RANK[b.status] ?? 3;
  if (rankA !== rankB) {
    return rankA - rankB;
  }
  const timeA = Date.parse(a.lastEventAt ?? a.startedAt);
  const timeB = Date.parse(b.lastEventAt ?? b.startedAt);
  return timeB - timeA;
};

export const cawco = {
  get fleetMcp() {
    return state.fleetMcp;
  },
  /** The first REST read of machines, sessions and projects is in. */
  get fleetRead() {
    return state.fleetRead;
  },
  /** The socket's first full snapshot, pulses included, is in. */
  get liveRead() {
    return state.liveRead;
  },
  /** Every online machine's stored sessions have been read, or failed to be. */
  get catalogsRead() {
    return (
      state.fleetRead &&
      state.machines
        .filter((machine) => machine.status === "online")
        .every((machine) => catalogsTried[machine.machineId])
    );
  },
  /** One machine's stored sessions have been read, or failed to be. */
  catalogRead: (machineId: string): boolean =>
    catalogsTried[machineId] === true,
  get status() {
    return state.status;
  },
  /** {@link HubState} — the socket's state as something worth saying out loud. */
  get hub(): HubState {
    if (state.status === "connected") {
      return "connected";
    }
    return state.outage ? "unreachable" : "connecting";
  },
  /**
   * Whether the last attempt to reach the hub came back empty-handed. What
   * separates "still connecting, on a cold load" from "cannot be reached" —
   * the banner is only ever true of the second.
   */
  get connectFailed() {
    return state.failed;
  },
  get retryAt() {
    return state.retryAt;
  },
  /**
   * What holds the reload of a page built for an older wire than the hub's;
   * null on the hub's wire and while the reload is on its way. Such a page
   * has stopped reading the hub, so the connection band says so.
   */
  get reloadHold(): ReloadHold | null {
    return state.older === "reloading" ? null : state.older;
  },
  /** What a session has been handed and not yet answered; `null` for most. */
  handoffFor: (instanceId: string): { from: string; at: number } | null =>
    state.handoffs[instanceId] ?? null,
  /** The continuations the hub is carrying, settled ones for a few minutes after. */
  get continuations(): ContinuationJob[] {
    return state.continuations;
  },
  /** One continuation the hub is carrying, while it keeps it in its table. */
  continuation: (id: string): ContinuationJob | undefined =>
    state.continuations.find((job) => job.id === id),
  /** The project moves the hub is carrying, settled ones for a few minutes after (move.svelte.ts). */
  get moves(): MoveJob[] {
    return state.moves;
  },
  get machines() {
    return state.machines;
  },
  /** What the hub is running, or `undefined` from a hub that predates C2. */
  get hubBuild() {
    return state.hubBuild;
  },
  get onlineMachines() {
    return state.machines.filter((machine) => machine.status === "online");
  },
  /** Every machine's Claude reading, by machineId (every usage surface). */
  get claudeLimits(): Readonly<Record<string, ClaudeLimits>> {
    return state.usageLimits;
  },
  /** Every machine's OpenCode Go windows, by machineId. */
  get openCodeGoLimits(): Readonly<Record<string, OpenCodeGoLimits>> {
    return state.openCodeGoLimits;
  },
  /** The hub's accounts, their sign-ins and catalogs; null until read. */
  get accounts(): AccountsView | null {
    return state.accounts;
  },
  /** The account picker's rows, every provider the fleet knows; null until read. */
  get accountProviders(): ProviderChoice[] | null {
    return state.accountProviders;
  },
  /** The hub's limit readings have landed at least once. */
  get usageLimitsRead() {
    return state.usageLimitsRead;
  },
  /** The fleet's spend, the hub's one figure; null until it is read. */
  get spend(): UsageSpend | null {
    return state.spend;
  },
  /** The hub could not be asked for spend, and no frame has brought it since. */
  get spendFailed() {
    return state.spendFailed;
  },
  get instances() {
    return instances;
  },
  get instanceIndex() {
    return instanceIndex;
  },
  get previews() {
    return state.previews;
  },
  get previewRequests() {
    return state.previewRequests;
  },
  get runningInstances() {
    return runningInstances;
  },
  /** Running sessions as lists show them: leads as their threads (thread-tabs.ts `inLists`). */
  get runningRows() {
    return runningRows;
  },
  /** Listed sessions as lists show them: leads as their threads. */
  get listedRows() {
    return listedRows;
  },
  /** Sessions that are a project's lead: never listed, nor their stored transcripts. */
  get leadSessions() {
    return leadSessions;
  },
  /** Sessions the hub lost track of — shown apart, never as live work. */
  get staleInstances(): InstanceRow[] {
    return staleInstances;
  },
  /** Mainline sessions on one machine — what the sidebar groups under it. */
  listedOn,
  /** The ones the hub can still reach: what this machine is doing right now. */
  liveOn: (machineId: string): InstanceRow[] =>
    listedOn(machineId).filter(isLive),
  /**
   * The ones whose process is gone — asleep, or failed. A different question
   * from the live list, so it is a different list rather than a heading that
   * changes its mind about what it is over.
   */
  notRunningOn: (machineId: string): InstanceRow[] =>
    listedOn(machineId).filter((row) => !isLive(row)),
  /** Every session the rail lists: live work, plus what failed or fell asleep. */
  get listedInstances(): InstanceRow[] {
    return listedInstances;
  },
  /**
   * Every workflow run as a session row (workflow-runs.ts), for the lists
   * that show runs the way they show sessions: Working, Finished, projects.
   */
  get runRows(): InstanceRow[] {
    return boardRuns;
  },
  /** Every thread with a project's Caw, as session rows (thread-tabs.ts). */
  get threadRows(): InstanceRow[] {
    return threadRows;
  },
  /** The thread a `thread:` id names, when this browser has it. */
  threadOf,
  /** Spin-offs across the fleet — kept in their own section, not per machine. */
  get scratchInstances(): InstanceRow[] {
    return instances.filter((row) => isListed(row) && row.kind === "scratch");
  },
  /** Stored sessions on one machine, minus the spin-offs hiding among them. */
  catalogOf: (machineId: string): NeutralSessionInfo[] =>
    (catalog[machineId] ?? []).filter(listedInHistory),
  /** Whether {@link catalogOf} has anything, asked without building it: it stops at the first. */
  hasStored: (machineId: string): boolean =>
    (catalog[machineId] ?? []).some(listedInHistory),
  get projects() {
    return state.projects;
  },
  projectsOn: (machineId: string): ProjectRow[] =>
    state.projects.filter((project) => placedOn(project, machineId)),
  project: (id: string): ProjectRow | null =>
    state.projects.find((project) => project.id === id) ?? null,
  /** The project's spend cap while it holds the project back now; null otherwise. */
  capHolding: (id: string): ProjectCap | null => {
    const cap =
      state.projects.find((project) => project.id === id)?.cap ?? null;
    return capHolds(cap, minute.now) ? cap : null;
  },
  /** The projects whose spend cap holds them back now. */
  get capped(): ProjectRow[] {
    return state.projects.filter((project) =>
      capHolds(project.cap, minute.now)
    );
  },
  /** The minute, for what reads a clock (ages, resets). */
  get now(): number {
    return minute.now;
  },
  /** A project's threads with its Caw, newest first, live. */
  threadsOf,
  /** A thread's messages, oldest first, once {@link readThread} read it; null before. */
  /** A count that moves each time the project's tasks change (`tasks.changed`). */
  tasksChangedOf: (projectId: string): number =>
    state.tasksChanged[projectId] ?? 0,
  threadMessagesOf: (threadId: string): ThreadMessage[] | null =>
    state.threadMessages[threadId] ?? null,
  session: (instanceId: string): SessionState | null =>
    state.sessions[instanceId] ?? null,
  /**
   * The hub's record of one delegate's exchange with its parent, oldest first.
   * Empty for a delegate whose traffic predates the table — its card falls back
   * to reading the markers out of the parent's transcript.
   */
  delegateEventsOf: (instanceId: string): DelegateEvent[] =>
    state.delegateEvents[instanceId] ?? [],
  /**
   * The work items a session's tray knows of, oldest first: the ones it
   * delegated, and as its project's lead the ones it co-parents.
   */
  workItemsOf: (instanceId: string): WorkItemSummary[] =>
    Object.values(state.workItems)
      .filter(
        (item) =>
          item.parentInstanceId === instanceId ||
          item.leadInstanceId === instanceId
      )
      .sort((a, b) => a.createdAt - b.createdAt),
  /** A followed session's plan, live: its steps, its spec, an attempt's to-dos. */
  planOf: (instanceId: string): SessionPlan | undefined =>
    state.plans[instanceId]?.plan,
  /** The "make this a project" offer standing on a session, if one does. */
  projectOfferOf: (instanceId: string): ProjectOfferSummary | undefined =>
    state.projectOffers[instanceId],
  /** The work item a delegate session runs, when its parent's tray was told of it. */
  workItemFor: (instanceId: string): WorkItemSummary | undefined =>
    Object.values(state.workItems).find(
      (item) => item.instanceId === instanceId
    ),
  /** The supervisor's intervention log, newest first, capped in memory. */
  get supervisorEvents(): SupervisorEvent[] {
    return state.supervisorEvents;
  },
  /** Supervisor events for one session, newest first. */
  supervisorEventsOf: (instanceId: string): SupervisorEvent[] =>
    state.supervisorEvents.filter((e) => e.instanceId === instanceId),
  /**
   * The supervisor's live presence for one session, time-bounded at read:
   * an evaluation older than the engine's own budget means the terminal
   * frame was lost — show nothing rather than a stuck halo; a settled
   * verdict is only worth pulsing for a moment.
   */
  supervisorActivityOf: (instanceId: string) => {
    const activity = state.supervisorActivity[instanceId];
    if (!activity) {
      return;
    }
    if (
      activity.phase === "evaluating" &&
      Date.now() - activity.since > 300_000
    ) {
      return;
    }
    if (activity.phase === "settled" && Date.now() - activity.at > 2600) {
      return;
    }
    return activity;
  },
  /** The ask a permission requestId belongs to, whichever delegate raised it. */
  delegateAskOf: (requestId: string): DelegateAskEvent | null => {
    for (const events of Object.values(state.delegateEvents)) {
      const found = events.find(
        (event) => event.kind === "ask" && event.requestId === requestId
      );
      if (found?.kind === "ask") {
        return found;
      }
    }
    return null;
  },
  /** What a session needs from you — `idle` for one nothing has been heard from. */
  activityOf: (instanceId: string): Activity => {
    const run = runOf(instanceId);
    if (run) {
      return runDoing(run.status);
    }
    const thread = threadOf(instanceId);
    if (thread) {
      return THREAD_DOING[thread.status];
    }
    const target = state.sessions[instanceId];
    // Blocked wins everywhere: a parked permission is broadcast, not filtered.
    if (target && target.pending.length > 0) {
      return "blocked";
    }
    const pulse = state.pulses[instanceId];
    if (
      pulse?.activity === "blocked" &&
      !(target && isSubscribed(instanceId))
    ) {
      return "blocked";
    }
    if ((instanceIndex.byId.get(instanceId)?.runningDelegates ?? 0) > 0) {
      return "working";
    }
    // An open session's frames are live and authoritative; anything else falls
    // back to the daemon's pulse — the only word on a session this browser has
    // not subscribed to, whose frame-fed state is frozen at the tab that closed.
    if (target && isSubscribed(instanceId)) {
      return activityOf(target);
    }
    if (pulse) {
      return pulse.activity;
    }
    return target ? activityOf(target) : "idle";
  },
  /**
   * Whether the session's own main loop is in a turn, its delegates and
   * subagents aside: what a project's Caw is doing himself, where
   * `activityOf` counts a lead as working while any attempt it parents runs.
   * The same sources as `activityOf`: an open session's frames, else the
   * daemon's pulse.
   */
  busyOf: (instanceId: string): boolean => {
    const target = state.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.busy;
    }
    return state.pulses[instanceId]?.busy ?? false;
  },
  currentToolOf: (
    instanceId: string
  ): { name: string; glance: string } | null => {
    const runId = runIdOf(instanceId);
    if (runId) {
      // A run is doing whichever of its steps is running.
      const detail = workflowState.details[runId];
      const step = detail?.steps.find((each) => each.status === "running");
      return detail && step
        ? {
            name: stepTitle(detail, step),
            glance: "",
          }
        : null;
    }
    const target = state.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.currentTool;
    }
    return state.pulses[instanceId]?.currentTool ?? null;
  },
  /**
   * When the daemon last pulsed a session, ms epoch — the freshest signal a
   * rail has for an unsubscribed session, since the pulse is broadcast for
   * every session while its transcript frames only flow to a watcher. A
   * run's is when it last moved.
   */
  pulseAt: (instanceId: string): number | undefined => {
    const run = runOf(instanceId);
    if (run) {
      return runMovedAt(run, workflowState.details[run.id]?.steps);
    }
    const thread = threadOf(instanceId);
    if (thread) {
      return thread.lastAt;
    }
    return state.pulses[instanceId]?.at;
  },
  /** When the session's current turn began, ms epoch; `undefined` while it is idle. A run's turn is the run. */
  turnSince: (instanceId: string): number | undefined => {
    const run = runOf(instanceId);
    return run ? runSince(run) : state.turnSince[instanceId];
  },
  /** When the hub parked a waiting workflow run's question, ms epoch. */
  runAskRaisedAt: (runId: string): number | undefined =>
    state.runAskRaisedAt[runId],
  /** The line saying an ask was withdrawn unanswered; none for one answered or still waiting. */
  withdrawnAsk: (requestId: string): Message | undefined =>
    state.withdrawnAsks[requestId],
  /**
   * The ledger stats the fleet table shows per session — turns, context %, cost.
   * Only populated for a session this browser has state for (subscribed / a turn
   * has closed); `null` otherwise, which the table renders as an em dash.
   */
  statsOf: (
    instanceId: string
  ): {
    turns: number | null;
    contextPct: number | null;
    totalTokens: number | null;
    maxTokens: number | null;
    cost: number | null;
  } => {
    const t = state.sessions[instanceId];
    if (!t) {
      return {
        turns: null,
        contextPct: null,
        totalTokens: null,
        maxTokens: null,
        cost: null,
      };
    }
    const turns = t.messages.filter((m) => m.type === "assistant").length;
    return {
      turns: turns > 0 ? turns : null,
      contextPct: t.context?.percentage ?? null,
      totalTokens: t.context?.totalTokens ?? null,
      maxTokens: t.context?.maxTokens ?? null,
      cost: t.totalCost ?? null,
    };
  },
  /** What a session offers behind `/`, grouped the way the palette lists it. */
  /**
   * The MCP servers and tools the session's newest `init` announced: the hub's
   * stored copy, read as the view opened, then each live `init` — so a reload
   * or a hub restart keeps them. Empty for a harness whose `init` carries
   * neither, and for a view not opened yet.
   */
  toolingOf: (instanceId: string): SessionTooling =>
    state.sessions[instanceId]?.tooling ?? { servers: [], tools: [] },
  commandsOf: (instanceId: string): AvailableCommand[] => {
    const target = state.sessions[instanceId];
    return target ? availableCommands(target.commands) : [];
  },
  /** The subagents a session has out, sorted by state then recency. */
  subagentsOf: (instanceId: string): SubagentState[] =>
    Object.values(state.sessions[instanceId]?.subagents ?? {})
      .filter(isRealSubagent)
      .sort(branchOrder),
  /** Background tasks that are not real subagents. */
  backgroundTasksOf: (instanceId: string): number =>
    Object.values(state.sessions[instanceId]?.subagents ?? {}).filter(
      (branch) => !isRealSubagent(branch)
    ).length,
  /** Just the count of running *real* subagents, for the badge. */
  runningSubagentsOf: (instanceId: string): number => {
    const target = state.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return runningSubagents(target.subagents);
    }
    return state.pulses[instanceId]?.runningSubagents ?? 0;
  },
  get blocked(): BlockedRequest[] {
    return blockedRequests();
  },
  get blockedCount(): number {
    return (
      blockedRequests().length +
      Object.values(workflowState.runs).filter(
        (run) => run.status === "waiting"
      ).length
    );
  },
};
