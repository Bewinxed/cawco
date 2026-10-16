<script lang="ts">
  /**
   * One block's frame (wireframe §1.1): its head, then its body.
   *
   * - **Head:** the 16px glyph in ink-muted, the title in label, what the
   *   block counts (`meta`), then at the trailing edge the block's own
   *   action and its ⋯. The head is the drag handle (block-dnd): a mouse or
   *   pen drags it, a phone lifts it after a held press; it tints on press.
   *   44px tall under a coarse pointer.
   * - **The ⋯** (the kit menu): Move up, Move down; Narrow or Wide, which on
   *   one column still sets the desk's ("On wider screens"); Hide; and for a
   *   custom view, Show as a tab.
   * - **Body:** the block's content, as its card or bare (a view or a board
   *   draws its own surfaces); a list stands at most --c-block-body-max tall
   *   on a desk and scrolls inside; the board fills the page's height.
   *
   * While a block is in the air its own box stays as a slot (surface-recess,
   * a dashed control edge), and the block the pointer is nearest draws the
   * drop indicator on the edge the drop would take: a brand-solid line
   * across that edge in the gap, its dot at the leading end. A width change
   * tweens the box (`morph`, while `resizing`).
   */
  import type { BlockWidth } from "@cawco/core";
  import type { Component, Snippet } from "svelte";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { buttonVariants } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconArrowDown,
    IconArrowUp,
    IconEyeClosed,
    IconMore,
    IconWindow,
  } from "#lib/icons.js";
  import {
    type BlockDragState,
    dragHead,
    dropOnBlock,
  } from "./block-dnd.svelte";

  export type BlockBody = "natural" | "capped" | "fill";

  let {
    id,
    page,
    title,
    glyph: Glyph,
    meta,
    action,
    children,
    width,
    span,
    columns,
    first,
    last,
    wideOnly,
    hideable,
    view,
    card,
    body,
    resizing,
    drag,
    onmove,
    onwidth,
    onhide,
    ontab,
  }: {
    /** The block's id in the arrangement. */
    id: string;
    page: string;
    title: string;
    glyph: Component;
    /** What follows the title: a count, a needs-you mark. */
    meta?: Snippet;
    /** The block's own action, before its ⋯. */
    action?: Snippet;
    children: Snippet;
    width: BlockWidth;
    /** The grid's columns it takes. */
    span: number;
    /** The grid's columns. */
    columns: number;
    first: boolean;
    last: boolean;
    /** Spans the row whatever its width says: no Narrow or Wide. */
    wideOnly: boolean;
    hideable: boolean;
    /** A custom view's name: its ⋯ shows it as a tab. */
    view: string | null;
    /** Its body is its card. */
    card: boolean;
    body: BlockBody;
    /** Its width is changing: its box tweens to the new one. */
    resizing: boolean;
    drag: BlockDragState;
    onmove: (step: -1 | 1) => void;
    onwidth: (width: BlockWidth) => void;
    onhide: () => void;
    ontab: () => void;
  } = $props();

  const over = $derived(drag.over?.block === id ? drag.over.edge : null);
  const headId = $derived(`block-${page}-${id.replace(":", "-")}`);
</script>

<section
  aria-labelledby={headId}
  class="block"
  class:narrow={width === "narrow"}
  class:wide={width === "wide"}
  data-block={id}
  data-body={body}
  data-dragging={drag.dragging === id ? "" : undefined}
  data-flip
  data-span={span}
  style:grid-column="span {span}"
  {@attach dropOnBlock(drag, () => ({ block: id, columns, page }))}
  {@attach resizing && morph({ width: true })}
