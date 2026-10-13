<script lang="ts">
  /**
   * One stage's column: the board's own column over the view's tasks, with
   * nothing to drop. Its stage is a row of the `stages` tool, so an empty
   * stage keeps its kind.
   */
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import TaskColumn from "#lib/cawco/tasks/TaskColumn.svelte";
  import {
    kindsOf,
    rowsOf,
    type ViewStageRow,
    type ViewTaskRow,
    viewContext,
  } from "./context";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
  }: OpenUIRenderProps<{ stage: ViewStageRow | null; tasks: unknown }> =
    $props();
  const view = viewContext();
  const name = $derived(props.stage?.name ?? "");
  const rows = $derived(rowsOf<ViewTaskRow>(props.tasks));
  const cards = $derived(rows.filter((task) => task.stage === name));
</script>

<TaskColumn
  {cards}
  hrefOf={view.hrefOf}
  kind={props.stage?.kind ?? null}
  kindOf={kindsOf(rows)}
  label={stageLabel(name)}
  onopen={view.onopen}
/>
