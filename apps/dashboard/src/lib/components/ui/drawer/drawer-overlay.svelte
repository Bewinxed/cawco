<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: DrawerPrimitive.OverlayProps = $props();
</script>

<DrawerPrimitive.Overlay
  class={cn("kit-scrim fixed inset-0 z-50", className)}
  data-slot="drawer-overlay"
  bind:ref
  {...restProps}
/>
