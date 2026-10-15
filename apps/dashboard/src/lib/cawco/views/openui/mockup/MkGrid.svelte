<svelte:options css="injected" />

<script lang="ts">
  /** Grid: its children in equal columns, row after row. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    children: unknown[];
    columns: number;
    gap?: string;
  }> = $props();
  const columns = $derived(
    Math.min(6, Math.max(1, Math.round(Number(props.columns) || 1)))
  );
</script>

<div
  class="grid"
  data-gap={props.gap ?? "medium"}
  data-mk="Grid"
  style:--columns={columns}
>
  {@render renderNode(props.children)}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
    gap: calc(var(--mk-space) * 4);
    min-inline-size: 0;
  }
  .grid[data-gap="none"] {
    gap: 0;
  }
  .grid[data-gap="small"] {
    gap: calc(var(--mk-space) * 2);
  }
  .grid[data-gap="large"] {
    gap: calc(var(--mk-space) * 8);
  }
</style>
