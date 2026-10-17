<script lang="ts">
  /**
   * The card beside a page (Split), one for whatever it holds: a
   * conversation's plan or preview, a project's task. One header, one well:
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

<!-- Expanded: the card meets the split's edges and the well its sides, so a
     page is drawn at the full width. The head's inset is the card's and the
     split's, as before, so its controls hold still while it goes; text on
     the card itself (the plan's) keeps its inset off the edges. The card's
     edges go on the split's slide (SideSplit); under a drag they go as the
     panes do, at once. -->
<section
  data-side-surface-class={className}
  data-slot="side-card"
  data-side-surface-expanded={expanded || undefined}
  data-expanded-recessed={(expanded && recessed) || undefined}
  data-recessed={recessed || undefined}
  aria-label={label}
  class="group/card @container flex h-full min-h-0 min-w-0 flex-col rounded-lg bg-surface-raised px-space-2 pt-0 pb-space-2 shadow-drawer data-side-surface-expanded:rounded-none data-side-surface-expanded:px-0 data-side-surface-expanded:pt-space-3 data-side-surface-expanded:pb-0 data-side-surface-expanded:shadow-none data-side-surface-expanded:not-data-recessed:px-(--expanded-inset) motion-safe:in-data-split-sliding:transition-[padding,border-radius,border-width,box-shadow] motion-safe:in-data-split-sliding:dur-panel motion-safe:in-data-split-sliding:ease-drawer {className}"
  style:--expanded-inset="calc(var(--space-3) + var(--space-2))"
  bind:this={section}
>
  <!-- One header: its first word, the switch's or the title's, stands on
       the well's left edge. -->
  <!-- literal: 44px, 30px -->
  <!-- mark-line: its icons are controls at the head's end, each its own
       button, not marks set beside the title -->
  <header
    data-slot="side-head"
    class="flex h-(--head-h) shrink-0 items-center gap-space-1 group-data-expanded-recessed/card:px-(--expanded-inset) motion-safe:in-data-split-sliding:transition-[padding,border-radius,border-width,box-shadow] motion-safe:in-data-split-sliding:dur-panel motion-safe:in-data-split-sliding:ease-drawer"
    style:--hit-gap-x="var(--space-1)"
    style:--head-h="44px"
    style:--head-control="30px"
  >
    {#if switcher}
      {@render switcher()}
    {/if}
    <!-- The header's first thing, the switch or the title, stands on the
         well's edge, with or without the switch; after the switch, a gap.
         The title's text stands where the controls' text does: their
         inset. A title control's own padding is its text's inset, as the
         controls'. -->
    <div
      data-controlled={!!titleControl || undefined}
      class="flex min-w-0 flex-1 flex-col ps-space-2 data-controlled:items-start data-controlled:ps-0 [[data-slot=side-head]:has([role=tablist])_&]:ps-space-1"
    >
      {#if titleControl}
        {@render titleControl()}
      {:else if title}
        <!-- What is on show is a name in a toolbar row of 30px label-type
             controls and the switch's label-type tabs: the label role
             (DESIGN.md, The Role, Not Size Rule). The title role is a
             sheet's own head (.kit-sheet-head), which stands over its
             content, not in a bar. -->
        <span data-slot="title" class="truncate text-ink-strong type-label"
          >{title}</span
        >
      {/if}
      {#if subtitle}
        <span
          data-slot="subtitle"
          class="truncate font-mono-meta text-ink-muted">{subtitle}</span
        >
      {/if}
    </div>
    {@render actions?.()}
    {#if expand?.available}
      <button
        aria-keyshortcuts={expanded ? "Escape" : undefined}
        aria-label={expanded ? expand.backLabel : "Expand"}
        class="touch-hit"
        onclick={() => expand.toggle()}
        title={expanded ? `${expand.backLabel} (Esc)` : "Expand"}
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
      data-slot="close"
      aria-busy={closing || undefined}
      aria-disabled={closing || undefined}
      aria-label="Close"
      class="touch-hit"
      style:--btn-icon="var(--icon-md)"
      onclick={whileIdle(() => closing, onclose)}
      title="Close"
      type="button"
    >
      <PendingContent failed={closeFailed} icon={IconClose} pending={closing} />
    </button>
  </header>
  {#if recessed}
    <!-- The content's ground: a well inside its edge (surface-well,
         border-well: the recess and hairline by day, deeper with a clear
         edge at night). -->
    <div
      data-slot="side-well"
      class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border-well bg-surface-well group-data-side-surface-expanded/card:rounded-none group-data-side-surface-expanded/card:border-x-0 group-data-side-surface-expanded/card:border-b-0 motion-safe:in-data-split-sliding:transition-[padding,border-radius,border-width,box-shadow] motion-safe:in-data-split-sliding:dur-panel motion-safe:in-data-split-sliding:ease-drawer"
      bind:this={well}
    >
      {@render children()}
    </div>
  {:else}
    {@render children()}
  {/if}
</section>

<style>
  /* residual: foreign-dom — every control in the header, the pane's
     (`actions`, `titleControl`, the switch's own) and Close: one recipe,
     one press. Most of them are DOM the callers' snippets render. */
  [data-slot="side-head"] :global(:is(button, a):not([role="tab"])) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-width: var(--head-control);
    height: var(--head-control);
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
  [data-slot="side-head"] :global(:is(button, a):not([role="tab"]) svg) {
    width: var(--icon-md);
    height: var(--icon-md);
  }
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="side-head"] :global(:is(button, a):not([role="tab"]):active) {
      transform: scale(var(--press-scale));
    }
  }
  [data-slot="side-head"]
    :global(button[aria-pressed="true"]:not([role="tab"])) {
    background: var(--surface-fill);
    color: var(--ink-strong);
  }
  [data-slot="side-head"] :global(button:disabled) {
    opacity: 0.5;
  }
  @media (hover: hover) {
    [data-slot="side-head"] :global(:is(button, a):not([role="tab"]):hover) {
      background: var(--surface-hover);
    }
  }
</style>
