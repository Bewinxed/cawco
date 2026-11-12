<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  import { waitingWords } from "@cawco/core/words/waiting";
  /**
   * What the session waits on the person for (WaitingList), opened from its
   * chip on the composer's tray row (WaitingChip). It comes out of the
   * composer, so it is a layer of the composer, the plan's family
   * (PlanPane): the kit's floating surface rising out of the tray row it
   * stands on, across the composer's width, over the transcript's foot, at
   * every width. Nothing it does moves the transcript, the composer or the
   * row (the composer's surface brief, The Composer Layer Rule). It holds
   * nothing (DESIGN.md, The Open Page Rule): a row's press opens what asks
   * it beside the conversation and the list stays, and it goes by its
   * Close, Esc or its chip.
   *
   * One column under its title that scrolls, as tall as what it holds up
   * to the room over the row (to the top of the composer's dock).
   */
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconClose } from "#lib/icons.js";
  import { popOut } from "../motion/pop.svelte";
  import RowFault from "../RowFault.svelte";
  import {
    holdComposerLayer,
    roomOver,
    shutOnEscape,
  } from "../transcript/composer-layer.svelte";
  import type { WaitingRow } from "./rows";
  import WaitingList from "./WaitingList.svelte";

  let {
    paneId,
    rows,
    failure = null,
    again,
    faultOf,
    onopen,
    onclose,
  }: {
    /** The conversation its pane shows: whose composer layer it holds. */
    paneId: string;
    rows: WaitingRow[];
    /** Why the last read of the list failed; it keeps the rows it had. */
    failure?: string | null;
    /** Reads the list again. */
    again?: () => void;
    /** Why a row's last open did not go. */
    faultOf?: (row: WaitingRow) => string | null;
    onopen: (row: WaitingRow) => void;
    onclose: () => void;
  } = $props();

  const titleId = $props.id();
  let section = $state<HTMLElement>();

  /** The room it may rise into: from the chip's row up to the top of the composer's dock. */
  const room = roomOver("--waiting-room");

  /** Shuts it, and the focus goes back to its chip. */
  function shut(): void {
    const chip = section?.parentElement?.querySelector<HTMLElement>(
      '[data-slot="waiting-chip"]'
    );
    onclose();
    chip?.focus();
  }

  // It holds the composer's layer while open: the plan or the tray's shelf opening over the same row takes it, and this shuts.
  holdComposerLayer(
    () => paneId,
    "waiting",
    () => onclose()
  );

  // Esc shuts it: from inside, the focus back on its chip; from the tray row or the composer under it, the focus staying where it was.
  shutOnEscape(() => section, { inside: shut, under: () => onclose() });
</script>

<section
  data-slot="waiting"
  aria-labelledby={titleId}
  class={floatingSurface({
    class:
      "absolute start-0 end-0 bottom-(--waiting-foot) z-1 flex flex-col max-h-(--waiting-room) p-0 overflow-clip origin-bottom-right rtl:origin-bottom-left pointer-events-auto",
  })}
  data-side="top"
  data-state="open"
  style:--waiting-foot="calc(100% + var(--spacing-space-2))"
  bind:this={section}
  {@attach room}
  out:popOut|global={{ side: "top" }}
>
  <!-- Close stands one step in from the card's top and trailing edges
       alike, the title on its centre line. -->
  <header class="flex flex-none items-center gap-space-2 p-space-2 ps-space-4">
    <h2
      class="m-0 min-w-0 flex-auto truncate text-size-label font-medium text-ink-strong"
      id={titleId}
    >
      {waitingWords.title}
    </h2>
    <BarGlass form="group">
      <BarItem icon={IconClose} label={commonWords.close} onclick={shut} />
    </BarGlass>
  </header>
  <div
    class="kit-edge-fade-block min-h-0 flex-auto overflow-y-auto overscroll-contain touch-pan-y px-space-1 pbe-space-2"
  >
    <WaitingList {faultOf} {onopen} {rows} />
    {#if failure}
      <RowFault {again} reason={waitingWords.readFailed(failure)} />
    {/if}
  </div>
</section>
