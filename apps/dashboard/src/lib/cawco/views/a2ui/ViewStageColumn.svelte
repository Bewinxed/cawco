<script lang="ts">
  /** One stage's column: the board's own column, with nothing to drop. */
  import type { A2uiComponentProps } from "svelte-a2ui";
  import { stageLabel } from "#lib/cawco/project-tasks.js";
  import TaskColumn from "#lib/cawco/tasks/TaskColumn.svelte";
  import { viewContext } from "./context";

  let { stage }: A2uiComponentProps = $props();
  const view = viewContext();
  const name = $derived(String(stage ?? ""));
  const kind = $derived(
    view.stages.find((each) => each.name === name)?.kind ?? null
  );
  const cards = $derived(view.tasks.filter((task) => task.stage === name));
</script>

<TaskColumn
  {cards}
  hrefOf={view.hrefOf}
  {kind}
  kindOf={view.kindOf}
  label={stageLabel(name)}
  onopen={view.onopen}
/>
