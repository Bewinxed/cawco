/**
 * Pages are blocks (Projects spec §5.2): a project page's tab content is a
 * stack of blocks the person arranges. Each block keeps its place in the
 * order, its width (narrow or wide) and whether it is hidden, per project at
 * the hub, so every device shows the same arrangement. A custom view is one
 * thing in two places: its own tab, or a block on one page; a view stands as
 * a block exactly while a page's arrangement names it.
 */

/**
 * The pages that hold blocks: the four tabs every project has. A custom
 * view is placed on one of these, never on a tab that comes and goes with
 * what the tasks draw (Canvas, Calendar, Made), where it would vanish with
 * the tab.
 */
export const BLOCK_PAGES = ["board", "table", "pipeline", "routines"] as const;
export type BlockPage = (typeof BLOCK_PAGES)[number];

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
export const BLOCK_ID = /^(?:[a-z][a-z-]{0,31}|view:[a-z0-9][a-z0-9-]{0,62})$/;

/** One block in a page's arrangement. */
export interface BlockPlace {
  /** A built-in block's word, or `view:<name>`. */
  block: string;
  /** Folded off the page; it keeps its place and comes back from the page's end. */
  hidden: boolean;
  /** Narrow takes the columns its measure needs; wide spans the row. */
  width: BlockWidth;
}

/**
 * A project's arrangement, as `GET /api/projects/:id/blocks` answers it:
 * each page the person has arranged, its blocks in order. A page never
 * arranged is absent, and shows its built-in blocks in their own order.
 */
export interface BlockArrangement {
  pages: Partial<Record<BlockPage, BlockPlace[]>>;
}

/** A custom view's block id. */
export const viewBlock = (name: string): string => `${VIEW_BLOCK}${name}`;

/** The view a block id names, or null for a built-in block. */
export const viewOfBlock = (block: string): string | null =>
  block.startsWith(VIEW_BLOCK) ? block.slice(VIEW_BLOCK.length) : null;
