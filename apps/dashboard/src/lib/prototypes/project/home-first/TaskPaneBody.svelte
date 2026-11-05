<script lang="ts">
  /**
   * A task, opened (TOM task 3), as a plain stand-in: its insides are
   * being designed on their own, so this says it is the task and holds its
   * size. The pane's head carries the task's title and the Close that puts
   * the person back where they were.
   */
  import { homeFirstWords as words } from "@cawco/core/words/proto-home-first";
  import { IconTaskList } from "#lib/icons.js";

  let { title }: { title: string } = $props();
</script>

<!-- mark-line: the glyph stands over the words, not beside them. -->
<div
  class="flex flex-1 flex-col items-start justify-center gap-space-2 rounded-lg border border-dashed border-border-control p-space-6"
  data-task={title}
>
  <IconTaskList aria-hidden="true" class="size-icon-lg text-ink-muted" />
  <p class="m-0 type-label text-ink-strong">{words.taskPane.standIn}</p>
  <p class="m-0 max-w-c-measure type-body text-ink-muted text-pretty">
    {words.taskPane.standInLine}
  </p>
</div>
