<script lang="ts">
  import { ToggleGroup as ToggleGroupPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    value = $bindable(),
    class: className,
    ...restProps
  }: ToggleGroupPrimitive.ItemProps = $props();
</script>

<ToggleGroupPrimitive.Item
  class={cn("kit-segment press-tint focus-inset touch-hit shrink-0 disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}
  data-slot="toggle-group-item"
  {value}
  bind:ref
  {...restProps}
/>