>
  <header
    class="block-head mark-line press-tint"
    {@attach dragHead(drag, () => ({ block: id, page }))}
  >
    <span aria-hidden="true" class="glyph" data-box><Glyph /></span>
    <h2 class="title" id={headId}>{title}</h2>
    {#if meta}
      <span class="meta" data-box>{@render meta()}</span>
    {/if}
    <span class="tools" data-block-tools data-box>
      {@render action?.()}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          aria-label="More for {title}"
          class="{buttonVariants({
            variant: 'ghost',
            size: 'icon-sm',
          })} touch-hit"
        >
          <IconMore />
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-auto min-w-48">
          <DropdownMenu.Item disabled={first} onSelect={() => onmove(-1)}>
            <IconArrowUp />
            <span>Move up</span>
          </DropdownMenu.Item>
          <DropdownMenu.Item disabled={last} onSelect={() => onmove(1)}>
            <IconArrowDown />
            <span>Move down</span>
          </DropdownMenu.Item>
          {#if !wideOnly}
            <DropdownMenu.Separator />
            <DropdownMenu.RadioGroup
              onValueChange={(next) => onwidth(next as BlockWidth)}
              value={width}
            >
              <DropdownMenu.RadioItem value="narrow"
                >Narrow</DropdownMenu.RadioItem
              >
              <DropdownMenu.RadioItem value="wide">Wide</DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            {#if columns === 1}
              <p class="aside">On wider screens</p>
            {/if}
          {/if}
          {#if hideable || view}
            <DropdownMenu.Separator />
          {/if}
          {#if hideable}
            <DropdownMenu.Item onSelect={onhide}>
              <IconEyeClosed />
              <span>Hide</span>
            </DropdownMenu.Item>
          {/if}
          {#if view}
            <DropdownMenu.Item onSelect={ontab}>
              <IconWindow />
              <span>Show as a tab</span>
            </DropdownMenu.Item>
          {/if}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </span>
  </header>
  <div class={["block-body", card && "card"]}>{@render children()}</div>
  {#if over}
    <span aria-hidden="true" class="drop" data-edge={over}></span>
  {/if}
</section>

<style>
  .block {
    --block-head-h: var(--c-btn-h-sm);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .block-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--block-head-h);
    min-inline-size: 0;
    padding-inline: var(--space-1);
    border-radius: var(--radius-md);
    cursor: grab;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .glyph {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--ink-muted);
  }
  .glyph :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .title {
    flex: 0 1 auto;
    min-inline-size: 0;
    margin: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
  }
  .tools {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    margin-inline-start: auto;
    cursor: default;
  }
  .aside {
    margin: 0;
    padding: 0 var(--space-3) var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .block-body {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .block-body.card {
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  /* The board fills the page's height less its head (BlockPage measures the
     page; with no measure, it stands at its own height); a list stands no
     taller than its cap on a desk and scrolls inside. */
  .block[data-body="fill"] .block-body {
    block-size: calc(var(--block-fill) - var(--block-head-h) - var(--space-2));
  }
  @media (min-width: 640px) {
    .block[data-body="capped"] .block-body {
      max-block-size: var(--c-block-body-max);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }
  @media (pointer: coarse) {
    .block {
      --block-head-h: var(--c-btn-h-lg);
    }
  }

  /* In the air: the block's box stays as its slot, the block not drawn twice. */
  .block[data-dragging] {
    border-radius: var(--radius-lg);
    background: var(--surface-recess);
    outline: 1px dashed var(--border-control);
    outline-offset: -1px;
  }
  .block[data-dragging] > :not(.drop) {
    visibility: hidden;
  }

  /* The drop indicator: across the target's edge, in the gap between blocks. */
  .drop {
    position: absolute;
    z-index: 2;
    border-radius: var(--radius-hair);
    background: var(--brand-solid);
    pointer-events: none;
  }
  .drop::before {
    position: absolute;
    inline-size: var(--c-block-drop-dot);
    block-size: var(--c-block-drop-dot);
    border-radius: 50%;
    background: var(--brand-solid);
    content: "";
  }
  .drop:is([data-edge="top"], [data-edge="bottom"]) {
    inset-inline: 0;
    block-size: var(--c-block-drop-line);
  }
  .drop[data-edge="top"] {
    inset-block-start: calc(
      var(--space-group) / -2 - var(--c-block-drop-line) / 2
    );
  }
  .drop[data-edge="bottom"] {
    inset-block-end: calc(
      var(--space-group) / -2 - var(--c-block-drop-line) / 2
    );
  }
  .drop:is([data-edge="top"], [data-edge="bottom"])::before {
    inset-block-start: calc(
      (var(--c-block-drop-line) - var(--c-block-drop-dot)) / 2
    );
    inset-inline-start: calc(var(--c-block-drop-dot) / -2);
  }
  .drop:is([data-edge="left"], [data-edge="right"]) {
    inset-block: 0;
    inline-size: var(--c-block-drop-line);
  }
  .drop[data-edge="left"] {
    inset-inline-start: calc(
      var(--space-group) / -2 - var(--c-block-drop-line) / 2
    );
  }
  .drop[data-edge="right"] {
    inset-inline-end: calc(
      var(--space-group) / -2 - var(--c-block-drop-line) / 2
    );
  }
  .drop:is([data-edge="left"], [data-edge="right"])::before {
    inset-block-start: calc(var(--c-block-drop-dot) / -2);
    inset-inline-start: calc(
      (var(--c-block-drop-line) - var(--c-block-drop-dot)) / 2
    );
  }

  /* The drag's preview: a copy of the head alone, its tools left out, on its
     own surface (block-dnd). */
  .block-head:global([data-block-preview]) {
    padding-inline: var(--space-3);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
  }
</style>
