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

<ul aria-label="Made" class="made">
  {#each made as task (task.id)}
    <li class="tile" data-open={task.id === open || undefined}>
      <a
        class="head press-tint focus-inset"
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
        <span class="id">{task.id}</span>
        <span class="title">{task.title}</span>
        <span class="stage mark-line" class:you={task.kind === "you"}>
          {#if task.kind === "you"}
            <IconNeedsYou class="glyph" />
          {/if}
          <span>{stageLabel(task.stage)}</span>
        </span>
      </a>
      <div class="outputs">
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

<style>
  .made {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr));
    align-items: start;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .tile[data-open] {
    box-shadow: inset 0 0 0 1px var(--border-control);
  }
  .head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    color: inherit;
    text-decoration: none;
  }
  @media (hover: hover) and (pointer: fine) {
    .head:hover {
      background: var(--surface-hover);
    }
  }
  .id {
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-muted);
  }
  .title {
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .stage.you {
    color: var(--status-attn-ink);
  }
  .stage :global(.glyph) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--status-attn-glyph);
  }
  .outputs {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
