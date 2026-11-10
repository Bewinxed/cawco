<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its callers' looks, each as they drew it. */
  const drawerContentVariants = tv({
    variants: {
      /** Its foot: none at all, a bottom sheet's safe-area foot included (its
          content keeps the safe area clear itself); a sheet with a footer of
          its own height (`--sheet-foot`) and no other padding; or the safe
          area alone, on every sheet or a bottom sheet only. */
      pad: {
        none: "p-0 vaul-drawer-direction-bottom:pb-0",
        "sheet-foot":
          "p-0 pb-(--sheet-foot) vaul-drawer-direction-bottom:pb-(--sheet-foot)",
        "safe-bottom":
          "pb-(--safe-bottom) vaul-drawer-direction-bottom:pb-(--safe-bottom)",
        "sheet-safe-bottom": "vaul-drawer-direction-bottom:pb-(--safe-bottom)",
      },
      /** A sheet in a column that may shrink below its content; or a bottom
          sheet that stands at its cap from the first frame (its own
          --drawer-max-height, else the recipe's 85vh), whatever it holds, so
          vaul's stops, shares of the screen's height, each hold one height
          (Files, Caw's sheet, the peek on a touch screen). The placed sheet's
          max-height keeps it inside the visible area (app.css). */
      height: {
        shrink: "min-h-0",
        cap: "vaul-drawer-direction-bottom:h-(--drawer-max-height) [--drawer-max-height:var(--c-sheet-max-h)]",
      },
      /** A side sheet as wide as the room the page gives it (the peek's,
          `c-peek-sheet-w`, the Shell's trailing pad while it stands open). */
      width: {
        peek: "data-[vaul-drawer-direction=right]:w-c-peek-sheet-w",
      },
      /** The new-session card: the dialog's theme, no outline or margin,
          and under reduced motion none of vaul's settling transform (its
          fade is the base's). `!`: vaul writes that transition inline
          (use-drawer-root.svelte.js), which only an important
          declaration outranks;
          https://tailwindcss.com/docs/styling-with-utility-classes#using-the-important-modifier */
      /** A sheet kept mounted while closed (`forceMount`, the preview's
          sheet of a tab off screen): closed, it is never drawn, from the
          moment it closes. */
      closed: {
        unseen: "data-closed:invisible",
      },
      look: {
        "new-session":
          "ns-theme m-0 outline-off motion-reduce:transition-none!",
      },
    },
  });

  type DrawerContentLooks = VariantProps<typeof drawerContentVariants>;

  /** The bottom sheet's 100×6 grabber (DESIGN.md, Drawer), above its one
      header; the kit dialog's sheet under the phone line wears it too. It is
      a control (a press steps the sheet's stops), so it holds the kit's
      non-text contrast against the sheet (`border-contrast`, 3:1 or more in
      both schemes, WCAG 1.4.11): `neutral-2` on the raised sheet was about
      1.05:1 and read as no control at all (the review of 7 November). */
  export const grabberVariants = tv({
    base: "mx-auto mt-4 mb-3 h-c-grabber-h w-c-grabber-w shrink-0 rounded-pill bg-border-contrast",
  });
</script>

