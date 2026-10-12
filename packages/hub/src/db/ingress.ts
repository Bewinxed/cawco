import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  connectorPolls,
  eventRoutes,
  githubPollers,
  inboundEvents,
} from "./schema";

export type InboundEventRow = typeof inboundEvents.$inferSelect;
export type EventRouteRow = typeof eventRoutes.$inferSelect;
export type GitHubPollerRow = typeof githubPollers.$inferSelect;
export type ConnectorPollRow = typeof connectorPolls.$inferSelect;

/** The rows ingress.ts keeps. */
export interface IngressDb {
  /**
   * The lead's inbox, taken: every event routed to the lead and not yet
   * handled, oldest first, marked handled in the same statement, so two
   * wakes never carry one line.
   */
  readonly claimInbox: (projectId: string, at: Date) => InboundEventRow[];
  readonly connectorPoll: (id: string) => ConnectorPollRow | undefined;
  /** A project's connector polls, or every one, oldest first. */
  readonly connectorPolls: (projectId?: string) => ConnectorPollRow[];
  readonly createConnectorPoll: (row: ConnectorPollRow) => ConnectorPollRow;
  readonly createRoute: (row: EventRouteRow) => EventRouteRow;
  readonly deleteConnectorPoll: (id: string) => boolean;
  readonly deleteRoute: (id: string) => boolean;
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
  /** Gives claimed inbox lines back, when the wake that took them did not go out. */
  readonly releaseInbox: (ids: string[]) => void;
  readonly route: (id: string) => EventRouteRow | undefined;
  /** A project's routes, oldest first: the order they are tried in. */
  readonly routes: (projectId: string) => EventRouteRow[];
  readonly setEvent: (
    id: string,
    patch: Pick<Partial<InboundEventRow>, "routedTo" | "handledAt">
  ) => void;
  /** Names the connection a project's repository is polled with; null stops its poller. */
  readonly setGitHubConnection: (
    projectId: string,
    connection: string | null
  ) => void;
  readonly updateConnectorPoll: (
    id: string,
    patch: Partial<Omit<ConnectorPollRow, "id" | "createdAt">>
  ) => ConnectorPollRow | undefined;
  readonly updateGitHubPoller: (
    projectId: string,
    patch: Partial<Omit<GitHubPollerRow, "projectId" | "connection">>
  ) => void;
  readonly updateRoute: (
    id: string,
    patch: Partial<Omit<EventRouteRow, "id" | "createdAt">>
  ) => EventRouteRow | undefined;
}

export const ingressDb = (db: BunSQLiteDatabase): IngressDb => ({
  insertEvent: (row) =>
    db
      .insert(inboundEvents)
      .values(row)
      .onConflictDoNothing()
      .returning()
      .get(),
  event: (id) =>
    db.select().from(inboundEvents).where(eq(inboundEvents.id, id)).get(),
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
  routes: (projectId) =>
    db
      .select()
      .from(eventRoutes)
      .where(eq(eventRoutes.projectId, projectId))
      .orderBy(asc(eventRoutes.createdAt))
      .all(),
  route: (id) =>
    db.select().from(eventRoutes).where(eq(eventRoutes.id, id)).get(),
  createRoute: (row) => db.insert(eventRoutes).values(row).returning().get(),
  updateRoute: (id, patch) =>
    db
      .update(eventRoutes)
      .set(patch)
      .where(eq(eventRoutes.id, id))
      .returning()
      .get(),
  deleteRoute: (id) =>
    db.delete(eventRoutes).where(eq(eventRoutes.id, id)).returning().all()
      .length > 0,
  githubPoller: (projectId) =>
    db
      .select()
      .from(githubPollers)
      .where(eq(githubPollers.projectId, projectId))
      .get(),
  githubPollers: () => db.select().from(githubPollers).all(),
  setGitHubConnection: (projectId, connection) => {
    if (connection === null) {
      db.delete(githubPollers)
        .where(eq(githubPollers.projectId, projectId))
        .run();
      return;
    }
    db.insert(githubPollers)
      .values({ projectId, connection, repo: null, cursors: {} })
      .onConflictDoUpdate({
        target: githubPollers.projectId,
        set: { connection, reason: null, resumeAt: null },
      })
      .run();
  },
  updateGitHubPoller: (projectId, patch) => {
    db.update(githubPollers)
      .set(patch)
      .where(eq(githubPollers.projectId, projectId))
      .run();
  },
  connectorPolls: (projectId) => {
    const query = db.select().from(connectorPolls);
    return (
      projectId === undefined
        ? query
        : query.where(eq(connectorPolls.projectId, projectId))
    )
      .orderBy(asc(connectorPolls.createdAt))
      .all();
  },
  connectorPoll: (id) =>
    db.select().from(connectorPolls).where(eq(connectorPolls.id, id)).get(),
  createConnectorPoll: (row) =>
    db.insert(connectorPolls).values(row).returning().get(),
  updateConnectorPoll: (id, patch) =>
    db
      .update(connectorPolls)
      .set(patch)
      .where(eq(connectorPolls.id, id))
      .returning()
      .get(),
  deleteConnectorPoll: (id) =>
    db.delete(connectorPolls).where(eq(connectorPolls.id, id)).returning().all()
      .length > 0,
});
