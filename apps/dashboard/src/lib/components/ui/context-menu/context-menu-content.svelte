<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  import type { WithoutChildrenOrChild } from "$lib/utils.js";
  import { cn } from "$lib/utils.js";
  import ContextMenuPortal from "./context-menu-portal.svelte";

  let {
    ref = $bindable(null),
    portalProps,
    class: className,
    ...restProps
  }: ContextMenuPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<
      ComponentProps<typeof ContextMenuPortal>
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

<ContextMenuPortal {...portalProps}>
  <ContextMenuPrimitive.Content
    class={cn(
			"kit-pop relative z-50 min-w-48 origin-(--bits-context-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none",
			className
		)}
    data-slot="context-menu-content"
    bind:ref
    {...restProps}
  />
</ContextMenuPortal>
