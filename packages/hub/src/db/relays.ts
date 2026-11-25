import { asc, eq, ne } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { relays, watches } from "./schema";
import type { WatchRow } from "./watches";

export type RelayRow = typeof relays.$inferSelect;

/** What may change on a relay after it is made: never its id, project, watch or maker. */
export type RelayPatch = Partial<
  Omit<RelayRow, "id" | "projectId" | "watchId" | "createdBy" | "createdAt">
>;

/** A relay with the watch it belongs to (provider spec §2.4). */
export interface RelayHeld {
  relay: RelayRow;
  watch: WatchRow;
}

/**
 * The watch a new relay goes into: one of the project's own, by id, or a
 * new one made with it in the same transaction (a sender's watch of
 * provider `connection`, or a repository's watch the project has none of).
 */
export type RelayWatch =
  { id: string; kind: "existing" } | { kind: "new"; row: WatchRow };

/** The rows relay.ts keeps. */
export interface RelaysDb {
  /** Every relay not turned off, oldest first, with its watch: what the hub host applies. */
  readonly active: () => RelayHeld[];
  /** Whether any relay was ever made: only then may Funnel hold the relay's mount. */
  readonly anyEver: () => boolean;
  /** A relay made, into `watch`. */
  readonly create: (
    row: Omit<RelayRow, "watchId">,
    watch: RelayWatch
  ) => RelayHeld;
  readonly get: (id: string) => RelayHeld | undefined;
  /** A project's relays, off ones included, oldest first, each with its watch. */
  readonly ofProject: (projectId: string) => RelayHeld[];
  readonly update: (id: string, patch: RelayPatch) => RelayRow | undefined;
  /** Every watch of project `projectId`, polled or not: what a new relay may go into. */
  readonly watchesOf: (projectId: string) => WatchRow[];
}

export const relaysDb = (db: BunSQLiteDatabase): RelaysDb => {
  const joined = () =>
    db
      .select({ relay: relays, watch: watches })
      .from(relays)
      .innerJoin(watches, eq(watches.id, relays.watchId));
  return {
    active: () =>
      joined()
        .where(ne(relays.state, "off"))
        .orderBy(asc(relays.createdAt))
        .all(),
    anyEver: () =>
      db.select({ id: relays.id }).from(relays).limit(1).get() !== undefined,
    create: (row, watch) =>
      db.transaction((tx) => {
        const into =
          watch.kind === "new"
            ? tx.insert(watches).values(watch.row).returning().get()
            : tx.select().from(watches).where(eq(watches.id, watch.id)).get();
        if (!into) {
          throw new Error(
            `There is no watch ${watch.kind === "existing" ? watch.id : watch.row.id}.`
          );
        }
        const relay = tx
          .insert(relays)
          .values({ ...row, watchId: into.id })
          .returning()
          .get();
        return { relay, watch: into };
      }),
    get: (id) => joined().where(eq(relays.id, id)).get(),
    ofProject: (projectId) =>
      joined()
        .where(eq(relays.projectId, projectId))
        .orderBy(asc(relays.createdAt))
        .all(),
    update: (id, patch) =>
      db.update(relays).set(patch).where(eq(relays.id, id)).returning().get(),
    watchesOf: (projectId) =>
      db
        .select()
        .from(watches)
        .where(eq(watches.projectId, projectId))
        .orderBy(asc(watches.createdAt))
        .all(),
  };
};
