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
  grow taller when appropriate"). It never stands over what the comment is
  about: the element's box and the pill together (`subject`). It stands
  beside them at their end side, else at their start side, its top at the
  pill's, shifted up as far as it takes to stand whole in the well (the room
  above the pill once the room below it runs out); else below them, else
  above them, where that side holds it whole; else on whichever of those
  two holds more, at that side's room, scrolling inside, where that is at
  least `--c-pin-card-reading-room` (or its own height, when that is less).
  Only an element that leaves no such room has the card beside its pill
  alone, at the well's height, else under or over the pill, whichever holds
  more, at that side's room. Always `--space-2` from
  the pill as drawn, its focus ring included, inside the well. A pin not on
  the page (its element gone) stands at the well's top-right. On a phone,
  under a finger, and wherever the pane says so (`sheet`), it is the well's
  foot sheet, full width, standing over a software keyboard by the well's
  `--keyboard-lift` (PreviewPane) so its field stays in view while the page
  keeps its box.

  It opens as every kit popover does, out of its pill (the kit's `pop`,
  `popMotion`: rising `--pop-rise` from the side it stands on and growing
  from `--pop-scale` as it fades in over `--dur-pop` on the drawer curve,
  on `data-state` going from `closed` to `open`), its transform origin at
  the pill: on its edge facing the pill, at the pill's height (or along it,
  under or over it). It mounts closed, is measured and placed, and only
  then opens, all before its first frame, so it rises from the side it
  ends up on, never the one a box not yet measured gave it. It goes back
  into the pill
  by `popOut` over `--dur-exit`, and at once where another pin's card takes
  its place. Without motion it fades. The foot sheet fades in over
  `--dur-menu` and out over `--dur-control`.
