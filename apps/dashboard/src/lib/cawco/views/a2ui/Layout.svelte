<script lang="ts">
  /** Row and Column: their children side by side, or one under another. */
  import { type A2uiComponentProps, Slot } from "svelte-a2ui";

  let { slots, a2ui, justify, align }: A2uiComponentProps = $props();

  const row = $derived(a2ui.component === "Row");
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
  class={row ? "layout row" : "layout"}
  style:align-items={ALIGN[String(align ?? "stretch")]}
  style:justify-content={JUSTIFY[String(justify ?? "start")]}
>
  <Slot content={slots.children} />
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
