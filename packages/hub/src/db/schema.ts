import {
  ACCOUNT_MOVE_KINDS,
  ACCOUNT_SETUP_STEPS,
  type AccountProvider,
  PROJECT_AT_LIMIT,
} from "@cawco/core/accounts";
import {
  ACCOUNT_HUES,
  COLD_MOVES,
  COMPACT_METHODS,
  PLACEMENT_STRATEGIES,
} from "@cawco/core/accounts/kinds";
import { ACTION_STATES } from "@cawco/core/actions";
import { ARTIFACT_DOES, ARTIFACT_KINDS } from "@cawco/core/artifact-kinds";
import { ASK_KEPT, ASK_KINDS } from "@cawco/core/asks";
import { BLOCK_PAGES, BLOCK_WIDTHS } from "@cawco/core/blocks";
import {
  APP_SERVICES,
  CONNECTION_AUTHS,
  CONNECTION_TRANSPORTS,
} from "@cawco/core/connections";
import { CAW_POSE_IDS, HEARS } from "@cawco/core/decides";
import { SESSION_ROLES } from "@cawco/core/delegate-types";
import { everyOf } from "@cawco/core/every-of";
import { EXTERNAL_KINDS, EXTERNAL_SOURCES } from "@cawco/core/external-items";
import { MEMORY_ROLES } from "@cawco/core/fleet";
import {
  EFFORT_LEVELS,
  HARNESSES,
  type HarnessKind,
} from "@cawco/core/harness/kinds";
import {
  PERMISSION_MODES,
  WIRE_PERMISSION_MODES,
} from "@cawco/core/harness/modes";
import { HARNESS_CONFIG_KINDS } from "@cawco/core/harness-config";
import { IMAGE_PROVIDERS } from "@cawco/core/image-generation";
import { type CheckoutMove, LANDS_MODES } from "@cawco/core/injected";
import type { MachinePath } from "@cawco/core/machine-path";
import { HELPERS, STEP_LISTS } from "@cawco/core/own-tools";
import {
  PLAN_EDIT_KINDS,
  PLAN_STEP_PRIORITIES,
  PLAN_STEP_STATUSES,
} from "@cawco/core/plan";
import {
  DELEGATE_EVENT_KINDS,
  type Envelope,
  type SendPayload,
  type SpawnPayload,
} from "@cawco/core/protocol";
import { RELAY_PROVIDERS, RELAY_STATES } from "@cawco/core/relays";
import {
  CONDITION_STOPS,
  ROUTINE_OUTCOMES,
  ROUTINE_RUN_STATES,
  ROUTINE_TARGETS,
  ROUTINE_VERDICTS,
} from "@cawco/core/routine-kinds";
import { SEND_STATES } from "@cawco/core/session-messages";
import {
  STARTER_GLYPHS,
  STARTER_PLACES,
  STARTER_SOURCE_KINDS,
} from "@cawco/core/starters";
import {
  AccountKindSchema,
  AccountMoveSchema,
  AskStateSchema,
  AtPlanLimitSchema,
  AttemptResultSchema,
  BinaryUpdateStateSchema,
  BrowserHostKindSchema,
  BrowserStateSchema,
  BuildInfoSchema,
  CapPeriodSchema,
  CheckoutMoveSchema,
  ClaudeModelUsageSchema,
  ConnectAccessSchema,
  ConnectionStateSchema,
  ContinuationJobSchema,
  DelegateAskStatusSchema,
  DelegateEventPayloadSchema,
  DeviceKindSchema,
  EndedBySchema,
  EnvelopeShape,
  ExternalActorSchema,
  ExternalStateSchema,
  FiledRecordsSchema,
  FleetItemStatusSchema,
  FleetMcpConfigSchema,
  FleetRefreshOutcomeSchema,
  FleetScopeSchema,
  FleetSyncOutcomeSchema,
  FleetSyncReportSchema,
  GithubProjectSchema,
  HookHandlerSchema,
  InstanceStatusSchema,
  IssueTrackerSchema,
  KeptMachineCapabilitiesSchema,
  LastErrorKindSchema,
  LinkModeSchema,
  MachineStateSchema,
  McpPlatformSchema,
  ModelInfoSchema,
  MoveEndedSchema,
  MoveStageSchema,
  NamedHarnessReportSchema,
  NamedMoveRequestSchema,
  NeutralUserMessageSchema,
  OnCapSchema,
  OpenCodeGoLimitsSchema,
  OwedMoveWaitSchema,
  ParkedAskShape,
  PlaceLfsRowSchema,
  ProjectNoteSchema,
  ProjectOfferReasonSchema,
  RefusalReachSchema,
  RelayReachSchema,
  RoutineMadeBySchema,
  RuleMatchKindSchema,
  RuleTimingSchema,
  RuleWatchSchema,
  ScratchWorktreeSchema,
  SendModeSchema,
  SendPayloadShape,
  SessionCommandsSchema,
  SessionEndIntentSchema,
  SessionOriginSchema,
  SessionToolingSchema,
  SigninStateSchema,
  SpawnPayloadSchema,
  StarterOutcomeSchema,
  StreamRelayStateSchema,
  ToolCopySchema,
  ToolWantsSchema,
  TrackerSyncStateSchema,
  WorkspaceHoldingSchema,
  WorkspaceKindSchema,
} from "@cawco/core/stored-shapes";
import { CAPABILITY_KINDS } from "@cawco/core/suggest";
import { HOUR_MS } from "@cawco/core/time";
import type { ToolStatus } from "@cawco/core/tools";
import { TOOL_STATES, TOOL_UPDATES } from "@cawco/core/tools";
import { TRACKERS } from "@cawco/core/trackers";
import type { LimitWindow } from "@cawco/core/usage/types";
import { USAGE_HARNESSES } from "@cawco/core/usage/types";
import { STAGES_TEMPLATES } from "@cawco/core/views";
import { WORK_ITEM_STATES } from "@cawco/core/work-items";
import type { WorkspaceHolding } from "@cawco/core/workspace/controls";
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  blob,
  check,
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
import { z } from "zod";
import { hubSecrets, openOrNull } from "../secret-box";
import { storedEnum, storedJson } from "../stored-json";
import { machineColumn, projectColumn, sessionColumn } from "./owner-columns";
import {
  AccountMoveBodySchema,
  AgentAuthSchema,
  AgentStatusSchema,
  ArtifactChangeBySchema,
  AttemptAskSchema,
  AuthorizationServerMetadataSchema,
  CacheTtlSchema,
  CommentDirectionSchema,
  CompactionMoveBodySchema,
  ContinueRequestSchema,
  DelegateRequestKindSchema,
  DesignCheckStateSchema,
  DesignFindingSchema,
  DesignOfferAnswerSchema,
  DesignProposalFileSchema,
  GitHubResourceSchema,
  InboundViaSchema,
  InstanceKindSchema,
  InstanceTitleSourceSchema,
  KeepAliveStoppedSchema,
  LandingPhaseSchema,
  LfsOfferAnswerSchema,
  LimitCompactionStageSchema,
  McpAuthModeSchema,
  MoveAskerSchema,
  MoveStateShape,
  OAuthClientInformationFullSchema,
  OAuthClientInformationMixedSchema,
  OAuthDiscoveryStateSchema,
  OAuthProtectedResourceMetadataSchema,
  OAuthTokensSchema,
  OriginSchema,
  PreparedContinuationSchema,
  PresenceKindSchema,
  PreviewSettingsModeSchema,
  ProjectOfferAnswerSchema,
  QueuedRequestSchema,
  QueuedStartWhySchema,
  RelayJourneyClosedSchema,
  RelayNameStateSchema,
  RelaySecretFromSchema,
  RemovedAccountWhySchema,
  RuleStateStatusSchema,
  SendHoldSchema,
  SessionLineKindSchema,
  StartingSetKindSchema,
  StoredSendRefusalSchema,
  StrandedWhySchema,
  TaskEdgeKindSchema,
  ToolCallKeyStateSchema,
  TrashedRowsSchema,
  TrashKindSchema,
  TrimOfferAnswerSchema,
  WorkItemSubmissionSchema,
  WorkOriginSchema,
  WorkspaceStateSchema,
} from "./stored-shapes";
import type {
  ContinuationAsker,
  ItemBlock,
  SessionLineKind,
} from "./stored-types";

const timestamp = (column: string) => integer(column, { mode: "timestamp_ms" });
/** A time column a row's insert stamps with now, unless given one. */
const stampedNow = (column: string) =>
  timestamp(column)
    .notNull()
    .$defaultFn(() => new Date());
/** The project a row is of, deleted with it. */
const projectKey = () =>
  projectColumn("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" });

/**
 * A fleet row's area (core `FleetPlacement.areaId`): bound to every project
 * in it as read now, in place of one project; the row goes with its area.
 */
const fleetRowArea = () =>
  text("area_id").references(() => areas.id, { onDelete: "cascade" });

/**
 * A fleet row's project (core `FleetPlacement.projectId`): the row goes with
 * its project, kept in the forget's record and back with its restore, and
 * a trashed one whose project went is refused its Undo (db/trash.ts
 * `unbound`), never brought back bound to nothing.
 */
const fleetRowProject = () =>
  projectColumn("project_id").references(() => projects.id, {
    onDelete: "cascade",
  });

/**
 * A budget (stored-types.ts `WorkBudget`) as a row's columns: what a work
 * item may spend, or what a project's or a routine's work items may, before
 * the hub stops it (work-items.ts `overBudget`). Each limit null is not set
 * here: a work item's was taken field by field from its call, task or
 * routine, then its project, when it was made (work-items.ts `budgetFrom`),
 * so one null there is no limit. `budget_unread` is a budget that was stored
 * and did not read whole when budgets became columns (migration 0398), kept
 * as it was stored: while it is set, the work it governs stops, and its
 * readable limits are in the columns beside it.
 */
const budgetColumns = () => ({
  /** Dollars, above 0. */
  budgetUsd: real("budget_usd"),
  /** Turns its session ends, a whole number from 1. */
  budgetTurns: integer("budget_turns"),
  /** Minutes since the item started, a whole number from 1. */
  budgetMinutes: integer("budget_minutes"),
  budgetUnread: text("budget_unread"),
});

/** What an area's or a project's sessions do at their account's limit (core `ProjectAtLimit`): wait for the reset, unless it says move. */
const accountAtLimitColumn = () =>
  storedEnum(z.enum(PROJECT_AT_LIMIT))("account_at_limit")
    .notNull()
    .default("wait");

/** A row that goes with its area: deleted when the area is. */
const areaKey = () =>
  text("area_id")
    .notNull()
    .references(() => areas.id, { onDelete: "cascade" });

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

/**
 * A secret JSON column: the value's JSON, sealed as {@link sealedText} is,
 * and checked against its schema once it is opened (hub stored-json.ts).
 */
const sealedJson = <S extends z.ZodType>(schema: S) =>
  storedJson(schema, {
    close: (json) => hubSecrets().seal(json),
    open: (raw) => openOrNull(raw),
  });

/**
 * A send as its machine is handed it, as its column keeps it: under any verb,
 * as the column always took one (a row is a send the hub wrote; db sends.ts
 * reads it back as one).
 */
const SendEnvelopeSchema: z.ZodType<Envelope<SendPayload>> =
  EnvelopeShape.extend({ payload: SendPayloadShape });
/** A session's start as its machine is handed it, as its column keeps it (db instances.ts reads it back as one). */
const SpawnEnvelopeSchema: z.ZodType<Envelope<SpawnPayload>> =
  EnvelopeShape.extend({ payload: SpawnPayloadSchema });

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
  harness: HarnessKind;
  model: string | null;
  /** The `limit_events` id drawn after it. */
  next: string | null;
  sessionId: string;
}

/** Machines running an agent daemon, keyed by their stable hardware fingerprint. */
export const agents = sqliteTable("agents", {
  /**
   * What the machine has installed, in its own words (core
   * `KeptMachineCapabilities`); its platform is the first part of `os`.
   */
  machineCapabilities: storedJson(KeptMachineCapabilitiesSchema)(
    "machine_capabilities"
  ),
  machineId: machineColumn("machine_id").primaryKey(),
  hostname: text("hostname").notNull(),
  /**
   * The machine's home folder, absolute, as its daemon reported at register.
   * A place named under `~` on the machine is resolved against it before it
   * is stored (db `placePathOn`). Null until a daemon that says so registers.
   */
  home: text("home"),
  os: text("os").notNull(),
  status: storedEnum(AgentStatusSchema)("status").notNull().default("offline"),
  /** What the daemon found about Claude Code's credentials, last time it registered. */
  auth: storedEnum(AgentAuthSchema)("auth").notNull().default("unknown"),
  /**
   * What the machine came to the last time it converged on the fleet's MCP
   * servers and plugins (NEW.md §11). Null until it has been asked once.
   */
  fleet: storedJson(FleetSyncReportSchema)("fleet"),
  /**
   * What became of the last delta the hub sent it (core
   * `FleetSyncOutcome`), kept apart from {@link fleet}: a delta refused or
   * unanswered leaves the last report as it was. Null until the hub has
   * sent it one.
   */
  fleetSync: storedJson(FleetSyncOutcomeSchema)("fleet_sync"),
  /**
   * Each fleet item as the machine's harnesses converge it (core
   * `FleetItemStatus`), by item id. Null until the machine has said.
   */
  fleetItems: storedJson(z.record(z.string(), FleetItemStatusSchema))(
    "fleet_items"
  ),
  /**
   * The generation of the machine's desired fleet state (hub
   * fleet-sync.ts): raised whenever what it is to hold changes, or a
   * person's Sync, Retry or Overwrite asks it to act, and never otherwise,
   * so a delta sent again goes under the same one. Kept through the hub's
   * restart; 0 until the hub has sent the machine one.
   */
  fleetGeneration: integer("fleet_generation").notNull().default(0),
  /** What the machine was to hold at {@link fleetGeneration}, as one hash of every item's: what tells the next build of its config apart. */
  fleetFingerprint: text("fleet_fingerprint"),
  /**
   * The cawco the daemon is running (NEW.md §12), as it reported at register.
   * Null until a daemon that says so has registered once.
   */
  build: storedJson(BuildInfoSchema)("build"),
  /**
   * The owner paused the machine until this time (machine-pause.ts): the hub
   * starts nothing on it until then, its agent connected all the while. Null
   * when it is not paused; cleared as the time comes.
   */
  pausedUntil: timestamp("paused_until"),
  /**
   * How many commands the pause stopped as it began (machine-pause.ts): the
   * machine's row says it. 0 when it stopped none; cleared with the pause.
   */
  pauseStoppedCommands: integer("pause_stopped_commands").notNull().default(0),
  /**
   * What the pause stopped as migration 0424 found it stored, kept as it
   * was when it did not read (db/machine-columns-unread.ts): the pause
   * stopped work it no longer counts, and its row says so. Cleared with the
   * pause.
   */
  pauseStoppedUnread: text("pause_stopped_unread"),
  /**
   * The machine's binary update state as its agent last said it (core
   * `BinaryUpdateState`), written each time it moves: what the update list
   * and the machine's row say of it once it is offline (asleep, gone), and
   * through the hub's restart, beside {@link lastSeenAt}. Null until an
   * agent has said one to a hub that keeps it.
   */
  binaryUpdate: storedJson(BinaryUpdateStateSchema)("binary_update"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: stampedNow("created_at"),
});

/**
 * A machine's last-known tool status ({@link ToolStatus}), one row
 * per catalog id (NEW.md §10): what the daemon reported at register or after
 * an install, or the `installing` the hub writes itself while one is in
 * flight.
 */
export const agentTools = sqliteTable(
  "agent_tools",
  {
    machineId: machineColumn("machine_id")
      .notNull()
      .references(() => agents.machineId, { onDelete: "cascade" }),
    toolId: text("tool_id").notNull(),
    state: storedEnum(z.enum(TOOL_STATES))("state").notNull(),
    version: text("version"),
    method: text("method"),
    detail: text("detail"),
    /**
     * For a tool with its own sign-in: whether it is signed in there, as the
     * machine last read it, in its own word (core `NamedToolSignin.state`);
     * null when the machine said nothing of it.
     */
    signinState: text("signin_state"),
    /** When that sign-in was read (core `ToolSignin.at`). */
    signinAt: timestamp("signin_at"),
    /** What that read said when it said neither (core `ToolSignin.detail`). */
    signinDetail: text("signin_detail"),
    /**
     * The sign-in as migration 0424 found it stored, kept as it was when it
     * did not read (db/machine-columns-unread.ts): read as signed out until
     * the machine says it again.
     */
    signinUnread: text("signin_unread"),
    /** Whose the copy there is, as the machine judged it (core `ToolCopy`); null from an older machine, or with no copy. */
    copy: storedJson(ToolCopySchema)("copy"),
    /** While the copy there is one its CawCo does not run: the version it runs (core `ToolWants`). */
    wants: storedJson(ToolWantsSchema)("wants"),
    /** When the install attempt whose words `detail` holds ran (core `ToolStatus.triedAt`). */
    triedAt: timestamp("tried_at"),
    /** On `installing`: the version being put on (core `ToolStatus.to`). */
    goingTo: text("going_to"),
    /** On `installing`: who started it (core `ToolStatus.startedBy`). */
    startedBy: storedEnum(z.enum(["cawco", "person"]))("started_by"),
    /** When this was learnt. */
    at: timestamp("at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.toolId] })]
);

/**
 * What one harness adapter on a machine can do, one row per harness, as its
 * daemon last reported it: the report is the daemon's own, written and read
 * whole. Read in the order each was first reported (rowid).
 */
export const agentHarnesses = sqliteTable(
  "agent_harnesses",
  {
    machineId: machineColumn("machine_id")
      .notNull()
      .references(() => agents.machineId, { onDelete: "cascade" }),
    /** The machine's own name for it, one this hub does not run included (core `NamedHarnessReport`). */
    harness: text("harness").notNull(),
    report: storedJson(NamedHarnessReportSchema)("report").notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.harness] })]
);

/**
 * The permission mode the person last chose for a harness on a machine: the
 * mode a start from the dashboard's or the app's form went out on, written
 * as it goes. A revive of a session whose row records no mode runs on it
 * (launches.ts `settleMode`); with none here it is refused.
 */
export const chosenModes = sqliteTable(
  "chosen_modes",
  {
    machineId: machineColumn("machine_id").notNull(),
    harness: storedEnum(z.enum(HARNESSES))("harness").notNull(),
    permissionMode: text("permission_mode").notNull(),
    chosenAt: timestamp("chosen_at").notNull(),
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
  machineId: machineColumn("machine_id").primaryKey(),
  hostname: text("hostname").notNull(),
  removedAt: timestamp("removed_at").notNull(),
});

/**
 * A machine the hub added over SSH, and the connection it holds to it
 * (ssh-tunnels.ts): the SSH target the person typed, and the port on the
 * machine's loopback its agent reaches the hub on, carried to the hub's port
 * by that connection. Kept so the hub opens every connection again when it
 * starts, on the same port, which the agent's config names. `machineId` is
 * null while the add that made the row runs, and set once the machine has
 * joined; the hub only holds the connection of a joined machine open.
 */
export const sshMachines = sqliteTable(
  "ssh_machines",
  {
    /** 12 random hex: names the connection's control socket (ssh-tunnels.ts `controlPath`). */
    id: text("id").primaryKey(),
    /**
     * The hub that holds this connection, by its id (hub-id.ts, kept beside
     * the database): the one hub that opens it, ends its stale session and
     * admits its machine. A copy of the database (a scratch hub booted on a
     * `VACUUM INTO` of the live one) starts with an id of its own, so it
     * leaves every row of the hub it was copied from alone. Null on a row
     * made before rows named their hub, until that hub claims it
     * (db/ssh-machines.ts `claim`).
     */
    hubId: text("hub_id"),
    /** `user@host`, or a `Host` from the hub user's `~/.ssh/config`. */
    target: text("target").notNull(),
    /** The SSH port the person gave, or null: whatever `ssh` connects to. */
    sshPort: integer("ssh_port"),
    /** The port on the machine's loopback carried to the hub: null until OpenSSH allocates it. */
    boxPort: integer("box_port"),
    /**
     * The process on the machine that holds this hub's forward on `boxPort`,
     * as `<pid> <start>` (`ps -o lstart=`), read there each time the
     * connection comes up: the one process the hub ends when the port is
     * still held as it connects again (a dead hub's session, a dropped
     * one's). Anything else holding the port is left alone (ssh-tunnels.ts
     * `endStale`).
     */
    boxSession: text("box_session"),
    machineId: machineColumn("machine_id"),
    /**
     * The machine key the last add wrote to the machine (ssh-tunnels.ts
     * `admit`), sealed, until the machine proves it under the id it
     * registers as and it is kept as that machine's key (hub-auth.ts).
     */
    pendingKey: sealedText("pending_key"),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [index("ssh_machines_machine").on(table.machineId)]
);

/**
 * A project: one identity for work across machines and folders.
 * Where its files are is its places (`project_places`); `machineId` and `cwd`
 * are its primary place, the one it was made from, and every client that
 * reads a project as one folder on one machine reads that one.
 */
/**
 * An area (core areas.ts, the project-grouping decision): a named group a
 * project may sit in, carrying the settings the fleet carries. Each setting
 * column mirrors the project's own, null for none: a project in the area
 * takes the area's where it sets none itself, the fleet's where the area
 * sets none too (core `settingsInEffect`). Its `decides.md` and `delegates/`
 * live in its folder on the hub (`areas/<id>/`); its skills, MCP servers,
 * hooks and harness settings are fleet rows bound to it (`area_id`). It has no
 * places, board, conversation or routines; deleting it ungroups its
 * projects (`projects.area_id` set null) and deletes nothing of them.
 */
export const areas = sqliteTable("areas", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Its place among the areas, smallest first. */
  position: integer("position").notNull().default(0),
  /** The account its projects' sessions start on where a project names none; null: the fleet's routing. */
  account: text("account").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /** What its projects' sessions on {@link account} do at that account's limit. */
  accountAtLimit: accountAtLimitColumn(),
  /** The permission mode its projects' conversations start in; null: the fleet's. */
  cawMode: storedEnum(z.enum(PERMISSION_MODES))("caw_mode"),
  /** What each of its projects may spend in `cap_period`, in dollars; null: no cap. */
  capUsd: real("cap_usd"),
  capPeriod: storedEnum(CapPeriodSchema)("cap_period"),
  /** What reaching the cap does; null: the fleet's. */
  onCap: storedEnum(OnCapSchema)("on_cap"),
  createdAt: stampedNow("created_at"),
});

/**
 * A project (§5.1 of the Projects spec): its name and settings. Where its
 * files are is its places (`project_places`): its folder on the hub from the
 * moment it is made, and the checkouts it gains, one of them primary.
 */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /**
   * Where the project's tasks live (§5.2 of the Projects spec): CawCo's own
   * files in the project folder, alone or with GitHub Issues or Linear as
   * the record of each task's issue fields (tracker.ts, `tracker_bindings`).
   */
  tracker: storedEnum(z.enum(TRACKERS))("tracker").notNull().default("cawco"),
  /**
   * The project's conversation (§5.3): the session its events reach, which
   * the hub starts on the first event while `caw` is on (caw.ts). The
   * attempts the dispatcher starts on its own report to it. Null: no session
   * yet, and nothing is dispatched without someone asking.
   */
  conversationInstanceId: sessionColumn("conversation_instance_id"),
  /**
   * Whether the project's events reach a conversation: on, the hub sends
   * each to its conversation, starting one when none runs (caw.ts). On for
   * projects made with Caw; off for every project from before it, and off
   * means nothing for the project wakes a model.
   */
  eventsOn: integer("events_on", { mode: "boolean" }).notNull().default(false),
  /**
   * Whether the project's conversation reads what the person writes on its
   * tasks (task-input.ts): a comment, a to-do or a task they add, gathered
   * over a quiet spell and read as one. Their words, so it reaches the
   * conversation whether its events are on or off.
   */
  hearsTasks: integer("hears_tasks", { mode: "boolean" })
    .notNull()
    .default(true),
  /**
   * Whether the person's comment on a task reaches its attempt (jev-tasks.ts
   * Attach or fresh): a live attempt reads it; an ended one's session takes
   * it, goes on compressed with it, or a fresh attempt starts.
   */
  attemptsHearComments: integer("attempts_hear_comments", { mode: "boolean" })
    .notNull()
    .default(true),
  /** The harness Caw runs on. */
  cawHarness: storedEnum(z.enum(HARNESSES))("caw_harness")
    .notNull()
    .default("claude"),
  /** The model Caw's session runs; null: the harness's own default. */
  cawModel: text("caw_model"),
  /**
   * The permission mode the hub starts the project's conversation in, over
   * the fleet's (`supervisor_config.caw_mode`); a routine's or an event
   * route's own is more specific still (caw.ts `modeFor`). Null: the fleet's.
   */
  cawMode: storedEnum(z.enum(PERMISSION_MODES))("caw_mode"),
  /**
   * Whether the hub starts attempts at ready tasks on its own (dispatch.ts).
   * Off until you turn it on, and inert without a conversation.
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
  lands: storedEnum(z.enum(LANDS_MODES))("lands").notNull().default("main"),
  /**
   * Where its tasks' attempts run when the task file says nothing
   * (`runs_on:`, runs-on.ts): a machine, or a capability like `apple`.
   * Null: any machine with a checkout, as before there was a choice.
   */
  runsOn: text("runs_on"),
  /**
   * The budget every work item of the project runs under, limit by limit,
   * where neither its delegate call nor its task names one (work-items.ts
   * `overBudget`). One that did not read holds every attempt of the project.
   */
  ...budgetColumns(),
  /**
   * What the project may spend in a period (`cap_period`), in dollars: every
   * session of it, its Caw and its attempts (project-caps.ts). Null: no cap,
   * and no limit.
   */
  capUsd: real("cap_usd"),
  /** The span the cap counts over, in the hub's zone; set with `cap_usd`. */
  capPeriod: storedEnum(CapPeriodSchema)("cap_period"),
  /**
   * What reaching the cap does, the project's own; null inherits the fleet's
   * (`spend_settings`).
   */
  onCap: storedEnum(OnCapSchema)("on_cap"),
  /**
   * Its sessions run only on the accounts `project_accounts` lists, of the
   * providers it lists (placement.ts `ofProvider`); false: every account.
   * Removing its last listed account sets it false (db/accounts.ts `remove`).
   */
  accountsLimited: integer("accounts_limited", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The account the sessions it starts run on (its conversation, its
   * routines' runs, its delegates) when a start names none of its own, and
   * where they stay (project-edit.ts `account`, placement.ts
   * `projectAccount`). Null: the fleet's routing; an account removed clears
   * it.
   */
  account: text("account").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /**
   * What its sessions on {@link account} do at that account's limit (core
   * `ProjectAtLimit`, placement.ts `runningAccounts`): wait for the reset
   * there, or move as a session on an account its start named moves.
   */
  accountAtLimit: accountAtLimitColumn(),
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
  template: storedEnum(z.enum(STAGES_TEMPLATES))("template"),
  /**
   * The template the person tapped on New project, kept as what was tapped
   * until its setup page is sent (setup.ts): `project_setup` answers it, and
   * nothing of it is written before Send. Null: none was tapped.
   */
  tapped: storedEnum(z.enum(STAGES_TEMPLATES))("tapped"),
  /**
   * Review before done: only you move a task into a done stage, and an
   * attempt that lands sends its task to review (stages.ts `ruledStages`).
   * Off: the project's conversation and sessions close tasks as the project's stages allow.
   */
  review: integer("review", { mode: "boolean" }).notNull().default(false),
  /**
   * Where its large files live (its Large files setting): an LFS endpoint
   * every git-lfs run on a machine for it is held to (agent host-lfs.ts),
   * with {@link lfsConnection}'s credential. Null: each repository's own
   * origin's LFS.
   */
  lfsUrl: text("lfs_url"),
  /** The fleet connection whose key signs in to {@link lfsUrl}, by name; set with it. */
  lfsConnection: text("lfs_connection"),
  /**
   * The area it sits in (`areas`), one at most: it takes the area's settings
   * wherever it sets none. Null: none; deleting the area sets it null, and a
   * forget keeps it with the row.
   */
  areaId: text("area_id").references(() => areas.id, {
    onDelete: "set null",
  }),
  createdAt: stampedNow("created_at"),
});

