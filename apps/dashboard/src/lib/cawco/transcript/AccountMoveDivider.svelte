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
   * While the session's summary is being written for it to go on from
   * (`continuing`), the row is the compaction row at work: Caw working in its
   * middle beside "Summarising for …", no line yet. When its fresh
   * conversation starts, the same row settles into the "Continued on" line in
   * place — Caw leaves, the glyph and dot come in, the words morph, the line
   * draws out — and the message that conversation opened on (the summary,
   * the artifact index, the last turns) is folded under it: the chevron
   * opens it, as a compaction's brief opens.
   */
  import { accountMoveWords } from "@cawco/core";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { TextMorph } from "torph/svelte";
  import IconChevron from "~icons/solar/alt-arrow-right-bold-duotone";
  import IconTransfer from "~icons/solar/transfer-horizontal-bold-duotone";
  import { hueVar } from "../accounts/model.svelte";
  import Caw from "../home/Caw.svelte";
  import { dur, morphMs } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { COMPACTING_MARK } from "./compaction-mark";
  import MessageBody from "./MessageBody.svelte";
  import type { Row } from "./rows";

  let { row }: { row: Extract<Row, { kind: "account" }> } = $props();

  /** How often a counting row reads the clock: its words are in minutes. */
  const TICK_MS = 15_000;

  let now = $state(Date.now());
  /** Pressed open: the second line shows at any width, for a finger too, and the summary under it. */
  let open = $state(false);

  /**
   * This mount saw the summary being written: it settles here, Caw at work
   * is this mount's, and the words morph. A row mounted after that is
   * simply at rest.
   */
  const watched = untrack(() => row.move.kind === "continuing");
  const live = $derived(row.move.kind === "continuing");
  /** Caw at work is on the page: until his leave has played out. */
  let working = $state(watched);

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
        return row.move.account.hue;
      case "unmoved":
        return (row.move.from ?? row.move.to)?.hue ?? null;
      default:
        return row.move.to?.hue ?? null;
    }
  });

  /**
   * What the row says to a screen reader, as it changes: that the summary
   * is being written, then how it went. Written a frame after the region is
   * on the page, so its first words are an announcement.
   */
  let spoken = $state("");
  $effect(() => {
    if (!watched) {
      return;
    }
    const said = words.line;
    const frame = requestAnimationFrame(() => {
      spoken = said;
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<div class="move" class:live class:open class:settled={watched && !live}>
  <!-- A button, so a keyboard and a finger can bring in the second line, as
       a pointer does by hovering. -->
  <button
    aria-expanded={live ? undefined : open}
    class="line focus-inset touch-hit"
    disabled={live}
    onclick={() => {
      open = !open;
    }}
    type="button"
    style:--account={hue ? hueVar(hue) : "var(--ink-muted)"}
  >
    <span class="arm"></span>
    <span class="mid"
      >{#if working}
        <span class="caw"
          ><span class="stand"
            ><Caw
              ongone={() => {
                working = false;
              }}
              present={live}
              size={COMPACTING_MARK.size}
              status={COMPACTING_MARK.status}
            /></span
          ></span
        >
      {/if}
      {#if !live}
        <span
          class="mark"
          in:fade={{ duration: watched ? dur("--dur-fade") : 0 }}
          ><IconTransfer aria-hidden="true" class="glyph" />
          <span aria-hidden="true" class="dot"></span></span
        >
      {/if}
      <span class="words"
        >{#if watched}
          <TextMorph as="span" duration={morphMs()} text={words.line} />
        {:else}
          {words.line}
        {/if}</span
      >
      {#if row.brief !== null}
        <span class="chev"><IconChevron aria-hidden="true" /></span>
      {/if}</span
    >
    <span class="arm"></span>
  </button>
  <p class="detail"><span>{words.detail}</span></p>
  {#if open && row.brief !== null}
    <div class="brief" data-state="open" transition:unfold>
      <MessageBody source={row.brief} />
    </div>
  {/if}
</div>
{#if watched}
  <span class="sr-only" role="status">{spoken}</span>
{/if}

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

    &:disabled {
      cursor: default;
    }
  }
  .arm {
    block-size: 1px;
    background: var(--border-control);

    /* While the summary is written there is no line. */
    .live & {
      opacity: 0;
    }
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
  /* Caw at work's slot, the compaction row's while it compacts: as wide as
     he stands, taking no height, so the row never changes height. */
  .caw {
    position: relative;
    display: inline-block;
    flex: none;
    vertical-align: middle;
    inline-size: var(--tx-compacting-caw);
    block-size: var(--tx-compact-caw);
  }
  .stand {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    line-height: 0;
    translate: -50% -50%;
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
    /* The line draws out from the words as the row settles. */
    .settled .arm {
      animation: arm-draw var(--dur-pop) var(--ease-out) backwards;
    }
    .arm:first-child {
      transform-origin: right;
    }
    .arm:last-child {
      transform-origin: left;
    }
  }
  /* With less motion the line is not drawn: it fades in where it stands. */
  @media (prefers-reduced-motion: reduce) {
    .settled .arm {
      transition: opacity var(--dur-fade) var(--ease-out);
    }
  }
  @keyframes arm-draw {
    from {
      scale: 0 1;
    }
  }
</style>
