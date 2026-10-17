<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { type Morph, morph } from "#lib/cawco/motion/morph.svelte.js";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import { browser } from "$app/env";
  import PopoverPortal from "./popover-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    sideOffset = 4,
    align = "center",
    collisionPadding,
    portalProps,
    morphs,
    bare = false,
    forceMount = false,
    child: callerChild,
    children,
    ...restProps
  }: PopoverPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
    /** How it tweens to a new size (motion/morph): across too, or held still. */
    morphs?: Morph;
    /** It draws no surface (padding, edge, fill, shadow): what it holds is the surface. */
    bare?: boolean;
  } = $props();

  // Never flush with the screen's edge: it keeps the pages' gutter from it,
  // pushed back in when its place would run it off a phone. The token is
  // read in the browser, where the popover opens.
  const inset = $derived(
    collisionPadding ?? (browser ? numberOf("--space-5") : 0)
  );

  // A popover whose content changes (a list arrives, an error appears)
  // tweens to its new height instead of jumping.
  // svelte-ignore state_referenced_locally: how it morphs is set once, by its site
  const resize = morph(morphs);
  $effect(() => {
    if (ref) {
      return resize(ref);
    }
  });
</script>

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so:
     the page has its pointer back at the dismissal (floating-presence). -->
<PopoverPortal {...portalProps}>
  <PopoverPrimitive.Content
    {align}
    class={cn(
      "kit-pop z-50 flex w-72 origin-(--bits-popover-content-transform-origin) flex-col gap-4 text-label outline-hidden",
      bare &&
        "border-none border-current bg-transparent bg-none p-0 shadow-none",
      className
    )}
    collisionPadding={inset}
    data-slot="popover-content"
    forceMount
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
  </PopoverPrimitive.Content>
</PopoverPortal>
