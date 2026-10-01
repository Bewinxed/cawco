<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    children,
    child,
    class: className,
    size = "md",
    isActive = false,
    ...restProps
  }: WithElementRef<HTMLAnchorAttributes> & {
    child?: Snippet<[{ props: Record<string, unknown> }]>;
    size?: "sm" | "md";
    isActive?: boolean;
  } = $props();

  const mergedProps = $derived({
    class: cn(
      "focus-inset flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-[var(--radius-sm)] px-2 text-sidebar-foreground hover:text-foreground active:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[size=md]:text-label data-[size=sm]:text-meta data-active:text-selected-ink group-data-[collapsible=icon]:hidden [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-foreground",
      className
    ),
    "data-slot": "sidebar-menu-sub-button",
    "data-sidebar": "menu-sub-button",
    /* One selector for every row the rail's hover ghost lands on. */
    "data-rail-row": "",
    "data-size": size,
    "data-active": isActive,
    ...restProps,
  });
</script>

{#if child}
  {@render child({ props: mergedProps })}
{:else}
  <!-- biome-ignore lint/a11y/useValidAnchor: href comes from restProps, supplied by the consumer of this generic wrapper -->
  <a bind:this={ref} {...mergedProps}> {@render children?.()} </a>
{/if}
