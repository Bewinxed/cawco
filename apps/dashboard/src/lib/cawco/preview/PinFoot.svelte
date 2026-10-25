<!--
  A pin's foot (DESIGN.md, "A thread beside its pin"; "A card that hangs
  from its anchor"): what its thread's card hangs from, standing on the pin
  as drawn (its pill with its rings, `RING_OUT` round its box), and the foot
  the pin draws on its side facing the card while the card stands drawn out
  of it (HangCard `joined`), as the top bar's glass draws its join: the
  card's raised surface and `border-control` edge round the pin, its near
  end square into the cut at the card's edge, each flank flared into that
  edge by the neck's flare there (`neck`, HangCard's), so the pin's flanks
  run on into the card's edge as one silhouette. The pill's face is left
  open, so the pin's own fill shows through and nothing is painted over it;
  so is its dot (`dot`), on its top end corner.

  It carries `--flare` (`--radius-lg`, the glass's), which HangCard reads.

  As the card slides out from behind the cut and back (motion/hang's
  `slide`), the foot is drawn on the card's own clock, frame by frame, as a
  liquid bridge (transitions.dev's gooey plus menu, "Liquid split into a
  fan of actions", built here from the standard technique): its shapes (the
  pin as drawn, its near end rounding square and its flares growing with
  how far the card is out, `footAt`, and the card's edge as far as it has
  come past the cut) blurred and cut back at half their alpha, then laid
  under themselves, so where they touch they melt into one with a fillet as
  wide as the blur, and its edge drawn round what that leaves. The blur
  starts at half the flare and goes to nothing as the card lands, where the
  bridge has drawn itself into the neck: then the foot is drawn plain again.
  Only the shape layer melts: the card and what it holds stay crisp, and
  nothing runs at rest or while the page scrolls. With less motion there is
  no slide, and the foot comes and goes with the card.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import type { Neck } from "../motion/hang";
  import { SLIDE, type SlideDetail } from "../motion/hang";
  import {
    boxPath,
    dotPath,
    type FootShape,
    facePath,
    footAt,
    footEdge,
    footPath,
    OVER,
    type PinTail,
  } from "./pin-foot";

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

  let {
    box,
    side,
    tail = "bottom-start",
    dot = false,
    neck = null,
    joined = false,
    card = null,
    el = $bindable(),
  }: {
    /** The pin as drawn (its pill's box with its rings), in the room, px; null while it is not on screen. */
    box: Box | null;
    /** The side of the pin its card stands at. */
    side: "start" | "end";
    /** The pill's tail corner, as the page draws it. */
    tail?: PinTail;
    /** The pill wears a dot on its top end corner (the live dot): left open. */
    dot?: boolean;
    /** The card's neck where the pin stands against its edge (HangCard `onneck`). */
    neck?: Neck | null;
    /** The card stands drawn out of the pin. */
    joined?: boolean;
    /** The card: its slide is what the bridge is drawn on. */
    card?: HTMLElement | null;
    el?: HTMLElement;
  } = $props();

  const id = $props.id();
  /** The flare, as the glass's (`--radius-lg`), and the dot's size (`--status-dot-size`), read off the page once it is drawn. */
  let flare = $state(0);
  let dotSize = $state(0);

  // Its tokens as the page computes them, once it is drawn.
  $effect(() => {
    const foot = el;
    if (!foot) {
      return;
    }
    const style = getComputedStyle(foot);
    flare = Number.parseFloat(style.getPropertyValue("--flare")) || 0;
    dotSize =
      Number.parseFloat(style.getPropertyValue("--status-dot-size")) || 0;
  });

  /** The foot's shape where it stands now. */
  const shape = $derived.by((): FootShape | null => {
    if (!box) {
      return null;
    }
    return {
      w: box.w,
      h: box.h,
      side,
      tail,
      flareStart: neck?.flareStart ?? 0,
      flareEnd: neck?.flareEnd ?? 0,
    };
  });
  /** The pin stands against the card's edge: a neck is cut there. */
  const meets = $derived(!!neck && neck.end - neck.start >= 0.5);

  /** The blur's widest, at the slide's start: half the flare. */
  const most = $derived(flare / 2);
  /** How far the bridge's layer reaches past the foot: its blur's reach. */
  const pad = $derived(Math.ceil(3 * most) + 2);
  /** The layer's box in the foot's own px: the pin, its flares, and the bridge's reach, cut at the card's edge. */
  const view = $derived.by(() => {
    if (!box) {
      return null;
    }
    const top = -(flare + pad);
    const height = box.h + 2 * (flare + pad);
    // A pixel past the cut too, where the foot runs on under the card's edge (`OVER`).
    return side === "end"
      ? { x: -pad, y: top, w: box.w + pad + OVER, h: height }
      : { x: -OVER, y: top, w: box.w + pad + OVER, h: height };
  });

  /**
   * The card's box against the foot's, in the foot's own px, as it is drawn
   * now (a frame drawn scaled, a design preview's, read at its scale).
   */
  const cardAgainst = (node: HTMLElement, foot: HTMLElement) => {
    const c = node.getBoundingClientRect();
    const f = foot.getBoundingClientRect();
    const scale = foot.offsetWidth > 0 ? f.width / foot.offsetWidth : 1;
    const cut = side === "end" ? f.right : f.left;
    const out = (side === "end" ? c.right - cut : cut - c.left) / scale;
    const width = c.width / scale;
    return {
      out: Math.max(0, Math.min(out, width)),
      width,
      top: (c.top - f.top) / scale,
      height: c.height / scale,
    };
  };

  let layer = $state<SVGSVGElement>();
  let blur = $state<SVGFEGaussianBlurElement>();
  let source = $state<SVGPathElement>();
  let edge = $state<SVGRectElement>();

  /** What the foot shows: its plain shape, the bridge mid-slide, or nothing. */
  type Phase = "rest" | "bridge" | "none";
  let sliding = false;
  const show = (phase: Phase) => {
    if (layer) {
      layer.dataset.phase = phase;
    }
  };
  // Shown plain while the card stands drawn out against it; the bridge
  // draws itself while the card slides.
  $effect(() => {
    const phase: Phase = joined && meets ? "rest" : "none";
    untrack(() => {
      if (!sliding) {
        show(phase);
      }
    });
  });

  /**
   * The bridge as the card stands now: its shapes `p` of the way out (how
   * far the card has come past the cut), the card's edge past the cut, and
   * its blur by the slide's own clock, `t` of its length (from its widest
   * at the open's start down to nothing at its end; up from nothing to its
   * widest on the way back), so it melts at the junction the whole slide
   * long and draws itself into the neck as the card lands.
   */
  function drawBridge(
    node: HTMLElement,
    foot: HTMLElement,
    slide: { opens: boolean; run: Animation } | null
  ) {
    const now = shape;
    if (!(now && blur && source && edge)) {
      return;
    }
    const against = cardAgainst(node, foot);
    const p = against.width > 0 ? against.out / against.width : 0;
    const timing = slide?.run.effect?.getComputedTiming();
    const length = Number(timing?.duration) || 1;
    const t = Math.min(
      1,
      Math.max(0, Number(slide?.run.currentTime ?? 0) / length)
    );
    const loose = slide?.opens === false ? t : 1 - t;
    source.setAttribute("d", footAt(now, p));
    blur.setAttribute("stdDeviation", String(Math.max(0.5, most * loose)));
    // The card's edge column as far as it is out, its whole height, past the cut.
    const reach = Math.min(against.out, pad);
    edge.setAttribute("x", String(side === "end" ? now.w : -reach));
    edge.setAttribute("width", String(reach));
    edge.setAttribute("y", String(against.top));
    edge.setAttribute("height", String(against.height));
  }

  // On the card's slide, out or back, the bridge is drawn every frame on
  // its clock (seeked or slowed, it is drawn where the clock stands), and
  // the plain foot again once the card stands out (none once it is back).
  $effect(() => {
    const node = card;
    const foot = el;
    if (!(node && foot)) {
      return;
    }
    let frame = 0;
    let slide: SlideDetail | null = null;
    const tick = () => {
      drawBridge(node, foot, slide);
      frame = requestAnimationFrame(tick);
    };
    const slid = (event: Event) => {
      const next = (event as CustomEvent<SlideDetail>).detail;
      slide = next;
      sliding = true;
      show("bridge");
      cancelAnimationFrame(frame);
      drawBridge(node, foot, next);
      frame = requestAnimationFrame(tick);
      const ended = () => {
        if (slide !== next) {
          return;
        }
        cancelAnimationFrame(frame);
        sliding = false;
        slide = null;
        show(next.opens && meets ? "rest" : "none");
      };
      next.run.finished.then(ended, ended);
    };
    node.addEventListener(SLIDE, slid);
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener(SLIDE, slid);
    };
  });
