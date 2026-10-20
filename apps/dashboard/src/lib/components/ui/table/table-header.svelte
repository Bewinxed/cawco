<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";
  import { cardOf, getTableContext } from "./table.svelte";

  let {
    ref = $bindable(null),
    class: className,
    section = false,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLTableSectionElement>> & {
    /**
     * It heads its own body, a section of the ledger: where the rows are
     * cards it stays as the section's title, its first head alone on the
     * band's row. Otherwise column heads name nothing in a card.
     */
    section?: boolean;
  } = $props();

  const table = getTableContext();
  const card = $derived(cardOf(table.stacks));
</script>

<thead
  class={cn(
    "[&_tr]:border-b",
    section ? card?.section : card?.header,
    className
  )}
  data-slot="table-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</thead>
