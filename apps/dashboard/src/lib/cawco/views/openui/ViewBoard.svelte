<script lang="ts">
  /** A board: its StageColumns side by side, as the project's board lays them. */
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ children: unknown[]; title?: string }> = $props();
</script>

<div class="flex min-w-0 flex-col gap-space-2">
  {#if props.title}
    <h3 data-slot="title" class="type-title text-ink-strong">
      {String(props.title)}
    </h3>
  {/if}
  <div
    class="grid auto-cols-(--board-cols) grid-flow-col gap-space-3 overflow-x-auto overscroll-x-contain pb-space-3 max-phone:auto-cols-(--board-cols-narrow) max-phone:snap-x max-phone:snap-mandatory"
    style:--board-cols="minmax(var(--c-board-col-min), var(--c-board-col-max))"
    style:--board-cols-narrow="calc(100% - var(--space-8))"
  >
    {@render renderNode(props.children)}
  </div>
</div>
