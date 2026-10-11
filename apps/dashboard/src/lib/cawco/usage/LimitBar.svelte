<script lang="ts">
  /**
   * One limit as a bar (design/usage-tracker.md §1): a track that is always
   * there, a fill, and the pace tick, a 2px gap. It reads one of two ways
   * (`reads`), and says which to assistive tech:
   *
   * - "used", for what fills up (a context window): the fill is the share
   *   used, the tick the share of the window's time already gone, so fill
   *   past the tick is burning faster than it lasts.
   * - "left", for a provider's limit, as the usage popover reads it: the
   *   fill is the share left, the tick where an even pace would leave you
   *   now (the share of time still to come), so fill short of the tick is
   *   burning faster than it lasts.
   *
   * The fill takes the window's state colour; nothing here carries visible
   * text. A new reading tweens the fill once; at rest nothing moves.
   */
  import type { MeterState } from "../usage";

  let {
    used,
    reads,
    elapsed,
    state,
    label,
    size = 8,
  }: {
    /** Share used, 0–100 (a reading can pass 100; the bar stops at full). */
    used: number;
    /** What the fill shows: the share used, or the share left. */
    reads: "used" | "left";
    /** Share of the window's time gone, 0–1; null draws no tick. */
    elapsed: number | null;
    state: MeterState;
    /** The window's name, for assistive tech: "5-hour". */
    label: string;
    /** Bar height in px: 8 on the page, 4 in the rail and session details. */
    size?: number;
  } = $props();

  const usedShare = $derived(Math.min(100, Math.max(0, used)));
  const shown = $derived(reads === "left" ? 100 - usedShare : usedShare);
  /** Where the tick stands, 0–1: time gone, or (reading left) time to come. */
  const tick = $derived.by(() => {
    if (elapsed === null || state === "reached") {
      return null;
    }
    return reads === "left" ? 1 - elapsed : elapsed;
  });
  /** The bar read out, the pace in plain words where there is one. */
  const said = $derived.by(() => {
    const share = `${Math.round(shown)}% ${reads}`;
    if (tick === null) {
      return share;
    }
    const even = Math.round(tick * 100);
    return reads === "left"
      ? `${share}; an even pace would leave ${even}% by now`
      : `${share}; an even pace would have used ${even}% by now`;
  });
</script>

<span
  aria-label="{label} {reads}"
  aria-valuemax={100}
  aria-valuemin={0}
  aria-valuenow={Math.round(shown)}
  aria-valuetext={said}
  class="bar"
  data-reads={reads}
  data-state={state}
  role="progressbar"
  style:--h="{size}px"
>
  <span class="fill" style:--share={shown / 100}></span>
  {#if tick !== null}
    <span aria-hidden="true" class="tick" style:--at={tick}></span>
  {/if}
</span>

<style>
  .bar {
    --fill: var(--meter-calm);
    --track: var(--meter-calm-track);
    position: relative;
    display: block;
    block-size: var(--h);
    border-radius: var(--radius-hair);
    background: var(--track);
    overflow: hidden;
  }
  .bar[data-state="near"] {
    --fill: var(--meter-near);
    --track: var(--meter-near-track);
  }
  .bar[data-state="over"],
  .bar[data-state="reached"] {
    --fill: var(--meter-over);
    --track: var(--meter-over-track);
  }
  .bar[data-state="stale"] {
    --fill: var(--meter-stale);
    --track: var(--meter-stale-track);
  }
  .fill {
    position: absolute;
    inset-block: 0;
    inset-inline-start: 0;
    inline-size: calc(var(--share) * 100%);
    border-radius: var(--radius-hair);
    background: var(--fill);

    @media (prefers-reduced-motion: no-preference) {
      transition: inline-size var(--dur-morph) var(--ease-drawer);
    }
  }
  /* The gap shows whatever the row is painted in: the card, or the near and
     over rows' wash over it. */
  .tick {
    position: absolute;
    inset-block: 0;
    inset-inline-start: calc(var(--at) * 100%);
    inline-size: 2px;
    translate: -1px 0;
    /* It follows the clock, so it never tweens: that would be motion at rest. */
    background: var(--row-paint, var(--surface-raised));
  }
</style>
