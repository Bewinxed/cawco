<script lang="ts">
  /**
   * The project's views as the strip draws them (the project page's
   * `strip`): as many tabs as stand whole in the room the strip leaves
   * them, in their order, and the rest in a ⋯ menu after the last (the
   * owner's audit: a strip that scrolled cut "Table" to "Tab…" at 900px and
   * "Canvas" at 1100px). A tab is never cut and never scrolls away: the
   * chosen view always stands among the tabs, the views before it giving
   * way to the menu first only when it would not fit after them, and a view
   * picked from the menu takes its place there, the last tab before it
   * stepping into the menu. Where not even the chosen tab stands beside the
   * ⋯ (900px with the page's actions beside it, 60px of room), every view
   * goes into one menu, its trigger naming the view on screen as the
   * phone's bar names it (ViewBar), or, where that name has no room either,
   * the ⋯ alone, its name said to a screen reader.
   *
   * The room is the strip's own width less everything else it holds (the
   * hairline, the filter, Needs you, New task, Ask Caw: none of them sized
   * by the tabs), so it is known whatever the tabs show. Those actions are
   * the strip's toolbar items, bare symbols named in their tooltips
   * (DESIGN.md, Title bars follow Liquid Glass), so they leave the views the
   * room their glyphs and counts don't take. The ⋯ says what waits in the
   * views it holds: the sum of their counts (Decisions' pages waiting on
   * picks; JOURNEY.md, every view with something in it shows its count in
   * the first view), a Needs you count drawn as the attn badge (its Status
   * dot before the figure, no fill), and it is taken
   * at the width it will be drawn at, counted while a counted view is still
   * to go in it. Each tab's width is
   * read off a ruler, every view drawn as a tab out of sight (inert, hidden,
   * in a box of no size), so a view in the menu is measured as it would
   * stand. Both are read in the frame a size changes (frameObserver).
   * Until they are read (the server's paint) every tab stands, the strip's
   * list ending at the room it has.
   */
  import { viewsWords } from "@cawco/core";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconChevronDown, IconMore } from "#lib/icons.js";
  import type { BarView } from "./ViewBar.svelte";

  let {
    views,
    current,
    hrefOf,
    onchoose,
  }: {
    /** Every view, in the strip's order: Decisions with the pages waiting on picks, Caw's drafts marked. */
    views: BarView[];
    current: string;
    /** A view's own address: a tab is a link. */
    hrefOf: (view: string) => string;
    onchoose: (view: string) => void;
  } = $props();

  interface Measures {
    /** The list's own pad at its two ends, and the gap between two tabs. */
    gap: number;
    /** The ⋯'s width, and the gap before it: alone, and saying the views' whole count. */
    more: number;
    moreCounted: number;
    pad: number;
    /** The one menu's trigger, saying the chosen view. */
    picker: number;
    /** What the strip leaves its views. */
    room: number;
    /** Each view's tab width, by value. */
    widths: ReadonlyMap<string, number>;
  }

  let root = $state<HTMLElement | null>(null);
  let ruler = $state<HTMLElement | null>(null);
  let measures = $state.raw<Measures | null>(null);

  /** Half a pixel: a width as laid out, rounded. */
  const EDGE = 0.5;
  const px = (value: string) => Number.parseFloat(value) || 0;

  /** The room the strip leaves its views, the tabs' widths, the list's own. */
  function measure(): Measures | null {
    const strip = root?.parentElement;
    const list = ruler?.querySelector<HTMLElement>(
      '[data-slot="ff-tabs-list"]'
    );
    const dots = ruler?.querySelector<HTMLElement>("[data-ruler-more]");
    const counted = ruler?.querySelector<HTMLElement>(
      "[data-ruler-more-counted]"
    );
    const named = ruler?.querySelector<HTMLElement>("[data-ruler-picker]");
    if (!(root && strip && list && dots && named)) {
      return null;
    }
    const style = getComputedStyle(strip);
    const others = [...strip.children].filter(
      (child) => getComputedStyle(child).display !== "none"
    );
    const beside = others
      .filter((child) => child !== root)
      .reduce((sum, child) => sum + child.getBoundingClientRect().width, 0);
    const room =
      strip.clientWidth -
      px(style.paddingInlineStart) -
      px(style.paddingInlineEnd) -
      beside -
      px(style.columnGap) * Math.max(0, others.length - 1);
    const own = getComputedStyle(list);
    const tabs = list.querySelectorAll<HTMLElement>(
      ':scope > [data-slot="ff-tab"]'
    );
    const widths = new Map<string, number>();
    for (const [i, view] of views.entries()) {
      widths.set(view.value, tabs[i]?.getBoundingClientRect().width ?? 0);
    }
    const before = px(getComputedStyle(root).columnGap);
    const more = dots.getBoundingClientRect().width + before;
    return {
      room,
      widths,
      pad: px(own.paddingInlineStart) + px(own.paddingInlineEnd),
      gap: px(own.columnGap),
      more,
      moreCounted: counted
        ? counted.getBoundingClientRect().width + before
        : more,
      picker: named.getBoundingClientRect().width,
    };
  }

  // Read in the delivery (its layout is the one just done), written in the
  // next frame; the strip's children change as Needs you, the filter or
  // the hairline come and go, and each is observed as it comes.
  $effect(() => {
    const strip = root?.parentElement;
    const list = ruler;
    if (!(strip && list)) {
      return;
    }
    let read: Measures | null = null;
    const sized = frameObserver(
      () => {
        measures = read;
      },
      {
        read: () => {
          read = measure();
        },
      }
    );
    const watch = () => {
      sized.observe(strip);
      sized.observe(list);
      for (const child of strip.children) {
        sized.observe(child);
      }
      for (const tab of list.querySelectorAll(
        '[data-slot="ff-tab"], [data-ruler-picker], [data-ruler-more-counted]'
      )) {
        sized.observe(tab);
      }
    };
    watch();
    const children = new MutationObserver(() => {
      watch();
      sized.request();
    });
    children.observe(strip, { childList: true });
    children.observe(list, { childList: true, subtree: true });
    measures = measure();
    return () => {
      children.disconnect();
      sized.disconnect();
    };
  });

  /** How the views stand in some room: the tabs, and the one menu where not even the chosen tab has room. */
  interface Placed {
    kept: Set<string>;
    /**
     * Not even the chosen tab stands beside the ⋯: every view goes into one
     * menu, its trigger naming the view on screen (`named`), or, where the
     * name has no room either, the ⋯ alone (`dots`), its name said to a
     * screen reader.
     */
    menu: "named" | "dots" | null;
  }

  /** What a view holds that waits: Decisions' pages waiting on picks; a draft counts none. */
  const countOf = (view: BarView) => (view.draft ? 0 : view.count);
  /** The views' whole count, as the ⋯ would say it holding them all. */
  const total = $derived(views.reduce((sum, view) => sum + countOf(view), 0));

  /**
   * The views that stand as tabs: all of them where they fit; otherwise the
   * chosen one, then each before or after it in order while it fits beside
   * the ⋯, the first that does not ending the run. The ⋯ is taken at the
   * width it will be drawn at: counted while a view still to go in it has a
   * count, alone otherwise.
   */
  function place(m: Measures): Placed {
    const { widths, gap, pad, room, picker } = m;
    const width = (value: string) => widths.get(value) ?? 0;
    const whole =
      pad +
      views.reduce((sum, view) => sum + width(view.value), 0) +
      gap * Math.max(0, views.length - 1);
    if (whole <= room + EDGE) {
      return { kept: new Set(views.map((view) => view.value)), menu: null };
    }
    const chosen = views.find((view) => view.value === current);
    const others = views.filter((view) => view !== chosen);
    /** The ⋯ beside the tabs, holding `inside`. */
    const moreOf = (inside: BarView[]) =>
      inside.some((view) => countOf(view) > 0) ? m.moreCounted : m.more;
    const kept = new Set<string>();
    let left = room - pad + EDGE;
    if (chosen) {
      kept.add(chosen.value);
      left -= width(chosen.value);
    }
    if (left < moreOf(others)) {
      return { kept, menu: picker <= room + EDGE ? "named" : "dots" };
    }
    for (const [at, view] of others.entries()) {
      const takes = width(view.value) + gap;
      if (takes + moreOf(others.slice(at + 1)) > left) {
        break;
      }
      kept.add(view.value);
      left -= takes;
    }
    return { kept, menu: null };
  }

  const placed = $derived(measures ? place(measures) : null);
  const shown = $derived(
    placed?.kept ?? new Set(views.map((view) => view.value))
  );
  const tabs = $derived(views.filter((view) => shown.has(view.value)));
  const rest = $derived(views.filter((view) => !shown.has(view.value)));
  const menu = $derived(rest.length === 0 ? null : (placed?.menu ?? null));
  /** What waits in the views the ⋯ holds. */
  const held = $derived(rest.reduce((sum, view) => sum + countOf(view), 0));
  const moreName = $derived(
    held > 0 ? viewsWords.moreNeedsYou(held) : viewsWords.more
  );
  const currentLabel = $derived(
    views.find((view) => view.value === current)?.label ?? ""
  );
