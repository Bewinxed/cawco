<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: the rail's content, its sections set by their own
      pads with no gap between them, a hairline at each end. */
  export const sidebarContentVariants = tv({
    variants: { pad: { rail: "gap-0 py-space-1" } },
  });

  export type SidebarContentLooks = VariantProps<typeof sidebarContentVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    pad,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLElement>> &
    SidebarContentLooks = $props();
</script>

<div
  class={cn(
    "no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
    sidebarContentVariants({ pad }),
    className
  )}
  data-sidebar="content"
  data-slot="sidebar-content"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
