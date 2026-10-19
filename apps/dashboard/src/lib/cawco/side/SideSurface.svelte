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
   * stands last, the controls that fit stand as a priority prefix at their
   * narrowest, the rest going in head order into one More, and forms widen
   * after (the mode's segments, then on a 640px pane the words) where the
   * room left holds them.
   *
   * Expanded over the whole split, the card meets its edges: no inset,
   * corner or shadow, and the well's sides go, so a page is drawn at the
   * split's full width. The head keeps its place, so the control just
   * pressed is still under the pointer to press back.
   */
  import { type Snippet, untrack } from "svelte";
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
    WORDS_FROM,
  } from "./head";

  let {
    label,
    switcher,
    title,
    titleControl,
    subtitle,
    subtitleId,
    subtitleCode = false,
    subtitleStands = $bindable(true),
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
    /** What is on show as a control (the artifact panel's menu), in the title's place; its words that keep their width marked `data-slot="name-lead"`, what trails them cut inside the name's box. */
    titleControl?: Snippet;
    /** One line under it in meta ink (an artifact's ask), cut with an ellipsis, its whole text its title. */
    subtitle?: string;
    /** The line's id, for the control it describes. */
    subtitleId?: string;
    /** The line is an identifier (a task's id), set as code. */
    subtitleCode?: boolean;
    /**
     * Whether the line stands in the head: while the head gives the
     * identity what the line needs by the name's own rule (`NAME_KEEPS`:
     * its own width, up to that), else it is dropped from view for the pane
     * to say elsewhere (the artifact menu's first row).
     */
    subtitleStands?: boolean;
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
  /** Each control's width as last drawn in the head, whole (`key`) and in its narrowest form (`key:compact`), and More's, its glyph alone (`more`) and saying a count (`more:counted`): what a control in More would take back. */
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

  /** What always stands (the switch, Close) as drawn; each control's width, and More's, kept while it stands. */
  function drawnWidths(el: HTMLElement, name: HTMLElement) {
    const kept: number[] = [];
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
        widths.set(
          one.querySelector(".more-count") ? "more:counted" : "more",
          width
        );
      } else if (!item && one !== name) {
        kept.push(width);
      }
    }
    return { kept };
  }

  /**
   * The name's box at its lead's own width, up to {@link NAME_KEEPS}: its
   * inset and ring room around it. The lead is the title, or the part of a
   * title control marked `data-slot="name-lead"` (its words, before a trailing ring
   * or figure that may be cut), else the control whole.
   */
  function nameWidth(name: HTMLElement): number {
    const lead =
      name.querySelector('[data-slot="name-lead"]') ?? name.firstElementChild;
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

  /** The line's own width, up to {@link NAME_KEEPS}: what it needs to stand, by the name's rule. */
  function lineNeeds(line: HTMLElement): number {
    return Math.ceil(Math.min(line.scrollWidth, NAME_KEEPS));
  }

  /** Which controls stand, from the head's room and what each was drawn at. */
  function fit(): void {
    if (!(head && identity)) {
      return;
    }
    nameKeeps = nameWidth(identity);
    const line = identity.querySelector<HTMLElement>('[data-slot="subtitle"]');
    subtitleStands = !line || identity.clientWidth >= lineNeeds(line);
    if (all.length === 0) {
      return;
    }
    const { gap, room } = roomOf(head);
    const { kept } = drawnWidths(head, identity);
    // More and a form not drawn yet are Close's recipe, its glyph alone,
    // until they stand to be read.
    const glyph = kept.at(-1) ?? 0;
    const moreGlyph = widths.get("more") ?? glyph;
    const next = standing(
      room,
      gap,
      [...kept, nameKeeps + nameMargins(identity)],
      { glyph: moreGlyph, counted: widths.get("more:counted") ?? moreGlyph },
      all.map((one) => ({
        key: one.key,
        priority: one.priority,
        width: widths.get(one.key) ?? 0,
        counted: !!one.count && one.count.n > 0,
        words: one.words,
        ...(one.compact || one.words
          ? { compact: widths.get(`${one.key}:compact`) ?? glyph }
          : {}),
      })),
      // The pane's width: the card's, the head's box inside it.
      head.clientWidth >= WORDS_FROM
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
    if (identity) {
      seen.observe(identity);
    }
    for (const child of el.querySelectorAll(
      ":scope > [data-head-item], :scope > .identity > *"
    )) {
      seen.observe(child);
    }
    return () => seen.disconnect();
  });
  // A new line is measured as it comes, once it is drawn.
  $effect(() => {
    if (subtitle !== undefined) {
      untrack(fit);
    }
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
        <!-- One line under the name, cut with an ellipsis; whole in its tooltip. -->
        <span
          data-slot="subtitle"
          class="subtitle"
          class:code={subtitleCode}
          data-dropped={subtitleStands ? undefined : ""}
          id={subtitleId}
          title={subtitle}>{subtitle}</span
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
      data-side-well
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
  /* The switch's tablist, not the mode's among the controls: the name's
     inset holds while the mode takes its segments back. */
  .side-head:has(:global([role="tablist"]:not(.head-item *))) .identity {
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
  .subtitle.code {
    font: var(--text-meta) var(--font-mono);
  }
  /* A title control with its line under it: the control sizes to its own
     text, so the two stand inside the 44px head. */
  .identity.controlled:has(> .subtitle:not([data-dropped]))
    > :global(:is(button, a)) {
    block-size: auto;
    padding-block: var(--space-1);
  }
  /* Dropped, the line keeps its words for the control it describes and for
     its own measure, out of the flow and out of sight. */
  .subtitle[data-dropped] {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
  }
  /* Every control in the header, the pane's and Close: one recipe, one
     press. */
  .side-head :global(:is(button, a):not([role="tab"])) {
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
  [data-slot="side-head"] :global(:is(button, a):not([role="tab"]) svg) {
    width: var(--icon-md);
    height: var(--icon-md);
  }
  @media (prefers-reduced-motion: no-preference) {
    /* `[data-pressed]`: a kit menu Trigger keeps its press while its menu takes focus (f5082a811). */
    [data-slot="side-head"]
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
  [data-slot="side-head"] :global(button:disabled) {
    opacity: 0.5;
  }
  @media (hover: hover) {
    [data-slot="side-head"]
      :global(:is(button, a):not([role="tab"], [aria-pressed="true"]):hover) {
      background: var(--surface-hover);
    }
  }
</style>
