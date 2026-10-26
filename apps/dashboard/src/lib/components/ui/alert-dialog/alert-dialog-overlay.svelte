<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { scrimVariants } from "#lib/components/ui/dialog/dialog-overlay.svelte";
  import Scrim from "#lib/components/ui/dialog/scrim.svelte";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<AlertDialogPrimitive.OverlayProps> = $props();
</script>

<!-- A scrim fading out lets presses through to the page (floating-presence);
     open or closing, it is said on the root for the screen's edges (page-marks). -->
<AlertDialogPrimitive.Overlay
  class={cn(scrimVariants(), "fixed inset-0 z-(--layer-float)", className)}
  data-slot="alert-dialog-overlay"
  bind:ref
  {...restProps}
>
  {#snippet child({ props, open })}
    <Scrim {open} {props} />
  {/snippet}
</AlertDialogPrimitive.Overlay>
