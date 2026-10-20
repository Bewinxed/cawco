<script lang="ts">
  import { Collapsible as CollapsiblePrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: CollapsiblePrimitive.TriggerProps = $props();
</script>

<CollapsiblePrimitive.Trigger
  class={cn(className)}
  data-slot="collapsible-trigger"
  bind:ref
  {...restProps}
/>
