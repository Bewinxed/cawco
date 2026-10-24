<script lang="ts">
  /**
   * One task on the board, in three steps (the owner's pins on the card:
   * "you aren't using the ui to tell a story here", "a better way to
   * indicate status without overwhelming the layout"). The title leads in
   * body size at the strong weight; under it one state line in the label
   * role (task-state-line.ts: its session working, asking you, failed, why
   * the hub could not start it, what it waits on, its date), absent when
   * there is nothing to say, since its column already says its stage (The
   * Idle Has No Fill Rule); then its facts in meta: the id, the to-do ring
   * and its count, the labels as words. No badge, and no glyph under 16px.
   *
   * The card is a link to the task (`?task=tsk-12`), so it opens in a new
   * tab and is shared like one; a plain click opens it beside what it was
   * pressed in (`onopen`), or follows the link where nothing stands beside
   * it (a thread on a phone: the task's own page). It is also what a drag
   * carries, and the one object a move flies (`land`): a card that changes
   * column travels there from where it was drawn.
   */
  import { commonWords } from "@cawco/core";
  import { land, waiting } from "#lib/cawco/motion/share.svelte.js";
  import type { StageKind, TaskSummary } from "#lib/cawco/project-tasks.js";
  import {
    sessionPlace,
    sessionTitle,
  } from "#lib/cawco/session-names.svelte.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { dragTask } from "./board-dnd.svelte.js";
  import { actionsOf, asksOf, taskProject } from "./needs.svelte";
  import TaskStateLine from "./TaskStateLine.svelte";
  import { stateLineOf } from "./task-state-line";

  let {
    task,
    href,
    kindOf,
    onopen,
    date = null,
    movable = true,
  }: {
    task: TaskSummary;
    href: string;
    /** The date the task's file sets it for, said short ("Thu 09:30"). */
    date?: string | null;
    /** The kind of another task's stage, to say whether what it waits on has landed. */
    kindOf: (id: string) => StageKind | null | undefined;
    /** Opens it in place; left out, the card is a plain link. */
    onopen?: (id: string) => void;
    /**
     * A drag carries it to another column (the board). Off where a drag is
     * the surface's own (the canvas pans).
     */
    movable?: boolean;
  } = $props();

  /** The project the card stands in: an action names its task within it. */
  const project = taskProject();
  /** Its session asks you, or an action filed for it waits on you. */
  const asks = $derived.by(() => {
    if (asksOf(task).length > 0) {
      return "session" as const;
    }
    return project && actionsOf(project(), task.id).length > 0
      ? ("action" as const)
      : null;
  });
  const line = $derived(
    stateLineOf(task, {
      asks,
      date,
      kindOf,
      nameOf: (id) => sessionTitle(id) ?? commonWords.itsSession,
      placeOf: sessionPlace,
    })
  );
  /** The line's words whole, for a hover: it clips what it adds. */
  const lineTitle = $derived.by(() => {
    if (line?.kind === "cant") {
      return task.startProblem ?? undefined;
    }
    return line?.kind === "problem" ? (task.problem ?? undefined) : undefined;
  });
  const key = $derived(`task:${task.id}`);
  /** A card arriving by a move flies in; it is not uncovered as a new row. */
  const flying = $derived(waiting(key));

  function open(event: MouseEvent) {
    if (
      !onopen ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onopen(task.id);
  }
</script>

<a
  data-task-card
  class="press-tint focus-inset flex min-w-0 flex-col gap-space-2 rounded-sm bg-surface-raised p-space-3 text-ink-strong no-underline shadow-tile transition-[background-color,opacity] duration-(--dur-control) ease-out data-dragging:opacity-40 not-group-data-picked/task:hover:bg-surface-hover not-data-dragging:group-data-moving/task:opacity-60 group-data-picked/task:bg-selected-bg"
  data-flip-enter={flying ? "own" : undefined}
  data-share={key}
  data-task={task.id}
  {href}
  onclick={open}
  {@attach movable
    ? dragTask(() => ({ taskId: task.id, from: task.stage }))
    : undefined}
  {@attach land(() => key, { uniform: true })}
>
  <span
    data-slot="title"
    class="line-clamp-2 type-body font-medium wrap-anywhere text-pretty text-ink-strong group-data-pickable/task:pe-space-6"
    >{task.title}</span
  >
  {#if line}
    <TaskStateLine {line} title={lineTitle} />
  {/if}
  <span
    data-slot="facts"
    class="mark-line flex min-w-0 flex-wrap items-center gap-x-space-3 gap-y-space-1 type-meta text-ink-muted"
  >
    <span
      data-slot="id"
      class="font-(family-name:--font-mono) liga-none text-ink-subtle"
      >{task.id}</span
    >
    {#if task.todos.total > 0}
      <span
        data-slot="todos"
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
      <span data-slot="labels" class="min-w-0 wrap-anywhere"
        >{task.labels.slice(0, 2).join(" · ")}</span
      >
      {#if task.labels.length > 2}
        <span data-slot="num" class="num">+{task.labels.length - 2}</span>
      {/if}
    {/if}
  </span>
</a>
