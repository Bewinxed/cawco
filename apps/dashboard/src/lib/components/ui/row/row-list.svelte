<script lang="ts">
  /**
   * Canonical list container for aligned rows (`ui/row`): declares the shared
   * column tracks once (`rows-grid`) and scopes a `@container/rows` query so
   * every `Row` inside inherits the exact same lead, body, and trailing rails
   * via `grid-template-columns: subgrid` (`row-cells`).
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    as = "ul",
    cols,
    class: className,
    children,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    /** Semantic container element. */
    as?: "ul" | "ol" | "div";
    /** Override `--row-cols` track template when a list needs custom columns. */
    cols?: string;
    children: Snippet;
  } = $props();
</script>

<svelte:element
  this={as}
  data-slot="row-list"
  class={cn(
    "@container/rows rows-grid gap-x-space-3 gap-y-space-1 m-0 p-0 list-none",
    className
  )}
  style:--row-cols={cols}
  {...rest}
>
  {@render children()}
</svelte:element>
