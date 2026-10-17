<script lang="ts">
  /**
   * Where the session's account reached its limit, and what the hub did: a
   * hairline across the column in the compaction divider's place, with one
   * line set in its middle (core `accountMoveWords`): the transfer glyph, the
   * account it went to (or waits for) as its colour dot, and the words. The
   * second line (whose limit it was and when that resets, why it waits, or
   * when the summary was written) sits under it at wide widths, and comes in
   * under the pointer or keyboard focus at narrow ones; the line is a button
   * that holds it open, for a finger, which has no hover.
   *
   * A wait counts down to its reset and, once that has passed, says the
   * session went on there; a move counts down to the old account's reset in
   * its second line, as a stop (Caw off) does to its own account's. The
   * clock ticks only while something on the row counts.
   *
   * A move that compacts once there says where that stands, the hub saying
   * the line again as it goes: "Moved to B, compacting next", "…
   * compacting", then "Moved to B, then compacted" (or "compaction
   * stopped"). The compaction itself is Claude Code's own, drawn by its own
   * divider after the turns it took.
   *
   * A `continued` line a hub stored before it compacted natively still
   * reads, the message that conversation opened on folded under it: the
   * chevron opens it, as a compaction's brief opens.
   */
  import { accountMoveWords } from "@cawco/core";
  import IconChevron from "~icons/solar/alt-arrow-right-bold-duotone";
  import IconTransfer from "~icons/solar/transfer-horizontal-bold-duotone";
  import { hueVar } from "../accounts/model.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { unfold } from "../motion/fold.svelte";
  import type { Row } from "./rows";

  let { row }: { row: Extract<Row, { kind: "account" }> } = $props();

  /** How often a counting row reads the clock: its words are in minutes. */
  const TICK_MS = 15_000;

  let now = $state(Date.now());
  /** Pressed open: the second line shows at any width, for a finger too, and the summary under it. */
  let open = $state(false);

  /** The moment the row stops counting: the reset it names; null when it names none. */
  const countsTo = $derived.by(() => {
    switch (row.move.kind) {
      case "waiting":
        return row.move.until;
      case "moved":
      case "stopped":
        return row.move.resetsAt;
      default:
        return null;
    }
  });

  $effect(() => {
    const until = countsTo;
    if (until === null || Date.now() >= until) {
      return;
    }
    const tick = setInterval(() => {
      now = Date.now();
      if (now >= until) {
        clearInterval(tick);
      }
    }, TICK_MS);
    return () => clearInterval(tick);
  });

  const words = $derived(accountMoveWords(row.move, now));
  /** The account the line is drawn in: where it went, the one it waits for, or the one it stayed on. */
  const hue = $derived.by(() => {
    switch (row.move.kind) {
      case "waiting":
      case "stopped":
      case "signed-out":
        return row.move.account.hue;
      case "unmoved":
        return (row.move.from ?? row.move.to)?.hue ?? null;
      // A stop names no account: drawn in the neutral ink, never a failure's.
      case "ended":
        return null;
      default:
        return row.move.to?.hue ?? null;
    }
  });
</script>

<div class="move" class:open>
  <!-- A button, so a keyboard and a finger can bring in the second line, as
       a pointer does by hovering. -->
  <button
    aria-expanded={open}
    class="line focus-inset touch-hit"
    onclick={() => {
      open = !open;
    }}
    type="button"
    style:--account={hue ? hueVar(hue) : "var(--ink-muted)"}
  >
    <span class="arm"></span>
    <span class="mid mark-line"
      ><span data-slot="mark" class="mark" data-box
        ><IconTransfer
          data-account-move-divider-glyph
          aria-hidden="true"
          class="glyph"
        />
        <span data-slot="dot" aria-hidden="true" class="dot"></span></span
      >
      <span data-slot="words" class="words">{words.line}</span>
      {#if row.brief !== null}
        <span data-slot="chev" class="chev" data-box
          ><IconChevron aria-hidden="true" /></span
        >
      {/if}</span
    >
    <span class="arm"></span>
  </button>
  <p data-slot="detail" class="detail"><span>{words.detail}</span></p>
  {#if open && row.brief !== null}
    <div class="brief" data-state="open" transition:unfold>
      <MessageBody source={row.brief} />
    </div>
  {/if}
</div>

<style>
  /* The container the wide rule is measured against: the transcript column. */
  .move {
    container-type: inline-size;
    margin-block: var(--space-3) var(--space-1);
  }
  .line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    min-block-size: var(--c-btn-h-sm);
    padding: 0;
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    cursor: pointer;
  }
  .arm {
    block-size: 1px;
    background: var(--border-control);
  }
  .mid {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    white-space: nowrap;
  }
  .mark {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .words {
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    font-variant-numeric: tabular-nums;
  }
  .mid :global(.glyph) {
    flex: none;
    inline-size: 14px;
    block-size: 14px;
  }
  .dot {
    flex: none;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 50%;
    background: var(--account);
  }
  /* The summary opens under the line: the chevron says so, turned down
     while it is open. */
  .chev {
    display: inline-flex;
    flex: none;

    & :global(svg) {
      inline-size: 12px;
      block-size: 12px;
    }
    .open & :global(svg) {
      rotate: 90deg;
    }
  }
  /* The second line: shut to nothing until it is shown, so a narrow
     column keeps one line per move. */
  .detail {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    text-align: center;
    font: var(--type-meta);
    color: var(--ink-subtle);

    & > span {
      overflow: hidden;
    }
  }
  .open .detail,
  .line:focus-visible + .detail {
    grid-template-rows: 1fr;
    opacity: 1;
  }
  @media (hover: hover) and (pointer: fine) {
    .move:hover .detail {
      grid-template-rows: 1fr;
      opacity: 1;
    }
  }
  @container (min-width: 640px) {
    .detail {
      grid-template-rows: 1fr;
      opacity: 1;
    }
  }
  /* The summary, at the text column, where a compaction's brief opens, in
     the muted ink of a note. */
  .brief {
    margin-inline-start: var(--x-text);
    padding-block-start: var(--space-1);

    & :global(.msg),
    & :global(.msg .prose),
    & :global(.msg .prose :is(h1, h2, h3, h4, h5, h6)) {
      color: var(--ink-muted);
    }
    & :global(.msg .prose) {
      --tw-prose-body: var(--ink-muted);
      --tw-prose-headings: var(--ink-muted);
      --tw-prose-bold: var(--ink-muted);
    }
  }
  @media (prefers-reduced-motion: no-preference) {
    .detail {
      transition:
        grid-template-rows var(--dur-toggle) var(--ease-out),
        opacity var(--dur-toggle) var(--ease-out);
    }
    .chev :global(svg) {
      transition: rotate var(--dur-toggle) var(--ease-in-out);
    }
  }
</style>
