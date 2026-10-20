<script lang="ts">
  /**
   * PROPOSED: the Pipeline as the run order (taskpane advisor §3): what
   * runs now, what comes next and what it waits on. One row per task: its
   * mark (the session's tree mark while a session is on it, else its
   * stage's glyph in the same 18px slot), its id, its title, its state line,
   * its to-dos. A task that waits on others stands under the first one
   * still open, indented, "+1" for the rest. Done tasks fold behind "N
   * done". No bars and no counts: the board's column heads already count.
   */
  import type { TaskSummary } from "#lib/cawco/project-tasks.js";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import {
    IconChevronDown,
    IconDot,
    IconNeedsYou,
    IconSuccess,
  } from "#lib/icons.js";
  import IconFailed from "~icons/solar/danger-circle-bold";
  import StateLine from "../tasks/TaskStateLine.svelte";
  import {
    type NameOf,
    type PlaceOf,
    stateLineOf,
  } from "../tasks/task-state-line";

  let {
    tasks,
    dateOf,
    hrefOf,
    onopen,
    nameOf,
    placeOf,
  }: {
    tasks: TaskSummary[];
    hrefOf: (id: string) => string;
    /** Opens a task beside the order. */
    onopen?: (id: string) => void;
    /** The date a task's file sets it for, said short. */
    dateOf: (id: string) => string | null;
    /** A session's name: the fleet's (session-name.ts) or a sheet's fixture. */
    nameOf: NameOf;
    /** Where a session works: the fleet's (session-name.ts) or a sheet's fixture. */
    placeOf: PlaceOf;
  } = $props();

  /** A row's lead glyph in the 18px slot: subtle; attn, fail and done in their glyph inks. */
  const GLYPH =
    "size-icon-md text-ink-subtle data-[tone=attn]:text-status-attn-glyph data-[tone=done]:text-status-done-glyph data-[tone=fail]:text-status-fail-glyph";

  let foldOpen = $state(false);

  const open = $derived(
    tasks.filter((task) => task.kind !== "done" && task.kind !== "dropped")
  );
  const done = $derived(tasks.filter((task) => task.kind === "done"));
  const openIds = $derived(new Set(open.map((task) => task.id)));
  /** The open task each waiting one stands under: the first it waits on still open. */
  const under = $derived(
    new Map(
      open.flatMap((task) => {
        const first = task.after.find((id) => openIds.has(id));
        return first ? [[task.id, first] as const] : [];
      })
    )
  );
  /** Runs now first (working, then waiting on you), then what is stuck, then what is next. */
  const RANK = (task: TaskSummary): number => {
    if (task.liveAttempt) {
      return 0;
    }
    if (task.kind === "you") {
      return 1;
    }
    if (task.lastAttemptFailed || task.startProblem) {
      return 2;
    }
    return 3;
  };
  const roots = $derived(
    open
      .filter((task) => !under.has(task.id))
      .sort((a, b) => RANK(a) - RANK(b) || a.number - b.number)
  );
  const childrenOf = (id: string): TaskSummary[] =>
    open.filter((task) => under.get(task.id) === id);

  const rows = $derived(
    roots.flatMap((task) => [
      { task, depth: 0 },
      ...childrenOf(task.id).map((child) => ({ task: child, depth: 1 })),
    ])
  );
</script>