<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  import type { ComponentProps, Snippet } from "svelte";
  import { Drawer as DrawerPrimitive } from "vaul-svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { pressable } from "#lib/components/ui/floating-presence.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import { IconClose } from "#lib/icons.js";
  import { frameSize } from "#lib/platform/frame-observer.js";
  import { mirror } from "#lib/platform/page-marks.js";
  import { visible } from "#lib/platform/visible-viewport.svelte.js";
  import type { WithoutChildrenOrChild } from "#lib/utils.js";
  import { cn } from "#lib/utils.js";
  import DrawerOverlay from "./drawer-overlay.svelte";
  import DrawerPortal from "./drawer-portal.svelte";
  import { holdStyle } from "./hold-style.js";
  import { sheetHeadVariants } from "./sheet-head.js";

  let {
    ref = $bindable(null),
    class: className,
    style,
    portalProps,
    hosted = false,
    contained = false,
    modal = true,
    pad,
    height,
    width,
    closed,
    look,
    title,
    titleHidden = false,
    ownHead = false,
    actions,
    restoreScrollDelay = 0,
    grabber,
    children,
    ...restProps
  }: WithoutChildrenOrChild<DrawerPrimitive.ContentProps> &
    DrawerContentLooks & {
      /**
       * The sheet's name. The kit draws the recipe's one header with it
       * (DESIGN.md, Drawer: the grabber, then Close and the title in the
       * title role), so no sheet
       * stands without a name or a way to put it away. A hosted sheet's
       * host draws its head and its Close; the name is read out only. A
       * name that changes morphs in place (MorphText, DESIGN.md, The Steady
       * Swap Rule).
       */
      title: string;
      /** The name read out but not drawn, on a sheet whose content names
          itself on screen; Close still leads the header. */
      titleHidden?: boolean;
      /** The content draws the sheet's one bar itself, right under the
          grabber, with its Close leading it (a BarItem in a glass group of
          its own, as the kit's header draws it): the kit reads the name out
          only. */
      ownHead?: boolean;
      /** The sheet's own controls in its header, at its trailing edge. */
      actions?: Snippet;
      portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DrawerPortal>>;
      /**
       * The sheet fills a host of its own (the preview standing on the
       * composer): the host places it, and the kit leaves its place alone.
       * It fills the host whole and draws no surface or grabber of its own
       * (the host draws both). Closed, it slides down on vaul's curve; a
       * holder that keeps it mounted while closed hides it (`closed`).
       */
      hosted?: boolean;
      /**
       * The sheet stands in a surface of its own, drawn in place there (its
       * portal off), its root's `container` the box it stands in: it fills
       * that box, so vaul's stops, measured on the container, are heights
       * over the surface's foot wherever the surface stands (a panel's well
       * on a desk, a phone's sheet at any of its stops). The kit does not
       * place it on the screen's visible area, and it keeps no safe area
       * clear: the surface's foot is not the screen's.
       */
      contained?: boolean;
      /** As its root's `modal`: false, the page under it stays live, to a screen reader too. */
      modal?: boolean;
      /**
       * The grabber is a control: a press steps the sheet to its next stop
       * (Apple HIG, Sheets: a tap on the grabber cycles its detents), its
       * area 44px to a finger. Without it the grabber is drawn only, and a
       * drag still moves the sheet.
       */
      grabber?: { label: string; onpress: () => void };
      children?: Snippet;
    } = $props();

  /**
   * A sheet whose root is `modal={false}` is not modal to a screen reader
   * either: its content says `aria-modal="false"`, held there through every
   * redraw. vaul-svelte (1.0.0-next.7) does not forward `modal` to bits-ui's
   * Dialog.Root, and bits-ui (2.20.3) writes `aria-modal="true"` on every
   * dialog's content: the gap React vaul closed in emilkowalski/vaul#580,
   * unreleased per #647. Delete this once vaul-svelte forwards `modal`.
   */
  $effect(() => {
    const node = ref;
    if (modal || !node) {
      return;
    }
    const hold = () => {
      if (node.getAttribute("aria-modal") !== "false") {
        node.setAttribute("aria-modal", "false");
      }
    };
    hold();
    const watch = new MutationObserver(hold);
    watch.observe(node, { attributeFilter: ["aria-modal"] });
    return () => watch.disconnect();
  });

  /**
   * What the sheet is, said for the page around it (page-marks): a bottom
   * sheet the kit places on the screen's foot is the bottom edge
   * (ScreenEdges).
   */
  $effect(() => {
    const node = ref;
    if (!node) {
      return;
    }
    return mirror(
      node,
      "root",
      "data-kit-sheet",
      ["data-placed", "data-vaul-drawer-direction"],
      (sheet) =>
        sheet.hasAttribute("data-placed") &&
        sheet.dataset.vaulDrawerDirection === "bottom"
          ? ["bottom"]
          : []
    );
  });

  /**
   * The visible area as the sheet's --visible-top and --visible-height,
   * from the one measurement of it (platform/visible-viewport); app.css places
   * a bottom sheet the kit marks `data-placed` on the visible area from the
   * two. They are written on the node one property at a time, never into
   * its `style` prop: a changed style attribute is written whole, so each
   * step of the keyboard closing dropped the transform vaul writes on the
   * node while a finger drags it, and the sheet jumped. A redraw of the
   * attribute (vaul's own snap-point height as the window changes) takes
   * them with it, so they are written again whenever the attribute changes.
   */
  $effect(() => {
    const node = ref;
    if (!node || hosted || contained) {
      return;
    }
    const placed = visible.height > 0;
    return holdStyle(node, {
      "--visible-top": placed ? `${visible.top}px` : null,
      "--visible-height": placed ? `${visible.height}px` : null,
    });
  });

  const head = sheetHeadVariants();

  /**
   * The kit's head floats over the content (DESIGN.md, The Title Bars
   * Follow Liquid Glass Rule; SideSurface's head is the pattern): the
   * grabber and the header are one stack laid over the surface's top, and the content runs to that top under it. The
   * stack's height is the sheet's `--sheet-room`, which the content's
   * scroller takes as its top padding (`scroller` in the kit's index), so its first
   * line clears the head at rest, and names the scroll timeline the head's
   * scroll edge effect plays on (`scroll-timeline-transcript-head`,
   * HeadFade under the stack), so scrolled it blurs and fades beneath it.
   * Content that keeps a band still over its scroller (a search field, a
   * figure) starts under the room instead (`pt-(--sheet-room)`). A sheet
   * whose host or content draws its head (`hosted`, `ownHead`) draws none
   * of this.
   */
  const floats = $derived(!(hosted || ownHead));
  let room = $state(0);
  $effect(() => {
    const node = ref;
    if (!(node && floats)) {
      return;
    }
    return holdStyle(node, { "--sheet-room": `${room}px` });
  });
