<script lang="ts" module>
  import { tv } from "#lib/utils.js";

  /**
   * The hanging card's recipe, over the kit's floating surface
   * (`floatingSurface`, motion `hang`).
   *
   * Its surface is named (`--hang-surface`) so the cut across its edge
   * facing the anchor is drawn in it; a card on another surface sets that,
   * not `background` (`surface`). What runs on through the cut
   * (`--hang-neck`) is the card's own surface. Its edge is drawn by `::after`
   * rather than its border, so its edge facing the anchor (its top under a
   * foot, its side beside one: `from`) can be cut across the anchor's span
   * and its flared foot (`--neck-start`, `--neck-end`, `--neck-flare-start`,
   * `--neck-flare-end`, in the card's own coordinates along that edge,
   * written from `hang`); on a flush side (`data-flush`) its corner there is
   * square and the cut stops one pixel short, so the anchor's flank runs
   * straight on into the card's side. Beside its anchor, a corner the
   * anchor stands nearer than `--radius-lg` (and its flare) rounds only as
   * far as that room (`--neck-room-start`, `--neck-room-end`): the anchor
   * slides along a side, and the corner gives way to it as it comes. The
   * cut (`::before`) is the card's edge row drawn again in the neck's
   * surface, clipped from the flare's outer circle (`--neck-cut`, written by
   * hang's `setNeck`), so the anchor's curve runs on into the card's edge as
   * one stroke. A clip, not a mask: a mask drew the whole card's edge
   * through a buffer of its own on every paint. Its overlay shadow is cut at
   * that edge (room for the whole shadow past the other three), so none
   * falls on the anchor.
   *
   * `tab`: one silhouette with its folder tab (motion/hang-shape): no edge,
   * cut or shadow of its own (the outline layer, hang-outline, draws them),
   * cut to nothing shut and grown out of the tab's foot, never sliding.
   * Otherwise it is shut behind its cut, past its own size by the reach of
   * its shadow (`--hang-reach`), until `hang` says it is shown, and keeps its
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
    base: "relative border-0 bg-(--hang-surface) [--hang-neck:var(--hang-surface)] [--hang-surface:var(--surface-raised)] before:pointer-events-none before:absolute before:z-2 before:bg-(--hang-neck) after:pointer-events-none after:absolute after:inset-0 after:z-1 after:rounded-[inherit] after:border after:border-border-control data-[rehearsing]:invisible before:[--gap-from:calc(var(--neck-start)-var(--neck-flare-start,0px))] before:[--gap-to:calc(var(--neck-end)+var(--neck-flare-end,0px))] before:[clip-path:var(--neck-cut,none)] data-[flush=end]:before:[--gap-to:calc(var(--neck-end)-1px)] data-[flush=start]:before:[--gap-from:1px]",
    variants: {
      /** The side of its anchor it hangs from (motion/hang `HangFrom`): the edge it is cut and shadowed on, its row of cut, its square corners. */
      from: {
        foot: "[clip-path:inset(0_-120px_-120px_round_0_0_var(--radius-lg)_var(--radius-lg))] before:top-0 before:left-(--gap-from) before:h-px before:w-[calc(var(--gap-to)-var(--gap-from))] data-[flush=start]:rounded-ss-none data-[flush=end]:rounded-se-none",
        end: "[clip-path:inset(-120px_-120px_-120px_0)] before:left-0 before:top-(--gap-from) before:w-px before:h-[calc(var(--gap-to)-var(--gap-from))] rounded-tl-[min(var(--radius-lg),var(--neck-room-start,var(--radius-lg)))] rounded-bl-[min(var(--radius-lg),var(--neck-room-end,var(--radius-lg)))]",
        start:
          "[clip-path:inset(-120px_0_-120px_-120px)] before:right-0 before:top-(--gap-from) before:w-px before:h-[calc(var(--gap-to)-var(--gap-from))] rounded-tr-[min(var(--radius-lg),var(--neck-room-start,var(--radius-lg)))] rounded-br-[min(var(--radius-lg),var(--neck-room-end,var(--radius-lg)))]",
      },
      tab: {
        true: "translate-none shadow-none will-change-auto [clip-path:path('M_0_0_Z')] before:hidden after:hidden",
        false: "motion-safe:will-change-[translate]",
      },
      glass: {
        true: "@max-desk/shell:rounded-ee-none shadow-none @max-desk/shell:after:border-e-0",
      },
      /** The tab's menu hangs on the tab's own surface, as the session card's head is. */
      surface: { recess: "[--hang-surface:var(--surface-recess)]" },
    },
    /** Shut behind its cut: up from a foot, toward the anchor from a side. */
    compoundVariants: [
      {
        tab: false,
        from: "foot",
        class:
          "motion-safe:not-data-[shown]:[translate:0_calc(-100%-var(--hang-reach,0px))]",
      },
      {
        tab: false,
        from: "end",
        class:
          "motion-safe:not-data-[shown]:[translate:calc(-100%-var(--hang-reach,0px))_0]",
      },
      {
        tab: false,
        from: "start",
        class:
          "motion-safe:not-data-[shown]:[translate:calc(100%+var(--hang-reach,0px))_0]",
      },
    ],
    defaultVariants: { tab: false, from: "foot" },
  });
