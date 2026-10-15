<script lang="ts">
  /** TaskCard for a mockup: the board's own TaskCard over a made-up task; inert, not movable. */
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { type MockTaskProps, mockTask } from "./task";

  let { props }: OpenUIRenderProps<MockTaskProps> = $props();
  const nothing = (): void => undefined;
</script>

<div class="card" data-mk="TaskCard" inert>
  <TaskCard
    href="#mockup"
    kindOf={() => undefined}
    movable={false}
    onopen={nothing}
    task={mockTask(props, "", 0)}
  />
</div>

<style>
  .card {
    min-inline-size: 0;
  }
</style>
