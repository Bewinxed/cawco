<script lang="ts">
  /**
   * TODAY (main): the tasks under Caw's reply as ThreadPane's `taskCards`
   * draws them: the head line in meta, each task the real TaskCard (title
   * over id, `titleFirst`) in the grid of 14rem cards, and "Open the board"
   * as the kit's outline small button under them.
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import TaskCard from "#lib/cawco/tasks/TaskCard.svelte";
  import { Button } from "#lib/components/ui/button/index.js";

  let { tasks }: { tasks: TaskSummary[] } = $props();
</script>

<div class="min-w-0 pt-(--space-3)">
  <p class="m-0 mb-(--space-2) text-[var(--ink-muted)] text-meta">
    Filed {tasks.length} tasks · Backlog
  </p>
  <ul
    class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-x-(--space-2) p-0"
  >
    {#each tasks as task (task.id)}
      <li class="mb-(--space-2) min-w-0">
        <TaskCard
          href="?task={task.id}"
          kindOf={() => "todo"}
          movable={false}
          onopen={() => undefined}
          {task}
          titleFirst
        />
      </li>
    {/each}
  </ul>
  <div class="mt-(--space-3)">
    <Button class="pressable" label="Open the board" size="sm" variant="outline" />
  </div>
</div>
