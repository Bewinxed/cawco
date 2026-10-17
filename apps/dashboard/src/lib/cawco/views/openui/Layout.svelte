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
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    spaceBetween: "justify-between",
  };
  const ALIGN: Record<string, string> = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
  };
</script>

<div
  data-layout-row={axis === "row" || undefined}
  class={[
    "flex min-w-0 gap-space-3",
    axis === "row" ? "flex-row flex-wrap" : "flex-col",
    ALIGN[align ?? "stretch"],
    JUSTIFY[justify ?? "start"],
  ]}
>
  {@render children()}
</div>
