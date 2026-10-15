<script lang="ts">
  /**
   * A routine opened in place under its row: what it does, when it runs,
   * and what its last runs said, nothing else (the owner, 2026-10-14).
   *
   * 1. Its instruction, as written.
   * 2. Its schedule in words, its zone a chip only when it is not the
   *    reader's own; an event routine says what fires it.
   * 3. Recent runs, the newest three: when, then the run's own result, the
   *    words its run set (Caw's `routine_result`, a delegate's
   *    `finish_item`), two lines at most, and Read the run. A silent run
   *    answered `NO_REPLY`: "Nothing to report", with the hub's reason when
   *    it kept one (the curator's empty inbox). A failed one says why, from
   *    the hub's reason. A run going now says so.
   *
   * No spend, no who runs it, nothing drawn over time: the row already says
   * when it runs next, and its actions are in the row's ⋯.
   */
  import { threadHref } from "#lib/cawco/thread-tabs.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconClock, IconGlobe, IconHook } from "#lib/icons.js";
  import type { Routine, RoutineRun } from "./preview-data";
  import { readerTimeOf, scheduleOf, whenOf } from "./schedule";

  let { routine }: { routine: Routine } = $props();

  /** The runs shown: the newest three. */
  const SHOWN = 3;

  const schedule = $derived(scheduleOf(routine.cron, routine.timeZone));
  const recent = $derived(routine.runs.slice(0, SHOWN));
  /** Where a run is read whole: the routine's thread, where its result is noted. */
  const runHref = $derived(
    routine.threadId ? threadHref(routine.threadId) : null
  );

  /** A run's line, from what the hub keeps for it. */
  function lineOf(run: RoutineRun): string {
    if (run.state === "running" || run.state === "starting") {
      return "Running…";
    }
    if (run.state === "queued") {
      return "Waiting for the run before it";
    }
    if (run.state === "skipped") {
      return `Skipped: ${run.reason ?? "nothing started"}`;
    }
    if (run.outcome === "silent") {
      return run.reason
        ? `Nothing to report: ${run.reason}`
        : "Nothing to report";
    }
    if (run.outcome === "failed") {
      return `Failed: ${run.reason ?? "no reason was kept"}`;
    }
    if (run.outcome === "cancelled") {
      return "Stopped before it finished";
    }
    return run.output ?? "Nothing to report";
  }
</script>

<div class="detail">
  <p class="instruction">{routine.prompt}</p>

  <p class="when">
    {#if routine.trigger}
      <IconHook aria-hidden="true" class="when-glyph" />
      <span>When {routine.trigger}</span>
    {:else}
      <IconClock aria-hidden="true" class="when-glyph" />
      <span class:code={schedule.raw}>{schedule.words}</span>
      {#if schedule.zone}
        <Badge
          class="zone"
          title="{schedule.words} in {schedule.zone} · the next is {readerTimeOf(
            routine.nextSlot
          )}"
          variant="secondary"
          ><IconGlobe aria-hidden="true" />{schedule.zone}</Badge
        >
      {/if}
    {/if}
  </p>

  {#if recent.length > 0}
    <section aria-labelledby="runs-{routine.id}" class="runs">
      <h4 class="runs-head" id="runs-{routine.id}">Recent runs</h4>
      <ol>
        {#each recent as run (run.id)}
          <li class="run" data-outcome={run.outcome ?? run.state}>
            <span class="run-when num">{whenOf(run.startedAt)}</span>
            <span class="run-line">{lineOf(run)}</span>
            {#if runHref}
              <a class="read" href={runHref}>Read the run</a>
            {/if}
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-2) var(--space-3);
  }
  /* On a card 400px wide or more, on the row's title column, at 72ch. */
  @container routines-card (min-width: 400px) {
    .detail {
      padding-inline-start: calc(var(--c-row-lead) + var(--space-3));
      max-inline-size: calc(72ch + var(--c-row-lead) + var(--space-3));
    }
  }
  .instruction {
    max-inline-size: 72ch;
    margin: 0;
    font: var(--type-prose);
    color: var(--ink-strong);
    text-wrap: pretty;
  }
  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin: 0;
    font: var(--type-label);
    color: var(--ink-row);
  }
  .when :global(.when-glyph) {
    flex: none;
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-muted);
  }
  .code {
    font: var(--type-code);
    font-variant-ligatures: none;
  }
  .runs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-start: var(--space-2);

    & ol {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
  }
  .runs-head {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  /* When in a fixed column, so the results line up and read down. */
  /* When, the result, Read the run: one row each, every run's link ending
     on the same edge, so the results read down between them. */
  .run {
    display: grid;
    grid-template-columns: 15ch minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--space-3);
    font: var(--type-meta);
  }
  .run-when {
    color: var(--ink-muted);
  }
  /* Two lines at most: the whole result is read in the run's thread. */
  .run-line {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--ink-row);
    text-wrap: pretty;
  }
  .run[data-outcome="silent"] .run-line {
    color: var(--ink-muted);
  }
  .run[data-outcome="failed"] .run-line {
    color: var(--status-fail-ink);
  }
  .run[data-outcome="running"] .run-line,
  .run[data-outcome="starting"] .run-line {
    color: var(--status-live-ink);
  }
  .read {
    color: var(--link-ink);
    text-decoration: none;
  }
  @media (hover: hover) {
    .read:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  /* A finger's link: 44px tall, its words where they were. */
  @media (pointer: coarse) {
    .read {
      display: inline-flex;
      align-items: center;
      min-block-size: var(--c-row-h);
      margin-block: calc((var(--c-row-h) - 1lh) / -2);
    }
  }
  /* A phone: when over the result, the result the whole width. */
  @container routines-card (max-width: 399px) {
    .run {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
    .read {
      justify-self: start;
    }
  }
</style>
