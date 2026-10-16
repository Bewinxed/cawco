<script lang="ts">
  /**
   * The board view: one column per stage, in the order stages.md names them,
   * each headed by its stage and its count, with a quiet word for its kind
   * under them. A stage of kind `you` is where tasks wait on a person: its
   * column takes the brand wash and its name the brand ink, and its head
   * carries the Needs-you glyph (design §2, Board).
   *
   * Cards drag between columns. While one is in the air the columns it may
   * not go to step back, and the hub has the last word on the drop. Tasks
   * whose stage the project does not name stand in a last column, so a stage
   * renamed in stages.md never hides one.
   *
   * Archived tasks never stand in the columns. They fold into the Archived
   * rail beside the scrolling columns, so it is in view however wide the
   * board runs; pressed, the rail opens into a column of its own, quieter.
   */
  import { tick } from "svelte";
  import {
    type Stage,
    type StageKind,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import { IconArchive } from "#lib/icons.js";
  import { boardDrag, stageDropTarget } from "./board-dnd.svelte.js";
  import NewTaskForm from "./NewTaskForm.svelte";
  import TaskColumn from "./TaskColumn.svelte";

  let {
    stages,
    tasks,
    newIn,
    adding = $bindable(false),
    allowedFrom,
    hrefOf,
    kindOf,
    dateOf = () => null,
    onopen,
    onmove,
    oncreate,
    moving,
    refused,
    archived = [],
    picked,
    onpick,
  }: {
    /** Whether a task is picked for a bulk change (task-select). */
    picked?: (id: string) => boolean;
    /** Ticks or unticks one; `range`, with Shift: the board's cards in order. */
    onpick?: (id: string, on: boolean, range?: string[]) => void;
    /** The project's archived tasks, for the Archived rail. */
    archived?: TaskSummary[];
    stages: Stage[];
    tasks: TaskSummary[];
    /** The column that takes new tasks: the first of kind todo. */
    newIn: string | undefined;
    adding?: boolean;
    allowedFrom: (stage: string) => Set<string>;
    hrefOf: (id: string) => string;
    kindOf: (id: string) => StageKind | null | undefined;
    /** The date a task's file sets it for, said short; null without one. */
    dateOf?: (id: string) => string | null;
    onopen: (id: string) => void;
    onmove: (taskId: string, stage: string, source: HTMLElement) => void;
    oncreate: (title: string, stage: string) => Promise<void>;
    /** A card whose move the hub has not answered yet. */
    moving?: (id: string) => boolean;
    /** A move the hub refused, said under its card. */
    refused?: (id: string) => { again: () => void; reason: string } | null;
  } = $props();

  const named = $derived(new Set(stages.map((stage) => stage.name)));
  /** The Archived rail, open as a column of its own. */
  let railOpen = $state(false);
  const railed = $derived(archived.length > 0);
  let railButton = $state<HTMLButtonElement | null>(null);
  let foldButton = $state<HTMLButtonElement | null>(null);
  /** Opening or folding the rail swaps its control: the focus follows it. */
  async function setRail(opening: boolean) {
    railOpen = opening;
    await tick();
    (opening ? foldButton : railButton)?.focus();
  }
  const byStage = $derived.by(() => {
    const columns = new Map<string, TaskSummary[]>();
    for (const task of tasks) {
      const key = named.has(task.stage) ? task.stage : "";
      const column = columns.get(key);
      if (column) {
        column.push(task);
      } else {
        columns.set(key, [task]);
      }
    }
    return columns;
  });
  const stray = $derived(byStage.get("") ?? []);
  /** The cards in the board's reading order, column by column: a Shift range's span. */
  const order = $derived([
    ...stages.flatMap((stage) =>
      (byStage.get(stage.name) ?? []).map((task) => task.id)
    ),
    ...stray.map((task) => task.id),
  ]);
  const picking = $derived(
    picked ? tasks.some((task) => picked(task.id)) : false
  );
  /** While a card is in the air: the stages it may go to from where it was. */
  const open = $derived(
    boardDrag.from === null ? null : allowedFrom(boardDrag.from)
  );
</script>

{#snippet column(
  name: string,
  label: string,
  kind: StageKind | null,
  cards: TaskSummary[]
)}
  <TaskColumn
    {cards}
    closed={open !== null && name !== boardDrag.from && !open.has(name)}
    {dateOf}
    drop={name ? stageDropTarget(() => name, onmove) : undefined}
    foot={name && name === newIn ? addTask : undefined}
    {hrefOf}
    {kind}
    {kindOf}
    {label}
    {moving}
    onpick={onpick &&
      ((id, on, range) => onpick(id, on, range ? order : undefined))}
    {onopen}
    over={boardDrag.over === name && name !== boardDrag.from}
    {picked}
    {picking}
    {refused}
  />
{/snippet}

