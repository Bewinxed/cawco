<script lang="ts">
  import { externalItemWords, projectWords } from "@cawco/core";
  import { land, waiting } from "#lib/cawco/motion/share.svelte.js";
  import { flagsOf, type TaskSummary } from "#lib/cawco/project-tasks.js";
  import { isRetry } from "#lib/cawco/tasks/retry.js";
  /**
   * One task on the board: its id, its title, and only what it has to say
   * past that — an attempt running or failed, what it still waits on (the
   * hub's waits, a task by its id, a card, pin or pull request by its
   * name), its to-dos.
   * A task with nothing to say is two lines (The Idle Has No Fill Rule).
   * Its footer speaks only of live state: an attempt working or trying
   * again, a wait on you, or the date it is set for. Its head says when an
   * attempt failed, or when the hub could not start one (Can't start, the
   * hub's reason as its title; the task's pane says it whole). Its foot
   * names each external item it links by the source's mark and its ref; the
   * task's pane lists them whole, each a link out.
   *
   * The card is a link to the task (`?task=tsk-12`), so it opens in a new
   * tab and is shared like one; a plain click opens it beside what it was
   * pressed in (`onopen`), or follows the link where nothing stands beside
   * it (a thread on a phone: the task's own page). It
   * is also what a drag carries, and the one object a move flies (`land`):
   * a card that changes column travels there from where it was drawn.
   */
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconError,
    IconLock,
    IconNeedsYou,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { dragTask } from "./board-dnd.svelte.js";
  import { actionsOf, asksOf, taskProject } from "./needs.svelte";
  import TodoCount from "./TodoCount.svelte";

  let {
    task,
    href,
    onopen,
    date = null,
    movable = true,
    titleFirst = false,
    inset = false,
  }: {
    /**
     * It heads a box that holds more of the task (a thread's card with its
     * review under it): the box draws the surface, so the card has no tile
     * of its own.
     */
    inset?: boolean;
    /**
     * Its title over its id: where the card stands outside its column (a
     * thread), the title says what it is and the id is its handle.
     */
    titleFirst?: boolean;
    task: TaskSummary;
    href: string;
    /** The date the task's file sets it for, said short ("Thu 09:30"). */
    date?: string | null;
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
  /** What it still waits on, its own and its whole's, as the hub settles it: a task by its id, anything else by its name. */
  const waitsOn = $derived(flags.waiting);
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
  class="press-tint focus-inset flex flex-col gap-space-1 rounded-sm bg-surface-raised px-space-3 pt-space-2 pb-space-3 text-ink-strong no-underline shadow-tile transition-[background-color,opacity] duration-(--dur-control) ease-out data-inset:rounded-none data-inset:shadow-none data-dragging:opacity-40 not-group-data-picked/task:hover:bg-surface-hover not-data-dragging:group-data-moving/task:opacity-60 group-data-picked/task:bg-selected-bg"
  data-flip-enter={flying ? "own" : undefined}
  data-inset={inset || undefined}
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
  <span
    data-task-head
    class="flex min-h-c-badge-h items-center gap-space-1 group-data-pickable/task:pe-space-6"
  >
    <span
      data-slot="id"
      class="type-meta font-(family-name:--font-mono) liga-none text-ink-subtle group-data-picked/task:text-selected-ink"
      >{task.id}</span
    >
    {#if task.problem}
      <span
        class="inline-flex text-ink-muted group-data-picked/task:text-selected-ink"
        title={task.problem}
      >
        <IconWarningTriangle aria-hidden="true" class="size-icon-sm" />
        <span class="sr-only">{task.problem}</span>
      </span>
    {/if}
    {#if flags.startProblem && !flags.live}
      <!-- Why the hub could not start it, newer than any failure before. -->
      <Badge
        class="ml-auto"
        data-start-problem
        title={flags.startProblem}
        variant="fail"
      >
        <IconWarningTriangle aria-hidden="true" />
        <span>{projectWords.cantStart}</span>
        <span class="sr-only">{flags.startProblem}</span>
      </Badge>
    {:else if flags.failed && !flags.live}
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
      class="mark-line inline-flex items-center gap-space-2 type-meta text-ink-muted group-data-picked/task:text-selected-ink"
    >
      {#if asks || approves}
        <!-- Waiting on you outranks working: the attempt is stopped on you. -->
        <IconNeedsYou
          aria-hidden="true"
          class="size-icon-sm flex-none text-status-attn-glyph"
        />
        <span>{asks ? "its session asks you" : "an action waits on you"}</span>
      {:else if flags.live}
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
  {#if task.todos.total > 0 || waitsOn.length > 0 || task.labels.length > 0 || task.links.length > 0}
    <span
      data-slot="foot"
      class="mt-space-1 flex flex-wrap items-center gap-x-space-2 gap-y-space-1 type-meta text-ink-muted group-data-picked/task:text-selected-ink"
    >
      {#if task.todos.total > 0}
        <TodoCount
          title="{task.todos.done} of {task.todos.total} to-dos done"
          todos={task.todos}
        />
      {/if}
      {#if waitsOn.length > 0}
        <span
          class="mark-line inline-flex min-w-0 items-center gap-space-1"
          title={waitsOn
            .map((wait) =>
              wait.flag ? `Blocked: ${wait.label} ${wait.flag}` : wait.label
            )
            .join(", ")}
        >
          <IconLock aria-hidden="true" class="size-icon-sm flex-none" />
          <span class="flex-none"
            >{waitsOn[0]?.flag ? "blocked" : "waits on"}</span
          >
          {#if waitsOn[0]?.kind === "task"}
            <span
              class="font-(family-name:--font-mono) liga-none text-ink-strong"
              >{waitsOn[0].target}</span
            >
          {:else}
            <span
              class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-ink-strong"
              >{waitsOn[0]?.label}</span
            >
          {/if}
          {#if waitsOn.length > 1}
            <span data-slot="num" class="num">+{waitsOn.length - 1}</span>
          {/if}
        </span>
      {/if}
      {#each task.links as link (link.url)}
        <!-- A link's mark and ref: the card is a link itself, so the pane's row is the link out. -->
        <span
          data-slot="link"
          class="mark-line inline-flex items-center gap-space-1"
          title="{externalItemWords.source[link.source]} {externalItemWords
            .kind[link.kind]} {link.ref}"
        >
          <ProviderLogo provider={link.source} size="meta" />
          <span class="font-(family-name:--font-mono) liga-none text-ink-strong"
            >{link.ref}</span
          >
        </span>
      {/each}
      {#each task.labels.slice(0, 2) as label (label)}
        <!-- A tag longer than the card ends in its ellipsis inside the
             badge (DESIGN.md, The Truncate Inside Rule), never past the
             card's edge; the task's own page lists it whole. Its line is
             the badge's height, so the clip the ellipsis needs leaves the
             descenders whole. -->
        <Badge class="max-w-full" title={label} variant="secondary"
          ><span
            class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap leading-icon-lg"
            >{label}</span
          ></Badge
        >
      {/each}
      {#if task.labels.length > 2}
        <Badge data-num figures="tabular" variant="secondary"
          ><span>+{task.labels.length - 2}</span></Badge
        >
      {/if}
    </span>
  {/if}
</a>
