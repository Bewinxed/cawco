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
   * its second line. The clock ticks only while something on the row counts.
   */
  import { accountMoveWords } from "@cawco/core";
  import IconTransfer from "~icons/solar/transfer-horizontal-bold-duotone";
  import { hueVar } from "../accounts/model.svelte";
  import type { Row } from "./rows";

  let { row }: { row: Extract<Row, { kind: "account" }> } = $props();

  /** How often a counting row reads the clock: its words are in minutes. */
  const TICK_MS = 15_000;

  let now = $state(Date.now());
  /** Pressed open: the second line shows at any width, for a finger too. */
  let open = $state(false);

  /** The moment the row stops counting: the reset it names; null when it names none. */
  const countsTo = $derived.by(() => {
    switch (row.move.kind) {
      case "waiting":
        return row.move.until;
      case "moved":
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
        return row.move.account.hue;
      case "unmoved":
        return row.move.from.hue;
      default:
        return row.move.to.hue;
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
    style:--account={hueVar(hue)}
  >
    <span class="arm"></span>
    <span class="mid"
      ><IconTransfer aria-hidden="true" class="glyph" />
      <span aria-hidden="true" class="dot"></span
      ><span class="words">{words.line}</span></span
    >
    <span class="arm"></span>
  </button>
  <p class="detail"><span>{words.detail}</span></p>
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
  .words {
    overflow: hidden;
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
  @media (prefers-reduced-motion: no-preference) {
    .detail {
      transition:
        grid-template-rows var(--dur-toggle) var(--ease-out),
        opacity var(--dur-toggle) var(--ease-out);
    }
  }
</style>
