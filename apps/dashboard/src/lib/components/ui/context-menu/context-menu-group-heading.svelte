<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    ...restProps
  }: ContextMenuPrimitive.GroupHeadingProps & {
    inset?: boolean;
  } = $props();
</script>

<ContextMenuPrimitive.GroupHeading
  class={cn(
    "px-2 py-1.5 font-medium text-foreground text-label data-inset:ps-8",
    className
  )}
  data-inset={inset}
  data-slot="context-menu-group-heading"
  bind:ref
  {...restProps}
/>
