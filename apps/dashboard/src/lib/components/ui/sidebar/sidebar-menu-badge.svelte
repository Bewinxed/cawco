<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a live count in the live pair, which turns to
      the attention pair while something is blocked (`data-blocked`), its
      ink held over the row's hover and selection. */
  export const sidebarMenuBadgeVariants = tv({
    variants: {
      tone: {
        live: "bg-status-live-bg text-status-live-ink! data-blocked:bg-status-attn-bg data-blocked:text-status-attn-ink!",
      },
    },
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
    "pointer-events-none absolute right-space-1 flex flex h-icon-lg min-w-5",
    "select-none items-center justify-center",
    "rounded-[var(--radius-xs)] px-space-1",
    "num text-ink-strong text-meta",
    "peer-hover/menu-button:text-ink-strong",
    "group-data-[collapsible=icon]:hidden",
    "peer-data-[size=default]/menu-button:top-1.5",
    "peer-data-[size=lg]/menu-button:top-2.5",
    "peer-data-[size=sm]/menu-button:top-space-1",
    "peer-data-active/menu-button:text-selected-ink",
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
