<svelte:options css="injected" />

<script lang="ts">
  /** Nav: places to go, side by side or one under another, one of them where you are; inert. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
  }: OpenUIRenderProps<{
    items: unknown[];
    active?: number;
    across?: boolean;
  }> = $props();
  const items = $derived(Array.isArray(props.items) ? props.items : []);
</script>

<nav
  class="nav"
  data-across={props.across ? "" : undefined}
  data-mk="Nav"
  inert
>
  {#each items as item, index (index)}
    <span
      class="item"
      aria-current={index === (props.active ?? -1) ? "page" : undefined}
      >{textOf(item)}</span
    >
  {/each}
</nav>

<style>
  .nav {
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 0.5);
    min-inline-size: 0;
  }
  .nav[data-across] {
    flex-direction: row;
    flex-wrap: wrap;
    gap: calc(var(--mk-space) * 1);
  }
  .item {
    padding: calc(var(--mk-space) * 2) calc(var(--mk-space) * 3);
    border-radius: var(--mk-radius-small);
    color: var(--mk-muted);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.9375);
    font-weight: 500;
  }
  .item[aria-current] {
    background: var(--mk-sunken);
    color: var(--mk-ink);
    font-weight: 600;
  }
</style>
