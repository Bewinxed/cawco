<script lang="ts">
  /**
   * The table view: the same tasks as a ledger — id, title, stage, labels,
   * to-dos, and when the task was created and last updated — in stage order,
   * then the board's own order inside a stage, until Created or Updated is
   * picked to sort by (newest first, then oldest, then back to stage order).
   * Labels and To-dos stand only while some task has one: a column of blanks
   * says nothing; Created stands only while the ledger is 900px wide or
   * more, so the title keeps its room. The rows and columns are TanStack Table's (PRD §5.2); the
   * markup is the ledger's. The header is the ledger's band; a row is the
   * task's link, and opens its drawer in place. Under 640px each row becomes
   * the board's two-line card: the title, then id · stage · to-dos · updated.
   *
   * With `onpick`, each row leads with its tick for a bulk change, Shift
   * ticking the rows between it and the last one ticked, in the order the
   * ledger shows them; the head's tick picks every row shown, or none. The
   * tick stands over the row's link, so a press on it never opens the task.
   */
  import {
    createSortedRowModel,
    createTable,
    rowSortingFeature,
    sortFn_basic,
    tableFeatures,
  } from "@tanstack/svelte-table";
  import {
    type Stage,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconChevronDown, IconChevronUp, IconNeedsYou } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";

  let {
    stages,
    tasks,
    hrefOf,
    onopen,
    picked,
    onpick,
    onpickall,
  }: {
    stages: Stage[];
    tasks: TaskSummary[];
    hrefOf: (id: string) => string;
    onopen: (id: string) => void;
    /** Whether a task is picked for a bulk change (task-select). */
    picked?: (id: string) => boolean;
    /** Ticks or unticks one; `range`, with Shift: the rows in the ledger's order. */
    onpick?: (id: string, on: boolean, range?: string[]) => void;
    /** Picks every row shown, or none. */
    onpickall?: (ids: string[], on: boolean) => void;
  } = $props();

  const order = $derived(
    new Map(stages.map((stage, index) => [stage.name, index]))
  );
  /** Stage order, then the hub's (rank, then number); a stray stage last. */
  const rows = $derived(
    tasks
      .map((task, index) => ({ task, index }))
      .sort(
        (a, b) =>
          (order.get(a.task.stage) ?? stages.length) -
            (order.get(b.task.stage) ?? stages.length) || a.index - b.index
      )
      .map(({ task }) => task)
  );

  const features = tableFeatures({
    rowSortingFeature,
    sortedRowModel: createSortedRowModel(),
    sortFns: { basic: sortFn_basic },
  });
  const labelled = $derived(tasks.some((task) => task.labels.length > 0));
  const planned = $derived(tasks.some((task) => task.todos.total > 0));
  /** The cells that draw themselves their own way; every other takes the plain cell. */
  const SPECIAL_CELLS = new Set([
    "pick",
    "title",
    "labels",
    "created",
    "updated",
  ]);
  /** A column the ledger holds in its own order. */
  const fixed = { enableSorting: false } as const;
  /** A time column: sorted by its ms epoch, newest first on the first pick. */
  const timed = {
    sortFn: "basic",
    sortDescFirst: true,
    enableMultiSort: false,
  } as const;
  /** The ledger's columns, by id; each cell is drawn below by its id. */
  const columns = $derived([
    ...(onpick
      ? [
          {
            id: "pick",
            header: "",
            accessorFn: (task: TaskSummary) => task.id,
            ...fixed,
          },
        ]
      : []),
    {
      id: "id",
      header: "Id",
      accessorFn: (task: TaskSummary) => task.id,
      ...fixed,
    },
    {
      id: "title",
      header: "Task",
      accessorFn: (task: TaskSummary) => task.title,
      ...fixed,
    },
    {
      id: "stage",
      header: "Stage",
      accessorFn: (task: TaskSummary) => task.stage,
      ...fixed,
    },
    ...(labelled
      ? [
          {
            id: "labels",
            header: "Labels",
            accessorFn: (task: TaskSummary) => task.labels,
            ...fixed,
          },
        ]
      : []),
    ...(planned
      ? [
          {
            id: "todos",
            header: "To-dos",
            accessorFn: (task: TaskSummary) => task.todos,
            ...fixed,
          },
        ]
      : []),
    {
      id: "created",
      header: "Created",
      accessorFn: (task: TaskSummary) => task.createdAt,
      ...timed,
    },
    {
      id: "updated",
      header: "Updated",
      accessorFn: (task: TaskSummary) => task.updatedAt,
      ...timed,
    },
  ]);
  const table = createTable({
    features,
    get columns() {
      return columns;
    },
    getRowId: (task: TaskSummary) => task.id,
    get data() {
      return rows;
    },
  });

  /** The rows' ids in the order the ledger shows them (sorted or not): a Shift range's span. */
  const shownIds = (): string[] =>
    table.getRowModel().rows.map((row) => row.id);

  /** A sorted column's `aria-sort`; the rest say nothing. */
  const ariaSort = (sorted: false | "asc" | "desc") => {
    if (sorted === "asc") {
      return "ascending";
    }
    return sorted === "desc" ? "descending" : undefined;
  };

  /** Re-read once a minute, so an age does not go stale on an open page. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 60_000);
    return () => clearInterval(timer);
  });

  function open(event: MouseEvent, id: string) {
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
    onopen(id);
  }
</script>

<!-- literal: auto auto 1fr auto; auto auto auto 1fr auto; 1 / span 2 -->
<div
  data-slot="ledger"
  class="group/ledger @container overflow-hidden rounded-lg bg-surface-raised shadow-tile"
  data-pickable={onpick ? "" : undefined}
  style:--cell-gap="0"
  style:--row-cols="auto auto 1fr auto"
  style:--row-cols-pick="auto auto auto 1fr auto"
  style:--pick-row="1 / span 2"
>
  <Table.Root
    data-tasks
    class="border-separate border-spacing-(--cell-gap) table-fixed max-phone:block"
    ghostRows="tbody tr"
  >
    <Table.Header class="max-phone:hidden">
      {#each table.getHeaderGroups() as group (group.id)}
        <Table.Row class="border-0 bg-surface-band">
          {#each group.headers as header (header.id)}
            {@const column = header.column}
            {@const sorted = column.getIsSorted()}
            {@const sort = ariaSort(sorted)}
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <!-- literal: calc(1rem + 2 * var(--space-3)), 6.5rem, 12rem, 14rem, 6rem, 7rem -->
            <Table.Head
              aria-sort={sort}
              class={[
                column.id === "created" &&
                  "w-(--col-w) h-c-toolbar-ctl px-space-3 type-label tracking-caps uppercase text-ink-muted text-end @max-decisions-900px:hidden",
                column.id === "updated" &&
                  "w-(--col-w) h-c-toolbar-ctl px-space-3 type-label tracking-caps uppercase text-ink-muted text-end",
                column.id !== "created" &&
                  column.id !== "updated" &&
                  "w-(--col-w) h-c-toolbar-ctl px-space-3 type-label tracking-caps uppercase text-ink-muted",
              ]}
              data-task-table-col={column.id}
              scope="col"
              style="--col-w: {{
                pick: 'calc(1rem + 2 * var(--space-3))',
                id: '6.5rem',
                stage: '12rem',
                labels: '14rem',
                todos: '6rem',
                created: '7rem',
                updated: '7rem',
              }[column.id] ?? ''}"
            >
              <!-- biome-ignore-end lint/a11y/noHeaderScope: the tag above -->
              {#if column.id === "pick"}
                {@const ids = shownIds()}
                {@const count = ids.filter((id) => picked?.(id)).length}
                <Checkbox
                  data-task-table-pick
                  aria-label={count === ids.length && count > 0
                    ? "Untick every task shown"
                    : "Pick every task shown"}
                  checked={count > 0 && count === ids.length}
                  class="relative z-1"
                  indeterminate={count > 0 && count < ids.length}
                  onclick={(event: MouseEvent) => {
                    event.preventDefault();
                    onpickall?.(ids, count < ids.length);
                  }}
                />
              {:else if column.getCanSort()}
                <button
                  class="inline-flex items-center gap-space-1 -me-space-1 p-space-1 rounded-sm type-label tracking-caps uppercase text-ink-muted mark-line press-tint focus-inset"
                  onclick={column.getToggleSortingHandler()}
                  type="button"
                >
                  <span>{column.columnDef.header}</span>
                  {#if sorted === "desc"}
                    <IconChevronDown
                      aria-hidden="true"
                      class="size-icon-sm flex-none"
                    />
                  {:else if sorted === "asc"}
                    <IconChevronUp
                      aria-hidden="true"
                      class="size-icon-sm flex-none"
                    />
                  {/if}
                </button>
              {:else}
                {column.columnDef.header}
              {/if}
            </Table.Head>
          {/each}
        </Table.Row>
      {/each}
    </Table.Header>
    <Table.Body class="max-phone:block">
      {#each table.getRowModel().rows as row (row.id)}
        {@const task = row.original}
        {@const on = picked?.(task.id) ?? false}
        <Table.Row
          data-task-table-row
          class="group/row relative border-b-none data-picked:max-phone:bg-selected-bg max-phone:grid max-phone:grid-cols-(--row-cols) group-data-pickable/ledger:max-phone:grid-cols-(--row-cols-pick) max-phone:items-center max-phone:gap-x-space-2 max-phone:gap-y-space-1 max-phone:py-space-2 max-phone:px-space-3 max-phone:border-b max-phone:border-b-border-hairline max-phone:last:border-b-none"
          data-picked={on || undefined}
          data-task={task.id}
        >
          {#each row.getAllCells() as cell (cell.id)}
            <Table.Cell
              class={[
                cell.column.id === "pick" &&
                  "h-c-btn-h-lg py-0 px-space-3 border-b border-b-border-hairline type-meta text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent max-phone:block max-phone:w-auto max-phone:min-w-0 max-phone:h-auto max-phone:p-0 max-phone:border-none max-phone:border-current max-phone:row-(--pick-row) max-phone:col-start-1",
                cell.column.id === "title" &&
                  "h-c-btn-h-lg py-0 px-space-3 border-b border-b-border-hairline type-meta text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent max-phone:block max-phone:w-auto max-phone:min-w-0 max-phone:h-auto max-phone:p-0 max-phone:border-none max-phone:border-current max-phone:row-start-1 max-phone:col-span-full group-data-pickable/ledger:max-phone:col-start-2 group-data-pickable/ledger:max-phone:-col-end-1",
                cell.column.id === "labels" &&
                  "h-c-btn-h-lg py-0 px-space-3 border-b border-b-border-hairline type-meta text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent max-phone:hidden",
                cell.column.id === "created" &&
                  "h-c-btn-h-lg py-0 px-space-3 border-b border-b-border-hairline type-meta text-ink-muted text-end group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent @max-decisions-900px:hidden",
                cell.column.id === "updated" &&
                  "h-c-btn-h-lg py-0 px-space-3 border-b border-b-border-hairline type-meta text-ink-muted text-end group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent max-phone:block max-phone:w-auto max-phone:min-w-0 max-phone:h-auto max-phone:p-0 max-phone:border-none max-phone:border-current max-phone:col-start-4 group-data-pickable/ledger:max-phone:col-start-5",
                !SPECIAL_CELLS.has(cell.column.id) &&
                  "h-c-btn-h-lg py-0 px-space-3 border-b border-b-border-hairline type-meta text-ink-muted group-last/row:border-b-none group-data-picked/row:bg-selected-bg group-data-picked/row:max-phone:bg-transparent max-phone:block max-phone:w-auto max-phone:min-w-0 max-phone:h-auto max-phone:p-0 max-phone:border-none max-phone:border-current",
              ]}
              data-task-table-col={cell.column.id}
            >
              {#if cell.column.id === "pick"}
                <Checkbox
                  data-task-table-pick
                  aria-label="Pick {task.id} {task.title}"
                  checked={on}
                  class="relative z-1"
                  onclick={(event: MouseEvent) => {
                    event.preventDefault();
                    onpick?.(
                      task.id,
                      !on,
                      event.shiftKey ? shownIds() : undefined
                    );
                  }}
                />
              {:else if cell.column.id === "id"}
                <span data-slot="id" class="type-code text-ink-subtle"
                  >{task.id}</span
                >
              {:else if cell.column.id === "title"}
                <a
                  data-slot="title"
                  class="flex items-baseline gap-space-2 min-w-0 text-inherit no-underline focus-inset"
                  href={hrefOf(task.id)}
                  onclick={(event) => open(event, task.id)}
                >
                  <span
                    data-slot="name"
                    class="min-w-0 type-label text-ink-row truncate"
                    >{task.title}</span
                  >
                </a>
              {:else if cell.column.id === "stage"}
                <span
                  data-slot="stage"
                  class="inline-flex items-center gap-space-1 min-w-0 text-ink-strong mark-line"
                  data-kind={task.kind ?? "none"}
                >
                  {#if task.kind === "you"}
                    <IconNeedsYou
                      aria-hidden="true"
                      class="size-icon-sm flex-none text-status-attn-glyph"
                    />
                  {/if}
                  <span class="type-label">{stageLabel(task.stage)}</span>
                </span>
              {:else if cell.column.id === "labels"}
                <span class="flex gap-space-1 overflow-hidden">
                  {#each task.labels as label (label)}
                    <Badge variant="secondary"><span>{label}</span></Badge>
                  {/each}
                </span>
              {:else if cell.column.id === "todos"}
                {#if task.todos.total > 0}
                  <span class="inline-flex items-center gap-space-1 mark-line">
                    <TaskRing
                      done={task.todos.done}
                      size="sm"
                      total={task.todos.total}
                    />
                    <span data-slot="num" class="num"
                      >{task.todos.done}/{task.todos.total}</span
                    >
                  </span>
                {/if}
              {:else}
                {@const at =
                  cell.column.id === "created"
                    ? task.createdAt
                    : task.updatedAt}
                <time
                  data-slot="num"
                  class="num"
                  datetime={new Date(at).toISOString()}
                  title={new Date(at).toLocaleString()}
                  >{formatAgeShort(at, now)}</time
                >
              {/if}
            </Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>

<style>
  /* residual: pseudo */
  [data-slot="title"]::after {
    position: absolute;
    inset: 0;
    content: "";
  }
</style>
