<script lang="ts">
  /**
   * The card beside a page (Split), one for whatever it holds: a
   * conversation's plan or preview, a project's task. One header, one well:
   * - the header leads with the Plan | Preview switch while both are there,
   *   then what is on show (`title`, `subtitle`): the words the switch does
   *   not already say, so "Preview" or "Plan" is never said twice; then the
   *   pane's own controls (`actions`), Expand on a desk (expand.ts) and
   *   Close, every one in the same button recipe and press;
   * - the well is the content's ground (`surface-well`), the card's whole
   *   width under the head: a page's (the preview's). Text that reads on
   *   the card itself (the plan's) stands on the card, with no well
   *   (`recessed={false}`).
   * A pane passes its own content and controls; the frame is this one.
   *
   * A pane that gives its controls as `items` has them stand by the head's
   * priority rule (head.ts): the name keeps its width up to 120px, Close
   * stands last, the controls that fit stand as a priority prefix at their
   * narrowest, the rest going in head order into one More, then the name
   * takes the rest of its own width (two lines' worth on a phone), and
   * forms widen after (the mode's segments, then on a 640px pane the words)
   * where the room left holds them.
   *
   * The head floats as glass over the card's ground (Adopting Liquid
   * Glass: "Liquid Glass applies to the topmost layer of the interface";
   * DESIGN.md, The Title Bars Follow Liquid Glass Rule): no bar behind it,
   * its groups capsules of glass in the head's room (`--side-room`, the
   * `c-head-room` token), what the card holds running to the card's top
   * beneath it. The content's scroller takes the room as its top padding
   * (`pt-(--side-room)`, never a margin) and names the scroll timeline the
   * head's scroll edge effect plays on (`scroll-timeline-transcript-head`,
   * HeadFade under the head), so at rest its first line clears the head and
   * scrolled it blurs and fades beneath it, as a transcript does under its
   * pane's bar. A page in a frame that is not CawCo's own document stands
   * under the room instead (PreviewPane): its layout is not ours to push
   * down.
   *
   * Expanded over the whole split, the card meets its edges: no corner or
   * shadow; so does a bench of it shown in CawCo's own artifact panel (the
   * overlay's `data-cawco-headed` on the page's root), which the panel's
   * well holds. The head keeps its place, so the control just pressed is still
   * under the pointer to press back.
   */
  import { type Snippet, untrack } from "svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/popover-content.svelte";
  import HeadFade from "#lib/components/ui/scroll-edge/head-fade.svelte";
  import {
    IconClose,
    IconMaximize,
    IconMaximizeLinear,
    IconMinimize,
    IconMinimizeLinear,
    IconMoreLinear,
  } from "#lib/icons.js";
  import { frameObserver } from "#lib/platform/frame-observer.js";
  import { cn } from "#lib/utils.js";
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
    switcherAt = "start",
    leading,
    title,
    titleControl,
    subtitle,
    subtitleId,
    placement = "beside",
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
    /**
     * Where the switch stands: leading the bar (a session's split), or at
     * its end before Close (Caw's panel's Assistant | Preview, decision page
     * `onboarding-design`, card `artifact-open`).
     */
    switcherAt?: "start" | "end";
    /**
     * What leads the bar before the title (HIG, Toolbars, Item groupings:
     * "Elements that let people return to the previous document and show or
     * hide a sidebar appear at the far leading edge, followed by the view
     * title"): a design graph's room switch and its steps.
     */
    leading?: Snippet;
    /** What is on show, past what the switch says; nothing when it says it all. */
    title?: string;
    /** What is on show as a control (the artifact panel's menu), in the title's place; its words that keep their width marked `data-slot="name-lead"`, what trails them cut inside the name's box. */
    titleControl?: Snippet;
    /** What describes it (an artifact's ask): never a line in the bar (DESIGN.md, The Title Bars Follow Liquid Glass Rule: "Facts about the surface … are content, never a second line in the bar"); the title's tooltip and its description, and a title control says it in its own menu. */
    subtitle?: string;
    /** The description's id, for the control it describes. */
    subtitleId?: string;
    /**
     * Where the card stands: beside the page (Close trails, in a group of
     * its own), or a sheet (a phone's): Close leads, as a single-view
     * sheet's does (HIG, Sheets: "for sheets with a single view, the Cancel
     * button belongs on the leading edge of the top toolbar").
     */
    placement?: "beside" | "sheet";
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
    of?: "preview" | "task" | "file";
    /**
     * A page's mode in the well (the preview's): Comment and Draw mark the
     * well's edge with a 1px seam inside its box, never a second ring;
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

  /** Expand, then the pane's controls, in head order: Expand leads the glass (the owner's pin on the Working area). */
  const all = $derived<HeadItem[]>(
    items
      ? [
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
          ...items,
        ]
      : []
  );
  let head = $state<HTMLElement>();
  let identity = $state<HTMLElement>();
  /**
   * Where a control stands in the head: the mode's segments in the centre,
   * the one prominent action after the glass, the rest in the glass. A
   * centre control drawn in its one-button form is one of the glass's
   * symbols, beside More (HIG, Toolbars, Item groupings: on iPhone, "controls
   * for tool selection and the More menu grouped on the trailing edge"; a
   * glass of its own would be a third group for one symbol).
   */
  const inCentre = $derived(
    all.filter((one) => one.place === "centre" && formOf(one.key) !== "compact")
  );
  const inGlass = $derived(
    all.filter(
      (one) =>
        !one.place || (one.place === "centre" && formOf(one.key) === "compact")
    )
  );
  /** What stands in More whatever the room (an artifact's commands on the whole of it): More last in the glass (HIG, Toolbars: the trailing edge holds "the More menu"). */
  const inMore = $derived(all.filter((one) => one.place === "more"));
  const prominent = $derived(all.filter((one) => one.place === "prominent"));
  /** What stands with the name, after it (a browser's address): the head's leading group, the controls trailing. */
  const inLead = $derived(all.filter((one) => one.place === "lead"));
  /** The controls standing in the head, and how; null until the head is measured: all of them whole. */
  let shown = $state<Map<string, Standing> | null>(null);
  /** The name's own width, up to {@link NAME_KEEPS}: it gives up no more of it to the controls. */
  let nameKeeps = $state(0);
  /** Each control's width as last drawn in the head, whole (`key`) and in its narrowest form (`key:compact`), and More's, its glyph alone (`more`) and saying a count (`more:counted`): what a control in More would take back. */
  const widths = new Map<string, number>();
  const stands = (key: string) => shown === null || shown.has(key);
  const formOf = (key: string): Standing => shown?.get(key) ?? "whole";
  const more = $derived([
    ...all.filter((one) => one.place !== "more" && !stands(one.key)),
    ...inMore,
  ]);
  /** The count a control in More says on it (Comments'), only above 0 (The Earned Count Rule). */
  const moreCount = $derived(
    more.find((one) => one.count && one.count.n > 0)?.count
  );

  /**
   * The head's drawn px to its laid-out px: other than 1 under a transform
   * (a component canvas zoomed to fit its frames, `scale(z)`). Every width
   * the fit reads is in laid-out px, the head's room's own: read as drawn,
   * a measure taken under a zoom that changes after it (a frame grown, then
   * narrowed back, and zoomed to fit again) stood every control whole, and
   * a zoom resizes no box, so no observer heard it to measure again.
   */
  let zoom = 1;

  /** A box's width as laid out: its drawn width over the head's zoom. */
  const laidOut = (el: Element): number =>
    el.getBoundingClientRect().width / zoom;

  /** The head's zoom as it is drawn now. */
  function zoomOf(el: HTMLElement): number {
    const drawn = el.getBoundingClientRect().width;
    const laid = Number.parseFloat(getComputedStyle(el).width);
    return drawn > 0 && laid > 0 ? drawn / laid : 1;
  }

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

  /**
   * A control drawn whole, measured in its narrowest form as it would draw
   * now (`data-form="compact"` for the one read, then back): its words go
   * and its padding narrows, and a count it says stays (Send's, Comments').
   * Read so, a form never drawn yet, or last drawn at another count, is
   * never guessed at the glyph alone. Only a control whose narrowest form
   * is its own (`words`, no `compact` snippet): the attribute is all that
   * changes, and it is back before anything paints.
   */
  function compactWidth(one: HTMLElement): number {
    const was = one.dataset.form;
    one.dataset.form = "compact";
    const width = laidOut(one);
    if (was === undefined) {
      delete one.dataset.form;
    } else {
      one.dataset.form = was;
    }
    return width;
  }

  /** The head's glass group of controls, and the glass Close stands in. */
  let glass = $state<HTMLElement | null>(null);

  /**
   * What always stands (the switch, Close's glass) as drawn, and the room
   * the glass's own inset takes (`pads`); each control's width, and More's,
   * kept while it stands. The controls stand in the head (the mode) or in
   * its glass (the rest). The inset narrows the room rather than standing
   * as a member of the row: as a member it took a gap more than it is laid
   * out with (main's 45ac350ee8, session-sheet leg 18).
   */
  function drawnWidths(el: HTMLElement, name: HTMLElement) {
    const kept: number[] = [];
    let pads = 0;
    const parts = [...el.children, ...(glass?.children ?? [])];
    for (const child of parts) {
      const one = child as HTMLElement;
      if (glass && one.contains(glass)) {
        pads += insetOf(glass);
      } else if (one.dataset.slot !== "join") {
        const width = keepWidth(one);
        if (width !== null && one !== name) {
          kept.push(width);
        }
      }
    }
    return { kept, pads };
  }

  /** The glass's own inset, start and end: what it adds round its controls. */
  function insetOf(at: HTMLElement): number {
    const style = getComputedStyle(at);
    return (
      (Number.parseFloat(style.paddingInlineStart) || 0) +
      (Number.parseFloat(style.paddingInlineEnd) || 0)
    );
  }

  /** A control's or More's width, kept by its key; else what always stands, its width. */
  function keepWidth(one: HTMLElement): number | null {
    const width = laidOut(one);
    const item = one.dataset.headItem;
    if (item) {
      if (one.hidden) {
        return null;
      }
      if (one.dataset.form === "compact") {
        widths.set(`${item}:compact`, width);
        return null;
      }
      widths.set(item, width);
      const own = all.find((each) => each.key === item);
      if (own?.words && !own.compact) {
        widths.set(`${item}:compact`, compactWidth(one));
      }
      return null;
    }
    if (one.dataset.slot === "more") {
      widths.set(
        one.hasAttribute("data-counted") ? "more:counted" : "more",
        width
      );
      return null;
    }
    return width;
  }

  /**
   * The name's box at its lead's own width, up to {@link NAME_KEEPS}: its
   * inset and ring room around it. Its lead is the title, or the part of a
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
    const own = lead ? laidOut(lead) + runsPast(lead) + pad : 0;
    return Math.ceil(Math.min(own, NAME_KEEPS + pad));
  }

  /**
   * What the name wants past what it keeps: its lead's words whole on one
   * line, or, where it wraps to two lines (a phone's head: its lead's
   * `-webkit-line-clamp` is 2), seven tenths of that (two lines break at words, never at the half), with the chevron and insets round them; less
   * {@link nameWidth}. Read with its words held to one line for the read.
   */
  function nameWants(name: HTMLElement, keeps: number): number {
    const lead =
      name.querySelector<HTMLElement>('[data-slot="name-lead"]') ??
      (name.firstElementChild as HTMLElement | null);
    if (!lead) {
      return 0;
    }
    const twoLines = getComputedStyle(lead).webkitLineClamp === "2";
    // What stands round the words in the title control (its chevron, its
    // insets), as drawn now: the control less the part of it that holds the
    // lead, so a line under the lead (a title's description, cut at the
    // name's room) is never counted as more the name wants.
    const control = lead.closest("button") ?? lead;
    let holder: Element = lead;
    while (holder.parentElement && holder.parentElement !== control) {
      holder = holder.parentElement;
    }
    const around = laidOut(control) - laidOut(holder);
    const was = lead.style.whiteSpace;
    lead.style.whiteSpace = "nowrap";
    const whole = laidOut(lead) + runsPast(lead);
    lead.style.whiteSpace = was;
    const style = getComputedStyle(name);
    const pad =
      (Number.parseFloat(style.paddingInlineStart) || 0) +
      (Number.parseFloat(style.paddingInlineEnd) || 0);
    // Two lines break at words, never at the half: 70% of one line holds them.
    const wants = (twoLines ? whole * 0.7 : whole) + around + pad;
    return Math.max(0, Math.ceil(wants) - keeps);
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
    zoom = zoomOf(head);
    const keeps = nameWidth(identity);
    const name = () => {
      nameKeeps = keeps;
    };
    if (all.length === 0) {
      return name;
    }
    const { gap, room } = roomOf(head);
    const { kept, pads } = drawnWidths(head, identity);
    // More and a form not drawn yet are a bar item, its symbol alone, until
    // they stand to be read.
    const glyph =
      Number.parseFloat(
        getComputedStyle(head).getPropertyValue("--spacing-c-bar-item")
      ) || 0;
    const moreGlyph = widths.get("more") ?? glyph;
    // More stands whatever the room while it holds what always goes in it.
    const moreKept = inMore.length > 0 ? [moreGlyph] : [];
    const next = standing(
      room - pads,
      gap,
      [...kept, ...moreKept, keeps + nameMargins(identity)],
      { glyph: moreGlyph, counted: widths.get("more:counted") ?? moreGlyph },
      all
        .filter((one) => one.place !== "more")
        .map((one) => ({
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
      head.clientWidth >= WORDS_FROM,
      nameWants(identity, keeps),
      glass ? Number.parseFloat(getComputedStyle(glass).columnGap) || gap : gap
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
    // Each of the pane's controls by its key, where it stands now, so a pane's
    // items arriving or a control changing places re-observes them.
    for (const one of [...inLead, ...inCentre, ...inGlass, ...prominent]) {
      const child = el.querySelector(
        `[data-head-item="${CSS.escape(one.key)}"]`
      );
      if (child) {
        seen.observe(child);
      }
    }
    for (const child of el.querySelectorAll(
      ':scope > [data-slot="identity"] > *'
    )) {
      seen.observe(child);
    }
    return () => seen.disconnect();
  });
  // A new name is measured as it comes, once it is drawn.
  $effect(() => {
    if (title !== undefined) {
      untrack(fit);
    }
  });
</script>

{#snippet expandBar()}
  {#if expand}
    <BarItem
      aria-keyshortcuts={expanded ? "Escape" : undefined}
      icon={expanded ? IconMinimizeLinear : IconMaximizeLinear}
      keys={expanded ? "Esc" : undefined}
      label={expanded ? expand.backLabel : "Expand"}
      onclick={() => expand.toggle()}
    />
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

<!-- One of the pane's controls where it stands, whole or in its narrowest form; hidden while it stands in More. -->
{#snippet headItem(one: HeadItem)}
  <!-- What leads with the name takes the room after it, so the controls
       trail (`me-auto`). -->
  <div
    data-form={formOf(one.key)}
    data-head-item={one.key}
    class={[
      "unhidden:flex unhidden:flex-none",
      one.place === "lead" && "me-auto",
    ]}
    hidden={!stands(one.key)}
  >
    {#if one.compact && formOf(one.key) === "compact"}
      {@render one.compact()}
    {:else}
      {@render one.bar()}
    {/if}
  </div>
{/snippet}

<!-- Close, a bare symbol in a glass of its own (HIG, Toolbars: "Group
     navigation controls and critical actions like Done, Close, or Save in
     dedicated, familiar, and visually distinct sections"); while the card
     closes it holds its place and swallows presses, and a close that failed
     says so in its ink. -->
{#snippet closeGlass()}
  <BarGlass form="group">
    <BarItem
      aria-busy={closing || undefined}
      data-failed={closeFailed || undefined}
      data-slot="close"
      icon={IconClose}
      label="Close"
      onclick={() => {
        if (!closing) {
          onclose();
        }
      }}
      tone={closeFailed ? "fail" : "muted"}
    />
  </BarGlass>
{/snippet}

<!-- On a phone's preview sheet (SideSheet's `data-preview-sheet`) the card
     is the sheet's own content: the sheet draws the surface and the corners,
     and the card neither (no second sheet inside it). -->
<section
  data-slot="side-card"
  data-side-card={of}
  data-side-surface-expanded={expanded || undefined}
  aria-label={label}
  class={cn(
    floatingSurface({ depth: "panel" }),
    "group/card @container relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden p-0 timeline-scope-transcript-head data-side-surface-expanded:rounded-none data-side-surface-expanded:border-0 data-side-surface-expanded:shadow-none in-data-cawco-headed:rounded-none in-data-cawco-headed:border-0 in-data-cawco-headed:shadow-none in-data-preview-sheet:h-auto in-data-preview-sheet:max-h-(--card-max) in-data-preview-sheet:flex-1 in-data-preview-sheet:rounded-none in-data-preview-sheet:border-0 in-data-preview-sheet:bg-transparent in-data-preview-sheet:shadow-none motion-safe:in-data-split-sliding:transition-[border-radius,box-shadow] motion-safe:in-data-split-sliding:duration-(--duration-panel) motion-safe:in-data-split-sliding:ease-drawer"
  )}
  style:--side-room="var(--spacing-c-head-room)"
  style:--card-max="calc(100% - var(--sheet-hidden, 0px))"
  bind:this={section}
>
  <!-- One header: its first word, the switch's or the title's, stands on
       the well's left edge. -->
  <!-- mark-line: its icons are controls at the head's end, each its own
       button, not marks set beside the title -->
  <!-- One bar, one row (DESIGN.md, The Title Bars Follow Liquid Glass
       Rule; HIG, Toolbars, Item groupings): leading, Close on a sheet, the
       switch, then the title, the view's own name, a menu where it opens
       one; in the centre the mode; trailing, one glass of bare symbols with
       More last, the one prominent action, and Close in a glass of its own
       beside the page. It floats over what the card holds (`absolute z-2`),
       over the edge effect too, so a control's 44px area under a finger
       reaches past the head's foot and takes that strip's presses (The 44
       Touch Rule). -->
  <!-- The scroll edge effect under the head (HeadFade, as BarFloat draws
       it): what scrolls beneath the head blurs and fades into the ground
       it stands on, from the first scroll; clear at rest and over a page
       in a frame, which names no timeline here. -->
  <HeadFade
    band="var(--side-room)"
    tint={recessed ? "bg-surface-well" : "bg-surface-raised"}
  />
  <header
    data-slot="side-head"
    data-fitted={all.length > 0 || undefined}
    data-placement={placement}
    class="absolute inset-x-0 top-0 z-2 flex h-(--side-room) items-center gap-space-1 px-space-2 opacity-(--head-shown) hit-gap-x-space-1 coarse:data-fitted:gap-space-2 coarse:data-fitted:hit-gap-x-space-2"
    bind:this={head}
  >
    {#if placement === "sheet"}
      {@render closeGlass()}
    {/if}
    {#if switcher && switcherAt === "start"}
      {@render switcher()}
    {/if}
    {@render leading?.()}
    <!-- The name keeps its own width up to NAME_KEEPS (`--name-keeps`, set
         from its lead as drawn), so the controls never draw over it; what
         it holds is cut at its own box, which reaches a focus ring's width
         past the name on every side (the negative margin takes it back). It
         is the HIG's bar title: Headline, plain text (the row role, 16px at
         500, the house's ceiling). What describes it stands as its
         description, never a line under it. -->
    <div
      data-slot="identity"
      data-led={inLead.some((one) => stands(one.key)) || undefined}
      data-controlled={titleControl ? "" : undefined}
      data-switched={switcher && switcherAt === "start" ? "" : undefined}
      class="-m-space-1 flex min-w-(--name-keeps) flex-1 items-center overflow-hidden p-space-1 ps-space-3 *:max-w-full data-led:flex-initial data-switched:ps-space-2 data-controlled:not-data-switched:ps-space-1"
      style:--name-keeps="{nameKeeps}px"
      bind:this={identity}
    >
      {#if titleControl}
        {@render titleControl()}
      {:else if title}
        <h2
          data-slot="title"
          aria-describedby={subtitle ? subtitleId : undefined}
          class="m-0 truncate text-ink-strong type-row"
          title={subtitle || undefined}
        >
          {title}
        </h2>
      {/if}
      {#if subtitle}
        <span data-slot="subtitle" class="sr-only" id={subtitleId}
          >{subtitle}</span
        >
      {/if}
    </div>
    {@render actions?.()}
    {#each inLead as one (one.key)}
      {@render headItem(one)}
    {/each}
    {#each inCentre as one (one.key)}
      {@render headItem(one)}
    {/each}
    {#if inGlass.length > 0 || more.length > 0 || (!items && expand?.available)}
      <div
        class="contents"
        {@attach (node) => {
          glass = node.querySelector<HTMLElement>('[data-slot="tools"]');
          return () => {
            glass = null;
          };
        }}
      >
        <BarGlass form="group">
          {#each inGlass as one (one.key)}
            {@render headItem(one)}
          {/each}
          {#if more.length > 0}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <BarItem
                    count={moreCount?.n}
                    data-slot="more"
                    icon={IconMoreLinear}
                    label={moreCount
                      ? `More, ${moreCount.of} ${moreCount.n} open`
                      : "More"}
                    {props}
                    tip="More"
                  />
                {/snippet}
              </DropdownMenu.Trigger>
              <BarMenu label="More" width="regular">
                {#each more as one, at (one.key)}
                  {#if at > 0 && (one.group || more[at - 1]?.group)}
                    <DropdownMenu.Separator />
                  {/if}
                  {@render one.menu()}
                {/each}
              </BarMenu>
            </DropdownMenu.Root>
          {/if}
          {#if !items && expand?.available}
            {@render expandBar()}
          {/if}
        </BarGlass>
      </div>
    {/if}
    {#each prominent as one (one.key)}
      {@render headItem(one)}
    {/each}
    {#if switcher && switcherAt === "end"}
      {@render switcher()}
    {/if}
    {#if placement === "beside"}
      {@render closeGlass()}
    {/if}
  </header>
  {#if recessed}
    <!-- The content's ground: a well (`surface-well`) the card's width
         under the head. A page's Comment or Draw mode marks its edge with a
         1px `seam` inside its box (the artifact panel's surface brief, The
         mode: it only says the page hears nothing; the cue is the cursor and
         the pressed segment), the edge easing in and out except while the
         split slides, and points a crosshair. -->
    <div
      class="relative flex min-h-0 flex-1 bg-surface-well"
      data-slot="well-row"
    >
      <div
        data-side-well
        data-mode={mode && mode !== "interact" ? mode : undefined}
        data-ringed={mode ? "" : undefined}
        class="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-well data-ringed:outline-1 data-ringed:outline-solid data-ringed:not-data-mode:outline-transparent data-ringed:-outline-offset-1 data-ringed:not-in-data-split-sliding:transition-[outline-color] data-ringed:not-in-data-split-sliding:duration-(--duration-control) data-ringed:not-in-data-split-sliding:ease-in-out data-mode:cursor-crosshair data-mode:outline-seam"
        bind:this={well}
      >
        {@render children()}
      </div>
    </div>
  {:else}
    {@render children()}
  {/if}
</section>
