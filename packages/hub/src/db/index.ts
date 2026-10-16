import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentRow,
  BuildInfo,
  DelegateAskStatus,
  DelegateEvent,
  DelegateEventKind,
  DelegateEventPayload,
  EffortLevel,
  Envelope,
  FleetAgent,
  FleetConfig,
  FleetHook,
  FleetMarketplace,
  FleetMcpConfig,
  FleetMcpServer,
  FleetPlugin,
  FleetScope,
  FleetSkillMeta,
  FleetSyncReport,
  FleetWatchNotice,
  HarnessReport,
  HookEvent,
  HookHandler,
  McpPlatform,
  MemoryScope,
  OnCap,
  OpenCodeGoLimits,
  PlanStep,
  Rule,
  RuleState,
  RuleStats,
  RunKind,
  SessionEffort,
  SessionEndIntent,
  SessionLimits,
  SessionTooling,
  SkillFile,
  StoppedCommands,
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
  CONTINUATION_ORIGIN,
  REMOVED_MACHINE,
  RESTART_LOST,
  resolveRates,
  stoppedWords,
} from "@cawco/core";
import { hashFiles } from "@cawco/core/file-hash";
import {
  type MachinePath,
  MachinePathRefused,
  machinePath,
} from "@cawco/core/machine-path";
import { ownIdentity } from "@cawco/core/process-identity";
import { runtimeTree, standalone } from "@cawco/core/runtime";
import { writeStateFileSync } from "@cawco/core/state-file";
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
  like,
  lt,
  lte,
  ne,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { AnySQLiteColumn, AnySQLiteTable } from "drizzle-orm/sqlite-core";
import { Context, Effect, Layer } from "effect";
import { bundledSkills, starterSkills } from "../bundled-skills";
import { DB_PATH } from "../config";
import { sessionLabel } from "../labels";
import { HubLifetime } from "../lifetime";
import type { MoveState } from "../moves";
import type { StagesTemplate } from "../stages";
import { workflowSkill } from "../workflows/skills";
import { type AccountsDb, accountsDb } from "./accounts";
import { type ActionsDb, actionsDb } from "./actions";
import { type ArtifactsDb, artifactsDb } from "./artifacts";
import { type AtLimitDb, atLimitDb } from "./at-limit";
import { type BlocksDb, blocksDb } from "./blocks";
import { type ConnectionsDb, connectionsDb } from "./connections";
import { type DesignOffersDb, designOffersDb } from "./design-offers";
import { type FindDb, findDb } from "./find";
import { type HubAuthDb, hubAuthDb } from "./hub-auth";
import { type IngressDb, ingressDb } from "./ingress";
import { type PreviewsDb, previewsDb } from "./previews";
import { type RelaysDb, relaysDb } from "./relays";
import { type RoutinesDb, routinesDb } from "./routines";
import {
  accountSignins,
  accounts,
  actions,
  agentHarnesses,
  agents,
  agentTools,
  artifacts,
  capabilityUsageDaily,
  cawTurns,
  claudeContextWindows,
  completedTurns,
  connectionProjects,
  connectorPolls,
  continuations,
  credentials,
  delegateEvents,
  eventRoutes,
  fleetAgents,
  fleetDeniedTools,
  fleetHookHistory,
  fleetHooks,
  fleetMcpOauth,
  fleetMcpSessions,
  fleetMemory,
  fleetMemoryDocProjects,
  fleetMemoryDocs,
  fleetMemoryHistory,
  fleetSkillHistory,
  fleetWatchNotices,
  fleetWatchSettings,
  githubPollCursors,
  githubPollers,
  type HubFolder,
  inboundEvents,
  instanceAliases,
  instanceConversations,
  instances,
  jevSettings,
  leadCalls,
  leadTurnReading,
  leadTurns,
  leadTurnWaiting,
  limitEvents,
  limitHolds,
  limitSummaries,
  marketplaces,
  mcpServers,
  mcpToolListings,
  moves,
  notificationCleared,
  notificationSent,
  type OpenSubagent,
  openrouterConnection,
  type PriorConversation,
  parkedAsks,
  plugins,
  projectAccounts,
  projectOffers,
  projectPlaces,
  projectRepositories,
  projects,
  projectTaskEdges,
  projectTaskFields,
  projectTaskLabels,
  projectTasks,
  projectThreads,
  pushDevices,
  queuedTaskStarts,
  queuedWorkItemGlobs,
  queuedWorkItems,
  relays,
  routines,
  ruleState,
  rules,
  type SessionLineKind,
  sentMessages,
  sessionIdentities,
  sessionLimits,
  sessionLines,
  sessionPlans,
  sessionSubagents,
  sessionTaints,
  skills,
  spendSettings,
  supervisorConfig,
  type Tracker,
  threadMessages,
  threadMessageTasks,
  tools,
  upstreamSettings,
  usageBuckets,
  usageLimits,
  workflowAttempts,
  workflowHeldStops,
  workflowNotices,
  workflowRunLog,
  workflowRunNotes,
  workflowRunPendingEnds,
  workflowRunSlots,
  workflowRuns,
  workflowSteps,
  workflows,
  workItemGlobs,
  workItems,
  workspaceCreates,
  workspaces,
} from "./schema";
import { sealAtRest } from "./seal-at-rest";
import { type StartersDb, startersDb } from "./starters";
import { type TurnUsageDb, turnUsageDb } from "./turn-usage";

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
  ? runtimeTree("drizzle")
  : Bun.fileURLToPath(
      new URL(
        typeof __CAWCO_RELEASE__ === "boolean" ? "./drizzle" : "../../drizzle",
        import.meta.url
      )
    );

export type InstanceKind = (typeof instances.$inferSelect)["kind"];
export type InstanceRole = NonNullable<(typeof instances.$inferSelect)["role"]>;
/**
 * A session's stored row, its `cwd` named as {@link MachinePath}, which the
 * API's schema reads as the string it is on the wire.
 */
type StoredInstanceRow = Omit<typeof instances.$inferSelect, "cwd"> & {
  cwd: MachinePath;
};
/**
 * A session's row as the hub's readers take it: no hub-private column, and
 * no `tooling`. That is the session's MCP servers and tools, 17 KB of JSON a
 * row on average and 36 KB at most (2026-10-09), parsed on every read and
 * read by one route alone ({@link DbShape.instanceTooling}).
 */
export type PublicInstanceRow = Omit<
  StoredInstanceRow,
  | "tooling"
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
  | "freshStartAt"
  | "turnOpenAt"
>;
/** A limit line kept for a session ({@link DbShape.noteLimit}). */
export interface LimitNote {
  at: number;
  content: string;
  id: string;
}
/** How many of a session's limit lines are kept. */
export const LIMIT_NOTES_KEPT = 20;
/** A fleet-watch line kept for a session ({@link DbShape.noteWatchLine}). */
export type WatchLine = LimitNote;
/** How many of a session's fleet-watch lines are kept. */
export const WATCH_LINES_KEPT = 20;
/** A session's move line ({@link DbShape.noteMovedHere}). */
export interface MovedHere {
  at: number;
  moved: string;
  stayed?: string;
}
export type BoardInstanceRow = PublicInstanceRow;
/** A session's whole row but its `tooling` ({@link PublicInstanceRow}). */
export type OwnedInstanceRow = Omit<StoredInstanceRow, "tooling">;
export type PlaceRow = typeof projectPlaces.$inferSelect;
/**
 * A project as every client reads it: its row, whose `machineId` and `cwd`
 * are its primary place, and every place it has, the primary first.
 */
export type ProjectRow = Omit<
  typeof projects.$inferSelect,
  "accountsLimited"
> & {
  /** The accounts its sessions may run on (`project_accounts`); null: every account. */
  accounts: string[] | null;
  places: PlaceRow[];
};
/** One task file as a project's task index holds it (tasks.ts). */
export type TaskIndexRow = typeof projectTasks.$inferSelect & {
  /** The tasks it waits for (`tsk-…`), as its file lists them. */
  after: string[];
  /** The tasks it is related to: the canvas's other edges. */
  related: string[];
  labels: string[];
  /** Its file's own scalar fields (`priority`, `due`), as written. */
  fields: Record<string, string>;
};
/** A device the iOS app registered for pushes, by its Cawrier pairing. */
/** A device the hub can push to: its sealed pairing secret and key opened. */
export type PushDeviceRow = Omit<
  typeof pushDevices.$inferSelect,
  "secret" | "key"
> & { key: string; secret: string };
export type ProjectOfferRow = typeof projectOffers.$inferSelect;
export type SessionPlanRow = typeof sessionPlans.$inferSelect;
/** What a session has done that taints its memory notes (memory.ts), its open subagents with it. */
export type SessionTaintRow = typeof sessionTaints.$inferSelect & {
  subagents: OpenSubagent[];
};
/** One of Caw's shell or edit calls (lead-gate.ts). */
export type LeadCallRow = typeof leadCalls.$inferSelect;
/**
 * A lead's turn (caw.ts `turns`): the threads its turn under way read
 * (`lead_turn_reading`), and its unread wakes by send uuid, each the thread
 * it woke or `""` for none (`lead_turn_waiting`).
 */
export type LeadTurnRow = typeof leadTurns.$inferSelect & {
  reading: string[];
  waiting: Record<string, string>;
};
export type ThreadRow = typeof projectThreads.$inferSelect;
/** A thread's message, with the tasks it is about (`thread_message_tasks`); null for none. */
export type ThreadMessageRow = typeof threadMessages.$inferSelect & {
  tasks: string[] | null;
};
/** A thread as its project's list shows it: with its newest message. */
export type ThreadListRow = ThreadRow & { last: string };
export type ContinuationRow = typeof continuations.$inferSelect;
/** A project move as moves.ts reads it: its state whole, the machines it names put back in it. */
export type MoveRow = Omit<
  typeof moves.$inferSelect,
  "state" | "sourceMachineId" | "targetMachineId" | "stopOn"
> & { state: MoveState };
export type WorkflowRow = typeof workflows.$inferSelect;
export type WorkflowRunRow = typeof workflowRuns.$inferSelect;
/** A step's held stop (`workflow_held_stops`): when its attempt was due, why it ended, and what was decided. */
export interface WorkflowHeldStop {
  action?: "fail" | "retry";
  deadline: number;
  error?: string;
  failure: string;
}
export type WorkflowStepRow = typeof workflowSteps.$inferSelect;
export type WorkflowAttemptRow = typeof workflowAttempts.$inferSelect;
export type WorkflowLogRow = typeof workflowRunLog.$inferSelect;
export type WorkflowNoticeRow = typeof workflowNotices.$inferSelect;
export type WorkItemRow = typeof workItems.$inferSelect;
export type QueuedTaskStartRow = typeof queuedTaskStarts.$inferSelect;
/**
 * A queued delegate as the queue hands it out: its request whole again,
 * the task, session id and globs it stands under put back in it from their
 * columns and rows.
 */
export type QueuedWorkItemRow = Omit<
  typeof queuedWorkItems.$inferSelect,
  "projectId" | "taskId" | "queuedInstanceId"
>;
/** Its paths named as {@link MachinePath}, which the API's schema reads as the string it is on the wire. */
export type WorkspaceRow = Omit<
  typeof workspaces.$inferSelect,
  "path" | "repoRoot"
> & { path: MachinePath; repoRoot: MachinePath };
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

/**
 * The listings' one clock-bound rule, for a row already read: running or
 * asleep, or moved within {@link STALE_AFTER_MS}. A row the board keeps
 * leaves it by this as the listing's own query would drop it, with no write.
 */
export const listedAt = (
  row: { status: string; updatedAt: Date },
  now: number
): boolean =>
  row.status === "running" ||
  row.status === "sleeping" ||
  row.updatedAt.getTime() > now - STALE_AFTER_MS;
/** The span of a usage bucket stored before quarters (`usage_buckets.span_ms`). */
const HOUR_MS = 60 * 60 * 1000;

export type AgentAuth = (typeof agents.$inferSelect)["auth"];

export type SentMessageRow = typeof sentMessages.$inferSelect;

/**
 * What a session going on in a fresh conversation of its own changes on its
 * row ({@link DbShape.continueInPlace}): the account, harness and model the
 * new conversation runs on, and the `continued` line drawn after the one it
 * leaves.
 */
export interface InPlaceSwitch {
  accountId: string | null;
  /** The effort the caller chose for the new conversation; absent, it keeps the session's chosen one. */
  effort?: EffortLevel;
  harness: string;
  model: string | null;
  /** The `limit_events` id of the line drawn between the two conversations. */
  next: string;
}

/** What folding a session's former rows into it did, for the hub's log. */
export interface FoldedSession {
  /** The former rows whose process may still run: each is ended at its machine's register, then goes. */
  ending: string[];
  formers: string[];
  instanceId: string;
  /** Sends that failed only because a process went away, pending again for the session now. */
  owedAgain: string[];
}

/** What a continuation's new session took on from the session it continues ({@link DbShape.adoptChildren}). */
export interface AdoptedChildren {
  asks: number;
  items: number;
  queuedItems: number;
  queuedStarts: number;
  sessions: string[];
}

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
  /** The sessions it is loaded into; absent is a linked document under `~/.claude/memories/`. */
  scope?: MemoryScope;
  updatedAt: Date;
}

/** A stored row as the hub answers it, its projects read off the link table. */
const memoryDocRow = (
  row: typeof fleetMemoryDocs.$inferSelect,
  projectIds: readonly string[]
): MemoryDocRow => {
  const scope: MemoryScope = {
    ...(row.role ? { role: row.role } : {}),
    ...(projectIds.length > 0 ? { projectIds: [...projectIds].sort() } : {}),
  };
  return {
    path: row.path,
    content: row.content,
    hash: row.hash,
    ...(scope.role || scope.projectIds ? { scope } : {}),
    updatedAt: row.updatedAt,
  };
};

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

