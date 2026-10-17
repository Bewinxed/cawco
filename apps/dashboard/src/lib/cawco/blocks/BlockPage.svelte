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
  import type { BlockPage, BlockPlace, BlockWidth } from "@cawco/core";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChevronDown, IconEye, IconLayers } from "#lib/icons.js";
  import type { ProjectBlocks } from "./arrangement.svelte";
  import Block from "./Block.svelte";
  import { BlockDragState, watchDrops } from "./block-dnd.svelte";

  let {
    page,
    blocks,
    items,
  }: {
    page: BlockPage;
    blocks: ProjectBlocks;
    /** Every block this page can draw, by id: its own, and the views placed on it. */
    items: Record<string, BlockItem>;
  } = $props();

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
    onwidth={(width) => setWidth(place, width)}
    {page}
    resizing={resizing === place.block}
    span={spanOf(place)}
    title={item.title}
    view={item.view ?? null}
    width={place.width}
    wideOnly={item.wideOnly ?? false}
  >
    {@render item.content(place.block)}
  </Block>
{/snippet}

{#if lone}
  {@const only = places[0]?.block ?? ""}
  {@render items[only]?.content(only)}
{:else}
  <div
    data-slot="block-page"
    class="flex min-w-0 flex-col gap-space-group"
    data-columns={columns}
    data-page={page}
  >
    <div
      data-slot="blocks"
      bind:this={grid}
      bind:clientWidth={gridWidth}
      class="grid grid-flow-row grid-cols-(--block-cols) items-start gap-space-group min-w-0"
      style:--block-fill={fill === null ? undefined : `${fill}px`}
      style:--columns={columns}
      style:--block-cols="repeat(var(--columns), minmax(0, 1fr))"
      {@attach reflow()}
      {@attach watchDrops(
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
    {#if hidden.length > 0 || refused}
      <div
        class="flex flex-wrap items-center justify-end gap-x-space-3 gap-y-space-2"
      >
        {#if refused}
          <!-- literal: 1 1 18rem, 72ch -->
          <p
            data-slot="refused"
            class="type-meta m-0 max-w-(--measure) flex-(--refused-flex) text-pretty text-status-fail-ink"
            role="status"
            style:--measure="72ch"
            style:--refused-flex="1 1 18rem"
          >
            {refused}
          </p>
        {/if}
        {#if hidden.length > 0}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              class="mark-line touch-hit"
              size="sm"
              variant="ghost"
            >
              <span
                >Hidden <span data-slot="num" class="num">{hidden.length}</span
                ></span
              >
              <IconChevronDown />
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-auto">
              {#each hidden as place (place.block)}
                <DropdownMenu.Item
                  onSelect={() =>
                    blocks.change(page, place.block, { hidden: false })}
                >
                  <IconEye />
                  <span>Show {items[place.block]?.title ?? place.block}</span>
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
  <p class="type-meta m-0 p-space-3 text-ink-muted">
    Update CawCo to see this block.
  </p>
{/snippet}
