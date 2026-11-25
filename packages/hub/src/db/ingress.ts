import { withoutUndefined } from "@cawco/core/without-undefined";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  notExists,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { writeItem } from "./external-items";
import {
  eventRouteKinds,
  eventRoutes,
  externalItems,
  inboundEvents,
  watchCursors,
  watches,
} from "./schema";
import {
  type GitHubWatchesDb,
  githubWatchesDb,
  ITEMS_STREAM,
  settingsWith,
  type WatchRow,
} from "./watches";

export type InboundEventRow = typeof inboundEvents.$inferSelect;
/** A route with the kinds it takes (`event_route_kinds`); none takes any. */
export type EventRouteRow = typeof eventRoutes.$inferSelect & {
  kinds: string[];
};
/**
 * A connector poll (ingress.ts): one connection's read tool called on an
 * interval, its items diffed by id and version into `inbound_events`. Kept
 * as a watch of provider `connection` with the poll's id, its tool and
 * paths in the watch's settings, and how many items its last call kept;
 * null until it has looked.
 */
export interface ConnectorPollRow {
  args: Record<string, unknown>;
  connection: string;
  createdAt: Date;
  /** `owner`, or the id of the session that made it. */
  createdBy: string;
  enabled: boolean;
  id: string;
  /** A dot path to each item's id. */
  idPath: string;
  /** Seconds between calls, 60 or more. */
  intervalS: number;
  /** A dot path to the array of items in the result; empty: the result is the array. */
  itemsPath: string;
  polledAt: Date | null;
  projectId: string;
  reason: string | null;
  seen: number | null;
  /**
   * When a call last kept what it saw (its records, `external_items`); null until
   * its first call, and after an edit to what it lists or keys by, when
   * the next call only looks.
   */
  seenAt: Date | null;
  tool: string;
  /** A dot path to each item's version (`updated_at`). */
  versionPath: string;
}

/** A connector poll's fields that its watch's settings hold. */
type PollSettings = Pick<
  ConnectorPollRow,
  "args" | "idPath" | "intervalS" | "itemsPath" | "tool" | "versionPath"
>;

/** When a route last delivered an event. */
export interface Delivery {
  receivedAt: number;
  routeId: string;
}

