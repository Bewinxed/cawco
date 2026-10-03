<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLLIElement>, HTMLLIElement> = $props();
</script>

<li
  class={cn("group/menu-item relative", className)}
  data-sidebar="menu-item"
  data-slot="sidebar-menu-item"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</li>
