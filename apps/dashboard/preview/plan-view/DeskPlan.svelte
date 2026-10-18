<script lang="ts">
  /**
   * The desk's frame: the side card beside the conversation (the real
   * SideSurface, the split's right side at its 360px) holding the plan. Its
   * head carries the title with the ring and its figure, and on a task
   * attempt the task's chip with its stage.
   */
  import type { Snippet } from "svelte";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconChevronRight } from "#lib/icons.js";
  import type { PlanFixture } from "./fixtures";

  let {
    plan,
    today = false,
    children,
  }: {
    plan: PlanFixture;
    /** Draw the head as it is now: the title alone. */
    today?: boolean;
    children: Snippet;
  } = $props();
</script>

<div class="desk">
  <SideSurface label="Plan" onclose={() => undefined} recessed={false}>
    {#snippet titleControl()}
      <span class="head mark-line">
        <span class="title">Plan</span>
        {#if !today}
          <span class="ring" data-box
            ><TaskRing done={plan.done} total={plan.total} /></span
          >
          <span data-num class="num figure">{plan.done} of {plan.total}</span>
        {/if}
      </span>
    {/snippet}
    {#snippet actions()}
      {#if plan.task && !today}
        <button
          aria-label="Open {plan.task.id}, {plan.task.stage}"
          class="task"
          type="button"
        >
          <span class="ref">{plan.task.id}</span>
          <span class="stage">· {plan.task.stage}</span>
          <IconChevronRight aria-hidden="true" />
        </button>
      {/if}
    {/snippet}
    <div class="body kit-edge-fade-block">
      {@render children()}
    </div>
  </SideSurface>
</div>

<style>
  .desk {
    inline-size: 360px;
    max-inline-size: 100%;
    block-size: 640px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    padding-inline-start: var(--space-2);
  }
  .title {
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .ring {
    display: grid;
    color: var(--ink-muted);
  }
  .figure {
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .ref {
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-strong);
  }
  .stage {
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    white-space: nowrap;
  }
  .body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1) var(--space-2) var(--space-4);
  }
</style>
