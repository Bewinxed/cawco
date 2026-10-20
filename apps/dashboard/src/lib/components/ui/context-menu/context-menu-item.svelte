<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import { menuItemVariants } from "#lib/components/ui/menu-item/index.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    variant = "default",
    ...restProps
  }: ContextMenuPrimitive.ItemProps & {
    inset?: boolean;
    variant?: "default" | "destructive";
  } = $props();
</script>

<ContextMenuPrimitive.Item
  class={cn(
    menuItemVariants(),
    "group/context-menu-item relative flex",
    "cursor-default select-none items-center gap-2.5 text-label",
    "outline-hidden data-disabled:pointer-events-none",
    "data-inset:pl-9.5",
    "data-[variant=destructive]:text-error-9",
    "data-disabled:opacity-50",
    "data-[variant=destructive]:focus:text-error-9",
    "[&_svg:not([class*='size-'])]:size-icon-md",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "px-2.5 data-[variant=destructive]:*:[svg]:text-error-9",
    className
  )}
  data-inset={inset}
  data-menu-item
  data-slot="context-menu-item"
  data-variant={variant}
  bind:ref
  {...restProps}
/>
