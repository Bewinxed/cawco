<!--
  Caw's column on his first thread (report part 5; rulings 7, 8 and S), S1
  or S2: no title bar (pin 16): two glass groups float over the thread,
  threads leading; Close, new thread, open as a session tab and More
  trailing; no prominent action: the composer's Send is the act, drawn as
  the session composer draws its own (`sendVariants`, disabled while the
  field is empty). The hero is the product's own: the kit's EmptyState on
  the axis with the title the live thread hero writes (ThreadPane: "What’s
  next for {projectName}?"), no line (the live hero has one only when Caw is
  off). The starters are the hub's for Cawco-Dev's board
  (data/starters.json), word for word, drawn by the house's one suggestions
  component (`cawco/suggestions/Suggestions.svelte`, pin 15's reusable
  component).

  The hero block is top-anchored where the thread's first row would start
  (DESIGN.md, Empty: "It sits on the column the content would have started
  on, with 21px of block padding"), Caw (pose 4) on the column's axis.

  - S1: the starters as a stack of sentences under his line (the
    component's `list` look in its `thread` place). Desk only: at 390 the
    stack does not fit the half-height sheet, so the phone draws S2's row.
  - S2: the starters as one row docked on the composer: the component's
    `row` look in its `composer` place (reasons left out), scrolling
    sideways under the house edge fade, each chip at most four fifths of the
    row so the next one peeks, its sentence wrapping inside it.

  A desk draws it as a column beside the page; a phone as a sheet at half
  height over the page.
-->
<script>
  import { PROJECT, STARTERS } from "./data.js";
  import {
    BarGlass,
    dockShellVariants,
    EmptyState,
    IconArrowUp,
    IconClose,
    IconListRows,
    IconMore,
    IconPlus,
    IconWindow,
    sendVariants,
    Suggestions,
  } from "./kit.js";

  let { option, phone = false } = $props();
  const pick = () => undefined;
</script>

<aside
  data-caw-column={option}
  aria-label="Caw"
  class={[
    "po-edge-host relative flex h-full min-h-0 flex-col bg-surface-raised",
    phone ? "rounded-t-lg shadow-drawer" : "border-s border-border-hairline",
  ]}
  style="--po-edge-ground: var(--surface-raised)"
>
  <div
    data-edge-scroller
    class="po-edge-scroller flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-y-contain px-space-5 pt-c-top-bar-h"
  >
    <div data-hero>
      <EmptyState actionWidth="fill" axis title="What’s next for {PROJECT.title}?">
        {#snippet mark()}
          {#if !phone}
            <span data-img="caw/hero-1.png" data-axis class="mb-space-3 block h-(--po-caw-hero) w-auto"></span>
          {/if}
        {/snippet}
        {#snippet action()}
          {#if option === "S1"}
            <div data-starters="stack" class="w-full">
              <Suggestions label="Things to ask Caw" look="list" onpick={pick} placement="thread" suggestions={STARTERS} />
            </div>
          {/if}
        {/snippet}
      </EmptyState>
    </div>
  </div>
  <span aria-hidden="true" class="po-edge po-edge-top" data-edge="bar"></span>

  <div class="relative flex flex-none flex-col gap-space-2 px-space-3 pt-space-2 pb-space-4">
    <span aria-hidden="true" class="po-edge po-edge-foot" data-edge="foot" style="--po-edge-h: 0px; inset-block-end: 100%"></span>
    {#if option === "S2"}
      <div data-starters="row">
        <Suggestions label="Things to ask Caw" look="row" onpick={pick} placement="composer" suggestions={STARTERS} />
      </div>
    {/if}
    <div class={dockShellVariants({ class: "flex items-center gap-space-2 p-c-composer-inset" })}>
      <span class="min-w-0 flex-auto px-space-2 type-body text-ink-subtle">Message Caw…</span>
      <button aria-label="Send" class={sendVariants({ class: "select-none touch-hit" })} data-send disabled type="button">
        <IconArrowUp aria-hidden="true" />
      </button>
    </div>
  </div>

  <div data-bar class="absolute inset-x-0 top-0 z-4 flex h-c-top-bar-h items-center justify-between ps-space-3 pe-[calc(var(--po-shell-room,0px)+var(--space-3))]">
    <BarGlass>
      {#snippet head()}
        <button data-bar-item aria-label="Threads" class="select-none touch-hit press-tint" type="button">
          <IconListRows data-slot="bar-symbol" aria-hidden="true" />
        </button>
      {/snippet}
    </BarGlass>
    <BarGlass>
      {#snippet head()}
        <button data-bar-item aria-label="Close" class="select-none touch-hit press-tint" type="button">
          <IconClose data-slot="bar-symbol" aria-hidden="true" />
        </button>
      {/snippet}
      <button data-bar-item aria-label="New thread" class="select-none touch-hit press-tint" type="button">
        <IconPlus data-slot="bar-symbol" aria-hidden="true" />
      </button>
      <button data-bar-item aria-label="Open as a session tab" class="select-none touch-hit press-tint" type="button">
        <IconWindow data-slot="bar-symbol" aria-hidden="true" />
      </button>
      <button data-bar-item aria-label="More" class="select-none touch-hit press-tint" type="button">
        <IconMore data-slot="bar-symbol" aria-hidden="true" />
      </button>
    </BarGlass>
  </div>
</aside>
