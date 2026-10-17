import type {
  AccountHue,
  AccountKind,
  AccountMove,
  AccountOverage,
  AccountProvider,
  AtLimit,
  AttemptResult,
  AuthState,
  BlockPage,
  BlockWidth,
  BuildInfo,
  CapPeriod,
  ClaudeModelUsage,
  ContinuationJob,
  DelegateAskStatus,
  DelegateEventKind,
  DelegateEventPayload,
  EffortLevel,
  EndedBy,
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
  McpPlatform,
  MemoryRole,
  ModelInfo,
  MoveRequest,
  MoveStage,
  NeutralUserMessage,
  OnCap,
  OpenCodeGoLimits,
  RoutineMadeEvent,
  Rule,
  RuleMatchKind,
  RuleScope,
  RuleState,
  RuleTiming,
  RuleWatch,
  SendAttachment,
  SendMode,
  SendRefusal,
  SendState,
  SessionEffort,
  SessionTooling,
  SigninState,
  SkillFile,
  StarterGlyph,
  StarterOutcome,
  StarterPlace,
  StarterSourceKind,
  StoppedCommands,
  StrategyChoice,
  ThreadAnswer,
  ThreadEvent,
  ThreadImage,
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
  WorkspaceCut,
  WorkspaceHolding,
} from "@cawco/core";
import type { MachineCapabilities } from "@cawco/core/capabilities";
import type { MachinePath } from "@cawco/core/machine-path";
import type {
  AuthorizationServerMetadata,
  OAuthClientInformationFull,
  OAuthProtectedResourceMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  customType,
  foreignKey,
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
import { hubSecrets, openOrNull } from "../secret-box";

const timestamp = (column: string) => integer(column, { mode: "timestamp_ms" });

/**
 * A secret column (secret-box.ts): sealed on every write, opened on every
 * read, the one path either way. A value the hub's key does not open reads
 * as null: no secret, so the feature that holds it asks for it again.
 */
const sealedText = customType<{ data: string | null; driverData: string }>({
  dataType: () => "text",
  toDriver: (value) => hubSecrets().seal(value ?? ""),
  fromDriver: (value) => openOrNull(value),
});

/** A secret JSON column: the value's JSON, sealed as {@link sealedText} is. */
const sealedJson = <T>(column: string) =>
  customType<{ data: T | null; driverData: string }>({
    dataType: () => "text",
    toDriver: (value) => hubSecrets().seal(JSON.stringify(value)),
    fromDriver: (value) => {
      const opened = openOrNull(value);
      return opened === null ? null : (JSON.parse(opened) as T);
    },
  })(column);

/**
 * One harness conversation a session had before the one it runs now
 * (`instance_conversations`): its key, the harness and account it ran on,
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
export const workflowRuns = sqliteTable(
  "workflow_runs",
  {
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
    /**
     * A stop under way: what the run ends as once its sessions
     * (`workflow_run_pending_ends`) and children are confirmed ended. Null
     * while it is not ending; it launches nothing more while it is.
     */
    endingStatus: text("ending_status").$type<
      "done" | "failed" | "cancelled"
    >(),
    endingFailure: text("ending_failure"),
    /** The program's value it ends with: opaque. */
    endingResult: text("ending_result", { mode: "json" }).$type<unknown>(),
    /**
     * A re-run from a step: every call before effect `rerunBefore` is
     * answered with what run `rerunFromRunId` got there.
     */
    rerunFromRunId: text("rerun_from_run_id").references(
      (): AnySQLiteColumn => workflowRuns.id,
      { onDelete: "set null" }
    ),
    rerunBefore: integer("rerun_before"),
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
  },
  (table) => [index("workflow_runs_parent").on(table.parentRunId)]
);

/** The sessions an ending run waits to see ended before it ends (`ending_status`). */
export const workflowRunPendingEnds = sqliteTable(
  "workflow_run_pending_ends",
  {
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.runId, table.instanceId] })]
);

/** A supervisor's notes for a run (`steer` note): the next step to start takes them, or the program with `w.notes()`. */
export const workflowRunNotes = sqliteTable(
  "workflow_run_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    at: timestamp("at").notNull(),
  },
  (table) => [index("workflow_run_notes_run").on(table.runId, table.id)]
);

/** A run's named state slots: each one's schema as the program declared it, and its value once set. */
export const workflowRunSlots = sqliteTable(
  "workflow_run_slots",
  {
    runId: text("run_id")
      .notNull()
      .references(() => workflowRuns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The JSON Schema it was declared with: opaque. */
    schema: text("schema", { mode: "json" }).$type<Record<string, unknown>>(),
    /** Its value as JSON, the program's: null while never set. */
    value: text("value"),
  },
  (table) => [primaryKey({ columns: [table.runId, table.name] })]
);
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
 * A step whose stop is held: its attempt is over (it timed out, or its
 * supervisor said fail or retry) and its session is not yet confirmed
 * ended, so nothing it decided runs until it is.
 */
export const workflowHeldStops = sqliteTable("workflow_held_stops", {
  stepId: text("step_id")
    .primaryKey()
    .references(() => workflowSteps.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  /** When the attempt was due, ms. */
  deadline: integer("deadline").notNull(),
  failure: text("failure").notNull(),
  /** What the supervisor decided, taking effect once the stop is confirmed. */
  action: text("action").$type<"fail" | "retry">(),
  /** Why its session could not be ended, last time it was asked. */
  error: text("error"),
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
  /**
   * The machine's home folder, absolute, as its daemon reported at register.
   * A place named under `~` on the machine is resolved against it before it
   * is stored (db `placePathOn`). Null until a daemon that says so registers.
   */
  home: text("home"),
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
   * What the machine came to the last time it converged on the fleet's MCP
   * servers and plugins (NEW.md §11). Null until it has been asked once.
   */
  fleet: text("fleet", { mode: "json" }).$type<FleetSyncReport>(),
  /**
   * The cawco the daemon is running (NEW.md §12), as it reported at register.
   * Null until a daemon that says so has registered once.
   */
  build: text("build", { mode: "json" }).$type<BuildInfo>(),
  /**
   * The owner paused the machine until this time (machine-pause.ts): the hub
   * starts nothing on it until then, its agent connected all the while. Null
   * when it is not paused; cleared as the time comes.
   */
  pausedUntil: timestamp("paused_until"),
  /**
   * How many of each kind of command the pause stopped as it began
   * (machine-pause.ts): the machine's row says it. Null when it stopped
   * nothing; cleared with the pause.
   */
  pauseStopped: text("pause_stopped", {
    mode: "json",
  }).$type<StoppedCommands>(),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A machine's last-known workflow-tool status ({@link ToolStatus}), one row
 * per catalog id (NEW.md §10): what the daemon reported at register or after
 * an install, or the `installing` the hub writes itself while one is in
 * flight.
 */
export const agentTools = sqliteTable(
  "agent_tools",
  {
    machineId: text("machine_id")
      .notNull()
      .references(() => agents.machineId, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    state: text("state").$type<ToolStatus["state"]>().notNull(),
    version: text("version"),
    method: text("method"),
    detail: text("detail"),
    /** When this was learnt. */
    at: timestamp("at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.toolId] })]
);

/**
 * What one harness adapter on a machine can do, one row per harness, as its
 * daemon last reported it: the report is the daemon's own, written and read
 * whole. Read in the order they were last reported (rowid).
 */
export const agentHarnesses = sqliteTable(
  "agent_harnesses",
  {
    machineId: text("machine_id")
      .notNull()
      .references(() => agents.machineId, { onDelete: "cascade" }),
    harness: text("harness").$type<HarnessReport["harness"]>().notNull(),
    report: text("report", { mode: "json" }).$type<HarnessReport>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.harness] })]
);

/**
 * A machine the person removed from the fleet (Remove machine), with the
 * name it last had and when it went. Rows that name it keep its id (a
 * session's `machineRemoved`, a rule's scope), and this is what reads of
 * them say it was. A register under its id takes it back off the list.
 */
export const removedMachines = sqliteTable("removed_machines", {
  machineId: text("machine_id").primaryKey(),
  hostname: text("hostname").notNull(),
  removedAt: timestamp("removed_at").notNull(),
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
  /** The harness Caw runs on: one whose every shell and edit call the hub's gate decides. */
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
   * Where its tasks' attempts run when the task file says nothing
   * (`runs_on:`, runs-on.ts): a machine, or a capability like `apple`.
   * Null: any machine with a checkout, as before there was a choice.
   */
  runsOn: text("runs_on"),
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
  /**
   * Its sessions run only on the accounts `project_accounts` lists, none
   * when it lists none (its last allowed account was removed); false: every
   * account.
   */
  accountsLimited: integer("accounts_limited", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * When the person answered a move's ask "Don't move" (moves.ts): a folder
   * that still needs that ask can't move, and the New session modal says so
   * instead of asking again. Null: never declined.
   */
  moveDeclinedAt: timestamp("move_declined_at"),
  /**
   * The stage template it was made from, or last had applied (stages.ts):
   * its starter skills are placed at every place of it (bundled-skills.ts).
   * Null: none.
   */
  template: text("template").$type<import("../stages").StagesTemplate>(),
  /**
   * Review before done: only you move a task into a done stage, and an
   * attempt that lands sends its task to review (stages.ts `ruledStages`).
   * Off: the lead and sessions close tasks as the project's stages allow.
   */
  review: integer("review", { mode: "boolean" }).notNull().default(false),
  /**
   * The Apple build gate (work-items.ts `appleGate`): an item whose diff
   * touches the app's sources lands only once the iOS build compiles at its
   * last commit on an apple-capable machine. Off: no item waits on a Mac.
   */
  appleGate: integer("apple_gate", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * Whether its sessions may post to repositories that are not its own
   * (core upstream-guard.ts): off keeps them off, and a write to another
   * repository does not run. Null: the fleet's answer
   * ({@link upstreamSettings}).
   */
  upstreamPosts: integer("upstream_posts", { mode: "boolean" }),
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
    /**
     * Whose start it is, as it was asked (work_items.origin): `you` for your
     * dashboard start or retry or your own move into the stage, `event` for
     * the dispatcher's or a routine's. It starts as that, so a start of yours
     * that waited is still yours (work_items.by_person). Null: its parent's.
     */
    origin: text("origin").$type<Origin>(),
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
    parent: text("parent"),
    /** The task it was found in: one of the canvas's edges (the others are `project_task_edges`). */
    foundIn: text("found_in"),
    /** The task it repeats (`duplicate_of`): a task waiting on it waits on that one instead. */
    duplicateOf: text("duplicate_of"),
    rank: text("rank"),
    /** The project folder files its work produces (`outputs:`): what the project's Made list draws, read whole. */
    outputs: text("outputs", { mode: "json" })
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

/** A task file's edge to another task: one it waits for (`after`), or one it is related to (`related`). */
export type TaskEdgeKind = "after" | "related";

/**
 * A task's edges to other tasks (`after:`, `related:`), one row each, in the
 * order its file lists them (rowid). Rebuilt with its task's index row; the
 * other task is named by id, not keyed, since a file may name a task that
 * has no file.
 */
export const projectTaskEdges = sqliteTable(
  "project_task_edges",
  {
    projectId: text("project_id").notNull(),
    /** The task's file: its index row's key with `projectId`. */
    path: text("path").notNull(),
    kind: text("kind").$type<TaskEdgeKind>().notNull(),
    /** `tsk-…`. */
    otherId: text("other_id").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.path, table.kind, table.otherId],
    }),
    foreignKey({
      columns: [table.projectId, table.path],
      foreignColumns: [projectTasks.projectId, projectTasks.path],
    }).onDelete("cascade"),
    // Who waits for a task, who is related to it.
    index("project_task_edges_other").on(
      table.projectId,
      table.kind,
      table.otherId
    ),
  ]
);

/** A task's labels, one row each, in the order its file lists them (rowid). */
export const projectTaskLabels = sqliteTable(
  "project_task_labels",
  {
    projectId: text("project_id").notNull(),
    path: text("path").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.path, table.label] }),
    foreignKey({
      columns: [table.projectId, table.path],
      foreignColumns: [projectTasks.projectId, projectTasks.path],
    }).onDelete("cascade"),
    index("project_task_labels_label").on(table.projectId, table.label),
  ]
);

/**
 * The front matter fields a task file does not know that hold one scalar
 * (`priority`, `due`), as written, one row each: what lists filter and sort on.
 */
export const projectTaskFields = sqliteTable(
  "project_task_fields",
  {
    projectId: text("project_id").notNull(),
    path: text("path").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.path, table.key] }),
    foreignKey({
      columns: [table.projectId, table.path],
      foreignColumns: [projectTasks.projectId, projectTasks.path],
    }).onDelete("cascade"),
    index("project_task_fields_value").on(
      table.projectId,
      table.key,
      table.value
    ),
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

/** A project's folder on the hub, relative to the hub's data (db `hubPlacePath`). */
export type HubFolder = `projects/${string}`;

/**
 * Where a place is: a folder on its machine, or (kind `hub`) the project's
 * folder on the hub. A plain string on the wire, as both sides are; a union
 * left unnamed reaches the API's schema as an anyOf its clients wrap.
 * @TJS-type string
 */
export type PlacePath = MachinePath | HubFolder;

/** The accounts a project limited to some (`projects.accounts_limited`) lets its sessions run on. */
export const projectAccounts = sqliteTable(
  "project_accounts",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.accountId] })]
);

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
    /** Absolute on its machine; the hub's own folder (kind `hub`) is relative to the hub's data. */
    path: text("path").$type<PlacePath>().notNull(),
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
 * workspace of the project from there. A landing gate step on the machine
 * (the iOS build) cuts its gate workspace from it (work-items.ts
 * `gateWorkspace`). It outlives
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
    path: text("path").$type<MachinePath>().notNull(),
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
   * The session that started this one (`delegate`, `start_session`, a
   * workflow's supervisor): nested under it in every rail. Null on a session
   * a person started. Whether it is delegated work is {@link workItemId}'s.
   */
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
  cwd: text("cwd").$type<MachinePath>().notNull(),
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
   * When the session's latest turn ended, on the hub's clock: the moment
   * the hub took the turn's `result` (server.ts, the `endedAt` a turn's push
   * waits from). Read against `seenAt`, also the hub's, it decides "ended
   * since the owner last looked" on every device without reading a device's
   * or a machine's clock. Null on one whose turn never ended.
   */
  turnEndedAt: timestamp("turn_ended_at"),
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
   * sends no effort. Null until the first reading. What the session runs at,
   * shown on its chip; never what a launch asks for ({@link chosenEffort}).
   */
  effort: text("effort").$type<SessionEffort>(),
  /**
   * The effort the operator chose for the session: the level its spawn named,
   * or the last `set-effort` sent it. Every launch of the session asks for it
   * (`bounded`), whatever brings it back. Null: nobody chose, and its launches
   * name none, so the harness runs its model's default. Only a choice writes
   * it, never a reading.
   */
  chosenEffort: text("chosen_effort").$type<EffortLevel>(),
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
      | "stopping"
      | "stopped"
      | "discarded"
      | "unknown"
      | "error"
    >()
    .notNull()
    .default("starting"),
  /** Why the session died, for a dashboard that was not watching when it did. */
  lastError: text("last_error"),
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

