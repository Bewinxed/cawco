<script lang="ts">
  /* eslint-disable shadcn/no-inline-styles -- style:pointer-events overrides bits-ui's run-time inline pointer-events: auto, which no class can (floating-presence.ts pressable) */
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: WithoutChildrenOrChild<DialogPrimitive.OverlayProps> = $props();
</script>

<!-- A scrim fading out lets presses through to the page (floating-presence). -->
<DialogPrimitive.Overlay
  class={cn("kit-scrim fixed inset-0 isolate z-50", className)}
  data-slot="dialog-overlay"
  bind:ref
  {...restProps}
>
  {#snippet child({ props, open })}
    <div {...props} style:pointer-events={pressable(open)}></div>
  {/snippet}
</DialogPrimitive.Overlay>
