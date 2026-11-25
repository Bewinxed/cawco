/**
 * Watches (provider spec §2.4, schema `watches`, `watch_cursors`): what the
 * poll loop (clock.ts) follows of a project and how it follows it.
 * Its connector polls are read in db/ingress.ts and its tracker binding in
 * db/trackers.ts, over the same rows.
 *
 * A project follows GitHub through a connection that reads GitHub's API
 * (core `readsGitHubApi`). Its GitHub watches are made at the two moments
 * that can start following, and nowhere else:
 * - a connection that reads GitHub's API names the project
 *   ({@link followGitHub}, from clock.ts `followConnection`): a watch of
 *   each github.com repository the project links;
 * - a github.com repository link is added to a project that follows GitHub
 *   ({@link followLink}, from db/projects.ts): a watch of that repository,
 *   with the connection the project follows by ({@link githubFollower}).
 * A repository the project no longer links keeps its watch and its cursors,
 * unread, until the project stops following.
 *
 * A project that some connection reading GitHub's API names keeps
 * following its repositories: when a watch's connection stops naming the
 * project, stops reading GitHub's API or is removed, the watch moves to the
 * connection the project follows by ({@link followConnectionOf}), and goes
 * only when there is none ({@link rehome}). A tracker binding's connection
 * reads its repository's watch while it syncs; the connection the poller
 * followed it by is kept beside it (`settings.pollerConnection`) and read
 * with again once the binding goes ({@link stopSyncing}).
 */
import { CONNECTION_AUTHS, readsGitHubApi } from "@cawco/core/connections";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  connectionProjects,
  connections,
  projectLinks,
  watchCursors,
  watches,
} from "./schema";
import type { WatchCursor, WatchSettings } from "./stored-types";

export type WatchRow = typeof watches.$inferSelect;

/** A transaction or the database: what the follow steps write with. */
type Writer = Pick<
  BunSQLiteDatabase,
  "delete" | "insert" | "select" | "update"
>;

export const GITHUB_HOST = "github.com";

/** The tracker sync's own streams, beside the GitHub poller's resources, until it reads the event poll. */
export const SYNC_STREAMS = {
  issues: "sync:issues",
  comments: "sync:comments",
} as const;

/** The providers whose watches the poll loop reads (clock.ts): a GitHub repository, a connector poll. */
const POLLED_PROVIDERS = ["github", "connection"] as const;

/** The auths a `github` connection reads GitHub's REST API with (core `readsGitHubApi`), as stored. */
const READS_GITHUB_API = CONNECTION_AUTHS.filter(readsGitHubApi);

/** The repository `owner/repo` a github.com link names, or nothing. */
const githubRepoOfLink = (remote: string): string | undefined => {
  const [host, owner, repo, ...rest] = remote.split("/");
  return host === GITHUB_HOST && owner && repo && rest.length === 0
    ? `${owner}/${repo}`
    : undefined;
};

/** The GitHub repositories, `owner/repo`, among a project's links, oldest first. */
export const githubReposOf = (links: readonly string[]): string[] =>
  links.flatMap((link) => githubRepoOfLink(link) ?? []);

/** One GitHub repository's watch of a project: `owner/repo` compared as GitHub does, without case. */
const githubWatchOf = (
  tx: Writer,
  projectId: string,
  repo: string
): WatchRow | undefined =>
  tx
    .select()
    .from(watches)
    .where(
      and(
        eq(watches.projectId, projectId),
        eq(watches.provider, "github"),
        eq(watches.host, GITHUB_HOST),
        sql`lower(${watches.container}) = lower(${repo})`
      )
    )
    .get();

/** The project's GitHub watches its poller reads, those that read nothing else first, oldest first. */
const followedOf = (tx: Writer, projectId: string): WatchRow[] =>
  tx
    .select()
    .from(watches)
    .where(
      and(
        eq(watches.projectId, projectId),
        eq(watches.provider, "github"),
        eq(watches.enabled, true)
      )
    )
    .orderBy(sql`${watches.sync} != 'off'`, asc(watches.createdAt))
    .all();

