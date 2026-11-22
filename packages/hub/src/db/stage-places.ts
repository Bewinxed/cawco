/**
 * The folder each place a port preview is staged from stands for
 * (schema.ts `stagePlaces`), by the place's id.
 */
import type { WorkspaceRef } from "@cawco/core/workspace/controls";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { stagePlaces } from "./schema";

/** A place a preview is staged from: its id and folder, its machine, and the session that named it last. */
export interface StagePlace {
  machineId: string;
  namedBy: string;
  ref: WorkspaceRef;
}

export interface StagePlacesDb {
  /** Place `id`, or nothing when no create named it. */
  readonly get: (id: string) => StagePlace | undefined;
  /** Place `place.ref` kept, named last by `place.namedBy`. */
  readonly keep: (place: StagePlace) => void;
}

export const stagePlacesDb = (db: BunSQLiteDatabase): StagePlacesDb => ({
  get: (id) => {
    const row = db
      .select()
      .from(stagePlaces)
      .where(eq(stagePlaces.id, id))
      .get();
    return (
      row && {
        machineId: row.machineId,
        namedBy: row.namedBy,
        ref: { id: row.id, path: row.path },
      }
    );
  },
  keep: ({ machineId, namedBy, ref }) => {
    db.insert(stagePlaces)
      .values({ id: ref.id, machineId, path: ref.path, namedBy })
      .onConflictDoUpdate({
        target: stagePlaces.id,
        set: { machineId, path: ref.path, namedBy },
      })
      .run();
  },
});
