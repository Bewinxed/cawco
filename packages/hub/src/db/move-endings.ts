import type { MoveEnded } from "@cawco/core";
import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { moveEndings } from "./schema";

/**
 * What a move ended with a session's process (core `MoveEnded`: its
 * background tasks and wake-ups), kept from the machine's answer until the
 * session is told on its new account (server.ts `tellEndedByMove`), so a hub
 * restart in between never loses it. One per session: a later move's
 * replaces it; telling it takes it.
 */
export interface MoveEndingsDb {
  readonly put: (instanceId: string, ended: MoveEnded) => void;
  /** Takes what was kept for `instanceId`: read once, then gone. */
  readonly take: (instanceId: string) => MoveEnded | undefined;
}

export const moveEndingsDb = (db: BunSQLiteDatabase): MoveEndingsDb => ({
  put: (instanceId, ended) => {
    const values = { ended, createdAt: new Date() };
    db.insert(moveEndings)
      .values({ instanceId, ...values })
      .onConflictDoUpdate({ target: moveEndings.instanceId, set: values })
      .run();
  },
  take: (instanceId) => {
    const row = db
      .delete(moveEndings)
      .where(eq(moveEndings.instanceId, instanceId))
      .returning()
      .get();
    return row?.ended;
  },
});
