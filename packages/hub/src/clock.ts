/**
 * The poll loop (provider spec §2.5): one clock over every watch the poll
 * reads, each read through its watch's connection on its provider's
 * interval, over its provider's streams, and what it reads handed to the
 * door (intake.ts `take`).
 *
 * - **GitHub** (providers github/ingest.ts): a project's repositories are
 *   read together every 60 s, each stream with its ETag and its mark, the
 *   first read of a stream a baseline. A repository the project no longer
 *   links keeps its watch and its cursors, unread, and says so. After its
 *   repositories, the project's linked items due a read are read
 *   (links.ts `readLinks`), and what they say goes through the door too.
 *   A project follows GitHub through a connection that reads GitHub's API
 *   (core `readsGitHubApi`) from the moment it names the project
 *   ({@link Clock.followConnection}).
 *   A watch the project's tracker syncs is read whether or not the project
 *   links its repository, with its board stream after the rest, and what
 *   it reads reaches the tracker sync through the door (sync.ts).
 * - **Linear** (providers linear/ingest.ts): a synced team's issues and
 *   comments every 60 s, through its watch's connection.
 * - **Connector polls** (providers connection/ingest.ts): a connection's
 *   read-only tool on its own interval, 60 s or more.
 * - **The cursor after the store.** A stream's cursor is kept only once
 *   `take` returned, so a stopped hub reads again what it had not stored
 *   ("a State should only ever be passed to a Source in the next run if it
 *   was both emitted from the Source and the Destination", Airbyte
 *   protocol). A read during which its watch moved in what it reads by (a
 *   connector poll edited, a repository moved to another connection) is
 *   dropped, and nothing is written.
 * - **Stopped and resumed.** A stream the service refuses stops its
 *   watch's read there, its words the watch's reason and its rate limit the
 *   watch's resume time; a request not answered in time leaves the watch as
 *   it was and says so in the log.
 * - **Written in Effect.** The loop is one fiber repeating its look on
 *   `Schedule.spaced`, interrupted when the hub closes; each poll runs on a
 *   fiber of its own, one per project's GitHub or per watch, a second ask
 *   joining the first; providers' reads and the door are Effects, and the
 *   link reads (links.ts) stay promise code. The routes and the sync reach
 *   it through its promise edges.
 */

import { readsGitHubApi } from "@cawco/core/connections";
import { secondsOf } from "@cawco/core/time";
import { configurePage } from "@cawco/core/words/configure";
import {
  type ConnectorCursor,
  connectionIngest,
  type ToolCaller,
} from "@cawco/providers/connection/ingest";
import { BOARD_STREAM } from "@cawco/providers/github/board";
import {
  type GitHubClient,
  type GitHubStreamCursor,
  githubIngest,
} from "@cawco/providers/github/ingest";
import type { LinearClientFor } from "@cawco/providers/linear/client";
import {
  type LinearStreamCursor,
  linearIngest,
} from "@cawco/providers/linear/ingest";
import type {
  Ingest,
  ItemRevision,
  WatchView,
} from "@cawco/providers/provider";
import { Cause, Effect, Fiber, Result, Schedule } from "effect";
import { problem } from "elysia";
import type { Connections } from "./connections";
import type { DbShape } from "./db";
import type { InboundVia, WatchCursor } from "./db/stored-types";
import {
  githubReposOf,
  type PolledWatch,
  type Rehomed,
  type StreamCursor,
} from "./db/watches";
import type { IngressView } from "./ingress-views";
import type { Intake } from "./intake";
import type { HubLifetimeShape } from "./lifetime";
import type { Links } from "./links";

/** What the poll says of a project that links no GitHub repository. */
const NO_GITHUB_LINK =
  "Nothing is polled: the project links no repository on github.com.";

/** How often the loop looks for a watch that is due. Our choice. */
const LOOK_MS = 5000;
/** One request to a service. Our choice. */
const REQUEST_MS = 30_000;

/** The hub's deadline on one request a provider sends. */
const requestMs = REQUEST_MS;

const wordsOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** What a poll's repositories' problems come to, each named when there are several; null: none. */
const pollProblem = (
  polls: readonly { reason: string | null; repo: string }[]
): string | null => {
  const problems = polls.flatMap(({ repo, reason }) => {
    if (reason === null) {
      return [];
    }
    return [polls.length > 1 ? `${repo}: ${reason}` : reason];
  });
  return problems.length > 0 ? problems.join(" ") : null;
};

/** The project's watches of the github.com repositories it links, in its links' order. */
const linkedWatches = (
  links: readonly string[],
  followed: readonly PolledWatch[]
): PolledWatch[] => {
  const byRepo = new Map(
    followed.map((watch) => [watch.container.toLowerCase(), watch])
  );
  return [
    ...new Set(
      githubReposOf(links).flatMap(
        (repo) => byRepo.get(repo.toLowerCase()) ?? []
      )
    ),
  ];
};

/** The latest of a project's watches' times, ms; 0 when none has one. */
const latest = (
  followed: readonly PolledWatch[],
  key: "polledAt" | "resumeAt"
): number =>
  Math.max(0, ...followed.map((watch) => watch[key]?.getTime() ?? 0));

/** The providers the poll reads, by a watch's stored name. */
const POLLED: Readonly<Record<string, WatchView["provider"]>> = {
  github: "github",
  linear: "linear",
  connection: "connection",
};

/** A watch as its provider reads it: read through the connection the poll reads it with. */
const viewOf = (watch: PolledWatch): WatchView => ({
  id: watch.id,
  projectId: watch.projectId,
  provider: POLLED[watch.provider] ?? "connection",
  host: watch.host,
  container: watch.container,
  containerName: watch.containerName,
  connection: watch.reads,
  settings: watch.settings,
  sync: watch.sync,
});

/** A GitHub stream's kept mark as its provider reads it. */
const githubCursorOf = (
  kept: StreamCursor | undefined
): GitHubStreamCursor | null =>
  kept && typeof kept.cursor.since === "number"
    ? {
        etag: kept.cursor.etag ?? null,
        since: kept.cursor.since,
        ...(kept.cursor.refusedAt === undefined
          ? {}
          : { refusedAt: kept.cursor.refusedAt }),
      }
    : null;

/** A Linear stream's kept mark as its provider reads it. */
const linearCursorOf = (
  kept: StreamCursor | undefined
): LinearStreamCursor | null =>
  kept && typeof kept.cursor.since === "number"
    ? { since: kept.cursor.since }
    : null;

/** A connector poll's kept mark: there once it has looked. */
const connectorCursorOf = (
  kept: StreamCursor | undefined
): ConnectorCursor | null => (kept ? {} : null);

/** One provider as the loop reads it: its ingest, how it opens a client, and how a kept mark reads. */
interface Reader<Client, Cursor> {
  client: (watch: PolledWatch) => Client | Promise<Client>;
  cursorOf: (kept: StreamCursor | undefined) => Cursor | null;
  ingest: Ingest<Client, Cursor>;
  /** A provider's mark as its watch keeps it. */
  keep: (cursor: Cursor) => WatchCursor;
  via: InboundVia;
}

/** What one watch's read came to. */
interface WatchPolled {
  /** The watch moved during the read: nothing was written. */
  dropped: boolean;
  landed: number;
  problem: { resumeAt: number | null; words: string } | null;
  /** A request not answered in time, after this long, ms; null when every one was. */
  unanswered: number | null;
}

export interface ClockDeps {
  readonly connections: Pick<
    Connections,
    "callConnection" | "get" | "githubClient" | "linearClient"
  >;
  readonly db: Pick<DbShape, "ingress" | "project">;
  readonly intake: Pick<Intake, "settled" | "take">;
  readonly lifetime: HubLifetimeShape;
  readonly links: Pick<Links, "readLinks">;
}

