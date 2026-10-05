import type {
  AuthState,
  BuildInfo,
  ClaudeLimits,
  ContinuationJob,
  DelegateAskStatus,
  DelegateEventKind,
  DelegateEventPayload,
  FleetMcpConfig,
  FleetScope,
  FleetSyncReport,
  HarnessReport,
  HookEvent,
  HookHandler,
  NeutralUserMessage,
  OpenCodeGoLimits,
  RuleAction,
  RuleMatchKind,
  RuleScope,
  RuleTiming,
  RuleTrigger,
  RuleWatch,
  SendMode,
  SendState,
  SessionEffort,
  SessionTooling,
  SkillFile,
  ToolStatus,
  WorkflowEffectKind,
  WorkflowFailure,
  WorkflowGraph,
  WorkflowInput,
  WorkflowOrigin,
  WorkflowRunStatus,
  WorkflowStepStatus,
} from "@cawco/core";
import type { MachineCapabilities } from "@cawco/core/capabilities";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { ContinueRequest, PreparedContinuation } from "../continuation";

const timestamp = (column: string) => integer(column, { mode: "timestamp_ms" });

export const workflows = sqliteTable("workflows", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  graph: text("graph", { mode: "json" }).$type<WorkflowGraph>(),
  program: text("program").notNull(),
  origin: text("origin").$type<WorkflowOrigin>().notNull(),
  /** The program's `inputs` export, evaluated once at save. */
  inputs: text("inputs", { mode: "json" }).$type<WorkflowInput[]>().notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});
