/**
 * The browser end of the Envelope spine: one WebSocket to the hub, the frames
 * it returns folded into per-instance UI state (NEW.md §6).
 */
import type {
  AgentRow,
  AvailableCommand,
  BuildInfo,
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
  HistoryLine,
  InstanceRow,
  McpServerStatus,
  ModelInfo,
  NeutralSessionInfo,
  NeutralStatus,
  OpenCodeGoLimits,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  PreviewSource,
  SendPayload,
  SendRecord,
  SessionEffort,
  SessionMessage,
  SessionPulse,
  SessionTooling,
  SlashCommand,
  SpawnPayload,
  StopPayload,
  SupervisorEvent,
  SupportedCommands,
  UsageLimitsReading,
  UsageLimitsResponse,
  WorkItemSummary,
} from "@cawco/core";
import {
  CAWCO_SCRATCH_TAG,
  CONTROL_RELOAD_SKILLS,
  CONTROL_SUPPORTED_COMMANDS,
  classifyCommand,
  isEffortLevel,
  RESOLVE_PERMISSION,
} from "@cawco/core";
import { toast } from "svelte-sonner";
import { goto } from "$app/navigation";
import {
  CONTROL_TIMEOUT_MS,
  DISCARD_TIMEOUT_MS,
  SESSION_CATALOG_LIMIT,
  TRANSCRIPT_CHUNK_SIZE,
  TRANSCRIPT_FIRST_CHUNK,
  TRANSCRIPT_TAIL_CEILING,
  WS_RECONNECT_BASE_DELAY,
  WS_RECONNECT_MAX_ATTEMPTS,
  WS_RECONNECT_MAX_DELAY,
} from "$lib/config";
import type { SubagentState } from "$lib/utils/flow-types";
import type { Activity } from "./activity";
import { activityOf, runningSubagents } from "./activity";
import { checkDeployToast } from "./deploy-toast";
import type { ToolGlance } from "./frames";
import {
  applyBranchEvent,
  applyToolResult,
  branchFor,
  errorMessage,
  foldDelegateEvent,
  localUserMessage,
  mapFrame,
  mapTranscript,
  mergePulses,
  routedToParent,
  suppressesTaskLine,
  turnStart,
} from "./frames";
import { newId } from "./id";
import { conversationHref, indexInstances, instanceForSession } from "./links";
import { type PendingSelection, selectionExtras } from "./preview/selection";
import { checkRestartToast } from "./restart-toast";
import type {
  CommandRecord,
  SettleStage,
  StreamEffects,
  StreamHost,
} from "./stream";
import {
  createStreamState,
  disarmCommandSweep,
  failLocally,
  handleStreamMessage,
  interruptedRecently,
  latestCommand,
  noteDisconnect,
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
import { type Voice, voiceOfMessage } from "./transcript/rows";
import {
  isSendRef,
  newer,
  placeSends,
  sendRef,
  sendRow,
} from "./transcript/sends";
import type { DelegateAskEvent, Message } from "./types";
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

/** A project the hub knows about (`GET /api/projects`). */
export interface ProjectRow {
  createdAt: string;
  cwd: string;
  id: string;
  machineId: string;
  name: string;
}

/** Only a session the hub can still reach is live; the rest is history. */
const isLive = (row: InstanceRow): boolean =>
  row.status === "running" || row.status === "starting";

/**
 * A session that stays on the board until the operator discards it: live work,
 * a real failure to look at, a nap to wake from, or a row the hub simply
 * cannot currently ask about — `unknown` is never dropped just because its
 * machine went quiet, the same way it is never rendered as though nothing
 * were wrong (see {@link isStale}).
 */
const isListed = (row: InstanceRow): boolean =>
  isLive(row) ||
  row.status === "error" ||
  row.status === "sleeping" ||
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

/** A side quest's worktree sits under the project's checkout, so it counts as in it. */
const under = (root: string, path: string): boolean =>
  path === root || path.startsWith(`${root}/`);

/**
 * A side quest is history nobody asked for until they keep it, and the agent
 * tags its SDK session on the way out to say so. The tag is the whole test —
 * the directory a session ran in says nothing about whether it was a quest.
 */
const listedInHistory = (info: NeutralSessionInfo): boolean =>
  info.tag !== CAWCO_SCRATCH_TAG;

export interface PendingPermission {
  input: Record<string, unknown>;
  instanceId: string;
  /**
   * When the hub first parked the ask, ms epoch: one clock for every device,
   * so the wait each shows and the order it lists asks in agree.
   */
  raisedAt?: number;
  requestId: string;
  /** Set when the hub routed the ask to its parent rather than to the user. */
  routedTo?: "parent";
  suggestions?: PermissionUpdate[];
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
  cwd: string;
  /**
   * How hard that model thinks: what the session actually sends, as its agent
   * read it back and the hub wrote it on the row — a level, or `none` when it
   * sends no effort. `null` until the first reading lands.
   */
  effort: SessionEffort | null;
  /** Which harness owns {@link sessionId} — what a resume and a catalog read route on. */
  harness: HarnessKind;
  /**
   * The transcript as the harness said it: its own rows, in order, with a
   * placeholder (`send.ref`) wherever a send was read or stored. What is on
   * screen, {@link messages}, is these with every send drawn in its place
   * ({@link place}).
   */
  harnessRows: Message[];
  /** The older chunks of a long transcript are still being prepended. */
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
  /** A stored transcript is being fetched. */
  loading: boolean;
  /**
   * This tab's own sends the hub has not taken: on their way, or never
   * arrived. Each gives way to its record the moment the hub's word on it
   * lands, as the same row.
   */
  local: Message[];
  machineId: string;
  /** The session's MCP servers (`mcpServerStatus`), null until asked; [] when the ask failed or found none. */
  mcp: McpServerStatus[] | null;
  mcpPending: boolean;
  /**
   * What is on screen: {@link harnessRows} with every send in its place
   * (`placeSends`). Only {@link place} writes it.
   */
  messages: Message[];
  /** Which model answers the next turn, learnt and corrected the same way. */
  model: string | null;
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
  /**
   * How the last transcript read ended, when it ended with nothing on screen.
   * Every read path sets this on a terminal failure and clears it when a read
   * starts, so a pane always has something to show for an empty transcript: a
   * hover-peek's backfill that timed out used to fail into `console.error`
   * and leave the pane on its loading state for the life of the tab.
   */
  readFault: ReadFault | null;
  /** The hub's record of every send this view knows of, by uuid. */
  records: Record<string, SendRecord>;
  /** Started again in place for a mode it could not switch into; ends at the next init. */
  relaunching: boolean;
  /** A side quest (NEW.md §1) — kept visually apart until it is kept or discarded. */
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
let instances = $state.raw<InstanceRow[]>([]);
/** The same rows looked up by id and by session, rebuilt once per change. */
const instanceIndex = $derived(indexInstances(instances));
const runningInstances = $derived(instances.filter(isLive));
const staleInstances = $derived(instances.filter(isStale));
const listedInstances = $derived(instances.filter(isListed));

const state = $state({
  previews: {} as Record<
    string,
    Extract<FramePayload, { kind: "preview" }> & {
      title?: string;
      path?: string;
      thumbnail?: string;
      /**
       * Counts "open" frames. Each one is a listener the hub just started —
       * after a daemon restart, the same source on a new port — so the pane
       * keys its frame on it and loads again.
       */
      opened?: number;
    }
  >,
  previewVisible: {} as Record<string, boolean>,
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
  projects: [] as ProjectRow[],
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
});

interface Waiter {
  reject: (error: Error) => void;
  resolve: (result: unknown) => void;
}

/** Control calls awaiting their `control_result`, keyed by the SDK `requestId`. */
const inflight = new Map<string, Waiter>();

/** Frames held back while a late-joined session reads its transcript, by instance. */
const backfilling = new Map<string, FramePayload[]>();
/** Instances whose transcript has been read back — it is only ever read once. */
const backfilled = new Set<string>();
/** The current transcript read per view; a chunk loop stops once it is not it. */
const hydrations = new Map<string, number>();

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
    harnessRows: [],
    records: {},
    local: [],
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
 * THE ONE WRITER of what a session shows: {@link SessionState.harnessRows}
 * with every send drawn in its place (`placeSends`, transcript/sends.ts).
 *
 * A send's row already on screen is kept, its fields moved to what its record
 * says now — so the row that was `sending` is the row that is `queued`, then
 * read in its place: one element for the life of the send. The list itself is
 * kept wherever it changed only past its first row: the transcript reads a
 * kept list that changed as the conversation arriving, and a new one as
 * history.
 */
function place(target: SessionState): void {
  const current = target.messages;
  const sends = new Map(
    current.flatMap((message) =>
      message.state && message.id ? [[message.id, message] as const] : []
    )
  );
  const next = placeSends(target.harnessRows, target.records, target.local).map(
    (message) => {
      const held =
        message.state && message.id ? sends.get(message.id) : undefined;
      if (!held || held === message) {
        return message;
      }
      adopt(held, message);
      return held;
    }
  );
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
 * A send's row on screen, moved to what its record says now: the same row.
 * Only what changed is written. A row this tab drew from its own send keeps
 * the pictures it sent: the record names the same ones by the hub's media
 * references, and trading one for the other would load them all again.
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
  if (held.timestamp?.getTime() !== fresh.timestamp?.getTime()) {
    held.timestamp = fresh.timestamp;
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

/**
 * The harness's rows, onto the end of what it has said. A row already there
 * — a frame replayed behind a history read — is not said twice.
 */
function addRows(target: SessionState, rows: Message[]): void {
  const held = new Set(target.harnessRows.map((message) => message.id));
  const fresh: Message[] = [];
  for (const message of rows) {
    if (!held.has(message.id)) {
      held.add(message.id);
      fresh.push(message);
    }
  }
  if (fresh.length > 0) {
    target.harnessRows.push(...fresh);
    place(target);
  }
}

/**
 * The hub's word on one send (a `send` frame). Read, it takes its place where
 * the word arrives — after everything said so far, before whatever the model
 * says about it — unless a history read already found where it was stored.
 * This tab's own copy of the send gives way to it; an older word than the
 * one in hand changes nothing.
 */
function receive(target: SessionState, record: SendRecord): void {
  const held = target.records[record.uuid];
  if (!newer(held, record)) {
    return;
  }
  target.records[record.uuid] = record;
  target.local = target.local.filter((message) => message.id !== record.uuid);
  // A send this tab made that failed before the session read it: said where
  // every failure of a send this tab made is said, and the turn this tab
  // took it to start never started — whether the session is working is the
  // daemon's word again (none, from a machine that is not there).
  if (
    record.state === "failed" &&
    held?.state !== "read" &&
    commandRecord(record.uuid)
  ) {
    sendFailureNotices[target.instanceId] = record.reason
      ? `Message not sent: ${record.reason}`
      : "Message not sent.";
    target.busy = state.pulses[target.instanceId]?.busy ?? false;
    trackWorking(target);
  }
  if (
    record.state === "read" &&
    !target.harnessRows.some((row) => isSendRef(row) && row.id === record.uuid)
  ) {
    target.harnessRows.push(sendRef(target.instanceId, record.uuid));
  }
  place(target);
}

/**
 * An older page of history, in front of what is on screen, with the records
 * its sends need — unless the view already holds a later word on one.
 */
function prependPage(
  target: SessionState,
  rows: Message[],
  records: Record<string, SendRecord>
): void {
  const known = new Set(target.harnessRows.map((message) => message.id));
  target.harnessRows = [
    ...rows.filter((message) => !known.has(message.id)),
    ...target.harnessRows,
  ];
  for (const record of Object.values(records)) {
    if (newer(target.records[record.uuid], record)) {
      target.records[record.uuid] = record;
    }
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
  target.currentTool = pulse.currentTool;
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
  instances = rows;
  for (const target of Object.values(state.sessions)) {
    hydrate(target);
  }
}

/**
 * Applies what moved since the hub's last publish: each changed row replaced
 * where it stands (or appended), each gone id dropped. Only the sessions whose
 * rows moved are re-hydrated, and the rows that did not move keep their
 * identity — so the rail, tabs and panes re-render the one row that changed
 * instead of all of them.
 */
function patchInstances(upserts: InstanceRow[], removed: string[]): void {
  const gone = new Set(removed);
  const next = instances.filter((row) => !gone.has(row.id));
  if (upserts.length > 0) {
    const at = new Map(next.map((row, i) => [row.id, i]));
    for (const row of upserts) {
      const i = at.get(row.id);
      if (i === undefined) {
        at.set(row.id, next.length);
        next.push(row);
      } else {
        next[i] = row;
      }
    }
  }
  instances = next;
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
  state.usageLimits = claude;
  state.openCodeGoLimits = openCodeGo;
  state.usageLimitsRead = true;
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
  state.continuations = table;
  continuationFollower?.(table);
}

/**
 * Registry reads: on connect and again after every reconnect. True once the
 * three reads the board waits on (machines, sessions, projects) all landed.
 */
async function refresh(): Promise<boolean> {
  // Registry hydration also recovers workflow transitions missed while disconnected.
  refreshWorkflows();
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

  if (handoffs) {
    state.handoffs = handoffs;
  }
  if (continuations) {
    adoptContinuations(continuations);
  }
  if (machines) {
    state.machines = machines;
  }
  if (projects) {
    state.projects = projects;
  }
  if (rows) {
    adoptInstances(rows);
  }
  if (usage) {
    adoptUsageLimits(usage.machines);
  }
  if (pending) {
    for (const envelope of pending) {
      handleFrame(envelope.payload);
    }
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
function adoptMachines(next: Machine[]): void {
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

/** Which tool a result answers, from the call it lands on. */
const nameOfCall = (messages: Message[], toolId: string): string =>
  messages.findLast((message) => message.metadata?.toolId === toolId)?.metadata
    ?.toolName ?? "";

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: dispatches every FramePayload kind the socket can deliver; splitting it would scatter one state machine across files
function handleFrame(frame: FramePayload): void {
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
  if (frame.kind === "workflow") {
    acceptWorkflowFrame(frame);
    return;
  }
  if (frame.kind === "preview") {
    const previous = state.previews[frame.instanceId];
    const sameSource =
      JSON.stringify(previous?.source) === JSON.stringify(frame.source);
    state.previews[frame.instanceId] = {
      ...(sameSource ? previous : {}),
      ...frame,
      opened: (previous?.opened ?? 0) + (frame.state === "open" ? 1 : 0),
    };
    if (frame.state === "open" && (previous?.state !== "open" || !sameSource)) {
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
        if (!current.has(id)) {
          state.previews[id] = { ...preview, state: "closed" };
        }
      }
      for (const preview of frame.previews) {
        if (state.previews[preview.instanceId]?.state === "open") {
          state.previews[preview.instanceId] = {
            ...state.previews[preview.instanceId],
            ...preview,
          };
        } else {
          handleFrame(preview);
        }
      }
    }
    // The machines ride along so a daemon registering — the moment its auth
    // state is decided — reaches the rail without a re-fetch.
    adoptMachines(frame.agents);
    checkRestartToast(frame.agents);
    // The hub's own record of what each session is carrying. Kept there rather
    // than learnt by watching, so it is the same on every device and survives a
    // reload — a hand-off only this tab saw is one your phone never knows about.
    state.handoffs =
      (frame as { handoffs?: Record<string, { from: string; at: number }> })
        .handoffs ?? {};
    adoptContinuations(
      (frame as { continuations?: ContinuationJob[] }).continuations ?? []
    );
    if (frame.kind === "instances") {
      adoptInstances(frame.instances);
      state.liveRead = true;
    } else {
      patchInstances(frame.upserts, frame.removed);
    }
    // The hub's now-state for every session it lists (C3), so a freshly-opened
    // dashboard knows working/blocked/idle at once instead of waiting for the
    // next per-instance `pulse` frame. Structural read, same as `handoffs` and
    // `queues` above: a hub that predates the field sends nothing here.
    state.pulses = mergePulses(
      state.pulses,
      (frame as { pulses?: Record<string, SessionPulse> }).pulses
    );
    for (const [id, pulse] of Object.entries(state.pulses)) {
      trackTurn(id, pulse);
      const held = state.sessions[id];
      if (held) {
        applyPulse(held, pulse);
      }
    }
    // Structural read, same reason as `pulses` and `handoffs` above: a hub
    // that predates C2 sends nothing here, and the comparisons that use it
    // (see convergence.ts) already treat "nothing to compare against" as
    // unknown rather than as current.
    state.hubBuild =
      (frame as { hubBuild?: BuildInfo }).hubBuild ?? state.hubBuild;
    return;
  }

  if (frame.kind === "usage") {
    // The small limits frame the hub pushes on each report (USAGE-SPEC.md §6.4).
    adoptUsageLimits(usageLimitReadings(frame.limits));
    return;
  }

  if (frame.kind === "work_item") {
    state.workItems[frame.item.id] = frame.item;
    return;
  }

  if (frame.kind === "pulse") {
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
      addRows(target, [errorMessage(instanceId, message)]);
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
      addRows(session(frame.instanceId), [
        errorMessage(
          frame.instanceId,
          frame.error ?? "The machine could not carry out that request."
        ),
      ]);
    }
    return;
  }

  // The hub's own record of what a delegate asked and was answered. Filed
  // before the session below, not behind it: the reader of this traffic is the
  // parent's delegate card, so it has no business waiting out the delegate's
  // own backfill.
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

  const target = session(frame.instanceId);

  // A backfill owns the transcript until it lands. Frames that arrive meanwhile
  // are held and replayed after it, so none is lost and none arrives twice.
  const held = backfilling.get(frame.instanceId);
  if (held) {
    held.push(frame);
    return;
  }

  switch (frame.kind) {
    case "send":
      receive(target, frame.record);
      break;
    case "frame": {
      target.harness = frame.harness;
      const mapping = mapFrame(frame.instanceId, frame.message);
      if (mapping.branch) {
        applyBranchEvent(target.subagents, frame.instanceId, mapping.branch);
      }
      // Cost rides every result frame, cumulative across the run. It has no
      // transcript line on success, so it lives on the session instead.
      if (mapping.cost !== undefined) {
        target.totalCost = mapping.cost;
      }

      // A subagent's turns belong to its branch, not to the main transcript —
      // interleaving them is what buries the conversation the user is reading.
      const sink = mapping.agentId
        ? branchFor(target.subagents, frame.instanceId, mapping.agentId)
            .messages
        : target.harnessRows;
      const append = (message: Message): void => {
        if (mapping.agentId) {
          sink.push(message);
        } else {
          addRows(target, [message]);
        }
      };

      for (const message of mapping.messages) {
        if (message.type === "system.init") {
          target.sessionId = message.metadata?.sessionId ?? target.sessionId;
          // Re-emitted every turn and the session's own word on both settings,
          // so this confirms a switch, puts the picker back if the agent ignored
          // one, and catches a `/model` or `/permissions` run somewhere else.
          // Harvested before the banner is deduplicated, or only the first would.
          target.model = message.metadata?.model ?? target.model;
          target.permissionMode =
            message.metadata?.permissionMode ?? target.permissionMode;
          // biome-ignore lint/complexity/noVoid: fire-and-forget — the local state is already updated, this just persists it
          void persistSettings(frame.instanceId, {
            permissionMode: message.metadata?.permissionMode,
            model: message.metadata?.model,
          });
          // The `/` menu, from the same re-emitted frame and for the same
          // reason: a skill installed since the last turn is in this list.
          target.commands.names =
            message.metadata?.slashCommands ?? target.commands.names;
          target.commands.skills =
            message.metadata?.skills ?? target.commands.skills;
          target.tooling = message.metadata?.tooling ?? target.tooling;
          // A relaunch can change the MCP set; null makes the header ask again.
          target.mcp = null;
          // The process behind a relaunch is up: this is the frame it opens with.
          target.relaunching = false;
          target.initialized = true;
          // Anything still parked belongs to a process that is gone.
          //
          // A permission blocks the turn that asked it, so a session cannot
          // reach its next `init` with one outstanding — an init arriving on top
          // of pending questions means the process holding their resolvers died
          // and a new one opened the session. Answering those reaches a daemon
          // that never asked, which is the "no permission request <id>" the
          // reader gets for clicking a button the app was still showing them.
          if (target.pending.length > 0) {
            target.pending = [];
          }
          // Never a transcript line. `init` is re-emitted every single turn, so
          // any attempt to render it once relies on a flag that survives every
          // reload, reconnect and daemon restart — and each time that flag is
          // missed the reader gets "Session started" in the middle of a
          // conversation that plainly never stopped. Everything it carries is
          // already on screen: the model in the header, the servers behind it.
          continue;
        }
        // A compaction just landed. The transcript has its own line for it; the
        // dock needs the fact and the size, and a fresh reading because the
        // window it is metering just changed underneath it.
        if (message.type === "system.compact_boundary") {
          target.lastCompaction = {
            at: Date.now(),
            preTokens: message.metadata?.preTokens ?? 0,
            trigger: message.metadata?.trigger === "manual" ? "manual" : "auto",
          };
          if (target.machineId) {
            // biome-ignore lint/complexity/noVoid: fire-and-forget — the compaction is already recorded, this just refreshes the reading
            void refreshContext(frame.instanceId, target.machineId);
          }
        }
        // An id the SDK took but could not honour: the init that opened this
        // turn still names what was asked for, so the picker follows this
        // instead rather than going on claiming a model that is not answering.
        if (message.type === "system.model_fallback") {
          target.model = message.metadata?.model ?? target.model;
          // biome-ignore lint/complexity/noVoid: fire-and-forget — the local state is already updated, this just persists it
          void persistSettings(frame.instanceId, {
            model: message.metadata?.model,
          });
        }
        // The settle that precedes a relaunch ends the old turn with an error
        // result the reader asked for — a quiet note, not a red card.
        if (target.relaunching && message.type === "result.error") {
          append({
            ...message,
            type: "system.status",
            content: "Turn stopped to change the permission mode.",
            metadata: {},
          });
          continue;
        }
        // A real subagent's `task_notification` names a `tool_use_id` whose
        // branch already exists — its completion is the branch card. The branch
        // event above ran first, so the registry already answers whether this
        // line is redundant; a plain tool task keeps its line only when it ran
        // in the background, as a reload does.
        if (
          suppressesTaskLine(
            target.subagents,
            sink,
            message,
            mapping.branch?.toolUseId
          )
        ) {
          continue;
        }
        // The harness said the turn was cut short — its interrupt line, just
        // drawn — and the error result closing that turn is the line's
        // receipt. It stores the line and not the result, so a reload draws
        // the line alone, and so does this.
        if (
          message.type === "result.error" &&
          !mapping.agentId &&
          target.harnessRows.at(-1)?.type === "ui.interrupted"
        ) {
          continue;
        }
        // A `result.error` in the shadow of this client's own interrupt is the
        // receipt of a deliberate stop, not a failure — the crimson card is
        // the ledger's loudest treatment and must not be spent on the
        // operator's own action. Retyped to the quiet one-word line.
        if (
          message.type === "result.error" &&
          interruptedRecently(streamState, frame.instanceId, Date.now())
        ) {
          message.type = "ui.interrupted";
          message.metadata = { ...message.metadata, noteTitle: "Interrupted" };
        }
        append(message);
      }
      for (const result of mapping.toolResults) {
        applyToolResult(sink, result);
        // The ledger on disk just moved. The result says only that it did —
        // what it now says is read back from the files, never parsed out of
        // here. Answered against `sink`, so a subagent editing the plan
        // invalidates the session the same way the main loop does; searched
        // backwards because a result answers one of the last calls made.
        if (TASK_LEDGER_TOOLS.has(nameOfCall(sink, result.toolId))) {
          invalidateTasks(frame.instanceId);
        }
        // The Task call's own result is the authoritative end of the subagent it
        // spawned: branches are keyed by that `tool_use_id`. Progress frames can
        // re-open a branch that already reported itself finished, and nothing
        // closes it again — which is how every subagent ends up reading
        // "running" forever, whether it is working or was done an hour ago.
        const branch = target.subagents[result.toolId];
        if (!branch) {
          continue;
        }
        branch.status = result.isError ? "error" : "complete";
        branch.completedAt ??= new Date();
        // The tool_result carries the full report; task_notification only had
        // a short summary, so this overwrites unconditionally.
        if (result.isError) {
          branch.error = result.result;
        } else {
          branch.result = result.result;
        }
      }

      // A push the SDK sends when the commands on disk changed: the full list,
      // so it replaces what was cached — including the names, which are now
      // fresher than the init that listed them.
      if (mapping.commands) {
        target.commands = {
          ...target.commands,
          names: mapping.commands.map((command) => command.name),
          detailed: detailsOf(mapping.commands),
          ...(mapping.commands.some((command) => command.kind)
            ? {
                skills: mapping.commands
                  .filter((command) => command.kind === "skill")
                  .map((command) => command.name),
              }
            : {}),
        };
      }

      // `undefined` is "this frame said nothing about it"; `null` is the session
      // saying it stopped. Only the latter clears the meter's label.
      if (mapping.status !== undefined) {
        target.sdkStatus = mapping.status;
      }
      if (mapping.compaction) {
        target.lastCompaction = {
          at: Date.now(),
          preTokens: target.lastCompaction?.preTokens ?? 0,
          trigger: target.lastCompaction?.trigger ?? "auto",
          result: mapping.compaction.result,
          error: mapping.compaction.error,
        };
        if (target.machineId) {
          // biome-ignore lint/complexity/noVoid: fire-and-forget — the compaction result is already recorded, this just refreshes the reading
          void refreshContext(frame.instanceId, target.machineId);
        }
      }

      if (mapping.currentTool && !mapping.agentId) {
        target.currentTool = mapping.currentTool;
      }
      // What the partials say the model is writing right now. Only ever the
      // main loop's — `mapFrame` files nothing here for a subagent's frames.
      if (mapping.blockStart) {
        target.openBlock = mapping.blockStart;
        // A fresh block of reasoning, not a continuation of the last one.
        if (mapping.blockStart === "thinking") {
          target.thinkingStream = "";
          target.thinkingClosing = false;
          target.thinkingSince = Date.now();
        }
      }
      if (mapping.thinkingDelta) {
        target.thinkingStream += mapping.thinkingDelta;
      }
      if (mapping.thinkingClosing) {
        target.thinkingClosing = true;
      }
      if (mapping.blockStop) {
        target.openBlock = null;
      }
      // The glance is empty until the full frame lands, so it never overwrites
      // one that already has the arguments in it.
      if (mapping.toolStarting && !target.currentTool) {
        target.currentTool = mapping.toolStarting;
      }
      // The turn's own thinking message has landed in the transcript, which is
      // where the reasoning is read from now — same frame, so the live trace
      // gives way without a gap between the two. Before it does, the measured
      // start of that block becomes the message's duration: two blocks of one
      // frame share a mapped timestamp, so adjacency reads 0 there and only
      // this clock knows. One thinking message consumes it; more than one in a
      // frame shares no honest split, so none of them gets a number.
      if (frame.message.type === "assistant" && !mapping.agentId) {
        if (target.thinkingSince !== null) {
          const settled = mapping.messages.filter(
            (message) => message.type === "thinking"
          );
          if (settled.length === 1 && settled[0].metadata) {
            settled[0].metadata.thinkingDurationMs =
              Date.now() - target.thinkingSince;
          }
        }
        clearTurnPhase(target);
      }
      const answered = target.currentTool?.toolId;
      if (mapping.toolResults.some((result) => result.toolId === answered)) {
        target.currentTool = null;
      }
      // A subagent's deltas feed its branch's buffer, not the main loop's.
      if (mapping.agentId) {
        const branch = branchFor(
          target.subagents,
          frame.instanceId,
          mapping.agentId
        );
        if (mapping.delta) {
          branch.streaming += mapping.delta;
        }
        if (mapping.clearsStream) {
          branch.streaming = "";
        }
      } else {
        if (mapping.delta) {
          target.streaming += mapping.delta;
        }
        if (mapping.clearsStream) {
          target.streaming = "";
        }
      }
      if (mapping.failedTurn !== undefined) {
        target.lastTurnFailed = mapping.failedTurn;
      }
      if (mapping.endsTurn) {
        target.busy = false;
        target.currentTool = null;
        target.sdkStatus = null;
        clearTurnPhase(target);
        // The turn just changed how full the window is; ask rather than guess.
        if (target.machineId) {
          // biome-ignore lint/complexity/noVoid: fire-and-forget — the turn already ended, this just refreshes the context reading
          void refreshContext(frame.instanceId, target.machineId);
        }
      } else if (
        mapping.delta ||
        mapping.currentTool ||
        // A turn that opens on a long reasoning block sends neither text nor a
        // tool call for minutes; the block itself is the evidence.
        mapping.blockStart ||
        mapping.thinkingDelta ||
        mapping.messages.some(
          (message) =>
            message.type === "assistant" || message.type === "thinking"
        )
      ) {
        // A tab that joined after the turn started never sent anything, so nothing
        // ever set `busy` — the frames themselves are the evidence it is working.
        target.busy = true;
      }
      break;
    }

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
        break;
      }
      target.pending.push({
        requestId: frame.requestId,
        instanceId: frame.instanceId,
        toolName: frame.toolName,
        input: frame.input,
        suggestions: frame.suggestions,
        routedTo,
        toolUseId: frame.toolUseId,
        raisedAt: frame.raisedAt,
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
  // A session's own frames arrive only here, sequenced; everything broadcast
  // (the board, pulses, permissions, replies) comes as an envelope (`bind`).
  applyFrame: (_sessionId, frame) => handleFrame(frame as FramePayload),
  /**
   * A reset is the late-join problem the history read solves, including
   * holding the deltas that land while it reads. The latch it keeps is
   * released first: a session may be reset more than once in a tab's life,
   * and the second one must not be a silent no-op.
   */
  rereadHistory: (sessionId) => {
    backfilled.delete(sessionId);
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the latch is already released, the reread fills in when it lands
    void preloadHistory(sessionId);
  },
  sendToHub: (message) => {
    const socket = globalThis.__cawcoSocket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    socket.send(JSON.stringify(message));
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
 * queue filters out (`parked` in SessionPane; `routedToParent` in frames.ts).
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
): SendPayload | ControlPayload {
  const controlPayload = (method: string, args: unknown[]): ControlPayload => ({
    instanceId,
    requestId: commandId,
    method,
    args,
  });
  switch (kind) {
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
    const stale = now - entry.at >= SETTLED_COMMAND_TTL_MS;
    // A MISSING record is not evidence of anything and must not be read as
    // custody. The entry is now written before the submit that creates the
    // record — it has to be, or a throw during payload assembly leaves nothing
    // to recover — so for one instant every fresh entry has no record, and
    // treating that as "the hub has it" deleted the payload the moment it was
    // stored. The absent-record case is covered by `stale` anyway: a record the
    // ledger has already forgotten is at least as old as the TTL below.
    const taken = record
      ? record.stage !== "submitted" && record.stage !== "failed"
      : false;
    if (stale || taken) {
      sendOutbox.delete(commandId);
    }
  }
  if (sendOutbox.size > SETTLED_COMMAND_LIMIT) {
    const oldest = [...sendOutbox.entries()].sort((a, b) => a[1].at - b[1].at);
    for (const [commandId] of oldest.slice(
      0,
      sendOutbox.size - SETTLED_COMMAND_LIMIT
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
        attachments: message.metadata?.attachments?.map(
          ({ name, content }) => ({ kind: "text" as const, name, content })
        ),
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
  // Exactly one slot is ever waiting. A slot holds the whole payload — base64
  // image data included — and it is only ever emptied by the pane that mounts
  // to consume it, so an "Edit" pressed on a session the reader then closes
  // would otherwise pin those bytes for the life of the tab. Keeping only the
  // newest bounds it at one without needing anyone to come back and collect.
  for (const held of Object.keys(restoreSlots)) {
    if (held !== entry.instanceId) {
      delete restoreSlots[held];
    }
  }
  restoreSlots[entry.instanceId] = { text: entry.text, extras: entry.extras };
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
  return [...ids];
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
  watchedDelegates.set(instanceId, (watchedDelegates.get(instanceId) ?? 0) + 1);
  syncSubscriptions();
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
  socket.send(JSON.stringify(envelope));
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

  const socket = new WebSocket(hubSocketUrl());

  socket.onopen = () => {
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
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the toast shows itself when the served build is newer
    void checkDeployToast();
  };

  bind(socket);
  // This module made it, so it already owns it: `ensureConnected` has nothing
  // left to adopt, and `onopen` above is what refreshes.
  claimed = true;
  globalThis.__cawcoSocket = socket;
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
  socket.onmessage = (event) => {
    const message = JSON.parse(String(event.data)) as unknown;
    // A session's own frames are sequenced; everything else — the board,
    // pulses, permissions, replies — is broadcast as an envelope.
    if (handleStreamMessage(streamState, streamHost, message)) {
      sweepOnTraffic();
      return;
    }
    const envelope = message as Envelope<FramePayload>;
    if (envelope.verb !== "frames") {
      return;
    }
    handleFrame(envelope.payload);
    sweepOnTraffic();
  };

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
    // Adopt it rather than assume somebody else is still listening: `onopen`
    // has already fired for an open socket and will never fire again, so the
    // status has to be read off the socket instead of waited for.
    claimed = true;
    bind(socket);
    if (socket.readyState === WebSocket.OPEN) {
      state.status = "connected";
      state.retryAt = null;
      readFleet();
      lastSubscriptionKey = "";
      syncSubscriptions();
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

/** Spawns a session on `machineId` and registers the view it streams into. */
function start({
  machineId,
  ...spawn
}: Omit<SpawnPayload, "instanceId"> & { machineId: string }): SessionState {
  const instanceId = newId();
  const payload: SpawnPayload = { instanceId, ...spawn };
  send({ verb: "spawn", machineId, instanceId, payload });

  const created = session(instanceId);
  created.machineId = machineId;
  created.cwd = spawn.cwd;
  created.harness = spawn.harness ?? "claude";
  created.permissionMode = spawn.permissionMode ?? null;
  // What the form chose, so the header shows it during the wait for the first
  // init — which then corrects it to whatever the harness resolved it to.
  created.model = spawn.model ?? null;
  created.scratch = Boolean(spawn.scratch);
  return created;
}

/** Starts a session on `machineId` and returns the id its route lives at. */
export function spawnSession({
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
}: {
  machineId: string;
  cwd: string;
  prompt?: string;
  harness?: HarnessKind;
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  scratch?: SpawnPayload["scratch"];
  bootstrap?: SpawnPayload["bootstrap"];
  projectId?: string;
}): string {
  const created = start({
    machineId,
    cwd,
    harness,
    permissionMode,
    model,
    effort,
    scratch,
    bootstrap,
    projectId,
  });
  if (prompt?.trim()) {
    // Followed before its first prompt goes, on the socket that carries it:
    // that send's record is among the first frames the session's stream
    // carries, and a tab that joined after it would never hear it.
    subscribeSession(streamState, streamHost, created.instanceId);
    submitCommand(created.instanceId, machineId, "send", {
      text: prompt.trim(),
    });
  }
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the session already started locally, this just resyncs the fleet list
  void refresh();
  return created.instanceId;
}

/**
 * Re-opens a stored session as a live one. The transcript already on screen is
 * seeded into the new view, so the conversation reads as one continuous thread.
 */
export function resumeSession({
  machineId,
  cwd,
  sessionId,
  harness = "claude",
  history = [],
}: {
  machineId: string;
  cwd: string;
  sessionId: string;
  harness?: HarnessKind;
  history?: Message[];
}): string {
  const live = instanceForSession(
    instanceIndex,
    sessionId,
    { machineId, cwd },
    true,
    isLive
  );
  if (live) {
    const existing = session(live.id);
    existing.machineId ||= live.machineId;
    existing.cwd ||= live.cwd;
    existing.sessionId = sessionId;
    existing.harness = (live.harness as HarnessKind | undefined) ?? harness;
    return live.id;
  }

  const created = start({
    machineId,
    cwd,
    harness,
    resume: { sessionKey: sessionId },
  });
  created.sessionId = sessionId;
  seed(created, history);
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the session already started locally, this just resyncs the fleet list
  void refresh();
  return created.instanceId;
}

/**
 * A new view's transcript, carried over from the one on screen: the rows as
 * they are drawn there, sends included, now the new view's own.
 */
function seed(target: SessionState, history: Message[]): void {
  addRows(
    target,
    history.map((message) => ({ ...message, instanceId: target.instanceId }))
  );
}

/**
 * Branches a side quest off a session (NEW.md §1): the same context carried into
 * a new SDK session, kept apart from mainline work until it is kept or
 * discarded. The transcript on screen is seeded so the branch reads on from
 * where it left.
 */
export function forkSession({
  machineId,
  cwd,
  sessionId,
  harness = "claude",
  history = [],
  at,
}: {
  machineId: string;
  cwd: string;
  sessionId: string;
  harness?: HarnessKind;
  history?: Message[];
  /** Branch from this assistant turn rather than from the end — see {@link rewindPoint}. */
  at?: string;
}): string {
  // The branch runs on what its source runs on, never on the machine's
  // defaults: the hub's row for the conversation says what that is.
  const source = instanceForSession(instanceIndex, sessionId, {
    machineId,
    cwd,
  });
  const created = start({
    machineId,
    cwd,
    harness,
    resume: { sessionKey: sessionId, fork: true, ...(at && { atMessage: at }) },
    scratch: {},
    ...(source?.model ? { model: source.model } : {}),
    ...(source?.permissionMode
      ? { permissionMode: source.permissionMode as PermissionMode }
      : {}),
    ...(isEffortLevel(source?.effort) ? { effort: source.effort } : {}),
  });
  seed(created, history);
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
  } else if (replaces === undefined) {
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
    // A dead row with no key on record cannot come back, and a spawn sent
    // anyway would carry a guessed one — the refusal is the honest answer.
    const sessionKey = resumeKeyFor(instanceId);
    if (!sessionKey) {
      throw new Error(
        `no session key on record for ${instanceId}; cannot resume`
      );
    }
    const requestId = newId();
    const payload: SpawnPayload = {
      instanceId,
      cwd: target.cwd,
      harness: target.harness,
      resume: { sessionKey },
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
    };
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
  const payload: StopPayload = { instanceId };
  send({ verb: "stop", machineId, instanceId, payload });

  settleStopped(instanceId);
  // biome-ignore lint/complexity/noVoid: fire-and-forget — the stop already landed, this just resyncs the fleet list
  void refresh();
}

/**
 * Throws a side quest away: the session stops and the agent tears down whatever
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
    // The view this session's chunks were being prepended to is gone with it.
    hydrations.delete(instanceId);
    await refresh();
  }
}

/**
 * Promotes a side quest to mainline work: the UI stops setting it apart, and
 * the tag that kept its transcript out of the machine's catalog comes off, so
 * the session joins the history it was being hidden from.
 */
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
 * Whether the pane shows the preview — a view state, not the preview itself:
 * hiding leaves the forwarder running, and only the pane's Close stops it.
 * On a narrow pane the preview stands in for the transcript, so the same
 * toggle is how the operator gets back.
 */
export function revealPreview(instanceId: string): void {
  state.previewVisible[instanceId] = true;
  state.previewRequests[instanceId] =
    (state.previewRequests[instanceId] ?? 0) + 1;
}

export function hidePreview(instanceId: string): void {
  state.previewVisible[instanceId] = false;
  state.previewRequests[instanceId] =
    (state.previewRequests[instanceId] ?? 0) + 1;
}

export async function openPreview(
  instanceId: string,
  source: PreviewSource
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
  content?: string
): Promise<T> {
  await waitForOpen();
  const requestId = newId();
  const payload: FsPayload = { requestId, op, path, content };
  return ask<T>(requestId, `fs ${op} ${path}`, CONTROL_TIMEOUT_MS, () =>
    send({ verb: "fs", machineId, requestId, payload })
  );
}

/** Names a machine + directory so it can be opened as a project home. */
export async function createProject(project: {
  name: string;
  cwd: string;
  machineId: string;
}): Promise<ProjectRow> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  });
  if (!response.ok) {
    throw new Error(
      `Could not save this project — the hub answered ${response.status}. Try again.`
    );
  }
  const created = (await response.json()) as ProjectRow;
  await refresh();
  return created;
}

/** Forgets the project; the sessions started from it stay, just unattached. */
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error(
      `Could not forget this project — the hub answered ${response.status}. Try again.`
    );
  }
  await refresh();
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
 * Publishes a stored transcript into a session view, newest first. A short one
 * lands in one pass. A long one paints its last turns on their own — mapping the
 * whole of it, and handing the view thousands of messages at once, is what the
 * reader would wait through — and the rest are prepended a chunk at a time with
 * the event loop free in between. `onPublished` runs once the last turns are on
 * screen, and the loop stops early if a later read for this view supersedes it.
 */
/**
 * The `/` menu, harvested from a hydrated transcript. `commands.names` is set
 * only by the live `system.init` frame handler — but a session read back from
 * history (a reload, a stored session, or the HTTP stream) never runs that
 * handler, so its command menu came up empty and typing `/` opened nothing.
 * `system.init` is re-emitted every turn and carries the current list, so the
 * newest one in what was just mapped is the session's own word for it.
 */
function harvestCommands(target: SessionState, messages: Message[]): void {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const init = messages[i];
    if (init.type !== "system.init") {
      continue;
    }
    if (init.metadata?.slashCommands) {
      target.commands.names = init.metadata.slashCommands;
    }
    if (init.metadata?.skills) {
      target.commands.skills = init.metadata.skills;
    }
    return;
  }
}

/** Starts a read of this view's transcript, superseding whatever was reading it. */
function claimTranscript(viewId: string): number {
  const epoch = (hydrations.get(viewId) ?? 0) + 1;
  hydrations.set(viewId, epoch);
  return epoch;
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

/** The content blocks of a stored entry, for the tool pairing a cut must not split. */
function contentBlocks(
  entry: SessionMessage
): { type?: string; id?: string; tool_use_id?: string }[] {
  const content = (entry.message as { content?: unknown } | null)?.content;
  return Array.isArray(content)
    ? (content as { type?: string; id?: string; tool_use_id?: string }[])
    : [];
}

/** What a streamed history read carries, and how the URL that names it is built. */
export interface HistorySource {
  cwd: string;
  harness?: HarnessKind;
  /** A running session, whose live frames have to be held and reconciled behind the read. */
  live?: boolean;
  /**
   * Where the transcript is believed to live. A hint for naming the session
   * before the read answers, not an address: the hub resolves the id itself
   * and its answer is what the view ends up carrying.
   */
  machineId: string;
  /**
   * The key the transcript is stored under: the SDK session id, never the
   * view. Only a hub row's own key belongs here; absent, the read's header
   * names it.
   */
  sessionId?: string;
  viewId: string;
}

/**
 * Where a session's transcript is read from. The view's id alone, in both
 * tenses: the hub maps a live instance to its SDK key and locates any other,
 * so the same address works before this browser knows anything about the
 * conversation.
 */
export function messagesUrl(
  source: HistorySource,
  page: { tail: number } | { before: string }
): string {
  const path = `/api/instances/${encodeURIComponent(source.viewId)}/messages`;
  const params = new URLSearchParams();
  // A tail request is answered by parsing only the newest window of the
  // transcript file — the difference between ~4ms and a full-file parse. An
  // older page is everything strictly before the oldest entry already read.
  if ("tail" in page) {
    params.set("tail", String(page.tail));
  } else {
    params.set("before", page.before);
  }
  const suffix = params.size > 0 ? `?${params}` : "";
  return `${path}${suffix}`;
}

export function preloadHistory(viewId: string): Promise<TranscriptOutcome> {
  const row = cawco.instanceIndex.byId.get(viewId);
  return streamHistory({
    viewId,
    machineId: "",
    sessionId: row?.sessionId ?? undefined,
    cwd: "",
    harness: (row?.harness ?? "claude") as HarnessKind,
    live: !!row,
  });
}

/**
 * A session's stored transcript over HTTP, published as it arrives.
 *
 * The only read of a stored transcript there is. The hub answers
 * `GET /api/instances/:id/messages` with the `getSessionMessages` read, so it
 * needs nothing but a page — no socket to wait for — and it arrives a line at
 * a time: a read that came back as one socket message was decoded, parsed and
 * mapped in one task (50-57ms for a 12,000px delegate transcript).
 *
 * It arrives newest entry first, one JSON object per line, and is published in
 * turn-aligned chunks the moment each one is complete: the newest turns paint
 * from the first flush — which is where the reader is looking — and the rest
 * prepend behind them, exactly as a socket-read transcript hydrates. Time to
 * the first message is one flush, not the whole file.
 */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: streams, parses and republishes turn-aligned chunks in one pass; splitting the state machine would scatter it across functions
export async function streamHistory({
  viewId,
  machineId,
  sessionId,
  cwd,
  harness,
  live,
}: HistorySource): Promise<TranscriptOutcome> {
  const target = session(viewId);
  if (machineId) {
    target.machineId = machineId;
  }
  if (cwd) {
    target.cwd = cwd;
  }
  // Only a key the hub row named is taken ahead of the read. A view id in the
  // key's place is a caller standing in for one it did not have — and the
  // read's own header names the real key, so nothing is lost by waiting.
  if (sessionId && sessionId !== viewId) {
    target.sessionId = sessionId;
  }
  if (harness) {
    target.harness = harness;
  }
  // A stored session's plan is still on its machine, and no frame will ever
  // arrive to say so — opening it is the only moment there is to ask.
  refreshTasks(viewId);

  // A read in hand, on either tense, is the one that answers: a second read
  // over the top of it would replace what it is publishing.
  if (backfilling.has(viewId) || target.loading) {
    return { ok: true, skipped: true };
  }
  if (live) {
    // The same latch the socket backfill takes, taken here: whichever path
    // reads this session's history first is the only one that reads it. But
    // only a latch with a transcript behind it holds — one left set by a read
    // that landed empty, or never landed, is read past, because the
    // alternative was a skeleton nothing would ever resolve.
    if (backfilled.has(viewId) && target.messages.length > 0) {
      return { ok: true, skipped: true };
    }
    backfilled.add(viewId);
    backfilling.set(viewId, []);
  } else if (target.messages.length > 0) {
    // Re-opening what is already read must not start a second read over it.
    return { ok: true, skipped: true };
  }

  /** Undoes the latch, so a failed read leaves the socket path free to try. */
  const release = (): void => {
    if (!live) {
      return;
    }
    backfilled.delete(viewId);
    if (backfilling.has(viewId)) {
      replayHeld(viewId, new Set());
    }
  };

  /** A failure with nothing on screen, said where the pane can read it. */
  const fail = (fault: ReadFault, status?: number): TranscriptOutcome => {
    target.readFault = fault;
    return { ok: false, ...fault, status };
  };

  const source: HistorySource = {
    viewId,
    machineId,
    sessionId,
    cwd,
    harness,
    live,
  };

  const epoch = claimTranscript(viewId);
  target.loading = true;
  // A fault the last read left stands until this one answers: a re-read
  // after a reconnect happens behind the state the pane is showing, and only
  // a read the hub answers replaces it (below).

  /** Entries buffered newest-first, waiting for a cut a chunk can start at. */
  let buffered: SessionMessage[] = [];
  /**
   * A cut at one of the reader's own turns, held until the entry older than
   * it says whether the reader's run goes on: how many buffered entries the
   * chunk takes, or 0. A chunk that began mid-run drew its first turn with a
   * speaker line the older chunk then took away (rows.ts `grouped`), so the
   * cut moves back to the run's first turn.
   */
  let held = 0;
  /** Tool results in the buffer whose `tool_use` is older still — a cut here would split them. */
  const dangling = new Set<string>();
  const seeded = new Set<string>();
  /** The oldest entry read so far: where an older page ends. */
  let oldest: string | undefined;
  let consumed = 0;
  let chunks = 0;
  /**
   * The send records the read has carried so far, by uuid. Each page leads
   * with its records, so every entry that names one arrives after it.
   */
  const records: Record<string, SendRecord> = {};

  const publish = (chunk: SessionMessage[]): void => {
    const mapped = mapTranscript(viewId, chunk);
    if (chunks === 0) {
      // The read REPLACES what history put on screen, rows and records; it
      // does not merge into them. What only this tab holds survives it: its
      // sends the hub has not taken (`local`).
      target.harnessRows = mapped.messages;
      target.records = { ...records };
      place(target);
      target.subagents = mapped.subagents;
      // The tail chunk is newest-first, so it carries the latest `system.init`:
      // harvest the `/` menu from it, which the live-frame handler is otherwise
      // the only thing that sets.
      harvestCommands(target, mapped.messages);
      // A transcript that already has turns in it is a session that already
      // started, so the banner announcing the start has had its moment.
      if (chunk.length > 0) {
        target.initialized = true;
      }
      target.loading = false;
      target.hydrating = true;
      if (live) {
        target.streaming = "";
        clearTurnPhase(target);
        // What was held belongs to the end of the transcript, which is now on
        // screen: it appends while the older chunks prepend, so neither waits.
        replayHeld(viewId, seeded);
      }
    } else {
      prependPage(target, mapped.messages, records);
      // Branches are keyed by the Task `tool_use_id` that opened them, so an
      // older chunk mostly adds keys — except where a compacted transcript
      // re-emits the same call, and then its turns belong in front of the ones
      // already read back for it.
      for (const [toolUseId, branch] of Object.entries(mapped.subagents)) {
        const known = target.subagents[toolUseId];
        if (known) {
          known.messages = [...branch.messages, ...known.messages];
        } else {
          target.subagents[toolUseId] = branch;
        }
      }
    }
    chunks += 1;
  };

  // The `/` palette's servers and tools are read beside the transcript: the
  // board's rows do not carry them. A session with no hub row has none.
  // biome-ignore lint/complexity/noVoid: runs beside the transcript read; the palette reads it off the session when it lands
  void fetch(`/api/instances/${encodeURIComponent(viewId)}/tooling`).then(
    async (answer) => {
      if (answer.ok) {
        target.tooling = (await answer.json()) as SessionTooling;
      }
    }
  );

  try {
    // Tail first: the agent parses only the newest window of the transcript
    // file, so the first paint is not behind a full-file parse. The full read
    // follows below, continuing the same stream state for scrollback.
    const response = await fetch(
      messagesUrl(source, { tail: TRANSCRIPT_TAIL_CEILING })
    );
    if (!(response.ok && response.body)) {
      const detail =
        (await response.text().catch(() => "")) || response.statusText;
      release();
      target.loading = false;
      // A 503 naming a machine is the hub saying that machine is not
      // connected — a state of the fleet, not a fault in the read, and a
      // different sentence to say. The hub names it: a read addressed by id
      // alone knows no machine of its own.
      const away =
        response.status === 503
          ? response.headers.get("x-cawco-machine")
          : null;
      if (away) {
        const machine = state.machines.find((row) => row.machineId === away);
        return fail(
          {
            reason: "offline",
            machineId: away,
            message: `${machine?.hostname || away} is offline — its stored transcript can't be read right now.`,
          },
          response.status
        );
      }
      return fail({ reason: "failed", message: detail }, response.status);
    }
    target.readFault = null;

    // Where the hub found it. A session addressed by id alone arrives here
    // knowing nothing about itself, and the composer, the header and the
    // machine's tools all want the machine — this is the one round trip that
    // learns it. The hub's word on machine and folder fills blanks only: a
    // live row's own values are already in place and are not walked back.
    const found = response.headers.get("x-cawco-machine");
    if (found && !target.machineId) {
      target.machineId = found;
    }
    const foundCwd = response.headers.get("x-cawco-cwd");
    if (foundCwd && !target.cwd) {
      target.cwd = decodeURIComponent(foundCwd);
    }
    // The key is different: the hub resolved the id to it, and it is the one
    // thing here a later resume is sent under. It overwrites whatever the view
    // holds — a stored transcript opened by its id has nothing until now.
    const foundKey = response.headers.get("x-cawco-session");
    if (foundKey) {
      target.sessionId = decodeURIComponent(foundKey);
    }
    const foundHarness = response.headers.get("x-cawco-harness");
    if (foundHarness && !harness) {
      target.harness = foundHarness as HarnessKind;
    }

    /** One entry, oldest of everything read so far; flushes a chunk once one can start here. */
    const consume = async (entry: SessionMessage): Promise<void> => {
      for (const block of contentBlocks(entry)) {
        if (block.type === "tool_result" && block.tool_use_id) {
          dangling.add(block.tool_use_id);
        } else if (block.type === "tool_use" && block.id) {
          dangling.delete(block.id);
        }
      }
      buffered.push(entry);
      seeded.add(entry.uuid);
      oldest = entry.uuid;
      consumed += 1;
      if (held > 0 && !(await resolveHeld(entry))) {
        return;
      }
      // Only a turn opener with no tool pair left hanging can begin a chunk:
      // anywhere else the slice would open mid-turn, with results arriving for
      // a `tool_use` on the other side of the cut.
      const size =
        chunks === 0 ? TRANSCRIPT_FIRST_CHUNK : TRANSCRIPT_CHUNK_SIZE;
      if (buffered.length < size || dangling.size > 0 || !turnStart(entry)) {
        return;
      }
      if (voiceOfEntry(entry) === "you") {
        held = buffered.length;
        return;
      }
      await flush(buffered.length);
    };

    /**
     * The held cut, answered by the entry older than it: the reader's run goes
     * on (the cut is dropped, and moves back), or it ended there (the chunk
     * goes out). False while the entry draws nothing and the question stays
     * with the one before it.
     */
    const resolveHeld = async (entry: SessionMessage): Promise<boolean> => {
      const voice = voiceOfEntry(entry);
      if (voice === "none") {
        return false;
      }
      if (voice === "you") {
        held = 0;
      } else {
        await flush(held);
      }
      return true;
    };

    /** Whose voice a stored entry's rows are, by the transcript's own rule. */
    const voiceOfEntry = (entry: SessionMessage): Voice =>
      entryVoice(viewId, entry, records);

    /** The newest `count` buffered entries, published as one chunk. */
    const flush = async (count: number): Promise<void> => {
      // Mapping a chunk is the blocking work, so the loop hands the event loop
      // back between them — this is what the reader scrolls and types through.
      if (chunks > 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      publish(buffered.slice(0, count).reverse());
      buffered = buffered.slice(count);
      held = 0;
    };

    /**
     * One newest-first NDJSON body into the shared cut state. The tail body
     * and the older page drain through here in turn, as one continuous
     * stream: the older page begins strictly before the tail's oldest entry,
     * so every chunk boundary invariant holds across the seam. Returns false
     * when a later read superseded this one mid-stream.
     */
    const drain = async (
      body: ReadableStream<Uint8Array>
    ): Promise<boolean> => {
      const reader = body.getReader();
      // A stream torn down mid-read (the page navigated away) rejects both
      // `read()` and `closed`. `read()` is where that is handled, below; the
      // `closed` promise would otherwise reject with nobody listening.
      reader.closed.catch(() => {
        /* reported through read() */
      });
      const decoder = new TextDecoder();
      let carry = "";
      // A send's record is kept for the entries that name it; an entry is
      // read into the chunks.
      const take = (line: string): Promise<void> => {
        const read = JSON.parse(line) as HistoryLine;
        if ("record" in read) {
          records[read.record.uuid] = read.record;
          return Promise.resolve();
        }
        return consume(read);
      };
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: a stream reads sequentially by definition — each chunk depends on the last read landing first
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        // A later read for this view supersedes this one; the rest of the
        // stream is somebody else's transcript now.
        if (hydrations.get(viewId) !== epoch) {
          await reader.cancel();
          return false;
        }
        carry += decoder.decode(value, { stream: true });
        for (
          let newline = carry.indexOf("\n");
          newline >= 0;
          newline = carry.indexOf("\n")
        ) {
          const line = carry.slice(0, newline);
          carry = carry.slice(newline + 1);
          if (line) {
            // biome-ignore lint/performance/noAwaitInLoops: entries land newest-first — the transcript would be scrambled if two consumes raced
            await take(line);
          }
        }
      }
      carry += decoder.decode();
      if (carry.trim()) {
        await take(carry);
      }
      return hydrations.get(viewId) === epoch;
    };

    if (!(await drain(response.body))) {
      return { ok: true, skipped: true };
    }

    // Everything older than the tail, for scrollback: strictly before the
    // oldest entry the tail read, so nothing on it can be a row already on
    // screen — a line written between the two reads belongs to the newest
    // end, which the live stream carries. A tail shorter than its bound is the
    // whole conversation already. By now the newest turns are long since on
    // screen, so this read's full-file parse is off the visible path.
    if (oldest && consumed >= TRANSCRIPT_TAIL_CEILING) {
      const rest = await fetch(messagesUrl(source, { before: oldest }));
      if (!(rest.ok && rest.body)) {
        throw new Error(
          (await rest.text().catch(() => "")) || rest.statusText || "unreadable"
        );
      }
      if (!(await drain(rest.body))) {
        return { ok: true, skipped: true };
      }
    }

    // The head of a transcript is always somewhere a chunk can start, and an
    // empty one still has to publish: it is what says the session is empty.
    // The last chunk is mapped in a task of its own, like every chunk before
    // it, and the read ends in the task after that: what waits for the whole
    // read to draw (a delegate's card) draws in its own task, not in the one
    // that mapped the last 250 entries.
    if (buffered.length > 0 || chunks === 0) {
      if (chunks > 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      publish(buffered.reverse());
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    release();
    // The newest turns may already be on screen; a failure reading the rest
    // joins them rather than taking the transcript down with it. With nothing
    // on screen there is no transcript to join, so the failure is handed back
    // for the pane to state outright.
    if (chunks > 0) {
      target.harnessRows = [
        errorMessage(viewId, `could not read transcript: ${message}`),
        ...target.harnessRows,
      ];
      place(target);
      return { ok: true };
    }
    return fail({ reason: "failed", message });
  } finally {
    target.loading = false;
    target.hydrating = false;
  }
}

/**
 * Whose voice a stored entry's rows are, by the transcript's own rule — what
 * the history reader cuts its chunks by. Sends' are their rows', where they
 * draw one in this place; one waiting, or retired, draws nothing here.
 */
function entryVoice(
  viewId: string,
  entry: SessionMessage,
  records: Record<string, SendRecord>
): Voice {
  const voices = entry.sends
    ? entry.sends
        .map((uuid) => records[uuid])
        .filter((held) => held.state === "read" || held.state === "failed")
        .map((held) => voiceOfMessage(sendRow(held)))
    : mapTranscript(viewId, [entry]).messages.map(voiceOfMessage);
  if (voices.includes("you")) {
    return "you";
  }
  return voices.find((voice) => voice !== "none") ?? "none";
}

/** Hands the held frames back to the store, minus what the transcript already had. */
function replayHeld(instanceId: string, seeded: Set<string>): void {
  const held = backfilling.get(instanceId) ?? [];
  backfilling.delete(instanceId);
  for (const frame of held) {
    if (frame.kind === "frame") {
      // A partial paints text whose final message may already be seeded. The
      // turn's own frames land right behind it, so dropping these costs nothing.
      if (frame.message.type === "stream_event") {
        continue;
      }
      const uuid = "uuid" in frame.message ? frame.message.uuid : undefined;
      if (uuid && seeded.has(uuid)) {
        continue;
      }
    }
    handleFrame(frame);
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
      categories: (usage.categories ?? []).filter(
        (row) => row.name !== "Free space"
      ),
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
    const [supported, reloaded] = await Promise.allSettled([
      request<SupportedCommands>(CONTROL_SUPPORTED_COMMANDS),
      request<{ skills: SlashCommand[] } | undefined>(CONTROL_RELOAD_SKILLS),
    ]);
    if (supported.status === "fulfilled") {
      const commands = supported.value;
      target.commands.names = commands.map((command) => command.name);
      target.commands.detailed = detailsOf(commands);
      if (commands.some((command) => command.kind)) {
        target.commands.skills = commands
          .filter((command) => command.kind === "skill")
          .map((command) => command.name);
      }
    } else if (!isCustodyRefusal(supported.reason)) {
      console.error(
        `[cawco] supportedCommands on ${instanceId} failed:`,
        supported.reason
      );
    }
    if (reloaded.status === "fulfilled" && reloaded.value?.skills) {
      target.commands.skills = reloaded.value.skills.map((skill) => skill.name);
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
 * session into it — so a session that wants it now is started again in place:
 * same instance id, same hub row, its own SDK session resumed, so the new
 * process reads the whole conversation back. A side quest relaunches the same
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
  const payload: SpawnPayload = {
    instanceId,
    cwd: target.cwd,
    harness: target.harness,
    resume: { sessionKey },
    // A relaunch is a spawn like any other, so it has to say what it is: a quest
    // that stayed silent about it would come back as mainline work, untagged.
    scratch: target.scratch ? {} : undefined,
    permissionMode,
    // Only the mode is being changed, so the model the session was answering on
    // and the level it was thinking at both carry over — the spawn is the row's
    // new word on all three.
    model: target.model ?? undefined,
    effort: effortToResend(target.effort),
    requestId,
  };

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
 * Where a rewind lands: the turn `resumeSessionAt` names, and how much of the
 * transcript survives it.
 *
 * The SDK resumes "up to and including" an `SDKAssistantMessage.uuid`, so the
 * anchor has to be an assistant frame — and one that ended in words. A frame
 * whose blocks include a tool call would resume into a `tool_use` with no
 * result behind it, which the API refuses outright, so the search walks past
 * those to the last turn that closed.
 */
function rewindPoint(
  target: SessionState,
  id: string
): { at: string; cut: number } | null {
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
    // One assistant turn is several messages under one uuid; the whole frame
    // the anchor belongs to stays, because the SDK keeps all of it too.
    let cut = index + 1;
    while (cut < edited && target.messages[cut].sdkUuid === uuid) {
      cut += 1;
    }
    return { at: uuid, cut };
  }
  return null;
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

/**
 * Which of a session's turns can be rewound to, by the message's id — what
 * decides whether the transcript offers the edit and fork affordances at all.
 * One pass over the transcript, because every message on screen asks the same
 * question.
 */
export function rewindableTurns(instanceId: string): Set<string> {
  const turns = new Set<string>();
  const target = state.sessions[instanceId];
  if (!target) {
    return turns;
  }
  const calls = toolFrames(target.messages);
  let anchored = false;
  for (const message of target.messages) {
    // A send the session read, or a turn it stored with no send behind it.
    if (
      message.type === "user" &&
      (message.state === "read" || message.state === undefined) &&
      anchored
    ) {
      turns.add(message.id as string);
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
  const point = rewindPoint(target, id);
  if (!point) {
    throw new Error(
      "There is no answered turn behind this message to go back to."
    );
  }

  const requestId = newId();
  const payload: SpawnPayload = {
    instanceId,
    cwd: target.cwd,
    harness: target.harness,
    resume: { sessionKey, atMessage: point.at },
    // The same four a relaunch carries: a rewind changes what the session has
    // said, not what it is.
    scratch: target.scratch ? {} : undefined,
    permissionMode: target.permissionMode ?? undefined,
    model: target.model ?? undefined,
    effort: effortToResend(target.effort),
    requestId,
  };

  // Cut on screen before the process is cut, so the rewind reads as the reader
  // asked for it — and put every bit of it back if the spawn never lands, or
  // they are left with a transcript shorter than the conversation behind it.
  // The cut is made in the harness's rows, after the answer the rewind lands
  // on: the row that ends the kept part on screen is one of them.
  const transcript = target.harnessRows;
  const branches = target.subagents;
  const read = backfilled.has(instanceId);
  target.harnessRows = transcript.slice(
    0,
    transcript.indexOf(target.messages[point.cut - 1]) + 1
  );
  place(target);
  const spawned = new Set(
    target.messages.map((message) => message.metadata?.toolId)
  );
  target.subagents = Object.fromEntries(
    Object.entries(branches).filter(([toolUseId]) => spawned.has(toolUseId))
  );
  target.streaming = "";
  // Whatever was in flight belongs to the process being replaced.
  settleStopped(instanceId);
  // What is on screen is no longer the whole of what is on disk: the next join
  // has to read this session back rather than trust the latch.
  backfilled.delete(instanceId);
  target.relaunching = true;
  try {
    await ask<void>(requestId, "rewind", CONTROL_TIMEOUT_MS, () =>
      send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    submitCommand(instanceId, machineId, "send", { text: content });
  } catch (error) {
    target.harnessRows = transcript;
    place(target);
    target.subagents = branches;
    if (read) {
      backfilled.add(instanceId);
    }
    throw error;
  } finally {
    target.relaunching = false;
    // biome-ignore lint/complexity/noVoid: fire-and-forget — the relaunch already landed, this just resyncs the fleet list
    void refresh();
  }
}

/**
 * A side quest that starts from the middle of a conversation rather than its
 * end: the fork the header offers, resumed at the turn the reader picked. The
 * session it branches from is left running and untouched.
 */
export function forkFrom(instanceId: string, id: string): string {
  const target = session(instanceId);
  if (!(target.sessionId && target.machineId)) {
    throw new Error(
      "This session has not named itself yet. Try again in a moment."
    );
  }
  const point = rewindPoint(target, id);
  if (!point) {
    throw new Error(
      "There is no answered turn behind this message to branch from."
    );
  }
  return forkSession({
    machineId: target.machineId,
    cwd: target.cwd,
    sessionId: target.sessionId,
    harness: target.harness,
    history: target.messages.slice(0, point.cut),
    at: point.at,
  });
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
  const stopped = new Set(
    instances.filter((row) => !isLive(row)).map((row) => row.id)
  );

  const rows: BlockedRequest[] = [];
  for (const target of Object.values(state.sessions)) {
    if (target.pending.length === 0 || stopped.has(target.instanceId)) {
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
  const timeA = (a.lastEventAt ?? a.startedAt).getTime();
  const timeB = (b.lastEventAt ?? b.startedAt).getTime();
  return timeB - timeA;
};

export const cawco = {
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
  /** The hub's limit readings have landed at least once. */
  get usageLimitsRead() {
    return state.usageLimitsRead;
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
  get previewVisible() {
    return state.previewVisible;
  },
  get previewRequests() {
    return state.previewRequests;
  },
  get runningInstances() {
    return runningInstances;
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
  /** Side quests across the fleet — kept in their own section, not per machine. */
  get scratchInstances(): InstanceRow[] {
    return instances.filter((row) => isListed(row) && row.kind === "scratch");
  },
  /** Stored sessions on one machine, minus the side quests hiding among them. */
  catalogOf: (machineId: string): NeutralSessionInfo[] =>
    (catalog[machineId] ?? []).filter(listedInHistory),
  get projects() {
    return state.projects;
  },
  projectsOn: (machineId: string): ProjectRow[] =>
    state.projects.filter((project) => project.machineId === machineId),
  project: (id: string): ProjectRow | null =>
    state.projects.find((project) => project.id === id) ?? null,
  /** Sessions a project owns: started from it, or running in its checkout.
   *  Failed ones stay listed here too — same board rule as the sidebar. */
  liveIn: (project: ProjectRow): InstanceRow[] =>
    instances.filter(
      (row) =>
        isListed(row) &&
        (row.projectId === project.id ||
          (row.machineId === project.machineId && under(project.cwd, row.cwd)))
    ),
  /** Stored sessions the SDK recorded somewhere inside the project's checkout. */
  storedIn: (project: ProjectRow): NeutralSessionInfo[] =>
    (catalog[project.machineId] ?? []).filter(
      (info) =>
        listedInHistory(info) && info.cwd && under(project.cwd, info.cwd)
    ),
  session: (instanceId: string): SessionState | null =>
    state.sessions[instanceId] ?? null,
  /**
   * The hub's record of one delegate's exchange with its parent, oldest first.
   * Empty for a delegate whose traffic predates the table — its card falls back
   * to reading the markers out of the parent's transcript.
   */
  delegateEventsOf: (instanceId: string): DelegateEvent[] =>
    state.delegateEvents[instanceId] ?? [],
  /** The work items a session delegated that its tray knows of, oldest first. */
  workItemsOf: (parentInstanceId: string): WorkItemSummary[] =>
    Object.values(state.workItems)
      .filter((item) => item.parentInstanceId === parentInstanceId)
      .sort((a, b) => a.createdAt - b.createdAt),
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
    const target = state.sessions[instanceId];
    // Blocked wins everywhere: a parked permission is broadcast, not filtered.
    if (target && target.pending.length > 0) {
      return "blocked";
    }
    // An open session's frames are live and authoritative; anything else falls
    // back to the daemon's pulse — the only word on a session this browser has
    // not subscribed to, whose frame-fed state is frozen at the tab that closed.
    if (target && isSubscribed(instanceId)) {
      return activityOf(target);
    }
    const pulse = state.pulses[instanceId];
    if (pulse) {
      return pulse.activity;
    }
    return target ? activityOf(target) : "idle";
  },
  currentToolOf: (
    instanceId: string
  ): { name: string; glance: string } | null => {
    const target = state.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.currentTool;
    }
    return state.pulses[instanceId]?.currentTool ?? null;
  },
  /**
   * When the daemon last pulsed a session, ms epoch — the freshest signal a
   * rail has for an unsubscribed session, since the pulse is broadcast for
   * every session while its transcript frames only flow to a watcher.
   */
  pulseAt: (instanceId: string): number | undefined =>
    state.pulses[instanceId]?.at,
  /** When the session's current turn began, ms epoch; `undefined` while it is idle. */
  turnSince: (instanceId: string): number | undefined =>
    state.turnSince[instanceId],
  /** When the hub parked a waiting workflow run's question, ms epoch. */
  runAskRaisedAt: (runId: string): number | undefined =>
    state.runAskRaisedAt[runId],
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
