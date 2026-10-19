<script lang="ts">
  /**
   * The desk's side card: the real SideSurface at the split's 360px, as tall
   * as the split gives it, holding the plan. Its head carries the title with
   * the ring and its figure, the task's badge (its glyph, title and stage),
   * then Expand and Close, as the split gives them (`setSideExpand`; Expand
   * does nothing here). The plan scrolls inside it.
   */
  import type { Snippet } from "svelte";
  import { setSideExpand } from "#lib/cawco/side/expand.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { IconChevronRight } from "#lib/icons.js";
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphTask from "~icons/solar/clipboard-check-bold-duotone";
  import { type PlanFixture, progress } from "./fixtures";
  import { holdOn } from "./focus";

  let {
    plan,
    focus,
    children,
  }: {
    plan: PlanFixture;
    /** The row the card stands scrolled to (a step a story opens). */
    focus?: string;
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
</script>

<div class="desk" data-slot="side-card">
  <SideSurface label="Plan" onclose={() => undefined} recessed={false}>
    {#snippet titleControl()}
      <span class="head mark-line">
        <span class="title">Plan</span>
        <span class="progress" data-slot="progress" data-box
          ><TaskRing done={got.done} total={got.total} /></span
        >
        <span data-num class="num figure">{got.done} of {got.total}</span>
      </span>
    {/snippet}
    {#snippet actions()}
      <button
        aria-label="Open the task {plan.task.title}, {plan.task.stage}"
        class="task mark-line"
        type="button"
      >
        <GlyphTask aria-hidden="true" class="task-glyph" data-box />
        <span class="task-title">{plan.task.title}</span>
        <span class="stage">· {plan.task.stage}</span>
        <IconChevronRight aria-hidden="true" />
      </button>
    {/snippet}
    <div class="body kit-edge-fade-block" {@attach holdOn(focus)}>
      {@render children()}
    </div>
  </SideSurface>
</div>

<style>
  /* One cell the card fills: as a flex item it shrank to its words'
     narrowest width inside the 360px box. */
  .desk {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    inline-size: 360px;
    max-inline-size: 100%;
    block-size: 680px;
    max-block-size: 100dvh;
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
  /* The head's names in one size, on one line (the head recipe's label
     role): "Plan", the task's title, its stage. */
  /* The head's title group keeps its words' width (SideSurface lets it
     shrink to nothing, and "1 of 6" ran under the badge); the task's badge
     stands a step clear of it and gives way by truncating its title. */
  .desk :global(.side-head .identity) {
    min-inline-size: max-content;
  }
  .task {
    flex: 0 1 auto;
    min-inline-size: 0;
    margin-inline-start: var(--space-3);
  }
  .task-title,
  .stage {
    font: var(--type-label);
    font-weight: var(--weight-body);
    white-space: nowrap;
  }
  .task-title {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    color: var(--ink-strong);
  }
  .stage {
    color: var(--ink-muted);
  }
  /* The task badge's glyph, grown to the head with the task's title. */
  .desk :global(.task-glyph) {
    flex: none;
    inline-size: 12px;
    block-size: 12px;
    color: var(--ink-muted);
  }
  .body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-1) var(--space-2) var(--space-4);
  }
</style>
