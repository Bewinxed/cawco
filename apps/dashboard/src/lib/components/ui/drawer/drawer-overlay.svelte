<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { scrimMark } from "#lib/cawco/page-marks.js";
  import { scrimVariants } from "#lib/components/ui/dialog/dialog-overlay.svelte";
  import { scrimStack } from "#lib/components/ui/dialog/scrim-stack.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DrawerPrimitive.OverlayProps = $props();

  // Open or closing, it is said on the root for the screen's edges
  // (page-marks), and it is the one scrim only while none stands under it.
  $effect(() => {
    if (ref) {
      const mark = scrimMark(ref);
      const stacked = scrimStack(ref);
      return () => {
        mark();
        stacked();
      };
    }
  });
</script>

<DrawerPrimitive.Overlay
  class={cn(scrimVariants(), "fixed inset-0 z-(--layer-float)", className)}
  data-slot="drawer-overlay"
  bind:ref
  {...restProps}
/>
