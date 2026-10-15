<svelte:options css="injected" />

<script lang="ts">
  /** Tabs: a strip of tabs, one of them chosen; inert. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let { props }: OpenUIRenderProps<{ items: unknown[]; active?: number }> =
    $props();
  const items = $derived(Array.isArray(props.items) ? props.items : []);
</script>

<!-- A picture of tabs, not tabs: inert, so no tab role it cannot keep. -->
<div class="tabs" data-mk="Tabs" inert>
  {#each items as item, index (index)}
    <span
      class="tab"
      data-chosen={index === (props.active ?? 0) ? "" : undefined}
      >{textOf(item)}</span
    >
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: calc(var(--mk-space) * 4);
    min-inline-size: 0;
    border-block-end: 1px solid var(--mk-line);
    overflow: hidden;
  }
  .tab {
    padding-block: calc(var(--mk-space) * 2.5);
    margin-block-end: -1px;
    border-block-end: 2px solid transparent;
    color: var(--mk-muted);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.9375);
    font-weight: 500;
    white-space: nowrap;
  }
  .tab[data-chosen] {
    border-block-end-color: var(--mk-accent);
    color: var(--mk-ink);
    font-weight: 600;
  }
</style>
