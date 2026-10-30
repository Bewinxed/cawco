<!--
  Row and Column (the view library's, by name and shape): children side by
  side and wrapping, or one under another, 11px apart in both axes, along
  the program's justify and align.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    axis,
    children,
    justify,
    align,
    ratioMin,
  }: {
    axis: "row" | "column";
    children: Snippet;
    justify?: unknown;
    align?: unknown;
    /** A Row's narrowest picture's width over its height (Row.svelte): its pictures' widths start from it. */
    ratioMin?: number;
  } = $props();

  const JUSTIFY = {
    start: "justify-start",
    center: "justify-center",
    end: "justify-end",
    spaceBetween: "justify-between",
  } as const;
  const ALIGN = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
    stretch: "items-stretch",
  } as const;
  const along = $derived(
    JUSTIFY[String(justify ?? "start") as keyof typeof JUSTIFY] ?? JUSTIFY.start
  );
  const across = $derived(
    ALIGN[String(align ?? "stretch") as keyof typeof ALIGN] ?? ALIGN.stretch
  );
</script>

<div
  class={[
    "flex min-w-0 gap-space-3 *:min-w-0",
    axis === "row" ? "flex-row flex-wrap" : "flex-col",
    along,
    across,
  ]}
  data-axis={axis}
  data-slot="stack"
  style:--ratio-min={ratioMin}
>
  {@render children()}
</div>
