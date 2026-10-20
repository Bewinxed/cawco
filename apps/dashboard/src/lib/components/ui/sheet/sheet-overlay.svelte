<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import { scrimMark } from "#lib/cawco/page-marks.js";
  import { scrimVariants } from "#lib/components/ui/dialog/dialog-overlay.svelte";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<SheetPrimitive.OverlayProps> = $props();
</script>

<!-- A scrim fading out lets presses through to the page (floating-presence);
     open or closing, it is said on the root for the screen's edges (page-marks). -->
<SheetPrimitive.Overlay
  class={cn(scrimVariants(), "fixed inset-0 z-(--layer-float)", className)}
  data-slot="sheet-overlay"
  bind:ref
  {...restProps}
>
  {#snippet child({ props, open })}
    <div
      {...props}
      style:pointer-events={pressable(open)}
      {@attach scrimMark}
    ></div>
  {/snippet}
</SheetPrimitive.Overlay>
