<script lang="ts">
  /**
   * One limit window as a bar (design/usage-tracker.md §1): a track that is
   * always there, a fill for the share used, and the pace tick — a 2px gap at
   * the share of the window's time already gone. Fill past the tick is a
   * window burning faster than it lasts. The fill takes the window's state
   * colour; nothing here carries text. A new reading tweens the fill once;
   * at rest nothing moves.
   */
  import type { MeterState } from "../usage";

  let {
    used,
    elapsed,
    state,
    label,
    size = 8,
  }: {
    /** Share used, 0–100 (a reading can pass 100; the bar stops at full). */
    used: number;
    /** Share of the window's time gone, 0–1; null draws no tick. */
    elapsed: number | null;
    state: MeterState;
    /** The window's name, for assistive tech: "5-hour". */
    label: string;
    /** Bar height in px: 8 on the page, 4 in the rail and session details. */
    size?: number;
  } = $props();

  const fill = $derived(Math.min(100, Math.max(0, used)));
</script>

<span
  aria-label="{label} used"
  aria-valuemax={100}
  aria-valuemin={0}
  aria-valuenow={Math.round(used)}
  class="bar"
  data-state={state}
  role="progressbar"
  style:--h="{size}px"
>
  <span class="fill" style:--used={fill / 100}></span>
  {#if elapsed !== null && state !== "reached"}
    <span aria-hidden="true" class="tick" style:--at={elapsed}></span>
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
    inline-size: calc(var(--used) * 100%);
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
