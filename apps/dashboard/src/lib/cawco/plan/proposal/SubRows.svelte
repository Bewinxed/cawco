<script lang="ts">
  /**
   * A step's own steps (a session's sub-steps, a delegate's steps): the
   * same row one level in on the nesting rails, its tile, its words, its
   * time. They are read here, not opened or ticked.
   */
  import { STATE_WORDS, TIME } from "./classes";
  import type { SubStep } from "./fixtures";
  import StepTile from "./StepTile.svelte";
  import { useView } from "./view.svelte";

  let { steps }: { steps: SubStep[] } = $props();

  const view = useView();
</script>

<!-- The tile's own column (--pv-tile): a step's two-lane gutter (--lead-w)
     is its row's, not its sub-steps'. In a narrow column (Lanes' steps side
     by side) the time stands under the words, so the words keep the row's
     width. -->
{#each steps as sub (sub.id)}
  {@const state = view.stateOf(sub.id, sub.state)}
  <li data-flip="box">
    <div
      class="group/row grid grid-cols-(--pv-cols) items-start gap-x-space-2 min-h-c-row-lead py-c-plan-row-pad type-label text-ink-strong in-data-coarse:min-h-c-touch-floor in-data-coarse:py-c-plan-row-pad-coarse @max-plan-step/step-row:grid-cols-(--pv-cols-narrow)"
      data-slot="plan-row"
      data-state={state}
    >
      <span class="grid h-(--pv-lead-h) place-items-center" data-lead
        ><StepTile {state} /></span
      >
      <span
        class={["min-w-0 wrap-anywhere text-pretty", STATE_WORDS]}
        data-slot="words">{sub.words}</span
      >
      <span
        class={[
          TIME,
          "@max-plan-step/step-row:col-start-2 @max-plan-step/step-row:w-auto @max-plan-step/step-row:text-start",
        ]}
        data-num
        data-slot="time"
        >{view.timeOf(sub.id, sub.state, sub.startedAgo, sub.took)}</span
      >
    </div>
  </li>
{/each}
