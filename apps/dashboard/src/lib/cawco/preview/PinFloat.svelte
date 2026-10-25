<!--
  What stands beside a comment's pill over the page: its composer while it
  is written (bare: the composer's own pill is its surface) and its thread
  once it is. One width for both, `--c-pin-card-reading-w` (two fifths of
  the well, 280 to 480px: the pin room is the size container its `cqi`
  reads), never past the well's room, so a card never changes width as it
  goes from composer to thread (commenting addendum §3; the owner's pick
  "Beside the comment").

  The thread's card hangs from its pin (DESIGN.md, "A thread beside its
  pin"; "A card that hangs from its anchor"): it is a HangCard, the top
  bar's own card and mechanism (motion/hang), hung beside the pin (`from`
  its end side, else its start side) from the pin's foot (PinFoot: the pin
  as drawn, its rings round its box), its edge facing the pin cut across
  the pin and the flare each side of it, so the pin's flanks run on into
  the card's edge as one silhouette. It slides out sideways from behind a
  cut at the pin's side over `--dur-pop` and back over `--dur-exit`, both
  on `--ease-out`, the top bar's card's own clock, the pin's foot melting
  into it as it comes (PinFoot's bridge); a fade under Reduce Motion; at
  once where another pin's card takes its place (`exit`).

  Its height is what it holds, up to the well's height less `--space-2`
  each side; only a card the whole well can't hold scrolls inside (the
  owner: "it should show besides the comment but should have handling to
  grow taller when appropriate"). Its top stands at the pin's, moved up as
  far as it takes to stand whole in the well. Where it stands (its side,
  its tallest) is chosen once and again only when the well, the card, what
  it holds or the pin changes size. As the page scrolls it stands still
  (the owner: "WRONG, u keep animating it as i scroll down, instead of
  only letting it move when it reaches the spot where it will move from
  one spot to the next, it should animate THEN, not animate WHILE i'm
  scrolling"): the pin slides along its edge, the neck with it, and only
  once the pin leaves that edge (past its top or its foot, or off its side)
  does the card move, in one travel over `--dur-morph` on `--ease-drawer`,
  to the spot beside the pin with the most of its edge ahead of the pin
  (its top at the pin's when the pin went down past its foot, its foot at
  the pin's when it went up past its top), held whole in the well; then it
  stands still again. A pin gone out of view leaves it where it stood. A
  pin not on the page (its element gone) stands it at the well's top-right.

  The composer stands clear of what the comment is about (the element's box
  and the pill together, `subject`) wherever that leaves room: beside them
  at their end side, else at their start side, its top at the pill's,
  shifted up to stand whole; else below them, else above them; else beside
  its pill alone, or under or over it; always `--space-2` from the pill as
  drawn, its focus ring included, inside the well, and it opens as every
  kit popover does (`popMotion`), out of the pill. On a phone, under a
  finger, and wherever the pane says so (`sheet`), either is the well's
  foot sheet, full width, standing over a software keyboard by the well's
  `--keyboard-lift` (PreviewPane) so its field stays in view while the page
  keeps its box; it fades in over `--dur-menu` and out over `--dur-control`.
-->
<script lang="ts">
  import { type Snippet, tick, untrack } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { popMotion } from "#lib/components/ui/popover/index.js";
  import { frameObserver } from "../frame-observer";
  import {
    dur,
    ease,
    easeOut,
    motionOk,
    numberOf,
  } from "../motion/curves.svelte";
  import { foldNow, type Neck } from "../motion/hang";
  import { type PopSide, popOut } from "../motion/pop.svelte";
  import PinFoot from "./PinFoot.svelte";
  import { type PinTail, RING_OUT } from "./pin-foot";

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

  let {
    mark,
    box = null,
    room,
    sheet = false,
    bare = false,
    tail = "bottom-start",
    dot = false,
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
    /** The box of what the pill stands on, in the well, px: the composer never stands over it. */
    box?: Box | null;
    /** The well's room, px. */
    room: { h: number; w: number };
    sheet?: boolean;
    /** No card round it: what it holds is its own surface (the composer's pill). */
    bare?: boolean;
    /** The pill's tail corner, as the page draws it: the pin's foot keeps it. */
    tail?: PinTail;
    /** The pill wears its dot on its top end corner (the agent at work on it): the foot leaves it open. */
    dot?: boolean;
    /** What it is, read out. */
    label: string;
    /** Its `data-slot`: what the pane and the probes call it. */
    slot: "pin-card" | "pin-composer";
    /** The thread's pin, by its number: its hook (`data-pin-card`). */
    pin?: number;
    float?: HTMLElement;
    children: Snippet;
  } = $props();

  /** The thread's card: a HangCard hung from its pin's foot. */
  const card = $derived(!(sheet || bare));
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
  /** Placed: the composer's `data-state` goes from `closed` to `open`; the card stands drawn out of its pin. */
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
    // it stands.
    tick().then(() => {
      if (float !== el) {
        return;
      }
      if (!untrack(() => card)) {
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
    "min(var(--c-pin-card-reading-w), calc(100cqi - 2 * var(--space-2)))";
  /** Its distance from the well's edges: `--space-2`. */
  const gap = $derived(numberOf("--space-2") || 7);
  /**
   * The composer's distance from the pill's box: `--space-2` from the pill
   * as drawn, past its focus ring (PinMark `data-focused`: a 2px outline 2px
   * out), so nothing of the pill ever stands on it.
   */
  const clear = $derived(gap + RING_OUT);

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
   * The pill and what the comment is about as last seen on the page: what
   * stands beside it keeps to them while the pill is out of view, so it
   * never leaves for the well's corner as the pill scrolls away.
   */
  let last: { mark: Box; whole: Box } | null = null;
  const seen = $derived.by(() => {
    if (mark) {
      last = { mark, whole: box ? union([mark, box]) : mark };
    }
    return last;
  });

  /* ── The composer's place ─────────────────────────────────────────── */

  /**
   * What the comment is about as the well shows it (cut to the well), for
   * choosing where the composer stands: the pill and its element's box.
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

  /** Where the composer stands: the side, what it stands beside, and its tallest. */
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

  /** What a place is chosen from: chosen again only when one of these changes size, never as the page scrolls. */
  const sizesKey = $derived(
    [
      room.w,
      room.h,
      width,
      Math.round(natural),
      seen ? `${seen.mark.w}x${seen.mark.h}` : "none",
      seen ? `${Math.round(seen.whole.w)}x${Math.round(seen.whole.h)}` : "",
    ].join()
  );

  let planFor = "";
  let planHeld: Plan | null = null;
  const plan = $derived.by(() => {
    if (sheet || card) {
      return null;
    }
    const key = sizesKey;
    if (key !== planFor || !planHeld) {
      planFor = key;
      planHeld = untrack(() => decide(seen));
    }
    return planHeld;
  });

  /**
   * Where the composer stands now, from the plan and the pill as it stands:
   * a continuous function of the pill's place, held whole inside the well.
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

  // A new plan while the composer stands: it travels from where it stood to
  // its new place, over --dur-morph on --ease-drawer (The Interruptible
  // Rule: a second one starts from where the first has it).
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

  /** The kit's state for the composer's pop: none on the foot sheet nor the card. */
  const popState = $derived.by(() => {
    if (sheet || card) {
      return;
    }
    return opened ? "open" : "closed";
  });

  /* ── The thread's card, hung from its pin ─────────────────────────── */

  /** The pin as drawn, its rings round its box: what the card hangs from. */
  const pinAt = $derived(
    mark
      ? {
          x: mark.x - RING_OUT,
          y: mark.y - RING_OUT,
          w: mark.w + 2 * RING_OUT,
          h: mark.h + 2 * RING_OUT,
        }
      : null
  );
  /** The pin as last seen: where the card keeps to while it is out of view. */
  const pinSeen = $derived(
    seen
      ? {
          x: seen.mark.x - RING_OUT,
          y: seen.mark.y - RING_OUT,
          w: seen.mark.w + 2 * RING_OUT,
          h: seen.mark.h + 2 * RING_OUT,
        }
      : null
  );

  /** The side of its pin the card hangs at: the end side where it has the room, else the start side, else the roomier. */
  type Side = "right" | "left";
  interface Hung {
    max: number;
    side: Side;
  }
  const hangOf = (at: Box | null): Hung => {
    const full = Math.max(0, room.h - 2 * gap);
    if (!at) {
      return { side: "right", max: full };
    }
    const after = room.w - gap - (at.x + at.w);
    const before = at.x - gap;
    if (after >= width) {
      return { side: "right", max: full };
    }
    if (before >= width) {
      return { side: "left", max: full };
    }
    return { side: after >= before ? "right" : "left", max: full };
  };
  let hungFor = "";
  let hungHeld: Hung | null = null;
  const hung = $derived.by(() => {
    if (!card) {
      return null;
    }
    const key = sizesKey;
    if (key !== hungFor || !hungHeld) {
      hungFor = key;
      hungHeld = untrack(() => hangOf(pinSeen));
    }
    return hungHeld;
  });

  /** Where the card stands: its left and top in the well, and the hang it was chosen for. */
  interface Spot {
    hung: Hung;
    left: number;
    top: number;
  }
  /** Its height as it stands: what it holds, up to its tallest. */
  const tallOf = (h: Hung) => Math.min(natural || height, h.max);
  /**
   * The spot beside the pin `at`: against its side, its top at the pin's
   * (`lead` "top") or its foot at the pin's (`lead` "foot"), held whole in
   * the well.
   */
  const spotBeside = (at: Box, h: Hung, lead: "top" | "foot"): Spot => {
    const tall = tallOf(h);
    const left = h.side === "right" ? at.x + at.w : at.x - width;
    const top = lead === "top" ? at.y : at.y + at.h - tall;
    return {
      hung: h,
      left: Math.max(gap, Math.min(left, room.w - width - gap)),
      top: Math.max(gap, Math.min(top, room.h - gap - tall)),
    };
  };
  /** The pin stands against the card's edge where it stands (`standing`): on its side, within its top and its foot. */
  const against = (standing: Spot, at: Box) => {
    const tall = tallOf(standing.hung);
    const edge = standing.hung.side === "right" ? at.x + at.w : at.x - width;
    return (
      Math.abs(edge - standing.left) <= 1 &&
      at.y >= standing.top - 1 &&
      at.y + at.h <= standing.top + tall + 1
    );
  };

  let spotHeld: Spot | null = null;
  /**
   * The card's spot: chosen with its hang, then kept as the pin moves
   * against its edge, and moved only once the pin has left that edge, to
   * where the pin has the most of the edge ahead of it.
   */
  const spot = $derived.by((): Spot | null => {
    const h = hung;
    if (!h) {
      spotHeld = null;
      return null;
    }
    const at = pinAt;
    const before = untrack(() => spotHeld);
    let next = before;
    if (!before || before.hung !== h) {
      if (pinSeen) {
        next = spotBeside(at ?? pinSeen, h, "top");
      } else {
        // Not on the page: the well's top-right.
        next = {
          hung: h,
          left: Math.max(gap, room.w - width - gap),
          top: gap,
        };
      }
    } else if (at && !against(before, at)) {
      const rose = at.y < before.top - 1;
      const moved = spotBeside(at, h, rose ? "foot" : "top");
      next =
        Math.abs(moved.left - before.left) > 0.5 ||
        Math.abs(moved.top - before.top) > 0.5
          ? moved
          : before;
    }
    spotHeld = next;
    return next;
  });

  /** The card's own element (HangCard's `ref`): the float, while it is the card. */
  let hungRef = $state<HTMLElement | null>(null);
  $effect.pre(() => {
    if (card) {
      float = hungRef ?? undefined;
    }
  });
  /** The point the primitive places the card beside: just off its edge facing the pin, at its top. */
  let spotEl = $state<HTMLElement>();
  let foot = $state<HTMLElement>();
  let joined = $state(false);
  let neck = $state<Neck | null>(null);
  let hanger = $state<{ drawnOff: (by: number) => void }>();
  /** The pin's foot: where the pin stands on screen. */
  const footBox = $derived(pinAt);
  /**
   * It opens once it has been measured where it stands: mounted shut behind
   * its cut (`forceMount`), sized, and its spot chosen from that size, so
   * it slides out where it stays.
   */
  let ready = $state(false);
  $effect(() => {
    if (width > 0 && (natural || height) > 0 && spot) {
      ready = true;
    }
  });

  // Placed again (a new spot): the card travels from where it was drawn to
  // its new place over --dur-morph on --ease-drawer, its floating wrapper's
  // own `translate` (the cut moves with it), the neck kept on the pin as
  // drawn every frame of it. The first placement is where it opens.
  let placed: { x: number; y: number } | null = null;
  let moving: Animation | null = null;
  let follow = 0;
  const onplaced = (x: number, y: number) => {
    const el = float;
    const wrapper = el?.parentElement;
    const before = placed;
    placed = { x, y };
    if (
      !(wrapper && before && untrack(() => joined) && motionOk.current) ||
      (Math.abs(before.x - x) < 0.5 && Math.abs(before.y - y) < 0.5)
    ) {
      return;
    }
    const drawn = getComputedStyle(wrapper).translate;
    const [dx = 0, dy = 0] =
      drawn === "none"
        ? [0, 0]
        : drawn.split(" ").map((one) => Number.parseFloat(one));
    moving?.cancel();
    const run = wrapper.animate(
      [
        { translate: `${before.x - x + dx}px ${before.y - y + dy}px` },
        { translate: "0px 0px" },
      ],
      { duration: dur("--dur-morph"), easing: ease("--ease-drawer") }
    );
    moving = run;
    cancelAnimationFrame(follow);
    const step = () => {
      const now = getComputedStyle(wrapper).translate;
      const off =
        now === "none" ? 0 : Number.parseFloat(now.split(" ")[1] ?? "0") || 0;
      hanger?.drawnOff(off);
      follow = moving === run ? requestAnimationFrame(step) : 0;
    };
    follow = requestAnimationFrame(step);
    const done = () => {
      if (moving === run) {
        moving = null;
        cancelAnimationFrame(follow);
        hanger?.drawnOff(0);
      }
    };
    run.finished.then(done, done);
  };
  $effect(() => () => {
    cancelAnimationFrame(follow);
    moving?.cancel();
  });

  /* ── Coming and going ─────────────────────────────────────────────── */

  /** The foot sheet fades in; the card slides out of its pin (HangCard); the composer comes in by the kit's `@starting-style` (`popMotion`). */
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
   * Out: the card back into its pin (hang's fold, played here: the block
   * that holds it is going, and the primitive's own close never comes), the
   * composer by the kit's `popOut`, the foot sheet by its opacity; where
   * another card takes its place, gone from the screen in this very frame
   * (an outro of no length still holds its element for frames before the
   * block lets it go).
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
    const el = float;
    if (el && motionOk.current) {
      foldNow(el);
      return { duration: dur("--dur-exit") };
    }
    el?.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: dur("--dur-control"),
      easing: ease("--ease-out"),
      fill: "forwards",
    });
    return { duration: dur("--dur-control") };
  }
</script>

{#if card}
  <!-- The card and its pin's foot, held together while it folds back. Its
       coming and going are the component's own, whatever block mounts or
       drops it (`global`: inside this `if`, a local transition would play
       only when `card` itself changes). -->
  <div class="contents" in:arrive|global out:leave|global>
    <PinFoot
      box={footBox}
      card={float ?? null}
      {dot}
      {joined}
      {neck}
      side={hung?.side === "left" ? "start" : "end"}
      {tail}
      bind:el={foot}
    />
    <!-- Where the card stands: a pixel just off its edge facing the pin, at
         its top, which the primitive hangs it beside (a box of no size is
         never watched as it moves, floating-ui `observeMove`). -->
    <span
      aria-hidden="true"
      class="pointer-events-none absolute start-(--spot-x) top-(--spot-y) size-px"
      data-slot="pin-spot"
      bind:this={spotEl}
      style:--spot-x={spot
        ? `${spot.hung.side === "left" ? spot.left + width : spot.left - 1}px`
        : undefined}
      style:--spot-y={spot ? `${spot.top}px` : undefined}
    ></span>
    {#if spotEl && foot}
      <div
        class="contents"
        style:--float-max={spot ? `${spot.hung.max}px` : undefined}
      >
        <Popover.Root open={ready}>
          <HangCard
            align="start"
            anchor={foot}
            aria-label={label}
            avoidCollisions={false}
            customAnchor={spotEl}
            data-pin-card={pin}
            data-side={spot?.hung.side}
            data-slot={slot}
            escapeKeydownBehavior="defer-otherwise-ignore"
            forceMount
            frame="thread"
            from={spot?.hung.side === "left" ? "start" : "end"}
            interactOutsideBehavior="defer-otherwise-ignore"
            onCloseAutoFocus={(event) => event.preventDefault()}
            onneck={(next) => {
              neck = next;
            }}
            onOpenAutoFocus={(event) => event.preventDefault()}
            inPlace
            {onplaced}
            side={spot?.hung.side === "left" ? "left" : "right"}
            sideOffset={0}
            strategy="absolute"
            trapFocus={false}
            bind:joined
            bind:ref={hungRef}
            bind:this={hanger}
          >
            <!-- What it holds: the one part that scrolls, never sideways. -->
            <div
              class="flex min-h-0 min-w-0 flex-col gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain p-space-3"
              data-slot="pin-body"
              bind:this={body}
            >
              {@render children()}
            </div>
          </HangCard>
        </Popover.Root>
      </div>
    {/if}
  </div>
{:else}
  <div
    aria-label={label}
    class={[
      "pointer-events-auto absolute z-2 flex flex-col max-h-(--float-max)",
      sheet
        ? "inset-x-0 bottom-(--keyboard-lift,0px) w-full max-h-over-keyboard-70"
        : [
            "start-(--float-x) top-(--float-y) w-(--float-w)",
            "origin-(--float-origin)",
            popMotion,
          ],
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
    in:arrive|global
    out:leave|global
  >
    <!-- What it holds: the one part that scrolls, never sideways. -->
    <div
      class={[
        "flex min-h-0 min-w-0 flex-col",
        !bare &&
          "gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain",
        sheet &&
          "px-space-3 pt-space-3 pb-(--sheet-pb) border-t border-border-hairline rounded-t-lg bg-surface-raised shadow-drawer",
      ]}
      data-slot="pin-body"
      bind:this={body}
    >
      {@render children()}
    </div>
  </div>
{/if}
