import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentRow,
  BuildInfo,
  ClaudeLimits,
  DelegateAskStatus,
  DelegateEvent,
  DelegateEventKind,
  DelegateEventPayload,
  FleetAgent,
  FleetConfig,
  FleetHook,
  FleetMarketplace,
  FleetMcpServer,
  FleetPlugin,
  FleetScope,
  FleetSkillMeta,
  FleetSyncReport,
  HarnessReport,
  HookEvent,
  HookHandler,
  OpenCodeGoLimits,
  Rule,
  RuleState,
  RuleStats,
  SessionEffort,
  SessionEndIntent,
  SessionTooling,
  SkillFile,
  SupervisorEvent,
  ToolPolicy,
  ToolStatus,
  UsageBucket,
  UsageGroupBy,
  UsageHarness,
  UsageSummary,
  UsageSummaryRow,
  UsageTotals,
} from "@cawco/core";
import {
  CLAUDE_CONVERSATION_GONE,
  REMOVED_MACHINE,
  RESTART_LOST,
  resolveRates,
} from "@cawco/core";
import { ownIdentity } from "@cawco/core/process-identity";
import { materializeTree, standalone } from "@cawco/core/runtime";
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Context, Effect, Layer } from "effect";
import { DB_PATH } from "../config";
import { workflowSkill } from "../workflows/skills";
import {
  agents,
  apnsCredentials,
  capabilityUsageDaily,
  claudeContextWindows,
  completedTurns,
  continuations,
  credentials,
  delegateEvents,
  fleetAgents,
  fleetHookHistory,
  fleetHooks,
  fleetMcpOauth,
  fleetMemory,
  fleetMemoryDocs,
  fleetMemoryHistory,
  instances,
  marketplaces,
  mcpServers,
  openrouterConnection,
  type PlaceKind,
  plugins,
  projectPlaces,
  projects,
  projectTasks,
  pushDevices,
  queuedTaskStarts,
  queuedWorkItems,
  ruleState,
  rules,
  sentMessages,
  sessionIdentities,
  skills,
  supervisorConfig,
  supervisorEvents,
  type Tracker,
  tools,
  usageBuckets,
  usageLimitHistory,
  usageLimits,
  workflowAttempts,
  workflowNotices,
  workflowRunLog,
  workflowRuns,
  workflowSteps,
  workflows,
  workItems,
  workspaceCreates,
  workspaces,
} from "./schema";

/** Ids looked up per statement (bound twice), well under SQLite's variable limit. */
const SENDS_FOR_BATCH = 500;
const END_PRIORITY: Record<SessionEndIntent, number> = {
  stop: 0,
  discard: 1,
  delete: 2,
  "delete-transcript": 3,
};

/**
 * Defined only in the published package's bundle (scripts/build-binary.ts),
 * where this module is `cli.js` and the migrations sit beside it.
 */
declare const __CAWCO_RELEASE__: boolean | undefined;

/** Shipped with the package so a fresh boot never needs a drizzle-kit step. */
const MIGRATIONS_DIR = standalone
  ? materializeTree("drizzle")
  : Bun.fileURLToPath(
      new URL(
        typeof __CAWCO_RELEASE__ === "boolean" ? "./drizzle" : "../../drizzle",
        import.meta.url
      )
    );

export type InstanceKind = (typeof instances.$inferSelect)["kind"];
export type PublicInstanceRow = Omit<
  typeof instances.$inferSelect,
  | "endIntent"
  | "endConfirmedAt"
  | "addressProtocol"
  | "endReason"
  | "addressRequired"
  | "machineRemoved"
  | "scratchWorktree"
  | "endRetryAt"
  | "endAttempts"
  | "owedSpawn"
  | "owedAt"
>;
export type BoardInstanceRow = Omit<PublicInstanceRow, "tooling">;
export type PlaceRow = typeof projectPlaces.$inferSelect;
/**
 * A project as every client reads it: its row, whose `machineId` and `cwd`
 * are its primary place, and every place it has, the primary first.
 */
export type ProjectRow = typeof projects.$inferSelect & { places: PlaceRow[] };
/** One task file as a project's task index holds it (tasks.ts). */
export type TaskIndexRow = typeof projectTasks.$inferSelect;
/** The stored APNs credentials (push.ts); the private key never leaves the hub. */
export type ApnsCredentialsRow = typeof apnsCredentials.$inferSelect;
/** A device the iOS app registered for pushes. */
export type PushDeviceRow = typeof pushDevices.$inferSelect;
export type ContinuationRow = typeof continuations.$inferSelect;
export type WorkflowRow = typeof workflows.$inferSelect;
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
export type WorkflowStepRow = typeof workflowSteps.$inferSelect;
export type WorkflowAttemptRow = typeof workflowAttempts.$inferSelect;
export type WorkflowLogRow = typeof workflowRunLog.$inferSelect;
export type WorkflowNoticeRow = typeof workflowNotices.$inferSelect;
export type WorkItemRow = typeof workItems.$inferSelect;
export type QueuedTaskStartRow = typeof queuedTaskStarts.$inferSelect;
export type QueuedWorkItemRow = typeof queuedWorkItems.$inferSelect;
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type SessionIdentityRow = typeof sessionIdentities.$inferSelect;

/**
 * A session the returning daemon no longer carries. `resumes` is the whole
 * question: the SDK still has its conversation, so the process can be started
 * again on top of it rather than the work being lost with the restart.
 */
export interface SettledInstance {
  resumes: boolean;
  row: typeof instances.$inferSelect;
}

/** How long a session that stopped moving stays in the listings the rails read. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

/** 30 days — long enough to cover several weekly windows, short enough that the table stays small. */
const LIMIT_HISTORY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** The span of a usage bucket stored before quarters (`usage_buckets.span_ms`). */
const HOUR_MS = 60 * 60 * 1000;

export type AgentAuth = (typeof agents.$inferSelect)["auth"];

export type SentMessageRow = typeof sentMessages.$inferSelect;

/** One superseded version of the fleet's memory, as a listing reads it. */
export interface MemoryVersion {
  bytes: number;
  createdAt: Date;
  hash: string;
  id: number;
  /** Which document of the set it was a version of; absent is the main one. */
  path?: string;
  source: string;
}

/**
 * One document the main memory links, as the dashboard reads it. Like a
 * subagent's file and unlike a skill's, the content rides the listing: a
 * document is a page of markdown, and an editor that has to fetch each one
 * again is a round trip for nothing.
 */
export interface MemoryDocRow {
  content: string;
  hash: string;
  path: string;
  updatedAt: Date;
}

/** One superseded version of one hook, as a listing reads it — without the material. */
export interface HookVersion {
  createdAt: Date;
  hash: string;
  hookId: string;
  id: number;
  name: string;
  /** `fleet` for every version today — a hook has never been edited from a machine. */
  source: string;
}

/** A superseded version in full: what restoring it would actually write back. */
export interface HookVersionMaterial {
  enabled: boolean;
  event: HookEvent;
  handler: HookHandler;
  matcher?: string;
  projectId?: string;
  scope?: FleetScope;
  script?: string;
}

/** A stored limit reading, one per machine (USAGE-SPEC.md §6). */
export type UsageLimitRow = typeof usageLimits.$inferSelect;

/** One point in a machine's limit-history series (burn rate, not just burn level). */
export type UsageLimitHistoryRow = typeof usageLimitHistory.$inferSelect;

