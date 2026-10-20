<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { scrimMark } from "#lib/cawco/page-marks.js";
  import { scrimVariants } from "#lib/components/ui/dialog/dialog-overlay.svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DrawerPrimitive.OverlayProps = $props();

  // Open or closing, it is said on the root for the screen's edges (page-marks).
  $effect(() => {
    if (ref) {
      return scrimMark(ref);
    }
  });
</script>

<DrawerPrimitive.Overlay
  class={cn(scrimVariants(), "fixed inset-0 z-50", className)}
  data-slot="drawer-overlay"
  bind:ref
  {...restProps}
/>
