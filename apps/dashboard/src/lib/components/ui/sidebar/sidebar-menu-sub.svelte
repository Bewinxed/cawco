<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLUListElement>> = $props();
</script>

<ul
  class={cn("flex min-w-0 flex-col gap-1 py-0.5 group-data-[collapsible=icon]:hidden", className)}
  data-sidebar="menu-sub"
  data-slot="sidebar-menu-sub"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</ul>
