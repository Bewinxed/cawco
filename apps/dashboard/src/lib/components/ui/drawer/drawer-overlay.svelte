<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { scrimVariants } from "#lib/components/ui/dialog/dialog-overlay.svelte";
  import Scrim from "#lib/components/ui/dialog/scrim.svelte";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<DrawerPrimitive.OverlayProps> = $props();
</script>

<!-- A scrim fading out lets presses through to the page (floating-presence);
     open or closing, it is said on the root for the screen's edges
     (page-marks), and it is the one scrim only while none stands under it.
     Drawn through `child`, which vaul-svelte is patched to hand on. -->
<DrawerPrimitive.Overlay
  class={cn(scrimVariants(), "fixed inset-0 z-(--layer-float)", className)}
  data-slot="drawer-overlay"
  bind:ref
  {...restProps}
>
  {#snippet child({ props, open })}
    <Scrim {open} {props} />
  {/snippet}
</DrawerPrimitive.Overlay>
