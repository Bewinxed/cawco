<script lang="ts">
  /**
   * The card beside a conversation (SideSplit), one for whatever it holds:
   * the plan or the preview. One header, one well:
   * - the header leads with the Plan | Preview switch while both are there,
   *   then what is on show (`title`, `subtitle`): the words the switch does
   *   not already say, so "Preview" or "Plan" is never said twice; then the
   *   pane's own controls (`actions`), Expand on a desk (expand.ts) and
   *   Close, every one in the same button recipe and press;
   * - the well is the content's ground, the recess inside a hairline, its
   *   left edge the header's: a page's (the preview's). Text that reads on
   *   the card itself (the plan's) stands on the card, with no well
   *   (`recessed={false}`).
   * A pane passes its own content and controls; the frame is this one.
   *
   * Expanded over the whole split, the card meets its edges: no inset,
   * corner or shadow, and the well's sides go, so a page is drawn at the
   * split's full width. The head keeps its place, so the control just
   * pressed is still under the pointer to press back.
   */
  import type { Snippet } from "svelte";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { IconClose, IconMaximize, IconMinimize } from "#lib/icons.js";
  import { sideExpand } from "./expand";

  let {
    label,
    switcher,
    title,
    titleControl,
    subtitle,
    actions,
    onclose,
    closing = false,
    closeFailed = false,
    recessed = true,
    class: className = "",
    well = $bindable(),
    section = $bindable(),
    children,
  }: {
    /** What the card is, read out. */
    label: string;
    /** The Plan | Preview switch, while both are there. */
    switcher?: Snippet;
    /** What is on show, past what the switch says; nothing when it says it all. */
    title?: string;
    /** What is on show as a control (the artifact panel's menu), in the title's place. */
    titleControl?: Snippet;
    subtitle?: string;
    /** The pane's own controls, before Close. */
    actions?: Snippet;
    onclose: () => void | Promise<void>;
    closing?: boolean;
    closeFailed?: boolean;
    /** The content stands in the well; false: on the card itself. */
    recessed?: boolean;
    class?: string;
    well?: HTMLDivElement;
    section?: HTMLElement;
    /** The well's content. */
    children: Snippet;
  } = $props();
  /** The split's Expand, on a desk; none in a sheet or the artifact's own tab. */
  const expand = sideExpand();
  const expanded = $derived(!!expand?.expanded);
</script>

<section
  aria-label={label}
  class="side-card {className}"
  bind:this={section}
  class:expanded
  class:recessed
