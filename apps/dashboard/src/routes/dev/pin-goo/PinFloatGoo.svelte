<!--
  PinFloat's card (preview/PinFloat.svelte) with the owner's two asks for it,
  for the /dev/pin-goo preview only; the live PinFloat is untouched. Placing
  it is PinFloat's own (`decide`, the plan), less the composer and the foot
  sheet, which stay PinFloat's.

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
     (under its crisp mark, the recipe's crisp UI layer over the goo), the
     neck and the card. Opening is one stretch on one curve: the card goes
     from the pill's box to its own over `--dur-goo` on `--ease-goo` (the
     recipe's open curve), the thread revealed inside the shape as drawn by
     a clip on the same curve, so the neck forms and, apart, lets go as its
     near edge leaves the pill. Closing is the same stretch back over
     `--dur-goo-exit` on `--ease-out`, from where it is drawn.
     Joined (the owner: "a toggle that keeps the small gooey part that makes
     the card still connected to the chip after it's done … the comment pin
     should change shape while it's open … as if it's part of the
     popover"), it stands at its pin, `clear` from it, and a neck from the
     pill's centre into the card's straight edge stays once it has opened,
     grown on the same curve from a bead at the pill: the pin wears the
     card's surface, its figure in the action ink, and the page's own pill
     steps back, so pin and card are one shape with one edge and one shadow.
     The neck follows the pin as the page scrolls under the still card, and
     grows back from a bead when the pin comes beside it again. Without
     motion it cross-fades.
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
  import { flushSync, type Snippet, untrack } from "svelte";
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
    drawnShift,
    FLOAT_W,
    FloatPlace,
    fadeOut,
    type Plan,
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
    joined = true,
    stickiness = numberOf("--goo-blur"),
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
    /** It stays joined to its pin by a neck once it has poured out, the pin wearing the card's surface: one shape. */
    joined?: boolean;
    /** How far apart the card and its pin still pull a bridge between them, px: the goo's blur (`--goo-blur`). */
    stickiness?: number;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  let body = $state<HTMLElement>();
  let cardBlob = $state<SVGRectElement>();
  let pillBlob = $state<SVGRectElement>();
  let neckBlob = $state<SVGPathElement>();
  let pinLayer = $state<HTMLElement>();
  let pinShift = $state<HTMLElement>();
  let markFace = $state<HTMLElement>();
  let joinedFace = $state<HTMLElement>();
  let filterEl = $state<SVGFilterElement>();
  let blurEl = $state<SVGFEGaussianBlurElement>();
  let matrixEl = $state<SVGFEColorMatrixElement>();

  /** Poured out: the travel to a new spot only runs once it stands. */
  let opened = $state(false);
  const placed = new FloatPlace(
    () => ({ mark, box, room, besidePill: joined }),
    {
      body: () => body,
      float: () => float,
      placed: () => {
        pour();
        opened = true;
      },
    }
  );
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
  /** The pin's own counter-travel, while the card travels. */
  let stay: Animation[] = [];
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
    const [dx, dy] = drawnShift(el);
    for (const one of stay) {
      one.cancel();
    }
    travel = travelTo(el, before, at, travel);
    // The pin stays on the page while the card travels: its blob and faces
    // go the other way, on the travel's own timing, so only the neck
    // between them stretches.
    const back = `translate(${at.left - before.left - dx}px, ${at.top - before.top - dy}px)`;
    const timing = {
      duration: dur("--dur-morph"),
      easing: ease("--ease-drawer"),
    };
    stay = [pillBlob, pinShift].flatMap((one) =>
      one
        ? [
            one.animate(
              [{ transform: back }, { transform: "translate(0px, 0px)" }],
              timing
            ),
          ]
        : []
    );
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

  /** The recipe's applyGooKnobs: the blur and the alpha row, set as each run starts and as the stickiness changes. */
  function applyGoo(): number {
    const blur = stickiness;
    const slope = knob("--goo-threshold");
    const intercept = Math.round((0.5 - slope * (5 / 12)) * 100) / 100;
    blurEl?.setAttribute("stdDeviation", String(blur));
    matrixEl?.setAttribute(
      "values",
      `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${slope} ${intercept}`
    );
    return blur;
  }

  type Shape = Box & { r: number };
  /** The joined neck: its outline, the pin's centre it grows from, and its bead (squeezed into the pin) as a transform. */
  interface Neck {
    bead: string;
    d: string;
    origin: string;
  }

  /** The pill's box in the card's own coordinates, as it stands now or was last seen. */
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
  const rest = (): Shape => ({
    x: 1,
    y: 1,
    w: Math.max(0, placed.width - 2),
    h: Math.max(0, placed.height - 2),
    r: Math.max(0, (numberOf("--radius-lg") || 12) - 1),
  });

  /** A blob's keyframe: its box and corners. */
  const shapeOf = (at: Shape) => ({
    x: `${at.x}px`,
    y: `${at.y}px`,
    width: `${at.w}px`,
    height: `${at.h}px`,
    rx: `${at.r}px`,
  });

  /** The pill as a blob: its box, round ends. */
  const pillShape = (p: Box): Shape => ({ ...p, r: p.h / 2 });

  /** The content's clip to a blob, in the card's box: what of the thread shows inside the shape as drawn. */
  const clipOf = (at: Shape) => {
    const top = Math.max(0, at.y);
    const left = Math.max(0, at.x);
    const right = Math.max(0, placed.width - (at.x + at.w));
    const bottom = Math.max(0, placed.height - (at.y + at.h));
    return `inset(${top}px ${right}px ${bottom}px ${left}px round ${at.r}px)`;
  };

  /**
   * The neck that keeps the pin and the card one shape while it stands
   * joined, drawn as a path: the pin's whole cross-section from its centre
   * to the card's near edge, never narrower than the pin. Each of its two
   * edges either turns into the card's straight edge with a concave fillet
   * (`radius-lg` along the card, the gap across), or, near the card's
   * corner, runs on in an S into the card's own top or foot, the corner
   * squared. So the outline goes pin, neck, card with no waist. Only where
   * the pill stands beside the card's edge within `clear` and a little of
   * it; else the neck has let go. `bead` is the transform that squeezes it
   * into the pill's own box, about the pill's centre: where it grows from.
   */
  function neckOf(p: Box): Neck | null {
    const card = rest();
    const reach = placed.clear + 6;
    const alongY = p.y + p.h > card.y && p.y < card.y + card.h;
    const alongX = p.x + p.w > card.x && p.x < card.x + card.w;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    // The four sides in one frame: `out` from the card's edge toward the
    // pin, `along` the edge; `at` maps a point back to the card's own.
    interface Frame {
      /** The edge runs across the page (the pin above or under the card). */
      across: boolean;
      at: (out: number, along: number) => string;
      /** The card's edge, along. */
      c0: number;
      c1: number;
      /** The gap from the card's edge to the pin's near side, and to its centre. */
      g: number;
      m: number;
      /** The pin's span, along. */
      p0: number;
      p1: number;
    }
    const besideY = {
      c0: card.y,
      c1: card.y + card.h,
      p0: p.y,
      p1: p.y + p.h,
      across: false,
    };
    const besideX = {
      c0: card.x,
      c1: card.x + card.w,
      p0: p.x,
      p1: p.x + p.w,
      across: true,
    };
    const right = card.x + card.w;
    const foot = card.y + card.h;
    let frame: Frame;
    if (alongY && p.x + p.w <= card.x && card.x - (p.x + p.w) <= reach) {
      frame = {
        ...besideY,
        at: (o, a) => `${card.x - o} ${a}`,
        g: card.x - (p.x + p.w),
        m: card.x - cx,
      };
    } else if (alongY && p.x >= right && p.x - right <= reach) {
      frame = {
        ...besideY,
        at: (o, a) => `${right + o} ${a}`,
        g: p.x - right,
        m: cx - right,
      };
    } else if (alongX && p.y + p.h <= card.y && card.y - (p.y + p.h) <= reach) {
      frame = {
        ...besideX,
        at: (o, a) => `${a} ${card.y - o}`,
        g: card.y - (p.y + p.h),
        m: card.y - cy,
      };
    } else if (alongX && p.y >= foot && p.y - foot <= reach) {
      frame = {
        ...besideX,
        at: (o, a) => `${a} ${foot + o}`,
        g: p.y - foot,
        m: cy - foot,
      };
    } else {
      return null;
    }
    const { at, c0, c1, g, m, p0, p1 } = frame;
    const { r } = card;
    /** Inside the card, past its round corners: where the neck closes, hidden under it. */
    const deep = r + 1;
    /** A quarter ellipse as one cubic. */
    const k = 0.5523;
    /** The S's handles: half its run. */
    const s = (g + r) / 2;
    /**
     * One edge of the neck, from the pin's side `pe` into the card, `dir`
     * -1 toward `c0`, +1 toward `c1`: a fillet into the card's straight
     * edge (`r` along it, the gap across) where that clears the card's
     * round corner; else an S on into the card's own end at `ce`, the
     * corner squared, its ends level with the pin and the card.
     */
    const edgeOf = (pe: number, ce: number, dir: number) => {
      const meet = pe + dir * r;
      if (dir * (ce - meet) >= r) {
        return {
          meet,
          card: at(0, meet),
          toCard: `C ${at(g - g * k, pe)} ${at(0, meet - dir * r * k)} ${at(0, meet)}`,
          toPin: `C ${at(0, meet - dir * r * k)} ${at(g - g * k, pe)} ${at(g, pe)}`,
        };
      }
      return {
        meet: ce,
        card: at(-r, ce),
        toCard: `C ${at(g - s, pe)} ${at(-r + s, ce)} ${at(-r, ce)}`,
        toPin: `C ${at(-r + s, ce)} ${at(g - s, pe)} ${at(g, pe)}`,
      };
    };
    const near = edgeOf(p0, c0, -1);
    const far = edgeOf(p1, c1, 1);
    const d = [
      `M ${at(m, p0)}`,
      `L ${at(g, p0)}`,
      near.toCard,
      `L ${at(-deep, near.meet)}`,
      `L ${at(-deep, far.meet)}`,
      `L ${far.card}`,
      far.toPin,
      `L ${at(m, p1)}`,
      "Z",
    ].join(" ");
    // Its bead: squeezed about the pin's centre into the pin's own box,
    // across the edge to the pill's round end, along it to the pin's span.
    const half = (p1 - p0) / 2;
    const mid = (p0 + p1) / 2;
    const spread = Math.max(
      mid - Math.min(p0, near.meet),
      Math.max(p1, far.meet) - mid
    );
    const out = Math.min(1, Math.min(p.w, p.h) / 2 / (m + deep));
    const along = Math.min(1, half / Math.max(1, spread));
    const bead = frame.across
      ? `scale(${along}, ${out})`
      : `scale(${out}, ${along})`;
    return { d, origin: `${cx}px ${cy}px`, bead };
  }

  /** The neck grows out of its bead (`open`) or back into it, drawn where `neck` says, on `timing`. */
  function grow(
    neck: Neck,
    open: boolean,
    timing: { duration: number; easing: string; fill?: FillMode }
  ) {
    if (!neckBlob) {
      return;
    }
    neckBlob.setAttribute("d", neck.d);
    neckBlob.style.setProperty("--neck-origin", neck.origin);
    neckBlob.classList.remove("hidden");
    const at = [{ transform: neck.bead }, { transform: "none" }];
    neckBlob.animate(open ? at : at.reverse(), timing);
  }

  $effect(() => {
    if (stickiness > 0 && blurEl && matrixEl) {
      untrack(applyGoo);
    }
  });

  /** Pouring: the goo layer is the animations', not the template's. */
  let pouring = $state(false);
  /** Where the pill stood as the pour started: the run's pill stays there. */
  let runPill = $state<Box | null>(null);
  /**
   * The pin and its neck as they stand joined, following the pill as the
   * page scrolls under a still card; null when the card stands apart (not
   * joined, its pill out of view, or too far from it to hold a neck).
   */
  const joint = $derived.by(() => {
    if (!(joined && mark)) {
      return null;
    }
    const p = {
      x: mark.x - place.left,
      y: mark.y - place.top,
      w: mark.w,
      h: mark.h,
    };
    const neck = neckOf(p);
    return neck ? { pin: pillShape(p), neck } : null;
  });

  /** The pill in the goo and its faces, where it stands: joined at rest, or where a pour started. */
  const pillAt = $derived(joint?.pin ?? (pouring ? runPill : null));

  // A neck that joins again at rest (after a travel, or the pin coming back
  // beside it) grows out of the pin as a bead, over --dur-morph on
  // --ease-out, never appearing whole.
  let neckWas = false;
  $effect(() => {
    const now = joint;
    if (pouring) {
      neckWas = !!now;
      return;
    }
    if (now && !neckWas && motionOk.current && untrack(() => opened)) {
      grow(now.neck, true, {
        duration: dur("--dur-morph"),
        easing: ease("--ease-out"),
      });
    }
    neckWas = !!now;
  });

  /** The filter's region: the card and, where it holds one, the pill, with room for the blur and the shadow. */
  function region(withPill: Box | null, blur: number) {
    const shape = rest();
    const reach = union(withPill ? [shape, withPill] : [shape]);
    const pad = 3 * blur + 16;
    filterEl?.setAttribute("x", String(reach.x - pad));
    filterEl?.setAttribute("y", String(reach.y - pad));
    filterEl?.setAttribute("width", String(reach.w + 2 * pad));
    filterEl?.setAttribute("height", String(reach.h + 2 * pad));
  }
  $effect(() => {
    // The region follows the card's size and its joined pin at rest.
    const joinedPin = joint?.pin ?? null;
    if (placed.width + placed.height >= 0 && !pouring) {
      region(joinedPin, stickiness);
    }
  });

  /** The pill and its two faces stood at `p` for a run: the blob in the goo, the crisp mark and the joined face over it. */
  function standPill(p: Box) {
    if (!(pillBlob && pinLayer)) {
      return;
    }
    pillBlob.setAttribute("x", String(p.x));
    pillBlob.setAttribute("y", String(p.y));
    pillBlob.setAttribute("width", String(p.w));
    pillBlob.setAttribute("height", String(p.h));
    pillBlob.setAttribute("rx", String(p.h / 2));
    pillBlob.classList.remove("hidden");
    pinLayer.style.setProperty("--pin-x", `${p.x}px`);
    pinLayer.style.setProperty("--pin-y", `${p.y}px`);
    pinLayer.classList.remove("invisible");
  }

  /**
   * One run of the goo, out of the pill (`open`) or back into it: the card,
   * the neck and the thread's clip on one curve over one duration, the
   * pill's own mark handing over to its joined face in step.
   */
  function run(
    from: Shape,
    to: Shape,
    neck: Neck | null,
    timing: { duration: number; easing: string; fill?: FillMode },
    open: boolean
  ): Animation | undefined {
    if (neck) {
      grow(neck, open, timing);
    }
    const faces = open ? [1, 0] : [0, 1];
    if (neck) {
      markFace?.animate(
        faces.map((opacity) => ({ opacity })),
        timing
      );
      joinedFace?.animate(
        faces.map((opacity) => ({ opacity: 1 - opacity })),
        timing
      );
    }
    body?.animate(
      [
        { clipPath: clipOf(from), opacity: open ? 0 : 1 },
        { clipPath: clipOf(to), opacity: open ? 1 : 0 },
      ],
      timing
    );
    return cardBlob?.animate([shapeOf(from), shapeOf(to)], timing);
  }

  /** The card pours out of its pill: one stretch on `--ease-goo`, the recipe's open curve. */
  function pour() {
    const el = float;
    if (!(el && cardBlob)) {
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
    const neck = joined ? neckOf(from) : null;
    runPill = from;
    pouring = true;
    flushSync();
    region(from, blur);
    const done = run(
      pillShape(from),
      rest(),
      neck,
      { duration: knob("--dur-goo"), easing: ease("--ease-goo") },
      true
    );
    done?.finished.then(
      () => {
        pouring = false;
      },
      () => undefined
    );
  }

  /** The card goes back into its pill the way it came, from where it is drawn, on `--ease-out`. */
  function drain(node: HTMLElement): TransitionConfig {
    const card = cardBlob;
    const to = pillIn();
    if (!(card && body && to && motionOk.current)) {
      return fadeOut(node);
    }
    const length = knob("--dur-goo-exit");
    const blur = applyGoo();
    // From where it is drawn: a close caught mid-pour turns back there.
    const drawn = getComputedStyle(card);
    const from: Shape = {
      x: Number.parseFloat(drawn.x),
      y: Number.parseFloat(drawn.y),
      w: Number.parseFloat(drawn.width),
      h: Number.parseFloat(drawn.height),
      r: Number.parseFloat(drawn.rx) || rest().r,
    };
    for (const one of [card, body, neckBlob, markFace, joinedFace]) {
      for (const anim of one?.getAnimations() ?? []) {
        anim.cancel();
      }
    }
    const neck = joined ? neckOf(to) : null;
    // The template stands still through an outro: the pill is stood by hand.
    standPill(to);
    region(to, blur);
    run(
      from,
      pillShape(to),
      neck,
      { duration: length, easing: ease("--ease-out"), fill: "forwards" },
      false
    );
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
      <rect
        bind:this={pillBlob}
        class={["fill-surface-raised", !pillAt && "hidden"]}
        height={pillAt?.h ?? 0}
        rx={(pillAt?.h ?? 0) / 2}
        width={pillAt?.w ?? 0}
        x={pillAt?.x ?? 0}
        y={pillAt?.y ?? 0}
      />
      <path
        bind:this={neckBlob}
        class={[
          "fill-surface-raised origin-(--neck-origin)",
          !joint && "hidden",
        ]}
        d={joint?.neck.d ?? ""}
        style:--neck-origin={joint?.neck.origin}
      />
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
  <!-- The pin over the goo (the recipe's crisp UI layer): its own mark while
       it pours apart, its joined face (its figure on the card's surface)
       while it stands joined. -->
  <div
    aria-hidden="true"
    bind:this={pinLayer}
    class={[
      "pointer-events-none absolute start-0 top-0 translate-x-(--pin-x) translate-y-(--pin-y)",
      !pillAt && "invisible",
    ]}
    data-slot="pin-goo-pill"
    style:--pin-x="{pillAt?.x ?? 0}px"
    style:--pin-y="{pillAt?.y ?? 0}px"
  >
    <div bind:this={pinShift} class="relative flex">
      <div
        bind:this={markFace}
        class={["flex", joint && !pouring && "opacity-0"]}
      >
        {@render pill?.()}
      </div>
      <span
        bind:this={joinedFace}
        class={[
          "absolute inset-0 flex items-center justify-center type-caps num leading-none text-action-solid",
          !joint && "opacity-0",
        ]}
        data-slot="pin-joined-face">{pin}</span
      >
    </div>
  </div>
  <div
    class="flex min-h-0 min-w-0 flex-col gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain p-space-3"
    data-slot="pin-body"
    bind:this={body}
  >
    {@render children()}
  </div>
</div>
