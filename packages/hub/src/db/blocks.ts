import type { BlockPage, BlockPlace } from "@cawco/core";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { projectBlocks } from "./schema";

export type BlockRow = typeof projectBlocks.$inferSelect;

/** The rows blocks.ts keeps: each project page's arrangement of blocks. */
export interface BlocksDb {
  /** A project's blocks, page by page, each page in its order. */
  readonly ofProject: (projectId: string) => BlockRow[];
  /**
   * One page's arrangement, whole, in one transaction: the page's rows are
   * replaced by `blocks` in their order, and a block named here that stood
   * on another page leaves it (a view stands on one page at most).
   */
  readonly setPage: (
    projectId: string,
    page: BlockPage,
    blocks: BlockPlace[]
  ) => void;
}

export const blocksDb = (db: BunSQLiteDatabase): BlocksDb => ({
  ofProject: (projectId) =>
    db
      .select()
      .from(projectBlocks)
      .where(eq(projectBlocks.projectId, projectId))
      .orderBy(asc(projectBlocks.page), asc(projectBlocks.position))
      .all(),
  setPage: (projectId, page, blocks) =>
    db.transaction((tx) => {
      tx.delete(projectBlocks)
        .where(
          and(
            eq(projectBlocks.projectId, projectId),
            eq(projectBlocks.page, page)
          )
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
    }),
});
