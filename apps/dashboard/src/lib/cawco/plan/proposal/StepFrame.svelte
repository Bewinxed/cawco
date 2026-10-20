<script lang="ts">
  /**
   * The to-do that became a task of its own, its row alone on the side
   * card's surface at its 360px: the row as every way draws it, wearing the
   * task's glyph and its id (TaskBadge).
   */
  import { ROWS } from "./classes";
  import { plan } from "./fixtures";
  import StepRow from "./StepRow.svelte";
  import { frameView } from "./view.svelte";

  frameView({ loaded: Date.now(), phone: false, plan: () => plan });
  const promoted = plan.steps.filter((one) => one.promoted);
</script>

<div
  class="w-c-plan-card-w max-w-full rounded-lg bg-surface-raised px-space-3 py-space-1 shadow-xs"
  data-slot="step-card"
>
  <ul class={ROWS}>
    {#each promoted as step (step.id)}
      <StepRow {plan} {step} steps={plan.steps} />
    {/each}
  </ul>
</div>
