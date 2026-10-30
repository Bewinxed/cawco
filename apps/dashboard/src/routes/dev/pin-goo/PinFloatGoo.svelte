<!--
  PinFloat's card (preview/PinFloat.svelte) with the owner's asks for it,
  for the /dev/pin-goo preview only; the live PinFloat is untouched. Placing
  it is PinFloat's own (`decide`, the plan), less the composer and the foot
  sheet, which stay PinFloat's.

  1. It pours out of its pin (the owner: "with the same goo-out animation
     https://transitions.dev/detail.html?t=gooey-plus-menu"), on that demo's
     clock and curves: open over `--dur-goo` on `--ease-goo` (its
     overshoot), close over `--dur-goo-exit` on `--ease-goo-exit` with the
     pin's dip. The pin, the card and the bridge between them are ONE vector
     silhouette (./silhouette.ts), one `<path>` with a real 1px
     `border-control` stroke, redrawn each frame from the shapes' boxes
     (the owner, of the blur-and-threshold filter it replaces: "looks like a
     lazy way to draw these things honestly"): the card's box grows out of
     the pin's (its corners from the pin's to `radius-lg`) as the clock
     runs, and the union's inward corners are rounded to `--goo-join`, so
     the card pulls a neck out of its pin that thins as they part. Each
     frame only writes: every size is read before the run (the pin's box,
     the card's), and the frame computes and sets the path, the thread's
     clip and the rim. Its drop (`drop-shadow-drop-near`) is a copy of the
     outline drawn once it stands still, faded out over a run (grown.ts's
     rule), so no frame redraws a shadow. What stands on it fades as the
     demo's icons do: the thread in over `--dur-goo-content` after
     `--dur-goo-content-delay`, out over `--dur-goo-content-exit`, on
     `--ease-goo-content`, without their blur; clipped to the card's box as
     drawn all the while. As it closes, the pin and the shape dip
     `--goo-dip` and back over `--dur-goo-settle`, and the card stays until
     that dip is done, the pin's own face back by then.
     Like the demo's menu, it stays on the page through its close: `open`
     turns its clock, and only once a close has landed does it say so
     (`onclosed`) for the page to take it away. A press that opens it again
     before then turns the run back from where it is drawn.
     Joined (the owner: "a toggle that keeps the small gooey part that makes
     the card still connected to the chip"; "it should merge smoothly with
     the comment div … don't narrow it like a dumbbell"; "a wider join"), it
     stands `--space-2` from its pin, and a bridge as tall as the pin runs
     from the pin's centre into the card past its corner: the join is never
     narrower than the pin, and the closing flares it out along the card's
     edge, `--goo-join` each side. The bridge grows and drains on its own
     run of the same clock, follows the pin as the page scrolls, and drains
     when the pin leaves the card's edge; the pin wears the card's surface
     while it is joined, its figure in the action ink: one shape, one edge,
     one shadow. Apart, the closing alone joins them, at most to a neck
     narrower than their resting gap, so it lets go as the card comes to
     rest.
     The pin's status dot (the owner: "shouldn't the status dot morph into a
     glowing rim on the left side of the comment smoothly when open? and
     vice versa?") travels and stretches into a rim along the card's side
     that faces its pin, round that side's corners, in the dot's hue and on
     the open's clock; it gathers back into the dot on the close's, landing
     on its last frame. The rim is the session tab's (DESIGN.md, Session tab
     status rim): a `tab-rim-width` line on the edge, its `tab-rim-glow`
     glow at `tab-rim-mix-subtle`, drawn as strokes stacked wider and
     fainter (no filter), breathing on the shared breath while the agent
     works. Without motion it opens and closes at once, the dot and the rim
     cross-fading.
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
  import {
    curveOf,
    dur,
    ease,
    easeDrawer,
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
    type Plan,
    travelTo,
  } from "#lib/cawco/preview/pin-place.svelte.js";
  import { inStep } from "#lib/components/ui/live-dot/index.js";
  import { besideTop, stackedSpot } from "./hold";
  import {
    plainBox,
    type Radii,
    type Rect,
    rimLine,
    roundedBox,
    type Side,
    silhouette,
  } from "./silhouette";

  let {
    mark,
    box = null,
    room,
    label,
    pin,
    open,
    onclosed,
    float = $bindable(),
    pill,
    joined = true,
    focused = false,
    dot = null,
    children,
  }: {
    /** The pin's status dot, which its joined face keeps by its figure as its mark does, and which pours out into the card's rim. */
    dot?: "live" | "unread" | null;
    /** The pin has keyboard focus: its joined face wears the ring its own face (`pill`) does, as the demo's trigger keeps its own. */
    focused?: boolean;
    /** Poured out of its pin (true), or going back into it (false): the demo's `data-open`. */
    open: boolean;
    /** Its close has landed, the pin's dip done: the page takes it away. Never called once it has opened again. */
    onclosed: () => void;
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
    /** The pill as the page draws it, stood crisp over the shape (the demo's trigger). */
    pill?: Snippet;
    /** It stands `--space-2` from its pin, joined to it by a bridge as tall as the pin, the pin wearing the card's surface: one shape. */
    joined?: boolean;
    children: Snippet;
  } = $props();

  /** The tokens a frame draws with, read once. */
  const JOIN = numberOf("--goo-join");
  const CARD_R = numberOf("--radius-lg");
  const HAIR = numberOf("--radius-hair");
  const DOT = numberOf("--status-dot-size");
  const DOT_OUT = numberOf("--space-row");
  const RIM = numberOf("--tab-rim-width") * 2;
  const GLOW = numberOf("--tab-rim-glow");
  const GLOW_MIX = numberOf("--tab-rim-mix-subtle");
  /**
   * The most one drawn frame moves the clock, ms: three frames at 60 Hz. A
   * longer wait is the browser holding frames, not the run's time
   * (transcript/grown.ts's FRAME_STEP_MS).
   */
  const FRAME_STEP_MS = 50;

  let body = $state<HTMLElement>();
  let clipWrap = $state<HTMLElement>();
  let goo = $state<SVGSVGElement>();
  let rimLayer = $state<SVGSVGElement>();
  let shapePath = $state<SVGPathElement>();
  let dropPath = $state<SVGPathElement>();
  let rimGroup = $state<SVGGElement>();
  let rimGlow = $state<SVGPathElement>();
  let rimCore = $state<SVGPathElement>();
  let rimFade = $state<SVGLinearGradientElement>();
  const uid = $props.id();
  let pinLayer = $state<HTMLElement>();
  let pinShift = $state<HTMLElement>();

  /** Poured out, and not closing: the travel to a new spot only runs while it stands, and the pin wears the card's surface. */
  let opened = $state(false);
  /** Placed once: from then on `open` turns its clock (before, its first pour waits for its size). */
  let ready = false;
  const placed = new FloatPlace(
    () => ({
      mark,
      box,
      room,
      besidePill: joined,
      // Joined, it stands one step from its pin, the bridge between them.
      clear: joined ? numberOf("--space-2") : undefined,
    }),
    {
      body: () => body,
      float: () => float,
      placed: () => {
        ready = true;
        if (open) {
          pour();
          opened = true;
        } else {
          // Closed again before it was ever drawn open: nothing to drain.
          onclosed();
        }
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

  /** The card's box at rest, the float's own. */
  const cardW = $derived(Math.max(0, placed.width));
  const cardH = $derived(Math.max(0, placed.height));

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
   * The card's edge the pin stands beside, along it, within reach of it
   * (its gap and a join), or null: joined, the bridge runs into that edge.
   */
  const besideEdge = $derived.by((): PopSide | null => {
    if (!(joined && pinHere && cardW > 0 && cardH > 0)) {
      return null;
    }
    const p = pinHere;
    const reach = placed.clear + JOIN;
    const alongY = p.y + p.h > 0 && p.y < cardH;
    const alongX = p.x + p.w > 0 && p.x < cardW;
    if (alongY && p.x + p.w <= 0 && -(p.x + p.w) <= reach) {
      return "left";
    }
    if (alongY && p.x >= cardW && p.x - cardW <= reach) {
      return "right";
    }
    if (alongX && p.y + p.h <= 0 && -(p.y + p.h) <= reach) {
      return "top";
    }
    if (alongX && p.y >= cardH && p.y - cardH <= reach) {
      return "bottom";
    }
    return null;
  });
  /** The edge the bridge last ran into, kept while it drains once the pin has left it. */
  let bridgeEdge: PopSide | null = null;
  /** The side the rim runs along: the one facing the pin. */
  const rimSide = $derived<Side>(
    pinHere && pinHere.x + pinHere.w / 2 > cardW / 2 ? "right" : "left"
  );

  // ---- The clock -------------------------------------------------------

  /** A run of one of the shape's two clocks: from where it was drawn to `to`, on a token's curve. */
  interface Run {
    curve: (t: number) => number;
    elapsed: number;
    from: number;
    length: number;
    to: number;
  }
  /** How far the card has poured out of its pin: 0 hidden in it, 1 at rest (past 1 on the open's overshoot). */
  let poured = 0;
  /** How far the joined bridge has grown from the pin into the card, 0 to 1. */
  let grown = 0;
  let pourRun: Run | null = null;
  let growRun: Run | null = null;
  let frame = 0;
  let lastAt = 0;
  /** The card's travel in flight and the pin's way back against it, so the pin's part of the shape stays on the page while the card moves. */
  let travel: Animation | null = null;
  let travelBack = { x: 0, y: 0 };

  /** A knob as the page has it now (the dev page's dials set them on its root), else its token. */
  const knob = (name: `--dur-${string}`): number => {
    const value = float
      ? Number.parseFloat(getComputedStyle(float).getPropertyValue(name))
      : Number.NaN;
    return Number.isFinite(value) ? value : dur(name);
  };

  const runTo = (from: number, to: boolean): Run => ({
    from,
    to: to ? 1 : 0,
    elapsed: 0,
    length: knob(to ? "--dur-goo" : "--dur-goo-exit"),
    curve: curveOf(to ? "--ease-goo" : "--ease-goo-exit"),
  });
  const runAt = (run: Run) =>
    run.from +
    (run.to - run.from) * run.curve(Math.min(1, run.elapsed / run.length));

  function tick(now: number) {
    const step = Math.max(0, Math.min(now - lastAt, FRAME_STEP_MS));
    lastAt = now;
    for (const run of [pourRun, growRun]) {
      if (run) {
        run.elapsed += step;
      }
    }
    if (pourRun) {
      poured = runAt(pourRun);
      if (pourRun.elapsed >= pourRun.length) {
        pourRun = null;
      }
    }
    if (growRun) {
      grown = runAt(growRun);
      if (growRun.elapsed >= growRun.length) {
        growRun = null;
      }
    }
    draw();
    if (pourRun || growRun || travel?.playState === "running") {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      still();
    }
  }
  /** Starts the frames, if they are not running. */
  function kick() {
    if (float) {
      float.dataset.run = "";
    }
    if (!frame) {
      lastAt = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }
  /** It stands still: its drop drawn once, under the outline as it stands, and the thread unclipped once it is open. */
  function still() {
    if (float) {
      delete float.dataset.run;
    }
    dropPath?.setAttribute("d", shapePath?.getAttribute("d") ?? "");
    if (clipWrap && poured >= 1) {
      clipWrap.style.clipPath = "none";
    }
  }

  /** The card pours out (true) or drains back (false) from where it is drawn; without motion, at once. */
  function pourTo(to: boolean) {
    if (!motionOk.current) {
      pourRun = null;
      poured = to ? 1 : 0;
      draw();
      still();
      return;
    }
    pourRun = runTo(poured, to);
    kick();
  }

  // The bridge grows while the card stands open beside its pin, and drains
  // as it closes or once the pin leaves its edge.
  const bridgeWanted = $derived(opened && besideEdge !== null);
  $effect(() => {
    const to = bridgeWanted;
    untrack(() => {
      if ((to ? 1 : 0) === (growRun?.to ?? grown)) {
        return;
      }
      if (!motionOk.current) {
        growRun = null;
        grown = to ? 1 : 0;
        draw();
        return;
      }
      growRun = runTo(grown, to);
      kick();
    });
  });

  // ---- A frame -----------------------------------------------------------

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const unit = (t: number) => Math.max(0, Math.min(1, t));
  /** Whether the rim was shown at once (without motion), for its fade. */
  let rimFaded = false;

  /**
   * Draws the shape as the clocks stand: writes only. The card's box from
   * the pin's toward its own, the bridge into the edge it last ran into,
   * the union closed by the join, the thread's clip on the card's box, and
   * the rim.
   */
  function draw() {
    const path = shapePath;
    if (!(path && cardW > 0 && cardH > 0)) {
      return;
    }
    const k = unit(poured);
    // The pin's part stays on the page while the card travels.
    let back = { x: 0, y: 0 };
    if (travel?.playState === "running") {
      const t = Number(travel.currentTime ?? 0) / dur("--dur-morph");
      const left = 1 - easeDrawer(unit(t));
      back = { x: travelBack.x * left, y: travelBack.y * left };
    }
    const p = pinHere
      ? { ...pinHere, x: pinHere.x + back.x, y: pinHere.y + back.y }
      : null;
    const pinRadii: Radii = p
      ? [p.h / 2, p.h / 2, p.h / 2, HAIR]
      : [CARD_R, CARD_R, CARD_R, CARD_R];
    const from: Rect = p ?? { x: 0, y: 0, w: cardW, h: cardH };
    const card: Rect = {
      x: lerp(from.x, 0, poured),
      y: lerp(from.y, 0, poured),
      w: lerp(from.w, cardW, poured),
      h: lerp(from.h, cardH, poured),
    };
    const radii = pinRadii.map((r) => lerp(r, CARD_R, k)) as Radii;
    const shapes = [roundedBox(card, radii)];
    if (p) {
      shapes.push(roundedBox(p, pinRadii));
      if (besideEdge) {
        bridgeEdge = besideEdge;
      }
      const span = bridgeEdge ? bridgeOf(p, card, radii, bridgeEdge) : null;
      if (span) {
        shapes.push(plainBox(span));
      }
    }
    // Apart, the closing joins them only to a neck narrower than their
    // resting gap, so it lets go as the card comes to rest.
    const join = joined ? JOIN : Math.min(JOIN, placed.clear / 2 - 1);
    path.setAttribute("d", silhouette(shapes, Math.max(0, join)));
    if (clipWrap && (pourRun || poured < 1)) {
      const [tl, tr, br, bl] = radii;
      const edge = (n: number) => `${Math.max(0, n).toFixed(2)}px`;
      clipWrap.style.clipPath = `inset(${edge(card.y)} ${edge(cardW - card.x - card.w)} ${edge(cardH - card.y - card.h)} ${edge(card.x)} round ${edge(tl)} ${edge(tr)} ${edge(br)} ${edge(bl)})`;
    }
    drawRim(p, card, radii, k);
  }

  /** The bridge at this frame: from the pin's centre into the card's edge, past its corner, as far as it has grown; null with nothing to draw. */
  function bridgeOf(
    p: Rect,
    card: Rect,
    radii: Radii,
    edge: PopSide
  ): Rect | null {
    const [tl, tr, br, bl] = radii;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    let span: Rect | null = null;
    if (edge === "left") {
      const run = (card.x + Math.max(tl, bl) - cx) * grown;
      span = { x: cx, y: p.y, w: run, h: p.h };
    } else if (edge === "right") {
      const run = (cx - (card.x + card.w - Math.max(tr, br))) * grown;
      span = { x: cx - run, y: p.y, w: run, h: p.h };
    } else if (edge === "top") {
      const run = (card.y + Math.max(tl, tr) - cy) * grown;
      span = { x: p.x, y: cy, w: p.w, h: run };
    } else {
      const run = (cy - (card.y + card.h - Math.max(bl, br))) * grown;
      span = { x: p.x, y: cy - run, w: p.w, h: run };
    }
    return span.w > 0.01 && span.h > 0.01 ? span : null;
  }

  /**
   * The rim as the card stands: the status dot (where PinDot stands, on the
   * pin's top-end corner) carried to the side facing the pin and stretched
   * along it as the card pours out; gathered back into the dot as it
   * drains. The pins' own dots stand hidden while it is drawn.
   */
  function drawRim(p: Rect | null, card: Rect, radii: Radii, k: number) {
    const group = rimGroup;
    const showing = !!(group && dot && p && k > 0);
    for (const one of pinLayer?.querySelectorAll<HTMLElement>("[data-dot]") ??
      []) {
      one.style.visibility = showing ? "hidden" : "";
    }
    if (!(group && rimLayer)) {
      return;
    }
    rimLayer.style.visibility = showing ? "visible" : "hidden";
    if (!(showing && p)) {
      rimFaded = false;
      return;
    }
    const at = {
      x: p.x + p.w + DOT_OUT - DOT / 2,
      y: p.y - DOT_OUT + DOT / 2,
    };
    // Joined, the rim flows out of the join's flare, never through it.
    const mouth =
      grown > 0 && (bridgeEdge === "left" || bridgeEdge === "right")
        ? { from: p.y - JOIN, to: p.y + p.h + JOIN }
        : null;
    const line = rimLine(card, radii, rimSide, RIM / 2, at, mouth);
    const length = line.length * k;
    const start = line.s * (1 - k);
    group.setAttribute(
      "transform",
      `translate(${((at.x - line.at.x) * (1 - k)).toFixed(2)} ${((at.y - line.at.y) * (1 - k)).toFixed(2)})`
    );
    const core = lerp(DOT, RIM, k);
    const glow = core + 2 * GLOW * k;
    for (const [stroke, width] of [
      [rimGlow, glow],
      [rimCore, core],
    ] as const) {
      stroke?.setAttribute("d", line.d);
      stroke?.setAttribute(
        "stroke-dasharray",
        `${length} ${line.length + DOT}`
      );
      stroke?.setAttribute("stroke-dashoffset", String(-start));
      stroke?.setAttribute("stroke-width", String(width));
    }
    // The glow's fade runs across the side's line, so where the rim turns
    // round a corner it runs out of its glow: the tab rim's taper.
    rimFade?.setAttribute("x1", String(line.at.x - glow / 2));
    rimFade?.setAttribute("x2", String(line.at.x + glow / 2));
    rimGlow?.setAttribute("stroke-opacity", String(GLOW_MIX * k));
    if (!(motionOk.current || rimFaded)) {
      // Without motion, the dot and the rim cross-fade.
      rimFaded = true;
      rimLayer.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
      });
    }
  }

  // Drawn again whenever what it is drawn from changes (the page scrolls,
  // the card's size or its status changes), between runs as within them.
  $effect(() => {
    draw();
  });
  $effect(() => () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(closing);
  });

  // A new plan, or a new spot once the pill has left the card's height: it
  // travels there once, over --dur-morph on --ease-drawer, from where it is
  // drawn (a travel in flight counted).
  let stood: { left: number; plan: Plan | null; top: number } | null = null;
  /** The pin's own counter-travel, while the card travels. */
  let stay: Animation | null = null;
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
    stay?.cancel();
    travel = travelTo(el, before, at, travel);
    // The pin stays on the page while the card travels: its part of the
    // shape and its faces go the other way, on the travel's own timing, so
    // only the shape between them stretches.
    travelBack = {
      x: at.left - before.left - dx,
      y: at.top - before.top - dy,
    };
    stay =
      pinShift?.animate(
        [
          { transform: `translate(${travelBack.x}px, ${travelBack.y}px)` },
          { transform: "translate(0px, 0px)" },
        ],
        { duration: dur("--dur-morph"), easing: ease("--ease-drawer") }
      ) ?? null;
    untrack(kick);
  });

  /** The demo's setOpen: `data-open` (what the thread's fade follows), then the card's clock. */
  function setOpen(to: boolean) {
    const el = float;
    if (!el) {
      return;
    }
    el.dataset.open = String(to);
    pourTo(to);
  }

  /** The card pours out of its pin. */
  function pour() {
    const el = float;
    if (!el) {
      return;
    }
    if (!pinHere) {
      // No pin on the page to pour from: a cross-fade where it stands.
      poured = 1;
      if (motionOk.current) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: dur("--dur-control"),
          easing: ease("--ease-out"),
        });
      }
    }
    // Its closed state drawn first (the card hidden in its pin, at the size
    // it was just measured at), so the run starts from it.
    flushSync();
    draw();
    setOpen(true);
  }

  /** The demo's anticipation: the shape and the pin dip and come home as it closes. */
  function dip() {
    const dy = `translateY(${numberOf("--goo-dip")}px)`;
    const easing = ease("--ease-goo-exit");
    for (const one of [goo, rimLayer, pinLayer]) {
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

  /** The close in flight: `onclosed` once it lands. */
  let closing = 0;
  /** The fade a close without a pin to drain into (or without motion) plays. */
  let fade: Animation | null = null;

  /** The card goes back into its pin, and stays drawn until the pin's dip is done; with no pin on screen, or without motion, it fades where it stands. */
  function close() {
    const el = float;
    opened = false;
    window.clearTimeout(closing);
    fade?.cancel();
    if (!el) {
      onclosed();
      return;
    }
    let length: number;
    if (pinHere && motionOk.current) {
      setOpen(false);
      dip();
      length = Math.max(knob("--dur-goo-exit"), knob("--dur-goo-settle"));
    } else {
      el.dataset.open = "false";
      length = dur("--dur-control");
      fade = el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: length,
        easing: ease("--ease-out"),
        fill: "forwards",
      });
    }
    closing = window.setTimeout(onclosed, length);
  }

  /** Opened again before its close landed: the same run turns back toward open. */
  function reopen() {
    window.clearTimeout(closing);
    fade?.cancel();
    fade = null;
    setOpen(true);
    opened = true;
  }

  // Each press after its first pour: `open` turns the card's clock.
  $effect(() => {
    const want = open;
    untrack(() => {
      if (ready) {
        (want ? reopen : close)();
      }
    });
  });
