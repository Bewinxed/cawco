<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";
  import { segmentedVariants } from "./thumb.js";

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
    "press-tint focus-inset touch-hit flex-1 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-icon-md [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
  )}
  data-slot="tabs-trigger"
  bind:ref
  {...restProps}
/>
