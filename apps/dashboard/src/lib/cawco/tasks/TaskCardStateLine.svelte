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
  class="press-tint focus-inset flex flex-col gap-space-2 rounded-sm bg-surface-raised p-space-3 text-ink-strong no-underline shadow-tile transition-[background-color] duration-(--dur-control) ease-out aria-current:bg-selected-bg not-aria-current:hover:bg-surface-hover"
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
  <span
    data-slot="title"
    class="line-clamp-2 type-body font-medium wrap-anywhere text-pretty text-ink-strong"
    >{task.title}</span
  >
  {#if line}
    <StateLine {line} />
  {/if}
  <span
    data-slot="facts"
    class="mark-line flex flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted"
  >
    <span
      data-slot="id"
      class="font-(family-name:--font-mono) liga-none text-ink-subtle"
      >{task.id}</span
    >
    {#if task.todos.total > 0}
      <span
        class="mark-line inline-flex items-center gap-space-1"
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
      <span class="min-w-0 wrap-anywhere"
        >{task.labels.slice(0, 2).join(" · ")}</span
      >
      {#if task.labels.length > 2}
        <span data-slot="num" class="num">+{task.labels.length - 2}</span>
      {/if}
    {/if}
  </span>
</a>