/**
 * A workspace's life, which is its work items' (work-items.ts `settle`):
 * `active` while an item there is live, or ended a moment ago and the hub
 * has not settled it, or while something holds it (a session attached, an
 * artifact showing what it serves); `held` once its item ended with work
 * that is nowhere else, which only the person ends, by continuing it or
 * discarding it; `archived` once its boundary and clone are gone.
 */
export type WorkspaceState = "active" | "held" | "archived";

/** Unfiled creates owned by the hub until filed, or acknowledged discarded by their machine. */
export const workspaceCreates = sqliteTable("workspace_creates", {
  id: text("id").primaryKey(),
  machineId: text("machine_id").notNull(),
});

/**
 * Where delegated work lives: one clone of its own on its own branch, on one
 * machine, with the boundary every shell command of its work items runs
 * inside. A workspace has at most one work item in `starting`/`running` at a
 * time — the one writer its checkout ever has — and it owns the checkout:
 * stopping or discarding a session never removes it; archiving does, which
 * the hub does itself once the work lands ({@link WorkspaceState}).
 */
export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  machineId: text("machine_id").notNull(),
  /** The repository the clone was cut from. */
  repoRoot: text("repo_root").$type<MachinePath>().notNull(),
  /** The clone's root, where every work item of the workspace runs. */
  path: text("path").$type<MachinePath>().notNull(),
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
   * The workspace whose landing gate step this one runs on a machine other
   * than that one's (the iOS build on a Mac): a gate workspace, cut there the
   * first time one of its items' gates needs the machine, and archived with
   * it. Null for a delegate's.
   */
  checksFor: text("checks_for"),
  /**
   * What its clone held that is nowhere else when it was filed `held`, as
   * its machine read it once its boundary was closed; null in any other
   * state.
   */
  holding: text("holding", { mode: "json" }).$type<WorkspaceHolding>(),
  /** When {@link workspaces.holding} was read. */
  heldAt: timestamp("held_at"),
  /**
   * The commit its last item landed, on `origin`'s branch that holds it: a
   * retired workspace is cut again there for its delegate to go on. Null
   * until an item lands a commit.
   */
  landed: text("landed", { mode: "json" }).$type<WorkspaceCut>(),
  /**
   * The carry its discard wrote on its machine, the person letting its
   * unlanded work go: such a workspace is never cut again.
   */
  carry: text("carry"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Who began a piece of work, or a turn of Caw's: `you`, the person's own
 * words; `event`, anything else (WORDS.md, Caw on / Caw off).
 */
export type Origin = "you" | "event";

/**
 * A work item's origin: an {@link Origin}, or `kept`, Caw's own work (an
 * event's) you chose to let finish when you turned him off. Kept work runs
 * to its end, past an account's limit, and its report is noted in his thread
 * without waking him while he is off.
 */
export type WorkOrigin = Origin | "kept";

/** A work item's life. Only `starting` and `running` take messages. */
export type WorkItemState =
  "starting" | "running" | "done" | "failed" | "cancelled";

/** What a delegate hands in with `finish_item`. */
export interface WorkItemSubmission {
  blocked?: { command: string; error: string };
  findings?: { title: string; detail: string }[];
  /** The outcome in one or two sentences, shown whole wherever a report is glanced at. */
  headline: string;
  /** The full report: what was done, and the real output of every command that proves it. */
  summary: string;
}

/**
 * One piece of delegated work: a brief, run by one session in one workspace,
 * ending in a report. A follow-up is a new item in the same workspace, run by
 * the same session; the reader or the parent can also reopen finished work.
 * It is `done` only when its session called `finish_item` and its work
 * passed the hub's landing gate (work-items.ts `gateSteps`) and landed.
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
     * Whose work it is (WORDS.md, Caw on / Caw off): `you` when it began with
     * the person's words, whoever carries it out (a session's ask, an attempt
     * you start, what Caw starts in a turn your words are in); `event` when it
     * began with an event (the dispatcher, a routine, what Caw starts in a turn
     * an event woke); `kept` once you let Caw's `event` work finish as you
     * turned him off. A delegate's own delegates take its origin. Caw being
     * off stops only `event` work and its reports (work-items `reportees`,
     * caw-own.ts).
     */
    origin: text("origin").$type<WorkOrigin>().notNull().default("you"),
    /**
     * A person started it himself: an attempt at a task he started or
     * retried from the dashboard, or that his own move into a `runs:` stage
     * started (dispatch.ts). Only such an attempt's failure reaches his
     * phone (push.ts); any other's is its starter's business.
     */
    byPerson: integer("by_person", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * Who stopped it, for an item that ended `cancelled` (core `EndedBy`): a
     * person, a session (its parent's or a lead's `stop_delegate`), the hub
     * (`why`), or a signal from outside. Null for any other end, and for a
     * cancel whose stopper the hub did not hear.
     */
    stoppedBy: text("stopped_by", { mode: "json" }).$type<EndedBy>(),
    /**
     * Where its commits go once it passes the landing gate (landing.ts): onto the
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
     * What its session handed in on its task (`task_result`): its words,
     * what to check, and its artifacts. A later call replaces it. Null:
     * none yet, or the item is no task's attempt.
     */
    taskResult: text("task_result", { mode: "json" }).$type<AttemptResult>(),
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
     * When the hub began landing it for a `finish_item` (its landing gate,
     * then the push), while that runs. Set, the item is landing: a hub that
     * starts finds it here and runs the landing again from the first, on
     * {@link submission}.
     */
    landingSince: timestamp("landing_since"),
    /** A declared wait on work the delegate started; the hub wakes it at this time. */
    waitUntil: timestamp("wait_until"),
    waitReason: text("wait_reason"),
    /** Deadline plus grace while awaiting the harness's next turn read. */
    waitResumeBy: timestamp("wait_resume_by"),
    /**
     * When an interrupt stopped its turn, while that holds it: nothing the
     * hub sends on its own (a quiet turn's reminder, a wait's end, a landing
     * gate's outcome, a rule's reply, another session's report) wakes it until its
     * parent, its project's lead or the reader sends it something.
     */
    heldAt: timestamp("held_at"),
    /** Routine waits since the last message handed to the parent. */
    waitHistory: text("wait_history", { mode: "json" }).$type<{
      count: number;
      until: number;
      reason: string;
    }>(),
    /** The `finish_item` the running landing answers, kept while it runs. */
    submission: text("submission", {
      mode: "json",
    }).$type<WorkItemSubmission>(),
    /**
     * The final report: the session's summary, the landing gate's lines, the
     * landing, commits and findings, as the hub built them when it landed.
     */
    result: text("result"),
    /**
     * Its session's own words for what it did: the `summary` of the
     * `finish_item` that landed, its full report. Null until then.
     */
    summary: text("summary"),
    /**
     * That `finish_item`'s `headline`: its outcome in one or two sentences,
     * what a glance at its report shows (the delegate tree, a routine's
     * thread note). A routine's run reads its output contract here. Null
     * until then.
     */
    headline: text("headline"),
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
     * Why a failed item is no longer owed, in the reader's words, when they
     * dismissed it with a reason. Null otherwise.
     */
    dismissReason: text("dismiss_reason"),
    /**
     * The later item of the same tray that took over a failed one's work,
     * when the reader dismissed it as replaced by that one. Null otherwise.
     */
    replacedBy: text("replaced_by"),
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
  /** The id its item takes when it starts (`queuedAs.id`). */
  id: text("id").primaryKey(),
  parentInstanceId: text("parent_instance_id").notNull(),
  /**
   * The request as `delegate` made it (work-items.ts `WorkItemRequest`),
   * read whole; what the queue reads of it is its own columns: the task it
   * starts, the session id it stands under, the globs it owns.
   */
  request: text("request", { mode: "json" }).$type<unknown>().notNull(),
  /** The project of the task it starts (`task.projectId`); null for no task. */
  projectId: text("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  /** The task it starts (`task.id`), `tsk-…`. */
  taskId: text("task_id"),
  /** The session id it stands under while it waits (`queuedAs.instanceId`): minted, no row yet. */
  queuedInstanceId: text("queued_instance_id").notNull(),
  title: text("title").notNull(),
  queuedAt: timestamp("queued_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Globs of the repository's files a work item owns, one row each: the hub
 * never runs two live items whose globs overlap in one repository
 * (work-items.ts `globsOverlap`). None: it claims nothing.
 */
export const workItemGlobs = sqliteTable(
  "work_item_globs",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    glob: text("glob").notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.glob] })]
);

