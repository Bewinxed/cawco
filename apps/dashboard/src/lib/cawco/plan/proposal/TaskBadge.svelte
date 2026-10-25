<script lang="ts">
  /**
   * THE TASK BADGE (proposal): a to-do that became a task of its own shows
   * that task by the board's glyph and its id, then its stage (the owner's
   * pin: "glyphs for task ids"). The id reads as the board's task card
   * draws it (TaskCard.svelte `.id`: meta, mono, no ligatures). The Badge
   * recipe (DESIGN.md: 20px, `radius-xs`, the recess, label role, a 12px
   * glyph); pressed, it opens the task's pane.
   */
  import { IconTask } from "#lib/icons.js";

  let { task }: { task: { id: string; stage: string; title: string } } =
    $props();
</script>

<button
  aria-label="Open the task {task.id}, {task.title}, in {task.stage}"
  class="mark-line pressable touch-hit inline-flex h-c-badge-h flex-none items-center gap-space-1 rounded-xs bg-surface-recess px-c-plan-badge-px type-label font-normal whitespace-nowrap text-ink-strong hover:bg-surface-fill [&_svg]:size-icon-sm [&_svg]:text-ink-muted"
  data-slot="task-badge"
  type="button"
>
  <IconTask aria-hidden="true" data-box />
  <span class="type-meta font-mono text-ink-muted" data-slot="task-id"
    >{task.id}</span
  >
  <span>{task.stage}</span>
</button>