{#snippet addTask()}
  <NewTaskForm {oncreate} stage={newIn ?? ""} bind:open={adding} />
{/snippet}

<div class="board-wrap" data-rail-open={railed && railOpen ? "" : undefined}>
  <div class="board kit-edge-fade">
    {#each stages as stage (stage.name)}
      {@render column(
        stage.name,
        stageLabel(stage.name),
        stage.kind,
        byStage.get(stage.name) ?? []
      )}
    {/each}
    {#if stray.length > 0}
      {@render column("", "Other stages", null, stray)}
    {/if}
  </div>
  {#if railed}
    {#if railOpen}
      <div class="rail-open">
        <TaskColumn
          archived
          cards={archived}
          {dateOf}
          {hrefOf}
          kind={null}
          {kindOf}
          label="Archived"
          {onopen}
        />
        <button
          bind:this={foldButton}
          class="rail-close press-tint"
          onclick={() => setRail(false)}
          type="button"
        >
          Fold the archive
        </button>
      </div>
    {:else}
      <!-- mark-line: the rail stacks its glyph above its word, set vertically; they share no line -->
      <button
        bind:this={railButton}
        aria-label="Archived, {archived.length} {archived.length === 1
          ? 'task'
          : 'tasks'}. Open it."
        class="archive-rail press-tint"
        onclick={() => setRail(true)}
        type="button"
      >
        <IconArchive aria-hidden="true" />
        <span class="rail-name">Archived</span>
        <span class="rail-count num">{archived.length}</span>
      </button>
    {/if}
  {/if}
</div>

<style>
  .board-wrap {
    display: flex;
    gap: var(--space-3);
    block-size: 100%;
    min-block-size: 0;
  }
  .board {
    display: grid;
    flex: 1 1 auto;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, 22rem);
    gap: var(--space-3);
    min-inline-size: 0;
    block-size: 100%;
    min-block-size: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-block-end: var(--space-3);
    overscroll-behavior-x: contain;
  }
  /* The rail folded narrow at the board's trailing edge; open, it is a
     column like the others, quieter. Both stand on the board's floor (its
     scroll room under the columns). */
  .archive-rail,
  .rail-open {
    flex: none;
    margin-block-end: var(--space-3);
  }
  .archive-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    inline-size: var(--c-btn-h-lg);
    padding: var(--space-3) 0;
    border: 0;
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .archive-rail :global(svg) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  .rail-name {
    font: var(--type-label);
    writing-mode: vertical-rl;
  }
  .rail-count {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .rail-open {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    inline-size: min(22rem, 80%);
    min-block-size: 0;
  }
  .rail-close {
    min-block-size: var(--c-btn-h-sm);
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    cursor: pointer;
  }
  /* A phone shows one column and the edge of the next, and a swipe settles
     on a column. */
  @media (max-width: 639px) {
    .board {
      grid-auto-columns: calc(100% - var(--space-8));
      scroll-snap-type: x mandatory;
    }
    .board > :global(.column) {
      scroll-snap-align: start;
    }
    /* Open, the rail is the phone's one column: the board steps aside
       until it folds. */
    [data-rail-open] > .board {
      display: none;
    }
    [data-rail-open] > .rail-open {
      inline-size: 100%;
    }
  }
  /* Under a finger, Fold the archive is a full touch target. */
  @media (pointer: coarse) {
    .rail-close {
      min-block-size: var(--c-btn-h-lg);
    }
  }
</style>