/** The globs a queued delegate's request owns (`owns`), one row each: what holds it back. */
export const queuedWorkItemGlobs = sqliteTable(
  "queued_work_item_globs",
  {
    queuedId: text("queued_id")
      .notNull()
      .references(() => queuedWorkItems.id, { onDelete: "cascade" }),
    glob: text("glob").notNull(),
  },
  (table) => [primaryKey({ columns: [table.queuedId, table.glob] })]
);

/**
 * What a delegate and its parent said to each other through the hub: every ask
 * routed up, every answer back, every turn's report. The messages themselves
 * are the harnesses' copies; this is the hub's own record, so a reader that was
 * not watching does not have to reconstruct the exchange out of transcript text.
 */
export const delegateEvents = sqliteTable(
  "delegate_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** The delegate the traffic is about — never the parent, on any of the kinds. */
    instanceId: text("instance_id").notNull(),
    parentInstanceId: text("parent_instance_id").notNull(),
    kind: text("kind").$type<DelegateEventKind>().notNull(),
    /** The permission request an ask and its answer share. Null on a report. */
    requestId: text("request_id"),
    toolName: text("tool_name"),
    requestKind: text("request_kind").$type<"question" | "tool">(),
    /**
     * What the kind carries, read whole: an ask's input, an answer, a
     * report's body; a report's turn identity is its own columns.
     */
    payload: text("payload", { mode: "json" })
      .$type<DelegateEventPayload>()
      .notNull(),
    /** A report's harness result id: the turn it reports (`completed_turns`). */
    resultId: text("result_id"),
    /** A report's turn's completion time, ISO, when its harness said it. */
    completedAt: text("completed_at"),
    /** An ask's own state; null on an answer and a report, which settle nothing. */
    status: text("status").$type<DelegateAskStatus>(),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("delegate_events_report").on(
      table.instanceId,
      table.kind,
      table.resultId
    ),
  ]
);

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
  /** Sealed: a server's headers and env carry its keys. Null when the hub's key does not open it. */
  config: sealedJson<FleetMcpConfig>("config").notNull(),
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
  /**
   * The machine platforms it runs on (`FleetMcpServer.platforms`): a machine
   * of any other is never sent it. Null: every machine.
   */
  platforms: text("platforms", { mode: "json" }).$type<McpPlatform[]>(),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * Private OAuth material. Only the hub's OAuth manager reads these rows. The
 * clients (which may hold a client secret), the tokens and a sign-in under
 * way (its PKCE verifier) are sealed; the discovered metadata is public.
 */
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
  client: sealedJson<OAuthClientInformationFull>("client"),
  tokens: sealedJson<OAuthTokens>("tokens"),
  expiresAt: timestamp("expires_at"),
  /** The client the stored tokens were issued to; refreshing them must use that one. */
  tokenClient: sealedJson<OAuthClientInformationFull>("token_client"),
  pending: sealedJson<{
    /** The client this sign-in started with, which is the one its code is exchanged by. */
    client: OAuthClientInformationFull;
    redirectUri: string;
    verifier: string;
    state: string;
    expiresAt: number;
  }>("pending"),
  lastOpenedAt: timestamp("last_opened_at"),
});

/**
 * Each session the hub's fleet MCP relay opened (fleet-mcp-relay.ts), by the
 * `Mcp-Session-Id` it handed the session: the `initialize` params the
 * session announced itself with (its capabilities, clientInfo and protocol
 * version). A session that outlives a hub restart opens its upstream session
 * with them, exactly as it first did. Gone when the session closes, when its
 * server is removed, and once unused for 30 days (fleet-mcp-relay.ts
 * `SESSION_TTL_MS`).
 */
export const fleetMcpSessions = sqliteTable(
  "fleet_mcp_sessions",
  {
    id: text("id").primaryKey(),
    server: text("server").notNull(),
    init: text("init", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    usedAt: timestamp("used_at").notNull(),
  },
  (table) => [index("fleet_mcp_sessions_used").on(table.usedAt)]
);

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
  /**
   * The role of the sessions it is loaded into (core fleet.ts
   * `MemoryScope`), `orchestrator` or `leaf`; its projects are
   * {@link fleetMemoryDocProjects}. Neither is a linked document under
   * `~/.claude/memories/`, read on purpose.
   */
  role: text("role").$type<MemoryRole>(),
  /**
   * Part of a model id: the sessions whose model contains it, in any case
   * (`MemoryScope.model`). Null for any model.
   */
  model: text("model"),
  /**
   * Guidance for writing a brief (`MemoryScope.briefer`): it reaches the
   * session that calls `delegate`, and its delegate types and model name
   * the delegates it is about.
   */
  briefer: integer("briefer", { mode: "boolean" }).notNull().default(false),
  updatedAt: timestamp("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * The delegate types a fleet memory document is scoped to, one row each
 * (`MemoryScope.delegateTypes`): the sessions started as one of them, or,
 * on a briefer's, the delegates it is about. By name, as a session's row
 * keeps its type.
 */
export const fleetMemoryDocTypes = sqliteTable(
  "fleet_memory_doc_types",
  {
    path: text("path")
      .notNull()
      .references(() => fleetMemoryDocs.path, { onDelete: "cascade" }),
    typeName: text("type_name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.path, table.typeName] })]
);

/**
 * The briefer documents a session has been handed (hub briefings.ts), each
 * at the hash it read: its next `delegate` call that one is about goes out
 * without it. A compaction of the session clears its rows, so the next such
 * call hands it again; an edit to the document hands the new text.
 */
export const memoryBriefings = sqliteTable(
  "memory_briefings",
  {
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    path: text("path")
      .notNull()
      .references(() => fleetMemoryDocs.path, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    handedAt: timestamp("handed_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.path] })]
);

/**
 * The projects a fleet memory document is scoped to, one row each: the
 * sessions in their checkouts and workspaces load it. A document whose last
 * project goes, goes with it (db `deleteProject`), never widening to every
 * session.
 */
export const fleetMemoryDocProjects = sqliteTable(
  "fleet_memory_doc_projects",
  {
    path: text("path")
      .notNull()
      .references(() => fleetMemoryDocs.path, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.path, table.projectId] })]
);

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
export const accounts = sqliteTable(
  "accounts",
  {
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
    /**
     * The identity (core `AccountIdentity`) its first sign-in reported: the
     * email, any case, and the organization. Both null until then. One
     * identity is one account of a provider (core `sameIdentity`).
     */
    email: text("email"),
    organization: text("organization"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("accounts_identity").on(
      table.provider,
      sql`lower(${table.email})`,
      table.organization
    ),
  ]
);

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
    /** Why the hub signed it out itself: the refusal a session on it met (`AccountSignin.reason`); null otherwise. */
    reason: text("reason"),
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
    /** The identity the credential is signed in as (core `AccountIdentity`). */
    email: text("email").notNull(),
    organization: text("organization").notNull(),
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
  /** How the person's own sessions are placed ({@link StrategyChoice}). */
  yoursStrategy: text("yours_strategy")
    .$type<StrategyChoice["strategy"]>()
    .notNull(),
  /** The account `pinned` names for them; null once it is removed, when the first by order stands in. */
  yoursPinned: text("yours_pinned").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /** How delegates are placed. */
  delegatesStrategy: text("delegates_strategy")
    .$type<StrategyChoice["strategy"]>()
    .notNull(),
  delegatesPinned: text("delegates_pinned").references(() => accounts.id, {
    onDelete: "set null",
  }),
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
  subscription: text("subscription"),
  overage: text("overage", { mode: "json" }).$type<AccountOverage>(),
  lastSeenAt: timestamp("last_seen_at").notNull(),
});

/**
 * One limit window of an account's reading ({@link LimitWindow}), keyed by
 * its kind and the model scope it limits ("" for none). A report replaces
 * the windows it names and keeps the rest; read in the order they were last
 * reported (rowid).
 */
export const accountWindows = sqliteTable(
  "account_windows",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accountReadings.accountId, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    /** The window's `scopeLabel`, "" for none. */
    scopeLabel: text("scope_label").notNull().default(""),
    group: text("group").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull(),
    percent: real("percent").notNull(),
    severity: text("severity").notNull(),
    /** ISO. */
    resetsAt: text("resets_at"),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.kind, table.scopeLabel] }),
  ]
);

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
  readAt: timestamp("read_at").notNull(),
});

