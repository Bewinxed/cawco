<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    bar = false,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> & {
    /**
     * Its first row is the top bar's own row, beside the desk's sidebar
     * toggle (Shell `rail-toggle`): it starts at the rail's top, no pad
     * above it.
     */
    bar?: boolean;
  } = $props();
</script>

<div
  class={cn("flex flex-col gap-2 p-2", bar && "pt-0", className)}
  data-sidebar="header"
  data-slot="sidebar-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
