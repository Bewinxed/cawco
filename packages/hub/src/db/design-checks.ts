import { desc, eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { designChecks, designProposals } from "./schema";

export type DesignCheckRow = typeof designChecks.$inferSelect;
export type DesignProposalRow = typeof designProposals.$inferSelect;

/** Design checks (design-verify.ts) and design proposals (design-system.ts). */
export interface DesignChecksDb {
  /** Every check a verifier works on now. */
  readonly checking: () => DesignCheckRow[];
  readonly dropProposal: (id: string) => void;
  /** The newest check of a builder's item. */
  readonly latest: (itemId: string) => DesignCheckRow | undefined;
  /** The check a verifier's own item runs. */
  readonly ofVerifier: (verifierItemId: string) => DesignCheckRow | undefined;
  readonly open: (row: DesignCheckRow) => void;
  readonly proposal: (id: string) => DesignProposalRow | undefined;
  readonly proposals: () => DesignProposalRow[];
  readonly propose: (row: DesignProposalRow) => void;
  readonly set: (
    id: string,
    change: Partial<Omit<DesignCheckRow, "id">>
  ) => void;
}

export const designChecksDb = (db: BunSQLiteDatabase): DesignChecksDb => ({
  checking: () =>
    db
      .select()
      .from(designChecks)
      .where(eq(designChecks.state, "checking"))
      .all(),
  latest: (itemId) =>
    db
      .select()
      .from(designChecks)
      .where(eq(designChecks.itemId, itemId))
      .orderBy(desc(designChecks.createdAt))
      .get(),
  ofVerifier: (verifierItemId) =>
    db
      .select()
      .from(designChecks)
      .where(eq(designChecks.verifierItemId, verifierItemId))
      .get(),
  open: (row) => {
    db.insert(designChecks).values(row).run();
  },
  set: (id, change) => {
    db.update(designChecks).set(change).where(eq(designChecks.id, id)).run();
  },
  proposal: (id) =>
    db.select().from(designProposals).where(eq(designProposals.id, id)).get(),
  proposals: () =>
    db.select().from(designProposals).orderBy(designProposals.createdAt).all(),
  propose: (row) => {
    db.insert(designProposals).values(row).run();
  },
  dropProposal: (id) => {
    db.delete(designProposals).where(eq(designProposals.id, id)).run();
  },
});
