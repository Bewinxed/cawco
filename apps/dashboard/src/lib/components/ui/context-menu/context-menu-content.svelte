<script lang="ts">
  import { ContextMenu as ContextMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import type { LayerPlacement } from "#lib/components/ui/anchored.svelte.js";
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
    side = "right",
    sideOffset = 2,
    align = "start",
    alignOffset = 0,
    collisionPadding = 0,
    customAnchor,
    fixedSide = false,
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
    preventOverflowTextSelection = false,
    ...restProps
  }: Omit<ContextMenuPrimitive.ContentStaticProps, keyof LayerPlacement> &
    LayerPlacement &
    FloatingSurfaceLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof ContextMenuPortal>
      >;
    } = $props();

  /** Its layer's box: at the pointer's point, or on the element its site names (anchored.svelte.ts). */
  const surface = menuSurface(
    {
      content: () => ref,
      onInteractOutside: () => onInteractOutside,
      onCloseAutoFocus: () => onCloseAutoFocus,
    },
    () => ({
      side,
      align,
      sideOffset,
      alignOffset,
      collisionPadding,
      customAnchor,
      fixedSide,
      atPointer: customAnchor === undefined,
    })
  );
</script>

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence). -->
<ContextMenuPortal {...portalProps}>
  <ContextMenuPrimitive.ContentStatic
    style="--surface-level: {surface.level}"
    {preventOverflowTextSelection}
    class={cn(
      floatingSurface({ motion }),
      "relative p-space-1 min-w-48 origin-(--kit-origin) overflow-y-auto overflow-x-hidden outline-none",
      className
    )}
    data-slot="context-menu-content"
    forceMount
    onCloseAutoFocus={surface.onCloseAutoFocus}
    onInteractOutside={surface.onInteractOutside}
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
        wrapper={surface.layer}
      />
    {/snippet}
  </ContextMenuPrimitive.ContentStatic>
</ContextMenuPortal>
