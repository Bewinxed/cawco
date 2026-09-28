<script lang="ts" module>
  export type Side = "top" | "right" | "bottom" | "left";
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { IconClose } from "$lib/icons";
  import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
  import { dragToDismiss } from "$lib/whiffle/motion/drag.svelte";
  import { closer } from "./sheet.svelte";
  import SheetOverlay from "./sheet-overlay.svelte";
  import SheetPortal from "./sheet-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    side = "right",
    showCloseButton = true,
    /* Off: a drag in a sheet moves the sheet, so there is no selection to
       keep in it, and the lock bits-ui takes for one writes `user-select` on
       <body> at every pointerdown, restyling the whole page in the frame
       the finger lands (17ms in Chromium at 390px). */
    preventOverflowTextSelection = false,
    portalProps,
    children,
    ...restProps
  }: WithoutChildrenOrChild<SheetPrimitive.ContentProps> & {
    portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
    side?: Side;
    showCloseButton?: boolean;
    children: Snippet;
  } = $props();

  /* A sheet goes back out the edge it came in from under the finger, its
     scrim fading with it (motion/drag.svelte.ts). */
  const close = closer();
  let scrim = $state<HTMLElement | null>(null);
  $effect(() => {
    if (ref) {
      return dragToDismiss({ edge: side, dismiss: close, fade: () => scrim })(
        ref
      );
    }
  });
</script>

<SheetPortal {...portalProps}>
  <SheetOverlay bind:ref={scrim} />
  <SheetPrimitive.Content
    class={cn(
      "sheet fixed z-50 flex flex-col bg-[var(--surface-raised)] bg-clip-padding text-foreground text-label shadow-[var(--shadow-drawer)] data-[side=bottom]:inset-x-0 data-[side=top]:inset-x-0 data-[side=left]:inset-y-0 data-[side=right]:inset-y-0 data-[side=top]:top-0 data-[side=right]:right-0 data-[side=bottom]:bottom-0 data-[side=left]:left-0 data-[side=bottom]:h-auto data-[side=left]:h-full data-[side=right]:h-full data-[side=top]:h-auto data-[side=left]:w-3/4 data-[side=right]:w-3/4 data-[side=bottom]:border-t data-[side=left]:border-r data-[side=top]:border-b data-[side=right]:border-l data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
			className
		)}
    data-side={side}
    data-slot="sheet-content"
    {preventOverflowTextSelection}
    bind:ref
    {...restProps}
  >
    {@render children?.()}
    {#if showCloseButton}
      <SheetPrimitive.Close data-slot="sheet-close">
        {#snippet child({ props })}
          <Button
            class="absolute top-4 right-4"
            size="icon-sm"
            variant="ghost"
            {...props}
          >
            <IconClose />
            <span class="sr-only">Close</span>
          </Button>
        {/snippet}
      </SheetPrimitive.Close>
    {/if}
  </SheetPrimitive.Content>
</SheetPortal>

<style>
  /* A sheet travels its whole size from the edge it belongs to, over
     --dur-panel on the drawer curve, and leaves the same way over
     --dur-exit. The entrance does not hold its end (no fill): a drag writes
     the sheet's transform inline once it has landed. */
  :global(.sheet[data-side="left"]) {
    --sheet-away: translate3d(-100%, 0, 0);
  }
  :global(.sheet[data-side="right"]) {
    --sheet-away: translate3d(100%, 0, 0);
  }
  :global(.sheet[data-side="top"]) {
    --sheet-away: translate3d(0, -100%, 0);
  }
  :global(.sheet[data-side="bottom"]) {
    --sheet-away: translate3d(0, 100%, 0);
  }
  /* A touch is the browser's to pan only across the axis a sheet leaves by,
     and the rule has to reach every element inside: the browser reads
     touch-action from the finger's element up to the nearest scroller, so a
     scrolling list in the sheet would otherwise claim a sideways drag
     (motion/drag.svelte.ts). */
  :global(.sheet:is([data-side="left"], [data-side="right"]) *) {
    touch-action: pan-y;
  }
  :global(.sheet:is([data-side="top"], [data-side="bottom"]) *) {
    touch-action: pan-x;
  }
  @media (prefers-reduced-motion: no-preference) {
    :global(.sheet[data-state="open"]) {
      animation: sheet-in var(--dur-panel) var(--ease-drawer);
    }
    :global(.sheet[data-state="closed"]) {
      animation: sheet-out var(--dur-exit) var(--ease-drawer) forwards;
    }
  }
  /* Asked for less motion, it fades in place. */
  @media (prefers-reduced-motion: reduce) {
    :global(.sheet[data-state="open"]) {
      animation: sheet-fade-in var(--dur-control) var(--ease-out);
    }
    :global(.sheet[data-state="closed"]) {
      animation: sheet-fade-out var(--dur-control) var(--ease-out) forwards;
    }
  }
  @keyframes sheet-in {
    from {
      transform: var(--sheet-away);
    }
  }
  @keyframes sheet-out {
    to {
      transform: var(--sheet-away);
    }
  }
  @keyframes sheet-fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes sheet-fade-out {
    to {
      opacity: 0;
    }
  }
</style>
