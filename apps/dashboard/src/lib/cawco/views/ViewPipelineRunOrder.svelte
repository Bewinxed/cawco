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
  import StateLine from "../tasks/TaskStateLine.svelte";
  import { type NameOf, stateLineOf } from "../tasks/task-state-line";

  let {
    tasks,
    dateOf,
    hrefOf,
    onopen,
    nameOf,
  }: {
    tasks: TaskSummary[];
    hrefOf: (id: string) => string;
    /** Opens a task beside the order. */
    onopen?: (id: string) => void;
    /** The date a task's file sets it for, said short. */
    dateOf: (id: string) => string | null;
    /** A session's name; the fleet's when left out. */
    nameOf?: NameOf;
  } = $props();

  let foldOpen = $state(false);

  const open = $derived(tasks.filter((task) => task.kind !== "done" && task.kind !== "dropped"));
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
    open.filter((task) => !under.has(task.id)).sort((a, b) => RANK(a) - RANK(b) || a.number - b.number)
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
  {@const line = stateLineOf(task, { date: dateOf(task.id), nameOf })}
  <li>
    <a
      class="row press-tint focus-inset"
      data-depth={depth}
      data-run-row={task.id}
      href={hrefOf(task.id)}
      onclick={(event) => {
        if (onopen && event.button === 0 && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
          event.preventDefault();
          onopen(task.id);
        }
      }}
    >
      <span class="lead mark-line">
        <span class="slot" data-box>
          {#if line && line.kind === "session"}
            <SessionMark id={line.session} place={line.place} status={line.status} />
          {:else if task.kind === "you"}
              <IconNeedsYou aria-hidden="true" class="glyph attn" />
          {:else if task.kind === "done"}
            <IconSuccess aria-hidden="true" class="glyph done" />
          {:else}
            <IconDot aria-hidden="true" class="glyph" />
          {/if}
        </span>
        <span class="id">{task.id}</span>
      </span>
      <span class="title">{task.title}</span>
      <span class="state">
        {#if line}
          <StateLine bare={line.kind === "session"} {line} />
        {:else if task.kind === "you"}
          <span class="quiet">Waits on your review</span>
        {:else}
          <span class="quiet">Ready</span>
        {/if}
      </span>
      <span class="todos mark-line">
        {#if task.todos.total > 0}
          <TaskRing done={task.todos.done} total={task.todos.total} />
          <span data-slot="num" class="num">{task.todos.done}/{task.todos.total}</span>
        {/if}
      </span>
    </a>
  </li>
{/snippet}

<section aria-label="Run order" class="run-order" data-run-order>
  <header class="order-head">
    <h3 class="order-title">Order</h3>
    {#if done.length > 0}
      <button
        aria-expanded={foldOpen}
        class="fold mark-line press-tint focus-inset"
        onclick={() => {
          foldOpen = !foldOpen;
        }}
        type="button"
      >
        <span data-slot="num" class="num">{done.length} done</span>
        <IconChevronDown aria-hidden="true" class="fold-chevron" data-box />
      </button>
    {/if}
  </header>
  <ol class="rows">
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

<style>
  .run-order {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    container: run-order / inline-size;
  }
  .order-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-btn-h-sm);
  }
  .order-title {
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .fold {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: auto;
    min-block-size: var(--c-btn-h-xs);
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .fold :global(.fold-chevron) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    transition: rotate var(--dur-control) var(--ease-out);
  }
  .fold[aria-expanded="true"] :global(.fold-chevron) {
    rotate: 180deg;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* One row: lead (mark and id), title, state, to-dos, on four columns a
     desk can hold; under 40rem, two lines. */
  .row {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr) minmax(0, 16rem) 4rem;
    align-items: center;
    gap: var(--space-3);
    min-block-size: var(--c-row-h);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-strong);
    text-decoration: none;
  }
  .row[data-depth="1"] {
    margin-inline-start: calc(18px + var(--space-2));
  }
  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--surface-hover);
    }
  }
  .lead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .slot {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: 18px;
    block-size: 18px;
  }
  .slot :global(.glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    color: var(--ink-subtle);
  }
  .slot :global(.glyph.attn) {
    color: var(--status-attn-glyph);
  }
  .slot :global(.glyph.done) {
    color: var(--status-done-glyph);
  }
  .id {
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .title {
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-body);
    font-weight: var(--weight-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .state {
    display: flex;
    min-inline-size: 0;
  }
  .quiet {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .todos {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  @container run-order (width < 40rem) {
    .row {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "title todos"
        "state lead";
      row-gap: var(--space-1);
      padding-block: var(--space-2);
    }
    .title {
      grid-area: title;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .state {
      grid-area: state;
    }
    .lead {
      grid-area: lead;
      justify-self: end;
    }
    .todos {
      grid-area: todos;
    }
  }
</style>
