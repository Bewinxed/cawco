import { dirname } from "node:path";
import { makeFolderSync } from "@cawco/core/folders";
import { getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Context, Effect, Layer } from "effect";
import { DB_PATH } from "../config";
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
import {
  type ArtifactDocumentsDb,
  artifactDocumentsDb,
} from "./artifact-documents";
import type { ArtifactListenersDb } from "./artifacts";
import { type ArtifactsDb, artifactsDb } from "./artifacts";
import { type AskPartsDb, type AsksDb, askPartsDb, asksDb } from "./asks";
import { type AtLimitDb, atLimitDb } from "./at-limit";
import { type BlocksDb, blocksDb } from "./blocks";
import { boardChangeLog, hearWrites } from "./board-log";
import { type BrowsersDb, browsersDb } from "./browsers";
import { type CapabilityCallsDb, capabilityCallsDb } from "./capability-calls";
import { type ConnectionsDb, connectionsDb } from "./connections";
import { type ContinuationsDb, continuationsDb } from "./continuations";
import { type DbCore, dbCore } from "./core";
import { type DecidesDb, decidesDb } from "./decides";
import { type DelegateEventsDb, delegateEventsDb } from "./delegate-events";
import { type DelegateTypesShape, makeDelegateTypes } from "./delegate-types";
import { type DesignChecksDb, designChecksDb } from "./design-checks";
import { type DesignOffersDb, designOffersDb } from "./design-offers";
import {
  type FindDb,
  type FindSettingsDb,
  findDb,
  findSettingsDb,
} from "./find";
import { type FleetCatalogDb, fleetCatalogDb } from "./fleet-catalog";
import { type FoldDb, foldDb } from "./fold";
import { type FolderMovesDb, folderMovesDb } from "./folder-moves";
import { type ForgetDb, forgetDb, schemaTables } from "./forget";
import { type HeldPicksDb, heldPicksDb } from "./held-picks";
import { type HubAuthDb, hubAuthDb } from "./hub-auth";
import { type HubSettingsDb, hubSettingsDb } from "./hub-settings";
import { type IngressDb, ingressDb } from "./ingress";
import { type InstancesDb, instancesDb } from "./instances";
import { type IntakeDb, intakeDb } from "./intake";
import { type LfsRefusalsDb, lfsRefusalsDb } from "./lfs-refusals";
import { type MachinesDb, machinesDb } from "./machines";
import { type McpServersDb, mcpServersDb } from "./mcp-servers";
import {
  applyMigrations,
  type DataMigrationsDb,
  dataMigrationsDb,
  runOpenedSteps,
} from "./migrate";
import { type MoveEndingsDb, moveEndingsDb } from "./move-endings";
import { type MovesDb, movesDb } from "./moves";
import { type OwedMovesDb, owedMovesDb } from "./owed-moves";
import { type PageStoresDb, pageStoresDb } from "./page-stores";
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
import { type ReturnRecapDb, returnRecapDb } from "./return-recap";
import { type RulesDb, rulesDb } from "./rules";
import { type SendsDb, sendsDb } from "./sends";
import type { Revocations } from "./session-identity";
import { type SessionIdentityDb, sessionIdentityDb } from "./session-identity";
import { type SessionLinesDb, sessionLinesDb } from "./session-lines";
import { type SessionPlansDb, sessionPlansDb } from "./session-plans";
import { type SessionTasksDb, sessionTasksDb } from "./session-tasks";
import { type SshMachinesDb, sshMachinesDb } from "./ssh-machines";
import { type StagePlacesDb, stagePlacesDb } from "./stage-places";
import { type StartersDb, startersDb } from "./starters";
import { explainStatements, type StatementPlans } from "./statement-plans";
import { type StreamRelayDb, streamRelayDb } from "./stream-relay";
import { type TaskIndexDb, taskIndexDb } from "./task-index";
import type { TaskLinksDb } from "./task-links";
import { type TaskTriggersDb, taskTriggersDb } from "./task-triggers";
import { type TaskWaitFlagsDb, taskWaitFlagsDb } from "./task-wait-flags";
import { type ToolCallKeysDb, toolCallKeysDb } from "./tool-call-keys";
import { type TrackersDb, trackersDb } from "./trackers";
import { type TrashDb, trashDb } from "./trash";
import { type TreeStopsDb, treeStopsDb } from "./tree-stops";
import { type TriggersDb, triggersDb } from "./triggers";
import { type TrimDb, trimDb } from "./trim";
import { type TurnCutsDb, turnCutsDb } from "./turn-cuts";
import { type TurnUsageDb, turnUsageDb } from "./turn-usage";
import { type UsageDb, usageDb } from "./usage";
import { type UsagePeriodsDb, usagePeriodsDb } from "./usage-periods";
import { closeWal, useWal } from "./wal";

