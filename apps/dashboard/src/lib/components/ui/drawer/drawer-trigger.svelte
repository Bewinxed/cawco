<script lang="ts">
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import {
    type PopoverTriggerLooks,
    popoverTriggerVariants,
  } from "#lib/components/ui/popover/popover-trigger.svelte";
  import { cn } from "#lib/utils.js";

  /** A control that opens a popover with a fine pointer and this drawer
      under a finger (the usage strip) is one look: the popover trigger's
      role, never a second recipe of its own. */
  let {
    ref = $bindable(null),
    class: className,
    look,
    ...restProps
  }: DrawerPrimitive.TriggerProps & PopoverTriggerLooks = $props();
</script>

<DrawerPrimitive.Trigger
  class={cn(popoverTriggerVariants({ look }), className)}
  data-slot="drawer-trigger"
  bind:ref
  {...restProps}
/>