/** Where a project's tasks live: CawCo's files alone, or an outside tracker beside them (tracker.ts). */
export type Tracker = import("@cawco/core/trackers").Tracker;

/**
 * Attempts a stage's `runs:` hook asked for while the project already ran
 * its `max_attempts` (dispatch.ts): each starts, oldest first, as a slot
 * frees, if its task is still in that stage. Kept here so a hub restart does
 * not forget them.
 */
export const queuedTaskStarts = sqliteTable(
  "queued_task_starts",
  {
    projectId: projectColumn("project_id").notNull(),
    /** The task, `tsk-12`. */
    taskId: text("task_id").notNull(),
    /** The stage whose hook asked for it. */
    stage: text("stage").notNull(),
    /** The session that moved the task in, which takes the report; null: the project's conversation. */
    parentInstanceId: sessionColumn("parent_instance_id"),
    /**
     * Why it waits: `cap`, the project runs `max_attempts` already; `owns`,
     * a live work item owns files this attempt's task owns too.
     */
    why: storedEnum(QueuedStartWhySchema)("why").notNull().default("cap"),
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
    origin: storedEnum(OriginSchema)("origin"),
    /**
     * What the `delegate` call that named the task asked over its task file
     * (stored-types.ts `AttemptAsk`: its brief, its name and how it runs),
     * read whole as it starts. Null: a task_start, a hook's or the
     * dispatcher's; or held, `asked_unread` set.
     */
    asked: storedJson(AttemptAskSchema)("asked"),
    /**
     * An ask that was kept and did not read as an `AttemptAsk` when the
     * column gained its schema (migration 0405), as it was stored, `asked`
     * null beside it. The start is held: it never starts, and the dispatch
     * view says why, until a later start or move of its task replaces it.
     */
    askedUnread: text("asked_unread"),
    queuedAt: stampedNow("queued_at"),
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
    projectId: projectKey(),
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
    /** The task it is a part of (`part_of`): it inherits that task's waits. */
    partOf: text("part_of"),
    /** The task or pin it was found in (`found_in`), written by the hub. */
    foundIn: text("found_in"),
    /** The task it repeats (`duplicate_of`): a task waiting on it waits on that one instead. */
    duplicateOf: text("duplicate_of"),
    rank: text("rank"),
    todosDone: integer("todos_done").notNull().default(0),
    todosTotal: integer("todos_total").notNull().default(0),
    /** What in the file could not be read, in a sentence; null when all of it could. */
    problem: text("problem"),
    /**
     * What its `budget:` line holds that does not read (task-file.ts
     * `budgetUnread`); null when it reads or there is none. While set, no
     * attempt at the task starts, and its `startProblem` says why.
     */
    budgetUnread: text("budget_unread"),
    /**
     * What its lines that govern an attempt (`outputs:`, `owns:`, `checks:`,
     * `accounts:`, `waits_on:`) hold that does not read as their lists
     * (task-file.ts `listsUnread`); null when they read or there are none.
     * While set, no attempt at the task starts, and its `startProblem` says
     * why: an entry such a line leaves out would widen what it does.
     */
    listsUnread: text("lists_unread"),
    /** sha256 hex of the file's content as indexed. */
    hash: text("hash").notNull(),
    /** When the hub last saw the content change. */
    updatedAt: stampedNow("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.path] }),
    index("project_tasks_id").on(table.projectId, table.id),
  ]
);

/**
 * What a task waits on (`waits_on:`), one row each, in the order its file
 * lists them (rowid): `other_id` the target as the file keeps it (a task as
 * `tsk-12`; a card, a pin, a pull request, a run or a session as
 * wait-targets.ts keeps it). Rebuilt with its task's index row; a task is
 * named by id, not keyed, since a file may name a task that has no file.
 */
export const projectTaskEdges = sqliteTable(
  "project_task_edges",
  {
    projectId: projectColumn("project_id").notNull(),
    /** The task's file: its index row's key with `projectId`. */
    path: text("path").notNull(),
    kind: storedEnum(TaskEdgeKindSchema)("kind").notNull(),
    /** What it waits on, as the file keeps it. */
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
    // Who waits on a task, a card or a pull request.
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
    projectId: projectColumn("project_id").notNull(),
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
 * The project folder files a task's work produces (`outputs:`), one row
 * each, in the order its file lists them (rowid): what the project's Made
 * list draws. Rebuilt with its task's index row.
 */
export const projectTaskOutputs = sqliteTable(
  "project_task_outputs",
  {
    projectId: projectColumn("project_id").notNull(),
    path: text("path").notNull(),
    output: text("output").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.path, table.output] }),
    foreignKey({
      columns: [table.projectId, table.path],
      foreignColumns: [projectTasks.projectId, projectTasks.path],
    }).onDelete("cascade"),
  ]
);

/**
 * The front matter fields a task file does not know that hold one scalar
 * (`priority`, `due`), as written, one row each: what lists filter and sort on.
 */
export const projectTaskFields = sqliteTable(
  "project_task_fields",
  {
    projectId: projectColumn("project_id").notNull(),
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
 * What a place is: a checkout on a machine, or the project's folder on the
 * hub (its
 * `machineId` is `"hub"` (db `HUB_PLACE_MACHINE`) and its path `projects/<id>`, relative
 * to the hub's data folder; every project has one from the moment it is
 * made).
 */
export type PlaceKind = "checkout" | "hub";

/**
 * Every {@link PlaceKind}: `workspace` went with migration 0322, which
 * deleted those places. The union stays written out, not indexed off this
 * list: the apps' schema names it `PlaceKind` only while it is one.
 */
export const PLACE_KINDS = everyOf<PlaceKind>()(["checkout", "hub"]);

/** What a blocked work item is missing ({@link ItemBlock} `kind`). */
const ITEM_BLOCK_KINDS = everyOf<ItemBlock["kind"]>()([
  "type",
  "machine",
  "account",
]);

/** {@link PLACE_KINDS} as a column's set, typed by its name, which the API's schema reads. */
const PlaceKindSchema: z.ZodType<PlaceKind> = z.enum(PLACE_KINDS);

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
    projectId: projectKey(),
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
    projectId: projectKey(),
    /** Not a reference: a machine's places go with it in `deleteMachine`. */
    machineId: machineColumn("machine_id").notNull(),
    /** Absolute on its machine; the hub's own folder (kind `hub`) is relative to the hub's data. */
    path: text("path").$type<PlacePath>().notNull(),
    kind: storedEnum(PlaceKindSchema)("kind").notNull(),
    /**
     * The project's primary checkout: where it is worked on first, and what a
     * client names it by. Exactly one checkout per project once it has any,
     * set when its first checkout is added; never the hub's.
     */
    isPrimary: integer("is_primary", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * A checkout's root commit, the one its HEAD reaches by first parents:
     * which repository it is, the same in every clone on any machine (core
     * hub-repo.ts). Read with its origin as it is added and at each register
     * of its machine (machine-commands.ts `learnCheckout`), so a move knows whether a
     * checkout on the target is the source's repository with the source's
     * machine away (moves.ts `plan`). Null: not read yet, or no commit.
     */
    root: text("root"),
    /**
     * CawCo made the checkout's folder: a move's clone put it where nothing
     * stood (moves.ts `startSession`), and its machine keeps the folder's
     * identity on disk (agent made-folders.ts). A delete with its files
     * removes a made folder and never any other (project-delete.ts). False:
     * the person named a folder that was there, and every place filed
     * before the hub kept this.
     */
    made: integer("made", { mode: "boolean" }).notNull().default(false),
    /**
     * The checkout's folder has gone: it had stood there (`found`), and
     * nothing stood there when its machine last looked, at its register or
     * as it was added (machine-commands.ts `learnCheckout`).
     */
    missing: integer("missing", { mode: "boolean" }).notNull().default(false),
    /**
     * The checkout's folder has stood at its path, as its machine looked or
     * a move's clone put it there: from then on a session start there never
     * makes it again, and is refused while it is gone (launches.ts
     * `placeHolding`, agent session.ts `workdirFor`). Until then a start
     * makes it, as a new project's folder is made by its first session.
     */
    found: integer("found", { mode: "boolean" }).notNull().default(false),
    createdAt: stampedNow("created_at"),
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
 * A project's links: one per repository of it, its remote normalised to
 * `host/owner/repo` (projects.ts `normaliseRemote`), or the hub's own
 * (`cawco/<project>[/<root>]`). Each is read from a checkout's `origin`
 * (server.ts `learnRemote`), set by `link_repo`, or made by publishing a
 * folder (`create_repo`). A checkout of a linked repository on any machine
 * is known as the project by it, and GitHub events and pull requests of
 * every linked repository reach the project (ingress.ts, relay.ts).
 */
export const projectLinks = sqliteTable(
  "project_links",
  {
    projectId: projectKey(),
    remote: text("remote").notNull(),
    /**
     * The hub repository this link is the published copy of, by its path
     * segment (core hub-repo.ts `hubRepoSegment`): a folder whose origin is
     * that repository is published already. Null: a link read from a
     * checkout's origin, or one `link_repo` set, which no publish made.
     */
    publishedFrom: text("published_from"),
    createdAt: stampedNow("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.remote] }),
    index("project_links_remote").on(table.remote),
  ]
);

/** A running or resumable `query()`. Messages live in SDK session storage, not here. */
export const instances = sqliteTable("instances", {
  /** Removed machines keep ownership hidden without an end decision. */
  machineRemoved: integer("machine_removed", { mode: "boolean" })
    .notNull()
    .default(false),
  scratchWorktree: storedJson(ScratchWorktreeSchema)("scratch_worktree"),
  endReason: text("end_reason"),
  endRetryAt: timestamp("end_retry_at"),
  endAttempts: integer("end_attempts").notNull().default(0),
  /** The hub's decision, independent of process presence and attachment. */
  endIntent: storedEnum(SessionEndIntentSchema)("end_intent"),
  endConfirmedAt: timestamp("end_confirmed_at"),
  /**
   * A start the hub accepted but did not forward because its machine was
   * installing an update: the envelope to send, kept until the machine can take
   * it. The row stays `starting` meanwhile, which is how the person sees it.
   */
  owedSpawn: storedJson(SpawnEnvelopeSchema)("owed_spawn"),
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
   * back once (cut-turns.ts `resumeCutTurn`). {@link TURN_UNRECORDED} on a row
   * from before the hub kept it, until its next turn.
   */
  turnOpenAt: integer("turn_open_at"),
  keepAliveEnabled: integer("keep_alive", { mode: "boolean" })
    .notNull()
    .default(false),
  keepAliveSent: integer("keep_alive_sent").notNull().default(0),
  keepAliveStopped: storedEnum(KeepAliveStoppedSchema)("keep_alive_stopped"),
  cacheTtl: storedEnum(CacheTtlSchema)("cache_ttl"),
  lastRequestAt: timestamp("last_request_at"),
  contextTokens: integer("context_tokens"),
  contextReadAt: timestamp("context_read_at"),
  /**
   * When a keep-alive ping read under 90% from the session's cache, epoch ms
   * on the hub's clock, with {@link cacheColdReason} (keep-alive.ts
   * `keepAliveResult`): its cache is cold until a real turn warms it. Null
   * together: not measured cold.
   */
  cacheColdAt: integer("cache_cold_at"),
  /** What that ping read, in words ("ping read 12%"); null with {@link cacheColdAt}. */
  cacheColdReason: text("cache_cold_reason"),
  /**
   * The cold reading as it was stored, when it was there and did not read
   * whole as it became {@link cacheColdAt} and {@link cacheColdReason}
   * (migration 0425). Only a measured miss wrote one, and only a real turn
   * cleared it, so the session reads as cold (keep-alive.ts `measuredCold`)
   * until a real turn warms it or a ping measures it again, either of which
   * clears this.
   */
  cacheColdUnread: text("cache_cold_unread"),
  /** In-flight ping identity survives a hub or agent restart. */
  keepAliveTurn: text("keep_alive_turn"),
  /**
   * Claude: the cumulative `modelUsage` of the session's last result, which a
   * turn's spend is the change from. Claude Code restores it on resume from
   * the transcript's cost-state, so it runs across processes. `{}` for a
   * conversation started fresh; null while unknown (a resumed or forked start
   * this hub has seen no result of), until a result sets it.
   */
  modelUsageSeen: storedJson(z.record(z.string(), ClaudeModelUsageSchema))(
    "model_usage_seen"
  ),
  id: text("id").primaryKey(),
  /**
   * The machine it runs on. Not a foreign key: a removed machine's sessions
   * stay, `machineRemoved`, under its id, and come back if it rejoins.
   */
  machineId: machineColumn("machine_id").notNull(),
  /** Its project; a deleted project's sessions outlive it, just not as its. */
  projectId: projectColumn("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  /** SDK session id, absent until the first init frame arrives. */
  sessionId: text("session_id"),
  /** Which harness owns `sessionId` — what a resume and a catalog read route on. */
  harness: storedEnum(z.enum(HARNESSES))("harness").notNull(),
  /**
   * The account the session runs on, chosen by placement when it started (a
   * fork's is its origin's). Every later spawn of the row runs on it, until
   * the hub moves it to another at its limit. Null: a harness without
   * accounts, or a session from before accounts.
   */
  accountId: text("account_id"),
  /**
   * The account its start named (New session's pick, a delegate brief's
   * `account`), as placement read it: while it runs there, a cold wake
   * leaves it there, as it leaves a person's move (server.ts
   * `replaceAtWake`). Null: placement chose.
   */
  namedAccount: text("named_account"),
  /**
   * The session this one was forked from, when it was: it reads that
   * session's cache, so it never moves to another account on its own.
   */
  forkedFrom: sessionColumn("forked_from"),
  /**
   * The session that started this one (`delegate`, `start_session`): nested under it in every rail. Null on a session
   * a person started. Whether it is delegated work is {@link workItemId}'s.
   */
  parentInstanceId: sessionColumn("parent_instance_id"),
  /**
   * Who started it (core `SessionOrigin`), stamped once as its row opens
   * from who asked for the start, never from the start's payload: `person`,
   * `delegate`, `project` or `check`. Only a person's sessions stand at the top
   * of a project in the rails; the rest nest under their parent, and one
   * whose work item has ended is listed a day, asleep or not.
   */
  origin: storedEnum(SessionOriginSchema)("origin").notNull().default("person"),
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
  titleSource: storedEnum(InstanceTitleSourceSchema)("title_source"),
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
   * ended) or archived it off Finished, on any device, or the end of a turn
   * that had nothing for them when nothing before it was unseen (db
   * `noteTurnEnded`): a turn that ended after this is news. Null on one
   * never seen.
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
   * Whether its latest turn ended with work of its own that will start it
   * again (core `waitsOnItself` over the turn's `wakes`: a background
   * command, a monitor, a wake-up it set itself), written at each turn's
   * end (db `noteTurnEnded`). The sidebar reads it as still working.
   */
  wakesItself: integer("wakes_itself", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * When the person last wrote to the session: the newest send of theirs
   * the hub accepted (core `byPerson`). Null when they never wrote to it.
   * The sidebar orders its Recent list by it, or by when the row opened.
   */
  wroteAt: timestamp("wrote_at"),
  /**
   * When the person pressed Done on it (an archive, `/api/seen`): it leaves
   * the sidebar's Recent list until they write to it again. Null on one
   * never archived, and after an unarchive.
   */
  doneAt: timestamp("done_at"),
  /**
   * `scratch`: a spin-off (NEW.md §1), shown apart from mainline work.
   * `summariser`: a continuation's internal worker, never on the board.
   */
  kind: storedEnum(InstanceKindSchema)("kind").notNull().default("mainline"),
  /**
   * How the session answers tool permissions, and which model answers: two of
   * the three settings the user keeps changing, so a dashboard that was not open
   * when they chose still shows what the session is really running. Null until a
   * spawn or a session's own `init` says.
   */
  permissionMode: text("permission_mode"),
  model: text("model"),
  /**
   * Whether the hub chose `model` (spawns.ts `modelFor`): its start picked
   * none, or its delegate type's `default`. Written as its row opens
   * (db/instances.ts `openInstance`) by a start that names one way or the
   * other: a resume or a fork that goes on with its conversation's model is
   * the person's choice from then on, and a model a person picks for it
   * (relay-control.ts `settingPickFor`) ends it. A first turn a provider
   * refused on the hub's choice moves to its next pick
   * (start-model-moves.ts); a person's pick is never swapped.
   */
  hubModel: integer("hub_model", { mode: "boolean" }).notNull().default(false),
  /**
   * The third: how hard that model thinks, as the session's agent last read it
   * back from the harness (`EFFORT_READ`) — a level, or `none` when the session
   * sends no effort. Null until the first reading. What the session runs at,
   * shown on its chip; never what a launch asks for ({@link chosenEffort}).
   */
  effort: text("effort"),
  /**
   * The effort the operator chose for the session: the level its spawn named,
   * or the last `set-effort` sent it. Every launch of the session asks for it
   * (`bounded`), whatever brings it back. Null: nobody chose, and its launches
   * name none, so the harness runs its model's default. Only a choice writes
   * it, never a reading.
   */
  chosenEffort: text("chosen_effort"),
  /**
   * The session may start any delegate type (core `MayStart` `["any"]`): an
   * orchestrator. False: a leaf, which may start the types its
   * {@link instanceMayStart} rows name and nothing else (none, with none).
   * Written as its row opens (db/instances.ts `openInstance`): a session
   * nobody delegated work to may start any, every other says its list.
   */
  mayStartAny: integer("may_start_any", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The toolset the session runs in (§5.3), written once by its first spawn:
   * a delegate type's `role` for its work item's session. Null: derived
   * from how it started (roles.ts `roleOf`).
   */
  role: storedEnum(z.enum(SESSION_ROLES))("role"),
  /**
   * The delegate type its spawn named (a fleet type, or its project's), so
   * what the type says (its denied tools) reads the same for every session
   * however it started. Null: none.
   */
  delegateType: text("delegate_type"),
  /** The project whose catalog `delegateType` came from; null: the fleet's. */
  delegateTypeProject: projectColumn("delegate_type_project"),
  /**
   * Started clean (core `SpawnPayload.clean`): written by its first spawn and
   * never after, and every spawn of the row goes clean (launches.ts `bounded`).
   */
  clean: integer("clean", { mode: "boolean" }).notNull().default(false),
  /**
   * It starts with every installed skill and MCP server: no starting set
   * (core `SpawnPayload.startingSet` absent). False: it starts with the ones
   * its {@link instanceStartingSet} rows name, CawCo's own joined (none
   * beyond those, with none). Written by its first spawn and never after,
   * and every spawn of the row carries it (launches.ts `rowKeeps`).
   */
  startsWithAll: integer("starts_with_all", { mode: "boolean" })
    .notNull()
    .default(false),
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
   * The union is core's {@link import('@cawco/core/protocol').InstanceStatus} (see its
   * doc comment for what each value means). Plain text, no SQL migration:
   * `sleeping` arrived by a one-time boot sweep over rows the old taxonomy had
   * to file under `error`.
   */
  status: storedEnum(InstanceStatusSchema)("status")
    .notNull()
    .default("starting"),
  /** Why the session died, for a dashboard that was not watching when it did. */
  lastError: text("last_error"),
  /** What `lastError` was, typed where it was found (core `LastErrorKind`); null when nothing typed it. */
  lastErrorKind: storedEnum(LastErrorKindSchema)("last_error_kind"),
  createdAt: stampedNow("created_at"),
  updatedAt: stampedNow("updated_at"),
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
  /**
   * The session a continuation moved this one's work item to (server.ts
   * `retireContinued`): this one never runs again (core `relaunchOf`
   * refuses it), and what is sent to it goes there. Null on every other.
   */
  continuedInto: sessionColumn("continued_into"),
});

/**
 * What a session's harness reported it has, one row per session, apart from
 * its {@link instances} row: 15 KB of JSON a session on average, 42 KB at
 * most (the live hub, 2026-11-19). In the row, every read of a column stored
 * after it walked its overflow pages, so a scan of `instances` read 157 MB;
 * here a session's row stays a few hundred bytes and these are read by key
 * alone (db/instances.ts `instanceTooling`, `instanceCommands`). The row goes
 * with the session's.
 */
export const instanceTooling = sqliteTable("instance_tooling", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  /**
   * The MCP servers and tool names the session's newest `init` announced, as
   * JSON — overwritten on every `init` that carries them, so a reload or a hub
   * restart still knows what the session has. Null for a harness whose `init`
   * carries neither.
   */
  tooling: storedJson(SessionToolingSchema)("tooling"),
  /**
   * The `/` menu the session's newest `init` listed (its names, and which of
   * them are skills), as JSON, overwritten as `tooling` is: a transcript the
   * hub reads back from the machine's stored file (a Claude session's holds no
   * `init`) still offers it, once the hub let the built one go
   * (transcripts.ts `sweep`) or restarted. Null for a harness whose `init`
   * lists none.
   */
  commands: storedJson(SessionCommandsSchema)("commands"),
});

/** Only hashes reach disk; installing a replacement does not revoke a live credential before ACK. */
export const sessionIdentities = sqliteTable("session_identities", {
  instanceId: sessionColumn("instance_id").primaryKey(),
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

/**
 * The delegate types a leaf session may start ({@link instances.mayStartAny}
 * false), one row each; none: it starts none.
 */
export const instanceMayStart = sqliteTable(
  "instance_may_start",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    delegateType: text("delegate_type").notNull(),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.delegateType] })]
);

/**
 * The skills and MCP servers a session starts with when it has a starting
 * set ({@link instances.startsWithAll} false), one row each.
 */
export const instanceStartingSet = sqliteTable(
  "instance_starting_set",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    kind: storedEnum(StartingSetKindSchema)("kind").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.kind, table.name] }),
    // Its columns by bare name, as every check's (migrations-check.ts
    // `qualifiedChecks`).
    check(
      "instance_starting_set_kind",
      sql`${sql.identifier("kind")} in ('skill', 'server')`
    ),
  ]
);

/**
 * The fleet's delegate types (core `DelegateType`): the presets a
 * `delegate` call's `type` names (db/delegate-types.ts). Its lists are the
 * `delegate_type_*` tables, keyed by its name.
 */
export const delegateTypes = sqliteTable("delegate_types", {
  name: text("name").primaryKey(),
  description: text("description").notNull(),
  harness: storedEnum(z.enum(HARNESSES))("harness").notNull(),
  model: text("model").notNull(),
  /**
   * The effort its sessions ask for, as the harness names it (core
   * `EffortLevel`): text, as a newer harness's level may be one this build
   * cannot name; db delegate-types.ts narrows it with `isEffortLevel` where
   * read. Null: its model's default.
   */
  effort: text("effort"),
  /** The account its sessions prefer; null: the provider's strategy chooses. */
  account: text("account"),
  /**
   * Its sessions may start any type (core `MayStart` `["any"]`). False: the
   * types its {@link delegateTypeMayStart} rows name, none with none.
   */
  mayStartAny: integer("may_start_any", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * Its sessions start with every installed skill and MCP server: it has no
   * starting set. False: the ones its {@link delegateTypeStartingSet} rows
   * name, CawCo's own joined.
   */
  startsWithAll: integer("starts_with_all", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: timestamp("created_at").notNull(),
});

/**
 * One row, `seeded`, once the default delegate types were ever written: an
 * emptied {@link delegateTypes} stays empty (db/delegate-types.ts).
 */
export const delegateTypesMeta = sqliteTable("delegate_types_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** The column every list of a delegate type is keyed by: its name, its rows going with it. */
const delegateTypeName = () =>
  text("type_name")
    .notNull()
    .references(() => delegateTypes.name, { onDelete: "cascade" });

/** The delegate types a type's sessions may start, one row each (core `DelegateType.mayStart`). */
export const delegateTypeMayStart = sqliteTable(
  "delegate_type_may_start",
  {
    typeName: delegateTypeName(),
    delegateType: text("delegate_type").notNull(),
  },
  (table) => [primaryKey({ columns: [table.typeName, table.delegateType] })]
);

/** A type's starting set, one row per skill or server (core `DelegateType.startingSet`). */
export const delegateTypeStartingSet = sqliteTable(
  "delegate_type_starting_set",
  {
    typeName: delegateTypeName(),
    kind: storedEnum(StartingSetKindSchema)("kind").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.typeName, table.kind, table.name] }),
    check(
      "delegate_type_starting_set_kind",
      sql`${sql.identifier("kind")} in ('skill', 'server')`
    ),
  ]
);

/** The skills a type's sessions are started with, one row each (core `DelegateType.skills`). */
export const delegateTypeSkills = sqliteTable(
  "delegate_type_skills",
  {
    typeName: delegateTypeName(),
    skill: text("skill").notNull(),
  },
  (table) => [primaryKey({ columns: [table.typeName, table.skill] })]
);

/** The tools a type's sessions are denied, one row each (core `DelegateType.denyTools`). */
export const delegateTypeDenyTools = sqliteTable(
  "delegate_type_deny_tools",
  {
    typeName: delegateTypeName(),
    tool: text("tool").notNull(),
  },
  (table) => [primaryKey({ columns: [table.typeName, table.tool] })]
);

/** The connections a type's sessions may call, one row each (core `DelegateType.connections`). */
export const delegateTypeConnections = sqliteTable(
  "delegate_type_connections",
  {
    typeName: delegateTypeName(),
    connection: text("connection").notNull(),
  },
  (table) => [primaryKey({ columns: [table.typeName, table.connection] })]
);

/** Completion identity survives agent and hub restarts, independently of live custody. */
export const completedTurns = sqliteTable(
  "completed_turns",
  {
    instanceId: sessionColumn("instance_id").notNull(),
    resultId: text("result_id").notNull(),
    completedAt: text("completed_at"),
    adoptedWithoutReport: integer("adopted_without_report", {
      mode: "boolean",
    }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.resultId] })]
);

/** Unfiled creates owned by the hub until filed, or acknowledged discarded by their machine. */
export const workspaceCreates = sqliteTable("workspace_creates", {
  id: text("id").primaryKey(),
  machineId: machineColumn("machine_id").notNull(),
});

/**
 * Where delegated work lives: one clone of its own on its own branch, on one
 * machine, with the boundary every shell command of its work items runs
 * inside. A workspace has at most one work item in `starting`/`running` at a
 * time — the one writer its checkout ever has — and it owns the checkout:
 * stopping or discarding a session never removes it; archiving does, which
 * the hub does itself once the work lands (stored-types.ts `WorkspaceState`).
 */
