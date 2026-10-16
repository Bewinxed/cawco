/**
 * Pages are blocks (Projects spec §5.2): a project page's tab content is a
 * stack of blocks the person arranges, kept here per project so every
 * device shows the same arrangement (`project_blocks`, db/blocks.ts).
 *
 * - **Read** whole: each arranged page, its blocks in order, and the drafts
 *   standing on a page as proposed blocks. A page never arranged is absent;
 *   it shows its built-in blocks (core `BLOCK_BUILT_INS`) in their order.
 * - **Written a page at a time**, whole: the page's order, each block's
 *   width and whether it is hidden. A custom view named on a page stands
 *   there as a block and leaves any other page it stood on; one no page
 *   names is its own tab. Only a kept view can be placed.
 * - **Proposed**: a draft a session writes for a page (`view_draft` with a
 *   page, caw.ts) stands there as a proposed block, where it asked to, and
 *   is no tab (`view_proposals`). Keep places it at that place in the
 *   page's order, counted among every block the page shows, its own ones
 *   included; Remove (its draft discarded) drops it. A page written whole
 *   never touches a proposal.
 * - **A kept view removed** (views.ts) leaves the page it stood on.
 * - Every change tells each dashboard showing the project to read it again
 *   (`blocks.changed`), so a second screen shows it as it lands.
 */
import {
  BLOCK_BUILT_INS,
  BLOCK_ID,
  BLOCK_PAGES,
  BLOCK_WIDTHS,
  type BlockArrangement,
  type BlockPage,
  type BlockPlace,
  type ProposedBlock,
  viewBlock,
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
    const proposed: ProposedBlock[] = db.blocks
      .proposals(projectId)
      .map((row) => ({
        view: row.view,
        page: row.page,
        position: row.position,
        by: row.proposedBy,
      }));
    return { pages, proposed };
  };

  /**
   * A page's blocks in the order it shows them: as arranged (views still
   * kept), then any of its own the arrangement lacks, as the dashboard lays
   * them out.
   */
  const placesOf = (
    projectId: string,
    page: BlockPage,
    kept: Set<string>
  ): BlockPlace[] => {
    const stored = db.blocks
      .ofProject(projectId)
      .filter((row) => {
        const view = viewOfBlock(row.block);
        return row.page === page && (view === null || kept.has(view));
      })
      .map((row) => ({
        block: row.block,
        width: row.width,
        hidden: row.hidden,
      }));
    const named = new Set(stored.map((place) => place.block));
    return [
      ...stored,
      ...BLOCK_BUILT_INS[page]
        .filter((own) => !named.has(own.block))
        .map((own) => ({ block: own.block, width: own.width, hidden: false })),
    ];
  };

  return {
    /** The project's arrangement: every page it has arranged, and what is proposed. */
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

    /**
     * A draft proposed on `page` by `by`, at `position` in its order (null:
     * its end): it stands there as a proposed block, not as a tab. A second
     * draft of the same view moves its place.
     */
    propose(
      projectId: string,
      view: string,
      page: BlockPage,
      position: number | null,
      by: string
    ): ProposedBlock {
      known(projectId);
      db.blocks.propose({
        projectId,
        view,
        page,
        position,
        proposedBy: by,
        proposedAt: new Date(),
      });
      changed(projectId);
      return { view, page, position, by };
    },

    /**
     * A draft kept (views.ts has moved it to `views/<view>.oui`): a proposal
     * for it becomes its block, at the place it asked for in its page's
     * order, narrow, and is gone. Answers that page, or null when the draft
     * stood on no page (it is a tab).
     */
    async kept(projectId: string, view: string): Promise<BlockPage | null> {
      const proposal = db.blocks
        .proposals(projectId)
        .find((row) => row.view === view);
      if (!proposal) {
        return null;
      }
      const block = viewBlock(view);
      const places = placesOf(
        projectId,
        proposal.page,
        new Set(await keptViews(projectId))
      ).filter((place) => place.block !== block);
      const at =
        proposal.position === null
          ? places.length
          : Math.min(proposal.position, places.length);
      places.splice(at, 0, { block, width: "narrow", hidden: false });
      db.blocks.place(projectId, view, proposal.page, places);
      changed(projectId);
      return proposal.page;
    },

    /** A draft discarded: the proposal it stood as goes with it. */
    discarded(projectId: string, view: string): void {
      if (db.blocks.unpropose(projectId, view)) {
        changed(projectId);
      }
    },

    /** The page a kept view stands on as a block, or null: it is its own tab. */
    pageOf(projectId: string, view: string): BlockPage | null {
      const block = viewBlock(view);
      return (
        db.blocks.ofProject(projectId).find((row) => row.block === block)
          ?.page ?? null
      );
    },

    /** A kept view removed: its block leaves its page. Answers that page, or null. */
    removed(projectId: string, view: string): BlockPage | null {
      const page = db.blocks.unplace(projectId, viewBlock(view));
      if (page) {
        changed(projectId);
      }
      return page;
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
