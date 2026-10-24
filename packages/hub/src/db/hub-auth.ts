import { and, asc, eq, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import {
  machineKeys,
  ownerDevices,
  pairingSettings,
  previewPasses,
} from "./schema";

export type OwnerDeviceRow = typeof ownerDevices.$inferSelect;

/** The rows hub-auth.ts keeps: the mode, the person's devices, the machines' keys. */
export interface HubAuthDb {
  readonly addDevice: (row: OwnerDeviceRow) => void;
  readonly deviceByHash: (tokenHash: string) => OwnerDeviceRow | undefined;
  /** Every paired device, oldest first. */
  readonly devices: () => OwnerDeviceRow[];
  readonly forgetMachineKey: (machineId: string) => void;
  /** An admitted machine's key, opened; undefined for a machine never admitted (or one whose seal no longer opens). */
  readonly machineKey: (machineId: string) => string | undefined;
  /** Whether paired devices are required. */
  readonly pairingRequired: () => boolean;
  readonly putMachineKey: (machineId: string, key: string) => void;
  readonly removeDevice: (id: string) => boolean;
  /**
   * Turns the requirement on or off. Off forgets every paired device and
   * every machine key, in one transaction: a later turn-on starts again from
   * the device that turns it on and the machines connected then. Every
   * preview pass goes with the mode it was given in: a device's with its
   * device (`preview_passes` cascades), a trusted hub's browser's, which
   * names no device, as the requirement turns on. A session's own pass
   * goes with its session, whatever the mode.
   */
  readonly setPairingRequired: (required: boolean) => void;
  readonly touchDevice: (id: string, at: Date, address: string | null) => void;
}

export const hubAuthDb = (db: BunSQLiteDatabase): HubAuthDb => {
  // Read at every request the gate sees (hub-auth.ts `mode`): prepared once.
  // Built and prepared afresh each time, it was the gate's largest cost in
  // a restarted hub's profile (hub-restart-load, 2026-10-23). Still read
  // each time, never kept: one row, from the page cache.
  const pairing = db
    .select({ required: pairingSettings.required })
    .from(pairingSettings)
    .where(eq(pairingSettings.id, "pairing"))
    .prepare();
  return {
    devices: () =>
      db.select().from(ownerDevices).orderBy(asc(ownerDevices.createdAt)).all(),
    deviceByHash: (tokenHash) =>
      db
        .select()
        .from(ownerDevices)
        .where(eq(ownerDevices.tokenHash, tokenHash))
        .get(),
    addDevice: (row) => {
      db.insert(ownerDevices).values(row).run();
    },
    removeDevice: (id) =>
      db
        .delete(ownerDevices)
        .where(eq(ownerDevices.id, id))
        .returning({ id: ownerDevices.id })
        .all().length > 0,
    touchDevice: (id, at, address) => {
      db.update(ownerDevices)
        .set({ lastUsedAt: at, lastAddress: address })
        .where(eq(ownerDevices.id, id))
        .run();
    },
    machineKey: (machineId) =>
      db
        .select({ key: machineKeys.key })
        .from(machineKeys)
        .where(eq(machineKeys.machineId, machineId))
        .get()?.key ?? undefined,
    putMachineKey: (machineId, key) => {
      db.insert(machineKeys)
        .values({ machineId, key, admittedAt: new Date() })
        .onConflictDoUpdate({
          target: machineKeys.machineId,
          set: { key, admittedAt: new Date() },
        })
        .run();
    },
    forgetMachineKey: (machineId) => {
      db.delete(machineKeys).where(eq(machineKeys.machineId, machineId)).run();
    },
    pairingRequired: () => pairing.get()?.required === true,
    setPairingRequired: (required) => {
      db.transaction((tx) => {
        tx.insert(pairingSettings)
          .values({ id: "pairing", required, changedAt: new Date() })
          .onConflictDoUpdate({
            target: pairingSettings.id,
            set: { required, changedAt: new Date() },
          })
          .run();
        if (required) {
          tx.delete(previewPasses)
            .where(
              and(
                isNull(previewPasses.deviceId),
                isNull(previewPasses.instanceId)
              )
            )
            .run();
        } else {
          tx.delete(ownerDevices).run();
          tx.delete(machineKeys).run();
        }
      });
    },
  };
};