-->
<script lang="ts">
  import { type Snippet, tick } from "svelte";
  import type { TransitionConfig } from "svelte/transition";
  import { popMotion } from "#lib/components/ui/popover/index.js";
  import { frameObserver } from "../frame-observer";
  import { dur, easeOut, numberOf } from "../motion/curves.svelte";
  import { type PopSide, popOut } from "../motion/pop.svelte";

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
    /** What it is, read out. */
    label: string;
    /** Its `data-slot`: what the pane and the probes call it. */
    slot: "pin-card" | "pin-composer";
    /** The thread's pin, by its number: its hook (`data-pin-card`). */
    pin?: number;
    float?: HTMLElement;
    children: Snippet;
  } = $props();

  let width = $state(0);
  let height = $state(0);
  /**
   * Its height with nothing capping it: its own, plus what its thread's
   * room (PinCard `data-pin-room`) and it hold past their boxes. Where it
   * stands is chosen by this, never by the cap that choice sets, so a cap
   * never moves it.
   */
  let natural = $state(0);
  /** Placed: its `data-state` goes from `closed` to `open`, and the kit's pop runs. */
  let opened = $state(false);
  // Its size as it mounts, then each change in the next frame
  // (frameObserver): what it holds grows inside a ResizeObserver pass (the
  // composer's field, a thread's entries), and a size written inside that
  // pass would place it again there, a box the pass could no longer deliver.
  // The room's contents are watched too: under a cap they grow inside a
  // box that keeps its size.
  $effect(() => {
    const el = float;
    if (!el) {
      return;
    }
    const rooms = [...el.querySelectorAll<HTMLElement>("[data-pin-room]")];
    const read = () => {
      width = el.offsetWidth;
      height = el.offsetHeight;
      const past = rooms.reduce(
        (sum, one) => sum + one.scrollHeight - one.clientHeight,
        el.scrollHeight - el.clientHeight
      );
      natural = height + Math.max(0, past);
    };
    read();
    // Opened once the flush that places it has landed and its closed style
    // there is taken, so the transition starts from where it stands.
    tick().then(() => {
      if (float === el) {
        // biome-ignore lint/suspicious/noUnusedExpressions: the read takes its closed look at the side it was placed on, the start the kit's transition runs from
        getComputedStyle(el).translate;
        opened = true;
      }
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
  /** The least room above or below what it is about that it takes, scrolling, rather than standing over it: `--c-pin-card-reading-room`. */
  const reach = $derived(numberOf("--c-pin-card-reading-room") || 320);

  /**
   * What the comment is about, in the well: the pill and its element's box
   * as the well shows it (cut to the well), one box; the pill alone without
   * its element's.
   */
  const subject = $derived.by((): Box | null => {
    if (!mark) {
      return null;
    }
    const parts = box ? [mark, box] : [mark];
    const left = Math.max(0, Math.min(...parts.map((one) => one.x)));
    const top = Math.max(0, Math.min(...parts.map((one) => one.y)));
    const right = Math.min(
      room.w,
      Math.max(...parts.map((one) => one.x + one.w))
    );
    const bottom = Math.min(
      room.h,
      Math.max(...parts.map((one) => one.y + one.h))
    );
    return right > left && bottom > top
      ? { x: left, y: top, w: right - left, h: bottom - top }
      : mark;
  });

  /**
   * Where it stands: its top-left in the well, the side of the pill it
   * stands on (the kit's `data-side`), its tallest, and its transform
   * origin, all px.
   */
  const place = $derived.by(() => {
    if (sheet) {
      return null;
    }
    const full = Math.max(0, room.h - 2 * gap);
    /** Its height as it will stand beside the pill: what it holds, up to the well's. */
    const tall = Math.min(natural || height, full);
    if (!(mark && subject)) {
      return {
        left: Math.max(gap, room.w - width - gap),
        top: gap,
        side: "bottom" as PopSide,
        max: full,
        origin: { x: width, y: 0 },
      };
    }
    const pill = mark;
    /** Beside `about` at its end side, else its start side; none where neither holds its width. */
    const besideOf = (about: Box) => {
      const end = about.x + about.w + clear;
      if (end + width <= room.w - gap) {
        return { left: end, side: "right" as PopSide };
      }
      const start = about.x - clear - width;
      return start >= gap ? { left: start, side: "left" as PopSide } : null;
    };
    /** Its top at the pill's, shifted up as far as it takes to stand whole. */
    const besideTop = Math.max(gap, Math.min(pill.y, room.h - gap - tall));
    const across = Math.max(gap, Math.min(pill.x, room.w - width - gap));
    const under = room.h - (subject.y + subject.h + clear) - gap;
    const over = subject.y - clear - gap;
    const belowPill = room.h - (pill.y + pill.h + clear) - gap;
    const abovePill = pill.y - clear - gap;
    const nextTo = besideOf(subject);
    const alone = besideOf(pill);
    let spot: { left: number; top: number; side: PopSide; max: number };
    if (nextTo) {
      spot = { ...nextTo, top: besideTop, max: full };
    } else if (under >= tall) {
      spot = {
        left: across,
        top: subject.y + subject.h + clear,
        side: "bottom",
        max: under,
      };
    } else if (over >= tall) {
      spot = {
        left: across,
        top: subject.y - clear - tall,
        side: "top",
        max: over,
      };
    } else if (Math.max(under, over) >= Math.min(reach, tall)) {
      spot =
        under >= over
          ? {
              left: across,
              top: subject.y + subject.h + clear,
              side: "bottom",
              max: under,
            }
          : { left: across, top: gap, side: "top", max: over };
    } else if (alone) {
      spot = { ...alone, top: besideTop, max: full };
    } else if (belowPill >= tall || belowPill >= abovePill) {
      spot = {
        left: across,
        top: pill.y + pill.h + clear,
        side: "bottom",
        max: Math.max(0, belowPill),
      };
    } else {
      spot = {
        left: across,
        top: pill.y - clear - Math.min(tall, abovePill),
        side: "top",
        max: Math.max(0, abovePill),
      };
    }
    // The origin at the pill: its centre, brought onto the card's box.
    const standing = Math.min(tall, spot.max);
    const inside = (value: number, most: number) =>
      Math.max(0, Math.min(value, most));
    return {
      ...spot,
      origin: {
        x: inside(pill.x + pill.w / 2 - spot.left, width),
        y: inside(pill.y + pill.h / 2 - spot.top, standing),
      },
    };
  });

  /** The kit's state for its pop: none on the foot sheet. */
  const popState = $derived.by(() => {
    if (sheet) {
      return;
    }
    return opened ? "open" : "closed";
  });

  /** The foot sheet fades in; a card comes in by the kit's `@starting-style` (`popMotion`). */
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
   * Out: a card back into its pill (`popOut`), the foot sheet by its
   * opacity; where another card takes its place, gone from the screen in
   * this very frame (an outro of no length still holds its element for
   * frames before the block lets it go).
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
    return popOut(node, { side: place?.side ?? "bottom" });
  }
</script>

<div
  aria-label={label}
  class={[
    "pointer-events-auto absolute z-2 flex flex-col w-(--float-w) max-h-(--float-max) not-data-sheet:start-(--float-x) not-data-sheet:top-(--float-y) origin-(--float-origin) not-data-bare:overflow-y-auto not-data-bare:overscroll-contain not-data-bare:gap-space-2 not-data-sheet:not-data-bare:p-space-3 not-data-sheet:not-data-bare:border not-data-sheet:not-data-bare:border-border-control not-data-sheet:not-data-bare:rounded-lg not-data-bare:bg-surface-raised not-data-sheet:not-data-bare:shadow-hairline data-sheet:inset-x-0 data-sheet:bottom-(--keyboard-lift,0px) data-sheet:w-full data-sheet:max-h-over-keyboard-70 data-sheet:px-space-3 data-sheet:pt-space-3 data-sheet:pb-(--sheet-pb) data-sheet:border-t data-sheet:border-border-hairline data-sheet:rounded-t-lg data-sheet:bg-surface-raised data-sheet:shadow-drawer",
    !sheet && popMotion,
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
  {@render children()}
</div>
