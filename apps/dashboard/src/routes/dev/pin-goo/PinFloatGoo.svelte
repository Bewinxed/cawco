<!--
  PinFloat's card (preview/PinFloat.svelte) with the owner's two asks for it,
  for the /dev/pin-goo preview only; the live PinFloat is untouched. Placing
  it is PinFloat's own (preview/pin-place.svelte.ts: `decide`, the plan), less the
  composer and the foot sheet, which stay PinFloat's.

  1. It pours out of its pill (the owner: "with the same goo-out animation
     https://transitions.dev/detail.html?t=gooey-plus-menu"). The technique
     is that recipe's as published: ONE goo layer of SVG shapes under one
     filter, `feGaussianBlur` (stdDeviation `--goo-blur`) then an
     `feColorMatrix` alpha row `slope (0.5 - slope × 5/12)` (slope
     `--goo-threshold`), `feComposite atop` the source, so two shapes near
     each other read as one liquid with a neck between them; the edge and
     the shadow are drawn from the merged silhouette after the goo (the
     recipe's "feDropShadow after the goo passes shadows the MERGED
     silhouette"), here `border-control` as a 1px dilated ring and
     `shadow-hairline`. The shapes, all in the raised fill, are the pill
     (under a crisp copy of it, the recipe's crisp UI layer over the goo)
     and the card (`stages`), over `--dur-goo`: the pill swells toward the
     card and a drop is pulled out of its side, still joined (the first
     quarter, `--ease-out`); the card stretches out of the drop with its near
     edge 3px from the pill, so the neck holds (to three quarters,
     `--ease-crossfade`); the card settles where it stands, `--space-2`
     clear, and the neck lets go (`--ease-goo`, the recipe's overshoot). The
     thread comes up out of a blur once the shape has room. Closing runs the
     same shapes back into the pill over `--dur-goo-exit`, the thread gone
     in its first half; a close caught mid-open turns back from where it is
     drawn. Without motion it cross-fades.
  2. It holds still while the page scrolls (the owner: "only letting it move
     when it reaches the spot where it will move from one spot to the next,
     it should animate THEN, not animate WHILE i'm scrolling"), and moves
     once, over `--dur-morph` on `--ease-drawer`, when it must. Beside its
     pill: while the pill stays within the card's height; once it has left,
     the card's foot goes to the pill's foot (left over its top) or its top
     to the pill's top (left under its foot). Under or over what the comment
     is about: while that stays clear of it and within its height; come onto
     it, the card goes to its other side where there is room (else a whole
     height ahead, else it waits); gone more than its height away, back
     beside it. Always held whole in the well; a pill gone out of view leaves
     it where it stood.
-->
<script lang="ts">
  import { type Snippet, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import {
    dur,
    ease,
    motionOk,
    numberOf,
  } from "#lib/cawco/motion/curves.svelte.js";
  import type { PopSide } from "#lib/cawco/motion/pop.svelte.js";
  import {
    type Box,
    FLOAT_W,
    FloatPlace,
    fadeOut,
    type Plan,
    threadIn,
    threadOut,
    travelTo,
    union,
  } from "#lib/cawco/preview/pin-place.svelte.js";
  import { besideTop, stackedSpot } from "./hold";

  let {
    mark,
    box = null,
    room,
    label,
    pin,
    exit = { at: "fade" },
    float = $bindable(),
    pill,
    children,
  }: {
    /** How it goes: `fade`, or `cut` where another pin's card takes its place in the same press. */
    exit?: { at: "fade" | "cut" };
    /** The pill's box in the well, px; null while it is not on screen. */
    mark: Box | null;
    /** The box of what the pill stands on, in the well, px: the card never stands over it. */
    box?: Box | null;
    /** The well's room, px. */
    room: { h: number; w: number };
    /** What it is, read out. */
    label: string;
    /** The thread's pin, by its number (`data-pin-card`). */
    pin?: number;
    float?: HTMLElement;
    /** The pill as the page draws it, stood crisp over the goo while the card pours out of it and back. */
    pill?: Snippet;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  let body = $state<HTMLElement>();
  let cardBlob = $state<SVGRectElement>();
  let pillBlob = $state<SVGRectElement>();
  let pillCopy = $state<HTMLElement>();
  let filterEl = $state<SVGFilterElement>();
  let blurEl = $state<SVGFEGaussianBlurElement>();
  let matrixEl = $state<SVGFEColorMatrixElement>();

  /** Poured out: the travel to a new spot only runs once it stands. */
  let opened = $state(false);
  const placed = new FloatPlace(() => ({ mark, box, room }), {
    body: () => body,
    float: () => float,
    placed: () => {
      pour();
      opened = true;
    },
  });
  const seen = $derived(placed.seen);
  const plan = $derived(placed.plan);

  /** The card's top beside its pill, held while the pill stays beside it, for the plan it was taken under. */
  let spot: { plan: Plan; side: PopSide; top: number } | null = null;

  const place = $derived.by(() => {
    const { clear, gap, width } = placed;
    const { corner, inX, inY, tall } = placed.frame(plan);
    const at = seen;
    if (!at || plan.along === "room") {
      return { ...corner, jump: false };
    }
    const pillAt = at.mark;
    const about = plan.along === "pill" ? pillAt : at.whole;
    const beside = plan.side === "right" || plan.side === "left";
    let left = pillAt.x;
    if (plan.side === "right") {
      left = about.x + about.w + clear;
    } else if (plan.side === "left") {
      left = about.x - clear - width;
    }
    const held = spot?.plan === plan ? inY(spot.top) : null;
    /** Under or over what it is about, it may have gone to the other side since the plan was taken. */
    let side: PopSide = spot?.plan === plan ? spot.side : plan.side;
    let top: number;
    if (beside) {
      top = held === null ? inY(pillAt.y) : besideTop(held, pillAt, tall, inY);
    } else if (held === null) {
      top =
        side === "top"
          ? inY(about.y - clear - tall)
          : inY(about.y + about.h + clear);
    } else {
      ({ side, top } = stackedSpot({
        about,
        clear,
        gap,
        held,
        inY,
        roomH: room.h,
        side: side === "top" ? "top" : "bottom",
        tall,
      }));
    }
    const jump = held !== null && Math.abs(top - held) > 0.5;
    spot = { plan, side, top };
    return { left: inX(left), top, side, max: plan.max, jump };
  });

  // A new plan, or a new spot once the pill has left the card's height: it
  // travels there once, over --dur-morph on --ease-drawer, from where it is
  // drawn (a travel in flight counted).
  let stood: { left: number; plan: Plan | null; top: number } | null = null;
  let travel: Animation | null = null;
  $effect(() => {
    const at = place;
    const now = plan;
    const el = float;
    if (!el) {
      return;
    }
    const before = stood;
    stood = { left: at.left, top: at.top, plan: now };
    const moved =
      before && (before.plan !== now || at.jump) && untrack(() => opened);
    if (!(moved && motionOk.current)) {
      return;
    }
    travel = travelTo(el, before, at, travel);
  });

  /** An `feFlood`'s colour, a token: a filter primitive's flood is no Tailwind colour. */
  const flood = (token: `--${string}`) => (node: SVGFEFloodElement) => {
    node.style.setProperty("flood-color", `var(${token})`);
  };

  /** A goo knob as the page has it now (the dev page's dials set them on its root), else its token. */
  const knob = (name: `--${string}`): number => {
    const value = float
      ? Number.parseFloat(getComputedStyle(float).getPropertyValue(name))
      : Number.NaN;
    return Number.isFinite(value) ? value : numberOf(name);
  };

  /** The recipe's applyGooKnobs: the blur and the alpha row from the knobs, read as each run starts. */
  function applyGoo(): number {
    const blur = knob("--goo-blur");
    const slope = knob("--goo-threshold");
    const intercept = Math.round((0.5 - slope * (5 / 12)) * 100) / 100;
    blurEl?.setAttribute("stdDeviation", String(blur));
    matrixEl?.setAttribute(
      "values",
      `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${slope} ${intercept}`
    );
    return blur;
  }

  /** The pill's box in the card's own coordinates. */
  const pillIn = (): Box | null => {
    const at = untrack(() => place);
    const where = untrack(() => seen);
    if (!where) {
      return null;
    }
    const p = where.mark;
    return { x: p.x - at.left, y: p.y - at.top, w: p.w, h: p.h };
  };

  /** The card's shape at rest: its box less the 1px edge the filter rings it with, `radius-lg` corners. */
  const rest = (): Box & { r: number } => ({
    x: 1,
    y: 1,
    w: Math.max(0, placed.width - 2),
    h: Math.max(0, placed.height - 2),
    r: Math.max(0, (numberOf("--radius-lg") || 12) - 1),
  });

  type Shape = Box & { r: number };
  /** A blob's keyframe: its box and corners. */
  const shapeOf = (at: Shape) => ({
    x: `${at.x}px`,
    y: `${at.y}px`,
    width: `${at.w}px`,
    height: `${at.h}px`,
    rx: `${at.r}px`,
  });

  /**
   * The pour's shapes, in the card's coordinates: the recipe's blobs leaving
   * one another under the filter. The pill swells toward the card; a drop
   * pulled out of its side, still joined to it; the card stretched out of the
   * drop with its near edge 3px from the pill, so the neck holds; the card
   * where it stands, `--space-2` clear, so the neck lets go.
   */
  function stages(p: Box) {
    const card = rest();
    const centre = { x: p.x + p.w / 2, y: p.y + p.h / 2 };
    const nearest = {
      x: Math.max(card.x, Math.min(centre.x, card.x + card.w)),
      y: Math.max(card.y, Math.min(centre.y, card.y + card.h)),
    };
    const length = Math.hypot(nearest.x - centre.x, nearest.y - centre.y);
    const dx = length < 1 ? 1 : (nearest.x - centre.x) / length;
    const dy = length < 1 ? 0 : (nearest.y - centre.y) / length;
    /** How far the pill reaches from its centre toward the card. */
    const half = (Math.abs(dx) * p.w + Math.abs(dy) * p.h) / 2;
    const pull = Math.max(0, length - half - 3);
    const drop = p.h * 1.8;
    const swell = p.h * 0.45;
    return {
      pill: { ...p, r: p.h / 2 },
      swollen: {
        x: p.x + Math.min(0, dx) * swell,
        y: p.y + Math.min(0, dy) * swell,
        w: p.w + Math.abs(dx) * swell,
        h: p.h + Math.abs(dy) * swell,
        r: p.h / 2,
      },
      drop: {
        x: centre.x + dx * (half + drop * 0.35) - drop / 2,
        y: centre.y + dy * (half + drop * 0.35) - drop / 2,
        w: drop,
        h: drop,
        r: drop / 2,
      },
      near: { ...card, x: card.x - dx * pull, y: card.y - dy * pull },
      card,
    };
  }

  /** The filter's region: the card and, while it pours, the pill, with room for the blur and the shadow. */
  function region(withPill: Box | null, blur: number) {
    const shape = rest();
    const reach = union(withPill ? [shape, withPill] : [shape]);
    const pad = 3 * blur + 16;
    filterEl?.setAttribute("x", String(reach.x - pad));
    filterEl?.setAttribute("y", String(reach.y - pad));
    filterEl?.setAttribute("width", String(reach.w + 2 * pad));
    filterEl?.setAttribute("height", String(reach.h + 2 * pad));
  }

  /** The pill in the goo, under its crisp copy, while the card pours out of it or back; gone at rest. */
  function showPill(at: Box | null) {
    if (!(pillBlob && pillCopy)) {
      return;
    }
    if (!at) {
      pillBlob.classList.add("hidden");
      pillCopy.classList.add("invisible");
      return;
    }
    pillBlob.setAttribute("x", String(at.x));
    pillBlob.setAttribute("y", String(at.y));
    pillBlob.setAttribute("width", String(at.w));
    pillBlob.setAttribute("height", String(at.h));
    pillBlob.setAttribute("rx", String(at.h / 2));
    pillBlob.classList.remove("hidden");
    pillCopy.style.translate = `${at.x}px ${at.y}px`;
    pillCopy.classList.remove("invisible");
  }

  /** Pouring: nothing at rest keeps the pill in the goo, or a scroll would pull a neck to it. */
  let pouring = false;
  $effect(() => {
    // The region follows the card's size at rest.
    if (placed.width + placed.height >= 0 && !pouring) {
      region(
        null,
        untrack(() => knob("--goo-blur"))
      );
    }
  });

  /** The card pours out of its pill. */
  function pour() {
    const el = float;
    const card = cardBlob;
    const inner = body;
    if (!(el && card && inner)) {
      return;
    }
    const blur = applyGoo();
    const from = pillIn();
    if (!(motionOk.current && from)) {
      // Without motion, or no pill on the page to pour from: a cross-fade where it stands.
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
      });
      return;
    }
    const length = knob("--dur-goo");
    pouring = true;
    region(from, blur);
    showPill(from);
    const at = stages(from);
    const out = ease("--ease-out");
    const run = card.animate(
      [
        { ...shapeOf(at.pill), offset: 0, easing: out },
        // The stretch moves on screen, so it eases in and out.
        { ...shapeOf(at.drop), offset: 0.25, easing: ease("--ease-crossfade") },
        { ...shapeOf(at.near), offset: 0.75, easing: ease("--ease-goo") },
        { ...shapeOf(at.card), offset: 1 },
      ],
      { duration: length }
    );
    pillBlob?.animate(
      [
        { ...shapeOf(at.pill), easing: out },
        { ...shapeOf(at.swollen), offset: 0.45, easing: ease("--ease-goo") },
        shapeOf(at.pill),
      ],
      { duration: length }
    );
    threadIn(inner, length);
    run.finished.then(
      () => {
        pouring = false;
        showPill(null);
        region(null, blur);
      },
      () => undefined
    );
  }

  /** The card goes back into its pill: from where it is drawn to the pill's shape, the thread gone by half way. */
  function drain(node: HTMLElement): TransitionConfig {
    const card = cardBlob;
    const inner = body;
    const to = pillIn();
    if (!(card && inner && to && motionOk.current)) {
      return fadeOut(node);
    }
    const length = knob("--dur-goo-exit");
    const blur = applyGoo();
    // From where it is drawn: a close caught mid-pour turns back there.
    const drawn = getComputedStyle(card);
    const from = {
      x: drawn.x,
      y: drawn.y,
      width: drawn.width,
      height: drawn.height,
      rx: drawn.rx === "auto" ? `${rest().r}px` : drawn.rx,
    };
    const shown = getComputedStyle(inner).opacity;
    for (const run of [
      ...card.getAnimations(),
      ...inner.getAnimations(),
      ...(pillBlob?.getAnimations() ?? []),
    ]) {
      run.cancel();
    }
    pouring = true;
    region(to, blur);
    showPill(to);
    const at = stages(to);
    const out = ease("--ease-out");
    card.animate(
      [
        { ...from, offset: 0, easing: out },
        { ...shapeOf(at.near), offset: 0.3, easing: ease("--ease-crossfade") },
        { ...shapeOf(at.drop), offset: 0.75, easing: out },
        { ...shapeOf(at.pill), offset: 1 },
      ],
      { duration: length, fill: "forwards" }
    );
    pillBlob?.animate(
      [
        { ...shapeOf(at.pill), easing: out },
        { ...shapeOf(at.swollen), offset: 0.6, easing: out },
        shapeOf(at.pill),
      ],
      { duration: length, fill: "forwards" }
    );
    threadOut(inner, shown, length);
    return { duration: length };
  }

  function leave(node: HTMLElement): TransitionConfig {
    if (exit.at === "cut") {
      node.style.display = "none";
      return { duration: 0 };
    }
    return drain(node);
  }
</script>

<div
  aria-label={label}
  class="pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max) start-(--float-x) top-(--float-y) w-(--float-w)"
  data-side={place.side}
  data-slot="pin-card"
  data-pin-card={pin}
  role="dialog"
  bind:this={float}
  style:--float-x="{place.left}px"
  style:--float-y="{place.top}px"
  style:--float-w={FLOAT_W}
  style:--float-max="{place.max}px"
  out:leave|global
>
  <!-- The one goo layer: the pill and the card as SVG shapes under the recipe's filter. -->
  <svg
    aria-hidden="true"
    class="pointer-events-none absolute start-0 top-0 -z-1 size-full overflow-visible"
    data-slot="pin-goo"
  >
    <defs>
      <filter
        bind:this={filterEl}
        color-interpolation-filters="sRGB"
        filterUnits="userSpaceOnUse"
        id="goo-{uid}"
      >
        <feGaussianBlur
          bind:this={blurEl}
          in="SourceGraphic"
          result="blur"
          stdDeviation="6"
        />
        <feColorMatrix
          bind:this={matrixEl}
          in="blur"
          result="goo"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7"
        />
        <feComposite
          in="SourceGraphic"
          in2="goo"
          operator="atop"
          result="shape"
        />
        <!-- The edge, `border-control`: the silhouette made hard, then 1px out (the recipe's ring). -->
        <feColorMatrix
          in="shape"
          result="solid"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 60 -29.5"
        />
        <feMorphology in="solid" operator="dilate" radius="1" result="edge-a" />
        <feFlood {@attach flood("--border-control")} result="edge-c" />
        <feComposite in="edge-c" in2="edge-a" operator="in" result="edge" />
        <!-- `shadow-hairline`, 0 3px 7px -2px: the silhouette 2px in, blurred by half of 7, 3px down. -->
        <feMorphology in="solid" operator="erode" radius="2" result="lift-a" />
        <feGaussianBlur in="lift-a" result="lift-b" stdDeviation="3.5" />
        <feOffset dy="3" in="lift-b" result="lift-o" />
        <feFlood {@attach flood("--shadow-tint-2")} result="lift-c" />
        <feComposite in="lift-c" in2="lift-o" operator="in" result="lift" />
        <feMerge>
          <feMergeNode in="lift" />
          <feMergeNode in="edge" />
          <feMergeNode in="shape" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#goo-{uid})">
      <rect bind:this={pillBlob} class="hidden fill-surface-raised" />
      <rect
        bind:this={cardBlob}
        class="fill-surface-raised"
        height={Math.max(0, placed.height - 2)}
        rx={Math.max(0, (numberOf("--radius-lg") || 12) - 1)}
        width={Math.max(0, placed.width - 2)}
        x="1"
        y="1"
      />
    </g>
  </svg>
  <!-- The pill, crisp over the goo while the card pours out of it and back (the recipe's UI layer). -->
  <div
    aria-hidden="true"
    bind:this={pillCopy}
    class="pointer-events-none invisible absolute start-0 top-0 flex"
    data-slot="pin-goo-pill"
  >
    {@render pill?.()}
  </div>
  <div
    class="flex min-h-0 min-w-0 flex-col gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain p-space-3"
    data-slot="pin-body"
    bind:this={body}
  >
    {@render children()}
  </div>
</div>