>
  <header class="side-head">
    {#if switcher}
      {@render switcher()}
    {/if}
    <div class="identity" class:controlled={!!titleControl}>
      {#if titleControl}
        {@render titleControl()}
      {:else if title}
        <span class="title">{title}</span>
      {/if}
      {#if subtitle}
        <span class="subtitle">{subtitle}</span>
      {/if}
    </div>
    {@render actions?.()}
    {#if expand?.available}
      <button
        aria-keyshortcuts={expanded ? "Escape" : undefined}
        aria-label={expanded ? "Back to conversation" : "Expand"}
        class="touch-hit"
        onclick={() => expand.toggle()}
        title={expanded ? "Back to conversation (Esc)" : "Expand"}
        type="button"
      >
        {#if expanded}
          <IconMinimize />
        {:else}
          <IconMaximize />
        {/if}
      </button>
    {/if}
    <button
      aria-busy={closing || undefined}
      aria-disabled={closing || undefined}
      aria-label="Close"
      class="close touch-hit"
      onclick={whileIdle(() => closing, onclose)}
      title="Close"
      type="button"
    >
      <PendingContent failed={closeFailed} icon={IconClose} pending={closing} />
    </button>
  </header>
  {#if recessed}
    <div class="side-well" bind:this={well}>
      {@render children()}
    </div>
  {:else}
    {@render children()}
  {/if}
</section>

<style>
  .side-card {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    height: 100%;
    padding: 0 var(--space-2) var(--space-2);
    background: var(--surface-raised);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-drawer);
  }
  /* One header: its first word, the switch's or the title's, stands on the
     well's left edge. */
  .side-head {
    --hit-gap-x: var(--space-1);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    height: 44px;
    flex-shrink: 0;
  }
  /* The header's first thing, the switch or the title, stands on the
     well's edge, with or without the switch. After the switch, a gap. */
  .identity {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    /* The title's text stands where the controls' text does: their inset. */
    padding-inline-start: var(--space-2);
  }
  .side-head:has(:global([role="tablist"])) .identity {
    padding-inline-start: var(--space-1);
  }
  /* A title control's own padding is its text's inset, as the controls'. */
  .identity.controlled {
    align-items: flex-start;
    padding-inline-start: 0;
  }
  .title,
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* What is on show is a name in a toolbar row of 30px label-type
     controls and the switch's label-type tabs: the label role (DESIGN.md,
     The Role, Not Size Rule). The title role is a sheet's own head
     (.kit-sheet-head), which stands over its content, not in a bar. */
  .title {
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .subtitle {
    color: var(--ink-muted);
    font: var(--text-meta) var(--font-mono);
  }
  /* Every control in the header, the pane's and Close: one recipe, one
     press. */
  .side-head :global(:is(button, a):not([role="tab"])) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-width: 30px;
    height: 30px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--ink-muted);
    background: transparent;
    cursor: pointer;
    text-decoration: none;
    font: inherit;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out),
      transform var(--dur-control) var(--ease-out),
      opacity var(--dur-control) var(--ease-in-out);
  }
  .close {
    --btn-icon: 16px;
  }
  .side-head :global(:is(button, a):not([role="tab"]) svg) {
    width: 16px;
    height: 16px;
  }
  @media (prefers-reduced-motion: no-preference) {
    .side-head :global(:is(button, a):not([role="tab"]):active) {
      transform: scale(var(--press-scale));
    }
  }
  .side-head :global(button[aria-pressed="true"]:not([role="tab"])) {
    background: var(--surface-fill);
    color: var(--ink-strong);
  }
  .side-head :global(button:disabled) {
    opacity: 0.5;
  }
  @media (hover: hover) {
    .side-head :global(:is(button, a):not([role="tab"]):hover) {
      background: var(--surface-hover);
    }
  }
  /* The content's ground: a well inside its edge (surface-well, border-well:
     the recess and hairline by day, deeper with a clear edge at night). */
  .side-well {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-well);
    border-radius: var(--radius-sm);
    background: var(--surface-well);
  }
  /* Expanded: the card meets the split's edges and the well its sides, so
     a page is drawn at the full width. The head's inset is the card's and
     the split's, as before, so its controls hold still while it goes. */
  .side-card.expanded {
    padding: var(--space-3) 0 0;
    border-radius: 0;
    box-shadow: none;
  }
  .side-card.expanded.recessed .side-head {
    padding-inline: calc(var(--space-3) + var(--space-2));
  }
  /* Text on the card itself (the plan's) keeps its inset off the edges. */
  .side-card.expanded:not(.recessed) {
    padding-inline: calc(var(--space-3) + var(--space-2));
  }
  .side-card.expanded .side-well {
    border-width: 1px 0 0;
    border-radius: 0;
  }
  /* The card's edges go on the split's slide (SideSplit); under a drag they
     go as the panes do, at once. */
  @media (prefers-reduced-motion: no-preference) {
    :global(.sliding) .side-card,
    :global(.sliding) .side-head,
    :global(.sliding) .side-well {
      transition:
        padding var(--dur-panel) var(--ease-drawer),
        border-radius var(--dur-panel) var(--ease-drawer),
        border-width var(--dur-panel) var(--ease-drawer),
        box-shadow var(--dur-panel) var(--ease-drawer);
    }
  }
</style>
