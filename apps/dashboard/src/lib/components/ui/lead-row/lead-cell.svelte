<script lang="ts">
  /**
   * One trailing cell of a `LeadRow`: a fixed width, so the field it holds
   * stands in one column down the list whatever the row's words. `figure`:
   * as wide as a short count in tabular figures ("12/12"), its figure at
   * the cell's end; `chevron`: a small glyph's, for a fold's chevron; `mark`:
   * a session's mark's tile. A row with nothing for a column keeps the
   * cell, empty, so the columns after it stay where they are.
   */
  import type { Snippet } from "svelte";

  let {
    size,
    children,
  }: {
    size: "figure" | "chevron" | "mark";
    children?: Snippet;
  } = $props();
</script>

<span
  data-slot="lead-cell"
  class={[
    "flex flex-none items-center",
    size === "figure" && "num w-c-lead-figure justify-end",
    size === "chevron" && "w-icon-sm justify-center",
    size === "mark" && "w-c-row-mark justify-center",
  ]}
  data-box>{@render children?.()}</span
>
