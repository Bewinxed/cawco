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
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { Button } from "#lib/components/ui/button/index.js";
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
    titleCode = false,
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
    of,
    mode,
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
    /** The title is a path or an identifier (a folder file's path), set as code. */
    titleCode?: boolean;
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
    /** What the card holds, its hook (`data-side-card`): the pane's own name. */
    of?: "preview" | "task" | "file" | "plan";
    /**
     * A page's mode in the well (the preview's): Comment and Draw turn the
     * well's own border the accent, inside its box, never a second ring;
     * Interact leaves it as the page's own. None: the well has no ring.
     */
    mode?: "interact" | "comment" | "draw";
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
          one.querySelector('[data-slot="more-count"]')
            ? "more:counted"
            : "more",
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
    measureFit()?.();
  }

  /**
   * The head measured as it is laid out now: answers the write that stands
   * its name, line and controls by that measure, for the caller to make
   * when nothing it watches is being delivered.
   */
  function measureFit(): (() => void) | null {
    if (!(head && identity)) {
      return null;
    }
    const keeps = nameWidth(identity);
    const line = identity.querySelector<HTMLElement>('[data-slot="subtitle"]');
    const lineFits = !line || identity.clientWidth >= lineNeeds(line);
    const name = () => {
      nameKeeps = keeps;
      subtitleStands = lineFits;
    };
    if (all.length === 0) {
      return name;
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
      [...kept, keeps + nameMargins(identity)],
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
    return () => {
      name();
      const was = shown;
      if (
        !was ||
        next.size !== was.size ||
        [...next].some(([key, form]) => was.get(key) !== form)
      ) {
        shown = next;
      }
    };
  }

  // The head, the name and every control re-fit as any of them changes size;
  // with no `items`, the name alone is measured, so it keeps its width
  // beside a pane's `actions` too. Measured in the observer's callback, where
  // layout is fresh, and written in the next frame's callbacks: the write
  // resizes the very boxes watched here (the name's min width, a control
  // hidden or drawn compact, More coming in), and made inside the delivery
  // it was reported to this observer again at a depth the delivery had
  // passed ("ResizeObserver loop completed with undelivered notifications").
  // That frame's layout then reports what the write changed, once.
  $effect(() => {
    const el = head;
    // Read so a pane's items arriving re-observes its controls.
    const _count = all.length;
    if (!el) {
      return;
    }
    let write: (() => void) | null = null;
    const seen = frameObserver(() => write?.(), {
      read: () => {
        write = measureFit();
      },
    });
    seen.observe(el);
    if (identity) {
      seen.observe(identity);
    }
    for (const child of el.querySelectorAll(
      ':scope > [data-head-item], :scope > [data-slot="identity"] > *'
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
    <Button
      aria-keyshortcuts={expanded ? "Escape" : undefined}
      aria-label={expanded ? expand.backLabel : "Expand"}
      onclick={() => expand.toggle()}
      size="icon-sm"
      title={expanded ? `${expand.backLabel} (Esc)` : "Expand"}
      variant="ghost"
    >
      {#if expanded}
        <IconMinimize />
      {:else}
        <IconMaximize />
      {/if}
    </Button>
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
  data-slot="side-card"
  data-side-card={of}
  data-side-surface-expanded={expanded || undefined}
  data-expanded-recessed={(expanded && recessed) || undefined}
  data-recessed={recessed || undefined}
  aria-label={label}
  class="group/card @container flex h-full min-h-0 min-w-0 flex-col rounded-lg bg-surface-raised px-space-2 pt-0 pb-space-2 shadow-drawer data-side-surface-expanded:rounded-none data-side-surface-expanded:px-0 data-side-surface-expanded:pt-space-3 data-side-surface-expanded:pb-0 data-side-surface-expanded:shadow-none data-side-surface-expanded:not-data-recessed:px-(--expanded-inset) in-data-preview-sheet:h-auto in-data-preview-sheet:max-h-(--card-max) in-data-preview-sheet:flex-1 in-data-preview-sheet:shadow-none motion-safe:in-data-split-sliding:transition-[padding,border-radius,border-width,box-shadow] motion-safe:in-data-split-sliding:duration-(--dur-panel) motion-safe:in-data-split-sliding:ease-drawer"
  style:--expanded-inset="calc(var(--space-3) + var(--space-2))"
  style:--card-max="calc(100% - var(--sheet-hidden, 0px))"
  bind:this={section}
>
  <!-- One header: its first word, the switch's or the title's, stands on
       the well's left edge. -->
  <!-- mark-line: its icons are controls at the head's end, each its own
       button, not marks set beside the title -->
  <header
    data-slot="side-head"
    data-fitted={all.length > 0 || undefined}
    class="flex h-c-btn-h-lg flex-none items-center gap-space-1 hit-gap-x-space-1 coarse:data-fitted:gap-space-5 coarse:data-fitted:hit-gap-x-space-5"
    bind:this={head}
  >
    {#if switcher}
      {@render switcher()}
    {/if}
    <!-- The name keeps its own width up to NAME_KEEPS (`--name-keeps`, set
         from its lead as drawn), so the actions never draw over it; what it
         holds is cut at its own box, which reaches a focus ring's width past
         the name on every side (the negative margin takes it back), so a
         title control's ring is not cut. Its text stands where the controls'
         text does, their inset: a switch before it takes its own inset
         back, and a title control's padding is its text's inset. -->
    <!-- Under a title control, a line standing beneath it (`data-lined`)
         gives the control its height back: it grows to its two lines, a
         `--space-1` above and below. -->
    <div
      data-slot="identity"
      data-controlled={titleControl ? "" : undefined}
      data-switched={switcher ? "" : undefined}
      data-lined={(titleControl && subtitle && subtitleStands) || undefined}
      class="-m-space-1 flex min-w-(--name-keeps) flex-1 flex-col items-start overflow-hidden p-space-1 ps-space-3 *:max-w-full data-switched:ps-space-2 data-controlled:not-data-switched:ps-space-1 data-lined:[&>:is(button,a)]:h-auto data-lined:[&>:is(button,a)]:py-space-1"
      style:--name-keeps="{nameKeeps}px"
      bind:this={identity}
    >
      {#if titleControl}
        {@render titleControl()}
      {:else if title}
        <!-- What is on show is a name in a toolbar row of 30px label-type
             controls and the switch's label-type tabs: the label role
             (DESIGN.md, The Role, Not Size Rule). The title role is a
             sheet's own head (ui/drawer/sheet-head), which stands over its
             content, not in a bar. -->
        <span
          data-slot="title"
          data-code={titleCode || undefined}
          class="truncate text-ink-strong type-label data-code:type-code"
          >{title}</span
        >
      {/if}
      {#if subtitle}
        <!-- One line under the name, cut with an ellipsis; whole in its tooltip. -->
        <span
          data-slot="subtitle"
          data-code={subtitleCode || undefined}
          data-dropped={subtitleStands ? undefined : ""}
          class="truncate type-meta text-ink-muted data-code:type-code data-dropped:pointer-events-none data-dropped:invisible data-dropped:absolute"
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
        class="unhidden:flex unhidden:flex-none"
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
          face="count"
          size={moreCount ? "sm" : "icon-sm"}
          title="More"
          variant="ghost"
        >
          <IconMore />
          {#if moreCount}
            <span data-slot="more-count" class="text-ink-muted num"
              >{moreCount.n}</span
            >
          {/if}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" width="regular">
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
    <Button
      data-slot="close"
      aria-label="Close"
      failed={closeFailed}
      icon={IconClose}
      onclick={onclose}
      pending={closing}
      size="icon-sm"
      title="Close"
      variant="ghost"
    />
  </header>
  {#if recessed}
    <!-- The content's ground: a well inside its edge (surface-well,
         border-well: the recess and hairline by day, deeper with a clear
         edge at night). A page's Comment or Draw mode rings it in the brand
         accent (`brand-solid`, `mode`), 2px inside its box, the ring easing in and out except while the split
         slides, and points a crosshair. -->
    <div
      data-side-well
      data-mode={mode && mode !== "interact" ? mode : undefined}
      data-ringed={mode ? "" : undefined}
      class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-sm border border-border-well bg-surface-well data-ringed:outline-(length:--focus-ring-width) data-ringed:outline-solid data-ringed:not-data-mode:outline-transparent data-ringed:outline-offset-(--focus-ring-inset) data-ringed:not-in-data-split-sliding:transition-[outline-color] data-ringed:not-in-data-split-sliding:duration-(--dur-control) data-ringed:not-in-data-split-sliding:ease-in-out data-mode:cursor-crosshair data-mode:outline-brand-solid group-data-side-surface-expanded/card:rounded-none group-data-side-surface-expanded/card:border-x-0 group-data-side-surface-expanded/card:border-b-0 motion-safe:in-data-split-sliding:transition-[padding,border-radius,border-width,box-shadow] motion-safe:in-data-split-sliding:duration-(--dur-panel) motion-safe:in-data-split-sliding:ease-drawer"
      bind:this={well}
    >
      {@render children()}
    </div>
  {:else}
    {@render children()}
  {/if}
</section>
