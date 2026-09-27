<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
  import DropdownMenuPortal from "./dropdown-menu-portal.svelte";

  let {
    ref = $bindable(null),
    sideOffset = 4,
    align = "start",
    portalProps,
    class: className,
    ...restProps
  }: DropdownMenuPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<
      ComponentProps<typeof DropdownMenuPortal>
    >;
  } = $props();

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({ rows: ".kit-item", hovered: "[data-highlighted]" })(
        ref
      );
    }
  });
</script>

<DropdownMenuPortal {...portalProps}>
  <DropdownMenuPrimitive.Content
    {align}
    class={cn(
			"kit-pop relative z-50 w-(--bits-dropdown-menu-anchor-width) min-w-48 origin-(--bits-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none",
			className
		)}
    data-slot="dropdown-menu-content"
    {sideOffset}
    bind:ref
    {...restProps}
  />
</DropdownMenuPortal>
