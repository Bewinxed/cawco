<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a footer in a body that already pads its sides
      and foot. */
  export const drawerFooterVariants = tv({
    variants: { pad: { flush: "px-0 pb-0" } },
  });

  export type DrawerFooterLooks = VariantProps<typeof drawerFooterVariants>;
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
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> &
    DrawerFooterLooks = $props();
</script>

<div
  class={cn(
    "mt-auto flex flex-col gap-2 p-4",
    drawerFooterVariants({ pad }),
    className
  )}
  data-slot="drawer-footer"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
</div>
