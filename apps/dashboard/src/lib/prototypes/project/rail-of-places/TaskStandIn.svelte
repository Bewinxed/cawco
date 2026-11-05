<script lang="ts">
  /**
   * The task pane's insides, which are designed apart (the brief: "draw a
   * plain stand-in of the right size that says it is the task, and the way
   * back"): its id, title and stage, and a well the size of what will stand
   * there, saying so. The pane's own Close is the way back.
   */
  import { railOfPlacesWords as w } from "@cawco/core/words/rail-of-places";
  import { IconTaskList } from "#lib/icons.js";
  import type { Project, Task } from "./model";

  let { task, project }: { task: Task; project: Project } = $props();

  const stage = $derived(
    project.stages.find((one) => one.key === task.stage)?.name ?? task.stage
  );
</script>

<div class="flex min-h-full flex-col gap-space-group">
  <p class="mark-line flex items-center gap-space-2 type-meta text-ink-muted">
    <span class="num">{task.id}</span><span aria-hidden="true">·</span><span
      >{w.inStage(stage)}</span
    >
  </p>
  <!-- mark-line: the glyph stands over the words, not beside them -->
  <div
    class="flex min-h-c-caw-panel-h flex-1 flex-col items-start justify-center gap-space-2 rounded-lg border border-dashed border-border-control bg-surface-recess p-space-6"
  >
    <IconTaskList class="size-icon-lg text-ink-muted" aria-hidden="true" />
    <p class="type-label text-ink-strong">{w.taskStandIn}</p>
    <p class="max-w-c-measure-short type-body text-ink-muted">
      {w.taskStandInWhy}
    </p>
  </div>
</div>
