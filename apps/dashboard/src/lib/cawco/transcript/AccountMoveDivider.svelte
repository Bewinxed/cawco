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

<div
  data-open={open || undefined}
  class="group/move @container mt-space-3 mb-space-1"
>
  <!-- A button, so a keyboard and a finger can bring in the second line, as
       a pointer does by hovering. -->
  <!-- literal: minmax(0, 1fr) auto minmax(0, 1fr) -->
  <button
    aria-expanded={open}
    class="peer/line grid grid-cols-(--cols) items-center gap-space-3 w-full min-h-c-btn-h-sm p-0 border-none border-current rounded-xs bg-transparent type-meta text-ink-muted cursor-pointer focus-inset touch-hit"
    onclick={() => {
      open = !open;
    }}
    type="button"
    style:--account={hue ? hueVar(hue) : "var(--ink-muted)"}
    style:--cols="minmax(0, 1fr) auto minmax(0, 1fr)"
  >
    <span class="h-px bg-border-control"></span>
    <span
      class="inline-flex items-center gap-space-2 min-w-0 whitespace-nowrap mark-line"
      ><span
        data-slot="mark"
        class="inline-flex items-center gap-space-2"
        data-box
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
      <span data-slot="words" class="min-w-0 overflow-clip text-ellipsis num"
        >{words.line}</span
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
    <span class="h-px bg-border-control"></span>
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

<style>
  /* residual: foreign-dom: MessageBody's message and its prose, which take
     no class; the summary reads in the muted ink of a note. */
  .brief {
    & :global([data-slot="msg"]),
    & :global([data-slot="msg"] .prose),
    & :global([data-slot="msg"] .prose :is(h1, h2, h3, h4, h5, h6)) {
      color: var(--ink-muted);
    }
    & :global([data-slot="msg"] .prose) {
      --tw-prose-body: var(--ink-muted);
      --tw-prose-headings: var(--ink-muted);
      --tw-prose-bold: var(--ink-muted);
    }
  }
</style>
