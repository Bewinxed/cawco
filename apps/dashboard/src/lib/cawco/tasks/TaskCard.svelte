<script lang="ts">
  /**
   * One task on the board: its id, its title, and only what it has to say
   * past that — an attempt running or failed, what it waits on, its to-dos.
   * A task with nothing to say is two lines (The Idle Has No Fill Rule).
   * Its footer speaks only of live state: an attempt working or trying
   * again, a wait on you, or the date it is set for.
   *
   * The card is a link to the task (`?task=tsk-12`), so it opens in a new
   * tab and is shared like one; a plain click opens it beside what it was
   * pressed in (`onopen`), or follows the link where nothing stands beside
   * it (a thread on a phone: the task's own page). It
   * is also what a drag carries, and the one object a move flies (`land`):
   * a card that changes column travels there from where it was drawn.
   */
  import { land, waiting } from "#lib/cawco/motion/share.svelte.js";
  import {
    flagsOf,
    isRetry,
    type StageKind,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import {
    IconError,
    IconLock,
    IconNeedsYou,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { dragTask } from "./board-dnd.svelte.js";
  import { actionsOf, asksOf, taskProject } from "./needs.svelte";

  let {
    task,
    href,
    kindOf,
    onopen,
    date = null,
    movable = true,
    titleFirst = false,
  }: {
    /**
     * Its title over its id: where the card stands outside its column (a
     * thread), the title says what it is and the id is its handle.
     */
    titleFirst?: boolean;
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

  const flags = $derived(flagsOf(task));
  /** The project the card stands in: an action names its task within it. */
  const project = taskProject();
  /** Its session asks you, or an action filed for it waits on you. */
  const asks = $derived(asksOf(task).length > 0);
  const approves = $derived(
    project ? actionsOf(project(), task.id).length > 0 : false
  );
  const retry = $derived(isRetry(task));
  /**
   * What it waits on that has not landed: the hub's word when it gives one,
   * else its `after` edges whose task is not in a done stage.
   */
  const waitsOn = $derived(
    task.blockedBy ??
      task.after.filter((id) => {
        const kind = kindOf(id);
        return kind !== "done" && kind !== "dropped";
      })
  );
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
  data-slot="task-card"
  class="press-tint focus-inset flex cursor-pointer flex-col gap-space-1 rounded-sm bg-surface-raised px-space-3 pt-space-2 pb-space-3 text-ink-strong no-underline shadow-tile transition-[background-color,opacity] dur-control ease-out data-dragging:opacity-40 hover:bg-surface-hover"
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
  {#if titleFirst}
    <span
      data-slot="title"
      class="line-clamp-2 type-label wrap-anywhere text-ink-row"
      >{task.title}</span
    >
  {/if}
  <span data-slot="head" class="flex min-h-c-badge-h items-center gap-space-1">
    <span
      data-slot="id"
      class="text-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
      >{task.id}</span
    >
    {#if task.problem}
      <span class="inline-flex text-ink-muted" title={task.problem}>
        <IconWarningTriangle aria-hidden="true" class="size-icon-sm" />
        <span class="sr-only">{task.problem}</span>
      </span>
    {/if}
    {#if flags.failed && !flags.live}
      <Badge class="ml-auto" variant="fail">
        <IconError aria-hidden="true" />
        <span>Failed</span>
      </Badge>
    {/if}
  </span>
  {#if !titleFirst}
    <span
      data-slot="title"
      class="line-clamp-2 type-label wrap-anywhere text-ink-row"
      >{task.title}</span
    >
  {/if}
  {#if flags.live || task.kind === "you" || asks || approves || date}
    <span
      class="mark-line inline-flex items-center gap-space-2 type-meta text-ink-muted"
    >
      {#if asks || approves}
        <!-- Waiting on you outranks working: the attempt is stopped on you. -->
        <IconNeedsYou
          aria-hidden="true"
          class="size-icon-sm flex-none text-status-attn-glyph"
        />
        <span>{asks ? "its session asks you" : "an action waits on you"}</span>
      {:else if flags.live}
        <!-- literal: 6px -->
        <span
          data-task-card-live
          data-slot="dot"
          aria-hidden="true"
          class="size-(--dot) flex-none rounded-pill bg-status-live-glyph"
          data-box
          style:--dot="6px"
        ></span>
        {#if retry}
          <span>retrying · attempt {task.attempts.length}</span>
        {:else}
          <span>{task.type ?? "attempt"} working</span>
        {/if}
      {:else if task.kind === "you"}
        <!-- The design's ◆: the house's needs-you glyph, still. -->
        <IconNeedsYou
          aria-hidden="true"
          class="size-icon-sm flex-none text-status-attn-glyph"
        />
        <span>waiting on you</span>
      {:else if date}
        <span
          data-when
          data-slot="num"
          class="num font-(family-name:--font-mono) liga-none">{date}</span
        >
      {/if}
    </span>
  {/if}
  {#if task.todos.total > 0 || waitsOn.length > 0 || task.labels.length > 0}
    <span
      data-slot="foot"
      class="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted"
    >
      {#if task.todos.total > 0}
        <span
          class="mark-line inline-flex items-center gap-space-1"
          title="{task.todos.done} of {task.todos.total} to-dos done"
        >
          <TaskRing done={task.todos.done} size="sm" total={task.todos.total} />
          <span data-slot="num" class="num"
            >{task.todos.done}/{task.todos.total}</span
          >
        </span>
      {/if}
      {#if waitsOn.length > 0}
        <span class="mark-line inline-flex items-center gap-space-1">
          <IconLock aria-hidden="true" class="size-icon-sm" />
          <span>after</span>
          <span class="font-(family-name:--font-mono) liga-none text-ink-strong"
            >{waitsOn[0]}</span
          >
          {#if waitsOn.length > 1}
            <span data-slot="num" class="num">+{waitsOn.length - 1}</span>
          {/if}
        </span>
      {/if}
      {#each task.labels.slice(0, 2) as label (label)}
        <Badge variant="secondary"><span>{label}</span></Badge>
      {/each}
      {#if task.labels.length > 2}
        <Badge data-num class="num" variant="secondary"
          ><span>+{task.labels.length - 2}</span></Badge
        >
      {/if}
    </span>
  {/if}
</a>

<style>
  /* residual: keyframes — the live dot's pulse. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="dot"] {
      animation: pulse var(--breath) var(--ease-in-out) infinite;
    }
  }
</style>
