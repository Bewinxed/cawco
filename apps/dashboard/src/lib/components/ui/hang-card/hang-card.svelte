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
   * `bottom` at its offset) and wears `kit-hang` (app.css): its edge drawn
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
   * over its own surface (`.hung-surface`), and on a phone its trailing side
   * is the screen's edge, as the glass's is.
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
  import type ContextMenuContent from "#lib/components/ui/context-menu/context-menu-content.svelte";
  import {
    drawn,
    own,
    pressable,
  } from "#lib/components/ui/floating-presence.js";
  import PopoverContent from "#lib/components/ui/popover/popover-content.svelte";
  import { cn } from "#lib/utils.js";
  import { outlineLayer } from "./hang-outline.js";

  /** The glass card's faces (GlassCard's `Card`). */
  type Frame = "caw" | "machines" | "jump";
  /**
   * Each face's frame, read off what its custom properties hold (on the card,
   * below): Caw's panel `c-panel-w` wide with its rows 7px in; the machines
   * 20rem; Jump `c-find-w` wide and its foot clear of the screen's, a full
   * sheet on a phone. On a phone each keeps the phone's 12px margin on its
   * leading side (app.css `.glass-card` squares the trailing one).
   */
  const FRAMES: Record<Frame, string> = {
    caw: "w-(--frame-w) max-desk:w-(--frame-w-narrow) gap-0 p-space-2",
    machines: "w-(--frame-w) gap-0",
    jump: "w-(--frame-w) max-h-(--frame-h) gap-0 p-0 max-desk:h-(--frame-h) max-desk:w-(--frame-w-narrow)",
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
    /**
     * The glass card's face it frames (GlassCard): Caw's panel, the
     * machines or Jump, each its own width, padding and height.
     */
    frame?: Frame;
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
    frame,
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
    const sized = new ResizeObserver(() => read(at));
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
    const right = left + (width || node.offsetWidth);
    const flare = flaring ? span.flare : 0;
    const flushStart = Math.abs(left - span.left) <= 1;
    const flushEnd = Math.abs(right - span.right) <= 1;
    let flush: Neck["flush"] = null;
    if (flushStart) {
      flush = "start";
    } else if (flushEnd) {
      flush = "end";
    }
    return {
      start: span.left - left,
      end: span.right - left,
      flareStart: flushStart ? 0 : flare,
      flareEnd: flushEnd ? 0 : flare,
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
     back at the dismissal (floating-presence). -->
<Content
  data-glass-card={glass || undefined}
  {...rest}
  class={cn(
    "kit-pop kit-hang",
    glass && "glass-card",
    tab && "tab-hang",
    frame && FRAMES[frame],
    className
  )}
  forceMount
  bind:ref
>
  {#snippet child({ props, wrapperProps, open })}
    {#if forceMount || drawn(props)}
      <div {...wrapperProps} style:pointer-events={pressable(open)}>
        <!-- literal: 24px, 12px (the screen's margins), 20rem (the machines) -->
        <div
          {...own(props)}
          style:--frame-w={frame === "caw"
            ? "min(var(--c-panel-w), calc(100vw - 24px))"
            : frame === "machines"
              ? "min(20rem, calc(100vw - 16px))"
              : frame === "jump"
                ? "min(var(--c-find-w), calc(100vw - 24px))"
                : undefined}
          style:--frame-w-narrow={frame === "caw"
            ? "min(var(--c-panel-w), calc(100vw - 12px - env(safe-area-inset-right, 0px)))"
            : frame === "jump"
              ? "calc(100vw - 12px - env(safe-area-inset-right, 0px))"
              : undefined}
          style:--frame-h={frame === "jump"
            ? "calc(100dvh - var(--c-top-bar-h) - 24px)"
            : undefined}
          style:pointer-events={pressable(open)}
          {@attach hung}
          {@attach kept}
        >
          {#if glass}
            <!-- Its surface, over the shadow picture it wears as its border-image (motion/hung-shadow). -->
            <span aria-hidden="true" class="hung-surface"></span>
          {/if}
          {@render children()}
        </div>
      </div>
    {/if}
  {/snippet}
</Content>
