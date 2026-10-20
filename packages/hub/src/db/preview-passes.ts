import { and, eq, gt, lte } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ownerDevices, previewPasses } from "./schema";

export type PreviewPassRow = typeof previewPasses.$inferSelect;

/** Host mode's passes (preview-access.ts), one row per browser that entered. */
export interface PreviewPassesDb {
  /** The live pass whose token hashes to `tokenHash`; undefined once it lapsed, was revoked, or never was. */
  readonly live: (tokenHash: string, now: Date) => PreviewPassRow | undefined;
  /**
   * A pass given at an entry, `replacing` (the token hash the browser
   * presented, if any) gone in the same write, and every lapsed pass with
   * it. False, and nothing kept, when its device is no longer paired.
   */
  readonly open: (row: PreviewPassRow, replacing: string | null) => boolean;
  /** Every pass of paired device `deviceId`, or the one whose token hashes to `tokenHash`, is gone; how many went. */
  readonly revoke: (by: { deviceId: string } | { tokenHash: string }) => number;
  /** The pass was used at `at`. */
  readonly touch: (id: string, at: Date) => void;
}

export const previewPassesDb = (db: BunSQLiteDatabase): PreviewPassesDb => ({
  live: (tokenHash, now) =>
    db
      .select()
      .from(previewPasses)
      .where(
        and(
          eq(previewPasses.tokenHash, tokenHash),
          gt(previewPasses.expiresAt, now)
        )
      )
      .get(),
  open: (row, replacing) =>
    db.transaction((tx) => {
      tx.delete(previewPasses)
        .where(lte(previewPasses.expiresAt, row.createdAt))
        .run();
      if (replacing) {
        tx.delete(previewPasses)
          .where(eq(previewPasses.tokenHash, replacing))
          .run();
      }
      if (
        row.deviceId &&
        !tx
          .select({ id: ownerDevices.id })
          .from(ownerDevices)
          .where(eq(ownerDevices.id, row.deviceId))
          .get()
      ) {
        return false;
      }
      tx.insert(previewPasses).values(row).run();
      return true;
    }),
  revoke: (by) =>
    db
      .delete(previewPasses)
      .where(
        "deviceId" in by
          ? eq(previewPasses.deviceId, by.deviceId)
          : eq(previewPasses.tokenHash, by.tokenHash)
      )
      .returning({ id: previewPasses.id })
      .all().length,
  touch: (id, at) => {
    db.update(previewPasses)
      .set({ lastSeenAt: at })
      .where(eq(previewPasses.id, id))
      .run();
  },
});
