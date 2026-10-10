<script lang="ts">
  /**
   * One notice as a row of Caw's panel (NeedsCaw): its leading mark, what it
   * says beside it, and its ✕, the update toast's 20px pill chip on the
   * mark's top corner (DESIGN.md, Update notice). The ✕ is the one way it
   * leaves: acknowledging is global (`notices.acknowledge`), so there is no
   * swipe and no light dismiss of a single notice. A mouse finds the ✕ on
   * hover or focus; touch, which has no hover, always sees it.
   */
  import type { Snippet } from "svelte";
  import { IconClose } from "#lib/icons.js";

  let {
    label,
    dismissLabel,
    ondismiss,
    lead,
    children,
  }: {
    label: string;
    dismissLabel: string;
    /** Absent while the row says its goodbye: nothing is left to dismiss. */
    ondismiss?: () => void;
    lead: Snippet;
    children: Snippet;
  } = $props();
</script>

<article aria-label={label} class="notice" data-flip="box">
  <span class="lead">
    {@render lead()}
    {#if ondismiss}
      <button
        aria-label={dismissLabel}
        class="x touch-hit pointer-hit"
        onclick={ondismiss}
        type="button"
      >
        <IconClose aria-hidden="true" class="size-3" />
      </button>
    {/if}
  </span>
  <div class="body">{@render children()}</div>
</article>

<style>
  .notice {
    position: relative;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    column-gap: var(--space-3);
    align-items: start;
    min-block-size: 44px;
    padding: var(--space-3);
  }
  .lead {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  /* The toast's close chip, on the mark's top corner, out of the text's way. */
  .x {
    --hit-edge: 1px;
    position: absolute;
    inset-block-start: -8px;
    inset-inline-start: -8px;
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    padding: 0;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-muted);
    cursor: pointer;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .x {
      opacity: 0;
    }
    .notice:hover .x,
    .notice:focus-within .x {
      opacity: 1;
    }
    .x:hover {
      color: var(--ink-strong);
    }
  }
</style>
