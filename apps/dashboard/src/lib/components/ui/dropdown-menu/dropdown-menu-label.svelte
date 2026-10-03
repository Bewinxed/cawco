<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
    inset?: boolean;
  } = $props();
</script>

<div
  class={cn(
    "px-3 py-2.5 text-meta text-muted-foreground data-[inset]:pl-8 data-inset:pl-9.5",
    className
  )}
  data-inset={inset}
  data-slot="dropdown-menu-label"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
