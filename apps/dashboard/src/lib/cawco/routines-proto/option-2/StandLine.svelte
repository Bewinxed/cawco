<script lang="ts">
  /**
   * Where things stand, in one line beside the view's acts: live or read
   * when, the runs today and how many failed, how many routines need the
   * person (withheld while the reading is not live), and the next run on
   * the person's clock.
   */
  import { clockOf, dayOf, isFail, NOW, type Routine, type Run } from "./day";
  import type { Standing } from "./RoutineRow.svelte";
  import RunGlyph from "./RunGlyph.svelte";

  let {
    routines,
    runs,
    standings,
    now = NOW,
    live = true,
  }: {
    routines: Routine[];
    runs: Run[];
    standings: Record<string, Standing>;
    now?: number;
    live?: boolean;
  } = $props();

  const today = $derived(runs.filter((run) => dayOf(run.at, now) === "Today"));
  const failed = $derived(today.filter((run) => isFail(run.ending)).length);
  const needs = $derived(
    routines.filter((one) => standings[one.id] === "needs").length
  );
  const next = $derived(
    routines
      .filter((one) => one.next !== null && standings[one.id] !== "wontRun")
      .sort((a, b) => (a.next ?? 0) - (b.next ?? 0))[0]
  );
</script>

<p
  data-slot="stand-line"
  class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-4 gap-y-space-1 type-label text-ink-muted"
>
  {#if live}
    <span class="mark-line inline-flex items-center gap-space-2 text-ink-strong"
      ><RunGlyph mark="running" size="sm" /><span>Live</span></span
    >
  {:else}
    <span class="text-ink-strong">Read at {clockOf(now)}</span>
  {/if}
  <span
    ><span class="num text-ink-strong">{today.length}</span> runs today{#if failed > 0},
      <span class="num text-status-fail-ink">{failed} failed</span>{/if}</span
  >
  {#if live && needs > 0}
    <span><span class="num text-status-attn-ink">{needs}</span> need you</span>
  {/if}
  {#if next?.next}
    <span
      >Next <span class="num text-ink-strong">{clockOf(next.next)}</span>
      {next.name}</span
    >
  {/if}
</p>