/** The effort a model ran at on an account when a session asked for none, one row per model; kept as the catalog is read again. */
export const accountModelEfforts = sqliteTable(
  "account_model_efforts",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accountCatalogs.accountId, { onDelete: "cascade" }),
    model: text("model").notNull(),
    effort: text("effort").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.model] })]
);

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
  /**
   * The hub's word to the session's live work item its limit refused, sent
   * again once at `until`; such a hold never moves the session (core
   * `DelegateWork` `resume`). Null for a hold that moves it once an account
   * has room.
   */
  nudge: text("nudge"),
  until: timestamp("until"),
  createdAt: timestamp("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/**
 * A session moved at its account's limit that compacts once there (core
 * `AccountMove` `moved` with `compact`), from the move until its compaction
 * has ended (server.ts `compactions`): its filing turn (`filing`, the send
 * `filingUuid`), then Claude Code's `/compact` (`compacting`, the send
 * `compactUuid`). Everything else sent to it waits at the hub meanwhile. Kept
 * here so a hub restart carries it on from where its sends stand.
 */
export const limitCompactions = sqliteTable("limit_compactions", {
  instanceId: text("instance_id").primaryKey(),
  stage: text("stage").$type<"filing" | "compacting">().notNull(),
  /** The `limit_events` id of the move's line, said again as the compaction goes. */
  lineId: text("line_id").notNull(),
  /** The move's line as written, which each stage restates. */
  move: text("move", { mode: "json" }).$type<AccountMove>().notNull(),
  filingUuid: text("filing_uuid").notNull(),
  compactUuid: text("compact_uuid").notNull(),
  /** Claude Code said its compaction boundary after the `/compact` went: it compacted. */
  compacted: integer("compacted", { mode: "boolean" }).notNull().default(false),
  createdAt: timestamp("created_at")
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
  reply: text("reply").notNull(),
  /** `turn` wakes an idle session, `message` queues, `immediate` sends mid-stream. */
  timing: text("timing").$type<RuleTiming>().notNull().default("turn"),
  /**
   * On, the rule fires again on every later match (up to the ceiling). Off, it
   * fires once per session and goes quiet.
   */
  repeat: integer("repeat", { mode: "boolean" }).notNull().default(true),
  /**
   * Optional narrowing ({@link RuleScope}), each null for everywhere: the
   * machine it fires on. Not a foreign key: a machine that re-joins under a
   * new id takes its rules along (db `rekeyMachine`), and one removed for good
   * keeps them, read as orphaned (`removed_machines`).
   */
  scopeMachineId: text("scope_machine_id"),
  /**
   * The project it fires in. The rule goes with its project, never widened
   * to every project, and follows it into the project a merge folds it into.
   */
  scopeProjectId: text("scope_project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  /** The harness it fires on. */
  scopeHarness:
    text("scope_harness").$type<NonNullable<RuleScope["harness"]>>(),
  /** A model name it fires on, matched as a substring in any case. */
  scopeModel: text("scope_model"),
  /** The role of the sessions it fires on: `orchestrator` or `leaf` (roles.ts `memoryRoleOf`). */
  scopeRole: text("scope_role").$type<NonNullable<RuleScope["role"]>>(),
  /** The delegate type the sessions it fires on were started as, by name. */
  scopeDelegateType: text("scope_delegate_type"),
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
 * A deleted rule, kept whole for its undo window (rules-trash.ts): the rule
 * and every session's standing with it, as they stood. Out of `rules` and
 * `rule_state`, so nothing that reads them sees it while it waits. It goes
 * with its project, as the rule itself does.
 */
export const ruleTrash = sqliteTable("rule_trash", {
  ruleId: text("rule_id").primaryKey(),
  scopeProjectId: text("scope_project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  rule: text("rule", { mode: "json" }).$type<Rule>().notNull(),
  states: text("states", { mode: "json" }).$type<RuleState[]>().notNull(),
  deletedAt: timestamp("deleted_at").notNull(),
});

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

/**
 * The fleet's choices — one row, keyed `'supervisor'`, following the
 * `fleetMemory` / `MEMORY_ID` single-row precedent. The table and its key
 * keep the name of the LLM supervisor whose settings it first held; fleet
 * watch replaced that supervisor, and these columns are what stayed.
 */
export const supervisorConfig = sqliteTable("supervisor_config", {
  /** Always `'supervisor'`: the hub has one, and a table with a key says so cheaply. */
  id: text("id").primaryKey(),
  /**
   * Whether the fleet's tool denials (`fleet_denied_tools`) are set. False
   * only before the seeding migration or a fresh hub's first choice, when
   * every daemon falls back to its compiled list; once set, the rows are the
   * list, possibly none when the operator has removed all denials.
   */
  deniedSeeded: integer("denied_seeded", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The fleet's "CawCo's to-dos" choice (§5.2): every session is denied its
   * harness's own list and plan mode, added at spawn (`cawcoTodosDenied`),
   * never stored in `fleet_denied_tools`.
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
 * Fleet-wide tool denials, one row per tool name, in the order they were
 * added (rowid). Every spawned session and every `~/.claude/settings.json`
 * convergence reads them, once `supervisor_config.denied_seeded` says they
 * are set.
 */
export const fleetDeniedTools = sqliteTable("fleet_denied_tools", {
  tool: text("tool").primaryKey(),
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
 * The fleet's session limits (core `SessionLimits`) — one row, keyed
 * `'session'`, following the {@link spendSettings} precedent: the memory and
 * CPU each session's process may use, as a percent of its machine's RAM and
 * cores. Null is no limit, and no row reads as none.
 */
export const sessionLimits = sqliteTable("session_limits", {
  /** Always `'session'`. */
  id: text("id").primaryKey(),
  memoryPercent: integer("memory_percent"),
  cpuPercent: integer("cpu_percent"),
});

/**
 * Fleet watch's switch (fleet-watch.ts) — one row, keyed `'fleet-watch'`,
 * following the {@link spendSettings} precedent. No row reads as on: it
 * replaced the supervisor, and with nothing open it spends nothing.
 */
export const fleetWatchSettings = sqliteTable("fleet_watch_settings", {
  /** Always `'fleet-watch'`. */
  id: text("id").primaryKey(),
  on: integer("on", { mode: "boolean" }).notNull().default(true),
});

/**
 * The fleet's upstream choice (core upstream-guard.ts), asked once in
 * onboarding — one row, keyed `'upstream'`, following the
 * {@link spendSettings} precedent: whether sessions may post to repositories
 * that are not their project's, where the project sets nothing. No row, or a
 * null `posts`, is never answered: sessions may, and the dashboard asks.
 */
export const upstreamSettings = sqliteTable("upstream_settings", {
  /** Always `'upstream'`. */
  id: text("id").primaryKey(),
  posts: integer("posts", { mode: "boolean" }),
  answeredAt: timestamp("answered_at"),
});

/**
 * Fleet watch's needs-you notices (core `FleetWatchNotice`): a triage told
 * you, or a session in a project whose Caw is off showed two signals. One
 * per session; gone when you act on the session or it moves on.
 */
export const fleetWatchNotices = sqliteTable("fleet_watch_notices", {
  instanceId: text("instance_id").primaryKey(),
  id: text("id").notNull(),
  machineId: text("machine_id").notNull(),
  projectId: text("project_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  at: timestamp("at").notNull(),
});

/**
 * The fleet's OpenRouter connection — one row, keyed `'openrouter'`, following
 * the {@link supervisorConfig} single-row precedent. Written by the Settings
 * page's OAuth PKCE exchange; the key never leaves the hub. No row means not
 * connected: Jev's OpenRouter route is off (jev.ts `jevAccess`).
 */
export const openrouterConnection = sqliteTable("openrouter_connection", {
  /** Always `'openrouter'`. */
  id: text("id").primaryKey(),
  /** Sealed; null when the hub's key does not open it, which reads as not connected. */
  apiKey: sealedText("api_key").notNull(),
  connectedAt: timestamp("connected_at").notNull(),
});

/**
 * Jev's own settings — one row, keyed `'jev'`, following the
 * {@link supervisorConfig} single-row precedent: the TypeSafe key the hub
 * reaches Jev with directly (jev.ts `jevAccess`), and the composer's
 * suggestions switch, which holds on either route. No row reads as no key
 * and suggestions off.
 */
export const jevSettings = sqliteTable("jev_settings", {
  /** Always `'jev'`. */
  id: text("id").primaryKey(),
  /**
   * Sealed. Set from the owner's terminal (`cawco jev set-key`) or Settings,
   * never through a session; null while none is held, or when the hub's key
   * does not open it, which reads as none.
   */
  typesafeKey: sealedText("typesafe_key"),
  typesafeKeySetAt: timestamp("typesafe_key_set_at"),
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
  /** The source's Open items section (open-items.ts), read from its records once before the opening goes. */
  openItems: text("open_items"),
  stage: text("stage").$type<ContinuationJob["stage"]>().notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * What kind of line the hub keeps in a session's transcript:
 * - `limit`: a limit its keeper held it to (core `LIMIT_REACHED`), the line
 *   its machine said;
 * - `outdated`: its process runs a Claude Code other than its machine's
 *   (core `CLI_OUTDATED`), the line its machine said;
 * - `watch`: what fleet watch did about it, or for it as the lead (core
 *   `FLEET_WATCH`), the line with the triage's reason under it;
 * - `moved`: it started on a machine its project was moved to for it (core
 *   `MOVED_HERE`), the move's ready line: what moved and what stayed. Its
 *   transcript opens on it; one per session.
 */
export type SessionLineKind = "limit" | "outdated" | "watch" | "moved";

/** The lines a session's machine says about it, which the hub keeps as said. */
export type MachineLineKind = Extract<SessionLineKind, "limit" | "outdated">;

/**
 * Lines the hub writes into a session's transcript, each where it happened,
 * one row each: when, and what it says. `limit` and `watch` keep their last
 * few (db `LIMIT_NOTES_KEPT`, `WATCH_LINES_KEPT`), in the order written
 * (rowid).
 */
export const sessionLines = sqliteTable(
  "session_lines",
  {
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SessionLineKind>().notNull(),
    /** The line's own id; `moved` for a session's one move line. */
    id: text("id").notNull(),
    at: timestamp("at").notNull(),
    /** The line; a move's: what moved. */
    content: text("content").notNull(),
    /** A move's: what stayed. */
    stayed: text("stayed"),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.kind, table.id] })]
);

/**
 * The harness conversations a session had before the one it runs now
 * (`instances.session_id`), oldest first (`ord`): each time it went on from
 * a summary in a fresh conversation (at its account's limit, or because it
 * asked), the one it left. Its transcript reads them in order, then the
 * current one, each on the machine it runs on, in the account dir it ran in
 * there. None on a session that never continued.
 */
export const instanceConversations = sqliteTable(
  "instance_conversations",
  {
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    /** Its place, oldest first. */
    ord: integer("ord").notNull(),
    sessionId: text("session_id").notNull(),
    harness: text("harness").notNull(),
    model: text("model"),
    /** The account it ran on; null once that account is removed. */
    accountId: text("account_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    endedAt: timestamp("ended_at").notNull(),
    /**
     * The hub's line drawn right after it in the transcript: the
     * `continued` line of the move that left it. Null for a conversation
     * folded in with no line of its own, or once the line is gone.
     */
    nextEventId: text("next_event_id").references(() => limitEvents.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.ord] }),
    uniqueIndex("instance_conversations_next").on(table.nextEventId),
    index("instance_conversations_session").on(table.sessionId),
  ]
);

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
export const moves = sqliteTable(
  "moves",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    stage: text("stage").$type<MoveStage>().notNull(),
    /**
     * Everything the job has learned and decided, as moves.ts keeps it, read
     * and written whole, but the machines it names, which are its columns.
     */
    state: text("state", { mode: "json" })
      .$type<
        Omit<MoveState, "sourceMachineId" | "targetMachineId" | "stopOn">
      >()
      .notNull(),
    /** The machine the project moves from (`MoveState.sourceMachineId`). */
    sourceMachineId: text("source_machine_id").notNull(),
    /** The machine it moves to (`MoveState.targetMachineId`). */
    targetMachineId: text("target_machine_id").notNull(),
    /** A Cancel the machine running its step has not heard yet: told at its register. */
    stopOn: text("stop_on"),
    /** The request as asked: the target and the spawn New session sent. */
    request: text("request", { mode: "json" }).$type<MoveRequest>().notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("moves_machines").on(table.targetMachineId, table.sourceMachineId),
    index("moves_stop_on").on(table.stopOn),
  ]
);

/**
 * Phones (and iPads, Macs) the iOS app registered for pushes (push.ts). Keyed
 * by the pairing the app enrolled with Cawrier, the relay that holds the APNs
 * key; the hub pushes through it with the pairing's secret. A pairing Cawrier
 * no longer knows (401) or whose device is gone (410) is deleted.
 */
export const pushDevices = sqliteTable("push_devices", {
  /** The pairing's id at Cawrier, a lowercase v4 uuid. */
  pairingId: text("pairing_id").primaryKey(),
  /**
   * The pairing's secret, base64url, sealed; sent to Cawrier only, never
   * answered by a route. A row whose secret or key does not open is no
   * device until the app registers again (it does on every launch).
   */
  secret: sealedText("secret").notNull(),
  /**
   * The device's push key: 32 random bytes from the device, standard base64,
   * sealed. Each push's real words are sealed under it (AES-256-GCM) so only
   * the device reads them. Never logged, never answered by a route, never sent.
   */
  key: sealedText("key").notNull(),
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
 * Whether the hub requires paired devices (hub-auth.ts) — one row, keyed
 * `'pairing'`, following the {@link spendSettings} precedent. No row reads as
 * off: the hub trusts its network until the person turns it on.
 */
export const pairingSettings = sqliteTable("pairing_settings", {
  /** Always `'pairing'`. */
  id: text("id").primaryKey(),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  changedAt: timestamp("changed_at").notNull(),
});

/**
 * The person's paired devices (hub-auth.ts): a browser on one origin, the
 * app, each keyed by the sha256 of its token. The token itself went to the
 * device once and is kept nowhere here (OWASP Session Management: "store a
 * one-way verifier instead"). Emptied when pairing is turned off.
 */
export const ownerDevices = sqliteTable("owner_devices", {
  id: text("id").primaryKey(),
  /** sha256 of the device's token, hex. */
  tokenHash: text("token_hash").notNull().unique(),
  /** "Chrome on Linux", "CawCo on iPhone". */
  name: text("name").notNull(),
  kind: text("kind").$type<"browser" | "app" | "cli">().notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  /** The address it was last seen at. */
  lastAddress: text("last_address"),
});

/**
 * The key each machine the person admitted proves itself with (hub-auth.ts),
 * sealed: the machine answers a nonce with it at every connection, so the
 * hub needs the key itself, never a hash. Emptied when pairing is turned off.
 */
export const machineKeys = sqliteTable("machine_keys", {
  machineId: text("machine_id").primaryKey(),
  key: sealedText("key").notNull(),
  admittedAt: timestamp("admitted_at").notNull(),
});

/**
 * Notifications a device or Telegram was shown and nobody has cleared yet
 * (notifications.ts), by collapse id: a look or a settle clears only what
 * was sent, so looking at a session no notification named sends nothing.
 * Pruned after three days.
 */
export const notificationSent = sqliteTable("notification_sent", {
  collapseId: text("collapse_id").primaryKey(),
  sentAt: timestamp("sent_at").notNull(),
});

/**
 * Notifications cleared, by collapse id (notifications.ts): an ask settled,
 * its session looked at, or a device acted on, opened or dismissed it.
 * Every device reads them to take the notification down (a visible push's
 * `cawco.cleared`, a background push, `/api/notifications/cleared` at launch),
 * so they outlive a restart. Pruned after three days.
 */
export const notificationCleared = sqliteTable(
  "notification_cleared",
  {
    collapseId: text("collapse_id").primaryKey(),
    clearedAt: timestamp("cleared_at").notNull(),
  },
  (table) => [index("notification_cleared_at").on(table.clearedAt)]
);

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
 * Caw asking first to build a design system (design-offers.ts): one row per
 * project, written when he asks, so he asks once. `answer` stays null while
 * the card stands; `dismissed` (Not now) means he never asks again unless
 * the person does.
 */
export const designOffers = sqliteTable("design_offers", {
  projectId: text("project_id").primaryKey(),
  /** The task whose move into an active stage raised it. */
  taskId: text("task_id").notNull(),
  /** The thread the card went to. */
  threadId: text("thread_id").notNull(),
  offeredAt: timestamp("offered_at").notNull(),
  answer: text("answer").$type<"built" | "dismissed">(),
  answeredAt: timestamp("answered_at"),
  /** The "Build the design system" task Build filed. */
  builtTaskId: text("built_task_id"),
});

/** One must-fix finding of a design check, tied to an element (design-verify.ts). */
export interface DesignFinding {
  file: string;
  line: number;
  problem: string;
  selector: string;
}

/** The variant a design check judged to hold to the system best, and why. */
export interface DesignPick {
  variant: string;
  why: string;
}

/**
 * A design check (design-verify.ts): one round of a verifier session judging
 * an attempt's design-shaped result, its whole working tree at one moment,
 * against its project's design system, before the task reaches review.
 * `checking` while the verifier works; `passed` lets that tree go on, committed
 * or not; `findings` went back to the builder; `failed` when the verifier
 * ended with no verdict, or its builder ended first.
 */
export const designChecks = sqliteTable(
  "design_checks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    taskId: text("task_id").notNull(),
    /** The builder's work item: the attempt whose result is judged. */
    itemId: text("item_id").notNull(),
    /** The builder's working tree judged, committed or not, as a git tree: what a pass holds for. */
    tree: text("tree_sha").notNull(),
    /** The commit that tree sat on; what it changed on top of it went to the verifier as a patch. */
    head: text("head_sha").notNull(),
    /** The verifier's own work item, once it started. */
    verifierItemId: text("verifier_item_id"),
    state: text("state")
      .$type<"checking" | "passed" | "findings" | "failed">()
      .notNull(),
    /** The builder's `finish_item`, held while the verifier works; run again on a pass. */
    submission: text("submission", {
      mode: "json",
    }).$type<WorkItemSubmission>(),
    findings: text("findings", { mode: "json" }).$type<DesignFinding[]>(),
    pick: text("pick", { mode: "json" }).$type<DesignPick>(),
    createdAt: timestamp("created_at").notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => [index("design_checks_item").on(table.itemId)]
);

/** One file of a design proposal as its card draws it: before and after, text. */
export interface DesignProposalFile {
  after: string;
  before: string;
  path: string;
}

/**
 * An agent's change to a project's design system, waiting for the person
 * (design-system.ts): the call's files as it made them, applied through
 * `design_write` on Approve, at the place it was proposed. Deleted once
 * answered.
 */
export const designProposals = sqliteTable("design_proposals", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  /** The proposing session. */
  instanceId: text("instance_id").notNull(),
  /** Where design/ is written: a repository's root on a machine; both null for the project's folder. */
  machineId: text("machine_id"),
  root: text("root"),
  why: text("why").notNull(),
  /** The `design_write` call's files, written again whole on Approve. */
  files: text("files", { mode: "json" })
    .$type<{ content: string; encoding?: "utf8" | "base64"; path: string }[]>()
    .notNull(),
  /** What the write would change, as it stood when proposed: the card's diff. */
  preview: text("preview", { mode: "json" })
    .$type<DesignProposalFile[]>()
    .notNull(),
  /** The `design_write` call that made it: where its card is drawn in the session. */
  toolUseId: text("tool_use_id"),
  createdAt: timestamp("created_at").notNull(),
});

/**
 * A project's starters for one place (core `StarterPlace`: the board, the
 * Routines page, the Decisions tab) as they were last written
 * (project-starters.ts): one row per project and place, kept even when the
 * set is empty, so an unchanged project (`input_hash`) and a set's age
 * (`generated_at`) are known without one.
 */
export const projectStarterSets = sqliteTable(
  "project_starter_sets",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    place: text("place").$type<StarterPlace>().notNull(),
    generatedAt: timestamp("generated_at").notNull(),
    /** The hash of the inputs Jev was asked over. */
    inputHash: text("input_hash").notNull(),
    /** What asked for it: `project created`, `task moved`, `turn ended`, `commit landed`, `attempt failed`, `routine failed`, `routine made`, `event received`, `stale`. */
    trigger: text("trigger").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.place] })]
);

/** One starter of a project's set for a place, at its position in the set's order. */
export const projectStarters = sqliteTable(
  "project_starters",
  {
    projectId: text("project_id").notNull(),
    place: text("place").$type<StarterPlace>().notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    glyph: text("glyph").$type<StarterGlyph>().notNull(),
    reason: text("reason").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.place, table.position] }),
    foreignKey({
      columns: [table.projectId, table.place],
      foreignColumns: [projectStarterSets.projectId, projectStarterSets.place],
    }).onDelete("cascade"),
  ]
);

/** What one starter comes from, in its order. */
export const projectStarterSources = sqliteTable(
  "project_starter_sources",
  {
    projectId: text("project_id").notNull(),
    place: text("place").$type<StarterPlace>().notNull(),
    position: integer("position").notNull(),
    seq: integer("seq").notNull(),
    kind: text("kind").$type<StarterSourceKind>().notNull(),
    ref: text("ref").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.place, table.position, table.seq],
    }),
    foreignKey({
      columns: [table.projectId, table.place, table.position],
      foreignColumns: [
        projectStarters.projectId,
        projectStarters.place,
        projectStarters.position,
      ],
    }).onDelete("cascade"),
  ]
);

