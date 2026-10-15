<script lang="ts">
  /**
   * One part of a task's result in the task sheet, in its card: what it is
   * called (its kind, in the reader's word, with its glyph) and its own
   * title where it has one, over the thing itself. Never a file's name.
   */
  import type { Component, Snippet } from "svelte";

  let {
    glyph: Glyph,
    kind,
    title = null,
    children,
    ...rest
  }: {
    glyph: Component;
    /** "Report", "Document", "Mockup": what the reader is looking at. */
    kind: string;
    title?: string | null;
    children: Snippet;
    [data: `data-${string}`]: string | undefined;
  } = $props();
</script>

<!-- mark-line: a column; its glyph and words are on the header's own mark line -->
<article class="card" {...rest}>
  <header class="head mark-line">
    <Glyph aria-hidden="true" class="glyph" />
    <h4 class="kind">{kind}</h4>
    {#if title}
      <span class="title">{title}</span>
    {/if}
  </header>
  {@render children()}
</article>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-inline-size: 0;
    padding: var(--space-4);
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
  .head :global(.glyph) {
    flex: none;
    inline-size: 16px;
    block-size: 16px;
    color: var(--ink-muted);
  }
  .kind {
    flex: none;
    margin: 0;
    font: var(--type-label);
    color: var(--ink-muted);
  }
  .title {
    min-inline-size: 0;
    overflow: clip;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
