<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<AlertDialogPrimitive.OverlayProps> = $props();
</script>

<!-- A scrim fading out lets presses through to the page (floating-presence). -->
<AlertDialogPrimitive.Overlay
  class={cn("kit-scrim fixed inset-0 z-50", className)}
  data-slot="alert-dialog-overlay"
  bind:ref
  {...restProps}
>
  {#snippet child({ props, open })}
    <div {...props} style:pointer-events={pressable(open)}></div>
  {/snippet}
</AlertDialogPrimitive.Overlay>
