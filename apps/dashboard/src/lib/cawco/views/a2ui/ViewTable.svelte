<script lang="ts">
  /**
   * Tasks as a ledger with the view's own columns: TanStack Table over the
   * rows the view binds (every task when it names none), drawn in the
   * ledger's markup. A row opens its task.
   */
  import type { ViewTask } from "@cawco/core";
  import { createTable, tableFeatures } from "@tanstack/svelte-table";
  import type { A2uiComponentProps } from "svelte-a2ui";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { fieldText, viewContext } from "./context";

  let { rows, columns }: A2uiComponentProps = $props();
  const view = viewContext();

  const data = $derived(
    Array.isArray(rows) ? (rows as ViewTask[]) : view.data.tasks
  );
  const columnList = $derived(
    Array.isArray(columns)
      ? (columns as { label: unknown; field: string }[]).map((column) => ({
          id: column.field,
          header:
            typeof column.label === "string" ? column.label : column.field,
          accessorFn: (task: ViewTask) => fieldText(task, column.field),
        }))
      : []
  );
  const features = tableFeatures({});
  const table = createTable({
    features,
    get columns() {
      return columnList;
    },
    getRowId: (task: ViewTask) => task.id,
    get data() {
      return data;
    },
  });

  function open(event: MouseEvent, id: string) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    event.preventDefault();
    view.onopen(id);
  }
</script>

<div class="ledger">
  <Table.Root ghostRows="tbody tr">
    <Table.Header>
      {#each table.getHeaderGroups() as group (group.id)}
        <Table.Row class="band border-0">
          {#each group.headers as header (header.id)}
            <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head scope="col"
              >{header.column.columnDef.header}</Table.Head
            >
          {/each}
        </Table.Row>
      {/each}
    </Table.Header>
    <Table.Body>
      {#each table.getRowModel().rows as row (row.id)}
        <Table.Row class="row">
          {#each row.getAllCells() as cell, i (cell.id)}
            <Table.Cell>
              {#if i === 0}
                <a
                  class="cell-link"
                  href={view.hrefOf(row.original.id)}
                  onclick={(event) => open(event, row.original.id)}
                  >{String(cell.getValue())}</a
                >
              {:else}
                {String(cell.getValue())}
              {/if}
            </Table.Cell>
          {/each}
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
  .ledger :global(tr.band) {
    background: var(--surface-band);
  }
  /* A column keeps its words on one line; a table wider than its place
     scrolls sideways in its container (Table.Root), never clips. */
  .ledger :global(th),
  .ledger :global(td) {
    white-space: nowrap;
  }
  .ledger :global(tr.band th) {
    block-size: var(--c-toolbar-ctl);
    padding-inline: var(--space-3);
    font: var(--type-label);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
  .ledger :global(tr.row td) {
    block-size: var(--c-btn-h-lg);
    padding-inline: var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .ledger :global(tr.row) {
    position: relative;
  }
  .cell-link {
    font: var(--type-label);
    color: var(--ink-row);
    text-decoration: none;
  }
  .cell-link::after {
    position: absolute;
    inset: 0;
    content: "";
  }
</style>
