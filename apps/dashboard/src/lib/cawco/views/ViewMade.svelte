<script lang="ts">
  /**
   * What the project's tasks made: each task with outputs, most recently
   * changed first, as a tile headed by the task (its id, title and stage,
   * a link that opens it beside the view) over its outputs drawn small by
   * kind (TaskOutput `compact`: a post's first words, a draft's first lines,
   * an image's thumbnail). One press opens the task, where each is drawn
   * whole.
   */
  import { IconNeedsYou } from "#lib/icons.js";
  import { stageLabel, type TaskSummary } from "../project-tasks";
  import TaskOutput from "../tasks/TaskOutput.svelte";

  let {
    projectId,
    tasks,
    open,
    hrefOf,
    onopen,
  }: {
    projectId: string;
    tasks: TaskSummary[];
    /** The task open beside the view: its tile is marked. */
    open: string | null;
    hrefOf: (id: string) => string;
    onopen: (id: string) => void;
  } = $props();

  const made = $derived(
    tasks
      .filter((task) => task.outputs.length > 0)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  );
</script>

<!-- literal: repeat(auto-fill, minmax(18rem, 1fr)) -->
<ul
  aria-label="Made"
  class="m-0 grid list-none grid-cols-(--made-cols) items-start gap-space-3 p-0"
  style:--made-cols="repeat(auto-fill, minmax(18rem, 1fr))"
>
  {#each made as task (task.id)}
    <!-- literal: inset 0 0 0 1px var(--border-hairline); inset 0 0 0 1px var(--border-control) -->
    <li
      data-slot="tile"
      class="flex min-w-0 flex-col gap-space-2 rounded-lg bg-surface-band p-space-2 shadow-(--tile-ring) data-open:shadow-(--tile-ring-open)"
      data-open={task.id === open || undefined}
      style:--tile-ring="inset 0 0 0 1px var(--border-hairline)"
      style:--tile-ring-open="inset 0 0 0 1px var(--border-control)"
    >
      <!-- literal: auto minmax(0, 1fr) auto -->
      <a
        data-slot="head"
        class="press-tint focus-inset grid min-h-c-btn-h-sm grid-cols-(--head-cols) items-center gap-space-2 rounded-sm px-space-2 text-inherit no-underline hover:bg-surface-hover"
        style:--head-cols="auto minmax(0, 1fr) auto"
        href={hrefOf(task.id)}
        onclick={(event) => {
          if (
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.button !== 0
          ) {
            return;
          }
          event.preventDefault();
          onopen(task.id);
        }}
      >
        <span
          data-slot="id"
          class="text-meta font-mono liga-none text-ink-muted">{task.id}</span
        >
        <span data-slot="title" class="type-label truncate text-ink-strong"
          >{task.title}</span
        >
        <span
          data-you={task.kind === "you" || undefined}
          data-is-you={task.kind === "you" || undefined}
          data-slot="stage"
          class="mark-line type-meta inline-flex items-center gap-space-1 text-ink-muted data-is-you:text-status-attn-ink"
        >
          {#if task.kind === "you"}
            <IconNeedsYou
              data-view-made-glyph
              class="size-icon-sm text-status-attn-glyph"
            />
          {/if}
          <span>{stageLabel(task.stage)}</span>
        </span>
      </a>
      <div class="flex flex-col gap-space-2">
        {#each task.outputs as path (path)}
          <TaskOutput
            compact
            {path}
            {projectId}
            taskId={task.id}
            version={task.updatedAt}
          />
        {/each}
      </div>
    </li>
  {/each}
</ul>
