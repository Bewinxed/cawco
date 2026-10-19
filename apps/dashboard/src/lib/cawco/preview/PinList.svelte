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
   * while the agent works on it. A pin whose element is gone stays under
   * its own tab, its disc recessed and Place again in its row, which pins it
   * anew with the next tap on the page: the tabs count every pin the hub
   * holds, each count drawn only above 0 (The Earned Count Rule). Until the
   * pane holds the doc nothing is counted or claimed empty (The Claim Of
   * Nothing Rule): the list is its plain surface inside `--dur-wait-grace`
   * (The Real Wait Rule), then skeleton rows at the rows' size, which the
   * first read replaces in one cross-fade; or the read's fault on its line,
   * with Try again (RowFault).
   */
  import { artifactWords as words } from "@cawco/core";
  import type { Pin } from "@cawco/core/comments";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { IconClose } from "#lib/icons.js";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import type { ListHold } from "./artifact-doc";
  import LiveDot from "./LiveDot.svelte";
  import PinDisc from "./PinDisc.svelte";
  import { pinName } from "./pin-name";

  let {
    pins,
    hold,
    focused,
    live,
    placing,
    onopen,
    onplace,
    onretry,
    onclose,
  }: {
    pins: Pin[];
    /** Whether the pins are read yet (artifact-doc.ts `ListHold`). */
    hold: ListHold;
    /** The pin J and K stand on, whose row takes the selection pill. */
    focused: string | null;
    /** Pins the agent is working on now: each wears the live dot. */
    live: ReadonlySet<string>;
    /** The moved pin a tap on the page is placing again. */
    placing: string | null;
    onopen: (id: string) => void;
    onplace: (id: string) => void;
    /** Try again after the comments couldn't be read. */
    onretry: () => void;
    onclose: () => void;
  } = $props();

  let filter = $state<"open" | "resolved">("open");
  const open = $derived(pins.filter((pin) => !pin.resolvedAt));
  const resolved = $derived(pins.filter((pin) => !!pin.resolvedAt));
  const shown = $derived(filter === "open" ? open : resolved);
  const failed = $derived(typeof hold === "object" ? hold.failed : null);
  /** A tab's label: its count once the pins are read, and only above 0 (The Earned Count Rule). */
  const tab = (name: string, count: number) =>
    hold === "ready" && count > 0 ? `${name} ${count}` : name;

  // The focused pin's own filter shows, so J and K never land on a hidden row.
  $effect(() => {
    const pin = pins.find((one) => one.id === focused);
    if (pin) {
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

{#snippet movedRow(pin: Pin)}
  <!-- Its element is gone: no card to open on the page, Place again pins it anew. -->
  <li data-slot="moved-row" class="moved-row" data-moved-row={pin.number}>
    <PinDisc moved number={pin.number} resolved={!!pin.resolvedAt} />
    <span data-slot="words" class="words">
      <span data-slot="name" class="name">{pinName(pin)}</span>
      <span class="last">{words.pinElementGone}</span>
    </span>
    <Button
      aria-pressed={placing === pin.id}
      label="Place again"
      onclick={() => onplace(pin.id)}
      size="sm"
      variant="outline"
    />
  </li>
{/snippet}

{#snippet row(pin: Pin)}
  <li>
    <button
      data-slot="pin-row"
      aria-current={pin.id === focused || undefined}
      class="pin-row"
      data-pin-row={pin.number}
      onclick={() => onopen(pin.id)}
      type="button"
    >
      <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
      <span data-slot="words" class="words">
        <span data-slot="name" class="name">{pinName(pin)}</span>
        <span class="last">{lastLine(pin)}</span>
      </span>
      {#if live.has(pin.id)}
        <LiveDot label="The agent is working on it" />
      {/if}
    </button>
  </li>
{/snippet}

<section data-slot="pin-list" aria-label="Comments" class="pin-list">
  <header data-slot="head" class="head">
    <h2 data-slot="title" class="title">Comments</h2>
    <Button
      aria-label="Close comments"
      icon={IconClose}
      onclick={onclose}
      size="icon-sm"
      title="Close comments"
      variant="ghost"
    />
  </header>
  <div class="filter">
    <Tabs
      onValueChange={(next) => {
        filter = next as "open" | "resolved";
      }}
      size="compact"
      value={filter}
    >
      <TabsList aria-label="Which pins">
        <TabItem label={tab("Open", open.length)} value="open" />
        <TabItem label={tab("Resolved", resolved.length)} value="resolved" />
      </TabsList>
    </Tabs>
  </div>
  <div class="scroll kit-edge-fade-block">
    {#if hold === "quiet"}
      <!-- Inside the wait's grace: its plain surface (The Real Wait Rule). -->
    {:else if hold === "reading"}
      <!-- The rows' own size while the pins are read; the read replaces them in one cross-fade. -->
      <div
        data-slot="pin-list-reading"
        aria-label={words.readingComments}
        class="rows"
        role="status"
        out:crossOut
      >
        {#each [0, 1, 2] as skeleton (skeleton)}
          <span class="skeleton-row">
            <span class="kit-skeleton skeleton-disc"></span>
            <span class="words">
              <span class="kit-skeleton skeleton-name"></span>
              <span class="kit-skeleton skeleton-last"></span>
            </span>
          </span>
        {/each}
      </div>
    {:else if failed !== null}
      <RowFault
        data-pin-list-failed
        again={onretry}
        reason={words.commentsNotRead(failed)}
      />
    {:else}
      <div data-slot="pin-list-read" in:crossIn>
        {#if shown.length > 0}
          <ul class="rows">
            {#each shown as pin (pin.id)}
              {#if pin.movedAt}
                {@render movedRow(pin)}
              {:else}
                {@render row(pin)}
              {/if}
            {/each}
          </ul>
        {:else if filter === "open"}
          <p data-slot="pin-list-empty" class="empty">
            <span class="empty-title">No open comments</span>
            Choose Comment, then click the page to pin one.
          </p>
        {:else}
          <p data-slot="pin-list-empty" class="empty">
            <span class="empty-title">No resolved comments</span>
            A pin you resolve leaves the page and waits here.
          </p>
        {/if}
      </div>
    {/if}
  </div>
</section>

<style>
  /* A column the panel's height bounds: the head and the filter stand, the
     rows under them scroll on their own. */
  .pin-list {
    display: flex;
    flex: 0 1 auto;
    flex-direction: column;
    gap: var(--space-1);
    min-height: 0;
  }
  .head {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding-inline-start: var(--space-2);
  }
  .title {
    margin: 0;
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .filter {
    flex-shrink: 0;
    padding: var(--space-1) var(--space-2);
  }
  /* The offset parent a leaving skeleton is pinned in as the read fades in over it. */
  .scroll {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .empty {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: var(--space-3) var(--space-2);
    color: var(--ink-muted);
    font-size: var(--text-meta);
  }
  .empty-title {
    color: var(--ink-strong);
    font: var(--type-label);
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
  .pin-row:active {
    background: var(--surface-fill);
  }
  /* The pin on show takes the selected wash, apart from the hover step. */
  .pin-row[aria-current="true"] {
    background: var(--selected-bg);

    /* Its last line too: ink-muted measures 4.49:1 on the wash by day,
       selected-ink 4.73:1 (DESIGN.md Colors: Selected). */
    & :is(.name, .last) {
      color: var(--selected-ink);
    }
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
  /* A skeleton row at a pin row's size: the disc, the name's line in the
     label role's height and the last line's in meta's. */
  .skeleton-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--c-artifact-row-h);
    padding: 0 var(--space-2);
  }
  .skeleton-disc {
    flex-shrink: 0;
    width: var(--c-pin);
    height: var(--c-pin);
    border-radius: var(--radius-pill);
  }
  .skeleton-row .words {
    gap: var(--space-1);
  }
  .skeleton-name,
  .skeleton-last {
    display: block;
    border-radius: var(--radius-xs);
  }
  .skeleton-name {
    inline-size: 60%;
    block-size: var(--text-label);
  }
  .skeleton-last {
    inline-size: 85%;
    block-size: var(--text-meta);
  }
  /* The read's fault on the rows' line, from where a row's words start. */
  .scroll > :global([data-slot="row-fault"]) {
    --fault-indent: var(--space-2);
    --fault-end: var(--space-2);

    padding-block: var(--space-2);
  }
</style>
