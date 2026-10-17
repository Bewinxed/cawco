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

<div
  class="group flex h-full min-h-0 gap-space-3 max-phone:h-auto"
  data-rail-open={railed && railOpen ? "" : undefined}
>
  <!-- literal: minmax(15rem, 22rem) -->
  <div
    data-slot="board"
    class="kit-edge-fade grid h-full min-h-0 min-w-0 flex-auto auto-cols-(--cols) grid-flow-col gap-space-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-space-3 max-phone:h-auto max-phone:auto-cols-(--cols-phone) max-phone:snap-x max-phone:snap-mandatory max-phone:group-data-rail-open:hidden"
    style:--cols="minmax(15rem, 22rem)"
    style:--cols-phone="calc(100% - var(--space-8))"
  >
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
      <!-- literal: min(22rem, 80%) -->
      <div
        data-slot="rail-open"
        class="mb-space-3 flex min-h-0 w-(--w) flex-none flex-col gap-space-1 max-phone:w-full"
        style:--w="min(22rem, 80%)"
      >
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
          data-slot="rail-close"
          bind:this={foldButton}
          class="press-tint min-h-c-btn-h-sm cursor-pointer rounded-sm border-none border-current bg-transparent p-space-1 type-meta text-ink-muted coarse:min-h-c-btn-h-lg"
          onclick={() => setRail(false)}
          type="button"
        >
          Fold the archive
        </button>
      </div>
    {:else}
      <!-- mark-line: the rail stacks its glyph above its word, set vertically; they share no line -->
      <button
        data-slot="archive-rail"
        bind:this={railButton}
        aria-label="Archived, {archived.length} {archived.length === 1
          ? 'task'
          : 'tasks'}. Open it."
        class="press-tint mb-space-3 flex w-c-btn-h-lg flex-none cursor-pointer flex-col items-center gap-space-2 rounded-lg border-none border-current bg-surface-band px-0 py-space-3 text-ink-muted"
        onclick={() => setRail(true)}
        type="button"
      >
        <IconArchive aria-hidden="true" class="size-icon-md" />
        <span data-slot="rail-name" class="type-label">Archived</span>
        <span data-slot="num" class="num type-meta text-ink-subtle"
          >{archived.length}</span
        >
      </button>
    {/if}
  {/if}
</div>

<style>
  /* residual: unmapped — the folded rail's hairline ring (no token carries it), and its name set vertically. */
  [data-slot="archive-rail"] {
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  [data-slot="rail-name"] {
    writing-mode: vertical-rl;
  }
  /* residual: foreign-dom — a phone's board settles a swipe on a column; TaskColumn's root takes no class. */
  @media (max-width: 639px) {
    [data-slot="board"] > :global([data-slot="column"]) {
      scroll-snap-align: start;
    }
  }
</style>
