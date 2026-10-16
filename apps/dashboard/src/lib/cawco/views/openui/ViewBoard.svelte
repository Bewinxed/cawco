<script lang="ts">
  /** A board: its StageColumns side by side, as the project's board lays them. */
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ children: unknown[]; title?: string }> = $props();
</script>

<div class="view-board">
  {#if props.title}
    <h3 data-slot="title" class="title">{String(props.title)}</h3>
  {/if}
  <div class="columns">{@render renderNode(props.children)}</div>
</div>

<style>
  .view-board {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .title {
    font: var(--type-title);
    color: var(--ink-strong);
  }
  .columns {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, 22rem);
    gap: var(--space-3);
    overflow-x: auto;
    padding-block-end: var(--space-3);
    overscroll-behavior-x: contain;
  }
  @media (max-width: 639px) {
    .columns {
      grid-auto-columns: calc(100% - var(--space-8));
      scroll-snap-type: x mandatory;
    }
  }
</style>
