<script lang="ts">
  /**
   * A result's rows as the kit's table: a CSV's, or a data result's list of
   * like records. Each cell's value in words (result.ts `plainWords`), a
   * link drawn as one.
   */
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Table from "#lib/components/ui/table/index.js";
  import { isUrl, type Json, plainWords } from "./result";

  let { columns, rows }: { columns: string[]; rows: Json[][] } = $props();
</script>

<div class="frame">
  <Table.Root>
    <Table.Header>
      <Table.Row>
        {#each columns as column, index (index)}
          <Table.Head>{column}</Table.Head>
        {/each}
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {#each rows as row, index (index)}
        <Table.Row>
          {#each columns as _, at (at)}
            {@const cell = row[at] ?? null}
            <Table.Cell class="align-top whitespace-normal">
              {#if isUrl(cell)}
                <a class="link" href={cell} rel="noreferrer" target="_blank"
                  >{cell}</a
                >
              {:else}
                {plainWords(cell)}
              {/if}
            </Table.Cell>
          {/each}
        </Table.Row>
      {/each}
    </Table.Body>
  </Table.Root>
</div>

<style>
  .frame {
    min-inline-size: 0;
    overflow: hidden;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    /* A cell wraps between words, never inside one ("09:00" whole): a
       table inside a data field would take that field's `anywhere`, which
       lets the table squeeze each cell to a character. A word wider than its
       cell still breaks rather than overflow. */
    overflow-wrap: break-word;
  }
  .link {
    color: var(--link-ink);
    text-underline-offset: 3px;
  }
</style>
