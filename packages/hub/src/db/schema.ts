import type {
  AccountHue,
  AccountIdentity,
  AccountKind,
  AccountMove,
  AccountOverage,
  AccountProvider,
  AtLimit,
  AuthState,
  BuildInfo,
  CapPeriod,
  ClaudeModelUsage,
  ContinuationJob,
  DelegateAskStatus,
  DelegateEventKind,
  DelegateEventPayload,
  Envelope,
  FleetMcpConfig,
  FleetScope,
  FleetSyncReport,
  HarnessReport,
  HomeStore,
  HookEvent,
  HookHandler,
  LandsMode,
  LimitWindow,
  ModelInfo,
  MoveRequest,
  MoveStage,
  NeutralUserMessage,
  OnCap,
  OpenCodeGoLimits,
  RuleAction,
  RuleMatchKind,
  RuleScope,
  RuleTiming,
  RuleTrigger,
  RuleWatch,
  SendMode,
  SendRefusal,
  SendState,
  SessionEffort,
  SessionTooling,
  SigninState,
  SkillFile,
  StrategyChoice,
  ThreadAnswer,
  ThreadMessage,
  ThreadQuestion,
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
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { ContinueRequest, PreparedContinuation } from "../continuation";
import type { MoveState } from "../moves";

const timestamp = (column: string) => integer(column, { mode: "timestamp_ms" });

/**
 * One harness conversation a session had before the one it runs now
 * (`instances.conversations`): its key, the harness and account it ran on,
 * when the session left it, and the hub's line placed right after it in the
 * transcript (the `continued` line of the move that left it; null for a
 * conversation folded in with no line of its own).
 */
export interface PriorConversation {
  accountId: string | null;
  endedAt: number;
  harness: string;
  model: string | null;
  /** The `limit_events` id drawn after it. */
  next: string | null;
  sessionId: string;
}

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

/**
 * A project: one identity for work across machines and folders (WORDS.md).
 * Where its files are is its places (`project_places`); `machineId` and `cwd`
 * are its primary place, the one it was made from, and every client that
 * reads a project as one folder on one machine reads that one.
 */
/**
 * A project (§5.1 of the Projects spec): its name and settings. Where its
 * files are is its places (`project_places`): its folder on the hub from the
 * moment it is made, and the checkouts it gains, one of them primary.
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /**
   * The checkout's `origin`, normalised to `host/owner/repo` (projects.ts
   * `normaliseRemote`): how a checkout of the same repository on another
   * machine is known as this project. Null until a place's machine has
   * answered, and for a folder with no remote.
   */
  remote: text("remote"),
  /**
   * Where the project's tasks live (§5.2 of the Projects spec): CawCo's own
   * files in the project folder. GitHub Issues and Linear are named so the
   * setting is ready for them; the hub refuses them until they are built.
   */
  tracker: text("tracker").$type<Tracker>().notNull().default("cawco"),
  /**
   * The project's lead (§5.3): its Caw's session, which the hub starts on the
   * first event while `caw` is on (caw.ts). The attempts the dispatcher starts
   * on its own report to it. Null: no session yet, or Caw is off, and nothing
   * is dispatched without someone asking.
   */
  leadInstanceId: text("lead_instance_id"),
  /**
   * Whether the project has a Caw (§5.3, §5.6): a lead session woken by
   * events only. On for projects made with Caw; off for every project from
   * before it, and off means nothing for the project wakes a model.
   */
  caw: integer("caw", { mode: "boolean" }).notNull().default(false),
  /** The harness Caw runs on: one that can deny its edit and shell tools. */
  cawHarness: text("caw_harness")
    .$type<import("@cawco/core").CawHarness>()
    .notNull()
    .default("claude"),
  /** The model Caw's session runs; null: the harness's own default. */
  cawModel: text("caw_model"),
  /**
   * What the lead session had cost when its last turn was booked to a
   * thread: its results carry the session's cumulative cost, so a turn's own
   * is the difference. Back to 0 with each new lead session.
   */
  leadCostSeen: real("lead_cost_seen").notNull().default(0),
  /**
   * Whether the hub starts attempts at ready tasks on its own (dispatch.ts).
   * Off until you turn it on, and inert without a lead.
   */
  dispatch: integer("dispatch", { mode: "boolean" }).notNull().default(false),
  /** Live attempts at once, past which the dispatcher starts no more. */
  maxAttempts: integer("max_attempts").notNull().default(2),
  /** Tasks waiting in `you` stages at which the dispatcher pauses. */
  reviewLimit: integer("review_limit").notNull().default(5),
  /**
   * Where its tasks' attempts land when the task file says nothing
   * (`lands:`): onto the default branch, as before there was a choice.
   */
  lands: text("lands").$type<LandsMode>().notNull().default("main"),
  /**
   * The budget every work item of the project runs under, field by field,
   * where neither its delegate call nor its task names one (work-items.ts
   * `overBudget`). Null: no default.
   */
  budget: text("budget", { mode: "json" }).$type<WorkBudget>(),
  /**
   * What the project may spend in a period (`cap_period`), in dollars: every
   * session of it, its Caw and its attempts (project-caps.ts). Null: no cap,
   * and no limit.
   */
  capUsd: real("cap_usd"),
  /** The span the cap counts over, in the hub's zone; set with `cap_usd`. */
  capPeriod: text("cap_period").$type<CapPeriod>(),
  /**
   * What reaching the cap does, the project's own; null inherits the fleet's
   * (`spend_settings`).
   */
  onCap: text("on_cap").$type<OnCap>(),
  /** The accounts its sessions may run on; null: every account. */
  accounts: text("accounts", { mode: "json" }).$type<string[]>(),
  /**
   * When the person answered a move's ask "Don't move" (moves.ts): a folder
   * that still needs that ask can't move, and the New session modal says so
   * instead of asking again. Null: never declined.
   */
  moveDeclinedAt: timestamp("move_declined_at"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * What a work item may spend before the hub stops it: dollars (the usage its
 * machine reports for its session), turns its session ends, and minutes of
 * wall time since it started. Each is optional; one reached fails the item.
 */
export interface WorkBudget {
  minutes?: number;
  turns?: number;
  usd?: number;
}

/** Where a project's tasks live: CawCo's files, or (later) an outside tracker. */
export type Tracker = "cawco" | "github" | "linear";

/**
 * Attempts a stage's `runs:` hook asked for while the project already ran
 * its `max_attempts` (dispatch.ts): each starts, oldest first, as a slot
 * frees, if its task is still in that stage. Kept here so a hub restart does
 * not forget them.
 */
export const queuedTaskStarts = sqliteTable(
  "queued_task_starts",
  {
    projectId: text("project_id").notNull(),
    /** The task, `tsk-12`. */
    taskId: text("task_id").notNull(),
    /** The stage whose hook asked for it. */
    stage: text("stage").notNull(),
    /** The session that moved the task in, which takes the report; null: the lead. */
    parentInstanceId: text("parent_instance_id"),
    /**
     * Why it waits: `cap`, the project runs `max_attempts` already; `owns`,
     * a live work item owns files this attempt's task owns too.
     */
    why: text("why").$type<"cap" | "owns">().notNull().default("cap"),
    /**
     * A retry (`task_retry`): it starts as one, a fresh session in the last
     * attempt's workspace briefed with its failure (dispatch.ts).
     */
    retry: integer("retry", { mode: "boolean" }).notNull().default(false),
    queuedAt: timestamp("queued_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.taskId] })]
);

/**
 * The index of a project's task files (`tasks/<id>-<slug>.md` in its hub
 * folder, task-file.ts): what a list reads instead of every file. Rebuilt from
 * the files: a row whose `hash` no longer matches its file's content is read
 * again, so a hand edit is picked up on the next read. Nothing here is the
 * truth; the files are.
 */
export const projectTasks = sqliteTable(
  "project_tasks",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The file, from the project folder's root: `tasks/tsk-12-fix-toggle.md`. */
    path: text("path").notNull(),
    /** `tsk-12`, from the file's name. */
    id: text("id").notNull(),
    /** 12: the id's number, for order and for the next id. */
    number: integer("number").notNull(),
    title: text("title").notNull(),
    /** The file's `stage:`; empty when it names none. */
    stage: text("stage").notNull(),
    /** The delegate type it is assigned to. */
    type: text("type"),
    /** The tasks it waits for (`tsk-…`). */
    after: text("after", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    parent: text("parent"),
    /** Tasks it is related to, and the task it was found in: the canvas's other edges. */
    related: text("related", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    foundIn: text("found_in"),
    rank: text("rank"),
    labels: text("labels", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default([]),
    todosDone: integer("todos_done").notNull().default(0),
    todosTotal: integer("todos_total").notNull().default(0),
    /** What in the file could not be read, in a sentence; null when all of it could. */
    problem: text("problem"),
    /** sha256 hex of the file's content as indexed. */
    hash: text("hash").notNull(),
    /** When the hub last saw the content change. */
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.path] }),
    index("project_tasks_id").on(table.projectId, table.id),
  ]
);

/**
 * What a place is: a checkout on a machine, a delegate's workspace (kept
 * while the workspace is active), or the project's folder on the hub (its
 * `machineId` is `"hub"` (db `HUB_PLACE_MACHINE`) and its path `projects/<id>`, relative
 * to the hub's data folder; every project has one from the moment it is
 * made).
 */
export type PlaceKind = "checkout" | "workspace" | "hub";

/** Where a project's files are, one row per machine and folder. */
export const projectPlaces = sqliteTable(
  "project_places",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Not a reference: a machine's places go with it in `deleteMachine`. */
    machineId: text("machine_id").notNull(),
    path: text("path").notNull(),
    kind: text("kind").$type<PlaceKind>().notNull(),
    /**
     * The project's primary checkout: where it is worked on first, and what a
     * client names it by. Exactly one checkout per project once it has any,
     * set when its first checkout is added; never a workspace or the hub's.
     */
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("project_places_where").on(
      table.projectId,
      table.machineId,
      table.path
    ),
    index("project_places_machine").on(table.machineId, table.path),
  ]
);

/**
 * A project's repository on a machine: the folder the hub last cut a
 * workspace of the project from there. A check that names the machine cuts
 * its check workspace from it (work-items.ts `checkWorkspace`). It outlives
 * every workspace cut from it, and is no place: nothing else reads it.
 */
export const projectRepositories = sqliteTable(
  "project_repositories",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** Not a reference: a machine's repositories go with it in `deleteMachine`. */
    machineId: text("machine_id").notNull(),
    path: text("path").notNull(),
    recordedAt: timestamp("recorded_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.machineId] })]
);

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
  /**
   * A start the hub accepted but did not forward because its machine was
   * installing an update: the envelope to send, kept until the machine can take
   * it. The row stays `starting` meanwhile, which is how the person sees it.
   */
  owedSpawn: text("owed_spawn"),
  /** When it was asked for, so what a machine is owed goes out in order. */
  owedAt: integer("owed_at"),
  /**
   * When the session started again fresh under its id (core `relaunchOf`):
   * its first start never began, so it had no conversation to resume. Its
   * transcript says so there (core `FRESH_START_LINE`).
   */
  freshStartAt: integer("fresh_start_at"),
  /**
   * When the hub first heard the session's turn under way (its frames, or its
   * harness reading a send), on the hub's clock; null between turns. Cleared
   * by the turn's `result`, which every harness ends every turn with, an
   * interrupted one too. Older than `spawnedAt`: the turn ran in a launch
   * that is gone and nothing ended it. Every start but a restore clears it,
   * so that is a turn a restart cut, which the restored process is handed
   * back once (server.ts `resumeCutTurn`). {@link TURN_UNRECORDED} on a row
   * from before the hub kept it, until its next turn.
   */
  turnOpenAt: integer("turn_open_at"),
  /**
   * The session started on a machine its project was moved to for it (core
   * `MOVED_HERE`): when, and the move's ready line, what moved and what
   * stayed. Its transcript opens on that line.
   */
  movedHere: text("moved_here", { mode: "json" }).$type<{
    at: number;
    moved: string;
    stayed?: string;
  }>(),
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
  /**
   * Claude: the cumulative `modelUsage` of the session's last result, which a
   * turn's spend is the change from. Claude Code restores it on resume from
   * the transcript's cost-state, so it runs across processes. `{}` for a
   * conversation started fresh; null while unknown (a resumed or forked start
   * this hub has seen no result of), until a result sets it.
   */
  modelUsageSeen: text("model_usage_seen", { mode: "json" }).$type<
    Record<string, ClaudeModelUsage>
  >(),
  workflowRunId: text("workflow_run_id"),
  workflowStepId: text("workflow_step_id"),
  /**
   * The thread with the project's Caw this session works for: an attempt at
   * a task, the thread that named the task; a session Caw started, the
   * thread his turn was answering. Set once, at its spawn.
   */
  threadId: text("thread_id"),
  id: text("id").primaryKey(),
  /**
   * The machine it runs on. Not a foreign key: a removed machine's sessions
   * stay, `machineRemoved`, under its id, and come back if it rejoins.
   */
  machineId: text("machine_id").notNull(),
  /** Its project; a deleted project's sessions outlive it, just not as its. */
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** SDK session id, absent until the first init frame arrives. */
  sessionId: text("session_id"),
  /** Which harness owns `sessionId` — what a resume and a catalog read route on. */
  harness: text("harness"),
  /**
   * The account the session runs on, chosen by placement when it started (a
   * fork's is its origin's). Every later spawn of the row runs on it, until
   * the hub moves it to another at its limit. Null: a harness without
   * accounts, or a session from before accounts.
   */
  accountId: text("account_id"),
  /**
   * The session this one was forked from, when it was: it reads that
   * session's cache, so it never moves to another account on its own.
   */
  forkedFrom: text("forked_from"),
  /**
   * The harness conversations this session had before the one it runs now
   * (`sessionId`), oldest first: each time it went on from a summary in a
   * fresh conversation (at its account's limit, or because it asked), the
   * one it left. Its transcript reads them in order, then the current one,
   * each on the machine it runs on, in the account dir it ran in there.
   * Empty on a session that never continued.
   */
  conversations: text("conversations", { mode: "json" })
    .$type<PriorConversation[]>()
    .notNull()
    .default([]),
  /** The instance this one is a delegate of (nested under it in every rail). */
  parentInstanceId: text("parent_instance_id"),
  /** The delegating tool call, so the parent transcript can render the round trip. */
  parentToolUseId: text("parent_tool_use_id"),
  /**
   * The directory the session was launched in: its spawn's, or, for a scratch
   * session, the worktree its machine made for it, as its first `init` names
   * it resolved (`~` expanded). Set at its first spawn and never changed:
   * every resume, revive, restore, relaunch, fork and move spawns here, since
   * a harness keeps the conversation under the directory it was launched in.
   * Where the CLI later wanders (`cd`) is not recorded at all, so a folder it
   * wandered into and deleted cannot stop it resuming, and its name in every
   * listing (the folder's leaf) does not drift.
   */
  cwd: text("cwd").notNull(),
  /**
   * Whether `cwd` is the launch directory. `known` on every row spawned since
   * `cwd` was pinned. `unread` on a row from before, whose launch directory is
   * still to be read from its conversation (the harness's first recorded cwd):
   * its machine is asked at its next register, before anything is restored.
   * `unknown` when that machine had no record of the conversation: `cwd` may be
   * a folder the CLI wandered into, so the row is never named by it nor
   * spawned there.
   */
  launchDir: text("launch_dir", { enum: ["known", "unread", "unknown"] })
    .notNull()
    .default("known"),
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
   * `scratch`: a spin-off (NEW.md §1), shown apart from mainline work.
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
   * The toolset the session runs in (§5.3), written once by its first spawn:
   * `lead` for a project's Caw, a delegate type's `role` for its work item's
   * session. Null: derived from how it started (roles.ts `roleOf`).
   */
  role: text("role").$type<import("@cawco/core").SessionRole>(),
  /**
   * The delegate type its spawn named (a fleet type, or its project's), so
   * what the type says — "CawCo's to-dos" — reads the same for every session
   * however it started. Null: none.
   */
  delegateType: text("delegate_type"),
  /** The project whose catalog `delegateType` came from; null: the fleet's. */
  delegateTypeProject: text("delegate_type_project"),
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
      | "moving"
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

/**
 * What each cawco MCP listing last answered `tools/list` with, as a hash: a
 * session's (by instance), or OpenCode's shared discovery's. A connection
 * whose tools differ is told `notifications/tools/list_changed`, across a hub
 * restart onto a new build too.
 */
export const mcpToolListings = sqliteTable("mcp_tool_listings", {
  listing: text("listing").primaryKey(),
  toolsHash: text("tools_hash").notNull(),
  listedAt: timestamp("listed_at").notNull(),
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
  /**
   * The workspace's scratch dir on its machine, its commands' `TMPDIR`, as
   * the machine named it when the workspace was cut. Null for a workspace
   * cut before this was recorded.
   */
  tmp: text("tmp"),
  createdByInstanceId: text("created_by_instance_id").notNull(),
  /**
   * The workspace whose checks this one runs, on a machine other than that
   * one's: a check workspace, cut there the first time one of its items'
   * checks names the machine, and archived with it. Null for a delegate's.
   */
  checksFor: text("checks_for"),
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
  /**
   * The machine it runs on, by machineId, when not the workspace's own: the
   * hub runs it in that workspace's check workspace there, at the item's
   * last commit (work-items.ts `runChecks`).
   */
  machine?: string;
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
    /**
     * The project task this item is an attempt at (`tsk-12`, in its session's
     * project), if any: the one task whose to-dos its session may write.
     */
    taskId: text("task_id"),
    /**
     * The project the item works for: its task's, else its parent session's.
     * Kept on the item so a task's attempts, and where its outputs go, are
     * found by the item alone, whatever becomes of its session.
     */
    projectId: text("project_id"),
    /**
     * Where its commits go once its checks pass (landing.ts): onto the
     * workspace's base branch, to `cawco/<task or item>` on origin, to that
     * branch with a pull request, or nowhere.
     */
    lands: text("lands").$type<LandsMode>().notNull().default("main"),
    /**
     * Files in its workspace, as paths from the clone's root, that the hub
     * copies into its project's folder (`assets/<task or item>/`) when it
     * finishes; one missing sends it back to its session. Null: none.
     */
    outputs: text("outputs", { mode: "json" }).$type<string[]>(),
    /**
     * The pull request its landing opened or found open, when it lands `pr`:
     * what a poller watches to move its task on when it merges.
     */
    prUrl: text("pr_url"),
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
    /**
     * The group it was delegated in, under its parent: the parent hears one
     * combined report once every item of the group has ended (a failure
     * still reports at once). Null: it reports on its own.
     */
    group: text("group_name"),
    /**
     * When the group's combined report carried this item; null while it has
     * not, so a group used again starts a new round.
     */
    groupReportedAt: timestamp("group_reported_at"),
    /**
     * What a group's combined report says of it: its summary and its landing
     * line, written when it lands.
     */
    digest: text("digest"),
    /**
     * Globs of the repository's files this item owns: the hub never runs two
     * live items whose globs overlap in one repository (work-items.ts
     * `globsOverlap`). Null: it claims nothing.
     */
    owns: text("owns", { mode: "json" }).$type<string[]>(),
    /** What it may spend before the hub stops it; null: no limit. */
    budget: text("budget", { mode: "json" }).$type<WorkBudget>(),
    /** Turns its session has ended since it started. */
    turns: integer("turns").notNull().default(0),
    /**
     * What its session had spent before it began (a follow-up carries on a
     * session that has history): its spend is the session's past this.
     */
    spendBaseUsd: real("spend_base_usd").notNull().default(0),
  },
  (table) => [
    index("work_items_workspace").on(table.workspaceId, table.state),
    index("work_items_parent").on(table.parentInstanceId, table.state),
    index("work_items_task").on(table.projectId, table.taskId),
  ]
);

/**
 * A `delegate` call that waits because a live work item owns files it owns
 * too (work-items.ts): a chip in its parent's tray while it waits, it starts,
 * oldest first, when no live item overlaps it any more, its item taking this
 * row's id. Kept here across a hub restart.
 */
export const queuedWorkItems = sqliteTable("queued_work_items", {
  id: text("id").primaryKey(),
  parentInstanceId: text("parent_instance_id").notNull(),
  /**
   * The request as `delegate` made it, with the ids it stands under while it
   * waits (work-items.ts `WorkItemRequest`, `queuedAs`).
   */
  request: text("request", { mode: "json" }).$type<unknown>().notNull(),
  title: text("title").notNull(),
  queuedAt: timestamp("queued_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

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
    /** What refused it, when the hub did (`SendRefusal`): what its row offers to recover. */
    refusal: text("refusal", { mode: "json" }).$type<SendRefusal>(),
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
    /**
     * A send the hub accepted and its machine has not been handed yet, as the
     * envelope to hand it: its session's start is held (its machine is
     * installing an update) or its machine's agent is away within the grace a
     * restart gets. The record is `pending`, which every screen draws as
     * queued; the envelope goes once the hold ends, in the order accepted.
     * Null for every send its machine has.
     */
    owed: text("owed"),
    /**
     * The send whole, as its machine is handed it (`Envelope<SendPayload>`),
     * kept while it is pending: a process that went away before reading it
     * leaves the hub what to hand the session's next process. Null once the
     * send is no longer pending, and on a keep-alive ping, which nothing
     * hands on.
     */
    envelope: text("envelope"),
    /**
     * Its current hand-off to its machine (`SendPayload.delivery`). A machine
     * handing a send back names the hand-off it was given; one that is not
     * this was overtaken by a later hand-off and is not owed again.
     */
    delivery: text("delivery"),
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
  /**
   * Bound to one project (`local`: each checkout's own map in
   * `.claude.json`); null for every machine and folder. The hub places a
   * bound row at every checkout and delegate workspace of its project
   * (project-placements.ts); no cwd is stored, as on `fleet_hooks`.
   */
  scope: text("scope").$type<FleetScope>(),
  projectId: text("project_id"),
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
  /** The client the stored tokens were issued to; refreshing them must use that one. */
  tokenClient: text("token_client", {
    mode: "json",
  }).$type<OAuthClientInformationFull>(),
  pending: text("pending", { mode: "json" }).$type<{
    /** The client this sign-in started with, which is the one its code is exchanged by. */
    client: OAuthClientInformationFull;
    redirectUri: string;
    verifier: string;
    state: string;
    expiresAt: number;
  }>(),
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
  /**
   * Bound to one project (`project`: `<checkout>/.claude/skills/<name>/`);
   * null for every machine (`~/.claude/skills/`). Placed at every checkout
   * and delegate workspace of the project, as a bound MCP server is.
   */
  scope: text("scope").$type<FleetScope>(),
  projectId: text("project_id"),
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

/** Small settings the hub keeps by id: the Telegram bridge's chat. */
export const credentials = sqliteTable("credentials", {
  id: text("id").primaryKey(),
  /** The setting, as JSON. */
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
 * The OpenCode Go plan's last reading on each machine (USAGE-SPEC.md §6.1),
 * read with the machine's own Go key. Claude's limits are per account
 * ({@link accountReadings}).
 */
export const usageLimits = sqliteTable("usage_limits", {
  machineId: text("machine_id").primaryKey(),
  /** The OpenCode Go plan's windows; null on a machine with no Go key. */
  openCodeGo: text("open_code_go", { mode: "json" }).$type<OpenCodeGoLimits>(),
  fetchedAt: timestamp("fetched_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A provider account (core `Account`): one sign-in placement can put sessions
 * on. Its credential is never here: it lives in the account's own Claude Code
 * config dir on each machine signed in to it.
 */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  provider: text("provider").$type<AccountProvider>().notNull(),
  kind: text("kind").$type<AccountKind>().notNull(),
  /** A nickname; null: the account goes by its identity's email. */
  label: text("label"),
  hue: text("hue").$type<AccountHue>().notNull(),
  order: integer("order").notNull(),
  neverBackup: integer("never_backup", { mode: "boolean" })
    .notNull()
    .default(false),
  reservePct: integer("reserve_pct"),
  /** The email and organization `claude auth status` reported at its first sign-in. */
  identity: text("identity", { mode: "json" }).$type<AccountIdentity>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Every account this hub removed (or joined away into another), and when.
 * A connecting machine forgets its store of an account in this record and
 * no other: a store whose id this hub never heard of (as after its database
 * was wiped or restored from an older copy) is left alone.
 */
export const removedAccounts = sqliteTable("removed_accounts", {
  id: text("id").primaryKey(),
  removedAt: timestamp("removed_at").notNull(),
  /** `removed` by a person, or `joined` into the account its sign-in already was. */
  why: text("why").$type<"removed" | "joined">().notNull(),
});

/** Where each account is signed in, as each machine's agent last reported it. */
export const accountSignins = sqliteTable(
  "account_signins",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    machineId: text("machine_id").notNull(),
    state: text("state").$type<SigninState>().notNull(),
    /** When a credential from one of the machine's own stores was moved into this account there; null for a sign-in made in CawCo. */
    movedAt: timestamp("moved_at"),
    /** The store it was moved from: `claude` (`~/.claude`), `pi` or `opencode` (their own `auth.json`). */
    movedFrom: text("moved_from").$type<HomeStore>(),
    checkedAt: timestamp("checked_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.machineId] })]
);

/**
 * A credential moving out of a machine's own store into a CawCo account
 * (`POST /api/accounts/move-login`), from the ask until the machine has moved
 * it or said why not. Kept here so a hub restart carries the move on.
 */
export const loginMoves = sqliteTable(
  "login_moves",
  {
    machineId: text("machine_id").notNull(),
    /** `claude` (`~/.claude`), `pi` or `opencode` (their own `auth.json`). */
    store: text("store").$type<HomeStore>().notNull(),
    /** The provider's id in the store it leaves (OpenCode's `openai` for ChatGPT). */
    storeProvider: text("store_provider").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    identity: text("identity", { mode: "json" })
      .$type<AccountIdentity>()
      .notNull(),
    provider: text("provider").$type<AccountProvider>().notNull(),
    since: timestamp("since").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.machineId, table.store, table.storeProvider],
    }),
  ]
);

/**
 * The sessions whose process still runs from a credential that has moved out
 * of its machine's store, until each is put to sleep at rest or its process
 * is gone. Kept here so a hub restart still puts them to sleep.
 */
export const movedFromSessions = sqliteTable("moved_from_sessions", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  machineId: text("machine_id").notNull(),
});

/** Each provider's routing (core `ProviderRouting`); a provider with no row uses the defaults. */
export const accountRouting = sqliteTable("account_routing", {
  provider: text("provider").$type<AccountProvider>().primaryKey(),
  yours: text("yours", { mode: "json" }).$type<StrategyChoice>().notNull(),
  delegates: text("delegates", { mode: "json" })
    .$type<StrategyChoice>()
    .notNull(),
  atLimit: text("at_limit", { mode: "json" }).$type<AtLimit>().notNull(),
});

/**
 * Each account's freshest limit reading, from what its sessions' Claude Code
 * reported (`rate_limit_event`, `accountInfo()`), whichever machine they ran on.
 */
export const accountReadings = sqliteTable("account_readings", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  windows: text("windows", { mode: "json" })
    .$type<LimitWindow[]>()
    .notNull()
    .default([]),
  subscription: text("subscription"),
  overage: text("overage", { mode: "json" }).$type<AccountOverage>(),
  lastSeenAt: timestamp("last_seen_at").notNull(),
});

/**
 * Each account's model catalog, as its Claude Code answered at initialize (a
 * probe's, or any of its sessions'), and the effort each model ran at when a
 * session asked for none. Kept so a picker has the account's models with
 * nothing running, across agent and hub restarts.
 */
export const accountCatalogs = sqliteTable("account_catalogs", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  models: text("models", { mode: "json" }).$type<ModelInfo[]>().notNull(),
  defaultEfforts: text("default_efforts", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  readAt: timestamp("read_at").notNull(),
});

/**
 * Accounts out of placement until their window resets: one of their sessions'
 * Claude Code said a window refused it. Hub-wide, so every machine sees it.
 * `scope` is the model scope ("Opus") the window limits; "" is every model.
 */
export const accountBench = sqliteTable(
  "account_bench",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    until: timestamp("until").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.scope] })]
);

/**
 * Sessions waiting out their account's limit: their last turn was refused,
 * and the hub sends them on when `until` comes (the reset), or sooner when
 * another account can take them. `until` null: no reset was named, and the
 * hub looks again on its own clock.
 */
export const limitHolds = sqliteTable("limit_holds", {
  instanceId: text("instance_id").primaryKey(),
  /** The account at its limit. */
  accountId: text("account_id").notNull(),
  until: timestamp("until"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A summary of a session at its account's limit: what continuing it on
 * another account starts from. Written ahead of the limit while its account
 * still had room (`percent`), or at a move (`percent` null), and kept while
 * it stays on that account, so a retry after a failed continuation starts
 * from it again. It answers for the conversation up to `covers` only: once
 * the session's summarised part ends elsewhere, a fresh one replaces it.
 * Discarded when the window resets, or the session ends or leaves the
 * account. `summary` and `covers` null: the summariser is still writing it.
 */
export const limitSummaries = sqliteTable("limit_summaries", {
  instanceId: text("instance_id").primaryKey(),
  /** The account the session is on, at its limit. */
  accountId: text("account_id").notNull(),
  /** The account whose summariser wrote it. */
  writtenOn: text("written_on").notNull(),
  /** The reset of the window it was written against (ISO). */
  resetsAt: text("resets_at").notNull(),
  /** That window's percent when a summary written ahead of the limit was started; null: written at a move. */
  percent: integer("percent"),
  /**
   * The last transcript entry the summary covers: the end of the part of
   * the conversation a continuation summarises (the rest goes verbatim).
   */
  covers: text("covers"),
  summary: text("summary"),
  preparedAt: timestamp("prepared_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The lines the hub writes into a session's transcript at its account's
 * limit (core `ACCOUNT_MOVE`, `move` what it did): kept here, since the
 * harness's own transcript is not the hub's to write, and laid into every
 * read of it by time.
 */
export const limitEvents = sqliteTable(
  "limit_events",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id").notNull(),
    at: timestamp("at").notNull(),
    move: text("move", { mode: "json" }).$type<AccountMove>().notNull(),
  },
  (table) => [index("limit_events_instance_idx").on(table.instanceId)]
);

/**
 * Every limit reading that said something new, kept as a series so burn RATE is
 * observable and not just burn LEVEL: the account's reading is overwritten on
 * every report, and can answer "am I at 39%?" but never "how fast did I get
 * there?".
 *
 * One row per window per CHANGE, not per reading: an integer percent moves
 * maybe 100 times a day, and every report in between repeats it.
 * {@link CawcoDb.putAccountReading} diffs against the previous reading and
 * writes only what moved.
 */
export const usageLimitHistory = sqliteTable(
  "usage_limit_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: text("account_id").notNull(),
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
    // The only query this table exists to serve: one account's one window over
    // a time range, in order.
    index("usage_limit_history_series_idx").on(
      table.accountId,
      table.kind,
      table.fetchedAt
    ),
    // Retention prunes by age alone, across every account and kind.
    index("usage_limit_history_fetched_idx").on(table.fetchedAt),
  ]
);

/**
 * The tokens each completed turn spent, by model, on the account it ran on:
 * laid beside {@link usageLimitHistory}, how much a percent of an account's
 * window costs is measurable. Rows for every turn the hub claims
 * (`completed_turns`), compactions and keep-alive pings included, since they
 * spend the same window. Kept 14 days.
 */
export const turnUsage = sqliteTable(
  "turn_usage",
  {
    instanceId: text("instance_id").notNull(),
    /** The harness's result identity, the one `completed_turns` claims. */
    resultId: text("result_id").notNull(),
    /** As the harness names it: Claude's id, `provider/model` for OpenCode and pi. */
    model: text("model").notNull(),
    /** Null: the machine's own sign-in, which is no account. */
    accountId: text("account_id"),
    /** Uncached input. */
    inputTokens: integer("input_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    /** Every cache write, whatever its lifetime. */
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    /** The part of {@link cacheWriteTokens} written for an hour; null when the harness does not split it. */
    cacheWrite1hTokens: integer("cache_write_1h_tokens"),
    outputTokens: integer("output_tokens").notNull(),
    /**
     * Claude: the change in its `modelUsage[model].costUSD`, Claude Code's own
     * price. OpenCode and pi: the model's list rates. Null when unpriced.
     */
    costUsd: real("cost_usd"),
    keepAlive: integer("keep_alive", { mode: "boolean" }).notNull(),
    at: timestamp("at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.instanceId, table.resultId, table.model],
    }),
    index("turn_usage_account_at_idx").on(table.accountId, table.at),
    index("turn_usage_at_idx").on(table.at),
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

/**
 * What a skill used to be. Every change to the fleet's copy records the
 * version it replaced, and an overwrite records the edited copy it is about to
 * destroy on a machine, so a skill somebody changed by hand is never one click
 * away from being gone. Mirrors `fleetHookHistory` and `fleetMemoryHistory`:
 * keyed to the skill it was a version of, pruned the same way, restored the
 * same way. Its material is the skill's files, which neither of theirs holds.
 */
export const fleetSkillHistory = sqliteTable("fleet_skill_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Which skill this was a version of. Deletes take a final snapshot too. */
  name: text("name").notNull(),
  /**
   * The source the fleet's row had for this version, which a restore puts
   * back: `owner/repo@skill`, a URL, or `machine:<machineId>` for a copy
   * taken off a machine.
   */
  skillSource: text("skill_source").notNull(),
  hash: text("hash").notNull(),
  bytes: integer("bytes").notNull(),
  files: text("files", { mode: "json" }).$type<SkillFile[]>().notNull(),
  /** `fleet` for the hub's own row; `machine:<machineId>` for an edited copy an overwrite took off it. */
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
  /**
   * The fleet's "CawCo's to-dos" choice (§5.2): every session is denied its
   * harness's own list and plan mode, added at spawn (`cawcoTodosDenied`),
   * never stored in `denied_tools`.
   */
  cawcoTodos: integer("cawco_todos", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * When the fleet's two choices (delegates, CawCo's to-dos) were last set
   * through `PUT /api/fleet/choices`; null while nobody has set them, which
   * is when a new project's setup page asks for them.
   */
  choicesSetAt: timestamp("choices_set_at"),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The fleet's spend settings — one row, keyed `'spend'`, following the
 * {@link supervisorConfig} single-row precedent: what reaching a project's
 * spend cap does where the project sets nothing (project-caps.ts). No row
 * reads as its defaults.
 */
export const spendSettings = sqliteTable("spend_settings", {
  /** Always `'spend'`. */
  id: text("id").primaryKey(),
  onCap: text("on_cap").$type<OnCap>().notNull().default("both"),
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

/**
 * The ids a session had before the hub folded its continuations into it
 * (migration 0128): a hub before it started a second session for each
 * continuation at an account's limit, and each of those is one session now,
 * under the id of the one that runs (`instanceId`). Anything that names a
 * former id — a link, a tab, a session's memory of its parent — is that
 * session. `folded`: the former row's data has been moved onto it and the
 * row is gone (db `foldFormerSessions`, once).
 */
export const instanceAliases = sqliteTable("instance_aliases", {
  id: text("id").primaryKey(),
  instanceId: text("instance_id").notNull(),
  folded: integer("folded", { mode: "boolean" }).notNull().default(false),
});

/**
 * Project moves (moves.ts, core move.ts): the one record of each, so a hub
 * that restarts mid-way carries the job on from its stage rather than
 * forgetting it. A started or cancelled job is kept a while so a screen that
 * was away hears how it ended, then deleted; a failed one stays until it is
 * retried or cancelled.
 */
export const moves = sqliteTable("moves", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  stage: text("stage").$type<MoveStage>().notNull(),
  /** Everything the job has learned and decided, as moves.ts keeps it. */
  state: text("state", { mode: "json" }).$type<MoveState>().notNull(),
  /** The request as asked: the target and the spawn New session sent. */
  request: text("request", { mode: "json" }).$type<MoveRequest>().notNull(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * Phones (and iPads, Macs) the iOS app registered for pushes (push.ts). Keyed
 * by the pairing the app enrolled with Cawrier, the relay that holds the APNs
 * key; the hub pushes through it with the pairing's secret. A pairing Cawrier
 * no longer knows (401) or whose device is gone (410) is deleted.
 */
export const pushDevices = sqliteTable("push_devices", {
  /** The pairing's id at Cawrier, a lowercase v4 uuid. */
  pairingId: text("pairing_id").primaryKey(),
  /** The pairing's secret, base64url; sent to Cawrier only, never answered by a route. */
  secret: text("secret").notNull(),
  /**
   * The device's push key: 32 random bytes from the device, standard base64.
   * Each push's real words are sealed under it (AES-256-GCM) so only the
   * device reads them. Never logged, never answered by a route, never sent.
   */
  key: text("key").notNull(),
  /** The device's own name (`UIDevice.name`), for Settings. */
  name: text("name").notNull(),
  /** `ios`, `ipados` or `macos`. */
  platform: text("platform").notNull(),
  /** Quiet: registered, and sent nothing. */
  quiet: integer("quiet", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  /** When Cawrier last took a push for it. */
  lastSentAt: timestamp("last_sent_at"),
  /** Why the last push was refused, cleared by the next one taken. */
  lastError: text("last_error"),
});

/**
 * "Make this a project" (project-offers.ts): the one offer a plain session
 * gets when it outgrows itself. A row means it was offered, so it is never
 * offered again; `answer` stays null while the offer stands.
 */
export const projectOffers = sqliteTable("project_offers", {
  instanceId: text("instance_id").primaryKey(),
  /** Which signal made it: `delegates`, `days`, `plan` or `repo`; `caw` when Caw asked in conversation. */
  reason: text("reason")
    .$type<import("@cawco/core").ProjectOfferReason>()
    .notNull(),
  /** The sentence the offer says, naming why. */
  line: text("line").notNull(),
  offeredAt: timestamp("offered_at").notNull(),
  answer: text("answer").$type<"accepted" | "dismissed">(),
  answeredAt: timestamp("answered_at"),
  /** The project accepting made or joined. */
  projectId: text("project_id"),
});

/**
 * A session's own plan (Projects spec §5.2, `plan.ts`), as it last wrote it
 * through `todo_write`'s session scope: its steps (CawCo's list, read only
 * while its native to-do tools are denied) and its spec. Each is replaced
 * whole on a write; a harness's own list is read from the harness, never
 * stored here.
 */
export const sessionPlans = sqliteTable("session_plans", {
  instanceId: text("instance_id").primaryKey(),
  steps: text("steps", { mode: "json" })
    .$type<import("@cawco/core").PlanStep[]>()
    .notNull(),
  /** The session's spec, markdown; null until it writes one. */
  spec: text("spec"),
  specAt: timestamp("spec_at"),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * A canvas (Projects spec §5.7): where a preview's choices are kept. Its id is
 * the preview's place, not the page's hash — `decisions:<project>/<page>` for
 * a decision page in a project's hub folder, `dir:<machine>:<path>` or
 * `port:<machine>:<port>` for a session's own preview — so a revised page
 * keeps every pick whose id it still carries.
 */
export const canvases = sqliteTable("canvases", {
  id: text("id").primaryKey(),
  /** The session that last showed it: the one a send goes to. */
  instanceId: text("instance_id").notNull(),
  /** The page's hash when the bridge last heard from it. */
  pageHash: text("page_hash"),
  /** When the person last sent their picks to the session. */
  sentAt: timestamp("sent_at"),
  updatedAt: timestamp("updated_at").notNull(),
});

/** One id's pick, note or value on a canvas (`ChoiceEntry`). */
export const canvasChoices = sqliteTable(
  "canvas_choices",
  {
    canvasId: text("canvas_id").notNull(),
    choice: text("choice").notNull(),
    options: text("options", { mode: "json" }).$type<string[]>().notNull(),
    note: text("note"),
    value: text("value", { mode: "json" }).$type<unknown>(),
    /** The page the person was looking at when this last changed. */
    pageHash: text("page_hash").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.canvasId, table.choice] })]
);

/** A conversation with a project's Caw (caw.ts). */
export const projectThreads = sqliteTable(
  "project_threads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The first message's opening words. */
    title: text("title").notNull(),
    /** The project's Setup thread, opened when New project made it (caw.ts `setup`). */
    setup: integer("setup", { mode: "boolean" }).notNull().default(false),
    createdAt: timestamp("created_at").notNull(),
    /** When its newest message was added. */
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [index("project_threads_project").on(table.projectId)]
);

/**
 * What each of a project's Caw turns cost, booked as the turn's result came
 * in (caw.ts `turnCost`): the one source of Caw's dollars, so a period's
 * total, each thread's share and the turns no thread woke always add up.
 */
export const cawTurns = sqliteTable(
  "caw_turns",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The thread that woke the turn; null when none did. */
    threadId: text("thread_id").references(() => projectThreads.id, {
      onDelete: "set null",
    }),
    /**
     * The harness whose own result said what the turn cost: Claude Code's
     * `total_cost_usd`, OpenCode's assistant messages' `cost` (the agent's
     * adapter sums them into the same field). Turns booked before it was
     * recorded take their project's Caw harness then (migration 0096).
     */
    harness: text("harness"),
    usd: real("usd").notNull(),
    at: timestamp("at").notNull(),
  },
  (table) => [index("caw_turns_project_at").on(table.projectId, table.at)]
);

/**
 * One message in a thread: yours from the dashboard (or your answer to Caw's
 * question), Caw's through `thread_reply`, or an event that woke Caw.
 */
export const threadMessages = sqliteTable(
  "thread_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => projectThreads.id, { onDelete: "cascade" }),
    author: text("author").$type<ThreadMessage["author"]>().notNull(),
    /** Empty for an event whose title says it all. */
    body: text("body").notNull(),
    /** An event's one line. */
    noteTitle: text("note_title"),
    /** The tasks Caw's message is about (`tsk-12`). */
    tasks: text("tasks", { mode: "json" }).$type<string[]>(),
    /** The project folder's files Caw's message says he wrote (`stages.md`). */
    files: text("files", { mode: "json" }).$type<string[]>(),
    /** Your answer's question and answer, from the lead's AskUserQuestion. */
    question: text("question", { mode: "json" }).$type<ThreadQuestion>(),
    answer: text("answer", { mode: "json" }).$type<ThreadAnswer>(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("thread_messages_thread").on(table.threadId)]
);

/**
 * Every permission and question a session is parked on, as the hub relays it
 * (`pending.ts`). Kept here so a hub that restarts still holds them: every
 * screen reading `/api/pending` the moment it is back sees the asks its
 * agents have not replayed yet, under the wait they were first raised with.
 */
export const parkedAsks = sqliteTable(
  "parked_asks",
  {
    requestId: text("request_id").primaryKey(),
    instanceId: text("instance_id"),
    machineId: text("machine_id").notNull(),
    /** The `permission_request` envelope, `raisedAt` stamped on its payload. */
    envelope: text("envelope", { mode: "json" }).$type<Envelope>().notNull(),
  },
  (table) => [index("parked_asks_instance").on(table.instanceId)]
);
