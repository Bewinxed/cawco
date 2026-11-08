/**
 * Session identities: each session's credential, by hash and by pending
 * install, and the revocations told once a write is done.
 */
import { and, eq, inArray, or } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { sessionIdentities } from "./schema";
import type { Tx } from "./tx";

export interface Revocations {
  /** {@link revocations}'s closure: notes the hashes a write stops answering to, for the tell once it is done. */
  readonly noteRevoked: (
    hashes: readonly (string | null | undefined)[]
  ) => void;
  /**
   * `listener` hears the hashes of the credentials the hub revokes, once
   * the write that revoked them is done and they no longer resolve: a
   * session's end confirmed, a session gone, a credential replaced.
   */
  readonly onCredentialsRevoked: (listener: (hashes: string[]) => void) => void;
  /**
   * Of these credential hashes, those no session identity answers to: each
   * grants nothing here, which is the hub's word that it is revoked.
   */
  readonly revokedAmong: (hashes: readonly string[]) => string[];
  /** The credentials of `ids`' sessions revoked, inside the caller's transaction. */
  readonly revokeIdentities: (tx: Tx, ids: readonly string[]) => void;
}

export const revocations = (db: BunSQLiteDatabase): Revocations => {
  /** Who hears of the credentials the hub revokes ({@link DbShape.onCredentialsRevoked}). */
  const revokedListeners = new Set<(hashes: string[]) => void>();

  /** Hashes a write revoked, not yet told. */
  let noted: Set<string> | undefined;

  /**
   * Of `hashes`, those no session identity answers to: what each names
   * grants nothing here, the hub's word that it is revoked. One it never
   * issued is among them.
   */
  const revokedAmong = (hashes: readonly string[]): string[] => {
    const live = new Set<string>();
    // Inside SQLite's bound on a statement's parameters, twice over.
    for (let at = 0; at < hashes.length; at += 500) {
      const chunk = hashes.slice(at, at + 500);
      for (const row of db
        .select({
          credentialHash: sessionIdentities.credentialHash,
          pendingHash: sessionIdentities.pendingHash,
        })
        .from(sessionIdentities)
        .where(
          or(
            inArray(sessionIdentities.credentialHash, chunk),
            inArray(sessionIdentities.pendingHash, chunk)
          )
        )
        .all()) {
        for (const hash of [row.credentialHash, row.pendingHash]) {
          if (hash) {
            live.add(hash);
          }
        }
      }
    }
    return [...new Set(hashes)].filter((hash) => !live.has(hash));
  };

  const tellRevoked = (): void => {
    const hashes = revokedAmong([...(noted ?? [])]);
    noted = undefined;
    if (hashes.length === 0) {
      return;
    }
    for (const listener of revokedListeners) {
      try {
        listener(hashes);
      } catch (error) {
        console.error("[session-identity] telling a revocation failed", error);
      }
    }
  };

  /**
   * Hashes the caller's write stops answering to. They are told once it is
   * done, from a microtask (every transaction here runs synchronously, so
   * none is open then), and only those that no longer resolve: a write
   * rolled back revoked nothing, and nothing is told of it.
   */
  const noteRevoked = (hashes: readonly (string | null | undefined)[]) => {
    for (const hash of hashes) {
      if (!hash) {
        continue;
      }
      if (!noted) {
        noted = new Set();
        queueMicrotask(tellRevoked);
      }
      noted.add(hash);
    }
  };

  /**
   * The credentials of `ids`' sessions revoked, inside the caller's
   * transaction: what was installed and what was on its way. A session's
   * credential grants while its process may run; once that process is gone
   * (asleep, dead, its end confirmed) or the session leaves the hub, nothing
   * it held grants again, and its next launch mints its own (server.ts
   * `grantLaunch`).
   */
  const revokeIdentities = (tx: Tx, ids: readonly string[]): void => {
    if (ids.length === 0) {
      return;
    }
    noteRevoked(
      tx
        .delete(sessionIdentities)
        .where(inArray(sessionIdentities.instanceId, [...ids]))
        .returning({
          credentialHash: sessionIdentities.credentialHash,
          pendingHash: sessionIdentities.pendingHash,
        })
        .all()
        .flatMap((row) => [row.credentialHash, row.pendingHash])
    );
  };

  return {
    noteRevoked,
    revokeIdentities,
    revokedAmong,
    onCredentialsRevoked: (listener) => {
      revokedListeners.add(listener);
    },
  };
};

