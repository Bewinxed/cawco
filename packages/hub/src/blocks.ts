/**
 * Pages are blocks (Projects spec §5.2): a project page's tab content is a
 * stack of blocks the person arranges, kept here per project so every
 * device shows the same arrangement (`project_blocks`, db/blocks.ts).
 *
 * - **Read** whole: each arranged page, its blocks in order. A page never
 *   arranged is absent; the dashboard lays out its built-in blocks then.
 * - **Written a page at a time**, whole: the page's order, each block's
 *   width and whether it is hidden. A custom view named on a page stands
 *   there as a block and leaves any other page it stood on; one no page
 *   names is its own tab. Only a kept view can be placed.
 * - Every write tells each dashboard showing the project to read it again
 *   (`blocks.changed`), so a second screen shows the change as it lands.
 */
import {
  BLOCK_ID,
  BLOCK_PAGES,
  BLOCK_WIDTHS,
  type BlockArrangement,
  type BlockPage,
  type BlockPlace,
  viewOfBlock,
} from "@cawco/core";
import { Elysia, t } from "elysia";
import type { DbShape } from "./db";
import { FolderRefusal, refused } from "./project-folder";

/** The most blocks one page holds: its built-ins and the views placed on it. */
const MOST = 64;

export interface BlocksDeps {
  readonly changed: (projectId: string) => void;
  readonly db: Pick<DbShape, "blocks">;
  /** The project's kept views, by name. */
  readonly keptViews: (projectId: string) => Promise<string[]>;
  /** A project's name, or undefined when the hub keeps no such project. */
  readonly projectName: (projectId: string) => string | undefined;
}

export const createBlocks = ({
  changed,
  db,
  keptViews,
  projectName,
}: BlocksDeps) => {
  const known = (projectId: string): void => {
    if (projectName(projectId) === undefined) {
      throw new FolderRefusal(404, `The hub keeps no project ${projectId}.`);
    }
  };

  const arrangement = (projectId: string): BlockArrangement => {
    const pages: BlockArrangement["pages"] = {};
    for (const row of db.blocks.ofProject(projectId)) {
      const place = { block: row.block, width: row.width, hidden: row.hidden };
      pages[row.page] = [...(pages[row.page] ?? []), place];
    }
    return { pages };
  };

  return {
    /** The project's arrangement: every page it has arranged. */
    read(projectId: string): BlockArrangement {
      known(projectId);
      return arrangement(projectId);
    },

    /** One page's arrangement, whole: checked, kept, told; answers the project's. */
    async write(
      projectId: string,
      page: BlockPage,
      blocks: BlockPlace[]
    ): Promise<BlockArrangement> {
      known(projectId);
      const seen = new Set<string>();
      for (const { block } of blocks) {
        if (seen.has(block)) {
          throw new FolderRefusal(
            400,
            `The ${page} page names the block “${block}” twice; each block stands once.`
          );
        }
        seen.add(block);
      }
      const placed = blocks
        .map((each) => viewOfBlock(each.block))
        .filter((name): name is string => name !== null);
      if (placed.length > 0) {
        const kept = new Set(await keptViews(projectId));
        const missing = placed.filter((name) => !kept.has(name));
        if (missing.length > 0) {
          throw new FolderRefusal(
            400,
            `Only a kept view stands as a block, and ${missing.map((name) => `“${name}”`).join(", ")} ${missing.length > 1 ? "are" : "is"} not one of this project's kept views.`
          );
        }
      }
      db.blocks.setPage(projectId, page, blocks);
      changed(projectId);
      return arrangement(projectId);
    },
  };
};

export type Blocks = ReturnType<typeof createBlocks>;

const PAGE = t.Union(BLOCK_PAGES.map((page) => t.Literal(page)));
const WIDTH = t.Union(BLOCK_WIDTHS.map((width) => t.Literal(width)));

/** The routes for a project's arrangement of blocks. */
export const blockRoutes = (blocks: Blocks) =>
  new Elysia()
    .get("/api/projects/:id/blocks", ({ params }) => {
      try {
        return blocks.read(params.id);
      } catch (error) {
        return refused(error);
      }
    })
    .put(
      "/api/projects/:id/blocks/:page",
      {
        params: t.Object({ id: t.String(), page: PAGE }),
        body: t.Object({
          blocks: t.Array(
            t.Object({
              block: t.String({ pattern: BLOCK_ID.source }),
              width: WIDTH,
              hidden: t.Boolean(),
            }),
            { maxItems: MOST }
          ),
        }),
      },
      async ({ params, body }) => {
        try {
          return await blocks.write(params.id, params.page, body.blocks);
        } catch (error) {
          return refused(error);
        }
      }
    );
