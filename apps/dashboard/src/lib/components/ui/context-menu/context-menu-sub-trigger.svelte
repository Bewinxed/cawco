<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { IconChevronRight } from "#lib/icons.js";
  import { cn, type WithoutChild } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    children,
    ...restProps
  }: WithoutChild<ContextMenuPrimitive.SubTriggerProps> & {
    inset?: boolean;
  } = $props();
</script>

<ContextMenuPrimitive.SubTrigger
  class={cn(
    "kit-item flex cursor-default select-none items-center px-2.5 text-label outline-hidden data-open:bg-[var(--surface-hover)] data-inset:ps-8 data-inset:pl-9.5 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    className
  )}
  data-inset={inset}
  data-slot="context-menu-sub-trigger"
  bind:ref
  {...restProps}
>
  {@render children?.()}
  <IconChevronRight class="ml-auto" />
</ContextMenuPrimitive.SubTrigger>
