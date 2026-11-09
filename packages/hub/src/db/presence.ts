/** Who is at the hub: presence, push devices and what notifications are owed. */

import { desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { DbCore } from "./core";
import {
  notificationCleared,
  notificationSent,
  PRESENCE_ID,
  presenceClients,
  presenceDevices,
  presenceSettings,
  pushDevices,
} from "./schema";
import { singleton, singletonColumn } from "./singleton";

/** One device's last word on the person, as notifications.ts keeps it. */
export type PresenceClientRow = typeof presenceClients.$inferSelect;

/** The person's last away stretch: since when, when it ended (null while away), and who was given its recap. */
export interface AwayStretch {
  readonly awaySince: Date | null;
  readonly backAt: Date | null;
  readonly recapped: readonly string[];
}

/** A device the iOS app registered for pushes, by its Cawrier pairing. */
/** A device the hub can push to: its sealed pairing secret and key opened. */
export type PushDeviceRow = Omit<
  typeof pushDevices.$inferSelect,
  "secret" | "key"
> & { key: string; secret: string };

export interface PresenceDb {
  /** What a device was shown and what has been cleared, by collapse id (notifications.ts). */
  readonly notifications: {
    /** Shown under this collapse id: outstanding again, and no longer cleared. */
    readonly sent: (collapseId: string, at: Date) => void;
    /** When each of these ids was last sent, for those still outstanding. */
    readonly sentAt: (collapseIds: string[]) => Map<string, Date>;
    /**
     * Clears the ids that were sent and are still outstanding; `any` clears
     * an id however it was shown (a device's own dismiss). Answers the ids
     * this newly cleared, in the order given.
     */
    readonly clear: (collapseIds: string[], at: Date, any: boolean) => string[];
    /** Every id cleared at or after `since`, newest first. */
    readonly clearedSince: (
      since: Date
    ) => { collapseId: string; clearedAt: Date }[];
    /** Forgets sends and clears older than `before`. */
    readonly prune: (before: Date) => void;
  };
  /** The person's Appear away, the machines that count toward their presence, each device's last word and the last away stretch (notifications.ts). */
  readonly presence: {
    /** Appear away: on since when, or null while off. */
    readonly appearAway: () => Date | null;
    readonly setAppearAway: (on: boolean, at: Date) => void;
    /** The machines the person opted in. */
    readonly counted: () => Set<string>;
    readonly setCounts: (machineId: string, counts: boolean) => void;
    /** Every device's last word, as the hub's restart reads it back. */
    readonly clients: () => PresenceClientRow[];
    readonly keepClient: (row: PresenceClientRow) => void;
    readonly dropClient: (clientId: string) => void;
    /** The person's away clock, ms; null while they keep the default. */
    readonly awayAfter: () => number | null;
    readonly setAwayAfter: (ms: number) => void;
    /** The person's last away stretch. */
    readonly stretch: () => AwayStretch;
    readonly setStretch: (stretch: AwayStretch) => void;
  };
  /** The iOS app's pushes (push.ts): the devices that registered, by their Cawrier pairing. */
  readonly push: {
    readonly devices: () => PushDeviceRow[];
    /** Registers or refreshes a device; a refresh keeps its quiet setting unless one is given. */
    readonly putDevice: (
      device: Pick<
        PushDeviceRow,
        "key" | "name" | "pairingId" | "platform" | "secret"
      > & {
        quiet?: boolean;
      }
    ) => PushDeviceRow;
    /** False when no device has that pairing. */
    readonly dropDevice: (pairingId: string) => boolean;
    readonly setQuiet: (pairingId: string, quiet: boolean) => boolean;
    /** What Cawrier said to the last push for a device: taken (no error) or refused with a reason. */
    readonly noteResult: (pairingId: string, error: string | null) => void;
  };
}

export const presenceDb = (core: DbCore): PresenceDb => {
  const { db } = core;

  return {
    push: {
      // A device whose pairing secret or key does not open is none until the
      // app registers again, which it does on every launch.
      devices: () =>
        db
          .select()
          .from(pushDevices)
          .orderBy(pushDevices.createdAt)
          .all()
          .flatMap(({ secret, key, ...device }) =>
            secret && key ? [{ ...device, secret, key }] : []
          ),
      putDevice: ({ quiet, ...device }) => {
        const now = new Date();
        const row = db
          .insert(pushDevices)
          .values({
            ...device,
            quiet: quiet ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: pushDevices.pairingId,
            set: {
              ...device,
              ...(quiet === undefined ? {} : { quiet }),
              updatedAt: now,
            },
          })
          .returning()
          .get();
        // The secret and key just written, as given: what the row seals.
        return { ...row, secret: device.secret, key: device.key };
      },
      dropDevice: (pairingId) =>
        db
          .delete(pushDevices)
          .where(eq(pushDevices.pairingId, pairingId))
          .returning({ pairingId: pushDevices.pairingId })
          .all().length > 0,
      setQuiet: (pairingId, quiet) =>
        db
          .update(pushDevices)
          .set({ quiet, updatedAt: new Date() })
          .where(eq(pushDevices.pairingId, pairingId))
          .returning({ pairingId: pushDevices.pairingId })
          .all().length > 0,
      noteResult: (pairingId, error) => {
        db.update(pushDevices)
          .set(
            error === null
              ? { lastSentAt: new Date(), lastError: null }
              : { lastError: error }
          )
          .where(eq(pushDevices.pairingId, pairingId))
          .run();
      },
    },
    presence: {
      appearAway: () => {
        const row = singleton(db, presenceSettings, PRESENCE_ID);
        return row?.appearAway ? (row.appearAwayAt ?? new Date(0)) : null;
      },
      setAppearAway: (on, at) => {
        const set = { appearAway: on, appearAwayAt: on ? at : null };
        db.insert(presenceSettings)
          .values({ id: PRESENCE_ID, ...set })
          .onConflictDoUpdate({ target: presenceSettings.id, set })
          .run();
      },
      counted: () =>
        new Set(
          db
            .select({ machineId: presenceDevices.machineId })
            .from(presenceDevices)
            .where(eq(presenceDevices.counts, true))
            .all()
            .map((row) => row.machineId)
        ),
      setCounts: (machineId, counts) => {
        db.insert(presenceDevices)
          .values({ machineId, counts })
          .onConflictDoUpdate({
            target: presenceDevices.machineId,
            set: { counts },
          })
          .run();
      },
      clients: () => db.select().from(presenceClients).all(),
      keepClient: (row) => {
        const { clientId, ...set } = row;
        db.insert(presenceClients)
          .values(row)
          .onConflictDoUpdate({ target: presenceClients.clientId, set })
          .run();
      },
      dropClient: (clientId) => {
        db.delete(presenceClients)
          .where(eq(presenceClients.clientId, clientId))
          .run();
      },
      awayAfter: () =>
        singletonColumn(
          db,
          presenceSettings,
          PRESENCE_ID,
          presenceSettings.awayAfterMs
        ) ?? null,
      setAwayAfter: (ms) => {
        db.insert(presenceSettings)
          .values({ id: PRESENCE_ID, appearAway: false, awayAfterMs: ms })
          .onConflictDoUpdate({
            target: presenceSettings.id,
            set: { awayAfterMs: ms },
          })
          .run();
      },
      stretch: () => {
        const row = singleton(db, presenceSettings, PRESENCE_ID);
        return {
          awaySince: row?.awaySince ?? null,
          backAt: row?.backAt ?? null,
          recapped: row?.recapped ?? [],
        };
      },
      setStretch: ({ awaySince, backAt, recapped }) => {
        const set = { awaySince, backAt, recapped: [...recapped] };
        db.insert(presenceSettings)
          .values({ id: PRESENCE_ID, appearAway: false, ...set })
          .onConflictDoUpdate({ target: presenceSettings.id, set })
          .run();
      },
    },
    notifications: {
      sent: (collapseId, at) => {
        db.transaction((tx) => {
          tx.delete(notificationCleared)
            .where(eq(notificationCleared.collapseId, collapseId))
            .run();
          tx.insert(notificationSent)
            .values({ collapseId, sentAt: at })
            .onConflictDoUpdate({
              target: notificationSent.collapseId,
              set: { sentAt: at },
            })
            .run();
        });
      },
      sentAt: (collapseIds) =>
        new Map(
          collapseIds.length === 0
            ? []
            : db
                .select()
                .from(notificationSent)
                .where(inArray(notificationSent.collapseId, collapseIds))
                .all()
                .map((row) => [row.collapseId, row.sentAt])
        ),
      clear: (collapseIds, at, any) =>
        db.transaction((tx) => {
          const ids = [...new Set(collapseIds)];
          if (ids.length === 0) {
            return [];
          }
          const outstanding = new Set(
            tx
              .delete(notificationSent)
              .where(inArray(notificationSent.collapseId, ids))
              .returning({ collapseId: notificationSent.collapseId })
              .all()
              .map((row) => row.collapseId)
          );
          const already = new Set(
            tx
              .select({ collapseId: notificationCleared.collapseId })
              .from(notificationCleared)
              .where(inArray(notificationCleared.collapseId, ids))
              .all()
              .map((row) => row.collapseId)
          );
          const newly = ids.filter(
            (id) => outstanding.has(id) || (any && !already.has(id))
          );
          for (const collapseId of newly) {
            tx.insert(notificationCleared)
              .values({ collapseId, clearedAt: at })
              .onConflictDoUpdate({
                target: notificationCleared.collapseId,
                set: { clearedAt: at },
              })
              .run();
          }
          return newly;
        }),
      clearedSince: (since) =>
        db
          .select()
          .from(notificationCleared)
          .where(gte(notificationCleared.clearedAt, since))
          .orderBy(desc(notificationCleared.clearedAt))
          .all(),
      prune: (before) => {
        db.delete(notificationSent)
          .where(lt(notificationSent.sentAt, before))
          .run();
        db.delete(notificationCleared)
          .where(lt(notificationCleared.clearedAt, before))
          .run();
      },
    },
  };
};