export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    machineId: machineColumn("machine_id").notNull(),
    /** The folder the workspace was made from: a repository's root, or any folder (agent layer.ts). */
    repoRoot: text("repo_root").$type<MachinePath>().notNull(),
    /**
     * Where every work item of the workspace runs: the folder itself, seen
     * through the workspace's own view of it (Linux), or its clone (macOS, and
     * every workspace cut before layers).
     */
    path: text("path").$type<MachinePath>().notNull(),
    /** `ws/<id8>` in a repository; empty for a folder. */
    branch: text("branch").notNull(),
    /**
     * What it was made from: a repository's root, which lands by git, or any
     * other folder, which lands by its change set (core `WorkspaceKind`).
     * Every workspace made before folders was a repository's.
     */
    kind: storedEnum(WorkspaceKindSchema)("kind").notNull().default("repo"),
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
    state: storedEnum(WorkspaceStateSchema)("state")
      .notNull()
      .default("active"),
    /**
     * The workspace's scratch dir on its machine, its commands' `TMPDIR`, as
     * the machine named it when the workspace was cut. Null for a workspace
     * cut before this was recorded.
     */
    tmp: text("tmp"),
    createdByInstanceId: sessionColumn("created_by_instance_id").notNull(),
    /**
     * The workspace whose landing gate step this one ran on another machine
     * (the iOS build on a Mac), cut by a hub before 2026-11-17. Read only by
     * the closer that lets those clones go as their machine registers
     * (workspaces.ts `closeGateClones`); the next release's migration drops
     * it once that has run. Null for every other workspace.
     */
    checksFor: text("checks_for"),
    /**
     * The place whose sheets' stage runs in this workspace: a stage clone, cut
     * by its machine from the checkout a session with no workspace works in
     * (agent stage-clone.ts) and filed on its word (core `StageCloneFrame`).
     * It has no work items; it settles once that stage sleeps
     * (workspaces.ts `settle`), and the next sheet cuts it again. Null for a
     * delegate's.
     */
    stageFor: text("stage_for"),
    /**
     * The routine run whose command runs in this workspace: a `command`
     * routine's check (routines.ts `fireCommand`), cut for that one run and
     * let go of unread (`drop`) as it ends. It takes no work item and no
     * session; the settle sweep drops one whose run is no longer live
     * (workspaces.ts `settle`). Null for every other workspace.
     */
    routineRun: text("routine_run"),
    /**
     * A host-scope delegate's (work-items.ts `startHost`): no clone and no
     * boundary. `path` (and `repoRoot`) is the folder on the machine its
     * session runs in, on the host, with the machine's own network, processes
     * and the agent user's groups. Nothing is cut, landed or held for it:
     * no machine call names its folder. Its scratch dir is its sessions'
     * `TMPDIR` all the same (agent host-scratch.ts); once its items have
     * ended and nothing of it is attached, that dir goes and the row is
     * archived, its folder untouched (workspaces.ts `settleHost`), and filed
     * active again for its session to go on (workspaces.ts `reopenHost`).
     * Never listed among a machine's active or live workspaces.
     */
    host: integer("host", { mode: "boolean" }).notNull().default(false),
    /**
     * What its clone held that is nowhere else when it was filed `held`, as
     * its machine read it once its boundary was closed; null in any other
     * state.
     */
    holding: storedJson(WorkspaceHoldingSchema)(
      "holding"
    ).$type<WorkspaceHolding>(),
    /** When {@link workspaces.holding} was read. */
    heldAt: timestamp("held_at"),
    /**
     * The commit its clone's HEAD was on when it retired, on `origin`'s branch
     * that held it then, as its machine read it right before deleting the
     * clone (agent workspace.ts `headOnOrigin`): a retired workspace is cut
     * again there for its delegate to go on, and one with none is not cut
     * again (workspaces.ts `recuttable`). One whose item landed none retires
     * with its commits in a carry: its head names that carry, and where its
     * HEAD built on the branch (agent workspace.ts `carriedFrom`). Null until
     * it retires. Its branch, its commit and its carry (core `WorkspaceCut`):
     * the branch and commit null together; the carry null for one with
     * none (workspaces.ts `headOf`).
     */
    headBranch: text("head_branch"),
    headCommit: text("head_commit"),
    headCarry: text("head_carry"),
    /**
     * Its head as it was stored, when it was there and did not read whole as
     * it became {@link workspaces.headBranch}, `headCommit` and `headCarry`
     * (migration 0428): none of it is placed, so it is no known head and the
     * workspace is not cut again (workspaces.ts `recuttable`, core work.ts
     * `headUnread`). Cleared as its head is next written.
     */
    headUnread: text("head_unread"),
    /**
     * How CawCo moved its checkout (core injected.ts `CheckoutMove`: cut again,
     * workspaces.ts `recut`; rebased as it landed, landing-run.ts `landOnBase`)
     * while no message has been handed to a session of it since: the next one opens
     * with the hub's line naming the move and the install to run (core
     * injected.ts `withMovedLine`), and clears it. Null otherwise. Kept on the
     * row, so a hub restart between the move and that message still says it.
     */
    movedUntold:
      storedJson(CheckoutMoveSchema)("moved_untold").$type<CheckoutMove>(),
    /**
     * The carry its machine wrote as it went: a discard's, its parent or the
     * person letting its unlanded work go, which is never cut again; or its
     * retirement's, its items landing none, which a cut again restores
     * (`head.carry`).
     */
    carry: text("carry"),
    /**
     * The workspace a `delegate` call's `from` cut this one from
     * (workspaces.ts `cutFrom`): its takers are found by it. Null, with
     * {@link workspaces.cutFromCommit} and {@link workspaces.cutFromLanded},
     * for one cut from its repository.
     */
    cutFromWorkspace: text("cut_from_workspace"),
    /** That workspace's HEAD as this clone took it. */
    cutFromCommit: text("cut_from_commit"),
    /**
     * Whether this workspace's landing put every patch of that commit's work
     * on the base branch (landing-run.ts `vouchLanded`): then the source holds
     * none of it as its own, and an archive is told so (core
     * `WorkspaceArchive.landed`).
     */
    cutFromLanded: integer("cut_from_landed", { mode: "boolean" }),
    /**
     * Where it was cut from as it was stored, when that was there and did not
     * read whole as it became columns (migration 0411): not JSON, not an
     * object, or a field that is not its type. Nothing of it is placed: no
     * source finds it among its takers, so none counts its commit as landed
     * by it and the source stays held with its work as its own.
     */
    cutFromUnread: text("cut_from_unread"),
    createdAt: stampedNow("created_at"),
  },
  (table) => [index("workspaces_cut_from").on(table.cutFromWorkspace)]
);

/** A work item's life. Only `starting` and `running` take messages. */
export type WorkItemState = import("@cawco/core/work-items").WorkItemState;

/**
 * One piece of delegated work: a brief, run by one session in one workspace,
 * ending in a report. A follow-up is a new item in the same workspace, run by
 * the same session; the reader or the parent can also reopen finished work.
 * It is `done` only when its session called `finish_item` and its work
 * landed (landing.ts).
 */
export const workItems = sqliteTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    /** The session that delegated it, and that its reports go to. */
    parentInstanceId: sessionColumn("parent_instance_id").notNull(),
    /** Its one session. */
    instanceId: sessionColumn("instance_id").notNull(),
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
    projectId: projectColumn("project_id"),
    /**
     * Whose work it is (Caw on / Caw off): `you` when it began with
     * the person's words, whoever carries it out (a session's ask, an attempt
     * you start, what Caw starts in a turn your words are in); `event` when it
     * began with an event (the dispatcher, a routine, what Caw starts in a turn
     * an event woke); `kept` once you let Caw's `event` work finish as you
     * turned him off. A delegate's own delegates take its origin. Caw being
     * off stops only `event` work and its reports (work-items `reportees`,
     * caw-own.ts).
     */
    origin: storedEnum(WorkOriginSchema)("origin").notNull().default("you"),
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
     * person, a session (its parent's or a conversation's `stop_delegate`), the hub
     * (`why`), or a signal from outside. Null for any other end, and for a
     * cancel whose stopper the hub did not hear.
     */
    stoppedBy: storedJson(EndedBySchema)("stopped_by"),
    /**
     * Where its commits go once it finishes (landing.ts): onto the
     * workspace's base branch, to `cawco/<task or item>` on origin, to that
     * branch with a pull request, or nowhere.
     */
    lands: storedEnum(z.enum(LANDS_MODES))("lands").notNull().default("main"),
    /**
     * Its outputs as they were stored, when they were there and did not
     * read whole as they became {@link workItemOutputs} rows (migration
     * 0404): not JSON, not a list, or an entry that is not a path. Those
     * that read were placed. While set, its landing pushes nothing
     * (landing-run.ts `outputsUnreadRefused`): the hub cannot tell which of
     * its files were declared outputs, so none of them goes to its base.
     */
    outputsUnread: text("outputs_unread"),
    /**
     * What an attempt at a task was dispatched on, as it was stored, when it
     * was there and did not read whole as it became {@link workItemWaits}
     * rows (migration 0427): what of it read is placed, and each card or pin
     * its task waits on that no placed row names counts as possibly decided
     * differently since (tasks.ts `builtOnOf`, `tellMoved`).
     */
    waitsUnread: text("waits_unread"),
    /**
     * What its session handed in on its task (`task_result`): its words,
     * what to check, and its artifacts. A later call replaces it. Null:
     * none yet, or the item is no task's attempt.
     */
    taskResult: storedJson(AttemptResultSchema)("task_result"),
    /**
     * When the hub sent its task back to todo because Jev did not show its
     * acceptance criteria met (dispatch.ts `judgeCriteria`): its work stays
     * landed, and the task counts it as a failed attempt (tasks.ts
     * `lastAttemptFailed`), so dispatch does not start it again on its own
     * and its starter retries it or moves on. Null otherwise.
     */
    unmetAt: timestamp("unmet_at"),
    /**
     * The pull request its landing opened or found open, when it lands `pr`:
     * what a poller watches to move its task on when it merges.
     */
    prUrl: text("pr_url"),
    harness: storedEnum(z.enum(HARNESSES))("harness").notNull(),
    model: text("model"),
    effort: text("effort"),
    state: storedEnum(z.enum(WORK_ITEM_STATES))("state")
      .notNull()
      .default("starting"),
    /**
     * When the hub began landing it for a `finish_item` (its rebase, then the
     * push), while that runs. Set, the item is landing: a hub that starts
     * finds it here and runs the landing again on {@link submission}.
     */
    landingSince: timestamp("landing_since"),
    /**
     * Where its landing stands while {@link landingSince} is set
     * (stored-types.ts `LandingPhase`); null while it runs from the first.
     */
    landingPhase: storedEnum(LandingPhaseSchema)("landing_phase"),
    /**
     * When its session called `finish_item` (to land, or blocked) in the
     * turn still under way: that call is the turn's last step. While set, a
     * send from one who may reopen the item waits at the hub (work-items.ts
     * `finishingFor`). Released at that turn's end: its result, or, after a
     * hub restart that missed it, its machine's word at its register that
     * the session is between turns (work-items.ts `resumeLandings`).
     */
    lastTurnAt: timestamp("last_turn_at"),
    /**
     * Its session cannot be started again: its delegate type, its machine or
     * its account is missing ({@link ItemBlock}), and which. Live and
     * blocked, never failed for it: what it is sent waits at the hub, and it
     * shows in Needs you until the missing thing is back. Null otherwise,
     * with {@link workItems.blockedName} and {@link workItems.blockedSince}.
     */
    blockedKind: storedEnum(z.enum(ITEM_BLOCK_KINDS))("blocked_kind"),
    /** The missing thing as a person names it: the type's name, the machine's, the account's. */
    blockedName: text("blocked_name"),
    /** When the hub found it missing. */
    blockedSince: timestamp("blocked_since"),
    /**
     * Its block as it was stored, when it was there and did not read whole
     * as it became columns (migration 0412): not JSON, not an object, or a
     * field that is not its type. Nothing of it is placed, and the item is
     * blocked all the same: what it is sent waits at the hub, and its
     * session is not started again, until the sweep finds nothing it needs
     * missing (work-items.ts `unblockReady`) or a start finds what is
     * missing now and blocks it on that (`blockIfMissing`).
     */
    blockedUnread: text("blocked_unread"),
    /** A declared wait on work the delegate started; the hub wakes it at this time. */
    waitUntil: timestamp("wait_until"),
    waitReason: text("wait_reason"),
    /** Deadline plus grace while awaiting the harness's next turn read. */
    waitResumeBy: timestamp("wait_resume_by"),
    /**
     * When an interrupt stopped its turn, or the sweep found its session
     * asleep past its limit, while that holds it: nothing the hub sends on
     * its own (a quiet turn's reminder, a wait's end, a landing's
     * outcome, a rule's reply, another session's report) wakes it until its
     * parent, its project's conversation or the reader sends it something.
     */
    heldAt: timestamp("held_at"),
    /**
     * Set with {@link heldAt} when the hold is the sweep's, for a session
     * asleep past its limit (work-items.ts `blockAsleep`): its notice stands
     * in Needs you, and the word that ends the hold takes it down, across a
     * hub restart. Null for an interrupt's hold, and once the hold ends.
     */
    heldAsleepAt: timestamp("held_asleep_at"),
    /**
     * When a stop of its session was asked (tree-stops.ts), while its
     * machine has not confirmed the session ended: the item is held where
     * it stands. Nothing reports, retries, wakes or fails it, and it takes
     * its final state (`cancelled`, {@link stoppedBy} who) only once the end
     * is confirmed, after every delegate under it has ended.
     */
    stoppingAt: timestamp("stopping_at"),
    /**
     * Background work: started by a routine, or by a session in a turn an
     * event woke (its {@link origin} `event` where its parent's own work is
     * not). It outlives whoever asked: a stop of the session that asked, or
     * of any session above it, does not walk into it (tree-stops.ts).
     */
    background: integer("background", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * How many waits it declared since the last message handed to its parent
     * (work-items.ts `waitSummary`, `delivered`); 0: none.
     */
    waitCount: integer("wait_count").notNull().default(0),
    /**
     * The last of those waits once it is over: until when, and why. A live
     * wait is {@link waitUntil} and {@link waitReason}, which this takes as
     * the wait clears (project-work.ts `updateWorkItem`); null while a wait
     * is live, and while none was counted.
     */
    waitLastUntil: timestamp("wait_last_until"),
    waitLastReason: text("wait_last_reason"),
    /**
     * Its waits since the last delivered message as they were stored, when
     * they were there and did not read whole as they became
     * {@link waitCount}, {@link waitLastUntil} and {@link waitLastReason}
     * (migration 0426): none of it is placed, and its parent's next message
     * says its waits do not read (core work.ts `waitsUnread`). Cleared with
     * the count as a message is delivered.
     */
    waitHistoryUnread: text("wait_history_unread"),
    /** The `finish_item` the running landing answers, kept while it runs. */
    submission: storedJson(WorkItemSubmissionSchema)("submission"),
    /**
     * That `finish_item`'s `headline`: its outcome in one or two sentences,
     * what a glance at its report shows (the delegate tree, a routine's
     * project note). A routine's run reads its output contract here. Null
     * until then.
     */
    headline: text("headline"),
    /**
     * What its landing put where (stored-types.ts `WorkLanding`), kept when
     * it runs again: the commit pushed. Set, or {@link workItems}
     * `landedUnread` set, its work is landed (project-work.ts `landedWork`),
     * and a follow-up that ends without landing leaves it done (work-items.ts
     * `finish`). Both null: nothing of it landed.
     */
    landedSha: text("landed_sha"),
    /**
     * The base commit it was rebased onto (`onto..sha` landed on its base
     * branch); null for a push to a branch of its own, or nothing landed.
     */
    landedOnto: text("landed_onto"),
    /**
     * When it was pushed, for a push to a branch of its own: the newest is
     * the commit the hub's next push there leases on (landing-run.ts
     * `lastBranchPush`). Null on landings on the base, and on branch pushes
     * before 2026-10-19.
     */
    landedAt: timestamp("landed_at"),
    /**
     * Its landing as it was stored, when it was there and did not read whole
     * as landings became columns (migration 0400): not JSON, not an object,
     * or a field that is not its type. Its work is landed, so it is never
     * landed again; the fields that read are placed beside it, and it is
     * no branch push's lease.
     * A later landing of the item clears it.
     */
    landedUnread: text("landed_unread"),
    /**
     * Why it failed; on a done item, why the follow-up of its landed work
     * ended without landing (blocked, stopped, failed), what its task's
     * review shows.
     */
    error: text("error"),
    /**
     * Its last end was a blocked `finish_item`: the session could not go on
     * for something outside its control, the command and its error in
     * {@link error}. Set by that finish alone; a rerun clears it. Its state
     * says failed or, for landed work, done (work-items.ts `finish`).
     */
    endedBlocked: integer("ended_blocked", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: stampedNow("created_at"),
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
    /** What it may spend before the hub stops it; one that did not read stops it. */
    ...budgetColumns(),
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
    // The sweep's blocked items (work-items.ts `unblockReady`).
    index("work_items_blocked")
      .on(table.state)
      .where(
        sql`${table.blockedKind} IS NOT NULL OR ${table.blockedUnread} IS NOT NULL`
      ),
    // The live items' parents, by state, read off the index alone
    // (project-work.ts `runningDelegateCounts`, at every board publish).
    index("work_items_state").on(table.state, table.parentInstanceId),
  ]
);

/**
 * A work item's long words, one row per item, apart from its
 * {@link workItems} row: its brief, report, summary and group digest held
 * 3 to 7 KB an item each on average and up to 439 KB (the live hub,
 * 2026-11-19), mid-row, so each read of a column stored after them walked
 * their overflow pages, and a scan of `work_items` read 119 MB. An item's
 * row stays small; these are read by key (project-work.ts `workItemTexts`)
 * or joined to a read that needs them. The row goes with its item's.
 */
export const workItemTexts = sqliteTable("work_item_texts", {
  workItemId: text("work_item_id")
    .primaryKey()
    .references(() => workItems.id, { onDelete: "cascade" }),
  /** The brief it was started with. */
  brief: text("brief").notNull(),
  /**
   * The final report: the session's summary, the landing, commits and
   * findings, as the hub built them when it landed.
   */
  result: text("result"),
  /**
   * Its session's own words for what it did: the `summary` of the
   * `finish_item` that landed, its full report. Null until then.
   */
  summary: text("summary"),
  /**
   * What a group's combined report says of it: its summary and its landing
   * line, written when it lands.
   */
  digest: text("digest"),
});

/**
 * One session of a stop that walks a delegation tree (tree-stops.ts): every
 * delegate an orchestrator started ends before it, deepest first, and the
 * orchestrator last. A row stands from the stop's ask until its session's
 * end is confirmed by its machine and its item took its final state, so a
 * hub that restarts mid-stop carries it on.
 */
export const treeStops = sqliteTable(
  "tree_stops",
  {
    /** The session this row stops. */
    instanceId: sessionColumn("instance_id").primaryKey(),
    /** The session the stop was asked of: the top of the walk. */
    rootId: sessionColumn("root_id").notNull(),
    /** The session above it in the walk, whose end waits on this one's; null for the root. */
    parentId: sessionColumn("parent_id"),
    /** Who asked for the stop (core `EndedBy`). */
    by: storedJson(EndedBySchema)("by").notNull(),
    askedAt: timestamp("asked_at").notNull(),
    /** When its own end was asked of its machine: once every row under it was gone. */
    endedAt: timestamp("ended_at"),
  },
  (table) => [
    index("tree_stops_root").on(table.rootId),
    index("tree_stops_parent").on(table.parentId),
  ]
);

/**
 * A `delegate` call that waits because a live work item owns files it owns
 * too (work-items.ts): a chip in its parent's tray while it waits, it starts,
 * oldest first, when no live item overlaps it any more, its item taking this
 * row's id. Kept here across a hub restart.
 */
export const queuedWorkItems = sqliteTable(
  "queued_work_items",
  {
    /** The id its item takes when it starts (`queuedAs.id`). */
    id: text("id").primaryKey(),
    parentInstanceId: sessionColumn("parent_instance_id").notNull(),
    /**
     * The request as `delegate` made it (stored-types.ts `QueuedRequest`),
     * read whole; what the queue reads of it is its own columns: the task it
     * starts, the session id it stands under, the globs it owns. Null: held,
     * `request_unread` set.
     */
    request: storedJson(QueuedRequestSchema)("request"),
    /**
     * A request that was kept and did not read as a `QueuedRequest` when the
     * column gained its schema (migration 0405), as it was stored, `request`
     * null beside it. The delegate is held: it never starts, its parent is
     * told why once (`held_told_at`), and it waits in the tray until its
     * parent withdraws it.
     */
    requestUnread: text("request_unread"),
    /** When a held one's parent was told it is held (work-items.ts `startQueued`); null: not yet, or not held. */
    heldToldAt: timestamp("held_told_at"),
    /** The project of the task it starts (`task.projectId`); null for no task. */
    projectId: projectColumn("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    /** The task it starts (`task.id`), `tsk-…`. */
    taskId: text("task_id"),
    /** The session id it stands under while it waits (`queuedAs.instanceId`): minted, no row yet. */
    queuedInstanceId: sessionColumn("queued_instance_id").notNull(),
    title: text("title").notNull(),
    queuedAt: stampedNow("queued_at"),
  },
  () => [
    check(
      "queued_work_items_request_once",
      sql`(${sql.identifier("request")} IS NULL) <> (${sql.identifier("request_unread")} IS NULL)`
    ),
  ]
);

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

/**
 * Files in a work item's workspace, as paths from the clone's root, that the
 * hub copies into its project's folder (`assets/<task or item>/`) when it
 * finishes, one row each, in the order it declared them (rowid): its landing
 * passes over them, and one missing sends it back to its session. None: it
 * declared no outputs.
 */
export const workItemOutputs = sqliteTable(
  "work_item_outputs",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.path] })]
);

/**
 * What an attempt at a task was dispatched on (dispatch.ts): each card or
 * pin its task waited on, its own or its parts' chain's, and the value it
 * settled with then (task-waits.ts `value`), one row each, read in the order
 * kept (rowid). A card answered differently since is told by its value, not
 * its time. None: it waited on none.
 */
export const workItemWaits = sqliteTable(
  "work_item_waits",
  {
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    /** The wait as its task's file keeps it (core wait-targets.ts). */
    target: text("target").notNull(),
    value: text("value").notNull(),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.target] })]
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
    instanceId: sessionColumn("instance_id").notNull(),
    parentInstanceId: sessionColumn("parent_instance_id").notNull(),
    kind: storedEnum(z.enum(DELEGATE_EVENT_KINDS))("kind").notNull(),
    /** The permission request an ask and its answer share. Null on a report. */
    requestId: text("request_id"),
    toolName: text("tool_name"),
    requestKind: storedEnum(DelegateRequestKindSchema)("request_kind"),
    /**
     * What the kind carries, read whole: an ask's input, an answer, a
     * report's body; a report's turn identity is its own columns.
     */
    payload: storedJson(DelegateEventPayloadSchema)("payload").notNull(),
    /** A report's harness result id: the turn it reports (`completed_turns`). */
    resultId: text("result_id"),
    /** A report's turn's completion time, ISO, when its harness said it. */
    completedAt: text("completed_at"),
    /** An ask's own state; null on an answer and a report, which settle nothing. */
    status: storedEnum(DelegateAskStatusSchema)("status"),
    createdAt: stampedNow("created_at"),
  },
  (table) => [
    index("delegate_events_report").on(
      table.instanceId,
      table.kind,
      table.resultId
    ),
    // A parent's events: the paged read (newest first by id, which every
    // index entry carries after its key, so no sort), a continuation moving
    // pending asks, and a session's deletion.
    index("delegate_events_parent").on(table.parentInstanceId),
  ]
);

export const sentMessages = sqliteTable(
  "sent_messages",
  {
    /** The send's own uuid (`SentMessage.uuid`), the id it keeps everywhere. */
    uuid: text("uuid").primaryKey(),
    /** The session it went to. */
    instanceId: sessionColumn("instance_id").notNull(),
    acceptedAt: timestamp("accepted_at").notNull(),
    /** When its reader read it (`readSend`). Null until then. */
    readAt: timestamp("read_at"),
    /**
     * When the session replied after reading it (db `noteAnswered`): a turn's
     * closing words, its `send_to_user`, or the turn being stopped. Null
     * while it has no reply: hub db `personUnanswered`.
     */
    answeredAt: timestamp("answered_at"),
    /**
     * The id the harness stores the message under, where that is not the uuid
     * (opencode's message id, pi's entry id), as its adapter reported it
     * (`NeutralSystemMessage.storedAs`) — or, for a send Claude joined into
     * another's record, that record's uuid, as the hub found it. Null for a
     * Claude send stored under its own uuid.
     */
    harnessId: text("harness_id"),
    /** Records from before modes were kept were all ordinary turns to the reader. */
    mode: storedEnum(SendModeSchema)("mode").notNull().default("turn"),
    /**
     * Where the send stands. Records from before this column were all read by
     * the time it arrived: every one of them had been stored by its harness.
     */
    state: storedEnum(z.enum(SEND_STATES))("state").notNull().default("read"),
    /** Why it failed. */
    reason: text("reason"),
    /** What refused it, when the hub did (`StoredSendRefusal`): what its row offers to recover. */
    refusal: storedJson(StoredSendRefusalSchema)("refusal"),
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
     * The hub holds the send: accepted, and its machine not handed it yet.
     * Its session's start is held (its machine is installing an update), its
     * machine's agent is away within the grace a restart gets, or it is kept
     * for its session ({@link sentMessages.hold}). The record is `pending`,
     * which every screen draws as queued; {@link sentMessages.envelope} goes
     * once the hold ends, in the order accepted. False for every send its
     * machine has.
     */
    owedHeld: integer("owed_held", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * The owed envelope migration 0421 did not keep as
     * {@link sentMessages.envelope}, as stored: one that differed from the
     * envelope the send kept (a copy its machine handed back, the hub's
     * reminder and the person's presence folded into its words), or one that
     * did not read. Beside no kept envelope, an unreadable one leaves its
     * send owed with no envelope, never handed on. Written by 0421 alone;
     * null on every other send.
     */
    owedUnread: text("owed_unread"),
    /**
     * Why an owed send waits (stored-types.ts `SendHold`), written as
     * it is kept and again at each look that keeps it; each hold's words
     * name what releases it (`HOLD_WORDS`). Null once it is handed.
     */
    hold: storedEnum(SendHoldSchema)("hold"),
    /**
     * The send whole, as its machine is handed it (`HubEnvelope<"send">`),
     * kept while it is pending: a process that went away before reading it
     * leaves the hub what to hand the session's next process, and an owed
     * send ({@link sentMessages.owedHeld}) is handed this once its hold
     * ends. It is the send as last handed, before the hub's reminder and the
     * person's presence are folded in (sends.ts `presenced`), which every
     * hand does afresh: a send its machine handed back keeps it, never what
     * the machine returned. Null once the send is no longer pending, on a
     * keep-alive ping, which nothing hands on, and on an owed send that kept
     * none and whose owed envelope did not read at 0421
     * ({@link sentMessages.owedUnread}), which is never handed on.
     */
    envelope: storedJson(SendEnvelopeSchema)("envelope"),
    /**
     * Its current hand-off to its machine (`SendPayload.delivery`). A machine
     * handing a send back names the hand-off it was given; one that is not
     * this was overtaken by a later hand-off and is not owed again.
     */
    delivery: text("delivery"),
    /**
     * Who sent it (core `NeutralOrigin` `kind`: the person, a peer
     * session, the hub itself), written from its body with the body
     * (db/sends.ts `bodyColumns`), so a session's sends are found by it with
     * the body unread. Null when the body names none: a send from no one,
     * never the person's or a peer's.
     */
    originKind: text("origin_kind"),
    /** Its origin's `name` (a peer's, or the hub's own line, as `keepalive`), written as {@link sentMessages.originKind} is. */
    originName: text("origin_name"),
    /** A peer's session as it signed the send (`from`), written as {@link sentMessages.originKind} is. */
    originFrom: text("origin_from"),
  },
  (table) => [
    index("sent_messages_harness_id").on(table.harnessId),
    index("sent_messages_state").on(table.instanceId, table.state),
    index("sent_messages_origin").on(
      table.instanceId,
      table.originKind,
      table.acceptedAt
    ),
    // The person's words over every session in a time window (db/sends.ts
    // `personSaidIn`, a project's nightly memory run): with only the index
    // above, SQLite walked every send's entry of it to find his.
    index("sent_messages_origin_time").on(table.originKind, table.acceptedAt),
    // The sends still pending, oldest first, fleet-wide (db/sends.ts
    // `pendingSends`, `owedSessionsHeld`, `unkeptSends`): a handful of rows,
    // where `state` alone named every send the hub ever kept.
    index("sent_messages_pending")
      .on(table.acceptedAt)
      .where(sql`${table.state} = 'pending'`),
  ]
);

/**
 * What each send's sender submitted, pictures as media references
 * (`NeutralUserMessage`), by its send, apart from its {@link sentMessages}
 * row: 3.4 KB a send on average and 1 MB at most (the live hub,
 * 2026-11-19), and before the row's state, its hold and its envelope, so
 * each read of those walked its overflow pages. A send's row stays small
 * and its body is read by key with it (db/sends.ts `sendColumns`). The row
 * goes with its send's.
 */
export const sentMessageBodies = sqliteTable("sent_message_bodies", {
  uuid: text("uuid")
    .primaryKey()
    .references(() => sentMessages.uuid, { onDelete: "cascade" }),
  body: storedJson(NeutralUserMessageSchema)("body").notNull(),
});

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
  createdAt: stampedNow("created_at"),
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
  config: sealedJson(FleetMcpConfigSchema)("config").notNull(),
  authMode: storedEnum(McpAuthModeSchema)("auth_mode")
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
  scope: storedEnum(FleetScopeSchema)("scope"),
  projectId: fleetRowProject(),
  /** Bound to every project in one area instead (`fleetRowArea`). */
  areaId: fleetRowArea(),
  /**
   * It runs on every machine, whatever its platform (`FleetMcpServer.platforms`
   * absent). False: only a machine of a platform its
   * {@link mcpServerPlatforms} rows name is sent it (none, with none).
   */
  everyPlatform: integer("every_platform", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * Its platforms as they were stored, when they were there and did not
   * read whole as they became {@link mcpServerPlatforms} rows (migration
   * 0406): not JSON, not a list, or an entry that is not a platform. Those
   * that read were placed. While set it is sent to no machine
   * (`FleetMcpServer.platformsUnread`, core `mcpRunsOn`); a save that names
   * its platforms clears it.
   */
  platformsUnread: text("platforms_unread"),
  /**
   * One instance per machine for every session (`FleetMcpServer.shared`),
   * started at its first call, rather than one per session at its start.
   */
  shared: integer("shared", { mode: "boolean" }).notNull().default(false),
  createdAt: stampedNow("created_at"),
});

/**
 * The machine platforms an MCP server runs on when it does not run on every
 * one ({@link mcpServers.everyPlatform} false), one row each, in the order
 * it was saved with (rowid).
 */
export const mcpServerPlatforms = sqliteTable(
  "mcp_server_platforms",
  {
    serverName: text("server_name")
      .notNull()
      .references(() => mcpServers.name, { onDelete: "cascade" }),
    platform: storedEnum(McpPlatformSchema)("platform").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.serverName, table.platform] }),
    // Its columns by bare name, as every check's (migrations-check.ts
    // `qualifiedChecks`).
    check(
      "mcp_server_platforms_platform",
      sql`${sql.identifier("platform")} in ('darwin', 'linux', 'win32')`
    ),
  ]
);

