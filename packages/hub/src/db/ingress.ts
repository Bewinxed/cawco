import {
  and,
  asc,
  desc,
  eq,
  exists,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  connectorPollItems,
  connectorPolls,
  eventRouteKinds,
  eventRoutes,
  type GitHubCursor,
  type GitHubResource,
  githubPollCursors,
  githubPollers,
  inboundEvents,
} from "./schema";

export type InboundEventRow = typeof inboundEvents.$inferSelect;
/** A route with the kinds it takes (`event_route_kinds`); none takes any. */
export type EventRouteRow = typeof eventRoutes.$inferSelect & {
  kinds: string[];
};
/** A project's GitHub poller with its resources' cursors (`github_poll_cursors`). */
export type GitHubPollerRow = typeof githubPollers.$inferSelect & {
  cursors: Partial<Record<GitHubResource, GitHubCursor>>;
};
/** A connector poll with how many items its last call kept; null until it has looked. */
export type ConnectorPollRow = typeof connectorPolls.$inferSelect & {
  seen: number | null;
};

/** When a route last delivered an event. */
export interface Delivery {
  receivedAt: number;
  routeId: string;
}

/** The rows ingress.ts keeps. */
export interface IngressDb {
  /**
   * The lead's inbox, taken: every event routed to the lead and not yet
   * handled, oldest first, marked handled in the same statement, so two
   * wakes never carry one line.
   */
  readonly claimInbox: (projectId: string, at: Date) => InboundEventRow[];
  readonly connectorPoll: (id: string) => ConnectorPollRow | undefined;
  /** What a connector poll's last call saw, item id to version. */
  readonly connectorPollItems: (id: string) => Map<string, string>;
  /** A project's connector polls, or every one, oldest first. */
  readonly connectorPolls: (projectId?: string) => ConnectorPollRow[];
  readonly createConnectorPoll: (
    row: Omit<ConnectorPollRow, "seen">
  ) => ConnectorPollRow;
  readonly createRoute: (row: EventRouteRow) => EventRouteRow;
  readonly deleteConnectorPoll: (id: string) => boolean;
  readonly deleteRoute: (id: string) => boolean;
  /** Each of a project's routes' newest delivered event, in one query. */
  readonly deliveries: (projectId: string) => Delivery[];
  readonly event: (id: string) => InboundEventRow | undefined;
  /** A project's events, newest first. */
  readonly events: (projectId: string, limit: number) => InboundEventRow[];
  readonly githubPoller: (projectId: string) => GitHubPollerRow | undefined;
  readonly githubPollers: () => GitHubPollerRow[];
  /**
   * THE store of an event: inserted unless (source, delivery key) is there
   * already. Answers the row it inserted, or nothing when it was a repeat.
   */
  readonly insertEvent: (row: InboundEventRow) => InboundEventRow | undefined;
  /**
   * Keeps a call's outcome: what it saw replaces what the call before saw,
   * in one transaction with its `seenAt` and `polledAt`.
   */
  readonly keepConnectorPollItems: (
    id: string,
    items: ReadonlyMap<string, string>,
    polledAt: Date
  ) => void;
  /** Gives claimed inbox lines back, when the wake that took them did not go out. */
  readonly releaseInbox: (ids: string[]) => void;
  readonly route: (id: string) => EventRouteRow | undefined;
  /**
   * A project's routes, oldest first: the order they are tried in. With
   * `kind`, only those that take it: a route naming no kinds takes any.
   */
  readonly routes: (projectId: string, kind?: string) => EventRouteRow[];
  readonly setEvent: (
    id: string,
    patch: Pick<Partial<InboundEventRow>, "routedTo" | "routeId" | "handledAt">
  ) => void;
  /** Names the connection a project's repository is polled with; null stops its poller. */
  readonly setGitHubConnection: (
    projectId: string,
    connection: string | null
  ) => void;
  /** `seenAt: null` drops what it saw with it: its next call only looks. */
  readonly updateConnectorPoll: (
    id: string,
    patch: Partial<Omit<ConnectorPollRow, "id" | "createdAt" | "seen">>
  ) => ConnectorPollRow | undefined;
  /**
   * Keeps a poll's outcome: the row's fields named, and each cursor in
   * `cursors` over the one it had, in one transaction. A repository other
   * than the one kept starts its cursors afresh.
   */
  readonly updateGitHubPoller: (
    projectId: string,
    patch: Partial<Omit<GitHubPollerRow, "projectId" | "connection">>
  ) => void;
  readonly updateRoute: (
    id: string,
    patch: Partial<Omit<EventRouteRow, "id" | "createdAt">>
  ) => EventRouteRow | undefined;
}

