/**
 * The browser end of the Envelope spine: one WebSocket to the hub, and each
 * session's transcript as the hub built it — a page fetched once, then the
 * changes its stream carries (NEW.md §6).
 */

import type {
  Account,
  AccountBench,
  AccountCatalog,
  AccountCatalogFault,
  AccountHue,
  AccountKind,
  AccountProvider,
  AccountReading,
  AccountSetupStep,
  AccountSignin,
  AccountSigninResult,
  PendingAccountSignin,
  PlacementPreview,
  ProviderChoice,
  ProviderRouting,
  ProviderSigninChallenge,
  ProviderSigninResult,
  RebalanceNotice,
} from "@cawco/core/accounts";
import type { ApprovedActionView } from "@cawco/core/actions";
import type { Activity } from "@cawco/core/activity";
import type {
  ArtifactNeed,
  ArtifactNeedNotice,
} from "@cawco/core/artifact-needs";
import { ASK_USER_QUESTION, RESOLVE_PERMISSION } from "@cawco/core/ask-tools";
import type { SendAttachment } from "@cawco/core/attachments";
import { type Bounded, readWithin } from "@cawco/core/bounded";
import type { ListedBrowser } from "@cawco/core/browser";
import { GATED_PAGE_MARK, GATED_PAGE_PARAM } from "@cawco/core/browser-gate";
import type { ConnectionView } from "@cawco/core/connections";
import { detach } from "@cawco/core/detach";
import type { AvailableCommand } from "@cawco/core/fleet";
import { classifyCommand } from "@cawco/core/fleet";
import type { FleetWatchNotice } from "@cawco/core/fleet-watch";
import type {
  BrowserAskFrame,
  ConnectAskFrame,
  FleetFetchFrame,
  HarnessFailed,
  HarnessUnanswered,
  PreviewSettings,
  ProjectOfferAccepted,
  ProjectOfferSummary,
  ProjectStopFrame,
} from "@cawco/core/frames";
import type {
  EffortLevel,
  HarnessCapabilities,
  HarnessKind,
  MachineHarnessReport,
  McpServerStatus,
  ModeAsk,
  NeutralSessionInfo,
  NeutralStatus,
  PermissionMode,
  PermissionResult,
  PermissionUpdate,
  SendRecord,
  SessionEffort,
  SlashCommand,
  SupportedCommands,
  WorkspaceHolding,
} from "@cawco/core/harness";
import { CONTROL_SUPPORTED_COMMANDS } from "@cawco/core/harness";
import type { LandsMode } from "@cawco/core/injected";
import type { LawBroken } from "@cawco/core/invariant";
import { machineFaultWords, machineLabel } from "@cawco/core/machine-names";
import type { MoveJob } from "@cawco/core/move";
import type { PermissionPresentation } from "@cawco/core/permission-presentation";
import type { SessionPlan } from "@cawco/core/plan";
import type {
  CawInitiated,
  DesignOfferState,
  LfsOfferState,
  OnCap,
  ProjectCap,
  ProjectConversationView,
  ProjectSpend,
} from "@cawco/core/project-conversation";
import { capHolds } from "@cawco/core/project-conversation";
import type {
  AgentRow,
  BuildInfo,
  ContinuationJob,
  ControlPayload,
  DelegateEvent,
  Envelope,
  FramePayload,
  FsPayload,
  InstanceRow,
  NamedSpawn,
  SendPayload,
  SessionPulse,
  SessionTooling,
  SpawnPayload,
  StopRequest,
  WorkItemSummary,
} from "@cawco/core/protocol";
import { questionsOf } from "@cawco/core/question";
import { relaunchOf } from "@cawco/core/relaunch";
import { CAWCO_SCRATCH_TAG } from "@cawco/core/scratch-tag";
import type { ProjectStarter, StarterPlace } from "@cawco/core/starters";
import type {
  CommandKind,
  SessionStreamFrame,
  StreamHeartbeat,
} from "@cawco/core/stream";
import {
  HEARTBEAT_DEADLINE_MS,
  HEARTBEAT_INTERVAL_MS,
  HUB_TAKE_MEASURE,
  WIRE_PROTOCOL,
} from "@cawco/core/stream";
import type {
  RelayAct,
  RelayAnswer,
  RelayJourneyView,
  RelayProofReport,
  RelayTry,
} from "@cawco/core/stream-relay";
import type { TailnetHttps } from "@cawco/core/tailnet-https";
import { HOUR_MS } from "@cawco/core/time";
import type {
  ToolGlance,
  TranscriptBlock,
  TranscriptBranch,
  TranscriptEvent,
  TranscriptFacts,
  TranscriptPage,
  TranscriptPageBranch,
  TranscriptTail,
} from "@cawco/core/transcript-types";
import { unhandled } from "@cawco/core/unhandled";
import type { UpstreamPosts, WriteMethod } from "@cawco/core/upstream-guard";
import type {
  ClaudeLimits,
  OpenCodeGoLimits,
  UsageLimitsResponse,
  UsageSpend,
} from "@cawco/core/usage/types";
import { announcingParts, clientLine } from "@cawco/core/wire";
import { accountsWords } from "@cawco/core/words/accounts";
import { askWords } from "@cawco/core/words/asks";
import { catalogWords } from "@cawco/core/words/catalog";
import { flushSync, untrack } from "svelte";
import { SvelteMap } from "svelte/reactivity";
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
import { page as servedPage } from "$app/state";
import { activityOf, runningSubagents } from "./activity";
import { deletePreview } from "./artifact-api";
import { Keyed, Pulse, type PulseReading, unlessSame } from "./board.svelte";
import { currentClientId } from "./client-id";
import { readInstalls, takeInstallsFrame } from "./connect/installs.svelte";
import { devDebug } from "./dev-debug";
import { heardFrame, heardSince, readLeaves } from "./heard";
import { mustPair, readAuth, takeAuthFrame } from "./hub-auth.svelte";
import {
  deadlineIn,
  type HubFailure,
  hubFailure,
  hubRefusal,
  machineAway,
  failureWords as messageOf,
} from "./hub-read";
import { newId } from "./id";
import {
  type BoardRow,
  type InstanceIndex,
  instanceForSession,
  resolveSessionTitle,
  transcriptUrl,
} from "./links";
import { notices } from "./notices.svelte";
import { unpickedMode } from "./permission-modes";
import { readPerson, showDeskAlert, takePerson } from "./person.svelte";
import { type HeldPlan, handlePlanMessage } from "./plan";
import { presenceClientId } from "./presence";
import { send as askHub, json } from "./project-tasks";
import { placedOn } from "./projects";
import { type CommandRefusal, refusals } from "./refusals.svelte";
import { noteChange } from "./repeated-keys";
import { forgetSend, keepSend, keptSends, refuseSend } from "./send-store";
import { checkServedBuild, newerBuild } from "./served-build.svelte";
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
  following,
  forgetUnwatched,
  handleStreamMessage,
  latestCommand,
  noteDisconnect,
  resumeHeld,
  resumePendingSends,
  SETTLED_COMMAND_LIMIT,
  SETTLED_COMMAND_TTL_MS,
  submitCommand as submitTrackedCommand,
  subscribeSession,
  sweepCommands,
} from "./stream";
import { warmCompactionMark } from "./transcript/compaction-mark";
import {
  answeredNote,
  errorMessage,
  localUserMessage,
  withdrawnNote,
} from "./transcript/local";
import { routedToParent } from "./transcript/present";
import { holdsCompaction } from "./transcript/rows";
import { speakerName } from "./transcript/speaker";
import type { DelegateAskEvent, Message } from "./types";
import { type MissedRead, TRY_AGAIN, unansweredWords } from "./unanswered";
import { updates } from "./updates/updates.svelte";
import { contextOf, workspace } from "./workspace/workspace.svelte";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

/**
 * What to *tell a reader* about the hub, which is coarser than the socket's own
 * state on purpose. `connecting` is the transient every cold load passes
 * through, and a dropped socket's first seconds of retrying, and is never a
 * fault; `unreachable` is one — the hub is a process on somebody's machine,
 * and it being off is the ordinary case, not the exotic one. It holds from
 * {@link OUTAGE_GRACE} after the socket went until the hub is back, through
 * every retry in between: the deadline the first close sets
 * (`state.outageAt`), read against the clock ({@link ahead}).
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

/** A machine from the hub registry (`GET /api/agents`, and `instances` frames). */
export type Machine = AgentRow;

/** A session the hub knows about (`GET /api/instances`, and `instances` frames). */
export type { InstanceRow } from "@cawco/core/protocol";
export type { BoardRow } from "./links";

/**
 * Where a project's files are (place): a checkout on a machine, a
 * delegate's workspace while it lives or is held, or the project's folder on
 * the hub.
 */
