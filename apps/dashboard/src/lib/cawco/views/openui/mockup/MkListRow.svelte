<svelte:options css="injected" />

<script lang="ts">
  /** ListRow: one row of a list, a short leading mark, its title and meta, a trailing value. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
  }: OpenUIRenderProps<{
    title: unknown;
    meta?: unknown;
    leading?: unknown;
    trailing?: unknown;
    selected?: boolean;
  }> = $props();
</script>

<div
  class="row"
  data-mk="ListRow"
  data-selected={props.selected ? "" : undefined}
>
  {#if textOf(props.leading)}
    <span aria-hidden="true" class="lead">{textOf(props.leading)}</span>
  {/if}
  <span class="words">
    <span class="title">{textOf(props.title)}</span>
    {#if textOf(props.meta)}
      <span class="meta">{textOf(props.meta)}</span>
    {/if}
  </span>
  {#if textOf(props.trailing)}
    <span class="trail">{textOf(props.trailing)}</span>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: calc(var(--mk-space) * 3);
    min-inline-size: 0;
    padding: calc(var(--mk-space) * 2.5) calc(var(--mk-space) * 3);
    border-radius: var(--mk-radius-small);
    font-family: var(--mk-font-body);
  }
  .row[data-selected] {
    background: var(--mk-sunken);
  }
  .lead {
    display: inline-grid;
    place-items: center;
    flex: none;
    inline-size: calc(var(--mk-space) * 8);
    block-size: calc(var(--mk-space) * 8);
    border-radius: var(--mk-radius-small);
    background: var(--mk-sunken);
    color: var(--mk-ink);
    font-size: calc(var(--mk-text-size) * 0.75);
    font-weight: 700;
  }
  .words {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-inline-size: 0;
  }
  .title {
    overflow: hidden;
    color: var(--mk-ink);
    font-size: var(--mk-text-size);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    overflow: hidden;
    color: var(--mk-muted);
    font-size: calc(var(--mk-text-size) * 0.8125);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .trail {
    flex: none;
    color: var(--mk-muted);
    font-size: calc(var(--mk-text-size) * 0.8125);
    font-variant-numeric: tabular-nums;
  }
</style>
