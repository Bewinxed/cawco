import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import type { MayStart, StartingSet } from "@cawco/core/delegate-types";
import { FILE_HASH_SCHEME } from "@cawco/core/file-hash";
import type {
  FleetItemStatus,
  FleetSyncOutcome,
  FleetSyncReport,
  SkillFile,
} from "@cawco/core/fleet";
import type { HarnessReport } from "@cawco/core/harness";
import type {
  EffortLevel,
  HarnessKind,
  PermissionMode,
  SessionEffort,
} from "@cawco/core/harness/kinds";
import { CONTINUATION_ORIGIN } from "@cawco/core/harness/kinds";
import { harnessesWith, traitsOf } from "@cawco/core/harness/traits";
import {
  type MachinePath,
  MachinePathRefused,
  machinePath,
} from "@cawco/core/machine-path";
import { ownIdentity } from "@cawco/core/process-identity";
import type {
  AgentRow,
  BuildInfo,
  Envelope,
  InstanceStatus,
  RunKind,
  SessionCommands,
  SessionEndIntent,
  SessionOrigin,
  SessionTooling,
  SpawnPayload,
  StoppedCommands,
} from "@cawco/core/protocol";
import {
  CLAUDE_CONVERSATION_GONE,
  type LastErrorKind,
} from "@cawco/core/relaunch";
import { runtimeTree, standalone } from "@cawco/core/runtime";
import { writeStateFileSync } from "@cawco/core/state-file";
import { DAY_MS } from "@cawco/core/time";
import type { ToolStatus } from "@cawco/core/tools";
import { stoppedWords } from "@cawco/core/words/machine-pause";
import { RESTART_LOST } from "@cawco/core/words/session-ends";
import {
  and,
  asc,
  eq,
  getTableColumns,
  getTableName,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { type MigrationMeta, readMigrationFiles } from "drizzle-orm/migrator";
import { Context, Effect, Layer } from "effect";
import { DB_PATH } from "../config";
import { type DelegateTypesShape, makeDelegateTypes } from "../delegate-types";
import { hubId } from "../hub-id";
import { HubLifetime } from "../lifetime";
import { nameStoredRowsFrom } from "../stored-json";
import {
  type AccountsDb,
  accountsDb,
  type ProjectAccountsDb,
  projectAccountsDb,
} from "./accounts";
import { type ActionsDb, actionsDb } from "./actions";
import type { AreasDb } from "./areas";
import type { ArtifactListenersDb } from "./artifacts";
import { type ArtifactsDb, artifactsDb } from "./artifacts";
import { type AskPartsDb, type AsksDb, askPartsDb, asksDb } from "./asks";
import { type AtLimitDb, atLimitDb } from "./at-limit";
import { type BlocksDb, blocksDb } from "./blocks";
import { type BrowsersDb, browsersDb } from "./browsers";
import { type CapabilityCallsDb, capabilityCallsDb } from "./capability-calls";
import { type ConnectionsDb, connectionsDb } from "./connections";
import { type ContinuationsDb, continuationsDb } from "./continuations";
import { type DbCore, dbCore } from "./core";
import { type DecidesDb, decidesDb } from "./decides";
import { type DelegateEventsDb, delegateEventsDb } from "./delegate-events";
import { type DesignChecksDb, designChecksDb } from "./design-checks";
import { type DesignOffersDb, designOffersDb } from "./design-offers";
import {
  dropGraphPlaces,
  GRAPH_PLACES_MIGRATION_WHEN,
} from "./drop-graph-places";
import {
  type FindDb,
  type FindSettingsDb,
  findDb,
  findSettingsDb,
} from "./find";
import {
  type FleetCatalogDb,
  fleetCatalogDb,
  storedHash,
} from "./fleet-catalog";
import { type ForgetDb, forgetDb } from "./forget";
import { type HubAuthDb, hubAuthDb } from "./hub-auth";
import { type HubSettingsDb, hubSettingsDb } from "./hub-settings";
import { type IngressDb, ingressDb } from "./ingress";
import { type LfsOffersDb, lfsOffersDb } from "./lfs-offers";
import { type McpServersDb, mcpServersDb } from "./mcp-servers";
import { type MemoryFactsDb, memoryFactsDb } from "./memory-facts";
import {
  mergeProjectPages,
  PROJECT_PAGES_MIGRATION_WHEN,
} from "./merge-project-pages";
import { type MoveEndingsDb, moveEndingsDb } from "./move-endings";
import { type MovesDb, movesDb } from "./moves";
import { type OwedMovesDb, owedMovesDb } from "./owed-moves";
import { type PresenceDb, presenceDb } from "./presence";
import { type PreviewPassesDb, previewPassesDb } from "./preview-passes";
import { type PreviewsDb, previewsDb } from "./previews";
import {
  type ProjectWorkDb,
  projectWorkDb,
  type WorkRowsDb,
  workRowsDb,
} from "./project-work";
import { type ProjectsDb, projectsDb } from "./projects";
import { type RelaysDb, relaysDb } from "./relays";
import { type RoutinesDb, routinesDb } from "./routines";
import { type RulesDb, rulesDb } from "./rules";
import {
  accountSignins,
  accounts,
  agentHarnesses,
  agents,
  agentTools,
  artifacts,
  chosenModes,
  dataMigrations,
  delegateEvents,
  fleetSkillHistory,
  instanceAliases,
  instanceConversations,
  instances,
  limitEvents,
  lineAnchors,
  type PriorConversation,
  plugins,
  projectPlaces,
  projectRepositories,
  queuedTaskStarts,
  queuedWorkItems,
  removedMachines,
  sentMessages,
  skills,
  usageLimits,
  workItems,
} from "./schema";
import { sealAtRest } from "./seal-at-rest";
import { type SendsDb, sendsDb } from "./sends";
import type { Revocations } from "./session-identity";
import { type SessionIdentityDb, sessionIdentityDb } from "./session-identity";
import { type SessionLinesDb, sessionLinesDb } from "./session-lines";
import { type SessionPlansDb, sessionPlansDb } from "./session-plans";
import { type SessionTasksDb, sessionTasksDb } from "./session-tasks";
import { type SshMachinesDb, sshMachinesDb } from "./ssh-machines";
import { type StartersDb, startersDb } from "./starters";
import { type StreamRelayDb, streamRelayDb } from "./stream-relay";
import { type TaskIndexDb, taskIndexDb } from "./task-index";
import type { TaskLinksDb } from "./task-links";
import { type ToolCallKeysDb, toolCallKeysDb } from "./tool-call-keys";
import { type TrackersDb, trackersDb } from "./trackers";
import { type TrashDb, trashDb } from "./trash";
import { type TreeStopsDb, treeStopsDb } from "./tree-stops";
import { type TrimDb, trimDb } from "./trim";
import { type TurnCutsDb, turnCutsDb } from "./turn-cuts";
import { type TurnUsageDb, turnUsageDb } from "./turn-usage";
import type { Tx } from "./tx";
import { type UsageDb, usageDb } from "./usage";
import { closeWal, useWal } from "./wal";

/** The harnesses a removed machine's sessions can be recovered from: those in a server that outlives the agent. */
const SERVER_HARNESSES = harnessesWith((traits) => traits.custody === "server");
/** The harnesses whose stored conversation, missing from a machine's catalog, is gone. */
const CATALOG_PROVES_GONE_HARNESSES = harnessesWith(
  (traits) => traits.catalogProvesGone
);
/** The harnesses whose conversations live in an account's directory. */
const ACCOUNT_DIR_HARNESSES = harnessesWith(
  (traits) => traits.accountModel === "dir"
);
/**
 * Statuses a live process can be wrongly filed under: a demotion while its
 * machine was unreachable, a spawn never confirmed, a nap its daemon has
 * since woken from. A machine's word that the process runs promotes them to
 * `running`; `stopped` and `discarded` are decisions, never overwritten.
 */
const MISFILED_LIVE: InstanceStatus[] = [
  "starting",
  "unknown",
  "sleeping",
  "error",
];
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
type InstanceRole = NonNullable<(typeof instances.$inferSelect)["role"]>;
/**
 * A session's stored row, its `cwd` named as {@link MachinePath}, which the
 * API's schema reads as the string it is on the wire.
 */
type StoredInstanceRow = Omit<typeof instances.$inferSelect, "cwd"> & {
  cwd: MachinePath;
};
/**
 * A session's row as the hub's readers take it: no hub-private column, and
 * no `tooling` or `commands`. `tooling` is the session's MCP servers and
 * tools, 17 KB of JSON a row on average and 36 KB at most (2026-10-09),
 * parsed on every read and read by one route alone
 * ({@link DbShape.instanceTooling}); `commands`, its `/` menu, is read only
 * as its transcript is built ({@link DbShape.instanceCommands}).
 */
export type PublicInstanceRow = Omit<
  StoredInstanceRow,
  | "tooling"
  | "commands"
  | "endIntent"
  | "endConfirmedAt"
  | "endReason"
  | "machineRemoved"
  | "scratchWorktree"
  | "endRetryAt"
  | "endAttempts"
  | "owedSpawn"
  | "owedAt"
  | "freshStartAt"
  | "turnOpenAt"
>;
export type { MachineLineKind } from "./schema";
/**
 * A board row: a {@link PublicInstanceRow}, whether its work item is live
 * (null: it runs none), which the board reads to list it and never sends,
 * and the workspace that item runs in, which it sends (core
 * `InstanceRow.workspaceId`).
 */
export type BoardInstanceRow = PublicInstanceRow & {
  workLive: boolean | null;
  workspaceId: string | null;
};
/** A session's whole row but its `tooling` ({@link PublicInstanceRow}). */
type OwnedInstanceRow = Omit<StoredInstanceRow, "tooling" | "commands">;

/**
 * A session the returning daemon no longer carries. `resumes` is the whole
 * question: the SDK still has its conversation, so the process can be started
 * again on top of it rather than the work being lost with the restart.
 */
interface SettledInstance {
  resumes: boolean;
  row: typeof instances.$inferSelect;
}

/** How long a session that stopped moving stays in the listings the rails read. */
const STALE_AFTER_MS = DAY_MS;

/** How many keys one read names ({@link DbShape.boardSessionsWrapping}): under SQLite's bound on a statement's values. */
const KEYS_PER_READ = 500;

/**
 * Whether a sleeping row stays listed however long it sleeps: a person's
 * session and Caw's are conversations to pick back up; a delegate's or a
 * check's only while its work item is live (`workLive`). One whose item has
 * ended (or that has none) is history, listed {@link STALE_AFTER_MS} after
 * it last moved, as a stopped row is.
 */
const sleepKeeps = (row: {
  origin: SessionOrigin;
  workLive: boolean | null;
}): boolean =>
  row.origin === "person" || row.origin === "project" || row.workLive === true;

/**
 * The listings' one clock-bound rule, for a row already read: running,
 * asleep where its sleep keeps it ({@link sleepKeeps}), or moved within
 * {@link STALE_AFTER_MS}. A row the board keeps leaves it by this as the
 * listing's own query would drop it, with no write.
 */
export const listedAt = (
  row: {
    origin: SessionOrigin;
    status: string;
    updatedAt: Date;
    workLive: boolean | null;
  },
  now: number
): boolean =>
  row.status === "running" ||
  (row.status === "sleeping" && sleepKeeps(row)) ||
  row.updatedAt.getTime() > now - STALE_AFTER_MS;

export type AgentAuth = (typeof agents.$inferSelect)["auth"];

/** What folding a session's former rows into it did, for the hub's log. */
interface FoldedSession {
  /** The former rows whose process may still run: each is ended at its machine's register, then goes. */
  ending: string[];
  formers: string[];
  instanceId: string;
  /** Sends that failed only because a process went away, pending again for the session now. */
  owedAgain: string[];
}

/** What a continuation's new session took on from the session it continues ({@link DbShape.adoptChildren}). */
interface AdoptedChildren {
  /** Its artifacts, by the session that holds or made them. */
  artifacts: number;
  asks: number;
  items: number;
  queuedItems: number;
  queuedStarts: number;
  sessions: string[];
}

/** The store's own members and the stores it wires in. */
interface HubStore {
  /** Accounts, where they are signed in, how they route, and their limits. */
  readonly accounts: AccountsDb;
  /** Approved actions: one exact tool call each, run once (actions.ts). */
  readonly actions: ActionsDb;
  /**
   * A session continued in a new session (`to`) hands it its live work, in
   * one transaction: its delegates that have not ended, and the sessions of
   * its live items, become `to`'s; so do its live work items, every item of
   * those sessions, and every item of a group not yet reported that one of
   * them is in (the group reports once, to one parent); its queued delegates
   * and queued task starts; the asks of the moved delegates still
   * waiting on an answer; and its artifacts, as the session that holds them
   * and as their maker (the columns a fold moves, `FOLD_MOVED`), so every
   * comment, pick and wake on one reaches `to`. What `from` delegated and is
   * over stays its own.
   */
  readonly adoptChildren: (from: string, to: string) => AdoptedChildren;
  /** The machine's fleet generation and the fingerprint of what it was to hold at it (hub fleet-sync.ts); generation 0 for a machine never sent one. */
  readonly agentFleetGeneration: (machineId: string) => {
    fingerprint: string | null;
    generation: number;
  };
  readonly agentHarnesses: (machineId: string) => HarnessReport[] | undefined;
  /**
   * One machine's row as {@link listAgents} shapes it, read alone: what
   * `GET /api/agents/:machineId` answers, which an update's trial asks every
   * second through a loaded hub, so it reads that machine's cells and no
   * other's. Undefined when the hub knows no such machine.
   */
  readonly agentRow: (machineId: string) => AgentRow | undefined;
  /** A machine's last-known tool status by id; empty for one that never reported. */
  readonly agentTools: (machineId: string) => Record<string, ToolStatus>;
  /** Keeps where one of the hub's lines stands ({@link lineAnchorsOf}); a line placed again keeps its newest place. */
  readonly anchorLine: (
    instanceId: string,
    lineId: string,
    after: readonly string[]
  ) => void;
  /** The areas projects sit in, and which project sits in which (areas.ts). */
  readonly areas: AreasDb;
  /** Artifacts and their documents' update logs (artifacts/). */
  readonly artifacts: ArtifactsDb;
  /** What sessions asked the person, and what the hub carried out (asks.ts). */
  readonly asks: AsksDb;
  /** Sessions held at their account's limit, summaries kept ahead of it, and the lines it wrote. */
  readonly atLimit: AtLimitDb;
  /**
   * `run` in one transaction: every write it makes, through any method here
   * (each nested one a savepoint inside it), commits together or, when it
   * throws, none does. What it answers.
   */
  readonly atomically: <T>(run: () => T) => T;
  /** Each project page's arrangement of blocks (blocks.ts). */
  readonly blocks: BlocksDb;
  /**
   * Rows by id as the board reads them, listed or not: the ancestors a
   * listed row nests under, which the board carries with it. Never one the
   * listings never show (discarded, being deleted, a removed machine's).
   */
  readonly boardAncestors: (ids: string[]) => BoardInstanceRow[];
  /**
   * The sessions that wrap these transcripts (each a harness's session
   * key), as the board reads a row, listed or not: what stands behind a
   * machine's stored transcripts ({@link boardAncestors}'s rule for which
   * rows are ever shown).
   */
  readonly boardSessionsWrapping: (sessionIds: string[]) => BoardInstanceRow[];
  /** The fleet's browsers, per machine (browsers.ts). */
  readonly browsers: BrowsersDb;
  /** Each session's skill, tool and MCP server calls (usage-count.ts, capability-calls.ts). */
  readonly capabilityCalls: CapabilityCallsDb;
  /**
   * The effort the operator chose for the session: what its every launch asks
   * for. Written by a spawn that names one and by a `set-effort`, never by a
   * reading ({@link DbShape.noteInstanceEffort}).
   */
  readonly chooseEffort: (id: string, effort: EffortLevel) => void;
  /** Files `mode` as the one the person last chose for `harness` on `machineId`. */
  readonly chooseMode: (
    machineId: string,
    harness: HarnessKind,
    mode: PermissionMode
  ) => void;
  /** The permission mode the person last chose for `harness` on `machineId` (schema `chosenModes`); none when never. */
  readonly chosenMode: (
    machineId: string,
    harness: string
  ) => PermissionMode | undefined;
  /** Each listed Claude session on a machine with a conversation, and its account: no more of its row. */
  readonly claudeConversationsOn: (machineId: string) => {
    accountId: string | null;
    id: string;
    sessionId: string;
  }[];
  readonly clearEndConfirmation: (id: string) => void;
  /** Closes the connection: the hub's lifetime's last release (lifetime.ts). */
  readonly close: () => void;
  /** A receipt for the current row's decision; deletes are finalized here. */
  readonly confirmInstanceEnd: (id: string, reason?: string) => void;
  /** Connections and the projects that grant them (connections.ts). */
  readonly connections: ConnectionsDb;
  /**
   * Runs the one-time migration `name` over every stored send, in one
   * transaction, unless it has run (`data_migrations`): `rewrite` answers a
   * send's message as it is to be kept, or null to leave it as it is. How
   * many sends it changed; null when it had run already.
   */
  /** Whether the one-time data migration `name` has run (`data_migrations`). */
  readonly dataMigrated: (name: string) => boolean;
  /**
   * A machine's catalog's word on when each stored conversation last changed,
   * written onto its rows that are not live, but for those whose newest send
   * is a keep-alive (read as each chunk is written). Returns how many rows
   * the catalog moved.
   */
  readonly dateStoredSessions: (
    machineId: string,
    liveIds: string[],
    resumableAt?: Record<string, number>,
    /** Told once the dates, written a chunk a turn after this returns, are in. */
    written?: () => void
  ) => number;
  /** Who decides: the fleet's table, its members and kinds, and where every card went (decides.ts). */
  readonly decides: DecidesDb;
  /** The fleet's delegate types (delegate-types.ts), on this connection. */
  readonly delegateTypes: DelegateTypesShape;
  /**
   * Forgets a machine's entry, its places and its current limit reading;
   * hidden session ownership remains until its stored delete decisions are
   * confirmed by that machine. Spend and limit history stay, because they
   * happened. A project whose primary checkout was there moves it to its
   * next checkout, or has none yet; every project keeps its folder on the
   * hub, so none goes. Its name and the time are kept in `removed_machines`:
   * what reads of the rows that still name it say it was. Answers which
   * sessions went, for the confirm's receipt.
   */
  readonly deleteMachine: (machineId: string) => {
    instanceIds: string[];
  };
  /** Design checks and design proposals (design-verify.ts, design-system.ts). */
  readonly designChecks: DesignChecksDb;
  /** Caw's one design-system offer per project (design-offers.ts). */
  readonly designOffers: DesignOffersDb;
  /** A cancelled move's held row leaves the board, while no spawn has taken it on. True when it went. */
  readonly dropMovingInstance: (id: string) => boolean;
  /** Persist the decision before its reconciler may send anything. */
  readonly endInstance: (
    id: string,
    intent: SessionEndIntent
  ) => typeof instances.$inferSelect | undefined;
  /**
   * The agent reported the session dead: what killed it, kept for late
   * readers, and its kind when what failed typed it (core `LastErrorKind`).
   */
  readonly failInstance: (
    id: string,
    error: string,
    kind?: LastErrorKind
  ) => void;
  /** What the find engine reads (find.ts), and when the person last looked at each session. */
  readonly find: FindDb;
  /** Transcript deletion follows confirmed process exit, never precedes it. */
  readonly finishTranscriptDelete: (id: string) => void;
  /**
   * Folds session `from` into `to`, the continuation it went on in, as
   * {@link foldFormerSessions} folds a former row, in one transaction: `from`
   * is a former id of `to` from here (and so is every id that was a former
   * id of `from`), what it ran and was sent is `to`'s, its conversation is
   * the one before `to`'s, and its row goes, or is ended first when its
   * process may still run. Undefined when `from` is no longer recorded.
   */
  readonly foldContinued: (
    from: string,
    to: string
  ) => FoldedSession | undefined;
  readonly foldFormerSessions: (
    /** Whether a send that failed for `reason` failed only because a process went away. */
    owedAgain: (reason: string) => boolean
  ) => FoldedSession[];
  /**
   * A project forgotten, every row its delete takes and every link it cuts
   * handed to `keep` first (forget.ts); and those rows put back.
   */
  readonly forgetProject: ForgetDb["forget"];
  /** Every former id, by the id its session has now ({@link instanceIdOf}). */
  readonly formerIds: () => Record<string, string>;
  /**
   * The named rows, however old they are — the listing's staleness cut-off does
   * not apply here. A conversation the reader still has a tab open on is a row
   * they are entitled to an answer about, and the answer (what it is called) was
   * written down long before it aged out of the board. Discarded rows stay gone:
   * those were thrown away on purpose. Raw, so a caller can tell a given title
   * from a derived one.
   */
  readonly getInstancesByIds: (ids: string[]) => PublicInstanceRow[];
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
    harness: HarnessKind;
    model?: string;
    permissionMode?: string;
    title?: string;
    derivedTitle?: string;
    at: Date;
  }) => boolean;
  /** Who may call the hub: the pairing setting, the person's devices, the machines' keys (hub-auth.ts). */
  readonly hubAuth: HubAuthDb;
  /** Inbound events, their routes and the pollers that bring them in (ingress.ts). */
  readonly ingress: IngressDb;
  /** Look up a single non-discarded instance by its harness sessionId. */
  readonly instanceBySessionId: (
    sessionId: string
  ) => PublicInstanceRow | undefined;
  /** What a session's newest `init` listed behind `/`; null when none listed any, undefined for no such row. */
  readonly instanceCommands: (id: string) => SessionCommands | null | undefined;
  /**
   * The session an id names now: a former id (a session the hub folded
   * into its continuation, {@link instanceAliases}) is the session it is
   * part of; any other id is itself. Every path that takes a
   * session id from outside — a send, a wake, a control, a tool's target, a
   * link — reads it here.
   */
  readonly instanceIdOf: (id: string) => string;
  /**
   * Every kept row that names `accountId`, however long ago it last moved
   * (a session stopped a week ago is still one a person can wake): what an
   * account's removal moves off it.
   */
  readonly instancesOnAccount: (accountId: string) => PublicInstanceRow[];
  /** The MCP servers and tools a session's newest `init` announced. */
  readonly instanceTooling: (id: string) => SessionTooling | null | undefined;
  /** The listed sessions whose keep-alive is on: the only ones it schedules. */
  readonly keepAliveInstances: () => PublicInstanceRow[];
  /**
   * The directory a row was launched in, which every spawn of it uses;
   * `"unknown"` when its machine had no record of its conversation; undefined
   * for a new id.
   */
  readonly launchDirOf: (
    id: string
  ) => { cwd: MachinePath } | { unknown: true } | undefined;
  /** Git LFS offered for a place's left-out large files (lfs-offers.ts). */
  readonly lfsOffers: LfsOffersDb;
  /**
   * Where each of the hub's lines in a session's transcript stands, by the
   * line's block id: the rows it followed when first placed, the nearest
   * first (`line_anchors`).
   */
  readonly lineAnchorsOf: (instanceId: string) => Map<string, string[]>;
  /**
   * Every machine, in the shape everything downstream reads them: the `fleet`
   * column is null until a machine has synced once, and `AgentRow` says absent.
   */
  readonly listAgents: () => AgentRow[];
  /** Board rows never fetch/decode the per-session tooling document. */
  readonly listBoardInstances: () => BoardInstanceRow[];
  /** {@link listBoardInstances}, of these ids only. */
  readonly listedBoardInstancesByIds: (ids: string[]) => BoardInstanceRow[];
  /** How many listed sessions this one started. */
  readonly listedChildCount: (parentInstanceId: string) => number;
  /** {@link listInstances}, of these ids only: by key, the same rows it would list. */
  readonly listedInstancesByIds: (ids: string[]) => PublicInstanceRow[];
  /**
   * Every listed row. A pass over the whole fleet only: what asks about one
   * session or a few reads them by key ({@link listedInstancesByIds}), since
   * each call reads and parses every row (2,600 of them, 2026-10-09).
   */
  readonly listInstances: () => PublicInstanceRow[];
  /** {@link listInstances}, of one machine's sessions alone. */
  readonly listInstancesOn: (machineId: string) => PublicInstanceRow[];
  /** The listed sessions running or starting on one machine. */
  readonly liveInstancesOn: (machineId: string) => PublicInstanceRow[];
  /** Where each live top-level mainline session works, and no more of it. */
  readonly liveMainlineFolders: () => {
    cwd: MachinePath;
    id: string;
    machineId: string;
  }[];
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
  /** The machine answered its welcome (hub fleet-sync.ts): it is online. */
  readonly markAgentReady: (machineId: string) => void;
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
  /** Marks the one-time data migration `name` run: it never runs again. */
  readonly markDataMigrated: (name: string) => void;
  /**
   * The person pressed Done on these sessions (an archive) at `at`; a null
   * `at` takes it back (unarchive). `updatedAt` stays, as {@link markSeen}'s.
   */
  readonly markDone: (instanceIds: string[], at: Date | null) => void;
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
   * The owner looked at these sessions (a tab in front) or archived them off
   * Finished, at `at`; a null `at` clears the mark (unarchive), which
   * every reader counts as never seen. `updatedAt` stays: being looked at is not
   * the session moving. Returns the rows it changed, to publish.
   */
  readonly markSeen: (
    instanceIds: string[],
    at: Date | null
  ) => (typeof instances.$inferSelect)[];
  /** A project's fact uses and declined rewrites (memory.ts). */
  readonly memoryFacts: MemoryFactsDb;
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
  /** What each session's move ended, until it is told (move-endings.ts). */
  readonly moveEndings: MoveEndingsDb;
  /** Every machine by its id and hostname, in {@link listAgents}' order: what a machine's name is read from. */
  readonly namedMachines: () => { hostname: string; machineId: string }[];
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
   * does not re-publish the board. A reading never moves the session's
   * chosen effort ({@link DbShape.chooseEffort}).
   */
  readonly noteInstanceEffort: (id: string, effort: SessionEffort) => boolean;
  /**
   * The SDK session an `init` frame named, so the row can be read back from —
   * with the directory it really opened in, which is the agent's word on where
   * the spawn's `cwd` resolved to, and the MCP servers and tools it announced
   * when it announced any. Its harness is its spawn's ({@link openInstance}).
   * A key that replaces another (a `/clear`, a fresh start, a relaunch that
   * could not resume) keeps the one it replaces among the session's prior
   * conversations ({@link priorConversations}): its transcript still reads
   * what was said there.
   */
  readonly noteInstanceSession: (
    id: string,
    sessionId: string,
    cwd?: MachinePath,
    tooling?: SessionTooling,
    commands?: SessionCommands,
    /** The project holding a folder on a machine (server.ts `projectAtFolder`); default {@link DbShape.projectHolding}. */
    placeAt?: (machineId: string, cwd: string) => string | undefined
  ) => void;
  /**
   * The person wrote to the session at `at` (a send of theirs the hub
   * accepted): its `wroteAt`. False when the hub keeps no row for it.
   */
  readonly noteWrote: (id: string, at: Date) => boolean;
  readonly openInstance: (instance: {
    id: string;
    machineId: string;
    cwd: MachinePath;
    sessionId?: string;
    harness: HarnessKind;
    /**
     * Who started it (core `SessionOrigin`), from who asked: written as the
     * row opens and never after, so a restart, wake or relaunch of a row
     * keeps the one it opened with.
     */
    origin: SessionOrigin;
    /** Its project; a row that has one keeps it, whatever a later start names. */
    projectId?: string;
    parentInstanceId?: string;
    parentToolUseId?: string;
    /** What the spawn said the session is for; a row without one keeps whatever it had. */
    title?: string;
    kind: InstanceKind;
    /** The settled spawn mode; null only when the harness reports no modes. */
    permissionMode: string | null;
    model?: string;
    /** The delegate types it may start (core `MayStart`); absent leaves the column alone. */
    mayStart?: MayStart;
    /** The work item the session runs; set once, at its spawn. */
    workItemId?: string;
    /** The toolset it runs in; set once, at its first spawn. */
    role?: InstanceRole;
    /** The delegate type it was started as, and where it came from; set at its first spawn. */
    delegateType?: { name: string; projectId?: string };
    /** Started clean (core `SpawnPayload.clean`); set at its first spawn, never after. */
    clean?: boolean;
    /** What it starts with (core `SpawnPayload.startingSet`); set at its first spawn, never after. */
    startingSet?: StartingSet;
    /** The account placement chose; a row that has one keeps it. */
    accountId?: string;
    /** The account its start named, as placed; a row that has one keeps it. */
    namedAccount?: string;
    /**
     * The session a fork branched from (its spawn resumed that one's
     * conversation under `fork`); set once, as the fork's row opens, so
     * everything that asks whose a session's delegates are reads it from its
     * first send on.
     */
    forkedFrom?: string;
    /**
     * A restore of the session's last launch: the turn that launch had open
     * ({@link instances.turnOpenAt}) stays, to be handed back. Every other
     * start is someone's own, and ends what was open.
     */
    keepTurn?: boolean;
  }) => void;
  /** The moves sessions owe to their next launch, one per session (owed-moves.ts). */
  readonly owedMoves: OwedMovesDb;
  /** What a machine is owed, in the order it was asked for. */
  readonly owedSpawns: (
    machineId: string
  ) => { envelope: Envelope<SpawnPayload>; id: string }[];
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
  readonly oweSpawn: (
    id: string,
    envelope: Envelope<SpawnPayload>,
    at: number
  ) => void;
  /** Whether the session's start is still owed to its machine ({@link oweSpawn}). */
  readonly owesSpawn: (id: string) => boolean;
  /** `machineId`'s rows among `ids`, hidden and discarded ones too. */
  readonly ownedByIds: (
    machineId: string,
    ids: readonly string[]
  ) => OwnedInstanceRow[];
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
   * The rows a reconcile of `machineId` can act on (session-lifecycle.ts
   * `reconcile`): an end still owed or a transcript delete unfinished, a
   * session running or starting, a removed opencode session, and every row
   * `named` (the machine's custody, attached and pending). A row with none of
   * these is one the reconcile passes over.
   */
  readonly ownedToReconcile: (
    machineId: string,
    named: readonly string[]
  ) => OwnedInstanceRow[];
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
      projectId?: string;
      /** The continuation its work item moved to: it never runs again. */
      continuedInto?: string;
    }
  ) => PublicInstanceRow | undefined;
  /** Host mode's preview passes, one per browser (preview-access.ts). */
  readonly previewPasses: PreviewPassesDb;
  /** Each session's preview port, and the fleet's preview mode (preview.ts). */
  readonly previews: PreviewsDb;
  /** The harness conversations a session had before the one it runs now, oldest first (`instance_conversations`). */
  readonly priorConversations: (instanceId: string) => PriorConversation[];
  /** A project's sessions and workspaces, read and dropped as it is deleted for good (project-work.ts). */
  readonly projectWork: ProjectWorkDb;
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
  /** Files a send's record as the hub accepted it: pending, or failed at once. */
  /** A scratch session's worktree as its machine made it; `dir` is where it now launches. */
  readonly recordScratchWorktree: (
    id: string,
    worktree: import("@cawco/core/protocol").ScratchWorktree,
    dir: MachinePath
  ) => void;
  /**
   * A machine that re-joined under a new id (its id follows its hostname,
   * core machine-id.ts) is the machine it was: every row that named `from`
   * names `to`, in one transaction. Its machine row moves whole unless `to`
   * has one already (then `to`'s stands); a row keyed by machine that `to`
   * already holds (its key, a place, a sign-in, a usage bucket) stays `to`'s,
   * and `from`'s goes. A check that named `from` by id names `to`. Answers
   * how many rows moved, by table.
   */
  readonly rekeyMachine: (from: string, to: string) => Record<string, number>;
  /** Relays: a project's public webhook paths through Funnel (relay.ts). */
  readonly relays: RelaysDb;
  /** The machines the person removed ({@link deleteMachine}), by id. */
  readonly removedMachines: () => (typeof removedMachines.$inferSelect)[];
  /** `machineId`'s rows for sessions removed with a machine (`machineRemoved`). */
  readonly removedOn: (machineId: string) => OwnedInstanceRow[];
  readonly restoreProject: ForgetDb["restore"];
  readonly restoreRemovedSessions: (
    machineId: string,
    held: string[],
    complete: boolean
  ) => void;
  /** Routines and their runs (routines.ts). */
  readonly routines: RoutinesDb;
  /** The listed sessions of one harness that are running. */
  readonly runningInstancesOf: (harness: HarnessKind) => PublicInstanceRow[];
  /** Every session id on `machineId`, and nothing else of them: a read of thousands of rows' every column held the hub's thread (hub-restart-load). */
  readonly sessionIdsOn: (machineId: string) => string[];
  /** Unfiltered ownership, including hidden deletes and discarded rows. */
  readonly sessionOwnership: (machineId?: string) => OwnedInstanceRow[];
  /** The background tasks each Claude session's process runs now (session-tasks.ts). */
  readonly sessionTasks: SessionTasksDb;
  /**
   * A machine's word on Claude, as a beat's Claude report says it (a keychain
   * unlocked from the dashboard, a login gone under it). Answers whether the
   * row moved.
   */
  readonly setAgentAuth: (machineId: string, auth: AgentAuth) => boolean;
  /** What the machine has installed, as its latest capabilities beat said. */
  readonly setAgentCapabilities: (
    machineId: string,
    capabilities: import("@cawco/core/capabilities").MachineCapabilities
  ) => void;
  /** A machine's own account of what it came to, from the sync it just answered. */
  readonly setAgentFleet: (machineId: string, report: FleetSyncReport) => void;
  /** The machine's fleet generation and the fingerprint of what it is to hold at it (hub fleet-sync.ts). */
  readonly setAgentFleetGeneration: (
    machineId: string,
    generation: number,
    fingerprint: string
  ) => void;
  /** Each fleet item as the machine converges it (hub fleet-sync.ts), by item id. */
  readonly setAgentFleetItems: (
    machineId: string,
    items: Record<string, FleetItemStatus>
  ) => void;
  /** What became of the last delta the hub sent the machine (hub fleet-sync.ts). */
  readonly setAgentFleetSync: (
    machineId: string,
    outcome: FleetSyncOutcome
  ) => void;
  readonly setAgentToolCell: (machineId: string, status: ToolStatus) => void;

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
  /**
   * Files a session its machine put to sleep: `sleeping`, from any state that
   * claims a process. False when the row claimed none, or has no conversation
   * to wake from.
   */
  readonly sleepInstance: (id: string) => boolean;
  /**
   * Folds every former session ({@link instanceAliases}) not yet folded into
   * the session it is now, one transaction each: what answered to it, what
   * it ran, what it was sent and wrote, its conversation (into
   * `conversations`, in the order the conversations started), and the sends
   * that failed only because one of its processes went away, owed again.
   * Its row goes, or, with a process that may still run, is ended (`delete`)
   * so its machine stops it first. What each fold did.
   */
  /**
   * Each continuation left half done by a hub before the one-session rule's
   * steps committed together (server.ts `oneSession`): a running session
   * (`targetId`) that opened on a `continued` line no conversation of it
   * names (its source was never folded into it), whose first send came from
   * a session still running and folded into nothing (`sourceId`). Each pair
   * is two sessions where one was meant.
   */
  readonly splitContinuations: () => { sourceId: string; targetId: string }[];
  /** The machines the hub added over SSH, and the connection it holds to each (ssh-tunnels.ts). */
  readonly sshMachines: SshMachinesDb;
  /** A project's starters as last written, and what was done with them (project-starters.ts). */
  readonly starters: StartersDb;
  /** The fleet's stream relay (stream-relay.ts). */
  readonly streamRelay: StreamRelayDb;
  /**
   * `running`/`starting` → `unknown` at the hub's start, answering how many
   * rows moved: this process holds no sockets on its first line, so it cannot
   * vouch for any of it. Same argument as {@link markAllAgentsOffline}, and for
   * the same reason: the read overlay would already answer `unknown`, but a
   * column nobody has to remember to distrust is worth one write at startup.
   */
  readonly sweepBootStatuses: () => number;
  /**
   * The ids of the `instances` rows written since the last call (the
   * connection's change log), and the log emptied: what the board reads again.
   */
  readonly takeChangedInstances: () => string[];
  /** Takes one owed start off the books; true for exactly one caller. */
  readonly takeOwedSpawn: (id: string) => boolean;
  /** The external items tasks link, and the comments carried from them (task-links.ts). */
  readonly taskLinks: TaskLinksDb;
  /** Each relayed tool call taken under an idempotency key, and its answer (tool-call-keys.ts). */
  readonly toolCallKeys: ToolCallKeysDb;
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
  /** Trackers: a project's binding to GitHub Issues or Linear, and what its tasks and their issues agreed on (tracker.ts). */
  readonly trackers: TrackersDb;
  /** Deleted config items, kept whole for their Undo (trash.ts). */
  readonly trash: TrashDb;
  /** The stops that walk a delegation tree, a row per session until it ended (tree-stops.ts). */
  readonly treeStops: TreeStopsDb;
  /** The unused skills and servers routine's suggestion answers and kept items (unused-trim.ts). */
  readonly trim: TrimDb;
  /** Every turn the hub cut, and why (turn-cuts.ts). */
  readonly turnCuts: TurnCutsDb;
  /** Each completed turn's tokens, on the account it ran on. */
  readonly turnUsage: TurnUsageDb;
  /** Forgets where a line taken back stood. */
  readonly unanchorLine: (instanceId: string, lineId: string) => void;
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
  ) => { id: string; sessionId: string; harness: HarnessKind }[];
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
  /**
   * A machine registered: its row, and off the removed list if it was on it.
   * A register carries no word on Claude and no capabilities (each follows on
   * a beat of its own: {@link setAgentAuth}, {@link setAgentCapabilities}), so
   * the row keeps what it had of both; a new row's auth is `unknown`.
   */
  readonly upsertAgent: (agent: {
    machineId: string;
    hostname: string;
    os: string;
    /** Set by a seed, never by a register. */
    auth?: AgentAuth;
    /** Absent from a register with nothing new to say about it; the row keeps what it had. */
    build?: BuildInfo;
    /** The machine's home folder, absolute; absent from a daemon that does not say it. */
    home?: string;
    /**
     * Online at once: a seed, or an agent of an older contract. One that
     * speaks this hub's is online once it answers its welcome
     * ({@link markAgentReady}); until then it reads offline.
     */
    online?: boolean;
  }) => void;
}

