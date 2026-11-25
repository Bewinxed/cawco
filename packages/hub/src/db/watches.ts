/**
 * Watches (provider spec §2.4, schema `watches`, `watch_cursors`): what the
 * poll loop (clock.ts) follows of a project and how it follows it.
 * Its connector polls are read in db/ingress.ts and its tracker binding in
 * db/trackers.ts, over the same rows.
 *
 * A project follows a forge (GitHub, a GitLab, a Gitea: a provider on one
 * host) through a connection that reads that forge's API (core
 * `connectionApi`, forge-hosts.ts `forgeOf`). Its watches of a forge are
 * made at the two moments that can start following, and nowhere else:
 * - a connection that reads a forge's API names the project
 *   ({@link followForge}, from clock.ts `followConnection`): a watch of
 *   each repository on that forge the project links;
 * - a repository link is added to a project that follows its forge
 *   ({@link followLink}, from db/projects.ts): a watch of that repository,
 *   with the connection the project follows that forge by
 *   ({@link forgeFollower}).
 * A repository the project no longer links keeps its watch and its cursors,
 * unread, until the project stops following.
 *
 * A project that some connection reading a forge's API names keeps
 * following its repositories there: when a watch's connection stops naming
 * the project, stops reading that API or is removed, the watch moves to the
 * connection the project follows that forge by ({@link followConnectionOf}),
 * and goes only when there is none ({@link rehome}). A tracker binding's
 * connection reads its GitHub repository's watch while it syncs; the
 * connection the poller followed it by is kept beside it
 * (`settings.pollerConnection`) and read with again once the binding goes
 * ({@link stopSyncing}).
 */

import { FORGE_IDS, PROVIDER_IDS } from "@cawco/providers/provider";
import {
  and,
  asc,
  eq,
  inArray,
  like,
  ne,
  not,
  type SQL,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { type Forge, forgeOf, hostnameOf, sameForge } from "../forge-hosts";
import {
  connectionProjects,
  connections,
  projectLinks,
  relays,
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

/** GitHub, as a forge: what the GitHub poll, its relay and its tracker follow. */
export const GITHUB: Pick<Forge, "host" | "provider"> = {
  provider: "github",
  host: GITHUB_HOST,
};

/** The providers whose watches the poll loop reads (clock.ts): a forge's repository, a Linear team, a connector poll. */
const POLLED_PROVIDERS = [...PROVIDER_IDS, "connection"] as const;

/** The providers whose watches the follow rule makes and moves: the forges. */
const FOLLOWED_PROVIDERS = FORGE_IDS;

/** What a syncing watch's board stream is called, before its Project's id (providers github/board.ts). */
const BOARD_STREAMS = "board:%";

/**
 * The repository a link (`host/path`, core `repoIdentity`) names on a
 * forge, its path as linked; undefined when it names none there: the link's
 * host is the forge's (its port aside, which a link drops), and its path is
 * a GitHub or Gitea `owner/repo`, or a GitLab `group/…/project`.
 */
const repoOfLink = (
  remote: string,
  forge: Pick<Forge, "host" | "provider">
): string | undefined => {
  const [host = "", ...path] = remote.split("/");
  const fits =
    forge.provider === "gitlab" ? path.length >= 2 : path.length === 2;
  return host === hostnameOf(forge.host) &&
    fits &&
    path.every((part) => part.length > 0)
    ? path.join("/")
    : undefined;
};

/** The repositories, as linked, among a project's links on `forge`, oldest first. */
export const forgeReposOf = (
  links: readonly string[],
  forge: Pick<Forge, "host" | "provider">
): string[] => links.flatMap((link) => repoOfLink(link, forge) ?? []);

/** The GitHub repositories, `owner/repo`, among a project's links, oldest first. */
export const githubReposOf = (links: readonly string[]): string[] =>
  forgeReposOf(links, GITHUB);

/**
 * A watch that only holds how a relay's sender signs (settings `scheme`,
 * providers connection/webhook.ts): no poll reads it, and it is no
 * connector poll.
 */
export const isHookWatch = sql`json_extract(${watches.settings}, '$.scheme') IS NOT NULL`;

/** Whether a relay that is not off belongs to watch `watchId`. */
const heldByRelay = (tx: Writer, watchId: string): boolean =>
  tx
    .select({ id: relays.id })
    .from(relays)
    .where(and(eq(relays.watchId, watchId), ne(relays.state, "off")))
    .limit(1)
    .get() !== undefined;

/**
 * A watch nothing follows any more goes, cursors and all; one a relay
 * holds stays for it, not polled, so the relay's deliveries go on landing
 * and the webhook it registered can still be deleted through it.
 */
const letGo = (tx: Writer, watch: WatchRow): void => {
  if (heldByRelay(tx, watch.id)) {
    tx.update(watches)
      .set({ enabled: false })
      .where(eq(watches.id, watch.id))
      .run();
    return;
  }
  tx.delete(watches).where(eq(watches.id, watch.id)).run();
};

/** One repository's watch of a project on `forge`: its path compared without case, as the forges do. */
const forgeWatchOf = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">,
  repo: string
): WatchRow | undefined =>
  tx
    .select()
    .from(watches)
    .where(
      and(
        eq(watches.projectId, projectId),
        eq(watches.provider, forge.provider),
        sql`lower(${watches.host}) = lower(${forge.host})`,
        sql`lower(${watches.container}) = lower(${repo})`
      )
    )
    .get();

/** The project's watches of `forge` its poll reads, those that read nothing else first, oldest first. */
const followedOf = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">
): WatchRow[] =>
  tx
    .select()
    .from(watches)
    .where(
      and(
        eq(watches.projectId, projectId),
        eq(watches.provider, forge.provider),
        sql`lower(${watches.host}) = lower(${forge.host})`,
        eq(watches.enabled, true)
      )
    )
    .orderBy(sql`${watches.sync} != 'off'`, asc(watches.createdAt))
    .all();

