<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<
    HTMLAttributes<HTMLUListElement>,
    HTMLUListElement
  > = $props();
</script>

<ul
  class={cn("flex w-full min-w-0 flex-col gap-1", className)}
  data-sidebar="menu"
  data-slot="sidebar-menu"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</ul>
