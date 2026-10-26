/**
 * Pages are blocks (Projects spec §5.2): a project page's tab content is a
 * stack of blocks the person arranges. Each block keeps its place in the
 * order, its width (narrow or wide) and whether it is hidden, per project at
 * the hub, so every device shows the same arrangement. A custom view is one
 * thing in two places: its own tab, or a block on one page; a view stands as
 * a block exactly while a page's arrangement names it.
 *
 * A draft Caw writes for a page (the wireframe's §1.1) is a proposed block:
 * it stands where it asked to, not as a tab, until the person keeps it
 * (placed there) or removes it (the draft discarded).
 */
import type { ThreadSummary } from "./threads";

/**
 * The pages that hold blocks: the three tabs every project has, as the
 * dashboard draws them. A custom view is placed on one of these, never on a
 * tab that comes and goes with what the tasks draw (Canvas, Calendar,
 * Made), where it would vanish with the tab.
 */
export const SHOWN_BLOCK_PAGES = ["board", "table", "routines"] as const;
export type ShownBlockPage = (typeof SHOWN_BLOCK_PAGES)[number];

/**
 * The pages the hub's wire names (its routes, rows and Caw's view_draft):
 * the shown ones, and `pipeline`, which stays only for TestFlight 20261018's
 * reads and goes with the app's own Pipeline removal (tsk-59).
 */
export const BLOCK_PAGES = ["board", "table", "pipeline", "routines"] as const;
export type BlockPage = (typeof BLOCK_PAGES)[number];

/** Each page as its tab names it. */
export const BLOCK_PAGE_TITLES: Record<BlockPage, string> = {
  board: "Board",
  table: "Table",
  pipeline: "Pipeline",
  routines: "Routines",
};

export const BLOCK_WIDTHS = ["narrow", "wide"] as const;
export type BlockWidth = (typeof BLOCK_WIDTHS)[number];

/** What a custom view's block id starts with: `view:<name>`. */
export const VIEW_BLOCK = "view:";

/**
 * A block's id: a built-in block's word (`routines`, `sources`, `board`), or
 * `view:<name>` for a custom view placed as a block (a view name is the
 * hub's `VIEW_NAME`). A built-in id this build does not know (a newer
 * build's block) keeps its place.
 */
export const BLOCK_ID = /^(?:[a-z][a-z-]{0,31}|view:[a-z0-9][a-z0-9-]{0,62})$/u;

/** One block in a page's arrangement. */
export interface BlockPlace {
  /** A built-in block's word, or `view:<name>`. */
  block: string;
  /** Folded off the page; it keeps its place and comes back from the page's end. */
  hidden: boolean;
  /** Narrow takes the columns its measure needs; wide spans the row. */
  width: BlockWidth;
}

/** A block a page holds by itself: its id and the width it starts at. */
export interface BuiltInBlock {
  block: string;
  width: BlockWidth;
}

/**
 * Each page's own blocks, in their own order: what a page the person has
 * not arranged lays out, and what the hub counts a proposed block's place
 * among when it is kept. A task view's page holds the view; the Routines
 * page its three parts.
 */
export const BLOCK_BUILT_INS: Record<BlockPage, BuiltInBlock[]> = {
  board: [{ block: "board", width: "wide" }],
  table: [{ block: "table", width: "wide" }],
  pipeline: [{ block: "pipeline", width: "wide" }],
  routines: [
    { block: "routines", width: "narrow" },
    { block: "sources", width: "narrow" },
    { block: "actions", width: "narrow" },
  ],
};

/**
 * A draft view standing on a page as a proposed block: where it asked to
 * stand, and who drafted it. Keep places it there; Remove discards the
 * draft. It is no tab while it stands.
 */
export interface ProposedBlock {
  /** Who drafted it: "Caw", or a session's name. */
  by: string;
  page: BlockPage;
  /**
   * Its place in the page's order (every block of the page, hidden ones
   * included, counted from 0), or null: the page's end.
   */
  position: number | null;
  /** The draft view's name (`views/drafts/<view>.oui`). */
  view: string;
}

/**
 * A project's arrangement, as `GET /api/projects/:id/blocks` answers it:
 * each page the person has arranged, its blocks in order, and the drafts
 * standing on a page as proposed blocks. A page never arranged is absent,
 * and shows its built-in blocks in their own order.
 */
export interface BlockArrangement {
  pages: Partial<Record<BlockPage, BlockPlace[]>>;
  proposed: ProposedBlock[];
}

/**
 * What removing a kept view does, in the hub's words, before it is done
 * (`GET /api/projects/:id/views/:name/removal`): the person's confirm on
 * the block or the tab says this.
 */
export interface ViewRemoval {
  /** The question the confirm asks: what goes, and the block it leaves. */
  ask: string;
  /** The view's file, deleted as a commit. */
  file: string;
  /** The page it stands on as a block, or null: it is its own tab. */
  page: BlockPage | null;
  view: string;
}

/** A kept view removed (`DELETE /api/projects/:id/views/:name`): what went. */
export interface ViewRemoved {
  /** The commit that deleted its file. */
  commit: string;
  file: string;
  /** The page whose block it was, or null: it was its own tab. */
  page: BlockPage | null;
  /** What went, in the hub's words. */
  said: string;
  view: string;
}

/**
 * "Ask Caw to change it" (`POST /api/projects/:id/views/:name/asks`): the
 * thread your words and the view went to Caw in, and whether he is on. Off,
 * he still answers your words (off is never "can't be
 * messaged"); the page says so.
 */
export interface ViewAsked {
  caw: "on" | "off";
  thread: ThreadSummary;
}

/** A view's name as a person reads it: `spend-per-routine` is "Spend per routine". */
export const viewTitle = (name: string): string => {
  const words = name.replace(/-+/gu, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : name;
};

/** A custom view's block id. */
export const viewBlock = (name: string): string => `${VIEW_BLOCK}${name}`;

/** The view a block id names, or null for a built-in block. */
export const viewOfBlock = (block: string): string | null =>
  block.startsWith(VIEW_BLOCK) ? block.slice(VIEW_BLOCK.length) : null;

/**
 * A page's blocks in order: `stored`, as the person arranged them, less a
 * view no longer kept (`kept` answers for a view's name), then any of the
 * page's own (`BLOCK_BUILT_INS`) the record lacks, one a later build added,
 * at its own width. The hub counts a proposed block's place among these and
 * the dashboard draws them, so both count alike.
 */
export function placesWithBuiltIns(
  page: BlockPage,
  stored: BlockPlace[],
  kept: (view: string) => boolean
): BlockPlace[] {
  const shown = stored.filter((place) => {
    const view = viewOfBlock(place.block);
    return view === null || kept(view);
  });
  const named = new Set(shown.map((place) => place.block));
  return [
    ...shown,
    ...BLOCK_BUILT_INS[page]
      .filter((own) => !named.has(own.block))
      .map((own) => ({ block: own.block, width: own.width, hidden: false })),
  ];
}