/**
 * Private OAuth material. Only the hub's OAuth manager reads these rows. The
 * clients (which may hold a client secret), the tokens and a sign-in
 * under way's PKCE verifier are sealed; the sign-in's state, redirect and
 * expiry and the discovered metadata are plain.
 */
export const fleetMcpOauth = sqliteTable("fleet_mcp_oauth", {
  name: text("name").primaryKey(),
  generation: text("generation").notNull(),
  upstream: text("upstream").notNull(),
  resource: storedJson(OAuthProtectedResourceMetadataSchema)(
    "resource"
  ).notNull(),
  issuer: text("issuer").notNull(),
  metadata: storedJson(AuthorizationServerMetadataSchema)("metadata").notNull(),
  client: sealedJson(OAuthClientInformationFullSchema)("client"),
  tokens: sealedJson(OAuthTokensSchema)("tokens"),
  expiresAt: timestamp("expires_at"),
  /** The client the stored tokens were issued to; refreshing them must use that one. */
  tokenClient: sealedJson(OAuthClientInformationFullSchema)("token_client"),
  /**
   * A sign-in under way (fleet-mcp.ts `start`): the `state` its redirect
   * brings back, found by this column, null once it is taken or when none
   * is under way. Null with {@link fleetMcpOauth.pendingRedirectUri},
   * {@link fleetMcpOauth.pendingExpiresAt}, {@link fleetMcpOauth.pendingAccess}
   * and {@link fleetMcpOauth.pendingVerifier}. Its code is exchanged by
   * {@link fleetMcpOauth.client}, which the same write keeps.
   */
  pendingState: text("pending_state").unique(),
  /** Where that sign-in's redirect comes back to. */
  pendingRedirectUri: text("pending_redirect_uri"),
  /** When it lapses: no redirect after it is matched. */
  pendingExpiresAt: timestamp("pending_expires_at"),
  /** The access it asks for (core `ConnectAccess`), what {@link fleetMcpOauth.access} keeps once it lands; null: every scope the server names. */
  pendingAccess: storedEnum(ConnectAccessSchema)("pending_access"),
  /** Its PKCE verifier, the one secret of a sign-in under way: sealed. */
  pendingVerifier: sealedText("pending_verifier"),
  /**
   * A sign-in under way as it was stored before it became columns (migration
   * 0420), when it was there and did not read: it did not open with the
   * hub's key, or opened to something that is no sign-in. Kept sealed as it
   * was; nothing of it is placed, so no redirect matches it. A new sign-in
   * clears it.
   */
  pendingUnread: text("pending_unread"),
  lastOpenedAt: timestamp("last_opened_at"),
  /**
   * When the sign-in ended without the person (fleet-mcp.ts `#end`): the
   * token endpoint refused a refresh, or the server moved its authorization.
   * Null while signed in, and from the next sign-in on.
   */
  endedAt: timestamp("ended_at"),
  /** Why it ended, in the provider's own words where it gave any: Needs you's Show details. */
  endedWhy: text("ended_why"),
  /**
   * The access the last sign-in asked for (core `ConnectAccess`), kept past
   * its end: the next sign-in asks for it again. Null: every scope the
   * server names.
   */
  access: storedEnum(ConnectAccessSchema)("access"),
  /** As whom the provider signed the hub in (its ID token's email or name), kept past the sign-in's end. */
  identity: text("identity"),
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
    init: storedJson(z.record(z.string(), z.unknown()))("init").notNull(),
    usedAt: timestamp("used_at").notNull(),
  },
  (table) => [index("fleet_mcp_sessions_used").on(table.usedAt)]
);

/** The plugin marketplaces the fleet links, so their skills can be installed. */
export const marketplaces = sqliteTable("marketplaces", {
  name: text("name").primaryKey(),
  /** Whatever `claude plugin marketplace add` accepts, passed through verbatim. */
  source: text("source").notNull(),
  createdAt: stampedNow("created_at"),
});

/** A skill's or a plugin's fetched files and versions, as both tables keep them (new columns each call). */
const fetchedColumns = () => ({
  /** Null until a resolve succeeds; a machine writes only when this changes. */
  hash: text("hash"),
  bytes: integer("bytes"),
  /** Why the last resolve failed. A failed row is kept so the dashboard can say so. */
  error: text("error"),
  /**
   * Whether the row holds a resolve's files, each a row of its files table
   * ({@link skillFiles}, {@link pluginFiles}); false until a resolve
   * stores some.
   */
  filesHeld: integer("files_held", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The files as migration 0423's step found them stored, kept as they were
   * when they did not read (db/fleet-files-unread.ts): the row holds no
   * files, machines are sent its hash alone, and its listing says so, until
   * a fetch stores files again (a skill's kept value then goes into its
   * history).
   */
  filesUnread: text("files_unread"),
  /**
   * What the source held when last read (latest_*, checked_at) and why that
   * read failed (check_error), the version the stored files declare, and
   * what the last fetch of a row that had files came to (refresh_*,
   * FleetVersioned `lastRefresh`).
   */
  version: text("version"),
  refreshAt: timestamp("refresh_at"),
  refreshOutcome: storedEnum(FleetRefreshOutcomeSchema)("refresh_outcome"),
  refreshError: text("refresh_error"),
  refreshFromHash: text("refresh_from_hash"),
  refreshFromVersion: text("refresh_from_version"),
  refreshToHash: text("refresh_to_hash"),
  refreshToVersion: text("refresh_to_version"),
  /**
   * The last fetch as migration 0422 found it stored, kept as it was when
   * it did not read (db/fleet-refresh-unread.ts): no last fetch is said
   * until the next one.
   */
  refreshUnread: text("refresh_unread"),
  latestHash: text("latest_hash"),
  latestVersion: text("latest_version"),
  checkedAt: timestamp("checked_at"),
  checkError: text("check_error"),
});

/** The plugins the fleet installs, by the CLI's own `plugin@marketplace` id. */
export const plugins = sqliteTable("plugins", {
  id: text("id").primaryKey(),
  /** A disabled row is uninstalled from the machines, not merely switched off. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /**
   * The resolved content, the same way {@link skills} keeps it, and for the
   * same reason: the hub fetches a plugin once and every machine is sent the
   * bytes ({@link pluginFiles}). A row with no files is one the machines
   * still install the old way, by asking the CLI to go and get it.
   */
  ...fetchedColumns(),
  createdAt: stampedNow("created_at"),
});

/**
 * One file of a skill's or a plugin's resolved content (core `SkillFile`),
 * as the three files tables keep it: its path under the skill's or plugin's
 * directory, where it stood in the list its writer gave (the order the wire
 * carries it in), whether it is executable, and its bytes exactly as
 * fetched. The wire carries them as base64 (`contentBase64`), made from
 * these bytes.
 */
const fileColumns = () => ({
  path: text("path").notNull(),
  position: integer("position").notNull(),
  executable: integer("executable", { mode: "boolean" }).notNull(),
  content: blob("content", { mode: "buffer" }).notNull(),
});

/** A plugin's resolved files ({@link plugins} `files_held`), gone with the plugin and renamed with it. */
export const pluginFiles = sqliteTable(
  "plugin_files",
  {
    pluginId: text("plugin_id")
      .notNull()
      .references(() => plugins.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...fileColumns(),
  },
  (table) => [primaryKey({ columns: [table.pluginId, table.path] })]
);

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
  ...fetchedColumns(),
  /**
   * Bound to one project (`project`: `<checkout>/.claude/skills/<name>/`);
   * null for every machine (`~/.claude/skills/`). Placed at every checkout
   * and delegate workspace of the project, as a bound MCP server is.
   */
  scope: storedEnum(FleetScopeSchema)("scope"),
  projectId: fleetRowProject(),
  /** Bound to every project in one area instead (`fleetRowArea`). */
  areaId: fleetRowArea(),
  createdAt: stampedNow("created_at"),
});

/** A skill's resolved files ({@link skills} `files_held`), gone with the skill. */
export const skillFiles = sqliteTable(
  "skill_files",
  {
    skillName: text("skill_name")
      .notNull()
      .references(() => skills.name, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...fileColumns(),
  },
  (table) => [primaryKey({ columns: [table.skillName, table.path] })]
);

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
  updatedAt: stampedNow("updated_at"),
});
/** The one row of {@link fleetMemory}: there is one document, not a list. */
export const MEMORY_ID = "memory";

/** The fleet's user-scope CLAUDE.md — one row, one document (NEW.md §11). */
export const fleetMemory = sqliteTable("fleet_memory", {
  /** Always `memory`: the fleet has one, and a table with a key says so cheaply. */
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  /** sha256 hex of the content, which is what a machine compares before writing. */
  hash: text("hash").notNull(),
  updatedAt: stampedNow("updated_at"),
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
  role: storedEnum(z.enum(MEMORY_ROLES))("role"),
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
  updatedAt: stampedNow("updated_at"),
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
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    path: text("path")
      .notNull()
      .references(() => fleetMemoryDocs.path, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    handedAt: stampedNow("handed_at"),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.path] })]
);

/** The areas a scoped memory document reaches: every project in each, as read (core `inScopedProjects`). */
export const fleetMemoryDocAreas = sqliteTable(
  "fleet_memory_doc_areas",
  {
    path: text("path")
      .notNull()
      .references(() => fleetMemoryDocs.path, { onDelete: "cascade" }),
    areaId: areaKey(),
  },
  (table) => [primaryKey({ columns: [table.path, table.areaId] })]
);

/**
 * The projects a fleet memory document is scoped to, one row each: the
 * sessions in their checkouts and workspaces load it. A document whose last
 * project goes, goes with it (db/forget.ts `forget`), never widening to every
 * session.
 */
export const fleetMemoryDocProjects = sqliteTable(
  "fleet_memory_doc_projects",
  {
    path: text("path")
      .notNull()
      .references(() => fleetMemoryDocs.path, { onDelete: "cascade" }),
    projectId: projectKey(),
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
  createdAt: stampedNow("created_at"),
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
    machineId: machineColumn("machine_id").notNull(),
    harness: storedEnum(z.enum(USAGE_HARNESSES))("harness").notNull(),
    start: integer("start").notNull(),
    spanMs: integer("span_ms").notNull().default(HOUR_MS),
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
    updatedAt: stampedNow("updated_at"),
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
  machineId: machineColumn("machine_id").primaryKey(),
  /** The OpenCode Go plan's windows; null on a machine with no Go key. */
  openCodeGo: storedJson(OpenCodeGoLimitsSchema)("open_code_go"),
  fetchedAt: stampedNow("fetched_at"),
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
    kind: storedEnum(AccountKindSchema)("kind").notNull(),
    /** A nickname; null: the account goes by its identity's email. */
    label: text("label"),
    hue: storedEnum(z.enum(ACCOUNT_HUES))("hue").notNull(),
    order: integer("order").notNull(),
    neverBackup: integer("never_backup", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Its week's floor (core `Account.reservePct`); null: none. */
    reservePct: integer("reserve_pct"),
    /** Its 5-hour window's floor (core `Account.sessionReservePct`); null: none. */
    sessionReservePct: integer("session_reserve_pct"),
    /** What its sessions do at a plan limit while its extra usage is on (core `AtPlanLimit`). */
    atPlanLimit: storedEnum(AtPlanLimitSchema)("at_plan_limit")
      .notNull()
      .default("price"),
    /**
     * The identity (core `AccountIdentity`) its first sign-in reported: the
     * email, any case, the organization's name, and its id. Null until then;
     * the id also on a Claude account named before ids were read, until its
     * own login's next read fills it (accounts.ts `withOrgIdFrom`). One
     * identity, keyed on the email and the id, is one account of a provider
     * (core `sameIdentity`).
     */
    email: text("email"),
    organization: text("organization"),
    orgId: text("org_id"),
    /** Where its unfinished setup stands (core `AccountSetupStep`); null once done. */
    setupStep: storedEnum(z.enum(ACCOUNT_SETUP_STEPS))("setup_step"),
    /**
     * When the hub last checked, with one turn as the account, whether
     * Claude Code still refuses it account-wide (hub accounts.ts
     * `checkRefusal`); null when never. Kept here so a hub restart keeps
     * the hourly clock.
     */
    refusalCheckedAt: timestamp("refusal_checked_at"),
    createdAt: stampedNow("created_at"),
  },
  (table) => [
    index("accounts_identity").on(
      table.provider,
      sql`lower(${table.email})`,
      table.orgId
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
  why: storedEnum(RemovedAccountWhySchema)("why").notNull(),
});

/**
 * A removed account's store a machine still holds because a process there
 * still runs in it: the machine signs it out once none does (server.ts
 * `leaveAccounts`). Kept here so a hub restart still signs it out, and so a
 * connecting machine is not told to forget it under that process
 * (`unknownAccountsOf`).
 */
export const accountLeaves = sqliteTable(
  "account_leaves",
  {
    accountId: text("account_id").notNull(),
    machineId: machineColumn("machine_id").notNull(),
    /** The removed account's provider: which harness signs it out. */
    provider: text("provider").$type<AccountProvider>().notNull(),
    since: timestamp("since").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.machineId] })]
);

/**
 * A session a person's removal of its account (or sign-out of it on its
 * machine) left on no account, as no other could take it: stopped, its
 * line says so (limit-moves.ts `strandedStall`), until a launch of it is placed
 * on an account. `accountName` is the account as it was named then: a
 * removed one has no row left to name it by.
 */
export const strandedSessions = sqliteTable("stranded_sessions", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  accountName: text("account_name").notNull(),
  why: storedEnum(StrandedWhySchema)("why").notNull(),
  since: stampedNow("since"),
  /**
   * The account that left it, by id, and that account's provider; null on a
   * row stranded before 0444. A session left by a ChatGPT plan (core
   * `isChatgptPlan`) goes back on that plan alone, once it is signed in on
   * its machine again, and on no other (launch-accounts.ts `accountLaunch`).
   * No reference: a removed account's id stays named here.
   */
  accountId: text("account_id"),
  provider: text("provider").$type<AccountProvider>(),
});

/** Where each account is signed in, as each machine's agent last reported it. */
export const accountSignins = sqliteTable(
  "account_signins",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    machineId: machineColumn("machine_id").notNull(),
    state: storedEnum(SigninStateSchema)("state").notNull(),
    /** When a credential from one of the machine's own stores was moved into this account there; null for a sign-in made in CawCo. */
    movedAt: timestamp("moved_at"),
    /** The store it was moved from: `claude` (`~/.claude`), `pi` or `opencode` (their own `auth.json`). */
    movedFrom: storedEnum(z.enum(HARNESSES))("moved_from"),
    /** Why the hub signed it out itself: the refusal a session on it met (`AccountSignin.reason`); null otherwise. */
    reason: text("reason"),
    /** How far that refusal reaches (`AccountSignin.refusalReach`): `account` comes back on a check, `machine` on a sign-in; null with no reason. */
    refusalReach: storedEnum(RefusalReachSchema)("refusal_reach"),
    checkedAt: stampedNow("checked_at"),
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
    machineId: machineColumn("machine_id").notNull(),
    /** `claude` (`~/.claude`), `pi` or `opencode` (their own `auth.json`). */
    store: storedEnum(z.enum(HARNESSES))("store").notNull(),
    /** The provider's id in the store it leaves (OpenCode's `openai` for ChatGPT). */
    storeProvider: text("store_provider").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The identity the credential is signed in as (core `AccountIdentity`). */
    email: text("email").notNull(),
    organization: text("organization").notNull(),
    orgId: text("org_id"),
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
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  machineId: machineColumn("machine_id").notNull(),
});

/** Each provider's routing (core `ProviderRouting`); a provider with no row uses the defaults. */
export const accountRouting = sqliteTable("account_routing", {
  provider: text("provider").$type<AccountProvider>().primaryKey(),
  /** How the person's own sessions are placed ({@link StrategyChoice}). */
  yoursStrategy: storedEnum(z.enum(PLACEMENT_STRATEGIES))(
    "yours_strategy"
  ).notNull(),
  /** The account `pinned` names for them; null once it is removed, when the first by order stands in. */
  yoursPinned: text("yours_pinned").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /** How delegates are placed. */
  delegatesStrategy: storedEnum(z.enum(PLACEMENT_STRATEGIES))(
    "delegates_strategy"
  ).notNull(),
  delegatesPinned: text("delegates_pinned").references(() => accounts.id, {
    onDelete: "set null",
  }),
  /**
   * The provider's at-limit policy (core `AtLimit`), one column a field. A
   * provider never saved has no row and reads the default policy (core
   * `defaultRouting`); every save writes all nine fields and clears
   * `atLimitUnread`. Each is null only on a row whose policy did not read
   * when migration 0399 moved it out of JSON, where a field that did not
   * read stays null.
   */
  atLimitMove: integer("at_limit_move", { mode: "boolean" }),
  atLimitWaitMinutes: integer("at_limit_wait_minutes"),
  atLimitMoveWholeUnderK: integer("at_limit_move_whole_under_k"),
  atLimitStaleAfterHours: integer("at_limit_stale_after_hours"),
  compactionAtLimit: storedEnum(z.enum(COMPACT_METHODS))("compaction_at_limit"),
  /** What a move does with a cold cache (core `ColdMove`): whole by default. */
  compactionColdMove: storedEnum(z.enum(COLD_MOVES))("compaction_cold_move")
    .notNull()
    .default("whole"),
  compactionFileRoom: integer("compaction_file_room"),
  compactionSummarizerHarness: storedEnum(z.enum(HARNESSES))(
    "compaction_summarizer_harness"
  ),
  compactionSummarizerModel: text("compaction_summarizer_model"),
  /**
   * The policy as it was stored, when it did not read whole (migration 0399):
   * the hub acts on core `RESTRICTIVE_AT_LIMIT` while it is set, and names
   * it. Null when the policy reads. A save clears it.
   */
  atLimitUnread: text("at_limit_unread"),
});

/**
 * Each account's freshest limit reading: its provider's usage endpoint as a
 * machine it is signed in on read it (Claude's `api/oauth/usage` among them),
 * and what its sessions' Claude Code reported between reads
 * (`rate_limit_event`, `accountInfo()`), whichever machine they ran on.
 */
export const accountReadings = sqliteTable("account_readings", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  subscription: text("subscription"),
  /**
   * Whether the account was spending extra usage past its plan, as its last
   * report said (core `AccountOverage` `inUse`): null when no report said
   * its extra usage, the three columns after it null with it.
   */
  overageInUse: integer("overage_in_use", { mode: "boolean" }),
  /** Claude Code's `overageStatus`; null when it said none. */
  overageStatus: text("overage_status"),
  /** Claude Code's `overageDisabledReason`; null when it said none. */
  overageDisabledReason: text("overage_disabled_reason"),
  /** When the extra usage resets, ISO; null when nothing said. */
  overageResetsAt: text("overage_resets_at"),
  /**
   * Its extra usage as it was stored, when it was there and did not read
   * whole as it became columns (migration 0432): nothing of it is placed,
   * and the account reads as having said none, so its extra usage never
   * reads as on. Its next report that says it clears it.
   */
  overageUnread: text("overage_unread"),
  /**
   * A report has named the account's window set (core
   * `AccountReading.windowKinds`): its keys are the
   * {@link accountWindowSet} rows, none for an empty set. False until one
   * does: the windows held are all that is known.
   */
  windowSetNamed: integer("window_set_named", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The window set as it was stored, when it was there and did not read
   * whole as a list of keys as it became rows (migration 0432): none of it
   * is placed, and the set reads as never named, so no window counts as
   * known by it. The next report that names a set clears it.
   */
  windowSetUnread: text("window_set_unread"),
  lastSeenAt: timestamp("last_seen_at").notNull(),
});

/**
 * One key of an account's window set (core `AccountReading.windowKinds`,
 * core usage/windows.ts `windowSetKey`), as its provider's last report that
 * named the set carried it: a held window outside the set is gone. Read
 * only while {@link accountReadings.windowSetNamed}.
 */
export const accountWindowSet = sqliteTable(
  "account_window_set",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accountReadings.accountId, { onDelete: "cascade" }),
    windowKey: text("window_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.accountId, table.windowKey] })]
);

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
 * Each account's model catalog, as its Claude Code answered a probe's
 * initialize (hub accounts.ts `refreshCatalog`), and the effort each model ran at when a
 * session asked for none. Kept so a picker has the account's models with
 * nothing running, across agent and hub restarts.
 */
export const accountCatalogs = sqliteTable("account_catalogs", {
  accountId: text("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  models: storedJson(z.array(ModelInfoSchema))("models").notNull(),
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
 * What providers refused accounts, which a model the hub picks for a start
 * that picked none keeps off until it ends: a refusal for want of credit
 * (core `AccountCredit`), by the model provider it was for, `model` empty;
 * or one model not enabled for the account (core `AccountAccess`), by that
 * model, `provider` the one it bills to. A mark ends when a turn on its
 * provider (credit) or its model (access) succeeds, the account is signed
 * in again, or a person presses Check again on it.
 */
export const accountCredit = sqliteTable(
  "account_credit",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    /** The model an access mark is for; empty for a credit mark, which is the provider's. */
    model: text("model").notNull().default(""),
    reason: text("reason").notNull(),
    since: timestamp("since").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.provider, table.model] }),
  ]
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
 * another account can take them. `until` null: no reset was named (a
 * refused sign-in), and it waits for its account to be signed in again or
 * another to take it. `staleAt`: when the hold went stale, held past the
 * cutoff (core `AtLimit.staleAfterHours`): nothing carries it on until a
 * person or its parent writes; null while it is carried on. `laterTo` and
 * `laterWhy`: the move it waits to make once the work its process holds for
 * later ends (nobody waits on it, so nothing ends that work for the move):
 * the account it goes to, and that work in its machine's words; null when
 * it waits for no such work.
 */
export const limitHolds = sqliteTable("limit_holds", {
  instanceId: sessionColumn("instance_id").primaryKey(),
  /** The account at its limit. */
  accountId: text("account_id").notNull(),
  until: timestamp("until"),
  staleAt: timestamp("stale_at"),
  laterTo: text("later_to"),
  laterWhy: text("later_why"),
  createdAt: stampedNow("created_at"),
});

/**
 * Sessions whose latest turn a usage limit ended (server.ts, at the turn's
 * `result`: Claude Code's `rate_limit` error or a `rejected` limit with no
 * extra usage, a pi or OpenCode turn its agent marked `atLimit`), on any
 * harness and account, the machine's own sign-in included, whatever the
 * at-limit controller then did with it (a hold, a move, nothing). The next
 * turn that ends any other way takes the row away; a turn under way since
 * `at` (`instances.turnOpenAt`) has carried it on already (db at-limit.ts
 * `standingStops`). `accountId`: the account that refused it; null for the
 * machine's own sign-in.
 */
export const limitStops = sqliteTable("limit_stops", {
  instanceId: sessionColumn("instance_id").primaryKey(),
  accountId: text("account_id"),
  at: timestamp("at").notNull(),
});

/**
 * What a move ended with a session's process (core `MoveEnded`), from its
 * machine's answer until the session is told on its new account (server.ts
 * `tellEndedByMove`, at its next launch): a hub restart in between keeps it.
 */
export const moveEndings = sqliteTable("move_endings", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  ended: storedJson(MoveEndedSchema)("ended").notNull(),
  createdAt: stampedNow("created_at"),
});

/**
 * The background tasks a Claude session's process is running now, as its
 * CLI last listed them (its `background_tasks_changed`, replaced whole each
 * time, ambient ones left out), each kept from when the hub first heard of
 * it. A process restarted or killed takes them with it, and Claude Code
 * restores none on resume: the session is told each was interrupted, its
 * outcome unknown, with its output so far (cut-turns.ts `tellCutTasks`).
 */
export const sessionTasks = sqliteTable(
  "session_tasks",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    taskId: text("task_id").notNull(),
    /** Its kind as Claude Code names it: `local_bash`, `monitor`, `local_agent`, … */
    type: text("type").notNull(),
    description: text("description").notNull(),
    /** When the hub first heard of it. */
    since: timestamp("since").notNull(),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.taskId] })]
);

/**
 * A move a session owes to its next launch (server.ts `owedMoves`): a
 * person's, rebalance's or the at-limit controller's move to another
 * account, or a relaunch its model's change of provider asked
 * (`to_account_id` null). Kept here, the one record of it, so a hub restart
 * carries it out: at the session's turn's end, or as its machine registers
 * (`takeUpMovesOn`). `waits` says what it waits on: `turn`, the turn's end;
 * `machine`, its machine connected again. Gone once carried, replaced by a
 * newer move, or with the session's row.
 */
/** Every kind of carry-on an owed move keeps (db/owed-moves.ts `OwedCarry`), as its column does. */
export const OWED_CARRY_KINDS = ["limit", "signin", "model"] as const;
/** Why a session must leave its account (hub-shapes.ts `MoveOffWhy`): its sign-in refused, the account removed, or signed out on its machine. */
export const MOVE_OFF_WHYS = ["refused", "removed", "signed-out"] as const;

export const owedMoves = sqliteTable("owed_moves", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  toAccountId: text("to_account_id").references(() => accounts.id, {
    onDelete: "cascade",
  }),
  /** A person asked for it: the at-limit controller only carries it out. */
  byHand: integer("by_hand", { mode: "boolean" }).notNull().default(false),
  /** The line written once it lands; null for none. */
  move: storedJson(AccountMoveSchema)("move"),
  waits: storedEnum(OwedMoveWaitSchema)("waits").notNull(),
  /**
   * A model a person picked while the move waits, checked against the
   * account it lands on: the row takes it as the move lands. Null for none.
   */
  pickedModel: text("picked_model"),
  /**
   * What the session is told once the move lands (db/owed-moves.ts
   * `OwedCarry`): to carry on past its limit (`limit`) or its refused
   * sign-in (`signin`), or to answer its refused first turn on the model the
   * move lands it on (`model`, its line in `carryLine`). Null for nothing.
   */
  carryOn: text("carry_on", { enum: OWED_CARRY_KINDS }),
  /** With `carryOn` `model`: the session's transcript line for the move. */
  carryLine: text("carry_line"),
  /**
   * A marker, not a move (hub decide.ts): the session must leave its
   * account (hub-shapes.ts `MoveOffWhy`: its sign-in refused, the account
   * removed or signed out on its machine), and where it goes is decided as
   * the move is carried out. Null for any other row.
   */
  leave: text("leave", { enum: MOVE_OFF_WHYS }),
  createdAt: stampedNow("created_at"),
});

/**
 * The setting picks held for a session's process that may still run on a
 * machine that is away (setting-picks.ts `HeldPicks`), one row per session,
 * each column the latest pick of its setting; null for one not held. Kept
 * here so a hub that restarts while the machine is away still sends them
 * to the process as the machine registers again. The row goes once each
 * pick is applied, the process is gone, or the session's next launch takes
 * them (launches.ts `withHeldPicks`), and with the session's row.
 */
