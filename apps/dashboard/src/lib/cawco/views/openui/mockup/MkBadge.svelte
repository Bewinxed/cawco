<svelte:options css="injected" />

<script lang="ts">
  /** Badge: a short status label in one of the tones. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: string }> = $props();
</script>

<span
  class="badge mark-line"
  data-mk="Badge"
  data-tone={props.tone ?? "neutral"}><span>{textOf(props.text)}</span></span
>

<style>
  .badge {
    --tone: var(--mk-muted);
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    padding: calc(var(--mk-space) * 0.5) calc(var(--mk-space) * 2);
    border-radius: var(--mk-radius-small);
    background: color-mix(in oklch, var(--tone) 14%, transparent);
    color: var(--tone);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.8125);
    font-weight: 600;
    line-height: 1.4;
    white-space: nowrap;
  }
  .badge[data-tone="accent"] {
    --tone: var(--mk-accent);
  }
  .badge[data-tone="positive"] {
    --tone: var(--mk-positive);
  }
  .badge[data-tone="caution"] {
    --tone: var(--mk-caution);
  }
  .badge[data-tone="critical"] {
    --tone: var(--mk-critical);
  }
</style>
