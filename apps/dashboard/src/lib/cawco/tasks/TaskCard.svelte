<script lang="ts">
  /**
   * One task on the board: its id, its title, and only what it has to say
   * past that — an attempt running or failed, what it waits on, its to-dos.
   * A task with nothing to say is two lines (The Idle Has No Fill Rule).
   *
   * The card is a link to the task (`?task=tsk-12`), so it opens in a new
   * tab and is shared like one; a plain click opens the drawer in place. It
   * is also what a drag carries, and the one object a move flies (`land`):
   * a card that changes column travels there from where it was drawn.
   */
  import { land, waiting } from "#lib/cawco/motion/share.svelte.js";
  import {
    flagsOf,
    type StageKind,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import {
    IconError,
    IconLock,
    IconWarningTriangle,
    IconWorking,
  } from "#lib/icons.js";
  import { dragTask } from "./board-dnd.svelte.js";

  let {
    task,
    href,
    kindOf,
    onopen,
  }: {
    task: TaskSummary;
    href: string;
    /** The kind of another task's stage, to say whether what it waits on has landed. */
    kindOf: (id: string) => StageKind | null | undefined;
    onopen: (id: string) => void;
  } = $props();

  const flags = $derived(flagsOf(task));
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
  class="task-card press-tint focus-inset"
  data-flip-enter={flying ? "own" : undefined}
  data-share={key}
  data-task={task.id}
  {href}
  onclick={open}
  {@attach dragTask(() => ({ taskId: task.id, from: task.stage }))}
  {@attach land(() => key, { uniform: true })}
>
  <span class="head">
    <span class="id">{task.id}</span>
    {#if task.problem}
      <span class="problem" title={task.problem}>
        <IconWarningTriangle aria-hidden="true" />
        <span class="sr-only">{task.problem}</span>
      </span>
    {/if}
    {#if flags.live}
      <Badge class="ml-auto" variant="live">
        <IconWorking aria-hidden="true" />
        Working
      </Badge>
    {:else if flags.failed}
      <Badge class="ml-auto" variant="fail">
        <IconError aria-hidden="true" />
        Failed
      </Badge>
    {/if}
  </span>
  <span class="title">{task.title}</span>
  {#if task.todos.total > 0 || waitsOn.length > 0 || task.labels.length > 0}
    <span class="foot">
      {#if task.todos.total > 0}
        <span
          class="todos"
          title="{task.todos.done} of {task.todos.total} to-dos done"
        >
          <TaskRing done={task.todos.done} size="sm" total={task.todos.total} />
          <span class="num">{task.todos.done}/{task.todos.total}</span>
        </span>
      {/if}
      {#if waitsOn.length > 0}
        <span class="after">
          <IconLock aria-hidden="true" />
          <span>after</span>
          <span class="ref">{waitsOn[0]}</span>
          {#if waitsOn.length > 1}
            <span class="num">+{waitsOn.length - 1}</span>
          {/if}
        </span>
      {/if}
      {#each task.labels.slice(0, 2) as label (label)}
        <Badge variant="secondary">{label}</Badge>
      {/each}
      {#if task.labels.length > 2}
        <Badge class="num" variant="secondary">+{task.labels.length - 2}</Badge>
      {/if}
    </span>
  {/if}
</a>

<style>
  .task-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      opacity var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .task-card:hover {
      background: var(--surface-hover);
    }
  }
  /* The card in the air: its place stays drawn, faint, until it lands. */
  .task-card:global([data-dragging]) {
    opacity: 0.4;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-block-size: var(--c-badge-h);
  }
  .id {
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .problem {
    display: inline-flex;
    color: var(--ink-muted);
  }
  .problem :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .title {
    display: -webkit-box;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    font: var(--type-label);
    color: var(--ink-row);
    overflow-wrap: anywhere;
  }
  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    margin-block-start: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .todos,
  .after {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
  .after :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
  .ref {
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-strong);
  }
</style>