/** One superseded version of one skill, as a listing reads it — without its files. */
export interface SkillVersion {
  bytes: number;
  createdAt: Date;
  hash: string;
  id: number;
  name: string;
  /** `fleet` for the hub's own row; `machine:<machineId>` for an edited copy an overwrite took off it. */
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

/** A stored OpenCode Go reading, one per machine (USAGE-SPEC.md §6). */
export type UsageLimitRow = typeof usageLimits.$inferSelect;

export interface DbShape {
  /** Accounts, where they are signed in, how they route, and their limits. */
  readonly accounts: AccountsDb;
  readonly acknowledgeAddress: (id: string) => void;
  readonly acknowledgeSessionIdentity: (
    instanceId: string,
    hash: string
  ) => boolean;
  /** Approved actions: one exact tool call each, run once (actions.ts). */
  readonly actions: ActionsDb;
  /** A machine's active workspaces: an item there is live, or the hub has not settled it since. */
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
   * and folder is answered as it is, with `added` false. A project's first
   * checkout becomes its primary.
   */
  readonly addPlace: (
    place:
      | {
          projectId: string;
          machineId: string;
          path: MachinePath;
          kind: "checkout" | "workspace";
        }
      | {
          projectId: string;
          machineId: string;
          path: HubFolder;
          kind: "hub";
        }
  ) => { place: PlaceRow; added: boolean };
  /**
   * Adds a message to a thread, which moves it to the top of its project's
   * list. `createdAt` is when it was said, for words written in after the
   * fact (a repair): the thread's own time moves only forward.
   */
  readonly addThreadMessage: (
    message: Pick<ThreadMessageRow, "threadId" | "author" | "body"> &
      Partial<
        Pick<
          ThreadMessageRow,
          | "id"
          | "noteTitle"
          | "event"
          | "tasks"
          | "files"
          | "question"
          | "answer"
          | "images"
          | "attachments"
          | "createdAt"
        >
      >
  ) => { thread: ThreadRow; message: ThreadMessageRow };
  /** Appends a supervisor's note for a run. */
  readonly addWorkflowNote: (runId: string, text: string) => void;
  /**
   * A session continued in a new session (`to`) hands it its live work, in
   * one transaction: its delegates that have not ended, and the sessions of
   * its live items, become `to`'s; so do its live work items, every item of
   * those sessions, and every item of a group not yet reported that one of
   * them is in (the group reports once, to one parent); its queued delegates
   * and queued task starts; and the asks of the moved delegates still
   * waiting on an answer. What `from` delegated and is over stays its own.
   */
  readonly adoptChildren: (from: string, to: string) => AdoptedChildren;
  /** A machine's last-known tool status by id; empty for one that never reported. */
  readonly agentAddressContract: (machineId: string) => boolean;
  readonly agentHarnesses: (machineId: string) => HarnessReport[] | undefined;
  readonly agentTools: (machineId: string) => Record<string, ToolStatus>;
  /** Every project's threads, newest first. */
  readonly allThreads: () => ThreadRow[];
  /** Records the answer, filing the offer first when it was taken unprompted. */
  readonly answerProjectOffer: (
    instanceId: string,
    answer: "accepted" | "dismissed",
    projectId?: string
  ) => void;
  /** Artifacts and their documents' update logs (artifacts/). */
  readonly artifacts: ArtifactsDb;
  /** Sessions held at their account's limit, summaries kept ahead of it, and the lines it wrote. */
  readonly atLimit: AtLimitDb;
  /** Records ownership before sending a create; a restart discards anything still unfiled. */
  readonly beginWorkspaceCreate: (id: string, machineId: string) => void;
  /** Each project page's arrangement of blocks (blocks.ts). */
  readonly blocks: BlocksDb;
  /** Books what one Caw turn cost, to the thread that woke it (null: none did). */
  readonly bookCawTurn: (turn: {
    harness: string;
    projectId: string;
    threadId: string | null;
    usd: number;
  }) => void;
  /** Whether nothing has been counted yet — the backfill's cue. */
  readonly capabilityUsageEmpty: () => boolean;
  /** Every usage row on or after `day` (`YYYY-MM-DD`). */
  readonly capabilityUsageSince: (
    day: string
  ) => (typeof capabilityUsageDaily.$inferSelect)[];
  /** Dollars a project's Caw sessions have spent, from the usage their machines report. */
  /** Dollars the project's Caw turns have cost since `since` (ms epoch). */
  readonly cawSpentSince: (projectId: string, since: number) => number;
  /** The check workspaces, still with their checkout, that run a workspace's checks on other machines. */
  readonly checkWorkspacesOf: (workspaceId: string) => WorkspaceRow[];
  /**
   * The effort the operator chose for the session: what its every launch asks
   * for. Written by a spawn that names one and by a `set-effort`, never by a
   * reading ({@link DbShape.noteInstanceEffort}).
   */
  readonly chooseEffort: (id: string, effort: EffortLevel) => void;
  /** Claims one harness completion before any turn-end side effect. */
  readonly claimCompletedTurn: (
    instanceId: string,
    resultId: string,
    completedAt: string | undefined,
    recovered: boolean
  ) => boolean;
  /** Every claude model's last observed context window, by model id. */
  readonly claudeContextWindows: () => Record<string, number>;
  /** Each listed Claude session on a machine with a conversation, and its account: no more of its row. */
  readonly claudeConversationsOn: (machineId: string) => {
    accountId: string | null;
    id: string;
    sessionId: string;
  }[];
  readonly clearEndConfirmation: (id: string) => void;
  readonly clearFleetMemory: () => void;
  /** Forget the OpenRouter key. */
  readonly clearOpenRouterConnection: () => void;
  /** Closes the connection: the hub's lifetime's last release (lifetime.ts). */
  readonly close: () => void;
  /** The session's turn ended. */
  readonly closeTurn: (id: string) => void;
  /** A receipt for the current row's decision; deletes are finalized here. */
  readonly confirmInstanceEnd: (id: string, reason?: string) => void;
  /** Connections and the projects that grant them (connections.ts). */
  readonly connections: ConnectionsDb;
  readonly continuationRow: (id: string) => ContinuationRow | undefined;
  /** Every continuation job, oldest first. */
  readonly continuationRows: () => ContinuationRow[];
  /**
   * The session goes on in a fresh conversation of its own: the one it ran
   * (`sessionId`, on the account and harness its row named) is kept, last,
   * in `conversations` with `next` drawn after it, and the row names no
   * conversation until the new one's `init` says its key, on the account,
   * harness and model `to` names, its spend and context counted from
   * nothing. Once per `next`: a switch already kept answers false.
   */
  readonly continueInPlace: (id: string, to: InPlaceSwitch) => boolean;
  /**
   * A project, with its folder on the hub as its first place, and the
   * checkout it was made from (`checkout`), its primary, when it has one.
   */
  readonly createProject: (project: {
    id: string;
    name: string;
    checkout?: { machineId: string; path: MachinePath };
    remote: string | null;
    /** Made with Caw: its Caw starts on. */
    caw?: boolean;
    /** The stage template it is made from. */
    template?: StagesTemplate | null;
  }) => ProjectRow;
  /** Files a thread with its first message: yours, or an event that had no thread to go to. */
  readonly createThread: (thread: {
    id: string;
    projectId: string;
    title: string;
    /** The project's Setup thread (caw.ts `setup`). */
    setup?: boolean;
    first: Pick<ThreadMessageRow, "author" | "body"> &
      Partial<
        Pick<
          ThreadMessageRow,
          "id" | "noteTitle" | "event" | "images" | "attachments"
        >
      >;
  }) => { thread: ThreadRow; message: ThreadMessageRow };
  /** Files a work item as the hub accepted it. */
  /** Files a work item as the hub accepted it, the globs it owns with it in one transaction. */
  readonly createWorkItem: (
    item: typeof workItems.$inferInsert & { owns?: string[] | null }
  ) => WorkItemRow;
  /** Files a workspace whose checkout its machine has just made. */
  readonly createWorkspace: (
    workspace: typeof workspaces.$inferInsert
  ) => WorkspaceRow;
  /**
   * A machine's catalog's word on when each stored conversation last changed,
   * written onto its rows that are not live. Returns how many rows it moved.
   */
  readonly dateStoredSessions: (
    machineId: string,
    liveIds: string[],
    resumableAt?: Record<string, number>
  ) => number;
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
   * happened. A project whose primary checkout was there moves it to its
   * next checkout, or has none yet; every project keeps its folder on the
   * hub, so none goes. Answers which sessions went, for the confirm's receipt.
   */
  readonly deleteMachine: (machineId: string) => {
    instanceIds: string[];
  };
  readonly deleteMarketplace: (name: string) => void;
  readonly deleteMcpOauth: (name: string) => void;
  readonly deleteMcpServer: (name: string) => void;
  /** A fleet MCP relay session closed: its `initialize` params go. */
  readonly deleteMcpSession: (id: string) => void;
  readonly deleteMove: (id: string) => void;
  readonly deletePlugin: (id: string) => void;
  /** The project and its places; the sessions started from it stay, unattached. */
  readonly deleteProject: (id: string) => void;
  /** Removes the rule and every session's standing with it. */
  readonly deleteRule: (id: string) => void;
  readonly deleteSkill: (name: string) => void;
  readonly deleteWorkflow: (id: string) => void;
  /** A kept supervisor notice that has now been sent. */
  readonly deleteWorkflowNotice: (id: number) => void;
  /** Caw's one design-system offer per project (design-offers.ts). */
  readonly designOffers: DesignOffersDb;
  /** His turn is over: its row goes. */
  readonly dropLeadTurn: (instanceId: string) => void;
  /** A cancelled move's held row leaves the board, while no spawn has taken it on. True when it went. */
  readonly dropMovingInstance: (id: string) => boolean;
  /** Forgets a task's queued start, if it had one. */
  readonly dropQueuedTaskStart: (projectId: string, taskId: string) => void;
  readonly dropQueuedWorkItem: (id: string) => void;
  /** Forgets the index rows of task files that are gone. */
  readonly dropTaskIndex: (projectId: string, paths: string[]) => void;
  /** Takes the session's notice down; true when it had one. */
  readonly dropWatchNotice: (instanceId: string) => boolean;
  /** A step's stop is confirmed: it holds no more. */
  readonly dropWorkflowHeldStop: (stepId: string) => void;
  /** Persist the decision before its reconciler may send anything. */
  readonly endInstance: (
    id: string,
    intent: SessionEndIntent
  ) => typeof instances.$inferSelect | undefined;
  /** The agent reported the session dead: what killed it, kept for late readers. */
  readonly failInstance: (id: string, error: string) => void;
  /** What the find engine reads (find.ts), and when the person last looked at each session. */
  readonly find: FindDb;
  /** Transcript deletion follows confirmed process exit, never precedes it. */
  readonly finishTranscriptDelete: (id: string) => void;
  readonly finishWorkspaceCreate: (id: string) => void;
  /** The whole desired fleet state (NEW.md §11) — what a machine is sent to converge on. */
  /**
   * The fleet's desired state, every content-carrying row with its files.
   * What a given machine already holds is left out at the push, from a read
   * of that machine's disk (server.ts pushFleetConfig).
   */
  readonly fleetConfig: () => FleetConfig;
  readonly fleetHookVersion: (
    id: number
  ) => (HookVersion & HookVersionMaterial) | undefined;
  readonly fleetMemoryVersion: (
    id: number
  ) => (MemoryVersion & { content: string }) | undefined;
  /** A skill's superseded version in full: what restoring it writes back. */
  readonly fleetSkillVersion: (
    id: number
  ) => (SkillVersion & { skillSource: string; files: SkillFile[] }) | undefined;
  /** Whether fleet watch is on for the fleet; on while no row says otherwise. */
  readonly fleetWatchOn: () => boolean;
  /**
   * Folds every former session ({@link instanceAliases}) not yet folded into
   * the session it is now, one transaction each: what answered to it, what
   * it ran, what it was sent and wrote, its conversation (into
   * `conversations`, in the order the conversations started), and the sends
   * that failed only because one of its processes went away, owed again.
   * Its row goes, or, with a process that may still run, is ended (`delete`)
   * so its machine stops it first. What each fold did.
   */
  readonly foldFormerSessions: (
    /** Whether a send that failed for `reason` failed only because a process went away. */
    owedAgain: (reason: string) => boolean
  ) => FoldedSession[];
  /**
   * Folds a duplicate project into the one it duplicates (project-merge.ts),
   * in one transaction: its checkout and workspace places join `keepId`'s
   * (the same folder once), and every row that names it becomes `keepId`'s
   * (sessions, work items, threads, Caw's turns and calls, the rules scoped
   * to it, routines with their routes and polls, events, actions, relays,
   * moves, artifacts, notices, fleet rows, offers, granted connections,
   * queued starts), task ids renamed through `taskIds`; then its row goes.
   * `keepId`'s settings, allowed accounts, primary place, repositories and
   * GitHub poller stand. Answers what moved.
   */
  readonly foldProject: (
    dupId: string,
    keepId: string,
    taskIds: ReadonlyMap<string, string>
  ) => { places: number; sessions: number; threads: number; workItems: number };
  /** Every former id, by the id its session has now ({@link instanceIdOf}). */
  readonly formerIds: () => Record<string, string>;
  /** When a session last started again fresh; null when it never did. */
  readonly freshStartOf: (id: string) => number | null;
  readonly getCredential: (id: string) => Record<string, unknown> | undefined;
  readonly getFleetHook: (id: string) => FleetHook | undefined;
  /** The fleet's user-scope CLAUDE.md, or undefined while the fleet keeps none. */
  readonly getFleetMemory: () =>
    { content: string; hash: string; updatedAt: Date } | undefined;
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
  /**
   * Jev's own settings: the TypeSafe key the hub holds (null while none is,
   * or when the hub's key does not open it) and the suggestions switch.
   */
  readonly getJevSettings: () => {
    suggestWhileTyping: boolean;
    typesafeKey: string | null;
    typesafeKeySetAt: Date | null;
  };
  readonly getMcpOauth: (
    name: string
  ) => typeof fleetMcpOauth.$inferSelect | undefined;
  readonly getMcpServer: (name: string) =>
    | (Omit<typeof mcpServers.$inferSelect, "config"> & {
        config: FleetMcpConfig;
      })
    | undefined;
  /** The `initialize` params a fleet MCP relay session of `server` opened with, if it is kept. */
  readonly getMcpSession: (
    id: string,
    server: string
  ) => Record<string, unknown> | undefined;
  /** The stored OpenRouter key and when it was connected, or undefined while not connected. */
  readonly getOpenRouterConnection: () =>
    { apiKey: string; connectedAt: Date } | undefined;
  /** One rule, or nothing when it has been deleted out from under a caller. */
  readonly getRule: (id: string) => Rule | undefined;
  /** The fleet's choices row (`supervisor_config`), or undefined while none is stored. */
  readonly getSupervisorConfig: () =>
    | {
        deniedTools: string[] | null;
        cawcoTodos: boolean;
        choicesSetAt: Date | null;
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
  /**
   * The cut turn `from` was handed back at `at`, which is now the session's
   * open turn. False when the row no longer holds `from`: another hand-back
   * or a turn took its place.
   */
  readonly handBackTurn: (id: string, from: number, at: number) => boolean;
  /** Every machine's held workspaces (schema.ts `WorkspaceState`), newest first. */
  readonly heldWorkspaces: () => WorkspaceRow[];
  readonly hiddenSession: (id: string) => boolean;
  /**
   * A move's session on the board from the move's start (moves.ts): its row
   * under the id it starts under, `moving`, named by its New session title
   * or its first prompt's words. Its start's spawn ({@link openInstance})
   * takes the same row on. True when this wrote it.
   */
  readonly holdMovingInstance: (instance: {
    id: string;
    machineId: string;
    cwd: MachinePath;
    projectId: string;
    harness?: string;
    model?: string;
    permissionMode?: string;
    title?: string;
    derivedTitle?: string;
    at: Date;
  }) => boolean;
  /**
   * A pending send no process took, owed again whole (`envelope`) until the
   * session's next start; false when it is no longer pending.
   */
  readonly holdSend: (uuid: string, envelope: string) => boolean;
  /** Who may call the hub: the pairing setting, the person's devices, the machines' keys (hub-auth.ts). */
  readonly hubAuth: HubAuthDb;
  /** Inbound events, their routes and the pollers that bring them in (ingress.ts). */
  readonly ingress: IngressDb;
  readonly insertContinuation: (
    row: Omit<ContinuationRow, "createdAt" | "updatedAt">
  ) => ContinuationRow;
  readonly insertMove: (
    row: Omit<MoveRow, "createdAt" | "updatedAt">
  ) => MoveRow;
  /** Look up a single non-discarded instance by its harness sessionId. */
  readonly instanceBySessionId: (
    sessionId: string
  ) => PublicInstanceRow | undefined;
  /**
   * The session an id names now: a former id (a session whose continuations
   * at its account's limit the hub folded into one, migration 0128) is the
   * session it is part of; any other id is itself. Every path that takes a
   * session id from outside — a send, a wake, a control, a tool's target, a
   * link — reads it here.
   */
  readonly instanceIdOf: (id: string) => string;
  /** The MCP servers and tools a session's newest `init` announced. */
  readonly instanceTooling: (id: string) => SessionTooling | null | undefined;
  /** The listed sessions whose keep-alive is on: the only ones it schedules. */
  readonly keepAliveInstances: () => PublicInstanceRow[];
  /** Keeps a pending send whole, as its machine was handed it. */
  readonly keepEnvelope: (uuid: string, envelope: string) => void;
  /**
   * The directory a row was launched in, which every spawn of it uses;
   * `"unknown"` when its machine had no record of its conversation; undefined
   * for a new id.
   */
  readonly launchDirOf: (
    id: string
  ) => { cwd: MachinePath } | { unknown: true } | undefined;
  /** Adds what a Caw turn the thread woke cost to the thread's spend. */
  /** Caw's shell and edit calls (lead-gate.ts): kept, read back and changed as each one's outcome is known. */
  readonly leadCalls: {
    readonly add: (row: LeadCallRow) => void;
    readonly ofRequest: (requestId: string) => LeadCallRow | undefined;
    readonly ofToolUse: (
      instanceId: string,
      toolUseId: string
    ) => LeadCallRow | undefined;
    readonly set: (
      id: string,
      patch: Partial<Omit<LeadCallRow, "id" | "projectId">>
    ) => void;
    /** A project's calls from `since` on, oldest first. */
    readonly since: (projectId: string, since: Date) => LeadCallRow[];
  };
  /** The sends to a project's Caw sessions (role `lead`) accepted after `after`, oldest first. */
  readonly leadSends: (projectId: string, after: Date) => SentMessageRow[];
  /** The turn each project's Caw is in now, as stored (caw.ts reads them back on start). */
  readonly leadTurns: () => LeadTurnRow[];
  /** The limit lines kept on the session's row, oldest first. */
  readonly limitNotesOf: (id: string) => LimitNote[];
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
  /** {@link listBoardInstances}, of these ids only. */
  readonly listedBoardInstancesByIds: (ids: string[]) => BoardInstanceRow[];
  /** How many listed sessions this one started. */
  readonly listedChildCount: (parentInstanceId: string) => number;
  /** {@link listInstances}, of these ids only: by key, the same rows it would list. */
  readonly listedInstancesByIds: (ids: string[]) => PublicInstanceRow[];
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
  /** Newest first, without the files: one skill's history. */
  readonly listFleetSkillHistory: (name: string) => SkillVersion[];
  /**
   * Every listed row. A pass over the whole fleet only: what asks about one
   * session or a few reads them by key ({@link listedInstancesByIds}), since
   * each call reads and parses every row (2,600 of them, 2026-10-09).
   */
  readonly listInstances: () => PublicInstanceRow[];
  /**
   * Runs not yet ended (running, waiting, or holding a stop: its
   * `ending_status`), narrowed in SQL to one parent's children or one
   * machine's runs; whole rows, because the engine writes them back.
   */
  readonly listLiveWorkflowRuns: (by: {
    machineId?: string;
    parentRunId?: string;
  }) => WorkflowRunRow[];
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
  /** The fleet's tool policy (NEW.md §10) — only the tools somebody has ruled on. */
  readonly listToolPolicies: () => ToolPolicy[];
  /** Every machine's latest OpenCode Go reading. */
  readonly listUsageLimits: () => UsageLimitRow[];
  readonly listWorkflowAttempts: (stepId: string) => WorkflowAttemptRow[];
  /** A run's log, in effect order. */
  readonly listWorkflowLog: (runId: string) => WorkflowLogRow[];
  /** Every supervisor notice still waiting to be sent, oldest first. */
  readonly listWorkflowNotices: () => WorkflowNoticeRow[];
  /** One workflow's runs, newest first, as its run list carries them: no JSON column, no log. */
  readonly listWorkflowRunSummaries: (
    workflowId: string
  ) => Pick<
    WorkflowRunRow,
    | "endedAt"
    | "failure"
    | "id"
    | "machineId"
    | "parentRunId"
    | "seenAt"
    | "startedAt"
    | "status"
    | "supervisorInstanceId"
    | "workflowId"
    | "workspace"
  >[];
  readonly listWorkflowSteps: (runId: string) => WorkflowStepRow[];
  /** Every workflow but its program, newest edit first: the list. */
  readonly listWorkflows: () => Omit<WorkflowRow, "program">[];
  /** The listed sessions running or starting on one machine. */
  readonly liveInstancesOn: (machineId: string) => PublicInstanceRow[];
  /** Where each live top-level mainline session works, and no more of it. */
  readonly liveMainlineFolders: () => {
    cwd: MachinePath;
    id: string;
    machineId: string;
  }[];
  /** The live work items (starting or running) that own files, each with its globs: one join on `work_item_globs`. */
  readonly liveOwningWorkItems: () => {
    globs: string[];
    item: WorkItemRow;
  }[];
  /** Every work item still `starting`/`running`, fleet-wide. */
  readonly liveWorkItems: () => WorkItemRow[];
  /** The work items a session delegated that are still `starting`/`running`. */
  readonly liveWorkItemsOf: (parentInstanceId: string) => WorkItemRow[];
  /** The ids of a machine's workspaces with a live work item (starting or running). */
  readonly liveWorkspacesOn: (machineId: string) => string[];
  /**
   * `raw` as a path on `machineId` ({@link machinePath}), against the home
   * that machine's daemon reported. Every path a person or a session names
   * for a machine comes through here before anything stores or runs in it.
   * A path it will not make answers its {@link MachinePathRefused}, the
   * sentence the caller refuses with.
   */
  readonly machinePathOn: (
    machineId: string,
    raw: string
  ) => MachinePath | MachinePathRefused;
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
   * An attach to a process sessiond still holds is on its way: a row filed
   * asleep, failed or unknown is `starting` until its `init` or a beat lists
   * it. Its launch (`spawnedAt`) and `updatedAt` are untouched: the process
   * is the same one, and it did nothing. Returns whether the row moved.
   */
  readonly markInstanceAttaching: (id: string) => boolean;
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
  /**
   * What each harness on the machine can do, as its daemon's report beat
   * said: every harness the beat names is replaced, and one it leaves out
   * keeps its last report, since its daemon could not read it this time.
   */
  readonly mergeAgentHarnesses: (
    machineId: string,
    harnesses: HarnessReport[]
  ) => void;
  /** A whole report: every id it names is replaced, every other cell survives. */
  readonly mergeAgentTools: (machineId: string, statuses: ToolStatus[]) => void;
  /** The move a session started from, as {@link noteMovedHere} kept it; null when none. */
  readonly movedHereOf: (id: string) => MovedHere | null;
  /** One project move's record (moves.ts). */
  readonly moveRow: (id: string) => MoveRow | undefined;
  /** Every project move, oldest first. */
  readonly moveRows: () => MoveRow[];
  /** The project moves that name a machine: a Cancel it has not heard, or a step on it or reading from it. */
  readonly moveRowsOn: (machineId: string) => MoveRow[];
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
  /**
   * A project's newest conversation: the thread whose newest message from
   * you or Caw is the newest. Event notes (a routine's runs, his call notes)
   * never rank it, and a routine's own thread (`routines.thread_id`) is never
   * one, whoever has written in it: it takes only its runs. Undefined when
   * no other thread has a word from either.
   */
  readonly newestConversation: (projectId: string) => ThreadRow | undefined;
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
  /** Records that a session started again fresh, now. */
  readonly noteFreshStart: (id: string, at: number) => void;
  /**
   * The effort the session's agent read back from its harness (`EFFORT_READ`).
   * Returns whether the row moved, so a reading repeated at every turn's end
   * does not re-publish the board. A reading never moves the session's
   * chosen effort ({@link DbShape.chooseEffort}).
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
    cwd?: MachinePath,
    harness?: string,
    tooling?: SessionTooling
  ) => void;
  /** Keeps a limit line on the session's row, the last {@link LIMIT_NOTES_KEPT}; false when one under its id is already kept. */
  readonly noteLimit: (id: string, note: LimitNote) => boolean;
  /** Records that a session started where its project was moved to for it: the move's ready line. */
  readonly noteMovedHere: (id: string, line: MovedHere) => void;
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
  /** The session's turn ended at `at`, on the hub's clock (`turnEndedAt`). */
  readonly noteTurnEnded: (id: string, at: Date) => void;
  /** Keeps a fleet-watch line on the session's row, the last {@link WATCH_LINES_KEPT}. */
  readonly noteWatchLine: (id: string, line: WatchLine) => void;
  /** What a device or Telegram was shown and what has been cleared, by collapse id (notifications.ts). */
  readonly notifications: {
    /** Shown under this collapse id: outstanding again, and no longer cleared. */
    readonly sent: (collapseId: string, at: Date) => void;
    /** When each of these ids was last sent, for those still outstanding. */
    readonly sentAt: (collapseIds: string[]) => Map<string, Date>;
    /**
     * Clears the ids that were sent and are still outstanding; `any` clears
     * an id however it was shown (a device's own dismiss). Answers the ids
     * this newly cleared, in the order given.
     */
    readonly clear: (collapseIds: string[], at: Date, any: boolean) => string[];
    /** Every id cleared at or after `since`, newest first. */
    readonly clearedSince: (
      since: Date
    ) => { collapseId: string; clearedAt: Date }[];
    /** Forgets sends and clears older than `before`. */
    readonly prune: (before: Date) => void;
  };
  /** Files an offer; false when the session was already offered one. */
  readonly offerProject: (offer: {
    instanceId: string;
    reason: ProjectOfferRow["reason"];
    line: string;
  }) => boolean;
  readonly openInstance: (instance: {
    addressProtocol?: boolean;
    id: string;
    machineId: string;
    cwd: MachinePath;
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
    /** The toolset it runs in; set once, at its first spawn. */
    role?: InstanceRole;
    /** The delegate type it was started as, and where it came from; set at its first spawn. */
    delegateType?: { name: string; projectId?: string };
    /** The thread with the project's Caw it works for; set once, at its spawn. */
    threadId?: string;
    /** The account placement chose; a row that has one keeps it. */
    accountId?: string;
    /**
     * A restore of the session's last launch: the turn that launch had open
     * ({@link instances.turnOpenAt}) stays, to be handed back. Every other
     * start is someone's own, and ends what was open.
     */
    keepTurn?: boolean;
  }) => void;
  /** The offers nobody has answered yet. */
  readonly openProjectOffers: () => ProjectOfferRow[];
  /**
   * The session's turn is under way, heard at `at`: kept when no turn of
   * this launch is ({@link instances.turnOpenAt}). Returns whether it moved.
   */
  readonly openTurn: (id: string, at: number) => boolean;
  /**
   * A pending send its process went away without reading, owed again from
   * the envelope its record kept ({@link sentMessages.envelope}). False when
   * it is no longer pending or kept none (a record from before envelopes
   * were kept).
   */
  readonly oweAgain: (uuid: string) => boolean;
  /** The sends still owed to their machine ({@link sentMessages.owed}), pending, in the order accepted: a session's, or a machine's. */
  readonly owedSends: (
    of: { instanceId: string } | { machineId: string }
  ) => SentMessageRow[];
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
  /** Whether the session's start is still owed to its machine ({@link oweSpawn}). */
  readonly owesSpawn: (id: string) => boolean;
  /**
   * The fields a dashboard may move on a live row: "Keep" — a spin-off that
   * earned its place stops being treated as scratch — and the model and
   * permission mode the session confirmed (its effort is the agent's reading,
   * {@link DbShape.noteInstanceEffort}). Also where a
   * delegate's session takes on a follow-up: its new work item, and the
   * session that delegated it.
   */
  readonly ownedInstance: (
    id: string,
    machineId?: string
  ) => OwnedInstanceRow | undefined;
  /**
   * The asks the hub holds parked (`pending.ts`), kept across its restarts:
   * read once as it boots, written as each is parked and dropped as it ends.
   */
  readonly parkedAsks: {
    readonly drop: (requestId: string) => void;
    readonly list: () => Envelope[];
    readonly save: (requestId: string, envelope: Envelope) => void;
  };
  readonly patchInstance: (
    id: string,
    patch: {
      kind?: InstanceKind;
      permissionMode?: string;
      model?: string;
      workItemId?: string | null;
      parentInstanceId?: string;
      /**
       * The account it moves to at its old one's limit, or as its model
       * changes provider; null when its new model runs on no account.
       */
      accountId?: string | null;
      forkedFrom?: string;
      threadId?: string;
      projectId?: string;
    }
  ) => PublicInstanceRow | undefined;
  /** Each session's preview port, and the fleet's preview mode (preview.ts). */
  readonly previews: PreviewsDb;
  /** The harness conversations a session had before the one it runs now, oldest first (`instance_conversations`). */
  readonly priorConversations: (instanceId: string) => PriorConversation[];
  /** A project with its places, or undefined for an id the hub does not hold. */
  readonly project: (id: string) => ProjectRow | undefined;
  /**
   * Every work item that is an attempt at one of the project's tasks, newest
   * first (dispatch.ts).
   */
  readonly projectAttempts: (projectId: string) => WorkItemRow[];
  /** The oldest project whose checkouts are of `remote` (normalised). */
  readonly projectByRemote: (remote: string) => ProjectRow | undefined;
  /** A session's "make this a project" offer, answered or not (project-offers.ts). */
  readonly projectOffer: (instanceId: string) => ProjectOfferRow | undefined;
  /** The project's repository on a machine, as the last workspace cut there recorded it. */
  readonly projectRepository: (
    projectId: string,
    machineId: string
  ) => MachinePath | undefined;
  /**
   * A project's spend since `todayStart` and `monthStart`, all of it and its
   * Caw's; each attempt at a task with its session's spend (oldest first);
   * each thread with how many messages in it woke Caw (newest first).
   */
  /**
   * The project's spend over today and this month, each part from its one
   * source: Caw's booked turns (by thread, and those no thread woke), every
   * attempt's session and every other session from the usage it reported.
   * The parts add up to the totals.
   */
  readonly projectSpend: (
    projectId: string,
    since: { monthStart: number; todayStart: number }
  ) => {
    caw: { monthUsd: number; todayUsd: number; unthreadedMonthUsd: number };
    others: { monthUsd: number; todayUsd: number };
    items: {
      at: number;
      state: string;
      taskId: string;
      title: string;
      type: string | null;
      usd: number;
    }[];
    monthUsd: number;
    threads: {
      id: string;
      lastAt: number;
      title: string;
      usd: number;
      wakes: number;
    }[];
    todayUsd: number;
  };
  /**
   * The project's delegated work since `since` (ms epoch), by the delegate
   * type each work item ran on (attempts, routine runs, delegates; null where
   * none was named): what their sessions reported spending in the window, and
   * how many items spent. Most first.
   */
  readonly projectSpendByType: (
    projectId: string,
    since: number
  ) => { items: number; type: string | null; usd: number }[];
  /**
   * Dollars the project has cost since `since` (ms epoch): its Caw's booked
   * turns and every other session's reported usage. What its cap counts.
   */
  readonly projectSpentSince: (projectId: string, since: number) => number;
  /**
   * Projects whose remote is not known yet, each with a checkout on
   * `machineId` to read it from.
   */
  readonly projectsWithoutRemote: (
    machineId: string
  ) => { projectId: string; path: string }[];
  /** A project's threads, newest first, each with its newest message. */
  readonly projectThreads: (projectId: string) => ThreadListRow[];
  /** Drops the fleet MCP relay sessions unused since `before`; answers how many. */
  readonly pruneMcpSessions: (before: Date) => number;
  /** The iOS app's pushes (push.ts): the devices that registered, by their Cawrier pairing. */
  readonly push: {
    readonly devices: () => PushDeviceRow[];
    /** Registers or refreshes a device; a refresh keeps its quiet setting unless one is given. */
    readonly putDevice: (
      device: Pick<
        PushDeviceRow,
        "key" | "name" | "pairingId" | "platform" | "secret"
      > & {
        quiet?: boolean;
      }
    ) => PushDeviceRow;
    /** False when no device has that pairing. */
    readonly dropDevice: (pairingId: string) => boolean;
    readonly setQuiet: (pairingId: string, quiet: boolean) => boolean;
    /** What Cawrier said to the last push for a device: taken (no error) or refused with a reason. */
    readonly noteResult: (pairingId: string, error: string | null) => void;
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
  /**
   * Upsert of one document; the hash is read off the content, as everywhere.
   * `scope` given replaces the stored one whole (`{}` makes it a linked
   * document again); left out, the stored scope stays.
   */
  readonly putFleetMemoryDoc: (doc: {
    path: string;
    content: string;
    scope?: MemoryScope;
  }) => MemoryDocRow;
  /** Stores the turn a project's Caw is in, replacing what his session had. */
  /** Stores a lead's turn as it stands, replacing what it had, its threads with it, in one transaction. */
  readonly putLeadTurn: (turn: LeadTurnRow) => void;
  readonly putMarketplace: (marketplace: FleetMarketplace) => FleetMarketplace;
  readonly putMcpOauth: (row: typeof fleetMcpOauth.$inferInsert) => void;
  /**
   * Upsert. `projectId` binds it to one project (placed at each of its
   * checkouts and workspaces), null makes it every machine's, and left out
   * keeps what it was. `platforms` the same way: the platforms it runs on,
   * null every platform, left out as it was.
   */
  readonly putMcpServer: (server: {
    name: string;
    config: FleetMcpServer["config"];
    enabled?: boolean;
    projectId?: string | null;
    platforms?: McpPlatform[] | null;
  }) => FleetMcpServer;
  /** A fleet MCP relay session opened: its `initialize` params, kept across hub restarts. */
  readonly putMcpSession: (row: {
    id: string;
    server: string;
    init: Record<string, unknown>;
  }) => void;
  /** Stores the machine's latest OpenCode Go reading; one row per machine. */
  readonly putOpenCodeGoLimits: (
    machineId: string,
    openCodeGo: OpenCodeGoLimits | null
  ) => void;
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
  /** Replaces a session's spec whole, its steps kept. */
  readonly putSessionSpec: (instanceId: string, spec: string) => void;
  /** Replaces a session's own steps whole, its spec kept. */
  readonly putSessionSteps: (instanceId: string, steps: PlanStep[]) => void;
  /** Stores what a session has done that taints its memory notes (memory.ts), replacing what it had. */
  readonly putSessionTaint: (row: SessionTaintRow) => void;
  /** Upsert of a resolve's outcome: the files it read, or the sentence it failed with. */
  readonly putSkill: (skill: {
    name: string;
    source: string;
    enabled?: boolean;
    /** As {@link putMcpServer}'s: bound to a project, null for every machine, left out kept. */
    projectId?: string | null;
    hash?: string;
    bytes?: number;
    error?: string;
    files?: SkillFile[];
  }) => FleetSkillMeta;
  /**
   * Upserts the fleet's choices row (single-row table) and, with `denied`,
   * changes its tool denials in the same transaction: `seed` first when they
   * were never set, then `remove` and `add`, every other name where it was.
   */
  readonly putSupervisorConfig: (config: {
    denied?: {
      seed: readonly string[];
      add: readonly string[];
      remove: readonly string[];
    };
    cawcoTodos?: boolean;
    /** When the fleet's choices were set through `PUT /api/fleet/choices`. */
    choicesSetAt?: Date | null;
  }) => void;
  /** Files or refreshes rows of a project's task index, each by its file's path, its lists with it. */
  readonly putTaskIndex: (rows: TaskIndexRow[]) => void;
  readonly putToolListing: (listing: string, toolsHash: string) => void;
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
  /** Raises (or replaces) the session's notice. */
  readonly putWatchNotice: (notice: FleetWatchNotice) => void;
  readonly putWorkflow: (row: typeof workflows.$inferInsert) => WorkflowRow;
  /** Keeps a step's held stop as it stands now. */
  readonly putWorkflowHeldStop: (
    runId: string,
    stepId: string,
    stop: WorkflowHeldStop
  ) => void;
  /** Records a call in its run's log, or completes the row it already has. */
  readonly putWorkflowLog: (row: typeof workflowRunLog.$inferInsert) => void;
  /** Declares a run's state slot with `schema`, and with `set` gives it its value. */
  readonly putWorkflowSlot: (
    runId: string,
    name: string,
    schema: Record<string, unknown>,
    set?: { value: unknown }
  ) => void;
  /** Every hook start waiting for a slot in the project, oldest first (dispatch.ts). */
  readonly queuedTaskStarts: (projectId: string) => QueuedTaskStartRow[];
  /** `delegate` calls waiting for files a live item owns, oldest first. */
  readonly queuedWorkItems: () => QueuedWorkItemRow[];
  /** Queues a hook's start, or replaces the one its task already had. */
  readonly queueTaskStart: (
    row: Omit<QueuedTaskStartRow, "queuedAt" | "retry" | "why"> & {
      retry?: boolean;
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
   * - not listed, currently `running` → the process is gone: `sleeping`, on
   *   the `sessionId` it resumes from, or fresh under its id when it never
   *   named one (core `relaunchOf`).
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
    /**
     * What is there or on its way: the processes sessiond still holds,
     * attached yet or not, and the sessions whose launch to the machine is in
     * flight (server.ts `launches`).
     */
    heldIds: string[],
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
  /**
   * Keeps a skill's version that is about to be replaced or destroyed: the
   * fleet's own row on a change or a delete (which `putSkill` and
   * `deleteSkill` do themselves), or a machine's edited copy an overwrite is
   * taking off it (`source` `machine:<machineId>`).
   */
  readonly recordFleetSkill: (version: {
    name: string;
    skillSource: string;
    hash: string;
    files: SkillFile[];
    source: string;
  }) => void;
  /** Records the folder a workspace of the project was just cut from on a machine; the last one stands. */
  readonly recordProjectRepository: (repository: {
    projectId: string;
    machineId: string;
    path: MachinePath;
  }) => void;
  /** Files a send's record as the hub accepted it: pending, or failed at once. */
  /** A scratch session's worktree as its machine made it; `dir` is where it now launches. */
  readonly recordScratchWorktree: (
    id: string,
    worktree: import("@cawco/core").ScratchWorktree,
    dir: MachinePath
  ) => void;
  readonly recordSend: (
    send: typeof sentMessages.$inferInsert
  ) => SentMessageRow;
  /** Relays: a project's public webhook paths through Funnel (relay.ts). */
  readonly relays: RelaysDb;
  /**
   * Removes one of a project's places. Its primary checkout and its hub
   * folder are never removed here: forgetting the project is.
   */
  readonly removePlace: (
    projectId: string,
    placeId: string
  ) => "removed" | "primary" | "missing";
  /** A workspace's place, gone with the workspace when it is archived. */
  readonly removeWorkspacePlaces: (
    machineId: string,
    clone: MachinePath
  ) => void;
  /**
   * A marketplace row moved to the name its manifest gives, with every plugin
   * id after its `@`. Where the new name or id is already a row, that row
   * stays and the old one goes. Answers the plugin ids that moved, old → new.
   */
  readonly renameMarketplace: (from: string, to: string) => [string, string][];
  /**
   * Paths on `machineId` stored under `~` before every path on a machine was
   * a {@link MachinePath} (a restored database, rows from older hubs):
   * places, session directories, workspaces and repositories, resolved
   * against the home it reported. A place that lands on one the project
   * already has there is folded into it. Answers the projects whose places
   * changed. Nothing while the machine's home is unknown.
   */
  readonly resolveHomePaths: (machineId: string) => string[];
  readonly restoreRemovedSessions: (
    machineId: string,
    held: string[],
    complete: boolean
  ) => void;
  /** Routines and their runs (routines.ts). */
  readonly routines: RoutinesDb;
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
  /**
   * The listed Claude sessions that are running, as the accounts read them:
   * two columns, so asking which accounts a session runs on reads no row whole.
   */
  readonly runningClaudeSessions: () => {
    accountId: string | null;
    machineId: string;
  }[];
  readonly runningDelegateCounts: () => Map<string, number>;
  /** The listed sessions of one harness that are running. */
  readonly runningInstancesOf: (harness: string) => PublicInstanceRow[];
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
  /** The fleet's session limits; none set reads as `{}`. */
  readonly sessionLimits: () => SessionLimits;
  /** Unfiltered ownership, including hidden deletes and discarded rows. */
  readonly sessionOwnership: (machineId?: string) => OwnedInstanceRow[];
  /** What a session last wrote of its own plan through `todo_write` (plans.ts). */
  readonly sessionPlan: (instanceId: string) => SessionPlanRow | undefined;
  /** What a session has done that taints its memory notes; undefined for one that has done nothing the hub keeps. */
  readonly sessionTaint: (instanceId: string) => SessionTaintRow | undefined;
  /**
   * A machine's word on Claude, as a beat's Claude report says it (a keychain
   * unlocked from the dashboard, a login gone under it). Answers whether the
   * row moved.
   */
  readonly setAgentAuth: (machineId: string, auth: AgentAuth) => boolean;
  /** A machine's own account of what it came to, from the sync it just answered. */
  readonly setAgentFleet: (machineId: string, report: FleetSyncReport) => void;
  readonly setAgentToolCell: (machineId: string, status: ToolStatus) => void;
  /** Stores the document and the hash the machines compare against. */
  readonly setFleetMemory: (content: string) => {
    content: string;
    hash: string;
    updatedAt: Date;
  };
  readonly setFleetWatchOn: (on: boolean) => void;

  /** Puts sessions in a project: a session made a project, and its delegates. */
  readonly setInstancesProject: (ids: string[], projectId: string) => void;
  /**
   * Pauses a machine until `until`, with what the pause stopped as it began,
   * or ends its pause (null, null); false when no such machine (machine-pause.ts).
   */
  readonly setMachinePause: (
    machineId: string,
    until: Date | null,
    stopped: StoppedCommands | null
  ) => boolean;
  readonly setMcpAuth: (
    name: string,
    mode: "direct" | "oauth",
    error?: string
  ) => void;
  /** Store (or replace) the OpenRouter key from a completed PKCE exchange. */
  readonly setOpenRouterConnection: (apiKey: string) => void;
  /** The accounts the project's sessions may run on; null: every account. */
  readonly setProjectAccounts: (id: string, accounts: string[] | null) => void;
  /** The project's spend cap and what reaching it does (project-caps.ts). */
  readonly setProjectCap: (
    id: string,
    change: Pick<ProjectRow, "capUsd" | "capPeriod" | "onCap">
  ) => void;
  /** The project's Caw: on or off, its harness, and its lead session (caw.ts). */
  readonly setProjectCaw: (
    id: string,
    change: Partial<
      Pick<
        ProjectRow,
        "caw" | "cawHarness" | "cawModel" | "leadCostSeen" | "leadInstanceId"
      >
    >
  ) => void;
  /** The project's name, its Review before done, its Apple build gate and its upstream choice, as project-edit.ts checked them. */
  readonly setProjectDetails: (
    id: string,
    change: Partial<
      Pick<ProjectRow, "appleGate" | "name" | "review" | "upstreamPosts">
    >
  ) => void;
  /** The project's dispatch settings: whether it dispatches, its caps, its default budget and landing. */
  readonly setProjectDispatch: (
    id: string,
    change: Partial<
      Pick<
        ProjectRow,
        | "budget"
        | "dispatch"
        | "lands"
        | "maxAttempts"
        | "reviewLimit"
        | "runsOn"
      >
    >
  ) => void;
  /** A move's "Don't move", remembered on its project; null forgets it. */
  readonly setProjectMoveDeclined: (id: string, at: Date | null) => void;
  /** The repository a project's checkouts are of, once a machine has read it. */
  readonly setProjectRemote: (id: string, remote: string) => void;
  /** The stage template a project last had applied: its starter skills follow it. */
  readonly setProjectTemplate: (id: string, template: StagesTemplate) => void;
  /** Where the project's tasks live; tasks.ts refuses a tracker not built yet. */
  readonly setProjectTracker: (id: string, tracker: Tracker) => void;
  /** The fleet's session limits, whole: a field absent is no limit. */
  readonly setSessionLimits: (limits: SessionLimits) => void;
  /**
   * Switches a stored skill on or off, its source and files as they are: no
   * fetch. Undefined when there is no such skill.
   */
  readonly setSkillEnabled: (
    name: string,
    enabled: boolean
  ) => FleetSkillMeta | undefined;
  /** What reaching a cap does where a project sets nothing. */
  readonly setSpendOnCap: (onCap: OnCap) => void;
  /** Turn composer suggestions on or off. Only meaningful while Jev is on. */
  readonly setSuggestWhileTyping: (enabled: boolean) => void;
  /** Hold (or replace) the TypeSafe key; null forgets it. */
  readonly setTypesafeKey: (key: string | null) => void;
  /** Closes it. An ask this hub never recorded is nothing to close. */
  readonly settleDelegateAsk: (
    requestId: string,
    status: DelegateAskStatus
  ) => void;
  readonly settleInstances: (
    machineId: string,
    liveIds: string[],
    /**
     * The processes sessiond still holds for the machine. One its daemon has
     * not attached yet is alive, with an attach on its way: it is filed
     * `starting`, never asleep and never lost with its conversation.
     */
    heldIds: string[],
    resumable?: string[],
    /**
     * When each of those conversations last changed, ms epoch by session id.
     * Written onto every non-live row it names, because it is the only source
     * in the fleet that knows when a sleeping session last *moved* rather than
     * when the hub last wrote something down about it.
     */
    resumableAt?: Record<string, number>
  ) => SettledInstance[];
  /** Files a row's launch directory as read: `cwd` when its conversation named one, else unknown. */
  readonly settleLaunchDir: (id: string, cwd?: MachinePath) => void;
  /**
   * A held row's status as its move's stage says (`moving`, or `error` with
   * why), while no spawn has taken it on. True when it changed.
   */
  readonly settleMovingInstance: (
    id: string,
    status: "moving" | "error",
    lastError?: string
  ) => boolean;
  readonly settleRemovedSession: (id: string, present: boolean) => void;
  readonly settleUnavailableRecovery: (id: string) => boolean;
  readonly setUpstreamPosts: (posts: boolean) => void;
  /** Replaces the sessions an ending run waits on; one the hub keeps no row for is not waited on. */
  readonly setWorkflowPendingEnds: (
    runId: string,
    instanceIds: string[]
  ) => void;
  /** Names of fleet skills installed at or after `since`. */
  readonly skillsInstalledSince: (since: Date) => string[];
  /**
   * Files a session its machine put to sleep: `sleeping`, from any state that
   * claims a process. False when the row claimed none, or has no conversation
   * to wake from.
   */
  readonly sleepInstance: (id: string) => boolean;
  /** What reaching a cap does where a project sets nothing; its default before any is set. */
  readonly spendOnCap: () => OnCap;
  readonly stageSessionIdentity: (instanceId: string, hash: string) => void;
  /**
   * The row a fetch is about to resolve: a new one is stored with no files
   * yet; an existing one takes `enabled` and its placement now and keeps its
   * source and files until the fetch's {@link putSkill}.
   */
  readonly stageSkill: (skill: {
    name: string;
    source: string;
    enabled?: boolean;
    projectId?: string | null;
  }) => FleetSkillMeta;
  /** A project's starters as last written, and what was done with them (project-starters.ts). */
  readonly starters: StartersDb;
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
  /**
   * The ids of the `instances` rows written since the last call (the
   * connection's change log), and the log emptied: what the board reads again.
   */
  readonly takeChangedInstances: () => string[];
  readonly takeMcpAuthorization: (
    state: string
  ) => typeof fleetMcpOauth.$inferSelect | undefined;
  /** Takes a send's owed envelope, once: the envelope, or undefined when another took it first. */
  readonly takeOwedSend: (uuid: string) => string | undefined;
  /** Takes one owed start off the books; true for exactly one caller. */
  readonly takeOwedSpawn: (id: string) => boolean;
  /** A run's notes, oldest first, taken: none is handed out twice. */
  readonly takeWorkflowNotes: (runId: string) => string[];
  /** Every row of a project's task index, in id order. */
  readonly taskIndex: (projectId: string) => TaskIndexRow[];
  /** The indexed tasks that wait for `taskId` (`after:`), by number: an indexed lookup. */
  readonly taskWaiters: (
    projectId: string,
    taskId: string
  ) => { id: string; path: string }[];
  readonly thread: (id: string) => ThreadRow | undefined;
  /** One thread message by its id, in any thread. */
  readonly threadMessage: (id: string) => ThreadMessageRow | undefined;
  /** A thread's messages, oldest first. */
  readonly threadMessages: (threadId: string) => ThreadMessageRow[];
  /** The newest of a project's threads in which Caw named the task (`thread_reply` with `tasks`). */
  readonly threadOfTask: (
    projectId: string,
    taskId: string
  ) => ThreadRow | undefined;
  /** The hash of the tools a cawco MCP listing last answered, if it has. */
  readonly toolListing: (listing: string) => string | undefined;
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
  /** A fleet MCP relay session was used now. */
  readonly touchMcpSession: (id: string) => void;
  /**
   * What a session's delegate tray can still show, oldest first: of the
   * items it delegated and the items of the projects in `ledProjectIds` (it
   * leads them), the live and undismissed failed ones, and any other that
   * ended at or after `endedSince`.
   */
  readonly trayItemsOf: (
    sessionId: string,
    ledProjectIds: string[],
    endedSince: Date
  ) => WorkItemRow[];
  /** Each completed turn's tokens, on the account it ran on. */
  readonly turnUsage: TurnUsageDb;
  /**
   * {@link continueInPlace} taken back, while the new conversation has said
   * nothing yet: the conversation kept under `next` is the row's again, on
   * the account and harness it ran on. False when there is none to take
   * back, or the new one already named itself.
   */
  readonly undoContinueInPlace: (id: string, next: string) => boolean;
  /**
   * Pending sends handed to a machine before the hub kept each whole
   * ({@link sentMessages.envelope}): none once {@link keepEnvelope} has
   * given each its own, which a hub start does once.
   */
  readonly unkeptSends: () => SentMessageRow[];
  /**
   * The machine's sessions that nothing has ever put a name to, however old
   * they are — a stored conversation the hub could name off the machine's own
   * catalog, and the only rows worth spending a catalog read on. Empty is the
   * steady state, which is what makes that read free to offer.
   */
  readonly unnamedSessions: (machineId: string) => PublicInstanceRow[];
  /** A machine's rows from before `cwd` was pinned whose launch directory is still to be read. */
  readonly unreadLaunchDirs: (
    machineId: string
  ) => { id: string; sessionId: string; harness: string | null }[];
  /**
   * Enabled plugins with no resolved files, whether never tried or failed —
   * what a resolve at boot is for. A failed one is tried again so its sentence
   * is this hub's, and a source that came back heals without a refresh.
   */
  readonly unresolvedPlugins: () => string[];
  /** Moves one job; the row as it now is, or undefined when it is gone. */
  readonly updateContinuation: (
    id: string,
    patch: Partial<
      Pick<
        ContinuationRow,
        "stage" | "error" | "summary" | "summariserInstanceId" | "prepared"
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
  /** Moves one job; the row as it now is, or undefined when it is gone. */
  readonly updateMove: (
    id: string,
    patch: Partial<Pick<MoveRow, "stage" | "state">>
  ) => MoveRow | undefined;
  /** One change to a send's record — the hub's only kind of write to one. */
  readonly updateSend: (
    uuid: string,
    change: Partial<
      Pick<
        SentMessageRow,
        | "state"
        | "reason"
        | "refusal"
        | "anchor"
        | "replacedBy"
        | "body"
        | "harnessId"
        | "held"
        | "acceptedAt"
        | "delivery"
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
        | "summary"
        | "headline"
        | "error"
        | "endedAt"
        | "dismissedAt"
        | "dismissReason"
        | "replacedBy"
        | "checks"
        | "checkingSince"
        | "submission"
        | "waitUntil"
        | "waitReason"
        | "waitResumeBy"
        | "waitHistory"
        | "heldAt"
        | "prUrl"
        | "groupReportedAt"
        | "digest"
        | "turns"
        | "instanceId"
        | "origin"
        | "stoppedBy"
        | "taskResult"
      >
    >
  ) => WorkItemRow | undefined;
  /** Records what the workspace's machine says of its boundary, its archive, what it holds, or where its last item landed. */
  readonly updateWorkspace: (
    id: string,
    change: Partial<
      Pick<
        WorkspaceRow,
        | "base"
        | "boundaryPid"
        | "branch"
        | "carry"
        | "heldAt"
        | "holding"
        | "landed"
        | "state"
        | "tmp"
      >
    >
  ) => WorkspaceRow | undefined;
  readonly upsertAgent: (agent: {
    machineId: string;
    hostname: string;
    os: string;
    auth: AgentAuth;
    /** Absent from a register with nothing new to say about it; the row keeps what it had. */
    build?: BuildInfo;
    /** The machine's home folder, absolute; absent from a daemon that does not say it. */
    home?: string;
    machineCapabilities?: import("@cawco/core/capabilities").MachineCapabilities;
  }) => void;
  /** The fleet's upstream answer (schema `upstreamSettings`): null while nobody has answered. */
  readonly upstreamPosts: () => boolean | null;
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
  /** The fleet-watch lines kept on the session's row, oldest first. */
  readonly watchLinesOf: (id: string) => WatchLine[];
  /** Fleet watch's open needs-you notices, oldest first. */
  readonly watchNotices: () => FleetWatchNotice[];
  /** A run's held stops, by step id. */
  readonly workflowHeldStops: (
    runId: string
  ) => Record<string, WorkflowHeldStop>;
  /** The sessions an ending run waits to see ended, in the order recorded. */
  readonly workflowPendingEnds: (runId: string) => string[];
  /**
   * Each run's place in the tree and its status, nothing else (every run, or
   * one workflow's): what the archive walk and a workflow's delete read.
   * Ended runs too, since sessions under one may still work.
   */
  readonly workflowRunHeads: (
    workflowId?: string
  ) => Pick<
    WorkflowRunRow,
    "id" | "parentRunId" | "status" | "supervisorInstanceId"
  >[];
  /** A run's declared state slots, in the order declared: each one's schema, and its value once set. */
  readonly workflowSlots: (
    runId: string
  ) => { name: string; schema: Record<string, unknown>; value?: unknown }[];
  readonly workflowTransition: (
    run: typeof workflowRuns.$inferInsert,
    step?: typeof workflowSteps.$inferInsert,
    attempt?: typeof workflowAttempts.$inferInsert,
    steps?: WorkflowStepRow[]
  ) => void;
  readonly workItem: (id: string) => WorkItemRow | undefined;
  /** The newest work item whose landing opened or found the pull request at `url`. */
  readonly workItemByPrUrl: (url: string) => WorkItemRow | undefined;
  /** The globs a work item owns; none when it claims nothing. */
  readonly workItemGlobs: (itemId: string) => string[];
  /** A workspace's items, newest first. */
  readonly workItemsIn: (workspaceId: string) => WorkItemRow[];
  /** Every work item any of these sessions delegated, newest first (delegation-tree.ts). */
  readonly workItemsOfParents: (parentInstanceIds: string[]) => WorkItemRow[];
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
 * its payload paired with its kind, which the two columns cannot say, and a
 * report's turn identity (its own columns) back in its payload.
 */
const delegateEventOf = ({
  resultId,
  completedAt,
  ...row
}: typeof delegateEvents.$inferSelect): DelegateEvent =>
  ({
    ...row,
    payload: {
      ...row.payload,
      ...(resultId === null ? {} : { resultId }),
      ...(completedAt === null ? {} : { completedAt }),
    },
    createdAt: row.createdAt.toISOString(),
  }) as DelegateEvent;

/** A move's machines out of its state, as their columns keep them. */
const moveColumnsOf = ({
  sourceMachineId,
  targetMachineId,
  stopOn,
  ...state
}: MoveState) => ({
  state,
  sourceMachineId,
  targetMachineId,
  stopOn: stopOn ?? null,
});

/** A stored move with its machines back in its state. */
const moveOf = ({
  sourceMachineId,
  targetMachineId,
  stopOn,
  state,
  ...row
}: typeof moves.$inferSelect): MoveRow => ({
  ...row,
  state: {
    ...state,
    sourceMachineId,
    targetMachineId,
    ...(stopOn === null ? {} : { stopOn }),
  },
});

/** A stored rule row back into the shape the fleet and the dashboard share. */
const ruleOf = (row: typeof rules.$inferSelect): Rule => ({
  id: row.id,
  name: row.name,
  enabled: row.enabled,
  pattern: row.pattern,
  matchKind: row.matchKind,
  caseSensitive: row.caseSensitive,
  wholeWord: row.wholeWord,
  watch: row.watch,
  reply: row.reply,
  timing: row.timing,
  repeat: row.repeat,
  scope: {
    ...(row.scopeMachineId ? { machineId: row.scopeMachineId } : {}),
    ...(row.scopeProjectId ? { projectId: row.scopeProjectId } : {}),
    ...(row.scopeHarness ? { harness: row.scopeHarness } : {}),
    ...(row.scopeModel ? { model: row.scopeModel } : {}),
  },
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
  ...(row.projectId
    ? { projectId: row.projectId, scope: row.scope ?? "project" }
    : {}),
});

/**
 * A fleet row's placement after a write: `asked` binds it to that project
 * (under `scope`), null makes it every machine's, and left out keeps what it
 * was (`stored`).
 */
const placementOf = (
  asked: string | null | undefined,
  stored: string | null | undefined,
  scope: FleetScope
): { projectId: string | null; scope: FleetScope | null } => {
  const bound = asked === undefined ? (stored ?? null) : asked;
  return { projectId: bound, scope: bound ? scope : null };
};

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

/** A hub place's machine: the hub itself, which is no machine of the fleet. */
export const HUB_PLACE_MACHINE = "hub";

/** A fleet MCP server's detail between saving a new config and the server's first answer. */
export const MCP_NOT_YET_REACHED = "The hub has not reached this server yet.";

/**
 * `instances.turn_open_at` of a session from before the hub kept the turn it
 * had open (migration `turn_open_at`): whether that turn ended is its harness's
 * transcript's word, not the hub's.
 */
export const TURN_UNRECORDED = -1;

/** Where a place stands in its project's list: the primary checkout, other checkouts, the hub's folder, workspaces. */
const placeRank = (place: PlaceRow): number => {
  if (place.isPrimary) {
    return 0;
  }
  return { checkout: 1, hub: 2, workspace: 3 }[place.kind];
};

/**
 * A project's primary checkout: where it is worked on, and the machine and
 * folder a client names it by. Undefined before it has a checkout (made on
 * the hub, its place still to be picked): "no checkout yet".
 */
export const checkoutOf = (project: ProjectRow): PlaceRow | undefined =>
  project.places.find((place) => place.isPrimary);

/** The project's folder on the hub, the place every project has from the start. */
export const hubPlacePath = (projectId: string): HubFolder =>
  `projects/${projectId}`;

/**
 * Each project with its places, the primary first, then oldest first, and
 * the accounts it allows: null for one not limited to some.
 */
const withPlaces = (
  rows: (typeof projects.$inferSelect)[],
  places: PlaceRow[],
  allowed: { accountId: string; projectId: string }[]
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
  const accountsOf = new Map<string, string[]>();
  for (const { projectId, accountId } of allowed) {
    accountsOf.set(projectId, [
      ...(accountsOf.get(projectId) ?? []),
      accountId,
    ]);
  }
  return rows.map(({ accountsLimited, ...project }) => ({
    ...project,
    accounts: accountsLimited ? (accountsOf.get(project.id) ?? []) : null,
    places: (byProject.get(project.id) ?? []).sort(
      (a, b) =>
        placeRank(a) - placeRank(b) ||
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

/** The one row the fleet's choices ever take — same precedent as `MEMORY_ID`. */
const SUPERVISOR_CONFIG_ID = "supervisor";
const OPENROUTER_CONNECTION_ID = "openrouter";
const JEV_SETTINGS_ID = "jev";
const FLEET_WATCH_ID = "fleet-watch";
/** The one {@link upstreamSettings} row's key. */
const UPSTREAM_ID = "upstream";

/**
 * How far back a memory document, a hook or a skill can be taken, each within
 * its own history. Deep enough to undo a bad day, not a log.
 */
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

const make = async (path: string): Promise<DbShape> => {
  mkdirSync(dirname(path), { recursive: true });
  const db = drizzle(path);
  // busy_timeout: another process's connection to this file (the CLI's
  // `cawco pairing off`, a probe's writes, the sqlite3 shell) holds the write
  // lock for a statement's length. With none, the hub's write failed at once
  // with "database is locked" (measured in WAL, the mode the workflow
  // engine's connection sets on this file: 0 ms against a writer in another
  // process; 330 ms and done with this), and a launch's grant that failed so
  // left its machine waiting out its 90 s with no answer (workspace-retire,
  // G, 2026-10-16). 5 s, as the workflow engine's own connection waits
  // (@effect/sql-sqlite-bun's default) and the transcript index does
  // (jsonl-parser fts5.ts).
  db.$client.run("PRAGMA busy_timeout = 5000");
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
    freshStartAt: _freshStartAt,
    turnOpenAt: _turnOpenAt,
    tooling: _tooling,
    ...publicColumns
  } = getTableColumns(instances);
  const boardColumns = publicColumns;
  const { tooling: _ownTooling, ...ownedColumns } = getTableColumns(instances);
  /** A workflow's columns but its program: what the list carries. */
  const { program: _program, ...workflowListColumns } =
    getTableColumns(workflows);
  /** Each message with the tasks it names, in the order it named them. */
  const withTasks = (
    rows: (typeof threadMessages.$inferSelect)[]
  ): ThreadMessageRow[] => {
    const named = new Map<string, string[]>();
    if (rows.length > 0) {
      for (const { messageId, taskId } of db
        .select({
          messageId: threadMessageTasks.messageId,
          taskId: threadMessageTasks.taskId,
        })
        .from(threadMessageTasks)
        .where(
          inArray(
            threadMessageTasks.messageId,
            rows.map((row) => row.id)
          )
        )
        .orderBy(sql`rowid`)
        .all()) {
        named.set(messageId, [...(named.get(messageId) ?? []), taskId]);
      }
    }
    return rows.map((row) => ({ ...row, tasks: named.get(row.id) ?? null }));
  };
  /** The fleet's tool denials, in the order they were added. */
  const deniedToolNames = (): string[] =>
    db
      .select({ tool: fleetDeniedTools.tool })
      .from(fleetDeniedTools)
      .orderBy(sql`rowid`)
      .all()
      .map(({ tool }) => tool);
  /** Dollars the project's booked Caw turns cost since `since` (ms epoch). */
  const cawSince = (projectId: string, since: number): number =>
    db
      .select({ usd: sql<number>`coalesce(sum(${cawTurns.usd}), 0)` })
      .from(cawTurns)
      .where(
        and(eq(cawTurns.projectId, projectId), sql`${cawTurns.at} >= ${since}`)
      )
      .get()?.usd ?? 0;
  const listedInstances = () =>
    and(
      eq(instances.machineRemoved, false),
      ne(instances.status, "discarded"),
      or(isNull(instances.endIntent), eq(instances.endIntent, "stop")),
      or(
        // A move's row is work in hand however long its yes or its copy takes;
        // a stopping one however long its away machine takes to confirm.
        inArray(instances.status, [
          "running",
          "sleeping",
          "moving",
          "stopping",
        ]),
        gt(instances.updatedAt, new Date(Date.now() - STALE_AFTER_MS))
      )
    );
  /**
   * A row as every listing hands it: one nobody named answers with the name
   * its first message gave it, so every listing — the rail, the tab strip,
   * the first server render — already carries it and no label changes once a
   * transcript loads. The column itself stays as it was: a given title is
   * still what wins here.
   */
  const asListed = <
    Row extends {
      derivedTitle: string | null;
      title: string | null;
    },
  >(
    row: Row
  ): Row => (row.title ? row : { ...row, title: row.derivedTitle });
  // A marker for the update helper: while it names a live process the hub is
  // migrating, and the helper's wait for a healthy start does not run down.
  const migrating = `${path}.migrating`;
  writeStateFileSync(
    migrating,
    JSON.stringify({ ...(await ownIdentity()), startedAt: Date.now() })
  );
  // Migrations rebuild tables, which SQLite does with foreign keys off; they
  // run in one transaction, where the pragma cannot change, so it is set on
  // the connection around them. From then on every key the schema declares
  // holds, and its cascades run.
  db.$client.run("PRAGMA foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    rmSync(migrating, { force: true });
  }
  db.$client.run("PRAGMA foreign_keys = ON");
  // Secrets kept as plain text before they were sealed are sealed now, before
  // anything reads them (seal-at-rest.ts).
  const sealed = sealAtRest(db.$client);
  console.info(
    Object.keys(sealed).length > 0
      ? `[seal-at-rest] sealed in place: ${Object.entries(sealed)
          .map(([column, count]) => `${column} ${count}`)
          .join(", ")}`
      : "[seal-at-rest] every secret is sealed already"
  );

  // THE BOARD'S CHANGE LOG: the id of every `instances` row written since the
  // board last read it, on this connection, which is the only one that writes
  // the table. Temporary (this connection's own, gone with it), so a hub
  // starts with an empty log and a board read whole. The board reads only
  // these rows again instead of every row on every publish, which with
  // 2,600 rows held the hub's thread for seconds when twenty sessions moved
  // at once (2026-10-09). A foreign key's own action (a project deleted, its
  // sessions' `project_id` set null) fires these as any write does.
  // No key and no conflict clause: a trigger's `OR IGNORE` yields to the
  // statement that fired it, so a register's upsert that touched a row twice
  // failed whole on a unique id here. Repeats are folded when the log is taken.
  db.$client.run(
    "CREATE TEMP TABLE IF NOT EXISTS instance_changes (id TEXT NOT NULL)"
  );
  db.$client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS instance_inserted AFTER INSERT ON main.instances BEGIN INSERT INTO instance_changes (id) VALUES (new.id); END"
  );
  db.$client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS instance_updated AFTER UPDATE ON main.instances BEGIN INSERT INTO instance_changes (id) VALUES (old.id), (new.id); END"
  );
  db.$client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS instance_deleted AFTER DELETE ON main.instances BEGIN INSERT INTO instance_changes (id) VALUES (old.id); END"
  );
  const takeChanges = db.$client.prepare<{ id: string }, []>(
    "DELETE FROM instance_changes RETURNING id"
  );

  // A stored skill's or plugin's hash is what its files hash to with the
  // hashFiles this hub runs, because that is the hash every machine takes of
  // its disk. a1c94e85 put each file's execute bit into it, and the rows
  // resolved before that kept the old hash: no machine's untouched copy ever
  // matched it, so each one read as edited and a vendored plugin as missing
  // its bytes. Every row whose hash and files disagree is rehashed at open,
  // with no history row, since its bytes did not move.
  for (const row of db
    .select({ name: skills.name, hash: skills.hash, files: skills.files })
    .from(skills)
    .all()) {
    const hash = row.files ? hashFiles(row.files) : row.hash;
    if (hash !== row.hash) {
      db.update(skills).set({ hash }).where(eq(skills.name, row.name)).run();
    }
  }
  for (const row of db
    .select({ id: plugins.id, hash: plugins.hash, files: plugins.files })
    .from(plugins)
    .all()) {
    const hash = row.files ? hashFiles(row.files) : row.hash;
    if (hash !== row.hash) {
      db.update(plugins).set({ hash }).where(eq(plugins.id, row.id)).run();
    }
  }
  for (const row of db
    .select({
      id: fleetSkillHistory.id,
      hash: fleetSkillHistory.hash,
      files: fleetSkillHistory.files,
    })
    .from(fleetSkillHistory)
    .all()) {
    const hash = hashFiles(row.files);
    if (hash !== row.hash) {
      db.update(fleetSkillHistory)
        .set({ hash })
        .where(eq(fleetSkillHistory.id, row.id))
        .run();
    }
  }

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  /** A session's lines of one kind, in the order written. */
  const linesOf = (instanceId: string, kind: SessionLineKind) =>
    db
      .select()
      .from(sessionLines)
      .where(
        and(
          eq(sessionLines.instanceId, instanceId),
          eq(sessionLines.kind, kind)
        )
      )
      .orderBy(sql`rowid`)
      .all()
      .map((row) => ({ ...row, at: row.at.getTime() }));

  /**
   * Keeps a line of a session's, and the last `kept` of its kind, in one
   * transaction; false when one under its id is kept already, or the hub
   * keeps no row for the session.
   */
  const keepLine = (
    instanceId: string,
    kind: SessionLineKind,
    line: LimitNote,
    kept: number
  ): boolean =>
    db.transaction((tx) => {
      if (
        !tx
          .select({ id: instances.id })
          .from(instances)
          .where(eq(instances.id, instanceId))
          .get()
      ) {
        return false;
      }
      const added = tx
        .insert(sessionLines)
        .values({
          instanceId,
          kind,
          id: line.id,
          at: new Date(line.at),
          content: line.content,
        })
        .onConflictDoNothing()
        .returning({ id: sessionLines.id })
        .all();
      if (added.length === 0) {
        return false;
      }
      tx.run(
        sql`DELETE FROM ${sessionLines} WHERE instance_id = ${instanceId} AND kind = ${kind} AND rowid NOT IN (SELECT rowid FROM ${sessionLines} WHERE instance_id = ${instanceId} AND kind = ${kind} ORDER BY rowid DESC LIMIT ${kept})`
      );
      return true;
    });

  /** A session's prior conversations, oldest first. */
  const conversationsOf = (
    from: Pick<Tx, "select">,
    instanceId: string
  ): PriorConversation[] =>
    from
      .select()
      .from(instanceConversations)
      .where(eq(instanceConversations.instanceId, instanceId))
      .orderBy(asc(instanceConversations.ord))
      .all()
      .map((row) => ({
        sessionId: row.sessionId,
        harness: row.harness,
        model: row.model,
        accountId: row.accountId,
        endedAt: row.endedAt.getTime(),
        next: row.nextEventId,
      }));

  /**
   * A session's prior conversations replaced by `list`, oldest first. An
   * account the hub no longer keeps is named as none: a session's own
   * account has no key, and a conversation's must not outlive its account.
   */
  const putConversations = (
    tx: Tx,
    instanceId: string,
    list: PriorConversation[]
  ): void => {
    tx.delete(instanceConversations)
      .where(eq(instanceConversations.instanceId, instanceId))
      .run();
    if (list.length === 0) {
      return;
    }
    const named = list.flatMap((one) => (one.accountId ? [one.accountId] : []));
    const known = new Set(
      named.length === 0
        ? []
        : tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(inArray(accounts.id, named))
            .all()
            .map((row) => row.id)
    );
    tx.insert(instanceConversations)
      .values(
        list.map((one, ord) => ({
          instanceId,
          ord,
          sessionId: one.sessionId,
          harness: one.harness,
          model: one.model,
          accountId:
            one.accountId && known.has(one.accountId) ? one.accountId : null,
          endedAt: new Date(one.endedAt),
          nextEventId: one.next,
        }))
      )
      .run();
  };

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
            .all(),
          from
            .select()
            .from(projectAccounts)
            .where(eq(projectAccounts.projectId, id))
            .orderBy(sql`rowid`)
            .all()
        )[0]
      : undefined;
  };

  /** `~` or `~/…` in a column: what only a row from before every path on a machine was a {@link MachinePath} holds. */
  const underHome = (column: AnySQLiteColumn) =>
    or(eq(column, "~"), like(column, "~/%"));

  /** {@link DbShape.resolveHomePaths} for `machineId`'s session directories, workspaces and repositories. */
  const resolveHomeDirs = (
    tx: Tx,
    machineId: string,
    resolve: (raw: string) => MachinePath
  ): void => {
    for (const row of tx
      .select({ id: instances.id, cwd: instances.cwd })
      .from(instances)
      .where(and(eq(instances.machineId, machineId), underHome(instances.cwd)))
      .all()) {
      tx.update(instances)
        .set({ cwd: resolve(row.cwd) })
        .where(eq(instances.id, row.id))
        .run();
    }
    for (const row of tx
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.machineId, machineId),
          or(underHome(workspaces.path), underHome(workspaces.repoRoot))
        )
      )
      .all()) {
      tx.update(workspaces)
        .set({ path: resolve(row.path), repoRoot: resolve(row.repoRoot) })
        .where(eq(workspaces.id, row.id))
        .run();
    }
    for (const row of tx
      .select()
      .from(projectRepositories)
      .where(
        and(
          eq(projectRepositories.machineId, machineId),
          underHome(projectRepositories.path)
        )
      )
      .all()) {
      tx.update(projectRepositories)
        .set({ path: resolve(row.path) })
        .where(
          and(
            eq(projectRepositories.projectId, row.projectId),
            eq(projectRepositories.machineId, machineId)
          )
        )
        .run();
    }
  };

  /**
   * {@link DbShape.resolveHomePaths} for `machineId`'s places: one that lands
   * on a folder its project already has there is folded into it, primary if
   * either was. Answers the projects whose places changed.
   */
  const resolveHomePlaces = (
    tx: Tx,
    machineId: string,
    resolve: (raw: string) => MachinePath
  ): string[] => {
    const changed = new Set<string>();
    for (const place of tx
      .select()
      .from(projectPlaces)
      .where(
        and(
          eq(projectPlaces.machineId, machineId),
          underHome(projectPlaces.path)
        )
      )
      .all()) {
      const resolved = resolve(place.path);
      const standing = tx
        .select()
        .from(projectPlaces)
        .where(
          and(
            eq(projectPlaces.projectId, place.projectId),
            eq(projectPlaces.machineId, machineId),
            eq(projectPlaces.path, resolved)
          )
        )
        .get();
      if (standing) {
        tx.delete(projectPlaces).where(eq(projectPlaces.id, place.id)).run();
        if (place.isPrimary && !standing.isPrimary) {
          tx.update(projectPlaces)
            .set({ isPrimary: true })
            .where(eq(projectPlaces.id, standing.id))
            .run();
        }
      } else {
        tx.update(projectPlaces)
          .set({ path: resolved })
          .where(eq(projectPlaces.id, place.id))
          .run();
      }
      changed.add(place.projectId);
    }
    return [...changed];
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
    tx.delete(limitHolds).where(inArray(limitHolds.instanceId, list)).run();
    tx.delete(limitSummaries)
      .where(inArray(limitSummaries.instanceId, list))
      .run();
    tx.delete(limitEvents).where(inArray(limitEvents.instanceId, list)).run();
    tx.delete(fleetWatchNotices)
      .where(inArray(fleetWatchNotices.instanceId, list))
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

  /**
   * Every table whose rows a former session's id names, by the column that
   * names it: what answered to it, what it ran, what it was sent and wrote.
   * Moved onto the session it is now; `once`: a table holding one row per
   * session, whose row the session already has keeps that one.
   */
  const FOLD_MOVED: readonly (readonly [string, string, "once"?])[] = [
    ["instances", "parent_instance_id"],
    ["work_items", "instance_id"],
    ["work_items", "parent_instance_id"],
    ["queued_work_items", "parent_instance_id"],
    ["queued_task_starts", "parent_instance_id"],
    ["delegate_events", "instance_id"],
    ["delegate_events", "parent_instance_id"],
    ["workspaces", "created_by_instance_id"],
    ["workflow_runs", "supervisor_instance_id"],
    ["workflow_steps", "instance_id"],
    ["workflow_notices", "instance_id"],
    ["projects", "lead_instance_id"],
    ["limit_events", "instance_id"],
    ["turn_usage", "instance_id"],
    ["artifacts", "instance_id"],
    ["completed_turns", "instance_id", "once"],
    ["session_plans", "instance_id", "once"],
    ["project_offers", "instance_id", "once"],
    ["fleet_watch_notices", "instance_id", "once"],
  ];
  /** A former session's state of the moment, which the session it is now keeps its own of. */
  const FOLD_DROPPED = [
    "session_identities",
    "limit_holds",
    "limit_summaries",
    "parked_asks",
    "rule_state",
    "moved_from_sessions",
  ];
  const idList = (ids: readonly string[]) =>
    sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    );

  /**
   * Folds `formerIds` into `survivorId`, inside the caller's transaction
   * ({@link DbShape.foldFormerSessions}). The sessions are read as they
   * started, the one that runs last. Each one a continuation started opened
   * on its "Continued on" line, which is the line between the conversation
   * before it and its own; every other "Continued on" line of theirs is the
   * same move told on the other side, and goes.
   */
  const foldInto = (
    tx: Tx,
    survivorId: string,
    formerIds: readonly string[],
    owedAgain: (reason: string) => boolean
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction moving every kind of row a session owns, in the order they depend on each other
  ): FoldedSession | undefined => {
    const survivor = tx
      .select()
      .from(instances)
      .where(eq(instances.id, survivorId))
      .get();
    const formers =
      formerIds.length > 0
        ? tx
            .select()
            .from(instances)
            .where(
              and(
                inArray(instances.id, [...formerIds]),
                ne(instances.id, survivorId)
              )
            )
            .all()
        : [];
    if (!survivor || formers.length === 0) {
      return undefined;
    }
    const members = [...formers, survivor].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const [root] = members;
    const order = [
      ...members.filter((member) => member.id !== survivorId),
      survivor,
    ];
    const ids = members.map((member) => member.id);
    const gone = formers.map((member) => member.id);
    const continued = tx
      .select()
      .from(limitEvents)
      .where(inArray(limitEvents.instanceId, ids))
      .orderBy(asc(limitEvents.at))
      .all()
      .filter((event) => event.move.kind === "continued");
    const opened = new Map<string, string>();
    for (const member of members) {
      const first = continued.find((event) => event.instanceId === member.id);
      if (member.id !== root.id && first) {
        opened.set(member.id, first.id);
      }
    }
    const kept = new Set(opened.values());
    const told = continued
      .filter((event) => !kept.has(event.id))
      .map((event) => event.id);
    if (told.length > 0) {
      tx.delete(limitEvents).where(inArray(limitEvents.id, told)).run();
    }
    const prior: PriorConversation[] = order
      .slice(0, -1)
      .flatMap((member, at) =>
        member.sessionId
          ? [
              {
                sessionId: member.sessionId,
                harness: member.harness ?? "claude",
                model: member.model,
                accountId: member.accountId,
                endedAt: member.updatedAt.getTime(),
                next: opened.get(order[at + 1].id) ?? null,
              },
            ]
          : []
      );
    // Since the first continuation, what failed only because a process
    // went away is the session's still: pending again, kept whole and owed
    // by the hub as it starts (server.ts `keepPendingWhole`).
    const since = continued[0]?.at ?? root.createdAt;
    const again = tx
      .select({ uuid: sentMessages.uuid, reason: sentMessages.reason })
      .from(sentMessages)
      .where(
        and(
          inArray(sentMessages.instanceId, ids),
          eq(sentMessages.state, "failed"),
          gte(sentMessages.acceptedAt, since)
        )
      )
      .all()
      .filter((send) => owedAgain(send.reason ?? ""))
      .map((send) => send.uuid);
    if (again.length > 0) {
      tx.update(sentMessages)
        .set({
          state: "pending",
          reason: null,
          refusal: null,
          anchor: null,
          owed: null,
          envelope: null,
          delivery: null,
          held: false,
        })
        .where(inArray(sentMessages.uuid, again))
        .run();
    }
    // Each session a continuation started opened on a message from the one
    // before it: the opening of a fresh conversation now, folded under the
    // line before it rather than read as a hand-off.
    for (const member of members) {
      const [first] = tx
        .select({ uuid: sentMessages.uuid, body: sentMessages.body })
        .from(sentMessages)
        .where(eq(sentMessages.instanceId, member.id))
        .orderBy(asc(sentMessages.acceptedAt))
        .limit(1)
        .all();
      const origin = first?.body?.origin;
      if (
        member.id !== root.id &&
        first?.body &&
        origin?.kind === "peer" &&
        origin.fromSession &&
        ids.includes(origin.fromSession)
      ) {
        tx.update(sentMessages)
          .set({
            body: {
              ...first.body,
              origin: { kind: "system", name: CONTINUATION_ORIGIN },
            },
          })
          .where(eq(sentMessages.uuid, first.uuid))
          .run();
      }
    }
    tx.run(
      sql`UPDATE ${sentMessages} SET instance_id = ${survivorId},
        owed = CASE WHEN owed IS NULL THEN NULL ELSE json_set(owed, '$.instanceId', ${survivorId}, '$.machineId', ${survivor.machineId}, '$.payload.instanceId', ${survivorId}) END,
        envelope = CASE WHEN envelope IS NULL THEN NULL ELSE json_set(envelope, '$.instanceId', ${survivorId}, '$.machineId', ${survivor.machineId}, '$.payload.instanceId', ${survivorId}) END
        WHERE instance_id IN (${idList(gone)})`
    );
    for (const [table, column, once] of FOLD_MOVED) {
      const name = sql.identifier(table);
      const by = sql.identifier(column);
      // A session nested under one of the former rows is the session's;
      // the former rows themselves go below.
      const besides =
        table === "instances" ? sql` AND id NOT IN (${idList(ids)})` : sql``;
      tx.run(
        sql`UPDATE OR IGNORE ${name} SET ${by} = ${survivorId} WHERE ${by} IN (${idList(gone)})${besides}`
      );
      if (once) {
        tx.run(sql`DELETE FROM ${name} WHERE ${by} IN (${idList(gone)})`);
      }
    }
    for (const table of FOLD_DROPPED) {
      tx.run(
        sql`DELETE FROM ${sql.identifier(table)} WHERE instance_id IN (${idList(gone)})`
      );
    }
    // The session as it began: its parent, its work and its place, its
    // toolset, and its name — but the owner's, which nothing replaces.
    const first = <K extends keyof typeof survivor>(key: K) =>
      members.map((member) => member[key]).find((value) => value !== null) ??
      null;
    const named = [...members]
      .reverse()
      .find((member) => member.titleSource === "owner");
    const parent = members
      .map((member) => member.parentInstanceId)
      .find((id) => id !== null && !ids.includes(id));
    // Its conversations: the former rows' first, in the order they began,
    // then the survivor's own.
    putConversations(tx, survivorId, [
      ...prior,
      ...conversationsOf(tx, survivorId),
    ]);
    tx.update(instances)
      .set({
        createdAt: root.createdAt,
        parentInstanceId: parent ?? null,
        workItemId: first("workItemId"),
        threadId: first("threadId"),
        projectId: first("projectId"),
        role: first("role"),
        delegateType: first("delegateType"),
        delegateTypeProject: first("delegateTypeProject"),
        canDelegate: first("canDelegate"),
        derivedTitle: root.derivedTitle ?? survivor.derivedTitle,
        ...(survivor.titleSource === "owner"
          ? {}
          : {
              title: named?.title ?? root.title,
              titleSource: named ? "owner" : root.titleSource,
            }),
      })
      .where(eq(instances.id, survivorId))
      .run();
    // A former row with a process that may run is ended first, by its
    // machine, and goes once that is confirmed ({@link confirmInstanceEnd}).
    const ending = formers
      .filter(
        (member) => !["stopped", "discarded", "error"].includes(member.status)
      )
      .map((member) => member.id);
    if (ending.length > 0) {
      tx.update(instances)
        .set({
          endIntent: "delete",
          endConfirmedAt: null,
          endReason: `folded into ${survivorId}`,
          endRetryAt: null,
          endAttempts: 0,
          keepAliveEnabled: false,
          keepAliveTurn: null,
          status: "stopping",
          workItemId: null,
          parentInstanceId: null,
        })
        .where(inArray(instances.id, ending))
        .run();
    }
    dropInstances(
      tx,
      gone.filter((id) => !ending.includes(id))
    );
    return { instanceId: survivorId, formers: gone, ending, owedAgain: again };
  };

  /** A tool's row as the status the wire carries: what it does not say is left out. */
  const toolStatusOf = (row: typeof agentTools.$inferSelect): ToolStatus => ({
    id: row.toolId,
    state: row.state,
    at: row.at.getTime(),
    ...(row.version === null ? {} : { version: row.version }),
    ...(row.method === null ? {} : { method: row.method }),
    ...(row.detail === null ? {} : { detail: row.detail }),
  });

  /** Each machine's tool statuses by catalog id; one machine's with `machineId`. */
  const toolsByMachine = (
    machineId?: string
  ): Map<string, Record<string, ToolStatus>> => {
    const byMachine = new Map<string, Record<string, ToolStatus>>();
    for (const row of db
      .select()
      .from(agentTools)
      .where(
        machineId === undefined
          ? undefined
          : eq(agentTools.machineId, machineId)
      )
      .all()) {
      byMachine.set(row.machineId, {
        ...byMachine.get(row.machineId),
        [row.toolId]: toolStatusOf(row),
      });
    }
    return byMachine;
  };

  const toolsOf = (machineId: string): Record<string, ToolStatus> =>
    toolsByMachine(machineId).get(machineId) ?? {};

  /** Each status over the machine's cell for its tool, the rest kept, in one transaction. */
  const putToolCells = (machineId: string, statuses: ToolStatus[]): void => {
    db.transaction((tx) => {
      // A machine the hub keeps no row for has no cells to keep.
      if (
        !tx
          .select({ machineId: agents.machineId })
          .from(agents)
          .where(eq(agents.machineId, machineId))
          .get()
      ) {
        return;
      }
      for (const status of statuses) {
        const cell = {
          state: status.state,
          version: status.version ?? null,
          method: status.method ?? null,
          detail: status.detail ?? null,
          at: new Date(status.at),
        };
        tx.insert(agentTools)
          .values({ machineId, toolId: status.id, ...cell })
          .onConflictDoUpdate({
            target: [agentTools.machineId, agentTools.toolId],
            set: cell,
          })
          .run();
      }
    });
  };

  /** Each machine's harness reports, in the order they were last reported; one machine's with `machineId`. */
  const harnessesByMachine = (
    machineId?: string
  ): Map<string, HarnessReport[]> => {
    const byMachine = new Map<string, HarnessReport[]>();
    for (const row of db
      .select()
      .from(agentHarnesses)
      .where(
        machineId === undefined
          ? undefined
          : eq(agentHarnesses.machineId, machineId)
      )
      .orderBy(sql`rowid`)
      .all()) {
      byMachine.set(row.machineId, [
        ...(byMachine.get(row.machineId) ?? []),
        row.report,
      ]);
    }
    return byMachine;
  };

  /**
   * One history's retention, the same for memory, hooks and skills: the
   * newest {@link HISTORY_LIMIT} rows of the one thing `of` names are kept.
   * Pruned within that thing's own history, so a fleet of fifty hooks or
   * skills does not have every save of one of them evict another's past.
   */
  const pruneHistory = (
    table: AnySQLiteTable,
    id: AnySQLiteColumn,
    of: SQL
  ): void => {
    const keep = db
      .select({ id })
      .from(table)
      .where(of)
      .orderBy(desc(id))
      .limit(HISTORY_LIMIT)
      .all()
      .map((row) => row.id as number);
    db.delete(table)
      .where(and(of, notInArray(id, keep)))
      .run();
  };

  /** A `wf-` skill a workflow owns is that workflow's to change, never a fleet write's. */
  const refuseWorkflowSkill = (name: string): void => {
    if (
      name.startsWith("wf-") &&
      db
        .select({ id: workflows.id })
        .from(workflows)
        .where(eq(workflows.slug, name.slice("wf-".length)))
        .get()
    ) {
      throw new Error(
        `Skill ${name} is owned by a workflow; edit or delete that workflow instead.`
      );
    }
  };

  /** A skill's version, kept before it is replaced or destroyed. */
  const recordFleetSkill = ({
    name,
    skillSource,
    hash,
    files,
    source,
  }: {
    name: string;
    skillSource: string;
    hash: string;
    files: SkillFile[];
    source: string;
  }): void => {
    db.insert(fleetSkillHistory)
      .values({
        name,
        skillSource,
        hash,
        bytes: files.reduce(
          (total, file) =>
            total + Buffer.byteLength(file.contentBase64, "base64"),
          0
        ),
        files,
        source,
      })
      .run();
    pruneHistory(
      fleetSkillHistory,
      fleetSkillHistory.id,
      eq(fleetSkillHistory.name, name)
    );
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

  /** Each document's projects, by its path. */
  const memoryDocProjects = (docPath?: string): Map<string, string[]> => {
    const byPath = new Map<string, string[]>();
    for (const link of db
      .select()
      .from(fleetMemoryDocProjects)
      .where(
        docPath === undefined
          ? undefined
          : eq(fleetMemoryDocProjects.path, docPath)
      )
      .all()) {
      byPath.set(link.path, [...(byPath.get(link.path) ?? []), link.projectId]);
    }
    return byPath;
  };

  const listFleetMemoryDocs = (): MemoryDocRow[] => {
    const projectsOf = memoryDocProjects();
    return db
      .select()
      .from(fleetMemoryDocs)
      .orderBy(fleetMemoryDocs.path)
      .all()
      .map((row) => memoryDocRow(row, projectsOf.get(row.path) ?? []));
  };

  const getFleetMemoryDoc = (docPath: string): MemoryDocRow | undefined => {
    const row = db
      .select()
      .from(fleetMemoryDocs)
      .where(eq(fleetMemoryDocs.path, docPath))
      .get();
    return row
      ? memoryDocRow(row, memoryDocProjects(docPath).get(docPath) ?? [])
      : undefined;
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
      { id: string; name: string; at: number }
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
        harness: instances.harness,
        launchDir: instances.launchDir,
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
          name: row.title ?? row.derivedTitle ?? sessionLabel(row).name,
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
   * changes nothing costs one select. A catalog read from a harness's server
   * (OpenCode's) arrives on a beat after the register and is written the same
   * way.
   */
  const dateStoredSessions = (
    machineId: string,
    liveIds: string[],
    resumableAt?: Record<string, number>
  ): number => {
    if (!resumableAt) {
      return 0;
    }
    let moved = 0;
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
      moved += 1;
    }
    return moved;
  };

  const store: DbShape = {
    close: () => db.$client.close(),
    machinePathOn: (machineId, raw) => {
      const agent = db
        .select({ home: agents.home, hostname: agents.hostname })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      try {
        return machinePath(agent?.home, raw, agent?.hostname ?? machineId);
      } catch (error) {
        if (error instanceof MachinePathRefused) {
          return error;
        }
        throw error;
      }
    },
    dateStoredSessions,
    // A confirmed end whose process its machine turns out to hold: owed again,
    // and stopping again until the machine confirms it.
    clearEndConfirmation: (id) => {
      db.update(instances)
        .set({
          endConfirmedAt: null,
          status: sql`CASE WHEN ${instances.status} = 'discarded' THEN 'discarded' ELSE 'stopping' END`,
        })
        .where(and(eq(instances.id, id), isNotNull(instances.endIntent)))
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
    instanceTooling: (id) =>
      db
        .select({ tooling: instances.tooling })
        .from(instances)
        .where(
          and(
            eq(instances.id, id),
            eq(instances.machineRemoved, false),
            ne(instances.status, "discarded"),
            or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
          )
        )
        .get()?.tooling,
    ownedInstance: (id, machineId) =>
      db
        .select(ownedColumns)
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
    recordScratchWorktree: (id, scratchWorktree, dir) => {
      db.update(instances)
        .set({ scratchWorktree, cwd: dir })
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
        .select(ownedColumns)
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
          let confirmedAt = row.endIntent === next ? row.endConfirmedAt : null;
          if (neverStarted) {
            confirmedAt = new Date();
          }
          // The one place an end's status is filed: `stopping` until its
          // machine confirms the process gone ({@link confirmInstanceEnd}),
          // which files it `stopped` or `discarded`.
          let status: "discarded" | "stopped" | "stopping" = "stopping";
          if (row.status === "discarded") {
            status = "discarded";
          } else if (confirmedAt) {
            status = "stopped";
          }
          const ended = tx
            .update(instances)
            .set({
              endIntent: next,
              endConfirmedAt: confirmedAt,
              endReason: neverStarted ? "never started" : row.endReason,
              endRetryAt: null,
              endAttempts: 0,
              keepAliveEnabled: false,
              keepAliveTurn: null,
              keepAliveStopped: null,
              status,
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
                keepAliveEnabled: sql`CASE WHEN ${instances.status} IN ('stopping', 'stopped', 'discarded', 'error') THEN 0 ELSE 1 END`,
              }
            : {}),
        })
        .where(eq(instances.id, id))
        .run();
    },
    agentHarnesses: (machineId) => harnessesByMachine(machineId).get(machineId),
    listBoardInstances: () =>
      db
        .select(boardColumns)
        .from(instances)
        .where(listedInstances())
        .all()
        .map(asListed),
    toolListing: (listing) =>
      db
        .select({ toolsHash: mcpToolListings.toolsHash })
        .from(mcpToolListings)
        .where(eq(mcpToolListings.listing, listing))
        .get()?.toolsHash,
    putToolListing: (listing, toolsHash) => {
      const row = { listing, toolsHash, listedAt: new Date() };
      db.insert(mcpToolListings)
        .values(row)
        .onConflictDoUpdate({ target: mcpToolListings.listing, set: row })
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
    getMcpServer: (name) => {
      const row = db
        .select()
        .from(mcpServers)
        .where(eq(mcpServers.name, name))
        .get();
      // A config the hub's key does not open is no server until it is saved again.
      return row?.config ? { ...row, config: row.config } : undefined;
    },
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
    getMcpSession: (id, server) =>
      db
        .select({ init: fleetMcpSessions.init })
        .from(fleetMcpSessions)
        .where(
          and(eq(fleetMcpSessions.id, id), eq(fleetMcpSessions.server, server))
        )
        .get()?.init,
    putMcpSession: ({ id, server, init }) => {
      const row = { id, server, init, usedAt: new Date() };
      db.insert(fleetMcpSessions)
        .values(row)
        .onConflictDoUpdate({ target: fleetMcpSessions.id, set: row })
        .run();
    },
    touchMcpSession: (id) => {
      db.update(fleetMcpSessions)
        .set({ usedAt: new Date() })
        .where(eq(fleetMcpSessions.id, id))
        .run();
    },
    deleteMcpSession: (id) => {
      db.delete(fleetMcpSessions).where(eq(fleetMcpSessions.id, id)).run();
    },
    pruneMcpSessions: (before) =>
      db
        .delete(fleetMcpSessions)
        .where(lt(fleetMcpSessions.usedAt, before))
        .returning({ id: fleetMcpSessions.id })
        .all().length,
    setMcpAuth: (name, mode, error) => {
      db.update(mcpServers)
        .set({ authMode: mode, authError: error ?? null })
        .where(eq(mcpServers.name, name))
        .run();
    },
    takeMcpAuthorization: (state) =>
      db.transaction((tx) => {
        // A sign-in under way is sealed, so its state is found by opening
        // each one: a fleet holds a handful.
        const row = tx
          .select()
          .from(fleetMcpOauth)
          .where(isNotNull(fleetMcpOauth.pending))
          .all()
          .find((one) => one.pending?.state === state);
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
      db
        .select(workflowListColumns)
        .from(workflows)
        .orderBy(desc(workflows.updatedAt))
        .all(),
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
          .select({ id: workflowRuns.id })
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowId, id))
          .all()) {
          tx.update(instances)
            .set({ workflowRunId: null, workflowStepId: null })
            .where(eq(instances.workflowRunId, run.id))
            .run();
          for (const step of tx
            .select({ id: workflowSteps.id })
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
    listWorkflowRunSummaries: (workflowId) =>
      db
        .select({
          endedAt: workflowRuns.endedAt,
          failure: workflowRuns.failure,
          id: workflowRuns.id,
          machineId: workflowRuns.machineId,
          parentRunId: workflowRuns.parentRunId,
          seenAt: workflowRuns.seenAt,
          startedAt: workflowRuns.startedAt,
          status: workflowRuns.status,
          supervisorInstanceId: workflowRuns.supervisorInstanceId,
          workflowId: workflowRuns.workflowId,
          workspace: workflowRuns.workspace,
        })
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowId, workflowId))
        .orderBy(desc(workflowRuns.startedAt))
        .all(),
    workflowRunHeads: (workflowId) =>
      db
        .select({
          id: workflowRuns.id,
          parentRunId: workflowRuns.parentRunId,
          status: workflowRuns.status,
          supervisorInstanceId: workflowRuns.supervisorInstanceId,
        })
        .from(workflowRuns)
        .where(workflowId ? eq(workflowRuns.workflowId, workflowId) : undefined)
        .all(),
    listLiveWorkflowRuns: ({ machineId, parentRunId }) =>
      db
        .select()
        .from(workflowRuns)
        .where(
          and(
            parentRunId === undefined
              ? undefined
              : eq(workflowRuns.parentRunId, parentRunId),
            machineId === undefined
              ? undefined
              : eq(workflowRuns.machineId, machineId),
            or(
              inArray(workflowRuns.status, ["running", "waiting"]),
              isNotNull(workflowRuns.endingStatus)
            )
          )
        )
        .orderBy(desc(workflowRuns.startedAt))
        .all(),
    getWorkflowRun: (id) =>
      db.select().from(workflowRuns).where(eq(workflowRuns.id, id)).get(),
    workflowPendingEnds: (runId) =>
      db
        .select({ instanceId: workflowRunPendingEnds.instanceId })
        .from(workflowRunPendingEnds)
        .where(eq(workflowRunPendingEnds.runId, runId))
        .orderBy(sql`rowid`)
        .all()
        .map(({ instanceId }) => instanceId),
    setWorkflowPendingEnds: (runId, instanceIds) => {
      db.transaction((tx) => {
        tx.delete(workflowRunPendingEnds)
          .where(eq(workflowRunPendingEnds.runId, runId))
          .run();
        const wanted = [...new Set(instanceIds)];
        // A session the hub keeps no row for has nothing left to confirm.
        const kept =
          wanted.length === 0
            ? []
            : tx
                .select({ id: instances.id })
                .from(instances)
                .where(inArray(instances.id, wanted))
                .all()
                .map(({ id }) => id);
        const keptSet = new Set(kept);
        const ordered = wanted.filter((id) => keptSet.has(id));
        if (ordered.length > 0) {
          tx.insert(workflowRunPendingEnds)
            .values(ordered.map((instanceId) => ({ runId, instanceId })))
            .run();
        }
      });
    },
    addWorkflowNote: (runId, text) => {
      db.insert(workflowRunNotes).values({ runId, text, at: new Date() }).run();
    },
    takeWorkflowNotes: (runId) =>
      db
        .delete(workflowRunNotes)
        .where(eq(workflowRunNotes.runId, runId))
        .returning({ id: workflowRunNotes.id, text: workflowRunNotes.text })
        .all()
        .sort((a, b) => a.id - b.id)
        .map(({ text }) => text),
    workflowHeldStops: (runId) =>
      Object.fromEntries(
        db
          .select()
          .from(workflowHeldStops)
          .where(eq(workflowHeldStops.runId, runId))
          .all()
          .map(({ stepId, deadline, failure, action, error }) => [
            stepId,
            {
              deadline,
              failure,
              ...(action ? { action } : {}),
              ...(error === null ? {} : { error }),
            },
          ])
      ),
    putWorkflowHeldStop: (runId, stepId, stop) => {
      const values = {
        deadline: stop.deadline,
        failure: stop.failure,
        action: stop.action ?? null,
        error: stop.error ?? null,
      };
      db.insert(workflowHeldStops)
        .values({ stepId, runId, ...values })
        .onConflictDoUpdate({ target: workflowHeldStops.stepId, set: values })
        .run();
    },
    dropWorkflowHeldStop: (stepId) => {
      db.delete(workflowHeldStops)
        .where(eq(workflowHeldStops.stepId, stepId))
        .run();
    },
    workflowSlots: (runId) =>
      db
        .select()
        .from(workflowRunSlots)
        .where(eq(workflowRunSlots.runId, runId))
        .orderBy(sql`rowid`)
        .all()
        .map(({ name, schema, value }) => ({
          name,
          schema: schema ?? {},
          ...(value === null ? {} : { value: JSON.parse(value) as unknown }),
        })),
    putWorkflowSlot: (runId, name, schema, set) => {
      const values = {
        schema,
        ...(set ? { value: JSON.stringify(set.value ?? null) } : {}),
      };
      db.insert(workflowRunSlots)
        .values({ runId, name, ...values })
        .onConflictDoUpdate({
          target: [workflowRunSlots.runId, workflowRunSlots.name],
          set: values,
        })
        .run();
    },
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
      home,
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
          home,
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
            ...(home ? { home } : {}),
            ...(machineCapabilities ? { machineCapabilities } : {}),
          },
        })
        .run();
    },
    resolveHomePaths: (machineId) => {
      const agent = db
        .select({ home: agents.home, hostname: agents.hostname })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      const home = agent?.home;
      if (!(agent && home)) {
        return [];
      }
      const resolve = (raw: string) => machinePath(home, raw, agent.hostname);
      return db.transaction((tx) => {
        resolveHomeDirs(tx, machineId, resolve);
        return resolveHomePlaces(tx, machineId, resolve);
      });
    },
    setAgentAuth: (machineId, auth) =>
      db
        .update(agents)
        .set({ auth })
        .where(and(eq(agents.machineId, machineId), ne(agents.auth, auth)))
        .returning({ machineId: agents.machineId })
        .all().length > 0,
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
      role,
      delegateType,
      threadId,
      accountId,
      keepTurn = false,
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
          role,
          delegateType: delegateType?.name,
          delegateTypeProject: delegateType?.projectId,
          threadId,
          accountId,
          // A fresh conversation has spent nothing; a resumed one's spend so
          // far is unknown until its first result says it.
          modelUsageSeen: cleanSessionId ? null : {},
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
          // No `cwd`: a row keeps the directory it was launched in, and every
          // spawn of it is sent there (`launchDirOf`).
          set: {
            // A row a move held (moves.ts) is born at its first spawn.
            ...(existing?.spawnedAt === null
              ? { addressRequired: addressProtocol }
              : {}),
            kind,
            permissionMode,
            ...(model ? { model } : {}),
            // Presence, not truth: a leaf's `false` has to land.
            ...(canDelegate === undefined ? {} : { canDelegate }),
            ...(workflowRunId ? { workflowRunId } : {}),
            ...(workflowStepId ? { workflowStepId } : {}),
            ...(threadId ? { threadId } : {}),
            // A session keeps the account it started on: its transcript and
            // its prompt cache are that account's.
            ...(accountId
              ? {
                  accountId: sql`COALESCE(${instances.accountId}, ${accountId})`,
                }
              : {}),
            // `updatedAt` deliberately absent: a restore or relaunch re-issues
            // an existing session, so its last-activity time is whatever it
            // already was; stamping it here dated every restored session to the
            // daemon reconnect instant.
            status: "starting",
            spawnedAt: now,
            ...(keepTurn ? {} : { turnOpenAt: null }),
            endIntent: null,
            endConfirmedAt: null,
            endReason: null,
            endRetryAt: null,
            endAttempts: 0,
            lastError: null,
            ...(cleanSessionId ? { sessionId: cleanSessionId } : {}),
            // A start with no conversation to resume begins one from nothing.
            ...(cleanSessionId ? {} : { modelUsageSeen: {} }),
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
    holdMovingInstance: ({
      id,
      machineId,
      cwd,
      projectId,
      harness,
      model,
      permissionMode,
      title,
      derivedTitle,
      at,
    }) =>
      db
        .insert(instances)
        .values({
          id,
          machineId,
          cwd,
          projectId,
          harness,
          model,
          permissionMode,
          title,
          ...(title ? { titleSource: "agent" as const } : {}),
          derivedTitle,
          kind: "mainline",
          status: "moving",
          createdAt: at,
          updatedAt: at,
        })
        .onConflictDoNothing({ target: instances.id })
        .returning({ id: instances.id })
        .all().length > 0,
    settleMovingInstance: (id, status, lastError) =>
      db
        .update(instances)
        .set({ status, lastError: lastError ?? null })
        .where(
          and(
            eq(instances.id, id),
            isNull(instances.spawnedAt),
            inArray(instances.status, ["moving", "error"]),
            ne(instances.status, status)
          )
        )
        .returning({ id: instances.id })
        .all().length > 0,
    dropMovingInstance: (id) =>
      db.transaction((tx) => {
        const held = tx
          .select({ id: instances.id })
          .from(instances)
          .where(
            and(
              eq(instances.id, id),
              isNull(instances.spawnedAt),
              inArray(instances.status, ["moving", "error"])
            )
          )
          .get();
        if (held) {
          dropInstances(tx, [id]);
        }
        return held !== undefined;
      }),
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
      // A spin-off that was thrown away stays thrown away: its teardown can
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
    // Bookkeeping, never the session moving: `updatedAt` stays (it is
    // activity, `touchInstanceActivity`, or a status change). Stamped here, a
    // sign-in that carried every session to an account read sessions asleep
    // for weeks as "active 1m ago", and kept stopped ones listed a day more.
    patchInstance: (id, patch) =>
      db
        .update(instances)
        .set(patch)
        .where(eq(instances.id, id))
        .returning(publicColumns)
        .get(),
    instanceIdOf: (id) =>
      db
        .select({ instanceId: instanceAliases.instanceId })
        .from(instanceAliases)
        .where(eq(instanceAliases.id, id))
        .get()?.instanceId ?? id,
    formerIds: () =>
      Object.fromEntries(
        db
          .select({ id: instanceAliases.id, now: instanceAliases.instanceId })
          .from(instanceAliases)
          .all()
          .map((row) => [row.id, row.now])
      ),
    continueInPlace: (id, to) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(instances)
          .where(eq(instances.id, id))
          .get();
        const held = row ? conversationsOf(tx, id) : [];
        if (!row?.sessionId || held.some((one) => one.next === to.next)) {
          return false;
        }
        // The conversation it leaves joins its prior ones, last.
        const account = row.accountId
          ? tx
              .select({ id: accounts.id })
              .from(accounts)
              .where(eq(accounts.id, row.accountId))
              .get()?.id
          : undefined;
        tx.insert(instanceConversations)
          .values({
            instanceId: id,
            ord: held.length,
            sessionId: row.sessionId,
            harness: row.harness ?? "claude",
            model: row.model,
            accountId: account ?? null,
            endedAt: new Date(),
            nextEventId: to.next,
          })
          .run();
        tx.update(instances)
          .set({
            sessionId: null,
            accountId: to.accountId,
            harness: to.harness,
            model: to.model,
            ...(to.effort ? { chosenEffort: to.effort } : {}),
            // The new conversation has read nothing and spent nothing yet.
            contextTokens: null,
            contextReadAt: null,
            modelUsageSeen: {},
            cacheCold: null,
            lastRequestAt: null,
            lastPingUsage: null,
            keepAliveTurn: null,
            turnOpenAt: null,
            freshStartAt: null,
          })
          .where(eq(instances.id, id))
          .run();
        return true;
      }),
    priorConversations: (instanceId) => conversationsOf(db, instanceId),
    undoContinueInPlace: (id, next) =>
      db.transaction((tx) => {
        const row = tx
          .select()
          .from(instances)
          .where(eq(instances.id, id))
          .get();
        const held = row ? conversationsOf(tx, id) : [];
        const left = held.at(-1);
        if (!(row && left?.next === next && row.sessionId === null)) {
          return false;
        }
        tx.delete(instanceConversations)
          .where(
            and(
              eq(instanceConversations.instanceId, id),
              eq(instanceConversations.ord, held.length - 1)
            )
          )
          .run();
        tx.update(instances)
          .set({
            sessionId: left.sessionId,
            accountId: left.accountId,
            harness: left.harness,
            model: left.model,
            // Its spend so far is unknown until its next result says it.
            modelUsageSeen: null,
          })
          .where(eq(instances.id, id))
          .run();
        return true;
      }),
    adoptChildren: (from, to) =>
      db.transaction((tx) => {
        const items = tx
          .select()
          .from(workItems)
          .where(eq(workItems.parentInstanceId, from))
          .all();
        const liveItems = items.filter(
          (item) => item.state === "starting" || item.state === "running"
        );
        const sessions = [
          ...new Set([
            ...tx
              .select({ id: instances.id })
              .from(instances)
              .where(
                and(
                  eq(instances.parentInstanceId, from),
                  inArray(instances.status, [
                    "moving",
                    "starting",
                    "running",
                    "sleeping",
                  ])
                )
              )
              .all()
              .map((row) => row.id),
            ...liveItems.map((item) => item.instanceId),
          ]),
        ];
        const carried = items.filter(
          (item) =>
            liveItems.includes(item) || sessions.includes(item.instanceId)
        );
        const groups = new Set(
          carried.flatMap((item) => (item.group ? [item.group] : []))
        );
        const moved = items.filter(
          (item) =>
            carried.includes(item) ||
            (item.group !== null &&
              groups.has(item.group) &&
              item.groupReportedAt === null)
        );
        if (sessions.length > 0) {
          tx.update(instances)
            .set({ parentInstanceId: to })
            .where(
              and(
                eq(instances.parentInstanceId, from),
                inArray(instances.id, sessions)
              )
            )
            .run();
        }
        if (moved.length > 0) {
          tx.update(workItems)
            .set({ parentInstanceId: to })
            .where(
              inArray(
                workItems.id,
                moved.map((item) => item.id)
              )
            )
            .run();
        }
        const queuedItems = tx
          .select({ id: queuedWorkItems.id })
          .from(queuedWorkItems)
          .where(eq(queuedWorkItems.parentInstanceId, from))
          .all().length;
        tx.update(queuedWorkItems)
          .set({ parentInstanceId: to })
          .where(eq(queuedWorkItems.parentInstanceId, from))
          .run();
        const queuedStarts = tx
          .select({ taskId: queuedTaskStarts.taskId })
          .from(queuedTaskStarts)
          .where(eq(queuedTaskStarts.parentInstanceId, from))
          .all().length;
        tx.update(queuedTaskStarts)
          .set({ parentInstanceId: to })
          .where(eq(queuedTaskStarts.parentInstanceId, from))
          .run();
        const pendingAsks = and(
          eq(delegateEvents.parentInstanceId, from),
          eq(delegateEvents.kind, "ask"),
          eq(delegateEvents.status, "pending"),
          inArray(delegateEvents.instanceId, sessions)
        );
        const asks =
          sessions.length > 0
            ? tx
                .select({ id: delegateEvents.id })
                .from(delegateEvents)
                .where(pendingAsks)
                .all().length
            : 0;
        if (asks > 0) {
          tx.update(delegateEvents)
            .set({ parentInstanceId: to })
            .where(pendingAsks)
            .run();
        }
        return {
          sessions,
          items: moved.length,
          queuedItems,
          queuedStarts,
          asks,
        };
      }),
    foldFormerSessions: (owedAgain) => {
      const open = db
        .select()
        .from(instanceAliases)
        .where(eq(instanceAliases.folded, false))
        .all();
      const bySurvivor = new Map<string, string[]>();
      for (const alias of open) {
        bySurvivor.set(alias.instanceId, [
          ...(bySurvivor.get(alias.instanceId) ?? []),
          alias.id,
        ]);
      }
      return [...bySurvivor].flatMap(([survivorId, formerIds]) =>
        db.transaction((tx) => {
          const folded = foldInto(tx, survivorId, formerIds, owedAgain);
          tx.update(instanceAliases)
            .set({ folded: true })
            .where(inArray(instanceAliases.id, formerIds))
            .run();
          return folded ? [folded] : [];
        })
      );
    },
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
    // `updatedAt` untouched for the same reason: a choice is not the session moving.
    chooseEffort: (id, effort) => {
      db.update(instances)
        .set({ chosenEffort: effort })
        .where(eq(instances.id, id))
        .run();
    },
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
      // The directory is taken from the first `init` only — the spawn's own
      // directory as the machine resolved it (`~` expanded). Every later `init`
      // carries wherever the CLI has since `cd`'d to, which is not where the
      // session lives.
      db.update(instances)
        .set({
          sessionId,
          ...(cwd
            ? {
                cwd: sql`CASE WHEN ${instances.sessionId} IS NULL THEN ${cwd} ELSE ${instances.cwd} END`,
              }
            : {}),
          ...(harness ? { harness } : {}),
          ...(tooling ? { tooling } : {}),
        })
        .where(eq(instances.id, id))
        .run();
    },
    launchDirOf: (id) => {
      const row = db
        .select({ cwd: instances.cwd, launchDir: instances.launchDir })
        .from(instances)
        .where(eq(instances.id, id))
        .get();
      if (!row) {
        return;
      }
      return row.launchDir === "unknown" ? { unknown: true } : { cwd: row.cwd };
    },
    unreadLaunchDirs: (machineId) =>
      db
        .select({
          id: instances.id,
          sessionId: instances.sessionId,
          harness: instances.harness,
        })
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            eq(instances.launchDir, "unread"),
            isNotNull(instances.sessionId)
          )
        )
        .all()
        .flatMap((row) =>
          row.sessionId ? [{ ...row, sessionId: row.sessionId }] : []
        ),
    settleLaunchDir: (id, cwd) => {
      db.update(instances)
        .set(cwd ? { launchDir: "known", cwd } : { launchDir: "unknown" })
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
    owesSpawn: (id) =>
      db
        .select({ id: instances.id })
        .from(instances)
        .where(and(eq(instances.id, id), isNotNull(instances.owedSpawn)))
        .get() !== undefined,
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
    settleInstances: (machineId, liveIds, heldIds, resumable, resumableAt) => {
      const alive = [...new Set([...liveIds, ...heldIds])];
      if (resumable) {
        // The authoritative catalog says which Claude conversations still exist.
        // A previously failed resume is checked too, without launching it again.
        // A process still running is not a conversation gone, catalogued or not.
        db.update(instances)
          .set({ status: "error", lastError: CLAUDE_CONVERSATION_GONE })
          .where(
            and(
              eq(instances.machineId, machineId),
              eq(instances.machineRemoved, false),
              or(eq(instances.harness, "claude"), isNull(instances.harness)),
              isNotNull(instances.sessionId),
              notInArray(instances.status, [
                "stopping",
                "stopped",
                "discarded",
              ]),
              alive.length ? notInArray(instances.id, alive) : undefined,
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
      const held = new Set(heldIds);
      const settled = orphans.map((row) => {
        // Its process outlived the daemon that let go of it, and the attach
        // the caller sends next is how it comes back (`restore`). A process
        // is no nap: filed asleep, the asks its attach replays were refused
        // at admission, and its CLI waited on a question nobody was shown.
        if (held.has(row.id)) {
          db.update(instances)
            .set({ status: "starting", lastError: null })
            .where(eq(instances.id, row.id))
            .run();
          return { row, resumes: true };
        }
        // One that never named a conversation comes back fresh under its id
        // (core `relaunchOf`): nothing of it is lost — a continuation in
        // place is one, until its new conversation's first `init`.
        const resumes =
          !catalog ||
          row.sessionId === null ||
          row.harness === "opencode" ||
          catalog.has(row.sessionId);
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
    reconcileHeartbeat: (machineId, liveIds, heldIds, graceMs) => {
      const now = new Date();
      // Attached or still being attached, the process is there: only a row
      // with neither has gone.
      const alive = [...new Set([...liveIds, ...heldIds])];
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
      // process the machine neither lists nor holds has no process; the only
      // question left is whether the conversation outlived it.
      const gone = db
        .select()
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            eq(instances.machineRemoved, false),
            isNull(instances.owedSpawn),
            inArray(instances.status, ["running", "starting"]),
            alive.length > 0 ? notInArray(instances.id, alive) : undefined
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
      // vanished is not the session doing anything. One that never named a
      // conversation comes back fresh under its id (core `relaunchOf`), as
      // `settleInstances` files it: asleep, nothing lost.
      for (const row of gone) {
        db.update(instances)
          .set({ status: "sleeping", lastError: null })
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
    parkedAsks: {
      drop: (requestId) => {
        db.delete(parkedAsks).where(eq(parkedAsks.requestId, requestId)).run();
      },
      list: () =>
        db
          .select({ envelope: parkedAsks.envelope })
          .from(parkedAsks)
          .all()
          .map((row) => row.envelope),
      save: (requestId, envelope) => {
        const row = {
          requestId,
          instanceId: envelope.instanceId ?? null,
          machineId: envelope.machineId,
          envelope,
        };
        db.insert(parkedAsks)
          .values(row)
          .onConflictDoUpdate({ target: parkedAsks.requestId, set: row })
          .run();
      },
    },
    markInstanceAttaching: (id) =>
      db
        .update(instances)
        .set({ status: "starting", lastError: null })
        .where(
          and(
            eq(instances.id, id),
            inArray(instances.status, ["unknown", "sleeping", "error"])
          )
        )
        .returning({ id: instances.id })
        .all().length > 0,
    settleUnavailableRecovery: (id) => {
      const row = db.select().from(instances).where(eq(instances.id, id)).get();
      if (!row || (row.status !== "starting" && row.status !== "unknown")) {
        return false;
      }
      // Resumed on its conversation, or fresh when it never named one.
      db.update(instances)
        .set({ status: "sleeping", lastError: null })
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
    agentTools: toolsOf,
    // A report with nothing in it says nothing: a daemon that predates the tool
    // catalog must not read as a machine that has just lost every tool on it.
    mergeAgentTools: (machineId, statuses) => {
      putToolCells(machineId, statuses);
    },
    // The harnesses reported replace their own rows, read after the ones this
    // report did not name; every other harness stays as it was.
    mergeAgentHarnesses: (machineId, reports) => {
      db.transaction((tx) => {
        if (
          !tx
            .select({ machineId: agents.machineId })
            .from(agents)
            .where(eq(agents.machineId, machineId))
            .get()
        ) {
          return;
        }
        const latest = [
          ...new Map(
            reports.map((report) => [report.harness, report])
          ).values(),
        ];
        for (const report of latest) {
          tx.delete(agentHarnesses)
            .where(
              and(
                eq(agentHarnesses.machineId, machineId),
                eq(agentHarnesses.harness, report.harness)
              )
            )
            .run();
        }
        if (latest.length > 0) {
          tx.insert(agentHarnesses)
            .values(
              latest.map((report) => ({
                machineId,
                harness: report.harness,
                report,
              }))
            )
            .run();
        }
      });
    },
    setAgentToolCell: (machineId, status) => {
      putToolCells(machineId, [status]);
    },
    fleetConfig: () => {
      return {
        mcp: db
          .select()
          .from(mcpServers)
          .all()
          // A config the hub's key does not open is no server until it is saved again.
          .flatMap((row) =>
            row.config ? [{ ...row, config: row.config }] : []
          )
          .map(
            ({
              name,
              config,
              enabled,
              authMode,
              authError,
              projectId,
              platforms,
            }) => {
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
                ...(projectId ? { projectId, scope: "local" as const } : {}),
                ...(platforms ? { platforms } : {}),
                auth: {
                  mode: authMode,
                  state,
                  ...(authError ? { detail: authError } : {}),
                },
              };
            }
          ),
        marketplaces: db
          .select()
          .from(marketplaces)
          .all()
          .map(({ name, source }) => ({ name, source })),
        plugins: db
          .select({ id: plugins.id, enabled: plugins.enabled })
          .from(plugins)
          .all(),
        // Only the rows that resolved: a skill with no files is nothing a machine
        // could converge on, and one whose row says nothing is not sent at all.
        skills: [
          ...db
            .select({
              name: skills.name,
              hash: skills.hash,
              files: skills.files,
              projectId: skills.projectId,
            })
            .from(skills)
            .where(eq(skills.enabled, true))
            .all()
            .flatMap(({ name, hash, files, projectId }) =>
              hash && files
                ? [
                    {
                      name,
                      hash,
                      files,
                      ...(projectId
                        ? { projectId, scope: "project" as const }
                        : {}),
                    },
                  ]
                : []
            ),
          ...db
            .select({
              id: workflows.id,
              name: workflows.name,
              slug: workflows.slug,
              inputs: workflows.inputs,
            })
            .from(workflows)
            .all()
            .map((workflow) => workflowSkill(workflow, workflow.inputs)),
          // CawCo's own; a fleet skill of the same name, on or off, is the operator's word on it.
          ...(() => {
            const named = new Set(
              db
                .select({ name: skills.name })
                .from(skills)
                .all()
                .map(({ name }) => name)
            );
            return [
              ...bundledSkills(),
              // Each template's starter skills, bound to the projects made from it.
              ...starterSkills(
                db
                  .select({ id: projects.id, template: projects.template })
                  .from(projects)
                  .all()
              ),
            ].filter((skill) => !named.has(skill.name));
          })(),
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
                files,
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
            // The linked documents alone: a scoped one is loaded into its
            // sessions, never written under `~/.claude/memories/`.
            docs: listFleetMemoryDocs().flatMap(
              ({ path: docPath, hash, content, scope }) =>
                scope ? [] : [{ path: docPath, hash, content }]
            ),
          };
        })(),
        // A project's documents for all its sessions, each placed once per
        // checkout and workspace of it as the sync goes out (project-placements.ts).
        // One with a role goes to its sessions as they launch instead.
        // A document of several projects is one row per project.
        placedMemory: listFleetMemoryDocs().flatMap(
          ({ path: docPath, hash, content, scope }) =>
            scope?.role
              ? []
              : (scope?.projectIds ?? []).map((projectId) => ({
                  path: docPath,
                  hash,
                  content,
                  projectId,
                  scope: "project" as const,
                }))
        ),
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
        ...(() => {
          const row = db
            .select({
              deniedSeeded: supervisorConfig.deniedSeeded,
              cawcoTodos: supervisorConfig.cawcoTodos,
            })
            .from(supervisorConfig)
            .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
            .get();
          return {
            deniedTools: row?.deniedSeeded ? deniedToolNames() : undefined,
            cawcoTodos: row?.cawcoTodos ?? false,
          };
        })(),
      };
    },
    putMcpServer: ({ name, config, enabled, projectId, platforms }) => {
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
      const placement = placementOf(projectId, previous?.projectId, "local");
      const bound = placement.projectId;
      const asked = platforms?.length ? platforms : null;
      const runsOn =
        platforms === undefined ? (previous?.platforms ?? null) : asked;
      // A new or changed config is unsettled — failed, so never synced — until
      // the hub hears from the server (fleet-mcp.ts `#probe`).
      const unsettled = {
        authMode: "direct" as const,
        authError: MCP_NOT_YET_REACHED,
      };
      db.insert(mcpServers)
        .values({
          name,
          config,
          enabled: enabled ?? true,
          platforms: runsOn,
          ...placement,
          ...unsettled,
        })
        .onConflictDoUpdate({
          target: mcpServers.name,
          set: {
            config,
            enabled: enabled ?? true,
            platforms: runsOn,
            ...placement,
            ...(changed ? unsettled : {}),
          },
        })
        .run();
      return {
        name,
        config,
        enabled: enabled ?? true,
        ...(bound ? { projectId: bound, scope: "local" as const } : {}),
        ...(runsOn ? { platforms: runsOn } : {}),
      };
    },
    deleteMcpServer: (name) => {
      db.delete(fleetMcpOauth).where(eq(fleetMcpOauth.name, name)).run();
      db.delete(fleetMcpSessions)
        .where(eq(fleetMcpSessions.server, name))
        .run();
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
    renameMarketplace: (from, to) =>
      db.transaction((tx) => {
        const taken = tx
          .select({ name: marketplaces.name })
          .from(marketplaces)
          .where(eq(marketplaces.name, to))
          .get();
        if (taken) {
          tx.delete(marketplaces).where(eq(marketplaces.name, from)).run();
        } else {
          tx.update(marketplaces)
            .set({ name: to })
            .where(eq(marketplaces.name, from))
            .run();
        }
        const ids = new Set(
          tx
            .select({ id: plugins.id })
            .from(plugins)
            .all()
            .map(({ id }) => id)
        );
        const moved: [string, string][] = [];
        for (const id of ids) {
          const [name, marketplace] = id.split("@");
          if (marketplace !== from) {
            continue;
          }
          const next = `${name}@${to}`;
          if (ids.has(next)) {
            tx.delete(plugins).where(eq(plugins.id, id)).run();
          } else {
            tx.update(plugins)
              .set({ id: next })
              .where(eq(plugins.id, id))
              .run();
          }
          moved.push([id, next]);
        }
        return moved;
      }),
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
        .select({ id: plugins.id, hash: plugins.hash })
        .from(plugins)
        .where(eq(plugins.enabled, true))
        .all()
        .flatMap(({ id, hash }) => (hash ? [] : [id])),
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
          scope: skills.scope,
          projectId: skills.projectId,
        })
        .from(skills)
        .all()
        .map(skillMeta),
    putSkill: ({
      name,
      source,
      enabled,
      hash,
      bytes,
      error,
      files,
      projectId,
    }) => {
      refuseWorkflowSkill(name);
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      // A resolve that failed on the source the row already carries keeps the
      // last copy that worked: the machines are serving it, and a repo that was
      // unreachable for a minute is no reason to take a working skill off them.
      const keep = error !== undefined && stored?.source === source;
      // What this change replaces is kept first, as a hook's or a memory
      // document's is: every refresh, adopt, new source or restore that
      // moves the fleet's copy leaves the old one in the skill's history.
      if (
        !keep &&
        stored?.hash &&
        stored.files &&
        hash !== undefined &&
        hash !== stored.hash
      ) {
        recordFleetSkill({
          name,
          skillSource: stored.source,
          hash: stored.hash,
          files: stored.files,
          source: "fleet",
        });
      }
      const row = {
        name,
        source,
        enabled: enabled ?? true,
        hash: (keep ? stored.hash : hash) ?? null,
        bytes: (keep ? stored.bytes : bytes) ?? null,
        error: error ?? null,
        files: (keep ? stored.files : files) ?? null,
      };
      const placement = placementOf(projectId, stored?.projectId, "project");
      db.insert(skills)
        .values({ ...row, ...placement })
        .onConflictDoUpdate({
          target: skills.name,
          set: {
            source: row.source,
            enabled: row.enabled,
            hash: row.hash,
            bytes: row.bytes,
            error: row.error,
            files: row.files,
            ...placement,
          },
        })
        .run();
      return skillMeta({ ...row, ...placement });
    },
    setSkillEnabled: (name, enabled) => {
      refuseWorkflowSkill(name);
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      if (!stored) {
        return;
      }
      db.update(skills).set({ enabled }).where(eq(skills.name, name)).run();
      return skillMeta({ ...stored, enabled });
    },
    stageSkill: ({ name, source, enabled, projectId }) => {
      refuseWorkflowSkill(name);
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      const placement = placementOf(projectId, stored?.projectId, "project");
      if (!stored) {
        const row = {
          name,
          source,
          enabled: enabled ?? true,
          hash: null,
          bytes: null,
          error: null,
          files: null,
        };
        db.insert(skills)
          .values({ ...row, ...placement })
          .run();
        return skillMeta({ ...row, ...placement });
      }
      // The source, hash and files stay the last fetch's until this one lands
      // (`putSkill`), so a fetch that fails keeps what the machines serve.
      const next = { enabled: enabled ?? stored.enabled, ...placement };
      db.update(skills).set(next).where(eq(skills.name, name)).run();
      return skillMeta({ ...stored, ...next });
    },
    deleteSkill: (name) => {
      // A delete takes a final snapshot, as a hook's does.
      const stored = db
        .select()
        .from(skills)
        .where(eq(skills.name, name))
        .get();
      if (stored?.hash && stored.files) {
        recordFleetSkill({
          name,
          skillSource: stored.source,
          hash: stored.hash,
          files: stored.files,
          source: "fleet",
        });
      }
      db.delete(skills).where(eq(skills.name, name)).run();
    },
    recordFleetSkill,
    listFleetSkillHistory: (name) =>
      db
        .select({
          id: fleetSkillHistory.id,
          name: fleetSkillHistory.name,
          hash: fleetSkillHistory.hash,
          bytes: fleetSkillHistory.bytes,
          source: fleetSkillHistory.source,
          createdAt: fleetSkillHistory.createdAt,
        })
        .from(fleetSkillHistory)
        .where(eq(fleetSkillHistory.name, name))
        .orderBy(desc(fleetSkillHistory.id))
        .all(),
    fleetSkillVersion: (id) =>
      db
        .select()
        .from(fleetSkillHistory)
        .where(eq(fleetSkillHistory.id, id))
        .get(),
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
      pruneHistory(
        fleetHookHistory,
        fleetHookHistory.id,
        eq(fleetHookHistory.hookId, version.hookId)
      );
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
    getFleetMemoryDoc,
    putFleetMemoryDoc: ({ path: docPath, content, scope }) => {
      const written = {
        content,
        hash: hashText(content),
        updatedAt: new Date(),
        // Given, it replaces the stored scope whole; left out, the stored one stays.
        ...(scope === undefined ? {} : { role: scope.role ?? null }),
      };
      db.transaction((tx) => {
        tx.insert(fleetMemoryDocs)
          .values({ path: docPath, ...written })
          .onConflictDoUpdate({ target: fleetMemoryDocs.path, set: written })
          .run();
        if (scope === undefined) {
          return;
        }
        tx.delete(fleetMemoryDocProjects)
          .where(eq(fleetMemoryDocProjects.path, docPath))
          .run();
        for (const projectId of new Set(scope.projectIds ?? [])) {
          tx.insert(fleetMemoryDocProjects)
            .values({ path: docPath, projectId })
            .run();
        }
      });
      const stored = getFleetMemoryDoc(docPath);
      if (!stored) {
        throw new Error(`${docPath} was not stored`);
      }
      return stored;
    },
    deleteFleetMemoryDoc: (docPath) => {
      db.delete(fleetMemoryDocs).where(eq(fleetMemoryDocs.path, docPath)).run();
    },
    recordFleetMemory: ({ content, hash, source, path: docPath }) => {
      db.insert(fleetMemoryHistory)
        .values({ content, hash, source, path: docPath ?? null })
        .run();
      pruneHistory(
        fleetMemoryHistory,
        fleetMemoryHistory.id,
        docPath === undefined
          ? isNull(fleetMemoryHistory.path)
          : eq(fleetMemoryHistory.path, docPath)
      );
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
      db.update(agents)
        .set({ fleet: report })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    // A pause moved while it lasts keeps what it stopped already, and adds
    // what it stopped this time.
    setMachinePause: (machineId, until, stopped) => {
      const row = db
        .select({ pauseStopped: agents.pauseStopped })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      if (!row) {
        return false;
      }
      const kept: StoppedCommands = until ? { ...row.pauseStopped } : {};
      for (const [kind, count] of Object.entries(stopped ?? {}) as [
        RunKind,
        number,
      ][]) {
        kept[kind] = (kept[kind] ?? 0) + count;
      }
      db.update(agents)
        .set({
          pausedUntil: until,
          pauseStopped: Object.keys(kept).length > 0 ? kept : null,
        })
        .where(eq(agents.machineId, machineId))
        .run();
      return true;
    },
    listAgents: () => {
      const toolCells = toolsByMachine();
      const reports = harnessesByMachine();
      return db
        .select()
        .from(agents)
        .all()
        .map(
          ({
            addressContract: _addressContract,
            fleet,
            build,
            home,
            machineCapabilities,
            pausedUntil,
            pauseStopped,
            ...agent
          }) => {
            const harnesses = reports.get(agent.machineId);
            return {
              ...agent,
              tools: toolCells.get(agent.machineId) ?? {},
              pausedUntil: pausedUntil?.getTime() ?? null,
              pauseStopped:
                (pauseStopped && stoppedWords(pauseStopped)) || null,
              ...(fleet ? { fleet } : {}),
              ...(build ? { build } : {}),
              ...(harnesses ? { harnesses } : {}),
              ...(home ? { home } : {}),
              ...(machineCapabilities ? { machineCapabilities } : {}),
            };
          }
        );
    },
    // A discarded spin-off is gone for good, and a row that has not moved in a
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
        .map(asListed),
    listedInstancesByIds: (ids) =>
      ids.length === 0
        ? []
        : db
            .select(publicColumns)
            .from(instances)
            .where(and(listedInstances(), inArray(instances.id, ids)))
            .all()
            .map(asListed),
    listedBoardInstancesByIds: (ids) =>
      ids.length === 0
        ? []
        : db
            .select(boardColumns)
            .from(instances)
            .where(and(listedInstances(), inArray(instances.id, ids)))
            .all()
            .map(asListed),
    takeChangedInstances: () => [
      ...new Set(takeChanges.all().map((row) => row.id)),
    ],
    listedChildCount: (parentInstanceId) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(instances)
        .where(
          and(
            listedInstances(),
            eq(instances.parentInstanceId, parentInstanceId)
          )
        )
        .get()?.n ?? 0,
    liveMainlineFolders: () =>
      db
        .select({
          id: instances.id,
          machineId: instances.machineId,
          cwd: instances.cwd,
        })
        .from(instances)
        .where(
          and(
            listedInstances(),
            eq(instances.kind, "mainline"),
            isNull(instances.parentInstanceId),
            isNull(instances.workflowStepId),
            inArray(instances.status, ["running", "starting", "sleeping"])
          )
        )
        .all(),
    liveInstancesOn: (machineId) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(
          and(
            listedInstances(),
            eq(instances.machineId, machineId),
            inArray(instances.status, ["running", "starting"])
          )
        )
        .all()
        .map(asListed),
    claudeConversationsOn: (machineId) =>
      db
        .select({
          id: instances.id,
          sessionId: sql<string>`${instances.sessionId}`,
          accountId: instances.accountId,
        })
        .from(instances)
        .where(
          and(
            listedInstances(),
            eq(instances.machineId, machineId),
            or(isNull(instances.harness), eq(instances.harness, "claude")),
            isNotNull(instances.sessionId)
          )
        )
        .all(),
    runningInstancesOf: (harness) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(
          and(
            listedInstances(),
            eq(instances.status, "running"),
            eq(instances.harness, harness)
          )
        )
        .all()
        .map(asListed),
    keepAliveInstances: () =>
      db
        .select(publicColumns)
        .from(instances)
        .where(and(listedInstances(), eq(instances.keepAliveEnabled, true)))
        .all()
        .map(asListed),
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
        db.select().from(projectPlaces).all(),
        db
          .select()
          .from(projectAccounts)
          .orderBy(sql`rowid`)
          .all()
      ),
    project: (id) => projectOf(db, id),
    projectRepository: (projectId, machineId) =>
      db
        .select({ path: projectRepositories.path })
        .from(projectRepositories)
        .where(
          and(
            eq(projectRepositories.projectId, projectId),
            eq(projectRepositories.machineId, machineId)
          )
        )
        .get()?.path,
    recordProjectRepository: (repository) => {
      const row = { ...repository, recordedAt: new Date() };
      db.insert(projectRepositories)
        .values(row)
        .onConflictDoUpdate({
          target: [
            projectRepositories.projectId,
            projectRepositories.machineId,
          ],
          set: { path: row.path, recordedAt: row.recordedAt },
        })
        .run();
    },
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
    setProjectDetails: (id, change) => {
      db.update(projects).set(change).where(eq(projects.id, id)).run();
    },
    setProjectTemplate: (id, template) => {
      db.update(projects).set({ template }).where(eq(projects.id, id)).run();
    },
    projectOffer: (instanceId) =>
      db
        .select()
        .from(projectOffers)
        .where(eq(projectOffers.instanceId, instanceId))
        .get(),
    openProjectOffers: () =>
      db.select().from(projectOffers).where(isNull(projectOffers.answer)).all(),
    sessionPlan: (instanceId) =>
      db
        .select()
        .from(sessionPlans)
        .where(eq(sessionPlans.instanceId, instanceId))
        .get(),
    putSessionSteps: (instanceId, steps) => {
      const updatedAt = new Date();
      db.insert(sessionPlans)
        .values({ instanceId, steps, updatedAt })
        .onConflictDoUpdate({
          target: sessionPlans.instanceId,
          set: { steps, updatedAt },
        })
        .run();
    },
    putSessionSpec: (instanceId, spec) => {
      const updatedAt = new Date();
      db.insert(sessionPlans)
        .values({ instanceId, steps: [], spec, specAt: updatedAt, updatedAt })
        .onConflictDoUpdate({
          target: sessionPlans.instanceId,
          set: { spec, specAt: updatedAt, updatedAt },
        })
        .run();
    },
    offerProject: ({ instanceId, reason, line }) =>
      db
        .insert(projectOffers)
        .values({ instanceId, reason, line, offeredAt: new Date() })
        .onConflictDoNothing()
        .returning({ instanceId: projectOffers.instanceId })
        .all().length > 0,
    answerProjectOffer: (instanceId, answer, projectId) => {
      const answeredAt = new Date();
      db.insert(projectOffers)
        .values({
          instanceId,
          reason: "caw",
          line: "",
          offeredAt: answeredAt,
          answer,
          answeredAt,
          projectId: projectId ?? null,
        })
        .onConflictDoUpdate({
          target: projectOffers.instanceId,
          set: { answer, answeredAt, projectId: projectId ?? null },
        })
        .run();
    },
    setInstancesProject: (ids, projectId) => {
      if (ids.length > 0) {
        // Bookkeeping, never the sessions moving: `updatedAt` stays, as in
        // `patchInstance`, or a project made for an old folder read every
        // session in it as active now.
        db.update(instances)
          .set({ projectId })
          .where(inArray(instances.id, ids))
          .run();
      }
    },
    setProjectTracker: (id, tracker) => {
      db.update(projects).set({ tracker }).where(eq(projects.id, id)).run();
    },
    setProjectAccounts: (id, list) => {
      db.transaction((tx) => {
        tx.update(projects)
          .set({ accountsLimited: list !== null })
          .where(eq(projects.id, id))
          .run();
        tx.delete(projectAccounts)
          .where(eq(projectAccounts.projectId, id))
          .run();
        const distinct = [...new Set(list ?? [])];
        if (distinct.length > 0) {
          tx.insert(projectAccounts)
            .values(distinct.map((accountId) => ({ projectId: id, accountId })))
            .run();
        }
      });
    },
    setProjectDispatch: (id, change) => {
      if (Object.keys(change).length > 0) {
        db.update(projects).set(change).where(eq(projects.id, id)).run();
      }
    },
    setProjectCaw: (id, change) => {
      // A new lead session counts its cost from zero.
      const set =
        change.leadInstanceId === undefined
          ? change
          : { leadCostSeen: 0, ...change };
      if (Object.keys(set).length > 0) {
        db.update(projects).set(set).where(eq(projects.id, id)).run();
      }
    },
    setProjectCap: (id, change) => {
      db.update(projects).set(change).where(eq(projects.id, id)).run();
    },
    setSpendOnCap: (onCap) => {
      db.insert(spendSettings)
        .values({ id: "spend", onCap })
        .onConflictDoUpdate({ target: spendSettings.id, set: { onCap } })
        .run();
    },
    setSessionLimits: (limits) => {
      const values = {
        memoryPercent: limits.memoryPercent ?? null,
        cpuPercent: limits.cpuPercent ?? null,
      };
      db.insert(sessionLimits)
        .values({ id: "session", ...values })
        .onConflictDoUpdate({ target: sessionLimits.id, set: values })
        .run();
    },
    sessionLimits: () => {
      const row = db
        .select()
        .from(sessionLimits)
        .where(eq(sessionLimits.id, "session"))
        .get();
      const memoryPercent = row?.memoryPercent ?? undefined;
      const cpuPercent = row?.cpuPercent ?? undefined;
      return {
        ...(memoryPercent === undefined ? {} : { memoryPercent }),
        ...(cpuPercent === undefined ? {} : { cpuPercent }),
      };
    },
    spendOnCap: () =>
      db
        .select({ onCap: spendSettings.onCap })
        .from(spendSettings)
        .where(eq(spendSettings.id, "spend"))
        .get()?.onCap ?? "both",
    projectSpentSince: (projectId, since) =>
      cawSince(projectId, since) +
      (db
        .select({
          usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
        })
        .from(usageBuckets)
        .innerJoin(instances, eq(instances.sessionId, usageBuckets.sessionId))
        .where(
          and(
            eq(instances.projectId, projectId),
            sql`coalesce(${instances.role}, '') <> 'lead'`,
            sql`${usageBuckets.start} >= ${since}`
          )
        )
        .get()?.usd ?? 0),
    leadCalls: {
      add: (row) => {
        db.insert(leadCalls).values(row).onConflictDoNothing().run();
      },
      ofRequest: (requestId) =>
        db
          .select()
          .from(leadCalls)
          .where(eq(leadCalls.requestId, requestId))
          .get(),
      ofToolUse: (instanceId, toolUseId) =>
        db
          .select()
          .from(leadCalls)
          .where(
            and(
              eq(leadCalls.instanceId, instanceId),
              eq(leadCalls.toolUseId, toolUseId)
            )
          )
          .get(),
      set: (id, patch) => {
        db.update(leadCalls).set(patch).where(eq(leadCalls.id, id)).run();
      },
      since: (projectId, since) =>
        db
          .select()
          .from(leadCalls)
          .where(
            and(eq(leadCalls.projectId, projectId), gte(leadCalls.at, since))
          )
          .orderBy(leadCalls.at)
          .all(),
    },
    leadTurns: () => {
      const reading = new Map<string, string[]>();
      for (const { instanceId, threadId } of db
        .select()
        .from(leadTurnReading)
        .orderBy(sql`rowid`)
        .all()) {
        reading.set(instanceId, [...(reading.get(instanceId) ?? []), threadId]);
      }
      const waiting = new Map<string, Record<string, string>>();
      for (const { instanceId, sendUuid, threadId } of db
        .select()
        .from(leadTurnWaiting)
        .orderBy(sql`rowid`)
        .all()) {
        waiting.set(instanceId, {
          ...waiting.get(instanceId),
          [sendUuid]: threadId ?? "",
        });
      }
      return db
        .select()
        .from(leadTurns)
        .all()
        .map((row) => ({
          ...row,
          reading: reading.get(row.instanceId) ?? [],
          waiting: waiting.get(row.instanceId) ?? {},
        }));
    },
    putLeadTurn: ({ reading, waiting, ...turn }) => {
      const { instanceId, ...rest } = turn;
      db.transaction((tx) => {
        tx.insert(leadTurns)
          .values(turn)
          .onConflictDoUpdate({ target: leadTurns.instanceId, set: rest })
          .run();
        tx.delete(leadTurnReading)
          .where(eq(leadTurnReading.instanceId, instanceId))
          .run();
        tx.delete(leadTurnWaiting)
          .where(eq(leadTurnWaiting.instanceId, instanceId))
          .run();
        // The working copy may still name a thread or a send that has gone
        // since (its project, its session): a gone thread is none, a gone
        // send a wake nobody will read.
        const named = [
          ...new Set([...reading, ...Object.values(waiting)].filter(Boolean)),
        ];
        const threads = new Set(
          named.length === 0
            ? []
            : tx
                .select({ id: projectThreads.id })
                .from(projectThreads)
                .where(inArray(projectThreads.id, named))
                .all()
                .map(({ id }) => id)
        );
        const uuids = Object.keys(waiting);
        const sends = new Set(
          uuids.length === 0
            ? []
            : tx
                .select({ uuid: sentMessages.uuid })
                .from(sentMessages)
                .where(inArray(sentMessages.uuid, uuids))
                .all()
                .map(({ uuid }) => uuid)
        );
        const read = [...new Set(reading)].filter((id) => threads.has(id));
        if (read.length > 0) {
          tx.insert(leadTurnReading)
            .values(read.map((threadId) => ({ instanceId, threadId })))
            .run();
        }
        const unread = Object.entries(waiting).filter(([uuid]) =>
          sends.has(uuid)
        );
        if (unread.length > 0) {
          tx.insert(leadTurnWaiting)
            .values(
              unread.map(([sendUuid, threadId]) => ({
                instanceId,
                sendUuid,
                threadId: threads.has(threadId) ? threadId : null,
              }))
            )
            .run();
        }
      });
    },
    dropLeadTurn: (instanceId) => {
      db.delete(leadTurns).where(eq(leadTurns.instanceId, instanceId)).run();
    },
    sessionTaint: (instanceId) => {
      const row = db
        .select()
        .from(sessionTaints)
        .where(eq(sessionTaints.instanceId, instanceId))
        .get();
      return (
        row && {
          ...row,
          subagents: db
            .select({
              task: sessionSubagents.task,
              call: sessionSubagents.call,
            })
            .from(sessionSubagents)
            .where(eq(sessionSubagents.instanceId, instanceId))
            .all(),
        }
      );
    },
    putSessionTaint: ({ subagents, ...row }) => {
      const { instanceId, ...rest } = row;
      db.transaction((tx) => {
        tx.insert(sessionTaints)
          .values(row)
          .onConflictDoUpdate({ target: sessionTaints.instanceId, set: rest })
          .run();
        tx.delete(sessionSubagents)
          .where(eq(sessionSubagents.instanceId, instanceId))
          .run();
        if (subagents.length > 0) {
          tx.insert(sessionSubagents)
            .values(subagents.map((open) => ({ instanceId, ...open })))
            .run();
        }
      });
    },
    bookCawTurn: ({ harness, projectId, threadId, usd }) => {
      db.insert(cawTurns)
        .values({
          id: crypto.randomUUID(),
          projectId,
          threadId,
          harness,
          usd,
          at: new Date(),
        })
        .run();
    },
    cawSpentSince: (projectId, since) => cawSince(projectId, since),
    projectSpend: (projectId, { todayStart, monthStart }) => {
      // Caw: his booked turns.
      const caw = db
        .select({
          today: sql<number>`coalesce(sum(case when ${cawTurns.at} >= ${todayStart} then ${cawTurns.usd} else 0 end), 0)`,
          month: sql<number>`coalesce(sum(case when ${cawTurns.at} >= ${monthStart} then ${cawTurns.usd} else 0 end), 0)`,
          unthreaded: sql<number>`coalesce(sum(case when ${cawTurns.at} >= ${monthStart} and ${cawTurns.threadId} is null then ${cawTurns.usd} else 0 end), 0)`,
        })
        .from(cawTurns)
        .where(eq(cawTurns.projectId, projectId))
        .get();
      // Each attempt with what its session reported this month.
      const items = db
        .select({
          taskId: workItems.taskId,
          title: workItems.title,
          type: workItems.type,
          state: workItems.state,
          createdAt: workItems.createdAt,
          endedAt: workItems.endedAt,
          instanceId: workItems.instanceId,
          today: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${todayStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
          usd: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${monthStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
        })
        .from(workItems)
        .leftJoin(instances, eq(instances.id, workItems.instanceId))
        .leftJoin(usageBuckets, eq(usageBuckets.sessionId, instances.sessionId))
        .where(
          and(eq(workItems.projectId, projectId), isNotNull(workItems.taskId))
        )
        .groupBy(workItems.id)
        .orderBy(asc(workItems.createdAt))
        .all();
      // Every other session of the project (not a lead, not an attempt).
      const attemptSessions = items.flatMap((item) =>
        item.instanceId ? [item.instanceId] : []
      );
      const others = db
        .select({
          today: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${todayStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
          month: sql<number>`coalesce(sum(case when ${usageBuckets.start} >= ${monthStart} then ${usageBuckets.costUsd} else 0 end), 0)`,
        })
        .from(usageBuckets)
        .innerJoin(instances, eq(instances.sessionId, usageBuckets.sessionId))
        .where(
          and(
            eq(instances.projectId, projectId),
            sql`coalesce(${instances.role}, '') <> 'lead'`,
            attemptSessions.length > 0
              ? notInArray(instances.id, attemptSessions)
              : undefined
          )
        )
        .get();
      // Each thread: the turns it woke this month, and how often it woke Caw
      // (yours and events). Grouped per thread and merged here: a correlated
      // sub-select renders its columns unqualified and binds `id` to the
      // inner table's own.
      const turnsBy = new Map(
        db
          .select({
            threadId: cawTurns.threadId,
            usd: sql<number>`coalesce(sum(${cawTurns.usd}), 0)`,
          })
          .from(cawTurns)
          .where(
            and(
              eq(cawTurns.projectId, projectId),
              isNotNull(cawTurns.threadId),
              sql`${cawTurns.at} >= ${monthStart}`
            )
          )
          .groupBy(cawTurns.threadId)
          .all()
          .map((row) => [row.threadId as string, row.usd])
      );
      const wakesBy = new Map(
        db
          .select({
            threadId: threadMessages.threadId,
            wakes: sql<number>`count(*)`,
          })
          .from(threadMessages)
          .innerJoin(
            projectThreads,
            eq(projectThreads.id, threadMessages.threadId)
          )
          .where(
            and(
              eq(projectThreads.projectId, projectId),
              ne(threadMessages.author, "caw"),
              sql`${threadMessages.createdAt} >= ${monthStart}`
            )
          )
          .groupBy(threadMessages.threadId)
          .all()
          .map((row) => [row.threadId, row.wakes])
      );
      const threads = db
        .select({
          id: projectThreads.id,
          title: projectThreads.title,
          lastAt: projectThreads.updatedAt,
        })
        .from(projectThreads)
        .where(eq(projectThreads.projectId, projectId))
        .orderBy(desc(projectThreads.updatedAt))
        .all()
        .map((row) => ({
          ...row,
          usd: turnsBy.get(row.id) ?? 0,
          wakes: wakesBy.get(row.id) ?? 0,
        }));
      const attemptsToday = items.reduce((sum, item) => sum + item.today, 0);
      const attemptsMonth = items.reduce((sum, item) => sum + item.usd, 0);
      const cawToday = caw?.today ?? 0;
      const cawMonth = caw?.month ?? 0;
      return {
        todayUsd: cawToday + attemptsToday + (others?.today ?? 0),
        monthUsd: cawMonth + attemptsMonth + (others?.month ?? 0),
        caw: {
          todayUsd: cawToday,
          monthUsd: cawMonth,
          unthreadedMonthUsd: caw?.unthreaded ?? 0,
        },
        others: { todayUsd: others?.today ?? 0, monthUsd: others?.month ?? 0 },
        items: items.map((item) => ({
          taskId: item.taskId as string,
          title: item.title,
          type: item.type,
          state: item.state,
          usd: item.usd,
          at: (item.endedAt ?? item.createdAt).getTime(),
        })),
        threads: threads.map((row) => ({
          ...row,
          lastAt: row.lastAt.getTime(),
        })),
      };
    },
    projectSpendByType: (projectId, since) =>
      db
        .select({
          type: workItems.type,
          usd: sql<number>`coalesce(sum(${usageBuckets.costUsd}), 0)`,
          items: sql<number>`count(distinct ${workItems.id})`,
        })
        .from(workItems)
        .innerJoin(instances, eq(instances.id, workItems.instanceId))
        .innerJoin(
          usageBuckets,
          eq(usageBuckets.sessionId, instances.sessionId)
        )
        .where(
          and(
            eq(workItems.projectId, projectId),
            sql`${usageBuckets.start} >= ${since}`
          )
        )
        .groupBy(workItems.type)
        .orderBy(desc(sql`coalesce(sum(${usageBuckets.costUsd}), 0)`))
        .all(),
    projectThreads: (projectId) => {
      const rows = db
        .select()
        .from(projectThreads)
        .where(eq(projectThreads.projectId, projectId))
        .orderBy(desc(projectThreads.updatedAt), desc(projectThreads.id))
        .all();
      return rows.map((row) => {
        const last = db
          .select({ body: threadMessages.body })
          .from(threadMessages)
          .where(eq(threadMessages.threadId, row.id))
          .orderBy(desc(threadMessages.createdAt), desc(threadMessages.id))
          .limit(1)
          .get();
        return { ...row, last: last?.body ?? "" };
      });
    },
    newestConversation: (projectId) =>
      db
        .select(getTableColumns(projectThreads))
        .from(projectThreads)
        .innerJoin(
          threadMessages,
          eq(threadMessages.threadId, projectThreads.id)
        )
        .where(
          and(
            eq(projectThreads.projectId, projectId),
            inArray(threadMessages.author, ["you", "caw"]),
            notInArray(
              projectThreads.id,
              db
                .select({ id: routines.threadId })
                .from(routines)
                .where(isNotNull(routines.threadId))
            )
          )
        )
        .groupBy(projectThreads.id)
        .orderBy(
          desc(sql`max(${threadMessages.createdAt})`),
          desc(projectThreads.id)
        )
        .limit(1)
        .get(),
    allThreads: () =>
      db
        .select()
        .from(projectThreads)
        .orderBy(desc(projectThreads.updatedAt), desc(projectThreads.id))
        .all(),
    threadOfTask: (projectId, taskId) =>
      db
        .select({ thread: projectThreads })
        .from(threadMessageTasks)
        .innerJoin(
          threadMessages,
          eq(threadMessages.id, threadMessageTasks.messageId)
        )
        .innerJoin(
          projectThreads,
          eq(projectThreads.id, threadMessages.threadId)
        )
        .where(
          and(
            eq(threadMessageTasks.projectId, projectId),
            eq(threadMessageTasks.taskId, taskId)
          )
        )
        .orderBy(desc(threadMessages.createdAt), desc(threadMessages.id))
        .limit(1)
        .get()?.thread,
    thread: (id) =>
      db.select().from(projectThreads).where(eq(projectThreads.id, id)).get(),
    threadMessages: (threadId) =>
      withTasks(
        db
          .select()
          .from(threadMessages)
          .where(eq(threadMessages.threadId, threadId))
          .orderBy(asc(threadMessages.createdAt), asc(threadMessages.id))
          .all()
      ),
    threadMessage: (id) =>
      withTasks(
        db.select().from(threadMessages).where(eq(threadMessages.id, id)).all()
      )[0],
    createThread: ({ id, projectId, title, setup, first }) =>
      db.transaction((tx) => {
        const at = new Date();
        const thread = tx
          .insert(projectThreads)
          .values({
            id,
            projectId,
            title,
            setup: setup ?? false,
            createdAt: at,
            updatedAt: at,
          })
          .returning()
          .get();
        const message = tx
          .insert(threadMessages)
          .values({
            ...first,
            id: first.id ?? crypto.randomUUID(),
            threadId: id,
            createdAt: at,
          })
          .returning()
          .get();
        return { thread, message: { ...message, tasks: null } };
      }),
    addThreadMessage: ({ threadId, id, createdAt, tasks, ...said }) =>
      db.transaction((tx) => {
        const at = createdAt ?? new Date();
        const before = tx
          .select({
            updatedAt: projectThreads.updatedAt,
            projectId: projectThreads.projectId,
          })
          .from(projectThreads)
          .where(eq(projectThreads.id, threadId))
          .get();
        if (!before) {
          throw new Error(`thread ${threadId} is not on this hub`);
        }
        const row = tx
          .insert(threadMessages)
          .values({
            ...said,
            id: id ?? crypto.randomUUID(),
            threadId,
            createdAt: at,
          })
          .returning()
          .get();
        const named = [...new Set(tasks ?? [])];
        if (named.length > 0) {
          tx.insert(threadMessageTasks)
            .values(
              named.map((taskId) => ({
                messageId: row.id,
                projectId: before.projectId,
                taskId,
              }))
            )
            .run();
        }
        const message = { ...row, tasks: named.length > 0 ? named : null };
        const thread = tx
          .update(projectThreads)
          .set({
            updatedAt:
              at.getTime() > before.updatedAt.getTime() ? at : before.updatedAt,
          })
          .where(eq(projectThreads.id, threadId))
          .returning()
          .get();
        if (!thread) {
          throw new Error(`thread ${threadId} is not on this hub`);
        }
        return { thread, message };
      }),
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
            retry: row.retry ?? false,
            origin: row.origin,
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
    taskIndex: (projectId) => {
      const ofTask = new Map<
        string,
        Pick<TaskIndexRow, "after" | "related" | "labels" | "fields">
      >();
      const lists = (file: string) => {
        const known = ofTask.get(file);
        if (known) {
          return known;
        }
        const made: Pick<
          TaskIndexRow,
          "after" | "related" | "labels" | "fields"
        > = { after: [], related: [], labels: [], fields: {} };
        ofTask.set(file, made);
        return made;
      };
      for (const edge of db
        .select()
        .from(projectTaskEdges)
        .where(eq(projectTaskEdges.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(edge.path)[edge.kind].push(edge.otherId);
      }
      for (const labelled of db
        .select()
        .from(projectTaskLabels)
        .where(eq(projectTaskLabels.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(labelled.path).labels.push(labelled.label);
      }
      for (const field of db
        .select()
        .from(projectTaskFields)
        .where(eq(projectTaskFields.projectId, projectId))
        .orderBy(sql`rowid`)
        .all()) {
        lists(field.path).fields[field.key] = field.value;
      }
      return db
        .select()
        .from(projectTasks)
        .where(eq(projectTasks.projectId, projectId))
        .orderBy(asc(projectTasks.number), asc(projectTasks.path))
        .all()
        .map((row) => ({ ...row, ...lists(row.path) }));
    },
    taskWaiters: (projectId, taskId) =>
      db
        .select({ id: projectTasks.id, path: projectTasks.path })
        .from(projectTaskEdges)
        .innerJoin(
          projectTasks,
          and(
            eq(projectTasks.projectId, projectTaskEdges.projectId),
            eq(projectTasks.path, projectTaskEdges.path)
          )
        )
        .where(
          and(
            eq(projectTaskEdges.projectId, projectId),
            eq(projectTaskEdges.kind, "after"),
            eq(projectTaskEdges.otherId, taskId)
          )
        )
        .orderBy(asc(projectTasks.number), asc(projectTasks.path))
        .all(),
    putTaskIndex: (rows) => {
      if (rows.length === 0) {
        return;
      }
      db.transaction((tx) => {
        // An index is read from a project's folder off the write path: a
        // project deleted meanwhile has no tasks left to index.
        const live = new Set(
          tx
            .select({ id: projects.id })
            .from(projects)
            .where(
              inArray(projects.id, [...new Set(rows.map((r) => r.projectId))])
            )
            .all()
            .map((project) => project.id)
        );
        for (const { after, related, labels, fields, ...row } of rows.filter(
          (r) => live.has(r.projectId)
        )) {
          const { projectId, path: file } = row;
          tx.insert(projectTasks)
            .values(row)
            .onConflictDoUpdate({
              target: [projectTasks.projectId, projectTasks.path],
              set: row,
            })
            .run();
          // Its lists as its file has them now, in its file's order.
          const ofIt = (
            table:
              | typeof projectTaskEdges
              | typeof projectTaskLabels
              | typeof projectTaskFields
          ) => and(eq(table.projectId, projectId), eq(table.path, file));
          tx.delete(projectTaskEdges).where(ofIt(projectTaskEdges)).run();
          tx.delete(projectTaskLabels).where(ofIt(projectTaskLabels)).run();
          tx.delete(projectTaskFields).where(ofIt(projectTaskFields)).run();
          const edges = [
            ...[...new Set(after)].map((otherId) => ({
              kind: "after" as const,
              otherId,
            })),
            ...[...new Set(related)].map((otherId) => ({
              kind: "related" as const,
              otherId,
            })),
          ];
          if (edges.length > 0) {
            tx.insert(projectTaskEdges)
              .values(edges.map((edge) => ({ projectId, path: file, ...edge })))
              .run();
          }
          const named = [...new Set(labels)];
          if (named.length > 0) {
            tx.insert(projectTaskLabels)
              .values(named.map((label) => ({ projectId, path: file, label })))
              .run();
          }
          const scalars = Object.entries(fields);
          if (scalars.length > 0) {
            tx.insert(projectTaskFields)
              .values(
                scalars.map(([key, value]) => ({
                  projectId,
                  path: file,
                  key,
                  value,
                }))
              )
              .run();
          }
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
    createProject: ({ id, name, checkout, remote, caw = false, template }) =>
      db.transaction((tx) => {
        tx.insert(projects)
          .values({ id, name, remote, caw, template: template ?? null })
          .run();
        tx.insert(projectPlaces)
          .values({
            id: crypto.randomUUID(),
            projectId: id,
            machineId: HUB_PLACE_MACHINE,
            path: hubPlacePath(id),
            kind: "hub",
          })
          .run();
        if (checkout) {
          tx.insert(projectPlaces)
            .values({
              id: crypto.randomUUID(),
              projectId: id,
              machineId: checkout.machineId,
              path: checkout.path,
              kind: "checkout",
              isPrimary: true,
            })
            .run();
        }
        const created = projectOf(tx, id);
        if (!created) {
          throw new Error(`project ${id} was not filed`);
        }
        return created;
      }),
    addPlace: (place) => {
      const added = db.transaction((tx) => {
        // The first checkout a project gains is its primary.
        const primary =
          place.kind === "checkout" &&
          !tx
            .select({ id: projectPlaces.id })
            .from(projectPlaces)
            .where(
              and(
                eq(projectPlaces.projectId, place.projectId),
                eq(projectPlaces.isPrimary, true)
              )
            )
            .get();
        return tx
          .insert(projectPlaces)
          .values({ id: crypto.randomUUID(), ...place, isPrimary: primary })
          .onConflictDoNothing()
          .returning()
          .get();
      });
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
      if (!place) {
        return "missing";
      }
      if (place.isPrimary || place.kind === "hub") {
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
        // A project whose primary checkout was on the machine moves it to
        // its next checkout, the oldest; with none left it has no checkout
        // yet, and its folder on the hub stays where every project's is.
        const orphaned = tx
          .select({ projectId: projectPlaces.projectId })
          .from(projectPlaces)
          .where(
            and(
              eq(projectPlaces.machineId, machineId),
              eq(projectPlaces.isPrimary, true)
            )
          )
          .all();
        tx.delete(projectPlaces)
          .where(eq(projectPlaces.machineId, machineId))
          .run();
        tx.delete(projectRepositories)
          .where(eq(projectRepositories.machineId, machineId))
          .run();
        for (const { projectId } of orphaned) {
          const [next] = tx
            .select()
            .from(projectPlaces)
            .where(
              and(
                eq(projectPlaces.projectId, projectId),
                eq(projectPlaces.kind, "checkout")
              )
            )
            .orderBy(asc(projectPlaces.createdAt), asc(projectPlaces.id))
            .limit(1)
            .all();
          if (next) {
            tx.update(projectPlaces)
              .set({ isPrimary: true })
              .where(eq(projectPlaces.id, next.id))
              .run();
          }
        }
        tx.delete(usageLimits)
          .where(eq(usageLimits.machineId, machineId))
          .run();
        tx.delete(accountSignins)
          .where(eq(accountSignins.machineId, machineId))
          .run();
        tx.delete(agents).where(eq(agents.machineId, machineId)).run();
        return { instanceIds: ids };
      }),
    deleteProject: (id) => {
      db.transaction((tx) => {
        // Its places, tasks, threads, Caw turns and the rules scoped to it go
        // with it (cascade); the sessions started from it outlive it and stop
        // being its (set null).
        tx.delete(queuedTaskStarts)
          .where(eq(queuedTaskStarts.projectId, id))
          .run();
        // Where those rules stood with each session, which no key ties to them.
        tx.delete(ruleState)
          .where(
            inArray(
              ruleState.ruleId,
              tx
                .select({ id: rules.id })
                .from(rules)
                .where(eq(rules.scopeProjectId, id))
            )
          )
          .run();
        // A memory document scoped to it alone goes with it: losing its last
        // project must not widen it to every session.
        const links = tx.select().from(fleetMemoryDocProjects).all();
        for (const link of links) {
          if (
            link.projectId === id &&
            !links.some(
              (other) => other.path === link.path && other.projectId !== id
            )
          ) {
            tx.delete(fleetMemoryDocs)
              .where(eq(fleetMemoryDocs.path, link.path))
              .run();
          }
        }
        tx.delete(projects).where(eq(projects.id, id)).run();
      });
    },
    foldProject: (dupId, keepId, taskIds) =>
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one transaction moves every project-scoped table, so a fold is all or nothing
      db.transaction((tx) => {
        const renamed = (taskId: string | null): string | null =>
          taskId ? (taskIds.get(taskId) ?? taskId) : null;
        // Places: the duplicate's checkouts and workspaces join, each folder
        // once; its hub folder is its own, and goes with it.
        const kept = tx
          .select()
          .from(projectPlaces)
          .where(eq(projectPlaces.projectId, keepId))
          .all();
        const where = new Set(kept.map((p) => `${p.machineId}\0${p.path}`));
        let primary = kept.some((p) => p.isPrimary);
        let places = 0;
        for (const place of tx
          .select()
          .from(projectPlaces)
          .where(eq(projectPlaces.projectId, dupId))
          .orderBy(asc(projectPlaces.createdAt))
          .all()) {
          const key = `${place.machineId}\0${place.path}`;
          if (place.kind === "hub" || where.has(key)) {
            continue;
          }
          const first = !primary && place.kind === "checkout";
          primary ||= first;
          where.add(key);
          tx.insert(projectPlaces)
            .values({
              ...place,
              id: crypto.randomUUID(),
              projectId: keepId,
              isPrimary: first,
            })
            .run();
          places += 1;
        }
        // Its repository on a machine where the kept project records none.
        const machines = new Set(
          tx
            .select({ machineId: projectRepositories.machineId })
            .from(projectRepositories)
            .where(eq(projectRepositories.projectId, keepId))
            .all()
            .map((row) => row.machineId)
        );
        for (const repository of tx
          .select()
          .from(projectRepositories)
          .where(eq(projectRepositories.projectId, dupId))
          .all()) {
          if (!machines.has(repository.machineId)) {
            tx.insert(projectRepositories)
              .values({ ...repository, projectId: keepId })
              .run();
          }
        }
        const sessions = tx
          .select({ id: instances.id })
          .from(instances)
          .where(eq(instances.projectId, dupId))
          .all().length;
        tx.update(instances)
          .set({ projectId: keepId })
          .where(eq(instances.projectId, dupId))
          .run();
        const items = tx
          .select({ id: workItems.id, taskId: workItems.taskId })
          .from(workItems)
          .where(eq(workItems.projectId, dupId))
          .all();
        for (const item of items) {
          tx.update(workItems)
            .set({ projectId: keepId, taskId: renamed(item.taskId) })
            .where(eq(workItems.id, item.id))
            .run();
        }
        const threads = tx
          .select({ id: projectThreads.id })
          .from(projectThreads)
          .where(eq(projectThreads.projectId, dupId))
          .all().length;
        tx.update(projectThreads)
          .set({ projectId: keepId })
          .where(eq(projectThreads.projectId, dupId))
          .run();
        // Its messages' tasks, by the numbers they have in the kept project.
        const named = tx
          .select()
          .from(threadMessageTasks)
          .where(eq(threadMessageTasks.projectId, dupId))
          .orderBy(sql`rowid`)
          .all();
        tx.delete(threadMessageTasks)
          .where(eq(threadMessageTasks.projectId, dupId))
          .run();
        for (const link of named) {
          tx.insert(threadMessageTasks)
            .values({
              ...link,
              projectId: keepId,
              taskId: renamed(link.taskId) ?? link.taskId,
            })
            .onConflictDoNothing()
            .run();
        }
        tx.update(cawTurns)
          .set({ projectId: keepId })
          .where(eq(cawTurns.projectId, dupId))
          .run();
        // A rule scoped to it fires in the kept project from now on.
        tx.update(rules)
          .set({ scopeProjectId: keepId })
          .where(eq(rules.scopeProjectId, dupId))
          .run();
        // An action names its task by the duplicate's number.
        for (const action of tx
          .select({ id: actions.id, taskId: actions.taskId })
          .from(actions)
          .where(and(eq(actions.projectId, dupId), isNotNull(actions.taskId)))
          .all()) {
          tx.update(actions)
            .set({ taskId: renamed(action.taskId) })
            .where(eq(actions.id, action.id))
            .run();
        }
        // Its routines with their routes and polls, the events it took in,
        // its actions, relays and moves, Caw's turns and calls, its
        // artifacts and notices: the kept project's from now on, where the
        // duplicate's row going would have taken them or left them naming it.
        for (const table of [
          routines,
          eventRoutes,
          connectorPolls,
          inboundEvents,
          actions,
          relays,
          moves,
          leadTurns,
          leadCalls,
          artifacts,
          fleetWatchNotices,
        ]) {
          tx.update(table)
            .set({ projectId: keepId })
            .where(eq(table.projectId, dupId))
            .run();
        }
        tx.update(instances)
          .set({ delegateTypeProject: keepId })
          .where(eq(instances.delegateTypeProject, dupId))
          .run();
        // The connections it was granted, each once.
        for (const grant of tx
          .select()
          .from(connectionProjects)
          .where(eq(connectionProjects.projectId, dupId))
          .all()) {
          tx.insert(connectionProjects)
            .values({ ...grant, projectId: keepId })
            .onConflictDoNothing()
            .run();
        }
        tx.delete(connectionProjects)
          .where(eq(connectionProjects.projectId, dupId))
          .run();
        // Its GitHub poller, with its cursors, where the kept project polls
        // none: both poll the one repository they share.
        const poller = tx
          .select()
          .from(githubPollers)
          .where(eq(githubPollers.projectId, dupId))
          .get();
        if (
          poller &&
          !tx
            .select({ projectId: githubPollers.projectId })
            .from(githubPollers)
            .where(eq(githubPollers.projectId, keepId))
            .get()
        ) {
          tx.insert(githubPollers)
            .values({ ...poller, projectId: keepId })
            .run();
          tx.update(githubPollCursors)
            .set({ projectId: keepId })
            .where(eq(githubPollCursors.projectId, dupId))
            .run();
        }
        for (const table of [
          fleetHooks,
          fleetHookHistory,
          mcpServers,
          skills,
        ]) {
          tx.update(table)
            .set({ projectId: keepId })
            .where(eq(table.projectId, dupId))
            .run();
        }
        // A memory document of both stays one link to the kept project.
        for (const link of tx
          .select()
          .from(fleetMemoryDocProjects)
          .where(eq(fleetMemoryDocProjects.projectId, dupId))
          .all()) {
          tx.insert(fleetMemoryDocProjects)
            .values({ path: link.path, projectId: keepId })
            .onConflictDoNothing()
            .run();
        }
        tx.delete(fleetMemoryDocProjects)
          .where(eq(fleetMemoryDocProjects.projectId, dupId))
          .run();
        tx.update(projectOffers)
          .set({ projectId: keepId })
          .where(eq(projectOffers.projectId, dupId))
          .run();
        for (const queued of tx
          .select()
          .from(queuedTaskStarts)
          .where(eq(queuedTaskStarts.projectId, dupId))
          .all()) {
          tx.insert(queuedTaskStarts)
            .values({
              ...queued,
              projectId: keepId,
              taskId: renamed(queued.taskId) ?? queued.taskId,
            })
            .onConflictDoNothing()
            .run();
        }
        tx.delete(queuedTaskStarts)
          .where(eq(queuedTaskStarts.projectId, dupId))
          .run();
        // A queued delegate for one of its tasks starts the task it is now.
        for (const queued of tx
          .select({ id: queuedWorkItems.id, taskId: queuedWorkItems.taskId })
          .from(queuedWorkItems)
          .where(eq(queuedWorkItems.projectId, dupId))
          .all()) {
          tx.update(queuedWorkItems)
            .set({ projectId: keepId, taskId: renamed(queued.taskId) })
            .where(eq(queuedWorkItems.id, queued.id))
            .run();
        }
        // Its index rows and the rest of its own rows go with it (cascade).
        tx.delete(projects).where(eq(projects.id, dupId)).run();
        return { places, sessions, threads, workItems: items.length };
      }),
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
    leadSends: (projectId, after) =>
      db
        .select({ send: sentMessages })
        .from(sentMessages)
        .innerJoin(instances, eq(instances.id, sentMessages.instanceId))
        .where(
          and(
            eq(instances.projectId, projectId),
            eq(instances.role, "lead"),
            gt(sentMessages.acceptedAt, after)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all()
        .map((row) => row.send),
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
    owedSends: (of) =>
      db
        .select({ send: sentMessages })
        .from(sentMessages)
        .innerJoin(instances, eq(instances.id, sentMessages.instanceId))
        .where(
          and(
            isNotNull(sentMessages.owed),
            eq(sentMessages.state, "pending"),
            "instanceId" in of
              ? eq(sentMessages.instanceId, of.instanceId)
              : eq(instances.machineId, of.machineId)
          )
        )
        .orderBy(asc(sentMessages.acceptedAt))
        .all()
        .map((row) => row.send),
    holdSend: (uuid, envelope) =>
      db
        .update(sentMessages)
        .set({ owed: envelope })
        .where(
          and(eq(sentMessages.uuid, uuid), eq(sentMessages.state, "pending"))
        )
        .returning({ uuid: sentMessages.uuid })
        .all().length === 1,
    oweAgain: (uuid) =>
      db
        .update(sentMessages)
        .set({ owed: sql`${sentMessages.envelope}` })
        .where(
          and(
            eq(sentMessages.uuid, uuid),
            eq(sentMessages.state, "pending"),
            isNotNull(sentMessages.envelope)
          )
        )
        .returning({ uuid: sentMessages.uuid })
        .all().length === 1,
    unkeptSends: () =>
      db
        .select()
        .from(sentMessages)
        .where(
          and(
            eq(sentMessages.state, "pending"),
            isNull(sentMessages.envelope),
            isNull(sentMessages.owed),
            isNotNull(sentMessages.body)
          )
        )
        .all(),
    keepEnvelope: (uuid, envelope) => {
      db.update(sentMessages)
        .set({ envelope })
        .where(
          and(eq(sentMessages.uuid, uuid), eq(sentMessages.state, "pending"))
        )
        .run();
    },
    noteFreshStart: (id, at) => {
      db.update(instances)
        .set({ freshStartAt: at })
        .where(eq(instances.id, id))
        .run();
    },
    openTurn: (id, at) =>
      db
        .update(instances)
        .set({ turnOpenAt: at })
        .where(
          and(
            eq(instances.id, id),
            or(
              isNull(instances.turnOpenAt),
              sql`${instances.turnOpenAt} < coalesce(${instances.spawnedAt}, 0)`
            )
          )
        )
        .returning({ id: instances.id })
        .all().length === 1,
    closeTurn: (id) => {
      db.update(instances)
        .set({ turnOpenAt: null })
        .where(and(eq(instances.id, id), isNotNull(instances.turnOpenAt)))
        .run();
    },
    // `updatedAt` deliberately untouched: a turn's end is not the session moving.
    noteTurnEnded: (id, at) => {
      db.update(instances)
        .set({ turnEndedAt: at })
        .where(eq(instances.id, id))
        .run();
    },
    handBackTurn: (id, from, at) =>
      db
        .update(instances)
        .set({ turnOpenAt: at })
        .where(and(eq(instances.id, id), eq(instances.turnOpenAt, from)))
        .returning({ id: instances.id })
        .all().length === 1,
    freshStartOf: (id) =>
      db
        .select({ at: instances.freshStartAt })
        .from(instances)
        .where(eq(instances.id, id))
        .get()?.at ?? null,
    noteMovedHere: (id, line) => {
      const values = {
        at: new Date(line.at),
        content: line.moved,
        stayed: line.stayed ?? null,
      };
      db.insert(sessionLines)
        .values({ instanceId: id, kind: "moved", id: "moved", ...values })
        .onConflictDoUpdate({
          target: [sessionLines.instanceId, sessionLines.kind, sessionLines.id],
          set: values,
        })
        .run();
    },
    movedHereOf: (id) => {
      const [row] = linesOf(id, "moved");
      return row
        ? {
            at: row.at,
            moved: row.content,
            ...(row.stayed === null ? {} : { stayed: row.stayed }),
          }
        : null;
    },
    noteWatchLine: (id, line) => {
      keepLine(id, "watch", line, WATCH_LINES_KEPT);
    },
    watchLinesOf: (id) =>
      linesOf(id, "watch").map(({ id: lineId, at, content }) => ({
        id: lineId,
        at,
        content,
      })),
    noteLimit: (id, note) => keepLine(id, "limit", note, LIMIT_NOTES_KEPT),
    limitNotesOf: (id) =>
      linesOf(id, "limit").map(({ id: lineId, at, content }) => ({
        id: lineId,
        at,
        content,
      })),
    takeOwedSend: (uuid) => {
      const owed = db
        .select({ owed: sentMessages.owed })
        .from(sentMessages)
        .where(eq(sentMessages.uuid, uuid))
        .get()?.owed;
      if (!owed) {
        return;
      }
      const taken = db
        .update(sentMessages)
        .set({ owed: null })
        .where(and(eq(sentMessages.uuid, uuid), isNotNull(sentMessages.owed)))
        .returning({ uuid: sentMessages.uuid })
        .all();
      return taken.length > 0 ? owed : undefined;
    },
    updateSend: (uuid, change) =>
      db
        .update(sentMessages)
        // A send no longer pending is handed on no more: what it was is its body.
        .set(
          change.state && change.state !== "pending"
            ? { ...change, envelope: null, owed: null }
            : change
        )
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
    createWorkItem: ({ owns, ...item }) =>
      db.transaction((tx) => {
        const row = tx.insert(workItems).values(item).returning().get();
        const owned = [...new Set(owns ?? [])];
        if (owned.length > 0) {
          tx.insert(workItemGlobs)
            .values(owned.map((glob) => ({ itemId: row.id, glob })))
            .run();
        }
        return row;
      }),
    workItem: (id) =>
      db.select().from(workItems).where(eq(workItems.id, id)).get(),
    workItemGlobs: (itemId) =>
      db
        .select({ glob: workItemGlobs.glob })
        .from(workItemGlobs)
        .where(eq(workItemGlobs.itemId, itemId))
        .orderBy(sql`rowid`)
        .all()
        .map(({ glob }) => glob),
    liveOwningWorkItems: () => {
      const owning = new Map<string, { globs: string[]; item: WorkItemRow }>();
      for (const { item, glob } of db
        .select({ item: workItems, glob: workItemGlobs.glob })
        .from(workItemGlobs)
        .innerJoin(workItems, eq(workItems.id, workItemGlobs.itemId))
        .where(inArray(workItems.state, ["starting", "running"]))
        .orderBy(asc(workItems.createdAt), sql`${workItemGlobs}.rowid`)
        .all()) {
        const known = owning.get(item.id);
        if (known) {
          known.globs.push(glob);
        } else {
          owning.set(item.id, { item, globs: [glob] });
        }
      }
      return [...owning.values()];
    },
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
    runningClaudeSessions: () =>
      db
        .select({
          accountId: instances.accountId,
          machineId: instances.machineId,
        })
        .from(instances)
        .where(
          and(
            listedInstances(),
            eq(instances.status, "running"),
            eq(instances.harness, "claude")
          )
        )
        .all(),
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
    // A queued request's `owns` is its globs' rows, put back as it reads.
    queuedWorkItems: () => {
      const globs = new Map<string, string[]>();
      for (const { queuedId, glob } of db
        .select()
        .from(queuedWorkItemGlobs)
        .orderBy(sql`rowid`)
        .all()) {
        globs.set(queuedId, [...(globs.get(queuedId) ?? []), glob]);
      }
      return db
        .select()
        .from(queuedWorkItems)
        .orderBy(asc(queuedWorkItems.queuedAt), asc(queuedWorkItems.id))
        .all()
        .map(({ projectId, taskId, queuedInstanceId, ...row }) => {
          const owned = globs.get(row.id);
          return {
            ...row,
            request: {
              ...(row.request as object),
              ...(owned ? { owns: owned } : {}),
              ...(projectId && taskId
                ? { task: { id: taskId, projectId } }
                : {}),
              queuedAs: { id: row.id, instanceId: queuedInstanceId },
            },
          };
        });
    },
    // What the queue reads of a request is columns and rows; the rest of it
    // is kept as `delegate` made it.
    queueWorkItem: ({ request, ...row }) =>
      db.transaction((tx) => {
        const { owns, task, queuedAs, ...rest } = request as {
          owns?: string[];
          queuedAs: { id: string; instanceId: string };
          task?: { id: string; projectId: string };
        };
        const queued = tx
          .insert(queuedWorkItems)
          .values({
            ...row,
            request: rest,
            projectId: task?.projectId ?? null,
            taskId: task?.id ?? null,
            queuedInstanceId: queuedAs.instanceId,
          })
          .returning()
          .get();
        const owned = [...new Set(owns ?? [])];
        if (owned.length > 0) {
          tx.insert(queuedWorkItemGlobs)
            .values(owned.map((glob) => ({ queuedId: queued.id, glob })))
            .run();
        }
        return {
          id: queued.id,
          parentInstanceId: queued.parentInstanceId,
          title: queued.title,
          queuedAt: queued.queuedAt,
          request,
        };
      }),
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
    workItemsOfParents: (parentInstanceIds) =>
      parentInstanceIds.length === 0
        ? []
        : db
            .select()
            .from(workItems)
            .where(inArray(workItems.parentInstanceId, parentInstanceIds))
            .orderBy(desc(workItems.createdAt))
            .all(),
    trayItemsOf: (sessionId, ledProjectIds, endedSince) =>
      db
        .select()
        .from(workItems)
        .where(
          and(
            ledProjectIds.length > 0
              ? or(
                  eq(workItems.parentInstanceId, sessionId),
                  inArray(workItems.projectId, ledProjectIds)
                )
              : eq(workItems.parentInstanceId, sessionId),
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
    heldWorkspaces: () =>
      db
        .select()
        .from(workspaces)
        .where(eq(workspaces.state, "held"))
        .orderBy(desc(workspaces.createdAt))
        .all(),
    liveWorkspacesOn: (machineId) =>
      db
        .selectDistinct({ id: workspaces.id })
        .from(workItems)
        .innerJoin(workspaces, eq(workspaces.id, workItems.workspaceId))
        .where(
          and(
            eq(workspaces.machineId, machineId),
            inArray(workItems.state, ["starting", "running"])
          )
        )
        .all()
        .map((row) => row.id),
    checkWorkspacesOf: (workspaceId) =>
      db
        .select()
        .from(workspaces)
        .where(
          and(
            eq(workspaces.checksFor, workspaceId),
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
    // A report's turn identity is its columns, which the turn queries join on.
    recordDelegateEvent: ({ payload, ...event }) => {
      const { resultId, completedAt, ...rest } = payload as {
        completedAt?: string;
        resultId?: string;
      };
      return delegateEventOf(
        db
          .insert(delegateEvents)
          .values({
            ...event,
            payload: rest as DelegateEventPayload,
            resultId: resultId ?? null,
            completedAt: completedAt ?? null,
          })
          .returning()
          .get()
      );
    },
    claimCompletedTurn: (instanceId, resultId, completedAt, recovered) => {
      const receivedAt = recovered ? undefined : new Date().toISOString();
      // Each report's identity, its body left unread.
      const reports = db
        .select({
          requestId: delegateEvents.requestId,
          resultId: delegateEvents.resultId,
          completedAt: delegateEvents.completedAt,
          createdAt: delegateEvents.createdAt,
        })
        .from(delegateEvents)
        .where(
          and(
            eq(delegateEvents.instanceId, instanceId),
            eq(delegateEvents.kind, "report")
          )
        )
        .all();
      const exact = reports.some(
        (report) =>
          report.requestId === resultId ||
          report.resultId === resultId ||
          (completedAt !== undefined &&
            (report.completedAt === completedAt ||
              report.createdAt.toISOString() === completedAt))
      );
      // An old report without a harness identity cannot prove a fresh completion.
      // Adopt that recovered identity silently, as directed; never guess by time proximity.
      const unkeyed =
        recovered &&
        reports.length > 0 &&
        reports.every(
          (report) => report.resultId === null && report.completedAt === null
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
            eq(delegateEvents.resultId, completedTurns.resultId)
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
    putOpenCodeGoLimits: (machineId, openCodeGo) => {
      const at = new Date();
      db.insert(usageLimits)
        .values({ machineId, openCodeGo, fetchedAt: at })
        .onConflictDoUpdate({
          target: usageLimits.machineId,
          set: { openCodeGo, fetchedAt: at },
        })
        .run();
    },
    listUsageLimits: () => db.select().from(usageLimits).all(),
    accounts: accountsDb(db),
    turnUsage: turnUsageDb(db),
    atLimit: atLimitDb(db),
    designOffers: designOffersDb(db),
    blocks: blocksDb(db),
    starters: startersDb(db),
    routines: routinesDb(db),
    connections: connectionsDb(db),
    ingress: ingressDb(db),
    relays: relaysDb(db),
    hubAuth: hubAuthDb(db),
    artifacts: artifactsDb(db),
    find: findDb(db),
    previews: previewsDb(db),
    actions: actionsDb(db),
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
            instance?.name ?? folderOf(group.projectPath) ?? group.project;
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
      // only on a real miss, for the model on its provider. One its harness
      // priced itself (OpenCode's own cost) has a price. Scoped by
      // harness/machine but not by time — a model's missing price does not
      // come and go.
      const now = Date.now();
      const missingPricing = db
        .select({
          model: usageBuckets.model,
          provider: usageBuckets.provider,
          costUsd: sql<number>`sum(${usageBuckets.costUsd})`,
        })
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
        .groupBy(usageBuckets.model, usageBuckets.provider)
        .all()
        .filter((row) => row.costUsd === 0)
        .map((row) =>
          row.provider ? `${row.provider}/${row.model}` : row.model
        )
        .filter((model) => resolveRates(model, now) === null);

      return { rows, totals, missingPricing };
    },

    getSupervisorConfig: () => {
      const row = db
        .select()
        .from(supervisorConfig)
        .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
        .get();
      return row
        ? {
            deniedTools: row.deniedSeeded ? deniedToolNames() : null,
            cawcoTodos: row.cawcoTodos,
            choicesSetAt: row.choicesSetAt,
            updatedAt: row.updatedAt,
          }
        : undefined;
    },
    putSupervisorConfig: ({ denied, ...config }) => {
      db.transaction((tx) => {
        const stored = tx
          .select()
          .from(supervisorConfig)
          .where(eq(supervisorConfig.id, SUPERVISOR_CONFIG_ID))
          .get();
        const values = {
          id: SUPERVISOR_CONFIG_ID,
          deniedSeeded: Boolean(denied) || (stored?.deniedSeeded ?? false),
          cawcoTodos: config.cawcoTodos ?? stored?.cawcoTodos ?? false,
          choicesSetAt:
            config.choicesSetAt === undefined
              ? (stored?.choicesSetAt ?? null)
              : config.choicesSetAt,
          updatedAt: new Date(),
        };
        tx.insert(supervisorConfig)
          .values(values)
          .onConflictDoUpdate({
            target: supervisorConfig.id,
            set: {
              deniedSeeded: values.deniedSeeded,
              cawcoTodos: values.cawcoTodos,
              choicesSetAt: values.choicesSetAt,
              updatedAt: values.updatedAt,
            },
          })
          .run();
        if (!denied) {
          return;
        }
        const add = (names: readonly string[]) => {
          if (names.length > 0) {
            tx.insert(fleetDeniedTools)
              .values(names.map((tool) => ({ tool })))
              .onConflictDoNothing()
              .run();
          }
        };
        if (!stored?.deniedSeeded) {
          add(denied.seed);
        }
        if (denied.remove.length > 0) {
          tx.delete(fleetDeniedTools)
            .where(inArray(fleetDeniedTools.tool, [...denied.remove]))
            .run();
        }
        add(denied.add);
      });
    },
    fleetWatchOn: () =>
      db
        .select({ on: fleetWatchSettings.on })
        .from(fleetWatchSettings)
        .where(eq(fleetWatchSettings.id, FLEET_WATCH_ID))
        .get()?.on ?? true,
    upstreamPosts: () =>
      db
        .select({ posts: upstreamSettings.posts })
        .from(upstreamSettings)
        .where(eq(upstreamSettings.id, UPSTREAM_ID))
        .get()?.posts ?? null,
    setUpstreamPosts: (posts) => {
      const answeredAt = new Date();
      db.insert(upstreamSettings)
        .values({ id: UPSTREAM_ID, posts, answeredAt })
        .onConflictDoUpdate({
          target: upstreamSettings.id,
          set: { posts, answeredAt },
        })
        .run();
    },
    setFleetWatchOn: (on) => {
      db.insert(fleetWatchSettings)
        .values({ id: FLEET_WATCH_ID, on })
        .onConflictDoUpdate({ target: fleetWatchSettings.id, set: { on } })
        .run();
    },
    watchNotices: () =>
      db
        .select()
        .from(fleetWatchNotices)
        .orderBy(fleetWatchNotices.at)
        .all()
        .map((row) => ({ ...row, at: row.at.getTime() })),
    putWatchNotice: (notice) => {
      const row = { ...notice, at: new Date(notice.at) };
      db.insert(fleetWatchNotices)
        .values(row)
        .onConflictDoUpdate({ target: fleetWatchNotices.instanceId, set: row })
        .run();
    },
    dropWatchNotice: (instanceId) =>
      db
        .delete(fleetWatchNotices)
        .where(eq(fleetWatchNotices.instanceId, instanceId))
        .returning({ id: fleetWatchNotices.id })
        .all().length > 0,
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
    moveRows: () =>
      db.select().from(moves).orderBy(moves.createdAt).all().map(moveOf),
    moveRowsOn: (machineId) =>
      db
        .select()
        .from(moves)
        .where(
          or(
            eq(moves.stopOn, machineId),
            eq(moves.targetMachineId, machineId),
            eq(moves.sourceMachineId, machineId)
          )
        )
        .orderBy(moves.createdAt)
        .all()
        .map(moveOf),
    moveRow: (id) => {
      const row = db.select().from(moves).where(eq(moves.id, id)).get();
      return row && moveOf(row);
    },
    insertMove: ({ state, ...row }) => {
      const now = new Date();
      return moveOf(
        db
          .insert(moves)
          .values({
            ...row,
            ...moveColumnsOf(state),
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
      );
    },
    updateMove: (id, { state, ...patch }) => {
      const row = db
        .update(moves)
        .set({
          ...patch,
          ...(state ? moveColumnsOf(state) : {}),
          updatedAt: new Date(),
        })
        .where(eq(moves.id, id))
        .returning()
        .get();
      return row && moveOf(row);
    },
    deleteMove: (id) => {
      db.delete(moves).where(eq(moves.id, id)).run();
    },
    setProjectMoveDeclined: (id, at) => {
      db.update(projects)
        .set({ moveDeclinedAt: at })
        .where(eq(projects.id, id))
        .run();
    },
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
      // A key the hub's key does not open reads as not connected: connect again.
      return row?.apiKey
        ? { apiKey: row.apiKey, connectedAt: row.connectedAt }
        : undefined;
    },
    getJevSettings: () => {
      const row = db
        .select()
        .from(jevSettings)
        .where(eq(jevSettings.id, JEV_SETTINGS_ID))
        .get();
      return {
        typesafeKey: row?.typesafeKey || null,
        typesafeKeySetAt: row?.typesafeKey ? row.typesafeKeySetAt : null,
        suggestWhileTyping: row?.suggestWhileTyping ?? false,
      };
    },
    setTypesafeKey: (key) => {
      const typesafeKeySetAt = key === null ? null : new Date();
      db.insert(jevSettings)
        .values({ id: JEV_SETTINGS_ID, typesafeKey: key, typesafeKeySetAt })
        .onConflictDoUpdate({
          target: jevSettings.id,
          set: { typesafeKey: key, typesafeKeySetAt },
        })
        .run();
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
      db.insert(jevSettings)
        .values({ id: JEV_SETTINGS_ID, suggestWhileTyping: enabled })
        .onConflictDoUpdate({
          target: jevSettings.id,
          set: { suggestWhileTyping: enabled },
        })
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
      // A device whose pairing secret or key does not open is none until the
      // app registers again, which it does on every launch.
      devices: () =>
        db
          .select()
          .from(pushDevices)
          .orderBy(pushDevices.createdAt)
          .all()
          .flatMap(({ secret, key, ...device }) =>
            secret && key ? [{ ...device, secret, key }] : []
          ),
      putDevice: ({ quiet, ...device }) => {
        const now = new Date();
        const row = db
          .insert(pushDevices)
          .values({
            ...device,
            quiet: quiet ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: pushDevices.pairingId,
            set: {
              ...device,
              ...(quiet === undefined ? {} : { quiet }),
              updatedAt: now,
            },
          })
          .returning()
          .get();
        // The secret and key just written, as given: what the row seals.
        return { ...row, secret: device.secret, key: device.key };
      },
      dropDevice: (pairingId) =>
        db
          .delete(pushDevices)
          .where(eq(pushDevices.pairingId, pairingId))
          .returning({ pairingId: pushDevices.pairingId })
          .all().length > 0,
      setQuiet: (pairingId, quiet) =>
        db
          .update(pushDevices)
          .set({ quiet, updatedAt: new Date() })
          .where(eq(pushDevices.pairingId, pairingId))
          .returning({ pairingId: pushDevices.pairingId })
          .all().length > 0,
      noteResult: (pairingId, error) => {
        db.update(pushDevices)
          .set(
            error === null
              ? { lastSentAt: new Date(), lastError: null }
              : { lastError: error }
          )
          .where(eq(pushDevices.pairingId, pairingId))
          .run();
      },
    },
    notifications: {
      sent: (collapseId, at) => {
        db.transaction((tx) => {
          tx.delete(notificationCleared)
            .where(eq(notificationCleared.collapseId, collapseId))
            .run();
          tx.insert(notificationSent)
            .values({ collapseId, sentAt: at })
            .onConflictDoUpdate({
              target: notificationSent.collapseId,
              set: { sentAt: at },
            })
            .run();
        });
      },
      sentAt: (collapseIds) =>
        new Map(
          collapseIds.length === 0
            ? []
            : db
                .select()
                .from(notificationSent)
                .where(inArray(notificationSent.collapseId, collapseIds))
                .all()
                .map((row) => [row.collapseId, row.sentAt])
        ),
      clear: (collapseIds, at, any) =>
        db.transaction((tx) => {
          const ids = [...new Set(collapseIds)];
          if (ids.length === 0) {
            return [];
          }
          const outstanding = new Set(
            tx
              .delete(notificationSent)
              .where(inArray(notificationSent.collapseId, ids))
              .returning({ collapseId: notificationSent.collapseId })
              .all()
              .map((row) => row.collapseId)
          );
          const already = new Set(
            tx
              .select({ collapseId: notificationCleared.collapseId })
              .from(notificationCleared)
              .where(inArray(notificationCleared.collapseId, ids))
              .all()
              .map((row) => row.collapseId)
          );
          const newly = ids.filter(
            (id) => outstanding.has(id) || (any && !already.has(id))
          );
          for (const collapseId of newly) {
            tx.insert(notificationCleared)
              .values({ collapseId, clearedAt: at })
              .onConflictDoUpdate({
                target: notificationCleared.collapseId,
                set: { clearedAt: at },
              })
              .run();
          }
          return newly;
        }),
      clearedSince: (since) =>
        db
          .select()
          .from(notificationCleared)
          .where(gte(notificationCleared.clearedAt, since))
          .orderBy(desc(notificationCleared.clearedAt))
          .all(),
      prune: (before) => {
        db.delete(notificationSent)
          .where(lt(notificationSent.sentAt, before))
          .run();
        db.delete(notificationCleared)
          .where(lt(notificationCleared.clearedAt, before))
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
        pattern: rule.pattern,
        matchKind: rule.matchKind,
        caseSensitive: rule.caseSensitive,
        wholeWord: rule.wholeWord,
        watch: rule.watch,
        reply: rule.reply,
        timing: rule.timing,
        repeat: rule.repeat,
        scopeMachineId: rule.scope.machineId || null,
        scopeProjectId: rule.scope.projectId || null,
        scopeHarness: rule.scope.harness || null,
        scopeModel: rule.scope.model || null,
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
            pattern: values.pattern,
            matchKind: values.matchKind,
            caseSensitive: values.caseSensitive,
            wholeWord: values.wholeWord,
            watch: values.watch,
            reply: values.reply,
            timing: values.timing,
            repeat: values.repeat,
            scopeMachineId: values.scopeMachineId,
            scopeProjectId: values.scopeProjectId,
            scopeHarness: values.scopeHarness,
            scopeModel: values.scopeModel,
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
  // A database from before every path on a machine was a MachinePath (an
  // older hub's, a restored backup): its `~` rows take each machine's stored
  // home now; a machine with none yet has them resolved at its register.
  for (const { machineId } of store.listAgents()) {
    store.resolveHomePaths(machineId);
  }
  return store;
};

/**
 * The hub's database, opened before anything that reads it: its close is the
 * first release its lifetime holds, so it runs last, after every timer and
 * every other release.
 */
export const DbLayer = Layer.effect(Db)(
  Effect.gen(function* () {
    const lifetime = yield* HubLifetime;
    const db = yield* Effect.promise(() => make(DB_PATH));
    lifetime.onClose(db.close);
    return db;
  })
);
