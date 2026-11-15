import { and, eq, exists, gt, lte, or, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { ownerDevices, previewPasses, previewPassOrigins } from "./schema";

export type PreviewPassRow = typeof previewPasses.$inferSelect;

/**
 * A pass as an entry gives it: its row's own fields, and the origins it
 * opens: `every` for the person's, a session's origin keys for its own.
 */
export type PreviewPassGiven = Omit<
  PreviewPassRow,
  "opensEvery" | "scopeUnread"
> & { opens: "every" | readonly string[] };

/**
 * Host mode's passes (preview-access.ts), one row per browser that entered:
 * the person's, which opens every origin, and each session's own from
 * `artifact_browse` (its `instanceId`), which opens the origins its
 * `preview_pass_origins` rows name.
 */
export interface PreviewPassesDb {
  /**
   * The live pass whose token hashes to `tokenHash`, when it opens origin
   * `key`: the person's opens every one, and alone learns of a name nobody
   * holds (`key` undefined); a session's, the origins its rows name.
   * Undefined once it lapsed, was revoked, never was, or opens none such.
   */
  readonly live: (
    tokenHash: string,
    now: Date,
    key: string | undefined
  ) => PreviewPassRow | undefined;
  /**
   * A pass given at an entry, `replacing` (the token hash the browser
   * presented, if any) gone in the same write, and every lapsed pass with
   * it. False, and nothing kept, when its device is no longer paired.
   */
  readonly open: (
    pass: PreviewPassGiven,
    replacing: { tokenHash: string; until: Date } | null
  ) => boolean;
  /**
   * Every pass of paired device `deviceId`, every pass of session
   * `instanceId`, or the one whose token hashes to `tokenHash`, is gone; how
   * many went.
   */
  readonly revoke: (
    by: { deviceId: string } | { instanceId: string } | { tokenHash: string }
  ) => number;
  /** The pass was used at `at`. */
  readonly touch: (id: string, at: Date) => void;
}

/** The column `by` names, and its value. */
const revoked = (
  by: { deviceId: string } | { instanceId: string } | { tokenHash: string }
) => {
  if ("deviceId" in by) {
    return eq(previewPasses.deviceId, by.deviceId);
  }
  return "instanceId" in by
    ? eq(previewPasses.instanceId, by.instanceId)
    : eq(previewPasses.tokenHash, by.tokenHash);
};

export const previewPassesDb = (db: BunSQLiteDatabase): PreviewPassesDb => ({
  live: (tokenHash, now, key) =>
    db
      .select()
      .from(previewPasses)
      .where(
        and(
          eq(previewPasses.tokenHash, tokenHash),
          gt(previewPasses.expiresAt, now),
          or(
            eq(previewPasses.opensEvery, true),
            key === undefined
              ? undefined
              : exists(
                  db
                    .select({ one: sql`1` })
                    .from(previewPassOrigins)
                    .where(
                      and(
                        eq(previewPassOrigins.passId, previewPasses.id),
                        eq(previewPassOrigins.originKey, key)
                      )
                    )
                )
          )
        )
      )
      .get(),
  open: ({ opens, ...row }, replacing) =>
    db.transaction((tx) => {
      tx.delete(previewPasses)
        .where(lte(previewPasses.expiresAt, row.createdAt))
        .run();
      if (replacing) {
        tx.update(previewPasses)
          .set({ expiresAt: replacing.until })
          .where(
            and(
              eq(previewPasses.tokenHash, replacing.tokenHash),
              gt(previewPasses.expiresAt, replacing.until)
            )
          )
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
      tx.insert(previewPasses)
        .values({ ...row, opensEvery: opens === "every", scopeUnread: null })
        .run();
      if (opens !== "every" && opens.length > 0) {
        tx.insert(previewPassOrigins)
          .values(opens.map((originKey) => ({ passId: row.id, originKey })))
          .onConflictDoNothing()
          .run();
      }
      return true;
    }),
  revoke: (by) =>
    db
      .delete(previewPasses)
      .where(revoked(by))
      .returning({ id: previewPasses.id })
      .all().length,
  touch: (id, at) => {
    db.update(previewPasses)
      .set({ lastSeenAt: at })
      .where(eq(previewPasses.id, id))
      .run();
  },
});
