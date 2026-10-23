<!--
  What stands beside a comment's pill over the page: its composer while it
  is written (bare: the composer's own pill is its surface) and its thread
  once it is (the raised card recipe: `--radius-lg`, `--border-control`,
  `--shadow-hairline`, `--space-3` padding). One width for both,
  `--c-pin-card-reading-w` (two fifths of the well, 280 to 480px: the pin
  room is the size container its `cqi` reads), never past the well's room,
  so a card never changes width as it goes from composer to thread
  (commenting addendum §3; the owner's pick "Beside the comment").

  It stands at the pill's end side, its top at the pill's; else at its
  start side; else below it (over it where the room below is short);
  `--space-2` from the pill as drawn, its focus ring included, inside the
  well, never on it. It
  runs down the page as far as there is room: its tallest is the room from
  where it stands to the well's foot, until that room is under
  `--c-pin-card-reading-room`; then it takes the well's height, its foot on
  the well's. A pin not on the page (its element gone) stands at the well's
  top-right, as tall as the well. On a phone, under a finger, and wherever
  the pane says so (`sheet`), it is the well's foot sheet, full width.

  It comes in from the pill, growing from `--press-scale` as it fades in
  over `--dur-menu` on `--ease-out`, its origin the pill's corner nearest
  it; it goes over `--dur-control`, opacity only, and at once where another
  pin's card takes its place. Without motion it fades.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { frameObserver } from "../frame-observer";
  import { dur, easeOut, motionOk, numberOf } from "../motion/curves.svelte";

  interface Box {
    h: number;
    w: number;
    x: number;
    y: number;
  }

  let {
    mark,
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
  // Its size as it mounts, then each change in the next frame
  // (frameObserver): what it holds grows inside a ResizeObserver pass (the
  // composer's field, a thread's entries), and a size written inside that
  // pass would place it again there, a box the pass could no longer deliver.
  $effect(() => {
    const el = float;
    if (!el) {
      return;
    }
    const read = () => {
      width = el.offsetWidth;
      height = el.offsetHeight;
    };
    read();
    const watch = frameObserver(read);
    watch.observe(el);
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
  /** The least room below where it stands that it hangs in from the pill: `--c-pin-card-reading-room`. */
  const reach = $derived(numberOf("--c-pin-card-reading-room") || 320);

  const place = $derived.by(() => {
    if (sheet) {
      return null;
    }
    const inside = (left: number, top: number) => ({
      left: Math.max(gap, Math.min(left, room.w - width - gap)),
      top: Math.max(gap, Math.min(top, room.h - height - gap)),
    });
    if (!mark) {
      return {
        ...inside(room.w - width - gap, gap),
        side: "room",
        origin: "top right",
      };
    }
    const end = mark.x + mark.w + clear;
    if (end + width <= room.w - gap) {
      return { ...inside(end, mark.y), side: "end", origin: "top left" };
    }
    const start = mark.x - clear - width;
    if (start >= gap) {
      return { ...inside(start, mark.y), side: "start", origin: "top right" };
    }
    // No side has its width: under the pill, or over it where the room
    // under it is short of `reach` and the room over it is more, so it
    // never stands on the pill.
    const under = room.h - (mark.y + mark.h + clear) - gap;
    if (under < reach && mark.y - clear - gap > under) {
      return {
        ...inside(mark.x, mark.y - clear - height),
        side: "above",
        origin: "bottom left",
      };
    }
    return {
      ...inside(mark.x, mark.y + mark.h + clear),
      side: "below",
      origin: "top left",
    };
  });

  /**
   * Its tallest, px: beside the pill, the room from the pill's top to the
   * well's foot, else the well's height once that room is under `reach`;
   * under or over the pill, the room on that side of it.
   */
  const tallest = $derived.by(() => {
    if (sheet) {
      return null;
    }
    if (!mark) {
      return room.h - 2 * gap;
    }
    if (place?.side === "above") {
      return mark.y - clear - gap;
    }
    if (place?.side === "below") {
      return room.h - (mark.y + mark.h + clear) - gap;
    }
    const below = room.h - Math.max(gap, mark.y) - gap;
    return below >= reach ? below : room.h - 2 * gap;
  });

  /** In from the pill: `--press-scale` to its own size as it fades in. */
  function grow(_node: Element) {
    const travel = motionOk.current && !sheet;
    const from = numberOf("--press-scale") || 0.97;
    return {
      duration: dur("--dur-menu"),
      easing: easeOut,
      css: (t: number) =>
        travel
          ? `opacity: ${t}; transform: scale(${from + (1 - from) * t})`
          : `opacity: ${t}`,
    };
  }
  /**
   * Out: opacity only; where another card takes its place, gone from the
   * screen in this very frame (an outro of no length still holds its
   * element for frames before the block lets it go).
   */
  function fade(node: Element) {
    if (exit.at === "cut" && node instanceof HTMLElement) {
      node.style.display = "none";
    }
    return {
      duration: exit.at === "cut" ? 0 : dur("--dur-control"),
      easing: easeOut,
      css: (t: number) => `opacity: ${t}`,
    };
  }
</script>

<div
  aria-label={label}
  class="pointer-events-auto absolute z-2 flex flex-col w-(--float-w) max-h-(--float-max) not-data-sheet:start-(--float-x) not-data-sheet:top-(--float-y) origin-(--float-origin) not-data-bare:overflow-y-auto not-data-bare:overscroll-contain not-data-bare:gap-space-2 not-data-sheet:not-data-bare:p-space-3 not-data-sheet:not-data-bare:border not-data-sheet:not-data-bare:border-border-control not-data-sheet:not-data-bare:rounded-lg not-data-bare:bg-surface-raised not-data-sheet:not-data-bare:shadow-hairline data-sheet:inset-x-0 data-sheet:bottom-0 data-sheet:w-full data-sheet:max-h-7/10 data-sheet:px-space-3 data-sheet:pt-space-3 data-sheet:pb-(--sheet-pb) data-sheet:border-t data-sheet:border-border-hairline data-sheet:rounded-t-lg data-sheet:bg-surface-raised data-sheet:shadow-drawer"
  data-bare={bare || undefined}
  data-sheet={sheet || undefined}
  data-side={place?.side}
  data-slot={slot}
  data-pin-card={pin}
  role="dialog"
  bind:this={float}
  style:--float-x={place ? `${place.left}px` : undefined}
  style:--float-y={place ? `${place.top}px` : undefined}
  style:--float-origin={place?.origin ?? "bottom center"}
  style:--float-w={FLOAT_W}
  style:--float-max={tallest === null
    ? "calc(100% - 2 * var(--space-2))"
    : `${Math.max(0, tallest)}px`}
  style:--sheet-pb="calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
  in:grow
  out:fade
>
  {@render children()}
</div>
