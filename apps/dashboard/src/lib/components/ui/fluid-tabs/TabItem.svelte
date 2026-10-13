<script lang="ts">
  /**
   * One segment. The item draws nothing of its own state — the track's
   * overlays do — it only places its content over them and changes weight
   * when chosen. The label is stacked over an invisible copy set at the
   * strong weight, so choosing it changes nothing but the weight: the box
   * the indicator was aimed at is the box it lands on.
   *
   * `href` makes the item a link — the row keeps a real address for
   * middle-click and copy — with a plain click still choosing in place.
   */
  import type { Component, Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "#lib/utils.js";
  import { restRank, useList, useTabs } from "./context.svelte";

  let {
    value,
    label,
    icon: Icon,
    href,
    class: className,
    lead,
    trail,
    onclick,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, "onclick"> & {
    value: string;
    label: string;
    /** An optional leading icon. */
    icon?: Component<{ class?: string }>;
    href?: string;
    /** Custom leading content, in the icon's place. */
    lead?: Snippet;
    /** Content after the label: a close control, a count. */
    trail?: Snippet;
    onclick?: (event: MouseEvent) => void;
  } = $props();

  const tabs = useTabs();
  const list = useList();

  let node = $state<HTMLElement | undefined>();
  // The root learns the order from the items themselves, in the order they
  // stand in the track — kept as tabs arrive, leave and are moved.
  $effect(() => {
    if (node) {
      return list.rects.register(node, value);
    }
  });
  /** Where this item stands now, not where it stood when it mounted. */
  const index = $derived(node ? list.rects.items.indexOf(node) : -1);

  const selected = $derived(tabs.value === value);
  /**
   * Where a folder tab stands in the stack at rest, from the order and the
   * value alone (`restRank`): what the first render draws, the server's
   * included, until the track ranks the tabs itself (TabsList `--z`).
   */
  const restAt = $derived.by(() => {
    const at = tabs.order.indexOf(value);
    return at < 0
      ? undefined
      : restRank(
          tabs.order.length,
          tabs.value === undefined ? -1 : tabs.order.indexOf(tabs.value),
          at
        );
  });
  /**
   * How chosen the tab is, 0 to 1: a folder tab's sheet, its lean, its card's
   * fill and its title's strong ink all follow it. At rest it is 1 on the
   * chosen tab and 0 on the rest. Under a gesture (the root's `travel`) the
   * chosen tab gives up the fraction the gesture has travelled and the tab
   * it is heading to takes as much, so the choice crosses between the two
   * with the finger and lands with the pane on the same frame; the track's
   * `data-ride` holds their transitions off while it does.
   */
  const pick = $derived.by(() => {
    const { travel } = tabs;
    const at = selected ? 1 : 0;
    if (!travel || travel.toward === tabs.value) {
      return at;
    }
    const f = Math.min(1, Math.max(0, travel.fraction));
    return at + ((value === travel.toward ? 1 : 0) - at) * f;
  });
  // The list's props land on the hit, not the box; `class` is the box's.

  function choose(event: MouseEvent): void {
    onclick?.(event);
    if (event.defaultPrevented || event.button !== 0) {
      return;
    }
    if (
      href &&
      (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    ) {
      return;
    }
    event.preventDefault();
    // The indicator moves on the click, ahead of the value arriving.
    list.optimisticIndex = index;
    tabs.select(value);
  }
</script>

<span
  class={cn("ff-tab", selected && "selected", className)}
  data-tab-index={index}
  bind:this={node}
  style:--pick={pick}
  style:--z-rest={restAt}
>
  <svelte:element
    aria-selected={selected}
    class="hit touch-hit"
    draggable={href ? "false" : undefined}
    {href}
    onclick={choose}
    role="tab"
    tabindex={selected ? 0 : -1}
    this={href ? "a" : "button"}
    type={href ? undefined : "button"}
    {...rest}
  >
    {#if lead}
      {@render lead()}
    {:else if Icon}
      <Icon class="ff-tab-icon" />
    {/if}
    <!-- The name, and over it the same name in the strong ink: a folder tab
         fades the strong one in as it is chosen (transitions.dev, text swap
         soft), so its ink travels on the compositor. -->
    <span class="label">
      <span class="text">{label}</span>
      <!-- Its words drawn, not written (`::before`): as a second copy of
           the name in the link's text, the tab's visible text was the name
           twice, which its accessible name does not hold (axe,
           label-content-name-mismatch). -->
      <span aria-hidden="true" class="text strong" data-text={label}></span>
    </span>
  </svelte:element>
  {#if trail}
    {@render trail()}
  {/if}
</span>

<style>
  /* The measured box: the hit and whatever trails it. The overlays are
     aimed at this, so a trailing control sits inside the segment. */
  /* The tab box makes no stacking context of its own: its contents rise
     above the overlays (the sheet is z-index 2, a segmented list's hover
     ghost 1), while anything the box paints behind them — a folder tab's
     tint — stays under both. A folder tab's layers take their place in
     the track's one stack instead, by the tab's rank (below). */
  .ff-tab {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-inline-size: 0;
    block-size: var(--item);
    border-radius: var(--shape);
    color: var(--ink-muted);

    /* Only a tab with something after its hit carries end padding. */
    &:not(:has(.hit:last-child)) {
      padding-inline-end: calc(var(--px) - 6px);
    }
    /* Chosen, or under the list's hover ghost (the kit highlight marks
       the row it stands under). A tap leaves no ghost behind to ink. */
    &.selected {
      color: var(--ink-strong);
    }
    @media (hover: hover) {
      &[data-ghosted] {
        color: var(--ink-strong);
      }
    }

    /* The press tints the whole segment (trailing controls included), not
       the label's hit alone. A press on a trailing control leaves it be. */
    &:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
      --press: light-dark(var(--surface-fill-strong), var(--surface-fill));
      background-color: var(--press);
    }

    @media (prefers-reduced-motion: no-preference) {
      transition: color var(--dur-ghost) var(--ease-out);
    }
  }
  .ff-tab > :global(*) {
    position: relative;
    z-index: 3;
  }
  /* The name's strong ink layer draws its words (`data-text`): they are no
     second copy of the name in the tab's text. */
  .strong::before {
    content: attr(data-text);
  }
  .hit {
    display: flex;
    align-items: center;
    align-self: stretch;
    flex: 1 1 auto;
    gap: calc(var(--gap) + 4px);
    min-inline-size: 0;
    padding-block: 0;
    /* A host may set a tab's two ends apart (PaneTabs' phone row). */
    padding-inline-start: var(--px-start, var(--px));
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: var(--text);
    line-height: 1;
    white-space: nowrap;
    text-decoration: none;
    cursor: pointer;
    outline: none;
    /* Not positioned, so the box is the containing block of the area below;
       as a flex item its z-index still lifts it over the sheet. */
    position: static;

    /* Last in the box: the hit's own end padding. When a trailing control
       follows, the box's end padding keeps it off the segment's edge. */
    &:last-child {
      padding-inline-end: var(--px);
    }

    /* The whole segment chooses, not only the label: the hit's area spans
       the box, end padding included. It sits under the hit's content, and
       a trailing control, later in the box, stands over it and takes its
       own presses. */
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: -1;
    }
  }
  /* ── Folder tabs in depth ──────────────────────────────────────────
     Each tab is a card in its own tint standing on the shelf, and over it
     its own sheet, the page below continued, shown as much as the tab is
     chosen (`--pick`). Tabs overlap by the flare and make no stacks of
     their own: card, sheet and contents take the tab's rank in the track's
     one stack (`--z`, TabsList), four layers a rank.

     Every tab is hinged on its foot, the shelf's line: the chosen one
     stands upright, every other leans back `--lean` (all one step back),
     less while a fine pointer is over it (`--lean-lift`). The lean is a
     rotateX with no perspective about the outline's bottom centre: it
     lowers the tab's top and moves nothing sideways, so its foot, its sides
     and its overlaps hold. What is written on the tab stays upright and
     drops with the card's middle. The sides of the card and the sheet
     bring their top corners in by `--slope-start` and `--slope-end`.

     A choice is two states trading places where they stand, every part
     together over `--choose-dur` on `--choose-ease` (TabsList): the lean
     and the contents' drop (transform, translate), the sheets (the new one
     fades in where it stands while the old one fades out), the card under
     them from the receded fill to the sheet's (background-color), and the
     title's strong ink (opacity). No sheet slides or wipes. */
  :global([data-variant="folder"]) .ff-tab {
    --lean-now: calc(
      var(--lean) *
      (1 - var(--pick)) *
      (1 - var(--lean-lift-now, 0))
    );
    /* Where a seam is gliding, this tab's side stands in by this much,
       card and sheet with it (TabsList, `--cut-start`/`--cut-end`). */
    --cut-s: calc(var(--seam-tuck) * var(--cut-start, 0));
    --cut-e: calc(var(--seam-tuck) * var(--cut-end, 0));
    /* The chosen tab's name is its strong ink layer (`.label .strong`): the
       muted one under it stays as it was. */
    &.selected {
      color: var(--ink-muted);
    }
    /* The trailing pad is the full pad: an edge under a neighbour by the
       overlap still leaves the close control clear of it. */
    &:not(:has(.hit:last-child)) {
      padding-inline-end: var(--px-end, var(--px));
    }
    /* Under the pointer the tab lights its own card in the hover tint (the
       track's ghost cannot glide between overlapping tabs), and a receded
       tab comes most of the way up. */
    @media (hover: hover) {
      &[data-ghosted]:not(.selected)::before {
        background: var(--tab-hover, var(--surface-hover));
      }
    }
    @media (hover: hover) and (pointer: fine) {
      &:not(.selected):hover {
        --lean-lift-now: var(--lean-lift);
      }
    }
    /* The card: straight up from the shelf as far as the sheet's flare
       reaches, then the sloped side, so its outline is the sheet's body.
       Its fill is the receded one (a host may set it, `--tab-fill`) and the
       sheet's own on the chosen tab, so the overlap between the tab going
       and the tab coming looks the same from either as they pass. */
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: calc(var(--z, var(--z-rest, 1)) * 4);
      background: color-mix(
        in oklab,
        var(--sheet) calc(var(--pick) * 100%),
        var(--tab-fill, var(--surface-recess-deep))
      );
      clip-path: shape(
        from var(--cut-s) 100%,
        line to var(--cut-s) calc(100% - var(--flare)),
        line to calc(var(--cut-s) + var(--slope-start)) var(--radius),
        arc to calc(var(--cut-s) + var(--slope-start) + var(--radius)) 0 of
          var(--radius) cw,
        line to calc(100% - var(--cut-e) - var(--slope-end) - var(--radius)) 0,
        arc to calc(100% - var(--cut-e) - var(--slope-end)) var(--radius) of
          var(--radius) cw,
        line to calc(100% - var(--cut-e)) calc(100% - var(--flare)),
        line to calc(100% - var(--cut-e)) 100%,
        close
      );
    }
    /* The sheet: rounded sloped shoulders and a foot that curves outward
       into the page, on a box one flare wider than the tab each side. It is
       part of the tab, so it is wherever the tab is laid out, in the same
       frame. */
    &::after {
      content: "";
      position: absolute;
      inset-block: 0;
      inset-inline: calc(-1 * var(--flare));
      z-index: calc(var(--z, var(--z-rest, 1)) * 4 + 1);
      background: var(--sheet);
      opacity: var(--pick);
      clip-path: shape(
        from var(--cut-s) 100%,
        arc to calc(var(--cut-s) + var(--flare)) calc(100% - var(--flare)) of
          var(--flare) ccw,
        line to calc(var(--cut-s) + var(--flare) + var(--slope-start))
          var(--radius),
        arc to
          calc(var(--cut-s) + var(--flare) + var(--slope-start) + var(--radius))
          0 of var(--radius) cw,
        line to
          calc(
            100% -
            var(--cut-e) -
            var(--flare) -
            var(--slope-end) -
            var(--radius)
          )
          0,
        arc to calc(100% - var(--cut-e) - var(--flare) - var(--slope-end))
          var(--radius) of var(--radius) cw,
        line to calc(100% - var(--cut-e) - var(--flare))
          calc(100% - var(--flare)),
        arc to calc(100% - var(--cut-e)) 100% of var(--flare) ccw,
        close
      );
    }
    /* Card and sheet share a bottom centre, so one lean keeps them one
       shape. */
    &::before,
    &::after {
      transform-origin: 50% 100%;
      transform: rotateX(var(--lean-now));
    }
    @media (prefers-reduced-motion: no-preference) {
      &::before {
        transition:
          background-color var(--choose-dur) var(--choose-ease),
          transform var(--choose-dur) var(--choose-ease);
      }
      &::after {
        transition:
          opacity var(--choose-dur) var(--choose-ease),
          transform var(--choose-dur) var(--choose-ease);
      }
      /* A pointer's lift runs at the control tier, and lets go at the
         choice's own pace. */
      @media (hover: hover) and (pointer: fine) {
        &:not(.selected):hover::before,
        &:not(.selected):hover::after {
          transition-duration: var(--dur-control);
          transition-timing-function: var(--ease-out);
        }
      }
    }
    /* Under a gesture the sheets are where its fraction puts them, frame by
       frame; the track's data-ride stays a frame past the gesture, so
       handing back to the rules above starts no transition. */
    :global([data-ride]) &::before,
    :global([data-ride]) &::after {
      transition: none;
    }
    /* Pressed: the tab's own shapes take the tint — the card, and the sheet
       with its shoulders and flared foot — so it fills the whole tab and its
       outside curve; the box itself stays clear behind them. */
    &:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
      background-color: transparent;

      &::before,
      &::after {
        background: var(--press);
      }
    }
  }
  /* What is written on a folder tab, above its sheet at its rank, upright,
     dropped with the leaning card's middle. */
  :global([data-variant="folder"]) .ff-tab > :global(*) {
    z-index: calc(var(--z, var(--z-rest, 1)) * 4 + 2);
    translate: 0 calc(var(--item) * 0.5 * (1 - cos(var(--lean-now))));
  }
  /* Its drop travels with the choice. Weightless, so a host's trailing
     control that has transitions of its own keeps them, and lists
     `translate` among them (PaneTabs). */
  @media (prefers-reduced-motion: no-preference) {
    :global(:where([data-variant="folder"] .ff-tab > *)) {
      transition: translate var(--choose-dur) var(--choose-ease);
    }
    @media (hover: hover) and (pointer: fine) {
      :global([data-variant="folder"])
        .ff-tab:not(.selected):hover
        > :global(*) {
        transition-duration: var(--dur-control);
        transition-timing-function: var(--ease-out);
      }
    }
  }
  :global([data-ride]) .ff-tab > :global(*) {
    transition: none;
  }
  /* The chosen folder sheet's flared foot is the tab's too: the area takes
     the sheet's outline, square-shouldered, so the foot reaches past the
     box on each side. */
  :global([data-variant="folder"]) .ff-tab.selected .hit::before {
    inset-inline: calc(-1 * var(--flare));
    clip-path: shape(
      from 0 100%,
      arc to var(--flare) calc(100% - var(--flare)) of var(--flare) ccw,
      line to var(--flare) 0,
      line to calc(100% - var(--flare)) 0,
      line to calc(100% - var(--flare)) calc(100% - var(--flare)),
      arc to 100% 100% of var(--flare) ccw,
      close
    );
  }
  .ff-tab :global(.ff-tab-icon) {
    inline-size: var(--icon);
    block-size: var(--icon);
    flex: 0 0 auto;
  }

  /* A tab's name is in the label role whatever its state; the colour and
     the sheet say which one is chosen. */
  .label {
    display: grid;
    min-inline-size: 0;

    /* Clipped for the ellipsis, so the line box is left whole — a
       trimmed one would lose its descenders to the clip. */
    & > span {
      grid-area: 1 / 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: var(--item);
    }
  }
  .text {
    font-weight: var(--weight-strong);
  }
  /* The strong ink layer is a folder tab's: a segmented one changes colour
     under its sliding thumb. */
  .strong {
    display: none;
  }
  :global([data-variant="folder"]) .strong {
    display: block;
    color: var(--ink-strong);
    opacity: var(--pick);

    @media (prefers-reduced-motion: no-preference) {
      transition: opacity var(--choose-dur) var(--choose-ease);
    }
    :global([data-ride]) & {
      transition: none;
    }
  }
  /* By day the press is the step past the hover ghost, and an unchosen
     tab's muted label goes strong on it (app.css .press-tint). Last, so it
     outranks every tab rule above by order as well as by weight. */
  :global(:root:not(.dark))
  .ff-tab:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
    color: var(--ink-strong);
  }
</style>
