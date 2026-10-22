import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { sshMachines } from "./schema";

export type SshMachineRow = typeof sshMachines.$inferSelect;

/** The rows ssh-tunnels.ts keeps. */
export interface SshMachinesDb {
  /** The row for `target` on `sshPort` (null: no port given), if one was made. */
  readonly at: (
    target: string,
    sshPort: number | null
  ) => SshMachineRow | undefined;
  readonly create: (row: SshMachineRow) => void;
  readonly get: (id: string) => SshMachineRow | undefined;
  /** Every joined machine's row, oldest first: the connections the hub holds. */
  readonly joined: () => SshMachineRow[];
  /** Every row naming `machineId`. */
  readonly ofMachine: (machineId: string) => SshMachineRow[];
  /** Each row whose add wrote a key its machine has not yet proven, with that key. */
  readonly pendingKeys: () => { id: string; key: string }[];
  readonly remove: (id: string) => void;
  /** Rows whose add never finished: left by a hub that stopped while one ran. */
  readonly unjoined: () => SshMachineRow[];
  readonly update: (
    id: string,
    patch: Partial<
      Pick<SshMachineRow, "boxPort" | "boxSession" | "machineId" | "pendingKey">
    >
  ) => void;
}

export const sshMachinesDb = (db: BunSQLiteDatabase): SshMachinesDb => ({
  joined: () =>
    db
      .select()
      .from(sshMachines)
      .where(isNotNull(sshMachines.machineId))
      .orderBy(asc(sshMachines.createdAt))
      .all(),
  unjoined: () =>
    db.select().from(sshMachines).where(isNull(sshMachines.machineId)).all(),
  at: (target, sshPort) =>
    db
      .select()
      .from(sshMachines)
      .where(
        and(
          eq(sshMachines.target, target),
          sshPort === null
            ? isNull(sshMachines.sshPort)
            : eq(sshMachines.sshPort, sshPort)
        )
      )
      .get(),
  ofMachine: (machineId) =>
    db
      .select()
      .from(sshMachines)
      .where(eq(sshMachines.machineId, machineId))
      .all(),
  pendingKeys: () =>
    db
      .select({ id: sshMachines.id, key: sshMachines.pendingKey })
      .from(sshMachines)
      .where(isNotNull(sshMachines.pendingKey))
      .all()
      .flatMap(({ id, key }) => (key ? [{ id, key }] : [])),
  get: (id) =>
    db.select().from(sshMachines).where(eq(sshMachines.id, id)).get(),
  create: (row) => {
    db.insert(sshMachines).values(row).run();
  },
  update: (id, patch) => {
    db.update(sshMachines).set(patch).where(eq(sshMachines.id, id)).run();
  },
  remove: (id) => {
    db.delete(sshMachines).where(eq(sshMachines.id, id)).run();
  },
});
