<script lang="ts">
  /**
   * One block of the Workflows view's BlockPage (Workflows, Runs, Checks),
   * the page's own Block frame with its head, glyph, count, action and ⋯,
   * held still: no drag is in the air on these canvases.
   */
  import type { Component, Snippet } from "svelte";
  import Block from "#lib/cawco/blocks/Block.svelte";
  import { BlockDragState } from "#lib/cawco/blocks/block-dnd.svelte.js";

  let {
    id,
    title,
    glyph,
    count = 0,
    needs = 0,
    action,
    children,
    card = true,
    span = 2,
  }: {
    id: string;
    title: string;
    glyph: Component;
    /** Drawn only above 0 (The Earned Count Rule). */
    count?: number;
    /** Things in it waiting on the owner. */
    needs?: number;
    action?: Snippet;
    children: Snippet;
    card?: boolean;
    /** Of the page's two columns. */
    span?: 1 | 2;
  } = $props();

  const drag = new BlockDragState();
</script>

{#snippet meta()}
  {#if count > 0}
    <span data-num data-slot="count" class="num type-meta text-ink-subtle"
      >{count}</span
    >
  {/if}
{/snippet}

<Block
  {action}
  body="natural"
  {card}
  columns={2}
  {drag}
  first={false}
  {glyph}
  hideable
  {id}
  last={false}
  meta={count > 0 || needs > 0 ? meta : undefined}
  onhide={() => undefined}
  onmove={() => undefined}
  ontab={() => undefined}
  onwidth={() => undefined}
  page="workflows"
  resizing={false}
  {span}
  {title}
  view={null}
  wideOnly={false}
  width={span === 2 ? "wide" : "narrow"}
>
  {@render children()}
</Block>
