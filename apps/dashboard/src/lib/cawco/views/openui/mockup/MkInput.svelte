<svelte:options css="injected" />

<script lang="ts">
  /** Input: a field with its label, holding its value or showing its placeholder; inert. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
  }: OpenUIRenderProps<{
    label?: unknown;
    value?: unknown;
    placeholder?: unknown;
    multiline?: boolean;
  }> = $props();
  const value = $derived(textOf(props.value));
</script>

<div class="input" data-mk="Input" inert>
  {#if textOf(props.label)}
    <span class="label">{textOf(props.label)}</span>
  {/if}
  <span
    class="field"
    data-empty={value ? undefined : ""}
    data-multiline={props.multiline ? "" : undefined}
    >{value || textOf(props.placeholder)}</span
  >
</div>

<style>
  .input {
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 1.5);
    min-inline-size: 0;
  }
  .label {
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.875);
    font-weight: 600;
    color: var(--mk-ink);
  }
  .field {
    display: block;
    min-block-size: calc(var(--mk-space) * 10);
    padding: calc(var(--mk-space) * 2.25) calc(var(--mk-space) * 3);
    border: 1px solid var(--mk-line);
    border-radius: var(--mk-radius-small);
    background: var(--mk-sunken);
    color: var(--mk-ink);
    font-family: var(--mk-font-body);
    font-size: var(--mk-text-size);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .field[data-empty] {
    color: var(--mk-muted);
  }
  .field[data-multiline] {
    min-block-size: calc(var(--mk-space) * 24);
    white-space: pre-wrap;
  }
</style>