/**
 * What the person did with a starter (project-starters.ts): sent it as it
 * stood (`picked`) or changed (`edited`), or let its set be replaced without
 * pressing it (`ignored`). The newest are Jev's steering input.
 */
export const starterOutcomes = sqliteTable(
  "starter_outcomes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The place the starter stood in. */
    place: text("place").$type<StarterPlace>().notNull(),
    text: text("text").notNull(),
    outcome: text("outcome").$type<StarterOutcome>().notNull(),
    at: timestamp("at").notNull(),
  },
  (table) => [index("starter_outcomes_project").on(table.projectId, table.at)]
);

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
 * An artifact (Projects spec §5.10): a document a session made that the
 * person works in — a page, a canvas or a preview — listed in the session's
 * panel newest first. Its live state is one Yjs document, kept as
 * {@link artifactUpdates}; this row is what lists it and serves it.
 */
export const artifacts = sqliteTable(
  "artifacts",
  {
    id: text("id").primaryKey(),
    instanceId: text("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    /**
     * The session whose `artifact_create` last made it: the owner itself, or
     * a delegate that put it in its parent's panel (`to: "parent"`), which
     * may go on updating, reading and showing it. Null on one made before it
     * was kept.
     */
    madeBy: text("made_by").references(() => instances.id, {
      onDelete: "set null",
    }),
    /** The session's project when it made it; a page there is also written to `decisions/<name>/`. */
    projectId: text("project_id"),
    kind: text("kind").$type<import("@cawco/core").ArtifactKind>().notNull(),
    name: text("name").notNull(),
    /** The machine a preview's dev server or folder is on; null for a page, which the hub serves. */
    machineId: text("machine_id"),
    /**
     * What the panel shows (core `PreviewSource`), exactly one of: a page by
     * name (served from `artifacts/<id>/`), a folder, or a dev server's port.
     */
    sourcePage: text("source_page"),
    sourceDir: text("source_dir"),
    sourcePort: integer("source_port"),
    /** The path a folder or port preview opens at. */
    sourcePath: text("source_path"),
    /** The workspace whose dev server a port preview is: it runs in that workspace's own network. */
    sourceWorkspace: text("source_workspace").references(() => workspaces.id, {
      onDelete: "set null",
    }),
    /** A sheet's: the stage's toolchain root and its story file, from the clone's root. */
    sourceStageDir: text("source_stage_dir"),
    sourceStageFile: text("source_stage_file"),
    /** A workspace preview's: the command the workspace's stage runs and keeps up on the port, and its folder from the clone's root. */
    sourceServeCommand: text("source_serve_command"),
    sourceServeCwd: text("source_serve_cwd"),
    /** Moved by each new HTML; mirrored in the doc's `meta.revision`. */
    revision: integer("revision").notNull().default(1),
    /** Moved by every update the doc takes, from anyone: `artifact_read`'s `since` cursor. */
    seq: integer("seq").notNull().default(0),
    /** The last seq the session was told of: the person's changes after it are owed to it. */
    deliveredSeq: integer("delivered_seq").notNull().default(0),
    /** The seq the session last read it at (`artifact_read`): the person's changes after it are unread (`artifact_list`). */
    readSeq: integer("read_seq").notNull().default(0),
    /** The revision a person last had on screen: a view's word that it showed it, or a page's new HTML morphing in an open view. Null until then. */
    openedRevision: integer("opened_revision"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
    shownAt: timestamp("shown_at"),
  },
  (table) => [
    index("artifacts_instance").on(table.instanceId, table.createdAt),
    uniqueIndex("artifacts_instance_name").on(
      table.instanceId,
      table.kind,
      table.name
    ),
  ]
);

/**
 * Each key's last change on an artifact (a page's `state` key, a canvas's
 * element id): the seq it changed at and who changed it, one row per key.
 * `artifact_read`'s `since` and the unread counts read them by seq.
 */
export const artifactChanges = sqliteTable(
  "artifact_changes",
  {
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    seq: integer("seq").notNull(),
    by: text("by").$type<"person" | "agent">().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.artifactId, table.key] }),
    index("artifact_changes_seq").on(table.artifactId, table.seq),
  ]
);

