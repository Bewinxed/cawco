<script lang="ts" module>
  import { tv } from "#lib/utils.js";

  /**
   * The hanging card's recipe, over the kit's floating surface
   * (`floatingSurface`, motion `hang`).
   *
   * Its surface is named (`--hang-surface`) so the cut across its top edge
   * is drawn in it; a card on another surface sets that, not `background`
   * (`surface`). What runs on through the cut (`--hang-neck`) is the card's
   * own surface. Its edge is drawn by `::after` rather than its border, so
   * its top can be cut across the anchor's span and its flared foot
   * (`--neck-start`, `--neck-end`, `--neck-flare-start`, `--neck-flare-end`,
   * in the card's own coordinates, written from `hang`); on a flush side
   * (`data-flush`) its top corner is square and the cut stops one pixel
   * short, so the anchor's flank runs straight on into the card's side. The
   * cut (`::before`) is the card's top edge row drawn again in the neck's
   * surface, clipped from the flare's outer circle (`--neck-cut`, written by
   * hang's `setNeck`), so the anchor's curve runs on into the card's edge as
   * one stroke. A clip, not a mask: a mask drew the whole card's edge
   * through a buffer of its own on every paint. Its overlay shadow is cut at
   * its top edge (room for the whole shadow past the other three), so none
   * falls on the anchor.
   *
   * `tab`: one silhouette with its folder tab (motion/hang-shape): no edge,
   * cut or shadow of its own (the outline layer, hang-outline, draws them),
   * cut to nothing shut and grown out of the tab's foot, never sliding.
   * Otherwise it is shut up past its own height by the reach of its shadow
   * under it (`--hang-reach`) until `hang` says it is shown, and keeps its
   * own layer while mounted: WebKit gave the card one for its slide alone
   * and repainted it whole in the frame the slide landed in.
   *
   * `glass`: from the top bar's glass. Its shadow is the picture the Shell
   * draws once (motion/hung-shadow) as its border-image, under its own
   * surface (the `hung-surface` element), not a box-shadow; on a phone its
   * trailing side is the screen's edge, square with no edge drawn there.
   * A phone is the `shell` container under the desk line (`@max-desk/shell`,
   * as BarGlass reads it), never the window's: the card stands inside the
   * shell it hangs in, so it takes its form from that shell's width in the
   * app, in a canvas frame and in an embed alike.
   *
   * A card rehearsing its next face (GlassCard's `data-rehearsing`) is laid
   * out unseen.
   */
  export const hangCardVariants = tv({
    base: "relative border-0 bg-(--hang-surface) [--hang-neck:var(--hang-surface)] [--hang-surface:var(--surface-raised)] [clip-path:inset(0_-120px_-120px_round_0_0_var(--radius-lg)_var(--radius-lg))] before:pointer-events-none before:absolute before:top-0 before:left-(--gap-from) before:z-2 before:h-px before:w-[calc(var(--gap-to)-var(--gap-from))] before:bg-(--hang-neck) after:pointer-events-none after:absolute after:inset-0 after:z-1 after:rounded-[inherit] after:border after:border-border-control data-[rehearsing]:invisible data-[flush=start]:rounded-ss-none data-[flush=end]:rounded-se-none before:[--gap-from:calc(var(--neck-start)-var(--neck-flare-start,0px))] before:[--gap-to:calc(var(--neck-end)+var(--neck-flare-end,0px))] before:[clip-path:var(--neck-cut,none)] data-[flush=end]:before:[--gap-to:calc(var(--neck-end)-1px)] data-[flush=start]:before:[--gap-from:1px]",
    variants: {
      tab: {
        true: "translate-none shadow-none will-change-auto [clip-path:path('M_0_0_Z')] before:hidden after:hidden",
        false:
          "motion-safe:will-change-[translate] motion-safe:not-data-[shown]:[translate:0_calc(-100%-var(--hang-reach,0px))]",
      },
      glass: {
        true: "@max-desk/shell:rounded-ee-none shadow-none @max-desk/shell:after:border-e-0",
      },
      /** The tab's menu hangs on the tab's own surface, as the session card's head is. */
      surface: { recess: "[--hang-surface:var(--surface-recess)]" },
    },
    defaultVariants: { tab: false },
  });
