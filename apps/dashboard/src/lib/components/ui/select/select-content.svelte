<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import {
    type LayerPlacement,
    layerProps,
  } from "#lib/components/ui/anchored.svelte.js";
  import { rise } from "#lib/components/ui/elevated/index.js";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import { markMenuEnds } from "#lib/components/ui/menu-item/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn, type WithoutChild } from "#lib/utils.js";
  import SelectPortal from "./select-portal.svelte";
  import SelectScrollDownButton from "./select-scroll-down-button.svelte";
  import SelectScrollUpButton from "./select-scroll-up-button.svelte";

  let {
    ref = $bindable(null),
    class: className,
    side = "bottom",
    sideOffset = 4,
    align = "start",
    alignOffset = 0,
    collisionPadding = 0,
    customAnchor,
    portalProps,
    children,
    preventScroll = false,
    forceMount = false,
    /* Off: see popover-content.svelte. */
    preventOverflowTextSelection = false,
    ...restProps
  }: Omit<
    WithoutChild<SelectPrimitive.ContentStaticProps>,
    keyof LayerPlacement
  > &
    LayerPlacement & {
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPortal>>;
    } = $props();

  // One ghost glides from item to item under the pointer and arrow keys.
  $effect(() => {
    if (ref) {
      return highlight({
        rows: "[data-menu-item]",
        hovered: "[data-highlighted]",
      })(ref);
    }
  });

  /** One step above the surface it opens in (theme.css `surface`). */
  const surfaceLevel = rise();

  /** Its layer's box: on its trigger (anchored.svelte.ts). */
  const layer = layerProps(() => ({
    side,
    align,
    sideOffset,
    alignOffset,
    collisionPadding,
    customAnchor,
  }));

  /* Its end rows follow its curve, the rows between join (menu-item/ends.ts). */
  $effect(() => {
    if (ref) {
      return markMenuEnds(ref);
    }
  });
</script>

<!-- At most the room between the trigger and the viewport's edge (its
     layer's box caps it there, anchored.svelte.ts), so a long list scrolls
     inside it and its scroll buttons show. Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence).
     No lock on the page (`preventScroll` false): a press outside closes the
     list and lands on what it was pressed on. -->

<SelectPortal {...portalProps}>
  <SelectPrimitive.ContentStatic
    style="--surface-level: {surfaceLevel}"
    {preventOverflowTextSelection}
    class={cn(
      floatingSurface(),
      "relative isolate p-space-1 min-w-36 origin-(--kit-origin) overflow-y-auto overflow-x-hidden",
      className
    )}
    data-slot="select-content"
    forceMount
    {preventScroll}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, open })}
      {#if forceMount || drawn(props)}
        <div {...layer} style:pointer-events={pressable(open)}>
          <div {...own(props)} style:pointer-events={pressable(open)}>
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport
              class={cn(
                "h-(--kit-anchor-height) w-full min-w-(--kit-anchor-width) scroll-my-space-1"
              )}
            >
              {@render children?.()}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
          </div>
        </div>
      {/if}
    {/snippet}
  </SelectPrimitive.ContentStatic>
</SelectPortal>
