/** Named frame shapes keep schema and generated-client names independent of union order. */
import type { FleetMcpServer } from "./fleet";
import type {
  HarnessKind,
  NeutralMessage,
  PermissionUpdate,
  SendRecord,
} from "./harness";
import type {
  AgentRow,
  BuildInfo,
  ContinuationJob,
  DelegateEvent,
  InstanceRow,
  PreviewSource,
  SessionPulse,
  SupervisorEvent,
  SupervisorStatusSignal,
  Verb,
  WorkItemSummary,
} from "./index";
import type { ThreadMessage, ThreadSummary } from "./threads";
import type { UsageLimitsReading, UsageSpend } from "./usage";

export interface FleetMcpFrame {
  kind: "fleet_mcp";
  servers: FleetMcpServer[];
}

export interface CacheInvalidatedFrame {
  at: number;
  instanceId?: undefined;
  kind: "cache_invalidated";
  reason: string;
}

export interface PreviewFrame {
  instanceId: string;
  kind: "preview";
  /** The path on the dashboard's own origin, e.g. `/preview/<id>/`. */
  path: string;
  /** Identifies one successful open, including a rebuild of the same source. */
  revision: string;
  source?: PreviewSource;
  state: "open" | "closed";
}

export interface MessageFrame {
  harness: HarnessKind;
  instanceId: string;
  keepAlive?: true;
  kind: "frame";
  message: NeutralMessage;
}

export interface SendFrame {
  instanceId: string;
  keepAlive?: true;
  /** Hub-originated: a send's record, as it stands after its latest change. */
  kind: "send";
  record: SendRecord;
}

export interface RejectedFrame {
  error: string;
  instanceId: string;
  /** Daemon-originated: one send did not go; its record fails and the session goes on. */
  kind: "rejected";
  uuid: string;
}

export interface InstancesFrame {
  agents: AgentRow[];
  continuations: ContinuationJob[];
  handoffs: Record<string, { from: string; at: number }>;
  hubBuild: BuildInfo;
  instances: InstanceRow[];
  /** Hub-originated: the complete board on every connection, including reconnects. */
  kind: "instances";
  previews?: PreviewFrame[];
  protocol: number;
  pulses: Record<string, SessionPulse>;
}

export interface InstancesDeltaFrame {
  /** Changed machines only; omitted when no machine moved. */
  agents?: AgentRow[];
  continuations?: ContinuationJob[];
  handoffs?: Record<string, { from: string; at: number }>;
  /** Hub-originated: only changed rows and metadata; pulses travel separately. */
  kind: "instances_delta";
  previews?: PreviewFrame[];
  removed: string[];
  removedAgents?: string[];
  upserts: InstanceRow[];
}

export interface PermissionRequestFrame {
  harness: HarnessKind;
  input: Record<string, unknown>;
  instanceId: string;
  kind: "permission_request";
  /** The launch that raised this request; daemon replays retain it verbatim. */
  processGeneration?: string;
  /** When the hub first parked this ask, ms epoch. Absent only on the daemon-to-hub leg. */
  raisedAt?: number;
  requestId: string;
  /** `tool` for a permission, `question` for an AskUserQuestion-shaped prompt. */
  requestKind?: "tool" | "question";
  suggestions?: PermissionUpdate[];
  /**
   * A project lead's question: the thread it was asked in (the one whose
   * message woke that turn, else the project's newest). Its answer lands in
   * that thread as your message.
   */
  threadId?: string;
  toolName: string;
  /** The tool call the ask gates, as its transcript message names it. */
  toolUseId?: string;
}

export interface PermissionSettledFrame {
  instanceId: string;
  /** An ask is over, whoever settled it; every client removes its parked card. */
  kind: "permission_settled";
  outcome?: "answered" | "cancelled";
  processGeneration?: string;
  requestId: string;
}

export interface UsageFrame {
  /** Hub-originated: every machine's latest limits and the fleet's spend. */
  kind: "usage";
  limits: UsageLimitsReading[];
  spend: UsageSpend;
}

