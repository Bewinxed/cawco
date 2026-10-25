<!--
  tsk-16's card as the board draws it: the real TaskCard.svelte on this
  branch, fed the index row the hub keeps (tsk16.js SUMMARY) with the to-do
  counts the state names. A press opens nothing here.
-->
<script lang="ts">
  import TaskCard from "../../../apps/dashboard/src/lib/cawco/tasks/TaskCard.svelte";
  import { SUMMARY } from "./tsk16.js";

  let {
    todos,
  }: { todos: { done: number; total: number; offered?: number } } = $props();

  const task = $derived({ ...SUMMARY, todos } as never);
</script>

<div class="card-column" data-slot="column">
  <TaskCard
    href="?task=tsk-16"
    kindOf={() => null}
    movable={false}
    onopen={() => undefined}
    {task}
  />
</div>
