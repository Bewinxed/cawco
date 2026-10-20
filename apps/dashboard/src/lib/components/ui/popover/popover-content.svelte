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
   * in from its @starting-style, and leaves the same way over --dur-exit.
   * Transitions on `data-state`, so a close caught mid-open turns back from
   * where it is; bits-ui holds it mounted until they end (getAnimations()).
   * It grows from its trigger through bits' transform-origin, which each
   * kit content sets. With reduced motion only the fade runs.
   *
   * `hang`: a card that hangs from its anchor opens and closes on its own
   * clock (motion/hang, HangCard); with reduced motion the kit's fade runs.
   */
  export const floatingSurface = tv({
    base: "rounded-lg border border-border-control bg-surface-raised p-1.5 text-ink-strong shadow-overlay",
    variants: {
      motion: {
        pop: "transition-opacity duration-(--dur-pop) ease-drawer [--kit-rise:0_calc(-1*var(--pop-rise))] side-left:[--kit-rise:var(--pop-rise)_0] side-right:[--kit-rise:calc(-1*var(--pop-rise))_0] side-top:[--kit-rise:0_var(--pop-rise)] data-closed:opacity-0 starting:data-open:opacity-0 data-closed:duration-(--dur-exit) motion-safe:data-closed:scale-(--pop-scale) motion-safe:starting:data-open:scale-(--pop-scale) motion-safe:[transition-property:opacity,translate,scale] motion-safe:data-closed:[translate:var(--kit-rise)] motion-safe:starting:data-open:[translate:var(--kit-rise)]",
        hang: "motion-reduce:transition-opacity motion-reduce:duration-(--dur-pop) motion-reduce:ease-drawer motion-reduce:data-closed:opacity-0 motion-reduce:starting:data-open:opacity-0 motion-reduce:data-closed:duration-(--dur-exit)",
      },
    },
    defaultVariants: { motion: "pop" },
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
    width,
    height,
    overflow,
    pad,
    gap,
    frame,
    look,
    motion,
    forceMount = false,
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
