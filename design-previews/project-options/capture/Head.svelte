<!--
  The project's bar on a desk (report part 1; rulings 4, 14, H2′), H1 or
  H2′. One row, no ground: no fill, hairline or shadow of its own. Three
  groups on one grid: leading (the title and the place), centre (the view's
  mode) and trailing (what acts on the view, More, then Ask Caw, then the
  Shell's own group, a cut of the live capture the frame sets per width).
  The centre group stands on the surface's own axis (the grid's middle track
  between two equal tracks), never on what the other groups leave (ruling
  14); where it would collide it folds, never shifts.

  `fold` is which folds stand, in the bar's fold order (ruling 4; the frame
  picks the first set that fits at the bar's width):
  - `v`: the views' centre group becomes the Board ▾ pill, the hand beside it;
  - `n`: the place drops the machine's name, keeping its OS mark, "+50" and
    any stale mark (the name stays in its label and popover);
  - `a`: New task and Filter fold into More.
  Order A folds v, then n, then a; order B folds v, then a, then n.

  - H1: the views and the waiting hand in the centre.
  - H2′: the bar keeps the hand in its centre; the six views stand alone on
    a bare tab row under it, on the content's ground, with no fill and no
    actions (the review's H2 shelf, redrawn).

  `stale` is F2: the place carries the hollow ring (Activity dot:
  "Unreachable is a hollow ring") in `error-9` and "stale" in `error-11`, its
  popover open with the Fault in its popover size. `askcaw` is the slot the
  frame fills with the Ask Caw drawing for what is open (AskCaw.svelte).
-->
<script>
  import Fault from "./Fault.svelte";
  import { PROJECT, VIEWS } from "./data.js";
  import {
    BarGlass,
    IconChevronDown,
    IconFilter,
    IconMore,
    IconNeedsYou,
    IconPlus,
    OsMark,
  } from "./kit.js";

  let { option, fold = "", view = "Board", waiting = 0, stale = false, writes = true } = $props();
  const views = $derived(option === "H1" && fold.includes("v"));
  const named = $derived(!fold.includes("n"));
  const acts = $derived(!fold.includes("a"));
</script>

{#snippet place()}
  <span class="relative flex-none">
    <BarGlass>
      {#snippet head()}
        <button
          data-bar-item
          data-place
          aria-label="{PROJECT.machine} and {PROJECT.more} more places{stale ? ', stale' : ''}"
          aria-expanded={stale}
          class="gap-space-1 px-space-2 select-none touch-hit press-tint"
          type="button"
        >
          <OsMark class="size-icon-md text-ink-muted" os={PROJECT.os} />
          {#if named}<span data-machine-name class="type-label whitespace-nowrap text-ink-strong">{PROJECT.machine}</span>{/if}
          <span data-slot="num" class="num type-meta text-ink-muted">+{PROJECT.more}</span>
          {#if stale}
            <span data-stale-mark class="mark-line inline-flex items-center gap-space-1 type-meta text-error-11">
              <span aria-hidden="true" data-hollow-ring class="size-(--status-dot-size) rounded-pill border-2 border-error-9"></span>
              <span>stale</span>
            </span>
          {/if}
          <IconChevronDown aria-hidden="true" class="size-icon-sm text-ink-muted" />
        </button>
      {/snippet}
    </BarGlass>
    {#if stale}
      <div
        data-popover
        class="absolute inset-s-0 top-full z-3 mt-space-2 w-c-pop-w rounded-lg bg-surface-raised p-space-2 shadow-overlay"
      >
        <Fault size="popover" />
      </div>
    {/if}
  </span>
{/snippet}

{#snippet waits()}
  <BarGlass>
    {#snippet head()}
      <button
        data-bar-item
        data-waiting-toggle
        data-counted={waiting > 0 ? "" : undefined}
        aria-label={waiting > 0 ? `Waiting on you, ${waiting}` : "Nothing waits on you"}
        aria-pressed="false"
        class={["select-none touch-hit press-tint", waiting === 0 && "opacity-50"]}
        type="button"
      >
        <IconNeedsYou data-slot="bar-symbol" aria-hidden="true" />
        {#if waiting > 0}<span data-slot="num">{waiting}</span>{/if}
      </button>
    {/snippet}
  </BarGlass>
{/snippet}

<header data-head={option} data-fold={fold} class="flex flex-col">
  <div data-bar class="grid min-h-c-top-bar-h grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center">
    <span data-group="lead" class="flex min-w-0 items-center gap-space-2 ps-space-7">
      <h1 class="m-0 type-title whitespace-nowrap text-ink-strong">{PROJECT.title}</h1>
      {@render place()}
    </span>
    <span data-group="centre" class="flex items-center justify-center gap-space-2 px-space-2">
      {#if option === "H1"}
        <BarGlass>
          {#snippet head()}
            {#if views}
              <button
                data-bar-item
                aria-label="View: {view}"
                class="gap-space-1 px-space-2 select-none touch-hit press-tint"
                type="button"
              >
                <span class="type-label text-ink-strong">{view}</span>
                <IconChevronDown aria-hidden="true" class="size-icon-sm text-ink-muted" />
              </button>
            {/if}
          {/snippet}
          {#if !views}
            {#each VIEWS as one (one.name)}
              <button
                data-bar-item
                aria-pressed={one.name === view}
                class="gap-space-1 px-space-2 select-none touch-hit press-tint aria-pressed:bg-surface-pressed"
                type="button"
              >
                <span class="type-label whitespace-nowrap text-ink-strong">{one.name}</span>
                {#if one.count > 0}<span data-slot="num" class="type-meta text-ink-muted">{one.count}</span>{/if}
              </button>
            {/each}
          {/if}
        </BarGlass>
      {/if}
      {@render waits()}
    </span>
    <span data-group="trail" class="flex min-w-0 items-center justify-end gap-space-2 pe-space-6">
      <BarGlass>
        {#snippet head()}
          <button data-bar-item aria-label="More" class="select-none touch-hit press-tint" type="button">
            <IconMore data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/snippet}
        {#if acts}
          <button
            data-bar-item
            aria-label="New task"
            disabled={!writes}
            class="select-none touch-hit press-tint disabled:opacity-50"
            type="button"
          >
            <IconPlus data-slot="bar-symbol" aria-hidden="true" />
          </button>
          <button data-bar-item aria-label="Filter" class="select-none touch-hit press-tint" type="button">
            <IconFilter data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/if}
      </BarGlass>
      <span data-slot-part="askcaw" class="contents"></span>
      <span data-img="shell/desk-tools.png" data-shell-tools data-natural class="block flex-none"></span>
    </span>
  </div>
  {#if option === "H2"}
    <nav data-tab-row aria-label="Views" class="flex min-h-c-top-bar-h flex-wrap items-center gap-space-1 ps-space-7 pe-space-6">
      {#each VIEWS as one (one.name)}
        <button
          aria-pressed={one.name === view}
          class="flex h-c-btn-h-sm items-center gap-space-1 rounded-sm border-0 bg-transparent px-space-3 type-label whitespace-nowrap text-ink-muted select-none press-tint aria-pressed:bg-surface-lift aria-pressed:text-ink-strong aria-pressed:shadow-tile"
          type="button"
        >
          <span>{one.name}</span>
          {#if one.count > 0}<span data-slot="num" class="num type-meta text-ink-muted">{one.count}</span>{/if}
        </button>
      {/each}
    </nav>
  {/if}
</header>
