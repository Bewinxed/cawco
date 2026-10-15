<script lang="ts">
  import ResultTable from "./ResultTable.svelte";
  /**
   * A data result (a `.json` output) drawn as what it says: a record's name
   * as its heading, its other fields as labelled rows in words (a date as a
   * date, a yes/no as one), a list of like records as a table, a list of
   * words as words. Never the file, never its braces.
   */
  import {
    isRecord,
    isUrl,
    type Json,
    type JsonRecord,
    keyLabel,
    nameKeyOf,
    plainWords,
    tableOf,
  } from "./result";

  let { value }: { value: Json } = $props();
</script>

{#snippet plain(item: Json)}
  {#if isUrl(item)}
    <a class="link" href={item} rel="noreferrer" target="_blank">{item}</a>
  {:else}
    <span class="words">{plainWords(item)}</span>
  {/if}
{/snippet}

{#snippet any(item: Json, depth: number)}
  {#if isRecord(item)}
    {@render record(item, depth)}
  {:else if Array.isArray(item)}
    {@render list(item, depth)}
  {:else}
    {@render plain(item)}
  {/if}
{/snippet}

{#snippet record(item: JsonRecord, depth: number)}
  {@const nameKey = nameKeyOf(item)}
  {@const fields = Object.entries(item).filter(([key]) => key !== nameKey)}
  <div class="record" data-depth={depth}>
    {#if nameKey}
      <p class={depth === 0 ? "name" : "sub-name"}>{item[nameKey]}</p>
    {/if}
    {#if fields.length > 0}
      <dl class="fields">
        {#each fields as [key, field] (key)}
          <div
            class="field"
            class:wide={typeof field === "object" && field !== null}
          >
            <dt>{keyLabel(key)}</dt>
            <dd>{@render any(field, depth + 1)}</dd>
          </div>
        {/each}
      </dl>
    {/if}
  </div>
{/snippet}

{#snippet list(items: Json[], depth: number)}
  {@const table = tableOf(items)}
  {#if items.length === 0}
    <span class="words muted">None</span>
  {:else if table}
    <ResultTable
      columns={table.columns.map(keyLabel)}
      rows={table.rows.map((row) =>
        table.columns.map((column) => row[column] ?? null)
      )}
    />
  {:else if items.every((item) => !(typeof item === "object" && item !== null))}
    <ul class="plain-list">
      {#each items as item, index (index)}
        <li>{@render plain(item)}</li>
      {/each}
    </ul>
  {:else}
    <div class="records">
      {#each items as item, index (index)}
        <div class="nested">{@render any(item, depth + 1)}</div>
      {/each}
    </div>
  {/if}
{/snippet}

<div class="data" data-result-data>
  {@render any(value, 0)}
</div>

<style>
  .data {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    font: var(--type-body);
    color: var(--ink-strong);
  }
  .record {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .name {
    font: var(--type-title);
    letter-spacing: var(--track-title);
    color: var(--ink-strong);
    text-wrap: balance;
  }
  .sub-name {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .fields {
    display: grid;
    grid-template-columns: minmax(6rem, max-content) minmax(0, 1fr);
    gap: var(--space-2) var(--space-4);
    margin: 0;
  }
  .field {
    display: contents;
  }
  dt {
    font: var(--type-label);
    color: var(--ink-muted);
  }
  dd {
    margin: 0;
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  /* A field whose value is a list or a record takes the row's whole width
     under its label. */
  .field.wide dt {
    grid-column: 1 / -1;
  }
  .field.wide dd {
    grid-column: 1 / -1;
  }
  .words {
    white-space: pre-wrap;
  }
  .muted {
    color: var(--ink-muted);
  }
  .link {
    color: var(--link-ink);
    text-underline-offset: 3px;
  }
  .plain-list {
    margin: 0;
    padding-inline-start: var(--space-5);
    list-style: disc;
  }
  .records {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .nested {
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
</style>