</script>

<script lang="ts">
  /**
   * A card that hangs from its anchor as one shape with it (DESIGN.md, "A
   * card that hangs from its anchor"): Caw's panel, the machines and the
   * Jump palette from the top bar's glass, the session card and a finger's
   * tab menu from their tab. The iOS app's HangCard draws the same card.
   *
   * It is a kit floating surface (the popover by default, or the context
   * menu's: `as`), so focus, Escape and a press outside are the primitive's.
   * It stands on its anchor's foot (the site gives the primitive side
   * `bottom` at its offset) and wears `hangCardVariants`: its edge drawn
   * inside its box, its top cut across the anchor's span and the anchor's
   * flared foot each side of it (the neck), square on a side it stands flush
   * with. It opens and closes on `hang` (motion/hang): a slide down out of
   * the foot from behind a cut that never moves, translate alone,
   * interruptible, a fade under Reduce Motion.
   *
   * The neck is measured here, from where the primitive places the card:
   * the anchor's span in the card's coordinates, and on each side the
   * anchor's `--flare` where the card reaches past the anchor's edge, none
   * where its edge meets the anchor's (flush, within a pixel). The anchor's
   * box is read as it is laid out anew (its size, the window's, a scroll),
   * never in a placement, where a read made the page lay itself out again
   * then and there.
   *
   * The anchor draws its own foot while the card stands drawn out of it
   * (`joined`): Caw's glass its `.join`, a tab its `.neck`.
   *
   * A card on the bar's glass (`glass`) wears the hung shadow, the picture
   * of `--shadow-overlay-hung` the Shell draws once (motion/hung-shadow),
   * over its own surface (`hung-surface`), and on a phone its trailing side
   * is the screen's edge, as the glass's is. It is drawn where it is
   * mounted, never portaled, so it stands in the `shell` container its site
   * gives it (the Shell's layer, a states frame's) and takes its form from
   * that shell's width.
   */
  import type {
    ContextMenu as ContextMenuPrimitive,
    Popover as PopoverPrimitive,
  } from "bits-ui";
  import { type Snippet, untrack } from "svelte";
  import {
    hang,
    type Neck,
    regrow,
    sameNeck,
    setNeck,
  } from "#lib/cawco/motion/hang.js";
  import {
    type HangGeometry,
    hangAt,
    hangClip,
  } from "#lib/cawco/motion/hang-shape.js";
  import type { Morph } from "#lib/cawco/motion/morph.svelte.js";
  import ContextMenuContent from "#lib/components/ui/context-menu/context-menu-content.svelte";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import PopoverContent, {
    floatingSurface,
  } from "#lib/components/ui/popover/popover-content.svelte";
  import { cn } from "#lib/utils.js";
  import { outlineLayer } from "./hang-outline.js";

  /** The glass card's faces (GlassCard's `Card`), and the session card. */
  type Frame = "caw" | "machines" | "jump" | "files" | "details";
  /**
   * Each face's frame, read off what its custom properties hold (on the card,
   * below): Caw's panel `c-panel-w` wide with its rows `--space-2` in; the
   * machines `c-machines-w`; Jump `c-find-w` wide and its foot clear of the
   * screen's, a full sheet on a phone; Files as Caw's panel, its rows
   * `--space-2` in, as tall as what it holds up to his panel's height or the
   * room under the glass. Each stands `c-pop-edge` in from the screen's edge
   * on either side (DESIGN.md, Breakpoints: popovers widen to the viewport
   * less 24px); on a phone each keeps the bar's `c-bar-phone-edge` on its
   * leading side (the `glass` recipe squares the trailing one). The screen
   * is the `shell` container the card stands in (Shell's, or a states
   * frame's): its width `100cqi` and its phone `@max-desk/shell`, so a
   * frame of a phone's width draws the phone's card on a desk's page.
   *
   * The session card (`details`, PaneTabs) holds its own head and body to
   * its edge and scrolls inside them: no padding, its overflow clipped and
   * contained, never taller than its cap or the room bits-ui measures under
   * its tab, and on a phone than the screen under the bar less its margins
   * and the safe area. Its screen is the hang layer it is portaled into
   * (hang-layer): a phone is that `shell` container under the phone line
   * (`@max-phone/shell`), and its height the layer's `--shell-h`.
   */
  const FRAMES: Record<Frame, string> = {
    caw: "w-(--frame-w) @max-desk/shell:w-(--frame-w-narrow) gap-0 p-space-2",
    machines: "w-(--frame-w) gap-0",
    jump: "w-(--frame-w) max-h-(--frame-h) gap-0 p-0 @max-desk/shell:h-(--frame-h) @max-desk/shell:w-(--frame-w-narrow)",
    files: "flex w-(--frame-w) max-h-(--frame-h) flex-col gap-0 p-space-2",
    details:
      "flex max-h-[min(var(--c-details-card-max-h),var(--bits-popover-content-available-height,var(--c-sheet-max-h)))] overflow-hidden overscroll-contain p-0 @max-phone/shell:max-h-[min(calc(var(--shell-h)-var(--c-top-bar-h)-2*var(--c-screen-margin)-var(--safe-bottom)),var(--bits-popover-content-available-height,var(--c-sheet-max-h)))]",
  };
  /** The shell less a floating card's edge each side. */
  const ROOM = "calc(100cqi - 2 * var(--c-screen-margin))";
  /** The shell less the phone bar's leading edge and the trailing safe area. */
  const ROOM_NARROW =
    "calc(100cqi - var(--c-bar-phone-edge) - env(safe-area-inset-right, 0px))";
  /** The numbers each face's frame reads (`--frame-w`, `--frame-w-narrow`, `--frame-h`). */
  const FRAME_SIZES: Record<
    Frame,
    { w?: string; narrow?: string; h?: string }
  > = {
    caw: {
      w: `min(var(--c-panel-w), ${ROOM})`,
      narrow: `min(var(--c-panel-w), ${ROOM_NARROW})`,
    },
    machines: { w: `min(var(--c-machines-w), ${ROOM})` },
    jump: {
      w: `min(var(--c-find-w), ${ROOM})`,
      narrow: ROOM_NARROW,
      h: "calc(100dvh - var(--c-top-bar-h) - var(--space-7))",
    },
    files: {
      w: `min(var(--c-panel-w), ${ROOM})`,
      h: "min(var(--c-caw-panel-h), calc(var(--bits-popover-content-available-height, 85dvh) - 2px))",
    },
    details: {},
  };

  type Props = Omit<
    PopoverPrimitive.ContentProps & ContextMenuPrimitive.ContentProps,
    "child" | "children"
  > & {
    /** What it hangs from. */
    anchor: HTMLElement | null;
    /** The kit surface it is: the popover's (default), bits-ui's own, or the context menu's. */
    as?:
      | typeof PopoverContent
      | typeof PopoverPrimitive.Content
      | typeof ContextMenuContent;
    /** The anchor's foot flares out into the card (a chosen tab's does; another's meets it square). */
    flared?: boolean;
    /** It hangs from the top bar's glass. */
    glass?: boolean;
    /** Drawn where it is mounted, never portaled: inside the frame or panel that holds it (a glass card always is). */
    inPlace?: boolean;
    /**
     * The face it frames: the glass card's (GlassCard: Caw's panel, the
     * machines, Jump or Files, each its own width, padding and height), or
     * the session card's (`details`).
     */
    frame?: Frame;
    /** The surface it stands on, when not the raised one: the tab's menu, on its tab's. */
    surface?: "recess";
    /**
     * It hangs from a folder tab (the session card, the tab's menu): one
     * silhouette with it, grown out of its foot (motion/hang-shape,
     * hang-outline).
     */
    tab?: boolean;
    /** It stands drawn out of its anchor: the anchor draws its foot. */
    joined?: boolean;
    /** The neck where the card stands, on every placement. */
    onneck?: (neck: Neck) => void;
    /** A finger is drawing it out of its anchor, which is its open: nothing plays. */
    held?: () => boolean;
    /** A finger folded it into its anchor: it is shut, with nothing left to play. */
    folded?: () => boolean;
    /** How the popover's box tweens to a new size (motion/morph): the popover's own `as` only. */
    morphs?: Morph;
    children: Snippet;
  };

  let {
    anchor,
    as: Content = PopoverContent,
    flared = true,
    glass = false,
    inPlace = false,
    frame,
    surface,
    tab = false,
    joined = $bindable(false),
    ref = $bindable(null),
    onneck,
    held,
    folded,
    forceMount = false,
    class: className,
    children,
    ...rest
  }: Props = $props();

  /** The kit's own surface (the popover's or the context menu's), not bits-ui's bare one. */
  const kitSurface = $derived(
    Content === PopoverContent || Content === ContextMenuContent
  );

  /** The anchor's span on the screen and its flare; re-read once it may have moved. */
  let span: { left: number; right: number; flare: number } | null = null;
  let moved = true;
  function read(at: HTMLElement) {
    const box = at.getBoundingClientRect();
    span = {
      left: box.left,
      right: box.right,
      flare:
        Number.parseFloat(getComputedStyle(at).getPropertyValue("--flare")) ||
        0,
    };
    moved = false;
  }
  $effect(() => {
    const at = anchor;
    if (!at) {
      span = null;
      return;
    }
    read(at);
    // A card that keeps its x while the anchor grows (the glass's trailing
    // card) gets no placement and no resize of its own: its neck is drawn
    // again from the new span here.
    // biome-ignore lint/style/noRestrictedGlobals: draws the neck only (custom properties, a corner radius, an absolutely placed cut), which resize no box watched; the neck follows its anchor in the frame the anchor grew
    const sized = new ResizeObserver(() => {
      read(at);
      if (card && placedAt !== null) {
        const neck = neckAt(card, placedAt, flared);
        if (neck) {
          draw(card, neck);
        }
      }
    });
    sized.observe(at);
    const away = () => {
      moved = true;
    };
    const options = { capture: true, passive: true } as const;
    addEventListener("resize", away);
    addEventListener("scroll", away, options);
    return () => {
      sized.disconnect();
      removeEventListener("resize", away);
      removeEventListener("scroll", away, options);
    };
  });

  /** The card's width, kept by its own observer. */
  let width = 0;
  /** Where the card's left edge stood at its last placement. */
  let placedAt: number | null = null;
  /** The neck last written onto the card. */
  let drawnNeck: Neck | null = null;

  function neckAt(
    node: HTMLElement,
    left: number,
    flaring: boolean
  ): Neck | null {
    const at = anchor;
    if (!at) {
      return null;
    }
    if (moved || !span) {
      read(at);
    }
    if (!span) {
      return null;
    }
    const across = width || node.offsetWidth;
    const right = left + across;
    const flare = flaring ? span.flare : 0;
    const flushStart = Math.abs(left - span.left) <= 1;
    const flushEnd = Math.abs(right - span.right) <= 1;
    let flush: Neck["flush"] = null;
    if (flushStart) {
      flush = "start";
    } else if (flushEnd) {
      flush = "end";
    }
    // The cut lies on the card's own top edge: the anchor's span as far as
    // it is over the card, and a flare as far as the card reaches past the
    // anchor's edge. A card standing anywhere but under it (Caw's panel shut
    // at the screen's leading margin, the glass at its trailing edge) had a
    // cut running on past its own side, to the glass and a flare beyond, and
    // the page scrolled sideways by it.
    const start = Math.min(Math.max(span.left - left, 0), across);
    const end = Math.min(Math.max(span.right - left, start), across);
    return {
      start,
      end,
      flareStart: flushStart ? 0 : Math.min(flare, start),
      flareEnd: flushEnd ? 0 : Math.min(flare, across - end),
      flush,
    };
  }

  /**
   * Writes the neck onto the card's own style, which costs a style change
   * and no render of the primitive's props; again whenever the primitive
   * wrote the style attribute over it.
   */
  function draw(node: HTMLElement, neck: Neck) {
    const standing =
      drawnNeck !== null &&
      sameNeck(neck, drawnNeck) &&
      node.style.getPropertyValue("--neck-start") === `${neck.start}px`;
    if (!standing) {
      setNeck(node, neck);
      if (neck.flush) {
        node.dataset.flush = neck.flush;
      } else {
        delete node.dataset.flush;
      }
      drawnNeck = neck;
    }
    onneck?.(neck);
  }

  /**
   * The tab a tab's hang hangs from: its anchor, or the last one it had
   * while it folds back into it (a site lets its anchor go as it closes, the
   * tab's menu does).
   */
  let lastAnchor: HTMLElement | null = null;
  const tabOf = () => {
    if (anchor) {
      lastAnchor = anchor;
    }
    return anchor ?? lastAnchor;
  };

  /**
   * The silhouette a tab's hang (`tab`) is one shape with its tab in, where
   * it stands now: the tab's own box and fold measures, the card's box, the
   * sides it stands flush on (within a pixel of the tab's flank).
   */
  function shapeOf(node: HTMLElement): HangGeometry | null {
    const at = tabOf();
    if (!at) {
      return null;
    }
    const ff = at.querySelector<HTMLElement>('[data-slot="ff-tab"]') ?? at;
    const t = ff.getBoundingClientRect();
    const style = getComputedStyle(ff);
    const px = (name: string) =>
      Number.parseFloat(style.getPropertyValue(name)) || 0;
    const c = node.getBoundingClientRect();
    return {
      box: {
        width: t.width,
        height: t.height,
        flare: px("--flare"),
        radius: px("--radius"),
        slopeStart: px("--slope-start"),
        slopeEnd: px("--slope-end"),
      },
      corner: Number.parseFloat(getComputedStyle(node).borderBottomLeftRadius),
      flush: {
        start: Math.abs(c.left - t.left) <= 1,
        end: Math.abs(c.right - t.right) <= 1,
      },
      hang: { left: c.left, right: c.right, height: c.bottom - t.bottom },
      tab: { left: t.left, right: t.right, top: t.top, bottom: t.bottom },
    };
  }

  const hung = (node: HTMLElement) => {
    const layer = tab ? outlineLayer(node) : null;
    /** A tab's hang drawn `p` of the way out: its surface cut to the silhouette, the outline drawn over both. */
    const grow = (p: number) => {
      const shape = layer ? shapeOf(node) : null;
      if (!(layer && shape)) {
        return;
      }
      const now = hangAt(shape, p);
      const box = node.getBoundingClientRect();
      node.style.clipPath = `path("${hangClip(now, { x: box.left, y: box.top })}")`;
      const ff = tabOf()?.querySelector<HTMLElement>('[data-slot="ff-tab"]');
      layer.draw(
        now,
        ff ? getComputedStyle(ff).getPropertyValue("--hang-rim").trim() : ""
      );
    };
    // A placement can land before this hears the card's new width (a face
    // of another width, a morph): its neck was measured from the old one,
    // so a card standing flush read as not, and its cut ran a flare past
    // its side. Drawn again from where it stands, with the width it has.
    // biome-ignore lint/style/noRestrictedGlobals: draws the card's cut and neck only (its clip-path, its outline layer, its neck's properties), which resize no box watched; the cut follows the card in the frame it took its width
    const sized = new ResizeObserver(([entry]) => {
      const next = entry?.borderBoxSize[0]?.inlineSize ?? node.offsetWidth;
      const resized = next !== width;
      width = next;
      if (layer) {
        regrow(node);
      }
      const neck =
        resized && placedAt !== null ? neckAt(node, placedAt, flared) : null;
      if (neck) {
        draw(node, neck);
      }
    });
    sized.observe(node);
    // A glide to another anchor (`data-morph`, the site's transition of its
    // wrapper's move) writes no style per frame: the shape follows it frame
    // by frame for as long as it runs.
    let gliding = 0;
    const follow = () => {
      regrow(node);
      gliding = node.hasAttribute("data-morph")
        ? requestAnimationFrame(follow)
        : 0;
    };
    const glide = new MutationObserver(() => {
      if (layer && !gliding && node.hasAttribute("data-morph")) {
        gliding = requestAnimationFrame(follow);
      }
    });
    glide.observe(node, { attributes: true, attributeFilter: ["data-morph"] });
    const motion = hang({
      neckAt: (left) => {
        placedAt = left;
        return neckAt(node, left, flared);
      },
      onneck: (neck) => draw(node, neck),
      onshown: (shown) => {
        joined = shown;
        layer?.show(shown);
      },
      held: () => held?.() ?? false,
      folded: () => folded?.() ?? false,
      grow: layer ? grow : undefined,
    })(node);
    return () => {
      sized.disconnect();
      glide.disconnect();
      cancelAnimationFrame(gliding);
      motion?.();
      layer?.remove();
      placedAt = null;
      drawnNeck = null;
    };
  };

  // A tab chosen or let go under its open card: the flares follow at once.
  let card: HTMLElement | null = null;
  $effect(() => {
    const flaring = flared;
    untrack(() => {
      if (card && placedAt !== null) {
        const neck = neckAt(card, placedAt, flaring);
        if (neck) {
          draw(card, neck);
        }
      }
    });
  });
  const kept = (node: HTMLElement) => {
    card = node;
    return () => {
      if (card === node) {
        card = null;
      }
    };
  };
