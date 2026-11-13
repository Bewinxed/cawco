<script lang="ts">
  /** Row and Column: their children side by side, or one under another. */
  import type { Snippet } from "svelte";
  import { ALIGN, JUSTIFY } from "./layout-classes";

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
