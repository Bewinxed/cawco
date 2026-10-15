<script lang="ts">
  /**
   * The artifact panel's pins (Projects spec §5.7; tsk-3; DESIGN.md Artifact
   * panel, canvas and ink), under its head: the list recipe's 44px rows, each
   * the pin's number on its coral disc, what it stands on in the label role
   * and its thread's last line in meta ink, with the live dot while the
   * agent works on it. Open and Resolved are a segmented filter; pins whose
   * element is gone stand in the moved tray at the end, each with Place
   * again, which pins it anew with the next tap on the page.
   */
  import type { Pin } from "@cawco/core/comments";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconMapPoint } from "#lib/icons.js";
  import PinDisc from "./PinDisc.svelte";
  import { pinName } from "./pin-name";

  let {
    pins,
    focused,
    live,
    placing,
    onopen,
    onplace,
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
      aria-current={pin.id === focused || undefined}
      class="pin-row"
      data-pin-row={pin.number}
      onclick={() => onopen(pin.id)}
      type="button"
    >
      <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
      <span class="words">
        <span class="name">{pinName(pin)}</span>
        <span class="last">{lastLine(pin)}</span>
      </span>
      {#if live.has(pin.id)}
        <span aria-label="The agent is working on it" class="live" role="img"
        ></span>
      {/if}
    </button>
  </li>
{/snippet}

{#if pins.length > 0}
  <section aria-label="Pins" class="pin-list">
    {#if placed.length > 0}
      <div class="filter">
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
      <ul class="rows">
        {#each shown as pin (pin.id)}
          {@render row(pin)}
        {/each}
      </ul>
    {/if}
    {#if moved.length > 0}
      <section aria-label="Moved" class="moved">
        <p class="moved-head"><IconMapPoint />Moved</p>
        <ul class="rows">
          {#each moved as pin (pin.id)}
            <li class="moved-row" data-moved-row={pin.number}>
              <PinDisc moved number={pin.number} />
              <span class="words">
                <span class="name">{pinName(pin)}</span>
                <span class="last">Its element is gone from the page</span>
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
  </section>
{/if}

<style>
  .pin-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 40%;
    flex-shrink: 0;
    margin-block-end: var(--space-2);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .filter {
    padding-block: var(--space-1);
  }
  .rows {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .pin-row,
  .moved-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--c-artifact-row-h);
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-row);
    text-align: start;
    font: inherit;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  .pin-row {
    cursor: pointer;
  }
  @media (hover: hover) {
    .pin-row:hover {
      background: var(--surface-hover);
    }
  }
  .pin-row:active,
  .pin-row[aria-current="true"] {
    background: var(--surface-fill);
  }
  .pin-row:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-inset);
  }
  .words {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }
  .name,
  .last {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name {
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .last {
    color: var(--ink-muted);
    font-size: var(--text-meta);
  }
  /* The activity dot's working form: 8px, info blue, on the one loop. */
  .live {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: var(--radius-pill);
    background: var(--status-live-glyph);
  }
  @media (prefers-reduced-motion: no-preference) {
    .live {
      animation: pin-live var(--dur-loop) var(--ease-in-out) infinite;
    }
  }
  @keyframes pin-live {
    50% {
      opacity: 0.4;
    }
  }
  .moved-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-1) var(--space-2);
    color: var(--ink-muted);
    font: var(--type-label);

    & :global(svg) {
      width: 16px;
      height: 16px;
    }
  }
</style>
