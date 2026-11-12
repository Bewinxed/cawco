<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks: a sheet whose content pads itself; a sheet that
      stands only under the drawer line (DESIGN.md, Breakpoints: at 900px
      "the rail becomes a burger sheet"), gone past it however it was left. */
  const sheetContentVariants = tv({
    variants: {
      pad: { none: "p-0" },
      narrow: { true: "desk:hidden" },
    },
  });

  type SheetContentLooks = VariantProps<typeof sheetContentVariants>;
  type Side = "top" | "right" | "bottom" | "left";
  /** Where a sheet stands while it is away: out past the edge it comes in from. */
  const AWAY: Record<Side, string> = {
    left: "translate3d(-100%, 0, 0)",
    right: "translate3d(100%, 0, 0)",
    top: "translate3d(0, -100%, 0)",
    bottom: "translate3d(0, 100%, 0)",
  };
</script>

<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  import { Dialog as SheetPrimitive } from "bits-ui";
  import type { ComponentProps, Snippet } from "svelte";
  import { frameSize } from "#lib/cawco/frame-observer.js";
  import { dragToDismiss } from "#lib/cawco/motion/drag.svelte.js";
  import { mirror } from "#lib/cawco/page-marks.js";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { sheetHeadVariants } from "#lib/components/ui/drawer/sheet-head.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconClose } from "#lib/icons.js";
  import { cn, type WithoutChildrenOrChild } from "#lib/utils.js";
  import { closer } from "./sheet.svelte";
  import SheetFrame from "./sheet-frame.svelte";
  import SheetOverlay from "./sheet-overlay.svelte";
  import SheetPortal from "./sheet-portal.svelte";

  let {
    ref = $bindable(null),
    class: className,
    side = "right",
    /* Off: a drag in a sheet moves the sheet, so there is no selection to
       keep in it, and the lock bits-ui takes for one writes `user-select` on
       <body> at every pointerdown, restyling the whole page in the frame
       the finger lands (17ms in Chromium at 390px). */
    preventOverflowTextSelection = false,
    restoreScrollDelay = 0,
    portalProps,
    pad,
    narrow,
    title,
    titleHidden = false,
    children,
    ...restProps
  }: WithoutChildrenOrChild<SheetPrimitive.ContentProps> &
    SheetContentLooks & {
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof SheetPortal>>;
      side?: Side;
      /**
       * The sheet's name. The kit draws the sheets' one header with it
       * (DESIGN.md, Sheet: Close leading, then the title in the title
       * role), so no sheet stands without a name or a Close. A
       * name that changes morphs in place (MorphText, DESIGN.md, The Steady
       * Swap Rule).
       */
      title: string;
      /** The name read out but not drawn, on a sheet whose content names
          itself on screen (the rail's brand row): no header row stands, and
          the content draws the kit's Close (`Sheet.Close`) in its own first
          row, beside that row's own controls. A Close the kit laid over the
          row's trailing corner stood on the row's own corner action. */
      titleHidden?: boolean;
      children: Snippet;
    } = $props();

  const head = sheetHeadVariants();
  /**
   * The header floats over the content (DESIGN.md, The Title Bars Follow
   * Liquid Glass Rule; as the kit Drawer's): the content runs to the
   * sheet's top beneath it, its scroller padding its top by the header's
   * height (`--sheet-room`, `scroller` in the kit's index) and naming the
   * scroll timeline the header's scroll edge effect plays on (HeadFade).
   */
  let room = $state(0);

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
      "fixed side-bottom:inset-x-0 side-top:inset-x-0 side-left:inset-y-0 side-right:inset-y-0 side-top:top-0 side-right:right-0 side-bottom:bottom-0 side-left:left-0 z-(--layer-float) flex side-bottom:h-auto side-left:h-full side-right:h-full side-top:h-auto side-left:w-3/4 side-right:w-3/4 side-left:phone:max-w-96 side-right:phone:max-w-96 flex-col side-bottom:border-t side-left:border-r side-top:border-b side-right:border-l bg-surface-raised bg-clip-padding text-ink-strong type-label shadow-drawer timeline-scope-transcript-head",
      /* It travels its whole size from the edge it belongs to (`--sheet-away`),
         over --duration-panel on the drawer curve, and leaves the same way over
         --duration-exit; the entrance holds no end (no fill), since a drag writes
         the sheet's transform inline once it has landed. Asked for less
         motion, it fades in place. */
      "motion-safe:state-closed:animate-sheet-out motion-safe:state-open:animate-sheet-in motion-reduce:state-closed:animate-sheet-fade-out motion-reduce:state-open:animate-sheet-fade-in",
      sheetContentVariants({ pad, narrow }),
      className
    )}
    data-side={side}
    data-slot="sheet-content"
    {preventOverflowTextSelection}
    {restoreScrollDelay}
    bind:ref
    {...restProps}
  >
    {#snippet child({ props, open })}
      <SheetFrame
        away={AWAY[side]}
        {open}
        {props}
        room={titleHidden ? undefined : room}
      >
        {#if titleHidden}
          <SheetPrimitive.Title class="sr-only" data-slot="sheet-title"
            >{title}</SheetPrimitive.Title
          >
        {:else}
          <HeadFade band="var(--sheet-room)" tint="bg-surface-raised" />
          <div
            class={cn(head.head(), "absolute inset-x-0 top-0 z-2 px-4 pt-4")}
            data-slot="sheet-header"
            {@attach frameSize(
              (node: HTMLElement) => node.offsetHeight,
              (value) => {
                room = value;
              }
            )}
          >
            <!-- Close leads, before the title, a bare symbol in a glass
                 group of its own (DESIGN.md, Sheet; HIG, Sheets: a
                 single-view sheet's Cancel on the leading edge). -->
            <div class="flex flex-none">
              <BarGlass form="group">
                <SheetPrimitive.Close>
                  {#snippet child({ props })}
                    <BarItem
                      data-slot="sheet-close"
                      icon={IconClose}
                      label={commonWords.close}
                      {props}
                    />
                  {/snippet}
                </SheetPrimitive.Close>
              </BarGlass>
            </div>
            <SheetPrimitive.Title
              class={cn(head.title(), "me-auto")}
              data-slot="sheet-title"
              ><MorphText text={title} wrap /></SheetPrimitive.Title
            >
          </div>
        {/if}
        {@render children?.()}
      </SheetFrame>
    {/snippet}
  </SheetPrimitive.Content>
</SheetPortal>
