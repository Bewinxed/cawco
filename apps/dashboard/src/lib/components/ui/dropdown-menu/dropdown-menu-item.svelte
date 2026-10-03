<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    variant = "default",
    ...restProps
  }: DropdownMenuPrimitive.ItemProps & {
    inset?: boolean;
    variant?: "default" | "destructive";
  } = $props();
</script>

<DropdownMenuPrimitive.Item
  class={cn(
    "kit-item group/dropdown-menu-item relative flex",
    "cursor-default select-none items-center gap-2.5 text-label",
    "outline-hidden data-disabled:pointer-events-none",
    "data-[inset]:pl-8 data-inset:pl-9.5",
    "data-[variant=destructive]:text-destructive",
    "data-disabled:opacity-50",
    "data-[variant=destructive]:focus:text-destructive",
    "[&_svg:not([class*='size-'])]:size-4",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
    "px-2.5 data-[variant=destructive]:*:[svg]:text-destructive",
    className
  )}
  data-inset={inset}
  data-slot="dropdown-menu-item"
  data-variant={variant}
  bind:ref
  {...restProps}
/>
