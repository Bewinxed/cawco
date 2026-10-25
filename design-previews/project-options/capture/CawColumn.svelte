<!--
  Caw's column on his first thread (report part 5), S1 or S2: no title bar
  (pin 16): two glass groups float over the thread, threads leading; new
  thread, open as a session tab, More and Close trailing; no prominent
  action, the composer's Send is the act. The first thread's words are the
  copy review's Option 1. The starters' own look is the separate
  Suggestions component; here is only where they sit.

  - S1: the starters as a stack of three full-width lines under the hero.
  - S2: the starters as one row docked over the composer, scrolling sideways.

  A desk draws it as a column beside the page; a phone as a sheet at half
  height over the page. Caw (pose 4) stands on the column's axis.
-->
<script>
  import {
    BarGlass,
    chipVariants,
    dockShellVariants,
    IconArrowUp,
    IconClose,
    IconListRows,
    IconMore,
    IconPlus,
    IconWindow,
    sendVariants,
  } from "./kit.js";

  let { option, phone = false } = $props();
  const LINE = "Caw files what you ask as tasks and starts them. Permissions and merges wait for you.";
  const STARTERS = [
    "Start the three tasks in Ready",
    "List what's left before the site goes live",
    "Each Monday, tell me what landed",
  ];
</script>

<aside
  data-caw-column={option}
  aria-label="Caw"
  class={[
    "relative flex h-full min-h-0 flex-col bg-surface-raised",
    phone ? "rounded-t-lg shadow-drawer" : "border-s border-border-hairline",
  ]}
>
  <div class="absolute inset-x-0 top-0 z-3 flex h-c-top-bar-h items-center justify-between px-space-3">
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

  <div class="flex min-h-0 flex-auto flex-col overflow-y-auto overscroll-y-contain px-space-5 pt-c-top-bar-h">
    <div
      data-hero
      class={["flex flex-auto flex-col gap-space-4 py-space-5", phone && option === "S2" ? "justify-start" : "justify-center"]}
    >
      {#if !(phone && option === "S2")}
        <span data-img="caw/hero-a.png" data-axis class="block h-(--po-caw-hero) w-auto self-center"></span>
      {/if}
      <p class="m-0 type-body text-ink-strong">{LINE}</p>
      {#if option === "S1"}
        <ul data-starters="stack" class="m-0 flex list-none flex-col p-0">
          {#each STARTERS as starter (starter)}
            <li class="border-b border-border-hairline first:border-t">
              <button
                class="flex min-h-c-row-h w-full items-center border-0 bg-transparent px-0 py-space-2 text-start type-label text-ink-strong hover:bg-surface-hover press-tint"
                type="button">{starter}</button
              >
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>

  <div class="flex flex-none flex-col gap-space-2 px-space-3 pb-space-4">
    {#if option === "S2"}
      <div data-starters="row" class="kit-edge-fade flex gap-space-2 overflow-x-auto overscroll-x-contain py-space-1">
        {#each STARTERS as starter (starter)}
          <button class={chipVariants({ variant: "option", class: "flex-none whitespace-nowrap" })} type="button">{starter}</button>
        {/each}
      </div>
    {/if}
    <div class={dockShellVariants({ class: "flex items-center gap-space-2 p-c-composer-inset" })}>
      <span class="min-w-0 flex-auto px-space-2 type-body text-ink-subtle">Message Caw…</span>
      <button aria-label="Send" class={sendVariants({ class: "select-none touch-hit" })} disabled type="button">
        <IconArrowUp aria-hidden="true" />
      </button>
    </div>
  </div>
</aside>