{#snippet row(task: TaskSummary, depth: number)}
  {@const line = stateLineOf(task, {
    date: dateOf(task.id),
    nameOf,
    placeOf,
  })}
  <li>
    <a
      class="press-tint focus-inset grid min-h-c-row-h grid-cols-(--cols-wide) items-center gap-space-3 rounded-md bg-surface-raised px-space-3 py-space-1 text-ink-strong no-underline shadow-tile hover:bg-surface-hover data-[depth=1]:ms-(--nest) @max-phone/run-order:grid-cols-(--cols-narrow) @max-phone/run-order:gap-y-space-1 @max-phone/run-order:py-space-2"
      data-depth={depth}
      data-run-row={task.id}
      href={hrefOf(task.id)}
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
        class="mark-line flex min-w-0 items-center gap-space-2 @max-phone/run-order:col-start-2 @max-phone/run-order:row-start-2 @max-phone/run-order:justify-self-end"
      >
        <span
          class="inline-grid size-c-row-mark flex-none place-items-center"
          data-box
        >
          {#if line && line.kind === "session" && line.status === "fail"}
            <!-- A failure leads with the failure mark, as its state line does. -->
            <IconFailed aria-hidden="true" class={GLYPH} data-tone="fail" />
          {:else if line && line.kind === "session"}
            <SessionMark
              id={line.session}
              place={line.place}
              status={line.status}
            />
          {:else if task.kind === "you"}
            <IconNeedsYou aria-hidden="true" class={GLYPH} data-tone="attn" />
          {:else if task.kind === "done"}
            <IconSuccess aria-hidden="true" class={GLYPH} data-tone="done" />
          {:else}
            <IconDot aria-hidden="true" class={GLYPH} />
          {/if}
        </span>
        <span
          class="type-meta font-(family-name:--font-mono) liga-none text-ink-subtle"
          >{task.id}</span
        >
      </span>
      <span
        class="min-w-0 truncate type-body font-medium @max-phone/run-order:col-start-1 @max-phone/run-order:row-start-1 @max-phone/run-order:whitespace-normal @max-phone/run-order:wrap-anywhere"
        >{task.title}</span
      >
      <span
        class="flex min-w-0 @max-phone/run-order:col-start-1 @max-phone/run-order:row-start-2"
      >
        {#if line}
          <StateLine bare={line.kind === "session"} {line} />
        {:else if task.kind === "you"}
          <span class="type-label text-ink-muted">Waits on your review</span>
        {:else}
          <span class="type-label text-ink-muted">Ready</span>
        {/if}
      </span>
      <span
        class="mark-line inline-flex items-center justify-end gap-space-1 type-meta text-ink-muted @max-phone/run-order:col-start-2 @max-phone/run-order:row-start-1"
      >
        {#if task.todos.total > 0}
          <TaskRing done={task.todos.done} total={task.todos.total} />
          <span data-slot="num" class="num"
            >{task.todos.done}/{task.todos.total}</span
          >
        {/if}
      </span>
    </a>
  </li>
{/snippet}

<!-- One row: lead (mark and id), title, state, to-dos, on four columns a
     desk can hold; under 40rem, two lines. -->
<section
  aria-label="Run order"
  class="@container/run-order flex flex-col gap-space-2"
  data-run-order
  style:--cols-narrow="minmax(0, 1fr) auto"
  style:--cols-wide="7rem minmax(0, 1fr) minmax(0, 16rem) 4rem"
  style:--nest="calc(var(--c-row-mark) + var(--space-2))"
>
  <header class="flex min-h-c-btn-h-sm items-center gap-space-2">
    <h3 class="m-0 type-label text-ink-strong">Order</h3>
    {#if done.length > 0}
      <button
        aria-expanded={foldOpen}
        class="group/fold mark-line press-tint focus-inset ms-auto inline-flex min-h-c-btn-h-xs items-center gap-space-1 rounded-sm px-space-2 type-meta text-ink-muted"
        onclick={() => {
          foldOpen = !foldOpen;
        }}
        type="button"
      >
        <span data-slot="num" class="num">{done.length} done</span>
        <IconChevronDown
          aria-hidden="true"
          class="size-icon-sm transition-[rotate] duration-(--dur-control) ease-out group-aria-expanded/fold:rotate-180"
          data-box
        />
      </button>
    {/if}
  </header>
  <ol class="m-0 flex list-none flex-col gap-space-1 p-0">
    {#if foldOpen}
      {#each done as task (task.id)}
        {@render row(task, 0)}
      {/each}
    {/if}
    {#each rows as each (each.task.id)}
      {@render row(each.task, each.depth)}
    {/each}
  </ol>
</section>