/**
 * The artifact each session's panel shows: the operator's intent, kept so a
 * hub restart still serves it (preview.ts `previewTargets` is rebuilt from
 * these). One per session; gone when the panel is closed or the session ends.
 */
export const shownPreviews = sqliteTable("shown_previews", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifacts.id, { onDelete: "cascade" }),
});

/**
 * The port each session's previews are served on in port mode (preview.ts),
 * and the port its host name says under a `{port}` host pattern: its own
 * origin, kept across restarts so the previewed app keeps its storage.
 * Taken when the session first shows a preview or a canvas, given back when
 * the session ends.
 */
export const previewPorts = sqliteTable("preview_ports", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  port: integer("port").notNull().unique(),
});

/**
 * How previews are reached, fleet-wide (core `PreviewSettings`) — one row,
 * keyed `'preview'`, following the {@link spendSettings} precedent. No row
 * reads as port mode, which needs no setup.
 */
export const previewSettings = sqliteTable("preview_settings", {
  /** Always `'preview'`. */
  id: text("id").primaryKey(),
  mode: text("mode").$type<"port" | "host">().notNull().default("port"),
  /** Host mode's origins: `http://` or `https://`, then a host name with `{session}` standing for the session's id or `{port}` for its kept preview port; null in port mode. */
  pattern: text("pattern"),
});

/**
 * An artifact's Yjs document as its update log: every update appended in
 * order; every {@link ARTIFACT_COMPACT_EVERY} updates the log is replaced by
 * one snapshot (`Y.encodeStateAsUpdate`).
 */
export const artifactUpdates = sqliteTable(
  "artifact_updates",
  {
    artifactId: text("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    update: customType<{ data: Uint8Array; driverData: Uint8Array }>({
      dataType: () => "blob",
    })("update").notNull(),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.seq] })]
);

/**
 * The turn a project's Caw is in, one row per lead session while it lasts
 * (caw.ts `turns`, its working copy): whose it is, so what he starts in it
 * after a hub restart is still that work's (work_items.origin). Written when
 * the turn is woken and when its first frame is noted, cleared at its end;
 * read back as the hub starts. (`caw_turns` is what each turn cost.)
 */
export const leadTurns = sqliteTable("lead_turns", {
  /** The lead session. */
  instanceId: text("instance_id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** Whose turn it is: `you`, `kept` or `event`. */
  origin: text("origin").$type<WorkOrigin>().notNull(),
  /** The thread it answers; null for a turn no thread woke. */
  threadId: text("thread_id").references(() => projectThreads.id, {
    onDelete: "set null",
  }),
  /** What it answers when no thread does: "a report from site#4f2a1c". */
  what: text("what"),
  /** The turn under way read a send: the idle after it ends that turn. */
  started: integer("started", { mode: "boolean" }).notNull().default(false),
});

/** Threads whose wake a lead's turn under way read: `working` until it ends. In the order read (rowid). */
export const leadTurnReading = sqliteTable(
  "lead_turn_reading",
  {
    instanceId: text("instance_id")
      .notNull()
      .references(() => leadTurns.instanceId, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => projectThreads.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.threadId] })]
);

/**
 * Wakes sent to a lead and not yet read, by send uuid: the thread each woke
 * (null for none), `working` until read and answered.
 */
export const leadTurnWaiting = sqliteTable(
  "lead_turn_waiting",
  {
    instanceId: text("instance_id")
      .notNull()
      .references(() => leadTurns.instanceId, { onDelete: "cascade" }),
    /** The wake's send: a send that goes is never read, and its wake goes with it. */
    sendUuid: text("send_uuid")
      .notNull()
      .references(() => sentMessages.uuid, { onDelete: "cascade" }),
    threadId: text("thread_id").references(() => projectThreads.id, {
      onDelete: "set null",
    }),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.sendUuid] })]
);

/** A harness subagent a session started and that has not ended: its task, and the call that started it. */
export interface OpenSubagent {
  call: string | null;
  task: string;
}

/**
 * What a session has done that taints a memory note it writes (memory.ts
 * `TurnWatch`), one row per session that has done any, kept so a hub
 * restart mid-turn keeps it. `web` and `fromRoutine` hold for the session's
 * life; `delivered` and `routine` for its turn, until the turn's result;
 * `subagents` until each ends on its own.
 */
export const sessionTaints = sqliteTable("session_taints", {
  instanceId: text("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  /** It read the web: every later note of the session is tainted `web`. */
  web: integer("web", { mode: "boolean" }).notNull().default(false),
  /** The routine whose run started it: a session a routine-woken turn spawned. */
  fromRoutine: text("from_routine"),
  /** Since its last turn's result it read a send the hub delivered: its turn is not self-started. */
  delivered: integer("delivered", { mode: "boolean" }).notNull().default(false),
  /** The routine whose wake its turn read (a lead's). */
  routine: text("routine"),
  updatedAt: timestamp("updated_at").notNull(),
});

/** A session's harness subagents still running (`session_taints`), one row each. */
export const sessionSubagents = sqliteTable(
  "session_subagents",
  {
    instanceId: text("instance_id")
      .notNull()
      .references(() => sessionTaints.instanceId, { onDelete: "cascade" }),
    /** The harness's task id. */
    task: text("task").notNull(),
    /** The tool call that started it. */
    call: text("call"),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.task] })]
);

/**
 * What became of one of Caw's shell or edit calls (lead-gate.ts): `asked`
 * while it waits on your Approve card, `ran` once it was let run (its exit
 * once its result came), `refused` by the hub's rules, `denied` by you.
 */
export type LeadCallOutcome = "asked" | "ran" | "refused" | "denied";

/**
 * Every shell or edit call a project's Caw made (lead-gate.ts), one row each,
 * so his thread shows it and a hub restart keeps what you approved: a task
 * whose only changes are his own edits passes review only once you approved
 * them (tasks.ts `moveTo`).
 */
export const leadCalls = sqliteTable(
  "lead_calls",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),
    /** The thread his turn answered: a task named in it owns the call's changes. */
    threadId: text("thread_id"),
    /** The permission ask it came as. */
    requestId: text("request_id").notNull(),
    /** The tool call, as its transcript names it; its result carries the exit. */
    toolUseId: text("tool_use_id"),
    tool: text("tool").notNull(),
    /** The shell command, or the file an edit names. */
    command: text("command").notNull(),
    /** The files it names that it changes. */
    files: text("files", { mode: "json" }).$type<string[]>().notNull(),
    /** Whether it changes anything: every edit, and every shell call but a read-only one. */
    writes: integer("writes", { mode: "boolean" }).notNull(),
    outcome: text("outcome").$type<LeadCallOutcome>().notNull(),
    /** You approved it on its card. */
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    /** Why the hub refused it. */
    why: text("why"),
    /** Its exit as its result said it: a code, or `failed` for an edit that did not apply. */
    exit: text("exit"),
    at: timestamp("at").notNull(),
  },
  (table) => [
    index("lead_calls_project_at").on(table.projectId, table.at),
    uniqueIndex("lead_calls_request").on(table.requestId),
  ]
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
    /** What an event is, as typed data (`ThreadEvent`); null on notes stored before it was kept. */
    event: text("event", { mode: "json" }).$type<ThreadEvent>(),
    /** The project folder's files Caw's message says he wrote (`stages.md`). */
    files: text("files", { mode: "json" }).$type<string[]>(),
    /** Your answer's question and answer, from the lead's AskUserQuestion. */
    question: text("question", { mode: "json" }).$type<ThreadQuestion>(),
    answer: text("answer", { mode: "json" }).$type<ThreadAnswer>(),
    /** The pictures your words carried, as the media store keeps them (media.ts), and its addresses for them. */
    images: text("images", { mode: "json" }).$type<ThreadImage[]>(),
    /** The pastes and files your words carried, files by the hub's reference (`POST /api/files`). */
    attachments: text("attachments", { mode: "json" }).$type<
      SendAttachment[]
    >(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("thread_messages_thread").on(table.threadId)]
);