/** The store's own members and the stores it wires in. */
interface HubStore {
  /** Accounts, where they are signed in, how they route, and their limits. */
  readonly accounts: AccountsDb;
  /** Approved actions: one exact tool call each, run once (actions.ts). */
  readonly actions: ActionsDb;
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
  /** The fleet's browsers, per machine (browsers.ts). */
  readonly browsers: BrowsersDb;
  /** Each session's skill, tool and MCP server calls (usage-count.ts, capability-calls.ts). */
  readonly capabilityCalls: CapabilityCallsDb;
  /** Closes the connection: the hub's lifetime's last release (lifetime.ts). */
  readonly close: () => void;
  /** Connections and the projects that grant them (connections.ts). */
  readonly connections: ConnectionsDb;
  /** Who decides: the fleet's table, its members and kinds, and where every card went (decides.ts). */
  readonly decides: DecidesDb;
  /** The fleet's delegate types (db/delegate-types.ts), on this connection. */
  readonly delegateTypes: DelegateTypesShape;
  /** Design checks and design proposals (design-verify.ts, design-system.ts). */
  readonly designChecks: DesignChecksDb;
  /** Caw's one design-system offer per project (design-offers.ts). */
  readonly designOffers: DesignOffersDb;
  /** What each page's and canvas's document carries of the hub's state (artifact-documents.ts). */
  readonly documents: ArtifactDocumentsDb;
  /** What the find engine reads (find.ts), and when the person last looked at each session. */
  readonly find: FindDb;
  /** Moves of a project's folder, files and all (folder-moves.ts). */
  readonly folderMoves: FolderMovesDb;
  /**
   * A project forgotten, every row its delete takes and every link it cuts
   * handed to `keep` first (forget.ts); and those rows put back.
   */
  readonly forgetProject: ForgetDb["forget"];
  /** The setting picks held for sessions' processes on machines that are away (held-picks.ts). */
  readonly heldPicks: HeldPicksDb;
  /** Who may call the hub: the pairing setting, the person's devices, the machines' keys (hub-auth.ts). */
  readonly hubAuth: HubAuthDb;
  /** Inbound events, their routes and the pollers that bring them in (event-routes.ts, clock.ts). */
  readonly ingress: IngressDb;
  /** The door's store: inbound events and the mirror's content, once each (intake.ts). */
  readonly intake: IntakeDb;
  /** LFS servers a checkout named that the project never declared (routes/lfs.ts). */
  readonly lfsRefusals: LfsRefusalsDb;
  /** When briefs last carried a project's knowledge lessons (memory.ts). */
  /** What each session's move ended, until it is told (move-endings.ts). */
  readonly moveEndings: MoveEndingsDb;
  /**
   * Hears a write that logged a change the board or the views read
   * (db/board-log.ts), once the stack that wrote it empties: the board takes
   * its change log after one. A write that changed none of it is not heard.
   */
  readonly onLogged: (listener: () => void) => void;
  /** The moves sessions owe to their next launch, one per session (owed-moves.ts). */
  readonly owedMoves: OwedMovesDb;
  /** Pages' stores' update logs (page-stores.ts). */
  readonly pageStores: PageStoresDb;
  /** Host mode's preview passes, one per browser (preview-access.ts). */
  readonly previewPasses: PreviewPassesDb;
  /** Each session's preview port, and the fleet's preview mode (preview.ts). */
  readonly previews: PreviewsDb;
  /** A project's sessions and workspaces, read and dropped as it is deleted for good (project-work.ts). */
  readonly projectWork: ProjectWorkDb;
  /** Relays: a project's public webhook paths through Funnel (relay.ts). */
  readonly relays: RelaysDb;
  readonly restoreProject: ForgetDb["restore"];
  /** Rows a project's restore held back, put back (forget.ts `retry`). */
  readonly retryHeldRows: ForgetDb["retry"];
  /** What the person's return reads: tasks' moves, landed work, the plans naming a task (return-recap.ts). */
  readonly returnRecap: ReturnRecapDb;
  /** Routines' triggers and runs (routines.ts). */
  readonly routines: TaskTriggersDb;
  /** The background tasks each Claude session's process runs now (session-tasks.ts). */
  readonly sessionTasks: SessionTasksDb;
  /** The machines the hub added over SSH, and the connection it holds to each (ssh-tunnels.ts). */
  readonly sshMachines: SshMachinesDb;
  /** The folder each place a port preview is staged from stands for (stage-places.ts). */
  readonly stagePlaces: StagePlacesDb;
  /** A project's starters as last written, and what was done with them (project-starters.ts). */
  readonly starters: StartersDb;
  /**
   * Each statement the hub's connection prepares, explained once from its
   * `arm` (at listen): a scan of a large table is heard (statement-plans.ts).
   */
  readonly statementPlans: StatementPlans;
  /** The fleet's stream relay (stream-relay.ts). */
  readonly streamRelay: StreamRelayDb;
  /** The external items tasks link, and the comments carried from them (task-links.ts). */
  readonly taskLinks: TaskLinksDb;
  /** The task waits on GitHub the person was told can no longer settle (task-wait-flags.ts). */
  readonly taskWaitFlags: TaskWaitFlagsDb;
  /** Each relayed tool call taken under an idempotency key, and its answer (tool-call-keys.ts). */
  readonly toolCallKeys: ToolCallKeysDb;
  /** Trackers: a project's binding to GitHub Issues or Linear, and what its tasks and their issues agreed on (sync.ts). */
  readonly trackers: TrackersDb;
  /** Deleted config items, kept whole for their Undo (trash.ts). */
  readonly trash: TrashDb;
  /** The stops that walk a delegation tree, a row per session until it ended (tree-stops.ts). */
  readonly treeStops: TreeStopsDb;
  /** Each kind of trigger's settings, the fleet's and each project's, and the triggers held on a project (triggers.ts). */
  readonly triggers: TriggersDb;
  /** The unused skills and servers routine's suggestion answers and kept items (unused-trim.ts). */
  readonly trim: TrimDb;
  /** Every turn the hub cut, and why (turn-cuts.ts). */
  readonly turnCuts: TurnCutsDb;
  /** Each completed turn's tokens, on the account it ran on. */
  readonly turnUsage: TurnUsageDb;
  /** Each account's window periods, kept as readings and turns arrive (usage-periods.ts). */
  readonly usagePeriods: UsagePeriodsDb;
}

