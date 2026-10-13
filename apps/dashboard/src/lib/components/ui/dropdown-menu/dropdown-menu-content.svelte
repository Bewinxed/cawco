<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import DropdownMenuPortal from "./dropdown-menu-portal.svelte";

  let {
    ref = $bindable(null),
    sideOffset = 4,
    align = "start",
    portalProps,
    class: className,
    forceMount = false,
    child: callerChild,
    children,
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

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence). -->
<DropdownMenuPortal {...portalProps}>
  <DropdownMenuPrimitive.Content
    {align}
    class={cn(
      "kit-pop relative z-50 w-(--bits-dropdown-menu-anchor-width) min-w-48 origin-(--bits-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none",
      className
    )}
    data-slot="dropdown-menu-content"
    forceMount
    {sideOffset}
    bind:ref
    {...restProps}
  >
    {#snippet child(
      snippet
    )}
      {#if forceMount || drawn(snippet.props)}
        {#if callerChild}
          {@render callerChild(snippet)}
        {:else}
          <div {...snippet.wrapperProps}>
            <div
              {...own(snippet.props)}
              style:pointer-events={pressable(snippet.open)}
            >
              {@render children?.()}
            </div>
          </div>
        {/if}
      {/if}
    {/snippet}
  </DropdownMenuPrimitive.Content>
</DropdownMenuPortal>
