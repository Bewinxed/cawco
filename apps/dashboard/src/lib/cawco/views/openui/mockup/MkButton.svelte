<svelte:options css="injected" />

<script lang="ts">
  /** Button: drawn as it looks, in one of its variants; inert, so it does nothing. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
  }: OpenUIRenderProps<{ label: unknown; variant?: string; size?: string }> =
    $props();
</script>

<span
  class="button"
  data-mk="Button"
  data-size={props.size ?? "medium"}
  data-variant={props.variant ?? "secondary"}
  inert>{textOf(props.label)}</span
>

<style>
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    min-block-size: calc(var(--mk-space) * 9);
    padding-inline: calc(var(--mk-space) * 4);
    border: 1px solid var(--mk-line);
    border-radius: var(--mk-radius-small);
    background: var(--mk-surface);
    color: var(--mk-ink);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.9375);
    font-weight: 600;
    white-space: nowrap;
  }
  .button[data-size="small"] {
    min-block-size: calc(var(--mk-space) * 7);
    padding-inline: calc(var(--mk-space) * 3);
    font-size: calc(var(--mk-text-size) * 0.8125);
  }
  .button[data-variant="primary"] {
    border-color: transparent;
    background: var(--mk-accent);
    color: var(--mk-on-accent);
  }
  .button[data-variant="quiet"] {
    border-color: transparent;
    background: transparent;
  }
  .button[data-variant="danger"] {
    border-color: transparent;
    background: var(--mk-critical);
    color: var(--mk-on-accent);
  }
</style>
