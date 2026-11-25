<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a width of its own instead of its trigger's, or a
      least width under the kit's. */
  const dropdownMenuContentVariants = tv({
    variants: {
      width: {
        compact: "w-44",
        regular: "w-52",
        wide: "w-64",
        /** A menu of tiles (a stage's glyphs): `wide`, and under the phone
            line the screen less its margin each side (DESIGN.md,
            Breakpoints: "popovers widen to the viewport less 24px"), so a
            finger's tiles stand seven to a row and the menu fits the screen. */
        tiles: "w-64 max-phone:w-[calc(100vw-2*var(--spacing-space-3))]",
        /** A menu of titles an agent wrote (the artifacts menu): room for
            one of ordinary length in two lines beside its glyph and age,
            and on a phone as wide as a title standing after Close leaves. */
        titles: "w-96 max-phone:w-80",
      },
      min: { compact: "min-w-40", regular: "min-w-44" },
    },
  });

  type DropdownMenuContentLooks = VariantProps<
    typeof dropdownMenuContentVariants
  >;
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import type { LayerPlacement } from "#lib/components/ui/anchored.svelte.js";
  import FloatingBody from "#lib/components/ui/floating-body.svelte";
  import { menuSurface } from "#lib/components/ui/menu-surface.svelte.js";
  import {
    type FloatingSurfaceLooks,
    floatingSurface,
  } from "#lib/components/ui/popover/popover-content.svelte";
  import { numberOf } from "#lib/platform/motion/curves.svelte.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import { browser } from "$app/env";
  import DropdownMenuPortal from "./dropdown-menu-portal.svelte";

  let {
    ref = $bindable(null),
    side = "bottom",
    sideOffset = 4,
    align = "start",
    alignOffset = 0,
    collisionPadding,
    customAnchor,
    fixedSide = false,
    portalProps,
    class: className,
    forceMount = false,
    preventScroll = false,
    onInteractOutside,
    onCloseAutoFocus,
    width,
    min,
    motion,
    child: callerChild,
    children,
    /* Off: see popover-content.svelte. */
    preventOverflowTextSelection = false,
    ...restProps
  }: Omit<DropdownMenuPrimitive.ContentStaticProps, keyof LayerPlacement> &
    LayerPlacement &
    DropdownMenuContentLooks &
    FloatingSurfaceLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof DropdownMenuPortal>
      >;
    } = $props();

  // Never flush with the screen's edge, as the popover: it keeps the pages'
  // gutter from it, pushed back in when its place would run it off a phone.
  // A menu of tiles, the screen less its margin wide on a phone, keeps that
  // margin instead, so it stands centred on the screen and never past it
  // on one side (DESIGN.md, Breakpoints).
  const inset = $derived(
    collisionPadding ??
      (browser
        ? numberOf(
            width === "tiles" ? "--spacing-space-3" : "--spacing-space-4"
          )
        : 0)
  );

  /** Its layer's box: on its trigger (anchored.svelte.ts). */
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
      collisionPadding: inset,
      customAnchor,
      fixedSide,
    })
  );
</script>

<!-- Mounted and drawn as the popover is (floating-body). -->
<DropdownMenuPortal {...portalProps}>
  <DropdownMenuPrimitive.ContentStatic
    style="--surface-level: {surface.level}"
    {preventOverflowTextSelection}
    class={cn(
      floatingSurface({ motion }),
      "relative p-space-1 w-(--kit-anchor-width) min-w-48 origin-(--kit-origin) overflow-y-auto overflow-x-hidden outline-none",
      dropdownMenuContentVariants({ width, min }),
      className
    )}
    data-slot="dropdown-menu-content"
    forceMount
    onCloseAutoFocus={surface.onCloseAutoFocus}
    onInteractOutside={surface.onInteractOutside}
    {preventScroll}
    bind:ref
    {...restProps}
  >
    {#snippet child(snippet)}
      <FloatingBody
        {callerChild}
        {children}
        {forceMount}
        {snippet}
        wrapper={surface.layer}
      />
    {/snippet}
  </DropdownMenuPrimitive.ContentStatic>
</DropdownMenuPortal>
