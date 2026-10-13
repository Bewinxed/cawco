<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import ContextMenuPortal from "./context-menu-portal.svelte";

  let {
    ref = $bindable(null),
    portalProps,
    class: className,
    forceMount = false,
    child: callerChild,
    children,
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

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence). -->
<ContextMenuPortal {...portalProps}>
  <ContextMenuPrimitive.Content
    class={cn(
      "kit-pop relative z-50 min-w-48 origin-(--bits-context-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none",
      className
    )}
    data-slot="context-menu-content"
    forceMount
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
  </ContextMenuPrimitive.Content>
</ContextMenuPortal>
