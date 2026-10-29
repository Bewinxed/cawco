<!--
  PinFloat's card (preview/PinFloat.svelte) with the owner's two asks for it,
  for the /dev/pin-goo preview only; the live PinFloat is untouched. Placing
  it is PinFloat's own (`decide`, the plan), less the composer and the foot
  sheet, which stay PinFloat's.

  1. It pours out of its pin (the owner: "with the same goo-out animation
     https://transitions.dev/detail.html?t=gooey-plus-menu"), on that demo's
     own code as the page serves it, its shapes made the pin and the card
     (the demo's markup, filter, CSS and script are in the project's
     assets/6bff32c7/gooey-demo/). ONE goo layer: an SVG group under one
     filter, `feGaussianBlur` (stdDeviation `--goo-blur`, 6) then an
     `feColorMatrix` alpha row `slope (0.5 - slope × 5/12)` (slope
     `--goo-threshold`, 18: `18 -7`), `feComposite atop` the source, the
     merged silhouette's edge and shadow drawn after it (here `border-control`
     as a 1px ring round the alpha binarized at 0.5, and `shadow-hairline`).
     The shapes are the demo's trigger and item: the pin's blob, which stays
     at the pin, and the card's, which rests at its box and hides under the
     pin while closed. A `data-open` attribute on the card moves the card's
     blob, by a CSS transition of its transform alone (`transform-box:
     fill-box`): open, from the pin to its rest over `--dur-goo` on
     `--ease-goo`; closed, back over `--dur-goo-exit` on `--ease-goo-exit`.
     The demo's item is the trigger's size, so it only translates; the card
     also scales from the pin's box. Apart, the neck between them is the filter's
     alone: it forms while the blobs are near and lets go as they part. What
     stands on the shapes comes and goes as the demo's icons do: the thread
     fades in over `--dur-goo-content` after `--dur-goo-content-delay`, and
     out over `--dur-goo-content-exit`, on `--ease-goo-content` (without
     their 2px blur: a transitioned filter can hang WebKit), clipped to its
     blob all the while, since it cannot ride it as the icons ride theirs. As it closes, the pin and the goo dip `--goo-dip`
     and back over `--dur-goo-settle` (the demo's anticipation), and the card
     stays until that dip is done, the pin's own face back by then.
     Joined (the owner: "a toggle that keeps the small gooey part that makes
     the card still connected to the chip"; "it should merge smoothly with
     the comment div … don't narrow it like a dumbbell"), it stands one goo
     blur from its pin, and a third shape in the same layer, a bridge as wide
     as the pin from its centre into the card, holds the join straight: the
     filter only rounds the inside corners where it meets the card. The
     bridge grows and drains with the card on its transition, slides with
     the pin as the page scrolls, and drains when the pin leaves the card's
     edge; the pin wears the card's surface while it is joined, its figure
     in the action ink: one shape, one edge, one shadow.
     Without motion it opens and closes at once, as the demo does.
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
  import PinDot from "#lib/cawco/preview/PinDot.svelte";
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
    focused = false,
    dot = null,
    onhold,
    children,
  }: {
    /** The pin's status dot, which its joined face keeps by its figure as its mark does. */
    dot?: "live" | "unread" | null;
    /** The pin has keyboard focus: its joined face wears the ring its own face (`pill`) does, as the demo's trigger keeps its own. */
    focused?: boolean;
    /** Whether the goo draws the pin itself: the page's own pill, its edge and its ring step back while it does. */
    onhold?: (holding: boolean) => void;
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
    /** The pill as the page draws it, stood crisp over the goo (the demo's trigger). */
    pill?: Snippet;
    /** It stands one blur from its pin, joined to it by a bridge as wide as the pin, the pin wearing the card's surface: one shape. */
    joined?: boolean;
    /** How far apart the card and its pin still pull a neck between them, px: the goo's blur (`--goo-blur`). */
    stickiness?: number;
    children: Snippet;
  } = $props();

  const uid = $props.id();
  let body = $state<HTMLElement>();
  let clipWrap = $state<HTMLElement>();
  let goo = $state<SVGSVGElement>();
  let pillBlob = $state<SVGRectElement>();
  let pinLayer = $state<HTMLElement>();
  let pinShift = $state<HTMLElement>();
  let filterEl = $state<SVGFilterElement>();
  let blurEl = $state<SVGFEGaussianBlurElement>();
  let matrixEl = $state<SVGFEColorMatrixElement>();

  /** Poured out: the travel to a new spot only runs once it stands. */
  let opened = $state(false);
  const placed = new FloatPlace(
    () => ({
      mark,
      box,
      room,
      besidePill: joined,
      // Joined, it stands one blur from its pin, within the goo's reach
      // (a 20px pin, blur 6: the filter pulls no neck past 9px), the
      // bridge between them.
      clear: joined ? stickiness : undefined,
    }),
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
    // go the other way, on the travel's own timing, so only the goo between
    // them stretches.
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

  /** The demo's applyGooKnobs: the blur and the alpha row, set as each run starts and as the stickiness changes. */
  function applyGoo() {
    const blur = stickiness;
    const slope = knob("--goo-threshold");
    const intercept = Math.round((0.5 - slope * (5 / 12)) * 100) / 100;
    blurEl?.setAttribute("stdDeviation", String(blur));
    matrixEl?.setAttribute(
      "values",
      `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${slope} ${intercept}`
    );
  }
  $effect(() => {
    if (stickiness > 0 && blurEl && matrixEl) {
      untrack(applyGoo);
    }
  });

  /** The card's blob at rest: its box less the 1px edge the filter rings it with, `radius-lg` corners. */
  const cardW = $derived(Math.max(0, placed.width - 2));
  const cardH = $derived(Math.max(0, placed.height - 2));
  const cardR = Math.max(0, numberOf("--radius-lg") - 1);

  /** The pill where it stands now, in the card's own coordinates; null while it is out of view. */
  const pinHere = $derived(
    mark
      ? {
          x: mark.x - place.left,
          y: mark.y - place.top,
          w: mark.w,
          h: mark.h,
        }
      : null
  );

  /**
   * Where the card's blob hides while closed: the pin's box, as a transform
   * of its rest box about its own top-left corner (the demo's items rest
   * under its trigger at `translate(0, 0)`).
   */
  const hidden = $derived(
    pinHere && cardW > 0 && cardH > 0
      ? `translate(${pinHere.x - 1}px, ${pinHere.y - 1}px) scale(${pinHere.w / cardW}, ${pinHere.h / cardH})`
      : "none"
  );
  /**
   * The thread's clip while closed: the same box, the pin's, round-ended.
   * The demo's icons ride their blobs; a thread cannot scale, so it is
   * clipped to its blob instead, the clip on the blob's own transition (a
   * box's edges move alike under either), and nothing of it stands past
   * the shape as it pours or drains.
   */
  const hiddenClip = $derived(
    pinHere
      ? `inset(${pinHere.y}px ${placed.width - pinHere.x - pinHere.w}px ${placed.height - pinHere.y - pinHere.h}px ${pinHere.x}px round ${pinHere.h / 2}px)`
      : "none"
  );

  /** The joined bridge: its box in the card's coordinates, the end it grows from (the pin's centre), and its drained transform. */
  interface Bridge {
    h: number;
    hide: string;
    origin: string;
    w: number;
    x: number;
    y: number;
  }
  /**
   * Joined, a bridge as wide as the pin runs from the pin's centre into the
   * card's edge, past its round corner, in the blobs' fill: goo holds a
   * straight join with a shape of its own, so the filter only fills the two
   * inside corners where it meets the card with outward fillets, and the
   * join is never narrower than the pin (a blur-and-threshold neck alone
   * always pinches into a waist). Only while the pin stands beside one of
   * the card's edges, along it, within one and a half blurs of it (past
   * that the filter would pull no neck). The pin then wears the card's
   * surface.
   */
  const bridge = $derived.by((): Bridge | null => {
    if (!(joined && pinHere && cardW > 0 && cardH > 0)) {
      return null;
    }
    const p = pinHere;
    const reach = stickiness * 1.5;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const left = 1;
    const top = 1;
    const right = 1 + cardW;
    const foot = 1 + cardH;
    const alongY = p.y + p.h > top && p.y < foot;
    const alongX = p.x + p.w > left && p.x < right;
    if (alongY && p.x + p.w <= left && left - (p.x + p.w) <= reach) {
      const end = left + cardR;
      return {
        x: cx,
        y: p.y,
        w: end - cx,
        h: p.h,
        origin: "0% 50%",
        hide: "scaleX(0)",
      };
    }
    if (alongY && p.x >= right && p.x - right <= reach) {
      const end = right - cardR;
      return {
        x: end,
        y: p.y,
        w: cx - end,
        h: p.h,
        origin: "100% 50%",
        hide: "scaleX(0)",
      };
    }
    if (alongX && p.y + p.h <= top && top - (p.y + p.h) <= reach) {
      const end = top + cardR;
      return {
        x: p.x,
        y: cy,
        w: p.w,
        h: end - cy,
        origin: "50% 0%",
        hide: "scaleY(0)",
      };
    }
    if (alongX && p.y >= foot && p.y - foot <= reach) {
      const end = foot - cardR;
      return {
        x: p.x,
        y: end,
        w: p.w,
        h: cy - end,
        origin: "50% 100%",
        hide: "scaleY(0)",
      };
    }
    return null;
  });
  const bridged = $derived(bridge !== null);
  /** The bridge as drawn: where it stands, or, once the pin has left it, where it last stood, while it drains back into the pin. */
  let keptBridge: Bridge | null = null;
  const drawnBridge = $derived.by(() => {
    if (bridge) {
      keptBridge = bridge;
    }
    return keptBridge;
  });

  // The goo draws the pin while it is on screen; gone (after its close), it
  // holds the pin no more.
  $effect(() => {
    onhold?.(pinHere !== null);
  });
  $effect(() => () => {
    window.clearTimeout(runEnd);
    untrack(() => onhold)?.(false);
  });

  /** The filter's region: the card and the pin, with room for the blur and the shadow. */
  $effect(() => {
    const shape = { x: 1, y: 1, w: cardW, h: cardH };
    const reach = union(pinHere ? [shape, pinHere] : [shape]);
    const pad = 3 * stickiness + 16;
    filterEl?.setAttribute("x", String(reach.x - pad));
    filterEl?.setAttribute("y", String(reach.y - pad));
    filterEl?.setAttribute("width", String(reach.w + 2 * pad));
    filterEl?.setAttribute("height", String(reach.h + 2 * pad));
  });

  /** The thread's clip at the card's own box and corners: where a run starts or ends open. */
  const cardClip = () => `inset(0px round ${cardR + 1}px)`;
  // While closed, the thread's clip stands on the pin's box (set by hand:
  // the runs set it too, and the template stands still through an outro).
  $effect(() => {
    const at = hiddenClip;
    if (clipWrap && untrack(() => float?.dataset.open) !== "true") {
      clipWrap.style.clipPath = at;
    }
  });

  /**
   * The pill and the thread's closed clip as last drawn: what a close reads.
   * Its outro runs once the card's block has let it go, every derived here
   * frozen by then (scripts/outro-reads-check.ts).
   */
  let drawn = {
    pin: untrack(() => pinHere),
    clip: untrack(() => hiddenClip),
  };
  $effect(() => {
    drawn = { pin: pinHere, clip: hiddenClip };
  });

  /** The run in flight: while it lasts (`data-run`), the card's blob moves on a transition; between runs its box only follows the pin and the card's size. */
  let runEnd = 0;
  /**
   * The demo's setOpen: the goo's knobs, then `data-open`, which the CSS
   * transitions follow. Closed, the pin takes its own face back. Set by hand,
   * since the template stands still through an outro.
   */
  function setOpen(open: boolean) {
    const el = float;
    if (!el) {
      return;
    }
    applyGoo();
    window.clearTimeout(runEnd);
    const wrap = clipWrap;
    // A close starts with the thread clipped to the card's box (open, it
    // stands unclipped), so the clip transitions from there.
    if (wrap && !open) {
      wrap.style.clipPath = cardClip();
    }
    el.dataset.run = "";
    el.getBoundingClientRect();
    el.dataset.open = String(open);
    if (wrap) {
      wrap.style.clipPath = open ? cardClip() : drawn.clip;
    }
    if (!open) {
      el.dataset.face = "own";
    }
    runEnd = window.setTimeout(
      () => {
        delete el.dataset.run;
        if (wrap && open) {
          wrap.style.clipPath = "none";
        }
      },
      knob(open ? "--dur-goo" : "--dur-goo-exit") + 50
    );
  }

  /** The card pours out of its pin. */
  function pour() {
    const el = float;
    if (!el) {
      return;
    }
    if (!pinHere && motionOk.current) {
      // No pin on the page to pour from: a cross-fade where it stands.
      el.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
      });
    }
    // Its closed state drawn first (the blob hidden under the pin at the
    // size it was just measured at), so the transitions run from it.
    flushSync();
    el.getBoundingClientRect();
    setOpen(true);
  }

  /** The demo's anticipation: the goo and the pin dip and come home as it closes. */
  function dip() {
    const dy = `translateY(${numberOf("--goo-dip")}px)`;
    const easing = ease("--ease-goo-exit");
    for (const one of [goo, pinLayer]) {
      one?.animate(
        [
          { transform: "translateY(0px)", easing },
          { transform: dy, easing, offset: 0.3 },
          { transform: "translateY(0px)" },
        ],
        { duration: knob("--dur-goo-settle"), fill: "both" }
      );
    }
  }

  /** The card goes back into its pin, and stays drawn until the pin's dip is done. */
  function drain(node: HTMLElement): TransitionConfig {
    if (!(drawn.pin && motionOk.current)) {
      setOpen(false);
      return fadeOut(node);
    }
    setOpen(false);
    dip();
    return {
      duration: Math.max(knob("--dur-goo-exit"), knob("--dur-goo-settle")),
    };
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
  class="group/goo pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max) start-(--float-x) top-(--float-y) w-(--float-w)"
  data-face={opened && bridged ? "joined" : "own"}
  data-open="false"
  data-side={place.side}
  data-slot="pin-card"
  data-pin-card={pin}
  role="dialog"
  bind:this={float}
  style:--float-x="{place.left}px"
  style:--float-y="{place.top}px"
  style:--float-w={FLOAT_W}
  style:--float-max="{place.max}px"
  style:--goo-hidden={hidden}
  style:--pin-x="{pinHere?.x ?? 0}px"
  style:--pin-y="{pinHere?.y ?? 0}px"
  out:leave|global
>
  <!-- The one goo layer: the pin and the card as SVG shapes under the demo's filter. -->
  <svg
    aria-hidden="true"
    bind:this={goo}
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
        <!-- The edge, `border-control`: the silhouette made hard at 0.5, then 1px out (the demo's ring). -->
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
      <!-- The card's blob (the demo's item): hidden under the pin while
           closed, at its rest box while open; only its transform moves. -->
      <rect
        class="fill-surface-raised origin-top-left transform-(--goo-hidden) transform-fill transition-transform duration-0 ease-goo-exit group-data-[open=false]/goo:group-data-run/goo:duration-(--dur-goo-exit) group-data-[open=true]/goo:transform-none group-data-[open=true]/goo:group-data-run/goo:duration-(--dur-goo) group-data-[open=true]/goo:ease-goo motion-reduce:transition-none"
        data-slot="goo-card"
        height={cardH}
        rx={cardR}
        width={cardW}
        x="1"
        y="1"
      />
      <!-- The joined bridge, as wide as the pin, from its centre into the
           card: drained into the pin (scaled to nothing toward it) unless
           the pin wears the card's surface, on the card's own timing. -->
      <rect
        class={[
          "fill-surface-raised origin-(--bridge-origin) transform-(--bridge-hidden) transform-fill transition-transform duration-(--dur-goo-exit) ease-goo-exit group-data-[face=joined]/goo:transform-none group-data-[face=joined]/goo:duration-(--dur-goo) group-data-[face=joined]/goo:ease-goo motion-reduce:transition-none",
          !drawnBridge && "hidden",
        ]}
        data-slot="goo-bridge"
        height={drawnBridge?.h ?? 0}
        style:--bridge-hidden={drawnBridge?.hide}
        style:--bridge-origin={drawnBridge?.origin}
        width={drawnBridge?.w ?? 0}
        x={drawnBridge?.x ?? 0}
        y={drawnBridge?.y ?? 0}
      />
      <!-- The pin's blob (the demo's trigger), where the pin stands. -->
      <rect
        bind:this={pillBlob}
        class={["fill-surface-raised", !pinHere && "hidden"]}
        data-slot="goo-pin"
        height={pinHere?.h ?? 0}
        rx={(pinHere?.h ?? 0) / 2}
        width={pinHere?.w ?? 0}
        x={pinHere?.x ?? 0}
        y={pinHere?.y ?? 0}
      />
    </g>
  </svg>
  <!-- The pin over the goo (the demo's crisp trigger): its own face, or,
       joined, its figure on the card's surface. The two trade places at once,
       the one going over the demo's icons' out and the other coming over
       their in, so its figure, which stands in one place on both, never
       leaves (the demo's trigger keeps its mark). -->
  <div
    aria-hidden="true"
    bind:this={pinLayer}
    class={[
      "pointer-events-none absolute start-0 top-0 translate-x-(--pin-x) translate-y-(--pin-y)",
      !pinHere && "invisible",
    ]}
    data-slot="pin-goo-pill"
  >
    <div bind:this={pinShift} class="relative flex">
      <div
        class="flex transition-[opacity] duration-(--dur-goo-content) ease-goo-content group-data-[face=joined]/goo:opacity-0 group-data-[face=joined]/goo:duration-(--dur-goo-content-exit) motion-reduce:transition-none"
        data-slot="pin-own-face"
      >
        {@render pill?.()}
      </div>
      <!-- mark-line: the dot stands on the pin's top-end corner, absolutely, not beside its figure -->
      <span
        class="absolute inset-0 flex items-center justify-center rounded-pill data-tail:rounded-es-hair type-caps num leading-none text-action-solid data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-solid data-focused:outline-focus-ring opacity-0 transition-[opacity] duration-(--dur-goo-content-exit) ease-goo-content group-data-[face=joined]/goo:opacity-100 group-data-[face=joined]/goo:duration-(--dur-goo-content) motion-reduce:transition-none"
        data-focused={focused || undefined}
        data-slot="pin-joined-face"
        data-tail
        ><span data-figure>{pin}</span>{#if dot}<PinDot {dot} />{/if}</span
      >
    </div>
  </div>
  <div
    class="flex min-h-0 min-w-0 flex-col transition-[clip-path] duration-0 ease-goo-exit group-data-[open=false]/goo:group-data-run/goo:duration-(--dur-goo-exit) group-data-[open=true]/goo:group-data-run/goo:duration-(--dur-goo) group-data-[open=true]/goo:ease-goo motion-reduce:transition-none"
    bind:this={clipWrap}
    data-slot="pin-goo-clip"
  >
    <div
      class="flex min-h-0 min-w-0 flex-col gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain p-space-3 opacity-0 transition-[opacity] duration-(--dur-goo-content-exit) ease-goo-content group-data-[open=true]/goo:opacity-100 group-data-[open=true]/goo:duration-(--dur-goo-content) group-data-[open=true]/goo:delay-(--dur-goo-content-delay) motion-reduce:transition-none"
      data-slot="pin-body"
      bind:this={body}
    >
      {@render children()}
    </div>
  </div>
</div>
