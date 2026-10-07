<script lang="ts">
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconClose, IconWindow } from "#lib/icons.js";
  import { appear, dur } from "../motion/curves.svelte";
  import { land } from "../motion/share.svelte";
  import {
    type PendingSelection,
    selectionLabel,
    selectionShare,
  } from "./selection";

  let {
    selection,
    onedit,
    onremove,
    anchor = $bindable(),
  }: {
    selection: PendingSelection;
    onedit: () => void;
    onremove: () => void;
    anchor?: HTMLButtonElement;
  } = $props();
  const label = $derived(selectionLabel(selection.element));
  const source = $derived(selection.element.source);
</script>

<span
  class="selection-chip"
  data-flip="pop"
  {@attach land(() => selectionShare(selection.element), {
    ms: dur("--dur-pop"),
  })}
>
  <button
    aria-label={`Edit selection… ${label}`}
    class="body touch-hit"
    onclick={onedit}
    type="button"
    bind:this={anchor}
  >
    <!-- The thumbnail's slot holds its size while the element is still being
         drawn, and the screenshot fades into it when it lands. -->
    {#if selection.png}
      <span class="thumb"
        ><img
          alt=""
          src={`data:image/png;base64,${selection.png}`}
          in:appear
        ></span
      >
    {:else if selection.capturing}
      <span class="thumb" data-capturing></span>
    {:else}
      <span class="mark"><IconWindow /></span>
    {/if}
    <span class="lines">
      <span class="name">{label}</span>
      <span class:source={!selection.note}
        >{selection.note ||
          (source?.file ? `${source.file}:${source.line ?? "?"}` : "")}</span
      >
    </span>
  </button>
  <Tip label="Remove selection">
    {#snippet children(
      tip
    )}
      <button
        {...tip}
        aria-label="Remove selection"
        class="remove touch-hit"
        onclick={onremove}
        type="button"
      >
        <IconClose />
      </button>
    {/snippet}
  </Tip>
</span>

<style>
  /* The body and the remove button touch: their touch areas meet at the
     seam. */
  .selection-chip {
    --hit-gap-x: 0px;
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-2);
  }
  button {
    border: 0;
    background: transparent;
    color: var(--ink-strong);
    cursor: pointer;
    border-radius: var(--radius-xs);
  }
  .body {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0;
    min-width: 0;
    text-align: left;
  }
  .thumb,
  .mark {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: var(--radius-xs);
  }
  .thumb {
    display: block;
    overflow: hidden;
    background: var(--surface-recess);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .mark {
    display: grid;
    place-items: center;
    background: var(--mark-overlay), var(--mark-6);
    color: var(--mark-glyph);
  }
  .mark :global(svg) {
    width: 16px;
    height: 16px;
  }
  .lines {
    display: flex;
    flex-direction: column;
    min-width: 0;
    max-width: 220px;
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    line-height: var(--leading-ui);
    color: var(--ink-muted);
  }
  .lines > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    color: var(--ink-strong);
  }
  .source {
    font-family: var(--font-mono);
    font-size: var(--text-meta);
  }
  .remove {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;

    & :global(svg) {
      inline-size: 16px;
      block-size: 16px;
    }
  }
  @media (hover: hover) {
    button:hover {
      background: var(--surface-hover);
    }
  }
</style>
