/**
 * What a keeper-held harness answers of its custody, the same for every
 * such harness once it says which of the keepers' children are its own.
 */
import type { KeeperHarnessKind } from "@cawco/core/harness/traits";
import type { SessiondAdoption } from "../harness";
import type { KeeperPool } from "../keepers";
import { parseProcId } from "../proc-id";

/** The keeper pool as custody reads it; {@link current} is what a start goes to, and may do its adapter's own preparation first. */
export type CustodyPool = Pick<
  KeeperPool,
  "current" | "endpoints" | "held" | "read"
>;

/** The three custody reads of a harness of `kind` over `pool`; the kind only filters. */
export const keeperCustody = (
  kind: KeeperHarnessKind,
  pool: CustodyPool
): Pick<SessiondAdoption, "candidates" | "keepers" | "reading"> => {
  const isOwn = (proc: { procId: string }): boolean =>
    parseProcId(proc.procId).kind === kind;
  return {
    async keepers() {
      await pool.current();
      return await pool.endpoints();
    },
    async reading(keeper) {
      const reading = await pool.read(keeper);
      return reading.kind === "listed"
        ? { kind: "listed", procs: reading.procs.filter(isOwn) }
        : reading;
    },
    async candidates() {
      await pool.current();
      return { procs: (await pool.held()).filter(isOwn) };
    },
  };
};
