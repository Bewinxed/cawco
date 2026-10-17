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
  data-wide={width === "wide" || undefined}
  data-narrow={width === "narrow" || undefined}
  data-slot="block"
  aria-labelledby={headId}
  class="group/block relative col-(--block-col) flex min-w-0 flex-col gap-space-2 data-dragging:rounded-lg data-dragging:bg-surface-recess data-dragging:-outline-offset-1 data-dragging:outline-1 data-dragging:outline-border-control data-dragging:outline-dashed"
  data-block={id}
  data-body={body}
  data-dragging={drag.dragging === id ? "" : undefined}
  data-flip
  data-span={span}
  style:--block-col="span {span}"
  style:--fill-h-coarse="calc(var(--block-fill) - var(--c-btn-h-lg) -
  var(--space-2))"
  style:--fill-h-fine="calc(var(--block-fill) - var(--c-btn-h-sm) -
  var(--space-2))"
  {@attach dropOnBlock(drag, () => ({ block: id, columns, page }))}
  {@attach resizing && morph({ width: true })}
>
  <!-- In the air: the block's box stays as its slot, the block not drawn
       twice (its head and body hidden). -->
  <header
    data-slot="block-head"
    class="mark-line press-tint flex min-h-c-btn-h-sm min-w-0 cursor-grab items-center gap-space-2 rounded-md px-space-1 select-none group-data-dragging/block:invisible coarse:min-h-c-btn-h-lg data-block-preview:bg-surface-raised data-block-preview:px-space-3 data-block-preview:shadow-overlay"
    {@attach dragHead(drag, () => ({ block: id, page }))}
  >
    <span
      data-slot="glyph"
      aria-hidden="true"
      class="grid flex-none place-items-center text-ink-muted"
      data-box><Glyph /></span
    >
    <h2
      data-slot="title"
      class="type-label m-0 min-w-0 flex-initial overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
      id={headId}
    >
      {title}
    </h2>
    {#if meta}
      <span
        data-slot="meta"
        class="inline-flex flex-none items-center gap-space-1"
        data-box>{@render meta()}</span
      >
    {/if}
    <span
      data-slot="tools"
      class="ms-auto flex flex-none cursor-default items-center gap-space-2"
      data-block-tools
      data-box
    >
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
              <p class="type-meta m-0 px-space-3 pb-space-1 text-ink-muted">
                On wider screens
              </p>
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
  <!-- The board fills the page's height less its head (BlockPage measures
       the page; with no measure, it stands at its own height); a list stands
       no taller than its cap on a desk and scrolls inside. -->
  <div
    data-card={card || undefined}
    data-slot="block-body"
    class="flex min-w-0 flex-col group-data-dragging/block:invisible group-body-capped/block:phone:max-h-c-block-body-max group-body-capped/block:phone:overflow-y-auto group-body-capped/block:phone:overscroll-contain group-body-fill/block:h-(--fill-h-fine) group-body-fill/block:coarse:h-(--fill-h-coarse) data-card:overflow-hidden data-card:rounded-lg data-card:bg-surface-raised data-card:shadow-tile"
  >
    {@render children()}
  </div>
  <!-- The drop indicator: across the target's edge, in the gap between
       blocks. -->
  {#if over}
    <span
      data-slot="drop"
      aria-hidden="true"
      class="pointer-events-none absolute z-2 rounded-hair bg-brand-solid edge-bottom:inset-x-0 edge-bottom:bottom-(--drop-off) edge-bottom:h-c-block-drop-line edge-left:inset-y-0 edge-left:start-(--drop-off) edge-left:w-c-block-drop-line edge-right:inset-y-0 edge-right:end-(--drop-off) edge-right:w-c-block-drop-line edge-top:inset-x-0 edge-top:top-(--drop-off) edge-top:h-c-block-drop-line"
      data-edge={over}
      style:--drop-off="calc(var(--space-group) / -2 - var(--c-block-drop-line)
      / 2)"
    ></span>
  {/if}
</section>

<style>
  /* residual: foreign-dom */
  [data-slot="glyph"] :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  /* residual: unmapped */
  [data-slot="block-head"] {
    -webkit-touch-callout: none;
  }
  /* residual: pseudo */
  [data-slot="drop"]::before {
    position: absolute;
    inline-size: var(--c-block-drop-dot);
    block-size: var(--c-block-drop-dot);
    border-radius: 50%;
    background: var(--brand-solid);
    content: "";
  }
  /* residual: pseudo */
  [data-slot="drop"]:is([data-edge="top"], [data-edge="bottom"])::before {
    inset-block-start: calc(
      (var(--c-block-drop-line) - var(--c-block-drop-dot)) / 2
    );
    inset-inline-start: calc(var(--c-block-drop-dot) / -2);
  }
  /* residual: pseudo */
  [data-slot="drop"]:is([data-edge="left"], [data-edge="right"])::before {
    inset-block-start: calc(var(--c-block-drop-dot) / -2);
    inset-inline-start: calc(
      (var(--c-block-drop-line) - var(--c-block-drop-dot)) / 2
    );
  }
</style>
