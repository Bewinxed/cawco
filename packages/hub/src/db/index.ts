import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { FILE_HASH_SCHEME } from "@cawco/core/file-hash";
import type { SkillFile } from "@cawco/core/fleet";
import { ownIdentity } from "@cawco/core/process-identity";
import { runtimeTree, standalone } from "@cawco/core/runtime";
import { writeStateFileSync } from "@cawco/core/state-file";
import { eq, getTableName } from "drizzle-orm";
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
import { boardChangeLog } from "./board-log";
import { type BrowsersDb, browsersDb } from "./browsers";
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
import { type FoldDb, foldDb } from "./fold";
import { type ForgetDb, forgetDb } from "./forget";
import { type HubAuthDb, hubAuthDb } from "./hub-auth";
import { type HubSettingsDb, hubSettingsDb } from "./hub-settings";
import { type IngressDb, ingressDb } from "./ingress";
import { type InstancesDb, instancesDb } from "./instances";
import { type LfsOffersDb, lfsOffersDb } from "./lfs-offers";
import { type MachinesDb, machinesDb } from "./machines";
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
import { dataMigrations, fleetSkillHistory, plugins, skills } from "./schema";
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
import { type TurnCutsDb, turnCutsDb } from "./turn-cuts";
import { type TurnUsageDb, turnUsageDb } from "./turn-usage";
import { type UsageDb, usageDb } from "./usage";
import { closeWal, useWal } from "./wal";

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

export type { MachineLineKind } from "./schema";

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
  /** Closes the connection: the hub's lifetime's last release (lifetime.ts). */
  readonly close: () => void;
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
  /** Who decides: the fleet's table, its members and kinds, and where every card went (decides.ts). */
  readonly decides: DecidesDb;
  /** The fleet's delegate types (delegate-types.ts), on this connection. */
  readonly delegateTypes: DelegateTypesShape;
  /** Design checks and design proposals (design-verify.ts, design-system.ts). */
  readonly designChecks: DesignChecksDb;
  /** Caw's one design-system offer per project (design-offers.ts). */
  readonly designOffers: DesignOffersDb;
  /** What the find engine reads (find.ts), and when the person last looked at each session. */
  readonly find: FindDb;
  /**
   * A project forgotten, every row its delete takes and every link it cuts
   * handed to `keep` first (forget.ts); and those rows put back.
   */
  readonly forgetProject: ForgetDb["forget"];
  /** Who may call the hub: the pairing setting, the person's devices, the machines' keys (hub-auth.ts). */
  readonly hubAuth: HubAuthDb;
  /** Inbound events, their routes and the pollers that bring them in (ingress.ts). */
  readonly ingress: IngressDb;
  /** Git LFS offered for a place's left-out large files (lfs-offers.ts). */
  readonly lfsOffers: LfsOffersDb;
  /** Marks the one-time data migration `name` run: it never runs again. */
  readonly markDataMigrated: (name: string) => void;
  /** A project's fact uses and declined rewrites (memory.ts). */
  readonly memoryFacts: MemoryFactsDb;
  /** What each session's move ended, until it is told (move-endings.ts). */
  readonly moveEndings: MoveEndingsDb;
  /** The moves sessions owe to their next launch, one per session (owed-moves.ts). */
  readonly owedMoves: OwedMovesDb;
  /** Host mode's preview passes, one per browser (preview-access.ts). */
  readonly previewPasses: PreviewPassesDb;
  /** Each session's preview port, and the fleet's preview mode (preview.ts). */
  readonly previews: PreviewsDb;
  /** A project's sessions and workspaces, read and dropped as it is deleted for good (project-work.ts). */
  readonly projectWork: ProjectWorkDb;
  /** Relays: a project's public webhook paths through Funnel (relay.ts). */
  readonly relays: RelaysDb;
  readonly restoreProject: ForgetDb["restore"];
  /** Routines and their runs (routines.ts). */
  readonly routines: RoutinesDb;
  /** The background tasks each Claude session's process runs now (session-tasks.ts). */
  readonly sessionTasks: SessionTasksDb;
  /** The machines the hub added over SSH, and the connection it holds to each (ssh-tunnels.ts). */
  readonly sshMachines: SshMachinesDb;
  /** A project's starters as last written, and what was done with them (project-starters.ts). */
  readonly starters: StartersDb;
  /** The fleet's stream relay (stream-relay.ts). */
  readonly streamRelay: StreamRelayDb;
  /** The external items tasks link, and the comments carried from them (task-links.ts). */
  readonly taskLinks: TaskLinksDb;
  /** Each relayed tool call taken under an idempotency key, and its answer (tool-call-keys.ts). */
  readonly toolCallKeys: ToolCallKeysDb;
  /** Trackers: a project's binding to GitHub Issues or Linear, and what its tasks and their issues agreed on (tracker.ts). */
  readonly trackers: TrackersDb;
  /** Deleted config items, kept whole for their Undo (trash.ts). */
  readonly trash: TrashDb;
  /** The stops that walk a delegation tree, a row per session until it ended (tree-stops.ts). */
  readonly treeStops: TreeStopsDb;
  /** Every turn the hub cut, and why (turn-cuts.ts). */
  readonly turnCuts: TurnCutsDb;
  /** Each completed turn's tokens, on the account it ran on. */
  readonly turnUsage: TurnUsageDb;
}

export type DbShape = FoldDb &
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

  const core: DbCore = dbCore(db, boardChangeLog(db.$client));
  // The fleet's delegate types: their own table, on this connection, the
  // hub's one writer to its file.
  const delegateTypes = makeDelegateTypes(db.$client);

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

  /** A project's forget and restore, over every table its keys reach (forget.ts). */
  const forgetting = forgetDb(db, core.dropArtifacts);
  const store: DbShape = {
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
    delegateTypes,
    atomically: (run) => db.transaction(() => run()),
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
    accounts: accountsDb(db),
    areas: core.areasStore,
    turnUsage: turnUsageDb(db),
    toolCallKeys: toolCallKeysDb(db),
    turnCuts: turnCutsDb(db),
    treeStops: treeStopsDb(db),
    atLimit: atLimitDb(db),
    designChecks: designChecksDb(db),
    designOffers: designOffersDb(db),
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
    taskLinks: core.taskLinksOf,
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
