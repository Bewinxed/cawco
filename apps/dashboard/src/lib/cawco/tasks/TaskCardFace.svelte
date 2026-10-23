<script lang="ts">
  /**
   * A task card's face (TaskCard draws it on the board): its id, its title,
   * and only what it has to say past that — an attempt running or failed,
   * what it waits on, its to-dos. A task with nothing to say is two lines
   * (The Idle Has No Fill Rule). Its footer speaks only of live state: an
   * attempt working or trying again, a wait on you, or the date it is set
   * for. Its head says when an attempt failed, or when the hub could not
   * start one (Can't start, the hub's reason as its title).
   *
   * Everything it says arrives as props, read by its owner from the
   * fleet's state, so the face mounts without the store; what the anchor
   * does (its press, its drag, its flight) is its owner's too, spread onto
   * the link with `rest`.
   */
  import { projectWords } from "@cawco/core/words/project";
  import type { HTMLAnchorAttributes } from "svelte/elements";
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconError,
    IconLock,
    IconNeedsYou,
    IconWarningTriangle,
  } from "#lib/icons.js";

  let {
    task,
    href,
    titleFirst = false,
    live,
    failed,
    startProblem,
    retry,
    asks,
    approves,
    waitsOn,
    date = null,
    ...rest
  }: Omit<HTMLAnchorAttributes, "href"> & {
    task: TaskSummary;
    href: string;
    /** Its title over its id (a thread): the title says what it is and the id is its handle. */
    titleFirst?: boolean;
    /** An attempt at it is starting or running. */
    live: boolean;
    /** Its newest attempt failed. */
    failed: boolean;
    /** Why the hub could not start it, newer than any failure before; null when it could. */
    startProblem: string | null;
    /** The running attempt is a try again. */
    retry: boolean;
    /** Its session asks you. */
    asks: boolean;
    /** An action filed for it waits on you. */
    approves: boolean;
    /** What it waits on that has not landed. */
    waitsOn: string[];
    /** The date the task's file sets it for, said short ("Thu 09:30"). */
    date?: string | null;
  } = $props();
</script>

<a
  data-task-card
  class="press-tint focus-inset flex flex-col gap-space-1 rounded-sm bg-surface-raised px-space-3 pt-space-2 pb-space-3 text-ink-strong no-underline shadow-tile transition-[background-color,opacity] duration-(--dur-control) ease-out data-dragging:opacity-40 not-group-data-picked/task:hover:bg-surface-hover not-data-dragging:group-data-moving/task:opacity-60 group-data-picked/task:bg-selected-bg"
  data-task={task.id}
  {href}
  {...rest}
>
  {#if titleFirst}
    <span
      data-slot="title"
      class="line-clamp-2 type-label wrap-anywhere text-ink-row"
      >{task.title}</span
    >
  {/if}
  <span
    data-task-head
    class="flex min-h-c-badge-h items-center gap-space-1 group-data-pickable/task:pe-space-6"
  >
    <span
      data-slot="id"
      class="type-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
      >{task.id}</span
    >
    {#if task.problem}
      <span class="inline-flex text-ink-muted" title={task.problem}>
        <IconWarningTriangle aria-hidden="true" class="size-icon-sm" />
        <span class="sr-only">{task.problem}</span>
      </span>
    {/if}
    {#if startProblem && !live}
      <!-- Why the hub could not start it, newer than any failure before. -->
      <Badge
        class="ml-auto"
        data-start-problem
        title={startProblem}
        variant="fail"
      >
        <IconWarningTriangle aria-hidden="true" />
        <span>{projectWords.cantStart}</span>
        <span class="sr-only">{startProblem}</span>
      </Badge>
    {:else if failed && !live}
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
  {#if live || task.kind === "you" || asks || approves || date}
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
      {:else if live}
        <LiveDot data-slot="dot" data-task-card-live size="row" />
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
        <span data-when data-slot="num" class="num">{date}</span>
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
        <Badge data-num figures="tabular" variant="secondary"
          ><span>+{task.labels.length - 2}</span></Badge
        >
      {/if}
    </span>
  {/if}
</a>
