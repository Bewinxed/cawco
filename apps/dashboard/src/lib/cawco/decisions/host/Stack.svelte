<!--
  Row and Column (the view library's, by name and shape), drawn by the host
  page on its own scoped styles: children side by side and wrapping, or one
  under another, with the house gap.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    axis,
    children,
    justify,
    align,
  }: {
    axis: "row" | "column";
    children: Snippet;
    justify?: unknown;
    align?: unknown;
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
  class="stack"
  data-axis={axis}
  style:align-items={ALIGN[String(align ?? "stretch")] ?? "stretch"}
  style:justify-content={JUSTIFY[String(justify ?? "start")] ?? "flex-start"}
>
  {@render children()}
</div>

<style>
  /* tailwind: this folder is bundled by Bun with no Tailwind build (core decision-host.ts), and Tailwind only generates CSS where it scans the source, so a utility here would draw nothing — https://tailwindcss.com/docs/detecting-classes-in-source-files */
  .stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
    &[data-axis="row"] {
      flex-direction: row;
      flex-wrap: wrap;
    }
    & > :global(*) {
      min-inline-size: 0;
    }
  }
</style>
