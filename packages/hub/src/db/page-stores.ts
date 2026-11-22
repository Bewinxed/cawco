/**
 * Pages' stores' update logs (schema.ts `pageStoreUpdates`): what
 * artifacts/page-stores.ts loads each store from and appends each update
 * to, as db/artifacts.ts keeps an artifact's doc.
 */
import { asc, eq, max } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { artifacts, pageStoreUpdates, projects } from "./schema";

/** Whose a store is: one artifact's, or one project's, shared by its pages. */
export const STORE_SCOPES = ["artifact", "project"] as const;
export type StoreScope = (typeof STORE_SCOPES)[number];

/** A store: its scope and the id of the artifact or project it is kept for. */
export interface StoreKey {
  id: string;
  scope: StoreScope;
}

/** The store's name in its log's rows (schema.ts `pageStoreUpdates.store`). */
export const storeName = ({ scope, id }: StoreKey): string => `${scope}:${id}`;

export interface PageStoresDb {
  /**
   * Appends one update to the store's log at its next seq; false, and
   * nothing kept, once the artifact or project it is kept for is gone.
   */
  readonly append: (key: StoreKey, update: Uint8Array) => boolean;
  /** Replaces the store's log with one snapshot, at the seq the log had reached. */
  readonly compact: (key: StoreKey, snapshot: Uint8Array) => void;
  /** Every update of the store's log, in order. */
  readonly updates: (key: StoreKey) => Uint8Array[];
}

/** The owner columns of a store's rows. */
const ownerOf = (key: StoreKey) =>
  key.scope === "artifact"
    ? { artifactId: key.id, projectId: null }
    : { artifactId: null, projectId: key.id };

export const pageStoresDb = (db: BunSQLiteDatabase): PageStoresDb => {
  const lastSeq = (
    tx: Pick<BunSQLiteDatabase, "select">,
    store: string
  ): number =>
    tx
      .select({ seq: max(pageStoreUpdates.seq) })
      .from(pageStoreUpdates)
      .where(eq(pageStoreUpdates.store, store))
      .get()?.seq ?? 0;
  return {
    append: (key, update) =>
      db.transaction((tx) => {
        const owner =
          key.scope === "artifact"
            ? tx
                .select({ id: artifacts.id })
                .from(artifacts)
                .where(eq(artifacts.id, key.id))
                .get()
            : tx
                .select({ id: projects.id })
                .from(projects)
                .where(eq(projects.id, key.id))
                .get();
        if (!owner) {
          return false;
        }
        const store = storeName(key);
        tx.insert(pageStoreUpdates)
          .values({
            store,
            ...ownerOf(key),
            seq: lastSeq(tx, store) + 1,
            update,
          })
          .run();
        return true;
      }),
    compact: (key, snapshot) => {
      const store = storeName(key);
      db.transaction((tx) => {
        const seq = lastSeq(tx, store);
        if (seq === 0) {
          return;
        }
        tx.delete(pageStoreUpdates)
          .where(eq(pageStoreUpdates.store, store))
          .run();
        tx.insert(pageStoreUpdates)
          .values({ store, ...ownerOf(key), seq, update: snapshot })
          .run();
      });
    },
    updates: (key) =>
      db
        .select({ update: pageStoreUpdates.update })
        .from(pageStoreUpdates)
        .where(eq(pageStoreUpdates.store, storeName(key)))
        .orderBy(asc(pageStoreUpdates.seq))
        .all()
        .map((row) => row.update),
  };
};