type SessionIdentityRow = typeof sessionIdentities.$inferSelect;

export interface SessionIdentityDb {
  readonly acknowledgeSessionIdentity: (
    instanceId: string,
    hash: string
  ) => boolean;
  /**
   * Session `instanceId`'s credentials revoked, installed and on their way:
   * its process is gone (asleep, or dead of a signal), so nothing it held
   * grants again; its next launch mints its own (server.ts `grantLaunch`).
   */
  readonly revokeSessionIdentity: (instanceId: string) => void;
  readonly sessionIdentity: (
    instanceId: string
  ) => SessionIdentityRow | undefined;
  readonly sessionIdentityByHash: (
    hash: string
  ) => SessionIdentityRow | undefined;
  readonly sessionIdentityError: (
    instanceId: string,
    error: string | null,
    rejectPending?: boolean
  ) => void;
  readonly stageSessionIdentity: (instanceId: string, hash: string) => void;
}

export const sessionIdentityDb = (
  core: { db: BunSQLiteDatabase } & Pick<
    Revocations,
    "noteRevoked" | "revokeIdentities"
  >
): SessionIdentityDb => {
  const { db, noteRevoked, revokeIdentities } = core;

  return {
    sessionIdentity: (instanceId) =>
      db
        .select()
        .from(sessionIdentities)
        .where(eq(sessionIdentities.instanceId, instanceId))
        .get(),
    sessionIdentityByHash: (hash) =>
      db
        .select()
        .from(sessionIdentities)
        .where(
          or(
            eq(sessionIdentities.credentialHash, hash),
            eq(sessionIdentities.pendingHash, hash)
          )
        )
        .get(),
    // Each write that replaces or clears a hash revokes the one it held.
    stageSessionIdentity: (instanceId, pendingHash) =>
      db.transaction((tx) => {
        noteRevoked([
          tx
            .select({ pendingHash: sessionIdentities.pendingHash })
            .from(sessionIdentities)
            .where(eq(sessionIdentities.instanceId, instanceId))
            .get()?.pendingHash,
        ]);
        tx.insert(sessionIdentities)
          .values({ instanceId, pendingHash })
          .onConflictDoUpdate({
            target: sessionIdentities.instanceId,
            set: { pendingHash, error: null },
          })
          .run();
      }),
    acknowledgeSessionIdentity: (instanceId, hash) =>
      db.transaction((tx) => {
        const before = tx
          .select({ credentialHash: sessionIdentities.credentialHash })
          .from(sessionIdentities)
          .where(eq(sessionIdentities.instanceId, instanceId))
          .get();
        const changed = tx
          .update(sessionIdentities)
          .set({
            credentialHash: hash,
            pendingHash: null,
            installedAt: new Date(),
            error: null,
          })
          .where(
            and(
              eq(sessionIdentities.instanceId, instanceId),
              eq(sessionIdentities.pendingHash, hash)
            )
          )
          .returning({ instanceId: sessionIdentities.instanceId })
          .get();
        if (changed) {
          noteRevoked([before?.credentialHash]);
        }
        return changed !== undefined;
      }),
    sessionIdentityError: (instanceId, error, rejectPending = false) =>
      db.transaction((tx) => {
        if (rejectPending) {
          noteRevoked([
            tx
              .select({ pendingHash: sessionIdentities.pendingHash })
              .from(sessionIdentities)
              .where(eq(sessionIdentities.instanceId, instanceId))
              .get()?.pendingHash,
          ]);
        }
        tx.update(sessionIdentities)
          .set({ error, ...(rejectPending ? { pendingHash: null } : {}) })
          .where(eq(sessionIdentities.instanceId, instanceId))
          .run();
      }),
    revokeSessionIdentity: (instanceId) =>
      db.transaction((tx) => revokeIdentities(tx, [instanceId])),
  };
};
