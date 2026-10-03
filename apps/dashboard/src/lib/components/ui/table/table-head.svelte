<script lang="ts">
  import type { HTMLThAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLThAttributes> = $props();
</script>

<th
  class={cn(
    "h-12 whitespace-nowrap px-3 text-left align-middle text-foreground text-label [&:has([role=checkbox])]:pr-0",
    className
  )}
  data-slot="table-head"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</th>
