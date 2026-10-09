<script lang="ts">
  /**
   * How far a conversation's plan has got — the progress ring and its figure
   * — as the control that opens the plan beside it (SideSplit). A chip on
   * the tray row (app.css .kit-tray-chip), the delegate chips' own recipe,
   * so the row is one height on one line.
   */
  import { IconToolTodo } from "#lib/icons.js";
  import TaskRing from "../TaskRing.svelte";

  let {
    done,
    total,
    open,
    onopen,
  }: {
    done: number;
    total: number;
    /** The plan is on show beside the conversation. */
    open: boolean;
    onopen: () => void;
  } = $props();
</script>

<button
  aria-label={total > 0 ? `Plan, ${done} of ${total} done` : "Plan"}
  aria-pressed={open}
  class="plan-ring kit-tray-chip touch-hit"
  onclick={onopen}
  type="button"
>
  {#if total > 0}
    <TaskRing {done} size="md" {total} />
    <span>Plan</span>
    <span class="num">{done}/{total}</span>
  {:else}
    <IconToolTodo aria-hidden="true" />
    <span>Plan</span>
  {/if}
</button>

<style>
  .plan-ring {
    color: var(--ink-muted);
  }
  .plan-ring[aria-pressed="true"] {
    color: var(--ink-strong);

    &::before {
      background-color: var(--surface-fill);
    }
  }
  .num {
    font-variant-numeric: tabular-nums;
  }
</style>
