<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks. `row` (the default): the row's own ink, the
      selected ink while its row is chosen. `live`: a live count in the live
      pair, which turns to the attention pair while something is blocked
      (`data-blocked`); its ink is its own, whatever the row's state. */
  export const sidebarMenuBadgeVariants = tv({
    variants: {
      tone: {
        row: "text-ink-strong peer-data-active/menu-button:text-selected-ink",
        live: "bg-status-live-bg text-status-live-ink data-blocked:bg-status-attn-bg data-blocked:text-status-attn-ink",
      },
    },
    defaultVariants: { tone: "row" },
  });

  export type SidebarMenuBadgeLooks = VariantProps<
    typeof sidebarMenuBadgeVariants
  >;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    tone,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> &
    SidebarMenuBadgeLooks = $props();
</script>

<div
  data-num
  class={cn(
    "pointer-events-none absolute right-space-1 flex h-c-badge-h min-w-c-badge-h",
    "select-none items-center justify-center",
    "rounded-xs px-space-1",
    "num text-meta",
    "group-data-[collapsible=icon]:hidden",
    "peer-data-[size=default]/menu-button:top-1.5",
    "peer-data-[size=lg]/menu-button:top-2.5",
    "peer-data-[size=sm]/menu-button:top-space-1",
    sidebarMenuBadgeVariants({ tone }),
    className
  )}
  data-sidebar="menu-badge"
  data-slot="sidebar-menu-badge"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
