<script lang="ts">
  /**
   * The kit's Table in a frame of its own (its states file's): a header
   * band over rows of cells, as the machine ledger and the task table
   * compose it.
   */
  import * as Table from "./index.js";

  let {
    label,
    columns,
    rows,
  }: {
    /** The table's name, for the screen reader. */
    label: string;
    /** Each column's heading. */
    columns: string[];
    /** Each row's cells, in the columns' order. */
    rows: string[][];
  } = $props();
</script>

<div class="w-full min-w-0">
  <Table.Root aria-label={label} layout="ledger">
    <Table.Header>
      <Table.Row variant="band">
        {#each columns as column (column)}
          <Table.Head variant="band">{column}</Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each rows as row (row[0])}
        <Table.Row>
          {#each row as cell, index (columns[index])}
            <Table.Cell>{cell}</Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>
