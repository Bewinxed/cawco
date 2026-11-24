<script lang="ts">
  /** A tab of the kit's segmented tabs: the kit's segment (ui/segmented). */
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { segmentedVariants } from "#lib/components/ui/segmented/index.js";
  import { cn } from "#lib/utils.js";

  const { segment } = segmentedVariants();

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
  class={cn(
    segment(),
    "focus-fill hitbox pointer-coarse:hitbox:touch-area shrink-0 group-data-fill/segmented:flex-1 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
  )}
  data-slot="tabs-trigger"
  bind:ref
  {...restProps}
/>