export type DbShape = DataMigrationsDb &
  FoldDb &
  InstancesDb &
  MachinesDb &
  WorkRowsDb &
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
  makeFolderSync(dirname(path));
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
  // WHAT THE CONNECTION KEEPS IN MEMORY. SQLite's page cache defaults to
  // 2 MB ("the default suggested cache size is -2000, which means the cache
  // size is limited to 2048000 bytes of memory", sqlite.org/pragma.html
  // #pragma_cache_size), so each read of more than that read the file again
  // a page at a time; 64 MiB keeps the tables hot reads walk in memory.
  // `mmap_size`: reads take pages from the file's mapping, with no copy
  // "between kernel space and user space" (sqlite.org/mmap.html); 1 GiB
  // covers the whole file (950 MB on the live hub, 2026-11-19). An I/O error on a mapped page ends the process
  // (mmap.html), as a failed read already stops the hub. `temp_store =
  // MEMORY`: a sort or a temporary index of a statement stays off the disk.
  // Each is the connection's own, so it is set at every open.
  db.$client.run("PRAGMA cache_size = -65536");
  db.$client.run("PRAGMA mmap_size = 1073741824");
  db.$client.run("PRAGMA temp_store = MEMORY");
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
  await applyMigrations(db, db.$client, path);

  const boardLog = boardChangeLog(db.$client);
  // Every write heard from here on, before any reader below prepares its
  // own statements. Its listeners hear it only when it logged a change the
  // board or the views read: once the stack that wrote empties (a
  // transaction's writes are one, and one rolled back logged nothing), the
  // log is asked whether it holds one. A write that changes nothing they
  // read (a usage bucket, a turn's cost, a doc's update log, an UPDATE that
  // sets what was there) wakes nothing: each once wanted a board publish,
  // 58 a second on obelisk while its sessions streamed (2026-11-19).
  const loggedListeners: (() => void)[] = [];
  let looking = false;
  hearWrites(db.$client, () => {
    if (looking) {
      return;
    }
    looking = true;
    queueMicrotask(() => {
      looking = false;
      if (!boardLog.logged()) {
        return;
      }
      for (const listener of loggedListeners) {
        listener();
      }
    });
  });
  // Every statement prepared from here on, explained once it is armed.
  const statementPlans = explainStatements(db.$client);
  const core: DbCore = dbCore(db, boardLog.take);
  // The fleet's delegate types, seeded once.
  const delegateTypes = makeDelegateTypes(db);

  runOpenedSteps(db);

  /** A project's forget and restore, over every table its keys reach (forget.ts). */
  const forgetting = forgetDb(db, core.dropArtifacts, await schemaTables());
  const store: DbShape = {
    ...dataMigrationsDb(core),
    ...foldDb(core),
    ...instancesDb(core),
    ...machinesDb(core),
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
    onLogged: (listener) => {
      loggedListeners.push(listener);
    },
    statementPlans,
    delegateTypes,
    atomically: (run) => db.transaction(() => run()),
    accounts: accountsDb(db),
    areas: core.areasStore,
    turnUsage: turnUsageDb(db),
    usagePeriods: usagePeriodsDb(db),
    capabilityCalls: capabilityCallsDb(db),
    toolCallKeys: toolCallKeysDb(db),
    turnCuts: turnCutsDb(db),
    treeStops: treeStopsDb(db),
    atLimit: atLimitDb(db),
    designChecks: designChecksDb(db),
    designOffers: designOffersDb(db),
    returnRecap: returnRecapDb(db),
    trim: trimDb(db),
    triggers: triggersDb(db),
    lfsRefusals: lfsRefusalsDb(db),
    blocks: blocksDb(db),
    decides: decidesDb(db, delegateTypes),
    starters: startersDb(db),
    routines: taskTriggersDb(db),
    connections: connectionsDb(db),
    ingress: ingressDb(db),
    intake: intakeDb(db),
    relays: relaysDb(db),
    asks: asksDb(db),
    sshMachines: sshMachinesDb(db, hubId),
    trackers: trackersDb(db),
    taskLinks: core.taskLinksOf,
    taskWaitFlags: taskWaitFlagsDb(db),
    hubAuth: hubAuthDb(db),
    artifacts: artifactsDb(db, core),
    find: findDb(db),
    previews: previewsDb(db),
    moveEndings: moveEndingsDb(db),
    folderMoves: folderMovesDb(db),
    sessionTasks: sessionTasksDb(db),
    owedMoves: owedMovesDb(db),
    heldPicks: heldPicksDb(db),
    previewPasses: previewPassesDb(db),
    documents: artifactDocumentsDb(db),
    pageStores: pageStoresDb(db),
    stagePlaces: stagePlacesDb(db),
    streamRelay: streamRelayDb(db),
    browsers: browsersDb(db),
    actions: actionsDb(db),

    trash: trashDb(db),
    forgetProject: forgetting.forget,
    restoreProject: forgetting.restore,
    retryHeldRows: forgetting.retry,
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
