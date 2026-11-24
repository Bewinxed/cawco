<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { rise } from "#lib/components/ui/elevated/index.js";
  import FloatingBody from "#lib/components/ui/floating-body.svelte";
  import { menuSurface } from "#lib/components/ui/menu-surface.svelte.js";
  import {
    type FloatingSurfaceLooks,
    floatingSurface,
  } from "#lib/components/ui/popover/popover-content.svelte";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import ContextMenuPortal from "./context-menu-portal.svelte";

  let {
    ref = $bindable(null),
    portalProps,
    class: className,
    forceMount = false,
    preventScroll = false,
    onInteractOutside,
    onCloseAutoFocus,
    motion,
    child: callerChild,
    children,
    /* Off: see popover-content.svelte. */
    /* Fixed: see popover-content.svelte. */
    strategy = "fixed",
    preventOverflowTextSelection = false,
    ...restProps
  }: ContextMenuPrimitive.ContentProps &
    FloatingSurfaceLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof ContextMenuPortal>
      >;
    } = $props();

  const away = menuSurface({
    content: () => ref,
    onInteractOutside: () => onInteractOutside,
    onCloseAutoFocus: () => onCloseAutoFocus,
  });

  /** One step above the surface it opens in (theme.css `surface`). */
  const surfaceLevel = rise();
</script>

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence). -->
<ContextMenuPortal {...portalProps}>
  <ContextMenuPrimitive.Content
    style="--surface-level: {surfaceLevel}"
    {preventOverflowTextSelection}
    {strategy}
    class={cn(
      floatingSurface({ motion }),
      "relative z-(--layer-float) p-space-1 min-w-48 origin-(--bits-context-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none",
      className
    )}
    data-slot="context-menu-content"
    forceMount
    onCloseAutoFocus={away.onCloseAutoFocus}
    onInteractOutside={away.onInteractOutside}
    {preventScroll}
    bind:ref
    {...restProps}
  >
    {#snippet child(snippet)}
      <!-- Closing, it takes neither a press nor the focus: what an item
           opened (a row's title field) keeps the focus it was given, where
           the menu leaving would pull it back into itself. -->
      <FloatingBody
        {callerChild}
        {children}
        {forceMount}
        inertClosed
        {snippet}
      />
    {/snippet}
  </ContextMenuPrimitive.Content>
</ContextMenuPortal>