export const createClock = ({
  connections,
  db,
  intake,
  lifetime,
  links,
}: ClockDeps) => {
  const store = db.ingress;
  /** Polls under way, by `github:<project>` or `conn:<watch id>`: one at a time each, a second ask joining the first. */
  const running = new Map<string, Fiber.Fiber<void>>();
  /** The loop's fiber, while the hub runs. */
  let looping: Fiber.Fiber<void> | undefined;

  const github: Reader<GitHubClient, GitHubStreamCursor> = {
    ingest: githubIngest,
    cursorOf: githubCursorOf,
    keep: ({ etag, since, refusedAt }) =>
      refusedAt === undefined ? { etag, since } : { etag, since, refusedAt },
    client: (watch) => connections.githubClient(watch.reads),
    via: "poll",
  };
  const linear: Reader<LinearClientFor, LinearStreamCursor> = {
    ingest: linearIngest,
    cursorOf: linearCursorOf,
    keep: ({ since }) => ({ since }),
    client: (watch) => connections.linearClient(watch.reads),
    via: "poll",
  };
  const connector: Reader<ToolCaller, ConnectorCursor> = {
    ingest: connectionIngest,
    cursorOf: connectorCursorOf,
    keep: () => ({}),
    client: (watch) => (tool, args) =>
      connections.callConnection(watch.reads, tool, args),
    via: "connector",
  };

  /**
   * One watch read: each of its provider's streams from its cursor, each
   * read handed to the door and its cursor kept after; the first stream
   * that stops ends the read. A watch that moved in what it reads by while
   * a read was out drops what it read, and nothing is written.
   */
  const readWatch = Effect.fnUntraced(function* <Client, Cursor>(
    watch: PolledWatch,
    reader: Reader<Client, Cursor>,
    client: Client
  ): Effect.fn.Return<WatchPolled> {
    const view = viewOf(watch);
    const shape = reader.ingest.readsBy(view);
    const out: WatchPolled = {
      dropped: false,
      landed: 0,
      problem: null,
      unanswered: null,
    };
    for (const stream of reader.ingest.streams(view)) {
      const outcome = yield* Effect.result(
        reader.ingest.poll({
          client,
          watch: view,
          stream,
          cursor: reader.cursorOf(watch.cursors.get(stream)),
          now: Date.now(),
          requestMs,
        })
      );
      const now = store.polledWatch(watch.id);
      if (!(now && Bun.deepEquals(reader.ingest.readsBy(viewOf(now)), shape))) {
        console.log(
          `[clock] ${watch.provider} watch ${watch.id} moved during its read of ${stream}: what it read is dropped`
        );
        return { ...out, dropped: true };
      }
      if (Result.isFailure(outcome)) {
        const { failure } = outcome;
        return failure._tag === "ProviderUnanswered"
          ? { ...out, unanswered: failure.after }
          : {
              ...out,
              problem: { words: failure.words, resumeAt: failure.resumeAt },
            };
      }
      const polled = outcome.success;
      if (polled.kind === "unchanged") {
        store.keepStream(watch.id, stream, { kind: "unchanged" });
        continue;
      }
      out.landed += yield* intake.take(
        {
          projectId: watch.projectId,
          provider: view.provider,
          watchId: watch.id,
        },
        polled.ingested,
        reader.via,
        polled.baseline
      );
      // After the store, never before: a stop between them reads it again.
      store.keepStream(watch.id, stream, {
        kind: "read",
        cursor: reader.keep(polled.cursor),
      });
    }
    return out;
  });

  /** A watch's read's outcome on its row: its problem and resume time, unless a request went unanswered, which leaves them as they were. */
  const keepRead = (
    watch: PolledWatch,
    polled: WatchPolled,
    polledAt: Date
  ): void => {
    if (polled.dropped) {
      return;
    }
    if (polled.unanswered !== null) {
      console.log(
        `[clock] ${watch.containerName}: the service did not answer within ${secondsOf(polled.unanswered)} s; the watch's state stands`
      );
      store.keepWatch(watch.id, { polledAt });
      return;
    }
    const reason = polled.problem?.words ?? null;
    const resumeAt = polled.problem?.resumeAt ?? null;
    store.keepWatch(watch.id, {
      polledAt,
      reason,
      resumeAt: resumeAt === null ? null : new Date(resumeAt),
    });
    if (polled.landed > 0 || (reason !== null && reason !== watch.reason)) {
      console.log(
        `[clock] ${watch.containerName}: ${polled.landed} new${reason ? `; ${reason}` : ""}`
      );
    }
  };

  /** A client for a watch, or why its connection could not sign in, in words. */
  const clientFor = <Client, Cursor>(
    watch: PolledWatch,
    reader: Reader<Client, Cursor>
  ): Effect.Effect<{ client: Client } | { words: string }> =>
    Effect.tryPromise({
      try: async () => ({ client: await reader.client(watch) }),
      catch: wordsOf,
    }).pipe(Effect.catch((words) => Effect.succeed({ words })));

  /** The revisions a project's link reads found, through the door, each with its repository's watch. */
  const storeReads = (projectId: string, revisions: ItemRevision[]): void => {
    const byRepo = new Map(
      store
        .githubWatches(projectId)
        .map((watch) => [watch.container.toLowerCase(), watch.id])
    );
    const groups = new Map<string, ItemRevision[]>();
    for (const revision of revisions) {
      const repo = revision.item.container.toLowerCase();
      groups.set(repo, [...(groups.get(repo) ?? []), revision]);
    }
    for (const [repo, group] of groups) {
      // Called back from inside the link reads (promise code): the door's
      // store is synchronous, and its subscribers run on a fiber of their own.
      Effect.runSync(
        intake.take(
          { projectId, provider: "github", watchId: byRepo.get(repo) ?? null },
          { revisions: group, events: [] },
          "poll",
          false
        )
      );
    }
  };

  /**
   * One poll of every GitHub repository the project links and watches,
   * each read through its watch's connection, then the project's linked
   * items due a read. A repository it no longer links keeps its watch and
   * cursors, unread. Every watch of the project is dated, so the project is
   * due again together.
   */
  const pollGitHub = Effect.fnUntraced(function* (
    projectId: string
  ): Effect.fn.Return<void> {
    const followed = store.githubWatches(projectId);
    const project = db.project(projectId);
    if (!(followed.length > 0 && project)) {
      return;
    }
    const polledAt = new Date();
    const linked = linkedWatches(project.links, followed);
    const synced = followed.filter(
      (watch) => watch.sync !== "off" && !linked.includes(watch)
    );
    for (const watch of followed) {
      if (!(linked.includes(watch) || synced.includes(watch))) {
        store.keepWatch(watch.id, { reason: NO_GITHUB_LINK, polledAt });
      }
    }
    for (const watch of [...linked, ...synced]) {
      const opened = yield* clientFor(watch, github);
      if ("words" in opened) {
        store.keepWatch(watch.id, { reason: opened.words, polledAt });
        continue;
      }
      keepRead(watch, yield* readWatch(watch, github, opened.client), polledAt);
    }
    const followedBy = store.followedBy(projectId);
    if (followedBy === undefined) {
      return;
    }
    let client: GitHubClient;
    try {
      client = connections.githubClient(followedBy);
    } catch {
      // The connection could not sign in: its watches' reads said why, and the links are read on the next poll.
      return;
    }
    yield* Effect.promise(() =>
      links.readLinks(projectId, client, requestMs, (revisions) =>
        storeReads(projectId, revisions)
      )
    );
  });

  /** One read of a Linear team's watch. */
  const pollLinear = Effect.fnUntraced(function* (
    id: string
  ): Effect.fn.Return<void> {
    const watch = store.polledWatch(id);
    if (watch?.provider !== "linear") {
      return;
    }
    const polledAt = new Date();
    const opened = yield* clientFor(watch, linear);
    if ("words" in opened) {
      store.keepWatch(watch.id, { reason: opened.words, polledAt });
      return;
    }
    keepRead(watch, yield* readWatch(watch, linear, opened.client), polledAt);
  });

  /** One call of a connector poll. */
  const pollConnector = Effect.fnUntraced(function* (
    id: string
  ): Effect.fn.Return<void> {
    const watch = store.polledWatch(id);
    if (watch?.provider !== "connection") {
      return;
    }
    const polledAt = new Date();
    const opened = yield* clientFor(watch, connector);
    if ("words" in opened) {
      store.keepWatch(watch.id, { reason: opened.words, polledAt });
      return;
    }
    keepRead(
      watch,
      yield* readWatch(watch, connector, opened.client),
      polledAt
    );
  });

  /**
   * Runs one poll at a time per key, on a fiber of its own; asked while it
   * runs, the ask joins it. A failure is logged, never lost.
   */
  const once = (key: string, poll: Effect.Effect<void>): Effect.Effect<void> =>
    Effect.suspend(() => {
      const live = running.get(key);
      if (live !== undefined) {
        return Fiber.join(live);
      }
      const going = Effect.runFork(
        // Yielded first, so the fiber is kept before it can end.
        Effect.yieldNow.pipe(
          Effect.andThen(poll),
          Effect.catchCause((cause) =>
            Effect.sync(() =>
              console.warn(
                `[clock] ${key} poll failed: ${wordsOf(Cause.squash(cause))}`
              )
            )
          ),
          Effect.ensuring(Effect.sync(() => running.delete(key)))
        )
      );
      running.set(key, going);
      return Fiber.join(going);
    });

  /** A Linear team's watch or a connector poll, read on its own when it is due. */
  const lookAlone = (watch: PolledWatch, now: number): void => {
    const linearWatch = watch.provider === "linear";
    const every = (linearWatch ? linear : connector).ingest.everyMs(
      viewOf(watch)
    );
    const due =
      (watch.polledAt?.getTime() ?? 0) + every <= now &&
      (watch.resumeAt?.getTime() ?? 0) <= now;
    if (!due) {
      return;
    }
    Effect.runFork(
      linearWatch
        ? once(`linear:${watch.id}`, pollLinear(watch.id))
        : once(`conn:${watch.id}`, pollConnector(watch.id))
    );
  };

  /** Every watch that is due starts its read. */
  const look = (now: number = Date.now()): void => {
    const byProject = new Map<string, PolledWatch[]>();
    for (const watch of store.polledWatches()) {
      if (watch.provider === "github") {
        byProject.set(watch.projectId, [
          ...(byProject.get(watch.projectId) ?? []),
          watch,
        ]);
        continue;
      }
      lookAlone(watch, now);
    }
    for (const [projectId, followed] of byProject) {
      const every = Math.min(
        ...followed.map((watch) => github.ingest.everyMs(viewOf(watch)))
      );
      if (
        latest(followed, "polledAt") + every <= now &&
        latest(followed, "resumeAt") <= now
      ) {
        Effect.runFork(once(`github:${projectId}`, pollGitHub(projectId)));
      }
    }
  };

  /** The loop: a look now, then every {@link LOOK_MS}; a look that throws is logged, and the next goes on. */
  const loop = Effect.sync(() => look()).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() =>
        console.error(`[clock] a look failed: ${wordsOf(Cause.squash(cause))}`)
      )
    ),
    Effect.repeat(Schedule.spaced(LOOK_MS)),
    Effect.asVoid
  );

  /** Hub start: the watches are read from their kept cursors, on the loop's fiber until the hub closes. */
  const start = (): void => {
    if (lifetime.closed()) {
      return;
    }
    const was = looping;
    looping = Effect.runFork(loop);
    if (was) {
      Effect.runFork(Fiber.interrupt(was));
    }
  };

  /** A project's GitHub poll as its ingress view says it. */
  const githubView = (projectId: string, remotes: readonly string[]) => {
    const repos = githubReposOf(remotes);
    const followed = store.githubWatches(projectId);
    const linked = linkedWatches(remotes, followed);
    const reading = [...new Set(linked.map((watch) => watch.reads))];
    const connection =
      reading.length > 0
        ? reading.join(", ")
        : (store.followedBy(projectId) ?? null);
    const named = repos.join(", ");
    const reason = pollProblem(
      linked.map((watch) => ({ repo: watch.container, reason: watch.reason }))
    );
    let state: string;
    if (repos.length === 0) {
      state = NO_GITHUB_LINK;
    } else if (linked.length === 0) {
      state = `${named} ${repos.length > 1 ? "aren't" : "isn't"} polled: grant the project a GitHub connection in ${configurePage("connections")}.`;
    } else if (reason) {
      state = `Polling ${named} with ${connection}; its last poll stopped: ${reason}`;
    } else {
      state = `Polling ${named} every 60 s with ${connection}.`;
    }
    const polledAt = latest(followed, "polledAt");
    const resumeAt = latest(followed, "resumeAt");
    const seen: IngressView["github"] = {
      repos,
      repo: repos.length > 0 ? named : null,
      connection,
      polled: linked.length > 0,
      state,
      resources: {},
      polledAt: polledAt === 0 ? null : polledAt,
      resumeAt: resumeAt === 0 ? null : resumeAt,
    };
    return seen;
  };

  /** Polls a project's repositories now, unless GitHub's rate limit holds it. */
  const pollGitHubNow = Effect.fnUntraced(function* (projectId: string) {
    const followed = store.githubWatches(projectId);
    if (followed.length === 0) {
      return problem(409, {
        code: "ingress-github-unpolled",
        detail: `This project has no GitHub connection, so its repository isn't polled. Grant it one in ${configurePage("connections")}.`,
      });
    }
    const resumeAt = latest(followed, "resumeAt");
    if (resumeAt > Date.now()) {
      return problem(409, {
        code: "ingress-github-rate-limited",
        detail: `GitHub's rate limit holds polls until ${new Date(resumeAt).toISOString()}.`,
      });
    }
    yield* once(`github:${projectId}`, pollGitHub(projectId));
  });

  /**
   * Reads the project's syncing watch now (the tracker's Sync now): a
   * board refused before asked again at once; resolves once the read is
   * stored and what it brought has run through the door.
   */
  const pollSyncNow = Effect.fnUntraced(function* (
    projectId: string
  ): Effect.fn.Return<void> {
    const watch = store
      .polledWatches()
      .find((one) => one.projectId === projectId && one.sync !== "off");
    if (!watch) {
      return;
    }
    store.dropStreams(watch.id, BOARD_STREAM);
    yield* watch.provider === "linear"
      ? once(`linear:${watch.id}`, pollLinear(watch.id))
      : once(`github:${projectId}`, pollGitHub(projectId));
    yield* intake.settled(projectId);
  });

  /** Calls a connector poll now. */
  const pollConnectorNow = (id: string): Promise<void> =>
    Effect.runPromise(once(`conn:${id}`, pollConnector(id)));

  /** What moving watches off a connection did, one log line each. */
  const sayRehomed = (gone: string, moved: readonly Rehomed[]): void => {
    for (const { projectId, container, to } of moved.filter(
      (move) => move.field === "connection"
    )) {
      console.log(
        `[clock] project ${projectId}: ${container} ${to ? `polled with ${to}` : "no longer polled"}, in place of ${gone}`
      );
    }
  };

  /**
   * A connection's projects were written (connections.ts `writeProjects`):
   * while it reads GitHub's API, each project it names that follows GitHub
   * with no connection follows it through this one from now, a watch of
   * each github.com repository it links (db/watches.ts `followGitHub`); a
   * project following another keeps that one. Each project it dropped, or
   * every one once it no longer reads GitHub's API, has its watches that
   * read through it moved to the connection the project follows by from
   * now, and stops following only where none is left (db/watches.ts
   * `rehome`).
   */
  const followConnection = (
    connection: string,
    dropped: readonly string[]
  ): void => {
    const found = connections.get(connection);
    const reads =
      found.service.trim().toLowerCase() === "github" &&
      readsGitHubApi(found.auth);
    if (!reads || dropped.length > 0) {
      sayRehomed(
        connection,
        store.rehome(connection, reads ? dropped : undefined)
      );
    }
    if (!reads) {
      return;
    }
    for (const projectId of found.projects) {
      if (store.followedBy(projectId) === undefined) {
        const repos = store.followGitHub(projectId, connection);
        console.log(
          repos.length > 0
            ? `[clock] project ${projectId}: polls ${repos.join(", ")} with ${connection}`
            : `[clock] project ${projectId}: links no repository on github.com; one it links is polled with ${connection}`
        );
      }
    }
  };

  lifetime.onClose(() => {
    if (looping) {
      Effect.runFork(Fiber.interrupt(looping));
      looping = undefined;
    }
  });

  return {
    followConnection,
    githubView,
    pollConnectorNow,
    /** The promise edge of a project's GitHub poll now: what its route answers. */
    pollGitHubNow: (projectId: string) =>
      Effect.runPromise(pollGitHubNow(projectId)),
    /** The promise edge of the tracker's Sync now (sync.ts). */
    pollSyncNow: (projectId: string) =>
      Effect.runPromise(pollSyncNow(projectId)),
    start,
  };
};

export type Clock = ReturnType<typeof createClock>;
