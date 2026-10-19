<script lang="ts">
  /**
   * THE TASK BADGE (proposal): a to-do that became a task of its own shows
   * that task as a glyph and its stage, never an id. The Badge recipe
   * (DESIGN.md: 20px, `radius-xs`, the recess, label role, a 12px glyph);
   * pressed, it opens the task's pane.
   */
  // Page-local Solar glyph the proposal adds (not in $lib/icons.ts yet).
  import GlyphTask from "~icons/solar/clipboard-check-bold-duotone";

  let { title, stage }: { title: string; stage: string } = $props();
</script>

<button
  aria-label="Open the task {title}, in {stage}"
  class="badge pressable touch-hit"
  data-slot="task-badge"
  type="button"
>
  <GlyphTask aria-hidden="true" />
  <span>{stage}</span>
</button>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex: none;
    block-size: 20px;
    padding-inline: 6px;
    border: 0;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-label);
    font-weight: var(--weight-body);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
      color: var(--ink-muted);
    }
    &:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .badge:hover {
      background: var(--surface-fill);
    }
  }
</style>
