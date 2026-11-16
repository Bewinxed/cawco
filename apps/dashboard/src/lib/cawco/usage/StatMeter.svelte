<script lang="ts" module>
  /** The strip's three columns: name, meter, figure. The strip sets them; each meter is a subgrid of them. */
  export const STAT_COLS = "auto minmax(0, 1fr) auto";
</script>

<script lang="ts">
  /**
   * One stat of the session card's strip as a meter: its name, the share
   * used drawn, and the share as a figure, on the strip's three columns (a
   * subgrid of the strip's grid, so every meter starts and ends on the same
   * edges and every figure stands in one column). The figure says what the
   * fill shows, so the fill never carries the meaning alone; the exact
   * numbers (tokens, the reset, the pace) are its tooltip, which focus
   * opens. The fill takes the share's state colour on a track that is no
   * state's.
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import type { MeterState } from "../usage";

  let {
    label,
    used,
    elapsed,
    state,
    figure,
    detail,
  }: {
    /** Its name: "Context", "5-hour". */
    label: string;
    /** Share used, 0–100 (a reading can pass 100; the meter stops at full). */
    used: number;
    /** Share of the window's time gone, 0–1; null draws no pace mark. */
    elapsed: number | null;
    state: MeterState;
    /** The figure beside it: "38%". */
    figure: string;
    /** The exact numbers, its tooltip: "76k of 200k tokens". */
    detail: string;
  } = $props();

  const share = $derived(Math.min(100, Math.max(0, used)));
  const pace = $derived(
    elapsed === null || state === "reached" ? null : elapsed
  );
</script>

<Tip label={detail} title={label}>
  {#snippet children(tip)}
    <!-- A button only so focus reaches its tooltip: it does nothing else. -->
    <button
      {...tip}
      data-slot="stat"
      class="col-span-full grid cursor-default grid-cols-subgrid items-center rounded-hair border-none bg-transparent p-0 text-start outline-offset-2"
      aria-label={`${label}: ${figure}. ${detail}`}
      type="button"
    >
      <span class="type-meta text-ink-muted">{label}</span>
      <span
        aria-hidden="true"
        class="group/bar relative block h-1.5 min-w-0 overflow-hidden rounded-pill bg-border-control"
        data-slot="track"
        data-state={state}
      >
        <span
          class="absolute inset-y-0 start-0 w-(--fill-w) rounded-pill bg-meter-calm group-state-near/bar:bg-warning-9 group-state-over/bar:bg-error-9 group-state-reached/bar:bg-error-9 group-state-stale/bar:bg-meter-stale motion-safe:transition-[inline-size] motion-safe:duration-(--duration-morph) motion-safe:ease-drawer"
          data-slot="fill"
          style:--fill-w={share > 0
            ? `max(${share}%, calc(var(--spacing) * 1.5))`
            : "0px"}
        ></span>
        {#if pace !== null}
          <span
            class="absolute inset-y-0 start-(--at) w-0.5 -translate-x-1/2 bg-surface-raised"
            style:--at={`${pace * 100}%`}
          ></span>
        {/if}
      </span>
      <span class="type-meta text-ink-strong tabular-nums text-end"
        >{figure}</span
      >
    </button>
  {/snippet}
</Tip>
