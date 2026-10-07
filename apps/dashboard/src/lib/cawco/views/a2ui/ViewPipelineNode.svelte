<script lang="ts">
  /** A row per stage with its bar: the project's Pipeline view. */
  import type { A2uiComponentProps } from "svelte-a2ui";
  import ViewPipeline from "../ViewPipeline.svelte";
  import { viewContext } from "./context";

  let { stages }: A2uiComponentProps = $props();
  const view = viewContext();
  const shown = $derived(
    Array.isArray(stages)
      ? view.stages.filter((stage) => (stages as string[]).includes(stage.name))
      : view.stages
  );
</script>

<ViewPipeline stages={shown} tasks={view.tasks} />
