import { asc, eq, ne } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { relays } from "./schema";

export type RelayRow = typeof relays.$inferSelect;

/** What may change on a relay after it is made: never its id, project, provider or maker. */
export type RelayPatch = Partial<
  Omit<RelayRow, "id" | "projectId" | "provider" | "createdBy" | "createdAt">
>;

/** The rows relay.ts keeps. */
export interface RelaysDb {
  /** Every relay not turned off, oldest first: what the hub host applies. */
  readonly active: () => RelayRow[];
  /** Whether any relay was ever made: only then may Funnel hold the relay's mount. */
  readonly anyEver: () => boolean;
  readonly create: (row: RelayRow) => RelayRow;
  readonly get: (id: string) => RelayRow | undefined;
  /** A project's relays, off ones included, oldest first. */
  readonly ofProject: (projectId: string) => RelayRow[];
  readonly update: (id: string, patch: RelayPatch) => RelayRow | undefined;
}

export const relaysDb = (db: BunSQLiteDatabase): RelaysDb => ({
  active: () =>
    db
      .select()
      .from(relays)
      .where(ne(relays.state, "off"))
      .orderBy(asc(relays.createdAt))
      .all(),
  anyEver: () =>
    db.select({ id: relays.id }).from(relays).limit(1).get() !== undefined,
  create: (row) => db.insert(relays).values(row).returning().get(),
  get: (id) => db.select().from(relays).where(eq(relays.id, id)).get(),
  ofProject: (projectId) =>
    db
      .select()
      .from(relays)
      .where(eq(relays.projectId, projectId))
      .orderBy(asc(relays.createdAt))
      .all(),
  update: (id, patch) =>
    db.update(relays).set(patch).where(eq(relays.id, id)).returning().get(),
});