/** The connections that read GitHub's API and name project `projectId`, by name. */
const readersOf = (tx: Writer, projectId: string): string[] =>
  tx
    .select({ name: connections.name })
    .from(connections)
    .innerJoin(
      connectionProjects,
      eq(connectionProjects.connectionId, connections.id)
    )
    .where(
      and(
        eq(connectionProjects.projectId, projectId),
        sql`lower(trim(${connections.service})) = 'github'`,
        inArray(connections.auth, READS_GITHUB_API)
      )
    )
    .orderBy(asc(connections.name))
    .all()
    .map(({ name }) => name);

/**
 * The connection project `projectId` follows GitHub by from now, other
 * than `gone`: the first of `kept` that still reads GitHub's API and names
 * it, else its GitHub watches' (one that only follows first) that does,
 * else the first by name that does; nothing when none does.
 */
const followConnectionOf = (
  tx: Writer,
  projectId: string,
  kept: readonly (string | null | undefined)[],
  gone?: string
): string | undefined => {
  const readers = new Set(readersOf(tx, projectId));
  readers.delete(gone ?? "");
  return [
    ...kept,
    ...followedOf(tx, projectId).map((watch) => watch.connection),
    ...readers,
  ].find(
    (name): name is string =>
      name !== null && name !== undefined && readers.has(name)
  );
};

/**
 * The connection project `projectId` follows GitHub by, for a repository
 * linked to it: its GitHub watches' (one that only follows first), else
 * the first connection by name that reads GitHub's API and names it;
 * nothing when neither.
 */
const githubFollower = (tx: Writer, projectId: string): string | undefined =>
  followedOf(tx, projectId)[0]?.connection ?? readersOf(tx, projectId)[0];

/** A new GitHub watch the poller reads, of `repo` through `connection`. */
const madeGitHubWatch = (
  tx: Writer,
  projectId: string,
  repo: string,
  connection: string
): void => {
  tx.insert(watches)
    .values({
      id: crypto.randomUUID(),
      projectId,
      provider: "github",
      host: GITHUB_HOST,
      container: repo,
      containerName: repo,
      containerUrl: `https://${GITHUB_HOST}/${repo}`,
      connection,
      sync: "off",
      settings: {},
      enabled: true,
      createdBy: "owner",
      createdAt: new Date(),
    })
    .run();
};

/** The poller reads `repo` of the project: its watch made, or one made by binding a tracker followed too. */
const watchRepo = (
  tx: Writer,
  projectId: string,
  repo: string,
  connection: string
): void => {
  const was = githubWatchOf(tx, projectId, repo);
  if (!was) {
    madeGitHubWatch(tx, projectId, repo, connection);
  } else if (!was.enabled) {
    tx.update(watches)
      .set({ enabled: true })
      .where(eq(watches.id, was.id))
      .run();
  }
};

/** Each github.com repository project `projectId` links, oldest first. */
const linkedRepos = (tx: Writer, projectId: string): string[] =>
  tx
    .select({ remote: projectLinks.remote })
    .from(projectLinks)
    .where(eq(projectLinks.projectId, projectId))
    .orderBy(asc(projectLinks.createdAt), sql`rowid`)
    .all()
    .flatMap(({ remote }) => githubRepoOfLink(remote) ?? []);

/**
 * A connection that reads GitHub's API names the project, which follows
 * none: each github.com repository it links is watched through it.
 */
const followGitHub = (
  tx: Writer,
  projectId: string,
  connection: string
): string[] => {
  const repos = linkedRepos(tx, projectId);
  for (const repo of repos) {
    watchRepo(tx, projectId, repo, connection);
  }
  return repos;
};

/**
 * A link was added to the project: a github.com repository is watched
 * when the project follows GitHub (it has a GitHub watch, or a connection
 * that reads GitHub's API names it), through the connection it follows by.
 */
export const followLink = (
  tx: Writer,
  projectId: string,
  remote: string
): void => {
  const repo = githubRepoOfLink(remote);
  const connection = repo && githubFollower(tx, projectId);
  if (repo && connection) {
    watchRepo(tx, projectId, repo, connection);
  }
};

/** A GitHub watch moved off a connection: to the one named, or `null` when none was left and it went (or was left for the trash). */
export interface Rehomed {
  container: string;
  /** What moved: the watch's own connection, or the one the poller reads a syncing watch through once its binding's is gone (`settings.pollerConnection`). */
  field: "connection" | "pollerConnection";
  /** What it held before. */
  from: string | null;
  /** The watch's id. */
  id: string;
  projectId: string;
  to: string | null;
}

