<script lang="ts">
  /**
   * The board view: one column per stage, in the order stages.md names them,
   * each headed by its stage and its count, with a quiet word for its kind
   * under them. A stage of kind `you` is where tasks wait on a person: its
   * head carries the Needs-you glyph and its kind word the attn ink.
   *
   * Cards drag between columns. While one is in the air the columns it may
   * not go to step back, and the hub has the last word on the drop. Tasks
   * whose stage the project does not name stand in a last column, so a stage
   * renamed in stages.md never hides one.
   *
   * Archived tasks never stand in the columns. They fold into the Archived
   * rail beside the scrolling columns, so it is in view however wide the
   * board runs; pressed, the rail opens into a column of its own, quieter.
   *
   * A task added from the board lands where the board's order puts it, at
   * the foot of its stage (the hub's order: ranked tasks first, then by
   * number, and a new task is unranked and the newest), just above the
   * form it was typed in. Its card is brought into view in its column and
   * marked new for a moment (`fresh`), and brought into view again when the
   * hub's echo redraws the board.
   */
  import { bringIntoStrip, bringIntoView } from "@cawco/core/bring-into-view";
  import type { StageKind } from "@cawco/core/views";
  import { tick } from "svelte";
  import { dur } from "#lib/cawco/motion/curves.svelte.js";
  import {
    type Stage,
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
    /** The date a task's file sets it for, said short; null without one. */
    dateOf?: (id: string) => string | null;
    onopen: (id: string) => void;
    onmove: (taskId: string, stage: string, source: HTMLElement) => void;
    /** Adds a task; answers its id, so its card is brought into view. */
    oncreate: (title: string, stage: string) => Promise<string>;
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
  let board = $state<HTMLElement>();
  /** The card just added here, while it is marked new (`row-flash`'s length). */
  let fresh = $state<string | null>(null);
  /** The card just added, until the hub's echo has redrawn the board. */
  let echo: string | null = null;
  let unmark: ReturnType<typeof setTimeout> | undefined;
  /** Brings a card into view in its column, and its column on the board's strip. */
  function reveal(id: string) {
    const row = board
      ?.querySelector(`[data-task="${CSS.escape(id)}"]`)
      ?.closest("li");
    if (row) {
      bringIntoStrip(row);
      bringIntoView(row);
    }
  }
  async function add(title: string, stage: string) {
    const id = await oncreate(title, stage);
    fresh = id;
    clearTimeout(unmark);
    unmark = setTimeout(
      () => {
        fresh = null;
      },
      dur("--duration-fade") * 3
    );
    await tick();
    // Before the frame the board's rows are read in (motion/rows), so the
    // card is in view as it arrives and is uncovered there.
    reveal(id);
    echo = id;
  }
  $effect(() => {
    // The next list after the add is the hub's echo: the card is held in view across it.
    if (tasks && echo !== null) {
      const id = echo;
      echo = null;
      tick().then(() => reveal(id));
    }
  });
  $effect(() => () => clearTimeout(unmark));
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
  cards: TaskSummary[],
  look?: Pick<Stage, "color" | "icon">
)}
  <TaskColumn
    {cards}
    closed={open !== null && name !== boardDrag.from && !open.has(name)}
    {dateOf}
    drop={name ? stageDropTarget(() => name, onmove) : undefined}
    {fresh}
    foot={name && name === newIn ? addTask : undefined}
    {hrefOf}
    color={look?.color}
    icon={look?.icon}
    {kind}
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
  <NewTaskForm oncreate={add} stage={newIn ?? ""} bind:open={adding} />
{/snippet}

<!-- On a phone the page is the one scroller and the board is as tall as its
     cards; with none yet it keeps the room it is given, so an empty board
     (a project just set up) is a column with its Add task, not a strip
     over an empty screen. -->
<div
  class={[
    "group flex h-full min-h-0 gap-space-3",
    tasks.length > 0 && "max-phone:h-auto",
  ]}
  data-rail-open={railed && railOpen ? "" : undefined}
>
  <div
    data-slot="board"
    bind:this={board}
    class={[
      "kit-edge-fade grid h-full min-h-0 min-w-0 flex-auto auto-cols-(--cols) grid-flow-col gap-space-3 overflow-x-auto overflow-y-hidden overscroll-x-contain pb-space-3 max-phone:auto-cols-(--cols-phone)",
      "max-phone:snap-x max-phone:snap-mandatory max-phone:group-data-rail-open:hidden",
      tasks.length > 0 && "max-phone:h-auto",
    ]}
    style:--cols={"minmax(var(--spacing-c-board-col-min), var(--spacing-c-board-col-max))"}
    style:--cols-phone="calc(100% - var(--spacing-space-8))"
  >
    {#each stages as stage (stage.name)}
      {@render column(
        stage.name,
        stageLabel(stage.name),
        stage.kind,
        byStage.get(stage.name) ?? [],
        stage
      )}
    {/each}
    {#if stray.length > 0}
      {@render column("", "Other stages", null, stray)}
    {/if}
  </div>
  {#if railed}
    {#if railOpen}
      <div
        data-slot="rail-open"
        class="mb-space-3 flex min-h-0 w-(--w) flex-none flex-col gap-space-1 max-phone:w-full"
        style:--w="min(var(--spacing-c-board-col-max), 80%)"
      >
        <TaskColumn
          archived
          cards={archived}
          {dateOf}
          {hrefOf}
          kind={null}
          label="Archived"
          {onopen}
        />
        <button
          data-slot="rail-close"
          bind:this={foldButton}
          class="select-none press-tint min-h-c-btn-h-sm rounded-sm border-none border-current bg-transparent p-space-1 type-meta text-ink-muted coarse:min-h-c-btn-h-lg"
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
        class="select-none press-tint mb-space-3 flex w-c-btn-h-lg flex-none flex-col items-center gap-space-2 rounded-lg border-none border-current bg-surface-band px-0 py-space-3 text-ink-muted inset-ring inset-ring-border-hairline"
        onclick={() => setRail(true)}
        type="button"
      >
        <IconArchive aria-hidden="true" class="size-icon-md" />
        <span data-slot="rail-name" class="type-label writing-vertical-rl"
          >Archived</span
        >
        <span data-slot="num" class="num type-meta text-ink-subtle"
          >{archived.length}</span
        >
      </button>
    {/if}
  {/if}
</div>
