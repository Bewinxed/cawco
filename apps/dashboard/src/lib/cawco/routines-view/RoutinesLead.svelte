<script lang="ts">
  import OutcomeGroup from "./OutcomeGroup.svelte";
  /**
   * The Routines view as a lead and a ledger: the outcomes that need him
   * take the leading column, each open on its routines with the question
   * or the failure acted on in place; every other outcome is one line of
   * the ledger beside them, its sentence and where it stands, its routines
   * unfolded from its disclosure. What he reads grows with what needs him,
   * never with how many routines run. Under 52rem the ledger stands under
   * the lead.
   */
  import { type GroupProps, leadsOf, type Outcome } from "./outcomes";

  let {
    outcomes,
    group,
  }: {
    /** The outcomes in the order he reads them (outcomes.ts `keepOrder`). */
    outcomes: Outcome[];
    /** What each outcome's group takes. */
    group: GroupProps;
  } = $props();
  const lead = $derived(
    outcomes.filter((outcome) => leadsOf(outcome, group.acts))
  );
  const ledger = $derived(
    outcomes.filter((outcome) => !leadsOf(outcome, group.acts))
  );
</script>

<div
  data-slot="routines-view"
  data-direction="lead"
  class="@container/view w-full"
>
  <div
    class={[
      "grid items-start gap-space-3 @min-[36rem]/view:gap-space-5",
      lead.length > 0 && "@min-[52rem]/view:grid-cols-lead-ledger",
    ]}
  >
    {#if lead.length > 0}
      <div
        data-slot="lead"
        class="grid gap-space-3 @min-[36rem]/view:gap-space-5"
      >
        {#each lead as outcome (outcome.sentence)}
          <OutcomeGroup {...group} fold="narrow" {outcome} surface="always" />
        {/each}
      </div>
    {/if}
    <div
      data-slot="ledger"
      class="grid gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile @min-[36rem]/view:gap-space-5 @min-[36rem]/view:p-space-4"
    >
      {#each ledger as outcome (outcome.sentence)}
        <OutcomeGroup {...group} fold="always" {outcome} surface="never" />
      {/each}
    </div>
  </div>
</div>
