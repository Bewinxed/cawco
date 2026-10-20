<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { cardOf, getTableContext } from "./table.svelte";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> = $props();

  const table = getTableContext();
</script>

<!-- Where the rows are cards, the body is their block. -->
<tbody
  class={cn(
    "[&_tr:last-child]:border-0",
    cardOf(table.stacks)?.body,
    className
  )}
  data-slot="table-body"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</tbody>