/** The rows ingress.ts keeps. */
export interface IngressDb extends GitHubWatchesDb {
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
  /** How many events a project has received. */
  readonly eventCount: (projectId: string) => number;
  /** A project's events, newest first. */
  readonly events: (
    projectId: string,
    limit: number,
    skip?: number
  ) => InboundEventRow[];
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
  /**
   * A project's events received since `since` (ms) that no route in
   * `routeIds` took, counted by source and kind in one query, most first.
   */
  readonly unroutedCounts: (
    projectId: string,
    since: number,
    routeIds: readonly string[]
  ) => { source: string; kind: string; count: number }[];
  /** `seenAt: null` drops what it saw with it: its next call only looks. */
  readonly updateConnectorPoll: (
    id: string,
    patch: Partial<Omit<ConnectorPollRow, "id" | "createdAt" | "seen">>
  ) => ConnectorPollRow | undefined;
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
  const isPoll = eq(watches.provider, "connection");
  /** A connector poll's records (schema `external_items`, kind `record`): its watch's id is their container. */
  const recordsOf = (ids: string[]) =>
    and(
      eq(externalItems.provider, "connection"),
      eq(externalItems.host, ""),
      inArray(externalItems.container, ids),
      eq(externalItems.kind, "record")
    );
  /** Each watch read as its connector poll, with how many items its last call kept (null until it looked). */
  const pollsOf = (rows: WatchRow[]): ConnectorPollRow[] => {
    if (rows.length === 0) {
      return [];
    }
    const ids = rows.map((row) => row.id);
    const looked = new Map(
      db
        .select({ id: watchCursors.watchId, at: watchCursors.updatedAt })
        .from(watchCursors)
        .where(
          and(
            inArray(watchCursors.watchId, ids),
            eq(watchCursors.stream, ITEMS_STREAM)
          )
        )
        .all()
        .map(({ id, at }) => [id, at])
    );
    const counts = new Map(
      db
        .select({ id: externalItems.container, n: sql<number>`count(*)` })
        .from(externalItems)
        .where(recordsOf(ids))
        .groupBy(externalItems.container)
        .all()
        .map(({ id, n }) => [id, n])
    );
    return rows.map((row) => {
      const { settings } = row;
      const seen = looked.has(row.id);
      return {
        id: row.id,
        projectId: row.projectId,
        connection: row.connection,
        tool: settings.tool ?? "",
        args: settings.args ?? {},
        intervalS: settings.intervalS ?? 60,
        itemsPath: settings.itemsPath ?? "",
        idPath: settings.idPath ?? "",
        versionPath: settings.versionPath ?? "",
        enabled: row.enabled,
        seenAt: seen ? (looked.get(row.id) ?? row.createdAt) : null,
        reason: row.reason,
        polledAt: row.polledAt,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        seen: seen ? (counts.get(row.id) ?? 0) : null,
      };
    });
  };
  const pollOf = (id: string): ConnectorPollRow | undefined =>
    pollsOf(
      db
        .select()
        .from(watches)
        .where(and(eq(watches.id, id), isPoll))
        .all()
    )[0];
  /** A poll's settings as its watch keeps them. */
  const settingsOf = ({
    tool,
    args,
    intervalS,
    itemsPath,
    idPath,
    versionPath,
  }: Partial<PollSettings>): Partial<PollSettings> =>
    withoutUndefined({ tool, args, intervalS, itemsPath, idPath, versionPath });
  /** The poll has looked as of `at`: its stream's row, its count of calls with it. */
  const looked = (
    tx: Pick<BunSQLiteDatabase, "insert">,
    id: string,
    at: Date
  ) => {
    tx.insert(watchCursors)
      .values({
        watchId: id,
        stream: ITEMS_STREAM,
        cursor: {},
        polls: 1,
        updatedAt: at,
      })
      .onConflictDoUpdate({
        target: [watchCursors.watchId, watchCursors.stream],
        set: { updatedAt: at, polls: sql`${watchCursors.polls} + 1` },
      })
      .run();
  };
  /** The poll has not looked: what it saw goes with its stream's row. */
  const unlooked = (tx: Pick<BunSQLiteDatabase, "delete">, id: string) => {
    tx.delete(externalItems)
      .where(recordsOf([id]))
      .run();
    tx.delete(watchCursors)
      .where(
        and(eq(watchCursors.watchId, id), eq(watchCursors.stream, ITEMS_STREAM))
      )
      .run();
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
    events: (projectId, limit, skip = 0) =>
      db
        .select()
        .from(inboundEvents)
        .where(eq(inboundEvents.projectId, projectId))
        .orderBy(desc(inboundEvents.receivedAt))
        .limit(limit)
        .offset(skip)
        .all(),
    unroutedCounts: (projectId, since, routeIds) =>
      db
        .select({
          source: inboundEvents.source,
          kind: inboundEvents.kind,
          count: sql<number>`count(*)`,
        })
        .from(inboundEvents)
        .where(
          and(
            eq(inboundEvents.projectId, projectId),
            gte(inboundEvents.receivedAt, new Date(since)),
            routeIds.length > 0
              ? or(
                  isNull(inboundEvents.routedTo),
                  notInArray(inboundEvents.routedTo, [...routeIds])
                )
              : undefined
          )
        )
        .groupBy(inboundEvents.source, inboundEvents.kind)
        .orderBy(desc(sql`count(*)`))
        .all(),
    eventCount: (projectId) =>
      db
        .select({ n: sql<number>`count(*)` })
        .from(inboundEvents)
        .where(eq(inboundEvents.projectId, projectId))
        .get()?.n ?? 0,
    setEvent: (id, patch) => {
      db.update(inboundEvents).set(patch).where(eq(inboundEvents.id, id)).run();
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
    ...githubWatchesDb(db),
    connectorPolls: (projectId) =>
      pollsOf(
        db
          .select()
          .from(watches)
          .where(
            and(
              isPoll,
              projectId === undefined
                ? undefined
                : eq(watches.projectId, projectId)
            )
          )
          .orderBy(asc(watches.createdAt))
          .all()
      ),
    connectorPoll: (id) => pollOf(id),
    connectorPollItems: (id) =>
      new Map(
        db
          .select({ key: externalItems.key, version: externalItems.version })
          .from(externalItems)
          .where(recordsOf([id]))
          .all()
          .map(({ key, version }) => [key, version ?? ""])
      ),
    createConnectorPoll: (row) => {
      db.transaction((tx) => {
        tx.insert(watches)
          .values({
            id: row.id,
            projectId: row.projectId,
            provider: "connection",
            host: "",
            container: row.id,
            containerName: `${row.connection}/${row.tool}`,
            containerUrl: "",
            connection: row.connection,
            sync: "off",
            settings: settingsOf(row),
            enabled: row.enabled,
            reason: row.reason,
            polledAt: row.polledAt,
            createdBy: row.createdBy,
            createdAt: row.createdAt,
          })
          .run();
        if (row.seenAt) {
          looked(tx, row.id, row.seenAt);
        }
      });
      return { ...row, seen: row.seenAt ? 0 : null };
    },
    keepConnectorPollItems: (id, items, polledAt) => {
      db.transaction((tx) => {
        const poll = tx
          .select({ projectId: watches.projectId })
          .from(watches)
          .where(and(eq(watches.id, id), isPoll))
          .get();
        if (!poll) {
          return;
        }
        // What this call saw, each record through the mirror's one writer;
        // a record it no longer lists goes, so its return is new again.
        tx.delete(externalItems)
          .where(
            and(
              recordsOf([id]),
              notInArray(externalItems.key, [...items.keys()])
            )
          )
          .run();
        for (const [key, version] of items) {
          writeItem(
            tx,
            poll.projectId,
            {
              provider: "connection",
              host: "",
              container: id,
              kind: "record",
              key,
              ref: key,
              url: null,
            },
            { version, readAt: polledAt }
          );
        }
        looked(tx, id, polledAt);
        tx.update(watches)
          .set({ reason: null, polledAt })
          .where(and(eq(watches.id, id), isPoll))
          .run();
      });
    },
    updateConnectorPoll: (id, patch) =>
      db.transaction((tx) => {
        const was = tx
          .select()
          .from(watches)
          .where(and(eq(watches.id, id), isPoll))
          .get();
        if (!was) {
          return;
        }
        const { seenAt, projectId, connection, enabled, reason, polledAt } =
          patch;
        if (seenAt === null) {
          unlooked(tx, id);
        } else if (seenAt) {
          looked(tx, id, seenAt);
        }
        if (projectId !== undefined && projectId !== was.projectId) {
          // Its records go with it: what it saw is the poll's, wherever it is.
          tx.update(externalItems)
            .set({ projectId })
            .where(recordsOf([id]))
            .run();
        }
        const settings = settingsWith(was.settings, settingsOf(patch));
        const columns = withoutUndefined({
          projectId,
          connection,
          enabled,
          reason,
          polledAt,
        });
        tx.update(watches)
          .set({
            ...columns,
            settings,
            containerName: `${connection ?? was.connection}/${settings.tool ?? ""}`,
          })
          .where(eq(watches.id, id))
          .run();
        return pollOf(id);
      }),
    deleteConnectorPoll: (id) =>
      db.transaction((tx) => {
        const gone =
          tx
            .delete(watches)
            .where(and(eq(watches.id, id), isPoll))
            .returning()
            .all().length > 0;
        if (gone) {
          tx.delete(externalItems)
            .where(recordsOf([id]))
            .run();
        }
        return gone;
      }),
  };
};
