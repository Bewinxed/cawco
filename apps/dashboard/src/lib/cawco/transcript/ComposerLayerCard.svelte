<script lang="ts">
  import { commonWords } from "@cawco/core/words/common";
  /**
   * A card of the composer's layer: what a tray-row chip opens over the
   * row (the list of what waits on the person, WaitingCard; the plan,
   * plan-view/PlanLayer). It comes out of the composer, so it is the kit's
   * floating surface rising out of the tray row it stands on, across the
   * composer's width, over the transcript's foot, at every width. Nothing
   * it does moves the transcript, the composer or the row (the composer's
   * surface brief, The Composer Layer Rule). It holds the pane's layer
   * while open, so the card or the tray's shelf opening over the same row
   * shuts it; Esc, its Close or its chip shuts it, Close and Esc from
   * inside handing the focus back to the chip that opened it (`chip`, its
   * `data-slot`).
   *
   * Its head: the heading (`heading`) on Close's centre line, Close one
   * step in from the card's top and trailing edges. Under it one column
   * that scrolls once it is taller than the room over the row. `inset`:
   * `list`, a list whose rows carry their own inset (WaitingList); `lead`,
   * rows on the lead-row grid (ui/lead-row), their marks a step (space-3)
   * in from the card's edge and the heading on their words' edge, so the
   * card reads from one text edge with its marks hung before it.
   */
  import type { Snippet } from "svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";
  import { IconClose } from "#lib/icons.js";
  import { popOut } from "#lib/platform/motion/pop.svelte.js";
  import {
    holdComposerLayer,
    roomOver,
    shutOnEscape,
  } from "./composer-layer.svelte";

  let {
    paneId,
    name,
    chip,
    inset,
    onclose,
    heading,
    children,
  }: {
    /** The conversation its pane shows: whose composer layer it holds. */
    paneId: string;
    /** What it is, as its element's `data-slot` and its layer's owner name. */
    name: string;
    /** The `data-slot` of the chip that opens it, which takes the focus back. */
    chip: string;
    inset: "list" | "lead";
    onclose: () => void;
    /** Its heading's words, in the label role. */
    heading: Snippet;
    children: Snippet;
  } = $props();

  const titleId = $props.id();
  let section = $state<HTMLElement>();

  /** The room it may rise into: from the chip's row up to the top of the composer's dock. */
  const room = roomOver("--layer-room");

  /** Shuts it, and the focus goes back to its chip. */
  function shut(): void {
    const opener = section?.parentElement?.querySelector<HTMLElement>(
      `[data-slot="${chip}"]`
    );
    onclose();
    opener?.focus();
  }

  holdComposerLayer(
    () => paneId,
    name,
    () => onclose()
  );
  shutOnEscape(() => section, { inside: shut, under: () => onclose() });
</script>

<section
  data-slot={name}
  aria-labelledby={titleId}
  class={floatingSurface({
    class:
      "pointer-events-auto absolute start-0 end-0 bottom-(--layer-foot) z-1 flex max-h-(--layer-room) origin-bottom-right flex-col overflow-clip p-0 rtl:origin-bottom-left",
  })}
  data-side="top"
  data-state="open"
  style:--layer-foot="calc(100% + var(--spacing-space-2))"
  bind:this={section}
  {@attach room}
  out:popOut|global={{ side: "top" }}
>
  <header
    class={[
      "flex flex-none items-center gap-space-2 p-space-2",
      inset === "lead" ? "ps-space-3" : "ps-space-4",
    ]}
  >
    <h2
      class={[
        "m-0 min-w-0 flex-auto truncate text-size-label text-ink-strong",
        inset === "lead" && "ms-c-lead-text",
      ]}
      id={titleId}
    >
      {@render heading()}
    </h2>
    <BarGlass form="group">
      <BarItem icon={IconClose} label={commonWords.close} onclick={shut} />
    </BarGlass>
  </header>
  <div
    class={[
      "kit-edge-fade-block min-h-0 flex-auto touch-pan-y overflow-y-auto overscroll-contain pbe-space-2",
      inset === "lead" ? "px-space-3" : "px-space-1",
    ]}
  >
    {@render children()}
  </div>
</section>
