<svelte:options css="injected" />

<script lang="ts">
  /** Card: a surface holding its children, an optional title over them. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    children: unknown[];
    title?: unknown;
    raised?: boolean;
  }> = $props();
</script>

<section
  class="card"
  data-mk="Card"
  data-raised={props.raised ? "" : undefined}
>
  {#if textOf(props.title)}
    <h3 class="title">{textOf(props.title)}</h3>
  {/if}
  {@render renderNode(props.children)}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 3);
    min-inline-size: 0;
    padding: calc(var(--mk-space) * 4);
    border: 1px solid var(--mk-line);
    border-radius: var(--mk-radius);
    background: var(--mk-surface);
  }
  .card[data-raised] {
    border-color: transparent;
    box-shadow: var(--mk-shadow);
  }
  .title {
    margin: 0;
    font-family: var(--mk-font-display);
    font-size: calc(var(--mk-text-size) * 1.05);
    font-weight: 600;
    color: var(--mk-ink);
  }
</style>
