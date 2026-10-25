<!--
  The project's bar on a desk (report part 1), H1 or H2, at 1440 or his
  1037 window. No bar ground: the board runs up under it. Its groups are the
  top bar's glass (BarGlass, the real one), its items the glass's own
  `[data-bar-item]`; the Shell's own group (search, the 4, Caw) stays the
  Shell's at the far end, a cut of the live capture (`data-img`: the frame
  sets each picture in place, so the stage asks for no file).

  - H1: one row. Leading: the title and the place (the machine's OS mark,
    its name, "+50" for the other places). Centre: the views, folded to a
    "Board ▾" pill where the three groups don't fit (1037), and the waiting
    toggle. Trailing: New task, Filter, More, then Ask Caw, the one coral,
    Caw's face its glyph.
  - H2: the same project row with More and Ask Caw, over a shelf (the tab
    strip's own ground) holding the views, the waiting toggle, and New task
    and Filter in words.

  `stale` is F2: a Status dot and "stale" on the place, its popover open
  with the three slots (who, when, now). At his window H1's row has no room
  for the word beside the machine's name, so the name folds there (the OS
  mark and +50 stay; the name is the control's label).
-->
<script>
  import { PROJECT, VIEWS } from "./data.js";
  import {
    BarGlass,
    Button,
    IconChevronDown,
    IconFilter,
    IconMore,
    IconNeedsYou,
    IconPlus,
    OsMark,
  } from "./kit.js";
  import Slots from "./Slots.svelte";

  let { option, width, view = "Board", waiting = 0, stale = false, writes = true } = $props();
  const folded = $derived(option === "H1" && width === "1037");
  /** At his window H1's row has no room for "stale" beside the machine's name: the name folds into the popover's place (my call). */
  const short = $derived(folded && stale);
</script>

{#snippet place()}
  <span class="relative">
    <BarGlass>
      {#snippet head()}
        <button
          data-bar-item
          data-place
          aria-label="{PROJECT.machine} and {PROJECT.more} more places"
          aria-expanded={stale}
          class="gap-space-1 px-space-2 select-none touch-hit press-tint"
          type="button"
        >
          <OsMark class="size-icon-md text-ink-muted" os={PROJECT.os} />
          {#if !short}<span class="type-label whitespace-nowrap text-ink-strong">{PROJECT.machine}</span>{/if}
          <span data-slot="num" class="num type-meta text-ink-muted">+{PROJECT.more}</span>
          {#if stale}
            <span class="mark-line inline-flex items-center gap-space-1 type-meta text-status-fail-ink">
              <span aria-hidden="true" class="size-(--status-dot-size) rounded-pill bg-status-fail-glyph"></span>
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
        class="absolute inset-s-0 top-full z-3 mt-space-2 w-c-pop-w rounded-lg bg-surface-raised p-space-3 shadow-overlay"
      >
        <Slots stacked />
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

{#snippet askCaw()}
  <Button class="flex-none rounded-pill ps-space-2" data-ask-caw>
    <span data-img="caw/seat-idle-a.png" class="block size-icon-lg flex-none"></span>
    <span>Ask Caw</span>
  </Button>
{/snippet}

{#snippet more()}
  <button data-bar-item aria-label="More" class="select-none touch-hit press-tint" type="button">
    <IconMore data-slot="bar-symbol" aria-hidden="true" />
  </button>
{/snippet}

{#snippet shell()}
  <span data-img="shell/{width === '1037' ? 'window' : 'desk'}-tools.png" data-natural class="block flex-none"></span>
{/snippet}

<header data-head={option} data-width={width} class="flex flex-col">
  <div class="flex min-h-c-top-bar-h items-center gap-space-2 ps-space-7 pe-space-6">
    <h1 class="m-0 type-title whitespace-nowrap text-ink-strong">{PROJECT.title}</h1>
    {@render place()}
    {#if option === "H1"}
      <span class="flex flex-auto items-center justify-center gap-space-2">
        <BarGlass>
          {#snippet head()}
            {#if folded}
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
          {#if !folded}
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
        {@render waits()}
      </span>
      <BarGlass>
        {#snippet head()}{@render more()}{/snippet}
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
      </BarGlass>
      {@render askCaw()}
    {:else}
      <span class="flex-auto"></span>
      <BarGlass>
        {#snippet head()}{@render more()}{/snippet}
      </BarGlass>
      {@render askCaw()}
    {/if}
    {@render shell()}
  </div>
  {#if option === "H2"}
    <div data-shelf class="flex min-h-c-top-bar-h flex-wrap items-center gap-space-3 bg-surface-shelf ps-space-7 pe-space-6">
      <span class="flex items-center gap-space-1 rounded-sm bg-surface-recess-deep p-space-1">
        {#each VIEWS as one (one.name)}
          <button
            aria-pressed={one.name === view}
            class="flex h-c-btn-h-sm items-center gap-space-1 rounded-xs border-0 bg-transparent px-space-3 type-label whitespace-nowrap text-ink-strong select-none press-tint aria-pressed:bg-surface-lift aria-pressed:shadow-tile"
            type="button"
          >
            <span>{one.name}</span>
            {#if one.count > 0}<span data-slot="num" class="num type-meta text-ink-muted">{one.count}</span>{/if}
          </button>
        {/each}
      </span>
      {@render waits()}
      <span class="flex-auto"></span>
      <Button disabled={!writes} size="sm" variant="outline"><IconPlus aria-hidden="true" /><span>New task</span></Button>
      <Button size="sm" variant="outline"><IconFilter aria-hidden="true" /><span>Filter</span></Button>
    </div>
  {/if}
</header>
