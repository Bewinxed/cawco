<script lang="ts">
  /**
   * The to-do that became a task of its own, its row alone on the side
   * card's surface at its 360px: the row as every way draws it, wearing the
   * task's glyph and its id (TaskBadge).
   */
  import { plan } from "./fixtures";
  import StepRow from "./StepRow.svelte";
  import { frameView } from "./view.svelte";

  frameView({ loaded: Date.now(), phone: false, plan: () => plan });
  const promoted = plan.steps.filter((one) => one.promoted);
</script>

<div class="card" data-slot="step-card">
  <ul class="rows">
    {#each promoted as step (step.id)}
      <StepRow {plan} {step} steps={plan.steps} />
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
</style>