export const ingressDb = (db: BunSQLiteDatabase): IngressDb => {
  /** Each route with its kinds, in the order they were written. */
  const withKinds = (
    rows: (typeof eventRoutes.$inferSelect)[]
  ): EventRouteRow[] => {
    const kinds = new Map<string, string[]>();
    if (rows.length > 0) {
      for (const { routeId, kind } of db
        .select()
        .from(eventRouteKinds)
        .where(
          inArray(
            eventRouteKinds.routeId,
            rows.map((row) => row.id)
          )
        )
        .orderBy(sql`rowid`)
        .all()) {
        kinds.set(routeId, [...(kinds.get(routeId) ?? []), kind]);
      }
    }
    return rows.map((row) => ({ ...row, kinds: kinds.get(row.id) ?? [] }));
  };
  /** A connector poll's columns, and how many items its last call kept (null until it looked). */
  const pollColumns = {
    ...getTableColumns(connectorPolls),
    seen: sql<
      number | null
    >`case when ${connectorPolls.seenAt} is null then null else (select count(*) from ${connectorPollItems} where ${connectorPollItems.pollId} = ${connectorPolls.id}) end`,
  };
  const pollOf = (id: string): ConnectorPollRow | undefined =>
    db
      .select(pollColumns)
      .from(connectorPolls)
      .where(eq(connectorPolls.id, id))
      .get();
  /** Each poller with its resources' cursors. */
  const withCursors = (
    rows: (typeof githubPollers.$inferSelect)[]
  ): GitHubPollerRow[] => {
    const cursors = new Map<string, GitHubPollerRow["cursors"]>();
    if (rows.length > 0) {
      for (const { projectId, resource, ...cursor } of db
        .select()
        .from(githubPollCursors)
        .where(
          inArray(
            githubPollCursors.projectId,
            rows.map((row) => row.projectId)
          )
        )
        .all()) {
        cursors.set(projectId, {
          ...cursors.get(projectId),
          [resource]: cursor,
        });
      }
    }
    return rows.map((row) => ({
      ...row,
      cursors: cursors.get(row.projectId) ?? {},
    }));
  };
  /** A route's kinds replaced by `kinds`, in the transaction `tx`. */
  const putKinds = (
    tx: Pick<BunSQLiteDatabase, "delete" | "insert">,
    routeId: string,
    kinds: readonly string[]
  ) => {
    tx.delete(eventRouteKinds)
      .where(eq(eventRouteKinds.routeId, routeId))
      .run();
    const distinct = [...new Set(kinds)];
    if (distinct.length > 0) {
      tx.insert(eventRouteKinds)
        .values(distinct.map((kind) => ({ routeId, kind })))
        .run();
    }
  };
  return {
    insertEvent: (row) =>
      db
        .insert(inboundEvents)
        .values(row)
        .onConflictDoNothing()
        .returning()
        .get(),
    event: (id) =>
      db.select().from(inboundEvents).where(eq(inboundEvents.id, id)).get(),
    deliveries: (projectId) =>
      db
        .select({
          routeId: sql<string>`${inboundEvents.routeId}`,
          receivedAt: sql<number>`max(${inboundEvents.receivedAt})`,
        })
        .from(inboundEvents)
        .where(
          and(
            eq(inboundEvents.projectId, projectId),
            isNotNull(inboundEvents.routeId)
          )
        )
        .groupBy(inboundEvents.routeId)
        .all(),
    events: (projectId, limit) =>
      db
        .select()
        .from(inboundEvents)
        .where(eq(inboundEvents.projectId, projectId))
        .orderBy(desc(inboundEvents.receivedAt))
        .limit(limit)
        .all(),
    setEvent: (id, patch) => {
      db.update(inboundEvents).set(patch).where(eq(inboundEvents.id, id)).run();
    },
    claimInbox: (projectId, at) =>
      db
        .update(inboundEvents)
        .set({ handledAt: at })
        .where(
          and(
            eq(inboundEvents.projectId, projectId),
            eq(inboundEvents.routedTo, "lead"),
            isNull(inboundEvents.handledAt)
          )
        )
        .returning()
        .all()
        .sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime()),
    releaseInbox: (ids) => {
      if (ids.length > 0) {
        db.update(inboundEvents)
          .set({ handledAt: null })
          .where(inArray(inboundEvents.id, ids))
          .run();
      }
    },
    routes: (projectId, kind) => {
      const ofRoute = eq(eventRouteKinds.routeId, eventRoutes.id);
      return withKinds(
        db
          .select()
          .from(eventRoutes)
          .where(
            and(
              eq(eventRoutes.projectId, projectId),
              kind === undefined
                ? undefined
                : or(
                    notExists(
                      db
                        .select({ one: sql`1` })
                        .from(eventRouteKinds)
                        .where(ofRoute)
                    ),
                    exists(
                      db
                        .select({ one: sql`1` })
                        .from(eventRouteKinds)
                        .where(and(ofRoute, eq(eventRouteKinds.kind, kind)))
                    )
                  )
            )
          )
          .orderBy(asc(eventRoutes.createdAt))
          .all()
      );
    },
    route: (id) =>
      withKinds(
        db.select().from(eventRoutes).where(eq(eventRoutes.id, id)).all()
      )[0],
    createRoute: ({ kinds, ...row }) =>
      db.transaction((tx) => {
        const created = tx.insert(eventRoutes).values(row).returning().get();
        putKinds(tx, created.id, kinds);
        return { ...created, kinds: [...new Set(kinds)] };
      }),
    updateRoute: (id, { kinds, ...patch }) =>
      db.transaction((tx) => {
        const updated = tx
          .update(eventRoutes)
          .set(patch)
          .where(eq(eventRoutes.id, id))
          .returning()
          .get();
        if (updated && kinds !== undefined) {
          putKinds(tx, id, kinds);
        }
        return updated && withKinds([updated])[0];
      }),
    deleteRoute: (id) =>
      db.delete(eventRoutes).where(eq(eventRoutes.id, id)).returning().all()
        .length > 0,
    githubPoller: (projectId) =>
      withCursors(
        db
          .select()
          .from(githubPollers)
          .where(eq(githubPollers.projectId, projectId))
          .all()
      )[0],
    githubPollers: () => withCursors(db.select().from(githubPollers).all()),
    setGitHubConnection: (projectId, connection) => {
      if (connection === null) {
        db.delete(githubPollers)
          .where(eq(githubPollers.projectId, projectId))
          .run();
        return;
      }
      db.insert(githubPollers)
        .values({ projectId, connection, repo: null })
        .onConflictDoUpdate({
          target: githubPollers.projectId,
          set: { connection, reason: null, resumeAt: null },
        })
        .run();
    },
    updateGitHubPoller: (projectId, { cursors, ...patch }) => {
      db.transaction((tx) => {
        const stored = tx
          .select({ repo: githubPollers.repo })
          .from(githubPollers)
          .where(eq(githubPollers.projectId, projectId))
          .get();
        if (!stored) {
          return;
        }
        // Another repository starts its cursors afresh.
        if (patch.repo !== undefined && patch.repo !== stored.repo) {
          tx.delete(githubPollCursors)
            .where(eq(githubPollCursors.projectId, projectId))
            .run();
        }
        if (Object.keys(patch).length > 0) {
          tx.update(githubPollers)
            .set(patch)
            .where(eq(githubPollers.projectId, projectId))
            .run();
        }
        for (const [resource, cursor] of Object.entries(cursors ?? {})) {
          if (cursor) {
            tx.insert(githubPollCursors)
              .values({
                projectId,
                resource: resource as GitHubResource,
                ...cursor,
              })
              .onConflictDoUpdate({
                target: [
                  githubPollCursors.projectId,
                  githubPollCursors.resource,
                ],
                set: cursor,
              })
              .run();
          }
        }
      });
    },
    connectorPolls: (projectId) =>
      db
        .select(pollColumns)
        .from(connectorPolls)
        .where(
          projectId === undefined
            ? undefined
            : eq(connectorPolls.projectId, projectId)
        )
        .orderBy(asc(connectorPolls.createdAt))
        .all(),
    connectorPoll: (id) => pollOf(id),
    connectorPollItems: (id) =>
      new Map(
        db
          .select({
            itemId: connectorPollItems.itemId,
            version: connectorPollItems.version,
          })
          .from(connectorPollItems)
          .where(eq(connectorPollItems.pollId, id))
          .all()
          .map(({ itemId, version }) => [itemId, version])
      ),
    createConnectorPoll: (row) => {
      db.insert(connectorPolls).values(row).run();
      return { ...row, seen: null };
    },
    keepConnectorPollItems: (id, items, polledAt) => {
      db.transaction((tx) => {
        tx.delete(connectorPollItems)
          .where(eq(connectorPollItems.pollId, id))
          .run();
        if (items.size > 0) {
          tx.insert(connectorPollItems)
            .values(
              [...items].map(([itemId, version]) => ({
                pollId: id,
                itemId,
                version,
              }))
            )
            .run();
        }
        tx.update(connectorPolls)
          .set({ seenAt: polledAt, reason: null, polledAt })
          .where(eq(connectorPolls.id, id))
          .run();
      });
    },
    updateConnectorPoll: (id, patch) =>
      db.transaction((tx) => {
        if (patch.seenAt === null) {
          tx.delete(connectorPollItems)
            .where(eq(connectorPollItems.pollId, id))
            .run();
        }
        tx.update(connectorPolls)
          .set(patch)
          .where(eq(connectorPolls.id, id))
          .run();
        return pollOf(id);
      }),
    deleteConnectorPoll: (id) =>
      db
        .delete(connectorPolls)
        .where(eq(connectorPolls.id, id))
        .returning()
        .all().length > 0,
  };
};
