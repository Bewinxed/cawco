<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import type { ComponentProps } from "svelte";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
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
    ...restProps
  }: PopoverPrimitive.ContentProps & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof PopoverPortal>>;
  } = $props();

  // Never flush with the screen's edge: it keeps the pages' gutter from it,
  // pushed back in when its place would run it off a phone. The token is
  // read in the browser, where the popover opens.
  const inset = $derived(
    collisionPadding ?? (browser ? numberOf("--space-5") : 0)
  );

  // A popover whose content changes (a list arrives, an error appears)
  // tweens to its new height instead of jumping.
  const resize = morph();
  $effect(() => {
    if (ref) {
      return resize(ref);
    }
  });
</script>

<PopoverPortal {...portalProps}>
  <PopoverPrimitive.Content
    {align}
    class={cn(
      "kit-pop z-50 flex w-72 origin-(--bits-popover-content-transform-origin) flex-col gap-4 text-label outline-hidden",
      className
    )}
    collisionPadding={inset}
    data-slot="popover-content"
    {sideOffset}
    bind:ref
    {...restProps}
  />
</PopoverPortal>