export interface DbShape {
  readonly acknowledgeAddress: (id: string) => void;
  readonly acknowledgeSessionIdentity: (
    instanceId: string,
    hash: string
  ) => boolean;
  /** A machine's workspaces that still have their checkout. */
  readonly activeWorkspacesOn: (machineId: string) => WorkspaceRow[];
  /** Adds counted capability uses, summing into any row already there. */
  readonly addCapabilityUsage: (
    rows: {
      kind: "skill" | "tool" | "mcp";
      name: string;
      day: string;
      count: number;
    }[]
  ) => void;
  /**
   * Files a place of a project. One already there for that project, machine
   * and folder is answered as it is, with `added` false.
   */
  readonly addPlace: (place: {
    projectId: string;
    machineId: string;
    path: string;
    kind: PlaceKind;
  }) => { place: PlaceRow; added: boolean };
  /** A machine's last-known tool status by id; empty for one that never reported. */
  readonly agentAddressContract: (machineId: string) => boolean;
  readonly agentHarnesses: (machineId: string) => HarnessReport[] | undefined;
  readonly agentTools: (machineId: string) => Record<string, ToolStatus>;
  /** Records ownership before sending a create; a restart discards anything still unfiled. */
  readonly beginWorkspaceCreate: (id: string, machineId: string) => void;
  /** Whether nothing has been counted yet — the backfill's cue. */
  readonly capabilityUsageEmpty: () => boolean;
  /** Every usage row on or after `day` (`YYYY-MM-DD`). */
  readonly capabilityUsageSince: (
    day: string
  ) => (typeof capabilityUsageDaily.$inferSelect)[];
  /** Claims one harness completion before any turn-end side effect. */
  readonly claimCompletedTurn: (
    instanceId: string,
    resultId: string,
    completedAt: string | undefined,
    recovered: boolean
  ) => boolean;
  /** Every claude model's last observed context window, by model id. */
  readonly claudeContextWindows: () => Record<string, number>;
  readonly clearEndConfirmation: (id: string) => void;
  readonly clearFleetMemory: () => void;
  /** Forget the OpenRouter key. */
  readonly clearOpenRouterConnection: () => void;
  /** A receipt for the current row's decision; deletes are finalized here. */
  readonly confirmInstanceEnd: (id: string, reason?: string) => void;
  readonly continuationRow: (id: string) => ContinuationRow | undefined;
  /** Every continuation job, oldest first. */
  readonly continuationRows: () => ContinuationRow[];
  /** A project and its first place, a checkout at `machineId`/`cwd`. */
  readonly createProject: (project: {
    id: string;
    machineId: string;
    name: string;
    cwd: string;
    remote: string | null;
  }) => ProjectRow;
  /** Files a work item as the hub accepted it. */
  readonly createWorkItem: (item: typeof workItems.$inferInsert) => WorkItemRow;
  /** Files a workspace whose checkout its machine has just made. */
  readonly createWorkspace: (
    workspace: typeof workspaces.$inferInsert
  ) => WorkspaceRow;
  /** The ask a `requestId` opened, so its answer is filed under the same parent. */
  readonly delegateAsk: (requestId: string) => DelegateEvent | undefined;
  readonly deleteContinuation: (id: string) => void;
  readonly deleteFleetAgent: (name: string) => void;
  readonly deleteFleetHook: (id: string) => void;
  readonly deleteFleetMemoryDoc: (path: string) => void;
  /**
   * Forgets a machine's entry, its places and its current limit reading;
   * hidden session ownership remains until its stored delete decisions are
   * confirmed by that machine. Spend and limit history stay, because they
   * happened. A project whose primary place was there moves to its next
   * checkout (or hub folder); one with no such place left goes. Answers how
   * many sessions and projects went, for the confirm's receipt.
   */
  readonly deleteMachine: (machineId: string) => {
    instanceIds: string[];
    projects: number;
  };
  readonly deleteMarketplace: (name: string) => void;
  readonly deleteMcpOauth: (name: string) => void;
  readonly deleteMcpServer: (name: string) => void;
  readonly deletePlugin: (id: string) => void;
  /** The project and its places; the sessions started from it stay, unattached. */
  readonly deleteProject: (id: string) => void;
  /** Removes the rule and every session's standing with it. */
  readonly deleteRule: (id: string) => void;
  readonly deleteSkill: (name: string) => void;
  readonly deleteWorkflow: (id: string) => void;
  /** A kept supervisor notice that has now been sent. */
  readonly deleteWorkflowNotice: (id: number) => void;
  /** Forgets a task's queued start, if it had one. */
  readonly dropQueuedTaskStart: (projectId: string, taskId: string) => void;
  readonly dropQueuedWorkItem: (id: string) => void;
  /** Forgets the index rows of task files that are gone. */
  readonly dropTaskIndex: (projectId: string, paths: string[]) => void;
  /** Persist the decision before its reconciler may send anything. */
  readonly endInstance: (
    id: string,
    intent: SessionEndIntent
  ) => typeof instances.$inferSelect | undefined;
  readonly expirePendingSessionIdentities: (machineId: string) => void;
  /** The agent reported the session dead: what killed it, kept for late readers. */
  readonly failInstance: (id: string, error: string) => void;
  /** Transcript deletion follows confirmed process exit, never precedes it. */
  readonly finishTranscriptDelete: (id: string) => void;
  readonly finishWorkspaceCreate: (id: string) => void;
  /** The whole desired fleet state (NEW.md §11) — what a machine is sent to converge on. */
  /**
   * The fleet's desired state. Given a machine, the content-carrying rows it
   * already reported holding are sent WITHOUT their files: the config goes to
   * every machine on every fleet change, and those bytes are megabytes the
   * machine would compare to what it has and then not write.
   */
  readonly fleetConfig: (machineId?: string) => FleetConfig;
  readonly fleetHookVersion: (
    id: number
  ) => (HookVersion & HookVersionMaterial) | undefined;
  readonly fleetMemoryVersion: (
    id: number
  ) => (MemoryVersion & { content: string }) | undefined;
  readonly getCredential: (id: string) => Record<string, unknown> | undefined;
  readonly getFleetHook: (id: string) => FleetHook | undefined;
  /** The fleet's user-scope CLAUDE.md, or undefined while the fleet keeps none. */
  readonly getFleetMemory: () =>
    | { content: string; hash: string; updatedAt: Date }
    | undefined;
  readonly getFleetMemoryDoc: (path: string) => MemoryDocRow | undefined;
  /**
   * The named rows, however old they are — the listing's staleness cut-off does
   * not apply here. A conversation the reader still has a tab open on is a row
   * they are entitled to an answer about, and the answer (what it is called) was
   * written down long before it aged out of the board. Discarded rows stay gone:
   * those were thrown away on purpose. Raw, so a caller can tell a given title
   * from a derived one.
   */
  readonly getInstancesByIds: (ids: string[]) => PublicInstanceRow[];
  readonly getMcpOauth: (
    name: string
  ) => typeof fleetMcpOauth.$inferSelect | undefined;
  readonly getMcpServer: (
    name: string
  ) => typeof mcpServers.$inferSelect | undefined;
  /** The stored OpenRouter key and when it was connected, or undefined while not connected. */
  readonly getOpenRouterConnection: () =>
    | { apiKey: string; connectedAt: Date; suggestWhileTyping: boolean }
    | undefined;
  /** One rule, or nothing when it has been deleted out from under a caller. */
  readonly getRule: (id: string) => Rule | undefined;
  /** The supervisor's own configuration, or undefined while none is stored. */
  readonly getSupervisorConfig: () =>
    | {
        enabled: boolean;
        baseUrl: string | null;
        model: string | null;
        apiKey: string | null;
        deniedTools: string[] | null;
        updatedAt: Date;
      }
    | undefined;
  readonly getWorkflow: (id: string) => WorkflowRow | undefined;
  /** One call's row in a run's log, by its effect sequence. */
  readonly getWorkflowLog: (
    runId: string,
    seq: number
  ) => WorkflowLogRow | undefined;
  readonly getWorkflowRun: (id: string) => WorkflowRunRow | undefined;
  readonly getWorkflowStep: (id: string) => WorkflowStepRow | undefined;
  /** A parent's items in one group that no combined report has carried yet, oldest first. */
  readonly groupWorkItems: (
    parentInstanceId: string,
    group: string
  ) => WorkItemRow[];
  readonly hiddenSession: (id: string) => boolean;
  readonly insertContinuation: (
    row: Omit<ContinuationRow, "createdAt" | "updatedAt">
  ) => ContinuationRow;
  /** Look up a single non-discarded instance by its harness sessionId. */
  readonly instanceBySessionId: (
    sessionId: string
  ) => PublicInstanceRow | undefined;
  /** Known prompt writes invalidate every Claude cache on the owning machine. */
  readonly invalidateClaudeCaches: (
    machineId: string,
    reason: string,
    at: number
  ) => void;
  /** Keys a send to the id its harness stores it under. */
  readonly linkSend: (uuid: string, harnessId: string) => void;
  /**
   * Every machine, in the shape everything downstream reads them: the `fleet`
   * column is null until a machine has synced once, and `AgentRow` says absent.
   */
  readonly listAgents: () => AgentRow[];
  /** Board rows never fetch/decode the per-session tooling document. */
  readonly listBoardInstances: () => BoardInstanceRow[];
  /** Oldest first: what one delegate did, or what every delegate of one parent did. */
  readonly listDelegateEvents: (filter: {
    parent?: string;
    instance?: string;
  }) => DelegateEvent[];
  /**
   * Every subagent the fleet keeps, file and all: a definition is a page of
   * markdown, so the listing is what the editor is seeded from.
   */
  readonly listFleetAgents: () => FleetAgent[];
  /**
   * Newest first, without the material: one hook's history, or — with no id —
   * every hook's, for a fleet-wide undo panel.
   */
  readonly listFleetHookHistory: (hookId?: string) => HookVersion[];
  /** Every hook the fleet keeps, by name — what the editor lists and seeds from. */
  readonly listFleetHooks: () => FleetHook[];
  /** Every document the main memory links, by path — the set, in one read. */
  readonly listFleetMemoryDocs: () => MemoryDocRow[];
  /**
   * Newest first, without the content: a list should not weigh what it lists.
   * One document's history, or the main file's when no path is named — the two
   * are never mixed, because the panel asks about one document at a time.
   */
  readonly listFleetMemoryHistory: (path?: string) => MemoryVersion[];
  readonly listInstances: () => PublicInstanceRow[];
  /**
   * Every plugin row without its files, `error` and all. What the DASHBOARD
   * reads: {@link fleetConfig} answers the machines and deliberately carries
   * neither the bookkeeping nor the failure, so a plugin the hub could not
   * fetch was until now a row nothing on the page could tell apart from one
   * that resolved.
   */
  readonly listPlugins: () => FleetPlugin[];
  readonly listProjects: () => ProjectRow[];
  /** Every rule, newest first — what the engine reloads and the editor lists. */
  readonly listRules: () => Rule[];
  /** Every skill row without its files — a catalog read should not weigh megabytes. */
  readonly listSkills: () => FleetSkillMeta[];
  /** Newest first; optionally filtered to one session; default limit 100. */
  readonly listSupervisorEvents: (filter: {
    instanceId?: string;
    limit?: number;
  }) => SupervisorEvent[];
  /** The fleet's tool policy (NEW.md §10) — only the tools somebody has ruled on. */
  readonly listToolPolicies: () => ToolPolicy[];
  /** Every machine's latest limit reading. */
  readonly listUsageLimits: () => UsageLimitRow[];
  readonly listWorkflowAttempts: (stepId: string) => WorkflowAttemptRow[];
  /** A run's log, in effect order. */
  readonly listWorkflowLog: (runId: string) => WorkflowLogRow[];
  /** Every supervisor notice still waiting to be sent, oldest first. */
  readonly listWorkflowNotices: () => WorkflowNoticeRow[];
  readonly listWorkflowRuns: (workflowId?: string) => WorkflowRunRow[];
  readonly listWorkflowSteps: (runId: string) => WorkflowStepRow[];
  readonly listWorkflows: () => WorkflowRow[];
  /** Every work item still `starting`/`running`, fleet-wide. */
  readonly liveWorkItems: () => WorkItemRow[];
  /** The work items a session delegated that are still `starting`/`running`. */
  readonly liveWorkItemsOf: (parentInstanceId: string) => WorkItemRow[];
  readonly markAgentOffline: (machineId: string) => void;
  /**
   * Every row back to `offline`, for the one moment it is unconditionally true:
   * hub startup. The `status` column only ever goes to `offline` from the socket
   * close handler, and a hub that died — crashed, was restarted, was upgraded —
   * ran no close handlers, so every machine it was holding is left claiming
   * `online` in a database the new process has never spoken to. This process
   * holds no sockets until a daemon registers, so on the first line of its life
   * the honest value for every row is `offline`; presence is re-earned by a
   * register, not inherited from a previous life.
   *
   * `lastSeenAt` is deliberately NOT touched: when the machine was last heard
   * from is history, and history survives a restart. Only reachability is reset.
   */
  readonly markAllAgentsOffline: () => void;
  /**
   * The daemon has spoken about one session — its `init` frame naming the SDK
   * conversation. That is first-hand word that a process exists, so a row still
   * at `starting` (or demoted while the machine was unreachable) is promoted
   * without waiting up to a beat for the heartbeat to say the same thing.
   * Returns whether the row moved.
   */
  readonly markInstanceLive: (id: string) => boolean;
  /**
   * The owner looked at these sessions and runs (a tab in front) or archived
   * them off Finished, at `at`; a null `at` clears the mark (unarchive), which
   * every reader counts as never seen. `updatedAt` stays: being looked at is not
   * the session moving. Returns the rows it changed, to publish.
   */
  readonly markSeen: (
    instanceIds: string[],
    runIds: string[],
    at: Date | null
  ) => {
    instances: (typeof instances.$inferSelect)[];
    runs: WorkflowRunRow[];
  };
  /** A whole report: every id it names is replaced, every other cell survives. */
  readonly mergeAgentTools: (machineId: string, statuses: ToolStatus[]) => void;
  /**
   * Gives the session its name. The owner's always lands; the session's own
   * (`set_title`) is refused once the owner has named it, and the answer
   * carries the owner's name. Undefined when there is no such session.
   */
  readonly nameInstance: (
    id: string,
    title: string,
    by: "owner" | "agent"
  ) =>
    | { named: true; row: PublicInstanceRow }
    | { named: false; row: PublicInstanceRow }
    | undefined;
  /** Records the window a claude turn reported for its model. */
  readonly noteAgentAddressContract: (
    machineId: string,
    supported: boolean
  ) => void;
  readonly noteClaudeContextWindow: (
    model: string,
    contextWindow: number
  ) => void;
  /**
   * The name the session's first user message gives it, for a row nobody named.
   * Write-once and never over a given title: a spawn's headline, or a custom
   * title arriving later, always wins. Returns whether it took, so the caller
   * only re-publishes when something actually moved.
   */
  readonly noteDerivedTitle: (id: string, derivedTitle: string) => boolean;
  readonly noteEndFailure: (id: string, error: string) => void;
  readonly noteEndReason: (id: string, reason: string) => void;
  /**
   * The effort the session's agent read back from its harness (`EFFORT_READ`).
   * Returns whether the row moved, so a reading repeated at every turn's end
   * does not re-publish the board.
   */
  readonly noteInstanceEffort: (id: string, effort: SessionEffort) => boolean;
  /**
   * The SDK session an `init` frame named, so the row can be read back from —
   * with the directory it really opened in, which is the agent's word on where
   * the spawn's `cwd` resolved to, and the MCP servers and tools it announced
   * when it announced any.
   */
  readonly noteInstanceSession: (
    id: string,
    sessionId: string,
    cwd?: string,
    harness?: string,
    tooling?: SessionTooling
  ) => void;
  /**
   * Records a fire and returns the session's new standing. `pending` is set
   * when the rule repeats; `fireCount` is what the ceiling counts, and only
   * {@link DbShape.rearmRules} resets it.
   */
  readonly noteRuleFire: (
    ruleId: string,
    instanceId: string,
    repeat: boolean
  ) => RuleState;
  readonly openInstance: (instance: {
    addressProtocol?: boolean;
    id: string;
    machineId: string;
    cwd: string;
    sessionId?: string;
    harness?: string;
    projectId?: string;
    parentInstanceId?: string;
    parentToolUseId?: string;
    /** What the spawn said the session is for; a row without one keeps whatever it had. */
    title?: string;
    kind: InstanceKind;
    /** The settled spawn mode; null only when the harness reports no modes. */
    permissionMode: string | null;
    model?: string;
    /** `false` makes the row a leaf delegate; absent leaves the column alone. */
    canDelegate?: boolean;
    workflowRunId?: string;
    workflowStepId?: string;
    /** The work item the session runs; set once, at its spawn. */
    workItemId?: string;
  }) => void;
  /** What a machine is owed, in the order it was asked for. */
  readonly owedSpawns: (
    machineId: string
  ) => { envelope: string; id: string }[];
  /**
   * The returning daemon's word on its machine: `liveIds` are the sessions it
   * still carries, `resumable` the SDK sessions it could pick back up. A daemon
   * that could not read its catalog names none, and every row it left behind
   * keeps the benefit of the doubt.
   */
  /**
   * Returns what it settled, so the caller can drop their parked questions —
   * and, for the ones whose conversation survived and are recent enough to be
   * worth reviving, put them back (the horizon and cap live in `server.ts`;
   * this writes every orphan to its resting state and lets the caller choose
   * which of them to restart). The rows come back as they were *before* the
   * settle, so `updatedAt` on them still says when the session last moved
   * rather than when this bookkeeping ran.
   */
  /** Keeps a start the machine could not be sent yet, on the row already written for it. */
  readonly oweSpawn: (id: string, envelope: string, at: number) => void;
  /**
   * The fields a dashboard may move on a live row: "Keep" — a side quest that
   * earned its place stops being treated as scratch — and the model and
   * permission mode the session confirmed (its effort is the agent's reading,
   * {@link DbShape.noteInstanceEffort}). Also where a
   * delegate's session takes on a follow-up: its new work item, and the
   * session that delegated it.
   */
  readonly ownedInstance: (
    id: string,
    machineId?: string
  ) => typeof instances.$inferSelect | undefined;
  readonly patchInstance: (
    id: string,
    patch: {
      kind?: InstanceKind;
      permissionMode?: string;
      model?: string;
      workItemId?: string;
      parentInstanceId?: string;
    }
  ) => PublicInstanceRow | undefined;
  /** A project with its places, or undefined for an id the hub does not hold. */
  readonly project: (id: string) => ProjectRow | undefined;
  /**
   * Every work item that is an attempt at one of the project's tasks, newest
   * first (dispatch.ts).
   */
  readonly projectAttempts: (projectId: string) => WorkItemRow[];
  /** The oldest project whose checkouts are of `remote` (normalised). */
  readonly projectByRemote: (remote: string) => ProjectRow | undefined;
  /**
   * Projects whose remote is not known yet, each with a checkout on
   * `machineId` to read it from.
   */
  readonly projectsWithoutRemote: (
    machineId: string
  ) => { projectId: string; path: string }[];
  /** The iOS app's pushes (push.ts): credentials, one row, and the devices that registered. */
  readonly push: {
    readonly credentials: () => ApnsCredentialsRow | undefined;
    readonly setCredentials: (
      row: Omit<ApnsCredentialsRow, "id" | "savedAt">
    ) => void;
    readonly clearCredentials: () => void;
    readonly devices: () => PushDeviceRow[];
    /** Registers or refreshes a device; a refresh keeps its quiet setting unless one is given. */
    readonly putDevice: (
      device: Pick<
        PushDeviceRow,
        "environment" | "name" | "platform" | "token"
      > & { quiet?: boolean }
    ) => PushDeviceRow;
    /** False when no device has that token. */
    readonly dropDevice: (token: string) => boolean;
    readonly setQuiet: (token: string, quiet: boolean) => boolean;
    /** What APNs said to the last push for a device: taken (no error) or refused with a reason. */
    readonly noteResult: (token: string, error: string | null) => void;
  };
  readonly putCredential: (id: string, blob: Record<string, unknown>) => void;
  /** Upsert of one definition's file; the hash and the size are read off it. */
  readonly putFleetAgent: (agent: {
    name: string;
    content: string;
  }) => FleetAgent;
  /**
   * Upsert by id. The caller mints the id, like a rule's; the hash is not
   * taken from the caller but recomputed here, over the material a machine
   * actually compares before writing — so a hash can never be sent stale.
   */
  readonly putFleetHook: (hook: Omit<FleetHook, "hash">) => FleetHook;
  /** Upsert of one document; the hash is read off the content, as everywhere. */
  readonly putFleetMemoryDoc: (doc: {
    path: string;
    content: string;
  }) => MemoryDocRow;
  readonly putMarketplace: (marketplace: FleetMarketplace) => FleetMarketplace;
  readonly putMcpOauth: (row: typeof fleetMcpOauth.$inferInsert) => void;
  readonly putMcpServer: (server: {
    name: string;
    config: FleetMcpServer["config"];
    enabled?: boolean;
  }) => FleetMcpServer;
  readonly putPlugin: (plugin: {
    id: string;
    enabled?: boolean;
  }) => FleetPlugin;
  /**
   * What one plugin's resolve came to: the files the hub fetched, or the
   * sentence it failed with. The mirror of {@link putSkill}, and the write that
   * turns a plugin from a name every machine must fetch for itself into bytes
   * the fleet carries.
   */
  readonly putPluginPayload: (payload: {
    id: string;
    hash?: string;
    bytes?: number;
    error?: string;
    files?: SkillFile[];
  }) => void;
  /** Upsert by id. The caller mints the id; this never invents one. */
  readonly putRule: (rule: Rule) => Rule;
  /** Upsert of a resolve's outcome: the files it read, or the sentence it failed with. */
  readonly putSkill: (skill: {
    name: string;
    source: string;
    enabled?: boolean;
    hash?: string;
    bytes?: number;
    error?: string;
    files?: SkillFile[];
  }) => FleetSkillMeta;
  /** Upserts the supervisor's configuration (single-row table). */
  readonly putSupervisorConfig: (config: {
    enabled?: boolean;
    baseUrl?: string | null;
    model?: string | null;
    apiKey?: string | null;
    deniedTools?: string[] | null;
  }) => void;
  /** Files or refreshes rows of a project's task index, each by its file's path. */
  readonly putTaskIndex: (rows: TaskIndexRow[]) => void;
  /** Upsert; a patch names only what it changes and the rest stays as it was. */
  readonly putToolPolicy: (
    id: string,
    patch: { required?: boolean; pinnedVersion?: string | null }
  ) => ToolPolicy;
  /**
   * Stores a machine's usage buckets (USAGE-SPEC.md §6.2). Idempotent: the
   * bucket's id is its (machine, harness, session, model, hour) key, and an
   * upsert sets absolute totals — a re-report of the same bucket overwrites,
   * never accumulates.
   */
  readonly putUsageBuckets: (machineId: string, buckets: UsageBucket[]) => void;
  /** Stores the machine's latest limit reading; one row per machine. */
  readonly putUsageLimits: (
    machineId: string,
    limits: ClaudeLimits,
    openCodeGo: OpenCodeGoLimits | null
  ) => void;
  readonly putWorkflow: (row: typeof workflows.$inferInsert) => WorkflowRow;
  /** Records a call in its run's log, or completes the row it already has. */
  readonly putWorkflowLog: (row: typeof workflowRunLog.$inferInsert) => void;
  /** Every hook start waiting for a slot in the project, oldest first (dispatch.ts). */
  readonly queuedTaskStarts: (projectId: string) => QueuedTaskStartRow[];
  /** `delegate` calls waiting for files a live item owns, oldest first. */
  readonly queuedWorkItems: () => QueuedWorkItemRow[];
  /** Queues a hook's start, or replaces the one its task already had. */
  readonly queueTaskStart: (
    row: Omit<QueuedTaskStartRow, "queuedAt" | "why"> & {
      why?: QueuedTaskStartRow["why"];
    }
  ) => QueuedTaskStartRow;
  /** A supervisor notice kept until its supervisor is live. */
  readonly queueWorkflowNotice: (
    row: typeof workflowNotices.$inferInsert
  ) => void;
  readonly queueWorkItem: (
    row: Omit<QueuedWorkItemRow, "queuedAt">
  ) => QueuedWorkItemRow;
  /**
   * The daemon's own word, arriving every 15s: `liveIds` is exactly what its
   * supervisor is carrying right now (`HeartbeatPayload.instances`).
   *
   * This is the write that makes `running` mean something. Before it, `running`
   * was written optimistically at spawn and never re-checked, so the column
   * accumulated one row per session the hub had *ever* started on that machine
   * — 178 of them against 42 live processes. Now the beat is the only thing
   * that can put a row into `running`, and the same beat's silence is what
   * takes it out again:
   *
   * - listed → `running` (from `starting`, `unknown`, `sleeping` or `error`;
   *   a `stopped` or `discarded` row is a decision, not a guess, and stays).
   * - not listed, currently `running` → the process is gone: `sleeping` when a
   *   `sessionId` survives to resume from, `error` + {@link RESTART_LOST} when
   *   nothing does.
   * - not listed, currently `starting` → the same, but only after `graceMs`,
   *   because a spawn the hub issued moments ago has not necessarily reached
   *   the supervisor before the beat that was already in flight.
   *
   * Nothing here respawns anything: reconciliation records what the machine
   * says, and recovery is register's job (see {@link settleInstances}).
   * Returns what actually moved, so the caller only republishes on news.
   */
  /**
   * A turn of this session ended: every rule pending on it, except those the
   * turn matched again (`matched`), re-arms with its fire count reset.
   */
  readonly rearmRules: (instanceId: string, matched: string[]) => void;
  readonly reconcileHeartbeat: (
    machineId: string,
    liveIds: string[],
    graceMs: number
  ) => { promoted: string[]; settled: (typeof instances.$inferSelect)[] };
  /**
   * Marks every running instance on the machine that `liveIds` does not name as
   * unknown: those belong to a daemon that is gone, and the hub cannot tell
   * whether they outlived it. An empty list means the machine runs nothing.
   */
  readonly reconcileInstances: (machineId: string, liveIds: string[]) => void;
  /** Files one exchange between a delegate and its parent, and hands back the row. */
  readonly recordDelegateEvent: (event: {
    instanceId: string;
    parentInstanceId: string;
    kind: DelegateEventKind;
    requestId?: string;
    toolName?: string;
    requestKind?: "question" | "tool";
    payload: DelegateEventPayload;
    status?: DelegateAskStatus;
  }) => DelegateEvent;
  readonly recordedTurns: (instanceId: string) => {
    hasTurns: boolean;
    lastTurnAt: string | null;
    unbounded: boolean;
  };
  /**
   * Keeps a version that is about to be replaced or destroyed — a save, an
   * edit, or a delete, the same three moments a memory document is kept at.
   */
  readonly recordFleetHook: (version: {
    hookId: string;
    name: string;
    enabled: boolean;
    event: HookEvent;
    matcher?: string;
    handler: HookHandler;
    script?: string;
    hash: string;
    scope?: FleetScope;
    projectId?: string;
    source: string;
  }) => void;
  /**
   * Keeps a version that is about to be replaced or destroyed. `source` is
   * `fleet` for the hub's own row and `machine:<machineId>` for a copy an
   * overwrite is taking off a machine; `path` names the document of the set it
   * belonged to, and its absence is the main CLAUDE.md.
   */
  readonly recordFleetMemory: (version: {
    content: string;
    hash: string;
    source: string;
    path?: string;
  }) => void;
  /** Files a send's record as the hub accepted it: pending, or failed at once. */
  readonly recordScratchWorktree: (
    id: string,
    worktree: import("@cawco/core").ScratchWorktree
  ) => void;
  readonly recordSend: (
    send: typeof sentMessages.$inferInsert
  ) => SentMessageRow;
  /** Files one supervisor evaluation result and prunes to newest 5,000 rows (plan: our choice). */
  readonly recordSupervisorEvent: (event: {
    instanceId: string;
    source: "rule" | "autopilot";
    ruleId?: string;
    verdict: "silent" | "reply" | "escalate" | "ask" | "error" | "skipped";
    message?: string;
    note?: string;
    model?: string;
    latencyMs?: number;
  }) => SupervisorEvent;
  /**
   * Removes one of a project's places. The primary place (the project's
   * `machineId`/`cwd`) is never removed here: forgetting the project is.
   */
  readonly removePlace: (
    projectId: string,
    placeId: string
  ) => "removed" | "primary" | "missing";
  /** A workspace's place, gone with the workspace when it is archived. */
  readonly removeWorkspacePlaces: (machineId: string, clone: string) => void;
  readonly restoreRemovedSessions: (
    machineId: string,
    held: string[],
    complete: boolean
  ) => void;
  /** Where a rule stands with a session; absent means it has never fired there. */
  readonly ruleStateFor: (
    ruleId: string,
    instanceId: string
  ) => RuleState | undefined;
  /**
   * Every session's standing with one rule, most recently active first.
   *
   * This is the only place the mechanism is visible to anybody. The session is
   * told nothing, so the reader has to be told everything: which sessions
   * tripped it, how often, and what each said it did about it.
   */
  readonly ruleStatesFor: (ruleId: string) => RuleState[];
  /** Per-rule totals for the list, aggregated in SQL rather than per row. */
  readonly ruleStats: () => RuleStats[];
  readonly runningDelegateCounts: () => Map<string, number>;
  /** One send's record, by its uuid. */
  readonly sendRecord: (uuid: string) => SentMessageRow | undefined;
  /**
   * The sends among these ids, matched by the send's uuid or by the id its
   * harness stored it under.
   */
  readonly sendsFor: (ids: string[]) => SentMessageRow[];
  /** A session's sends in these states, oldest accepted first. */
  readonly sendsIn: (
    instanceId: string,
    states: SentMessageRow["state"][]
  ) => SentMessageRow[];
  /** What a harness session has cost, in dollars, by the usage its machine reported. */
  readonly sessionCostUsd: (sessionId: string) => number;
  readonly sessionIdentity: (
    instanceId: string
  ) => SessionIdentityRow | undefined;
  readonly sessionIdentityByHash: (
    hash: string
  ) => SessionIdentityRow | undefined;
  readonly sessionIdentityError: (
    instanceId: string,
    error: string | null,
    rejectPending?: boolean
  ) => void;
  /** Unfiltered ownership, including hidden deletes and discarded rows. */
  readonly sessionOwnership: (
    machineId?: string
  ) => (typeof instances.$inferSelect)[];
  /** A machine's own account of what it came to, from the sync it just answered. */
  readonly setAgentFleet: (machineId: string, report: FleetSyncReport) => void;
  /** What each harness on the machine can do, as its daemon's report beat said. */
  readonly setAgentHarnesses: (
    machineId: string,
    harnesses: HarnessReport[]
  ) => void;
  readonly setAgentToolCell: (machineId: string, status: ToolStatus) => void;
  /** Stores the document and the hash the machines compare against. */
  readonly setFleetMemory: (content: string) => {
    content: string;
    hash: string;
    updatedAt: Date;
  };