/**
 * The tasks Caw's message is about (`tsk-12`), one row each, in the order he
 * named them (rowid); the thread a task's work reports to is the newest
 * message naming it (db `threadOfTask`).
 */
export const threadMessageTasks = sqliteTable(
  "thread_message_tasks",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => threadMessages.id, { onDelete: "cascade" }),
    /** The message's thread's project, which a task id is unique within. */
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.taskId] }),
    index("thread_message_tasks_task").on(table.projectId, table.taskId),
  ]
);

/** Who a routine's run goes to: a fresh delegate of its type, or the project's lead. */
/**
 * What a run starts: a fresh delegate, a message to the project's Caw, or
 * the project's memory curator (memory.ts), a delegate in the `curator`
 * role that only the hub makes.
 */
export type RoutineTarget = "delegate" | "lead" | "curator";

/**
 * A routine (Projects spec §5.5, routines.ts): a prompt the hub runs on a
 * cron schedule in a time zone. `next_slot` is the schedule's whole state:
 * a tick fires the newest slot at or before now once `next_slot` is due, and
 * moves it past now in the same transaction, so missed slots collapse into
 * one.
 */
export const routines = sqliteTable(
  "routines",
  {
    id: text("id").primaryKey(),
    /** Its project; null for a routine of the fleet, run in the hub's own checkout. */
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** Five fields, or six with seconds first (Effect's `Cron.parse`). */
    cron: text("cron").notNull(),
    /** An IANA zone the schedule reads in, like Europe/London. */
    timeZone: text("time_zone").notNull(),
    target: text("target").$type<RoutineTarget>().notNull(),
    prompt: text("prompt").notNull(),
    /** The delegate type a `delegate` run starts; null: the fleet's default. */
    delegateType: text("delegate_type"),
    /** Where a `delegate` run's commits go: `none` unless the routine says. */
    lands: text("lands").$type<LandsMode>().notNull().default("none"),
    /** What each run's work item may spend. */
    budget: text("budget", { mode: "json" }).$type<WorkBudget>(),
    /** Dollars its runs may spend in a day of its time zone; null: no cap. */
    dailyCapUsd: real("daily_cap_usd"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** Why it is off, when the hub turned it off (it expired). */
    disabledReason: text("disabled_reason"),
    /** `owner`, or the id of the session that made it. */
    createdBy: text("created_by").notNull(),
    /**
     * The session whose `routine_create` call made it; null for yours, the
     * hub's, and routines made before the hub kept where.
     */
    madeInInstance: text("made_in_instance"),
    /** The Caw thread that session's turn was in, when it was in one. */
    madeInThread: text("made_in_thread"),
    /**
     * What the making turn said just before its `routine_create` call, one
     * paragraph; null when it said nothing, or the routine is not an agent's.
     */
    madeWhy: text("made_why"),
    /** How that session is named in its notice: Caw, a delegate, or another session. */
    madeBy: text("made_by").$type<RoutineMadeEvent["by"]>(),
    /**
     * When its notice went to you (routines.ts `announce`); null while it
     * waits for its why, and on routines no session made. A hub start
     * announces a session's routine still waiting.
     */
    announcedAt: timestamp("announced_at"),
    /** Kept past its expiry: set by the owner, or an agent on the owner's word. */
    keep: integer("keep", { mode: "boolean" }).notNull().default(false),
    /** When an agent's routine turns itself off unless kept; null for the owner's. */
    expiresAt: timestamp("expires_at"),
    /** The newest scheduled slot it fired (its time). */
    lastSlot: timestamp("last_slot"),
    /** The next scheduled slot. */
    nextSlot: timestamp("next_slot").notNull(),
    /** The project thread its notices and its lead messages go to, once it has one. */
    threadId: text("thread_id"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("routines_project").on(table.projectId)]
);

/**
 * Where a routine's run is: queued behind a live run (an event's run, which
 * starts when the runs before it end), being started, running, ended, or
 * skipped (nothing started).
 */
export type RoutineRunState =
  "queued" | "starting" | "running" | "ended" | "skipped";

/**
 * How a run ended, by its delegate's `finish_item` summary or Caw's
 * `routine_result`: `silent` (`NO_REPLY`), `delivered` (its words became a
 * notice), `failed` (`AUTOMATION_FAILED`, an item that failed, or Caw's turn
 * ending without a result), `cancelled` (someone stopped it).
 */
export type RoutineOutcome = "silent" | "delivered" | "failed" | "cancelled";

/**
 * One run of a routine at one slot: a scheduled slot's time (ISO), `test:<created
 * at>` for the run a new routine makes at once, `now:<when>` for a run
 * asked for by hand, or `event:<inbound event id>` for an event's run. Unique on (routine, slot, attempt): the insert is the
 * fire, so a slot fires once, and its one retry (attempt 2) once.
 */
export const routineRuns = sqliteTable(
  "routine_runs",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    slot: text("slot").notNull(),
    attempt: integer("attempt").notNull().default(1),
    state: text("state").$type<RoutineRunState>().notNull(),
    workItemId: text("work_item_id"),
    /**
     * A lead run's Caw session, once its harness read the run's wake: the
     * turn that took it ends the run, with Caw's `routine_result` or failed.
     */
    leadInstanceId: text("lead_instance_id"),
    /** A lead run's thread: where its slot was noted and Caw was woken. */
    threadId: text("thread_id"),
    outcome: text("outcome").$type<RoutineOutcome>(),
    /** What its delegate said, when it said more than the contract's words. */
    output: text("output"),
    /** Why it was skipped or failed, as a sentence. */
    reason: text("reason"),
    /** What its work item's session spent, booked when it ended. */
    usd: real("usd"),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    uniqueIndex("routine_runs_slot").on(
      table.routineId,
      table.slot,
      table.attempt
    ),
    index("routine_runs_item").on(table.workItemId),
  ]
);

/** What a connection's sealed `secret` holds. */
export interface ConnectionSecret {
  client?: import("@modelcontextprotocol/sdk/shared/auth.js").OAuthClientInformationMixed;
  key?: string;
  tokens?: OAuthTokens;
  verifier?: string;
}

/**
 * A connection (Projects spec §5.5, connections.ts): an outside service's MCP
 * server the hub signs in to and calls for sessions. Its key, or its OAuth
 * tokens, client and the verifier of a sign-in under way, are its `secret`,
 * a sealed column; nothing else in the row is secret, and no route or tool
 * answers the secret.
 */
export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  /** `[a-z0-9-]+`, unique: the name delegate types list and sessions call it by. */
  name: text("name").notNull().unique(),
  service: text("service").notNull(),
  /** Which account of the service, in the owner's words. */
  account: text("account").notNull(),
  transport: text("transport")
    .$type<import("@cawco/core").ConnectionTransport>()
    .notNull(),
  url: text("url"),
  command: text("command"),
  args: text("args", { mode: "json" }).$type<string[]>(),
  auth: text("auth").$type<import("@cawco/core").ConnectionAuth>().notNull(),
  /** For `header` auth: the header (stdio: the environment variable) the key goes in. */
  header: text("header"),
  state: text("state").$type<import("@cawco/core").ConnectionState>().notNull(),
  reason: text("reason"),
  /** Its key, or its OAuth tokens, client and a sign-in's verifier: sealed. */
  secret: sealedJson<ConnectionSecret>("sealed"),
  /** The OAuth discovery the SDK saved (resource and authorization server metadata): public documents. */
  discovery: text("discovery", { mode: "json" }).$type<
    import("@modelcontextprotocol/sdk/client/auth.js").OAuthDiscoveryState
  >(),
  /** A sign-in under way: the `state` its redirect must bring back, and where to. */
  signInState: text("sign_in_state").unique(),
  signInRedirect: text("sign_in_redirect"),
  signInExpiresAt: timestamp("sign_in_expires_at"),
  /** When the held access token runs out, as its token response said. */
  tokensExpireAt: timestamp("tokens_expire_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/** The projects whose every session may use a connection, beside the delegate types that list it. */
export const connectionProjects = sqliteTable(
  "connection_projects",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.projectId] }),
    index("connection_projects_project").on(table.projectId),
  ]
);

/** How an inbound event reached the hub. */
export type InboundVia = "poll" | "webhook" | "connector";

/**
 * One event from outside (Projects spec §5.5 Ingress, ingress.ts), stored
 * once under (source, delivery key) however many paths bring it in: a
 * GitHub poll and a webhook of one change carry the same natural key
 * (`pr:12:merged`), so the second insert finds the row and does nothing.
 */
export const inboundEvents = sqliteTable(
  "inbound_events",
  {
    id: text("id").primaryKey(),
    /** `github:<owner>/<repo>`, or `conn:<connection>:<tool>`. */
    source: text("source").notNull(),
    /** Natural, never a transport's delivery id: `pr:12:merged`, `comment:991`, `<id>:<version>`. */
    deliveryKey: text("delivery_key").notNull(),
    /** `pr.opened`, `pr.merged`, `pr.closed`, `issue.opened`, `issue.closed`, `issue.labeled`, `comment.created`, `item`. */
    kind: text("kind").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The event as ingress.ts normalised it, JSON, at most 64 KB (cut with a marker). */
    payload: text("payload").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    via: text("via").$type<InboundVia>().notNull(),
    /** The routine a route sent it to, `lead` for the lead's inbox, or null (stored only: the lead was off). */
    routedTo: text("routed_to"),
    /** The route it was delivered by: the oldest matching route to the routine it went to; null otherwise. */
    routeId: text("route_id").references(() => eventRoutes.id, {
      onDelete: "set null",
    }),
    /** When it was handed on: its routine's run filed, or the lead's wake that carried it. */
    handledAt: timestamp("handled_at"),
  },
  (table) => [
    uniqueIndex("inbound_events_delivery").on(table.source, table.deliveryKey),
    index("inbound_events_project").on(table.projectId, table.receivedAt),
    index("inbound_events_inbox").on(table.projectId, table.routedTo),
  ]
);

