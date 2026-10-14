<script lang="ts">
  /**
   * What a task needs from you, under its card in a Caw thread: the task's
   * file read, then the one needs-you block the task view draws (TaskNeeds),
   * collapsed to the deliverable's first lines with Show all. It is read
   * again whenever the list says the task changed, so a decision made here,
   * on the board or by Caw shows everywhere.
   */
  import {
    readTask,
    type StagesView,
    type TaskSummary,
    type TaskView,
  } from "../project-tasks";
  import TaskNeeds from "./TaskNeeds.svelte";

  let {
    projectId,
    summary,
    stages,
    tasks,
    onmove,
    onchanged,
    onopen,
  }: {
    projectId: string;
    /** The task's row in the list: its id, and when it last changed. */
    summary: TaskSummary;
    stages: StagesView;
    tasks: TaskSummary[];
    onmove: (taskId: string, stage: string) => Promise<TaskView>;
    onchanged: (task: TaskView) => void;
    onopen: (id: string) => void;
  } = $props();

  let task = $state<TaskView | null>(null);
  let version = $state(0);

  $effect(() => {
    const { id, updatedAt, stage } = summary;
    if (
      task?.id === id &&
      task.updatedAt >= updatedAt &&
      task.stage === stage
    ) {
      return;
    }
    let gone = false;
    readTask(projectId, id)
      .then((fresh) => {
        if (!gone) {
          task = fresh;
          version += 1;
        }
      })
      .catch(() => {
        // The card above still says where it stands; the next change reads again.
      });
    return () => {
      gone = true;
    };
  });

  function took(next: TaskView) {
    task = next;
    version += 1;
    onchanged(next);
  }
</script>

{#if task}
  <TaskNeeds
    collapsed
    onchanged={took}
    onmove={async (stage) => {
      const moved = await onmove(summary.id, stage);
      took(moved);
      return moved;
    }}
    {onopen}
    {projectId}
    {stages}
    {task}
    {tasks}
    {version}
  />
{/if}
