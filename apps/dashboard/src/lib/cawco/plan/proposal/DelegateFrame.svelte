<script lang="ts">
  /**
   * A working delegate's pulse in three stills: its row as every way draws
   * it, on the side card's surface at its 360px, at the start, the middle
   * and the end of one run of the sweep across its progress line, each
   * named. The line is drawn large (the row's whole width, the story's
   * weight) and its band is the raised surface in full, so its place along
   * the fill reads in a still. Each still stands its band where the run
   * puts it at that share (ProgressLine's `kit-skeleton-sweep`, from -100%
   * to 100% of its box), drawn there with no animation: a capture that
   * stops animations can't take it back to its start.
   */
  import DelegateRow from "./DelegateRow.svelte";
  import { livePlan } from "./fixtures";
  import { frameView } from "./view.svelte";

  /** The live plan's second beat: the deposit's delegate two steps in, its line two thirds full. */
  const plan = livePlan(1);
  frameView({ loaded: Date.now(), phone: false, plan: () => plan });
  const working = plan.delegates.filter((one) => one.status === "live");
  /**
   * At a share of its run the band's centre stands at twice the share, less
   * half, of the fill: these three put it at 10%, 50% and 90% of the fill.
   */
  const MOMENTS = [
    { label: "Start", at: 0.3 },
    { label: "Middle", at: 0.5 },
    { label: "End", at: 0.7 },
  ] as const;
</script>

<div class="moments" data-slot="pulse">
  {#each MOMENTS as moment (moment.label)}
    <div
      class="moment"
      data-at={moment.at}
      data-slot="pulse-moment"
      style:--pv-at={moment.at}
    >
      <p class="label">{moment.label}</p>
      <div class="card">
        <ul class="rows">
          {#each working as one (one.id)}
            <DelegateRow delegate={one} />
          {/each}
        </ul>
      </div>
    </div>
  {/each}
</div>

<style>
  .moments {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: 360px;
    max-inline-size: 100%;
  }
  .moment {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .label {
    margin: 0;
    color: var(--ink-muted);
    font: var(--type-meta);
  }
  .card {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-xs);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* The line drawn large: the row's whole width. Its weight is the story's
     (`lineWeight`). */
  .card :global([data-slot="progress-line"]) {
    flex-basis: 100%;
    max-inline-size: none;
  }
  /* The band held at its moment, the raised surface in full across its
     middle. */
  .moment :global(.pv-sweep) {
    animation: none;
    translate: calc(-100% + var(--pv-at) * 200%) 0;
    background: linear-gradient(
      90deg,
      transparent 0 32%,
      var(--surface-raised) 42% 58%,
      transparent 68% 100%
    );
  }
</style>
