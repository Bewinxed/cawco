<script lang="ts">
  import { Select as SelectPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import { highlight } from "#lib/components/ui/highlight/highlight.svelte.js";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn, type WithoutChild } from "#lib/utils.js";
  import SelectPortal from "./select-portal.svelte";
  import SelectScrollDownButton from "./select-scroll-down-button.svelte";
  import SelectScrollUpButton from "./select-scroll-up-button.svelte";

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    portalProps,
    children,
    preventScroll = true,
    forceMount = false,
    ...restProps
  }: WithoutChild<SelectPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SelectPortal>>;
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
<SelectPortal {...portalProps}>
  <SelectPrimitive.Content
    class={cn(
      "kit-pop relative isolate z-50 min-w-36 origin-(--bits-select-content-transform-origin) overflow-y-auto overflow-x-hidden",
      className
    )}
    data-slot="select-content"
    forceMount
    {preventScroll}
    {sideOffset}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, wrapperProps, open })}
      {#if forceMount || drawn(props)}
        <div {...wrapperProps} style:pointer-events={pressable(open)}>
          <div {...own(props)} style:pointer-events={pressable(open)}>
            <SelectScrollUpButton />
            <SelectPrimitive.Viewport
              class={cn(
                "h-(--bits-select-anchor-height) w-full min-w-(--bits-select-anchor-width) scroll-my-1"
              )}
            >
              {@render children?.()}
            </SelectPrimitive.Viewport>
            <SelectScrollDownButton />
          </div>
        </div>
      {/if}
    {/snippet}
  </SelectPrimitive.Content>
</SelectPortal>
