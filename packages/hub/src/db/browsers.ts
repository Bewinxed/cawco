import type {
  BrowserHostKind,
  BrowserKey,
  BrowserState,
} from "@cawco/core/browser";
import { and, eq, notInArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { browsers } from "./schema";

/** One browser as the hub keeps it. */
export interface StoredBrowser {
  host: BrowserHostKind;
  key: BrowserKey;
  lastUsedAt: number;
  machineId: string;
  name: string;
  projectId: string | null;
  state: BrowserState;
  /** Who holds it privately: the asking workspace, `""` when nobody asked; null while nobody does. */
  takeover: { by: string; requestId: string | null; since: number } | null;
}

/** The rows browsers.ts keeps. */
export interface BrowsersDb {
  readonly get: (
    machineId: string,
    key: BrowserKey
  ) => StoredBrowser | undefined;
  readonly list: () => StoredBrowser[];
  /** One browser of a machine, as its machine just answered it. */
  readonly put: (
    machineId: string,
    row: Omit<StoredBrowser, "machineId">
  ) => void;
  /** One browser of a machine gone: removed there (its profile deleted). */
  readonly remove: (machineId: string, key: BrowserKey) => void;
  /** A machine's browsers, whole: the rows it no longer names go. */
  readonly replace: (
    machineId: string,
    rows: Omit<StoredBrowser, "machineId">[]
  ) => void;
}

const projectOf = (key: BrowserKey): string | null =>
  key.startsWith("project:") ? key.slice("project:".length) : null;

const stored = (row: typeof browsers.$inferSelect): StoredBrowser => ({
  key: row.key,
  machineId: row.machineId,
  projectId: row.projectId,
  name: row.name,
  host: row.host,
  state: row.state,
  lastUsedAt: row.lastUsedAt.getTime(),
  takeover:
    row.takeoverBy === null
      ? null
      : {
          by: row.takeoverBy,
          requestId: row.takeoverRequestId,
          since: row.takeoverSince?.getTime() ?? 0,
        },
});

/** Writes one browser's row, made or replaced. */
const upsert = (
  db: Pick<BunSQLiteDatabase, "insert">,
  machineId: string,
  row: Omit<StoredBrowser, "machineId">
): void => {
  const values = {
    projectId: projectOf(row.key),
    name: row.name,
    host: row.host,
    state: row.state,
    takeoverBy: row.takeover?.by ?? null,
    takeoverRequestId: row.takeover?.requestId ?? null,
    takeoverSince: row.takeover ? new Date(row.takeover.since) : null,
    lastUsedAt: new Date(row.lastUsedAt),
    updatedAt: new Date(),
  };
  db.insert(browsers)
    .values({ key: row.key, machineId, ...values })
    .onConflictDoUpdate({
      target: [browsers.machineId, browsers.key],
      set: values,
    })
    .run();
};

export const browsersDb = (db: BunSQLiteDatabase): BrowsersDb => ({
  get: (machineId, key) => {
    const row = db
      .select()
      .from(browsers)
      .where(and(eq(browsers.machineId, machineId), eq(browsers.key, key)))
      .get();
    return row && stored(row);
  },
  list: () => db.select().from(browsers).all().map(stored),
  put: (machineId, row) => upsert(db, machineId, row),
  remove: (machineId, key) => {
    db.delete(browsers)
      .where(and(eq(browsers.machineId, machineId), eq(browsers.key, key)))
      .run();
  },
  replace: (machineId, rows) => {
    db.transaction((tx) => {
      const keys = rows.map((row) => row.key);
      tx.delete(browsers)
        .where(
          and(
            eq(browsers.machineId, machineId),
            keys.length > 0 ? notInArray(browsers.key, keys) : undefined
          )
        )
        .run();
      for (const row of rows) {
        upsert(tx, machineId, row);
      }
    });
  },
});
