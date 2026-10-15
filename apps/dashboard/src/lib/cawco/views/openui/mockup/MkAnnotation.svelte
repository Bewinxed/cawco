<svelte:options css="injected" />

<script lang="ts">
  /**
   * Annotation: one part of the mockup outlined, its number on the
   * outline's corner and the note under it; a part that `changed` is ringed
   * in the caution role, not the accent.
   */
  import type { OpenUIRenderProps } from "../OpenUiRenderer.svelte";
  import { textOf } from "./context";

  let {
    props,
    renderNode,
  }: OpenUIRenderProps<{
    child: unknown;
    note: unknown;
    number?: number;
    changed?: boolean;
  }> = $props();
</script>

<figure
  class="annotation"
  data-changed={props.changed ? "" : undefined}
  data-mk="Annotation"
>
  <div class="part">
    {@render renderNode(props.child)}
    {#if props.number !== undefined}
      <span aria-hidden="true" class="number">{props.number}</span>
    {/if}
  </div>
  <figcaption class="note">
    {#if props.number !== undefined}<b>{props.number}.</b>{/if}
    {textOf(props.note)}
  </figcaption>
</figure>

<style>
  .annotation {
    --ring: var(--mk-accent);
    display: flex;
    flex-direction: column;
    gap: calc(var(--mk-space) * 2);
    min-inline-size: 0;
    margin: 0;
  }
  .annotation[data-changed] {
    --ring: var(--mk-caution);
  }
  .part {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: calc(var(--mk-space) * 1.5);
    border-radius: var(--mk-radius-small);
    outline: 2px dashed var(--ring);
    outline-offset: 2px;
  }
  .number {
    position: absolute;
    inset-block-start: calc(var(--mk-space) * -3);
    inset-inline-start: calc(var(--mk-space) * -3);
    display: inline-grid;
    place-items: center;
    inline-size: calc(var(--mk-space) * 6);
    block-size: calc(var(--mk-space) * 6);
    border-radius: 50%;
    background: var(--ring);
    color: var(--mk-on-accent);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.75);
    font-weight: 700;
  }
  .note {
    color: var(--mk-muted);
    font-family: var(--mk-font-body);
    font-size: calc(var(--mk-text-size) * 0.8125);
  }
  .note b {
    color: var(--ring);
  }
</style>
