<script lang="ts">
  /**
   * Canonical subgrid row (`ui/row`): spans every column of its enclosing
   * `RowList` (`row-cells`) so lead marks, body text, trailing controls, and
   * optional `below` content stay on the same vertical rails across every row
   * without per-row `calc()` offsets.
   */
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";

  let {
    as = "li",
    lead,
    trail,
    below,
    class: className,
    children,
    ...rest
  }: HTMLAttributes<HTMLElement> & {
    /** Semantic element for the row (`li` in lists, `div` in menus/listboxes). */
    as?: "li" | "div";
    /** Optional leading mark cell (column 1). */
    lead?: Snippet;
    /** Optional trailing controls/status cell (column 3). */
    trail?: Snippet;
    /** Optional secondary content aligned directly under the body track. */
    below?: Snippet;
    children: Snippet;
  } = $props();
</script>

<svelte:element
  this={as}
  data-slot="row-item"
  class={cn("row-cells min-h-row gap-y-space-1 py-space-2", className)}
  {...rest}
>
  {#if lead}
    <span
      data-slot="row-lead"
      class="col-start-1 grid place-items-center"
      data-box
    >
      {@render lead()}
    </span>
  {/if}
  <span data-slot="row-body" class="col-start-2 min-w-0">
    {@render children()}
  </span>
  {#if trail}
    <span
      data-slot="row-trail"
      class="col-start-3 flex items-center justify-self-end gap-space-2"
      data-box
    >
      {@render trail()}
    </span>
  {/if}
  {#if below}
    <div
      data-slot="row-below"
      class="col-start-2 col-span-2 min-w-0 @max-xs/rows:col-start-1 @max-xs/rows:col-span-3"
    >
      {@render below()}
    </div>
  {/if}
</svelte:element>
