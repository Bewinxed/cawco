<script lang="ts">
  /**
   * A sheet's one header (app.css .kit-sheet-head): what it is, in the
   * title role, and Close at the trailing edge.
   */
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
</script>

<div
  class={cn("kit-sheet-head", className)}
  data-slot="drawer-header"
  bind:this={ref}
  {...restProps}
>
  {@render children?.()}
  <DrawerPrimitive.Close
    aria-label="Close"
    class="kit-sheet-close touch-hit"
    title="Close"
  >
    <IconClose aria-hidden="true" />
  </DrawerPrimitive.Close>
</div>
