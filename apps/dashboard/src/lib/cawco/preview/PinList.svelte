<script lang="ts">
  /**
   * The preview's Comments panel (Projects spec §5.7; tsk-3; DESIGN.md
   * Artifact panel, canvas and ink), floating over the page's top-right
   * from the head's Comments, never a band that takes the page's height
   * (Figma keeps its list off the canvas until asked). Its head names it
   * beside Close; Open and Resolved are a segmented filter; under them the
   * rows scroll on their own. A row is the comment: the pin's disc, the
   * person's first words wrapping to four lines, the thread's last line in
   * meta ink, the live dot while the agent works on it; the whole row is
   * the press that opens its card. A pin whose element is gone stays under
   * its own tab, its disc recessed, and opens its card like any other: the
   * tabs count every pin the hub holds, each count drawn only above 0
   * (The Earned Count Rule). Until the
   * pane holds the doc nothing is counted or claimed empty (The Claim Of
   * Nothing Rule): the list is its plain surface inside `--dur-wait-grace`
   * (The Real Wait Rule), then skeleton rows at the rows' size, which the
   * first read replaces in one cross-fade; or the read's fault on its line,
   * with Try again (RowFault).
   */
  import { artifactWords as words } from "@cawco/core";
  import type { Pin } from "@cawco/core/comments";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
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

  let {
    pins,
    hold,
    focused,
    live,
    onopen,
    onretry,
    onclose,
    filter = $bindable("open"),
    scroll = $bindable(0),
  }: {
    pins: Pin[];
    /** Whether the pins are read yet (artifact-doc.ts `ListHold`). */
    hold: ListHold;
    /** The pin J and K stand on, whose row takes the selection pill. */
    focused: string | null;
    /** Pins the agent is working on now: each wears the live dot. */
    live: ReadonlySet<string>;
    onopen: (id: string) => void;
    /** Try again after the comments couldn't be read. */
    onretry: () => void;
    onclose: () => void;
    /** Its tab, kept by the pane while the panel stands aside. */
    filter?: "open" | "resolved";
    /** Its rows' scroll, px, kept by the pane while the panel stands aside. */
    scroll?: number;
  } = $props();

  /** A finger taps the page, a mouse clicks it: the empty line says which. */
  const coarse = new MediaQuery("(pointer: coarse)");

  /** The rows come back where they were read: the panel standing aside and back keeps its scroll. */
  const keepScroll = (read: HTMLElement) => {
    if (read.parentElement) {
      read.parentElement.scrollTop = untrack(() => scroll);
    }
  };
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

  /** The row's title: the person's first words; a pin said nothing in yet says so. */
  const title = (pin: Pin): string =>
    pin.thread[0]?.text ??
    (pin.kind === "annotation" ? "Annotation" : "Nothing written yet");
  /** The thread's last line once it runs past its first entry, which the title already shows. */
  const lastLine = (pin: Pin) => {
    const last = pin.thread.length > 1 ? pin.thread.at(-1) : undefined;
    return last
      ? {
          by: last.by === "agent" ? "Agent:" : "You:",
          text: last.text.split("\n")[0],
        }
      : null;
  };
</script>

{#snippet row(pin: Pin)}
  {@const last = lastLine(pin)}
  <li>
    <!-- The row is the comment and the press that opens its card: it holds no button. -->
    <button
      data-slot="pin-row"
      aria-current={pin.id === focused || undefined}
      data-moved={pin.movedAt ? "" : undefined}
      class="flex items-start gap-space-2 w-full min-h-c-artifact-row-h px-space-2 py-space-2 border-none border-current rounded-sm bg-transparent text-ink-row type-body text-start transition-[background-color] duration-(--dur-control) ease-out not-active:not-aria-current:hover:bg-surface-hover active:not-aria-current:bg-surface-pressed aria-current:bg-selected-bg focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-focus-ring focus-visible:outline-offset-(--focus-ring-inset)"
      data-pin-row={pin.number}
      onclick={() => onopen(pin.id)}
      type="button"
    >
      <span class="mark-cell">
        <PinDisc
          moved={!!pin.movedAt}
          number={pin.number}
          resolved={!!pin.resolvedAt}
        />
      </span>
      <span data-slot="words" class="flex flex-1 min-w-0 flex-col">
        <span
          data-slot="title"
          class="line-clamp-4 wrap-anywhere data-quiet:text-ink-muted not-data-quiet:text-ink-strong in-aria-current:text-selected-ink"
          data-quiet={pin.thread.length === 0 || undefined}>{title(pin)}</span
        >
        {#if last}
          <span
            data-slot="last"
            class="flex min-w-0 gap-space-1 text-ink-muted type-meta in-aria-current:text-selected-ink"
            ><span class="flex-none">{last.by}</span><span
              class="min-w-0 truncate">{last.text}</span
            ></span
          >
        {/if}
      </span>
      {#if live.has(pin.id)}
        <span class="mark-cell">
          <LiveDot label="The agent is working on it" />
        </span>
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
      value={filter}
    >
      <TabsList aria-label="Which pins">
        <TabItem label={tab("Open", open.length)} value="open" />
        <TabItem label={tab("Resolved", resolved.length)} value="resolved" />
      </TabsList>
    </Tabs>
  </div>
  <div
    data-slot="rows"
    class="relative flex-auto min-h-0 overflow-y-auto overscroll-contain kit-edge-fade-block"
    onscroll={(event) => {
      scroll = event.currentTarget.scrollTop;
    }}
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
            class="flex items-start gap-space-2 min-h-c-artifact-row-h px-space-2 py-space-2 type-body"
            data-slot="skeleton-row"
          >
            <span class="mark-cell">
              <Skeleton cell="pin" radius="pill" />
            </span>
            <Skeleton class="w-17/20" line="body" radius="text" />
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
      <div data-slot="pin-list-read" in:crossIn {@attach keepScroll}>
        {#if shown.length > 0}
          <ul>
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
            {coarse.current ? words.pinsNoneOpenTap : words.pinsNoneOpenClick}
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
