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
   *
   * A run of account lines with no turn between them is one row (rows.ts
   * `accountRunAt`, core `accountRunWords`): it says where the session is
   * now, by its newest line, and names the move that cost most when an
   * earlier one did; its chevron opens every line under it, in order, in
   * each one's own words, as a brief opens. What the reader opened is kept
   * per session by the row (`disclosureAt`), so a row the list builds again
   * comes back open.
   */
  import {
    type AccountMove,
    accountMoveWords,
    accountRunWords,
  } from "@cawco/core";
  // The chevron in Solar's linear cut, a glyph and not a mark (DESIGN.md,
  // The Solar Duotone Rule).
  import { IconChevronRight as IconChevron, IconTransfer } from "#lib/icons.js";
  import { hueVar } from "../accounts/model.svelte";
  import MessageBody from "../MessageBody.svelte";
  import { unfold } from "../motion/fold.svelte";
  import { disclosureAt } from "./disclosure.svelte";
  import { moveOf, movesOf, type Row } from "./rows";

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

  /** What the newest line says now: the hub says it again in its place. */
  const move = $derived(moveOf(row));
  /** Every line of the run, oldest first, as each says it now. */
  const moves = $derived(movesOf(row));
  /** A run of lines folds them under it; one line folds its brief, when it has one. */
  const folds = $derived(row.brief !== null || moves.length > 1);

  /** How often a counting row reads the clock: its words are in minutes. */
  const TICK_MS = 15_000;

  let now = $state(Date.now());
  const disclosed = $derived(
    disclosureAt(row.messages[0]?.instanceId ?? "", row.key)
  );
  /** Pressed open: the second line shows at any width, for a finger too, and what folds under it. */
  const open = $derived(disclosed.get());

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

  const words = $derived(accountRunWords(moves, now));

  /** The account a line is drawn in: where it went, the one it waits for, or the one it stayed on. */
  function hueOf(one: AccountMove) {
    switch (one.kind) {
      case "waiting":
      case "stopped":
      case "signed-out":
        return one.account.hue;
      case "unmoved":
        return (one.from ?? one.to)?.hue ?? null;
      // A stop names no account: drawn in the neutral ink, never a failure's.
      case "ended":
        return null;
      case "continued":
      case "moved":
        break;
    }
    return one.to?.hue ?? null;
  }
  const hue = $derived(hueOf(move));

  /**
   * The reader opened it: the transcript lets go of the tail, so the row
   * they pressed holds its place and what folds under it opens downward
   * (Transcript's `onrevealstart`), as a compaction's brief does.
   */
  function opening(event: Event): void {
    event.currentTarget?.dispatchEvent(
      new CustomEvent("revealstart", { bubbles: true })
    );
  }
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
    data-account-run={moves.length > 1 ? moves.length : undefined}
    class="select-none peer/line flex items-center gap-space-3 w-full min-h-c-btn-h-sm p-0 border-none border-current rounded-xs bg-transparent type-meta text-ink-muted group-data-stopped/move:text-status-fail-ink focus-inset touch-hit"
    onclick={() => disclosed.set(!open)}
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
      {#if folds}
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
      onintrostart={opening}
      transition:unfold
    >
      <MessageBody source={row.brief} />
    </div>
  {:else if open && moves.length > 1}
    <!-- Every line of the run, in order, at the text column where a brief
         opens: each in its own words, its account's dot before it, its
         second line under it. -->
    <div
      data-slot="transcript-brief"
      class="ms-(--x-text) pt-space-1"
      data-state="open"
      onintrostart={opening}
      transition:unfold
    >
      <ol data-slot="account-run" class="grid gap-space-2">
        {#each moves as one, at (row.messages[at]?.id ?? at)}
          {@const said = accountMoveWords(one, now)}
          {@const tint = hueOf(one)}
          <li
            data-slot="account-run-line"
            class="type-meta"
            style:--account={tint ? hueVar(tint) : "var(--ink-muted)"}
          >
            <span
              data-slot="words"
              class="block text-ink-muted wrap-anywhere text-pretty num"
              ><span
                aria-hidden="true"
                class="inline-block size-space-2 me-space-2 align-middle rounded-pill bg-(--account)"
              ></span>{said.line}</span
            >
            <span
              data-slot="detail"
              class="block text-ink-subtle wrap-anywhere text-pretty"
              >{said.detail}</span
            >
          </li>
        {/each}
      </ol>
    </div>
  {/if}
</div>