  /** Sets (or clears) the autopilot configuration on a session. */
  readonly setInstanceAutopilot: (
    instanceId: string,
    value: { enabled: boolean; prompt: string; updatedAt: number } | null
  ) => void;
  readonly setMcpAuth: (
    name: string,
    mode: "direct" | "oauth",
    error?: string
  ) => void;
  /** Store (or replace) the OpenRouter key from a completed PKCE exchange. */
  readonly setOpenRouterConnection: (apiKey: string) => void;
  /** The project's dispatch settings: its lead, whether it dispatches, its caps. */
  readonly setProjectDispatch: (
    id: string,
    change: Partial<
      Pick<
        ProjectRow,
        | "budget"
        | "dispatch"
        | "lands"
        | "leadInstanceId"
        | "maxAttempts"
        | "reviewLimit"
      >
    >
  ) => void;
  /** The repository a project's checkouts are of, once a machine has read it. */
  readonly setProjectRemote: (id: string, remote: string) => void;
  /** Where the project's tasks live; tasks.ts refuses a tracker not built yet. */
  readonly setProjectTracker: (id: string, tracker: Tracker) => void;
  /** Turn composer suggestions on or off. Only meaningful while connected. */
  readonly setSuggestWhileTyping: (enabled: boolean) => void;
  /** Closes it. An ask this hub never recorded is nothing to close. */
  readonly settleDelegateAsk: (
    requestId: string,
    status: DelegateAskStatus
  ) => void;
  readonly settleInstances: (
    machineId: string,
    liveIds: string[],
    resumable?: string[],
    /**
     * When each of those conversations last changed, ms epoch by session id.
     * Written onto every non-live row it names, because it is the only source
     * in the fleet that knows when a sleeping session last *moved* rather than
     * when the hub last wrote something down about it.
     */
    resumableAt?: Record<string, number>
  ) => SettledInstance[];
  readonly settleRemovedSession: (id: string, present: boolean) => void;
  readonly settleUnavailableRecovery: (id: string) => boolean;
  /** Names of fleet skills installed at or after `since`. */
  readonly skillsInstalledSince: (since: Date) => string[];
  /**
   * Files a session its machine put to sleep: `sleeping`, from any state that
   * claims a process. False when the row claimed none, or has no conversation
   * to wake from.
   */
  readonly sleepInstance: (id: string) => boolean;
  readonly stageSessionIdentity: (instanceId: string, hash: string) => void;
  /**
   * The one-time reclassification a taxonomy change needs when the column is
   * plain text and there is no SQL migration to hang it on. Idempotent by
   * construction — both halves select on states they then leave — so running it
   * on every boot costs one no-op statement pair.
   *
   * - `running`/`starting` → `unknown`: this process holds no sockets on its
   *   first line, so it cannot vouch for any of it. Same argument as
   *   {@link markAllAgentsOffline}, and for the same reason: the read overlay
   *   would already answer `unknown`, but a column nobody has to remember to
   *   distrust is worth one write at startup.
   * - `error` whose `lastError` is the legacy resumable marker → `sleeping`,
   *   `lastError` cleared. Those rows never described a failure; they were a
   *   restart, filed under `error` because the taxonomy had nowhere else to put
   *   "no process, but resumable". `sleeping` is that place.
   *
   * The marker string is a parameter rather than an import so this file holds
   * no opinion about what a legacy error *said* — the caller passes core's
   * constant.
   */
  readonly sweepBootStatuses: (legacyResumableError: string) => {
    toUnknown: number;
    toSleeping: number;
  };
  readonly takeMcpAuthorization: (
    state: string
  ) => typeof fleetMcpOauth.$inferSelect | undefined;
  /** Takes one owed start off the books; true for exactly one caller. */
  readonly takeOwedSpawn: (id: string) => boolean;
  /** Every row of a project's task index, in id order. */
  readonly taskIndex: (projectId: string) => TaskIndexRow[];
  readonly touchAgent: (machineId: string) => void;
  /**
   * The session moved. This is the only write anywhere that means it: every
   * other `updatedAt` on the table is a status change, which is the hub
   * writing down its own bookkeeping. Without it the column a rail draws ages
   * from says when a session was spawned or settled, never when it last said
   * anything — which is why a fleet of live sessions all read the same age.
   * Called off the daemon's pulse and throttled by the caller.
   */
  readonly touchInstanceActivity: (id: string) => void;
  /**
   * What a parent's delegate tray can still show, oldest first: live and
   * undismissed failed items, and any other that ended at or after `endedSince`.
   */
  readonly trayItemsOf: (
    parentInstanceId: string,
    endedSince: Date
  ) => WorkItemRow[];
  /**
   * The machine's sessions that nothing has ever put a name to, however old
   * they are — a stored conversation the hub could name off the machine's own
   * catalog, and the only rows worth spending a catalog read on. Empty is the
   * steady state, which is what makes that read free to offer.
   */
  readonly unnamedSessions: (machineId: string) => PublicInstanceRow[];
  /** Enabled plugins with no resolved files and no recorded failure — what a resolve is for. */
  readonly unresolvedPlugins: () => string[];
  /** Moves one job; the row as it now is, or undefined when it is gone. */
  readonly updateContinuation: (
    id: string,
    patch: Partial<
      Pick<
        ContinuationRow,
        "stage" | "error" | "summary" | "summariserInstanceId"
      >
    >
  ) => ContinuationRow | undefined;
  /** Cache bookkeeping never changes the session's activity timestamp. */
  readonly updateKeepAlive: (
    id: string,
    patch: Partial<
      Pick<
        ReturnType<DbShape["getInstancesByIds"]>[number],
        | "keepAliveEnabled"
        | "keepAliveSent"
        | "keepAliveStopped"
        | "cacheTtl"
        | "lastRequestAt"
        | "contextTokens"
        | "contextReadAt"
        | "cacheCold"
        | "lastPingUsage"
        | "keepAliveTurn"
      >
    >
  ) => void;
  /** One change to a send's record — the hub's only kind of write to one. */
  readonly updateSend: (
    uuid: string,
    change: Partial<
      Pick<
        SentMessageRow,
        | "state"
        | "reason"
        | "anchor"
        | "replacedBy"
        | "body"
        | "harnessId"
        | "held"
      >
    >
  ) => SentMessageRow | undefined;
  /** Moves a work item; the hub is its only writer. */
  readonly updateWorkItem: (
    id: string,
    change: Partial<
      Pick<
        WorkItemRow,
        | "state"
        | "result"
        | "error"
        | "endedAt"
        | "dismissedAt"
        | "checks"
        | "checkingSince"
        | "submission"
        | "waitUntil"
        | "waitReason"
        | "waitResumeBy"
        | "waitHistory"
        | "prUrl"
        | "groupReportedAt"
        | "digest"
        | "turns"
      >
    >
  ) => WorkItemRow | undefined;
  /** Records what the workspace's machine says of its boundary, or its archive. */
  readonly updateWorkspace: (
    id: string,
    change: Partial<Pick<WorkspaceRow, "boundaryPid" | "state">>
  ) => WorkspaceRow | undefined;
  readonly upsertAgent: (agent: {
    machineId: string;
    hostname: string;
    os: string;
    auth: AgentAuth;
    /** Absent from a register with nothing new to say about it; the row keeps what it had. */
    build?: BuildInfo;
    machineCapabilities?: import("@cawco/core/capabilities").MachineCapabilities;
  }) => void;
  /** Returns the limit-history series for a machine, optionally filtered by kind and time range. */
  readonly usageLimitHistory: (q: {
    machineId: string;
    kind?: string;
    since?: number;
    until?: number;
  }) => UsageLimitHistoryRow[];
  /**
   * One harness's recorded cost since each boundary and in all, in one SQL
   * pass. A bucket counts toward a boundary when it starts at or after it;
   * a quarter-hour bucket never straddles a midnight in any zone.
   */
  readonly usageSpend: (q: {
    harness: UsageHarness;
    todayStart: number;
    weekStart: number;
  }) => { today: number; week: number; all: number };
  /** Aggregates buckets in SQL (SUM/GROUP BY) and names the unpriced models. */
  readonly usageSummary: (q: {
    since?: number;
    until?: number;
    harness?: string;
    machineId?: string;
    groupBy: UsageGroupBy;
  }) => UsageSummary;
  /** Stored waits, including any that elapsed while the hub was stopped. */
  readonly waitingWorkItems: () => WorkItemRow[];
  readonly workflowTransition: (
    run: typeof workflowRuns.$inferInsert,
    step?: typeof workflowSteps.$inferInsert,
    attempt?: typeof workflowAttempts.$inferInsert,
    steps?: WorkflowStepRow[]
  ) => void;
  readonly workItem: (id: string) => WorkItemRow | undefined;
  /** The newest work item whose landing opened or found the pull request at `url`. */
  readonly workItemByPrUrl: (url: string) => WorkItemRow | undefined;
  /** A workspace's items, newest first. */
  readonly workItemsIn: (workspaceId: string) => WorkItemRow[];
  /** Unfiled creates to discard when this machine next registers. */
  readonly workspaceCreatesOn: (
    machineId: string
  ) => (typeof workspaceCreates.$inferSelect)[];
  /** The workspaces an id names: itself exactly, else every one it prefixes. */
  readonly workspacesNamed: (idOrPrefix: string) => WorkspaceRow[];
}

export class Db extends Context.Service<Db, DbShape>()("Db") {}

/**
 * A delegate_events row as everything reads it: its date as JSON writes one,
 * and its payload paired with its kind, which the two columns cannot say.
 */
const delegateEventOf = (
  row: typeof delegateEvents.$inferSelect
): DelegateEvent =>
  ({ ...row, createdAt: row.createdAt.toISOString() }) as DelegateEvent;

/** A stored rule row back into the shape the fleet and the dashboard share. */
const ruleOf = (row: typeof rules.$inferSelect): Rule => ({
  id: row.id,
  name: row.name,
  enabled: row.enabled,
  trigger: row.trigger,
  pattern: row.pattern,
  matchKind: row.matchKind,
  caseSensitive: row.caseSensitive,
  wholeWord: row.wholeWord,
  watch: row.watch,
  action: row.action,
  reply: row.reply,
  prompt: row.prompt,
  timing: row.timing,
  interrupt: row.interrupt,
  repeat: row.repeat,
  scope: row.scope,
  createdAt: row.createdAt.getTime(),
});

/** And a standing row, with the dates flattened to the numbers the wire carries. */
const ruleStateOf = (row: typeof ruleState.$inferSelect): RuleState => ({
  ruleId: row.ruleId,
  instanceId: row.instanceId,
  status: row.status,
  fireCount: row.fireCount,
  totalFires: row.totalFires,
  lastFiredAt: row.lastFiredAt?.getTime() ?? null,
  ackedAt: row.ackedAt?.getTime() ?? null,
});

/** A skill row as everything outside the hub reads it: the row, minus its files. */
const skillMeta = (
  row: Omit<typeof skills.$inferSelect, "files" | "createdAt">
): FleetSkillMeta => ({
  name: row.name,
  source: row.source,
  enabled: row.enabled,
  ...(row.hash ? { hash: row.hash } : {}),
  ...(row.bytes === null ? {} : { bytes: row.bytes }),
  ...(row.error ? { error: row.error } : {}),
});

/** A subagent row as everything outside the hub reads it. */
const agentFile = (row: typeof fleetAgents.$inferSelect): FleetAgent => ({
  name: row.name,
  content: row.content,
  hash: row.hash,
  bytes: row.bytes,
  at: row.updatedAt.getTime(),
});

/**
 * A stored hook row back into the shape both ends of the fleet share. Takes
 * the loose shape rather than `typeof fleetHooks.$inferSelect` so the same
 * function reads a row just selected out of the table and the row a write is
 * about to put into it — a hook has no server-side timestamp in its wire
 * shape, so there is nothing else the two would disagree about.
 */
const hookOf = (row: {
  id: string;
  name: string;
  enabled: boolean;
  event: HookEvent;
  matcher: string | null;
  handler: HookHandler;
  script: string | null;
  hash: string;
  scope: FleetScope | null;
  projectId: string | null;
}): FleetHook => ({
  id: row.id,
  name: row.name,
  enabled: row.enabled,
  event: row.event,
  ...(row.matcher ? { matcher: row.matcher } : {}),
  handler: row.handler,
  ...(row.script ? { script: row.script } : {}),
  hash: row.hash,
  ...(row.scope ? { scope: row.scope } : {}),
  ...(row.projectId ? { projectId: row.projectId } : {}),
});

/** Whether `place` is the project's primary: the folder its own row names. */
const isPrimary = (
  project: { machineId: string; cwd: string },
  place: { machineId: string; path: string }
): boolean =>
  place.machineId === project.machineId && place.path === project.cwd;

/** Each project with its places: the primary first, then oldest first. */
const withPlaces = (
  rows: (typeof projects.$inferSelect)[],
  places: PlaceRow[]
): ProjectRow[] => {
  const byProject = new Map<string, PlaceRow[]>();
  for (const place of places) {
    const listed = byProject.get(place.projectId);
    if (listed) {
      listed.push(place);
    } else {
      byProject.set(place.projectId, [place]);
    }
  }
  return rows.map((project) => ({
    ...project,
    places: (byProject.get(project.id) ?? []).sort(
      (a, b) =>
        Number(isPrimary(project, b)) - Number(isPrimary(project, a)) ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    ),
  }));
};

/** A path's last folder, or undefined for none. */
const folderOf = (path: string | null | undefined): string | undefined =>
  (path ?? "").split("/").filter(Boolean).pop();

/** The one row the fleet's memory ever takes: there is one document, not a list. */
const MEMORY_ID = "memory";

/** The one row the supervisor config ever takes — same precedent as `MEMORY_ID`. */
const SUPERVISOR_CONFIG_ID = "supervisor";
const OPENROUTER_CONNECTION_ID = "openrouter";
const APNS_CREDENTIALS_ID = "apns";

/** How many supervisor event rows to keep — bounded without a scheduler (plan: our choice). */
const SUPERVISOR_EVENTS_RETENTION = 5000;

/** How far back the memory can be taken. Deep enough to undo a bad day, not a log. */
const HISTORY_LIMIT = 20;

/** What a machine compares its own copy against — sha256 of the text's own bytes. */
const hashText = (content: string): string =>
  new Bun.CryptoHasher("sha256").update(content).digest("hex");

/**
 * What a hook's own hash covers: everything a machine actually writes — not
 * `name`, which is how the fleet talks about the hook, and not `enabled`,
 * which decides whether it is written at all rather than what gets written.
 */
export const hashHookMaterial = (hook: {
  event: HookEvent;
  matcher?: string;
  handler: HookHandler;
  script?: string;
}): string =>
  hashText(
    JSON.stringify([
      hook.event,
      hook.matcher ?? null,
      hook.handler,
      hook.script ?? null,
    ])
  );

