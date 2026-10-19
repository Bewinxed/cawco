<script lang="ts">
  /**
   * PROPOSED: the board card in three steps (taskpane advisor §2). The
   * title leads in body size at the strong weight; under it one state line
   * in the label role, led by a 16px mark or the session's 18px tree mark,
   * absent when there is nothing to say (The Idle Has No Fill Rule: the
   * column already says the stage); then the facts in meta: the id, the
   * to-do ring at 16px and its count, the labels as words. No badge and no
   * glyph under 16px.
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import StateLine from "./TaskStateLine.svelte";
  import { type NameOf, type PlaceOf, stateLineOf } from "./task-state-line";

  let {
    task,
    href,
    onopen,
    date = null,
    asks = false,
    open = false,
    nameOf,
    placeOf,
  }: {
    task: TaskSummary;
    href: string;
    /** Opens it in place; left out, the card is a plain link. */
    onopen?: (id: string) => void;
    /** The date its file sets it for, said short. */
    date?: string | null;
    /** Its session waits on you. */
    asks?: boolean;
    /** It is the one open in the pane beside the board. */
    open?: boolean;
    /** A session's name: the fleet's (session-name.ts) or a sheet's fixture. */
    nameOf: NameOf;
    /** Where a session works: the fleet's (session-name.ts) or a sheet's fixture. */
    placeOf: PlaceOf;
  } = $props();

  const line = $derived(stateLineOf(task, { date, asks, nameOf, placeOf }));
</script>

<a
  data-slot="task-card"
  class="task-card press-tint focus-inset"
  aria-current={open ? "true" : undefined}
  data-task={task.id}
  {href}
  onclick={(event) => {
    if (
      onopen &&
      event.button === 0 &&
      !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    ) {
      event.preventDefault();
      onopen(task.id);
    }
  }}
>
  <span data-slot="title" class="title">{task.title}</span>
  {#if line}
    <StateLine {line} />
  {/if}
  <span data-slot="facts" class="facts mark-line">
    <span data-slot="id" class="id">{task.id}</span>
    {#if task.todos.total > 0}
      <span
        class="todos mark-line"
        data-box
        title="{task.todos.done} of {task.todos.total} to-dos done"
      >
        <TaskRing done={task.todos.done} total={task.todos.total} />
        <span data-slot="num" class="num"
          >{task.todos.done}/{task.todos.total}</span
        >
      </span>
    {/if}
    {#if task.labels.length > 0}
      <span class="labels">{task.labels.slice(0, 2).join(" · ")}</span>
      {#if task.labels.length > 2}
        <span data-slot="num" class="num">+{task.labels.length - 2}</span>
      {/if}
    {/if}
  </span>
</a>

<style>
  .task-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    text-decoration: none;
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);

    &[aria-current="true"] {
      background: var(--selected-bg);
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .task-card:not([aria-current="true"]):hover {
      background: var(--surface-hover);
    }
  }
  .title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-body);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .id {
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .todos {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .labels {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
</style>