export type DbShape = WorkRowsDb &
  ProjectsDb &
  FleetCatalogDb &
  McpServersDb &
  SendsDb &
  SessionLinesDb &
  UsageDb &
  DelegateEventsDb &
  MovesDb &
  ContinuationsDb &
  TaskIndexDb &
  SessionPlansDb &
  RulesDb &
  HubSettingsDb &
  FindSettingsDb &
  ProjectAccountsDb &
  AskPartsDb &
  PresenceDb &
  SessionIdentityDb &
  Pick<Revocations, "revokedAmong" | "onCredentialsRevoked"> &
  ArtifactListenersDb &
  HubStore;

export class Db extends Context.Service<Db, DbShape>()("Db") {}

const make = async (path: string): Promise<DbShape> => {
  mkdirSync(dirname(path), { recursive: true });
  const db = drizzle(path);
  // A stored JSON value that fails its schema names its row: the database
  // says which row holds that column's text (hub stored-json.ts).
  nameStoredRowsFrom((table, keys, column, raw) => {
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    const select = (keys.length > 0 ? keys.map((key) => key.name) : ["rowid"])
      .map(quote)
      .join(", ");
    const [row] = db.$client
      .query<unknown[], [string]>(
        `SELECT ${select} FROM ${quote(getTableName(table))} WHERE ${quote(column.name)} = ? LIMIT 1`
      )
      .values(raw);
    return row?.map(String).join("/");
  });
  // EVERY WRITE WAITS ITS TURN. WAL lets reads run beside a write, but
  // "there can only be one writer at a time" (sqlite.org/wal.html 2.2):
  // another connection's write to this file (the CLI's `cawco pairing off`,
  // a probe's writes to a scratch hub, the sqlite3 shell) holds the write
  // lock for a statement's or a transaction's length, and the hub's write
  // waits it out rather than failing with "database is locked".
  // busy_timeout: a write that opens the file's lock waits up to 5 s for it
  // (0 ms and failed with none, 330 ms and done with it, against a writer in
  // another process: workspace-retire, G, 2026-10-16). Set first, so the
  // conversion to WAL below waits out a reader of a file not yet converted.
  db.$client.run("PRAGMA busy_timeout = 5000");
  useWal(db.$client, path);
  // BEGIN IMMEDIATE: that wait is only for a lock asked for with no read
  // open. drizzle's bun-sqlite `transaction` is DEFERRED unless told
  // otherwise (`nativeTx[config.behavior ?? "deferred"]()`), so one that
  // read first then wrote asked to upgrade its read, and SQLite fails that
  // at once with SQLITE_BUSY whenever another connection holds the write
  // lock, never calling the busy handler ("If some other database connection
  // has already modified the database or is already in the process of
  // modifying the database, then upgrading to a write transaction is not
  // possible and the write statement will fail with SQLITE_BUSY",
  // sqlite.org/lang_transaction.html). A launch's grant (session-identity's
  // stage: a SELECT, then an upsert) was refused so while a probe wrote a
  // preview's row (workspace-retire f and p, 2026-10-20). Every transaction
  // on this connection takes the write lock as it begins, so it waits as a
  // single write does; a nested one is a savepoint inside it.
  const deferredTransaction = db.transaction.bind(db);
  db.transaction = (run) => deferredTransaction(run, { behavior: "immediate" });
  const {
    endRetryAt: _endRetryAt,
    endAttempts: _endAttempts,
    machineRemoved: _machineRemoved,
    scratchWorktree: _scratchWorktree,
    endReason: _endReason,
    endIntent: _endIntent,
    endConfirmedAt: _endConfirmedAt,
    owedSpawn: _owedSpawn,
    owedAt: _owedAt,
    freshStartAt: _freshStartAt,
    turnOpenAt: _turnOpenAt,
    tooling: _tooling,
    commands: _commands,
    ...publicColumns
  } = getTableColumns(instances);
  /**
   * The board's rows: each with whether its work item is live (starting or
   * running), which decides whether a delegate's or a check's sleep keeps it
   * listed ({@link listedAt}). Null on a row that runs no work item.
   */
  const boardColumns = {
    ...publicColumns,
    workLive: sql<
      boolean | null
    >`CASE WHEN ${instances.workItemId} IS NULL THEN NULL ELSE EXISTS (SELECT 1 FROM ${workItems} WHERE ${workItems.id} = ${instances.workItemId} AND ${workItems.state} IN ('starting', 'running')) END`.mapWith(
      (value: number | null) => (value === null ? null : value === 1)
    ),
    // The workspace its work item runs in: what Archive workspace names.
    workspaceId: sql<
      string | null
    >`(SELECT ${workItems.workspaceId} FROM ${workItems} WHERE ${workItems.id} = ${instances.workItemId})`,
  };
  const {
    tooling: _ownTooling,
    commands: _ownCommands,
    ...ownedColumns
  } = getTableColumns(instances);
  /** A row its machine still holds: not removed, not discarded, not being ended (a stop keeps it). */
  const keptInstances = () =>
    and(
      eq(instances.machineRemoved, false),
      ne(instances.status, "discarded"),
      or(isNull(instances.endIntent), eq(instances.endIntent, "stop"))
    );
  const listedInstances = () =>
    and(
      keptInstances(),
      or(
        // A move's row is work in hand however long its yes or its copy takes;
        // a stopping one however long its away machine takes to confirm.
        inArray(instances.status, [
          "running",
          "sleeping",
          "moving",
          "stopping",
        ] satisfies InstanceStatus[]),
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
    // Every migration before 0275, then a project's page rows of one name
    // folded into one (merge-project-pages.ts), then 0275 makes its name the
    // project's; every migration before 0317, then the decision graph's
    // places taken out of each page's state (drop-graph-places.ts), then
    // 0317 and the rest: drizzle applies only what is newer than the last
    // one applied, so each runs once, in order.
    const migrations = readMigrationFiles({ migrationsFolder: MIGRATIONS_DIR });
    // What drizzle's bun-sqlite `migrate` is (its migrator.js), whose
    // dialect and session its types keep internal.
    const { dialect, session } = db as unknown as {
      dialect: {
        migrate: (
          migrations: MigrationMeta[],
          session: unknown,
          config: { migrationsFolder: string }
        ) => void;
      };
      session: unknown;
    };
    dialect.migrate(
      migrations.filter(
        (one) => one.folderMillis < PROJECT_PAGES_MIGRATION_WHEN
      ),
      session,
      { migrationsFolder: MIGRATIONS_DIR }
    );
    mergeProjectPages(db.$client);
    dialect.migrate(
      migrations.filter(
        (one) => one.folderMillis < GRAPH_PLACES_MIGRATION_WHEN
      ),
      session,
      { migrationsFolder: MIGRATIONS_DIR }
    );
    dropGraphPlaces(db.$client);
    dialect.migrate(migrations, session, { migrationsFolder: MIGRATIONS_DIR });
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
  // A work item ending moves its session's row on the board as a write to
  // the row would: whether the session's sleep keeps it listed is the
  // item's ({@link listedAt}).
  db.$client.run(
    "CREATE TEMP TRIGGER IF NOT EXISTS work_item_state AFTER UPDATE OF state ON main.work_items WHEN old.state IS NOT new.state BEGIN INSERT INTO instance_changes (id) VALUES (new.instance_id); END"
  );
  const takeChanges = db.$client.prepare<{ id: string }, []>(
    "DELETE FROM instance_changes RETURNING id"
  );
  // The fleet's delegate types: their own table, on this connection, the
  // hub's one writer to its file.
  const delegateTypes = makeDelegateTypes(db.$client);
  const core: DbCore = dbCore(db);
  const {
    areasStore,
    artifactsWritten,
    dropArtifacts,
    dropInstances,
    revokeIdentities,
    taskLinksOf,
  } = core;

  /** Each of `rows` whose stored hash is not its files' own, written its own through `write`. */
  const rehashRows = <
    Row extends { files: SkillFile[] | null; hash: string | null },
  >(
    rows: Row[],
    write: (row: Row, hash: string | null) => void
  ): void => {
    for (const row of rows) {
      const hash = storedHash(row.files, row.hash);
      if (hash !== row.hash) {
        write(row, hash);
      }
    }
  };

  /** The repair below, once per hashFiles scheme. */
  function rehashStoredFilesOnce(): void {
    const name = `file_hashes:${FILE_HASH_SCHEME}`;
    db.transaction((tx) => {
      if (
        tx
          .select()
          .from(dataMigrations)
          .where(eq(dataMigrations.name, name))
          .get()
      ) {
        return;
      }
      rehashRows(
        tx
          .select({ name: skills.name, hash: skills.hash, files: skills.files })
          .from(skills)
          .all(),
        (row, hash) =>
          tx.update(skills).set({ hash }).where(eq(skills.name, row.name)).run()
      );
      rehashRows(
        tx
          .select({ id: plugins.id, hash: plugins.hash, files: plugins.files })
          .from(plugins)
          .all(),
        (row, hash) =>
          tx.update(plugins).set({ hash }).where(eq(plugins.id, row.id)).run()
      );
      rehashRows(
        tx
          .select({
            id: fleetSkillHistory.id,
            hash: fleetSkillHistory.hash,
            files: fleetSkillHistory.files,
          })
          .from(fleetSkillHistory)
          .all(),
        (row, hash) =>
          tx
            .update(fleetSkillHistory)
            .set({ hash: hash ?? row.hash })
            .where(eq(fleetSkillHistory.id, row.id))
            .run()
      );
      tx.insert(dataMigrations).values({ name, at: new Date() }).run();
    });
  }

  // A stored skill's or plugin's hash is what its files hash to with the
  // hashFiles this hub runs, because that is the hash every machine takes of
  // its disk. a1c94e85 put each file's execute bit into it, and the rows
  // resolved before that kept the old hash: no machine's untouched copy ever
  // matched it, so each one read as edited and a vendored plugin as missing
  // its bytes. Every row whose hash and files disagree is rehashed, with no
  // history row, since its bytes did not move: once for each hashFiles
  // scheme (`FILE_HASH_SCHEME`), recorded in `data_migrations`. Run at every
  // open, it read and hashed every file the fleet holds and ever held, about
  // 78 MB and 300 ms of each start on the live hub (2026-10-23). A row
  // written since cannot disagree: every write of files takes its hash from
  // them here ({@link storedHash}), so a skill's or plugin's hash changes
  // exactly when its files do, which is also what fleetConfig's files kept
  // by hash rest on (`keptFiles`).
  rehashStoredFilesOnce();

  /**
   * The conversation a session's new key replaces (a `/clear`, a fresh
   * start, a relaunch under a new key) kept among its prior ones, last: its
   * file is read before the new one, as a continuation's is. Once: a key
   * already among them is not kept again.
   */
  const keepReplacedConversation = (
    tx: Tx,
    instanceId: string,
    held: {
      accountId: string | null;
      harness: HarnessKind;
      model: string | null;
      sessionId: string | null;
    },
    sessionId: string
  ): void => {
    const left = held.sessionId;
    if (!left || left === sessionId) {
      return;
    }
    const prior = conversationsOf(tx, instanceId);
    if (prior.some((one) => one.sessionId === left)) {
      return;
    }
    putConversations(tx, instanceId, [
      ...prior,
      {
        sessionId: left,
        harness: held.harness,
        model: held.model,
        accountId: held.accountId,
        endedAt: Date.now(),
        next: null,
      },
    ]);
  };

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

  /**
   * Every table whose rows a former session's id names, by the column that
   * names it: what answered to it, what it ran, what it was sent and wrote.
   * Moved onto the session it is now; `once`: a table holding one row per
   * session, whose row the session already has keeps that one.
   */
  const FOLD_MOVED: readonly (readonly [string, string, "once"?])[] = [
    ["instances", "parent_instance_id"],
    ["instances", "continued_into"],
    ["work_items", "instance_id"],
    ["work_items", "parent_instance_id"],
    ["queued_work_items", "parent_instance_id"],
    ["queued_task_starts", "parent_instance_id"],
    ["delegate_events", "instance_id"],
    ["delegate_events", "parent_instance_id"],
    ["workspaces", "created_by_instance_id"],
    ["projects", "conversation_instance_id"],
    ["project_notes", "instance_id"],
    ["limit_events", "instance_id"],
    ["turn_usage", "instance_id"],
    ["artifacts", "instance_id"],
    ["artifacts", "made_by"],
    ["routines", "made_by"],
    ["design_proposals", "instance_id"],
    ["asks", "instance_id"],
    ["session_lines", "instance_id"],
    ["line_anchors", "instance_id"],
    ["completed_turns", "instance_id", "once"],
    ["session_plans", "instance_id", "once"],
    ["project_offers", "instance_id", "once"],
    ["fleet_watch_notices", "instance_id", "once"],
  ];
  /** A former session's state of the moment, which the session it is now keeps its own of. */
  const FOLD_DROPPED = [
    "limit_holds",
    "limit_compactions",
    "parked_asks",
    "rule_state",
    "moved_from_sessions",
  ];
  /**
   * Every column that names a machine with no foreign key to it, by table:
   * what a machine re-joining under a new id moves ({@link rekeyMachine}).
   * `keyed`: the machine is part of the row's key, so a row the new id holds
   * already keeps its place and the old one goes.
   */
  const MACHINE_MOVED: readonly (readonly [string, string, "keyed"?])[] = [
    ["instances", "machine_id"],
    ["workspaces", "machine_id"],
    ["workspace_creates", "machine_id"],
    ["artifacts", "machine_id"],
    ["parked_asks", "machine_id"],
    ["moved_from_sessions", "machine_id"],
    ["fleet_watch_notices", "machine_id"],
    ["moves", "source_machine_id"],
    ["moves", "target_machine_id"],
    ["rules", "scope_machine_id"],
    ["project_places", "machine_id", "keyed"],
    ["project_repositories", "machine_id", "keyed"],
    ["account_signins", "machine_id", "keyed"],
    ["login_moves", "machine_id", "keyed"],
    ["usage_limits", "machine_id", "keyed"],
    ["machine_keys", "machine_id", "keyed"],
    ["ssh_machines", "machine_id"],
    ["chosen_modes", "machine_id", "keyed"],
  ];
  /** How many rows moved, by what they are: what a re-key answers. */
  type Moved = (what: string, count: number) => void;
  /**
   * Rows of `table` whose `column` names `from`. Through `all`: bun-sqlite's
   * `get` of raw SQL answers the row as an array of values.
   */
  const naming = (tx: Tx, table: string, column: string, from: string) =>
    tx.all<{ n: number }>(
      sql`SELECT count(*) AS n FROM ${sql.identifier(table)} WHERE ${sql.identifier(column)} = ${from}`
    )[0]?.n ?? 0;
  /**
   * The machine's row, with what its daemon last reported, onto `to`, unless
   * `to` registered already: then that row is the current one, and `from`'s
   * goes with its reports.
   */
  /** Whether the hub keeps a row for the machine. */
  const machineKept = (tx: Tx, machineId: string): boolean =>
    tx
      .select({ machineId: agents.machineId })
      .from(agents)
      .where(eq(agents.machineId, machineId))
      .get() !== undefined;

  /** A machine's rows filed under one of `statuses`, owed no spawn, whose process `listed` leaves out. */
  const claimingProcesses = (
    machineId: string,
    statuses: (typeof instances.$inferSelect.status)[],
    listed: string[]
  ) =>
    db
      .select()
      .from(instances)
      .where(
        and(
          eq(instances.machineId, machineId),
          eq(instances.machineRemoved, false),
          isNull(instances.owedSpawn),
          inArray(instances.status, statuses),
          listed.length > 0 ? notInArray(instances.id, listed) : undefined
        )
      )
      .all();

  const moveMachineRow = (tx: Tx, from: string, to: string, note: Moved) => {
    const row = tx
      .select()
      .from(agents)
      .where(eq(agents.machineId, from))
      .get();
    if (row && !machineKept(tx, to)) {
      tx.insert(agents)
        .values({ ...row, machineId: to })
        .run();
      note("agents", 1);
      note("agent_tools", naming(tx, "agent_tools", "machine_id", from));
      tx.update(agentTools)
        .set({ machineId: to })
        .where(eq(agentTools.machineId, from))
        .run();
      note(
        "agent_harnesses",
        naming(tx, "agent_harnesses", "machine_id", from)
      );
      tx.update(agentHarnesses)
        .set({ machineId: to })
        .where(eq(agentHarnesses.machineId, from))
        .run();
    }
    tx.delete(agentTools).where(eq(agentTools.machineId, from)).run();
    tx.delete(agentHarnesses).where(eq(agentHarnesses.machineId, from)).run();
    tx.delete(agents).where(eq(agents.machineId, from)).run();
  };
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
    // A line between two conversations a member already holds stands, as
    // does the one each member opened on.
    const kept = new Set([
      ...opened.values(),
      ...members.flatMap((member) =>
        conversationsOf(tx, member.id).flatMap((one) =>
          one.next ? [one.next] : []
        )
      ),
    ]);
    const told = continued
      .filter((event) => !kept.has(event.id))
      .map((event) => event.id);
    if (told.length > 0) {
      tx.delete(limitEvents).where(inArray(limitEvents.id, told)).run();
    }
    // Each former's own earlier conversations (one folded before), then the
    // one it ran.
    const prior: PriorConversation[] = order
      .slice(0, -1)
      .flatMap((member, at) => [
        ...conversationsOf(tx, member.id),
        ...(member.sessionId
          ? [
              {
                sessionId: member.sessionId,
                harness: member.harness,
                model: member.model,
                accountId: member.accountId,
                endedAt: member.updatedAt.getTime(),
                next: opened.get(order[at + 1].id) ?? null,
              },
            ]
          : []),
      ]);
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
    // Its identity too: the session it is now holds its own.
    revokeIdentities(tx, gone);
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
    // then the survivor's own. They are the survivor's alone from here: a
    // former's own rows go now, as a former still running keeps its row
    // until its machine ends it, and each row names the line after it
    // (`instance_conversations_next`, unique), so a former that had gone on
    // in a fresh conversation before held that line's row twice and failed
    // the fold (Private office's Caw, 2026-11-05 10:13:07).
    tx.delete(instanceConversations)
      .where(inArray(instanceConversations.instanceId, gone))
      .run();
    putConversations(tx, survivorId, [
      ...prior,
      ...conversationsOf(tx, survivorId),
    ]);
    tx.update(instances)
      .set({
        createdAt: root.createdAt,
        parentInstanceId: parent ?? null,
        workItemId: first("workItemId"),
        projectId: first("projectId"),
        role: first("role"),
        delegateType: first("delegateType"),
        delegateTypeProject: first("delegateTypeProject"),
        mayStart: first("mayStart"),
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
    ...(row.signin === null ? {} : { signin: row.signin }),
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
      if (!machineKept(tx, machineId)) {
        return;
      }
      for (const status of statuses) {
        const cell = {
          state: status.state,
          version: status.version ?? null,
          method: status.method ?? null,
          detail: status.detail ?? null,
          signin: status.signin ?? null,
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

  /** Each machine's chosen permission mode by harness (schema `chosenModes`). */
  const chosenModesByMachine = (
    machineId?: string
  ): Map<string, Partial<Record<HarnessKind, PermissionMode>>> => {
    const byMachine = new Map<
      string,
      Partial<Record<HarnessKind, PermissionMode>>
    >();
    for (const row of db
      .select()
      .from(chosenModes)
      .where(
        machineId === undefined
          ? undefined
          : eq(chosenModes.machineId, machineId)
      )
      .all()) {
      byMachine.set(row.machineId, {
        ...byMachine.get(row.machineId),
        [row.harness]: row.permissionMode,
      });
    }
    return byMachine;
  };

  /**
   * Machines' rows in the shape everything downstream reads them, each with
   * its tools, harness reports and chosen modes; with `machineId`, the cells
   * of that machine alone are read ({@link DbShape.agentRow}).
   */
  const agentRows = (
    rows: (typeof agents.$inferSelect)[],
    machineId?: string
  ): AgentRow[] => {
    const toolCells = toolsByMachine(machineId);
    const reports = harnessesByMachine(machineId);
    const modes = chosenModesByMachine(machineId);
    return rows.map(
      ({
        fleet,
        fleetSync,
        fleetItems,
        fleetGeneration: _generation,
        fleetFingerprint: _fingerprint,
        build,
        home,
        machineCapabilities,
        pausedUntil,
        pauseStopped,
        ...agent
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: one optional field per nullable column, each left out of the row while null
      }) => {
        const harnesses = reports.get(agent.machineId);
        const chosen = modes.get(agent.machineId);
        return {
          ...agent,
          tools: toolCells.get(agent.machineId) ?? {},
          pausedUntil: pausedUntil?.getTime() ?? null,
          pauseStopped: (pauseStopped && stoppedWords(pauseStopped)) || null,
          ...(fleet ? { fleet } : {}),
          ...(fleetSync ? { fleetSync } : {}),
          ...(fleetItems ? { fleetItems } : {}),
          ...(build ? { build } : {}),
          ...(harnesses ? { harnesses } : {}),
          ...(chosen ? { chosenModes: chosen } : {}),
          ...(home ? { home } : {}),
          ...(machineCapabilities ? { machineCapabilities } : {}),
        };
      }
    );
  };
  /** Sessions whose newest send is read at once by {@link dateStoredSessions}: well inside SQLite's bound on a statement's parameters. */
  const DATED_CHUNK = 500;
  /**
   * Sessions dated in one statement, a turn apart: on the live database a
   * chunk of 500 took up to 670 ms, so 100 keeps each well inside a probe.
   */
  const DATES_WRITTEN_AT_ONCE = 100;
  /** Sessions whose date waits in a later chunk ({@link dateStoredSessions}): a call meanwhile leaves them to it. */
  const dating = new Set<string>();
  /** One chunk of sessions' dates, in one statement. */
  const writeDates = (chunk: { at: number; id: string }[]): void => {
    db.run(
      sql`WITH dated(id, at) AS (VALUES ${sql.join(
        chunk.map((row) => sql`(${row.id}, ${row.at})`),
        sql`, `
      )}) UPDATE instances SET updated_at = (SELECT at FROM dated WHERE dated.id = instances.id) WHERE id IN (SELECT id FROM dated)`
    );
  };
  /** Which of `sessions` sent a keep-alive last ({@link dateStoredSessions}). */
  const newestKeptAlive = (sessions: string[]): Set<string> => {
    // Whether each one's newest send is a keep-alive: its origin alone, read
    // in SQLite, never the whole body (a brief's words, kilobytes each). One
    // pass over each session's sends, grouped: a bare column beside max()
    // is read off the row that holds the max ("all bare columns in the
    // result set take values from an input row which also contains the
    // minimum or maximum", https://sqlite.org/lang_select.html, 2.5 Bare
    // columns in an aggregate query). The newest found by a
    // subquery per send read a session's every send once for each of them:
    // 45 s for the 5,206 sends of one, the hub's thread held all that time
    // through its machine's register (nightly 5224, 2026-10-23).
    const keptAlive = new Set<string>();
    for (let from = 0; from < sessions.length; from += DATED_CHUNK) {
      const ids = sessions.slice(from, from + DATED_CHUNK);
      for (const send of db
        .select({
          instanceId: sentMessages.instanceId,
          kind: sql<
            string | null
          >`json_extract(${sentMessages.body}, '$.origin.kind')`,
          name: sql<
            string | null
          >`json_extract(${sentMessages.body}, '$.origin.name')`,
          newest: sql<number>`max(${sentMessages.acceptedAt})`,
        })
        .from(sentMessages)
        .where(inArray(sentMessages.instanceId, ids))
        .groupBy(sentMessages.instanceId)
        .all()) {
        if (
          send.instanceId &&
          send.kind === "system" &&
          send.name === "keepalive"
        ) {
          keptAlive.add(send.instanceId);
        }
      }
    }
    return keptAlive;
  };
  /** `chunks` of dates written a turn apart, then `written` told ({@link dateStoredSessions}). */
  const writeDatesLater = (
    machineId: string,
    chunks: { at: number; id: string }[][],
    written?: () => void
  ): void => {
    if (chunks.length === 0) {
      return;
    }
    for (const chunk of chunks) {
      for (const row of chunk) {
        dating.add(row.id);
      }
    }
    const later = async () => {
      for (const chunk of chunks) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        try {
          // The transcript's mtime includes maintenance; it is not real
          // activity. Read here, a chunk's sessions at a time: all of a
          // machine's at once read 36,000 sends' bodies and held its
          // register 130 ms (a copy of the live database, 2026-10-24).
          const keptAlive = newestKeptAlive(chunk.map((row) => row.id));
          const dates = chunk.filter((row) => !keptAlive.has(row.id));
          if (dates.length > 0) {
            writeDates(dates);
          }
        } finally {
          for (const row of chunk) {
            dating.delete(row.id);
          }
        }
      }
      written?.();
    };
    later().catch((error: unknown) =>
      console.warn(
        `[hub] dating ${machineId}'s stored sessions stopped: ${error instanceof Error ? error.message : String(error)}; the next register dates them again`
      )
    );
  };
  const dateStoredSessions = (
    machineId: string,
    liveIds: string[],
    resumableAt?: Record<string, number>,
    written?: () => void
  ): number => {
    if (!resumableAt) {
      return 0;
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
    // Only a row whose time the catalog moves is read further: its newest
    // send, a chunk's at a time as the chunk is written. Each row's newest send was read on its
    // own, moved or not: a statement prepared and run per session, 314 ms
    // for a machine's 3,024 at every register and heartbeat, the hub's
    // thread held all that time (hub-restart-load, 2026-10-23).
    const moving = dated.flatMap((row) => {
      const at = row.sessionId ? resumableAt[row.sessionId] : undefined;
      return at === undefined || at === row.updatedAt.getTime()
        ? []
        : [{ id: row.id, at }];
    });
    if (moving.length === 0) {
      return 0;
    }
    // Each chunk's rows in one statement, each a turn of the loop after the
    // last, so the hub answers between them and the register that asked
    // waits on none: 4,277 rows whose times all moved held the thread 0.9 s
    // in one go on a copy of the live database (2026-10-24).
    const chunks: (typeof moving)[] = [];
    for (let from = 0; from < moving.length; from += DATES_WRITTEN_AT_ONCE) {
      const chunk = moving
        .slice(from, from + DATES_WRITTEN_AT_ONCE)
        .filter((row) => !dating.has(row.id));
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }
    writeDatesLater(machineId, chunks, written);
    return moving.length;
  };

  /** A project's forget and restore, over every table its keys reach (forget.ts). */
  const forgetting = forgetDb(db, dropArtifacts);
  const store: DbShape = {
    ...workRowsDb(core),
    ...projectsDb(core),
    ...fleetCatalogDb(core),
    ...mcpServersDb(core),
    ...sendsDb(core),
    ...sessionLinesDb(core),
    ...usageDb(core),
    ...delegateEventsDb(core),
    ...movesDb(core),
    ...continuationsDb(core),
    ...taskIndexDb(core),
    ...sessionPlansDb(core),
    ...rulesDb(core),
    ...hubSettingsDb(core),
    ...findSettingsDb(core),
    ...projectAccountsDb(core),
    ...askPartsDb(core),
    ...presenceDb(core),
    ...sessionIdentityDb(core),
    ...core.artifactListeners,
    revokedAmong: core.revokedAmong,
    onCredentialsRevoked: core.onCredentialsRevoked,
    close: () => closeWal(db.$client),
    delegateTypes,
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
    instanceCommands: (id) =>
      db
        .select({ commands: instances.commands })
        .from(instances)
        .where(eq(instances.id, id))
        .get()?.commands,
    instanceTooling: (id) =>
      db
        .select({ tooling: instances.tooling })
        .from(instances)
        .where(and(eq(instances.id, id), keptInstances()))
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
          lastErrorKind: null,
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
          } else if (complete && traitsOf(row.harness).listsAllConversations) {
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
    sessionIdsOn: (machineId) =>
      db
        .select({ id: instances.id })
        .from(instances)
        .where(eq(instances.machineId, machineId))
        .all()
        .map((row) => row.id),
    ownedByIds: (machineId, ids) =>
      ids.length === 0
        ? []
        : db
            .select(ownedColumns)
            .from(instances)
            .where(
              and(
                eq(instances.machineId, machineId),
                inArray(instances.id, [...new Set(ids)])
              )
            )
            .all(),
    removedOn: (machineId) =>
      db
        .select(ownedColumns)
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            eq(instances.machineRemoved, true)
          )
        )
        .all(),
    // Found by ids first, each kind by what reads it cheapest, then read
    // whole by id: `status` lies past the row's `tooling` (kilobytes a row),
    // so one scan that tested it read every row's overflow, 54 ms on the live
    // database at every heartbeat; ends and removals are tested on the
    // columns before it (13 ms), and running sessions by their index.
    ownedToReconcile: (machineId, named) => {
      const ids = new Set<string>(named);
      for (const { id } of db
        .select({ id: instances.id })
        .from(instances)
        .where(
          and(
            eq(instances.machineId, machineId),
            or(
              // An end still owed, or a transcript's delete still to finish.
              and(
                isNotNull(instances.endIntent),
                or(
                  isNull(instances.endConfirmedAt),
                  eq(instances.endIntent, "delete-transcript")
                )
              ),
              // A removed opencode session, which the reconcile recovers.
              and(
                eq(instances.machineRemoved, true),
                inArray(instances.harness, SERVER_HARNESSES)
              )
            )
          )
        )
        .all()) {
        ids.add(id);
      }
      // What an opencode stop names as claimed, besides `named`.
      for (const { id } of db
        .select({ id: instances.id })
        .from(instances)
        .where(
          and(
            inArray(instances.status, ["running", "starting"]),
            eq(instances.machineId, machineId)
          )
        )
        .all()) {
        ids.add(id);
      }
      return ids.size === 0
        ? []
        : db
            .select(ownedColumns)
            .from(instances)
            .where(
              and(
                eq(instances.machineId, machineId),
                inArray(instances.id, [...ids])
              )
            )
            .all();
    },
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
            traitsOf(row.harness).startsWithoutConversation &&
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
          let status: Extract<
            InstanceStatus,
            "discarded" | "stopped" | "stopping"
          > = "stopping";
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
          if (status !== "stopping") {
            revokeIdentities(tx, [id]);
          }
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
        // Its process is gone: what it held grants nothing from here.
        revokeIdentities(tx, [id]);
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
    chosenMode: (machineId, harness) =>
      db
        .select({ mode: chosenModes.permissionMode })
        .from(chosenModes)
        .where(
          and(
            eq(chosenModes.machineId, machineId),
            eq(chosenModes.harness, harness as HarnessKind)
          )
        )
        .get()?.mode,
    chooseMode: (machineId, harness, mode) => {
      const row = {
        machineId,
        harness,
        permissionMode: mode,
        chosenAt: new Date(),
      };
      db.insert(chosenModes)
        .values(row)
        .onConflictDoUpdate({
          target: [chosenModes.machineId, chosenModes.harness],
          set: { permissionMode: mode, chosenAt: row.chosenAt },
        })
        .run();
    },
    listBoardInstances: () =>
      db
        .select(boardColumns)
        .from(instances)
        .where(listedInstances())
        .all()
        .map(asListed),
    upsertAgent: ({
      machineId,
      hostname,
      os,
      auth,
      build,
      home,
      online = true,
    }) => {
      const lastSeenAt = new Date();
      const status = online ? "online" : "offline";
      db.insert(agents)
        .values({
          machineId,
          hostname,
          os,
          ...(auth ? { auth } : {}),
          status,
          lastSeenAt,
          build,
          home,
        })
        .onConflictDoUpdate({
          target: agents.machineId,
          set: {
            hostname,
            os,
            ...(auth ? { auth } : {}),
            status,
            lastSeenAt,
            ...(build ? { build } : {}),
            ...(home ? { home } : {}),
          },
        })
        .run();
      // A removed machine whose agent starts again is on the fleet again.
      db.delete(removedMachines)
        .where(eq(removedMachines.machineId, machineId))
        .run();
    },
    markAgentReady: (machineId) => {
      db.update(agents)
        .set({ status: "online", lastSeenAt: new Date() })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentCapabilities: (machineId, machineCapabilities) => {
      db.update(agents)
        .set({ machineCapabilities })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentAuth: (machineId, auth) =>
      db
        .update(agents)
        .set({ auth })
        .where(and(eq(agents.machineId, machineId), ne(agents.auth, auth)))
        .returning({ machineId: agents.machineId })
        .all().length > 0,
    // A beat says the machine is there, not that it is ready: only its
    // register (an older contract) or its welcome's answer puts it online.
    touchAgent: (machineId) => {
      db.update(agents)
        .set({ lastSeenAt: new Date() })
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
      id,
      machineId,
      cwd,
      sessionId,
      harness,
      origin,
      projectId,
      parentInstanceId,
      parentToolUseId,
      title,
      kind,
      permissionMode,
      model,
      mayStart,
      workItemId,
      role,
      delegateType,
      clean = false,
      startingSet,
      accountId,
      namedAccount,
      forkedFrom,
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
          id,
          machineId,
          cwd,
          sessionId: cleanSessionId,
          harness,
          origin,
          projectId,
          parentInstanceId,
          parentToolUseId,
          title,
          ...(title ? { titleSource: "agent" as const } : {}),
          kind,
          permissionMode,
          model,
          mayStart,
          workItemId,
          role,
          delegateType: delegateType?.name,
          delegateTypeProject: delegateType?.projectId,
          clean,
          startingSet,
          accountId,
          namedAccount,
          forkedFrom,
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
            kind,
            permissionMode,
            ...(model ? { model } : {}),
            // Presence, not truth: a leaf's empty list has to land.
            ...(mayStart === undefined ? {} : { mayStart }),
            // A session keeps the account it started on: its transcript and
            // its prompt cache are that account's.
            ...(accountId
              ? {
                  accountId: sql`COALESCE(${instances.accountId}, ${accountId})`,
                }
              : {}),
            ...(namedAccount
              ? {
                  namedAccount: sql`COALESCE(${instances.namedAccount}, ${namedAccount})`,
                }
              : {}),
            // A fork stays the fork of the session it branched from.
            ...(forkedFrom
              ? {
                  forkedFrom: sql`COALESCE(${instances.forkedFrom}, ${forkedFrom})`,
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
            lastErrorKind: null,
            ...(cleanSessionId ? { sessionId: cleanSessionId } : {}),
            // A start with no conversation to resume begins one from nothing.
            ...(cleanSessionId ? {} : { modelUsageSeen: {} }),
            harness,
            // One project per session, written as it first opened: a later
            // start of the row gives it one only while it has none.
            ...(projectId
              ? {
                  projectId: sql`COALESCE(${instances.projectId}, ${projectId})`,
                }
              : {}),
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
        .set({ status, lastError: lastError ?? null, lastErrorKind: null })
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
        .where(and(eq(instances.id, id), keptInstances()))
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
        .set({ status: "sleeping", lastError: null, lastErrorKind: null })
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
    failInstance: (id, error, kind) => {
      // A spin-off that was thrown away stays thrown away: its teardown can
      // fail long after the session did, and it is not coming back as a row.
      db.update(instances)
        .set({
          status: "error",
          lastError: error,
          lastErrorKind: kind ?? null,
          updatedAt: new Date(),
        })
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
    priorConversations: (instanceId) => conversationsOf(db, instanceId),
    lineAnchorsOf: (instanceId) =>
      new Map(
        db
          .select({ lineId: lineAnchors.lineId, after: lineAnchors.after })
          .from(lineAnchors)
          .where(eq(lineAnchors.instanceId, instanceId))
          .all()
          .map((row) => [row.lineId, row.after])
      ),
    anchorLine: (instanceId, lineId, after) => {
      db.insert(lineAnchors)
        .values({ instanceId, lineId, after: [...after] })
        .onConflictDoUpdate({
          target: [lineAnchors.instanceId, lineAnchors.lineId],
          set: { after: [...after] },
        })
        .run();
    },
    unanchorLine: (instanceId, lineId) => {
      db.delete(lineAnchors)
        .where(
          and(
            eq(lineAnchors.instanceId, instanceId),
            eq(lineAnchors.lineId, lineId)
          )
        )
        .run();
    },
    atomically: (run) => db.transaction(() => run()),
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
                  ] satisfies InstanceStatus[])
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
        const held = tx
          .update(artifacts)
          .set({ instanceId: to })
          .where(eq(artifacts.instanceId, from))
          .returning({ id: artifacts.id })
          .all();
        const made = tx
          .update(artifacts)
          .set({ madeBy: to })
          .where(eq(artifacts.madeBy, from))
          .returning({ id: artifacts.id })
          .all();
        const carriedArtifacts = new Set(
          [...held, ...made].map((row) => row.id)
        ).size;
        if (carriedArtifacts > 0) {
          artifactsWritten();
        }
        return {
          artifacts: carriedArtifacts,
          sessions,
          items: moved.length,
          queuedItems,
          queuedStarts,
          asks,
        };
      }),
    dataMigrated: (name) =>
      db
        .select()
        .from(dataMigrations)
        .where(eq(dataMigrations.name, name))
        .get() !== undefined,
    markDataMigrated: (name) => {
      db.insert(dataMigrations)
        .values({ name, at: new Date() })
        .onConflictDoNothing()
        .run();
    },
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
    splitContinuations: () => {
      const live = and(
        isNull(instances.endIntent),
        notInArray(instances.status, ["stopped", "discarded", "error"])
      );
      const running = new Set(
        db
          .select({ id: instances.id })
          .from(instances)
          .where(live)
          .all()
          .map((row) => row.id)
      );
      const folded = new Set(
        db
          .select({ id: instanceAliases.id })
          .from(instanceAliases)
          .all()
          .map((row) => row.id)
      );
      const lines = new Map<string, string[]>();
      for (const event of db
        .select({ id: limitEvents.id, instanceId: limitEvents.instanceId })
        .from(limitEvents)
        .where(sql`json_extract(${limitEvents.move}, '$.kind') = 'continued'`)
        .all()) {
        if (running.has(event.instanceId)) {
          lines.set(event.instanceId, [
            ...(lines.get(event.instanceId) ?? []),
            event.id,
          ]);
        }
      }
      return [...lines].flatMap(([targetId, ids]) => {
        const named = new Set(
          conversationsOf(db, targetId).flatMap((one) =>
            one.next ? [one.next] : []
          )
        );
        if (ids.every((id) => named.has(id))) {
          return [];
        }
        const [first] = db
          .select({ body: sentMessages.body })
          .from(sentMessages)
          .where(eq(sentMessages.instanceId, targetId))
          .orderBy(asc(sentMessages.acceptedAt))
          .limit(1)
          .all();
        const origin = first?.body?.origin;
        const sourceId =
          origin?.kind === "peer" ? origin.fromSession : undefined;
        return sourceId &&
          sourceId !== targetId &&
          running.has(sourceId) &&
          !folded.has(sourceId)
          ? [{ sourceId, targetId }]
          : [];
      });
    },
    foldContinued: (from, to) =>
      db.transaction((tx) => {
        tx.update(instanceAliases)
          .set({ instanceId: to })
          .where(eq(instanceAliases.instanceId, from))
          .run();
        tx.insert(instanceAliases)
          .values({ id: from, instanceId: to, folded: true })
          .onConflictDoUpdate({
            target: instanceAliases.id,
            set: { instanceId: to, folded: true },
          })
          .run();
        // Nothing a process lost is failed in a live fold: the hub owes what
        // `from` was handed and never read before it folds (server.ts
        // `foldContinued`).
        return foldInto(tx, to, [from], () => false);
      }),
    markSeen: (instanceIds, at) =>
      instanceIds.length > 0
        ? db
            .update(instances)
            .set({ seenAt: at })
            .where(inArray(instances.id, instanceIds))
            .returning()
            .all()
        : [],
    markDone: (instanceIds, at) => {
      if (instanceIds.length > 0) {
        db.update(instances)
          .set({ doneAt: at })
          .where(inArray(instances.id, instanceIds))
          .run();
      }
    },
    noteWrote: (id, at) =>
      db
        .update(instances)
        .set({ wroteAt: at })
        .where(eq(instances.id, id))
        .returning({ id: instances.id })
        .all().length > 0,
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
    noteInstanceSession: (
      id,
      sessionId,
      cwd,
      tooling,
      commands,
      placeAt = store.projectHolding
    ) => {
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
      db.transaction((tx) => {
        const before = tx
          .select({
            sessionId: instances.sessionId,
            projectId: instances.projectId,
            machineId: instances.machineId,
            parentInstanceId: instances.parentInstanceId,
            harness: instances.harness,
            model: instances.model,
            accountId: instances.accountId,
          })
          .from(instances)
          .where(eq(instances.id, id))
          .get();
        // A row its start found no project for, and whose folder only its
        // machine could resolve (a `~` start), is placed by that folder now:
        // the place holding it most closely, once. A session under a parent
        // keeps its parent's, none included.
        const placed =
          cwd &&
          before &&
          before.sessionId === null &&
          before.projectId === null &&
          before.parentInstanceId === null
            ? placeAt(before.machineId, cwd)
            : undefined;
        if (before) {
          keepReplacedConversation(tx, id, before, sessionId);
        }
        tx.update(instances)
          .set({
            sessionId,
            ...(cwd
              ? {
                  cwd: sql`CASE WHEN ${instances.sessionId} IS NULL THEN ${cwd} ELSE ${instances.cwd} END`,
                }
              : {}),
            ...(placed
              ? {
                  projectId: sql`COALESCE(${instances.projectId}, ${placed})`,
                }
              : {}),
            ...(tooling ? { tooling } : {}),
            ...(commands ? { commands } : {}),
          })
          .where(eq(instances.id, id))
          .run();
      });
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
          .set({
            status: "error",
            lastError: CLAUDE_CONVERSATION_GONE,
            lastErrorKind: "conversation-gone",
          })
          .where(
            and(
              eq(instances.machineId, machineId),
              eq(instances.machineRemoved, false),
              inArray(instances.harness, CATALOG_PROVES_GONE_HARNESSES),
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
          .set({ status: "running", lastError: null, lastErrorKind: null })
          .where(
            and(
              eq(instances.machineId, machineId),
              // Every state a live process can be wrongly filed under — a
              // demotion while the machine was unreachable, a spawn never
              // confirmed, a nap the daemon has since woken from. Not
              // `stopped`/`discarded`: those are decisions, and a daemon still
              // holding a process the operator asked to end is a bug to fix on
              // the daemon, not a status to overwrite here.
              inArray(instances.status, MISFILED_LIVE),
              inArray(instances.id, liveIds)
            )
          )
          .run();
      }

      const orphans = claimingProcesses(
        machineId,
        ["running", "starting", "unknown"],
        liveIds
      );

      const catalog = resumable && new Set(resumable);
      const held = new Set(heldIds);
      const settled = orphans.map((row) => {
        // Its process outlived the daemon that let go of it, and the attach
        // the caller sends next is how it comes back (`restore`). A process
        // is no nap: filed asleep, the asks its attach replays were refused
        // at admission, and its CLI waited on a question nobody was shown.
        if (held.has(row.id)) {
          db.update(instances)
            .set({ status: "starting", lastError: null, lastErrorKind: null })
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
          !traitsOf(row.harness).listsAllConversations ||
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
              ? { status: "sleeping", lastError: null, lastErrorKind: null }
              : {
                  status: "error",
                  lastError: RESTART_LOST,
                  lastErrorKind: "restart-lost",
                }
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
              .set({ status: "running", lastError: null, lastErrorKind: null })
              .where(
                and(
                  eq(instances.machineId, machineId),
                  eq(instances.machineRemoved, false),
                  inArray(instances.id, liveIds),
                  // Note the omission of `running`: a row already at `running`
                  // that the beat lists has not moved, and writing it anyway
                  // would touch it every 15s, erasing the one column that says
                  // when a session last did something.
                  inArray(instances.status, MISFILED_LIVE)
                )
              )
              .returning({ id: instances.id })
              .all()
              .map((row) => row.id);

      // The beat's silence, which is the half that was missing. A row claiming a
      // process the machine neither lists nor holds has no process; the only
      // question left is whether the conversation outlived it.
      const gone = claimingProcesses(machineId, ["running", "starting"], alive)
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
          .set({ status: "sleeping", lastError: null, lastErrorKind: null })
          .where(eq(instances.id, row.id))
          .run();
      }
      return { promoted, settled: gone };
    },
    // A process coming up is liveness, not the session doing something.
    markInstanceLive: (id) =>
      db
        .update(instances)
        .set({ status: "running", lastError: null, lastErrorKind: null })
        .where(
          and(eq(instances.id, id), inArray(instances.status, MISFILED_LIVE))
        )
        .returning({ id: instances.id })
        .all().length > 0,
    markInstanceAttaching: (id) =>
      db
        .update(instances)
        .set({ status: "starting", lastError: null, lastErrorKind: null })
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
        .set({ status: "sleeping", lastError: null, lastErrorKind: null })
        .where(eq(instances.id, id))
        .run();
      return true;
    },
    // `updatedAt` is deliberately untouched by both halves: reclassifying a row
    // is the hub admitting what it does not know, not the session doing
    // anything, and `updatedAt` is what the restore horizon reads to tell a
    // session that stopped a minute ago from one that stopped last Tuesday.
    // Stamping it here would make every row on the machine look freshly alive.
    sweepBootStatuses: () =>
      db
        .update(instances)
        .set({ status: "unknown" })
        .where(
          and(
            isNull(instances.owedSpawn),
            inArray(instances.status, ["running", "starting"])
          )
        )
        .returning({ id: instances.id })
        .all().length,
    agentTools: toolsOf,
    // The cells reported replace their own; a tool the report did not name
    // keeps what it had.
    mergeAgentTools: (machineId, statuses) => {
      putToolCells(machineId, statuses);
    },
    // The harnesses reported replace their own rows, read after the ones this
    // report did not name; every other harness stays as it was.
    mergeAgentHarnesses: (machineId, reports) => {
      db.transaction((tx) => {
        if (!machineKept(tx, machineId)) {
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
    // Its id and hostname alone: a machine named in a sentence read every
    // machine's row whole (its fleet, its harnesses, its tools), once per
    // session an account wake named, at each hub start on a copy of the
    // live database.
    namedMachines: () =>
      db
        .select({ machineId: agents.machineId, hostname: agents.hostname })
        .from(agents)
        .orderBy(asc(agents.createdAt), asc(agents.machineId))
        .all(),
    setAgentFleet: (machineId, report) => {
      db.update(agents)
        .set({ fleet: report })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentFleetItems: (machineId, items) => {
      db.update(agents)
        .set({ fleetItems: items })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    agentFleetGeneration: (machineId) => {
      const row = db
        .select({
          generation: agents.fleetGeneration,
          fingerprint: agents.fleetFingerprint,
        })
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      return row ?? { generation: 0, fingerprint: null };
    },
    setAgentFleetGeneration: (machineId, generation, fingerprint) => {
      db.update(agents)
        .set({ fleetGeneration: generation, fleetFingerprint: fingerprint })
        .where(eq(agents.machineId, machineId))
        .run();
    },
    setAgentFleetSync: (machineId, outcome) => {
      db.update(agents)
        .set({ fleetSync: outcome })
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
    listAgents: () =>
      agentRows(
        db
          .select()
          .from(agents)
          // Join order: core `machineCalled` numbers machines that share a name by it.
          .orderBy(asc(agents.createdAt), asc(agents.machineId))
          .all()
      ),
    agentRow: (machineId) => {
      const row = db
        .select()
        .from(agents)
        .where(eq(agents.machineId, machineId))
        .get();
      return row ? agentRows([row], machineId)[0] : undefined;
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
    listInstancesOn: (machineId) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(and(eq(instances.machineId, machineId), listedInstances()))
        .all()
        .map(asListed),
    instancesOnAccount: (accountId) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(and(eq(instances.accountId, accountId), keptInstances()))
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
    boardSessionsWrapping: (sessionIds) => {
      const rows: BoardInstanceRow[] = [];
      // In bounded lists: a machine's catalog is a thousand keys and more.
      for (let at = 0; at < sessionIds.length; at += KEYS_PER_READ) {
        rows.push(
          ...db
            .select(boardColumns)
            .from(instances)
            .where(
              and(
                inArray(
                  instances.sessionId,
                  sessionIds.slice(at, at + KEYS_PER_READ)
                ),
                keptInstances()
              )
            )
            .all()
            .map(asListed)
        );
      }
      return rows;
    },
    boardAncestors: (ids) =>
      ids.length === 0
        ? []
        : db
            .select(boardColumns)
            .from(instances)
            .where(and(inArray(instances.id, ids), keptInstances()))
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
            inArray(instances.harness, ACCOUNT_DIR_HARNESSES),
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
        .where(and(inArray(instances.id, ids), keptInstances()))
        .all();
    },
    instanceBySessionId: (sessionId) =>
      db
        .select(publicColumns)
        .from(instances)
        .where(and(eq(instances.sessionId, sessionId), keptInstances()))
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
        // What it was called and when it went, for the rows that keep its id.
        const named = tx
          .select({ hostname: agents.hostname })
          .from(agents)
          .where(eq(agents.machineId, machineId))
          .get();
        if (named) {
          const removed = {
            machineId,
            hostname: named.hostname,
            removedAt: new Date(),
          };
          tx.insert(removedMachines)
            .values(removed)
            .onConflictDoUpdate({
              target: removedMachines.machineId,
              set: removed,
            })
            .run();
        }
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
    rekeyMachine: (from, to) =>
      db.transaction((tx) => {
        const moved: Record<string, number> = {};
        const note: Moved = (what, count) => {
          if (count > 0) {
            moved[what] = (moved[what] ?? 0) + count;
          }
        };
        moveMachineRow(tx, from, to, note);
        for (const [table, column, keyed] of MACHINE_MOVED) {
          const name = sql.identifier(table);
          const by = sql.identifier(column);
          const before = naming(tx, table, column, from);
          tx.run(
            sql`UPDATE OR IGNORE ${name} SET ${by} = ${to} WHERE ${by} = ${from}`
          );
          if (keyed) {
            tx.run(sql`DELETE FROM ${name} WHERE ${by} = ${from}`);
          }
          note(table, before);
        }
        // A bucket's id leads with its machine's (`putUsageBuckets`), so a
        // re-report from the new id lands on the bucket it moved to.
        note("usage_buckets", naming(tx, "usage_buckets", "machine_id", from));
        tx.run(
          sql`UPDATE OR IGNORE usage_buckets SET machine_id = ${to}, id = ${to} || substr(id, ${from.length + 1}) WHERE machine_id = ${from} AND substr(id, 1, ${from.length + 1}) = ${`${from}:`}`
        );
        tx.run(
          sql`UPDATE OR IGNORE usage_buckets SET machine_id = ${to} WHERE machine_id = ${from}`
        );
        tx.run(sql`DELETE FROM usage_buckets WHERE machine_id = ${from}`);
        return moved;
      }),
    removedMachines: () => db.select().from(removedMachines).all(),
    accounts: accountsDb(db),
    areas: areasStore,
    turnUsage: turnUsageDb(db),
    capabilityCalls: capabilityCallsDb(db),
    toolCallKeys: toolCallKeysDb(db),
    turnCuts: turnCutsDb(db),
    treeStops: treeStopsDb(db),
    atLimit: atLimitDb(db),
    designChecks: designChecksDb(db),
    designOffers: designOffersDb(db),
    trim: trimDb(db),
    lfsOffers: lfsOffersDb(db),
    blocks: blocksDb(db),
    decides: decidesDb(db, delegateTypes),
    starters: startersDb(db),
    routines: routinesDb(db),
    connections: connectionsDb(db),
    ingress: ingressDb(db),
    relays: relaysDb(db),
    asks: asksDb(db),
    sshMachines: sshMachinesDb(db, hubId),
    memoryFacts: memoryFactsDb(db),
    trackers: trackersDb(db),
    taskLinks: taskLinksOf,
    hubAuth: hubAuthDb(db),
    artifacts: artifactsDb(db, core),
    find: findDb(db),
    previews: previewsDb(db),
    moveEndings: moveEndingsDb(db),
    sessionTasks: sessionTasksDb(db),
    owedMoves: owedMovesDb(db),
    previewPasses: previewPassesDb(db),
    streamRelay: streamRelayDb(db),
    browsers: browsersDb(db),
    actions: actionsDb(db),

    trash: trashDb(db),
    forgetProject: forgetting.forget,
    restoreProject: forgetting.restore,
    projectWork: projectWorkDb(db),
  };
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
