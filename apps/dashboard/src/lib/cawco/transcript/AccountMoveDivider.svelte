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
   * A `continued` line stands between a session's conversation and the
   * fresh one it went on in from a summary, when anything but the person's
   * own Continue asked for it (hub `foldContinued`): one session, the
   * message the fresh conversation opened on folded under the line, which
   * the chevron opens as a compaction's brief opens.
   */
  import { accountMoveWords } from "@cawco/core";
  // The chevron in Solar's linear cut, a glyph and not a mark (DESIGN.md,
  // The Solar Duotone Rule).
  import { IconChevronRight as IconChevron, IconTransfer } from "#lib/icons.js";
  import { hueVar } from "../accounts/model.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { moveOf, type Row } from "./rows";

  let {
    row,
    stop,
  }: {
    row: Extract<Row, { kind: "account" }>;
    /**
     * The session is stopped at its account's limit now and this is its
     * newest account line: the stop and its way out, as an error
     * (switch.svelte.ts `stopWords`). The line reads in the failure ink and
     * the sentence stands under it at every width; undefined, it is history.
     */
    stop?: string;
  } = $props();

  /** What the line says now: the hub says it again in its place. */
  const move = $derived(moveOf(row));

  /** How often a counting row reads the clock: its words are in minutes. */
  const TICK_MS = 15_000;

  let now = $state(Date.now());
  /** Pressed open: the second line shows at any width, for a finger too, and the summary under it. */
  let open = $state(false);

  /** The moment the row stops counting: the reset it names; null when it names none. */
  const countsTo = $derived.by(() => {
    switch (move.kind) {
      case "waiting":
        return move.until;
      case "moved":
      case "stopped":
        return move.resetsAt;
      case "continued":
      case "ended":
      case "signed-out":
      case "unmoved":
        break;
    }
    return null;
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

  const words = $derived(accountMoveWords(move, now));
  /** The account the line is drawn in: where it went, the one it waits for, or the one it stayed on. */
  const hue = $derived.by(() => {
    switch (move.kind) {
      case "waiting":
      case "stopped":
      case "signed-out":
        return move.account.hue;
      case "unmoved":
        return (move.from ?? move.to)?.hue ?? null;
      // A stop names no account: drawn in the neutral ink, never a failure's.
      case "ended":
        return null;
      case "continued":
      case "moved":
        break;
    }
    return move.to?.hue ?? null;
  });
</script>

<div
  data-open={open || undefined}
  data-stopped={stop ? true : undefined}
  class="group/move @container mt-space-3 mb-space-1"
>
  <!-- A button, so a keyboard and a finger can bring in the second line, as
       a pointer does by hovering. -->
  <button
    aria-expanded={open}
    class="select-none peer/line flex items-center gap-space-3 w-full min-h-c-btn-h-sm p-0 border-none border-current rounded-xs bg-transparent type-meta text-ink-muted group-data-stopped/move:text-status-fail-ink focus-inset touch-hit"
    onclick={() => {
      open = !open;
    }}
    type="button"
    style:--account={hue ? hueVar(hue) : "var(--ink-muted)"}
  >
    <span class="h-px flex-1 min-w-0 bg-border-control"></span>
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
        <span
          data-slot="dot"
          aria-hidden="true"
          class="flex-none size-space-2 rounded-pill bg-(--account)"
        ></span></span
      >
      <span data-slot="words" class="min-w-0 overflow-clip text-ellipsis num"
        >{words.line}</span
      >
      {#if row.brief !== null}
        <span data-slot="chev" class="inline-flex flex-none" data-box
          ><IconChevron
            aria-hidden="true"
            class="size-icon-sm group-data-open/move:rotate-90 motion-safe:transition-[rotate] motion-safe:duration-(--dur-toggle) motion-safe:ease-in-out"
          /></span
        >
      {/if}</span
    >
    <span class="h-px flex-1 min-w-0 bg-border-control"></span>
  </button>
  <p
    data-slot="detail"
    class="grid grid-rows-shut opacity-0 text-center type-meta text-ink-subtle group-data-open/move:grid-rows-open group-data-open/move:opacity-100 peer-focus-visible/line:grid-rows-open peer-focus-visible/line:opacity-100 group-hover/move:grid-rows-open group-hover/move:opacity-100 @phone:grid-rows-open @phone:opacity-100 motion-safe:transition-[grid-template-rows,opacity] motion-safe:duration-(--dur-toggle) motion-safe:ease-out"
  >
    <span class="fold-item">{words.detail}</span>
  </p>
  {#if stop}
    <!-- The stop is an error: what happened and the way out, at every
         width, never behind a hover. -->
    <p
      data-slot="stop"
      class="text-center type-meta text-status-fail-ink wrap-anywhere"
      role="alert"
    >
      {stop}
    </p>
  {/if}
  {#if open && row.brief !== null}
    <div
      data-slot="transcript-brief"
      class="ms-(--x-text) pt-space-1"
      data-state="open"
      transition:unfold
    >
      <MessageBody source={row.brief} />
    </div>
  {/if}
</div>