</script>

{#snippet viewMark(view: BarView)}
  {#if view.draft}
    <!-- The tag stands after the view's name, never over it. -->
    <Badge class="ms-space-1" variant="secondary"><span>draft</span></Badge>
  {:else if view.count > 0}
    <!-- The Decisions tab's trail: the pages still waiting for picks, as
         Needs you's number. -->
    <span data-slot="tab-num" class="ms-space-1 type-meta num text-ink-muted"
      >{view.count}</span
    >
  {/if}
{/snippet}

<div
  bind:this={root}
  data-slot="views"
  class="relative flex min-w-0 flex-initial items-center gap-space-1"
>
  {#if menu}
    <!-- Every view in one menu, its trigger saying the one on screen, or
         the ⋯ alone where its name has no room. -->
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          {#if menu === "named"}
            <Button
              {...props}
              aria-label={viewsWords.pick(currentLabel)}
              class="flex-none"
              data-views-picker
              size="sm"
              variant="ghost"
            >
              <span>{currentLabel}</span>
              <IconChevronDown />
            </Button>
          {:else}
            <Button
              {...props}
              aria-label={viewsWords.pick(currentLabel)}
              class="touch-hit flex-none"
              data-views-picker
              size="icon-sm"
              variant="ghost"
            >
              <IconMore />
            </Button>
          {/if}
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-auto">
        <DropdownMenu.RadioGroup onValueChange={onchoose} value={current}>
          {#each views as view (view.value)}
            <DropdownMenu.RadioItem value={view.value}>
              <span>{view.label}</span>
              {@render viewMark(view)}
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {:else}
    <!-- Until the room is read (the server's paint) the list ends at the
         room it has, never over what stands after it. -->
    <div class="min-w-0 overflow-x-clip">
      <Tabs onValueChange={onchoose} value={current}>
        <TabsList aria-label="Views">
          {#each tabs as view (view.value)}
            <TabItem
              href={hrefOf(view.value)}
              label={view.label}
              value={view.value}
            >
              {#snippet trail()}
                {@render viewMark(view)}
              {/snippet}
            </TabItem>
          {/each}
        </TabsList>
      </Tabs>
    </div>
  {/if}
  {#if rest.length > 0 && !menu}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Button
            {...props}
            aria-label={moreName}
            class="touch-hit flex-none"
            data-views-more
            size={held > 0 ? "sm" : "icon-sm"}
            title={moreName}
            variant="ghost"
          >
            <IconMore />
            {#if held > 0}
              <!-- The pages waiting on picks in the views it holds: a Needs
                   you count (JOURNEY.md), the attn badge's Status dot before
                   its figure. -->
              <Badge data-box data-slot="more-count" size="count" variant="attn"
                ><span>{held}</span></Badge
              >
            {/if}
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-auto">
        {#each rest as view (view.value)}
          <DropdownMenu.Item onSelect={() => onchoose(view.value)}>
            <span>{view.label}</span>
            {@render viewMark(view)}
          </DropdownMenu.Item>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
  <!-- The ruler: every view as a tab, out of sight, measured as it would
       stand; and the ⋯'s box. -->
  <div
    bind:this={ruler}
    aria-hidden="true"
    class="pointer-events-none invisible absolute start-0 top-0 size-0 overflow-hidden"
    data-views-ruler
    inert
  >
    <!-- At its words' width (`w-max`): in a box of no size its tabs would
         shrink to nothing. -->
    <Tabs class="w-max" value={current}>
      <TabsList>
        {#each views as view (view.value)}
          <TabItem label={view.label} value={view.value}>
            {#snippet trail()}
              {@render viewMark(view)}
            {/snippet}
          </TabItem>
        {/each}
      </TabsList>
    </Tabs>
    <span class="block size-c-btn-h-sm" data-ruler-more></span>
    {#if total > 0}
      <span class="inline-flex w-max" data-ruler-more-counted>
        <Button size="sm" variant="ghost">
          <IconMore />
          <Badge data-box size="count" variant="attn"
            ><span>{total}</span></Badge
          >
        </Button>
      </span>
    {/if}
    <span class="inline-flex w-max" data-ruler-picker>
      <Button size="sm" variant="ghost">
        <span>{currentLabel}</span>
        <IconChevronDown />
      </Button>
    </span>
  </div>
</div>