</script>

<script lang="ts">
  /**
   * A card that hangs from its anchor as one shape with it (DESIGN.md, "A
   * card that hangs from its anchor"): Caw's panel, the machines and the
   * Jump palette from the top bar's glass, the session card and a finger's
   * tab menu from their tab, a comment's thread from its pin (PinFloat). The
   * iOS app's HangCard draws the same card.
   *
   * It is a kit floating surface (the popover by default, or the context
   * menu's: `as`), so focus, Escape and a press outside are the primitive's.
   * It stands on the side of its anchor it hangs from (`from`: its foot, the
   * site giving the primitive side `bottom` at its offset; or its start or
   * end side, side `left` or `right`) and wears `hangCardVariants`: its edge
   * drawn inside its box, its edge facing the anchor cut across the
   * anchor's span and the anchor's flared foot each side of it (the neck),
   * square on a side it stands flush with. It opens and closes on `hang`
   * (motion/hang): a slide out of the foot from behind a cut that never
   * moves, translate alone, interruptible, a fade under Reduce Motion.
   *
   * The neck is measured here, from where the primitive places the card:
   * the anchor's span in the card's coordinates along that edge, and on
   * each side the anchor's `--flare` where the card reaches past the
   * anchor's edge, none where its edge meets the anchor's (flush, within a
   * pixel). The anchor's box is read as it is laid out anew (its size, the
   * window's, a scroll, its own style: a pin's foot moves with its pin),
   * never in a placement, where a read made the page lay itself out again
   * then and there.
   *
   * The anchor draws its own foot while the card stands drawn out of it
   * (`joined`): Caw's glass its `.join`, a tab its `.neck`, a pin its
   * PinFoot.
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
    type HangFrom,
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

  /** The glass card's faces (GlassCard's `Card`), the session card, and a comment's thread. */
  type Frame = "caw" | "machines" | "jump" | "files" | "details" | "thread";
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
   *
   * A comment's thread (`thread`, PinFloat) is the reading card's width,
   * `--c-pin-card-reading-w` (two fifths of the pin room it stands in, its
   * size container), never past that room less `--space-2` each side, and
   * as tall as what it holds up to the tallest its site gives it
   * (`--float-max`); what it holds pads and scrolls itself.
   */
  const FRAMES: Record<Frame, string> = {
    caw: "w-(--frame-w) @max-desk/shell:w-(--frame-w-narrow) gap-0 p-space-2",
    machines: "w-(--frame-w) gap-0",
    jump: "w-(--frame-w) max-h-(--frame-h) gap-0 p-0 @max-desk/shell:h-(--frame-h) @max-desk/shell:w-(--frame-w-narrow)",
    files: "flex w-(--frame-w) max-h-(--frame-h) flex-col gap-0 p-space-2",
    thread: "flex w-(--frame-w) max-h-(--float-max) flex-col gap-0 p-0",
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
    thread: {
      w: "min(var(--c-pin-card-reading-w), calc(100cqi - 2 * var(--space-2)))",
    },
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
    /** The side of its anchor it hangs from: its foot (default), or its start or end side. */
    from?: HangFrom;
    /** Where the primitive placed it, on every placement: its floating wrapper's x and y. */
    onplaced?: (x: number, y: number) => void;
    /** It hangs from the top bar's glass. */
    glass?: boolean;
    /** It is drawn where it is mounted, never portaled (as the glass's cards are): a pin's, in its pin room. */
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
    from = "foot",
    onplaced,
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

  /** Its anchor beside it, not over it: the neck runs down the card's side. */
  const beside = $derived(from !== "foot");

  /**
   * The anchor's span along the card's edge facing it (across for a foot,
   * down for a side), in the primitive's own coordinates, and its flare;
   * re-read once it may have moved. A card placed `fixed` (the glass's) is
   * placed on the screen's px; one placed `absolute` (a pin's, in its pin
   * room) in the box it is placed in, drawn scaled where that box is (a
   * design preview's frame fitted to its window), so the anchor is read
   * against that box, at its scale.
   */
  let span: { start: number; end: number; flare: number } | null = null;
  let moved = true;
  function read(at: HTMLElement) {
    const box = at.getBoundingClientRect();
    const wrapper = card?.parentElement;
    const holder =
      wrapper && getComputedStyle(wrapper).position !== "fixed"
        ? wrapper.offsetParent
        : null;
    let origin = 0;
    let scale = 1;
    if (holder instanceof HTMLElement) {
      const room = holder.getBoundingClientRect();
      scale = holder.offsetWidth > 0 ? room.width / holder.offsetWidth : 1;
      origin = beside
        ? room.top + holder.clientTop * scale - holder.scrollTop * scale
        : room.left + holder.clientLeft * scale - holder.scrollLeft * scale;
    }
    span = {
      start: ((beside ? box.top : box.left) - origin) / scale,
      end: ((beside ? box.bottom : box.right) - origin) / scale,
      flare:
        Number.parseFloat(getComputedStyle(at).getPropertyValue("--flare")) ||
        0,
    };
    moved = false;
  }
  /** The neck drawn again where the card stands, from the anchor as it stands now. */
  const again = (at: HTMLElement) => {
    read(at);
    if (card && placedAt !== null) {
      const neck = neckAt(card, placedAt, flared);
      if (neck) {
        draw(card, neck);
      }
    }
  };
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
    const sized = new ResizeObserver(() => again(at));
    sized.observe(at);
    // An anchor its site moves by its own style (a pin's foot, carried with
    // its pin as the page scrolls under a card that stands still): the neck
    // follows it along the card's edge in the same frame.
    const restyled = new MutationObserver(() => again(at));
    restyled.observe(at, { attributes: true, attributeFilter: ["style"] });
    const away = () => {
      moved = true;
    };
    const options = { capture: true, passive: true } as const;
    addEventListener("resize", away);
    addEventListener("scroll", away, options);
    return () => {
      sized.disconnect();
      restyled.disconnect();
      removeEventListener("resize", away);
      removeEventListener("scroll", away, options);
    };
  });

  /** The card's size along its edge facing the anchor (its width under a foot, its height beside one), kept by its own observer. */
  let size = 0;
  /** Where the card's edge stood along the anchor's span at its last placement: its left under a foot, its top beside one. */
  let placedAt: number | null = null;
  /** The neck last written onto the card. */
  let drawnNeck: Neck | null = null;
  /** How far the card is drawn off its placement along the anchor's span (its wrapper's travel, PinFloat): the neck stays on the anchor as drawn. */
  let shift = 0;

  function neckAt(
    node: HTMLElement,
    placed: number,
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
    const left = placed + shift;
    const across = size || (beside ? node.offsetHeight : node.offsetWidth);
    const right = left + across;
    const flare = flaring ? span.flare : 0;
    const flushStart = Math.abs(left - span.start) <= 1;
    const flushEnd = Math.abs(right - span.end) <= 1;
    let flush: Neck["flush"] = null;
    if (flushStart) {
      flush = "start";
    } else if (flushEnd) {
      flush = "end";
    }
    // The cut lies on the card's own edge facing the anchor: the anchor's
    // span as far as it is over the card, and a flare as far as the card
    // reaches past the anchor's edge. A card standing anywhere but under it
    // (Caw's panel shut at the screen's leading margin, the glass at its
    // trailing edge) had a cut running on past its own side, to the glass
    // and a flare beyond, and the page scrolled sideways by it.
    const start = Math.min(Math.max(span.start - left, 0), across);
    const end = Math.min(Math.max(span.end - left, start), across);
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
   * wrote the style attribute over it. Beside its anchor, the room each
   * corner on that edge has before the neck's flare (`--neck-room-start`,
   * `--neck-room-end`), which its radius gives way to.
   */
  function draw(node: HTMLElement, neck: Neck) {
    const standing =
      drawnNeck !== null &&
      sameNeck(neck, drawnNeck) &&
      node.style.getPropertyValue("--neck-start") === `${neck.start}px`;
    if (!standing) {
      setNeck(node, neck, from);
      if (beside && neck.end - neck.start >= 0.5) {
        const across = size || node.offsetHeight;
        node.style.setProperty(
          "--neck-room-start",
          `${Math.max(0, neck.start - neck.flareStart)}px`
        );
        node.style.setProperty(
          "--neck-room-end",
          `${Math.max(0, across - neck.end - neck.flareEnd)}px`
        );
      } else if (beside) {
        // The anchor stands past this edge's ends: no neck, round corners.
        node.style.removeProperty("--neck-room-start");
        node.style.removeProperty("--neck-room-end");
      }
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
   * The card drawn `by` px off its placement along the anchor's span (its
   * site moving its wrapper, frame by frame): the neck drawn again where the
   * anchor stands against it.
   */
  export function drawnOff(by: number): void {
    shift = by;
    if (anchor) {
      again(anchor);
    }
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
      const box = entry?.borderBoxSize[0];
      const next =
        (beside ? box?.blockSize : box?.inlineSize) ??
        (beside ? node.offsetHeight : node.offsetWidth);
      const resized = next !== size;
      size = next;
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
      from,
      neckAt: (along) => {
        placedAt = along;
        return neckAt(node, along, flared);
      },
      onneck: (neck) => draw(node, neck),
      onplaced: (x, y) => onplaced?.(x, y),
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
    // Read again with the card's own box to place it in (`origin`).
    moved = true;
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
    floatingSurface({ motion: "hang", edge: "drawn" }),
    hangCardVariants({ tab, glass, surface, from }),
    frame && FRAMES[frame],
    className
  )}
  data-hang-from={from}
  forceMount
  bind:ref
>
  {#snippet child({ props, wrapperProps, open })}
    {#if forceMount || drawn(props)}
      <div
        {...wrapperProps}
        class="z-(--layer-float)"
        data-hang={from}
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
