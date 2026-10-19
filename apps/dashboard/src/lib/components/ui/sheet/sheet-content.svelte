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
  import { mirror } from "#lib/cawco/page-marks.js";
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
  /* An open side sheet holds part of each screen edge, the phone's sidebar
     its own ground: said on the root for the edges (ScreenEdges, page-marks). */
  $effect(() => {
    if (ref) {
      return mirror(
        ref,
        "root",
        "data-kit-sheet",
        ["data-side", "data-state", "data-rail-sheet"],
        (sheet) => {
          const { side: at, state } = sheet.dataset;
          if (state !== "open") {
            return [];
          }
          return [
            ...(at === "left" || at === "right" ? ["side"] : []),
            ...(sheet.hasAttribute("data-rail-sheet") ? ["rail"] : []),
          ];
        }
      );
    }
  });
</script>

<SheetPortal {...portalProps}>
  <SheetOverlay bind:ref={scrim} />
  <!-- A touch is the browser's to pan only across the axis a sheet leaves by,
       on every element inside it: the browser reads touch-action from the
       finger's element up to the nearest scroller, so a scrolling list in the
       sheet would otherwise claim a sideways drag (motion/drag.svelte.ts).
       The theme's `sheet-pan` component rule says it, keyed on this
       element's data-slot and data-side. -->
  <SheetPrimitive.Content
    class={cn(
      "fixed side-bottom:inset-x-0 side-top:inset-x-0 side-left:inset-y-0 side-right:inset-y-0 side-top:top-0 side-right:right-0 side-bottom:bottom-0 side-left:left-0 z-50 flex side-bottom:h-auto side-left:h-full side-right:h-full side-top:h-auto side-left:w-3/4 side-right:w-3/4 side-left:phone:max-w-96 side-right:phone:max-w-96 flex-col side-bottom:border-t side-left:border-r side-top:border-b side-right:border-l bg-surface-raised bg-clip-padding text-ink-strong text-label shadow-drawer",
      /* It travels its whole size from the edge it belongs to (`--sheet-away`),
         over --dur-panel on the drawer curve, and leaves the same way over
         --dur-exit; the entrance holds no end (no fill), since a drag writes
         the sheet's transform inline once it has landed. Asked for less
         motion, it fades in place. */
      "motion-safe:state-closed:animate-sheet-out motion-safe:state-open:animate-sheet-in motion-reduce:state-closed:animate-sheet-fade-out motion-reduce:state-open:animate-sheet-fade-in",
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
        style:pointer-events={pressable(open)}
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
