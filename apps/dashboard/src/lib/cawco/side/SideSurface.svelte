<script lang="ts">
  /**
   * The card beside a conversation (SideSplit), one for whatever it holds:
   * the plan or the preview. One header, one well:
   * - the header leads with the Plan | Preview switch while both are there,
   *   then what is on show (`title`, `subtitle`): the words the switch does
   *   not already say, so "Preview" or "Plan" is never said twice; then the
   *   pane's own controls (`actions`) and Close, every one in the same
   *   button recipe and press;
   * - the well is the content's ground, the recess inside a hairline, its
   *   left edge the header's: a page's (the preview's). Text that reads on
   *   the card itself (the plan's) stands on the card, with no well
   *   (`recessed={false}`).
   * A pane passes its own content and controls; the frame is this one.
   */
  import type { Snippet } from "svelte";
  import PendingContent, {
    whileIdle,
  } from "#lib/components/ui/button/pending-content.svelte";
  import { IconClose } from "#lib/icons.js";

  let {
    label,
    switcher,
    title,
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
</script>

<section aria-label={label} class="side-card {className}" bind:this={section}>
  <header class="side-head">
    {#if switcher}
      {@render switcher()}
    {/if}
    <div class="identity">
      {#if title}
        <span class="title">{title}</span>
      {/if}
      {#if subtitle}
        <span class="subtitle">{subtitle}</span>
      {/if}
    </div>
    {@render actions?.()}
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
  }
  .side-head:has(:global([role="tablist"])) .identity {
    padding-inline-start: var(--space-1);
  }
  .title,
  .subtitle {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .title {
    color: var(--ink-strong);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
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
</style>