/**
 * Connection `gone` no longer follows the projects in `of` (every project
 * when undefined): it stopped naming them, stopped reading GitHub's API,
 * or is being removed. Each GitHub watch the poller reads through it moves
 * to the connection its project follows by from now
 * ({@link followConnectionOf}); one with none goes, cursors and all, or,
 * with `leave`, stays for the connection's trash to take. A watch a tracker
 * binding syncs keeps the binding's connection, which the sync reads with;
 * the one the poller followed it by is found again the same way, and the
 * poller reads through it while the binding's no longer names the project
 * ({@link PolledWatch.reads}) and once the binding goes.
 */
export const rehome = (
  tx: Writer,
  gone: string,
  of: readonly string[] | undefined,
  leave: boolean
): Rehomed[] => {
  const scoped =
    of === undefined ? undefined : inArray(watches.projectId, [...of]);
  const moved: Rehomed[] = [];
  for (const watch of tx
    .select()
    .from(watches)
    .where(
      and(
        eq(watches.provider, "github"),
        eq(watches.enabled, true),
        eq(watches.connection, gone),
        scoped
      )
    )
    .all()) {
    if (watch.sync !== "off") {
      continue;
    }
    const to = followConnectionOf(tx, watch.projectId, [], gone) ?? null;
    if (to) {
      tx.update(watches)
        .set({ connection: to, reason: null })
        .where(eq(watches.id, watch.id))
        .run();
    } else if (!leave) {
      tx.delete(watches).where(eq(watches.id, watch.id)).run();
    }
    moved.push({
      id: watch.id,
      projectId: watch.projectId,
      container: watch.container,
      field: "connection",
      from: gone,
      to,
    });
  }
  for (const watch of tx
    .select()
    .from(watches)
    .where(
      and(eq(watches.provider, "github"), sql`${watches.sync} != 'off'`, scoped)
    )
    .all()) {
    const was = watch.settings.pollerConnection ?? null;
    if (watch.connection !== gone && was !== gone) {
      continue;
    }
    const kept = was === gone ? null : was;
    const to = followConnectionOf(tx, watch.projectId, [kept], gone) ?? null;
    if (to !== was) {
      tx.update(watches)
        .set({
          settings: settingsWith(watch.settings, { pollerConnection: to }),
        })
        .where(eq(watches.id, watch.id))
        .run();
      moved.push({
        id: watch.id,
        projectId: watch.projectId,
        container: watch.container,
        field: "pollerConnection",
        from: was,
        to,
      });
    }
  }
  return moved;
};

/**
 * Puts back what {@link rehome} moved, newest first (a connection's Undo,
 * db/trash.ts): each watch still holding what the move gave it gets what
 * it held before; one changed since keeps its own.
 */
export const unrehome = (tx: Writer, moved: readonly Rehomed[]): void => {
  for (const move of moved.toReversed()) {
    if (move.to === null && move.field === "connection") {
      continue;
    }
    const watch = tx
      .select()
      .from(watches)
      .where(eq(watches.id, move.id))
      .get();
    if (!watch) {
      continue;
    }
    if (
      move.field === "connection" &&
      move.from &&
      watch.connection === move.to
    ) {
      tx.update(watches)
        .set({ connection: move.from })
        .where(eq(watches.id, watch.id))
        .run();
    }
    if (
      move.field === "pollerConnection" &&
      (watch.settings.pollerConnection ?? null) === move.to
    ) {
      tx.update(watches)
        .set({
          settings: settingsWith(watch.settings, {
            pollerConnection: move.from,
          }),
        })
        .where(eq(watches.id, watch.id))
        .run();
    }
  }
};

/** A stream's mark as its watch keeps it, with its counts. */
export interface StreamCursor {
  cursor: WatchCursor;
  /** 304s answered: polls that cost nothing. */
  notModified: number;
  polls: number;
}

/** A watch the poll loop reads (clock.ts), with each stream's cursor. */
export interface PolledWatch extends WatchRow {
  /** Each stream's cursor, by stream: the poll's own streams, the tracker sync's beside them. */
  cursors: ReadonlyMap<string, StreamCursor>;
  /**
   * The connection the poll reads it through: its own, but on a GitHub
   * watch a binding syncs whose connection no longer reads GitHub's API and
   * names the project, the one the poller followed it by
   * (`settings.pollerConnection`), while that one does.
   */
  reads: string;
}

