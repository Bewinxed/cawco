<!--
  What stands beside a comment's pill over the page: its composer while it
  is written (bare: the composer's own pill is its surface) and its thread
  once it is (the raised card recipe: `--radius-lg`, `--border-control`,
  `--shadow-hairline`, `--space-3` padding). One width for both,
  `--c-pin-card-reading-w` (two fifths of the well, 280 to 480px: the pin
  room is the size container its `cqi` reads), never past the well's room,
  so a card never changes width as it goes from composer to thread
  (commenting addendum §3; the owner's pick "Beside the comment").

  Its height is what it holds, up to the well's height less `--space-2`
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
  that side's room. Always `--space-2` from the pill as drawn, its focus
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
  again while it stands, it travels to its new place over `--dur-morph` on
  `--ease-drawer`, never a jump.

  The thread's card is the pill growing (the owner: "a gooey animation
  that morphs out of the comment just how the caw/search/machine bar on the
  top right does it"): one surface, `pin-surface`, starts as the pill (its
  box, its round corners, its face's fill and edge) and grows to the card's
  box, corners, fill and edge over `--dur-pop` on `--ease-out`, the top
  bar's card's own open (motion/hang); the thread fades in once the shape
  has room, waiting two fifths of the open. Closing is the same in reverse
  over `--dur-exit`, the thread gone in its first half, back into the pill; a close
  caught mid-open turns back from where it is drawn. The card stays on the
  page through its close: `open` moves it both ways, and only once a close
  has landed does it say so (`onclosed`) for its holder to take it away, so
  an open caught mid-close grows back from where it is drawn too. (Closed in
  an outro, a card opened again mid-close was resumed by Svelte with the
  outro's fills still on it: a pill-sized surface, its thread unseen.) Taken
  away, it goes at once: where another pin's card takes its place, or once
  its close has landed. Without motion it fades. The composer, whose
  own pill is its surface, opens as every kit popover does (`popMotion`),
  out of the pill; the foot sheet fades in over `--dur-menu` and out over
  `--dur-control`.
-->
<script lang="ts">
  import { type Snippet, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { popMotion } from "#lib/components/ui/popover/index.js";
  import { dur, ease, easeOut, motionOk } from "../motion/curves.svelte";
  import { type PopSide, popOut } from "../motion/pop.svelte";
  import {
    type Box,
    FLOAT_W,
    FloatPlace,
    type Plan,
    threadIn,
    threadOut,
    travelTo,
  } from "./pin-place.svelte";

  /** A pill's face: its fill and its edge, as tokens (PinMark's faces). */
  interface PinFace {
    edge: `--${string}`;
    fill: `--${string}`;
  }

  let {
    mark,
    box = null,
    room,
    sheet = false,
    bare = false,
    face = { fill: "--action-solid", edge: "--action-solid" },
    label,
    slot,
    pin,
    open = true,
    onclosed,
    float = $bindable(),
    children,
  }: {
    /**
     * Open (true), or going (false). The thread's card grows back into its
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
    /** The pill's face, which the card's surface grows from and goes back to. */
    face?: PinFace;
    /** What it is, read out. */
    label: string;
    /** Its `data-slot`: what the pane and the probes call it. */
    slot: "pin-card" | "pin-composer";
    /** The thread's pin, by its number: its hook (`data-pin-card`). */
    pin?: number;
    float?: HTMLElement;
    children: Snippet;
  } = $props();

  /** The thread's card: drawn by its own surface, which grows from the pill. */
  const card = $derived(!(sheet || bare));
  let surface = $state<HTMLElement>();
  let body = $state<HTMLElement>();

  /** Placed and not closing: the composer's `data-state` goes from `closed` to `open`, and the card's surface grows. */
  let opened = $state(false);
  /** Placed once: from then on `open` moves it (before, its first open waits for its size). */
  let ready = false;
  /**
   * Its size, what it is about as last seen, and its plan (pin-place
   * `FloatPlace`). Opened once the flush that places it has landed: the
   * composer's closed style taken there, so the kit's transition starts
   * from where it stands; the card's surface grown from the pill it stands
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
        grow();
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
  // place, over --dur-morph on --ease-drawer (The Interruptible Rule: a
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

  /** A colour token as the page computes it now (its scheme's). */
  const colourOf = (token: `--${string}`): string => {
    const probe = document.createElement("i");
    probe.style.color = `var(${token})`;
    probe.hidden = true;
    float?.append(probe);
    const value = probe.isConnected ? getComputedStyle(probe).color : "";
    probe.remove();
    return value;
  };

  /** The pill's shape in the card's own coordinates, as the surface starts and ends: the card standing `at`, the pill `where`, its face `of`. */
  const pillShape = (at: typeof place, where: typeof seen, of: PinFace) => {
    if (!(at && where)) {
      return null;
    }
    const pill = where.mark;
    return {
      left: `${pill.x - at.left}px`,
      top: `${pill.y - at.top}px`,
      width: `${pill.w}px`,
      height: `${pill.h}px`,
      borderRadius: `${pill.h / 2}px`,
      backgroundColor: colourOf(of.fill),
      borderColor: colourOf(of.edge),
    };
  };

  /** The surface as it stands in the card's box: its box, corners, fill and edge. */
  const surfaceShape = (el: HTMLElement) => {
    const style = getComputedStyle(el);
    return {
      left: `${el.offsetLeft}px`,
      top: `${el.offsetTop}px`,
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`,
      borderRadius: style.borderTopLeftRadius,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
    };
  };

  /** The thread's card grows out of its pill: the surface from the pill's shape to the card's, the thread fading in once there is room. */
  function grow() {
    const shape = surface;
    const inner = body;
    if (!(shape && inner)) {
      return;
    }
    if (!motionOk.current) {
      float?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
      });
      return;
    }
    const from = untrack(() => pillShape(place, seen, face));
    if (!from) {
      // Not on the page: no pill to grow from; it fades in where it stands.
      float?.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-pop"),
        easing: ease("--ease-out"),
      });
      return;
    }
    const to = surfaceShape(shape);
    const length = dur("--dur-pop");
    shape.animate([from, to], { duration: length, easing: ease("--ease-out") });
    threadIn(inner, length);
  }

  /** The close in flight: `onclosed` once it lands. */
  let closing = 0;
  $effect(() => () => window.clearTimeout(closing));

  /** Every run on the card and its parts, cancelled: read where each has it drawn first. */
  const stopRuns = () => {
    for (const el of [float, surface, body]) {
      for (const run of el?.getAnimations() ?? []) {
        run.cancel();
      }
    }
  };

  /**
   * The thread's card goes back into its pill: the surface from where it is
   * drawn to the pill's shape, the thread gone by half way; with no pill to
   * go into, or without motion, it fades where it stands. Its holder takes
   * it away once that has landed (`onclosed`).
   */
  function shrink() {
    const node = float;
    const shape = surface;
    const inner = body;
    opened = false;
    window.clearTimeout(closing);
    if (!node) {
      onclosed?.();
      return;
    }
    const to = pillShape(place, seen, face);
    let length = dur("--dur-exit");
    if (shape && inner && to && motionOk.current) {
      // From where it is drawn: a close caught mid-open turns back there.
      const from = surfaceShape(shape);
      const shown = getComputedStyle(inner).opacity;
      stopRuns();
      shape.animate([from, to], {
        duration: length,
        easing: ease("--ease-out"),
        fill: "forwards",
      });
      threadOut(inner, shown, length);
    } else {
      length = dur("--dur-control");
      const shown = getComputedStyle(node).opacity;
      stopRuns();
      node.animate([{ opacity: shown }, { opacity: 0 }], {
        duration: length,
        easing: ease("--ease-out"),
        fill: "forwards",
      });
    }
    closing = window.setTimeout(() => onclosed?.(), length);
  }

  /** Opened again before its close landed: it grows back from where the close has it drawn, over `--dur-pop`. */
  function regrow() {
    const node = float;
    const shape = surface;
    const inner = body;
    window.clearTimeout(closing);
    opened = true;
    if (!(node && shape && inner)) {
      return;
    }
    const from = surfaceShape(shape);
    const thread = getComputedStyle(inner).opacity;
    const whole = getComputedStyle(node).opacity;
    stopRuns();
    if (!motionOk.current) {
      return;
    }
    const length = dur("--dur-pop");
    const timing = { duration: length, easing: ease("--ease-out") };
    shape.animate([from, surfaceShape(shape)], timing);
    inner.animate([{ opacity: thread }, { opacity: 1 }], timing);
    node.animate([{ opacity: whole }, { opacity: 1 }], timing);
  }

  // Each change of `open` once placed: the card closes or opens again where
  // it stands; the composer and the foot sheet go by their holder.
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
      (want ? regrow : shrink)();
    });
  });

  /** The kit's state for the composer's pop: none on the foot sheet nor the card. */
  const popState = $derived.by(() => {
    if (sheet || card) {
      return;
    }
    return opened ? "open" : "closed";
  });

  /** The foot sheet fades in; the card grows (`grow`), the composer comes in by the kit's `@starting-style` (`popMotion`). */
  function arrive(_node: Element): TransitionConfig {
    return sheet
      ? {
          duration: dur("--dur-menu"),
          easing: easeOut,
          css: (t: number) => `opacity: ${t}`,
        }
      : { duration: 0 };
  }
  /**
   * Out: the composer by the kit's `popOut`, the foot sheet by its opacity,
   * both CSS a resume turns back. The card has closed while it stood
   * (`shrink`), or another pin's card takes its place: it goes at once. It
   * reads what was last drawn (`drawn`), never a derived.
   */
  function leave(node: HTMLElement): TransitionConfig {
    if (drawn.card) {
      return { duration: 0 };
    }
    if (sheet) {
      return {
        duration: dur("--dur-control"),
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
    "pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max)",
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
    : "calc(100% - 2 * var(--space-2))"}
  style:--sheet-pb="calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
  in:arrive
  out:leave
>
  {#if card}
    <!-- The card's one surface: the pill grown (`grow`), behind what it holds. -->
    <div
      aria-hidden="true"
      class="pointer-events-none absolute inset-0 -z-1 rounded-lg border border-border-control bg-surface-raised shadow-hairline"
      data-slot="pin-surface"
      bind:this={surface}
    ></div>
  {/if}
  <!-- What it holds: the one part that scrolls, never sideways. -->
  <div
    class={[
      "flex min-h-0 min-w-0 flex-col",
      !bare &&
        "gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain",
      card && "p-space-3",
      sheet &&
        "px-space-3 pt-space-3 pb-(--sheet-pb) border-t border-border-hairline rounded-t-lg bg-surface-raised shadow-drawer",
    ]}
    data-slot="pin-body"
    bind:this={body}
  >
    {@render children()}
  </div>
</div>