export const heldPicks = sqliteTable("held_picks", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  model: text("model"),
  effort: storedEnum(z.enum(EFFORT_LEVELS))("effort"),
  permissionMode: storedEnum(z.enum(WIRE_PERMISSION_MODES))("permission_mode"),
  /**
   * With `permissionMode`: the mode the process ran in as the first mode
   * was held (its row's then; null for none), which says whether the pick
   * enters Bypass or Full Send and so relaunches it.
   */
  runsMode: text("runs_mode"),
  createdAt: stampedNow("created_at"),
});

/**
 * A session's compaction plan (server.ts `compactions`), its steps going
 * first and alone, everything else sent to it waiting at the hub meanwhile:
 *
 * - a move's (`kind` `move`), at its account's limit or ahead of one, that
 *   compacts it (core `AccountMove` `moved` with `compact`), from the move
 *   until its compaction has ended: its filing turn (`filing`, the send
 *   `filingUuid`), then its harness's `/compact` (`compacting`, the send
 *   `compactUuid`);
 * - its filing at its context threshold (`kind` `fill`, core
 *   `Compaction.fileAtPct`): the filing turn alone, no `/compact`
 *   (`compactUuid` null), its harness compacting it later on its own.
 *
 * Kept here so a hub restart carries it on from where its sends stand.
 */
/** What a compaction plan is for (schema `limit_compactions.kind`): a move's, or a filing's at the threshold. */
export const LIMIT_COMPACTION_KINDS = ["move", "fill"] as const;

export const limitCompactions = sqliteTable(
  "limit_compactions",
  {
    instanceId: sessionColumn("instance_id").primaryKey(),
    /** `carrying`: its carry-on answers the turn its limit refused, before it files anything. */
    stage: storedEnum(LimitCompactionStageSchema)("stage").notNull(),
    /**
     * Its line, said again as it goes: a move's `limit_events` id, or a
     * filing's `session_lines` id (kind `context`).
     */
    lineId: text("line_id").notNull(),
    /**
     * What the plan is for: a move's (`move`, its line in the `move_`
     * columns), or a filing's at the threshold (`fill`, its reading in the
     * `fill_` columns).
     */
    kind: storedEnum(z.enum(LIMIT_COMPACTION_KINDS))("kind").notNull(),
    /**
     * A move's line as written (core `AccountMove` `moved`), which each stage
     * restates, without what the columns below hold: the row mapper puts
     * those back (db at-limit.ts). Null for a filing's, and beside
     * {@link limitCompactions.moveUnread}.
     */
    move: storedJson(CompactionMoveBodySchema)("move"),
    /** The account a move's line moves the session to (its `to`); null with {@link limitCompactions.move}. */
    moveToAccountId: text("move_to_account_id"),
    /** The move's compaction runs where it is, before the move (its line's `compactFirst`); null with {@link limitCompactions.move}. */
    moveCompactFirst: integer("move_compact_first", { mode: "boolean" }),
    /** A person asked for the move (its line's `asked`); null with {@link limitCompactions.move}. */
    moveAsked: integer("move_asked", { mode: "boolean" }),
    /**
     * Claude Code refused the credential it moved from (its line's `because`
     * `refused`), so its carry-on speaks of a sign-in; null with
     * {@link limitCompactions.move}.
     */
    moveRefused: integer("move_refused", { mode: "boolean" }),
    /**
     * A move's line as it was stored, when it was there and did not read
     * whole: as kinds became a column (migration 0410: not JSON, not an
     * object, or a kind that is not one of a line's), or as the plan's move
     * became columns (migration 0429: a line that is not a `moved` one, or
     * that does not read whole as one), with its kind put back. Nothing of it
     * is placed, and the plan reads as none: it drives no move and holds
     * nothing back (db at-limit.ts `toCompaction`). A put of the session's
     * plan clears it.
     */
    moveUnread: text("move_unread"),
    /** Where a filing's harness compacts the session on its own, in tokens (core `ContextFill`); null for a move's. */
    fillCompactsAt: integer("fill_compacts_at"),
    /** The session's context a filing fired at, in tokens; null for a move's. */
    fillTokens: integer("fill_tokens"),
    /**
     * A filing's reading as it was stored, when it was there and did not read
     * whole as the plan's reading became columns: nothing of it is placed,
     * and the plan reads as none, as one whose move does not read. A put of
     * the session's plan clears it.
     */
    fillUnread: text("fill_unread"),
    /**
     * What the session's records held as its filing at the threshold started
     * (core `FiledRecords`), which what the filing wrote is counted against as
     * its turn ends; null for a move's, and when they could not be read.
     */
    records: storedJson(FiledRecordsSchema)("records"),
    /** Its carry-on's send, when its limit or sign-in stopped it: the first step. */
    carryUuid: text("carry_uuid"),
    filingUuid: text("filing_uuid").notNull(),
    /** Its `/compact`'s send; null for a filing at the threshold, which sends none. */
    compactUuid: text("compact_uuid"),
    /** Claude Code said its compaction boundary after the `/compact` went: it compacted. */
    compacted: integer("compacted", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * The step (its send's uuid) whose turn's end the hub heard, the turn's
     * result read after its send was: the stored frame a hub that restarts
     * before the next step went moves the compaction on from (server.ts
     * `recoverCompaction`). Null until a step's turn ends.
     */
    endedStep: text("ended_step"),
    /**
     * A model a person picked to go with a move's compaction (owed_moves
     * `picked_model` as the move was taken up): the row takes it only as the
     * move lands, so one that never does leaves it running what it ran.
     * Null for none, and for a filing's.
     */
    picked: text("move_picked_model"),
    createdAt: stampedNow("created_at"),
  },
  () => [
    // Its columns by bare name, as every check's (migrations-check.ts
    // `qualifiedChecks`).
    check(
      "limit_compactions_kind",
      sql`${sql.identifier("kind")} in ('move', 'fill')`
    ),
  ]
);

/**
 * A session whose context came within its compaction policy's `fileRoom` of
 * its harness's compaction point since its harness last compacted it (core
 * context-filing.ts): one per session,
 * written as its filing turn at the threshold is sent and kept after it
 * ends, so one rise files once; any compaction boundary its harness says
 * takes it away, re-arming the threshold (compaction.ts `observeCompaction`).
 * A harness's compaction that failed after its boundary writes it back
 * (`lineId` that compaction's line), so a session that cannot compact is
 * not asked to file every turn.
 */
export const contextRises = sqliteTable("context_rises", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  /** The `session_lines` id (kind `context`) of the line that says it: its filing's, else the failed compaction's. */
  lineId: text("line_id").notNull(),
  at: timestamp("at").notNull(),
});

/**
 * A session its harness compacted that has answered no request of its own
 * since (compaction.ts `observeCompaction`): written at every compaction
 * boundary, a move's included, and taken away by the session's next answer
 * of its own (a top-level assistant message that is no compaction summary).
 * While it stands no filing starts: the compaction's own turn (a
 * `/compact`'s, whose result reports what the compaction left, as pi's
 * `estimatedTokensAfter`) files nothing new, its records just listed back to
 * it; the first filing after a boundary is due once a turn of the session's
 * own work has ended within the room.
 */
export const contextCompactions = sqliteTable("context_compactions", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  /** When its harness said the boundary. */
  at: timestamp("at").notNull(),
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
    instanceId: sessionColumn("instance_id").notNull(),
    at: timestamp("at").notNull(),
    /**
     * What the line says the hub did (core `AccountMove` `kind`), found by
     * it in SQL; null only beside {@link limitEvents.moveUnread}.
     */
    kind: storedEnum(z.enum(ACCOUNT_MOVE_KINDS))("kind"),
    /** The rest of the line, put back with its kind by the row mapper (db at-limit.ts); null with {@link limitEvents.kind}. */
    body: storedJson(AccountMoveBodySchema)("body"),
    /**
     * The line as it was stored, when its kind did not read as kinds became
     * a column (migration 0410): not JSON, not an object, or a kind that is
     * not one of a line's. Nothing of it is placed: it is in no transcript,
     * and a read of a session's newest line that meets it reads a line it
     * cannot say (db at-limit.ts `LimitLine`), which drives no move. The
     * line said again under its id clears it.
     */
    moveUnread: text("move_unread"),
  },
  (table) => [
    index("limit_events_instance_kind").on(table.instanceId, table.kind),
  ]
);

/**
 * Every limit reading that said something new, kept as a series so burn RATE is
 * observable and not just burn LEVEL: the account's reading is overwritten on
 * every report, and can answer "am I at 39%?" but never "how fast did I get
 * there?".
 *
 * One row per window per CHANGE, not per reading: an integer percent moves
 * maybe 100 times a day, and every report in between repeats it.
 * hub db/accounts.ts `putReading` diffs against the previous reading and
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
 * One row per window period of an account (a window's readings that share
 * one reset minute, core `resetMinute`; 0 for a window that names no
 * reset): its first and latest reading that moved it, and the weighted
 * tokens (turn-weight.ts `weightedTokens`) and dollars of the turns
 * recorded on the account between them. The turns recorded after its latest
 * reading wait in `pending*` and join the period at its next reading. Kept
 * as readings and turns arrive (db usage-periods.ts), so a window's pace and
 * what a percent of it costs are read from a handful of rows (forecast.ts),
 * never from days of {@link usageLimitHistory} and {@link turnUsage}.
 */
export const usagePeriods = sqliteTable(
  "usage_periods",
  {
    accountId: text("account_id").notNull(),
    kind: text("kind").notNull(),
    /** Its scope's label ("Fable"); "" for a window over every model. */
    scopeLabel: text("scope_label").notNull(),
    /** Its reset, epoch ms rounded to the minute; 0 for none named. */
    resetMinute: integer("reset_minute").notNull(),
    firstAt: timestamp("first_at").notNull(),
    firstPercent: integer("first_percent").notNull(),
    lastAt: timestamp("last_at").notNull(),
    lastPercent: integer("last_percent").notNull(),
    tokens: real("tokens").notNull(),
    usd: real("usd").notNull(),
    pendingTokens: real("pending_tokens").notNull(),
    pendingUsd: real("pending_usd").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.accountId,
        table.kind,
        table.scopeLabel,
        table.resetMinute,
      ],
    }),
    index("usage_periods_account_last_idx").on(table.accountId, table.lastAt),
  ]
);

/**
 * Each reading that moved a window period of {@link usagePeriods}: its
 * percent, and the weighted tokens and dollars of the turns recorded on the
 * account from the period's first reading up to this one. A period that
 * opened before a reader's look-back is read from its first mark inside it
 * (db usage-periods.ts `periods`), as a read of the history from that moment
 * would: a single keyed row, never the series.
 */
export const usagePeriodMarks = sqliteTable(
  "usage_period_marks",
  {
    accountId: text("account_id").notNull(),
    kind: text("kind").notNull(),
    scopeLabel: text("scope_label").notNull(),
    resetMinute: integer("reset_minute").notNull(),
    at: timestamp("at").notNull(),
    percent: integer("percent").notNull(),
    tokens: real("tokens").notNull(),
    usd: real("usd").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.accountId,
        table.kind,
        table.scopeLabel,
        table.resetMinute,
        table.at,
      ],
    }),
    // Retention prunes by age alone.
    index("usage_period_marks_at_idx").on(table.at),
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
    instanceId: sessionColumn("instance_id").notNull(),
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
     * price. OpenCode and pi: the sum of each request's own price at the
     * model's list rates and its prompt's tier, as the agent sent it. Null
     * when unpriced.
     */
    costUsd: real("cost_usd"),
    keepAlive: integer("keep_alive", { mode: "boolean" }).notNull(),
    /**
     * What started the turn, as the send it read names its origin: `human`,
     * `peer`, `keepalive`, `system:<name>` for the hub's own word (a recap,
     * a filing turn, a carry-on), or another harness kind. Null on rows
     * written before it was kept, and for a turn no send started.
     */
    origin: text("origin"),
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
 * Every tool call a machine's gateway relayed under an idempotency key, and
 * its answer once it has one (tool-call-keys.ts): a call sent again under
 * the same key is answered this, never run again. Kept
 * `TOOL_CALL_KEY_KEPT_MS` past its last change.
 */
export const toolCallKeys = sqliteTable(
  "tool_call_keys",
  {
    /** The key, with the caller's credential and the route, hashed. */
    id: text("id").primaryKey(),
    /** `interrupted`: running in the hub's last process when it ended. */
    state: storedEnum(ToolCallKeyStateSchema)("state").notNull(),
    /** The answer's status, headers (as pairs) and body, once answered. */
    status: integer("status"),
    headers: storedJson(z.array(z.tuple([z.string(), z.string()])))("headers"),
    body: blob("body", { mode: "buffer" }),
    /** When it was taken, then when it was answered. */
    at: timestamp("at").notNull(),
  },
  (table) => [index("tool_call_keys_at_idx").on(table.at)]
);

/**
 * Every turn the hub cut, and why (core turn-cuts.ts): the owner's Stop, a
 * session's interrupt_delegate, a machine's pause. A transcript built at any
 * time says the cause on the call and the line the cut ended, where its
 * harness wrote "rejected" or "aborted" (transcripts.ts `cuts`).
 */
export const turnCuts = sqliteTable(
  "turn_cuts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    /** When the hub sent the interrupt. */
    at: timestamp("at").notNull(),
    /** Its cause as a line reads it: "your Stop", "obelisk's pause until 20:53". */
    cause: text("cause").notNull(),
    /** The calls running as it came, by their harness's id: a failed answer to one is the cut's. */
    calls: storedJson(z.array(z.string()))("calls").notNull(),
  },
  (table) => [index("turn_cuts_instance").on(table.instanceId, table.at)]
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
  matchKind: storedEnum(RuleMatchKindSchema)("match_kind")
    .notNull()
    .default("phrase"),
  caseSensitive: integer("case_sensitive", { mode: "boolean" })
    .notNull()
    .default(false),
  wholeWord: integer("whole_word", { mode: "boolean" })
    .notNull()
    .default(false),
  /** Whether the rule reads the session's answer, its reasoning, or both. */
  watch: storedEnum(RuleWatchSchema)("watch").notNull().default("text"),
  reply: text("reply").notNull(),
  /** `turn` wakes an idle session, `message` queues, `immediate` sends mid-stream. */
  timing: storedEnum(RuleTimingSchema)("timing").notNull().default("turn"),
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
  scopeMachineId: machineColumn("scope_machine_id"),
  /**
   * The project it fires in. The rule goes with its project, never widened
   * to every project, and follows it into the project a merge folds it into.
   */
  scopeProjectId: projectColumn("scope_project_id").references(
    () => projects.id,
    {
      onDelete: "cascade",
    }
  ),
  /**
   * The area it fires in: every project in it, as read. It goes with its
   * area, never widened to every project.
   */
  scopeAreaId: text("scope_area_id").references(() => areas.id, {
    onDelete: "cascade",
  }),
  /** The harness it fires on. */
  scopeHarness: storedEnum(z.enum(HARNESSES))("scope_harness"),
  /** A model name it fires on, matched as a substring in any case. */
  scopeModel: text("scope_model"),
  /** The role of the sessions it fires on: `orchestrator` or `leaf` (roles.ts `memoryRoleOf`). */
  scopeRole: storedEnum(z.enum(MEMORY_ROLES))("scope_role"),
  /** The delegate type the sessions it fires on were started as, by name. */
  scopeDelegateType: text("scope_delegate_type"),
  /** Turns of sessions this meaning rule was not judged on, because Jev did not answer in time. */
  unjudgedTurns: integer("unjudged_turns").notNull().default(0),
  /** Why the last of them went unjudged, in words. */
  lastUnjudgedWhy: text("last_unjudged_why"),
  createdAt: stampedNow("created_at"),
  updatedAt: stampedNow("updated_at"),
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
    instanceId: sessionColumn("instance_id").notNull(),
    status: storedEnum(RuleStateStatusSchema)("status")
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
 * A deleted config item, kept whole for its undo window (JOURNEY.md Flow 5:
 * "an undo affordance after the fact rather than a confirm dialog before
 * it"): its row and every row that hangs off it (a rule's sessions'
 * standing, an MCP server's sign-in, a document's projects), as the driver
 * read them, so a restore puts back every column, dates and sealed secrets
 * as they were. Out of the live tables, so nothing that reads them sees it
 * while it waits. It belongs to no project: one whose project or area went
 * while it waited is refused its Undo (db/trash.ts `unbound`), never
 * brought back bound to nothing. The id is what the dashboard's Undo names.
 */
export const configTrash = sqliteTable("config_trash", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: storedEnum(TrashKindSchema)("kind").notNull(),
  /** The item's own key: a rule's id, a skill's name, a document's path. */
  key: text("key").notNull(),
  /** The item's own table first, then what hangs off it, in insert order. */
  rows: storedJson(z.array(TrashedRowsSchema))("rows").notNull(),
  deletedAt: timestamp("deleted_at").notNull(),
});

/**
 * Each comment you wrote on a task under an id your device chose for it
 * (POST /api/projects/:id/tasks/:taskId/comments `id`), once it is
 * committed: the same comment sent again after its answer was lost is the
 * one already written, and nothing is added (tasks.ts `comment`). Gone with
 * its project.
 */
export const taskCommentIds = sqliteTable("task_comment_ids", {
  id: text("id").primaryKey(),
  projectId: projectKey(),
  taskId: text("task_id").notNull(),
  saidAt: timestamp("said_at").notNull(),
});

/** What a hook does and where, as {@link fleetHooks} and its history keep it (new columns each call). */
const hookColumns = () => ({
  event: text("event").notNull(),
  matcher: text("matcher"),
  handler: storedJson(HookHandlerSchema)("handler").notNull(),
  /** A command hook's script body, written to every machine that gets this hook. */
  script: text("script"),
  /** sha256 hex of the material a machine compares before writing. */
  hash: text("hash").notNull(),
  scope: storedEnum(FleetScopeSchema)("scope"),
  projectId: projectColumn("project_id"),
  /** Bound to every project in one area instead (core `FleetPlacement.areaId`). */
  areaId: text("area_id"),
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
  ...hookColumns(),
  /** Its project (`fleetRowProject`); the history keeps it unchecked. */
  projectId: fleetRowProject(),
  /** Bound to every project in one area instead (`fleetRowArea`). */
  areaId: fleetRowArea(),
  createdAt: stampedNow("created_at"),
  updatedAt: stampedNow("updated_at"),
});

/**
 * The fleet's Claude Code settings, OpenCode plugins and pi extensions (core
 * harness-config.ts), one row per kind and name, every field stored as
 * `harnessConfigProblem` passed it. `scope`/`projectId` place a row as an MCP
 * server's do: the hub fills in each place's `cwd` as it sends a machine its
 * config. A row's `settings` are sealed, as an MCP server's config is: a
 * settings `env` carries keys.
 */
export const fleetHarnessConfig = sqliteTable("fleet_harness_config", {
  /** `<kind>:<name>`: one key for its writes and its trash entry. */
  id: text("id").primaryKey(),
  kind: storedEnum(z.enum(HARNESS_CONFIG_KINDS))("kind").notNull(),
  name: text("name").notNull(),
  /** A disabled row stays here and is placed nowhere. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Claude Code settings. Null for the other kinds, and when the hub's key does not open it. */
  settings: sealedJson(z.record(z.string(), z.unknown()))("settings"),
  /** An OpenCode plugin's or pi extension's source. */
  module: text("module"),
  /** An OpenCode plugin's or pi extension's npm package, `<name>@<version>`. */
  package: text("package"),
  scope: storedEnum(FleetScopeSchema)("scope"),
  projectId: fleetRowProject(),
  /** Bound to every project in one area instead (`fleetRowArea`). */
  areaId: fleetRowArea(),
  createdAt: stampedNow("created_at"),
  updatedAt: stampedNow("updated_at"),
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
  ...hookColumns(),
  /** `fleet` for every version today — a hook is never edited from a machine. */
  source: text("source").notNull(),
  createdAt: stampedNow("created_at"),
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
  /**
   * The version's files as migration 0423's step found them stored, or a
   * skill's kept so when a fetch replaced them, as they were when they did
   * not read (db/fleet-files-unread.ts): the version holds no files
   * ({@link skillVersionFiles}) and is not restored.
   */
  filesUnread: text("files_unread"),
  /** `fleet` for the hub's own row; `machine:<machineId>` for an edited copy an overwrite took off it. */
  source: text("source").notNull(),
  createdAt: stampedNow("created_at"),
});

/** A kept skill version's files, gone with the version. */
export const skillVersionFiles = sqliteTable(
  "skill_version_files",
  {
    versionId: integer("version_id")
      .notNull()
      .references(() => fleetSkillHistory.id, { onDelete: "cascade" }),
    ...fileColumns(),
  },
  (table) => [primaryKey({ columns: [table.versionId, table.path] })]
);
/** The one row of {@link supervisorConfig}. */
export const SUPERVISOR_CONFIG_ID = "supervisor";

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
   * When the fleet's stream relay was last offered on a new project's setup
   * page and answered (a machine picked, or Later); null while never, so the
   * page offers it (stream-relay.ts `relayCard`). Settings › Browsers is where it is
   * finished afterwards.
   */
  relayAskedAt: timestamp("relay_asked_at"),
  /**
   * The permission mode the hub starts a project's conversation in, for
   * every project that names none (caw.ts `modeFor`). Null: the mode the
   * person last chose for its harness on its machine.
   */
  cawMode: storedEnum(z.enum(PERMISSION_MODES))("caw_mode"),
  /**
   * Whether sessions use CawCo's delegates or their agent's own subagents
   * (core own-tools.ts `Helpers`), sent to every machine with the denied
   * tools. Null until a person chooses, so the first run asks; a session
   * then starts on CawCo's delegates.
   */
  helpers: storedEnum(z.enum(HELPERS))("helpers"),
  /**
   * Whether sessions keep CawCo's plan list or their agent's own to-do list
   * and plan mode (core own-tools.ts `StepLists`), as {@link helpers} is.
   */
  stepLists: storedEnum(z.enum(STEP_LISTS))("step_lists"),
  updatedAt: stampedNow("updated_at"),
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
/** The one row of {@link spendSettings}. */
export const SPEND_SETTINGS_ID = "spend";

/**
 * The fleet's spend settings — one row, keyed `'spend'`, following the
 * {@link supervisorConfig} single-row precedent: what reaching a project's
 * spend cap does where the project sets nothing (project-caps.ts). No row
 * reads as its defaults.
 */
export const spendSettings = sqliteTable("spend_settings", {
  /** Always `'spend'`. */
  id: text("id").primaryKey(),
  onCap: storedEnum(OnCapSchema)("on_cap").notNull().default("both"),
});
/** The one row of {@link imageSettings}. */
export const IMAGE_SETTINGS_ID = "images";

/**
 * The fleet's image default (core `ImageSettings`) — one row, keyed
 * `'images'`, following the {@link spendSettings} precedent: the provider a
 * `generate_image` call that names none goes to, and its model (null: the
 * provider's default). No row reads as core's `DEFAULT_IMAGE_SETTINGS`.
 */
export const imageSettings = sqliteTable("image_settings", {
  /** Always `'images'`. */
  id: text("id").primaryKey(),
  provider: storedEnum(z.enum(IMAGE_PROVIDERS))("provider").notNull(),
  model: text("model"),
});
/** The one row of {@link sessionLimits}. */
export const SESSION_LIMITS_ID = "session";

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
 * The fleet's passkey relay settings — one row, keyed `'passkey'`,
 * following the {@link spendSettings} precedent: whether the relay is
 * enabled across the fleet. No row reads as disabled.
 */
export const passkeySettings = sqliteTable("passkey_settings", {
  /** Always `'passkey'`. */
  id: text("id").primaryKey(),
  /** Whether passkey relay is enabled fleet-wide. */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
});

/** The one row of {@link decidesSettings}. */
export const DECIDES_ID = "decides";

/**
 * The fleet's Who decides (core decides.ts) — one row, keyed `'decides'`,
 * following the {@link spendSettings} precedent: what the person changed of
 * the built-in members (the Advisor's and Common practice's delegate types,
 * how he hears of their answers, the flock's pictures), and when he last
 * read the decision surface's catch-up. No row reads as core's seed. Each
 * kind's member across the fleet is a {@link decidesRoutes} row.
 */
export const decidesSettings = sqliteTable("decides_settings", {
  /** Always `'decides'`. */
  id: text("id").primaryKey(),
  /**
   * The fleet's routes as they were stored, when they were there and did
   * not read whole as they became {@link decidesRoutes} rows (migration
   * 0406): not JSON, not an object, or a member that is not text. Those
   * that read were placed. While set, every kind goes to `you` (db
   * decides.ts `fleet`), never to core's seed; a save of the routes clears
   * it.
   */
  routesUnread: text("routes_unread"),
  /** The Advisor's delegate type; null: `advisor`. */
  advisor: text("advisor"),
  /** Common practice's delegate type; null: `research`. */
  practice: text("practice"),
  /** How he hears of the Advisor's answers; null: core `BUILT_IN`'s, or `each` beside {@link decidesSettings.hearUnread}. */
  advisorHear: storedEnum(z.enum(HEARS))("advisor_hear"),
  /** How he hears of Common practice's answers; null: core `BUILT_IN`'s, or `each` beside {@link decidesSettings.hearUnread}. */
  practiceHear: storedEnum(z.enum(HEARS))("practice_hear"),
  /**
   * How he hears of the two, as it was stored, when it was there and did not
   * read whole as it became columns (migration 0430): not JSON, not an
   * object, or a value that is not one of core `HEARS`. What read is placed
   * beside it; a member left null hears `each` while it is set, so no
   * answer is kept from him that he did not choose to hear later (db
   * decides.ts `builtIns`). A save that sets both clears it.
   */
  hearUnread: text("hear_unread"),
  /** Caw's chosen pose; null: core `DEFAULT_POSES`'s. */
  cawPose: storedEnum(z.enum(CAW_POSE_IDS))("caw_pose"),
  /** The Advisor's chosen pose; null: its default. */
  advisorPose: storedEnum(z.enum(CAW_POSE_IDS))("advisor_pose"),
  /** Common practice's chosen pose; null: its default. */
  practicePose: storedEnum(z.enum(CAW_POSE_IDS))("practice_pose"),
  /** The agent's (the asker's) chosen pose; null: its default. */
  askerPose: storedEnum(z.enum(CAW_POSE_IDS))("asker_pose"),
  /**
   * The poses as they were stored, when they were there and did not read
   * whole as they became columns (migration 0430): what read is placed
   * beside it, and each other member wears its default pose. A save that
   * sets all four clears it.
   */
  picturesUnread: text("pictures_unread"),
  /** When he last read the catch-up of answers he hears of later (the decision surface's). */
  caughtUpAt: timestamp("caught_up_at"),
});

/**
 * A member of Who decides the person added (core decides.ts `Member`): an
 * agent, which runs as the fleet delegate type of the same name; people and
 * channels come with their connections. The built-in members are never
 * rows.
 */
export const decidesMembers = sqliteTable("decides_members", {
  /** The name's slug, and the delegate type's name. */
  id: text("id").primaryKey(),
  type: text("type", { enum: ["agent", "person", "channel"] }).notNull(),
  name: text("name").notNull(),
  job: text("job").notNull(),
  subject: text("subject").notNull(),
  /** One of the eight identity marks, 1–8. */
  hue: integer("hue").notNull(),
  hear: text("hear", { enum: HEARS }).notNull(),
  /** An agent's fleet delegate type; null for a person or channel. */
  delegateType: text("delegate_type"),
  createdAt: stampedNow("created_at"),
});

/**
 * A kind of choice (core decides.ts `Kind`): the six built in, seeded as the
 * hub opens its database (db/decides.ts), and those the person added. A
 * built-in kind is renamed in place, never removed.
 */
export const decidesKinds = sqliteTable("decides_kinds", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** The one line agents read to file a choice under it. */
  example: text("example").notNull(),
  builtIn: integer("built_in", { mode: "boolean" }).notNull().default(false),
  position: integer("position").notNull(),
});

