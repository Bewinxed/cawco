<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: the rail's lists, its rows two pixels apart. */
  export const sidebarMenuVariants = tv({
    variants: { gap: { tight: "gap-0.5" } },
  });

  export type SidebarMenuLooks = VariantProps<typeof sidebarMenuVariants>;
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    gap,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLUListElement>, HTMLUListElement> &
    SidebarMenuLooks = $props();
</script>

<ul
  class={cn(
    "flex w-full min-w-0 flex-col gap-space-1",
    sidebarMenuVariants({ gap }),
    className
  )}
  data-sidebar="menu"
  data-slot="sidebar-menu"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</ul>
