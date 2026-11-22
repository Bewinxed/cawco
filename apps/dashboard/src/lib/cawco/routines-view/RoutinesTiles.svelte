<script lang="ts">
  import OutcomeGroup from "./OutcomeGroup.svelte";
  /**
   * The Routines view as tiles: every outcome is a tile of its own holding
   * its routines, three to a desk's row, so the layout is the grouping and
   * each routine is one press from its tile. What needs him leads; a tile
   * whose run asks a question takes two columns, room for the answer's
   * field. Under 36rem a tile shows its head and what needs him, the rest
   * of its routines folded behind its disclosure, and the outcomes that are
   * fine stand as lines of one card.
   */
  import { asksOf, type GroupProps, leadsOf, type Outcome } from "./outcomes";

  let {
    outcomes,
    group,
  }: {
    /** The outcomes in the order he reads them (outcomes.ts `keepOrder`). */
    outcomes: Outcome[];
    /** What each outcome's group takes. */
    group: GroupProps;
  } = $props();
</script>

<div
  data-slot="routines-view"
  data-direction="tiles"
  class="@container/view w-full"
>
  <ul
    class="grid grid-flow-row-dense grid-cols-outcome-tiles gap-space-3 @min-[36rem]/view:gap-space-5"
  >
    {#each outcomes.filter( (outcome) => leadsOf(outcome, group.acts) ) as outcome (outcome.sentence)}
      <li
        class={[
          "grid",
          asksOf(outcome, group.acts) && "@min-[42rem]/view:col-span-2",
        ]}
      >
        <OutcomeGroup {...group} fold="narrow" {outcome} surface="always" />
      </li>
    {/each}
    <!-- The outcomes that are fine: a tile each where the view has room;
         under it, lines of one shared card, so a phone holds them all. -->
    <li class="contents">
      <ul
        class="grid gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile @min-[36rem]/view:contents"
      >
        {#each outcomes.filter((outcome) => !leadsOf(outcome, group.acts)) as outcome (outcome.sentence)}
          <li class="grid">
            <OutcomeGroup {...group} fold="narrow" {outcome} surface="wide" />
          </li>
        {/each}
      </ul>
    </li>
  </ul>
</div>
