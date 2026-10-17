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
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import IconChevron from "~icons/solar/alt-arrow-right-bold-duotone";
  import IconTransfer from "~icons/solar/transfer-horizontal-bold-duotone";
  import { hueVar } from "../accounts/model.svelte";
  import Caw from "../home/Caw.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { dur } from "../motion/curves.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { COMPACTING_MARK } from "./compaction-mark";
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

<div
  data-account-move-divider-live={live || undefined}
  data-live={live || undefined}
  data-open={open || undefined}
  data-settled={(watched && !live) || undefined}
  class="group/move @container mt-space-3 mb-space-1"
>
  <!-- A button, so a keyboard and a finger can bring in the second line, as
       a pointer does by hovering. -->
  <!-- literal: minmax(0, 1fr) auto minmax(0, 1fr) -->
  <button
    aria-expanded={live ? undefined : open}
    class="peer/line grid grid-cols-(--cols) items-center gap-space-3 w-full min-h-c-btn-h-sm p-0 border-0 rounded-xs bg-transparent type-meta text-ink-muted cursor-pointer disabled:cursor-default focus-inset touch-hit"
    disabled={live}
    onclick={() => {
      open = !open;
    }}
    type="button"
    style:--account={hue ? hueVar(hue) : "var(--ink-muted)"}
    style:--cols="minmax(0, 1fr) auto minmax(0, 1fr)"
  >
    <span
      class="arm h-px bg-border-control group-data-live/move:opacity-0 motion-safe:origin-right motion-reduce:group-data-settled/move:transition-[opacity] motion-reduce:group-data-settled/move:dur-fade motion-reduce:group-data-settled/move:ease-out"
    ></span>
    <span
      class="inline-flex items-center gap-space-2 min-w-0 whitespace-nowrap mark-line"
      >{#if working}
        <span
          class="relative inline-block flex-none align-middle w-(--tx-compacting-caw) h-(--tx-compact-caw)"
          data-box
          ><!-- literal: 0 --><span
            style:--stand-leading="0"
            class="absolute top-1/2 left-1/2 block leading-(--stand-leading) -translate-1/2"
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
          data-slot="mark"
          class="inline-flex items-center gap-space-2"
          data-box
          in:fade={{ duration: watched ? dur("--dur-fade") : 0 }}
          ><IconTransfer
            data-account-move-divider-glyph
            aria-hidden="true"
            class="flex-none size-space-4"
          />
          <!-- literal: 8px, 50% -->
          <span
            data-slot="dot"
            aria-hidden="true"
            style:--dot="8px"
            style:--dot-r="50%"
            class="flex-none size-(--dot) rounded-(--dot-r) bg-(--account)"
          ></span></span
        >
      {/if}
      <span data-slot="words" class="min-w-0 overflow-clip text-ellipsis num"
        >{#if watched}
          <MorphText text={words.line} />
        {:else}
          {words.line}
        {/if}</span
      >
      {#if row.brief !== null}
        <span data-slot="chev" class="inline-flex flex-none" data-box
          ><IconChevron
            aria-hidden="true"
            class="size-icon-sm group-data-open/move:rotate-90 motion-safe:transition-[rotate] motion-safe:dur-toggle motion-safe:ease-in-out"
          /></span
        >
      {/if}</span
    >
    <span
      class="arm h-px bg-border-control group-data-live/move:opacity-0 motion-safe:origin-left motion-reduce:group-data-settled/move:transition-[opacity] motion-reduce:group-data-settled/move:dur-fade motion-reduce:group-data-settled/move:ease-out"
    ></span>
  </button>
  <!-- literal: 0fr, 1fr -->
  <p
    data-slot="detail"
    style:--rows-shut="0fr"
    style:--rows-open="1fr"
    class="grid grid-rows-(--rows-shut) opacity-0 text-center type-meta text-ink-subtle group-data-open/move:grid-rows-(--rows-open) group-data-open/move:opacity-100 peer-focus-visible/line:grid-rows-(--rows-open) peer-focus-visible/line:opacity-100 group-hover/move:grid-rows-(--rows-open) group-hover/move:opacity-100 @phone:grid-rows-(--rows-open) @phone:opacity-100 motion-safe:transition-[grid-template-rows,opacity] motion-safe:dur-toggle motion-safe:ease-out"
  >
    <span class="overflow-hidden">{words.detail}</span>
  </p>
  {#if open && row.brief !== null}
    <div
      class="brief ms-(--x-text) pt-space-1"
      data-state="open"
      transition:unfold
    >
      <MessageBody source={row.brief} />
    </div>
  {/if}
</div>
{#if watched}
  <span class="sr-only" role="status">{spoken}</span>
{/if}

<style>
  /* residual: foreign-dom: MessageBody's message and its prose, which take
     no class; the summary reads in the muted ink of a note. */
  .brief {
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
  /* residual: keyframes: the line draws out from the words as the row settles. */
  @media (prefers-reduced-motion: no-preference) {
    [data-settled] .arm {
      animation: arm-draw var(--dur-pop) var(--ease-out) backwards;
    }
  }
  @keyframes arm-draw {
    from {
      scale: 0 1;
    }
  }
</style>
