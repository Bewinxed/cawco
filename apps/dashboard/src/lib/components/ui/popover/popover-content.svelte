<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /**
   * The floating surface (DESIGN.md, "Popover, dropdown, select, context
   * menu, toast"): 12px radius, 1px control edge, overlay shadow, 6px
   * padding, raised surface; every kit popover, menu, submenu and select
   * wears it, and HangCard's cards.
   *
   * `pop` (DESIGN.md, Motion (origin-aware)): it opens from its trigger's
   * side (`--kit-rise`, by bits-ui's `data-side`) over --dur-pop on the
   * drawer curve, rising --pop-rise and growing from --pop-scale as it fades
   * in from its @starting-style (which iOS 27.2 Safari applies to a surface
   * just added: probe-kit ios-safari-motion, 2026-10-23), and leaves the
   * same way over --dur-exit.
   * Transitions on `data-state`, so a close caught mid-open turns back from
   * where it is; bits-ui holds it mounted until they end (getAnimations()).
   * It grows from its trigger through bits' transform-origin, which each
   * kit content sets. With reduced motion only the fade runs.
   *
   * `hang`: a card that hangs from its anchor opens and closes on its own
   * clock (motion/hang, HangCard); with reduced motion the kit's fade runs.
   */
  /**
   * The `pop` motion alone, for a surface that wears its own look but opens
   * as every kit popover does (PinFloat's comment card, from its pill):
   * `data-state="open"` and the side of its anchor it stands on as
   * `data-side` (`top`, `right`, `bottom`, `left`), its origin set at its
   * anchor; it leaves by `popOut` with the same side.
   */
  export const popMotion =
    "transition-opacity duration-(--dur-pop) ease-drawer [--kit-rise:0_calc(-1*var(--pop-rise))] side-left:[--kit-rise:var(--pop-rise)_0] side-right:[--kit-rise:calc(-1*var(--pop-rise))_0] side-top:[--kit-rise:0_var(--pop-rise)] data-closed:opacity-0 starting:data-open:opacity-0 data-closed:duration-(--dur-exit) motion-safe:data-closed:scale-(--pop-scale) motion-safe:starting:data-open:scale-(--pop-scale) motion-safe:[transition-property:opacity,translate,scale] motion-safe:data-closed:[translate:var(--kit-rise)] motion-safe:starting:data-open:[translate:var(--kit-rise)]";

  export const floatingSurface = tv({
    base: "rounded-lg concentric-in r-outer-lg border border-border-control bg-surface-raised p-c-floating-pad text-ink-strong shadow-overlay",
    variants: {
      motion: {
        pop: popMotion,
        hang: "motion-reduce:transition-opacity motion-reduce:duration-(--dur-pop) motion-reduce:ease-drawer motion-reduce:data-closed:opacity-0 motion-reduce:starting:data-open:opacity-0 motion-reduce:data-closed:duration-(--dur-exit)",
      },
      /**
       * Where its edge is drawn, for its rows' concentric radius
       * (design.css `concentric-in`): its own 1px border, so the rows stand
       * the edge and the pad in; or drawn inside its box over the pad
       * (HangCard's `::after`), so they stand the pad in.
       */
      edge: {
        own: "r-inset-c-inset-floating",
        drawn: "r-inset-c-floating-pad",
      },
    },
    defaultVariants: { motion: "pop", edge: "own" },
  });

  export type FloatingSurfaceLooks = VariantProps<typeof floatingSurface>;

  /** Its callers' looks, each as they drew it: its width (the kit's, or the
      room its site gives, `--pop-w`), a capped height (the kit's, or the
      room its site measures, `--pop-max-h`), what it does with more than it
      holds (scrolls, or clips what scrolls inside it), its padding and the
      gap between what it holds, a card's frame, and the New Session form's
      look: the form's theme, recessed under its raised body as the dialog's
      card is (spawn/NewSessionPopover). */
  export const popoverContentVariants = tv({
    variants: {
      width: {
        narrow: "w-64",
        wide: "w-80",
        widest: "w-96",
        room: "w-(--pop-w)",
      },
      height: { capped: "max-h-80", room: "max-h-(--pop-max-h)" },
      overflow: {
        scroll: "overflow-y-auto overscroll-contain",
        clip: "overflow-hidden",
      },
      pad: { none: "p-0", inset: "p-space-2", form: "p-3" },
      gap: {
        none: "gap-0",
        tight: "gap-space-1",
        snug: "gap-space-2",
        form: "gap-3",
      },
      frame: {
        panel: "rounded-lg shadow-lg",
        "panel-high": "rounded-lg shadow-xl",
        raised: "shadow-raised",
      },
      look: { "new-session": "ns-theme bg-surface-recess" },
    },
  });

  export type PopoverContentLooks = VariantProps<typeof popoverContentVariants>;
</script>

