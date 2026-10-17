<script lang="ts">
  /**
   * The preview's Comments panel (Projects spec §5.7; tsk-3; DESIGN.md
   * Artifact panel, canvas and ink), floating over the page's top-right
   * from the head's Comments, never a band that takes the page's height
   * (Magnific's floating panel; Figma keeps its list off the canvas until
   * asked). Its head names it beside Close; Open and Resolved are a
   * segmented filter; under them the list recipe's 44px rows scroll on
   * their own, each the pin's number on its coral disc, what it stands on in
   * the label role and its thread's last line in meta ink, with the live dot
   * while the agent works on it. Pins whose element is gone stand in the
   * moved tray at the end, each with Place again, which pins it anew with
   * the next tap on the page.
   */
  import type { Pin } from "@cawco/core/comments";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconClose, IconMapPoint } from "#lib/icons.js";
  import PinDisc from "./PinDisc.svelte";
  import { pinName } from "./pin-name";

  let {
    pins,
    focused,
    live,
    placing,
    onopen,
    onplace,
    onclose,
  }: {
    pins: Pin[];
    /** The pin J and K stand on, whose row takes the selection pill. */
    focused: string | null;
    /** Pins the agent is working on now: each wears the live dot. */
    live: ReadonlySet<string>;
    /** The moved pin a tap on the page is placing again. */
    placing: string | null;
    onopen: (id: string) => void;
    onplace: (id: string) => void;
    onclose: () => void;
  } = $props();

  let filter = $state<"open" | "resolved">("open");
  const placed = $derived(pins.filter((pin) => !pin.movedAt));
  const open = $derived(placed.filter((pin) => !pin.resolvedAt));
  const resolved = $derived(placed.filter((pin) => !!pin.resolvedAt));
  const moved = $derived(pins.filter((pin) => !!pin.movedAt));
  const shown = $derived(filter === "open" ? open : resolved);

  // The focused pin's own filter shows, so J and K never land on a hidden row.
  $effect(() => {
    const pin = pins.find((one) => one.id === focused);
    if (pin && !pin.movedAt) {
      filter = pin.resolvedAt ? "resolved" : "open";
    }
  });

  const lastLine = (pin: Pin): string => {
    const last = pin.thread.at(-1);
    if (!last) {
      return pin.kind === "annotation" ? "Annotation" : "Nothing written yet";
    }
    return `${last.by === "agent" ? "Agent" : "You"}: ${last.text.split("\n")[0]}`;
  };
</script>

{#snippet row(pin: Pin)}
  <li>
    <button
      data-slot="pin-row"
      aria-current={pin.id === focused || undefined}
      class="flex items-center gap-space-2 w-full min-h-c-artifact-row-h px-space-2 py-0 border-none border-current rounded-sm bg-transparent text-ink-row text-start transition-[background-color] dur-control ease-out cursor-pointer not-active:not-aria-current:hover:bg-surface-hover active:bg-surface-fill aria-current:bg-surface-fill focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
      data-pin-row={pin.number}
      onclick={() => onopen(pin.id)}
      type="button"
    >
      <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
      <span data-slot="words" class="flex flex-1 min-w-0 flex-col">
        <span data-slot="name" class="truncate text-ink-strong type-label"
          >{pinName(pin)}</span
        >
        <span class="truncate text-ink-muted text-size-meta"
          >{lastLine(pin)}</span
        >
      </span>
      {#if live.has(pin.id)}
        <span
          data-slot="live"
          aria-label="The agent is working on it"
          class="shrink-0 size-(--live-dot) rounded-pill bg-status-live-glyph"
          role="img"
        ></span>
      {/if}
    </button>
  </li>
{/snippet}

<!-- literal: 8px -->
<section
  data-slot="pin-list"
  aria-label="Comments"
  class="flex flex-initial flex-col gap-space-1 min-h-0"
  style:--live-dot="8px"
>
  <header
    data-slot="head"
    class="flex shrink-0 items-center justify-between gap-space-2 ps-space-2"
  >
    <h2 data-slot="title" class="m-0 text-ink-strong type-label">Comments</h2>
    <Button
      aria-label="Close comments"
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title="Close comments"
      variant="ghost"
    />
  </header>
  <div class="shrink-0 py-space-1 px-space-2">
    <Tabs
      onValueChange={(next) => {
        filter = next as "open" | "resolved";
      }}
      size="compact"
      value={filter}
    >
      <TabsList aria-label="Which pins">
        <TabItem label={`Open ${open.length}`} value="open" />
        <TabItem label={`Resolved ${resolved.length}`} value="resolved" />
      </TabsList>
    </Tabs>
  </div>
  <div
    class="kit-edge-fade-block flex-auto min-h-0 overflow-y-auto overscroll-contain"
  >
    {#if shown.length > 0}
      <ul class="m-0 p-0 list-none">
        {#each shown as pin (pin.id)}
          {@render row(pin)}
        {/each}
      </ul>
    {:else if filter === "open"}
      <p
        data-slot="pin-list-empty"
        class="flex flex-col gap-space-1 m-0 px-space-2 py-space-3 text-ink-muted text-size-meta"
      >
        <span class="text-ink-strong type-label">No open comments</span>
        Choose Comment, then click the page to pin one.
      </p>
    {:else}
      <p
        data-slot="pin-list-empty"
        class="flex flex-col gap-space-1 m-0 px-space-2 py-space-3 text-ink-muted text-size-meta"
      >
        <span class="text-ink-strong type-label">No resolved comments</span>
        A pin you resolve leaves the page and waits here.
      </p>
    {/if}
    {#if moved.length > 0}
      <section data-slot="moved" aria-label="Moved">
        <p
          class="mark-line flex items-center gap-space-1 m-0 px-space-2 py-space-1 text-ink-muted type-label"
        >
          <IconMapPoint class="size-icon-md" /><span>Moved</span>
        </p>
        <ul class="m-0 p-0 list-none">
          {#each moved as pin (pin.id)}
            <li
              data-slot="moved-row"
              class="flex items-center gap-space-2 w-full min-h-c-artifact-row-h px-space-2 py-0 border-none border-current rounded-sm bg-transparent text-ink-row text-start transition-[background-color] dur-control ease-out"
              data-moved-row={pin.number}
            >
              <PinDisc moved number={pin.number} />
              <span data-slot="words" class="flex flex-1 min-w-0 flex-col">
                <span
                  data-slot="name"
                  class="truncate text-ink-strong type-label"
                  >{pinName(pin)}</span
                >
                <span class="truncate text-ink-muted text-size-meta"
                  >Its element is gone from the page</span
                >
              </span>
              <Button
                aria-pressed={placing === pin.id}
                label="Place again"
                onclick={() => onplace(pin.id)}
                size="sm"
                variant="outline"
              />
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</section>

<style>
  /* residual: keyframes */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="live"] {
      animation: pin-live var(--dur-loop) var(--ease-in-out) infinite;
    }
  }
  @keyframes pin-live {
    50% {
      opacity: 0.4;
    }
  }
</style>
