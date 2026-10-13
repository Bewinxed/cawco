<script lang="ts">
  /** A row per stage with its bar: the project's Pipeline view, over the view's Queries. */
  import ViewPipeline from "../ViewPipeline.svelte";
  import { rowsOf, type ViewStageRow, type ViewTaskRow } from "./context";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ stages: unknown; tasks: unknown }> =
    $props();
</script>

<ViewPipeline
  stages={rowsOf<ViewStageRow>(props.stages)}
  tasks={rowsOf<ViewTaskRow>(props.tasks)}
/>
