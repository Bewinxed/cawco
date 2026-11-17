import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { HeldPicks } from "../setting-pick-shapes";
import { heldPicks } from "./schema";

/**
 * The setting picks held for sessions' processes on machines that are away
 * (schema `heldPicks`, setting-picks.ts), one per session, kept so a hub
 * restart still sends each as its machine registers again. A put replaces
 * what the session held; one that holds nothing deletes its row.
 */
export interface HeldPicksDb {
  readonly delete: (instanceId: string) => void;
  readonly get: (instanceId: string) => HeldPicks | undefined;
  /** Every session's held picks. */
  readonly list: () => [string, HeldPicks][];
  readonly put: (instanceId: string, held: HeldPicks) => void;
}

type Row = typeof heldPicks.$inferSelect;

const toHeld = (row: Row): HeldPicks => ({
  ...(row.model === null ? {} : { model: row.model }),
  ...(row.effort === null ? {} : { effort: row.effort }),
  ...(row.permissionMode === null
    ? {}
    : { permissionMode: { mode: row.permissionMode, runs: row.runsMode } }),
});

export const heldPicksDb = (db: BunSQLiteDatabase): HeldPicksDb => {
  const remove = (instanceId: string): void => {
    db.delete(heldPicks).where(eq(heldPicks.instanceId, instanceId)).run();
  };
  return {
    get: (instanceId) => {
      const row = db
        .select()
        .from(heldPicks)
        .where(eq(heldPicks.instanceId, instanceId))
        .get();
      return row ? toHeld(row) : undefined;
    },
    list: () =>
      db
        .select()
        .from(heldPicks)
        .all()
        .map((row) => [row.instanceId, toHeld(row)]),
    put: (instanceId, held) => {
      if (
        held.model === undefined &&
        held.effort === undefined &&
        held.permissionMode === undefined
      ) {
        remove(instanceId);
        return;
      }
      const values = {
        model: held.model ?? null,
        effort: held.effort ?? null,
        permissionMode: held.permissionMode?.mode ?? null,
        runsMode: held.permissionMode?.runs ?? null,
      };
      db.insert(heldPicks)
        .values({ instanceId, ...values })
        .onConflictDoUpdate({ target: heldPicks.instanceId, set: values })
        .run();
    },
    delete: remove,
  };
};
