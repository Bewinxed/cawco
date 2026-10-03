<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DialogPrimitive.OverlayProps = $props();
</script>

<DialogPrimitive.Overlay
  class={cn("kit-scrim fixed inset-0 isolate z-50", className)}
  data-slot="dialog-overlay"
  bind:ref
  {...restProps}
/>
