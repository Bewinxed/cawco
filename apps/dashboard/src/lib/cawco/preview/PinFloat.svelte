<!--
  What stands beside a comment's pill over the page: its composer while it
  is written (bare: the composer's own pill is its surface) and its thread
  once it is (the raised card recipe: `--radius-lg`, `--border-control`,
  `--shadow-hairline`, `--space-3` padding). One width for both,
  `--c-pin-card-w`, never past the well's room, so a card never changes
  width as it goes from composer to thread (commenting addendum §3).

  It stands at the pill's end side, its top at the pill's; else at its
  start side; else below it; `--space-2` from the pill, inside the well. A
  pin not on the page (its element gone) stands at the well's top-right. On
  a phone, and wherever the pane says so (`sheet`), it is the well's foot
  sheet, full width.

  It comes in from the pill, growing from `--press-scale` as it fades in
  over `--dur-menu` on `--ease-out`, its origin the pill's corner nearest
  it; it goes over `--dur-control`, opacity only. Without motion it fades.
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
    float = $bindable(),
    children,
  }: {
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
  /** Its distance from the pill and from the well's edges: `--space-2`. */
  const gap = $derived(numberOf("--space-2") || 7);

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
    const end = mark.x + mark.w + gap;
    if (end + width <= room.w - gap) {
      return { ...inside(end, mark.y), side: "end", origin: "top left" };
    }
    const start = mark.x - gap - width;
    if (start >= gap) {
      return { ...inside(start, mark.y), side: "start", origin: "top right" };
    }
    return {
      ...inside(mark.x, mark.y + mark.h + gap),
      side: "below",
      origin: "top left",
    };
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
  /** Out: opacity only. */
  function fade(_node: Element) {
    return {
      duration: dur("--dur-control"),
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
  style:--float-w="min(var(--c-pin-card-w), calc(100% - 2 * var(--space-2)))"
  style:--float-max="calc(100% - 2 * var(--space-2))"
  style:--sheet-pb="calc(var(--space-3) + env(safe-area-inset-bottom, 0px))"
  in:grow
  out:fade
>
  {@render children()}
</div>