export interface StoppedFrame {
  discard: boolean;
  /** Positive server-session receipt; absent receipts cannot confirm OpenCode. */
  ended?: {
    harness: HarnessKind;
    sessionId?: string;
    resourcesClosed: true;
    reason?: string;
  };
  instanceId: string;
  /** Authoritative daemon confirmation, never merely delivery of a stop request. */
  kind: "stopped";
}

export interface AsleepFrame {
  instanceId: string;
  /** The daemon stopped an at-rest session's processes; its next message wakes it. */
  kind: "asleep";
}

export interface RecoveryUnavailableFrame {
  instanceId: string;
  /** Recovery found no live handle; stored conversations remain resumable. */
  kind: "recovery_unavailable";
  reason: string;
}

export interface ControlResultFrame {
  error?: string;
  instanceId?: string;
  /** No `instanceId` when the call it answers was machine-scoped. */
  kind: "control_result";
  ok: boolean;
  requestId: string;
  result?: unknown;
}

export interface ErrorFrame {
  /** Internal end-reconciliation evidence; never relayed to a client. */
  endReason?: string;
  instanceId?: string;
  /** Hub-originated routing failures (e.g. target machine offline). */
  kind: "error";
  message: string;
  requestId?: string;
  verb?: Verb;
}

export interface SessionAddressFrame {
  instanceId: string;
  kind: "session_address";
  processGeneration: string;
  sessionId: string;
}

export interface ScratchWorktreeFrame {
  instanceId: string;
  kind: "scratch_worktree";
  processGeneration: string;
  worktree: import("./index").ScratchWorktree;
}

export interface UserMessageFrame {
  /** Absolute paths of images on the session's machine to send alongside. */
  attachments?: string[];
  instanceId: string;
  /** Daemon-originated: a session pushing text straight to the owner's Telegram. */
  kind: "user_message";
  text: string;
}

export interface PulseFrame {
  instanceId: string;
  /** Daemon-originated: a session's coarse now-state, throttled to about once per second. */
  kind: "pulse";
  pulse: SessionPulse;
}

export interface WorkItemFrame {
  instanceId: string;
  item: WorkItemSummary;
  /** Hub-originated: a delegate work item's state; `instanceId` is its parent's. */
  kind: "work_item";
}

/**
 * What made the hub offer to make a plain session a project (project-offers.ts);
 * `caw` when nothing did: Caw proposed it in conversation and you said yes.
 */
export type ProjectOfferReason = "delegates" | "days" | "plan" | "repo" | "caw";

/** "Make this a project": offered once, on a plain session that outgrew itself. */
export interface ProjectOfferSummary {
  instanceId: string;
  /** One sentence naming why, ending in the question. */
  line: string;
  offeredAt: number;
  reason: ProjectOfferReason;
}

export interface ProjectOfferFrame {
  instanceId: string;
  /** Hub-originated: the session's standing offer, or null once it was answered. */
  kind: "project_offer";
  offer: ProjectOfferSummary | null;
}

export interface ThreadUpsertFrame {
  instanceId?: undefined;
  /** Hub-originated: a thread was started, or its last message or status changed. */
  kind: "thread.upsert";
  thread: ThreadSummary;
}

export interface ThreadMessageFrame {
  instanceId?: undefined;
  /** Hub-originated: a message was added to a thread. */
  kind: "thread.message";
  message: ThreadMessage;
  threadId: string;
}

export interface DelegateEventFrame {
  event: DelegateEvent;
  instanceId: string;
  /** Hub-originated: delegate traffic; `instanceId` is the delegate's. */
  kind: "delegate_event";
}

export interface SupervisorEventFrame {
  event: SupervisorEvent;
  instanceId: string;
  /** Hub-originated: a supervisor verdict the moment it is logged. */
  kind: "supervisor_event";
}

export interface SupervisorStatusFrame {
  instanceId: string;
  /** Hub-originated, never stored: the supervisor began evaluating. */
  kind: "supervisor_status";
  status: SupervisorStatusSignal;
}