<script lang="ts">
  import { Popover as PopoverPrimitive } from "bits-ui";
  import { type ComponentProps, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { numberOf } from "#lib/cawco/motion/curves.svelte.js";
  import { type Morph, morph } from "#lib/cawco/motion/morph.svelte.js";
  import {
    drawn,
    own,
    pressable,
    pressedAway,
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
    ownWidth = false,
    width,
    height,
    overflow,
    pad,
    gap,
    frame,
    look,
    motion,
    forceMount = false,
    trapFocus = false,
    onInteractOutside,
    onCloseAutoFocus,
    child: callerChild,
    children,
    ...restProps
  }: PopoverPrimitive.ContentProps &
    PopoverContentLooks &
    FloatingSurfaceLooks & {
      portalProps?: WithoutChildrenOrChild<
        ComponentProps<typeof PopoverPortal>
      >;
      /** How it tweens to a new size (motion/morph): across too, or held still. */
      morphs?: Morph;
      /** It draws no surface (padding, edge, fill, shadow): what it holds is the surface. */
      bare?: boolean;
      /**
       * Its site sizes it to a room narrower than the screen, under the
       * phone line too, where the viewport's width would be wrong: the
       * Comments panel (the well less its gutters), the sessions flyover
       * (its anchor row's width). A popover hung from the screen leaves it
       * off (DESIGN.md, Breakpoints: "popovers widen to the viewport less
       * 24px").
       */
      ownWidth?: boolean;
    } = $props();

  // Never flush with the screen's edge: it keeps the pages' gutter from it,
  // pushed back in when its place would run it off. Under the phone line it
  // is the viewport less the screen's margin each side (DESIGN.md,
  // Breakpoints: "popovers widen to the viewport less 24px"), so it stands
  // that margin in. The tokens are read in the browser, where it opens.
  const phone = new MediaQuery("width < 640px");
  const inset = $derived(
    collisionPadding ??
      (browser
        ? numberOf(phone.current ? "--c-screen-margin" : "--space-5")
        : 0)
  );
  /* A hanging card (motion `hang`) frames its own width, a bare one is what
     it holds, and an `ownWidth` site sizes it to its own room. */
  const phoneWide = $derived(motion !== "hang" && !bare && !ownWidth);

  /* A popover is not modal: the page beside it keeps its presses and its
     focus. It traps the focus only where its site asks (`trapFocus`), and a
     press outside closes it, leaving the focus where that press put it
     (floating-presence `pressedAway`). */
  const away = pressedAway({
    content: () => ref,
    onInteractOutside: () => onInteractOutside,
    onCloseAutoFocus: () => onCloseAutoFocus,
  });

  // A popover whose content changes (a list arrives, an error appears)
  // tweens to its new height instead of jumping: once it has come in. What
  // settles in it while it comes in (a list read the frame after it opens)
  // is part of that one entrance (its @starting-style fade), never a size
  // tween a frame behind it. A site that draws its own surface (`child`,
  // HangCard) or a card that hangs has no such fade here, and tweens from
  // the first.
  // How it morphs is set once, by its site.
  const resize = morph(untrack(() => morphs));
  let entered = $state(false);
  const tweens = $derived(entered || !!callerChild || motion === "hang");

  /** Each open's surface: it has come in once its own opacity transition ends. */
  function comesIn(node: HTMLElement) {
    entered = false;
    const done = (event: TransitionEvent) => {
      if (event.target === node && event.propertyName === "opacity") {
        entered = true;
      }
    };
    node.addEventListener("transitionend", done);
    node.addEventListener("transitioncancel", done);
    return () => {
      node.removeEventListener("transitionend", done);
      node.removeEventListener("transitioncancel", done);
    };
  }
  $effect(() => {
    if (ref && tweens) {
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
      floatingSurface({ motion }),
      "z-(--layer-float) flex w-72 origin-(--bits-popover-content-transform-origin) flex-col gap-4 text-label outline-hidden",
      bare &&
        "border-current border-none bg-none bg-transparent p-0 shadow-none",
      popoverContentVariants({
        width,
        height,
        overflow,
        pad,
        gap,
        frame,
        look,
      }),
      className,
      /* Its least and greatest width both, so whatever width its site
         gives (a width of its own, or the room bits-ui measures) stands at
         this one under the phone line. */
      phoneWide &&
        "max-phone:min-w-[calc(100vw-2*var(--c-screen-margin))] max-phone:max-w-[calc(100vw-2*var(--c-screen-margin))]"
    )}
    collisionPadding={inset}
    data-slot="popover-content"
    forceMount
    onCloseAutoFocus={away.onCloseAutoFocus}
    onInteractOutside={away.onInteractOutside}
    {sideOffset}
    {trapFocus}
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
              {@attach comesIn}
            >
              {@render children?.()}
            </div>
          </div>
        {/if}
      {/if}
    {/snippet}
  </PopoverPrimitive.Content>
</PopoverPortal>
