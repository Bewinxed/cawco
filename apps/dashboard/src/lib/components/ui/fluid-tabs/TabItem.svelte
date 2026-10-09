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
  import { useList, useTabs } from "./context.svelte";

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
   * A folder sheet carried by a gesture (the root's `travel`): the chosen
   * tab's sheet gives up the fraction the gesture has travelled, on the side
   * away from the tab it is heading to, and that tab's sheet takes it on the
   * side facing the chosen one, so the two meet where the sheet has got to
   * and land with the pane on the same frame. The track's `data-ride` holds
   * their transitions off while it does.
   */
  const ride = $derived.by(() => {
    const { travel } = tabs;
    if (!travel || travel.toward === tabs.value) {
      return null;
    }
    const from = tabs.order.indexOf(tabs.value ?? "");
    const to = tabs.order.indexOf(travel.toward);
    const f = Math.min(1, Math.max(0, travel.fraction));
    if (selected) {
      return { size: 1 - f, at: to > from ? "right" : "left" };
    }
    if (value === travel.toward) {
      return { size: f, at: to > from ? "left" : "right" };
    }
    return null;
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
  class={cn("ff-tab", selected && "selected", ride && "riding", className)}
  data-tab-index={index}
  bind:this={node}
  style:--ride={ride ? `${ride.size * 100}%` : undefined}
  style:--ride-at={ride?.at}
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
    <span class="label">
      <span class="text">{label}</span>
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
     tint — stays under both. A folder track stacks each tab apart
     (TabsList), and these layers order within it. */
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
  /* Folder tabs stand behind the sheet in their own tint: a rounded-top
     card the size of the tab, under the sheet's layer. Each tab is its own
     stack, ranked by the track (TabsList) with the chosen one on top, so
     the chosen sheet's shoulders and flared foot draw over a neighbour's
     card, and neighbours overlap by the flare. The chosen tab's card is
     hidden under the sheet and swaps with it at once. */
  :global([data-variant="folder"]) .ff-tab {
    /* The trailing pad is the full pad: an edge tucked under a neighbour
       by the overlap still leaves the close control clear of it. */
    &:not(:has(.hit:last-child)) {
      padding-inline-end: var(--px-end, var(--px));
    }
    /* Under the pointer the tab lights its own card in the hover tint (the
       track's ghost cannot glide between overlapping stacks). */
    @media (hover: hover) {
      &[data-ghosted]:not(.selected)::before {
        background: var(--tab-hover, var(--surface-hover));
      }
    }
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: var(--radius) var(--radius) 0 0;
      /* A host may recede a tab further from the chosen one (PaneTabs). */
      background: var(--tab-fill, var(--surface-recess-deep));

      @media (prefers-reduced-motion: no-preference) {
        transition:
          background-color var(--dur-ghost) var(--ease-out),
          opacity 0s;
      }
    }
    /* Hidden once the sheet has covered it, so no tint fringes the
       sheet's shoulders at rest; back at once when the sheet leaves. */
    &.selected::before {
      opacity: 0;

      @media (prefers-reduced-motion: no-preference) {
        transition: opacity 0s var(--wipe);
      }
    }
    /* The chosen tab's sheet: the page below, continued. One outline —
       rounded shoulders and a foot that curves outward into the page —
       on a box one flare wider than the tab each side, in percentages of
       that box. It is part of the tab, so it is wherever the tab is laid
       out, in the same frame, with nothing to travel or catch up. The
       tab box makes no stacking context, so the sheet (z-index 2) sits
       above every tab's tint and the list's hover ghost, and below every
       tab's contents. */
    &::after {
      content: "";
      position: absolute;
      inset-block: 0;
      inset-inline: calc(-1 * var(--flare));
      z-index: 2;
      background: var(--sheet);
      clip-path: shape(
        from 0 100%,
        arc to var(--flare) calc(100% - var(--flare)) of var(--flare) ccw,
        line to var(--flare) var(--radius),
        arc to calc(var(--flare) + var(--radius)) 0 of var(--radius) cw,
        line to calc(100% - var(--flare) - var(--radius)) 0,
        arc to calc(100% - var(--flare)) var(--radius) of var(--radius) cw,
        line to calc(100% - var(--flare)) calc(100% - var(--flare)),
        arc to 100% 100% of var(--flare) ccw,
        close
      );
      /* The wipe: every tab owns a sheet, shown by a mask no wider than
         the tab's own box. Switching grows the chosen tab's from the side
         facing the old one and shrinks the old one's toward the new, so
         no sheet is ever painted over a gap or a tab in between. */
      mask-image: linear-gradient(#000 0 0);
      mask-repeat: no-repeat;
      mask-size: 0% 100%;
      mask-position: var(--wipe-out, right);

      @media (prefers-reduced-motion: no-preference) {
        transition: mask-size var(--wipe) var(--wipe-ease);
      }
    }
    &.selected::after {
      mask-size: 100% 100%;
      mask-position: var(--wipe-in, left);
    }
    /* A switch past a neighbour: the sheets swap at once and TabsList
       slides the chosen one over from the tab it left. */
    :global([data-leap]) &::after {
      transition: none;
    }
    /* Under a gesture the sheets are where its fraction puts them, frame by
       frame, and the chosen tab keeps its tint under a sheet that no longer
       covers it; the track's data-ride stays a frame past the gesture, so
       handing back to the rules above starts no transition. */
    :global([data-ride]) &::before,
    :global([data-ride]) &::after {
      transition: none;
    }
    &.riding::before {
      opacity: 1;
    }
    &.riding::after {
      mask-size: var(--ride) 100%;
      mask-position: var(--ride-at);
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
  /* By day the press is the step past the hover ghost, and an unchosen
     tab's muted label goes strong on it (app.css .press-tint). Last, so it
     outranks every tab rule above by order as well as by weight. */
  :global(:root:not(.dark))
  .ff-tab:has(.hit:active:not(:disabled, [aria-disabled="true"])) {
    color: var(--ink-strong);
  }
</style>