</script>

<DrawerPortal {...portalProps}>
  <DrawerOverlay />
  <!-- The surface is drawn on ::before, inset from the sheet's box. A bottom
       sheet's is full-bleed: edge to edge and flush on the screen's foot,
       its corners rounded and its hairline drawn along the top edge only.
       Its foot keeps the safe area clear, the same for every sheet. Under
       reduced motion it fades in and out over --dur-control instead of
       sliding (DESIGN.md, Sheet: "with reduced motion it fades over
       120ms"); vaul's slide stands in the `vendor` layer under it
       (vite.config.ts, vendorComponentSheets). -->
  <DrawerPrimitive.Content
    class={cn(
      "motion-reduce:sheet-fade group/drawer-content fixed z-(--layer-float) flex h-auto flex-col bg-transparent p-4 text-ink-strong text-label before:absolute before:inset-2 before:-z-1 before:rounded-lg before:border before:border-border before:bg-surface-raised data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=left]:phone:max-w-96 data-[vaul-drawer-direction=right]:phone:max-w-96 data-[vaul-drawer-direction=bottom]:pb-[calc(--spacing(4)+var(--safe-bottom))] data-[vaul-drawer-direction=bottom]:before:inset-x-0 data-[vaul-drawer-direction=bottom]:before:bottom-0 data-[vaul-drawer-direction=bottom]:before:rounded-b-none data-[vaul-drawer-direction=bottom]:before:border-x-0 data-[vaul-drawer-direction=bottom]:before:border-b-0",
      drawerContentVariants({ pad, height, width, closed, look }),
      hosted &&
        "absolute inset-0 z-1 m-0 h-full max-h-none w-full p-0 outline-off before:hidden data-[vaul-drawer-direction=bottom]:pb-0",
      contained &&
        "absolute inset-x-0 top-0 h-full max-h-none data-[vaul-drawer-direction=bottom]:pb-0",
      /* Floating its head, the content starts at the surface's top, inside
         its 1px edge (the surface `inset-2` and its hairline), so what
         scrolls runs beneath the head and never over that edge. */
      floats && "timeline-scope-transcript-head pt-[calc(--spacing(2)+1px)]",
      className
    )}
    data-placed={hosted || contained ? undefined : ""}
    data-safe-bottom
    data-slot="drawer-content"
    {restoreScrollDelay}
    {style}
    bind:ref
    {...restProps}
  >
    <!-- Drawn through `child` (vaul-svelte patched to hand it on): bits-ui
         then holds the body's lock only while the sheet is open, and lets it
         go at once; closing, the sheet lets presses through to the page
         (floating-presence `pressable`). -->
    {#snippet child({ props, open })}
      <div {...props} style:pointer-events={pressable(open)}>
        {@render body()}
      </div>
    {/snippet}
  </DrawerPrimitive.Content>
</DrawerPortal>

{#snippet grabbed()}
  {#if grabber}
    <!-- The grabber's own box is the press: its pill drawn inside it, the
         area round it the touch rule's. A finger's or a mouse's press on it
         is also vaul's release of the sheet: its pointerup sets
         `isReleasing` until the next tick (use-drawer-root.svelte.js:367),
         and a stop asked for inside that window is dropped
         (use-snap-points.svelte.js:115, `if (!activeSnapPoint.current ||
         releasing) return;`), so the sheet lagged a stop behind every tap.
         The step is taken a task later, once the release has settled, as
         vaul's own Handle takes its cycle (use-drawer-handle.svelte.js,
         `handleStartCycle`). Under a finger it stands `space-4` clear of
         the head row under it, so that row's 28px controls (the design
         graph's faces) reach their 44px at the midpoint between them: a
         `space-1` there stopped them at 39.5px (graph-stage r524). -->
    <button
      type="button"
      aria-label={grabber.label}
      data-slot="drawer-grabber"
      class="touch-hit mx-auto mt-space-2 mb-space-1 coarse:mb-space-4 hidden h-space-5 w-c-grabber-w shrink-0 place-items-center rounded-pill group-data-[vaul-drawer-direction=bottom]/drawer-content:grid"
      onclick={() => {
        setTimeout(grabber.onpress);
      }}
    >
      <span aria-hidden="true" class={cn(grabberVariants(), "my-0")}></span>
    </button>
  {:else}
    <div
      data-slot="drawer-grabber"
      class={cn(
        grabberVariants(),
        "hidden group-data-[vaul-drawer-direction=bottom]/drawer-content:block"
      )}
    ></div>
  {/if}
{/snippet}

{#snippet body()}
  {#if floats}
    <!-- The scroll edge effect under the head (HeadFade, as SideSurface
         draws it): what scrolls beneath the stack blurs and fades into the
         surface, from the first scroll, clear at rest. Held inside the
         surface's edge and corners, which the box around it overhangs. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-x-[calc(--spacing(2)+1px)] top-[calc(--spacing(2)+1px)] z-1 h-(--sheet-room) overflow-clip rounded-t-[calc(var(--radius-lg)-1px)] group-data-[vaul-drawer-direction=bottom]/drawer-content:inset-x-0"
      data-slot="drawer-head-fade"
    >
      <HeadFade band="var(--sheet-room)" tint="bg-surface-raised" />
    </div>
    <!-- The grabber and the header, one stack over
         the content (`absolute z-2`), its height the sheet's room. -->
    <div
      class="absolute inset-x-0 top-[calc(--spacing(2)+1px)] z-2 flex flex-col px-4 pt-[calc(--spacing(2)-1px)]"
      data-slot="drawer-head"
      {@attach frameSize(
        (node: HTMLElement) => node.offsetHeight,
        (value) => {
          room = value;
        }
      )}
    >
      {@render grabbed()}
      <div class={head.head()} data-slot="drawer-header">
        <!-- Close leads, before the title, a bare symbol in a glass group of
             its own (DESIGN.md, Sheet; HIG, Sheets: a single-view sheet's
             Cancel on the leading edge of its top toolbar; Toolbars: "Group …
             critical actions like Done, Close, or Save in dedicated …
             sections"). -->
        <BarGlass form="group">
          <DrawerPrimitive.Close>
            {#snippet child({ props })}
              <BarItem icon={IconClose} label={commonWords.close} {props} />
            {/snippet}
          </DrawerPrimitive.Close>
        </BarGlass>
        <DrawerPrimitive.Title
          class={cn(head.title(), "me-auto", titleHidden && "sr-only")}
          data-slot="drawer-title"
          ><MorphText text={title} wrap /></DrawerPrimitive.Title
        >
        {#if actions}
          <div class="flex flex-none items-center gap-space-2">
            {@render actions()}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    {#if !hosted}
      {@render grabbed()}
    {/if}
    <DrawerPrimitive.Title class="sr-only" data-slot="drawer-title"
      ><MorphText text={title} wrap /></DrawerPrimitive.Title
    >
  {/if}
  <!-- vaul takes pointer capture on every press in the sheet, which leaves
         a text field without iOS's hold-to-select and Paste callout: a press
         that starts in a field never reaches it. -->
  <div
    class="contents"
    onpointerdown={(event) => {
      if (
        event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable]")
      ) {
        event.stopPropagation();
      }
    }}
    role="presentation"
  >
    {@render children?.()}
  </div>
{/snippet}
