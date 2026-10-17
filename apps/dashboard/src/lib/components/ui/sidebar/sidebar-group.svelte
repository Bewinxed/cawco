<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: the rail's sections, whose own label separates
      them, pad a step on each side and a hairline above and below. */
  export const sidebarGroupVariants = tv({
    variants: { pad: { rail: "px-2 py-space-1" } },
  });

  export type SidebarGroupLooks = VariantProps<typeof sidebarGroupVariants>;
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
  }: WithElementRef<HTMLAttributes<HTMLElement>> & SidebarGroupLooks = $props();
</script>

<div
  class={cn(
    "relative flex w-full min-w-0 flex-col p-2",
    sidebarGroupVariants({ pad }),
    className
  )}
  data-sidebar="group"
  data-slot="sidebar-group"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