/** Each connection that names project `projectId`, with the forge it reads, by name. */
const namingOf = (
  tx: Writer,
  projectId: string
): { forge: Forge; name: string }[] =>
  tx
    .select({
      name: connections.name,
      service: connections.service,
      auth: connections.auth,
      transport: connections.transport,
      url: connections.url,
      args: connections.args,
    })
    .from(connections)
    .innerJoin(
      connectionProjects,
      eq(connectionProjects.connectionId, connections.id)
    )
    .where(eq(connectionProjects.projectId, projectId))
    .orderBy(asc(connections.name))
    .all()
    .flatMap((row) => {
      const forge = forgeOf({
        ...row,
        url: row.url ?? undefined,
        args: row.args ?? undefined,
      });
      return forge ? [{ name: row.name, forge }] : [];
    });

/** The connections that read `forge`'s API and name project `projectId`, by name. */
const readersOf = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">
): string[] =>
  namingOf(tx, projectId)
    .filter((one) => sameForge(one.forge, forge))
    .map((one) => one.name);

/**
 * The connection project `projectId` follows `forge` by from now, other
 * than `gone`: the first of `kept` that still reads its API and names it,
 * else its watches' there (one that only follows first) that does, else
 * the first by name that does; nothing when none does.
 */
const followConnectionOf = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">,
  kept: readonly (string | null | undefined)[],
  gone?: string
): string | undefined => {
  const readers = new Set(readersOf(tx, projectId, forge));
  readers.delete(gone ?? "");
  return [
    ...kept,
    ...followedOf(tx, projectId, forge).map((watch) => watch.connection),
    ...readers,
  ].find(
    (name): name is string =>
      name !== null && name !== undefined && readers.has(name)
  );
};

/**
 * The connection project `projectId` follows `forge` by, for a repository
 * linked to it: its watches' there (one that only follows first), else the
 * first connection by name that reads its API and names it; nothing when
 * neither.
 */
const forgeFollower = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">
): string | undefined =>
  followedOf(tx, projectId, forge)[0]?.connection ??
  readersOf(tx, projectId, forge)[0];