/** What one stream's read keeps: its new mark, or `unchanged` for a 304. */
export type StreamKept =
  { cursor: WatchCursor; kind: "read" } | { kind: "unchanged" };

/** The rows the poll loop (clock.ts) reads and writes. */
export interface PolledWatchesDb {
  /** The connection project `projectId`'s GitHub watches read with (one that only follows first), or nothing while it follows none. */
  readonly followedBy: (projectId: string) => string | undefined;
  /** {@link followGitHub}: the repositories now watched, none while the project links none on github.com. */
  readonly followGitHub: (projectId: string, connection: string) => string[];
  /** The GitHub watches the poll reads, a project's or every one, oldest first, each with its streams' cursors. */
  readonly githubWatches: (projectId?: string) => PolledWatch[];
  /** One stream's read kept, once what it read is stored (provider spec §2.5). */
  readonly keepStream: (
    watchId: string,
    stream: string,
    kept: StreamKept
  ) => void;
  /** A watch's poll's outcome kept. */
  readonly keepWatch: (
    watchId: string,
    patch: Partial<Pick<WatchRow, "polledAt" | "reason" | "resumeAt">>
  ) => void;
  /** A watch the poll loop reads, by its id; undefined when it is gone or off. */
  readonly polledWatch: (id: string) => PolledWatch | undefined;
  /** Every watch the poll loop reads, of any provider, oldest first, each with its streams' cursors. */
  readonly polledWatches: () => PolledWatch[];
  /** {@link rehome} in one transaction, each watch left with no connection gone (a connection's removal rehomes in db/trash.ts). */
  readonly rehome: (
    gone: string,
    of: readonly string[] | undefined
  ) => Rehomed[];
}

export const polledWatchesDb = (db: BunSQLiteDatabase): PolledWatchesDb => {
  const withCursors = (rows: WatchRow[]): PolledWatch[] => {
    const cursors = new Map<string, Map<string, StreamCursor>>();
    if (rows.length > 0) {
      for (const row of db
        .select()
        .from(watchCursors)
        .where(
          inArray(
            watchCursors.watchId,
            rows.map((watch) => watch.id)
          )
        )
        .all()) {
        const kept = cursors.get(row.watchId) ?? new Map();
        kept.set(row.stream, {
          cursor: row.cursor,
          polls: row.polls,
          notModified: row.notModified,
        });
        cursors.set(row.watchId, kept);
      }
    }
    const readers = new Map<string, Set<string>>();
    const readerOf = (projectId: string): Set<string> => {
      const known = readers.get(projectId);
      if (known) {
        return known;
      }
      const made = new Set(readersOf(db, projectId));
      readers.set(projectId, made);
      return made;
    };
    const readsOf = (row: WatchRow): string => {
      const poller = row.settings.pollerConnection;
      if (row.provider !== "github" || row.sync === "off" || !poller) {
        return row.connection;
      }
      const named = readerOf(row.projectId);
      return named.has(row.connection) || !named.has(poller)
        ? row.connection
        : poller;
    };
    return rows.map((row) => ({
      ...row,
      cursors: cursors.get(row.id) ?? new Map(),
      reads: readsOf(row),
    }));
  };
  const polled = and(
    inArray(watches.provider, [...POLLED_PROVIDERS]),
    eq(watches.enabled, true)
  );
  return {
    followedBy: (projectId) => followedOf(db, projectId)[0]?.connection,
    githubWatches: (projectId) =>
      withCursors(
        db
          .select()
          .from(watches)
          .where(
            and(
              eq(watches.provider, "github"),
              eq(watches.enabled, true),
              projectId === undefined
                ? undefined
                : eq(watches.projectId, projectId)
            )
          )
          .orderBy(asc(watches.createdAt))
          .all()
      ),
    polledWatches: () =>
      withCursors(
        db
          .select()
          .from(watches)
          .where(polled)
          .orderBy(asc(watches.createdAt))
          .all()
      ),
    polledWatch: (id) =>
      withCursors(
        db
          .select()
          .from(watches)
          .where(and(eq(watches.id, id), polled))
          .all()
      )[0],
    keepStream: (watchId, stream, kept) => {
      const now = new Date();
      const set =
        kept.kind === "read"
          ? {
              cursor: kept.cursor,
              polls: sql`${watchCursors.polls} + 1`,
              updatedAt: now,
            }
          : {
              polls: sql`${watchCursors.polls} + 1`,
              notModified: sql`${watchCursors.notModified} + 1`,
              updatedAt: now,
            };
      db.insert(watchCursors)
        .values({
          watchId,
          stream,
          cursor: kept.kind === "read" ? kept.cursor : {},
          polls: 1,
          notModified: kept.kind === "read" ? 0 : 1,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [watchCursors.watchId, watchCursors.stream],
          set,
        })
        .run();
    },
    keepWatch: (watchId, patch) => {
      if (Object.keys(patch).length > 0) {
        db.update(watches).set(patch).where(eq(watches.id, watchId)).run();
      }
    },
    followGitHub: (projectId, connection) =>
      db.transaction((tx) => followGitHub(tx, projectId, connection)),
    rehome: (gone, of) => db.transaction((tx) => rehome(tx, gone, of, false)),
  };
};

