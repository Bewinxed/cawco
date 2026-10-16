<script lang="ts">
  /**
   * What a task needs from you, under its card in a Caw thread: the task's
   * file read, then its review compact (TaskReview: the session and its
   * words, what it presented and attached, which opens the task beside the
   * conversation, and the decision) when it waits on your review, and the other reasons it
   * waits on you (TaskNeeds). It is read again whenever the list says the
   * task changed, or one of its attempts handed in a result, so a decision
   * made here, on the board or by Caw shows everywhere.
   */
  import {
    readTask,
    type StagesView,
    type TaskSummary,
    type TaskView,
  } from "../project-tasks";
  import { resultStamp } from "./review-stamp";
  import TaskNeeds from "./TaskNeeds.svelte";
  import TaskReview from "./TaskReview.svelte";

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
    /** The task's row in the list: its id, when it last changed, its attempts. */
    summary: TaskSummary;
    stages: StagesView;
    tasks: TaskSummary[];
    onmove: (taskId: string, stage: string) => Promise<TaskView>;
    onchanged: (task: TaskView) => void;
    onopen: (id: string) => void;
  } = $props();

  let task = $state<TaskView | null>(null);

  $effect(() => {
    const { id, updatedAt, stage } = summary;
    const stamp = resultStamp(summary);
    if (
      task?.id === id &&
      task.updatedAt >= updatedAt &&
      task.stage === stage &&
      resultStamp(task) === stamp
    ) {
      return;
    }
    let gone = false;
    readTask(projectId, id)
      .then((fresh) => {
        if (!gone) {
          task = fresh;
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
    onchanged(next);
  }
</script>

{#if task}
  <div class="needs-for">
    {#if task.kind === "you"}
      <TaskReview
        compact
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
      />
    {/if}
    <TaskNeeds onchanged={took} {onopen} {projectId} {task} {tasks} />
  </div>
{/if}

<style>
  .needs-for {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
