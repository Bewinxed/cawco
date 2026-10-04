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
  DelegateEvent,
  InstanceRow,
  PreviewSource,
  SessionPulse,
  SupervisorEvent,
  SupervisorStatusSignal,
  Verb,
  WorkItemSummary,
} from "./index";
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
  instances: InstanceRow[];
  /** Hub-originated: every session it still lists, pushed whenever a row moves. */
  kind: "instances";
  previews?: PreviewFrame[];
}

export interface InstancesDeltaFrame {
  agents: AgentRow[];
  /** Hub-originated: changes since the last publish, with the same small board metadata. */
  kind: "instances_delta";
  previews?: PreviewFrame[];
  removed: string[];
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
  instanceId?: string;
  /** Hub-originated routing failures (e.g. target machine offline). */
  kind: "error";
  message: string;
  requestId?: string;
  verb?: Verb;
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
