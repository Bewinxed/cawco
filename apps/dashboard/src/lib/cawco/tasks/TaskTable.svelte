<script lang="ts">
  /**
   * The table view: the same tasks as a ledger — title, stage, labels, to-dos
   * and when the file last changed — in stage order, then the board's own
   * order inside a stage. The header is the ledger's band; a row is the
   * task's link, and opens its drawer in place. Under 640px each row becomes
   * the board's two-line card: the title, then stage · to-dos · age.
   */
  import {
    KIND_LABEL,
    type Stage,
    stageLabel,
    type TaskSummary,
  } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { IconNeedsYou } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";

  let {
    stages,
    tasks,
    hrefOf,
    onopen,
  }: {
    stages: Stage[];
    tasks: TaskSummary[];
    hrefOf: (id: string) => string;
    onopen: (id: string) => void;
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

<div class="ledger">
  <Table.Root class="tasks table-fixed" ghostRows="tbody tr">
    <Table.Header>
      <Table.Row class="band border-0">
        <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
        <Table.Head class="col-title" scope="col">Task</Table.Head>
        <Table.Head class="col-stage" scope="col">Stage</Table.Head>
        <Table.Head class="col-labels" scope="col">Labels</Table.Head>
        <Table.Head class="col-todos" scope="col">To-dos</Table.Head>
        <Table.Head class="col-age" scope="col">Updated</Table.Head>
        <!-- biome-ignore-end lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each rows as task (task.id)}
        <Table.Row class="row" data-task={task.id}>
          <Table.Cell class="col-title">
            <a
              class="title focus-inset"
              href={hrefOf(task.id)}
              onclick={(event) => open(event, task.id)}
            >
              <span class="id">{task.id}</span>
              <span class="name">{task.title}</span>
            </a>
          </Table.Cell>
          <Table.Cell class="col-stage">
            <span class="stage" data-kind={task.kind ?? "none"}>
              {#if task.kind === "you"}
                <IconNeedsYou aria-hidden="true" />
              {/if}
              <span class="stage-name">{stageLabel(task.stage)}</span>
              {#if task.kind}
                <span class="kind">{KIND_LABEL[task.kind]}</span>
              {/if}
            </span>
          </Table.Cell>
          <Table.Cell class="col-labels">
            <span class="labels">
              {#each task.labels as label (label)}
                <Badge variant="secondary">{label}</Badge>
              {/each}
            </span>
          </Table.Cell>
          <Table.Cell class="col-todos">
            {#if task.todos.total > 0}
              <span class="todos">
                <TaskRing
                  done={task.todos.done}
                  size="sm"
                  total={task.todos.total}
                />
                <span class="num">{task.todos.done}/{task.todos.total}</span>
              </span>
            {/if}
          </Table.Cell>
          <Table.Cell class="col-age">
            <time
              class="num"
              datetime={new Date(task.updatedAt).toISOString()}
              title={new Date(task.updatedAt).toLocaleString()}
              >{formatAgeShort(task.updatedAt, now)}</time
            >
          </Table.Cell>
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>

<style>
  .ledger {
    overflow: hidden;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .ledger :global(table.tasks) {
    border-collapse: separate;
    border-spacing: 0;
  }
  /* The ledger's header band: column heads, one step under the field. */
  .ledger :global(tr.band) {
    background: var(--surface-band);
  }
  .ledger :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .ledger :global(tr.row) {
    border-block-end: 0;
  }
  .ledger :global(tr.row td) {
    block-size: var(--c-btn-h-lg);
    padding-block: 0;
    padding-inline: var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .ledger :global(tr.row:last-child td) {
    border-block-end: 0;
  }
  .ledger :global(.col-stage) {
    inline-size: 12rem;
  }
  .ledger :global(.col-labels) {
    inline-size: 14rem;
  }
  .ledger :global(.col-todos) {
    inline-size: 6rem;
  }
  .ledger :global(.col-age) {
    inline-size: 6rem;
    text-align: end;
  }
  /* The whole row is the task's link: its title's box reaches every cell. */
  .ledger :global(tr.row) {
    position: relative;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    min-inline-size: 0;
    color: inherit;
    text-decoration: none;
  }
  .title::after {
    position: absolute;
    inset: 0;
    content: "";
  }
  .id {
    flex: none;
    min-inline-size: 6ch;
    font: var(--type-meta);
    font-family: var(--font-mono);
    font-variant-ligatures: none;
    color: var(--ink-subtle);
  }
  .name {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-row);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-inline-size: 0;
    color: var(--ink-strong);
  }
  .stage :global(svg) {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    flex: none;
    color: var(--status-attn-glyph);
  }
  .stage-name {
    font: var(--type-label);
  }
  .kind {
    color: var(--ink-subtle);
  }
  .stage[data-kind="you"] .kind {
    color: var(--status-attn-ink);
  }
  .labels {
    display: flex;
    gap: var(--space-1);
    overflow: hidden;
  }
  .todos {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  @media (max-width: 639px) {
    .ledger :global(table.tasks thead) {
      display: none;
    }
    .ledger :global(table.tasks),
    .ledger :global(table.tasks tbody) {
      display: block;
    }
    .ledger :global(tr.row) {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      align-items: center;
      gap: var(--space-1) var(--space-2);
      padding: var(--space-2) var(--space-3);
      border-block-end: 1px solid var(--border-hairline);
    }
    .ledger :global(tr.row:last-child) {
      border-block-end: 0;
    }
    .ledger :global(tr.row td) {
      display: block;
      inline-size: auto;
      min-inline-size: 0;
      block-size: auto;
      padding: 0;
      border: 0;
    }
    .ledger :global(tr.row td.col-title) {
      grid-column: 1 / -1;
    }
    .ledger :global(tr.row td.col-labels) {
      display: none;
    }
    .ledger :global(tr.row td.col-age) {
      grid-column: 4;
    }
  }
</style>
