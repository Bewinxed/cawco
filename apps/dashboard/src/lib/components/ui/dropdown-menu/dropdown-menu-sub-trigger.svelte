<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import { IconChevronRight } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";

  let {
    ref = $bindable(null),
    class: className,
    inset,
    children,
    ...restProps
  }: DropdownMenuPrimitive.SubTriggerProps & {
    inset?: boolean;
  } = $props();
</script>

<DropdownMenuPrimitive.SubTrigger
  class={cn("kit-item flex cursor-default select-none items-center gap-2 px-2.5 text-label outline-hidden data-open:bg-[var(--surface-hover)] data-[inset]:pl-8 data-inset:pl-9.5 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0", className)}
  data-inset={inset}
  data-slot="dropdown-menu-sub-trigger"
  bind:ref
  {...restProps}
>
  {@render children?.()}
  <IconChevronRight class="ml-auto" />
</DropdownMenuPrimitive.SubTrigger>
