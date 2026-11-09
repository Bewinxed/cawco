import {
  and,
  asc,
  eq,
  getTableColumns,
  isNotNull,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { SSH_MACHINES_HUB } from "./migration-names";
import { dataMigrations, sshMachines } from "./schema";

export type SshMachineRow = Omit<typeof sshMachines.$inferSelect, "hubId">;

/**
 * The rows ssh-tunnels.ts keeps that this hub holds (`hub_id`, its id): a
 * row of any other hub's (one this database was copied from) is in none of
 * these reads, so this hub never opens its connection, ends its session on
 * the machine or admits its machine's key.
 */
export interface SshMachinesDb {
  /** The row for `target` on `sshPort` (null: no port given), if one was made. */
  readonly at: (
    target: string,
    sshPort: number | null
  ) => SshMachineRow | undefined;
  /**
   * Once per database: the rows made before each row named its hub become
   * this hub's when `kept` (its id was beside the database before this
   * start, so it is the hub that made them), and stay no hub's otherwise (a
   * hub's first start in its folder is one on another hub's database: a
   * copy). Answers how many it claimed.
   */
  readonly claim: (kept: boolean) => number;
  readonly create: (row: SshMachineRow) => void;
  readonly get: (id: string) => SshMachineRow | undefined;
  /** How many rows name another hub, or none: a copied database's, left alone. */
  readonly heldElsewhere: () => number;
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

/** Every column but `hub_id`, which each read is scoped by. */
const { hubId: _hub, ...columns } = getTableColumns(sshMachines);

/** The rows of the hub whose id `hub` answers (hub-id.ts `hubId`). */
export const sshMachinesDb = (
  db: BunSQLiteDatabase,
  hub: () => string
): SshMachinesDb => {
  const held = () => eq(sshMachines.hubId, hub());
  const rows = () => db.select(columns).from(sshMachines);
  return {
    claim: (kept) =>
      db.transaction((tx) => {
        if (
          tx
            .select()
            .from(dataMigrations)
            .where(eq(dataMigrations.name, SSH_MACHINES_HUB))
            .get()
        ) {
          return 0;
        }
        const claimed = kept
          ? tx
              .update(sshMachines)
              .set({ hubId: hub() })
              .where(isNull(sshMachines.hubId))
              .returning({ id: sshMachines.id })
              .all().length
          : 0;
        tx.insert(dataMigrations)
          .values({ name: SSH_MACHINES_HUB, at: new Date() })
          .run();
        return claimed;
      }),
    joined: () =>
      rows()
        .where(and(held(), isNotNull(sshMachines.machineId)))
        .orderBy(asc(sshMachines.createdAt))
        .all(),
    unjoined: () =>
      rows()
        .where(and(held(), isNull(sshMachines.machineId)))
        .all(),
    at: (target, sshPort) =>
      rows()
        .where(
          and(
            held(),
            eq(sshMachines.target, target),
            sshPort === null
              ? isNull(sshMachines.sshPort)
              : eq(sshMachines.sshPort, sshPort)
          )
        )
        .get(),
    ofMachine: (machineId) =>
      rows()
        .where(and(held(), eq(sshMachines.machineId, machineId)))
        .all(),
    pendingKeys: () =>
      db
        .select({ id: sshMachines.id, key: sshMachines.pendingKey })
        .from(sshMachines)
        .where(and(held(), isNotNull(sshMachines.pendingKey)))
        .all()
        .flatMap(({ id, key }) => (key ? [{ id, key }] : [])),
    get: (id) =>
      rows()
        .where(and(held(), eq(sshMachines.id, id)))
        .get(),
    heldElsewhere: () =>
      db
        .select({ id: sshMachines.id })
        .from(sshMachines)
        .where(or(isNull(sshMachines.hubId), ne(sshMachines.hubId, hub())))
        .all().length,
    create: (row) => {
      db.insert(sshMachines)
        .values({ ...row, hubId: hub() })
        .run();
    },
    update: (id, patch) => {
      db.update(sshMachines)
        .set(patch)
        .where(and(held(), eq(sshMachines.id, id)))
        .run();
    },
    remove: (id) => {
      db.delete(sshMachines)
        .where(and(held(), eq(sshMachines.id, id)))
        .run();
    },
  };
};
