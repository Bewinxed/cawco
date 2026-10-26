<script lang="ts">
  /** A task's to-dos: its ring, and how many of them are done. */
  import TaskRing from "#lib/cawco/TaskRing.svelte";

  let {
    todos,
    title,
  }: { todos: { done: number; total: number }; title?: string } = $props();
</script>

<span class="mark-line inline-flex items-center gap-space-1" {title}>
  <TaskRing done={todos.done} size="sm" total={todos.total} />
  <span data-slot="num" class="num">{todos.done}/{todos.total}</span>
</span>
