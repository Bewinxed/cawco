<script lang="ts">
  /**
   * PROPOSED: what Show details unfolds, never a paraphrase (the paraphrase
   * is the line above it): the hub's own words verbatim in the code role on
   * code-bg, with an `xs` Copy at their trailing edge; or, where the reason
   * is about several things (machines), one row each, its name in mono then
   * its state, on two columns every row shares. Its words take the ink of
   * what it stands in.
   */
  import { CopyButton } from "#lib/components/ui/copy-button/index.js";

  let {
    raw = null,
    rows = [],
  }: {
    raw?: string | null;
    rows?: { name: string; said: string }[];
  } = $props();
</script>

<div class="details" data-design-details>
  {#if raw}
    <div class="said">
      <pre class="raw">{raw}</pre>
      <CopyButton aria-label="Copy the hub's words" size="icon-xs" text={raw} />
    </div>
  {/if}
  {#if rows.length > 0}
    <ul class="rows">
      {#each rows as one (one.name)}
        <li aria-label="{one.name}: {one.said}" class="one">
          <span class="name">{one.name}</span>
          <span class="state">{one.said}</span>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .details {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block-start: var(--space-2);
    min-inline-size: 0;
  }
  .said {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-1) var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--code-bg);
    color: var(--ink-strong);
  }
  .raw {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    line-height: var(--leading-code);
    font-variant-ligatures: none;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .rows {
    display: grid;
    grid-template-columns: fit-content(50%) minmax(0, 1fr);
    column-gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
    font: var(--type-meta);
  }
  .one {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: baseline;
    padding-block: var(--space-1);

    & + & {
      border-block-start: 1px solid var(--border-hairline);
    }
  }
  .name {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-variant-ligatures: none;
  }
  .state {
    min-inline-size: 0;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
</style>
