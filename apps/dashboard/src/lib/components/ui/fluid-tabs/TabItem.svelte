<script lang="ts">
  import type { Component } from "svelte";
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
  import { onMount, type Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";
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
  const index = list.claim();

  let node = $state<HTMLElement | undefined>();
  onMount(() => {
    if (!node) {
      return;
    }
    return list.hover.register(index, node);
  });

  // The root learns the order from the items themselves, in mount order.
  $effect.pre(() => {
    const order = [...tabs.order];
    order[index] = value;
    tabs.setOrder(order);
  });

  const selected = $derived(tabs.value === value);
  const active = $derived(list.hover.activeIndex === index || selected);
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
  class={cn("ff-tab", active && "active", selected && "selected", className)}
  data-proximity-index={index}
  bind:this={node}
>
  <svelte:element
    aria-selected={selected}
    class="hit touch-hit"
    draggable={href ? 'false' : undefined}
    {href}
    onclick={choose}
    role="tab"
    tabindex={selected ? 0 : -1}
    this={href ? 'a' : 'button'}
    type={href ? undefined : 'button'}
    {...rest}
  >
    {#if lead}
      {@render lead()}
    {:else if Icon}
      <Icon class="ff-tab-icon" />
    {/if}
    <span class="label">
      <span aria-hidden="true" class="sizer">{label}</span>
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
     above the overlays (the sheet is z-index 2, the list's hover field 1),
     while anything the box paints behind them — a folder tab's tint —
     stays under both. */
  .ff-tab {
    position: relative;
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-inline-size: 0;
    block-size: var(--item);
    padding-inline-end: calc(var(--px) - 6px);
    border-radius: var(--shape);
    color: var(--ink-muted);

    &:has(.hit:last-child) {
      padding-inline-end: 0;
    }
    &.active {
      color: var(--ink-strong);
    }

    @media (prefers-reduced-motion: no-preference) {
      transition: color 80ms linear;
    }
  }
  .ff-tab > :global(*) {
    position: relative;
    z-index: 3;
  }
  /* Folder tabs stand behind the sheet in their own tint: a rounded-top
     card the size of the tab, under the sheet's layer, so the chosen
     sheet's shoulders and flared foot draw over a neighbour's card rather
     than being cut by it. The chosen tab's card is hidden under the sheet
     and swaps with it at once. */
  :global([data-variant="folder"]) .ff-tab {
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: var(--radius) var(--radius) 0 0;
      background: var(--surface-recess-deep);

      @media (prefers-reduced-motion: no-preference) {
        transition:
          background-color 80ms linear,
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
       above every tab's tint and the list's hover field, and below every
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
  }
  .hit {
    display: flex;
    align-items: center;
    align-self: stretch;
    flex: 1 1 auto;
    gap: calc(var(--gap) + 4px);
    min-inline-size: 0;
    padding-block: 0;
    padding-inline: var(--px);
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

    /* Followed by a trailing control: the box's own end padding, not
       the hit's, is what keeps the control off the segment's edge. */
    &:not(:last-child) {
      padding-inline-end: 0;
    }
  }
  .ff-tab :global(.ff-tab-icon) {
    inline-size: var(--icon);
    block-size: var(--icon);
    flex: 0 0 auto;
    stroke-width: 1.5;

    @media (prefers-reduced-motion: no-preference) {
      transition: stroke-width 80ms linear;
    }
  }
  .ff-tab.active :global(.ff-tab-icon) {
    stroke-width: 2;
  }

  /* Two labels in one cell: the hidden one is set at the strong weight
     and decides the width; the visible one animates its weight in place. */
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
  .sizer {
    visibility: hidden;
    font-variation-settings: "wght" var(--weight-strong);
  }
  /* The weight changes at once. Tweening it re-shaped the label's glyphs on
     every frame of the switch; the colour and the sheet carry the motion. */
  .text {
    font-variation-settings: "wght" var(--weight-body);
  }
  .ff-tab.selected .text {
    font-variation-settings: "wght" var(--weight-strong);
  }
</style>
