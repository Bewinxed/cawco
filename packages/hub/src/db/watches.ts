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

/**
 * The connection project `projectId` follows GitHub by: its GitHub
 * watches' (one that only follows first), else the first connection by
 * name that reads GitHub's API and names it; nothing when neither.
 */
const githubFollower = (tx: Writer, projectId: string): string | undefined =>
  followedOf(tx, projectId)[0]?.connection ??
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
    .get()?.name;

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

/**
 * The project stops following GitHub: each watch only the poller read
 * goes, cursors and all; one a tracker binding syncs stays for the sync,
 * no longer read by the poller, its resources' cursors gone.
 */
const unfollowGitHub = (tx: Writer, projectId: string): void => {
  const followed = followedOf(tx, projectId);
  const kept = followed.filter((watch) => watch.sync !== "off");
  tx.delete(watches)
    .where(
      inArray(
        watches.id,
        followed.filter((watch) => watch.sync === "off").map((w) => w.id)
      )
    )
    .run();
  if (kept.length === 0) {
    return;
  }
  const ids = kept.map((watch) => watch.id);
  tx.update(watches)
    .set({ enabled: false, reason: null, resumeAt: null, polledAt: null })
    .where(inArray(watches.id, ids))
    .run();
  tx.delete(watchCursors)
    .where(
      and(
        inArray(watchCursors.watchId, ids),
        sql`${watchCursors.stream} NOT LIKE 'sync:%'`
      )
    )
    .run();
};

/** One repository's cursors, each resource's. */
export type GitHubCursors = Partial<Record<GitHubResource, GitHubCursor>>;

/** A GitHub watch the poller reads, with each resource's cursor. */
export interface GitHubWatch extends WatchRow {
  cursors: GitHubCursors;
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
  readonly unfollowGitHub: (projectId: string) => void;
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
    return rows.map((row) => ({ ...row, cursors: cursors.get(row.id) ?? {} }));
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
    unfollowGitHub: (projectId) =>
      db.transaction((tx) => unfollowGitHub(tx, projectId)),
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
  ...own
}: WatchSettings): WatchSettings => own;

/**
 * A watch no longer syncs: one the GitHub poller reads keeps reading, its
 * sync's settings and streams gone; one made only for the sync goes.
 */
export const stopSyncing = (tx: Writer, watch: WatchRow): void => {
  if (!watch.enabled) {
    tx.delete(watches).where(eq(watches.id, watch.id)).run();
    return;
  }
  tx.update(watches)
    .set({
      sync: "off",
      syncSince: null,
      syncDirectionAt: null,
      state: null,
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