</script>

<div
  aria-label={label}
  class="group/goo pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max) start-(--float-x) top-(--float-y) w-(--float-w)"
  data-face={opened && besideEdge !== null ? "joined" : "own"}
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
  style:--pin-x="{pinHere?.x ?? 0}px"
  style:--pin-y="{pinHere?.y ?? 0}px"
>
  <!-- The one silhouette: the pin, the bridge and the card as one path,
       its drop under it drawn once it stands still. -->
  <svg
    aria-hidden="true"
    bind:this={goo}
    class="pointer-events-none absolute start-0 top-0 -z-1 size-full overflow-visible"
    data-slot="pin-goo"
  >
    <path
      bind:this={dropPath}
      class="fill-surface-raised drop-shadow-drop-near transition-opacity duration-(--dur-goo-content) ease-goo-content group-data-run/goo:opacity-0 group-data-run/goo:duration-(--dur-goo-content-exit) motion-reduce:transition-none"
      data-slot="goo-drop"
    />
    <path
      bind:this={shapePath}
      class="fill-surface-raised stroke-border-control"
      data-slot="goo-shape"
      stroke-width="1"
    />
  </svg>
  <!-- The pin over the shape (the demo's crisp trigger): its own face, or,
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
        class="absolute inset-0 flex items-center justify-center whitespace-nowrap rounded-pill data-tail:rounded-es-hair type-caps num leading-none text-action-solid data-focused:outline-2 data-focused:outline-offset-2 data-focused:outline-solid data-focused:outline-focus-ring opacity-0 transition-[opacity] duration-(--dur-goo-content-exit) ease-goo-content group-data-[face=joined]/goo:opacity-100 group-data-[face=joined]/goo:duration-(--dur-goo-content) motion-reduce:transition-none"
        data-focused={focused || undefined}
        data-slot="pin-joined-face"
        data-tail
        ><span data-figure>{pin}</span>{#if dot}<PinDot {dot} />{/if}</span
      >
    </div>
  </div>
  <!-- The status dot poured out into a rim on the card's side that faces
       its pin: over the pin, so the dot it starts as stands where the pin's
       own stood. -->
  <svg
    aria-hidden="true"
    bind:this={rimLayer}
    class="pointer-events-none invisible absolute start-0 top-0 size-full overflow-visible"
    data-slot="pin-goo-rim"
  >
    <defs>
      <!-- The glow across the rim's line: its hue at the line, none at its
           reach, falling off as a blur does. -->
      <linearGradient
        bind:this={rimFade}
        gradientUnits="userSpaceOnUse"
        id="{uid}-rim-fade"
        x1="0"
        x2="1"
        y1="0"
        y2="0"
      >
        <stop class="stop-rim-ink" offset="0" stop-opacity="0" />
        <stop class="stop-rim-ink" offset="0.3" stop-opacity="0.25" />
        <stop class="stop-rim-ink" offset="0.5" stop-opacity="1" />
        <stop class="stop-rim-ink" offset="0.7" stop-opacity="0.25" />
        <stop class="stop-rim-ink" offset="1" stop-opacity="0" />
      </linearGradient>
    </defs>
    <g
      bind:this={rimGroup}
      class="fill-none"
      stroke-linecap="round"
      style:--rim-ink={dot === "unread"
        ? "var(--status-attn-glyph)"
        : "var(--status-live-glyph)"}
    >
      {#key dot}
        <g class={[dot === "live" && "breathe"]} {@attach inStep}>
          <path bind:this={rimGlow} stroke="url(#{uid}-rim-fade)" />
          <path bind:this={rimCore} class="stroke-(--rim-ink)" />
        </g>
      {/key}
    </g>
  </svg>
  <div
    class="flex min-h-0 min-w-0 flex-col"
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
