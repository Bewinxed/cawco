<svelte:options css="injected" />

<script lang="ts">
  /** Switch: on or off, with its label; inert. */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let { props }: OpenUIRenderProps<{ label: unknown; on?: boolean }> = $props();
</script>

<span class="switch" data-mk="Switch" data-on={props.on ? "" : undefined} inert>
  <span aria-hidden="true" class="track"><span class="thumb"></span></span>
  <span class="label">{textOf(props.label)}</span>
</span>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: calc(var(--mk-space) * 2.5);
    font-family: var(--mk-font-body);
    font-size: var(--mk-text-size);
    color: var(--mk-ink);
  }
  .track {
    display: inline-flex;
    flex: none;
    inline-size: calc(var(--mk-space) * 9);
    block-size: calc(var(--mk-space) * 5);
    padding: calc(var(--mk-space) * 0.5);
    border-radius: calc(var(--mk-space) * 5);
    background: var(--mk-line);
  }
  .thumb {
    inline-size: calc(var(--mk-space) * 4);
    block-size: calc(var(--mk-space) * 4);
    border-radius: 50%;
    background: var(--mk-surface);
    box-shadow: var(--mk-shadow);
  }
  .switch[data-on] .track {
    justify-content: flex-end;
    background: var(--mk-accent);
  }
</style>