const make = (path: string): DbShape => {
  mkdirSync(dirname(path), { recursive: true });
  const db = drizzle(path);
  const {
    endRetryAt: _endRetryAt,
    endAttempts: _endAttempts,
    addressRequired: _addressRequired,
    machineRemoved: _machineRemoved,
    scratchWorktree: _scratchWorktree,
    addressProtocol: _addressProtocol,
    endReason: _endReason,
    endIntent: _endIntent,
    endConfirmedAt: _endConfirmedAt,
    owedSpawn: _owedSpawn,
    owedAt: _owedAt,
    ...publicColumns
  } = getTableColumns(instances);
  const { tooling: _tooling, ...boardColumns } = publicColumns;
  const listedInstances = () =>
    and(
      eq(instances.machineRemoved, false),
      ne(instances.status, "discarded"),
      or(isNull(instances.endIntent), eq(instances.endIntent, "stop")),
      or(
        inArray(instances.status, ["running", "sleeping"]),
        gt(instances.updatedAt, new Date(Date.now() - STALE_AFTER_MS))
      )
    );
  // A marker for the update helper: while it names a live process the hub is
  // migrating, and the helper's wait for a healthy start does not run down.
  const migrating = `${path}.migrating`;
  writeFileSync(
    migrating,
    JSON.stringify({ ...ownIdentity(), startedAt: Date.now() })
  );
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    rmSync(migrating, { force: true });
  }

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  /** One project and its places, read inside a transaction or out of one. */
  const projectOf = (
    from: Pick<Tx, "select">,
    id: string
  ): ProjectRow | undefined => {
    const row = from.select().from(projects).where(eq(projects.id, id)).get();
    return row
      ? withPlaces(
          [row],
          from
            .select()
            .from(projectPlaces)
            .where(eq(projectPlaces.projectId, id))
            .all()
        )[0]
      : undefined;
  };
  /**
   * Deletes session rows and everything keyed to them, inside the caller's
   * transaction — the one way a session leaves the hub, whether its machine
   * went with it or it never started at all.
   */
  const dropInstances = (tx: Tx, ids: readonly string[]): void => {
    if (ids.length === 0) {
      return;
    }
    const list = [...ids];
    // What belonged to those sessions goes with them.
    tx.delete(delegateEvents)
      .where(
        or(
          inArray(delegateEvents.instanceId, list),
          inArray(delegateEvents.parentInstanceId, list)
        )
      )
      .run();
    tx.delete(ruleState).where(inArray(ruleState.instanceId, list)).run();
    tx.delete(sentMessages).where(inArray(sentMessages.instanceId, list)).run();
    tx.delete(supervisorEvents)
      .where(inArray(supervisorEvents.instanceId, list))
      .run();
    // What only pointed at one keeps its own history, pointing nowhere: a
    // workflow's step, a run's supervisor, a delegate whose parent went.
    tx.update(workflowSteps)
      .set({ instanceId: null })
      .where(inArray(workflowSteps.instanceId, list))
      .run();
    tx.update(workflowRuns)
      .set({ supervisorInstanceId: null })
      .where(inArray(workflowRuns.supervisorInstanceId, list))
      .run();
    tx.update(instances)
      .set({ parentInstanceId: null })
      .where(inArray(instances.parentInstanceId, list))
      .run();
    tx.delete(instances).where(inArray(instances.id, list)).run();
  };

  const agentTools = (machineId: string): Record<string, ToolStatus> =>
    db
      .select({ tools: agents.tools })
      .from(agents)
      .where(eq(agents.machineId, machineId))
      .get()?.tools ?? {};

  const writeAgentTools = (
    machineId: string,
    cells: Record<string, ToolStatus>
  ): void => {
    db.update(agents)
      .set({ tools: cells })
      .where(eq(agents.machineId, machineId))
      .run();
  };

  const getFleetMemory = () => {
    const row = db
      .select()
      .from(fleetMemory)
      .where(eq(fleetMemory.id, MEMORY_ID))
      .get();
    return row
      ? { content: row.content, hash: row.hash, updatedAt: row.updatedAt }
      : undefined;
  };

  const listFleetMemoryDocs = (): MemoryDocRow[] =>
    db
      .select()
      .from(fleetMemoryDocs)
      .orderBy(fleetMemoryDocs.path)
      .all()
      .map(({ path: docPath, content, hash, updatedAt }) => ({
        path: docPath,
        content,
        hash,
        updatedAt,
      }));

  /**
   * Append the windows whose reading actually moved since last time.
   *
   * "Moved" is any of percent, severity or `resetsAt` — the last one matters
   * most and is the least obvious: a rollover resets percent to a LOW number,
   * so a diff on percent alone would record the drop as if it were spend
   * running backwards. Carrying `resetsAt` into the comparison makes the new
   * window a new series instead.
   *
   * `previous` is the payload this same call is about to overwrite, which is
   * why it must be read before the upsert. Reading it (rather than holding a
   * last-seen map in memory) keeps the diff correct across a hub restart, and
   * costs one indexed lookup per push.
   */
  const appendLimitHistory = (
    machineId: string,
    limits: ClaudeLimits,
    previous: ClaudeLimits | null,
    at: Date
  ): void => {
    // A failed fetch describes the fetch, not the account. Recording it would
    // put a fabricated point on the series; a gap is the truthful shape.
    if (limits.error !== null || limits.windows.length === 0) {
      return;
    }
    const before = new Map(
      (previous?.error === null ? previous.windows : []).map((w) => [
        `${w.kind}\u0000${w.scopeLabel ?? ""}`,
        w,
      ])
    );
    const rows = limits.windows
      .filter((w) => {
        const prior = before.get(`${w.kind}\u0000${w.scopeLabel ?? ""}`);
        return (
          prior === undefined ||
          prior.percent !== w.percent ||
          prior.severity !== w.severity ||
          prior.resetsAt !== w.resetsAt
        );
      })
      .map((w) => ({
        machineId,
        kind: w.kind,
        scopeLabel: w.scopeLabel,
        percent: w.percent,
        severity: w.severity,
        resetsAt: w.resetsAt,
        fetchedAt: at,
      }));
    if (rows.length === 0) {
      return;
    }
    db.insert(usageLimitHistory).values(rows).run();
    // Retention, folded into the write that grew the table so nothing else has
    // to own a timer. Only runs on a push that changed something.
    db.delete(usageLimitHistory)
      .where(
        lte(
          usageLimitHistory.fetchedAt,
          new Date(at.getTime() - LIMIT_HISTORY_RETENTION_MS)
        )
      )
      .run();
  };

  /** The column a usage summary groups on. */
  const usageKey = (groupBy: UsageGroupBy) => {
    if (groupBy === "start") {
      return usageBuckets.start;
    }
    if (groupBy === "machine") {
      return usageBuckets.machineId;
    }
    if (groupBy === "model") {
      return usageBuckets.model;
    }
    if (groupBy === "project") {
      return usageBuckets.project;
    }
    return usageBuckets.sessionId;
  };

  /** Each machine by id, for naming summary rows; a removed one keeps its place. */
  const usageMachines = (wanted: boolean) => {
    const machines = new Map(
      wanted
        ? db
            .select({
              id: agents.machineId,
              hostname: agents.hostname,
              os: agents.os,
            })
            .from(agents)
            .all()
            .map((agent) => [agent.id, agent])
        : []
    );
    return (id: string) =>
      machines.get(id) ?? { id, hostname: REMOVED_MACHINE, os: "" };
  };

  /** Each harness session's newest instance: its address and its name. */
  const usageSessions = (wanted: boolean) => {
    const sessions = new Map<
      string,
      { id: string; name: string | null; cwd: string; at: number }
    >();
    if (!wanted) {
      return sessions;
    }
    for (const row of db
      .select({
        id: instances.id,
        sessionId: instances.sessionId,
        title: instances.title,
        derivedTitle: instances.derivedTitle,
        cwd: instances.cwd,
        updatedAt: instances.updatedAt,
      })
      .from(instances)
      .where(isNotNull(instances.sessionId))
      .all()) {
      const at = row.updatedAt.getTime();
      const sessionId = row.sessionId ?? "";
      const held = sessions.get(sessionId);
      if (!held || at > held.at) {
        sessions.set(sessionId, {
          id: row.id,
          name: row.title ?? row.derivedTitle,
          cwd: row.cwd,
          at,
        });
      }
    }
    return sessions;
  };

  /** The window a usage query names, or nothing — the filters fold into one AND. */
  const usageWhere = (q: {
    since?: number;
    until?: number;
    harness?: string;
    machineId?: string;
  }) =>
    and(
      q.since === undefined ? undefined : gte(usageBuckets.start, q.since),
      q.until === undefined ? undefined : lte(usageBuckets.start, q.until),
      q.harness === undefined
        ? undefined
        : eq(usageBuckets.harness, q.harness as "claude" | "opencode"),
      q.machineId === undefined
        ? undefined
        : eq(usageBuckets.machineId, q.machineId)
    );

  /**
   * Writes the catalog's own word on when each stored conversation last
   * changed onto the rows that are not live, after the settle above so it
   * overwrites it.
   *
   * Everything in `settleInstances` writes `updatedAt` from the hub's clock,
   * because settling a row is the only moment the hub has an opinion about it —
   * which is how a machine coming back stamped three hundred rows with the same
   * instant and made every age in the rail read `1m` alike. The daemon's
   * catalog knows better: a conversation's mtime is when the session itself last
   * said something. Only rows that disagree are written, so a register that
   * changes nothing costs one select.
   */
  const dateStoredSessions = (
    machineId: string,
    liveIds: string[],
    resumableAt?: Record<string, number>
  ): void => {
    if (!resumableAt) {
      return;
    }
    const dated = db
      .select({
        id: instances.id,
        sessionId: instances.sessionId,
        updatedAt: instances.updatedAt,
      })
      .from(instances)
      .where(
        and(
          eq(instances.machineId, machineId),
          // Not the live ones: a running session's own frames are fresher than
          // any file the catalog looked at.
          eq(instances.machineRemoved, false),
          liveIds.length > 0 ? notInArray(instances.id, liveIds) : undefined,
          isNotNull(instances.sessionId)
        )
      )
      .all();
    for (const row of dated) {
      const latest = db
        .select({ body: sentMessages.body })
        .from(sentMessages)
        .where(eq(sentMessages.instanceId, row.id))
        .orderBy(desc(sentMessages.acceptedAt))
        .limit(1)
        .get()?.body;
      if (
        latest?.origin?.kind === "system" &&
        latest.origin.name === "keepalive"
      ) {
        // The transcript's mtime includes maintenance; it is not real activity.
        continue;
      }
      const at = row.sessionId ? resumableAt[row.sessionId] : undefined;
      if (at === undefined || at === row.updatedAt.getTime()) {
        continue;
      }
      db.update(instances)
        .set({ updatedAt: new Date(at) })
        .where(eq(instances.id, row.id))
        .run();
    }
  };

  return {
    clearEndConfirmation: (id) => {
      db.update(instances)
        .set({ endConfirmedAt: null })
        .where(and(eq(instances.id, id), isNotNull(instances.endIntent)))
        .run();
    },
    invalidateClaudeCaches: (machineId, reason, at) => {
      db.update(instances)
        .set({ cacheCold: { reason, at } })
        .where(
          and(
            eq(instances.machineId, machineId),
            eq(instances.harness, "claude")
          )
        )
        .run();
    },
    agentAddressContract: (machineId) =>
      db
        .select({ addressContract: agents.addressContract })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get()?.addressContract ?? false,
    noteAgentAddressContract: (machineId, addressContract) => {
      db.update(agents)
        .set({ addressContract })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    ownedInstance: (id, machineId) =>
      db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.id, id),
            machineId === undefined
              ? undefined
              : eq(instances.machineId, machineId)
          )
        )
        .get(),
    hiddenSession: (id) =>
      !!db
        .select({ id: instances.id })
        .from(instances)
        .where(
          and(
            or(eq(instances.id, id), eq(instances.sessionId, id)),
            or(
              eq(instances.machineRemoved, true),
              and(
                isNotNull(instances.endIntent),
                ne(instances.endIntent, "stop")
              )
            )
          )
        )
        .get(),
    acknowledgeAddress: (id) => {
      db.update(instances)
        .set({ addressProtocol: true })
        .where(eq(instances.id, id))
        .run();
    },
    recordScratchWorktree: (id, scratchWorktree) => {
      db.update(instances)
        .set({ scratchWorktree, cwd: scratchWorktree.dir })
        .where(eq(instances.id, id))
        .run();
    },
    noteEndFailure: (id, error) => {
      const row = db.select().from(instances).where(eq(instances.id, id)).get();
      if (!row?.endIntent) {
        return;
      }
      db.update(instances)
        .set({
          lastError: error,
          endReason: error,
          endAttempts: row.endAttempts + 1,
          endRetryAt: new Date(
            Date.now() +
              Math.min(300_000, 30_000 * 2 ** Math.min(row.endAttempts, 4))
          ),
        })
        .where(eq(instances.id, id))
        .run();
    },
    settleRemovedSession: (id, present) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(instances)
          .where(eq(instances.id, id))
          .get();
        if (!row?.machineRemoved) {
          return;
        }
        if (present) {
          tx.update(instances)
            .set({ machineRemoved: false })
            .where(eq(instances.id, id))
            .run();
        } else {
          dropInstances(tx, [id]);
        }
      }),
    restoreRemovedSessions: (machineId, held, complete) =>
      db.transaction((tx) => {
        const removed = tx
          .select()
          .from(instances)
          .where(
            and(
              eq(instances.machineId, machineId),
              eq(instances.machineRemoved, true)
            )
          )
          .all();
        const present = new Set(held);
        for (const row of removed) {
          if (present.has(row.id)) {
            tx.update(instances)
              .set({ machineRemoved: false })
              .where(eq(instances.id, row.id))
              .run();
          } else if (complete && row.harness !== "opencode") {
            dropInstances(tx, [row.id]);
          }
        }
      }),
    sessionOwnership: (machineId) =>
      db
        .select()
        .from(instances)
        .where(
          machineId === undefined
            ? undefined
            : eq(instances.machineId, machineId)
        )
        .all(),
    endInstance: (id, intent) =>
      db.transaction(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: precedence and never-started confirmation share the persist-first transaction
        (tx) => {
          const row = tx
            .select()
            .from(instances)
            .where(eq(instances.id, id))
            .get();
          if (!row) {
            return;
          }
          const next =
            row.endIntent && END_PRIORITY[row.endIntent] > END_PRIORITY[intent]
              ? row.endIntent
              : intent;
          const neverStarted =
            row.harness === "opencode" &&
            row.addressRequired &&
            !row.sessionId &&
            !row.scratchWorktree &&
            next !== "discard";
          const ended = tx
            .update(instances)
            .set({
              endIntent: next,
              endConfirmedAt:
                row.endIntent === next ? row.endConfirmedAt : null,
              endReason: neverStarted ? "never started" : row.endReason,
              endRetryAt: null,
              endAttempts: 0,
              keepAliveEnabled: false,
              keepAliveTurn: null,
              keepAliveStopped: null,
              ...(neverStarted ? { endConfirmedAt: new Date() } : {}),
              status: row.status === "discarded" ? "discarded" : "stopped",
              updatedAt: new Date(),
            })
            .where(eq(instances.id, id))
            .returning()
            .get();
          if (neverStarted && next === "delete") {
            dropInstances(tx, [id]);
          }
          return ended;
        }
      ),
    noteEndReason: (id, reason) => {
      db.update(instances)
        .set({ endReason: reason })
        .where(
          and(
            eq(instances.id, id),
            isNotNull(instances.endIntent),
            isNull(instances.endConfirmedAt)
          )
        )
        .run();
    },
    confirmInstanceEnd: (id, reason) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(instances)
          .where(eq(instances.id, id))
          .get();
        if (!row?.endIntent) {
          return;
        }
        tx.update(instances)
          .set({
            endConfirmedAt: new Date(),
            ...(reason ? { endReason: reason } : {}),
            status: row.endIntent === "discard" ? "discarded" : "stopped",
          })
          .where(eq(instances.id, id))
          .run();
        if (row.endIntent === "delete") {
          dropInstances(tx, [id]);
        }
      }),
    finishTranscriptDelete: (id) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(instances)
          .where(eq(instances.id, id))
          .get();
        if (row?.endIntent === "delete-transcript" && row.endConfirmedAt) {
          dropInstances(tx, [id]);
        }
      }),
    updateKeepAlive: (id, patch) => {
      db.update(instances)
        .set({
          ...patch,
          ...(patch.keepAliveEnabled === true
            ? {
                keepAliveEnabled: sql`CASE WHEN ${instances.status} IN ('stopped', 'discarded', 'error') THEN 0 ELSE 1 END`,
              }
            : {}),
        })
        .where(eq(instances.id, id))
        .run();
    },
    agentHarnesses: (machineId) =>
      db
        .select({ harnesses: agents.harnesses })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get()?.harnesses ?? undefined,
    listBoardInstances: () =>
      db
        .select(boardColumns)
        .from(instances)
        .where(listedInstances())
        .all()
        .map((row) => ({
          ...(row.title ? row : { ...row, title: row.derivedTitle }),
          ...(row.autopilot ? { autopilot: row.autopilot } : {}),
        })),
    expirePendingSessionIdentities: (machineId) => {
      db.update(sessionIdentities)
        .set({
          pendingHash: null,
          error: "Agent re-registered before credential installation ACK",
        })
        .where(
          and(
            isNotNull(sessionIdentities.pendingHash),
            inArray(
              sessionIdentities.instanceId,
              db
                .select({ id: instances.id })
                .from(instances)
                .where(eq(instances.machineId, machineId))
            )
          )
        )
        .run();
    },
    sessionIdentity: (instanceId) =>
      db
        .select()
        .from(sessionIdentities)
        .where(eq(sessionIdentities.instanceId, instanceId))
        .get(),
    sessionIdentityByHash: (hash) =>
      db
        .select()
        .from(sessionIdentities)
        .where(
          or(
            eq(sessionIdentities.credentialHash, hash),
            eq(sessionIdentities.pendingHash, hash)
          )
        )
        .get(),
    stageSessionIdentity: (instanceId, pendingHash) => {
      db.insert(sessionIdentities)
        .values({ instanceId, pendingHash })
        .onConflictDoUpdate({
          target: sessionIdentities.instanceId,
          set: { pendingHash, error: null },
        })
        .run();
    },
    acknowledgeSessionIdentity: (instanceId, hash) => {
      const changed = db
        .update(sessionIdentities)
        .set({
          credentialHash: hash,
          pendingHash: null,
          installedAt: new Date(),
          error: null,
        })
        .where(
          and(
            eq(sessionIdentities.instanceId, instanceId),
            eq(sessionIdentities.pendingHash, hash)
          )
        )
        .returning({ instanceId: sessionIdentities.instanceId })
        .get();
      return changed !== undefined;
    },
    sessionIdentityError: (instanceId, error, rejectPending = false) => {
      db.update(sessionIdentities)
        .set({ error, ...(rejectPending ? { pendingHash: null } : {}) })
        .where(eq(sessionIdentities.instanceId, instanceId))
        .run();
    },
    getMcpServer: (name) =>
      db.select().from(mcpServers).where(eq(mcpServers.name, name)).get(),
    getMcpOauth: (name) =>
      db.select().from(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).get(),
    putMcpOauth: (row) => {
      db.insert(fleetMcpOauth)
        .values(row)
        .onConflictDoUpdate({ target: fleetMcpOauth.name, set: row })
        .run();
    },
    deleteMcpOauth: (name) => {
      db.delete(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).run();
    },
    setMcpAuth: (name, mode, error) => {
      db.update(mcpServers)
        .set({ authMode: mode, authError: error ?? null })
        .where(eq(mcpServers.name, name))
        .run();
    },
    takeMcpAuthorization: (state) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(fleetMcpOauth)
          .where(
            sql`json_extract(${fleetMcpOauth.pending}, '$.state') = ${state}`
          )
          .get();
        if (!row?.pending || row.pending.expiresAt <= Date.now()) {
          return;
        }
        tx.update(fleetMcpOauth)
          .set({ pending: null })
          .where(eq(fleetMcpOauth.name, row.name))
          .run();
        return row;
      }),
    listWorkflows: () =>
      db.select().from(workflows).orderBy(desc(workflows.updatedAt)).all(),
    getWorkflow: (id) =>
      db
        .select()
        .from(workflows)
        .where(
          or(
            eq(workflows.id, id),
            eq(workflows.slug, id),
            eq(workflows.name, id)
          )
        )
        .get(),
    putWorkflow: (row) =>
      db
        .insert(workflows)
        .values(row)
        .onConflictDoUpdate({
          target: workflows.id,
          set: { ...row, updatedAt: new Date() },
        })
        .returning()
        .get(),
    deleteWorkflow: (id) =>
      db.transaction((tx) => {
        for (const run of tx
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowId, id))
          .all()) {
          tx.update(instances)
            .set({ workflowRunId: null, workflowStepId: null })
            .where(eq(instances.workflowRunId, run.id))
            .run();
          for (const step of tx
            .select()
            .from(workflowSteps)
            .where(eq(workflowSteps.runId, run.id))
            .all()) {
            tx.delete(workflowAttempts)
              .where(eq(workflowAttempts.stepId, step.id))
              .run();
          }
          tx.delete(workflowSteps).where(eq(workflowSteps.runId, run.id)).run();
          tx.delete(workflowRunLog)
            .where(eq(workflowRunLog.runId, run.id))
            .run();
          tx.delete(workflowNotices)
            .where(eq(workflowNotices.runId, run.id))
            .run();
        }
        tx.delete(workflowRuns).where(eq(workflowRuns.workflowId, id)).run();
        tx.delete(workflows).where(eq(workflows.id, id)).run();
      }),
    listWorkflowRuns: (workflowId) =>
      db
        .select()
        .from(workflowRuns)
        .where(workflowId ? eq(workflowRuns.workflowId, workflowId) : undefined)
        .orderBy(desc(workflowRuns.startedAt))
        .all(),
    getWorkflowRun: (id) =>
      db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get(),
    listWorkflowSteps: (runId) =>
      db
        .select()
        .from(workflowSteps)
        .where(eq(workflowSteps.runId, runId))
        .all(),
    getWorkflowStep: (id) =>
      db.select().from(workflowSteps).where(eq(workflowSteps.id, id)).get(),
    listWorkflowAttempts: (stepId) =>
      db
        .select()
        .from(workflowAttempts)
        .where(eq(workflowAttempts.stepId, stepId))
        .orderBy(workflowAttempts.number)
        .all(),
    getWorkflowLog: (runId, seq) =>
      db
        .select()
        .from(workflowRunLog)
        .where(
          and(eq(workflowRunLog.runId, runId), eq(workflowRunLog.seq, seq))
        )
        .get(),
    listWorkflowLog: (runId) =>
      db
        .select()
        .from(workflowRunLog)
        .where(eq(workflowRunLog.runId, runId))
        .orderBy(workflowRunLog.seq)
        .all(),
    putWorkflowLog: (row) => {
      db.insert(workflowRunLog)
        .values(row)
        .onConflictDoUpdate({
          target: [workflowRunLog.runId, workflowRunLog.seq],
          set: row,
        })
        .run();
    },
    listWorkflowNotices: () =>
      db.select().from(workflowNotices).orderBy(workflowNotices.id).all(),
    queueWorkflowNotice: (row) => {
      db.insert(workflowNotices).values(row).run();
    },
    deleteWorkflowNotice: (id) => {
      db.delete(workflowNotices).where(eq(workflowNotices.id, id)).run();
    },
    workflowTransition: (run, step, attempt, steps = []) =>
      db.transaction((tx) => {
        tx.insert(workflowRuns)
          .values(run)
          .onConflictDoUpdate({ target: workflowRuns.id, set: run })
          .run();
        for (const changed of [...(step ? [step] : []), ...steps]) {
          tx.insert(workflowSteps)
            .values(changed)
            .onConflictDoUpdate({ target: workflowSteps.id, set: changed })
            .run();
        }
        if (attempt) {
          tx.insert(workflowAttempts)
            .values(attempt)
            .onConflictDoUpdate({ target: workflowAttempts.id, set: attempt })
            .run();
        }
      }),
    upsertAgent: ({
      machineId,
      hostname,
      os,
      auth,
      build,
      machineCapabilities,
    }) => {
      const lastSeenAt = new Date();
      db.insert(agents)
        .values({
          machineId,
          hostname,
          os,
          auth,
          status: "online",
          lastSeenAt,
          build,
          machineCapabilities,
        })
        .onConflictDoUpdate({
          target: agents.machineId,
          set: {
            hostname,
            os,
            auth,
            status: "online",
            lastSeenAt,
            ...(build ? { build } : {}),
            ...(machineCapabilities ? { machineCapabilities } : {}),
          },
        })
        .run();
    },
    touchAgent: (machineId) => {
      db.update(agents)
        .set({ status: "online", lastSeenAt: new Date() })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    markAgentOffline: (machineId) => {
      db.update(agents)
        .set({ status: "offline", lastSeenAt: new Date() })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    // No `lastSeenAt` here, unlike its single-machine sibling above: that write
    // means "I just heard from it", and starting up is not hearing from anyone.
    markAllAgentsOffline: () => {
      db.update(agents).set({ status: "offline" }).run();
    },
    openInstance: ({
      addressProtocol = false,
      id,
      machineId,
      cwd,
      sessionId,
      harness,
      projectId,
      parentInstanceId,
      parentToolUseId,
      title,
      kind,
      permissionMode,
      model,
      canDelegate,
      workflowRunId,
      workflowStepId,
      workItemId,
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: opens (or reuses) the one live row for a conversation across every optional field a spawn can carry — see the "one conversation, one live row" invariant below.
    }) => {
      const now = new Date();
      const existing = db
        .select()
        .from(instances)
        .where(eq(instances.id, id))
        .get();
      if (existing && existing.machineId !== machineId) {
        throw new Error(
          `Instance ${id} belongs to machine ${existing.machineId}, not ${machineId}.`
        );
      }
      if (existing?.machineRemoved) {
        throw new Error(
          `Instance ${id} is awaiting its removed machine's complete custody reading.`
        );
      }
      if (existing?.endIntent && existing.endIntent !== "stop") {
        throw new Error(
          `Instance ${id} is being deleted and cannot be reopened.`
        );
      }

      // Same refusal as noteInstanceSession below: a spawn whose resume key is
      // the instance id itself carries confusion, not identity. Treat it as
      // absent so the row is born session-less instead of self-pointing.
      const cleanSessionId =
        sessionId && sessionId !== id ? sessionId : undefined;

      // One conversation, one live row.
      //
      // A session already being answered by a live process must not get a
      // second one: two rows in the rail for the same chat, two processes
      // writing one transcript, and a reader who cannot tell which is which.
      if (cleanSessionId) {
        const live = db
          .select()
          .from(instances)
          .where(
            and(
              eq(instances.sessionId, cleanSessionId),
              ne(instances.id, id),
              inArray(instances.status, ["running", "starting"])
            )
          )
          .get();
        if (live) {
          return;
        }
      }
      db.insert(instances)
        .values({
          addressRequired: addressProtocol,
          id,
          machineId,
          cwd,
          sessionId: cleanSessionId,
          harness,
          projectId,
          parentInstanceId,
          parentToolUseId,
          title,
          ...(title ? { titleSource: "agent" as const } : {}),
          kind,
          permissionMode,
          model,
          canDelegate,
          workflowRunId,
          workflowStepId,
          workItemId,
          // `starting`, not `running` — this row is written when a spawn is
          // *issued*, and issuing a spawn is not evidence that a process exists.
          // Writing `running` here is the original sin behind the 178-vs-42
          // gap: every spawn the hub ever sent, including the fire-and-forget
          // restores at register, minted a row asserting a live process that
          // nothing had confirmed and nothing would ever re-check. Promotion to
          // `running` comes from the daemon's own word — its heartbeat listing
          // the id, or the session's `init` frame — and from nowhere else.
          status: "starting",
          createdAt: now,
          updatedAt: now,
          spawnedAt: now,
        })
        .onConflictDoUpdate({
          target: instances.id,
          set: {
            cwd,
            kind,
            permissionMode,
            ...(model ? { model } : {}),
            // Presence, not truth: a leaf's `false` has to land.
            ...(canDelegate === undefined ? {} : { canDelegate }),
            ...(workflowRunId ? { workflowRunId } : {}),
            ...(workflowStepId ? { workflowStepId } : {}),
            // `updatedAt` deliberately absent: a restore or relaunch re-issues
            // an existing session, so its last-activity time is whatever it
            // already was; stamping it here dated every restored session to the
            // daemon reconnect instant.
            status: "starting",
            spawnedAt: now,
            endIntent: null,
            endConfirmedAt: null,
            endReason: null,
            endRetryAt: null,
            endAttempts: 0,
            lastError: null,
            ...(cleanSessionId ? { sessionId: cleanSessionId } : {}),
            ...(harness ? { harness } : {}),
            ...(projectId ? { projectId } : {}),
            ...(parentInstanceId ? { parentInstanceId } : {}),
            ...(parentToolUseId ? { parentToolUseId } : {}),
            // A re-issued spawn's title never replaces the owner's name.
            ...(title
              ? {
                  title: sql`CASE WHEN ${instances.titleSource} = 'owner' THEN ${instances.title} ELSE ${title} END`,
                  titleSource: sql`CASE WHEN ${instances.titleSource} = 'owner' THEN 'owner' ELSE 'agent' END`,
                }
              : {}),
          },
        })
        .run();
    },
    nameInstance: (id, title, by) => {
      const visible = db
        .select({ id: instances.id })
        .from(instances)
        .where(
          and(
            eq(instances.id, id),
            ne(instances.status, "discarded"),
            eq(instances.machineRemoved, false),
            or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
          )
        )
        .get();
      if (!visible) {
        return;
      }
      // `updatedAt` deliberately untouched, as with `noteDerivedTitle`:
      // naming a row is not the session moving.
      const [named] = db
        .update(instances)
        .set({ title, titleSource: by })
        .where(
          by === "owner"
            ? eq(instances.id, id)
            : and(
                eq(instances.id, id),
                or(
                  isNull(instances.titleSource),
                  ne(instances.titleSource, "owner")
                )
              )
        )
        .returning(publicColumns)
        .all();
      if (named) {
        return { named: true, row: named };
      }
      const row = db
        .select(publicColumns)
        .from(instances)
        .where(
          and(
            eq(instances.id, id),
            or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
          )
        )
        .get();
      return row ? { named: false, row } : undefined;
    },
    noteDerivedTitle: (id, derivedTitle) => {
      if (!derivedTitle) {
        return false;
      }
      // `updatedAt` deliberately untouched: naming a row is not the session
      // moving, and the listings age rows out on that column.
      const written = db
        .update(instances)
        .set({ derivedTitle })
        .where(
          and(
            eq(instances.id, id),
            isNull(instances.title),
            isNull(instances.derivedTitle)
          )
        )
        .returning({ id: instances.id })
        .all();
      return written.length > 0;
    },
    // `updatedAt` untouched, as wherever the hub files a process as gone: the
    // session did nothing, and that column says when it last did.
    sleepInstance: (id) =>
      db
        .update(instances)
        .set({ status: "sleeping", lastError: null })
        .where(
          and(
            eq(instances.id, id),
            isNotNull(instances.sessionId),
            inArray(instances.status, ["running", "starting", "unknown"])
          )
        )
        .returning({ id: instances.id })
        .all().length > 0,
    touchInstanceActivity: (id) => {
      db.update(instances)
        .set({ updatedAt: new Date() })
        .where(eq(instances.id, id))
        .run();
    },
    failInstance: (id, error) => {
      // A side quest that was thrown away stays thrown away: its teardown can
      // fail long after the session did, and it is not coming back as a row.
      db.update(instances)
        .set({ status: "error", lastError: error, updatedAt: new Date() })
        .where(
          and(
            eq(instances.id, id),
            ne(instances.status, "discarded"),
            isNull(instances.endIntent)
          )
        )
        .run();
    },
    patchInstance: (id, patch) =>
      db
        .update(instances)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(instances.id, id))
        .returning(publicColumns)
        .get(),
    markSeen: (instanceIds, runIds, at) => ({
      instances:
        instanceIds.length > 0
          ? db
              .update(instances)
              .set({ seenAt: at })
              .where(inArray(instances.id, instanceIds))
              .returning()
              .all()
          : [],
      runs:
        runIds.length > 0
          ? db
              .update(workflowRuns)
              .set({ seenAt: at })
              .where(inArray(workflowRuns.id, runIds))
              .returning()
              .all()
          : [],
    }),
    // `updatedAt` deliberately untouched: a reading is not the session moving.
    noteInstanceEffort: (id, effort) =>
      db
        .update(instances)
        .set({ effort })
        .where(
          and(
            eq(instances.id, id),
            or(isNull(instances.effort), ne(instances.effort, effort))
          )
        )
        .returning({ id: instances.id })
        .all().length > 0,
    noteInstanceSession: (id, sessionId, cwd, harness, tooling) => {
      // A harness key naming the row itself is confusion, never identity: hub
      // ids are hub-minted, harness sids are harness-minted, and the two only
      // meet when a caller echoed the instance id back as the session key
      // (dashboard fallback reads do exactly this — see SessionPane's
      // readHistory). Storing it poisons the row permanently: every later
      // restore re-addresses the bogus key. Refuse it loudly and keep whatever
      // the row already had.
      if (sessionId === id) {
        console.warn(
          `[hub] refused self session_id for ${id}: a harness session is never its own instance`
        );
        return;
      }
      // Naming its conversation is liveness, not the session doing something.
      db.update(instances)
        .set({
          sessionId,
          ...(cwd ? { cwd } : {}),
          ...(harness ? { harness } : {}),
          ...(tooling ? { tooling } : {}),
        })
        .where(eq(instances.id, id))
        .run();
    },
    // The daemon went away: its sessions may or may not still be alive out there.
    // `updatedAt` deliberately untouched: the hub losing the daemon socket is
    // not the session doing anything.
    oweSpawn: (id, envelope, at) => {
      db.update(instances)
        .set({ owedSpawn: envelope, owedAt: at })
        .where(eq(instances.id, id))
        .run();
    },
    owedSpawns: (machineId) =>
      db
        .select({ id: instances.id, envelope: instances.owedSpawn })
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            isNotNull(instances.owedSpawn)
          )
        )
        .orderBy(asc(instances.owedAt), asc(instances.id))
        .all()
        .flatMap((row) =>
          row.envelope ? [{ id: row.id, envelope: row.envelope }] : []
        ),
    takeOwedSpawn: (id) =>
      db
        .update(instances)
        .set({ owedSpawn: null, owedAt: null })
        .where(and(eq(instances.id, id), isNotNull(instances.owedSpawn)))
        .returning({ id: instances.id })
        .all().length > 0,
    reconcileInstances: (machineId, liveIds) => {
      db.update(instances)
        .set({ status: "unknown" })
        .where(
          and(
            eq(instances.machineId, machineId),
            // A start owed to a machine is not a process that went away.
            isNull(instances.owedSpawn),
            inArray(instances.status, ["running", "starting"]),
            liveIds.length > 0 ? notInArray(instances.id, liveIds) : undefined
          )
        )
        .run();
    },
    // The daemon is back and authoritative: a session it no longer carries has
    // no process any more — settled so it stays on the board instead of
    // ghosting, and separated at the source into the ones that can come back
    // and the ones whose transcript went with the process.
    settleInstances: (machineId, liveIds, resumable, resumableAt) => {
      if (resumable) {
        // The authoritative catalog says which Claude conversations still exist.
        // A previously failed resume is checked too, without launching it again.
        db.update(instances)
          .set({ status: "error", lastError: CLAUDE_CONVERSATION_GONE })
          .where(
            and(
              eq(instances.machineId, machineId),
              eq(instances.machineRemoved, false),
              or(eq(instances.harness, "claude"), isNull(instances.harness)),
              isNotNull(instances.sessionId),
              notInArray(instances.status, ["stopped", "discarded"]),
              liveIds.length ? notInArray(instances.id, liveIds) : undefined,
              resumable.length
                ? notInArray(instances.sessionId, resumable)
                : undefined
            )
          )
          .run();
      }
      // First, the ones it *does* carry. A dropped socket marks every session on
      // the machine `unknown` (see `reconcileInstances`), because from the hub's
      // side a daemon that vanished tells you nothing about the processes it
      // left behind. But the daemon coming back and naming them is exactly the
      // answer that was missing, and without this nothing ever undoes the
      // demotion: one hub restart moved every live session on a machine into
      // "not running" permanently, where the rail files it under history.
      if (liveIds.length > 0) {
        // `updatedAt` deliberately untouched, same rule as `sweepBootStatuses`
        // below: the hub learning that a row it had misfiled is alive is the
        // hub correcting itself, not the session doing anything. Stamping it
        // here dated every live session on the machine to the register.
        db.update(instances)
          .set({ status: "running", lastError: null })
          .where(
            and(
              eq(instances.machineId, machineId),
              // Every state a live process can be wrongly filed under — a
              // demotion while the machine was unreachable, a spawn never
              // confirmed, a nap the daemon has since woken from. Not
              // `stopped`/`discarded`: those are decisions, and a daemon still
              // holding a process the operator asked to end is a bug to fix on
              // the daemon, not a status to overwrite here.
              inArray(instances.status, [
                "starting",
                "unknown",
                "sleeping",
                "error",
              ]),
              inArray(instances.id, liveIds)
            )
          )
          .run();
      }

      const orphans = db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            eq(instances.machineRemoved, false),
            isNull(instances.owedSpawn),
            inArray(instances.status, ["running", "starting", "unknown"]),
            liveIds.length > 0 ? notInArray(instances.id, liveIds) : undefined
          )
        )
        .all();

      const catalog = resumable && new Set(resumable);
      const settled = orphans.map((row) => {
        const resumes =
          !catalog ||
          (row.sessionId !== null &&
            (row.harness === "opencode" || catalog.has(row.sessionId)));
        // OpenCode's listing is a directory/project-filtered catalog, not a
        // proof of absence. Only recovery's keyed session.get can decide that
        // a recorded conversation is gone; a hub restart cannot infer it here.
        // A session that lost its process but kept its conversation is not
        // broken — it is asleep. It used to land in `error` carrying a marker
        // string that said so in prose, which made every rail draw a red row
        // for a restart nobody needed to hear about, and made a real failure
        // indistinguishable from a nap. `sleeping` is the honest value, and it
        // carries no `lastError` because nothing went wrong.
        db.update(instances)
          .set(
            resumes
              ? { status: "sleeping", lastError: null }
              : { status: "error", lastError: RESTART_LOST }
          )
          .where(eq(instances.id, row.id))
          .run();
        return { row, resumes };
      });

      // Last, the truth about when each of these sessions actually moved.
      dateStoredSessions(machineId, liveIds, resumableAt);

      return settled;
    },
    // Every 15 seconds, the machine says what it is actually carrying. This is
    // the only place `running` is minted from evidence rather than intent.
    reconcileHeartbeat: (machineId, liveIds, graceMs) => {
      const now = new Date();
      const promoted =
        liveIds.length === 0
          ? []
          : db
              .update(instances)
              // `updatedAt` untouched for the same reason the status filter
              // below omits `running`: a promotion is the hub agreeing with the
              // beat, not the session moving. It used to be stamped here, which
              // dated every session the beat corrected to the beat itself.
              .set({ status: "running", lastError: null })
              .where(
                and(
                  eq(instances.machineId, machineId),
                  eq(instances.machineRemoved, false),
                  inArray(instances.id, liveIds),
                  // Note the omission of `running`: a row already at `running`
                  // that the beat lists has not moved, and writing it anyway
                  // would touch it every 15s, erasing the one column that says
                  // when a session last did something.
                  inArray(instances.status, [
                    "starting",
                    "unknown",
                    "sleeping",
                    "error",
                  ])
                )
              )
              .returning({ id: instances.id })
              .all()
              .map((row) => row.id);

      // The beat's silence, which is the half that was missing. A row claiming a
      // process the machine does not list has no process; the only question left
      // is whether the conversation outlived it.
      const gone = db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            eq(instances.machineRemoved, false),
            isNull(instances.owedSpawn),
            inArray(instances.status, ["running", "starting"]),
            liveIds.length > 0 ? notInArray(instances.id, liveIds) : undefined
          )
        )
        .all()
        // Only `starting` gets grace, measured from when the spawn was issued,
        // not the session's last activity. Without an issue-time there is no grace.
        .filter(
          (row) =>
            row.status === "running" ||
            row.spawnedAt === null ||
            now.getTime() - row.spawnedAt.getTime() >= graceMs
        );

      // `updatedAt` deliberately absent: the hub concluding that a process
      // vanished is not the session doing anything.
      for (const row of gone) {
        db.update(instances)
          .set(
            row.sessionId
              ? { status: "sleeping", lastError: null }
              : { status: "error", lastError: RESTART_LOST }
          )
          .where(eq(instances.id, row.id))
          .run();
      }
      return { promoted, settled: gone };
    },
    // A process coming up is liveness, not the session doing something.
    markInstanceLive: (id) =>
      db
        .update(instances)
        .set({ status: "running", lastError: null })
        .where(
          and(
            eq(instances.id, id),
            inArray(instances.status, [
              "starting",
              "unknown",
              "sleeping",
              "error",
            ])
          )
        )
        .returning({ id: instances.id })
        .all().length > 0,
    settleUnavailableRecovery: (id) => {
      const row = db.select().from(instances).where(eq(instances.id, id)).get();
      if (!row || (row.status !== "starting" && row.status !== "unknown")) {
        return false;
      }
      db.update(instances)
        .set(
          row.sessionId
            ? { status: "sleeping", lastError: null }
            : { status: "error", lastError: RESTART_LOST }
        )
        .where(eq(instances.id, id))
        .run();
      return true;
    },
    // `updatedAt` is deliberately untouched by both halves: reclassifying a row
    // is the hub admitting what it does not know, not the session doing
    // anything, and `updatedAt` is what the restore horizon reads to tell a
    // session that stopped a minute ago from one that stopped last Tuesday.
    // Stamping it here would make every row on the machine look freshly alive.
    sweepBootStatuses: (legacyResumableError) => {
      const toUnknown = db
        .update(instances)
        .set({ status: "unknown" })
        .where(
          and(
            isNull(instances.owedSpawn),
            inArray(instances.status, ["running", "starting"])
          )
        )
        .returning({ id: instances.id })
        .all().length;
      const toSleeping = db
        .update(instances)
        .set({ status: "sleeping", lastError: null })
        .where(
          and(
            eq(instances.status, "error"),
            eq(instances.lastError, legacyResumableError)
          )
        )
        .returning({ id: instances.id })
        .all().length;
      return { toUnknown, toSleeping };
    },
    listToolPolicies: () =>
      db
        .select()
        .from(tools)
        .all()
        .map(({ id, required, pinnedVersion }) => ({
          id,
          required,
          pinnedVersion,
        })),
    putToolPolicy: (id, { required, pinnedVersion }) => {
      const stored = db.select().from(tools).where(eq(tools.id, id)).get();
      const policy: ToolPolicy = {
        id,
        required: required ?? stored?.required ?? false,
        pinnedVersion:
          pinnedVersion === undefined
            ? (stored?.pinnedVersion ?? null)
            : pinnedVersion,
      };
      db.insert(tools)
        .values(policy)
        .onConflictDoUpdate({
          target: tools.id,
          set: {
            required: policy.required,
            pinnedVersion: policy.pinnedVersion,
          },
        })
        .run();
      return policy;
    },
    agentTools,
    // A report with nothing in it says nothing: a daemon that predates the tool
    // catalog must not read as a machine that has just lost every tool on it.
    mergeAgentTools: (machineId, statuses) => {
      if (statuses.length === 0) {
        return;
      }
      writeAgentTools(machineId, {
        ...agentTools(machineId),
        ...Object.fromEntries(statuses.map((status) => [status.id, status])),
      });
    },
    setAgentHarnesses: (machineId, harnesses) => {
      db.update(agents)
        .set({ harnesses })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentToolCell: (machineId, status) => {
      writeAgentTools(machineId, {
        ...agentTools(machineId),
        [status.id]: status,
      });
    },
    fleetConfig: (machineId?: string) => {
      // What that machine's last sync said it holds. Absent for an older daemon
      // that does not report it, and absent for a machine nobody named — both
      // of which are then sent everything, exactly as before.
      const have = machineId
        ? db
            .select({ fleet: agents.fleet })
            .from(agents)
            .where(eq(agents.machineId, machineId))
            .get()?.fleet?.have
        : undefined;
      const held = (
        kind: "skills" | "plugins",
        name: string,
        hash: string
      ): boolean => have?.[kind]?.[name] === hash;
      return {
        mcp: db
          .select()
          .from(mcpServers)
          .all()
          .map(({ name, config, enabled, authMode, authError }) => {
            const signedIn =
              authMode === "direct" ||
              Boolean(
                db
                  .select({ tokens: fleetMcpOauth.tokens })
                  .from(fleetMcpOauth)
                  .where(eq(fleetMcpOauth.name, name))
                  .get()?.tokens
              );
            let state: "failed" | "signed-in" | "needs-auth" = signedIn
              ? "signed-in"
              : "needs-auth";
            if (authError) {
              state = "failed";
            }
            return {
              name,
              config,
              enabled,
              auth: {
                mode: authMode,
                state,
                ...(authError ? { detail: authError } : {}),
              },
            };
          }),
        marketplaces: db
          .select()
          .from(marketplaces)
          .all()
          .map(({ name, source }) => ({ name, source })),
        plugins: db
          .select()
          .from(plugins)
          .all()
          .map(({ id, enabled }) => ({ id, enabled })),
        // Only the rows that resolved: a skill with no files is nothing a machine
        // could converge on, and one whose row says nothing is not sent at all.
        skills: [
          ...db
            .select({
              name: skills.name,
              hash: skills.hash,
              files: skills.files,
            })
            .from(skills)
            .where(eq(skills.enabled, true))
            .all()
            .flatMap(({ name, hash, files }) =>
              hash && files
                ? [
                    {
                      name,
                      hash,
                      ...(held("skills", name, hash) ? {} : { files }),
                    },
                  ]
                : []
            ),
          ...db
            .select()
            .from(workflows)
            .all()
            .map((workflow) => {
              const skill = workflowSkill(workflow, workflow.inputs);
              if (held("skills", skill.name, skill.hash)) {
                skill.files = undefined;
              }
              return skill;
            }),
        ],
        // Only the rows a resolve filled in. A plugin the hub could not fetch is
        // simply absent here, and the daemon installs it the old way — which is
        // the one path left that needs the machine to reach the source itself.
        pluginPayloads: db
          .select({
            id: plugins.id,
            hash: plugins.hash,
            bytes: plugins.bytes,
            files: plugins.files,
          })
          .from(plugins)
          .where(eq(plugins.enabled, true))
          .all()
          .flatMap(({ id, hash, bytes, files }) => {
            if (!(hash && files)) {
              return [];
            }
            const name = id.split("@")[0] ?? id;
            return [
              {
                name,
                marketplace: id.split("@")[1] ?? "",
                hash,
                bytes: bytes ?? 0,
                ...(held("plugins", name, hash) ? {} : { files }),
              },
            ];
          }),
        // Null rather than absent: a fleet that keeps no memory is what has a
        // machine give back the copy cawco wrote it — the linked documents
        // included, since a set with no main file is not a set.
        memory: (() => {
          const stored = getFleetMemory();
          if (!stored) {
            return null;
          }
          return {
            hash: stored.hash,
            content: stored.content,
            docs: listFleetMemoryDocs().map(
              ({ path: docPath, hash, content }) => ({
                path: docPath,
                hash,
                content,
              })
            ),
          };
        })(),
        // Always an array, like `skills` above, never omitted: this hub is not
        // one that predates hooks, so there is no version-skew reason to leave
        // the field out the way an old daemon's absence is read. A disabled row
        // is simply not one of them — the same rule a disabled MCP server or
        // skill already follows.
        hooks: db
          .select()
          .from(fleetHooks)
          .where(eq(fleetHooks.enabled, true))
          .all()
          .map(hookOf),
        // The fleet's denied-tools list, from the supervisor_config single row.
        // Absent (undefined) when no row exists yet, which is what has a daemon
        // fall back to compiled constants — the same list the migration seeds.
        deniedTools: (() => {
          const row = db
            .select({ deniedTools: supervisorConfig.deniedTools })
            .from(supervisorConfig)
            .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
            .get();
          return row?.deniedTools ?? undefined;
        })(),
      };
    },
    putMcpServer: ({ name, config, enabled }) => {
      const previous = db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .get();
      const changed =
        !previous || JSON.stringify(previous.config) !== JSON.stringify(config);
      if (changed) {
        db.delete(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).run();
      }
      const server: FleetMcpServer = { name, config, enabled: enabled ?? true };
      db.insert(mcpServers)
        .values(server)
        .onConflictDoUpdate({
          target: mcpServers.name,
          set: {
            config,
            enabled: server.enabled,
            ...(changed
              ? { authMode: "direct" as const, authError: null }
              : {}),
          },
        })
        .run();
      return server;
    },
    deleteMcpServer: (name) => {
      db.delete(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).run();
      db.delete(mcpServers).where(eq(mcpServers.name, name)).run();
    },
    putMarketplace: ({ name, source }) => {
      db.insert(marketplaces)
        .values({ name, source })
        .onConflictDoUpdate({ target: marketplaces.name, set: { source } })
        .run();
      return { name, source };
    },
    deleteMarketplace: (name) => {
      db.delete(marketplaces).where(eq(marketplaces.name, name)).run();
    },
    putPluginPayload: ({ id, hash, bytes, error, files }) => {
      db.update(plugins)
        .set({
          hash: hash ?? null,
          bytes: bytes ?? null,
          error: error ?? null,
          files: files ?? null,
        })
        .where(eq(plugins.id, id))
        .run();
    },
    unresolvedPlugins: () =>
      db
        .select({ id: plugins.id, hash: plugins.hash, error: plugins.error })
        .from(plugins)
        .where(eq(plugins.enabled, true))
        .all()
        .flatMap(({ id, hash, error }) => (hash || error ? [] : [id])),
    listPlugins: () =>
      db
        .select({
          id: plugins.id,
          enabled: plugins.enabled,
          hash: plugins.hash,
          bytes: plugins.bytes,
          error: plugins.error,
        })
        .from(plugins)
        .all()
        .map(({ id, enabled, hash, bytes, error }) => ({
          id,
          enabled,
          ...(hash ? { hash } : {}),
          ...(bytes === null ? {} : { bytes }),
          ...(error ? { error } : {}),
        })),
    putPlugin: ({ id, enabled }) => {
      const plugin: FleetPlugin = { id, enabled: enabled ?? true };
      db.insert(plugins)
        .values(plugin)
        .onConflictDoUpdate({
          target: plugins.id,
          set: { enabled: plugin.enabled },
        })
        .run();
      return plugin;
    },
    deletePlugin: (id) => {
      db.delete(plugins).where(eq(plugins.id, id)).run();
    },
    listSkills: () =>
      db
        .select({
          name: skills.name,
          source: skills.source,
          enabled: skills.enabled,
          hash: skills.hash,
          bytes: skills.bytes,
          error: skills.error,
        })
        .from(skills)
        .all()
        .map(skillMeta),
    putSkill: ({ name, source, enabled, hash, bytes, error, files }) => {
      if (
        db
          .select()
          .from(workflows)
          .all()
          .some((workflow) => `wf-${workflow.slug}` === name)
      ) {
        throw new Error(
          `Skill ${name} is owned by a workflow; edit or delete that workflow instead.`
        );
      }
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      // A resolve that failed on the source the row already carries keeps the
      // last copy that worked: the machines are serving it, and a repo that was
      // unreachable for a minute is no reason to take a working skill off them.
      const keep = error !== undefined && stored?.source === source;
      const row = {
        name,
        source,
        enabled: enabled ?? true,
        hash: (keep ? stored.hash : hash) ?? null,
        bytes: (keep ? stored.bytes : bytes) ?? null,
        error: error ?? null,
        files: (keep ? stored.files : files) ?? null,
      };
      db.insert(skills)
        .values(row)
        .onConflictDoUpdate({
          target: skills.name,
          set: {
            source: row.source,
            enabled: row.enabled,
            hash: row.hash,
            bytes: row.bytes,
            error: row.error,
            files: row.files,
          },
        })
        .run();
      return skillMeta(row);
    },
    deleteSkill: (name) => {
      db.delete(skills).where(eq(skills.name, name)).run();
    },
    listFleetAgents: () =>
      db
        .select()
        .from(fleetAgents)
        .orderBy(fleetAgents.name)
        .all()
        .map(agentFile),
    putFleetAgent: ({ name, content }) => {
      const row = {
        name,
        content,
        hash: hashText(content),
        bytes: Buffer.byteLength(content),
        updatedAt: new Date(),
      };
      db.insert(fleetAgents)
        .values(row)
        .onConflictDoUpdate({
          target: fleetAgents.name,
          set: {
            content: row.content,
            hash: row.hash,
            bytes: row.bytes,
            updatedAt: row.updatedAt,
          },
        })
        .run();
      return agentFile(row);
    },
    deleteFleetAgent: (name) => {
      db.delete(fleetAgents).where(eq(fleetAgents.name, name)).run();
    },
    listFleetHooks: () =>
      db.select().from(fleetHooks).orderBy(fleetHooks.name).all().map(hookOf),
    getFleetHook: (id) => {
      const row = db
        .select()
        .from(fleetHooks)
        .where(eq(fleetHooks.id, id))
        .get();
      return row ? hookOf(row) : undefined;
    },
    putFleetHook: (hook) => {
      const values = {
        id: hook.id,
        name: hook.name,
        enabled: hook.enabled,
        event: hook.event,
        matcher: hook.matcher ?? null,
        handler: hook.handler,
        script: hook.script ?? null,
        hash: hashHookMaterial(hook),
        scope: hook.scope ?? null,
        projectId: hook.projectId ?? null,
        updatedAt: new Date(),
      };
      db.insert(fleetHooks)
        .values({ ...values, createdAt: values.updatedAt })
        // `createdAt` is deliberately absent from the update set, like a
        // rule's: editing a hook must not reorder the list under the person
        // editing it.
        .onConflictDoUpdate({
          target: fleetHooks.id,
          set: {
            name: values.name,
            enabled: values.enabled,
            event: values.event,
            matcher: values.matcher,
            handler: values.handler,
            script: values.script,
            hash: values.hash,
            scope: values.scope,
            projectId: values.projectId,
            updatedAt: values.updatedAt,
          },
        })
        .run();
      return hookOf(values);
    },
    deleteFleetHook: (id) => {
      db.delete(fleetHooks).where(eq(fleetHooks.id, id)).run();
    },
    recordFleetHook: (version) => {
      db.insert(fleetHookHistory)
        .values({
          hookId: version.hookId,
          name: version.name,
          enabled: version.enabled,
          event: version.event,
          matcher: version.matcher ?? null,
          handler: version.handler,
          script: version.script ?? null,
          hash: version.hash,
          scope: version.scope ?? null,
          projectId: version.projectId ?? null,
          source: version.source,
        })
        .run();
      // Pruned within the one hook's own history, exactly as a memory
      // document's is: a fleet of fifty hooks would otherwise have every
      // save of any one of them evict another's past.
      const keep = db
        .select({ id: fleetHookHistory.id })
        .from(fleetHookHistory)
        .where(eq(fleetHookHistory.hookId, version.hookId))
        .orderBy(desc(fleetHookHistory.id))
        .limit(HISTORY_LIMIT)
        .all()
        .map((row) => row.id);
      db.delete(fleetHookHistory)
        .where(
          and(
            eq(fleetHookHistory.hookId, version.hookId),
            notInArray(fleetHookHistory.id, keep)
          )
        )
        .run();
    },
    listFleetHookHistory: (hookId) =>
      db
        .select()
        .from(fleetHookHistory)
        .where(
          hookId === undefined ? undefined : eq(fleetHookHistory.hookId, hookId)
        )
        .orderBy(desc(fleetHookHistory.id))
        .all()
        .map(({ id, hookId: of, name, hash, source, createdAt }) => ({
          id,
          hookId: of,
          name,
          hash,
          source,
          createdAt,
        })),
    fleetHookVersion: (id) => {
      const row = db
        .select()
        .from(fleetHookHistory)
        .where(eq(fleetHookHistory.id, id))
        .get();
      if (!row) {
        return;
      }
      return {
        id: row.id,
        hookId: row.hookId,
        name: row.name,
        hash: row.hash,
        source: row.source,
        createdAt: row.createdAt,
        event: row.event,
        ...(row.matcher ? { matcher: row.matcher } : {}),
        enabled: row.enabled,
        handler: row.handler,
        ...(row.script ? { script: row.script } : {}),
        ...(row.scope ? { scope: row.scope } : {}),
        ...(row.projectId ? { projectId: row.projectId } : {}),
      };
    },
    getFleetMemory,
    setFleetMemory: (content) => {
      const row = {
        id: MEMORY_ID,
        content,
        hash: hashText(content),
        updatedAt: new Date(),
      };
      db.insert(fleetMemory)
        .values(row)
        .onConflictDoUpdate({
          target: fleetMemory.id,
          set: {
            content: row.content,
            hash: row.hash,
            updatedAt: row.updatedAt,
          },
        })
        .run();
      return { content: row.content, hash: row.hash, updatedAt: row.updatedAt };
    },
    clearFleetMemory: () => {
      db.delete(fleetMemory).where(eq(fleetMemory.id, MEMORY_ID)).run();
    },
    listFleetMemoryDocs,
    getFleetMemoryDoc: (docPath) => {
      const row = db
        .select()
        .from(fleetMemoryDocs)
        .where(eq(fleetMemoryDocs.path, docPath))
        .get();
      return row
        ? {
            path: row.path,
            content: row.content,
            hash: row.hash,
            updatedAt: row.updatedAt,
          }
        : undefined;
    },
    putFleetMemoryDoc: ({ path: docPath, content }) => {
      const row = {
        path: docPath,
        content,
        hash: hashText(content),
        updatedAt: new Date(),
      };
      db.insert(fleetMemoryDocs)
        .values(row)
        .onConflictDoUpdate({
          target: fleetMemoryDocs.path,
          set: {
            content: row.content,
            hash: row.hash,
            updatedAt: row.updatedAt,
          },
        })
        .run();
      return row;
    },
    deleteFleetMemoryDoc: (docPath) => {
      db.delete(fleetMemoryDocs).where(eq(fleetMemoryDocs.path, docPath)).run();
    },
    recordFleetMemory: ({ content, hash, source, path: docPath }) => {
      db.insert(fleetMemoryHistory)
        .values({ content, hash, source, path: docPath ?? null })
        .run();
      // Pruned within the one document's own history: a set of ten would
      // otherwise have each save evict the main file's past nine times over.
      const of =
        docPath === undefined
          ? isNull(fleetMemoryHistory.path)
          : eq(fleetMemoryHistory.path, docPath);
      const keep = db
        .select({ id: fleetMemoryHistory.id })
        .from(fleetMemoryHistory)
        .where(of)
        .orderBy(desc(fleetMemoryHistory.id))
        .limit(HISTORY_LIMIT)
        .all()
        .map((row) => row.id);
      db.delete(fleetMemoryHistory)
        .where(and(of, notInArray(fleetMemoryHistory.id, keep)))
        .run();
    },
    listFleetMemoryHistory: (docPath) =>
      db
        .select()
        .from(fleetMemoryHistory)
        .where(
          docPath === undefined
            ? isNull(fleetMemoryHistory.path)
            : eq(fleetMemoryHistory.path, docPath)
        )
        .orderBy(desc(fleetMemoryHistory.id))
        .all()
        .map(({ id, hash, source, content, createdAt, path: of }) => ({
          id,
          hash,
          source,
          ...(of ? { path: of } : {}),
          bytes: Buffer.byteLength(content),
          createdAt,
        })),
    fleetMemoryVersion: (id) => {
      const row = db
        .select()
        .from(fleetMemoryHistory)
        .where(eq(fleetMemoryHistory.id, id))
        .get();
      return row
        ? {
            id: row.id,
            hash: row.hash,
            source: row.source,
            ...(row.path ? { path: row.path } : {}),
            bytes: Buffer.byteLength(row.content),
            createdAt: row.createdAt,
            content: row.content,
          }
        : undefined;
    },
    setAgentFleet: (machineId, report) => {
      // A report that says nothing about what the machine holds does not
      // RETRACT what it last claimed. Several paths write this column — a sync
      // and a status among them — and only some of them are in a position to
      // know; a silent one dropping the claim would have the hub resend every
      // byte of every skill and plugin on the next fleet change. Only a report
      // that carries `have` replaces it, because that one has counted.
      const kept = report.have
        ? report
        : {
            ...report,
            ...(() => {
              const previous = db
                .select({ fleet: agents.fleet })
                .from(agents)
                .where(eq(agents.machineId, machineId))
                .get()?.fleet?.have;
              return previous ? { have: previous } : {};
            })(),
          };
      db.update(agents)
        .set({ fleet: kept })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    listAgents: () =>
      db
        .select()
        .from(agents)
        .all()
        .map(
          ({
            addressContract: _addressContract,
            fleet,
            build,
            harnesses,
            machineCapabilities,
            ...agent
          }) => ({
            ...agent,
            ...(fleet ? { fleet } : {}),
            ...(build ? { build } : {}),
            ...(harnesses ? { harnesses } : {}),
            ...(machineCapabilities ? { machineCapabilities } : {}),
          })
        ),
    // A discarded side quest is gone for good, and a row that has not moved in a
    // day is history no rail has a use for — a running one stays whatever its
    // age, and so does a sleeping one: it is a conversation the fleet can pick
    // back up, and the tab strip's SSR load has to find it or the session it
    // opens reads "no messages yet". `sleeping` used to survive the cut by
    // having its `updatedAt` touched on every register instead, which kept it
    // listed at the price of every age in the rail reading the same.
    listInstances: () =>
      db
        .select(publicColumns)
        .from(instances)
        .where(listedInstances())
        .all()
        // A row nobody named answers with the name its first message gave it,
        // so every listing — the rail, the tab strip, the first server render —
        // already carries it and no label changes once a transcript loads. The
        // column itself stays as it was: a given title is still what wins here.
        .map((row) => ({
          ...(row.title ? row : { ...row, title: row.derivedTitle }),
          ...(row.autopilot ? { autopilot: row.autopilot } : {}),
        })),
    getInstancesByIds: (ids) => {
      if (ids.length === 0) {
        return [];
      }
      return db
        .select(publicColumns)
        .from(instances)
        .where(
          and(
            inArray(instances.id, ids),
            eq(instances.machineRemoved, false),
            ne(instances.status, "discarded"),
            or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
          )
        )
        .all();
    },
    instanceBySessionId: (sessionId) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(
          and(
            eq(instances.sessionId, sessionId),
            eq(instances.machineRemoved, false),
            ne(instances.status, "discarded"),
            or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
          )
        )
        .limit(1)
        .all()[0],
    unnamedSessions: (machineId) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            ne(instances.status, "discarded"),
            isNull(instances.title),
            isNull(instances.derivedTitle),
            isNotNull(instances.sessionId),
            or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
          )
        )
        .all(),
    listProjects: () =>
      withPlaces(
        db.select().from(projects).all(),
        db.select().from(projectPlaces).all()
      ),
    project: (id) => projectOf(db, id),
    projectByRemote: (remote) => {
      const [oldest] = db
        .select()
        .from(projects)
        .where(eq(projects.remote, remote))
        .orderBy(asc(projects.createdAt), asc(projects.id))
        .limit(1)
        .all();
      return oldest && projectOf(db, oldest.id);
    },
    projectsWithoutRemote: (machineId) => {
      const rows = db
        .select({ projectId: projects.id, path: projectPlaces.path })
        .from(projects)
        .innerJoin(projectPlaces, eq(projectPlaces.projectId, projects.id))
        .where(
          and(
            isNull(projects.remote),
            eq(projectPlaces.machineId, machineId),
            eq(projectPlaces.kind, "checkout")
          )
        )
        .orderBy(asc(projectPlaces.createdAt))
        .all();
      // One read per project: its first checkout on the machine answers it.
      const first = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        if (!first.has(row.projectId)) {
          first.set(row.projectId, row);
        }
      }
      return [...first.values()];
    },
    setProjectRemote: (id, remote) => {
      db.update(projects).set({ remote }).where(eq(projects.id, id)).run();
    },
    setProjectTracker: (id, tracker) => {
      db.update(projects).set({ tracker }).where(eq(projects.id, id)).run();
    },
    setProjectDispatch: (id, change) => {
      if (Object.keys(change).length > 0) {
        db.update(projects).set(change).where(eq(projects.id, id)).run();
      }
    },
    projectAttempts: (projectId) =>
      db
        .select()
        .from(workItems)
        .where(
          and(eq(workItems.projectId, projectId), isNotNull(workItems.taskId))
        )
        .orderBy(desc(workItems.createdAt), desc(workItems.id))
        .all(),
    queuedTaskStarts: (projectId) =>
      db
        .select()
        .from(queuedTaskStarts)
        .where(eq(queuedTaskStarts.projectId, projectId))
        .orderBy(asc(queuedTaskStarts.queuedAt), asc(queuedTaskStarts.taskId))
        .all(),
    queueTaskStart: (row) =>
      db
        .insert(queuedTaskStarts)
        .values(row)
        .onConflictDoUpdate({
          target: [queuedTaskStarts.projectId, queuedTaskStarts.taskId],
          set: {
            stage: row.stage,
            parentInstanceId: row.parentInstanceId,
            why: row.why ?? "cap",
            queuedAt: new Date(),
          },
        })
        .returning()
        .get(),
    dropQueuedTaskStart: (projectId, taskId) => {
      db.delete(queuedTaskStarts)
        .where(
          and(
            eq(queuedTaskStarts.projectId, projectId),
            eq(queuedTaskStarts.taskId, taskId)
          )
        )
        .run();
    },
    workItemByPrUrl: (url) =>
      db
        .select()
        .from(workItems)
        .where(eq(workItems.prUrl, url))
        .orderBy(desc(workItems.createdAt))
        .limit(1)
        .get(),
    taskIndex: (projectId) =>
      db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.projectId, projectId))
        .orderBy(asc(projectTasks.number), asc(projectTasks.path))
        .all(),
    putTaskIndex: (rows) => {
      if (rows.length === 0) {
        return;
      }
      db.transaction((tx) => {
        for (const row of rows) {
          tx.insert(projectTasks)
            .values(row)
            .onConflictDoUpdate({
              target: [projectTasks.projectId, projectTasks.path],
              set: row,
            })
            .run();
        }
      });
    },
    dropTaskIndex: (projectId, paths) => {
      if (paths.length === 0) {
        return;
      }
      db.delete(projectTasks)
        .where(
          and(
            eq(projectTasks.projectId, projectId),
            inArray(projectTasks.path, paths)
          )
        )
        .run();
    },
    createProject: ({ id, machineId, name, cwd, remote }) =>
      db.transaction((tx) => {
        tx.insert(projects).values({ id, machineId, name, cwd, remote }).run();
        tx.insert(projectPlaces)
          .values({
            id: crypto.randomUUID(),
            projectId: id,
            machineId,
            path: cwd,
            kind: "checkout",
          })
          .run();
        const created = projectOf(tx, id);
        if (!created) {
          throw new Error(`project ${id} was not filed`);
        }
        return created;
      }),
    addPlace: (place) => {
      const added = db
        .insert(projectPlaces)
        .values({ id: crypto.randomUUID(), ...place })
        .onConflictDoNothing()
        .returning()
        .get();
      if (added) {
        return { place: added, added: true };
      }
      const standing = db
        .select()
        .from(projectPlaces)
        .where(
          and(
            eq(projectPlaces.projectId, place.projectId),
            eq(projectPlaces.machineId, place.machineId),
            eq(projectPlaces.path, place.path)
          )
        )
        .get();
      if (!standing) {
        throw new Error(
          `place ${place.machineId}:${place.path} of project ${place.projectId} was neither filed nor found`
        );
      }
      return { place: standing, added: false };
    },
    removePlace: (projectId, placeId) => {
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .get();
      const place = db
        .select()
        .from(projectPlaces)
        .where(
          and(
            eq(projectPlaces.id, placeId),
            eq(projectPlaces.projectId, projectId)
          )
        )
        .get();
      if (!(project && place)) {
        return "missing";
      }
      if (isPrimary(project, place)) {
        return "primary";
      }
      db.delete(projectPlaces).where(eq(projectPlaces.id, placeId)).run();
      return "removed";
    },
    removeWorkspacePlaces: (machineId, clone) => {
      db.delete(projectPlaces)
        .where(
          and(
            eq(projectPlaces.kind, "workspace"),
            eq(projectPlaces.machineId, machineId),
            eq(projectPlaces.path, clone)
          )
        )
        .run();
    },
    deleteMachine: (machineId) =>
      db.transaction((tx) => {
        const ids = tx
          .select({ id: instances.id })
          .from(instances)
          .where(eq(instances.machineId, machineId))
          .all()
          .map((row) => row.id);
        // Removing a machine never touches its processes or records end intent.
        tx.update(instances)
          .set({ machineRemoved: true })
          .where(eq(instances.machineId, machineId))
          .run();
        tx.delete(projectPlaces)
          .where(eq(projectPlaces.machineId, machineId))
          .run();
        // A project whose primary place was on the machine moves to its next
        // checkout, or its hub folder; a workspace is a delegate's clone, not
        // somewhere a project lives. With neither left, the project goes.
        const gone: string[] = [];
        const homeless = tx
          .select()
          .from(projects)
          .where(eq(projects.machineId, machineId))
          .all();
        for (const project of homeless) {
          const [next] = tx
            .select()
            .from(projectPlaces)
            .where(
              and(
                eq(projectPlaces.projectId, project.id),
                ne(projectPlaces.kind, "workspace")
              )
            )
            .orderBy(
              sql`case ${projectPlaces.kind} when 'checkout' then 0 else 1 end`,
              asc(projectPlaces.createdAt)
            )
            .limit(1)
            .all();
          if (next) {
            tx.update(projects)
              .set({ machineId: next.machineId, cwd: next.path })
              .where(eq(projects.id, project.id))
              .run();
          } else {
            gone.push(project.id);
          }
        }
        if (gone.length > 0) {
          // The sessions started from them outlive them, unattached.
          tx.update(instances)
            .set({ projectId: null })
            .where(inArray(instances.projectId, gone))
            .run();
          tx.delete(projectPlaces)
            .where(inArray(projectPlaces.projectId, gone))
            .run();
          tx.delete(projectTasks)
            .where(inArray(projectTasks.projectId, gone))
            .run();
          tx.delete(queuedTaskStarts)
            .where(inArray(queuedTaskStarts.projectId, gone))
            .run();
          tx.delete(projects).where(inArray(projects.id, gone)).run();
        }
        tx.delete(usageLimits)
          .where(eq(usageLimits.machineId, machineId))
          .run();
        tx.delete(agents).where(eq(agents.machineId, machineId)).run();
        return { instanceIds: ids, projects: gone.length };
      }),
    deleteProject: (id) => {
      db.transaction((tx) => {
        // The sessions started from it outlive it; they just stop being its.
        tx.update(instances)
          .set({ projectId: null })
          .where(eq(instances.projectId, id))
          .run();
        tx.delete(projectPlaces).where(eq(projectPlaces.projectId, id)).run();
        tx.delete(projectTasks).where(eq(projectTasks.projectId, id)).run();
        tx.delete(queuedTaskStarts)
          .where(eq(queuedTaskStarts.projectId, id))
          .run();
        tx.delete(projects).where(eq(projects.id, id)).run();
      });
    },
    getCredential: (id) =>
      db.select().from(credentials).where(eq(credentials.id, id)).get()?.blob,
    putCredential: (id, blob) => {
      db.insert(credentials)
        .values({ id, blob })
        .onConflictDoUpdate({
          target: credentials.id,
          set: { blob, updatedAt: new Date() },
        })
        .run();
    },
    recordSend: (send) =>
      db.insert(sentMessages).values(send).returning().get(),
    sendRecord: (uuid) =>
      db.select().from(sentMessages).where(eq(sentMessages.uuid, uuid)).get(),
    sendsIn: (instanceId, states) =>
      db
        .select()
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.instanceId, instanceId),
            inArray(sentMessages.state, states)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all(),
    updateSend: (uuid, change) =>
      db
        .update(sentMessages)
        .set(change)
        .where(eq(sentMessages.uuid, uuid))
        .returning()
        .get(),
    beginWorkspaceCreate: (id, machineId) => {
      db.insert(workspaceCreates).values({ id, machineId }).run();
    },
    finishWorkspaceCreate: (id) => {
      db.delete(workspaceCreates).where(eq(workspaceCreates.id, id)).run();
    },
    workspaceCreatesOn: (machineId) =>
      db
        .select()
        .from(workspaceCreates)
        .where(eq(workspaceCreates.machineId, machineId))
        .all(),
    createWorkspace: (workspace) =>
      db.transaction((tx) => {
        const row = tx.insert(workspaces).values(workspace).returning().get();
        tx.delete(workspaceCreates)
          .where(eq(workspaceCreates.id, workspace.id))
          .run();
        return row;
      }),
    workspacesNamed: (idOrPrefix) => {
      const exact = db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, idOrPrefix))
        .all();
      return exact.length
        ? exact
        : db
            .select()
            .from(workspaces)
            .where(sql`${workspaces.id} LIKE ${`${idOrPrefix}%`}`)
            .all();
    },
    createWorkItem: (item) =>
      db.insert(workItems).values(item).returning().get(),
    workItem: (id) =>
      db.select().from(workItems).where(eq(workItems.id, id)).get(),
    waitingWorkItems: () =>
      db
        .select()
        .from(workItems)
        .where(
          or(isNotNull(workItems.waitUntil), isNotNull(workItems.waitResumeBy))
        )
        .all(),
    workItemsIn: (workspaceId) =>
      db
        .select()
        .from(workItems)
        .where(eq(workItems.workspaceId, workspaceId))
        .orderBy(desc(workItems.createdAt))
        .all(),
    runningDelegateCounts: () => {
      const parents = new Map(
        db
          .select({ id: instances.id, parent: instances.parentInstanceId })
          .from(instances)
          .all()
          .map((row) => [row.id, row.parent])
      );
      const live = db
        .select({ parent: workItems.parentInstanceId })
        .from(workItems)
        .where(inArray(workItems.state, ["starting", "running"]))
        .all();
      const counts = new Map<string, number>();
      for (const item of live) {
        const visited = new Set<string>();
        let parent: string | null | undefined = item.parent;
        while (parent && !visited.has(parent)) {
          visited.add(parent);
          counts.set(parent, (counts.get(parent) ?? 0) + 1);
          parent = parents.get(parent);
        }
      }
      return counts;
    },
    liveWorkItems: () =>
      db
        .select()
        .from(workItems)
        .where(inArray(workItems.state, ["starting", "running"]))
        .orderBy(workItems.createdAt)
        .all(),
    groupWorkItems: (parentInstanceId, group) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.parentInstanceId, parentInstanceId),
            eq(workItems.group, group),
            isNull(workItems.groupReportedAt)
          )
        )
        .orderBy(workItems.createdAt)
        .all(),
    sessionCostUsd: (sessionId) =>
      db
        .select({
          usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
        })
        .from(usageBuckets)
        .where(eq(usageBuckets.sessionId, sessionId))
        .get()?.usd ?? 0,
    queuedWorkItems: () =>
      db
        .select()
        .from(queuedWorkItems)
        .orderBy(asc(queuedWorkItems.queuedAt), asc(queuedWorkItems.id))
        .all(),
    queueWorkItem: (row) =>
      db.insert(queuedWorkItems).values(row).returning().get(),
    dropQueuedWorkItem: (id) => {
      db.delete(queuedWorkItems).where(eq(queuedWorkItems.id, id)).run();
    },
    liveWorkItemsOf: (parentInstanceId) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.parentInstanceId, parentInstanceId),
            inArray(workItems.state, ["starting", "running"])
          )
        )
        .all(),
    trayItemsOf: (parentInstanceId, endedSince) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            eq(workItems.parentInstanceId, parentInstanceId),
            isNull(workItems.dismissedAt),
            or(
              inArray(workItems.state, ["starting", "running", "failed"]),
              gte(workItems.endedAt, endedSince)
            )
          )
        )
        .orderBy(workItems.createdAt)
        .all(),
    updateWorkItem: (id, change) =>
      db
        .update(workItems)
        .set(change)
        .where(eq(workItems.id, id))
        .returning()
        .get(),
    activeWorkspacesOn: (machineId) =>
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.machineId, machineId),
            eq(workspaces.state, "active")
          )
        )
        .all(),
    updateWorkspace: (id, change) =>
      db
        .update(workspaces)
        .set(change)
        .where(eq(workspaces.id, id))
        .returning()
        .get(),
    sendsFor: (ids) => {
      const rows: SentMessageRow[] = [];
      // A long transcript names more ids than SQLite binds in one statement.
      for (let at = 0; at < ids.length; at += SENDS_FOR_BATCH) {
        const batch = ids.slice(at, at + SENDS_FOR_BATCH);
        rows.push(
          ...db
            .select()
            .from(sentMessages)
            .where(
              or(
                inArray(sentMessages.uuid, batch),
                inArray(sentMessages.harnessId, batch)
              )
            )
            .all()
        );
      }
      return rows;
    },
    linkSend: (uuid, harnessId) => {
      db.update(sentMessages)
        .set({ harnessId })
        .where(eq(sentMessages.uuid, uuid))
        .run();
    },
    recordDelegateEvent: (event) =>
      delegateEventOf(
        db.insert(delegateEvents).values(event).returning().get()
      ),
    claimCompletedTurn: (instanceId, resultId, completedAt, recovered) => {
      const receivedAt = recovered ? undefined : new Date().toISOString();
      const reports = db
        .select()
        .from(delegateEvents)
        .where(
          and(
            eq(delegateEvents.instanceId, instanceId),
            eq(delegateEvents.kind, "report")
          )
        )
        .all();
      const exact = reports.some(
        ({ requestId, createdAt, payload }) =>
          requestId === resultId ||
          ("resultId" in payload && payload.resultId === resultId) ||
          (completedAt !== undefined &&
            (("completedAt" in payload &&
              payload.completedAt === completedAt) ||
              createdAt.toISOString() === completedAt))
      );
      // An old report without a harness identity cannot prove a fresh completion.
      // Adopt that recovered identity silently, as directed; never guess by time proximity.
      const unkeyed =
        recovered &&
        reports.length > 0 &&
        reports.every(
          ({ payload }) => !("resultId" in payload || "completedAt" in payload)
        );
      const inserted = db
        .insert(completedTurns)
        .values({
          instanceId,
          resultId,
          completedAt: completedAt ?? receivedAt,
          adoptedWithoutReport: unkeyed && !exact,
        })
        .onConflictDoNothing()
        .returning()
        .all();
      return inserted.length > 0 && !exact && !unkeyed;
    },
    recordedTurns: (instanceId) =>
      db
        .select({
          hasTurns: sql<boolean>`count(*) > 0`.mapWith(Boolean),
          lastTurnAt: sql<
            string | null
          >`max(coalesce(${completedTurns.completedAt}, strftime('%Y-%m-%dT%H:%M:%fZ', ${delegateEvents.createdAt} / 1000.0, 'unixepoch')))`,
          unbounded:
            sql<boolean>`count(case when ${completedTurns.completedAt} is null and ${delegateEvents.createdAt} is null then 1 end) > 0`.mapWith(
              Boolean
            ),
        })
        .from(completedTurns)
        .leftJoin(
          delegateEvents,
          and(
            eq(delegateEvents.instanceId, completedTurns.instanceId),
            eq(delegateEvents.kind, "report"),
            sql`json_extract(${delegateEvents.payload}, '$.resultId') = ${completedTurns.resultId}`
          )
        )
        .where(eq(completedTurns.instanceId, instanceId))
        .get() as {
        hasTurns: boolean;
        lastTurnAt: string | null;
        unbounded: boolean;
      },
    delegateAsk: (requestId) => {
      const row = db
        .select()
        .from(delegateEvents)
        .where(
          and(
            eq(delegateEvents.kind, "ask"),
            eq(delegateEvents.requestId, requestId)
          )
        )
        .get();
      return row && delegateEventOf(row);
    },
    settleDelegateAsk: (requestId, status) => {
      db.update(delegateEvents)
        .set({ status })
        .where(
          and(
            eq(delegateEvents.kind, "ask"),
            eq(delegateEvents.requestId, requestId)
          )
        )
        .run();
    },
    // By id after the timestamp: an ask and the answer it settles can land in
    // the same millisecond, and a reader who sees the answer first sees a
    // conversation that runs backwards.
    listDelegateEvents: ({ parent, instance }) =>
      db
        .select()
        .from(delegateEvents)
        .where(
          and(
            parent ? eq(delegateEvents.parentInstanceId, parent) : undefined,
            instance ? eq(delegateEvents.instanceId, instance) : undefined
          )
        )
        .orderBy(delegateEvents.createdAt, delegateEvents.id)
        .all()
        .map(delegateEventOf),
    putUsageBuckets: (machineId, buckets) => {
      if (buckets.length === 0) {
        return;
      }
      // One transaction for the batch: the agent may send hundreds per tick, and
      // a half-written report is worse than a deferred one.
      db.transaction((tx) => {
        for (const bucket of buckets) {
          // The hour row stored before quarters for this session, model and
          // hour goes as its quarters arrive: a daemon's report after any
          // start is a full rebuild, carrying every quarter of every hour it
          // still holds, so the hour is replaced whole, never counted twice.
          // An hour the daemon no longer holds keeps its hour row.
          tx.delete(usageBuckets)
            .where(
              and(
                eq(usageBuckets.machineId, machineId),
                eq(usageBuckets.harness, bucket.harness),
                eq(usageBuckets.sessionId, bucket.sessionId),
                eq(usageBuckets.model, bucket.model),
                eq(usageBuckets.spanMs, HOUR_MS),
                eq(
                  usageBuckets.start,
                  Math.floor(bucket.start / HOUR_MS) * HOUR_MS
                )
              )
            )
            .run();
          const id = `${machineId}:${bucket.harness}:${bucket.sessionId}:${bucket.model}:${bucket.start}`;
          const row = {
            id,
            machineId,
            harness: bucket.harness,
            start: bucket.start,
            spanMs: bucket.spanMs,
            firstTs: bucket.firstTs,
            lastTs: bucket.lastTs,
            sessionId: bucket.sessionId,
            project: bucket.project,
            projectPath: bucket.projectPath,
            model: bucket.model,
            provider: bucket.provider,
            inputTokens: bucket.tokens.input,
            outputTokens: bucket.tokens.output,
            cacheCreationTokens: bucket.tokens.cacheCreation,
            cacheReadTokens: bucket.tokens.cacheRead,
            reasoningTokens: bucket.tokens.reasoning,
            costUsd: bucket.costUsd,
            messages: bucket.messages,
          };
          tx.insert(usageBuckets)
            .values(row)
            .onConflictDoUpdate({
              target: usageBuckets.id,
              // Absolute, not additive: the agent reports bucket totals, so a
              // re-send must overwrite rather than double-count.
              set: {
                start: row.start,
                spanMs: row.spanMs,
                firstTs: row.firstTs,
                lastTs: row.lastTs,
                project: row.project,
                projectPath: row.projectPath,
                model: row.model,
                provider: row.provider,
                inputTokens: row.inputTokens,
                outputTokens: row.outputTokens,
                cacheCreationTokens: row.cacheCreationTokens,
                cacheReadTokens: row.cacheReadTokens,
                reasoningTokens: row.reasoningTokens,
                costUsd: row.costUsd,
                messages: row.messages,
                updatedAt: new Date(),
              },
            })
            .run();
        }
      });
    },
    putUsageLimits: (machineId, limits, openCodeGo) => {
      const at = new Date();
      const previous =
        db
          .select({ payload: usageLimits.payload })
          .from(usageLimits)
          .where(eq(usageLimits.machineId, machineId))
          .get()?.payload ?? null;
      db.insert(usageLimits)
        .values({ machineId, payload: limits, openCodeGo, fetchedAt: at })
        .onConflictDoUpdate({
          target: usageLimits.machineId,
          set: { payload: limits, openCodeGo, fetchedAt: at },
        })
        .run();
      appendLimitHistory(machineId, limits, previous, at);
    },
    usageLimitHistory: ({ machineId, kind, since, until }) =>
      db
        .select()
        .from(usageLimitHistory)
        .where(
          and(
            eq(usageLimitHistory.machineId, machineId),
            ...(kind ? [eq(usageLimitHistory.kind, kind)] : []),
            ...(since
              ? [gte(usageLimitHistory.fetchedAt, new Date(since))]
              : []),
            ...(until
              ? [lte(usageLimitHistory.fetchedAt, new Date(until))]
              : [])
          )
        )
        .orderBy(usageLimitHistory.fetchedAt)
        .all(),
    listUsageLimits: () => db.select().from(usageLimits).all(),
    usageSpend: ({ harness, todayStart, weekStart }) => {
      const since = (start: number) =>
        sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${start} then ${usageBuckets.costUsd} else 0 end), 0)`;
      const row = db
        .select({
          today: since(todayStart),
          week: since(weekStart),
          all: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
        })
        .from(usageBuckets)
        .where(eq(usageBuckets.harness, harness))
        .get();
      return {
        today: row?.today ?? 0,
        week: row?.week ?? 0,
        all: row?.all ?? 0,
      };
    },
    usageSummary: ({ since, until, harness, machineId, groupBy }) => {
      const key = usageKey(groupBy);
      const groups = db
        .select({
          key,
          // A session's buckets all come from the one machine and checkout
          // that ran it, so max() is that machine and that folder.
          machineId: sql<string>`max(${usageBuckets.machineId})`,
          project: sql<string>`max(${usageBuckets.project})`,
          projectPath: sql<string | null>`max(${usageBuckets.projectPath})`,
          input: sql<number>`sum(${usageBuckets.inputTokens})`,
          output: sql<number>`sum(${usageBuckets.outputTokens})`,
          cacheCreation: sql<number>`sum(${usageBuckets.cacheCreationTokens})`,
          cacheRead: sql<number>`sum(${usageBuckets.cacheReadTokens})`,
          reasoning: sql<number>`sum(${usageBuckets.reasoningTokens})`,
          costUsd: sql<number>`sum(${usageBuckets.costUsd})`,
          messages: sql<number>`sum(${usageBuckets.messages})`,
        })
        .from(usageBuckets)
        .where(usageWhere({ since, until, harness, machineId }))
        .groupBy(key)
        .orderBy(key)
        .all();

      // Rows are shown by name, never by id: a machine by its hostname, a
      // session by the title its instance carries (else what it was first
      // asked, else its folder), and a session run outside CawCo by its
      // folder.
      const named = groupBy === "machine" || groupBy === "session";
      const machineOf = usageMachines(named);
      const sessions = usageSessions(groupBy === "session");

      const rows: UsageSummaryRow[] = groups.map((group) => {
        const instance = sessions.get(String(group.key));
        let label = String(group.key);
        if (groupBy === "machine") {
          label = machineOf(String(group.key)).hostname;
        } else if (groupBy === "session") {
          label =
            instance?.name ??
            folderOf(instance?.cwd) ??
            folderOf(group.projectPath) ??
            group.project;
        }
        return {
          key: group.key,
          label,
          machine: named ? machineOf(group.machineId) : null,
          instanceId: instance?.id ?? null,
          input: group.input ?? 0,
          output: group.output ?? 0,
          cacheCreation: group.cacheCreation ?? 0,
          cacheRead: group.cacheRead ?? 0,
          reasoning: group.reasoning ?? 0,
          costUsd: group.costUsd ?? 0,
          messages: group.messages ?? 0,
        };
      });

      const totals: UsageTotals = {
        input: 0,
        output: 0,
        cacheCreation: 0,
        cacheRead: 0,
        reasoning: 0,
        costUsd: 0,
        messages: 0,
      };
      for (const group of rows) {
        totals.input += group.input;
        totals.output += group.output;
        totals.cacheCreation += group.cacheCreation;
        totals.cacheRead += group.cacheRead;
        totals.reasoning += group.reasoning;
        totals.costUsd += group.costUsd;
        totals.messages += group.messages;
      }

      // Models the pricing snapshot cannot price at all. Ask the pricing module
      // rather than inferring from a $0 total: a genuinely free model (say
      // `deepseek-v4-flash-free`, published at 0/0/0) also totals $0, and
      // calling that "no published price" is a lie. `resolveRates` returns null
      // only on a real miss. Scoped by harness/machine but not by time — a
      // model's missing price does not come and go.
      const missingPricing = db
        .select({ model: usageBuckets.model })
        .from(usageBuckets)
        .where(
          and(
            sql`${usageBuckets.inputTokens} + ${usageBuckets.outputTokens} + ${usageBuckets.cacheCreationTokens} + ${usageBuckets.cacheReadTokens} + ${usageBuckets.reasoningTokens} > 0`,
            harness === undefined
              ? undefined
              : eq(usageBuckets.harness, harness as "claude" | "opencode"),
            machineId === undefined
              ? undefined
              : eq(usageBuckets.machineId, machineId)
          )
        )
        .groupBy(usageBuckets.model)
        .all()
        .map((row) => row.model)
        .filter((model) => resolveRates(model) === null);

      return { rows, totals, missingPricing };
    },

    setInstanceAutopilot: (instanceId, value) => {
      db.update(instances)
        .set({ autopilot: value, updatedAt: new Date() })
        .where(eq(instances.id, instanceId))
        .run();
    },
    recordSupervisorEvent: (event) => {
      const row = db
        .insert(supervisorEvents)
        .values({
          instanceId: event.instanceId,
          source: event.source,
          ruleId: event.ruleId ?? null,
          verdict: event.verdict,
          message: event.message ?? null,
          note: event.note ?? null,
          model: event.model ?? null,
          latencyMs: event.latencyMs ?? null,
        })
        .returning()
        .get();
      // Prune to newest SUPERVISOR_EVENTS_RETENTION rows.
      const cutoff = db
        .select({ id: supervisorEvents.id })
        .from(supervisorEvents)
        .orderBy(desc(supervisorEvents.id))
        .limit(1)
        .offset(SUPERVISOR_EVENTS_RETENTION)
        .get();
      if (cutoff) {
        db.delete(supervisorEvents)
          .where(lte(supervisorEvents.id, cutoff.id))
          .run();
      }
      return {
        id: row.id,
        instanceId: row.instanceId,
        source: row.source,
        ruleId: row.ruleId,
        verdict: row.verdict,
        message: row.message,
        note: row.note,
        model: row.model,
        latencyMs: row.latencyMs,
        createdAt: row.createdAt.getTime(),
      };
    },
    listSupervisorEvents: ({ instanceId, limit }) =>
      db
        .select()
        .from(supervisorEvents)
        .where(
          instanceId ? eq(supervisorEvents.instanceId, instanceId) : undefined
        )
        .orderBy(desc(supervisorEvents.createdAt), desc(supervisorEvents.id))
        .limit(limit ?? 100)
        .all()
        .map((row) => ({
          id: row.id,
          instanceId: row.instanceId,
          source: row.source,
          ruleId: row.ruleId,
          verdict: row.verdict,
          message: row.message,
          note: row.note,
          model: row.model,
          latencyMs: row.latencyMs,
          createdAt: row.createdAt.getTime(),
        })),
    getSupervisorConfig: () => {
      const row = db
        .select()
        .from(supervisorConfig)
        .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
        .get();
      return row
        ? {
            enabled: row.enabled,
            baseUrl: row.baseUrl,
            model: row.model,
            apiKey: row.apiKey,
            deniedTools: row.deniedTools,
            updatedAt: row.updatedAt,
          }
        : undefined;
    },
    putSupervisorConfig: (config) => {
      const stored = db
        .select()
        .from(supervisorConfig)
        .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
        .get();
      const values = {
        id: SUPERVISOR_CONFIG_ID,
        enabled: config.enabled ?? stored?.enabled ?? false,
        baseUrl:
          config.baseUrl === undefined
            ? (stored?.baseUrl ?? null)
            : config.baseUrl,
        model:
          config.model === undefined ? (stored?.model ?? null) : config.model,
        apiKey:
          config.apiKey === undefined
            ? (stored?.apiKey ?? null)
            : config.apiKey,
        deniedTools:
          config.deniedTools === undefined
            ? (stored?.deniedTools ?? null)
            : config.deniedTools,
        updatedAt: new Date(),
      };
      db.insert(supervisorConfig)
        .values(values)
        .onConflictDoUpdate({
          target: supervisorConfig.id,
          set: {
            enabled: values.enabled,
            baseUrl: values.baseUrl,
            model: values.model,
            apiKey: values.apiKey,
            deniedTools: values.deniedTools,
            updatedAt: values.updatedAt,
          },
        })
        .run();
    },
    claudeContextWindows: () =>
      Object.fromEntries(
        db
          .select()
          .from(claudeContextWindows)
          .all()
          .map((row) => [row.model, row.contextWindow])
      ),
    continuationRows: () =>
      db.select().from(continuations).orderBy(continuations.createdAt).all(),
    continuationRow: (id) =>
      db.select().from(continuations).where(eq(continuations.id, id)).get(),
    deleteContinuation: (id) => {
      db.delete(continuations).where(eq(continuations.id, id)).run();
    },
    insertContinuation: (row) => {
      const now = new Date();
      return db
        .insert(continuations)
        .values({ ...row, createdAt: now, updatedAt: now })
        .returning()
        .get();
    },
    updateContinuation: (id, patch) =>
      db
        .update(continuations)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(continuations.id, id))
        .returning()
        .get(),
    noteClaudeContextWindow: (model, contextWindow) => {
      db.insert(claudeContextWindows)
        .values({ model, contextWindow, observedAt: new Date() })
        .onConflictDoUpdate({
          target: claudeContextWindows.model,
          set: { contextWindow, observedAt: new Date() },
        })
        .run();
    },
    getOpenRouterConnection: () => {
      const row = db
        .select()
        .from(openrouterConnection)
        .where(eq(openrouterConnection.id, OPENROUTER_CONNECTION_ID))
        .get();
      return row
        ? {
            apiKey: row.apiKey,
            connectedAt: row.connectedAt,
            suggestWhileTyping: row.suggestWhileTyping,
          }
        : undefined;
    },
    addCapabilityUsage: (rows) => {
      db.transaction((tx) => {
        for (const row of rows) {
          tx.insert(capabilityUsageDaily)
            .values(row)
            .onConflictDoUpdate({
              target: [
                capabilityUsageDaily.kind,
                capabilityUsageDaily.name,
                capabilityUsageDaily.day,
              ],
              set: {
                count: sql`${capabilityUsageDaily.count} + ${row.count}`,
              },
            })
            .run();
        }
      });
    },
    capabilityUsageSince: (day) =>
      db
        .select()
        .from(capabilityUsageDaily)
        .where(gte(capabilityUsageDaily.day, day))
        .all(),
    capabilityUsageEmpty: () =>
      db
        .select({ day: capabilityUsageDaily.day })
        .from(capabilityUsageDaily)
        .limit(1)
        .get() === undefined,
    skillsInstalledSince: (since) =>
      db
        .select({ name: skills.name })
        .from(skills)
        .where(gte(skills.createdAt, since))
        .all()
        .map((row) => row.name),
    setSuggestWhileTyping: (enabled) => {
      db.update(openrouterConnection)
        .set({ suggestWhileTyping: enabled })
        .where(eq(openrouterConnection.id, OPENROUTER_CONNECTION_ID))
        .run();
    },
    setOpenRouterConnection: (apiKey) => {
      const connectedAt = new Date();
      db.insert(openrouterConnection)
        .values({ id: OPENROUTER_CONNECTION_ID, apiKey, connectedAt })
        .onConflictDoUpdate({
          target: openrouterConnection.id,
          set: { apiKey, connectedAt },
        })
        .run();
    },
    clearOpenRouterConnection: () => {
      db.delete(openrouterConnection)
        .where(eq(openrouterConnection.id, OPENROUTER_CONNECTION_ID))
        .run();
    },
    push: {
      credentials: () =>
        db
          .select()
          .from(apnsCredentials)
          .where(eq(apnsCredentials.id, APNS_CREDENTIALS_ID))
          .get(),
      setCredentials: (row) => {
        const values = { ...row, savedAt: new Date() };
        db.insert(apnsCredentials)
          .values({ id: APNS_CREDENTIALS_ID, ...values })
          .onConflictDoUpdate({ target: apnsCredentials.id, set: values })
          .run();
      },
      clearCredentials: () => {
        db.delete(apnsCredentials)
          .where(eq(apnsCredentials.id, APNS_CREDENTIALS_ID))
          .run();
      },
      devices: () =>
        db.select().from(pushDevices).orderBy(pushDevices.createdAt).all(),
      putDevice: ({ quiet, ...device }) => {
        const now = new Date();
        return db
          .insert(pushDevices)
          .values({
            ...device,
            quiet: quiet ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: pushDevices.token,
            set: {
              ...device,
              ...(quiet === undefined ? {} : { quiet }),
              updatedAt: now,
            },
          })
          .returning()
          .get();
      },
      dropDevice: (token) =>
        db
          .delete(pushDevices)
          .where(eq(pushDevices.token, token))
          .returning({ token: pushDevices.token })
          .all().length > 0,
      setQuiet: (token, quiet) =>
        db
          .update(pushDevices)
          .set({ quiet, updatedAt: new Date() })
          .where(eq(pushDevices.token, token))
          .returning({ token: pushDevices.token })
          .all().length > 0,
      noteResult: (token, error) => {
        db.update(pushDevices)
          .set(
            error === null
              ? { lastSentAt: new Date(), lastError: null }
              : { lastError: error }
          )
          .where(eq(pushDevices.token, token))
          .run();
      },
    },
    listRules: () =>
      db.select().from(rules).orderBy(desc(rules.createdAt)).all().map(ruleOf),

    getRule: (id) => {
      const row = db.select().from(rules).where(eq(rules.id, id)).get();
      return row ? ruleOf(row) : undefined;
    },

    putRule: (rule) => {
      const values = {
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        trigger: rule.trigger,
        pattern: rule.pattern,
        matchKind: rule.matchKind,
        caseSensitive: rule.caseSensitive,
        wholeWord: rule.wholeWord,
        watch: rule.watch,
        action: rule.action,
        reply: rule.reply,
        prompt: rule.prompt,
        timing: rule.timing,
        interrupt: rule.interrupt,
        repeat: rule.repeat,
        scope: rule.scope,
        createdAt: new Date(rule.createdAt),
        updatedAt: new Date(),
      };
      db.insert(rules)
        .values(values)
        // `createdAt` is deliberately absent from the update set: editing a rule
        // must not reorder the list under the person editing it.
        .onConflictDoUpdate({
          target: rules.id,
          set: {
            name: values.name,
            enabled: values.enabled,
            trigger: values.trigger,
            pattern: values.pattern,
            matchKind: values.matchKind,
            caseSensitive: values.caseSensitive,
            wholeWord: values.wholeWord,
            watch: values.watch,
            action: values.action,
            reply: values.reply,
            prompt: values.prompt,
            timing: values.timing,
            interrupt: values.interrupt,
            repeat: values.repeat,
            scope: values.scope,
            updatedAt: values.updatedAt,
          },
        })
        .run();
      return rule;
    },

    deleteRule: (id) => {
      db.delete(rules).where(eq(rules.id, id)).run();
      db.delete(ruleState).where(eq(ruleState.ruleId, id)).run();
    },

    ruleStats: () => {
      const rows = db
        .select({
          ruleId: ruleState.ruleId,
          pending: sql<number>`sum(case when ${ruleState.status} = 'pending' then 1 else 0 end)`,
          totalFires: sql<number>`sum(${ruleState.totalFires})`,
          lastFiredAt: sql<number | null>`max(${ruleState.lastFiredAt})`,
        })
        .from(ruleState)
        .groupBy(ruleState.ruleId)
        .all();
      return rows.map((row) => ({
        ruleId: row.ruleId,
        pending: Number(row.pending ?? 0),
        totalFires: Number(row.totalFires ?? 0),
        lastFiredAt: row.lastFiredAt === null ? null : Number(row.lastFiredAt),
      }));
    },

    noteRuleFire: (ruleId, instanceId, repeat) => {
      const id = `${ruleId}:${instanceId}`;
      const now = new Date();
      const before = db
        .select()
        .from(ruleState)
        .where(eq(ruleState.id, id))
        .get();
      const next = {
        id,
        ruleId,
        instanceId,
        // A rule that does not repeat still records the fire; it just stays
        // armed-looking, and the engine's own once-per-session check is what
        // keeps it quiet afterwards.
        status: (repeat ? "pending" : "armed") as "armed" | "pending",
        fireCount: (before?.fireCount ?? 0) + 1,
        totalFires: (before?.totalFires ?? 0) + 1,
        lastFiredAt: now,
        ackedAt: before?.ackedAt ?? null,
      };
      db.insert(ruleState)
        .values(next)
        .onConflictDoUpdate({
          target: ruleState.id,
          set: {
            status: next.status,
            fireCount: next.fireCount,
            totalFires: next.totalFires,
            lastFiredAt: next.lastFiredAt,
          },
        })
        .run();
      return ruleStateOf(next as typeof ruleState.$inferSelect);
    },

    ruleStateFor: (ruleId, instanceId) => {
      const row = db
        .select()
        .from(ruleState)
        .where(eq(ruleState.id, `${ruleId}:${instanceId}`))
        .get();
      return row ? ruleStateOf(row) : undefined;
    },

    ruleStatesFor: (ruleId) =>
      db
        .select()
        .from(ruleState)
        .where(eq(ruleState.ruleId, ruleId))
        .orderBy(desc(ruleState.lastFiredAt))
        .all()
        .map(ruleStateOf),

    rearmRules: (instanceId, matched) => {
      db.update(ruleState)
        // Re-armed, not retired: the same rule can catch the same habit again
        // later in the same session, and `fireCount` starts the next run from
        // zero. `totalFires` is the history and is left alone.
        .set({ status: "armed", fireCount: 0, ackedAt: new Date() })
        .where(
          and(
            eq(ruleState.instanceId, instanceId),
            eq(ruleState.status, "pending"),
            notInArray(ruleState.ruleId, matched)
          )
        )
        .run();
    },
  };
};

export const DbLayer = Layer.effect(Db)(Effect.sync(() => make(DB_PATH)));
