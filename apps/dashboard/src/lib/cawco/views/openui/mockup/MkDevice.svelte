<svelte:options css="injected" />

<script lang="ts">
  /**
   * Device: a frame the size of a screen, its children the screen inside: a
   * desk window (its title bar), a tablet, or a phone (its status bar).
   */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    kind: string;
    children: unknown[];
    title?: unknown;
  }> = $props();
  const kind = $derived(
    props.kind === "phone" || props.kind === "tablet" ? props.kind : "desk"
  );
</script>

<div class="device" data-kind={kind} data-mk="Device">
  {#if kind === "desk"}
    <div class="bar">{textOf(props.title)}</div>
  {:else}
    <div class="status">
      <span>9:41</span><span class="app">{textOf(props.title)}</span>
    </div>
  {/if}
  <div class="screen">{@render renderNode(props.children)}</div>
</div>

<style>
  .device {
    display: flex;
    flex-direction: column;
    flex: none;
    align-self: flex-start;
    max-inline-size: 100%;
    overflow: hidden;
    border: 1px solid var(--mk-line);
    background: var(--mk-canvas);
    box-shadow: var(--mk-shadow);
    font-family: var(--mk-font-body);
  }
  .device[data-kind="desk"] {
    inline-size: 1200px;
    min-block-size: 720px;
    border-radius: var(--mk-radius);
  }
  .device[data-kind="tablet"] {
    inline-size: 820px;
    min-block-size: 1080px;
    border-radius: calc(var(--mk-radius) * 2.5);
  }
  .device[data-kind="phone"] {
    inline-size: 390px;
    block-size: 844px;
    border-radius: calc(var(--mk-radius) * 4);
  }
  .bar {
    padding: calc(var(--mk-space) * 2.5) calc(var(--mk-space) * 4);
    border-block-end: 1px solid var(--mk-line);
    background: var(--mk-surface);
    color: var(--mk-muted);
    font-size: calc(var(--mk-text-size) * 0.8125);
    font-weight: 600;
    text-align: center;
  }
  .status {
    display: flex;
    justify-content: space-between;
    padding: calc(var(--mk-space) * 3.5) calc(var(--mk-space) * 7)
      calc(var(--mk-space) * 2);
    color: var(--mk-ink);
    font-size: calc(var(--mk-text-size) * 0.875);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .app {
    color: var(--mk-muted);
  }
  .screen {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-block-size: 0;
    overflow: auto;
  }
</style>
