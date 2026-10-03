<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<div
  class={cn("flex flex-col gap-2 p-2", className)}
  data-sidebar="footer"
  data-slot="sidebar-footer"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
