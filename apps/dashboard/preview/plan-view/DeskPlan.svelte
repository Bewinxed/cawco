<script lang="ts">
  /**
   * The desk's frame: the conversation, quiet, with the side card beside it
   * (the real SideSurface at the split's 360px) holding the plan. The card's
   * head carries the title with the ring and its figure, on a task attempt
   * the task's title and stage, then Expand and Close, as the split gives
   * them (`setSideExpand`; Expand does nothing on this page).
   */
  import type { Snippet } from "svelte";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconChevronRight } from "#lib/icons.js";
  import { type PlanFixture, progress } from "./fixtures";

  let {
    plan,
    today = false,
    toEnd = false,
    conversation,
    children,
  }: {
    plan: PlanFixture;
    /** Draw the head as it is now: the title alone. */
    today?: boolean;
    /** The card stands scrolled to its foot (the spec opened there). */
    toEnd?: boolean;
    /** What the conversation shows; quiet lines when nothing is given. */
    conversation?: Snippet;
    children: Snippet;
  } = $props();

  setSideExpand({
    available: true,
    backLabel: "Back to conversation",
    collapse: () => false,
    expanded: false,
    toggle: () => undefined,
  });

  const got = $derived(progress(plan));

  /** Holds the card at its foot while what is in it lays out. */
  function foot(node: HTMLElement) {
    if (!toEnd) {
      return;
    }
    const hold = () => {
      node.scrollTop = node.scrollHeight;
    };
    const sizes = new ResizeObserver(hold);
    for (const child of node.children) {
      sizes.observe(child);
    }
    hold();
    return () => sizes.disconnect();
  }
</script>

<div class="desk-frame" data-slot="desk-frame">
  <div class="conversation" aria-hidden={conversation ? undefined : "true"}>
    {#if conversation}
      {@render conversation()}
    {:else}
      <span class="line" style:--w="72%"></span>
      <span class="line" style:--w="90%"></span>
      <span class="line" style:--w="54%"></span>
      <span class="gap"></span>
      <span class="line" style:--w="80%"></span>
      <span class="line" style:--w="66%"></span>
      <span class="composer"></span>
    {/if}
  </div>
  <div class="desk">
    <SideSurface label="Plan" onclose={() => undefined} recessed={false}>
      {#snippet titleControl()}
        <span class="head mark-line">
          <span class="title">Plan</span>
          {#if !today}
            <span class="progress" data-slot="progress" data-box
              ><TaskRing done={got.done} total={got.total} /></span
            >
            <span data-num class="num figure">{got.done} of {got.total}</span>
          {/if}
        </span>
      {/snippet}
      {#snippet actions()}
        {#if plan.task && !today}
          <button
            aria-label="Open the task {plan.task.title}, {plan.task.stage}"
            class="task"
            type="button"
          >
            <span class="task-title">{plan.task.title}</span>
            <span class="stage">· {plan.task.stage}</span>
            <IconChevronRight aria-hidden="true" />
          </button>
        {/if}
      {/snippet}
      <div class="body kit-edge-fade-block" {@attach foot}>
        {@render children()}
      </div>
    </SideSurface>
  </div>
</div>

<style>
  /* The split: the conversation takes what the card leaves; under 640px of
     frame there is room for the card alone. */
  .desk-frame {
    container: desk-frame / inline-size;
    display: flex;
    gap: var(--space-3);
    inline-size: 780px;
    max-inline-size: 100%;
    block-size: 680px;
    padding: var(--space-3);
    border-radius: var(--radius-panel);
    background: var(--background);
    box-shadow: var(--shadow-xs);
  }
  .conversation {
    flex: 1 1 0;
    min-inline-size: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-4) var(--space-3);
    overflow: clip;
  }
  @container desk-frame (width < 640px) {
    .conversation {
      display: none;
    }
  }
  .line {
    inline-size: var(--w);
    block-size: 12px;
    border-radius: var(--radius-sm);
    background: var(--surface-fill);
  }
  .gap {
    block-size: var(--space-5);
  }
  .composer {
    margin-block-start: auto;
    block-size: 48px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
  }
  .desk {
    flex: none;
    inline-size: 360px;
    max-inline-size: 100%;
    min-block-size: 0;
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
  .progress {
    display: grid;
    color: var(--ink-muted);
  }
  .figure {
    color: var(--ink-muted);
    font: var(--type-meta);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .task-title {
    color: var(--ink-strong);
    font-weight: var(--weight-body);
    white-space: nowrap;
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
