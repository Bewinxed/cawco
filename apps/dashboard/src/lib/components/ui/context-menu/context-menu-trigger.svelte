<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    ...restProps
  }: ContextMenuPrimitive.TriggerProps = $props();
</script>

<ContextMenuPrimitive.Trigger
  class={cn("cn-context-menu-trigger select-none", className)}
  data-slot="context-menu-trigger"
  bind:ref
  {...restProps}
/>
