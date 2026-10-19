<script lang="ts" module>
  import type { Component, Snippet } from "svelte";
  import type { BlockBody } from "./Block.svelte";

  /** What a page knows of one block it can hold: its face and its body. */
  export interface BlockItem {
    /** The head's own action, before its ⋯. */
    action?: Snippet;
    /**
     * Drawn alone, with no frame, while it is the page's only block: a task
     * view's page shows the view as it always has until a view joins it.
     */
    alone?: boolean;
    body: BlockBody;
    /** Its body is its card (a view or a board draws its own surfaces). */
    card: boolean;
    /** The block's body, drawn with its id. */
    content: Snippet<[string]>;
    glyph: Component;
    hideable: boolean;
    /** The token holding its measure, the narrowest it reads at: `--c-block-ledger`. */
    measure: string;
    /** What follows the title: a count, a needs-you mark. */
    meta?: Snippet;
    title: string;
    /** A custom view's name: its ⋯ shows it as a tab. */
    view?: string;
    /** Spans the row whatever its width says. */
    wideOnly?: boolean;
  }
</script>

<script lang="ts">
  /**
   * A project page as a stack of blocks (Projects spec §5.2; wireframe
   * §1.2): the person's arrangement, laid on a column grid by the page's
   * own width. Four columns from --c-grid-4, two from --c-grid-2, one under;
   * the order is the person's and room left at a row's end stays empty
   * (never `dense`). A wide block spans the row; a narrow one takes the
   * fewest columns that hold its measure, the row at most. On one column a
   * block's width changes nothing here, and its ⋯ keeps it for wider
   * screens.
   *
   * Moving, resizing, hiding and placing write the page's arrangement to
   * the hub, and the grid reflows when it answers (`reflow`, The Nothing
   * Jumps Rule): blocks that stay slide to their places, one that leaves
   * closes while fading, one that arrives is uncovered. A block whose width
   * changes tweens its box over --dur-morph on the drawer curve (`morph`).
   * Hidden blocks wait at the page's end, each shown again from there; a
   * refused write is said there in the hub's words.
   */
  import {
    type BlockPage,
    type BlockPlace,
    type BlockWidth,
    blocksWords as words,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconChevronDown, IconEye, IconLayers } from "#lib/icons.js";
  import type { ProjectBlocks } from "./arrangement.svelte";
  import Block from "./Block.svelte";
  import { BlockDragState, watchDrops } from "./block-dnd.svelte";
  import { keepBody, keptBody } from "./kept-bodies";

  let {
    page,
    blocks,
    items,
    reading = false,
    kept = false,
  }: {
    page: BlockPage;
    blocks: ProjectBlocks;
    /** Every block this page can draw, by id: its own, and the views placed on it. */
    items: Record<string, BlockItem>;
    /**
     * The page's data is still being read (The Claim Of Nothing Rule): every
     * block stands where and as wide as it will, its head without what it
     * counts or does, its body skeleton rows at the height it last stood at
     * here when `kept`, else a ledger's band and three rows.
     */
    reading?: boolean;
    /**
     * Each block's body height is kept (kept-bodies.ts) for the page's own
     * `reading` skeleton to stand at: a page that reads its data (Routines).
     */
    kept?: boolean;
  } = $props();

  /** The skeleton rows a block's body holds while its page is read. */
  const READING_ROWS = [0, 1, 2];

  const places = $derived(blocks.placesOf(page));
  const shown = $derived(places.filter((place) => !place.hidden));
  const hidden = $derived(places.filter((place) => place.hidden));
  /** A task view's page with nothing beside its view: the view alone, framed by nothing. */
  const lone = $derived(
    places.length === 1 && items[places[0]?.block ?? ""]?.alone === true
  );
  const refused = $derived(blocks.refused[page] ?? null);

  // --- the grid: its columns, and each block's span ----------------------------

  let grid = $state<HTMLElement | null>(null);
  let gridWidth = $state(0);
  /** The tokens the grid is laid by, in px, read once the grid is drawn. */
  let px = $state<{
    four: number;
    two: number;
    gap: number;
    measures: Record<string, number>;
  } | null>(null);

  /** A length token's value in px: rem or px, as the tokens write them. */
  function lengthOf(styles: CSSStyleDeclaration, token: string): number {
    const value = styles.getPropertyValue(token).trim();
    const n = Number.parseFloat(value);
    if (value.endsWith("rem")) {
      return (
        n *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
      );
    }
    return Number.isFinite(n) ? n : 0;
  }
  $effect(() => {
    const node = grid;
    const tokens = [
      ...new Set(Object.values(items).map((item) => item.measure)),
    ];
    if (!node) {
      return;
    }
    untrack(() => {
      const styles = getComputedStyle(node);
      px = {
        four: lengthOf(styles, "--c-grid-4"),
        two: lengthOf(styles, "--c-grid-2"),
        gap: Number.parseFloat(styles.columnGap) || 0,
        measures: Object.fromEntries(
          tokens.map((token) => [token, lengthOf(styles, token)])
        ),
      };
    });
  });
  const columns = $derived.by(() => {
    if (!px || gridWidth === 0) {
      return 1;
    }
    if (gridWidth >= px.four) {
      return 4;
    }
    return gridWidth >= px.two ? 2 : 1;
  });
  const columnWidth = $derived(
    px ? (gridWidth - (columns - 1) * px.gap) / columns : 0
  );
  function spanOf(place: BlockPlace): number {
    const item = items[place.block];
    if (place.width === "wide" || item?.wideOnly || !px || columnWidth <= 0) {
      return columns;
    }
    const measure = item ? (px.measures[item.measure] ?? 0) : 0;
    return Math.min(
      columns,
      Math.max(1, Math.ceil(measure / columnWidth - 0.001))
    );
  }

  // --- the board's height: the scroller the page stands in, less its foot -----

  /** A desk: the page's pane scrolls, and a filling block takes its height. */
  const desk = new MediaQuery("(min-width: 640px)");
  /** An overflow that scrolls: the page's scroller is the nearest with one. */
  const SCROLLS = /(auto|scroll)/;
  let fill = $state<number | null>(null);
  $effect(() => {
    const node = grid;
    const fills = shown.some((place) => items[place.block]?.body === "fill");
    if (!(node && fills && desk.current)) {
      fill = null;
      return;
    }
    let scroller: HTMLElement | null = node.parentElement;
    while (scroller && !SCROLLS.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement;
    }
    if (!scroller) {
      return;
    }
    const pane = scroller;
    const measure = () => {
      const styles = getComputedStyle(pane);
      fill =
        pane.clientHeight -
        Number.parseFloat(styles.paddingBlockStart) -
        Number.parseFloat(styles.paddingBlockEnd);
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(pane);
    return () => sizes.disconnect();
  });

  // --- what the person does to a block ----------------------------------------

  const drag = new BlockDragState();
  /** The block whose width is being changed: its box tweens (`morph`). */
  let resizing = $state<string | null>(null);

  const nextFrame = () =>
    new Promise<void>((done) => requestAnimationFrame(() => done()));

  function move(place: BlockPlace, step: -1 | 1) {
    const at = shown.indexOf(place);
    const neighbour = shown[at + step];
    if (neighbour) {
      // biome-ignore lint/complexity/noVoid: the page shows what the hub answers
      void blocks.move(page, place.block, places.indexOf(neighbour));
    }
  }

  async function setWidth(place: BlockPlace, width: BlockWidth) {
    if (width === place.width) {
      return;
    }
    // The tween reads the box as it is drawn: it is watching before the
    // width changes, a frame ahead of the write.
    resizing = place.block;
    await nextFrame();
    await nextFrame();
    await blocks.change(page, place.block, { width });
    setTimeout(
      () => {
        if (resizing === place.block) {
          resizing = null;
        }
      },
      dur("--dur-morph") * 2
    );
  }
</script>

{#snippet frame(place: BlockPlace, item: BlockItem, index: number)}
  {@const project = blocks.projectId}
  <Block
    action={item.action}
    body={item.body}
    card={item.card}
    {columns}
    {drag}
    first={index === 0}
    glyph={item.glyph}
    hideable={item.hideable}
    id={place.block}
    last={index === shown.length - 1}
    meta={item.meta}
    onhide={() => blocks.change(page, place.block, { hidden: true })}
    onmove={(step) => move(place, step)}
    ontab={() => {
      if (item.view) {
        // biome-ignore lint/complexity/noVoid: the page shows what the hub answers
        void blocks.unplace(item.view);
      }
    }}
    onbody={kept && !reading
      ? (height) => keepBody(project, page, place.block, height)
      : undefined}
    onwidth={(width) => setWidth(place, width)}
    {page}
    {reading}
    resizing={resizing === place.block}
    span={spanOf(place)}
    title={item.title}
    view={item.view ?? null}
    width={place.width}
    wideOnly={item.wideOnly ?? false}
  >
    {#if reading}
      {@render readingBody(kept ? keptBody(project, page, place.block) : null)}
    {:else}
      {@render item.content(place.block)}
    {/if}
  </Block>
{/snippet}

<!-- At the height the body last stood at here, else the band and three rows. -->
{#snippet readingBody(kept: number | null)}
  <div
    data-slot="block-reading"
    class="reading"
    style:block-size={kept === null ? undefined : `${kept}px`}
  >
    <div class="reading-band"><Skeleton class="reading-line" /></div>
    {#each READING_ROWS as row (row)}
      <div class="reading-row">
        <span class="reading-name"><Skeleton class="reading-line" /></span>
        <span class="reading-sub"><Skeleton class="reading-line" /></span>
      </div>
    {/each}
  </div>
{/snippet}

{#if lone}
  {@const only = places[0]?.block ?? ""}
  {#if reading}
    {@render readingBody(kept ? keptBody(blocks.projectId, page, only) : null)}
  {:else}
    {@render items[only]?.content(only)}
  {/if}
{:else}
  <div
    data-slot="block-page"
    class="block-page"
    data-columns={columns}
    data-page={page}
  >
    <div
      data-slot="blocks"
      bind:this={grid}
      bind:clientWidth={gridWidth}
      class="blocks"
      style:--block-fill={fill === null ? undefined : `${fill}px`}
      style:--columns={columns}
      {@attach reflow()}
      {@attach !reading &&
        watchDrops(
          () => ({ order: places.map((place) => place.block), page }),
          (block, to) => blocks.move(page, block, to)
        )}
    >
      {#each shown as place, index (place.block)}
        {@const item = items[place.block]}
        {#if item}
          {@render frame(place, item, index)}
        {:else}
          <!-- A block a newer build drew: it keeps its place. -->
          {@render frame(
            place,
            {
              title: place.block,
              glyph: IconLayers,
              hideable: true,
              measure: "--c-block-view",
              body: "natural",
              card: true,
              content: newer,
            },
            index
          )}
        {/if}
      {/each}
    </div>
    {#if !reading && (hidden.length > 0 || refused)}
      <div class="page-end">
        {#if refused}
          <p data-slot="refused" class="refused" role="status">{refused}</p>
        {/if}
        {#if hidden.length > 0}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="{buttonVariants({
                variant: 'ghost',
                size: 'sm',
              })} mark-line touch-hit"
            >
              <span
                >{words.hidden}
                <span data-slot="num" class="num">{hidden.length}</span></span
              >
              <IconChevronDown />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-auto min-w-48">
              {#each hidden as place (place.block)}
                <DropdownMenu.Item
                  onSelect={() =>
                    blocks.change(page, place.block, { hidden: false })}
                >
                  <IconEye />
                  <span
                    >{words.show(
                      items[place.block]?.title ?? place.block
                    )}</span
                  >
                </DropdownMenu.Item>
              {/each}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        {/if}
      </div>
    {/if}
  </div>
{/if}

{#snippet newer()}
  <p class="newer">{words.newer}</p>
{/snippet}

<style>
  .block-page {
    display: flex;
    flex-direction: column;
    gap: var(--space-group);
    min-inline-size: 0;
  }
  .blocks {
    display: grid;
    grid-auto-flow: row;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    align-items: start;
    gap: var(--space-group);
    min-inline-size: 0;
  }
  .page-end {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2) var(--space-3);
  }
  .refused {
    flex: 1 1 18rem;
    max-inline-size: 72ch;
    margin: 0;
    font: var(--type-meta);
    color: var(--status-fail-ink);
    text-wrap: pretty;
  }
  .newer {
    margin: 0;
    padding: var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }

  /* A block's body while its page is read, at the height it last stood at
     here, else a ledger's: its band (--c-toolbar-ctl), then rows as the
     ledgers' rows stand (ViewRoutines `tr.row > td`): --space-2 above and
     below a name's line in label type over its line in meta type, at least
     --c-btn-h-lg, a hairline between. Each line holds a skeleton bar where
     its words start; nothing else is drawn, so inside the wait's grace the
     card is its plain surface. */
  .reading {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
    overflow: hidden;
  }
  .reading-band,
  .reading-row {
    display: flex;
    flex: none;
    padding-inline: calc(var(--c-row-lead) + var(--space-3) * 2) var(--space-3);
  }
  .reading-band {
    align-items: center;
    block-size: var(--c-toolbar-ctl);
  }
  .reading-row {
    flex-direction: column;
    justify-content: center;
    min-block-size: var(--c-btn-h-lg);
    padding-block: var(--space-2);

    & + & {
      border-block-start: 1px solid transparent;
    }
  }
  .reading-name,
  .reading-sub {
    display: flex;
    align-items: center;
    block-size: 1lh;
  }
  .reading-name {
    font: var(--type-label);
  }
  .reading-sub {
    font: var(--type-meta);
  }
  .reading :global(.reading-line) {
    inline-size: 40%;
    block-size: 1ex;
    border-radius: var(--radius-hair);
  }
  .reading-sub :global(.reading-line) {
    inline-size: 60%;
  }
  .reading-band :global(.reading-line) {
    inline-size: 20%;
    font: var(--type-label);
  }
</style>
