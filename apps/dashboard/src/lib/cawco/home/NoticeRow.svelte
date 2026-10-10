<script lang="ts">
  /**
   * One notice as a row of Caw's panel (NeedsCaw): its leading mark in the
   * panel's one lead column, what it says in its one text column, and its ✕
   * in the first line's trailing cell, where lists put a row's dismiss
   * (Windows, Slack, Linear, GitHub). Only that cell is the ✕'s: every line
   * under the first, a footer's buttons too, runs to the row's trailing
   * edge, the panel's one trailing edge. The first line keeps the ✕'s room
   * clear (`--x-room`, which each caller's first line pads by).
   *
   * The ✕ is the one way it leaves: acknowledging is global
   * (`notices.acknowledge`), so there is no swipe and no light dismiss of a
   * single notice. It always shows, to a mouse as to a finger, so leaving is
   * never something to find; under the pointer it takes the kit's hover
   * fill and strong ink. A finger gets a 44px area (`touch-hit`).
   *
   * `nested`: an entry of a group of notices (MovedLogins), the same columns
   * with less air above and below.
   */
  import type { Snippet } from "svelte";
  import { IconClose } from "#lib/icons.js";

  let {
    label,
    dismissLabel,
    ondismiss,
    nested = false,
    lead,
    children,
  }: {
    label: string;
    dismissLabel: string;
    /** Absent while the row says its goodbye: nothing is left to dismiss. */
    ondismiss?: () => void;
    nested?: boolean;
    lead: Snippet;
    children: Snippet;
  } = $props();
</script>

<article
  aria-label={label}
  class={["notice", nested && "nested"]}
  data-flip="box"
>
  <span class="lead">{@render lead()}</span>
  <div class="body">{@render children()}</div>
  {#if ondismiss}
    <span class="end">
      <button
        aria-label={dismissLabel}
        class="x touch-hit pointer-hit"
        onclick={ondismiss}
        type="button"
      >
        <IconClose aria-hidden="true" class="size-3" />
      </button>
    </span>
  {/if}
</article>

<style>
  .notice {
    --pad-block: var(--space-3);
    position: relative;
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr);
    column-gap: var(--space-3);
    align-items: start;
    min-block-size: 44px;
    padding: var(--pad-block) var(--space-3);
  }
  /* An entry of a group: the same columns, less air between entries. */
  .nested {
    --pad-block: var(--space-1);
    min-block-size: 0;
  }
  .lead {
    display: grid;
    place-items: center;
    inline-size: 28px;
    block-size: 28px;
  }
  /* The first line pads by `--x-room` so its words stop short of the ✕. */
  .body {
    --x-room: calc(24px + var(--space-2));
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-inline-size: 0;
  }
  /* The first line's trailing cell: the label line's middle, at the row's
     trailing edge. */
  .end {
    position: absolute;
    inset-block-start: calc(var(--pad-block) + (1lh - 24px) / 2);
    inset-inline-end: var(--space-3);
    display: flex;
    font: var(--type-label);
  }
  /* An entry's first line is in body type: the ✕ centres on that. */
  .nested > .end {
    font: var(--type-body);
  }
  .x {
    --hit-edge: 0px;
    display: grid;
    place-items: center;
    inline-size: 24px;
    block-size: 24px;
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: transparent;
    color: var(--ink-muted);
    cursor: pointer;
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-toggle) var(--ease-out);
  }
  @media (prefers-reduced-motion: no-preference) {
    .x:active {
      transform: scale(var(--press-scale));
    }
  }
  @media (hover: hover) and (pointer: fine) {
    .x:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
</style>