</script>

<span
  aria-hidden="true"
  class={[
    "pointer-events-none absolute start-(--foot-x) top-(--foot-y) h-(--foot-h) w-(--foot-w)",
    !box && "hidden",
  ]}
  data-slot="pin-foot"
  bind:this={el}
  style:--flare="var(--radius-lg)"
  style:--foot-x={box ? `${box.x}px` : undefined}
  style:--foot-y={box ? `${box.y}px` : undefined}
  style:--foot-w={box ? `${box.w}px` : undefined}
  style:--foot-h={box ? `${box.h}px` : undefined}
>
  {#if shape && view}
    {@const open = `M ${view.x - pad} ${view.y} h ${view.w + 2 * pad} v ${view.h} h ${-(view.w + 2 * pad)} Z ${facePath(shape)}${dot && dotSize > 0 ? ` ${dotPath(shape, dotSize)}` : ""}`}
    <svg
      aria-hidden="true"
      class="absolute start-(--view-x) top-(--view-y) overflow-hidden data-[phase=bridge]:[&>[data-part=plain]]:hidden data-[phase=none]:hidden data-[phase=rest]:[&>[data-part=bridge]]:hidden"
      data-phase="none"
      height={view.h}
      style:--view-x="{view.x}px"
      style:--view-y="{view.y}px"
      viewBox="{view.x} {view.y} {view.w} {view.h}"
      width={view.w}
      bind:this={layer}
    >
      <defs>
        <!-- The face and the dot, left open: the pin's own fill shows through. -->
        <clipPath clipPathUnits="userSpaceOnUse" id="{id}-open">
          <path clip-rule="evenodd" d={open} />
        </clipPath>
        <!-- The liquid bridge: blurred, cut back at half its alpha, laid
             under the shapes themselves, then its edge drawn 1px in round
             what that leaves and the raised surface inside it. -->
        <filter
          color-interpolation-filters="sRGB"
          filterUnits="userSpaceOnUse"
          height={view.h}
          id="{id}-melt"
          width={view.w + 2 * pad}
          x={view.x - pad}
          y={view.y}
        >
          <feGaussianBlur
            in="SourceAlpha"
            result="blur"
            stdDeviation={most}
            bind:this={blur}
          />
          <feColorMatrix
            in="blur"
            result="melt"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 18 -8.5"
          />
          <feComposite
            in="SourceAlpha"
            in2="melt"
            operator="over"
            result="shape"
          />
          <feMorphology in="shape" operator="erode" radius="1" result="inner" />
          <feFlood class="flood-border-control" result="edgeInk" />
          <feComposite in="edgeInk" in2="shape" operator="in" result="edge" />
          <feFlood class="flood-surface-raised" result="surfaceInk" />
          <feComposite
            in="surfaceInk"
            in2="inner"
            operator="in"
            result="surface"
          />
          <feMerge>
            <feMergeNode in="edge" />
            <feMergeNode in="surface" />
          </feMerge>
        </filter>
      </defs>
      <!-- At rest: the foot drawn plain, its surface and its edge line. -->
      <g clip-path="url(#{id}-open)" data-part="plain">
        <path class="fill-surface-raised" d={footPath(shape)} />
        <path
          class="fill-none stroke-border-control stroke-1"
          d={footEdge(shape)}
        />
      </g>
      <!-- Mid-slide: the bridge, drawn on the card's clock (`drawBridge`). -->
      <g clip-path="url(#{id}-open)" data-part="bridge">
        <g filter="url(#{id}-melt)">
          <path
            d={boxPath(0, 0, shape.w, shape.h, [0, 0, 0, 0])}
            fill="currentColor"
            bind:this={source}
          />
          <rect
            fill="currentColor"
            height="0"
            width="0"
            x="0"
            y="0"
            bind:this={edge}
          />
        </g>
      </g>
    </svg>
  {/if}
</span>