export interface ProjectPlace {
  createdAt: string;
  id: string;
  /** The project's primary checkout: exactly one once it has any. */
  isPrimary: boolean;
  /** A `hub` place is the project's folder on the hub (machine `hub`, path `projects/<id>`). */
  kind: "checkout" | "hub";
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
  /** The harness its Caw runs on. */
  cawHarness: HarnessKind;
  /** The model its Caw runs; null: its harness's default. */
  cawModel: string | null;
  /**
   * Its Caw's session, once the hub has started one; null before and after
   * one is retired. Read again on `projects.changed`, which the hub sends as
   * it changes (caw.ts `setLead`).
   */
  conversationInstanceId: string | null;
  createdAt: string;
  /** Its events reach its conversation (made with Caw: on). */
  eventsOn: boolean;
  id: string;
  /** Where its attempts land when their task says nothing. */
  lands: LandsMode;
  /** The connection that signs in to {@link lfsUrl}; null with it. */
  lfsConnection: string | null;
  /** Where its large files live, an LFS endpoint; null: each repository's origin's own LFS. */
  lfsUrl: string | null;
  name: string;
  places: ProjectPlace[];
  /** Its primary checkout's id; null while it has none (a New project before its place is picked). */
  primaryPlaceId: string | null;
  /** The repository its checkouts are of, `host/owner/repo`; null when unknown. */
  remote: string | null;
  /** Review before done: only you move a task to done, and landed work waits in review. */
  review: boolean;
  /**
   * Whether its agents may post to other people's repositories (hub
   * upstream.ts); null: the fleet's answer ({@link cawco.fleetUpstream}).
   */
  upstreamPosts: UpstreamPosts | null;
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

/**
 * The second every deadline is read against ({@link ahead}). A status that
 * holds until a moment — a machine reconnecting until its hub stops reading
 * it so, the hub gone past its grace — is that moment and this clock, never
 * a flag a later event has to clear, so it ends on its own at the moment.
 * It ticks while a deadline asked about is still ahead, and stops on the
 * first tick past the last of them: every reader has its answer by then.
 */
const second = $state({ now: 0 });
let secondTicker: ReturnType<typeof setInterval> | undefined;
let lastDeadline = 0;

/** Whether `deadline` (epoch ms) is still ahead, read so its reader turns when it passes. */
function ahead(deadline: number): boolean {
  // Read off the tick, so a reader is asked again on every one; the tick is
  // never later than the time itself.
  const now = Math.max(second.now, Date.now());
  if (!browser || deadline <= now) {
    return deadline > now;
  }
  lastDeadline = Math.max(lastDeadline, deadline);
  secondTicker ??= setInterval(() => {
    second.now = Date.now();
    if (second.now >= lastDeadline) {
      clearInterval(secondTicker);
      secondTicker = undefined;
    }
  }, 1000);
  return true;
}

/**
 * Only a session the hub can still reach is live; the rest is history. A
 * session its project is moving for (`moving`) is live work the hub carries.
 */
const isLive = (row: BoardRow): boolean =>
  row.status === "running" ||
  row.status === "starting" ||
  row.status === "moving";

/**
 * A session that stays on the board until the operator discards it: live work,
 * a real failure to look at, a nap to wake from, one the operator stopped, or
 * a row the hub simply cannot currently ask about — `unknown` is never dropped
 * just because its machine went quiet, the same way it is never rendered as
 * though nothing were wrong (see {@link isStale}). Only `discarded` is off
 * the board. `stopped` was left out here by omission, not by rule: a session
 * stopped from its row's menu then stood in no list at all, its menu and its
 * transcript out of reach. It has ended, so it is listed as ended sessions
 * are (Finished until seen, Recent, its project's tree). A `stopping` one has
 * ended too, its machine yet to confirm the process gone, and is listed so.
 */
const isListed = (row: BoardRow): boolean =>
  isLive(row) ||
  row.status === "error" ||
  row.status === "sleeping" ||
  row.status === "stopping" ||
  row.status === "stopped" ||
  row.status === "unknown";

/**
 * A session whose owning machine the hub cannot currently reach — the
 * presence overlay's value (`withSessionPresence`, ARCHITECTURE.md), not a
 * guess of our own. It may still be running, sleeping, or gone on that
 * machine; the hub genuinely does not know, which is a different claim from
 * every other status and must never be flattened into "idle".
 */
export const isStale = (row: BoardRow): boolean => row.status === "unknown";

/**
 * A session whose process is gone but whose conversation is not: sleeping, not
 * failed. Exactly the rows a send wakes (the hub's `wakeForSend`) — dead, with an
 * SDK session to resume from. `sleeping` is the taxonomy's own word for this
 * now (ARCHITECTURE.md's status table) — the hub never reports it any other
 * way, so this reads the status directly rather than inferring it from
 * `lastError`. A `stopped` row with a session id is the other resumable case:
 * deliberately ended, but nothing stops it being picked back up; so is a
 * `stopping` one, whose resume replaces the process its machine is ending.
 */
export const isResumable = (row: BoardRow): boolean =>
  row.status === "sleeping" ||
  ((row.status === "stopping" || row.status === "stopped") &&
    Boolean(row.sessionId));

/**
 * A session that died of something, and is not coming back by being opened.
 * `error` now means exactly that — the taxonomy requires `lastError` to be set
 * whenever the hub asserts it — so there is no longer a resumable marker to
 * carve back out of it.
 */
export const isFailed = (row: BoardRow): boolean => row.status === "error";

/**
 * A spin-off is history nobody asked for until they keep it, and the agent
 * tags its SDK session on the way out to say so. The tag is the whole test —
 * the directory a session ran in says nothing about whether it was a spin-off.
 */
const listedInHistory = (info: NeutralSessionInfo): boolean =>
  info.tag !== CAWCO_SCRATCH_TAG;

export interface PendingPermission {
  /** A browser ask's browser, reason and origin (core `BrowserAskFrame`): its card offers Deny and Take over. */
  browserAsk?: BrowserAskFrame;
  /** A connect ask's server, reason, sign-in address and access (core `ConnectAskFrame`): its card offers Connect and Not now. */
  connectAsk?: ConnectAskFrame;
  /**
   * When this device last heard the hub park it, in the order it hears
   * things ({@link askHeard}): a read of `/api/pending` asked for before
   * then cannot know of it, so it cannot unpark it.
   */
  heard: number;
  input: Record<string, unknown>;
  instanceId: string;
  /**
   * The session whose pane draws the ask when it is not its own (a memory
   * curator run's proposal, parked under its own id on machine "hub").
   */
  originInstanceId?: string;
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
interface CommandState {
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
  | {
      machineId: string;
      message: string;
      reason: "offline";
      /**
       * The hub heard from the machine moments ago: its agent is on its way
       * back (the hub restarted, or the machine's connection dropped), and
       * the read comes once it is. Until this moment (epoch ms), when the
       * hub stops reading it so, the machine is said to be reconnecting
       * ({@link reconnectingNow}); past it, offline, on the clock alone. A
       * wait, not a fault: said in place, never as a toast. `message` is
       * the offline sentence; {@link faultMessage} says the one for now.
       */
      reconnectingUntil?: number;
    }
  | { message: string; reason: "failed" };

export interface SessionState {
  /**
   * Why the last read again over the rows held failed. The rows stay where
   * the reader has them, and the read is made again on the next event that
   * can answer it: the machine online again, the socket back, the backoff
   * after a read the hub failed (`READ_AGAIN_MS`), a retry.
   */
  behind: ReadFault | null;
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
  /**
   * The session a continuation took this one's work item on in, by its id
   * and title, as its newest page said (core `TranscriptPage.continuedTo`):
   * what its pane reads on its first paint and when the board no longer
   * lists its row. Null on every other.
   */
  continuedTo: { instanceId: string; title: string } | null;
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
  /**
   * Which harness owns {@link sessionId} — what a resume and a catalog read
   * route on. Null until its row, its spawn or its stored listing names it.
   */
  harness: HarnessKind | null;
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
  /**
   * How many times what this session shows has changed: bumped whenever
   * {@link messages} moves, a row on it takes the hub's word in place, or a
   * branch is opened or replaced. A reader that folds the rows (the
   * transcript's build) depends on this and on the live tail alone, never on
   * every field of every row: tracking each one made every build of a long
   * transcript register, and later compare, a dependency per field per row.
   */
  rev: number;
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
   * palette's servers and tools. Said by the newest page's facts (the hub's
   * row's, when the transcript read holds no `init`) and replaced by every
   * live `init` after that.
   */
  tooling: SessionTooling;
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
/** Per machine, a sentence for each harness its last listing left out: not in time ({@link harnessDidntAnswer}) or failed ({@link harnessCouldntList}). */
let catalogLeftOut = $state.raw<Record<string, string[]>>({});
/** The machines whose stored sessions have been asked for and answered, or failed. */
const catalogsTried = $state<Record<string, true>>({});

/**
 * Every instance the hub knows, in the hub's order, as immutable rows
 * replaced whole — never edited in place. Raw state: the fleet is ~two
 * thousand rows, and a deep proxy made every field read of every row a
 * tracked signal. A walk over the board reads this; a row asked for by its
 * id is read from {@link rowsById}, which wakes on that row alone.
 */
let hubRows = $state.raw<InstanceRow[]>([]);
/** The hub's rows, as every walk over the rows reads them. */
const instances = $derived(hubRows);
/** Each hub row by its id, each key its own signal (board.svelte.ts). */
const rowsById = new Keyed<InstanceRow>();
/** Each session key's rows, by key, the same way. */
const rowsBySession = new Keyed<readonly InstanceRow[]>();

/**
 * What each hub row's session needs from you ({@link activityNow}), held
 * per row: every list asks it of every row it holds, and asked afresh each
 * time, a turn ending somewhere re-ran it for the whole board. Each is
 * worked out again only when what it reads moves (its row, its pulse's
 * activity, its parked asks, its subscription). Made as the row arrives,
 * in the socket's or a read's handler, outside every component, so no
 * component's teardown takes it.
 */
class RowActivity {
  readonly id: string;
  readonly value = $derived.by(() => activityNow(this.id));
  constructor(id: string) {
    this.id = id;
  }
}
const rowActivity = new Map<string, RowActivity>();

/**
 * The hub's rows as `next` has them: each row that moved (`moved`) and each
 * gone (`gone`) written to the keyed store, key by key, so a delta wakes
 * only the readers of the rows it carried; then the list itself.
 */
function holdRows(
  next: InstanceRow[],
  moved: readonly InstanceRow[],
  gone: readonly string[]
): void {
  for (const id of gone) {
    const was = rowsById.get(id);
    if (was) {
      leaveSession(was);
      rowsById.delete(id);
      rowActivity.delete(id);
    }
  }
  for (const row of moved) {
    const was = rowsById.get(row.id);
    if (was === row) {
      continue;
    }
    if (was) {
      leaveSession(was);
    }
    rowsById.set(row.id, row);
    joinSession(row);
    if (!rowActivity.has(row.id)) {
      rowActivity.set(row.id, new RowActivity(row.id));
    }
  }
  hubRows = next;
}

/** A row out of its session key's rows. */
function leaveSession(row: InstanceRow): void {
  if (!row.sessionId) {
    return;
  }
  const rest = (rowsBySession.get(row.sessionId) ?? []).filter(
    (one) => one.id !== row.id
  );
  if (rest.length > 0) {
    rowsBySession.set(row.sessionId, rest);
  } else {
    rowsBySession.delete(row.sessionId);
  }
}

/** A row into its session key's rows. */
function joinSession(row: InstanceRow): void {
  if (row.sessionId) {
    rowsBySession.set(row.sessionId, [
      ...(rowsBySession.get(row.sessionId) ?? []),
      row,
    ]);
  }
}

/**
 * One child a session's tray lists (DelegateTray): a delegate, by its work
 * item, or a session it started with `start_session`, which runs none. The
 * chip and its panel read only this; the acts on a failure (retry, replaced
 * by, dismiss) are a work item's, and only a chip with `work` offers them.
 */
export interface TrayChild {
  /** The work item's landing wait (WorkItemSummary `checkQueue`); null on a started session. */
  checkQueue: WorkItemSummary["checkQueue"];
  createdAt: number;
  dismissedAt: number | null;
  endedAt: number | null;
  /** Why it failed, first lines; "" when it has not, or said nothing. */
  error: string;
  /** Its chip's key: the work item's id, or the started session's own. */
  id: string;
  instanceId: string;
  /** Its machine's pause, while it holds the work item's session; null on a started session. */
  machinePaused: string | null;
  /** What the work item waits for to start; null on a started session. */
  queued: WorkItemSummary["queued"];
  /** Its account's limit stopping the work item's session, in words; null on a started session. */
  stalled: string | null;
  state: WorkItemSummary["state"];
  title: string;
  /** The delegate's work item; null on a started session. */
  work: WorkItemSummary | null;
}

/**
 * A session another one started with `start_session` (or a continuation
 * of one): it names its starter and runs no work item, the one thing that
 * tells it from a delegate (core `InstanceRow.workItemId`).
 */
const isStarted = (row: InstanceRow): boolean =>
  !!row.parentInstanceId && !row.workItemId;

/** The sessions each session started that run no work item, by their starter. */
const startedBy = $derived.by(() => {
  const by = new Map<string, InstanceRow[]>();
  for (const row of instances) {
    if (isStarted(row)) {
      const parent = row.parentInstanceId as string;
      by.set(parent, [...(by.get(parent) ?? []), row]);
    }
  }
  return by;
});

const epochMs = (at: string | number | Date | null | undefined): number =>
  at === null || at === undefined ? 0 : new Date(at).getTime() || 0;

const itemChild = (item: WorkItemSummary): TrayChild => ({
  id: item.id,
  instanceId: item.instanceId,
  title: item.title,
  state: item.state,
  createdAt: item.createdAt,
  endedAt: item.endedAt,
  dismissedAt: item.dismissedAt,
  error: item.firstLines.error,
  queued: item.queued,
  checkQueue: item.checkQueue,
  machinePaused: item.machinePaused,
  stalled: item.stalled,
  work: item,
});

/**
 * A started session as its tray says it: what its turn is doing. It is
 * persistent, so its "done" is a turn that ended (and a later turn takes
 * the chip back, DelegateTray `admitWaiting`); stopped is "cancelled", and
 * a session that errored "failed", with no work item to retry or dismiss.
 */
const sessionChild = (row: InstanceRow): TrayChild => {
  const state = ((): TrayChild["state"] => {
    switch (row.status) {
      case "starting":
        return "starting";
      case "error":
        return "failed";
      case "stopping":
      case "stopped":
      case "discarded":
        return "cancelled";
      case "moving":
      case "running":
      case "sleeping":
      case "unknown":
        break;
    }
    return cawco.activityOf(row.id) === "idle" ? "done" : "running";
  })();
  return {
    id: row.id,
    instanceId: row.id,
    title: resolveSessionTitle({
      title: row.title ?? row.derivedTitle,
      cwd: row.cwd,
      id: row.id,
    }),
    state,
    createdAt: epochMs(row.createdAt),
    // A turn ends at its own time; a stop or a failure when the row last moved.
    endedAt:
      state === "starting" || state === "running"
        ? null
        : (state === "done" && epochMs(row.turnEndedAt)) ||
          epochMs(row.updatedAt),
    dismissedAt: null,
    error: state === "failed" ? (row.lastError ?? "") : "",
    queued: null,
    checkQueue: null,
    machinePaused: null,
    stalled: null,
    work: null,
  };
};

/**
 * The rows looked up by id and by session: one object for good, each
 * lookup a keyed read ({@link rowsById}, {@link rowsBySession}). Rebuilt
 * whole on every change, it woke every reader of every row.
 */
const instanceIndex: InstanceIndex<BoardRow> = {
  byId: rowsById,
  bySession: rowsBySession,
};

/**
 * A derived list that hands back the array it handed back before while it
 * holds the same rows in the same order (board.svelte.ts `unlessSame`), so what
 * reads it is not woken by a row that moved outside it.
 */
function keepsLast<T>(list: () => T[]): () => T[] {
  let was: T[] | undefined;
  return () => {
    was = unlessSame(was, list());
    return was;
  };
}

const runningInstances = $derived.by(keepsLast(() => instances.filter(isLive)));
const listedInstances = $derived.by(
  keepsLast(() => instances.filter(isListed))
);
/** `listedInstances` by id, built once per change for every list that walks their trees. */
const listedById = $derived(
  new Map(listedInstances.map((row) => [row.id, row] as const))
);
const staleInstances = $derived.by(keepsLast(() => instances.filter(isStale)));

const state = $state({
  fleetMcp: null as import("@cawco/core/fleet").FleetMcpServer[] | null,
  previews: {} as Record<
    string,
    Extract<FramePayload, { kind: "preview" }> & {
      title?: string;
      path?: string;
      /** The page's capture in each scheme (PageThumb draws the reader's). */
      thumbnail?: import("./preview/wire").PageThumbnail;
      /** The revision the thumbnail was taken of. */
      thumbnailRevision?: string;
      /** A transcript card that shows the thumbnail is on screen (ToolGroup): the pane takes one. */
      thumbnailWanted?: boolean;
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
   * When the hub is said unreachable (epoch ms): {@link OUTAGE_GRACE} after
   * the first close, null again once it answers. Retries in between leave
   * it. A deadline, not a flag: `cawco.hub` reads it against the clock.
   */
  outageAt: null as number | null,
  /**
   * The hub said it restarts for an update (`hub.restart`), and by when it
   * answers again (epoch ms, on this clock). A close before then is the
   * update: the outage is said from the deadline, not from the close.
   * Null once the hub answers again, or takes it back.
   */
  restart: null as { until: number; version: string | null } | null,
  /**
   * This page was built for an older wire than the hub's, so it reads nothing
   * more off the socket ({@link olderThanHub}) until the update toast's
   * reload takes it to the hub's build.
   */
  older: false,
  /** When the next reconnect attempt fires, so the banner can count it down. */
  retryAt: null as number | null,
  /** The board's snapshot and the first read of the projects after it are in. */
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
   * The ids sessions had before the hub folded each one's continuations at
   * its account's limit into it: former id → its id now. A tab on a former
   * id is that session's.
   */
  formerIds: {} as Record<string, string>,
  /**
   * The fleet's preview mode, from the board: a switch moves every preview
   * origin, so a page loaded on its own (decisions PageFrame) loads again.
   */
  previewSettings: null as PreviewSettings | null,
  /**
   * The project moves the hub is carrying (core move.ts), whole: handed on
   * connect in the `instances` frame, then replaced by each `moves` frame.
   */
  moves: [] as MoveJob[],
  projects: [] as ProjectRow[],
  /**
   * How many times each project's tasks have changed since this page
   * connected, by project id (`tasks.changed` frames): what shows its tasks
   * reads them again when it moves.
   */
  tasksChanged: {} as Record<string, number>,
  /**
   * How many `tasks.changed` frames have named each task, by
   * `projectId/taskId`, and how many named none, by project id: an open
   * task reads itself again when either moves (`taskChangedOf`).
   */
  taskChanged: {} as Record<string, number>,
  tasksChangedUnnamed: {} as Record<string, number>,
  /**
   * How many times each project's decision pages have changed since this
   * page connected (`decisions.changed` frames): the Decisions tab reads them
   * again when it moves.
   */
  decisionsChanged: {} as Record<string, number>,
  /**
   * How many times each project's arrangement of blocks has changed since
   * this page connected (`blocks.changed` frames): its pages read it again
   * when it moves.
   */
  blocksChanged: {} as Record<string, number>,
  /**
   * Each project's starters for each place as the hub last wrote them while
   * this page was connected (`starters.changed` frames), by
   * `<place>:<project id>`: newer than the set its stages read carried.
   */
  starters: {} as Record<string, ProjectStarter[]>,
  sessions: {} as Record<string, SessionState>,
  /**
   * The line an ask leaves when it ends with no answer from this tab:
   * withdrawn before it was answered (the turn interrupted, the session
   * gone), or answered somewhere else, keyed by its request id. A session's
   * transcript draws it as a note.
   */
  askEnds: {} as Record<string, Message>,
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
   * An offer this tab answered by joining a project that already was: the
   * card stays where the offer stood, saying what it joined, until put away.
   */
  projectJoins: {} as Record<string, ProjectOfferAccepted>,
  /**
   * Approved actions waiting on the operator (proposed, or failed or of
   * unknown outcome until put away): read on connect, then kept whole by
   * `actions` frames.
   */
  actions: [] as ApprovedActionView[],
  /**
   * Each followed session's plan (plan.ts): its steps, its spec, an
   * attempt's to-dos, as the hub's `plan.snapshot` and `plan.delta` keep it.
   */
  plans: {} as Record<string, HeldPlan>,
  /**
   * Fleet watch's needs-you notices (core `FleetWatchNotice`), oldest first:
   * read as the dashboard connects, then kept whole by the hub's
   * `fleet_watch.notices` frames.
   */
  watchNotices: [] as FleetWatchNotice[],
  /**
   * The artifacts waiting on the person, and their notices (core
   * artifact-needs.ts): read as the dashboard connects, in `/api/pending`'s
   * `artifact.needs` envelope, then kept whole by the hub's frames.
   */
  artifactNeeds: [] as ArtifactNeed[],
  artifactNotices: [] as ArtifactNeedNotice[],
  /**
   * Every system law the hub caught broken since it started (core
   * invariant.ts), whole on each `laws.broken` frame; none until one breaks.
   */
  lawsBroken: [] as LawBroken[],
  /**
   * The fleet's upstream answer (`GET /api/fleet/choices` `upstream`):
   * whether agents may post to other people's repositories; null while
   * nobody has answered, which is when Needs you asks it; undefined until
   * read.
   */
  fleetUpstream: undefined as UpstreamPosts | null | undefined,
  /**
   * Every machine's browsers as the hub lists them: the `browser_list`
   * frame the socket opens with, then each one on a change; undefined until
   * the first.
   */
  browsers: undefined as ListedBrowser[] | undefined,
  /**
   * HTTPS on the hub machine's tailnet name (`GET /api/tailnet-https`, then
   * each `tailnet.https` frame): Needs you shows its step while one needs
   * the person; undefined until read.
   */
  tailnetHttps: undefined as TailnetHttps | undefined,
  /** Its step was taken while this page stood: the row ticks for {@link TAILNET_TICK_MS}, then leaves. */
  tailnetTicked: false,
  /**
   * The stream relay's journey (`GET /api/stream-relay`, then each
   * `stream_relay.journey` frame): Needs you shows its row while it asks,
   * Settings › Browsers its card or its summary; undefined until read.
   */
  relayJourney: undefined as RelayJourneyView | undefined,
  /** The domain this page reached CawCo through, as the hub saw it (null by IP, the tailnet, a name of the hub's). */
  relayDomain: null as string | null,
  /** It went live and was proven from outside while this page stood: the row ticks until the next open. */
  relayTicked: false,
  /**
   * Each Claude account's own limits, by account id — folded in from the
   * `kind: 'usage'` frame so the pill updates live rather than polling
   * (USAGE-SPEC.md §7.1). Empty while there is no Claude account.
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
  /** The answer's `result`, and the harnesses a `listSessions` answer left out ({@link LeftOut}). */
  resolve: (result: unknown, leftOut?: LeftOut) => void;
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

/** What a read past {@link TRANSCRIPT_READ_LIMIT_MS} says of itself. */
const READ_LIMIT_SENTENCE = `The hub didn't answer within ${TRANSCRIPT_READ_LIMIT_MS / 1000} seconds`;

/**
 * How long after a failed read, the hub answering, the transcript is read
 * again: the nth failure in a row waits the nth delay, and every one past
 * the last waits the last. A success starts it over. Our choice: a blip is
 * caught up within seconds, a hub that keeps failing is asked about once a
 * minute.
 */
const READ_AGAIN_MS = [2000, 4000, 8000, 16_000, 32_000, 60_000];

/**
 * The newest-page read in flight per view: a second ask joins it. `cancel`
 * ends it without an answer — the view's own reader is asking for a fresh one.
 */
const pageReads = new Map<
  string,
  { read: Promise<TranscriptOutcome>; cancel: () => void }
>();

// Lets the store be asserted from the console while developing, and a
// bench stand its conversation in as one the hub holds running
// (`adoptInstances`, as a snapshot does) and at work (`frame`, a hub frame
// taken as the socket takes it: a session's pulse lives in the store's own
// `Pulse`s, which no bench can write into `state`).
if (import.meta.env.DEV) {
  devDebug({ state, inflight, adoptInstances, frame: handleFrame });
}

// HMR-persistent socket references, so a module reload never leaves an orphan.
declare global {
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoSocket: WebSocket | null;
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoReconnectTimeout: ReturnType<typeof setTimeout> | null;
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoReconnectAttempts: number;
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoDisposing: boolean;
  /** The wake listeners are document-wide; bind them once across HMR reloads. */
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoWakeBound: boolean;
  /** This document asked for the hub (`ensureConnected`): only then does a wake reconnect. */
  // biome-ignore lint/style/useVarsOnTop: an ambient `declare global` var types a globalThis property; nothing is hoisted, and the rule reports it even first in the file.
  var __cawcoHubAsked: boolean;
}
globalThis.__cawcoSocket ??= null;
globalThis.__cawcoReconnectTimeout ??= null;
globalThis.__cawcoReconnectAttempts ??= 0;
globalThis.__cawcoDisposing ??= false;
globalThis.__cawcoWakeBound ??= false;
globalThis.__cawcoHubAsked ??= false;

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
  stopHeartbeat();
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
    harness: null,
    blocks: [],
    queued: [],
    rev: 0,
    cursor: null,
    continuedTo: null,
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
    behind: null,
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
 *
 * `kept`: how many blocks at the front the caller left as they were last
 * placed, so the list is compared and written from there on. A batch of live
 * changes moves rows at the end, and comparing every row of a long
 * transcript on each one read the whole list through the store, row by row,
 * on every batch a session streamed. With failure lines among the blocks, a
 * block's index is not its place in the list, and every row is compared.
 */
function place(target: SessionState, kept = 0): void {
  const current = target.messages;
  const from =
    target.notes.length === 0
      ? Math.min(kept, target.blocks.length, current.length)
      : 0;
  const next =
    from === 0
      ? [
          ...withNotes(target.blocks, target.notes),
          ...target.queued,
          ...target.local,
        ]
      : [...target.blocks.slice(from), ...target.queued, ...target.local];
  let same = 0;
  while (
    from + same < current.length &&
    same < next.length &&
    current[from + same] === next[same]
  ) {
    same += 1;
  }
  if (from + same === current.length && same === next.length) {
    return;
  }
  target.rev += 1;
  // A change at the very first row is a different transcript — a read, a
  // page in front, a rewind to nothing — and takes a list of its own.
  if (from + same === 0 && current.length > 0) {
    target.messages = next;
    return;
  }
  current.splice(
    from + same,
    current.length - from - same,
    ...next.slice(same)
  );
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
 * them all again. Says whether anything on the row moved.
 */
function adopt(held: Message, fresh: Message): boolean {
  let moved = false;
  if (held.type !== fresh.type) {
    held.type = fresh.type;
    moved = true;
  }
  if (held.content !== fresh.content) {
    held.content = fresh.content;
    moved = true;
  }
  if (held.state !== fresh.state) {
    held.state = fresh.state;
    moved = true;
  }
  if (held.queued !== fresh.queued) {
    held.queued = fresh.queued;
    moved = true;
  }
  if (held.sdkUuid !== fresh.sdkUuid) {
    held.sdkUuid = fresh.sdkUuid;
    moved = true;
  }
  if (held.timestamp !== fresh.timestamp) {
    held.timestamp = fresh.timestamp;
    moved = true;
  }
  if (held.toolCallId !== fresh.toolCallId) {
    held.toolCallId = fresh.toolCallId;
    moved = true;
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
    moved = true;
  }
  return moved;
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
 * was in gives it up in the same step it enters the next, a placed row the
 * hub lists waiting again included. The object on screen takes the hub's
 * word in place, so the row stays where it is drawn.
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
  // Placed, it leaves the sends waiting; waiting again, it leaves the rows
  // placed (the caller puts the whole queue in at once).
  const waiting =
    into === "blocks"
      ? pull(target.queued, block.id)
      : (target.queued.find((message) => message.id === block.id) ??
        pull(target.blocks, block.id));
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
  if (adopt(held, fresh)) {
    target.rev += 1;
  }
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
  if (!target.subagents[toolUseId]) {
    target.rev += 1;
  }
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

/**
 * The tail's fields the hub moved. Whether a turn is under way is the
 * daemon's now-state (`applyPulse`) once a pulse has come, the socket's or
 * the server load's: the tail's `busy` stands only where none has. The tail
 * and the pulse reach this tab by two roads, the session's stream and the
 * broadcast, and either can be first: a tail saying busy that landed after
 * the turn's end pulse held Stop up over a session at rest, with no pulse
 * left to come and put it down.
 */
function applyTail(target: SessionState, tail: Partial<TranscriptTail>): void {
  if (tail.busy !== undefined && !pulseOf(target.instanceId)) {
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
    // What is parked stays: an `init` opens every turn, and an ask the hub
    // owns (a question `ask` put) outlives the turn and the process. An ask
    // leaves on the hub's word alone (`permission_settled`, `/api/pending`):
    // the hub settles a dead process's asks itself (hub pending.ts `forget`).
  }
  // The turn or the compaction just changed how full the window is; ask
  // rather than guess, when something in this tab draws it
  // ({@link showContext}). A tab streams every open tab, the peek and every
  // delegate card, and a read for each of their turns' ends was a read
  // nobody saw.
  if (
    (facts.turnsEnded !== undefined || facts.lastCompaction) &&
    target.machineId &&
    contextShown.has(target.instanceId)
  ) {
    detach(
      refreshContext(target.instanceId, target.machineId),
      "refreshContext"
    );
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
    // A refusal the hub made is said once, on the send's row, with its way
    // back (transcript/send-recovery.svelte.ts): not over the composer too.
    // A mode ask is one (`modeAsk`, which carries no `refusal`): its row asks
    // for the mode in the dashboard's words, never the hub's.
    if (!(record.refusal || record.modeAsk)) {
      sendFailureNotices[target.instanceId] = record.reason
        ? `Message not sent: ${record.reason}`
        : "Message not sent.";
    }
    target.busy = pulseOf(target.instanceId)?.busy ?? false;
  }
}

/** Whether the main transcript this view holds has a row under `id`. */
function holdsBlock(target: SessionState, id: string): boolean {
  return target.blocks.some((message) => message.id === id);
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
  if (adopt(held, block as Message) && !block.parentToolUseId) {
    target.rev += 1;
  }
}

/**
 * Where a block the hub put in after `after` goes among the rows held: right
 * after that row; at the front when it is the conversation's first row and
 * the view holds the conversation's start. -1: the row before it is one this
 * view has not read yet (older than its first row), and the block comes with
 * that page.
 */
function insertAt(target: SessionState, after: string | null): number {
  if (after === null) {
    return target.cursor === null ? 0 : -1;
  }
  const at = target.blocks.findLastIndex((message) => message.id === after);
  return at < 0 ? -1 : at + 1;
}

/**
 * A block the hub put in, at the end (`block.append`) or after the row it
 * names (`block.insert`), unless this view holds it already: then it takes
 * the hub's word where it stands. Where the main transcript changed from,
 * or Infinity when it did not.
 */
function putBlock(
  target: SessionState,
  event: Extract<TranscriptEvent, { type: "block.append" | "block.insert" }>
): number {
  const { block } = event;
  if (block.parentToolUseId) {
    const branch = branchOf(target, block.parentToolUseId);
    if (!branch.messages.some((one) => one.id === block.id)) {
      branch.messages.push(block as Message);
    }
    return Number.POSITIVE_INFINITY;
  }
  if (holdsBlock(target, block.id)) {
    updateBlock(target, block);
    return Number.POSITIVE_INFINITY;
  }
  const at =
    event.type === "block.append"
      ? target.blocks.length
      : insertAt(target, event.after);
  if (at < 0) {
    return Number.POSITIVE_INFINITY;
  }
  target.blocks.splice(at, 0, take(target, block, "blocks"));
  return at;
}

/**
 * The sends waiting, as the hub lists them now, each taken into `queued`
 * ({@link take}). Where the main transcript changed from: its end, or the
 * first placed row that waits again, which leaves `blocks`.
 */
function putQueue(target: SessionState, blocks: TranscriptBlock[]): number {
  const waiting = new Set(blocks.map((block) => block.id));
  const placed = target.blocks.findIndex((message) => waiting.has(message.id));
  target.queued = blocks.map((block) => take(target, block, "queued"));
  return placed < 0 ? target.blocks.length : placed;
}

/**
 * One batch of the hub's changes to a session's transcript, applied in the
 * order it made them. Each is idempotent by id: a block this view already
 * holds takes the hub's word in place, wherever it stands, and is never held
 * twice. A row moves or goes only by its own `block.remove`.
 *
 * Most batches are the live tail alone (a few words streamed, the tool in
 * flight): those leave the list as it is, and nothing is placed. One that
 * moves rows places the list from the first block it touched (`kept`).
 */
function applyTranscript(
  target: SessionState,
  events: TranscriptEvent[]
): void {
  noteChange("transcript stream");
  /** The blocks at the front this batch has left as they were placed; none moved yet. */
  let kept = Number.POSITIVE_INFINITY;
  for (const event of events) {
    switch (event.type) {
      case "block.append":
      case "block.insert":
        kept = Math.min(kept, putBlock(target, event));
        break;
      case "block.update":
        updateBlock(target, event.block);
        break;
      case "block.remove": {
        const at = target.blocks.findLastIndex(
          (message) => message.id === event.id
        );
        if (at >= 0) {
          kept = Math.min(kept, at);
          target.blocks.splice(at, 1);
        }
        break;
      }
      case "queue":
        kept = Math.min(kept, putQueue(target, event.blocks));
        break;
      case "branch": {
        const known = target.subagents[event.branch.toolUseId];
        target.subagents[event.branch.toolUseId] = branchState(
          event.branch,
          known?.messages ?? [],
          known?.streaming ?? ""
        );
        target.rev += 1;
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
  if (kept !== Number.POSITIVE_INFINITY) {
    place(target, kept);
  }
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
 * A read's rows (`read`, oldest first: the newest page and any pages read
 * before it) MERGED into the rows this view holds, by id. A ROW ONCE SHOWN
 * STAYS WHERE IT IS: a held row the read names takes the hub's word in
 * place, as the same object; a held row the read lacks stays, unless the hub
 * lists it as taken out (`removed`, the newest page's); a row the read holds
 * that is not held goes after the row before it in the read, and a run of
 * them before any held row goes before the first held row the read names
 * (none named: after every held row). The cursor is the read's when the
 * read now opens the list, the held one otherwise.
 */
function mergeRows(
  target: SessionState,
  read: TranscriptBlock[],
  readCursor: string | null,
  removed: readonly string[]
): void {
  const gone = new Set(removed);
  const heldRows = target.blocks.filter((message) => !gone.has(message.id));
  if (heldRows.length === 0) {
    target.blocks = read.map((block) => take(target, block, "blocks"));
    target.cursor = readCursor;
    return;
  }
  const heldIds = new Set(heldRows.map((message) => message.id));
  const readIds = new Set(read.map((block) => block.id));
  const firstMet = heldRows.find((message) => readIds.has(message.id))?.id;
  /** The read's rows not held, by the held row they go after (null: before `firstMet`). */
  const runs = new Map<string | null, TranscriptBlock[]>();
  let anchor: string | null = null;
  for (const block of read) {
    if (heldIds.has(block.id)) {
      anchor = block.id;
      continue;
    }
    const run = runs.get(anchor) ?? [];
    run.push(block);
    runs.set(anchor, run);
  }
  const fresh = new Map(read.map((block) => [block.id, block]));
  const next: Message[] = [];
  const front = (runs.get(null) ?? []).map((block) =>
    take(target, block, "blocks")
  );
  if (firstMet === undefined) {
    next.push(...heldRows, ...front);
  }
  for (const message of firstMet === undefined ? [] : heldRows) {
    if (message.id === firstMet) {
      next.push(...front);
    }
    const word = fresh.get(message.id);
    if (word && adopt(message, word as Message)) {
      target.rev += 1;
    }
    next.push(
      message,
      ...(runs.get(message.id) ?? []).map((block) =>
        take(target, block, "blocks")
      )
    );
  }
  if (next[0] && readIds.has(next[0].id) && next[0].id !== heldRows[0]?.id) {
    target.cursor = readCursor;
  }
  target.blocks = next;
}

/**
 * The newest page of a session's transcript, as what this view shows: the
 * hub's blocks merged into the rows held ({@link mergeRows}), its branches
 * beside those held, and its waiting sends, live tail and facts. What only
 * this tab holds survives it: its own sends the hub has not taken, and the
 * failure lines it saw, each after the row it followed.
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
  noteChange("transcript read");
  seesCompaction(page);
  target.continuedTo = page.continuedTo ?? null;
  mergeRows(target, page.blocks, page.cursor, page.removed ?? []);
  target.queued = (page.queued ?? []).map((block) =>
    take(target, block, "queued")
  );
  // A new newest page is a new read: an older page still on its way was
  // asked for under the one before, and so was what was said of one.
  target.reads += 1;
  target.olderFault = null;
  const { tail } = page;
  target.subagents = {
    ...target.subagents,
    ...Object.fromEntries(
      page.branches.map((branch) => [
        branch.toolUseId,
        pageBranch(branch, tail?.streams[branch.toolUseId] ?? ""),
      ])
    ),
  };
  if (tail) {
    applyTail(target, { ...tail, streams: undefined });
  }
  // Whether a turn is under way, and its tool, are the daemon's now-state
  // (`applyPulse`), once the hub has sent one. The page is a read made out
  // of band, and its tail says `busy` and the tool as the frames show them,
  // which trail the pulse at a turn's start: written over it, a working
  // session read quiet until its next pulse (`wqw` on a reload). The tail
  // stands only where no pulse has come, neither the socket's nor the server
  // load's (`applyTail` keeps its `busy` off already; the tool is put back
  // here, and a session built from this page alone takes the pulse's `busy`).
  const pulse = pulseOf(target.instanceId);
  if (pulse) {
    applyPulse(target, pulse);
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
  noteChange("older page read");
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

/**
 * A session's pulse, the daemon's now-state: the store's, seeded by the
 * socket's first `instances` frame and moved by each `pulse` frame after.
 * Until that first frame, the hub's pulses as the layout's server load read
 * them for this page (`/api/pulses`), so the server's HTML and the hydrated
 * page draw a working session working from the first paint: without them a
 * tab the browser follows no stream of read quiet until the socket answered
 * (tab-strip's reload trace `--- wqq www`). Read during a render on the
 * server, as `page` (`servedPage`) is: the store's own state is the
 * client's alone.
 */
function pulseOf(instanceId: string): PulseReading | undefined {
  const held = heldPulse(instanceId);
  if (held || state.liveRead) {
    return held;
  }
  return (servedPage.data as { pulses?: Record<string, SessionPulse> })
    .pulses?.[instanceId];
}

/**
 * Each instance's coarse now-state, pushed by the daemon ~1/sec (broadcast).
 * The rail reads this for sessions it has not subscribed to — the ones whose
 * frame-fed {@link SessionState} is either absent or frozen at the last frame
 * before the tab closed. Each a {@link Pulse}, a signal per field, so a
 * pulse wakes what reads the fields it moved.
 */
const pulses = new Map<string, Pulse>();
/**
 * Moved when a session pulses for the first time: what every read of a
 * session with no pulse yet waits on. Most of the board never pulses (it
 * sleeps), and a list ordered by when each row last moved reads them all.
 */
let pulsesAdded = $state(0);

/** The store's pulse for a session, read so its reader wakes when one first comes. */
function heldPulse(instanceId: string): Pulse | undefined {
  const held = pulses.get(instanceId);
  return held || pulsesAdded < 0 ? held : undefined;
}

/**
 * Takes a session's pulse at least as new as the one held: into its
 * {@link Pulse}, each field only when it moved, or as its first.
 */
function takePulse(instanceId: string, pulse: SessionPulse): void {
  const held = pulses.get(instanceId);
  if (held) {
    held.take(pulse);
  } else {
    pulses.set(instanceId, new Pulse(pulse));
    pulsesAdded += 1;
  }
}

/** Fills in what the registry knows about a session this browser did not spawn. */
/**
 * The daemon's now-state, written onto the session it describes.
 *
 * The running tool is otherwise learnt from the turn's own frames — a tool
 * starting, its result, the turn ending — which is a complete account only
 * for a subscriber who was there for all of them. One that joined while a
 * tool was running has seen none, and would hold the session as idle until
 * the next delta. `busy` is the pulse's alone once one has come
 * (`applyTail`): the hub's tail reaches this tab on the session's stream,
 * the pulse on the broadcast, and their order across the two is no one's
 * to promise.
 */
function applyPulse(target: SessionState, pulse: PulseReading): void {
  target.busy = pulse.busy;
  if (!equal(target.currentTool, pulse.currentTool)) {
    target.currentTool = pulse.currentTool;
  }
}

function hydrate(target: SessionState): void {
  const pulse = pulseOf(target.instanceId);
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
  target.harness = known.harness;
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
function adoptSettings(target: SessionState, row: BoardRow): void {
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
  detach(loadDelegateEvents(instanceId), "loadDelegateEvents");
  detach(loadWorkItems(instanceId), "loadWorkItems");
  // Opening a view is the moment its frames become this browser's to render.
  // (The subscription effect in the route layout already names its tab; this makes
  // the direct route the only trigger the store needs to know about.)
  syncSubscriptions();
}

/** Views whose delegates' traffic has been read back — it is read once per connection. */
const delegatesRead = new Set<string>();

/**
 * A reconnect: the delegate events broadcast while the socket was away are
 * lost, so every parent read so far is read again. Folding a row it already
 * holds is a no-op (`foldDelegateEvent` skips a known id).
 */
function rereadDelegateEvents(): void {
  const read = [...delegatesRead];
  delegatesRead.clear();
  for (const instanceId of read) {
    detach(loadDelegateEvents(instanceId), "loadDelegateEvents");
  }
}

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

/**
 * A reconnect: the work-item frames broadcast while the socket was away are
 * lost, so every tray read so far is read again.
 */
function rereadTrays(): void {
  const read = [...trayRead];
  trayRead.clear();
  for (const instanceId of read) {
    detach(loadWorkItems(instanceId), "loadWorkItems");
  }
}

/** The work items a view's delegate tray opens with (`GET /api/work-items`). */
async function loadWorkItems(instanceId: string): Promise<void> {
  if (trayRead.has(instanceId)) {
    return;
  }
  trayRead.add(instanceId);
  const mark = readLeaves();
  const items = await load<WorkItemSummary[]>(
    `/api/work-items?parent=${instanceId}`
  );
  if (!items) {
    trayRead.delete(instanceId);
    return;
  }
  for (const item of items) {
    keepWorkItem(item, mark);
  }
}

/** A work item as a read that left at `mark` answered it, unless a frame for it came since. */
function keepWorkItem(item: WorkItemSummary, mark: number): void {
  if (!heardSince(`work_item:${item.id}`, mark)) {
    state.workItems[item.id] = item;
  }
}

/**
 * Takes a failed chip off its tray on every screen, with why: the reader's
 * reason, or the later item that replaced it. The hub records both.
 */
export function dismissWorkItem(
  id: string,
  why: { reason: string } | { replacedBy: string }
): Promise<void> {
  return workItemAct(id, "dismiss", why, "so the delegate was not dismissed");
}

/**
 * Retry: the reader's word to the failed delegate's own session, which
 * reopens the same item there; answered once the session has read it.
 */
export function retryWorkItem(id: string): Promise<void> {
  return workItemAct(id, "retry", undefined, "so the delegate was not retried");
}

async function workItemAct(
  id: string,
  act: "dismiss" | "retry",
  body: object | undefined,
  outcome: string
): Promise<void> {
  const mark = readLeaves();
  const response = await fetch(
    `/api/work-items/${encodeURIComponent(id)}/${act}`,
    {
      method: "POST",
      ...(body
        ? {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
          }
        : {}),
    }
  );
  if (!response.ok) {
    throw await hubRefusal(response, `${outcome}.`);
  }
  keepWorkItem((await response.json()) as WorkItemSummary, mark);
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
  const present = new Set(next.map((row) => row.id));
  holdRows(
    next,
    next,
    hubRows.filter((row) => !present.has(row.id)).map((row) => row.id)
  );
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
  // The rows as `next` holds them: an upsert equal to the row held keeps it.
  const upserted = new Set(upserts.map((row) => row.id));
  holdRows(
    next,
    next.filter((row) => upserted.has(row.id)),
    removed
  );
  for (const row of upserts) {
    const held = state.sessions[row.id];
    if (held) {
      hydrate(held);
    }
  }
}

/** Replaces both limits maps with the hub's word — a full snapshot, not a patch. */
function adoptUsageLimits(
  readings: Pick<UsageLimitsResponse, "claude" | "openCodeGo">
): void {
  const claude: Record<string, ClaudeLimits> = {};
  const openCodeGo: Record<string, OpenCodeGoLimits> = {};
  for (const one of readings.claude) {
    claude[one.accountId] = one.limits;
  }
  for (const machine of readings.openCodeGo) {
    openCodeGo[machine.machineId] = machine.plan;
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
  const mark = readLeaves();
  const spend = await load<UsageSpend>("/api/usage/spend");
  // A `usage` frame since the read left carries a spend at least as new.
  if (heardSince("usage", mark)) {
    return;
  }
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
  /** Why accounts with no catalog have none: their last probe's fault. */
  catalogFaults: AccountCatalogFault[];
  catalogs: AccountCatalog[];
  /** Sign-ins started on a machine and not finished: the link or code each showed. */
  pending: PendingAccountSignin[];
  /** Each account's freshest reading: its windows, plan and extra usage. */
  readings: AccountReading[];
  /** What adding an account (or one back from its bench) set moving, newest first. */
  rebalances: RebalanceNotice[];
  /** How each provider's new sessions choose among its accounts. */
  routing: ProviderRouting[];
  signins: AccountSignin[];
}

/** Reads of the accounts so far: only the newest one's answer is kept. */
let accountsReads = 0;

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

/** Who takes each new accounts read as it lands (see {@link takeAccounts}). */
let accountsTaker: ((view: AccountsView) => void) | null = null;

/**
 * Calls `taker` with each accounts read that changed what the hub said, as
 * it is kept: the sign-ins under way in this tab take up the link or code
 * the hub kept for them (accounts/flows.svelte.ts). One taker.
 */
export function takeAccounts(taker: (view: AccountsView) => void): void {
  accountsTaker = taker;
}

/**
 * Reads the hub's accounts of every provider, their sign-ins and catalogs,
 * and the providers the fleet's machines know; a failed read keeps what was
 * there.
 */
async function readAccounts(): Promise<void> {
  accountsFollower?.();
  accountsReads += 1;
  const ticket = accountsReads;
  const [view, providers] = await Promise.all([
    load<AccountsView>("/api/accounts"),
    load<ProviderChoice[]>("/api/accounts/providers"),
  ]);
  // Reads overlap (every `usage` frame and every write asks again): only the
  // newest one's answer is kept, so an older one landing last never stands.
  if (ticket !== accountsReads) {
    return;
  }
  if (view && !equal(state.accounts, view)) {
    state.accounts = view;
    accountsTaker?.(view);
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
  method: WriteMethod,
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
    throw await hubRefusal(response);
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
  /** Made by the setup: the step it stands at, until it is done. */
  setupStep?: AccountSetupStep;
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
    /** Where its setup stands; null once the setup is done. */
    setupStep?: AccountSetupStep | null;
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
    throw await hubRefusal(response);
  }
  return response.ok
    ? ((await response.json()) as PlacementPreview)
    : undefined;
}

/** Who hears the continuation table each time it moves (see {@link followContinuations}). */
let continuationFollower: ((table: ContinuationJob[]) => void) | null = null;

/**
 * Hands `follower` the continuation table every time the hub's word on it
 * lands — a publish, or the read on connect. One follower: the parked
 * starts' (spawn/parked.svelte.ts), which follow every continuation this tab
 * started.
 */
export function followContinuations(
  follower: (table: ContinuationJob[]) => void
): void {
  continuationFollower = follower;
}

/**
 * A move as the hub just answered a Cancel or a Retry: it stands in the table
 * at once, so no screen reads an older stage than that answer while the
 * `moves` frame carrying it is still on its way. The frame replaces it.
 */
export function heardMove(job: MoveJob): void {
  const at = state.moves.findIndex((one) => one.id === job.id);
  const held = state.moves[at];
  if (held && Date.parse(held.updatedAt) > Date.parse(job.updatedAt)) {
    return;
  }
  state.moves = at === -1 ? [...state.moves, job] : state.moves.with(at, job);
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
      adoptAskMachine(envelope);
      handleFrame(envelope.payload);
    }
  }
}

/**
 * An ask the hub parked for no session it keeps a row for (a project's
 * memory proposal, hub memory.ts): its answer names the envelope's machine,
 * since no row says one.
 */
function adoptAskMachine(envelope: Envelope<FramePayload>): void {
  const frame = envelope.payload;
  if (
    frame.kind !== "permission_request" ||
    !envelope.machineId ||
    instanceIndex.byId.has(frame.instanceId)
  ) {
    return;
  }
  const target = session(frame.instanceId);
  if (!target.machineId) {
    target.machineId = envelope.machineId;
  }
}

/**
 * Registry reads: on connect and again after every reconnect. True once the
 * projects, the one read the board waits on, landed.
 *
 * The machines, sessions, hand-offs and continuations are never read here:
 * the socket's board snapshot carries them, it is the first frame the hub
 * sends every socket, and this runs only once it is applied (`hubReached`).
 * A read of them would be taken after that snapshot and could land after a
 * delta the hub sent later, putting back rows the delta had moved on; the
 * hub sends a row again only when it next changes, so nothing would correct it.
 */
async function refresh(): Promise<boolean> {
  // Same reason as the limits below: the frames that carry spend come once a
  // minute per machine, and a dashboard opened between them has none yet.
  readSpend();
  readAccounts();
  // Off the board's wait: an offer is a quiet card, not part of the fleet.
  readProjectOffers();
  // Approved actions waiting on you: frames keep them from here.
  readWaitingActions();
  // Fleet watch's notices to you: frames keep them from here.
  readWatchNotices();
  // The fleet's upstream answer: Needs you asks it while nobody has.
  readFleetUpstream();
  // The person's presence: the rail's dot, and Needs you's row for this browser.
  readPerson().catch(() => undefined);
  // HTTPS on the tailnet name: Needs you shows its step while one stands.
  readTailnetHttps();
  // The stream relay's journey: Needs you's row and Settings › Browsers.
  readRelayJourney().catch(() => undefined);
  // What the socket says about asks from here on is newer than the read.
  const readFrom = askHeard;
  const asked = projectsLeave();
  const { mark } = asked;
  const [projects, pending, usage] = await Promise.all([
    load<ProjectRow[]>("/api/projects"),
    load<Envelope<FramePayload>[]>("/api/pending"),
    // Read on connect, not only broadcast on change: a dashboard opened
    // between reports has missed the frames.
    load<UsageLimitsResponse>("/api/usage/limits"),
  ]);

  if (projects) {
    keepProjects(projects, asked);
  }
  if (usage && !heardSince("usage", mark)) {
    adoptUsageLimits(usage);
  }
  if (pending) {
    adoptPending(pending, readFrom);
  }
  if (projects) {
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
  detach(
    refresh().then((read) => {
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
    }),
    "refresh"
  );
}

/** Every online machine's stored sessions — the sidebar's contents on arrival. */
function refreshCatalogs(): void {
  for (const machine of state.machines) {
    if (machine.status === "online") {
      detach(loadCatalog(machine.machineId), "loadCatalog");
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
  // A transcript whose read found its machine offline is read again once the
  // hub says it is online: across a hub restart this tab may never have seen
  // it go, so it is every online machine, not a change of one.
  for (const machine of next) {
    if (machine.status === "online") {
      readBehind(machine.machineId);
    }
  }
  // Before the first read the connect-time `refreshCatalogs` asks them all.
  if (!state.fleetRead) {
    return;
  }
  for (const machine of next) {
    if (machine.status === "online" && !wasOnline.has(machine.machineId)) {
      detach(loadCatalog(machine.machineId), "loadCatalog");
    }
  }
}

/**
 * `machineId` is online: every transcript the dashboard follows whose last
 * read found that machine offline is read now, unless a read is already out
 * or the backoff is already reading it again ({@link readAgainLater}).
 */
function readBehind(machineId: string): void {
  for (const id of subscriptionIds()) {
    const held = state.sessions[id];
    const fault = held?.readFault ?? held?.behind;
    if (
      held &&
      !held.loading &&
      failedReads.get(id)?.timer === undefined &&
      fault?.reason === "offline" &&
      fault.machineId === machineId
    ) {
      detach(readTranscript(id, "machineOnline"), "readTranscript");
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

/** Files one event under the delegate it is about, pushed or freshly read. */
function recordDelegateEvent(event: DelegateEvent): void {
  // Written, then read back: a `$state` write lands on the proxy and never on
  // the literal, so folding into the literal would file the row where the UI
  // cannot see it.
  state.delegateEvents[event.instanceId] ??= [];
  foldDelegateEvent(state.delegateEvents[event.instanceId], event);
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
      sayAskEnd(
        target,
        frame.requestId,
        withdrawnNote(frame.instanceId, question, frame.reason)
      );
    }
    // Answered somewhere else while this tab held the card (another tab, the
    // app, a session, the harness): it says what won and where.
    // With an answer of this tab's still out, the winner may be that answer
    // or another device's: the line waits for the hub's word on ours, said
    // if it was refused (`streamEffectsFor`, `permission.answer`).
    if (target && parked && frame.outcome === "answered" && frame.answer) {
      const note = answeredNote(
        frame.instanceId,
        questionsOf(parked.toolName, parked.input) !== null,
        frame.answer,
        speakerName(target.harness)
      );
      if (answeredHere(frame.requestId)) {
        answeredWhileOurs.set(frame.requestId, note);
      } else {
        sayAskEnd(target, frame.requestId, note);
      }
    }
    return;
  }
  if (frame.kind === "preview") {
    heardFrame(`preview:${frame.instanceId}`);
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
          heardFrame(`preview:${id}`);
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
    // Whole whenever it moved: a session folded into its continuation
    // leaves its tab on the session it is now (SessionSurface).
    if (frame.formerIds && !equal(state.formerIds, frame.formerIds)) {
      state.formerIds = frame.formerIds;
    }
    if (
      frame.previewSettings &&
      !equal(state.previewSettings, frame.previewSettings)
    ) {
      state.previewSettings = frame.previewSettings;
    }
    // The notices acknowledged on any tab or device: one dismissed elsewhere leaves this tab now.
    if (frame.noticesSeen) {
      notices.adopt(frame.noticesSeen);
    }
    // The hub's notices record damaged (notices off), or whole again once reset.
    if (frame.noticesDamaged !== undefined) {
      notices.adoptDamaged(frame.noticesDamaged);
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
    // A merge, not a replace: a per-instance `pulse` frame is not ordered
    // against a snapshot the hub took moments before the `instances` frame
    // carrying it left, so whichever pulse actually happened later, by its
    // own `at`, is the one kept.
    if (frame.kind === "instances") {
      for (const [id, pulse] of Object.entries(frame.pulses ?? {})) {
        const held = pulses.get(id);
        if (!held || pulse.at >= held.at) {
          takePulse(id, pulse);
        }
      }
      for (const [id, pulse] of pulses) {
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

  if (frame.kind === "usage") {
    // The small limits frame the hub pushes on each report (USAGE-SPEC.md §6.4).
    heardFrame("usage");
    adoptUsageLimits(frame);
    adoptSpend(frame.spend);
    // The hub says this when an account's reading, sign-in or catalog moved.
    readAccounts();
    return;
  }

  if (frame.kind === "work_item") {
    heardFrame(`work_item:${frame.item.id}`);
    if (!equal(state.workItems[frame.item.id], frame.item)) {
      state.workItems[frame.item.id] = frame.item;
    }
    return;
  }

  if (frame.kind === "project.cap") {
    heardFrame(`project.cap:${frame.projectId}`);
    const project = state.projects.find((row) => row.id === frame.projectId);
    if (project) {
      project.cap = frame.cap;
    }
    return;
  }

  if (frame.kind === "actions") {
    heardFrame("actions");
    state.actions = frame.actions;
    return;
  }

  if (frame.kind === "hub_auth") {
    takeAuthFrame(frame);
    return;
  }

  if (frame.kind === "installs") {
    takeInstallsFrame(frame);
    return;
  }

  if (frame.kind === "fleet_watch.notices") {
    heardFrame("fleet_watch.notices");
    state.watchNotices = frame.notices;
    return;
  }

  if (frame.kind === "artifact.needs") {
    state.artifactNeeds = frame.needs;
    state.artifactNotices = frame.notices;
    return;
  }

  if (frame.kind === "laws.broken") {
    state.lawsBroken = frame.broken;
    return;
  }

  if (frame.kind === "hub.restart") {
    state.restart = frame.restart
      ? {
          until: Date.now() + frame.restart.withinMs,
          version: frame.restart.version,
        }
      : null;
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

  // The person's presence, and the machines that count toward it.
  if (frame.kind === "person") {
    takePerson(frame.person);
    return;
  }

  // Something that needs the person, shown on the desk tab they use.
  if (frame.kind === "desk_alert") {
    showDeskAlert(frame, instanceIndex);
    return;
  }

  // The fleet's upstream answer, given anywhere: Needs you stops asking.
  if (frame.kind === "fleet.upstream") {
    heardFrame("fleet.upstream");
    state.fleetUpstream = frame.upstream;
    return;
  }

  // A browser changed (a take-over, its state, its page's origin): every view of one follows.
  if (frame.kind === "browser_list") {
    state.browsers = frame.browsers;
    return;
  }

  // The stream relay's journey moved: every place that draws it follows.
  if (frame.kind === "stream_relay.journey") {
    keepRelayJourney(frame.journey);
    return;
  }

  // HTTPS on the tailnet name changed: Needs you's step moves on, or ticks.
  if (frame.kind === "tailnet.https") {
    heardFrame("tailnet.https");
    const ticked =
      state.tailnetHttps?.state === "needs" &&
      frame.tailnet.state === "serving";
    state.tailnetHttps = frame.tailnet;
    state.tailnetTicked = ticked;
    if (ticked) {
      setTimeout(() => {
        state.tailnetTicked = false;
      }, TAILNET_TICK_MS);
    }
    return;
  }

  if (frame.kind === "fleet.fetch") {
    for (const listener of fleetFetchListeners) {
      listener.heard(frame);
    }
    return;
  }

  if (frame.kind === "tasks.changed") {
    state.tasksChanged[frame.projectId] =
      (state.tasksChanged[frame.projectId] ?? 0) + 1;
    if (frame.taskId) {
      const named = `${frame.projectId}/${frame.taskId}`;
      state.taskChanged[named] = (state.taskChanged[named] ?? 0) + 1;
    } else {
      state.tasksChangedUnnamed[frame.projectId] =
        (state.tasksChangedUnnamed[frame.projectId] ?? 0) + 1;
    }
    return;
  }

  if (frame.kind === "decisions.changed") {
    state.decisionsChanged[frame.projectId] =
      (state.decisionsChanged[frame.projectId] ?? 0) + 1;
    return;
  }

  if (frame.kind === "blocks.changed") {
    state.blocksChanged[frame.projectId] =
      (state.blocksChanged[frame.projectId] ?? 0) + 1;
    return;
  }

  if (frame.kind === "starters.changed") {
    state.starters[`${frame.place}:${frame.projectId}`] = frame.starters;
    return;
  }

  if (frame.kind === "project_offer") {
    heardFrame(`project_offer:${frame.instanceId}`);
    if (frame.offer) {
      state.projectOffers[frame.instanceId] = frame.offer;
    } else {
      delete state.projectOffers[frame.instanceId];
    }
    return;
  }

  if (frame.kind === "pulse") {
    const previous = pulses.get(frame.instanceId);
    if (previous && previous.at > frame.pulse.at) {
      return;
    }
    // The daemon's coarse now-state, broadcast — this is the whole of what the
    // rail knows about a session this browser has not subscribed to. Field
    // by field: a pulse inside a turn moves its row's time and tool, and
    // wakes no list that files the session by its activity.
    takePulse(frame.instanceId, frame.pulse);
    const held = state.sessions[frame.instanceId];
    if (held) {
      applyPulse(held, frame.pulse);
    }
    return;
  }

  if (frame.kind === "error") {
    const { instanceId, message, modeAsk } = frame;
    if (
      settle(frame.requestId, (waiter) =>
        waiter.reject(modeAsk ? new ModeUnchosen(modeAsk) : new Error(message))
      )
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
        ? waiter.resolve(frame.result, {
            unanswered: frame.unanswered ?? [],
            failed: frame.failed ?? [],
          })
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

  // Every project move, whole, on each change (and `heardMove` between). A
  // move's progress travels machine → hub only, never as its own frame.
  if (frame.kind === "moves") {
    state.moves = frame.moves;
    return;
  }
  if (frame.kind === "move_progress") {
    return;
  }
  // A command's slot wait travels machine → hub only; its item's status carries it.
  if (frame.kind === "command_queue") {
    return;
  }
  // A borrower's ask for a fresh sign-in travels machine → hub only.
  if (frame.kind === "account_borrow") {
    return;
  }
  // A stage's change travels machine → hub only; a sheet's pane reads it in the sheet's doc.
  if (frame.kind === "stage") {
    return;
  }
  // A machine's browsers travel machine → hub only; the hub's browser registry reads them.
  if (frame.kind === "browsers") {
    return;
  }
  // A take-over the daemon ended itself travels machine → hub only; the hub answers the ask.
  if (frame.kind === "browser_handback") {
    return;
  }
  // The stream relay's state travels machine → hub only; Settings › Browsers reads the hub's record.
  if (frame.kind === "stream_relay") {
    return;
  }
  // A place's stage clone travels machine → hub only; the hub files it as a workspace.
  if (frame.kind === "stage-clone") {
    return;
  }
  // A machine's fleet report and its items' converge travel machine → hub
  // only; screens read the hub's row.
  if (frame.kind === "fleet_report" || frame.kind === "fleet_converge") {
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
        originInstanceId: frame.originInstanceId,
        browserAsk: frame.browserAsk,
        connectAsk: frame.connectAsk,
      });
      break;
    }

    case "asleep":
    case "delegate_event":
    case "frame":
    case "held_send":
    case "recovery_unavailable":
    case "rejected":
    case "scratch_worktree":
    case "send":
    case "session_address":
    case "stopped":
    case "taken_send":
      // Every other FramePayload kind (instances, usage, delegate events,
      // fleet watch's notices, …) is handled above, before this switch is reached.
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
  follows: (sessionId) => watchedIds().includes(sessionId),
  // The newest page again, which resumes the stream from the `seq` it carries.
  rereadHistory: (sessionId, cause) => {
    detach(readTranscript(sessionId, cause), "readTranscript");
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
   * The rule is "nothing goes unsaid, and nothing is said TWICE", and never
   * in a toast (DESIGN.md, The Work Outlives Its Surface Rule). A kind whose
   * own surface renders the failure inline claims it; everything else, and
   * every claim whose surface has since vanished, is said over the session's
   * composer ({@link commandFault}), in the error formula, with Try again
   * where a try can go. That way a command kind added next year is loud by
   * default rather than silent by default, which is the failure mode this
   * whole port exists to close.
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
    // and is said over the session's composer.
    if (record.kind === "permission.answer" && answerCardStillParked(record)) {
      return;
    }
    // Kept for its session (refusals.svelte.ts): a model, effort or mode
    // change is said on the details card's own line for it while that card
    // stands, and over the composer otherwise; anything else over the
    // composer. A reload says it again in the same place.
    sayCommandFault(record);
  },
};

/** The kinds the session's details card asks for, and says the failure of. */
const SETTINGS_KINDS: ReadonlySet<CommandKind> = new Set([
  "set-model",
  "set-effort",
  "set-permission-mode",
]);

/** Sessions whose details card stands now, by how many: their settings' failures are its to say. */
const detailsOpen = new SvelteMap<string, number>();

/** Marks `sessionId`'s details card as standing, until the returned release. */
export function holdDetails(sessionId: string): () => void {
  // Called from the card's effect: the count is written, never tracked there.
  untrack(() => {
    detailsOpen.set(sessionId, (detailsOpen.get(sessionId) ?? 0) + 1);
  });
  return () =>
    untrack(() => {
      const left = (detailsOpen.get(sessionId) ?? 1) - 1;
      if (left > 0) {
        detailsOpen.set(sessionId, left);
      } else {
        detailsOpen.delete(sessionId);
      }
    });
}

/** A reason's closing stop, dropped so it sits inside the sentence. */
const REASON_STOP = /\.$/u;

/**
 * A failed command in the error formula (DESIGN.md, Voice): what did not happen, the
 * hub's why, what stands meanwhile; the way on (Try again, or the control
 * itself) stands beside it. The operator's terms, never the wire's.
 */
function failureNotice(record: CommandRecord): string {
  const why = (record.reason ?? "the hub didn't say why").replace(
    REASON_STOP,
    ""
  );
  switch (record.kind) {
    case "interrupt":
      return `The turn was not stopped: ${why}. It goes on.`;
    case "set-model":
      return `The model was not changed: ${why}. The session keeps the one it runs.`;
    case "set-effort":
      return `The effort was not changed: ${why}. The session keeps the one it runs.`;
    case "set-permission-mode":
      return `The permission mode was not changed: ${why}. The session keeps the one it runs.`;
    case "permission.answer":
      return `Your answer was not sent: ${why}. The ask has since closed, so nothing waits on it.`;
    case "send.withdraw":
      return `The message was not taken back: ${why}. It stays queued.`;
    case "send":
      return `Your message was not sent: ${why}.`;
    default:
      return `That didn't go through: ${why}. (${String(record.kind)})`;
  }
}

/** What a refused command asked, kept with its words, so Try again asks again after a reload. */
interface CommandAsked {
  /** The control's argument: the model, the effort, the mode. */
  arg?: unknown;
  /** When it was refused: the composer says the latest. */
  at: number;
  kind: CommandKind;
  machineId?: string;
}

/** Where a session's refused command of `kind` is kept. */
const commandKey = (sessionId: string, kind: CommandKind | "") =>
  `command:${sessionId}:${kind}`;

/**
 * The same command again, as it went: its kind, its machine and what it
 * asked. None for an answer, whose ask has gone, or for a command that
 * never got an envelope.
 */
function againOf(
  sessionId: string,
  asked: CommandAsked
): (() => void) | undefined {
  const { machineId, arg } = asked;
  if (!machineId) {
    return;
  }
  switch (asked.kind) {
    case "interrupt":
      return () => {
        submitCommand(sessionId, machineId, "interrupt", {});
      };
    case "set-model":
      return () => {
        submitCommand(sessionId, machineId, "set-model", {
          model: arg as string,
        });
      };
    case "set-effort":
      return () => {
        submitCommand(sessionId, machineId, "set-effort", {
          effort: arg as EffortLevel,
        });
      };
    case "set-permission-mode":
      return () => {
        submitCommand(sessionId, machineId, "set-permission-mode", {
          mode: arg as PermissionMode,
        });
      };
    // An answer's ask has gone; a send says itself on its row and composer.
    case "permission.answer":
    case "send.withdraw":
    case "send":
      return;
    default:
      unhandled("Try again command kind", asked.kind);
  }
}

/** A refused command's words and its Try again, where its session says it. */
export interface CommandFault {
  again?: () => void;
  kind: CommandKind;
  words: string;
}

const faultOf = (sessionId: string, said: CommandRefusal): CommandFault => {
  const asked = said.asked as CommandAsked;
  return {
    kind: asked.kind,
    words: said.reason,
    again: againOf(sessionId, asked),
  };
};

/**
 * What `instanceId`'s composer says of a refused command: the latest one
 * no details card is saying, over the field, with Try again, until the
 * next command of that session goes. Kept through a reload.
 */
export function commandFault(instanceId: string): CommandFault | null {
  const shown = detailsOpen.has(instanceId);
  const [latest] = refusals
    .under(commandKey(instanceId, ""))
    .filter(
      ([, said]) =>
        !(shown && SETTINGS_KINDS.has((said.asked as CommandAsked).kind))
    )
    .toSorted(
      ([, a], [, b]) =>
        (b.asked as CommandAsked).at - (a.asked as CommandAsked).at
    );
  return latest ? faultOf(instanceId, latest[1]) : null;
}

/** What a session's details card says of its refused `kind` change, under that control. */
export function settingFault(
  instanceId: string,
  kind: CommandKind
): CommandFault | null {
  const said = refusals.get(commandKey(instanceId, kind));
  return said ? faultOf(instanceId, said) : null;
}

/**
 * What each control command asked, by command id, from its submit: the
 * ledger lets a record's envelope go once it settles, before its failure
 * is noted, and Try again needs the machine and the argument.
 */
const controlAsks = new Map<string, { arg?: unknown; machineId: string }>();

/** Keeps what a control command asked, dropping what settled long ago. */
function rememberControlAsk(
  commandId: string,
  machineId: string,
  arg?: unknown
): void {
  for (const known of [...controlAsks.keys()]) {
    if (!streamState.commands[known]) {
      controlAsks.delete(known);
    }
  }
  controlAsks.set(commandId, { arg, machineId });
}

function sayCommandFault(record: CommandRecord): void {
  const asked = controlAsks.get(record.commandId);
  controlAsks.delete(record.commandId);
  refusals.set(commandKey(record.sessionId, record.kind), {
    reason: failureNotice(record),
    asked: {
      at: Date.now(),
      arg: asked?.arg,
      kind: record.kind,
      machineId:
        asked?.machineId ?? instanceIndex.byId.get(record.sessionId)?.machineId,
    } satisfies CommandAsked,
  });
}

/** A new command of the session answers what was said of its last ones. */
function clearCommandFaults(instanceId: string): void {
  for (const [key] of refusals.under(commandKey(instanceId, ""))) {
    refusals.delete(key);
  }
}

/**
 * A send whose command the hub never took — the socket was down, went down,
 * or no answer came: this tab's row for it did not go, with why, and offers
 * Try again and Edit. A send the hub has a record of is not this tab's to
 * say anything about (its row is the record's), and neither is a retry of a
 * failed send, which draws no row of its own until the hub takes it.
 */
function markUnreached(record: CommandRecord): void {
  const target = state.sessions[record.sessionId];
  const row = target?.local.find((message) => message.id === record.commandId);
  if (!(target && row)) {
    return;
  }
  row.state = "unreached";
  row.metadata = {
    ...row.metadata,
    sendFailed: record.reason ?? "The hub never took it.",
  };
  target.rev += 1;
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
  for (const [asked, known] of [...answers]) {
    if (!streamState.commands[known]) {
      answers.delete(asked);
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
 *   record that failed — so this returns true and the composer stays quiet. That
 *   is the double report this rule exists to prevent, and it only works
 *   because the surface is now registered BEFORE the submit that can fail
 *   inside it; registered afterwards there was nothing here to find.
 * - STREAM. The answer's effect clears `pending` only once the hub has taken
 *   it, so a refused answer leaves the ask parked: the session's card and the
 *   Needs row (`answerFor`) both read the refusal off the record, and this
 *   returns true. It returns false only when the ask has gone some other way
 *   meanwhile, and then the composer's line is the report.
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
export type { CommandRecord } from "./stream";

/** One command's record, by the id {@link submitCommand} returned. */
export function commandRecord(commandId: string): CommandRecord | null {
  return streamState.commands[commandId] ?? null;
}

/**
 * The last answer sent to each parked ask, by the ask's request id: any
 * surface showing the ask (its session's card, its Needs row) reads that
 * answer's stage, whichever of them sent it. Kept as long as the ledger
 * keeps the record.
 */
const answers = new SvelteMap<string, string>();

/** The record of the last answer sent to the ask `requestId`, if the ledger still keeps it. */
export function answerFor(requestId: string): CommandRecord | null {
  const commandId = answers.get(requestId);
  return commandId ? commandRecord(commandId) : null;
}

/**
 * The "Already answered" line of an ask that settled while an answer of this
 * tab's to it was still out, by request id: said if the hub refuses ours (it
 * lost to another device), dropped once ours is the one applied.
 */
const answeredWhileOurs = new Map<string, Message>();

/** The line an ask leaves in its session, kept by request id. */
function sayAskEnd(
  target: SessionState,
  requestId: string,
  note: Message
): void {
  state.askEnds[requestId] = note;
  addNote(target, note);
}

/** Whether this tab answered the ask `requestId` itself, with an answer the hub has not refused. */
function answeredHere(requestId: string): boolean {
  const record = answerFor(requestId);
  return record !== null && record.stage !== "failed";
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
   * Takes back a queued or failed send. `replace`: the words that go in its
   * place once it is withdrawn (a queued message's edit), under
   * `replacementId`, known before it goes so the words can fly into its row;
   * none, the message is removed (Remove from queue, a failed send's Remove).
   */
  "send.withdraw": {
    sendId: string;
    replace?: {
      extras: SendExtras;
      replacement: string;
      replacementId: string;
    };
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
        ...extras,
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
  // A new command answers what was said of the last ones.
  clearCommandFaults(instanceId);
  if (SETTINGS_KINDS.has(kind) || kind === "interrupt") {
    const { model, effort, mode } = intent as Partial<
      CommandIntents["set-model"] &
        CommandIntents["set-effort"] &
        CommandIntents["set-permission-mode"]
    >;
    rememberControlAsk(commandId, machineId, model ?? effort ?? mode);
  }

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
    const { text, extras, replaces } = intent as CommandIntents["send"];
    rememberSend(commandId, instanceId, machineId, text, extras ?? {});
    // Kept past a reload too, until it settles (send-store.ts).
    keepSend({
      at: Date.now(),
      commandId,
      extras: extras ?? {},
      instanceId,
      machineId,
      text,
      ...(replaces ? { replaces } : {}),
    }).catch((error: unknown) =>
      console.warn(`[cawco] send ${commandId} not kept for a reload`, error)
    );
  }
  if (kind === "permission.answer") {
    const { requestId } = intent as CommandIntents["permission.answer"];
    rememberAnswerSurface(commandId, instanceId, requestId);
    answers.set(requestId, commandId);
  }

  let payload: object;
  let effects: StreamEffects | undefined;
  try {
    // `provenance` rides inside the payload rather than as a new envelope field —
    // CommandEnvelope.payload is already `unknown` on the wire, so this needs no
    // protocol change, and the hub's `command()` spreads it straight through to
    // `relaySend` untouched. No `viewId` here — it would just repeat the
    // envelope's own `instanceId`. `clientId` is this page's; `presenceId` is
    // the tab's presence (presence.ts), whose log says what it had in front,
    // so a send is read against what its own tab showed.
    const provenance = {
      clientId: currentClientId(),
      presenceId: presenceClientId(),
    };
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
function canResend(commandId: string): boolean {
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
 * A failed send as a send carries it — its words, texts, files and pictures,
 * from its record — for sending it again or starting a session with it.
 */
export async function failedSendPayload(
  message: Message
): Promise<{ text: string; extras: SendExtras }> {
  const images = await Promise.all(
    (message.metadata?.images ?? []).flatMap(({ src, mediaType }) =>
      src ? [imageBytes(src, mediaType)] : []
    )
  );
  return {
    text: message.content,
    extras: { attachments: resentAttachments(message), images },
  };
}

/**
 * Sends again, as a new send that replaces it, a send the hub failed — from
 * any screen, after any reload: the words and pictures are the row's own,
 * from its record. The hub retires the failed one (`replaced`) as it takes
 * this one, and every screen folds the old row away as the new one arrives.
 */
export async function retryFailed(message: Message): Promise<void> {
  const { text, extras } = await failedSendPayload(message);
  retries[message.id as string] = submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send",
    { text, extras, replaces: message.id }
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
  forgetSend(commandId).catch(() => undefined);
  dropSendEcho(entry.instanceId, commandId);
  restoreComposer(entry.instanceId, entry.text, entry.extras);
}

/**
 * The sends an earlier load of this page kept and the hub never took
 * (send-store.ts), sent again under their own ids, oldest first, as this
 * page starts: each draws its row again and waits, as any send does, for
 * the socket (`resumePendingSends`). The hub takes a repeat of an id as
 * the same send. One the hub refused is drawn refused again, in its words,
 * with Try again and Edit, and goes only when the person sends it; past
 * the time those stand (the ledger's own), it is let go.
 */
async function resumeKeptSends(): Promise<void> {
  for (const kept of await keptSends()) {
    if (streamState.commands[kept.commandId]) {
      continue;
    }
    if (kept.refused) {
      if (Date.now() - kept.refused.at >= SETTLED_COMMAND_TTL_MS) {
        forgetSend(kept.commandId).catch(() => undefined);
        continue;
      }
      rememberSend(
        kept.commandId,
        kept.instanceId,
        kept.machineId,
        kept.text,
        kept.extras
      );
      noteSendSubmitted(
        kept.instanceId,
        kept.text,
        kept.extras,
        kept.commandId,
        kept.replaces
      );
      failLocally(
        streamState,
        streamHost,
        {
          commandId: kept.commandId,
          sessionId: kept.instanceId,
          kind: "send",
          settlesAt: SETTLES_AT.send,
        },
        kept.refused.reason
      );
      continue;
    }
    submitCommand(
      kept.instanceId,
      kept.machineId,
      "send",
      {
        text: kept.text,
        extras: kept.extras,
        ...(kept.replaces ? { replaces: kept.replaces } : {}),
      },
      kept.commandId
    );
  }
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
      replace: {
        extras: {
          attachments: resentAttachments(message),
          images,
        },
        replacement,
        replacementId,
      },
    }
  );
  return { withdraw, replacement: replacementId };
}

/**
 * Takes a queued send out of the queue, or a failed send out of the
 * conversation, with nothing in its place. Returns the withdraw's command id,
 * whose record says how it went: `applied` with the outcome `withdrawn` (its
 * row folds away on every screen), or the session read it first.
 */
export function removeSend(message: Message): string {
  return submitCommand(
    message.instanceId,
    session(message.instanceId).machineId,
    "send.withdraw",
    { sendId: message.id }
  );
}

/**
 * Lets go of a send that never reached the hub, from this tab's outbox and
 * its row: nothing of it was ever said. Never throws.
 */
export function discardUnreached(commandId: string): void {
  const entry = sendOutbox.get(commandId);
  if (entry) {
    sendOutbox.delete(commandId);
    outboxVersion += 1;
    dropSendEcho(entry.instanceId, commandId);
  }
  forgetSend(commandId).catch(() => undefined);
}

/**
 * A failed send's words, texts, files and pictures back in its session's
 * composer to be written again, and the failed send taken out of the
 * conversation: the composer holds it now. Its pictures are read from the
 * hub first; one that can't be read throws, and nothing moves.
 */
export async function editFailed(message: Message): Promise<string> {
  const { text, extras } = await failedSendPayload(message);
  restoreComposer(message.instanceId, text, extras);
  return removeSend(message);
}

/** The yes-or-no capabilities a harness reports (`HarnessCapabilities`). */
type HarnessCapability = {
  [K in keyof HarnessCapabilities]: HarnessCapabilities[K] extends boolean
    ? K
    : never;
}[keyof HarnessCapabilities];

/**
 * Whether a session's harness does what `capability` names, as its machine
 * reported it. A harness that reported no is never asked the control that
 * capability backs, and neither is one whose report has not come: its answer
 * would be read as one it never gave (a harness reporting
 * `supportedCommands: false` answered the ask with nothing, and the menu's
 * `.map` threw on it).
 */
const harnessCan = (
  where: { harness: HarnessKind | null; machineId: string },
  capability: HarnessCapability
): boolean =>
  cawco.machines
    .find((entry) => entry.machineId === where.machineId)
    ?.harnesses?.find((entry) => entry.harness === where.harness)?.capabilities[
    capability
  ] === true;

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
  const delivered =
    message.type === "user" &&
    machineConnected(target.machineId) &&
    !!target.sessionId &&
    harnessCan(target, "rewind") &&
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
      fork: delivered && harnessCan(target, "fork"),
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
      const { sendId, replace } = intent as CommandIntents["send.withdraw"];
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
            if (replace) {
              submitCommand(
                instanceId,
                target.machineId,
                "send",
                {
                  text: replace.replacement,
                  extras: replace.extras,
                  replaces: sendId,
                },
                replace.replacementId
              );
            }
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
        // Taken: no reload sends it again. Refused: kept with the hub's
        // words, so a reload draws it refused, Try again and Edit standing.
        settled: (stage, reason) => {
          (stage === "failed"
            ? refuseSend(commandId, reason ?? "The hub refused it.")
            : forgetSend(commandId)
          ).catch(() => undefined);
        },
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
      // The ask stands, its pressed answer pending, until the hub has taken
      // the answer; refused, it stands still, the refusal under its buttons
      // (the session's card, the Needs row), and can be answered again.
      return {
        settled: (stage) => {
          const elsewhere = answeredWhileOurs.get(requestId);
          answeredWhileOurs.delete(requestId);
          if (stage === "failed") {
            // The hub refused ours after the ask settled: another device's
            // answer won, and the line says what won and where. A socket
            // that dropped with ours out leaves it unknown whose won, so
            // nothing is said of it.
            if (elsewhere && commandRecord(commandId)?.refusedByHub) {
              sayAskEnd(target, requestId, elsewhere);
            }
            return;
          }
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
            detach(persistSettings(instanceId, { model }), "persistSettings");
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
            detach(
              persistSettings(instanceId, { permissionMode: mode }),
              "persistSettings"
            );
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

/**
 * Every session something on this page shows: the tabs, the peek, the
 * delegate cards, and a project's conversation in its panel. Its streams' places ({@link forgetUnwatched}) are kept
 * for all of them, a tab waiting on its name included, so a page read
 * before the tab was asked keeps its `seq`.
 */
function watchedIds(): string[] {
  const ids = new Set(workspace.openIds);
  if (peekedId) {
    ids.add(peekedId);
  }
  for (const id of watchedDelegates.keys()) {
    ids.add(id);
  }
  return [...ids];
}

/**
 * The full set of instance ids this dashboard wants `frame` frames for: the
 * watched ones the hub has named; a tab not named yet is followed once it
 * has (workspace `named`).
 */
function subscriptionIds(): string[] {
  return watchedIds().filter((id) => workspace.named(id));
}

/** The last watched set synced, so an unchanged set of tabs stays quiet. */
let lastSubscriptionKey = "";

/**
 * The watched set, applied: every session the dashboard no longer watches
 * has its stream forgotten, and every watched one whose transcript this tab
 * holds and does not follow on this socket is read, the read's page
 * subscribing it ({@link followHeld}). A session a tab, the peek or a
 * delegate card holds nothing of yet is read by what shows it
 * ({@link readTranscript}). A no-op when the set is unchanged since the last
 * sync.
 */
export function syncSubscriptions(): void {
  const ids = subscriptionIds().sort();
  const key = ids.join("\u0000");
  if (key === lastSubscriptionKey) {
    return;
  }
  lastSubscriptionKey = key;
  untrack(() => {
    forgetUnwatched(streamState, streamHost, watchedIds());
    followHeld(ids, "follow");
  });
}

/**
 * A watched transcript this tab holds (its rows, or a read of it that went
 * out, landed or failed) and does not follow on the socket open now, read
 * again: its page subscribes it from the page's own `seq` ({@link adoptPage}).
 * Held rows stand for everything the session said up to the moment its stream
 * was let go (its tab closed or re-addressed, its read landing while it was
 * not watched, the socket gone), and a reader shown them again with no read
 * behind them sees that moment for good. A read that landed holds the
 * transcript though it held no rows: a session just started is empty, and a
 * page's first visit names its tabs again (workspace `restore`), unwatching
 * the pane's tab while its read is out; landing then, the read follows
 * nothing, and with nothing read again the pane shows that empty moment for
 * good, the agent's every word after it never drawn.
 *
 * A stream whose place counts in this socket's hub run resumes from it
 * instead ({@link resumeHeld}): a page that landed before the socket's
 * board (or before its tab was named), or the last event a dropped socket
 * applied, when the socket that replaces it reaches the same hub run. The hub
 * replays what came after out of its ring, or resets, and the reset reads the
 * page again. Only a place in another run (the hub restarted) is read again.
 *
 * `reconnect`: the socket is new, and a read in flight was asked of the
 * connection before: it is ended and read again. A page's first connection
 * had none before it: a read in flight is joined, and one whose read failed
 * is left to the read again that failure scheduled.
 */
function followHeld(ids: string[], cause: "follow" | "reconnect"): void {
  if (state.status !== "connected") {
    return;
  }
  const fresh = cause === "reconnect" && connections > 1;
  const first = connections === 1;
  for (const id of ids) {
    if (
      socketRun !== null &&
      resumeHeld(streamState, streamHost, id, socketRun)
    ) {
      continue;
    }
    const held = state.sessions[id];
    // A read that failed before the first board already waits on what can
    // answer it (`readFailed`: the backoff, the machine's deadline, or the
    // board listing its machine online), and a 404 is the hub's answer.
    if (first && !pageReads.has(id) && (held?.readFault || held?.behind)) {
      continue;
    }
    const holds = Boolean(
      streamState.cursors[id] ||
      held?.blocks.length ||
      held?.reads ||
      held?.loading ||
      held?.readFault ||
      held?.behind
    );
    if (holds && (cause === "reconnect" || !following(streamState, id))) {
      detach(readTranscript(id, cause, fresh), "readTranscript");
    }
  }
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
 *
 * An update the hub announced (`state.restart`) is a hub known to be on its
 * way back: until its deadline every try is `WS_RECONNECT_BASE_DELAY` apart,
 * so the page hears it back within a second, not up to a whole capped delay
 * after.
 */
function scheduleReconnect(): void {
  const attempt = globalThis.__cawcoReconnectAttempts;
  const updating = state.restart !== null && state.restart.until > Date.now();
  const delay = updating
    ? WS_RECONNECT_BASE_DELAY
    : Math.min(
        WS_RECONNECT_BASE_DELAY *
          2 ** Math.min(attempt, WS_RECONNECT_MAX_ATTEMPTS),
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
 * Whether the socket on `globalThis` is one this module instance opened
 * (`connect`); one another instance opened is replaced (`ensureConnected`).
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
  // A page an agent opened in its project's browser names the gate that
  // owns it (core `GATED_PAGE_MARK`), so what it starts is that agent's check.
  const query = new URLSearchParams({ protocol: String(WIRE_PROTOCOL) });
  const gatedBy: unknown = Reflect.get(globalThis, GATED_PAGE_MARK);
  if (typeof gatedBy === "string" && gatedBy) {
    query.set(GATED_PAGE_PARAM, gatedBy);
  }
  const socket = new WebSocket(announcingParts(`${hubSocketUrl()}?${query}`));

  // The hub is reached once its board on this socket is read (`bind`).
  bind(socket);
  // This module made it, so `ensureConnected` keeps it, and `hubReached`
  // above is what refreshes.
  claimed = true;
  globalThis.__cawcoSocket = socket;
}

/**
 * A new connection: every transcript the dashboard follows resumes its
 * stream from the place it holds when that place counts in the board's hub
 * run ({@link followHeld}), and is read again otherwise, merged into the rows
 * held ({@link mergeRows}), with this tab's own sends kept in `local` until
 * the hub places them, the read's page subscribing it on this socket
 * ({@link adoptPage}). Never resumed across hub runs: the hub numbers a
 * session's stream in memory, from 1 again after a restart, so a place from
 * another run sits inside another process's numbering, and a resume from it
 * would replay that process's events onto rows they do not follow. An open
 * tab never read yet waits for its pane's own read.
 */
function rereadFollowed(): void {
  connections += 1;
  const ids = subscriptionIds().sort();
  lastSubscriptionKey = ids.join("\u0000");
  forgetUnwatched(streamState, streamHost, watchedIds());
  followHeld(ids, "reconnect");
}

/** How many times this page has reached the hub: past one, a connection is a reconnect. */
let connections = 0;
/**
 * The hub run the open socket's board named (`InstancesFrame.hubRun`): the
 * numbering its streams count in. A page's `seq` resumes a stream on it only
 * when the page names the same run. Null before the first board.
 */
let socketRun: string | null = null;

/** The hub answered on the socket `connect` opened: everything a connection is owed. */
function hubReached(): void {
  state.status = "connected";
  state.retryAt = null;
  // A set heard before the socket went may have been replaced while it was
  // away: the stages each page reads again on a connection carry the newer.
  state.starters = {};
  state.failed = false;
  state.outageAt = null;
  state.restart = null;
  globalThis.__cawcoReconnectAttempts = 0;
  readFleet();
  detach(readInstalls(), "readInstalls");
  rereadFollowed();
  if (connections > 1) {
    rereadTrays();
    rereadDelegateEvents();
  }
  resumePendingSends(streamState, streamHost);
  detach(checkServedBuild(), "checkServedBuild");
  detach(updates.loadPolicy(), "loadPolicy");
}

/**
 * Whether this page was built for an older wire than the hub's, settled on
 * the board snapshot before anything in it is applied. The snapshot is the
 * first message on every socket, reconnects included, and the hub sends it
 * again in place of each delta to a page it knows is older; `kind` and
 * `protocol` are the two fields of it no wire version moves (`WIRE_PROTOCOL`).
 *
 * An older page reads nothing more off the socket, the snapshot included,
 * and takes the new build as any page does: through the update toast
 * (updates/update-toast.svelte.ts), Update now or the idle reload once the
 * person has seen it, never under them. It asks again which build the
 * dashboard runs on each snapshot until it serves another, as the hub may
 * restart into the new wire before the dashboard serves its build. The check used to sit at the end of the board handler, after
 * the frame was applied: the first change-only delta left `state.machines`
 * undefined, and every later board frame threw on it before the check ran,
 * so those tabs never reloaded.
 */
function olderThanHub(message: unknown): boolean {
  const { payload } = message as { payload?: FramePayload };
  if (payload?.kind !== "instances") {
    return state.older;
  }
  state.older = payload.protocol > WIRE_PROTOCOL;
  if (state.older && newerBuild() === null) {
    detach(checkServedBuild(), "checkServedBuild");
  }
  return state.older;
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
  socket.onmessage = (event) => {
    lastHeard = Date.now();
    line.receive(String(event.data));
  };
  startHeartbeat(socket);
  line.listen(holdMessage);
  socket.onclose = socketClosed;

  socket.onerror = () => {
    // Always followed by `onclose`, which schedules the retry — this only
    // records that the last attempt failed, never that trying has stopped.
    state.status = "error";
    state.failed = true;
  };
}

/**
 * The hub's messages read off the socket and not yet taken, in order: all
 * of them are taken in one task, so a burst costs the store one update. A
 * message that lands while a press is being drawn (a tab switch), or within
 * a frame of the last take, is taken once the page has drawn its next
 * frame, and so waits for that frame instead of holding it (7433e2b3,
 * mechanisms 2 and 6). One that lands at rest is taken in a task of its
 * own at once: asked for from a frame, every message drew a frame of its
 * own whether it changed anything or not (the scale fleet at rest: 109 of
 * the page's 388 frames in 20s ran a callback and drew nothing).
 */
const heldMessages: unknown[] = [];
let takeAsked = false;
/** When the take waiting was asked for, and when its task was posted (the page's clock). */
const taking = { askedAt: 0, postedAt: 0 };
/** When the last take ran (the page's clock). */
let tookAt = Number.NEGATIVE_INFINITY;
/** A frame at 60Hz, ms: a take at rest comes no sooner than this after the last. */
const TAKE_SPACING_MS = 1000 / 60;
/** When the person last pressed or typed: a pointer down, a key. */
let pressedAt = Number.NEGATIVE_INFINITY;
/**
 * The longest a press holds a waiting take back past its ask, ms, and how
 * long after a press takes wait for a frame: the press's frame is drawn
 * first, and a person typing on never holds the hub's word back longer
 * than this. Our own call.
 */
const PRESS_HOLD_MS = 250;
/** Posts the take as a task of its own, behind the frame that asked for it. */
const takeChannel = browser ? new MessageChannel() : null;

/** The take, posted from the next frame: it runs once that frame is drawn. */
function takeAfterFrame(): void {
  requestAnimationFrame(() => {
    taking.postedAt = performance.now();
    takeChannel?.port2.postMessage(0);
  });
}

if (takeChannel) {
  takeChannel.port1.onmessage = () => {
    // A press that came in after the take was posted runs before it, and
    // its frame is drawn before the take: it waits for the next frame.
    if (
      pressedAt > taking.postedAt &&
      !document.hidden &&
      performance.now() - taking.askedAt < PRESS_HOLD_MS
    ) {
      takeAfterFrame();
      return;
    }
    takeHeld();
  };
  const pressed = () => {
    pressedAt = performance.now();
  };
  for (const type of ["pointerdown", "keydown"] as const) {
    addEventListener(type, pressed, { capture: true, passive: true });
  }
  // A page put away draws no frames: what waits is taken at once, and so is
  // everything after, until it is shown again.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      takeHeld();
    }
  });
}

function holdMessage(message: unknown): void {
  heldMessages.push(message);
  if (takeAsked) {
    return;
  }
  takeAsked = true;
  const now = performance.now();
  taking.askedAt = now;
  if (
    document.hidden ||
    (now - pressedAt >= PRESS_HOLD_MS && now - tookAt >= TAKE_SPACING_MS)
  ) {
    taking.postedAt = now;
    takeChannel?.port2.postMessage(0);
    return;
  }
  takeAfterFrame();
}

/**
 * Takes every message held, in the order the socket read them, and the
 * store's update with them, in this task. What it cost is marked
 * ({@link HUB_TAKE_MEASURE}, its detail the messages taken), which a probe
 * reads against the messages it saw arrive (live-perf).
 */
function takeHeld(): void {
  takeAsked = false;
  if (heldMessages.length === 0) {
    return;
  }
  const began = performance.now();
  tookAt = began;
  const batch = heldMessages.splice(0);
  for (const message of batch) {
    takeMessage(message);
  }
  flushSync();
  performance.measure(HUB_TAKE_MEASURE, {
    start: began,
    detail: batch.length,
  });
}

/** One message off the hub's socket, taken into the store. */
function takeMessage(message: unknown): void {
  // The hub is reached once its board on this socket is read: the board is
  // the first frame the hub owes every socket (`olderThanHub`), and a proxy
  // in front of it (the dashboard's own server, a preview's relay) accepts
  // the upgrade before it knows whether the hub is there, so an open socket
  // proves nothing (counted on open, every such socket reset the backoff and
  // reread the fleet each second the hub was down). Not the socket's first
  // message either: until the board is applied the store holds the last
  // hub's machines and rows, and "connected" over them let a page asking
  // after a hub restart ask a machine that wasn't back yet. The board is
  // applied in this same turn, before anything reads the status. Its run is
  // the numbering this socket's streams count in, read before the
  // connection's follows are.
  const board = (message as { payload?: FramePayload }).payload;
  if (state.status !== "connected" && board?.kind === "instances") {
    socketRun = board.hubRun;
    hubReached();
  }
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
  adoptAskMachine(envelope);
  // The hub's own refusal names the request it answers on the envelope
  // alone: read from the payload only, it settled nothing, and whoever
  // asked waited out the timeout while the reason went to the console.
  handleFrame(
    payload.kind === "error" && !payload.requestId
      ? { ...payload, requestId: envelope.requestId }
      : payload
  );
  sweepOnTraffic();
}

/** The socket is gone, closed by either side or dropped as dead: everything that went with it. */
function socketClosed(): void {
  // What the socket said before it closed is taken before its close is.
  takeHeld();
  stopHeartbeat();
  state.status = "disconnected";
  // A socket that closed is an attempt that is over, one way or the other.
  state.failed = true;
  cancelFleetRead();
  // An announced update is the hub on its way back until its deadline.
  state.outageAt ??=
    state.restart && state.restart.until > Date.now()
      ? state.restart.until
      : Date.now() + OUTAGE_GRACE;
  abandonInflight("The connection to the hub dropped before that finished.");
  for (const listener of fleetFetchListeners) {
    listener.dropped();
  }
  // Subscriptions, resumes and unanswered commands all died with the socket,
  // and the next one reads every followed transcript again (`rereadFollowed`).
  // With the host, for the same reason the traffic sweep passes it: a socket
  // that dies mid-command must SAY so, not merely record it.
  noteDisconnect(streamState, Date.now(), streamHost);
  // A hub that now requires paired devices closes the socket of a browser it
  // does not know, and refuses its next: the app then shows the pairing
  // screen (hub-auth.svelte.ts).
  readAuth().then(() => {
    if (!(globalThis.__cawcoDisposing || mustPair())) {
      scheduleReconnect();
    }
  });
}

/** When anything last arrived on the socket: the heartbeat's proof of life. */
let lastHeard = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let heartbeatDeadline: ReturnType<typeof setTimeout> | undefined;

function stopHeartbeat(): void {
  clearInterval(heartbeatTimer);
  clearTimeout(heartbeatDeadline);
  heartbeatTimer = undefined;
  heartbeatDeadline = undefined;
}

/**
 * A socket can be dead while it reads open: a frozen hub, a route that
 * dropped without a FIN. Nothing arrives, the status stays `connected`, and
 * the transcript on screen silently stops. So every
 * {@link HEARTBEAT_INTERVAL_MS} the dashboard asks the hub (`heartbeat`,
 * answered at once), and when nothing at all has arrived
 * {@link HEARTBEAT_DEADLINE_MS} after asking, the socket is dropped as dead:
 * the reconnect and its reads follow as for any close. Any message is proof
 * of life, so a large board still arriving in parts is never mistaken for
 * silence. Application messages, not WebSocket pings: no browser sends those
 * (`StreamHeartbeat`). Both the ask and the hub's answer leave in their
 * outbox's urgent lane (core wire.ts `laneOf`), so neither waits behind the
 * board, transcripts or deltas queued on this socket.
 */
function startHeartbeat(socket: WebSocket): void {
  stopHeartbeat();
  lastHeard = Date.now();
  heartbeatTimer = setInterval(() => {
    if (
      socket !== globalThis.__cawcoSocket ||
      socket.readyState !== WebSocket.OPEN
    ) {
      return;
    }
    const asked = Date.now();
    clientLine(socket).send({ type: "heartbeat" } satisfies StreamHeartbeat);
    clearTimeout(heartbeatDeadline);
    heartbeatDeadline = setTimeout(() => {
      if (lastHeard >= asked || socket !== globalThis.__cawcoSocket) {
        return;
      }
      console.warn(
        `[cawco] hub socket: nothing heard ${Date.now() - asked} ms after a heartbeat; reconnecting`
      );
      dropDeadSocket(socket);
    }, HEARTBEAT_DEADLINE_MS);
  }, HEARTBEAT_INTERVAL_MS);
}

/**
 * Closes a socket the heartbeat found dead, and goes on at once as for any
 * close. Its own `close` event is not waited for: the closing handshake needs
 * an answer from the peer that went silent, and a browser waits for it far
 * longer than the reader should.
 */
function dropDeadSocket(socket: WebSocket): void {
  socket.onclose = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.close(4000, "heartbeat unanswered");
  socketClosed();
}

/** The sends an earlier load kept were sent again: once per load of the page. */
let keptSendsResumed = false;

/** What routes call on mount: the socket is app-scoped, not page-scoped. */
export function ensureConnected(): void {
  globalThis.__cawcoHubAsked = true;
  if (!keptSendsResumed) {
    keptSendsResumed = true;
    resumeKeptSends().catch((error: unknown) =>
      console.warn("[cawco] kept sends could not be read", error)
    );
  }
  const socket = globalThis.__cawcoSocket;
  if (
    claimed &&
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }
  // A socket another instance of this module opened is replaced, not
  // adopted: its board snapshot went to that instance's state, and this one's
  // board comes only from a snapshot on a socket of its own (`refresh`).
  // A navigation is a fresh user intent — earlier exhausted retries don't apply.
  globalThis.__cawcoReconnectAttempts = 0;
  connect();
}

/**
 * The three moments worth more than the backoff schedule: the machine says its
 * network is back, the tab comes to the foreground after a sleep, and the
 * window regains focus. Each means the outage may be over right now, and the
 * timer was set when none of that was known. Registered once per document,
 * and only for a document that asked for the hub (`ensureConnected`): one
 * that only imports this module (a component canvas on a stage, which talks
 * to no hub) never dials one when it takes the focus.
 */
if (typeof window !== "undefined" && !globalThis.__cawcoWakeBound) {
  globalThis.__cawcoWakeBound = true;
  const wake = () => {
    if (!globalThis.__cawcoHubAsked || document.visibilityState === "hidden") {
      return;
    }
    reconnectNow();
  };
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", wake);
}

/**
 * Resolves once the hub is reached (its board on the socket read,
 * `hubReached`), connecting it if needed: what {@link machineConnected} reads
 * is this hub's word from then on. A hub not reached in time throws saying
 * so: the machine was never asked.
 */
async function waitForHub(timeoutMs = 5000): Promise<void> {
  ensureConnected();
  const reached = () => state.status === "connected";
  if (reached()) {
    return;
  }
  const opened = await readWithin(
    timeoutMs,
    (signal) =>
      new Promise<void>((resolve) => {
        const poll = () => {
          if (reached()) {
            resolve();
          } else if (!signal.aborted) {
            setTimeout(poll, 100);
          }
        };
        poll();
      })
  );
  switch (opened.kind) {
    case "answered":
      return;
    case "unanswered":
      throw new Error(
        `Could not reach the hub within ${Math.round(opened.after / 1000)} s. Check that it is running, then try again.`
      );
    default:
      unhandled("read", opened);
  }
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
 * Settles once `ready` reads true, read again whenever what it reads changes
 * (an effect, never a timer), or `unanswered` past `ms`.
 */
function whenTrue(ready: () => boolean, ms: number): Promise<Bounded<void>> {
  return readWithin(
    ms,
    (signal) =>
      new Promise<void>((resolve) => {
        const stop = $effect.root(() => {
          $effect(() => {
            if (ready()) {
              resolve();
              // Not from inside the effect it ends.
              queueMicrotask(() => stop());
            }
          });
        });
        signal.addEventListener("abort", () => stop(), { once: true });
      })
  );
}

/**
 * What `machineId` reports of `harness`, its permission modes among it. Which
 * modes a machine takes is its report's, so a start waits for the report (the
 * first fleet read, a machine whose report is on its way) up to {@link
 * CONTROL_TIMEOUT_MS}; one still missing then is the machine's own word.
 */
async function reportOf(
  machineId: string,
  harness: HarnessKind
): Promise<MachineHarnessReport | undefined> {
  await whenTrue(
    () =>
      state.fleetRead &&
      state.machines.find((row) => row.machineId === machineId)?.harnesses !==
        undefined,
    CONTROL_TIMEOUT_MS
  );
  return state.machines
    .find((row) => row.machineId === machineId)
    ?.harnesses?.find((entry) => entry.harness === harness);
}

/**
 * A spawn as it leaves this dashboard: a model only when one was picked (none
 * runs on the harness's own default, never an empty string), and a permission
 * mode only when its harness has modes. What the path says stands: the New
 * Session form's choice, or the session's own on a revive, relaunch, rewind
 * or fork. A path that names none sends none, and the hub settles it
 * (`settleMode`): a session it has a row for runs on its own mode, else the
 * one last chosen for its harness on its machine, and anything else is
 * refused with why. Every new session's mode is chosen in the form (a start
 * with no form of its own opens it, a fork with none to carry too).
 */
async function explicit(
  machineId: string,
  payload: NamedSpawn
): Promise<NamedSpawn> {
  const report = await reportOf(machineId, payload.harness);
  const { permissionMode, model, ...rest } = payload;
  // A harness with no permission modes (pi) is sent none, whatever the
  // path carried (a stored row's).
  const mode =
    report?.capabilities.permissionModes.length === 0
      ? undefined
      : permissionMode;
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
 * A spawn the hub did not answer in time is `unanswered`: whether it started
 * is not known, and nothing of it is kept here either.
 * Every session this dashboard starts, resumes or forks goes through here.
 */
async function start({
  machineId,
  instanceId = newId(),
  ...spawn
}: Omit<NamedSpawn, "instanceId"> & {
  machineId: string;
  /** The id it is asked under; one is minted when none is named. */
  instanceId?: string;
}): Promise<Bounded<SessionState>> {
  const requestId = newId();
  const payload = await explicit(machineId, { instanceId, ...spawn });
  let taken: Bounded<void>;
  try {
    taken = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () => {
      opening.set(instanceId, requestId);
      send({ verb: "spawn", machineId, instanceId, requestId, payload });
    });
  } finally {
    opening.delete(instanceId);
  }
  switch (taken.kind) {
    case "unanswered":
      return taken;
    case "answered":
      break;
    default:
      unhandled("read", taken);
  }
  const created = session(instanceId);
  created.machineId = machineId;
  created.cwd = payload.cwd;
  created.harness = payload.harness;
  created.permissionMode = payload.permissionMode ?? null;
  // What was sent, so the header shows it during the wait for the first
  // init — which then corrects it to whatever the harness resolved it to.
  created.model = payload.model ?? null;
  created.scratch = Boolean(payload.scratch);
  return { kind: "answered", value: created };
}

/**
 * Starts a session on `machineId` and returns the id its route lives at, once
 * the hub has taken the spawn ({@link start}). A spawn the hub refuses throws
 * the hub's reason, and its first prompt is never sent.
 */
export async function spawnSession({
  instanceId,
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
  /**
   * The id the session is asked for under, minted by the caller before it
   * asks, so a page reloaded while the hub answers finds it on the board
   * (spawn/parked); one is minted here when none is named.
   */
  instanceId?: string;
  machineId: string;
  cwd: string;
  prompt?: string;
  /** What rides the first message besides its words: its attachments and images, as a send carries them. */
  extras?: SendExtras;
  harness: HarnessKind;
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  scratch?: SpawnPayload["scratch"];
  bootstrap?: SpawnPayload["bootstrap"];
  projectId?: string;
  /** The account picked for this session; absent: the hub places it. */
  account?: string;
}): Promise<Bounded<string>> {
  const started = await start({
    ...(instanceId ? { instanceId } : {}),
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
  switch (started.kind) {
    case "unanswered":
      // Whether it started is not known: no first prompt goes to a session nobody confirmed.
      return started;
    case "answered":
      break;
    default:
      unhandled("read", started);
  }
  sendFirstPrompt(started.value.instanceId, machineId, prompt, extras);
  detach(refresh(), "refresh");
  return { kind: "answered", value: started.value.instanceId };
}

/**
 * A new session's first message, when it has words or files: sent once the
 * hub has taken the start, or once a page reloaded while it answered finds
 * the session on the board (spawn/parked).
 */
export function sendFirstPrompt(
  instanceId: string,
  machineId: string,
  prompt: string | undefined,
  extras: SendExtras
): void {
  const first = prompt?.trim() ?? "";
  if (first || extras.images?.length || extras.attachments?.length) {
    // Followed before its first message goes, on the socket that carries it:
    // that send's record is among the first frames the session's stream
    // carries, and a tab that joined after it would never hear it.
    subscribeSession(streamState, streamHost, instanceId);
    submitCommand(instanceId, machineId, "send", { text: first, extras });
  }
}

/** Where a fork branches from: the conversation, its machine, folder and harness, and the answer it branches at. */
export interface ForkSource {
  at?: string;
  cwd: string;
  harness: HarnessKind;
  machineId: string;
  sessionId: string;
}

/**
 * Branches a spin-off off a session (NEW.md §1): the same context carried into
 * a new SDK session, kept apart from mainline work until it is kept or
 * discarded. The hub reads the conversation it branches into the new view's
 * transcript. A fork the hub refuses throws the hub's reason ({@link start}).
 *
 * It runs on what its source runs on: the hub's row for the conversation
 * says what that is. A mode, model or effort given (the New Session form's
 * picks) stands over the source's. With no mode to run in (the source's row
 * records none) on a harness that has modes, nothing is sent and the answer
 * is `unchosen`: the New Session form opens on the fork, and Start waits for
 * a mode (spawn/new-session `startFork`).
 */
export async function forkSession({
  machineId,
  cwd,
  sessionId,
  harness,
  at,
  permissionMode,
  model,
  effort,
  prompt,
  extras = {},
}: ForkSource & {
  permissionMode?: PermissionMode;
  model?: string;
  effort?: EffortLevel;
  prompt?: string;
  extras?: SendExtras;
}): Promise<Bounded<string> | { kind: "unchosen" }> {
  const source = instanceForSession(instanceIndex, sessionId, {
    machineId,
    cwd,
  });
  // A branch is a new session nobody picked a mode for, so a Full Send
  // source branches on Bypass (`unpickedMode`): Full Send is only ever a
  // confirmed choice, the form's.
  const mode =
    permissionMode ??
    (source?.permissionMode
      ? unpickedMode(source.permissionMode as PermissionMode)
      : undefined);
  if (!mode) {
    const report = await reportOf(machineId, harness);
    if (report?.capabilities.permissionModes.length !== 0) {
      return { kind: "unchosen" };
    }
  }
  const named = model || source?.model;
  const level = effort ?? source?.chosenEffort;
  const started = await start({
    machineId,
    cwd,
    harness,
    resume: {
      sessionKey: sessionId,
      fork: true,
      ...(at ? { atMessage: at } : {}),
    },
    scratch: {},
    ...(named ? { model: named } : {}),
    ...(mode ? { permissionMode: mode } : {}),
    ...(level ? { effort: level } : {}),
  });
  switch (started.kind) {
    case "unanswered":
      return started;
    case "answered":
      sendFirstPrompt(started.value.instanceId, machineId, prompt, extras);
      detach(refresh(), "refresh");
      return { kind: "answered", value: started.value.instanceId };
    default:
      unhandled("read", started);
  }
}

/** What a turn carries besides its typed text — pastes turned into chips, images. */
export type SendExtras = Pick<SendPayload, "attachments" | "images">;

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
    target.local.push(localUserMessage(instanceId, commandId, text, extras));
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

/** The harness a session's conversation is one of: its row's, else its view's; a throw while neither has said. */
function harnessOfSession(instanceId: string): HarnessKind {
  const harness =
    instanceIndex.byId.get(instanceId)?.harness ??
    state.sessions[instanceId]?.harness;
  if (!harness) {
    throw new Error(
      "This session has not said what runs it yet. Try again in a moment."
    );
  }
  return harness;
}

/**
 * Stops a running session. Nothing about it changes here until its machine
 * answers: then it is stopped (its turn, tool and parked asks settle), and a
 * refusal is thrown in the machine's words for the row that asked to say. A
 * stop nobody answered in time is `unanswered`: the session is left as it is.
 */
export async function stopSession(
  instanceId: string,
  machineId: string
): Promise<Bounded<void>> {
  const requestId = newId();
  const payload: StopRequest = { instanceId, requestId };
  try {
    const stopped = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
    switch (stopped.kind) {
      case "answered":
        settleStopped(instanceId);
        return stopped;
      case "unanswered":
        return stopped;
      default:
        unhandled("read", stopped);
    }
  } finally {
    detach(refresh(), "refresh");
  }
}

/**
 * Throws a spin-off away: the session stops and the agent tears down whatever
 * the spawn created for it. Resolves once the agent confirms the teardown, so a
 * worktree that could not be removed is reported rather than silently left.
 */
export async function discardSession(
  instanceId: string,
  machineId: string
): Promise<Bounded<void>> {
  const requestId = newId();
  const payload: StopRequest = { instanceId, discard: true, requestId };
  try {
    const discarded = await ask<void>(requestId, DISCARD_TIMEOUT_MS, () =>
      send({ verb: "stop", machineId, instanceId, requestId, payload })
    );
    switch (discarded.kind) {
      case "answered":
        // Gone on the machine's word, not before: a refused discard, or one
        // nobody answered, leaves the session as it was.
        settleStopped(instanceId);
        delete state.sessions[instanceId];
        return discarded;
      case "unanswered":
        return discarded;
      default:
        unhandled("read", discarded);
    }
  } finally {
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
    throw await hubRefusal(response, "so the session stayed on its account.");
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
    throw await hubRefusal(response, "so it was not renamed.");
  }
}

/**
 * The person's own edit of a project: its name, its Review before done,
 * where its work lands, or its upstream choice, null for the fleet's
 * (`PATCH /api/projects/:id`). The answer lands in the
 * projects at once; the hub's `projects.changed` brings it to every other
 * dashboard and the app. Throws the refusal, in the hub's words.
 */
export async function editProject(
  projectId: string,
  change: {
    lands?: LandsMode;
    /** Where its large files live, and the connection that signs in there; null: each origin's own LFS. */
    lfs?: { connection: string; url: string } | null;
    name?: string;
    review?: boolean;
    upstreamPosts?: UpstreamPosts | null;
  }
): Promise<ProjectRow> {
  const asked = projectsLeave();
  const response = await fetch(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  if (!response.ok) {
    throw await hubRefusal(response, "so it was not changed.");
  }
  const row = (await response.json()) as ProjectRow;
  keepProject(row, asked);
  return row;
}

/** A project as the hub just answered it to the request `asked`, in the projects at once. */
function keepProject(row: ProjectRow, asked: ProjectsAsked): void {
  keepProjects(
    state.projects.map((each) => (each.id === row.id ? row : each)),
    asked
  );
}

/**
 * Another checkout of the project's repository, named by hand: a machine
 * and an absolute folder on it (`POST /api/projects/:id/places`). Throws
 * the refusal in the hub's words; the project as it stands lands at once.
 */
export async function addProjectPlace(
  projectId: string,
  machineId: string,
  path: string
): Promise<ProjectRow> {
  const asked = projectsLeave();
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/places`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId, path }),
    }
  );
  if (!response.ok) {
    throw await hubRefusal(response, "so it was not added.");
  }
  const row = (await response.json()) as ProjectRow;
  keepProject(row, asked);
  return row;
}

/**
 * A place the project no longer counts (`DELETE /api/projects/:id/places/:placeId`).
 * Its folder stays on disk. The hub refuses the primary checkout and the
 * project's folder on the hub (409), in its words, thrown here.
 */
export async function removeProjectPlace(
  projectId: string,
  placeId: string
): Promise<void> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/places/${encodeURIComponent(placeId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw await hubRefusal(response, "so it was not removed.");
  }
  await readProjects();
}

/**
 * Promotes a spin-off to mainline work: the UI stops setting it apart, and
 * the tag that kept its transcript out of the machine's catalog comes off, so
 * the session joins the history it was being hidden from. `unanswered` when
 * the hub kept it and its machine did not answer for the tag in time.
 */
export async function keepSession(instanceId: string): Promise<Bounded<void>> {
  const target = session(instanceId);
  const response = await fetch(`/api/instances/${instanceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "mainline" }),
  });
  if (!response.ok) {
    throw await hubRefusal(response, "so it was not kept.");
  }

  target.scratch = false;
  if (target.sessionId && target.machineId) {
    // `null` is how the harness clears a tag; the catalog is re-read for the
    // entry that has just stopped being hidden.
    const untagged = await machineControl<void>(
      target.machineId,
      "tagSession",
      [target.sessionId, null, { dir: target.cwd || undefined }],
      CONTROL_TIMEOUT_MS,
      harnessOfSession(instanceId)
    );
    await loadCatalog(target.machineId);
    return untagged;
  }
  return { kind: "answered", value: undefined };
}

/** The view state a session leaves behind once it is no longer running. */
function settleStopped(instanceId: string): void {
  const target = session(instanceId);
  target.busy = false;
  target.currentTool = null;
  clearTurnPhase(target);
  // Its parked asks leave on the hub's word (`permission_settled`): the hub
  // settles a stopped process's asks, and keeps a relaunch's own.
  trackWorking(target);
}

/**
 * Asks the session's preview to be brought into view: a phone's sheet comes
 * back to its middle snap from wherever the reader left it.
 */
export function revealPreview(instanceId: string): void {
  state.previewRequests[instanceId] =
    (state.previewRequests[instanceId] ?? 0) + 1;
}

/**
 * Closes the session's preview. The hub's `closed` frame goes out before its
 * answer whenever it had one shown; the answer closes it here only when no
 * preview frame came since, so a preview shown again meanwhile stays.
 */
export async function closePreview(instanceId: string): Promise<void> {
  const mark = readLeaves();
  await deletePreview(instanceId);
  const previous = state.previews[instanceId];
  if (previous && !heardSince(`preview:${instanceId}`, mark)) {
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
): Promise<Bounded<T>> {
  await waitForHub();
  const requestId = newId();
  const payload: ControlPayload = {
    requestId,
    method,
    args,
    ...(harness && { harness }),
  };
  return askMachine<T>(machineId, requestId, replyTimeoutMs, () =>
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
): Promise<Bounded<T>> {
  await waitForHub();
  const requestId = newId();
  const payload: FsPayload = {
    requestId,
    op,
    path,
    content,
    ...(root ? { root } : {}),
  };
  return askMachine<T>(machineId, requestId, CONTROL_TIMEOUT_MS, () =>
    send({ verb: "fs", machineId, requestId, payload })
  );
}

/**
 * New project (`POST /api/projects`), made with Caw: its one place is its
 * folder on the hub until setup picks its checkout. `template` is written as
 * its stages.md; `prompt` starts its conversation (as the message
 * `promptId`), which sets it up: `conversation` is that session. The hub's
 * refusal is its own words.
 */
export async function createProject(project: {
  name: string;
  template?: string;
  prompt: string;
  promptId: string;
}): Promise<ProjectRow & { place: ProjectPlace; conversation?: string }> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...project, caw: true }),
  });
  if (!response.ok) {
    throw await hubRefusal(response, "so the project was not made. Try again.");
  }
  const created = (await response.json()) as ProjectRow & {
    place: ProjectPlace;
    conversation?: string;
  };
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
    throw await hubRefusal(
      response,
      "so the project was not saved. Try again."
    );
  }
  const created = (await response.json()) as ProjectRow & {
    place: ProjectPlace;
    placeAdded: boolean;
  };
  await refresh();
  return created;
}

/**
 * The standing "make this a project" offers, as the hub holds them now: each
 * session's as the read answered it, or as a `project_offer` frame since left it.
 */
async function readProjectOffers(): Promise<void> {
  const mark = readLeaves();
  const offers = await load<ProjectOfferSummary[]>("/api/project-offers");
  if (!offers) {
    return;
  }
  const framed = (instanceId: string) =>
    heardSince(`project_offer:${instanceId}`, mark);
  state.projectOffers = Object.fromEntries([
    ...offers
      .filter((offer) => !framed(offer.instanceId))
      .map((offer) => [offer.instanceId, offer] as const),
    ...Object.entries(state.projectOffers).filter(([instanceId]) =>
      framed(instanceId)
    ),
  ]);
}

/** How long HTTPS's onboarding row stands ticked once its step is taken. Our choice: long enough to read and press its Open. */
const TAILNET_TICK_MS = 12_000;

/** HTTPS on the hub machine's tailnet name, as the hub has it now. */
async function readTailnetHttps(): Promise<void> {
  const mark = readLeaves();
  const read = await load<TailnetHttps>("/api/tailnet-https");
  if (read && !heardSince("tailnet.https", mark)) {
    state.tailnetHttps = read;
  }
}

/** The journey as the hub has it now (none older than the one held), and whether it ticked while this page stood (asking, then done). */
function keepRelayJourney(journey: RelayJourneyView): void {
  const before = state.relayJourney;
  if (before && journey.revision < before.revision) {
    return;
  }
  state.relayJourney = journey;
  if (before?.asks && !journey.asks && journey.done) {
    state.relayTicked = true;
  }
}

/** The stream relay's journey as the hub has it now, with this page's domain; a failed read throws its words. */
export async function readRelayJourney(): Promise<void> {
  const read = await askHub<RelayAnswer>("/api/stream-relay");
  state.relayDomain = read.domain;
  keepRelayJourney(read.journey);
}

/** One act on the stream relay's journey: the hub's answer kept, its refusal thrown in its words. */
export async function actOnRelay(act: RelayAct): Promise<void> {
  const answered = await askHub<RelayAnswer>(
    "/api/stream-relay/act",
    json("POST", act)
  );
  state.relayDomain = answered.domain;
  keepRelayJourney(answered.journey);
}

/** What this screen's proof found, told to the hub, and its answer kept. */
export async function reportRelayProof(
  report: RelayProofReport
): Promise<void> {
  const answered = await askHub<RelayAnswer>(
    "/api/stream-relay/proof",
    json("POST", report)
  );
  keepRelayJourney(answered.journey);
}

/** A 60 s credential for this screen's proof of the relay. */
export function relayTry(): Promise<RelayTry> {
  return askHub<RelayTry>("/api/stream-relay/try");
}

/** The fleet's upstream answer, as the hub holds it now. */
async function readFleetUpstream(): Promise<void> {
  const mark = readLeaves();
  const read = await load<{ upstream: UpstreamPosts | null }>(
    "/api/fleet/choices"
  );
  if (read && !heardSince("fleet.upstream", mark)) {
    state.fleetUpstream = read.upstream;
  }
}

/**
 * Answers the fleet's upstream choice (`PUT /api/fleet/choices`): whether
 * agents may post to other people's repositories wherever a project sets
 * nothing. Every machine's workspaces judge by it from their next beat.
 * Throws the refusal, in the hub's words.
 */
export async function answerFleetUpstream(posts: UpstreamPosts): Promise<void> {
  const mark = readLeaves();
  const answered = await askHub<{ upstream: UpstreamPosts | null }>(
    "/api/fleet/choices",
    json("PUT", { upstream: posts })
  );
  if (!heardSince("fleet.upstream", mark)) {
    state.fleetUpstream = answered.upstream;
  }
}

/** Fleet watch's needs-you notices, as the hub holds them now. */
async function readWatchNotices(): Promise<void> {
  const mark = readLeaves();
  const read = await load<{ notices: FleetWatchNotice[] }>(
    "/api/fleet-watch/notices"
  );
  if (read && !heardSince("fleet_watch.notices", mark)) {
    state.watchNotices = read.notices;
  }
}

/** The approved actions waiting on you, as the hub holds them now. */
async function readWaitingActions(): Promise<void> {
  const mark = readLeaves();
  const read = await load<{ actions: ApprovedActionView[] }>(
    "/api/actions/waiting"
  );
  if (read && !heardSince("actions", mark)) {
    state.actions = read.actions;
  }
}

/**
 * Your decision on an approved action: approve the exact call shown (named
 * by its arguments' hash, so the hub refuses any other), deny it, or put a
 * failed or unknown one away once you have read it. Nothing is optimistic: the
 * card leaves when the hub's `actions` frame says so. A refusal is thrown in
 * the hub's own sentence.
 */
export async function decideAction(
  action: Pick<ApprovedActionView, "argsHash" | "id">,
  decision: "approve" | "deny" | "checked"
): Promise<void> {
  const response = await fetch(
    `/api/actions/${encodeURIComponent(action.id)}/${decision}`,
    {
      method: "POST",
      ...(decision === "approve"
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ argsHash: action.argsHash }),
          }
        : {}),
    }
  );
  if (!response.ok) {
    throw await hubRefusal(response);
  }
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
  const mark = readLeaves();
  const response = await fetch(
    `/api/project-offers/${encodeURIComponent(instanceId)}/${answer}`,
    { method: "POST" }
  );
  if (!response.ok) {
    throw await hubRefusal(response, "so nothing changed. Try again.");
  }
  const offerGone = () => {
    if (!heardSince(`project_offer:${instanceId}`, mark)) {
      delete state.projectOffers[instanceId];
    }
  };
  if (answer === "dismiss") {
    offerGone();
    return null;
  }
  const accepted = (await response.json()) as ProjectOfferAccepted;
  if (!accepted.conversation) {
    // In the same change as the offer leaving: its card turns, never blinks.
    state.projectJoins[instanceId] = accepted;
  }
  offerGone();
  await refresh();
  return accepted;
}

/** Puts away the card that said what an offer joined. */
export function dismissProjectJoin(instanceId: string): void {
  delete state.projectJoins[instanceId];
}

// --- a project's conversation and views -------------------------------------

const projectPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}`;

/** A project's conversation: on or off, its harness, its session, why it cannot start, its spend. */
export const cawOf = (projectId: string): Promise<ProjectConversationView> =>
  askHub(`${projectPath(projectId)}/caw`);

/** Turns a project's Caw on or off, or moves it to another harness or model (null: the harness's default). */
export const configureCaw = async (
  projectId: string,
  change: {
    harness?: HarnessKind;
    /** Turning him off with what he started still running: the ids that stop; the rest finish. */
    initiated?: CawInitiated;
    model?: string | null;
    on?: boolean;
  }
): Promise<ProjectConversationView> => {
  const view = await askHub<ProjectConversationView>(
    `${projectPath(projectId)}/caw`,
    json("PATCH", change)
  );
  // The hub's answer is where he stands: the project's row says so now,
  // before the `projects.changed` it sent brings the row read again.
  const row = state.projects.find((project) => project.id === projectId);
  if (row) {
    row.eventsOn = view.on;
    row.cawHarness = view.harness;
    row.cawModel = view.model;
    row.conversationInstanceId = view.instanceId;
  }
  return view;
};

/**
 * What a routine's notice reads of it (hub routines.ts `RoutineView`): kept
 * or not, on or off.
 */
export interface RoutineState {
  enabled: boolean;
  id: string;
  keep: boolean;
  /** Null for a fleet routine. */
  projectId: string | null;
}

const routinePath = (routineId: string): string =>
  `/api/routines/${encodeURIComponent(routineId)}`;

/** A routine as it stands now. */
export const readRoutine = (routineId: string): Promise<RoutineState> =>
  askHub(routinePath(routineId));

const designOfferPath = (projectId: string): string =>
  `${projectPath(projectId)}/design-offer`;

/** Where a project's design-system offer stands (hub design-offers.ts). */
export const readDesignOffer = (projectId: string): Promise<DesignOfferState> =>
  askHub(designOfferPath(projectId));

/** Answers it: Build files the task, Not now records it; the offer as it stands after. */
export const answerDesignOffer = (
  projectId: string,
  answer: "build" | "dismiss"
): Promise<DesignOfferState> =>
  askHub(`${designOfferPath(projectId)}/${answer}`, json("POST", {}));

const lfsOfferPath = (id: string): string =>
  `/api/lfs-offers/${encodeURIComponent(id)}`;

/** Where an offer of Git LFS for a place's left-out large files stands (hub lfs-offers.ts). */
export const readLfsOffer = (id: string): Promise<LfsOfferState> =>
  askHub(lfsOfferPath(id));

/** Answers it: Track commits the files through LFS, Not now records it; the offer as it stands after. */
export const answerLfsOffer = (
  id: string,
  answer: "track" | "dismiss"
): Promise<LfsOfferState> =>
  askHub(`${lfsOfferPath(id)}/${answer}`, json("POST", {}));

/** The fleet's connections, never their keys (`GET /api/connections`). */
export const readConnections = async (): Promise<ConnectionView[]> =>
  (await askHub<{ connections: ConnectionView[] }>("/api/connections"))
    .connections;

/** Keeps a routine past its 7 days, or turns it off: the routine as it stands after. */
export const changeRoutine = (
  routineId: string,
  change: { enabled?: boolean; keep?: boolean }
): Promise<RoutineState> =>
  askHub(routinePath(routineId), json("PATCH", change));

/** "Ask Caw for a view": your words to the project's conversation, which drafts it; the session they went to. */
export const requestView = (
  projectId: string,
  text: string
): Promise<{ instanceId: string }> =>
  askHub(`${projectPath(projectId)}/view-requests`, json("POST", { text }));

/** What a project has spent: today, this month, its conversations' share, each attempt. */
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
    throw await hubRefusal(
      response,
      "so the project was not forgotten. Try again."
    );
  }
}

/** Reads the projects again, as the hub has them now. */
export async function readProjects(): Promise<void> {
  const asked = projectsLeave();
  const projects = await load<ProjectRow[]>("/api/projects");
  if (projects) {
    keepProjects(projects, asked);
  }
}

/** A request whose answer writes the projects: when it left, among frames and among those requests. */
interface ProjectsAsked {
  mark: number;
  ticket: number;
}
/** Requests that write the projects, as they left, and the newest whose answer was kept. */
let projectsAsked = 0;
let projectsKept = 0;
const projectsLeave = (): ProjectsAsked => {
  projectsAsked += 1;
  return { mark: readLeaves(), ticket: projectsAsked };
};

/**
 * The projects as a request `asked` answered them. An answer to a request
 * that left before the one last kept is dropped: every change of a project
 * says `projects.changed`, so a read follows any change it missed. Each
 * project's cap is the `project.cap` frame's when one came for it since the
 * request left: the hub tells a cap only when it moves, so an older one put
 * back would stand.
 */
function keepProjects(projects: ProjectRow[], asked: ProjectsAsked): void {
  if (asked.ticket < projectsKept) {
    return;
  }
  projectsKept = asked.ticket;
  const held = new Map(state.projects.map((row) => [row.id, row]));
  const answered = projects.map((row) => {
    const kept = held.get(row.id);
    return kept && heardSince(`project.cap:${row.id}`, asked.mark)
      ? { ...row, cap: kept.cap }
      : row;
  });
  state.projects = reconcileRows(state.projects, answered, (row) => row.id);
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
  /** The nearest running session it is a delegate of; null for a top session. */
  parentId: string | null;
  title: string | null;
}

/** A project's running sessions as the hub lists them: what a forget stops first. */
export async function projectRunning(id: string): Promise<RunningSession[]> {
  const response = await fetch(`/api/projects/${id}/running`);
  if (!response.ok) {
    throw await hubRefusal(
      response,
      "so its sessions were not listed. Try again."
    );
  }
  return ((await response.json()) as { sessions: RunningSession[] }).sessions;
}

/** Who hears `fleet.fetch` frames, and is told when the socket that carries them drops. */
interface FleetFetchListener {
  dropped: () => void;
  heard: (frame: FleetFetchFrame) => void;
}

const fleetFetchListeners = new Set<FleetFetchListener>();

/**
 * Hears each `fleet.fetch` frame: a skill or plugin fetch at the hub began
 * or landed, with its row whole. `dropped` runs when the socket closes, as a
 * fetch that lands meanwhile is never heard. Returns the unsubscribe.
 */
export function onFleetFetch(listener: FleetFetchListener): () => void {
  fleetFetchListeners.add(listener);
  return () => fleetFetchListeners.delete(listener);
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
    throw await hubRefusal(
      response,
      "so its sessions were not stopped. Try again."
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
    throw await hubRefusal(
      response,
      "so the machine was not removed. Try again."
    );
  }
  await refresh();
}

/**
 * Pauses a machine until `until` (hub machine-pause.ts): its turns stop and
 * nothing starts there until then; or, with `until` null, ends its pause
 * now. The hub's refusal is thrown in its words.
 */
export async function pauseMachine(
  machineId: string,
  until: Date | null
): Promise<void> {
  const id = encodeURIComponent(machineId);
  const response = await fetch(
    `/api/machines/${id}/${until ? "pause" : "resume"}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(until ? { until: until.toISOString() } : {}),
    }
  );
  if (!response.ok) {
    throw await hubRefusal(
      response,
      "so the machine's pause did not change. Try again."
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
): Promise<Bounded<void>> {
  const deleted = await machineControl<void>(
    machineId,
    "deleteSession",
    [sessionId, { dir }],
    undefined,
    harness
  );
  await loadCatalog(machineId);
  return deleted;
}

/**
 * Removes a session that never started: no transcript, no process. The hub
 * refuses any other kind and says why; that answer is thrown as it is, for
 * the confirm dialog to show under its question.
 */
/** What a held workspace's clone holds that is nowhere else, as its machine read it once its boundary was closed (hub work-items.ts `HeldWork`). */
export interface WorkspaceHeld extends WorkspaceHolding {
  /** In words: "2 commits on no remote, 3 changed files, 1 stash". */
  holds: string;
  machine: string;
  path: string;
  /** The clone's size on disk, in words. */
  size: string;
}

/** Reads what a held workspace holds that is nowhere else (`GET /api/workspaces/:id/held`); the hub's refusal (one not held) is the error. */
export async function workspaceHeld(
  workspaceId: string
): Promise<WorkspaceHeld> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/held`
  );
  if (!response.ok) {
    throw await hubRefusal(response, "so what the workspace holds is unread.");
  }
  return (await response.json()) as WorkspaceHeld;
}

/**
 * Archives a workspace through the hub (`POST /api/workspaces/:id/archive`):
 * its machine kills the boundary with everything in it and deletes the
 * clone and its records, a damaged one among them. The hub's refusal (a live
 * item there, or work in the clone that is nowhere else, which holds it) is
 * the error. `discard` lets that work go: its machine saves its unlanded
 * commits, changes and stashes to a carry first. Files git ignores go with
 * the clone.
 */
export async function archiveWorkspace(
  workspaceId: string,
  { discard = false }: { discard?: boolean } = {}
): Promise<void> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/archive`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ discard }),
    }
  );
  if (!response.ok) {
    throw await hubRefusal(
      response,
      "so the workspace was not archived. Try again."
    );
  }
  await refresh();
}

export async function removeSession(instanceId: string): Promise<void> {
  const response = await fetch(
    `/api/instances/${encodeURIComponent(instanceId)}`,
    { method: "DELETE" }
  );
  if (!response.ok) {
    throw await hubRefusal(
      response,
      "so the session was not removed. Try again."
    );
  }
  await refresh();
}

/**
 * Whether the dashboard may ask `machineId` anything now: the one presence
 * every ask to a machine goes through. The hub is reached and its board on
 * this socket is in (`hubReached`), and that board says the machine is online,
 * which the hub derives from holding the machine's socket right now (server.ts
 * `withPresence`), the same test it routes by. Across a hub restart the page
 * is back before its machines are, and nothing is asked of them until the hub
 * says each one is back.
 */
export function machineConnected(machineId: string): boolean {
  return (
    state.status === "connected" &&
    state.machines.some(
      (machine) =>
        machine.machineId === machineId && machine.status === "online"
    )
  );
}

/**
 * {@link ask}, of a machine: refused here, with the hub's words for it, while
 * {@link machineConnected} says the machine is not back, never sent to be
 * refused there.
 */
function askMachine<T>(
  machineId: string,
  requestId: string,
  timeoutMs: number,
  dispatch: () => void,
  readAnswer?: (result: unknown, leftOut?: LeftOut) => T
): Promise<Bounded<T>> {
  if (!machineConnected(machineId)) {
    return Promise.reject(
      new Error(machineFaultWords(machineName(machineId), "offline"))
    );
  }
  return ask<T>(requestId, timeoutMs, dispatch, readAnswer);
}

/**
 * Sends something the agent answers by `requestId`, and waits `timeoutMs` for
 * that answer. A refusal rejects in the machine's words; no answer in time is
 * its own outcome, `unanswered`, which every caller says as such
 * ({@link didntAnswer}).
 */
function ask<T>(
  requestId: string,
  timeoutMs: number,
  dispatch: () => void,
  readAnswer: (result: unknown, leftOut?: LeftOut) => T = (result) =>
    result as T
): Promise<Bounded<T>> {
  return readWithin(
    timeoutMs,
    (signal) =>
      new Promise<T>((resolve, reject) => {
        inflight.set(requestId, {
          resolve: (result, leftOut) => resolve(readAnswer(result, leftOut)),
          reject,
        });
        signal.addEventListener("abort", () => inflight.delete(requestId), {
          once: true,
        });
        try {
          dispatch();
        } catch (error) {
          inflight.delete(requestId);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })
  );
}

/**
 * A start the hub refused because no permission mode is named for it (a
 * revive or a rewind of a row with none, and none chosen for its harness on
 * its machine; core `ModeAsk`). Not words for the person: the page asks for
 * a mode where they acted (transcript/ModePick), starts the session again on
 * it ({@link relaunchSession}), and does what was asked.
 */
export class ModeUnchosen extends Error {
  readonly ask: ModeAsk;
  constructor(wanted: ModeAsk) {
    super("No permission mode is named for this session.");
    this.name = "ModeUnchosen";
    this.ask = wanted;
  }
}

/** A read no answer came back to in time. */
export type Unanswered = Extract<Bounded<unknown>, { kind: "unanswered" }>;

/**
 * What the person reads when a read of `machineId` didn't answer in time
 * (unanswered.ts): what didn't answer and when it is asked again while the
 * hub says the machine is online ({@link machineConnected}), "It may be
 * offline" only once it has lost it.
 */
export function didntAnswer(
  machineId: string,
  missed: Unanswered,
  words: Omit<MissedRead, "machine" | "online" | "after">
): string {
  return unansweredWords({
    machine: machineName(machineId),
    online: machineConnected(machineId),
    after: missed.after,
    ...words,
  });
}

/**
 * A read as an action the person started takes it, for the actions whose
 * one way to say something is the sentence they throw (a menu item, a
 * confirm dialog): the answer, or {@link didntAnswer}'s sentence thrown.
 * `outcome` says what is now not known, when something is.
 */
export function answeredOr<T>(
  machineId: string,
  read: Bounded<T>,
  outcome?: string
): T {
  switch (read.kind) {
    case "answered":
      return read.value;
    case "unanswered":
      throw new Error(
        didntAnswer(machineId, read, { outcome, again: TRY_AGAIN })
      );
    default:
      unhandled("read", read);
  }
}

/**
 * What the person reads when one harness on `machineId` didn't list its
 * stored sessions in time, in {@link didntAnswer}'s voice: its sessions are
 * the ones it listed last.
 */
function harnessDidntAnswer(
  machineId: string,
  { harness, after }: HarnessUnanswered
): string {
  return catalogWords.harnessDidntAnswer(
    accountsWords.harnesses[harness] ?? harness,
    machineName(machineId),
    Math.round(after / 1000)
  );
}

/**
 * What the person reads when one harness on `machineId` couldn't list its
 * stored sessions (its listing threw), in {@link harnessDidntAnswer}'s voice.
 */
function harnessCouldntList(
  machineId: string,
  { harness, error }: HarnessFailed
): string {
  return catalogWords.harnessCouldntList(
    accountsWords.harnesses[harness] ?? harness,
    machineName(machineId),
    error
  );
}

/** A `listSessions` answer's harnesses it left out: not answered in time, or their listing threw. */
interface LeftOut {
  failed: HarnessFailed[];
  unanswered: HarnessUnanswered[];
}

/**
 * The machine's stored sessions, newest first. A harness that did not list
 * in time, or whose listing threw, keeps the sessions it listed last; it is
 * kept on {@link catalogLeftOut} in {@link harnessDidntAnswer}'s and
 * {@link harnessCouldntList}'s words, and said over Recent's stored
 * sessions (HomeRecent), with Try again, until a load leaves none out;
 * never a toast (DESIGN.md, The Work Outlives Its Surface Rule).
 */
export async function loadCatalog(machineId: string): Promise<void> {
  try {
    await waitForHub();
    const requestId = newId();
    const payload: ControlPayload = {
      requestId,
      method: "listSessions",
      args: [SESSION_CATALOG_LIMIT > 0 ? { limit: SESSION_CATALOG_LIMIT } : {}],
    };
    const listed = await askMachine(
      machineId,
      requestId,
      CONTROL_TIMEOUT_MS,
      () => send({ verb: "control", machineId, requestId, payload }),
      (result, leftOut) => ({
        sessions: result as NeutralSessionInfo[],
        unanswered: leftOut?.unanswered ?? [],
        failed: leftOut?.failed ?? [],
      })
    );
    switch (listed.kind) {
      case "unanswered":
        // The catalog it last listed stands.
        console.warn(
          `[cawco] listSessions on ${machineId}: ${didntAnswer(machineId, listed, { missed: "its list of stored sessions didn't come back", again: "The list it gave last stands until the next load." })}`
        );
        break;
      case "answered": {
        const { sessions, unanswered, failed } = listed.value;
        const silent = new Set(
          [...unanswered, ...failed].map((one) => one.harness)
        );
        const kept = (catalog[machineId] ?? []).filter((info) =>
          silent.has(info.harness)
        );
        const said = [
          ...unanswered.map((one) => harnessDidntAnswer(machineId, one)),
          ...failed.map((one) => harnessCouldntList(machineId, one)),
        ];
        for (const sentence of said) {
          console.warn(`[cawco] ${sentence}`);
        }
        catalog = { ...catalog, [machineId]: [...sessions, ...kept] };
        catalogLeftOut = { ...catalogLeftOut, [machineId]: said };
        break;
      }
      default:
        unhandled("read", listed);
    }
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
  /**
   * `status` is the hub's HTTP answer where there was one: 404 is "no such
   * session", not a fault.
   */
  | ({ ok: false; status?: number } & ReadFault);

/** Puts a session back to "nothing has been said about the read" — Try again's first move. */
export function clearReadFault(instanceId: string): void {
  const held = state.sessions[instanceId];
  if (held) {
    held.readFault = null;
  }
}

/**
 * The server's read of this load found the view's machine away (its served
 * tail's 503): that is this load's read, kept as the view's fault, and the
 * view is read again on what can answer it ({@link readFailed}: the machine's
 * deadline, the board listing it online), never asked again meanwhile.
 */
export function keepServedAway(viewId: string, fault: ReadFault): void {
  if (fault.reason === "offline") {
    readFailed(session(viewId), fault);
  }
}

/**
 * The server's read of this load answered (its served tail's page): that is
 * this view's newest read, taken as {@link readNewestPage} takes one, and
 * nothing reads the page again. Its stream resumes from the page's `seq`
 * ({@link adoptPage}): on the socket open now when its board names the
 * page's hub run, else on the first board that does ({@link followHeld}),
 * the hub replaying what came after out of its ring or resetting. A page of
 * another run than the open socket's, or a view this tab already holds or
 * is reading, is no page to take: false, and the view is read as ever.
 */
export function keepServedPage(viewId: string, page: TranscriptPage): boolean {
  const target = session(viewId);
  const run = page.hubRun ?? null;
  const connected = state.status === "connected";
  if (
    target.reads > 0 ||
    target.blocks.length > 0 ||
    pageReads.has(viewId) ||
    (connected && run !== socketRun)
  ) {
    return false;
  }
  target.readFault = null;
  target.behind = null;
  readLanded(viewId);
  adoptTranscriptPage(target, page);
  adoptPage(streamState, streamHost, viewId, {
    seq: page.seq ?? 0,
    run,
    connected,
  });
  trackWorking(target);
  return true;
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
      /**
       * How long more that machine is on its way back, ms, as the hub said
       * it (`machineAway`); else null. Relative: the pane makes it a
       * deadline on the browser's clock once, as it takes the tail.
       */
      reconnectingMs: number | null;
      status: number;
      viewId: string;
    };

/**
 * Why a transcript read failed, said the way the pane says it: one sentence
 * of why ({@link hubFailure}), never the hub's body as it came. `away` is
 * the machine a 503 named: that is the hub saying the machine is not
 * connected, a state of the fleet, not a fault in the read, and a different
 * sentence. `reconnectingUntil`: the machine on its way back, until when.
 */
export function readFaultOf(
  failure: HubFailure,
  away: string | null,
  reconnectingUntil: number | null = null
): ReadFault {
  return away
    ? awayFault(away, reconnectingUntil)
    : { reason: "failed", message: failure.detail };
}

/** A read's machine away, as its fault says it ({@link readFaultOf}). */
function awayFault(
  machineId: string,
  reconnectingUntil: number | null
): ReadFault {
  return {
    reason: "offline",
    machineId,
    ...(reconnectingUntil === null ? {} : { reconnectingUntil }),
    message: `${machineName(machineId)} is offline, so its stored transcript can't be read right now`,
  };
}

/** A machine as the fleet list names it (its label), else its id. */
function machineName(machineId: string): string {
  const hostname = state.machines.find(
    (row) => row.machineId === machineId
  )?.hostname;
  return hostname ? machineLabel(hostname) : machineId;
}

/**
 * Whether a read's machine is on its way back now: its hub's deadline still
 * ahead on the clock ({@link ahead}). Past it, the machine is offline with
 * nothing having to say so.
 */
export function reconnectingNow(fault: ReadFault | null | undefined): boolean {
  return (
    fault?.reason === "offline" &&
    fault.reconnectingUntil !== undefined &&
    ahead(fault.reconnectingUntil)
  );
}

/** What a read fault says now: a machine on its way back, or the fault's own sentence. */
export function faultMessage(fault: ReadFault): string {
  return fault.reason === "offline" && reconnectingNow(fault)
    ? `${machineName(fault.machineId)} is reconnecting, so its stored transcript is read once it's back`
    : fault.message;
}

/**
 * Why a read that never reached an answer failed, in one sentence: the
 * read's own limit says itself; anything else the network threw is said by
 * what it means, not by the browser's words for it.
 */
function thrownReason(error: unknown): string {
  if (error instanceof Error && error.message === READ_LIMIT_SENTENCE) {
    return READ_LIMIT_SENTENCE;
  }
  return "The hub couldn't be reached";
}

/** Why a page read ended with nothing, said the way the pane says it. */
async function pageFault(response: Response): Promise<TranscriptOutcome> {
  const failure = await hubFailure(response);
  const { away, reconnectingMs } = machineAway(response);
  return {
    ok: false,
    status: response.status,
    ...readFaultOf(failure, away, deadlineIn(reconnectingMs)),
  };
}

/** Why the newest page is read: each caller of {@link readTranscript} names itself. */
export type ReadCause =
  /** A reader opened the session: a pane, a peek, a hover, a delegate card. */
  | "open"
  /** The hub's ring could not replay the gap (`stream.reset`). */
  | "streamReset"
  /** The replay came back broken {@link MAX_RESYNC_ATTEMPTS} times. */
  | "backlogBroken"
  /** The reader asked again after a failed read. */
  | "retry"
  /** The socket came back: every transcript the dashboard follows is read again. */
  | "reconnect"
  /** A transcript this tab holds is watched again, its stream let go meanwhile. */
  | "follow"
  /** The machine the last read found offline is online again. */
  | "machineOnline"
  /**
   * The hub's reconnecting deadline for the last read's machine passed: its
   * data read afresh. The view already says offline, on the clock.
   */
  | "deadline"
  /** The last read failed while the hub answered: read again on {@link READ_AGAIN_MS}. */
  | "backoff"
  /**
   * The page landed from another hub run than the socket's board names: its
   * `seq` counts in a numbering this socket's streams do not.
   */
  | "otherRun";

/**
 * A session's transcript, read once: the newest page the hub built, then its
 * stream from the `seq` that page was read at. An `open` read is skipped when
 * the view already follows the stream; every other cause reads it again. A
 * read already in flight answers for any ask that lands meanwhile, unless
 * `fresh`: its reader left the view and came back, so that read is ended
 * unanswered and a new one starts.
 */
export function readTranscript(
  viewId: string,
  cause: ReadCause = "open",
  fresh = false
): Promise<TranscriptOutcome> {
  // A tab the hub has not named yet is read once it has (workspace
  // `named`), if it names one.
  if (!workspace.named(viewId)) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  const target = session(viewId);
  const inFlight = pageReads.get(viewId);
  if (inFlight && !fresh) {
    return inFlight.read;
  }
  inFlight?.cancel();
  // A stream this view already follows carries everything after the page it
  // was read at — or, for a session this tab just started, everything there
  // is.
  if (cause === "open" && streamState.cursors[viewId]?.subscribed) {
    return Promise.resolve({ ok: true, skipped: true });
  }
  // A conversation stored on a machine the board lists away is not asked:
  // the hub could only refuse it (503). The view says the machine is away,
  // as that refusal would have, and the board listing it online reads it
  // (`readBehind`).
  const away = storedAwayOn(viewId);
  if (away) {
    const fault = awayFault(away.machineId, away.reconnectingUntil ?? null);
    readFailed(target, fault);
    return Promise.resolve({ ok: false, ...fault });
  }
  const controller = new AbortController();
  const read: Promise<TranscriptOutcome> = readNewestPage(
    target,
    cause,
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
 * The machine a view's conversation is stored on, when the hub holds no row
 * for it and the board lists that machine away: the hub reads such a
 * conversation off its machine alone. A row is read whatever its machine:
 * the hub may hold its transcript built. Null before the first board, whose
 * machines are not known yet.
 */
function storedAwayOn(viewId: string): Machine | null {
  const waits = storedReadWaits(viewId);
  return waits?.on === "machine" ? waits.machine : null;
}

/** What a read off a stored conversation's machine waits on ({@link storedReadWaits}). */
export type StoredWait = { on: "board" } | { machine: Machine; on: "machine" };

/**
 * What a read off a view's stored conversation waits on before it asks the
 * hub, when the hub holds no row for it and the view names its machine: the
 * hub reads it off that machine alone. `machine` while the board lists that
 * machine away, its row; `board` before the first board, whose machines are
 * not known yet; null when it can be asked. Read reactively: the board, the
 * machines and the rows are all `$state`.
 */
export function storedReadWaits(viewId: string): StoredWait | null {
  // Read first, so a reader that runs before the first board runs again
  // when the board's machines land.
  const { machines } = state;
  if (instanceIndex.byId.has(viewId)) {
    return null;
  }
  const machineId = contextOf(viewId)?.machine;
  if (!machineId) {
    return null;
  }
  if (socketRun === null) {
    return { on: "board" };
  }
  const machine = machines.find((row) => row.machineId === machineId);
  return machine && machine.status !== "online"
    ? { on: "machine", machine }
    : null;
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
  const late = new Error(READ_LIMIT_SENTENCE);
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
 * The pages read back from the newest, as one read: its rows oldest first,
 * the cursor before them, the branches read, and why a page before them
 * could not be read.
 */
interface ReadBack {
  blocks: TranscriptBlock[];
  branches: TranscriptPageBranch[];
  cursor: string | null;
  older: ReadFault | null;
}

/**
 * The newest page, and the pages before it while it does not reach a row
 * the view holds: read back only until the read meets a held row, the
 * conversation's start, or a page that cannot be read (then the strip before
 * the first row says why, {@link SessionState.olderFault}). The hub's row ids
 * are the same on every read, so rows meet by id; what the read holds is
 * merged into the rows held ({@link mergeRows}).
 */
async function readBackToMeet(
  target: SessionState,
  page: TranscriptPage,
  cancel: AbortSignal
): Promise<ReadBack> {
  // Every row in `blocks` is one the hub placed (`take`): this tab's own
  // sends wait in `local` until it does.
  const heldIds = new Set(target.blocks.map((message) => message.id));
  let read = page.blocks;
  let { branches, cursor } = page;
  while (
    heldIds.size > 0 &&
    cursor !== null &&
    !read.some((block) => heldIds.has(block.id))
  ) {
    const previous = await olderPage(target.instanceId, cursor, cancel);
    if (!("blocks" in previous)) {
      return { blocks: read, branches, cursor, older: previous };
    }
    const have = new Set(read.map((block) => block.id));
    read = [...previous.blocks.filter((block) => !have.has(block.id)), ...read];
    const listed = new Set(branches.map((branch) => branch.toolUseId));
    branches = [
      ...previous.branches.filter((branch) => !listed.has(branch.toolUseId)),
      ...branches,
    ];
    ({ cursor } = previous);
  }
  return { blocks: read, branches, cursor, older: null };
}

/**
 * Why a read failed, where the view says it: over rows held, they stay where
 * the reader has them and the view is behind ({@link SessionState.behind}):
 * the line over them says why, with its way back (transcript/Behind.svelte),
 * never a toast (DESIGN.md, The Work Outlives Its Surface Rule); with nothing
 * held, the pane says why in their place. A read the hub failed is read again on {@link READ_AGAIN_MS}; one
 * that found the machine offline waits for it ({@link readBehind}), unless
 * the hub already lists that machine online: then the machine list has
 * nothing more to say, and its every change would read again at once, so it
 * is read again on the backoff too. One that found it reconnecting waits for
 * it as well; the view says offline once the hub's deadline for it passes,
 * on the clock ({@link reconnectingNow}), and the data is read again then
 * ({@link readAtDeadline}). One the hub answered with nothing by its id
 * (`again` false, a 404) is not read again by itself.
 */
function readFailed(
  target: SessionState,
  fault: ReadFault,
  again = true
): void {
  if (target.blocks.length > 0) {
    target.behind = fault;
  } else {
    target.readFault = fault;
  }
  if (!again) {
    return;
  }
  const listedOnline =
    fault.reason === "offline" &&
    state.machines.some(
      (machine) =>
        machine.machineId === fault.machineId && machine.status === "online"
    );
  if (fault.reason === "failed" || listedOnline) {
    readAgainLater(target.instanceId);
  } else if (
    fault.reason === "offline" &&
    fault.reconnectingUntil !== undefined
  ) {
    readAtDeadline(target.instanceId, fault.reconnectingUntil);
  }
}

/** The read each view waits for while its machine reconnects: at the hub's deadline for it. */
const deadlineReads = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Reads the view's data again at `deadline`, when the hub stops reading its
 * machine as reconnecting, unless a read has landed meanwhile (the machine
 * back, {@link readBehind}) or a newer one answered by then. Only the data:
 * the view turns from reconnecting to offline on the clock, read or not.
 */
function readAtDeadline(viewId: string, deadline: number): void {
  clearTimeout(deadlineReads.get(viewId));
  deadlineReads.set(
    viewId,
    setTimeout(
      () => {
        deadlineReads.delete(viewId);
        const held = state.sessions[viewId];
        const fault = held?.behind ?? held?.readFault;
        if (
          held &&
          !held.loading &&
          fault?.reason === "offline" &&
          fault.reconnectingUntil === deadline &&
          subscriptionIds().includes(viewId)
        ) {
          detach(readTranscript(viewId, "deadline"), "readTranscript");
        }
      },
      Math.max(0, deadline - Date.now())
    )
  );
}

/** The failed reads in a row, by view, and the read again each waits for. */
const failedReads = new Map<
  string,
  { count: number; timer: ReturnType<typeof setTimeout> | undefined }
>();

/** Schedules the read again after the latest failure, on {@link READ_AGAIN_MS}. */
function readAgainLater(viewId: string): void {
  const failed = failedReads.get(viewId) ?? { count: 0, timer: undefined };
  clearTimeout(failed.timer);
  const wait = READ_AGAIN_MS[Math.min(failed.count, READ_AGAIN_MS.length - 1)];
  failed.count += 1;
  failed.timer = setTimeout(() => {
    failed.timer = undefined;
    const held = state.sessions[viewId];
    if (
      held &&
      !held.loading &&
      (held.behind ?? held.readFault) &&
      subscriptionIds().includes(viewId)
    ) {
      detach(readTranscript(viewId, "backoff"), "readTranscript");
    }
  }, wait);
  failedReads.set(viewId, failed);
}

/** A read landed: the next failure waits the first delay again. */
function readLanded(viewId: string): void {
  clearTimeout(failedReads.get(viewId)?.timer);
  failedReads.delete(viewId);
  clearTimeout(deadlineReads.get(viewId));
  deadlineReads.delete(viewId);
}

/**
 * The newest page into the view, and its stream resumed from the page's
 * `seq` on the socket whose board names the page's hub run; a page that
 * lands before any board keeps its place for the first one
 * ({@link followHeld}), and one of another run than the open socket's is read
 * again (`otherRun`).
 *
 * A READ AGAIN KEEPS EVERY ROW THE READER HAS. Over rows already held (a
 * resync, a retry, the socket or the machine back, the hub restarted), the
 * newest page, read back until it meets them ({@link readBackToMeet}), is
 * merged into them by id ({@link mergeRows}): every row shown stays where it
 * is, under its id, and the list keeps its place by them. Nothing held, the
 * page is the transcript, and the view asks for older pages itself as its
 * reader nears the first rows ({@link readOlderPage}).
 *
 * A read that fails leaves the stream waiting for the next one (its cursor
 * stays `reading`), and that read is made on the next event that can answer
 * it: the machine online again ({@link readBehind}), the socket back
 * ({@link hubReached}), the backoff after a read the hub failed
 * ({@link readAgainLater}), or the reader's retry. None of these is a
 * catch-up: the pane's "Catching up…" follows the pane, never a read.
 *
 * `cancel` fires when a fresh read took this one's place: whatever this one
 * would have said is dropped, and it answers `skipped`.
 */
async function readNewestPage(
  target: SessionState,
  cause: ReadCause,
  cancel: AbortSignal
): Promise<TranscriptOutcome> {
  const viewId = target.instanceId;
  beginRead(streamState, viewId);
  target.loading = true;
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
        const { ok: _ok, status, ...fault } = answer.fault;
        // A 404 is the hub's answer that nothing goes by this id: asked
        // again, it says the same.
        readFailed(target, fault, status !== 404);
      }
      return answer.fault;
    }
    const heldBefore = target.blocks.length;
    const back = await readBackToMeet(target, answer.page, cancel);
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    // A page of another hub run than the open socket's (the hub restarted
    // between the read and the socket's board) resumes nothing here: it is
    // read again of the hub that answers now.
    const run = answer.page.hubRun ?? null;
    if (state.status === "connected" && run !== socketRun) {
      return await readNewestPage(target, "otherRun", cancel);
    }
    target.readFault = null;
    target.behind = null;
    readLanded(viewId);
    adoptTranscriptPage(target, {
      ...answer.page,
      blocks: back.blocks,
      branches: back.branches,
      cursor: back.cursor,
    });
    target.olderFault = back.older;
    adoptPage(streamState, streamHost, viewId, {
      seq: answer.page.seq ?? 0,
      run,
      connected: state.status === "connected",
    });
    trackWorking(target);
    console.info(
      `[cawco] read ${viewId.slice(0, 8)} because ${cause}: ${answer.page.blocks.length} newest, ${back.blocks.length} read, ${heldBefore} held, ${target.blocks.length} rows`
    );
  } catch (error) {
    if (cancel.aborted) {
      return { ok: true, skipped: true };
    }
    const message = thrownReason(error);
    readFailed(target, { reason: "failed", message });
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
  cursor: string,
  cancel?: AbortSignal
): Promise<TranscriptPage | ReadFault> {
  try {
    return await readPage(
      transcriptUrl(viewId, { cursor, limit: TRANSCRIPT_OLDER_PAGE }),
      async (response) => {
        if (response.ok) {
          return (await response.json()) as TranscriptPage;
        }
        const { away, reconnectingMs } = machineAway(response);
        return readFaultOf(
          await hubFailure(response),
          away,
          deadlineIn(reconnectingMs)
        );
      },
      cancel
    );
  } catch (error) {
    return { reason: "failed", message: thrownReason(error) };
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

/** How many surfaces in this tab draw each session's context reading now, by instance id. */
const contextShown = new Map<string, number>();

/**
 * A surface that draws `instanceId`'s context reading (the details card,
 * SessionDetails; the peek's meter, PeekPane) says so for as long as it is
 * mounted: a turn's or a compaction's end reads it again only while one does
 * (applyFacts). The surface reads it once itself as it first shows it.
 * Answers the surface's let-go.
 */
export function showContext(instanceId: string): () => void {
  contextShown.set(instanceId, (contextShown.get(instanceId) ?? 0) + 1);
  return () => {
    const left = (contextShown.get(instanceId) ?? 1) - 1;
    if (left > 0) {
      contextShown.set(instanceId, left);
    } else {
      contextShown.delete(instanceId);
    }
  };
}

/**
 * What one context read found: the reading it took, or why it took none
 * (null when the harness reports no context at all).
 */
export type ContextRead =
  | { kind: "read"; usage: ContextUsage }
  | { kind: "unread"; why: string | null };

/** The context read in flight for each session, by instance id: a second asker joins it. */
const contextReads = new Map<string, Promise<ContextRead>>();

/**
 * How full the session's context window is, straight from the SDK — the same
 * reading `/context` shows, so the dock never has to estimate it from token
 * counts it saw go past. A `Query` method, so only a live session can answer;
 * a dead one keeps its last number rather than dropping to zero, which would
 * read as "empty" when it means "nobody asked". Answers what this read found,
 * for an asker that writes the figure down (session-export.ts); one asked
 * while a read is in flight joins that read.
 */
export function refreshContext(
  instanceId: string,
  machineId: string
): Promise<ContextRead> {
  const inFlight = contextReads.get(instanceId);
  if (inFlight) {
    return inFlight;
  }
  // Not asked of a machine that isn't back: the last reading stands.
  if (!machineConnected(machineId)) {
    return Promise.resolve({
      kind: "unread",
      why: machineFaultWords(machineName(machineId), "offline"),
    });
  }
  const target = session(instanceId);
  if (!harnessCan({ machineId, harness: target.harness }, "contextUsage")) {
    return Promise.resolve({ kind: "unread", why: null });
  }
  const reading = readContext(target, machineId).finally(() =>
    contextReads.delete(instanceId)
  );
  contextReads.set(instanceId, reading);
  return reading;
}

/** {@link refreshContext}'s one read, kept on the session as it lands. */
async function readContext(
  target: SessionState,
  machineId: string
): Promise<ContextRead> {
  const { instanceId } = target;
  target.contextPending = true;
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "getContextUsage",
    args: [],
  };
  try {
    const read = await askMachine<{
      totalTokens: number;
      maxTokens: number;
      percentage: number;
      categories: { name: string; tokens: number; color: string }[];
    }>(machineId, requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
    switch (read.kind) {
      case "unanswered":
        // The last reading stands; the details say why it is not newer, and
        // the next turn's end asks again (applyFacts).
        target.contextError = didntAnswer(machineId, read, {
          missed: "this session didn't report its context",
          again: "It's asked again when its turn ends.",
        });
        return { kind: "unread", why: target.contextError };
      case "answered":
        break;
      default:
        unhandled("read", read);
    }
    const usage = read.value;
    const context: ContextUsage = {
      totalTokens: usage.totalTokens,
      maxTokens: usage.maxTokens,
      percentage: usage.percentage,
      // "Free space" is the remainder, not a consumer: showing it as a slice
      // would make every session look mostly full of nothing.
      categories: usage.categories.filter((row) => row.name !== "Free space"),
      readAt: Date.now(),
    };
    target.context = context;
    target.contextError = null;
    return { kind: "read", usage: context };
  } catch (cause) {
    // A session that cannot answer keeps the last reading; the reason is kept
    // beside it so the details can say why rather than "not reported".
    target.contextError = messageOf(cause);
    return { kind: "unread", why: target.contextError };
  } finally {
    target.contextPending = false;
  }
}

/**
 * A refusal because the session is in custody — being handed back after an
 * agent restart. Expected for a moment, and the next ask gets through, so it
 * is not an error to log or to show.
 */
const isCustodyRefusal = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("(custody)");

/**
 * A `SlashCommand[]` answer as the lookup the menu reads its prose from: one
 * row per name, the one typing `/name` runs. A session lists a name more than
 * once when it holds two commands by it (a skill in two places, a skill that
 * shares a built-in's name). Claude Code marks its own rows, and "when a
 * marked row carries it, /name runs that one" (SDK `SlashCommand.builtin`);
 * between unmarked rows it says nothing more, so the first listed stands.
 */
const detailsOf = (commands: SlashCommand[]): Map<string, SlashCommand> => {
  const byName = new Map<string, SlashCommand>();
  for (const command of commands) {
    const held = byName.get(command.name);
    if (!held || (command.builtin && !held.builtin)) {
      byName.set(command.name, command);
    }
  }
  return byName;
};

/**
 * The menu asks the session what it has every time the reader opens it,
 * throttled to once per three seconds. Init and `commands_changed` are the
 * free prefill. Not asked of a machine that isn't back: the names held stand.
 */
export async function refreshCommands(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (
    target.commandsPending ||
    Date.now() - target.commands.at < 3000 ||
    !machineConnected(machineId) ||
    !harnessCan({ machineId, harness: target.harness }, "supportedCommands")
  ) {
    return;
  }
  target.commandsPending = true;

  const request = <T>(method: string): Promise<Bounded<T>> => {
    const requestId = newId();
    const payload: ControlPayload = {
      instanceId,
      requestId,
      method,
      args: [],
    };
    return askMachine<T>(machineId, requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "control", machineId, instanceId, requestId, payload })
    );
  };
  try {
    const read = await request<SupportedCommands>(CONTROL_SUPPORTED_COMMANDS);
    switch (read.kind) {
      case "unanswered":
        // The menu keeps what it last heard; the next open asks again.
        console.warn(
          `[cawco] supportedCommands on ${instanceId}: ${didntAnswer(machineId, read, { missed: "this session didn't list its commands", again: "The menu asks again when it next opens." })}`
        );
        return;
      case "answered":
        break;
      default:
        unhandled("read", read);
    }
    const commands = read.value;
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
): Promise<Bounded<McpServerStatus[]>> {
  const requestId = newId();
  const payload: ControlPayload = {
    instanceId,
    requestId,
    method: "mcpServerStatus",
    args: [],
  };
  return askMachine<McpServerStatus[]>(
    machineId,
    requestId,
    CONTROL_TIMEOUT_MS,
    () => send({ verb: "control", machineId, instanceId, requestId, payload })
  );
}

/**
 * Which MCP servers this session runs, so a tool card can name the server a
 * call went to (transcript/ToolGroup). `mcpServerStatus` is a Query method, so
 * only a live session answers. A refused ask stores `[]` rather than staying
 * null: null is what re-triggers the asking effect, and a machine that
 * refuses must not be asked in a loop. One nobody answered in time stays
 * null, not known: the next time the session goes live it is asked again. A
 * machine that isn't back is not asked, and the null stays for when it is.
 */
export async function loadMcpServers(
  instanceId: string,
  machineId: string
): Promise<void> {
  const target = session(instanceId);
  if (
    target.mcp !== null ||
    target.mcpPending ||
    !machineConnected(machineId)
  ) {
    return;
  }
  if (!harnessCan({ machineId, harness: target.harness }, "mcpStatus")) {
    return;
  }
  target.mcpPending = true;

  try {
    const read = await askMcp(instanceId, machineId);
    switch (read.kind) {
      case "unanswered":
        console.warn(
          `[cawco] mcpServerStatus on ${instanceId}: ${didntAnswer(machineId, read, { missed: "this session didn't list its MCP servers", again: "It's asked again the next time the session goes live." })}`
        );
        break;
      case "answered":
        target.mcp = read.value;
        break;
      default:
        unhandled("read", read);
    }
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
 * How long a start again asked during a turn waits for its answer: the
 * machine gives it once that turn has ended and the session runs again, and
 * a turn may run long.
 */
const RELAUNCH_AT_TURN_END_MS = HOUR_MS;

/**
 * `bypassPermissions` is a launch decision — the SDK refuses to switch a running
 * session into it — and so is `fullSend`, which runs the CLI in bypass. A
 * session that wants either from another mode is started again in place:
 * same instance id, same hub row, its own SDK session resumed, so the new
 * process reads the whole conversation back, once the turn it is in has
 * ended. A spin-off relaunches the same way; the agent keeps it in the
 * checkout it was already working in.
 */
export async function relaunchSession(
  instanceId: string,
  machineId: string,
  permissionMode: PermissionMode
): Promise<Bounded<void>> {
  const target = session(instanceId);
  // The one rule for starting a session again (core `relaunchOf`): on its
  // conversation when it has one, fresh under its id when its harness never
  // began one (a session switched before its first message), and not at all
  // when its conversation is gone.
  const plan = relaunchOf({
    sessionId: resumeKeyFor(instanceId),
    lastErrorKind: instanceIndex.byId.get(instanceId)?.lastErrorKind ?? null,
  });
  if (plan.kind === "refused") {
    throw new Error(plan.reason);
  }

  const requestId = newId();
  const payload = await explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: harnessOfSession(instanceId),
    ...(plan.kind === "resume"
      ? { resume: { sessionKey: plan.sessionKey } }
      : {}),
    // The process is replaced, on its own conversation: without this, a
    // resume for a session its machine runs is a recovery of that process,
    // which its machine keeps, and the new mode never reached it.
    relaunch: true,
    // A relaunch is a spawn like any other, so it has to say what it is: a spin-off
    // that stayed silent about it would come back as mainline work, untagged.
    scratch: target.scratch ? {} : undefined,
    permissionMode,
    // Only the mode is being changed, so the model the session was answering on
    // carries over, and the hub starts it at the effort chosen for it.
    model: target.model ?? undefined,
    requestId,
  });

  const previous = target.permissionMode;
  // A turn is never cut for it: its machine starts it again once the turn
  // running now has ended (agent session.ts `#turnEnded`), and answers then.
  const inTurn = target.busy || target.pending.length > 0;
  target.permissionMode = permissionMode;
  target.relaunching = true;
  try {
    const relaunched = await ask<void>(
      requestId,
      inTurn ? RELAUNCH_AT_TURN_END_MS : CONTROL_TIMEOUT_MS,
      () => send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    switch (relaunched.kind) {
      case "unanswered":
        // Not known to run on the new mode: the view shows the last confirmed one.
        target.permissionMode = previous;
        return relaunched;
      case "answered":
        return relaunched;
      default:
        unhandled("read", relaunched);
    }
  } catch (error) {
    target.permissionMode = previous;
    throw error;
  } finally {
    target.relaunching = false;
    detach(refresh(), "refresh");
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

/**
 * Each session's rewindable turns as last read, by the revision they were
 * read at (`SessionState.rev`, which moves with every change to its
 * messages). Every reader's turn asks as its row mounts, and read afresh
 * each time, a wheel bringing in a few of them walked the whole session for
 * each (1ms of a wheel's task, transcript-holds' steady wheel, profiled).
 */
const rewindable = new WeakMap<
  SessionState,
  { cursor: string | null; length: number; rev: number; turns: Set<string> }
>();

function rewindableTurns(target: SessionState): Set<string> {
  const { cursor, rev } = target;
  const { length } = target.messages;
  const kept = rewindable.get(target);
  if (
    kept &&
    kept.rev === rev &&
    kept.cursor === cursor &&
    kept.length === length
  ) {
    return kept.turns;
  }
  const turns = readRewindable(target);
  rewindable.set(target, { cursor, length, rev, turns });
  return turns;
}

function readRewindable(target: SessionState): Set<string> {
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

/** Where a fork from message `id` of `instanceId` branches: at the answer behind it (spawn/new-session `startFork` starts it). */
export async function forkPointOf(
  instanceId: string,
  id: string
): Promise<ForkSource> {
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
  return {
    machineId: target.machineId,
    cwd: target.cwd,
    sessionId: sessionKey,
    harness: harnessOfSession(instanceId),
    at: point,
  };
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
): Promise<Bounded<void>> {
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
  const payload = await explicit(machineId, {
    instanceId,
    cwd: target.cwd,
    harness: harnessOfSession(instanceId),
    resume: { sessionKey, atMessage: point },
    // What a relaunch carries: a rewind changes what the session has said, not
    // what it is. Its effort is the one chosen for it, which the hub supplies.
    scratch: target.scratch ? {} : undefined,
    permissionMode: target.permissionMode ?? undefined,
    model: target.model ?? undefined,
    requestId,
  });

  // The hub cuts the transcript back to the answer the rewind lands on as it
  // starts the process, and puts it back whole if the spawn never lands; every
  // screen reads the cut from it.
  // Whatever was in flight belongs to the process being replaced.
  settleStopped(instanceId);
  target.relaunching = true;
  try {
    const rewound = await ask<void>(requestId, CONTROL_TIMEOUT_MS, () =>
      send({ verb: "spawn", machineId, instanceId, requestId, payload })
    );
    switch (rewound.kind) {
      case "unanswered":
        // Not known to have restarted at the rewind point: the new wording is not sent.
        return rewound;
      case "answered":
        submitCommand(instanceId, machineId, "send", { text: content });
        return rewound;
      default:
        unhandled("read", rewound);
    }
  } finally {
    target.relaunching = false;
    detach(refresh(), "refresh");
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
  // A browser ask's Deny refuses and says nothing more: its card takes no words.
  if (answer === "deny") {
    return {
      behavior: "deny",
      message: request.browserAsk ? "" : "User denied permission",
    };
  }
  return {
    behavior: "allow",
    updatedInput: request.input,
    ...(answer === "always" && { updatedPermissions: request.suggestions }),
  };
}

/**
 * Take over on a browser ask (core `BrowserAskFrame`), from its transcript
 * card or its Needs you row alike: the hub's `/takeover` (browsers.ts)
 * starts the private period for that ask, takes it off every screen and
 * opens the session's panel on its browser. Answers null once the hub has
 * it, else the line the refusal reads, the hub's own sentence inside it
 * (WORDS, the error formula).
 */
export async function takeOverBrowser(
  requestId: string,
  browserAsk: BrowserAskFrame
): Promise<string | null> {
  try {
    const response = await fetch(
      `/api/browsers/${encodeURIComponent(browserAsk.key)}/takeover`,
      json("POST", { requestId, machineId: browserAsk.machineId })
    );
    if (!response.ok) {
      throw await hubRefusal(response);
    }
    return null;
  } catch (error) {
    return `${askWords.cantTakeOver} ${error instanceof Error ? error.message : String(error)} ${askWords.stillWaiting}`;
  }
}

/** What a session needs from you — `idle` for one nothing has been heard from. */
function activityNow(instanceId: string): Activity {
  const target = state.sessions[instanceId];
  // Blocked wins everywhere: a parked permission is broadcast, not filtered.
  if (target && target.pending.length > 0) {
    return "blocked";
  }
  const row = rowsById.get(instanceId);
  // Its project is moving for it: working from the move's start (a yes
  // the move waits on is its parked ask, above).
  if (row?.status === "moving") {
    return "working";
  }
  const pulse = pulseOf(instanceId);
  if (pulse?.activity === "blocked" && !(target && isSubscribed(instanceId))) {
    return "blocked";
  }
  if ((row?.runningDelegates ?? 0) > 0) {
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
}

/**
 * Every permission waiting on the user, across every machine. This is the
 * question the fleet view exists to answer, so it is derived from the sessions
 * themselves rather than tracked separately: once per change to what it
 * reads, each asking session's own row read by its id.
 */
const blocked = $derived.by((): BlockedRequest[] => {
  const rows: BlockedRequest[] = [];
  for (const target of Object.values(state.sessions)) {
    if (target.pending.length === 0) {
      continue;
    }
    // Every ask the hub holds is listed, whatever its session's row says:
    // the hub settles the asks of a process that ended, and keeps the ones
    // that outlive it (a question `ask` put, a post held for you) until they
    // are answered or the session ends for good. One whose machine the hub
    // cannot reach (`unknown`) is marked stale. Across a reconnect the asks
    // hold as last read until the hub's read replaces them (`adoptPending`).
    const row = rowsById.get(target.instanceId);
    const machine = state.machines.find(
      (one) => one.machineId === target.machineId
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
        stale: row !== undefined && isStale(row),
      });
    }
  }
  // The very list it gave before while it says the same asks the same
  // way: a frame that moved a session's transcript re-asks this, and a
  // new list woke every list that leaves the asks out.
  if (
    rows.length === blockedWas.length &&
    rows.every((one, i) => sameAsk(one, blockedWas[i]))
  ) {
    return blockedWas;
  }
  blockedWas = rows;
  return rows;
});
let blockedWas: BlockedRequest[] = [];
const sameAsk = (a: BlockedRequest, b: BlockedRequest | undefined): boolean =>
  b !== undefined &&
  a.request === b.request &&
  a.instanceId === b.instanceId &&
  a.machineId === b.machineId &&
  a.hostname === b.hostname &&
  a.cwd === b.cwd &&
  a.stale === b.stale;

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
 * One session's `/` menu: every name it listed, once, wearing whatever
 * `supportedCommands` has since said about it ({@link detailsOf} keeps the
 * row `/name` runs). The init frame leads because it arrives on every turn and
 * is free — the descriptions are one lazy call behind it, and are all there is
 * before the first init. A name listed twice inserts the same `/name` and runs
 * one command, so it is one row: the menu keys its rows by it.
 */
function availableCommands({
  names,
  skills,
  detailed,
}: CommandState): AvailableCommand[] {
  const listed = new Set(
    names.length > 0 ? names : [...(detailed?.keys() ?? [])]
  );
  return [...listed]
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
  /** The board's snapshot and the first read of the projects after it are in. */
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
    return state.outageAt !== null && !ahead(state.outageAt)
      ? "unreachable"
      : "connecting";
  },
  /**
   * The update the hub said it restarts for, while its deadline is ahead:
   * the build it goes to (null when unnamed) and when it is back by. Null
   * otherwise: no update, the hub back, or the deadline passed (then the
   * hub is unreachable like any other).
   */
  get restart(): { until: number; version: string | null } | null {
    return state.restart && ahead(state.restart.until) ? state.restart : null;
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
  /** This page was built for an older wire than the hub's and has stopped reading it: the connection band says so, and the update toast takes it to the new build. */
  get olderWire(): boolean {
    return state.older;
  },
  /** What a session has been handed and not yet answered; `null` for most. */
  handoffFor: (instanceId: string): { from: string; at: number } | null =>
    state.handoffs[instanceId] ?? null,
  /** The continuations the hub is carrying, settled ones for a few minutes after. */
  get continuations(): ContinuationJob[] {
    return state.continuations;
  },
  /** Former id → the id its session has now (the hub's fold of older continuations). */
  get formerIds(): Record<string, string> {
    return state.formerIds;
  },
  /** The fleet's preview mode, as the board last carried it; null before the first board. */
  get previewSettings(): PreviewSettings | null {
    return state.previewSettings;
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
  /** What the hub is running; `undefined` until its first frame. */
  get hubBuild() {
    return state.hubBuild;
  },
  get onlineMachines() {
    return state.machines.filter((machine) => machine.status === "online");
  },
  /** Every Claude account's own limits, by account id. */
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
  /** One hub row by its id, read on its own: it wakes when that row moves, and no other. */
  rowOf: (instanceId: string): InstanceRow | undefined =>
    rowsById.get(instanceId),
  /** Whether the hub still reaches this session (one of `runningInstances`), read off its own row. */
  liveId: (instanceId: string): boolean => {
    const row = rowsById.get(instanceId);
    return row !== undefined && isLive(row);
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
  /** The listed rows by id: one map for every list that walks their trees (the rail's, Recent's). */
  get listedById(): ReadonlyMap<string, BoardRow> {
    return listedById;
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
  /** Spin-offs across the fleet — kept in their own section, not per machine. */
  get scratchInstances(): InstanceRow[] {
    return instances.filter((row) => isListed(row) && row.kind === "scratch");
  },
  /** Stored sessions on one machine, minus the spin-offs hiding among them. */
  catalogOf: (machineId: string): NeutralSessionInfo[] =>
    (catalog[machineId] ?? []).filter(listedInHistory),
  /** The harnesses on `machineId` its last listing left out (not in time, or failed), each as a sentence; said over Recent's stored sessions (HomeRecent). */
  catalogLeftOutOf: (machineId: string): string[] =>
    catalogLeftOut[machineId] ?? [],
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
  /** Approved actions waiting on you: proposed, or failed or unknown until put away. */
  get actions(): ApprovedActionView[] {
    return state.actions;
  },
  /** The minute, for what reads a clock (ages, resets). */
  get now(): number {
    return minute.now;
  },
  /** A count that moves each time the project's tasks change (`tasks.changed`). */
  tasksChangedOf: (projectId: string): number =>
    state.tasksChanged[projectId] ?? 0,
  /** A count that moves each time a `tasks.changed` frame names the task, or names none of the project's. */
  taskChangedOf: (projectId: string, taskId: string): number =>
    (state.taskChanged[`${projectId}/${taskId}`] ?? 0) +
    (state.tasksChangedUnnamed[projectId] ?? 0),
  /** A count that moves each time the project's decision pages change (`decisions.changed`). */
  decisionsChangedOf: (projectId: string): number =>
    state.decisionsChanged[projectId] ?? 0,
  /** A count that moves each time the project's arrangement of blocks changes (`blocks.changed`). */
  blocksChangedOf: (projectId: string): number =>
    state.blocksChanged[projectId] ?? 0,
  /**
   * The project's starters for a place: the set the hub last sent while
   * this page was connected, else `read`, the set its stages read carried.
   */
  startersOf: (
    projectId: string,
    where: StarterPlace,
    read: ProjectStarter[] | undefined
  ): ProjectStarter[] => state.starters[`${where}:${projectId}`] ?? read ?? [],
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
   * What a session's tray lists, oldest first: the work items it delegated
   * (and as its project's conversation the ones it co-parents), and the sessions it
   * started that run none ({@link startedBy}).
   */
  trayOf: (instanceId: string): TrayChild[] =>
    [
      ...Object.values(state.workItems)
        .filter(
          (item) =>
            item.parentInstanceId === instanceId ||
            item.conversationInstanceId === instanceId
        )
        .map(itemChild),
      ...(startedBy.get(instanceId) ?? []).map(sessionChild),
    ].sort((a, b) => a.createdAt - b.createdAt),
  /** A delegate's or a started session's tray entry, by its instance id. */
  trayChildFor: (instanceId: string): TrayChild | undefined => {
    const item = Object.values(state.workItems).find(
      (each) => each.instanceId === instanceId
    );
    if (item) {
      return itemChild(item);
    }
    const row = rowsById.get(instanceId);
    return row && isStarted(row) ? sessionChild(row) : undefined;
  },
  /** A followed session's plan, live: its steps, its spec, an attempt's to-dos. */
  planOf: (instanceId: string): SessionPlan | undefined =>
    state.plans[instanceId]?.plan,
  /** The "make this a project" offer standing on a session, if one does. */
  projectOfferOf: (instanceId: string): ProjectOfferSummary | undefined =>
    state.projectOffers[instanceId],
  /** The project an offer on this session joined, while its card stands. */
  projectJoinOf: (instanceId: string): ProjectOfferAccepted | undefined =>
    state.projectJoins[instanceId],
  /** The work item a delegate session runs, when its parent's tray was told of it. */
  workItemFor: (instanceId: string): WorkItemSummary | undefined =>
    Object.values(state.workItems).find(
      (item) => item.instanceId === instanceId
    ),
  /** Fleet watch's needs-you notices, oldest first. */
  get watchNotices(): FleetWatchNotice[] {
    return state.watchNotices;
  },
  /** The artifacts waiting on the person, longest wait first. */
  get artifactNeeds(): ArtifactNeed[] {
    return state.artifactNeeds;
  },
  /** The artifacts' notices, newest first. */
  get artifactNotices(): ArtifactNeedNotice[] {
    return state.artifactNotices;
  },
  /** Every system law the hub caught broken since it started. */
  get lawsBroken(): LawBroken[] {
    return state.lawsBroken;
  },
  /** The fleet's upstream answer; null while nobody has given it, undefined until read. */
  get fleetUpstream(): UpstreamPosts | null | undefined {
    return state.fleetUpstream;
  },
  /** Every machine's browsers as the hub last told them; undefined until its first frame. */
  get browsers(): ListedBrowser[] | undefined {
    return state.browsers;
  },
  /** HTTPS on the hub machine's tailnet name; undefined until read. */
  get tailnetHttps(): TailnetHttps | undefined {
    return state.tailnetHttps;
  },
  /** Its step was taken while this page stood, a moment ago: the row ticks. */
  get tailnetTicked(): boolean {
    return state.tailnetTicked;
  },
  /** The stream relay's journey, as the hub has it; undefined until read. */
  get relayJourney(): RelayJourneyView | undefined {
    return state.relayJourney;
  },
  /** The domain this page reached CawCo through, as the hub saw it; null by IP, the tailnet or a name of the hub's. */
  get relayDomain(): string | null {
    return state.relayDomain;
  },
  /** The relay went live and was proven from outside while this page stood: its row ticks. */
  get relayTicked(): boolean {
    return state.relayTicked;
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
  /**
   * What a session needs from you — `idle` for one nothing has been heard
   * from. A hub row's is held per row ({@link RowActivity}).
   */
  activityOf: (instanceId: string): Activity =>
    rowActivity.get(instanceId)?.value ?? activityNow(instanceId),
  /**
   * Whether the session's own main loop is in a turn, its delegates and
   * subagents aside: what a project's Caw is doing himself, where
   * `activityOf` counts a conversation as working while any attempt it parents runs.
   * The same sources as `activityOf`: an open session's frames, else the
   * daemon's pulse.
   */
  busyOf: (instanceId: string): boolean => {
    const target = state.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.busy;
    }
    return pulseOf(instanceId)?.busy ?? false;
  },
  currentToolOf: (
    instanceId: string
  ): { name: string; glance: string } | null => {
    const target = state.sessions[instanceId];
    if (target && isSubscribed(instanceId)) {
      return target.currentTool;
    }
    return pulseOf(instanceId)?.currentTool ?? null;
  },
  /**
   * When the daemon last pulsed a session, ms epoch — the freshest signal a
   * rail has for an unsubscribed session, since the pulse is broadcast for
   * every session while its transcript frames only flow to a watcher.
   */
  pulseAt: (instanceId: string): number | undefined => pulseOf(instanceId)?.at,
  /** When the session's current turn began, ms epoch; `undefined` while it is idle. */
  turnSince: (instanceId: string): number | undefined =>
    heldPulse(instanceId)?.since,
  /** The line an ask left: withdrawn unanswered, or answered elsewhere; none for one answered here or still waiting. */
  askEnd: (requestId: string): Message | undefined => state.askEnds[requestId],
  /**
   * The ledger stats the fleet table shows per session — turns, context %.
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
  } => {
    const t = state.sessions[instanceId];
    if (!t) {
      return {
        turns: null,
        contextPct: null,
        totalTokens: null,
        maxTokens: null,
      };
    }
    const turns = t.messages.filter((m) => m.type === "assistant").length;
    return {
      turns: turns > 0 ? turns : null,
      contextPct: t.context?.percentage ?? null,
      totalTokens: t.context?.totalTokens ?? null,
      maxTokens: t.context?.maxTokens ?? null,
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
    return pulseOf(instanceId)?.runningSubagents ?? 0;
  },
  get blocked(): BlockedRequest[] {
    return blocked;
  },
  get blockedCount(): number {
    return blocked.length;
  },
};