/** A new watch the poll reads, of `repo` on `forge` through `connection`. */
const madeWatch = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">,
  repo: string,
  connection: string
): void => {
  tx.insert(watches)
    .values({
      id: crypto.randomUUID(),
      projectId,
      provider: forge.provider,
      host: forge.host,
      container: repo,
      containerName: repo,
      containerUrl: `https://${forge.host}/${repo}`,
      connection,
      sync: "off",
      settings: {},
      enabled: true,
      createdBy: "owner",
      createdAt: new Date(),
    })
    .run();
};

/** The poll reads `repo` of the project on `forge`: its watch made, or one made by binding a tracker or a relay followed too. */
const watchRepo = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">,
  repo: string,
  connection: string
): void => {
  const was = forgeWatchOf(tx, projectId, forge, repo);
  if (!was) {
    madeWatch(tx, projectId, forge, repo, connection);
  } else if (!was.enabled) {
    // One a relay alone held (no poll read it) is read from now through
    // the connection the project follows by.
    tx.update(watches)
      .set({
        enabled: true,
        ...(was.sync === "off" ? { connection, reason: null } : {}),
      })
      .where(eq(watches.id, was.id))
      .run();
  }
};

/** Each repository on `forge` project `projectId` links, oldest first. */
const linkedRepos = (
  tx: Writer,
  projectId: string,
  forge: Pick<Forge, "host" | "provider">
): string[] =>
  forgeReposOf(
    tx
      .select({ remote: projectLinks.remote })
      .from(projectLinks)
      .where(eq(projectLinks.projectId, projectId))
      .orderBy(asc(projectLinks.createdAt), sql`rowid`)
      .all()
      .map(({ remote }) => remote),
    forge
  );

/**
 * A connection that reads `forge`'s API names the project, which follows
 * none there: each repository on it the project links is watched through
 * it.
 */
const followForge = (
  tx: Writer,
  projectId: string,
  connection: string,
  forge: Pick<Forge, "host" | "provider">
): string[] => {
  const repos = linkedRepos(tx, projectId, forge);
  for (const repo of repos) {
    watchRepo(tx, projectId, forge, repo, connection);
  }
  return repos;
};

/**
 * A link was added to the project: a repository on a forge the project
 * follows (it has a watch there, or a connection that reads that forge's
 * API names it) is watched, through the connection it follows that forge
 * by.
 */
