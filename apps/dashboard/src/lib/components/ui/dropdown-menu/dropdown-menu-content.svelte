<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a width of its own instead of its trigger's, or a
      least width under the kit's. */
  export const dropdownMenuContentVariants = tv({
    variants: {
      width: { compact: "w-44", regular: "w-52", wide: "w-64" },
      min: { compact: "min-w-40", regular: "min-w-44" },
    },
  });

  export type DropdownMenuContentLooks = VariantProps<
    typeof dropdownMenuContentVariants
  >;
</script>

<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import {
    drawn,
    own,
    pressable,
    pressedAway,
  } from "#lib/components/ui/floating-presence.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import { browser } from "$app/env";
  import DropdownMenuPortal from "./dropdown-menu-portal.svelte";

  let {
    ref = $bindable(null),
    sideOffset = 4,
    align = "start",
    collisionPadding,
    portalProps,
    class: className,
    forceMount = false,
    preventScroll = false,
    onInteractOutside,
    onCloseAutoFocus,
    width,
    min,
    child: callerChild,
    children,
    ...restProps
  }: DropdownMenuPrimitive.ContentProps &
    DropdownMenuContentLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof DropdownMenuPortal>
      >;
    } = $props();

  // Never flush with the screen's edge, as the popover: it keeps the pages'
  // gutter from it, pushed back in when its place would run it off a phone.
  const inset = $derived(
    collisionPadding ?? (browser ? numberOf("--space-5") : 0)
  );

  /* No lock on the page (`preventScroll` false, floating-presence): a press
     outside closes the menu and lands on what it was pressed on, the focus
     left there (`pressedAway`). */
  const away = pressedAway({
    onInteractOutside: () => onInteractOutside,
    onCloseAutoFocus: () => onCloseAutoFocus,
  });

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({
        rows: "[data-menu-item]",
        hovered: "[data-highlighted]",
      })(ref);
    }
  });
</script>

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence). -->
<DropdownMenuPortal {...portalProps}>
  <DropdownMenuPrimitive.Content
    {align}
    class={cn(
      floatingSurface(),
      "relative z-(--layer-float) max-h-(--bits-dropdown-menu-content-available-height) w-(--bits-dropdown-menu-anchor-width) min-w-48 origin-(--bits-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden outline-none",
      dropdownMenuContentVariants({ width, min }),
      className
    )}
    collisionPadding={inset}
    data-slot="dropdown-menu-content"
    forceMount
    onCloseAutoFocus={away.onCloseAutoFocus}
    onInteractOutside={away.onInteractOutside}
    {preventScroll}
    {sideOffset}
    bind:ref
    {...restProps}
  >
    {#snippet child(snippet)}
      {#if forceMount || drawn(snippet.props)}
        {#if callerChild}
          {@render callerChild(snippet)}
        {:else}
          <div
            {...snippet.wrapperProps}
            style:pointer-events={pressable(snippet.open)}
          >
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
