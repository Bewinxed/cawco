<script lang="ts">
  /**
   * One working delegate's row alone, on the side card's surface at its
   * 360px: what every way draws for a delegate at work, its progress line
   * drawn large (the row's whole width, the story's weight) and the sweep
   * crossing it. PlanFrame holds the sweep at a stated point of its run, so
   * three stills (start, middle, end) show the line pulsing.
   */
  import DelegateRow from "./DelegateRow.svelte";
  import { livePlan } from "./fixtures";
  import { frameView } from "./view.svelte";

  /** The live plan's second beat: the deposit's delegate two steps in, its line two thirds full. */
  const plan = livePlan(1);
  frameView({ loaded: Date.now(), phone: false, plan: () => plan });
  const working = plan.delegates.filter((one) => one.status === "live");
</script>

<div class="card" data-slot="delegate-card">
  <ul class="rows">
    {#each working as one (one.id)}
      <DelegateRow delegate={one} />
    {/each}
  </ul>
</div>

<style>
  .card {
    inline-size: 360px;
    max-inline-size: 100%;
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
  /* The line drawn large: the row's whole width, so its sweep's place along
     it reads in a still. Its weight is the story's (`lineWeight`). */
  .card :global([data-slot="progress-line"]) {
    flex-basis: 100%;
    max-inline-size: none;
  }
</style>
