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
  class="group/bar relative block h-(--h) overflow-hidden rounded-hair bg-meter-calm-track state-near:bg-meter-near-track state-over:bg-meter-over-track state-reached:bg-meter-over-track state-stale:bg-meter-stale-track"
  data-reads={reads}
  data-state={state}
  role="progressbar"
  style:--h="{size}px"
>
  <span
    data-slot="fill"
    class="absolute inset-y-0 start-0 w-(--fill-w) rounded-hair bg-meter-calm group-state-near/bar:bg-meter-near group-state-over/bar:bg-meter-over group-state-reached/bar:bg-meter-over group-state-stale/bar:bg-meter-stale motion-safe:transition-[inline-size] motion-safe:dur-morph motion-safe:ease-drawer"
    style:--fill-w="calc(var(--share) * 100%)"
    style:--share={shown / 100}
  ></span>
  {#if tick !== null}
    <!-- literal: -1px -->
    <span
      aria-hidden="true"
      class="absolute inset-y-0 start-(--tick-at) w-space-row translate-x-(--tick-nudge) bg-(color:--tick-paint)"
      style:--at={tick}
      style:--tick-at="calc(var(--at) * 100%)"
      style:--tick-nudge="-1px"
      style:--tick-paint="var(--row-paint, var(--surface-raised))"
    ></span>
  {/if}
</span>