export const followLink = (
  tx: Writer,
  projectId: string,
  remote: string
): void => {
  const forges = [GITHUB, ...namingOf(tx, projectId).map((one) => one.forge)];
  const seen = new Set<string>();
  for (const forge of forges) {
    const key = `${forge.provider}\0${forge.host.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const repo = repoOfLink(remote, forge);
    const connection = repo && forgeFollower(tx, projectId, forge);
    if (repo && connection) {
      watchRepo(tx, projectId, forge, repo, connection);
    }
  }
};

/** A watch moved off a connection: to the one named, or `null` when none was left and it went (or was left for the trash). */
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

/** A watch's forge: its provider and host. */
const forgeOfWatch = (
  watch: Pick<WatchRow, "host" | "provider">
): Pick<Forge, "host" | "provider"> => ({
  provider:
    watch.provider === "gitlab" || watch.provider === "gitea"
      ? watch.provider
      : "github",
  host: watch.host,
});

/**
 * Connection `gone` no longer follows the projects in `of` (every project
 * when undefined): it stopped naming them, stopped reading its forge's API,
 * or is being removed. Each watch of a forge the poll reads through it
 * moves to the connection its project follows that forge by from now
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
  leave: boolean,
  /** The forge `gone` still reads: its watches there stay, and only those elsewhere move (its server moved). */
  stays?: Pick<Forge, "host" | "provider">
): Rehomed[] => {
  const scoped =
    of === undefined ? undefined : inArray(watches.projectId, [...of]);
  return [
    ...rehomeFollowed(tx, gone, scoped, leave, stays),
    ...(stays && sameForge(stays, GITHUB)
      ? []
      : rehomePollers(tx, gone, scoped)),
  ];
};

/** {@link rehome}'s watches the poll reads through `gone` itself. */
const rehomeFollowed = (
  tx: Writer,
  gone: string,
  scoped: SQL | undefined,
  leave: boolean,
  stays: Pick<Forge, "host" | "provider"> | undefined
): Rehomed[] => {
  const moved: Rehomed[] = [];
  for (const watch of tx
    .select()
    .from(watches)
    .where(
      and(
        inArray(watches.provider, [...FOLLOWED_PROVIDERS]),
        eq(watches.enabled, true),
        eq(watches.connection, gone),
        scoped
      )
    )
    .all()) {
    if (
      watch.sync !== "off" ||
      (stays && sameForge(forgeOfWatch(watch), stays))
    ) {
      continue;
    }
    const to =
      followConnectionOf(tx, watch.projectId, forgeOfWatch(watch), [], gone) ??
      null;
    if (to) {
      tx.update(watches)
        .set({ connection: to, reason: null })
        .where(eq(watches.id, watch.id))
        .run();
    } else if (!leave) {
      letGo(tx, watch);
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
  return moved;
};

/** {@link rehome}'s GitHub watches a binding syncs, whose poller's connection was `gone`, or whose own is. */
const rehomePollers = (
  tx: Writer,
  gone: string,
  scoped: SQL | undefined
): Rehomed[] => {
  const moved: Rehomed[] = [];
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
    const to =
      followConnectionOf(tx, watch.projectId, GITHUB, [kept], gone) ?? null;
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
  /** A watch's streams whose names start with `prefix` let go, so their next read starts afresh (a refused board asked again). */
  readonly dropStreams: (watchId: string, prefix: string) => void;
  /** The connection project `projectId`'s GitHub watches read with (one that only follows first), or nothing while it follows none. */
  readonly followedBy: (projectId: string) => string | undefined;
  /** The connection project `projectId`'s watches of `forge` read with (one that only follows first), or nothing while it follows none there. */
  readonly followedOn: (
    projectId: string,
    forge: Pick<Forge, "host" | "provider">
  ) => string | undefined;
  /** {@link followForge}: the repositories on `forge` now watched, none while the project links none there. */
  readonly followForge: (
    projectId: string,
    connection: string,
    forge: Pick<Forge, "host" | "provider">
  ) => string[];
  /** The project's watches of `forge` the poll reads, oldest first, each with its streams' cursors. */
  readonly forgeWatches: (
    projectId: string,
    forge: Pick<Forge, "host" | "provider">
  ) => PolledWatch[];
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
    of: readonly string[] | undefined,
    stays?: Pick<Forge, "host" | "provider">
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
      const made = new Set(readersOf(db, projectId, GITHUB));
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
    eq(watches.enabled, true),
    not(isHookWatch)
  );
  return {
    followedBy: (projectId) => followedOf(db, projectId, GITHUB)[0]?.connection,
    followedOn: (projectId, forge) =>
      followedOf(db, projectId, forge)[0]?.connection,
    forgeWatches: (projectId, forge) =>
      withCursors(followedOf(db, projectId, forge)).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      ),
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
    dropStreams: (watchId, prefix) => {
      db.delete(watchCursors)
        .where(
          and(
            eq(watchCursors.watchId, watchId),
            like(watchCursors.stream, `${prefix}%`)
          )
        )
        .run();
    },
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
    followForge: (projectId, connection, forge) =>
      db.transaction((tx) => followForge(tx, projectId, connection, forge)),
    rehome: (gone, of, stays) =>
      db.transaction((tx) => rehome(tx, gone, of, false, stays)),
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
  githubBoard: _board,
  githubProject: _project,
  githubProjectReason: _projectReason,
  githubStatusStages: _stages,
  githubStatusesRefused: _refused,
  githubStatusesAdded: _added,
  syncProblem: _problem,
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
  followConnectionOf(tx, watch.projectId, GITHUB, [
    watch.settings.pollerConnection,
  ]);

/**
 * A watch no longer syncs. A GitHub repository the project links and
 * follows keeps being read, through `connection`, its sync's settings and
 * board stream gone; any other (a Linear team, a repository the project
 * does not link, one with no connection to read through) goes, cursors
 * and all.
 */
export const stopSyncing = (
  tx: Writer,
  watch: WatchRow,
  connection: string | undefined
): void => {
  const followed =
    watch.provider === "github" &&
    connection !== undefined &&
    linkedRepos(tx, watch.projectId, GITHUB).some(
      (repo) => repo.toLowerCase() === watch.container.toLowerCase()
    );
  const held = heldByRelay(tx, watch.id);
  if (!((followed && connection) || held)) {
    tx.delete(watches).where(eq(watches.id, watch.id)).run();
    return;
  }
  tx.update(watches)
    .set({
      sync: "off",
      syncSince: null,
      syncDirectionAt: null,
      state: null,
      connection: connection ?? watch.connection,
      settings: unsynced(watch.settings),
      // One a relay alone holds stays for it, not polled.
      ...(followed && connection ? {} : { enabled: false }),
    })
    .where(eq(watches.id, watch.id))
    .run();
  tx.delete(watchCursors)
    .where(
      and(
        eq(watchCursors.watchId, watch.id),
        like(watchCursors.stream, BOARD_STREAMS)
      )
    )
    .run();
};

/**
 * Project `dupId` folds into `keepId` (db/projects.ts `foldProject`): its
 * connector polls move; on each forge the kept project follows none of,
 * its watches the poll reads move, both polling the repositories they
 * share, each no longer syncing (its tracker binding goes with it, as every
 * other watch of it does) and read through the connection the poller
 * followed it by; a repository the kept project already watches keeps that
 * watch. Then each repository it linked is watched where the kept project
 * follows its forge ({@link followLink}), as a link added to it.
 */
export const foldWatches = (tx: Writer, dupId: string, keepId: string) => {
  tx.update(watches)
    .set({ projectId: keepId })
    .where(
      and(eq(watches.projectId, dupId), eq(watches.provider, "connection"))
    )
    .run();
  const forges = new Map(
    tx
      .select({ provider: watches.provider, host: watches.host })
      .from(watches)
      .where(
        and(
          eq(watches.projectId, dupId),
          inArray(watches.provider, [...FOLLOWED_PROVIDERS]),
          eq(watches.enabled, true)
        )
      )
      .all()
      .map((one) => {
        const forge = forgeOfWatch(one);
        return [
          `${forge.provider}\0${forge.host.toLowerCase()}`,
          forge,
        ] as const;
      })
  );
  for (const forge of forges.values()) {
    if (followedOf(tx, keepId, forge).length > 0) {
      continue;
    }
    for (const watch of followedOf(tx, dupId, forge)) {
      if (forgeWatchOf(tx, keepId, forge, watch.container)) {
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
  foldRelayWatches(tx, dupId, keepId);
};

/**
 * The watches of `dupId` a relay holds, which would go with its row: each
 * relay goes into the kept project's watch of the same container, else
 * its watch moves there, no longer syncing and not polled, as one only a
 * relay holds.
 */
const foldRelayWatches = (tx: Writer, dupId: string, keepId: string) => {
  for (const watch of tx
    .select()
    .from(watches)
    .where(eq(watches.projectId, dupId))
    .all()) {
    if (!heldByRelay(tx, watch.id)) {
      continue;
    }
    const kept = tx
      .select()
      .from(watches)
      .where(
        and(
          eq(watches.projectId, keepId),
          eq(watches.provider, watch.provider),
          eq(watches.host, watch.host),
          sql`lower(${watches.container}) = lower(${watch.container})`
        )
      )
      .get();
    if (kept) {
      tx.update(relays)
        .set({ watchId: kept.id })
        .where(eq(relays.watchId, watch.id))
        .run();
      continue;
    }
    tx.update(watches)
      .set({
        projectId: keepId,
        sync: "off",
        syncSince: null,
        syncDirectionAt: null,
        state: null,
        settings: unsynced(watch.settings),
        enabled: false,
      })
      .where(eq(watches.id, watch.id))
      .run();
  }
};
