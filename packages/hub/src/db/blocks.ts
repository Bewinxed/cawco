import type { BlockPage, BlockPlace } from "@cawco/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { projectBlocks, viewProposals } from "./schema";

export type BlockRow = typeof projectBlocks.$inferSelect;
export type ProposalRow = typeof viewProposals.$inferSelect;

type Tx = Parameters<Parameters<BunSQLiteDatabase["transaction"]>[0]>[0];

/**
 * Replaces one page's rows with `blocks` in their order; a block named here
 * that stood on another page leaves it (a view stands on one page at most).
 */
const writePage = (
  tx: Tx,
  projectId: string,
  page: BlockPage,
  blocks: BlockPlace[]
): void => {
  tx.delete(projectBlocks)
    .where(
      and(eq(projectBlocks.projectId, projectId), eq(projectBlocks.page, page))
    )
    .run();
  if (blocks.length === 0) {
    return;
  }
  tx.delete(projectBlocks)
    .where(
      and(
        eq(projectBlocks.projectId, projectId),
        inArray(
          projectBlocks.block,
          blocks.map((each) => each.block)
        )
      )
    )
    .run();
  tx.insert(projectBlocks)
    .values(
      blocks.map((each, position) => ({
        projectId,
        page,
        block: each.block,
        position,
        width: each.width,
        hidden: each.hidden,
      }))
    )
    .run();
};

/** The rows blocks.ts keeps: each project page's arrangement, and the drafts proposed on a page. */
export interface BlocksDb {
  /** A project's blocks, page by page, each page in its order. */
  readonly ofProject: (projectId: string) => BlockRow[];
  /**
   * A kept proposal: its page's arrangement written whole with the view's
   * block in it, and the proposal dropped, in one transaction.
   */
  readonly place: (
    projectId: string,
    view: string,
    page: BlockPage,
    blocks: BlockPlace[]
  ) => void;
  /** A project's proposals, oldest first. */
  readonly proposals: (projectId: string) => ProposalRow[];
  /** A draft proposed on a page, or its place there moved: the one row for its view. */
  readonly propose: (row: ProposalRow) => void;
  /** One page's arrangement, whole, in one transaction (`writePage`). */
  readonly setPage: (
    projectId: string,
    page: BlockPage,
    blocks: BlockPlace[]
  ) => void;
  /** Drops a view's block from whichever page holds it. Answers that page, or null. */
  readonly unplace: (projectId: string, block: string) => BlockPage | null;
  /** Drops a view's proposal. Answers whether there was one. */
  readonly unpropose: (projectId: string, view: string) => boolean;
}

export const blocksDb = (db: BunSQLiteDatabase): BlocksDb => ({
  ofProject: (projectId) =>
    db
      .select()
      .from(projectBlocks)
      .where(eq(projectBlocks.projectId, projectId))
      .orderBy(asc(projectBlocks.page), asc(projectBlocks.position))
      .all(),
  place: (projectId, view, page, blocks) =>
    db.transaction((tx) => {
      writePage(tx, projectId, page, blocks);
      tx.delete(viewProposals)
        .where(
          and(
            eq(viewProposals.projectId, projectId),
            eq(viewProposals.view, view)
          )
        )
        .run();
    }),
  propose: (row) =>
    db
      .insert(viewProposals)
      .values(row)
      .onConflictDoUpdate({
        target: [viewProposals.projectId, viewProposals.view],
        set: {
          page: row.page,
          position: row.position,
          proposedBy: row.proposedBy,
          proposedAt: row.proposedAt,
        },
      })
      .run(),
  proposals: (projectId) =>
    db
      .select()
      .from(viewProposals)
      .where(eq(viewProposals.projectId, projectId))
      .orderBy(asc(viewProposals.proposedAt))
      .all(),
  unpropose: (projectId, view) =>
    db
      .delete(viewProposals)
      .where(
        and(
          eq(viewProposals.projectId, projectId),
          eq(viewProposals.view, view)
        )
      )
      .returning({ view: viewProposals.view })
      .all().length > 0,
  unplace: (projectId, block) =>
    db
      .delete(projectBlocks)
      .where(
        and(
          eq(projectBlocks.projectId, projectId),
          eq(projectBlocks.block, block)
        )
      )
      .returning({ page: projectBlocks.page })
      .all()[0]?.page ?? null,
  setPage: (projectId, page, blocks) =>
    db.transaction((tx) => writePage(tx, projectId, page, blocks)),
});
