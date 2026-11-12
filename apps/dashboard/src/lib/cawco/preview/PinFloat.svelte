<!--
  What stands beside a comment's pill over the page: its composer while it
  is written (bare: the composer's own pill is its surface) and its thread
  once it is (the raised card recipe: `--radius-lg`, `--color-border-control`,
  `--shadow-hairline`, `--spacing-space-3` padding). One width for both,
  `--spacing-c-pin-card-reading-w` (two fifths of the well, 280 to 480px: the pin
  room is the size container its `cqi` reads), never past the well's room,
  so a card never changes width as it goes from composer to thread
  (commenting addendum §3; the owner's pick "Beside the comment").

  Its height is what it holds, up to the well's height less `--spacing-space-2`
  each side; only a card the whole well can't hold scrolls inside (the
  owner: "it should show besides the comment but should have handling to
  grow taller when appropriate"). It stands clear of what the comment is
  about (the element's box and the pill together, `subject`) wherever that
  leaves room for all of it: beside them at their end side, else at their
  start side, its top at the pill's, shifted up as far as it takes to stand
  whole in the well (the room above the pill once the room below it runs
  out); else below them, else above them, where that side holds it whole.
  An element too wide to stand beside, whose rooms above and below can't
  hold the thread, has it beside its pill alone, over the element, the same
  way (the owner: "i can't read here", of a long thread scrolling in the
  room above one); else under or over the pill, whichever holds more, at
  that side's room. Always `--spacing-space-2` from the pill as drawn, its focus
  ring included, inside the well. A pin not on the page (its element gone)
  stands at the well's top-right. On a phone, under a finger, and wherever
  the pane says so (`sheet`), it is the well's foot sheet, full width,
  standing over a software keyboard by the well's `--keyboard-lift`
  (PreviewPane) so its field stays in view while the page keeps its box.

  Where it stands is chosen once (`plan`: the side, what it stands beside,
  its tallest) and chosen again only when the well, the card's size or what
  it is about changes size, never as the page scrolls (the owner: "when
  scrolling the page why does this jump up and down instead of animating
  its position?"): scrolling, it keeps to its pill, held whole inside the
  well at its edges, every place a continuous step from the last, and a
  pill gone out of view leaves it where it last stood beside it. Chosen
  again while it stands, it travels to its new place over `--duration-morph` on
  `--ease-drawer`, never a jump.

  The thread's card pours out of its pill (the owner: "a gooey animation
  that morphs out of the comment just how the caw/search/machine bar on the
  top right does it", and transitions.dev's gooey plus menu he linked): the
  pill and the card are one vector silhouette (pin-pour.ts), one `<path>`
  on the raised surface with a 1px `border-control` stroke, redrawn each
  frame. The card's box grows out of the pill's, its corners from the
  pill's round to `radius-lg`, over `--duration-goo` on `--ease-goo` (its
  overshoot), and the union's inward corners round to `--goo-join`, so the
  card pulls a neck out of its pill that thins and lets go as it comes to
  rest. The pill itself stays the page's own, seen through the shape (its
  box cut out of it). The thread fades in over `--duration-goo-content` after
  `--duration-goo-content-delay`, clipped to the card's box as drawn; its drop
  comes once the shape is still. Closing drains it back over
  `--duration-goo-exit` on `--ease-out`, the thread gone over
  `--duration-goo-content-exit`. Either run starts from where the shape is
  drawn, so a close caught mid-open, or an open caught mid-close, turns back
  there. The card stays on the page through its close: `open` turns its
  clock, and only once a close has landed does it say so (`onclosed`) for
  its holder to take it away. Taken away, it goes at once: where another
  pin's card takes its place, or once its close has landed. With no pill on
  the page to pour from, or without motion, it fades. The composer, whose
  own pill is its surface, opens as every kit popover does (`popMotion`),
  out of the pill; the foot sheet fades in over `--duration-menu` and out over
  `--duration-control`.
-->
<script lang="ts">
  import { commentWords as said } from "@cawco/core/words/comments";
  import { type Snippet, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { popMotion } from "#lib/components/ui/popover/index.js";
  import {
    curveOf,
    dur,
    ease,
    easeOut,
    motionOk,
    numberOf,
  } from "../motion/curves.svelte";
  import { type PopSide, popOut } from "../motion/pop.svelte";
  import {
    type Box,
    FLOAT_W,
    FloatPlace,
    type Plan,
    travelTo,
  } from "./pin-place.svelte";
  import {
    outline,
    type Radii,
    type Rect,
    roundedBox,
    silhouette,
  } from "./pin-pour";

  let {
    mark,
    box = null,
    room,
    sheet = false,
    bare = false,
    label,
    slot,
    pin,
    open = true,
    onclosed,
    onpress,
    onrest,
    float = $bindable(),
    children,
  }: {
    /**
     * Open (true), or going (false). The thread's card drains back into its
     * pill and says so once it has (`onclosed`); the composer and the foot
     * sheet say so at once, their holder taking them away, which plays
     * their outro.
     */
    open?: boolean;
    /** It has closed: its holder takes it away. Never said once it has opened again. */
    onclosed?: () => void;
    /** The pill's box in the well, px; null while it is not on screen. */
    mark: Box | null;
    /** The box of what the pill stands on, in the well, px: the card never stands over it. */
    box?: Box | null;
    /** The well's room, px. */
    room: { h: number; w: number };
    sheet?: boolean;
    /** No card round it: what it holds is its own surface (the composer's pill). */
    bare?: boolean;
    /** What it is, read out. */
    label: string;
    /** Its `data-slot`: what the pane and the probes call it. */
    slot: "pin-card" | "pin-composer" | "pin-peek";
    /**
     * The peek's: a press anywhere on it opens what it peeks, its pin's whole
     * thread (one button over all it holds, named for that). What it holds
     * takes no press of its own.
     */
    onpress?: () => void;
    /** The peek's: the pointer came onto it (true) or left it (false). */
    onrest?: (on: boolean) => void;
    /** The thread's pin, by its number: its hook (`data-pin-card`). */
    pin?: number;
    float?: HTMLElement;
    children: Snippet;
  } = $props();

  /** The thread's card: drawn by its own silhouette, poured from the pill. */
  const card = $derived(!(sheet || bare));
  let body = $state<HTMLElement>();
  let clipWrap = $state<HTMLElement>();
  let shapePath = $state<SVGPathElement>();
  let hole = $state<SVGPathElement>();
  const uid = $props.id();

  /** Placed and not closing: the composer's `data-state` goes from `closed` to `open`, and the card pours. */
  let opened = $state(false);
  /** Placed once: from then on `open` moves it (before, its first open waits for its size). */
  let ready = false;
  /**
   * Its size, what it is about as last seen, and its plan (pin-place
   * `FloatPlace`). Opened once the flush that places it has landed: the
   * composer's closed style taken there, so the kit's transition starts
   * from where it stands; the card poured from the pill it stands
   * beside.
   */
  const placed = new FloatPlace(() => ({ mark, box, room }), {
    body: () => body,
    float: () => float,
    placed: (el) => {
      ready = true;
      if (!open) {
        // Closed again before it was ever drawn open: nothing to close.
        onclosed?.();
        return;
      }
      if (untrack(() => card)) {
        pour();
      } else {
        // biome-ignore lint/suspicious/noUnusedExpressions: the read takes its closed look at the side it was placed on, the start the kit's transition runs from
        getComputedStyle(el).translate;
      }
      opened = true;
    },
  });
  const seen = $derived(placed.seen);
  /** None on the foot sheet, which stands full width at the well's foot. */
  const plan = $derived(sheet ? null : placed.plan);

  /**
   * Where it stands now, from the plan and the pill as it stands: a
   * continuous function of the pill's place, held whole inside the well.
   */
  const place = $derived.by(() => {
    if (!plan) {
      return null;
    }
    const { clear, width } = placed;
    const { corner, inX, inY, tall } = placed.frame(plan);
    const at = seen;
    if (!at || plan.along === "room") {
      return { ...corner, origin: { x: width, y: 0 } };
    }
    const pill = at.mark;
    const about = plan.along === "pill" ? pill : at.whole;
    let left = pill.x;
    let top = pill.y;
    if (plan.side === "right") {
      left = about.x + about.w + clear;
    } else if (plan.side === "left") {
      left = about.x - clear - width;
    } else if (plan.side === "bottom") {
      top = about.y + about.h + clear;
    } else {
      top = about.y - clear - tall;
    }
    left = inX(left);
    top = inY(top);
    const inside = (value: number, most: number) =>
      Math.max(0, Math.min(value, most));
    return {
      left,
      top,
      side: plan.side,
      max: plan.max,
      origin: {
        x: inside(pill.x + pill.w / 2 - left, width),
        y: inside(pill.y + pill.h / 2 - top, tall),
      },
    };
  });

  // A new plan while it stands: it travels from where it stood to its new
  // place, over --duration-morph on --ease-drawer (The Interruptible Rule: a
  // second one starts from where the first has it).
  let stood: { left: number; top: number; plan: Plan | null } | null = null;
  let travel: Animation | null = null;
  $effect(() => {
    const at = place;
    const now = plan;
    const el = float;
    if (!(at && el)) {
      return;
    }
    const before = stood;
    stood = { left: at.left, top: at.top, plan: now };
    const moved = before && before.plan !== now && untrack(() => opened);
    if (!(moved && motionOk.current)) {
      return;
    }
    travel = travelTo(el, before, at, travel);
  });

  /**
   * What its outro reads, as last drawn: whether it is the card, and the
   * side it stood on. An outro's function runs once the block holding it
   * has let it go, so every derived here or in that block is frozen by then
   * and reading one is Svelte's `derived_inert` (svelte.dev/e/derived_inert);
   * the composer closing by Esc changed its `mark` in that very flush.
   * Written while it stands.
   */
  let drawn: { card: boolean; side: PopSide | undefined } = {
    card: untrack(() => card),
    side: undefined,
  };
  $effect(() => {
    drawn = { card, side: place?.side };
  });

  // ---- The pour ----------------------------------------------------------

  /** The tokens a frame draws with, read at its first frame (the page's, never a server render's). */
  let tokens: { cardR: number; hair: number; join: number } | null = null;
  /** A frame's step at most, ms: a tab hidden mid-run lands its next frame, never a jump past its end. */
  const FRAME_STEP_MS = 50;

  /** A run of the pour's clock: from where it was drawn to `to`, on a token's curve. */
  interface Run {
    curve: (t: number) => number;
    elapsed: number;
    from: number;
    length: number;
    to: number;
  }
  /** How far the card has poured out of its pill: 0 hidden in it, 1 at rest (past 1 on the open's overshoot). */
  let poured = 0;
  let run: Run | null = null;
  let frame = 0;
  let lastAt = 0;

  const runTo = (from: number, to: boolean): Run => ({
    from,
    to: to ? 1 : 0,
    elapsed: 0,
    length: dur(to ? "--duration-goo" : "--duration-goo-exit"),
    curve: curveOf(to ? "--ease-goo" : "--ease-out"),
  });
  const runAt = (one: Run) =>
    one.from +
    (one.to - one.from) * one.curve(Math.min(1, one.elapsed / one.length));

  /** The card's box at rest, the float's own. */
  const cardW = $derived(Math.max(0, placed.width));
  const cardH = $derived(Math.max(0, placed.height));
  /** The pill where it stands now, in the card's own coordinates; null while it is not on the page. */
  const pinHere = $derived.by((): Rect | null => {
    const pill = seen?.mark;
    if (!(pill && place)) {
      return null;
    }
    return {
      x: pill.x - place.left,
      y: pill.y - place.top,
      w: pill.w,
      h: pill.h,
    };
  });

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const unit = (t: number) => Math.max(0, Math.min(1, t));

  /**
   * Draws the shape as the clock stands: writes only. The card's box from
   * the pill's toward its own and, while it pours, the pill's box with it,
   * the union closed by the join; the pill's box cut out of it, so the
   * page's own pill shows; the thread's clip on the card's box.
   */
  function draw() {
    const path = shapePath;
    if (!(path && cardW > 0 && cardH > 0)) {
      return;
    }
    tokens ??= {
      join: numberOf("--goo-join"),
      cardR: numberOf("--radius-lg"),
      hair: numberOf("--radius-hair"),
    };
    const { cardR: CARD_R, hair, join: JOIN } = tokens;
    const k = unit(poured);
    const p = pinHere;
    const from: Rect = p ?? { x: 0, y: 0, w: cardW, h: cardH };
    const pinR = p ? p.h / 2 : CARD_R;
    const shape: Rect = {
      x: lerp(from.x, 0, poured),
      y: lerp(from.y, 0, poured),
      w: lerp(from.w, cardW, poured),
      h: lerp(from.h, cardH, poured),
    };
    // The pill's own corners: round, its tail (bottom-start) a hair, as
    // the page draws it (PinMark `tail`).
    const pinRadii: Radii = p
      ? [pinR, pinR, pinR, hair]
      : [pinR, pinR, pinR, pinR];
    const radii = pinRadii.map((r) => lerp(r, CARD_R, k)) as Radii;
    const shapes = [roundedBox(shape, radii)];
    // The pill joins the shape only while it pours: at rest the card
    // stands alone, so a travel to a new place carries no pill with it.
    const pouring = p && (run !== null || poured < 1);
    if (pouring) {
      shapes.push(roundedBox(p, pinRadii));
    }
    // The closing joins them only to a neck narrower than their resting
    // gap, so it lets go as the card comes to rest.
    const join = Math.max(0, Math.min(JOIN, placed.clear / 2 - 1));
    path.setAttribute("d", silhouette(shapes, join));
    // The pill's own box cut out of the shape (an even-odd clip: all the
    // card's room, less the pill), so the page's own pill shows through.
    hole?.setAttribute(
      "d",
      `M${-cardW} ${-cardH}H${2 * cardW}V${2 * cardH}H${-cardW}Z${pouring ? outline(roundedBox(p, pinRadii)) : ""}`
    );
    if (clipWrap) {
      if (run || poured < 1) {
        const [tl, tr, br, bl] = radii;
        const edge = (n: number) => `${Math.max(0, n).toFixed(2)}px`;
        clipWrap.style.clipPath = `inset(${edge(shape.y)} ${edge(cardW - shape.x - shape.w)} ${edge(cardH - shape.y - shape.h)} ${edge(shape.x)} round ${edge(tl)} ${edge(tr)} ${edge(br)} ${edge(bl)})`;
      } else {
        clipWrap.style.clipPath = "none";
      }
    }
  }

  function tick(now: number) {
    const step = Math.max(0, Math.min(now - lastAt, FRAME_STEP_MS));
    lastAt = now;
    if (run) {
      run.elapsed += step;
      poured = runAt(run);
      if (run.elapsed >= run.length) {
        run = null;
      }
    }
    draw();
    if (run) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      if (float) {
        delete float.dataset.run;
      }
    }
  }

  /** The card pours out (true) or drains back (false) from where it is drawn. */
  function pourTo(to: boolean) {
    const el = float;
    if (!el) {
      return;
    }
    el.dataset.open = String(to);
    run = runTo(poured, to);
    el.dataset.run = "";
    if (!frame) {
      lastAt = performance.now();
      frame = requestAnimationFrame(tick);
    }
  }

  /** It stands at `to` at once: no pill to pour from, or no motion. */
  function standAt(to: boolean) {
    run = null;
    cancelAnimationFrame(frame);
    frame = 0;
    poured = to ? 1 : 0;
    if (float) {
      float.dataset.open = String(to);
      delete float.dataset.run;
    }
    draw();
  }

  // The shape follows the pill and the card's size between runs.
  $effect(() => {
    draw();
  });

  /** The fade a card plays where it has no pill to pour from, or no motion. */
  let fade: Animation | null = null;
  const fadeTo = (to: boolean, length: number) => {
    const node = float;
    if (!node) {
      return;
    }
    const shown = getComputedStyle(node).opacity;
    fade?.cancel();
    fade = node.animate([{ opacity: shown }, { opacity: to ? 1 : 0 }], {
      duration: length,
      easing: ease("--ease-out"),
      fill: to ? "none" : "forwards",
    });
  };

  /** The thread's card pours out of its pill; with no pill on the page, or without motion, it fades in where it stands. */
  function pour() {
    if (!(motionOk.current && pinHere)) {
      standAt(true);
      fadeTo(
        true,
        dur(motionOk.current ? "--duration-pop" : "--duration-control")
      );
      return;
    }
    // Its closed state drawn first (the card hidden in its pill, at the
    // size it was just measured at), so the run starts from it.
    standAt(false);
    pourTo(true);
  }

  /** The close in flight: `onclosed` once it lands. */
  let closing = 0;
  $effect(() => () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(closing);
  });

  /**
   * The thread's card drains back into its pill from where it is drawn; with
   * no pill to go into, or without motion, it fades where it stands. Its
   * holder takes it away once that has landed (`onclosed`).
   */
  function drain() {
    opened = false;
    window.clearTimeout(closing);
    if (!float) {
      onclosed?.();
      return;
    }
    let length = dur("--duration-goo-exit");
    if (motionOk.current && pinHere) {
      fade?.cancel();
      pourTo(false);
    } else {
      length = dur("--duration-control");
      fadeTo(false, length);
      if (float) {
        float.dataset.open = "false";
      }
    }
    closing = window.setTimeout(() => onclosed?.(), length);
  }

  /** Opened again before its close landed: the same clock turns back toward open, from where it is drawn. */
  function pourAgain() {
    window.clearTimeout(closing);
    opened = true;
    if (fade) {
      fadeTo(true, dur("--duration-control"));
    }
    if (motionOk.current && pinHere) {
      pourTo(true);
    } else {
      standAt(true);
    }
  }

  // Each change of `open` once placed: the card drains or pours again from
  // where it stands; the composer and the foot sheet go by their holder.
  $effect(() => {
    const want = open;
    untrack(() => {
      if (!ready) {
        return;
      }
      if (!card) {
        if (!want) {
          onclosed?.();
        }
        return;
      }
      (want ? pourAgain : drain)();
    });
  });

  /** The kit's state for the composer's pop: none on the foot sheet nor the card. */
  const popState = $derived.by(() => {
    if (sheet || card) {
      return;
    }
    return opened ? "open" : "closed";
  });

  /** The foot sheet fades in; the card pours (`pour`), the composer comes in by the kit's `@starting-style` (`popMotion`). */
  function arrive(_node: Element): TransitionConfig {
    return sheet
      ? {
          duration: dur("--duration-menu"),
          easing: easeOut,
          css: (t: number) => `opacity: ${t}`,
        }
      : { duration: 0 };
  }
  /**
   * Out: the composer by the kit's `popOut`, the foot sheet by its opacity,
   * both CSS a resume turns back. The card has closed while it stood
   * (`drain`), or another pin's card takes its place: it goes at once. It
   * reads what was last drawn (`drawn`), never a derived.
   */
  function leave(node: HTMLElement): TransitionConfig {
    if (drawn.card) {
      return { duration: 0 };
    }
    if (sheet) {
      return {
        duration: dur("--duration-control"),
        easing: easeOut,
        css: (t: number) => `opacity: ${t}`,
      };
    }
    return popOut(node, { side: drawn.side ?? "bottom" });
  }
</script>

<div
  aria-label={label}
  class={[
    "group/pour pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max)",
    sheet
      ? "inset-x-0 bottom-(--keyboard-lift,0px) w-full max-h-over-keyboard-70"
      : "start-(--float-x) top-(--float-y) w-(--float-w)",
    !(sheet || card) && ["origin-(--float-origin)", popMotion],
  ]}
  data-bare={bare || undefined}
  data-sheet={sheet || undefined}
  data-side={place?.side}
  data-slot={slot}
  data-state={popState}
  data-pin-card={pin}
  onpointerenter={onrest ? () => onrest(true) : undefined}
  onpointerleave={onrest ? () => onrest(false) : undefined}
  role="dialog"
  bind:this={float}
  style:--float-x={place ? `${place.left}px` : undefined}
  style:--float-y={place ? `${place.top}px` : undefined}
  style:--float-origin={place
    ? `${place.origin.x}px ${place.origin.y}px`
    : "bottom center"}
  style:--float-w={FLOAT_W}
  style:--float-max={place
    ? `${place.max}px`
    : "calc(100% - 2 * var(--spacing-space-2))"}
  style:--sheet-pb={"calc(var(--spacing-space-3) + env(safe-area-inset-bottom, 0px))"}
  in:arrive
  out:leave
>
  {#if card}
    <!-- The card's one silhouette, poured from its pill (`draw`): the pill's
         box cut out of it so the page's own pill shows, its drop that same
         path by reference once it stands still. The stroke stands on the
         path's group, so the drop draws the fill alone. -->
    <svg
      aria-hidden="true"
      class="pointer-events-none absolute start-0 top-0 -z-1 size-full overflow-visible"
      data-slot="pin-surface"
    >
      <defs>
        <clipPath id="{uid}-pill">
          <path bind:this={hole} clip-rule="evenodd" />
        </clipPath>
      </defs>
      <g clip-path="url(#{uid}-pill)">
        <use
          class="drop-shadow-drop-near transition-opacity duration-(--duration-goo-content) ease-out group-data-run/pour:opacity-0 group-data-run/pour:duration-(--duration-goo-content-exit) motion-reduce:transition-none"
          href="#{uid}-shape"
        />
        <g class="stroke-border-control" stroke-width="1">
          <path
            bind:this={shapePath}
            class="fill-surface-raised"
            data-slot="pin-shape"
            id="{uid}-shape"
          />
        </g>
      </g>
    </svg>
  {/if}
  <!-- What it holds: the one part that scrolls, never sideways; the card's
       clipped to its shape as drawn while it pours. -->
  <div
    bind:this={clipWrap}
    class="flex min-h-0 min-w-0 flex-col"
    data-slot="pin-clip"
  >
    <div
      class={[
        "flex min-h-0 min-w-0 flex-col",
        // Squeezed (a keyboard over a short well), the card itself scrolls,
        // and the house edge fade says what is past its edge.
        !bare &&
          "kit-edge-fade-block gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain",
        card &&
          "p-space-3 opacity-0 transition-[opacity] duration-(--duration-goo-content-exit) ease-out group-data-[open=true]/pour:opacity-100 group-data-[open=true]/pour:duration-(--duration-goo-content) group-data-[open=true]/pour:delay-(--duration-goo-content-delay) motion-reduce:transition-none",
        sheet &&
          "px-space-3 pt-space-3 pb-(--sheet-pb) border-t border-border-hairline rounded-t-lg bg-surface-raised shadow-drawer",
      ]}
      data-slot="pin-body"
      bind:this={body}
    >
      {@render children()}
    </div>
  </div>
  {#if onpress && pin !== undefined}
    <!-- The peek pressed anywhere: its whole thread opens. -->
    <button
      aria-label={said.openThread(pin)}
      class="absolute inset-0 z-1 m-0 p-0 border-none bg-transparent rounded-lg outline-off focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring"
      data-slot="pin-peek-open"
      onclick={onpress}
      type="button"
    ></button>
  {/if}
</div>
