/**
 * Every session this page holds a view of, live or browsed from storage
 * (`SessionState`), each one a `$state` proxy handed out as the same object
 * for as long as the page holds it; and what its board row and pulse fill
 * in of a session this page did not start.
 */

import type { AvailableCommand } from "@cawco/core/fleet";
import type { BrowserAskFrame, ConnectAskFrame } from "@cawco/core/frames";
import type {
  HarnessKind,
  PermissionMode,
  SessionEffort,
} from "@cawco/core/harness/kinds";
import type { PermissionPresentation } from "@cawco/core/permission-presentation";
import type { SessionTooling } from "@cawco/core/protocol";
import type {
  McpServerStatus,
  NeutralStatus,
  SendRecord,
} from "@cawco/core/session-messages";
import type { ToolGlance } from "@cawco/core/transcript-types";
import type { SubagentState } from "#lib/utils/flow-types.js";
import { activityOf } from "../activity";
import type { PulseReading } from "../board.svelte";
import type { BoardFrame, FrameKind, FrameOf } from "../hub/frames";
import type { BoardRow } from "../links";
import { availableCommands, type CommandState } from "../slash-commands";
import type { Message } from "../types";
import {
  boardState,
  instanceIndex,
  pulseOf,
  pulses,
  takePulse,
} from "./board.svelte";
import { latestCommandFor } from "./ledger.svelte";
import { equal } from "./same";

export interface PendingPermission {
  /** A browser ask's browser, reason and origin (core `BrowserAskFrame`): its card offers Deny and Take over. */
  browserAsk?: BrowserAskFrame;
  /** A connect ask's server, reason, sign-in address and access (core `ConnectAskFrame`): its card offers Connect and Not now. */
  connectAsk?: ConnectAskFrame;
  /**
   * When this device last heard the hub park it, in the order it hears
   * things (`askHeard`): a read of `/api/pending` asked for before
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
  /** The harness's own suggested updates, held whole: "Always allow" hands them back as they came. */
  suggestions?: unknown[];
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
  | { message: string; reason: "failed" }
  /**
   * The session's machine refuses the harness CLI its conversation is read
   * through (the hub's `harness-refused`): read again once the machine
   * runs it (SessionPane), or on Try again, never on a backoff, which
   * would be refused the same. `message` is the hub's sentence.
   */
  | { message: string; reason: "refused" };

/** Everything one session view needs — live or browsed from storage. */
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

export const sessionsState = $state<{
  sessions: Record<string, SessionState>;
}>({
  sessions: {},
});

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

export function session(instanceId: string): SessionState {
  const existing = sessionsState.sessions[instanceId];
  if (existing) {
    return existing;
  }

  const created: SessionState = blankSession(instanceId);
  sessionsState.sessions[instanceId] = created;
  // Read it back: the literal above is the raw target, and `$state` writes land
  // on the proxy's signals, never on it. Handing out the raw object would give
  // callers a view the UI stops tracking the moment it first renders one.
  const target = sessionsState.sessions[instanceId];
  // A session this browser never opened — a permission replayed from `/api/pending`
  // is the usual way — still has to name its machine on the fleet view.
  hydrate(target);
  return target;
}

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
export function applyPulse(target: SessionState, pulse: PulseReading): void {
  target.busy = pulse.busy;
  if (!equal(target.currentTool, pulse.currentTool)) {
    target.currentTool = pulse.currentTool;
  }
}

/** Fills in what the registry knows about a session this browser did not spawn. */
export function hydrate(target: SessionState): void {
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
 * Keeps {@link SessionState.workingSince} in step with what the session is
 * doing. Anything that can change {@link activityOf} calls this: the clock
 * starts at the first sign of work and stops only where the session goes idle,
 * so a turn that is merely blocked or waiting on a tool keeps counting.
 */
export function trackWorking(target: SessionState): void {
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
export function clearTurnPhase(target: SessionState): void {
  target.openBlock = null;
  target.thinkingStream = "";
  target.thinkingClosing = false;
  target.thinkingSince = null;
}

/** The kinds of a session's frame that say no more than that it moved. */
export const TOUCH_KINDS = [
  "asleep",
  "frame",
  "held_send",
  "recovery_unavailable",
  "rejected",
  "scratch_worktree",
  "send",
  "session_address",
  "stopped",
  "taken_send",
] as const satisfies readonly FrameKind[];

type TouchKind = (typeof TOUCH_KINDS)[number];

/** A session's frame that says no more than that it moved: its session is held, its activity stamped. */
export function touchSession(frame: FrameOf<TouchKind>): void {
  const target = session(frame.instanceId);
  trackWorking(target);
  target.lastActivityAt = new Date();
}

/** Each session this page holds, live or browsed from storage. */
export const sessionsStore = {
  session: (instanceId: string): SessionState | null =>
    sessionsState.sessions[instanceId] ?? null,
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
    const t = sessionsState.sessions[instanceId];
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
  /**
   * The MCP servers and tools the session's newest `init` announced: the hub's
   * stored copy, read as the view opened, then each live `init` — so a reload
   * or a hub restart keeps them. Empty for a harness whose `init` carries
   * neither, and for a view not opened yet.
   */
  toolingOf: (instanceId: string): SessionTooling =>
    sessionsState.sessions[instanceId]?.tooling ?? { servers: [], tools: [] },
  /** What a session offers behind `/`, grouped the way the palette lists it. */
  commandsOf: (instanceId: string): AvailableCommand[] => {
    const target = sessionsState.sessions[instanceId];
    return target ? availableCommands(target.commands) : [];
  },
};

/**
 * Every connection seeds now-state; subsequent changes arrive as pulses.
 * A merge, not a replace: a per-instance `pulse` frame is not ordered
 * against a snapshot the hub took moments before the `instances` frame
 * carrying it left, so whichever pulse actually happened later, by its
 * own `at`, is the one kept.
 */
export function takeBoardPulses(frame: BoardFrame): void {
  if (frame.kind !== "instances") {
    return;
  }
  for (const [id, pulse] of Object.entries(frame.pulses)) {
    const held = pulses.get(id);
    if (!held || pulse.at >= held.at) {
      takePulse(id, pulse);
    }
  }
  for (const [id, pulse] of pulses) {
    const held = sessionsState.sessions[id];
    if (held) {
      applyPulse(held, pulse);
    }
  }
  if (!equal(boardState.hubBuild, frame.hubBuild)) {
    boardState.hubBuild = frame.hubBuild;
  }
}

export function takePulseFrame(frame: FrameOf<"pulse">): void {
  const previous = pulses.get(frame.instanceId);
  if (previous && previous.at > frame.pulse.at) {
    return;
  }
  // The daemon's coarse now-state, broadcast — this is the whole of what the
  // rail knows about a session this browser has not subscribed to. Field
  // by field: a pulse inside a turn moves its row's time and tool, and
  // wakes no list that files the session by its activity.
  takePulse(frame.instanceId, frame.pulse);
  const held = sessionsState.sessions[frame.instanceId];
  if (held) {
    applyPulse(held, frame.pulse);
  }
}
