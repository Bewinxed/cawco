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
  class={cn(
    "pointer-events-none absolute right-space-1 flex flex h-icon-lg min-w-5",
    "select-none items-center justify-center",
    "rounded-[var(--radius-xs)] px-space-1",
    "num text-ink-strong text-meta",
    "peer-hover/menu-button:text-ink-strong",
    "group-data-[collapsible=icon]:hidden",
    "peer-data-[size=default]/menu-button:top-1.5",
    "peer-data-[size=lg]/menu-button:top-2.5",
    "peer-data-[size=sm]/menu-button:top-space-1",
    "peer-active-true/menu-button:text-selected-ink",
    className
  )}
  data-sidebar="menu-badge"
  data-slot="sidebar-menu-badge"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