/**
 * Each kind's member across the fleet that the person set (core
 * `FleetDecides.routes`): one row per kind, checked against the members and
 * kinds at every write (decides.ts). A kind with no row goes to core's seed
 * (`DEFAULT_ROUTES`), else `you`. The member is no foreign key: the
 * built-in members are never rows, and one he removes sends its kinds to
 * `you` (db decides.ts `removeMember`).
 */
export const decidesRoutes = sqliteTable("decides_routes", {
  kindId: text("kind_id")
    .primaryKey()
    .references(() => decidesKinds.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull(),
});

/**
 * Where the hub sent a decision card (settling.ts), one row per card, the
 * ledger the decision surface's record reads: the member it went to
 * (`route`: `advisor`, `practice`, `caw`, an added agent's id, or `you` when
 * it came to him), the session that settles it (a run the hub started, or
 * Caw's conversation), and when it was settled and taken back. A card that
 * came to him started no run, and carries the line that says why
 * (`signed`).
 */
export const cardSettlings = sqliteTable(
  "card_settlings",
  {
    artifactId: text("artifact_id").notNull(),
    card: text("card").notNull(),
    /** The member's id. */
    route: text("route").notNull(),
    /** The member's session for it; null when it came to him. */
    instanceId: sessionColumn("instance_id"),
    /** The run's work item; null for Caw's conversation or a card that came to him. */
    workItemId: text("work_item_id"),
    /** The session that wrote the card. */
    askedBy: sessionColumn("asked_by").notNull(),
    createdAt: timestamp("created_at").notNull(),
    /** The line a card that came to him carries: "Mira can't be reached until Slack or email is connected". */
    signed: text("signed"),
    settledAt: timestamp("settled_at"),
    takenBackAt: timestamp("taken_back_at"),
    /** The kind it was filed under. */
    kind: text("kind"),
  },
  (table) => [primaryKey({ columns: [table.artifactId, table.card] })]
);
/** The one row of {@link toolUpdateSettings}. */
export const TOOL_UPDATES_ID = "tools";

/**
 * What the fleet does with a machine's copy of a tool at a version CawCo
 * does not run (core `ToolUpdates`) — one row, keyed `'tools'`, following
 * the {@link spendSettings} precedent. No row reads as core's
 * `TOOL_UPDATES_DEFAULT`, "update".
 */
export const toolUpdateSettings = sqliteTable("tool_update_settings", {
  /** Always `'tools'`. */
  id: text("id").primaryKey(),
  updates: storedEnum(z.enum(TOOL_UPDATES))("updates")
    .notNull()
    .default("update"),
});

/** The one row of {@link fleetWatchSettings}. */
export const FLEET_WATCH_ID = "fleet-watch";

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
 * Fleet watch's needs-you notices (core `FleetWatchNotice`): a triage told
 * you, or a session in a project whose Caw is off showed two signals. One
 * per session; gone when you act on the session or it moves on.
 */
export const fleetWatchNotices = sqliteTable("fleet_watch_notices", {
  instanceId: sessionColumn("instance_id").primaryKey(),
  id: text("id").notNull(),
  machineId: machineColumn("machine_id").notNull(),
  projectId: projectColumn("project_id"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  at: timestamp("at").notNull(),
});
/** The one row of {@link openrouterConnection}. */
export const OPENROUTER_CONNECTION_ID = "openrouter";

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
/** The one row of {@link jevSettings}. */
export const JEV_SETTINGS_ID = "jev";

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
 * Each skill, tool and MCP server a session called, per day: how many calls
 * and when its last one was. Counted by the hub from the frames it relays
 * (usage-count.ts `UsageCounter`), every harness's in one neutral shape, and
 * backfilled once from the hub machine's Claude transcripts. Ranks composer
 * suggestion candidates (summed over sessions) and answers which skills and
 * servers each role called (capability-calls.ts).
 *
 * `instanceId` is not a foreign key: a deleted session's calls still rank
 * suggestions. A backfilled call whose conversation is no session of the
 * hub's (one run from a terminal) is kept under `''`.
 */
export const capabilityCalls = sqliteTable(
  "capability_calls",
  {
    instanceId: sessionColumn("instance_id").notNull(),
    kind: storedEnum(z.enum(CAPABILITY_KINDS))("kind").notNull(),
    /** A skill's name, a tool's, or an MCP server's as its tools' `mcp__<server>__` prefix writes it. */
    name: text("name").notNull(),
    /** The hub's local date, `YYYY-MM-DD`. */
    day: text("day").notNull(),
    count: integer("count").notNull(),
    /** The newest call that day. */
    lastAt: timestamp("last_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.instanceId, table.kind, table.name, table.day],
    }),
    // The window a count reads, and what suggestions read since a day.
    index("capability_calls_day").on(table.day),
  ]
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
export const continuations = sqliteTable(
  "continuations",
  {
    id: text("id").primaryKey(),
    sourceInstanceId: sessionColumn("source_instance_id").notNull(),
    /** The request as asked, and its inputs as read then (continuations.ts). */
    request: storedJson(ContinueRequestSchema)("request").notNull(),
    prepared: storedJson(PreparedContinuationSchema)("prepared").notNull(),
    /** The summariser answering now; a resumed job may have replaced it. */
    summariserInstanceId: sessionColumn("summariser_instance_id"),
    /** Minted when the job is: the new session is started under this id. */
    targetInstanceId: sessionColumn("target_instance_id").notNull(),
    /** The send the opening goes out as, so it is sent once whatever restarts. */
    openingUuid: text("opening_uuid").notNull(),
    /** The summariser's answer, kept once read so a restart never asks again. */
    summary: text("summary"),
    /** The source's Open items section (open-items.ts), read from its records once before the opening goes. */
    openItems: text("open_items"),
    stage: storedEnum(ContinuationJobSchema.shape.stage)("stage").notNull(),
    error: text("error"),
    /**
     * Who asked for it (stored-types.ts `ContinuationAsker`), by kind: a
     * person's own Continue starts a separate session; anything else's
     * continuation is folded into one session with its source once its
     * opening has gone (continuations.ts `foldContinued`), and a move's is
     * its source's move while it runs (limit-moves.ts `moveJobOf`).
     */
    askedByKind: storedEnum(
      z.enum([
        "person",
        "session",
        "task",
        "move",
      ] as const satisfies readonly ContinuationAsker["kind"][])
    )("asked_by_kind")
      .notNull()
      .default("person"),
    /** The session or task that asked, for `session` and `task`; null otherwise. */
    askedById: text("asked_by_id"),
    /** A move's own fields, for `move`; null otherwise. */
    askedByMove: storedJson(MoveAskerSchema)("asked_by_move"),
    /**
     * The asker as a hub before migration 0414 stored it, when it did not
     * read whole: the job is then the person's (`asked_by_kind`), so it is
     * neither folded nor a move, and an open one fails as the hub starts
     * (continuations.ts `unreadAskersFail`). Null on every row written since.
     */
    askedByUnread: text("asked_by_unread"),
    /**
     * While the job waits (`waiting`): since when the job has waited, the
     * bound counting from then (continuations.ts `waitStep`), the work in
     * flight its source's process holds, which ending it would lose (core
     * `CONTROL_WORK_IN_FLIGHT`), and since when that has run (null when not
     * known). `waiting_from` and `waiting_why` are null together, when the
     * job does not wait.
     */
    waitingFrom: integer("waiting_from"),
    waitingSince: integer("waiting_since"),
    waitingWhy: text("waiting_why"),
    /**
     * The wait as a hub before migration 0414 stored it, when it did not
     * read whole: none of it placed, so the job's bound counts from when it
     * next looks, never sooner. Null on every row written since.
     */
    waitingUnread: text("waiting_unread"),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    // A session's move job, and whether a job folds, by its asker's kind.
    index("continuations_source_asker").on(
      table.sourceInstanceId,
      table.askedByKind
    ),
  ]
);

/** The lines a session's machine says about it, which the hub keeps as said. */
export type MachineLineKind = Extract<
  SessionLineKind,
  "limit" | "outdated" | "room"
>;

/**
 * Lines the hub writes into a session's transcript, each where it happened,
 * one row each: when, and what it says. `limit` and `watch` keep their last
 * few (db `LIMIT_NOTES_KEPT`, `WATCH_LINES_KEPT`), in the order written
 * (rowid).
 */
export const sessionLines = sqliteTable(
  "session_lines",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    kind: storedEnum(SessionLineKindSchema)("kind").notNull(),
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
 * Where each of the hub's own lines stands in a session's transcript (an
 * account move, a line its machine said, fleet watch's, a fresh start), by
 * the line's block id: after the rows it followed when it was first placed,
 * the nearest first (core `HubLine`). Written as the line first lands, live
 * or in a read that placed it by its clock (one written before this table,
 * or while its transcript could not be read), and read by every read after,
 * so a line stands where it was first shown however the transcript is read
 * again (history.ts `readHistory`).
 */
export const lineAnchors = sqliteTable(
  "line_anchors",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    /** The line's block id: `limit-<event>`, a machine line's or a watch line's id, `fresh-start-<instance>`. */
    lineId: text("line_id").notNull(),
    /** The ids of the rows before it when first placed, the nearest first. */
    after: storedJson(z.array(z.string()))("after").notNull(),
  },
  (table) => [primaryKey({ columns: [table.instanceId, table.lineId] })]
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
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => instances.id, { onDelete: "cascade" }),
    /** Its place, oldest first. */
    ord: integer("ord").notNull(),
    sessionId: text("session_id").notNull(),
    harness: storedEnum(z.enum(HARNESSES))("harness").notNull(),
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
 * The ids a session had before the hub folded its continuations into it:
 * each continuation anything but the person's own Continue asked for
 * (continuations.ts `foldContinued`), and those a hub before migration 0128 started
 * at an account's limit. Each is one session, under the id of the one that
 * runs (`instanceId`). Anything that names a former id — a link, a tab, a
 * session's memory of its parent — is that session. `folded`: the former
 * row's data has been moved onto it and the row is gone, or ends first
 * (db `foldContinued`, `foldFormerSessions`).
 */
export const instanceAliases = sqliteTable("instance_aliases", {
  id: sessionColumn("id").primaryKey(),
  instanceId: sessionColumn("instance_id").notNull(),
  folded: integer("folded", { mode: "boolean" }).notNull().default(false),
});

/**
 * The hub's one-time migrations over the rows it keeps, by name, once each
 * has run (db/tag-markers.ts): a row here is its rows migrated, and it never
 * runs again.
 */
export const dataMigrations = sqliteTable("data_migrations", {
  name: text("name").primaryKey(),
  at: timestamp("at").notNull(),
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
    projectId: projectKey(),
    stage: storedEnum(MoveStageSchema)("stage").notNull(),
    /**
     * Everything the job has learned and decided, as moves.ts keeps it
     * (`MoveState`), read and written whole, but what its columns hold: the
     * machines it names, its session's id, its parked ask and whether it
     * was approved. Null when the state a hub before migration 0415 stored
     * did not read whole (`state_unread`).
     */
    learned: storedJson(
      MoveStateShape.omit({
        sourceMachineId: true,
        targetMachineId: true,
        stopOn: true,
        targetInstanceId: true,
        askId: true,
        approved: true,
      })
    )("learned"),
    /**
     * The session the move starts (`MoveState.targetInstanceId`): its row is
     * held under this id from the move's start (moves.ts `holds`). Null only
     * on a state that did not read whole and named none.
     */
    targetInstanceId: sessionColumn("target_instance_id"),
    /** The ask parked for the person's "Move it" (`MoveState.askId`); null when none was. */
    askId: text("ask_id"),
    /** The person said "Move it" (`MoveState.approved`). */
    approved: integer("approved", { mode: "boolean" }).notNull().default(false),
    /**
     * The state as a hub before migration 0415 stored it, when it did not
     * read whole: the job is no move the hub runs, shows, answers or
     * cancels; the session row it names stays held, never woken, and is
     * marked failed as the hub starts (moves.ts `resume`). Null on every row
     * written since.
     */
    stateUnread: text("state_unread"),
    /** The machine the project moves from (`MoveState.sourceMachineId`). */
    sourceMachineId: machineColumn("source_machine_id").notNull(),
    /** The machine it moves to (`MoveState.targetMachineId`). */
    targetMachineId: machineColumn("target_machine_id").notNull(),
    /** A Cancel the machine running its step has not heard yet: told at its register. */
    stopOn: text("stop_on"),
    /** The request as asked: the target and the spawn New session sent, its harness named. */
    request: storedJson(NamedMoveRequestSchema)("request").notNull(),
    createdAt: timestamp("created_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [
    index("moves_machines").on(table.targetMachineId, table.sourceMachineId),
    index("moves_stop_on").on(table.stopOn),
    index("moves_target_instance").on(table.targetInstanceId),
    index("moves_ask").on(table.askId),
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
/** The one row of {@link pairingSettings}. */
export const PAIRING_ID = "pairing";

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
  kind: storedEnum(DeviceKindSchema)("kind").notNull(),
  createdAt: timestamp("created_at").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  /** The address it was last seen at. */
  lastAddress: text("last_address"),
});

/**
 * Host mode's preview passes (preview-access.ts): one per browser that
 * entered, each keyed by the sha256 of its cookie's token, which went to the
 * browser once and is kept nowhere here (OWASP Session Management: "store a
 * one-way verifier instead"). A pass names the paired device whose ticket
 * opened it and goes with that device: unpaired, or every device forgotten
 * as pairing turns off. One with no device is a trusted hub's browser,
 * known by its pass alone; those go as pairing turns on. A session's own
 * pass (`artifact_browse`) names its session, and goes with that session.
 * Which origins a pass opens is `opens_every` and its rows in
 * {@link previewPassOrigins}, never its session: the person's opens every
 * one, a session's those its rows name.
 */
export const previewPasses = sqliteTable(
  "preview_passes",
  {
    id: text("id").primaryKey(),
    /** sha256 of the cookie's token, hex. */
    tokenHash: text("token_hash").notNull().unique(),
    deviceId: text("device_id").references(() => ownerDevices.id, {
      onDelete: "cascade",
    }),
    /** The session a scoped pass was given to; null for the person's own. */
    instanceId: sessionColumn("instance_id").references(() => instances.id, {
      onDelete: "cascade",
    }),
    /** The person's pass, which opens every preview origin; a session's opens only the origins its {@link previewPassOrigins} rows name. */
    opensEvery: integer("opens_every", { mode: "boolean" })
      .notNull()
      .default(false),
    /**
     * A session's scope that did not read as a list of origin keys when it
     * became rows (migration 0409), as it was stored: the pass opens no
     * origin (`opens_every` false, no rows), and its browser enters again
     * with a fresh ticket.
     */
    scopeUnread: text("scope_unread"),
    createdAt: timestamp("created_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    /** Its absolute end, from its entry: never moved by use. */
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    index("preview_passes_device_id_idx").on(table.deviceId),
    index("preview_passes_instance_id_idx").on(table.instanceId),
  ]
);

/** The preview origins (their keys) a session's pass opens, one row each (preview-access.ts `passOf`). */
export const previewPassOrigins = sqliteTable(
  "preview_pass_origins",
  {
    passId: text("pass_id")
      .notNull()
      .references(() => previewPasses.id, { onDelete: "cascade" }),
    originKey: text("origin_key").notNull(),
  },
  (table) => [primaryKey({ columns: [table.passId, table.originKey] })]
);

/**
 * The key each machine the person admitted proves itself with (hub-auth.ts),
 * sealed: the machine answers a nonce with it at every connection, so the
 * hub needs the key itself, never a hash. Emptied when pairing is turned off.
 */
export const machineKeys = sqliteTable("machine_keys", {
  machineId: machineColumn("machine_id").primaryKey(),
  key: sealedText("key").notNull(),
  admittedAt: timestamp("admitted_at").notNull(),
});

/**
 * The asks the push outlet took (push.ts `onAsk`), by request id: each ask
 * is one moment for the person's phone, however often it is parked again
 * (a design proposal as the hub starts). Gone as its wait ends: its ask
 * settles (a browser taken over is no end: its call waits on until it is
 * handed back), or, for an ask that ended with the hub that took it, as the
 * next hub starts.
 */
export const askPushes = sqliteTable("ask_pushes", {
  requestId: text("request_id").primaryKey(),
  takenAt: timestamp("taken_at").notNull(),
});

/**
 * Notifications a device was shown and nobody has cleared yet
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
/** The one row of {@link presenceSettings}. */
export const PRESENCE_ID = "person";

/**
 * The person's Appear away (notifications.ts), one row keyed `'person'`:
 * on until they turn it off, through a reload or the hub's restart; and
 * their last away stretch, so a restart neither ends it nor starts one.
 * Only the switch, when it was turned on and the one stretch are kept,
 * never a history.
 */
export const presenceSettings = sqliteTable("presence_settings", {
  /** Always `'person'`. */
  id: text("id").primaryKey(),
  appearAway: integer("appear_away", { mode: "boolean" }).notNull(),
  /** When Appear away was turned on; null while it is off. */
  appearAwayAt: timestamp("appear_away_at"),
  /** The last away stretch began: their last input, the lock, or Appear away. */
  awaySince: timestamp("away_since"),
  /** It ended: their input after it; null while they are still away. */
  backAt: timestamp("back_at"),
  /** The person's away clock, ms; null keeps their pick (core `AWAY_AFTER_DEFAULT_MS`). */
  awayAfterMs: integer("away_after_ms"),
  /** The sessions already given that return's recap, by id. */
  recapped: storedJson(z.array(z.string()))("recapped").notNull().default([]),
});

/**
 * Each device's last word on the person (notifications.ts): a tab, an app
 * install, a machine's desktop through its agent, or a send from a device
 * that names none (`send`). Kept so the hub's restart changes nothing the
 * person did: their last input, and the chat it was on, read back as they
 * were. One row per device, its last word only, never a history; a device
 * silent a day is dropped.
 */
export const presenceClients = sqliteTable("presence_clients", {
  /** The client's own presence id; the machine's id for a machine. */
  clientId: text("client_id").primaryKey(),
  kind: storedEnum(PresenceKindSchema)("kind").notNull(),
  /** The chat it had in front. */
  sessionId: text("session_id"),
  /** That chat was in front and read (visible, focused). */
  active: integer("active", { mode: "boolean" }).notNull(),
  /** Every chat drawn while its page was visible, focused or not (`PresenceBeat.showing`). */
  showing: storedJson(z.array(z.string()))("showing").notNull().default([]),
  alerts: integer("alerts", { mode: "boolean" }).notNull(),
  /** A phone or tablet. */
  handheld: integer("handheld", { mode: "boolean" }).notNull(),
  /** The machine it is, or runs on, as the hub tied it; null when no one machine is. */
  machineId: machineColumn("machine_id"),
  /** The person's last input on it, on the hub's clock; null when it never said. */
  inputAt: timestamp("input_at"),
  /** A tab's computer's last input, as its Idle Detection reads it; null while it reads none. */
  deskInputAt: timestamp("desk_input_at"),
  /** Its machine's word: active, idle, locked or asleep. */
  machine: storedEnum(MachineStateSchema)("machine"),
  lockedAt: timestamp("locked_at"),
  /** What read a machine's desktop, for the log. */
  source: text("source"),
  /** The client's own clock when it said this, epoch ms. */
  saidAt: integer("said_at").notNull(),
  /** When the hub heard it. */
  at: timestamp("at").notNull(),
});
/** The one row of {@link findSettings}. */
export const FIND_SETTINGS_ID = "person";

/**
 * The person's Find settings (find-secrets.ts), one row keyed `'person'`,
 * following the {@link presenceSettings} precedent. No row reads as the
 * default: secrets hidden until the person turns it off.
 */
export const findSettings = sqliteTable("find_settings", {
  /** Always `'person'`. */
  id: text("id").primaryKey(),
  /** A secret in Find's results is drawn as dots until the person shows it. */
  hideSecrets: integer("hide_secrets", { mode: "boolean" }).notNull(),
  changedAt: timestamp("changed_at").notNull(),
});

/**
 * A machine whose desktop counts toward whether the person is here
 * (notifications.ts): the person turned it on in the presence menu. No row
 * is off: a machine's activity counts only once they opt it in.
 */
export const presenceDevices = sqliteTable("presence_devices", {
  machineId: machineColumn("machine_id").primaryKey(),
  counts: integer("counts", { mode: "boolean" }).notNull(),
});

/**
 * "Make this a project" (project-offers.ts): the one offer a plain session
 * gets when it outgrows itself. A row means it was offered, so it is never
 * offered again; `answer` stays null while the offer stands.
 */
export const projectOffers = sqliteTable("project_offers", {
  instanceId: sessionColumn("instance_id").primaryKey(),
  /** Which signal made it: `delegates`, `days`, `plan` or `repo`; `caw` when Caw asked in conversation. */
  reason: storedEnum(ProjectOfferReasonSchema)("reason").notNull(),
  /** The sentence the offer says, naming why. */
  line: text("line").notNull(),
  offeredAt: timestamp("offered_at").notNull(),
  answer: storedEnum(ProjectOfferAnswerSchema)("answer"),
  answeredAt: timestamp("answered_at"),
  /** The project accepting made or joined. */
  projectId: projectColumn("project_id"),
});

/**
 * Caw asking first to build a design system (design-offers.ts): one row per
 * project, written when he asks, so he asks once. `answer` stays null while
 * the card stands; `dismissed` (Not now) means he never asks again unless
 * the person does.
 */
export const designOffers = sqliteTable("design_offers", {
  projectId: projectColumn("project_id").primaryKey(),
  /** The task whose move into an active stage raised it. */
  taskId: text("task_id").notNull(),
  offeredAt: timestamp("offered_at").notNull(),
  answer: storedEnum(DesignOfferAnswerSchema)("answer"),
  answeredAt: timestamp("answered_at"),
  /** The "Build the design system" task Build filed. */
  builtTaskId: text("built_task_id"),
});

/**
 * Caw's suggestion of the unused skills and servers routine (unused-trim.ts),
 * one row per project once the person answered it: `on` (Turn on, or the
 * fleet switch) or `dismissed` (Not now). Either way it is never suggested
 * again in that project, removing the routine included.
 */
export const trimOffers = sqliteTable("trim_offers", {
  projectId: projectColumn("project_id").primaryKey(),
  answer: storedEnum(TrimOfferAnswerSchema)("answer").notNull(),
  answeredAt: timestamp("answered_at").notNull(),
});

/**
 * What the person kept listed by rejecting a trim proposal (unused-trim.ts):
 * the routine never proposes it for that set again. `set` is `project:<id>`
 * for a project's own set, `type:<name>` for a delegate type's, `fleet` for
 * what the fleet-level run proposes turning off.
 */
export const trimKept = sqliteTable(
  "trim_kept",
  {
    set: text("set").notNull(),
    kind: storedEnum(StartingSetKindSchema)("kind").notNull(),
    name: text("name").notNull(),
    keptAt: timestamp("kept_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.set, table.kind, table.name] })]
);

/**
 * Git LFS offered for the large files a place's first commit left out
 * (lfs-offers.ts): one row per offer, written as it is made. `answer` stays
 * null while the card stands; `tracked` once its files are committed
 * through LFS (`commit`), `dismissed` for Not now.
 */
export const lfsOffers = sqliteTable("lfs_offers", {
  id: text("id").primaryKey(),
  projectId: projectColumn("project_id").notNull(),
  machineId: machineColumn("machine_id").notNull(),
  /** The folder made a repository, on its machine. */
  root: text("root").notNull(),
  /** What is offered, a row per pattern (core `PlaceLfsRow`). */
  rows: storedJson(z.array(PlaceLfsRowSchema))("rows").notNull(),
  offeredAt: timestamp("offered_at").notNull(),
  answer: storedEnum(LfsOfferAnswerSchema)("answer"),
  answeredAt: timestamp("answered_at"),
  /** The commit that took them through LFS. */
  commit: text("commit"),
});

/**
 * The LFS endpoints a repository's `.lfsconfig` named that a project's
 * conversation was told git-lfs refused (server.ts `/api/lfs/projects/:id/refused`,
 * agent host-lfs.ts): one row per project and endpoint, so it is told
 * once, whatever restarts and however many fetches meet it.
 */
export const lfsRefusals = sqliteTable(
  "lfs_refusals",
  {
    projectId: projectColumn("project_id").notNull(),
    endpoint: text("endpoint").notNull(),
    notedAt: timestamp("noted_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.endpoint] })]
);

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
    projectId: projectColumn("project_id").notNull(),
    taskId: text("task_id").notNull(),
    /** The builder's work item: the attempt whose result is judged. */
    itemId: text("item_id").notNull(),
    /** The builder's working tree judged, committed or not, as a git tree: what a pass holds for. */
    tree: text("tree_sha").notNull(),
    /** The commit that tree sat on; what it changed on top of it went to the verifier as a patch. */
    head: text("head_sha").notNull(),
    /** The verifier's own work item, once it started. */
    verifierItemId: text("verifier_item_id"),
    /**
     * A round asked of an artifact in a chat (design graph E1): the
     * artifact it judges; `itemId` is then its key (`artifact:<id>`), and
     * `projectId` and `taskId` are the empty string. Null for a task's round.
     */
    artifactId: text("artifact_id"),
    /** The session that asked a chat round: it hears the verdict. Null for a task's round. */
    requesterId: sessionColumn("requester_id"),
    state: storedEnum(DesignCheckStateSchema)("state").notNull(),
    /** The builder's `finish_item`, held while the verifier works; run again on a pass. */
    submission: storedJson(WorkItemSubmissionSchema)("submission"),
    findings: storedJson(z.array(DesignFindingSchema))("findings"),
    createdAt: timestamp("created_at").notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => [index("design_checks_item").on(table.itemId)]
);

/**
 * An agent's change to a project's design system, waiting for the person
 * (design-system.ts): the call's files as it made them, applied through
 * `design_write` on Approve, at the place it was proposed. Deleted once
 * answered.
 */
export const designProposals = sqliteTable("design_proposals", {
  id: text("id").primaryKey(),
  projectId: projectColumn("project_id").notNull(),
  /** The proposing session. */
  instanceId: sessionColumn("instance_id").notNull(),
  /** Where design/ is written: a repository's root on a machine; both null for the project's folder. */
  machineId: machineColumn("machine_id"),
  root: text("root"),
  why: text("why").notNull(),
  /**
   * The `design_write` call's files, written on Approve, each with what it
   * was proposed against (`before`, in its own encoding; "" for a file it
   * makes): the base the one rule merges from (proposal-base.ts). A row
   * kept before bases were has none.
   */
  files: storedJson(
    z.array(
      z.object({
        before: z.string().optional(),
        content: z.string(),
        encoding: z.enum(["utf8", "base64"]).optional(),
        path: z.string(),
      })
    )
  )("files").notNull(),
  /** What the write would change, as it stood when proposed: the card's diff. */
  preview: storedJson(z.array(DesignProposalFileSchema))("preview").notNull(),
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
    projectId: projectKey(),
    place: storedEnum(z.enum(STARTER_PLACES))("place").notNull(),
    generatedAt: timestamp("generated_at").notNull(),
    /** The hash of the inputs Jev was asked over. */
    inputHash: text("input_hash").notNull(),
    /** What asked for it, several joined by `, ` (project-starters.ts `StartersTrigger`): `project created`, `task moved`, `turn ended`, `commit landed`, `attempt failed`, `routine failed`, `routine made`, `event received`, `design offer declined`, `read` (`stale` before 2026-10-18). */
    trigger: text("trigger").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.place] })]
);

/** One starter of a project's set for a place, at its position in the set's order. */
export const projectStarters = sqliteTable(
  "project_starters",
  {
    projectId: projectColumn("project_id").notNull(),
    place: storedEnum(z.enum(STARTER_PLACES))("place").notNull(),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    glyph: storedEnum(z.enum(STARTER_GLYPHS))("glyph").notNull(),
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
    projectId: projectColumn("project_id").notNull(),
    place: storedEnum(z.enum(STARTER_PLACES))("place").notNull(),
    position: integer("position").notNull(),
    seq: integer("seq").notNull(),
    kind: storedEnum(z.enum(STARTER_SOURCE_KINDS))("kind").notNull(),
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
    projectId: projectKey(),
    /** The place the starter stood in. */
    place: storedEnum(z.enum(STARTER_PLACES))("place").notNull(),
    text: text("text").notNull(),
    outcome: storedEnum(StarterOutcomeSchema)("outcome").notNull(),
    at: timestamp("at").notNull(),
  },
  (table) => [index("starter_outcomes_project").on(table.projectId, table.at)]
);

/**
 * A session's own plan (Projects spec §5.2, `plan.ts`), as it last wrote it
 * through `todo_write`'s session scope: its steps (CawCo's list, read only
 * while its native to-do tools are denied, one row each in
 * {@link sessionPlanSteps}) and its spec. Each is replaced whole on a
 * write; a harness's own list is read from the harness, never stored here.
 */
export const sessionPlans = sqliteTable("session_plans", {
  instanceId: sessionColumn("instance_id").primaryKey(),
  /**
   * The steps as they were stored as JSON before migration 0418, when they
   * did not read whole as a list of steps (with
   * {@link sessionPlans.orphanedCommentsUnread}, the plan's other half as
   * it was stored then): none of them is a row, and the plan says it holds
   * steps that do not read (core `SessionPlan.unread`). The session's
   * writes after are rows beside it and never touch it; it goes with the
   * steps to a session that goes on from this one (db `copySessionSteps`).
   * Null on every plan that read.
   */
  stepsUnread: text("steps_unread"),
  /** The orphaned comments as they were stored beside {@link sessionPlans.stepsUnread}, when the plan did not read whole; null on every plan that read. */
  orphanedCommentsUnread: text("orphaned_comments_unread"),
  /** The session's spec, markdown; null until it writes one. */
  spec: text("spec"),
  specAt: timestamp("spec_at"),
  /**
   * The away notes (core injected.ts `awayNotesOf`) as the person last saw
   * them: opened in the plan panel, or recapped to them on their return.
   * The spec's away notes differing from it are unseen; null until first seen.
   */
  awaySeen: text("away_seen"),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * One step of a session's plan (core plan.ts `PlanStep`), at its place in
 * the list: what finds each session's step in progress, and each step's
 * wait. Replaced whole with the list; goes and moves with its plan.
 */
export const sessionPlanSteps = sqliteTable(
  "session_plan_steps",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => sessionPlans.instanceId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Its place in the list, from 0. */
    position: integer("position").notNull(),
    /** Stable within one list: the writer's, the step's place, or `you-…` for one the person added. */
    id: text("id").notNull(),
    content: text("content").notNull(),
    depth: integer("depth").notNull(),
    status: storedEnum(z.enum(PLAN_STEP_STATUSES))("status").notNull(),
    /** Null where the `todo_write` that wrote it named none. */
    priority: storedEnum(z.enum(PLAN_STEP_PRIORITIES))("priority"),
    /** What it waits on (core wait-targets.ts), as a task's `waits_on` keeps it; null: nothing. */
    waitsOn: text("waits_on"),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.position] }),
    uniqueIndex("session_plan_steps_id").on(table.instanceId, table.id),
    index("session_plan_steps_in_progress")
      .on(table.instanceId, table.position)
      .where(sql`${table.status} = 'in_progress'`),
    // Its columns by bare name, as every check's (migrations-check.ts
    // `qualifiedChecks`).
    check(
      "session_plan_steps_status",
      sql`${sql.identifier("status")} in ('pending', 'in_progress', 'completed')`
    ),
    check(
      "session_plan_steps_priority",
      sql`${sql.identifier("priority")} is null or ${sql.identifier("priority")} in ('high', 'medium', 'low')`
    ),
  ]
);

/**
 * The person's comments on a session's plan (core plan.ts `PlanComment`),
 * one row each: on a step (`step_id`), or orphaned, on words no step of the
 * session's last write has (`orphan_step`, core `OrphanedComments.step`).
 * `ord` orders them across the plan: a step's comments by it, and the
 * orphaned ones by it, a new group wherever `orphan_step` changes.
 */
export const sessionPlanStepComments = sqliteTable(
  "session_plan_step_comments",
  {
    instanceId: sessionColumn("instance_id")
      .notNull()
      .references(() => sessionPlans.instanceId, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** The step it is on; null when orphaned. */
    stepId: text("step_id"),
    /** The words of the step an orphaned comment was written on; null on a step's. */
    orphanStep: text("orphan_step"),
    ord: integer("ord").notNull(),
    /** When the person wrote it, ISO 8601, as core `PlanComment.at` keeps it. */
    at: text("at").notNull(),
    text: text("text").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.instanceId, table.ord] }),
    foreignKey({
      columns: [table.instanceId, table.stepId],
      foreignColumns: [sessionPlanSteps.instanceId, sessionPlanSteps.id],
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
    // Its columns by bare name, as every check's (migrations-check.ts
    // `qualifiedChecks`).
    check(
      "session_plan_step_comments_one_place",
      sql`(${sql.identifier("step_id")} is null) <> (${sql.identifier("orphan_step")} is null)`
    ),
  ]
);

/**
 * The person's changes to a session's plan (core plan.ts `PlanChange`), in
 * their words, one row each: what the plan panel shows of them, and what is
 * still owed to whoever the plan answers to (hub plan-changes.ts). A row
 * with no `toldAt` waits: for the receiver's next turn (a tick or a move on
 * an idle session), or for the quiet after the person's last change.
 */
export const planChanges = sqliteTable(
  "plan_changes",
  {
    id: text("id").primaryKey(),
    /** The session whose plan it changed. */
    instanceId: sessionColumn("instance_id").notNull(),
    /** Who hears it: `session:<instance id>` or `caw:<project id>`. */
    receiver: text("receiver").notNull(),
    kind: storedEnum(z.enum(PLAN_EDIT_KINDS))("kind").notNull(),
    step: text("step").notNull(),
    was: text("was").notNull(),
    words: text("words").notNull(),
    at: timestamp("at").notNull(),
    /** When it went to its receiver in a message; null while it waits. */
    toldAt: timestamp("told_at"),
    /**
     * The uuid of the message that carried it to a session, until that
     * session is known to have taken it or gone on: a message its session's
     * gone conversation failed is carried on to a new session.
     */
    sentUuid: text("sent_uuid"),
    /**
     * The plan's own session has written its steps since, or was told why a
     * write of them was refused: a later write no longer checks against it.
     * Set at once for a change its own session never hears (a delegate's
     * plan, which its parent hears; a task attempt's, which Caw hears).
     */
    settled: integer("settled", { mode: "boolean" }).notNull().default(false),
    /** Why it reached no one, when nothing could take it. */
    undelivered: text("undelivered"),
  },
  (table) => [
    index("plan_changes_instance").on(table.instanceId, table.at),
    index("plan_changes_receiver").on(table.receiver, table.toldAt),
  ]
);

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
    /**
     * The session whose panel holds it. A project's page outlives it: its
     * life is its source's in the project's folder (`decisions/<name>/`), so
     * a deleted session leaves it here with no session (null), its picks and
     * places kept. Every other artifact goes with its session
     * (db/core.ts `dropInstances`).
     */
    instanceId: sessionColumn("instance_id").references(() => instances.id, {
      onDelete: "set null",
    }),
    /**
     * The session whose `artifact_create` last made it: the owner itself, or
     * a delegate that handed it to its parent (artifacts/service.ts `ownerFor`), which may
     * go on updating and reading it. Null on one made before it
     * was kept.
     */
    madeBy: sessionColumn("made_by").references(() => instances.id, {
      onDelete: "set null",
    }),
    /**
     * The artifact this row is the next version of: a maker's change to an
     * artifact that stands in its parent's panel, held here unseen until the
     * parent's artifact_show merges it in and drops this row (artifacts
     * service.ts `holdNext`). No list holds it; null for every artifact.
     */
    heldFor: text("held_for").references((): AnySQLiteColumn => artifacts.id, {
      onDelete: "cascade",
    }),
    /**
     * The preview origin this row's own frames load (db/previews.ts
     * `artifactOrigin`): an id of its own, minted once when the row is made
     * (db/artifacts.ts `create`), never renamed. A held next version has
     * its own; opening it hands its origin to the artifact, and the
     * artifact's own goes with the version's row (`handOrigin`). Its port,
     * its host-mode label, its passes and its machine's listener are all
     * keyed by it.
     */
    origin: text("origin").notNull(),
    /**
     * The session's project when it made it; a page there is also written
     * to `decisions/<name>/`, and is the project's (served on its origin).
     * A project's delete takes its pages first (db/forget.ts `forget`);
     * anything else of it outlives it with no project.
     */
    projectId: projectColumn("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    kind: storedEnum(z.enum(ARTIFACT_KINDS))("kind").notNull(),
    name: text("name").notNull(),
    /** What the person does on it (core `ARTIFACT_DOES`): pick, judge, try or draw. Every create names it; rows made before it were set to judge. */
    does: storedEnum(z.enum(ARTIFACT_DOES))("does").notNull().default("judge"),
    /** The panel head's one line under its name: what the person does here, in their words. Empty on a row made before it, and on the person's own composer canvas. */
    ask: text("ask").notNull().default(""),
    /** What every surface names it by to the person: the panel head, the artifacts menu, Needs you, chips, push text. Written by its agent in plain words (core `ARTIFACT_TITLE_LIMIT`); empty on a row made before titles were kept. `name` stays its slug for agents and URLs. */
    title: text("title").notNull().default(""),
    /**
     * The person's own canvas, opened in the composer (artifacts service.ts
     * `createDraft`): no agent's create lands on it, so its name stands
     * beside the agent's canvas of the same name. False on every other row.
     */
    composer: integer("composer", { mode: "boolean" }).notNull().default(false),
    /** The machine a preview's dev server or folder is on; null for a page, which the hub serves. */
    machineId: machineColumn("machine_id"),
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
    /**
     * A sheet's place instead (core `isPlace`): the boundary over the
     * folder of a session with no workspace, whose stage runs there. No
     * workspace row is ever made for a place (archiving one deletes its
     * folder), so it is no key: the hub finds it through the session that
     * names it (artifact-events.ts `stageWhere`).
     */
    sourcePlace: text("source_place"),
    /** A sheet's: the stage's toolchain root and its story file, from the clone's root. */
    sourceStageDir: text("source_stage_dir"),
    sourceStageFile: text("source_stage_file"),
    /** A workspace preview's: the command the workspace's stage runs and keeps up on the port, and its folder from the clone's root. */
    sourceServeCommand: text("source_serve_command"),
    sourceServeCwd: text("source_serve_cwd"),
    /**
     * A sheet's, a workspace preview's or a folder preview's: the pin the
     * person is served it from (core `PreviewSource.pin`), the copy its
     * machine cut as its author handed this version up. Null for a page and
     * for a port on a machine's host.
     */
    sourcePin: text("source_pin"),
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
    /**
     * Whether it may wait on the person (artifacts/needs.ts `mayWait`, read
     * from its row and doc): false only once Needs you's read found it may
     * not (artifacts service `needs`), and true again on any write of its
     * row (the `artifacts_may_wait_moved` trigger, migration 0451), every
     * update its doc takes among them (db/artifacts.ts `append` moves its
     * `seq`). So the lane reads the artifacts that may wait, by
     * `artifacts_may_wait`, not every one.
     */
    mayWait: integer("may_wait", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [
    index("artifacts_instance").on(table.instanceId, table.createdAt),
    index("artifacts_may_wait")
      .on(table.createdAt)
      .where(sql`${table.mayWait} = 1 and ${table.heldFor} is null`),
    // A held next version shares its artifact's name. A project's page is
    // the project's by its name, whichever session wrote it; every other
    // artifact is its session's by kind and name, the person's composer
    // canvases apart from the agent's.
    uniqueIndex("artifacts_instance_name")
      .on(table.instanceId, table.kind, table.name, table.composer)
      .where(
        sql`${table.heldFor} is null and (${table.projectId} is null or ${table.kind} <> 'page')`
      ),
    uniqueIndex("artifacts_project_page")
      .on(table.projectId, table.name)
      .where(
        sql`${table.heldFor} is null and ${table.projectId} is not null and ${table.kind} = 'page'`
      ),
    uniqueIndex("artifacts_held_for").on(table.heldFor),
    uniqueIndex("artifacts_origin").on(table.origin),
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
    by: storedEnum(ArtifactChangeBySchema)("by").notNull(),
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
 * `revision` is the show's (`PreviewTarget.revision`): a panel loads its page
 * again only when it changes, so a restart that keeps it reloads no page.
 * Null on a row kept before it was; its first restore keeps one. `show` is
 * the show's identity (`PreviewTarget.show`), which a tab's Close holds
 * until; null on a row kept before it was, whose revision stands for it.
 */
export const shownPreviews = sqliteTable("shown_previews", {
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  artifactId: text("artifact_id")
    .notNull()
    .references(() => artifacts.id, { onDelete: "cascade" }),
  revision: text("revision"),
  show: text("show"),
});

/**
 * Each preview origin's port (preview.ts), and the port its host name says
 * under a `{port}` host pattern: kept across restarts so what it serves
 * keeps its storage. An origin is a session's (its pages and canvases by
 * id, taken when it first shows one, given back when it ends), a project's
 * (its pages, Projects spec §5.8: one origin for the project's life,
 * whichever session wrote a page or whether it still stands) or a machine
 * artifact's (a dev server's or a folder's preview, a sheet: its own origin
 * for the artifact's life, which its panel, its own tab and every decision
 * card load, so no two artifacts ever share a port's storage or cache);
 * exactly one owns each row, and goes with it.
 */
export const previewPorts = sqliteTable(
  "preview_ports",
  {
    port: integer("port").primaryKey(),
    instanceId: sessionColumn("instance_id")
      .unique()
      .references(() => instances.id, { onDelete: "cascade" }),
    projectId: projectColumn("project_id")
      .unique()
      .references(() => projects.id, { onDelete: "cascade" }),
    /**
     * An artifact's origin (`artifacts.origin`), which no foreign key
     * holds: a held version's opening repoints it from one row to another.
     * It goes as the origin ends (hub preview-service.ts `end`, on
     * every artifact delete), and one whose artifact went while the hub was
     * down is dropped at its next start (preview.ts `bindKept`).
     */
    origin: text("origin").unique(),
    /**
     * When the origin was last used (it took this port, a request, a socket
     * opened or closed), written at most once a minute after it took the
     * port (preview.ts `used`): under a full range the port of the one used
     * least recently that nothing uses now goes first (`reclaimOne`), across
     * the hub's restarts. Null on a row kept before 0347 until next used.
     */
    usedAt: timestamp("used_at"),
  },
  () => [
    // Its columns by bare name, as every check's (migrations-check.ts
    // `qualifiedChecks`).
    check(
      "preview_ports_one_owner",
      sql`(${sql.identifier("instance_id")} is not null) + (${sql.identifier("project_id")} is not null) + (${sql.identifier("origin")} is not null) = 1`
    ),
  ]
);
/** The one row of {@link streamRelay}. */
export const STREAM_RELAY_ID = "relay";

/**
 * The fleet's stream relay (stream-relay.ts) — one row, keyed `'relay'`,
 * following the {@link previewSettings} precedent: the machine that runs it,
 * the address and DNS name it is reached by, the shared secret coturn checks
 * credentials against (sealed), and what its machine last said. Each
 * port's answer to the hub's health check is kept in memory
 * (stream-relay.ts `health`): the hub asks again every minute and after
 * each frame. No row: the fleet has no relay.
 */
export const streamRelay = sqliteTable("stream_relay", {
  /** Always `'relay'`. */
  id: text("id").primaryKey(),
  machineId: machineColumn("machine_id")
    .notNull()
    .references(() => agents.machineId, { onDelete: "cascade" }),
  /** The address its URLs name. */
  address: text("address").notNull(),
  /** A DNS name pointing at the machine: TLS answers for it once its certificate stands. */
  hostname: text("hostname"),
  /** Sealed: whoever holds it mints credentials the relay accepts. Null when the hub's key does not open it. */
  secret: sealedText("secret").notNull(),
  /** Whether the person wants it running: Stop relay sets it false, Start relay true. */
  wanted: integer("wanted", { mode: "boolean" }).notNull().default(true),
  state: storedEnum(StreamRelayStateSchema)("state")
    .notNull()
    .default("starting"),
  /**
   * What its machine has bound, as its last frame said (core `RelayPorts`):
   * its plain listener on UDP and on TCP, and its TLS listener. Null
   * together before a frame said, and when what a hub before migration
   * 0412 stored did not read whole (`ports_unread`), until the next frame.
   */
  portUdp: integer("port_udp", { mode: "boolean" }),
  portTcp: integer("port_tcp", { mode: "boolean" }),
  portTls: integer("port_tls", { mode: "boolean" }),
  /** The ports as a hub before migration 0416 stored them, when they did not read whole; null once a frame has said them since. */
  portsUnread: text("ports_unread"),
  /** Its machine's own LAN and tailnet addresses, as its last live frame said: every browser's mint carries them. */
  reach: storedJson(RelayReachSchema)("reach"),
  why: text("why"),
  /** The command `why` names as its fix, word for word inside it (shown as code). */
  whyCommand: text("why_command"),
  createdAt: stampedNow("created_at"),
});

/**
 * The fleet's browsers (Projects spec §5.11, browsers.ts): one row per key
 * per machine, as that machine's last `browsers` frame said, and who holds
 * it privately. A project that runs on two machines has a browser on each.
 * The hub reads it to list each browser in its sessions' panels and to send
 * a take-over again to a machine that registers while one stands.
 */
export const browsers = sqliteTable(
  "browsers",
  {
    key: text("key")
      .$type<import("@cawco/core/browser").BrowserKey>()
      .notNull(),
    machineId: machineColumn("machine_id")
      .notNull()
      .references(() => agents.machineId, { onDelete: "cascade" }),
    /** The project of a `project:` key; null for a machine's own browser. */
    projectId: projectColumn("project_id"),
    name: text("name").notNull(),
    host: storedEnum(BrowserHostKindSchema)("host").notNull(),
    state: storedEnum(BrowserStateSchema)("state").notNull(),
    /** The workspace whose browser ask the person took, or `""` for a take-over nobody asked for; null while nobody holds it. */
    takeoverBy: text("takeover_by"),
    /** The browser ask the take-over answers. */
    takeoverRequestId: text("takeover_request_id"),
    takeoverSince: timestamp("takeover_since"),
    lastUsedAt: timestamp("last_used_at").notNull(),
    updatedAt: timestamp("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.key] })]
);
/** The one row of {@link streamRelayJourney}. */
export const STREAM_JOURNEY_ID = "journey";

/**
 * The stream relay's guided journey (relay-journey.ts) — one row, keyed
 * `'journey'`, made when someone sets it up (Caw's setup card, Settings ›
 * Browsers, a take-over through a domain) and gone with Remove relay. What
 * the person and the machine settled on each step: the machine picked and
 * the addresses it was found at, the name and how it stands, the Cloudflare
 * token (sealed), what the router answered, the low ports allowed, the
 * certificate, and whether the row was put away. What the hub checks again
 * on its own (DNS, the low ports) lives in memory.
 */
export const streamRelayJourney = sqliteTable("stream_relay_journey", {
  /** Always `'journey'`. */
  id: text("id").primaryKey(),
  /** The machine picked; null before a pick. */
  machineId: machineColumn("machine_id").references(() => agents.machineId, {
    onDelete: "set null",
  }),
  /** Its public address, and its address on its router's network when behind one, as last found. */
  address: text("address"),
  lan: text("lan"),
  /** The domain the person reached CawCo through when they set it up: the name's suggestion. */
  domain: text("domain"),
  /** The relay's DNS name, suggested or given; null while none is known. */
  name: text("name"),
  /** `open` while it stands, `pointed` once it answered with the machine's address, `skipped`. */
  nameState: storedEnum(RelayNameStateSchema)("name_state")
    .notNull()
    .default("open"),
  /** Sealed: the person's Cloudflare API token (Zone · DNS · Edit), for the record and the certificate's DNS challenge. */
  cloudflareToken: sealedText("cloudflare_token"),
  /** The machine's runtime carries the relay's ports as it is (a VM's forwarder carries UDP and TCP), as last read. */
  runtimeHolds: integer("runtime_holds", { mode: "boolean" })
    .notNull()
    .default(false),
  /** The name the certificate stands for, and when it ends. */
  certificateName: text("certificate_name"),
  certificateEndsAt: timestamp("certificate_ends_at"),
  /** Why the certificate was not issued, in the error formula's words. */
  certificateWhy: text("certificate_why"),
  /** Put away from Needs you: `later` or `done-for-now`. */
  closed: storedEnum(RelayJourneyClosedSchema)("closed"),
  /** When the relay first went live on this journey: Settings shows its summary from then. */
  liveAt: timestamp("live_at"),
  createdAt: stampedNow("created_at"),
});

/**
 * Each device's last proof of the stream relay (relay-journey.ts): which
 * URLs gave a relay candidate there, and whether the device was outside the
 * relay's network. A fleet machine on another network proves it the same way
 * (its id, `machine:<id>`). Gone with the relay.
 */
export const streamRelayProofs = sqliteTable("stream_relay_proofs", {
  /** A paired device's id, a browser's own key, or `machine:<machineId>`. */
  deviceId: text("device_id").primaryKey(),
  /** "Chrome on Linux", "CawCo on iPhone", a machine's name. */
  device: text("device").notNull(),
  /** The public address it asked from, when it had one. */
  address: text("address"),
  /** Its public address differs from the relay's. */
  outside: integer("outside", { mode: "boolean" }).notNull(),
  /**
   * Which of the relay's URLs answered there, by its chip (core
   * `RelayPortName`): UDP 3478, TCP 3478, TLS 5349. None: no URL did, and
   * the device proved nothing.
   */
  provedUdp: integer("proved_udp", { mode: "boolean" })
    .notNull()
    .default(false),
  provedTcp: integer("proved_tcp", { mode: "boolean" })
    .notNull()
    .default(false),
  provedTls: integer("proved_tls", { mode: "boolean" })
    .notNull()
    .default(false),
  /**
   * The chips as a hub before migration 0416 stored them, when they did not
   * read whole: the proof proves no port and is not read as a proof
   * (relay-journey.ts): the device proves the relay again. Null on every
   * proof written since.
   */
  portsUnread: text("ports_unread"),
  /** A URL refused its credential (a 401), not unreachable. */
  refused: integer("refused", { mode: "boolean" }).notNull().default(false),
  at: timestamp("at").notNull(),
});
/** The one row of {@link previewSettings}. */
export const PREVIEW_SETTINGS_ID = "preview";

/**
 * How previews are reached, fleet-wide (core `PreviewSettings`) — one row,
 * keyed `'preview'`, following the {@link spendSettings} precedent. No row
 * reads as port mode, which needs no setup.
 */
export const previewSettings = sqliteTable("preview_settings", {
  /** Always `'preview'`. */
  id: text("id").primaryKey(),
  mode: storedEnum(PreviewSettingsModeSchema)("mode").notNull().default("port"),
  /** Host mode's origins: `http://` or `https://`, then a host name with `{session}` standing for the session's id or `{port}` for its kept preview port; null in port mode. */
  pattern: text("pattern"),
});

/**
 * An artifact's Yjs document as its update log: every update appended in
 * order; once it holds `COMPACT_AT` updates and its doc stands quiet (hub
 * artifacts/docs.ts), the log is replaced by one snapshot
 * (`Y.encodeStateAsUpdate`).
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
 * What a page's or a canvas's document carries of the hub's state, built by
 * the hub whenever the artifact's row or what its page shows moves, and when
 * the preview server finds it read from a doc that moved since
 * (artifact-documents.ts, `seqs`), and read by the preview server, which
 * composes the document from it and the page's own file
 * (preview-server/serve.ts): the doc's seed its overlay tag carries, a
 * decision page's program hash, its media and its pictures' sizes, the
 * artifacts its pieces show (its origin serves those inside it), and the
 * key of its folder's files. `etag` names all of it: an open whose document
 * is the same answers 304 from this one row.
 */
export const artifactDocuments = sqliteTable("artifact_documents", {
  artifactId: text("artifact_id")
    .primaryKey()
    .references(() => artifacts.id, { onDelete: "cascade" }),
  etag: text("etag").notNull(),
  /** The doc as one base64 Yjs update (artifacts/docs.ts `seed`). */
  seedState: text("seed_state").notNull(),
  /** The doc's mirrored maps as JSON (artifacts/docs.ts `seed`). */
  seedMaps: text("seed_maps").notNull(),
  /** A decision page's program's hash, which its overlay carries; null for any other page and for a canvas. */
  programHash: text("program_hash"),
  /** A decision page's media as JSON (preview-server/document-shape.ts `DocumentMediaSchema`), an embed named by its origin's key and path; null for any other. */
  media: text("media"),
  /** A decision page's pictures' sizes by address, as JSON; null for any other. */
  pictures: text("pictures"),
  /** The artifacts its Canvas and Preview pieces show (their ids, a held version's own id), as a JSON array. */
  shows: text("shows").notNull().default("[]"),
  /** A page's folder's key (core `folderKey`); null for a canvas. */
  folderKey: text("folder_key"),
  /**
   * The seq of each artifact's doc it was read from, as a JSON object by
   * id: its own (the seed), and a design graph's a piece shows (its shapes).
   * Once one of them moves, the preview server has it built again before it
   * serves it; `{}` (one built before this column) is never current.
   */
  seqs: text("seqs").notNull().default("{}"),
  builtAt: timestamp("built_at").notNull(),
});

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
  instanceId: sessionColumn("instance_id")
    .primaryKey()
    .references(() => instances.id, { onDelete: "cascade" }),
  /** It read the web: every later note of the session is tainted `web`. */
  web: integer("web", { mode: "boolean" }).notNull().default(false),
  /** The routine whose run started it: a session a routine-woken turn spawned. */
  fromRoutine: text("from_routine"),
  /** Since its last turn's result it read a send the hub delivered: its turn is not self-started. */
  delivered: integer("delivered", { mode: "boolean" }).notNull().default(false),
  /** The routine whose wake its turn read (a conversation's). */
  routine: text("routine"),
  updatedAt: timestamp("updated_at").notNull(),
});

/** A session's harness subagents still running (`session_taints`), one row each. */
export const sessionSubagents = sqliteTable(
  "session_subagents",
  {
    instanceId: sessionColumn("instance_id")
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
 * When a brief last carried each of a project's knowledge lessons
 * (memory.ts `contextFor`), by its lesson id: what the nightly run's upkeep
 * reads to archive one no brief carried for long (memory-run.ts), and
 * eviction to pick a knowledge line to archive first. A brief commits
 * nothing.
 */
export const factUses = sqliteTable(
  "fact_uses",
  {
    projectId: projectKey(),
    /** Empty: a lesson's id names it across the files it moves between. Kept from when lines were keyed by file. */
    path: text("path").notNull(),
    /** The lesson's id (`L-` and six hex characters). */
    key: text("key").notNull(),
    usedAt: timestamp("used_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.path, table.key] })]
);

/**
 * Each session the person purged (its transcript deleted, from the
 * dashboard), by its machine and harness session id: what every find and
 * Recent's stored transcripts leave out (find.ts `purgedOut`), since the
 * machine's transcript index keeps the words it read. No foreign key: the hub's row for the
 * session goes with the purge, and a machine removed later leaves its
 * purges standing.
 */
export const purgedSessions = sqliteTable(
  "purged_sessions",
  {
    machineId: machineColumn("machine_id").notNull(),
    sessionId: text("session_id").notNull(),
    purgedAt: timestamp("purged_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.machineId, table.sessionId] })]
);

/**
 * What the hub says to the person about a project (caw.ts `notice`): a
 * repository made, an offer to answer, a routine made. Each is a line in its
 * conversation's transcript (`instance_id`), waking nobody; one written
 * while the project had no conversation waits for the next to start
 * (`instance_id` null until then).
 */
export const projectNotes = sqliteTable(
  "project_notes",
  {
    id: text("id").primaryKey(),
    projectId: projectKey(),
    /** The conversation it is a line of; null until the project has one. */
    instanceId: sessionColumn("instance_id"),
    at: timestamp("at").notNull(),
    note: storedJson(ProjectNoteSchema)("note").notNull(),
  },
  (table) => [
    index("project_notes_project").on(table.projectId),
    index("project_notes_instance").on(table.instanceId),
  ]
);

/** Who a routine's run goes to: a fresh delegate of its type, or the project's conversation. */
/**
 * What a run starts: a fresh delegate, a fresh orchestrator (a session that
 * may delegate, in the project's checkout: routines.ts `fireOrchestrator`),
 * a message to the project's Caw, or the project's memory curator
 * (memory.ts), a delegate in the `curator` role that only the hub makes.
 */
export type RoutineTarget = import("@cawco/core/routine-kinds").RoutineTarget;

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
    projectId: projectColumn("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    /** Five fields, or six with seconds first (Effect's `Cron.parse`). */
    cron: text("cron").notNull(),
    /** An IANA zone the schedule reads in, like Europe/London. */
    timeZone: text("time_zone").notNull(),
    target: storedEnum(z.enum(ROUTINE_TARGETS))("target").notNull(),
    prompt: text("prompt").notNull(),
    /** The delegate type a `delegate` run starts; null: the fleet's default. */
    delegateType: text("delegate_type"),
    /** Where a `delegate` run's commits go: `none` unless the routine says. */
    lands: storedEnum(z.enum(LANDS_MODES))("lands").notNull().default("none"),
    /** What each run's work item may spend; one that did not read skips every run. */
    ...budgetColumns(),
    /** Dollars its runs may spend in a day of its time zone; null: no cap. */
    dailyCapUsd: real("daily_cap_usd"),
    /**
     * The permission mode a `conversation` run starts the project's
     * conversation in when it has none, over the project's (caw.ts
     * `modeFor`). Null: the project's.
     */
    mode: storedEnum(z.enum(PERMISSION_MODES))("mode"),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    /** Why it is off, when the hub turned it off (it expired). */
    disabledReason: text("disabled_reason"),
    /** `owner`, or the id of the session that made it. */
    createdBy: sessionColumn("created_by").notNull(),
    /**
     * The session whose `routine_create` call made it; null for yours, the
     * hub's, and routines made before the hub kept where.
     */
    madeInInstance: sessionColumn("made_in_instance"),
    /**
     * What the making turn said just before its `routine_create` call, one
     * paragraph; null when it said nothing, or the routine is not an agent's.
     */
    madeWhy: text("made_why"),
    /** How that session is named in its notice: a delegate, or another session. */
    madeBy: storedEnum(RoutineMadeBySchema)("made_by"),
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
    createdAt: timestamp("created_at").notNull(),
    /**
     * Its condition: a statement true once met, which makes it a check that
     * tasks and plan steps wait on (`routine:<id>`, core wait-targets.ts).
     * Each run answers met, unmet or unknown. Null on every other routine.
     */
    condition: text("condition"),
    /** When the hub stops a condition's checks unmet; null: never, and on every other routine. */
    deadline: timestamp("deadline"),
    /** When its condition was met; null while unmet. */
    metAt: timestamp("met_at"),
    /** Who met it: the run's id, or `owner` when the person marked it met. */
    metBy: text("met_by"),
    /** The meeting run's evidence, one sentence; null when the person marked it. */
    metEvidence: text("met_evidence"),
    /**
     * Why the hub turned its checks off (core `ConditionStop`): met, its
     * deadline passed, or failing slots. Null while it checks, and when a
     * person or a session paused it.
     */
    stopped: storedEnum(z.enum(CONDITION_STOPS))("stopped"),
  },
  (table) => [index("routines_project").on(table.projectId)]
);

/**
 * How a run ended, by its delegate's `finish_item` summary or Caw's
 * `routine_result`: `silent` (`NO_REPLY`), `delivered` (its words became a
 * notice), `failed` (`AUTOMATION_FAILED`, an item that failed, or Caw's turn
 * ending without a result), `cancelled` (someone stopped it).
 */
export type RoutineOutcome = import("@cawco/core/routine-kinds").RoutineOutcome;

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
    /**
     * Where the run is (core `RoutineRunState`): queued behind a live run (an
     * event's run, which starts when the runs before it end), being started,
     * running, ended, or skipped (nothing started).
     */
    state: storedEnum(z.enum(ROUTINE_RUN_STATES))("state").notNull(),
    workItemId: text("work_item_id"),
    /**
     * The session that did the run: a work item run's (delegate,
     * orchestrator, curator, trim) its item's session, from its start; a
     * conversation run's once its harness read the run's wake, the turn that
     * took it then ending the run, with its `routine_result` or failed. A
     * conversation run is the one with no work item.
     */
    instanceId: sessionColumn("instance_id"),
    outcome: storedEnum(z.enum(ROUTINE_OUTCOMES))("outcome"),
    /** What its delegate said, when it said more than the contract's words. */
    output: text("output"),
    /** Why it was skipped or failed, as a sentence. */
    reason: text("reason"),
    /** What its work item's session spent, booked when it ended. */
    usd: real("usd"),
    startedAt: timestamp("started_at").notNull(),
    endedAt: timestamp("ended_at"),
    /**
     * What a check run answered (core `RoutineVerdict`): kept as its
     * delegate's `routine_result` comes, read as its work item ends. Null
     * for a run that gave none, and every run of a routine with no condition.
     */
    verdict: storedEnum(z.enum(ROUTINE_VERDICTS))("verdict"),
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

/**
 * A connection (Projects spec §5.5, connections.ts): an outside service's MCP
 * server the hub signs in to and calls for sessions. What the hub decides
 * on (which machine's gh, which app and installation, a code sign-in's
 * expiry) is a plain column here; its secrets (its key, its OAuth tokens and
 * client, a sign-in's verifier, an app's private key and client secret) are
 * {@link connectionSecrets}, each sealed alone. No route or tool answers a
 * secret.
 */
export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  /** `[a-z0-9-]+`, unique: the name delegate types list and sessions call it by. */
  name: text("name").notNull().unique(),
  service: text("service").notNull(),
  /** Which account of the service, in the owner's words. */
  account: text("account").notNull(),
  transport: storedEnum(z.enum(CONNECTION_TRANSPORTS))("transport").notNull(),
  url: text("url"),
  command: text("command"),
  args: storedJson(z.array(z.string()))("args"),
  auth: storedEnum(z.enum(CONNECTION_AUTHS))("auth").notNull(),
  /** For `header` auth: the header (stdio: the environment variable) the key goes in. */
  header: text("header"),
  state: storedEnum(ConnectionStateSchema)("state").notNull(),
  reason: text("reason"),
  /**
   * A `gh` connection's machine, host and account, whose gh its token is
   * read from (connections.ts `ghToken`): null together, for any other.
   */
  ghMachineId: text("gh_machine_id"),
  ghHost: text("gh_host"),
  ghLogin: text("gh_login"),
  /** A GitHub App's organization, which its sign-in registers it under again when restarted from its row. */
  org: text("org"),
  /**
   * An `app` connection's registration, once it is held: a GitHub App's or
   * a Linear app's. Null with every other `app_` column; its secrets are in
   * {@link connectionSecrets}.
   */
  appService: storedEnum(z.enum(APP_SERVICES))("app_service"),
  /** A GitHub App's id. */
  appId: text("app_id"),
  /** A GitHub App's name in its URL. */
  appSlug: text("app_slug"),
  /** The app's OAuth client id: a Linear app's always, a GitHub App's once registered. */
  appClientId: text("app_client_id"),
  /** A GitHub App's installation, set once GitHub's setup redirect names it and the app's JWT reads it. */
  appInstallationId: text("app_installation_id"),
  /**
   * A `device` connection's code sign-in under way: the code the person
   * enters and where, when it lapses and the least seconds between two
   * polls. Null together, with its device code in {@link connectionSecrets}.
   */
  deviceUserCode: text("device_user_code"),
  deviceVerificationUri: text("device_verification_uri"),
  deviceExpiresAt: timestamp("device_expires_at"),
  deviceInterval: integer("device_interval"),
  /**
   * What the connection held as it was stored before it became columns
   * (migration 0420), when it was there and did not read: it did not open
   * with the hub's key, or opened to something that is not what a
   * connection holds. Kept sealed as it was; nothing of it is placed, and
   * the row reads as not signed in until it is signed in again, which
   * clears it.
   */
  sealedUnread: text("sealed_unread"),
  /** The OAuth discovery the SDK saved (resource and authorization server metadata): public documents. */
  discovery: storedJson(OAuthDiscoveryStateSchema)("discovery"),
  /** A sign-in under way: the `state` its redirect must bring back, and where to. */
  signInState: text("sign_in_state").unique(),
  signInRedirect: text("sign_in_redirect"),
  signInExpiresAt: timestamp("sign_in_expires_at"),
  /** The page that sign-in sent the person to, so a reload returns to it. */
  signInUrl: text("sign_in_url"),
  /** When the held access token runs out, as its token response said. */
  tokensExpireAt: timestamp("tokens_expire_at"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

/**
 * A connection's secrets (connections.ts), each sealed alone: its key, its
 * OAuth tokens and client (the provider's and the SDK's records, each
 * sealed whole), a sign-in's verifier, a GitHub App's private key, client
 * and webhook secrets or a Linear app's client secret, and a code sign-in's
 * device code. No row: it holds none. Only connections.ts opens them; no
 * match or filter reads them.
 */
export const connectionSecrets = sqliteTable("connection_secrets", {
  connectionId: text("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  key: sealedText("key"),
  tokens: sealedJson(OAuthTokensSchema)("tokens"),
  client: sealedJson(OAuthClientInformationMixedSchema)("client"),
  verifier: sealedText("verifier"),
  appPrivateKey: sealedText("app_private_key"),
  appClientSecret: sealedText("app_client_secret"),
  appWebhookSecret: sealedText("app_webhook_secret"),
  deviceCode: sealedText("device_code"),
});

/** The projects whose every session may use a connection, beside the delegate types that list it. */
export const connectionProjects = sqliteTable(
  "connection_projects",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    projectId: projectKey(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.projectId] }),
    index("connection_projects_project").on(table.projectId),
  ]
);

/** The areas whose every project's sessions may use a connection, read as the area's projects now. */
export const connectionAreas = sqliteTable(
  "connection_areas",
  {
    connectionId: text("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    areaId: areaKey(),
  },
  (table) => [
    primaryKey({ columns: [table.connectionId, table.areaId] }),
    index("connection_areas_area").on(table.areaId),
  ]
);

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
    /** `pr.opened`, `pr.merged`, `pr.closed`, `issue.opened`, `issue.closed`, `issue.labeled`, `comment.created`, `discussion.created`, `discussion_comment.created`, `item`. */
    kind: text("kind").notNull(),
    projectId: projectKey(),
    /** The event as ingress.ts normalised it, JSON, at most 64 KB (cut with a marker). */
    payload: text("payload").notNull(),
    receivedAt: timestamp("received_at").notNull(),
    via: storedEnum(InboundViaSchema)("via").notNull(),
    /** The routine a route sent it to, `conversation` for the project's conversation (handled once sent, else waiting in its inbox), or null while unrouted. */
    routedTo: text("routed_to"),
    /** The route it was delivered by: the oldest matching route to the routine it went to; null otherwise. */
    routeId: text("route_id").references(() => eventRoutes.id, {
      onDelete: "set null",
    }),
    /** When it was handed on: its routine's run filed, or the conversation's wake that carried it. */
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
    projectId: projectKey(),
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
    /**
     * The permission mode an event it routes starts the project's
     * conversation in when it has none, over its routine's (caw.ts
     * `modeFor`). Null: its routine's.
     */
    mode: storedEnum(z.enum(PERMISSION_MODES))("mode"),
    /** `owner`, or the id of the session that made it. */
    createdBy: sessionColumn("created_by").notNull(),
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

/**
 * A project's GitHub poller (ingress.ts, github.ts): the connection whose
 * token it polls every GitHub repository the project links with, and each
 * repository's cursor per resource (`github_poll_cursors`), so a hub
 * restart neither re-delivers nor misses.
 */
export const githubPollers = sqliteTable("github_pollers", {
  projectId: projectColumn("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  /** The connection (service `github`, one that reads GitHub's API: core `readsGitHubApi`) it polls with. */
  connection: text("connection").notNull(),
  /** Why its last poll failed, or null. */
  reason: text("reason"),
  /** GitHub's rate limit holds polls back until then. */
  resumeAt: timestamp("resume_at"),
  polledAt: timestamp("polled_at"),
});

/** One resource's cursor of one repository in a project's GitHub poller ({@link GitHubCursor}). */
export const githubPollCursors = sqliteTable(
  "github_poll_cursors",
  {
    projectId: projectColumn("project_id")
      .notNull()
      .references(() => githubPollers.projectId, { onDelete: "cascade" }),
    /** `owner/repo`, one of the project's links. */
    repo: text("repo").notNull(),
    resource: storedEnum(GitHubResourceSchema)("resource").notNull(),
    etag: text("etag"),
    /** The newest `updated_at` taken in, ms. */
    since: integer("since").notNull(),
    polls: integer("polls").notNull(),
    notModified: integer("not_modified").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.repo, table.resource] }),
  ]
);

/**
 * A connector poll (ingress.ts): one connection's read tool called on an
 * interval, its items diffed by id and version into `inbound_events`.
 */
export const connectorPolls = sqliteTable(
  "connector_polls",
  {
    id: text("id").primaryKey(),
    projectId: projectKey(),
    connection: text("connection").notNull(),
    tool: text("tool").notNull(),
    args: storedJson(z.record(z.string(), z.unknown()))("args").notNull(),
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
    createdBy: sessionColumn("created_by").notNull(),
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
 * A project's tracker (Projects spec D2, §5.2; tracker.ts): the connection
 * it signs in with, the repository or team its tasks' issues are in, and
 * where its poll stands. One per project; none while the project keeps its
 * tasks in CawCo's files alone.
 */
export const trackerBindings = sqliteTable("tracker_bindings", {
  projectId: projectColumn("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  provider: storedEnum(IssueTrackerSchema)("provider").notNull(),
  /** The connection's name (connections.ts). */
  connection: text("connection").notNull(),
  /** GitHub: `owner/repo`; Linear: the team's id. */
  target: text("target").notNull(),
  targetName: text("target_name").notNull(),
  targetUrl: text("target_url").notNull(),
  /** Issues opened after it become tasks; nothing older is copied. */
  boundAt: timestamp("bound_at").notNull(),
  /** The newest issue change its poll took in, ms: the next asks GitHub for changes since it. */
  issuesSince: integer("issues_since").notNull(),
  /** GitHub's ETag for the list of issue changes as it last asked it; null: none. */
  issuesEtag: text("issues_etag"),
  /** The newest comment its poll took in, ms. */
  commentsSince: integer("comments_since").notNull(),
  /** GitHub's ETag for the list of comments as it last asked it; null: none. */
  commentsEtag: text("comments_etag"),
  /**
   * Where its poll stood, as it was stored, when it was there and did not
   * read whole as it became columns (migration 0431): a list whose `since`
   * did not read starts again from {@link trackerBindings.boundAt} with no
   * ETag, so its next poll reads again what it may have read, and skips
   * nothing. The next poll that goes through clears it.
   */
  cursorUnread: text("cursor_unread"),
  state: storedEnum(TrackerSyncStateSchema)("state").notNull(),
  /** Why it is refused, or why its last poll stopped short; null when all went through. */
  reason: text("reason"),
  polledAt: timestamp("polled_at"),
  /** The tracker's rate limit holds polls back until then. */
  resumeAt: timestamp("resume_at"),
  /** GitHub: the Project its stages show on through Status (tracker-github-project.ts); null when none. */
  githubProject: storedJson(GithubProjectSchema)("github_project"),
  /** GitHub: why stages do not show on a Project, in GitHub's words; set, that part of the sync does not run. */
  githubProjectReason: text("github_project_reason"),
});

/**
 * A task linked to its issue by the tracker sync (tracker.ts): what the
 * two last agreed on (the baseline of their three-way merge: the `synced_`
 * columns and the {@link trackerLinkSyncedLabels} rows), and who opened
 * the issue. The issue itself is the task's record link (`task_links`,
 * mode `record`), which the file names (`issue:`, its URL).
 *
 * Every writer writes the whole baseline, `synced_unread` null. A baseline
 * migration 0407 found stored but not reading whole is kept as stored in
 * `synced_unread`, the fields of it that read placed beside it: while it is
 * set (or a field is null) the link's merge is held, nothing pulled into
 * the task or pushed from it (db trackers.ts `baselineOf`), until a sync
 * finds the task and its issue agreeing and writes a fresh baseline.
 */
export const trackerLinks = sqliteTable(
  "tracker_links",
  {
    projectId: projectKey(),
    /** The task, `tsk-12`. */
    taskId: text("task_id").notNull(),
    /** The title they agreed on. */
    syncedTitle: text("synced_title"),
    /** The description they agreed on, as the task file holds it. */
    syncedDescription: text("synced_description"),
    /** The stage the task stood in when they agreed. */
    syncedStage: text("synced_stage"),
    /** The issue's state, as tracker.ts names it (`open`, `closed:completed`, a Linear state's id). */
    syncedState: text("synced_state"),
    /** GitHub: the Status option its Project item stood in; null when not on the Project, no Status, or no Project. */
    syncedStatus: text("synced_status"),
    /** A baseline 0407 could not read whole, as it was stored; set, the link's merge is held. */
    syncedUnread: text("synced_unread"),
    /** Comments written after it, on either side, are carried to the other. */
    linkedAt: timestamp("linked_at").notNull(),
    /**
     * Who opened the issue when the tracker does not vouch for them, in
     * words; null when it does, or CawCo filed it. Set, the issue's pulls
     * never put its task where an agent takes it: they wait for you.
     */
    unvouched: text("unvouched"),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.taskId] })]
);

/** The labels a task and its issue last agreed on (`tracker_links`), as a set: one row each. */
export const trackerLinkSyncedLabels = sqliteTable(
  "tracker_link_synced_labels",
  {
    projectId: projectColumn("project_id").notNull(),
    taskId: text("task_id").notNull(),
    label: text("label").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.taskId, table.label] }),
    foreignKey({
      columns: [table.projectId, table.taskId],
      foreignColumns: [trackerLinks.projectId, trackerLinks.taskId],
    }).onDelete("cascade"),
  ]
);

/**
 * An external item a task links (core external-items.ts): one row per task
 * and URL, the file's `issue:` (mode `record`), `links:` and `waits_on:`
 * pull requests, each kept as the source last said it. The file names the
 * URL; this row mirrors what the source holds and is read again whenever it
 * changes, so every inbound event and poll finds its task here
 * ({@link TaskLinksDb.byItem}), never in a text field. A plan step's wait on
 * a pull request is a row of its session's plan (`plan:<session id>`, db
 * task-links.ts `planLinkOwner`), so it settles as a task's does.
 */
export const taskLinks = sqliteTable(
  "task_links",
  {
    projectId: projectKey(),
    /** The task, `tsk-12`; for a plan step's wait, its session's plan, `plan:<session id>`. */
    taskId: text("task_id").notNull(),
    /** As the task file or plan step writes it. */
    url: text("url").notNull(),
    source: storedEnum(z.enum(EXTERNAL_SOURCES))("source").notNull(),
    kind: storedEnum(z.enum(EXTERNAL_KINDS))("kind").notNull(),
    /** GitHub's node id, Linear's uuid; empty until the item was read. */
    externalId: text("external_id").notNull().default(""),
    /** GitHub's #12; null on Linear. */
    number: integer("number"),
    /** `#12`, `ENG-123`. */
    ref: text("ref").notNull(),
    title: text("title").notNull().default(""),
    /** Null until the item was read. */
    state: storedEnum(ExternalStateSchema)("state"),
    stateName: text("state_name").notNull().default(""),
    author: storedJson(ExternalActorSchema)("author"),
    labels: storedJson(z.array(z.string()))("labels").notNull().default([]),
    mode: storedEnum(LinkModeSchema)("mode").notNull(),
    /** When the source last changed it, ms; null before it was read. */
    remoteUpdatedAt: integer("remote_updated_at"),
    /** When the hub last read it; null before it first did. */
    syncedAt: timestamp("synced_at"),
    /** Why the last read or sync of it stopped short, in the source's words. */
    problem: text("problem"),
    /** A pull request's ETag from its last read: the next is asked with it, and a 304 costs no rate limit. */
    etag: text("etag"),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.taskId, table.url] }),
    index("task_links_item").on(
      table.projectId,
      table.source,
      table.kind,
      table.number
    ),
    index("task_links_external").on(
      table.projectId,
      table.source,
      table.externalId
    ),
    uniqueIndex("task_links_record")
      .on(table.projectId, table.url)
      .where(sql`${table.mode} = 'record'`),
  ]
);

/**
 * A comment carried between a task and an outside source, both ways
 * (core external-items.ts `ExternalComment`): keyed by the source's own id,
 * so one comment is never filed twice, and an edit on the source rewrites
 * its entry in place. `in` was written on the source and added to the task
 * (its entry's heading names the source and this URL); `out` was written on
 * the task and posted to the source.
 */
export const externalComments = sqliteTable(
  "external_comments",
  {
    projectId: projectKey(),
    source: storedEnum(z.enum(EXTERNAL_SOURCES))("source").notNull(),
    /** GitHub's comment number, Linear's uuid. */
    externalId: text("external_id").notNull(),
    taskId: text("task_id").notNull(),
    url: text("url").notNull(),
    direction: storedEnum(CommentDirectionSchema)("direction").notNull(),
    author: storedJson(ExternalActorSchema)("author").notNull(),
    /** When it was written on the source, ms. */
    at: integer("at").notNull(),
    /** The source's last edit, ms; null when never. */
    editedAt: integer("edited_at"),
    /** The task entry's heading time, ms: how an `out` row finds its entry. */
    entryAt: integer("entry_at").notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.projectId, table.source, table.externalId],
    }),
    index("external_comments_task").on(table.projectId, table.taskId),
  ]
);

