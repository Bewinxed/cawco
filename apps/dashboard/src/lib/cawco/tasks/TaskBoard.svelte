<script lang="ts">
  /**
   * The board view: one column per stage, in the order stages.md names them,
   * each headed by its stage and a quiet word for its kind. A stage of kind
   * `you` is where tasks wait on a person, so its head carries the Needs-you
   * glyph and word, and its count takes the needs-you tint while it holds
   * any (glyph, word, then hue; never coral, which is where you act).
   *
   * Cards drag between columns. While one is in the air the columns it may
   * not go to step back, and the hub has the last word on the drop. Tasks
   * whose stage the project does not name stand in a last column, so a stage
   * renamed in stages.md never hides one.
   */
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import {
    KIND_LABEL,
    type Stage,
    type StageKind,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import { boardDrag, stageDropTarget } from "./board-dnd.svelte.js";
  import NewTaskForm from "./NewTaskForm.svelte";
  import TaskCard from "./TaskCard.svelte";

  let {
    stages,
    tasks,
    newIn,
    adding = $bindable(false),
    allowedFrom,
    hrefOf,
    kindOf,
    onopen,
    onmove,
    oncreate,
  }: {
    stages: Stage[];
    tasks: TaskSummary[];
    /** The column that takes new tasks: the first of kind todo. */
    newIn: string | undefined;
    adding?: boolean;
    allowedFrom: (stage: string) => Set<string>;
    hrefOf: (id: string) => string;
    kindOf: (id: string) => StageKind | null | undefined;
    onopen: (id: string) => void;
    onmove: (taskId: string, stage: string, source: HTMLElement) => void;
    oncreate: (title: string, stage: string) => Promise<void>;
  } = $props();

  const named = $derived(new Set(stages.map((stage) => stage.name)));
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
  <section
    aria-label="{label}, {cards.length} {cards.length === 1 ? "task" : "tasks"}"
    class="column"
    data-closed={open !== null && name !== boardDrag.from && !open.has(name)
      ? ""
      : undefined}
    data-kind={kind ?? "none"}
    data-over={boardDrag.over === name && name !== boardDrag.from
      ? ""
      : undefined}
    {@attach name ? stageDropTarget(() => name, onmove) : undefined}
  >
    <header class="head">
      {#if kind === "you"}
        <IconNeedsYou aria-hidden="true" class="you-glyph" />
      {/if}
      <h3 class="name">{label}</h3>
      <span class="kind">{kind ? KIND_LABEL[kind] : "not in stages.md"}</span>
      {#if kind === "you" && cards.length > 0}
        <Badge class="num ml-auto" variant="attn">{cards.length}</Badge>
      {:else}
        <span class="count num">{cards.length}</span>
      {/if}
    </header>
    <ol class="cards" {@attach reflow()}>
      {#each cards as task (task.id)}
        <li data-flip>
          <TaskCard href={hrefOf(task.id)} {kindOf} {onopen} {task} />
        </li>
      {/each}
    </ol>
    {#if name && name === newIn}
      <div class="foot">
        <NewTaskForm {oncreate} stage={name} bind:open={adding} />
      </div>
    {/if}
  </section>
{/snippet}

<div class="board">
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

<style>
  .board {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(15rem, 22rem);
    gap: var(--space-3);
    block-size: 100%;
    min-block-size: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding-block-end: var(--space-3);
    overscroll-behavior-x: contain;
  }
  /* A phone shows one column and the edge of the next, and a swipe settles
     on a column. */
  @media (max-width: 639px) {
    .board {
      grid-auto-columns: calc(100% - var(--space-8));
      scroll-snap-type: x mandatory;
    }
    .column {
      scroll-snap-align: start;
    }
  }
  .column {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-block-size: 0;
    padding: var(--space-1);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    transition:
      background-color var(--dur-control) var(--ease-out),
      opacity var(--dur-control) var(--ease-out);
  }
  /* The column a drop would land in. */
  .column[data-over] {
    background: var(--surface-hover);
  }
  /* A column the card in the air may not go to: still a target (the hub
     says why), only quieter. */
  .column[data-closed] {
    opacity: 0.5;
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-2);
  }
  .head :global(.you-glyph) {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
    flex: none;
    margin-inline-end: calc(var(--space-1) * -1);
    color: var(--status-attn-glyph);
  }
  .name {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .kind {
    flex: none;
    font: var(--type-meta);
    color: var(--ink-subtle);
    white-space: nowrap;
  }
  .column[data-kind="you"] .kind {
    color: var(--status-attn-ink);
  }
  .count {
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .cards {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-1);
    min-block-size: var(--c-btn-h-lg);
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .foot {
    flex: none;
  }
  .foot :global(.add-task) {
    inline-size: 100%;
  }
</style>