/** A watch's settings with `patch` over them; a key set to undefined goes. */
export const settingsWith = (
  settings: WatchSettings,
  patch: WatchSettings
): WatchSettings =>
  Object.fromEntries(
    Object.entries({ ...settings, ...patch }).filter(
      ([, value]) => value !== undefined
    )
  );

/** A watch's settings with every part only its tracker sync keeps gone. */
const unsynced = ({
  githubProject: _project,
  githubProjectReason: _projectReason,
  githubStatusStages: _stages,
  githubStatusesRefused: _refused,
  githubStatusesAdded: _added,
  syncReason: _reason,
  syncPolledAt: _polledAt,
  syncResumeAt: _resumeAt,
  pollerConnection: _poller,
  ...own
}: WatchSettings): WatchSettings => own;

/**
 * The connection a watch a binding syncs is read with once the binding
 * goes: the one the poller followed it by, else the one its project
 * follows by ({@link followConnectionOf}); nothing when none.
 */
export const unboundConnection = (
  tx: Writer,
  watch: WatchRow
): string | undefined =>
  followConnectionOf(tx, watch.projectId, [watch.settings.pollerConnection]);

/**
 * A watch no longer syncs. One the GitHub poller reads keeps reading,
 * through `connection`, its sync's settings and streams gone; one made
 * only for the sync, or with no connection to read through, goes.
 */
export const stopSyncing = (
  tx: Writer,
  watch: WatchRow,
  connection: string | undefined
): void => {
  if (!(watch.enabled && connection)) {
    tx.delete(watches).where(eq(watches.id, watch.id)).run();
    return;
  }
  tx.update(watches)
    .set({
      sync: "off",
      syncSince: null,
      syncDirectionAt: null,
      state: null,
      connection,
      settings: unsynced(watch.settings),
    })
    .where(eq(watches.id, watch.id))
    .run();
  tx.delete(watchCursors)
    .where(
      and(
        eq(watchCursors.watchId, watch.id),
        inArray(watchCursors.stream, Object.values(SYNC_STREAMS))
      )
    )
    .run();
};

/**
 * Project `dupId` folds into `keepId` (db/projects.ts `foldProject`): its
 * connector polls move; its GitHub watches the poller reads move where the
 * kept project follows none, both polling the repositories they share,
 * each no longer syncing (its tracker binding goes with it, as every other
 * watch of it does) and read through the connection the poller followed it
 * by; a repository the kept project already watches keeps that watch. Then
 * each repository it linked is watched where the kept project follows
 * GitHub ({@link followLink}), as a link added to it.
 */
export const foldWatches = (tx: Writer, dupId: string, keepId: string) => {
  tx.update(watches)
    .set({ projectId: keepId })
    .where(
      and(eq(watches.projectId, dupId), eq(watches.provider, "connection"))
    )
    .run();
  if (followedOf(tx, keepId).length === 0) {
    for (const watch of followedOf(tx, dupId)) {
      if (githubWatchOf(tx, keepId, watch.container)) {
        continue;
      }
      if (watch.sync !== "off") {
        stopSyncing(
          tx,
          watch,
          watch.settings.pollerConnection ?? watch.connection
        );
      }
      tx.update(watches)
        .set({ projectId: keepId })
        .where(eq(watches.id, watch.id))
        .run();
    }
  }
  for (const { remote } of tx
    .select({ remote: projectLinks.remote })
    .from(projectLinks)
    .where(eq(projectLinks.projectId, dupId))
    .all()) {
    followLink(tx, keepId, remote);
  }
};