/**
 * A task's wait on a pull request closed unmerged, or on an Actions run gone
 * red (task-waits.ts `GITHUB_FLAG`), once the person was told of it
 * (wait-flags.ts): one note in the project's conversation and one push per
 * wait, never a second while its row stands. The row goes once the wait
 * reads open, merged, running or green again (a reopened pull request, a run
 * run again), so its next flag is told; and once its task is closed or no
 * longer waits on it.
 */
export const taskWaitFlags = sqliteTable(
  "task_wait_flags",
  {
    projectId: projectKey(),
    /** The task, `tsk-12`. */
    taskId: text("task_id").notNull(),
    /** The wait as its task's file keeps it: the pull request's or run's URL. */
    target: text("target").notNull(),
    toldAt: timestamp("told_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.taskId, table.target] }),
  ]
);

/**
 * Where an approved action is (actions.ts): waiting for you, approved (and
 * due at its time), denied, running (claimed, its one call under way), done,
 * failed (the service answered it did not), unknown (the call went and no
 * answer came back, or the hub stopped mid-call: it may or may not have
 * happened), or cancelled before it ran.
 */
export type ActionState = import("@cawco/core/actions").ActionState;

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
    projectId: projectKey(),
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
    proposedBy: sessionColumn("proposed_by").notNull(),
    /** The routine whose run proposed it (that run's session, or one it started); null outside any routine. */
    routineId: text("routine_id").references(() => routines.id, {
      onDelete: "set null",
    }),
    /** That routine's run. */
    runId: text("run_id").references(() => routineRuns.id, {
      onDelete: "set null",
    }),
    state: storedEnum(z.enum(ACTION_STATES))("state").notNull(),
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
export type RelayProvider = import("@cawco/core/relays").RelayProvider;
/** Where a relay is (relay.ts): asked for, live, waiting on one step of yours, or turned off. */
export type RelayState = import("@cawco/core/relays").RelayState;

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
    projectId: projectKey(),
    provider: storedEnum(z.enum(RELAY_PROVIDERS))("provider").notNull(),
    /** What deliveries are signed with: minted for a webhook the hub registers, else the owner's (`cawco relay set-secret`). */
    secret: sealedText("secret"),
    /** `minted` (the hub made it and gave it to the provider), `owner` (set from the owner's terminal), or null: none yet. */
    secretFrom: storedEnum(RelaySecretFromSchema)("secret_from"),
    /** The connection the webhook is registered through (GitHub). */
    connection: text("connection"),
    /** GitHub: the repository, `owner/repo`, one of the project's links, whose webhook it is. */
    repo: text("repo"),
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
    state: storedEnum(z.enum(RELAY_STATES))("state").notNull(),
    /** Why it isn't live, as the exact step or command; null when live. */
    reason: text("reason"),
    /** When the provider's test delivery (GitHub's ping) arrived. */
    testedAt: timestamp("tested_at"),
    lastDeliveryAt: timestamp("last_delivery_at"),
    /** `owner`, or the id of the session whose ask the owner approved. */
    createdBy: sessionColumn("created_by").notNull(),
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
    instanceId: sessionColumn("instance_id"),
    machineId: machineColumn("machine_id").notNull(),
    /** The `permission_request` envelope, `raisedAt` stamped on its payload. */
    envelope: storedJson(ParkedAskShape)("envelope").notNull(),
  },
  (table) => [index("parked_asks_instance").on(table.instanceId)]
);