</script>

<!-- Mounted by bits-ui's forceMount and drawn while its presence says so,
     unless the site keeps it drawn (`forceMount`): the page has its pointer
     back at the dismissal (floating-presence). Its wrapper is marked a
     hanging card's (`data-hang`), the cut app.css draws on it. A kit
     surface is told it hangs, so it keeps only the fade of its own motion.
     The wrapper is fixed, so it is the stacking context the card's own
     z-index is held inside: it stands on the floating layer itself
     (DESIGN.md, Stacking), or the card stood under the page's dock. -->
<Content
  data-glass-card={glass || undefined}
  {...kitSurface ? { motion: "hang" as const } : {}}
  {...glass || inPlace ? { portalProps: { disabled: true } } : {}}
  {...rest}
  class={cn(
    floatingSurface({ motion: "hang" }),
    hangCardVariants({ tab, glass, surface }),
    frame && FRAMES[frame],
    className
  )}
  forceMount
  bind:ref
>
  {#snippet child({ props, wrapperProps, open })}
    {#if forceMount || drawn(props)}
      <div
        {...wrapperProps}
        class="z-(--layer-float)"
        data-hang
        style:pointer-events={pressable(open)}
      >
        <div
          {...own(props)}
          style:--frame-w={frame ? FRAME_SIZES[frame].w : undefined}
          style:--frame-w-narrow={frame ? FRAME_SIZES[frame].narrow : undefined}
          style:--frame-h={frame ? FRAME_SIZES[frame].h : undefined}
          style:pointer-events={pressable(open)}
          {@attach hung}
          {@attach kept}
        >
          {#if glass}
            <!-- Its surface, over the shadow picture it wears as its border-image (motion/hung-shadow). -->
            <span
              aria-hidden="true"
              class="pointer-events-none absolute inset-0 -z-1 rounded-[inherit] bg-(--hang-surface)"
              data-slot="hung-surface"
            ></span>
          {/if}
          {@render children()}
        </div>
      </div>
    {/if}
  {/snippet}
</Content>
