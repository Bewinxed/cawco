<script lang="ts">
  /**
   * How far a conversation's plan has got — the progress ring and its figure
   * — as the control that opens the plan beside it (SideSplit). A plan with
   * a spec and nothing counted yet turns its ring.
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
  class="plan-ring press-tint touch-hit"
  onclick={onopen}
  type="button"
>
  {#if total > 0}
    <TaskRing {done} size="sm" {total} />
    <span class="num">{done}/{total}</span>
  {:else}
    <IconToolTodo aria-hidden="true" />
    <span>Plan</span>
  {/if}
</button>

<style>
  .plan-ring {
    --hit-edge: 1px;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    color: var(--ink-muted);
    font: var(--type-meta);
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .plan-ring[aria-pressed="true"] {
    color: var(--ink-strong);
    background: var(--surface-fill);
  }
  .plan-ring :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  @media (hover: hover) and (pointer: fine) {
    .plan-ring:hover {
      background: var(--surface-hover);
    }
  }
</style>