/**
 * What a session asked the person and the hub carries out (core asks.ts):
 * one row per ask, open until answered or withdrawn, kept after as its
 * record. Everything the hub decides an ask by is a column: the asker, its
 * state, when it was raised, its kind, whether it is routed to its
 * session's parent, when it was answered and whether that allowed, when its
 * approved call started and ended, when it was withdrawn, and when a
 * permit's grant was spent or lapsed. A permit's grant is found by them
 * alone (db/asks.ts `grants`), and so is a call the hub went while running
 * (`cutShort`). What was asked, who answered and what the call said are
 * `kept` (core `ASK_KEPT`).
 */
export const asks = sqliteTable(
  "asks",
  {
    id: text("id").primaryKey(),
    instanceId: sessionColumn("instance_id").notNull(),
    state: storedEnum(AskStateSchema)("state").notNull(),
    raisedAt: integer("raised_at").notNull(),
    /** Every writer sets it; null only where a record did not read when it became columns (migration 0408), `record_unread` set. */
    kind: storedEnum(z.enum(ASK_KINDS))("kind"),
    /** A permit whose prompt went to its session's parent to answer (core `routedTo`). */
    routedToParent: integer("routed_to_parent", { mode: "boolean" })
      .notNull()
      .default(false),
    answeredAt: integer("answered_at"),
    /** Whether the answer allowed; set with `answered_at`. Never `allow` where `record_unread` is set. */
    answerBehavior: storedEnum(z.enum(["allow", "deny"]))("answer_behavior"),
    /** When the hub started the approved call: in the answer's own write, so it runs at most once. */
    carriedStartedAt: integer("carried_started_at"),
    carriedEndedAt: integer("carried_ended_at"),
    withdrawnAt: integer("withdrawn_at"),
    /** When an approved permit's grant was spent on the same call. */
    usedAt: integer("used_at"),
    /** When an approved permit's grant lapsed unspent. */
    lapsedAt: integer("lapsed_at"),
    /** What was asked, who answered, what the call said (core `ASK_KEPT`); every writer sets it and clears `record_unread`. Null: `record_unread` set. */
    kept: storedJson(ASK_KEPT)("kept"),
    /**
     * A record that did not read whole when it became columns (migration
     * 0408), as it was stored, `kept` null beside it; what of it read is
     * placed in the columns, an answer that allowed aside. The hub never
     * reads it as an ask: it is never granted, answered or carried, and an
     * open one is withdrawn as the hub starts, its session told (asks.ts
     * `boot`).
     */
    recordUnread: text("record_unread"),
  },
  (table) => [
    index("asks_instance_state_kind").on(
      table.instanceId,
      table.state,
      table.kind
    ),
    index("asks_state").on(table.state),
  ]
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
    projectId: projectKey(),
    /** `board`, `table`, `pipeline` or `routines` (core `BLOCK_PAGES`). */
    page: storedEnum(z.enum(BLOCK_PAGES))("page").notNull(),
    /** A built-in block's word, or `view:<name>`. */
    block: text("block").notNull(),
    /** Its place in its page's order, from 0. */
    position: integer("position").notNull(),
    width: storedEnum(z.enum(BLOCK_WIDTHS))("width").notNull(),
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
    projectId: projectKey(),
    /** The draft view's name (`views/drafts/<view>.oui`). */
    view: text("view").notNull(),
    page: storedEnum(z.enum(BLOCK_PAGES))("page").notNull(),
    /** Its place in the page's order, from 0, or null: the page's end. */
    position: integer("position"),
    /** Who drafted it: "Caw", or a session's name. */
    proposedBy: text("proposed_by").notNull(),
    proposedAt: timestamp("proposed_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.view] })]
);
