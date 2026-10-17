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
  data-slot="plan-ring"
  aria-label={total > 0 ? `Plan, ${done} of ${total} done` : "Plan"}
  aria-pressed={open}
  class="kit-tray-chip touch-hit text-ink-muted aria-pressed:text-ink-strong"
  onclick={onopen}
  type="button"
>
  {#if total > 0}
    <TaskRing {done} size="md" {total} />
    <span>Plan</span>
    <span data-slot="num" class="num">{done}/{total}</span>
  {:else}
    <IconToolTodo aria-hidden="true" />
    <span>Plan</span>
  {/if}
</button>

<style>
  /* residual: pseudo */
  [data-slot="plan-ring"][aria-pressed="true"]::before {
    background-color: var(--surface-fill);
  }
</style>
