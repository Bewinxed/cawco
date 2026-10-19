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
   * A pane that gives its controls as `items` has them stand by the head's
   * priority rule (head.ts): the name keeps its width up to 120px, Close
   * stands last, the mode takes its one-button form before it would go,
   * and what doesn't fit goes in head order into one More.
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
  // biome-ignore lint/performance/noNamespaceImport: the kit's compound menu (DropdownMenu.Root, .Item, …), as every menu of the app imports it
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    IconClose,
    IconMaximize,
    IconMinimize,
    IconMore,
  } from "#lib/icons.js";
  import { sideExpand } from "./expand";
  import {
    HEAD_PRIORITY,
    type HeadItem,
    NAME_KEEPS,
    type Standing,
    standing,
  } from "./head";

  let {
    label,
    switcher,
    title,
    titleControl,
    subtitle,
    actions,
    items,
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
    /** The pane's own controls, before Expand and Close, standing by the head's priority rule (head.ts). */
    items?: HeadItem[];
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

  /** The pane's controls and Expand, in head order. */
  const all = $derived<HeadItem[]>(
    items
      ? [
          ...items,
          ...(expand?.available
            ? [
                {
                  key: "expand",
                  priority: HEAD_PRIORITY.expand,
                  bar: expandBar,
                  menu: expandMenu,
                },
              ]
            : []),
        ]
      : []
  );
  let head = $state<HTMLElement>();
  let identity = $state<HTMLElement>();
  /** The controls standing in the head, and how; null until the head is measured: all of them whole. */
  let shown = $state<Map<string, Standing> | null>(null);
  /** The name's own width, up to {@link NAME_KEEPS}: it gives up no more of it to the controls. */
  let nameKeeps = $state(0);
  /** Each control's width as last drawn in the head, whole (`key`) and in its one-button form (`key:compact`): what a control in More would take back. */
  const widths = new Map<string, number>();
  const stands = (key: string) => shown === null || shown.has(key);
  const formOf = (key: string): Standing => shown?.get(key) ?? "whole";
  const more = $derived(all.filter((one) => !stands(one.key)));
  /** The count a control in More says on it (Comments'), only above 0 (The Earned Count Rule). */
  const moreCount = $derived(
    more.find((one) => one.count && one.count.n > 0)?.count
  );

  /** How far a box's text runs past it (a truncated name's): its own width is that much more. */
  const runsPast = (el: Element): number =>
    Math.max(
      0,
      ...[el, ...el.querySelectorAll("*")].map(
        (one) => one.scrollWidth - one.clientWidth
      )
    );

  /** The head's room inside its padding, and its gap. */
  function roomOf(el: HTMLElement): { gap: number; room: number } {
    const style = getComputedStyle(el);
    const px = (value: string) => Number.parseFloat(value) || 0;
    return {
      gap: px(style.columnGap),
      room:
        el.clientWidth -
        px(style.paddingInlineStart) -
        px(style.paddingInlineEnd),
    };
  }

  /** What always stands (the switch, Close), and More, as drawn; each control's width kept while it stands. */
  function drawnWidths(el: HTMLElement, name: HTMLElement) {
    const kept: number[] = [];
    let moreWidth = 0;
    for (const child of el.children) {
      const one = child as HTMLElement;
      const { width } = one.getBoundingClientRect();
      const item = one.dataset.headItem;
      if (item && !one.hidden) {
        widths.set(
          one.dataset.form === "compact" ? `${item}:compact` : item,
          width
        );
      } else if (one.dataset.slot === "more") {
        moreWidth = width;
      } else if (!item && one !== name) {
        kept.push(width);
      }
    }
    return { kept, moreWidth };
  }

  /** The name's box at its lead's own width, up to {@link NAME_KEEPS}: its inset and ring room around it. */
  function nameWidth(name: HTMLElement): number {
    const lead = name.firstElementChild;
    const style = getComputedStyle(name);
    const pad =
      (Number.parseFloat(style.paddingInlineStart) || 0) +
      (Number.parseFloat(style.paddingInlineEnd) || 0);
    const own = lead
      ? lead.getBoundingClientRect().width + runsPast(lead) + pad
      : 0;
    return Math.ceil(Math.min(own, NAME_KEEPS + pad));
  }

  /** The name's margins (they take its ring room back): what it adds to the head beside its box. */
  function nameMargins(name: HTMLElement): number {
    const style = getComputedStyle(name);
    return (
      (Number.parseFloat(style.marginInlineStart) || 0) +
      (Number.parseFloat(style.marginInlineEnd) || 0)
    );
  }

  /** Which controls stand, from the head's room and what each was drawn at. */
  function fit(): void {
    if (!(head && identity)) {
      return;
    }
    nameKeeps = nameWidth(identity);
    if (all.length === 0) {
      return;
    }
    const { gap, room } = roomOf(head);
    const { kept, moreWidth } = drawnWidths(head, identity);
    // More is Close's recipe, its glyph alone, until it stands to be read.
    const next = standing(
      room,
      gap,
      [...kept, nameKeeps + nameMargins(identity)],
      moreWidth || (kept.at(-1) ?? 0),
      all.map((one) => ({
        key: one.key,
        priority: one.priority,
        width: widths.get(one.key) ?? 0,
        // Not drawn yet: Close's width, the recipe's glyph alone.
        ...(one.compact
          ? { compact: widths.get(`${one.key}:compact`) ?? kept.at(-1) ?? 0 }
          : {}),
      }))
    );
    const was = shown;
    if (
      !was ||
      next.size !== was.size ||
      [...next].some(([key, form]) => was.get(key) !== form)
    ) {
      shown = next;
    }
  }

  // The head, the name and every control re-fit as any of them changes size;
  // with no `items`, the name alone is measured, so it keeps its width
  // beside a pane's `actions` too.
  $effect(() => {
    const el = head;
    // Read so a pane's items arriving re-observes its controls.
    const _count = all.length;
    if (!el) {
      return;
    }
    const seen = new ResizeObserver(() => fit());
    seen.observe(el);
    for (const child of el.querySelectorAll(
      ":scope > [data-head-item], :scope > .identity > *"
    )) {
      seen.observe(child);
    }
    return () => seen.disconnect();
  });
</script>

{#snippet expandBar()}
  {#if expand}
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
{/snippet}

{#snippet expandMenu()}
  {#if expand}
    <DropdownMenu.Item onSelect={() => expand.toggle()}>
      {#if expanded}
        <IconMinimize /><span>{expand.backLabel}</span>
      {:else}
        <IconMaximize /><span>Expand</span>
      {/if}
    </DropdownMenu.Item>
  {/if}
{/snippet}

<section
  data-side-surface-class={className}
  data-slot="side-card"
  data-side-surface-expanded={expanded || undefined}
  aria-label={label}
  class="side-card {className}"
  bind:this={section}
  class:expanded
  class:recessed
>
  <!-- mark-line: its icons are controls at the head's end, each its own
       button, not marks set beside the title -->
  <header
    data-slot="side-head"
    class="side-head"
    class:fitted={all.length > 0}
    bind:this={head}
  >
    {#if switcher}
      {@render switcher()}
    {/if}
    <div
      style:min-inline-size="{nameKeeps}px"
      class="identity"
      class:controlled={!!titleControl}
      bind:this={identity}
    >
      {#if titleControl}
        {@render titleControl()}
      {:else if title}
        <span data-slot="title" class="title">{title}</span>
      {/if}
      {#if subtitle}
        <!-- One line under the name, cut with an ellipsis; whole in its tooltip. -->
        <span data-slot="subtitle" class="subtitle" title={subtitle}
          >{subtitle}</span
        >
      {/if}
    </div>
    {@render actions?.()}
    {#each all as one (one.key)}
      <div
        data-form={formOf(one.key)}
        data-head-item={one.key}
        class="head-item"
        hidden={!stands(one.key)}
      >
        {#if one.compact && formOf(one.key) === "compact"}
          {@render one.compact()}
        {:else}
          {@render one.bar()}
        {/if}
      </div>
    {/each}
    {#if more.length > 0}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          data-slot="more"
          aria-label={moreCount
            ? `More, ${moreCount.of} ${moreCount.n} open`
            : "More"}
          class="more mark-line"
          title="More"
        >
          <IconMore />
          {#if moreCount}
            <span class="more-count">{moreCount.n}</span>
          {/if}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-56">
          {#each more as one, at (one.key)}
            {#if at > 0 && (one.group || more[at - 1]?.group)}
              <DropdownMenu.Separator />
            {/if}
            {@render one.menu()}
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
    {#if !items && expand?.available}
      {@render expandBar()}
    {/if}
    <button
      data-slot="close"
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
    <div data-slot="side-well" class="side-well" bind:this={well}>
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
  /* A head whose controls stand by priority (head.ts): each control keeps
     its own width, and under a finger the controls open to the 44px pitch
     their touch areas need (The 44 Touch Rule), so fewer stand and the rest
     go to More. */
  .head-item:not([hidden]) {
    display: flex;
    flex: none;
  }
  @media (pointer: coarse) {
    .side-head.fitted {
      --hit-gap-x: var(--space-4);
      gap: var(--space-4);
    }
  }
  /* More says the open comments it holds, as Comments does. */
  .more-count {
    min-inline-size: 1ch;
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  /* The header's first thing, the switch or the title, stands on the
     well's edge, with or without the switch. After the switch, a gap. */
  /* The name keeps its own width up to NAME_KEEPS (`min-inline-size`, set
     from its lead as drawn), beside `items` and `actions` alike, so the
     actions never draw over it; past that only the name's own box gives,
     its trailing text cut with an ellipsis inside it. Each child stands at
     its own width, never wider than the group. */
  .identity {
    /* The title's text stands where the controls' text does: their inset. */
    --inset: var(--space-2);
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    /* Whatever the name holds is cut at its own box, never drawn under the
       actions; the box reaches a focus ring's width (2px + 2px offset) past
       the name on every side, the margin taking it back, so a title
       control's ring is not cut. */
    overflow: hidden;
    margin: calc(-1 * var(--space-1));
    padding: var(--space-1);
    padding-inline-start: calc(var(--inset) + var(--space-1));

    & > * {
      max-inline-size: 100%;
    }
  }
  .side-head:has(:global([role="tablist"])) .identity {
    --inset: var(--space-1);
  }
  /* A title control's own padding is its text's inset, as the controls'. */
  .identity.controlled {
    --inset: 0px;
  }
  /* A pane's own `actions` keep their width: the name gives, not they. */
  .side-head > :global(:is(button, a)) {
    flex: none;
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
  /* What is on show, described: the meta role. */
  .subtitle {
    color: var(--ink-muted);
    font: var(--type-meta);
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
    /* The UA's button face reset as longhands, not the `font` shorthand: a
       control's own numeric variant (PreviewPane's Comments count) stands. */
    font-family: inherit;
    font-style: inherit;
    line-height: inherit;
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
    /* `[data-pressed]`: a kit menu Trigger keeps its press while its menu takes focus (f5082a811). */
    .side-head
      :global(:is(button, a):not([role="tab"]):is(:active, [data-pressed])) {
      transform: scale(var(--press-scale));
    }
  }
  /* A pressed button stands a step past the hover by day (the kit Toggle's
     on state), and keeps it under the pointer. */
  .side-head :global(button[aria-pressed="true"]:not([role="tab"])) {
    background: var(--surface-pressed);
    color: var(--ink-strong);
  }
  .side-head :global(button:disabled) {
    opacity: 0.5;
  }
  @media (hover: hover) {
    .side-head
      :global(:is(button, a):not([role="tab"], [aria-pressed="true"]):hover) {
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
