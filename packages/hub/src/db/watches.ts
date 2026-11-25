/**
 * Watches (provider spec §2.4, schema `watches`, `watch_cursors`): what the
 * GitHub poller (ingress.ts) follows of a project and how it follows it.
 * Its connector polls are read in db/ingress.ts and its tracker binding in
 * db/trackers.ts, over the same rows.
 *
 * A project follows GitHub through a connection that reads GitHub's API
 * (core `readsGitHubApi`). Its GitHub watches are made at the two moments
 * that can start following, and nowhere else:
 * - a connection that reads GitHub's API names the project
 *   ({@link followGitHub}, from ingress.ts `followConnection`): a watch of
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
  type GitHubCursor,
  projectLinks,
  watchCursors,
  watches,
} from "./schema";
import type { GitHubResource, WatchSettings } from "./stored-types";

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

/** The resources a repository is polled for, in order (github.ts): each a stream of its watch. */
export const GITHUB_RESOURCES = [
  "pulls",
  "issues",
  "comments",
  "issueEvents",
  "discussions",
] as const satisfies readonly GitHubResource[];

/** Whether a stream of a watch is one of GitHub's resources. */
const isResource = (stream: string): stream is GitHubResource =>
  GITHUB_RESOURCES.some((resource) => resource === stream);

/** A connector poll's one stream: there once it has looked. */
export const ITEMS_STREAM = "items";

/** The auths a `github` connection reads GitHub's REST API with (core `readsGitHubApi`), as stored. */
const READS_GITHUB_API = CONNECTION_AUTHS.filter(readsGitHubApi);

/** The repository `owner/repo` a github.com link names, or nothing (github.ts `githubReposOf`). */
const githubRepoOfLink = (remote: string): string | undefined => {
  const [host, owner, repo, ...rest] = remote.split("/");
  return host === GITHUB_HOST && owner && repo && rest.length === 0
    ? `${owner}/${repo}`
    : undefined;
};

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
): void => {
  for (const repo of linkedRepos(tx, projectId)) {
    watchRepo(tx, projectId, repo, connection);
  }
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
 * ({@link GitHubWatch.reads}) and once the binding goes.
 */
const rehome = (
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
    moved.push({ projectId: watch.projectId, container: watch.container, to });
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
    }
  }
  return moved;
};

/** One repository's cursors, each resource's. */
export type GitHubCursors = Partial<Record<GitHubResource, GitHubCursor>>;

/** A GitHub watch the poller reads, with each resource's cursor. */
export interface GitHubWatch extends WatchRow {
  cursors: GitHubCursors;
  /**
   * The connection the poller reads it through: its own, but on a watch a
   * binding syncs whose connection no longer reads GitHub's API and names
   * the project, the one the poller followed it by
   * (`settings.pollerConnection`), while that one does.
   */
  reads: string;
}

/** What one poll of one watch keeps: its row's outcome and each resource's cursor over the one it had. */
export interface GitHubWatchPolled {
  cursors?: GitHubCursors;
  id: string;
  patch: Partial<Pick<WatchRow, "polledAt" | "reason" | "resumeAt">>;
}

/** The rows db/ingress.ts reads and writes for the GitHub poller. */
export interface GitHubWatchesDb {
  /** The connection project `projectId`'s GitHub watches read with (one that only follows first), or nothing while it follows none. */
  readonly followedBy: (projectId: string) => string | undefined;
  readonly followGitHub: (projectId: string, connection: string) => void;
  /** The GitHub watches the poller reads, a project's or every one, oldest first, each with its resources' cursors. */
  readonly githubWatches: (projectId?: string) => GitHubWatch[];
  /** Each poll's outcome kept, in one transaction. */
  readonly keepGitHubPoll: (polled: readonly GitHubWatchPolled[]) => void;
  /** {@link rehome} in one transaction. */
  readonly rehome: (
    gone: string,
    of: readonly string[] | undefined,
    leave: boolean
  ) => Rehomed[];
}

export const githubWatchesDb = (db: BunSQLiteDatabase): GitHubWatchesDb => {
  const withCursors = (rows: WatchRow[]): GitHubWatch[] => {
    const cursors = new Map<string, GitHubWatch["cursors"]>();
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
        const resource = row.stream;
        if (!isResource(resource)) {
          continue;
        }
        const kept = cursors.get(row.watchId) ?? {};
        kept[resource] = {
          since: row.cursor.since ?? 0,
          etag: row.cursor.etag ?? null,
          polls: row.polls,
          notModified: row.notModified,
        };
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
      if (row.sync === "off" || !poller) {
        return row.connection;
      }
      const named = readerOf(row.projectId);
      return named.has(row.connection) || !named.has(poller)
        ? row.connection
        : poller;
    };
    return rows.map((row) => ({
      ...row,
      cursors: cursors.get(row.id) ?? {},
      reads: readsOf(row),
    }));
  };
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
    keepGitHubPoll: (polled) => {
      db.transaction((tx) => {
        const now = new Date();
        for (const { id, patch, cursors } of polled) {
          if (Object.keys(patch).length > 0) {
            tx.update(watches).set(patch).where(eq(watches.id, id)).run();
          }
          for (const [stream, cursor] of Object.entries(cursors ?? {})) {
            if (!cursor) {
              continue;
            }
            const values = {
              cursor: { etag: cursor.etag, since: cursor.since },
              polls: cursor.polls,
              notModified: cursor.notModified,
              updatedAt: now,
            };
            tx.insert(watchCursors)
              .values({ watchId: id, stream, ...values })
              .onConflictDoUpdate({
                target: [watchCursors.watchId, watchCursors.stream],
                set: values,
              })
              .run();
          }
        }
      });
    },
    followGitHub: (projectId, connection) =>
      db.transaction((tx) => followGitHub(tx, projectId, connection)),
    rehome: (gone, of, leave) =>
      db.transaction((tx) => rehome(tx, gone, of, leave)),
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
