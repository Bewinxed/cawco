/**
 * Pages are blocks (Projects spec §5.2): a project's arrangement of blocks,
 * as the hub keeps it (hub blocks.ts). Each page's blocks in the person's
 * order, each narrow or wide, shown or hidden; a custom view placed on a
 * page is a block there and no tab.
 *
 * The page shows what the hub answered (DESIGN.md, The Stay In Context
 * Rule): a change is written, and the reflow runs when the hub's answer
 * lands. A refused write leaves the page as it stood, with the hub's words
 * on its end row. Read on arrival, on every reconnect, and whenever the hub
 * says the arrangement changed (`blocks.changed`), so a second screen shows
 * a change as it lands.
 */
import {
  BLOCK_BUILT_INS,
  BLOCK_PAGES,
  type BlockArrangement,
  type BlockPage,
  type BlockPlace,
  viewBlock,
  viewOfBlock,
} from "@cawco/core";
import { failureWords } from "../hub-read";
import { json, send } from "../project-tasks";

const blocksPath = (projectId: string) =>
  `/api/projects/${encodeURIComponent(projectId)}/blocks`;

export const isBlockPage = (value: string): value is BlockPage =>
  (BLOCK_PAGES as readonly string[]).includes(value);

export class ProjectBlocks {
  readonly #projectId: () => string;
  /** The project's kept views by name, once read: a block naming one gone is dropped. */
  readonly #kept: () => string[] | null;
  /** As the hub last answered it; null until the first read lands. */
  arrangement = $state<BlockArrangement | null>(null);
  /** The hub's words for a page's last refused write. */
  refused = $state<Partial<Record<BlockPage, string>>>({});
  /** Reads so far: only the newest one's answer is kept. */
  #reads = 0;

  constructor(projectId: () => string, kept: () => string[] | null) {
    this.#projectId = projectId;
    this.#kept = kept;
  }

  async read(): Promise<void> {
    const id = this.#projectId();
    this.#reads += 1;
    const ticket = this.#reads;
    try {
      const next = await send<BlockArrangement>(blocksPath(id));
      if (id === this.#projectId() && ticket === this.#reads) {
        this.arrangement = next;
      }
    } catch {
      // The pages stand in their own order until the next read.
    }
  }

  /**
   * A page's blocks in order: as the person arranged them, then any of the
   * page's own the record lacks (one a later build added), at its own
   * width. The page's own are core's (`BLOCK_BUILT_INS`), the list the hub
   * counts a proposed block's place among, so both count it alike. A view no longer kept is left out; a block this build does not
   * know keeps its place.
   */
  placesOf(page: BlockPage): BlockPlace[] {
    const kept = this.#kept();
    const stored = (this.arrangement?.pages[page] ?? []).filter((place) => {
      const view = viewOfBlock(place.block);
      return view === null || kept === null || kept.includes(view);
    });
    const named = new Set(stored.map((place) => place.block));
    return [
      ...stored,
      ...BLOCK_BUILT_INS[page]
        .filter((own) => !named.has(own.block))
        .map((own) => ({ block: own.block, width: own.width, hidden: false })),
    ];
  }

  /** The page a custom view stands on as a block, or null: it is its own tab. */
  pageOfView(name: string): BlockPage | null {
    const block = viewBlock(name);
    return (
      BLOCK_PAGES.find((page) =>
        this.placesOf(page).some((place) => place.block === block)
      ) ?? null
    );
  }

  /**
   * Writes a page's arrangement whole. Answers whether the hub took it;
   * refused, the page stands as it was and its end row says why.
   */
  async set(page: BlockPage, places: BlockPlace[]): Promise<boolean> {
    const id = this.#projectId();
    try {
      const next = await send<BlockArrangement>(
        `${blocksPath(id)}/${page}`,
        json("PUT", { blocks: places })
      );
      if (id === this.#projectId()) {
        this.arrangement = next;
        const { [page]: _, ...rest } = this.refused;
        this.refused = rest;
      }
      return true;
    } catch (error) {
      if (id === this.#projectId()) {
        this.refused = { ...this.refused, [page]: failureWords(error) };
      }
      return false;
    }
  }

  /** One block of a page changed in place (its width, hidden or shown). */
  change(page: BlockPage, block: string, change: Partial<BlockPlace>) {
    return this.set(
      page,
      this.placesOf(page).map((place) =>
        place.block === block ? { ...place, ...change } : place
      )
    );
  }

  /** A block moved to `to`, its place in the page's order. */
  move(page: BlockPage, block: string, to: number) {
    const places = this.placesOf(page);
    const from = places.findIndex((place) => place.block === block);
    if (from < 0 || to === from) {
      return Promise.resolve(true);
    }
    const next = places.filter((place) => place.block !== block);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, places[from]);
    return this.set(page, next);
  }

  /** A kept view placed on `page`, at its end, narrow: it is no tab now, and on no other page. */
  place(name: string, page: BlockPage) {
    const block = viewBlock(name);
    return this.set(page, [
      ...this.placesOf(page).filter((place) => place.block !== block),
      { block, width: "narrow", hidden: false },
    ]);
  }

  /** A view's block leaves its page: the view is its own tab again. */
  unplace(name: string) {
    const page = this.pageOfView(name);
    const block = viewBlock(name);
    return page
      ? this.set(
          page,
          this.placesOf(page).filter((place) => place.block !== block)
        )
      : Promise.resolve(true);
  }
}
