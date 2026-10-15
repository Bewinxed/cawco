<svelte:options css="injected" />

<script lang="ts">
  /** Text: words in one of the text roles, in one of the tones; plain text only. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
  }: OpenUIRenderProps<{ text: unknown; role?: string; tone?: string }> =
    $props();
</script>

<p
  class="text"
  data-mk="Text"
  data-role={props.role ?? "body"}
  data-tone={props.tone ?? "ink"}
>
  {textOf(props.text)}
</p>

<style>
  .text {
    margin: 0;
    font-family: var(--mk-font-body);
    font-size: var(--mk-text-size);
    line-height: 1.5;
    color: var(--mk-ink);
    text-wrap: pretty;
  }
  .text[data-role="display"],
  .text[data-role="title"],
  .text[data-role="heading"] {
    font-family: var(--mk-font-display);
    line-height: 1.2;
    text-wrap: balance;
  }
  .text[data-role="display"] {
    font-size: calc(var(--mk-text-size) * 2.25);
    font-weight: 700;
  }
  .text[data-role="title"] {
    font-size: calc(var(--mk-text-size) * 1.5);
    font-weight: 650;
  }
  .text[data-role="heading"] {
    font-size: calc(var(--mk-text-size) * 1.15);
    font-weight: 600;
  }
  .text[data-role="label"] {
    font-size: calc(var(--mk-text-size) * 0.875);
    font-weight: 600;
  }
  .text[data-role="meta"] {
    font-size: calc(var(--mk-text-size) * 0.8125);
    color: var(--mk-muted);
  }
  .text[data-tone="muted"] {
    color: var(--mk-muted);
  }
  .text[data-tone="accent"] {
    color: var(--mk-accent);
  }
  .text[data-tone="positive"] {
    color: var(--mk-positive);
  }
  .text[data-tone="caution"] {
    color: var(--mk-caution);
  }
  .text[data-tone="critical"] {
    color: var(--mk-critical);
  }
</style>
