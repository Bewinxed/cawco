<script lang="ts">
  /**
   * Tasks as a ledger with the view's own columns: TanStack Table over the
   * rows the view gives it (a Query of the tasks tool, or part of one),
   * drawn in the ledger's markup. A row opens its task.
   */
  import { createTable, tableFeatures } from "@tanstack/svelte-table";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for a component group.
  import * as Table from "#lib/components/ui/table/index.js";
  import { fieldText, rowsOf, type ViewTaskRow, viewContext } from "./context";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ rows: unknown; columns: unknown }> =
    $props();
  const view = viewContext();

  const data = $derived(rowsOf<ViewTaskRow>(props.rows));
  const columnList = $derived(
    rowsOf<{ label: unknown; field: unknown }>(props.columns)
      .filter((column) => typeof column?.field === "string")
      .map((column) => {
        const field = column.field as string;
        return {
          id: field,
          header: typeof column.label === "string" ? column.label : field,
          accessorFn: (task: ViewTaskRow) => fieldText(task, field),
        };
      })
  );
  const features = tableFeatures({});
  const table = createTable({
    features,
    get columns() {
      return columnList;
    },
    getRowId: (task: ViewTaskRow) => task.id,
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

<div
  data-slot="ledger"
  class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
>
  <Table.Root fadeEdges ghostRows="tbody tr">
    <Table.Header>
      {#each table.getHeaderGroups() as group (group.id)}
        <Table.Row variant="band">
          {#each group.headers as header (header.id)}
            <!-- biome-ignore-start lint/a11y/noHeaderScope: Table.Head renders a real <th>; biome only sees the component tag -->
            <Table.Head scope="col" variant="band"
              >{header.column.columnDef.header}</Table.Head
            >
            <!-- biome-ignore-end lint/a11y/noHeaderScope: the head above -->
          {/each}
        </Table.Row>
      {/each}
    </Table.Header>
    <Table.Body>
      {#each table.getRowModel().rows as row (row.id)}
        <Table.Row data-view-table-row class="relative">
          {#each row.getAllCells() as cell, i (cell.id)}
            <Table.Cell
              class={i === 0 ? "min-w-c-view-lead-min" : undefined}
              variant={i === 0 ? "view-lead" : "view"}
            >
              {#if i === 0}
                <a
                  data-slot="cell-link"
                  class="type-label text-ink-row no-underline after:absolute after:inset-0"
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
