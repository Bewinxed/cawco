<script lang="ts" module>
  import { tv } from "#lib/utils.js";

  /**
   * A sheet's one header (DESIGN.md, Drawer: "one header: the title in the
   * title role and Close at the trailing edge (a 28px ghost with a 16px
   * glyph, 44px under a finger), with a seam under it that comes in over
   * the first 11px of the content's scroll"); the New session sheet's head
   * wears it too. Its hairline is drawn transparent and comes in on the
   * sheet's scroll (`sheet-seam`, app.css), inside a sheet only. A mouse
   * never drags a sheet: Close and Escape put it away.
   */
  export const sheetHeadVariants = tv({
    slots: {
      head: "flex flex-none items-center justify-between gap-space-2 border-b border-b-transparent pb-space-3 in-data-[slot=drawer-content]:sheet-seam",
      close:
        "touch-hit inline-flex size-7 flex-none items-center justify-center rounded-sm border border-transparent bg-transparent text-ink-muted transition-control [--hit-edge:1px] hover:bg-surface-hover hover:text-ink-strong [&_svg]:size-icon-md",
    },
  });
</script>

<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { IconClose } from "#lib/icons.js";
  import { cn, type WithElementRef } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    children,
    ...restProps
  }: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();

  const head = sheetHeadVariants();
</script>

<div
  class={cn(head.head(), className)}
  data-slot="drawer-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
  <DrawerPrimitive.Close aria-label="Close" class={head.close()} title="Close">
    <IconClose aria-hidden="true" />
  </DrawerPrimitive.Close>
</div>
