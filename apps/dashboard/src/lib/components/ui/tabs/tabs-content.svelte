<script lang="ts">
  import { Tabs as TabsPrimitive } from "bits-ui";
  import { cn } from "$lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: TabsPrimitive.ContentProps = $props();
</script>

<TabsPrimitive.Content
  class={cn("focus-inset flex-1 rounded-lg text-body", className)}
  data-slot="tabs-content"
  bind:ref
  {...restProps}
/>