/**
 * A rule that sends a project's matching inbound events to a routine
 * (ingress.ts). Every condition set must hold; the oldest enabled route
 * that matches takes the event.
 */
export const eventRoutes = sqliteTable(
  "event_routes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** A source, `*` matching any run of characters: `github:*`, `conn:linear:*`. */
    source: text("source").notNull(),
    /** The event's author, any case. */
    author: text("author"),
    /** A label the event carries, any case. */
    label: text("label"),
    /** A pull request's head branch, exactly. */
    branch: text("branch"),
    /** A regular expression run over the event's title and body. */
    regex: text("regex"),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** `owner`, or the id of the session that made it. */
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("event_routes_project").on(table.projectId)]
);

/** The kinds an event route takes, one row each; a route with none takes any. */
export const eventRouteKinds = sqliteTable(
  "event_route_kinds",
  {
    routeId: text("route_id")
      .notNull()
      .references(() => eventRoutes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
  },
  (table) => [primaryKey({ columns: [table.routeId, table.kind] })]
);

/** Where one GitHub resource's poll stands: its ETag, its high-water mark, and its counts. */
export interface GitHubCursor {
  etag: string | null;
  /** 304s answered: polls that cost nothing. */
  notModified: number;
  polls: number;
  /** The newest `updated_at` taken in, ms: events at or after it are looked for. */
  since: number;
}

/** The resources a project's repository is polled for: issue events are where its labels come from. */
export type GitHubResource = "pulls" | "issues" | "comments" | "issueEvents";

/**
 * A project's GitHub poller (ingress.ts, github.ts): the connection whose
 * token it polls with, the repository it last polled, and each resource's
 * cursor (`github_poll_cursors`), so a hub restart neither re-delivers nor
 * misses.
 */
export const githubPollers = sqliteTable("github_pollers", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** The connection (service `github`, a bearer token) it polls with. */
  connection: text("connection").notNull(),
  /** `owner/repo` the cursors are for; another repository starts them afresh. */
  repo: text("repo"),
  /** Why its last poll failed, or null. */
  reason: text("reason"),
  /** GitHub's rate limit holds polls back until then. */
  resumeAt: timestamp("resume_at"),
  polledAt: timestamp("polled_at"),
});

/** One resource's cursor in a project's GitHub poller ({@link GitHubCursor}). */
export const githubPollCursors = sqliteTable(
  "github_poll_cursors",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => githubPollers.projectId, { onDelete: "cascade" }),
    resource: text("resource").$type<GitHubResource>().notNull(),
    etag: text("etag"),
    /** The newest `updated_at` taken in, ms. */
    since: integer("since").notNull(),
    polls: integer("polls").notNull(),
    notModified: integer("not_modified").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.resource] })]
);

/**
 * A connector poll (ingress.ts): one connection's read tool called on an
 * interval, its items diffed by id and version into `inbound_events`.
 */
export const connectorPolls = sqliteTable(
  "connector_polls",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    connection: text("connection").notNull(),
    tool: text("tool").notNull(),
    args: text("args", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    /** Seconds between calls, 60 or more. */
    intervalS: integer("interval_s").notNull(),
    /** A dot path to the array of items in the result; empty: the result is the array. */
    itemsPath: text("items_path").notNull().default(""),
    /** A dot path to each item's id, and to its version (`updated_at`). */
    idPath: text("id_path").notNull(),
    versionPath: text("version_path").notNull(),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /**
     * When a call last kept what it saw (`connector_poll_items`); null until
     * its first call, and after an edit to what it lists or keys by, when
     * the next call only looks.
     */
    seenAt: timestamp("seen_at"),
    reason: text("reason"),
    polledAt: timestamp("polled_at"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("connector_polls_project").on(table.projectId)]
);

/** What a connector poll's last call saw: each item's id and version. */
export const connectorPollItems = sqliteTable(
  "connector_poll_items",
  {
    pollId: text("poll_id")
      .notNull()
      .references(() => connectorPolls.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    version: text("version").notNull(),
  },
  (table) => [primaryKey({ columns: [table.pollId, table.itemId] })]
);

/**
 * Where an approved action is (actions.ts): waiting for you, approved (and
 * due at its time), denied, running (claimed, its one call under way), done,
 * failed (the service answered it did not), unknown (the call went and no
 * answer came back, or the hub stopped mid-call: it may or may not have
 * happened), or cancelled before it ran.
 */
export type ActionState = import("@cawco/core").ActionState;

/**
 * An approved action (Projects spec §5.5, actions.ts): one exact tool call on
 * a connection, proposed by a session, approved by you, and run by the hub
 * once, at or after its time. `args` is the call's arguments as proposed,
 * serialised once, and never written again: the call sends it, and an
 * approval names its hash. A row's claim (approved → running) is the one
 * transaction that lets the call go, so it goes at most once.
 */
export const actions = sqliteTable(
  "actions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The task it is for, and moves on success; null for none. */
    taskId: text("task_id"),
    /** The connection's name, and the service and account it signed in as at proposal. */
    connection: text("connection").notNull(),
    service: text("service").notNull(),
    account: text("account").notNull(),
    /** The tool's own name on the connection's server. */
    tool: text("tool").notNull(),
    /** The arguments, JSON, as proposed: what the call sends, byte for byte. */
    args: text("args").notNull(),
    /** SHA-256 of `args`, hex: what an approval must name. */
    argsHash: text("args_hash").notNull(),
    /** When it runs, at the earliest; null: as soon as it is approved. */
    runAt: timestamp("run_at"),
    /** The proposer's one sentence: why. */
    reason: text("reason").notNull(),
    /** The session that proposed it. */
    proposedBy: text("proposed_by").notNull(),
    /** The routine whose run proposed it (that run's session, or one it started); null outside any routine. */
    routineId: text("routine_id").references(() => routines.id, {
      onDelete: "set null",
    }),
    /** That routine's run. */
    runId: text("run_id").references(() => routineRuns.id, {
      onDelete: "set null",
    }),
    state: text("state").$type<ActionState>().notNull(),
    /** Minted at proposal, sent in the call's `_meta`. */
    idempotencyKey: text("idempotency_key").notNull().unique(),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at"),
    startedAt: timestamp("started_at"),
    endedAt: timestamp("ended_at"),
    /** What the service answered, JSON, cut at 16 KB. */
    result: text("result"),
    /** Why it failed, was denied, or is unknown, as a sentence. */
    error: text("error"),
    /** The task stage it moves to once done, `by: action`. */
    thenStage: text("then_stage"),
    /** What its stage move came to: the move, or why it was refused. Null until it tried. */
    stageResult: text("stage_result"),
    /** When you looked at an unknown one and put it away. */
    checkedAt: timestamp("checked_at"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("actions_project").on(table.projectId, table.createdAt),
    index("actions_due").on(table.state, table.runAt),
  ]
);

/** Who signs a relay's deliveries (relay.ts). */
export type RelayProvider = import("@cawco/core").RelayProvider;
/** Where a relay is (relay.ts): asked for, live, waiting on one step of yours, or turned off. */
export type RelayState = import("@cawco/core").RelayState;

/**
 * A relay (Projects spec §5.5 Relay, relay.ts): one public path,
 * `/hooks/<id>`, through Tailscale Funnel to the hub's receiver, for one
 * project and one provider. The row is the wanted state; the hub host applies
 * it at start and whenever a relay comes or goes. `secret` is sealed and no
 * route or tool answers it.
 */
export const relays = sqliteTable(
  "relays",
  {
    /** 128 random bits, base64url: the path's last part. */
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    provider: text("provider").$type<RelayProvider>().notNull(),
    /** What deliveries are signed with: minted for a webhook the hub registers, else the owner's (`cawco relay set-secret`). */
    secret: sealedText("secret"),
    /** `minted` (the hub made it and gave it to the provider), `owner` (set from the owner's terminal), or null: none yet. */
    secretFrom: text("secret_from").$type<"minted" | "owner">(),
    /** The connection the webhook is registered through (GitHub). */
    connection: text("connection"),
    /** GitHub's id for the webhook the hub registered, so removing the relay deletes it. */
    hookId: text("hook_id"),
    /** generic: the header carrying the hex HMAC-SHA256, and an optional timestamp header. */
    signatureHeader: text("signature_header"),
    timestampHeader: text("timestamp_header"),
    /** generic: a dot path to the event's id in the body; the body's SHA-256 without one. */
    idPath: text("id_path"),
    /** The machine whose Tailscale serves the path: the hub's. */
    host: text("host").notNull(),
    /** `https://<machine>.<tailnet>.ts.net:10000/hooks/<id>`, once Funnel says it is live. */
    publicUrl: text("public_url"),
    state: text("state").$type<RelayState>().notNull(),
    /** Why it isn't live, as the exact step or command; null when live. */
    reason: text("reason"),
    /** When the provider's test delivery (GitHub's ping) arrived. */
    testedAt: timestamp("tested_at"),
    lastDeliveryAt: timestamp("last_delivery_at"),
    /** `owner`, or the id of the session whose ask the owner approved. */
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("relays_project").on(table.projectId)]
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

/**
 * Pages are blocks (Projects spec §5.2): each block a project page holds, in
 * the person's arrangement. One row per block: the page it stands on, its
 * place in that page's order, its width, and whether it is hidden. A custom
 * view placed as a block is `view:<name>`, on one page at most (the key); a
 * view no row names is its own tab. A page with no rows shows its built-in
 * blocks in their own order (`blocks.ts`).
 */
export const projectBlocks = sqliteTable(
  "project_blocks",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** `board`, `table`, `pipeline` or `routines` (core `BLOCK_PAGES`). */
    page: text("page").$type<BlockPage>().notNull(),
    /** A built-in block's word, or `view:<name>`. */
    block: text("block").notNull(),
    /** Its place in its page's order, from 0. */
    position: integer("position").notNull(),
    width: text("width").$type<BlockWidth>().notNull(),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.block] }),
    index("project_blocks_page").on(table.projectId, table.page),
  ]
);

/**
 * Drafts standing on a page as proposed blocks (blocks.ts): one row per
 * draft view a session drafted for a page, where it asked to stand. Its own
 * table, beside the arrangement: a page the person writes whole never
 * touches a proposal, and a draft never takes the place of the kept view
 * it may revise. Keep turns the row into the page's block; Remove (the
 * draft discarded) drops it; so does the project going.
 */
export const viewProposals = sqliteTable(
  "view_proposals",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** The draft view's name (`views/drafts/<view>.oui`). */
    view: text("view").notNull(),
    page: text("page").$type<BlockPage>().notNull(),
    /** Its place in the page's order, from 0, or null: the page's end. */
    position: integer("position"),
    /** Who drafted it: "Caw", or a session's name. */
    proposedBy: text("proposed_by").notNull(),
    proposedAt: timestamp("proposed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.view] })]
);