export const workflowRuns = sqliteTable("workflow_runs", {
  parentRunId: text("parent_run_id"),
  parentStepId: text("parent_step_id"),
  id: text("id").primaryKey(),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id),
  graph: text("graph", { mode: "json" }).$type<WorkflowGraph>(),
  program: text("program").notNull(),
  inputs: text("inputs", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  workspace: text("workspace").notNull(),
  machineId: text("machine_id").notNull(),
  supervisorInstanceId: text("supervisor_instance_id"),
  status: text("status").$type<WorkflowRunStatus>().notNull(),
  result: text("result", { mode: "json" }).$type<unknown>(),
  failure: text("failure"),
  state: text("state", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  startedAt: timestamp("started_at")
    .notNull()
    .$defaultFn(() => new Date()),
  endedAt: timestamp("ended_at"),
  rerunOfRunId: text("rerun_of_run_id"),
  launchedBy: text("launched_by").notNull(),
  /**
   * When the owner last looked at the run (its tab in front) or archived it
   * off Finished, on any device: a run that ended after this is news.
   */
  seenAt: timestamp("seen_at"),
});
export const workflowSteps = sqliteTable("workflow_steps", {
  childRunId: text("child_run_id"),
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id),
  nodeId: text("node_id").notNull(),
  /** The effect sequence that owns this step: `ref` N in its run. */
  seq: integer("seq").notNull(),
  kind: text("kind").$type<WorkflowGraph["nodes"][number]["kind"]>().notNull(),
  /**
   * What the call that opened the step asked for: a `run`/`spawn` step's
   * spec (prompt, schema, retries, timeout), an `ask`'s question. The attempt
   * machinery reads it for every retry, timeout and result check.
   */
  spec: text("spec", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").$type<WorkflowStepStatus>().notNull(),
  instanceId: text("instance_id"),
  result: text("result", { mode: "json" }).$type<unknown>(),
  failure: text("failure"),
  mapIndex: integer("map_index"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
});
/**
 * A run's log: every `w.*` call its program made, what it asked and what it
 * came back with. Written by the engine's driver when a call is performed —
 * once, never on a replay — and completed when a step or question settles.
 * For the run view and `workflow_read` only: the workflow engine's own
 * storage is what a run replays from, never this.
 */
export const workflowRunLog = sqliteTable(
  "workflow_run_log",
  {
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id),
    seq: integer("seq").notNull(),
    kind: text("kind").$type<WorkflowEffectKind>().notNull(),
    args: text("args", { mode: "json" }).$type<Record<string, unknown>>(),
    result: text("result", { mode: "json" }).$type<unknown>(),
    failure: text("failure", { mode: "json" }).$type<WorkflowFailure>(),
    at: timestamp("at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.runId, table.seq] }),
    index("workflow_run_log_run").on(table.runId),
  ]
);
/**
 * Receipts and questions for a run's supervisor that found it not live: kept
 * here, in order, and sent when it next is. None is dropped for want of a
 * listener.
 */
export const workflowNotices = sqliteTable(
  "workflow_notices",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: text("instance_id").notNull(),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id),
    body: text("body").notNull(),
    at: timestamp("at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("workflow_notices_instance").on(table.instanceId)]
);
export const workflowAttempts = sqliteTable("workflow_attempts", {
  id: text("id").primaryKey(),
  stepId: text("step_id")
    .notNull()
    .references(() => workflowSteps.id),
  number: integer("number").notNull(),
  renderedPrompt: text("rendered_prompt").notNull(),
  result: text("result", { mode: "json" }).$type<unknown>(),
  failure: text("failure"),
  startedAt: timestamp("started_at")
    .notNull()
    .$defaultFn(() => new Date()),
  endedAt: timestamp("ended_at"),
});

/** Machines running an agent daemon, keyed by their stable hardware fingerprint. */
export const agents = sqliteTable("agents", {
  addressContract: integer("address_contract", { mode: "boolean" })
    .notNull()
    .default(false),
  machineCapabilities: text("machine_capabilities", {
    mode: "json",
  }).$type<MachineCapabilities>(),
  browserAvailable: integer("browser_available", { mode: "boolean" })
    .notNull()
    .default(false),
  machineId: text("machine_id").primaryKey(),
  hostname: text("hostname").notNull(),
  os: text("os").notNull(),
  status: text("status")
    .$type<"online" | "offline">()
    .notNull()
    .default("offline"),
  /** What the daemon found about Claude Code's credentials, last time it registered. */
  auth: text("auth")
    .$type<AuthState | "unknown">()
    .notNull()
    .default("unknown"),
  /**
   * Last-known workflow-tool status by catalog id (NEW.md §10): what the daemon
   * reported at register or after an install, plus the `installing` the hub
   * writes itself while one is in flight.
   */
  tools: text("tools", { mode: "json" })
    .$type<Record<string, ToolStatus>>()
    .notNull()
    .default({}),
  /**
   * What the machine came to the last time it converged on the fleet's MCP
   * servers and plugins (NEW.md §11). Null until it has been asked once.
   */
  fleet: text("fleet", { mode: "json" }).$type<FleetSyncReport>(),
  /**
   * The cawco the daemon is running (NEW.md §12), as it reported at register.
   * Null until a daemon that says so has registered once.
   */
  build: text("build", { mode: "json" }).$type<BuildInfo>(),
  /** What each harness adapter on the machine can do, as reported at register. */
  harnesses: text("harnesses", { mode: "json" }).$type<HarnessReport[]>(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A repository checkout on a machine; groups instances in the sidebar. */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  machineId: text("machine_id")
    .notNull()
    .references(() => agents.machineId),
  name: text("name").notNull(),
  cwd: text("cwd").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A running or resumable `query()`. Messages live in SDK session storage, not here. */
export const instances = sqliteTable("instances", {
  /** Birth contract, immutable on retries; acknowledgement is recorded separately. */
  addressRequired: integer("address_required", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Removed machines keep ownership hidden without an end decision. */
  machineRemoved: integer("machine_removed", { mode: "boolean" })
    .notNull()
    .default(false),
  scratchWorktree: text("scratch_worktree", { mode: "json" }).$type<
    import("@cawco/core").ScratchWorktree
  >(),
  addressProtocol: integer("address_protocol", { mode: "boolean" })
    .notNull()
    .default(false),
  endReason: text("end_reason"),
  endRetryAt: timestamp("end_retry_at"),
  endAttempts: integer("end_attempts").notNull().default(0),
  /** The hub's decision, independent of process presence and attachment. */
  endIntent: text("end_intent").$type<
    "stop" | "discard" | "delete" | "delete-transcript"
  >(),
  endConfirmedAt: timestamp("end_confirmed_at"),
  keepAliveEnabled: integer("keep_alive", { mode: "boolean" })
    .notNull()
    .default(false),
  keepAliveSent: integer("keep_alive_sent").notNull().default(0),
  keepAliveStopped: text("keep_alive_stopped").$type<"stopped-cap">(),
  cacheTtl: text("cache_ttl").$type<"5m" | "1h">(),
  lastRequestAt: timestamp("last_request_at"),
  contextTokens: integer("context_tokens"),
  contextReadAt: timestamp("context_read_at"),
  cacheCold: text("cache_cold", { mode: "json" }).$type<{
    reason: string;
    at: number;
  }>(),
  lastPingUsage: text("last_ping_usage", { mode: "json" }).$type<{
    input: number;
    read: number;
    write: number;
    at: number;
  }>(),
  /** In-flight ping identity survives a hub or agent restart. */
  keepAliveTurn: text("keep_alive_turn"),
  workflowRunId: text("workflow_run_id"),
  workflowStepId: text("workflow_step_id"),
  id: text("id").primaryKey(),
  machineId: text("machine_id")
    .notNull()
    .references(() => agents.machineId),
  projectId: text("project_id").references(() => projects.id),
  /** SDK session id, absent until the first init frame arrives. */
  sessionId: text("session_id"),
  /** Which harness owns `sessionId` — what a resume and a catalog read route on. */
  harness: text("harness"),
  /** The instance this one is a delegate of (nested under it in every rail). */
  parentInstanceId: text("parent_instance_id"),
  /** The delegating tool call, so the parent transcript can render the round trip. */
  parentToolUseId: text("parent_tool_use_id"),
  cwd: text("cwd").notNull(),
  /**
   * The session's given name: the owner's rename, or the name the session
   * gave itself (`set_title`) or was spawned under (a delegate's title).
   * Null on a session nobody named — the rails fall back to `derivedTitle`,
   * then to where it runs.
   */
  title: text("title"),
  /**
   * Who gave `title`: `owner` (a rename in the dashboard), which nothing the
   * session does overwrites, or `agent` (its spawn's title or `set_title`).
   */
  titleSource: text("title_source").$type<"owner" | "agent">(),
  /**
   * The MCP servers and tool names the session's newest `init` announced, as
   * JSON — overwritten on every `init` that carries them, so a reload or a hub
   * restart still knows what the session has. Null for a harness whose `init`
   * carries neither.
   */
  tooling: text("tooling", { mode: "json" }).$type<SessionTooling>(),
  /**
   * What the session called itself by what it was first asked to do: the first
   * user message, cleaned by core's `deriveTitleFromFirstMessage`. Written once,
   * the first time the hub sees that message, so a listing already carries the
   * name a reader would otherwise only see after the transcript loaded. Never
   * written over `title`, and never rewritten — a given title always wins.
   */
  derivedTitle: text("derived_title"),
  /**
   * When the owner last looked at the session (its tab in front, after it
   * ended) or archived it off Finished, on any device: a turn that ended
   * after this is news. Null on one never seen.
   */
  seenAt: timestamp("seen_at"),
  /**
   * `scratch`: a side quest (NEW.md §1), shown apart from mainline work.
   * `summariser`: a continuation's internal worker, never on the board.
   */
  kind: text("kind")
    .$type<"mainline" | "scratch" | "summariser">()
    .notNull()
    .default("mainline"),
  /**
   * How the session answers tool permissions, and which model answers: two of
   * the three settings the user keeps changing, so a dashboard that was not open
   * when they chose still shows what the session is really running. Null until a
   * spawn or a session's own `init` says.
   */
  permissionMode: text("permission_mode"),
  model: text("model"),
  /**
   * The third: how hard that model thinks, as the session's agent last read it
   * back from the harness (`EFFORT_READ`) — a level, or `none` when the session
   * sends no effort. Null until the first reading. A restart hands a level back
   * to the new process, so it keeps working at the one it was on.
   */
  effort: text("effort").$type<SessionEffort>(),
  /**
   * Whether the session may delegate or start sessions of its own. `false` on a
   * leaf delegate — one spawned with `can_delegate: false`, which is what a
   * `delegate` call means unless it says otherwise. Every spawn with a parent
   * says which; null is a session nobody delegated, and it may.
   */
  canDelegate: integer("can_delegate", { mode: "boolean" }),
  /**
   * What was last *written down* about the session — history, not liveness.
   *
   * Read this column raw and you are reading a fact that was true at the moment
   * of a write and has been re-checked by nobody since; that is exactly how the
   * hub came to report 178 sessions `running` on a machine carrying 42
   * processes. Every read that reaches a person or an API client goes through
   * `withSessionPresence` in `server.ts`, which answers `unknown` for any row
   * whose machine the hub is not currently holding a socket for. The column
   * itself is deliberately left alone by that overlay: it is the record of what
   * last happened, and the last thing that happened does not stop having
   * happened because the machine went quiet.
   *
   * The union is core's {@link import('@cawco/core').InstanceStatus} (see its
   * doc comment for what each value means). Plain text, no SQL migration:
   * `sleeping` arrived by a one-time boot sweep over rows the old taxonomy had
   * to file under `error`.
   */
  status: text("status")
    .$type<
      | "starting"
      | "running"
      | "sleeping"
      | "stopped"
      | "discarded"
      | "unknown"
      | "error"
    >()
    .notNull()
    .default("starting"),
  /** Why the session died, for a dashboard that was not watching when it did. */
  lastError: text("last_error"),
  /**
   * The supervisor's standing autopilot for this session: `{enabled, prompt,
   * updatedAt}` as JSON text, following the `rules.scope` idiom. Null means
   * never configured; disabling keeps the prompt.
   */
  autopilot: text("autopilot", { mode: "json" }).$type<{
    enabled: boolean;
    prompt: string;
    updatedAt: number;
  }>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
  /**
   * When the hub last issued a spawn or restore for this row. A `starting` row's
   * grace measures from here: asking for a process is not session activity.
   */
  spawnedAt: timestamp("spawned_at"),
  /**
   * The work item this session runs ({@link workItems}). Every delegate is one
   * work item in one fresh session; null on a session nobody delegated, and on
   * a delegate from before work items existed.
   */
  workItemId: text("work_item_id"),
});

/** Only hashes reach disk; installing a replacement does not revoke a live credential before ACK. */
export const sessionIdentities = sqliteTable("session_identities", {
  instanceId: text("instance_id").primaryKey(),
  credentialHash: text("credential_hash").unique(),
  pendingHash: text("pending_hash").unique(),
  installedAt: timestamp("installed_at"),
  error: text("error"),
});

/** Completion identity survives agent and hub restarts, independently of live custody. */
export const completedTurns = sqliteTable(
  "completed_turns",
  {
    instanceId: text("instance_id").notNull(),
    resultId: text("result_id").notNull(),
    completedAt: text("completed_at"),
    adoptedWithoutReport: integer("adopted_without_report", {
      mode: "boolean",
    }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.resultId] })]
);

/** A workspace's life: `active` while its checkout is kept; `archived` once its boundary and clone are gone. */
export type WorkspaceState = "active" | "archived";

/** Unfiled creates owned by the hub until filed, or acknowledged discarded by their machine. */
export const workspaceCreates = sqliteTable("workspace_creates", {
  id: text("id").primaryKey(),
  machineId: text("machine_id").notNull(),
});

/**
 * Where delegated work lives: one shared clone on its own branch, on one
 * machine, with the boundary every shell command of its work items runs
 * inside. A workspace has at most one work item in `starting`/`running` at a
 * time — the one writer its checkout ever has — and it owns the checkout:
 * stopping or discarding a session never removes it; archiving does.
 */
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  machineId: text("machine_id").notNull(),
  /** The repository the clone was cut from. */
  repoRoot: text("repo_root").notNull(),
  /** The clone's root, where every work item of the workspace runs. */
  path: text("path").notNull(),
  branch: text("branch").notNull(),
  /**
   * The repository's default branch the clone was cut from, which its work
   * lands on. Every workspace cut before this was recorded was cut from
   * `origin/main`, which is what the default says of those rows.
   */
  base: text("base").notNull().default("main"),
  /**
   * The boundary's anchor (Linux) or runner (macOS), as the machine last
   * named it to the hub: when the workspace was made, and as each follow-up
   * started. Null once archived.
   */
  boundaryPid: integer("boundary_pid"),
  state: text("state").$type<WorkspaceState>().notNull().default("active"),
  /** Ports the workspace's processes listen on, recorded when they start. */
  ports: text("ports", { mode: "json" })
    .$type<number[]>()
    .notNull()
    .default([]),
  /** Directories outside the checkout the workspace's work wrote to. */
  scratchPaths: text("scratch_paths", { mode: "json" })
    .$type<string[]>()
    .notNull()
    .default([]),
  createdByInstanceId: text("created_by_instance_id").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** A work item's life. Only `starting` and `running` take messages. */
export type WorkItemState =
  | "starting"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

/**
 * One acceptance check of a work item: a shell command the hub runs in the
 * item's worktree when its session calls `finish_item`. It passes when it
 * exits 0 and, where `expect` is given, its stdout contains it.
 */
export interface WorkItemCheck {
  command: string;
  expect?: string;
  /** Two to six plain words. */
  name: string;
  /** Seconds before the command is killed; 600 when not given. */
  timeoutSec?: number;
}

/** What a delegate hands in with `finish_item`. */
export interface WorkItemSubmission {
  blocked?: { command: string; error: string };
  findings?: { title: string; detail: string }[];
  summary: string;
}

/**
 * One piece of delegated work: a brief, run by one session in one workspace,
 * ending in a report. A follow-up is a new item in the same workspace, run by
 * the same session; the reader or the parent can also reopen finished work.
 * It is `done` only when the hub has run its checks and every one passed.
 */
export const workItems = sqliteTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    /** The session that delegated it, and that its reports go to. */
    parentInstanceId: text("parent_instance_id").notNull(),
    /** Its one session. */
    instanceId: text("instance_id").notNull(),
    brief: text("brief").notNull(),
    title: text("title").notNull(),
    /** The delegate type it was asked for by name, if any. */
    type: text("type"),
    harness: text("harness").notNull(),
    model: text("model"),
    effort: text("effort"),
    state: text("state").$type<WorkItemState>().notNull().default("starting"),
    /**
     * Its acceptance checks, run by the hub when its session calls
     * `finish_item`. Null on an item filed before checks existed: that item
     * still ends on a turn nothing answers.
     */
    checks: text("checks", { mode: "json" }).$type<WorkItemCheck[]>(),
    /**
     * When the hub began running its checks for a `finish_item`, while they
     * run. Set, the item is checking: a hub that starts finds it here and runs
     * the checks again from the first, on {@link submission}.
     */
    checkingSince: timestamp("checking_since"),
    /** A declared wait on work the delegate started; the hub wakes it at this time. */
    waitUntil: timestamp("wait_until"),
    waitReason: text("wait_reason"),
    /** Deadline plus grace while awaiting the harness's next turn read. */
    waitResumeBy: timestamp("wait_resume_by"),
    /** Routine waits since the last message handed to the parent. */
    waitHistory: text("wait_history", { mode: "json" }).$type<{
      count: number;
      until: number;
      reason: string;
    }>(),
    /** The `finish_item` the running checks answer, kept while they run. */
    submission: text("submission", {
      mode: "json",
    }).$type<WorkItemSubmission>(),
    /**
     * The final report: the summary, check results, commits and findings the
     * hub built when the checks passed (an item without checks: its session's
     * last turn, in its own words).
     */
    result: text("result"),
    /** Why it failed. */
    error: text("error"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    endedAt: timestamp("ended_at"),
    /**
     * When the reader dismissed its chip from the parent's delegate tray: a
     * failed item stays there until then, on every screen at once.
     */
    dismissedAt: timestamp("dismissed_at"),
  },
  (table) => [
    index("work_items_workspace").on(table.workspaceId, table.state),
    index("work_items_parent").on(table.parentInstanceId, table.state),
  ]
);

/**
 * What a delegate and its parent said to each other through the hub: every ask
 * routed up, every answer back, every turn's report. The messages themselves
 * are the harnesses' copies; this is the hub's own record, so a reader that was
 * not watching does not have to reconstruct the exchange out of transcript text.
 */
export const delegateEvents = sqliteTable("delegate_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** The delegate the traffic is about — never the parent, on any of the kinds. */
  instanceId: text("instance_id").notNull(),
  parentInstanceId: text("parent_instance_id").notNull(),
  kind: text("kind").$type<DelegateEventKind>().notNull(),
  /** The permission request an ask and its answer share. Null on a report. */
  requestId: text("request_id"),
  toolName: text("tool_name"),
  requestKind: text("request_kind").$type<"question" | "tool">(),
  payload: text("payload", { mode: "json" })
    .$type<DelegateEventPayload>()
    .notNull(),
  /** An ask's own state; null on an answer and a report, which settle nothing. */
  status: text("status").$type<DelegateAskStatus>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One record per message sent to a session (`SendRecord`, @cawco/core): what
 * was sent, when the hub took it, and where it stands. The hub is the only
 * writer of `state`; every change is stored here before any screen hears of
 * it, so a reload and a hub restart read the same record the live stream
 * carried.
 */
export const sentMessages = sqliteTable(
  "sent_messages",
  {
    /** The send's own uuid (`SentMessage.uuid`), the id it keeps everywhere. */
    uuid: text("uuid").primaryKey(),
    instanceId: text("instance_id").notNull(),
    acceptedAt: timestamp("accepted_at").notNull(),
    /**
     * The id the harness stores the message under, where that is not the uuid
     * (opencode's message id, pi's entry id), as its adapter reported it
     * (`NeutralSystemMessage.storedAs`) — or, for a send Claude joined into
     * another's record, that record's uuid, as the hub found it. Null for a
     * Claude send stored under its own uuid.
     */
    harnessId: text("harness_id"),
    /**
     * What the sender submitted, pictures as media references. Null only on a
     * record from before the hub kept bodies, until a history read links it to
     * its stored entry and fills it from there.
     */
    body: text("body", { mode: "json" }).$type<NeutralUserMessage>(),
    /** Records from before modes were kept were all ordinary turns to the reader. */
    mode: text("mode").$type<SendMode>().notNull().default("turn"),
    /**
     * Where the send stands. Records from before this column were all read by
     * the time it arrived: every one of them had been stored by its harness.
     */
    state: text("state").$type<SendState>().notNull().default("read"),
    /** Why it failed. */
    reason: text("reason"),
    /** A failed send's place: the last thing the session said before it failed. */
    anchor: text("anchor"),
    /** The failed send this one retries. */
    replaces: text("replaces"),
    /** The retry that replaced this one. */
    replacedBy: text("replaced_by"),
    /**
     * The harness has said it holds the send, in a queue of its own that no
     * transcript shows yet: Claude's CLI queuing the command
     * (`MESSAGES_HELD`). A send still pending when a process outlives its
     * agent is waited for only if it is held or stored; otherwise it never
     * reached the session.
     */
    held: integer("held", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    index("sent_messages_harness_id").on(table.harnessId),
    index("sent_messages_state").on(table.instanceId, table.state),
  ]
);

/**
 * What the fleet is supposed to have (NEW.md §10). One row per catalog tool the
 * user has said anything about — a tool with no row is nobody's requirement,
 * which is why the catalog stays in code and only the policy is stored.
 */
export const tools = sqliteTable("tools", {
  /** A `TOOL_CATALOG` id; the route checks it, so the column stays a plain key. */
  id: text("id").primaryKey(),
  /** Installed automatically wherever a register finds it missing. */
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  /** Null takes whatever the installer calls latest. */
  pinnedVersion: text("pinned_version"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The MCP servers every machine's Claude Code should have (NEW.md §11). The
 * config is stored verbatim and written into `~/.claude.json` verbatim: what
 * the servers mean is the CLI's affair, not the hub's.
 */
export const mcpServers = sqliteTable("mcp_servers", {
  /** The name sessions see, and the key the entry takes in `~/.claude.json`. */
  name: text("name").primaryKey(),
  config: text("config", { mode: "json" }).$type<FleetMcpConfig>().notNull(),
  authMode: text("auth_mode")
    .$type<"direct" | "oauth">()
    .notNull()
    .default("direct"),
  authError: text("auth_error"),
  /** A disabled row stays here and is removed from the machines. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Private OAuth material. Only the hub's OAuth manager reads these rows. */
export const fleetMcpOauth = sqliteTable("fleet_mcp_oauth", {
  name: text("name").primaryKey(),
  generation: text("generation").notNull(),
  upstream: text("upstream").notNull(),
  resource: text("resource", { mode: "json" })
    .$type<OAuthProtectedResourceMetadata>()
    .notNull(),
  issuer: text("issuer").notNull(),
  metadata: text("metadata", { mode: "json" })
    .$type<AuthorizationServerMetadata>()
    .notNull(),
  client: text("client", { mode: "json" }).$type<OAuthClientInformationFull>(),
  tokens: text("tokens", { mode: "json" }).$type<OAuthTokens>(),
  expiresAt: timestamp("expires_at"),
  pending: text("pending", { mode: "json" }).$type<{
    verifier: string;
    state: string;
    expiresAt: number;
  }>(),
  lastMachineId: text("last_machine_id"),
  lastOpenedAt: timestamp("last_opened_at"),
});

/** The plugin marketplaces the fleet links, so their skills can be installed. */
export const marketplaces = sqliteTable("marketplaces", {
  name: text("name").primaryKey(),
  /** Whatever `claude plugin marketplace add` accepts, passed through verbatim. */
  source: text("source").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** The plugins the fleet installs, by the CLI's own `plugin@marketplace` id. */
export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),
  /** A disabled row is uninstalled from the machines, not merely switched off. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /**
   * The resolved content, the same way {@link skills} keeps it, and for the
   * same reason: the hub fetches a plugin once and every machine is sent the
   * bytes. Null until a resolve succeeds — a row with no files is one the
   * machines still install the old way, by asking the CLI to go and get it.
   */
  hash: text("hash"),
  bytes: integer("bytes"),
  /** Why the last resolve failed. Kept, so the dashboard can say so. */
  error: text("error"),
  files: text("files", { mode: "json" }).$type<SkillFile[]>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The plain skills the fleet writes into `~/.claude/skills/` (NEW.md §11). The
 * hub resolves a source once and keeps the files here, so a machine that joins
 * tomorrow is sent them without anything being downloaded again.
 */
export const skills = sqliteTable("skills", {
  /** The directory the files land in on every machine. */
  name: text("name").primaryKey(),
  /** A `skills:` / `github:` / `npm:` / URL source, stored as the user gave it. */
  source: text("source").notNull(),
  /** A disabled row stays here and is deleted from the machines. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Null until a resolve succeeds; a machine writes only when this changes. */
  hash: text("hash"),
  bytes: integer("bytes"),
  /** Why the last resolve failed. A failed row is kept so the dashboard can say so. */
  error: text("error"),
  files: text("files", { mode: "json" }).$type<SkillFile[]>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The subagent definitions the fleet writes into `~/.claude/agents/` (NEW.md
 * §11). A subagent is its markdown file, so the file is what is stored — front
 * matter and prompt body verbatim — and the front matter's own `name`, which is
 * what a delegation asks for, is the key.
 */
export const fleetAgents = sqliteTable("fleet_agents", {
  /** Also the file it lands in on every machine: `<name>.md`. */
  name: text("name").primaryKey(),
  content: text("content").notNull(),
  /** sha256 hex of the content — what tells a machine's copy apart from this. */
  hash: text("hash").notNull(),
  bytes: integer("bytes").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** The fleet's user-scope CLAUDE.md — one row, one document (NEW.md §11). */
export const fleetMemory = sqliteTable("fleet_memory", {
  /** Always `memory`: the fleet has one, and a table with a key says so cheaply. */
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  /** sha256 hex of the content, which is what a machine compares before writing. */
  hash: text("hash").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The documents the main memory links (NEW.md §11): one row per path under
 * `~/.claude/memories/`, which is the same string on every machine. Separate
 * rows rather than a blob on the memory, because the set converges file by
 * file — a hash per document is what lets one of them drift alone.
 */
export const fleetMemoryDocs = sqliteTable("fleet_memory_docs", {
  /** `models/claude-opus-5.md` — relative, forward-slashed, and the key. */
  path: text("path").primaryKey(),
  content: text("content").notNull(),
  /** sha256 hex of the content, which is what a machine compares before writing. */
  hash: text("hash").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * What the fleet's memory used to say. Every change records the version it
 * replaced — including the copy an overwrite is about to destroy on a machine —
 * so a document nobody else has is never one click away from being gone.
 */
export const fleetMemoryHistory = sqliteTable("fleet_memory_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  content: text("content").notNull(),
  hash: text("hash").notNull(),
  /** `fleet` for the hub's own row; `machine:<machineId>` for a copy taken off one. */
  source: text("source").notNull(),
  /**
   * Which document of the set this was a version of; null is the main
   * CLAUDE.md, which is every row written before the set existed.
   */
  path: text("path"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** OAuth credentials the hub refreshes and distributes to agents on spawn. */
export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  /** `~/.claude/.credentials.json`-shaped blob, stored verbatim. */
  blob: text("blob", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  expiresAt: timestamp("expires_at"),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * One (session, model, quarter hour) bucket of usage the agent reports
 * (USAGE-SPEC.md §6.1). The id is the full `${machineId}:${harness}:
 * ${sessionId}:${model}:${start}` key, so a re-report of the same bucket is an
 * idempotent upsert over absolute totals rather than an addition.
 *
 * Rows stored before quarters run an hour (`spanMs` 3600000, the column's
 * default, which is what every one of them is); a quarter reported for the
 * same session, model and hour replaces that hour's row (`putUsageBuckets`).
 */
export const usageBuckets = sqliteTable(
  "usage_buckets",
  {
    /** `${machineId}:${harness}:${sessionId}:${model}:${start}` */
    id: text("id").primaryKey(),
    machineId: text("machine_id").notNull(),
    harness: text("harness").$type<"claude" | "opencode">().notNull(),
    start: integer("start").notNull(),
    spanMs: integer("span_ms").notNull().default(3_600_000),
    firstTs: integer("first_ts").notNull(),
    lastTs: integer("last_ts").notNull(),
    sessionId: text("session_id").notNull(),
    project: text("project").notNull(),
    projectPath: text("project_path"),
    model: text("model").notNull(),
    provider: text("provider"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheCreationTokens: integer("cache_creation_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    costUsd: real("cost_usd").notNull().default(0),
    messages: integer("messages").notNull().default(0),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("usage_buckets_start_idx").on(table.start),
    index("usage_buckets_machine_harness_start_idx").on(
      table.machineId,
      table.harness,
      table.start
    ),
    index("usage_buckets_session_idx").on(table.sessionId),
  ]
);

/**
 * The last limit reading each machine's daemon fetched from the Anthropic API
 * (USAGE-SPEC.md §6.1). One row per machine — the account it is signed in to.
 */
export const usageLimits = sqliteTable("usage_limits", {
  machineId: text("machine_id").primaryKey(),
  payload: text("payload", { mode: "json" }).$type<ClaudeLimits>().notNull(),
  /** The OpenCode Go plan's windows; null on a machine with no Go key. */
  openCodeGo: text("open_code_go", { mode: "json" }).$type<OpenCodeGoLimits>(),
  fetchedAt: timestamp("fetched_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Every limit reading that said something new, kept as a series so burn RATE is
 * observable and not just burn LEVEL. `usage_limits` above is one row per
 * machine, overwritten every 60s — it can answer "am I at 39%?" and can never
 * answer "how fast did I get there?", which is the question that actually
 * changes what an operator does next.
 *
 * One row per window per CHANGE, not per reading: the daemon pushes on a
 * 60-second schedule and `percent` is an integer, so appending unconditionally
 * would write ~1,440 identical rows per window per day to record maybe 100
 * transitions. {@link CawcoDb.putUsageLimits} diffs against the previous
 * reading and writes only what moved (see there for what counts as a change).
 *
 * Readings carrying an `error` are dropped rather than recorded: a daemon whose
 * account is signed out reports no windows at all, and a gap in the series is
 * honest about that where a row of zeroes would not be.
 */
export const usageLimitHistory = sqliteTable(
  "usage_limit_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    machineId: text("machine_id").notNull(),
    /** `session` | `weekly_all` | `weekly_scoped` | … — matches `LimitWindow.kind`. */
    kind: text("kind").notNull(),
    /** `scope.model.display_name` for scoped windows (e.g. "Fable"), else null. */
    scopeLabel: text("scope_label"),
    percent: integer("percent").notNull(),
    severity: text("severity").notNull(),
    /** ISO instant the window rolls over; a change here means a NEW window. */
    resetsAt: text("resets_at"),
    fetchedAt: timestamp("fetched_at").notNull(),
  },
  (table) => [
    // The only query this table exists to serve: one machine's one window over
    // a time range, in order.
    index("usage_limit_history_series_idx").on(
      table.machineId,
      table.kind,
      table.fetchedAt
    ),
    // Retention prunes by age alone, across every machine and kind.
    index("usage_limit_history_fetched_idx").on(table.fetchedAt),
  ]
);

/**
 * Standing instructions the hub enforces on every session it watches: a phrase
 * to look for in what a session says, and a reply to send back when it shows
 * up. The hub is the only component that sees every frame from every machine,
 * so it is the only one that can do this without a per-harness hook.
 *
 * The matching fields mirror `Rule` in `@cawco/core` one-for-one; the matcher
 * itself is shared with the dashboard so the editor's test box and the fleet
 * agree on what fires.
 */
export const rules = sqliteTable("rules", {
  id: text("id").primaryKey(),
  /** What the rule is called in the list, and in the reply the session reads. */
  name: text("name").notNull(),
  /** A disabled rule stays here, keeps its history, and stops firing. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** What starts the evaluation: `pattern` (default, every rule before this) or `every-turn`. */
  trigger: text("trigger").$type<RuleTrigger>().notNull().default("pattern"),
  pattern: text("pattern").notNull(),
  matchKind: text("match_kind")
    .$type<RuleMatchKind>()
    .notNull()
    .default("phrase"),
  caseSensitive: integer("case_sensitive", { mode: "boolean" })
    .notNull()
    .default(false),
  wholeWord: integer("whole_word", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Whether the rule reads the session's answer, its reasoning, or both. */
  watch: text("watch").$type<RuleWatch>().notNull().default("text"),
  /** What the rule does when it fires: `reply` (default) or `llm` (supervisor evaluates). */
  action: text("action").$type<RuleAction>().notNull().default("reply"),
  reply: text("reply").notNull(),
  /** `action: 'llm'` only: the operator's standing instructions for the supervisor. */
  prompt: text("prompt"),
  /** `turn` wakes an idle session, `message` queues, `immediate` cuts in. */
  timing: text("timing").$type<RuleTiming>().notNull().default("turn"),
  /** `immediate` only: deliver mid-turn instead of waiting for a boundary. */
  interrupt: integer("interrupt", { mode: "boolean" }).notNull().default(false),
  /**
   * On, the rule fires again on every later match (up to the ceiling). Off, it
   * fires once per session and goes quiet.
   */
  repeat: integer("repeat", { mode: "boolean" }).notNull().default(true),
  /** Optional narrowing — machine, project, harness, model. Empty means everywhere. */
  scope: text("scope", { mode: "json" })
    .$type<RuleScope>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Where one rule stands with one session. `armed` fires on the next match;
 * `pending` has fired and re-arms when a later turn of the session ends
 * without matching it again.
 *
 * Rows are keyed by `${ruleId}:${instanceId}` rather than a composite primary
 * key so the upsert path is the same single-column `onConflictDoUpdate` every
 * other table here uses.
 */
export const ruleState = sqliteTable(
  "rule_state",
  {
    /** `${ruleId}:${instanceId}` */
    id: text("id").primaryKey(),
    ruleId: text("rule_id").notNull(),
    instanceId: text("instance_id").notNull(),
    status: text("status")
      .$type<"armed" | "pending">()
      .notNull()
      .default("armed"),
    /** Fires in a row, each in a turn that matched again — what the ceiling counts. */
    fireCount: integer("fire_count").notNull().default(0),
    /** Fires over the session's whole life, which re-arming does not reset. */
    totalFires: integer("total_fires").notNull().default(0),
    lastFiredAt: timestamp("last_fired_at"),
    /** When a turn last ended without matching the rule again, re-arming it. */
    ackedAt: timestamp("acked_at"),
  },
  (table) => [
    index("rule_state_rule_idx").on(table.ruleId),
    index("rule_state_instance_idx").on(table.instanceId),
  ]
);

/**
 * Hooks the fleet keeps (NEW.md §11): one row per hook, registered on every
 * machine at the event it names. This is the one fleet row that is
 * executable — converging it writes a script and wires it into Claude Code's
 * settings, with no prompt in between — which is why `handler` and `script`
 * are stored exactly as `hookProblem` validated them rather than re-modeled:
 * a second shape for the same thing is a second place for it to drift from
 * what actually runs.
 *
 * `scope`/`projectId` mirror an MCP server's own placement; `cwd` does not
 * appear here for the same reason it does not on that table — the hub fills
 * it in per machine as it sends a sync, and a stored one would be one
 * machine's path masquerading as everybody's.
 */
export const fleetHooks = sqliteTable("fleet_hooks", {
  /** Client-generated, like a rule's — the editor owns creation. */
  id: text("id").primaryKey(),
  /** What the reader calls it. Unique across the fleet. */
  name: text("name").notNull(),
  /** A disabled hook stays here and is registered nowhere. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  event: text("event").$type<HookEvent>().notNull(),
  matcher: text("matcher"),
  handler: text("handler", { mode: "json" }).$type<HookHandler>().notNull(),
  /** A command hook's script body, written to every machine that gets this hook. */
  script: text("script"),
  /** sha256 hex of the material a machine compares before writing. */
  hash: text("hash").notNull(),
  scope: text("scope").$type<FleetScope>(),
  projectId: text("project_id"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * What a hook used to be. Every change records the version it replaced —
 * including the copy an overwrite is about to destroy — so a hook that took a
 * reader an hour to get right is never one bad edit away from being gone.
 * Mirrors `fleetMemoryHistory`'s shape: enough of the row to restore it
 * whole, keyed to the hook it was a version of rather than mixed into one log.
 */
export const fleetHookHistory = sqliteTable("fleet_hook_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Which hook this was a version of. Deletes take a final snapshot too. */
  hookId: text("hook_id").notNull(),
  name: text("name").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull(),
  event: text("event").$type<HookEvent>().notNull(),
  matcher: text("matcher"),
  handler: text("handler", { mode: "json" }).$type<HookHandler>().notNull(),
  script: text("script"),
  hash: text("hash").notNull(),
  scope: text("scope").$type<FleetScope>(),
  projectId: text("project_id"),
  /** `fleet` for every version today — a hook is never edited from a machine. */
  source: text("source").notNull(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** What the supervisor's verdict was on a given evaluation. */
export type SupervisorVerdict =
  | "silent"
  | "reply"
  | "escalate"
  | "ask"
  | "error"
  | "skipped";

/** What triggered the evaluation: a matched rule, or the session's autopilot. */
export type SupervisorSource = "rule" | "autopilot";

/**
 * The supervisor's intervention log: every evaluation the supervisor ran on a
 * session — including silent ones and skips. Mirrored structurally from
 * `delegate_events`; pruned to newest 5,000 rows at insert (plan: our choice).
 */
export const supervisorEvents = sqliteTable(
  "supervisor_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: text("instance_id").notNull(),
    source: text("source").$type<SupervisorSource>().notNull(),
    ruleId: text("rule_id"),
    verdict: text("verdict").$type<SupervisorVerdict>().notNull(),
    message: text("message"),
    note: text("note"),
    model: text("model"),
    latencyMs: integer("latency_ms"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("supervisor_events_instance_created_idx").on(
      table.instanceId,
      table.createdAt
    ),
  ]
);

/**
 * The supervisor's own configuration — one row, keyed `'supervisor'`,
 * following the `fleetMemory` / `MEMORY_ID` single-row precedent. Neither
 * DB nor env URL present means disabled.
 */
export const supervisorConfig = sqliteTable("supervisor_config", {
  /** Always `'supervisor'`: the hub has one, and a table with a key says so cheaply. */
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  baseUrl: text("base_url"),
  model: text("model"),
  apiKey: text("api_key"),
  /**
   * Fleet-wide tool denials — JSON `string[]`. Every spawned session and every
   * `~/.claude/settings.json` convergence reads this list. `null` only before
   * the seeding migration; once seeded, always a concrete list (possibly empty
   * when the operator has removed all denials).
   */
  deniedTools: text("denied_tools", { mode: "json" }).$type<string[]>(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The fleet's OpenRouter connection — one row, keyed `'openrouter'`, following
 * the {@link supervisorConfig} single-row precedent. Written by the Settings
 * page's OAuth PKCE exchange; the key never leaves the hub. No row means not
 * connected, and meaning rules are not evaluated.
 */
export const openrouterConnection = sqliteTable("openrouter_connection", {
  /** Always `'openrouter'`. */
  id: text("id").primaryKey(),
  apiKey: text("api_key").notNull(),
  connectedAt: timestamp("connected_at").notNull(),
  /** The composer asks Jev for skill and MCP server suggestions while typing. Off by default. */
  suggestWhileTyping: integer("suggest_while_typing", { mode: "boolean" })
    .notNull()
    .default(false),
});

/**
 * How often the operator's sessions used each skill, tool and MCP server, per
 * day. Counted by the hub from the frames it already relays, backfilled once
 * from the transcript index. Ranks composer suggestion candidates.
 */
export const capabilityUsageDaily = sqliteTable(
  "capability_usage_daily",
  {
    kind: text("kind").$type<"skill" | "tool" | "mcp">().notNull(),
    name: text("name").notNull(),
    /** Local date, `YYYY-MM-DD`. */
    day: text("day").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind, table.name, table.day] })]
);

/**
 * The context window each claude model last reported, from a turn's
 * `modelUsage[model].contextWindow`. Claude's model catalog carries no window,
 * so this is the only honest source: a model no turn has run on is absent,
 * which reads as "unknown", never as a guess.
 */
export const claudeContextWindows = sqliteTable("claude_context_windows", {
  model: text("model").primaryKey(),
  contextWindow: integer("context_window").notNull(),
  observedAt: timestamp("observed_at").notNull(),
});

/**
 * "Continue in new session" jobs: the one record of each, so a hub that
 * restarts mid-way resumes it rather than forgetting it. A job moves
 * summarising → starting → started, or ends failed/cancelled; a settled one
 * is kept a few minutes so a dashboard that was away can still hear how it
 * ended, then deleted.
 */
export const continuations = sqliteTable("continuations", {
  id: text("id").primaryKey(),
  sourceInstanceId: text("source_instance_id").notNull(),
  /** The request as asked, and its inputs as read then (continuation.ts). */
  request: text("request", { mode: "json" }).$type<ContinueRequest>().notNull(),
  prepared: text("prepared", { mode: "json" })
    .$type<PreparedContinuation>()
    .notNull(),
  /** The summariser answering now; a resumed job may have replaced it. */
  summariserInstanceId: text("summariser_instance_id"),
  /** Minted when the job is: the new session is started under this id. */
  targetInstanceId: text("target_instance_id").notNull(),
  /** The send the opening goes out as, so it is sent once whatever restarts. */
  openingUuid: text("opening_uuid").notNull(),
  /** The summariser's answer, kept once read so a restart never asks again. */
  summary: text("summary"),
  stage: text("stage").$type<ContinuationJob["stage"]>().notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});
