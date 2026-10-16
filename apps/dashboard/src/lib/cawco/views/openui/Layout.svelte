<script lang="ts">
  /** Row and Column: their children side by side, or one under another. */
  import type { Snippet } from "svelte";

  let {
    axis,
    children,
    justify,
    align,
  }: {
    axis: "row" | "column";
    children: Snippet;
    justify?: string;
    align?: string;
  } = $props();

  const JUSTIFY: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    spaceBetween: "space-between",
  };
  const ALIGN: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    stretch: "stretch",
  };
</script>

<div
  data-layout-row={axis === "row" || undefined}
  class={axis === "row" ? "layout row" : "layout"}
  style:align-items={ALIGN[align ?? "stretch"]}
  style:justify-content={JUSTIFY[justify ?? "start"]}
>
  {@render children()}
</div>

<style>
  .layout {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
  }
  .layout.row {
    flex-direction: row;
    flex-wrap: wrap;
  }
</style>
