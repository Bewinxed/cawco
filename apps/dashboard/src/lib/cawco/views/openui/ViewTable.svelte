<script lang="ts">
  /**
   * Table: any rows a program holds, one column per heading; a cell holds
   * words, a number or a Badge. The kit Table as a view's ledger draws it,
   * its rows cards under a 640px ledger (`stacks="phone"`): the lead cell
   * the card's first line, each other cell under it with its heading, so a
   * phone's 390 never scrolls it sideways.
   */
  import * as Table from "#lib/components/ui/table/index.js";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{ columns: unknown; rows: unknown }> = $props();

  const columns = $derived(
    Array.isArray(props.columns) ? props.columns.map(String) : []
  );
  const rows = $derived(
    Array.isArray(props.rows)
      ? props.rows.map((row) => (Array.isArray(row) ? row : []))
      : []
  );
</script>

<div
  data-slot="ledger"
  class="overflow-hidden rounded-lg bg-surface-raised shadow-tile"
>
  <Table.Root fadeEdges stacks="phone" style="--card-cols: minmax(0, 1fr)">
    <Table.Header>
      <Table.Row variant="band">
        {#each columns as column, i (i)}
          <!-- biome-ignore lint/a11y/noHeaderScope: Table.Head renders a real <th> -->
          <Table.Head scope="col" variant="band">{column}</Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each rows as row, r (r)}
        <Table.Row variant="stacks">
          {#each row as cell, i (i)}
            <Table.Cell
              class={i === 0 ? "@phone/table:min-w-c-view-lead-min" : undefined}
              variant={i === 0 ? "view-lead" : "view-wraps"}
            >
              {#if i > 0 && columns[i]}
                <!-- Its heading, in the card only: the band is hidden there. -->
                <span
                  class="me-space-2 hidden type-meta text-ink-muted @max-phone/table:inline"
                  data-slot="cell-heading">{columns[i]}</span
                >
              {/if}
              {#if typeof cell === "string" || typeof cell === "number"}
                <span class={i === 0 ? "type-label text-ink-row" : undefined}
                  >{cell}</span
                >
              {:else}
                {@render renderNode(cell)}
              {/if}
            </Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>
