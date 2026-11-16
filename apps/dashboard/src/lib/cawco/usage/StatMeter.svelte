<script lang="ts" module>
  /** The strip's three columns: name, meter, figure. The strip sets them; each meter is a subgrid of them. */
  export const STAT_COLS = "auto minmax(0, 1fr) auto";
  /** The cells a `cells` meter fills. */
  const CELLS = Array.from({ length: 10 }, (_, cell) => cell);
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
   * state's. Its look is the bench's while the owner picks one (meter-look).
   */
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import type { MeterState } from "../usage";
  import { meterLook } from "./meter-look";

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

  const lookNow = meterLook();
  const look = $derived(lookNow());
  const share = $derived(Math.min(100, Math.max(0, used)));
  const pace = $derived(
    elapsed === null || state === "reached" ? null : elapsed
  );
  const filled = $derived(Math.ceil((share / 100) * CELLS.length - 0.001));
</script>

{#snippet meter()}
  <span
    aria-label={label}
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(share)}
    aria-valuetext={`${figure} used`}
    class="group/bar relative block min-w-0 data-[look=stack]:col-span-full data-[look=stack]:row-start-2"
    data-look={look}
    data-state={state}
    role="progressbar"
  >
    {#if look === "cells"}
      <span class="grid grid-cols-10 gap-0.5" data-slot="cells">
        {#each CELLS as cell (cell)}
          <span
            class="h-2 rounded-hair bg-border-control data-on:bg-meter-calm group-state-near/bar:data-on:bg-warning-9 group-state-over/bar:data-on:bg-error-9 group-state-reached/bar:data-on:bg-error-9 group-state-stale/bar:data-on:bg-meter-stale"
            data-on={cell < filled || undefined}
          ></span>
        {/each}
      </span>
    {:else}
      <span
        class="relative block h-1.5 overflow-hidden rounded-pill bg-border-control data-[look=stack]:h-0.5"
        data-look={look}
        data-slot="track"
      >
        <span
          class="absolute inset-y-0 start-0 w-(--fill-w) rounded-pill bg-meter-calm group-state-near/bar:bg-warning-9 group-state-over/bar:bg-error-9 group-state-reached/bar:bg-error-9 group-state-stale/bar:bg-meter-stale motion-safe:transition-[inline-size] motion-safe:duration-(--duration-morph) motion-safe:ease-drawer"
          data-slot="fill"
          style:--fill-w={share > 0
            ? `max(${share}%, calc(var(--spacing) * 1.5))`
            : "0px"}
        ></span>
        {#if pace !== null && look === "track"}
          <span
            aria-hidden="true"
            class="absolute inset-y-0 start-(--at) w-0.5 -translate-x-1/2 bg-surface-raised"
            style:--at={`${pace * 100}%`}
          ></span>
        {/if}
      </span>
    {/if}
  </span>
{/snippet}

<Tip label={detail} title={label}>
  {#snippet children(tip)}
    <!-- A button only so focus reaches its tooltip: it does nothing else. -->
    <button
      {...tip}
      data-slot="stat"
      class="col-span-full grid cursor-default grid-cols-subgrid items-center gap-y-space-1 rounded-hair border-none bg-transparent p-0 text-start outline-offset-2 data-[look=stack]:grid-rows-2"
      data-look={look}
      aria-label={`${label}: ${figure}. ${detail}`}
      type="button"
    >
      <span class="type-meta text-ink-muted">{label}</span>
      {#if look === "stack"}
        <span
          class="col-start-3 type-meta text-ink-strong tabular-nums text-end"
          >{figure}</span
        >
        {@render meter()}
      {:else}
        {@render meter()}
        <span class="type-meta text-ink-strong tabular-nums text-end"
          >{figure}</span
        >
      {/if}
    </button>
  {/snippet}
</Tip>
