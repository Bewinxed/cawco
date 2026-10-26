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
  caught mid-open turns back from where it is drawn. At once where another
  pin's card takes its place. Without motion it fades. The composer, whose
  own pill is its surface, opens as every kit popover does (`popMotion`),
  out of the pill; the foot sheet fades in over `--dur-menu` and out over
  `--dur-control`.
-->
<script lang="ts">
  import { type Snippet, tick, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { popMotion } from "#lib/components/ui/popover/index.js";
  import { frameObserver } from "../frame-observer";
  import {
    dur,
    ease,
    easeOut,
    motionOk,
    numberOf,
  } from "../motion/curves.svelte";
  import { type PopSide, popOut } from "../motion/pop.svelte";

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

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
    exit = { at: "fade" },
    float = $bindable(),
    children,
  }: {
    /**
     * How it goes, read as it starts to: `fade`, or `cut` where another
     * pin's card takes its place in the same press, so no frame shows it
     * where the last pin stood. A holder the pane writes as it swaps.
     */
    exit?: { at: "fade" | "cut" };
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

  let width = $state(0);
  let height = $state(0);
  /**
   * Its height with nothing capping it: its own, plus what its body and its
   * thread's room (PinCard `data-pin-room`) hold past their boxes. Where it
   * stands is chosen by this, never by the cap that choice sets, so a cap
   * never moves it.
   */
  let natural = $state(0);
  /** Placed: the composer's `data-state` goes from `closed` to `open`, and the card's surface grows. */
  let opened = $state(false);
  // Its size as it mounts, then each change in the next frame
  // (frameObserver): what it holds grows inside a ResizeObserver pass (the
  // composer's field, a thread's entries), and a size written inside that
  // pass would place it again there, a box the pass could no longer deliver.
  // The room's contents are watched too: under a cap they grow inside a
  // box that keeps its size.
  $effect(() => {
    const el = float;
    const inner = body;
    if (!(el && inner)) {
      return;
    }
    const rooms = [...el.querySelectorAll<HTMLElement>("[data-pin-room]")];
    const read = () => {
      const tall = el.offsetHeight;
      const past = rooms.reduce(
        (sum, one) => sum + one.scrollHeight - one.clientHeight,
        inner.scrollHeight - inner.clientHeight
      );
      width = el.offsetWidth;
      height = tall;
      natural = tall + Math.max(0, past);
    };
    read();
    // Opened once the flush that places it has landed: the composer's
    // closed style taken there, so the kit's transition starts from where
    // it stands; the card's surface grown from the pill it stands beside.
    tick().then(() => {
      if (float !== el) {
        return;
      }
      if (untrack(() => card)) {
        grow();
      } else {
        // biome-ignore lint/suspicious/noUnusedExpressions: the read takes its closed look at the side it was placed on, the start the kit's transition runs from
        getComputedStyle(el).translate;
      }
      opened = true;
    });
    const watch = frameObserver(read);
    watch.observe(el);
    for (const one of rooms) {
      for (const part of one.children) {
        watch.observe(part);
      }
    }
    return () => watch.disconnect();
  });
  /** Its width: the reading card's, never past the well less `--space-2` each side. */
  const FLOAT_W =
    "min(var(--c-pin-card-reading-w), calc(100% - 2 * var(--space-2)))";
  /** Its distance from the well's edges: `--space-2`. */
  const gap = $derived(numberOf("--space-2") || 7);
  /**
   * Its distance from the pill's box: `--space-2` from the pill as drawn,
   * past its focus ring (PinMark `data-focused`: a 2px outline 2px out), so
   * nothing of the pill ever stands on it.
   */
  const clear = $derived(gap + 4);

  /** Two boxes as one. */
  const union = (parts: Box[]): Box => {
    const left = Math.min(...parts.map((one) => one.x));
    const top = Math.min(...parts.map((one) => one.y));
    return {
      x: left,
      y: top,
      w: Math.max(...parts.map((one) => one.x + one.w)) - left,
      h: Math.max(...parts.map((one) => one.y + one.h)) - top,
    };
  };

  /**
   * The pill and what the comment is about as last seen on the page: the
   * card keeps to them while the pill is out of view, so it never leaves
   * for the well's corner as the pill scrolls away.
   */
  let last: { mark: Box; whole: Box } | null = null;
  const seen = $derived.by(() => {
    if (mark) {
      last = { mark, whole: box ? union([mark, box]) : mark };
    }
    return last;
  });

  /**
   * What the comment is about as the well shows it (cut to the well), for
   * choosing where the card stands: the pill and its element's box, one box.
   */
  const shownOf = (whole: Box, pill: Box): Box => {
    const left = Math.max(0, whole.x);
    const top = Math.max(0, whole.y);
    const right = Math.min(room.w, whole.x + whole.w);
    const bottom = Math.min(room.h, whole.y + whole.h);
    return right > left && bottom > top
      ? { x: left, y: top, w: right - left, h: bottom - top }
      : pill;
  };

  /** Where it stands: the side, what it stands beside, and its tallest. */
  interface Plan {
    along: "subject" | "pill" | "room";
    max: number;
    side: PopSide;
  }
  const decide = (at: { mark: Box; whole: Box } | null): Plan => {
    const full = Math.max(0, room.h - 2 * gap);
    /** Its height as it will stand beside the pill: what it holds, up to the well's. */
    const tall = Math.min(natural || height, full);
    if (!at) {
      return { along: "room", side: "bottom", max: full };
    }
    const pill = at.mark;
    const subject = shownOf(at.whole, pill);
    const fits = (about: Box): PopSide | null => {
      if (about.x + about.w + clear + width <= room.w - gap) {
        return "right";
      }
      return about.x - clear - width >= gap ? "left" : null;
    };
    const under = room.h - (subject.y + subject.h + clear) - gap;
    const over = subject.y - clear - gap;
    const nextTo = fits(subject);
    if (nextTo) {
      return { along: "subject", side: nextTo, max: full };
    }
    if (under >= tall) {
      return { along: "subject", side: "bottom", max: under };
    }
    if (over >= tall) {
      return { along: "subject", side: "top", max: over };
    }
    const alone = fits(pill);
    if (alone) {
      return { along: "pill", side: alone, max: full };
    }
    const belowPill = room.h - (pill.y + pill.h + clear) - gap;
    const abovePill = pill.y - clear - gap;
    return belowPill >= tall || belowPill >= abovePill
      ? { along: "pill", side: "bottom", max: Math.max(0, belowPill) }
      : { along: "pill", side: "top", max: Math.max(0, abovePill) };
  };

  /**
   * The plan, chosen again only when what it was chosen from changes size
   * (the well, the card, what it holds, the pill or its element), never as
   * the page under it scrolls.
   */
  let planFor = "";
  let planHeld: Plan | null = null;
  const plan = $derived.by(() => {
    if (sheet) {
      return null;
    }
    const at = seen;
    const key = [
      room.w,
      room.h,
      width,
      Math.round(natural),
      at ? `${at.mark.w}x${at.mark.h}` : "none",
      at ? `${Math.round(at.whole.w)}x${Math.round(at.whole.h)}` : "",
    ].join();
    if (key !== planFor || !planHeld) {
      planFor = key;
      planHeld = untrack(() => decide(at));
    }
    return planHeld;
  });

  /**
   * Where it stands now, from the plan and the pill as it stands: a
   * continuous function of the pill's place, held whole inside the well.
   */
  const place = $derived.by(() => {
    if (!plan) {
      return null;
    }
    const tall = Math.min(natural || height, plan.max);
    const at = seen;
    const inX = (x: number) => Math.max(gap, Math.min(x, room.w - width - gap));
    const inY = (y: number) => Math.max(gap, Math.min(y, room.h - gap - tall));
    if (!at || plan.along === "room") {
      return {
        left: inX(room.w - width - gap),
        top: gap,
        side: plan.side,
        max: plan.max,
        origin: { x: width, y: 0 },
      };
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
    // Where it is drawn now, a travel in flight counted, is where it starts.
    const shift = getComputedStyle(el).translate;
    const [dx = 0, dy = 0] =
      shift === "none"
        ? [0, 0]
        : shift.split(" ").map((one) => Number.parseFloat(one));
    travel?.cancel();
    travel = el.animate(
      [
        {
          translate: `${before.left - at.left + dx}px ${before.top - at.top + dy}px`,
        },
        { translate: "0px 0px" },
      ],
      { duration: dur("--dur-morph"), easing: ease("--ease-drawer") }
    );
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

  /** The pill's shape in the card's own coordinates, as the surface starts and ends. */
  const pillShape = () => {
    const at = untrack(() => place);
    const where = untrack(() => seen);
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
      backgroundColor: colourOf(face.fill),
      borderColor: colourOf(face.edge),
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
    const from = pillShape();
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
    // The thread waits two fifths of the open, held hidden, then comes in
    // over the rest as the shape lands.
    inner.animate(
      [
        { opacity: 0, filter: "blur(var(--part-blur))" },
        { opacity: 1, filter: "blur(0px)" },
      ],
      {
        delay: length * 0.4,
        duration: length * 0.6,
        easing: ease("--ease-out"),
        fill: "backwards",
      }
    );
  }

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
   * Out: the card back into its pill, the composer by the kit's `popOut`,
   * the foot sheet by its opacity; where another card takes its place, gone
   * from the screen in this very frame (an outro of no length still holds
   * its element for frames before the block lets it go).
   */
  function leave(node: HTMLElement): TransitionConfig {
    if (exit.at === "cut") {
      node.style.display = "none";
      return { duration: 0 };
    }
    if (sheet) {
      return {
        duration: dur("--dur-control"),
        easing: easeOut,
        css: (t: number) => `opacity: ${t}`,
      };
    }
    if (!card) {
      return popOut(node, { side: place?.side ?? "bottom" });
    }
    return shrink(node);
  }

  /** The card goes back into its pill: the surface from where it is drawn to the pill's shape, the thread gone by half way. */
  function shrink(node: HTMLElement): TransitionConfig {
    const shape = surface;
    const inner = body;
    const to = pillShape();
    const length = dur("--dur-exit");
    if (!(shape && inner && to && motionOk.current)) {
      node.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: dur("--dur-control"),
        easing: ease("--ease-out"),
        fill: "forwards",
      });
      return { duration: dur("--dur-control") };
    }
    // From where it is drawn: a close caught mid-open turns back there.
    const from = surfaceShape(shape);
    const shown = getComputedStyle(inner).opacity;
    for (const run of [...shape.getAnimations(), ...inner.getAnimations()]) {
      run.cancel();
    }
    shape.animate([from, to], {
      duration: length,
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    // The thread is gone in the first half, before the shape is too small to hold it.
    inner.animate([{ opacity: shown }, { opacity: 0 }], {
      duration: length / 2,
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    return { duration: length };
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
