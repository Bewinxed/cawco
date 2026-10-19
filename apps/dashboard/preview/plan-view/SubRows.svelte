<script lang="ts">
  /**
   * A step's own steps (a session's sub-steps, a delegate's steps): the
   * same row one level in on the nesting rails, its tile, its words, its
   * time. They are read here, not opened or ticked.
   */
  import type { SubStep } from "./fixtures";
  import StepTile from "./StepTile.svelte";
  import { useView } from "./view.svelte";

  let { steps }: { steps: SubStep[] } = $props();

  const view = useView();
</script>

{#each steps as sub (sub.id)}
  {@const state = view.stateOf(sub.id, sub.state)}
  <li data-flip="box">
    <div class="row" data-slot="plan-row" data-state={state}>
      <span class="pv-lead"><StepTile {state} /></span>
      <span class="words" data-slot="words">{sub.words}</span>
      <span class="num time" data-num data-slot="time"
        >{view.timeOf(sub.id, sub.state, sub.startedAgo, sub.took)}</span
      >
    </div>
  </li>
{/each}

<style>
  .row {
    display: grid;
    grid-template-columns: var(--pv-tile, 18px) minmax(0, 1fr) auto;
    column-gap: var(--space-2);
    align-items: start;
    min-block-size: 28px;
    padding-block: 5px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .pv-lead {
    display: grid;
    place-items: center;
    block-size: max(1lh, var(--pv-tile, 18px));
  }
  .words {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .row[data-state="doing"] .words,
  .row[data-state="you"] .words {
    font-weight: var(--weight-strong);
  }
  .row[data-state="done"] .words {
    color: var(--ink-muted);
  }
  .row[data-state="failed"] .words {
    color: var(--status-fail-ink);
  }
  .time {
    inline-size: 7ch;
    text-align: end;
    color: var(--ink-muted);
    font: var(--type-meta);
    line-height: inherit;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  :global([data-coarse]) .row {
    min-block-size: 44px;
    padding-block: 11px;
  }
</style>
