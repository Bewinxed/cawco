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
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
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
  <li
    data-slot="moved-row"
    class="flex items-center gap-space-2 w-full min-h-c-artifact-row-h px-space-2 py-0 rounded-sm text-ink-row text-start"
    data-moved-row={pin.number}
  >
    <PinDisc moved number={pin.number} resolved={!!pin.resolvedAt} />
    <span data-slot="words" class="flex flex-1 min-w-0 flex-col">
      <span data-slot="name" class="truncate text-ink-strong type-label"
        >{pinName(pin)}</span
      >
      <span class="truncate text-ink-muted text-size-meta"
        >{words.pinElementGone}</span
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
{/snippet}

{#snippet row(pin: Pin)}
  <li>
    <button
      data-slot="pin-row"
      aria-current={pin.id === focused || undefined}
      class="flex items-center gap-space-2 w-full min-h-c-artifact-row-h px-space-2 py-0 border-none border-current rounded-sm bg-transparent text-ink-row text-start transition-[background-color] dur-control ease-out cursor-pointer not-active:not-aria-current:hover:bg-surface-hover active:not-aria-current:bg-surface-fill aria-current:bg-selected-bg focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
      data-pin-row={pin.number}
      onclick={() => onopen(pin.id)}
      type="button"
    >
      <PinDisc number={pin.number} resolved={!!pin.resolvedAt} />
      <span data-slot="words" class="flex flex-1 min-w-0 flex-col">
        <span
          data-slot="name"
          class="truncate text-ink-strong type-label in-aria-current:text-selected-ink"
          >{pinName(pin)}</span
        >
        <span
          class="truncate text-ink-muted text-size-meta in-aria-current:text-selected-ink"
          >{lastLine(pin)}</span
        >
      </span>
      {#if live.has(pin.id)}
        <LiveDot label="The agent is working on it" />
      {/if}
    </button>
  </li>
{/snippet}

<section
  data-slot="pin-list"
  aria-label="Comments"
  class="flex flex-initial flex-col gap-space-1 min-h-0"
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
        <TabItem label={tab("Open", open.length)} value="open" />
        <TabItem label={tab("Resolved", resolved.length)} value="resolved" />
      </TabsList>
    </Tabs>
  </div>
  <div
    class="relative flex-auto min-h-0 overflow-y-auto overscroll-contain kit-edge-fade-block"
    style:--fault-indent="var(--space-2)"
    style:--fault-end="var(--space-2)"
  >
    {#if hold === "quiet"}
      <!-- Inside the wait's grace: its plain surface (The Real Wait Rule). -->
    {:else if hold === "reading"}
      <!-- The rows' own size while the pins are read; the read replaces them in one cross-fade. -->
      <div
        data-slot="pin-list-reading"
        aria-label={words.readingComments}
        role="status"
        out:crossOut
      >
        {#each [0, 1, 2] as skeleton (skeleton)}
          <span
            class="flex items-center gap-space-2 min-h-c-artifact-row-h px-space-2 py-0"
          >
            <Skeleton cell="pin" class="flex-none" radius="pill" />
            <span class="flex flex-1 min-w-0 flex-col gap-space-1">
              <Skeleton class="w-3/5" line="label" radius="text" />
              <Skeleton class="w-17/20" line="meta" radius="text" />
            </span>
          </span>
        {/each}
      </div>
    {:else if failed !== null}
      <RowFault
        data-pin-list-failed
        again={onretry}
        class="py-space-2"
        reason={words.commentsNotRead(failed)}
      />
    {:else}
      <div data-slot="pin-list-read" in:crossIn>
        {#if shown.length > 0}
          <ul>
            {#each shown as pin (pin.id)}
              {#if pin.movedAt}
                {@render movedRow(pin)}
              {:else}
                {@render row(pin)}
              {/if}
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
      </div>
    {/if}
  </div>
</section>
