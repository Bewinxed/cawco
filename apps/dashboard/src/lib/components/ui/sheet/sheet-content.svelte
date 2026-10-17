<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a sheet whose content pads itself. */
  export const sheetContentVariants = tv({
    variants: { pad: { none: "p-0" } },
  });

  export type SheetContentLooks = VariantProps<typeof sheetContentVariants>;
  export type Side = "top" | "right" | "bottom" | "left";
  /** Where a sheet stands while it is away: out past the edge it comes in from. */
  const AWAY: Record<Side, string> = {
    left: "translate3d(-100%, 0, 0)",
    right: "translate3d(100%, 0, 0)",
    top: "translate3d(0, -100%, 0)",
    bottom: "translate3d(0, 100%, 0)",
  };
</script>

<script lang="ts">
  import { Dialog as SheetPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { dragToDismiss } from "#lib/cawco/motion/drag.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import { IconClose } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
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
    restoreScrollDelay = 0,
    portalProps,
    pad,
    children,
    ...restProps
  }: WithoutChildrenOrChild<SheetPrimitive.ContentProps> &
    SheetContentLooks & {
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
      "pointer-events-auto fixed z-50 flex flex-col bg-[var(--surface-raised)] bg-clip-padding text-ink-strong text-label shadow-[var(--shadow-drawer)] data-is-shut:pointer-events-none data-[side=bottom]:inset-x-0 data-[side=top]:inset-x-0 data-[side=left]:inset-y-0 data-[side=right]:inset-y-0 data-[side=top]:top-0 data-[side=right]:right-0 data-[side=bottom]:bottom-0 data-[side=left]:left-0 data-[side=bottom]:h-auto data-[side=left]:h-full data-[side=right]:h-full data-[side=top]:h-auto data-[side=left]:w-3/4 data-[side=right]:w-3/4 data-[side=left]:phone:max-w-96 data-[side=right]:phone:max-w-96 data-[side=bottom]:border-t data-[side=left]:border-r data-[side=top]:border-b data-[side=right]:border-l",
      sheetContentVariants({ pad }),
      className
    )}
    data-side={side}
    data-slot="sheet-content"
    {preventOverflowTextSelection}
    {restoreScrollDelay}
    bind:ref
    {...restProps}
  >
    <!-- Drawn through `child`: bits-ui then holds the body's lock only while
         it is open, and clears it at once (floating-presence). -->
    {#snippet child({ props, open })}
      <div
        {...props}
        data-is-shut={pressable(open) === "none" || undefined}
        style:--sheet-away={AWAY[side]}
      >
        {@render children?.()}
        {#if showCloseButton}
          <SheetPrimitive.Close data-slot="sheet-close">
            {#snippet child({ props: closeProps })}
              <Button
                class="absolute top-4 right-4"
                size="icon-sm"
                variant="ghost"
                {...closeProps}
              >
                <IconClose />
                <span class="sr-only">Close</span>
              </Button>
            {/snippet}
          </SheetPrimitive.Close>
        {/if}
      </div>
    {/snippet}
  </SheetPrimitive.Content>
</SheetPortal>

<style>
  /* A sheet travels its whole size from the edge it belongs to, over
     --dur-panel on the drawer curve, and leaves the same way over
     --dur-exit. The entrance does not hold its end (no fill): a drag writes
     the sheet's transform inline once it has landed. */
  /* A touch is the browser's to pan only across the axis a sheet leaves by,
     and the rule has to reach every element inside: the browser reads
     touch-action from the finger's element up to the nearest scroller, so a
     scrolling list in the sheet would otherwise claim a sideways drag
     (motion/drag.svelte.ts). */
  /* residual: foreign-dom */
  [data-slot="sheet-content"]:is([data-side="left"], [data-side="right"])
    :global(*) {
    touch-action: pan-y;
  }
  [data-slot="sheet-content"]:is([data-side="top"], [data-side="bottom"])
    :global(*) {
    touch-action: pan-x;
  }
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="sheet-content"][data-state="open"] {
      animation: sheet-in var(--dur-panel) var(--ease-drawer);
    }
    [data-slot="sheet-content"][data-state="closed"] {
      animation: sheet-out var(--dur-exit) var(--ease-drawer) forwards;
    }
  }
  /* Asked for less motion, it fades in place. */
  @media (prefers-reduced-motion: reduce) {
    [data-slot="sheet-content"][data-state="open"] {
      animation: sheet-fade-in var(--dur-control) var(--ease-out);
    }
    [data-slot="sheet-content"][data-state="closed"] {
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
